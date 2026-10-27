import { getContent, isDbConfigured } from './_lib/db.js';

// Public: the saved website content. Cached at Vercel's edge for a minute, so admin changes
// appear on the site within about a minute. Returns {} when nothing has been saved yet.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET' });
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  if (!isDbConfigured()) return res.status(200).json({});
  try {
    return res.status(200).json((await getContent()) || {});
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not read content' });
  }
}
