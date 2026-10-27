import { addEnquiry, isDbConfigured } from './_lib/db.js';

// Public: saves a contact-form enquiry for the /admin inbox.

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST' });
  }
  if (!isDbConfigured()) return res.status(503).json({ error: 'Enquiry storage is not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // honeypot filled in: answer as if saved, store nothing
  if (body.website) return res.status(201).json({ ok: true });

  const enquiry = {
    name: clip(body.name, 100),
    phone: clip(body.phone, 30),
    place: clip(body.place, 100),
    buildingType: clip(body.buildingType, 80),
    message: clip(body.message, 2000),
  };
  if (!enquiry.name || !enquiry.message) return res.status(400).json({ error: 'Name and message are required' });

  try {
    await addEnquiry(enquiry);
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Could not save the enquiry' });
  }
}
