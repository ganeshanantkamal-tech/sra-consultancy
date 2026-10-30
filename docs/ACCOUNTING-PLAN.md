# Accounting + AI Site Estimates — Build Plan

Status: **approved** · 2026-10-27

Goal: add an **Accounting** section to `/admin` that has every module of Anantkamal ERP
(`C:\AnantKamal\anantkamalERP`), converted from Express + MongoDB to **PERN** (Postgres, Express, React, Node),
plus a new **AI Site Estimate** flow:

```
Site photo(s) ──▶ Claude (vision) ──▶ BOQ estimate (editable) ──▶ Excel ──▶ Admin approves
      ──▶ Quotation (draft, PDF + share link) ──▶ Client accepts ──▶ Sales Invoice (posted to books)
```

## Decisions already made

| Topic | Decision |
|---|---|
| Stack | Convert the ERP to PERN inside this repo |
| Hosting | Express runs on Vercel as one serverless function; same Neon Postgres as the website |
| Modules | All ERP modules + the new AI estimate module |
| Estimate approval | Admin edits AI lines, picks Low / High / custom rate per line, then approves |
| Contingency | Shown as its own quotation line |
| Delivery to client | Download PDF / share link only (no auto email or WhatsApp for quotations) |
| Login | User accounts with permissions for the **whole** `/admin` (replaces the single `ADMIN_PASSWORD`) |
| Dev database | A Neon **dev branch**; production data is never touched during the build |
| ERP bugs | Fixed as proposed in §5 |
| Numbering | `SRA/2026-27/0001` invoices, `SRAQ` quotations, `SRACN` credit notes; Non-GST `SRANG`, `SRANGQ`, `SRANGCN` (editable in Settings) |
| AI estimate tax mode | Quotations from estimates are **Non-GST by default** (GST can still be chosen per estimate) |

## 1. Architecture

```
sraConsultancy/
  api/                    existing Vercel functions (content, media, enquiry) — unchanged
  api/erp.ts              NEW: exports the Express app; vercel.json rewrites /api/erp/* here
  server/                 NEW: the converted ERP backend (TypeScript, same file layout as the ERP)
    app.ts                Express app (json + raw body, cookie-parser, helmet; no CORS needed — same origin)
    db/                   pg Pool, tx() helper, numbered SQL migrations, seed
    routes/ controllers/ services/ utils/   ported 1:1 from anantkamal-erp-api-new/src
    estimates/            NEW AI estimate module (Claude call, Excel builder)
  src/admin/              existing website editor (JSX) — moved behind the new user login
  src/erp/                NEW: the converted ERP screens (TSX, same layout as anantkamal-erp-frontend/src)
  scripts/dev-server.ts   NEW: runs Express + the existing api/*.js handlers on :3001 for `npm run dev`
```

- **Language:** ported code stays TypeScript (Vite and Vercel compile it). This keeps the port line-for-line
  with the ERP and lowers the risk of mistakes; the existing website code stays JavaScript.
- **Database driver:** `pg` with Neon's pooled connection string. Every multi-step operation (invoice + voucher +
  number + allocation) runs in **one** `BEGIN … COMMIT`, with the client passed down. This fixes the ERP's
  "orphan voucher" problem, where nested Mongo sessions committed separately.
- **Admin frontend:** `/admin` becomes one app with one login and two areas:
  **Website** (current content editor + enquiries) and **Accounting** (ERP sidebar, React Router under
  `/admin/accounting/*`). Tailwind 3 is added **scoped to `#erp-root`** with preflight off, so the public site
  and the current admin styling are not affected and the ERP screens keep their exact look.
- **PDFs:** the ERP's HTML templates are kept as they are; rendered with `puppeteer-core` + `@sparticuz/chromium`
  on Vercel (full `puppeteer` locally). One browser per request, as now.
- **Files:** logo, expense bills, site photos and generated Excel files go to the existing private Vercel Blob
  store (served through an authenticated `/api/erp/files` route), replacing the ERP's local `uploads/` folder.
- **Scheduled jobs:** node-cron is replaced by **Vercel Cron** (one daily run at 09:00 IST that does reminder,
  overdue and penalty). "Auto-send after invoice" uses `waitUntil` so it survives the function returning.
- **Local development:** `npm run dev` starts Vite and the local API server together; Vite proxies `/api` to it.
  The temporary proxy to the live site is removed.

## 2. Database (Postgres) — conversion of the 17 Mongo models

All money is `bigint` paise (as in the ERP). Ids are `bigint` identity. Dates are `date`; timestamps are `timestamptz`.

| Mongo model | Postgres tables | Notes |
|---|---|---|
| User | `users` | bcrypt hash, role, is_active, `permissions jsonb`, reset/OTP columns |
| CompanySettings | `company_settings` (single row) | notification settings as columns; secrets encrypted (AES-256-GCM as in ERP) |
| FinancialYear | `financial_years` | label unique, start/end `date`, status |
| AccountGroup | `account_groups` | self-referencing parent |
| Ledger | `ledgers` | + `system_key` (sales, output_cgst, round_off …) instead of finding system ledgers by name |
| Voucher | `vouchers` + `voucher_entries` | entries become rows (ledger_id, dr, cr); unique (type, no, fy) |
| InvoiceMeta | `invoices` + `invoice_items` | 1:1 with voucher; items as child rows for GSTR-1/HSN SQL |
| Quotation | `quotations` + `quotation_items` | + `estimate_id` link, + `public_token` for the share link |
| CreditNoteMeta | `credit_notes` + `credit_note_items` | |
| Allocation | `allocations` | FK to voucher and invoice, ON DELETE CASCADE |
| Sequence | `sequences` + `sequence_freed` | `INSERT … ON CONFLICT DO UPDATE … RETURNING`; freed numbers taken with `DELETE … RETURNING` (race-free) |
| HsnSacCode | `hsn_sac_codes` | seeded with construction / repair SAC codes |
| BankStatement / BankTransaction | `bank_statements`, `bank_transactions` | dedupe hash unique |
| Attachment | `attachments` | Blob pathname instead of local file path |
| Notification / NotificationTemplate | `notifications`, `notification_templates` | metadata `jsonb` |
| **new** | `estimates`, `estimate_items`, `estimate_photos` | AI estimate module (§4) |

Mongo aggregations ($unwind/$lookup/$group) become SQL `JOIN … GROUP BY` over `voucher_entries`; this also
removes the N+1 queries in ledger balances and ageing.

Migrations live in `server/db/migrations/NNN_*.sql`, applied by `npm run db:migrate` (tracked in a
`schema_migrations` table). The existing `db/schema.sql` website tables stay as they are.

## 3. Modules (everything in the ERP)

| Sidebar (as in ERP) | Screens | Backend |
|---|---|---|
| Dashboard | stat cards, income vs expense, money breakdown, recent activity, quick actions | P&L + invoices + notifications |
| Customers | clients list, add/edit (GSTIN/PAN/phone validation, states & cities), FY balance, statement link | clients |
| HSN / SAC | codes, usage panel, code lookup, HSN reports | hsn-sac |
| Bills & Quotes | Quotations · Sales Invoices · Credit/Debit Notes (GST) | quotations, invoices, credit-notes, PDFs |
| Non-GST Bills | same three tabs, Non-GST number series | same, `type=nongst` |
| Cash In | receipts with bill allocation, auto-settle oldest, PDF, Excel export | receipts, outstanding |
| Cash Out | expenses with category tiles, GST input, bill attachments, PDF, Excel export | expenses, capex, attachments |
| Bank | statement import (CSV/XLSX), auto-match, confirm/ignore, summary | bank |
| Reports | P&L, Balance Sheet, Trial Balance, Day Book, GST, Turnover, Cash & Bank, Accounts | reports, ledgers |
| GSTR-1 | month JSON + validation + Excel | gstr1 |
| Reminders | notification log, resend, templates | notifications, cron |
| Settings | company, bank, UPI, prefixes, FYs, notification channels, test email | settings |
| Manage Permissions | users, per-module toggles | users |
| Profile | change password with email OTP | auth |
| **AI Site Estimates** (new) | see §4 | estimates |
| **Website** (existing) | content editor, enquiries, saved versions | existing `/api/admin` |

New permission keys are added for `website`, `enquiries` and `estimates` alongside the ERP's 11 keys.

## 4. AI Site Estimates (new module)

**Create:** admin picks or creates a client (or starts from an **enquiry**), enters site location, building type
and a short problem note, and uploads 1–6 photos (shrunk in the browser like today's photo upload).

**Analyse:** the server sends the photos and notes to Claude (`claude-opus-5-5`, vision) with a strict JSON
output schema that mirrors the sheet `RCC_column_structural_work_labour_material_cost_sheet.xlsx`:

- title, location, basis line
- items: `sr, description, material, labour, other, low, high, notes`
- optional / excluded items (e.g. "transfer beam — TBD after design")
- contingency % (default 15)
- important note + safety / assumption bullets

The API key is `ANTHROPIC_API_KEY` in Vercel env (never sent to the browser). The raw AI response is stored for audit.

**Review (admin):** an editable grid with the same columns as the Excel. For each line the admin chooses
**Low / High / Custom**, and can edit text, add or remove lines, change the contingency %, and set SAC code and GST %
(default: Non-GST; GST mode can be switched on per estimate). Totals update live. Re-analyse is available while in draft.

**Excel:** "Download Excel" builds the same two sheets as the template — *BOQ Estimate* (with live formulas
`=C+D+E`, `SUM`, contingency) and *Summary* — with `exceljs`, and stores a copy in Blob.

**Approve → Quotation:** creates a normal **draft quotation** (same numbering, GST and PDF as the ERP):
one line per included item at the chosen rate, contingency as its own line, excluded items and the
safety/assumption bullets placed in Terms. The estimate is locked and linked to the quotation.

**Share:** a public, unguessable link to the quotation PDF (and later the invoice PDF), plus Download.
Sending is manual (copy link) as decided.

**Quotation → Invoice:** the ERP's existing flow — Approve, then Convert to Invoice — posts the sales voucher
(Dr Client, Cr Sales, Cr Output GST, round-off) and the invoice appears in receivables, reports and GSTR-1.

Estimate statuses: `draft → analysed → approved → quoted` (plus `discarded`).

## 5. Known ERP bugs — fix or copy?

The study found behaviour in the ERP that looks like a bug. **Approved: all fixed as proposed.**

| # | ERP behaviour | Proposal |
|---|---|---|
| B1 | Module permissions are only checked in the browser; any logged-in user can call any API | **Fix:** enforce on the server |
| B2 | Any logged-in user can change company settings and secrets | **Fix:** settings need the `settings` permission |
| B3 | Deactivated users can still log in | **Fix** |
| B4 | Restricted users get "forbidden" on every save, whatever their permissions | **Fix:** writes follow module permissions |
| B5 | Cancelled invoices still show as outstanding, in GST summary and in GSTR-1 | **Fix:** exclude cancelled |
| B6 | Voucher, number and invoice are saved in separate transactions (orphans possible) | **Fix:** one transaction |
| B7 | Invoice screen double-counts an odd paisa when splitting CGST/SGST | **Fix:** same split as the server |
| B8 | Client FY balance treats every opening balance as Dr | **Fix** |
| B9 | Voiding an invoice uses up the next invoice number for the reversal | **Fix:** reversals get their own `REV` series |
| B10 | Receipt number repeats the counter (`REC-0003/2026-27/0003`) | **Fix:** `REC/2026-27/0003` |
| B11 | Bank summary returns rupees while everything else is paise | **Fix:** paise |
| B12 | Razorpay payment marks invoice paid but posts no receipt | Keep as ERP for now; revisit in phase 6 |
| B13 | A cancelled quotation can still be converted to an invoice | **Fix:** block |

## 6. Phases (each ends deployable and checked)

| Phase | Scope | Check |
|---|---|---|
| 0 Foundation | Neon dev branch, `server/` Express on Vercel, local dev server, migrations, users/login/permissions for all of `/admin`, admin shell with Website + Accounting areas | log in as admin; website editor still works |
| 1 Masters | Settings (company, prefixes, FY), groups + system ledgers seed, ledgers, clients, HSN/SAC | create client and ledgers |
| 2 Sales | Quotations, invoices, credit/debit notes, Non-GST, numbering, PDFs, share links | GST maths and vouchers match ERP for the same inputs |
| 3 AI Estimates | photo upload, Claude analysis, editor, Excel, approve → quotation → invoice | end-to-end with a real site photo |
| 4 Cash & books | receipts + allocations, expenses + attachments, journal/contra/void, bank import + matching | trial balance balances |
| 5 Reports | dashboard, P&L, BS, TB, day book, GST, turnover, cash/bank, ageing, ledger statement, HSN reports, GSTR-1 | totals match ERP on the same sample data |
| 6 Notifications | email/SMS/WhatsApp, templates, Vercel Cron, Razorpay links + webhook | test sends |
| 7 Go-live | run migrations on production, set env vars, enter company details, first real documents | live smoke test |

## 7. What is needed from you

1. **Neon dev branch** connection string → put in `.env.local` as `DATABASE_URL` (pooled URL).
2. **`ANTHROPIC_API_KEY`** in `.env.local` (and later in Vercel).
3. `JWT_SECRET` and `ENCRYPTION_KEY` — I can generate these.
4. SRA company details for Settings (GSTIN, state, bank, UPI, logo) — can be entered in the app in phase 1.

## 8. Environment variables (final)

`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` (existing) · `ANTHROPIC_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`,
`APP_PUBLIC_URL`, `CRON_SECRET` · optional: `SMTP_*`, `SMS_*`, `WPS_*`, `RAZORPAY_*`.
`ADMIN_PASSWORD` is used once to create the first admin user, then no longer needed.

## 9. Progress (2026-10-29)

Phases 0–3 were audited against this plan and the gaps below were fixed. A 97-check end-to-end run (isolated schema, real Neon and Blob) passes, plus a Phase 4 regression check of receipts and voucher voids.

- **Hosting:** `api/erp.ts` mounts the Express app under `/api/erp`, so the full URL Vercel passes through matches. `vercel.json` gives the function 300 s for the Claude call. `puppeteer` is a dev dependency only; Vercel uses `@sparticuz/chromium`.
- **Phase 0:** sessions need `JWT_SECRET` and carry a session version, so a password change signs out older sessions. Users API and UI (`server/users.ts`, `src/erp/Users.jsx`) cover create, edit, permissions, deactivate, remove, admin password reset, profile and change-password, and keep at least one admin. The website admin reads permissions from the database on every request.
- **Phase 1:** migration 006 seeds the ERP account groups and Input CGST/SGST/IGST. Added: phone, email and state-code validation; plain-language duplicate errors; customer delete and detail (FY balance, open bills); ledger balances and statement; HSN/SAC delete and usage summary; logo upload; state picker.
- **Phase 2:** `date` columns come back as `YYYY-MM-DD`. Place of supply defaults to the customer's state. Totals are rounded to the rupee and the difference posted to Round Off. Credit notes are capped at the invoice total, allocated against it, and can be cancelled. Quotations can be edited and deleted (the newest number is freed); invoices can be edited until money or notes are linked. Documents gain authenticated view and PDF routes and a fuller template (company, bank, amount in words) with HTML escaping. The Sales list gains filters and CSV export.
- **Phase 3:** Claude returns whole rupees through a JSON schema, outside any database lock, with adaptive thinking and refusal fallback. Approval reuses the quotation code path (round-off, HSN checks, taxed contingency, 30-day validity). Excel follows the RCC template: `F = C+D+E`, subtotal, contingency and total formulas, and a Summary sheet. Added: photo preview and delete, discard, and start from a website enquiry.
- **Still open:** live photo analysis (waiting on `ANTHROPIC_API_KEY`); forgot-password by email OTP (no mail service configured); the ERP dashboard and reports; the ERP screen look (Tailwind, router, data tables); a preview deploy to confirm Vercel routing and PDF rendering.

### UI rebuild (2026-10-29)

The Accounting area now copies the Anantkamal ERP's screens in the website's colours: gold `#8A6634`/`#B98E57`, olive `#2E2F28`, ink and DM Sans.

- **Where it lives:** `/admin/accounting/*`, using React Router (base `/admin/accounting`) and Tailwind 3 (`tailwind.config.js`). Tailwind only scans `src/erp/**` and is scoped to `#erp-root`, with preflight off, so the public site is unaffected.
- **Shared pieces:**
  - `src/erp/components/`: `Layout.jsx` (ERP sidebar and top bar with the FY picker), `DataTable.jsx` (port of the ERP table) and `ui.jsx` (buttons, fields, modals, toasts, confirm dialogs).
  - `src/erp/context.jsx`: session, financial year and company.
  - `src/erp/lib/`: API, formatting and state codes.
- **Pages** (`src/erp/pages/`): Dashboard, Customers, HSN/SAC and its report, Bills & Quotes and Non-GST Bills (quotations, invoices, credit notes), AI Site Estimates with an estimate workspace, Cash In, Cash Out, Bank, Ledgers with statements, Settings, Manage Permissions and Profile.
- **Added in this pass:**
  - API: `GET /dashboard`, `GET /company`, bank match candidates and un-ignore, expense bill list and download, receipt detail, and `/hsn-sac/usage/:code`.
  - Customer balances in `/clients`, editable cash-book prefixes, and the default financial year in the FY picker.
  - Invoices can link to a quotation, and credit notes get a narration and share link (migration 007).
  - The bank CSV parser handles quoted cells and day-first dates.
