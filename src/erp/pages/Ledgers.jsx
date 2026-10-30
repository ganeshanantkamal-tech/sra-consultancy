// Chart of accounts (ERP Ledgers): every ledger with its group, nature and FY closing balance,
// filters by nature / group, the statement link, and create / edit for user ledgers.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Download, Eye, FolderTree, Lock, Pencil, Plus, Save, Scale, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, drCr, inr0, localDate, showDate, toPaise, toRupees } from '../lib/format.js';
import { useFY } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Checkbox, Field, IconButton, Input, Modal, Page, PageHeader, Segmented, Select, Tag, Textarea, useFeedback } from '../components/ui.jsx';
import Balance from './masters/Balance.jsx';
import { emailError, gstinError, panError, phoneError, visibleErrors } from './masters/validate.js';

const NATURES = [
  ['Asset', 'Assets', Wallet, 'brand'],
  ['Liability', 'Liabilities', Scale, 'dark'],
  ['Income', 'Income', TrendingUp, 'green'],
  ['Expense', 'Expenses', TrendingDown, 'red'],
];
const NATURE_TAG = { Asset: 'bg-brand-soft text-brand-dark', Liability: 'bg-slate-100 text-slate-600', Income: 'bg-emerald-50 text-emerald-700', Expense: 'bg-rose-50 text-rose-600' };
const drCr0 = (p) => (Number(p) ? `${inr0(Math.abs(Number(p)))} ${Number(p) > 0 ? 'Dr' : 'Cr'}` : inr0(0));
const blank = { name: '', groupId: '', openingBalance: '0', openingBalanceType: 'Dr', gstin: '', pan: '', contact: '', email: '', address: '', upiId: '' };

function LedgerForm({ initial, groups, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [more, setMore] = useState(Boolean(initial.gstin || initial.contact || initial.email || initial.address || initial.upiId || initial.pan));
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const errors = {
    name: form.name.trim() ? '' : 'Enter a ledger name.',
    groupId: form.groupId ? '' : 'Choose the account group.',
    openingBalance: Number(form.openingBalance) < 0 || Number.isNaN(Number(form.openingBalance)) ? 'Enter a positive amount; pick Dr or Cr for the side.' : '',
    gstin: gstinError(form.gstin), pan: panError(form.pan, form.gstin), contact: phoneError(form.contact), email: emailError(form.email),
  };
  const shown = visibleErrors(errors, touched, submitted);
  const group = groups.find((g) => String(g.id) === String(form.groupId));
  // Dr is the natural side for assets and expenses, Cr for liabilities and income.
  const pickGroup = (id) => {
    const g = groups.find((x) => String(x.id) === id);
    setForm((f) => ({ ...f, groupId: id, openingBalanceType: Number(f.openingBalance) ? f.openingBalanceType : g && ['Liability', 'Income'].includes(g.nature) ? 'Cr' : 'Dr' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setError('');
    try {
      const body = { ...form, name: form.name.trim(), openingBalance: toPaise(form.openingBalance), stateCode: form.gstin ? form.gstin.slice(0, 2) : form.stateCode || '' };
      await (form.id ? api.put(`/ledgers/${form.id}`, body) : api.post('/ledgers', body));
      onSaved(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={form.id ? 'Edit Ledger' : 'Create New Ledger'} icon={form.id ? Pencil : Plus} onClose={onClose} busy={busy}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Discard</Button>
        <Button type="submit" form="ledger-form" icon={Save} loading={busy}>{form.id ? 'Update Ledger' : 'Save Ledger'}</Button>
      </>}>
      <form id="ledger-form" onSubmit={submit} noValidate>
        <Alert className="animate-shake">{error}</Alert>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Ledger Name" required error={shown.name} className="md:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} onBlur={touch('name')} placeholder="e.g. HDFC Bank, Office Rent, Cement Supplier" autoComplete="off" />
          </Field>
          <Field label="Account Group" required error={shown.groupId} hint={group ? `Nature: ${group.nature}` : 'Decides where it shows in the books'}>
            <Select value={String(form.groupId || '')} onChange={(e) => pickGroup(e.target.value)} onBlur={touch('groupId')} placeholder="Select Group">
              {NATURES.map(([nature, label]) => (
                <optgroup key={nature} label={label}>
                  {groups.filter((g) => g.nature === nature).map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className="flex gap-3">
            <Field label="Opening Balance (₹)" error={shown.openingBalance} className="min-w-0 flex-1">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} onBlur={touch('openingBalance')} />
            </Field>
            <Field label="Type" className="shrink-0">
              <Segmented className="flex h-[42px] items-stretch" value={form.openingBalanceType} onChange={(v) => set('openingBalanceType', v)} options={[['Dr', 'Dr'], ['Cr', 'Cr']]} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Checkbox label="Add contact & tax details (suppliers, banks)" checked={more} onChange={(e) => setMore(e.target.checked)} />
          </div>
          {more && <>
            <Field label="GSTIN" error={shown.gstin} hint="15 characters (optional)">
              <Input className="font-mono uppercase" maxLength={15} value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''), pan: !f.pan && e.target.value.length === 15 ? e.target.value.toUpperCase().slice(2, 12) : f.pan }))} onBlur={touch('gstin')} placeholder="27AAAAA0000A1Z5" />
            </Field>
            <Field label="PAN" error={shown.pan}>
              <Input className="font-mono uppercase" maxLength={10} value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))} onBlur={touch('pan')} placeholder="ABCDE1234F" />
            </Field>
            <Field label="Contact Number" error={shown.contact}>
              <Input type="tel" inputMode="tel" value={form.contact} onChange={(e) => set('contact', e.target.value.replace(/[^\d+ -]/g, '').slice(0, 16))} onBlur={touch('contact')} placeholder="9876543210" />
            </Field>
            <Field label="Email Address" error={shown.email}>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value.trim())} onBlur={touch('email')} placeholder="accounts@supplier.com" />
            </Field>
            <Field label="Address" className="md:col-span-2">
              <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="UPI ID" hint="For paying this party">
              <Input value={form.upiId} onChange={(e) => set('upiId', e.target.value.trim())} placeholder="name@bank" />
            </Field>
          </>}
        </div>
      </form>
    </Modal>
  );
}

function GroupsModal({ groups, ledgers, onClose }) {
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  return (
    <Modal title="Account Groups" icon={FolderTree} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <tr><th className="px-4 py-2.5 text-left">Group Name</th><th className="px-4 py-2.5 text-left">Nature</th><th className="hidden px-4 py-2.5 text-left sm:table-cell">Parent</th><th className="px-4 py-2.5 text-right">Ledgers</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold text-ink">{g.name}{g.isPrimary && <Tag className="ml-2">Primary</Tag>}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', NATURE_TAG[g.nature])}>{g.nature}</span></td>
                <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{byId[g.parentGroupId]?.name || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{ledgers.filter((l) => l.groupId === g.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function Ledgers() {
  const navigate = useNavigate();
  const location = useLocation();
  const { fy, label: fyLabel, loaded } = useFY();
  const { toast, confirm } = useFeedback();
  const [ledgers, setLedgers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nature, setNature] = useState('');
  const [groupId, setGroupId] = useState('');
  const [form, setForm] = useState(null);
  const [showGroups, setShowGroups] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, g, b] = await Promise.all([api.get('/ledgers'), api.get('/groups'), api.get(`/ledger-balances${fy ? `?to=${fy.endDate}` : ''}`)]);
      setLedgers(l); setGroups(g);
      setBalances(Object.fromEntries(b.map((x) => [x.id, Number(x.balance)])));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fy]);
  useEffect(() => { if (loaded) load(); }, [load, loaded]);
  useEffect(() => {
    if (!location.state?.create) return;
    setForm({ ...blank });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const natureOf = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.nature])), [groups]);
  const rows = useMemo(() => ledgers
    .map((l) => ({ ...l, nature: natureOf[l.groupId] || '', balance: balances[l.id] ?? 0 }))
    .filter((l) => (!nature || l.nature === nature) && (!groupId || String(l.groupId) === groupId)), [ledgers, natureOf, balances, nature, groupId]);
  const totals = useMemo(() => Object.fromEntries(NATURES.map(([n]) => {
    const list = ledgers.filter((l) => natureOf[l.groupId] === n);
    return [n, { count: list.length, sum: list.reduce((s, l) => s + (balances[l.id] ?? 0), 0) }];
  })), [ledgers, natureOf, balances]);

  const openEdit = (row) => setForm({ ...blank, ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])), groupId: String(row.groupId), openingBalance: String(toRupees(row.openingBalance)) });
  const remove = async (row) => {
    const ok = await confirm({ title: 'Delete ledger?', tone: 'danger', confirmLabel: 'Delete', message: <>Delete <strong>{row.name}</strong>? Ledgers with posted entries can’t be deleted.</> });
    if (!ok) return;
    try { await api.del(`/ledgers/${row.id}`); toast(`${row.name} deleted.`); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const exportCsv = () => downloadCsv(`Chart_of_Accounts_${localDate()}.csv`, ['Ledger', 'Group', 'Nature', 'Opening', 'Opening Dr/Cr', `Closing (${fyLabel})`, 'Closing Dr/Cr'],
    rows.map((r) => [r.name, r.groupName, r.nature, toRupees(r.openingBalance).toFixed(2), r.openingBalanceType, (Math.abs(r.balance) / 100).toFixed(2), r.balance < 0 ? 'Cr' : 'Dr']));

  const columns = useMemo(() => [
    { key: 'name', label: 'Ledger Name', sortable: true, primaryLabel: true,
      render: (v, row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-ink">{v}
          {row.systemKey && <Tag>System</Tag>}{row.isClient && <Tag className="bg-brand-soft text-brand-dark">Customer</Tag>}
        </span>
      ) },
    { key: 'groupName', label: 'Account Group', sortable: true, secondaryLabel: true, render: (v) => <span className="text-muted">{v}</span> },
    { key: 'nature', label: 'Nature', sortable: true, hideOnTablet: true,
      render: (v) => v && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', NATURE_TAG[v])}>{v}</span> },
    { key: 'openingBalance', label: 'Opening', align: 'right', sortable: true, hideOnTablet: true, sortValue: (r) => (r.openingBalanceType === 'Cr' ? -1 : 1) * r.openingBalance,
      render: (_v, row) => <Balance className="font-normal text-muted" value={(row.openingBalanceType === 'Cr' ? -1 : 1) * Number(row.openingBalance)} /> },
    { key: 'balance', label: `Closing Bal (${fyLabel})`, align: 'right', sortable: true, primaryAmount: true, render: (v) => <Balance value={v} /> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => {
        const locked = row.systemKey ? 'System ledger: kept up to date automatically, so it can’t be edited or deleted.' : row.isClient ? 'Customer ledger: edit it under Customers.' : '';
        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Link to={`/ledgers/${row.id}/statement`} title="View ledger statement" className="mr-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"><Eye size={15} /> Statement</Link>
            {locked ? (
              <span title={locked} aria-label={locked} className={cn('rounded-md p-1.5 text-muted/70', row.isClient && 'cursor-pointer hover:bg-brand-soft hover:text-brand')} onClick={row.isClient ? () => navigate('/clients') : undefined}><Lock size={16} /></span>
            ) : <>
              <IconButton icon={Pencil} label="Edit ledger" onClick={() => openEdit(row)} />
              <IconButton icon={Trash2} label="Delete ledger" tone="danger" onClick={() => remove(row)} />
            </>}
          </div>
        );
      } },
  ], [fyLabel, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupOptions = groups.filter((g) => !nature || g.nature === nature);

  return (
    <Page>
      <PageHeader icon={BookOpen} title="Chart of Accounts"
        subtitle={fy ? `Closing balances as of ${showDate(fy.endDate)} (${fyLabel}). Click a ledger to see its statement.` : 'Every account in your books.'}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length} className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4">Export</Button>
          <Button variant="secondary" icon={FolderTree} onClick={() => setShowGroups(true)} className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4">Groups</Button>
          <Button icon={Plus} onClick={() => setForm({ ...blank })} className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4">New Ledger</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {NATURES.map(([key, label, Icon, tone]) => {
          const active = nature === key;
          const tones = { brand: 'bg-brand-soft text-brand', dark: 'bg-olive text-brand-gold', green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-600' };
          return (
            <button key={key} type="button" onClick={() => { setNature(active ? '' : key); setGroupId(''); }} aria-pressed={active}
              className={cn('flex items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md', active ? 'border-brand ring-2 ring-brand-gold/30' : 'border-line')}>
              <span className={cn('hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex', tones[tone])}><Icon size={20} /></span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-widest text-muted">{label}</span>
                <span className="mt-0.5 block truncate text-base font-extrabold tabular-nums text-ink sm:text-lg" title={drCr(totals[key]?.sum)}>{loading ? '…' : drCr0(totals[key]?.sum)}</span>
                <span className="block text-xs text-muted">{totals[key]?.count || 0} ledger{totals[key]?.count === 1 ? '' : 's'}{active && ' · filtered'}</span>
              </span>
            </button>
          );
        })}
      </div>

      <DataTable columns={columns} data={rows} isLoading={loading} storageKey="erp_ledgers_size" searchPlaceholder="Search ledgers…"
        onRowClick={(row) => navigate(`/ledgers/${row.id}/statement`)}
        toolbar={<>
          <Select className="w-auto min-w-[150px]" value={nature} onChange={(e) => { setNature(e.target.value); setGroupId(''); }} aria-label="Filter by nature">
            <option value="">All natures</option>
            {NATURES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
          <Select className="w-auto min-w-[180px]" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Filter by account group">
            <option value="">All groups</option>
            {groupOptions.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </Select>
          {(nature || groupId) && <Button variant="ghost" size="sm" onClick={() => { setNature(''); setGroupId(''); }}>Clear</Button>}
        </>}
        emptyMessage={nature || groupId ? 'No ledgers in this filter' : 'No ledgers found'}
        emptyHint={nature || groupId ? 'Clear the filters to see every ledger.' : 'Create a ledger for each bank, supplier or expense head.'}
        emptyAction={<Button icon={Plus} onClick={() => setForm({ ...blank })}>New Ledger</Button>} />

      {form && <LedgerForm key={form.id || 'new'} initial={form} groups={groups} onClose={() => setForm(null)}
        onSaved={(saved) => { setForm(null); toast(`${saved.name.trim()} ${saved.id ? 'updated' : 'created'}.`); load(); }} />}
      {showGroups && <GroupsModal groups={groups} ledgers={ledgers} onClose={() => setShowGroups(false)} />}
    </Page>
  );
}
