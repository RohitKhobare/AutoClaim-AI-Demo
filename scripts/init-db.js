'use strict';
/**
 * Creates the AutoClaim AI database and all tables.
 *   npm run db:init        → create database + tables (keeps existing data)
 *   npm run db:reset       → DROP the database, then recreate + seed
 *   npm run db:init -- --seed   → create + seed
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const reset = process.argv.includes('--reset');
  const seed = process.argv.includes('--seed');

  const admin = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    ...(config.db.ssl ? { ssl: {} } : {}),
    multipleStatements: true,
  });

  console.log(`→ Connected to MySQL at ${config.db.host}:${config.db.port} as ${config.db.user}`);

  if (reset) {
    await admin.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
    console.log(`→ Dropped database ${config.db.database}`);
  }

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await admin.query(`USE \`${config.db.database}\``);

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await admin.query(schema);
  console.log('→ Schema applied (13 tables)');

  await admin.end();

  if (seed) {
    const { seedDatabase } = require('./seed-data');
    await seedDatabase({ fresh: reset });
  }
}

main()
  .then(() => {
    console.log('✔ Database ready.\n  Start the app with: npm start');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n✖ Database setup failed:', err.code || '', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  Check DB_USER / DB_PASSWORD in your .env file.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('  MySQL is not running. Start it (XAMPP → MySQL → Start) or run: net start mysql');
    }
    process.exit(1);
  });
