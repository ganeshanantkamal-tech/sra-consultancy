# SRA Consultancy

Website and content manager for SRA Consultancy, structural repair and waterproofing consultants in Akola.

Live: https://sra-consultancy-website.vercel.app · Admin: `/admin`

## How it fits together

| Part | Where |
|---|---|
| Website (React + Vite) | `src/` — sections in `src/components/`, built-in content in `src/data.js` |
| Admin panel (`/admin`) | `src/admin/` — loaded only on `/admin` |
| Content model shared by both | `src/cms/model.js` |
| Backend (Vercel serverless functions) | `api/` — `content`, `media`, `enquiry` are public; `admin` is password protected |
| Database (Neon Postgres) | content, saved versions, enquiries — tables in `db/schema.sql` |
| Photo storage | private Vercel Blob store `sra-cms` |

If nothing has been saved from `/admin`, or the database cannot be reached, the site shows the built-in content from `src/data.js`.

## Environment variables

Set in Vercel (Project → Settings → Environment Variables); for local work put them in `.env.local` (never committed). See `.env.example`.

- `DATABASE_URL` — Neon Postgres connection string
- `BLOB_READ_WRITE_TOKEN` — added by Vercel when the Blob store is connected
- `ADMIN_PASSWORD` — password for `/admin`

## Commands

```bash
npm install
npm run dev                                   # website only (no API)
vercel dev                                    # website + API locally (needs .env.local)
node --env-file=.env.local db/migrate.mjs     # create database tables (safe to re-run)
npm run build
vercel deploy --prod
```
