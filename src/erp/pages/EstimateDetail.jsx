// One AI site estimate as a review workspace: photos → Claude analysis → line-by-line review →
// approval into a draft quotation. Quoted and discarded estimates open read-only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, Check, CircleCheck, ClipboardList, FileSpreadsheet, FileText, Images, ListChecks, Lock, NotebookPen, Save,
  Sparkles, Wand2,
} from 'lucide-react';
import { api, openDocument } from '../lib/api.js';
import { cn, dateTime, inr0 } from '../lib/format.js';
import { STATES, stateName } from '../lib/states.js';
import { useFY, useSession } from '../context.jsx';
import {
  Alert, Button, Card, EmptyState, Field, Input, Loading, Page, PageHeader, Segmented, Select, StatusBadge, Summary, Tag, Textarea, useFeedback,
} from '../components/ui.jsx';
import LineGrid from './estimates/LineGrid.jsx';
import { AnalysePanel, PhotosCard } from './estimates/Photos.jsx';
import { approvalIssues, blankItem, estimateTotals, fromApi, groupBySection, patchItem, toApi } from './estimates/shared.js';

const metaOf = (e) => ({
  title: e.title || '', location: e.location || '', buildingType: e.buildingType || '', problemNote: e.problemNote || '',
  isNonGst: e.isNonGst !== false, placeOfSupplyStateCode: e.placeOfSupplyStateCode || '', contingencyPct: String(e.contingencyPct ?? 15),
  basisLine: e.basisLine || '', importantNote: e.importantNote || '',
  assumptions: (e.assumptions || []).join('\n'), exclusions: (e.exclusions || []).join('\n'),
});
const lines = (text) => text.split('\n').map((x) => x.trim()).filter(Boolean);
const metaToApi = (m) => ({ ...m, contingencyPct: Number(m.contingencyPct || 0), assumptions: lines(m.assumptions), exclusions: lines(m.exclusions) });
const snapshot = (meta, items) => JSON.stringify([metaToApi(meta), items.map(toApi)]);

// 1 Photos → 2 Analyse → 3 Review → 4 Quote
function Stepper({ steps, onJump }) {
  return (
    <ol className="mb-6 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-white p-2 shadow-card sm:gap-2 sm:p-3">
      {steps.map((s, i) => (
        <li key={s.label} className="min-w-0">
          <button type="button" onClick={() => onJump(s.target)} title={s.hint}
            className={cn('flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:text-left',
              s.state === 'current' ? 'bg-brand-soft ring-1 ring-brand-tint' : 'hover:bg-paper')}>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              s.state === 'done' && 'bg-emerald-500 text-white',
              s.state === 'current' && 'bg-brand text-white shadow-sm',
              s.state === 'skipped' && 'border-2 border-dashed border-line text-muted',
              s.state === 'todo' && 'bg-paper text-[#A8A69F]')}>
              {s.state === 'done' ? <Check size={16} strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate text-xs font-bold sm:text-sm', s.state === 'todo' ? 'text-[#A8A69F]' : 'text-ink')}>{s.label}</span>
              <span className="hidden truncate text-xs text-muted sm:block">{s.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ReadOnly({ label, children, className }) {
  return (
    <div className={className}>
      <p className="erp-label">{label}</p>
      <div className="text-sm text-ink">{children || <span className="text-muted">—</span>}</div>
    </div>
  );
}

// Low–high band with a marker where the quoted figure sits.
function RangeBar({ low, high, quoted }) {
  if (!high) return null;
  const span = Math.max(high - low, 1);
  const at = Math.max(0, Math.min(100, ((quoted - low) / span) * 100));
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted"><span>Low {inr0(low)}</span><span>High {inr0(high)}</span></div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-brand-tint to-brand-gold/70">
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow" style={{ left: `${at}%` }} title={`Quoted ${inr0(quoted)}`} />
      </div>
    </div>
  );
}

export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const { defaultDate } = useFY();
  const { toast, confirm } = useFeedback();
  const [estimate, setEstimate] = useState(null);
  const [codes, setCodes] = useState([]);
  const [meta, setMeta] = useState(null);
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pageError, setPageError] = useState('');
  const [analyseError, setAnalyseError] = useState(null);
  const [busy, setBusy] = useState(null);
  const top = useRef(null);
  const sections = { photos: useRef(null), analyse: useRef(null), lines: useRef(null), totals: useRef(null) };

  const load = useCallback(async () => {
    try {
      const e = await api.get(`/estimates/${id}`);
      const m = metaOf(e); const list = groupBySection(e.items.map(fromApi));
      setEstimate(e); setMeta(m); setItems(list); setSaved(snapshot(m, list)); setLoadError('');
      return e;
    } catch (err) {
      setLoadError(err.message);
      return null;
    }
  }, [id]);
  useEffect(() => { load(); api.get('/hsn-sac').then(setCodes).catch(() => setCodes([])); }, [load]);

  const dirty = Boolean(meta) && snapshot(meta, items) !== saved;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const gst = meta ? !meta.isNonGst : false;
  const totals = useMemo(() => estimateTotals(items, meta?.contingencyPct, gst), [items, meta?.contingencyPct, gst]);
  const issues = useMemo(() => approvalIssues(items, gst), [items, gst]);

  if (loadError && !estimate) {
    return (
      <Page>
        <div className="rounded-2xl border border-line bg-white shadow-card">
          <EmptyState icon={ClipboardList} title="This estimate could not be opened" action={<Button icon={ArrowLeft} variant="secondary" onClick={() => navigate('/estimates')}>All estimates</Button>}>{loadError}</EmptyState>
        </div>
      </Page>
    );
  }
  if (!estimate || !meta) return <Loading label="Loading estimate…" />;

  const locked = ['quoted', 'discarded'].includes(estimate.status);
  const photos = estimate.photos?.length || 0;
  const hasItems = items.length > 0;
  const ready = hasItems && !dirty && !issues.length && estimate.status === 'analysed';
  const set = (key, value) => setMeta((m) => ({ ...m, [key]: value }));
  const update = (index, patch) => setItems((list) => list.map((item, i) => (i === index ? patchItem(item, patch) : item)));
  const add = () => { setItems((list) => [...list, blankItem(list[list.length - 1]?.section || '')]); setTimeout(() => sections.lines.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const remove = async (index) => {
    const item = items[index];
    if (item.description || item.lowRate) {
      const ok = await confirm({ title: 'Remove this line?', message: `“${item.description || `Line ${index + 1}`}” will be removed when you save. To keep it out of the quotation but on the Excel sheet as optional work, untick Include instead.`, confirmLabel: 'Remove line', tone: 'danger' });
      if (!ok) return;
    }
    setItems((list) => list.filter((_, i) => i !== index));
  };
  const applyHsn = (code) => {
    const found = codes.find((c) => c.code === code);
    setItems((list) => list.map((item) => ({ ...item, hsnSac: code, gstRatePct: Number(found?.gstRatePct ?? item.gstRatePct) })));
    toast(`HSN/SAC ${code} applied to every line.`, 'info');
  };
  const fail = (err) => { setPageError(err.message); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const persist = (withItems = true) => api.put(`/estimates/${id}`, { ...metaToApi(meta), ...(withItems ? { items: items.map(toApi) } : {}) });

  const save = async () => {
    setBusy('save'); setPageError('');
    try { await persist(); await load(); toast('Estimate saved.'); } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const analyse = async () => {
    if (hasItems) {
      const ok = await confirm({ title: 'Re-analyse the photos?', message: 'Claude will replace every current line, the notes, assumptions and exclusions with a fresh draft. Your edits to the lines will be lost.', confirmLabel: 'Replace with new analysis', tone: 'danger' });
      if (!ok) return;
    }
    setBusy('analyse'); setAnalyseError(null); setPageError('');
    try {
      // Claude reads the saved brief, so store any edits to it first.
      if (dirty) await persist(false);
      const result = await api.post(`/estimates/${id}/analyse`);
      await load();
      toast(`Claude drafted ${result.items} lines. Check each amount and choose Low, High or Custom.`);
      setTimeout(() => sections.lines.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setAnalyseError({ message: err.message, status: err.status });
    } finally {
      setBusy(null);
    }
  };
  const excel = async () => {
    if (!hasItems) return toast('Add estimate lines before downloading Excel.', 'warning');
    if (dirty && !locked) {
      setBusy('excel');
      try { await persist(); await load(); } catch (err) { setBusy(null); return fail(err); }
      setBusy(null);
    }
    openDocument(`/estimates/${id}/excel`);
  };
  const discard = async () => {
    const ok = await confirm({ title: 'Discard this estimate?', message: 'It stays in the list for reference but can no longer be edited, analysed or turned into a quotation.', confirmLabel: 'Discard estimate', tone: 'danger' });
    if (!ok) return;
    setBusy('discard');
    try { await api.post(`/estimates/${id}/discard`); await load(); toast('Estimate discarded.', 'info'); } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const approve = async () => {
    setPageError('');
    if (issues.length) { setPageError(<><p className="font-bold">Fix these before creating the quotation:</p><ul className="mt-1 list-disc pl-5">{issues.map((x) => <li key={x}>{x}</li>)}</ul></>); top.current?.scrollIntoView({ behavior: 'smooth' }); return; }
    setBusy('approve');
    try {
      await persist();
      await load();
    } catch (err) { setBusy(null); return fail(err); }
    const total = totals.quoted + totals.quotedCont;
    const ok = await confirm({
      title: 'Create quotation?',
      message: <>Your review is saved. This creates a <b>draft quotation</b> for <b>{estimate.clientName}</b> of <b>{inr0(total)}</b>{gst ? ' before GST' : ''} — {totals.count} line{totals.count === 1 ? '' : 's'}{totals.quotedCont ? ' plus a contingency line' : ''} — and locks this estimate.</>,
      confirmLabel: 'Approve & create quotation',
    });
    if (!ok) { setBusy(null); return; }
    try {
      const quote = await api.post(`/estimates/${id}/approve`, { date: defaultDate() });
      await load();
      toast(`Quotation ${quote.quotationNo} created as a draft.`);
      setBusy(null);
      const open = await confirm({ title: `Quotation ${quote.quotationNo} created`, message: 'It is a draft under Bills & Quotes. Review it there, then approve and send it to the customer.', confirmLabel: 'Open Bills & Quotes' });
      if (open) navigate('/sales', { state: { tab: 'quotations' } });
    } catch (err) {
      setBusy(null);
      fail(err);
    }
  };
  const back = async () => {
    if (dirty && !(await confirm({ title: 'Leave without saving?', message: 'Your changes to this estimate have not been saved.', confirmLabel: 'Leave', tone: 'danger' }))) return;
    navigate('/estimates');
  };
  const jump = (key) => sections[key]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const quoted = estimate.status === 'quoted';
  const steps = [
    { label: 'Photos', target: 'photos', state: quoted || photos ? 'done' : hasItems ? 'skipped' : 'current', hint: photos ? `${photos} of 6 uploaded` : hasItems ? 'Skipped' : 'Upload site photos' },
    { label: 'Analyse', target: 'analyse', state: quoted || estimate.aiAnalysed ? 'done' : hasItems ? 'skipped' : photos ? 'current' : 'todo', hint: estimate.aiAnalysed ? 'Drafted by Claude' : hasItems ? 'Entered by hand' : 'Claude drafts the BOQ' },
    { label: 'Review', target: 'lines', state: quoted || ready ? 'done' : hasItems ? 'current' : 'todo', hint: hasItems ? `${totals.count} of ${items.length} lines included` : 'Check every line' },
    { label: 'Quote', target: 'totals', state: quoted ? 'done' : ready ? 'current' : 'todo', hint: quoted ? estimate.quotationNo : ready ? 'Ready to approve' : 'Draft quotation' },
  ].map((s) => (estimate.status === 'discarded' ? { ...s, state: 'todo' } : s));
  const enquiryTag = estimate.enquiryId && <Tag className="bg-brand-tint text-brand-dark">From website enquiry</Tag>;

  return (
    <Page>
      <div ref={top} className="scroll-mt-4" />
      <button type="button" onClick={back} className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted hover:text-brand"><ArrowLeft size={14} /> All estimates</button>
      <PageHeader icon={Sparkles}
        title={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">{estimate.title}<StatusBadge status={estimate.status} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">#{estimate.id} · {estimate.clientName}{estimate.location && <> · {estimate.location}</>} · Updated {dateTime(estimate.updatedAt)} {enquiryTag}</span>}
        actions={<>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={excel} loading={busy === 'excel'} disabled={!hasItems}>Download Excel</Button>
          {quoted && can('bills_quotes') && estimate.quotationId && <Button icon={FileText} onClick={() => openDocument(`/quotations/${estimate.quotationId}/view`)}>Open quotation</Button>}
          {!locked && <Button variant="danger" icon={Ban} onClick={discard} loading={busy === 'discard'} disabled={Boolean(busy)}>Discard</Button>}
        </>} />

      {quoted && (
        <Alert tone="success">
          <p className="font-bold">Approved — quotation {estimate.quotationNo} was created from this estimate.</p>
          <p className="mt-0.5">This estimate is now read-only. Edit, approve and send the quotation under{' '}
            {can('bills_quotes') ? <button type="button" className="font-bold underline underline-offset-2" onClick={() => navigate('/sales', { state: { tab: 'quotations' } })}>Bills &amp; Quotes → Quotations</button> : 'Bills & Quotes'}.</p>
        </Alert>
      )}
      {estimate.status === 'discarded' && <Alert tone="warning"><p className="font-bold">This estimate was discarded.</p><p className="mt-0.5">It is kept for reference only and cannot be edited. Start a new estimate if the work is back on.</p></Alert>}
      {pageError && <Alert onClose={() => setPageError('')} className="animate-shake">{pageError}</Alert>}

      <Stepper steps={steps} onJump={jump} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Site Brief" icon={NotebookPen} className="xl:col-span-2"
          actions={locked ? <Tag><Lock size={11} className="mr-1 inline" />Read-only</Tag> : <span className="text-xs text-muted">Claude reads this with the photos</span>}>
          {locked ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadOnly label="Customer">{estimate.clientName}</ReadOnly>
              <ReadOnly label="Site location">{meta.location}</ReadOnly>
              <ReadOnly label="Building type">{meta.buildingType}</ReadOnly>
              <ReadOnly label="Tax / place of supply">{meta.isNonGst ? 'Non-GST' : 'GST'}{meta.placeOfSupplyStateCode && ` · ${meta.placeOfSupplyStateCode} – ${stateName(meta.placeOfSupplyStateCode)}`}</ReadOnly>
              <ReadOnly label="Problem note" className="sm:col-span-2">{meta.problemNote && <p className="whitespace-pre-line">{meta.problemNote}</p>}</ReadOnly>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estimate Title" required className="sm:col-span-2">
                <Input value={meta.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. RCC column repair – Wing B" />
              </Field>
              <Field label="Customer" hint="Set when the estimate was created.">
                <Input value={estimate.clientName || ''} disabled />
              </Field>
              <Field label="Site Location">
                <Input value={meta.location} onChange={(e) => set('location', e.target.value)} placeholder="Area, city" />
              </Field>
              <Field label="Building Type">
                <Input value={meta.buildingType} onChange={(e) => set('buildingType', e.target.value)} placeholder="Residential / commercial / industrial" />
              </Field>
              <Field label="Contingency %" hint="Added on top of the quoted lines (10–20% is usual).">
                <Input type="number" min="0" max="100" step="0.5" value={meta.contingencyPct} onChange={(e) => set('contingencyPct', e.target.value)} />
              </Field>
              <Field label="Quotation Type" hint={gst ? 'Every included line needs an HSN/SAC code.' : 'No GST will be charged.'}>
                <Segmented value={meta.isNonGst ? 'nongst' : 'gst'} onChange={(v) => set('isNonGst', v === 'nongst')} options={[['nongst', 'Non-GST'], ['gst', 'GST']]} />
              </Field>
              <Field label="Place of Supply" hint="Defaults to the customer's state.">
                <Select value={meta.placeOfSupplyStateCode} onChange={(e) => set('placeOfSupplyStateCode', e.target.value)} placeholder="Customer's state">
                  {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
                </Select>
              </Field>
              <Field label="Observed Problem & Scope" className="sm:col-span-2" hint="Describe what you saw on site, the scope and any access limits. Claude reads this with the photos.">
                <Textarea rows={4} value={meta.problemNote} onChange={(e) => set('problemNote', e.target.value)} placeholder="e.g. Spalling concrete and exposed rebar at ground-floor column C4; work area is a narrow parking bay." />
              </Field>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <div ref={sections.photos} className="scroll-mt-4"><PhotosCard estimate={estimate} locked={locked} onChanged={load} /></div>
          {!locked && (
            <div ref={sections.analyse} className="scroll-mt-4">
              <AnalysePanel estimate={estimate} hasItems={hasItems} running={busy === 'analyse'} error={analyseError} onAnalyse={analyse} onManual={add} onDismiss={() => setAnalyseError(null)} />
            </div>
          )}
        </div>
      </div>

      <div ref={sections.lines} className="mt-6 scroll-mt-4">
        {gst && !locked && hasItems && <Alert tone="info">GST quotation: choose an HSN/SAC code and rate for every included line. The contingency line takes the highest rate so it is not under-taxed.</Alert>}
        <LineGrid items={items} setItems={setItems} update={update} remove={remove} applyHsn={applyHsn} locked={locked} gst={gst} codes={codes} totals={totals} />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <Card title="Notes for the Quotation" icon={ClipboardList} className="lg:col-span-3">
          {locked ? (
            <div className="space-y-4">
              <ReadOnly label="Basis line">{meta.basisLine}</ReadOnly>
              <ReadOnly label="Important note">{meta.importantNote && <p className="whitespace-pre-line">{meta.importantNote}</p>}</ReadOnly>
              <ReadOnly label="Safety & assumptions">{lines(meta.assumptions).length > 0 && <ul className="list-disc space-y-1 pl-5">{lines(meta.assumptions).map((x) => <li key={x}>{x}</li>)}</ul>}</ReadOnly>
              <ReadOnly label="Excluded / optional work">{lines(meta.exclusions).length > 0 && <ul className="list-disc space-y-1 pl-5">{lines(meta.exclusions).map((x) => <li key={x}>{x}</li>)}</ul>}</ReadOnly>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Basis Line" className="sm:col-span-2" hint="Printed under the heading of the Excel sheet and on the quotation notes.">
                <Input value={meta.basisLine} onChange={(e) => set('basisLine', e.target.value)} placeholder="Indicative budget for Nashik | INR | based on photos; not a structural design" />
              </Field>
              <Field label="Important Note" className="sm:col-span-2">
                <Textarea rows={3} value={meta.importantNote} onChange={(e) => set('importantNote', e.target.value)} placeholder="e.g. Preliminary allowances only; confirm after a structural engineer's site visit." />
              </Field>
              <Field label="Safety & Assumptions" hint="One per line. Added to the quotation terms.">
                <Textarea rows={5} value={meta.assumptions} onChange={(e) => set('assumptions', e.target.value)} placeholder={'Small work area with ordinary access\nNo hidden corrosion beyond the visible zone'} />
              </Field>
              <Field label="Excluded / Optional Work" hint="One per line. Listed as “Excluded” in the terms.">
                <Textarea rows={5} value={meta.exclusions} onChange={(e) => set('exclusions', e.target.value)} placeholder={'New foundations\nSteel transfer beam (TBD after design)'} />
              </Field>
            </div>
          )}
        </Card>

        <div ref={sections.totals} className="scroll-mt-4 lg:col-span-2">
          <Card title="Estimate Totals" icon={Wand2}>
            <RangeBar low={totals.low + totals.lowCont} high={totals.high + totals.highCont} quoted={totals.quoted + totals.quotedCont} />
            <Summary rows={[
              ['Low estimate (incl. contingency)', inr0(totals.low + totals.lowCont)],
              ['High estimate (incl. contingency)', inr0(totals.high + totals.highCont)],
            ]} className="mb-4 rounded-xl bg-paper p-3" />
            <Summary rows={[
              ['Quoted base (Σ qty × rate)', inr0(totals.quoted)],
              [`Contingency (${Number(meta.contingencyPct || 0)}%)`, inr0(totals.quotedCont)],
              gst && ['Estimated GST', inr0(totals.tax)],
              [gst ? 'Approx. quotation total' : 'Quotation total', <span key="t" className="text-brand">{inr0(totals.quoted + totals.quotedCont + totals.tax)}</span>, true],
            ]} />
            {!locked && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Ready to quote?</p>
                <ul className="space-y-1.5 text-sm">
                  {[[hasItems && totals.count > 0, hasItems ? `${totals.count} line${totals.count === 1 ? '' : 's'} included` : 'Add or analyse estimate lines'], ...issues.filter((x) => !x.startsWith('Include at least')).map((x) => [false, x]), [!dirty, dirty ? 'Unsaved changes' : 'All changes saved']].map(([ok, label]) => (
                    <li key={label} className={cn('flex items-start gap-2', ok ? 'text-emerald-700' : 'text-amber-700')}>
                      {ok ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}{label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-muted">Approving saves this review, creates a draft BOQ quotation (section headings, each included line with its unit, qty and quoted rate, plus a contingency line) and locks the estimate.</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {!locked && (
        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-6 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(28,28,26,0.06)] backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Quotation total</p>
            <p className="flex items-center gap-2 text-lg font-extrabold tabular-nums text-ink">{inr0(totals.quoted + totals.quotedCont + totals.tax)}
              {dirty && <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 sm:inline">Unsaved</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" icon={Save} onClick={save} loading={busy === 'save'} disabled={Boolean(busy) || !dirty} className={cn(dirty && 'border-brand-gold')}><span>Save<span className="hidden sm:inline"> review</span></span></Button>
            {can('bills_quotes') ? (
              <Button icon={FileText} onClick={approve} loading={busy === 'approve'} disabled={Boolean(busy) || !hasItems}><span>Approve<span className="hidden sm:inline"> → quotation</span></span></Button>
            ) : (
              <span className="hidden max-w-[220px] text-xs text-muted sm:block">Creating the quotation needs the Bills &amp; Quotes permission.</span>
            )}
          </div>
        </div>
      )}
      {locked && <div className="mt-6 flex items-center gap-2 text-xs text-muted"><Images size={14} /> {photos} photo{photos === 1 ? '' : 's'} · <ListChecks size={14} /> {items.length} line{items.length === 1 ? '' : 's'} · created {dateTime(estimate.createdAt)}</div>}
    </Page>
  );
}
