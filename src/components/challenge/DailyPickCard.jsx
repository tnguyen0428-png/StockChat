// ============================================
// UPTIKALERTS — DailyPickCard.jsx
// "Call the Close" — daily prediction mechanic
// MVP: localStorage-backed. Wire to Supabase next pass.
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const loadPick = (uid) => {
  try {
    const raw = localStorage.getItem(`uptik_daily_pick_${uid || 'anon'}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const savePick = (uid, pick) => {
  try { localStorage.setItem(`uptik_daily_pick_${uid || 'anon'}`, JSON.stringify(pick)); } catch {}
};

const loadStreak = (uid) => {
  try { return Number(localStorage.getItem(`uptik_streak_${uid || 'anon'}`)) || 0; } catch { return 0; }
};

export default function DailyPickCard({ session, watchlist: wlProp }) {
  const uid = session?.user?.id;
  const [pick, setPick] = useState(() => loadPick(uid));
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [streak] = useState(() => loadStreak(uid));
  const [watchlist, setWatchlist] = useState(wlProp || []);

  useEffect(() => {
    const cur = loadPick(uid);
    if (cur && cur.date !== todayKey()) setPick(null);
    else setPick(cur);
  }, [uid]);

  // Fetch watchlist if not passed in
  useEffect(() => {
    if (wlProp && wlProp.length) { setWatchlist(wlProp); return; }
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_watchlist')
        .select('symbol')
        .eq('user_id', uid)
        .limit(6);
      if (!cancelled && data) setWatchlist(data);
    })();
    return () => { cancelled = true; };
  }, [uid, wlProp]);

  const alreadyPicked = pick && pick.date === todayKey();
  const tickers = (watchlist || []).map(w => (w.symbol || w.ticker || '').toUpperCase()).filter(Boolean).slice(0, 6);

  const commit = (direction) => {
    if (!selectedTicker) return;
    const newPick = {
      date: todayKey(),
      ticker: selectedTicker,
      direction,
      lockedAt: new Date().toISOString(),
    };
    savePick(uid, newPick);
    setPick(newPick);
  };

  // ── Already picked state ──
  if (alreadyPicked) {
    const emoji = pick.direction === 'up' ? '📈' : '📉';
    return (
      <div style={S.wrap}>
        <div style={S.header}>
          <div style={S.title}>Today's Pick</div>
          <div style={S.streakPill}>🔥 {streak || 1}</div>
        </div>
        <div style={S.lockedBody}>
          <div style={S.lockedTicker}>{pick.ticker} {emoji}</div>
          <div style={S.lockedSub}>Locked in · resolves at 4:00 PM ET</div>
        </div>
      </div>
    );
  }

  // ── Empty watchlist state ──
  if (tickers.length === 0) {
    return (
      <div style={S.wrap}>
        <div style={S.header}>
          <div style={S.title}>Call the Close</div>
          <div style={S.streakPillDim}>🔥 {streak}</div>
        </div>
        <div style={S.emptyBody}>
          Add a ticker to your watchlist to make today's pick.
        </div>
      </div>
    );
  }

  // ── Pick flow ──
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Call the Close</div>
          <div style={S.sub}>Will it close higher or lower than yesterday?</div>
        </div>
        <div style={S.streakPillDim}>🔥 {streak}</div>
      </div>

      <div style={S.tickerRow}>
        {tickers.map(t => (
          <div
            key={t}
            onClick={() => setSelectedTicker(t)}
            style={{
              ...S.tickerChip,
              ...(selectedTicker === t ? S.tickerChipActive : {}),
            }}
          >{t}</div>
        ))}
      </div>

      <div style={S.actionRow}>
        <button
          onClick={() => commit('up')}
          disabled={!selectedTicker}
          style={{ ...S.actionBtn, ...S.upBtn, opacity: selectedTicker ? 1 : 0.4 }}
        >📈 UP</button>
        <button
          onClick={() => commit('down')}
          disabled={!selectedTicker}
          style={{ ...S.actionBtn, ...S.downBtn, opacity: selectedTicker ? 1 : 0.4 }}
        >📉 DOWN</button>
      </div>
    </div>
  );
}

const S = {
  wrap: {
    background: '#0f1f3d',
    color: '#e6ecf5',
    borderRadius: 12,
    padding: 14,
    margin: '12px 12px 16px',
    fontFamily: "'Outfit', sans-serif",
    border: '1px solid rgba(255,255,255,0.06)',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 15, fontWeight: 700, color: '#8B5CF6', letterSpacing: 0.3,
  },
  sub: {
    fontSize: 11, color: '#9aa9bf', marginTop: 2,
  },
  streakPill: {
    background: 'rgba(139,92,246,0.2)',
    color: '#c4a8ff',
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 12, fontWeight: 700,
  },
  streakPillDim: {
    background: 'rgba(255,255,255,0.05)',
    color: '#7a8ea3',
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 12, fontWeight: 700,
  },
  tickerRow: {
    display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12,
  },
  tickerChip: {
    padding: '6px 12px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.06)',
    color: '#e6ecf5',
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.15s',
  },
  tickerChipActive: {
    background: 'rgba(139,92,246,0.25)',
    border: '1px solid #8B5CF6',
    color: '#fff',
  },
  actionRow: {
    display: 'flex', gap: 8,
  },
  actionBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    fontSize: 13, fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    letterSpacing: 0.4,
  },
  upBtn: {
    background: '#22c55e',
    color: '#fff',
  },
  downBtn: {
    background: '#ef4444',
    color: '#fff',
  },
  lockedBody: {
    padding: '14px 0 4px',
    textAlign: 'center',
  },
  lockedTicker: {
    fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 0.5,
  },
  lockedSub: {
    fontSize: 11, color: '#9aa9bf', marginTop: 4, letterSpacing: 0.3,
  },
  emptyBody: {
    padding: '12px 0 4px',
    fontSize: 12, color: '#9aa9bf',
    textAlign: 'center',
  },
};
