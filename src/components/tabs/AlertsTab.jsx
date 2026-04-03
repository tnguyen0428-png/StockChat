// ============================================
// UPTIKALERTS — AlertsTab.jsx
// Breakout alerts feed
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { run52wHighScan, DEFAULT_THRESHOLD, runVolSurgeScan, DEFAULT_VOL_MULTIPLIER, runGapUpScan, DEFAULT_GAP_THRESHOLD, runMACrossScan, DEFAULT_SHORT_MA, DEFAULT_LONG_MA } from '../../lib/breakoutScanner';
import { useGroup } from '../../context/GroupContext';

// ── Swipeable card wrapper ──────────────────────────────────────────

const SWIPE_THRESHOLD = 80;

function SwipeableCard({ children, alertId }) {
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });
  const [offsetX, setOffsetX] = useState(0);
  const [confirmed, setConfirmed] = useState(null);
  const cardRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, swiping: false };
  }, []);

  const handleTouchMove = useCallback((e) => {
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (!touchRef.current.swiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.swiping = true;
    }
    if (touchRef.current.swiping) {
      e.preventDefault();
      const clamped = dx > 0
        ? Math.min(dx, SWIPE_THRESHOLD + (dx - SWIPE_THRESHOLD) * 0.3)
        : Math.max(dx, -SWIPE_THRESHOLD + (dx + SWIPE_THRESHOLD) * 0.3);
      setOffsetX(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchRef.current.swiping) { setOffsetX(0); return; }
    if (offsetX >= SWIPE_THRESHOLD) {
      // TODO: Wire to user_watchlist table
      setConfirmed('watchlist');
      setOffsetX(0);
      setTimeout(() => setConfirmed(null), 900);
    } else if (offsetX <= -SWIPE_THRESHOLD) {
      setConfirmed('dismiss');
      setOffsetX(0);
      setTimeout(() => setConfirmed(null), 900);
    } else {
      setOffsetX(0);
    }
    touchRef.current.swiping = false;
  }, [offsetX]);

  return (
    <div ref={cardRef} style={swipeStyles.wrapper}>
      <div style={swipeStyles.actionLayer}>
        <div style={{ ...swipeStyles.actionLeft, opacity: offsetX > 20 ? Math.min((offsetX - 20) / 60, 1) : 0 }}>
          + Watchlist
        </div>
        <div style={{ ...swipeStyles.actionRight, opacity: offsetX < -20 ? Math.min((-offsetX - 20) / 60, 1) : 0 }}>
          Dismiss
        </div>
      </div>
      {confirmed && (
        <div style={{ ...swipeStyles.toast, background: confirmed === 'watchlist' ? '#16A34A' : '#6B7280' }}>
          {confirmed === 'watchlist' ? 'Added to Watchlist' : 'Dismissed'}
        </div>
      )}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: touchRef.current.swiping ? 'none' : 'transform 0.25s ease',
          position: 'relative', zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const swipeStyles = {
  wrapper: { position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 10 },
  actionLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    pointerEvents: 'none', zIndex: 0,
  },
  actionLeft: {
    background: '#16A34A', color: '#fff', fontWeight: 700, fontSize: 13,
    padding: '0 18px', height: '100%', display: 'flex', alignItems: 'center',
    borderRadius: '12px 0 0 12px',
  },
  actionRight: {
    background: '#9CA3AF', color: '#fff', fontWeight: 700, fontSize: 13,
    padding: '0 18px', height: '100%', display: 'flex', alignItems: 'center',
    marginLeft: 'auto', borderRadius: '0 12px 12px 0',
  },
  toast: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)', color: '#fff', fontWeight: 700,
    fontSize: 12, padding: '6px 16px', borderRadius: 20, zIndex: 10,
    pointerEvents: 'none', animation: 'fadeInOut 0.9s ease forwards',
  },
};

// ── Sparkline ───────────────────────────────────────────────────────

function Sparkline({ prices, fullWidth, enhanced, support, resistance, alertPrice }) {
  if (!prices || prices.length < 2) return null;

  // Simple mode (history cumulative sparkline, etc.)
  if (!enhanced) {
    const W = fullWidth ? 400 : 120;
    const H = fullWidth ? 36 : 32;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const pts = prices.map((p, i) =>
      `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * (H - 2) - 1}`
    ).join(' ');
    const color = prices[prices.length - 1] >= prices[0] ? '#16A34A' : '#DC2626';
    return (
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', flexShrink: 0, width: fullWidth ? '100%' : W, height: fullWidth ? 36 : H }}
        preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  // Enhanced mode — full chart with gradient fill, S/R lines, alert dot, tap tooltip
  const W = 400, H = 64, PAD = 1;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const trendUp = prices[prices.length - 1] >= prices[0];
  const color = trendUp ? '#16A34A' : '#DC2626';
  const gradId = trendUp ? 'sparkFillUp' : 'sparkFillDown';

  const coords = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * W,
    y: H - ((p - min) / range) * (H - PAD * 2) - PAD,
    price: p,
  }));
  const linePts = coords.map(c => `${c.x},${c.y}`).join(' ');
  const fillPts = `0,${H} ${linePts} ${W},${H}`;

  // Support / resistance Y positions
  const srLines = [];
  if (support != null && support >= min && support <= max) {
    srLines.push({ y: H - ((support - min) / range) * (H - PAD * 2) - PAD, label: 'S', color: '#16A34A', price: support });
  }
  if (resistance != null && resistance >= min && resistance <= max) {
    srLines.push({ y: H - ((resistance - min) / range) * (H - PAD * 2) - PAD, label: 'R', color: '#DC2626', price: resistance });
  }

  // Alert trigger dot — closest data point to alertPrice
  let alertDot = null;
  if (alertPrice != null) {
    let closest = 0;
    let closestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.price - alertPrice);
      if (d < closestDist) { closestDist = d; closest = i; }
    });
    alertDot = coords[closest];
  }

  // Tap tooltip state via ref
  const [tapInfo, setTapInfo] = useState(null);
  const svgRef = useRef(null);

  const handleTouch = useCallback((e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches[0].clientX;
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const idx = Math.round(pct * (prices.length - 1));
    const c = coords[idx];
    if (c) setTapInfo({ x: c.x, y: c.y, price: c.price });
  }, [coords, prices.length]);

  return (
    <div>
      {/* Price labels above chart */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px 4px', fontSize: 11 }}>
        <span style={{ color: 'var(--text3)' }}>${prices[0].toFixed(2)}</span>
        <span style={{ color: 'var(--text1)', fontWeight: 700 }}>${prices[prices.length - 1].toFixed(2)}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: 64, padding: '8px 0' }}
        preserveAspectRatio="none"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setTapInfo(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill gradient */}
        <polygon points={fillPts} fill={`url(#${gradId})`} />
        {/* Support / resistance dashed lines */}
        {srLines.map(sr => (
          <g key={sr.label}>
            <line x1={0} y1={sr.y} x2={W} y2={sr.y}
              stroke={sr.color} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.5" />
            <text x={W - 2} y={sr.y - 2} textAnchor="end"
              fontSize="7" fontWeight="700" fill={sr.color} opacity="0.7">
              {sr.label}
            </text>
          </g>
        ))}
        {/* Main line */}
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Alert trigger dot */}
        {alertDot && (
          <circle cx={alertDot.x} cy={alertDot.y} r="3" fill={color} stroke="#fff" strokeWidth="1" />
        )}
        {/* Tap crosshair + tooltip */}
        {tapInfo && (
          <g>
            <line x1={tapInfo.x} y1={0} x2={tapInfo.x} y2={H}
              stroke="var(--text3)" strokeWidth="0.7" strokeDasharray="2 2" />
            <rect x={tapInfo.x - 22} y={Math.max(tapInfo.y - 14, 0)}
              width="44" height="12" rx="3" fill="var(--text1)" opacity="0.85" />
            <text x={tapInfo.x} y={Math.max(tapInfo.y - 5, 9)}
              textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
              ${tapInfo.price.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Fear Index gauge ────────────────────────────────────────────────

// TODO: Replace with live VIX API data
const MOCK_FEAR_SCORE = 18.42;

function getFearSentiment(score) {
  if (score > 30) return { label: 'Extreme Fear',  color: '#DC2626' };
  if (score > 20) return { label: 'Fear',           color: '#EA580C' };
  if (score > 15) return { label: 'Neutral',        color: '#CA8A04' };
  if (score > 10) return { label: 'Greed',          color: '#65A30D' };
  return                 { label: 'Extreme Greed',  color: '#16A34A' };
}

function FearIndex({ score = MOCK_FEAR_SCORE }) {
  const { label, color } = getFearSentiment(score);
  const cx = 100, cy = 90, r = 74;
  const pct  = Math.min(Math.max(score / 50, 0), 1);
  const aRad = Math.PI * (1 - pct);
  const tipX = cx + (r - 10) * Math.cos(aRad);
  const tipY = cy - (r - 10) * Math.sin(aRad);

  return (
    <div style={{ marginBottom: 10 }}>
      <svg viewBox="0 0 200 105" style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: 210 }}>
        <defs>
          <linearGradient id="fearGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#16A34A" />
            <stop offset="35%"  stopColor="#84CC16" />
            <stop offset="55%"  stopColor="#EAB308" />
            <stop offset="75%"  stopColor="#EA580C" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="url(#fearGrad)" strokeWidth="10" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY}
          stroke="#374151" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#374151" />
        <text x={cx} y={cy - 10} textAnchor="middle"
          fontSize="22" fontWeight="700" style={{ fill: 'var(--text1)' }}>
          {score.toFixed(2)}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle"
          fontSize="9" fontWeight="700" letterSpacing="1" style={{ fill: color }}>
          {label.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

// ── Sector Heat Map ─────────────────────────────────────────────────

// TODO: Replace with FMP sector performance API
const MOCK_SECTORS = [
  { name: 'Technology',  perf: 3.12 },
  { name: 'Healthcare',  perf: -0.87 },
  { name: 'Energy',      perf: 1.45 },
  { name: 'Financials',  perf: 0.63 },
  { name: 'Consumer',    perf: -1.54 },
  { name: 'Industrials', perf: 2.08 },
];

function sectorColor(perf) {
  const t = Math.min(Math.max((perf + 2) / 6, 0), 1);
  const r = Math.round(220 - t * 186);
  const g = Math.round(34 + t * 129);
  const b = Math.round(34 + t * 4);
  return `rgb(${r},${g},${b})`;
}

function SectorHeatMap({ sectors = MOCK_SECTORS }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.secLabel}>Sector Performance</div>
      <div style={heatStyles.grid}>
        {sectors.map(s => (
          <div key={s.name} style={{ ...heatStyles.tile, background: sectorColor(s.perf) }}>
            <span style={heatStyles.tileName}>{s.name}</span>
            <span style={heatStyles.tilePerf}>{s.perf >= 0 ? '+' : ''}{s.perf.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const heatStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  tile: {
    borderRadius: 8, padding: '14px 10px', minHeight: 56,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  tileName: {
    fontSize: 10, fontWeight: 600, color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.9,
  },
  tilePerf: { fontSize: 14, fontWeight: 700, color: '#fff' },
};

// ── Mock data ───────────────────────────────────────────────────────

// TODO: Replace MOCK_ALERTS with live API data
// TODO: Calculate rsVsSpy from live SPY data
const MOCK_ALERTS = [
  { id: 'mock-1', ticker: 'NVDA', name: 'Nvidia Corp',             alert_type: '52w_high',  price: 875.40, change: 2.14, volume: '41.2M',  time: '9:47 AM',   timeGroup: 'morning',    signal: 'Within 1.8% of 52-week high of $891.46',    confidence: 91, support: 848.00, resistance: 891.46, sector: 'Semiconductors',      recentPrices: [843,849,852,848,855,861,858,864,869,866,871,875],                  context: 'Designs GPUs powering AI data centers, autonomous vehicles, and PC gaming.',                             confidenceReason: 'High confidence: price within 2% of 52W high with strong institutional volume and no distribution days.',                  rsVsSpy: 1.42 },
  { id: 'mock-2', ticker: 'SMCI', name: 'Super Micro Computer',    alert_type: 'vol_surge', price: 92.17,  change: 5.31, volume: '38.1M',  time: '10:03 AM',  timeGroup: 'morning',    signal: 'Volume surging 4.2x 30-day average',          confidence: 78, support: 84.50,  resistance: 98.00,  sector: 'Technology Hardware', recentPrices: [81,83,82,84,85,83,86,87,88,86,89,91,92],                           context: 'Builds high-performance server and storage systems optimized for AI workloads.',                             confidenceReason: 'Moderate confidence: strong volume surge but price still below key resistance at $98.',                                     rsVsSpy: 4.59 },
  { id: 'mock-3', ticker: 'PLTR', name: 'Palantir Technologies',   alert_type: 'gap_up',    price: 24.88,  change: 4.63, volume: '29.7M',  time: '9:31 AM',   timeGroup: 'morning',    signal: 'Opened $1.10 above prior close of $23.78',    confidence: 85, support: 22.40,  resistance: 26.50,  sector: 'Software',            recentPrices: [22.8,23.1,23.0,23.4,23.2,23.7,23.6,24.0,24.2,24.5,24.7,24.88],   context: 'Provides AI-driven data analytics platforms to governments and large enterprises.',                           confidenceReason: 'High confidence: clean gap above prior consolidation zone with above-average volume confirming the move.',                  rsVsSpy: 3.91 },
  { id: 'mock-4', ticker: 'CRWD', name: 'CrowdStrike Holdings',    alert_type: 'ma_cross',  price: 334.50, change: 1.87, volume: '8.4M',   time: '11:15 AM',  timeGroup: 'morning',    signal: '20MA $321.14 crossed above 50MA $308.77',     confidence: 72, support: 310.00, resistance: 355.00, sector: 'Cybersecurity',       recentPrices: [318,322,319,325,321,328,324,329,327,331,330,334],                  context: 'Delivers cloud-native endpoint security and threat intelligence to enterprises globally.',                   confidenceReason: 'Moderate confidence: bullish MA cross confirmed but volume is near average — watch for follow-through.',                    rsVsSpy: 1.15 },
  { id: 'mock-5', ticker: 'AAPL', name: 'Apple Inc',               alert_type: '52w_high',  price: 196.45, change: 0.93, volume: '61.8M',  time: 'Yesterday', timeGroup: null,          signal: 'Within 0.9% of 52-week high of $198.23',      confidence: 88, support: 188.00, resistance: 198.23, sector: 'Consumer Electronics', recentPrices: [189,191,190,192,191,193,192,194,193,195,194,196,196.45],           context: 'Designs iPhones, Macs, and services including the App Store and Apple Intelligence.',                         confidenceReason: 'High confidence: steady approach to 52W high on consistent buying with low volatility and tight price action.',             rsVsSpy: 0.21 },
  { id: 'mock-6', ticker: 'AMD',  name: 'Advanced Micro Devices',  alert_type: 'vol_surge', price: 178.92, change: 3.44, volume: '52.3M',  time: 'Yesterday', timeGroup: null,          signal: 'Volume surging 3.1x 30-day average',          confidence: 63, support: 165.00, resistance: 190.00, sector: 'Semiconductors',      recentPrices: [182,180,178,176,174,172,171,173,174,176,177,179],                  context: 'Makes CPUs and GPUs for PCs, servers, and gaming consoles competing directly with Intel and Nvidia.',        confidenceReason: 'Lower confidence: volume spike is notable but price is in a short-term downtrend approaching key support.',                 rsVsSpy: -0.88 },
  { id: 'mock-7', ticker: 'TSLA', name: 'Tesla Inc',               alert_type: 'gap_up',    price: 189.30, change: 5.20, volume: '114.6M', time: '8:14 AM',   timeGroup: 'pre-market', signal: 'Opened $9.36 above prior close of $179.94',    confidence: 95, support: 175.00, resistance: 200.00, sector: 'Electric Vehicles',   recentPrices: [176,177,178,179,180,182,183,185,186,187,188,189,189.30],           context: 'Manufactures electric vehicles and energy storage systems, also developing full self-driving software.',      confidenceReason: 'Very high confidence: pre-market gap with 6x normal volume driven by a clear catalyst and clean technical setup.',          rsVsSpy: 4.48 },
  { id: 'mock-8', ticker: 'META', name: 'Meta Platforms',           alert_type: 'ma_cross',  price: 527.40, change: 1.22, volume: '12.1M',  time: '1:42 PM',   timeGroup: 'afternoon',  signal: '20MA $512.88 crossed above 50MA $498.33',     confidence: 68, support: 498.00, resistance: 545.00, sector: 'Social Media',        recentPrices: [538,534,530,526,522,519,516,514,517,520,522,525,527],              context: 'Operates Facebook, Instagram, and WhatsApp while investing heavily in AI and the metaverse.',                 confidenceReason: 'Moderate confidence: MA cross is valid but price has been pulling back from highs — needs volume to confirm.',              rsVsSpy: -0.50 },
];

// TODO: Replace with Supabase aotd_history table
const MOCK_AOTD_HISTORY = [
  { date: 'Apr 2',  ticker: 'TSLA', name: 'Tesla Inc',              type: 'gap_up',    alertPrice: 189.30, alertChange: 5.20, confidence: 95, signal: 'Pre-market gap on 6x volume',    nextDayClose: 195.36, outcome: 3.20 },
  { date: 'Apr 1',  ticker: 'NVDA', name: 'Nvidia Corp',            type: '52w_high',  alertPrice: 875.40, alertChange: 2.14, confidence: 91, signal: 'Within 1.8% of 52W high',        nextDayClose: 891.15, outcome: 1.80 },
  { date: 'Mar 31', ticker: 'PLTR', name: 'Palantir Technologies',  type: 'gap_up',    alertPrice: 24.88,  alertChange: 4.63, confidence: 85, signal: 'Gap above consolidation zone',    nextDayClose: 24.78,  outcome: -0.40 },
  { date: 'Mar 28', ticker: 'SMCI', name: 'Super Micro Computer',   type: 'vol_surge', alertPrice: 92.17,  alertChange: 5.31, confidence: 78, signal: 'Volume 4.2x average',             nextDayClose: 94.66,  outcome: 2.70 },
  { date: 'Mar 27', ticker: 'AAPL', name: 'Apple Inc',              type: '52w_high',  alertPrice: 196.45, alertChange: 0.93, confidence: 88, signal: 'Approaching 52W high on low vol', nextDayClose: 197.63, outcome: 0.60 },
  { date: 'Mar 26', ticker: 'AMD',  name: 'Advanced Micro Devices', type: 'vol_surge', alertPrice: 178.92, alertChange: 3.44, confidence: 63, signal: 'Volume spike near key support',   nextDayClose: 176.95, outcome: -1.10 },
  { date: 'Mar 25', ticker: 'META', name: 'Meta Platforms',         type: 'ma_cross',  alertPrice: 527.40, alertChange: 1.22, confidence: 68, signal: '20MA crossed above 50MA',         nextDayClose: 533.87, outcome: 1.23 },
  { date: 'Mar 24', ticker: 'CRWD', name: 'CrowdStrike Holdings',   type: 'ma_cross',  alertPrice: 334.50, alertChange: 1.87, confidence: 72, signal: 'Bullish MA cross on avg volume',  nextDayClose: 340.18, outcome: 1.70 },
  { date: 'Mar 21', ticker: 'NVDA', name: 'Nvidia Corp',            type: 'vol_surge', alertPrice: 862.10, alertChange: 3.88, confidence: 82, signal: 'Volume 3.8x with new catalyst',   nextDayClose: 858.22, outcome: -0.45 },
  { date: 'Mar 20', ticker: 'TSLA', name: 'Tesla Inc',              type: '52w_high',  alertPrice: 181.50, alertChange: 2.75, confidence: 79, signal: 'Testing 52W high on earnings',     nextDayClose: null,   outcome: null },
];

const BADGE_CONFIG = {
  '52w_high':  { color: '#D97706', bg: '#FFFBEB', border: 'rgba(217,119,6,0.25)',   label: '52W High'  },
  'vol_surge': { color: '#7C3AED', bg: '#F5F3FF', border: 'rgba(124,58,237,0.25)',  label: 'Vol Surge' },
  'gap_up':    { color: '#16A34A', bg: '#F0FDF4', border: 'rgba(22,163,74,0.25)',   label: 'Gap Up'    },
  'ma_cross':  { color: '#2563EB', bg: '#EFF6FF', border: 'rgba(37,99,235,0.25)',   label: 'MA Cross'  },
};

// ── Dark mode themes ────────────────────────────────────────────────

const DARK_THEME = {
  '--text1': '#F3F4F6', '--text2': '#D1D5DB', '--text3': '#9CA3AF',
  '--card': '#1F2937', '--border': '#374151',
  '--green': '#22C55E', '--green-bg': 'rgba(34,197,94,0.12)',
  '--blue': '#60A5FA', '--blue-bg': 'rgba(96,165,250,0.12)',
  '--red': '#F87171', '--bg': '#111827',
};
const LIGHT_THEME = {
  '--text1': '#111827', '--text2': '#6B7280', '--text3': '#9CA3AF',
  '--card': '#ffffff', '--border': '#E5E7EB',
  '--green': '#16A34A', '--green-bg': 'rgba(26,173,94,0.08)',
  '--blue': '#2563EB', '--blue-bg': 'rgba(37,99,235,0.08)',
  '--red': '#DC2626', '--bg': '#ffffff',
};

// ── Helper: confidence color ────────────────────────────────────────

function confColor(c) {
  if (c >= 80) return '#16A34A';
  if (c >= 65) return '#D97706';
  return '#DC2626';
}

// ── Helper: render a single alert card ──────────────────────────────

function AlertCard({ alert, badge, isExpanded, onToggle, forceExpanded, darkMode }) {
  const ticker  = alert.ticker ?? alert.tickers?.[0] ?? '—';
  const price   = alert.price != null ? `$${Number(alert.price).toFixed(2)}` : '—';
  const change  = alert.change != null ? alert.change : null;
  const volume  = alert.volume ?? (alert.current_volume ? (Number(alert.current_volume) / 1e6).toFixed(1) + 'M' : null);
  const time    = alert.time ?? '';
  const signal  = alert.signal ?? alert.title ?? '';
  const showExp = forceExpanded || isExpanded;
  const rs      = alert.rsVsSpy;
  const cardRef = useRef(null);

  useEffect(() => {
    if (isExpanded && cardRef.current) {
      setTimeout(() => {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 250);
    }
  }, [isExpanded]);

  return (
    <div
      ref={cardRef}
      style={{
        ...styles.alertCard,
        borderLeftColor: badge.color,
        marginBottom: 0,
        ...(forceExpanded ? { background: darkMode ? '#292218' : '#FFFDF7', boxShadow: '0 2px 10px rgba(217,119,6,0.14)' } : {}),
      }}
      onClick={forceExpanded ? undefined : onToggle}
    >
      {/* Top: ticker + name | price + change */}
      <div style={styles.cardTop}>
        <div style={styles.cardTopLeft}>
          <span style={styles.alertTicker}>{ticker}</span>
          {alert.name && <span style={styles.companyName}>{alert.name}</span>}
        </div>
        <div style={styles.priceBlock}>
          <span style={styles.priceText}>{price}</span>
          {change != null && <span style={styles.changeText}>+{Number(change).toFixed(2)}%</span>}
        </div>
      </div>

      {/* Middle: badge | timestamp */}
      <div style={styles.cardMiddle}>
        <div style={{ ...styles.badge, color: badge.color, background: badge.bg, borderColor: badge.border }}>
          <span style={{ ...styles.badgeDot, background: badge.color }} />
          {badge.label}
        </div>
        <span style={styles.alertDate}>{time}</span>
      </div>

      {/* Signal */}
      {signal && <div style={styles.signalText}>{signal}</div>}

      {/* Footer: vol (left) | vs SPY (center) | confidence (right) */}
      <div style={styles.cardFooter}>
        <span style={styles.footerCell}>
          <span style={styles.footerLabel}>Vol</span>
          <span style={styles.metricValue}>{volume ?? '—'}</span>
        </span>
        {rs != null && (
          <span style={styles.footerCell}>
            <span style={styles.footerLabel}>vs SPY</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: rs >= 0 ? '#16A34A' : '#DC2626' }}>
              {rs >= 0 ? '+' : ''}{rs.toFixed(2)}%
            </span>
          </span>
        )}
        <span style={styles.footerRight}>
          {alert.confidence != null && (
            <span style={styles.footerCell}>
              <span style={styles.footerLabel}>Confidence</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: confColor(alert.confidence) }}>
                {alert.confidence}%
              </span>
            </span>
          )}
          {!forceExpanded && (
            <span style={{ ...styles.chevron, transform: showExp ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          )}
        </span>
      </div>

      {/* Expanded detail panel */}
      <div style={{ ...styles.expandPanel, maxHeight: showExp ? 400 : 0 }}>
        <div style={styles.expandPanelInner}>
          {alert.context && <p style={styles.expandContext}>{alert.context}</p>}
          {alert.confidenceReason && (
            <div style={styles.confRationale}>💡 {alert.confidenceReason}</div>
          )}
          <div style={styles.expandGrid}>
            <div style={styles.expandItem}>
              <span style={styles.expandLabel}>Support</span>
              <span style={styles.expandValue}>${alert.support?.toFixed(2) ?? '—'}</span>
            </div>
            <div style={styles.expandItem}>
              <span style={styles.expandLabel}>Resistance</span>
              <span style={styles.expandValue}>${alert.resistance?.toFixed(2) ?? '—'}</span>
            </div>
            <div style={styles.expandItem}>
              <span style={styles.expandLabel}>Sector</span>
              <span style={styles.expandValue}>{alert.sector ?? '—'}</span>
            </div>
            <div style={styles.expandItem}>
              <span style={styles.expandLabel}>vs SPY</span>
              <span style={{ ...styles.expandValue, color: rs != null ? (rs >= 0 ? '#16A34A' : '#DC2626') : 'var(--text1)' }}>
                {rs != null ? `${rs >= 0 ? '+' : ''}${rs.toFixed(2)}%` : '—'}
              </span>
            </div>
          </div>
          {alert.recentPrices && (
            <div style={{ marginBottom: 12 }}>
              <Sparkline
                prices={alert.recentPrices}
                enhanced
                support={alert.support}
                resistance={alert.resistance}
                alertPrice={alert.price != null ? Number(alert.price) : undefined}
              />
            </div>
          )}
          {/* Past performance from history */}
          {showExp && (() => {
            const similar = MOCK_AOTD_HISTORY
              .filter(h => h.outcome != null && (h.ticker === (alert.ticker ?? '') || h.type === alert.alert_type))
              .slice(0, 3);
            if (similar.length === 0) return null;
            return (
              <div style={styles.pastPerf}>
                <span style={styles.pastPerfLabel}>Past performance: </span>
                {similar.map((h, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <span style={{ fontWeight: 700, color: h.outcome >= 0 ? '#16A34A' : '#DC2626' }}>
                      {h.outcome >= 0 ? '+' : ''}{h.outcome.toFixed(1)}%
                    </span>
                  </span>
                ))}
              </div>
            );
          })()}
          <button style={styles.viewChartBtn} onClick={e => e.stopPropagation()}>View Chart</button>
        </div>
      </div>
    </div>
  );
}

// ── Pull-to-refresh indicator ───────────────────────────────────────

function PullToRefresh({ onRefresh, children }) {
  const containerRef = useRef(null);
  const touchRef = useRef({ startY: 0, pulling: false });
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const PULL_THRESHOLD = 60;

  const handleTouchStart = useCallback((e) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      touchRef.current = { startY: e.touches[0].clientY, pulling: true };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchRef.current.pulling || refreshing) return;
    const dy = e.touches[0].clientY - touchRef.current.startY;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.4, 80));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!touchRef.current.pulling) return;
    touchRef.current.pulling = false;
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD * 0.6);
      // TODO: Replace with live data fetch
      setTimeout(() => {
        onRefresh();
        setRefreshing(false);
        setPullY(0);
      }, 1000);
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      style={styles.scroll}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullY > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4, height: pullY, alignItems: 'center', transition: 'height 0.2s ease' }}>
          <div style={{
            width: 20, height: 20,
            border: '2px solid var(--border)', borderTopColor: 'var(--green)',
            borderRadius: '50%',
            animation: refreshing ? 'spin 0.7s linear infinite' : 'none',
            opacity: Math.min(pullY / PULL_THRESHOLD, 1),
          }} />
        </div>
      )}
      {children}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function AlertsTab({ session }) {
  const { isAdmin } = useGroup();
  const [breakout_alerts, setAlerts] = useState([]);
  const [loading, setLoading]        = useState(false);
  const [expandedId, setExpandedId]  = useState(null);
  const [filter, setFilter]          = useState('all');
  const [sort, setSort]              = useState('newest');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [subTab, setSubTab] = useState('live');
  const [refreshKey, setRefreshKey]  = useState(0);
  const [historyFilter, setHistoryFilter] = useState('all');

  // Live market data from Supabase market_data table
  const [fearScore, setFearScore]           = useState(null);
  const [sectors, setSectors]               = useState(null);
  const [spyData, setSpyData]               = useState(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(null);

  useEffect(() => {
    supabase.from('market_data').select('*').then(({ data }) => {
      if (!data) return;
      let latestUpdated = null;
      data.forEach(row => {
        if (row.key === 'vix_score')            setFearScore(row.value?.score ?? null);
        if (row.key === 'sector_performance')   setSectors(row.value);
        if (row.key === 'spy_price')            setSpyData(row.value);
        if (row.updated_at && (!latestUpdated || row.updated_at > latestUpdated)) {
          latestUpdated = row.updated_at;
        }
      });
      if (latestUpdated) setMarketUpdatedAt(latestUpdated);
    });
  }, []);

  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('uptik_darkMode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const theme = darkMode ? DARK_THEME : LIGHT_THEME;
    Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    try { localStorage.setItem('uptik_darkMode', String(darkMode)); } catch {}
  }, [darkMode]);

  // Scanner state
  const [scanning52w, setScanning52w]           = useState(false);
  const [scan52wProgress, setScan52wProgress]   = useState(0);
  const [scan52wStatus, setScan52wStatus]       = useState(null);
  const [scanningVol, setScanningVol]           = useState(false);
  const [scanVolProgress, setScanVolProgress]   = useState(0);
  const [scanVolStatus, setScanVolStatus]       = useState(null);
  const [scanningGap, setScanningGap]           = useState(false);
  const [scanGapProgress, setScanGapProgress]   = useState(0);
  const [scanGapStatus, setScanGapStatus]       = useState(null);
  const [scanningMA, setScanningMA]             = useState(false);
  const [scanMAProgress, setScanMAProgress]     = useState(0);
  const [scanMAStatus, setScanMAStatus]         = useState(null);

  // ── Supabase: load alerts + realtime ──────────────────────────────

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('breakout_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setAlerts(data);
      setLoading(false);
    };

    loadAlerts();

    const channel = supabase
      .channel('breakout_alerts_feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'breakout_alerts',
      }, (payload) => {
        setAlerts(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Scanner handlers (unchanged) ─────────────────────────────────

  const handle52wScan = async () => {
    setScanning52w(true);
    setScan52wProgress(0);
    setScan52wStatus(null);
    try {
      const { inserted } = await run52wHighScan(DEFAULT_THRESHOLD, setScan52wProgress);
      setScan52wStatus({ inserted });
    } catch (e) {
      setScan52wStatus({ error: e.message });
    } finally {
      setScanning52w(false);
    }
  };

  const handleVolScan = async () => {
    setScanningVol(true);
    setScanVolProgress(0);
    setScanVolStatus(null);
    try {
      const { inserted } = await runVolSurgeScan(DEFAULT_VOL_MULTIPLIER, setScanVolProgress);
      setScanVolStatus({ inserted });
    } catch (e) {
      setScanVolStatus({ error: e.message });
    } finally {
      setScanningVol(false);
    }
  };

  const handleGapScan = async () => {
    setScanningGap(true);
    setScanGapProgress(0);
    setScanGapStatus(null);
    try {
      const { inserted } = await runGapUpScan(DEFAULT_GAP_THRESHOLD, setScanGapProgress);
      setScanGapStatus({ inserted });
    } catch (e) {
      setScanGapStatus({ error: e.message });
    } finally {
      setScanningGap(false);
    }
  };

  const handleMAScan = async () => {
    setScanningMA(true);
    setScanMAProgress(0);
    setScanMAStatus(null);
    try {
      const { inserted } = await runMACrossScan(DEFAULT_SHORT_MA, DEFAULT_LONG_MA, setScanMAProgress);
      setScanMAStatus({ inserted });
    } catch (e) {
      setScanMAStatus({ error: e.message });
    } finally {
      setScanningMA(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────

  const formatDate = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return isToday
      ? `Today · ${time}`
      : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
  };

  const getTimeGroup = (alert) => {
    if (alert.timeGroup !== undefined) return alert.timeGroup;
    if (!alert.created_at) return null;
    const d = new Date(alert.created_at);
    const today = new Date();
    if (d.toDateString() !== today.toDateString()) return null;
    const h = d.getHours(), m = d.getMinutes();
    const mins = h * 60 + m;
    if (mins < 9 * 60 + 30) return 'pre-market';
    if (mins < 12 * 60)     return 'morning';
    return 'afternoon';
  };

  const GROUP_LABELS = {
    'pre-market': 'Pre-Market',
    'morning':    'Morning',
    'afternoon':  'Afternoon',
  };

  // ── Derived data ──────────────────────────────────────────────────

  // For live alerts, compute rsVsSpy from SPY change; mock alerts already have it
  const displayAlerts = breakout_alerts.length > 0
    ? breakout_alerts.map(a => {
        if (a.rsVsSpy != null || a.change == null || !spyData?.change) return a;
        return { ...a, rsVsSpy: Number(a.change) - Number(spyData.change) };
      })
    : MOCK_ALERTS;

  const alertOfTheDay = displayAlerts.length > 0
    ? displayAlerts.reduce((best, a) => (a.confidence ?? 0) > (best.confidence ?? 0) ? a : best)
    : null;

  const aotdBadge = alertOfTheDay ? (BADGE_CONFIG[alertOfTheDay.alert_type] || BADGE_CONFIG['vol_surge']) : null;

  const filtered = (filter === 'all' ? displayAlerts : displayAlerts.filter(a => a.alert_type === filter))
    .filter(a => !alertOfTheDay || a.id !== alertOfTheDay.id)
    .slice()
    .sort((a, b) => {
      if (sort === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0);
      if (sort === 'change')     return (b.change ?? 0) - (a.change ?? 0);
      return 0;
    });

  const GROUP_ORDER = ['pre-market', 'morning', 'afternoon', null];
  const groups = {};
  filtered.forEach(a => {
    const g = getTimeGroup(a);
    if (!groups[g]) groups[g] = [];
    groups[g].push(a);
  });
  const groupedRows = [];
  GROUP_ORDER.forEach(g => {
    if (!groups[g]) return;
    if (g) groupedRows.push({ type: 'header', label: GROUP_LABELS[g], key: `header-${g}` });
    groups[g].forEach(alert => groupedRows.push({ type: 'alert', alert }));
  });

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <PullToRefresh onRefresh={() => setRefreshKey(k => k + 1)}>

      {/* Header: label + scanners toggle + dark mode */}
      <div style={{ margin: '14px 4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={styles.secLabel}>Breakout Alerts</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isAdmin && (
              <button style={styles.scanToggleBtn} onClick={() => setScannerOpen(o => !o)}>
                {scannerOpen ? 'Hide Scanners ▲' : 'Run Scanners ▼'}
              </button>
            )}
            <button style={styles.darkModeBtn} onClick={() => setDarkMode(d => !d)} aria-label="Toggle dark mode">
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Scanner buttons (admin only) */}
        {isAdmin && scannerOpen && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={{ ...styles.scanBtn, opacity: scanning52w ? 0.6 : 1 }} onClick={handle52wScan} disabled={scanning52w}>
              {scanning52w ? `52W… ${scan52wProgress}%` : '52W High'}
            </button>
            <button style={{ ...styles.scanBtn, ...styles.scanBtnBlue, opacity: scanningVol ? 0.6 : 1 }} onClick={handleVolScan} disabled={scanningVol}>
              {scanningVol ? `Vol… ${scanVolProgress}%` : 'Vol Surge'}
            </button>
            <button style={{ ...styles.scanBtn, ...styles.scanBtnGold, opacity: scanningGap ? 0.6 : 1 }} onClick={handleGapScan} disabled={scanningGap}>
              {scanningGap ? `Gap… ${scanGapProgress}%` : 'Gap Up'}
            </button>
            <button style={{ ...styles.scanBtn, ...styles.scanBtnPurple, opacity: scanningMA ? 0.6 : 1 }} onClick={handleMAScan} disabled={scanningMA}>
              {scanningMA ? `MA… ${scanMAProgress}%` : 'MA Cross'}
            </button>
          </div>
        )}
      </div>

      {/* Scanner status messages */}
      {isAdmin && scan52wStatus && (
        <div style={{ ...styles.scanStatus, color: scan52wStatus.error ? 'var(--red)' : 'var(--green)' }}>
          {scan52wStatus.error ? `52W scan error: ${scan52wStatus.error}` : scan52wStatus.inserted === 0 ? '52W scan — no new breakouts' : `52W scan — ${scan52wStatus.inserted} new alert${scan52wStatus.inserted > 1 ? 's' : ''} added`}
        </div>
      )}
      {isAdmin && scanVolStatus && (
        <div style={{ ...styles.scanStatus, color: scanVolStatus.error ? 'var(--red)' : 'var(--blue)' }}>
          {scanVolStatus.error ? `Vol scan error: ${scanVolStatus.error}` : scanVolStatus.inserted === 0 ? 'Vol scan — no surges found' : `Vol scan — ${scanVolStatus.inserted} new alert${scanVolStatus.inserted > 1 ? 's' : ''} added`}
        </div>
      )}
      {isAdmin && scanGapStatus && (
        <div style={{ ...styles.scanStatus, color: scanGapStatus.error ? 'var(--red)' : '#D4A017' }}>
          {scanGapStatus.error ? `Gap scan error: ${scanGapStatus.error}` : scanGapStatus.inserted === 0 ? 'Gap scan — no gaps found' : `Gap scan — ${scanGapStatus.inserted} new alert${scanGapStatus.inserted > 1 ? 's' : ''} added`}
        </div>
      )}
      {isAdmin && scanMAStatus && (
        <div style={{ ...styles.scanStatus, color: scanMAStatus.error ? 'var(--red)' : '#8B5CF6' }}>
          {scanMAStatus.error ? `MA scan error: ${scanMAStatus.error}` : scanMAStatus.inserted === 0 ? 'MA scan — no crossovers found' : `MA scan — ${scanMAStatus.inserted} new alert${scanMAStatus.inserted > 1 ? 's' : ''} added`}
        </div>
      )}

      {/* Sub-tab toggle: Live / History */}
      <div style={styles.subTabBar}>
        {['live', 'history'].map(t => (
          <button
            key={t}
            style={{
              ...styles.subTabBtn,
              background: subTab === t ? '#1a3c2a' : 'var(--card)',
              color: subTab === t ? '#ffffff' : 'var(--text2)',
              borderColor: subTab === t ? '#1a3c2a' : 'var(--border)',
            }}
            onClick={() => setSubTab(t)}
          >
            {t === 'live' ? 'Live' : 'History'}
          </button>
        ))}
      </div>

      {subTab === 'live' && (<>

      {/* Filter pills */}
      <div style={styles.filterBar}>
        {['all', '52w_high', 'vol_surge', 'gap_up', 'ma_cross'].map(f => (
          <button
            key={f}
            style={{
              ...styles.filterBtn,
              background:  filter === f ? '#1a3c2a' : 'var(--card)',
              color:       filter === f ? '#ffffff'  : 'var(--text2)',
              borderColor: filter === f ? '#1a3c2a'  : 'var(--border)',
              fontWeight:  filter === f ? 600 : 400,
            }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : BADGE_CONFIG[f]?.label || f}
          </button>
        ))}
      </div>

      {/* Sort control */}
      <div style={styles.sortRow}>
        <span style={styles.sortLabel}>Sort by</span>
        <select value={sort} onChange={e => setSort(e.target.value)} style={styles.sortSelect}>
          <option value="newest">Newest</option>
          <option value="confidence">Confidence</option>
          <option value="change">% Change</option>
        </select>
      </div>

      {/* Fear Index — live VIX from market_data, falls back to mock */}
      <FearIndex score={fearScore ?? MOCK_FEAR_SCORE} />
      {marketUpdatedAt && (
        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: -6, marginBottom: 8 }}>
          Last updated {new Date(marketUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {/* Sector Heat Map — live from market_data, falls back to mock */}
      <SectorHeatMap sectors={sectors ?? MOCK_SECTORS} />

      {/* Alert of the Day — highest confidence, auto-expanded, excluded from list */}
      {alertOfTheDay && aotdBadge && (
        <div>
          <div style={styles.aotdLabel}>⭐ Alert of the Day</div>
          <SwipeableCard alertId={alertOfTheDay.id}>
            <AlertCard
              alert={alertOfTheDay}
              badge={aotdBadge}
              isExpanded={true}
              forceExpanded={true}
              darkMode={darkMode}
            />
          </SwipeableCard>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyIcon}>🔍</div>
          <div style={styles.emptyTitle}>No alerts yet</div>
          <div style={styles.emptyText}>
            The scanner is watching for breakout setups. Alerts appear here when parameters are met — not every day will have alerts.
          </div>
        </div>
      )}

      {/* Grouped alert cards */}
      {groupedRows.map(row => {
        if (row.type === 'header') {
          return <div key={row.key} style={styles.groupHeader}>{row.label}</div>;
        }
        const { alert } = row;
        const badge = BADGE_CONFIG[alert.alert_type] || BADGE_CONFIG['vol_surge'];
        return (
          <SwipeableCard key={alert.id} alertId={alert.id}>
            <AlertCard
              alert={alert}
              badge={badge}
              isExpanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
              darkMode={darkMode}
            />
          </SwipeableCard>
        );
      })}

      </>)}

      {/* History sub-tab */}
      {subTab === 'history' && (() => {
        const filteredHistory = historyFilter === 'all'
          ? MOCK_AOTD_HISTORY
          : MOCK_AOTD_HISTORY.filter(h => h.type === historyFilter);
        const resolved = filteredHistory.filter(h => h.outcome != null);
        const hits = resolved.filter(h => h.outcome > 0).length;
        const hitRate = resolved.length > 0 ? Math.round((hits / resolved.length) * 100) : 0;
        const avgReturn = resolved.length > 0 ? resolved.reduce((s, h) => s + h.outcome, 0) / resolved.length : 0;
        let streak = '';
        for (let i = 0; i < filteredHistory.length; i++) {
          const o = filteredHistory[i].outcome;
          if (o == null) continue;
          if (!streak) { streak = o > 0 ? '1W' : '1L'; continue; }
          const dir = streak.endsWith('W') ? 1 : -1;
          if ((o > 0 && dir > 0) || (o < 0 && dir < 0)) {
            streak = (parseInt(streak) + 1) + streak.slice(-1);
          } else break;
        }
        const ordered = [...filteredHistory].reverse();
        const cumPts = [0];
        ordered.forEach(h => cumPts.push(cumPts[cumPts.length - 1] + (h.outcome ?? 0)));
        const best = resolved.length > 0 ? resolved.reduce((b, h) => h.outcome > b.outcome ? h : b) : null;
        const worst = resolved.length > 0 ? resolved.reduce((w, h) => h.outcome < w.outcome ? h : w) : null;

        return (
          <div>
            <div style={styles.secLabel}>Alert of the Day — Track Record</div>

            {/* Summary stat boxes */}
            <div style={styles.statRow}>
              <div style={styles.statBox}>
                <span style={styles.statBoxLabel}>Hit Rate</span>
                <span style={{ ...styles.statBoxValue, color: hitRate >= 50 ? '#16A34A' : '#DC2626' }}>{hitRate}%</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statBoxLabel}>Avg Return</span>
                <span style={{ ...styles.statBoxValue, color: avgReturn >= 0 ? '#16A34A' : '#DC2626' }}>
                  {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(1)}%
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statBoxLabel}>Streak</span>
                <span style={{ ...styles.statBoxValue, color: streak.endsWith('W') ? '#16A34A' : '#DC2626' }}>{streak || '—'}</span>
              </div>
            </div>

            {/* History type filter */}
            <div style={styles.filterBar}>
              {['all', '52w_high', 'vol_surge', 'gap_up', 'ma_cross'].map(f => (
                <button
                  key={f}
                  style={{
                    ...styles.filterBtn,
                    background:  historyFilter === f ? '#1a3c2a' : 'var(--card)',
                    color:       historyFilter === f ? '#ffffff'  : 'var(--text2)',
                    borderColor: historyFilter === f ? '#1a3c2a'  : 'var(--border)',
                    fontWeight:  historyFilter === f ? 600 : 400,
                  }}
                  onClick={() => setHistoryFilter(f)}
                >
                  {f === 'all' ? 'All' : BADGE_CONFIG[f]?.label || f}
                </button>
              ))}
            </div>

            {/* Win streak dots */}
            <div style={styles.historyDots}>
              {ordered.map((h, i) => (
                <div key={i} style={{
                  ...styles.dot,
                  background: h.outcome == null ? 'var(--text3)' : h.outcome > 0 ? '#16A34A' : '#DC2626',
                }} />
              ))}
            </div>

            {/* Cumulative return sparkline */}
            <div style={{ margin: '0 0 14px' }}>
              <Sparkline prices={cumPts} fullWidth />
            </div>

            {/* Best / Worst highlight */}
            {(best || worst) && (
              <div style={styles.bestWorstRow}>
                {best && (
                  <div style={{ ...styles.bestWorstCard, borderLeftColor: '#16A34A' }}>
                    <span style={styles.bestWorstLabel}>Best Alert</span>
                    <span style={styles.bestWorstText}>{best.ticker} · {best.date} · <strong style={{ color: '#16A34A' }}>+{best.outcome.toFixed(1)}%</strong></span>
                  </div>
                )}
                {worst && (
                  <div style={{ ...styles.bestWorstCard, borderLeftColor: '#DC2626' }}>
                    <span style={styles.bestWorstLabel}>Worst Alert</span>
                    <span style={styles.bestWorstText}>{worst.ticker} · {worst.date} · <strong style={{ color: '#DC2626' }}>{worst.outcome.toFixed(1)}%</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* History cards */}
            {filteredHistory.map((h, i) => {
              const isPending = h.outcome == null;
              const isHit = !isPending && h.outcome > 0;
              return (
                <div key={i} style={styles.historyRow}>
                  <span style={styles.historyDatePill}>{h.date}</span>
                  <span style={styles.historyMiddle}>
                    <span style={styles.historyTicker}>{h.ticker}</span>
                    <span style={styles.historySignal}>{h.signal}</span>
                    <span style={styles.historyPriceJourney}>
                      ${h.alertPrice.toFixed(2)}{h.nextDayClose != null ? ` → $${h.nextDayClose.toFixed(2)} next day` : ''}
                    </span>
                  </span>
                  <span style={{
                    ...styles.historyBadge,
                    background: isPending ? 'var(--border)' : isHit ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                    color: isPending ? 'var(--text3)' : isHit ? '#16A34A' : '#DC2626',
                  }}>
                    {isPending ? 'Pending' : isHit ? `Hit +${h.outcome.toFixed(1)}%` : `Miss ${h.outcome.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      <div style={{ height: 100 }} />
    </PullToRefresh>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = {
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '4px 12px 100px',
    WebkitOverflowScrolling: 'touch',
    background: 'var(--bg)',
  },
  loadingWrap: {
    flex: 1, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--navy)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px',
  },
  filterBar: {
    display: 'flex', gap: 6,
    overflowX: 'auto', padding: '4px 0 8px',
    scrollbarWidth: 'none',
  },
  filterBtn: {
    flexShrink: 0, padding: '5px 12px',
    borderRadius: 20, fontSize: 11,
    border: '1px solid', cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'all .15s',
  },
  sortRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  sortLabel: { fontSize: 11, color: 'var(--text3)' },
  sortSelect: {
    fontSize: 11, color: 'var(--text2)',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
  },
  groupHeader: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '10px 4px 4px',
  },
  emptyWrap:  { textAlign: 'center', padding: '40px 20px' },
  emptyIcon:  { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 },

  // Card
  alertCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderLeft: '4px solid var(--border)',
    borderRadius: 12, padding: '13px 14px 0',
    marginBottom: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    maxWidth: 430,
  },
  cardTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  cardTopLeft: { display: 'flex', flexDirection: 'column', gap: 1 },
  alertTicker: { fontSize: 17, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.2 },
  companyName: { fontSize: 12, color: 'var(--text3)', marginTop: 1 },
  priceBlock:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  priceText:   { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  changeText:  { fontSize: 12, fontWeight: 600, color: '#16A34A' },
  cardMiddle: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 7,
  },
  alertDate: { fontSize: 11, color: 'var(--text3)' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600,
    padding: '3px 9px', borderRadius: 20,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', border: '1px solid',
  },
  badgeDot: { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  signalText: {
    fontSize: 12, color: 'var(--text2)',
    lineHeight: 1.55, marginBottom: 16,
  },
  cardFooter: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--border)',
    padding: '7px 0', fontSize: 12,
  },
  footerCell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  footerLabel: {
    fontSize: 9, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  footerRight: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  chevron: {
    fontSize: 14, color: 'var(--text3)',
    display: 'inline-block', transition: 'transform 0.2s ease',
  },
  metricValue: { fontWeight: 700, fontSize: 12, color: 'var(--text1)' },

  // Expand panel
  expandPanel: {
    overflow: 'hidden', transition: 'max-height 0.22s ease',
    background: 'color-mix(in srgb, var(--card) 90%, var(--text3) 10%)',
    margin: '0 -14px', padding: '0 14px',
    borderTop: '1px solid var(--border)',
  },
  expandPanelInner: { padding: '12px 0 10px' },
  expandContext: {
    fontSize: 11, color: 'var(--text3)',
    lineHeight: 1.5, margin: '0 0 10px',
  },
  confRationale: {
    fontSize: 11, color: 'var(--text2)',
    lineHeight: 1.7,
    background: 'color-mix(in srgb, var(--card) 92%, var(--green) 8%)',
    borderRadius: 8, padding: '8px 12px', marginBottom: 10,
  },
  expandGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 10, marginBottom: 12,
  },
  expandItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  expandLabel: {
    fontSize: 10, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
  },
  expandValue: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  viewChartBtn: {
    width: '100%', padding: '8px 0',
    minHeight: 44,
    fontSize: 12, fontWeight: 600,
    color: 'var(--green)', background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.3)',
    borderRadius: 8, cursor: 'pointer',
  },

  // Scanner UI
  scanToggleBtn: {
    fontSize: 11, fontWeight: 600,
    padding: '4px 10px', borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--text2)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  scanBtn: {
    fontSize: 11, fontWeight: 600,
    padding: '5px 12px', borderRadius: 20,
    border: '1px solid rgba(26,173,94,0.4)',
    background: 'var(--green-bg)', color: 'var(--green)',
    whiteSpace: 'nowrap', cursor: 'pointer',
  },
  scanBtnBlue:   { border: '1px solid rgba(74,144,217,0.4)',  background: 'var(--blue-bg)', color: 'var(--blue)' },
  scanBtnGold:   { border: '1px solid rgba(212,160,23,0.4)',  background: '#FFFBEB', color: '#D4A017' },
  scanBtnPurple: { border: '1px solid rgba(139,92,246,0.4)',  background: '#F5F3FF', color: '#8B5CF6' },
  scanStatus: { fontSize: 12, textAlign: 'center', padding: '6px 12px 2px' },

  // AOTD
  aotdLabel: {
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1,
    color: '#D97706', padding: '0 4px 5px',
  },

  // Sub-tab toggle
  subTabBar: {
    display: 'flex', gap: 8, padding: '0 0 10px',
  },
  subTabBtn: {
    flex: 1, padding: '10px 0', minHeight: 44,
    borderRadius: 24, fontSize: 13, fontWeight: 600,
    border: '1px solid', cursor: 'pointer',
    textAlign: 'center', transition: 'all .15s',
  },

  // Track Record stats
  statRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  statBox: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  statBoxLabel: {
    fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text3)',
  },
  statBoxValue: {
    fontSize: 20, fontWeight: 700,
  },

  // AOTD Track Record
  historyDots: {
    display: 'flex', gap: 6, padding: '4px 4px 8px',
    justifyContent: 'flex-start', alignItems: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  historyStatLine: {
    fontSize: 11, color: 'var(--text2)',
    padding: '0 4px 8px',
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', minHeight: 44,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12, marginBottom: 6,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  historyDatePill: {
    fontSize: 10, fontWeight: 600, color: 'var(--text3)',
    background: 'var(--border)', borderRadius: 6,
    padding: '3px 7px', flexShrink: 0, whiteSpace: 'nowrap',
  },
  historyMiddle: {
    flex: 1, display: 'flex', flexDirection: 'column',
    gap: 2, minWidth: 0,
  },
  historyTicker: {
    fontSize: 13, fontWeight: 700, color: 'var(--text1)',
  },
  historySignal: {
    fontSize: 11, color: 'var(--text2)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  historyPriceJourney: {
    fontSize: 10, color: 'var(--text3)',
  },
  historyBadge: {
    fontSize: 11, fontWeight: 700, flexShrink: 0,
    padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
  },

  // Best / Worst highlight
  bestWorstRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  bestWorstCard: {
    flex: 1, borderLeft: '4px solid',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '8px 10px',
    display: 'flex', flexDirection: 'column', gap: 2,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  bestWorstLabel: {
    fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text3)',
  },
  bestWorstText: {
    fontSize: 11, color: 'var(--text1)',
  },

  // Past performance in expanded card
  pastPerf: {
    fontSize: 11, color: 'var(--text2)',
    padding: '8px 0', marginBottom: 4,
    borderTop: '1px solid var(--border)',
  },
  pastPerfLabel: {
    color: 'var(--text3)', fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },

  // Dark mode toggle
  darkModeBtn: {
    width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, background: 'var(--card)',
    border: '1px solid var(--border)', borderRadius: '50%',
    cursor: 'pointer', padding: 0, lineHeight: 1,
  },
};

// ── Keyframe injection ──────────────────────────────────────────────

if (typeof document !== 'undefined' && !document.getElementById('uptik-keyframes')) {
  const sheet = document.createElement('style');
  sheet.id = 'uptik-keyframes';
  sheet.textContent = [
    '@keyframes fadeInOut { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.85); } 15% { opacity:1; transform:translate(-50%,-50%) scale(1); } 75% { opacity:1; } 100% { opacity:0; } }',
    '@keyframes spin { to { transform:rotate(360deg); } }',
  ].join('\n');
  document.head.appendChild(sheet);
}
