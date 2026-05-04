import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTheme, timeAgo } from "./alertsCasinoComponents";
import { lifecycleStateFor } from '../../lib/alertLifecycle';
import { MIN_SAMPLES_FLOOR } from '../../lib/signalConfidence';
import { useMarketData } from '../../hooks/useMarketData';

// ── Constants ──
// Polygon replaced FMP as the exit-price source for alert scoring on 2026-04-14.
// Win-rate / avg-return only pull rows scored on or after this cutoff so the
// numbers aren't contaminated by FMP-vs-Polygon vendor drift on older rows.
// Historical rows remain in the DB untouched — backfill later.
const POLYGON_SCORING_CUTOFF = '2026-04-14T00:00:00Z';

const TYPE_CONFIG = {
  vol_surge:   { label: 'VOL SURGE',   color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  flow_signal: { label: 'BIG MONEY',   color: '#5eed8a', bg: 'rgba(94,237,138,0.12)' },
  '52w_high':  { label: '52W HIGH',    color: '#fbbf24', bg: 'rgba(217,119,6,0.15)' },
  gap_up:      { label: 'GAP UP',      color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
  ma_cross:    { label: 'MA CROSS',    color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
  confluence:  { label: 'CONFLUENCE',  color: '#d4af37', bg: 'rgba(212,175,55,0.15)' },
};

// Only these signal types earn a slot on the action chip grid — our
// differentiated, edge-backed signals. 52-week-high is excluded because it's
// generic (every app flags it) and our own cohort stats show it pays out at
// ~48% over 94 trades — below coin-flip. Still visible in Recent Alerts for
// users who explicitly want that view; just not promoted as an action chip.
const GRID_SIGNAL_TYPES = new Set(['flow_signal', 'gap_up', 'vol_surge', 'ma_cross', 'confluence']);

const CHIP_SLOTS = [
  { top: '10%', left: '5%' },  { top: '8%',  left: '35%' },
  { top: '15%', left: '65%' }, { top: '50%', left: '15%' },
  { top: '45%', left: '50%' }, { top: '55%', left: '78%' },
  { top: '30%', left: '82%' }, { top: '65%', left: '40%' },
];

const FLOAT_DATA = [
  [[25,5,-8,2],[50,-3,6,-1],[75,7,-4,3]],
  [[33,-6,-5,-2],[66,4,7,1.5]],
  [[20,8,-3,1],[50,-4,-7,-2],[80,3,5,2.5]],
  [[30,-7,4,-1.5],[70,5,-6,2]],
  [[40,6,5,1],[60,-5,-4,-2.5]],
  [[25,-4,7,2],[75,7,-3,-1]],
  [[35,3,-6,-1],[65,-6,4,2]],
  [[45,-5,-3,1.5],[55,4,5,-1.5]],
];
const FLOAT_KEYFRAMES = FLOAT_DATA.map((steps, i) =>
  `@keyframes float${i}{0%,100%{transform:translate(0,0) rotate(0deg)}${steps.map(([p,x,y,r]) => `${p}%{transform:translate(${x}px,${y}px) rotate(${r}deg)}`).join('')}}`
).join('\n') + '\n@keyframes freshPulse{0%,100%{box-shadow:0 0 0 0 rgba(94,237,138,0.4)}50%{box-shadow:0 0 0 6px rgba(94,237,138,0)}}';

const FLOAT_DURATIONS = [18, 15, 22, 17, 20, 16, 19, 21];

const FLOW_TYPES = new Set(['flow_signal']);
const HISTORY_FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'confluence', label: 'Top' },
  { key: 'stocks',     label: 'Stocks' },
  { key: 'flow',       label: 'Big $' },
];


// ── Helpers ──
function freshness(createdAt) {
  if (!createdAt) return 0.4;
  const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (ageMin <= 15) return 1;
  if (ageMin <= 60) return 0.85;
  if (ageMin <= 180) return 0.65;
  return 0.4;
}

function chipSize(pct) {
  const a = Math.abs(pct || 0);
  return a >= 8 ? 80 : a >= 5 ? 72 : a >= 3 ? 64 : a >= 1.5 ? 58 : 54;
}

// ── Tier classification ──────────────────────────────────────────────
// Maps cohort historical hit rate → one of five plain-English tiers used
// for chip color + label. Thresholds are symmetric around 50% so the
// scale reads as a balanced "track record": Climbing (≥60%), Rising
// (53–60%), Flat (47–53%), Slipping (40–47%), Falling (<40%). Below
// MIN_SAMPLES_FLOOR (50) the cohort isn't statistically meaningful, so
// we fall back to 'flat' rather than letting noisy small-sample rates
// drive a confident-looking color.
export function tierFor(hitRatePct, nSamples = 0) {
  if (!Number.isFinite(hitRatePct) || nSamples < MIN_SAMPLES_FLOOR) return 'flat';
  if (hitRatePct >= 60) return 'climbing';
  if (hitRatePct >= 53) return 'rising';
  if (hitRatePct >= 47) return 'flat';
  if (hitRatePct >= 40) return 'slipping';
  return 'falling';
}

const TIER_LABELS = {
  climbing: 'Climbing',
  rising:   'Rising',
  flat:     'Flat',
  slipping: 'Slipping',
  falling:  'Falling',
};

// 3-stop radial gradients matching the static mock. Same lightness
// contour across tiers — only the hue moves green → yellow → red — so
// chip depth/dimension stay consistent regardless of tier.
const TIER_GRADIENTS = {
  climbing: 'radial-gradient(circle at 32% 28%, #b6f6c7 0%, #5eed8a 55%, #2fa860 100%)',
  rising:   'radial-gradient(circle at 32% 28%, #d4eccd 0%, #aed8a0 55%, #7eb070 100%)',
  flat:     'radial-gradient(circle at 32% 28%, #f6e8b3 0%, #e8d068 55%, #c4a228 100%)',
  slipping: 'radial-gradient(circle at 32% 28%, #f6cccc 0%, #e89898 55%, #c46868 100%)',
  falling:  'radial-gradient(circle at 32% 28%, #f0a0a0 0%, #d65555 55%, #a02828 100%)',
};

// Two-ring inset border (inner accent + outer shadow) — same alpha
// across tiers, only hue changes.
const TIER_BORDERS = {
  climbing: { inner: 'rgba(94,237,138,0.9)',  outer: 'rgba(26,138,69,0.4)'  },
  rising:   { inner: 'rgba(173,216,160,0.9)', outer: 'rgba(126,176,112,0.4)' },
  flat:     { inner: 'rgba(232,208,104,0.9)', outer: 'rgba(184,138,40,0.4)'  },
  slipping: { inner: 'rgba(232,152,152,0.9)', outer: 'rgba(196,104,104,0.4)' },
  falling:  { inner: 'rgba(214,85,85,0.9)',   outer: 'rgba(160,40,40,0.5)'   },
};

// Falling chips are the only ones dark enough to need light text;
// everything else uses near-black tinted toward the chip hue.
const TIER_TEXT = {
  climbing: { primary: '#0a3a18', secondary: 'rgba(0,0,0,0.6)',  tertiary: 'rgba(0,0,0,0.45)' },
  rising:   { primary: '#1c3d18', secondary: 'rgba(0,0,0,0.6)',  tertiary: 'rgba(0,0,0,0.45)' },
  flat:     { primary: '#3d2c08', secondary: 'rgba(0,0,0,0.62)', tertiary: 'rgba(0,0,0,0.48)' },
  slipping: { primary: '#3d1010', secondary: 'rgba(0,0,0,0.62)', tertiary: 'rgba(0,0,0,0.48)' },
  falling:  { primary: '#fff',    secondary: 'rgba(255,255,255,0.92)', tertiary: 'rgba(255,255,255,0.7)' },
};

// Solid headline color per tier. For tier word rendered on normal
// background (e.g. market-trend card, detail-card tier badge).
const TIER_HEADER_COLORS = {
  climbing: '#1f7a3a',
  rising:   '#5b8a3a',
  flat:     '#b08010',
  slipping: '#c46868',
  falling:  '#b03030',
};

// Map broad-market % change onto the same 5-tier scale. Tighter
// thresholds than alert tiers — broad indices move less than single
// stocks, so 0.5% is a meaningful S&P day, not 5%.
export function marketTierFor(pctChange) {
  const p = Number(pctChange);
  if (!Number.isFinite(p)) return 'flat';
  if (p >= 0.5)   return 'climbing';
  if (p >= 0.15)  return 'rising';
  if (p >= -0.15) return 'flat';
  if (p >= -0.5)  return 'slipping';
  return 'falling';
}

// CNN-style Fear & Greed bands (0–100). Returns descriptive label and
// the color we tint the headline number with.
export function fearBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return { label: '—', color: '#9aa6b8' };
  if (s < 25) return { label: 'Extreme fear',  color: '#b03030' };
  if (s < 45) return { label: 'Fear',          color: '#b08010' };
  if (s < 55) return { label: 'Neutral',       color: '#6b7a92' };
  if (s < 75) return { label: 'Greed',         color: '#5b8a3a' };
  return       { label: 'Extreme greed', color: '#1f7a3a' };
}

// VIX is on a totally different scale than F&G — typical 10–80, where
// low = calm and high = panic. We label and color it with VIX-native
// thresholds so a 27 reads as "Elevated" (which it is) instead of
// being mashed into a 0–100 fear/greed bar that mislabels it as Fear.
export function vixBand(vix) {
  const v = Number(vix);
  if (!Number.isFinite(v)) return { label: '—', color: '#9aa6b8' };
  if (v < 15) return { label: 'Calm',     color: '#1f7a3a' };
  if (v < 20) return { label: 'Normal',   color: '#5b8a3a' };
  if (v < 25) return { label: 'Moderate', color: '#b08010' };
  if (v < 30) return { label: 'Elevated', color: '#c46868' };
  if (v < 40) return { label: 'Nervous',  color: '#b03030' };
  return       { label: 'Panic', color: '#8a1010' };
}

function fmtMoney(v) {
  if (!v) return '—';
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
}

function typeFor(raw) { return TYPE_CONFIG[raw] || TYPE_CONFIG.vol_surge; }

// Dev-only warning for rows that can't produce a meaningful metric. Hitting
// this in dev means either (a) real missing data worth filtering upstream,
// or (b) a bug where the row shape lost a column we expected to read. Either
// way, we want it loud in the console the first time it renders so silent
// "—" fallbacks stop hiding data problems (observed 2026-04-17: confluence
// rows silently showed "—" for weeks because the upstream projection had
// dropped confluence_score and no one noticed).
function _warnNoMetric(h) {
  if (import.meta.env?.DEV) {
    console.warn('[historyMetric] no metric for signal_type=%s ticker=%s', h?.signal_type, h?.ticker, h);
  }
}

// Returns { text, color } for the rightmost metric in the history row
function historyMetric(h, t) {
  const type = h.signal_type;
  if (type === 'flow_signal') {
    const dp = Number(h.gap_pct) || 0;
    const premium = Number(h.avg_volume) || 0;
    const v = dp > 0 ? dp : premium;
    if (v > 0) return { text: fmtMoney(v), color: '#5eed8a' };
    const sweeps = Number(h.volume_ratio) || 0;
    if (sweeps > 0) return { text: `${sweeps} sweep${sweeps > 1 ? 's' : ''}`, color: '#5eed8a' };
    const trades = Number(h.volume) || 0;
    if (trades > 0) return { text: `${trades} trades`, color: '#5eed8a' };
    _warnNoMetric(h);
    return { text: '—', color: t.text3 };
  }
  if (type === '52w_high') {
    const p = Number(h.pct_from_high);
    if (!isFinite(p)) { _warnNoMetric(h); return { text: '—', color: t.text3 }; }
    if (p < 0.1) return { text: 'at high', color: '#fbbf24' };
    return { text: `-${p.toFixed(1)}%`, color: '#fbbf24' };
  }
  if (type === 'ma_cross') {
    const s = Number(h.short_ma), l = Number(h.long_ma);
    if (isFinite(s) && isFinite(l) && l > 0) {
      const diff = ((s - l) / l) * 100;
      return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`, color: diff >= 0 ? t.green : t.red };
    }
    return { text: '↑ cross', color: '#60a5fa' };
  }
  if (type === 'confluence') {
    // Read the structured columns first. breakout_alerts has dedicated
    // confluence_score / confluence_tier fields written by the confluence
    // scanner — the same columns mapAlert() reads for the detail card.
    // The old notes-regex path was a legacy fallback from before those
    // columns existed; it returns "—" against any row written by the
    // current scanner, which is why CONFLUENCE rows in Recent Alerts
    // rendered blank while the detail card above them showed the real
    // score and tier (observed 2026-04-17 on EXC, MRNA, NI).
    const score = h.confluence_score != null ? Number(h.confluence_score) : null;
    const tier  = h.confluence_tier || h.conviction || null;
    if (tier || score != null) {
      const parts = [];
      if (tier) parts.push(tier);
      if (score != null) parts.push(`${score}pts`);
      return { text: parts.join(' · '), color: '#d4af37' };
    }
    // Fallback for any pre-structured-column rows still in the 7-day window.
    // Actual notes format is "Tier A · Score 52 · RSI ..." (space, not colon);
    // the earlier regex expected "Tier:A / Score:52" and never matched.
    const notes = h.notes || '';
    const scoreMatch = notes.match(/Score[: ](\d+)/i);
    const tierMatch  = notes.match(/Tier[: ]([A-Z])/i);
    if (tierMatch || scoreMatch) {
      const parts = [];
      if (tierMatch) parts.push(tierMatch[1]);
      if (scoreMatch) parts.push(`${scoreMatch[1]}pts`);
      return { text: parts.join(' · '), color: '#d4af37' };
    }
    _warnNoMetric(h);
    return { text: '—', color: '#d4af37' };
  }
  if (type === 'vol_surge') {
    const v = Number(h.volume_ratio);
    if (isFinite(v) && v > 0) return { text: `${v.toFixed(1)}x vol`, color: '#a78bfa' };
  }
  // gap_up stores the move in gap_pct, not change_pct — fall back to either so
  // Recent Alerts never shows "—" for a row that actually has a move logged.
  const rawPct = h.change_pct ?? h.gap_pct;
  const pct = Number(rawPct);
  if (isFinite(pct) && pct !== 0) return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? t.green : t.red };
  _warnNoMetric(h);
  return { text: '—', color: t.text3 };
}

function mapAlert(a) {
  const ticker = a.ticker ?? a.tickers?.[0] ?? '—';
  const type = a.signal_type ?? a.alert_type ?? 'vol_surge';
  const isFlow = type === 'flow_signal';
  const isConfluence = type === 'confluence';

  const change = isFlow ? (a.change_pct ?? 0) : (a.change_pct ?? a.gap_pct ?? 0);
  const changePct = Number(change) || 0;
  // gap_pct holds totalDarkpoolValue and avg_volume holds totalPremium for
  // flow rows (see fetch-flow-data/index.ts:706,708). Falling back to the
  // premium when dark pool is zero lets options-only flow signals (sweeps
  // + premium, no dark prints) clear the displayAlerts >0 filter and
  // compete for bubble grid slots — without that fallback, stale dark-pool
  // rows squat on the grid while fresh options-only signals never surface.
  const flowDollars = isFlow ? (Number(a.gap_pct) || Number(a.avg_volume) || 0) : 0;
  const company = a.company ?? a.name ?? '';
  const price = a.price ?? a.current_price ?? null;
  const volRatio = a.volume_ratio ?? a.rel_volume ?? null;

  const flowPremium = isFlow && a.avg_volume ? Number(a.avg_volume) : null;
  const flowSweeps = isFlow && a.volume_ratio ? Number(a.volume_ratio) : 0;
  const flowDpValue = isFlow && a.gap_pct ? Number(a.gap_pct) : null;

  // Read structured columns written by the confluence scanner.
  // Falls back to conviction for legacy rows that pre-date the structured columns.
  let confluenceScore = null, confluenceTier = null, confluenceSignals = null;
  if (isConfluence) {
    confluenceScore   = a.confluence_score != null ? Number(a.confluence_score) : null;
    confluenceTier    = a.confluence_tier ?? a.conviction ?? null;
    confluenceSignals = a.component_signals ? (Array.isArray(a.component_signals) ? a.component_signals.join(' + ') : String(a.component_signals)) : null;
  }
  const tier = a.conviction ?? confluenceTier ?? null;

  let explanation = a.title || a.signal || '';
  if (!explanation) {
    if (isConfluence) {
      const tierLabel = confluenceTier || tier || 'A';
      const pts = confluenceScore ? `${confluenceScore}pts` : '';
      const sigs = confluenceSignals ? ` · ${confluenceSignals}` : '';
      explanation = `${tierLabel}-Tier confluence${pts ? ` (${pts})` : ''}${sigs}`;
    } else if (type === 'vol_surge' && volRatio) {
      explanation = `Trading ${Number(volRatio).toFixed(1)}x normal volume`;
      if (changePct) explanation += ` with price ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)}%`;
    } else if (isFlow) {
      const parts = [];
      if (flowSweeps > 0) parts.push(`${flowSweeps} bullish call sweep${flowSweeps !== 1 ? 's' : ''}`);
      if (flowPremium) parts.push(`${fmtMoney(flowPremium)} in premiums`);
      if (flowDpValue) parts.push(`${fmtMoney(flowDpValue)} dark pool`);
      explanation = parts.join(' · ') || 'Unusual institutional activity detected';
    } else if (type === '52w_high') {
      explanation = `Near 52-week high${a.pct_from_high != null ? ` (within ${a.pct_from_high}%)` : ''}`;
    } else if (type === 'gap_up') {
      explanation = `Gapped up ${Math.abs(changePct).toFixed(1)}% at open`;
    } else if (type === 'ma_cross') {
      explanation = 'Short-term trend crossed above long-term';
    }
  }

  const confluenceStats = [
    { label: 'Score', value: confluenceScore != null ? `${confluenceScore}pts` : '—' },
    { label: 'RSI',   value: a.rsi   != null ? Number(a.rsi).toFixed(0)   : '—' },
    { label: 'ADX',   value: a.adx   != null ? Number(a.adx).toFixed(0)   : '—' },
    { label: 'Tier',  value: confluenceTier || tier || '—' },
  ];

  const stats = isConfluence ? confluenceStats : isFlow ? [
    { label: 'Sweeps', value: flowSweeps || '—' },
    { label: 'Premium', value: fmtMoney(flowPremium) },
    { label: 'Dark Pool', value: fmtMoney(flowDpValue) },
    { label: 'Direction', value: changePct >= 0 ? 'Bull' : 'Bear', color: changePct >= 0 },
  ] : [
    { label: 'Volume', value: volRatio ? `${Number(volRatio).toFixed(1)}x` : '—' },
    { label: 'Price', value: price ? `$${Number(price).toFixed(2)}` : '—' },
    { label: 'Change', value: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`, color: changePct >= 0 },
    { label: 'Signal', value: a.notes ? a.notes.slice(0, 20) : (volRatio ? volRatio + 'x avg' : '—') },
  ];

  return { id: a.id, ticker, type, isFlow, isConfluence, tier, changePct, flowDollars, company, price, explanation, stats, created_at: a.created_at };
}

// ===== MAIN COMPONENT =====
export default function AlertsTab({ darkMode, isAdmin = false }) {
  const t = useTheme(darkMode);
  // Futures + SPY pulse feed the Market trend card above the chip field.
  // loadMarketIndicators() is the public entrypoint — it fetches futures
  // when the market is closed and pulse when open. Same source HomeTab uses.
  const { futuresData, marketPulse, marketStatus, loadMarketIndicators } = useMarketData();
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [fearScore, setFearScore] = useState(null);
  const [vixScore, setVixScore] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [perfHistory, setPerfHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connState, setConnState] = useState('connecting'); // 'live' | 'reconnecting' | 'connecting'
  const [tick, setTick] = useState(0); // forces "Xs ago" label to re-render
  // True while we're invoking track-alert-performance + awaiting the refetch.
  // Drives the FreshnessBar's spinner + disables re-tap while in flight.
  const [refreshing, setRefreshing] = useState(false);
  // Tracks whether we've been disconnected so we can refetch once on re-subscribe.
  // Held in a ref (not state) so the side effect lives outside React's render/commit
  // cycle — avoids StrictMode double-invoking a side effect placed in a setState updater.
  const wasDisconnectedRef = useRef(false);

  // Cohort stats power the confidence line + lifecycle status inside the
  // detail panel when a chip is tapped. Pulled once — small view, rarely changes.
  const [cohortStats, setCohortStats] = useState([]);

  // Extracted so we can refetch on focus + reconnect
  const loadData = useCallback(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [alertsRes, perfRes, marketRes] = await Promise.all([
      supabase.from('breakout_alerts').select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        // Was .limit(50) — with 52w_high and gap_up dominating daily volume,
        // the 50 most recent rows would starve out lower-volume types like
        // confluence and flow_signal. Users clicking the "Top" or "Big $"
        // filter saw an empty list even when the DB had plenty of recent
        // matching rows (observed 2026-04-17: 14 confluence + 34 flow_signal
        // in last 7d, but zero of either in the top 50 fetched because
        // 52w_high/gap_up occupied the whole window). 500 is enough headroom
        // for a full week of mixed-signal output.
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('alert_performance').select('*')
        .not('outcome', 'is', null)
        .gte('tracked_at', POLYGON_SCORING_CUTOFF)   // drop FMP-era rows from win rate
        .in('signal_type', Object.keys(TYPE_CONFIG))
        // Was .limit(100) — but the SCORED stat card showed that 100 as if it
        // were the true resolved count, when the table actually held ~500+
        // resolved rows post-cutoff. Stats were computed from only the 100
        // most recent, which (a) misrepresented sample size to the user and
        // (b) truncated win rate to a rolling tail instead of the full
        // post-cutoff cohort. Raised to 1000 so the count is real and the
        // stats use the full population. Ceiling stays in place so a runaway
        // insert rate can't DoS the client's memory.
        .order('alert_time', { ascending: false }).limit(1000),
      supabase.from('market_data').select('*'),
    ]);
    // Log any failed branch in DEV so we notice when the stats card is
    // stale or blank because one specific query errored — the UI just
    // shows empty rows otherwise with no trail back to the cause.
    if (import.meta.env.DEV) {
      if (alertsRes.error) console.warn('[AlertsTab] loadData breakout_alerts failed:', alertsRes.error?.message || alertsRes.error);
      if (perfRes.error)   console.warn('[AlertsTab] loadData alert_performance failed:', perfRes.error?.message || perfRes.error);
      if (marketRes.error) console.warn('[AlertsTab] loadData market_data failed:', marketRes.error?.message || marketRes.error);
    }
    if (alertsRes.data) setLiveAlerts(alertsRes.data);
    if (perfRes.data) setPerfHistory(perfRes.data);
    if (marketRes.data) {
      // VIX and Fear & Greed are different metrics on different scales
      // (VIX 10–80 volatility index, F&G 0–100 sentiment index). Render
      // them as separate cards rather than collapsing one into the
      // other. fear_greed stays strictly null when missing so the F&G
      // pill renders "—" rather than mislabeling VIX as Fear.
      const fg  = marketRes.data.find(r => r.key === 'fear_greed');
      const vix = marketRes.data.find(r => r.key === 'vix_score');
      setFearScore(fg?.value?.score ?? null);
      setVixScore(vix?.value?.score ?? null);
    }
    // FreshnessBar lives under the STATS strip (Scored / Win rate / Avg return)
    // so it has to reflect when the SCORING data was last updated, not just
    // "I fetched something". Previously this was set to `new Date()` which made
    // "Live · Updated just now" always render even when the last cron run was
    // a day old and the scores hadn't moved. Now it reflects the freshest
    // tracked_at in perfHistory — if the cron is lagging, the label says so.
    const latestTrackedAt = (perfRes.data || [])
      .map(r => r.tracked_at)
      .filter(Boolean)
      .reduce((max, cur) => (!max || cur > max ? cur : max), null);
    setLastUpdated(latestTrackedAt ? new Date(latestTrackedAt) : null);
    setLoading(false);
  }, []);

  // Fetch cohort stats (the v_signal_cohort_stats view).
  //
  // Originally this lived inline in a mount-only useEffect([]) — so stats
  // never refreshed mid-session even when the scorer closed new snapshots
  // and the view's underlying aggregate moved. That was a silent staleness
  // bug: the top-level stats strip (SCORED / WIN RATE / AVG RETURN) updated
  // live via alert_performance realtime, but the detail panel's confidence
  // line kept reading against the mount-time cohort. Users would reasonably
  // assume the two strips stay in sync.
  //
  // Extracted into a useCallback so `refreshScores` can call it alongside
  // loadData() — one tap on ↻ now updates every score-derived surface at
  // the same cadence. Declared here (above refreshScores) so the
  // useCallback dependency reference doesn't hit a temporal dead zone.
  const loadCohortStats = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_signal_cohort_stats')
      .select('*');
    if (error) {
      console.warn('[alerts] cohort stats unavailable:', error.message);
      return;
    }
    setCohortStats(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadCohortStats();
    })();
    return () => { cancelled = true; };
  }, [loadCohortStats]);

  // Fetch market data once on mount so the Market trend card can render.
  // Not memoized in the hook (it closes over fetch helpers that change
  // per render), so we run it once with empty deps to avoid a render→
  // fetch→render loop. Re-fetched on focus alongside loadData().
  useEffect(() => {
    loadMarketIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual scorer trigger — wired to the FreshnessBar's ↻ button.
  //
  // Why this exists: previously ↻ called loadData() which only re-reads
  // alert_performance from the DB. When the scoring cron lagged (observed
  // 21h gap on 2026-04-17), tapping "refresh" did nothing visible because
  // the underlying rows hadn't been updated — the button looked broken.
  //
  // Now ↻ invokes the track-alert-performance edge function (the same one
  // the pg_cron hits every 3h), then refetches. Tap → scores actually
  // update. If the cron hiccups, users have a self-service fallback that
  // matches the stickiness goal: one tap does what the label promises.
  //
  // Timeout note: Supabase's functions.invoke client bails at ~30s, but
  // the edge function keeps running server-side for up to its own 150s
  // budget. A thrown error here almost always means "client gave up, job
  // is still finishing" — we swallow it and refetch anyway. The refetch
  // is the source of truth for what actually landed.
  const refreshScores = useCallback(async () => {
    // Admin-only: the edge function is a real job (Polygon API calls, DB writes)
    // so we don't expose the trigger to regular users. For non-admins, the ↻
    // icon is hidden entirely and this callback short-circuits — a defense-in-
    // depth check in case the button is ever exposed elsewhere.
    if (!isAdmin) return;
    if (refreshing) return;
    setRefreshing(true);
    try {
      await supabase.functions.invoke('track-alert-performance', { body: {} });
    } catch (e) {
      // Expected on busy runs — server keeps going past the client's 30s.
      console.warn('[alerts] scorer invoke returned error (likely client timeout):', e?.message);
    }
    // Refetch both in parallel: alert_performance drives the SCORED / WIN RATE /
    // AVG RETURN strip, and v_signal_cohort_stats drives the detail panel's
    // "Usually wins / Building history" confidence line. Keeping them on the
    // same tap prevents the "top updated, bottom didn't" asymmetry users hit
    // before this fix.
    await Promise.all([loadData(), loadCohortStats()]);
    setRefreshing(false);
  }, [loadData, loadCohortStats, refreshing, isAdmin]);

  // Fetch alerts + performance + market data in parallel, subscribe to realtime
  useEffect(() => {
    loadData();

    const onSubStatus = (status) => {
      if (status === 'SUBSCRIBED') {
        // Rejoining after a drop? Refetch once to catch anything missed while offline.
        // Side effect lives here (not inside a setState updater) so StrictMode's
        // double-invocation of reducers can't cause a duplicate refetch.
        if (wasDisconnectedRef.current) {
          wasDisconnectedRef.current = false;
          loadData();
        }
        setConnState('live');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        wasDisconnectedRef.current = true;
        setConnState('reconnecting');
      }
    };

    const alertCh = supabase.channel('alerts_chips_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'breakout_alerts' }, ({ new: row }) => {
        setLiveAlerts(prev => [row, ...prev]);
        // Intentionally NOT bumping lastUpdated here. The FreshnessBar sits
        // under the stats strip and its label describes when SCORES were
        // last updated. An alert INSERT is a new pending row, not a new
        // score — previously this bump made the label say "just now" while
        // win-rate data was a day stale. Alert-level freshness is already
        // shown in the header's "Last scan: X ago" line.
      }).subscribe(onSubStatus);

    const perfCh = supabase.channel('perf_chips_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_performance' }, ({ eventType, new: row }) => {
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          // Mirror the initial-fetch filter: ignore rows scored before the Polygon cutoff
          // so backfill writes to old rows can't leak FMP-era data into the live window.
          const trackedAt = row.tracked_at ? new Date(row.tracked_at).getTime() : 0;
          const cutoff = new Date(POLYGON_SCORING_CUTOFF).getTime();
          if (trackedAt && trackedAt < cutoff) return;
          setPerfHistory(prev => {
            const rest = prev.filter(p => p.id !== row.id);
            // Slice cap matches the initial-fetch limit (1000) so the
            // in-memory window never silently diverges from the DB query.
            return (row.outcome || row.admin_outcome) ? [row, ...rest].slice(0, 1000) : rest;
          });
          // Use the row's own tracked_at (source of truth) rather than
          // Date.now(), so the label tracks when the score was actually
          // computed — not when realtime happened to deliver it.
          if (row.tracked_at) setLastUpdated(new Date(row.tracked_at));
        }
      }).subscribe(onSubStatus);

    // Catch the "tab was backgrounded / laptop slept" case — refetch on focus.
    // Also re-pull market data so the Market trend card doesn't show a stale
    // snapshot from before the user backgrounded the app.
    const onFocus = () => { loadData(); loadMarketIndicators(); };
    window.addEventListener('focus', onFocus);

    // Re-render the "Xs ago" label every 15s so it stays fresh
    const tickInt = setInterval(() => setTick(n => n + 1), 15000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(tickInt);
      supabase.removeChannel(alertCh);
      supabase.removeChannel(perfCh);
    };
  }, [loadData]);

  // Lookup: best cohort row for a given signal_type.
  // "Best" = prefer the shortest horizon that has enough samples to score.
  const cohortFor = useMemo(() => {
    const byType = new Map();
    const horizonRank = h => (h === '1d' ? 0 : h === '7d' ? 1 : h === '30d' ? 2 : 3);
    (cohortStats || []).forEach(row => {
      const cur = byType.get(row.signal_type);
      if (!cur || horizonRank(row.horizon) < horizonRank(cur.horizon)) {
        byType.set(row.signal_type, row);
      }
    });
    return (signalType) => byType.get(signalType) || null;
  }, [cohortStats]);

  // Lookup: perf row for a given alert id (newest matching row wins).
  const perfByAlertId = useMemo(() => {
    const m = new Map();
    (perfHistory || []).forEach(p => {
      if (p?.alert_id && !m.has(p.alert_id)) m.set(p.alert_id, p);
    });
    return m;
  }, [perfHistory]);

  const displayAlerts = useMemo(() => {
    return liveAlerts
      .filter(r => GRID_SIGNAL_TYPES.has(r.signal_type))
      .map(mapAlert)
      .filter(a => a.ticker !== '—' && (Math.abs(a.changePct) > 0.05 || a.flowDollars > 0));
  }, [liveAlerts]);

  // Build the 8-chip grid in two passes so the tier color spread is
  // always visible. gap_up fires in batches of 8+ daily, while confluence
  // / flow_signal / ma_cross fire only when their conditions hit — a
  // simple "most-recent 8" picker would let gap_up monopolize the grid
  // and the page would look like a wall of one tier (today: all red).
  //
  // Pass 1: take the most-recent alert from each signal_type. Guarantees
  //   one chip per scanner so the user sees the full Climbing→Falling
  //   range whenever any of those types has fired in the last 7 days.
  // Pass 2: fill the remaining slots with most-recent alerts of any type
  //   that don't duplicate a ticker we've already shown.
  // Both passes preserve the input order (createdAt desc), so each
  // signal_type's representative is its newest alert, and the fillers
  // are the next-newest unseen-ticker alerts.
  // Build the 8-chip grid with a fixed tier distribution: 3 up, 2 flat,
  // 3 down. Guarantees the user always sees the full Climbing→Falling
  // color range whenever the database has any of those tiers in the
  // last 7 days, regardless of which scanner happens to be firing
  // most that day. (gap_up alone produces ~46 alerts/week; without
  // bucketing it would always dominate the most-recent-N picker and
  // the page would look like a wall of red.)
  //
  // Pass 1: walk most-recent → least-recent, drop each alert into its
  //   tier bucket up to that bucket's target. Dedupe by ticker so the
  //   same symbol doesn't appear twice on the field.
  // Pass 2: if any bucket couldn't reach its target (e.g. no Climbing
  //   alerts in the window), fill remaining slots by pure recency from
  //   any tier so the grid always shows 8 chips when 8+ are available.
  const uniqueAlerts = useMemo(() => {
    const TIER_BUCKET = {
      climbing: 'up',   rising:   'up',
      flat:     'flat',
      slipping: 'down', falling:  'down',
    };
    const TARGETS = { up: 3, flat: 2, down: 3 };
    const buckets = { up: [], flat: [], down: [] };
    const usedTickers = new Set();

    // Pass 1: bucket-target fill.
    for (const a of displayAlerts) {
      if (usedTickers.has(a.ticker)) continue;
      const cohort = cohortFor(a.type);
      const tier = tierFor(Number(cohort?.hit_rate_pct), Number(cohort?.n_samples) || 0);
      const bucket = TIER_BUCKET[tier] || 'flat';
      if (buckets[bucket].length < TARGETS[bucket]) {
        buckets[bucket].push(a);
        usedTickers.add(a.ticker);
      }
    }

    const result = [...buckets.up, ...buckets.flat, ...buckets.down];

    // Pass 2: backfill any unfilled slots by recency, regardless of tier.
    for (const a of displayAlerts) {
      if (result.length >= 8) break;
      if (usedTickers.has(a.ticker)) continue;
      usedTickers.add(a.ticker);
      result.push(a);
    }

    return result;
  }, [displayAlerts, cohortFor]);

  // Derive history from liveAlerts instead of a separate query.
  // When a confluence row exists for a ticker, hide the individual signal rows
  // for that same ticker so the list isn't cluttered with its component signals.
  //
  // Was slice(0, 30). Problem: 52w_high + gap_up dominate insertion volume
  // (~60% of the daily feed), so the 30 most recent rows were almost always
  // 100% those two types. The "Top" (confluence) and "Big $" (flow_signal)
  // filters both ended up filtering a 30-row list with zero matches even
  // when the DB had plenty of recent rows of those types. Slicing to 100
  // gives enough headroom for the rarer signal types to surface while
  // keeping the expanded-view render count sane.
  const alertHistory = useMemo(() => {
    // Pass rows through as-is instead of re-projecting into a hand-maintained
    // column allowlist. The old pick-list caused silent bugs: any new column
    // added to breakout_alerts (confluence_score/_tier, conviction, etc.)
    // had to be manually added here too, or downstream readers would see
    // `undefined` and quietly render nothing. Observed 2026-04-17 with
    // confluence rows showing "—" for the tier/score metric. The fetch
    // already does `select('*')`, so rows carry every column — there's no
    // memory reason to trim, and there IS a correctness reason not to.
    const rows = liveAlerts.slice(0, 100);
    const confluenceTickers = new Set(
      rows.filter(r => r.signal_type === 'confluence').map(r => r.ticker)
    );
    return rows.filter(r => r.signal_type === 'confluence' || !confluenceTickers.has(r.ticker));
  }, [liveAlerts]);

  const alertStats = useMemo(() => {
    const total = alertHistory.length;
    const byType = {};
    alertHistory.forEach(a => { byType[a.signal_type || 'vol_surge'] = (byType[a.signal_type || 'vol_surge'] || 0) + 1; });
    // Only count signal types shown in the Action alerts feed
    const actionTypes = new Set(Object.keys(TYPE_CONFIG));
    const resolved = perfHistory.filter(h => h.return_pct != null && actionTypes.has(h.signal_type));
    // Match the scoring function's threshold (HIT_THRESHOLDS['1d'] = 0 → any non-negative return = hit)
    const wins = resolved.filter(h => h.return_pct >= 0).length;
    const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
    const avgReturn = resolved.length > 0 ? resolved.reduce((s, h) => s + Number(h.return_pct), 0) / resolved.length : null;
    return { total, byType, winRate, avgReturn, resolvedCount: resolved.length, hasPerf: resolved.length > 0 };
  }, [alertHistory, perfHistory]);

  const selectedAlert = selectedId ? uniqueAlerts.find(a => a.id === selectedId) : null;
  const hasAlerts = uniqueAlerts.length > 0;

  if (loading) {
    return (
      <div style={{ background: t.bg, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: t.text3, fontFamily: "'DM Sans', sans-serif" }}>Loading alerts…</span>
      </div>
    );
  }

  return (
    <div style={{ background: t.bg, flex: 1, maxWidth: '100%', width: '100%', padding: '12px 12px 80px', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{FLOAT_KEYFRAMES}</style>

      {/* ═══ HEADER ═══ */}
      {/* SentimentPill removed — fear is now rendered in the larger
          Fear-gauge card below (with a CNN-style horizontal gauge).
          Showing both was redundant. */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ position: 'relative', paddingLeft: 10 }}>
          <div style={{
            position: 'absolute', left: 0, top: 2, bottom: 2, width: 3,
            borderRadius: 2,
            background: darkMode
              ? 'linear-gradient(180deg, #4a90d9, #3a7cc0)'
              : 'linear-gradient(180deg, #132d52, #1a3a5e)',
          }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}>
            Action Alerts
          </div>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>
            Last scan: <span style={{ color: t.green, fontWeight: 600 }}>{liveAlerts.length > 0 ? timeAgo(liveAlerts[0]?.created_at) : 'pending'}</span> · {uniqueAlerts.length} alert{uniqueAlerts.length !== 1 ? 's' : ''} live
          </div>
        </div>
      </div>

      {/* ═══ MARKET TREND + FEAR GAUGE ═══ */}
      {(() => {
        // Pick the freshest source: SPY (market open) → ES=F futures
        // (after-hours / weekend) → SPY ETF fallback.
        const isOpen = marketStatus === 'open';
        const spy   = isOpen ? marketPulse?.['SPY'] : null;
        const esF   = futuresData?.['ES=F'];
        const spyEt = futuresData?.['SPY'];
        const sp = spy || esF || spyEt;
        const spChange = sp && Number.isFinite(Number(sp.change)) ? Number(sp.change) : null;
        const mTier = marketTierFor(spChange);
        const fb = fearBand(fearScore);
        const vb = vixBand(vixScore);
        // Guard against null/undefined → Number() coercion landing at 0,
        // which would otherwise mask a missing row as a real "0" reading.
        const fearNum = fearScore == null ? NaN : Number(fearScore);
        const vixNum  = vixScore  == null ? NaN : Number(vixScore);
        const cardStyle = {
          background: t.card,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minHeight: 26,
        };
        const lblStyle = {
          fontSize: 7, color: t.text3,
          letterSpacing: 0.4, textTransform: 'uppercase',
          fontWeight: 700,
          flex: '0 0 auto',
        };
        const valStyle = (color) => ({
          fontSize: 11, fontWeight: 800, color, letterSpacing: -0.2,
        });
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
            {/* MKT — broad market direction (S&P proxy) */}
            <div style={cardStyle}>
              <span style={lblStyle}>Mkt</span>
              <span style={valStyle(TIER_HEADER_COLORS[mTier])}>
                {TIER_LABELS[mTier]}
              </span>
              {Number.isFinite(spChange) && (
                <span style={{ fontSize: 8, color: t.text3, marginLeft: 'auto' }}>
                  {spChange >= 0 ? '+' : ''}{spChange.toFixed(2)}%
                </span>
              )}
            </div>

            {/* VIX — volatility index, native scale + native labels */}
            <div style={cardStyle}>
              <span style={lblStyle}>VIX</span>
              <span style={valStyle(vb.color)}>
                {Number.isFinite(vixNum) ? vixNum.toFixed(1) : '—'}
              </span>
              <span style={{ fontSize: 8, color: t.text3, marginLeft: 'auto' }}>
                {vb.label}
              </span>
            </div>

            {/* F&G — CNN Fear & Greed, 0–100 with horizontal gauge bar.
                Renders "—" when fear_greed row is missing rather than
                falling back to VIX (which has different scale semantics). */}
            <div style={cardStyle}>
              <span style={lblStyle}>F&amp;G</span>
              <span style={valStyle(fb.color)}>
                {Number.isFinite(fearNum) ? Math.round(fearNum) : '—'}
              </span>
              {Number.isFinite(fearNum) ? (
                <div style={{
                  position: 'relative',
                  flex: 1, height: 3, borderRadius: 2,
                  background: 'linear-gradient(90deg, #d65555 0%, #d65555 22%, #e8a070 30%, #e8d068 45%, #aed8a0 60%, #5eed8a 78%, #5eed8a 100%)',
                }}>
                  <div style={{
                    position: 'absolute', top: -2,
                    left: `${Math.max(0, Math.min(100, fearNum))}%`,
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#fff',
                    border: `1.5px solid ${darkMode ? '#1a2538' : '#0d2240'}`,
                    transform: 'translateX(-50%)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  }} />
                </div>
              ) : (
                <span style={{ fontSize: 8, color: t.text3, marginLeft: 'auto' }}>—</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══ CHIP ZONE ═══ */}
      {hasAlerts && (
        <div style={{
          position: 'relative', height: selectedAlert ? 100 : 170,
          borderRadius: 10,
          marginBottom: 10, overflow: 'hidden', transition: 'height 0.3s ease',
          background: darkMode
            ? 'radial-gradient(ellipse 60% 40% at 50% 35%, rgba(80,110,160,0.25) 0%, transparent 60%), radial-gradient(ellipse at 50% 50%, #1e2a42 0%, #151d30 45%, #0c1220 95%, #060a14 100%)'
            : 'radial-gradient(ellipse 60% 40% at 50% 35%, rgba(255,255,255,0.8) 0%, transparent 60%), radial-gradient(ellipse at 50% 50%, #ffffff 0%, #f0f5fb 45%, #c9d5e4 95%, #b0becf 100%)',
          border: darkMode ? '1px solid rgba(80,110,160,0.25)' : '1px solid rgba(150,170,195,0.5)',
          boxShadow: darkMode
            ? 'inset 0 2px 6px rgba(150,180,220,0.1), inset 0 -2px 10px rgba(0,0,0,0.6), inset 0 0 50px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.5)'
            : 'inset 0 2px 6px rgba(255,255,255,0.8), inset 0 -2px 10px rgba(19,45,82,0.1), inset 0 0 50px rgba(19,45,82,0.05), 0 2px 8px rgba(19,45,82,0.08)',
        }}>
          {uniqueAlerts.map((alert, i) => {
            const isSelected = selectedId === alert.id;
            const size = alert.isFlow ? chipSize(alert.flowDollars / 500000) : chipSize(alert.changePct);
            const f = freshness(alert.created_at);
            const isHot = f >= 0.85;
            // Cohort lookup → tier → color + label. tierFor() falls back
            // to 'flat' when cohort is missing or below MIN_SAMPLES_FLOOR
            // so we never paint a confident color on noisy data.
            const cohort = cohortFor(alert.type);
            const winRate = Number(cohort?.hit_rate_pct);
            const samples = Number(cohort?.n_samples) || 0;
            const tier = tierFor(winRate, samples);
            const tierLabel = TIER_LABELS[tier];
            const tierGradient = TIER_GRADIENTS[tier];
            const tierBorders = TIER_BORDERS[tier];
            const tierText = TIER_TEXT[tier];
            const winRateLabel = (Number.isFinite(winRate) && samples >= MIN_SAMPLES_FLOOR)
              ? `${tierLabel} · ${Math.round(winRate)}%`
              : tierLabel;
            return (
              <div key={alert.id} onClick={() => setSelectedId(prev => prev === alert.id ? null : alert.id)}
                style={{
                  position: 'absolute', ...CHIP_SLOTS[i % 8],
                  animation: isSelected ? 'none' : `float${i % 8} ${FLOAT_DURATIONS[i % 8]}s ease-in-out infinite`,
                  opacity: selectedAlert && !isSelected ? 0.35 : 1,
                  transition: 'opacity 0.3s ease', cursor: 'pointer',
                  zIndex: isSelected ? 10 : isHot ? 5 : 1,
                }}>
                {/* Chip color + label come from the historical cohort tier
                    (Climbing → Falling). Same chrome (highlight, shadow,
                    inset border) as before — only the hue family changes
                    per tier. Selected/fresh effects are tier-agnostic. */}
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: tierGradient,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: [
                    'inset 1.5px 1.5px 2px rgba(255,255,255,0.6)',
                    'inset -1.5px -1.5px 2px rgba(0,0,0,0.25)',
                    `inset 0 0 0 2px ${tierBorders.inner}`,
                    `inset 0 0 0 3px ${tierBorders.outer}`,
                    isSelected ? '0 0 0 3px rgba(123,140,222,0.5)' : null,
                    !isSelected && isHot ? '0 0 8px rgba(94,237,138,0.35)' : null,
                  ].filter(Boolean).join(', '),
                  transition: 'box-shadow 0.2s ease',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: tierText.primary,
                    lineHeight: 1, fontFamily: "'Outfit', sans-serif",
                  }}>{alert.ticker}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: tierText.secondary,
                    lineHeight: 1, marginTop: 2,
                    maxWidth: size - 8,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {alert.isFlow
                      ? fmtMoney(alert.flowDollars)
                      : `${alert.changePct >= 0 ? '+' : ''}${alert.changePct.toFixed(1)}%`}
                  </span>
                  <span style={{
                    fontSize: 7, fontWeight: 700,
                    color: tierText.tertiary,
                    lineHeight: 1, marginTop: 2,
                    letterSpacing: 0.2, textAlign: 'center', maxWidth: size - 8,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {winRateLabel}
                  </span>
                </div>
              </div>
            );
          })}
          {!selectedAlert && (
            <div style={{
              position: 'absolute', bottom: 5, width: '100%', textAlign: 'center', fontSize: 8,
              color: darkMode ? 'rgba(150,175,210,0.6)' : 'rgba(122,142,163,0.7)',
            }}>
              tap any chip for details
            </div>
          )}
        </div>
      )}

      {/* ═══ DETAIL PANEL ═══ */}
      {selectedAlert && (
        <DetailPanel
          alert={selectedAlert}
          rawAlert={liveAlerts.find(r => r.id === selectedAlert.id) || null}
          perfRow={perfByAlertId.get(selectedAlert.id) || null}
          cohort={cohortFor(selectedAlert.type)}
          t={t}
        />
      )}

      {/* ═══ EDUCATION ═══ */}
      <EducationZone t={t} darkMode={darkMode} />

      {/* ═══ STATS STRIP ═══ */}
      {(alertStats.total > 0 || alertStats.resolvedCount > 0) && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <StatCard
              label={alertStats.hasPerf ? 'Scored' : 'Total alerts'}
              value={alertStats.hasPerf ? alertStats.resolvedCount : alertStats.total}
              color={t.text1}
              t={t}
              darkMode={darkMode}
            />
            {alertStats.hasPerf ? (
              <>
                <StatCard label="Win rate" value={`${alertStats.winRate}%`} color={alertStats.winRate >= 50 ? t.green : t.red} t={t} darkMode={darkMode} />
                <StatCard label="Avg return" value={`${alertStats.avgReturn >= 0 ? '+' : ''}${alertStats.avgReturn.toFixed(1)}%`} color={alertStats.avgReturn >= 0 ? t.green : t.red} t={t} darkMode={darkMode} />
              </>
            ) : (
              <>
                <StatCard label="Breakouts" value={alertStats.byType['52w_high'] || 0} color="#fbbf24" t={t} darkMode={darkMode} />
                <StatCard label="Big money" value={alertStats.byType['flow_signal'] || 0} color="#5eed8a" t={t} darkMode={darkMode} />
              </>
            )}
          </div>
          {/* Stale-scores indicator is a dev/admin diagnostic. Hidden
              entirely from regular users; admin keeps the bug-catching hook. */}
          {isAdmin && (
            <FreshnessBar
              lastUpdated={lastUpdated}
              connState={connState}
              onRefresh={refreshScores}
              refreshing={refreshing}
              canRefresh={isAdmin}
              tick={tick}
              t={t}
              darkMode={darkMode}
            />
          )}
        </>
      )}

      {/* ═══ ALERT HISTORY ═══ */}
      {alertHistory.length > 0 && (
        <div style={{
          borderRadius: 12,
          overflow: 'hidden', marginTop: 10,
          background: darkMode
            ? 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(80,110,160,0.18) 0%, transparent 65%), radial-gradient(ellipse at 50% 50%, #1a2538 0%, #131b2d 50%, #0a1020 100%)'
            : 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(255,255,255,0.85) 0%, transparent 65%), radial-gradient(ellipse at 50% 50%, #ffffff 0%, #f4f8fd 50%, #d6e0ed 100%)',
          border: darkMode ? '1px solid rgba(80,110,160,0.2)' : '1px solid rgba(165,180,205,0.5)',
          boxShadow: darkMode
            ? 'inset 0 1.5px 4px rgba(150,180,220,0.08), inset 0 -1.5px 5px rgba(0,0,0,0.5), inset 0 0 25px rgba(0,0,0,0.3), 0 1.5px 5px rgba(0,0,0,0.4)'
            : 'inset 0 1.5px 4px rgba(255,255,255,0.85), inset 0 -1.5px 5px rgba(19,45,82,0.07), inset 0 0 25px rgba(19,45,82,0.035), 0 1.5px 5px rgba(19,45,82,0.06)',
        }}>
          <div style={{
            padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: darkMode ? '1px solid rgba(100,130,170,0.2)' : '1px solid rgba(165,180,205,0.3)',
            background: darkMode
              ? 'linear-gradient(180deg, rgba(80,110,160,0.08), transparent)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Outfit', sans-serif" }}>Recent alerts</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {HISTORY_FILTERS.map(f => {
                const active = historyFilter === f.key;
                return (
                  <span key={f.key} onClick={() => setHistoryFilter(f.key)}
                    style={{
                      fontSize: 10.5, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 999,
                      cursor: 'pointer',
                      background: active
                        ? (darkMode ? '#4a90d9' : '#132d52')
                        : 'transparent',
                      color: active ? '#fff' : t.text3,
                      border: active
                        ? (darkMode ? '0.5px solid #4a90d9' : '0.5px solid #132d52')
                        : '0.5px solid transparent',
                      boxShadow: active
                        ? (darkMode ? '0 2px 6px rgba(74,144,217,0.3)' : '0 2px 6px rgba(19,45,82,0.2)')
                        : 'none',
                    }}>{f.label}</span>
                );
              })}
            </div>
          </div>
          {(() => {
            const filtered = alertHistory.filter(h =>
              historyFilter === 'all' ||
              (historyFilter === 'confluence' && h.signal_type === 'confluence') ||
              (historyFilter === 'stocks' && !FLOW_TYPES.has(h.signal_type) && h.signal_type !== 'confluence') ||
              (historyFilter === 'flow' && FLOW_TYPES.has(h.signal_type))
            );
            const visible = showAllHistory ? filtered : filtered.slice(0, 5);
            return (
              <>
                {visible.length === 0 && (
                  <div style={{
                    padding: '14px 12px', textAlign: 'center', color: t.text3, fontSize: 12,
                    borderTop: `1px solid ${darkMode ? 'rgba(100,130,170,0.25)' : 'rgba(165,180,205,0.35)'}`,
                  }}>
                    {historyFilter === 'confluence' ? 'No top-tier confluence alerts today'
                      : historyFilter === 'flow' ? 'No institutional flow signals today'
                      : 'No alerts yet'}
                  </div>
                )}
                {visible.map(h => {
                  const tc = typeFor(h.signal_type);
                  const m = historyMetric(h, t);
                  const dividerColor = darkMode ? 'rgba(100,130,170,0.25)' : 'rgba(165,180,205,0.35)';
                  return (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                      backgroundImage: `linear-gradient(90deg, ${dividerColor} 0%, ${dividerColor} 60%, transparent 100%)`,
                      backgroundSize: 'calc(100% - 12px) 1px',
                      backgroundPosition: 'top right',
                      backgroundRepeat: 'no-repeat',
                    }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: t.text1, width: 44, fontSize: 12 }}>{h.ticker}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: tc.bg, color: tc.color }}>{tc.label}</span>
                      <span style={{ color: t.text3, fontSize: 11, flex: 1 }}>{h.price ? `$${Number(h.price).toFixed(2)}` : ''}</span>
                      <span style={{ color: m.color, fontSize: 11, fontWeight: 600 }}>{m.text}</span>
                      <span style={{ color: t.text3, fontSize: 11 }}>{timeAgo(h.created_at)}</span>
                    </div>
                  );
                })}
                {filtered.length > 5 && (
                  <div onClick={() => setShowAllHistory(prev => !prev)}
                    style={{
                      padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                      borderTop: `1px solid ${darkMode ? 'rgba(100,130,170,0.25)' : 'rgba(165,180,205,0.35)'}`,
                    }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.blue }}>
                      {showAllHistory ? 'Show less ▴' : `Show more (${filtered.length - 5}) ▾`}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ═══ SUB-COMPONENTS ═══

function StatCard({ label, value, color, t, darkMode }) {
  return (
    <div style={{
      flex: 1, padding: '10px 6px 8px', textAlign: 'center', borderRadius: 10,
      background: darkMode
        ? 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(80,110,160,0.18) 0%, transparent 65%), radial-gradient(ellipse at 50% 50%, #1a2538 0%, #131b2d 50%, #0a1020 100%)'
        : 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(255,255,255,0.85) 0%, transparent 65%), radial-gradient(ellipse at 50% 50%, #ffffff 0%, #f4f8fd 50%, #d6e0ed 100%)',
      border: darkMode ? '1px solid rgba(80,110,160,0.2)' : '1px solid rgba(165,180,205,0.5)',
      boxShadow: darkMode
        ? 'inset 0 1.5px 4px rgba(150,180,220,0.08), inset 0 -1.5px 5px rgba(0,0,0,0.5), inset 0 0 25px rgba(0,0,0,0.3), 0 1.5px 5px rgba(0,0,0,0.4)'
        : 'inset 0 1.5px 4px rgba(255,255,255,0.85), inset 0 -1.5px 5px rgba(19,45,82,0.07), inset 0 0 25px rgba(19,45,82,0.035), 0 1.5px 5px rgba(19,45,82,0.06)',
    }}>
      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  );
}

// Live/stale indicator — stickiness goal: one glance tells you if numbers are current.
//
// `canRefresh` gates the manual scorer trigger. The edge function does real
// work (Polygon calls, DB writes, ~150s budget) so we only expose it to
// admins. For regular users the bar still shows status + age — it just
// doesn't advertise a trigger they can't use. Hiding the affordance
// (rather than showing a disabled button) avoids the "why is this button
// broken?" friction that would otherwise hurt the stickiness goal.
// eslint-disable-next-line no-unused-vars
function FreshnessBar({ lastUpdated, connState, onRefresh, refreshing, canRefresh, tick, t, darkMode }) {
  // Compute staleness in seconds (tick forces re-render)
  const ageSec = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000)) : null;
  const ageLabel = ageSec == null
    ? '—'
    : ageSec < 45 ? 'just now'
    : ageSec < 3600 ? `${Math.round(ageSec / 60)}m ago`
    : ageSec < 86400 ? `${Math.round(ageSec / 3600)}h ago`
    : `${Math.round(ageSec / 86400)}d ago`;

  // The scoring cron runs every 3h. Anything older than ~4h means at least
  // one run missed. Previously threshold was 10min (a realtime-data assumption)
  // which hid the staleness because "alert inserted" and "score computed" were
  // treated as the same signal. Now that the bar only reflects score freshness,
  // the threshold has to match the scoring cadence.
  const stale = ageSec != null && ageSec > 4 * 3600; // >4h = at least one cron cycle missed
  const isLive = connState === 'live' && !stale;
  const dotColor = refreshing ? '#60A5FA'
    : isLive ? t.green
    : (connState === 'reconnecting' || stale) ? '#fbbf24'
    : t.text3;
  const statusText = refreshing ? 'Refreshing…'
    : connState === 'reconnecting' ? 'Reconnecting…'
    : connState === 'connecting' ? 'Connecting…'
    : stale ? 'Scores stale' : 'Live';

  const clickable = canRefresh && !refreshing;

  return (
    <div
      onClick={clickable ? onRefresh : undefined}
      title={!canRefresh ? undefined : refreshing ? 'Refreshing scores…' : 'Tap to refresh'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', marginBottom: 10,
        fontSize: 10, color: t.text3,
        background: darkMode
          ? 'linear-gradient(90deg, rgba(94,237,138,0.12) 0%, transparent 100%)'
          : 'linear-gradient(90deg, rgba(26,173,94,0.07) 0%, transparent 100%)',
        borderLeft: `2px solid ${darkMode ? '#5eed8a' : '#1AAD5E'}`,
        borderRadius: 4,
        cursor: clickable ? 'pointer' : refreshing ? 'progress' : 'default',
        userSelect: 'none',
        opacity: refreshing ? 0.75 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      <style>{`@keyframes uptk-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: dotColor,
        boxShadow: isLive ? `0 0 4px ${dotColor}` : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 500 }}>{statusText}</span>
      {!refreshing && <span style={{ color: t.text3 }}>· Scores {ageLabel}</span>}
      {canRefresh && (
        <span style={{
          marginLeft: 'auto', color: t.text3, fontSize: 11,
          display: 'inline-block',
          animation: refreshing ? 'uptk-spin 0.9s linear infinite' : 'none',
        }}>↻</span>
      )}
    </div>
  );
}

function DetailPanel({ alert, rawAlert, perfRow, cohort, t }) {
  const ls = lifecycleStateFor(rawAlert || alert, perfRow, cohort);
  const conf = ls.confidence;
  const tier = tierFor(conf.hitRatePct, conf.nSamples);
  const tierWord = TIER_LABELS[tier];

  const dotColor =
    ls.dotColor === 'live' ? '#4A90D9' :
    ls.dotColor === 'warn' ? '#D4A017' :
    ls.dotColor === 'win'  ? t.green :
    ls.dotColor === 'loss' ? t.red :
    '#c9d1dd';

  const statusColor =
    ls.stage === 'closed_winner' ? t.green :
    ls.stage === 'closed_miss'   ? t.red :
    ls.stage === 'near_peak'     ? '#fbbf24' :
    t.text1;

  const avgReturn = Number(conf.avgReturnPct);
  const hasCohort = conf.label !== 'Insufficient' && conf.hitRatePct != null;

  return (
    <div style={{ background: t.card, borderRadius: 10, border: `1px solid ${t.border}`, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: 'transparent',
          color: TIER_HEADER_COLORS[tier],
          border: `1px solid ${TIER_HEADER_COLORS[tier]}`,
          fontFamily: "'Outfit', sans-serif",
          letterSpacing: 0.3,
        }}>{tierWord}{hasCohort ? ` · ${Math.round(conf.hitRatePct)}%` : ''}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: alert.changePct >= 0 ? t.green : t.red, marginLeft: 'auto' }}>
          {`${alert.changePct >= 0 ? '+' : ''}${alert.changePct.toFixed(1)}%`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 8 }}>
        {alert.company && `${alert.company} · `}{alert.price && `$${Number(alert.price).toFixed(2)} · `}{timeAgo(alert.created_at)}
      </div>

      {/* Plain-English what-happened line (e.g. "Gapped up 2.1% at open") */}
      {alert.explanation && (
        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5, marginBottom: 8 }}>
          {alert.explanation}
        </div>
      )}

      {/* Cohort sentence — past-tense, app-store-safe, plain English.
          Replaces the "Usually wins/loses · 37% · 280 alerts" line which
          read like a verdict. Stays past tense ("has gone up") so it's
          never advice. */}
      {hasCohort ? (
        <div style={{
          fontSize: 12, color: t.text2, lineHeight: 1.5,
          padding: '8px 10px',
          background: t.surface, borderRadius: 8,
          borderLeft: `3px solid ${TIER_HEADER_COLORS[tier]}`,
        }}>
          When this kind of signal has fired before, the stock has gone up{' '}
          <b style={{ color: TIER_HEADER_COLORS[tier] }}>
            {Math.round(conf.hitRatePct)}%
          </b>{' '}
          of the time.
          {Number.isFinite(avgReturn) && (
            <>
              {' '}Typical move was{' '}
              <b style={{ color: avgReturn >= 0 ? t.green : t.red }}>
                {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(1)}%
              </b>{' '}over the next 1–2 days.
            </>
          )}
          <span style={{ display: 'block', fontSize: 10, color: t.text3, marginTop: 4 }}>
            Based on {conf.nSamples} past signals
          </span>
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: t.text3, fontStyle: 'italic',
          padding: '8px 10px', background: t.surface, borderRadius: 8,
        }}>
          Still tracking this kind of signal — {conf.nSamples ?? 0} of {MIN_SAMPLES_FLOOR} priors collected so far.
        </div>
      )}

      {/* Lifecycle status row — kept so users learn how alerts close out. */}
      <div style={{
        marginTop: 9, paddingTop: 9,
        borderTop: `1px dashed ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: dotColor,
          animation: ls.dotColor === 'live' ? 'pulse 1.8s ease-in-out infinite' : undefined,
          flexShrink: 0,
        }} />
        <span style={{ color: statusColor, fontWeight: 500 }}>{ls.statusText}</span>
        <span style={{
          color: t.text3,
          marginLeft: 'auto',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {ls.subText}
        </span>
      </div>
    </div>
  );
}

// Collapsible "How alerts work". Closed by default → zero footprint.
// Tap → expands to three sub-blocks: signal types, how to read a bubble,
// what each tier label means. App-store-safe wording throughout.
function EducationZone({ t, darkMode }) {
  const [open, setOpen] = useState(false);

  const tierRows = [
    { tier: 'climbing', label: 'Climbing',  range: 'went up 60%+ of the time before' },
    { tier: 'rising',   label: 'Rising',    range: 'went up 53–60%' },
    { tier: 'flat',     label: 'Flat',      range: 'about a coin flip (~50%)' },
    { tier: 'slipping', label: 'Slipping',  range: 'went up only 40–47%' },
    { tier: 'falling',  label: 'Falling',   range: 'went up under 40% (rare)' },
  ];

  const sectionHeader = (txt) => (
    <div style={{
      fontSize: 9, color: t.text3, letterSpacing: 0.5,
      textTransform: 'uppercase', fontWeight: 700,
      marginBottom: 6, marginTop: 12,
    }}>{txt}</div>
  );

  return (
    <div style={{
      background: t.card,
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)}
        style={{
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: 12, fontWeight: 700, color: t.text1,
          fontFamily: "'Outfit', sans-serif",
        }}>
        <span>How alerts work</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: t.text3, fontWeight: 500 }}>tap to learn</span>
          <span style={{
            fontSize: 11, color: t.text3,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>▾</span>
        </span>
      </div>

      {open && (
        <div style={{
          padding: '4px 14px 14px',
          borderTop: `1px solid ${t.borderLight}`,
          fontSize: 11, color: t.text2, lineHeight: 1.55,
        }}>
          {sectionHeader('3 types of alerts')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { c: '#a78bfa', t: 'Stocks moving big', d: 'flagged when something unusual fires (sudden volume or price action)' },
              { c: '#5eed8a', t: 'Big-money flow',    d: 'large options bets or hidden "dark pool" trades from institutions' },
              { c: '#d4af37', t: 'Confluence',        d: 'when several signals stack on the same stock at once (the strongest kind)' },
            ].map(row => (
              <div key={row.t} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.c, flexShrink: 0, marginTop: 5 }} />
                <span><b style={{ color: t.text1 }}>{row.t}</b> — {row.d}</span>
              </div>
            ))}
          </div>

          {sectionHeader('How to read a bubble')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              flex: '0 0 64px',
              background: TIER_GRADIENTS.climbing,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 1.5px 1.5px 2px rgba(255,255,255,0.6), inset -1.5px -1.5px 2px rgba(0,0,0,0.25), inset 0 0 0 2px rgba(94,237,138,0.9), inset 0 0 0 3px rgba(26,138,69,0.4)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0a3a18', lineHeight: 1 }}>NVDA</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(0,0,0,0.6)', lineHeight: 1, marginTop: 2 }}>+3.4%</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(0,0,0,0.45)', lineHeight: 1, marginTop: 2 }}>Climbing · 67%</span>
            </div>
            <span style={{ flex: 1 }}>
              Each bubble shows the <b style={{ color: t.text1 }}>ticker</b>, today's <b style={{ color: t.text1 }}>% move</b>, and a{' '}
              <b style={{ color: t.text1 }}>tier · %</b> at the bottom. Bigger bubbles = bigger move today. Color follows the tier scale below.
            </span>
          </div>

          {sectionHeader('What the tier labels mean')}
          <div style={{ marginBottom: 6 }}>
            The label tells you how often this kind of signal has gone up <b style={{ color: t.text1 }}>in the past</b> — it's a track record, not a forecast.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tierRows.map(row => (
              <div key={row.tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: TIER_HEADER_COLORS[row.tier],
                  flexShrink: 0,
                }} />
                <span><b style={{ color: TIER_HEADER_COLORS[row.tier] }}>{row.label}</b> — {row.range}</span>
              </div>
            ))}
          </div>

          {sectionHeader('A few things to know')}
          <div style={{ color: t.text2 }}>
            · Scanners run during market hours (9:30am–4pm ET).<br />
            · We're not a brokerage — every label describes what's happened before, not advice on what to do now.
          </div>
        </div>
      )}
    </div>
  );
}
