'use strict';
const express = require('express');
const db = require('../db');
const config = require('../config');
const h = require('../helpers');
const { claimUpload } = require('../upload');
const claimsService = require('../services/claims');
const payment = require('../services/payment');

const router = express.Router();

const VEHICLE_SELECT = `
  SELECT v.*, p.id AS policy_id, p.policy_number, p.policy_type, p.status AS policy_status,
         p.start_date, p.end_date, p.idv, p.sum_insured, p.insurer, p.deductible,
         (SELECT COUNT(*) FROM claims c WHERE c.vehicle_id = v.id) AS claims_count
    FROM vehicles v
    LEFT JOIN policies p ON p.id = (SELECT id FROM policies WHERE vehicle_id = v.id ORDER BY end_date DESC LIMIT 1)
   WHERE v.user_id = ?`;

/* ── Dashboard ────────────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [stats, vehicles, claims, notifications, policy] = await Promise.all([
      db.one(`SELECT
          (SELECT COUNT(*) FROM policies WHERE user_id = ? AND status = 'active') AS active_policies,
          (SELECT COUNT(*) FROM claims WHERE user_id = ?) AS total_claims,
          (SELECT COUNT(*) FROM claims WHERE user_id = ? AND status IN ('submitted','ai_review','manual_review')) AS open_claims,
          (SELECT COALESCE(SUM(approved_amount),0) FROM claims WHERE user_id = ? AND status = 'paid') AS settled_amount,
          (SELECT COALESCE(SUM(approved_amount),0) FROM claims WHERE user_id = ? AND status = 'approved') AS awaiting_amount,
          (SELECT COUNT(*) FROM vehicles WHERE user_id = ?) AS vehicles`, [userId, userId, userId, userId, userId, userId]),
      db.all(VEHICLE_SELECT, [userId]),
      db.all(`SELECT c.*, v.make, v.model, v.registration_no FROM claims c JOIN vehicles v ON v.id = c.vehicle_id
               WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 5`, [userId]),
      db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]),
      db.one(`SELECT p.*, v.make, v.model, v.registration_no, DATEDIFF(p.end_date, CURDATE()) AS days_left
                FROM policies p JOIN vehicles v ON v.id = p.vehicle_id
               WHERE p.user_id = ? AND p.status = 'active' ORDER BY p.end_date ASC LIMIT 1`, [userId]),
    ]);

    res.render('user/dashboard', {
      title: 'Dashboard', page: 'dashboard', stats, vehicles, claims, notifications, policy,
      firstVehicle: vehicles[0] || null,
    });
  } catch (err) {
    next(err);
  }
});

/* ── Vehicles ─────────────────────────────────────────────────── */
router.get('/vehicles', async (req, res, next) => {
  try {
    const vehicles = await db.all(`${VEHICLE_SELECT} ORDER BY v.id DESC`, [req.user.id]);
    res.render('user/vehicles', { title: 'My vehicles', page: 'vehicles', vehicles });
  } catch (err) {
    next(err);
  }
});

router.post('/vehicles', async (req, res, next) => {
  try {
    const b = req.body;
    const reg = String(b.registration_no || '').toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(reg)) {
      req.flash('error', 'Enter a valid registration number, for example MH12AB1234.');
      return res.redirect('/app/vehicles');
    }
    const exists = await db.one('SELECT id FROM vehicles WHERE registration_no = ?', [reg]);
    if (exists) {
      req.flash('error', 'That vehicle is already registered on the platform.');
      return res.redirect('/app/vehicles');
    }

    const vehicleId = await db.insert('vehicles', {
      user_id: req.user.id,
      registration_no: reg,
      make: b.make, model: b.model, variant: b.variant || null,
      year: Number(b.year) || new Date().getFullYear(),
      fuel_type: b.fuel_type || 'petrol',
      colour: b.colour || null,
      chassis_no: b.chassis_no || null,
      engine_no: b.engine_no || null,
      odometer_km: b.odometer_km ? Number(b.odometer_km) : null,
    });

    if (b.policy_number) {
      await db.insert('policies', {
        policy_number: String(b.policy_number).toUpperCase(),
        user_id: req.user.id,
        vehicle_id: vehicleId,
        insurer: b.insurer || config.company.insurer,
        policy_type: b.policy_type || 'comprehensive',
        start_date: b.start_date || new Date().toISOString().slice(0, 10),
        end_date: b.end_date || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        sum_insured: Number(b.sum_insured) || 500000,
        idv: Number(b.idv) || 450000,
        premium: Number(b.premium) || 12000,
        deductible: 1000,
        status: 'active',
      });
      await claimsService.audit(req, 'policy.created', 'policy', vehicleId, { policy_number: b.policy_number });
    }

    req.flash('success', `${b.make} ${b.model} (${reg}) added to your garage.`);
    return res.redirect('/app/vehicles');
  } catch (err) {
    return next(err);
  }
});

router.post('/vehicles/:id/delete', async (req, res, next) => {
  try {
    const vehicle = await db.one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!vehicle) {
      req.flash('error', 'Vehicle not found.');
      return res.redirect('/app/vehicles');
    }
    const used = await db.one('SELECT COUNT(*) AS c FROM claims WHERE vehicle_id = ?', [vehicle.id]);
    if (Number(used.c) > 0) {
      req.flash('error', 'This vehicle has claims linked to it and cannot be removed.');
      return res.redirect('/app/vehicles');
    }
    await db.run('DELETE FROM vehicles WHERE id = ?', [vehicle.id]);
    req.flash('success', 'Vehicle removed.');
    return res.redirect('/app/vehicles');
  } catch (err) {
    return next(err);
  }
});

/* ── Policies ─────────────────────────────────────────────────── */
router.get('/policies', async (req, res, next) => {
  try {
    const policies = await db.all(
      `SELECT p.*, v.make, v.model, v.registration_no, v.year,
              DATEDIFF(p.end_date, CURDATE()) AS days_left,
              (SELECT COUNT(*) FROM claims c WHERE c.policy_id = p.id) AS claims_count,
              (SELECT COALESCE(SUM(c.approved_amount),0) FROM claims c WHERE c.policy_id = p.id AND c.status='paid') AS settled
         FROM policies p JOIN vehicles v ON v.id = p.vehicle_id
        WHERE p.user_id = ? ORDER BY p.end_date DESC`,
      [req.user.id]
    );
    res.render('user/policies', { title: 'My policies', page: 'policies', policies });
  } catch (err) {
    next(err);
  }
});

router.get('/policies/:id', async (req, res, next) => {
  try {
    const policy = await db.one(
      `SELECT p.*, v.make, v.model, v.variant, v.registration_no, v.year, v.fuel_type,
              DATEDIFF(p.end_date, CURDATE()) AS days_left
         FROM policies p JOIN vehicles v ON v.id = p.vehicle_id
        WHERE p.id = ? AND p.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!policy) return res.status(404).render('errors/404');

    const [clauses, claims] = await Promise.all([
      db.all('SELECT * FROM policy_clauses WHERE policy_id = ? ORDER BY clause_no', [policy.id]),
      db.all('SELECT * FROM claims WHERE policy_id = ? ORDER BY created_at DESC', [policy.id]),
    ]);

    res.render('user/policy-detail', {
      title: policy.policy_number, page: 'policies', policy, clauses, claims,
      addons: h.parseJSON(policy.addons, []),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Claims ───────────────────────────────────────────────────── */
router.get('/claims', async (req, res, next) => {
  try {
    const status = req.query.status || 'all';
    const where = ['c.user_id = ?'];
    const params = [req.user.id];
    if (status !== 'all') {
      if (status === 'open') where.push("c.status IN ('submitted','ai_review','manual_review')");
      else {
        where.push('c.status = ?');
        params.push(status);
      }
    }
    const claims = await db.all(
      `SELECT c.*, v.make, v.model, v.registration_no, p.policy_number
         FROM claims c JOIN vehicles v ON v.id = c.vehicle_id JOIN policies p ON p.id = c.policy_id
        WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC`,
      params
    );
    const counts = await db.all(
      'SELECT status, COUNT(*) AS c FROM claims WHERE user_id = ? GROUP BY status', [req.user.id]
    );
    const total = counts.reduce((s, r) => s + Number(r.c), 0);
    res.render('user/claims', {
      title: 'My claims', page: 'claims', claims, status,
      counts: counts.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.c) }), { total }),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/claims/new', async (req, res, next) => {
  try {
    const vehicles = await db.all(`${VEHICLE_SELECT} ORDER BY v.id DESC`, [req.user.id]);
    res.render('user/claim-new', {
      title: 'File a new claim', page: 'claims', vehicles,
      preselected: req.query.vehicle || '',
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/claims', claimUpload, async (req, res, next) => {
  try {
    const b = req.body;
    const files = req.files || {};
    const images = files.images || [];
    const documents = files.documents || [];
    const docTypes = [].concat(b.doc_type || []);
    const angles = [].concat(b.image_angle || []);

    const vehicle = await db.one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', [b.vehicle_id, req.user.id]);
    if (!vehicle) {
      req.flash('error', 'Select one of your vehicles.');
      return res.redirect('/app/claims/new');
    }
    const policy = await db.one('SELECT * FROM policies WHERE id = ? AND vehicle_id = ?', [b.policy_id, vehicle.id]);
    if (!policy) {
      req.flash('error', 'No policy is linked to this vehicle. Please contact support.');
      return res.redirect('/app/claims/new');
    }
    if (!b.incident_date || !b.location || !b.description) {
      req.flash('error', 'Incident date, location and description are required.');
      return res.redirect('/app/claims/new');
    }
    if (images.length < 2) {
      req.flash('error', 'Upload at least two photographs of the damaged vehicle.');
      return res.redirect('/app/claims/new');
    }
    if (documents.length === 0) {
      req.flash('error', 'Upload the required documents (RC book, driving licence and claim form).');
      return res.redirect('/app/claims/new');
    }

    const claimNumber = await claimsService.nextClaimNumber();
    const claimId = await db.insert('claims', {
      claim_number: claimNumber,
      user_id: req.user.id,
      vehicle_id: vehicle.id,
      policy_id: policy.id,
      claim_type: b.claim_type || 'own_damage',
      incident_date: b.incident_date,
      incident_time: b.incident_time || null,
      location: b.location,
      description: b.description,
      fir_number: b.fir_number || null,
      reported_amount: Number(b.reported_amount) || 0,
      status: 'submitted',
      ai_status: 'pending',
    });

    await claimsService.attachFiles(claimId, { images, documents, imageAngles: angles, docTypes });
    await claimsService.audit(req, 'claim.created', 'claim', claimId, { claim_number: claimNumber });
    await claimsService.notify(req.user.id,
      `Claim ${claimNumber} submitted`,
      'Your documents are queued for automated verification. This usually takes a few seconds.',
      `/app/claims/${claimId}`, 'upload');

    req.flash('success', `Claim ${claimNumber} created. Running AI verification…`);
    return res.redirect(`/app/claims/${claimId}/analyze`);
  } catch (err) {
    return next(err);
  }
});

router.get('/claims/:id/analyze', async (req, res, next) => {
  try {
    const claim = await db.one('SELECT * FROM claims WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!claim) return res.status(404).render('errors/404');
    if (claim.ai_status === 'completed') return res.redirect(`/app/claims/${claim.id}`);

    const [images, documents] = await Promise.all([
      claimsService.getClaimImages(claim.id),
      claimsService.getClaimDocuments(claim.id),
    ]);
    return res.render('user/claim-analyze', {
      title: 'AI verification', page: 'claims', claim, images, documents,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/claims/:id/analyze', async (req, res, next) => {
  try {
    const claim = await db.one('SELECT * FROM claims WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!claim) return res.status(404).render('errors/404');
    if (claim.ai_status === 'completed') return res.redirect(`/app/claims/${claim.id}`);

    await db.update('claims', { ai_status: 'processing', status: 'ai_review' }, 'id = ?', [claim.id]);
    await claimsService.audit(req, 'claim.ai_started', 'claim', claim.id);
    const result = await claimsService.runAnalysis(claim.id, { actor: req.user });
    await claimsService.audit(req, 'claim.ai_completed', 'claim', claim.id, {
      recommendation: result.decision.recommendation, confidence: result.decision.confidence,
    });
    req.flash('success', 'AI verification completed. Your claim is now with an adjuster.');
    return res.redirect(`/app/claims/${claim.id}`);
  } catch (err) {
    await db.update('claims', { ai_status: 'failed' }, 'id = ?', [req.params.id]).catch(() => {});
    return next(err);
  }
});

router.get('/claims/:id', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim || (claim.user_id !== req.user.id && req.user.role !== 'admin')) {
      return res.status(404).render('errors/404');
    }
    const [documents, images, pay, clause] = await Promise.all([
      claimsService.getClaimDocuments(claim.id),
      claimsService.getClaimImages(claim.id),
      db.one('SELECT * FROM payments WHERE claim_id = ? ORDER BY id DESC LIMIT 1', [claim.id]),
      claim.coverage_clause
        ? db.one('SELECT * FROM policy_clauses WHERE policy_id = ? AND clause_no = ?', [claim.policy_id, claim.coverage_clause])
        : null,
    ]);

    const timeline = buildTimeline(claim, pay);

    res.render('user/claim-detail', {
      title: claim.claim_number, page: 'claims', claim, documents, images, payment: pay, clause, timeline,
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

router.post('/claims/:id/documents', claimUpload, async (req, res, next) => {
  try {
    const claim = await db.one('SELECT * FROM claims WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!claim) return res.status(404).render('errors/404');
    const files = req.files || {};
    await claimsService.attachFiles(claim.id, {
      images: files.images || [],
      documents: files.documents || [],
      imageAngles: [].concat(req.body.image_angle || []),
      docTypes: [].concat(req.body.doc_type || []),
    });
    await claimsService.notify(req.user.id, `Documents added to ${claim.claim_number}`,
      'Our adjuster will review the new documents.', `/app/claims/${claim.id}`, 'file');
    await claimsService.audit(req, 'claim.documents_added', 'claim', claim.id);
    req.flash('success', 'Documents uploaded to your claim.');
    return res.redirect(`/app/claims/${claim.id}`);
  } catch (err) {
    return next(err);
  }
});

/* ── Settlement payout (Razorpay / demo) ──────────────────────── */
router.get('/claims/:id/pay', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim || claim.user_id !== req.user.id) return res.status(404).render('errors/404');
    if (claim.status !== 'approved' || !claim.approved_amount) {
      req.flash('error', 'This claim is not ready for settlement yet.');
      return res.redirect(`/app/claims/${claim.id}`);
    }
    const pay = await db.one('SELECT * FROM payments WHERE claim_id = ? ORDER BY id DESC LIMIT 1', [claim.id]);
    if (pay && pay.status === 'created') return renderCheckout(res, claim, pay);

    return res.render('user/pay', { title: 'Settlement payout', page: 'claims', claim, demo: payment.isDemo() });
  } catch (err) {
    return next(err);
  }
});

router.post('/claims/:id/pay', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim || claim.user_id !== req.user.id) return res.status(404).render('errors/404');
    if (claim.status !== 'approved' || !claim.approved_amount) {
      req.flash('error', 'This claim is not ready for settlement yet.');
      return res.redirect(`/app/claims/${claim.id}`);
    }

    const order = await payment.createOrder({
      amount: claim.approved_amount,
      receipt: `rcpt_${claim.claim_number}`,
      notes: { claim: claim.claim_number, policy: claim.policy_number },
    });

    const paymentId = await db.insert('payments', {
      claim_id: claim.id, user_id: req.user.id,
      gateway: order.gateway, order_id: order.id,
      amount: claim.approved_amount, currency: 'INR', status: 'created',
      receipt: order.receipt,
    });
    const pay = await db.one('SELECT * FROM payments WHERE id = ?', [paymentId]);
    return renderCheckout(res, claim, pay, order);
  } catch (err) {
    return next(err);
  }
});

router.post('/claims/:id/pay/confirm', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim || claim.user_id !== req.user.id) return res.status(404).render('errors/404');
    const pay = await db.one(
      'SELECT * FROM payments WHERE claim_id = ? AND status = ? ORDER BY id DESC LIMIT 1',
      [claim.id, 'created']
    );
    if (!pay) {
      req.flash('error', 'No pending settlement was found for this claim.');
      return res.redirect(`/app/claims/${claim.id}`);
    }

    const method = req.body.method || 'upi';
    const paymentIdRef = payment.newPaymentId();
    await db.update('payments', {
      status: 'paid', payment_id: paymentIdRef, method, paid_at: new Date(),
    }, 'id = ?', [pay.id]);
    await db.update('claims', { status: 'paid', approved_amount: claim.approved_amount }, 'id = ?', [claim.id]);

    await claimsService.notify(req.user.id, `Settlement completed — ${h.formatCurrency(claim.approved_amount)}`,
      `Claim ${claim.claim_number} has been settled. Reference ${paymentIdRef}.`,
      `/app/claims/${claim.id}`, 'wallet');
    await claimsService.audit(req, 'claim.paid', 'claim', claim.id, { amount: claim.approved_amount, reference: paymentIdRef });

    req.flash('success', `Settlement of ${h.formatCurrency(claim.approved_amount)} completed. Reference ${paymentIdRef}.`);
    return res.redirect(`/app/claims/${claim.id}`);
  } catch (err) {
    return next(err);
  }
});

router.post('/claims/:id/pay/verify', async (req, res, next) => {
  try {
    const claim = await claimsService.getClaim(req.params.id);
    if (!claim || claim.user_id !== req.user.id) return res.status(404).json({ ok: false });
    const { razorpay_order_id: orderId, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
    if (!payment.verifySignature({ orderId, paymentId: pid, signature: sig })) {
      return res.status(400).json({ ok: false, error: 'signature_mismatch' });
    }
    const pay = await db.one('SELECT * FROM payments WHERE claim_id = ? AND order_id = ?', [claim.id, orderId]);
    if (!pay) return res.status(404).json({ ok: false });
    await db.update('payments', { status: 'paid', payment_id: pid, method: 'razorpay', paid_at: new Date() }, 'id = ?', [pay.id]);
    await db.update('claims', { status: 'paid' }, 'id = ?', [claim.id]);
    return res.json({ ok: true, redirect: `/app/claims/${claim.id}` });
  } catch (err) {
    return next(err);
  }
});

function renderCheckout(res, claim, pay, order) {
  return res.render('user/checkout', {
    title: 'Complete settlement', page: 'claims', claim, pay, order, demo: payment.isDemo(),
    keyId: config.razorpay.keyId,
  });
}

function buildTimeline(claim, pay) {
  const events = [{ label: 'Claim submitted', at: claim.created_at, note: `Claim ${claim.claim_number} created by the customer`, icon: 'upload', done: true }];
  if (claim.ai_status === 'processing') events.push({ label: 'AI verification running', at: claim.updated_at, note: 'OCR, image forensics and damage analysis in progress', icon: 'cpu', done: true });
  if (claim.ai_status === 'completed') {
    events.push({
      label: 'AI verification completed',
      at: claim.updated_at,
      note: `${claim.ai_confidence}% confidence · recommendation: ${h.RECOMMENDATION_META[claim.ai_recommendation]?.label || '—'}`,
      icon: 'cpu', done: true,
    });
  }
  if (claim.status === 'manual_review') events.push({ label: 'With adjuster', at: claim.updated_at, note: 'A human adjuster is reviewing your claim', icon: 'user-check', done: true, pending: true });
  if (claim.decided_at) {
    events.push({
      label: claim.status === 'rejected' ? 'Claim rejected' : 'Claim approved',
      at: claim.decided_at,
      note: claim.decision_notes || (claim.approved_amount ? `Approved amount ${h.formatCurrency(claim.approved_amount)}` : ''),
      icon: claim.status === 'rejected' ? 'x' : 'check', done: true,
    });
  }
  if (pay && pay.status === 'paid') {
    events.push({ label: 'Settlement paid', at: pay.paid_at, note: `${h.formatCurrency(pay.amount)} · ${pay.method} · ${pay.payment_id || ''}`, icon: 'wallet', done: true });
  } else if (claim.status === 'approved') {
    events.push({ label: 'Settlement pending', at: null, note: 'Approve the payout from this page to receive the amount', icon: 'wallet', done: false });
  }
  return events;
}

/* ── Notifications ────────────────────────────────────────────── */
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.render('user/notifications', { title: 'Notifications', page: 'notifications', notifications });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/read', async (req, res, next) => {
  try {
    await db.run('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    req.flash('success', 'All notifications marked as read.');
    return res.redirect(req.body.back || '/app/notifications');
  } catch (err) {
    return next(err);
  }
});

router.get('/notifications/:id/open', async (req, res, next) => {
  try {
    const n = await db.one('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!n) return res.redirect('/app/notifications');
    await db.run('UPDATE notifications SET read_at = NOW() WHERE id = ?', [n.id]);
    return res.redirect(n.link || '/app/notifications');
  } catch (err) {
    return next(err);
  }
});

/* ── Support ──────────────────────────────────────────────────── */
router.get('/support', async (req, res, next) => {
  try {
    const tickets = await db.all(
      `SELECT t.*, (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS messages,
              (SELECT message FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_message
         FROM support_tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`,
      [req.user.id]
    );
    res.render('user/support', { title: 'Help & support', page: 'support', tickets });
  } catch (err) {
    next(err);
  }
});

router.post('/support', async (req, res, next) => {
  try {
    const { subject, category, priority, message } = req.body;
    if (!subject || !message) {
      req.flash('error', 'Subject and message are required.');
      return res.redirect('/app/support');
    }
    const ticketNo = `TKT-${Math.floor(1000 + Math.random() * 9000)}${Math.floor(10 + Math.random() * 89)}`;
    const id = await db.insert('support_tickets', {
      ticket_no: ticketNo, user_id: req.user.id, subject,
      category: category || 'claim', priority: priority || 'normal',
    });
    await db.insert('ticket_messages', {
      ticket_id: id, sender_role: 'user', sender_name: req.user.full_name, message,
    });
    await claimsService.audit(req, 'ticket.created', 'ticket', id, { ticket_no: ticketNo });
    req.flash('success', `Support ticket ${ticketNo} created. Our team replies within one working day.`);
    return res.redirect(`/app/support/${id}`);
  } catch (err) {
    return next(err);
  }
});

router.get('/support/:id', async (req, res, next) => {
  try {
    const ticket = await db.one('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!ticket) return res.status(404).render('errors/404');
    const messages = await db.all('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id', [ticket.id]);
    return res.render('user/ticket', { title: ticket.ticket_no, page: 'support', ticket, messages });
  } catch (err) {
    return next(err);
  }
});

router.post('/support/:id/reply', async (req, res, next) => {
  try {
    const ticket = await db.one('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!ticket) return res.status(404).render('errors/404');
    if (!req.body.message) {
      req.flash('error', 'Write a message before sending.');
      return res.redirect(`/app/support/${ticket.id}`);
    }
    await db.insert('ticket_messages', {
      ticket_id: ticket.id, sender_role: 'user', sender_name: req.user.full_name, message: req.body.message,
    });
    await db.run("UPDATE support_tickets SET status = 'open', updated_at = NOW() WHERE id = ?", [ticket.id]);
    return res.redirect(`/app/support/${ticket.id}`);
  } catch (err) {
    return next(err);
  }
});

/* ── Profile & preferences ────────────────────────────────────── */
router.get('/profile', (req, res) => {
  res.render('user/profile', { title: 'Profile', page: 'profile' });
});

router.post('/profile', async (req, res, next) => {
  try {
    const { full_name, phone, city, state } = req.body;
    if (!full_name || !/^\d{10}$/.test(phone || '')) {
      req.flash('error', 'Enter your name and a valid 10-digit mobile number.');
      return res.redirect('/app/profile');
    }
    await db.update('users', { full_name, phone, city: city || null, state: state || null }, 'id = ?', [req.user.id]);
    req.flash('success', 'Profile updated.');
    return res.redirect('/app/profile');
  } catch (err) {
    return next(err);
  }
});

router.post('/profile/password', async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const { current_password, new_password, confirm_password } = req.body;
    const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(current_password || '', row.password_hash)) {
      req.flash('error', 'Your current password is incorrect.');
      return res.redirect('/app/profile');
    }
    if (!new_password || new_password.length < 8) {
      req.flash('error', 'The new password must be at least 8 characters.');
      return res.redirect('/app/profile');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/app/profile');
    }
    await db.update('users', { password_hash: bcrypt.hashSync(new_password, 10) }, 'id = ?', [req.user.id]);
    req.flash('success', 'Password changed successfully.');
    return res.redirect('/app/profile');
  } catch (err) {
    return next(err);
  }
});

router.post('/preferences', async (req, res, next) => {
  try {
    const { language, theme } = req.body;
    const patch = {};
    if (['en', 'hi', 'mr'].includes(language)) patch.language = language;
    if (['light', 'dark'].includes(theme)) patch.theme = theme;
    if (Object.keys(patch).length) {
      await db.update('users', patch, 'id = ?', [req.user.id]);
      if (patch.language) req.session.lang = patch.language;
    }
    return res.redirect(req.body.back || req.get('referer') || '/app');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
