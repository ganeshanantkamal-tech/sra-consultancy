// Create / edit modal shared by quotations, sales invoices and credit / debit notes.
// Layout follows the ERP form: header fields, a BOQ line editor (sections, description-only
// groups, items and lettered sub-items), then terms on the left and the live totals panel on
// the right. Totals mirror the server's GST and round-off maths.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowRightLeft, ArrowUp, Copy, CornerDownRight, FileMinus, FileSpreadsheet, FileText, Info, ListTree, MapPin, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { addDays, cn, inr, showDate } from '../../lib/format.js';
import { STATES } from '../../lib/states.js';
import { LINE_KINDS, UNITS, UNIT_GROUPS, serialNumbers, unitLabel } from '../../lib/boq.js';
import { useCompany, useFY } from '../../context.jsx';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '../../components/ui.jsx';
import { GST_RATES, REASONS, blankRate, clientState, isPriced, lineMaths, lineUid, preview, stateLabel, toItems, toLines } from './shared.jsx';

const KIND = {
  quotation: { noun: 'Quotation', icon: FileSpreadsheet, path: '/quotations', number: 'quotationNo' },
  invoice: { noun: 'Invoice', icon: FileText, path: '/invoices', number: 'invoiceNo' },
  credit: { noun: 'Credit Note', icon: FileMinus, path: '/credit-notes', number: 'noteNo' },
};

// Line type as the editor names it ('sub' = item at level 2) and the fields each type sets.
const typeOf = (l) => (l.kind === 'item' && Number(l.level) === 2 ? 'sub' : l.kind || 'item');
const TYPE_PATCH = { item: { kind: 'item', level: 1 }, sub: { kind: 'item', level: 2 }, group: { kind: 'group', level: 1 }, section: { kind: 'section', level: 1 } };
const TYPE_NAME = Object.fromEntries(LINE_KINDS.map(([k, label]) => [k, label]));

export default function DocumentForm({ kind, nonGst, editing, clients, codes, invoices = [], notes = [], quotations = [], initialInvoiceId, onClose, onSaved }) {
  const { stateCode: companyState } = useCompany();
  const { fy, defaultDate } = useFY();
  const defaultCode = codes.find((c) => c.isDefault);
  const allowBlank = kind === 'quotation';
  // New rows copy the unit, HSN/SAC and GST rate of the nearest priced row above them.
  const makeLine = (type = 'item', above = []) => {
    const prev = [...above].reverse().find(isPriced);
    return {
      uid: lineUid(), ...TYPE_PATCH[type], ref: '', description: '', qty: 1, rate: '',
      unit: prev?.unit || 'Sqft',
      hsnSac: nonGst ? '' : prev?.hsnSac || defaultCode?.code || '',
      gstRatePct: nonGst ? 0 : prev ? Number(prev.gstRatePct) : defaultCode ? Number(defaultCode.gstRatePct) : 18,
    };
  };

  const startInvoice = initialInvoiceId ? invoices.find((i) => String(i.id) === String(initialInvoiceId)) : null;
  const firstDate = editing?.date || defaultDate();
  const [f, setF] = useState(() => ({
    clientLedgerId: editing?.clientLedgerId ? String(editing.clientLedgerId) : startInvoice ? String(startInvoice.clientLedgerId) : '',
    date: firstDate,
    dueDate: editing?.dueDate || firstDate,
    validUntil: editing?.validUntil || addDays(firstDate, 30),
    pos: editing?.placeOfSupplyStateCode || '',
    subject: editing?.subject || '',
    siteReference: editing?.siteReference || '',
    terms: editing?.terms || '',
    notes: editing?.notes || '',
    narration: editing?.narration || '',
    invoiceId: startInvoice ? String(startInvoice.id) : '',
    noteType: 'C',
    reason: REASONS[0],
    remark: '',
    quotationRef: '',
  }));
  const [touched, setTouched] = useState({ due: Boolean(editing), valid: Boolean(editing), pos: Boolean(editing) });
  const [lines, setLines] = useState(() => (editing?.items?.length ? toLines(editing.items) : [makeLine()]));
  const [error, setError] = useState('');
  const [problemRow, setProblemRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const formRef = useRef(null);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  const { noun, icon: Icon, path } = KIND[kind];
  const title = kind === 'credit' ? `New ${nonGst ? 'Non-GST ' : ''}${f.noteType === 'D' ? 'Debit' : 'Credit'} Note`
    : `${editing ? 'Edit' : 'New'} ${nonGst ? 'Non-GST ' : ''}${kind === 'invoice' ? (nonGst ? 'Invoice' : 'Sales Invoice') : 'Quotation'}`;
  const client = clients.find((c) => String(c.id) === f.clientLedgerId);
  const credit = Number(client?.creditPeriodDays || 0);

  // Credit notes: the chosen customer's active invoices of the same kind (GST / Non-GST).
  const clientInvoices = useMemo(() => invoices.filter((i) => i.status === 'active' && Boolean(i.isNonGst) === nonGst && String(i.clientLedgerId) === f.clientLedgerId), [invoices, nonGst, f.clientLedgerId]);
  const invoice = invoices.find((i) => String(i.id) === f.invoiceId);
  const credited = invoice ? notes.filter((n) => String(n.invoiceId) === String(invoice.id) && n.noteType === 'C' && n.status === 'active').reduce((s, n) => s + Number(n.grandTotal), 0) : 0;
  const leftOnInvoice = invoice ? Number(invoice.grandTotal) - credited : 0;

  // Invoices: open quotations of the customer whose lines can be copied in.
  const clientQuotes = useMemo(() => quotations.filter((q) => ['draft', 'approved'].includes(q.status) && Boolean(q.isNonGst) === nonGst && String(q.clientLedgerId) === f.clientLedgerId), [quotations, nonGst, f.clientLedgerId]);

  const customerState = clientState(client);
  const pos = kind === 'credit' ? invoice?.placeOfSupplyStateCode || '' : f.pos || customerState || companyState;
  const intra = Boolean(companyState && pos && companyState === pos);
  const totals = preview(lines, nonGst, intra);
  const exceeds = kind === 'credit' && f.noteType === 'C' && invoice && totals.grand > leftOnInvoice;
  const priced = lines.filter(isPriced);
  const uniformRate = priced.length && priced.every((l) => Number(l.gstRatePct) === Number(priced[0].gstRatePct)) ? Number(priced[0].gstRatePct) : null;

  const chooseClient = (id) => {
    const c = clients.find((x) => String(x.id) === id);
    const days = Number(c?.creditPeriodDays || 0);
    set({
      clientLedgerId: id, invoiceId: '', quotationRef: '',
      ...(!touched.pos ? { pos: clientState(c) || companyState || '' } : {}),
      ...(!touched.due ? { dueDate: addDays(f.date, days) } : {}),
    });
  };
  const changeDate = (date) => set({
    date,
    ...(!touched.due && date ? { dueDate: addDays(date, credit) } : {}),
    ...(!touched.valid && date ? { validUntil: addDays(date, 30) } : {}),
  });

  const pickInvoice = async (id) => {
    set({ invoiceId: id });
    if (!id) return;
    setLoadingLines(true);
    try {
      const detail = await api.get(`/invoices/${id}`);
      setLines(toLines(detail.items));
      set({ invoiceId: id, subject: detail.subject || '', siteReference: detail.siteReference || '' });
    } catch (err) { setError(err.message); } finally { setLoadingLines(false); }
  };
  const pickQuotation = async (id) => {
    set({ quotationRef: id });
    if (!id) return;
    setLoadingLines(true);
    try {
      const q = await api.get(`/quotations/${id}`);
      setLines(toLines(q.items));
      setF((prev) => ({ ...prev, quotationRef: id, terms: prev.terms || q.terms || '', narration: prev.narration || q.notes || '', subject: prev.subject || q.subject || '', siteReference: prev.siteReference || q.siteReference || '' }));
    } catch (err) { setError(err.message); } finally { setLoadingLines(false); }
  };
  // Credit notes started from the Invoices tab load that invoice's lines once.
  useEffect(() => { if (startInvoice) pickInvoice(String(startInvoice.id)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirrors the server's checks; line problems also point at the row and field to fix.
  const validate = () => {
    if (kind === 'credit' ? !f.invoiceId : !f.clientLedgerId) return [kind === 'credit' ? 'Select the invoice this note is raised against.' : 'Select a client.'];
    if (!f.date) return ['Enter the date.'];
    if (fy && (f.date < fy.startDate || f.date > fy.endDate)) return [`The date must fall inside FY ${fy.label} (${showDate(fy.startDate)} – ${showDate(fy.endDate)}).`];
    if (kind === 'invoice' && f.dueDate && f.dueDate < f.date) return ['Due date cannot be before the invoice date.'];
    if (kind === 'quotation' && f.validUntil && f.validUntil < f.date) return ['Valid-until date cannot be before the quotation date.'];
    if (kind === 'credit' && invoice && f.date < invoice.date) return [`The note date cannot be before the invoice date (${showDate(invoice.date)}).`];
    if (!nonGst && !companyState) return ['Set the company state code in Settings before creating GST documents.'];
    const refs = serialNumbers(lines);
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      const at = `Row ${i + 1} (Sr. ${refs[i]})`;
      if (!String(l.description).trim()) return [`${at} needs a description.`, l.uid, 'description'];
      if (!isPriced(l)) continue;
      if (!(Number(l.qty) > 0)) return [`${at} needs a quantity greater than zero.`, l.uid, 'qty'];
      if (blankRate(l)) { if (!allowBlank) return [`${at} needs a rate. Only quotations can leave a rate blank.`, l.uid, 'rate']; }
      else if (!(Number(l.rate) >= 0) || !Number.isFinite(Number(l.rate))) return [`${at} has an invalid rate.`, l.uid, 'rate'];
      if (!nonGst && !l.hsnSac) return [`${at} needs an HSN/SAC code.`, l.uid, 'hsn'];
    }
    if (!lines.some(isPriced)) return ['Add at least one item with a unit, quantity and rate. Sections and description-only rows carry no amount.'];
    if (exceeds) return [`Credit note total (${inr(totals.grand)}) exceeds what is left on the invoice (${inr(leftOnInvoice)}).`];
    return null;
  };

  const save = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      const [message, uid, field] = problem;
      setError(message);
      setProblemRow(uid || null);
      if (uid) formRef.current?.querySelector(`[data-row="${uid}"] [data-field="${field}"]`)?.focus();
      return;
    }
    setSaving(true);
    setError('');
    setProblemRow(null);
    try {
      const items = toItems(lines, nonGst);
      const heading = { subject: f.subject.trim(), siteReference: f.siteReference.trim() };
      let body;
      if (kind === 'credit') body = { invoiceId: f.invoiceId, date: f.date, noteType: f.noteType, reason: f.reason, narration: f.remark.trim(), ...heading, items };
      else body = {
        clientLedgerId: f.clientLedgerId, date: f.date, isNonGst: nonGst, placeOfSupplyStateCode: nonGst ? '' : pos, terms: f.terms, ...heading, items,
        ...(kind === 'quotation' ? { validUntil: f.validUntil || f.date, notes: f.notes } : { dueDate: f.dueDate || f.date, narration: f.narration, ...(!editing && f.quotationRef ? { quotationId: f.quotationRef } : {}) }),
      };
      const result = editing ? await api.put(`${path}/${editing.id}`, body) : await api.post(path, body);
      const no = result[KIND[kind].number] || '';
      const what = kind === 'credit' ? `${f.noteType === 'D' ? 'Debit' : 'Credit'} note` : noun;
      onSaved(`${what} ${no} ${editing ? 'updated' : 'created'}${editing && kind === 'quotation' && editing.status === 'approved' ? ' and moved back to draft' : ''}.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const heading = (
    <>
      <Field label="Subject / Title of Work" className="sm:col-span-2 md:col-span-3" hint="Printed above the line items.">
        <Input value={f.subject} maxLength={500} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Quotation for structural repair works of Building No. 3 at Malad (W), Mumbai" />
      </Field>
      <Field label="Site / Tower Reference" className="sm:col-span-2 md:col-span-1">
        <Input value={f.siteReference} maxLength={200} onChange={(e) => set({ siteReference: e.target.value })} placeholder="e.g. Tower# 3" />
      </Field>
    </>
  );

  const saveLabel = editing ? `Update ${noun}` : kind === 'credit' ? `Save ${f.noteType === 'D' ? 'Debit' : 'Credit'} Note` : `Save ${noun}`;
  // Portalled to #erp-root: the site's global `main { z-index: 1 }` would otherwise trap the overlay under the sidebar.
  return createPortal((
    <Modal title={title} icon={editing ? Pencil : Icon} size="full" onClose={onClose} busy={saving}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Discard</Button>
        <Button type="submit" form="sales-doc-form" icon={Save} loading={saving} disabled={exceeds}>{saving ? 'Saving…' : saveLabel}</Button>
      </>}>
      <form id="sales-doc-form" ref={formRef} onSubmit={save} noValidate>
        {error && <Alert onClose={() => { setError(''); setProblemRow(null); }} className="animate-shake">{error}</Alert>}
        {!nonGst && !companyState && <Alert tone="warning">The company state code is not set, so GST cannot be worked out. Add it under Settings first.</Alert>}
        {editing && kind === 'quotation' && editing.status === 'approved' && <Alert tone="info">This quotation is approved. Saving changes moves it back to draft, so approve it again before converting.</Alert>}

        {kind === 'credit' ? (
          <>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Client" required>
                <Select placeholder="Select Client" value={f.clientLedgerId} onChange={(e) => chooseClient(e.target.value)}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Note Date" required>
                <Input type="date" value={f.date} min={invoice?.date || fy?.startDate} max={fy?.endDate} onChange={(e) => changeDate(e.target.value)} />
              </Field>
              <Field label="Note Type" hint={f.noteType === 'D' ? 'Adds to the bill (e.g. extra charges).' : 'Reduces the bill and settles the invoice.'}>
                <Select value={f.noteType} onChange={(e) => set({ noteType: e.target.value })}>
                  <option value="C">Credit Note</option>
                  <option value="D">Debit Note</option>
                </Select>
              </Field>
            </div>
            {f.clientLedgerId && (
              <div className="mb-5 grid grid-cols-1 gap-4 rounded-lg border border-brand-tint bg-brand-soft p-4 md:grid-cols-2">
                <Field label="Against Invoice" required
                  hint={clientInvoices.length === 0 ? `No active ${nonGst ? 'Non-GST ' : ''}invoices for this client.` : invoice ? 'Line items pre-filled. Reduce qty or rate for a partial note.' : 'Selecting an invoice copies its line items.'}>
                  <Select placeholder="-- Select an invoice --" value={f.invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
                    {clientInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNo} — {inr(i.grandTotal)} ({showDate(i.date)})</option>)}
                  </Select>
                </Field>
                <Field label="Reason">
                  <Select value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
                    {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
                {invoice && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted md:col-span-2">
                    <span>Invoice total <b className="text-ink tabular-nums">{inr(invoice.grandTotal)}</b></span>
                    <span>Already credited <b className="text-ink tabular-nums">{inr(credited)}</b></span>
                    <span>Left to credit <b className="text-emerald-700 tabular-nums">{inr(leftOnInvoice)}</b></span>
                    {!nonGst && <span>Place of supply <b className="text-ink">{stateLabel(pos)}</b></span>}
                  </div>
                )}
              </div>
            )}
            {f.invoiceId && <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">{heading}</div>}
          </>
        ) : (
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Field label="Client" required className="sm:col-span-2" hint={client && kind === 'invoice' && credit ? `Credit period ${credit} days` : undefined}>
              <Select placeholder="Select Client" value={f.clientLedgerId} onChange={(e) => chooseClient(e.target.value)}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>)}
              </Select>
            </Field>
            <Field label={kind === 'invoice' ? 'Invoice Date' : 'Date'} required>
              <Input type="date" value={f.date} min={fy?.startDate} max={fy?.endDate} onChange={(e) => changeDate(e.target.value)} />
            </Field>
            {kind === 'invoice' ? (
              <Field label="Due Date">
                <Input type="date" value={f.dueDate} min={f.date} onChange={(e) => { setTouched((t) => ({ ...t, due: true })); set({ dueDate: e.target.value }); }} />
              </Field>
            ) : (
              <Field label="Valid Until">
                <Input type="date" value={f.validUntil} min={f.date} onChange={(e) => { setTouched((t) => ({ ...t, valid: true })); set({ validUntil: e.target.value }); }} />
              </Field>
            )}
            {heading}
            {!nonGst && (
              <Field label="Place of Supply" className="sm:col-span-2"
                hint={customerState && pos !== customerState ? `Changed from the client's state (${stateLabel(customerState)}).` : 'Defaults to the client\'s state.'}>
                <Select value={pos} onChange={(e) => { setTouched((t) => ({ ...t, pos: true })); set({ pos: e.target.value }); }}>
                  {!pos && <option value="">Select state</option>}
                  {STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
                </Select>
              </Field>
            )}
            {!nonGst && <SupplyType intra={intra} pos={pos} companyState={companyState} className="sm:col-span-2 md:mt-[22px]" />}
            {kind === 'invoice' && !editing && f.clientLedgerId && (
              <div className="rounded-lg border border-brand-tint bg-brand-soft p-4 sm:col-span-2 md:col-span-4">
                <Field label="Quotation Reference (Optional)"
                  hint={clientQuotes.length === 0 ? 'No draft or approved quotations found for this client.' : f.quotationRef ? '✓ Line items, subject and site pre-filled. Saving links this invoice to the quotation and marks the quotation converted.' : 'Copies the line items of a quotation into this invoice.'}>
                  <Select placeholder="-- No Quotation Reference --" value={f.quotationRef} onChange={(e) => pickQuotation(e.target.value)} disabled={!clientQuotes.length}>
                    {clientQuotes.map((q) => <option key={q.id} value={q.id}>{q.quotationNo} - {inr(q.grandTotal)} ({q.status}){q.subject ? ` · ${q.subject.slice(0, 60)}` : ''}</option>)}
                  </Select>
                </Field>
                {f.quotationRef && totals.unpriced > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">{totals.unpriced} copied line{totals.unpriced === 1 ? ' has' : 's have'} no rate in the quotation. Fill in every rate before saving the invoice.</p>}
              </div>
            )}
          </div>
        )}

        <LineItems lines={lines} setLines={setLines} nonGst={nonGst} codes={codes} makeLine={makeLine} loading={loadingLines} allowBlank={allowBlank} intra={intra} problemRow={problemRow} />

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:gap-8">
          <div className="space-y-4">
            {kind === 'credit' ? (
              <Field label="Narration / Notes" hint="Printed under the reason on the note.">
                <Textarea rows={4} value={f.remark} onChange={(e) => set({ remark: e.target.value })} placeholder="e.g. Partial sales return against the invoice…" />
              </Field>
            ) : (
              <>
                <Field label={kind === 'invoice' ? 'Narration / Notes' : 'Notes'}>
                  <Textarea rows={3} value={kind === 'invoice' ? f.narration : f.notes} onChange={(e) => set(kind === 'invoice' ? { narration: e.target.value } : { notes: e.target.value })}
                    placeholder={kind === 'invoice' ? 'e.g. Being services rendered for the month of June...' : 'e.g. Scope as discussed at the site visit'} />
                </Field>
                <Field label="Terms & Conditions (Optional)">
                  <Textarea rows={4} value={f.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="e.g. 50% advance, balance on completion. Payment within 15 days." />
                </Field>
              </>
            )}
          </div>
          <Totals totals={totals} nonGst={nonGst} intra={intra} rate={uniformRate} label={kind === 'credit' ? 'Note Total' : 'Grand Total'} allowBlank={allowBlank}
            warning={exceeds ? `Exceeds what is left on the invoice (${inr(leftOnInvoice)}).` : ''} />
        </div>
      </form>
    </Modal>
  ), document.getElementById('erp-root') || document.body);
}

function SupplyType({ intra, pos, companyState, className }) {
  if (!pos || !companyState) return <div className={className} />;
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm', intra ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800', className)}>
      <MapPin size={16} className="mt-0.5 shrink-0" />
      <span><b>{intra ? 'Intra-state supply · CGST + SGST' : 'Inter-state supply · IGST'}</b><span className="block text-xs opacity-80">Company state {companyState}, place of supply {pos}</span></span>
    </div>
  );
}

// Multi-line description that grows with its text, so long specifications stay readable.
function AutoTextarea({ value, className, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cn('erp-input resize-none overflow-hidden', className)} {...props} />;
}

// Unit list grouped by trade, with "Other…" for any short unit not in the list.
function UnitPicker({ value, onChange, label }) {
  const [typing, setTyping] = useState(false);
  if (typing || (value && !UNITS.includes(value))) {
    return (
      <div className="relative">
        <Input data-field="unit" aria-label={label} autoFocus={typing} maxLength={20} value={value} placeholder="Type unit" className="py-2 pl-2.5 pr-7"
          onChange={(e) => onChange(e.target.value)} onBlur={() => { if (!value) setTyping(false); }} />
        <button type="button" onClick={() => { setTyping(false); onChange(''); }} title="Pick from the list" aria-label="Pick unit from the list"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:bg-paper hover:text-ink"><X size={13} /></button>
      </div>
    );
  }
  return (
    <Select data-field="unit" aria-label={label} title={value ? unitLabel(value) : 'No unit'} className="py-2 pl-2.5" value={value}
      onChange={(e) => { if (e.target.value === '__other') { setTyping(true); onChange(''); } else onChange(e.target.value); }}>
      <option value="">—</option>
      {UNIT_GROUPS.map(([group, units]) => (
        <optgroup key={group} label={group}>{units.map(([code, name]) => <option key={code} value={code} title={name}>{code}</option>)}</optgroup>
      ))}
      <option value="__other">Other…</option>
    </Select>
  );
}

const RowBtn = ({ icon: I, label, tone, ...props }) => (
  <button type="button" title={label} aria-label={label} {...props}
    className={cn('rounded p-1 text-muted/70 transition-colors disabled:pointer-events-none disabled:opacity-30', tone === 'danger' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-brand-soft hover:text-brand')}><I size={15} /></button>
);

const HEAD = 'text-[10px] font-bold uppercase tracking-widest text-muted';
const PLACEHOLDER = {
  section: 'Section heading, e.g. Preparatory works',
  group: 'Specification shared by the sub-items below, e.g. Polymer treatment for RCC structure…',
  item: 'Item description / specification',
  sub: 'Sub-item, e.g. For up to 25 mm thick for slab',
};
const ADD = [['item', '+ Item', '+ Item'], ['sub', '+ Sub-item', '+ Sub'], ['group', '+ Description only', '+ Desc.'], ['section', '+ Section', '+ Section']];
const SHORT = { section: 'Section', group: 'Desc. only', item: 'Item', sub: 'Sub-item' };

// BOQ line editor: one markup for all widths, a table-like grid on large screens and stacked
// cards on phones. New rows go below the row last worked on (highlighted), else at the end.
function LineItems({ lines, setLines, nonGst, intra, codes, makeLine, loading, allowBlank, problemRow }) {
  const box = useRef(null);
  const [active, setActive] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  useEffect(() => {
    if (!focusTarget) return;
    box.current?.querySelector(`[data-row="${focusTarget[0]}"] [data-field="${focusTarget[1]}"]`)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const auto = useMemo(() => serialNumbers(lines.map((l) => ({ ...l, ref: '' }))), [lines]);
  const refs = useMemo(() => serialNumbers(lines), [lines]);
  const activeIndex = lines.findIndex((l) => l.uid === active);

  const update = (uid, patch) => setLines(lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const insertAt = (at, type) => {
    const line = makeLine(type, lines.slice(0, at));
    setLines([...lines.slice(0, at), line, ...lines.slice(at)]);
    setActive(line.uid);
    setFocusTarget([line.uid, 'description']);
  };
  const add = (type) => insertAt(activeIndex === -1 ? lines.length : activeIndex + 1, type);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    setLines(next);
  };
  const duplicate = (i) => {
    const copy = { ...lines[i], uid: lineUid(), ref: '' };
    setLines([...lines.slice(0, i + 1), copy, ...lines.slice(i + 1)]);
    setActive(copy.uid);
    setFocusTarget([copy.uid, 'description']);
  };
  const remove = (i) => {
    if (lines.length === 1) return;
    if (lines[i].uid === active) setActive(null);
    setLines(lines.filter((_, x) => x !== i));
  };
  const pickCode = (uid, code) => {
    const match = codes.find((c) => c.code === code);
    update(uid, { hsnSac: code, ...(match ? { gstRatePct: Number(match.gstRatePct) } : {}) });
  };
  // Enter in Qty / Rate: jump to the same field on the next priced row, or add a row after the last one.
  const onEnter = (e, i, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = lines.slice(i + 1).find(isPriced);
    if (next) setFocusTarget([next.uid, field]);
    else if (i === lines.length - 1) insertAt(i + 1, typeOf(lines[i]) === 'sub' ? 'sub' : 'item');
    else setFocusTarget([lines[i + 1].uid, 'description']);
  };

  const cols = nonGst
    ? 'lg:grid-cols-[56px_minmax(280px,1fr)_96px_88px_112px_118px_128px]'
    : 'lg:grid-cols-[56px_minmax(260px,1fr)_96px_84px_104px_112px_150px_84px_128px]';
  const span = nonGst ? 'lg:col-span-5' : 'lg:col-span-7';
  const where = activeIndex === -1 ? 'at the end' : `below row ${activeIndex + 1} (Sr. ${refs[activeIndex]})`;
  return (
    <div className="mb-6" ref={box}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Bill of Quantities {loading && <span className="ml-2 text-xs font-medium normal-case text-muted">Loading…</span>}</h3>
        <p className="text-xs text-muted">Sr. No. is automatic (A, 1, a) …); type in it to override.</p>
      </div>
      <div className="rounded-xl border border-line shadow-sm">
        <div className={cn('hidden gap-2 rounded-t-xl bg-[#FAFAF8] px-3 py-3 lg:grid', cols)}>
          <span className={cn(HEAD, 'text-center')}>Sr. No.</span>
          <span className={HEAD}>Description</span>
          <span className={HEAD}>Unit</span>
          <span className={cn(HEAD, 'text-right')}>Qty</span>
          <span className={cn(HEAD, 'text-right')}>Rate (₹)</span>
          <span className={cn(HEAD, 'text-right')}>Amount</span>
          {!nonGst && <span className={HEAD}>HSN/SAC</span>}
          {!nonGst && <span className={HEAD}>GST %</span>}
          <span className={cn(HEAD, 'text-right')}>Actions</span>
        </div>
        {lines.map((line, i) => {
          const type = typeOf(line);
          const plain = type === 'section' || type === 'group';
          const m = lineMaths(line, nonGst, intra);
          const known = !line.hsnSac || codes.some((c) => c.code === line.hsnSac);
          const no = `row ${i + 1}`;
          return (
            <div key={line.uid} data-row={line.uid} onFocus={() => setActive(line.uid)}
              className={cn('grid grid-cols-6 items-start gap-2 border-t border-line px-3 py-3 first:border-t-0 lg:py-2 lg:first:border-t', cols,
                problemRow === line.uid ? 'bg-red-50' : type === 'section' ? 'bg-brand-tint/60' : type === 'sub' ? 'bg-[#FCFBF8]' : 'bg-white',
                type === 'sub' && 'max-lg:ml-4 max-lg:border-l-2 max-lg:border-l-brand-tint',
                active === line.uid && 'shadow-[inset_3px_0_0_#B98E57]')}>
              {/* Sr. No.: automatic placeholder, typed value overrides */}
              <div className="order-[-2] col-span-3 flex items-center gap-2 lg:order-none lg:col-span-1">
                <Input data-field="ref" aria-label={`Sr. No. for ${no}`} maxLength={10} value={line.ref} placeholder={auto[i]} onChange={(e) => update(line.uid, { ref: e.target.value })}
                  title="Automatic Sr. No. Type to override."
                  className={cn('w-14 px-1 py-2 text-center text-[13px] font-bold placeholder:font-bold placeholder:text-ink lg:w-full', type === 'sub' && 'placeholder:text-muted', type === 'section' && 'bg-white/70')} />
                <span title={TYPE_NAME[type]} className={cn('whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide lg:hidden', type === 'section' ? 'bg-white/70 text-brand' : 'bg-paper text-muted')}>{SHORT[type]}</span>
              </div>
              <div className={cn('relative col-span-6', plain ? span : 'lg:col-span-1', type === 'sub' && 'lg:pl-6')}>
                {type === 'sub' && <CornerDownRight size={15} className="absolute left-0 top-2.5 hidden text-brand-gold lg:block" />}
                <AutoTextarea data-field="description" aria-label={`Description for ${no}`} maxLength={4000} value={line.description} placeholder={PLACEHOLDER[type]}
                  onChange={(e) => update(line.uid, { description: e.target.value })}
                  className={cn('px-2.5 py-2 leading-snug', type === 'section' && 'bg-white/80 font-bold uppercase tracking-wide placeholder:normal-case placeholder:font-normal placeholder:tracking-normal', type === 'group' && 'bg-[#FDFCFA]')} />
              </div>
              {!plain && (
                <>
                  <label className="col-span-2 lg:col-span-1">
                    <span className="erp-label lg:hidden">Unit</span>
                    <UnitPicker label={`Unit for ${no}`} value={line.unit} onChange={(unit) => update(line.uid, { unit })} />
                  </label>
                  <label className="col-span-2 lg:col-span-1">
                    <span className="erp-label lg:hidden">Qty</span>
                    <Input data-field="qty" aria-label={`Quantity for ${no}`} type="number" min="0" step="any" inputMode="decimal" className="px-2.5 py-2 text-right tabular-nums"
                      value={line.qty} onChange={(e) => update(line.uid, { qty: e.target.value })} onKeyDown={(e) => onEnter(e, i, 'qty')} />
                  </label>
                  <label className="col-span-2 lg:col-span-1">
                    <span className="erp-label lg:hidden">Rate (₹)</span>
                    <Input data-field="rate" aria-label={`Rate for ${no}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder={allowBlank ? 'Blank' : '0.00'}
                      title={allowBlank ? 'Leave blank to quote later: prints "—" and is left out of the total.' : undefined}
                      className="px-2.5 py-2 text-right tabular-nums placeholder:text-muted/60" value={line.rate} onChange={(e) => update(line.uid, { rate: e.target.value })} onKeyDown={(e) => onEnter(e, i, 'rate')} />
                  </label>
                  <div className="col-span-6 flex items-baseline justify-between gap-2 max-lg:order-1 max-lg:border-t max-lg:border-dashed max-lg:pt-2 lg:col-span-1 lg:block lg:pt-2 lg:text-right">
                    <span className="erp-label mb-0 lg:hidden">Amount</span>
                    <span>
                      {blankRate(line)
                        ? <span className={cn('text-sm font-semibold', allowBlank ? 'text-muted' : 'text-amber-700')} title={allowBlank ? 'No rate: left out of the total' : 'Enter a rate'}>—</span>
                        : <span className="text-sm font-semibold tabular-nums text-ink">{inr(m.taxable)}</span>}
                      {!nonGst && m.tax > 0 && <span className="block whitespace-nowrap text-right text-[10px] tabular-nums text-muted">+ GST {inr(m.tax)}</span>}
                    </span>
                  </div>
                  {!nonGst && (
                    <label className="col-span-4 lg:col-span-1">
                      <span className="erp-label lg:hidden">HSN/SAC</span>
                      <Select data-field="hsn" aria-label={`HSN/SAC for ${no}`} className="py-2 pl-2.5 font-mono text-[13px]" value={line.hsnSac} onChange={(e) => pickCode(line.uid, e.target.value)}>
                        <option value="">Select…</option>
                        {!known && <option value={line.hsnSac}>{line.hsnSac}</option>}
                        {codes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description} ({c.gstRatePct}%)</option>)}
                      </Select>
                    </label>
                  )}
                  {!nonGst && (
                    <label className="col-span-2 lg:col-span-1">
                      <span className="erp-label lg:hidden">GST %</span>
                      <Select aria-label={`GST rate for ${no}`} className="py-2 pl-2.5 pr-7" value={line.gstRatePct} onChange={(e) => update(line.uid, { gstRatePct: Number(e.target.value) })}>
                        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </Select>
                    </label>
                  )}
                </>
              )}
              <div className="order-[-1] col-span-3 flex items-center justify-end gap-0.5 lg:order-none lg:col-span-1 lg:pt-1.5">
                <label title="Change line type" className="relative cursor-pointer rounded p-1 text-muted/70 transition-colors focus-within:bg-brand-soft focus-within:text-brand hover:bg-brand-soft hover:text-brand">
                  <ListTree size={15} />
                  <select aria-label={`Change type of ${no}`} value={type} onChange={(e) => update(line.uid, TYPE_PATCH[e.target.value])} className="absolute inset-0 cursor-pointer opacity-0">
                    {LINE_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                <RowBtn icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
                <RowBtn icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === lines.length - 1} />
                <RowBtn icon={Copy} label="Duplicate" onClick={() => duplicate(i)} />
                <RowBtn icon={Trash2} label="Delete row" tone="danger" onClick={() => remove(i)} disabled={lines.length === 1} />
              </div>
            </div>
          );
        })}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-[#FAFAF8]/95 px-3 py-2.5 backdrop-blur">
          <div className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
            {ADD.map(([type, label, short]) => (
              <button key={type} type="button" onClick={() => add(type)}
                className={cn('flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-1.5 py-1.5 text-xs font-bold transition-colors sm:px-3',
                  type === 'item' ? 'border-brand bg-brand text-white hover:bg-brand-dark' : 'border-line bg-white text-brand hover:border-brand-gold hover:bg-brand-soft')}>
                <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{short}</span>
              </button>
            ))}
          </div>
          <span className={cn('items-center gap-1.5 text-[11px] text-muted sm:ml-auto sm:flex', activeIndex === -1 ? 'hidden' : 'flex')}>
            <Plus size={12} /> Adds {where}
            {activeIndex !== -1 && <button type="button" onClick={() => setActive(null)} className="font-semibold text-brand hover:underline">· add at end instead</button>}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">Press <kbd className="rounded border border-line bg-white px-1 font-sans">Enter</kbd> in Qty or Rate to jump to the next line; on the last line it adds a new one.{allowBlank && ' Leave a rate blank to quote it later — it prints “—” and is left out of the total.'}</p>
      {!nonGst && !codes.length && <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><Info size={14} /> No HSN/SAC codes yet. Add them under HSN / SAC first, then pick one for each line.</p>}
    </div>
  );
}

function Totals({ totals, nonGst, intra, rate, label, warning, allowBlank }) {
  const Row = ({ name, value, badge }) => (
    <div className="flex justify-between gap-4 text-sm text-muted">
      <span className="flex items-center gap-1.5">{name}{badge != null && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">{badge}%</span>}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
  const n = totals.unpriced;
  return (
    <div className="rounded-xl border border-line bg-paper p-5 shadow-inner sm:p-6">
      <div className="space-y-3">
        <Row name={nonGst ? 'Sub Total' : 'Taxable Amount'} value={inr(totals.taxable)} />
        {!nonGst && (intra ? (
          <>
            <Row name="CGST" badge={rate != null ? rate / 2 : null} value={inr(totals.cgst)} />
            <Row name="SGST" badge={rate != null ? rate / 2 : null} value={inr(totals.sgst)} />
          </>
        ) : <Row name="IGST" badge={rate} value={inr(totals.igst)} />)}
        {!nonGst && <div className="border-t border-line pt-2"><Row name="Total GST" value={inr(totals.tax)} /></div>}
        <Row name={<span className="flex items-center gap-1"><ArrowRightLeft size={12} /> Round Off</span>} value={`${totals.roundOff >= 0 ? '+' : '−'}${inr(Math.abs(totals.roundOff))}`} />
        <div className="flex items-center justify-between border-t-2 border-[#D9D4C7] pt-3">
          <span className="text-sm font-bold uppercase tracking-tight text-ink">{label}</span>
          <span className="text-xl font-black tabular-nums text-brand">{inr(totals.grand)}</span>
        </div>
        {n > 0 && (allowBlank
          ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{n} line{n === 1 ? '' : 's'} without a rate {n === 1 ? 'is' : 'are'} excluded from the total. Fill {n === 1 ? 'it' : 'them'} in before converting to an invoice.</p>
          : <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{n} line{n === 1 ? ' needs' : 's need'} a rate before saving.</p>)}
        {warning && <p className="text-right text-xs font-medium text-red-600">{warning}</p>}
        <p className="text-right text-[11px] text-muted">Rounded to the nearest rupee. Section and description-only rows carry no amount.</p>
      </div>
    </div>
  );
}
