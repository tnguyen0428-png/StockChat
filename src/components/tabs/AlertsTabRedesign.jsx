// ============================================
// UPTIKALERTS — AlertsTabRedesign.jsx (v2)
// Floating poker chips + education empty state
// L.I.S.S. — Low Friction, Intuitive, Simple, Sticky
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { useTheme, DarkModeToggle, SentimentPill, timeAgo } from './alertsCasinoComponents';
import { isMarketOpen } from '../../utils/marketUtils';

// ── Alert type badge config ──
const TYPE_CONFIG = {
  vol_surge:    { label: 'VOL SURGE',  color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  flow_signal:  { label: 'BIG MONEY',  color: '#5eed8a', bg: 'rgba(94,237,138,0.12)' },
  '52w_high':   { label: '52W HIGH',   color: '#fbbf24', bg: 'rgba(217,119,6,0.15)' },
  gap_up:       { label: 'GAP UP',     color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
  ma_cross:     { label: 'MA CROSS',   color: '#60a5fa', bg: 'rgba(37,99,235,0.15)' },
};

// ── Chip float animations (unique per chip) ──
const FLOAT_KEYFRAMES = `
@keyframes float0{0%,100%{transform:translate(0,0) rotate(0deg)}25%{transform:translate(5px,-8px) rotate(2deg)}50%{transform:translate(-3px,6px) rotate(-1deg)}75%{transform:translate(7px,-4px) rotate(3deg)}}
@keyframes float1{0%,100%{transform:translate(0,0) rotate(0deg)}33%{transform:translate(-6px,-5px) rotate(-2deg)}66%{transform:translate(4px,7px) rotate(1.5deg)}}
@keyframes float2{0%,100%{transform:translate(0,0) rotate(0deg)}20%{transform:translate(8px,-3px) rotate(1deg)}50%{transform:translate(-4px,-7px) rotate(-2deg)}80%{transform:translate(3px,5px) rotate(2.5deg)}}
@keyframes float3{0%,100%{transform:translate(0,0) rotate(0deg)}30%{transform:translate(-7px,4px) rotate(-1.5deg)}70%{transform:translate(5px,-6px) rotate(2deg)}}
@keyframes float4{0%,100%{transform:translate(0,0) rotate(0deg)}40%{transform:translate(6px,5px) rotate(1deg)}60%{transform:translate(-5px,-4px) rotate(-2.5deg)}}
@keyframes float5{0%,100%{transform:translate(0,0) rotate(0deg)}25%{transform:translate(-4px,7px) rotate(2deg)}75%{transform:translate(7px,-3px) rotate(-1deg)}}
@keyframes float6{0%,100%{transform:translate(0,0) rotate(0deg)}35%{transform:translate(3px,-6px) rotate(-1deg)}65%{transform:translate(-6px,4px) rotate(2deg)}}
@keyframes float7{0%,100%{transform:translate(0,0) rotate(0deg)}45%{transform:translate(-5px,-3px) rotate(1.5deg)}55%{transform:translate(4px,5px) rotate(-1.5deg)}}
`;
const FLOAT_DURATIONS = [18, 15, 22, 17, 20, 16, 19, 21];

// ── Chip slot positions (non-overlapping, scattered) ──
const CHIP_SLOTS = [
  { top: '10%', left: '5%' },
  { top: '8%',  left: '35%' },
  { top: '15%', left: '65%' },
  { top: '50%', left: '15%' },
  { top: '45%', left: '50%' },
  { top: '55%', left: '78%' },
  { top: '30%', left: '82%' },
  { top: '65%', left: '40%' },
];

// ── Map raw DB alert to display format ──
function mapAlert(a) {
  const ticker = a.ticker ?? a.tickers?.[0] ?? '—';
  const type = a.signal_type ?? a.alert_type ?? 'vol_surge';
  const isFlow = type === 'flow_signal';

  const change = isFlow
    ? (a.change ?? a.gap_pct ?? 0)
    : (a.change ?? a.change_pct ?? a.gap_pct ?? 0);
  const changePct = Number(change) || 0;

  const company = a.company ?? a.name ?? '';
  const price = a.price ?? a.current_price ?? null;
  const volRatio = a.volume_ratio ?? a.rel_volume ?? null;

  const flowPremium = isFlow && a.avg_volume ? Number(a.avg_volume) : null;
  const flowSweeps = isFlow && a.volume_ratio ? Number(a.volume_ratio) : 0;
  const flowDpValue = isFlow && a.gap_pct ? Number(a.gap_pct) : null;
  const flowScore = isFlow && a.rel_volume ? Number(a.rel_volume) : 0;

  let explanation = a.title || a.signal || '';
  if (!explanation) {
    if (type === 'vol_surge' && volRatio) {
      explanation = `Trading ${Number(volRatio).toFixed(1)}x normal volume`;
      if (changePct) explanation += ` with price ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)}%`;
    } else if (isFlow) {
      const parts = [];
      if (flowSweeps > 0) parts.push(`${flowSweeps} bullish call sweep${flowSweeps !== 1 ? 's' : ''}`);
      if (flowPremium) {
        const pStr = flowPremium >= 1e6 ? `$${(flowPremium / 1e6).toFixed(1)}M` : `$${(flowPremium / 1e3).toFixed(0)}K`;
        parts.push(`${pStr} in premiums`);
      }
      if (flowDpValue) {
        const dStr = flowDpValue >= 1e6 ? `$${(flowDpValue / 1e6).toFixed(1)}M` : `$${(flowDpValue / 1e3).toFixed(0)}K`;
        parts.push(`${dStr} dark pool`);
      }
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
    { label: 'Premium', value: flowPremium ? (flowPremium >= 1e6 ? `$${(flowPremium / 1e6).toFixed(1)}M` : `$${(flowPremium / 1e3).toFixed(0)}K`) : '—' },
    { label: 'Dark Pool', value: flowDpValue ? (flowDpValue >= 1e6 ? `$${(flowDpValue / 1e6).toFixed(1)}M` : `$${(flowDpValue / 1e3).toFixed(0)}K`) : '—' },
    { label: 'Direction', value: changePct >= 0 ? 'Bull' : 'Bear', color: changePct >= 0 },
  ] : [
    { label: 'Volume', value: volRatio ? `${Number(volRatio).toFixed(1)}x` : '—' },
    { label: 'Price', value: price ? `$${Number(price).toFixed(2)}` : '—' },
    { label: 'Change', value: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`, color: changePct >= 0 },
    { label: 'Signal', value: a.notes ? a.notes.slice(0, 20) : (volRatio ? volRatio + 'x avg' : '—') },
  ];

  return {
    id: a.id, ticker, type, isFlow, changePct, company, price, explanation, stats,
    created_at: a.created_at,
  };
}

function chipSize(pct) {
  const abs = Math.abs(pct || 0);
  if (abs >= 8) return 76;
  if (abs >= 5) return 68;
  if (abs >= 3) return 60;
  if (abs >= 1.5) return 54;
  return 48;
}

function nextMarketDay() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = now.getDay();
  const h = now.getHours();
  if (d >= 1 && d <= 4) return days[d + 1];
  if (d === 5 && h < 16) return 'today';
  return 'Mon';
}

// ===== MAIN COMPONENT =====
export default function AlertsTab({ session, group, darkMode: parentDarkMode, setDarkMode: parentSetDarkMode }) {
  const { isAdmin } = useGroup();

  const [localDarkMode, setLocalDarkMode] = useState(() => {
    try { return localStorage.getItem('uptik_darkMode') === 'true'; } catch { return false; }
  });
  const darkMode = parentDarkMode !== undefined ? parentDarkMode : localDarkMode;
  const setDarkMode = parentSetDarkMode || setLocalDarkMode;
  const t = useTheme(darkMode);

  useEffect(() => {
    try { localStorage.setItem('uptik_darkMode', String(darkMode)); } catch {}
  }, [darkMode]);

  const [liveAlerts, setLiveAlerts] = useState([]);
  const [fearScore, setFearScore] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [perfHistory, setPerfHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertHistory, setAlertHistory] = useState([]);

  useEffect(() => {
    const load = async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data } = await supabase.from('breakout_alerts').select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setLiveAlerts(data);
      setLoading(false);
    };
    load();
    const channel = supabase.channel('alerts_chips_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'breakout_alerts' }, (payload) => {
        setLiveAlerts(prev => [payload.new, ...prev]);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('alert_performance').select('*')
        .not('outcome', 'is', null)
        .order('alert_time', { ascending: false })
        .limit(20);
      if (data) setPerfHistory(data);
    };
    load();
    const channel = supabase.channel('perf_chips_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_performance' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setPerfHistory(prev => {
            const filtered = prev.filter(p => p.id !== payload.new.id);
            if (payload.new.outcome || payload.new.admin_outcome) {
              return [payload.new, ...filtered].slice(0, 20);
            }
            return filtered;
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    supabase.from('market_data').select('*').then(({ data }) => {
      if (!data) return;
      data.forEach(row => {
        if (row.key === 'fear_greed') setFearScore(row.value?.score ?? null);
        else if (row.key === 'vix_score' && !data.some(r => r.key === 'fear_greed')) setFearScore(row.value?.score ?? null);
      });
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('breakout_alerts')
        .select('id, ticker, signal_type, price, change_pct, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) setAlertHistory(data);
    };
    load();
  }, []);

  const displayAlerts = useMemo(() => {
    if (liveAlerts.length === 0) return [];
    return liveAlerts.map(mapAlert).filter(a => a.ticker !== '—' && Math.abs(a.changePct) > 0.05);
  }, [liveAlerts]);

  const uniqueAlerts = useMemo(() => {
    const seen = new Map();
    displayAlerts.forEach(a => {
      if (!seen.has(a.ticker)) seen.set(a.ticker, a);
    });
    return [...seen.values()].slice(0, 8);
  }, [displayAlerts]);

  const alertStats = useMemo(() => {
    const total = alertHistory.length;
    const byType = {};
    alertHistory.forEach(a => {
      const t = a.signal_type || 'vol_surge';
      byType[t] = (byType[t] || 0) + 1;
    });
    const resolved = perfHistory.filter(h => h.return_pct != null);
    const wins = resolved.filter(h => h.return_pct > 0).length;
    const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
    const avgReturn = resolved.length > 0 ? resolved.reduce((s, h) => s + Number(h.return_pct), 0) / resolved.length : null;
    return { total, byType, winRate, avgReturn, hasPerf: resolved.length > 0 };
  }, [alertHistory, perfHistory]);

  const selectedAlert = selectedId ? uniqueAlerts.find(a => a.id === selectedId) : null;
  const marketOpen = isMarketOpen();
  const hasAlerts = uniqueAlerts.length > 0;

  const handleChipTap = (alert) => {
    setSelectedId(prev => prev === alert.id ? null : alert.id);
  };

  const [historyFilter, setHistoryFilter] = useState('all');
  const [showAllHistory, setShowAllHistory] = useState(false);

  if (loading) {
    return (
      <div style={{ background: t.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: t.text3, fontFamily: "'DM Sans', sans-serif" }}>Loading alerts…</span>
      </div>
    );
  }

  return (
    <div style={{ background: t.bg, minHeight: '100vh', maxWidth: '100%', width: '100%', padding: '12px 12px 80px', fontFamily: "'DM Sans', sans-serif" }}>
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <SentimentPill score={fearScore} darkMode={darkMode} />
          <DarkModeToggle darkMode={darkMode} onToggle={() => setDarkMode(d => !d)} t={t} />
        </div>
      </div>

      {/* ═══ CHIP ZONE ═══ */}
      {hasAlerts && (
        <div style={{
          position: 'relative',
          height: selectedAlert ? 100 : 170,
          background: t.surface,
          borderRadius: 10,
          border: `1px solid ${t.border}`,
          marginBottom: 10,
          overflow: 'hidden',
          transition: 'height 0.3s ease',
        }}>
          {uniqueAlerts.map((alert, i) => {
            const isSelected = selectedId === alert.id;
            const size = chipSize(alert.changePct);
            const slot = CHIP_SLOTS[i % CHIP_SLOTS.length];
            const isUp = alert.changePct >= 0;
            return (
              <div
                key={alert.id}
                onClick={() => handleChipTap(alert)}
                style={{
                  position: 'absolute',
                  ...slot,
                  animation: isSelected ? 'none' : `float${i % 8} ${FLOAT_DURATIONS[i % 8]}s ease-in-out infinite`,
                  opacity: selectedAlert && !isSelected ? 0.35 : 1,
                  transition: 'opacity 0.3s ease',
                  cursor: 'pointer',
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: isUp
                    ? 'radial-gradient(circle at 40% 40%, #7dffb0, #2ebd68)'
                    : 'radial-gradient(circle at 40% 40%, #ff9e9e, #c94444)',
                  border: `2px solid ${isUp ? '#5eed8a' : '#F09595'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isSelected ? `0 0 0 3px rgba(123,140,222,0.5)` : undefined,
                  transition: 'box-shadow 0.2s ease',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#000', textShadow: 'none', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</span>
                  <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.6)', lineHeight: 1, marginTop: 1 }}>
                    {alert.changePct >= 0 ? '+' : ''}{alert.changePct.toFixed(1)}%
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
      {selectedAlert && (
        <DetailPanel alert={selectedAlert} t={t} />
      )}

      {/* ═══ STATS STRIP ═══ */}
      {alertStats.total > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: '1px solid ' + t.border }}>
            <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: "'DM Sans', sans-serif" }}>Total alerts</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: t.text1, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{alertStats.total}</div>
          </div>
          {alertStats.hasPerf ? (
            <>
              <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: '1px solid ' + t.border }}>
                <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Win rate</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: alertStats.winRate >= 50 ? t.green : t.red, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{alertStats.winRate}%</div>
              </div>
              <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: '1px solid ' + t.border }}>
                <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Avg return</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: alertStats.avgReturn >= 0 ? t.green : t.red, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{alertStats.avgReturn >= 0 ? '+' : ''}{alertStats.avgReturn.toFixed(1)}%</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: '1px solid ' + t.border }}>
                <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Breakouts</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24', marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{alertStats.byType['52w_high'] || 0}</div>
              </div>
              <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: '1px solid ' + t.border }}>
                <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Big money</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#5eed8a', marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{alertStats.byType['flow_signal'] || 0}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ EDUCATION — always visible ═══ */}
      <EducationZone t={t} />

      {/* ═══ ALERT HISTORY ═══ */}
      {alertHistory.length > 0 && (
        <div style={{ background: t.card, borderRadius: 10, border: '1px solid ' + t.border, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Outfit', sans-serif" }}>Recent alerts</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'all', label: 'All', color: t.blue, bg: t.blueBg },
                { key: 'vol_surge', label: 'Stocks', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                { key: 'flow_signal', label: 'Big $', color: '#5eed8a', bg: 'rgba(94,237,138,0.08)' },
              ].map(f => (
                <span
                  key={f.key}
                  onClick={() => setHistoryFilter(f.key)}
                  style={{
                    fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                    background: historyFilter === f.key ? f.bg : 'transparent',
                    color: historyFilter === f.key ? f.color : t.text3,
                    border: historyFilter === f.key ? `0.5px solid ${f.color}30` : '0.5px solid transparent',
                  }}
                >{f.label}</span>
              ))}
            </div>
          </div>
          {(() => {
            const filtered = alertHistory.filter(h => historyFilter === 'all' || h.signal_type === historyFilter);
            const visible = showAllHistory ? filtered : filtered.slice(0, 5);
            const hasMore = filtered.length > 5;
            return (
              <>
                {visible.map(h => {
                  const tc = TYPE_CONFIG[h.signal_type] || TYPE_CONFIG.vol_surge;
                  const pct = Number(h.change_pct) || 0;
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderTop: '1px solid ' + t.border }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: t.text1, width: 44, fontSize: 12 }}>{h.ticker}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: tc.bg, color: tc.color }}>{tc.label}</span>
                      <span style={{ color: t.text3, fontSize: 11, flex: 1 }}>{h.price ? '$' + Number(h.price).toFixed(2) : ''}</span>
                      <span style={{ color: pct >= 0 ? t.green : t.red, fontSize: 11, fontWeight: 600 }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                      <span style={{ color: t.text3, fontSize: 11 }}>{timeAgo(h.created_at)}</span>
                    </div>
                  );
                })}
                {hasMore && (
                  <div
                    onClick={() => setShowAllHistory(prev => !prev)}
                    style={{ padding: '8px 12px', textAlign: 'center', borderTop: '1px solid ' + t.border, cursor: 'pointer' }}
                  >
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


// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function EducationZone({ t }) {
  const [expanded, setExpanded] = useState(null);
  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  return (
    <div style={{ background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, padding: '12px 10px', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: t.text1, textAlign: 'center', marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>
        How alerts work
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>

        {/* ── Stocks on the move ── */}
        <div
          onClick={() => toggle('vol')}
          style={{ flex: 1, background: t.purpleBg || 'rgba(167,139,250,0.08)', borderRadius: 8, border: `0.5px solid rgba(167,139,250,0.2)`, overflow: 'hidden', cursor: 'pointer' }}
        >
          <div style={{ padding: '8px 8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', fontFamily: "'Outfit', sans-serif" }}>Stocks on the move</div>
              <div style={{ fontSize: 9, color: t.text3, marginTop: 2 }}>Manual · admin triggered</div>
            </div>
            <div style={{ fontSize: 11, color: t.text3, transition: 'transform 0.2s', transform: expanded === 'vol' ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
          </div>
          <div style={{ maxHeight: expanded === 'vol' ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
            <div style={{ padding: '0 8px 8px', borderTop: '0.5px solid rgba(167,139,250,0.15)' }}>
              <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.6, marginTop: 6 }}>
                <span style={{ fontWeight: 500, color: t.text1 }}>What it does:</span> Scans ~250 stocks and flags any trading at <span style={{ color: '#a78bfa', fontWeight: 500 }}>2x or more</span> their normal daily volume.
              </div>
              <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.6, marginTop: 4 }}>
                <span style={{ fontWeight: 500, color: t.text1 }}>Why it matters:</span> Volume often leads price. A sudden spike means something is happening — earnings, news, or insider moves.
              </div>
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: t.text1, textTransform: 'uppercase', letterSpacing: 0.4 }}>What we scan for</div>
              <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  ['Volume ratio', "today's volume vs 20-day avg (must be 2x+)"],
                  ['Price change', 'how much the stock moved today (%)'],
                  ['Current price', 'live stock price at time of scan'],
                  ['Avg volume', '20-day average daily trading volume'],
                  ['Sector', 'which industry the stock belongs to'],
                ].map(([label, desc]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 11, color: t.text2 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa', flexShrink: 0, marginTop: 5 }} />
                    <span><span style={{ color: '#a78bfa', fontWeight: 500 }}>{label}</span> — {desc}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, padding: '5px 7px', background: 'rgba(167,139,250,0.06)', borderRadius: 6, border: '0.5px solid rgba(167,139,250,0.1)' }}>
                <div style={{ fontSize: 9, color: t.text3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>Example</div>
                <div style={{ fontSize: 11, color: t.text2 }}>
                  <span style={{ color: '#a78bfa', fontWeight: 500 }}>CRWD</span> at <span style={{ color: '#a78bfa' }}>3.2x</span> avg volume → something is driving unusual interest in CrowdStrike today
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Options & dark pools ── */}
        <div
          onClick={() => toggle('ai')}
          style={{ flex: 1, background: t.greenBg || 'rgba(94,237,138,0.06)', borderRadius: 8, border: `0.5px solid rgba(94,237,138,0.15)`, overflow: 'hidden', cursor: 'pointer' }}
        >
          <div style={{ padding: '8px 8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5eed8a', fontFamily: "'Outfit', sans-serif" }}>Options & dark pools</div>
              <div style={{ fontSize: 9, color: t.text3, marginTop: 2 }}>Smart · auto-scored</div>
            </div>
            <div style={{ fontSize: 11, color: t.text3, transition: 'transform 0.2s', transform: expanded === 'ai' ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
          </div>
          <div style={{ maxHeight: expanded === 'ai' ? 500 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
            <div style={{ padding: '0 8px 8px', borderTop: '0.5px solid rgba(94,237,138,0.1)' }}>
              <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.6, marginTop: 6 }}>
                <span style={{ fontWeight: 500, color: t.text1 }}>What it does:</span> Tracks where institutions are placing large bets through <span style={{ color: '#5eed8a', fontWeight: 500 }}>options sweeps</span> and <span style={{ color: '#5eed8a', fontWeight: 500 }}>dark pool trades</span>, then scores and ranks by conviction.
              </div>
              <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.6, marginTop: 4 }}>
                <span style={{ fontWeight: 500, color: t.text1 }}>Why it matters:</span> Institutions trade through hidden channels. Unusually large or aggressive bets often signal they know something retail doesn't.
              </div>
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: t.text1, textTransform: 'uppercase', letterSpacing: 0.4 }}>What we scan for</div>
              <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  ['Sweeps', 'large orders split across exchanges to fill fast (urgency)'],
                  ['Premium size', 'total $ bet on options ($100K+ flagged, $1M+ high alert)'],
                  ['Dark pool prints', 'hidden block trades ($500K+ flagged, $10M+ high alert)'],
                  ['Direction', 'bullish (call buys) or bearish (put buys)'],
                  ['Multi-day conviction', 'same ticker active 3+ days = high confidence'],
                  ['Cross-signal', 'options + dark pool on same stock = strongest signal'],
                ].map(([label, desc]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 11, color: t.text2 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#5eed8a', flexShrink: 0, marginTop: 5 }} />
                    <span><span style={{ color: '#5eed8a', fontWeight: 500 }}>{label}</span> — {desc}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, padding: '5px 7px', background: 'rgba(94,237,138,0.04)', borderRadius: 6, border: '0.5px solid rgba(94,237,138,0.1)' }}>
                <div style={{ fontSize: 9, color: t.text3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>Example</div>
                <div style={{ fontSize: 11, color: t.text2 }}>
                  <span style={{ color: '#5eed8a', fontWeight: 500 }}>PLTR</span> — 3 bullish sweeps · $2.1M premium · $4.5M dark pool → institutions loading up aggressively
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
      {/* ── Chip legend ── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, paddingTop: 8, borderTop: `0.5px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #6aff9e, #1a8a45)', border: '1.5px solid #5eed8a' }} />
          <span style={{ fontSize: 11, color: t.text3 }}>Up</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #ff8a8a, #a03030)', border: '1.5px solid #F09595' }} />
          <span style={{ fontSize: 11, color: t.text3 }}>Down</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.card, border: `1.5px solid ${t.text3}` }} />
          <span style={{ fontSize: 11, color: t.text3 }}>Small</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: t.card, border: `1.5px solid ${t.text3}` }} />
          <span style={{ fontSize: 11, color: t.text3 }}>Big</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.text3, textAlign: 'center', marginTop: 6 }}>
        Scanners run during market hours · 9:30am–4pm EST
      </div>
    </div>
  );
}

function DetailPanel({ alert, t }) {
  const tc = TYPE_CONFIG[alert.type] || TYPE_CONFIG.vol_surge;
  return (
    <div style={{ background: t.card, borderRadius: 10, border: `1px solid ${t.border}`, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</span>
        <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: tc.bg, color: tc.color, fontFamily: "'Outfit', sans-serif" }}>{tc.label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: alert.changePct >= 0 ? t.green : t.red, marginLeft: 'auto' }}>
          {alert.changePct >= 0 ? '+' : ''}{alert.changePct.toFixed(1)}%
        </span>
      </div>
      <div style={{ fontSize: 11, color: t.text3, marginBottom: 8 }}>
        {alert.company && `${alert.company} · `}
        {alert.price && `$${Number(alert.price).toFixed(2)} · `}
        {timeAgo(alert.created_at)}
      </div>
      <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.5, marginBottom: 10 }}>
        {alert.explanation}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {alert.stats.map((s, i) => (
          <div key={i} style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</div>
            <div style={{
              fontSize: 12, fontWeight: 600, color: s.color !== undefined ? (s.color ? t.green : t.red) : t.text1,
              marginTop: 2, fontFamily: "'Outfit', sans-serif",
            }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
