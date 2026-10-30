import '../env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './pool.js';

// `URL.pathname` is not a Windows file path (`/C:/...`); convert it before
// passing it to fs/path helpers.
const directory = fileURLToPath(new URL('./migrations/', import.meta.url));
const client = db();
await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  const sql = await readFile(join(directory, file), 'utf8');
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]); await client.query('COMMIT'); console.log(`Applied ${file}`); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}
await client.end();
