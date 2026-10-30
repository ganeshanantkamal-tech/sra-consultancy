import '../env.js';
import bcrypt from 'bcryptjs';
import { db } from './pool.js';

const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error('Set ADMIN_PASSWORD in .env.local before creating the first admin user.');
const username = process.env.ADMIN_USERNAME || 'admin';
const hash = await bcrypt.hash(password, 12);
await db().query(
  `INSERT INTO users (username, password_hash, role, permissions)
   VALUES ($1, $2, 'admin', '{}'::jsonb)
   ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', is_active = true, session_version = users.session_version + 1, updated_at = now()`,
  [username, hash],
);
console.log(`Admin user '${username}' is ready.`);
await db().end();
