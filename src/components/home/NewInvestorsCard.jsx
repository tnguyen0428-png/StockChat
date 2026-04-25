// ============================================
// UPTIKALERTS — NewInvestorsCard.jsx
// Content-only renderer for the New Investors view inside the stocks card.
// The parent (HomeTab) provides the outer card chrome via stocksCard style;
// this component just renders the progress strip and the six expandable step
// rows. Each step's "Try it" CTA routes back through onStepAction so the
// parent decides whether to navigate tabs, scroll, or open menus.
// ============================================

import { useState } from 'react';

const STEPS = [
  {
    key: 'sector',
    title: 'Pick a sector',
    tabLabel: null,
    lead: 'A sector is a slice of the market — tech, healthcare, energy, finance. Picking one to focus on is how most investors learn faster.',
    bullets: [
      'Top 15 stocks per sector, ranked by a weighted score from 0 to 100',
      'Earnings (30%) — beat rate over the last 8 quarters + EPS growth year over year',
      'Fundamentals (25%) — net and gross profit margins (60%) plus debt-to-equity (40%)',
      'Sales growth (20%) — revenue year over year',
      'Valuation (10%) — Price-to-Earnings plus PEG (Price/Earnings to Growth)',
      'Price trend (10%) — where today\'s price sits in the 6-month range',
      'Market cap (5%) — size tier; large-caps score higher',
    ],
    cta: 'Open the Sectors menu →',
  },
  {
    key: 'chat',
    title: 'Join the chat',
    tabLabel: 'Chat',
    lead: 'Ask anything — the group is full of investors at every level, and the AI is always on for quick definitions or thesis checks.',
    bullets: [
      'Search past discussions for ticker insights',
      'AI answers questions about any stock',
      'Tag a name to start a focused thread',
    ],
    cta: 'Go to Chat →',
  },
  {
    key: 'watchlist',
    title: 'Build a watchlist',
    tabLabel: null,
    lead: 'A watchlist is your shortlist of names worth following. Tracking before you buy is what separates investing from gambling.',
    bullets: [
      'Live prices and daily change at a glance',
      'Add or remove anytime — no commitment',
      'Powers your alerts and briefings',
    ],
    cta: 'Open Watchlist →',
  },
  {
    key: 'challenge',
    title: 'Join the portfolio challenge',
    tabLabel: 'Challenge',
    lead: 'Practice with $50K of virtual cash before risking real money. Your decisions, the live market, no real downside.',
    bullets: [
      'Buy and sell with real-time prices',
      'See your trades on a leaderboard',
      'Learn what your strategy actually does',
    ],
    cta: 'Go to Challenge →',
  },
  {
    key: 'alerts',
    title: 'Monitor alerts',
    tabLabel: 'Alerts',
    lead: 'Alerts surface unusual market activity in real time — breakouts, big-money flow, confluence signals. The signal you would miss otherwise.',
    bullets: [
      'Tap a chip to see why it triggered',
      'Win-rate stats show how each signal type tends to play out',
      'Filter by signal type or time window',
    ],
    cta: 'Open Alerts →',
  },
  {
    key: 'briefing',
    title: 'Read the daily briefing',
    tabLabel: null,
    lead: 'Five minutes every morning to see what moved the market, what the news cycle is fixated on, and which tickers it touches.',
    bullets: [
      'Curated headlines with ticker tags',
      'Mood pill shows risk-on / risk-off / mixed',
      'Builds context before you trade',
    ],
    cta: 'Read the briefing →',
  },
];

export default function NewInvestorsCard({
  t,
  watchlist,
  trades,
  sectorPicked,
  chatDone,
  alertsVisited,
  briefingEngaged,
  onStepAction,
}) {
  const [openStep, setOpenStep] = useState(null);

  // Auto-detection — derived, not stored. `sectorPicked` is the persistent
  // `onboarding.sectors` flag from profiles (set by HomeTab's useEffect the
  // first time a real sector is selected). Using current `researchSector`
  // would cause the ✓ to disappear whenever the user toggles back to
  // Watchlist or to the New Investors view itself.
  const isDone = (key) => {
    if (key === 'sector')    return !!sectorPicked;
    if (key === 'chat')      return !!chatDone;
    if (key === 'watchlist') return (watchlist?.length || 0) > 0;
    if (key === 'challenge') return (trades?.length || 0) > 0;
    if (key === 'alerts')    return !!alertsVisited;
    if (key === 'briefing')  return !!briefingEngaged;
    return false;
  };

  const completed = STEPS.filter(s => isDone(s.key)).length;

  return (
    <div>
      {/* Progress strip — mirrors stocksHeaderRow visually so the section
          feels continuous with the Watchlist / Sectors header style. */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${t.border}`,
        background: t.surface,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 600, color: t.text3,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>Your progress</span>
        <span style={{
          fontSize: 11, color: t.text3,
          fontVariantNumeric: 'tabular-nums',
        }}>{completed} of {STEPS.length} done</span>
      </div>

      {/* Step rows */}
      {STEPS.map((step, i) => {
        const done = isDone(step.key);
        const stepOpen = openStep === step.key;
        return (
          <div key={step.key} style={{
            borderBottom: i < STEPS.length - 1 ? `1px solid ${t.border}` : 'none',
          }}>
            {/* Step row */}
            <div
              onClick={() => setOpenStep(prev => (prev === step.key ? null : step.key))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: done
                  ? 'rgba(26,173,94,0.15)'
                  : stepOpen ? 'rgba(74,144,217,0.15)' : t.surface,
                color: done ? '#1AAD5E' : stepOpen ? '#4a90d9' : t.text3,
                border: `1px solid ${done ? 'rgba(26,173,94,0.3)' : t.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                fontFamily: "'Outfit', sans-serif",
              }}>{done ? '✓' : (i + 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: t.text1, lineHeight: 1.3,
                }}>{step.title}</div>
              </div>
              {step.tabLabel && (
                <span style={{
                  fontSize: 9, fontWeight: 600,
                  color: '#4a90d9',
                  background: 'rgba(74,144,217,0.1)',
                  padding: '2px 6px', borderRadius: 999,
                  letterSpacing: 0.3, flexShrink: 0,
                }}>{step.tabLabel}</span>
              )}
              <span style={{ fontSize: 11, color: t.text3, flexShrink: 0 }}>
                {stepOpen ? '▴' : '▾'}
              </span>
            </div>

            {/* Step body — educational copy + Try it */}
            {stepOpen && (
              <div style={{
                padding: '0 12px 14px 44px',
                background: t.surface,
              }}>
                <p style={{
                  fontSize: 12, color: t.text1, lineHeight: 1.55,
                  margin: '10px 0 8px',
                }}>{step.lead}</p>
                {step.bullets.map((b, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 11, color: t.text2,
                    padding: '3px 0', lineHeight: 1.45,
                  }}>
                    <span style={{ color: t.text3, flexShrink: 0 }}>·</span>
                    <span>{b}</span>
                  </div>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); onStepAction?.(step.key); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(74,144,217,0.1)',
                    color: '#4a90d9',
                    border: '0.5px solid rgba(74,144,217,0.3)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 11, fontWeight: 600,
                    marginTop: 10,
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >{step.cta}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
