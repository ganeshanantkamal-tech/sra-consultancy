// ERP "Manage Permissions" (admin only): every login with its role and module access. Create and
// edit happen in a modal holding the ERP's toggle grid; reset password, remove and the Active
// switch work straight from the table.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, dateTime } from '../lib/format.js';
import { useSession } from '../context.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, IconButton, Input, Modal, Page, PageHeader, Segmented, Select, Tag, useFeedback } from '../components/ui.jsx';
import { Avatar, DEFAULT_PERMISSIONS, grantedCount, MODULES, PASSWORD_RULES, passwordOk, roleLabel, ROLES, Toggle } from './users/shared.jsx';

const blankUser = () => ({ username: '', name: '', email: '', role: 'accountant', password: '', isActive: true, permissions: { ...DEFAULT_PERMISSIONS } });
const body = (u) => ({ name: u.name || '', email: u.email || '', role: u.role, isActive: u.isActive, permissions: u.permissions || {} });

function UserModal({ initial, isSelf, onClose, onSaved }) {
  const [user, setUser] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const isNew = !initial.id;
  const isAdminRole = user.role === 'admin';
  const set = (key, value) => setUser((u) => ({ ...u, [key]: value }));
  const setPerm = (key, value) => setUser((u) => ({ ...u, permissions: { ...u.permissions, [key]: value } }));
  const setAll = (value) => setUser((u) => ({ ...u, permissions: Object.fromEntries(MODULES.map(([key]) => [key, value])) }));
  const count = grantedCount(user);

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    if (isNew && !/^[A-Za-z0-9._@-]{3,100}$/.test(user.username.trim())) return setError('Username must be 3–100 letters, numbers, dots, dashes, underscores or @.');
    if (isNew && !passwordOk(user.password)) return setError('Password must be at least 8 characters with a letter and a number.');
    setBusy(true);
    try {
      const saved = isNew
        ? await api.post('/users', { ...body(user), username: user.username.trim(), password: user.password })
        : await api.put(`/users/${user.id}`, body(user));
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'Add User' : `Edit ${initial.username}`} icon={isNew ? UserPlus : ShieldCheck} size="lg" onClose={onClose} busy={busy}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Discard</Button>
        <Button type="submit" form="user-form" icon={isNew ? UserPlus : ShieldCheck} loading={busy}>{isNew ? 'Create User' : 'Save User'}</Button>
      </>}>
      <form id="user-form" onSubmit={submit} autoComplete="off">
        {error && <Alert onClose={() => setError('')} className="animate-shake">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" required={isNew} hint={isNew ? 'Used to log in. Letters, numbers, . _ - @' : 'Usernames cannot be changed.'}>
            <Input value={user.username} disabled={!isNew} onChange={(e) => set('username', e.target.value)} placeholder="e.g. priya" autoComplete="off" />
          </Field>
          <Field label="Full Name">
            <Input value={user.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Priya Joshi" />
          </Field>
          <Field label="Email" hint="Optional. For your records.">
            <Input type="email" value={user.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="user@example.com" />
          </Field>
          <Field label="Role" required hint={ROLES.find(([key]) => key === user.role)?.[2]}>
            <Select value={user.role} onChange={(e) => set('role', e.target.value)} disabled={isSelf}>
              {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          {isNew ? (
            <Field label="Temporary Password" required className="sm:col-span-2">
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} value={user.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 8 characters, with a letter and a number" autoComplete="new-password" className="pr-11" />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" title={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {PASSWORD_RULES.map(([label, test]) => (
                  <span key={label} className={cn('text-xs font-medium', test(user.password) ? 'text-emerald-600' : 'text-muted')}>{test(user.password) ? '✓' : '•'} {label}</span>
                ))}
              </div>
            </Field>
          ) : (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink">Active</span>
                <span className="block text-xs text-muted">{isSelf ? 'You cannot deactivate your own account.' : 'Inactive users cannot log in. Their records are kept.'}</span>
              </span>
              <Toggle checked={user.isActive} disabled={isSelf} onChange={(v) => set('isActive', v)} label="Active" />
            </label>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Module Access</h3>
              <p className="text-xs text-muted">{isAdminRole ? 'Administrators can open every module.' : `${count} of ${MODULES.length} modules switched on.`}</p>
            </div>
            {!isAdminRole && (
              <div className="flex gap-3 text-xs font-bold uppercase tracking-widest">
                <button type="button" className="text-brand hover:text-brand-dark" onClick={() => setAll(true)}>Select all</button>
                <button type="button" className="text-muted hover:text-ink" onClick={() => setAll(false)}>Clear</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(([key, label]) => {
              const on = isAdminRole || Boolean(user.permissions?.[key]);
              return (
                <label key={key} className={cn('flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5', isAdminRole ? 'cursor-default border-line bg-paper/60' : 'cursor-pointer', !isAdminRole && (on ? 'border-brand-tint bg-brand-soft' : 'border-line bg-paper/60'))}>
                  <span className={cn('text-sm font-semibold', on ? 'text-ink' : 'text-muted')}>{label}</span>
                  <Toggle checked={on} disabled={isAdminRole} onChange={(v) => setPerm(key, v)} label={label} />
                </label>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function ManagePermissions() {
  const { user: me } = useSession();
  const { toast, confirm } = useFeedback();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api.get('/users').then((list) => { setUsers(list); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => users.filter((u) => (filter === 'all' ? true : filter === 'active' ? u.isActive : !u.isActive)), [users, filter]);
  const counts = useMemo(() => ({ all: users.length, active: users.filter((u) => u.isActive).length, inactive: users.filter((u) => !u.isActive).length }), [users]);
  const isSelf = (u) => String(u.id) === String(me?.id) || u.username === me?.username;
  const replace = (saved) => setUsers((list) => list.map((u) => (u.id === saved.id ? saved : u)));

  const toggleActive = async (u, isActive) => {
    setBusyId(u.id);
    try {
      replace(await api.put(`/users/${u.id}`, { ...body(u), isActive }));
      toast(`${u.username} ${isActive ? 'can log in again' : 'was deactivated'}.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };
  const resetPassword = async (u) => {
    const password = await confirm({
      title: `Reset password for ${u.username}`,
      message: 'Give them the new password yourself. Any device where they are logged in will be signed out.',
      confirmLabel: 'Reset Password',
      input: { label: 'New password', type: 'text', required: true, hint: 'At least 8 characters, with a letter and a number.' },
    });
    if (!password) return;
    if (!passwordOk(password)) return toast('Password must be at least 8 characters with a letter and a number.', 'error');
    try {
      await api.post(`/users/${u.id}/password`, { password });
      toast(`Password reset for ${u.username}.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const remove = async (u) => {
    const ok = await confirm({
      title: `Remove ${u.username}?`,
      message: 'Users who created bills, receipts or other records are kept for the audit trail and only deactivated. Others are deleted permanently.',
      confirmLabel: 'Remove User',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      const result = await api.del(`/users/${u.id}`);
      toast(result.deleted ? `${u.username} was deleted.` : `${u.username} has records, so the account was deactivated instead.`, result.deleted ? 'success' : 'info');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo(() => [
    { key: 'username', label: 'User', sortable: true, primaryLabel: true, render: (_, u) => (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={u.username} className="hidden md:flex" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-bold text-ink">{u.username}{isSelf(u) && <Tag className="bg-brand-tint text-brand-dark">You</Tag>}</p>
          {(u.name || u.email) && <p className="truncate text-xs text-muted">{[u.name, u.email].filter(Boolean).join(' · ')}</p>}
        </div>
      </div>
    ) },
    { key: 'role', label: 'Role', sortable: true, secondaryLabel: true, render: (v) => <span className={cn('text-xs font-bold uppercase tracking-widest', v === 'admin' ? 'text-brand' : 'text-muted')}>{roleLabel(v)}</span> },
    { key: 'access', label: 'Access', sortValue: (u) => grantedCount(u), render: (_, u) => (u.role === 'admin' ? <span className="whitespace-nowrap text-sm font-semibold text-ink">All modules</span> : <span className="whitespace-nowrap text-sm tabular-nums text-ink">{grantedCount(u)} of {MODULES.length}</span>) },
    { key: 'isActive', label: 'Active', sortable: true, align: 'center', primaryAmount: true, render: (v, u) => (
      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Toggle checked={v} disabled={isSelf(u) || busyId === u.id} onChange={(next) => toggleActive(u, next)} label={isSelf(u) ? 'You cannot deactivate yourself' : v ? 'Deactivate' : 'Activate'} />
        <span className={cn('text-xs font-semibold', v ? 'text-emerald-700' : 'text-muted')}>{v ? 'Active' : 'Inactive'}</span>
      </div>
    ) },
    { key: 'lastLoginAt', label: 'Last Login', sortable: true, hideOnTablet: true, render: (v) => (v ? <span className="whitespace-nowrap text-sm">{dateTime(v)}</span> : <span className="text-muted">Never</span>) },
    { key: 'actions', label: 'Actions', align: 'right', render: (_, u) => (
      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={Pencil} label="Edit user and permissions" onClick={() => setEditing({ ...u, password: '' })} />
        <IconButton icon={KeyRound} label="Reset password" onClick={() => resetPassword(u)} />
        {!isSelf(u) && <IconButton icon={Trash2} label="Remove user" tone="danger" disabled={busyId === u.id} onClick={() => remove(u)} />}
      </div>
    ) },
  ], [busyId, me]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader icon={ShieldCheck} title="Manage Permissions" subtitle="Who can log in to /admin, and which modules each person can open."
        actions={<Button icon={UserPlus} onClick={() => setEditing(blankUser())}>Add User</Button>} />
      {error && <Alert onClose={() => setError('')}>{error}</Alert>}
      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        searchPlaceholder="Search by username, name or email…"
        storageKey="erp_users_size"
        onRowClick={(u) => setEditing({ ...u, password: '' })}
        emptyMessage={filter === 'all' ? 'No users yet' : `No ${filter} users`}
        emptyHint="Add the people who should be able to log in."
        emptyAction={<Button icon={UserPlus} onClick={() => setEditing(blankUser())}>Add User</Button>}
        rowClassName={(u) => (!u.isActive ? 'opacity-60' : '')}
        minWidth="760px"
        toolbar={<Segmented value={filter} onChange={setFilter} options={[['all', `All · ${counts.all}`], ['active', `Active · ${counts.active}`], ['inactive', `Inactive · ${counts.inactive}`]]} />}
      />
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Users size={14} /> New users start with access to Bills &amp; Quotes, Cash In, Cash Out, and Accounts.</p>
      {editing && (
        <UserModal initial={editing} isSelf={Boolean(editing.id) && isSelf(editing)} onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null);
            toast(isNew ? `User ${saved.username} created.` : `${saved.username} updated.`);
            load();
          }} />
      )}
    </Page>
  );
}
