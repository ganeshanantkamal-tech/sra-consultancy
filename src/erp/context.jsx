import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { localDate } from './lib/format.js';

// ── Session: the signed-in user and what they may open ─────────────────────
const SessionContext = createContext(null);

export function SessionProvider({ user, onLogout, children }) {
  const value = useMemo(() => ({
    user,
    isAdmin: user?.role === 'admin',
    can: (key) => user?.role === 'admin' || Boolean(user?.permissions?.[key]),
    logout: onLogout,
  }), [user, onLogout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);

// ── Financial year: the year every list, total and report is scoped to ─────
const FYContext = createContext(null);
const STORAGE_KEY = 'sra_erp_fy';

export function FYProvider({ children }) {
  const [years, setYears] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await api.get('/financial-years');
      setYears(list);
      setSelectedId((current) => {
        if (list.some((y) => String(y.id) === String(current))) return current;
        // Default to the company's default year (Settings), else the year covering today, else the newest.
        const today = localDate();
        const covering = list.find((y) => y.startDate <= today && y.endDate >= today);
        return String((list.find((y) => y.isDefault) || covering || list[0])?.id || '');
      });
    } catch {
      setYears([]);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    try { if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId); } catch { /* private mode */ }
  }, [selectedId]);

  const value = useMemo(() => {
    const fy = years.find((y) => String(y.id) === String(selectedId)) || null;
    return {
      years,
      fy,
      loaded,
      label: fy ? `FY ${fy.label}` : 'All years',
      setFyId: (id) => setSelectedId(String(id)),
      reload,
      // True when an ISO date falls inside the selected year (or no year exists yet).
      inFy: (iso) => !fy || (String(iso || '').slice(0, 10) >= fy.startDate && String(iso || '').slice(0, 10) <= fy.endDate),
      // A sensible default document date: today if it is inside the year, else the year's last day.
      defaultDate: () => {
        const today = localDate();
        if (!fy || (today >= fy.startDate && today <= fy.endDate)) return today;
        return today > fy.endDate ? fy.endDate : fy.startDate;
      },
    };
  }, [years, selectedId, loaded, reload]);
  return <FYContext.Provider value={value}>{children}</FYContext.Provider>;
}
export const useFY = () => useContext(FYContext);

// ── Company basics (state code for GST, name for headings) ─────────────────
const CompanyContext = createContext(null);
export function CompanyProvider({ children }) {
  const [company, setCompany] = useState({ companyName: '', stateCode: '', gstin: '', hasLogo: false });
  const reload = useCallback(() => api.get('/company').then(setCompany).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  const value = useMemo(() => ({ ...company, reload }), [company, reload]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
export const useCompany = () => useContext(CompanyContext);
