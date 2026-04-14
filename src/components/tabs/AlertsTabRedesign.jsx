import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTheme, SentimentPill, timeAgo } from './alertsCasinoComponents';
import { isMarketOpen } from '../../utils/marketUtils';

// ── Constants ──
// Polygon replaced FMP as the exit-price source for alert scoring on 2026-04-14.
// Win-rate / avg-return only pull rows scored on or after this cutoff so the
// numbers aren't contaminated by FMP-vs-Polygon vendor drift on older rows.
// Historical rows remain in the DB untouched — backfill later.
const POLYGON_SCORING_CUTOFF = '2026-04-14T00:00:00Z';

const TYPE_CONFIG = {
  vol_surge:   { label: 'VOL SURGE', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  flow_signal: { label: 'BIG MONEY', color: '#5eed8a', bg: 'rgba(94,237,138,0.12)' },
  '52w_high':  { label: '52W HIGH',  color: '#fbbf24', bg: 'rgba(217,119,6,0.15)' },
  gap_up:      { label: 'GAP UP',    color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
  ma_cross:    { label: 'MA CROSS',  color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
};

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
  { key: 'all', label: 'All' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'flow', label: 'Big $' },
];

const EDUCATION_PANELS = [
  {
    id: 'vol', title: 'Stocks on the move', subtitle: 'Manual · admin triggered',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', divider: 'rgba(167,139,250,0.15)',
    what: <>Scans ~250 stocks and flags any trading at <span style={{ color: '#a78bfa', fontWeight: 500 }}>2x or more</span> their normal daily volume.</>,
    why: 'Volume often leads price. A sudden spike means something is happening — earnings, news, or insider moves.',
    scans: [
      ['Volume ratio', "today's volume vs 20-day avg (must be 2x+)"],
      ['Price change', 'how much the stock moved today (%)'],
      ['Current price', 'live stock price at time of scan'],
      ['Avg volume', '20-day average daily trading volume'],
      ['Sector', 'which industry the stock belongs to'],
    ],
    example: <><span style={{ color: '#a78bfa', fontWeight: 500 }}>CRWD</span> at <span style={{ color: '#a78bfa' }}>3.2x</span> avg volume → something is driving unusual interest in CrowdStrike today</>,
    exBg: 'rgba(167,139,250,0.06)', exBorder: 'rgba(167,139,250,0.1)',
  },
  {
    id: 'ai', title: 'Options & dark pools', subtitle: 'Smart · auto-scored',
    color: '#5eed8a', bg: 'rgba(94,237,138,0.06)', border: 'rgba(94,237,138,0.15)', divider: 'rgba(94,237,138,0.1)',
    what: <>Tracks where institutions are placing large bets through <span style={{ color: '#5eed8a', fontWeight: 500 }}>options sweeps</span> and <span style={{ color: '#5eed8a', fontWeight: 500 }}>dark pool trades</span>, then scores and ranks by conviction.</>,
    why: "Institutions trade through hidden channels. Unusually large or aggressive bets often signal they know something retail doesn't.",
    scans: [
      ['Sweeps', 'large orders split across exchanges to fill fast (urgency)'],
      ['Premium size', 'total $ bet on options ($100K+ flagged, $1M+ high alert)'],
      ['Dark pool prints', 'hidden block trades ($500K+ flagged, $10M+ high alert)'],
      ['Direction', 'bullish (call buys) or bearish (put buys)'],
      ['Multi-day conviction', 'same ticker active 3+ days = high confidence'],
      ['Cross-signal', 'options + dark pool on same stock = strongest signal'],
    ],
    example: <><span style={{ color: '#5eed8a', fontWeight: 500 }}>PLTR</span> — 3 bullish sweeps · $2.1M premium · $4.5M dark pool → institutions loading up aggressively</>,
    exBg: 'rgba(94,237,138,0.04)', exBorder: 'rgba(94,237,138,0.1)',
  },
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

function fmtMoney(v) {
  if (!v) return '—';
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
}

function nextMarketDay() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = now.getDay(), h = now.getHours();
  if (d >= 1 && d <= 4) return days[d + 1];
  if (d === 5 && h < 16) return 'today';
  return 'Mon';
}

function typeFor(raw) { return TYPE_CONFIG[raw] || TYPE_CONFIG.vol_surge; }

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
    return { text: '—', color: t.text3 };
  }
  if (type === '52w_high') {
    const p = Number(h.pct_from_high);
    if (!isFinite(p)) return { text: '—', color: t.text3 };
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
  if (type === 'vol_surge') {
    const v = Number(h.volume_ratio);
    if (isFinite(v) && v > 0) return { text: `${v.toFixed(1)}x vol`, color: '#a78bfa' };
  }
  // gap_up stores the move in gap_pct, not change_pct — fall back to either so
  // Recent Alerts never shows "—" for a row that actually has a move logged.
  // Mirrors mapAlert's precedence: change → change_pct → gap_pct.
  const rawPct = h.change ?? h.change_pct ?? h.gap_pct;
  const pct = Number(rawPct);
  if (isFinite(pct) && pct !== 0) return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? t.green : t.red };
  return { text: '—', color: t.text3 };
}

function mapAlert(a) {
  const ticker = a.ticker ?? a.tickers?.[0] ?? '—';
  const type = a.signal_type ?? a.alert_type ?? 'vol_surge';
  const isFlow = type === 'flow_signal';

  const change = isFlow ? (a.change ?? a.change_pct ?? 0) : (a.change ?? a.change_pct ?? a.gap_pct ?? 0);
  const changePct = Number(change) || 0;
  const flowDollars = isFlow ? (Number(a.gap_pct) || 0) : 0;
  const company = a.company ?? a.name ?? '';
  const price = a.price ?? a.current_price ?? null;
  const volRatio = a.volume_ratio ?? a.rel_volume ?? null;

  const flowPremium = isFlow && a.avg_volume ? Number(a.avg_volume) : null;
  const flowSweeps = isFlow && a.volume_ratio ? Number(a.volume_ratio) : 0;
  const flowDpValue = isFlow && a.gap_pct ? Number(a.gap_pct) : null;

  let explanation = a.title || a.signal || '';
  if (!explanation) {
    if (type === 'vol_surge' && volRatio) {
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

  const stats = isFlow ? [
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

  return { id: a.id, ticker, type, isFlow, changePct, flowDollars, company, price, explanation, stats, created_at: a.created_at };
}

// ===== MAIN COMPONENT =====
export default function AlertsTab({ session, group, darkMode }) {
  const t = useTheme(darkMode);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [fearScore, setFearScore] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [perfHistory, setPerfHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connState, setConnState] = useState('connecting'); // 'live' | 'reconnecting' | 'connecting'
  const [tick, setTick] = useState(0); // forces "Xs ago" label to re-render
  // Tracks whether we've been disconnected so we can refetch once on re-subscribe.
  // Held in a ref (not state) so the side effect lives outside React's render/commit
  // cycle — avoids StrictMode double-invoking a side effect placed in a setState updater.
  const wasDisconnectedRef = useRef(false);

  // Extracted so we can refetch on focus + reconnect
  const loadData = useCallback(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [alertsRes, perfRes, marketRes] = await Promise.all([
      supabase.from('breakout_alerts').select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('alert_performance').select('*')
        .not('outcome', 'is', null)
        .gte('tracked_at', POLYGON_SCORING_CUTOFF)   // drop FMP-era rows from win rate
        .in('signal_type', Object.keys(TYPE_CONFIG))
        .order('alert_time', { ascending: false }).limit(20),
      supabase.from('market_data').select('*'),
    ]);
    if (alertsRes.data) setLiveAlerts(alertsRes.data);
    if (perfRes.data) setPerfHistory(perfRes.data);
    if (marketRes.data) {
      const fg = marketRes.data.find(r => r.key === 'fear_greed');
      const vix = marketRes.data.find(r => r.key === 'vix_score');
      setFearScore((fg || vix)?.value?.score ?? null);
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

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
        setLastUpdated(new Date());
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
            return (row.outcome || row.admin_outcome) ? [row, ...rest].slice(0, 20) : rest;
          });
          setLastUpdated(new Date());
        }
      }).subscribe(onSubStatus);

    // Catch the "tab was backgrounded / laptop slept" case — refetch on focus
    const onFocus = () => { loadData(); };
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

  const displayAlerts = useMemo(() => {
    return liveAlerts.map(mapAlert).filter(a => a.ticker !== '—' && (Math.abs(a.changePct) > 0.05 || a.flowDollars > 0));
  }, [liveAlerts]);

  const uniqueAlerts = useMemo(() => {
    const seen = new Map();
    displayAlerts.forEach(a => { if (!seen.has(a.ticker)) seen.set(a.ticker, a); });
    return [...seen.values()].slice(0, 8);
  }, [displayAlerts]);

  // Derive history from liveAlerts instead of a separate query
  const alertHistory = useMemo(() => {
    return liveAlerts.slice(0, 30).map(a => ({
      id: a.id, ticker: a.ticker, signal_type: a.signal_type,
      price: a.price, change_pct: a.change_pct, gap_pct: a.gap_pct,
      pct_from_high: a.pct_from_high, short_ma: a.short_ma, long_ma: a.long_ma,
      volume_ratio: a.volume_ratio, volume: a.volume, avg_volume: a.avg_volume,
      notes: a.notes, created_at: a.created_at,
    }));
  }, [liveAlerts]);

  const alertStats = useMemo(() => {
    const total = alertHistory.length;
    const byType = {};
    alertHistory.forEach(a => { byType[a.signal_type || 'vol_surge'] = (byType[a.signal_type || 'vol_surge'] || 0) + 1; });
    // Only count signal types shown in the Action alerts feed
    const actionTypes = new Set(Object.keys(TYPE_CONFIG));
    const resolved = perfHistory.filter(h => h.return_pct != null && actionTypes.has(h.signal_type));
    const wins = resolved.filter(h => h.return_pct > 0).length;
    const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
    const avgReturn = resolved.length > 0 ? resolved.reduce((s, h) => s + Number(h.return_pct), 0) / resolved.length : null;
    return { total, byType, winRate, avgReturn, hasPerf: resolved.length > 0 };
  }, [alertHistory, perfHistory]);

  const selectedAlert = selectedId ? uniqueAlerts.find(a => a.id === selectedId) : null;
  const marketOpen = isMarketOpen();
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: "'Outfit', sans-serif" }}>
            Action alerts
          </div>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>
            {marketOpen
              ? <>Last scan: <span style={{ color: t.green, fontWeight: 600 }}>{liveAlerts.length > 0 ? timeAgo(liveAlerts[0]?.created_at) : 'pending'}</span> · {uniqueAlerts.length} alert{uniqueAlerts.length !== 1 ? 's' : ''} live</>
              : <>Market closed · opens <span style={{ color: t.green, fontWeight: 600 }}>{nextMarketDay()} 9:30am</span></>
            }
          </div>
        </div>
        <SentimentPill score={fearScore} darkMode={darkMode} />
      </div>

      {/* ═══ CHIP ZONE ═══ */}
      {hasAlerts && (
        <div style={{
          position: 'relative', height: selectedAlert ? 100 : 170,
          background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`,
          marginBottom: 10, overflow: 'hidden', transition: 'height 0.3s ease',
        }}>
          {uniqueAlerts.map((alert, i) => {
            const isSelected = selectedId === alert.id;
            const size = alert.isFlow ? chipSize(alert.flowDollars / 500000) : chipSize(alert.changePct);
            const isUp = alert.isFlow ? alert.flowDollars > 0 : alert.changePct >= 0;
            const tc = typeFor(alert.type);
            const f = freshness(alert.created_at);
            const isHot = f >= 0.85;
            return (
              <div key={alert.id} onClick={() => setSelectedId(prev => prev === alert.id ? null : alert.id)}
                style={{
                  position: 'absolute', ...CHIP_SLOTS[i % 8],
                  animation: isSelected ? 'none' : `float${i % 8} ${FLOAT_DURATIONS[i % 8]}s ease-in-out infinite`,
                  opacity: selectedAlert && !isSelected ? 0.35 : f,
                  transition: 'opacity 0.3s ease', cursor: 'pointer',
                  zIndex: isSelected ? 10 : isHot ? 5 : 1,
                }}>
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: isUp
                    ? 'radial-gradient(circle at 40% 40%, #7dffb0, #2ebd68)'
                    : 'radial-gradient(circle at 40% 40%, #ff9e9e, #c94444)',
                  border: `2px solid ${isUp ? '#5eed8a' : '#F09595'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isSelected ? '0 0 0 3px rgba(123,140,222,0.5)' : isHot ? '0 0 8px rgba(94,237,138,0.35)' : undefined,
                  animation: isHot && !isSelected ? 'freshPulse 2.5s ease-in-out infinite' : undefined,
                  transition: 'box-shadow 0.2s ease',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#000', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</span>
                  <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.6)', lineHeight: 1, marginTop: 1 }}>
                    {alert.isFlow
                      ? (alert.flowDollars > 0 ? fmtMoney(alert.flowDollars) : '—')
                      : `${alert.changePct >= 0 ? '+' : ''}${alert.changePct.toFixed(1)}%`}
                  </span>
                  <span style={{
                    fontSize: 6.5, fontWeight: 700, color: 'rgba(0,0,0,0.45)', lineHeight: 1, marginTop: 2,
                    textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center', maxWidth: size - 10,
                  }}>
                    {tc.label}
                  </span>
                </div>
              </div>
            );
          })}
          {!selectedAlert && (
            <div style={{ position: 'absolute', bottom: 5, width: '100%', textAlign: 'center', fontSize: 8, color: t.text3 }}>
              tap any chip for details
            </div>
          )}
        </div>
      )}

      {/* ═══ DETAIL PANEL ═══ */}
      {selectedAlert && <DetailPanel alert={selectedAlert} t={t} />}

      {/* ═══ STATS STRIP ═══ */}
      {alertStats.total > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <StatCard label="Total alerts" value={alertStats.total} color={t.text1} t={t} />
            {alertStats.hasPerf ? (
              <>
                <StatCard label="Win rate" value={`${alertStats.winRate}%`} color={alertStats.winRate >= 50 ? t.green : t.red} t={t} />
                <StatCard label="Avg return" value={`${alertStats.avgReturn >= 0 ? '+' : ''}${alertStats.avgReturn.toFixed(1)}%`} color={alertStats.avgReturn >= 0 ? t.green : t.red} t={t} />
              </>
            ) : (
              <>
                <StatCard label="Breakouts" value={alertStats.byType['52w_high'] || 0} color="#fbbf24" t={t} />
                <StatCard label="Big money" value={alertStats.byType['flow_signal'] || 0} color="#5eed8a" t={t} />
              </>
            )}
          </div>
          <FreshnessBar
            lastUpdated={lastUpdated}
            connState={connState}
            onRefresh={loadData}
            tick={tick}
            t={t}
          />
        </>
      )}

      {/* ═══ EDUCATION ═══ */}
      <EducationZone t={t} />

      {/* ═══ ALERT HISTORY ═══ */}
      {alertHistory.length > 0 && (
        <div style={{ background: t.card, borderRadius: 10, border: `1px solid ${t.border}`, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Outfit', sans-serif" }}>Recent alerts</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {HISTORY_FILTERS.map(f => {
                const active = historyFilter === f.key;
                const fc = f.key === 'all' ? { color: t.blue, bg: t.blueBg }
                  : f.key === 'stocks' ? { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' }
                  : { color: '#5eed8a', bg: 'rgba(94,237,138,0.08)' };
                return (
                  <span key={f.key} onClick={() => setHistoryFilter(f.key)}
                    style={{
                      fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: active ? fc.bg : 'transparent',
                      color: active ? fc.color : t.text3,
                      border: active ? `0.5px solid ${fc.color}30` : '0.5px solid transparent',
                    }}>{f.label}</span>
                );
              })}
            </div>
          </div>
          {(() => {
            const filtered = alertHistory.filter(h =>
              historyFilter === 'all' ||
              (historyFilter === 'stocks' && !FLOW_TYPES.has(h.signal_type)) ||
              (historyFilter === 'flow' && FLOW_TYPES.has(h.signal_type))
            );
            const visible = showAllHistory ? filtered : filtered.slice(0, 5);
            return (
              <>
                {visible.map(h => {
                  const tc = typeFor(h.signal_type);
                  const m = historyMetric(h, t);
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderTop: `1px solid ${t.border}` }}>
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
                    style={{ padding: '8px 12px', textAlign: 'center', borderTop: `1px solid ${t.border}`, cursor: 'pointer' }}>
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

function StatCard({ label, value, color, t }) {
  return (
    <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  );
}

// Live/stale indicator — stickiness goal: one glance tells you if numbers are current.
// eslint-disable-next-line no-unused-vars
function FreshnessBar({ lastUpdated, connState, onRefresh, tick, t }) {
  // Compute staleness in seconds (tick forces re-render)
  const ageSec = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000)) : null;
  const ageLabel = ageSec == null
    ? '—'
    : ageSec < 45 ? 'just now'
    : ageSec < 3600 ? `${Math.round(ageSec / 60)}m ago`
    : ageSec < 86400 ? `${Math.round(ageSec / 3600)}h ago`
    : `${Math.round(ageSec / 86400)}d ago`;

  const stale = ageSec != null && ageSec > 600; // >10 min = stale-looking
  const isLive = connState === 'live' && !stale;
  const dotColor = isLive ? t.green : (connState === 'reconnecting' || stale) ? '#fbbf24' : t.text3;
  const statusText = connState === 'reconnecting' ? 'Reconnecting…'
    : connState === 'connecting' ? 'Connecting…'
    : stale ? 'Stale' : 'Live';

  return (
    <div
      onClick={onRefresh}
      title="Tap to refresh"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', marginBottom: 10,
        fontSize: 10, color: t.text3,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: dotColor,
        boxShadow: isLive ? `0 0 4px ${dotColor}` : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 500 }}>{statusText}</span>
      <span style={{ color: t.text3 }}>· Updated {ageLabel}</span>
      <span style={{ marginLeft: 'auto', color: t.text3, fontSize: 11 }}>↻</span>
    </div>
  );
}

function DetailPanel({ alert, t }) {
  const tc = typeFor(alert.type);
  return (
    <div style={{ background: t.card, borderRadius: 10, border: `1px solid ${t.border}`, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</span>
        <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: tc.bg, color: tc.color, fontFamily: "'Outfit', sans-serif" }}>{tc.label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: alert.isFlow ? '#5eed8a' : (alert.changePct >= 0 ? t.green : t.red), marginLeft: 'auto' }}>
          {alert.isFlow
            ? (alert.flowDollars > 0 ? fmtMoney(alert.flowDollars) : '—')
            : `${alert.changePct >= 0 ? '+' : ''}${alert.changePct.toFixed(1)}%`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 8 }}>
        {alert.company && `${alert.company} · `}{alert.price && `$${Number(alert.price).toFixed(2)} · `}{timeAgo(alert.created_at)}
      </div>
      <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.5, marginBottom: 10 }}>{alert.explanation}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {alert.stats.map((s, i) => (
          <div key={i} style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</div>
            <div style={{
              fontSize: 12, fontWeight: 600, marginTop: 2, fontFamily: "'Outfit', sans-serif",
              color: s.color !== undefined ? (s.color ? t.green : t.red) : t.text1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EducationZone({ t }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, padding: '12px 10px', marginBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: t.text1, textAlign: 'center', marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>
        How alerts work
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
        {EDUCATION_PANELS.map(p => {
          const isOpen = expanded === p.id;
          return (
            <div key={p.id} onClick={() => setExpanded(prev => prev === p.id ? null : p.id)}
              style={{ flex: 1, background: p.bg, borderRadius: 8, border: `0.5px solid ${p.border}`, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ padding: '8px 8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: p.color, fontFamily: "'Outfit', sans-serif" }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>{p.subtitle}</div>
                </div>
                <div style={{ fontSize: 11, color: t.text3, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
              </div>
              <div style={{ maxHeight: isOpen ? 500 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                <div style={{ padding: '0 8px 8px', borderTop: `0.5px solid ${p.divider}` }}>
                  <div style={{ fontSize: 13, color: t.text2, lineHeight: 1.6, marginTop: 6 }}>
                    <span style={{ fontWeight: 500, color: t.text1 }}>What it does:</span> {p.what}
                  </div>
                  <div style={{ fontSize: 13, color: t.text2, lineHeight: 1.6, marginTop: 4 }}>
                    <span style={{ fontWeight: 500, color: t.text1 }}>Why it matters:</span> {p.why}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 500, color: t.text1, textTransform: 'uppercase', letterSpacing: 0.4 }}>What we scan for</div>
                  <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {p.scans.map(([label, desc]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 13, color: t.text2 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: p.color, flexShrink: 0, marginTop: 5 }} />
                        <span><span style={{ color: p.color, fontWeight: 500 }}>{label}</span> — {desc}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, padding: '5px 7px', background: p.exBg, borderRadius: 6, border: `0.5px solid ${p.exBorder}` }}>
                    <div style={{ fontSize: 11, color: t.text3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>Example</div>
                    <div style={{ fontSize: 13, color: t.text2 }}>{p.example}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, paddingTop: 8, borderTop: `0.5px solid ${t.border}` }}>
        {[
          { size: 12, bg: 'radial-gradient(circle at 35% 35%, #6aff9e, #1a8a45)', border: '#5eed8a', label: 'Up' },
          { size: 12, bg: 'radial-gradient(circle at 35% 35%, #ff8a8a, #a03030)', border: '#F09595', label: 'Down' },
          { size: 8, bg: t.card, border: t.text3, label: 'Small' },
          { size: 16, bg: t.card, border: t.text3, label: 'Big' },
        ].map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: c.size, height: c.size, borderRadius: '50%', background: c.bg, border: `1.5px solid ${c.border}` }} />
            <span style={{ fontSize: 12, color: t.text3 }}>{c.label}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', marginTop: 6 }}>
        Scanners run during market hours · 9:30am–4pm EST
      </div>
    </div>
  );
}
