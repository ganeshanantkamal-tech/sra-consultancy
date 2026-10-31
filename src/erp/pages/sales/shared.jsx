// Helpers shared by the Quotations, Sales Invoices and Credit Notes tabs.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { cn, localDate, showDate, toPaise } from '../../lib/format.js';
import { stateName } from '../../lib/states.js';

export const GST_RATES = [0, 5, 12, 18, 28];

// GST-prescribed credit / debit note reasons (ERP list).
export const REASONS = ['01-Sales Return', '02-Post Sale Discount', '03-Deficiency in services', '04-Correction in Invoice', '05-Change in POS', '06-Finalization of Provisional assessment', '07-Others'];

// BOQ line kinds: 'section' and 'group' rows carry only a description; 'item' rows (level 1, or
// 2 for a lettered sub-item) are priced. Quotations may leave a rate blank: it counts 0.
export const isPriced = (line) => line.kind === 'item' || !line.kind;
export const blankRate = (line) => line.rate === '' || line.rate === null || line.rate === undefined;

// Mirrors server/sales.ts calculate(): per-line tax rounding, CGST = floor(tax / 2), rupee round-off.
export function lineMaths(line, nonGst, intra) {
  const taxable = !isPriced(line) || blankRate(line) ? 0 : Math.round(Number(line.qty || 0) * toPaise(line.rate));
  const tax = nonGst ? 0 : Math.round((taxable * Number(line.gstRatePct || 0)) / 100);
  const cgst = nonGst || !intra ? 0 : Math.floor(tax / 2);
  const sgst = nonGst || !intra ? 0 : tax - cgst;
  const igst = nonGst || intra ? 0 : tax;
  return { taxable, tax, cgst, sgst, igst, total: taxable + tax };
}
export function preview(lines, nonGst, intra) {
  const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  let unpriced = 0;
  for (const line of lines) {
    if (!isPriced(line)) continue;
    if (blankRate(line)) { unpriced += 1; continue; }
    const m = lineMaths(line, nonGst, intra);
    t.taxable += m.taxable; t.cgst += m.cgst; t.sgst += m.sgst; t.igst += m.igst;
  }
  const sub = t.taxable + t.cgst + t.sgst + t.igst;
  const grand = Math.round(sub / 100) * 100;
  return { ...t, tax: t.cgst + t.sgst + t.igst, sub, roundOff: grand - sub, grand, unpriced };
}

// API line items (rate in paise, null = blank) → editable lines (rate in rupees, '' = blank).
let nextUid = 0;
export const lineUid = () => { nextUid += 1; return `l${nextUid}`; };
export const toLines = (items = []) => items.map((i) => ({
  uid: lineUid(), kind: ['section', 'group'].includes(i.kind) ? i.kind : 'item', level: Number(i.level) === 2 ? 2 : 1, ref: i.ref || '',
  description: i.description || '', unit: i.unit || '', hsnSac: i.hsnSac || '', qty: i.qty ?? 1,
  rate: i.rate === null || i.rate === undefined ? '' : Number(i.rate) / 100, gstRatePct: Number(i.gstRatePct ?? 18),
}));
export const toItems = (lines, nonGst) => lines.map((l) => {
  const base = { kind: l.kind || 'item', ref: String(l.ref || '').trim(), description: String(l.description).trim() };
  if (!isPriced(l)) return { ...base, level: 1 };
  return { ...base, kind: 'item', level: Number(l.level) === 2 ? 2 : 1, unit: String(l.unit || '').trim(), hsnSac: nonGst ? '' : l.hsnSac, qty: Number(l.qty), rate: blankRate(l) ? null : toPaise(l.rate), gstRatePct: nonGst ? 0 : Number(l.gstRatePct) };
});

// The customer's state: their state code, else the first two digits of the GSTIN.
export const clientState = (client) => client?.stateCode || (client?.gstin ? String(client.gstin).slice(0, 2) : '');
export const stateLabel = (code) => (code ? `${code} · ${stateName(code) || 'Unknown state'}` : '—');

// Payment position of an invoice from its settled amount.
export function invoiceStatus(row, today = localDate()) {
  if (row.status === 'cancelled') return 'cancelled';
  const due = Number(row.grandTotal) - Number(row.settled || 0);
  if (due <= 0) return 'paid';
  if (row.dueDate && row.dueDate < today) return 'overdue';
  return Number(row.settled) > 0 ? 'partial' : 'unpaid';
}

// Clients and HSN/SAC codes, loaded once per tab.
export function useMasters() {
  const [clients, setClients] = useState([]);
  const [codes, setCodes] = useState([]);
  const load = useCallback(() => {
    api.get('/clients').then(setClients).catch(() => {});
    api.get('/hsn-sac').then(setCodes).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  return { clients, codes, reload: load };
}

// Copies the public link; falls back to a dialog showing the link when the clipboard is blocked.
export async function copyShareLink(token, { toast, confirm }) {
  const link = `${window.location.origin}/api/erp/public/${token}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Share link copied. Anyone with the link can view the document.');
  } catch {
    confirm({ title: 'Share link', message: 'Copy this link to share the document.', confirmLabel: 'Done', input: { label: 'Public link', defaultValue: link } });
  }
}

// Status filter chips shown beside the table search.
export function FilterChips({ value, onChange, options }) {
  return (
    <div className="scrollbar-none flex max-w-full gap-1.5 overflow-x-auto">
      {options.map(([key, label, count]) => (
        <button key={key} type="button" onClick={() => onChange(key)}
          className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
            value === key ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted hover:border-brand-gold hover:text-ink')}>
          {label}
          {count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', value === key ? 'bg-white/20' : 'bg-paper')}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

// Small summary tile (count / value) above each table.
export function Tile({ label, value, hint, icon: Icon, tone = 'brand', active, onClick }) {
  const tones = { brand: 'bg-brand-soft text-brand', green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600', dark: 'bg-olive text-brand-gold' };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-card transition-all sm:p-4', active ? 'border-brand ring-2 ring-brand-gold/25' : 'border-line', onClick && 'hover:-translate-y-0.5 hover:shadow-md')}>
      {Icon && <span className={cn('hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex', tones[tone])}><Icon size={20} /></span>}
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-muted sm:text-[11px]">{label}</span>
        <span className="mt-0.5 block truncate text-lg font-extrabold tracking-tight text-ink tabular-nums sm:text-xl">{value}</span>
        {hint && <span className="block truncate text-[11px] text-muted">{hint}</span>}
      </span>
    </Tag>
  );
}

export const Money = ({ paise, className }) => <span className={cn('font-bold tabular-nums', Number(paise) < 0 ? 'text-red-600' : 'text-ink', className)}>{`₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>;
// Subject and site of a BOQ document, shown under its number in the lists.
export const Subject = ({ row }) => (row.subject || row.siteReference
  ? <span className="mt-0.5 line-clamp-2 whitespace-normal text-[11px] font-medium leading-snug text-muted" title={[row.subject, row.siteReference].filter(Boolean).join(' · ')}>{row.subject}{row.subject && row.siteReference ? ' · ' : ''}{row.siteReference && <span className="text-brand">{row.siteReference}</span>}</span>
  : null);
export const csvDate = showDate;
export const rupees = (paise) => (Number(paise || 0) / 100).toFixed(2);
