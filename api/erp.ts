import express from 'express';
import app from '../server/app.js';

// vercel.json rewrites /api/erp/* to this function but Vercel keeps the original
// URL on the request, so the routes must be mounted under the same prefix the
// local dev server uses. The bare mount covers runtimes that strip the prefix.
const root = express();
root.disable('x-powered-by');
root.use('/api/erp', app);
root.use(app);

export default root;
