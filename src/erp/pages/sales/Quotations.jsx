// Quotations tab: draft → approve → convert to invoice, with view / PDF / share link.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle, Download, Eye, FileDown, FileSpreadsheet, FileText, Hourglass, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, openDocument } from '../../lib/api.js';
import { addDays, compactINR, downloadCsv, localDate, showDate } from '../../lib/format.js';
import { useFY } from '../../context.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Button, IconButton, Page, PageHeader, StatusBadge, useFeedback } from '../../components/ui.jsx';
import DocumentForm from './DocumentForm.jsx';
import { FilterChips, Money, Tile, copyShareLink, rupees, useMasters } from './shared.jsx';

const STATUSES = [['all', 'All'], ['draft', 'Draft'], ['approved', 'Approved'], ['converted', 'Converted'], ['cancelled', 'Cancelled']];

export default function Quotations({ nonGst, createSignal, onConsumed }) {
  const { inFy, label: fyLabel, defaultDate } = useFY();
  const feedback = useFeedback();
  const { toast, confirm } = feedback;
  const { clients, codes } = useMasters();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(null);
  const [visible, setVisible] = useState([]);

  const load = useCallback(() => api.get('/quotations').then((rows) => { setAll(rows); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (createSignal) { setForm({}); onConsumed?.(); } }, [createSignal, onConsumed]);

  const scoped = useMemo(() => all.filter((q) => Boolean(q.isNonGst) === Boolean(nonGst) && inFy(q.date)), [all, nonGst, inFy]);
  const rows = useMemo(() => (status === 'all' ? scoped : scoped.filter((q) => q.status === status)), [scoped, status]);
  const count = (s) => scoped.filter((q) => q.status === s).length;
  const live = scoped.filter((q) => q.status !== 'cancelled');
  const open = scoped.filter((q) => ['draft', 'approved'].includes(q.status));
  const sum = (list) => list.reduce((n, q) => n + Number(q.grandTotal), 0);

  const run = async (action, success) => {
    try { const result = await action(); toast(typeof success === 'function' ? success(result) : success); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const edit = async (row) => {
    try { setForm({ editing: await api.get(`/quotations/${row.id}`) }); } catch (err) { toast(err.message, 'error'); }
  };
  const approve = (row) => run(() => api.post(`/quotations/${row.id}/approve`), `${row.quotationNo} approved. You can now convert it to an invoice.`);
  const convert = async (row) => {
    const date = await confirm({
      title: 'Convert to Invoice',
      message: <>Create a sales invoice from <b>{row.quotationNo}</b> for <b>{row.clientName}</b>? The quotation is marked converted and can no longer be edited.</>,
      confirmLabel: 'Create Invoice',
      input: { label: 'Invoice Date', type: 'date', required: true, defaultValue: defaultDate() || localDate(), hint: 'The posting date of the new invoice.' },
    });
    if (!date) return;
    const days = Number(clients.find((c) => String(c.id) === String(row.clientLedgerId))?.creditPeriodDays || 0);
    try {
      const result = await api.post(`/quotations/${row.id}/convert`, { date, dueDate: addDays(date, days) });
      toast(`Invoice ${result.invoiceNo} created from ${row.quotationNo}.`);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const cancel = async (row) => {
    const ok = await confirm({ title: `Cancel ${row.quotationNo}?`, tone: 'danger', confirmLabel: 'Cancel Quotation', message: 'The quotation will be marked as CANCELLED and remain visible in the list. Its share link stops working. This cannot be undone.' });
    if (ok) run(() => api.post(`/quotations/${row.id}/cancel`), `${row.quotationNo} cancelled.`);
  };
  const remove = async (row) => {
    const ok = await confirm({ title: `Delete ${row.quotationNo}?`, tone: 'danger', confirmLabel: 'Delete', message: 'This permanently removes the quotation. If it is the latest number in the series, the number is freed for reuse. This cannot be undone.' });
    if (ok) run(() => api.del(`/quotations/${row.id}`), `${row.quotationNo} deleted.`);
  };

  const exportCsv = (list) => downloadCsv(`${nonGst ? 'NonGST_' : ''}Quotations_${localDate()}.csv`,
    ['Quotation No', 'Date', 'Client Name', 'Valid Until', 'Total Amount', 'Status', 'Invoice No'],
    list.map((q) => [q.quotationNo, showDate(q.date), q.clientName, q.validUntil ? showDate(q.validUntil) : '', rupees(q.grandTotal), q.status, q.invoiceNo || '']));

  const today = localDate();
  const columns = [
    { key: 'quotationNo', label: 'Quote #', sortable: true, primaryLabel: true,
      render: (v, row) => <span className="whitespace-nowrap font-bold text-ink">{v}{row.estimateId && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">AI estimate</span>}</span> },
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true,
      render: (v, row) => {
        const expired = ['draft', 'approved'].includes(row.status) && row.validUntil && row.validUntil < today;
        return <span className="whitespace-nowrap text-muted">{showDate(v)}{row.validUntil && <span className={`block text-[11px] ${expired ? 'font-semibold text-amber-700' : ''}`}>{expired ? 'Expired' : 'Valid till'} {showDate(row.validUntil)}</span>}</span>;
      } },
    { key: 'clientName', label: 'Client', sortable: true, render: (v) => <span className="font-medium text-[#4A4944]">{v}</span> },
    { key: 'grandTotal', label: 'Amount', align: 'right', sortable: true, primaryAmount: true, render: (v) => <Money paise={v} /> },
    { key: 'status', label: 'Status', align: 'center', sortable: true,
      render: (v, row) => <span className="inline-flex flex-col items-center gap-0.5"><StatusBadge status={v} />{row.invoiceNo && <span className="whitespace-nowrap text-[10px] font-semibold text-muted">→ {row.invoiceNo}</span>}</span> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {row.status === 'draft' && <IconButton icon={CheckCircle} tone="success" label="Approve" onClick={() => approve(row)} />}
          {row.status === 'approved' && <IconButton icon={FileText} tone="success" label="Convert to Invoice" onClick={() => convert(row)} />}
          <IconButton icon={Eye} label="View / Print" onClick={() => openDocument(`/quotations/${row.id}/view`)} />
          <IconButton icon={FileDown} label="Download PDF" onClick={() => openDocument(`/quotations/${row.id}/pdf`)} />
          {row.publicToken && row.status !== 'cancelled' && <IconButton icon={Link2} label="Copy share link" onClick={() => copyShareLink(row.publicToken, feedback)} />}
          {['draft', 'approved'].includes(row.status) && <IconButton icon={Pencil} label="Edit Quotation" onClick={() => edit(row)} />}
          {['draft', 'approved'].includes(row.status) && <IconButton icon={Ban} tone="danger" label="Cancel Quotation" onClick={() => cancel(row)} />}
          {row.status !== 'converted' && <IconButton icon={Trash2} tone="danger" label="Delete Quotation" onClick={() => remove(row)} />}
        </div>
      ) },
  ];

  const title = nonGst ? 'Non-GST Quotations' : 'Quotations';
  return (
    <Page>
      <PageHeader icon={FileSpreadsheet} title={title} subtitle={`${fyLabel} · Draft → approve → convert to invoice`}
        actions={<>
          <Button variant="secondary" icon={Download} disabled={!visible.length} onClick={() => exportCsv(visible)} className="sm:flex-none">Export</Button>
          <Button icon={Plus} onClick={() => setForm({})} className="flex-1 whitespace-nowrap sm:flex-none">Create Quotation</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={FileSpreadsheet} label="Quotations" value={live.length} hint={`${count('cancelled')} cancelled`} active={status === 'all'} onClick={() => setStatus('all')} />
        <Tile icon={FileText} label="Quoted Value" value={compactINR(sum(live))} hint="Excludes cancelled" tone="dark" />
        <Tile icon={Hourglass} label="Open" value={compactINR(sum(open))} hint={`${open.length} draft or approved`} tone="amber" />
        <Tile icon={CheckCircle} label="Converted" value={count('converted')} hint={compactINR(sum(scoped.filter((q) => q.status === 'converted')))} tone="green" active={status === 'converted'} onClick={() => setStatus('converted')} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        storageKey={nonGst ? 'nongst_quotations_table_size' : 'quotations_table_size'}
        searchPlaceholder="Search quotations…"
        toolbar={<FilterChips value={status} onChange={setStatus} options={STATUSES.map(([k, l]) => [k, l, k === 'all' ? scoped.length : count(k)])} />}
        onVisibleRowsChange={setVisible}
        minWidth="860px"
        emptyMessage={status === 'all' ? `No ${nonGst ? 'Non-GST ' : ''}quotations in ${fyLabel}` : `No ${status} quotations`}
        emptyHint="Create a quotation, approve it, then convert it to an invoice in one click."
        emptyAction={status === 'all' && <Button icon={Plus} onClick={() => setForm({})}>Create Quotation</Button>}
        rowClassName={(row) => (row.status === 'cancelled' ? 'opacity-60' : '')}
      />

      {form && (
        <DocumentForm kind="quotation" nonGst={Boolean(nonGst)} editing={form.editing} clients={clients} codes={codes}
          onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); toast(msg); load(); }} />
      )}
    </Page>
  );
}
