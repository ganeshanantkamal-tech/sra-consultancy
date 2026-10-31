import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { db, tx } from './db/pool.js';
import { requirePermission } from './auth.js';
import { renderPdf } from './pdf.js';
import { logoDataUri } from './masters.js';

const router = Router();
export type Totals = { items: any[]; taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; grandTotal: number };
type Entry = [string, number, number];
const text = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max);
const id = (v: unknown) => { const value = String(v ?? ''); if (!/^\d+$/.test(value)) throw new Error('Invalid record id.'); return value; };
const date = (v: unknown) => { const value = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('Enter a valid date.'); return value; };
const money = (v: unknown) => { const value = Number(v); if (!Number.isSafeInteger(value) || value < 0) throw new Error('Rates must be whole paise.'); return value; };
const query = async (res: any, action: () => Promise<unknown>, status = 200) => { try { res.status(status).json(await action()); } catch (error: any) { res.status(error.status || 400).json({ error: error.message || 'Request could not be completed.' }); } };
const notFound = (message: string) => Object.assign(new Error(message), { status: 404 });
// Business dates are Indian dates; the server (Vercel) runs in UTC.
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const fyFor = async (client: PoolClient, docDate: string) => { const row = (await client.query('SELECT id, label FROM financial_years WHERE status = $1 AND start_date <= $2 AND end_date >= $2', ['open', docDate])).rows[0]; if (!row) throw new Error('No open financial year covers this document date.'); return row; };
export const nextNumber = async (client: PoolClient, kind: string, fyId: string, prefix: string, label: string) => { const row = (await client.query(`INSERT INTO sequences (kind, financial_year_id, last_value) VALUES ($1, $2, 1) ON CONFLICT (kind, financial_year_id) DO UPDATE SET last_value = sequences.last_value + 1 RETURNING last_value`, [kind, fyId])).rows[0]; return `${prefix}/${label}/${String(row.last_value).padStart(4, '0')}`; };
// Deleting the newest document of a series frees its number (ERP behaviour); older numbers stay used.
const releaseNumber = async (client: PoolClient, kind: string, fyId: string, number: string) => { const seq = Number(number.split('/').pop()); await client.query('UPDATE sequences SET last_value = last_value - 1 WHERE kind = $1 AND financial_year_id = $2 AND last_value = $3', [kind, fyId, seq]); };
const systemLedgers = async (client: PoolClient) => { const rows = (await client.query(`SELECT id, system_key FROM ledgers WHERE system_key = ANY($1)`, [['sales','output_cgst','output_sgst','output_igst','round_off']])).rows; const map = Object.fromEntries(rows.map((r) => [r.system_key, r.id])); if (Object.keys(map).length < 5) throw new Error('System ledgers have not been seeded.'); return map; };

// Line kinds follow the structural-repair BOQ layout: 'section' (A. Preparatory works),
// 'group' (a numbered description with no amount, e.g. "Polymer treatment…") and 'item'
// (priced: unit × qty × rate). Items at level 2 are the lettered sub-items a), b) under a group.
export function calculate(raw: unknown, isNonGst: boolean, companyState: string, pos: string, allowBlankRate = false): Totals {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Add at least one line item.');
  const intrastate = companyState && pos && companyState === pos;
  const items = raw.map((source: any, position) => {
    const kind = ['section', 'group'].includes(source?.kind) ? source.kind : 'item';
    const description = text(source?.description, 4000); const ref = text(source?.ref, 10);
    if (!description) throw new Error(`Line ${position + 1} needs a description.`);
    if (kind !== 'item') return { position, kind, level: 1, ref, description, hsnSac: '', unit: '', qty: 0, rate: 0, gstRatePct: 0, lineTaxable: 0, lineCgst: 0, lineSgst: 0, lineIgst: 0, lineTotal: 0 };
    const level = Number(source.level) === 2 ? 2 : 1; const unit = text(source.unit, 20); const qty = Number(source.qty);
    const missing = source.rate === null || source.rate === undefined || source.rate === '';
    if (missing && !allowBlankRate) throw new Error(`Line ${position + 1} needs a rate.`);
    const rate = missing ? null : money(source.rate);
    const gstRatePct = isNonGst ? 0 : Number(source.gstRatePct);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Line ${position + 1} needs a quantity greater than zero.`);
    if (![0, 5, 12, 18, 28].includes(gstRatePct)) throw new Error(`Line ${position + 1} has an invalid GST rate.`);
    const hsnSac = isNonGst ? '' : text(source.hsnSac, 20); if (!isNonGst && !hsnSac) throw new Error(`Line ${position + 1} requires an HSN/SAC code.`);
    const taxable = rate === null ? 0 : Math.round(qty * rate); const tax = Math.round(taxable * gstRatePct / 100);
    const cgst = isNonGst ? 0 : intrastate ? Math.floor(tax / 2) : 0; const sgst = isNonGst ? 0 : intrastate ? tax - cgst : 0; const igst = isNonGst || intrastate ? 0 : tax;
    return { position, kind, level, ref, description, hsnSac, unit, qty, rate, gstRatePct, lineTaxable: taxable, lineCgst: cgst, lineSgst: sgst, lineIgst: igst, lineTotal: taxable + cgst + sgst + igst };
  });
  if (!items.some((item) => item.kind === 'item')) throw new Error('Add at least one item with a unit and quantity.');
  const sum = (key: string) => items.reduce((n, item: any) => n + item[key], 0);
  const subTotal = sum('lineTotal');
  // Grand total is rounded to the nearest rupee; the difference is posted to Round Off (ERP GstService).
  const grandTotal = Math.round(subTotal / 100) * 100;
  return { items, taxable: sum('lineTaxable'), cgst: sum('lineCgst'), sgst: sum('lineSgst'), igst: sum('lineIgst'), roundOff: grandTotal - subTotal, grandTotal };
}
// Sr. No. as on a BOQ: sections A, B…; items 1, 2… restarting in each section; sub-items a), b)…
// under the item above. A typed ref overrides the automatic one.
export const serialNumbers = (items: any[]) => {
  let sections = 0, number = 0, sub = 0;
  return items.map((item) => {
    if (item.kind === 'section') { sections += 1; number = 0; sub = 0; return item.ref || String.fromCharCode(64 + ((sections - 1) % 26) + 1); }
    if (item.kind === 'item' && Number(item.level) === 2) { sub += 1; return item.ref || `${String.fromCharCode(96 + ((sub - 1) % 26) + 1)})`; }
    number += 1; sub = 0; return item.ref || String(number);
  });
};
const insertItems = async (client: PoolClient, table: string, parent: string, parentId: string, totals: Totals) => { for (const item of totals.items) await client.query(`INSERT INTO ${table} (${parent}, position, kind, level, ref, description, hsn_sac, unit, qty, rate, gst_rate_pct, line_taxable, line_cgst, line_sgst, line_igst, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [parentId, item.position, item.kind, item.level, item.ref, item.description, item.hsnSac, item.unit, item.qty, item.rate, item.gstRatePct, item.lineTaxable, item.lineCgst, item.lineSgst, item.lineIgst, item.lineTotal]); };
const company = async (client: PoolClient) => (await client.query('SELECT state_code, invoice_prefix, quotation_prefix, credit_note_prefix, nongst_invoice_prefix, nongst_quotation_prefix, nongst_credit_note_prefix FROM company_settings WHERE id = true')).rows[0];
const clientExists = async (client: PoolClient, clientId: string) => { const row = (await client.query('SELECT id, name, state_code, gstin FROM ledgers WHERE id = $1 AND is_client = true', [clientId])).rows[0]; if (!row) throw new Error('Choose a customer.'); return row; };
// Place of supply defaults to the customer's state (from their state code or GSTIN), like the ERP form.
const placeOfSupply = (given: unknown, customer: any, settings: any, isNonGst: boolean) => {
  const pos = text(given, 2) || customer.state_code || (customer.gstin ? String(customer.gstin).slice(0, 2) : '') || settings.state_code;
  if (pos && !/^\d{2}$/.test(pos)) throw new Error('Place of supply must be a 2-digit state code.');
  if (!isNonGst && !settings.state_code) throw new Error('Set the company state code in Settings before creating GST documents.');
  return pos;
};
// Sales posting: Dr customer, Cr sales and output GST, round-off credited when positive (ERP SalesService).
const saleEntries = (customerId: string, totals: Totals, systems: Record<string, string>): Entry[] => [[customerId, totals.grandTotal, 0], [systems.sales, 0, totals.taxable], [systems.output_cgst, 0, totals.cgst], [systems.output_sgst, 0, totals.sgst], [systems.output_igst, 0, totals.igst], [systems.round_off, totals.roundOff < 0 ? -totals.roundOff : 0, totals.roundOff > 0 ? totals.roundOff : 0]];
const flip = (entries: Entry[]): Entry[] => entries.map(([ledger, dr, cr]) => [ledger, cr, dr]);
export const postEntries = async (client: PoolClient, voucherId: string, entries: Entry[]) => {
  const lines = entries.filter(([, dr, cr]) => dr || cr);
  if (lines.reduce((n, [, dr]) => n + dr, 0) !== lines.reduce((n, [, , cr]) => n + cr, 0)) throw new Error('Voucher does not balance.');
  for (const [ledger, dr, cr] of lines) await client.query('INSERT INTO voucher_entries (voucher_id, ledger_id, dr, cr) VALUES ($1,$2,$3,$4)', [voucherId, ledger, dr, cr]);
};

async function createInvoice(client: PoolClient, body: any, userId: string, quotationId?: string) {
  const isNonGst = Boolean(body.isNonGst); const docDate = date(body.date); const dueDate = date(body.dueDate || body.date); if (dueDate < docDate) throw new Error('Due date cannot be before the invoice date.');
  const clientId = id(body.clientLedgerId); const customer = await clientExists(client, clientId); const fy = await fyFor(client, docDate); const settings = await company(client);
  const pos = placeOfSupply(body.placeOfSupplyStateCode, customer, settings, isNonGst); const totals = calculate(body.items, isNonGst, settings.state_code, pos);
  const number = await nextNumber(client, isNonGst ? 'nongst_invoice' : 'invoice', fy.id, isNonGst ? settings.nongst_invoice_prefix : settings.invoice_prefix, fy.label);
  const voucher = (await client.query(`INSERT INTO vouchers (voucher_type, voucher_no, financial_year_id, date, narration, created_by) VALUES ('Sales',$1,$2,$3,$4,$5) RETURNING id`, [number, fy.id, docDate, text(body.narration), userId])).rows[0];
  const invoice = (await client.query(`INSERT INTO invoices (voucher_id, invoice_no, client_ledger_id, quotation_id, financial_year_id, date, due_date, place_of_supply_state_code, is_nongst, taxable, cgst, sgst, igst, round_off, grand_total, narration, terms, public_token, created_by, subject, site_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id, invoice_no AS "invoiceNo", public_token AS "publicToken"`, [voucher.id, number, clientId, quotationId || null, fy.id, docDate, dueDate, pos, isNonGst, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.roundOff, totals.grandTotal, text(body.narration), text(body.terms), randomUUID(), userId, text(body.subject, 500), text(body.siteReference, 200)])).rows[0];
  await insertItems(client, 'invoice_items', 'invoice_id', invoice.id, totals);
  await postEntries(client, voucher.id, saleEntries(clientId, totals, await systemLedgers(client)));
  return { ...invoice, totals };
}

export async function createQuotation(client: PoolClient, b: any, userId: string, estimateId?: string) {
  const isNonGst = Boolean(b.isNonGst); const docDate = date(b.date); const validUntil = date(b.validUntil || addDays(docDate, 30)); if (validUntil < docDate) throw new Error('Valid-until date cannot be before the quotation date.');
  const clientId = id(b.clientLedgerId); const customer = await clientExists(client, clientId); const fy = await fyFor(client, docDate); const settings = await company(client);
  const pos = placeOfSupply(b.placeOfSupplyStateCode, customer, settings, isNonGst); const totals = calculate(b.items, isNonGst, settings.state_code, pos, true);
  const number = await nextNumber(client, isNonGst ? 'nongst_quotation' : 'quotation', fy.id, isNonGst ? settings.nongst_quotation_prefix : settings.quotation_prefix, fy.label);
  const row = (await client.query(`INSERT INTO quotations (quotation_no, client_ledger_id, financial_year_id, date, valid_until, place_of_supply_state_code, is_nongst, taxable, cgst, sgst, igst, round_off, grand_total, notes, terms, public_token, created_by, estimate_id, subject, site_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id, quotation_no AS "quotationNo", public_token AS "publicToken"`, [number, clientId, fy.id, docDate, validUntil, pos, isNonGst, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.roundOff, totals.grandTotal, text(b.notes), text(b.terms), randomUUID(), userId, estimateId || null, text(b.subject, 500), text(b.siteReference, 200)])).rows[0];
  await insertItems(client, 'quotation_items', 'quotation_id', row.id, totals);
  return { ...row, totals };
}

const itemColumns = `kind, level, ref, description, hsn_sac AS "hsnSac", unit, qty::float AS qty, rate, gst_rate_pct AS "gstRatePct", line_taxable AS "lineTaxable", line_cgst AS "lineCgst", line_sgst AS "lineSgst", line_igst AS "lineIgst", line_total AS "lineTotal"`;
const totalsColumns = (a: string) => `${a}.is_nongst AS "isNonGst", ${a}.place_of_supply_state_code AS "placeOfSupplyStateCode", ${a}.taxable, ${a}.cgst, ${a}.sgst, ${a}.igst, ${a}.grand_total AS "grandTotal", ${a}.subject, ${a}.site_reference AS "siteReference"`;

router.get('/quotations', requirePermission('bills_quotes'), (_, res) => query(res, async () => (await db().query(`SELECT q.id, q.quotation_no AS "quotationNo", q.date, q.valid_until AS "validUntil", q.status, q.is_nongst AS "isNonGst", q.taxable, q.cgst, q.sgst, q.igst, q.round_off AS "roundOff", q.place_of_supply_state_code AS "placeOfSupplyStateCode", q.grand_total AS "grandTotal", q.public_token AS "publicToken", q.estimate_id AS "estimateId", q.client_ledger_id AS "clientLedgerId", q.subject, q.site_reference AS "siteReference", l.name AS "clientName", (SELECT i.invoice_no FROM invoices i WHERE i.quotation_id=q.id ORDER BY i.id DESC LIMIT 1) AS "invoiceNo" FROM quotations q JOIN ledgers l ON l.id=q.client_ledger_id ORDER BY q.date DESC, q.id DESC`)).rows));
router.get('/quotations/:id', requirePermission('bills_quotes'), (req, res) => query(res, async () => { const row = (await db().query(`SELECT q.id, q.quotation_no AS "quotationNo", q.date, q.valid_until AS "validUntil", q.status, q.client_ledger_id AS "clientLedgerId", l.name AS "clientName", ${totalsColumns('q')}, q.round_off AS "roundOff", q.notes, q.terms, q.public_token AS "publicToken", q.estimate_id AS "estimateId" FROM quotations q JOIN ledgers l ON l.id=q.client_ledger_id WHERE q.id=$1`, [id(req.params.id)])).rows[0]; if (!row) throw notFound('Quotation not found.'); row.items = (await db().query(`SELECT ${itemColumns} FROM quotation_items WHERE quotation_id=$1 ORDER BY position`, [row.id])).rows; return row; }));
router.post('/quotations', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx((client) => createQuotation(client, req.body || {}, req.user.id)), 201));
// Draft and approved quotations can be edited; the number, FY and token stay, and an edit sends it back to draft.
router.put('/quotations/:id', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const quote = (await client.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE', [id(req.params.id)])).rows[0]; if (!quote) throw notFound('Quotation not found.');
  if (!['draft', 'approved'].includes(quote.status)) throw new Error('Only draft or approved quotations can be edited.');
  const b = req.body || {}; const isNonGst = quote.is_nongst; const docDate = date(b.date || quote.date); const fy = await fyFor(client, docDate); if (String(fy.id) !== String(quote.financial_year_id)) throw new Error('The date must stay in the quotation\'s financial year.');
  const validUntil = date(b.validUntil || quote.valid_until); if (validUntil < docDate) throw new Error('Valid-until date cannot be before the quotation date.');
  const clientId = id(b.clientLedgerId || quote.client_ledger_id); const customer = await clientExists(client, clientId); const settings = await company(client);
  const pos = placeOfSupply(b.placeOfSupplyStateCode, customer, settings, isNonGst); const totals = calculate(b.items, isNonGst, settings.state_code, pos, true);
  await client.query(`UPDATE quotations SET client_ledger_id=$1, date=$2, valid_until=$3, place_of_supply_state_code=$4, taxable=$5, cgst=$6, sgst=$7, igst=$8, round_off=$9, grand_total=$10, notes=$11, terms=$12, subject=$13, site_reference=$14, status='draft', updated_at=now() WHERE id=$15`, [clientId, docDate, validUntil, pos, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.roundOff, totals.grandTotal, text(b.notes), text(b.terms), text(b.subject, 500), text(b.siteReference, 200), quote.id]);
  await client.query('DELETE FROM quotation_items WHERE quotation_id=$1', [quote.id]); await insertItems(client, 'quotation_items', 'quotation_id', quote.id, totals);
  return { id: quote.id, quotationNo: quote.quotation_no, totals };
})));
router.delete('/quotations/:id', requirePermission('bills_quotes'), (req, res) => query(res, () => tx(async (client) => {
  const quote = (await client.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE', [id(req.params.id)])).rows[0]; if (!quote) throw notFound('Quotation not found.');
  if (quote.status === 'converted') throw new Error('A converted quotation cannot be deleted.');
  await client.query(`UPDATE estimates SET quotation_id=NULL, status='analysed', updated_at=now() WHERE quotation_id=$1`, [quote.id]);
  await client.query('DELETE FROM quotations WHERE id=$1', [quote.id]);
  await releaseNumber(client, quote.is_nongst ? 'nongst_quotation' : 'quotation', quote.financial_year_id, quote.quotation_no);
  return { ok: true };
})));
router.post('/quotations/:id/approve', requirePermission('bills_quotes'), (req, res) => query(res, () => tx(async (client) => { const row = (await client.query(`UPDATE quotations SET status='approved', updated_at=now() WHERE id=$1 AND status='draft' RETURNING id`, [id(req.params.id)])).rows[0]; if (!row) throw new Error('Only draft quotations can be approved.'); return { ok: true }; })));
router.post('/quotations/:id/convert', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const quote = (await client.query(`SELECT * FROM quotations WHERE id=$1 FOR UPDATE`, [id(req.params.id)])).rows[0];
  if (!quote || quote.status === 'cancelled') throw new Error('This quotation cannot be converted.'); if (quote.status === 'converted') throw new Error('This quotation was already converted.'); if (quote.status !== 'approved') throw new Error('Approve the quotation before converting it.');
  const items = (await client.query(`SELECT ${itemColumns} FROM quotation_items WHERE quotation_id=$1 ORDER BY position`, [quote.id])).rows;
  const unpriced = items.filter((item) => item.kind === 'item' && item.rate === null).length;
  if (unpriced) throw new Error(`${unpriced} line${unpriced === 1 ? ' has' : 's have'} no rate yet. Edit the quotation and fill in every rate before converting it to an invoice.`);
  const docDate = req.body?.date || today(); const dueDate = req.body?.dueDate || docDate;
  const invoice = await createInvoice(client, { clientLedgerId: quote.client_ledger_id, date: docDate, dueDate, placeOfSupplyStateCode: quote.place_of_supply_state_code, isNonGst: quote.is_nongst, items, narration: quote.notes, terms: quote.terms, subject: quote.subject, siteReference: quote.site_reference }, req.user.id, quote.id);
  await client.query(`UPDATE quotations SET status='converted', updated_at=now() WHERE id=$1`, [quote.id]);
  return invoice;
})));
router.post('/quotations/:id/cancel', requirePermission('bills_quotes'), (req, res) => query(res, () => db().query(`UPDATE quotations SET status='cancelled', updated_at=now() WHERE id=$1 AND status IN ('draft','approved') RETURNING id`, [id(req.params.id)]).then((r) => { if (!r.rows[0]) throw new Error('Only draft or approved quotations can be cancelled.'); return { ok: true }; })));

router.get('/invoices', requirePermission('bills_quotes'), (_, res) => query(res, async () => (await db().query(`SELECT i.id, i.invoice_no AS "invoiceNo", i.date, i.due_date AS "dueDate", i.status, i.is_nongst AS "isNonGst", i.taxable, i.cgst, i.sgst, i.igst, i.round_off AS "roundOff", i.grand_total AS "grandTotal", i.public_token AS "publicToken", i.client_ledger_id AS "clientLedgerId", i.place_of_supply_state_code AS "placeOfSupplyStateCode", i.subject, i.site_reference AS "siteReference", l.name AS "clientName", COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.invoice_id=i.id),0)::bigint AS "settled" FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id ORDER BY i.date DESC, i.id DESC`)).rows));
router.get('/invoices/:id', requirePermission('bills_quotes'), (req, res) => query(res, async () => { const row = (await db().query(`SELECT i.id, i.invoice_no AS "invoiceNo", i.date, i.due_date AS "dueDate", i.status, i.client_ledger_id AS "clientLedgerId", l.name AS "clientName", ${totalsColumns('i')}, i.round_off AS "roundOff", i.narration, i.terms, i.public_token AS "publicToken", i.quotation_id AS "quotationId", COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.invoice_id=i.id),0)::bigint AS "settled" FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id WHERE i.id=$1`, [id(req.params.id)])).rows[0]; if (!row) throw notFound('Invoice not found.'); row.items = (await db().query(`SELECT ${itemColumns} FROM invoice_items WHERE invoice_id=$1 ORDER BY position`, [row.id])).rows; return row; }));
router.post('/invoices', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const b = req.body || {};
  let quotationId: string | undefined;
  if (b.quotationId) {
    const quote = (await client.query('SELECT id, status, client_ledger_id, is_nongst FROM quotations WHERE id=$1 FOR UPDATE', [id(b.quotationId)])).rows[0];
    if (!quote) throw new Error('Quotation not found.');
    if (!['draft', 'approved'].includes(quote.status)) throw new Error('That quotation is already converted or cancelled.');
    if (String(quote.client_ledger_id) !== String(b.clientLedgerId)) throw new Error('The quotation belongs to a different customer.');
    if (Boolean(quote.is_nongst) !== Boolean(b.isNonGst)) throw new Error('The quotation and invoice must both be GST or both be Non-GST.');
    quotationId = quote.id;
  }
  const invoice = await createInvoice(client, b, req.user.id, quotationId);
  if (quotationId) await client.query(`UPDATE quotations SET status='converted', updated_at=now() WHERE id=$1`, [quotationId]);
  return invoice;
}), 201));
// Editing re-posts the same voucher; blocked once money or notes are linked to the invoice.
router.put('/invoices/:id', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const invoice = (await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id(req.params.id)])).rows[0]; if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status !== 'active') throw new Error('Only active invoices can be edited.');
  if ((await client.query(`SELECT 1 FROM credit_notes WHERE invoice_id=$1 AND status='active' UNION ALL SELECT 1 FROM allocations WHERE invoice_id=$1 LIMIT 1`, [invoice.id])).rows.length) throw new Error('This invoice has receipts or credit notes against it and cannot be edited.');
  const b = req.body || {}; const docDate = date(b.date || invoice.date); const fy = await fyFor(client, docDate); if (String(fy.id) !== String(invoice.financial_year_id)) throw new Error('The date must stay in the invoice\'s financial year.');
  const dueDate = date(b.dueDate || docDate); if (dueDate < docDate) throw new Error('Due date cannot be before the invoice date.');
  const clientId = id(b.clientLedgerId || invoice.client_ledger_id); const customer = await clientExists(client, clientId); const settings = await company(client);
  const pos = placeOfSupply(b.placeOfSupplyStateCode, customer, settings, invoice.is_nongst); const totals = calculate(b.items, invoice.is_nongst, settings.state_code, pos);
  await client.query(`UPDATE invoices SET client_ledger_id=$1, date=$2, due_date=$3, place_of_supply_state_code=$4, taxable=$5, cgst=$6, sgst=$7, igst=$8, round_off=$9, grand_total=$10, narration=$11, terms=$12, subject=$13, site_reference=$14 WHERE id=$15`, [clientId, docDate, dueDate, pos, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.roundOff, totals.grandTotal, text(b.narration), text(b.terms), text(b.subject, 500), text(b.siteReference, 200), invoice.id]);
  await client.query('DELETE FROM invoice_items WHERE invoice_id=$1', [invoice.id]); await insertItems(client, 'invoice_items', 'invoice_id', invoice.id, totals);
  await client.query('UPDATE vouchers SET date=$1, narration=$2 WHERE id=$3', [docDate, text(b.narration), invoice.voucher_id]);
  await client.query('DELETE FROM voucher_entries WHERE voucher_id=$1', [invoice.voucher_id]);
  await postEntries(client, invoice.voucher_id, saleEntries(clientId, totals, await systemLedgers(client)));
  return { id: invoice.id, invoiceNo: invoice.invoice_no, totals };
})));
router.post('/invoices/:id/cancel', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const invoice = (await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [id(req.params.id)])).rows[0];
  if (!invoice) throw notFound('Invoice not found.'); if (invoice.status !== 'active') throw new Error('Invoice is already cancelled.');
  if ((await client.query(`SELECT 1 FROM credit_notes WHERE invoice_id=$1 AND status='active' LIMIT 1`, [invoice.id])).rows.length) throw new Error('This invoice has active credit/debit note(s) against it. Cancel those first, then cancel the invoice.');
  const reversalDate = date(req.body?.date || invoice.date); if (reversalDate < invoice.date) throw new Error('Cancellation date cannot be before the invoice date.');
  const fy = await fyFor(client, reversalDate); const reversalNo = await nextNumber(client, 'sales_reversal', fy.id, 'REV', fy.label);
  const reversal = (await client.query(`INSERT INTO vouchers (voucher_type,voucher_no,financial_year_id,date,narration,created_by,status) VALUES ('Sales Reversal',$1,$2,$3,$4,$5,'posted') RETURNING id`, [reversalNo, fy.id, reversalDate, `Reversal of ${invoice.invoice_no}`, req.user.id])).rows[0];
  const entries = (await client.query('SELECT ledger_id, dr::bigint AS dr, cr::bigint AS cr FROM voucher_entries WHERE voucher_id=$1', [invoice.voucher_id])).rows.map((e): Entry => [e.ledger_id, Number(e.dr), Number(e.cr)]);
  await postEntries(client, reversal.id, flip(entries));
  // Receipts that were settling this invoice become unallocated advances again (ERP cancelInvoice).
  await client.query('DELETE FROM allocations WHERE invoice_id=$1', [invoice.id]);
  await client.query(`UPDATE invoices SET status='cancelled' WHERE id=$1`, [invoice.id]);
  return { ok: true, reversalNo };
})));

router.get('/credit-notes', requirePermission('bills_quotes'), (_, res) => query(res, async () => (await db().query(`SELECT c.id, c.note_no AS "noteNo", c.note_type AS "noteType", c.date, c.grand_total AS "grandTotal", c.taxable, c.cgst, c.sgst, c.igst, c.round_off AS "roundOff", c.is_nongst AS "isNonGst", c.status, c.reason, c.narration, c.public_token AS "publicToken", c.subject, c.site_reference AS "siteReference", c.invoice_id AS "invoiceId", i.invoice_no AS "invoiceNo", l.name AS "clientName" FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id JOIN ledgers l ON l.id=c.client_ledger_id ORDER BY c.date DESC, c.id DESC`)).rows));
router.get('/credit-notes/:id', requirePermission('bills_quotes'), (req, res) => query(res, async () => { const row = (await db().query(`SELECT c.id, c.note_no AS "noteNo", c.note_type AS "noteType", c.date, c.status, c.reason, c.narration, c.public_token AS "publicToken", c.invoice_id AS "invoiceId", i.invoice_no AS "invoiceNo", l.name AS "clientName", c.is_nongst AS "isNonGst", i.place_of_supply_state_code AS "placeOfSupplyStateCode", c.taxable, c.cgst, c.sgst, c.igst, c.grand_total AS "grandTotal", c.subject, c.site_reference AS "siteReference", c.round_off AS "roundOff" FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id JOIN ledgers l ON l.id=c.client_ledger_id WHERE c.id=$1`, [id(req.params.id)])).rows[0]; if (!row) throw notFound('Note not found.'); row.items = (await db().query(`SELECT ${itemColumns} FROM credit_note_items WHERE credit_note_id=$1 ORDER BY position`, [row.id])).rows; return row; }));
router.post('/credit-notes', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const b = req.body || {}; const invoice = (await client.query('SELECT * FROM invoices WHERE id=$1 AND status=$2 FOR UPDATE', [id(b.invoiceId), 'active'])).rows[0]; if (!invoice) throw new Error('Choose an active invoice.');
  const docDate = date(b.date); if (docDate < invoice.date) throw new Error('The note date cannot be before the invoice date.');
  const fy = await fyFor(client, docDate); const settings = await company(client); const isNonGst = invoice.is_nongst; const type = b.noteType === 'D' ? 'D' : 'C';
  const totals = calculate(b.items, isNonGst, settings.state_code, invoice.place_of_supply_state_code);
  if (type === 'C') {
    // Credit notes on one invoice together cannot exceed the invoice (ERP CreditNoteService).
    const credited = Number((await client.query(`SELECT COALESCE(SUM(grand_total),0) AS n FROM credit_notes WHERE invoice_id=$1 AND note_type='C' AND status='active'`, [invoice.id])).rows[0].n);
    if (credited + totals.grandTotal > Number(invoice.grand_total)) throw new Error(`Credit note total (₹${(totals.grandTotal / 100).toFixed(2)}) exceeds what is left on the invoice (₹${((Number(invoice.grand_total) - credited) / 100).toFixed(2)}). Reduce the quantity or amount.`);
  }
  const number = await nextNumber(client, isNonGst ? 'nongst_credit_note' : 'credit_note', fy.id, isNonGst ? settings.nongst_credit_note_prefix : settings.credit_note_prefix, fy.label);
  const voucher = (await client.query(`INSERT INTO vouchers (voucher_type,voucher_no,financial_year_id,date,narration,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [type === 'C' ? 'CreditNote' : 'DebitNote', number, fy.id, docDate, text(b.reason) || `${type === 'C' ? 'Credit' : 'Debit'} note against ${invoice.invoice_no}`, req.user.id])).rows[0];
  const note = (await client.query(`INSERT INTO credit_notes (voucher_id,note_no,note_type,invoice_id,client_ledger_id,financial_year_id,date,is_nongst,taxable,cgst,sgst,igst,round_off,grand_total,reason,narration,created_by,subject,site_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,note_no AS "noteNo",public_token AS "publicToken"`, [voucher.id, number, type, invoice.id, invoice.client_ledger_id, fy.id, docDate, isNonGst, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.roundOff, totals.grandTotal, text(b.reason), text(b.narration), req.user.id, text(b.subject ?? invoice.subject, 500), text(b.siteReference ?? invoice.site_reference, 200)])).rows[0];
  await insertItems(client, 'credit_note_items', 'credit_note_id', note.id, totals);
  const entries = saleEntries(invoice.client_ledger_id, totals, await systemLedgers(client));
  await postEntries(client, voucher.id, type === 'C' ? flip(entries) : entries);
  if (type === 'C') {
    // Settle the invoice by the note value so its outstanding drops (ERP allocates the note like a receipt).
    const outstanding = Number(invoice.grand_total) - Number((await client.query('SELECT COALESCE(SUM(amount),0) AS n FROM allocations WHERE invoice_id=$1', [invoice.id])).rows[0].n);
    const settle = Math.min(outstanding, totals.grandTotal);
    if (settle > 0) await client.query('INSERT INTO allocations (voucher_id, invoice_id, amount) VALUES ($1,$2,$3)', [voucher.id, invoice.id, settle]);
  }
  return { ...note, totals };
}), 201));
router.post('/credit-notes/:id/cancel', requirePermission('bills_quotes'), (req: any, res) => query(res, () => tx(async (client) => {
  const note = (await client.query('SELECT * FROM credit_notes WHERE id=$1 FOR UPDATE', [id(req.params.id)])).rows[0]; if (!note) throw notFound('Note not found.'); if (note.status !== 'active') throw new Error('This note is already cancelled.');
  const reversalDate = date(req.body?.date || note.date); if (reversalDate < note.date) throw new Error('Cancellation date cannot be before the note date.');
  const fy = await fyFor(client, reversalDate); const reversalNo = await nextNumber(client, 'note_reversal', fy.id, 'REV-CN', fy.label);
  const reversal = (await client.query(`INSERT INTO vouchers (voucher_type,voucher_no,financial_year_id,date,narration,created_by) VALUES ('Note Reversal',$1,$2,$3,$4,$5) RETURNING id`, [reversalNo, fy.id, reversalDate, `Reversal of ${note.note_no}`, req.user.id])).rows[0];
  const entries = (await client.query('SELECT ledger_id, dr::bigint AS dr, cr::bigint AS cr FROM voucher_entries WHERE voucher_id=$1', [note.voucher_id])).rows.map((e): Entry => [e.ledger_id, Number(e.dr), Number(e.cr)]);
  await postEntries(client, reversal.id, flip(entries));
  await client.query('DELETE FROM allocations WHERE voucher_id=$1', [note.voucher_id]);
  await client.query(`UPDATE credit_notes SET status='cancelled' WHERE id=$1`, [note.id]);
  return { ok: true, reversalNo };
})));

const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rupee = (paise: unknown) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayDate = (iso: unknown) => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const belowHundred = (n: number) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
const belowThousand = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ');
// Indian grouping: crore, lakh, thousand, hundred.
const words = (n: number): string => { if (!n) return 'Zero'; const parts: string[] = []; const crore = Math.floor(n / 1e7); if (crore) parts.push(`${words(crore)} Crore`); const lakh = Math.floor((n % 1e7) / 1e5); if (lakh) parts.push(`${belowHundred(lakh)} Lakh`); const thousand = Math.floor((n % 1e5) / 1000); if (thousand) parts.push(`${belowHundred(thousand)} Thousand`); if (n % 1000) parts.push(belowThousand(n % 1000)); return parts.join(' '); };
export const amountInWords = (paise: number) => { const r = Math.floor(paise / 100); const p = paise % 100; return `Rupees ${words(r)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`; };

const documentHtml = (doc: any) => {
  const c = doc.company || {}; const gst = !doc.is_nongst; const intra = Number(doc.cgst) + Number(doc.sgst) > 0;
  const cell = (v: unknown, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(v)}</td>`;
  const totalRow = (label: string, value: unknown, strong = false) => `<tr${strong ? ' class="grand"' : ''}><td>${label}</td><td class="num">${escapeHtml(value)}</td></tr>`;
  const refs = serialNumbers(doc.items); const cols = gst ? 8 : 6;
  const qtyText = (q: unknown) => Number(q).toLocaleString('en-IN', { maximumFractionDigits: 3 });
  const lines = doc.items.map((i: any, n: number) => i.kind === 'section'
    ? `<tr class="section"><td class="sr">${escapeHtml(refs[n])}</td><td colspan="${cols - 1}">${escapeHtml(i.description)}</td></tr>`
    : i.kind === 'group'
      ? `<tr><td class="sr">${escapeHtml(refs[n])}</td><td class="desc">${escapeHtml(i.description)}</td><td colspan="${cols - 2}"></td></tr>`
      : `<tr${Number(i.level) === 2 ? ' class="sub"' : ''}><td class="sr">${escapeHtml(refs[n])}</td><td class="desc">${escapeHtml(i.description)}</td>${gst ? cell(i.hsn_sac || '—') : ''}${cell(i.unit || '—', 'unit')}${cell(qtyText(i.qty), 'num')}${cell(i.rate === null ? '—' : rupee(i.rate), 'num')}${cell(i.rate === null ? '—' : rupee(i.line_taxable), 'num')}${gst ? cell(`${i.gst_rate_pct}%`, 'num') : ''}</tr>`).join('');
  const meta = [[doc.kind === 'quotation' ? 'Quotation No.' : doc.kind === 'note' ? 'Note No.' : 'Invoice No.', doc.number], ['Date', displayDate(doc.date)], doc.due_date ? ['Due date', displayDate(doc.due_date)] : null, doc.valid_until ? ['Valid until', displayDate(doc.valid_until)] : null, doc.invoiceNo ? ['Against invoice', doc.invoiceNo] : null, gst ? ['Place of supply', doc.place_of_supply_state_code] : null].filter(Boolean) as string[][];
  const bank = [c.bank_name && `Bank: ${c.bank_name}`, c.account_number && `A/c No: ${c.account_number}`, c.ifsc_code && `IFSC: ${c.ifsc_code}`, c.branch && `Branch: ${c.branch}`, c.upi_id && `UPI: ${c.upi_id}`].filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(doc.number)}</title><style>
body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#1d2b22;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#20364d}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #20364d;padding-bottom:12px;margin-bottom:12px}.muted{color:#5b6b61}.parties{display:flex;justify-content:space-between;gap:24px;margin-bottom:14px}.parties>div{flex:1}
table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;border:1px solid #c9d1cb;text-align:left;vertical-align:top}th{background:#eef2f6;font-size:12px}.num{text-align:right;white-space:nowrap}.meta td{border:none;padding:1px 0 1px 12px}.meta td:first-child{color:#5b6b61;padding-left:0}
.subject{display:flex;justify-content:space-between;gap:24px;margin:0 0 10px;padding:8px 10px;background:#f6f7f5;border-left:3px solid #20364d}.boq .sr{width:46px;text-align:center}.boq .unit{text-align:center;white-space:nowrap}.boq .desc{white-space:pre-wrap}.boq tr.section td{background:#eef2f6;font-weight:bold;text-transform:uppercase;letter-spacing:.03em}.boq tr.sub .sr{color:#5b6b61}.boq thead{display:table-header-group}.boq tr{page-break-inside:avoid}
.bottom{display:flex;justify-content:space-between;gap:24px;margin-top:12px}.totals{width:320px}.totals td{border:none;border-bottom:1px solid #e3e8e4}.grand td{font-weight:bold;font-size:15px;border-top:2px solid #20364d}.terms{white-space:pre-wrap}button{margin-bottom:16px}@media print{button{display:none}body{margin:0}}
</style></head><body><button onclick="print()">Print / Save as PDF</button>
<div class="head"><div>${doc.logo ? `<img src="${escapeHtml(doc.logo)}" alt="" style="max-height:64px;max-width:220px;margin-bottom:6px">` : ''}<h1>${escapeHtml(c.company_name || 'SRA Consultancy')}</h1><div class="muted">${[c.address, [c.city, c.state, c.pincode].filter(Boolean).join(', ')].filter(Boolean).map(escapeHtml).join('<br>')}</div><div class="muted">${[c.phone && `Phone: ${c.phone}`, c.email && `Email: ${c.email}`].filter(Boolean).map(escapeHtml).join(' · ')}</div>${gst && c.gstin ? `<div>GSTIN: <strong>${escapeHtml(c.gstin)}</strong></div>` : ''}</div><div><h2>${escapeHtml(doc.title)}</h2><table class="meta">${meta.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}</table></div></div>
<div class="parties"><div><div class="muted">${doc.kind === 'quotation' ? 'Quotation for' : 'Bill to'}</div><strong>${escapeHtml(doc.clientName)}</strong><div>${[doc.client_address, doc.client_city].filter(Boolean).map(escapeHtml).join(', ')}</div>${doc.client_gstin ? `<div>GSTIN: ${escapeHtml(doc.client_gstin)}</div>` : ''}${doc.client_state_code ? `<div class="muted">State code: ${escapeHtml(doc.client_state_code)}</div>` : ''}</div></div>
${doc.subject || doc.site_reference ? `<div class="subject">${doc.subject ? `<strong>${escapeHtml(doc.subject)}</strong>` : '<span></span>'}${doc.site_reference ? `<span>${escapeHtml(doc.site_reference)}</span>` : ''}</div>` : ''}
<table class="boq"><thead><tr><th class="sr">Sr. No.</th><th>Description</th>${gst ? '<th>HSN/SAC</th>' : ''}<th class="unit">Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>${gst ? '<th class="num">GST</th>' : ''}</tr></thead><tbody>${lines}</tbody></table>
<div class="bottom"><div><p><strong>Amount in words:</strong><br>${escapeHtml(amountInWords(Number(doc.grand_total)))}</p>${bank.length ? `<p><strong>Bank details</strong><br>${bank.map(escapeHtml).join('<br>')}</p>` : ''}</div><table class="totals">${gst ? totalRow('Taxable value', rupee(doc.taxable)) + (intra ? totalRow('CGST', rupee(doc.cgst)) + totalRow('SGST', rupee(doc.sgst)) : totalRow('IGST', rupee(doc.igst))) : totalRow('Sub total', rupee(doc.taxable))}${Number(doc.round_off) ? totalRow('Round off', `${Number(doc.round_off) > 0 ? '+' : '−'}${rupee(Math.abs(Number(doc.round_off)))}`) : ''}${totalRow('Total', rupee(doc.grand_total), true)}</table></div>
${doc.kind === 'note' && (doc.reason || doc.narration) ? `<h2 style="margin-top:18px">Reason</h2><div class="terms">${escapeHtml([doc.reason, doc.narration].filter(Boolean).join(' — '))}</div>` : ''}${doc.notes ? `<h2 style="margin-top:18px">Notes</h2><div class="terms">${escapeHtml(doc.notes)}</div>` : ''}${doc.terms ? `<h2 style="margin-top:18px">Terms</h2><div class="terms">${escapeHtml(doc.terms)}</div>` : ''}
<p class="muted" style="margin-top:28px;text-align:right">For ${escapeHtml(c.company_name || 'SRA Consultancy')}<br><br><br>Authorised signatory</p></body></html>`;
};
const clientCols = `l.name AS "clientName", l.address AS client_address, l.city AS client_city, l.gstin AS client_gstin, l.state_code AS client_state_code`;
const loadDocument = async (where: { kind: 'invoice' | 'quotation' | 'note'; field: 'id' | 'public_token'; value: string }) => {
  const sql = where.kind === 'invoice' ? `SELECT i.*, i.invoice_no AS number, ${clientCols}, CASE WHEN i.is_nongst THEN 'Invoice' ELSE 'Tax Invoice' END AS title FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id WHERE i.${where.field}=$1`
    : where.kind === 'quotation' ? `SELECT q.*, q.quotation_no AS number, ${clientCols}, 'Quotation' AS title FROM quotations q JOIN ledgers l ON l.id=q.client_ledger_id WHERE q.${where.field}=$1${where.field === 'public_token' ? ` AND q.status <> 'cancelled'` : ''}`
    : `SELECT c.*, c.note_no AS number, ${clientCols}, i.invoice_no AS "invoiceNo", CASE WHEN c.note_type='D' THEN 'Debit Note' ELSE 'Credit Note' END AS title FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id JOIN ledgers l ON l.id=c.client_ledger_id WHERE c.${where.field}=$1${where.field === 'public_token' ? ` AND c.status <> 'cancelled'` : ''}`;
  const doc = (await db().query(sql, [where.value])).rows[0]; if (!doc) return null;
  const [table, foreign] = where.kind === 'invoice' ? ['invoice_items', 'invoice_id'] : where.kind === 'quotation' ? ['quotation_items', 'quotation_id'] : ['credit_note_items', 'credit_note_id'];
  doc.items = (await db().query(`SELECT * FROM ${table} WHERE ${foreign}=$1 ORDER BY position`, [doc.id])).rows;
  doc.company = (await db().query('SELECT * FROM company_settings WHERE id=true')).rows[0]; doc.kind = where.kind; doc.logo = await logoDataUri(doc.company?.logo_path);
  return doc;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicDocument = async (token: string) => UUID.test(token) ? (await loadDocument({ kind: 'invoice', field: 'public_token', value: token })) || (await loadDocument({ kind: 'quotation', field: 'public_token', value: token })) || loadDocument({ kind: 'note', field: 'public_token', value: token }) : null;
const sendPdf = async (res: any, doc: any) => { try { const pdf = await renderPdf(documentHtml(doc)); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${String(doc.number).replace(/[^\w.-]+/g, '-')}.pdf"`); res.send(pdf); } catch { res.status(503).json({ error: 'PDF service is temporarily unavailable. Use the printable document view instead.' }); } };
router.get('/public/:token', async (req, res) => { try { const doc = await publicDocument(req.params.token); if (!doc) return res.status(404).send('Document not found.'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"); res.send(documentHtml(doc)); } catch { res.status(500).send('Document could not be loaded.'); } });
router.get('/public/:token/pdf', async (req, res) => { try { const doc = await publicDocument(req.params.token); if (!doc) return res.status(404).send('Document not found.'); await sendPdf(res, doc); } catch { res.status(500).send('Document could not be loaded.'); } });
for (const [path, kind] of [['invoices', 'invoice'], ['quotations', 'quotation'], ['credit-notes', 'note']] as const) {
  router.get(`/${path}/:id/view`, requirePermission('bills_quotes'), async (req, res) => { try { const doc = await loadDocument({ kind, field: 'id', value: id(req.params.id) }); if (!doc) return res.status(404).send('Document not found.'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(documentHtml(doc)); } catch { res.status(400).send('Document could not be loaded.'); } });
  router.get(`/${path}/:id/pdf`, requirePermission('bills_quotes'), async (req, res) => { try { const doc = await loadDocument({ kind, field: 'id', value: id(req.params.id) }); if (!doc) return res.status(404).json({ error: 'Document not found.' }); await sendPdf(res, doc); } catch (error: any) { res.status(400).json({ error: error.message }); } });
}
export default router;
