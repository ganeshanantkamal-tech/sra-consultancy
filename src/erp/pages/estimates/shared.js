// Estimate line maths shared by the review grid, totals and approval checks. Lines are BOQ items:
// section, unit, qty and per-unit rates (material + labour + other = low rate); amount = qty × rate.
// While editing, figures are strings (so a half-typed "12." survives); the API takes integer paise.
import { toPaise } from '../../lib/format.js';
import { UNITS } from '../../lib/boq.js';

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
// Keeps only digits and one decimal point (rates and quantities are never negative).
const decimal = (places) => (v) => {
  const s = String(v ?? '').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  return i < 0 ? s : `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '').slice(0, places)}`;
};
export const cleanAmount = decimal(2);
export const cleanQty = decimal(3);
const round2 = (n) => Math.round(n * 100) / 100;

let seq = 0;
const key = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankItem = (section = '') => ({ _k: key(), section, description: '', notes: '', unit: 'LS', qty: '1', material: '', labour: '', other: '', lowRate: '', highRate: '', rateMode: 'low', customRate: '', included: true, hsnSac: '', gstRatePct: 0 });

export const fromApi = (item) => {
  const unit = item.unit || 'LS';
  return {
    _k: key(),
    section: item.section || '',
    description: item.description || '',
    notes: item.notes || '',
    unit,
    _freeUnit: !UNITS.includes(unit),
    qty: String(Number(item.qty) > 0 ? Number(item.qty) : 1),
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
  };
};

export const toApi = (item) => {
  const low = toPaise(item.lowRate);
  return {
    section: item.section.trim(),
    description: item.description.trim(),
    notes: item.notes || '',
    unit: item.unit.trim() || 'LS',
    qty: num(item.qty) || 1,
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

// Per-unit rate (rupees) the line will be quoted at, and its amount in paise: qty × rate, rounded
// per line as the server does.
export const rateOf = (item) => num(item.rateMode === 'high' ? item.highRate : item.rateMode === 'custom' ? item.customRate : item.lowRate);
export const lineAmount = (item, rate = rateOf(item)) => Math.round(num(item.qty) * toPaise(rate));

// Low rate follows material + labour + other per unit (the cost sheet's H = E+F+G) while those
// change, and the high rate is lifted so it never sits below the low rate.
export const patchItem = (item, patch) => {
  const next = { ...item, ...patch };
  if (['material', 'labour', 'other'].some((k) => k in patch)) {
    const sum = round2(num(next.material) + num(next.labour) + num(next.other));
    next.lowRate = sum ? String(sum) : '';
  }
  if (('lowRate' in next) && !('highRate' in patch) && num(next.highRate) < num(next.lowRate)) next.highRate = next.lowRate;
  if (patch.rateMode === 'custom' && next.customRate === '') next.customRate = String(rateOf(item) || '');
  return next;
};

// Sections are contiguous runs of lines sharing a heading, exactly as the Excel sheet and the
// quotation print them. Each group: { name, start, end (exclusive), key, letter }.
export function sectionGroups(items) {
  const groups = [];
  let letters = 0;
  items.forEach((item, index) => {
    const name = item.section.trim();
    const last = groups[groups.length - 1];
    if (last && last.name === name) { last.end = index + 1; return; }
    if (name) letters += 1;
    groups.push({ name, start: index, end: index + 1, key: item._k, letter: name ? String.fromCharCode(64 + ((letters - 1) % 26) + 1) : '' });
  });
  return groups;
}

// Puts lines with the same heading together (stable, in order of first appearance) so a heading
// never prints twice.
export function groupBySection(items) {
  const order = [];
  items.forEach((item) => { const name = item.section.trim(); if (!order.includes(name)) order.push(name); });
  return order.flatMap((name) => items.filter((item) => item.section.trim() === name));
}

// Totals in paise for the included lines (Σ qty × rate); contingency is on the quoted base and
// rounded per figure as the server does.
export function estimateTotals(items, contingencyPct, gst) {
  const included = items.filter((i) => i.included);
  const sum = (fn) => included.reduce((n, i) => n + lineAmount(i, fn(i)), 0);
  const pct = num(contingencyPct);
  const cont = (paise) => Math.round((paise * pct) / 100);
  const low = sum((i) => i.lowRate);
  const high = Math.max(low, sum((i) => Math.max(num(i.lowRate), num(i.highRate))));
  const quoted = sum(rateOf);
  let tax = 0;
  if (gst) {
    tax = included.reduce((n, i) => n + Math.round((lineAmount(i) * Number(i.gstRatePct || 0)) / 100), 0);
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
  const name = (i) => i.description || 'a line';
  const blank = items.findIndex((i) => !i.description.trim());
  if (blank >= 0) issues.push(`Line ${blank + 1} needs a description.`);
  const noQty = items.find((i) => !(num(i.qty) > 0));
  if (noQty) issues.push(`Enter a quantity for “${name(noQty)}”.`);
  const included = items.filter((i) => i.included);
  if (!included.length) issues.push('Include at least one line.');
  const custom = included.find((i) => i.rateMode === 'custom' && i.customRate === '');
  if (custom) issues.push(`Enter the custom rate for “${name(custom)}”.`);
  const zero = included.find((i) => !rateOf(i));
  if (zero && zero !== custom) issues.push(`“${zero.description || 'A line'}” has no rate selected.`);
  if (gst) {
    const missing = included.find((i) => !i.hsnSac);
    if (missing) issues.push(`Choose an HSN/SAC code for “${name(missing)}”, or switch to Non-GST.`);
  }
  return issues;
}
