// Create / edit modal shared by quotations, sales invoices and credit / debit notes.
// Layout follows the ERP form: header fields, a line-item grid, then terms on the left and
// the live totals panel on the right. Totals mirror the server's GST and round-off maths.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, FileMinus, FileSpreadsheet, FileText, Info, MapPin, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { addDays, cn, inr, showDate } from '../../lib/format.js';
import { STATES } from '../../lib/states.js';
import { useCompany, useFY } from '../../context.jsx';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '../../components/ui.jsx';
import { GST_RATES, REASONS, clientState, lineMaths, preview, stateLabel, toItems, toLines } from './shared.jsx';

const KIND = {
  quotation: { noun: 'Quotation', icon: FileSpreadsheet, path: '/quotations', number: 'quotationNo' },
  invoice: { noun: 'Invoice', icon: FileText, path: '/invoices', number: 'invoiceNo' },
  credit: { noun: 'Credit Note', icon: FileMinus, path: '/credit-notes', number: 'noteNo' },
};

export default function DocumentForm({ kind, nonGst, editing, clients, codes, invoices = [], notes = [], quotations = [], initialInvoiceId, onClose, onSaved }) {
  const { stateCode: companyState } = useCompany();
  const { fy, defaultDate } = useFY();
  const defaultCode = codes.find((c) => c.isDefault);
  const blankLine = () => ({ description: '', hsnSac: nonGst ? '' : defaultCode?.code || '', qty: 1, rate: '', gstRatePct: nonGst ? 0 : defaultCode ? Number(defaultCode.gstRatePct) : 18 });

  const startInvoice = initialInvoiceId ? invoices.find((i) => String(i.id) === String(initialInvoiceId)) : null;
  const firstDate = editing?.date || defaultDate();
  const [f, setF] = useState(() => ({
    clientLedgerId: editing?.clientLedgerId ? String(editing.clientLedgerId) : startInvoice ? String(startInvoice.clientLedgerId) : '',
    date: firstDate,
    dueDate: editing?.dueDate || firstDate,
    validUntil: editing?.validUntil || addDays(firstDate, 30),
    pos: editing?.placeOfSupplyStateCode || '',
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
  const [lines, setLines] = useState(() => (editing?.items?.length ? toLines(editing.items) : [blankLine()]));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
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
  const uniformRate = lines.length && lines.every((l) => Number(l.gstRatePct) === Number(lines[0].gstRatePct)) ? Number(lines[0].gstRatePct) : null;

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
    } catch (err) { setError(err.message); } finally { setLoadingLines(false); }
  };
  const pickQuotation = async (id) => {
    set({ quotationRef: id });
    if (!id) return;
    setLoadingLines(true);
    try {
      const q = await api.get(`/quotations/${id}`);
      setLines(toLines(q.items));
      set({ quotationRef: id, terms: f.terms || q.terms || '', narration: f.narration || q.notes || '' });
    } catch (err) { setError(err.message); } finally { setLoadingLines(false); }
  };
  // Credit notes started from the Invoices tab load that invoice's lines once.
  useEffect(() => { if (startInvoice) pickInvoice(String(startInvoice.id)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    if (kind === 'credit' ? !f.invoiceId : !f.clientLedgerId) return kind === 'credit' ? 'Select the invoice this note is raised against.' : 'Select a client.';
    if (!f.date) return 'Enter the date.';
    if (fy && (f.date < fy.startDate || f.date > fy.endDate)) return `The date must fall inside FY ${fy.label} (${showDate(fy.startDate)} – ${showDate(fy.endDate)}).`;
    if (kind === 'invoice' && f.dueDate && f.dueDate < f.date) return 'Due date cannot be before the invoice date.';
    if (kind === 'quotation' && f.validUntil && f.validUntil < f.date) return 'Valid-until date cannot be before the quotation date.';
    if (kind === 'credit' && invoice && f.date < invoice.date) return `The note date cannot be before the invoice date (${showDate(invoice.date)}).`;
    if (!nonGst && !companyState) return 'Set the company state code in Settings before creating GST documents.';
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!String(l.description).trim()) return `Item #${i + 1} must have a description.`;
      if (!nonGst && !l.hsnSac) return `Item #${i + 1} must have an HSN/SAC code.`;
      if (!(Number(l.qty) > 0)) return `Item #${i + 1} quantity must be greater than zero.`;
      if (!(Number(l.rate) > 0)) return `Item #${i + 1} rate must be greater than zero.`;
    }
    if (exceeds) return `Credit note total (${inr(totals.grand)}) exceeds what is left on the invoice (${inr(leftOnInvoice)}).`;
    return '';
  };

  const save = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const items = toItems(lines, nonGst);
      let body;
      if (kind === 'credit') body = { invoiceId: f.invoiceId, date: f.date, noteType: f.noteType, reason: f.reason, narration: f.remark.trim(), items };
      else body = {
        clientLedgerId: f.clientLedgerId, date: f.date, isNonGst: nonGst, placeOfSupplyStateCode: nonGst ? '' : pos, terms: f.terms, items,
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

  const saveLabel = editing ? `Update ${noun}` : kind === 'credit' ? `Save ${f.noteType === 'D' ? 'Debit' : 'Credit'} Note` : `Save ${noun}`;
  // Portalled to #erp-root: the site's global `main { z-index: 1 }` would otherwise trap the overlay under the sidebar.
  return createPortal((
    <Modal title={title} icon={editing ? Pencil : Icon} size="xl" onClose={onClose} busy={saving}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Discard</Button>
        <Button type="submit" form="sales-doc-form" icon={Save} loading={saving} disabled={exceeds}>{saving ? 'Saving…' : saveLabel}</Button>
      </>}>
      <form id="sales-doc-form" onSubmit={save} noValidate>
        {error && <Alert onClose={() => setError('')} className="animate-shake">{error}</Alert>}
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
              <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-brand-tint bg-brand-soft p-4 md:grid-cols-2">
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
                  hint={clientQuotes.length === 0 ? 'No draft or approved quotations found for this client.' : f.quotationRef ? '✓ Line items pre-filled. Saving links this invoice to the quotation and marks the quotation converted.' : 'Copies the line items of a quotation into this invoice.'}>
                  <Select placeholder="-- No Quotation Reference --" value={f.quotationRef} onChange={(e) => pickQuotation(e.target.value)} disabled={!clientQuotes.length}>
                    {clientQuotes.map((q) => <option key={q.id} value={q.id}>{q.quotationNo} - {inr(q.grandTotal)} ({q.status})</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        )}

        <LineItems lines={lines} setLines={setLines} nonGst={nonGst} intra={intra} codes={codes} blankLine={blankLine} loading={loadingLines} />

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
          <Totals totals={totals} nonGst={nonGst} intra={intra} rate={uniformRate} label={kind === 'credit' ? 'Note Total' : 'Grand Total'}
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

const HEAD = 'text-[10px] font-bold uppercase tracking-widest text-muted';
// One markup for all widths: a row grid on large screens, stacked cards on phones.
function LineItems({ lines, setLines, nonGst, intra, codes, blankLine, loading }) {
  const update = (i, patch) => setLines(lines.map((l, x) => (x === i ? { ...l, ...patch } : l)));
  const pickCode = (i, code) => {
    const match = codes.find((c) => c.code === code);
    update(i, { hsnSac: code, ...(match ? { gstRatePct: Number(match.gstRatePct) } : {}) });
  };
  const cols = nonGst ? 'lg:grid-cols-[minmax(140px,1fr)_90px_130px_140px_32px]' : 'lg:grid-cols-[minmax(140px,1fr)_160px_70px_100px_100px_92px_104px_110px_32px]';
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Line Items {loading && <span className="ml-2 text-xs font-medium normal-case text-muted">Loading…</span>}</h3>
        <button type="button" onClick={() => setLines([...lines, blankLine()])} className="flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-dark"><Plus size={14} /> Add Item</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-line shadow-sm">
        <div className={cn('hidden gap-2 bg-[#FAFAF8] px-4 py-3 lg:grid', cols)}>
          <span className={HEAD}>Description</span>
          {!nonGst && <span className={HEAD}>HSN/SAC</span>}
          <span className={cn(HEAD, 'text-right')}>Qty</span>
          <span className={cn(HEAD, 'text-right')}>Rate (₹)</span>
          {!nonGst && <span className={cn(HEAD, 'text-right')}>Amount</span>}
          {!nonGst && <span className={cn(HEAD, 'text-center')}>GST %</span>}
          {!nonGst && <span className={cn(HEAD, 'text-right')}>{intra ? 'CGST + SGST' : 'IGST'}</span>}
          <span className={cn(HEAD, 'text-right')}>{nonGst ? 'Amount' : 'Total'}</span>
          <span />
        </div>
        {lines.map((line, i) => {
          const m = lineMaths(line, nonGst, intra);
          const known = !line.hsnSac || codes.some((c) => c.code === line.hsnSac);
          return (
            <div key={i} className={cn('grid grid-cols-6 items-center gap-2 border-t border-line bg-white px-4 py-3 first:border-t-0 hover:bg-brand-soft/40 lg:py-2 lg:first:border-t', cols)}>
              <div className="col-span-6 flex items-center gap-2 lg:col-span-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-bold text-muted lg:hidden">{i + 1}</span>
                <Input aria-label={`Item ${i + 1} description`} className="px-2.5 py-2" placeholder="Service or Product name" value={line.description} onChange={(e) => update(i, { description: e.target.value })} />
              </div>
              {!nonGst && (
                <label className="col-span-6 lg:col-span-1">
                  <span className="erp-label lg:hidden">HSN/SAC</span>
                  <Select aria-label={`Item ${i + 1} HSN/SAC`} className="py-2 pl-2.5 font-mono text-[13px]" value={line.hsnSac} onChange={(e) => pickCode(i, e.target.value)}>
                    <option value="">Select…</option>
                    {!known && <option value={line.hsnSac}>{line.hsnSac}</option>}
                    {codes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description} ({c.gstRatePct}%)</option>)}
                  </Select>
                </label>
              )}
              <label className={cn(nonGst ? 'col-span-3' : 'col-span-2', 'lg:col-span-1')}>
                <span className="erp-label lg:hidden">Qty</span>
                <Input aria-label={`Item ${i + 1} quantity`} type="number" min="0" step="any" inputMode="decimal" className="px-2.5 py-2 text-right tabular-nums" value={line.qty} onChange={(e) => update(i, { qty: e.target.value })} />
              </label>
              <label className={cn(nonGst ? 'col-span-3' : 'col-span-2', 'lg:col-span-1')}>
                <span className="erp-label lg:hidden">Rate (₹)</span>
                <Input aria-label={`Item ${i + 1} rate`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" className="px-2.5 py-2 text-right tabular-nums" value={line.rate} onChange={(e) => update(i, { rate: e.target.value })} />
              </label>
              {!nonGst && <span className="hidden text-right text-sm font-semibold tabular-nums text-ink lg:block">{inr(m.taxable)}</span>}
              {!nonGst && (
                <label className="col-span-2 lg:col-span-1">
                  <span className="erp-label lg:hidden">GST %</span>
                  <Select aria-label={`Item ${i + 1} GST rate`} className="py-2 pl-2.5 pr-7" value={line.gstRatePct} onChange={(e) => update(i, { gstRatePct: Number(e.target.value) })}>
                    {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                  </Select>
                </label>
              )}
              {!nonGst && (
                <span className="hidden text-right text-sm tabular-nums text-ink lg:block">
                  {m.tax ? inr(m.tax) : '-'}
                  {intra && m.tax > 0 && <span className="block whitespace-nowrap text-[10px] text-muted">{inr(m.cgst)} + {inr(m.sgst)}</span>}
                </span>
              )}
              <span className="hidden text-right text-sm font-bold tabular-nums text-ink lg:block">{inr(m.total)}</span>
              <button type="button" onClick={() => setLines(lines.filter((_, x) => x !== i))} disabled={lines.length === 1} title="Remove item" aria-label={`Remove item ${i + 1}`}
                className="hidden justify-center text-muted/50 transition-colors hover:text-red-500 disabled:invisible lg:flex"><Trash2 size={16} /></button>
              {/* Phone summary row */}
              <div className="col-span-6 flex items-center justify-between gap-3 pt-1 text-xs text-muted lg:hidden">
                <span className="tabular-nums">{nonGst ? 'Amount' : `${inr(m.taxable)} + GST ${inr(m.tax)}`}</span>
                <span className="flex items-center gap-3">
                  <b className="text-sm tabular-nums text-ink">{inr(m.total)}</b>
                  {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((_, x) => x !== i))} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Remove item ${i + 1}`}><Trash2 size={15} /></button>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {!nonGst && !codes.length && <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><Info size={14} /> No HSN/SAC codes yet. Add them under HSN / SAC first, then pick one for each line.</p>}
    </div>
  );
}

function Totals({ totals, nonGst, intra, rate, label, warning }) {
  const Row = ({ name, value, badge }) => (
    <div className="flex justify-between gap-4 text-sm text-muted">
      <span className="flex items-center gap-1.5">{name}{badge != null && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">{badge}%</span>}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
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
        {warning && <p className="text-right text-xs font-medium text-red-600">{warning}</p>}
        <p className="text-right text-[11px] text-muted">Rounded to the nearest rupee. Final figures are worked out on save.</p>
      </div>
    </div>
  );
}
