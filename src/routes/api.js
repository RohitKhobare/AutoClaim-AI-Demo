'use strict';
const express = require('express');
const db = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

router.get('/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.user),
    user: req.user ? { id: req.user.id, name: req.user.full_name, role: req.user.role } : null,
  });
});

router.get('/notifications/unread', requireLogin, async (req, res, next) => {
  try {
    const row = await db.one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ unread: row.c });
  } catch (err) {
    next(err);
  }
});

/** Admin helper: vehicles (with policy) for a selected customer. */
router.get('/customers/:id/vehicles', requireLogin, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && Number(req.params.id) !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const rows = await db.all(
      `SELECT v.id, v.registration_no, v.make, v.model, v.year,
              p.id AS policy_id, p.policy_number, p.policy_type, p.status AS policy_status, p.end_date, p.idv
         FROM vehicles v LEFT JOIN policies p ON p.vehicle_id = v.id
        WHERE v.user_id = ? ORDER BY v.id`,
      [req.params.id]
    );
    return res.json({ vehicles: rows });
  } catch (err) {
    return next(err);
  }
});

/** Public policy lookup used by the claim wizard. */
router.get('/policy/:reg', async (req, res, next) => {
  try {
    const reg = String(req.params.reg || '').toUpperCase();
    const row = await db.one(
      `SELECT v.registration_no, v.make, v.model,
              p.policy_number, p.policy_type, p.status, p.end_date, p.idv
         FROM vehicles v LEFT JOIN policies p ON p.vehicle_id = v.id
        WHERE v.registration_no = ? ORDER BY p.end_date DESC LIMIT 1`,
      [reg]
    );
    if (!row) return res.status(404).json({ found: false });
    return res.json({ found: true, vehicle: row });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
