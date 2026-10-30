// Company settings (ERP Settings): financial years, company / tax / contact details, logo,
// bank and UPI, and document number prefixes with a live preview of the next number.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, CalendarPlus, CalendarRange, CreditCard, FileText, Hash, ImageUp, Landmark, Phone, Save, Settings as SettingsIcon, Trash2, Undo2,
} from 'lucide-react';
import { api, fileToBase64 } from '../lib/api.js';
import { cn, showDate } from '../lib/format.js';
import { STATES, stateName } from '../lib/states.js';
import { useCompany, useFY, useSession } from '../context.jsx';
import { Alert, Button, Field, Input, Loading, Page, PageHeader, Select, StatusBadge, Textarea, useFeedback } from '../components/ui.jsx';
import { citiesFor } from './masters/cities.js';
import { emailError, gstinError, ifscError, panError, phoneError, pincodeError, stateMismatch, visibleErrors } from './masters/validate.js';

const FIELDS = ['companyName', 'address', 'city', 'state', 'stateCode', 'pincode', 'gstin', 'pan', 'phone', 'email', 'website', 'upiId', 'payeeName', 'bankName', 'accountNumber', 'ifscCode', 'branch',
  'invoicePrefix', 'quotationPrefix', 'creditNotePrefix', 'nonGstInvoicePrefix', 'nonGstQuotationPrefix', 'nonGstCreditNotePrefix', 'receiptPrefix', 'paymentPrefix', 'expensePrefix', 'journalPrefix', 'contraPrefix', 'defaultFinancialYearId'];
const PREFIXES = [
  ['GST documents', [['invoicePrefix', 'Tax invoice', 'SRA'], ['quotationPrefix', 'Quotation', 'SRAQ'], ['creditNotePrefix', 'Credit note', 'SRACN']]],
  ['Non-GST documents', [['nonGstInvoicePrefix', 'Bill of supply', 'SRANG'], ['nonGstQuotationPrefix', 'Quotation', 'SRANGQ'], ['nonGstCreditNotePrefix', 'Credit note', 'SRANGCN']]],
  ['Cash & books', [['receiptPrefix', 'Receipt', 'REC'], ['expensePrefix', 'Expense', 'EXP'], ['paymentPrefix', 'Payment', 'PAY'], ['journalPrefix', 'Journal', 'JRN'], ['contraPrefix', 'Contra', 'CON']]],
];
const normalise = (s) => Object.fromEntries(FIELDS.map((k) => [k, s?.[k] == null ? '' : String(s[k])]));

function Section({ icon: Icon, title, description, actions, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Icon size={22} className="text-brand" />{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function LogoCard({ hasLogo, onChanged }) {
  const { toast, confirm } = useFeedback();
  const [version, setVersion] = useState(() => Date.now());
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('Logo must be a PNG, JPG or WebP image.');
    if (file.size > 1024 * 1024) return setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the logo must be under 1 MB.`);
    setBusy(true); setError('');
    try {
      await api.post('/settings/logo', { contentType: file.type, data: await fileToBase64(file) });
      setVersion(Date.now()); setBroken(false);
      onChanged(true);
      toast('Logo uploaded. It will appear on new quotations and invoices.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Remove logo?', tone: 'danger', confirmLabel: 'Remove', message: 'Documents will print without a logo until you upload a new one.' }))) return;
    setBusy(true);
    try { await api.del('/settings/logo'); onChanged(false); toast('Logo removed.'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Section icon={ImageUp} title="Company Logo" description="Printed on quotations and invoices. PNG, JPG or WebP under 1 MB; a wide logo on a transparent background looks best.">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-paper p-3 sm:w-64">
          {hasLogo && !broken
            ? <img src={`/api/erp/settings/logo?v=${version}`} alt="Company logo" className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
            : <span className="text-center text-xs text-muted">{hasLogo ? 'Logo saved, but it couldn’t be loaded here.' : 'No logo uploaded yet'}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} />
          <Button variant="secondary" icon={ImageUp} loading={busy} onClick={() => input.current?.click()}>{hasLogo ? 'Replace logo' : 'Upload logo'}</Button>
          {hasLogo && <Button variant="danger" icon={Trash2} disabled={busy} onClick={remove}>Remove</Button>}
        </div>
      </div>
    </Section>
  );
}

export default function Settings() {
  const { can } = useSession();
  const { years, fy, reload: reloadFY } = useFY();
  const company = useCompany();
  const { toast, confirm } = useFeedback();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(() => api.get('/settings').then((s) => { const n = normalise(s); setSaved(n); setForm(n); setHasLogo(Boolean(s?.logoPath)); }).catch((err) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => form && saved && FIELDS.some((k) => form[k] !== saved[k]), [form, saved]);
  if (!can('settings')) return <Page><Alert>You don’t have access to company settings.</Alert></Page>;
  if (!form) return error ? <Page><Alert>{error}</Alert></Page> : <Loading label="Loading settings…" />;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const errors = {
    companyName: form.companyName.trim() ? '' : 'Company name is printed on every document.',
    gstin: gstinError(form.gstin), pan: panError(form.pan, form.gstin), phone: phoneError(form.phone), email: emailError(form.email),
    pincode: pincodeError(form.pincode), ifscCode: ifscError(form.ifscCode), stateCode: stateMismatch(form.gstin, form.stateCode),
  };
  const shown = visibleErrors(errors, touched, submitted);
  const fyLabel = fy?.label || years[0]?.label || '2026-27';
  const setState = (code) => setForm((f) => ({ ...f, stateCode: code, state: stateName(code) }));
  const setGstin = (raw) => setForm((f) => {
    const gstin = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    const code = gstin.slice(0, 2);
    return { ...f, gstin, ...(stateName(code) && /^\d{2}$/.test(code) ? { stateCode: code, state: stateName(code) } : {}), ...(gstin.length === 15 && !f.pan ? { pan: gstin.slice(2, 12) } : {}) };
  });

  const save = async (e) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) { toast('Fix the highlighted fields first.', 'error'); return; }
    setBusy(true); setError('');
    try {
      await api.put('/settings', { ...form, defaultFinancialYearId: form.defaultFinancialYearId || null });
      setSaved(form); setSubmitted(false); setTouched({});
      company.reload();
      toast('Settings saved.');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addYear = async () => {
    const latest = Math.max(0, ...years.map((y) => Number(String(y.startDate).slice(0, 4))));
    const suggested = latest ? latest + 1 : new Date().getFullYear();
    const value = await confirm({
      title: 'Add financial year', confirmLabel: 'Add year',
      message: 'Add a financial year before recording bills or vouchers in it. An Indian FY runs 1 April → 31 March.',
      input: { label: 'Start year', type: 'number', required: true, defaultValue: String(suggested), hint: `e.g. ${suggested} creates FY ${suggested}-${String((suggested + 1) % 100).padStart(2, '0')}` },
    });
    if (value === null) return;
    try {
      const created = await api.post('/financial-years', { startYear: Number(value) });
      await reloadFY();
      toast(`FY ${created.label} added.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const text = (key, label, props = {}) => (
    <Field key={key} label={label} required={props.required} error={shown[key]} hint={props.hint} className={props.className}>
      <Input value={form[key]} onChange={(e) => set(key, props.upper ? e.target.value.toUpperCase() : e.target.value)} onBlur={touch(key)} placeholder={props.placeholder}
        type={props.type} inputMode={props.inputMode} maxLength={props.maxLength} className={props.mono ? 'font-mono' : undefined} />
    </Field>
  );

  return (
    <Page className="mx-auto max-w-5xl pb-28">
      <PageHeader icon={SettingsIcon} title="Company Settings" subtitle="Company details, bank information and document numbering used on every bill."
        actions={<Button type="submit" form="settings-form" icon={Save} loading={busy} disabled={!dirty} className="w-full sm:w-auto">Save Settings</Button>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="space-y-6">
        <Section icon={CalendarRange} title="Financial Years" description="Every list, total and report is scoped to a financial year. Indian FY runs 1 April → 31 March."
          actions={<Button variant="secondary" icon={CalendarPlus} onClick={addYear}>Add financial year</Button>}>
          {years.length === 0 ? (
            <Alert tone="warning" className="mb-0">No financial years yet. Add one before issuing documents.</Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <span key={y.id} title={`${showDate(y.startDate)} – ${showDate(y.endDate)}`}
                  className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold', String(y.id) === String(fy?.id) ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white text-ink')}>
                  FY {y.label}
                  <StatusBadge status={y.status} className="px-1.5 text-[10px]" />
                  {String(y.id) === form.defaultFinancialYearId && <span className="text-[10px] font-bold uppercase text-brand">Default</span>}
                </span>
              ))}
            </div>
          )}
          <Field label="Default financial year" hint="The year the FY picker opens on for anyone who has not chosen one yet." className="mt-5 sm:max-w-xs">
            <Select value={form.defaultFinancialYearId} onChange={(e) => set('defaultFinancialYearId', e.target.value)}>
              <option value="">The year covering today</option>
              {years.map((y) => <option key={y.id} value={String(y.id)}>FY {y.label} ({y.status})</option>)}
            </Select>
          </Field>
        </Section>

        <form id="settings-form" onSubmit={save} noValidate className="space-y-6">
          <Section icon={Building2} title="Company Information">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {text('companyName', 'Company Name', { required: true, placeholder: 'SRA Consultancy', className: 'md:col-span-2' })}
              <Field label="Address" className="md:col-span-2">
                <Textarea value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Office no., building, street, area" />
              </Field>
              <Field label="State" error={shown.stateCode || errors.stateCode} hint="Decides CGST + SGST vs IGST on your bills">
                <Select value={form.stateCode} onChange={(e) => setState(e.target.value)} placeholder="Select State">
                  {STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                </Select>
              </Field>
              <Field label="City">
                <Input list="settings-cities" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder={citiesFor(form.stateCode)[0] || 'City'} />
                <datalist id="settings-cities">{citiesFor(form.stateCode).map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              {text('pincode', 'Pincode', { placeholder: '422001', inputMode: 'numeric', maxLength: 6 })}
              <Field label="State Code" hint="Set from the state">
                <Input value={form.stateCode ? `${form.stateCode} · ${stateName(form.stateCode)}` : ''} readOnly tabIndex={-1} />
              </Field>
            </div>
          </Section>

          <Section icon={FileText} title="Tax Information">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="GSTIN" error={shown.gstin} hint="15 characters. Fills the state and PAN for you.">
                <Input className="font-mono uppercase" value={form.gstin} maxLength={15} onChange={(e) => setGstin(e.target.value)} onBlur={touch('gstin')} placeholder="27AAAAA0000A1Z5" />
              </Field>
              {text('pan', 'PAN', { upper: true, mono: true, maxLength: 10, placeholder: 'ABCDE1234F' })}
            </div>
          </Section>

          <Section icon={Phone} title="Contact Information">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {text('phone', 'Phone Number', { type: 'tel', inputMode: 'tel', placeholder: '9876543210', hint: '10 digits, e.g. 9876543210' })}
              {text('email', 'Email', { type: 'email', placeholder: 'accounts@sraconsultancy.in' })}
              {text('website', 'Website', { placeholder: 'www.sraconsultancy.in' })}
            </div>
          </Section>

          <LogoCard hasLogo={hasLogo} onChanged={(has) => { setHasLogo(has); company.reload(); }} />

          <Section icon={Landmark} title="Bank Information" description="Printed on invoices so clients can pay by transfer.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {text('bankName', 'Bank Name', { placeholder: 'HDFC Bank / ICICI Bank / Axis Bank' })}
              {text('accountNumber', 'Account Number', { mono: true, inputMode: 'numeric', placeholder: '1234567890' })}
              {text('ifscCode', 'IFSC Code', { upper: true, mono: true, maxLength: 11, placeholder: 'HDFC0001234' })}
              {text('branch', 'Branch Name', { placeholder: 'College Road Branch' })}
            </div>
          </Section>

          <Section icon={CreditCard} title="Payment Information (Optional)" description="Adds a UPI QR code to invoices.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {text('upiId', 'UPI ID', { placeholder: 'company@upi' })}
              {text('payeeName', 'Payee Name', { placeholder: form.companyName || 'Company Name' })}
            </div>
          </Section>

          <Section icon={Hash} title="Document Number Prefixes" description={`Numbers restart each financial year. Preview uses FY ${fyLabel}.`}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {PREFIXES.map(([group, items]) => (
                <div key={group} className="rounded-xl border border-line bg-paper/50 p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted">{group}</p>
                  <div className="space-y-3">
                    {items.map(([key, label, fallback]) => (
                      <div key={key} className="grid grid-cols-[1fr_auto] items-end gap-3">
                        <Field label={label}>
                          <Input className="font-mono uppercase" maxLength={20} value={form[key]} placeholder={fallback} onChange={(e) => set(key, e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
                        </Field>
                        <span className="mb-2.5 whitespace-nowrap rounded-md bg-white px-2 py-1 font-mono text-xs font-semibold text-brand-dark shadow-sm" title="Next number preview">
                          {form[key] || fallback}/{fyLabel}/0001
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="hidden justify-end sm:flex">
            <Button type="submit" size="lg" icon={Save} loading={busy} disabled={!dirty}>Save Settings</Button>
          </div>
        </form>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:left-auto lg:right-6 lg:bottom-6 lg:rounded-xl lg:border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">Unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={Undo2} disabled={busy} onClick={() => { setForm(saved); setTouched({}); setSubmitted(false); }}>Discard</Button>
              <Button size="sm" icon={Save} loading={busy} onClick={save}>Save Settings</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
