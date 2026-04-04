import { useState } from "react";

// ===== MOCK DATA =====
const now = new Date();
const mins = (m) => new Date(now.getTime() - m * 60000);

const mockBigMoney = [
  { id: 1, ticker: "TSLA", company: "Tesla Inc", price: 189.30, shares: "2.4M", dollarValue: "$454M", direction: "buying", time: mins(2), multiplier: 13.3, note: "This is 13x the normal trade size — a major institution is loading up." },
  { id: 2, ticker: "NVDA", company: "NVIDIA Corp", price: 891.15, shares: "850K", dollarValue: "$758M", direction: "buying", time: mins(9), multiplier: 8.9, note: "Largest dark pool trade today. 9x normal size — likely a hedge fund." },
  { id: 3, ticker: "AAPL", company: "Apple Inc", price: 218.45, shares: "1.8M", dollarValue: "$393M", direction: "neutral", time: mins(6), multiplier: 8.2, note: "Big trade but direction unclear — could be a portfolio rebalance." },
  { id: 4, ticker: "META", company: "Meta Platforms", price: 542.18, shares: "620K", dollarValue: "$336M", direction: "selling", time: mins(13), multiplier: 5.6, note: "An institution appears to be reducing their META position." },
  { id: 5, ticker: "AMZN", company: "Amazon.com", price: 198.72, shares: "1.2M", dollarValue: "$238M", direction: "buying", time: mins(16), multiplier: 4.0, note: "Moderate-sized institutional buy. 4x normal trade size." },
];

const mockSmartBets = [
  { id: 1, ticker: "TSLA", company: "Tesla Inc", direction: "up", bet: "Above $200 by Apr 11", amount: "$20.5M", odds: "High risk", unusual: true, time: mins(1), detail: "Someone just bet $20.5M that Tesla will rise above $200 in the next week. This is unusual — volume is much higher than existing bets, suggesting a brand new large position.", premium: "$4.85", volume: "42.3K", openInterest: "18.2K", uncertainty: "High — bigger potential swings" },
  { id: 2, ticker: "NVDA", company: "NVIDIA Corp", direction: "up", bet: "Above $920 by Apr 18", amount: "$51.2M", odds: "Moderate risk", unusual: true, time: mins(4), detail: "The largest options bet today. $51.2M that NVIDIA goes above $920 in two weeks. Unusual volume signals a big player making a move.", premium: "$18.20", volume: "28.1K", openInterest: "5.4K", uncertainty: "Moderate — steady price range" },
  { id: 3, ticker: "SPY", company: "S&P 500 ETF", direction: "down", bet: "Below $510 by Apr 11", amount: "$29.1M", odds: "Lower risk", unusual: false, time: mins(7), detail: "A large bet that the overall market will dip below $510 this week. SPY puts are common hedging tools — this could be protection rather than a directional bet.", premium: "$3.40", volume: "85.6K", openInterest: "42.1K", uncertainty: "Low — market is relatively stable" },
  { id: 4, ticker: "AAPL", company: "Apple Inc", direction: "up", bet: "Above $225 by Apr 25", amount: "$10.6M", odds: "Moderate risk", unusual: true, time: mins(10), detail: "Unusual activity — someone bet $10.6M that Apple crosses $225 in three weeks. Volume far exceeds existing positions.", premium: "$2.95", volume: "35.8K", openInterest: "12.7K", uncertainty: "Moderate" },
  { id: 5, ticker: "AMD", company: "AMD Inc", direction: "down", bet: "Below $155 by Apr 11", amount: "$4.7M", odds: "Higher risk", unusual: false, time: mins(14), detail: "A bet that AMD drops below $155 this week. Higher implied volatility means the market expects bigger price swings.", premium: "$2.10", volume: "22.4K", openInterest: "8.9K", uncertainty: "High — expect volatility" },
  { id: 6, ticker: "META", company: "Meta Platforms", direction: "up", bet: "Above $560 by May 16", amount: "$34.2M", odds: "Moderate risk", unusual: true, time: mins(18), detail: "A longer-term bet of $34.2M that Meta rises above $560 by mid-May. Unusual activity with volume 5x higher than open interest.", premium: "$22.50", volume: "15.2K", openInterest: "3.1K", uncertainty: "Moderate" },
];

// Cross-reference
const spotlight = (() => {
  const dpTickers = new Map(mockBigMoney.map(d => [d.ticker, d]));
  const matches = mockSmartBets.filter(o => dpTickers.has(o.ticker) && o.direction === "up" && dpTickers.get(o.ticker).direction === "buying");
  if (matches.length === 0) return null;
  const best = matches.sort((a, b) => b.amount.replace(/[$M]/g, "") - a.amount.replace(/[$M]/g, ""))[0];
  const dp = dpTickers.get(best.ticker);
  return { ticker: best.ticker, company: best.company, dpValue: dp.dollarValue, dpMultiplier: dp.multiplier, betAmount: best.amount, betDescription: best.bet, unusual: best.unusual };
})();

// ===== HELPERS =====
function relTime(ts) {
  const d = Math.floor((now - ts) / 60000);
  if (d < 1) return "Just now";
  if (d === 1) return "1 min ago";
  if (d < 60) return `${d} min ago`;
  return `${Math.floor(d / 60)}h ago`;
}

function freshDotColor(ts) {
  const d = Math.floor((now - ts) / 60000);
  if (d <= 5) return "#22c55e";
  if (d <= 15) return "#f59e0b";
  return "#cbd5e1";
}

function cardOpacity(ts) {
  const d = Math.floor((now - ts) / 60000);
  return d > 15 ? 0.75 : 1;
}

// ===== COMPONENTS =====
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

// ===== SPOTLIGHT HERO =====
function SpotlightHero({ data }) {
  if (!data) return null;
  return (
    <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0fdf4 100%)", borderRadius: 16, border: "2px solid #22c55e", padding: "18px 18px 16px", boxShadow: "0 0 24px rgba(34,197,94,.1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>🎯</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.5px" }}>Smart Money Spotlight</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{data.ticker}</h3>
        <span style={{ padding: "3px 10px", borderRadius: 10, background: "#22c55e", color: "#fff", fontSize: 11, fontWeight: 700 }}>Both Signals Bullish</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b" }}>{data.company}</p>
      <div style={{ background: "rgba(255,255,255,.8)", borderRadius: 12, padding: "12px 14px", marginBottom: 0 }}>
        <p style={{ margin: 0, fontSize: 14, color: "#1e293b", lineHeight: 1.6 }}>
          Institutions quietly bought <strong>{data.dpValue}</strong> in large block trades ({data.dpMultiplier}x normal size)
          <strong> AND </strong>
          someone placed a <strong>{data.betAmount}</strong> bet that {data.ticker} goes {data.betDescription.toLowerCase()}.
          {data.unusual && " This options activity is flagged as unusual."}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#15803d", fontWeight: 600 }}>
          👉 When big money buys stock AND bets it goes higher, that's a strong bullish signal.
        </p>
      </div>
    </div>
  );
}

// ===== SUMMARY ROW =====
function SummaryRow({ tab }) {
  const buyCount = mockBigMoney.filter(d => d.direction === "buying").length;
  const upCount = mockSmartBets.filter(o => o.direction === "up").length;
  const downCount = mockSmartBets.filter(o => o.direction === "down").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {tab === "bigmoney" ? (
        <>
          <StatBox label="Total Traded" value="$2.2B" />
          <StatBox label="Buying" value={`${buyCount} of ${mockBigMoney.length}`} valueColor="#16a34a" />
          <StatBox label="Biggest" value="NVDA" sub="$758M" />
        </>
      ) : (
        <>
          <StatBox label="Total Bets" value="$150M" />
          <StatBox label="Betting Up" value={`${upCount}`} valueColor="#16a34a" sub={`vs ${downCount} down`} />
          <StatBox label="Unusual" value={`${mockSmartBets.filter(o => o.unusual).length}`} valueColor="#d97706" sub="worth watching" />
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, valueColor, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "10px 8px", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: valueColor || "#0f172a" }}>{value}</p>
      {sub && <p style={{ margin: "1px 0 0", fontSize: 10, color: "#94a3b8" }}>{sub}</p>}
    </div>
  );
}

// ===== BIG MONEY CARD =====
function BigMoneyCard({ trade }) {
  const [expanded, setExpanded] = useState(false);
  const dirColors = { buying: { bg: "#f0fdf4", border: "#22c55e", icon: "↑", label: "Buying", color: "#15803d" }, selling: { bg: "#fef2f2", border: "#ef4444", icon: "↓", label: "Selling", color: "#dc2626" }, neutral: { bg: "#fffbeb", border: "#f59e0b", icon: "→", label: "Unclear", color: "#d97706" } };
  const dc = dirColors[trade.direction];
  const thick = trade.multiplier >= 8 ? 4 : trade.multiplier >= 5 ? 3 : 2;

  return (
    <div onClick={() => setExpanded(!expanded)}
      style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", borderLeft: `${thick}px solid ${dc.border}`, padding: "14px 16px", cursor: "pointer", transition: "all .2s", opacity: cardOpacity(trade.time) }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>

      {/* Row 1: Ticker + Direction + Value */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: dc.color }}>{dc.icon}</div>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{trade.ticker}</h4>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{trade.company}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{trade.dollarValue}</p>
          <span style={{ fontSize: 10, fontWeight: 600, color: dc.color, textTransform: "uppercase" }}>{dc.label}</span>
        </div>
      </div>

      {/* Row 2: Quick info */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{trade.shares} shares · ${trade.price.toFixed(2)}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: freshDotColor(trade.time), display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{relTime(trade.time)}</span>
        </div>
      </div>

      {/* Size warning */}
      {trade.multiplier >= 8 && !expanded && (
        <div style={{ marginTop: 8, background: "#fffbeb", borderRadius: 8, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11 }}>⚠️</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#92400e" }}>{trade.multiplier}x bigger than normal</span>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Trade Size</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: trade.multiplier >= 5 ? "#16a34a" : "#0f172a", margin: "2px 0 0" }}>{trade.multiplier}x normal</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Direction</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: dc.color, margin: "2px 0 0" }}>{dc.label}</p>
            </div>
          </div>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>💡 What this means:</p>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{trade.note}</p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{expanded ? "Less ▴" : "More ▾"}</span>
      </div>
    </div>
  );
}

// ===== SMART BETS CARD =====
function SmartBetCard({ bet }) {
  const [expanded, setExpanded] = useState(false);
  const isUp = bet.direction === "up";
  const dc = isUp
    ? { bg: "#f0fdf4", border: "#22c55e", icon: "📈", label: "Betting stock goes UP", color: "#15803d" }
    : { bg: "#fef2f2", border: "#ef4444", icon: "📉", label: "Betting stock goes DOWN", color: "#dc2626" };
  const thick = parseFloat(bet.amount.replace(/[$M]/g, "")) >= 20 ? 4 : 3;

  return (
    <div onClick={() => setExpanded(!expanded)}
      style={{ background: "#fff", borderRadius: 14, border: `1px solid ${isUp ? "#d1fae5" : "#fecaca"}`, borderLeft: `${thick}px solid ${dc.border}`, padding: "14px 16px", cursor: "pointer", transition: "all .2s", opacity: cardOpacity(bet.time) }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>

      {/* Row 1 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{dc.icon}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{bet.ticker}</h4>
              {bet.unusual && <span style={{ padding: "2px 6px", borderRadius: 8, background: "#fef3c7", color: "#92400e", fontSize: 9, fontWeight: 700 }}>🔥 UNUSUAL</span>}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{bet.company}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{bet.amount}</p>
        </div>
      </div>

      {/* Row 2: The bet in plain English */}
      <div style={{ background: dc.bg, borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 13, color: dc.color, fontWeight: 600 }}>
          {dc.label}: {bet.bet}
        </p>
      </div>

      {/* Row 3: Meta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{bet.odds}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: freshDotColor(bet.time), display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{relTime(bet.time)}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>
                Cost Per Bet
                <Tooltip text="The price someone paid for each contract. Higher = more conviction." />
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.premium}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>
                Today's Bets
                <Tooltip text="How many of these contracts traded today." />
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.volume}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>
                Existing Bets
                <Tooltip text="How many of these contracts were already open. High volume vs. low existing = unusual." />
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.openInterest}</p>
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>
              Uncertainty Level
              <Tooltip text="Higher uncertainty = bigger potential gains AND losses. The market expects this stock to swing more." />
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "#475569" }}>{bet.uncertainty}</p>
          </div>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>💡 What this means:</p>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{bet.detail}</p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{expanded ? "Less ▴" : "More ▾"}</span>
      </div>
    </div>
  );
}

// ===== EXPLAINER BANNER =====
function ExplainerBanner({ type, onDismiss }) {
  const c = type === "bigmoney"
    ? { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", text: "These are large trades made by institutions (hedge funds, banks) away from regular exchanges. When big players buy or sell in bulk, it can hint at where a stock is heading." }
    : { bg: "#fefce8", border: "#fde68a", color: "#854d0e", text: "These are large bets on whether a stock will go up or down by a specific date. \"Unusual\" means someone is betting way more than normal — that's often worth watching." };
  return (
    <div style={{ background: c.bg, borderRadius: 12, padding: "10px 14px", border: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12, color: c.color, lineHeight: 1.5 }}>{c.text}</p>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: c.color, opacity: 0.5, cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0, marginTop: -2 }}>✕</button>
    </div>
  );
}

// ===== MAIN =====
export default function DarkPoolOptionsTab({ session, group }) {
  const [tab, setTab] = useState("bigmoney");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("time");
  const [showExplainer, setShowExplainer] = useState({ bigmoney: true, smartbets: true });

  const filteredBM = (filter === "all" ? mockBigMoney : mockBigMoney.filter(d => d.direction === filter))
    .sort((a, b) => sort === "time" ? b.time - a.time : parseFloat(b.dollarValue.replace(/[$MBK]/g, "")) - parseFloat(a.dollarValue.replace(/[$MBK]/g, "")));

  const filteredSB = (filter === "all" ? mockSmartBets
    : filter === "unusual" ? mockSmartBets.filter(o => o.unusual)
    : filter === "up" ? mockSmartBets.filter(o => o.direction === "up")
    : mockSmartBets.filter(o => o.direction === "down"))
    .sort((a, b) => sort === "time" ? b.time - a.time : parseFloat(b.amount.replace(/[$M]/g, "")) - parseFloat(a.amount.replace(/[$M]/g, "")));

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @media (max-width: 480px) {
          .flow-main { padding: 12px 8px !important; gap: 12px !important; max-width: 100% !important; }
        }
      `}</style>

      {/* Tab Toggle */}
      <div style={{ background: "#f1f5f9", borderRadius: 14, padding: 4, display: "flex", gap: 4 }}>
        {[
          { key: "bigmoney", label: "🏦 Big Money Trades" },
          { key: "smartbets", label: "🎯 Smart Bets" },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setFilter("all"); }}
            style={{ flex: 1, padding: "12px 8px", borderRadius: 11, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", transition: "all .2s", background: tab === t.key ? "#fff" : "transparent", color: tab === t.key ? "#0f172a" : "#64748b", boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Spotlight — only when relevant */}
      {spotlight && <SpotlightHero data={spotlight} />}

      {/* Summary */}
      <SummaryRow tab={tab} />

      {/* Sort + Count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>
          {tab === "bigmoney" ? `${filteredBM.length} trades` : `${filteredSB.length} bets`}
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ k: "time", l: "Newest" }, { k: "size", l: "Largest" }].map(s => (
            <button key={s.k} onClick={() => setSort(s.k)}
              style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: sort === s.k ? "none" : "1px solid #e2e8f0", background: sort === s.k ? "#1e293b" : "#fff", color: sort === s.k ? "#fff" : "#64748b", cursor: "pointer" }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* ===== BIG MONEY TAB ===== */}
      {tab === "bigmoney" && (
        <>
          {showExplainer.bigmoney && <ExplainerBanner type="bigmoney" onDismiss={() => setShowExplainer(p => ({ ...p, bigmoney: false }))} />}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ k: "all", l: "All" }, { k: "buying", l: "↑ Buying" }, { k: "selling", l: "↓ Selling" }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: filter === f.k ? "none" : "1px solid #e2e8f0", background: filter === f.k ? "#1e293b" : "#fff", color: filter === f.k ? "#fff" : "#475569", cursor: "pointer" }}>
                {f.l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredBM.map(t => <BigMoneyCard key={t.id} trade={t} />)}
            {filteredBM.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
                <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>No {filter} trades found. Try another filter.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== SMART BETS TAB ===== */}
      {tab === "smartbets" && (
        <>
          {showExplainer.smartbets && <ExplainerBanner type="smartbets" onDismiss={() => setShowExplainer(p => ({ ...p, smartbets: false }))} />}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ k: "all", l: "All" }, { k: "unusual", l: "🔥 Unusual" }, { k: "up", l: "📈 Betting Up" }, { k: "down", l: "📉 Betting Down" }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: filter === f.k ? "none" : "1px solid #e2e8f0", background: filter === f.k ? "#1e293b" : "#fff", color: filter === f.k ? "#fff" : "#475569", cursor: "pointer" }}>
                {f.l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredSB.map(b => <SmartBetCard key={b.id} bet={b} />)}
            {filteredSB.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
                <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>No matching bets. Try another filter.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
