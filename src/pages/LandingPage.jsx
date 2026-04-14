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

  const showError = (msg) => { setBtnError(msg); setTimeout(() => setBtnError(''), 2500); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { showError('Enter your email'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { showError('Invalid email'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') showError('Already on the list!');
      else showError('Something went wrong');
      return;
    }
    setSuccess(true);
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const spotsUsed = spotsLeft !== null ? TOTAL_SPOTS - spotsLeft : 0;
  const progressPct = spotsLeft !== null ? (spotsUsed / TOTAL_SPOTS) * 100 : 0;
  const noSpots = spotsLeft === 0;

  const FEATURES = [
    { icon: '⚡', title: 'Smart alerts & dark pool flow', desc: 'Breakout alerts, options activity, and dark pool orders — see where big money is moving.' },
    { icon: '✦', title: 'AI-powered research', desc: 'Ask about any stock — earnings, fundamentals, sector momentum. Sharp answers, no fluff.', iconColor: '#8B5CF6' },
    { icon: '👥', title: 'Trade with your team', desc: 'Private groups, daily briefings, and curated watchlists — shared with your crew.' },
    { icon: '🏆', title: 'Portfolio challenge', desc: '$50K paper cash. Compete on the leaderboard, earn badges, talk trash — prove who trades best.' },
  ];

  const FAQS = [
    { q: 'Why is access limited?', a: "We're a small team. We'd rather give 50 people a great experience than 1,000 people a buggy one. Each round we open more spots." },
    { q: 'Is it free?', a: "Yes, completely free during the beta. We're building with our friends first — no hidden fees, no premium tiers yet." },
    { q: 'Is this a brokerage?', a: "No. We don't hold your money or execute real trades. The portfolio challenge uses virtual cash. We're a research and community tool." },
  ];

  const SCREENSHOTS = [
    { label: 'Home', gradient: 'linear-gradient(135deg, #132d52, #1a4a6e)' },
    { label: 'Alerts', gradient: 'linear-gradient(135deg, #1a3a5e, #0f2440)' },
    { label: 'Challenge', gradient: 'linear-gradient(135deg, #132d52, #1a4a30)' },
  ];

  const AVATARS = [
    { bg: '#2563eb', letter: 'T' },
    { bg: '#7c3aed', letter: 'N' },
    { bg: '#db2777', letter: 'D' },
    { bg: '#d97706', letter: 'E' },
  ];

  const fade = (delay = 0) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(22px)',
    transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
  });

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f4f6f9', minHeight: '100vh', overflowX: 'hidden', fontSize: 13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .lp-heading { font-family: 'Outfit', sans-serif; }
        .lp-btn-green {
          background: #16a34a;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
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
          border: 1.5px solid rgba(255,255,255,0.16);
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 16px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          background: rgba(255,255,255,0.08);
          color: #f1f5f9;
        }
        .lp-input:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .lp-input::placeholder { color: rgba(255,255,255,0.35); }
        .lp-input:disabled { opacity: 0.5; cursor: not-allowed; }
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
        .lp-faq-row:hover .lp-faq-q { color: #16a34a !important; }
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
        .lp-faq-answer.open { max-height: 200px; opacity: 1; }
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
          width: 140px;
          height: 200px;
          border-radius: 14px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 28px rgba(0,0,0,0.28);
          transition: transform 0.22s ease;
        }
        .lp-screen-card:hover { transform: translateY(-4px) scale(1.03); }
        .lp-feature-card {
          background: #fff;
          border-radius: 16px;
          padding: 22px 20px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          border: 1px solid #e5e7eb;
          transition: box-shadow 0.18s, transform 0.18s;
        }
        .lp-feature-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.09); transform: translateY(-2px); }
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
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.85; }
        }
        @keyframes grid-fade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        background: '#132d52',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '0 20px',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#16a34a"/>
              <polyline points="5,18 10,11 14,15 19,8 23,13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="lp-heading" style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>UpTik</span>
            <span style={{
              background: 'rgba(74,222,128,0.15)',
              color: '#4ade80',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 20,
              border: '1px solid rgba(74,222,128,0.3)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontFamily: "'DM Sans', sans-serif",
            }}>Beta</span>
          </div>
          {/* Login */}
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.75)',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              padding: '6px 4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
          >
            Login
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        background: 'linear-gradient(160deg, #132d52 0%, #1a3a5e 100%)',
        padding: '72px 20px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          animation: 'grid-fade 1.4s ease forwards',
        }} />
        {/* Green glow */}
        <div style={{
          position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 300, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(22,163,74,0.2) 0%, transparent 70%)',
          animation: 'pulse-glow 4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
          {/* Pill */}
          <div style={{ ...fade(0), display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(22,163,74,0.14)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 24, padding: '5px 14px 5px 10px', marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 8px #4ade80' }} />
            <span style={{ color: '#86efac', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>Private trading community</span>
          </div>

          {/* Headline */}
          <h1 className="lp-heading" style={{ ...fade(80), margin: '0 0 18px', fontSize: 'clamp(36px, 8vw, 48px)', fontWeight: 900, lineHeight: 1.08, color: '#fff', letterSpacing: '-0.03em' }}>
            Trade stocks with your{' '}
            <span style={{ color: '#8cd9a0' }}>crew</span>
          </h1>

          {/* Subtitle */}
          <p style={{ ...fade(160), margin: '0 0 36px', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Rolling out slowly to get it right. AI research, real-time alerts, and a paper trading challenge — built for friends who trade together.
          </p>

          {/* Spots card */}
          <div style={{ ...fade(240), background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '26px 26px 22px', backdropFilter: 'blur(12px)', textAlign: 'left' }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                {spotsLeft !== null
                  ? `${spotsLeft} of ${TOTAL_SPOTS} spots open`
                  : `— of ${TOTAL_SPOTS} spots open`}
              </span>
              <span style={{
                background: 'rgba(74,222,128,0.15)',
                color: '#4ade80',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                border: '1px solid rgba(74,222,128,0.25)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>Beta</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 6, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                borderRadius: 6,
                transition: 'width 0.9s ease',
              }} />
            </div>

            {success ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(22,163,74,0.2)', border: '1.5px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10L8.5 14.5L16 6" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="lp-heading" style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>You're on the list!</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>We'll email you when your spot is ready.</div>
              </div>
            ) : noSpots ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button disabled className="lp-btn-green" style={{ width: '100%', padding: 13, fontSize: 15, opacity: 0.6 }}>
                  Join Waitlist
                </button>
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>
                  Next round opening soon
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={submitting}
                  className="lp-input"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="lp-btn-green"
                  style={{ width: '100%', padding: 13, fontSize: 15 }}
                >
                  {submitting ? 'Joining...' : btnError || 'Get early access →'}
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
      <section style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {AVATARS.map((av, i) => (
              <div key={i} className="lp-avatar" style={{ background: av.bg, marginLeft: i === 0 ? 0 : -9, zIndex: 4 - i }}>
                {av.letter}
              </div>
            ))}
          </div>
          <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>
            Join traders already inside
          </span>
        </div>
      </section>

      {/* WHAT'S INSIDE */}
      <section style={{ background: '#eef2f7', padding: '64px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ display: 'inline-block', background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
              What&apos;s inside
            </div>
            <h2 className="lp-heading" style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Everything you need.<br />Nothing you don&apos;t.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="lp-feature-card">
                <div style={{ fontSize: 26, marginBottom: 12, lineHeight: 1, color: f.iconColor || undefined }}>
                  {f.icon}
                </div>
                <div className="lp-heading" style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6, lineHeight: 1.3 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section style={{ background: '#132d52', padding: '60px 0' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', paddingLeft: 20, paddingRight: 20, marginBottom: 28 }}>
          <div style={{ display: 'inline-block', background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
            Real screenshots
          </div>
          <h2 className="lp-heading" style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            See it in action
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Swipe to explore →</p>
        </div>
        <div style={{ paddingLeft: 20 }}>
          <div className="lp-screen-scroll">
            {SCREENSHOTS.map((s, i) => (
              <div key={i} className="lp-screen-card" style={{ background: s.gradient }}>
                {/* Placeholder UI chrome */}
                <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, width: '55%' }} />
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, width: '75%' }} />
                  <div style={{ height: 40, background: 'rgba(255,255,255,0.06)', borderRadius: 8, marginTop: 6 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
                    <div style={{ height: 34, background: 'rgba(255,255,255,0.07)', borderRadius: 6 }} />
                    <div style={{ height: 34, background: 'rgba(255,255,255,0.07)', borderRadius: 6 }} />
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, width: '85%', marginTop: 2 }} />
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: '65%' }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ height: 28, background: 'rgba(22,163,74,0.28)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.18)' }} />
                </div>
                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center' }}>
                  <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.04em', fontFamily: "'DM Sans', sans-serif" }}>
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
            <div style={{ display: 'inline-block', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
              FAQ
            </div>
            <h2 className="lp-heading" style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Honest answers
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
                  <span className="lp-faq-q lp-heading" style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', flex: 1, transition: 'color 0.15s', lineHeight: 1.4 }}>
                    {faq.q}
                  </span>
                  <svg className={`lp-chevron${faqOpen === i ? ' open' : ''}`} width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className={`lp-faq-answer${faqOpen === i ? ' open' : ''}`}>
                  <p style={{ margin: '0 0 18px', fontSize: 13, color: '#6b7280', lineHeight: 1.7 }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{
        background: 'linear-gradient(135deg, #132d52 0%, #1a3a5e 60%, #0f2440 100%)',
        padding: '72px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', bottom: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 200, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(22,163,74,0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <h2 className="lp-heading" style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 6vw, 38px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Ready to trade with your crew?
          </h2>
          <p style={{ margin: '0 0 28px', color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65 }}>
            {spotsLeft !== null && spotsLeft > 0 ? (
              <><span style={{ color: '#8cd9a0', fontWeight: 700 }}>{spotsLeft} spots</span> remaining in this round.</>
            ) : spotsLeft === 0 ? (
              'All beta spots are filled — join the waitlist for the next round.'
            ) : (
              'Limited beta access — grab a spot before they\'re gone.'
            )}
          </p>
          <button
            onClick={scrollToTop}
            className="lp-btn-green"
            style={{ padding: '14px 36px', fontSize: 15 }}
          >
            Get early access →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0a1628', padding: '28px 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ margin: '0 0 6px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.05em' }}>
          ONE TEAM, ONE TRADE
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
          © 2026 UpTikAlerts
        </p>
      </footer>
    </div>
  );
}
