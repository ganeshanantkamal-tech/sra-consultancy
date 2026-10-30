// HSN / SAC usage summary (ERP HsnSacReports): GST-rate donut, top codes, and the code-wise
// table of active GST invoices (the GSTR-1 HSN summary) for a date range that defaults to the FY.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Download, FileText, Hash, IndianRupee, PieChart, RotateCcw, Tag } from 'lucide-react';
import { api } from '../lib/api.js';
import { downloadCsv, inr, showDate } from '../lib/format.js';
import { useFY } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Input, Page, PageHeader, StatCard } from '../components/ui.jsx';
import { HsnNav, RatePill } from './masters/HsnShared.jsx';

const PALETTE = ['#8A6634', '#B98E57', '#2E2F28', '#059669', '#D97706', '#DC2626', '#66655F'];
const taxOf = (r) => Number(r.cgst) + Number(r.sgst) + Number(r.igst);

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink"><Icon size={18} className="text-brand" /> {title}</h3>
      {children}
    </div>
  );
}

function Donut({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 60; const STROKE = 26; const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" stroke="#F0EEE9" strokeWidth={STROKE} />
          {total > 0 && slices.map((s) => {
            const dash = (s.value / total) * C;
            const el = <circle key={s.label} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth={STROKE} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} />;
            offset += dash;
            return el;
          })}
        </g>
        <text x="80" y="78" textAnchor="middle" fill="#1C1C1A" style={{ fontSize: 20, fontWeight: 800 }}>{total}</text>
        <text x="80" y="95" textAnchor="middle" fill="#66655F" style={{ fontSize: 9, letterSpacing: 1 }}>LINE ITEMS</text>
      </svg>
      <div className="space-y-1.5">
        {!slices.length && <p className="text-sm text-muted">No data</p>}
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-ink">{s.label}</span>
            <span className="text-muted">— {s.value} ({total ? Math.round((s.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-muted">No usage recorded in this period</p>;
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3" title={it.title}>
          <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-ink sm:w-24">{it.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-paper"><div className="h-full rounded bg-brand" style={{ width: `${(it.value / max) * 100}%` }} /></div>
          <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-ink">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function HsnSacReports() {
  const { fy, label: fyLabel, loaded } = useFY();
  const fyRange = useMemo(() => ({ from: fy?.startDate || '', to: fy?.endDate || '' }), [fy]);
  const [range, setRange] = useState(fyRange);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { setRange(fyRange); }, [fyRange]);

  const badRange = range.from && range.to && range.from > range.to;
  useEffect(() => {
    if (!loaded || badRange) return undefined;
    const controller = new AbortController();
    setLoading(true);
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api.get(`/hsn-sac/usage${q ? `?${q}` : ''}`, { signal: controller.signal })
      .then((d) => { setRows(d.map((r, i) => ({ ...r, id: `${r.code}-${r.gstRatePct}-${i}`, tax: taxOf(r) }))); setError(''); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [range, loaded, badRange]);

  const isFy = range.from === fyRange.from && range.to === fyRange.to;
  const periodLabel = isFy && fy ? fyLabel : `${showDate(range.from)} – ${showDate(range.to)}`;
  const totals = useMemo(() => rows.reduce((t, r) => ({ taxable: t.taxable + Number(r.taxable), cgst: t.cgst + Number(r.cgst), sgst: t.sgst + Number(r.sgst), igst: t.igst + Number(r.igst), lines: t.lines + r.lines }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, lines: 0 }), [rows]);
  const codesUsed = new Set(rows.map((r) => r.code)).size;
  const slices = useMemo(() => {
    const byRate = rows.reduce((m, r) => ({ ...m, [r.gstRatePct]: (m[r.gstRatePct] || 0) + r.lines }), {});
    return Object.entries(byRate).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rate, value], i) => ({ label: `${rate}% GST`, value, color: PALETTE[i % PALETTE.length] }));
  }, [rows]);
  const topCodes = useMemo(() => {
    const byCode = rows.reduce((m, r) => ({ ...m, [r.code]: { value: (m[r.code]?.value || 0) + r.lines, title: r.description || r.code } }), {});
    return Object.entries(byCode).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [rows]);

  const exportCsv = () => downloadCsv(`HSN_SAC_Summary_${range.from}_to_${range.to}.csv`,
    ['HSN/SAC', 'Description', 'GST %', 'Invoices', 'Line items', 'Qty', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax'],
    [...rows.map((r) => [r.code, r.description || '', r.gstRatePct, r.invoices, r.lines, r.qty, (r.taxable / 100).toFixed(2), (r.cgst / 100).toFixed(2), (r.sgst / 100).toFixed(2), (r.igst / 100).toFixed(2), (r.tax / 100).toFixed(2)]),
      ['Total', '', '', '', totals.lines, '', (totals.taxable / 100).toFixed(2), (totals.cgst / 100).toFixed(2), (totals.sgst / 100).toFixed(2), (totals.igst / 100).toFixed(2), ((totals.cgst + totals.sgst + totals.igst) / 100).toFixed(2)]]);

  const money = (v) => <span className="tabular-nums">{inr(v)}</span>;
  const columns = useMemo(() => [
    { key: 'code', label: 'Code', sortable: true, primaryLabel: true, render: (v) => <span className="font-mono font-semibold text-ink">{v || '—'}</span> },
    { key: 'description', label: 'Description', sortable: true, secondaryLabel: true,
      render: (v, r) => <span className="text-muted">{v || 'Not in the code list'}<span className="block text-xs">{r.invoices} invoice{r.invoices === 1 ? '' : 's'} · qty {Number(r.qty || 0).toLocaleString('en-IN')}</span></span> },
    { key: 'gstRatePct', label: 'GST %', align: 'center', sortable: true, render: (v) => <RatePill rate={Number(v)} /> },
    { key: 'taxable', label: 'Total Taxable', align: 'right', sortable: true, primaryAmount: true, render: (v) => <span className="font-semibold tabular-nums text-ink">{inr(v)}</span> },
    { key: 'cgst', label: 'CGST', align: 'right', sortable: true, hideOnTablet: true, render: money },
    { key: 'sgst', label: 'SGST', align: 'right', sortable: true, hideOnTablet: true, render: money },
    { key: 'igst', label: 'IGST', align: 'right', sortable: true, hideOnTablet: true, render: money },
    { key: 'tax', label: 'GST Collected', align: 'right', sortable: true, render: money },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-paper px-6 py-3 text-sm">
      <span className="font-bold text-ink">Total · {rows.length} row{rows.length === 1 ? '' : 's'}</span>
      <span className="flex flex-wrap gap-x-5 gap-y-1 tabular-nums text-muted">
        <span>Taxable <strong className="text-ink">{inr(totals.taxable)}</strong></span>
        <span>CGST <strong className="text-ink">{inr(totals.cgst)}</strong></span>
        <span>SGST <strong className="text-ink">{inr(totals.sgst)}</strong></span>
        <span>IGST <strong className="text-ink">{inr(totals.igst)}</strong></span>
      </span>
    </div>
  );

  return (
    <Page>
      <PageHeader icon={Tag} title="HSN / SAC Reports" subtitle={`Code-wise summary of active GST invoices · ${periodLabel}`}
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length} className="w-full sm:w-auto">Export CSV</Button>} />
      <HsnNav value="reports" />

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Calendar size={18} className="text-brand" /> Invoice dates</span>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From date" className="py-2 sm:w-44" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <span className="text-sm text-muted">to</span>
          <Input type="date" aria-label="To date" className="py-2 sm:w-44" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        {!isFy && fy && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setRange(fyRange)}>Reset to FY {fy.label}</Button>}
      </div>
      {badRange && <Alert tone="warning">The “from” date is after the “to” date.</Alert>}
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label="Taxable value" value={loading ? '…' : inr(totals.taxable)} />
        <StatCard icon={FileText} tone="green" label="GST collected" value={loading ? '…' : inr(totals.cgst + totals.sgst + totals.igst)} />
        <StatCard icon={Hash} tone="dark" label="Codes used" value={loading ? '…' : codesUsed} />
        <StatCard icon={BarChart3} tone="amber" label="Line items" value={loading ? '…' : totals.lines} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="GST Rate Breakdown" icon={PieChart}><Donut slices={slices} /></Panel>
        <Panel title="Top Used Codes" icon={BarChart3}><Bars items={topCodes} /></Panel>
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Tag size={17} className="text-brand" /> Code-wise Revenue</h2>
      <DataTable columns={columns} data={rows} isLoading={loading} storageKey="erp_hsn_report_size" searchPlaceholder="Search codes…" minWidth="820px" footer={footer}
        emptyMessage="No GST invoice lines in this period" emptyHint="Widen the date range, or bill with HSN/SAC codes on your GST invoices." />
    </Page>
  );
}
