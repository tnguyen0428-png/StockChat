// ============================================
// UPTIKALERTS — LandingPage.jsx
// Public waitlist landing page
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const navigate = useNavigate();
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
    'Breakout alerts',
    'Dark pool flow',
    'AI research',
    'Group chat',
    'Portfolio challenge',
    'Daily briefings',
    'Options flow',
  ];

  const INSIDE = [
    {
      icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
      iconColor: '#1AAD5E',
      iconBg: 'rgba(26,173,94,0.1)',
      title: 'Smart alerts & dark pool flow',
      desc: 'Breakout alerts, options activity, and dark pool orders — see where big money is moving before everyone else.',
    },
    {
      icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
      iconColor: '#8B5CF6',
      iconBg: 'rgba(139,92,246,0.1)',
      title: 'AI-powered research',
      desc: 'Ask UpTik AI about any stock — earnings, fundamentals, sector momentum. Voice or text, right in your chat.',
    },
    {
      icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      iconColor: '#4A90D9',
      iconBg: 'rgba(74,144,217,0.1)',
      title: 'Trade with your team',
      desc: 'Sector chat rooms, private groups, daily briefings, and curated watchlists — all shared with your crew.',
    },
    {
      icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      iconColor: '#D4A017',
      iconBg: 'rgba(212,160,23,0.1)',
      title: 'Portfolio challenge',
      desc: 'Start with $50K paper cash. Compete on the leaderboard, earn badges, talk trash — prove who trades best.',
    },
  ];

  return (
    <>
      {/* Google Fonts applied via inline style on root */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #eef2f7; }

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
          .hero-title { font-size: 38px !important; }
          .waitlist-card { padding: 24px 18px !important; }
        }
      `}</style>

      <div style={styles.page}>

        {/* ── Nav ── */}
        <nav style={styles.nav}>
          <div style={styles.navLogo}>
            <svg width="32" height="32" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.2" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.5" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3" />
            </svg>
            <div style={{ borderLeft: '1px solid rgba(140,217,160,0.25)', paddingLeft: 4, marginLeft: -3, lineHeight: 0.9 }}>
              <div style={styles.logoRow}>
                <span style={styles.logoUp}>Up</span>
                <span style={styles.logoTik}>tik</span>
              </div>
              <div style={styles.logoAlerts}>alerts</div>
            </div>
          </div>
          <div style={styles.navRight}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={styles.comingSoonPill}>Coming Soon</div>
              <button
                style={styles.betaLoginBtn}
                onClick={() => navigate('/login')}
                onMouseEnter={e => e.currentTarget.style.color = '#8cd9a0'}
                onMouseLeave={e => e.currentTarget.style.color = '#fff'}
              >
                Beta Login
              </button>
            </div>
            <div style={styles.logoSlogan}>ONE TEAM, ONE TRADE</div>
          </div>
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
              Trade <span style={styles.headlineGreen}>Smarter</span> as a Team
            </h1>

            {/* Subtitle */}
            <p className={`land-section d3${visible ? ' visible' : ''}`} style={styles.subtitle}>
              AI-powered research, real-time alerts, dark pool flow, and a paper trading challenge — built for friends who trade together.
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

            {/* Social proof */}
            <div className={`land-section d5${visible ? ' visible' : ''}`} style={styles.socialProof}>
              <div style={styles.avatarStack}>
                {[
                  { letter: 'T', bg: 'linear-gradient(135deg,#1AAD5E,#0d8a47)' },
                  { letter: 'N', bg: 'linear-gradient(135deg,#4A90D9,#2d6cb5)' },
                  { letter: 'D', bg: 'linear-gradient(135deg,#D4A017,#b58a12)' },
                  { letter: 'E', bg: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' },
                ].map((a, i) => (
                  <div key={a.letter} style={{ ...styles.socialAvatar, background: a.bg, marginLeft: i > 0 ? -6 : 0 }}>{a.letter}</div>
                ))}
              </div>
              <span style={styles.socialText}>Join traders already on the list</span>
            </div>

            {/* Feature badges */}
            <div className={`land-section d5${visible ? ' visible' : ''}`} style={styles.badges}>
              {FEATURES.map((f, i) => (
                <div key={f} style={{
                  ...styles.badge,
                  ...(i === FEATURES.length - 1 && FEATURES.length % 2 !== 0 ? { gridColumn: '1 / -1', maxWidth: 190, margin: '0 auto' } : {}),
                }}>
                  <span style={styles.badgeCheck}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            {/* What's inside */}
            <div className={`land-section d5${visible ? ' visible' : ''}`} style={styles.insideSection}>
              <div style={styles.insideTitle}>What's inside</div>
              {INSIDE.map(f => (
                <div key={f.title} style={styles.insideCard}>
                  <div style={{ ...styles.insideIcon, background: f.iconBg }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={f.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: f.icon }} />
                  </div>
                  <div>
                    <div style={styles.insideCardTitle}>{f.title}</div>
                    <div style={styles.insideCardDesc}>{f.desc}</div>
                  </div>
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
    background: '#eef2f7',
    color: '#1a2d4a',
  },

  // ── Nav ──
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    minHeight: 58,
    background: '#132d52',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  navLogo: {
    display: 'flex',
    alignItems: 'center',
  },
  logoRow: { display: 'flex', alignItems: 'baseline' },
  logoUp: { fontSize: 20, fontWeight: 500, color: '#f0ede8' },
  logoTik: { fontSize: 20, fontWeight: 500, color: '#8cd9a0' },
  logoAlerts: {
    fontSize: 12, fontWeight: 300, color: '#d4e4f2', letterSpacing: 2.5,
    fontFamily: "'Outfit', sans-serif",
    marginTop: 0, paddingLeft: 0,
  },
  logoSlogan: {
    fontSize: 12, fontWeight: 300, fontStyle: 'italic',
    color: '#f0ede8', letterSpacing: 1,
    fontFamily: "'Outfit', sans-serif",
  },
  navRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  betaLoginBtn: {
    background: 'none',
    border: 'none',
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    padding: 0,
    fontFamily: "'DM Sans', sans-serif",
    transition: 'color 0.15s',
  },
  comingSoonPill: {
    fontSize: 13,
    fontWeight: 600,
    color: '#8cd9a0',
    background: 'rgba(26,173,94,0.2)',
    border: '1px solid rgba(26,173,94,0.4)',
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
    padding: '28px 20px 24px',
    overflow: 'hidden',
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(26,173,94,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26,173,94,0.04) 1px, transparent 1px)
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
    gap: 14,
  },

  // ── Pill tag ──
  pillWrap: {},
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
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
    color: '#1a2d4a',
    lineHeight: 1.15,
    letterSpacing: '-1px',
  },
  headlineGreen: { color: '#1AAD5E' },

  // ── Subtitle ──
  subtitle: {
    fontSize: 16,
    color: '#7a8ea3',
    lineHeight: 1.5,
    fontWeight: 400,
    maxWidth: 380,
  },

  // ── Waitlist Card ──
  card: {
    background: '#f8fafc',
    borderRadius: 16,
    padding: '18px 16px 16px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
    border: '1px solid #d8e2ed',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a2d4a',
    marginBottom: 4,
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 9,
    border: '1.5px solid #d8e2ed',
    fontSize: 16,
    color: '#1a2d4a',
    background: '#ffffff',
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
    fontSize: 16,
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
    fontSize: 18,
    fontWeight: 700,
    color: '#1a2d4a',
    fontFamily: "'Outfit', sans-serif",
  },
  successSub: {
    fontSize: 14,
    color: '#7a8ea3',
    lineHeight: 1.6,
    textAlign: 'center',
  },

  // ── Social proof ──
  socialProof: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avatarStack: { display: 'flex' },
  socialAvatar: { width: 24, height: 24, borderRadius: '50%', border: '2px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' },
  socialText: { fontSize: 14, color: '#7a8ea3', fontWeight: 500 },

  // ── Feature badges ──
  badges: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
    maxWidth: 380,
    margin: '0 auto',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    fontSize: 14,
    fontWeight: 500,
    color: '#1a2d4a',
    background: '#f8fafc',
    border: '1px solid #d8e2ed',
    borderRadius: 8,
    padding: '7px 10px',
  },
  badgeCheck: {
    color: '#1AAD5E',
    fontWeight: 700,
    fontSize: 14,
  },

  // ── What's inside ──
  insideSection: { textAlign: 'left', maxWidth: 380, margin: '0 auto' },
  insideTitle: { fontSize: 16, fontWeight: 700, color: '#1a2d4a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', fontFamily: "'Outfit', sans-serif" },
  insideCard: { background: '#f8fafc', border: '1px solid #d8e2ed', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 },
  insideIcon: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  insideCardTitle: { fontSize: 15, fontWeight: 600, color: '#1a2d4a', marginBottom: 2 },
  insideCardDesc: { fontSize: 14, color: '#7a8ea3', lineHeight: 1.4 },

  // ── Footer ──
  footer: {
    textAlign: 'center',
    padding: '14px',
    fontSize: 14,
    color: '#7a8ea3',
    borderTop: '1px solid #d8e2ed',
    fontFamily: "'DM Sans', sans-serif",
  },
};
