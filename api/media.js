import { readFile } from './_lib/store.js';

// Public: photos uploaded from /admin, served from private storage. File names are unique and never
// overwritten, so browsers and the edge can cache them for a year.
export default async function handler(req, res) {
  const path = String(req.query.path || '');
  if (!/^media\/[\w.-]+$/.test(path)) return res.status(400).json({ error: 'Bad path' });
  try {
    const file = await readFile(path);
    if (!file) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', file.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(file.buffer);
  } catch {
    return res.status(502).json({ error: 'Could not read the photo' });
  }
}
