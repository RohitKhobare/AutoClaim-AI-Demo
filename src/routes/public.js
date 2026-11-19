'use strict';
const express = require('express');
const db = require('../db');
const config = require('../config');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [stats, recent] = await Promise.all([
      db.one(`SELECT
                (SELECT COUNT(*) FROM claims) AS claims,
                (SELECT COUNT(*) FROM claims WHERE status = 'paid') AS settled,
                (SELECT COUNT(*) FROM policies WHERE status = 'active') AS policies,
                (SELECT COALESCE(SUM(approved_amount),0) FROM claims WHERE status IN ('approved','paid')) AS payout,
                (SELECT COALESCE(ROUND(AVG(processing_ms)/1000, 1), 3.2) FROM claims WHERE ai_status='completed') AS avg_seconds`),
      db.all(`SELECT c.claim_number, c.status, c.approved_amount, c.created_at, c.ai_confidence,
                     v.make, v.model
                FROM claims c JOIN vehicles v ON v.id = c.vehicle_id
               WHERE c.ai_status = 'completed'
               ORDER BY c.created_at DESC LIMIT 3`),
    ]);

    res.render('public/landing', {
      title: 'Smart insurance claim automation',
      stats,
      recent,
      page: 'home',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/about', (req, res) => {
  res.render('public/about', { title: 'About AutoClaim AI', page: 'about' });
});

router.get('/help', (req, res) => {
  res.render('public/help', { title: 'Help & support', page: 'help' });
});

router.get('/contact', (req, res) => {
  res.render('public/contact', { title: 'Contact us', page: 'contact', form: {}, errors: [] });
});

router.post('/contact', async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    const errors = [];
    if (!name || name.trim().length < 2) errors.push('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email || '')) errors.push('Please enter a valid email address.');
    if (!subject || subject.trim().length < 3) errors.push('Please enter a subject.');
    if (!message || message.trim().length < 15) errors.push('Please describe your query in at least 15 characters.');

    if (errors.length) {
      return res.status(422).render('public/contact', {
        title: 'Contact us', page: 'contact', form: req.body, errors,
      });
    }

    await db.insert('contact_messages', {
      name: name.trim(), email: email.trim(), phone: (phone || '').trim(),
      subject: subject.trim(), message: message.trim(),
    });

    req.flash('success', 'Thank you — your message has reached our team. We reply within one working day.');
    return res.redirect('/contact');
  } catch (err) {
    return next(err);
  }
});

/** Public policy status check (no personal data returned). */
router.get('/verify-policy', async (req, res, next) => {
  try {
    let result = null;
    const reg = (req.query.reg || '').trim().toUpperCase();
    if (reg) {
      const row = await db.one(
        `SELECT v.registration_no, v.make, v.model, v.year, p.policy_number, p.policy_type, p.insurer,
                p.start_date, p.end_date, p.status, p.sum_insured, p.idv
           FROM vehicles v LEFT JOIN policies p ON p.vehicle_id = v.id
          WHERE v.registration_no = ?
          ORDER BY p.end_date DESC LIMIT 1`,
        [reg]
      );
      result = row || { notFound: true, registration_no: reg };
    }
    res.render('public/verify-policy', {
      title: 'Check policy status', page: 'verify', result, reg,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/terms', (req, res) => {
  res.render('public/terms', { title: 'Terms & privacy', page: 'terms' });
});

router.get('/healthz', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', db: config.db.database, app: config.appName });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

module.exports = router;
