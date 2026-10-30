// Shared by Manage Permissions and My Profile: module labels (same order and wording as the
// ERP's Manage Permissions screen, plus the website areas), roles and the ERP toggle switch.
import { cn } from '../../lib/format.js';

export const MODULES = [
  ['website', 'Website editor'],
  ['enquiries', 'Website enquiries'],
  ['dashboard', 'Dashboard'],
  ['customers', 'Customers'],
  ['hsn_sac', 'HSN / SAC'],
  ['bills_quotes', 'Bills & quotations'],
  ['estimates', 'AI site estimates'],
  ['cash_in', 'Cash in (receipts)'],
  ['cash_out', 'Cash out (expenses)'],
  ['bank', 'Bank'],
  ['reports', 'Reports'],
  ['reminders', 'Reminders'],
  ['accounts', 'Accounts & ledgers'],
  ['settings', 'Settings'],
];

export const ROLES = [
  ['admin', 'Administrator', 'Every module, plus user management'],
  ['accountant', 'Accountant', 'Only the modules switched on below'],
  ['viewer', 'Viewer', 'Only the modules switched on below'],
];
export const roleLabel = (role) => ROLES.find(([key]) => key === role)?.[1] || role || '—';

// New users start with the ERP's defaults: Bills & Quotes, Cash In, Cash Out and Accounts.
export const DEFAULT_PERMISSIONS = Object.fromEntries(MODULES.map(([key]) => [key, ['bills_quotes', 'cash_in', 'cash_out', 'accounts'].includes(key)]));

export const grantedCount = (user) => (user?.role === 'admin' ? MODULES.length : MODULES.filter(([key]) => user?.permissions?.[key]).length);

// Password rule enforced by the server: 8+ characters with a letter and a number.
export const PASSWORD_RULES = [
  ['At least 8 characters', (v) => v.length >= 8],
  ['Contains a letter', (v) => /[A-Za-z]/.test(v)],
  ['Contains a number', (v) => /\d/.test(v)],
];
export const passwordOk = (v) => PASSWORD_RULES.every(([, test]) => test(String(v || '')));

// Small accessible switch, as in the ERP's Manage Permissions screen.
export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-brand' : 'bg-[#DCDAD3]')}>
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Avatar({ name, className }) {
  return (
    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold to-brand-dark text-sm font-bold text-white shadow', className)}>
      {(String(name || 'U')[0] || 'U').toUpperCase()}
    </div>
  );
}
