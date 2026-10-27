import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ContentProvider } from './content.jsx';
import './styles.css';

// /admin is the content manager. It loads as a separate bundle, so visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const isAdmin = window.location.pathname.replace(/\/+$/, '').startsWith('/admin');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <ContentProvider>
        <App />
      </ContentProvider>
    )}
  </StrictMode>,
);
