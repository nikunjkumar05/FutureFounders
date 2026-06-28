import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import posthog from 'posthog-js';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Jobs = lazy(() => import('./pages/Jobs'));
const SupportTickets = lazy(() => import('./pages/SupportTickets'));
const Login = lazy(() => import('./pages/Login'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function PageviewTracker() {
  const location = useLocation();
  useEffect(() => {
    try {
      posthog.capture('$pageview', { $current_url: window.location.href });
    } catch { /* PostHog not initialized */ }
  }, [location]);
  return null;
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-navy-500 border-t-transparent rounded-full" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PageviewTracker />
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/attendance" element={<Attendance />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/tickets" element={<SupportTickets />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
