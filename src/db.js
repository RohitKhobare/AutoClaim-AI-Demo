'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ...(config.db.ssl ? { ssl: {} } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

/** Run a query and return all rows. */
async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run a query and return the first row (or null). */
async function one(sql, params = []) {
  const rows = await all(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and return the result header. */
async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** INSERT helper returning the new id. */
async function insert(table, data) {
  const keys = Object.keys(data);
  const cols = keys.map((k) => `\`${k}\``).join(', ');
  const marks = keys.map(() => '?').join(', ');
  const values = keys.map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      return JSON.stringify(v);
    }
    return v;
  });
  const result = await run(`INSERT INTO \`${table}\` (${cols}) VALUES (${marks})`, values);
  return result.insertId;
}

/** UPDATE helper. */
async function update(table, data, whereSql, whereParams = []) {
  const sets = Object.keys(data).map((k) => `\`${k}\` = ?`).join(', ');
  const values = Object.keys(data).map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      return JSON.stringify(v);
    }
    return v;
  });
  return run(`UPDATE \`${table}\` SET ${sets} WHERE ${whereSql}`, [...values, ...whereParams]);
}

/** Safe JSON parse for DB JSON/TEXT columns. */
function json(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { pool, all, one, run, insert, update, json, transaction, ping };
