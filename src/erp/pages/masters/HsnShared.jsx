// Pieces shared by the HSN / SAC list and its reports page.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, FileSearch, FileText, FileX2, Layers, Tag } from 'lucide-react';
import { api, openDocument } from '../../lib/api.js';
import { cn, inr, showDate } from '../../lib/format.js';
import { StatusBadge, Tabs } from '../../components/ui.jsx';

export const GST_RATES = [0, 5, 12, 18, 28];

export const RatePill = ({ rate }) => <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">{rate}%</span>;
export const TypePill = ({ type }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', type === 'HSN' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
    {type === 'HSN' ? 'HSN (Goods)' : 'SAC (Services)'}
  </span>
);

// The ERP's HSN tab strip; "Usage summary" is its own route.
export function HsnNav({ value, onChange, counts = {} }) {
  const navigate = useNavigate();
  const tabs = [
    { id: 'all', label: 'All', icon: Layers, count: counts.all },
    { id: 'HSN', label: 'HSN (Goods)', icon: Tag, count: counts.HSN },
    { id: 'SAC', label: 'SAC (Services)', icon: FileText, count: counts.SAC },
    { id: 'lookup', label: 'Code Lookup', icon: FileSearch },
    { id: 'reports', label: 'Usage summary', icon: BarChart3 },
  ];
  const go = (id) => {
    if (id === 'reports') navigate('/hsn-sac/reports');
    else if (onChange) onChange(id);
    else navigate('/hsn-sac', { state: { tab: id } });
  };
  return <Tabs className="mb-4 bg-transparent px-0 sm:px-0" value={value} onChange={go} tabs={tabs} />;
}

// Totals for one code across its GST rates, from /hsn-sac/usage rows.
export const sumUsage = (rows) => rows.reduce((t, r) => ({
  invoices: t.invoices + r.invoices, lines: t.lines + r.lines, qty: t.qty + Number(r.qty || 0),
  taxable: t.taxable + Number(r.taxable), tax: t.tax + Number(r.cgst) + Number(r.sgst) + Number(r.igst),
}), { invoices: 0, lines: 0, qty: 0, taxable: 0, tax: 0 });

// "Used in" panel: what GST invoices in the period billed under this code.
export function CodeUsage({ code, rows, periodLabel }) {
  const t = sumUsage(rows);
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileX2 size={36} strokeWidth={1.25} className="mb-2 text-brand-gold/60" />
        <p className="text-sm font-semibold text-ink">{code} isn’t on any GST invoice in {periodLabel}.</p>
        <p className="mt-0.5 text-xs text-muted">It will show here once it’s used on an invoice line.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Invoices', t.invoices], ['Line items', t.lines], ['Taxable value', inr(t.taxable)], ['GST collected', inr(t.tax)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{k}</p>
            <p className="mt-1 truncate text-lg font-extrabold tabular-nums text-ink">{v}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-[#FAFAF8] text-[10px] font-bold uppercase tracking-widest text-muted">
            <tr>
              <th className="px-3 py-2 text-left">GST rate</th><th className="px-3 py-2 text-right">Invoices</th><th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">CGST + SGST</th><th className="px-3 py-2 text-right">IGST</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gstRatePct} className="border-t border-line">
                <td className="px-3 py-2"><RatePill rate={Number(r.gstRatePct)} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.invoices}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.qty || 0).toLocaleString('en-IN')}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(r.taxable)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(Number(r.cgst) + Number(r.sgst))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(r.igst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The documents behind one code (invoices, quotations, notes) — the ERP's "Used in" list.
const DOC_PATHS = { invoice: ['invoices', 'Invoice'], quotation: ['quotations', 'Quotation'], credit_note: ['credit-notes', 'Note'] };
export function CodeDocuments({ code, from, to }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v)).toString();
    api.get(`/hsn-sac/usage/${encodeURIComponent(code)}${q ? `?${q}` : ''}`).then(setDocs).catch((err) => setError(err.message));
  }, [code, from, to]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!docs) return <p className="text-sm text-muted">Loading documents…</p>;
  if (!docs.length) return null;
  return (
    <div className="mt-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Documents ({docs.length})</p>
      <div className="max-h-72 overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 bg-[#FAFAF8] text-[10px] font-bold uppercase tracking-widest text-muted">
            <tr><th className="px-3 py-2 text-left">Document</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-center">Status</th></tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={`${d.docType}-${d.id}`} className="cursor-pointer border-t border-line hover:bg-brand-soft" onClick={() => openDocument(`/${DOC_PATHS[d.docType][0]}/${d.id}/view`)} title="Open document">
                <td className="px-3 py-2"><span className="font-semibold text-brand">{d.no}</span><span className="ml-1.5 text-[10px] font-bold uppercase text-muted">{DOC_PATHS[d.docType][1]}</span></td>
                <td className="px-3 py-2 tabular-nums">{showDate(d.date)}</td>
                <td className="px-3 py-2">{d.client}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(d.taxable)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(d.tax)}</td>
                <td className="px-3 py-2 text-center"><StatusBadge status={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
