'use strict';
require('dotenv').config();

const path = require('path');

const bool = (v) => String(v).toLowerCase() === 'true';
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const isProd = (process.env.NODE_ENV || 'development') === 'production';
const sessionSecret = process.env.SESSION_SECRET || '';
const adminDemoPassword = process.env.ADMIN_DEMO_PASSWORD || (isProd ? '' : process.env.DEMO_PASSWORD || 'Auto@123');

if (isProd && !sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}
if (isProd && !adminDemoPassword) {
  throw new Error('ADMIN_DEMO_PASSWORD must be set in production.');
}

const config = {
  appName: process.env.APP_NAME || 'AutoClaim AI',
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  appUrl: process.env.APP_URL || `http://localhost:${num(process.env.PORT, 3000)}`,
  sessionSecret: sessionSecret || 'autoclaim-ai-dev-secret',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autoclaim_ai',
    ssl: bool(process.env.DB_SSL),
  },

  uploadDir: process.env.UPLOAD_DIR || 'public/uploads',
  uploadRoot: path.join(__dirname, '..', process.env.UPLOAD_DIR || 'public/uploads'),
  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 12) * 1024 * 1024,

  ai: {
    autoApproveConfidence: num(process.env.AI_AUTO_APPROVE_CONFIDENCE, 88),
    maxFraudScore: num(process.env.AI_MAX_FRAUD_SCORE, 0.28),
    maxImageAiProbability: num(process.env.AI_MAX_IMAGE_AI_PROBABILITY, 22),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    get enabled() {
      return Boolean(this.keyId && this.keySecret);
    },
  },

  demoPassword: process.env.DEMO_PASSWORD || 'Auto@123',
  adminDemoPassword,

  contact: {
    phone: '9096809820',
    email: 'rohitkhobare2005@gmail.com',
    person: 'Rohit Khobare',
    address: 'PES Modern College of Engineering, Pune',
  },

  company: {
    insurer: 'AutoClaim General Insurance Co. Ltd.',
    supportHours: 'Mon – Sat, 9:00 AM – 8:00 PM IST',
  },

  isProd,
  trustProxy: bool(process.env.TRUST_PROXY),
};

module.exports = config;
