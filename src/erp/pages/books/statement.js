// Bank statement CSV reader. Bank exports (HDFC, ICICI, SBI, Axis, Kotak…) use many column names,
// title rows above the table, dd/mm/yyyy dates and blank debit/credit cells. The server's own CSV
// reader expects one fixed layout, so CSVs are normalised here first and re-sent as
// Date,Description,Reference,Amount,Balance with ISO dates and a signed amount (+ deposit, − withdrawal).

const SYNONYMS = {
  date: ['transaction date', 'txn date', 'tran date', 'value date', 'posting date', 'post date', 'date'],
  description: ['transaction remarks', 'transaction details', 'narration', 'description', 'particulars', 'details', 'remarks'],
  reference: ['cheque/ref', 'chq/ref', 'reference no', 'ref no', 'reference', 'utr', 'cheque no', 'cheque', 'chq', 'instrument', 'transaction id', 'ref'],
  debit: ['withdrawal amt', 'withdrawal amount', 'withdrawals', 'withdrawal', 'amount debited', 'paid out', 'debit', 'dr'],
  credit: ['deposit amt', 'deposit amount', 'deposits', 'deposit', 'amount credited', 'paid in', 'credit', 'cr'],
  amount: ['transaction amount', 'amount (inr)', 'amount', 'amt'],
  drcr: ['dr/cr', 'cr/dr', 'transaction type', 'indicator', 'type'],
  balance: ['closing balance', 'available balance', 'balance'],
};
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[._]/g, '').replace(/\s+/g, ' ');

function findCol(headers, synonyms) {
  const cells = headers.map(norm);
  for (const syn of synonyms) {
    const n = norm(syn);
    const exact = cells.findIndex((c) => c === n);
    if (exact >= 0) return exact;
    // Short tokens (dr / cr / amt) only match a whole cell, so "Address" never hits "dr".
    if (n.length > 2) {
      const partial = cells.findIndex((c) => c.includes(n));
      if (partial >= 0) return partial;
    }
  }
  return -1;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Indian bank dates → YYYY-MM-DD: 05/04/2026, 05-04-26, 05-Apr-2026, 2026-04-05.
export function parseDate(value) {
  const s = String(value ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ .,]+(\d{2,4})/))) return MONTHS[m[2].toLowerCase()] ? iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : null;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    let d = +m[1]; let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // tolerate mm/dd
    return iso(+m[3], mo, d);
  }
  return null;
}

// "1,23,456.78 Cr" / "(1,200.00)" / "₹1200 Dr" → number, NaN when blank.
export function parseAmount(value) {
  let s = String(value ?? '').trim().replace(/[₹,\s]/g, '').replace(/−/g, '-');
  if (!s) return NaN;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.replace(/[()]/g, ''); }
  if (/cr$/i.test(s)) s = s.replace(/cr$/i, '');
  if (/dr$/i.test(s)) { sign = -1; s = s.replace(/dr$/i, ''); }
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : sign * n;
}

// CSV text → rows of cells, honouring quotes and blank cells.
export function splitCsv(text) {
  return String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const cells = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; } else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  });
}

// → { rows: [{ date, description, reference, amount (₹, signed), balance (₹ | null) }], error }
export function parseStatementCsv(text) {
  const table = splitCsv(text);
  let headerRow = -1;
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const cells = table[i];
    if (findCol(cells, SYNONYMS.date) >= 0 && [SYNONYMS.debit, SYNONYMS.credit, SYNONYMS.amount].some((s) => findCol(cells, s) >= 0)) { headerRow = i; break; }
  }
  if (headerRow < 0) return { rows: [], error: 'Could not find the column headings. The file needs a Date column and either an Amount column or Debit / Credit columns.' };
  const h = table[headerRow];
  const col = Object.fromEntries(Object.entries(SYNONYMS).map(([k, syn]) => [k, findCol(h, syn)]));
  const rows = [];
  for (const row of table.slice(headerRow + 1)) {
    const date = parseDate(row[col.date]);
    if (!date) continue; // totals, blank and footer rows have no date
    let amount = NaN;
    if (col.debit >= 0 || col.credit >= 0) {
      const cr = col.credit >= 0 ? parseAmount(row[col.credit]) : NaN;
      const dr = col.debit >= 0 ? parseAmount(row[col.debit]) : NaN;
      if (!Number.isNaN(cr) && cr !== 0) amount = Math.abs(cr);
      else if (!Number.isNaN(dr) && dr !== 0) amount = -Math.abs(dr);
    }
    if (Number.isNaN(amount) && col.amount >= 0) {
      amount = parseAmount(row[col.amount]);
      const flag = col.drcr >= 0 ? String(row[col.drcr] ?? '').trim().toLowerCase() : '';
      if (!Number.isNaN(amount) && flag.startsWith('d')) amount = -Math.abs(amount);
      else if (!Number.isNaN(amount) && flag.startsWith('c')) amount = Math.abs(amount);
    }
    if (Number.isNaN(amount) || amount === 0) continue;
    const description = (col.description >= 0 ? row[col.description] : '') || 'Bank transaction';
    if (/opening balance|closing balance|balance b\/f|brought forward|carried forward|^total\b/i.test(description)) continue;
    const balance = col.balance >= 0 ? parseAmount(row[col.balance]) : NaN;
    rows.push({ date, description, reference: col.reference >= 0 ? row[col.reference] || '' : '', amount: Math.round(amount * 100) / 100, balance: Number.isNaN(balance) ? null : balance });
  }
  return { rows, error: rows.length ? '' : 'No transactions were found under the column headings.' };
}

// Every cell quoted (and inner quotes swapped) so blank references survive the server's reader.
export function toServerCsv(rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, "'")}"`;
  return [['Date', 'Description', 'Reference', 'Amount', 'Balance'], ...rows.map((r) => [r.date, r.description, r.reference, r.amount.toFixed(2), r.balance == null ? '' : r.balance.toFixed(2)])]
    .map((r) => r.map(q).join(',')).join('\n');
}

export const SAMPLE_CSV = [
  'Date,Description,Reference,Debit,Credit,Balance',
  '01/10/2026,NEFT-PATIL CONSTRUCTIONS-Invoice INV/26-27/0004,UTR HDFCN52026100145,,"1,25,000.00","3,75,000.00"',
  '03/10/2026,UPI-RAVI CONTRACTOR-Site labour,UPI 412345678901,"18,500.00",,"3,56,500.00"',
  '05/10/2026,CHQ DEP-SHREE GANESH HSG SOC,Chq 004512,,"60,000.00","4,16,500.00"',
].join('\n');
