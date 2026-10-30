// AI Site Estimates: photo-assisted BOQ drafts in the ERP list layout. A row opens the review
// workspace (/estimates/:id); "New estimate" starts a draft, optionally from a website enquiry.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ban, ChevronRight, ClipboardList, Download, FileText, Images, Inbox, MapPin, Phone, Plus, Sparkles, Wand2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, downloadCsv, inr0, localDate, showDate } from '../lib/format.js';
import { STATES } from '../lib/states.js';
import { useFY } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import {
  Alert, Button, Field, IconButton, Input, Modal, Page, PageHeader, Segmented, Select, StatCard, StatusBadge, Textarea, useFeedback,
} from '../components/ui.jsx';
import { STATUS_FILTERS } from './estimates/shared.js';

const dayOf = (ts) => (ts ? localDate(new Date(ts)) : '');
const blankForm = () => ({ enquiryId: '', clientLedgerId: '', title: '', location: '', buildingType: '', problemNote: '', isNonGst: true, placeOfSupplyStateCode: '', contingencyPct: '15' });

function CreateModal({ clients, enquiries, onClose, onCreated }) {
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const enquiry = enquiries ? enquiries.find((q) => String(q.id) === String(form.enquiryId)) : null;

  // Picking an enquiry fills the brief from it; the server creates the customer if needed.
  const chooseEnquiry = (enquiryId) => {
    const q = (enquiries || []).find((x) => String(x.id) === enquiryId);
    setForm((f) => ({
      ...f,
      enquiryId,
      title: q && !f.title ? `Site estimate – ${q.place || q.name}` : f.title,
      location: q?.place || f.location,
      buildingType: q?.buildingType || f.buildingType,
      problemNote: q?.message || f.problemNote,
    }));
  };
  const chooseClient = (clientLedgerId) => {
    const client = clients.find((c) => String(c.id) === clientLedgerId);
    setForm((f) => ({ ...f, clientLedgerId, placeOfSupplyStateCode: client?.stateCode || f.placeOfSupplyStateCode, location: f.location || client?.city || '' }));
  };

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    if (!form.clientLedgerId && !form.enquiryId) return setError('Choose a customer, or start from a website enquiry.');
    if (!form.title.trim()) return setError('Enter an estimate title.');
    setBusy(true);
    try {
      const created = await api.post('/estimates', { ...form, contingencyPct: Number(form.contingencyPct || 0) });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="New Site Estimate" icon={Sparkles} size="lg" onClose={onClose} busy={busy}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Discard</Button>
        <Button type="submit" form="estimate-form" icon={Plus} loading={busy}>Create Draft</Button>
      </>}>
      <form id="estimate-form" onSubmit={submit}>
        {error && <Alert onClose={() => setError('')} className="animate-shake">{error}</Alert>}
        {enquiries && (
          <div className="mb-5 rounded-xl border border-brand-tint bg-brand-soft p-4">
            <Field label="From Website Enquiry" hint={enquiries.length ? 'Optional. Prefills the brief, and creates the customer if they are new.' : 'There are no open website enquiries without an estimate.'}>
              <Select value={form.enquiryId} onChange={(e) => chooseEnquiry(e.target.value)} disabled={!enquiries.length} placeholder={enquiries.length ? 'No enquiry — start from a customer' : 'No open enquiries'}>
                {enquiries.map((q) => <option key={q.id} value={q.id}>{q.name} · {q.place || '—'} · {showDate(dayOf(q.receivedAt))}</option>)}
              </Select>
            </Field>
            {enquiry && (
              <div className="mt-3 rounded-lg border border-line bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-bold text-ink">{enquiry.name}</span>
                  {enquiry.phone && <span className="flex items-center gap-1 text-muted"><Phone size={13} />{enquiry.phone}</span>}
                  {enquiry.place && <span className="flex items-center gap-1 text-muted"><MapPin size={13} />{enquiry.place}</span>}
                </div>
                {enquiry.message && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted">{enquiry.message}</p>}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer" required={!form.enquiryId} hint={form.enquiryId ? 'Leave as is to use or create the customer from the enquiry.' : undefined} className="sm:col-span-2">
            <Select value={form.clientLedgerId} onChange={(e) => chooseClient(e.target.value)} placeholder={form.enquiryId ? 'Create from the enquiry' : 'Select customer'}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Estimate Title" required className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. RCC column repair – Wing B" />
          </Field>
          <Field label="Site Location" required>
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Area, city" required />
          </Field>
          <Field label="Building Type">
            <Input value={form.buildingType} onChange={(e) => set('buildingType', e.target.value)} placeholder="Residential / commercial" />
          </Field>
          <Field label="Quotation Type" hint="You can change this during review.">
            <Segmented value={form.isNonGst ? 'nongst' : 'gst'} onChange={(v) => set('isNonGst', v === 'nongst')} options={[['nongst', 'Non-GST'], ['gst', 'GST']]} />
          </Field>
          <Field label="Contingency %" hint="10–20% depending on uncertainty.">
            <Input type="number" min="0" max="100" step="0.5" value={form.contingencyPct} onChange={(e) => set('contingencyPct', e.target.value)} />
          </Field>
          <Field label="Place of Supply" className="sm:col-span-2" hint="Defaults to the customer's state.">
            <Select value={form.placeOfSupplyStateCode} onChange={(e) => set('placeOfSupplyStateCode', e.target.value)} placeholder="Customer's state">
              {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
            </Select>
          </Field>
          <Field label="Observed Problem & Scope" required className="sm:col-span-2" hint="What you saw on site, the scope and access limits. Claude reads this with the photos.">
            <Textarea rows={4} value={form.problemNote} onChange={(e) => set('problemNote', e.target.value)} placeholder="e.g. Spalling concrete and exposed rebar at ground-floor column C4." required />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function Estimates() {
  const navigate = useNavigate();
  const location = useLocation();
  const { inFy, label: fyLabel } = useFY();
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [enquiries, setEnquiries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, c] = await Promise.all([api.get('/estimates'), api.get('/clients').catch(() => [])]);
      setRows(list); setClients(c); setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // Needs the enquiries permission as well; without it estimates start from a customer.
    api.get('/estimates/enquiries').then(setEnquiries).catch(() => setEnquiries(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!location.state?.create) return;
    setCreating(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const scoped = useMemo(() => rows.filter((r) => inFy(dayOf(r.createdAt))), [rows, inFy]);
  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map(([key]) => [key, key === 'all' ? scoped.length : scoped.filter((r) => r.status === key).length])), [scoped]);
  const data = useMemo(() => (filter === 'all' ? scoped : scoped.filter((r) => r.status === filter)), [scoped, filter]);
  const open = (row) => navigate(`/estimates/${row.id}`);

  const discard = async (row) => {
    const ok = await confirm({ title: `Discard “${row.title}”?`, message: 'It stays in the list for reference but can no longer be edited or turned into a quotation.', confirmLabel: 'Discard estimate', tone: 'danger' });
    if (!ok) return;
    try { await api.post(`/estimates/${row.id}/discard`); toast('Estimate discarded.', 'info'); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const exportCsv = () => downloadCsv(`site-estimates-${localDate()}.csv`, ['No.', 'Title', 'Customer', 'Location', 'Photos', 'Status', 'Quotation', 'Created'],
    data.map((r) => [r.id, r.title, r.clientName, r.location, r.photos, r.status, r.quotationNo || '', showDate(dayOf(r.createdAt))]));

  const columns = useMemo(() => [
    { key: 'title', label: 'Estimate', sortable: true, primaryLabel: true, render: (v, r) => (
      <div className="min-w-0">
        <p className="truncate font-bold text-ink">{v}</p>
        <p className="truncate text-xs text-muted">#{r.id}{r.isNonGst ? ' · Non-GST' : ' · GST'} · {r.contingencyPct}% contingency</p>
      </div>
    ) },
    { key: 'clientName', label: 'Customer', sortable: true, secondaryLabel: true, render: (v) => v || '—' },
    { key: 'location', label: 'Location', sortable: true, hideOnTablet: true, render: (v) => (v ? <span className="flex items-center gap-1.5"><MapPin size={14} className="shrink-0 text-muted" />{v}</span> : <span className="text-muted">—</span>) },
    { key: 'photos', label: 'Photos', sortable: true, align: 'center', render: (v) => <span className={cn('inline-flex items-center gap-1.5 tabular-nums', v ? 'text-ink' : 'text-[#A8A69F]')}><Images size={15} />{v}</span> },
    { key: 'quotedBase', label: 'Quoted (before tax)', align: 'right', sortable: true, hideOnTablet: true, sortValue: (r) => Number(r.quotedBase || 0),
      render: (v, r) => (r.items ? <span className="whitespace-nowrap"><span className="font-semibold tabular-nums">{inr0(v)}</span><span className="block text-[11px] text-muted">{r.items} line{r.items === 1 ? '' : 's'}</span></span> : <span className="text-muted">—</span>) },
    { key: 'status', label: 'Status', sortable: true, primaryAmount: true, render: (v, r) => (
      <div className="flex flex-col items-end gap-0.5 md:items-start">
        <StatusBadge status={v} />
        {r.quotationNo && <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted"><FileText size={12} />{r.quotationNo}</span>}
      </div>
    ) },
    { key: 'createdAt', label: 'Created', sortable: true, render: (v) => <span className="whitespace-nowrap">{showDate(dayOf(v))}</span> },
    { key: 'actions', label: 'Actions', align: 'right', render: (_, r) => (
      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={ChevronRight} label={['quoted', 'discarded'].includes(r.status) ? 'View estimate' : 'Open and review'} onClick={() => open(r)} />
        {['draft', 'analysed'].includes(r.status) && <IconButton icon={Ban} label="Discard estimate" tone="danger" onClick={() => discard(r)} />}
      </div>
    ) },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles = [
    ['all', 'Estimates', ClipboardList, 'dark', fyLabel],
    ['draft', 'Drafts', Images, 'amber', 'Waiting for photos or analysis'],
    ['analysed', 'To Review', Wand2, 'brand', 'Lines drafted, not yet quoted'],
    ['quoted', 'Quoted', FileText, 'green', 'Turned into quotations'],
  ];

  return (
    <Page>
      <PageHeader icon={Sparkles} title="AI Site Estimates" subtitle="Photo-assisted BOQ drafts. Every estimate is reviewed and approved before it becomes a quotation."
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data.length}>Export</Button>
          <Button icon={Plus} onClick={() => setCreating(true)}>New Estimate</Button>
        </>} />
      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {tiles.map(([key, label, icon, tone, hint]) => (
          <StatCard key={key} label={label} value={loading ? '…' : counts[key]} hint={hint} icon={icon} tone={tone} onClick={() => setFilter(key)} />
        ))}
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={loading}
        searchPlaceholder="Search by title, customer or location…"
        storageKey="erp_estimates_size"
        onRowClick={open}
        minWidth="900px"
        emptyMessage={filter === 'all' ? 'No site estimates yet' : `No ${STATUS_FILTERS.find(([k]) => k === filter)?.[1].toLowerCase()} estimates`}
        emptyHint={filter === 'all' ? `Nothing created in ${fyLabel}. Start one from site photos.` : 'Try another status.'}
        emptyAction={<Button icon={Plus} onClick={() => setCreating(true)}>New Estimate</Button>}
        rowClassName={(r) => (r.status === 'discarded' ? 'opacity-60' : '')}
        toolbar={
          <div className="scrollbar-none -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1">
            {STATUS_FILTERS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === key ? 'border-brand bg-brand text-white shadow-sm' : 'border-line bg-white text-muted hover:border-brand-tint hover:text-ink')}>
                {label}
                <span className={cn('rounded-full px-1.5 text-[10px] font-bold', filter === key ? 'bg-white/20' : 'bg-paper')}>{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>
        }
      />
      {enquiries?.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Inbox size={14} /> {enquiries.length} website enquir{enquiries.length === 1 ? 'y has' : 'ies have'} no estimate yet.{' '}
          <button type="button" className="font-bold text-brand hover:text-brand-dark" onClick={() => setCreating(true)}>Start one →</button>
        </p>
      )}

      {creating && (
        <CreateModal clients={clients} enquiries={enquiries} onClose={() => setCreating(false)}
          onCreated={(created) => { setCreating(false); toast('Draft estimate created. Add site photos next.'); navigate(`/estimates/${created.id}`); }} />
      )}
    </Page>
  );
}
