import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from '../../lib/supabase';
import { run52wHighScan, DEFAULT_THRESHOLD, runVolSurgeScan, DEFAULT_VOL_MULTIPLIER, runGapUpScan, DEFAULT_GAP_THRESHOLD, runMACrossScan, DEFAULT_SHORT_MA, DEFAULT_LONG_MA } from '../../lib/breakoutScanner';
import { useGroup } from '../../context/GroupContext';

// Scanner tag mapping: DB alert_type → UI label
const SCANNER_TAG_MAP = { '52w_high': 'Yearly High', 'vol_surge': 'Volume Spike', 'gap_up': 'Gap Up', 'ma_cross': 'Trend Change' };

// Map a raw Supabase breakout_alerts row to the redesign card format
function mapDbAlert(a, spyData) {
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
  else if (!signal && type === 'gap_up' && a.gap_pct != null) signal = `Gapped up +${a.gap_pct.toFixed(2)}%`;
  else if (!signal && type === 'ma_cross' && a.short_ma != null) signal = `${a.short_ma_period ?? 20}MA crossed above ${a.long_ma_period ?? 50}MA`;
  else if (!signal && type === 'vol_surge' && a.volume_ratio != null) signal = `Volume surging ${a.volume_ratio}x above average`;

  const change = a.change ?? a.change_pct ?? a.gap_pct ?? null;
  const resistance = a.resistance ?? (type === '52w_high' ? a.high_52w : null);
  const support = a.support ?? a.prev_close ?? null;

  let confidence = a.confidence ?? 70;
  if (a.confidence == null) {
    if (a.volume_ratio > 2) confidence += 10;
    if (a.pct_from_high != null && a.pct_from_high < 2) confidence += 5;
    if (change != null && change > 3) confidence += 5;
    confidence = Math.min(confidence, 95);
  }

  const vsSpy = a.rsVsSpy ?? (change != null && spyData?.change ? Number(change) - Number(spyData.change) : null);

  // Generate whyAlerting bullets
  const whyAlerting = [];
  if (signal) whyAlerting.push({ icon: "📊", label: SCANNER_TAG_MAP[type] || type, text: signal });
  if (volume) whyAlerting.push({ icon: "🔥", label: "Volume", text: `${volume} shares traded${avgVolume ? ` (avg: ${avgVolume})` : ''}` });
  if (confidence >= 80) whyAlerting.push({ icon: "✅", label: "Strong Setup", text: "Technical indicators look positive" });
  else whyAlerting.push({ icon: "🔍", label: "Watch Closely", text: "Moderate signal — monitor for confirmation" });

  return {
    ...a, id: a.id, ticker, company: a.name ?? ticker, price: a.price != null ? Number(a.price) : 0,
    change: change != null ? Number(change) : 0, changePercent: change != null ? Number(change) : 0,
    time, scannerTag: SCANNER_TAG_MAP[type] || 'Alert', volume: volume ?? '—', avgVolume: avgVolume ?? '—',
    vsSpy: vsSpy ?? 0, confidence, support: support != null ? Number(support) : 0, resistance: resistance != null ? Number(resistance) : 0,
    sector: a.sector ?? '—', marketCap: '—', description: a.context ?? '',
    whyAlerting: whyAlerting.length > 0 ? whyAlerting : [{ icon: "📊", label: "Alert", text: "Breakout signal detected" }],
    isAlertOfDay: false, _isLive: true,
  };
}

// ===== MOCK ALERTS (fallback — Thursday Apr 3 closing prices) =====
const mockAlerts = [
  { id: 1, ticker: "TSLA", company: "Tesla Inc", price: 360.59, change: -20.67, changePercent: -5.42, time: "4:00 PM", scannerTag: "Volume Spike", volume: "82.5M", avgVolume: "58.3M", vsSpy: -5.51, confidence: 85, support: 340.00, resistance: 381.26, sector: "Electric Vehicles", marketCap: "$1.35T", description: "Manufactures electric vehicles and energy storage systems.", whyAlerting: [{ icon: "🔥", label: "Volume Surge", text: "82.5M shares traded — well above average" }, { icon: "⚠️", label: "Sharp Move", text: "Dropped $20.67 (-5.42%) on heavy volume" }, { icon: "🔍", label: "Watch Closely", text: "Big volume on a down day — potential reversal setup" }], isAlertOfDay: true },
  { id: 2, ticker: "NVDA", company: "NVIDIA Corp", price: 177.39, change: 1.64, changePercent: 0.93, time: "4:00 PM", scannerTag: "Yearly High", volume: "141.4M", avgVolume: "85.2M", vsSpy: 0.84, confidence: 88, support: 165.00, resistance: 195.95, sector: "Semiconductors", marketCap: "$4.3T", description: "Designs GPUs and AI computing platforms.", whyAlerting: [{ icon: "🏔️", label: "Near Peak", text: "Within 9.5% of its 52-week high of $195.95" }, { icon: "📊", label: "Strong Volume", text: "141.4M shares — 1.7x normal volume" }, { icon: "✅", label: "Momentum", text: "Holding above key moving averages" }], isAlertOfDay: false },
  { id: 3, ticker: "SMCI", company: "Super Micro Computer", price: 23.22, change: 0.71, changePercent: 3.15, time: "4:00 PM", scannerTag: "Gap Up", volume: "29.8M", avgVolume: "18.5M", vsSpy: 3.06, confidence: 78, support: 20.00, resistance: 28.00, sector: "IT Hardware", marketCap: "$13.7B", description: "Provides high-performance server and storage solutions for AI.", whyAlerting: [{ icon: "📈", label: "Price Jumped", text: "Up 3.15% — outperforming the market" }, { icon: "📊", label: "Above Average Volume", text: "29.8M shares vs 18.5M average" }, { icon: "💡", label: "AI Demand", text: "Continued interest in AI server infrastructure" }], isAlertOfDay: false },
  { id: 4, ticker: "AAPL", company: "Apple Inc", price: 255.92, change: 0.28, changePercent: 0.11, time: "4:00 PM", scannerTag: "Yearly High", volume: "26.7M", avgVolume: "42.1M", vsSpy: 0.02, confidence: 82, support: 245.00, resistance: 260.10, sector: "Consumer Electronics", marketCap: "$3.9T", description: "Designs and sells smartphones, computers, and digital services.", whyAlerting: [{ icon: "🏔️", label: "Near Peak", text: "Within 1.6% of 52-week high of $260.10" }, { icon: "✅", label: "Steady Climb", text: "Holding near all-time highs" }, { icon: "📊", label: "Quiet Strength", text: "Low volume suggests consolidation, not weakness" }], isAlertOfDay: false },
  { id: 5, ticker: "AMZN", company: "Amazon.com Inc", price: 209.77, change: -0.80, changePercent: -0.38, time: "4:00 PM", scannerTag: "Volume Spike", volume: "30.1M", avgVolume: "22.7M", vsSpy: -0.47, confidence: 76, support: 195.00, resistance: 242.52, sector: "E-Commerce / Cloud", marketCap: "$2.2T", description: "Operates online retail marketplace and Amazon Web Services cloud platform.", whyAlerting: [{ icon: "📊", label: "Volume Up", text: "30.1M shares — 1.3x above average" }, { icon: "🔍", label: "Pullback", text: "Slight dip — watching for support at $195" }, { icon: "💡", label: "Cloud Growth", text: "AWS continues strong revenue momentum" }], isAlertOfDay: false },
  { id: 6, ticker: "META", company: "Meta Platforms", price: 574.46, change: -4.73, changePercent: -0.82, time: "4:00 PM", scannerTag: "Trend Change", volume: "13.2M", avgVolume: "16.8M", vsSpy: -0.91, confidence: 74, support: 550.00, resistance: 600.00, sector: "Social Media / AI", marketCap: "$1.46T", description: "Operates Facebook, Instagram, WhatsApp and invests heavily in AI and metaverse.", whyAlerting: [{ icon: "🔄", label: "Trend Shift", text: "Pulling back from recent highs" }, { icon: "📊", label: "Lower Volume", text: "13.2M shares — below average" }, { icon: "💡", label: "AI Focus", text: "Heavy investment in AI infrastructure continues" }], isAlertOfDay: false },
  { id: 7, ticker: "AMD", company: "Advanced Micro Devices", price: 217.50, change: 7.29, changePercent: 3.47, time: "4:00 PM", scannerTag: "Gap Up", volume: "38.1M", avgVolume: "28.4M", vsSpy: 3.38, confidence: 86, support: 200.00, resistance: 227.30, sector: "Semiconductors", marketCap: "$352B", description: "Designs CPUs and GPUs for gaming, data centers, and AI applications.", whyAlerting: [{ icon: "📈", label: "Strong Rally", text: "Up $7.29 (+3.47%) — leading the chip sector" }, { icon: "🔥", label: "Volume Surge", text: "38.1M shares — 1.3x above average" }, { icon: "✅", label: "Approaching High", text: "Within 4.3% of 52-week high of $227.30" }], isAlertOfDay: false },
  { id: 8, ticker: "PLTR", company: "Palantir Technologies", price: 148.46, change: 1.96, changePercent: 1.34, time: "4:00 PM", scannerTag: "Volume Spike", volume: "29.8M", avgVolume: "22.1M", vsSpy: 1.25, confidence: 83, support: 140.00, resistance: 167.57, sector: "AI / Data Analytics", marketCap: "$347B", description: "Provides AI-driven data analytics platforms to governments and enterprises.", whyAlerting: [{ icon: "📊", label: "Volume Up", text: "29.8M shares — 1.35x above average" }, { icon: "📈", label: "Steady Gains", text: "Up 1.34% on continued AI sector strength" }, { icon: "✅", label: "Positive Trend", text: "Holding above key support levels" }], isAlertOfDay: false },
];

const filterMap = { "All": null, "Yearly High": "Yearly High", "Volume Spike": "Volume Spike", "Trend Change": "Trend Change", "Gap Up": "Gap Up", "Catalyst News": "Catalyst News" };
const filterKeys = Object.keys(filterMap);

const mockTrack = {
  hitRate: 67, avgReturn: 1.0, streak: "2W",
  history: [
    { ticker: "TSLA", date: "Apr 2", desc: "Pre-market gap on 6x volume", from: 189.3, to: 195.36, result: 3.2, type: "hit" },
    { ticker: "NVDA", date: "Apr 1", desc: "Within 1.8% of yearly high", from: 875.4, to: 891.15, result: 1.8, type: "hit" },
    { ticker: "PLTR", date: "Mar 31", desc: "Gap above consolidation zone", from: 24.88, to: 24.78, result: -0.4, type: "miss" },
    { ticker: "SMCI", date: "Mar 28", desc: "Volume 4.2x average", from: 92.17, to: 94.66, result: 2.7, type: "hit" },
    { ticker: "AMD", date: "Mar 26", desc: "Trend reversal signal", from: 164.2, to: 162.39, result: -1.1, type: "miss" },
  ],
};

// ===== INSTITUTIONAL FLOW MOCK DATA =====
const now = new Date();
const mins = (m) => new Date(now.getTime() - m * 60000);

const mockBigMoney = [
  { id: "bm1", ticker: "TSLA", company: "Tesla Inc", price: 189.30, shares: "2.4M", dollarValue: "$454M", rawDollar: 454e6, direction: "buying", time: mins(2), multiplier: 13.3, note: "This is 13x the normal trade size — a major institution is loading up." },
  { id: "bm2", ticker: "NVDA", company: "NVIDIA Corp", price: 891.15, shares: "850K", dollarValue: "$758M", rawDollar: 758e6, direction: "buying", time: mins(9), multiplier: 8.9, note: "Largest dark pool trade today. 9x normal size — likely a hedge fund." },
  { id: "bm3", ticker: "AAPL", company: "Apple Inc", price: 218.45, shares: "1.8M", dollarValue: "$393M", rawDollar: 393e6, direction: "neutral", time: mins(6), multiplier: 8.2, note: "Big trade but direction unclear — could be a portfolio rebalance." },
  { id: "bm4", ticker: "META", company: "Meta Platforms", price: 542.18, shares: "620K", dollarValue: "$336M", rawDollar: 336e6, direction: "selling", time: mins(13), multiplier: 5.6, note: "An institution appears to be reducing their META position." },
  { id: "bm5", ticker: "AMZN", company: "Amazon.com", price: 198.72, shares: "1.2M", dollarValue: "$238M", rawDollar: 238e6, direction: "buying", time: mins(16), multiplier: 4.0, note: "Moderate-sized institutional buy. 4x normal trade size." },
];

const mockSmartBets = [
  { id: "sb1", ticker: "TSLA", company: "Tesla Inc", direction: "up", bet: "Above $200 by Apr 11", amount: "$20.5M", rawSize: 20.5e6, odds: "High risk", unusual: true, time: mins(1), detail: "Someone just bet $20.5M that Tesla will rise above $200 in the next week.", premium: "$4.85", volume: "42.3K", openInterest: "18.2K", uncertainty: "High" },
  { id: "sb2", ticker: "NVDA", company: "NVIDIA Corp", direction: "up", bet: "Above $920 by Apr 18", amount: "$51.2M", rawSize: 51.2e6, odds: "Moderate risk", unusual: true, time: mins(4), detail: "The largest options bet today. $51.2M that NVIDIA goes above $920.", premium: "$18.20", volume: "28.1K", openInterest: "5.4K", uncertainty: "Moderate" },
  { id: "sb3", ticker: "SPY", company: "S&P 500 ETF", direction: "down", bet: "Below $510 by Apr 11", amount: "$29.1M", rawSize: 29.1e6, odds: "Lower risk", unusual: false, time: mins(7), detail: "A large bet the overall market will dip below $510.", premium: "$3.40", volume: "85.6K", openInterest: "42.1K", uncertainty: "Low" },
  { id: "sb4", ticker: "AAPL", company: "Apple Inc", direction: "up", bet: "Above $225 by Apr 25", amount: "$10.6M", rawSize: 10.6e6, odds: "Moderate risk", unusual: true, time: mins(10), detail: "Unusual activity — $10.6M bet that Apple crosses $225.", premium: "$2.95", volume: "35.8K", openInterest: "12.7K", uncertainty: "Moderate" },
  { id: "sb5", ticker: "META", company: "Meta Platforms", direction: "up", bet: "Above $560 by May 16", amount: "$34.2M", rawSize: 34.2e6, odds: "Moderate risk", unusual: true, time: mins(18), detail: "A longer-term bet of $34.2M that Meta rises above $560.", premium: "$22.50", volume: "15.2K", openInterest: "3.1K", uncertainty: "Moderate" },
];

// Cross-reference lookups
const bmByTicker = new Map(mockBigMoney.map(d => [d.ticker, d]));
const sbByTicker = new Map();
mockSmartBets.forEach(s => { if (!sbByTicker.has(s.ticker)) sbByTicker.set(s.ticker, s); });

function hasBigMoneySignal(ticker) {
  return (bmByTicker.has(ticker) && bmByTicker.get(ticker).direction === "buying") ||
         (sbByTicker.has(ticker) && sbByTicker.get(ticker).direction === "up");
}

function relTime(ts) {
  const d = Math.floor((now - ts) / 60000);
  if (d < 1) return "Just now";
  if (d === 1) return "1 min ago";
  if (d < 60) return `${d} min ago`;
  return `${Math.floor(d / 60)}h ago`;
}
function freshDotColor(ts) {
  const d = Math.floor((now - ts) / 60000);
  if (d <= 5) return "#22c55e"; if (d <= 15) return "#f59e0b"; return "#cbd5e1";
}
function cardOpacity(ts) { return Math.floor((now - ts) / 60000) > 15 ? 0.75 : 1; }

// Flow summary line
const bmBuying = mockBigMoney.filter(d => d.direction === "buying").length;
const bmSelling = mockBigMoney.filter(d => d.direction === "selling").length;
const mostActiveTicker = [...mockBigMoney, ...mockSmartBets].reduce((acc, t) => { acc[t.ticker] = (acc[t.ticker] || 0) + 1; return acc; }, {});
const topTicker = Object.entries(mostActiveTicker).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

// ===== THEME =====
function useTheme(darkMode) {
  return darkMode ? {
    bg: '#0a1628', card: '#132d52', cardHover: '#1a3d6e', border: '#1e3d62',
    text1: '#e8edf2', text2: '#8ca4c0', text3: '#5a7a9a',
    surface: '#0e1e36', surfaceAlt: '#0a1628',
    green: '#5DCAA5', red: '#F09595', gold: '#D4A017', amber: '#FAC775',
    purple: '#a78bfa', blue: '#7B8CDE', pink: '#EC4899',
    greenBg: 'rgba(93,202,165,0.08)', redBg: 'rgba(240,149,149,0.08)',
    goldBg: 'rgba(212,160,23,0.08)', shadow: '0 1px 3px rgba(0,0,0,.2)',
  } : {
    bg: '#ffffff', card: '#ffffff', cardHover: '#f8fafc', border: '#e2e8f0',
    text1: '#0f172a', text2: '#64748b', text3: '#94a3b8',
    surface: '#f8fafc', surfaceAlt: '#f1f5f9',
    green: '#16a34a', red: '#dc2626', gold: '#d97706', amber: '#f59e0b',
    purple: '#7c3aed', blue: '#2563eb', pink: '#ec4899',
    greenBg: 'rgba(22,163,74,0.08)', redBg: 'rgba(220,38,38,0.08)',
    goldBg: 'rgba(217,119,6,0.08)', shadow: '0 1px 3px rgba(0,0,0,.06)',
  };
}

// ===== SHARED COMPONENTS =====
function Tooltip({ text, t }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button onClick={e => { e.stopPropagation(); setShow(!show); }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, borderRadius: "50%", background: t.border, color: t.text2, border: "none", cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>i</button>
      {show && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8, width: 220, padding: "8px 12px", fontSize: 12, color: "#fff", background: "#1e293b", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.2)", zIndex: 99, lineHeight: 1.5 }}>{text}</div>}
    </span>
  );
}

function Sparkline({ t }) {
  const pts = [12,18,14,22,20,28,25,32,30,38,36,42];
  const w=120,h=40,p=2,mn=Math.min(...pts),mx=Math.max(...pts);
  const d = pts.map((v,i)=>{ const x=p+(i/(pts.length-1))*(w-p*2), y=p+((mx-v)/(mx-mn))*(h-p*2); return `${i===0?"M":"L"}${x},${y}`; }).join(" ");
  return (<svg viewBox={`0 0 ${w} ${h}`} style={{width:112,height:40}}><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.green} stopOpacity=".2"/><stop offset="100%" stopColor={t.green} stopOpacity="0"/></linearGradient></defs><path d={`${d} L${w-p},${h-p} L${p},${h-p} Z`} fill="url(#sg)"/><path d={d} fill="none" stroke={t.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

function BigMoneyBadge({ ticker, onClick, t }) {
  if (!hasBigMoneySignal(ticker)) return null;
  return (
    <div onClick={e => { e.stopPropagation(); onClick(ticker); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, background: t.greenBg, border: `1px solid ${t.green}40`, marginTop: 6, cursor: "pointer" }}>
      <span style={{ fontSize: 11 }}>🎯</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: t.green }}>Big money is also buying</span>
    </div>
  );
}

// ===== CONFIDENCE RING =====
function ConfidenceRing({ value, size = 16, t }) {
  const r = (size - 2) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / 100, 0), 1);
  const offset = circumference * (1 - pct);
  const color = value >= 80 ? t.green : value >= 65 ? t.gold : t.red;
  const trackColor = `${color}25`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth="2" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="2"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90, ${size/2}, ${size/2})`} />
    </svg>
  );
}

// ===== SKELETON / EMPTY =====
function SkeletonCard({ t }) {
  const b = { background: t.border, borderRadius: 8 }, sh = { animation: "pulse 1.5s ease-in-out infinite" };
  return (<div style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, padding: 24 }}><style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }`}</style><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div><div style={{ ...b, ...sh, width: 80, height: 28, marginBottom: 8 }}/><div style={{ ...b, ...sh, width: 130, height: 16 }}/></div><div style={{ textAlign: "right" }}><div style={{ ...b, ...sh, width: 96, height: 28, marginBottom: 8, marginLeft: "auto" }}/><div style={{ ...b, ...sh, width: 110, height: 16, marginLeft: "auto" }}/></div></div>{[1,2,3].map(i=>(<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: t.surface, borderRadius: 12, padding: "12px 16px" }}><div style={{ ...b, ...sh, width: 36, height: 36, borderRadius: 10 }}/><div style={{ flex: 1 }}><div style={{ ...b, ...sh, width: 96, height: 16, marginBottom: 6 }}/><div style={{ ...b, ...sh, width: 200, height: 12 }}/></div></div>))}<div style={{ display: "flex", gap: 12, marginTop: 16 }}><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/></div></div>);
}

function NoAlerts({ t }) {
  return (<div style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, padding: "48px 24px", textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔭</div><h3 style={{ fontSize: 18, fontWeight: 600, color: t.text1, margin: "0 0 8px" }}>No High-Confidence Alerts Right Now</h3><p style={{ fontSize: 14, color: t.text3, maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>Our scanners are still running — we'll notify you when something stands out.</p></div>);
}

// ===== MODAL =====
function Modal({ alert, onClose, t }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: t.card, borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,.15)" }}>
        <div style={{ position: "sticky", top: 0, background: t.card, borderRadius: "20px 20px 0 0", borderBottom: `1px solid ${t.surfaceAlt}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.text1 }}>{alert.ticker}</h2><p style={{ margin: "2px 0 0", fontSize: 14, color: t.text2 }}>{alert.company}</p></div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: t.surface, border: "none", cursor: "pointer", fontSize: 18, color: t.text2, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div><span style={{ fontSize: 30, fontWeight: 700, color: t.text1 }}>${alert.price.toFixed(2)}</span><span style={{ marginLeft: 12, color: alert.change >= 0 ? t.green : t.red, fontWeight: 600 }}>{alert.change >= 0 ? "▲" : "▼"} ${Math.abs(alert.change).toFixed(2)} ({alert.change >= 0 ? "+" : ""}{alert.changePercent}%)</span></div>
          <div style={{ background: t.surface, borderRadius: 16, height: 160, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.surfaceAlt}` }}><span style={{ fontSize: 14, color: t.text3 }}>Chart — connects to live data later</span></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Key Stats</h4><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[{l:"Volume",v:alert.volume,s:`Avg: ${alert.avgVolume}`},{l:"Market Cap",v:alert.marketCap,s:alert.sector},{l:"vs S&P 500",v:`${alert.vsSpy>=0?"+":""}${alert.vsSpy}%`,s:alert.vsSpy>=0?"Outperforming":"Underperforming"},{l:"Confidence",v:`${alert.confidence}%`,s:alert.confidence>=90?"Very High":alert.confidence>=80?"High":"Moderate"}].map(x=>(<div key={x.l} style={{ background: t.surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: t.text3, textTransform: "uppercase", margin: 0 }}>{x.l}</p><p style={{ fontSize: 18, fontWeight: 700, color: t.text1, margin: "4px 0 2px" }}>{x.v}</p><p style={{ fontSize: 12, color: t.text2, margin: 0 }}>{x.s}</p></div>))}</div></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Why It's Alerting</h4><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{alert.whyAlerting.map((w,i)=>(<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: t.surface, borderRadius: 14, padding: "12px 16px" }}><span style={{ fontSize: 18, marginTop: 2 }}>{w.icon}</span><div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text1 }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: t.text2, lineHeight: 1.4 }}>{w.text}</p></div></div>))}</div></div>
          <div style={{ display: "flex", gap: 12 }}><div style={{ flex: 1, background: t.surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: t.text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Support <Tooltip text="A price level where this stock has historically stopped falling." t={t} /></p><p style={{ fontSize: 18, fontWeight: 700, color: t.text1, margin: "4px 0 0" }}>${alert.support.toFixed(2)}</p></div><div style={{ flex: 1, background: t.surface, borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: t.text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." t={t} /></p><p style={{ fontSize: 18, fontWeight: 700, color: t.text1, margin: "4px 0 0" }}>${alert.resistance.toFixed(2)}</p></div></div>
          <div style={{ display: "flex", gap: 12, padding: 0 }}><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: t.green, color: "#fff", border: "none" }}>Add to Watchlist</button><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: "transparent", color: t.text2, border: `2px solid ${t.border}` }}>Discuss in Chat</button></div>
        </div>
      </div>
    </div>
  );
}

// ===== ALERT CARD =====
function AlertCard({ alert, onClick, onBigMoneyClick, t }) {
  const isPos = alert.change >= 0;
  return (
    <div onClick={onClick} style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow, padding: "16px 20px", cursor: "pointer", transition: "box-shadow .2s" }} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow=t.shadow}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text1 }}>{alert.ticker}</h4><span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: t.surfaceAlt, color: t.text2, fontSize: 10, fontWeight: 600 }}>{alert.scannerTag.toUpperCase()}</span></div>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.company}</p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}><p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text1 }}>${alert.price.toFixed(2)}</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: isPos ? t.green : t.red }}>{isPos?"+":""}${Math.abs(alert.change).toFixed(2)} ({isPos?"+":""}{alert.changePercent}%)</p></div>
      </div>
      <BigMoneyBadge ticker={alert.ticker} onClick={onBigMoneyClick} t={t} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.surface, borderRadius: 10, padding: "8px 12px", marginTop: 8 }}><span style={{ fontSize: 14 }}>{alert.whyAlerting[0].icon}</span><span style={{ fontSize: 13, color: t.text2 }}><strong style={{ color: t.text1 }}>{alert.whyAlerting[0].label}</strong><br/><span style={{ fontSize: 12 }}>{alert.whyAlerting[0].text}</span></span></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: t.text3 }}>{alert.time} · Confidence</span>
          <ConfidenceRing value={alert.confidence} size={14} t={t} />
          <strong style={{ fontSize: 11, color: alert.confidence >= 90 ? t.green : alert.confidence >= 80 ? t.text1 : t.amber }}>{alert.confidence}%</strong>
        </div>
        <span style={{ fontSize: 12, color: t.text2, fontWeight: 500 }}>View details →</span>
      </div>
    </div>
  );
}

function MoodBar({ score, t }) {
  const s = score ?? 34;
  const label = s > 30 ? "Fearful" : s > 20 ? "Neutral" : s > 10 ? "Greedy" : "Very Greedy";
  const color = s > 30 ? "#f97316" : s > 20 ? "#eab308" : "#22c55e";
  const pct = Math.min(Math.max(s / 50, 0), 1) * 100;
  return (<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, color: t.text3 }}>MOOD:</span><span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span><div style={{ width: 48, height: 6, borderRadius: 3, background: t.border, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, #ef4444, ${color})` }}/></div><span style={{ fontSize: 12, fontWeight: 600, color: t.text2 }}>{Math.round(s)}</span></div>);
}

// ===== FLOW CARDS =====
function BigMoneyCard({ trade, isExpanded, onToggle, t }) {
  const dc = { buying: { bg: t.greenBg, border: t.green, icon: "↑", label: "Buying", color: t.green }, selling: { bg: t.redBg, border: t.red, icon: "↓", label: "Selling", color: t.red }, neutral: { bg: t.goldBg, border: t.gold, icon: "→", label: "Unclear", color: t.gold } }[trade.direction];
  return (
    <div onClick={onToggle} style={{ background: t.card, borderRadius: 14, border: `1px solid ${t.border}`, borderLeft: `${trade.multiplier >= 8 ? 4 : 3}px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(trade.time) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: dc.color }}>{dc.icon}</div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text1 }}>{trade.ticker}</h4>
          <span style={{ fontSize: 10, fontWeight: 600, color: dc.color, textTransform: "uppercase" }}>{dc.label}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text1 }}>{trade.dollarValue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.text3 }}>
        <span>{trade.shares} shares · {trade.multiplier}x normal</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(trade.time), display: "inline-block" }}/>{relTime(trade.time)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.surfaceAlt}` }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: t.text2, lineHeight: 1.5 }}>💡 {trade.note}</p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: t.text3 }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

function SmartBetCard({ bet, isExpanded, onToggle, t }) {
  const isUp = bet.direction === "up";
  const dc = isUp ? { bg: t.greenBg, border: t.green, color: t.green } : { bg: t.redBg, border: t.red, color: t.red };
  return (
    <div onClick={onToggle} style={{ background: t.card, borderRadius: 14, border: `1px solid ${t.border}`, borderLeft: `3px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(bet.time) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{isUp ? "📈" : "📉"}</span>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text1 }}>{bet.ticker}</h4>
          {bet.unusual && <span style={{ padding: "1px 5px", borderRadius: 6, background: t.goldBg, color: t.gold, fontSize: 9, fontWeight: 700 }}>🔥 UNUSUAL</span>}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text1 }}>{bet.amount}</span>
      </div>
      <div style={{ background: dc.bg, borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: dc.color, fontWeight: 600 }}>{isUp ? "Betting UP" : "Betting DOWN"}: {bet.bet}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.text3 }}>
        <span>{bet.odds}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(bet.time), display: "inline-block" }}/>{relTime(bet.time)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.surfaceAlt}` }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: t.text2, lineHeight: 1.5 }}>💡 {bet.detail}</p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: t.text3 }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

// ===== ALERT ARC (Blackjack Semicircle — Top 5) =====
function AlertArc({ alerts, onTap, t }) {
  const top5 = [...alerts].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  if (top5.length === 0) return null;
  const aotd = top5[0];
  const sides = top5.slice(1);
  const positions = [
    { x: 36, y: 38, w: 60, h: 32, rot: -8 },
    { x: 68, y: 43, w: 58, h: 28, rot: -3 },
    { x: 155, y: 43, w: 58, h: 28, rot: 3 },
    { x: 204, y: 38, w: 60, h: 32, rot: 8 },
  ];
  return (
    <div style={{ padding: "6px 4px 2px", textAlign: "center" }}>
      <svg viewBox="0 0 270 82" style={{ width: "100%", height: "auto" }}>
        <path d="M10 76 Q10 6, 135 6 Q260 6, 260 76" fill="none" stroke={t.goldBg} strokeWidth="16"/>
        <path d="M10 76 Q10 6, 135 6 Q260 6, 260 76" fill="none" stroke={`${t.gold}30`} strokeWidth="0.5" strokeDasharray="3 2"/>
        <g style={{ cursor: "pointer" }} onClick={() => onTap(aotd)}>
          <rect x="98" y="5" width="74" height="40" rx="7" fill={t.goldBg} stroke={`${t.gold}50`} strokeWidth="0.7"/>
          <text x="135" y="15" textAnchor="middle" fontSize="5" fill={t.gold} fontWeight="700" letterSpacing="0.8">ALERT OF THE DAY</text>
          <text x="135" y="29" textAnchor="middle" fontSize="13" fill={t.text1} fontWeight="700" fontFamily="'Outfit', sans-serif">{aotd.ticker}</text>
          <text x="119" y="40" textAnchor="middle" fontSize="7" fill={aotd.change >= 0 ? t.green : t.red} fontWeight="600">{aotd.change >= 0 ? "+" : ""}{aotd.changePercent}%</text>
          <text x="152" y="40" textAnchor="middle" fontSize="7" fill={t.text2}>{aotd.confidence}%</text>
        </g>
        {sides.map((alert, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <g key={alert.id} transform={`rotate(${pos.rot}, ${pos.x + pos.w/2}, ${pos.y + pos.h/2})`} style={{ cursor: "pointer" }} onClick={() => onTap(alert)}>
              <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="5" fill={t.card} stroke={t.border} strokeWidth="0.5"/>
              <text x={pos.x + pos.w/2} y={pos.y + 13} textAnchor="middle" fontSize={pos.h > 30 ? "9" : "8"} fill={t.text1} fontWeight="700" fontFamily="'Outfit', sans-serif">{alert.ticker}</text>
              <text x={pos.x + pos.w/2} y={pos.y + pos.h - 6} textAnchor="middle" fontSize="6" fill={t.green} fontWeight="600">{alert.confidence}%{alert.change >= 0 ? ` +${alert.changePercent}%` : ` ${alert.changePercent}%`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ===== BEAD PLATE (AOTD Track Record Streak Dots) =====
function BeadPlate({ history, t }) {
  if (!history || history.length === 0) return null;
  const reversed = [...history].reverse();
  const columns = [];
  let currentCol = [];
  let currentType = null;
  reversed.forEach(h => {
    const isHit = h.type === "hit" || h.result > 0;
    if (currentType === null) { currentType = isHit; currentCol.push(isHit); }
    else if (isHit === currentType) { currentCol.push(isHit); }
    else { columns.push([...currentCol]); currentCol = [isHit]; currentType = isHit; }
  });
  if (currentCol.length > 0) columns.push(currentCol);

  const hits = history.filter(h => h.type === "hit" || h.result > 0).length;
  const hitRate = history.length > 0 ? Math.round((hits / history.length) * 100) : 0;
  const avgReturn = history.length > 0 ? (history.reduce((s, h) => s + (h.result || 0), 0) / history.length).toFixed(1) : "0";

  let streakCount = 0;
  let streakType = null;
  for (let i = 0; i < history.length; i++) {
    const isHit = history[i].type === "hit" || history[i].result > 0;
    if (i === 0) { streakType = isHit; streakCount = 1; }
    else if (isHit === streakType) { streakCount++; }
    else break;
  }
  const streakLabel = streakCount > 0 ? `${streakCount}${streakType ? 'W' : 'L'}` : '—';

  return (
    <div style={{ padding: "0 12px 6px", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {col.map((isHit, di) => (
              <div key={di} style={{ width: 6, height: 6, borderRadius: "50%", background: isHit ? t.green : t.red }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: t.text3, fontFamily: "'DM Sans', sans-serif" }}>
        {hitRate}% hit · +{avgReturn}% avg · <span style={{ color: streakType ? t.green : t.red }}>{streakLabel}</span>
      </div>
    </div>
  );
}

// ===== MAIN =====
export default function AlertsTab({ session, group }) {
  const { isAdmin } = useGroup();
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('uptik_darkMode') === 'true'; } catch { return false; }
  });
  const t = useTheme(darkMode);

  const [view, setView] = useState("loading");
  const [filter, setFilter] = useState("All");
  const [modalAlert, setModalAlert] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [flowTab, setFlowTab] = useState("bigmoney");
  const [flowSort, setFlowSort] = useState("time");
  const [flowExpandedId, setFlowExpandedId] = useState(null);
  const [flowTickerFilter, setFlowTickerFilter] = useState(null);
  const [flowShowAll, setFlowShowAll] = useState(false);
  const flowRef = useRef(null);

  // ── Live data state ──
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [fearScore, setFearScore] = useState(null);
  const [spyData, setSpyData] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning52w, setScanning52w] = useState(false);
  const [scan52wProgress, setScan52wProgress] = useState(0);
  const [scanningVol, setScanningVol] = useState(false);
  const [scanVolProgress, setScanVolProgress] = useState(0);
  const [scanningGap, setScanningGap] = useState(false);
  const [scanGapProgress, setScanGapProgress] = useState(0);
  const [scanningMA, setScanningMA] = useState(false);
  const [scanMAProgress, setScanMAProgress] = useState(0);

  // ── Dark mode persist ──
  useEffect(() => {
    try { localStorage.setItem('uptik_darkMode', String(darkMode)); } catch {}
  }, [darkMode]);

  // ── Fetch breakout_alerts + realtime ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('breakout_alerts').select('*').order('created_at', { ascending: false }).limit(50);
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

  // ── Fetch market_data (VIX, SPY) ──
  useEffect(() => {
    supabase.from('market_data').select('*').then(({ data }) => {
      if (!data) return;
      data.forEach(row => {
        if (row.key === 'vix_score') setFearScore(row.value?.score ?? null);
        if (row.key === 'spy_price') setSpyData(row.value);
      });
    });
  }, []);

  // ── Scanner handlers ──
  const handle52wScan = async () => { setScanning52w(true); setScan52wProgress(0); try { await run52wHighScan(DEFAULT_THRESHOLD, setScan52wProgress); } catch {} setScanning52w(false); };
  const handleVolScan = async () => { setScanningVol(true); setScanVolProgress(0); try { await runVolSurgeScan(DEFAULT_VOL_MULTIPLIER, setScanVolProgress); } catch {} setScanningVol(false); };
  const handleGapScan = async () => { setScanningGap(true); setScanGapProgress(0); try { await runGapUpScan(DEFAULT_GAP_THRESHOLD, setScanGapProgress); } catch {} setScanningGap(false); };
  const handleMAScan = async () => { setScanningMA(true); setScanMAProgress(0); try { await runMACrossScan(DEFAULT_SHORT_MA, DEFAULT_LONG_MA, setScanMAProgress); } catch {} setScanningMA(false); };

  // ── Build display alerts: live mapped data OR mock fallback ──
  const displayAlerts = useMemo(() => {
    if (liveAlerts.length > 0) {
      const mapped = liveAlerts.map(a => mapDbAlert(a, spyData));
      // Mark highest confidence as alert of day
      if (mapped.length > 0) {
        const best = mapped.reduce((b, a) => a.confidence > b.confidence ? a : b);
        best.isAlertOfDay = true;
      }
      return mapped;
    }
    return mockAlerts;
  }, [liveAlerts, spyData]);

  const filtered = filter === "All" ? displayAlerts : displayAlerts.filter(a => a.scannerTag === filterMap[filter]);
  const heroAlert = filtered.find(a => a.isAlertOfDay) || filtered[0];
  const otherAlerts = filtered.filter(a => a !== heroAlert);
  const card = { background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "visible" };

  // Flow data
  let flowBM = flowTickerFilter ? mockBigMoney.filter(d => d.ticker === flowTickerFilter) : mockBigMoney;
  let flowSB = flowTickerFilter ? mockSmartBets.filter(s => s.ticker === flowTickerFilter) : mockSmartBets;
  if (flowSort === "size") { flowBM = [...flowBM].sort((a,b) => b.rawDollar - a.rawDollar); flowSB = [...flowSB].sort((a,b) => b.rawSize - a.rawSize); }
  else { flowBM = [...flowBM].sort((a,b) => b.time - a.time); flowSB = [...flowSB].sort((a,b) => b.time - a.time); }
  const flowList = flowTab === "bigmoney" ? flowBM : flowSB;
  const flowVisible = flowShowAll ? flowList : flowList.slice(0, 3);

  const openFlowForTicker = (ticker) => {
    setShowFlow(true);
    setFlowTickerFilter(ticker);
    setTimeout(() => flowRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div className="alerts-container" style={{ background: t.bg, minHeight: '100vh' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { width: 100%; }
        .alerts-container { max-width: 480px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }
        .hero-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .hero-ticker { font-size: 24px; font-weight: 700; color: ${t.text1}; margin: 0; font-family: 'Outfit', sans-serif; }
        .hero-price { font-size: 24px; font-weight: 700; color: ${t.text1}; margin: 0; font-family: 'Outfit', sans-serif; }
        .hero-company { font-size: 14px; color: ${t.text2}; margin: 2px 0 0; font-family: 'DM Sans', sans-serif; }
        .hero-change { font-size: 14px; font-weight: 600; margin: 2px 0 0; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 0 16px 16px; }
        .stats-cell { background: ${t.surface}; border-radius: 10px; padding: 8px 10px; text-align: center; }
        .filter-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
        @media (max-width: 480px) {
          .alerts-container { padding: 12px 8px; gap: 12px; max-width: 100% !important; width: 100% !important; }
          .hero-header { flex-direction: column; gap: 2px; }
          .hero-header > div:last-child { text-align: left; display: flex; align-items: baseline; gap: 8px; }
          .hero-ticker { font-size: 22px; } .hero-price { font-size: 22px; }
          .stats-grid { padding: 0 16px 12px; gap: 6px; }
          .stats-cell p:last-child { font-size: 13px !important; }
          .filter-row { padding: 0 0 4px; }
          .filter-row button { padding: 6px 12px !important; font-size: 11px !important; }
        }
      `}</style>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text3, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'Outfit', sans-serif" }}>Breakout Alerts</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MoodBar score={fearScore} t={t} />
          <button onClick={() => setDarkMode(d => !d)} style={{ width: 28, height: 28, borderRadius: "50%", background: t.surface, border: `1px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, padding: 0, lineHeight: 1 }} aria-label="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="filter-row">
        {filterKeys.map(f=>{
          const count = f==="All"?displayAlerts.length:displayAlerts.filter(a=>a.scannerTag===filterMap[f]).length;
          return (<button key={f} onClick={()=>setFilter(f)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: filter===f?"none":`1px solid ${t.border}`, background: filter===f?t.text1:t.card, color: filter===f?(darkMode?"#0a1628":"#fff"):t.text2, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{f}<span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: filter===f?"rgba(255,255,255,.2)":t.surfaceAlt, color: filter===f?(darkMode?"#0a1628":"#fff"):t.text3 }}>{count}</span></button>);
        })}
      </div>

      {/* SCANNER BUTTONS (admin only) */}
      {isAdmin && (
        <div>
          <button onClick={() => setScannerOpen(o => !o)} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 16, border: `1px solid ${t.border}`, background: t.card, color: t.text2, cursor: "pointer" }}>{scannerOpen ? "Hide Scanners ▲" : "Run Scanners ▼"}</button>
          {scannerOpen && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={handle52wScan} disabled={scanning52w} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, border: `1px solid ${t.green}40`, background: t.greenBg, color: t.green, cursor: scanning52w ? "default" : "pointer", opacity: scanning52w ? 0.6 : 1 }}>{scanning52w ? `52W… ${scan52wProgress}%` : "52W High"}</button>
              <button onClick={handleVolScan} disabled={scanningVol} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, border: `1px solid ${t.blue}40`, background: `${t.blue}08`, color: t.blue, cursor: scanningVol ? "default" : "pointer", opacity: scanningVol ? 0.6 : 1 }}>{scanningVol ? `Vol… ${scanVolProgress}%` : "Vol Surge"}</button>
              <button onClick={handleGapScan} disabled={scanningGap} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, border: `1px solid ${t.gold}40`, background: t.goldBg, color: t.gold, cursor: scanningGap ? "default" : "pointer", opacity: scanningGap ? 0.6 : 1 }}>{scanningGap ? `Gap… ${scanGapProgress}%` : "Gap Up"}</button>
              <button onClick={handleMAScan} disabled={scanningMA} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, border: `1px solid ${t.purple}40`, background: `${t.purple}08`, color: t.purple, cursor: scanningMA ? "default" : "pointer", opacity: scanningMA ? 0.6 : 1 }}>{scanningMA ? `MA… ${scanMAProgress}%` : "MA Cross"}</button>
            </div>
          )}
        </div>
      )}

      {/* STATES */}
      {view === "loading" && <><SkeletonCard t={t} /><SkeletonCard t={t} /></>}
      {view === "empty" && <NoAlerts t={t} />}
      {view === "active" && (
        <>
          {/* ARC */}
          {displayAlerts.length > 0 && (
            <AlertArc alerts={displayAlerts} onTap={(a) => setModalAlert(a)} t={t} />
          )}

          {/* BEAD PLATE */}
          <BeadPlate history={mockTrack.history} t={t} />

          {/* HERO */}
          {heroAlert && (
            <div>
              {heroAlert.isAlertOfDay && <p style={{ fontSize: 12, fontWeight: 700, color: t.green, textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>⭐ Alert of the Day</p>}
              <div style={{ ...card, cursor: "pointer" }} onClick={()=>setModalAlert(heroAlert)}>
                <div style={{ padding: "16px 16px 12px" }}>
                  <div className="hero-header">
                    <div><h3 className="hero-ticker">{heroAlert.ticker}</h3><p className="hero-company">{heroAlert.company}</p></div>
                    <div style={{ textAlign: "right" }}><p className="hero-price">${heroAlert.price.toFixed(2)}</p><p className="hero-change" style={{ color: heroAlert.change>=0?t.green:t.red }}>{heroAlert.change>=0?"+":""}${Math.abs(heroAlert.change).toFixed(2)} ({heroAlert.change>=0?"+":""}{heroAlert.changePercent}%)</p></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 16, background: t.greenBg, color: t.green, fontSize: 12, fontWeight: 600, border: `1px solid ${t.green}40` }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green }}/> {heroAlert.scannerTag.toUpperCase()}</span>
                    <span style={{ fontSize: 12, color: t.text3 }}>{heroAlert.time} pre-market</span>
                  </div>
                  <BigMoneyBadge ticker={heroAlert.ticker} onClick={openFlowForTicker} t={t} />
                </div>
                <div style={{ padding: "0 16px 12px" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px" }}>Why It's Alerting</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{heroAlert.whyAlerting.map((w,i)=>(<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: t.surface, borderRadius: 14, padding: "12px 16px" }}><span style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }}>{w.icon}</span><div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text1 }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: t.text2, lineHeight: 1.4 }}>{w.text}</p></div></div>))}</div>
                </div>
                <div className="stats-grid">
                  <div className="stats-cell"><p style={{ fontSize: 10, color: t.text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Support <Tooltip text="A price level where this stock has historically stopped falling." t={t} /></p><p style={{ fontSize: 15, fontWeight: 700, color: t.text1, margin: "2px 0 0" }}>${heroAlert.support.toFixed(2)}</p></div>
                  <div className="stats-cell"><p style={{ fontSize: 10, color: t.text3, textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." t={t} /></p><p style={{ fontSize: 15, fontWeight: 700, color: t.text1, margin: "2px 0 0" }}>${heroAlert.resistance.toFixed(2)}</p></div>
                  <div className="stats-cell"><p style={{ fontSize: 10, color: t.text3, textTransform: "uppercase", margin: 0 }}>Confidence</p><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, margin: "2px 0 0" }}><ConfidenceRing value={heroAlert.confidence} size={16} t={t} /><span style={{ fontSize: 15, fontWeight: 700, color: t.green }}>{heroAlert.confidence}%</span></div></div>
                </div>
                <div style={{ display: "flex", gap: 12, padding: "0 16px 16px" }}><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: t.green, color: "#fff", border: "none" }} onClick={e=>e.stopPropagation()}>Add to Watchlist</button><button style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif", background: "transparent", color: t.text2, border: `2px solid ${t.border}` }} onClick={e=>e.stopPropagation()}>Discuss in Chat</button></div>
              </div>
            </div>
          )}

          {/* MORE ALERTS */}
          {otherAlerts.length > 0 && (
            <div style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <button onClick={()=>setShowMore(!showMore)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600, color: t.text1 }}>{filter==="All"?"More Alerts":`${filter} Alerts`}</span><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: t.surfaceAlt, color: t.text2 }}>{otherAlerts.length}</span></div>
                <span style={{ fontSize: 18, color: t.text3, transition: "transform .2s", transform: showMore?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
              </button>
              {showMore && <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>{otherAlerts.map(a=>(<AlertCard key={a.id} alert={a} onClick={()=>setModalAlert(a)} onBigMoneyClick={openFlowForTicker} t={t} />))}</div>}
            </div>
          )}

          {/* INSTITUTIONAL FLOW */}
          <div ref={flowRef} style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <button onClick={()=>setShowFlow(!showFlow)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.text1 }}>🏦 Institutional Flow</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: t.surfaceAlt, color: t.text2 }}>{mockBigMoney.length + mockSmartBets.length}</span>
              </div>
              <span style={{ fontSize: 18, color: t.text3, transition: "transform .2s", transform: showFlow?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
            </button>
            {!showFlow && <p style={{ margin: 0, padding: "0 16px 12px", fontSize: 11, color: t.text3 }}>{bmBuying} buying · {bmSelling} selling · {topTicker} most active</p>}
            {showFlow && (
              <div style={{ padding: "0 12px 12px" }}>
                {flowTickerFilter && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: t.text2 }}>Showing:</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, background: t.text1, color: t.bg, fontSize: 12, fontWeight: 600 }}>
                      {flowTickerFilter}
                      <button onClick={()=>setFlowTickerFilter(null)} style={{ background: "none", border: "none", color: t.text3, cursor: "pointer", fontSize: 14, padding: 0, marginLeft: 2 }}>✕</button>
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{k:"bigmoney",l:"Big Money Trades"},{k:"smartbets",l:"Smart Bets"}].map(tab=>(
                    <button key={tab.k} onClick={()=>{setFlowTab(tab.k);setFlowExpandedId(null);setFlowShowAll(false);}} style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: flowTab===tab.k?"none":`1px solid ${t.border}`, background: flowTab===tab.k?t.text1:t.card, color: flowTab===tab.k?t.bg:t.text2, cursor: "pointer" }}>{tab.l}</button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
                  {[{k:"time",l:"Newest"},{k:"size",l:"Largest"}].map(s=>(
                    <button key={s.k} onClick={()=>setFlowSort(s.k)} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: flowSort===s.k?"none":`1px solid ${t.border}`, background: flowSort===s.k?t.text1:t.card, color: flowSort===s.k?t.bg:t.text2, cursor: "pointer" }}>{s.l}</button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {flowTab === "bigmoney"
                    ? flowVisible.map(tr=><BigMoneyCard key={tr.id} trade={tr} isExpanded={flowExpandedId===tr.id} onToggle={()=>setFlowExpandedId(flowExpandedId===tr.id?null:tr.id)} t={t} />)
                    : flowVisible.map(b=><SmartBetCard key={b.id} bet={b} isExpanded={flowExpandedId===b.id} onToggle={()=>setFlowExpandedId(flowExpandedId===b.id?null:b.id)} t={t} />)
                  }
                </div>
                {flowList.length > 3 && !flowShowAll && (
                  <button onClick={()=>setFlowShowAll(true)} style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: `1px solid ${t.border}`, background: t.card, color: t.text2, cursor: "pointer" }}>Show all {flowList.length} {flowTab==="bigmoney"?"trades":"bets"} ▾</button>
                )}
                {flowList.length === 0 && <p style={{ textAlign: "center", fontSize: 13, color: t.text3, padding: "16px 0" }}>No {flowTickerFilter||""} flow data</p>}
              </div>
            )}
          </div>

          {/* TRACK RECORD */}
          <div style={card}>
            <div style={{ padding: "16px 16px 12px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 16px" }}>Track Record</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>{[{l:"Hit Rate",v:`${mockTrack.hitRate}%`,c:t.text1},{l:"Avg Return",v:`+${mockTrack.avgReturn}%`,c:t.green},{l:"Streak",v:mockTrack.streak,c:t.text1}].map(x=>(<div key={x.l} style={{ background: t.surface, borderRadius: 14, padding: "12px 8px", textAlign: "center" }}><p style={{ fontSize: 10, color: t.text3, textTransform: "uppercase", letterSpacing: ".04em", margin: 0 }}>{x.l}</p><p style={{ fontSize: 22, fontWeight: 700, color: x.c, margin: "4px 0 0" }}>{x.v}</p></div>))}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}><div style={{ display: "flex", gap: 6 }}>{mockTrack.history.map((_,i)=>(<div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: t.text1, cursor: "pointer" }}/>))}</div><Sparkline t={t} /></div>
              <p style={{ fontSize: 12, color: t.text3, margin: 0 }}>{mockTrack.history.filter(h=>h.type==="hit").length} of {mockTrack.history.length} alerts were profitable</p>
            </div>
            <div style={{ borderTop: `1px solid ${t.surfaceAlt}` }}>{mockTrack.history.map((h,i)=>(<div key={i} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderTop: i>0?`1px solid ${t.surface}`:"none" }}><span style={{ fontSize: 10, fontWeight: 600, color: t.text3, background: t.surfaceAlt, padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}>{h.date}</span><div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text1 }}>{h.ticker}</p><p style={{ margin: "2px 0 0", fontSize: 12, color: t.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.desc}</p><p style={{ margin: "2px 0 0", fontSize: 11, color: t.text3 }}>${h.from} → ${h.to} next day</p></div><span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: h.type==="hit"?t.greenBg:t.redBg, color: h.type==="hit"?t.green:t.red }}>{h.type==="hit"?"Hit":"Miss"} {h.result>0?"+":""}{h.result}%</span></div>))}</div>
          </div>
        </>
      )}

      {modalAlert && <Modal alert={modalAlert} onClose={()=>setModalAlert(null)} t={t} />}
    </div>
  );
}
