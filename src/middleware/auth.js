'use strict';
const db = require('../db');

/** Load the signed-in user (if any) onto every request. */
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  if (!req.session || !req.session.userId) return next();
  try {
    const user = await db.one(
      'SELECT id, full_name, email, phone, role, city, state, language, theme, is_active, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!user || !user.is_active) {
      req.session.destroy(() => {});
      return next();
    }
    req.user = user;
    res.locals.currentUser = user;
    res.locals.unreadCount = (await db.one(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', [user.id]
    )).c;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  req.flash('error', 'Please sign in to continue.');
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (!req.user) {
    req.flash('error', 'Please sign in to continue.');
    return res.redirect('/login');
  }
  return res.status(403).render('errors/403');
}

function requireGuest(req, res, next) {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/app');
  return next();
}

/** Claims are visible to their owner or to any admin. */
async function loadOwnClaim(req, res, next) {
  const claim = await db.one('SELECT * FROM claims WHERE id = ?', [req.params.id]);
  if (!claim) return res.status(404).render('errors/404');
  req.claim = claim;
  if (claim.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).render('errors/403');
  }
  return next();
}

module.exports = { loadUser, requireAuth, requireAdmin, requireGuest, loadOwnClaim };
