// HSN / SAC codes (ERP HsnSacCodes): All / HSN / SAC tabs, FY usage counts, a usage panel per
// code, the Code Lookup picker, and add / edit for custom codes (default codes are locked).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronDown, Download, Eye, Lock, Pencil, Plus, Save, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, localDate } from '../lib/format.js';
import { useFY } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, IconButton, Input, Modal, Page, PageHeader, Select, Textarea, useFeedback } from '../components/ui.jsx';
import { CodeDocuments, CodeUsage, GST_RATES, HsnNav, RatePill, TypePill, sumUsage } from './masters/HsnShared.jsx';

const blank = { code: '', description: '', type: 'SAC', gstRatePct: 18, notes: '' };
const codeError = (code, type) => {
  if (!code) return 'Enter the code.';
  if (!/^\d+$/.test(code)) return 'Use digits only.';
  if (type === 'SAC' && (code.length < 4 || code.length > 6 || !code.startsWith('99'))) return 'SAC codes start with 99 and have 4–6 digits, e.g. 998314';
  if (type === 'HSN' && ![2, 4, 6, 8].includes(code.length)) return 'HSN codes are 2, 4, 6 or 8 digits, e.g. 2523';
  return '';
};

function CodeForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const errors = { code: codeError(form.code, form.type), description: form.description.trim() ? '' : 'Describe what this code covers.' };
  const show = (k) => (submitted || touched[k]) && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.code || errors.description) return;
    setBusy(true); setError('');
    try {
      const body = { ...form, description: form.description.trim(), gstRatePct: Number(form.gstRatePct) };
      await (form.id ? api.put(`/hsn-sac/${form.id}`, body) : api.post('/hsn-sac', body));
      onSaved(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={form.id ? 'Edit HSN/SAC Code' : 'Add HSN/SAC Code'} icon={form.id ? Pencil : Plus} size="sm" onClose={onClose} busy={busy}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form="hsn-form" icon={Save} loading={busy}>{form.id ? 'Update' : 'Save'}</Button>
      </>}>
      <form id="hsn-form" onSubmit={submit} noValidate className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Type" required>
          <div className="flex gap-3">
            {['HSN', 'SAC'].map((t) => (
              <button key={t} type="button" onClick={() => set('type', t)} aria-pressed={form.type === t}
                className={cn('flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all', form.type === t ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand-gold')}>
                {t === 'HSN' ? 'HSN (Goods)' : 'SAC (Services)'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Code" required error={show('code')} hint={form.type === 'SAC' ? 'Starts with 99, usually 6 digits' : '4, 6 or 8 digits'}>
          <Input className="font-mono" inputMode="numeric" value={form.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, '').slice(0, 8))} onBlur={() => setTouched((t) => ({ ...t, code: true }))} placeholder={form.type === 'SAC' ? 'e.g. 998314' : 'e.g. 2523'} />
        </Field>
        <Field label="Description" required error={show('description')}>
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, description: true }))} placeholder="e.g. Structural engineering consultancy services" />
        </Field>
        <Field label="GST Rate" required>
          <Select value={form.gstRatePct} onChange={(e) => set('gstRatePct', Number(e.target.value))}>
            {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ERP Code Lookup: searchable picker grouped by type, then the usage for the chosen code.
function CodeLookup({ codes, usageByCode, periodLabel }) {
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const box = useRef(null);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const q = search.trim().toLowerCase();
  const match = codes.filter((c) => !q || c.code.includes(q) || c.description.toLowerCase().includes(q));
  const quick = useMemo(() => {
    const used = [...codes].map((c) => [c, sumUsage(usageByCode[c.code] || []).lines]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return (used.length ? used : codes).slice(0, 4);
  }, [codes, usageByCode]);
  const pick = (c) => { setSelected(c); setOpen(false); setSearch(''); };
  const Option = ({ c }) => (
    <button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-brand-soft">
      <span className="w-20 shrink-0 font-mono text-sm font-semibold text-ink">{c.code}</span>
      <span className="flex-1 truncate text-sm text-muted">{c.description}</span>
      <RatePill rate={c.gstRatePct} />
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <label className="block text-sm font-bold text-ink">Select HSN / SAC Code</label>
        <p className="mb-3 mt-0.5 text-xs text-muted">Choose a code to see how much was billed under it in {periodLabel}.</p>
        <div className="relative" ref={box}>
          {selected ? (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-brand bg-brand-soft/60 px-4 py-2.5">
              <span className="font-mono text-sm font-semibold text-ink">{selected.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted">{selected.description}</span>
              <RatePill rate={selected.gstRatePct} /><TypePill type={selected.type} />
              <button type="button" onClick={() => setSelected(null)} title="Clear selection" className="rounded-full p-0.5 text-muted hover:bg-white hover:text-ink"><X size={16} /></button>
            </div>
          ) : (
            <>
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
              <Input className="pl-10 pr-10" value={search} placeholder="Search or select a code…" onFocus={() => setOpen(true)} onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && match[0]) { e.preventDefault(); pick(match[0]); } if (e.key === 'Escape') setOpen(false); }} />
              <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            </>
          )}
          {open && !selected && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-white shadow-xl">
              {!match.length && <p className="px-3 py-4 text-center text-sm text-muted">No codes match “{search}”</p>}
              {['HSN', 'SAC'].map((t) => match.some((c) => c.type === t) && (
                <div key={t}>
                  <p className="sticky top-0 bg-paper px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">{t === 'HSN' ? 'HSN (Goods)' : 'SAC (Services)'}</p>
                  {match.filter((c) => c.type === t).map((c) => <Option key={c.id} c={c} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-bold text-ink">GST invoices using <span className="font-mono">{selected.code}</span> <span className="font-medium text-muted">— {selected.description}</span></h3>
          <CodeUsage code={selected.code} rows={usageByCode[selected.code] || []} periodLabel={periodLabel} />
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft"><Tag size={32} className="text-brand" /></div>
          <h3 className="text-lg font-bold text-ink">Select a code to begin</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Pick any HSN or SAC code above to see the invoices, taxable value and GST billed under it.</p>
          {quick.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Most used codes</p>
              <div className="flex flex-wrap justify-center gap-2">
                {quick.map((c) => <button key={c.id} type="button" onClick={() => pick(c)} className="rounded-full border border-line bg-white px-4 py-1.5 font-mono text-sm font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-soft">{c.code}</button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HsnSac() {
  const navigate = useNavigate();
  const location = useLocation();
  const { fy, label: fyLabel, loaded } = useFY();
  const { toast, confirm } = useFeedback();
  const [codes, setCodes] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [form, setForm] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const q = fy ? `?from=${fy.startDate}&to=${fy.endDate}` : '';
      const [list, used] = await Promise.all([api.get('/hsn-sac'), api.get(`/hsn-sac/usage${q}`).catch(() => [])]);
      setCodes(list); setUsage(used); setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fy]);
  useEffect(() => { if (loaded) load(); }, [load, loaded]);
  useEffect(() => {
    if (!location.state) return;
    if (location.state.create) setForm({ ...blank });
    if (location.state.tab) setTab(location.state.tab);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const usageByCode = useMemo(() => usage.reduce((m, r) => ({ ...m, [r.code]: [...(m[r.code] || []), r] }), {}), [usage]);
  const rows = useMemo(() => codes.map((c) => ({ ...c, used: sumUsage(usageByCode[c.code] || []).invoices })).filter((c) => tab === 'all' || c.type === tab), [codes, usageByCode, tab]);
  const counts = useMemo(() => ({ all: codes.length, HSN: codes.filter((c) => c.type === 'HSN').length, SAC: codes.filter((c) => c.type === 'SAC').length }), [codes]);

  const remove = async (row) => {
    const ok = await confirm({ title: 'Delete code?', tone: 'danger', confirmLabel: 'Delete', message: <>Delete HSN/SAC code <strong className="font-mono">{row.code}</strong>? Codes already used on documents can’t be deleted.</> });
    if (!ok) return;
    try { await api.del(`/hsn-sac/${row.id}`); toast(`${row.code} deleted.`); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const exportCsv = () => downloadCsv(`HSN_SAC_Codes_${localDate()}.csv`, ['Code', 'Description', 'Type', 'GST Rate', `Invoices (${fyLabel})`, 'Default'],
    rows.map((c) => [c.code, c.description, c.type, `${c.gstRatePct}%`, c.used, c.isDefault ? 'Yes' : 'No']));

  const columns = useMemo(() => [
    { key: 'code', label: 'Code', sortable: true, primaryLabel: true,
      render: (v, row) => <span className="inline-flex items-center gap-2"><span className="font-mono font-semibold text-ink">{v}</span>{row.isDefault && <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Default</span>}</span> },
    { key: 'description', label: 'Description', sortable: true, secondaryLabel: true,
      render: (v, row) => <span className="text-ink">{v}{row.notes && <span className="block text-xs text-muted">{row.notes}</span>}</span> },
    { key: 'gstRatePct', label: 'GST Rate', align: 'center', sortable: true, render: (v) => <RatePill rate={v} /> },
    { key: 'type', label: 'Type', align: 'center', sortable: true, hideOnTablet: true, render: (v) => <TypePill type={v} /> },
    { key: 'used', label: `Used In (${fyLabel})`, align: 'center', sortable: true,
      render: (v, row) => (v ? <button type="button" onClick={(e) => { e.stopPropagation(); setViewing(row); }} className="text-xs font-bold text-brand hover:underline">{v} Invoice{v === 1 ? '' : 's'}</button> : <span className="text-xs text-muted">0 Invoices</span>) },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} label="View usage" onClick={() => setViewing(row)} />
          {row.isDefault ? (
            <span title="Default code: part of the standard list, so it can’t be edited or deleted." className="rounded-md p-1.5 text-muted/70"><Lock size={16} /></span>
          ) : <>
            <IconButton icon={Pencil} label="Edit" onClick={() => setForm({ ...row, notes: row.notes || '' })} />
            <IconButton icon={Trash2} tone="danger" label={row.used ? 'Cannot delete: code is in use' : 'Delete'} disabled={Boolean(row.used)} onClick={() => remove(row)} />
          </>}
        </div>
      ) },
  ], [fyLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader icon={Tag} title="HSN / SAC Codes" subtitle="GST codes for your bills. Default codes are locked; add your own for anything else."
        actions={<>
          <Button variant="secondary" icon={BarChart3} onClick={() => navigate('/hsn-sac/reports')} className="flex-1 sm:flex-none">Usage summary</Button>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length} className="flex-1 sm:flex-none">Export</Button>
          <Button icon={Plus} onClick={() => setForm({ ...blank })} className="flex-1 sm:flex-none">Add HSN/SAC</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>
      <HsnNav value={tab} onChange={setTab} counts={counts} />

      {tab === 'lookup' ? <CodeLookup codes={codes} usageByCode={usageByCode} periodLabel={fyLabel} /> : (
        <DataTable columns={columns} data={rows} isLoading={loading} storageKey="erp_hsn_size" searchPlaceholder="Search HSN/SAC codes…" minWidth="760px"
          onRowClick={(row) => setViewing(row)}
          emptyMessage="No HSN/SAC codes found" emptyHint="Add the codes you bill under."
          emptyAction={<Button icon={Plus} onClick={() => setForm({ ...blank })}>Add HSN/SAC</Button>} />
      )}

      {form && <CodeForm key={form.id || 'new'} initial={form} onClose={() => setForm(null)}
        onSaved={(saved) => { setForm(null); toast(`${saved.code} ${saved.id ? 'updated' : 'added'}.`); load(); }} />}
      {viewing && (
        <Modal size="lg" icon={Eye} title={<>Used In — <span className="font-mono">{viewing.code}</span></>} onClose={() => setViewing(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
            <Button icon={BarChart3} onClick={() => navigate('/hsn-sac/reports')}>Full usage summary</Button>
          </>}>
          <p className="mb-4 text-sm text-muted">{viewing.description} · GST invoices in {fyLabel}</p>
          <CodeUsage code={viewing.code} rows={usageByCode[viewing.code] || []} periodLabel={fyLabel} />
          <CodeDocuments code={viewing.code} from={fy?.startDate} to={fy?.endDate} />
        </Modal>
      )}
    </Page>
  );
}
