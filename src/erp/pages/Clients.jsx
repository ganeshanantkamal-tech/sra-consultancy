// Customers (ERP "Clients"): Sundry Debtor ledgers with FY closing balances, the ERP's
// Add Client modal (uppercase labels, state → city pickers) and a customer detail panel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Download, Eye, FileText, Mail, MapPin, Pencil, Phone, Plus, Save, Trash2, User, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, drCr, inr, localDate, showDate, toPaise, toRupees } from '../lib/format.js';
import { STATES, stateName } from '../lib/states.js';
import { useCompany, useFY, useSession } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, IconButton, Input, Loading, Modal, Page, PageHeader, Segmented, Select, Textarea, useFeedback } from '../components/ui.jsx';
import Balance from './masters/Balance.jsx';
import { citiesFor } from './masters/cities.js';
import { emailError, gstinError, gstinPatch, panError, phoneError, stateMismatch, visibleErrors } from './masters/validate.js';

const blank = (stateCode) => ({ name: '', gstin: '', pan: '', stateCode: stateCode || '27', city: '', address: '', contact: '', email: '', openingBalance: '0', openingBalanceType: 'Dr', creditPeriodDays: '' });

function ClientForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [customCity, setCustomCity] = useState(() => Boolean(initial.city) && !citiesFor(initial.stateCode).includes(initial.city));
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const errors = {
    name: form.name.trim() ? '' : 'Enter the customer’s legal name.',
    gstin: gstinError(form.gstin),
    pan: panError(form.pan, form.gstin),
    contact: phoneError(form.contact),
    email: emailError(form.email),
    stateCode: stateMismatch(form.gstin, form.stateCode),
    creditPeriodDays: form.creditPeriodDays !== '' && !(Number.isInteger(Number(form.creditPeriodDays)) && Number(form.creditPeriodDays) >= 0 && Number(form.creditPeriodDays) <= 365) ? 'Use 0–365 days.' : '',
    openingBalance: Number(form.openingBalance) < 0 || Number.isNaN(Number(form.openingBalance)) ? 'Enter a positive amount; pick Dr or Cr for the side.' : '',
  };
  const shown = visibleErrors(errors, touched, submitted);
  const cities = citiesFor(form.stateCode);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setError('');
    try {
      const body = { ...form, name: form.name.trim(), openingBalance: toPaise(form.openingBalance), creditPeriodDays: form.creditPeriodDays === '' ? null : Number(form.creditPeriodDays) };
      await (form.id ? api.put(`/clients/${form.id}`, body) : api.post('/clients', body));
      onSaved(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={form.id ? 'Edit Customer Details' : 'Register New Customer'} icon={form.id ? Pencil : Plus} onClose={onClose} busy={busy}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Discard</Button>
        <Button type="submit" form="client-form" icon={Save} loading={busy}>{form.id ? 'Update Customer' : 'Save & Close'}</Button>
      </>}>
      <form id="client-form" onSubmit={submit} noValidate>
        <Alert className="animate-shake">{error}</Alert>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Legal Business Name" required error={shown.name} className="md:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} onBlur={touch('name')} placeholder="e.g. Sai Developers Pvt Ltd" autoComplete="off" />
          </Field>
          <Field label="GSTIN" error={shown.gstin} hint="15 characters. Fills the state and PAN for you.">
            <Input className="font-mono uppercase" value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, ...gstinPatch(e.target.value, f) }))} onBlur={touch('gstin')} placeholder="27AAAAA0000A1Z5" maxLength={15} />
          </Field>
          <Field label="PAN" error={shown.pan} hint="10 characters (optional)">
            <Input className="font-mono uppercase" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10))} onBlur={touch('pan')} placeholder="ABCDE1234F" maxLength={10} />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row md:col-span-2">
            <Field label="Opening Balance (₹)" error={shown.openingBalance} className="min-w-0 flex-1">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} onBlur={touch('openingBalance')} />
            </Field>
            <Field label="Type" className="shrink-0">
              <Segmented className="flex h-[42px] items-stretch" value={form.openingBalanceType} onChange={(v) => set('openingBalanceType', v)} options={[['Dr', 'Dr · owes us'], ['Cr', 'Cr · advance']]} />
            </Field>
            <Field label="Credit Period (days)" error={shown.creditPeriodDays} className="sm:w-40">
              <Input type="number" inputMode="numeric" min="0" max="365" value={form.creditPeriodDays ?? ''} onChange={(e) => set('creditPeriodDays', e.target.value)} onBlur={touch('creditPeriodDays')} placeholder="e.g. 30" />
            </Field>
          </div>

          <Field label="Contact Number" error={shown.contact} hint="10 digits, e.g. 9876543210">
            <Input type="tel" inputMode="tel" value={form.contact} onChange={(e) => set('contact', e.target.value.replace(/[^\d+ -]/g, '').slice(0, 16))} onBlur={touch('contact')} placeholder="9876543210" />
          </Field>
          <Field label="Email Address" error={shown.email}>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value.trim())} onBlur={touch('email')} placeholder="client@example.com" />
          </Field>
          <Field label="Full Billing Address" className="md:col-span-2">
            <Textarea value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Enter complete address for invoicing..." />
          </Field>
          <Field label="State" error={shown.stateCode || errors.stateCode} hint={form.gstin.length >= 2 && !errors.stateCode && form.gstin.slice(0, 2) === form.stateCode ? 'Taken from the GSTIN' : 'Sets the place of supply (CGST+SGST or IGST)'}>
            <Select value={form.stateCode} onChange={(e) => { setForm((f) => ({ ...f, stateCode: e.target.value, city: '' })); setCustomCity(false); }} placeholder="Select State">
              {STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
            </Select>
          </Field>
          <Field label="City">
            {customCity ? (
              <div className="flex gap-2">
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Type the city" autoFocus />
                {cities.length > 0 && <Button variant="secondary" onClick={() => { setCustomCity(false); set('city', ''); }}>List</Button>}
              </div>
            ) : (
              <Select value={form.city} disabled={!form.stateCode} onChange={(e) => (e.target.value === '__other' ? (setCustomCity(true), set('city', '')) : set('city', e.target.value))}>
                <option value="">{form.stateCode ? 'Select City' : 'Select State first'}</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                {form.stateCode && <option value="__other">Other (type it)…</option>}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// Detail panel: contact card, FY balance summary and the bills still open.
function ClientDetail({ id, onClose, onEdit }) {
  const { fy, label } = useFY();
  const { can } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api.get(`/clients/${id}${fy ? `?financialYearId=${fy.id}` : ''}`, { signal: controller.signal })
      .then(setData).catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [id, fy]);
  const today = localDate();
  const outstanding = data?.openBills.reduce((n, b) => n + Number(b.outstanding), 0) || 0;
  const info = data && [
    [Phone, 'Phone', data.contact],
    [Mail, 'Email', data.email],
    [MapPin, 'Address', [data.address, data.city, stateName(data.stateCode)].filter(Boolean).join(', ')],
  ];

  return (
    <Modal title={data?.name || 'Customer'} icon={User} size="lg" onClose={onClose}
      footer={data && <>
        <Button variant="secondary" className="hidden sm:inline-flex" onClick={onClose}>Close</Button>
        {can('accounts') && <Button variant="secondary" icon={BookOpen} onClick={() => navigate(`/ledgers/${id}/statement`)}>Full statement</Button>}
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(data)}>Edit</Button>
        {can('bills_quotes') && <Button icon={FileText} onClick={() => navigate('/sales', { state: { tab: 'invoices', create: true } })}>New invoice</Button>}
      </>}>
      <Alert>{error}</Alert>
      {!data ? !error && <Loading label="Loading customer…" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2.5 rounded-xl border border-line p-4">
              {info.map(([Icon, k, v]) => (
                <div key={k} className="flex items-start gap-3 text-sm">
                  <Icon size={16} className="mt-0.5 shrink-0 text-brand" />
                  <span className={cn('min-w-0 break-words', v ? 'text-ink' : 'text-muted')}>{v || `No ${k.toLowerCase()} saved`}</span>
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-paper/60 p-4 text-sm">
              {[['GSTIN', data.gstin, true], ['PAN', data.pan, true], ['State', data.stateCode ? `${stateName(data.stateCode)} (${data.stateCode})` : ''], ['Credit period', data.creditPeriodDays ? `${data.creditPeriodDays} days` : '']].map(([k, v, mono]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-muted">{k}</dt>
                  <dd className={cn('truncate font-semibold text-ink', mono && 'font-mono text-[13px]')}>{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <section>
            <h3 className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-ink">
              Balance for {data.financialYear ? `FY ${data.financialYear.label}` : label}
              {data.financialYear && <span className="text-xs font-medium text-muted">{showDate(data.financialYear.startDate)} – {showDate(data.financialYear.endDate)}</span>}
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['Opening', drCr(data.openingBalance)], ['Billed (Dr)', inr(data.totalDebit)], ['Received (Cr)', inr(data.totalCredit)], ['Closing', drCr(data.closingBalance), true]].map(([k, v, strong]) => (
                <div key={k} className={cn('rounded-xl border p-3', strong ? 'border-olive bg-olive text-white' : 'border-line bg-white')}>
                  <p className={cn('text-[10px] font-bold uppercase tracking-widest', strong ? 'text-brand-gold' : 'text-muted')}>{k}</p>
                  <p className="mt-1 truncate text-base font-extrabold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Open bills <span className="ml-1 rounded-full bg-paper px-1.5 text-[11px] text-muted">{data.openBills.length}</span></h3>
              {outstanding > 0 && <span className="text-sm text-muted">Outstanding <strong className="tabular-nums text-ink">{inr(outstanding)}</strong></span>}
            </div>
            {data.openBills.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing outstanding. Every bill is paid.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Invoice</th>
                      <th className="hidden px-4 py-2.5 text-left sm:table-cell">Date</th>
                      <th className="px-4 py-2.5 text-left">Due</th>
                      <th className="hidden px-4 py-2.5 text-right sm:table-cell">Total</th>
                      <th className="px-4 py-2.5 text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openBills.map((b) => {
                      const overdue = b.dueDate && b.dueDate < today;
                      return (
                        <tr key={b.id} className="border-t border-line">
                          <td className="px-4 py-2.5 font-semibold">{b.invoiceNo}</td>
                          <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{showDate(b.date)}</td>
                          <td className={cn('whitespace-nowrap px-4 py-2.5', overdue ? 'font-semibold text-red-600' : 'text-muted')}>{b.dueDate ? showDate(b.dueDate) : '—'}{overdue && <span className="ml-1 text-[10px] font-bold uppercase">Overdue</span>}</td>
                          <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{inr(b.grandTotal)}</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums">{inr(b.outstanding)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useSession();
  const { fy, label: fyLabel, loaded } = useFY();
  const { stateCode: companyState } = useCompany();
  const { toast, confirm } = useFeedback();
  const [clients, setClients] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  // The customer list carries each closing balance up to the end of the selected year.
  const load = useCallback(async () => {
    try {
      const list = await api.get(`/clients${fy ? `?to=${fy.endDate}` : ''}`);
      setClients(list);
      setBalances(Object.fromEntries(list.filter((c) => c.balance !== undefined).map((c) => [String(c.id), Number(c.balance)])));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fy]);
  useEffect(() => { if (loaded) load(); }, [load, loaded]);

  const openCreate = useCallback(() => setForm(blank(companyState)), [companyState]);
  useEffect(() => {
    if (!location.state?.create) return;
    openCreate();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, openCreate]);

  const openEdit = (row) => setForm({ ...blank(), ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])), openingBalance: String(toRupees(row.openingBalance)), creditPeriodDays: row.creditPeriodDays ?? '' });

  const remove = async (row) => {
    const ok = await confirm({ title: 'Delete customer?', tone: 'danger', confirmLabel: 'Delete', message: <>Delete <strong>{row.name}</strong>? Customers that already have bills, receipts or vouchers can’t be deleted.</> });
    if (!ok) return;
    try {
      await api.del(`/clients/${row.id}`);
      toast(`${row.name} deleted.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const balanceOf = useCallback((row) => {
    if (balances && balances[String(row.id)] !== undefined) return balances[String(row.id)];
    return (row.openingBalanceType === 'Cr' ? -1 : 1) * Number(row.openingBalance || 0);
  }, [balances]);
  const balanceLabel = balances ? `Balance (${fyLabel})` : 'Opening Bal.';

  const exportCsv = () => downloadCsv(`Customers_${localDate()}.csv`,
    ['Name', 'GSTIN', 'PAN', 'State', 'City', 'Contact', 'Email', 'Address', balanceLabel, 'Dr/Cr'],
    clients.map((c) => { const b = balanceOf(c); return [c.name, c.gstin, c.pan, stateName(c.stateCode), c.city, c.contact, c.email, (c.address || '').replace(/\n/g, ' '), (Math.abs(b) / 100).toFixed(2), b < 0 ? 'Cr' : 'Dr']; }));

  const columns = useMemo(() => [
    { key: 'name', label: 'Name', sortable: true, primaryLabel: true,
      render: (v, row) => <span className="font-bold text-ink">{v}{row.city && <span className="mt-0.5 block text-xs font-normal text-muted">{row.city}</span>}</span> },
    { key: 'gstin', label: 'GSTIN', sortable: true, secondaryLabel: true,
      render: (v) => (v ? <span className="font-mono text-[13px] text-muted">{v}</span> : <span className="text-muted">Unregistered</span>) },
    { key: 'contact', label: 'Contact', hideOnTablet: true,
      render: (v, row) => (v || row.email ? <span className="text-sm">{v || '—'}{row.email && <span className="block max-w-[220px] truncate text-xs text-muted">{row.email}</span>}</span> : <span className="text-muted">—</span>) },
    { key: 'stateCode', label: 'State', align: 'center', sortable: true, sortValue: (r) => stateName(r.stateCode),
      render: (v) => <span className="text-muted">{v ? stateName(v) || v : '—'}</span> },
    { key: 'balance', label: balanceLabel, align: 'right', sortable: true, primaryAmount: true, sortValue: balanceOf,
      render: (_v, row) => <Balance value={balanceOf(row)} /> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} label="View customer" onClick={() => setDetailId(row.id)} />
          {can('accounts') && <IconButton icon={BookOpen} label="View statement" onClick={() => navigate(`/ledgers/${row.id}/statement`)} />}
          <IconButton icon={Pencil} label="Edit customer" onClick={() => openEdit(row)} />
          <IconButton icon={Trash2} label="Delete (only if it has no entries)" tone="danger" onClick={() => remove(row)} />
        </div>
      ) },
  ], [balanceLabel, balanceOf, can, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDue = useMemo(() => clients.reduce((n, c) => n + Math.max(0, balanceOf(c)), 0), [clients, balanceOf]);

  return (
    <Page>
      <PageHeader icon={Users} title="Customers"
        subtitle={<>Clients you bill, kept as ledgers under Sundry Debtors.{balances && clients.length > 0 && <> Receivable at the end of {fyLabel}: <strong className="tabular-nums text-ink">{inr(totalDue)}</strong></>}</>}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!clients.length} className="flex-1 sm:flex-none">Export</Button>
          <Button icon={Plus} onClick={openCreate} className="flex-1 sm:flex-none">Add Customer</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>
      <DataTable columns={columns} data={clients} isLoading={loading} storageKey="erp_clients_size" searchPlaceholder="Search customers by name, GSTIN, city or phone…"
        onRowClick={(row) => setDetailId(row.id)}
        emptyMessage="No customers yet" emptyHint="Add your first customer to start billing."
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add Customer</Button>} />

      {form && <ClientForm key={form.id || 'new'} initial={form} onClose={() => setForm(null)}
        onSaved={(saved) => { setForm(null); toast(`${saved.name.trim()} ${saved.id ? 'updated' : 'added'}.`); load(); }} />}
      {detailId && !form && <ClientDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(row) => openEdit(row)} />}
    </Page>
  );
}
