// Credit / Debit Notes tab: raised against an active invoice; cancelling posts a reversal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Download, Eye, FileDown, FileMinus, FilePlus, Link2, Plus, Undo2 } from 'lucide-react';
import { api, openDocument } from '../../lib/api.js';
import { compactINR, downloadCsv, inr, localDate, showDate } from '../../lib/format.js';
import { useFY } from '../../context.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Button, IconButton, Page, PageHeader, StatusBadge, useFeedback } from '../../components/ui.jsx';
import DocumentForm from './DocumentForm.jsx';
import { FilterChips, Tile, copyShareLink, rupees, useMasters } from './shared.jsx';

const FILTERS = [['all', 'All'], ['C', 'Credit'], ['D', 'Debit'], ['cancelled', 'Cancelled']];

export default function CreditNotes({ nonGst, createSignal, onConsumed }) {
  const { inFy, label: fyLabel } = useFY();
  const { toast, confirm } = useFeedback();
  const { clients, codes } = useMasters();
  const [all, setAll] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(null);
  const [visible, setVisible] = useState([]);

  const load = useCallback(() => Promise.all([api.get('/credit-notes'), api.get('/invoices')])
    .then(([notes, inv]) => { setAll(notes); setInvoices(inv); setError(''); })
    .catch((err) => setError(err.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  // The Invoices tab can open this form for a specific invoice; wait until invoices are loaded.
  useEffect(() => {
    if (!createSignal || loading) return;
    setForm({ invoiceId: createSignal.invoiceId });
    onConsumed?.();
  }, [createSignal, loading, onConsumed]);

  const scoped = useMemo(() => all.filter((n) => Boolean(n.isNonGst) === Boolean(nonGst) && inFy(n.date)), [all, nonGst, inFy]);
  const rows = useMemo(() => {
    if (filter === 'all') return scoped;
    if (filter === 'cancelled') return scoped.filter((n) => n.status === 'cancelled');
    return scoped.filter((n) => n.noteType === filter && n.status !== 'cancelled');
  }, [scoped, filter]);
  const live = scoped.filter((n) => n.status !== 'cancelled');
  const credits = live.filter((n) => n.noteType !== 'D');
  const debits = live.filter((n) => n.noteType === 'D');
  const sum = (list) => list.reduce((s, n) => s + Number(n.grandTotal), 0);
  const counts = { all: scoped.length, C: credits.length, D: debits.length, cancelled: scoped.length - live.length };

  const cancel = async (row) => {
    const kind = row.noteType === 'D' ? 'debit' : 'credit';
    const date = await confirm({
      title: `Cancel ${row.noteNo}?`, tone: 'danger', confirmLabel: 'Cancel Note',
      message: `A reversal voucher is posted${kind === 'credit' ? ' and the invoice\'s outstanding is restored' : ''}. The note stays visible as CANCELLED. This cannot be undone.`,
      input: { label: 'Cancellation Date', type: 'date', required: true, defaultValue: row.date, hint: 'Cannot be before the note date.' },
    });
    if (!date) return;
    try {
      const result = await api.post(`/credit-notes/${row.id}/cancel`, { date });
      toast(`${row.noteNo} cancelled. Reversal ${result.reversalNo} posted.`);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const exportCsv = (list) => downloadCsv(`${nonGst ? 'NonGST_' : ''}CreditNotes_${localDate()}.csv`,
    ['Note No', 'Type', 'Date', 'Client Name', 'Against Invoice', 'Reason', 'Total Amount', 'Status'],
    list.map((n) => [n.noteNo, n.noteType === 'D' ? 'Debit' : 'Credit', showDate(n.date), n.clientName, n.invoiceNo, n.reason || '', rupees(n.grandTotal), n.status]));

  const columns = [
    { key: 'noteNo', label: 'Note #', sortable: true, primaryLabel: true,
      render: (v, row) => (
        <span className="whitespace-nowrap font-bold text-ink">{v}
          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${row.noteType === 'D' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{row.noteType === 'D' ? 'Debit' : 'Credit'}</span>
        </span>
      ) },
    { key: 'date', label: 'Date', sortable: true, secondaryLabel: true, render: (v) => <span className="text-muted">{showDate(v)}</span> },
    { key: 'clientName', label: 'Client', sortable: true,
      render: (v, row) => <span className="block max-w-[260px]"><span className="font-medium text-[#4A4944]">{v}</span>{row.reason && <span className="block truncate text-[11px] text-muted" title={row.reason}>{row.reason}</span>}</span> },
    { key: 'invoiceNo', label: 'Against Invoice', sortable: true, render: (v) => <span className="whitespace-nowrap font-mono text-xs text-muted">{v}</span> },
    { key: 'grandTotal', label: 'Amount', align: 'right', sortable: true, primaryAmount: true,
      render: (v, row) => (row.noteType === 'D'
        ? <span className="whitespace-nowrap font-bold tabular-nums text-amber-700">+ {inr(v)}</span>
        : <span className="whitespace-nowrap font-bold tabular-nums text-rose-600">− {inr(v)}</span>) },
    { key: 'status', label: 'Status', align: 'center', sortable: true, render: (v) => <StatusBadge status={v} /> },
    { key: 'actions', label: 'Actions', align: 'right',
      render: (_v, row) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} label="View / Print" onClick={() => openDocument(`/credit-notes/${row.id}/view`)} />
          <IconButton icon={FileDown} label="Download PDF" onClick={() => openDocument(`/credit-notes/${row.id}/pdf`)} />
          {row.publicToken && row.status === 'active' && <IconButton icon={Link2} label="Copy share link" onClick={() => copyShareLink(row.publicToken, { toast, confirm })} />}
          {row.status === 'active' && <IconButton icon={Ban} tone="danger" label="Cancel Note" onClick={() => cancel(row)} />}
        </div>
      ) },
  ];

  return (
    <Page>
      <PageHeader icon={FileMinus} title={nonGst ? 'Non-GST Credit / Debit Notes' : 'Credit / Debit Notes'} subtitle={`${fyLabel} · Raised against an active invoice`}
        actions={<>
          <Button variant="secondary" icon={Download} disabled={!visible.length} onClick={() => exportCsv(visible)} className="sm:flex-none">Export</Button>
          <Button icon={Plus} onClick={() => setForm({})} className="flex-1 whitespace-nowrap sm:flex-none">Create Credit Note</Button>
        </>} />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={FileMinus} label="Notes" value={live.length} hint={`${counts.cancelled} cancelled`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <Tile icon={Undo2} label="Credited" value={compactINR(sum(credits))} hint={`${credits.length} credit note${credits.length === 1 ? '' : 's'}`} tone="red" active={filter === 'C'} onClick={() => setFilter('C')} />
        <Tile icon={FilePlus} label="Debited" value={compactINR(sum(debits))} hint={`${debits.length} debit note${debits.length === 1 ? '' : 's'}`} tone="amber" active={filter === 'D'} onClick={() => setFilter('D')} />
        <Tile icon={FileMinus} label="Net Adjustment" value={compactINR(sum(debits) - sum(credits))} hint="Debits minus credits" tone="dark" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        storageKey={nonGst ? 'nongst_credit_notes_table_size' : 'credit_notes_table_size'}
        searchPlaceholder="Search credit notes…"
        toolbar={<FilterChips value={filter} onChange={setFilter} options={FILTERS.map(([k, l]) => [k, l, counts[k]])} />}
        onVisibleRowsChange={setVisible}
        minWidth="860px"
        emptyMessage={filter === 'all' ? `No credit notes for ${fyLabel}` : 'No notes match this filter'}
        emptyHint="Raise a credit note to reduce a bill (returns, discounts) or a debit note to add to it."
        emptyAction={filter === 'all' && <Button icon={Plus} onClick={() => setForm({})}>Create Credit Note</Button>}
        rowClassName={(row) => (row.status === 'cancelled' ? 'opacity-60' : '')}
      />

      {form && (
        <DocumentForm kind="credit" nonGst={Boolean(nonGst)} clients={clients} codes={codes} invoices={invoices} notes={all} initialInvoiceId={form.invoiceId}
          onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); toast(msg); load(); }} />
      )}
    </Page>
  );
}
