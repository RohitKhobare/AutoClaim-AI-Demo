'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const config = require('./src/config');
const db = require('./src/db');
const helpers = require('./src/helpers');
const i18n = require('./src/i18n');
const { loadUser, requireAuth } = require('./src/middleware/auth');

const app = express();
const root = __dirname;

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.set('trust proxy', config.trustProxy ? 1 : false);

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(root, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

app.use(session({
  name: 'autoclaim.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12,
    secure: config.isProd,
  },
}));
app.use(flash());

app.use(async (req, res, next) => {
  try {
    await loadUser(req, res, next);
  } catch (err) {
    next(err);
  }
});
app.use(i18n.middleware);

app.use((req, res, next) => {
  res.locals.helpers = helpers;
  res.locals.messages = req.flash();
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.page = '';
  res.locals.title = '';
  res.locals.contact = config.contact;
  res.locals.company = config.company;
  res.locals.appName = config.appName;
  res.locals.version = helpers.version;
  res.locals.razorpayDemo = !config.razorpay.enabled;
  next();
});

app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/auth'));
app.use('/app', requireAuth, require('./src/routes/user'));
app.use('/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/api'));

app.use((req, res) => res.status(404).render('errors/404'));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('✖', err.stack || err);
  const message = config.isProd ? 'Something went wrong.' : err.message;
  if (err.code === 'LIMIT_FILE_SIZE') {
    req.flash('error', `File is too large. Maximum size is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`);
    return res.redirect('back');
  }
  if (req.headers.accept && req.headers.accept.includes('json')) {
    return res.status(500).json({ error: message });
  }
  return res.status(500).render('errors/500', { error: message });
});

async function start() {
  try {
    await db.ping();
  } catch (err) {
    console.error('\n✖ Cannot connect to MySQL.\n');
    console.error(`  Host: ${config.db.host}:${config.db.port}  Database: ${config.db.database}  User: ${config.db.user}`);
    console.error(`  ${err.code || ''} ${err.message}`);
    console.error('\n  Fix: start MySQL (XAMPP → MySQL → Start), check DB_* values in .env,');
    console.error('  then run: npm run db:init -- --seed\n');
    process.exit(1);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n  AutoClaim AI running → http://localhost:${config.port}`);
    console.log(`  Panel logins (password: ${config.demoPassword})`);
    console.log('    Customer : rohit@autoclaim.ai');
    console.log('    Admin    : admin@autoclaim.ai\n');
  });
}

if (require.main === module) start();

module.exports = app;
