import { Router } from 'express';
import { db } from './db/pool.js';
import { requirePermission } from './auth.js';

const router = Router();
const day = (value: unknown, fallback: string) => { const v = String(value ?? ''); if (!v) return fallback; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Enter a valid date.'); return v; };
const run = async (res: any, action: () => Promise<unknown>) => { try { res.json(await action()); } catch (error: any) { res.status(400).json({ error: error.message || 'Request could not be completed.' }); } };
const n = (v: unknown) => Number(v || 0);

// Home page figures for one date window (a financial year or a month of it). Income and
// expense come from posted vouchers on Income / Expense ledgers, like the ERP's P&L.
router.get('/dashboard', requirePermission('dashboard'), (req, res) => run(res, async () => {
  const from = day(req.query.from, '1900-01-01'); const to = day(req.query.to, '9999-12-31');
  const totals = (await db().query(`SELECT
      COALESCE(SUM(e.cr - e.dr) FILTER (WHERE g.nature='Income'),0)::bigint AS income,
      COALESCE(SUM(e.dr - e.cr) FILTER (WHERE g.nature='Expense'),0)::bigint AS expense,
      COALESCE(SUM(e.cr - e.dr) FILTER (WHERE l.system_key IN ('output_cgst','output_sgst','output_igst')),0)::bigint AS gst
    FROM voucher_entries e JOIN vouchers v ON v.id=e.voucher_id JOIN ledgers l ON l.id=e.ledger_id JOIN account_groups g ON g.id=l.group_id
    WHERE v.status='posted' AND v.date BETWEEN $1 AND $2`, [from, to])).rows[0];
  const monthly = (await db().query(`SELECT to_char(date_trunc('month', v.date), 'YYYY-MM') AS month,
      COALESCE(SUM(e.cr - e.dr) FILTER (WHERE g.nature='Income'),0)::bigint AS income,
      COALESCE(SUM(e.dr - e.cr) FILTER (WHERE g.nature='Expense'),0)::bigint AS expense
    FROM voucher_entries e JOIN vouchers v ON v.id=e.voucher_id JOIN ledgers l ON l.id=e.ledger_id JOIN account_groups g ON g.id=l.group_id
    WHERE v.status='posted' AND v.date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [from, to])).rows;
  const sales = (await db().query(`SELECT count(*)::int AS count, COALESCE(SUM(grand_total),0)::bigint AS total FROM invoices WHERE status='active' AND date BETWEEN $1 AND $2`, [from, to])).rows[0];
  const received = (await db().query(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM receipts r JOIN vouchers v ON v.id=r.voucher_id WHERE v.status='posted' AND r.date BETWEEN $1 AND $2`, [from, to])).rows[0];
  const open = `SELECT i.id, i.invoice_no AS "invoiceNo", i.date, i.due_date AS "dueDate", l.name AS "clientName", i.grand_total AS "grandTotal", (i.grand_total - COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.invoice_id=i.id),0))::bigint AS outstanding FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id WHERE i.status='active'`;
  const receivable = (await db().query(`SELECT count(*) FILTER (WHERE outstanding > 0)::int AS count, COALESCE(SUM(outstanding),0)::bigint AS total, COALESCE(SUM(outstanding) FILTER (WHERE "dueDate" < (now() AT TIME ZONE 'Asia/Kolkata')::date),0)::bigint AS overdue FROM (${open}) x`)).rows[0];
  const overdue = (await db().query(`SELECT * FROM (${open}) x WHERE outstanding > 0 AND "dueDate" < (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY "dueDate" LIMIT 6`)).rows;
  const quotes = (await db().query(`SELECT count(*)::int AS count, COALESCE(SUM(grand_total),0)::bigint AS total FROM quotations WHERE status IN ('draft','approved')`)).rows[0];
  const estimates = (await db().query(`SELECT count(*)::int AS count FROM estimates WHERE status IN ('draft','analysed')`)).rows[0];
  const recentInvoices = (await db().query(`SELECT i.id, i.invoice_no AS "invoiceNo", i.date, i.is_nongst AS "isNonGst", i.status, l.name AS "clientName", i.grand_total AS "grandTotal" FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id ORDER BY i.date DESC, i.id DESC LIMIT 6`)).rows;
  const recentQuotations = (await db().query(`SELECT q.id, q.quotation_no AS "quotationNo", q.date, q.status, q.is_nongst AS "isNonGst", l.name AS "clientName", q.grand_total AS "grandTotal" FROM quotations q JOIN ledgers l ON l.id=q.client_ledger_id ORDER BY q.date DESC, q.id DESC LIMIT 6`)).rows;
  const topCustomers = (await db().query(`SELECT l.id, l.name, COALESCE(SUM(i.grand_total),0)::bigint AS billed, count(*)::int AS invoices FROM invoices i JOIN ledgers l ON l.id=i.client_ledger_id WHERE i.status='active' AND i.date BETWEEN $1 AND $2 GROUP BY l.id ORDER BY billed DESC LIMIT 5`, [from, to])).rows;
  return {
    from, to,
    income: n(totals.income), expense: n(totals.expense), netProfit: n(totals.income) - n(totals.expense), gstCollected: n(totals.gst),
    sales: { count: sales.count, total: n(sales.total) }, received: n(received.total),
    receivable: { count: receivable.count, total: n(receivable.total), overdue: n(receivable.overdue) },
    openQuotations: { count: quotes.count, total: n(quotes.total) }, pendingEstimates: estimates.count,
    monthly: monthly.map((m) => ({ month: m.month, income: n(m.income), expense: n(m.expense) })),
    overdue, recentInvoices, recentQuotations, topCustomers,
  };
}));

export default router;
