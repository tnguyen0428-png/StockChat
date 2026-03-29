// ============================================
// UPTIKALERTS — HomeTab.jsx
// Homepage: briefing, sectors, private group,
// market pulse, top movers
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

export default function HomeTab({ session, onGroupSelect }) {
  const { publicGroups, privateGroup, activeGroup } = useGroup();

  const [briefing, setBriefing]     = useState(null);
  const [marketPulse, setMarketPulse] = useState({});
  const [movers, setMovers]         = useState({ gainers: [], losers: [] });
  const [moversTab, setMoversTab]   = useState('gainers');

  useEffect(() => {
    loadBriefing();
    loadMarketPulse();
    loadMovers();
  }, []);

  const loadBriefing = async () => {
    const { data } = await supabase
      .from('daily_briefings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setBriefing(data);
  };

  const loadMarketPulse = async () => {
    try {
      const tickers = ['SPY', 'QQQ', 'DIA', 'VIXY'];
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      if (data.tickers) {
        const pulse = {};
        data.tickers.forEach(t => {
          pulse[t.ticker] = { price: t.day?.c || t.prevDay?.c, change: t.todaysChangePerc };
        });
        setMarketPulse(pulse);
      }
    } catch {}
  };

  const loadMovers = async () => {
    try {
      const [gainRes, loseRes] = await Promise.all([
        fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_KEY}`),
        fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/losers?apiKey=${POLYGON_KEY}`),
      ]);
      const gainData = await gainRes.json();
      const loseData = await loseRes.json();
      setMovers({
        gainers: (gainData.tickers || []).slice(0, 5),
        losers:  (loseData.tickers  || []).slice(0, 5),
      });
    } catch {}
  };

  const fmt = (p) => p != null ? `$${Number(p).toFixed(2)}` : '--';
  const fmtPct = (p) => p != null ? `${p > 0 ? '+' : ''}${Number(p).toFixed(1)}%` : '--';

  const pulseItems = [
    { label: 'S&P 500', key: 'SPY'  },
    { label: 'Nasdaq',  key: 'QQQ'  },
    { label: 'Dow',     key: 'DIA'  },
    { label: 'VIX',     key: 'VIXY' },
  ];

  const moversData = movers[moversTab] || [];

  return (
    <div style={styles.scroll}>

      {/* DAILY BRIEFING */}
      <div style={styles.secLabel}>Daily Briefing</div>
      {briefing ? (
        <div style={styles.briefingCard}>
          <div style={styles.briefingTag}>Pre-market</div>
          <div style={styles.briefingText}>{briefing.content}</div>
          <div style={styles.briefingMeta}>
            Updated {new Date(briefing.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} EST
          </div>
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No briefing posted yet today</span>
        </div>
      )}

      {/* SECTORS */}
      <div style={styles.secLabel}>Sectors</div>
      <div style={styles.pillRow}>
        {publicGroups.map(group => {
          const isActive = activeGroup?.id === group.id;
          return (
            <div
              key={group.id}
              style={{ ...styles.pill, ...(isActive ? styles.pillActive : {}) }}
              onClick={() => onGroupSelect(group)}
            >
              {group.sector || group.name}
            </div>
          );
        })}
      </div>

      {/* PRIVATE GROUP */}
      <div style={styles.secLabel}>Private Group</div>
      {privateGroup ? (
        <div
          style={{ ...styles.privateBtn, ...(activeGroup?.id === privateGroup.id ? styles.privateBtnActive : {}) }}
          onClick={() => onGroupSelect(privateGroup)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#3B6D11">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z"/>
          </svg>
          {privateGroup.name}
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No private group — ask for an invite link</span>
        </div>
      )}

      {/* MARKET PULSE */}
      <div style={styles.secLabel}>Market Pulse</div>
      <div style={styles.pulseGrid}>
        {pulseItems.map(item => {
          const d = marketPulse[item.key];
          const chg = d?.change;
          const up = chg > 0;
          return (
            <div key={item.key} style={styles.pulseCard}>
              <div style={styles.pulseLabel}>{item.label}</div>
              <div style={styles.pulseVal}>{d ? fmt(d.price) : '--'}</div>
              <div style={{ ...styles.pulseChg, color: chg == null ? 'var(--text3)' : up ? 'var(--green)' : 'var(--red)' }}>
                {d ? fmtPct(chg) : '--'}
              </div>
            </div>
          );
        })}
      </div>

      {/* TOP MOVERS */}
      <div style={styles.secLabel}>Top Movers</div>
      <div style={styles.moversCard}>
        <div style={styles.tabRow}>
          {[{ id: 'gainers', label: 'Gainers' }, { id: 'losers', label: 'Losers' }].map(t => (
            <div
              key={t.id}
              style={{ ...styles.tab, ...(moversTab === t.id ? styles.tabActive : {}) }}
              onClick={() => setMoversTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>
        {moversData.length === 0 ? (
          <div style={styles.emptyText}>Loading...</div>
        ) : (
          moversData.map((m, i) => {
            const chg = m.todaysChangePerc;
            const up = chg >= 0;
            return (
              <div key={i} style={{ ...styles.moverRow, borderBottom: i < moversData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={styles.moverTicker}>{m.ticker}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={styles.moverPrice}>{fmt(m.day?.c)}</div>
                  <div style={{ ...styles.moverPct, color: up ? 'var(--green)' : 'var(--red)' }}>{fmtPct(chg)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

const styles = {
  scroll: { flex: 1, overflowY: 'auto', padding: '4px 12px 12px', WebkitOverflowScrolling: 'touch' },
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  briefingCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 },
  briefingTag: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)', marginBottom: 6 },
  briefingText: { fontSize: 13, color: 'var(--text1)', lineHeight: 1.7 },
  briefingMeta: { fontSize: 10, color: 'var(--text3)', marginTop: 6 },
  pillRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  pill: { fontSize: 13, padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text2)', background: 'var(--card)', cursor: 'pointer', fontWeight: 500 },
  pillActive: { background: 'var(--card2)', color: 'var(--text1)', borderColor: 'var(--text3)' },
  privateBtn: { width: '100%', background: '#EAF3DE', color: '#27500A', border: '0.5px solid #97C459', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  privateBtnActive: { background: '#C0DD97', borderColor: '#3B6D11' },
  pulseGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 4 },
  pulseCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 6px' },
  pulseLabel: { fontSize: 9, color: 'var(--text3)', marginBottom: 2 },
  pulseVal: { fontSize: 12, fontWeight: 600, color: 'var(--text1)' },
  pulseChg: { fontSize: 10 },
  moversCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px 14px', marginBottom: 8 },
  tabRow: { display: 'flex', gap: 14, borderBottom: '1px solid var(--border)', marginBottom: 10, marginLeft: -14, marginRight: -14, paddingLeft: 14 },
  tab: { fontSize: 11, padding: '9px 0', color: 'var(--text3)', borderBottom: '2px solid transparent', cursor: 'pointer' },
  tabActive: { color: 'var(--text1)', fontWeight: 600, borderBottomColor: 'var(--green)' },
  moverRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' },
  moverTicker: { fontSize: 14, fontWeight: 600, color: 'var(--text1)' },
  moverPrice: { fontSize: 13, fontWeight: 500, color: 'var(--text1)' },
  moverPct: { fontSize: 11 },
  emptyCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 13, color: 'var(--text3)' },
};
