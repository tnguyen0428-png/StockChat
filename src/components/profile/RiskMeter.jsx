// Self-contained Risk meter widget for the Profile tab.
// Computes sector concentration risk from the user's open paper_trades.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

export default function RiskMeter({ session }) {
  const [risk, setRisk] = useState({ level: 'Low', bars: 2, color: '#2a7d4b', note: 'Well diversified' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: trades } = await supabase
          .from('paper_trades')
          .select('ticker, shares, entry_price')
          .eq('user_id', uid)
          .eq('status', 'open');
        if (cancelled || !trades || trades.length === 0) { setLoading(false); return; }
        const tickers = [...new Set(trades.map(t => t.ticker))];
        const res = await fetch(
          `https://financialmodelingprep.com/stable/profile?symbol=${tickers.join(',')}&apikey=${FMP_KEY}`
        );
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) { setLoading(false); return; }
        const sectorVals = {};
        data.forEach(d => {
          if (!d.sector) return;
          const val = trades
            .filter(t => t.ticker === d.symbol)
            .reduce((sum, t) => sum + Number(t.shares) * Number(t.entry_price), 0);
          sectorVals[d.sector] = (sectorVals[d.sector] || 0) + val;
        });
        const total = Object.values(sectorVals).reduce((a, b) => a + b, 0);
        if (total > 0) {
          const [maxName, maxVal] = Object.entries(sectorVals).sort((a, b) => b[1] - a[1])[0];
          const pct = (maxVal / total) * 100;
          if (pct > 60) setRisk({ level: 'High', bars: 4, color: '#E24B4A', note: `${pct.toFixed(0)}% in ${maxName.toLowerCase()} — diversify` });
          else if (pct > 40) setRisk({ level: 'Medium', bars: 3, color: '#BA7517', note: `${pct.toFixed(0)}% in ${maxName.toLowerCase()}` });
          else setRisk({ level: 'Low', bars: 2, color: '#2a7d4b', note: 'Well diversified' });
        }
        setLoading(false);
      } catch (e) {
        // Meter renders undefined risk on failure — log so we can tell
        // "user has no positions" from "sector fetch crashed".
        if (import.meta.env.DEV) console.warn('[RiskMeter] sector fetch failed:', e?.message || e);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  return (
    <div style={S.card}>
      <div style={S.head}>
        <span style={S.title}>Portfolio Risk</span>
        <span style={{ ...S.level, color: risk.color }}>{loading ? '…' : risk.level}</span>
      </div>
      <div style={S.barsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ ...S.bar, background: i <= risk.bars ? risk.color : '#EDD9A3' }} />
        ))}
      </div>
      {risk.note && <div style={S.note}>{risk.note}</div>}
    </div>
  );
}

const S = {
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: '8px 12px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 12, fontWeight: 700, color: 'var(--text1)' },
  level: { fontSize: 12, fontWeight: 800 },
  barsRow: { display: 'flex', gap: 3 },
  bar: { flex: 1, height: 5, borderRadius: 2 },
  note: { fontSize: 10, color: 'var(--text3)', marginTop: 6 },
};
