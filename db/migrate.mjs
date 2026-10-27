// Creates the tables in db/schema.sql. Safe to run more than once.
//   node --env-file=.env.local db/migrate.mjs

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in .env.local first.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);

const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(', ')}`);
