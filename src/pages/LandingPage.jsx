import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const TOTAL_SPOTS = 50;

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [btnError, setBtnError]     = useState('');
  const [visible, setVisible]       = useState(false);
  const [spotsUsed, setSpotsUsed]   = useState(25);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (count != null) setSpotsUsed(count); });
  }, []);

  const showError = (msg) => {
    setBtnError(msg);
    setTimeout(() => setBtnError(''), 2200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { showError('Enter your email'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { showError('Invalid email'); return; }
    setSubmitting(true);
    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') showError("You're already on the list!");
      else showError('Something went wrong');
      return;
    }
    setSuccess(true);
  };

  const spotsOpen = Math.max(0, TOTAL_SPOTS - spotsUsed);
  const pct       = Math.min(100, (spotsUsed / TOTAL_SPOTS) * 100);

  const cls = (d) => `ls${visible ? ` ls-vis ls-d${d}` : ''}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #eef2f7; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ls { opacity: 0; }
        .ls.ls-vis { animation: fadeUp 0.52s ease forwards; }
        .ls.ls-d1 { animation-delay: 0.04s; }
        .ls.ls-d2 { animation-delay: 0.15s; }
        .ls.ls-d3 { animation-delay: 0.26s; }
        .ls.ls-d4 { animation-delay: 0.37s; }
        .ls.ls-d5 { animation-delay: 0.48s; }
        .ls.ls-d6 { animation-delay: 0.58s; }

        .ea-input { outline: none; }
        .ea-input::placeholder { color: rgba(255,255,255,0.4); }
        .ea-input:focus { border-color: #8cd9a0 !important; }
        .login-btn:hover { color: #8cd9a0 !important; }

        .ss-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .ss-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#eef2f7', color: '#1a2d4a' }}>

        {/* ══════════════════════════════════════
            SECTION 1 — HERO (navy gradient)
        ══════════════════════════════════════ */}
        <section style={{
          background: 'linear-gradient(160deg, #132d52 0%, #1a3a5e 100%)',
          position: 'relative',
          overflow: 'hidden',
          paddingBottom: 44,
        }}>
          {/* Grid overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(rgba(140,217,160,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(140,217,160,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }} />
          {/* Green glow */}
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 700, height: 480, zIndex: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 50% 20%, rgba(26,173,94,0.17) 0%, transparent 65%)',
          }} />

          {/* Nav */}
          <nav style={{
            position: 'relative', zIndex: 2,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 20px', maxWidth: 600, margin: '0 auto',
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ marginRight: -2, position: 'relative', top: 3 }}>
                <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5"/>
                <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6"/>
                <path d="M25 22 L25 30" strokeWidth="1.8" opacity="0.35"/>
                <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5"/>
              </svg>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: '#8cd9a0' }}>p</span>
                  <span style={{ fontSize: 18, fontWeight: 500, color: '#f0ede8' }}>tik</span>
                </div>
                <div style={{
                  fontSize: 9, color: '#d4e4f2', letterSpacing: 1.5,
                  fontFamily: "'Outfit', sans-serif", marginTop: -2, paddingLeft: 2,
                }}>a l e r t s</div>
              </div>
            </div>
            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#8cd9a0',
                background: 'rgba(26,173,94,0.15)', border: '1px solid rgba(26,173,94,0.3)',
                padding: '3px 10px', borderRadius: 20,
              }}>Beta</div>
              <button
                className="login-btn"
                onClick={() => navigate('/login')}
                style={{
                  background: 'none', border: 'none', fontSize: 14, fontWeight: 600,
                  color: '#fff', cursor: 'pointer', padding: 0,
                  fontFamily: "'DM Sans', sans-serif", transition: 'color 0.15s',
                }}
              >Login</button>
            </div>
          </nav>

          {/* Hero content */}
          <div style={{
            position: 'relative', zIndex: 2,
            maxWidth: 560, margin: '0 auto',
            padding: '18px 20px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', gap: 16,
          }}>

            {/* Headline */}
            <h1 className={cls(1)} style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 34, fontWeight: 800,
              color: '#fff', lineHeight: 1.13,
              letterSpacing: '-0.4px', marginTop: 6,
            }}>
              Trade stocks with your{' '}
              <span style={{ color: '#8cd9a0' }}>crew</span>
            </h1>

            {/* Feature pills */}
            <div className={cls(2)} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {['AI research', 'Smart alerts', 'Paper challenge', 'Group chat'].map(f => (
                <div key={f} style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.06)',
                  padding: '5px 12px', borderRadius: 12,
                }}>{f}</div>
              ))}
            </div>

            {/* Spots counter card */}
            <div className={cls(3)} style={{
              width: '100%', maxWidth: 400,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 16, padding: '18px 20px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                  {spotsOpen} of {TOTAL_SPOTS} spots open
                </span>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#8cd9a0',
                  background: 'rgba(26,173,94,0.15)', border: '1px solid rgba(26,173,94,0.3)',
                  padding: '2px 8px', borderRadius: 10, letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>Beta</div>
              </div>

              {/* Progress bar — 4px */}
              <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: '#1AAD5E', borderRadius: 4,
                  transition: 'width 0.6s ease',
                }} />
              </div>

              {/* Form / success */}
              {success ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'rgba(26,173,94,0.15)', border: '2px solid rgba(26,173,94,0.4)',
                    color: '#8cd9a0', fontSize: 17, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✓</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: "'Outfit', sans-serif" }}>
                    You're on the list
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                    We'll reach out when you're in.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="ea-input"
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: '11px 13px', borderRadius: 9,
                      border: '1.5px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff', fontSize: 15,
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'border-color 0.15s',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flexShrink: 0,
                      padding: '11px 15px', borderRadius: 9, border: 'none',
                      background: btnError ? '#E05252' : '#1AAD5E',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      fontFamily: "'Outfit', sans-serif",
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      opacity: submitting ? 0.7 : 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    {submitting ? '…' : btnError || 'Get early access'}
                  </button>
                </form>
              )}
            </div>

            {/* Social proof */}
            <div className={cls(4)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
              <div style={{ display: 'flex' }}>
                {[
                  { l: 'T', bg: 'linear-gradient(135deg,#1AAD5E,#0d8a47)' },
                  { l: 'N', bg: 'linear-gradient(135deg,#4A90D9,#2d6cb5)' },
                  { l: 'D', bg: 'linear-gradient(135deg,#D4A017,#b58a12)' },
                  { l: 'E', bg: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' },
                ].map((a, i) => (
                  <div key={a.l} style={{
                    width: 26, height: 26, borderRadius: '50%',
                    border: '2px solid rgba(19,45,82,0.9)',
                    background: a.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff',
                    marginLeft: i > 0 ? -7 : 0,
                    zIndex: 4 - i, position: 'relative',
                  }}>{a.l}</div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                Join traders already inside
              </span>
            </div>

          </div>
        </section>

        {/* ══════════════════════════════════════
            SECTION 2 — SCREENSHOTS (#eef2f7)
        ══════════════════════════════════════ */}
        <section className={cls(5)} style={{ background: '#eef2f7', padding: '34px 0 32px' }}>
          {/* Label */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
              color: '#7a8ea3', textTransform: 'uppercase',
              fontFamily: "'Outfit', sans-serif",
            }}>Inside the app</span>
          </div>

          {/* Horizontal scroll cards */}
          <div
            className="ss-scroll"
            style={{
              display: 'flex', gap: 18, overflowX: 'auto',
              padding: '4px 24px 12px',
              justifyContent: 'center',
            }}
          >
            {[
              { src: '/screenshot-home.png',      label: 'Live prices & briefings',  desc: 'Market overview at a glance'  },
              { src: '/screenshot-alerts.png',    label: 'AI-powered scanner',       desc: 'Smart alerts & flow signals'  },
              { src: '/screenshot-challenge.png', label: 'Compete with friends',     desc: 'Paper trading leaderboard'    },
            ].map(s => (
              <div key={s.src} style={{
                flexShrink: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}>
                <img
                  src={s.src}
                  alt={s.label}
                  style={{
                    width: 150, height: 'auto',
                    borderRadius: 14,
                    border: '2px solid #1AAD5E',
                    boxShadow: '0 6px 22px rgba(0,0,0,0.1)',
                    display: 'block',
                  }}
                />
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#1a2d4a',
                  textAlign: 'center', fontFamily: "'Outfit', sans-serif",
                }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#7a8ea3', textAlign: 'center' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════
            SECTION 3 — FOOTER
        ══════════════════════════════════════ */}
        <footer className={cls(6)} style={{
          background: '#eef2f7',
          borderTop: '1px solid #d8e2ed',
          padding: '16px 20px',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
        }}>
          <div style={{
            fontSize: 13, fontStyle: 'italic', fontWeight: 600,
            color: '#7a8ea3', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px',
          }}>ONE TEAM, ONE TRADE</div>
          <div style={{ fontSize: 12, color: '#a0b0c0' }}>© 2026 UpTikAlerts</div>
        </footer>

      </div>
    </>
  );
}
