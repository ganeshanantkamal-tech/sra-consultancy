// Ledger statement (ERP LedgerStatement): period filter defaulting to the selected FY,
// opening / closing rows, running balance, totals, CSV export and an A4 print layout.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Calendar, Download, Printer, RotateCcw } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, drCr, inr, longDate, showDate } from '../lib/format.js';
import { useCompany, useFY } from '../context.jsx';
import { Alert, Button, EmptyState, Input, Loading, Page } from '../components/ui.jsx';
import './masters/statement-print.css';

const money = (paise) => (paise ? inr(paise) : '');
const csvAmount = (paise) => (paise ? (paise / 100).toFixed(2) : '');
const csvBalance = (paise) => `${(Math.abs(paise) / 100).toFixed(2)} ${paise < 0 ? 'Cr' : 'Dr'}`;

export default function LedgerStatement() {
  const { id } = useParams();
  const { fy, loaded } = useFY();
  const { companyName } = useCompany();
  const fyRange = useMemo(() => ({ from: fy?.startDate || '', to: fy?.endDate || '' }), [fy]);
  const [range, setRange] = useState(fyRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setRange(fyRange); }, [fyRange]);
  useEffect(() => {
    if (!loaded || (range.from && range.to && range.from > range.to)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api.get(`/ledgers/${id}/statement${q ? `?${q}` : ''}`, { signal: controller.signal })
      .then((d) => { setData(d); setError(''); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, range, loaded]);

  const badRange = range.from && range.to && range.from > range.to;
  const isFy = range.from === fyRange.from && range.to === fyRange.to;
  const period = data ? `${showDate(range.from || data.from)} to ${showDate(range.to || data.to)}` : '';

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      [showDate(range.from), 'Opening Balance', '', '', '', '', csvBalance(data.openingBalance)],
      ...data.entries.map((e) => [showDate(e.date), e.voucherType, e.voucherNo, [e.against, e.narration].filter(Boolean).join(' — '), csvAmount(e.dr), csvAmount(e.cr), csvBalance(e.balance)]),
      ['', '', '', 'Period Totals', csvAmount(data.totalDr), csvAmount(data.totalCr), ''],
      [showDate(range.to), 'Closing Balance', '', '', '', '', csvBalance(data.closingBalance)],
    ];
    downloadCsv(`${data.ledger.name.replace(/[^\w]+/g, '_')}_Statement_${range.from || 'start'}_to_${range.to || 'today'}.csv`, ['Date', 'Voucher Type', 'Voucher No', 'Particulars', 'Debit (Dr)', 'Credit (Cr)', 'Balance'], rows);
  };
  const print = () => {
    const title = document.title;
    document.title = data ? `${data.ledger.name} statement` : title;
    window.print();
    setTimeout(() => { document.title = title; }, 500);
  };

  if (!data && loading) return <Loading label="Loading statement…" />;
  if (!data) return <Page><Alert>{error || 'Statement not found.'}</Alert><Link to="/ledgers" className="text-sm font-semibold text-brand hover:underline">← Back to Chart of Accounts</Link></Page>;

  const tiles = [
    ['Opening', drCr(data.openingBalance), null],
    ['Total Debit', inr(data.totalDr), ArrowUpRight],
    ['Total Credit', inr(data.totalCr), ArrowDownRight],
    ['Closing', drCr(data.closingBalance), null, true],
  ];

  return (
    <Page className="statement-print mx-auto max-w-6xl">
      <div className="print-header-block hidden">
        <div className="print-header-company">{companyName || 'SRA Consultancy'}</div>
        <p className="print-header-title">Ledger Statement</p>
        <p><strong>Ledger:</strong> {data.ledger.name}</p>
        <p><strong>Group:</strong> {data.ledger.groupName}</p>
        <p><strong>Period:</strong> {period}</p>
      </div>

      <div className="no-print mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/ledgers" className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-white hover:text-ink" title="Back to Chart of Accounts"><ArrowLeft size={22} /></Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{data.ledger.name}</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{data.ledger.groupName} · Ledger statement</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="secondary" icon={Download} onClick={exportCsv} className="flex-1 sm:flex-none">CSV</Button>
          <Button icon={Printer} onClick={print} className="flex-1 sm:flex-none">Print</Button>
        </div>
      </div>

      <div className="no-print mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Calendar size={18} className="text-brand" /> Period</span>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From date" className="py-2 sm:w-44" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <span className="text-sm text-muted">to</span>
          <Input type="date" aria-label="To date" className="py-2 sm:w-44" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        {!isFy && fy && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setRange(fyRange)}>Reset to FY {fy.label}</Button>}
        {loading && <span className="text-xs text-muted sm:ml-auto">Updating…</span>}
      </div>
      {badRange && <Alert tone="warning" className="no-print">The “from” date is after the “to” date.</Alert>}
      <Alert className="no-print">{error}</Alert>

      <div className="no-print mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, Icon, strong]) => (
          <div key={label} className={cn('rounded-2xl border p-4 shadow-card', strong ? 'border-olive bg-gradient-to-br from-olive to-ink text-white' : 'border-line bg-white')}>
            <p className={cn('flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest', strong ? 'text-brand-gold' : 'text-muted')}>{Icon && <Icon size={13} />}{label}</p>
            <p className={cn('mt-1 truncate text-lg font-extrabold tabular-nums', strong ? 'text-white' : 'text-ink')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Desktop (and print): the ERP's ledger table */}
      <div className={cn('stmt-table hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block', loading && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 760 }}>
            <thead className="bg-[#FAFAF8]">
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-3.5 text-left">Date</th>
                <th className="px-5 py-3.5 text-left">Voucher</th>
                <th className="px-5 py-3.5 text-left">Particulars</th>
                <th className="amount-col px-5 py-3.5 text-right">Debit (Dr)</th>
                <th className="amount-col px-5 py-3.5 text-right">Credit (Cr)</th>
                <th className="amount-col px-5 py-3.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-t border-line bg-brand-soft/60">
                <td className="whitespace-nowrap px-5 py-3 text-muted">{showDate(range.from || data.from)}</td>
                <td colSpan={2} className="px-5 py-3 font-bold italic text-brand-dark">Opening Balance</td>
                <td className="amount-col px-5 py-3 text-right tabular-nums">{data.openingBalance > 0 ? inr(data.openingBalance) : ''}</td>
                <td className="amount-col px-5 py-3 text-right tabular-nums">{data.openingBalance < 0 ? inr(-data.openingBalance) : ''}</td>
                <td className="amount-col px-5 py-3 text-right font-bold tabular-nums">{drCr(data.openingBalance)}</td>
              </tr>
              {data.entries.map((e, i) => (
                <tr key={`${e.voucherId}-${i}`} className="border-t border-line transition-colors hover:bg-brand-soft/50">
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{longDate(e.date)}</td>
                  <td className="px-5 py-3"><span className="block font-semibold text-ink">{e.voucherType}</span><span className="block font-mono text-xs text-muted">{e.voucherNo}</span></td>
                  <td className="max-w-xs px-5 py-3"><span className="block text-ink">{e.against || '—'}</span>{e.narration && <span className="block text-xs text-muted">{e.narration}</span>}</td>
                  <td className="amount-col px-5 py-3 text-right tabular-nums">{money(e.dr)}</td>
                  <td className="amount-col px-5 py-3 text-right tabular-nums">{money(e.cr)}</td>
                  <td className="amount-col whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">{drCr(e.balance)}</td>
                </tr>
              ))}
              {data.entries.length === 0 && <tr className="border-t border-line"><td colSpan={6} className="px-5 py-10 text-center italic text-muted">No transactions in this period</td></tr>}
              <tr className="stmt-total-row border-t-2 border-line bg-paper font-bold">
                <td colSpan={3} className="px-5 py-3 text-right text-ink">Period Totals</td>
                <td className="amount-col px-5 py-3 text-right tabular-nums">{inr(data.totalDr)}</td>
                <td className="amount-col px-5 py-3 text-right tabular-nums">{inr(data.totalCr)}</td>
                <td className="amount-col px-5 py-3" />
              </tr>
              <tr className="stmt-total-row border-t border-line bg-paper font-bold">
                <td className="whitespace-nowrap px-5 py-3 text-muted">{showDate(range.to || data.to)}</td>
                <td colSpan={4} className="px-5 py-3 italic text-brand-dark">Closing Balance</td>
                <td className="amount-col px-5 py-3 text-right tabular-nums text-ink">{drCr(data.closingBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Phones: one card per entry */}
      <div className={cn('stmt-cards overflow-hidden rounded-2xl border border-line bg-white shadow-card md:hidden', loading && 'opacity-60')}>
        <div className="flex items-center justify-between bg-brand-soft/60 px-4 py-3 text-sm">
          <span className="font-bold italic text-brand-dark">Opening Balance</span><span className="font-bold tabular-nums">{drCr(data.openingBalance)}</span>
        </div>
        {data.entries.length === 0 ? (
          <EmptyState title="No transactions in this period">Try a wider date range.</EmptyState>
        ) : data.entries.map((e, i) => (
          <div key={`${e.voucherId}-${i}`} className="border-t border-line px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{e.against || e.voucherType}</p>
                <p className="truncate text-xs text-muted">{showDate(e.date)} · {e.voucherType} {e.voucherNo}</p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{e.dr ? `${inr(e.dr)} Dr` : `${inr(e.cr)} Cr`}</p>
            </div>
            {e.narration && <p className="mt-1 text-xs text-muted">{e.narration}</p>}
            <p className="mt-1 text-right text-[11px] text-muted">Balance <span className="font-semibold tabular-nums text-ink">{drCr(e.balance)}</span></p>
          </div>
        ))}
        <div className="space-y-1 border-t-2 border-line bg-paper px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Total Debit</span><span className="font-semibold tabular-nums">{inr(data.totalDr)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Total Credit</span><span className="font-semibold tabular-nums">{inr(data.totalCr)}</span></div>
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-extrabold"><span>Closing Balance</span><span className="tabular-nums">{drCr(data.closingBalance)}</span></div>
        </div>
      </div>
    </Page>
  );
}
