'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const h = require('../helpers');
const { claimUpload } = require('../upload');
const claimsService = require('../services/claims');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

/* ── Dashboard ────────────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const [claims, recent, queue, counts, thresholds] = await Promise.all([
      db.all(`SELECT id, claim_number, status, ai_status, ai_recommendation, fraud_score, risk_level,
                     approved_amount, processing_ms, created_at, decided_at FROM claims`),
      db.all(`SELECT c.*, v.make, v.model, v.registration_no, u.full_name AS customer_name
                FROM claims c JOIN vehicles v ON v.id = c.vehicle_id JOIN users u ON u.id = c.user_id
               ORDER BY c.created_at DESC LIMIT 6`),
      db.all(`SELECT c.*, v.make, v.model, v.registration_no, u.full_name AS customer_name
                FROM claims c JOIN vehicles v ON v.id = c.vehicle_id JOIN users u ON u.id = c.user_id
               WHERE c.status = 'manual_review' ORDER BY c.fraud_score DESC, c.created_at DESC LIMIT 5`),
      db.one(`SELECT
          (SELECT COUNT(*) FROM users WHERE role = 'user') AS customers,
          (SELECT COUNT(*) FROM vehicles) AS vehicles,
          (SELECT COUNT(*) FROM policies) AS policies,
          (SELECT COUNT(*) FROM policies WHERE status = 'active') AS active_policies,
          (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress')) AS open_tickets,
          (SELECT COUNT(*) FROM contact_messages WHERE status = 'new') AS new_messages`),
      claimsService.getSettings(),
    ]);

    const completed = claims.filter((c) => c.ai_status === 'completed');
    const total = claims.length;
    const settled = claims.filter((c) => c.status === 'paid');
    const approved = claims.filter((c) => c.status === 'approved');
    const autoApproved = completed.filter((c) => c.ai_recommendation === 'auto_approve');
    const fraudFlagged = completed.filter((c) => c.risk_level === 'high' || c.ai_recommendation === 'fraud_suspected');
    const avgMs = completed.length
      ? completed.reduce((s, c) => s + (c.processing_ms || 0), 0) / completed.length
      : 0;

    const metrics = {
      total,
      completed: completed.length,
      pendingReview: claims.filter((c) => ['submitted', 'ai_review', 'manual_review'].includes(c.status)).length,
      approved: claims.filter((c) => c.status === 'approved').length,
      rejected: claims.filter((c) => c.status === 'rejected').length,
      settled: settled.length,
      settledAmount: settled.reduce((s, c) => s + Number(c.approved_amount || 0), 0)
        + approved.reduce((s, c) => s + Number(c.approved_amount || 0), 0),
      fraudFlagged: fraudFlagged.length,
      stpRate: completed.length ? (autoApproved.length / completed.length) * 100 : 0,
      fraudCatchRate: completed.length ? (fraudFlagged.length / completed.length) * 100 : 0,
      avgSeconds: avgMs / 1000,
      autoApproved: autoApproved.length,
    };

    // last 8 weeks activity
    const weeks = [];
    for (let i = 7; i >= 0; i -= 1) {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const inWeek = claims.filter((c) => {
        const d = new Date(String(c.created_at).replace(' ', 'T'));
        return d >= start && d <= end;
      });
      weeks.push({
        label: start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        claims: inWeek.length,
        approved: inWeek.filter((c) => ['approved', 'paid'].includes(c.status)).length,
      });
    }

    const statusDist = ['submitted', 'ai_review', 'manual_review', 'approved', 'rejected', 'paid'].map((s) => ({
      status: s,
      label: h.statusMeta(s).label,
      count: claims.filter((c) => c.status === s).length,
      tone: h.statusMeta(s).tone,
    }));

    res.render('admin/dashboard', {
      title: 'Admin dashboard', page: 'dashboard', metrics, recent, queue, counts, weeks, thresholds,
      statusDist, maxWeek: Math.max(1, ...weeks.map((w) => Math.max(w.claims, w.approved))),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Claims queue ─────────────────────────────────────────────── */
router.get('/claims', async (req, res, next) => {
  try {
    const status = req.query.status || 'all';
    const q = (req.query.q || '').trim();
    const risk = req.query.risk || 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = 15;

    const where = [];
    const params = [];
    if (status !== 'all') {
      if (status === 'open') where.push("c.status IN ('submitted','ai_review','manual_review')");
      else { where.push('c.status = ?'); params.push(status); }
    }
    if (risk !== 'all') { where.push('c.risk_level = ?'); params.push(risk); }
    if (q) {
      where.push('(c.claim_number LIKE ? OR c.location LIKE ? OR v.registration_no LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, totalRow, counts] = await Promise.all([
      db.all(
        `SELECT c.*, v.make, v.model, v.registration_no, u.full_name AS customer_name, p.policy_number,
                (SELECT COUNT(*) FROM claim_images i WHERE i.claim_id = c.id) AS image_count
           FROM claims c JOIN vehicles v ON v.id = c.vehicle_id JOIN users u ON u.id = c.user_id
           JOIN policies p ON p.id = c.policy_id
           ${whereSql} ORDER BY c.created_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
        params
      ),
      db.one(
        `SELECT COUNT(*) AS c FROM claims c JOIN vehicles v ON v.id = c.vehicle_id JOIN users u ON u.id = c.user_id ${whereSql}`,
        params
      ),
      db.all('SELECT status, COUNT(*) AS c FROM claims GROUP BY status'),
    ]);

    res.render('admin/claims', {
      title: 'Claims', page: 'claims', claims: rows, status, q, risk,
      total: Number(totalRow.c), page, perPage,
      pages: Math.max(1, Math.ceil(Number(totalRow.c) / perPage)),
      counts: counts.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.c) }), {}),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Manual claim entry (admin) ───────────────────────────────── */
router.get('/claims/new', async (req, res, next) => {
  try {
    const [customers, vehicles] = await Promise.all([
      db.all("SELECT id, full_name, email FROM users WHERE role = 'user' ORDER BY full_name"),
      db.all(`SELECT v.id, v.registration_no, v.make, v.model, v.user_id, p.id AS policy_id, p.policy_number, p.status AS policy_status
                FROM vehicles v LEFT JOIN policies p ON p.id = (SELECT id FROM policies WHERE vehicle_id = v.id ORDER BY end_date DESC LIMIT 1)
               ORDER BY v.registration_no`),
    ]);
    res.render('admin/claim-new', {
      title: 'New claim (manual)', page: 'claims', customers, vehicles,
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/claims', claimUpload, async (req, res, next) => {
  try {
    const b = req.body;
    const vehicle = await db.one('SELECT * FROM vehicles WHERE id = ?', [b.vehicle_id]);
    if (!vehicle) {
      req.flash('error', 'Select a valid vehicle.');
      return res.redirect('/admin/claims/new');
    }
    const policy = b.policy_id
      ? await db.one('SELECT * FROM policies WHERE id = ?', [b.policy_id])
      : await db.one('SELECT * FROM policies WHERE vehicle_id = ? ORDER BY end_date DESC LIMIT 1', [vehicle.id]);
    if (!policy) {
      req.flash('error', 'That vehicle has no linked policy. Add a policy first.');
      return res.redirect('/admin/claims/new');
    }

    const claimNumber = await claimsService.nextClaimNumber();
    const files = req.files || {};
    const claimId = await db.insert('claims', {
      claim_number: claimNumber,
      user_id: vehicle.user_id,
      vehicle_id: vehicle.id,
      policy_id: policy.id,
      claim_type: b.claim_type || 'own_damage',
      incident_date: b.incident_date || new Date().toISOString().slice(0, 10),
      incident_time: b.incident_time || null,
      location: b.location || 'Not specified',
      description: b.description || 'Claim registered by the insurer on behalf of the customer.',
      fir_number: b.fir_number || null,
      reported_amount: Number(b.reported_amount) || 0,
      status: 'submitted',
      ai_status: 'pending',
      is_manual_entry: 1,
    });

    await claimsService.attachFiles(claimId, {
      images: files.images || [],
      documents: files.documents || [],
      imageAngles: [].concat(b.image_angle || []),
      docTypes: [].concat(b.doc_type || []),
    });
    await claimsService.audit(req, 'claim.created_manual', 'claim', claimId, { claim_number: claimNumber });

    if (b.run_ai === '1') {
      await claimsService.runAnalysis(claimId, { actor: req.user });
      req.flash('success', `Claim ${claimNumber} registered and analysed.`);
    } else {
      req.flash('success', `Claim ${claimNumber} registered.`);
    }
    return res.redirect(`/admin/claims/${claimId}`);
  } catch (err) {
    return next(err);
  }
});

/* ── Claim review ─────────────────────────────────────────────── */
router.get('/claims/:id', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim) return res.status(404).render('errors/404');

    const [documents, images, pay, clause, settings, clauses] = await Promise.all([
      claimsService.getClaimDocuments(claim.id),
      claimsService.getClaimImages(claim.id),
      db.one('SELECT * FROM payments WHERE claim_id = ? ORDER BY id DESC LIMIT 1', [claim.id]),
      claim.coverage_clause
        ? db.one('SELECT * FROM policy_clauses WHERE policy_id = ? AND clause_no = ?', [claim.policy_id, claim.coverage_clause])
        : null,
      claimsService.getSettings(),
      db.all('SELECT clause_no, title, category FROM policy_clauses WHERE policy_id = ? ORDER BY clause_no', [claim.policy_id]),
    ]);

    res.render('admin/claim-review', {
      title: `${claim.claim_number} · review`, page: 'claims', claim, documents, images, payment: pay,
      clause, settings, clauses,
      ocr: h.parseJSON(claim.ocr_fields, { fields: [], missing: [], mismatches: [] }),
      damages: h.parseJSON(claim.damage_summary, []),
      breakdown: h.parseJSON(claim.cost_breakdown, []),
      signals: h.parseJSON(claim.fraud_signals, []),
      record: h.parseJSON(claim.decision_record, {}),
      addons: h.parseJSON(claim.addons, []),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/claims/:id/analyze', async (req, res, next) => {
  try {
    const claim = await db.one('SELECT * FROM claims WHERE id = ?', [req.params.id]);
    if (!claim) return res.status(404).render('errors/404');
    await db.update('claims', { ai_status: 'processing', status: 'ai_review' }, 'id = ?', [claim.id]);
    await claimsService.runAnalysis(claim.id, { actor: req.user });
    await claimsService.audit(req, 'claim.ai_rerun', 'claim', claim.id);
    req.flash('success', 'AI verification completed.');
    return res.redirect(`/admin/claims/${claim.id}`);
  } catch (err) {
    await db.update('claims', { ai_status: 'failed' }, 'id = ?', [req.params.id]).catch(() => {});
    return next(err);
  }
});

router.post('/claims/:id/manual-assessment', async (req, res, next) => {
  try {
    const claim = await db.one('SELECT * FROM claims WHERE id = ?', [req.params.id]);
    if (!claim) return res.status(404).render('errors/404');
    const { severity, repair_cost, fraud_score, notes } = req.body;
    await db.update('claims', {
      severity: severity || claim.severity,
      repair_cost: repair_cost ? Number(repair_cost) : claim.repair_cost,
      fraud_score: fraud_score !== undefined && fraud_score !== '' ? Number(fraud_score) / 100 : claim.fraud_score,
      decision_record: {
        ...(h.parseJSON(claim.decision_record, {}) || {}),
        manual_assessment: {
          by: req.user.full_name,
          at: new Date().toISOString(),
          notes: notes || '',
        },
      },
    }, 'id = ?', [claim.id]);
    await claimsService.audit(req, 'claim.manual_assessment', 'claim', claim.id, { repair_cost, severity });
    req.flash('success', 'Manual assessment saved.');
    return res.redirect(`/admin/claims/${claim.id}`);
  } catch (err) {
    return next(err);
  }
});

router.post('/claims/:id/decision', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim) return res.status(404).render('errors/404');
    const { action, approved_amount, notes } = req.body;
    await claimsService.decideClaim({
      claimId: claim.id,
      adminId: req.user.id,
      action,
      approvedAmount: approved_amount,
      notes,
    });
    await claimsService.audit(req, `claim.${action === 'approve' ? 'approved' : 'rejected'}`, 'claim', claim.id, {
      amount: approved_amount, notes,
    });
    req.flash('success', `Claim ${claim.claim_number} ${action === 'approve' ? 'approved' : 'rejected'}.`);
    return res.redirect(`/admin/claims/${claim.id}`);
  } catch (err) {
    req.flash('error', err.message);
    return res.redirect(`/admin/claims/${req.params.id}`);
  }
});

router.post('/claims/:id/payout', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim) return res.status(404).render('errors/404');
    if (claim.status !== 'approved') {
      req.flash('error', 'Only approved claims can be marked as paid.');
      return res.redirect(`/admin/claims/${claim.id}`);
    }
    const reference = `NEFT${Date.now().toString().slice(-8)}`;
    await db.insert('payments', {
      claim_id: claim.id, user_id: claim.user_id, gateway: 'demo',
      order_id: reference, payment_id: reference, amount: claim.approved_amount,
      currency: 'INR', method: 'neft', status: 'paid', receipt: `rcpt_${claim.claim_number}`,
      paid_at: new Date(),
    });
    await db.update('claims', { status: 'paid' }, 'id = ?', [claim.id]);
    await claimsService.notify(claim.user_id, `Settlement paid — ${h.formatCurrency(claim.approved_amount)}`,
      `Claim ${claim.claim_number} settled by NEFT. Reference ${reference}.`, `/app/claims/${claim.id}`, 'wallet');
    await claimsService.audit(req, 'claim.payout_manual', 'claim', claim.id, { reference, amount: claim.approved_amount });
    req.flash('success', `Payout recorded with reference ${reference}.`);
    return res.redirect(`/admin/claims/${claim.id}`);
  } catch (err) {
    return next(err);
  }
});

/* ── Customers ────────────────────────────────────────────────── */
router.get('/customers', async (req, res, next) => {
  try {
    const customers = await db.all(
      `SELECT u.*,
              (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.id) AS vehicles,
              (SELECT COUNT(*) FROM policies p WHERE p.user_id = u.id AND p.status = 'active') AS active_policies,
              (SELECT COUNT(*) FROM claims c WHERE c.user_id = u.id) AS claims
         FROM users u WHERE u.role = 'user' ORDER BY u.created_at DESC`
    );
    res.render('admin/customers', { title: 'Customers', page: 'customers', customers });
  } catch (err) {
    next(err);
  }
});

router.post('/customers', async (req, res, next) => {
  try {
    const { full_name, email, phone, city } = req.body;
    if (!full_name || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email || '') || !/^\d{10}$/.test(phone || '')) {
      req.flash('error', 'Name, a valid email and a 10-digit phone number are required.');
      return res.redirect('/admin/customers');
    }
    const exists = await db.one('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) {
      req.flash('error', 'A user with that email already exists.');
      return res.redirect('/admin/customers');
    }
    const id = await db.insert('users', {
      full_name, email: email.toLowerCase(), phone, city: city || null,
      password_hash: bcrypt.hashSync(config.demoPassword, 10), role: 'user',
    });
    await claimsService.audit(req, 'customer.created', 'user', id, { email });
    req.flash('success', `Customer created. Temporary password: ${config.demoPassword}`);
    return res.redirect('/admin/customers');
  } catch (err) {
    return next(err);
  }
});

router.post('/customers/:id/toggle', async (req, res, next) => {
  try {
    const user = await db.one("SELECT * FROM users WHERE id = ? AND role = 'user'", [req.params.id]);
    if (!user) {
      req.flash('error', 'Customer not found.');
      return res.redirect('/admin/customers');
    }
    await db.update('users', { is_active: user.is_active ? 0 : 1 }, 'id = ?', [user.id]);
    await claimsService.audit(req, 'customer.toggled', 'user', user.id, { active: !user.is_active });
    req.flash('success', `Account ${user.is_active ? 'deactivated' : 'reactivated'}.`);
    return res.redirect('/admin/customers');
  } catch (err) {
    return next(err);
  }
});

router.get('/customers/:id', async (req, res, next) => {
  try {
    const customer = await db.one("SELECT * FROM users WHERE id = ? AND role = 'user'", [req.params.id]);
    if (!customer) return res.status(404).render('errors/404');
    const [vehicles, policies, claims] = await Promise.all([
      db.all('SELECT * FROM vehicles WHERE user_id = ?', [customer.id]),
      db.all(`SELECT p.*, v.registration_no, v.make, v.model FROM policies p JOIN vehicles v ON v.id = p.vehicle_id
               WHERE p.user_id = ? ORDER BY p.end_date DESC`, [customer.id]),
      db.all(`SELECT c.*, v.registration_no FROM claims c JOIN vehicles v ON v.id = c.vehicle_id
               WHERE c.user_id = ? ORDER BY c.created_at DESC`, [customer.id]),
    ]);
    return res.render('admin/customer-detail', {
      title: customer.full_name, page: 'customers', customer, vehicles, policies, claims,
    });
  } catch (err) {
    return next(err);
  }
});

/* ── Vehicles ─────────────────────────────────────────────────── */
router.get('/vehicles', async (req, res, next) => {
  try {
    const [vehicles, customers] = await Promise.all([
      db.all(`SELECT v.*, u.full_name AS owner, u.email,
                     p.policy_number, p.status AS policy_status, p.end_date,
                     (SELECT COUNT(*) FROM claims c WHERE c.vehicle_id = v.id) AS claims
                FROM vehicles v JOIN users u ON u.id = v.user_id
                LEFT JOIN policies p ON p.id = (SELECT id FROM policies WHERE vehicle_id = v.id ORDER BY end_date DESC LIMIT 1)
               ORDER BY v.id DESC`),
      db.all("SELECT id, full_name, email FROM users WHERE role = 'user' ORDER BY full_name"),
    ]);
    res.render('admin/vehicles', { title: 'Vehicles', page: 'vehicles', vehicles, customers });
  } catch (err) {
    next(err);
  }
});

router.post('/vehicles', async (req, res, next) => {
  try {
    const b = req.body;
    const reg = String(b.registration_no || '').toUpperCase().replace(/\s+/g, '');
    if (!b.user_id || !reg || !b.make || !b.model) {
      req.flash('error', 'Owner, registration number, make and model are required.');
      return res.redirect('/admin/vehicles');
    }
    if (await db.one('SELECT id FROM vehicles WHERE registration_no = ?', [reg])) {
      req.flash('error', 'That registration number already exists.');
      return res.redirect('/admin/vehicles');
    }
    const vehicleId = await db.insert('vehicles', {
      user_id: b.user_id, registration_no: reg, make: b.make, model: b.model,
      variant: b.variant || null, year: Number(b.year) || new Date().getFullYear(),
      fuel_type: b.fuel_type || 'petrol', colour: b.colour || null,
      chassis_no: b.chassis_no || null, engine_no: b.engine_no || null,
    });
    if (b.policy_number) {
      await db.insert('policies', {
        policy_number: b.policy_number.toUpperCase(), user_id: b.user_id, vehicle_id: vehicleId,
        insurer: b.insurer || config.company.insurer, policy_type: b.policy_type || 'comprehensive',
        start_date: b.start_date || new Date().toISOString().slice(0, 10),
        end_date: b.end_date || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        sum_insured: Number(b.sum_insured) || 500000, idv: Number(b.idv) || 450000,
        premium: Number(b.premium) || 12000, status: 'active',
      });
    }
    await claimsService.audit(req, 'vehicle.created', 'vehicle', vehicleId, { reg });
    req.flash('success', `Vehicle ${reg} added.`);
    return res.redirect('/admin/vehicles');
  } catch (err) {
    return next(err);
  }
});

/* ── Policies ─────────────────────────────────────────────────── */
router.get('/policies', async (req, res, next) => {
  try {
    const [policies, vehicles] = await Promise.all([
      db.all(`SELECT p.*, v.registration_no, v.make, v.model, u.full_name AS owner,
                     (SELECT COUNT(*) FROM claims c WHERE c.policy_id = p.id) AS claims
                FROM policies p JOIN vehicles v ON v.id = p.vehicle_id JOIN users u ON u.id = p.user_id
               ORDER BY p.end_date DESC`),
      db.all(`SELECT v.id, v.registration_no, v.make, v.model, v.user_id FROM vehicles v ORDER BY v.registration_no`),
    ]);
    res.render('admin/policies', { title: 'Policies', page: 'policies', policies, vehicles });
  } catch (err) {
    next(err);
  }
});

router.post('/policies', async (req, res, next) => {
  try {
    const b = req.body;
    const vehicle = await db.one('SELECT * FROM vehicles WHERE id = ?', [b.vehicle_id]);
    if (!vehicle || !b.policy_number) {
      req.flash('error', 'Select a vehicle and enter a policy number.');
      return res.redirect('/admin/policies');
    }
    if (await db.one('SELECT id FROM policies WHERE policy_number = ?', [b.policy_number.toUpperCase()])) {
      req.flash('error', 'That policy number already exists.');
      return res.redirect('/admin/policies');
    }
    const id = await db.insert('policies', {
      policy_number: b.policy_number.toUpperCase(), user_id: vehicle.user_id, vehicle_id: vehicle.id,
      insurer: b.insurer || config.company.insurer, policy_type: b.policy_type || 'comprehensive',
      start_date: b.start_date, end_date: b.end_date,
      sum_insured: Number(b.sum_insured) || 0, idv: Number(b.idv) || 0,
      premium: Number(b.premium) || 0, deductible: Number(b.deductible) || 1000,
      ncb_percent: Number(b.ncb_percent) || 0,
      status: b.status || 'active',
    });
    await claimsService.audit(req, 'policy.created', 'policy', id, { policy_number: b.policy_number });
    req.flash('success', 'Policy created. Add clause text from the policy detail page if you want RAG coverage checks to cite it.');
    return res.redirect('/admin/policies');
  } catch (err) {
    return next(err);
  }
});

router.post('/policies/:id/clauses', async (req, res, next) => {
  try {
    const policy = await db.one('SELECT * FROM policies WHERE id = ?', [req.params.id]);
    if (!policy) return res.status(404).render('errors/404');
    const { clause_no, title, body, category } = req.body;
    if (!clause_no || !title || !body) {
      req.flash('error', 'Clause number, title and text are required.');
      return res.redirect(`/admin/policies/${policy.id}`);
    }
    await db.insert('policy_clauses', {
      policy_id: policy.id, clause_no, title, body, category: category || 'coverage',
    });
    req.flash('success', `Clause ${clause_no} added to ${policy.policy_number}.`);
    return res.redirect(`/admin/policies/${policy.id}`);
  } catch (err) {
    return next(err);
  }
});

router.get('/policies/:id', async (req, res, next) => {
  try {
    const policy = await db.one(
      `SELECT p.*, v.registration_no, v.make, v.model, v.year, u.full_name AS owner, u.email
         FROM policies p JOIN vehicles v ON v.id = p.vehicle_id JOIN users u ON u.id = p.user_id
        WHERE p.id = ?`, [req.params.id]
    );
    if (!policy) return res.status(404).render('errors/404');
    const [clauses, claims] = await Promise.all([
      db.all('SELECT * FROM policy_clauses WHERE policy_id = ? ORDER BY clause_no', [policy.id]),
      db.all('SELECT * FROM claims WHERE policy_id = ? ORDER BY created_at DESC', [policy.id]),
    ]);
    return res.render('admin/policy-detail', {
      title: policy.policy_number, page: 'policies', policy, clauses, claims,
      addons: h.parseJSON(policy.addons, []),
    });
  } catch (err) {
    return next(err);
  }
});

/* ── Payments ─────────────────────────────────────────────────── */
router.get('/payments', async (req, res, next) => {
  try {
    const payments = await db.all(
      `SELECT pay.*, c.claim_number, u.full_name AS customer
         FROM payments pay JOIN claims c ON c.id = pay.claim_id JOIN users u ON u.id = pay.user_id
        ORDER BY pay.created_at DESC`
    );
    const totals = {
      paid: payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
      pending: payments.filter((p) => p.status === 'created').reduce((s, p) => s + Number(p.amount), 0),
      count: payments.length,
    };
    res.render('admin/payments', { title: 'Payments', page: 'payments', payments, totals });
  } catch (err) {
    next(err);
  }
});

/* ── Support tickets ──────────────────────────────────────────── */
router.get('/tickets', async (req, res, next) => {
  try {
    const tickets = await db.all(
      `SELECT t.*, u.full_name AS customer,
              (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS messages
         FROM support_tickets t JOIN users u ON u.id = t.user_id ORDER BY t.updated_at DESC`
    );
    res.render('admin/tickets', { title: 'Support tickets', page: 'tickets', tickets });
  } catch (err) {
    next(err);
  }
});

router.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await db.one(
      `SELECT t.*, u.full_name AS customer, u.email FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
      [req.params.id]
    );
    if (!ticket) return res.status(404).render('errors/404');
    const messages = await db.all('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id', [ticket.id]);
    return res.render('admin/ticket', { title: ticket.ticket_no, page: 'tickets', ticket, messages });
  } catch (err) {
    return next(err);
  }
});

router.post('/tickets/:id/reply', async (req, res, next) => {
  try {
    const ticket = await db.one('SELECT * FROM support_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).render('errors/404');
    if (!req.body.message) {
      req.flash('error', 'Write a reply before sending.');
      return res.redirect(`/admin/tickets/${ticket.id}`);
    }
    await db.insert('ticket_messages', {
      ticket_id: ticket.id, sender_role: 'admin', sender_name: req.user.full_name, message: req.body.message,
    });
    const status = req.body.status || 'in_progress';
    await db.run('UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?', [status, ticket.id]);
    await claimsService.notify(ticket.user_id, `Reply on ${ticket.ticket_no}`,
      req.body.message.slice(0, 140), `/app/support/${ticket.id}`, 'message');
    await claimsService.audit(req, 'ticket.replied', 'ticket', ticket.id, { status });
    req.flash('success', 'Reply sent to the customer.');
    return res.redirect(`/admin/tickets/${ticket.id}`);
  } catch (err) {
    return next(err);
  }
});

/* ── Contact enquiries ────────────────────────────────────────── */
router.get('/messages', async (req, res, next) => {
  try {
    const messages = await db.all('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.render('admin/messages', { title: 'Contact enquiries', page: 'messages', messages });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/:id/read', async (req, res, next) => {
  try {
    await db.run("UPDATE contact_messages SET status = 'read' WHERE id = ?", [req.params.id]);
    return res.redirect('/admin/messages');
  } catch (err) {
    return next(err);
  }
});

/* ── Dataset import (CSV) ─────────────────────────────────────── */
router.get('/import', (req, res) => {
  res.render('admin/import', { title: 'Import dataset', page: 'import', report: null });
});

router.post('/import', claimUpload, async (req, res, next) => {
  try {
    const file = (req.files && req.files.documents && req.files.documents[0]) || null;
    const raw = (req.body.csv || '').trim();
    let text = raw;
    if (file) {
      const fs = require('fs');
      text = fs.readFileSync(file.path, 'utf8');
    }
    if (!text) {
      req.flash('error', 'Paste CSV data or upload a .csv file.');
      return res.redirect('/admin/import');
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      req.flash('error', 'The CSV must contain a header row and at least one data row.');
      return res.redirect('/admin/import');
    }
    const headers = lines[0].split(',').map((s) => s.trim().toLowerCase());
    const required = ['customer_name', 'email', 'phone', 'reg_no', 'make', 'model', 'policy_number'];
    const missingHeaders = required.filter((x) => !headers.includes(x));
    if (missingHeaders.length) {
      req.flash('error', `Missing required column(s): ${missingHeaders.join(', ')}`);
      return res.redirect('/admin/import');
    }

    const report = { rows: 0, customers: 0, vehicles: 0, policies: 0, skipped: 0, errors: [] };
    for (let i = 1; i < lines.length; i += 1) {
      const cells = lines[i].split(',').map((s) => s.trim());
      const row = headers.reduce((acc, key, idx) => ({ ...acc, [key]: cells[idx] || '' }), {});
      report.rows += 1;
      try {
        if (!row.email || !row.reg_no || !row.policy_number) {
          report.skipped += 1;
          report.errors.push(`Row ${i + 1}: email, reg_no and policy_number are required`);
          continue;
        }
        let user = await db.one('SELECT * FROM users WHERE email = ?', [row.email.toLowerCase()]);
        if (!user) {
          const id = await db.insert('users', {
            full_name: row.customer_name || row.email.split('@')[0],
            email: row.email.toLowerCase(), phone: row.phone || '0000000000',
            city: row.city || null, state: row.state || 'Maharashtra',
            password_hash: bcrypt.hashSync(config.demoPassword, 10), role: 'user',
          });
          user = { id };
          report.customers += 1;
        }
        let vehicle = await db.one('SELECT * FROM vehicles WHERE registration_no = ?', [row.reg_no.toUpperCase()]);
        if (!vehicle) {
          const vid = await db.insert('vehicles', {
            user_id: user.id, registration_no: row.reg_no.toUpperCase(),
            make: row.make || 'Unknown', model: row.model || 'Unknown',
            variant: row.variant || null, year: Number(row.year) || 2020,
            fuel_type: (row.fuel || 'petrol').toLowerCase(), colour: row.colour || null,
          });
          vehicle = { id: vid };
          report.vehicles += 1;
        }
        const existingPolicy = await db.one('SELECT id FROM policies WHERE policy_number = ?', [row.policy_number.toUpperCase()]);
        if (!existingPolicy) {
          await db.insert('policies', {
            policy_number: row.policy_number.toUpperCase(), user_id: user.id, vehicle_id: vehicle.id,
            insurer: row.insurer || config.company.insurer,
            policy_type: (row.policy_type || 'comprehensive').toLowerCase(),
            start_date: row.start_date || new Date().toISOString().slice(0, 10),
            end_date: row.end_date || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
            sum_insured: Number(row.sum_insured) || 500000,
            idv: Number(row.idv) || 450000,
            premium: Number(row.premium) || 12000,
            status: (row.status || 'active').toLowerCase(),
          });
          report.policies += 1;
        }
      } catch (rowErr) {
        report.skipped += 1;
        report.errors.push(`Row ${i + 1}: ${rowErr.message}`);
      }
    }

    await claimsService.audit(req, 'dataset.imported', 'dataset', 'csv', report);
    req.flash('success', `Import complete — ${report.customers} customers, ${report.vehicles} vehicles, ${report.policies} policies added.`);
    return res.render('admin/import', { title: 'Import dataset', page: 'import', report });
  } catch (err) {
    return next(err);
  }
});

/* ── Audit log ────────────────────────────────────────────────── */
router.get('/audit', async (req, res, next) => {
  try {
    const logs = await db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 150');
    res.render('admin/audit', { title: 'Audit trail', page: 'audit', logs });
  } catch (err) {
    next(err);
  }
});

/* ── Settings ─────────────────────────────────────────────────── */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await claimsService.getSettings();
    res.render('admin/settings', { title: 'AI settings', page: 'settings', settings });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const allowed = ['auto_approve_confidence', 'max_fraud_score', 'max_image_ai_probability',
      'support_phone', 'support_email', 'claim_intimation_window_hours'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        await db.run(
          'INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [key, String(req.body[key])]
        );
      }
    }
    await claimsService.audit(req, 'settings.updated', 'settings', 'ai', req.body);
    req.flash('success', 'Settings saved. New thresholds apply to the next claim analysis.');
    return res.redirect('/admin/settings');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
