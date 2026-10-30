// App shell, matching the ERP's Layout: a floating white sidebar with grouped sections,
// collapse-to-icons rail, mobile drawer, and a top bar with breadcrumb, financial-year
// picker, date, shortcuts and the user badge.
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen, ChevronLeft, CreditCard, FileText, FileX, Globe, Landmark, LayoutDashboard, LogOut, Menu, Receipt,
  Settings as SettingsIcon, ShieldCheck, Sparkles, Tag, Users, X,
} from 'lucide-react';
import { useFY, useSession } from '../context.jsx';
import { cn } from '../lib/format.js';

export const NAV = [
  { title: 'Main', items: [
    { icon: LayoutDashboard, label: 'Home', hint: 'Dashboard', to: '/', key: 'dashboard', end: true },
  ] },
  { title: 'Day-to-day', items: [
    { icon: Users, label: 'Customers', hint: 'Clients', to: '/clients', key: 'customers' },
    { icon: Tag, label: 'HSN / SAC', hint: 'Codes & GST', to: '/hsn-sac', key: 'hsn_sac' },
    { icon: FileText, label: 'Bills & Quotes', hint: 'Sales', to: '/sales', key: 'bills_quotes' },
    { icon: FileX, label: 'Non-GST Bills', hint: 'Without GST', to: '/non-gst', key: 'bills_quotes' },
    { icon: Sparkles, label: 'AI Site Estimates', hint: 'Photos → quotation', to: '/estimates', key: 'estimates' },
    { icon: Receipt, label: 'Cash In', hint: 'Receipts', to: '/receipts', key: 'cash_in' },
    { icon: CreditCard, label: 'Cash Out', hint: 'Expenses', to: '/expenses', key: 'cash_out' },
    { icon: Landmark, label: 'Bank', hint: 'Reconciliation', to: '/bank', key: 'bank' },
  ] },
  { title: 'Books', items: [
    { icon: BookOpen, label: 'Ledgers', hint: 'Accounts & statements', to: '/ledgers', key: 'accounts' },
  ] },
  { title: 'Advanced', items: [
    { icon: SettingsIcon, label: 'Settings', hint: 'Company setup', to: '/settings', key: 'settings' },
    { icon: ShieldCheck, label: 'Manage Permissions', hint: 'User access', to: '/admin/permissions', adminOnly: true },
  ] },
];

// Page names for the breadcrumb, including pages that are not in the menu.
const EXTRA_LABELS = [
  [/^\/ledgers\/[^/]+/, 'Account Statement'],
  [/^\/clients\/[^/]+/, 'Customer'],
  [/^\/estimates\/[^/]+/, 'Site Estimate'],
  [/^\/hsn-sac\/reports/, 'HSN / SAC Summary'],
  [/^\/profile/, 'My Profile'],
  [/^\/unauthorized/, 'No Access'],
];

function SidebarItem({ icon: Icon, label, hint, to, end, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      className={({ isActive }) => cn(
        'group flex items-center rounded-xl transition-all duration-150',
        collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3.5 py-2.5',
        isActive ? 'bg-brand text-white shadow-sm' : 'text-[#4A4944] hover:bg-paper hover:text-ink',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className="shrink-0" strokeWidth={isActive ? 2.4 : 2} />
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold tracking-tight">{label}</span>
              {hint && <span className={cn('truncate text-[10px] font-medium', isActive ? 'text-[#F1E3CC]' : 'text-[#A8A69F]')}>{hint}</span>}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Brand({ collapsed }) {
  return (
    <div className={cn('flex items-end gap-2', collapsed ? 'justify-center' : 'px-1')}>
      <span className="font-display text-[2.4rem] leading-none text-ink">SRA</span>
      <span className="mb-1.5 -ml-1.5 h-1.5 w-1.5 bg-brand-gold" />
      {!collapsed && <span className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Accounting</span>}
    </div>
  );
}

export default function Layout({ children, onExit, canWebsite }) {
  const { user, can, isAdmin, logout } = useSession();
  const { years, fy, setFyId } = useFY();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sra_erp_nav') === 'collapsed'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('sra_erp_nav', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const sections = NAV
    .map((s) => ({ ...s, items: s.items.filter((i) => (i.adminOnly ? isAdmin : can(i.key))) }))
    .filter((s) => s.items.length);
  const current = sections.flatMap((s) => s.items).find((i) => (i.end ? location.pathname === i.to : location.pathname === i.to));
  const pageLabel = current?.label || EXTRA_LABELS.find(([re]) => re.test(location.pathname))?.[1] || 'Overview';
  useEffect(() => { document.title = `${pageLabel} · Accounting · SRA Consultancy`; }, [pageLabel]);
  const initial = (user?.username?.[0] || 'A').toUpperCase();

  return (
    <div className="erp-shell flex h-screen overflow-hidden bg-paper font-sans text-ink">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl transition-all duration-300',
        'lg:relative lg:my-3 lg:ml-3 lg:rounded-2xl lg:border lg:border-line lg:shadow-sm',
        collapsed ? 'lg:w-[88px]' : 'lg:w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="relative px-4 pb-4 pt-6">
          <button type="button" className="absolute right-4 top-4 text-muted hover:text-ink lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={22} /></button>
          <Link to="/" className="block"><Brand collapsed={collapsed} /></Link>
        </div>

        <div className={cn('hidden px-4 pb-2 lg:block', collapsed && 'px-0')}>
          <button type="button" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={cn('flex items-center gap-2 rounded-lg border border-line bg-paper text-[11px] font-bold uppercase tracking-widest text-muted transition-colors hover:bg-[#EEEDE9]', collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full px-3 py-2')}>
            <ChevronLeft size={16} className={cn('shrink-0 transition-transform', collapsed && 'rotate-180')} />
            {!collapsed && <span>Collapse menu</span>}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Accounting">
          {sections.map((section, idx) => (
            <div key={section.title} className={cn(idx > 0 && 'pt-3')}>
              {!collapsed && <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#A8A69F]">{section.title}</p>}
              {collapsed && idx > 0 && <div className="mx-3 my-2 border-t border-line" />}
              <div className="space-y-1">
                {section.items.map((item) => <SidebarItem key={item.to} {...item} collapsed={collapsed} />)}
              </div>
            </div>
          ))}
          {canWebsite && (
            <div className="pt-3">
              {!collapsed && <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#A8A69F]">Website</p>}
              {collapsed && <div className="mx-3 my-2 border-t border-line" />}
              <button type="button" onClick={onExit} title="Website editor and enquiries"
                className={cn('flex w-full items-center rounded-xl text-[#4A4944] transition-all hover:bg-paper hover:text-ink', collapsed ? 'justify-center py-3' : 'gap-3 px-3.5 py-2.5')}>
                <Globe size={20} className="shrink-0" />
                {!collapsed && <span className="flex min-w-0 flex-col text-left leading-tight"><span className="truncate text-sm font-semibold">Website manager</span><span className="truncate text-[10px] font-medium text-[#A8A69F]">Pages & enquiries</span></span>}
              </button>
            </div>
          )}
        </nav>

        <div className="p-3">
          <div className={cn('rounded-2xl border border-line bg-paper', collapsed ? 'p-2' : 'p-3')}>
            <Link to="/profile" className={cn('flex items-center gap-3', collapsed && 'justify-center')} title="My profile">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold to-brand-dark text-sm font-bold text-white shadow">{initial}</div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{user?.username}</p>
                  <p className="truncate text-[11px] font-medium capitalize text-muted">{user?.role}</p>
                </div>
              )}
            </Link>
            <button type="button" onClick={logout} title="Log out"
              className={cn('mt-3 flex items-center justify-center gap-2 rounded-lg border border-line bg-white font-semibold text-[#4A4944] shadow-sm transition-colors hover:bg-ink hover:text-white', collapsed ? 'h-9 w-full' : 'w-full px-3 py-2 text-xs uppercase tracking-widest')}>
              <LogOut size={16} />{!collapsed && <span>Log out</span>}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="erp-topbar flex h-16 shrink-0 items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="rounded-lg p-2 text-[#4A4944] hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
            <nav className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#A8A69F]" aria-label="Breadcrumb">
              <Link to="/" className="hidden hover:text-brand sm:inline">Accounting</Link>
              <span className="hidden text-line sm:inline">/</span>
              <span className="truncate text-ink">{pageLabel}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {years.length > 0 && (
              <select value={fy?.id || ''} onChange={(e) => setFyId(e.target.value)} title="Financial year shown on every page"
                className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted outline-none transition-colors hover:text-ink focus:border-brand-gold">
                {years.map((y) => <option key={y.id} value={y.id}>FY {y.label}{y.status === 'closed' ? ' (closed)' : ''}</option>)}
              </select>
            )}
            <span className="hidden font-mono text-xs text-[#A8A69F] md:inline">{new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
            {can('settings') && (
              <Link to="/settings" title="Settings" className="hidden rounded-lg border border-line bg-white p-2 text-muted shadow-sm transition-colors hover:text-ink sm:block"><SettingsIcon size={18} /></Link>
            )}
            <Link to="/profile" title="View profile" className="flex items-center gap-2.5 rounded-xl pl-1 transition-opacity hover:opacity-80 sm:pl-2">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-bold text-ink">Welcome, {user?.username}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A69F]">{user?.role}</p>
              </div>
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-gold to-brand-dark text-sm font-bold text-white shadow">{initial}</div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              </div>
            </Link>
          </div>
        </header>
        <div className="erp-scroll flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}

