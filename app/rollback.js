const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { MIGRATIONS_DIR, MIGRATION_LOCK_KEY, downFileFor } = require('./migrationConfig');

const steps = Number(process.argv[2] ?? 1);
if (!Number.isInteger(steps) || steps < 1) {
  console.error('usage: node rollback.js [steps]   (steps: positive integer, default 1)');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}

async function rollback() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT $1', [steps]);
    if (rows.length === 0) {
      console.log('nothing to roll back');
      return;
    }
    const plan = rows.map(({ name }) => ({ name, downPath: path.join(MIGRATIONS_DIR, downFileFor(name)) }));
    const missing = plan.filter(({ downPath }) => !fs.existsSync(downPath));
    if (missing.length > 0) {
      throw new Error(`no down file for: ${missing.map(({ name }) => name).join(', ')}`);
    }
    for (const { name, downPath } of plan) {
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(downPath, 'utf8'));
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`rollback of ${name} failed: ${error.message}`);
      }
      console.log(`rolled back ${name}`);
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

rollback().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
