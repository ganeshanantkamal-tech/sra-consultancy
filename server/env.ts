import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

// Commands run by Node do not get Vite's automatic `.env.local` loading.
// Prefer the local, uncommitted configuration and retain `.env` compatibility.
const local = '.env.local';
dotenv.config({ path: existsSync(local) ? local : '.env' });
