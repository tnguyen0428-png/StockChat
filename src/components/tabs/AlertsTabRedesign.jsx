import { useState, useEffect, useRef } from "react";

// ===== MOCK ALERTS (one per category + extras) =====
const mockAlerts = [
  {
    id: 1, ticker: "TSLA", company: "Tesla Inc", price: 189.30, change: 9.36, changePercent: 5.2,
    time: "8:14 AM", scannerTag: "Gap Up", volume: "114.6M", avgVolume: "98.3M",
    vsSpy: 4.48, confidence: 95, support: 175.00, resistance: 200.00,
    sector: "Electric Vehicles", marketCap: "$604B",
    description: "Manufactures electric vehicles and energy storage systems.",
    whyAlerting: [
      { icon: "📈", label: "Price Jumped", text: "Opened $9.36 higher than yesterday" },
      { icon: "📊", label: "High Activity", text: "6x more people are trading this today" },
      { icon: "✅", label: "Strong Setup", text: "Technical indicators look positive" },
    ],
    isAlertOfDay: true,
  },
  {
    id: 2, ticker: "NVDA", company: "NVIDIA Corp", price: 891.15, change: 15.75, changePercent: 1.8,
    time: "9:31 AM", scannerTag: "Yearly High", volume: "62.3M", avgVolume: "45.1M",
    vsSpy: 1.12, confidence: 88, support: 860.00, resistance: 910.00,
    sector: "Semiconductors", marketCap: "$2.2T",
    description: "Designs GPUs and AI computing platforms.",
    whyAlerting: [
      { icon: "🏔️", label: "Near Peak", text: "Within 1.8% of its highest price this year" },
      { icon: "📊", label: "Strong Volume", text: "1.4x more trading than usual" },
      { icon: "✅", label: "Momentum", text: "Price has been climbing steadily for 5 days" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 3, ticker: "SMCI", company: "Super Micro Computer", price: 94.66, change: 2.49, changePercent: 2.7,
    time: "9:45 AM", scannerTag: "Volume Spike", volume: "89.2M", avgVolume: "21.3M",
    vsSpy: 2.02, confidence: 82, support: 88.00, resistance: 102.00,
    sector: "IT Hardware", marketCap: "$55B",
    description: "Provides high-performance server and storage solutions for AI.",
    whyAlerting: [
      { icon: "🔥", label: "Volume Surge", text: "4.2x more shares traded than a normal day" },
      { icon: "📈", label: "Price Moving", text: "Up 2.7% so far today" },
      { icon: "💡", label: "Sector Buzz", text: "AI server demand driving interest" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 4, ticker: "AAPL", company: "Apple Inc", price: 218.45, change: 3.12, changePercent: 1.45,
    time: "10:02 AM", scannerTag: "Trend Change", volume: "78.5M", avgVolume: "65.2M",
    vsSpy: 0.77, confidence: 79, support: 210.00, resistance: 225.00,
    sector: "Consumer Electronics", marketCap: "$3.4T",
    description: "Designs and sells smartphones, computers, and digital services.",
    whyAlerting: [
      { icon: "🔄", label: "Trend Shift", text: "Short-term trend just crossed above long-term trend" },
      { icon: "📊", label: "Increasing Volume", text: "1.2x more trading activity than normal" },
      { icon: "✅", label: "Bullish Signal", text: "This pattern has led to gains 68% of the time" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 5, ticker: "AMZN", company: "Amazon.com Inc", price: 198.72, change: 6.83, changePercent: 3.56,
    time: "8:05 AM", scannerTag: "Catalyst News", volume: "95.1M", avgVolume: "52.7M",
    vsSpy: 2.88, confidence: 91, support: 188.00, resistance: 210.00,
    sector: "E-Commerce / Cloud", marketCap: "$2.1T",
    description: "Operates online retail marketplace and Amazon Web Services cloud platform.",
    whyAlerting: [
      { icon: "📰", label: "Breaking News", text: "Announced major new AWS AI partnership this morning" },
      { icon: "📈", label: "Price Jumping", text: "Opened $6.83 higher on the news" },
      { icon: "🔥", label: "Volume Surge", text: "1.8x more trading than usual" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 6, ticker: "META", company: "Meta Platforms", price: 542.18, change: 18.40, changePercent: 3.51,
    time: "9:33 AM", scannerTag: "Gap Up", volume: "44.8M", avgVolume: "28.1M",
    vsSpy: 2.83, confidence: 87, support: 515.00, resistance: 560.00,
    sector: "Social Media / AI", marketCap: "$1.4T",
    description: "Operates Facebook, Instagram, WhatsApp and invests heavily in AI and metaverse.",
    whyAlerting: [
      { icon: "📈", label: "Price Jumped", text: "Opened $18.40 higher than yesterday's close" },
      { icon: "📊", label: "High Activity", text: "1.6x more people trading today" },
      { icon: "💡", label: "AI Catalyst", text: "New AI model announcement driving interest" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 7, ticker: "AMD", company: "Advanced Micro Devices", price: 164.20, change: -1.81, changePercent: -1.1,
    time: "10:15 AM", scannerTag: "Volume Spike", volume: "102.3M", avgVolume: "55.8M",
    vsSpy: -1.78, confidence: 72, support: 155.00, resistance: 172.00,
    sector: "Semiconductors", marketCap: "$265B",
    description: "Designs CPUs and GPUs for gaming, data centers, and AI applications.",
    whyAlerting: [
      { icon: "🔥", label: "Volume Explosion", text: "1.8x more shares traded than normal" },
      { icon: "⚠️", label: "Price Dipping", text: "Down 1.1% — unusual on high volume" },
      { icon: "🔍", label: "Watch Closely", text: "Big volume on a down day can signal a reversal" },
    ],
    isAlertOfDay: false,
  },
  {
    id: 8, ticker: "GOOGL", company: "Alphabet Inc", price: 172.55, change: 2.05, changePercent: 1.2,
    time: "9:50 AM", scannerTag: "Yearly High", volume: "35.6M", avgVolume: "28.4M",
    vsSpy: 0.52, confidence: 84, support: 165.00, resistance: 178.00,
    sector: "Internet / AI", marketCap: "$2.1T",
    description: "Operates Google search, YouTube, cloud computing, and AI research.",
    whyAlerting: [
      { icon: "🏔️", label: "Approaching Peak", text: "Within 3.1% of its highest price this year" },
      { icon: "📊", label: "Steady Volume", text: "1.25x above average trading" },
      { icon: "✅", label: "Positive Trend", text: "Price has gained 4 out of the last 5 days" },
    ],
    isAlertOfDay: false,
  },
];

const filterMap = {
  "All": null,
  "Yearly High": "Yearly High",
  "Volume Spike": "Volume Spike",
  "Trend Change": "Trend Change",
  "Gap Up": "Gap Up",
  "Catalyst News": "Catalyst News",
};
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

// ===== TOOLTIP =====
function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, borderRadius: "50%", background: "#e2e8f0", color: "#64748b", border: "none", cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >i</button>
      {show && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8, width: 210, padding: "8px 12px", fontSize: 12, color: "#fff", background: "#1e293b", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.2)", zIndex: 99, lineHeight: 1.5 }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ===== SPARKLINE =====
function Sparkline() {
  const pts = [12,18,14,22,20,28,25,32,30,38,36,42];
  const w=120,h=40,p=2,mn=Math.min(...pts),mx=Math.max(...pts);
  const d = pts.map((v,i)=>{
    const x=p+(i/(pts.length-1))*(w-p*2), y=p+((mx-v)/(mx-mn))*(h-p*2);
    return `${i===0?"M":"L"}${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:112,height:40}}>
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity=".2"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs>
      <path d={`${d} L${w-p},${h-p} L${p},${h-p} Z`} fill="url(#sg)"/>
      <path d={d} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ===== SKELETON =====
function SkeletonCard() {
  const b = { background: "#e2e8f0", borderRadius: 8 };
  const shimmer = { animation: "pulse 1.5s ease-in-out infinite" };
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div><div style={{ ...b, ...shimmer, width: 80, height: 28, marginBottom: 8 }}/><div style={{ ...b, ...shimmer, width: 130, height: 16 }}/></div>
        <div style={{ textAlign: "right" }}><div style={{ ...b, ...shimmer, width: 96, height: 28, marginBottom: 8, marginLeft: "auto" }}/><div style={{ ...b, ...shimmer, width: 110, height: 16, marginLeft: "auto" }}/></div>
      </div>
      <div style={{ ...b, ...shimmer, width: 110, height: 24, marginBottom: 20 }}/>
      {[1,2,3].map(i=>(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "#f8fafc", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ ...b, ...shimmer, width: 36, height: 36, borderRadius: 10 }}/>
          <div style={{ flex: 1 }}><div style={{ ...b, ...shimmer, width: 96, height: 16, marginBottom: 6 }}/><div style={{ ...b, ...shimmer, width: 200, height: 12 }}/></div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <div style={{ ...b, ...shimmer, flex: 1, height: 44, borderRadius: 12 }}/><div style={{ ...b, ...shimmer, flex: 1, height: 44, borderRadius: 12 }}/>
      </div>
    </div>
  );
}

// ===== NO ALERTS =====
function NoAlerts() {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "48px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔭</div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", margin: "0 0 8px" }}>No High-Confidence Alerts Right Now</h3>
      <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>Our scanners are still running — we'll notify you when something stands out.</p>
      <div style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}/> Scanners active
      </div>
    </div>
  );
}

// ===== DETAIL MODAL =====
function Modal({ alert, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,.15)" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", borderRadius: "20px 20px 0 0", borderBottom: "1px solid #f1f5f9", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{alert.ticker}</h2><p style={{ margin: "2px 0 0", fontSize: 14, color: "#64748b" }}>{alert.company}</p></div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f1f5f9", border: "none", cursor: "pointer", fontSize: 18, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <span style={{ fontSize: 30, fontWeight: 700, color: "#0f172a" }}>${alert.price.toFixed(2)}</span>
            <span style={{ marginLeft: 12, color: alert.change >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
              {alert.change >= 0 ? "▲" : "▼"} ${Math.abs(alert.change).toFixed(2)} ({alert.change >= 0 ? "+" : ""}{alert.changePercent}%)
            </span>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 16, height: 160, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #f1f5f9" }}><span style={{ fontSize: 14, color: "#94a3b8" }}>Chart — connects to live data later</span></div>
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Key Stats</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[{l:"Volume",v:alert.volume,s:`Avg: ${alert.avgVolume}`},{l:"Market Cap",v:alert.marketCap,s:alert.sector},{l:"vs S&P 500",v:`${alert.vsSpy >= 0 ? "+" : ""}${alert.vsSpy}%`,s:alert.vsSpy >= 0 ? "Outperforming" : "Underperforming"},{l:"Confidence",v:`${alert.confidence}%`,s:alert.confidence >= 90 ? "Very High" : alert.confidence >= 80 ? "High" : "Moderate"}].map(x=>(
                <div key={x.l} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}>
                  <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", margin: 0 }}>{x.l}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 2px" }}>{x.v}</p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{x.s}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="why-row">
            <h4 style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Why It's Alerting</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alert.whyAlerting.map((w,i)=>(
                <div key={i} className="why-bullet" style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}>
                  <span style={{ fontSize: 18, marginTop: 2 }}>{w.icon}</span>
                  <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{w.label}</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{w.text}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", margin: 0, display: "flex", alignItems: "center" }}>Support <Tooltip text="A price level where this stock has historically stopped falling." /></p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 0" }}>${alert.support.toFixed(2)}</p>
            </div>
            <div style={{ flex: 1, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", margin: 0, display: "flex", alignItems: "center" }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." /></p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "4px 0 0" }}>${alert.resistance.toFixed(2)}</p>
            </div>
          </div>
          <div className="btn-row" style={{ padding: 0 }}>
            <button className="btn-primary">Add to Watchlist</button>
            <button className="btn-secondary">Discuss in Chat</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== SMALL ALERT CARD (non-hero) =====
function AlertCard({ alert, onClick }) {
  const isPositive = alert.change >= 0;
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "16px 20px", cursor: "pointer", transition: "box-shadow .2s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.1)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.06)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{alert.ticker}</h4>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: "#f1f5f9", color: "#475569", fontSize: 10, fontWeight: 600 }}>
              {alert.scannerTag.toUpperCase()}
            </span>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.company}</p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>${alert.price.toFixed(2)}</p>
          <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: isPositive ? "#16a34a" : "#dc2626" }}>
            {isPositive ? "+" : ""}${Math.abs(alert.change).toFixed(2)} ({isPositive ? "+" : ""}{alert.changePercent}%)
          </p>
        </div>
      </div>
      {/* First "why" reason as a preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderRadius: 10, padding: "8px 12px" }}>
        <span style={{ fontSize: 14 }}>{alert.whyAlerting[0].icon}</span>
        <span style={{ fontSize: 13, color: "#475569" }}>
          <span><strong style={{ color: "#1e293b" }}>{alert.whyAlerting[0].label}</strong><br/><span style={{ fontSize: 12 }}>{alert.whyAlerting[0].text}</span></span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{alert.time} · Confidence <strong style={{ color: alert.confidence >= 90 ? "#16a34a" : alert.confidence >= 80 ? "#0f172a" : "#f59e0b" }}>{alert.confidence}%</strong></span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>View details →</span>
      </div>
    </div>
  );
}

// ===== MOOD BAR =====
function MoodBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>MOOD:</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>Fearful</span>
      <div style={{ width: 48, height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
        <div style={{ width: "34%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #ef4444, #f59e0b)" }}/>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>34</span>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function AlertsTab({ session, group }) {
  const [view, setView] = useState("loading");
  const [filter, setFilter] = useState("All");
  const [modalAlert, setModalAlert] = useState(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (view === "loading") { const t = setTimeout(() => setView("active"), 2000); return () => clearTimeout(t); }
  }, [view]);

  const filtered = filter === "All"
    ? mockAlerts
    : mockAlerts.filter(a => a.scannerTag === filterMap[filter]);

  const heroAlert = filtered.find(a => a.isAlertOfDay) || filtered[0];
  const otherAlerts = filtered.filter(a => a !== heroAlert);

  const card = { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", overflow: "visible" };

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
        .card-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin-bottom: 2px; }
        .mood-row { display: flex; align-items: center; gap: 6px; }
        .filter-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }

        @media (max-width: 480px) {
          .alerts-container {
            padding: 12px 8px;
            gap: 12px;
            max-width: 100% !important;
            width: 100% !important;
          }
          .hero-header {
            flex-direction: column;
            gap: 2px;
          }
          .hero-header > div:last-child {
            text-align: left;
            display: flex;
            align-items: baseline;
            gap: 8px;
          }
          .hero-ticker { font-size: 22px; }
          .hero-price { font-size: 22px; }
          .btn-row {
            flex-direction: column;
            gap: 8px;
            padding: 0 16px 16px;
          }
          .btn-row button {
            width: 100% !important;
            flex: none !important;
          }
          .stats-grid {
            padding: 0 16px 12px;
            gap: 6px;
          }
          .stats-cell p:last-child {
            font-size: 13px !important;
          }
          .mood-row {
            display: none;
          }
          .filter-row {
            padding: 0 0 4px;
          }
          .filter-row button {
            padding: 6px 12px !important;
            font-size: 11px !important;
          }
          .why-row {
            padding: 0 16px 12px !important;
          }
          .why-bullet {
            padding: 10px 12px !important;
          }
        }
      `}</style>

      {/* DEV TOGGLE */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#d97706", letterSpacing: "1px" }}>Dev</span>
        {["loading","active","empty"].map(s=>(
          <button key={s} onClick={()=>setView(s)} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: view===s ? "none" : "1px solid #fde68a", background: view===s ? "#f59e0b" : "#fff", color: view===s ? "#fff" : "#92400e", cursor: "pointer" }}>
            {s==="loading"?"Loading":s==="active"?"Alert Active":"No Alerts"}
          </button>
        ))}
      </div>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px" }}>Breakout Alerts</h2>
        <div className="mood-row"><MoodBar /></div>
      </div>

      {/* FILTERS */}
      <div className="filter-row">
        {filterKeys.map(f=>{
          const count = f === "All" ? mockAlerts.length : mockAlerts.filter(a => a.scannerTag === filterMap[f]).length;
          return (
            <button key={f} onClick={()=>setFilter(f)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: filter===f ? "none" : "1px solid #e2e8f0", background: filter===f ? "#1e293b" : "#fff", color: filter===f ? "#fff" : "#475569", cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 6 }}>
              {f}
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: filter===f ? "rgba(255,255,255,.2)" : "#f1f5f9", color: filter===f ? "#fff" : "#94a3b8" }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* STATES */}
      {view === "loading" && <><SkeletonCard /><SkeletonCard /></>}
      {view === "empty" && <NoAlerts />}
      {view === "active" && (
        <>
          {heroAlert && (
            <div>
              {heroAlert.isAlertOfDay && (
                <p style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>⭐ Alert of the Day</p>
              )}
              <div style={{ ...card, cursor: "pointer", transition: "box-shadow .2s" }} onClick={()=>setModalAlert(heroAlert)}>
                <div style={{ padding: "16px 16px 12px" }}>
                  <div className="hero-header">
                    <div>
                      <h3 className="hero-ticker">{heroAlert.ticker}</h3>
                      <p className="hero-company">{heroAlert.company}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="hero-price">${heroAlert.price.toFixed(2)}</p>
                      <p className="hero-change" style={{ color: heroAlert.change >= 0 ? "#16a34a" : "#dc2626" }}>
                        {heroAlert.change >= 0 ? "+" : ""}${Math.abs(heroAlert.change).toFixed(2)} ({heroAlert.change >= 0 ? "+" : ""}{heroAlert.changePercent}%)
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 16, background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 600, border: "1px solid #bbf7d0" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }}/> {heroAlert.scannerTag.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{heroAlert.time} pre-market</span>
                  </div>
                </div>

                <div className="why-row" style={{ padding: "0 16px 12px" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px" }}>Why It's Alerting</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {heroAlert.whyAlerting.map((w,i)=>(
                      <div key={i} className="why-bullet" style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f8fafc", borderRadius: 14, padding: "12px 16px" }}>
                        <span style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }}>{w.icon}</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{w.label}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{w.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stats-cell">
                    <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Support <Tooltip text="A price level where this stock has historically stopped falling." /></p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "2px 0 0" }}>${heroAlert.support.toFixed(2)}</p>
                  </div>
                  <div className="stats-cell">
                    <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>Resistance <Tooltip text="A price level where this stock has historically stopped rising." /></p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "2px 0 0" }}>${heroAlert.resistance.toFixed(2)}</p>
                  </div>
                  <div className="stats-cell">
                    <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Confidence</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#16a34a", margin: "2px 0 0" }}>{heroAlert.confidence}%</p>
                  </div>
                </div>

                <div className="btn-row">
                  <button className="btn-primary" onClick={e=>e.stopPropagation()}>Add to Watchlist</button>
                  <button className="btn-secondary" onClick={e=>e.stopPropagation()}>Discuss in Chat</button>
                </div>
              </div>
            </div>
          )}

          {/* OTHER ALERTS */}
          {otherAlerts.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <button
                onClick={() => setShowMore(!showMore)}
                style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    {filter === "All" ? "More Alerts" : `${filter} Alerts`}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f1f5f9", color: "#64748b" }}>
                    {otherAlerts.length}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: "#94a3b8", transition: "transform .2s", transform: showMore ? "rotate(180deg)" : "rotate(0deg)" }}>
                  ▾
                </span>
              </button>
              {showMore && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {otherAlerts.map(a => (
                    <AlertCard key={a.id} alert={a} onClick={() => setModalAlert(a)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>No {filter} alerts today</h3>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Try checking another category or check back later.</p>
            </div>
          )}

          {/* TRACK RECORD */}
          <div style={card}>
            <div style={{ padding: "16px 16px 12px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 16px" }}>Track Record</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[{l:"Hit Rate",v:`${mockTrack.hitRate}%`,c:"#1e293b"},{l:"Avg Return",v:`+${mockTrack.avgReturn}%`,c:"#16a34a"},{l:"Streak",v:mockTrack.streak,c:"#1e293b"}].map(x=>(
                  <div key={x.l} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", margin: 0 }}>{x.l}</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: x.c, margin: "4px 0 0" }}>{x.v}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {mockTrack.history.map((_,i)=>(<div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: "#334155", cursor: "pointer" }}/>))}
                </div>
                <Sparkline />
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{mockTrack.history.filter(h=>h.type==="hit").length} of {mockTrack.history.length} alerts were profitable</p>
            </div>
            <div style={{ borderTop: "1px solid #f1f5f9" }}>
              {mockTrack.history.map((h,i)=>(
                <div key={i} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderTop: i>0 ? "1px solid #f8fafc" : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}>{h.date}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{h.ticker}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.desc}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>${h.from} → ${h.to} next day</p>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: h.type==="hit" ? "#f0fdf4" : "#fef2f2", color: h.type==="hit" ? "#15803d" : "#dc2626" }}>
                    {h.type==="hit"?"Hit":"Miss"} {h.result>0?"+":""}{h.result}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MODAL */}
      {modalAlert && <Modal alert={modalAlert} onClose={()=>setModalAlert(null)} />}
    </div>
  );
}
