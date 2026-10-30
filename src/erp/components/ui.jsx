// Shared building blocks for the accounting screens. Shapes follow the Anantkamal ERP
// (page header with icon, coloured-header modals, uppercase field labels, white cards);
// colours are the website's gold / olive / ink.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/format.js';

// ── Page frame ──────────────────────────────────────────────────────────────
export function Page({ children, className }) {
  return <div className={cn('p-4 sm:p-8', className)}>{children}</div>;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, className }) {
  return (
    <div className={cn('mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center', className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
          {Icon && <Icon className="shrink-0 text-brand" size={26} />}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'bg-brand text-white border border-brand hover:bg-brand-dark hover:border-brand-dark shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-paper',
  dark: 'bg-olive text-white border border-olive hover:bg-ink',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600',
  ghost: 'text-muted border border-transparent hover:bg-paper hover:text-ink',
  success: 'bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700',
};
const SIZES = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-2.5 text-sm gap-2',
};
export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, children, className, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant], SIZES[size], className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" /> : Icon && <Icon size={size === 'sm' ? 14 : 18} />}
      {children}
    </button>
  );
}

// Small square icon button for row actions, with a tooltip label.
export function IconButton({ icon: Icon, label, tone = 'default', className, ...props }) {
  const tones = {
    default: 'text-muted hover:bg-brand-soft hover:text-brand',
    danger: 'text-muted hover:bg-red-50 hover:text-red-600',
    success: 'text-muted hover:bg-emerald-50 hover:text-emerald-700',
  };
  return (
    <button type="button" title={label} aria-label={label} className={cn('rounded-md p-1.5 transition-colors disabled:opacity-40', tones[tone], className)} {...props}>
      <Icon size={17} />
    </button>
  );
}

// ── Form fields ─────────────────────────────────────────────────────────────
export function Field({ label, required, hint, error, className, children }) {
  return (
    <div className={className}>
      {label && <label className="erp-label">{label}{required && <span className="text-red-500"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export const Input = ({ className, ...props }) => <input className={cn('erp-input', className)} {...props} />;
export const Textarea = ({ className, rows = 3, ...props }) => <textarea rows={rows} className={cn('erp-input resize-none', className)} {...props} />;
export function Select({ className, children, placeholder, ...props }) {
  return (
    <select className={cn('erp-input bg-white pr-8', className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}
export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink', className)}>
      <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[#8A6634]" {...props} />
      {label}
    </label>
  );
}
// Segmented choice (e.g. Dr / Cr, GST / Non-GST).
export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-paper p-0.5', className)}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', value === key ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Feedback ────────────────────────────────────────────────────────────────
const ALERT = {
  error: ['border-red-100 bg-red-50 text-red-700', AlertCircle],
  warning: ['border-amber-200 bg-amber-50 text-amber-800', AlertTriangle],
  success: ['border-emerald-100 bg-emerald-50 text-emerald-700', CheckCircle2],
  info: ['border-brand-tint bg-brand-soft text-brand-dark', Info],
};
export function Alert({ tone = 'error', children, className, onClose }) {
  if (!children) return null;
  const [style, Icon] = ALERT[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm shadow-sm', style, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss"><X size={16} /></button>}
    </div>
  );
}

const STATUS = {
  draft: 'bg-slate-100 text-slate-600',
  approved: 'bg-sky-50 text-sky-700',
  converted: 'bg-emerald-50 text-emerald-700',
  active: 'bg-emerald-50 text-emerald-700',
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  unpaid: 'bg-orange-50 text-orange-700',
  overdue: 'bg-red-50 text-red-700',
  cancelled: 'bg-red-50 text-red-600',
  analysed: 'bg-brand-soft text-brand-dark',
  quoted: 'bg-emerald-50 text-emerald-700',
  discarded: 'bg-slate-100 text-slate-500',
  matched: 'bg-emerald-50 text-emerald-700',
  unmatched: 'bg-amber-50 text-amber-700',
  ignored: 'bg-slate-100 text-slate-500',
  posted: 'bg-emerald-50 text-emerald-700',
  void: 'bg-red-50 text-red-600',
  open: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-500',
};
export function StatusBadge({ status, label, className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide', STATUS[status] || 'bg-slate-100 text-slate-600', className)}>
      {label || status}
    </span>
  );
}
export function Tag({ children, className }) {
  return <span className={cn('inline-flex items-center rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted', className)}>{children}</span>;
}

export const Spinner = ({ className }) => <div className={cn('h-10 w-10 animate-spin rounded-full border-4 border-brand-tint border-t-brand', className)} />;
export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[300px] items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <Spinner />
        <p className="font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <Icon size={48} strokeWidth={1.25} className="mb-3 text-brand-gold/60" />}
      <p className="text-base font-bold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────
export function Card({ title, icon: Icon, actions, children, className, bodyClassName }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-white shadow-card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">{Icon && <Icon size={17} className="text-brand" />}{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}
export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', onClick }) {
  const tones = { brand: 'bg-brand-soft text-brand', green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-600', dark: 'bg-olive text-brand-gold', amber: 'bg-amber-50 text-amber-600' };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={cn('flex w-full items-start gap-3 rounded-2xl border border-line bg-white p-5 text-left shadow-card transition-all', onClick && 'hover:-translate-y-0.5 hover:shadow-md')}>
      {Icon && <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}><Icon size={22} /></span>}
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-widest text-muted">{label}</span>
        <span className="mt-1 block truncate text-xl font-extrabold tracking-tight text-ink">{value}</span>
        {hint && <span className="mt-0.5 block truncate text-xs text-muted">{hint}</span>}
      </span>
    </Tag>
  );
}
// Label / value rows for detail panels and totals.
export function Summary({ rows, className }) {
  return (
    <dl className={cn('space-y-1.5 text-sm', className)}>
      {rows.filter(Boolean).map(([label, value, strong]) => (
        <div key={label} className={cn('flex items-center justify-between gap-4', strong && 'border-t border-line pt-2 text-base font-extrabold text-ink')}>
          <dt className={strong ? '' : 'text-muted'}>{label}</dt>
          <dd className="text-right font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Tabs (ERP Sales style: underline) ───────────────────────────────────────
export function Tabs({ value, onChange, tabs, className }) {
  return (
    <div className={cn('scrollbar-none overflow-x-auto whitespace-nowrap border-b border-line bg-white px-4 sm:px-8', className)}>
      <div className="flex" role="tablist">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={value === id}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors sm:px-6 sm:text-sm',
              value === id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon size={18} />}
            {label}
            {count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', value === id ? 'bg-brand-tint text-brand-dark' : 'bg-paper text-muted')}>{count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Modal (ERP: coloured header bar, scrollable body, sticky footer) ─────────
const MODAL_SIZES = { sm: 'md:max-w-md', md: 'md:max-w-2xl', lg: 'md:max-w-4xl', xl: 'md:max-w-6xl', full: 'md:max-w-[96vw]' };
export function Modal({ open = true, title, icon: Icon, onClose, size = 'md', children, footer, busy }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input:not([type=hidden]):not([disabled]), select, textarea')?.focus();
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, onClose, busy]);
  if (!open) return null;
  // Rendered at the root of #erp-root: the website's global `main { z-index: 1 }` would
  // otherwise trap the modal under the sidebar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm md:items-center md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cn('flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-2xl md:max-h-[calc(100vh-2rem)]', MODAL_SIZES[size])}>
        <div className="flex shrink-0 items-center justify-between bg-olive px-5 py-4 text-white shadow-lg">
          <h2 className="flex items-center gap-2 text-lg font-bold">{Icon && <Icon size={20} className="text-brand-gold" />}{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="p-1 transition-transform duration-200 hover:rotate-90" aria-label="Close"><X size={22} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        {footer && <div className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-line bg-paper/60 px-4 py-3 sm:flex-row sm:gap-3 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.getElementById('erp-root') || document.body,
  );
}

// ── Toasts and confirmations (replace window.alert / window.confirm) ─────────
const FeedbackContext = createContext(null);
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  // confirm({ title, message, confirmLabel, tone, input }) → Promise<boolean | string | null>
  const confirm = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  const close = (result) => { dialog?.resolve(result); setDialog(null); };
  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const [style, Icon] = ALERT[t.tone] || ALERT.info;
          return (
            <div key={t.id} className={cn('animate-toast pointer-events-auto flex items-start gap-2 rounded-xl border bg-white p-3 text-sm shadow-lg', style)}>
              <Icon size={18} className="mt-0.5 shrink-0" /><span className="flex-1">{t.message}</span>
            </div>
          );
        })}
      </div>
      {dialog && <ConfirmDialog {...dialog} onDone={close} />}
    </FeedbackContext.Provider>
  );
}
function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', tone = 'primary', input, onDone }) {
  const [value, setValue] = useState(input?.defaultValue || '');
  return (
    <Modal title={title} icon={tone === 'danger' ? AlertTriangle : Info} size="sm" onClose={() => onDone(input ? null : false)}
      footer={<>
        <Button variant="secondary" onClick={() => onDone(input ? null : false)}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} className={tone === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : ''} disabled={input?.required && !value} onClick={() => onDone(input ? value : true)}>{confirmLabel}</Button>
      </>}>
      {message && <div className="text-sm leading-relaxed text-ink">{message}</div>}
      {input && (
        <Field label={input.label} className="mt-4" hint={input.hint}>
          <Input type={input.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={input.placeholder} onKeyDown={(e) => { if (e.key === 'Enter' && (!input.required || value)) onDone(value); }} />
        </Field>
      )}
    </Modal>
  );
}
export const useFeedback = () => useContext(FeedbackContext);
