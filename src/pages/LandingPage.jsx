import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import WaitlistForm from '../components/WaitlistForm';

const TOTAL_SPOTS = 50;

// Brand palette (light theme, from theme.css) - hardcoded because the public
// landing page renders outside the in-app theme provider.
const NAVY        = '#132d52';
const INK         = '#1a2d4a';
const MUTE        = '#7a8ea3';
const MUTE2       = '#4a6078';
const GREEN       = '#1AAD5E';
const GREEN_SOFT  = '#8cd9a0';
const BLUE        = '#4a90d9';
const SNOWBALL    = '#f0b341';
const BG          = '#eef2f7';
const BORDER      = '#d8e2ed';

// What $10k left untouched in the S&P 500 (~10% avg w/ dividends) would have
// become - pre-computed, lump sum, no contributions. Footnote carries the
// disclaimer.
const SCORECARDS = [
  { years: 10, value: 25937 },
  { years: 20, value: 67275 },
  { years: 30, value: 174494 },
];

// Real app capabilities, pulled from the in-app feature set.
const FEATURES = [
  { icon: '\u{1F4C8}', title: 'The compound engine', desc: 'See exactly how much of your future wealth comes from compounding, not stock picking.' },
  { icon: '\u{1F9ED}', title: 'Sector rankings',      desc: 'Top 15 stocks per sector, scored 0-100 on earnings, fundamentals, growth and value.' },
  { icon: '\u{1F916}', title: 'AI research',          desc: 'Ask anything. Get plain-English definitions, thesis checks and news in seconds.' },
  { icon: '\u{1F3C6}', title: '$50K paper challenge', desc: 'Practice with virtual cash on a live leaderboard before risking a real dollar.' },
  { icon: '\u{1F514}', title: 'Smart alerts',         desc: 'Breakouts, big-money flow and confluence signals, with win-rate stats on each.' },
  { icon: '\u{1F4F0}', title: 'Daily briefing',       desc: 'Five minutes each morning on what moved the market and which tickers it touched.' },
];

// ---------- compound math (lifted from LongTermInvestingCard) ----------

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

function fmtCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + Math.round(n);
}

function niceMax(maxValue) {
  if (maxValue <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const norm = maxValue / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

// Monthly compounding, deposits at the start of each month (how DRIP / auto
// deposit typically works). Returns [{year, total, contributed, gain}, ...].
function buildChartSeries(principal, monthly, ratePct, years) {
  const m = ratePct / 100 / 12;
  const out = [{ year: 0, total: principal, contributed: principal, gain: 0 }];
  let bal = principal;
  let contributed = principal;
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < 12; i++) { bal = bal * (1 + m) + monthly; contributed += monthly; }
    out.push({ year: y, total: bal, contributed, gain: bal - contributed });
  }
  return out;
}

// First year compounded gains meet or exceed contributed dollars ("snowball").
function findSnowball(series) {
  for (let i = 1; i < series.length; i++) {
    if (series[i].gain >= series[i].contributed) return i;
  }
  return null;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [visible, setVisible]     = useState(false);
  const [spotsUsed, setSpotsUsed] = useState(TOTAL_SPOTS);

  // Calculator state
  const [start, setStart]     = useState(5000);
  const [monthly, setMonthly] = useState(300);
  const [years, setYears]     = useState(30);
  const [rate, setRate]       = useState(10);

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

  const series       = useMemo(() => buildChartSeries(start, monthly, rate, years), [start, monthly, rate, years]);
  const snowballYear = useMemo(() => findSnowball(series), [series]);
  const final        = series[series.length - 1];
  const compoundedShare = final.total > 0 ? Math.round((final.gain / final.total) * 100) : 0;

  const cls = (d) => `ls${visible ? ` ls-vis ls-d${d}` : ''}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${BG}; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .ls { opacity: 0; }
        .ls.ls-vis { animation: fadeUp 0.52s ease forwards; }
        .ls.ls-d1 { animation-delay: 0.04s; }
        .ls.ls-d2 { animation-delay: 0.15s; }
        .ls.ls-d3 { animation-delay: 0.26s; }
        .ls.ls-d4 { animation-delay: 0.37s; }
        .ls.ls-d5 { animation-delay: 0.48s; }
        .ls.ls-d6 { animation-delay: 0.58s; }

        .login-btn:hover { color: ${GREEN_SOFT} !important; }
        .cta-btn { transition: transform 0.12s ease, box-shadow 0.12s ease; }
        .cta-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(26,173,94,0.35); }

        .lp-slider { width: 100%; accent-color: ${BLUE}; display: block; margin: 0; height: 22px; }

        .ss-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .ss-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: BG, color: INK, minHeight: '100vh' }}>

        {/* ===== HERO (navy) ===== */}
        <section style={{
          background: `linear-gradient(160deg, ${NAVY} 0%, #1a3a5e 100%)`,
          position: 'relative', overflow: 'hidden', paddingBottom: 40,
        }}>
          {/* Grid + glow overlays */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: `linear-gradient(rgba(140,217,160,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(140,217,160,0.05) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }} />
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 700, height: 480, zIndex: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 50% 20%, rgba(26,173,94,0.17) 0%, transparent 65%)',
          }} />

          {/* Nav */}
          <nav style={{
            position: 'relative', zIndex: 2,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 20px', maxWidth: 620, margin: '0 auto',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 50 50" fill="none" stroke={GREEN_SOFT}
                  strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -2 }}>
                  <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5"/>
                  <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6"/>
                  <path d="M25 22 L25 30" strokeWidth="1.8" opacity="0.35"/>
                  <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5"/>
                </svg>
                <div style={{ display: 'flex', alignItems: 'baseline', marginLeft: -4 }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: GREEN_SOFT }}>p</span>
                  <span style={{ fontSize: 18, fontWeight: 500, color: '#f0ede8' }}>tik</span>
                </div>
              </div>
              <div style={{
                fontSize: 9, color: '#d4e4f2', letterSpacing: 1.5,
                fontFamily: "'Outfit', sans-serif", marginTop: -2, paddingLeft: 24,
              }}>a l e r t s</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: GREEN_SOFT,
                background: 'rgba(26,173,94,0.15)', border: '1px solid rgba(26,173,94,0.3)',
                padding: '3px 10px', borderRadius: 20,
              }}>Beta</div>
              <button className="login-btn" onClick={() => navigate('/login')} style={{
                background: 'none', border: 'none', fontSize: 14, fontWeight: 600,
                color: '#fff', cursor: 'pointer', padding: 0,
                fontFamily: "'DM Sans', sans-serif", transition: 'color 0.15s',
              }}>Login</button>
            </div>
          </nav>

          {/* Hero content */}
          <div style={{
            position: 'relative', zIndex: 2, maxWidth: 580, margin: '0 auto',
            padding: '20px 20px 0', display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center', gap: 16,
          }}>
            <div className={cls(1)} style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase',
              color: GREEN_SOFT, fontFamily: "'Outfit', sans-serif",
            }}>Invest for the long run</div>

            <h1 className={cls(1)} style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 36, fontWeight: 800,
              color: '#fff', lineHeight: 1.12, letterSpacing: '-0.5px', maxWidth: 480,
            }}>
              Let your money{' '}
              <span style={{ color: GREEN_SOFT }}>compound</span>
            </h1>

            <p className={cls(1)} style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 400,
              color: '#d4e4f2', letterSpacing: 0.2, lineHeight: 1.45, margin: 0, maxWidth: 420,
            }}>
              Skip the hype. Learn to invest patiently with a crew, and watch the snowball do the heavy lifting.
            </p>

            <div className={cls(2)} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {['Compound calculator', 'Sector rankings', 'AI research', 'Paper challenge'].map(f => (
                <div key={f} style={{
                  fontSize: 13, color: 'rgba(255,255,255,0.55)',
                  background: 'rgba(255,255,255,0.06)', padding: '5px 12px', borderRadius: 12,
                }}>{f}</div>
              ))}
            </div>

            <a href="#start" className={cls(2) + ' cta-btn'} style={{
              marginTop: 4, textDecoration: 'none',
              background: GREEN, color: '#fff',
              fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15,
              padding: '13px 30px', borderRadius: 999,
              boxShadow: '0 6px 18px rgba(26,173,94,0.3)',
            }}>Start the long game &rarr;</a>

            {/* Social proof */}
            <div className={cls(2)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
              <div style={{ display: 'flex' }}>
                {[
                  { l: 'T', bg: 'linear-gradient(135deg,#1AAD5E,#0d8a47)' },
                  { l: 'N', bg: 'linear-gradient(135deg,#4A90D9,#2d6cb5)' },
                  { l: 'D', bg: 'linear-gradient(135deg,#D4A017,#b58a12)' },
                  { l: 'E', bg: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' },
                ].map((a, i) => (
                  <div key={a.l} style={{
                    width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(19,45,82,0.9)',
                    background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff',
                    marginLeft: i > 0 ? -7 : 0, zIndex: 4 - i, position: 'relative',
                  }}>{a.l}</div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                Join traders already inside
              </span>
            </div>
          </div>
        </section>

        {/* ===== COMPOUND CALCULATOR (the centerpiece) ===== */}
        <section className={cls(3)} style={{ background: BG, padding: '34px 20px 8px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: MUTE,
                textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif",
              }}>The power of compound returns</span>
              <h2 style={{
                fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 800,
                color: INK, letterSpacing: '-0.3px', margin: '8px 0 6px', lineHeight: 1.2,
              }}>Move the sliders. Watch it snowball.</h2>
              <p style={{ fontSize: 14, color: MUTE2, lineHeight: 1.5, margin: 0 }}>
                Over a decade or two, compounding, not stock picking, does most of the work.
              </p>
            </div>

            <CompoundCard
              start={start} setStart={setStart}
              monthly={monthly} setMonthly={setMonthly}
              years={years} setYears={setYears}
              rate={rate} setRate={setRate}
              series={series} snowballYear={snowballYear}
              final={final} compoundedShare={compoundedShare}
            />
          </div>
        </section>

        {/* ===== S&P SCORECARDS ===== */}
        <section className={cls(4)} style={{ background: BG, padding: '28px 20px 4px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: MUTE,
                textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif",
              }}>History favors the patient</span>
              <p style={{ fontSize: 14, color: MUTE2, lineHeight: 1.5, margin: '8px 0 0' }}>
                What a single $10,000 buy in the S&amp;P 500 would be worth today.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {SCORECARDS.map(c => (
                <div key={c.years} style={{
                  background: '#fff', borderRadius: 12, padding: '14px 8px',
                  border: `1px solid ${BORDER}`, textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(19,45,82,0.04)',
                }}>
                  <div style={{ fontSize: 11, color: MUTE, marginBottom: 5 }}>{c.years} years ago</div>
                  <div style={{
                    fontSize: 19, fontWeight: 700, color: GREEN,
                    fontFamily: "'Outfit', sans-serif", fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>{fmt(c.value)}</div>
                  <div style={{ fontSize: 9, color: MUTE, marginTop: 3 }}>at ~10% avg</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section className={cls(5)} style={{ background: BG, padding: '32px 20px 8px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: MUTE,
                textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif",
              }}>Everything you need to stay the course</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {FEATURES.map(f => (
                <div key={f.title} style={{
                  background: '#fff', borderRadius: 14, padding: '16px 14px',
                  border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(19,45,82,0.04)',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }} aria-hidden="true">{f.icon}</div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4,
                    fontFamily: "'Outfit', sans-serif",
                  }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: MUTE2, lineHeight: 1.45 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== SCREENSHOTS ===== */}
        <section className={cls(5)} style={{ background: BG, padding: '32px 0 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: MUTE,
              textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif",
            }}>Inside the app</span>
          </div>
          <div className="ss-scroll" style={{
            display: 'flex', gap: 18, overflowX: 'auto', padding: '4px 24px 12px', justifyContent: 'flex-start',
          }}>
            <div style={{ flexShrink: 0, width: 'max(0px, calc((100% - 486px) / 2))' }} aria-hidden="true" />
            {[
              { src: '/screenshot-home.png',      label: 'Live prices & briefings', desc: 'Market overview at a glance' },
              { src: '/screenshot-alerts.png',    label: 'AI-powered scanner',      desc: 'Smart alerts & flow signals' },
              { src: '/screenshot-challenge.png', label: 'Compete with friends',    desc: 'Paper trading leaderboard' },
            ].map(s => (
              <div key={s.src} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <img src={s.src} alt={s.label} style={{
                  width: 150, height: 'auto', borderRadius: 14,
                  border: `2px solid ${GREEN}`, boxShadow: '0 6px 22px rgba(0,0,0,0.1)', display: 'block',
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>{s.label}</div>
                <div style={{ fontSize: 12, color: MUTE, textAlign: 'center' }}>{s.desc}</div>
              </div>
            ))}
            <div style={{ flexShrink: 0, width: 'max(0px, calc((100% - 486px) / 2))' }} aria-hidden="true" />
          </div>
        </section>

        {/* ===== WAITLIST ===== */}
        <section id="start" className={cls(6)} style={{
          background: BG, padding: '24px 20px 8px', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 14, scrollMarginTop: 12,
        }}>
          {/* Spots indicator */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 13, fontWeight: 500, color: MUTE2,
            background: '#fff', border: `1px solid ${BORDER}`,
            padding: '7px 14px', borderRadius: 999,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
            <strong style={{ fontWeight: 700, color: INK }}>
              {Math.min(spotsUsed, TOTAL_SPOTS)}/{TOTAL_SPOTS}
            </strong>{' '}Circle 1 seats taken &mdash; join Circle 2 below
          </div>
          <WaitlistForm source="landing" />
        </section>

        {/* ===== FOOTER ===== */}
        <footer className={cls(6)} style={{
          background: BG, borderTop: `1px solid ${BORDER}`, marginTop: 24,
          padding: '18px 20px calc(18px + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
        }}>
          <div style={{
            fontSize: 13, fontStyle: 'italic', fontWeight: 600, color: MUTE,
            fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px',
          }}>ONE TEAM, ONE TRADE</div>
          <div style={{ fontSize: 12, color: '#a0b0c0' }}>(c) 2026 UpTikAlerts</div>
        </footer>

      </div>
    </>
  );
}

// =====================================================
//  CompoundCard - interactive calculator + skyline chart
// =====================================================

function CompoundCard({ start, setStart, monthly, setMonthly, years, setYears, rate, setRate, series, snowballYear, final, compoundedShare }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18, border: `1px solid ${BORDER}`,
      padding: '18px 18px 20px', boxShadow: '0 8px 28px rgba(19,45,82,0.07)',
    }}>
      {/* Result hero */}
      <div style={{
        background: 'rgba(74,144,217,0.08)', border: '1px solid rgba(74,144,217,0.25)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, color: BLUE, marginBottom: 3 }}>After {years} years</div>
        <div style={{
          fontSize: 30, fontWeight: 800, color: BLUE, fontFamily: "'Outfit', sans-serif",
          fontVariantNumeric: 'tabular-nums', lineHeight: 1.05, letterSpacing: '-0.5px',
        }}>{fmt(final.total)}</div>
        <div style={{ fontSize: 12, color: BLUE, opacity: 0.9, marginTop: 6, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(final.contributed)} contributed &middot; {fmt(final.gain)} gained<br />
          <strong style={{ fontWeight: 700 }}>{compoundedShare}%</strong> of your total came from compounding
        </div>
      </div>

      {/* Sliders */}
      <SliderRow label="Starting amount"       value={start}   min={0}    max={100000} step={500}  onChange={setStart}   display={fmt(start)} />
      <SliderRow label="Monthly contribution"  value={monthly} min={0}    max={5000}   step={50}   onChange={setMonthly} display={fmt(monthly)} />
      <SliderRow label="Years invested"        value={years}   min={5}    max={40}     step={1}    onChange={setYears}   display={`${years} yrs`} />
      <SliderRow label="Annual return"         value={rate}    min={3}    max={20}     step={0.5}  onChange={setRate}    display={`${rate.toFixed(1)}%`} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUTE, margin: '0 0 16px' }}>
        <span>3% bonds</span><span>10% S&amp;P avg</span><span>20% growth</span>
      </div>

      {/* Chart */}
      <SkylineBars series={series} snowballYear={snowballYear} years={years} />

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: MUTE, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: BLUE, display: 'inline-block' }} />Gains
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2, border: `1px solid ${BLUE}`,
            background: `repeating-linear-gradient(45deg, ${BLUE}, ${BLUE} 1.5px, transparent 1.5px, transparent 3px)`,
            display: 'inline-block',
          }} />Contributions
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: SNOWBALL, display: 'inline-block' }} />Snowball year
        </span>
      </div>

      <div style={{ fontSize: 10, color: MUTE, lineHeight: 1.5, fontStyle: 'italic', marginTop: 12 }}>
        The S&amp;P 500 has averaged ~10% annual returns since 1928 with dividends reinvested (~7% after inflation). Past performance does not guarantee future results.
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, display }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: MUTE2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{display}</span>
      </div>
      <input
        type="range" className="lp-slider"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

// Skyline bars: hatched contributions on the bottom, solid blue gains stacked
// on top, snowball year in warm yellow with a glow column + dashed marker.
// No scrub interaction (kept simple for the public page); a fixed tooltip in
// the top-right shows the projected total.
function SkylineBars({ series, snowballYear, years }) {
  const W = 336, H = 200;
  const padL = 38, padR = 10, padT = 24, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const gap = years <= 10 ? 3 : years <= 20 ? 2 : 1;
  const barWidth = (innerW - gap * years) / (years + 1);

  const maxV = useMemo(() => niceMax(series.reduce((a, p) => Math.max(a, p.total), 0)), [series]);

  const xFor = (i) => padL + (barWidth + gap) * i;
  const yFor = (v) => padT + innerH - (maxV > 0 ? (v / maxV) * innerH : 0);
  const baseline = padT + innerH;

  const final = series[series.length - 1];
  const snowballBarX = snowballYear !== null ? xFor(snowballYear) : 0;
  const snowballBarCx = snowballBarX + barWidth / 2;

  const xTicks = useMemo(() => {
    const ticks = [0, Math.round(years / 4), Math.round(years / 2), Math.round((3 * years) / 4), years];
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [years]);

  // Snowball pill clamped so it never runs off the left edge or under the tooltip.
  const ttW = 80, ttX = W - padR - ttW;
  const pillW = 92;
  const pillX = snowballYear !== null
    ? Math.max(padL, Math.min(ttX - 4 - pillW, snowballBarCx - pillW / 2))
    : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
      aria-label={`Projected growth over ${years} years, ending at ${fmtCompact(final.total)}`}>
      <defs>
        <pattern id="lp-hatch" patternUnits="userSpaceOnUse" width="6" height="6">
          <path d="M -1 7 L 7 -1 M -1 1 L 1 -1 M 5 7 L 7 5" stroke={BLUE} strokeWidth="1.5" />
        </pattern>
        <linearGradient id="lp-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SNOWBALL} stopOpacity="0" />
          <stop offset="50%" stopColor={SNOWBALL} stopOpacity="0.25" />
          <stop offset="100%" stopColor={SNOWBALL} stopOpacity="0" />
        </linearGradient>
      </defs>

      {snowballYear !== null && (
        <rect x={snowballBarX - 4} y={padT - 8} width={barWidth + 8} height={innerH + 16} fill="url(#lp-glow)" />
      )}

      {/* Gridlines + Y labels */}
      {[0, maxV / 2, maxV].map((v, i) => (
        <line key={`g${i}`} x1={padL} x2={W - padR} y1={yFor(v)} y2={yFor(v)}
          stroke={BORDER} strokeWidth="1" strokeDasharray={i === 0 ? '0' : '2 4'} opacity={i === 0 ? 0.95 : 0.7} />
      ))}
      {[0, maxV / 2, maxV].map((v, i) => (
        <text key={`yl${i}`} x={padL - 6} y={yFor(v) + 3} fontSize="10" fontFamily="'Outfit', sans-serif"
          fontWeight="500" fill={MUTE} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(v)}</text>
      ))}

      {/* Bars */}
      {series.map((p, i) => {
        const x = xFor(i);
        const yTop = yFor(p.total);
        const yMid = yFor(p.contributed);
        const isSnowball = i === snowballYear;
        return (
          <g key={`b${i}`}>
            {yMid < baseline && <rect x={x} y={yMid} width={barWidth} height={Math.max(0, baseline - yMid)} fill="url(#lp-hatch)" />}
            {yTop < yMid && <rect x={x} y={yTop} width={barWidth} height={Math.max(0, yMid - yTop)} fill={isSnowball ? SNOWBALL : BLUE} />}
          </g>
        );
      })}

      {/* Snowball marker + pill */}
      {snowballYear !== null && (
        <>
          <line x1={snowballBarCx} x2={snowballBarCx} y1={padT - 2} y2={baseline + 2}
            stroke={SNOWBALL} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
          <g>
            <rect x={pillX} y={6} width={pillW} height={14} rx="3" fill={SNOWBALL} />
            <text x={pillX + pillW / 2} y={16} fontSize="9" fontFamily="'Outfit', sans-serif"
              fontWeight="700" fill="#0f1d2e" textAnchor="middle" letterSpacing="0.04em">
              SNOWBALL &middot; YR {snowballYear}
            </text>
          </g>
        </>
      )}

      {/* X labels */}
      {xTicks.map((yr, i) => (
        <text key={`xl${i}`} x={xFor(yr) + barWidth / 2} y={H - 9} fontSize="10" fontFamily="'Outfit', sans-serif"
          fontWeight="500" fill={MUTE} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>{yr}</text>
      ))}

      {/* Tooltip (final value) */}
      <g>
        <rect x={ttX} y={4} width={ttW} height={26} rx="4" fill="#0f1d2e" />
        <text x={ttX + 6} y={15} fontSize="9" fontFamily="'Outfit', sans-serif" fill="rgba(255,255,255,0.55)">YR {final.year}</text>
        <text x={ttX + ttW - 6} y={26} fontSize="11" fontFamily="'Outfit', sans-serif" fontWeight="600" fill="#fff"
          textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(final.total)}</text>
      </g>
    </svg>
  );
}
