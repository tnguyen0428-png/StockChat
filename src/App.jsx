// ============================================
// UPTIKALERTS — App.jsx
// Main app entry — handles routing only
// ============================================

import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { safeGet, safeSet, safeRemove } from './lib/safeStorage';

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
      minHeight: '100dvh',
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

    // Get initial session — this is the single source of truth on first load.
    // onAuthStateChange fires AFTER this, so we gate on initialised to avoid
    // a flash where session briefly becomes null between the two.
    let initialised = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);   // null (not undefined) = "checked, no session"
      initialised = true;
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // Ignore events that arrive before getSession resolves — they carry
        // the same data and setting state twice causes a flash.
        if (!initialised) return;

        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
        } else if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
          setRecoveryMode(false);
        }

        // TOKEN_REFRESHED with a null session means the refresh failed (e.g.
        // phone came back from background on a bad connection). Don't kick the
        // user to /login — keep the stale session so the UI stays up. The next
        // Supabase call will 401 and we handle it there.
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          console.warn('[Auth] Token refresh returned null session — keeping current session');
          return;
        }

        // Handle pending invite after sign-in — await RPC before propagating session
        // so GroupContext sees the membership immediately on first load.
        if (event === 'SIGNED_IN' && newSession) {
          const pendingCode = safeGet('uptik_pending_invite');
          if (pendingCode) {
            safeRemove('uptik_pending_invite');
            try {
              const { data, error } = await supabase.rpc('join_custom_group', { p_invite_code: pendingCode });
              if (error) console.error('[App] Pending invite join failed:', error.message);
              else if (data?.success && data.group_id) {
                safeSet('uptik_active_group', data.group_id);
                safeSet('uptik_join_redirect', 'chat');
              }
            } catch (err) { console.error('[App] Pending invite RPC crashed:', err); }
          }
        }

        setSession(newSession);
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
