import { useState, useEffect } from "react";

// ===== MOCK DATA =====
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
  { id: "sb1", ticker: "TSLA", company: "Tesla Inc", direction: "up", bet: "Above $200 by Apr 11", amount: "$20.5M", rawSize: 20.5e6, odds: "High risk", unusual: true, time: mins(1), detail: "Someone just bet $20.5M that Tesla will rise above $200 in the next week. This is unusual — volume is much higher than existing bets, suggesting a brand new large position.", premium: "$4.85", volume: "42.3K", openInterest: "18.2K", uncertainty: "High — bigger potential swings" },
  { id: "sb2", ticker: "NVDA", company: "NVIDIA Corp", direction: "up", bet: "Above $920 by Apr 18", amount: "$51.2M", rawSize: 51.2e6, odds: "Moderate risk", unusual: true, time: mins(4), detail: "The largest options bet today. $51.2M that NVIDIA goes above $920 in two weeks. Unusual volume signals a big player making a move.", premium: "$18.20", volume: "28.1K", openInterest: "5.4K", uncertainty: "Moderate — steady price range" },
  { id: "sb3", ticker: "SPY", company: "S&P 500 ETF", direction: "down", bet: "Below $510 by Apr 11", amount: "$29.1M", rawSize: 29.1e6, odds: "Lower risk", unusual: false, time: mins(7), detail: "A large bet that the overall market will dip below $510 this week. SPY puts are common hedging tools — this could be protection rather than a directional bet.", premium: "$3.40", volume: "85.6K", openInterest: "42.1K", uncertainty: "Low — market is relatively stable" },
  { id: "sb4", ticker: "AAPL", company: "Apple Inc", direction: "up", bet: "Above $225 by Apr 25", amount: "$10.6M", rawSize: 10.6e6, odds: "Moderate risk", unusual: true, time: mins(10), detail: "Unusual activity — someone bet $10.6M that Apple crosses $225 in three weeks. Volume far exceeds existing positions.", premium: "$2.95", volume: "35.8K", openInterest: "12.7K", uncertainty: "Moderate" },
  { id: "sb5", ticker: "AMD", company: "AMD Inc", direction: "down", bet: "Below $155 by Apr 11", amount: "$4.7M", rawSize: 4.7e6, odds: "Higher risk", unusual: false, time: mins(14), detail: "A bet that AMD drops below $155 this week. Higher implied volatility means the market expects bigger price swings.", premium: "$2.10", volume: "22.4K", openInterest: "8.9K", uncertainty: "High — expect volatility" },
  { id: "sb6", ticker: "META", company: "Meta Platforms", direction: "up", bet: "Above $560 by May 16", amount: "$34.2M", rawSize: 34.2e6, odds: "Moderate risk", unusual: true, time: mins(18), detail: "A longer-term bet of $34.2M that Meta rises above $560 by mid-May. Unusual activity with volume 5x higher than open interest.", premium: "$22.50", volume: "15.2K", openInterest: "3.1K", uncertainty: "Moderate" },
];

// Cross-reference helpers
const bmByTicker = new Map(mockBigMoney.map(d => [d.ticker, d]));
const sbByTicker = new Map();
mockSmartBets.forEach(s => { if (!sbByTicker.has(s.ticker)) sbByTicker.set(s.ticker, s); });

// Spotlight
const spotlight = (() => {
  const matches = mockSmartBets.filter(o => bmByTicker.has(o.ticker) && o.direction === "up" && bmByTicker.get(o.ticker).direction === "buying");
  if (matches.length === 0) return null;
  const best = matches.sort((a, b) => b.rawSize - a.rawSize)[0];
  const dp = bmByTicker.get(best.ticker);
  return { ticker: best.ticker, company: best.company, dpValue: dp.dollarValue, dpMultiplier: dp.multiplier, betAmount: best.amount, betDescription: best.bet, unusual: best.unusual };
})();

// Ticker activity counts (across both datasets)
const tickerActivity = {};
mockBigMoney.forEach(d => { tickerActivity[d.ticker] = (tickerActivity[d.ticker] || 0) + 1; });
mockSmartBets.forEach(s => { tickerActivity[s.ticker] = (tickerActivity[s.ticker] || 0) + 1; });
const tickerList = Object.entries(tickerActivity).sort((a, b) => b[1] - a[1]);

// Confidence calculations
function bmConfidence(trade) {
  let dots = 1;
  if (trade.multiplier >= 5) dots++;
  if (trade.multiplier >= 8) dots++;
  if (trade.multiplier >= 12) dots++;
  const sbMatch = sbByTicker.get(trade.ticker);
  if (sbMatch && ((trade.direction === "buying" && sbMatch.direction === "up") || (trade.direction === "selling" && sbMatch.direction === "down"))) dots++;
  return Math.min(dots, 5);
}

function sbConfidence(bet) {
  let dots = 1;
  if (bet.unusual) dots++;
  if (bet.rawSize >= 20e6) dots++;
  if (bet.rawSize >= 40e6) dots++;
  const bmMatch = bmByTicker.get(bet.ticker);
  if (bmMatch && ((bet.direction === "up" && bmMatch.direction === "buying") || (bet.direction === "down" && bmMatch.direction === "selling"))) dots++;
  return Math.min(dots, 5);
}

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
function isRecent(ts) {
  return (now - ts) / 60000 <= 15;
}

// ===== SMALL COMPONENTS =====
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

function ConfidenceDots({ count }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i <= count ? "#22c55e" : "#e2e8f0", display: "inline-block" }} />
      ))}
    </div>
  );
}

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
      <div style={{ background: "rgba(255,255,255,.8)", borderRadius: 12, padding: "12px 14px" }}>
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

function ExplainerBanner({ type, onDismiss }) {
  const c = type === "bigmoney"
    ? { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", text: "These are large trades made by institutions (hedge funds, banks) away from regular exchanges. When big players buy or sell in bulk, it can hint at where a stock is heading." }
    : { bg: "#fefce8", border: "#fde68a", color: "#854d0e", text: "These are large bets on whether a stock will go up or down by a specific date. \"Unusual\" means someone is betting way more than normal — that's often worth watching." };
  return (
    <div style={{ background: c.bg, borderRadius: 12, padding: "10px 14px", border: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 12, color: c.color, lineHeight: 1.5 }}>{c.text}</p></div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: c.color, opacity: 0.5, cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0, marginTop: -2 }}>✕</button>
    </div>
  );
}

// ===== BIG MONEY CARD =====
function BigMoneyCard({ trade, isExpanded, onToggle, isWatched, onWatch }) {
  const dirColors = { buying: { bg: "#f0fdf4", border: "#22c55e", icon: "↑", label: "Buying", color: "#15803d" }, selling: { bg: "#fef2f2", border: "#ef4444", icon: "↓", label: "Selling", color: "#dc2626" }, neutral: { bg: "#fffbeb", border: "#f59e0b", icon: "→", label: "Unclear", color: "#d97706" } };
  const dc = dirColors[trade.direction];
  const thick = trade.multiplier >= 8 ? 4 : trade.multiplier >= 5 ? 3 : 2;
  const dots = bmConfidence(trade);

  return (
    <div onClick={onToggle}
      style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", borderLeft: `${thick}px solid ${dc.border}`, padding: "14px 16px", cursor: "pointer", transition: "all .2s", opacity: cardOpacity(trade.time) }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: dc.color }}>{dc.icon}</div>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{trade.ticker}</h4>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{trade.company}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ConfidenceDots count={dots} />
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{trade.dollarValue}</p>
            <span style={{ fontSize: 10, fontWeight: 600, color: dc.color, textTransform: "uppercase" }}>{dc.label}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{trade.shares} shares · ${trade.price.toFixed(2)}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: freshDotColor(trade.time), display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{relTime(trade.time)}</span>
        </div>
      </div>
      {trade.multiplier >= 8 && !isExpanded && (
        <div style={{ marginTop: 8, background: "#fffbeb", borderRadius: 8, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11 }}>⚠️</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#92400e" }}>{trade.multiplier}x bigger than normal</span>
        </div>
      )}
      {isExpanded && (
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
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 6 }}>
        <button onClick={e => { e.stopPropagation(); onWatch(trade.ticker); }}
          style={{ fontSize: 11, fontWeight: 600, color: isWatched ? "#64748b" : "#16a34a", background: isWatched ? "#f1f5f9" : "#f0fdf4", border: `1px solid ${isWatched ? "#e2e8f0" : "#bbf7d0"}`, borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}>
          {isWatched ? "✓ Watching" : "+ Watch"}
        </button>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{isExpanded ? "Less ▴" : "More ▾"}</span>
      </div>
    </div>
  );
}

// ===== SMART BETS CARD =====
function SmartBetCard({ bet, isExpanded, onToggle, isWatched, onWatch }) {
  const isUp = bet.direction === "up";
  const dc = isUp
    ? { bg: "#f0fdf4", border: "#22c55e", icon: "📈", label: "Betting stock goes UP", color: "#15803d" }
    : { bg: "#fef2f2", border: "#ef4444", icon: "📉", label: "Betting stock goes DOWN", color: "#dc2626" };
  const thick = bet.rawSize >= 20e6 ? 4 : 3;
  const dots = sbConfidence(bet);

  return (
    <div onClick={onToggle}
      style={{ background: "#fff", borderRadius: 14, border: `1px solid ${isUp ? "#d1fae5" : "#fecaca"}`, borderLeft: `${thick}px solid ${dc.border}`, padding: "14px 16px", cursor: "pointer", transition: "all .2s", opacity: cardOpacity(bet.time) }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ConfidenceDots count={dots} />
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{bet.amount}</p>
        </div>
      </div>
      <div style={{ background: dc.bg, borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 13, color: dc.color, fontWeight: 600 }}>{dc.label}: {bet.bet}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{bet.odds}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: freshDotColor(bet.time), display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{relTime(bet.time)}</span>
        </div>
      </div>
      {isExpanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Cost Per Bet<Tooltip text="The price someone paid for each contract. Higher = more conviction." /></p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.premium}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Today's Bets<Tooltip text="How many of these contracts traded today." /></p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.volume}</p>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>Existing Bets<Tooltip text="How many of these contracts were already open." /></p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>{bet.openInterest}</p>
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>Uncertainty Level<Tooltip text="Higher uncertainty = bigger potential gains AND losses." /></p>
            <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "#475569" }}>{bet.uncertainty}</p>
          </div>
          <div style={{ background: dc.bg, borderRadius: 10, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>💡 What this means:</p>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{bet.detail}</p>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 6 }}>
        <button onClick={e => { e.stopPropagation(); onWatch(bet.ticker); }}
          style={{ fontSize: 11, fontWeight: 600, color: isWatched ? "#64748b" : "#16a34a", background: isWatched ? "#f1f5f9" : "#f0fdf4", border: `1px solid ${isWatched ? "#e2e8f0" : "#bbf7d0"}`, borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}>
          {isWatched ? "✓ Watching" : "+ Watch"}
        </button>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{isExpanded ? "Less ▴" : "More ▾"}</span>
      </div>
    </div>
  );
}

// ===== MAIN =====
export default function DarkPoolOptionsTab({ session, group }) {
  const [tab, setTab] = useState("bigmoney");
  const [filter, setFilter] = useState("recent");
  const [sort, setSort] = useState("time");
  const [showExplainer, setShowExplainer] = useState({ bigmoney: true, smartbets: true });
  const [expandedId, setExpandedId] = useState(null);
  const [watched, setWatched] = useState(new Set());
  const [tickerFilter, setTickerFilter] = useState(null);

  const toggleWatch = (ticker) => {
    setWatched(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });
  };

  // Filter + sort Big Money
  let filteredBM = mockBigMoney;
  if (tickerFilter) filteredBM = filteredBM.filter(d => d.ticker === tickerFilter);
  if (filter === "recent") filteredBM = filteredBM.filter(d => isRecent(d.time));
  else if (filter !== "all") filteredBM = filteredBM.filter(d => d.direction === filter);

  if (sort === "size") filteredBM = [...filteredBM].sort((a, b) => b.rawDollar - a.rawDollar);
  else if (sort === "ticker") filteredBM = [...filteredBM].sort((a, b) => a.ticker.localeCompare(b.ticker) || b.rawDollar - a.rawDollar);
  else filteredBM = [...filteredBM].sort((a, b) => b.time - a.time);

  // Filter + sort Smart Bets
  let filteredSB = mockSmartBets;
  if (tickerFilter) filteredSB = filteredSB.filter(s => s.ticker === tickerFilter);
  if (filter === "recent") filteredSB = filteredSB.filter(s => isRecent(s.time));
  else if (filter === "unusual") filteredSB = filteredSB.filter(o => o.unusual);
  else if (filter === "up") filteredSB = filteredSB.filter(o => o.direction === "up");
  else if (filter === "down") filteredSB = filteredSB.filter(o => o.direction === "down");

  if (sort === "size") filteredSB = [...filteredSB].sort((a, b) => b.rawSize - a.rawSize);
  else if (sort === "ticker") filteredSB = [...filteredSB].sort((a, b) => a.ticker.localeCompare(b.ticker) || b.rawSize - a.rawSize);
  else filteredSB = [...filteredSB].sort((a, b) => b.time - a.time);

  const currentList = tab === "bigmoney" ? filteredBM : filteredSB;
  const recentBMCount = mockBigMoney.filter(d => (!tickerFilter || d.ticker === tickerFilter) && isRecent(d.time)).length;
  const recentSBCount = mockSmartBets.filter(s => (!tickerFilter || s.ticker === tickerFilter) && isRecent(s.time)).length;
  const recentCount = tab === "bigmoney" ? recentBMCount : recentSBCount;

  // Auto-expand first card when filter/sort/tab changes
  useEffect(() => {
    const list = tab === "bigmoney" ? filteredBM : filteredSB;
    setExpandedId(list.length > 0 ? list[0].id : null);
  }, [tab, filter, sort, tickerFilter]);

  // Group by ticker for "ticker" sort
  const tickerGroups = sort === "ticker" ? (() => {
    const groups = {};
    currentList.forEach(item => {
      if (!groups[item.ticker]) groups[item.ticker] = { items: [], totalDollar: 0 };
      groups[item.ticker].items.push(item);
      groups[item.ticker].totalDollar += (item.rawDollar || item.rawSize || 0);
    });
    const otherTab = tab === "bigmoney" ? mockSmartBets : mockBigMoney;
    return Object.entries(groups)
      .sort((a, b) => b[1].totalDollar - a[1].totalDollar)
      .map(([ticker, g]) => {
        const crossMatch = otherTab.some(x => x.ticker === ticker &&
          ((tab === "bigmoney" && x.direction === "up" && mockBigMoney.find(b => b.ticker === ticker)?.direction === "buying") ||
           (tab === "smartbets" && x.direction === "buying" && mockSmartBets.find(s => s.ticker === ticker)?.direction === "up")));
        return { ticker, ...g, crossMatch, otherTabName: tab === "bigmoney" ? "Smart Bets" : "Big Money" };
      });
  })() : null;

  const bmFilters = [{ k: "recent", l: "⚡ Recent" }, { k: "all", l: "All" }, { k: "buying", l: "↑ Buying" }, { k: "selling", l: "↓ Selling" }];
  const sbFilters = [{ k: "recent", l: "⚡ Recent" }, { k: "all", l: "All" }, { k: "unusual", l: "🔥 Unusual" }, { k: "up", l: "📈 Betting Up" }, { k: "down", l: "📉 Betting Down" }];
  const activeFilters = tab === "bigmoney" ? bmFilters : sbFilters;

  return (
    <div className="flow-main" style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @media (max-width: 480px) { .flow-main { padding: 12px 8px !important; gap: 12px !important; max-width: 100% !important; } }
      `}</style>

      {/* Tab Toggle */}
      <div style={{ background: "#f1f5f9", borderRadius: 14, padding: 4, display: "flex", gap: 4 }}>
        {[{ key: "bigmoney", label: "🏦 Big Money Trades" }, { key: "smartbets", label: "🎯 Smart Bets" }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setFilter("recent"); setSort("time"); setTickerFilter(null); }}
            style={{ flex: 1, padding: "12px 8px", borderRadius: 11, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", transition: "all .2s", background: tab === t.key ? "#fff" : "transparent", color: tab === t.key ? "#0f172a" : "#64748b", boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Ticker Heat Bar */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {tickerList.map(([ticker, count]) => {
          const isActive = tickerFilter === ticker;
          const extraPad = count >= 3 ? 4 : count >= 2 ? 2 : 0;
          return (
            <button key={ticker} onClick={() => setTickerFilter(isActive ? null : ticker)}
              style={{ flexShrink: 0, padding: `4px ${12 + extraPad}px`, borderRadius: 20, fontSize: 12, fontWeight: isActive || count >= 3 ? 700 : 600, border: isActive ? "none" : "1px solid #e2e8f0", background: isActive ? "#1e293b" : "#f1f5f9", color: isActive ? "#fff" : "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {ticker}
              <span style={{ fontSize: 10, opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {spotlight && <SpotlightHero data={spotlight} />}
      <SummaryRow tab={tab} />

      {/* Sort + Count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>
          {currentList.length} {tab === "bigmoney" ? "trades" : "bets"}
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ k: "time", l: "Newest" }, { k: "size", l: "Largest" }, { k: "ticker", l: "By Ticker" }].map(s => (
            <button key={s.k} onClick={() => setSort(s.k)}
              style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: sort === s.k ? "none" : "1px solid #e2e8f0", background: sort === s.k ? "#1e293b" : "#fff", color: sort === s.k ? "#fff" : "#64748b", cursor: "pointer" }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* Explainer */}
      {showExplainer[tab] && <ExplainerBanner type={tab} onDismiss={() => setShowExplainer(p => ({ ...p, [tab]: false }))} />}

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {activeFilters.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: filter === f.k ? "none" : "1px solid #e2e8f0", background: filter === f.k ? "#1e293b" : "#fff", color: filter === f.k ? "#fff" : "#475569", cursor: "pointer" }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* "Recent" empty state with fallback */}
      {filter === "recent" && currentList.length === 0 && recentCount === 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 16px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No trades in the last 15 min</p>
          <button onClick={() => setFilter("all")} style={{ marginTop: 8, padding: "6px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: "#1e293b", color: "#fff", border: "none", cursor: "pointer" }}>Show all trades</button>
        </div>
      )}

      {/* Cards — grouped or flat */}
      {sort === "ticker" && tickerGroups ? (
        tickerGroups.map(g => (
          <div key={g.ticker}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 4px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{g.ticker} — {g.items.length} signal{g.items.length > 1 ? "s" : ""}</span>
              {g.crossMatch && <span style={{ fontSize: 10, color: "#16a34a" }}>🎯 Also in {g.otherTabName}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.items.map(item => tab === "bigmoney"
                ? <BigMoneyCard key={item.id} trade={item} isExpanded={expandedId === item.id} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} isWatched={watched.has(item.ticker)} onWatch={toggleWatch} />
                : <SmartBetCard key={item.id} bet={item} isExpanded={expandedId === item.id} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} isWatched={watched.has(item.ticker)} onWatch={toggleWatch} />
              )}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "bigmoney"
            ? filteredBM.map(t => <BigMoneyCard key={t.id} trade={t} isExpanded={expandedId === t.id} onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)} isWatched={watched.has(t.ticker)} onWatch={toggleWatch} />)
            : filteredSB.map(b => <SmartBetCard key={b.id} bet={b} isExpanded={expandedId === b.id} onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)} isWatched={watched.has(b.ticker)} onWatch={toggleWatch} />)
          }
          {currentList.length === 0 && filter !== "recent" && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
              <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>No matching {tab === "bigmoney" ? "trades" : "bets"}. Try another filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
