// "Bills & Quotes" and "Non-GST Bills": the ERP Sales screen with underline tabs for
// Quotations, Sales Invoices and Credit Notes. `nonGst` scopes every tab to Non-GST documents.
// Navigation state { tab, create } (from the dashboard) opens a tab and its create form.
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileMinus, FileSpreadsheet, FileText } from 'lucide-react';
import { Tabs } from '../components/ui.jsx';
import Quotations from './sales/Quotations.jsx';
import Invoices from './sales/Invoices.jsx';
import CreditNotes from './sales/CreditNotes.jsx';

const TABS = [
  { id: 'quotations', label: 'Quotations', icon: FileSpreadsheet },
  { id: 'invoices', label: 'Sales Invoices', icon: FileText },
  { id: 'creditNotes', label: 'Credit Notes', icon: FileMinus },
];
const validTab = (t) => (TABS.some((x) => x.id === t) ? t : null);

export default function Sales({ nonGst = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => validTab(location.state?.tab) || 'quotations');
  // A one-shot request for the active tab to open its create form ({ invoiceId } for notes).
  const [signal, setSignal] = useState(null);

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    const next = validTab(state.tab);
    if (next) setTab(next);
    if (state.create) setSignal({ at: Date.now() });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const consumed = useCallback(() => setSignal(null), []);
  const changeTab = (id) => { setSignal(null); setTab(id); };
  const createNote = useCallback((invoice) => { setTab('creditNotes'); setSignal({ at: Date.now(), invoiceId: invoice.id }); }, []);

  const shared = { nonGst, createSignal: signal, onConsumed: consumed };
  return (
    <div>
      <Tabs value={tab} onChange={changeTab} tabs={TABS} />
      {tab === 'quotations' && <Quotations {...shared} />}
      {tab === 'invoices' && <Invoices {...shared} onCreateNote={createNote} />}
      {tab === 'creditNotes' && <CreditNotes {...shared} />}
    </div>
  );
}
