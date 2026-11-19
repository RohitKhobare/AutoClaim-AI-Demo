'use strict';
/**
 * OPTIONAL helper — only needed if MySQL is NOT installed on your machine.
 * Downloads and starts a temporary MySQL server on port 3307, then keeps it
 * running until you press Ctrl+C.
 *
 *   1) npm install
 *   2) npm install -D mysql-memory-server
 *   3) node scripts/dev-mysql.js
 *   4) in a second terminal: DB_PORT=3307 npm run db:init --reset --seed && DB_PORT=3307 npm start
 *
 * If you have XAMPP / MySQL Workbench installed, ignore this file and just
 * start MySQL normally (port 3306).
 */
const { createDB } = require('mysql-memory-server');

(async () => {
  console.log('Starting a temporary MySQL server (first run downloads the binary)...');
  const db = await createDB({ port: 3307, dbName: 'autoclaim_ai' });
  console.log(`✔ MySQL ready → host 127.0.0.1  port ${db.port}  user ${db.username}`);
  console.log('  Keep this terminal open. Press Ctrl+C to stop.');
  const shutdown = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => {}, 1 << 30);
})().catch((err) => {
  console.error('Could not start temporary MySQL:', err.message);
  process.exit(1);
});
