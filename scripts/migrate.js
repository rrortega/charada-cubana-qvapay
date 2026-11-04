// Applies migrations/*.sql in filename order, recording each one so re-runs are
// safe. Each file is applied inside its own transaction.
import './env.js';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const dir = new URL('../migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

const done = new Set(
  (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
);

// The first three files predate this ledger; treat them as applied when their
// objects already exist, so an existing database is not reported as broken.
if (done.size === 0) {
  const exists = await client.query(
    "SELECT to_regclass('public.cargadores') IS NOT NULL AS present",
  );
  if (exists.rows[0].present) {
    for (const name of files) {
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [name],
      );
      done.add(name);
    }
    console.log('existing schema detected; recorded as applied');
  }
}

let applied = 0;
for (const file of files) {
  if (done.has(file)) {
    console.log(`skip    ${file}`);
    continue;
  }
  const sql = await readFile(new URL(file, dir), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`applied ${file}`);
    applied += 1;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`FAILED ${file}: ${err.code ?? ''} ${err.message}`);
    process.exitCode = 1;
    break;
  }
}

console.log(applied ? `${applied} migration(s) applied` : 'nothing to do');
await client.end();
