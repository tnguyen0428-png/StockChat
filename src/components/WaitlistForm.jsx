import { useState } from 'react';
import { supabase } from '../lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WaitlistForm({ source = 'landing', inputId }) {
  const [email, setEmail]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setErrorMsg('Enter your email'); return; }
    if (!EMAIL_RE.test(trimmed)) { setErrorMsg('Invalid email'); return; }
    setErrorMsg('');
    setSubmitting(true);
    const { error } = await supabase
      .from('waitlist')
      .insert({ email: trimmed, source });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') {
        setSuccess(true);
        setErrorMsg("You're already on the list");
        return;
      }
      setErrorMsg('Something went wrong. Try again.');
      return;
    }
    setSuccess(true);
  };

  return (
    <div style={{
      width: '100%', maxWidth: 460,
      background: '#fff',
      border: '1px solid #d8e2ed',
      borderRadius: 16,
      padding: '22px 22px 20px',
      boxShadow: '0 6px 22px rgba(19,45,82,0.06)',
    }}>
      <h2 style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: 20, fontWeight: 800,
        color: '#1a2d4a', letterSpacing: '-0.2px',
        margin: 0,
      }}>
        Join the Circle 2 Waitlist
      </h2>
      <p style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13, fontWeight: 400,
        color: '#7a8ea3', lineHeight: 1.4,
        margin: '6px 0 14px',
      }}>
        One team, one trade. We open seats by referral first.
      </p>

      {success ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px',
          background: 'rgba(26,173,94,0.08)',
          border: '1px solid rgba(26,173,94,0.25)',
          borderRadius: 10,
        }}>
          <div style={{
            flexShrink: 0,
            width: 22, height: 22, borderRadius: '50%',
            background: '#1AAD5E',
            color: '#fff', fontSize: 13, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 1,
          }}>✓</div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13, fontWeight: 500,
            color: '#1a2d4a', lineHeight: 1.45,
          }}>
            {errorMsg || (
              <>You're on the list. We'll reach out when Circle 2 opens — referrals from Circle 1 members get priority.</>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* noValidate: defer to the custom EMAIL_RE check so invalid emails show
              the styled, screen-reader-announced error instead of the native popup */}
          <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              id={inputId}
              type="email"
              placeholder="you@example.com"
              aria-label="Email address for the Circle 2 waitlist"
              aria-invalid={errorMsg ? true : undefined}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
              autoComplete="email"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: errorMsg ? '1.5px solid #E05252' : '1.5px solid #d8e2ed',
                background: '#fff',
                color: '#1a2d4a',
                fontSize: 16,
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#1AAD5E',
                color: '#fff',
                fontSize: 14, fontWeight: 700,
                fontFamily: "'Outfit', sans-serif",
                letterSpacing: 0.2,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              {submitting ? 'Joining…' : 'Join Waitlist'}
            </button>
          </form>
          {errorMsg && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12, fontWeight: 500,
                color: '#E05252',
                marginTop: 8,
              }}
            >
              {errorMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
