// ============================================
// UPTIKALERTS — LOGIN / SIGNUP PAGE
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signUp, supabase } from '../lib/supabase';

export default function LoginPage({ recoveryMode = false, onPasswordReset }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  // Resend-verification link state for the "email not confirmed" login error.
  // 'hidden' = no link shown. 'idle' = link visible. 'sent' = success label shown.
  const [resendState, setResendState] = useState('hidden');
  const [resendLoading, setResendLoading] = useState(false);

  // Show/hide password toggles (independent for login and recovery forms)
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Refs for focus management when switching between login/signup tabs.
  // autoFocus only runs on mount, so switching modes wouldn't move focus.
  // Password refs also act as a fallback read path on submit: iOS autofill
  // occasionally writes values to the DOM without firing React's onChange,
  // so controlled-input state can lag.
  const usernameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const newPasswordRef = useRef(null);

  // iOS Safari + standalone PWA sometimes leaves a focused input hidden
  // behind the keyboard. Defer past the keyboard-open animation, then
  // center the input in the visible viewport.
  const scrollFocusedIntoView = (e) => {
    const el = e.currentTarget;
    setTimeout(() => {
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 280);
  };

  // Clear the inline auth error (and hide the resend link) whenever the user
  // edits a field — the stale message no longer describes what they're typing.
  const clearError = () => {
    setError('');
    setResendState('hidden');
  };

  // Pre-fill mode and email from landing page redirect params
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const emailParam = searchParams.get('email');
    if (modeParam === 'signup') setMode('signup');
    if (emailParam) setEmail(emailParam);
  }, []);

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

  const handlePasswordReset = async (e) => {
    e?.preventDefault?.();
    // Ref fallback: iOS autofill / password managers can populate the DOM
    // without firing React's onChange, so controlled state may lag.
    const pw = newPassword || newPasswordRef.current?.value || '';
    if (pw !== newPassword) setNewPassword(pw);
    if (pw.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
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
            <form onSubmit={handlePasswordReset} noValidate>
              <div style={styles.resetTitle}>Set New Password</div>
              <div style={styles.fieldWrap}>
                <label style={styles.label} htmlFor="lp-new-password">New Password</label>
                <div style={styles.passwordWrap}>
                  <input
                    id="lp-new-password"
                    ref={newPasswordRef}
                    style={{ ...styles.input, paddingRight: 64 }}
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    onFocus={scrollFocusedIntoView}
                    disabled={loading}
                    autoFocus
                    // autoComplete="new-password" tells the browser NOT to autofill
                    // the user's existing saved password here — otherwise they'd
                    // submit their old password and Supabase rejects it with
                    // "new password should be different from the old password".
                    // It also lets iOS/password managers offer to save the update.
                    autoComplete="new-password"
                    name="new-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    style={styles.passwordToggle}
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {error && <div style={styles.error}>{error}</div>}
              <button
                type="submit"
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
            </form>
          )}
        </div>

        <div style={styles.footer}>
          UptikAlerts is not financial advice.
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setSuccess('');

    // Ref fallback: iOS autofill / password managers can populate the DOM
    // without firing React's onChange. Prefer state, fall back to live DOM.
    const emailVal    = (email    || emailRef.current?.value    || '').trim();
    const passwordVal =  password || passwordRef.current?.value || '';
    const usernameVal = (username || usernameRef.current?.value || '').trim();
    if (emailVal    !== email)    setEmail(emailVal);
    if (passwordVal !== password) setPassword(passwordVal);
    if (usernameVal !== username) setUsername(usernameVal);

    // Basic validation
    if (!emailVal || !passwordVal) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !usernameVal) {
      setError('Please enter a username.');
      return;
    }
    if (passwordVal.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(emailVal, passwordVal);
      if (error) {
        const msg    = (error.message || '').toLowerCase();
        const code   = error.code || '';
        const status = error.status;
        if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
          // Supabase intentionally doesn't distinguish wrong-password from
          // nonexistent-email (to prevent username enumeration), so we don't
          // either — "Email or password" covers both honestly.
          setError('Email or password is incorrect. Please try again.');
        } else if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
          setError('Your account hasn’t been verified yet. Check your inbox for the confirmation email.');
          setResendState('idle');
        } else if (status === 429 || msg.includes('rate limit')) {
          setError('Too many attempts. Please wait a minute and try again.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      }
      // Don't navigate here — App.jsx onAuthStateChange will set session,
      // which triggers <Navigate to="/app"> in the /login route automatically.
      // Navigating manually causes a flash because session hasn't propagated yet.
    } else {
      // Pre-check: username availability (case-insensitive). ILIKE so "Neal"
      // and "neal" don't become two accounts. The allowed charset includes
      // `_`, which is an ILIKE wildcard — escape it (and `%` defensively) so
      // "foo_bar" doesn't also match "fooXbar".
      if (usernameVal) {
        const pattern = usernameVal.replace(/[_%]/g, (c) => '\\' + c);
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .ilike('username', pattern)
          .maybeSingle();
        if (existingUser) {
          setError('This username is already taken.');
          setLoading(false);
          return;
        }
      }

      const { data, error } = await signUp(emailVal, passwordVal, usernameVal);
      // Supabase returns a fake user with empty identities[] when the email
      // already exists and confirmations are ON. Check this before `error`
      // because the API reports no error in that case.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('This email is already in use. Try signing in instead.');
      } else if (error) {
        const msg  = (error.message || '').toLowerCase();
        const code = error.code || '';
        if (code === 'user_already_exists' || msg.includes('user already registered')) {
          setError('This email is already in use. Try signing in instead.');
        } else if (msg.includes('password should be at least')) {
          setError('Password must be at least 6 characters.');
        } else if (code === 'validation_failed' || msg.includes('valid email')) {
          setError('Please enter a valid email address.');
        } else {
          setError('Could not create account. Please try again.');
        }
      } else {
        setSuccess('Account created! Please check your email to confirm, then log in.');
        setMode('login');
      }
    }

    setLoading(false);
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
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccess(''); setResendState('hidden'); }}
            style={{ ...styles.toggleBtn, ...(mode === 'login' ? styles.toggleActive : {}) }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setSuccess(''); setResendState('hidden'); }}
            style={{ ...styles.toggleBtn, ...(mode === 'signup' ? styles.toggleActive : {}) }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* Username field - signup only */}
          {mode === 'signup' && (
            <div style={styles.fieldWrap}>
              <label style={styles.label} htmlFor="lp-username">Trader Name</label>
              <input
                id="lp-username"
                ref={usernameRef}
                style={styles.input}
                type="text"
                placeholder="e.g. TonyT"
                value={username}
                onChange={e => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20)); clearError(); }}
                onFocus={scrollFocusedIntoView}
                disabled={loading}
                maxLength={20}
                autoComplete="username"
                name="username"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
              />
              <div style={styles.hint}>Letters, numbers, <code>_</code> and <code>.</code> only</div>
            </div>
          )}

          {/* Email */}
          <div style={styles.fieldWrap}>
            <label style={styles.label} htmlFor="lp-email">Email</label>
            <input
              id="lp-email"
              ref={emailRef}
              style={styles.input}
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); clearError(); }}
              onFocus={scrollFocusedIntoView}
              disabled={loading}
              autoComplete="email"
              name="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </div>

          {/* Password */}
          <div style={styles.fieldWrap}>
            <label style={styles.label} htmlFor="lp-password">Password</label>
            <div style={styles.passwordWrap}>
              <input
                id="lp-password"
                ref={passwordRef}
                style={{ ...styles.input, paddingRight: 64 }}
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
                value={password}
                onChange={e => { setPassword(e.target.value); clearError(); }}
                onFocus={scrollFocusedIntoView}
                disabled={loading}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                name={mode === 'signup' ? 'new-password' : 'current-password'}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={styles.passwordToggle}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.error}>
              {error}
              {resendState !== 'hidden' && (
                <div style={{ marginTop: 6 }}>
                  {resendState === 'sent' ? (
                    <span style={styles.resendSent}>Verification email sent ✓</span>
                  ) : (
                    <button
                      type="button"
                      disabled={resendLoading}
                      onClick={async () => {
                        if (resendLoading) return;
                        const emailVal = (email || emailRef.current?.value || '').trim();
                        if (!emailVal) return;
                        setResendLoading(true);
                        const { error: resendErr } = await supabase.auth.resend({
                          type: 'signup',
                          email: emailVal,
                        });
                        setResendLoading(false);
                        if (!resendErr) setResendState('sent');
                      }}
                      style={{ ...styles.resendLink, ...(resendLoading ? { opacity: 0.6, cursor: 'default' } : {}) }}
                    >
                      {resendLoading ? 'Sending…' : 'Resend verification email'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {success && (
            <div style={styles.successMsg}>{success}</div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
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
                type="button"
                onClick={async () => {
                  if (loading) return;
                  const emailVal = (email || emailRef.current?.value || '').trim();
                  if (!emailVal) { setError('Enter your email first.'); return; }
                  setError('');
                  setSuccess('');
                  setLoading(true);
                  const { error } = await supabase.auth.resetPasswordForEmail(emailVal, {
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

        </form>

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
    paddingTop:    'max(24px, env(safe-area-inset-top, 24px))',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
    paddingLeft: 20,
    paddingRight: 20,
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
    padding: '10px 0',
    minHeight: 44,
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
    padding: '12px 14px',
    // 16px minimum prevents iOS Safari from auto-zooming the viewport
    // when the input receives focus. Anything < 16 triggers the zoom.
    fontSize: 16,
    lineHeight: 1.3,
    color: 'var(--text1)',
    transition: 'border-color 0.15s',
    WebkitAppearance: 'none',
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
    padding: '14px 0',
    minHeight: 44,
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    marginTop: 4,
    transition: 'opacity 0.15s',
    WebkitTapHighlightColor: 'transparent',
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
    padding: '12px 16px',
    minHeight: 44,
    WebkitTapHighlightColor: 'transparent',
  },
  resendLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--red)',
    fontSize: 12,
    fontWeight: 500,
    textDecoration: 'underline',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  resendSent: {
    fontSize: 12,
    color: 'var(--red)',
    opacity: 0.75,
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordToggle: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: 'translateY(-50%)',
    minWidth: 44,
    minHeight: 44,
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
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
