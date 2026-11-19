'use strict';
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { createDB } = require('mysql-memory-server');

async function main() {
  const demoDbPort = Number(process.env.DEMO_DB_PORT || 3307);
  const database = await createDB({ port: demoDbPort, dbName: 'autoclaim_ai' });

  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(database.port);
  process.env.DB_USER = database.username;
  process.env.DB_PASSWORD = database.password || '';
  process.env.DB_NAME = 'autoclaim_ai';
  process.env.DB_SSL = 'false';

  console.log(`Temporary demo MySQL ready on port ${database.port}.`);
  const initialized = spawnSync(process.execPath, [
    path.join(__dirname, 'init-db.js'),
    '--seed',
  ], { stdio: 'inherit', env: process.env });

  if (initialized.error) throw initialized.error;
  if (initialized.status !== 0) {
    throw new Error(`Demo database initialization exited with status ${initialized.status}.`);
  }

  const app = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  let stopping;

  const stop = async (exitCode) => {
    if (stopping) return stopping;
    stopping = (async () => {
      if (app.exitCode === null && app.signalCode === null) app.kill();
      await database.stop();
      process.exit(exitCode);
    })();
    return stopping;
  };

  app.on('error', (err) => {
    console.error('Could not start the AutoClaim AI server:', err);
    stop(1).catch((stopError) => {
      console.error('Could not stop the temporary MySQL server:', stopError);
      process.exit(1);
    });
  });
  app.on('exit', (code, signal) => {
    const exitCode = code === null ? (signal ? 1 : 0) : code;
    stop(exitCode).catch((err) => {
      console.error('Could not stop the temporary MySQL server:', err);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
}

main().catch((err) => {
  console.error('Could not start the AutoClaim AI demo:', err);
  process.exitCode = 1;
});
