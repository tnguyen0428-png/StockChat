import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WaitlistForm from '../components/WaitlistForm';

const TOTAL_SPOTS = 50;

export default function LandingPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Circle 1 is permanently full (50/50). The only landing-page action is the
  // Circle 2 waitlist below, so the hero CTA simply scrolls to that one form.
  const scrollToWaitlist = () => {
    const section = document.getElementById('circle2-waitlist');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = document.getElementById('waitlist-email');
    if (input) input.focus({ preventScroll: true });
  };

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

        .login-btn:hover { color: #8cd9a0 !important; }

        .ss-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .ss-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#eef2f7', color: '#1a2d4a' }}>

        {/* ══════════════════════════════════════
            BANNER — Circle 1 full (permanent)
        ══════════════════════════════════════ */}
        <div
          role="status"
          style={{
            width: '100%',
            background: '#eef2f7',
            borderBottom: '1px solid #d8e2ed',
            color: '#1a2d4a',
            padding: '10px 16px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            textAlign: 'center',
            letterSpacing: 0.1,
          }}
        >
          <span style={{ marginRight: 4 }} aria-hidden="true">🟢</span>
          <strong style={{ fontWeight: 700 }}>Circle 1 is full</strong>{' '}
          — 50/50 seats taken. Join the waitlist for Circle 2 below.
        </div>

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
            <div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ marginTop: -2 }}>
                  <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5"/>
                  <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6"/>
                  <path d="M25 22 L25 30" strokeWidth="1.8" opacity="0.35"/>
                  <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5"/>
                </svg>
                <div style={{ display: 'flex', alignItems: 'baseline', marginLeft: -4 }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: '#8cd9a0' }}>p</span>
                  <span style={{ fontSize: 18, fontWeight: 500, color: '#f0ede8' }}>tik</span>
                </div>
              </div>
              <div style={{
                fontSize: 9, color: '#d4e4f2', letterSpacing: 1.5,
                fontFamily: "'Outfit', sans-serif", marginTop: -2, paddingLeft: 24,
              }}>a l e r t s</div>
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

            {/* Tagline */}
            <p className={cls(1)} style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16, fontWeight: 400,
              color: '#d4e4f2', letterSpacing: 0.3,
              lineHeight: 1.35, margin: 0,
            }}>
              Learn to invest. <em>Skip the hype.</em>
            </p>

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

            {/* Scarcity card — Circle 1 full, one CTA to the Circle 2 waitlist */}
            <div className={cls(3)} style={{
              width: '100%', maxWidth: 400,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 16, padding: '18px 20px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {/* Label */}
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 12, fontWeight: 600,
                  color: '#d4e4f2', letterSpacing: 1.5,
                }}>
                  BETA · CIRCLE 1
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 16, fontWeight: 600,
                  color: '#fff', letterSpacing: 0.2,
                  marginTop: 4,
                }}>
                  All {TOTAL_SPOTS} seats are full
                </div>
              </div>

              {/* Progress bar — static 100%, matches the "50/50 full" banner */}
              <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '100%',
                  background: '#1AAD5E', borderRadius: 4,
                }} />
              </div>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                marginBottom: 14, fontWeight: 500,
              }}>
                {TOTAL_SPOTS} / {TOTAL_SPOTS} taken
              </div>

              {/* Single CTA → the one canonical waitlist form below */}
              <button
                type="button"
                onClick={scrollToWaitlist}
                style={{
                  width: '100%',
                  padding: '12px 16px', borderRadius: 9, border: 'none',
                  background: '#1AAD5E',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif",
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                Join the Circle 2 waitlist →
              </button>
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
            SECTION 1.5 — CIRCLE 2 WAITLIST FORM
        ══════════════════════════════════════ */}
        <section id="circle2-waitlist" style={{
          background: '#eef2f7',
          padding: '28px 20px 8px',
          display: 'flex',
          justifyContent: 'center',
          scrollMarginTop: 16,
        }}>
          <WaitlistForm source="landing" inputId="waitlist-email" />
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
            style={{ overflowX: 'auto', padding: '4px 0 12px' }}
          >
            {/* fit-content + minWidth:100% centers when it fits, scrolls from the
                start (no clipped first card) when it overflows narrow screens */}
            <div style={{
              display: 'flex', gap: 18,
              width: 'fit-content', minWidth: '100%',
              justifyContent: 'center', boxSizing: 'border-box',
              paddingLeft: 'max(24px, env(safe-area-inset-left))',
              paddingRight: 'max(24px, env(safe-area-inset-right))',
            }}>
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
