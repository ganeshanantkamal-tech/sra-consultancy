import { useEffect, useState } from 'react';
import { MessageCircle, Phone, RefreshCw, Trash2 } from 'lucide-react';
import { api } from './api.js';

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visit', label: 'Site visit booked' },
  { value: 'closed', label: 'Closed' },
];

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `91${d}` : null;
};

function EnquiryCard({ enquiry, onSaved, onDeleted, onAuthError }) {
  const [notes, setNotes] = useState(enquiry.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wa = waNumber(enquiry.phone);

  async function save(patch) {
    setBusy(true);
    setError('');
    try {
      const { enquiry: next } = await api.updateEnquiry(enquiry.id, patch);
      onSaved(next);
    } catch (err) {
      if (err.status === 401) onAuthError();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the enquiry from ${enquiry.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteEnquiry(enquiry.id);
      onDeleted(enquiry.id);
    } catch (err) {
      if (err.status === 401) onAuthError();
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <article className={`adm-card adm-enquiry status-${enquiry.status}`}>
      <div className="adm-card-head">
        <div>
          <strong>{enquiry.name}</strong>
          <small>{when(enquiry.receivedAt)}</small>
        </div>
        <select aria-label="Status" value={enquiry.status} disabled={busy} onChange={(e) => save({ status: e.target.value })}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <p className="adm-enquiry-message">{enquiry.message}</p>
      <dl className="adm-enquiry-meta">
        {enquiry.place && <><dt>Site</dt><dd>{enquiry.place}</dd></>}
        {enquiry.buildingType && <><dt>Building</dt><dd>{enquiry.buildingType}</dd></>}
        {enquiry.phone && <><dt>Phone</dt><dd>{enquiry.phone}</dd></>}
      </dl>
      <div className="adm-enquiry-actions">
        {enquiry.phone && <a className="adm-button adm-button-line" href={`tel:${enquiry.phone}`}><Phone size={16} /> Call</a>}
        {wa && <a className="adm-button adm-button-line" href={`https://wa.me/${wa}`} target="_blank" rel="noopener"><MessageCircle size={16} /> WhatsApp</a>}
        <button type="button" className="adm-button adm-button-line adm-danger" onClick={remove} disabled={busy}><Trash2 size={16} /> Delete</button>
      </div>
      <div className="adm-field">
        <label htmlFor={`notes-${enquiry.id}`}>Our notes (only visible here)</label>
        <textarea id={`notes-${enquiry.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== (enquiry.notes || '') && (
          <button type="button" className="adm-button adm-button-small" onClick={() => save({ notes })} disabled={busy}>Save notes</button>
        )}
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
    </article>
  );
}

export default function Enquiries({ onAuthError, onCount }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('new');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const { enquiries } = await api.enquiries();
      setItems(enquiries);
    } catch (err) {
      if (err.status === 401) onAuthError();
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (items) onCount(items.filter((e) => e.status === 'new').length); }, [items, onCount]);

  const shown = (items || []).filter((e) => filter === 'all' || e.status === filter);

  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-tabs" role="group" aria-label="Show">
          {[{ value: 'new', label: 'New' }, ...STATUSES.slice(1), { value: 'all', label: 'All' }].map((t) => (
            <button key={t.value} type="button" aria-pressed={filter === t.value} onClick={() => setFilter(t.value)}>
              {t.label}
              {items && <span>{t.value === 'all' ? items.length : items.filter((e) => e.status === t.value).length}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="adm-button adm-button-line" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!items && !error && <p className="adm-muted">Loading enquiries…</p>}
      {items && shown.length === 0 && (
        <p className="adm-empty">
          {filter === 'new' ? 'No new enquiries. New ones from the website contact form appear here.' : 'Nothing here.'}
        </p>
      )}
      <div className="adm-enquiries">
        {shown.map((e) => (
          <EnquiryCard
            key={e.id}
            enquiry={e}
            onAuthError={onAuthError}
            onSaved={(next) => setItems((all) => all.map((x) => (x.id === next.id ? next : x)))}
            onDeleted={(id) => setItems((all) => all.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </>
  );
}
