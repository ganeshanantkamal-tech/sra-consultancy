// Accounting area of /admin, laid out like the Anantkamal ERP and served at /admin/accounting/*.
import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { CompanyProvider, FYProvider, SessionProvider, useSession } from './context.jsx';
import Layout from './components/Layout.jsx';
import { Button, FeedbackProvider, Loading, Page } from './components/ui.jsx';
import './erp.css';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const HsnSac = lazy(() => import('./pages/HsnSac.jsx'));
const HsnSacReports = lazy(() => import('./pages/HsnSacReports.jsx'));
const Sales = lazy(() => import('./pages/Sales.jsx'));
const Estimates = lazy(() => import('./pages/Estimates.jsx'));
const EstimateDetail = lazy(() => import('./pages/EstimateDetail.jsx'));
const Receipts = lazy(() => import('./pages/Receipts.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const Bank = lazy(() => import('./pages/Bank.jsx'));
const Ledgers = lazy(() => import('./pages/Ledgers.jsx'));
const LedgerStatement = lazy(() => import('./pages/LedgerStatement.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const ManagePermissions = lazy(() => import('./pages/ManagePermissions.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

export const BASE = '/admin/accounting';

function Unauthorized() {
  const navigate = useNavigate();
  return (
    <Page>
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <ShieldAlert size={44} className="mx-auto mb-3 text-brand-gold" />
        <h1 className="text-xl font-bold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted">Ask an administrator to turn on the permission under Manage Permissions.</p>
        <Button className="mt-5" onClick={() => navigate('/profile')}>Go to my profile</Button>
      </div>
    </Page>
  );
}

// Sends users without the module (or non-admins on admin pages) to the no-access page.
function Guard({ need, adminOnly, children }) {
  const { can, isAdmin } = useSession();
  if (adminOnly ? !isAdmin : need && !can(need)) return <Navigate to="/unauthorized" replace />;
  return children;
}

// The home route shows the dashboard, or the first page the user is allowed to open.
function Home() {
  const { can } = useSession();
  if (can('dashboard')) return <Dashboard />;
  const first = [['bills_quotes', '/sales'], ['estimates', '/estimates'], ['customers', '/clients'], ['cash_in', '/receipts'], ['cash_out', '/expenses'], ['bank', '/bank'], ['accounts', '/ledgers'], ['hsn_sac', '/hsn-sac'], ['settings', '/settings']].find(([key]) => can(key));
  return <Navigate to={first ? first[1] : '/profile'} replace />;
}

export default function AccountingApp({ user, onLogout, onExit, canWebsite }) {
  return (
    <div id="erp-root">
      <SessionProvider user={user} onLogout={onLogout}>
        <FeedbackProvider>
          <FYProvider>
            <CompanyProvider>
              <BrowserRouter basename={BASE}>
                <Layout onExit={onExit} canWebsite={canWebsite}>
                  <Suspense fallback={<Loading />}>
                    <Routes>
                      <Route index element={<Home />} />
                      <Route path="clients" element={<Guard need="customers"><Clients /></Guard>} />
                      <Route path="hsn-sac" element={<Guard need="hsn_sac"><HsnSac /></Guard>} />
                      <Route path="hsn-sac/reports" element={<Guard need="hsn_sac"><HsnSacReports /></Guard>} />
                      <Route path="sales" element={<Guard need="bills_quotes"><Sales key="gst" /></Guard>} />
                      <Route path="non-gst" element={<Guard need="bills_quotes"><Sales key="nongst" nonGst /></Guard>} />
                      <Route path="estimates" element={<Guard need="estimates"><Estimates /></Guard>} />
                      <Route path="estimates/:id" element={<Guard need="estimates"><EstimateDetail /></Guard>} />
                      <Route path="receipts" element={<Guard need="cash_in"><Receipts /></Guard>} />
                      <Route path="expenses" element={<Guard need="cash_out"><Expenses /></Guard>} />
                      <Route path="bank" element={<Guard need="bank"><Bank /></Guard>} />
                      <Route path="ledgers" element={<Guard need="accounts"><Ledgers /></Guard>} />
                      <Route path="ledgers/:id/statement" element={<Guard need="accounts"><LedgerStatement /></Guard>} />
                      <Route path="settings" element={<Guard need="settings"><Settings /></Guard>} />
                      <Route path="admin/permissions" element={<Guard adminOnly><ManagePermissions /></Guard>} />
                      <Route path="profile" element={<Profile />} />
                      <Route path="unauthorized" element={<Unauthorized />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </BrowserRouter>
            </CompanyProvider>
          </FYProvider>
        </FeedbackProvider>
      </SessionProvider>
    </div>
  );
}
