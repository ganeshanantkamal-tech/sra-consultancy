// Shared bits for Cash In, Cash Out and Bank: account filters, the FY period bar,
// the voucher index (receipt / expense lists carry only the voucher number) and a file picker.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, FileText, Paperclip, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { cn } from '../../lib/format.js';

export const MONEY_GROUPS = ['Cash-in-Hand', 'Bank Accounts'];
export const isMoneyAccount = (l) => MONEY_GROUPS.includes(l.groupName);
export const isCashAccount = (l) => l.groupName === 'Cash-in-Hand';

export const PAYMENT_MODES = [
  ['neft', 'NEFT / RTGS'],
  ['upi', 'UPI'],
  ['imps', 'IMPS'],
  ['cheque', 'Cheque'],
  ['cash', 'Cash'],
  ['card', 'Card'],
  ['other', 'Other'],
];
export const modeLabel = (key) => PAYMENT_MODES.find(([k]) => k === key)?.[1] || (key ? String(key).toUpperCase() : '—');

// Voucher number → { id, status }. Needs the Accounts permission; without it the map stays empty.
export function useVoucherIndex(enabled) {
  const [index, setIndex] = useState(() => new Map());
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await api.get('/vouchers');
      setIndex(new Map(list.map((v) => [v.voucherNo, v])));
    } catch { /* the list still works without it */ }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return [index, reload];
}

// "Period: [from] to [to]" within the selected FY, shown beside the table search.
export function PeriodFilter({ range, setRange, fy }) {
  const isFiltered = fy && (range.from !== fy.startDate || range.to !== fy.endDate);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar size={17} className="hidden text-muted sm:block" />
      <input type="date" aria-label="From date" min={fy?.startDate} max={fy?.endDate} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
        className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/25" />
      <span className="text-xs text-muted">to</span>
      <input type="date" aria-label="To date" min={fy?.startDate} max={fy?.endDate} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
        className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/25" />
      {isFiltered && (
        <button type="button" onClick={() => setRange({ from: fy.startDate, to: fy.endDate })} className="flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark">
          <X size={14} /> Clear
        </button>
      )}
    </div>
  );
}

// Keeps a from/to range that resets to the whole FY whenever the FY changes.
export function useFyRange(fy) {
  const [range, setRange] = useState({ from: fy?.startDate || '', to: fy?.endDate || '' });
  useEffect(() => { setRange({ from: fy?.startDate || '', to: fy?.endDate || '' }); }, [fy?.startDate, fy?.endDate]);
  const within = useCallback((iso) => {
    const d = String(iso || '').slice(0, 10);
    return (!range.from || d >= range.from) && (!range.to || d <= range.to);
  }, [range.from, range.to]);
  return [range, setRange, within];
}

export const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Dashed drop zone (ERP "Attach Bill / Receipt") with the chosen files listed as removable chips.
export function FilePicker({ files, onChange, accept, multiple = true, label = 'Click or drop photos / PDF of the bill', hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const add = (list) => {
    const picked = Array.from(list || []);
    if (picked.length) onChange(multiple ? [...files, ...picked] : picked.slice(0, 1));
  };
  return (
    <div>
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn('flex w-full items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-left text-sm transition-all', over ? 'border-brand-gold bg-brand-soft text-brand-dark' : 'border-line text-muted hover:border-brand-gold hover:bg-brand-soft')}>
        <Paperclip size={16} className="shrink-0" />
        <span className="flex-1">{label}</span>
      </button>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-paper px-2 py-1 text-xs text-ink">
              <FileText size={13} className="shrink-0 text-brand" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} className="shrink-0 text-muted hover:text-red-600" aria-label={`Remove ${f.name}`}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Small inline label/value block used in the detail modals.
export function Detail({ label, children, className }) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-xs font-bold uppercase tracking-tight text-muted">{label}</div>
      <div className="text-sm font-medium text-ink">{children || '—'}</div>
    </div>
  );
}
