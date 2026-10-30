import '../server/env.js';
import express from 'express';
import app from '../server/app.js';
import admin from '../api/admin.js';
import content from '../api/content.js';
import enquiry from '../api/enquiry.js';
import media from '../api/media.js';

const local = express();
local.use(express.json({ limit: '4mb' }));
local.use('/api/erp', app);
// The website's existing Vercel handlers also run locally, so development never
// proxies writes to the production website.
local.all('/api/admin', (req, res) => admin(req, res));
local.all('/api/content', (req, res) => content(req, res));
local.all('/api/enquiry', (req, res) => enquiry(req, res));
local.all('/api/media', (req, res) => media(req, res));
local.listen(3001, () => console.log('Local API listening on http://localhost:3001'));
