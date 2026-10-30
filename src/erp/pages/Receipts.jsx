// Cash In: the ERP's Receipts page — period filter, receipt list, "Record Payment Receipt"
// modal with bill-wise allocation (auto oldest-first or manual) and a read-only detail view.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ban, Banknote, Download, Eye, Landmark, Plus, Save, Wallet, Wand2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, inr, localDate, showDate, toPaise, toRupees } from '../lib/format.js';
import { useFY, useSession } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import {
  Alert, Button, Field, IconButton, Input, Modal, Page, PageHeader, Segmented, Select, StatCard, StatusBadge, Summary, Tag, Textarea, useFeedback,
} from '../components/ui.jsx';
import { Detail, PAYMENT_MODES, PeriodFilter, isCashAccount, isMoneyAccount, modeLabel, useFyRange, useVoucherIndex } from './books/common.jsx';

// Oldest bill first, the same rule the server uses for autoAllocate.
const allocateOldest = (bills, total) => {
  let left = total;
  const out = {};
  for (const b of bills) {
    const take = Math.max(0, Math.min(Number(b.outstanding), left));
    if (take > 0) { out[b.id] = take; left -= take; }
  }
  return out;
};

function ReceiptForm({ clients, accounts, onClose, onSaved }) {
  const { fy, defaultDate } = useFY();
  const { toast } = useFeedback();
  const firstBank = accounts.find((a) => !isCashAccount(a));
  const firstCash = accounts.find(isCashAccount);
  const start = firstBank || firstCash;
  const [form, setForm] = useState({
    clientLedgerId: '', amount: '', date: defaultDate(), accountLedgerId: start ? String(start.id) : '',
    mode: start && isCashAccount(start) ? 'cash' : 'neft', reference: '', narration: '',
  });
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [allocMode, setAllocMode] = useState('auto');
  const [manual, setManual] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    setManual({}); setAllocMode('auto'); setBills([]);
    if (!form.clientLedgerId) return undefined;
    const controller = new AbortController();
    setBillsLoading(true);
    api.get(`/outstanding/${form.clientLedgerId}`, { signal: controller.signal })
      .then(setBills)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setBillsLoading(false));
    return () => controller.abort();
  }, [form.clientLedgerId]);

  const amount = toPaise(form.amount);
  const totalDue = bills.reduce((n, b) => n + Number(b.outstanding), 0);
  const allocations = useMemo(() => (allocMode === 'auto' ? allocateOldest(bills, amount) : manual), [allocMode, bills, amount, manual]);
  const allocated = Object.values(allocations).reduce((n, v) => n + (Number(v) || 0), 0);
  const unallocated = amount - allocated;
  const clientName = clients.find((c) => String(c.id) === form.clientLedgerId)?.name || 'the customer';
  const today = localDate();

  const chooseAccount = (id) => {
    const acc = accounts.find((a) => String(a.id) === id);
    set({ accountLedgerId: id, mode: acc && isCashAccount(acc) ? 'cash' : form.mode === 'cash' ? 'neft' : form.mode });
  };
  const chooseMode = (mode) => {
    const current = accounts.find((a) => String(a.id) === form.accountLedgerId);
    if (mode === 'cash' && firstCash && !(current && isCashAccount(current))) return set({ mode, accountLedgerId: String(firstCash.id) });
    if (mode !== 'cash' && firstBank && current && isCashAccount(current)) return set({ mode, accountLedgerId: String(firstBank.id) });
    return set({ mode });
  };
  // Ticking a bill switches to manual and fills it with what is still unallocated.
  const toggleBill = (bill) => {
    const base = allocMode === 'auto' ? { ...allocations } : { ...manual };
    if (base[bill.id] !== undefined) delete base[bill.id];
    else {
      const used = Object.values(base).reduce((n, v) => n + (Number(v) || 0), 0);
      base[bill.id] = Math.max(0, Math.min(Number(bill.outstanding), amount - used));
    }
    setManual(base); setAllocMode('manual');
  };
  const setBillAmount = (bill, rupees) => {
    const paise = Math.min(Math.max(0, toPaise(rupees)), Number(bill.outstanding));
    setManual((m) => ({ ...(allocMode === 'auto' ? allocations : m), [bill.id]: paise }));
    setAllocMode('manual');
  };
  const switchMode = (mode) => { if (mode === 'manual') setManual({ ...allocations }); setAllocMode(mode); };

  const save = async (e) => {
    e?.preventDefault();
    setError('');
    if (!form.clientLedgerId) return setError('Choose the customer who paid.');
    if (!form.accountLedgerId) return setError('Choose the cash or bank account the money went into.');
    if (amount <= 0) return setError('Enter the amount received.');
    if (unallocated < 0) return setError('Allocated amount is more than the amount received. Reduce some allocations.');
    setSaving(true);
    try {
      const result = await api.post('/receipts', {
        date: form.date, clientLedgerId: form.clientLedgerId, accountLedgerId: form.accountLedgerId, amount,
        mode: form.mode, reference: form.reference.trim(), narration: form.narration.trim(),
        allocations: Object.entries(allocations).filter(([, v]) => v > 0).map(([invoiceId, v]) => ({ invoiceId, amount: v })),
      });
      toast(`Receipt ${result.voucherNo} recorded`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Record Payment Receipt" icon={Plus} onClose={onClose} busy={saving}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Discard</Button>
        <Button type="submit" form="receipt-form" icon={Save} loading={saving} disabled={unallocated < 0}>Save Receipt</Button>
      </>}>
      <form id="receipt-form" onSubmit={save}>
        <Alert onClose={() => setError('')}>{error}</Alert>
        {!accounts.length && <Alert tone="warning">No cash or bank account exists yet. Add one under Ledgers (group Cash-in-Hand or Bank Accounts).</Alert>}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Client" required className="md:col-span-2"
            hint={form.clientLedgerId && !billsLoading ? (bills.length ? `${bills.length} open bill${bills.length === 1 ? '' : 's'} · ${inr(totalDue)} due` : 'No unpaid bills — this will sit as an advance (on-account) receipt.') : undefined}>
            <Select required placeholder="Select Client" value={form.clientLedgerId} onChange={(e) => set({ clientLedgerId: e.target.value })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Amount Received (₹)" required>
            <Input type="number" inputMode="decimal" required min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Date" required>
            <Input type="date" required min={fy?.startDate} max={fy?.endDate} value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Received In" required>
            <Select required placeholder="Select Bank/Cash Account" value={form.accountLedgerId} onChange={(e) => chooseAccount(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Mode">
            <Select value={form.mode} onChange={(e) => chooseMode(e.target.value)}>
              {PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label={form.mode === 'cheque' ? 'Cheque No.' : 'Reference / UTR'} className="md:col-span-2" hint="Helps match this receipt to the bank statement later.">
            <Input value={form.reference} maxLength={200} onChange={(e) => set({ reference: e.target.value })}
              placeholder={form.mode === 'cheque' ? 'e.g. 123456 · HDFC Bank' : form.mode === 'upi' ? 'e.g. UPI ref 412345678901' : form.mode === 'cash' ? 'Optional' : 'e.g. UTR HDFCN52026101234'} />
          </Field>
          <Field label="Narration / Payment Details" className="md:col-span-2">
            <Textarea rows={2} value={form.narration} onChange={(e) => set({ narration: e.target.value })} placeholder="e.g. Part payment for structural audit, Wing B" />
          </Field>

          {form.clientLedgerId && (
            <div className="rounded-lg border border-brand-tint bg-brand-soft p-4 md:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase text-brand-dark">Which bill is this payment for?</p>
                {bills.length > 0 && <Segmented value={allocMode} onChange={switchMode} options={[['auto', 'Auto-allocate oldest first'], ['manual', 'Choose bills']]} />}
              </div>
              {billsLoading ? <p className="text-xs text-muted">Loading open bills…</p> : bills.length === 0 ? (
                <p className="text-xs text-brand-dark">No unpaid bills for this client. This receipt will sit as an advance / on-account credit.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-brand-tint bg-white">
                    <table className="w-full min-w-[440px] text-sm">
                      <thead className="bg-brand-tint/50 text-brand-dark">
                        <tr>
                          <th className="w-8 px-3 py-2" />
                          <th className="px-3 py-2 text-left text-xs font-semibold">Invoice</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">Pending</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">Paying now (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map((b) => {
                          const value = allocations[b.id];
                          const checked = value !== undefined && (allocMode === 'manual' || value > 0);
                          const overdue = b.dueDate && b.dueDate < today;
                          return (
                            <tr key={b.id} className="border-t border-brand-tint/70">
                              <td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => toggleBill(b)} className="h-4 w-4 cursor-pointer accent-[#8A6634]" aria-label={`Allocate to ${b.invoiceNo}`} /></td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-ink">{b.invoiceNo}</div>
                                <div className="flex items-center gap-1.5 text-xs text-muted">{showDate(b.date)}{b.dueDate && <> · due {showDate(b.dueDate)}</>}{overdue && <Tag className="bg-red-50 text-red-600">Overdue</Tag>}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{inr(b.outstanding)}</td>
                              <td className="px-3 py-2 text-right">
                                <input type="number" inputMode="decimal" min="0" step="0.01" disabled={!checked} placeholder="0.00"
                                  value={checked ? String(toRupees(value)) : ''} onChange={(e) => setBillAmount(b, e.target.value)}
                                  className="w-28 rounded-md border border-line px-2 py-1 text-right tabular-nums outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/25 disabled:bg-paper disabled:text-muted" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    {!form.amount ? (
                      <button type="button" onClick={() => set({ amount: String(toRupees(totalDue)) })} className="flex items-center gap-1 font-semibold text-brand hover:text-brand-dark"><Wand2 size={13} /> Received the full {inr(totalDue)}</button>
                    ) : <span />}
                    <div className="flex flex-wrap justify-end gap-x-6 gap-y-1">
                      <span className="text-muted">Allocated: <span className="font-bold tabular-nums text-ink">{inr(allocated)}</span></span>
                      <span className={unallocated < 0 ? 'font-bold text-red-600' : 'text-muted'}>Unallocated: <span className="font-bold tabular-nums">{inr(unallocated)}</span></span>
                    </div>
                  </div>
                  {unallocated < 0 && <p className="mt-1 text-xs text-red-600">You&apos;ve allocated more than the amount received. Reduce some allocations.</p>}
                  {unallocated > 0 && amount > 0 && <p className="mt-1 text-right text-xs text-muted">{inr(unallocated)} will stay as an advance on {clientName}&apos;s account.</p>}
                </>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

function ReceiptDetail({ row, status, canVoid, onVoid, onClose }) {
  const isVoid = status === 'void';
  return (
    <Modal title={<span className="flex items-center gap-2">{row.voucherNo}{isVoid && <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">Void</span>}</span>} icon={Banknote} onClose={onClose}
      footer={<>
        {canVoid && !isVoid && <Button variant="danger" icon={Ban} onClick={onVoid} className="sm:mr-auto">Void</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-tight text-muted">Amount Received</div>
          <div className={cn('text-2xl font-bold tabular-nums', isVoid ? 'text-muted line-through' : 'text-emerald-600')}>+{inr(row.amount)}</div>
        </div>
        <Detail label="Date" className="text-right">{showDate(row.date)}</Detail>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Client">{row.clientName}</Detail>
        <Detail label="Received In">{row.accountName}</Detail>
        <Detail label="Mode">{modeLabel(row.mode)}</Detail>
        <Detail label="Reference">{row.reference}</Detail>
        <Detail label="Narration" className="sm:col-span-2">{row.narration}</Detail>
      </div>
      {isVoid && <Alert tone="warning" className="mb-0 mt-5">This receipt was voided. A reversal voucher cancelled its entries and the bills it settled are outstanding again.</Alert>}
    </Modal>
  );
}

export default function Receipts() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useSession();
  const { fy, label: fyLabel, inFy, loaded } = useFY();
  const { toast, confirm } = useFeedback();
  const canVoid = can('accounts');
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [visible, setVisible] = useState([]);
  const [range, setRange, within] = useFyRange(fy);
  const [vouchers, reloadVouchers] = useVoucherIndex(canVoid);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, l] = await Promise.all([api.get('/receipts'), api.get('/clients'), api.get('/ledgers')]);
      setRows(r); setClients(c); setLedgers(l); setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!location.state?.create) return;
    setCreating(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const accounts = useMemo(() => ledgers.filter(isMoneyAccount), [ledgers]);
  const cashNames = useMemo(() => new Set(ledgers.filter(isCashAccount).map((l) => l.name)), [ledgers]);
  const voucherOf = useCallback((r) => (r.voucherId ? { id: r.voucherId, status: r.status } : vouchers.get(r.voucherNo)), [vouchers]);
  const statusOf = useCallback((r) => voucherOf(r)?.status || 'posted', [voucherOf]);
  const fyRows = useMemo(() => rows.filter((r) => inFy(r.date)), [rows, inFy]);
  const shown = useMemo(() => fyRows.filter((r) => within(r.date)), [fyRows, within]);
  const live = fyRows.filter((r) => statusOf(r) !== 'void');
  const total = live.reduce((n, r) => n + Number(r.amount), 0);
  const inCash = live.filter((r) => cashNames.has(r.accountName)).reduce((n, r) => n + Number(r.amount), 0);

  const voidReceipt = async (row) => {
    const v = voucherOf(row);
    if (!v?.id) return toast('Could not find this receipt’s voucher. Refresh and try again.', 'error');
    const date = await confirm({
      title: 'Void receipt?', tone: 'danger', confirmLabel: 'Void receipt',
      message: <>Void <b>{row.voucherNo}</b> ({inr(row.amount)} from {row.clientName})? A reversal voucher will be posted and any bills it settled become outstanding again. This cannot be undone.</>,
      input: { label: 'Reversal date', type: 'date', defaultValue: row.date, required: true, hint: 'Usually the same day as the receipt.' },
    });
    if (!date) return;
    try {
      const result = await api.post(`/vouchers/${v.id}/void`, { date });
      toast(`${row.voucherNo} voided · reversal ${result.reversalNo}`);
      setDetail(null);
      reloadVouchers(); load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const exportCsv = () => {
    const list = visible.filter((r) => statusOf(r) !== 'void');
    downloadCsv(`Receipts_${range.from}_to_${range.to}.csv`, ['Receipt No', 'Date', 'Client', 'Received In', 'Mode', 'Reference', 'Narration', 'Status', 'Amount (₹)'], [
      ...visible.map((r) => [r.voucherNo, showDate(r.date), r.clientName, r.accountName, modeLabel(r.mode), r.reference, r.narration, statusOf(r), toRupees(r.amount).toFixed(2)]),
      ['Total', '', '', '', '', '', '', '', toRupees(list.reduce((n, r) => n + Number(r.amount), 0)).toFixed(2)],
    ]);
  };

  const columns = useMemo(() => [
    { key: 'voucherNo', label: 'Receipt No', sortable: true, primaryLabel: true,
      render: (v, r) => <span className="flex items-center gap-2"><span className={cn('whitespace-nowrap font-bold text-ink', statusOf(r) === 'void' && 'text-muted line-through')}>{v}</span>{statusOf(r) === 'void' && <StatusBadge status="void" />}</span> },
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true, render: (v) => <span className="whitespace-nowrap text-muted">{showDate(v)}</span> },
    { key: 'clientName', label: 'Client', sortable: true, render: (v) => <span className="font-medium">{v}</span> },
    { key: 'accountName', label: 'Received In', sortable: true, render: (v, r) => <span className="inline-flex items-center gap-1.5">{v}<Tag className="whitespace-nowrap">{modeLabel(r.mode)}</Tag></span> },
    { key: 'reference', label: 'Reference', hideOnTablet: true, render: (v, r) => <span className="text-muted">{v || r.narration || '—'}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, primaryAmount: true, sortValue: (r) => Number(r.amount),
      render: (v, r) => <span className={cn('whitespace-nowrap font-bold tabular-nums', statusOf(r) === 'void' ? 'text-muted line-through' : 'text-emerald-600')}>+{inr(v)}</span> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_, r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} label="View receipt" onClick={() => setDetail(r)} />
          {canVoid && statusOf(r) !== 'void' && <IconButton icon={Ban} label="Void receipt" tone="danger" onClick={() => voidReceipt(r)} />}
        </div>
      ) },
  ], [statusOf, canVoid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader icon={Banknote} title={<>Cash In <span className="text-base font-medium text-muted">(Receipts)</span></>}
        subtitle={`Money received from customers in ${fyLabel}, settled against their open bills.`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!visible.length} className="flex-1 sm:flex-none" title="Export the receipts currently shown">Export</Button>
          <Button icon={Plus} onClick={() => setCreating(true)} className="flex-1 sm:flex-none">Record Receipt</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Banknote} tone="green" label={`Received · ${fyLabel}`} value={loading ? '…' : inr(total)} hint={`${live.length} receipt${live.length === 1 ? '' : 's'}`} />
        <div className="hidden sm:block"><StatCard icon={Landmark} label="Into bank" value={loading ? '…' : inr(total - inCash)} hint={total ? `${Math.round(((total - inCash) / total) * 100)}% of receipts` : 'NEFT, UPI, cheques'} /></div>
        <div className="hidden sm:block"><StatCard icon={Wallet} tone="amber" label="In cash" value={loading ? '…' : inr(inCash)} hint={total ? `${Math.round((inCash / total) * 100)}% of receipts` : 'Cash-in-hand'} /></div>
      </div>

      <DataTable columns={columns} data={shown} isLoading={loading || !loaded} storageKey="erp_receipts_size"
        searchPlaceholder="Search receipts, clients, references…" emptyMessage="No receipts found"
        emptyHint={`Nothing recorded in ${fyLabel} for this period.`}
        emptyAction={<Button icon={Plus} onClick={() => setCreating(true)}>Record Receipt</Button>}
        onRowClick={setDetail} onVisibleRowsChange={setVisible}
        toolbar={<PeriodFilter range={range} setRange={setRange} fy={fy} />}
        footer={<div className="px-6 py-3"><Summary rows={[[`Showing ${visible.length} of ${fyRows.length} receipts`, inr(visible.filter((r) => statusOf(r) !== 'void').reduce((n, r) => n + Number(r.amount), 0))]]} /></div>} />

      {creating && <ReceiptForm clients={clients} accounts={accounts} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); reloadVouchers(); }} />}
      {detail && <ReceiptDetail row={detail} status={statusOf(detail)} canVoid={canVoid && Boolean(voucherOf(detail)?.id)} onVoid={() => voidReceipt(detail)} onClose={() => setDetail(null)} />}
    </Page>
  );
}
