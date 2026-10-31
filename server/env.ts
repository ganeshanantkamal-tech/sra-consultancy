import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

// Commands run by Node do not get Vite's automatic `.env.local` loading. Read the local,
// uncommitted file first, then `.env` for anything it does not set (`vercel link` writes a
// `.env.local` holding only its own token).
dotenv.config({ path: ['.env.local', '.env'].filter((file) => existsSync(file)), quiet: true });
