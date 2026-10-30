// Home page: the ERP's "Financial Report" layout (year / month toggle, highlighted net card,
// income-vs-expense bars, money-breakdown rings, quick actions) with SRA's receivables,
// overdue bills, recent documents and site-estimate shortcut.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Clock, FileSpreadsheet, FileText, Landmark, Plus,
  Receipt, Sparkles, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, compactINR, inr0, localDate, longDate, showDate } from '../lib/format.js';
import { useFY, useSession } from '../context.jsx';
import { Alert, Loading, Page, StatusBadge } from '../components/ui.jsx';

const GOLD = '#8A6634';
const GOLD_LIGHT = '#B98E57';
const OUT = '#D9D4C7';
const RED = '#C2410C';
const OLIVE = '#2E2F28';

function StatCard({ title, value, icon: Icon, accent, highlight, sub, badge, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn('rounded-2xl p-5 text-left shadow-sm transition-shadow hover:shadow-md disabled:cursor-default', highlight ? 'bg-gradient-to-br from-olive to-ink text-white' : 'border border-line bg-white')}>
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: highlight ? 'rgba(185,142,87,0.22)' : `${accent}1a` }}>
          <Icon size={20} style={{ color: highlight ? GOLD_LIGHT : accent }} />
        </div>
        {badge && (
          <span className={cn('flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold', highlight ? 'bg-white/15 text-white' : badge.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500')}>
            {badge.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{badge.text}
          </span>
        )}
      </div>
      <p className={cn('text-2xl font-extrabold tracking-tight', highlight ? 'text-white' : 'text-ink')}>{inr0(value)}</p>
      <p className={cn('mt-1 text-sm font-semibold', highlight ? 'text-[#E9D9BF]' : 'text-[#4A4944]')}>{title}</p>
      {sub && <p className={cn('mt-0.5 text-xs', highlight ? 'text-white/60' : 'text-[#A8A69F]')}>{sub}</p>}
    </button>
  );
}

function RadialRings({ items, centerValue, centerLabel, size = 190 }) {
  const c = size / 2;
  const max = Math.max(...items.map((i) => i.value), 1);
  const radii = [c - 12, c - 30, c - 48];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {items.map((it, idx) => {
          const r = radii[idx] ?? 30;
          const circ = 2 * Math.PI * r;
          const frac = Math.max(0, Math.min(1, it.value / max));
          return (
            <g key={it.label}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="#F0EEE9" strokeWidth={9} />
              <circle cx={c} cy={c} r={r} fill="none" stroke={it.color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${frac * circ} ${circ}`} />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tracking-tight text-ink">{centerValue}</span>
        <span className="text-[11px] font-medium text-[#A8A69F]">{centerLabel}</span>
      </div>
    </div>
  );
}

// Monthly income / expense bars across the selected window.
function MonthBars({ months }) {
  const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between py-1 text-right text-[10px] font-medium text-[#B9B6AD]" style={{ height: 220 }}>
        {ticks.map((t) => <span key={t}>{compactINR(max * t)}</span>)}
      </div>
      <div className="relative flex-1 overflow-x-auto">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-1">{ticks.map((t) => <div key={t} className="border-t border-dashed border-[#EEEDE9]" />)}</div>
        <div className="relative flex min-w-[420px] items-end justify-around gap-2" style={{ height: 240 }}>
          {months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-[220px] items-end justify-center gap-1">
                <div className="w-3 rounded-t-md sm:w-4" style={{ height: `${Math.max((m.income / max) * 100, m.income ? 2 : 0.8)}%`, backgroundColor: GOLD }} title={`Money in: ${inr0(m.income)}`} />
                <div className="w-3 rounded-t-md sm:w-4" style={{ height: `${Math.max((m.expense / max) * 100, m.expense ? 2 : 0.8)}%`, backgroundColor: OUT }} title={`Money out: ${inr0(m.expense)}`} />
              </div>
              <span className="text-[11px] font-semibold text-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, sub, icon: Icon, action, children, className }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-white p-6 shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">{Icon && <Icon size={18} className="text-brand" />}{title}</h2>
          {sub && <p className="text-xs text-[#A8A69F]">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { fy, label: fyLabel, loaded } = useFY();
  const [mode, setMode] = useState('year');
  const [monthIdx, setMonthIdx] = useState(0);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // The 12 months of the selected FY (Apr → Mar).
  const months = useMemo(() => {
    if (!fy) return [];
    const start = new Date(`${fy.startDate}T00:00:00`);
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const e = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
      return { key: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`, from: localDate(s), to: localDate(e), label: s.toLocaleDateString('en-IN', { month: 'short' }), long: s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
    });
  }, [fy]);
  useEffect(() => {
    const today = localDate();
    const idx = months.findIndex((m) => today >= m.from && today <= m.to);
    setMonthIdx(idx >= 0 ? idx : Math.max(0, months.length - 1));
  }, [months]);

  const scope = useMemo(() => {
    if (mode === 'month' && months[monthIdx]) return { from: months[monthIdx].from, to: months[monthIdx].to, label: months[monthIdx].long, isMonth: true };
    return { from: fy?.startDate || '', to: fy?.endDate || '', label: fyLabel, isMonth: false };
  }, [mode, monthIdx, months, fy, fyLabel]);

  useEffect(() => {
    if (!loaded) return undefined;
    const controller = new AbortController();
    setLoading(true);
    const q = new URLSearchParams(Object.entries({ from: scope.from, to: scope.to }).filter(([, v]) => v)).toString();
    api.get(`/dashboard${q ? `?${q}` : ''}`, { signal: controller.signal })
      .then((data) => { setStats(data); setError(''); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [scope.from, scope.to, loaded]);

  if (!stats && loading) return <Loading label="Loading financial data…" />;
  if (error && !stats) return <Page><Alert>{error}</Alert></Page>;

  const income = stats.income; const expense = stats.expense; const net = stats.netProfit; const gst = stats.gstCollected;
  const pct = (part) => (income > 0 ? Math.round((part / income) * 100) : 0);
  const byMonth = Object.fromEntries(stats.monthly.map((m) => [m.month, m]));
  const bars = scope.isMonth
    ? [{ key: 'm', label: months[monthIdx]?.label, income, expense }]
    : months.map((m) => ({ key: m.key, label: m.label, income: byMonth[m.key]?.income || 0, expense: byMonth[m.key]?.expense || 0 }));
  const rings = [
    { label: 'Money In', value: income, color: GOLD },
    { label: 'Money Out', value: expense, color: RED },
    { label: 'GST Collected', value: gst, color: OLIVE },
  ];
  const ringTotal = income + expense + gst || 1;
  const goSales = (tab, create = false, nonGst = false) => navigate(nonGst ? '/non-gst' : '/sales', { state: { tab, create } });
  const actions = [
    can('bills_quotes') && { icon: FileText, title: 'New Invoice', sub: 'Bill a customer', onClick: () => goSales('invoices', true) },
    can('bills_quotes') && { icon: FileSpreadsheet, title: 'New Quotation', sub: 'Send an estimate', onClick: () => goSales('quotations', true) },
    can('estimates') && { icon: Sparkles, title: 'AI Site Estimate', sub: 'From site photos', onClick: () => navigate('/estimates', { state: { create: true } }) },
    can('cash_in') && { icon: Receipt, title: 'Record Receipt', sub: 'Money received', onClick: () => navigate('/receipts', { state: { create: true } }) },
  ].filter(Boolean);

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Financial Report</h1>
          <p className="mt-1 text-sm text-muted">A quick look at your money for {scope.label}</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#A8A69F]">Today</p>
          <p className="text-sm font-bold text-[#4A4944]">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1 shadow-sm">
          {[['year', 'Full Year'], ['month', 'Month']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setMode(key)} className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors', mode === key ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink')}>{label}</button>
          ))}
        </div>
        {mode === 'month' && (
          <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-[#4A4944] shadow-sm outline-none focus:border-brand-gold">
            {months.map((m, i) => <option key={m.key} value={i}>{m.long}</option>)}
          </select>
        )}
        {loading && <span className="text-xs font-medium text-[#A8A69F]">Updating…</span>}
        {!fy && <span className="text-xs font-medium text-amber-700">No financial year yet — create one in Settings.</span>}
      </div>
      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard title="What You Kept" value={net} icon={Wallet} highlight sub={scope.isMonth ? `Net for ${scope.label}` : 'Net profit this year'} badge={{ text: `${pct(net)}%`, positive: net >= 0 }} />
            <StatCard title="Money In" value={income} icon={TrendingUp} accent="#059669" sub={`${stats.sales.count} invoice${stats.sales.count === 1 ? '' : 's'} · ${inr0(stats.received)} received`} />
            <StatCard title="Money Out" value={expense} icon={TrendingDown} accent={RED} sub="of total revenue" badge={{ text: `${pct(expense)}%`, positive: false }} onClick={can('cash_out') ? () => navigate('/expenses') : undefined} />
            <StatCard title="GST Collected" value={gst} icon={Landmark} accent={OLIVE} sub="Output CGST + SGST + IGST" badge={{ text: `${pct(gst)}%`, positive: true }} />
          </div>

          <Panel title="Income vs Expenses" sub={scope.isMonth ? scope.label : 'Month by month'}
            action={<div className="flex items-center gap-4 text-xs font-semibold text-muted"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GOLD }} /> Money In</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OUT }} /> Money Out</span></div>}>
            <MonthBars months={bars} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Money Breakdown" sub="Where your money sits">
            <RadialRings items={rings} centerValue={compactINR(net)} centerLabel="Net kept" />
            <div className="mt-5 space-y-3">
              {rings.map((it) => (
                <div key={it.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-[#4A4944]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} />{it.label}</span>
                  <span className="flex items-center gap-2"><span className="text-sm font-bold text-ink">{compactINR(it.value)}</span><span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-muted">{Math.round((it.value / ringTotal) * 100)}%</span></span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="To Collect" sub="Unpaid customer bills (all years)" icon={Clock}>
            <p className="text-3xl font-extrabold tracking-tight text-ink">{inr0(stats.receivable.total)}</p>
            <p className="mt-1 text-xs text-muted">{stats.receivable.count} open bill{stats.receivable.count === 1 ? '' : 's'}{stats.receivable.overdue > 0 && <> · <span className="font-bold text-red-600">{inr0(stats.receivable.overdue)} overdue</span></>}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-paper p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Open quotes</p><p className="mt-1 font-bold">{stats.openQuotations.count} · {compactINR(stats.openQuotations.total)}</p></div>
              <div className="rounded-xl bg-paper p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Site estimates</p><p className="mt-1 font-bold">{stats.pendingEstimates} pending</p></div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Overdue Bills" icon={AlertTriangle} sub="Past the due date and not fully paid"
          action={can('cash_in') && stats.overdue.length > 0 && <button type="button" onClick={() => navigate('/receipts', { state: { create: true } })} className="text-xs font-bold uppercase tracking-widest text-brand hover:opacity-80">Record receipt →</button>}>
          {stats.overdue.length ? (
            <div className="divide-y divide-line">
              {stats.overdue.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{b.clientName}</p><p className="text-[11px] font-medium uppercase tracking-wider text-[#A8A69F]">{b.invoiceNo} · due {showDate(b.dueDate)}</p></div>
                  <span className="shrink-0 text-sm font-bold text-red-600">{inr0(b.outstanding)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-[#A8A69F]"><BarChart3 size={40} strokeWidth={1} className="mb-2 opacity-30" /><p className="text-sm italic">Nothing overdue. Well done.</p></div>
          )}
        </Panel>

        <Panel title="Quick Actions">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {actions.map((a) => (
              <button key={a.title} type="button" onClick={a.onClick} className="group rounded-xl border border-line p-5 text-left shadow-sm transition-all hover:border-brand-tint hover:bg-brand-soft hover:shadow-md">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft transition-transform group-hover:scale-110"><a.icon size={20} className="text-brand" /></div>
                <p className="flex items-center gap-1 text-sm font-bold text-ink"><Plus size={14} /> {a.title}</p>
                <p className="mt-1 text-xs font-medium text-muted">{a.sub}</p>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-line bg-paper p-4">
            <div className="mb-2 flex items-center gap-2"><Landmark size={16} className="text-[#A8A69F]" /><p className="text-xs font-bold uppercase tracking-widest text-muted">Financial Summary</p></div>
            <p className="text-xs leading-relaxed text-[#4A4944]">You have earned {inr0(income)} in {scope.label}{expense ? ` and spent ${inr0(expense)}` : ''}.{income ? (net > 0 ? ' You are currently profitable.' : ' Watch your expenses to improve margins.') : ' No income has been posted yet.'}</p>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Recent Invoices" icon={FileText} className="lg:col-span-1"
          action={can('bills_quotes') && <button type="button" onClick={() => goSales('invoices')} className="text-xs font-bold uppercase tracking-widest text-brand hover:opacity-80">View all →</button>}>
          <DocList rows={stats.recentInvoices} number="invoiceNo" empty="No invoices yet." />
        </Panel>
        <Panel title="Recent Quotations" icon={FileSpreadsheet} className="lg:col-span-1"
          action={can('bills_quotes') && <button type="button" onClick={() => goSales('quotations')} className="text-xs font-bold uppercase tracking-widest text-brand hover:opacity-80">View all →</button>}>
          <DocList rows={stats.recentQuotations} number="quotationNo" empty="No quotations yet." />
        </Panel>
        <Panel title="Top Customers" icon={Users} sub={scope.label} className="lg:col-span-1">
          {stats.topCustomers.length ? (
            <div className="space-y-3">
              {stats.topCustomers.map((c, i) => {
                const share = stats.topCustomers[0].billed ? Math.round((c.billed / stats.topCustomers[0].billed) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm"><span className="truncate font-semibold text-ink">{i + 1}. {c.name}</span><span className="font-bold">{compactINR(c.billed)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-paper"><div className="h-1.5 rounded-full bg-brand-gold" style={{ width: `${share}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-6 text-center text-sm italic text-[#A8A69F]">No billing in this period.</p>}
        </Panel>
      </div>
    </Page>
  );
}

function DocList({ rows, number, empty }) {
  if (!rows.length) return <p className="py-6 text-center text-sm italic text-[#A8A69F]">{empty}</p>;
  return (
    <div className="divide-y divide-line">
      {rows.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{d.clientName}</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#A8A69F]">{d[number]} · {longDate(d.date)}</p>
          </div>
          <div className="shrink-0 text-right"><p className="text-sm font-bold">{inr0(d.grandTotal)}</p><StatusBadge status={d.status} /></div>
        </div>
      ))}
    </div>
  );
}
