// Sales Invoices tab: payment status from settled amounts, edit while unsettled, cancel with reversal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Download, Eye, FileDown, FileMinus, FileText, Link2, Pencil, Plus, Wallet } from 'lucide-react';
import { api, openDocument } from '../../lib/api.js';
import { compactINR, downloadCsv, inr, localDate, showDate } from '../../lib/format.js';
import { useFY } from '../../context.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Button, IconButton, Page, PageHeader, StatusBadge, useFeedback } from '../../components/ui.jsx';
import DocumentForm from './DocumentForm.jsx';
import { FilterChips, Money, Tile, copyShareLink, invoiceStatus, rupees, useMasters } from './shared.jsx';

const STATUSES = [['all', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Partly Paid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled']];
const LABELS = { unpaid: 'Unpaid', partial: 'Partly paid', overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled' };

export default function Invoices({ nonGst, createSignal, onConsumed, onCreateNote }) {
  const { inFy, label: fyLabel } = useFY();
  const feedback = useFeedback();
  const { toast, confirm } = feedback;
  const { clients, codes } = useMasters();
  const [all, setAll] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(null);
  const [visible, setVisible] = useState([]);

  const load = useCallback(() => api.get('/invoices').then((rows) => { setAll(rows); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const openCreate = useCallback(() => {
    setForm({});
    api.get('/quotations').then(setQuotations).catch(() => {});
  }, []);
  useEffect(() => { if (createSignal) { openCreate(); onConsumed?.(); } }, [createSignal, onConsumed, openCreate]);

  const today = localDate();
  const scoped = useMemo(() => all.filter((i) => Boolean(i.isNonGst) === Boolean(nonGst) && inFy(i.date)).map((i) => ({ ...i, payStatus: invoiceStatus(i, today), balance: i.status === 'cancelled' ? 0 : Math.max(0, Number(i.grandTotal) - Number(i.settled || 0)) })), [all, nonGst, inFy, today]);
  const rows = useMemo(() => {
    if (status === 'all') return scoped;
    if (status === 'unpaid') return scoped.filter((i) => ['unpaid', 'overdue', 'partial'].includes(i.payStatus));
    return scoped.filter((i) => i.payStatus === status);
  }, [scoped, status]);
  const count = (s) => (s === 'unpaid' ? scoped.filter((i) => ['unpaid', 'overdue', 'partial'].includes(i.payStatus)).length : scoped.filter((i) => i.payStatus === s).length);
  const active = scoped.filter((i) => i.status !== 'cancelled');
  const billed = active.reduce((n, i) => n + Number(i.grandTotal), 0);
  const settled = active.reduce((n, i) => n + Math.min(Number(i.settled || 0), Number(i.grandTotal)), 0);
  const outstanding = active.reduce((n, i) => n + i.balance, 0);
  const overdue = scoped.filter((i) => i.payStatus === 'overdue');

  const edit = async (row) => {
    try { setForm({ editing: await api.get(`/invoices/${row.id}`) }); } catch (err) { toast(err.message, 'error'); }
  };
  const cancel = async (row) => {
    const date = await confirm({
      title: `Cancel ${row.invoiceNo}?`, tone: 'danger', confirmLabel: 'Cancel Invoice',
      message: <>A reversal voucher is posted and the invoice stays visible as CANCELLED.{Number(row.settled) > 0 && <> Receipts of <b>{inr(row.settled)}</b> settling it become unallocated advances.</>} This cannot be undone.</>,
      input: { label: 'Cancellation Date', type: 'date', required: true, defaultValue: row.date, hint: 'The reversal is posted on this date. It cannot be before the invoice date.' },
    });
    if (!date) return;
    try {
      const result = await api.post(`/invoices/${row.id}/cancel`, { date });
      toast(`${row.invoiceNo} cancelled. Reversal ${result.reversalNo} posted.`);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const exportCsv = (list) => downloadCsv(`${nonGst ? 'NonGST_' : ''}Invoices_${localDate()}.csv`,
    ['Invoice No', 'Date', 'Due Date', 'Client Name', 'Place of Supply', 'Total Amount', 'Settled', 'Balance', 'Status'],
    list.map((i) => [i.invoiceNo, showDate(i.date), showDate(i.dueDate), i.clientName, i.placeOfSupplyStateCode || '', rupees(i.grandTotal), rupees(i.settled), rupees(i.balance), LABELS[i.payStatus]]));

  const columns = [
    { key: 'invoiceNo', label: 'Invoice #', sortable: true, primaryLabel: true, render: (v) => <span className="whitespace-nowrap font-bold text-ink">{v}</span> },
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true,
      render: (v, row) => <span className="whitespace-nowrap text-muted">{showDate(v)}{row.status === 'active' && row.dueDate && <span className={`block text-[11px] ${row.payStatus === 'overdue' ? 'font-semibold text-red-600' : ''}`}>Due {showDate(row.dueDate)}</span>}</span> },
    { key: 'clientName', label: 'Client', sortable: true, render: (v) => <span className="font-medium text-[#4A4944]">{v}</span> },
    { key: 'grandTotal', label: 'Amount', align: 'right', sortable: true, primaryAmount: true,
      render: (v, row) => (
        <span className="inline-flex flex-col items-end whitespace-nowrap">
          <Money paise={v} />
          {row.status === 'active' && (row.balance ? <span className="text-[11px] font-semibold tabular-nums text-amber-700">Balance {inr(row.balance)}</span> : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={12} /> Settled</span>)}
        </span>
      ) },
    { key: 'payStatus', label: 'Status', align: 'center', sortable: true, render: (v) => <StatusBadge status={v} label={LABELS[v]} /> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => {
        const isActive = row.status === 'active';
        const locked = Number(row.settled) > 0;
        return (
          <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <IconButton icon={Eye} label="View / Print" onClick={() => openDocument(`/invoices/${row.id}/view`)} />
            <IconButton icon={FileDown} label="Download PDF" onClick={() => openDocument(`/invoices/${row.id}/pdf`)} />
            {row.publicToken && isActive && <IconButton icon={Link2} label="Copy share link" onClick={() => copyShareLink(row.publicToken, feedback)} />}
            {isActive && <IconButton icon={Pencil} label={locked ? 'Locked: money is settled against this invoice' : 'Edit Invoice'} className={locked ? 'opacity-40' : ''}
              onClick={() => (locked ? toast(`${row.invoiceNo} has receipts or credit notes settled against it, so it can no longer be edited. Raise a credit / debit note instead.`, 'warning') : edit(row))} />}
            {isActive && onCreateNote && <IconButton icon={FileMinus} label="Create Credit / Debit Note" onClick={() => onCreateNote(row)} />}
            {isActive && <IconButton icon={Ban} tone="danger" label="Cancel Invoice" onClick={() => cancel(row)} />}
          </div>
        );
      } },
  ];

  return (
    <Page>
      <PageHeader icon={FileText} title={nonGst ? 'Non-GST Invoices' : 'Sales Invoices'} subtitle={`${fyLabel} · Editable until money is settled against them`}
        actions={<>
          <Button variant="secondary" icon={Download} disabled={!visible.length} onClick={() => exportCsv(visible)} className="sm:flex-none">Export</Button>
          <Button icon={Plus} onClick={openCreate} className="flex-1 whitespace-nowrap sm:flex-none">Create Invoice</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={FileText} label="Invoices" value={active.length} hint={`${count('cancelled')} cancelled`} active={status === 'all'} onClick={() => setStatus('all')} />
        <Tile icon={Wallet} label="Total Billed" value={compactINR(billed)} hint={inr(billed)} tone="dark" />
        <Tile icon={CheckCircle2} label="Settled" value={compactINR(settled)} hint={`${count('paid')} fully paid`} tone="green" active={status === 'paid'} onClick={() => setStatus('paid')} />
        <Tile icon={AlertTriangle} label="Outstanding" value={compactINR(outstanding)} hint={overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'} tone={overdue.length ? 'red' : 'amber'} active={status === 'unpaid'} onClick={() => setStatus('unpaid')} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        storageKey={nonGst ? 'nongst_invoices_table_size' : 'invoices_table_size'}
        searchPlaceholder="Search invoices…"
        toolbar={<FilterChips value={status} onChange={setStatus} options={STATUSES.map(([k, l]) => [k, l, k === 'all' ? scoped.length : count(k)])} />}
        onVisibleRowsChange={setVisible}
        minWidth="860px"
        emptyMessage={status === 'all' ? `No ${nonGst ? 'Non-GST ' : ''}invoices in ${fyLabel}` : `No ${LABELS[status]?.toLowerCase() || status} invoices`}
        emptyHint="Create an invoice directly, or convert an approved quotation."
        emptyAction={status === 'all' && <Button icon={Plus} onClick={openCreate}>Create Invoice</Button>}
        rowClassName={(row) => (row.status === 'cancelled' ? 'opacity-60' : '')}
      />

      {form && (
        <DocumentForm kind="invoice" nonGst={Boolean(nonGst)} editing={form.editing} clients={clients} codes={codes} quotations={quotations}
          onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); toast(msg); load(); }} />
      )}
    </Page>
  );
}
