import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, LogOut, RotateCcw, Save } from 'lucide-react';
import { api } from './api.js';
import { withDefaults } from '../cms/model.js';
import Enquiries from './Enquiries.jsx';
import {
  ContactSection, ExpertiseSection, FooterSection, HeroSection, ListsSection, MaterialsSection,
  ProcessSection, ProjectsSection, ServicesSection, StagesSection, StorySection,
} from './sections.jsx';
import './admin.css';

// Menu of the admin panel. `key` is the part of the content each page edits.
const PAGES = [
  { id: 'enquiries', label: 'Enquiries' },
  { id: 'projects', label: 'Projects', key: 'projects', Editor: ProjectsSection },
  { id: 'contact', label: 'Phone and offices', Editor: ContactSection },
  { id: 'hero', label: 'Top of page', key: 'hero', Editor: HeroSection },
  { id: 'expertise', label: 'Our expertise', key: 'expertise', Editor: ExpertiseSection },
  { id: 'services', label: 'Services', key: 'services', Editor: ServicesSection },
  { id: 'story', label: 'Before and after', key: 'story', Editor: StorySection },
  { id: 'process', label: 'How we work', key: 'process', Editor: ProcessSection },
  { id: 'stages', label: 'Construction stages', key: 'stages', Editor: StagesSection },
  { id: 'lists', label: 'Buildings and problems', Editor: ListsSection },
  { id: 'materials', label: 'Materials and brands', key: 'materials', Editor: MaterialsSection },
  { id: 'footer', label: 'Closing banner', key: 'footer', Editor: FooterSection },
  { id: 'history', label: 'Saved versions' },
];

function Login({ onLoggedIn, notice }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adm-login">
      <form onSubmit={submit} className="adm-login-card">
        <p className="adm-brand">SRA<span /></p>
        <h1>Website manager</h1>
        {notice && <p className="adm-notice">{notice}</p>}
        <div className="adm-field">
          <label htmlFor="adm-password">Password</label>
          <input id="adm-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <p className="adm-error" role="alert">{error}</p>}
        <button className="adm-button" type="submit" disabled={busy || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </main>
  );
}

function History({ onRestored, onAuthError }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.history().then(({ versions: v }) => setVersions(v)).catch((err) => {
      if (err.status === 401) onAuthError();
      setError(err.message);
    });
  }, [onAuthError]);

  async function restore(v) {
    if (!window.confirm(`Put back the version saved on ${new Date(v.savedAt).toLocaleString('en-IN')}? The website will show it within a minute.`)) return;
    try {
      const { content } = await api.restore(v.id);
      onRestored(content);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <p className="adm-muted">Every save is kept here (the last 30). If something goes wrong, put back an earlier version.</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {versions && versions.length === 0 && <p className="adm-empty">No saved versions yet. They appear after the first save.</p>}
      <ul className="adm-history">
        {(versions || []).map((v, i) => (
          <li key={v.id}>
            <span>{new Date(v.savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{i === 0 && <em> (current)</em>}</span>
            {i > 0 && <button type="button" className="adm-button adm-button-line adm-button-small" onClick={() => restore(v)}><RotateCcw size={14} /> Put back</button>}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState('');
  const [content, setContent] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [page, setPage] = useState('enquiries');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newCount, setNewCount] = useState(0);

  const dirty = content !== null && JSON.stringify(content) !== savedJson;

  useEffect(() => { document.title = 'Website manager · SRA Consultancy'; }, []);
  useEffect(() => { api.session().then(setSession).catch(() => setSession({ loggedIn: false })); }, []);

  // Content is kept here, so logging in again after a timeout does not lose unsaved edits
  useEffect(() => {
    if (!session?.loggedIn || content) return;
    api.getContent()
      .then(({ content: saved }) => {
        // before the first save, the defaults are exactly what the website shows
        const filled = withDefaults(saved);
        setContent(filled);
        setSavedJson(JSON.stringify(filled));
      })
      .catch((err) => setMessage(err.message));
  }, [session, content]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onAuthError = useCallback(() => {
    setNotice('You were logged out. Log in again; unsaved changes are kept.');
    setSession((s) => ({ ...s, loggedIn: false }));
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await api.saveContent(content);
      setSavedJson(JSON.stringify(content));
      setMessage('Saved. The website shows the changes within about a minute.');
    } catch (err) {
      if (err.status === 401) onAuthError();
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    if (dirty && !window.confirm('You have unsaved changes. Log out anyway?')) return;
    await api.logout().catch(() => {});
    setContent(null);
    setSession((s) => ({ ...s, loggedIn: false }));
  }

  if (!session) return null;
  if (session.passwordConfigured === false) {
    return <Login onLoggedIn={() => {}} notice="The admin password has not been set up yet. Ask your developer to add ADMIN_PASSWORD in Vercel." />;
  }
  if (!session.loggedIn) {
    return <Login notice={notice} onLoggedIn={() => { setNotice(''); setSession((s) => ({ ...s, loggedIn: true })); }} />;
  }

  const current = PAGES.find((p) => p.id === page);
  const editsContent = Boolean(current.Editor);
  const slice = !content ? null : current.id === 'contact'
    ? { phone: content.phone, offices: content.offices }
    : current.id === 'lists'
      ? { buildings: content.buildings, problems: content.problems }
      : content[current.key];
  const setSlice = (value) => setContent((c) => (current.key ? { ...c, [current.key]: value } : { ...c, ...value }));

  return (
    <div className="adm">
      <header className="adm-top">
        <p className="adm-brand">SRA<span /> <small>Website manager</small></p>
        <div className="adm-top-actions">
          <a className="adm-button adm-button-line" href="/" target="_blank" rel="noopener"><ExternalLink size={16} /> <span>View website</span></a>
          <button type="button" className="adm-button adm-button-line" onClick={logout}><LogOut size={16} /> <span>Log out</span></button>
        </div>
      </header>

      <div className="adm-body">
        <nav className="adm-nav" aria-label="Sections">
          <select aria-label="Section" value={page} onChange={(e) => setPage(e.target.value)} className="adm-nav-select">
            {PAGES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <ul>
            {PAGES.map((p) => (
              <li key={p.id}>
                <button type="button" aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
                  {p.label}
                  {p.id === 'enquiries' && newCount > 0 && <span className="adm-badge">{newCount}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="adm-main">
          <h1>{current.label}</h1>
          {current.id === 'enquiries' && <Enquiries onAuthError={onAuthError} onCount={setNewCount} />}
          {current.id === 'history' && (
            <History
              onAuthError={onAuthError}
              onRestored={(restored) => {
                const filled = withDefaults(restored);
                setContent(filled);
                setSavedJson(JSON.stringify(filled));
                setMessage('Version put back. The website shows it within about a minute.');
              }}
            />
          )}
          {editsContent && !content && <p className="adm-muted">Loading…</p>}
          {editsContent && content && <current.Editor value={slice} onChange={setSlice} />}
        </main>
      </div>

      {(editsContent || dirty || message) && (
        <div className={`adm-savebar${dirty ? ' is-dirty' : ''}`} role="status">
          <span>{dirty ? 'You have unsaved changes.' : message || 'All changes saved.'}</span>
          <button type="button" className="adm-button" onClick={save} disabled={!dirty || saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
