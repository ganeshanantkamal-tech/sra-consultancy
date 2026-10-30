import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db/pool.js';

export const MODULE_KEYS = ['website', 'enquiries', 'dashboard', 'customers', 'hsn_sac', 'bills_quotes', 'cash_in', 'cash_out', 'bank', 'reports', 'reminders', 'accounts', 'settings', 'estimates'] as const;
export type ModuleKey = typeof MODULE_KEYS[number];
export type Permissions = Record<ModuleKey, boolean>;
export type SessionUser = { id: string; username: string; role: string; permissions: Permissions; sessionVersion?: number };

const COOKIE = 'sra_session';
const WEEK = 7 * 24 * 60 * 60;
const defaults: Permissions = Object.fromEntries(MODULE_KEYS.map((key) => [key, false])) as Permissions;
defaults.bills_quotes = defaults.cash_in = defaults.cash_out = defaults.accounts = true;

export function effectivePermissions(role: string, stored: unknown): Permissions {
  if (role === 'admin') return Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as Permissions;
  const value = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, typeof value[key] === 'boolean' ? value[key] : defaults[key]])) as Permissions;
}

// Sessions are signed with JWT_SECRET only; without it no session can be issued or verified.
const secret = () => process.env.JWT_SECRET || '';
const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');
const same = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const encode = (payload: object) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
};
const decode = (token?: string) => {
  if (!token || !secret()) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature || !same(signature, sign(body))) return null;
  try { const value = JSON.parse(Buffer.from(body, 'base64url').toString()); return value.exp > Date.now() ? value : null; } catch { return null; }
};
// The website handlers in api/*.js run without cookie-parser, so fall back to the raw header.
const cookie = (req: Request) => req.cookies?.[COOKIE]
  || (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  || req.headers.authorization?.replace(/^Bearer\s+/i, '');

export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  const payload = decode(cookie(req));
  if (!payload?.id) return null;
  const result = await db().query('SELECT id, username, role, permissions, is_active, session_version FROM users WHERE id = $1', [payload.id]);
  const row = result.rows[0];
  // Password changes bump session_version, which signs out every session issued before it.
  if (!row || Number(payload.sv || 0) !== Number(row.session_version)) return null;
  return row.is_active ? { id: String(row.id), username: row.username, role: row.role, permissions: effectivePermissions(row.role, row.permissions), sessionVersion: Number(row.session_version) } : null;
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  if (!secret()) throw new Error('JWT_SECRET is not configured, so logins are disabled.');
  const result = await db().query('SELECT id, username, password_hash, role, permissions, is_active, session_version FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)', [username]);
  const row = result.rows[0];
  if (!row?.is_active || !(await bcrypt.compare(password, row.password_hash))) return null;
  await db().query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
  return { id: String(row.id), username: row.username, role: row.role, permissions: effectivePermissions(row.role, row.permissions), sessionVersion: Number(row.session_version) };
}

export function startSession(res: Response, user: SessionUser) {
  res.cookie(COOKIE, encode({ id: user.id, sv: user.sessionVersion || 0, exp: Date.now() + WEEK * 1000 }), { httpOnly: true, sameSite: 'strict', secure: Boolean(process.env.VERCEL_ENV), path: '/', maxAge: WEEK * 1000 });
}
export function endSession(res: Response) { res.clearCookie(COOKIE, { path: '/' }); }
export function requirePermission(...needed: ModuleKey[]) {
  return async (req: Request & { user?: SessionUser }, res: Response, next: NextFunction) => {
    const user = await userFromRequest(req); if (!user) return res.status(401).json({ error: 'Please log in again.' });
    if (!needed.every((key) => user.permissions[key])) return res.status(403).json({ error: 'You do not have permission for this area.' });
    req.user = user; next();
  };
}
// Read access shared by several modules, e.g. the customer list used by sales, receipts and estimates.
export function requireAny(...anyOf: ModuleKey[]) {
  return async (req: Request & { user?: SessionUser }, res: Response, next: NextFunction) => {
    const user = await userFromRequest(req); if (!user) return res.status(401).json({ error: 'Please log in again.' });
    if (!anyOf.some((key) => user.permissions[key])) return res.status(403).json({ error: 'You do not have permission for this area.' });
    req.user = user; next();
  };
}
