'use strict';
const db = require('../db');
const config = require('../config');
const { analyseClaim } = require('./ai-engine');

async function nextClaimNumber() {
  const row = await db.one('SELECT COUNT(*) AS c FROM claims');
  const seq = String(Number(row.c) + 1).padStart(4, '0');
  return `CLM-${new Date().getFullYear()}-${seq}`;
}

async function notify(userId, title, body, link = null, icon = 'bell') {
  return db.insert('notifications', { user_id: userId, title, body, link, icon });
}

async function audit(req, action, entity, entityId, meta = {}) {
  try {
    await db.insert('audit_logs', {
      actor_id: req.user ? req.user.id : null,
      actor_name: req.user ? req.user.full_name : 'system',
      action,
      entity,
      entity_id: String(entityId || ''),
      meta,
      ip: req.ip,
    });
  } catch (err) {
    console.error('audit failed', err.message);
  }
}

/** Full claim record with joined vehicle, policy, customer and assignee. */
async function getClaim(id) {
  return db.one(
    `SELECT c.*, v.registration_no, v.make, v.model, v.variant, v.year, v.fuel_type, v.colour, v.chassis_no, v.engine_no,
            p.policy_number, p.insurer, p.policy_type, p.start_date AS policy_start, p.end_date AS policy_end,
            p.sum_insured, p.idv, p.premium, p.deductible, p.ncb_percent, p.addons, p.status AS policy_status,
            u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
            u.city AS customer_city, u.id AS customer_id,
            a.full_name AS decided_by_name
       FROM claims c
       JOIN vehicles v ON v.id = c.vehicle_id
       JOIN policies p ON p.id = c.policy_id
       JOIN users u ON u.id = c.user_id
       LEFT JOIN users a ON a.id = c.decided_by
      WHERE c.id = ?`,
    [id]
  );
}

async function getClaimDocuments(claimId) {
  return db.all('SELECT * FROM claim_documents WHERE claim_id = ? ORDER BY id', [claimId]);
}

async function getClaimImages(claimId) {
  return db.all('SELECT * FROM claim_images WHERE claim_id = ? ORDER BY id', [claimId]);
}

/** Store uploaded files (multer objects) for a claim. */
async function attachFiles(claimId, { images = [], documents = [], imageAngles = [], docTypes = [] }) {
  for (let i = 0; i < images.length; i += 1) {
    await db.insert('claim_images', {
      claim_id: claimId,
      angle: imageAngles[i] || 'front',
      original_name: images[i].originalname,
      stored_name: images[i].filename,
      mime_type: images[i].mimetype,
      size_bytes: images[i].size,
    });
  }
  for (let i = 0; i < documents.length; i += 1) {
    await db.insert('claim_documents', {
      claim_id: claimId,
      doc_type: docTypes[i] || 'other',
      original_name: documents[i].originalname,
      stored_name: documents[i].filename,
      mime_type: documents[i].mimetype,
      size_bytes: documents[i].size,
    });
  }
}

/**
 * Run the full AI pipeline for a claim and persist every stage result.
 * Safe to re-run (e.g. after an adjuster asks for the analysis again).
 */
async function runAnalysis(claimId, { actor } = {}) {
  const claim = await getClaim(claimId);
  if (!claim) throw new Error('Claim not found');

  const [images, documents, clauses] = await Promise.all([
    getClaimImages(claimId),
    getClaimDocuments(claimId),
    db.all('SELECT * FROM policy_clauses WHERE policy_id = ? ORDER BY id', [claim.policy_id]),
  ]);

  const vehicle = {
    registration_no: claim.registration_no,
    make: claim.make,
    model: claim.model,
    year: claim.year,
  };
  const policy = {
    policy_number: claim.policy_number,
    insurer: claim.insurer,
    policy_type: claim.policy_type,
    start_date: claim.policy_start,
    end_date: claim.policy_end,
    idv: claim.idv,
    deductible: claim.deductible,
    status: claim.policy_status,
  };
  const user = {
    full_name: claim.customer_name,
    email: claim.customer_email,
  };

  const prior = await db.one(
    `SELECT COUNT(*) AS c FROM claims
      WHERE user_id = ? AND id <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`,
    [claim.user_id, claim.id]
  );

  const settings = await getSettings();
  const result = await analyseClaim({
    claim,
    vehicle,
    policy,
    user,
    images,
    documents,
    clauses,
    priorClaims: Number(prior.c),
    thresholds: {
      autoApproveConfidence: Number(settings.auto_approve_confidence || config.ai.autoApproveConfidence),
      maxFraudScore: Number(settings.max_fraud_score || config.ai.maxFraudScore),
      maxImageAiProbability: Number(settings.max_image_ai_probability || config.ai.maxImageAiProbability),
    },
  });

  // Persist per-image forensic results
  for (const img of result.vision.perImage) {
    await db.update('claim_images', {
      ai_probability: img.probability,
      is_ai_generated: img.isAiGenerated ? 1 : 0,
      damage_types: result.damage.detections,
    }, 'id = ?', [img.id]);
  }

  // Persist per-document OCR checks
  for (const doc of documents) {
    await db.update('claim_documents', {
      ocr_fields: {
        verified: result.ocr.verified,
        missing: result.ocr.missing,
        confidence: result.ocr.confidence,
      },
      verified: result.ocr.verified ? 1 : 0,
      checks: [
        { label: 'Document type detected', pass: true },
        { label: 'Fields cross-verified with policy record', pass: result.ocr.mismatches.length === 0 },
        { label: 'No tampering indicators', pass: result.vision.probability <= 40 },
      ],
    }, 'id = ?', [doc.id]);
  }

  const status = result.decision.recommendation === 'reject'
    ? 'rejected'
    : result.decision.recommendation === 'fraud_suspected' || result.decision.recommendation === 'manual_review'
      ? 'manual_review'
      : 'manual_review'; // every claim still reaches a human adjuster

  await db.update('claims', {
    status,
    ai_status: 'completed',
    ai_image_probability: result.vision.probability,
    ai_image_verdict: result.vision.verdict,
    detected_make: result.classification.make,
    detected_model: result.classification.model,
    detected_year: result.classification.year,
    vehicle_match: result.classification.confidence,
    ocr_fields: {
      fields: result.ocr.fields,
      missing: result.ocr.missing,
      mismatches: result.ocr.mismatches,
      confidence: result.ocr.confidence,
    },
    ocr_verified: result.ocr.verified ? 1 : 0,
    damage_summary: result.damage.detections,
    severity: result.severity.severity,
    severity_score: result.severity.score,
    repair_cost: result.cost.total,
    cost_breakdown: result.cost.breakdown,
    fraud_score: result.fraud.score,
    risk_level: result.fraud.risk,
    fraud_signals: result.fraud.signals,
    coverage_covered: result.coverage.covered ? 1 : 0,
    coverage_clause: result.coverage.clause,
    coverage_confidence: result.coverage.confidence,
    ai_recommendation: result.decision.recommendation,
    ai_confidence: result.decision.confidence,
    processing_ms: result.processingMs,
    decision_record: {
      summary: result.decision.summary,
      recommendation: result.decision.recommendation,
      recommendationLabel: result.decision.recommendationLabel,
      confidence: result.decision.confidence,
      key_signals: result.decision.keySignals,
      coverage_reason: result.coverage.reason,
      retrieved_clauses: result.coverage.retrieved,
      model_versions: result.modelVersions,
    },
    ...(status === 'rejected' ? {
      decided_at: new Date(),
      decision_notes: result.coverage.reason,
      decided_by: actor ? actor.id : null,
    } : {}),
  }, 'id = ?', [claimId]);

  if (status === 'rejected') {
    await notify(
      claim.user_id,
      `Claim ${claim.claim_number} could not be admitted`,
      result.coverage.reason,
      `/app/claims/${claimId}`,
      'alert'
    );
  } else {
    await notify(
      claim.user_id,
      `AI verification completed for ${claim.claim_number}`,
      `Recommendation: ${result.decision.recommendationLabel}. ${result.decision.summary.slice(0, 150)}…`,
      `/app/claims/${claimId}`,
      'cpu'
    );
  }

  return result;
}

async function getSettings() {
  const rows = await db.all('SELECT setting_key, setting_value FROM settings');
  return rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {});
}

async function decideClaim({ claimId, adminId, action, approvedAmount, notes }) {
  const claim = await getClaim(claimId);
  if (!claim) throw new Error('Claim not found');
  if (['paid'].includes(claim.status)) throw new Error('This claim is already settled');

  if (action === 'approve') {
    const amount = Number(approvedAmount || 0);
    if (!(amount > 0)) throw new Error('Enter a valid approved amount');
    const cap = Number(claim.repair_cost || claim.reported_amount || 0);
    if (cap > 0 && amount > cap * 1.05) throw new Error('Approved amount cannot exceed the assessed repair cost');

    await db.update('claims', {
      status: 'approved',
      approved_amount: amount,
      decided_by: adminId,
      decided_at: new Date(),
      decision_notes: notes || 'Approved after manual review.',
    }, 'id = ?', [claimId]);

    await notify(claim.user_id,
      `Claim ${claim.claim_number} approved`,
      `Your claim has been approved for ₹ ${amount.toLocaleString('en-IN')}. You can now complete the settlement payout from the claim page.`,
      `/app/claims/${claimId}`, 'check');
    return { status: 'approved', amount };
  }

  if (action === 'reject') {
    await db.update('claims', {
      status: 'rejected',
      approved_amount: null,
      decided_by: adminId,
      decided_at: new Date(),
      decision_notes: notes || 'Rejected after manual review.',
    }, 'id = ?', [claimId]);

    await notify(claim.user_id,
      `Claim ${claim.claim_number} rejected`,
      notes || 'Your claim was rejected after manual review. Open the claim for the adjuster remarks and next steps.',
      `/app/claims/${claimId}`, 'alert');
    return { status: 'rejected', amount: 0 };
  }

  throw new Error('Unknown decision');
}

module.exports = {
  nextClaimNumber,
  notify,
  audit,
  getClaim,
  getClaimDocuments,
  getClaimImages,
  attachFiles,
  runAnalysis,
  decideClaim,
  getSettings,
};
