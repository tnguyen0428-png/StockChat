// ============================================
// UPTIKALERTS — App.jsx
// Main app entry — handles routing only
// ============================================

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

// Pages
import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage   from './pages/LandingPage';
import JoinGroupPage from './pages/JoinGroupPage';
import { GroupProvider } from './context/GroupContext';

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
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -6, verticalAlign: 'bottom', position: 'relative', top: 7 }}>
            <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
            <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
            <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
            <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
          </svg>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#8cd9a0' }}>p</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text1)' }}>tik</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5, marginTop: -3, paddingLeft: 34, fontFamily: "'Outfit', sans-serif" }}>a l e r t s</div>
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
    // ── Handle email confirmation (PKCE flow) ──
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    if (tokenHash && type) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        .then(({ data, error }) => {
          if (error) {
            console.error('Email verification failed:', error.message);
          } else {
            console.log('Email verified successfully');
          }
          // Clean the URL
          window.history.replaceState({}, '', window.location.pathname);
        });
    }

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

        // Handle pending invite after sign-in
        if (event === 'SIGNED_IN' && session) {
          const pendingCode = localStorage.getItem('uptik_pending_invite');
          if (pendingCode) {
            localStorage.removeItem('uptik_pending_invite');
            // Join the group in the background
            supabase.rpc('join_custom_group', { p_invite_code: pendingCode })
              .then(({ data }) => {
                if (data?.success && data.group_id) {
                  localStorage.setItem('uptik_active_group', data.group_id);
                }
              });
          }
        }
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
        path="/join/:code"
        element={<JoinGroupPage session={session} />}
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute session={session}>
            <GroupProvider session={session}>
              <DashboardPage session={session} />
            </GroupProvider>
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
