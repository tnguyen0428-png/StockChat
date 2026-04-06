// ============================================
// UPTIKALERTS — AlertsDemoPage.jsx
// Standalone alerts dashboard demo — /alerts-demo
// All mock data, Tailwind CSS, beginner-friendly UI
// ============================================

import { useState, useEffect } from 'react';

// ── Mock Data ───────────────────────────────────────────────────────

const MOCK_ALERT = {
  ticker: 'NVDA',
  name: 'Nvidia Corp',
  price: 192.45,
  change: 9.36,
  changePct: 5.1,
  support: 178.20,
  resistance: 198.50,
  confidence: 91,
  signal: 'gap_up',
  reasons: [
    { icon: '🟢', label: 'Price Jumped', text: 'Opened $9.36 higher than yesterday' },
    { icon: '📊', label: 'High Activity', text: '6x more people are trading this today' },
    { icon: '✅', label: 'Strong Setup', text: 'Technical indicators look positive' },
  ],
};

const MOCK_HISTORY = [
  { ticker: 'TSLA', date: 'Apr 2', result: +3.2 },
  { ticker: 'NVDA', date: 'Apr 1', result: +1.8 },
  { ticker: 'PLTR', date: 'Mar 31', result: -0.4 },
  { ticker: 'SMCI', date: 'Mar 28', result: +2.7 },
  { ticker: 'AAPL', date: 'Mar 27', result: +0.6 },
  { ticker: 'AMD', date: 'Mar 26', result: -1.1 },
];

const FILTER_CHIPS = [
  { id: 'trend', label: 'Trend Change' },
  { id: 'yearly', label: 'Yearly High' },
  { id: 'volume', label: 'Volume Spike' },
  { id: 'gap', label: 'Gap Up' },
  { id: 'catalyst', label: 'Catalyst News' },
];

// ── Tooltip Component ───────────────────────────────────────────────

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold leading-none inline-flex items-center justify-center hover:bg-slate-300 transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-50 leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </span>
  );
}

// ── Skeleton Loading Card ───────────────────────────────────────────

function SkeletonAlertCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="h-7 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-32 bg-slate-100 rounded" />
        </div>
        <div className="text-right">
          <div className="h-7 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-16 bg-slate-100 rounded ml-auto" />
        </div>
      </div>
      <div className="h-px bg-slate-100 my-4" />
      <div className="space-y-3 mb-4">
        <div className="h-4 w-full bg-slate-100 rounded" />
        <div className="h-4 w-5/6 bg-slate-100 rounded" />
        <div className="h-4 w-4/6 bg-slate-100 rounded" />
      </div>
      <div className="h-px bg-slate-100 my-4" />
      <div className="flex gap-3">
        <div className="h-4 w-24 bg-slate-100 rounded" />
        <div className="h-4 w-24 bg-slate-100 rounded" />
      </div>
      <div className="flex gap-3 mt-5">
        <div className="h-11 flex-1 bg-slate-200 rounded-xl" />
        <div className="h-11 flex-1 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}

// ── No Alerts Empty State ───────────────────────────────────────────

function NoAlertsState() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 shadow-sm text-center">
      <div className="text-6xl mb-4">🌤</div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">No High-Confidence Alerts Right Now</h2>
      <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
        Our scanners are still running. We'll notify you when something stands out.
      </p>
    </div>
  );
}

// ── Alert of the Day Card ───────────────────────────────────────────

function AlertOfTheDayCard({ alert, onOpenDetail }) {
  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      onClick={onOpenDetail}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-1">
        <div>
          <div className="text-2xl font-extrabold text-slate-900">{alert.ticker}</div>
          <div className="text-xs text-slate-400 mt-0.5">{alert.name}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-slate-900">${alert.price.toFixed(2)}</div>
          <div className="text-sm font-bold text-emerald-500">
            +${alert.change.toFixed(2)} (+{alert.changePct.toFixed(1)}%)
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-100 my-4" />

      {/* Why It's Alerting */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Why It's Alerting
        </div>
        <div className="space-y-2.5">
          {alert.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-base mt-0.5 shrink-0">{r.icon}</span>
              <div>
                <span className="text-xs font-bold text-slate-700">{r.label}: </span>
                <span className="text-xs text-slate-500">{r.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-slate-100 my-4" />

      {/* Support & Resistance */}
      <div className="flex gap-8 mb-5">
        <div className="text-xs">
          <span className="text-slate-400">Support </span>
          <InfoTooltip text="Support: A price level where the stock historically stops falling and bounces back up." />
          <span className="font-bold text-slate-700 ml-1">${alert.support.toFixed(2)}</span>
        </div>
        <div className="text-xs">
          <span className="text-slate-400">Resistance </span>
          <InfoTooltip text="Resistance: A price level where the stock historically stops rising and pulls back down." />
          <span className="font-bold text-slate-700 ml-1">${alert.resistance.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          className="flex-1 h-11 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          Add to Watchlist
        </button>
        <button
          className="flex-1 h-11 rounded-xl border-2 border-slate-800 text-slate-800 text-sm font-bold hover:bg-slate-50 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          Discuss in Chat
        </button>
      </div>
    </div>
  );
}

// ── Detail Modal ────────────────────────────────────────────────────

function DetailModal({ alert, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <div className="text-xl font-extrabold text-slate-900">{alert.ticker}</div>
            <div className="text-xs text-slate-400">{alert.name}</div>
          </div>
          <button
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Price */}
          <div>
            <div className="text-3xl font-extrabold text-slate-900">${alert.price.toFixed(2)}</div>
            <div className="text-sm font-bold text-emerald-500 mt-1">
              +${alert.change.toFixed(2)} (+{alert.changePct.toFixed(1)}%)
            </div>
          </div>

          {/* Chart Placeholder */}
          <div className="h-48 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-sm text-slate-400">
            Chart Placeholder
          </div>

          {/* Why It's Alerting */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Why It's Alerting
            </div>
            <div className="space-y-2.5">
              {alert.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="text-base mt-0.5 shrink-0">{r.icon}</span>
                  <div>
                    <span className="text-xs font-bold text-slate-700">{r.label}: </span>
                    <span className="text-xs text-slate-500">{r.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Stats Grid */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Key Stats
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Support', value: `$${alert.support.toFixed(2)}` },
                { label: 'Resistance', value: `$${alert.resistance.toFixed(2)}` },
                { label: 'Confidence', value: `${alert.confidence}%` },
                { label: 'Signal Type', value: 'Gap Up' },
              ].map((s, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{s.label}</div>
                  <div className="text-sm font-bold text-slate-800">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 pb-4">
            <button className="flex-1 h-12 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors">
              Add to Watchlist
            </button>
            <button className="flex-1 h-12 rounded-xl border-2 border-slate-800 text-slate-800 text-sm font-bold hover:bg-slate-50 transition-colors">
              Discuss in Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Track Record Section ────────────────────────────────────────────

function TrackRecord({ history }) {
  const [hovered, setHovered] = useState(null);

  // Mini sparkline from results
  const cumulative = [0];
  history.forEach(h => cumulative.push(cumulative[cumulative.length - 1] + h.result));
  const sparkMin = Math.min(...cumulative);
  const sparkMax = Math.max(...cumulative);
  const sparkRange = sparkMax - sparkMin || 1;
  const sparkW = 120, sparkH = 32;
  const sparkPts = cumulative.map((v, i) =>
    `${(i / (cumulative.length - 1)) * sparkW},${sparkH - ((v - sparkMin) / sparkRange) * (sparkH - 2) - 1}`
  ).join(' ');
  const sparkColor = cumulative[cumulative.length - 1] >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-4">
        Track Record
      </div>

      <div className="flex items-center gap-4 mb-4">
        {/* Timeline dots */}
        <div className="flex items-center gap-3 flex-1">
          {history.map((h, i) => (
            <div key={i} className="relative">
              <div
                className="w-3.5 h-3.5 rounded-full bg-slate-800 cursor-pointer hover:scale-125 transition-transform"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              {hovered === i && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg z-50 whitespace-nowrap">
                  <div className="font-bold">{h.ticker} · {h.date}</div>
                  <div className={h.result >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {h.result >= 0 ? '+' : ''}{h.result.toFixed(1)}%
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mini sparkline */}
        <svg width={sparkW} height={sparkH} className="shrink-0">
          <polyline points={sparkPts} fill="none" stroke={sparkColor} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>

      <div className="text-xs text-slate-400">
        {history.filter(h => h.result > 0).length} of {history.length} alerts were profitable
      </div>
    </div>
  );
}

// ── Scanner Filter Chips ────────────────────────────────────────────

function FilterChips() {
  const [active, setActive] = useState(new Set(['gap']));

  const toggle = (id) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_CHIPS.map(c => (
        <button
          key={c.id}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
            active.has(c.id)
              ? 'bg-slate-800 text-white'
              : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
          onClick={() => toggle(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ── Market Mood Bar ─────────────────────────────────────────────────

function MarketMoodBar() {
  const score = 32; // 0-100, lower = more fearful
  const pct = score;
  const label = score < 25 ? 'Extreme Fear' : score < 40 ? 'Fearful' : score < 60 ? 'Neutral' : score < 75 ? 'Greedy' : 'Extreme Greed';
  const barColor = score < 25 ? '#ef4444' : score < 40 ? '#f97316' : score < 60 ? '#eab308' : score < 75 ? '#84cc16' : '#22c55e';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
        Market Mood:
      </span>
      <span className="text-[11px] font-bold" style={{ color: barColor }}>{label}</span>
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────

export default function AlertsDemoPage() {
  const [viewState, setViewState] = useState('loading'); // 'loading' | 'active' | 'empty'
  const [isLoading, setIsLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  // Simulate loading
  useEffect(() => {
    if (viewState === 'loading') {
      setIsLoading(true);
      const t = setTimeout(() => {
        setIsLoading(false);
        setViewState('active');
      }, 2000);
      return () => clearTimeout(t);
    }
    setIsLoading(false);
  }, [viewState]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center sticky top-0 z-40">
        <div className="text-lg font-extrabold">
          <span className="text-emerald-500">UpTik</span>
          <span className="text-slate-800">Alerts</span>
        </div>
        <MarketMoodBar />
      </div>

      {/* State Toggle (dev controls) */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 self-center mr-2">Preview:</span>
        {['loading', 'active', 'empty'].map(s => (
          <button
            key={s}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              viewState === s
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            onClick={() => setViewState(s)}
          >
            {s === 'loading' ? 'Loading' : s === 'active' ? 'Alert Active' : 'No Alerts'}
          </button>
        ))}
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Alert of the Day Label */}
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
          ⭐ Alert of the Day
        </div>

        {/* Main Content — state-driven */}
        {isLoading && viewState === 'loading' ? (
          <SkeletonAlertCard />
        ) : viewState === 'empty' ? (
          <NoAlertsState />
        ) : (
          <AlertOfTheDayCard alert={MOCK_ALERT} onOpenDetail={() => setDetailOpen(true)} />
        )}

        {/* Track Record */}
        {viewState === 'active' && !isLoading && (
          <TrackRecord history={MOCK_HISTORY} />
        )}

        {/* Scanner Filters */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Scanner Filters
          </div>
          <FilterChips />
        </div>
      </div>

      {/* Detail Modal */}
      {detailOpen && (
        <DetailModal alert={MOCK_ALERT} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  );
}
