import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { get, put } from "@vercel/blob";
import { Router } from "express";
import { db, tx } from "./db/pool.js";
import { requirePermission } from "./auth.js";

const router = Router();
const id = (v: unknown) => {
  const x = String(v ?? "");
  if (!/^\d+$/.test(x)) throw new Error("Invalid record id.");
  return x;
};
const date = (v: unknown) => {
  const x = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) throw new Error("Enter a valid date.");
  return x;
};
const text = (v: unknown, max = 2000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const amount = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Amount must be a positive whole number of paise.");
  return n;
};
const run = async (res: any, work: () => Promise<unknown>, status = 200) => {
  try {
    res.status(status).json(await work());
  } catch (error: any) {
    res
      .status(400)
      .json({ error: error.message || "Request could not be completed." });
  }
};
const fy = async (client: any, d: string) => {
  const r = (
    await client.query(
      `SELECT id,label FROM financial_years WHERE status='open' AND start_date <= $1 AND end_date >= $1`,
      [d],
    )
  ).rows[0];
  if (!r) throw new Error("No open financial year covers this date.");
  return r;
};
const next = async (
  client: any,
  kind: string,
  fyId: string,
  prefix: string,
  label: string,
) => {
  const r = (
    await client.query(
      `INSERT INTO sequences(kind,financial_year_id,last_value) VALUES($1,$2,1) ON CONFLICT(kind,financial_year_id) DO UPDATE SET last_value=sequences.last_value+1 RETURNING last_value`,
      [kind, fyId],
    )
  ).rows[0];
  return `${prefix}/${label}/${String(r.last_value).padStart(4, "0")}`;
};
const settings = async (client: any) =>
  (
    await client.query(
      `SELECT receipt_prefix,payment_prefix,expense_prefix,journal_prefix,contra_prefix FROM company_settings WHERE id=true`,
    )
  ).rows[0];
const ledger = async (client: any, ledgerId: string) => {
  const r = (
    await client.query("SELECT id,name,is_client FROM ledgers WHERE id=$1", [
      ledgerId,
    ])
  ).rows[0];
  if (!r) throw new Error("Ledger not found.");
  return r;
};
const insertVoucher = async (
  client: any,
  {
    type,
    number,
    fyId,
    d,
    narration,
    userId,
    entries,
  }: {
    type: string;
    number: string;
    fyId: string;
    d: string;
    narration: string;
    userId: string;
    entries: [string, number, number][];
  },
) => {
  const dr = entries.reduce((n, x) => n + x[1], 0),
    cr = entries.reduce((n, x) => n + x[2], 0);
  if (dr !== cr || !dr) throw new Error("Voucher entries must balance.");
  const v = (
    await client.query(
      `INSERT INTO vouchers(voucher_type,voucher_no,financial_year_id,date,narration,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [type, number, fyId, d, narration, userId],
    )
  ).rows[0];
  for (const [ledgerId, debit, credit] of entries)
    await client.query(
      "INSERT INTO voucher_entries(voucher_id,ledger_id,dr,cr) VALUES($1,$2,$3,$4)",
      [v.id, ledgerId, debit, credit],
    );
  return v;
};

router.get("/outstanding/:clientId", requirePermission("cash_in"), (req, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT i.id,i.invoice_no AS "invoiceNo",i.date,i.due_date AS "dueDate",i.grand_total AS "grandTotal",COALESCE(SUM(a.amount),0) AS allocated,i.grand_total-COALESCE(SUM(a.amount),0) AS outstanding FROM invoices i LEFT JOIN allocations a ON a.invoice_id=i.id WHERE i.client_ledger_id=$1 AND i.status='active' GROUP BY i.id HAVING i.grand_total-COALESCE(SUM(a.amount),0)>0 ORDER BY i.date,i.id`,
          [id(req.params.clientId)],
        )
      ).rows,
  ),
);
router.get("/receipts", requirePermission("cash_in"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT r.id,r.date,r.amount,r.mode,r.reference,r.narration,r.voucher_id AS "voucherId",v.status,r.client_ledger_id AS "clientLedgerId",r.account_ledger_id AS "accountLedgerId",v.voucher_no AS "voucherNo",c.name AS "clientName",a.name AS "accountName" FROM receipts r JOIN vouchers v ON v.id=r.voucher_id JOIN ledgers c ON c.id=r.client_ledger_id JOIN ledgers a ON a.id=r.account_ledger_id ORDER BY r.date DESC,r.id DESC`,
        )
      ).rows,
  ),
);
router.post("/receipts", requirePermission("cash_in"), (req: any, res) =>
  run(
    res,
    () =>
      tx(async (client) => {
        const b = req.body || {},
          d = date(b.date),
          clientId = id(b.clientLedgerId),
          accountId = id(b.accountLedgerId),
          total = amount(b.amount);
        const c = await ledger(client, clientId);
        if (!c.is_client) throw new Error("Choose a customer ledger.");
        await ledger(client, accountId);
        const f = await fy(client, d),
          s = await settings(client),
          number = await next(
            client,
            "receipt",
            f.id,
            s.receipt_prefix,
            f.label,
          );
        let allocations = Array.isArray(b.allocations)
          ? b.allocations.map((a: any) => ({
              invoiceId: id(a.invoiceId),
              amount: amount(a.amount),
            }))
          : [];
        if (!allocations.length && b.autoAllocate) {
          const outstanding = (
            await client.query(
              `SELECT i.id,i.grand_total-COALESCE(SUM(a.amount),0) AS outstanding FROM invoices i LEFT JOIN allocations a ON a.invoice_id=i.id WHERE i.client_ledger_id=$1 AND i.status='active' GROUP BY i.id HAVING i.grand_total-COALESCE(SUM(a.amount),0)>0 ORDER BY i.date,i.id`,
              [clientId],
            )
          ).rows;
          let left = total;
          allocations = outstanding
            .map((row: any) => {
              const x = Math.min(left, Number(row.outstanding));
              left -= x;
              return x ? { invoiceId: String(row.id), amount: x } : null;
            })
            .filter(Boolean);
        }
        if (allocations.reduce((n: number, a: any) => n + a.amount, 0) > total)
          throw new Error("Allocations cannot exceed receipt amount.");
        const voucher = await insertVoucher(client, {
          type: "Receipt",
          number,
          fyId: f.id,
          d,
          narration: text(b.narration),
          userId: req.user.id,
          entries: [
            [accountId, total, 0],
            [clientId, 0, total],
          ],
        });
        const receipt = (
          await client.query(
            `INSERT INTO receipts(voucher_id,client_ledger_id,account_ledger_id,date,amount,mode,reference,narration) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,voucher_id AS "voucherId"`,
            [
              voucher.id,
              clientId,
              accountId,
              d,
              total,
              text(b.mode, 30) || "cash",
              text(b.reference, 200),
              text(b.narration),
            ],
          )
        ).rows[0];
        for (const a of allocations) {
          const invoice = (
            await client.query(
              `SELECT id FROM invoices WHERE id=$1 AND client_ledger_id=$2 AND status='active'`,
              [a.invoiceId, clientId],
            )
          ).rows[0];
          if (!invoice) throw new Error("Allocation invoice is invalid.");
          await client.query(
            "INSERT INTO allocations(voucher_id,invoice_id,amount) VALUES($1,$2,$3)",
            [voucher.id, a.invoiceId, a.amount],
          );
        }
        return { ...receipt, voucherNo: number };
      }),
    201,
  ),
);

router.get("/receipts/:id", requirePermission("cash_in"), (req, res) =>
  run(res, async () => {
    const receipt = (
      await db().query(
        `SELECT r.id,r.date,r.amount,r.mode,r.reference,r.narration,r.voucher_id AS "voucherId",v.status,v.voucher_no AS "voucherNo",c.name AS "clientName",a.name AS "accountName" FROM receipts r JOIN vouchers v ON v.id=r.voucher_id JOIN ledgers c ON c.id=r.client_ledger_id JOIN ledgers a ON a.id=r.account_ledger_id WHERE r.id=$1`,
        [id(req.params.id)],
      )
    ).rows[0];
    if (!receipt) throw new Error("Receipt not found.");
    receipt.allocations = (
      await db().query(
        `SELECT a.invoice_id AS "invoiceId",i.invoice_no AS "invoiceNo",i.date,i.grand_total AS "grandTotal",a.amount FROM allocations a JOIN invoices i ON i.id=a.invoice_id WHERE a.voucher_id=$1 ORDER BY i.date`,
        [receipt.voucherId],
      )
    ).rows;
    return receipt;
  }),
);
router.get("/expenses", requirePermission("cash_out"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT e.id,e.date,e.amount,e.category,e.vendor,e.reference,e.narration,e.is_capex AS "isCapex",e.voucher_id AS "voucherId",v.status,e.expense_ledger_id AS "expenseLedgerId",e.account_ledger_id AS "accountLedgerId",(SELECT count(*)::int FROM attachments t WHERE t.owner_kind='expense' AND t.owner_id=e.id) AS attachments,v.voucher_no AS "voucherNo",x.name AS "expenseLedger",a.name AS "accountName" FROM expenses e JOIN vouchers v ON v.id=e.voucher_id JOIN ledgers x ON x.id=e.expense_ledger_id JOIN ledgers a ON a.id=e.account_ledger_id ORDER BY e.date DESC,e.id DESC`,
        )
      ).rows,
  ),
);
router.post("/expenses", requirePermission("cash_out"), (req: any, res) =>
  run(
    res,
    () =>
      tx(async (client) => {
        const b = req.body || {},
          d = date(b.date),
          total = amount(b.amount),
          expenseId = id(b.expenseLedgerId),
          accountId = id(b.accountLedgerId);
        await ledger(client, expenseId);
        await ledger(client, accountId);
        const f = await fy(client, d),
          s = await settings(client),
          type = b.isCapex ? "Capital Expenditure" : "Expense",
          number = await next(
            client,
            b.isCapex ? "capex" : "expense",
            f.id,
            s.expense_prefix,
            f.label,
          ),
          voucher = await insertVoucher(client, {
            type,
            number,
            fyId: f.id,
            d,
            narration: text(b.narration),
            userId: req.user.id,
            entries: [
              [expenseId, total, 0],
              [accountId, 0, total],
            ],
          });
        return (
          await client.query(
            `INSERT INTO expenses(voucher_id,expense_ledger_id,account_ledger_id,date,amount,category,vendor,reference,narration,is_capex) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,voucher_id AS "voucherId"`,
            [
              voucher.id,
              expenseId,
              accountId,
              d,
              total,
              text(b.category, 100),
              text(b.vendor, 200),
              text(b.reference, 200),
              text(b.narration),
              Boolean(b.isCapex),
            ],
          )
        ).rows.map((row: any) => ({ ...row, voucherNo: number }))[0];
      }),
    201,
  ),
);
router.get(
  "/expenses/:id/attachments",
  requirePermission("cash_out"),
  (req, res) =>
    run(
      res,
      async () =>
        (
          await db().query(
            `SELECT id,filename,content_type AS "contentType",created_at AS "createdAt" FROM attachments WHERE owner_kind='expense' AND owner_id=$1 ORDER BY id`,
            [id(req.params.id)],
          )
        ).rows,
    ),
);
router.get(
  "/expenses/:id/attachments/:attachmentId",
  requirePermission("cash_out"),
  async (req, res) => {
    try {
      const row = (
        await db().query(
          `SELECT pathname,content_type,filename FROM attachments WHERE owner_kind='expense' AND owner_id=$1 AND id=$2`,
          [id(req.params.id), id(req.params.attachmentId)],
        )
      ).rows[0];
      if (!row) return res.status(404).json({ error: "Bill not found." });
      const blob = await get(row.pathname, { access: "private", useCache: false });
      if (!blob?.stream) return res.status(404).json({ error: "Bill file is missing from storage." });
      res.setHeader("Content-Type", row.content_type);
      res.setHeader("Content-Disposition", `inline; filename="${String(row.filename).replace(/[^\w.-]+/g, "-")}"`);
      res.send(Buffer.from(await new Response(blob.stream).arrayBuffer()));
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Bill could not be opened." });
    }
  },
);
router.post(
  "/expenses/:id/attachments",
  requirePermission("cash_out"),
  (req, res) =>
    run(res, () =>
      tx(async (client) => {
        const expenseId = id(req.params.id),
          b = req.body || {};
        if (
          !(
            await client.query(
              "SELECT id FROM expenses WHERE id=$1 FOR UPDATE",
              [expenseId],
            )
          ).rows[0]
        )
          throw new Error("Expense not found.");
        const contentType = text(b.contentType, 100),
          buffer = Buffer.from(String(b.data || ""), "base64");
        if (!buffer.length || buffer.length > 4 * 1024 * 1024)
          throw new Error("Attachment must be under 4 MB.");
        if (!process.env.BLOB_READ_WRITE_TOKEN)
          throw new Error("Blob storage is not configured.");
        const ext =
            contentType === "application/pdf"
              ? "pdf"
              : contentType === "image/png"
                ? "png"
                : "jpg",
          pathname = `expenses/${expenseId}/${Date.now()}-${randomUUID()}.${ext}`;
        await put(pathname, buffer, {
          access: "private",
          contentType,
          addRandomSuffix: false,
        });
        return (
          await client.query(
            `INSERT INTO attachments(owner_kind,owner_id,pathname,content_type,filename) VALUES('expense',$1,$2,$3,$4) RETURNING id,pathname`,
            [
              expenseId,
              pathname,
              contentType,
              text(b.filename, 200) || `bill.${ext}`,
            ],
          )
        ).rows[0];
      }),
    ),
);

const postManual = (
  kind: "Journal" | "Contra",
  permission: "accounts" | "cash_out",
  prefixKey: "journal_prefix" | "contra_prefix",
) =>
  router.post(
    kind === "Journal" ? "/journals" : "/contra",
    requirePermission(permission),
    (req: any, res) =>
      run(
        res,
        () =>
          tx(async (client) => {
            const b = req.body || {},
              d = date(b.date),
              entries = (Array.isArray(b.entries) ? b.entries : []).map(
                (e: any) =>
                  [id(e.ledgerId), Number(e.dr || 0), Number(e.cr || 0)] as [
                    string,
                    number,
                    number,
                  ],
              );
            if (
              entries.length < 2 ||
              entries.some(
                (e: any) =>
                  !Number.isSafeInteger(e[1]) ||
                  !Number.isSafeInteger(e[2]) ||
                  e[1] < 0 ||
                  e[2] < 0 ||
                  (e[1] === 0) === (e[2] === 0),
              )
            )
              throw new Error("Enter at least two valid debit/credit entries.");
            const f = await fy(client, d),
              s = await settings(client),
              number = await next(
                client,
                kind.toLowerCase(),
                f.id,
                s[prefixKey],
                f.label,
              );
            return {
              ...(await insertVoucher(client, {
                type: kind,
                number,
                fyId: f.id,
                d,
                narration: text(b.narration),
                userId: req.user.id,
                entries,
              })),
              voucherNo: number,
            };
          }),
        201,
      ),
  );
postManual("Journal", "accounts", "journal_prefix");
postManual("Contra", "cash_out", "contra_prefix");
router.get("/vouchers", requirePermission("accounts"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT id,voucher_type AS "voucherType",voucher_no AS "voucherNo",date,narration,status FROM vouchers ORDER BY date DESC,id DESC LIMIT 300`,
        )
      ).rows,
  ),
);
router.post(
  "/vouchers/:id/void",
  requirePermission("accounts"),
  (req: any, res) =>
    run(res, () =>
      tx(async (client) => {
        const original = (
          await client.query(
            `SELECT v.*,f.label FROM vouchers v JOIN financial_years f ON f.id=v.financial_year_id WHERE v.id=$1 FOR UPDATE`,
            [id(req.params.id)],
          )
        ).rows[0];
        if (!original || original.status !== "posted")
          throw new Error("Only posted vouchers can be voided.");
        const revNo = await next(
            client,
            "reversal",
            original.financial_year_id,
            "REV",
            original.label,
          ),
          entries = (
            await client.query(
              "SELECT ledger_id,dr,cr FROM voucher_entries WHERE voucher_id=$1",
              [original.id],
            )
          ).rows.map(
            (e: any) =>
              [String(e.ledger_id), Number(e.cr), Number(e.dr)] as [
                string,
                number,
                number,
              ],
          );
        const reversal = await insertVoucher(client, {
          type: `${original.voucher_type} Reversal`,
          number: revNo,
          fyId: original.financial_year_id,
          d: date(req.body?.date || original.date),
          narration: `Reversal of ${original.voucher_no}`,
          userId: req.user.id,
          entries,
        });
        // Allocations are payment effects, not immutable document metadata.  A
        // voided receipt must release its invoices before reports are run.
        await client.query(`DELETE FROM allocations WHERE voucher_id=$1`, [
          original.id,
        ]);
        await client.query(`UPDATE vouchers SET status='void' WHERE id=$1`, [
          original.id,
        ]);
        return { ok: true, reversalNo: revNo, reversalVoucherId: reversal.id };
      }),
    ),
);

const hash = (values: unknown[]) =>
  createHash("sha256").update(values.join("|")).digest("hex");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Indian bank statements write dates day-first: 05/04/2026, 05-04-26, 05-Apr-2026, 05 Apr 2026.
const day = (value: any) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-. ]([a-z]{3,9}|\d{1,2})[\/\-. ,]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = Number(m[1]);
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // Reject impossible dates such as 31/02 (Date would roll them into March).
    if (month >= 1 && month <= 12 && d >= 1 && d <= 31 && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso) return iso;
  }
  throw new Error(`Cannot read bank date: ${s}`);
};
// RFC 4180-style CSV: quoted cells may hold commas, newlines and doubled quotes; empty cells
// are kept so separate Debit / Credit columns stay aligned.
const csv = (source: string) => {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
};
router.get("/bank/ledgers", requirePermission("bank"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT l.id,l.name FROM ledgers l JOIN account_groups g ON g.id=l.group_id WHERE g.name='Bank Accounts' ORDER BY l.name`,
        )
      ).rows,
  ),
);
router.get("/bank/transactions", requirePermission("bank"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT b.id,b.date,b.description,b.reference,b.amount,b.balance,b.status,b.bank_ledger_id AS "bankLedgerId",l.name AS "bankName",b.matched_voucher_id AS "voucherId",v.voucher_no AS "voucherNo",v.voucher_type AS "voucherType" FROM bank_transactions b JOIN ledgers l ON l.id=b.bank_ledger_id LEFT JOIN vouchers v ON v.id=b.matched_voucher_id ORDER BY b.date DESC,b.id DESC LIMIT 500`,
        )
      ).rows,
  ),
);
router.post("/bank/import", requirePermission("bank"), (req: any, res) =>
  run(res, () =>
    tx(async (client) => {
      const b = req.body || {},
        bankId = id(b.bankLedgerId),
        filename = text(b.filename, 200),
        buffer = Buffer.from(String(b.data || ""), "base64");
      await ledger(client, bankId);
      if (!buffer.length) throw new Error("Choose a bank statement file.");
      let rows: any[][] = [];
      if (filename.toLowerCase().endsWith(".xlsx")) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        workbook.worksheets[0]?.eachRow((row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values as any[]);
        });
      } else rows = csv(buffer.toString("utf8"));
      if (rows.length < 2) throw new Error("Statement has no transactions.");
      const headers = rows.shift()!.map((h) =>
        String(h)
          .toLowerCase()
          .replace(/[^a-z]/g, ""),
      );
      const at = (row: any[], names: string[]) => {
        const i = headers.findIndex((h) => names.includes(h));
        return i >= 0 ? row[i] : "";
      };
      const statement = (
        await client.query(
          `INSERT INTO bank_statements(bank_ledger_id,filename,imported_by) VALUES($1,$2,$3) RETURNING id`,
          [bankId, filename, req.user.id],
        )
      ).rows[0];
      let added = 0,
        skipped = 0;
      for (const row of rows) {
        try {
          const d = day(at(row, ["date", "txndate", "transactiondate", "trandate", "valuedate", "valuedt", "postingdate"])),
            description = text(
              at(row, ["description", "narration", "particulars", "details", "remarks", "transactiondetails", "transactionremarks"]),
              1000,
            ),
            reference = text(
              at(row, ["reference", "ref", "refno", "chequeno", "chqno", "chqrefno", "chequerefno", "utr", "transactionid"]),
              200,
            ),
            debit =
              Number(
                String(at(row, ["debit", "debitamount", "withdrawal", "withdrawals", "withdrawalamt", "withdrawalamount", "dr"])).replace(
                  /[,₹\s]/g,
                  "",
                ),
              ) || 0,
            credit =
              Number(
                String(at(row, ["credit", "creditamount", "deposit", "deposits", "depositamt", "depositamount", "cr"])).replace(
                  /[,₹\s]/g,
                  "",
                ),
              ) || 0,
            raw =
              Number(String(at(row, ["amount"])).replace(/[,₹\s]/g, "")) || 0,
            balanceRaw = at(row, ["balance", "closingbalance", "runningbalance"]);
          const signed = Math.round((credit || raw || -debit) * 100);
          if (!description || !signed) continue;
          const dedupe = hash([bankId, d, description, reference, signed]);
          const candidate = (
            await client.query(
              `SELECT v.id FROM vouchers v JOIN voucher_entries e ON e.voucher_id=v.id WHERE e.ledger_id=$1 AND v.status='posted' AND v.date BETWEEN $2::date-7 AND $2::date+7 AND ABS(e.dr-e.cr)=$3 LIMIT 1`,
              [bankId, d, Math.abs(signed)],
            )
          ).rows[0];
          const result = await client.query(
            `INSERT INTO bank_transactions(statement_id,bank_ledger_id,date,description,reference,amount,balance,dedupe_hash,status,matched_voucher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(dedupe_hash) DO NOTHING RETURNING id`,
            [
              statement.id,
              bankId,
              d,
              description,
              reference,
              signed,
              balanceRaw
                ? Math.round(
                    Number(String(balanceRaw).replace(/[,₹\s]/g, "")) * 100,
                  )
                : null,
              dedupe,
              candidate ? "matched" : "unmatched",
              candidate?.id || null,
            ],
          );
          if (result.rows[0]) added++;
          else skipped++;
        } catch {
          skipped++;
        }
      }
      return { imported: added, skipped };
    }),
  ),
);
router.post(
  "/bank/transactions/:id/match",
  requirePermission("bank"),
  (req, res) =>
    run(res, async () => {
      const voucherId = id(req.body?.voucherId);
      const updated = (
        await db().query(
          `UPDATE bank_transactions SET status='matched',matched_voucher_id=$1 WHERE id=$2 AND status<>'ignored' RETURNING id`,
          [voucherId, id(req.params.id)],
        )
      ).rows[0];
      if (!updated) throw new Error("Bank transaction not found.");
      return { ok: true };
    }),
);
// Vouchers that could explain a bank line: same amount on the same bank ledger, nearest date first.
router.get(
  "/bank/transactions/:id/candidates",
  requirePermission("bank"),
  (req, res) =>
    run(res, async () => {
      const line = (
        await db().query("SELECT bank_ledger_id,date,amount FROM bank_transactions WHERE id=$1", [id(req.params.id)])
      ).rows[0];
      if (!line) throw new Error("Bank transaction not found.");
      return (
        await db().query(
          `SELECT v.id,v.voucher_no AS "voucherNo",v.voucher_type AS "voucherType",v.date,v.narration,(e.dr-e.cr)::bigint AS amount,abs(v.date-$2::date) AS "daysApart",(SELECT string_agg(o.name, ', ') FROM voucher_entries x JOIN ledgers o ON o.id=x.ledger_id WHERE x.voucher_id=v.id AND x.ledger_id<>$1) AS party,EXISTS(SELECT 1 FROM bank_transactions t WHERE t.matched_voucher_id=v.id) AS "alreadyMatched" FROM vouchers v JOIN voucher_entries e ON e.voucher_id=v.id WHERE e.ledger_id=$1 AND v.status='posted' AND (e.dr-e.cr)=$3 AND v.date BETWEEN $2::date-45 AND $2::date+45 ORDER BY abs(v.date-$2::date),v.id LIMIT 10`,
          [line.bank_ledger_id, line.date, line.amount],
        )
      ).rows;
    }),
);
router.post(
  "/bank/transactions/:id/unignore",
  requirePermission("bank"),
  (req, res) =>
    run(res, async () => {
      const updated = (
        await db().query(`UPDATE bank_transactions SET status='unmatched' WHERE id=$1 AND status='ignored' RETURNING id`, [id(req.params.id)])
      ).rows[0];
      if (!updated) throw new Error("Only ignored bank lines can be restored.");
      return { ok: true };
    }),
);
router.post(
  "/bank/transactions/:id/ignore",
  requirePermission("bank"),
  (req, res) =>
    run(res, async () => {
      const updated = (
        await db().query(
          `UPDATE bank_transactions SET status='ignored',matched_voucher_id=NULL WHERE id=$1 RETURNING id`,
          [id(req.params.id)],
        )
      ).rows[0];
      if (!updated) throw new Error("Bank transaction not found.");
      return { ok: true };
    }),
);
export default router;
