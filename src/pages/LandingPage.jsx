import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const TOTAL_SPOTS = 50;

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [btnError, setBtnError] = useState('');
  const [visible, setVisible] = useState(false);
  const [spotsLeft, setSpotsLeft] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  useEffect(() => {
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!error && count != null) setSpotsLeft(Math.max(0, TOTAL_SPOTS - count));
      });
  }, []);

  const showError = (msg) => { setBtnError(msg); setTimeout(() => setBtnError(''), 2000); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { showError('Enter your email'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { showError('Invalid email'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') showError("You're already on the list!");
      else showError('Something went wrong');
      return;
    }
    setSuccess(true);
  };

  const spotsUsed = spotsLeft !== null ? TOTAL_SPOTS - spotsLeft : 0;
  const progressPct = spotsLeft !== null ? ((spotsUsed / TOTAL_SPOTS) * 100) : 0;
  const noSpots = spotsLeft === 0;

  const FEATURES = [
    { icon: '⚡', title: 'Smart alerts & dark pool flow', desc: 'Breakout alerts, options activity, and dark pool orders — see where big money is moving.' },
    { icon: '✦', title: 'AI-powered research', desc: 'Ask about any stock — earnings, fundamentals, sector momentum. Sharp answers, no fluff.', iconColor: '#8B5CF6' },
    { icon: '👥', title: 'Trade with your team', desc: 'Private groups, daily briefings, and curated watchlists — shared with your crew.' },
    { icon: '🏆', title: 'Portfolio challenge', desc: '$50K paper cash. Compete on the leaderboard, earn badges, talk trash — prove who trades best.' },
  ];

  const FAQS = [
    { q: "Why is access limited?", a: "We're a small team. We'd rather give 50 people a great experience than 1,000 people a buggy one. Each round we open more spots." },
    { q: "Is it free?", a: "Yes, completely free during the beta. We're building with our friends first — no hidden fees, no premium tiers yet." },
    { q: "Is this a brokerage?", a: "No. We don't hold your money or execute real trades. The portfolio challenge uses virtual cash. We're a research and community tool." },
  ];

  const SCREENSHOTS = [
    { label: 'Home', gradient: 'linear-gradient(135deg, #132d52, #1a4a6e)' },
    { label: 'Alerts', gradient: 'linear-gradient(135deg, #1a3a5e, #0f2440)' },
    { label: 'Challenge', gradient: 'linear-gradient(135deg, #132d52, #2a5a3e)' },
  ];

  const fadeStyle = (delay = 0) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(22px)',
    transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
  });

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f4f6f9', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .lp-btn-green {
          background: #16a34a;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: background 0.18s, transform 0.12s;
          padding: 13px 28px;
          letter-spacing: 0.01em;
        }
        .lp-btn-green:hover { background: #15803d; transform: translateY(-1px); }
        .lp-btn-green:active { transform: translateY(0); }
        .lp-btn-green:disabled { background: #4ade80; cursor: not-allowed; transform: none; }
        .lp-input {
          width: 100%;
          padding: 13px 16px;
          border: 1.5px solid #d1d5db;
          border-radius: 10px;
          font-size: 15px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          background: #fff;
          color: #111;
        }
        .lp-input:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.12); }
        .lp-input::placeholder { color: #9ca3af; }
        .lp-faq-item {
          border-bottom: 1px solid #e5e7eb;
          cursor: pointer;
          user-select: none;
        }
        .lp-faq-item:last-child { border-bottom: none; }
        .lp-faq-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 0;
          gap: 12px;
        }
        .lp-faq-row:hover .lp-faq-q { color: #16a34a; }
        .lp-chevron {
          transition: transform 0.22s ease;
          color: #6b7280;
          flex-shrink: 0;
        }
        .lp-chevron.open { transform: rotate(180deg); }
        .lp-faq-answer {
          overflow: hidden;
          transition: max-height 0.28s ease, opacity 0.22s ease;
          max-height: 0;
          opacity: 0;
        }
        .lp-faq-answer.open {
          max-height: 200px;
          opacity: 1;
        }
        .lp-screen-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .lp-screen-scroll::-webkit-scrollbar { display: none; }
        .lp-screen-card {
          flex-shrink: 0;
          width: 200px;
          height: 340px;
          border-radius: 18px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          transition: transform 0.22s ease;
        }
        .lp-screen-card:hover { transform: translateY(-4px) scale(1.02); }
        .lp-feature-card {
          background: #fff;
          border-radius: 16px;
          padding: 22px 20px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07);
          border: 1px solid #e5e7eb;
          transition: box-shadow 0.18s, transform 0.18s;
        }
        .lp-feature-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.1); transform: translateY(-2px); }
        .lp-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
        @keyframes grid-fade {
          0% { opacity: 0; }
          100% { opacity: 0.12; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        background: '#0f1e35',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '0 20px',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#16a34a"/>
              <polyline points="5,18 10,11 14,15 19,8 23,13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>StockChat</span>
            <span style={{
              background: 'rgba(22,163,74,0.18)',
              color: '#4ade80',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 20,
              border: '1px solid rgba(74,222,128,0.3)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>Beta</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'transparent',
              border: '1.5px solid rgba(255,255,255,0.22)',
              color: '#e2e8f0',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'border-color 0.18s, color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4ade80'; e.currentTarget.style.color = '#4ade80'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#e2e8f0'; }}
          >
            Log in
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        background: 'linear-gradient(160deg, #0a1628 0%, #0f2445 45%, #0d2038 100%)',
        padding: '72px 20px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          animation: 'grid-fade 1.2s ease forwards',
        }} />
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: 480, height: 280, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(22,163,74,0.22) 0%, transparent 70%)',
          animation: 'pulse-glow 4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
          {/* Pill badge */}
          <div style={{ ...fadeStyle(0), display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 24, padding: '5px 14px 5px 10px', marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 8px #4ade80' }} />
            <span style={{ color: '#86efac', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>Now accepting beta applications</span>
          </div>

          {/* Headline */}
          <h1 style={{ ...fadeStyle(80), margin: '0 0 18px', fontSize: 'clamp(34px, 8vw, 52px)', fontWeight: 900, lineHeight: 1.08, color: '#f8fafc', letterSpacing: '-0.03em' }}>
            Trade smarter<br />with your{' '}
            <span style={{ color: '#4ade80' }}>crew</span>
          </h1>

          {/* Subtitle */}
          <p style={{ ...fadeStyle(160), margin: '0 0 40px', fontSize: 16, color: '#94a3b8', lineHeight: 1.65, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Real-time alerts, AI research, and group chats — all in one place. Built for traders who move together.
          </p>

          {/* Spots counter card */}
          <div style={{ ...fadeStyle(240), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px 28px 24px', backdropFilter: 'blur(12px)', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Beta spots</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: spotsLeft === 0 ? '#f87171' : '#4ade80' }}>
                {spotsLeft === null ? '— left' : `${spotsLeft} / ${TOTAL_SPOTS} left`}
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 6, marginBottom: 22, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: progressPct > 80 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #16a34a, #4ade80)',
                borderRadius: 6,
                transition: 'width 0.8s ease',
              }} />
            </div>

            {success ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>You're on the list!</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>We'll email you when your spot is ready.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={noSpots || submitting}
                  className="lp-input"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)', color: '#f1f5f9' }}
                />
                <button
                  type="submit"
                  disabled={noSpots || submitting}
                  className="lp-btn-green"
                  style={{ width: '100%', padding: '13px', fontSize: 15 }}
                >
                  {submitting ? 'Joining...' : btnError ? btnError : noSpots ? 'All spots filled' : 'Request early access →'}
                </button>
                {btnError && !submitting && (
                  <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: -4 }}>{btnError}</div>
                )}
              </form>
            )}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '18px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[
              { bg: '#2563eb', letter: 'A' },
              { bg: '#7c3aed', letter: 'M' },
              { bg: '#db2777', letter: 'J' },
              { bg: '#d97706', letter: 'R' },
              { bg: '#16a34a', letter: 'S' },
            ].map((av, i) => (
              <div key={i} className="lp-avatar" style={{ background: av.bg, marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }}>
                {av.letter}
              </div>
            ))}
          </div>
          <div style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>
            <span style={{ fontWeight: 700 }}>47 traders</span> already joined the waitlist
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1,2,3,4,5].map(i => (
              <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="#f59e0b">
                <polygon points="7,1 8.8,5.2 13.4,5.5 10,8.6 11.1,13.1 7,10.6 2.9,13.1 4,8.6 0.6,5.5 5.2,5.2"/>
              </svg>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT'S INSIDE */}
      <section style={{ background: '#f4f6f9', padding: '64px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ display: 'inline-block', background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              What's inside
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Everything you need.<br />Nothing you don't.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="lp-feature-card">
                <div style={{ fontSize: 26, marginBottom: 12, lineHeight: 1, color: f.iconColor || undefined }}>
                  {f.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6, lineHeight: 1.3 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section style={{ background: '#0f1e35', padding: '64px 0' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', paddingLeft: 20, paddingRight: 20 }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'inline-block', background: 'rgba(22,163,74,0.18)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              The app
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              See it in action
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#64748b' }}>Swipe to explore the main screens →</p>
          </div>
        </div>
        <div style={{ paddingLeft: 20 }}>
          <div className="lp-screen-scroll">
            {SCREENSHOTS.map((s, i) => (
              <div key={i} className="lp-screen-card" style={{ background: s.gradient }}>
                <div style={{ position: 'absolute', inset: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ height: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 5, width: '60%' }} />
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 5, width: '80%' }} />
                  <div style={{ height: 60, background: 'rgba(255,255,255,0.06)', borderRadius: 10, marginTop: 8 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                    <div style={{ height: 50, background: 'rgba(255,255,255,0.08)', borderRadius: 8 }} />
                    <div style={{ height: 50, background: 'rgba(255,255,255,0.08)', borderRadius: 8 }} />
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 5, width: '90%', marginTop: 4 }} />
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 5, width: '70%' }} />
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 5, width: '55%' }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ height: 36, background: 'rgba(22,163,74,0.3)', borderRadius: 8, border: '1px solid rgba(74,222,128,0.2)' }} />
                </div>
                <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center' }}>
                  <span style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.04em' }}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ flexShrink: 0, width: 4 }} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: '#fff', padding: '64px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ display: 'inline-block', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              FAQ
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Quick answers
            </h2>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', padding: '0 22px' }}>
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="lp-faq-item"
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
              >
                <div className="lp-faq-row">
                  <span className="lp-faq-q" style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', flex: 1, transition: 'color 0.15s' }}>
                    {faq.q}
                  </span>
                  <svg className={`lp-chevron${faqOpen === i ? ' open' : ''}`} width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className={`lp-faq-answer${faqOpen === i ? ' open' : ''}`}>
                  <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6b7280', lineHeight: 1.65 }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #0f2445 60%, #0d2038 100%)',
        padding: '72px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', bottom: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 200, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(22,163,74,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(26px, 6vw, 38px)', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Your crew is waiting.
          </h2>
          <p style={{ margin: '0 0 28px', color: '#94a3b8', fontSize: 15, lineHeight: 1.6 }}>
            {spotsLeft !== null && spotsLeft > 0 ? (
              <><span style={{ color: '#4ade80', fontWeight: 700 }}>{spotsLeft} spots</span> remaining in this round.</>
            ) : spotsLeft === 0 ? (
              'All beta spots are filled — join the waitlist for the next round.'
            ) : (
              'Limited beta access — grab a spot before they\'re gone.'
            )}
          </p>
          {!success ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, margin: '0 auto' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={noSpots || submitting}
                className="lp-input"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)', color: '#f1f5f9' }}
              />
              <button
                type="submit"
                disabled={noSpots || submitting}
                className="lp-btn-green"
                style={{ width: '100%', padding: '14px', fontSize: 16 }}
              >
                {submitting ? 'Joining...' : btnError ? btnError : noSpots ? 'All spots filled' : 'Get early access →'}
              </button>
            </form>
          ) : (
            <div style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 14, padding: '22px 24px' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🎉</div>
              <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>You're on the list!</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>We'll reach out when your spot is ready. Watch your inbox.</div>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#070f1c', padding: '28px 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 10 }}>
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="#16a34a"/>
            <polyline points="5,18 10,11 14,15 19,8 23,13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>StockChat</span>
        </div>
        <p style={{ margin: '0 0 6px', color: '#475569', fontSize: 12, fontStyle: 'italic' }}>
          Trade smarter. Move together.
        </p>
        <p style={{ margin: 0, color: '#334155', fontSize: 11 }}>
          © {new Date().getFullYear()} StockChat. Not a brokerage. For informational purposes only.
        </p>
      </footer>
    </div>
  );
}
