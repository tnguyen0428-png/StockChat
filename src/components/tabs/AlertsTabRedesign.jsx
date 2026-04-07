import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { useTheme, ChipField, DarkModeToggle, timeAgo, SentimentPill } from './alertsCasinoComponents';

// Default scanner tag mapping (used as fallback before DB alert_types load)
const DEFAULT_TAG_MAP = { '52w_high': 'Yearly High', 'vol_surge': 'Volume Spike', 'gap_up': 'Gap Up', 'ma_cross': 'Trend Change', 'vcp': 'VCP Pattern', 'flow_signal': 'Flow Signal' };

// Filter pill config with icons and colors (matches mockup upgrade)
const FILTER_PILL_CONFIG = {
  'All':          { icon: '⚡', label: 'All',         iconBg: 'rgba(212,168,83,0.15)',  iconColor: '#f0d78c' },
  '52w_high':     { icon: '👑', label: 'Near High',   iconBg: 'rgba(34,197,94,0.15)',   iconColor: '#4ade80' },
  'vol_surge':    { icon: '📊', label: 'Unusual Vol',  iconBg: 'rgba(249,115,22,0.15)',  iconColor: '#fb923c' },
  'gap_up':       { icon: '⬆️', label: 'Gap Up',       iconBg: 'rgba(59,130,246,0.15)',  iconColor: '#60a5fa' },
  'ma_cross':     { icon: '📈', label: 'Trend Shift',  iconBg: 'rgba(168,85,247,0.15)',  iconColor: '#c084fc' },
  'flow_signal':  { icon: '💰', label: 'Big Money',    iconBg: 'rgba(16,185,129,0.15)',  iconColor: '#34d399' },
  'vcp':          { icon: '🔄', label: 'VCP Pattern',  iconBg: 'rgba(234,179,8,0.15)',   iconColor: '#facc15' },
};

// Sector display labels
const SECTOR_LABELS = {
  'AI_INFRA_COOLING': 'AI Cooling', 'AI_INFRA_COMPUTE': 'AI Compute', 'AI_INFRA_POWER': 'AI Power',
  'NUCLEAR_ENERGY': 'Nuclear', 'GRID_POWER': 'Grid/Power', 'SEMICONDUCTORS_HBM': 'Memory/HBM',
  'PHOTONICS_OPTICAL': 'Photonics', 'AGENTIC_AI': 'Agentic AI', 'DEFENSE_AI': 'Defense AI',
  'QUANTUM': 'Quantum', 'ROBOTICS': 'Robotics', 'SPACE_SAT': 'Space/Sat',
  'BIOTECH_AI': 'Biotech AI', 'ENERGY_STORAGE': 'Energy Storage',
};

const SECTOR_COLORS = {
  'AI_INFRA_COOLING': '#06B6D4', 'AI_INFRA_COMPUTE': '#8B5CF6', 'AI_INFRA_POWER': '#F59E0B',
  'NUCLEAR_ENERGY': '#10B981', 'GRID_POWER': '#EF4444', 'SEMICONDUCTORS_HBM': '#3B82F6',
  'PHOTONICS_OPTICAL': '#EC4899', 'AGENTIC_AI': '#6366F1', 'DEFENSE_AI': '#78716C',
  'QUANTUM': '#A855F7', 'ROBOTICS': '#F97316', 'SPACE_SAT': '#0EA5E9',
  'BIOTECH_AI': '#84CC16', 'ENERGY_STORAGE': '#FBBF24',
};

const CONVICTION_CONFIG = {
  'very_high': { label: 'Very High', emoji: '🔥🔥', color: '#DC2626', bg: '#FEF2F2' },
  'high':      { label: 'High',      emoji: '🔥',   color: '#F59E0B', bg: '#FFFBEB' },
  'standard':  { label: 'Standard',  emoji: '',      color: '#64748B', bg: '#F8FAFC' },
};

// Map a raw Supabase breakout_alerts row to the redesign card format
function mapDbAlert(a, spyData, tagMap) {
  const ticker = a.ticker ?? a.tickers?.[0] ?? '—';
  const type = a.signal_type ?? a.alert_type ?? 'vol_surge';
  const rawVol = a.volume ?? a.current_volume;
  const volume = rawVol ? (Number(rawVol) >= 1e6 ? (Number(rawVol) / 1e6).toFixed(1) + 'M' : Number(rawVol).toLocaleString()) : null;
  const avgVolume = a.avg_volume ? (Number(a.avg_volume) >= 1e6 ? (Number(a.avg_volume) / 1e6).toFixed(1) + 'M' : Number(a.avg_volume).toLocaleString()) : null;

  // Format time
  let time = a.time ?? '';
  if (!time && a.created_at) {
    const d = new Date(a.created_at), today = new Date();
    const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    time = d.toDateString() === today.toDateString() ? t : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${t}`;
  }

  // Signal text
  let signal = a.signal ?? a.notes ?? a.title ?? '';
  if (!signal && type === '52w_high' && a.pct_from_high != null) signal = `Within ${a.pct_from_high}% of 52-week high`;
  else if (!signal && type === 'gap_up' && a.gap_pct != null) signal = `Gapped up +${Number(a.gap_pct).toFixed(2)}%`;
  else if (!signal && type === 'ma_cross' && a.short_ma != null) signal = `${a.short_ma_period ?? 20}MA crossed above ${a.long_ma_period ?? 50}MA`;
  else if (!signal && type === 'vol_surge' && a.volume_ratio != null) signal = `Volume surging ${a.volume_ratio}x above average`;

  // For flow_signal alerts, change_pct was previously misused to store confidence.
  // Use actual price change fields only; never fall back to change_pct for flow signals.
  const isFlowSignal = type === 'flow_signal';
  const change = isFlowSignal
    ? (a.change ?? a.gap_pct ?? null)                      // skip change_pct for flow signals
    : (a.change ?? a.change_pct ?? a.gap_pct ?? null);     // scanner alerts use change_pct normally
  const resistance = a.resistance ?? (type === '52w_high' ? a.high_52w : null);
  const support = a.support ?? a.prev_close ?? null;

  // Confidence: prefer explicit confidence field, then derive from signal quality
  let confidence = a.confidence ?? (isFlowSignal ? Math.min(95, 60 + Math.round((a.rel_volume || 0) / 3)) : 70);
  if (a.confidence == null && !isFlowSignal) {
    if (a.volume_ratio > 2) confidence += 10;
    if (a.pct_from_high != null && a.pct_from_high < 2) confidence += 5;
    if (change != null && change > 3) confidence += 5;
    confidence = Math.min(confidence, 95);
  }

  const vsSpy = a.rsVsSpy ?? (change != null && spyData?.change ? Number(change) - Number(spyData.change) : null);

  // Use dynamic tag map for label
  const scannerTag = tagMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // ── Flow signal enrichment: decode packed fields ──
  let flowPremium = null, flowSweeps = 0, flowDpValue = null, flowOptCount = 0, flowDpCount = 0, flowScore = 0;
  if (isFlowSignal) {
    flowPremium = a.avg_volume ? Number(a.avg_volume) : null;    // total options premium ($)
    flowSweeps = a.volume_ratio ? Number(a.volume_ratio) : 0;    // bullish call sweeps
    flowDpValue = a.gap_pct ? Number(a.gap_pct) : null;          // dark pool dollar value
    flowOptCount = a.pct_from_high ? Number(a.pct_from_high) : 0; // options trade count
    flowDpCount = a.high_52w ? Number(a.high_52w) : 0;           // dark pool print count
    flowScore = a.rel_volume ? Number(a.rel_volume) : 0;         // signal score
  }

  // Generate whyAlerting bullets
  const whyAlerting = [];
  if (isFlowSignal) {
    // Flow-specific bullets with real data
    const premiumStr = flowPremium ? (flowPremium >= 1e6 ? `$${(flowPremium / 1e6).toFixed(1)}M` : `$${(flowPremium / 1e3).toFixed(0)}K`) : null;
    const dpStr = flowDpValue ? (flowDpValue >= 1e6 ? `$${(flowDpValue / 1e6).toFixed(1)}M` : `$${(flowDpValue / 1e3).toFixed(0)}K`) : null;

    if (premiumStr) whyAlerting.push({ icon: "💰", label: "Options Premium", text: `${premiumStr} total premium across ${flowOptCount} trade${flowOptCount !== 1 ? 's' : ''}` });
    if (flowSweeps > 0) whyAlerting.push({ icon: "🔥", label: "Bullish Sweeps", text: `${flowSweeps} aggressive call sweep${flowSweeps !== 1 ? 's' : ''} detected` });
    if (dpStr) whyAlerting.push({ icon: "🏦", label: "Dark Pool", text: `${dpStr} in dark pool prints (${flowDpCount} block${flowDpCount !== 1 ? 's' : ''})` });
    if (flowScore >= 80) whyAlerting.push({ icon: "✅", label: "Strong Signal", text: `Score ${flowScore} — multiple converging indicators` });
    else if (flowScore >= 40) whyAlerting.push({ icon: "📊", label: "Moderate Signal", text: `Score ${flowScore} — notable institutional interest` });
    else whyAlerting.push({ icon: "🔍", label: "Early Signal", text: `Score ${flowScore} — monitor for confirmation` });
    // Fallback bullets when sparse data — always ensure ≥3 bullets for visual parity with scanner alerts
    if (whyAlerting.length < 3) {
      whyAlerting.push({ icon: "🎯", label: "Conviction", text: `${confidence}% confidence — institutional-grade setup` });
    }
    if (whyAlerting.length < 3) {
      whyAlerting.push({ icon: "📈", label: "Flow Signal", text: `Unusual activity detected on ${ticker} — watch for follow-through` });
    }
  } else {
    // Scanner alert bullets (original logic)
    if (signal) whyAlerting.push({ icon: "📊", label: scannerTag, text: signal });
    if (volume) whyAlerting.push({ icon: "🔥", label: "Volume", text: `${volume} shares traded${avgVolume ? ` (avg: ${avgVolume})` : ''}` });
    if (confidence >= 80) whyAlerting.push({ icon: "✅", label: "Strong Setup", text: "Technical indicators look positive" });
    else whyAlerting.push({ icon: "🔍", label: "Watch Closely", text: "Moderate signal — monitor for confirmation" });
  }

  // Conviction badge
  const conviction = a.conviction || 'standard';
  const convInfo = CONVICTION_CONFIG[conviction] || CONVICTION_CONFIG.standard;

  // Sector label
  const sectorKey = a.sector || null;
  const sectorLabel = sectorKey ? (SECTOR_LABELS[sectorKey] || sectorKey.replace(/_/g, ' ')) : '—';
  const sectorColor = sectorKey ? (SECTOR_COLORS[sectorKey] || '#64748B') : null;

  return {
    ...a, id: a.id, ticker, company: a.name ?? ticker, price: a.price != null ? Number(a.price) : 0,
    change: change != null ? Number(change) : 0, changePercent: change != null ? Number(change) : 0,
    time, scannerTag, volume: volume ?? '—', avgVolume: avgVolume ?? '—',
    vsSpy: vsSpy ?? 0, confidence, support: support != null ? Number(support) : 0, resistance: resistance != null ? Number(resistance) : 0,
    sector: sectorLabel, sectorKey, sectorColor, sectorTier: a.sector_tier ?? null,
    conviction, convictionLabel: convInfo.label, convictionEmoji: convInfo.emoji,
    convictionColor: convInfo.color, convictionBg: convInfo.bg,
    marketCap: '—', description: a.context ?? '',
    whyAlerting: whyAlerting.length > 0 ? whyAlerting : [{ icon: "📊", label: "Alert", text: "Breakout signal detected" }],
    isAlertOfDay: false, _isLive: true,
    // Flow signal enrichment
    isFlowSignal, flowPremium, flowSweeps, flowDpValue, flowOptCount, flowDpCount, flowScore,
  };
}

// ===== HELPERS =====
const nowTs = () => new Date();
function relTime(ts) {
  if (!ts) return '—';
  const d = Math.floor((nowTs() - new Date(ts)) / 60000);
  if (isNaN(d)) return '—';
  if (d < 1) return "Just now";
  if (d === 1) return "1 min ago";
  if (d < 60) return `${d} min ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}
function freshDotColor(ts) {
  if (!ts) return "#cbd5e1";
  const d = Math.floor((nowTs() - new Date(ts)) / 60000);
  if (isNaN(d)) return "#cbd5e1";
  if (d <= 5) return "#22c55e"; if (d <= 15) return "#f59e0b"; return "#cbd5e1";
}
function cardOpacity(ts) { if (!ts) return 0.75; const d = Math.floor((nowTs() - new Date(ts)) / 60000); return isNaN(d) || d > 15 ? 0.75 : 1; }

function formatDollar(n) {
  if (n == null) return '—';
  n = Number(n);
  if (isNaN(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatShares(n) {
  if (n == null) return '—';
  n = Number(n);
  if (isNaN(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

// ===== SHARED COMPONENTS =====
function Tooltip({ text, t: theme }) {
  const [show, setShow] = useState(false);
  const bg = theme?.surface || "#e2e8f0";
  const fg = theme?.text2 || "#64748b";
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button onClick={e => { e.stopPropagation(); setShow(!show); }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, borderRadius: "50%", background: bg, color: fg, border: "none", cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>i</button>
      {show && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8, width: 220, padding: "8px 12px", fontSize: 12, color: "#fff", background: "#1e293b", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.2)", zIndex: 99, lineHeight: 1.5 }}>{text}</div>}
    </span>
  );
}

function BigMoneyBadge({ ticker, flowData, onClick, t: theme }) {
  // Check live dark pool + options data for bullish signal
  const hasBullish = flowData.darkpool.some(d => d.ticker === ticker && d.direction === 'buying') ||
                     flowData.options.some(o => o.ticker === ticker && o.direction === 'bullish');
  if (!hasBullish) return null;
  const green = theme?.green || "#15803d";
  const greenBg = theme?.greenBg || "#f0fdf4";
  return (
    <div onClick={e => { e.stopPropagation(); onClick(ticker); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, background: greenBg, border: `1px solid ${green}40`, marginTop: 6, cursor: "pointer" }}>
      <span style={{ fontSize: 11 }}>🎯</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: green }}>Big money is also buying</span>
    </div>
  );
}

// ===== HOT SECTORS COMPONENT =====
const SECTOR_EMOJIS = {
  'AI_INFRA_COOLING': '🧊', 'AI_INFRA_COMPUTE': '🖥️', 'AI_INFRA_POWER': '⚡',
  'NUCLEAR_ENERGY': '☢️', 'GRID_POWER': '🔌', 'SEMICONDUCTORS_HBM': '🧠',
  'PHOTONICS_OPTICAL': '💡', 'AGENTIC_AI': '🤖', 'DEFENSE_AI': '🛡️',
  'QUANTUM': '🔮', 'ROBOTICS': '🦾', 'SPACE_SAT': '🛰️',
  'BIOTECH_AI': '🧬', 'ENERGY_STORAGE': '🔋',
};

const SECTOR_TICKERS = {
  'AI_INFRA_COOLING': ['VRT', 'CRSR', 'LIQT'],
  'AI_INFRA_COMPUTE': ['NVDA', 'AMD', 'SMCI'],
  'AI_INFRA_POWER': ['POWL', 'ETN', 'VRT'],
  'NUCLEAR_ENERGY': ['VST', 'CEG', 'SMR', 'NNE'],
  'GRID_POWER': ['ETN', 'PWR', 'VRT'],
  'SEMICONDUCTORS_HBM': ['MU', 'ALAB', 'RMBS'],
  'PHOTONICS_OPTICAL': ['COHR', 'II-VI', 'LITE'],
  'AGENTIC_AI': ['CRM', 'PATH', 'AI'],
  'DEFENSE_AI': ['PLTR', 'LMT', 'RTX'],
  'QUANTUM': ['IONQ', 'RGTI', 'QUBT'],
  'ROBOTICS': ['ISRG', 'TER', 'IRBT'],
  'SPACE_SAT': ['RKLB', 'ASTS', 'LUNR'],
  'BIOTECH_AI': ['RXRX', 'SDGR', 'ABCL'],
  'ENERGY_STORAGE': ['ENVX', 'QS', 'STEM'],
};

function HotSectors({ alerts, onSectorTap, activeSector, t, darkMode }) {
  const [isOpen, setIsOpen] = useState(false);

  // Count alerts per sector and compute heat score
  const sectorStats = useMemo(() => {
    const stats = {};
    alerts.forEach(a => {
      if (!a.sectorKey) return;
      if (!stats[a.sectorKey]) stats[a.sectorKey] = { key: a.sectorKey, count: 0, totalConf: 0, tickers: new Set() };
      stats[a.sectorKey].count++;
      stats[a.sectorKey].totalConf += a.confidence || 0;
      stats[a.sectorKey].tickers.add(a.ticker);
    });
    return Object.values(stats)
      .map(s => ({ ...s, avgConf: s.count > 0 ? s.totalConf / s.count : 0, tickers: [...s.tickers] }))
      .sort((a, b) => b.count - a.count || b.avgConf - a.avgConf);
  }, [alerts]);

  // If no alert-driven sectors, show seed sectors so the section isn't empty
  const seedSectors = useMemo(() => {
    if (sectorStats.length > 0) return sectorStats;
    return Object.keys(SECTOR_TICKERS).slice(0, 6).map(key => ({
      key, count: 0, avgConf: 0, tickers: SECTOR_TICKERS[key] || [],
    }));
  }, [sectorStats]);

  const maxCount = seedSectors[0]?.count || 1;
  const topNames = seedSectors.slice(0, 3).map(s => SECTOR_LABELS[s.key] || s.key).join(' · ');

  return (
    <div style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
      {/* Collapsible header */}
      <div onClick={() => setIsOpen(!isOpen)} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: t.text1 }}>Hot Sectors</span>
        </div>
        <span style={{ fontSize: 18, color: t.text3, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
      </div>
      {/* Collapsed summary removed — header badge shows count */}
      {/* Expanded grid */}
      {isOpen && (
        <div style={{ padding: '0 12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {seedSectors.map(s => {
              const label = SECTOR_LABELS[s.key] || s.key;
              const color = SECTOR_COLORS[s.key] || '#64748B';
              const emoji = SECTOR_EMOJIS[s.key] || '📊';
              const tier = alerts.find(a => a.sectorKey === s.key)?.sectorTier;
              const tierLabel = tier === 1 ? 'T1' : tier === 2 ? 'T2' : tier === 3 ? 'T3' : null;
              const tierClass = tier === 1 ? { bg: 'rgba(240,149,149,0.15)', color: '#f87171' } : tier === 2 ? { bg: 'rgba(250,199,117,0.15)', color: t.amber } : { bg: 'rgba(123,140,222,0.15)', color: t.blue };
              const heatPct = maxCount > 0 ? Math.round((s.count / maxCount) * 100) : 50;
              const isActive = activeSector === s.key;
              const displayTickers = (s.tickers.length > 0 ? s.tickers : (SECTOR_TICKERS[s.key] || [])).slice(0, 4);

              return (
                <div key={s.key} onClick={(e) => { e.stopPropagation(); onSectorTap(isActive ? null : s.key); }} style={{
                  background: t.surface, borderRadius: 10, padding: '10px 12px',
                  border: isActive ? `1.5px solid ${color}` : `1px solid rgba(30,61,98,0.4)`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: t.text1 }}>{emoji} {label}</span>
                    {tierLabel && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: tierClass.bg, color: tierClass.color, fontFamily: "'Outfit', sans-serif" }}>{tierLabel}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: t.text3, lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>
                    {displayTickers.map((tk, i) => (
                      <span key={tk}>{i > 0 && ' · '}<strong style={{ color: i < 2 ? t.text2 : t.text3, fontWeight: i < 2 ? 600 : 400 }}>{tk}</strong></span>
                    ))}
                  </div>
                  {s.count > 0 && <div style={{ fontSize: 10, color: t.text3, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}><strong style={{ color: t.text2 }}>{s.count}</strong> alerts</div>}
                  <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'rgba(30,61,98,0.3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${heatPct}%`, background: color, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
          {activeSector && (() => {
            const s = seedSectors.find(x => x.key === activeSector);
            if (!s) return null;
            const label = SECTOR_LABELS[s.key] || s.key;
            const color = SECTOR_COLORS[s.key] || '#64748B';
            const emoji = SECTOR_EMOJIS[s.key] || '📊';
            const tickers = (s.tickers.length > 0 ? s.tickers : (SECTOR_TICKERS[s.key] || []));
            const sectorAlerts = alerts.filter(a => a.sectorKey === s.key);
            return (
              <div style={{ marginTop: 10, padding: '10px 12px', background: t.surface, borderRadius: 10, border: `1px solid ${color}40` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: t.text1 }}>{emoji} {label}</span>
                  <span onClick={(e) => { e.stopPropagation(); onSectorTap(null); }} style={{ fontSize: 14, color: t.text3, cursor: 'pointer', padding: '0 4px' }}>▴</span>
                </div>
                <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>Tickers to watch</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {tickers.map(tk => (
                    <span key={tk} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 8, background: `${color}18`, color: color, fontFamily: "'DM Sans', sans-serif" }}>{tk}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: t.text2, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                  {sectorAlerts.length > 0
                    ? <><strong style={{ color: t.text1 }}>{sectorAlerts.length}</strong> live alert{sectorAlerts.length > 1 ? 's' : ''} firing in this sector{sectorAlerts[0]?.ticker ? ` — lead: ${sectorAlerts[0].ticker}` : ''}.</>
                    : <>No live alerts yet — these are the sector leaders our scanners watch.</>}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ===== SKELETON / EMPTY =====
function SkeletonCard({ t: theme }) {
  const border = theme?.border || "#e2e8f0";
  const cardBg = theme?.card || "#fff";
  const surface = theme?.surface || "#f8fafc";
  const b = { background: border, borderRadius: 8 }, sh = { animation: "pulse 1.5s ease-in-out infinite" };
  return (<div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 24 }}><style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }`}</style><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div><div style={{ ...b, ...sh, width: 80, height: 28, marginBottom: 8 }}/><div style={{ ...b, ...sh, width: 130, height: 16 }}/></div><div style={{ textAlign: "right" }}><div style={{ ...b, ...sh, width: 96, height: 28, marginBottom: 8, marginLeft: "auto" }}/><div style={{ ...b, ...sh, width: 110, height: 16, marginLeft: "auto" }}/></div></div>{[1,2,3].map(i=>(<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: surface, borderRadius: 12, padding: "12px 16px" }}><div style={{ ...b, ...sh, width: 36, height: 36, borderRadius: 10 }}/><div style={{ flex: 1 }}><div style={{ ...b, ...sh, width: 96, height: 16, marginBottom: 6 }}/><div style={{ ...b, ...sh, width: 200, height: 12 }}/></div></div>))}<div style={{ display: "flex", gap: 12, marginTop: 16 }}><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/></div></div>);
}

function NoAlerts({ t: theme }) {
  const cardBg = theme?.card || "#fff";
  const border = theme?.border || "#e2e8f0";
  const text1 = theme?.text1 || "#1e293b";
  const text3 = theme?.text3 || "#94a3b8";
  return (<div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: "48px 24px", textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔭</div><h3 style={{ fontSize: 18, fontWeight: 600, color: text1, margin: "0 0 8px" }}>No High-Confidence Alerts Right Now</h3><p style={{ fontSize: 14, color: text3, maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>Our scanners are still running — we'll notify you when something stands out.</p></div>);
}

// ===== MODAL =====
function Modal({ alert, onClose, t: theme }) {
  const tt = theme || {};
  const cardBg = tt.card || "#fff";
  const surface = tt.surface || "#f8fafc";
  const border = tt.borderLight || "#f1f5f9";
  const text1 = tt.text1 || "#0f172a";
  const text2 = tt.text2 || "#64748b";
  const text3 = tt.text3 || "#94a3b8";
  const green = tt.green || "#16a34a";
  const red = tt.red || "#dc2626";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: cardBg, borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,.25)" }}>
        <div style={{ position: "sticky", top: 0, background: cardBg, borderRadius: "20px 20px 0 0", borderBottom: `1px solid ${border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: text1 }}>{alert.ticker}</h2><p style={{ margin: "2px 0 0", fontSize: 14, color: text2 }}>{alert.company}</p></div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: surface, border: "none", cursor: "pointer", fontSize: 18, color: text2, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div><span style={{ fontSize: 30, fontWeight: 700, color: text1 }}>${alert.price.toFixed(2)}</span>
            {alert.isFlowSignal ? (
              <span style={{ marginLeft: 12, padding: '3px 10px', borderRadius: 10, fontWeight: 700, fontSize: 16, background: alert.confidence >= 80 ? '#f0fdf4' : '#f8fafc', color: alert.confidence >= 80 ? green : text2 }}>{alert.confidence}% confidence</span>
            ) : (
              <span style={{ marginLeft: 12, color: alert.change >= 0 ? green : red, fontWeight: 600 }}>{alert.change >= 0 ? "▲" : "▼"} ${Math.abs(alert.change).toFixed(2)} ({alert.change >= 0 ? "+" : ""}{alert.changePercent}%)</span>
            )}
          </div>
          <div style={{ background: surface, borderRadius: 16, height: 160, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${border}` }}><span style={{ fontSize: 14, color: text3 }}>Chart — connects to live data later</span></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: text3, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Key Stats</h4><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{(alert.isFlowSignal ? [
            {l:"Signal Score",v:alert.flowScore,s:alert.flowScore>=80?"Very Strong":alert.flowScore>=40?"Strong":"Moderate"},
            {l:"Confidence",v:`${alert.confidence}%`,s:alert.confidence>=90?"Very High":alert.confidence>=80?"High":"Moderate"},
            {l:"Options Premium",v:alert.flowPremium?(alert.flowPremium>=1e6?`$${(alert.flowPremium/1e6).toFixed(1)}M`:`$${(alert.flowPremium/1e3).toFixed(0)}K`):'—',s:`${alert.flowOptCount} option trade${alert.flowOptCount!==1?'s':''}`},
            {l:"Dark Pool",v:alert.flowDpValue?(alert.flowDpValue>=1e6?`$${(alert.flowDpValue/1e6).toFixed(1)}M`:`$${(alert.flowDpValue/1e3).toFixed(0)}K`):'—',s:`${alert.flowDpCount} block print${alert.flowDpCount!==1?'s':''}`},
          ] : [
            {l:"Volume",v:alert.volume,s:`Avg: ${alert.avgVolume}`},
            {l:"Market Cap",v:alert.marketCap,s:alert.sector},
            {l:"vs S&P 500",v:`${alert.vsSpy>=0?"+":""}${alert.vsSpy}%`,s:alert.vsSpy>=0?"Outperforming":"Underperforming"},
            {l:"Confidence",v:`${alert.confidence}%`,s:alert.confidence>=90?"Very High":alert.confidence>=80?"High":"Moderate"},
          ]).map(x=>(<div key={x.l} style={{ background: surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: text3, textTransform: "uppercase", margin: 0 }}>{x.l}</p><p style={{ fontSize: 18, fontWeight: 700, color: text1, margin: "4px 0 2px" }}>{x.v}</p><p style={{ fontSize: 12, color: text2, margin: 0 }}>{x.s}</p></div>))}</div></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: text3, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Why It's Alerting</h4><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{alert.whyAlerting.map((w,i)=>(<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: surface, borderRadius: 14, padding: "12px 16px" }}><span style={{ fontSize: 18, marginTop: 2 }}>{w.icon}</span><div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text1 }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: text2, lineHeight: 1.4 }}>{w.text}</p></div></div>))}</div></div>
          <div style={{ display: "flex", gap: 12 }}><div style={{ flex: 1, background: surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Support <Tooltip text="A price level where this stock has historically stopped falling." t={theme} /></p><p style={{ fontSize: 18, fontWeight: 700, color: text1, margin: "4px 0 0" }}>${alert.support.toFixed(2)}</p></div><div style={{ flex: 1, background: surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." t={theme} /></p><p style={{ fontSize: 18, fontWeight: 700, color: text1, margin: "4px 0 0" }}>${alert.resistance.toFixed(2)}</p></div></div>
          <div style={{ display: "flex", gap: 12, padding: 0 }}><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: green, color: "#fff", border: "none" }}>Add to Watchlist</button><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: "transparent", color: text2, border: `2px solid ${border}` }}>Discuss in Chat</button></div>
        </div>
      </div>
    </div>
  );
}

function MoodBar({ score, t: theme }) {
  const s = score ?? 34;
  const label = s > 30 ? "Fearful" : s > 20 ? "Neutral" : s > 10 ? "Greedy" : "Very Greedy";
  const color = s > 30 ? "#f97316" : s > 20 ? "#eab308" : "#22c55e";
  const pct = Math.min(Math.max(s / 50, 0), 1) * 100;
  const t3 = theme?.text3 || "#94a3b8";
  const t2 = theme?.text2 || "#475569";
  const bg = theme?.border || "#e2e8f0";
  return (<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, color: t3 }}>MOOD:</span><span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span><div style={{ width: 48, height: 6, borderRadius: 3, background: bg, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, #ef4444, ${color})` }}/></div><span style={{ fontSize: 12, fontWeight: 600, color: t2 }}>{Math.round(s)}</span></div>);
}

// ===== FLOW CARDS (now driven by live data) =====
function BigMoneyCard({ trade, isExpanded, onToggle, t: theme }) {
  const dir = (trade.direction || 'neutral').toLowerCase();
  const dc = { buying: { bg: "#f0fdf4", border: "#22c55e", icon: "↑", label: "Buying", color: "#15803d" }, selling: { bg: "#fef2f2", border: "#ef4444", icon: "↓", label: "Selling", color: "#dc2626" }, neutral: { bg: "#fffbeb", border: "#f59e0b", icon: "→", label: "Unclear", color: "#d97706" } }[dir] || { bg: "#fffbeb", border: "#f59e0b", icon: "→", label: "Unclear", color: "#d97706" };
  const cardBg = theme?.card || "#fff";
  const border = theme?.border || "#e2e8f0";
  const text1 = theme?.text1 || "#0f172a";
  const text3 = theme?.text3 || "#94a3b8";
  const text2 = theme?.text2 || "#475569";
  const borderLight = theme?.borderLight || "#f1f5f9";
  const mult = Number(trade.multiplier) || 1;
  return (
    <div onClick={onToggle} style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, borderLeft: `${mult >= 8 ? 4 : 3}px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(trade.executed_at || trade.fetched_at) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: dc.color }}>{dc.icon}</div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: text1 }}>{trade.ticker}</h4>
          <span style={{ fontSize: 10, fontWeight: 600, color: dc.color, textTransform: "uppercase" }}>{dc.label}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: text1 }}>{formatDollar(trade.dollar_value)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: text3 }}>
        <span>{formatShares(trade.shares || trade.size)} shares{mult > 1 ? ` · ${mult.toFixed(1)}x normal` : ''}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(trade.executed_at || trade.fetched_at), display: "inline-block" }}/>{relTime(trade.executed_at || trade.fetched_at)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${borderLight}` }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: text2, lineHeight: 1.5 }}>💡 {trade.note || `${formatDollar(trade.dollar_value)} dark pool print on ${trade.ticker}${trade.venue ? ` via ${trade.venue}` : ''}`}</p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: text3 }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

function SmartBetCard({ bet, isExpanded, onToggle, t: theme }) {
  const _optType = (bet.option_type || bet.trade_type || '').toLowerCase();
  const isUp = _optType.includes('call') ? true : _optType.includes('put') ? false : bet.direction === "bullish";
  const dc = isUp ? { bg: "#f0fdf4", border: "#22c55e", color: "#15803d" } : { bg: "#fef2f2", border: "#ef4444", color: "#dc2626" };
  const cardBg = theme?.card || "#fff";
  const border = theme?.border || "#e2e8f0";
  const text1 = theme?.text1 || "#0f172a";
  const text3 = theme?.text3 || "#94a3b8";
  const text2 = theme?.text2 || "#475569";
  const borderLight = theme?.borderLight || "#f1f5f9";
  return (
    <div onClick={onToggle} style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, borderLeft: `3px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(bet.executed_at || bet.fetched_at) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{isUp ? "📈" : "📉"}</span>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: text1 }}>{bet.ticker}</h4>
          {bet.is_unusual && <span style={{ padding: "1px 5px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 9, fontWeight: 700 }}>🔥 UNUSUAL</span>}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: text1 }}>{formatDollar(bet.premium)}</span>
      </div>
      <div style={{ background: dc.bg, borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: dc.color, fontWeight: 600 }}>
          {isUp ? "Betting UP" : "Betting DOWN"}: {bet.bet_desc || `${bet.option_type?.toUpperCase() || 'OPTION'} $${bet.strike || '?'}`}
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: text3 }}>
        <span>{bet.trade_type || 'option'}{bet.is_otm ? ' · OTM' : ''}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(bet.executed_at || bet.fetched_at), display: "inline-block" }}/>{relTime(bet.executed_at || bet.fetched_at)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${borderLight}` }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: text2, lineHeight: 1.5 }}>
              💡 {formatDollar(bet.premium)} bet that {bet.ticker} goes {isUp ? 'above' : 'below'} ${bet.strike || '?'}{bet.expiry ? ` by ${new Date(bet.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}.
              {bet.size ? ` ${bet.size.toLocaleString()} contracts.` : ''}
              {bet.volume && bet.open_interest ? ` Vol/OI: ${bet.volume.toLocaleString()}/${bet.open_interest.toLocaleString()}` : ''}
            </p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: text3 }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

// ===== MAIN =====
export default function AlertsTab({ session, group }) {
  const { isAdmin } = useGroup();
  const [view, setView] = useState("loading");
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('uptik_darkMode') === 'true'; } catch { return false; }
  });
  const t = useTheme(darkMode);
  const [filter, setFilter] = useState("All");
  const [modalAlert, setModalAlert] = useState(null);
  const [selectedChipId, setSelectedChipId] = useState(null);
  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState(null);
  const [showFlow, setShowFlow] = useState(false);
  const [flowTab, setFlowTab] = useState("bigmoney");
  const [flowSort, setFlowSort] = useState("time");
  const [flowExpandedId, setFlowExpandedId] = useState(null);
  const [flowTickerFilter, setFlowTickerFilter] = useState(null);
  const [flowShowAll, setFlowShowAll] = useState(false);
  const [mysterySelected, setMysterySelected] = useState(null); // 'options' | 'darkpool' | null
  const flowRef = useRef(null);

  // ── Live data state ──
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [fearScore, setFearScore] = useState(null);
  const [spyData, setSpyData] = useState(null);

  // ── Dynamic filter types from DB ──
  const [alertTypes, setAlertTypes] = useState([]);
  const tagMap = useMemo(() => {
    const map = { ...DEFAULT_TAG_MAP };
    alertTypes.forEach(at => { map[at.type_key] = at.label; });
    return map;
  }, [alertTypes]);

  // ── Live alert performance history ──
  const [perfHistory, setPerfHistory] = useState([]);

  // ── Performance snapshots (multi-interval 1d/3d/7d/14d/30d) ──
  const [perfSnapshots, setPerfSnapshots] = useState([]);

  // ── Sector filter state ──
  const [sectorFilter, setSectorFilter] = useState(null);
  const [hotSectorPick, setHotSectorPick] = useState(null);
  const [convictionFilter, setConvictionFilter] = useState(null);
  const [quickFilter, setQuickFilter] = useState('all');
  // ── Next scan countdown (60s cycle) ──
  const [nextScanSec, setNextScanSec] = useState(60);
  useEffect(() => {
    const id = setInterval(() => setNextScanSec(s => s <= 1 ? 60 : s - 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Live institutional flow ──
  const [darkpoolTrades, setDarkpoolTrades] = useState([]);
  const [optionsFlow, setOptionsFlow] = useState([]);

  // ── Fetch alert_types (dynamic filters) ──
  useEffect(() => {
    supabase.from('alert_types').select('*').eq('is_active', true).order('position')
      .then(({ data, error }) => {
        if (data && data.length > 0) setAlertTypes(data);
      });
  }, []);

  // ── Fetch breakout_alerts + realtime ──
  useEffect(() => {
    const load = async () => {
      // Only show alerts from the last 7 days to avoid stale pre-engine tickers
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data } = await supabase.from('breakout_alerts').select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setLiveAlerts(data);
      setView("active");
    };
    load();
    const channel = supabase.channel('alerts_feed_redesign')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'breakout_alerts' }, (payload) => {
        setLiveAlerts(prev => [payload.new, ...prev]);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Fetch alert_performance (history) + realtime ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('alert_performance').select('*')
        .not('outcome', 'is', null)
        .order('alert_time', { ascending: false })
        .limit(20);
      if (data) setPerfHistory(data);
    };
    load();
    const channel = supabase.channel('perf_feed')
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

  // ── Fetch performance snapshots (multi-interval) + realtime ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('alert_performance_snapshots').select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setPerfSnapshots(data);
    };
    load();
    const channel = supabase.channel('perf_snapshots_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_performance_snapshots' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setPerfSnapshots(prev => prev.map(s => s.id === payload.new.id ? payload.new : s));
        } else if (payload.eventType === 'INSERT') {
          setPerfSnapshots(prev => [payload.new, ...prev].slice(0, 200));
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Fetch darkpool_trades + realtime ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('darkpool_trades').select('*')
        .order('executed_at', { ascending: false }).limit(30);
      if (data) setDarkpoolTrades(data);
    };
    load();
    const channel = supabase.channel('darkpool_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'darkpool_trades' }, (payload) => {
        setDarkpoolTrades(prev => [payload.new, ...prev].slice(0, 50));
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Fetch options_flow + realtime ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('options_flow').select('*')
        .order('executed_at', { ascending: false }).limit(30);
      if (data) setOptionsFlow(data);
    };
    load();
    const channel = supabase.channel('options_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'options_flow' }, (payload) => {
        setOptionsFlow(prev => [payload.new, ...prev].slice(0, 50));
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Persist dark mode ──
  useEffect(() => {
    try { localStorage.setItem('uptik_darkMode', String(darkMode)); } catch {}
  }, [darkMode]);

  // ── Fetch market_data (VIX, SPY) ──
  useEffect(() => {
    supabase.from('market_data').select('*').then(({ data }) => {
      if (!data) return;
      data.forEach(row => {
        if (row.key === 'fear_greed') setFearScore(row.value?.score ?? null);
        else if (row.key === 'vix_score' && !data.some(r => r.key === 'fear_greed')) setFearScore(row.value?.score ?? null); // fallback to VIX
        if (row.key === 'spy_price') setSpyData(row.value);
      });
    });
  }, []);

  // ── Build dynamic filter keys from alert_types ──
  const filterConfig = useMemo(() => {
    const config = [{ key: 'All', label: 'All', match: null }];
    if (alertTypes.length > 0) {
      alertTypes.forEach(at => {
        config.push({ key: at.type_key, label: at.label, match: at.label });
      });
    } else {
      // Fallback to defaults if DB hasn't loaded yet
      Object.entries(DEFAULT_TAG_MAP).forEach(([key, label]) => {
        config.push({ key, label, match: label });
      });
    }
    return config;
  }, [alertTypes]);

  // ── Build display alerts: live mapped data ──
  const displayAlerts = useMemo(() => {
    if (liveAlerts.length > 0) {
      const mapped = liveAlerts.map(a => mapDbAlert(a, spyData, tagMap));
      if (mapped.length > 0) {
        const best = mapped.reduce((b, a) => a.confidence > b.confidence ? a : b);
        best.isAlertOfDay = true;
      }
      return mapped;
    }
    return [];
  }, [liveAlerts, spyData, tagMap]);

  // ── Build per-alert snapshot map: alertId → { '1d': +2.5, '3d': -1.2, ... } ──
  const snapshotMap = useMemo(() => {
    const map = {};
    for (const s of perfSnapshots) {
      if (!map[s.alert_id]) map[s.alert_id] = {};
      map[s.alert_id][s.interval_key] = {
        returnPct: s.return_pct,
        outcome: s.outcome,
        tracked: !!s.tracked_at,
        price: s.snapshot_price,
      };
    }
    return map;
  }, [perfSnapshots]);

  // Apply all filters: scanner type + sector + conviction
  let filtered = filter === "All" ? displayAlerts : displayAlerts.filter(a => {
    const fc = filterConfig.find(f => f.key === filter);
    return fc?.match ? a.scannerTag === fc.match : true;
  });
  if (sectorFilter) {
    filtered = filtered.filter(a => a.sectorKey === sectorFilter);
  }
  if (convictionFilter) {
    filtered = filtered.filter(a => a.conviction === convictionFilter);
  }
  if (quickFilter === 'bullish') {
    filtered = filtered.filter(a => {
      const ot = (a.option_type || a.trade_type || '').toLowerCase();
      if (ot.includes('call')) return true;
      if (ot.includes('put')) return false;
      return (a.change ?? 0) >= 0;
    });
  } else if (quickFilter === 'bearish') {
    filtered = filtered.filter(a => {
      const ot = (a.option_type || a.trade_type || '').toLowerCase();
      if (ot.includes('put')) return true;
      if (ot.includes('call')) return false;
      return (a.change ?? 0) < 0;
    });
  } else if (quickFilter === 'darkpool') {
    filtered = filtered.filter(a => a.isFlowSignal || (a.scannerTag || '').toLowerCase().includes('dark'));
  } else if (quickFilter === 'high') {
    filtered = filtered.filter(a => (a.confidence ?? 0) >= 80);
  }
  const sorted = [...filtered].sort((a, b) => {
    if (a.isAlertOfDay && !b.isAlertOfDay) return -1;
    if (!a.isAlertOfDay && b.isAlertOfDay) return 1;
    return b.confidence - a.confidence;
  });

  // Auto-select AOTD or first alert on load
  // Look up selected alert in the full (unfiltered) list so a sector filter can't hide it
  const selectedAlert = selectedChipId ? (displayAlerts.find(a => a.id === selectedChipId) || sorted.find(a => a.id === selectedChipId)) : null;

  // ── Compute performance stats from live data ──
  const perfStats = useMemo(() => {
    if (perfHistory.length === 0) return { hitRate: 0, avgReturn: 0, streak: '—' };
    const outcomes = perfHistory.map(p => {
      const eff = p.admin_outcome || p.outcome;
      return { ...p, effectiveOutcome: eff, effectiveReturn: p.return_pct ?? 0 };
    });
    const hits = outcomes.filter(o => o.effectiveOutcome === 'hit').length;
    const hitRate = Math.round((hits / outcomes.length) * 100);
    const avgReturn = outcomes.length > 0 ? (outcomes.reduce((s, o) => s + o.effectiveReturn, 0) / outcomes.length) : 0;

    // Calculate streak
    let streak = 0;
    let streakType = outcomes[0]?.effectiveOutcome === 'hit' ? 'W' : 'L';
    for (const o of outcomes) {
      if ((streakType === 'W' && o.effectiveOutcome === 'hit') || (streakType === 'L' && o.effectiveOutcome !== 'hit')) {
        streak++;
      } else break;
    }

    return { hitRate, avgReturn: avgReturn.toFixed(1), streak: `${streak}${streakType}` };
  }, [perfHistory]);

  // ── Build history display from live performance data + snapshots ──
  const historyDisplay = useMemo(() => {
    return perfHistory.map(p => {
      const effOutcome = p.admin_outcome || p.outcome;
      const effReturn = p.return_pct ?? 0;
      const alertDate = new Date(p.alert_time);
      const dateStr = alertDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      // Get multi-interval snapshots for this alert
      const snapshots = snapshotMap[p.alert_id] || {};
      return {
        ticker: p.ticker,
        date: dateStr,
        desc: p.signal_desc || p.signal_type || 'Alert',
        from: p.alert_price,
        to: p.price_24h,
        result: effReturn,
        type: effOutcome,
        adminOverride: !!p.admin_outcome,
        adminNotes: p.admin_notes,
        snapshots,
        alertId: p.alert_id,
      };
    });
  }, [perfHistory, snapshotMap]);

  // ── Flow data: live from DB ──
  const flowData = useMemo(() => ({ darkpool: darkpoolTrades, options: optionsFlow }), [darkpoolTrades, optionsFlow]);

  // ── Score & rank flow tickers to find top 4 (exclude ETFs/indexes) ──
  const ETF_EXCLUDE = new Set([
    'SPY','QQQ','IWM','DIA','VTI','VOO','SPX','SPXW','NDX',
    'XLF','XLE','XLK','XLV','XLI','XLU','XLP','XLY','XLB','XLRE',
    'GLD','SLV','USO','TLT','HYG','LQD','EEM','EFA','VXX',
    'SOXL','SOXS','TQQQ','SQQQ','UVXY','SVXY','ARKK',
    'SMH','KWEB','FXI','BITO','IBIT','GDX','GDXJ',
    'VIX','RUT','OEX','XSP',
  ]);
  const MEGA_CAP_PENALTY = new Set([
    'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA',
    'BRK.A','BRK.B','BRKB','JPM','V','MA','JNJ','WMT','PG',
    'XOM','UNH','HD','BAC','KO','PEP','COST','MRK','ABBV',
    'CVX','CRM','AVGO','LLY','NFLX','AMD','ADBE','ORCL',
    'CSCO','ACN','INTC','CMCSA','T','VZ','DIS','NKE',
    'MCD','IBM','GE','CAT','BA','GS','MS','C',
    'PYPL','UBER','SQ','SHOP','SNOW','PLTR','COIN',
  ]);
  const flowRanked = useMemo(() => {
    const tickerScores = {};
    // Score options flow
    for (const o of optionsFlow) {
      if (ETF_EXCLUDE.has(o.ticker)) continue;
      if (!tickerScores[o.ticker]) tickerScores[o.ticker] = { ticker: o.ticker, score: 0, premium: 0, dpValue: 0, sweeps: 0, count: 0, optionsCount: 0 };
      const ts = tickerScores[o.ticker];
      ts.count++;
      ts.optionsCount++;
      if (o.premium) ts.premium += o.premium;
      const isSweep = (o.trade_type || '').includes('sweep');
      const isCall = o.option_type === 'call';
      const isBullish = o.direction === 'bullish';
      if (isBullish && isCall && isSweep) { ts.sweeps++; ts.score += 25; }
      else if (isBullish && isCall) ts.score += 15;
      else if (isBullish) ts.score += 8;
      if (o.is_unusual) ts.score += 10;
      if (o.premium >= 1000000) ts.score += 20;
      else if (o.premium >= 500000) ts.score += 12;
      else if (o.premium >= 100000) ts.score += 5;
    }
    // Score dark pool
    for (const d of darkpoolTrades) {
      if (ETF_EXCLUDE.has(d.ticker)) continue;
      if (!tickerScores[d.ticker]) tickerScores[d.ticker] = { ticker: d.ticker, score: 0, premium: 0, dpValue: 0, sweeps: 0, count: 0, optionsCount: 0 };
      const ts = tickerScores[d.ticker];
      ts.count++;
      if (d.dollar_value) { ts.dpValue += d.dollar_value; ts.score += d.dollar_value >= 10000000 ? 20 : d.dollar_value >= 1000000 ? 10 : 5; }
      if (d.direction === 'buying') ts.score += 8;
      if (d.multiplier >= 5) ts.score += 15;
      else if (d.multiplier >= 2) ts.score += 8;
    }
    // Apply mega-cap penalty
    for (const ts of Object.values(tickerScores)) {
      if (MEGA_CAP_PENALTY.has(ts.ticker)) ts.score = Math.round(ts.score * 0.3);
    }
    return Object.values(tickerScores)
      .filter(t => !ETF_EXCLUDE.has(t.ticker) && t.count >= 1 && t.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [optionsFlow, darkpoolTrades]);

  const topFlowTickers = useMemo(() => new Set(flowRanked.slice(0, 4).map(t => t.ticker)), [flowRanked]);

  // Flow summary
  const bmBuying = darkpoolTrades.filter(d => d.direction === 'buying').length;
  const bmSelling = darkpoolTrades.filter(d => d.direction === 'selling').length;
  const topTicker = flowRanked[0]?.ticker || "";

  // Flow filtering & sorting — default to top 4 tickers unless user picks a specific one
  const activeFlowFilter = flowTickerFilter || null;
  let flowBM = activeFlowFilter
    ? darkpoolTrades.filter(d => d.ticker === activeFlowFilter)
    : darkpoolTrades.filter(d => topFlowTickers.has(d.ticker));
  let flowSB = activeFlowFilter
    ? optionsFlow.filter(s => s.ticker === activeFlowFilter)
    : optionsFlow.filter(s => topFlowTickers.has(s.ticker));
  if (flowSort === "size") {
    flowBM = [...flowBM].sort((a, b) => (b.dollar_value || 0) - (a.dollar_value || 0));
    flowSB = [...flowSB].sort((a, b) => (b.premium || 0) - (a.premium || 0));
  } else {
    flowBM = [...flowBM].sort((a, b) => new Date(b.executed_at || b.fetched_at) - new Date(a.executed_at || a.fetched_at));
    flowSB = [...flowSB].sort((a, b) => new Date(b.executed_at || b.fetched_at) - new Date(a.executed_at || a.fetched_at));
  }
  const flowList = flowTab === "bigmoney" ? flowBM : flowSB;
  const flowVisible = flowShowAll ? flowList : flowList.slice(0, 3);

  const openFlowForTicker = (ticker) => {
    setShowFlow(true);
    setFlowTickerFilter(ticker);
    setTimeout(() => flowRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div className="alerts-container" style={{ background: t.bg, transition: 'background .2s' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .alerts-container { width: 100%; max-width: 480px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; }
        .filter-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .filter-row::-webkit-scrollbar { display: none; }
        @media (max-width: 480px) {
          .alerts-container { padding: 12px 8px; gap: 12px; max-width: 100% !important; width: 100% !important; }
          .filter-row button { padding: 6px 12px !important; font-size: 11px !important; }
        }
      `}</style>

      {/* HEADER — mood text removed (gauge already shows fear/greed) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.text3, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'Outfit', sans-serif" }}>Action Alerts</h2>
          <SentimentPill score={fearScore} darkMode={darkMode} />
        </div>
        <DarkModeToggle darkMode={darkMode} onToggle={() => setDarkMode(d => !d)} t={t} />
      </div>

      {/* QUICK FILTER CHIPS */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {[
          { k: 'all', label: 'All' },
          { k: 'bullish', label: '📈 Calls' },
          { k: 'bearish', label: '📉 Puts' },
          { k: 'darkpool', label: '🏦 Darkpool' },
          { k: 'high', label: '🔥 >80%' },
        ].map(c => {
          const active = quickFilter === c.k;
          return (
            <button key={c.k} onClick={() => setQuickFilter(c.k)} style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${active ? t.text1 : t.border}`,
              background: active ? t.text1 : t.card,
              color: active ? t.card : t.text2,
              fontSize: 11, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* STATES */}
      {view === "loading" && <><SkeletonCard t={t} /><SkeletonCard t={t} /></>}
      {view === "active" && (
        <>
          {/* CHIP FIELD — always show (mystery chips appear even with 0 scanner alerts) */}
          <ChipField
            alerts={sorted}
            fearScore={fearScore}
            history={historyDisplay}
            selectedId={selectedChipId}
            onChipTap={(a) => { setMysterySelected(null); setSelectedChipId(selectedChipId === a.id ? null : a.id); }}
            onMysteryTap={(type) => { setSelectedChipId(null); setMysterySelected(mysterySelected === type ? null : type); }}
            mysterySelected={mysterySelected}
            t={t}
            darkMode={darkMode}
          />

          {/* MYSTERY OPTIONS DETAIL PANEL */}
          {mysterySelected === 'options' && (() => {
            // Build top options ticker from flow data
            const optByTicker = {};
            optionsFlow.forEach(o => {
              if (!optByTicker[o.ticker]) optByTicker[o.ticker] = { ticker: o.ticker, premium: 0, count: 0, sweeps: 0, topStrike: null, topPremium: 0, allCalls: true };
              const ts = optByTicker[o.ticker];
              ts.count++;
              ts.premium += (o.premium || 0);
              if (o.premium > ts.topPremium) { ts.topPremium = o.premium; ts.topStrike = o.strike; }
              if ((o.trade_type || '').includes('sweep')) ts.sweeps++;
              if (o.option_type !== 'call') ts.allCalls = false;
            });
            const topOpt = Object.values(optByTicker).sort((a, b) => b.premium - a.premium)[0];
            if (!topOpt) return null;
            const fmtPremium = (v) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`;
            return (
              <div style={{ background: t.card, borderRadius: 14, border: `0.5px solid ${t.border}`, boxShadow: t.shadow, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{topOpt.ticker}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: t.goldBg, color: t.amber, fontSize: 11, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>OPTIONS FLOW</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{fmtPremium(topOpt.premium)}</span>
                    <span onClick={() => setMysterySelected(null)} style={{ fontSize: 16, color: t.text3, cursor: 'pointer', padding: '0 2px' }}>▴</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: "'Outfit', sans-serif" }}>Why it's alerting</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>💰</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}><strong style={{ fontWeight: 600, color: t.text1 }}>{fmtPremium(topOpt.premium)} premium</strong> — {topOpt.count} options trades</span>
                  </div>
                  {topOpt.topStrike && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>📋</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}>Largest single trade: <strong style={{ fontWeight: 600, color: t.text1 }}>{fmtPremium(topOpt.topPremium)}</strong> call @ ${topOpt.topStrike} strike</span>
                  </div>}
                  {topOpt.allCalls && topOpt.count > 1 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>⚡</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}>All {topOpt.count} trades are <span style={{ fontWeight: 600, color: t.green }}>calls</span> — strong bullish positioning</span>
                  </div>}
                  {topOpt.sweeps > 0 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>🔥</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}><strong style={{ fontWeight: 600, color: t.text1 }}>{topOpt.sweeps} sweep{topOpt.sweeps > 1 ? 's' : ''}</strong> — aggressive fills across exchanges</span>
                  </div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Premium</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{fmtPremium(topOpt.premium)}</div>
                  </div>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Trades</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{topOpt.count}</div>
                  </div>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Top Strike</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{topOpt.topStrike ? `$${topOpt.topStrike}` : '—'}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MYSTERY DARK POOL DETAIL PANEL */}
          {mysterySelected === 'darkpool' && (() => {
            const dpByTicker = {};
            darkpoolTrades.forEach(d => {
              if (!dpByTicker[d.ticker]) dpByTicker[d.ticker] = { ticker: d.ticker, totalValue: 0, prints: 0, totalShares: 0, price: Number(d.price) || 0 };
              const ts = dpByTicker[d.ticker];
              ts.prints++;
              const shares = Number(d.size || d.shares) || 0;
              const price = Number(d.price) || 0;
              ts.totalValue += (Number(d.notional_value) || shares * price || 0);
              ts.totalShares += shares;
              if (price) ts.price = price;
            });
            const topDp = Object.values(dpByTicker).sort((a, b) => b.totalValue - a.totalValue)[0];
            if (!topDp) return null;
            const fmtValue = (v) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`;
            const avgShares = topDp.prints > 0 ? Math.round(topDp.totalShares / topDp.prints) : 0;
            const fmtShares = (v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : `${v}`;
            return (
              <div style={{ background: t.card, borderRadius: 14, border: `0.5px solid ${t.border}`, boxShadow: t.shadow, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{topDp.ticker}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: `rgba(250,199,117,0.1)`, color: t.amber, fontSize: 11, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>DARK POOL</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{topDp.price ? `$${Number(topDp.price).toFixed(2)}` : '—'}</span>
                    <span onClick={() => setMysterySelected(null)} style={{ fontSize: 16, color: t.text3, cursor: 'pointer', padding: '0 2px' }}>▴</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: "'Outfit', sans-serif" }}>Why it's alerting</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>🏦</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}><strong style={{ fontWeight: 600, color: t.text1 }}>{fmtValue(topDp.totalValue)}</strong> in dark pool block prints</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>📦</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}>{topDp.prints} massive print{topDp.prints > 1 ? 's' : ''} — avg <strong style={{ fontWeight: 600, color: t.text1 }}>{fmtShares(avgShares)} shares</strong> each</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>👀</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}>Institutions moving <span style={{ fontWeight: 600, color: t.amber }}>large blocks</span> off-exchange</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Total Value</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{fmtValue(topDp.totalValue)}</div>
                  </div>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Prints</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{topDp.prints}</div>
                  </div>
                  <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>Avg Size</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{fmtShares(avgShares)}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SCANNER DETAIL PANEL */}
          {selectedAlert && (
            <div style={{ background: t.card, borderRadius: 14, border: `0.5px solid ${t.border}`, boxShadow: t.shadow, overflow: 'hidden', position: 'relative', zIndex: 2 }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{selectedAlert.ticker}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: t.surfaceAlt, color: t.text2, fontSize: 11, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{selectedAlert.scannerTag.toUpperCase()}</span>
                    {selectedAlert.sectorKey && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: `${selectedAlert.sectorColor}15`, color: selectedAlert.sectorColor, fontSize: 10, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>{selectedAlert.sector}</span>
                    )}
                    {selectedAlert.conviction !== 'standard' && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: selectedAlert.convictionBg, color: selectedAlert.convictionColor, fontSize: 10, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>{selectedAlert.convictionEmoji} {selectedAlert.convictionLabel}</span>
                    )}
                    {(selectedAlert.created_at || selectedAlert.createdAt) && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: t.surfaceAlt, color: t.text3, fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>🕒 {timeAgo(selectedAlert.created_at || selectedAlert.createdAt)}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>${selectedAlert.price.toFixed(2)}</span>
                    {selectedAlert.isFlowSignal ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, fontFamily: "'DM Sans', sans-serif",
                        background: selectedAlert.confidence >= 80 ? (t.greenBg || '#f0fdf4') : (t.surfaceAlt || '#f1f5f9'),
                        color: selectedAlert.confidence >= 80 ? t.green : t.text2
                      }}>{selectedAlert.confidence}% conf</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: selectedAlert.change >= 0 ? t.green : t.red, fontFamily: "'DM Sans', sans-serif" }}>
                        {selectedAlert.change >= 0 ? "+" : ""}{typeof selectedAlert.changePercent === 'number' ? selectedAlert.changePercent.toFixed(2) : selectedAlert.changePercent}%
                      </span>
                    )}
                    <span onClick={() => setSelectedChipId(null)} style={{ fontSize: 16, color: t.text3, cursor: 'pointer', padding: '0 2px', transition: 'transform 0.2s' }}>▴</span>
                  </div>
                </div>
                {/* Company name removed — duplicate ticker info per mockup */}
                <BigMoneyBadge ticker={selectedAlert.ticker} flowData={flowData} onClick={openFlowForTicker} t={t} />
                {/* Performance trail: 1d→3d→7d→14d→30d */}
                {snapshotMap[selectedAlert.id] && (() => {
                  const snaps = snapshotMap[selectedAlert.id];
                  const intervals = ['1d','3d','7d','14d','30d'];
                  const hasAnyData = intervals.some(k => snaps[k]?.tracked);
                  if (!hasAnyData) return null;
                  return (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {intervals.map(k => {
                        const s = snaps[k];
                        const tracked = s?.tracked;
                        const ret = s?.returnPct;
                        const isHit = tracked && ret != null && ret >= 0;
                        const bg = !tracked ? t.surface : isHit ? (t.greenBg || '#f0fdf4') : (t.redBg || '#fef2f2');
                        const color = !tracked ? t.text3 : isHit ? t.green : t.red;
                        return (
                          <div key={k} style={{ flex: 1, background: bg, borderRadius: 6, padding: '3px 2px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: t.text3, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{k}</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>
                              {tracked && ret != null ? `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%` : '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '1px', marginTop: 8, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>Why it's alerting</div>
                {selectedAlert.whyAlerting.map((w, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 0',
                    borderBottom: i < selectedAlert.whyAlerting.length - 1 ? `0.5px solid ${t.border}50` : 'none',
                  }}>
                    <span style={{ fontSize: 12, flexShrink: 0, width: 16 }}>{w.icon}</span>
                    <span style={{ fontSize: 12, color: t.text2, fontFamily: "'DM Sans', sans-serif" }}>
                      <span style={{ fontWeight: 600 }}>{w.label}</span>
                      <span style={{ color: t.text2 }}> — {w.text}</span>
                    </span>
                  </div>
                ))}
                {/* Stats row — flow-specific or scanner-specific */}
                {selectedAlert.isFlowSignal ? (
                  <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Score</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selectedAlert.flowScore >= 60 ? t.green : t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{selectedAlert.flowScore}</div>
                    </div>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Confidence</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selectedAlert.confidence >= 80 ? t.green : t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{selectedAlert.confidence}%</div>
                    </div>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{(selectedAlert.flowOptCount + selectedAlert.flowDpCount) > 0 ? 'Trades' : 'Price'}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{(selectedAlert.flowOptCount + selectedAlert.flowDpCount) > 0 ? (selectedAlert.flowOptCount + selectedAlert.flowDpCount) : `$${selectedAlert.price.toFixed(2)}`}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Support</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>${selectedAlert.support.toFixed(2)}</div>
                    </div>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Resistance</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>${selectedAlert.resistance.toFixed(2)}</div>
                    </div>
                    <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>vs SPY</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selectedAlert.vsSpy >= 0 ? t.green : t.red, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                        {selectedAlert.vsSpy >= 0 ? "+" : ""}{typeof selectedAlert.vsSpy === 'number' ? selectedAlert.vsSpy.toFixed(1) : selectedAlert.vsSpy}%
                      </div>
                    </div>
                  </div>
                )}
                {/* PRIMARY CTA — jump to this ticker's flow rows */}
                <button
                  onClick={() => openFlowForTicker(selectedAlert.ticker)}
                  style={{
                    marginTop: 10, width: '100%', padding: '10px 14px',
                    border: 'none', borderRadius: 10, cursor: 'pointer',
                    background: t.text1, color: t.card,
                    fontSize: 12, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                    letterSpacing: '0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'transform .1s',
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  🏦 View {selectedAlert.ticker} flow & dark pool →
                </button>
              </div>
            </div>
          )}

          {/* ALERT HISTORY — hidden when empty, shows when there's data */}
          {historyDisplay.length > 0 && <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: "'Outfit', sans-serif" }}>
                Alert history
                {perfStats.hitRate > 0 && <span style={{ marginLeft: 8, color: t.text2, fontWeight: 600, textTransform: 'none' }}>{perfStats.hitRate}% hit rate · avg {perfStats.avgReturn}% · {perfStats.streak}</span>}
              </span>
              <span style={{ fontSize: 11, color: t.text3 }}>{historyDisplay.length} tracked</span>
            </div>
            <div style={{ background: t.card, borderRadius: 12, border: `0.5px solid ${t.border}`, overflow: 'hidden' }}>
              {historyDisplay.length === 0 && (
                <div style={{ padding: '20px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: t.text3, margin: 0 }}>No tracked results yet — performance auto-tracks after 24h</p>
                </div>
              )}
              {historyDisplay.map((h, i) => {
                const isHit = h.type === 'hit' || (h.result != null && h.result > 0);
                const isOpen = expandedHistoryIdx === i;
                return (
                  <div key={i} style={{ borderBottom: i < historyDisplay.length - 1 ? `0.5px solid ${t.border}` : 'none' }}>
                    <div onClick={() => setExpandedHistoryIdx(isOpen ? null : i)} style={{
                      padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 11, color: t.text3, width: 42, flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>{h.date}</span>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: `1.5px solid ${isHit ? t.green : t.red}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>{h.ticker}</span>
                      </div>
                      <span style={{ fontSize: 13, color: t.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif" }}>{h.desc}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {h.adminOverride && <span title="Admin override" style={{ fontSize: 10 }}>👑</span>}
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: isHit ? t.greenBg : t.redBg,
                          color: isHit ? t.green : t.red,
                        }}>{h.result != null ? `${isHit ? "+" : ""}${h.result.toFixed(1)}%` : '—'}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 12px 10px' }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Entry</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>${h.from != null ? Number(h.from).toFixed(2) : '—'}</div>
                          </div>
                          <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>24h Later</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>${h.to != null ? Number(h.to).toFixed(2) : '—'}</div>
                          </div>
                          <div style={{ flex: 1, background: t.surface, borderRadius: 8, padding: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Result</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: isHit ? t.green : t.red, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{h.result != null ? `${isHit ? "+" : ""}${h.result.toFixed(1)}%` : '—'}</div>
                          </div>
                        </div>
                        {/* Multi-interval performance trail */}
                        {h.snapshots && Object.keys(h.snapshots).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                            {['1d','3d','7d','14d','30d'].map(k => {
                              const s = h.snapshots[k];
                              const tracked = s?.tracked;
                              const ret = s?.returnPct;
                              const hit = tracked && ret != null && ret >= 0;
                              const bg = !tracked ? t.surface : hit ? (t.greenBg || '#f0fdf4') : (t.redBg || '#fef2f2');
                              const color = !tracked ? t.text3 : hit ? t.green : t.red;
                              return (
                                <div key={k} style={{ flex: 1, background: bg, borderRadius: 6, padding: '3px 2px', textAlign: 'center' }}>
                                  <div style={{ fontSize: 9, color: t.text3, fontWeight: 600 }}>{k}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{tracked && ret != null ? `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%` : '—'}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {h.adminNotes && (
                          <div style={{ background: t.surface, borderRadius: 8, padding: 6 }}>
                            <div style={{ fontSize: 11, color: t.text3, textTransform: 'uppercase', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>👑 Admin Note</div>
                            <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>{h.adminNotes}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>}

          {/* OPTIONS & DARKPOOL — live from options_flow + darkpool_trades */}
          <div ref={flowRef} style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <button onClick={() => setShowFlow(!showFlow)} style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif" }}>🏦 Options & DarkPool</span>
              </div>
              <span style={{ fontSize: 18, color: t.text3, transition: "transform .2s", transform: showFlow ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
            </button>
            {/* Collapsed summary removed — header badge shows count */}
            {showFlow && (
              <div style={{ padding: "0 12px 12px" }}>
                {flowTickerFilter && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: t.text2 }}>Showing:</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, background: t.btnActive, color: "#fff", fontSize: 12, fontWeight: 600 }}>
                      {flowTickerFilter}
                      <button onClick={() => setFlowTickerFilter(null)} style={{ background: "none", border: "none", color: t.text3, cursor: "pointer", fontSize: 14, padding: 0, marginLeft: 2 }}>✕</button>
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{ k: "bigmoney", l: "Dark Pool" }, { k: "smartbets", l: "Options Flow" }].map(tab => (
                    <button key={tab.k} onClick={() => { setFlowTab(tab.k); setFlowExpandedId(null); setFlowShowAll(false); }} style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: flowTab === tab.k ? "none" : `1px solid ${t.border}`, background: flowTab === tab.k ? t.btnActive : t.card, color: flowTab === tab.k ? "#fff" : t.text2, cursor: "pointer" }}>{tab.l}</button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
                  {[{ k: "time", l: "Newest" }, { k: "size", l: "Largest" }].map(s => (
                    <button key={s.k} onClick={() => setFlowSort(s.k)} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: flowSort === s.k ? "none" : `1px solid ${t.border}`, background: flowSort === s.k ? t.btnActive : t.card, color: flowSort === s.k ? "#fff" : t.text2, cursor: "pointer" }}>{s.l}</button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {flowTab === "bigmoney"
                    ? flowVisible.map(tr => <BigMoneyCard key={tr.id} trade={tr} t={t} isExpanded={flowExpandedId === tr.id} onToggle={() => setFlowExpandedId(flowExpandedId === tr.id ? null : tr.id)} />)
                    : flowVisible.map(b => <SmartBetCard key={b.id} bet={b} t={t} isExpanded={flowExpandedId === b.id} onToggle={() => setFlowExpandedId(flowExpandedId === b.id ? null : b.id)} />)
                  }
                </div>
                {flowList.length > 3 && !flowShowAll && (
                  <button onClick={() => setFlowShowAll(true)} style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: `1px solid ${t.border}`, background: t.card, color: t.text2, cursor: "pointer" }}>Show all {flowList.length} {flowTab === "bigmoney" ? "trades" : "bets"} ▾</button>
                )}
                {flowList.length === 0 && <p style={{ textAlign: "center", fontSize: 13, color: t.text3, padding: "16px 0" }}>No {flowTickerFilter || ""} flow data yet</p>}
              </div>
            )}
          </div>

          {/* HOT SECTORS — collapsible, shows even with 0 scanner alerts */}
          <HotSectors alerts={displayAlerts} onSectorTap={setHotSectorPick} activeSector={hotSectorPick} t={t} darkMode={darkMode} />
        </>
      )}

      {modalAlert && <Modal alert={modalAlert} onClose={() => setModalAlert(null)} t={t} />}
    </div>
  );
}