import { useState, useEffect, useRef } from "react";

// ===== MOCK ALERTS =====
const mockAlerts = [
  { id: 1, ticker: "TSLA", company: "Tesla Inc", price: 189.30, change: 9.36, changePercent: 5.2, time: "8:14 AM", scannerTag: "Gap Up", volume: "114.6M", avgVolume: "98.3M", vsSpy: 4.48, confidence: 95, support: 175.00, resistance: 200.00, sector: "Electric Vehicles", marketCap: "$604B", description: "Manufactures electric vehicles and energy storage systems.", whyAlerting: [{ icon: "📈", label: "Price Jumped", text: "Opened $9.36 higher than yesterday" }, { icon: "📊", label: "High Activity", text: "6x more people are trading this today" }, { icon: "✅", label: "Strong Setup", text: "Technical indicators look positive" }], isAlertOfDay: true },
  { id: 2, ticker: "NVDA", company: "NVIDIA Corp", price: 891.15, change: 15.75, changePercent: 1.8, time: "9:31 AM", scannerTag: "Yearly High", volume: "62.3M", avgVolume: "45.1M", vsSpy: 1.12, confidence: 88, support: 860.00, resistance: 910.00, sector: "Semiconductors", marketCap: "$2.2T", description: "Designs GPUs and AI computing platforms.", whyAlerting: [{ icon: "🏔️", label: "Near Peak", text: "Within 1.8% of its highest price this year" }, { icon: "📊", label: "Strong Volume", text: "1.4x more trading than usual" }, { icon: "✅", label: "Momentum", text: "Price has been climbing steadily for 5 days" }], isAlertOfDay: false },
  { id: 3, ticker: "SMCI", company: "Super Micro Computer", price: 94.66, change: 2.49, changePercent: 2.7, time: "9:45 AM", scannerTag: "Volume Spike", volume: "89.2M", avgVolume: "21.3M", vsSpy: 2.02, confidence: 82, support: 88.00, resistance: 102.00, sector: "IT Hardware", marketCap: "$55B", description: "Provides high-performance server and storage solutions for AI.", whyAlerting: [{ icon: "🔥", label: "Volume Surge", text: "4.2x more shares traded than a normal day" }, { icon: "📈", label: "Price Moving", text: "Up 2.7% so far today" }, { icon: "💡", label: "Sector Buzz", text: "AI server demand driving interest" }], isAlertOfDay: false },
  { id: 4, ticker: "AAPL", company: "Apple Inc", price: 218.45, change: 3.12, changePercent: 1.45, time: "10:02 AM", scannerTag: "Trend Change", volume: "78.5M", avgVolume: "65.2M", vsSpy: 0.77, confidence: 79, support: 210.00, resistance: 225.00, sector: "Consumer Electronics", marketCap: "$3.4T", description: "Designs and sells smartphones, computers, and digital services.", whyAlerting: [{ icon: "🔄", label: "Trend Shift", text: "Short-term trend just crossed above long-term trend" }, { icon: "📊", label: "Increasing Volume", text: "1.2x more trading activity than normal" }, { icon: "✅", label: "Bullish Signal", text: "This pattern has led to gains 68% of the time" }], isAlertOfDay: false },
  { id: 5, ticker: "AMZN", company: "Amazon.com Inc", price: 198.72, change: 6.83, changePercent: 3.56, time: "8:05 AM", scannerTag: "Catalyst News", volume: "95.1M", avgVolume: "52.7M", vsSpy: 2.88, confidence: 91, support: 188.00, resistance: 210.00, sector: "E-Commerce / Cloud", marketCap: "$2.1T", description: "Operates online retail marketplace and Amazon Web Services cloud platform.", whyAlerting: [{ icon: "📰", label: "Breaking News", text: "Announced major new AWS AI partnership this morning" }, { icon: "📈", label: "Price Jumping", text: "Opened $6.83 higher on the news" }, { icon: "🔥", label: "Volume Surge", text: "1.8x more trading than usual" }], isAlertOfDay: false },
  { id: 6, ticker: "META", company: "Meta Platforms", price: 542.18, change: 18.40, changePercent: 3.51, time: "9:33 AM", scannerTag: "Gap Up", volume: "44.8M", avgVolume: "28.1M", vsSpy: 2.83, confidence: 87, support: 515.00, resistance: 560.00, sector: "Social Media / AI", marketCap: "$1.4T", description: "Operates Facebook, Instagram, WhatsApp and invests heavily in AI and metaverse.", whyAlerting: [{ icon: "📈", label: "Price Jumped", text: "Opened $18.40 higher than yesterday's close" }, { icon: "📊", label: "High Activity", text: "1.6x more people trading today" }, { icon: "💡", label: "AI Catalyst", text: "New AI model announcement driving interest" }], isAlertOfDay: false },
  { id: 7, ticker: "AMD", company: "Advanced Micro Devices", price: 164.20, change: -1.81, changePercent: -1.1, time: "10:15 AM", scannerTag: "Volume Spike", volume: "102.3M", avgVolume: "55.8M", vsSpy: -1.78, confidence: 72, support: 155.00, resistance: 172.00, sector: "Semiconductors", marketCap: "$265B", description: "Designs CPUs and GPUs for gaming, data centers, and AI applications.", whyAlerting: [{ icon: "🔥", label: "Volume Explosion", text: "1.8x more shares traded than normal" }, { icon: "⚠️", label: "Price Dipping", text: "Down 1.1% — unusual on high volume" }, { icon: "🔍", label: "Watch Closely", text: "Big volume on a down day can signal a reversal" }], isAlertOfDay: false },
  { id: 8, ticker: "GOOGL", company: "Alphabet Inc", price: 172.55, change: 2.05, changePercent: 1.2, time: "9:50 AM", scannerTag: "Yearly High", volume: "35.6M", avgVolume: "28.4M", vsSpy: 0.52, confidence: 84, support: 165.00, resistance: 178.00, sector: "Internet / AI", marketCap: "$2.1T", description: "Operates Google search, YouTube, cloud computing, and AI research.", whyAlerting: [{ icon: "🏔️", label: "Approaching Peak", text: "Within 3.1% of its highest price this year" }, { icon: "📊", label: "Steady Volume", text: "1.25x above average trading" }, { icon: "✅", label: "Positive Trend", text: "Price has gained 4 out of the last 5 days" }], isAlertOfDay: false },
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

// ===== SHARED COMPONENTS =====
function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button onClick={e => { e.stopPropagation(); setShow(!show); }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, borderRadius: "50%", background: "#e2e8f0", color: "#64748b", border: "none", cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>i</button>
      {show && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8, width: 220, padding: "8px 12px", fontSize: 12, color: "#fff", background: "#1e293b", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.2)", zIndex: 99, lineHeight: 1.5 }}>{text}</div>}
    </span>
  );
}

function Sparkline() {
  const pts = [12,18,14,22,20,28,25,32,30,38,36,42];
  const w=120,h=40,p=2,mn=Math.min(...pts),mx=Math.max(...pts);
  const d = pts.map((v,i)=>{ const x=p+(i/(pts.length-1))*(w-p*2), y=p+((mx-v)/(mx-mn))*(h-p*2); return `${i===0?"M":"L"}${x},${y}`; }).join(" ");
  return (<svg viewBox={`0 0 ${w} ${h}`} style={{width:112,height:40}}><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity=".2"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs><path d={`${d} L${w-p},${h-p} L${p},${h-p} Z`} fill="url(#sg)"/><path d={d} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

function BigMoneyBadge({ ticker, onClick }) {
  if (!hasBigMoneySignal(ticker)) return null;
  return (
    <div onClick={e => { e.stopPropagation(); onClick(ticker); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", marginTop: 6, cursor: "pointer" }}>
      <span style={{ fontSize: 11 }}>🎯</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d" }}>Big money is also buying</span>
    </div>
  );
}

// ===== SKELETON / EMPTY =====
function SkeletonCard() {
  const b = { background: "#e2e8f0", borderRadius: 8 }, sh = { animation: "pulse 1.5s ease-in-out infinite" };
  return (<div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}><style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }`}</style><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div><div style={{ ...b, ...sh, width: 80, height: 28, marginBottom: 8 }}/><div style={{ ...b, ...sh, width: 130, height: 16 }}/></div><div style={{ textAlign: "right" }}><div style={{ ...b, ...sh, width: 96, height: 28, marginBottom: 8, marginLeft: "auto" }}/><div style={{ ...b, ...sh, width: 110, height: 16, marginLeft: "auto" }}/></div></div>{[1,2,3].map(i=>(<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "#f8fafc", borderRadius: 12, padding: "12px 16px" }}><div style={{ ...b, ...sh, width: 36, height: 36, borderRadius: 10 }}/><div style={{ flex: 1 }}><div style={{ ...b, ...sh, width: 96, height: 16, marginBottom: 6 }}/><div style={{ ...b, ...sh, width: 200, height: 12 }}/></div></div>))}<div style={{ display: "flex", gap: 12, marginTop: 16 }}><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/><div style={{ ...b, ...sh, flex: 1, height: 44, borderRadius: 12 }}/></div></div>);
}

function NoAlerts() {
  return (<div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "48px 24px", textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔭</div><h3 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", margin: "0 0 8px" }}>No High-Confidence Alerts Right Now</h3><p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>Our scanners are still running — we'll notify you when something stands out.</p></div>);
}

// ===== MODAL =====
function Modal({ alert, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,.15)" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", borderRadius: "20px 20px 0 0", borderBottom: "1px solid #f1f5f9", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{alert.ticker}</h2><p style={{ margin: "2px 0 0", fontSize: 14, color: "#64748b" }}>{alert.company}</p></div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f1f5f9", border: "none", cursor: "pointer", fontSize: 18, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div><span style={{ fontSize: 30, fontWeight: 700, color: "#0f172a" }}>${alert.price.toFixed(2)}</span><span style={{ marginLeft: 12, color: alert.change >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{alert.change >= 0 ? "▲" : "▼"} ${Math.abs(alert.change).toFixed(2)} ({alert.change >= 0 ? "+" : ""}{alert.changePercent}%)</span></div>
          <div style={{ background: "#f8fafc", borderRadius: 16, height: 160, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #f1f5f9" }}><span style={{ fontSize: 14, color: "#94a3b8" }}>Chart — connects to live data later</span></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Key Stats</h4><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[{l:"Volume",v:alert.volume,s:`Avg: ${alert.avgVolume}`},{l:"Market Cap",v:alert.marketCap,s:alert.sector},{l:"vs S&P 500",v:`${alert.vsSpy>=0?"+":""}${alert.vsSpy}%`,s:alert.vsSpy>=0?"Outperforming":"Underperforming"},{l:"Confidence",v:`${alert.confidence}%`,s:alert.confidence>=90?"Very High":alert.confidence>=80?"High":"Moderate"}].map(x=>(<div key={x.l} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>{x.l}</p><p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 2px" }}>{x.v}</p><p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{x.s}</p></div>))}</div></div>
          <div><h4 style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Why It's Alerting</h4><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{alert.whyAlerting.map((w,i)=>(<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}><span style={{ fontSize: 18, marginTop: 2 }}>{w.icon}</span><div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{w.text}</p></div></div>))}</div></div>
          <div style={{ display: "flex", gap: 12 }}><div style={{ flex: 1, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Support <Tooltip text="A price level where this stock has historically stopped falling." /></p><p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 0" }}>${alert.support.toFixed(2)}</p></div><div style={{ flex: 1, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}><p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center" }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." /></p><p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 0" }}>${alert.resistance.toFixed(2)}</p></div></div>
          <div className="btn-row" style={{ padding: 0 }}><button className="btn-primary">Add to Watchlist</button><button className="btn-secondary">Discuss in Chat</button></div>
        </div>
      </div>
    </div>
  );
}

// ===== ALERT CARD =====
function AlertCard({ alert, onClick, onBigMoneyClick }) {
  const isPos = alert.change >= 0;
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "16px 20px", cursor: "pointer", transition: "box-shadow .2s" }} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.06)"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{alert.ticker}</h4><span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: "#f1f5f9", color: "#475569", fontSize: 10, fontWeight: 600 }}>{alert.scannerTag.toUpperCase()}</span></div>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.company}</p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}><p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>${alert.price.toFixed(2)}</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: isPos ? "#16a34a" : "#dc2626" }}>{isPos?"+":""}${Math.abs(alert.change).toFixed(2)} ({isPos?"+":""}{alert.changePercent}%)</p></div>
      </div>
      <BigMoneyBadge ticker={alert.ticker} onClick={onBigMoneyClick} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderRadius: 10, padding: "8px 12px", marginTop: 8 }}><span style={{ fontSize: 14 }}>{alert.whyAlerting[0].icon}</span><span style={{ fontSize: 13, color: "#475569" }}><strong style={{ color: "#1e293b" }}>{alert.whyAlerting[0].label}</strong><br/><span style={{ fontSize: 12 }}>{alert.whyAlerting[0].text}</span></span></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>{alert.time} · Confidence <strong style={{ color: alert.confidence >= 90 ? "#16a34a" : alert.confidence >= 80 ? "#0f172a" : "#f59e0b" }}>{alert.confidence}%</strong></span><span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>View details →</span></div>
    </div>
  );
}

function MoodBar() {
  return (<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>MOOD:</span><span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>Fearful</span><div style={{ width: 48, height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}><div style={{ width: "34%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #ef4444, #f59e0b)" }}/></div><span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>34</span></div>);
}

// ===== FLOW CARDS =====
function BigMoneyCard({ trade, isExpanded, onToggle }) {
  const dc = { buying: { bg: "#f0fdf4", border: "#22c55e", icon: "↑", label: "Buying", color: "#15803d" }, selling: { bg: "#fef2f2", border: "#ef4444", icon: "↓", label: "Selling", color: "#dc2626" }, neutral: { bg: "#fffbeb", border: "#f59e0b", icon: "→", label: "Unclear", color: "#d97706" } }[trade.direction];
  return (
    <div onClick={onToggle} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", borderLeft: `${trade.multiplier >= 8 ? 4 : 3}px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(trade.time) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: dc.color }}>{dc.icon}</div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{trade.ticker}</h4>
          <span style={{ fontSize: 10, fontWeight: 600, color: dc.color, textTransform: "uppercase" }}>{dc.label}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{trade.dollarValue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
        <span>{trade.shares} shares · {trade.multiplier}x normal</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(trade.time), display: "inline-block" }}/>{relTime(trade.time)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>💡 {trade.note}</p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: "#94a3b8" }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

function SmartBetCard({ bet, isExpanded, onToggle }) {
  const isUp = bet.direction === "up";
  const dc = isUp ? { bg: "#f0fdf4", border: "#22c55e", color: "#15803d" } : { bg: "#fef2f2", border: "#ef4444", color: "#dc2626" };
  return (
    <div onClick={onToggle} style={{ background: "#fff", borderRadius: 14, border: `1px solid ${isUp ? "#d1fae5" : "#fecaca"}`, borderLeft: `3px solid ${dc.border}`, padding: "12px 14px", cursor: "pointer", opacity: cardOpacity(bet.time) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{isUp ? "📈" : "📉"}</span>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{bet.ticker}</h4>
          {bet.unusual && <span style={{ padding: "1px 5px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 9, fontWeight: 700 }}>🔥 UNUSUAL</span>}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{bet.amount}</span>
      </div>
      <div style={{ background: dc.bg, borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: dc.color, fontWeight: 600 }}>{isUp ? "Betting UP" : "Betting DOWN"}: {bet.bet}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
        <span>{bet.odds}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: freshDotColor(bet.time), display: "inline-block" }}/>{relTime(bet.time)}</div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>💡 {bet.detail}</p>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontSize: 10, color: "#94a3b8" }}>{isExpanded ? "Less ▴" : "More ▾"}</span></div>
    </div>
  );
}

// ===== MAIN =====
export default function AlertsTab({ session, group }) {
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

  useEffect(() => { if (view === "loading") { const t = setTimeout(() => setView("active"), 2000); return () => clearTimeout(t); } }, [view]);

  const filtered = filter === "All" ? mockAlerts : mockAlerts.filter(a => a.scannerTag === filterMap[filter]);
  const heroAlert = filtered.find(a => a.isAlertOfDay) || filtered[0];
  const otherAlerts = filtered.filter(a => a !== heroAlert);
  const card = { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", overflow: "visible" };

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
    <div className="alerts-container">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { width: 100%; }
        .alerts-container { max-width: 480px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }
        .hero-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .hero-ticker { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .hero-price { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .hero-company { font-size: 14px; color: #64748b; margin: 2px 0 0; }
        .hero-change { font-size: 14px; font-weight: 600; margin: 2px 0 0; }
        .btn-row { display: flex; flex-direction: row; gap: 12px; padding: 0 16px 16px; }
        .btn-row button { flex: 1; padding: 12px 0; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .btn-primary { background: #16a34a; color: #fff; border: none; box-shadow: 0 1px 3px rgba(22,163,74,.3); }
        .btn-secondary { background: transparent; color: #64748b; border: 2px solid #e2e8f0; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 0 16px 16px; }
        .stats-cell { background: #f8fafc; border-radius: 10px; padding: 8px 10px; text-align: center; }
        .mood-row { display: flex; align-items: center; gap: 6px; }
        .filter-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
        @media (max-width: 480px) {
          .alerts-container { padding: 12px 8px; gap: 12px; max-width: 100% !important; width: 100% !important; }
          .hero-header { flex-direction: column; gap: 2px; }
          .hero-header > div:last-child { text-align: left; display: flex; align-items: baseline; gap: 8px; }
          .hero-ticker { font-size: 22px; } .hero-price { font-size: 22px; }
          .btn-row { flex-direction: column; gap: 8px; padding: 0 16px 16px; }
          .btn-row button { width: 100% !important; flex: none !important; }
          .stats-grid { padding: 0 16px 12px; gap: 6px; }
          .stats-cell p:last-child { font-size: 13px !important; }
          .mood-row { display: none; }
          .filter-row { padding: 0 0 4px; }
          .filter-row button { padding: 6px 12px !important; font-size: 11px !important; }
        }
      `}</style>

      {/* DEV TOGGLE */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#d97706", letterSpacing: "1px" }}>Dev</span>
        {["loading","active","empty"].map(s=>(<button key={s} onClick={()=>setView(s)} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: view===s?"none":"1px solid #fde68a", background: view===s?"#f59e0b":"#fff", color: view===s?"#fff":"#92400e", cursor: "pointer" }}>{s==="loading"?"Loading":s==="active"?"Alert Active":"No Alerts"}</button>))}
      </div>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px" }}>Breakout Alerts</h2>
        <div className="mood-row"><MoodBar /></div>
      </div>

      {/* FILTERS */}
      <div className="filter-row">
        {filterKeys.map(f=>{
          const count = f==="All"?mockAlerts.length:mockAlerts.filter(a=>a.scannerTag===filterMap[f]).length;
          return (<button key={f} onClick={()=>setFilter(f)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: filter===f?"none":"1px solid #e2e8f0", background: filter===f?"#1e293b":"#fff", color: filter===f?"#fff":"#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{f}<span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: filter===f?"rgba(255,255,255,.2)":"#f1f5f9", color: filter===f?"#fff":"#94a3b8" }}>{count}</span></button>);
        })}
      </div>

      {/* STATES */}
      {view === "loading" && <><SkeletonCard /><SkeletonCard /></>}
      {view === "empty" && <NoAlerts />}
      {view === "active" && (
        <>
          {/* HERO */}
          {heroAlert && (
            <div>
              {heroAlert.isAlertOfDay && <p style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>⭐ Alert of the Day</p>}
              <div style={{ ...card, cursor: "pointer" }} onClick={()=>setModalAlert(heroAlert)}>
                <div style={{ padding: "16px 16px 12px" }}>
                  <div className="hero-header">
                    <div><h3 className="hero-ticker">{heroAlert.ticker}</h3><p className="hero-company">{heroAlert.company}</p></div>
                    <div style={{ textAlign: "right" }}><p className="hero-price">${heroAlert.price.toFixed(2)}</p><p className="hero-change" style={{ color: heroAlert.change>=0?"#16a34a":"#dc2626" }}>{heroAlert.change>=0?"+":""}${Math.abs(heroAlert.change).toFixed(2)} ({heroAlert.change>=0?"+":""}{heroAlert.changePercent}%)</p></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 16, background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 600, border: "1px solid #bbf7d0" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }}/> {heroAlert.scannerTag.toUpperCase()}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{heroAlert.time} pre-market</span>
                  </div>
                  <BigMoneyBadge ticker={heroAlert.ticker} onClick={openFlowForTicker} />
                </div>
                <div style={{ padding: "0 16px 12px" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px" }}>Why It's Alerting</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{heroAlert.whyAlerting.map((w,i)=>(<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}><span style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }}>{w.icon}</span><div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{w.text}</p></div></div>))}</div>
                </div>
                <div className="stats-grid"><div className="stats-cell"><p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Support <Tooltip text="A price level where this stock has historically stopped falling." /></p><p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "2px 0 0" }}>${heroAlert.support.toFixed(2)}</p></div><div className="stats-cell"><p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." /></p><p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "2px 0 0" }}>${heroAlert.resistance.toFixed(2)}</p></div><div className="stats-cell"><p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Confidence</p><p style={{ fontSize: 15, fontWeight: 700, color: "#16a34a", margin: "2px 0 0" }}>{heroAlert.confidence}%</p></div></div>
                <div className="btn-row"><button className="btn-primary" onClick={e=>e.stopPropagation()}>Add to Watchlist</button><button className="btn-secondary" onClick={e=>e.stopPropagation()}>Discuss in Chat</button></div>
              </div>
            </div>
          )}

          {/* MORE ALERTS */}
          {otherAlerts.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <button onClick={()=>setShowMore(!showMore)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{filter==="All"?"More Alerts":`${filter} Alerts`}</span><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f1f5f9", color: "#64748b" }}>{otherAlerts.length}</span></div>
                <span style={{ fontSize: 18, color: "#94a3b8", transition: "transform .2s", transform: showMore?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
              </button>
              {showMore && <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>{otherAlerts.map(a=>(<AlertCard key={a.id} alert={a} onClick={()=>setModalAlert(a)} onBigMoneyClick={openFlowForTicker} />))}</div>}
            </div>
          )}

          {/* INSTITUTIONAL FLOW */}
          <div ref={flowRef} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
            <button onClick={()=>setShowFlow(!showFlow)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>🏦 Institutional Flow</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f1f5f9", color: "#64748b" }}>{mockBigMoney.length + mockSmartBets.length}</span>
              </div>
              <span style={{ fontSize: 18, color: "#94a3b8", transition: "transform .2s", transform: showFlow?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
            </button>
            {!showFlow && <p style={{ margin: 0, padding: "0 16px 12px", fontSize: 11, color: "#94a3b8" }}>{bmBuying} buying · {bmSelling} selling · {topTicker} most active</p>}
            {showFlow && (
              <div style={{ padding: "0 12px 12px" }}>
                {/* Ticker filter pill */}
                {flowTickerFilter && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Showing:</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600 }}>
                      {flowTickerFilter}
                      <button onClick={()=>setFlowTickerFilter(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, padding: 0, marginLeft: 2 }}>✕</button>
                    </span>
                  </div>
                )}
                {/* Inner tabs */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{k:"bigmoney",l:"Big Money Trades"},{k:"smartbets",l:"Smart Bets"}].map(t=>(
                    <button key={t.k} onClick={()=>{setFlowTab(t.k);setFlowExpandedId(null);setFlowShowAll(false);}} style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: flowTab===t.k?"none":"1px solid #e2e8f0", background: flowTab===t.k?"#1e293b":"#fff", color: flowTab===t.k?"#fff":"#64748b", cursor: "pointer" }}>{t.l}</button>
                  ))}
                </div>
                {/* Sort */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
                  {[{k:"time",l:"Newest"},{k:"size",l:"Largest"}].map(s=>(
                    <button key={s.k} onClick={()=>setFlowSort(s.k)} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: flowSort===s.k?"none":"1px solid #e2e8f0", background: flowSort===s.k?"#1e293b":"#fff", color: flowSort===s.k?"#fff":"#64748b", cursor: "pointer" }}>{s.l}</button>
                  ))}
                </div>
                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {flowTab === "bigmoney"
                    ? flowVisible.map(t=><BigMoneyCard key={t.id} trade={t} isExpanded={flowExpandedId===t.id} onToggle={()=>setFlowExpandedId(flowExpandedId===t.id?null:t.id)} />)
                    : flowVisible.map(b=><SmartBetCard key={b.id} bet={b} isExpanded={flowExpandedId===b.id} onToggle={()=>setFlowExpandedId(flowExpandedId===b.id?null:b.id)} />)
                  }
                </div>
                {flowList.length > 3 && !flowShowAll && (
                  <button onClick={()=>setFlowShowAll(true)} style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>Show all {flowList.length} {flowTab==="bigmoney"?"trades":"bets"} ▾</button>
                )}
                {flowList.length === 0 && <p style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>No {flowTickerFilter||""} flow data</p>}
              </div>
            )}
          </div>

          {/* TRACK RECORD */}
          <div style={card}>
            <div style={{ padding: "16px 16px 12px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 16px" }}>Track Record</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>{[{l:"Hit Rate",v:`${mockTrack.hitRate}%`,c:"#1e293b"},{l:"Avg Return",v:`+${mockTrack.avgReturn}%`,c:"#16a34a"},{l:"Streak",v:mockTrack.streak,c:"#1e293b"}].map(x=>(<div key={x.l} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}><p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", margin: 0 }}>{x.l}</p><p style={{ fontSize: 22, fontWeight: 700, color: x.c, margin: "4px 0 0" }}>{x.v}</p></div>))}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}><div style={{ display: "flex", gap: 6 }}>{mockTrack.history.map((_,i)=>(<div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: "#334155", cursor: "pointer" }}/>))}</div><Sparkline /></div>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{mockTrack.history.filter(h=>h.type==="hit").length} of {mockTrack.history.length} alerts were profitable</p>
            </div>
            <div style={{ borderTop: "1px solid #f1f5f9" }}>{mockTrack.history.map((h,i)=>(<div key={i} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderTop: i>0?"1px solid #f8fafc":"none" }}><span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}>{h.date}</span><div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{h.ticker}</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.desc}</p><p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>${h.from} → ${h.to} next day</p></div><span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: h.type==="hit"?"#f0fdf4":"#fef2f2", color: h.type==="hit"?"#15803d":"#dc2626" }}>{h.type==="hit"?"Hit":"Miss"} {h.result>0?"+":""}{h.result}%</span></div>))}</div>
          </div>
        </>
      )}

      {modalAlert && <Modal alert={modalAlert} onClose={()=>setModalAlert(null)} />}
    </div>
  );
}
