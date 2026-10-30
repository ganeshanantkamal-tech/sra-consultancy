// Cash Out: the ERP's Expenses page — friendly category tiles, "Record New Expense" modal with
// bill attachments (uploaded after the expense is saved), capex flag, list, detail and void.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Ban, Briefcase, Building2, Download, Eye, Fuel, Hammer, HardHat, Home, IndianRupee, MoreHorizontal, Package, Paperclip,
  Plus, Save, ShoppingBag, TrendingDown, Users, Wrench, Zap,
} from 'lucide-react';
import { api, fileToBase64, shrinkImage } from '../lib/api.js';
import { cn, downloadCsv, inr, showDate, toPaise, toRupees } from '../lib/format.js';
import { useFY, useSession } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import {
  Alert, Button, Checkbox, Field, IconButton, Input, Modal, Page, PageHeader, Select, StatCard, StatusBadge, Summary, Tag, Textarea, useFeedback,
} from '../components/ui.jsx';
import { Detail, FilePicker, PeriodFilter, isCashAccount, isMoneyAccount, useFyRange, useVoucherIndex } from './books/common.jsx';

// Friendly spend categories; picking one fills the category and suggests a matching ledger.
const CATEGORIES = [
  { key: 'labour', label: 'Site Labour', icon: HardHat, words: ['labour', 'labor', 'wage', 'contract'] },
  { key: 'materials', label: 'Materials', icon: Package, words: ['material', 'cement', 'steel', 'purchase'] },
  { key: 'rent', label: 'Rent', icon: Home, words: ['rent'] },
  { key: 'salaries', label: 'Salaries', icon: Users, words: ['salar', 'staff', 'wage'] },
  { key: 'travel', label: 'Travel & Fuel', icon: Fuel, words: ['travel', 'convey', 'fuel', 'petrol', 'vehicle'] },
  { key: 'utilities', label: 'Utilities', icon: Zap, words: ['electric', 'utilit', 'internet', 'phone', 'telephone'] },
  { key: 'office', label: 'Office Supplies', icon: ShoppingBag, words: ['office', 'stationery', 'supplies', 'printing'] },
  { key: 'professional', label: 'Professional Fees', icon: Briefcase, words: ['professional', 'consult', 'legal', 'fees'] },
  { key: 'repairs', label: 'Repairs', icon: Wrench, words: ['repair', 'maintenance'] },
  { key: 'equipment', label: 'Equipment', icon: Hammer, words: ['equipment', 'machine', 'tool', 'furniture', 'computer'], capex: true },
  { key: 'other', label: 'Other', icon: MoreHorizontal, words: ['misc', 'general', 'sundry'] },
];
const MAX_BYTES = 4 * 1024 * 1024;

// Images are shrunk to JPEG before upload; PDFs go as they are (server limit 4 MB).
async function uploadBill(expenseId, file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let data; let contentType;
  if (isPdf) { data = await fileToBase64(file); contentType = 'application/pdf'; } else {
    try { data = await shrinkImage(file); contentType = 'image/jpeg'; } catch { data = await fileToBase64(file); contentType = file.type || 'image/jpeg'; }
  }
  return api.post(`/expenses/${expenseId}/attachments`, { filename: file.name, contentType, data });
}
const checkFiles = (files) => {
  const bad = files.find((f) => !/^image\/|application\/pdf/.test(f.type) && !/\.(pdf|jpe?g|png)$/i.test(f.name));
  if (bad) return `${bad.name} is not a photo or PDF.`;
  const big = files.find((f) => /pdf/i.test(f.type || f.name) && f.size > MAX_BYTES);
  return big ? `${big.name} is larger than 4 MB.` : '';
};

function ExpenseForm({ ledgers, groups, accounts, rows, onClose, onSaved }) {
  const { fy, defaultDate } = useFY();
  const { toast } = useFeedback();
  const start = accounts.find((a) => !isCashAccount(a)) || accounts[0];
  const [form, setForm] = useState({
    category: '', expenseLedgerId: '', amount: '', date: defaultDate(), accountLedgerId: start ? String(start.id) : '',
    vendor: '', reference: '', narration: '', isCapex: false,
  });
  const [chip, setChip] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const natureOf = useMemo(() => new Map(groups.map((g) => [String(g.id), g.nature])), [groups]);
  // Running costs post to Expense-nature ledgers; capital purchases to asset ledgers (not cash, bank or debtors).
  const options = useMemo(() => ledgers.filter((l) => (form.isCapex
    ? natureOf.get(String(l.groupId)) === 'Asset' && !isMoneyAccount(l) && !l.isClient && l.groupName !== 'Sundry Debtors'
    : natureOf.get(String(l.groupId)) === 'Expense' && l.systemKey !== 'round_off')), [ledgers, natureOf, form.isCapex]);
  const byGroup = useMemo(() => options.reduce((acc, l) => { (acc[l.groupName] = acc[l.groupName] || []).push(l); return acc; }, {}), [options]);
  const vendors = useMemo(() => [...new Set(rows.map((r) => r.vendor).filter(Boolean))].sort(), [rows]);
  const categories = useMemo(() => [...new Set([...rows.map((r) => r.category).filter(Boolean), ...CATEGORIES.map((c) => c.label)])].sort(), [rows]);

  const pickCategory = (cat) => {
    setChip(cat.key);
    const isCapex = Boolean(cat.capex);
    const pool = ledgers.filter((l) => (isCapex ? natureOf.get(String(l.groupId)) === 'Asset' && !isMoneyAccount(l) && !l.isClient : natureOf.get(String(l.groupId)) === 'Expense'));
    const match = pool.find((l) => cat.words.some((w) => l.name.toLowerCase().includes(w)));
    set({ category: cat.label, isCapex, expenseLedgerId: match ? String(match.id) : isCapex === form.isCapex ? form.expenseLedgerId : '' });
  };

  const save = async (e) => {
    e?.preventDefault();
    setError('');
    const amount = toPaise(form.amount);
    if (!form.expenseLedgerId) return setError(form.isCapex ? 'Choose the asset ledger for this purchase.' : 'Choose the expense ledger this spend goes to.');
    if (!form.accountLedgerId) return setError('Choose the cash or bank account it was paid from.');
    if (amount <= 0) return setError('Enter the amount paid.');
    const fileProblem = checkFiles(files);
    if (fileProblem) return setError(fileProblem);
    setSaving(true);
    let saved;
    try {
      saved = await api.post('/expenses', {
        date: form.date, expenseLedgerId: form.expenseLedgerId, accountLedgerId: form.accountLedgerId, amount,
        category: form.category.trim(), vendor: form.vendor.trim(), reference: form.reference.trim(), narration: form.narration.trim(), isCapex: form.isCapex,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return undefined;
    }
    const failed = [];
    for (const file of files) {
      try { await uploadBill(saved.id, file); } catch (err) { failed.push(`${file.name}: ${err.message}`); }
    }
    if (failed.length) toast(`Expense saved, but ${failed.length === files.length ? 'the bill' : 'some bills'} could not be attached (${failed[0]}). Use the paperclip on the row to try again.`, 'warning');
    else toast(`Expense of ${inr(amount)} recorded${files.length ? ` with ${files.length} bill${files.length === 1 ? '' : 's'}` : ''}`);
    onSaved();
    return undefined;
  };

  return (
    <Modal title="Record New Expense" icon={Plus} onClose={onClose} busy={saving}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Discard</Button>
        <Button type="submit" form="expense-form" icon={Save} loading={saving}>{saving && files.length ? 'Saving & uploading…' : 'Save Expense'}</Button>
      </>}>
      <form id="expense-form" onSubmit={save}>
        <Alert onClose={() => setError('')}>{error}</Alert>
        {!accounts.length && <Alert tone="warning">No cash or bank account exists yet. Add one under Ledgers (group Cash-in-Hand or Bank Accounts).</Alert>}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="erp-label mb-2">What was this expense for?</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {CATEGORIES.map((cat) => (
                <button key={cat.key} type="button" onClick={() => pickCategory(cat)}
                  className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all',
                    chip === cat.key ? 'border-brand bg-brand text-white shadow-md' : 'border-line bg-white text-ink hover:border-brand-gold hover:bg-brand-soft')}>
                  <cat.icon size={16} className="shrink-0" /><span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label={form.isCapex ? 'Asset Ledger' : 'Expense Ledger'} required
            hint={!options.length ? (form.isCapex ? 'No asset ledger yet — add one under Ledgers (e.g. Fixed Assets).' : 'No expense ledger yet — add one under Ledgers.') : chip && !form.expenseLedgerId ? 'No ledger matched this category — pick one.' : undefined}>
            <Select required placeholder="Select Account" value={form.expenseLedgerId} onChange={(e) => set({ expenseLedgerId: e.target.value })}>
              {Object.keys(byGroup).sort().map((g) => (
                <optgroup key={g} label={g}>{byGroup[g].map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Category" hint="Free text, for your own grouping and reports.">
            <Input list="expense-categories" maxLength={100} value={form.category} onChange={(e) => { set({ category: e.target.value }); setChip(''); }} placeholder="e.g. Site Labour" />
            <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" inputMode="decimal" required min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Date" required>
            <Input type="date" required min={fy?.startDate} max={fy?.endDate} value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Payment From" required>
            <Select required placeholder="Select Bank/Cash Account" value={form.accountLedgerId} onChange={(e) => set({ accountLedgerId: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Vendor / Paid To">
            <Input list="expense-vendors" maxLength={200} value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="e.g. Ravi Contractor" />
            <datalist id="expense-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Bill No. / Reference" className="md:col-span-2" hint="Vendor bill number, UTR or cheque number.">
            <Input maxLength={200} value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. INV-2026-118 or UTR HDFCN52026101234" />
          </Field>
          <div className="rounded-lg border border-line bg-paper/60 px-4 py-3 md:col-span-2">
            <Checkbox label={<span className="font-semibold">Capital expenditure</span>} checked={form.isCapex} onChange={(e) => set({ isCapex: e.target.checked, expenseLedgerId: '' })} />
            <p className="ml-6 mt-0.5 text-xs text-muted">Tick for things you will use for years — equipment, tools, furniture, computers. It is booked to an asset ledger instead of an expense.</p>
          </div>
          <Field label="Narration / Description" className="md:col-span-2">
            <Textarea rows={2} value={form.narration} onChange={(e) => set({ narration: e.target.value })} placeholder="e.g. Weekly labour payment, Wing B column jacketing" />
          </Field>
          <Field label="Attach Bill / Receipt (optional)" className="md:col-span-2">
            <FilePicker files={files} onChange={setFiles} accept="image/jpeg,image/png,image/*,application/pdf" hint="JPG, PNG or PDF. Photos are compressed automatically; PDFs must be under 4 MB." />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseDetail({ row, status, canVoid, onVoid, onAttach, onClose }) {
  const isVoid = status === 'void';
  const [bills, setBills] = useState(null);
  useEffect(() => { api.get(`/expenses/${row.id}/attachments`).then(setBills).catch(() => setBills([])); }, [row.id, row.attachments]);
  return (
    <Modal title={<span className="flex items-center gap-2">{row.voucherNo}{isVoid && <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">Void</span>}</span>} icon={IndianRupee} onClose={onClose}
      footer={<>
        {canVoid && !isVoid && <Button variant="danger" icon={Ban} onClick={onVoid} className="sm:mr-auto">Void</Button>}
        {!isVoid && <Button variant="secondary" icon={Paperclip} onClick={onAttach}>Attach bill</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-tight text-muted">Amount Paid</div>
          <div className={cn('text-2xl font-bold tabular-nums', isVoid ? 'text-muted line-through' : 'text-red-600')}>−{inr(row.amount)}</div>
        </div>
        <Detail label="Date" className="text-right">{showDate(row.date)}</Detail>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label={row.isCapex ? 'Asset Ledger' : 'Expense Ledger'}>{row.expenseLedger}{row.isCapex && <Tag className="ml-2 bg-brand-tint text-brand-dark">Capex</Tag>}</Detail>
        <Detail label="Category">{row.category}</Detail>
        <Detail label="Payment From">{row.accountName}</Detail>
        <Detail label="Vendor / Paid To">{row.vendor}</Detail>
        <Detail label="Bill No. / Reference">{row.reference}</Detail>
        <Detail label="Narration" className="sm:col-span-2">{row.narration}</Detail>
      </div>
      <div className="mt-5">
        <div className="erp-label">Bills</div>
        {bills === null ? <p className="text-sm text-muted">Loading…</p> : bills.length ? (
          <div className="flex flex-wrap gap-2">
            {bills.map((b) => (
              <a key={b.id} href={`/api/erp/expenses/${row.id}/attachments/${b.id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft">
                <Paperclip size={14} />{b.filename}
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No bill attached yet.</p>}
      </div>
      {isVoid && <Alert tone="warning" className="mb-0 mt-5">This expense was voided. A reversal voucher cancelled its entries.</Alert>}
    </Modal>
  );
}

export default function Expenses() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useSession();
  const { fy, label: fyLabel, inFy, loaded } = useFY();
  const { toast, confirm } = useFeedback();
  const canVoid = can('accounts');
  const [rows, setRows] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [kind, setKind] = useState('all');
  const [visible, setVisible] = useState([]);
  const [range, setRange, within] = useFyRange(fy);
  const [vouchers, reloadVouchers] = useVoucherIndex(canVoid);
  const attachInput = useRef(null);
  const [attachFor, setAttachFor] = useState(null);
  const [uploading, setUploading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, l, g] = await Promise.all([api.get('/expenses'), api.get('/ledgers'), api.get('/groups')]);
      setRows(r); setLedgers(l); setGroups(g); setError('');
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
  const voucherOf = useCallback((r) => (r.voucherId ? { id: r.voucherId, status: r.status } : vouchers.get(r.voucherNo)), [vouchers]);
  const statusOf = useCallback((r) => voucherOf(r)?.status || 'posted', [voucherOf]);
  const fyRows = useMemo(() => rows.filter((r) => inFy(r.date)), [rows, inFy]);
  const shown = useMemo(() => fyRows.filter((r) => within(r.date) && (kind === 'all' || (kind === 'capex') === Boolean(r.isCapex))), [fyRows, within, kind]);
  const live = fyRows.filter((r) => statusOf(r) !== 'void');
  const sum = (list) => list.reduce((n, r) => n + Number(r.amount), 0);
  const total = sum(live);
  const capex = sum(live.filter((r) => r.isCapex));

  const voidExpense = async (row) => {
    const v = voucherOf(row);
    if (!v?.id) return toast('Could not find this expense’s voucher. Refresh and try again.', 'error');
    const date = await confirm({
      title: 'Void expense?', tone: 'danger', confirmLabel: 'Void expense',
      message: <>Void <b>{row.voucherNo}</b> ({inr(row.amount)}{row.vendor ? ` to ${row.vendor}` : ''})? A reversal voucher will be posted to cancel it. This cannot be undone.</>,
      input: { label: 'Reversal date', type: 'date', defaultValue: row.date, required: true, hint: 'Usually the same day as the expense.' },
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

  const startAttach = (row) => { setAttachFor(row); attachInput.current?.click(); };
  const attachPicked = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const row = attachFor;
    if (!row || !picked.length) return;
    const problem = checkFiles(picked);
    if (problem) return toast(problem, 'error');
    setUploading(row.id);
    try {
      for (const file of picked) await uploadBill(row.id, file);
      toast(`${picked.length === 1 ? 'Bill' : `${picked.length} bills`} attached to ${row.voucherNo}`);
    } catch (err) {
      toast(`Could not attach the bill: ${err.message}`, 'error');
    } finally {
      setUploading(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(`Expenses_${range.from}_to_${range.to}.csv`, ['Voucher No', 'Date', 'Type', 'Category', 'Ledger', 'Vendor', 'Payment From', 'Reference', 'Narration', 'Status', 'Amount (₹)'], [
      ...visible.map((r) => [r.voucherNo, showDate(r.date), r.isCapex ? 'Capital' : 'Expense', r.category, r.expenseLedger, r.vendor, r.accountName, r.reference, r.narration, statusOf(r), toRupees(r.amount).toFixed(2)]),
      ['Total', '', '', '', '', '', '', '', '', '', toRupees(sum(visible.filter((r) => statusOf(r) !== 'void'))).toFixed(2)],
    ]);
  };

  const columns = useMemo(() => [
    { key: 'voucherNo', label: 'Voucher No', sortable: true, primaryLabel: true,
      render: (v, r) => <span className="flex items-center gap-2"><span className={cn('whitespace-nowrap font-bold text-ink', statusOf(r) === 'void' && 'text-muted line-through')}>{v}</span>{statusOf(r) === 'void' && <StatusBadge status="void" />}{r.isCapex && <Tag className="bg-brand-tint text-brand-dark">Capex</Tag>}{r.attachments > 0 && <span title={`${r.attachments} bill${r.attachments === 1 ? '' : 's'} attached`} className="text-brand"><Paperclip size={13} /></span>}</span> },
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true, render: (v) => <span className="whitespace-nowrap text-muted">{showDate(v)}</span> },
    { key: 'expenseLedger', label: 'Category', sortable: true, searchValue: (r) => r.category,
      render: (v, r) => <span className="block leading-tight"><span className="font-medium">{r.category || v}</span>{r.category && r.category !== v && <span className="block text-xs text-muted">{v}</span>}</span> },
    { key: 'vendor', label: 'Vendor', sortable: true, render: (v, r) => <span className="block max-w-[220px] truncate" title={r.narration}>{v || <span className="text-muted">{r.narration || '—'}</span>}</span> },
    { key: 'accountName', label: 'Paid From', sortable: true, hideOnTablet: true, render: (v) => <span className="text-muted">{v}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, primaryAmount: true, sortValue: (r) => Number(r.amount),
      render: (v, r) => <span className={cn('whitespace-nowrap font-bold tabular-nums', statusOf(r) === 'void' ? 'text-muted line-through' : 'text-red-600')}>−{inr(v)}</span> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_, r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} label="View expense" onClick={() => setDetail(r)} />
          {statusOf(r) !== 'void' && <IconButton icon={Paperclip} label={uploading === r.id ? 'Uploading…' : 'Attach bill'} disabled={uploading === r.id} onClick={() => startAttach(r)} className={uploading === r.id ? 'animate-pulse' : ''} />}
          {canVoid && statusOf(r) !== 'void' && <IconButton icon={Ban} label="Void expense" tone="danger" onClick={() => voidExpense(r)} />}
        </div>
      ) },
  ], [statusOf, canVoid, uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader icon={IndianRupee} title={<>Cash Out <span className="text-base font-medium text-muted">(Expenses)</span></>}
        subtitle={`Everything paid out in ${fyLabel} — site costs, overheads and capital purchases.`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!visible.length} className="flex-1 sm:flex-none" title="Export the expenses currently shown">Export</Button>
          <Button icon={Plus} onClick={() => setCreating(true)} className="flex-1 sm:flex-none">Add Expense</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={TrendingDown} tone="red" label={`Spent · ${fyLabel}`} value={loading ? '…' : inr(total)} hint={`${live.length} payment${live.length === 1 ? '' : 's'}`} />
        <div className="hidden sm:block"><StatCard icon={IndianRupee} label="Running costs" value={loading ? '…' : inr(total - capex)} hint="Charged to expense ledgers" /></div>
        <div className="hidden sm:block"><StatCard icon={Building2} tone="dark" label="Capital purchases" value={loading ? '…' : inr(capex)} hint="Equipment, tools, furniture" /></div>
      </div>

      <DataTable columns={columns} data={shown} isLoading={loading || !loaded} storageKey="erp_expenses_size"
        searchPlaceholder="Search expenses, vendors, categories…" emptyMessage="No expenses recorded"
        emptyHint={`Nothing paid out in ${fyLabel} for this period.`}
        emptyAction={<Button icon={Plus} onClick={() => setCreating(true)}>Add Expense</Button>}
        onRowClick={setDetail} onVisibleRowsChange={setVisible}
        toolbar={<>
          <PeriodFilter range={range} setRange={setRange} fy={fy} />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Expense type"
            className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/25">
            <option value="all">All types</option><option value="expense">Running costs</option><option value="capex">Capital purchases</option>
          </select>
        </>}
        footer={<div className="px-6 py-3"><Summary rows={[[`Showing ${visible.length} of ${fyRows.length} expenses`, inr(sum(visible.filter((r) => statusOf(r) !== 'void')))]]} /></div>} />

      <input ref={attachInput} type="file" hidden multiple accept="image/jpeg,image/png,image/*,application/pdf" onChange={attachPicked} />
      {creating && <ExpenseForm ledgers={ledgers} groups={groups} accounts={accounts} rows={rows} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); reloadVouchers(); }} />}
      {detail && <ExpenseDetail row={detail} status={statusOf(detail)} canVoid={canVoid && Boolean(voucherOf(detail)?.id)} onVoid={() => voidExpense(detail)} onAttach={() => startAttach(detail)} onClose={() => setDetail(null)} />}
    </Page>
  );
}
