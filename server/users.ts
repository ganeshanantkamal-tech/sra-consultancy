import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db, tx } from './db/pool.js';
import { effectivePermissions, MODULE_KEYS, startSession, userFromRequest, type SessionUser } from './auth.js';

const router = Router();
const ROLES = ['admin', 'accountant', 'viewer'];
const text = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const id = (v: unknown) => { const value = String(v ?? ''); if (!/^\d+$/.test(value)) throw new Error('Invalid user id.'); return value; };
const run = async (res: any, action: () => Promise<unknown>, status = 200) => { try { res.status(status).json(await action()); } catch (error: any) { res.status(error.status || 400).json({ error: error.code === '23505' ? 'That username or email is already in use.' : error.message || 'Request could not be completed.' }); } };
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const password = (v: unknown) => { const value = String(v ?? ''); if (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new Error('Password must be at least 8 characters with a letter and a number.'); return value; };
const email = (v: unknown) => { const value = text(v, 200).toLowerCase(); if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Email address is not valid.'); return value || null; };
const permissions = (v: unknown) => { const source = v && typeof v === 'object' ? v as Record<string, unknown> : {}; return Object.fromEntries(MODULE_KEYS.map((key) => [key, source[key] === true])); };
const columns = `id, username, name, email, role, is_active AS "isActive", permissions, last_login_at AS "lastLoginAt", created_at AS "createdAt"`;
const shape = (row: any) => ({ ...row, id: String(row.id), permissions: effectivePermissions(row.role, row.permissions) });

// Only admins manage users (ERP "Manage Permissions" is admin-only).
const adminOnly = async (req: any, res: any, next: any) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please log in again.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Only administrators can manage users.' });
  req.user = user; next();
};
const signedIn = async (req: any, res: any, next: any) => { const user = await userFromRequest(req); if (!user) return res.status(401).json({ error: 'Please log in again.' }); req.user = user; next(); };
// The last active admin cannot be removed, demoted or deactivated, or nobody could manage users.
const keepAnAdmin = async (client: any, userId: string) => {
  const others = (await client.query(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active AND id <> $1`, [userId])).rows[0].n;
  if (!others) throw new Error('At least one active administrator is required.');
};

router.get('/auth/me', signedIn, (req: any, res) => run(res, async () => shape((await db().query(`SELECT ${columns} FROM users WHERE id=$1`, [req.user.id])).rows[0])));
router.put('/auth/me', signedIn, (req: any, res) => run(res, async () => shape((await db().query(`UPDATE users SET name=$1, email=$2, updated_at=now() WHERE id=$3 RETURNING ${columns}`, [text(req.body?.name), email(req.body?.email), req.user.id])).rows[0])));
router.post('/auth/change-password', signedIn, (req: any, res) => run(res, async () => {
  const row = (await db().query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!row || !(await bcrypt.compare(String(req.body?.currentPassword ?? ''), row.password_hash))) throw new Error('Current password is not correct.');
  const next = password(req.body?.newPassword);
  const updated = (await db().query('UPDATE users SET password_hash=$1, password_changed_at=now(), session_version=session_version+1, updated_at=now() WHERE id=$2 RETURNING session_version', [await bcrypt.hash(next, 12), req.user.id])).rows[0];
  // Older sessions are now invalid; give this browser a fresh one.
  startSession(res, { ...(req.user as SessionUser), sessionVersion: Number(updated.session_version) });
  return { ok: true };
}));

router.get('/users', adminOnly, (_, res) => run(res, async () => (await db().query(`SELECT ${columns} FROM users ORDER BY is_active DESC, lower(username)`)).rows.map(shape)));
router.post('/users', adminOnly, (req, res) => run(res, async () => {
  const b = req.body || {}; const username = text(b.username, 100);
  if (!/^[A-Za-z0-9._@-]{3,100}$/.test(username)) throw new Error('Username must be 3–100 letters, numbers, dots, dashes, underscores or @.');
  const role = ROLES.includes(b.role) ? b.role : 'accountant';
  const row = (await db().query(`INSERT INTO users (username, name, email, role, permissions, password_hash) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING ${columns}`, [username, text(b.name), email(b.email), role, JSON.stringify(permissions(b.permissions)), await bcrypt.hash(password(b.password), 12)])).rows[0];
  return shape(row);
}, 201));
router.put('/users/:id', adminOnly, (req: any, res) => run(res, () => tx(async (client) => {
  const userId = id(req.params.id); const b = req.body || {};
  const current = (await client.query('SELECT role, is_active FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0]; if (!current) throw fail(404, 'User not found.');
  const role = ROLES.includes(b.role) ? b.role : current.role; const isActive = b.isActive === undefined ? current.is_active : Boolean(b.isActive);
  if (current.role === 'admin' && current.is_active && (role !== 'admin' || !isActive)) await keepAnAdmin(client, userId);
  const row = (await client.query(`UPDATE users SET name=$1, email=$2, role=$3, is_active=$4, permissions=$5::jsonb, updated_at=now() WHERE id=$6 RETURNING ${columns}`, [text(b.name), email(b.email), role, isActive, JSON.stringify(permissions(b.permissions)), userId])).rows[0];
  return shape(row);
})));
router.post('/users/:id/password', adminOnly, (req, res) => run(res, async () => {
  const row = (await db().query('UPDATE users SET password_hash=$1, password_changed_at=now(), session_version=session_version+1, updated_at=now() WHERE id=$2 RETURNING id', [await bcrypt.hash(password(req.body?.password), 12), id(req.params.id)])).rows[0];
  if (!row) throw fail(404, 'User not found.');
  return { ok: true };
}));
router.delete('/users/:id', adminOnly, (req: any, res) => run(res, () => tx(async (client) => {
  const userId = id(req.params.id); if (userId === req.user.id) throw new Error('You cannot delete your own account.');
  const current = (await client.query('SELECT role, is_active FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0]; if (!current) throw fail(404, 'User not found.');
  if (current.role === 'admin' && current.is_active) await keepAnAdmin(client, userId);
  // Users who created documents are kept for the audit trail and only deactivated.
  try { await client.query('SAVEPOINT remove_user'); await client.query('DELETE FROM users WHERE id=$1', [userId]); return { ok: true, deleted: true }; }
  catch (error: any) { if (error.code !== '23503') throw error; await client.query('ROLLBACK TO SAVEPOINT remove_user'); await client.query('UPDATE users SET is_active=false, updated_at=now() WHERE id=$1', [userId]); return { ok: true, deleted: false }; }
})));

export default router;
