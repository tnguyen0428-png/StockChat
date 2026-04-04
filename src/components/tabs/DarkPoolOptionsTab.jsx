import { useState } from "react";

// ===== MOCK DATA =====
const mockDarkPool = [
  { id: 1, ticker: "TSLA", company: "Tesla Inc", price: 189.30, size: "2.4M", value: "$454M", sentiment: "bullish", time: "9:42 AM", premium: null, type: "block", exchange: "FINRA ADF", avgSize: "180K", sizeVsAvg: 13.3 },
  { id: 2, ticker: "AAPL", company: "Apple Inc", price: 218.45, size: "1.8M", value: "$393M", sentiment: "neutral", time: "9:38 AM", premium: null, type: "block", exchange: "FINRA ADF", avgSize: "220K", sizeVsAvg: 8.2 },
  { id: 3, ticker: "NVDA", company: "NVIDIA Corp", price: 891.15, size: "850K", value: "$758M", sentiment: "bullish", time: "9:35 AM", premium: null, type: "sweep", exchange: "BATS", avgSize: "95K", sizeVsAvg: 8.9 },
  { id: 4, ticker: "META", company: "Meta Platforms", price: 542.18, size: "620K", value: "$336M", sentiment: "bearish", time: "9:31 AM", premium: null, type: "block", exchange: "IEX", avgSize: "110K", sizeVsAvg: 5.6 },
  { id: 5, ticker: "AMZN", company: "Amazon.com", price: 198.72, size: "1.2M", value: "$238M", sentiment: "bullish", time: "9:28 AM", premium: null, type: "block", exchange: "FINRA ADF", avgSize: "300K", sizeVsAvg: 4.0 },
];

const mockOptions = [
  { id: 1, ticker: "TSLA", type: "CALL", strike: 200, expiry: "Apr 11", premium: "$4.85", volume: "42.3K", openInterest: "18.2K", iv: "68%", sentiment: "bullish", time: "9:44 AM", flow: "sweep", size: "$20.5M", unusual: true },
  { id: 2, ticker: "NVDA", type: "CALL", strike: 920, expiry: "Apr 18", premium: "$18.20", volume: "28.1K", openInterest: "5.4K", iv: "52%", sentiment: "bullish", time: "9:41 AM", flow: "block", size: "$51.2M", unusual: true },
  { id: 3, ticker: "SPY", type: "PUT", strike: 510, expiry: "Apr 11", premium: "$3.40", volume: "85.6K", openInterest: "42.1K", iv: "22%", sentiment: "bearish", time: "9:39 AM", flow: "sweep", size: "$29.1M", unusual: false },
  { id: 4, ticker: "AAPL", type: "CALL", strike: 225, expiry: "Apr 25", premium: "$2.95", volume: "35.8K", openInterest: "12.7K", iv: "31%", sentiment: "bullish", time: "9:36 AM", flow: "block", size: "$10.6M", unusual: true },
  { id: 5, ticker: "AMD", type: "PUT", strike: 155, expiry: "Apr 11", premium: "$2.10", volume: "22.4K", openInterest: "8.9K", iv: "58%", sentiment: "bearish", time: "9:33 AM", flow: "sweep", size: "$4.7M", unusual: false },
  { id: 6, ticker: "META", type: "CALL", strike: 560, expiry: "May 16", premium: "$22.50", volume: "15.2K", openInterest: "3.1K", iv: "45%", sentiment: "bullish", time: "9:30 AM", flow: "block", size: "$34.2M", unusual: true },
];

function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button onClick={(e) => { e.stopPropagation(); setShow(!show); }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, borderRadius: "50%", background: "#e2e8f0", color: "#64748b", border: "none", cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>i</button>
      {show && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8, width: 220, padding: "8px 12px", fontSize: 12, color: "#fff", background: "#1e293b", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.2)", zIndex: 99, lineHeight: 1.5 }}>{text}</div>
      )}
    </span>
  );
}

function SentimentDot({ sentiment }) {
  const colors = { bullish: "#16a34a", bearish: "#dc2626", neutral: "#f59e0b" };
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[sentiment], display: "inline-block", flexShrink: 0 }} />;
}

function SentimentBadge({ sentiment }) {
  const s = {
    bullish: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    bearish: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    neutral: { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  }[sentiment];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", border: `1px solid ${s.border}` }}>
      <SentimentDot sentiment={sentiment} /> {sentiment}
    </span>
  );
}

function FlowBadge({ type }) {
  const isSweep = type === "sweep";
  return (
    <span style={{ padding: "2px 8px", borderRadius: 10, background: isSweep ? "#eff6ff" : "#f8fafc", color: isSweep ? "#2563eb" : "#475569", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
      {isSweep ? "⚡ Sweep" : "📦 Block"}
    </span>
  );
}

function DarkPoolCard({ trade }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "14px 16px", cursor: "pointer", transition: "box-shadow .2s" }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{trade.ticker}</h4>
          <SentimentBadge sentiment={trade.sentiment} />
          <FlowBadge type={trade.type} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", flexShrink: 0, marginLeft: 8 }}>{trade.value}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{trade.size} shares @ ${trade.price.toFixed(2)}</p>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{trade.time}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Size vs Avg</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: trade.sizeVsAvg >= 5 ? "#16a34a" : "#0f172a", margin: "2px 0 0" }}>{trade.sizeVsAvg}x</p>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Avg Block</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{trade.avgSize}</p>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Exchange</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{trade.exchange}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsCard({ option }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = option.type === "CALL";
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${isCall ? "#bbf7d0" : "#fecaca"}`, borderLeft: `3px solid ${isCall ? "#16a34a" : "#dc2626"}`, padding: "14px 16px", cursor: "pointer", transition: "box-shadow .2s" }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{option.ticker}</h4>
          <span style={{ padding: "2px 8px", borderRadius: 8, background: isCall ? "#f0fdf4" : "#fef2f2", color: isCall ? "#15803d" : "#dc2626", fontSize: 11, fontWeight: 700 }}>{option.type}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>${option.strike}</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{option.expiry}</span>
          {option.unusual && <span style={{ padding: "2px 6px", borderRadius: 8, background: "#fef3c7", color: "#92400e", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>🔥 Unusual</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FlowBadge type={option.flow} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{option.size}</span>
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{option.time}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Premium</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{option.premium}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Volume</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{option.volume}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Open Int.</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{option.openInterest}</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Implied Vol.</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{option.iv}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Sentiment</p>
              <div style={{ margin: "4px 0 0" }}><SentimentBadge sentiment={option.sentiment} /></div>
            </div>
          </div>
          <div style={{ marginTop: 10, background: isCall ? "#f0fdf9" : "#fef2f2", borderRadius: 10, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              {isCall
                ? `Someone is betting ${option.size} that ${option.ticker} will be above $${option.strike} by ${option.expiry}. ${option.unusual ? "This is unusual activity — volume is much higher than open interest." : ""}`
                : `Someone is betting ${option.size} that ${option.ticker} will drop below $${option.strike} by ${option.expiry}. ${option.unusual ? "This is unusual activity — volume is much higher than open interest." : ""}`
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowSummary({ data }) {
  const bullish = data.filter(d => d.sentiment === "bullish").length;
  const bearish = data.filter(d => d.sentiment === "bearish").length;
  const total = data.length;
  const bullPct = Math.round((bullish / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#fecaca", overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${bullPct}%`, height: "100%", borderRadius: 4, background: "#22c55e", transition: "width .3s" }} />
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 11, flexShrink: 0 }}>
        <span style={{ color: "#16a34a", fontWeight: 700 }}>🟢 {bullish} Bullish</span>
        <span style={{ color: "#dc2626", fontWeight: 700 }}>🔴 {bearish} Bearish</span>
      </div>
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function DarkPoolOptionsTab({ session, group }) {
  const [activeTab, setActiveTab] = useState("darkpool");
  const [dpFilter, setDpFilter] = useState("all");
  const [optFilter, setOptFilter] = useState("all");

  const filteredDP = dpFilter === "all" ? mockDarkPool
    : mockDarkPool.filter(d => d.sentiment === dpFilter);

  const filteredOpt = optFilter === "all" ? mockOptions
    : optFilter === "unusual" ? mockOptions.filter(o => o.unusual)
    : optFilter === "calls" ? mockOptions.filter(o => o.type === "CALL")
    : mockOptions.filter(o => o.type === "PUT");

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        @media (max-width: 480px) {
          .dp-container { padding: 12px 8px !important; }
          .dp-tab-btn { padding: 10px 0 !important; font-size: 13px !important; }
        }
      `}</style>

      {/* Tab Toggle */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", display: "flex", overflow: "hidden" }}>
        {[
          { key: "darkpool", label: "🏦 Dark Pool", sub: "Institutional Trades" },
          { key: "options", label: "📋 Options Flow", sub: "Smart Money Bets" },
        ].map(tab => (
          <button key={tab.key} className="dp-tab-btn" onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: "12px 0", background: activeTab === tab.key ? "#1e293b" : "transparent", color: activeTab === tab.key ? "#fff" : "#64748b", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all .2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderRadius: activeTab === tab.key ? 12 : 0 }}>
            {tab.label}
            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{tab.sub}</span>
          </button>
        ))}
      </div>

      {/* DARK POOL TAB */}
      {activeTab === "darkpool" && (
        <>
          <div style={{ background: "#eff6ff", borderRadius: 14, padding: "14px 16px", border: "1px solid #bfdbfe" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#1e40af", lineHeight: 1.5 }}>
              <strong>What is this?</strong> Dark pool trades are large orders from institutions (hedge funds, banks) that happen off the regular exchange. Big block trades can signal where "smart money" is moving.
            </p>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "all", label: "All" },
              { key: "bullish", label: "🟢 Bullish" },
              { key: "bearish", label: "🔴 Bearish" },
            ].map(f => (
              <button key={f.key} onClick={() => setDpFilter(f.key)}
                style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: dpFilter === f.key ? "none" : "1px solid #e2e8f0", background: dpFilter === f.key ? "#1e293b" : "#fff", color: dpFilter === f.key ? "#fff" : "#475569", cursor: "pointer" }}>
                {f.label}
              </button>
            ))}
          </div>

          <FlowSummary data={mockDarkPool} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredDP.map(trade => <DarkPoolCard key={trade.id} trade={trade} />)}
          </div>
        </>
      )}

      {/* OPTIONS FLOW TAB */}
      {activeTab === "options" && (
        <>
          <div style={{ background: "#fefce8", borderRadius: 14, padding: "14px 16px", border: "1px solid #fde68a" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#854d0e", lineHeight: 1.5 }}>
              <strong>What is this?</strong> Options flow shows large bets traders are making on whether a stock will go up (Calls) or down (Puts). "Unusual" activity means someone is making a much bigger bet than normal — worth paying attention to.
            </p>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "All Flow" },
              { key: "unusual", label: "🔥 Unusual Only" },
              { key: "calls", label: "📈 Calls" },
              { key: "puts", label: "📉 Puts" },
            ].map(f => (
              <button key={f.key} onClick={() => setOptFilter(f.key)}
                style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: optFilter === f.key ? "none" : "1px solid #e2e8f0", background: optFilter === f.key ? "#1e293b" : "#fff", color: optFilter === f.key ? "#fff" : "#475569", cursor: "pointer" }}>
                {f.label}
              </button>
            ))}
          </div>

          <FlowSummary data={mockOptions} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredOpt.map(opt => <OptionsCard key={opt.id} option={opt} />)}
          </div>

          {filteredOpt.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>No matching options flow</h3>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Try a different filter to see more results.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
