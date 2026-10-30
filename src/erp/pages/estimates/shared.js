// Estimate line maths shared by the review grid, totals and approval checks. While editing,
// amounts are rupee strings (so a half-typed "12." survives); the API takes integer paise.
import { toPaise } from '../../lib/format.js';

export const MAX_PHOTOS = 6;
export const GST_RATES = [0, 5, 12, 18, 28];
export const STATUS_FILTERS = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['analysed', 'Analysed'],
  ['quoted', 'Quoted'],
  ['discarded', 'Discarded'],
];

const rupees = (paise) => (Number(paise) ? String(Number(paise) / 100) : '');
export const num = (v) => Number(v) || 0;
// Keeps only digits and one decimal point (amounts are never negative).
export const cleanAmount = (v) => {
  const s = String(v ?? '').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  return i < 0 ? s : `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '').slice(0, 2)}`;
};
const round2 = (n) => Math.round(n * 100) / 100;

let seq = 0;
const key = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankItem = () => ({ _k: key(), description: '', notes: '', material: '', labour: '', other: '', lowRate: '', highRate: '', rateMode: 'low', customRate: '', included: true, hsnSac: '', gstRatePct: 0 });

export const fromApi = (item) => ({
  _k: key(),
  description: item.description || '',
  notes: item.notes || '',
  material: rupees(item.material),
  labour: rupees(item.labour),
  other: rupees(item.other),
  lowRate: rupees(item.lowRate),
  highRate: rupees(item.highRate),
  rateMode: item.rateMode || 'low',
  customRate: item.customRate == null ? '' : rupees(item.customRate),
  included: item.included !== false,
  hsnSac: item.hsnSac || '',
  gstRatePct: Number(item.gstRatePct || 0),
});

export const toApi = (item) => {
  const low = toPaise(item.lowRate);
  return {
    description: item.description.trim(),
    notes: item.notes || '',
    material: toPaise(item.material),
    labour: toPaise(item.labour),
    other: toPaise(item.other),
    lowRate: low,
    highRate: Math.max(low, toPaise(item.highRate)),
    rateMode: item.rateMode,
    customRate: item.customRate === '' ? null : toPaise(item.customRate),
    included: item.included,
    hsnSac: item.hsnSac || '',
    gstRatePct: Number(item.gstRatePct || 0),
  };
};

// Low total follows material + labour + other (the cost sheet's F = C+D+E) while those change,
// and the high total is lifted so it never sits below the low total.
export const patchItem = (item, patch) => {
  const next = { ...item, ...patch };
  if (['material', 'labour', 'other'].some((k) => k in patch)) {
    const sum = round2(num(next.material) + num(next.labour) + num(next.other));
    next.lowRate = sum ? String(sum) : '';
  }
  if (('lowRate' in next) && !('highRate' in patch) && num(next.highRate) < num(next.lowRate)) next.highRate = next.lowRate;
  if (patch.rateMode === 'custom' && next.customRate === '') next.customRate = String(quotedOf(item) || '');
  return next;
};

// Amount (rupees) the line will be quoted at.
export const quotedOf = (item) => num(item.rateMode === 'high' ? item.highRate : item.rateMode === 'custom' ? item.customRate : item.lowRate);

// Totals in paise for the included lines; contingency is rounded per figure as the server does.
export function estimateTotals(items, contingencyPct, gst) {
  const included = items.filter((i) => i.included);
  const sum = (fn) => included.reduce((n, i) => n + toPaise(fn(i)), 0);
  const pct = num(contingencyPct);
  const cont = (paise) => Math.round((paise * pct) / 100);
  const low = sum((i) => i.lowRate);
  const high = Math.max(low, sum((i) => Math.max(num(i.lowRate), num(i.highRate))));
  const quoted = sum(quotedOf);
  let tax = 0;
  if (gst) {
    tax = included.reduce((n, i) => n + Math.round((toPaise(quotedOf(i)) * Number(i.gstRatePct || 0)) / 100), 0);
    const top = included.reduce((m, i) => Math.max(m, Number(i.gstRatePct || 0)), 0);
    tax += Math.round((cont(quoted) * top) / 100);
  }
  return {
    count: included.length,
    material: sum((i) => i.material),
    labour: sum((i) => i.labour),
    other: sum((i) => i.other),
    low, high, quoted,
    lowCont: cont(low), highCont: cont(high), quotedCont: cont(quoted),
    tax,
  };
}

// The same checks the server runs on approval, so problems show before anyone clicks.
export function approvalIssues(items, gst) {
  const issues = [];
  const blank = items.findIndex((i) => !i.description.trim());
  if (blank >= 0) issues.push(`Line ${blank + 1} needs a description.`);
  const included = items.filter((i) => i.included);
  if (!included.length) issues.push('Include at least one line.');
  const custom = included.find((i) => i.rateMode === 'custom' && i.customRate === '');
  if (custom) issues.push(`Enter the custom amount for “${custom.description || 'a line'}”.`);
  const zero = included.find((i) => !quotedOf(i));
  if (zero && zero !== custom) issues.push(`“${zero.description || 'A line'}” has no amount selected.`);
  if (gst) {
    const missing = included.find((i) => !i.hsnSac);
    if (missing) issues.push(`Choose an HSN/SAC code for “${missing.description || 'a line'}”, or switch to Non-GST.`);
  }
  return issues;
}
