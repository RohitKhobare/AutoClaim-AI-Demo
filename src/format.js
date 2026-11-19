'use strict';

/** ₹ 8,45,000 */
function formatCurrency(value, withSymbol = true) {
  const n = Number(value || 0);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(n));
  return withSymbol ? `₹ ${formatted}` : formatted;
}

/** Indian short form: ₹ 8.45 L / ₹ 1.2 Cr */
function formatCompactCurrency(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹ ${(n / 1000).toFixed(1)} K`;
  return `₹ ${Math.round(n)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value || 0));
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

/** 2026-10-04 → 04 Oct 2026 */
function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatTime(value) {
  if (!value) return '—';
  const [h, m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return String(value);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

function daysBetween(a, b = new Date()) {
  const d1 = new Date(String(a).slice(0, 10));
  const d2 = new Date(String(b).slice(0, 10));
  return Math.round((d2 - d1) / 86400000);
}

function timeAgo(value) {
  if (!value) return '—';
  const then = new Date(String(value).replace(' ', 'T')).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

module.exports = {
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  formatDateTime,
  formatTime,
  daysBetween,
  timeAgo,
};
