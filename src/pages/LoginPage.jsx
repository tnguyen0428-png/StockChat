// ============================================
// UPTIKALERTS — LOGIN / SIGNUP PAGE
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, supabase } from '../lib/supabase';

export default function LoginPage({ recoveryMode = false, onPasswordReset }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Password Reset Flow ──
  const [newPassword, setNewPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);

  // Refs for focus management when switching between login/signup tabs.
  // autoFocus only runs on mount, so switching modes wouldn't move focus.
  const usernameRef = useRef(null);
  const emailRef = useRef(null);

  // Clear stale errors when entering recovery mode
  useEffect(() => {
    if (recoveryMode) {
      setError('');
      setSuccess('');
    }
  }, [recoveryMode]);

  // Move focus to the first field when switching tabs
  useEffect(() => {
    if (recoveryMode) return;
    if (mode === 'signup') {
      usernameRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, [mode, recoveryMode]);

  // Surface email-verification outcome from ?verify=... (set by App.jsx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get('verify');
    if (!verify) return;
    if (verify === 'expired') {
      setError('Your confirmation link has expired. Sign in and we\u2019ll resend it, or sign up again.');
    } else if (verify === 'failed') {
      setError('We couldn\u2019t verify that link. Please try signing in, or request a new link.');
    } else if (verify === 'ok') {
      setSuccess('\u2713 Email confirmed! You can sign in now.');
    }
    // Clean the URL so refreshes don't re-show the banner
    const url = new URL(window.location.href);
    url.searchParams.delete('verify');
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
  }, []);

  // Auto-redirect to /app 2s after successful reset
  useEffect(() => {
    if (!resetDone) return;
    const timer = setTimeout(() => {
      onPasswordReset?.();
      navigate('/app');
    }, 2000);
    return () => clearTimeout(timer);
  }, [resetDone]);

  const handlePasswordReset = async () => {
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      // Surface the real Supabase error so users know what to fix instead
      // of staring at a generic retry prompt. Most common case in recovery
      // flow is "new password should be different from the old password".
      const msg = (error.message || '').toLowerCase();
      console.error('[Auth] updateUser failed:', error.message);
      if (msg.includes('different from the old') || msg.includes('same as')) {
        setError('Your new password must be different from your current password.');
      } else if (msg.includes('session') || msg.includes('logged in') || msg.includes('jwt')) {
        setError('Your reset link has expired. Please request a new one from the sign-in page.');
      } else if (msg.includes('weak') || msg.includes('at least') || msg.includes('character')) {
        setError(error.message); // Supabase's own "password should be at least N characters" copy is already clear
      } else {
        setError(error.message || 'Failed to update password. Please try again.');
      }
    } else {
      setResetDone(true);
    }
  };

  if (recoveryMode) {
    return (
      <div style={styles.page}>
        <div style={styles.logoWrap}>
          <div style={styles.logoRow}>
            <svg width="52" height="52" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -8, verticalAlign: 'bottom', position: 'relative', top: 8 }}>
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
            </svg>
            <span style={styles.logoUp}>p</span><span style={styles.logoTik}>tik</span>
          </div>
          <div style={styles.logoAlerts}>a l e r t s</div>
          <div style={styles.logoSub}>Private Trader Community</div>
        </div>

        <div style={styles.card}>
          {resetDone ? (
            <>
              <div style={styles.successMsg}>✓ Password updated successfully!</div>
              <div style={styles.redirectNote}>Redirecting you to the app…</div>
              <button
                style={styles.submitBtn}
                onClick={() => {
                  onPasswordReset?.();
                  navigate('/app');
                }}
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <div style={styles.resetTitle}>Set New Password</div>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>New Password</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePasswordReset()}
                  autoFocus
                  // autoComplete="new-password" tells the browser NOT to autofill
                  // the user's existing saved password here — otherwise they'll
                  // submit their old password and Supabase rejects it with
                  // "new password should be different from the old password".
                  autoComplete="new-password"
                  name="new-password"
                />
              </div>
              {error && <div style={styles.error}>{error}</div>}
              <button
                onClick={handlePasswordReset}
                disabled={loading}
                style={{ ...styles.submitBtn, ...(loading ? styles.submitDisabled : {}) }}
              >
                {loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={styles.spinner} />
                    Updating...
                  </div>
                ) : 'Update Password'}
              </button>
            </>
          )}
        </div>

        <div style={styles.footer}>
          UptikAlerts is not financial advice.
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !username.trim()) {
      setError('Please enter a username.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm your email')) {
          setError('Please confirm your email first. Check your inbox (and spam folder) for the confirmation link.');
        } else if (msg.includes('rate') || msg.includes('too many')) {
          setError('Too many attempts. Please wait a minute and try again.');
        } else if (msg.includes('invalid') || msg.includes('credentials')) {
          setError('Invalid email or password. Please try again.');
        } else {
          setError(error.message || 'Something went wrong. Please try again.');
        }
      }
      // Don't navigate here — App.jsx onAuthStateChange will set session,
      // which triggers <Navigate to="/app"> in the /login route automatically.
      // Navigating manually causes a flash because session hasn't propagated yet.
    } else {
      const { data, error } = await signUp(email.trim(), password, username.trim());
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
          setError('This email is already registered. Try signing in, or reset your password.');
        } else if (msg.includes('password')) {
          setError(error.message);
        } else if (msg.includes('rate') || msg.includes('too many')) {
          setError('Too many attempts. Please wait a minute and try again.');
        } else {
          setError(error.message || 'Could not create account. Please try again.');
        }
      } else if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        // Supabase returns a fake user with empty identities[] when the email
        // already exists and confirmations are ON. Don't pretend it worked.
        setError('This email is already registered. Try signing in, or reset your password.');
      } else {
        setSuccess('Account created! Please check your email to confirm, then log in.');
        setMode('login');
      }
    }

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={styles.page}>

      {/* Logo */}
      <div style={styles.logoWrap}>
        <div style={styles.logoRow}>
          <svg width="52" height="52" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -8, verticalAlign: 'bottom', position: 'relative', top: 8 }}>
            <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
            <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
            <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
            <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
          </svg>
          <span style={styles.logoUp}>p</span><span style={styles.logoTik}>tik</span>
        </div>
        <div style={styles.logoAlerts}>a l e r t s</div>
        <div style={styles.logoSub}>Private Trader Community</div>
      </div>

      {/* Card */}
      <div style={styles.card}>

        {/* Mode Toggle */}
        <div style={styles.toggle}>
          <button
            onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            style={{ ...styles.toggleBtn, ...(mode === 'login' ? styles.toggleActive : {}) }}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
            style={{ ...styles.toggleBtn, ...(mode === 'signup' ? styles.toggleActive : {}) }}
          >
            Create Account
          </button>
        </div>

        {/* Username field - signup only */}
        {mode === 'signup' && (
          <div style={styles.fieldWrap}>
            <label style={styles.label}>Trader Name</label>
            <input
              ref={usernameRef}
              style={styles.input}
              type="text"
              placeholder="e.g. TonyT"
              value={username}
              onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20))}
              onKeyDown={handleKeyDown}
              maxLength={20}
            />
            <div style={styles.hint}>Letters, numbers, <code>_</code> and <code>.</code> only</div>
          </div>
        )}

        {/* Email */}
        <div style={styles.fieldWrap}>
          <label style={styles.label}>Email</label>
          <input
            ref={emailRef}
            style={styles.input}
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Password */}
        <div style={styles.fieldWrap}>
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={styles.error}>{error}</div>
        )}

        {/* Success */}
        {success && (
          <div style={styles.successMsg}>{success}</div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...styles.submitBtn, ...(loading ? styles.submitDisabled : {}) }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={styles.spinner} />
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </div>
          ) : (
            mode === 'login' ? 'Sign In' : 'Create Account'
          )}
        </button>

        {/* Forgot password */}
        {mode === 'login' && (
          <div style={styles.forgotWrap}>
            <button
              onClick={async () => {
                if (loading) return;
                if (!email.trim()) { setError('Enter your email first.'); return; }
                setError('');
                setSuccess('');
                setLoading(true);
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: `${window.location.origin}/login`,
                });
                setLoading(false);
                if (error) {
                  const msg = (error.message || '').toLowerCase();
                  if (msg.includes('rate') || msg.includes('too many')) {
                    setError('Too many reset attempts. Please wait a minute and try again.');
                  } else {
                    setError(error.message || 'Could not send reset email. Please try again.');
                  }
                } else {
                  setSuccess('✓ Check your email for a reset link (and your spam folder).');
                }
              }}
              disabled={loading}
              style={{ ...styles.forgotBtn, ...(loading ? { opacity: 0.5 } : {}) }}
            >
              Forgot password?
            </button>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={styles.footer}>
        By signing in you agree to our Terms of Service.
        <br />
        UptikAlerts is not financial advice.
      </div>

    </div>
  );
}

// ── STYLES ──
const styles = {
  page: {
    minHeight: '100dvh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
  },
  logoWrap: {
    textAlign: 'center',
    marginBottom: 32,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  logoRow: {
    display: 'flex', alignItems: 'baseline',
  },
  logoUp: {
    fontSize: 36, fontWeight: 700, color: '#8cd9a0',
  },
  logoTik: {
    fontSize: 36, fontWeight: 700, color: '#f0ede8',
  },
  logoAlerts: {
    fontSize: 14, fontWeight: 400, color: '#d4e4f2', letterSpacing: 2,
    fontFamily: "'Outfit', sans-serif",
    marginTop: -4, paddingLeft: 44,
  },
  logoSub: {
    fontSize: 13,
    color: 'var(--text2)',
    marginTop: 6,
    letterSpacing: '0.5px',
  },
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '24px 20px',
    width: '100%',
    maxWidth: 400,
    boxShadow: 'var(--shadow-md)',
  },
  toggle: {
    display: 'flex',
    background: 'var(--card2)',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    padding: '8px 0',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text2)',
    background: 'transparent',
    transition: 'all 0.15s',
  },
  toggleActive: {
    background: 'var(--card)',
    color: 'var(--text1)',
    fontWeight: 600,
    boxShadow: 'var(--shadow-sm)',
  },
  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text2)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 14,
    color: 'var(--text1)',
    transition: 'border-color 0.15s',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text3)',
    marginTop: 4,
  },
  error: {
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)',
    fontSize: 12,
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
  },
  successMsg: {
    background: 'var(--green-bg)',
    border: '1px solid var(--green-border)',
    color: 'var(--green)',
    fontSize: 12,
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
  },
  submitBtn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    padding: '13px 0',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    marginTop: 4,
    transition: 'opacity 0.15s',
  },
  submitDisabled: {
    opacity: 0.7,
  },
  spinner: {
    width: 16,
    height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  forgotWrap: {
    textAlign: 'center',
    marginTop: 14,
  },
  forgotBtn: {
    background: 'none',
    color: 'var(--text2)',
    fontSize: 12,
    textDecoration: 'underline',
  },
  resetTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
    marginBottom: 18,
  },
  redirectNote: {
    fontSize: 12,
    color: 'var(--text3)',
    textAlign: 'center',
    marginBottom: 12,
  },
  footer: {
    marginTop: 24,
    fontSize: 11,
    color: 'var(--text3)',
    textAlign: 'center',
    lineHeight: 1.6,
  },
};
