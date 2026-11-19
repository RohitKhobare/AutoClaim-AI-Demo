'use strict';
const format = require('./format');
const config = require('./config');
const pkg = require('../package.json');

const STATUS_META = {
  submitted: { label: 'Submitted', tone: 'info', icon: 'upload' },
  ai_review: { label: 'AI review', tone: 'info', icon: 'cpu' },
  manual_review: { label: 'Manual review', tone: 'warn', icon: 'user-check' },
  approved: { label: 'Approved', tone: 'success', icon: 'check' },
  rejected: { label: 'Rejected', tone: 'danger', icon: 'x' },
  paid: { label: 'Settled', tone: 'success', icon: 'wallet' },
};

const RECOMMENDATION_META = {
  auto_approve: { label: 'Auto approve', tone: 'success' },
  manual_review: { label: 'Manual review', tone: 'warn' },
  fraud_suspected: { label: 'Fraud suspected', tone: 'danger' },
  reject: { label: 'Reject', tone: 'danger' },
};

const RISK_META = {
  low: { label: 'Low risk', tone: 'success' },
  medium: { label: 'Medium risk', tone: 'warn' },
  high: { label: 'High risk', tone: 'danger' },
};

const SEVERITY_META = {
  minor: { label: 'Minor', tone: 'success' },
  moderate: { label: 'Moderate', tone: 'warn' },
  major: { label: 'Major', tone: 'danger' },
  total_loss: { label: 'Total loss', tone: 'danger' },
};

const DOC_LABELS = {
  rc_book: 'RC Book',
  driving_license: 'Driving Licence',
  policy_copy: 'Insurance Policy',
  fir: 'FIR Copy',
  claim_form: 'Claim Form',
  invoice: 'Repair Invoice',
  other: 'Other Document',
};

const CLAIM_TYPE_LABELS = {
  own_damage: 'Own damage',
  third_party: 'Third-party liability',
  theft: 'Theft',
  natural_calamity: 'Natural calamity',
  property: 'Property damage',
};

const ANGLE_LABELS = { front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side', closeup: 'Close-up' };

const POLICY_TYPE_LABELS = {
  comprehensive: 'Comprehensive',
  third_party: 'Third-party only',
  own_damage: 'Own damage',
};

const TICKET_STATUS = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status, tone: 'neutral' };
}

function toneFor(status) {
  return statusMeta(status).tone;
}

function policyActive(policy) {
  if (!policy) return false;
  if (policy.policy_status) return policy.policy_status === 'active';
  return policy.status === 'active';
}

module.exports = {
  ...format,
  config,
  version: pkg.version,
  STATUS_META,
  RECOMMENDATION_META,
  RISK_META,
  SEVERITY_META,
  DOC_LABELS,
  CLAIM_TYPE_LABELS,
  ANGLE_LABELS,
  POLICY_TYPE_LABELS,
  TICKET_STATUS,
  statusMeta,
  toneFor,
  policyActive,
  parseJSON: (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  initials: (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
  titleCase: (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
};
