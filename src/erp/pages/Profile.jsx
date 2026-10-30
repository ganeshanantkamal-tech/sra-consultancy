// ERP "My Profile": account details (editable name and email), module access, and a password
// change. Any signed-in user can open it.
import { useEffect, useState } from 'react';
import {
  CalendarDays, CircleCheck, CircleSlash, Clock, Eye, EyeOff, KeyRound, LayoutGrid, Lock, Mail, Save, ShieldCheck, User as UserIcon,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, dateTime, longDate } from '../lib/format.js';
import { useSession } from '../context.jsx';
import { Alert, Button, Field, Input, Loading, Page } from '../components/ui.jsx';
import { grantedCount, MODULES, PASSWORD_RULES, passwordOk, roleLabel } from './users/shared.jsx';

const card = 'mb-8 rounded-2xl border border-line bg-white p-6 shadow-sm';

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-paper p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted"><Icon size={13} /> {label}</div>
      <p className="truncate text-sm font-semibold text-ink" title={value}>{value}</p>
    </div>
  );
}

// Password input with a leading icon and an optional show/hide toggle, as in the ERP.
function PasswordField({ label, icon: Icon, value, onChange, show, toggle, placeholder, autoComplete }) {
  return (
    <Field label={label} required>
      <div className="relative">
        <Icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input type={show ? 'text' : 'password'} required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="py-3 pl-11 pr-11" />
        {toggle && (
          <button type="button" onClick={toggle} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink" title={show ? 'Hide passwords' : 'Show passwords'}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </Field>
  );
}

function ChangePassword() {
  const [fields, setFields] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const set = (key) => (value) => setFields((f) => ({ ...f, [key]: value }));
  const matches = fields.confirm && fields.newPassword === fields.confirm;

  const submit = async (e) => {
    e.preventDefault();
    setBanner(null);
    if (!passwordOk(fields.newPassword)) return setBanner(['error', 'New password must be at least 8 characters with a letter and a number.']);
    if (fields.newPassword !== fields.confirm) return setBanner(['error', 'New passwords do not match.']);
    if (fields.newPassword === fields.currentPassword) return setBanner(['error', 'New password must be different from the current one.']);
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: fields.currentPassword, newPassword: fields.newPassword });
      setFields({ currentPassword: '', newPassword: '', confirm: '' });
      setBanner(['success', 'Your password has been changed. Other devices have been signed out.']);
    } catch (err) {
      setBanner(['error', err.message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <div className="mb-1 flex items-center gap-2"><KeyRound className="text-brand" size={22} /><h2 className="text-lg font-bold text-ink">Change Password</h2></div>
      <p className="mb-5 text-sm text-muted">Enter your current password, then choose a new one. You stay signed in here; other devices are signed out.</p>
      {banner && <Alert tone={banner[0]} onClose={() => setBanner(null)} className="max-w-md">{banner[1]}</Alert>}
      <form onSubmit={submit} className="max-w-md space-y-5">
        <PasswordField label="Current Password" icon={Lock} value={fields.currentPassword} onChange={set('currentPassword')} show={show} toggle={() => setShow((v) => !v)} placeholder="Enter your current password" autoComplete="current-password" />
        <div>
          <PasswordField label="New Password" icon={KeyRound} value={fields.newPassword} onChange={set('newPassword')} show={show} placeholder="At least 8 characters" autoComplete="new-password" />
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {PASSWORD_RULES.map(([label, test]) => (
              <span key={label} className={cn('text-xs font-medium', test(fields.newPassword) ? 'text-emerald-600' : 'text-muted')}>{test(fields.newPassword) ? '✓' : '•'} {label}</span>
            ))}
          </div>
        </div>
        <div>
          <PasswordField label="Confirm New Password" icon={KeyRound} value={fields.confirm} onChange={set('confirm')} show={show} placeholder="Re-enter new password" autoComplete="new-password" />
          {fields.confirm && <p className={cn('mt-1.5 text-xs font-medium', matches ? 'text-emerald-600' : 'text-red-600')}>{matches ? '✓ Passwords match' : 'Passwords do not match yet'}</p>}
        </div>
        <Button type="submit" size="lg" icon={KeyRound} loading={busy} className="uppercase tracking-wide">{busy ? 'Changing…' : 'Change Password'}</Button>
      </form>
    </div>
  );
}

export default function Profile() {
  const { user: sessionUser } = useSession();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  // Work off the freshest server copy (role, permissions and last login may have changed).
  useEffect(() => {
    let cancelled = false;
    api.get('/auth/me')
      .then((me) => { if (!cancelled) { setUser(me); setForm({ name: me.name || '', email: me.email || '' }); } })
      .catch((err) => { if (!cancelled) { setUser(sessionUser || null); setBanner(['error', err.message]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !user) return <Loading label="Loading profile…" />;

  const isAdmin = user?.role === 'admin';
  const perms = user?.permissions || {};
  const dirty = form.name !== (user?.name || '') || form.email !== (user?.email || '');
  const save = async (e) => {
    e.preventDefault();
    setBanner(null);
    setSaving(true);
    try {
      const me = await api.put('/auth/me', form);
      setUser(me);
      setForm({ name: me.name || '', email: me.email || '' });
      setBanner(['success', 'Your details have been saved.']);
    } catch (err) {
      setBanner(['error', err.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="mb-1 text-3xl font-bold text-ink">My Profile</h1>
        <p className="text-muted">Your account details, module access, and password settings</p>
      </div>

      <div className={card}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-gold to-brand-dark text-2xl font-bold text-white shadow">
            {(user?.username?.[0] || 'A').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-xl font-bold text-ink">{user?.name || user?.username}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand"><ShieldCheck size={13} /> {user?.role}</span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider', user?.isActive === false ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600')}>
                {user?.isActive === false ? <CircleSlash size={13} /> : <CircleCheck size={13} />}
                {user?.isActive === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">Signed in as <span className="font-semibold text-ink">{user?.username}</span> to SRA Consultancy Accounting</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Detail icon={Mail} label="Username / Email" value={[user?.username, user?.email].filter(Boolean).join(' · ') || '—'} />
          <Detail icon={UserIcon} label="Role" value={roleLabel(user?.role)} />
          <Detail icon={Clock} label="Last login" value={user?.lastLoginAt ? dateTime(user.lastLoginAt) : '—'} />
          <Detail icon={CalendarDays} label="Member since" value={user?.createdAt ? longDate(user.createdAt) : '—'} />
        </div>

        <form onSubmit={save} className="mt-6 border-t border-line pt-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink">Your details</h3>
          {banner && <Alert tone={banner[0]} onClose={() => setBanner(null)}>{banner[1]}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Full Name">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Joshi" autoComplete="name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Button type="submit" icon={Save} loading={saving} disabled={!dirty} className="sm:mb-px">Save Details</Button>
          </div>
        </form>
      </div>

      <div className={card}>
        <div className="mb-1 flex items-center gap-2"><LayoutGrid className="text-brand" size={22} /><h2 className="text-lg font-bold text-ink">Module Access &amp; Usage</h2></div>
        <p className="mb-5 text-sm text-muted">
          {isAdmin ? 'As an administrator you have full access to every module.' : `You have access to ${grantedCount(user)} of ${MODULES.length} modules. Ask an administrator if you need more.`}
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(([key, label]) => {
            const allowed = isAdmin || Boolean(perms[key]);
            return (
              <div key={key} className={cn('flex items-center justify-between rounded-xl border px-4 py-3', allowed ? 'border-emerald-100 bg-emerald-50/60' : 'border-line bg-paper')}>
                <span className={cn('text-sm font-semibold', allowed ? 'text-ink' : 'text-[#A8A69F]')}>{label}</span>
                {allowed ? <CircleCheck size={18} className="shrink-0 text-emerald-500" /> : <CircleSlash size={18} className="shrink-0 text-[#CFCCC4]" />}
              </div>
            );
          })}
        </div>
      </div>

      <ChangePassword />
    </Page>
  );
}
