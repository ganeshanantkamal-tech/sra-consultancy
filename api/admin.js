import { checkPassword, endSession, isLoggedIn, passwordConfigured, startSession } from './_lib/auth.js';
import { userFromRequest } from '../server/auth.js';
import {
  deleteEnquiry, getContent, getVersion, isDbConfigured, listEnquiries, listVersions, saveContent, updateEnquiry,
} from './_lib/db.js';
import { isStorageConfigured, stamp, writeFile } from './_lib/store.js';

// Everything the /admin panel does, behind one endpoint: /api/admin?action=...
//   session (GET)            am I logged in?
//   login / logout (POST)
//   content (GET, PUT)       read / save the website content
//   history (GET)            saved versions; restore (POST) puts one back
//   upload (POST)            store a photo, returns its URL
//   enquiries (GET)          inbox; enquiry (PATCH, DELETE) update or remove one

const MAX_CONTENT = 1024 * 1024;
const MAX_PHOTO = 3 * 1024 * 1024;
const STATUSES = ['new', 'contacted', 'visit', 'closed'];

const body = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idOf = (value) => (/^\d{1,18}$/.test(String(value ?? '')) ? String(value) : null);
const slug = (name) => String(name || 'photo').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';

const actions = {
  async session(req, res) {
    return res.json({ loggedIn: isLoggedIn(req), passwordConfigured: passwordConfigured(), storageConfigured: isDbConfigured() && isStorageConfigured() });
  },

  async login(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    if (!passwordConfigured()) return res.status(503).json({ error: 'The admin password has not been set up yet.' });
    if (!checkPassword(body(req).password)) {
      await wait(800); // slows down password guessing
      return res.status(401).json({ error: 'That password is not right.' });
    }
    startSession(res);
    return res.json({ ok: true });
  },

  async logout(req, res) {
    endSession(res);
    return res.json({ ok: true });
  },

  async content(req, res) {
    if (req.method === 'GET') return res.json({ content: await getContent() });
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Use GET or PUT' });
    const { content } = body(req);
    if (!content || typeof content !== 'object' || Array.isArray(content)) return res.status(400).json({ error: 'No content sent' });
    if (JSON.stringify(content).length > MAX_CONTENT) return res.status(413).json({ error: 'Content is too large' });
    await saveContent(content);
    return res.json({ ok: true, savedAt: new Date().toISOString() });
  },

  async history(req, res) {
    const versions = await listVersions();
    return res.json({ versions: versions.map((v) => ({ id: String(v.id), savedAt: v.saved_at })) });
  },

  async restore(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    const id = idOf(body(req).id);
    if (!id) return res.status(400).json({ error: 'Unknown version' });
    const content = await getVersion(id);
    if (!content) return res.status(404).json({ error: 'Version not found' });
    await saveContent(content);
    return res.json({ ok: true, content });
  },

  async upload(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    if (!isStorageConfigured()) return res.status(503).json({ error: 'Photo storage is not set up.' });
    const { filename, contentType, data } = body(req);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return res.status(400).json({ error: 'Only JPG, PNG or WebP photos' });
    const buffer = Buffer.from(String(data || ''), 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty file' });
    if (buffer.length > MAX_PHOTO) return res.status(413).json({ error: 'Photo is too large' });
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const pathname = `media/${stamp()}-${slug(filename)}.${ext}`;
    await writeFile(pathname, buffer, contentType);
    return res.json({ src: `/api/media?path=${encodeURIComponent(pathname)}` });
  },

  async enquiries(req, res) {
    const rows = await listEnquiries();
    return res.json({ enquiries: rows.map((e) => ({ ...e, id: String(e.id) })) });
  },

  async enquiry(req, res) {
    const { status, notes } = body(req);
    const id = idOf(body(req).id);
    if (!id) return res.status(400).json({ error: 'Unknown enquiry' });
    if (req.method === 'DELETE') {
      return (await deleteEnquiry(id)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Enquiry not found' });
    }
    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Use PATCH or DELETE' });
    const next = await updateEnquiry(id, {
      status: STATUSES.includes(status) ? status : null,
      notes: typeof notes === 'string' ? notes.slice(0, 2000) : null,
    });
    if (!next) return res.status(404).json({ error: 'Enquiry not found' });
    return res.json({ ok: true, enquiry: { ...next, id: String(next.id) } });
  },
};

const PUBLIC = new Set(['session', 'login', 'logout']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = actions[req.query.action];
  if (!action) return res.status(404).json({ error: 'Unknown action' });
  if (!PUBLIC.has(req.query.action)) {
    // With user accounts (JWT_SECRET set) permissions are read from the database on every
    // request, so a deactivated user or a removed permission takes effect immediately.
    // The single-password login is only honoured on deployments without user accounts.
    if (process.env.JWT_SECRET) {
      let accountUser = null;
      try { accountUser = await userFromRequest(req); } catch { return res.status(503).json({ error: 'The database is not available.' }); }
      if (!accountUser) return res.status(401).json({ error: 'Please log in again.' });
      const permission = req.query.action === 'enquiries' || req.query.action === 'enquiry' ? 'enquiries' : 'website';
      if (!accountUser.permissions[permission]) return res.status(403).json({ error: 'You do not have permission for this area.' });
    } else if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in again.' });
    if (!isDbConfigured()) return res.status(503).json({ error: 'The database is not set up.' });
  }
  try {
    return await action(req, res);
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
