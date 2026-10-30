// Bank reconciliation: the ERP's Bank page — import a statement (CSV / XLSX), status tiles,
// filter chips, and match each line to a receipt / expense voucher or ignore it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownLeft, ArrowUpRight, Check, CircleCheck, Download, EyeOff, FileSpreadsheet, Info, Landmark, Link2, Search, Undo2, Upload,
} from 'lucide-react';
import { api, fileToBase64 } from '../lib/api.js';
import { cn, downloadCsv, inr, showDate, toPaise, toRupees } from '../lib/format.js';
import { useFY, useSession } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, IconButton, Input, Modal, Page, PageHeader, Select, StatCard, StatusBadge, Tag, useFeedback } from '../components/ui.jsx';
import { FilePicker, useVoucherIndex } from './books/common.jsx';
import { SAMPLE_CSV, parseStatementCsv, toServerCsv } from './books/statement.js';

const STATUSES = [['all', 'All'], ['unmatched', 'Unmatched'], ['matched', 'Matched'], ['ignored', 'Ignored']];
const signed = (paise) => (Number(paise) < 0 ? `−${inr(Math.abs(paise))}` : `+${inr(paise)}`);
const daysApart = (a, b) => Math.round(Math.abs(new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);

function ImportModal({ bankLedgers, onClose, onDone }) {
  const { toast } = useFeedback();
  const [bankLedgerId, setBankLedgerId] = useState(bankLedgers[0] ? String(bankLedgers[0].id) : '');
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const file = files[0];
  const isXlsx = file && /\.xlsx$/i.test(file.name);
  useEffect(() => { if (!bankLedgerId && bankLedgers[0]) setBankLedgerId(String(bankLedgers[0].id)); }, [bankLedgers, bankLedgerId]);

  useEffect(() => {
    setPreview(null); setError('');
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Choose a .csv or .xlsx statement file.'); return; }
    if (isXlsx) return;
    file.text().then((text) => {
      const parsed = parseStatementCsv(text);
      setPreview(parsed);
      if (parsed.error) setError(parsed.error);
    });
  }, [file, isXlsx]);

  const deposits = preview?.rows.filter((r) => r.amount > 0).reduce((n, r) => n + r.amount, 0) || 0;
  const withdrawals = preview?.rows.filter((r) => r.amount < 0).reduce((n, r) => n - r.amount, 0) || 0;
  const dates = preview?.rows.map((r) => r.date).sort() || [];
  const ready = bankLedgerId && file && (isXlsx || preview?.rows.length > 0);

  const submit = async (e) => {
    e?.preventDefault();
    if (!bankLedgerId) return setError('Choose the bank account this statement belongs to.');
    if (!ready) return setError('Choose a statement file with at least one transaction.');
    setSaving(true); setError('');
    try {
      // CSVs go up already normalised; Excel files are read by the server as they are.
      const data = isXlsx ? await fileToBase64(file) : await fileToBase64(new Blob([toServerCsv(preview.rows)], { type: 'text/csv' }));
      const result = await api.post('/bank/import', { bankLedgerId, filename: isXlsx ? file.name : file.name.replace(/\.[^.]+$/, '') + '.csv', data });
      toast(`Imported ${result.imported} new line${result.imported === 1 ? '' : 's'}${result.skipped ? ` · ${result.skipped} skipped (already imported or unreadable)` : ''}`, result.imported ? 'success' : 'warning');
      onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  const sample = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
    link.download = 'bank-statement-sample.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <Modal title="Import Bank Statement" icon={Upload} onClose={onClose} busy={saving}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Discard</Button>
        <Button type="submit" form="bank-import-form" icon={Upload} loading={saving} disabled={!ready}>Import &amp; auto-match</Button>
      </>}>
      <form id="bank-import-form" onSubmit={submit} className="space-y-5">
        <Alert onClose={() => setError('')}>{error}</Alert>
        {!bankLedgers.length && <Alert tone="warning">No bank account exists yet. Add a ledger under the Bank Accounts group first.</Alert>}
        <Field label="Bank Account" required>
          <Select required placeholder="Select bank account" value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)}>
            {bankLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Statement File" required>
          <FilePicker files={files} onChange={setFiles} multiple={false} accept=".csv,.xlsx,text/csv" label="Click or drop your statement (CSV or XLSX)" />
        </Field>

        {preview?.rows.length > 0 && (
          <div className="rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#FAFAF8] px-4 py-2.5 text-xs">
              <span className="font-bold text-ink">{preview.rows.length} transaction{preview.rows.length === 1 ? '' : 's'} · {showDate(dates[0])} – {showDate(dates[dates.length - 1])}</span>
              <span className="flex gap-3"><span className="font-semibold text-emerald-600">In {inr(toPaise(deposits))}</span><span className="font-semibold text-red-600">Out {inr(toPaise(withdrawals))}</span></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <tbody>
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{showDate(r.date)}</td>
                      <td className="max-w-[260px] truncate px-2 py-2" title={r.description}>{r.description}</td>
                      <td className={cn('whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums', r.amount < 0 ? 'text-red-600' : 'text-emerald-600')}>{signed(toPaise(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 5 && <p className="border-t border-line px-4 py-2 text-xs text-muted">…and {preview.rows.length - 5} more</p>}
          </div>
        )}
        {isXlsx && <Alert tone="info" className="mb-0">Excel files are read on the server: keep the column names in row 1 (no title rows above) and use the names listed below.</Alert>}

        <div className="rounded-lg border border-brand-tint bg-brand-soft p-4 text-sm text-brand-dark">
          <p className="mb-2 flex items-center gap-1.5 font-semibold"><Info size={15} /> What the statement needs</p>
          <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
            <li><b>Date</b> — also Transaction Date, Value Date, Txn Date. DD/MM/YYYY, DD-MMM-YYYY or YYYY-MM-DD.</li>
            <li><b>Description</b> — also Narration, Particulars, Details, Remarks.</li>
            <li>Money: a single signed <b>Amount</b> (+ deposit, − withdrawal), or separate <b>Debit / Withdrawal</b> and <b>Credit / Deposit</b> columns.</li>
            <li>Optional: <b>Reference</b> (Ref, Cheque No, UTR, Transaction ID) and <b>Balance</b>.</li>
            <li>CSV exports from most banks work as they are; title rows above the headings and opening / closing balance lines are skipped.</li>
            <li>Lines already imported are skipped, and a line is auto-matched when a voucher on this bank has the same amount within 7 days.</li>
          </ul>
          <button type="button" onClick={sample} className="mt-3 flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-dark"><Download size={13} /> Download a sample CSV</button>
        </div>
      </form>
    </Modal>
  );
}

function MatchModal({ txn, vouchers, usedNos, canLookup, onClose, onDone }) {
  const { toast } = useFeedback();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const abs = Math.abs(Number(txn.amount));
  const deposit = Number(txn.amount) > 0;
  const text = `${txn.description} ${txn.reference}`.toLowerCase();
  const [candidates, setCandidates] = useState(null);
  useEffect(() => {
    api.get(`/bank/transactions/${txn.id}/candidates`).then(setCandidates).catch((err) => { setCandidates([]); setError(err.message); });
  }, [txn.id]);

  // Same amount on this bank account, nearest date first; a voucher number found in the bank narration ranks first.
  const suggestions = useMemo(() => (candidates || [])
    .filter((c) => !c.alreadyMatched || c.voucherNo === txn.voucherNo)
    .map((c) => ({ ...c, days: Number(c.daysApart), refHit: text.includes(String(c.voucherNo).toLowerCase()) }))
    .sort((a, b) => Number(b.refHit) - Number(a.refHit) || a.days - b.days)
    .slice(0, 5), [candidates, text, txn.voucherNo]);
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...vouchers.values()]
      .filter((v) => v.status === 'posted' && !/Reversal$|Sales|Credit Note/i.test(v.voucherType) && !usedNos.has(v.voucherNo))
      .filter((v) => !q || `${v.voucherNo} ${v.voucherType} ${v.narration || ''}`.toLowerCase().includes(q))
      .sort((a, b) => daysApart(a.date, txn.date) - daysApart(b.date, txn.date))
      .slice(0, 8);
  }, [vouchers, query, usedNos, txn.date]);

  const match = async (voucherNo, voucherId) => {
    setBusy(voucherNo); setError('');
    try {
      await api.post(`/bank/transactions/${txn.id}/match`, { voucherId });
      toast(`Matched to ${voucherNo}`);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  return (
    <Modal title="Match Bank Line" icon={Link2} onClose={onClose} busy={Boolean(busy)} footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-line bg-paper/60 p-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-tight text-muted">{showDate(txn.date)} · {deposit ? 'Deposit' : 'Withdrawal'}</p>
          <p className="mt-1 break-words text-sm font-semibold text-ink">{txn.description}</p>
          {txn.reference && <p className="mt-0.5 text-xs text-muted">Ref: {txn.reference}</p>}
        </div>
        <p className={cn('shrink-0 text-lg font-bold tabular-nums', deposit ? 'text-emerald-600' : 'text-red-600')}>{signed(txn.amount)}</p>
      </div>
      <>
          <p className="erp-label">Suggested {deposit ? 'receipts' : 'payments'}</p>
          {candidates === null ? (
            <p className="mb-5 px-1 text-sm text-muted">Looking for vouchers of {inr(abs)}…</p>
          ) : suggestions.length ? (
            <div className="mb-5 divide-y divide-line rounded-lg border border-line">
              {suggestions.map((s) => (
                <div key={s.voucherNo} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">{s.voucherNo}{s.refHit && <Tag className="bg-emerald-50 text-emerald-700">Reference matches</Tag>}</p>
                    <p className="truncate text-xs text-muted">{s.voucherType} · {showDate(s.date)}{s.party ? ` · ${s.party}` : ''} · {s.days === 0 ? 'same day' : `${s.days} day${s.days === 1 ? '' : 's'} apart`}</p>
                  </div>
                  <Button size="sm" icon={Check} loading={busy === s.voucherNo} disabled={Boolean(busy)} onClick={() => match(s.voucherNo, s.id)}>Match</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-5 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">No voucher of exactly {inr(abs)} on this bank account within 45 days. {deposit ? 'Record the receipt under Cash In' : 'Record the payment under Cash Out'} first{canLookup ? ', or pick any voucher below' : ''}.</p>
          )}
          {canLookup ? (<>
          <p className="erp-label">Or pick any voucher</p>
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search voucher no., type or narration…" className="pl-9" />
          </div>
          <div className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {others.length ? others.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{v.voucherNo} <span className="font-normal text-muted">· {v.voucherType}</span></p>
                  <p className="truncate text-xs text-muted">{showDate(v.date)}{v.narration ? ` · ${v.narration}` : ''}</p>
                </div>
                <Button size="sm" variant="secondary" loading={busy === v.voucherNo} disabled={Boolean(busy)} onClick={() => match(v.voucherNo, v.id)}>Match</Button>
              </div>
            )) : <p className="px-4 py-6 text-center text-sm text-muted">No vouchers found.</p>}
          </div>
          </>) : <p className="text-xs text-muted">Searching every voucher needs the Accounts permission.</p>}
        </>
    </Modal>
  );
}

export default function Bank() {
  const { can } = useSession();
  const { label: fyLabel, inFy, loaded } = useFY();
  const { toast, confirm } = useFeedback();
  const canLookup = can('accounts');
  const [rows, setRows] = useState([]);
  const [bankLedgers, setBankLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('unmatched');
  const [accountId, setAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(null);
  const [visible, setVisible] = useState([]);
  const [vouchers, reloadVouchers] = useVoucherIndex(canLookup);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, b] = await Promise.all([api.get('/bank/transactions'), api.get('/bank/ledgers')]);
      setRows(t); setBankLedgers(b); setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const hasAccounts = rows.length > 0;
  const fyRows = useMemo(() => rows.filter((r) => inFy(r.date) && (!accountId || String(r.bankLedgerId) === accountId)), [rows, inFy, accountId]);
  const counts = useMemo(() => fyRows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1, all: acc.all + 1 }), { all: 0 }), [fyRows]);
  const shown = useMemo(() => (status === 'all' ? fyRows : fyRows.filter((r) => r.status === status)), [fyRows, status]);
  const latestBalance = useMemo(() => [...fyRows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(b.id) - Number(a.id))).find((r) => r.balance != null), [fyRows]);
  const usedNos = useMemo(() => new Set(rows.filter((r) => r.status === 'matched' && r.voucherNo).map((r) => r.voucherNo)), [rows]);

  const ignore = async (row) => {
    const ok = await confirm({
      title: 'Ignore this bank line?', confirmLabel: 'Ignore line', tone: 'danger',
      message: <>{showDate(row.date)} · {row.description} · <b>{signed(row.amount)}</b><br />It will be left out of reconciliation (bank charges, transfers between your own accounts…). You can restore it later from the Ignored filter.</>,
    });
    if (!ok) return;
    try {
      await api.post(`/bank/transactions/${row.id}/ignore`, {});
      toast('Line ignored');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const restore = async (row) => {
    try {
      await api.post(`/bank/transactions/${row.id}/unignore`, {});
      toast('Line restored to unmatched');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const exportCsv = () => downloadCsv(`Bank_Transactions_${fyLabel.replace(/\s+/g, '_')}.csv`, ['Date', 'Description', 'Reference', 'Withdrawal (₹)', 'Deposit (₹)', 'Balance (₹)', 'Status', 'Matched To'],
    visible.map((r) => [showDate(r.date), r.description, r.reference, r.amount < 0 ? toRupees(-r.amount).toFixed(2) : '', r.amount > 0 ? toRupees(r.amount).toFixed(2) : '', r.balance == null ? '' : toRupees(r.balance).toFixed(2), r.status, r.voucherNo || '']));

  const columns = useMemo(() => [
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true, render: (v, r) => <span className="whitespace-nowrap text-muted">{showDate(v)}<span className="md:hidden">{r.reference ? ` · ${r.reference}` : ''}</span></span> },
    { key: 'description', label: 'Narration', sortable: true, primaryLabel: true, searchValue: (r) => r.reference,
      render: (v, r) => <span className="block max-w-xs leading-tight"><span className="block truncate font-medium text-ink" title={v}>{v}</span>{r.reference && <span className="hidden truncate text-xs text-muted md:block">Ref: {r.reference}</span>}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, primaryAmount: true, sortValue: (r) => Number(r.amount),
      render: (v) => (
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-bold tabular-nums', Number(v) < 0 ? 'text-red-600' : 'text-emerald-600')}>
          {Number(v) < 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}{signed(v)}
        </span>
      ) },
    { key: 'balance', label: 'Balance', align: 'right', hideOnTablet: true, render: (v) => <span className={cn('whitespace-nowrap tabular-nums', Number(v) < 0 ? 'text-red-600' : 'text-muted')}>{v == null ? '—' : inr(v)}</span> },
    { key: 'status', label: 'Status', align: 'center', sortable: true, render: (v) => <StatusBadge status={v} /> },
    { key: 'voucherNo', label: 'Matched To', hideOnTablet: true, render: (v) => (v ? <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-brand"><Link2 size={14} />{v}</span> : <span className="text-muted">—</span>) },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_, r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === 'unmatched' && <IconButton icon={Link2} label="Match to a voucher" tone="success" onClick={() => setMatching(r)} />}
          {r.status === 'matched' && <IconButton icon={Link2} label="Change match" onClick={() => setMatching(r)} />}
          {r.status !== 'ignored' && <IconButton icon={EyeOff} label="Ignore" tone="danger" onClick={() => ignore(r)} />}
          {r.status === 'ignored' && <IconButton icon={Undo2} label="Restore to unmatched" onClick={() => restore(r)} />}
        </div>
      ) },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = (
    <div className="flex flex-wrap items-center gap-2">
      {hasAccounts && bankLedgers.length > 1 && (
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Bank account" className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand-gold">
          <option value="">All bank accounts</option>
          {bankLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      {STATUSES.map(([key, label]) => (
        <button key={key} type="button" onClick={() => setStatus(key)}
          className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', status === key ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted hover:border-brand-gold hover:text-ink')}>
          {label}<span className={cn('rounded-full px-1.5 text-[10px] font-bold', status === key ? 'bg-white/20' : 'bg-paper')}>{counts[key] || 0}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Page>
      <PageHeader icon={Landmark} title="Bank Reconciliation" subtitle={`Tick off your bank statement against the books for ${fyLabel}.`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!visible.length} className="flex-1 sm:flex-none">Export CSV</Button>
          <Button icon={Upload} onClick={() => setImporting(true)} className="flex-1 sm:flex-none"><span className="hidden sm:inline">Import Statement</span><span className="sm:hidden">Import</span></Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={AlertCircle} tone="amber" label="Unreconciled" value={loading ? '…' : counts.unmatched || 0} hint="Requires attention" onClick={() => setStatus('unmatched')} />
        <StatCard icon={CircleCheck} tone="green" label="Reconciled" value={loading ? '…' : counts.matched || 0} hint="Matched to a voucher" onClick={() => setStatus('matched')} />
        <div className="hidden sm:block"><StatCard icon={EyeOff} label="Ignored" value={loading ? '…' : counts.ignored || 0} hint="Left out on purpose" onClick={() => setStatus('ignored')} /></div>
        <div className="col-span-2 sm:col-span-1"><StatCard icon={FileSpreadsheet} tone="dark" label="Statement Balance" value={loading ? '…' : latestBalance ? inr(latestBalance.balance) : '—'} hint={latestBalance ? `As on ${showDate(latestBalance.date)}` : 'From the last imported line'} /></div>
      </div>

      <DataTable columns={columns} data={shown} isLoading={loading || !loaded} storageKey="erp_bank_size" minWidth="780px"
        searchPlaceholder="Search by narration, ref no or amount…" toolbar={chips}
        emptyMessage={rows.length ? `No ${status === 'all' ? '' : `${status} `}transactions` : 'No bank statement imported yet'}
        emptyHint={rows.length ? `Nothing ${status === 'all' ? '' : status} in ${fyLabel}.` : 'Import a CSV or Excel statement from your bank to start reconciling.'}
        emptyAction={!rows.length && <Button icon={Upload} onClick={() => setImporting(true)}>Import Statement</Button>}
        onVisibleRowsChange={setVisible} onRowClick={(r) => r.status !== 'ignored' && setMatching(r)} />

      {importing && <ImportModal bankLedgers={bankLedgers} onClose={() => setImporting(false)} onDone={() => { setImporting(false); setStatus('all'); load(); reloadVouchers(); }} />}
      {matching && <MatchModal txn={matching} vouchers={vouchers} usedNos={new Set([...usedNos].filter((n) => n !== matching.voucherNo))} canLookup={canLookup}
        onClose={() => setMatching(null)} onDone={() => { setMatching(null); load(); }} />}
    </Page>
  );
}
