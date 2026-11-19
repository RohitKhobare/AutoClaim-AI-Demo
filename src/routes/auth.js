'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireGuest } = require('../middleware/auth');
const { audit } = require('../services/claims');

const router = express.Router();

router.get('/login', requireGuest, (req, res) => {
  res.render('auth/login', { title: 'Sign in', next: req.query.next || '' });
});

router.post('/login', requireGuest, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      req.flash('error', 'Incorrect email or password.');
      return res.redirect('/login');
    }
    if (!user.is_active) {
      req.flash('error', 'This account has been deactivated. Please contact support.');
      return res.redirect('/login');
    }

    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.lang = user.language;
      db.run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});
      req.user = user;
      audit(req, 'auth.login', 'user', user.id);
      const target = req.body.next && req.body.next.startsWith('/') ? req.body.next : null;
      req.flash('success', `Welcome back, ${user.full_name.split(' ')[0]}.`);
      return res.redirect(target || (user.role === 'admin' ? '/admin' : '/app'));
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/register', requireGuest, (req, res) => {
  res.render('auth/register', { title: 'Create account' });
});

router.post('/register', requireGuest, async (req, res, next) => {
  try {
    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const city = String(req.body.city || '').trim();
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm_password || '');

    const fail = (msg) => {
      req.flash('error', msg);
      return res.redirect('/register');
    };

    if (fullName.length < 3) return fail('Please enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return fail('Please enter a valid email address.');
    if (!/^\d{10}$/.test(phone)) return fail('Please enter a valid 10-digit mobile number.');
    if (password.length < 8) return fail('Password must be at least 8 characters long.');
    if (password !== confirm) return fail('Passwords do not match.');

    const existing = await db.one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return fail('An account already exists with this email. Please sign in.');

    const hash = bcrypt.hashSync(password, 10);
    const id = await db.insert('users', {
      full_name: fullName, email, phone, city: city || null, state: 'Maharashtra',
      password_hash: hash, role: 'user', language: req.locale || 'en',
    });

    await db.insert('notifications', {
      user_id: id,
      title: 'Welcome to AutoClaim AI',
      body: 'Your account is ready. Add your vehicle and policy to start a claim, or use demo data from the seeded account.',
      link: '/app/vehicles',
      icon: 'shield',
    });

    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = id;
      req.session.lang = req.locale;
      req.flash('success', 'Account created. Add your vehicle to get started.');
      return res.redirect('/app');
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res) => {
  const name = req.user ? req.user.full_name.split(' ')[0] : null;
  req.session.destroy(() => {
    res.clearCookie('autoclaim.sid');
    req.flash('success', name ? `Signed out. See you soon, ${name}.` : 'Signed out.');
    res.redirect('/');
  });
});

module.exports = router;
