// ============================================
// UPTIKALERTS — LandingPage.jsx
// Public waitlist landing page
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [btnError, setBtnError] = useState('');
  const [visible, setVisible]   = useState(false);

  // Trigger staggered fade-up on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const showError = (msg) => {
    setBtnError(msg);
    setTimeout(() => setBtnError(''), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim())  { showError('Enter your name'); return; }
    if (!email.trim()) { showError('Enter your email'); return; }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk)      { showError('Invalid email'); return; }

    setSubmitting(true);
    const { error } = await supabase
      .from('waitlist')
      .insert({ name: name.trim(), email: email.trim().toLowerCase() });
    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        showError("You're already on the list!");
      } else {
        showError('Something went wrong');
      }
      return;
    }

    setSuccess(true);
  };

  const FEATURES = [
    'Live stock alerts',
    'Group chat',
    'Curated watchlists',
    'Free to join',
  ];

  return (
    <>
      {/* Google Fonts applied via inline style on root */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #f8faf9; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .land-section {
          opacity: 0;
        }
        .land-section.visible {
          animation: fadeUp 0.55s ease forwards;
        }
        .land-section.d1 { animation-delay: 0.05s; }
        .land-section.d2 { animation-delay: 0.18s; }
        .land-section.d3 { animation-delay: 0.30s; }
        .land-section.d4 { animation-delay: 0.42s; }
        .land-section.d5 { animation-delay: 0.54s; }

        @media (max-width: 520px) {
          .hero-title { font-size: 36px !important; }
          .waitlist-card { padding: 24px 18px !important; }
        }
      `}</style>

      <div style={styles.page}>

        {/* ── Nav ── */}
        <nav style={styles.nav}>
          <div style={styles.navLogo}>
            <span style={styles.logoGreen}>UpTik</span>
            <span style={styles.logoDark}>Alerts</span>
          </div>
          <div style={styles.comingSoonPill}>Coming Soon</div>
        </nav>

        {/* ── Hero ── */}
        <div style={styles.hero}>

          {/* Grid + glow bg */}
          <div style={styles.gridBg} />
          <div style={styles.glowBg} />

          <div style={styles.heroContent}>

            {/* Pill tag */}
            <div className={`land-section d1${visible ? ' visible' : ''}`} style={styles.pillWrap}>
              <div style={styles.pill}>
                <span style={styles.pillDot} />
                Private trading communities
              </div>
            </div>

            {/* Headline */}
            <h1
              className={`land-section d2${visible ? ' visible' : ''} hero-title`}
              style={styles.headline}
            >
              Trade <span style={styles.headlineGreen}>Smarter</span> as a Group
            </h1>

            {/* Subtitle */}
            <p className={`land-section d3${visible ? ' visible' : ''}`} style={styles.subtitle}>
              Daily briefings and real-time alerts that filter the noise —<br />
              so you don't have to stare at charts all day.
            </p>

            {/* Waitlist Card */}
            <div
              className={`land-section d4${visible ? ' visible' : ''} waitlist-card`}
              style={styles.card}
            >
              {success ? (
                <div style={styles.successWrap}>
                  <div style={styles.successCheck}>✓</div>
                  <div style={styles.successTitle}>You're on the list</div>
                  <div style={styles.successSub}>
                    We'll let you know when UpTikAlerts is ready.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={styles.form}>
                  <div style={styles.cardLabel}>Join the waitlist</div>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={submitting}
                  />
                  <input
                    style={styles.input}
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      ...styles.submitBtn,
                      ...(btnError ? styles.submitBtnError : {}),
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? 'Joining…' : btnError || 'Join Waitlist'}
                  </button>
                </form>
              )}
            </div>

            {/* Feature badges */}
            <div className={`land-section d5${visible ? ' visible' : ''}`} style={styles.badges}>
              {FEATURES.map(f => (
                <div key={f} style={styles.badge}>
                  <span style={styles.badgeCheck}>✓</span>
                  {f}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={styles.footer}>
          © 2026 UpTikAlerts. All rights reserved.
        </footer>

      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'DM Sans', sans-serif",
    background: '#f8faf9',
    color: '#0f172a',
  },

  // ── Nav ──
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 24px',
    height: 60,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(0,0,0,0.07)',
  },
  navLogo: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "'Outfit', sans-serif",
    letterSpacing: '-0.3px',
  },
  logoGreen: { color: '#1AAD5E' },
  logoDark:  { color: '#0f172a' },
  comingSoonPill: {
    fontSize: 11,
    fontWeight: 600,
    color: '#1AAD5E',
    background: 'rgba(26,173,94,0.1)',
    border: '1px solid rgba(26,173,94,0.25)',
    padding: '4px 12px',
    borderRadius: 20,
    letterSpacing: '0.3px',
  },

  // ── Hero ──
  hero: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px 40px',
    overflow: 'hidden',
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(26,173,94,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26,173,94,0.06) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    zIndex: 0,
  },
  glowBg: {
    position: 'absolute',
    top: '0%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 600,
    height: 400,
    background: 'radial-gradient(ellipse at center, rgba(26,173,94,0.13) 0%, transparent 70%)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: 560,
    width: '100%',
    gap: 20,
  },

  // ── Pill tag ──
  pillWrap: {},
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    fontWeight: 600,
    color: '#1AAD5E',
    background: 'rgba(26,173,94,0.08)',
    border: '1px solid rgba(26,173,94,0.2)',
    padding: '5px 14px',
    borderRadius: 20,
    letterSpacing: '0.2px',
  },
  pillDot: {
    width: 6,
    height: 6,
    background: '#1AAD5E',
    borderRadius: '50%',
    flexShrink: 0,
    boxShadow: '0 0 6px rgba(26,173,94,0.6)',
  },

  // ── Headline ──
  headline: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 48,
    fontWeight: 800,
    color: '#0f172a',
    lineHeight: 1.15,
    letterSpacing: '-1px',
  },
  headlineGreen: { color: '#1AAD5E' },

  // ── Subtitle ──
  subtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 1.7,
    fontWeight: 400,
    maxWidth: 440,
  },

  // ── Waitlist Card ──
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4,
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 9,
    border: '1.5px solid #e2e8f0',
    fontSize: 14,
    color: '#0f172a',
    background: '#f8fafc',
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  submitBtn: {
    width: '100%',
    background: '#1AAD5E',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '13px 0',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Outfit', sans-serif",
    cursor: 'pointer',
    transition: 'opacity 0.15s, background 0.15s',
    marginTop: 2,
    letterSpacing: '0.2px',
  },
  submitBtnError: {
    background: '#E05252',
  },

  // ── Success ──
  successWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0 8px',
    gap: 8,
  },
  successCheck: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(26,173,94,0.1)',
    border: '2px solid rgba(26,173,94,0.3)',
    color: '#1AAD5E',
    fontSize: 22,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    fontFamily: "'Outfit', sans-serif",
  },
  successSub: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.6,
    textAlign: 'center',
  },

  // ── Feature badges ──
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: '#475569',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 20,
    padding: '5px 12px',
  },
  badgeCheck: {
    color: '#1AAD5E',
    fontWeight: 700,
    fontSize: 12,
  },

  // ── Footer ──
  footer: {
    textAlign: 'center',
    padding: '20px',
    fontSize: 12,
    color: '#94a3b8',
    borderTop: '1px solid #e2e8f0',
    fontFamily: "'DM Sans', sans-serif",
  },
};
