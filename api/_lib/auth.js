import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// One admin password, set as ADMIN_PASSWORD in Vercel's environment variables.
// A successful login gets a signed, HttpOnly cookie valid for 7 days. Changing the password signs
// everyone out, because the signing key is derived from it.

const COOKIE = 'sra_admin';
const WEEK = 7 * 24 * 60 * 60;

const key = () => createHash('sha256')
  .update(`sra-admin:${process.env.ADMIN_PASSWORD}:${process.env.BLOB_READ_WRITE_TOKEN || ''}`)
  .digest();
const sign = (value) => createHmac('sha256', key()).update(value).digest('base64url');

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const passwordConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function checkPassword(password) {
  return passwordConfigured() && same(password || '', process.env.ADMIN_PASSWORD);
}

function cookieHeader(value, maxAge) {
  const secure = process.env.VERCEL_ENV ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function startSession(res) {
  const expires = String(Date.now() + WEEK * 1000);
  res.setHeader('Set-Cookie', cookieHeader(`${expires}.${sign(expires)}`, WEEK));
}

export function endSession(res) {
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

export function isLoggedIn(req) {
  const account = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('sra_session='));
  if (account && process.env.JWT_SECRET) {
    const [body, signature] = account.slice('sra_session='.length).split('.');
    if (body && signature) {
      try {
        const expected = createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (same(signature, expected) && Number(payload.exp) > Date.now()) return true;
      } catch { /* reject malformed sessions */ }
    }
  }
  if (!passwordConfigured()) return false;
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [expires, signature] = raw.slice(COOKIE.length + 1).split('.');
  return Boolean(expires && signature) && Number(expires) > Date.now() && same(signature, sign(expires));
}
