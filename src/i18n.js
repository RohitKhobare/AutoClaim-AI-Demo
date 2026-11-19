'use strict';
const fs = require('fs');
const path = require('path');

const LOCALES = ['en', 'hi', 'mr'];
const LOCALE_META = {
  en: { label: 'English', short: 'EN', flag: '🇬🇧' },
  hi: { label: 'हिन्दी', short: 'HI', flag: '🇮🇳' },
  mr: { label: 'मराठी', short: 'MR', flag: '🇮🇳' },
};

const dicts = {};
for (const l of LOCALES) {
  dicts[l] = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', `${l}.json`), 'utf8'));
}

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);
}

/**
 * Build the translation function for one locale.
 * Falls back to English, then to the key itself.
 */
function createT(locale) {
  const lang = LOCALES.includes(locale) ? locale : 'en';
  return function t(key, vars) {
    let value = lookup(dicts[lang], key);
    if (value === undefined) value = lookup(dicts.en, key);
    if (value === undefined) return key;
    if (typeof value !== 'string') return value;
    if (!vars) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
  };
}

function resolveLocale(req) {
  const fromQuery = req.query && req.query.lang;
  if (LOCALES.includes(fromQuery)) return fromQuery;
  if (req.session && LOCALES.includes(req.session.lang)) return req.session.lang;
  if (req.user && LOCALES.includes(req.user.language)) return req.user.language;
  const header = req.headers['accept-language'] || '';
  if (header.startsWith('mr')) return 'mr';
  if (header.startsWith('hi')) return 'hi';
  return 'en';
}

function middleware(req, res, next) {
  const locale = resolveLocale(req);
  if (req.query && LOCALES.includes(req.query.lang)) {
    req.session.lang = req.query.lang;
    if (req.user) req.session.save(() => {});
  }
  req.locale = locale;
  res.locals.locale = locale;
  res.locals.locales = LOCALE_META;
  res.locals.t = createT(locale);
  res.locals.langUrl = (code) => {
    const url = new URL(req.originalUrl, 'http://x');
    url.searchParams.set('lang', code);
    return url.pathname + url.search;
  };
  next();
}

module.exports = { LOCALES, LOCALE_META, createT, middleware, resolveLocale };
