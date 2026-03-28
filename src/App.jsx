// ============================================
// UPTIKALERTS — App.jsx
// Main app entry — handles routing only
// ============================================

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

// Pages
import LoginPage    from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage   from './pages/LandingPage';

// Loading screen
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        <span style={{ color: 'var(--green)' }}>UpTik</span>
        <span style={{ color: 'var(--text1)' }}>Alerts</span>
      </div>
      <div style={{
        width: 24, height: 24,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--green)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ session, children }) {
  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [session, setSession]           = useState(undefined);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
        } else if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
          setRecoveryMode(false);
        }
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <Navigate to="/app" replace /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={
          recoveryMode
            ? <LoginPage recoveryMode onPasswordReset={() => setRecoveryMode(false)} />
            : session
              ? <Navigate to="/app" replace />
              : <LoginPage />
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute session={session}>
            <DashboardPage session={session} />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={<Navigate to={session ? '/app' : '/login'} replace />}
      />
    </Routes>
  );
}
