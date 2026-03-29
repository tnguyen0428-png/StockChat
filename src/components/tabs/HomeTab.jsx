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

  const [briefing, setBriefing]           = useState(null);
  const [marketPulse, setMarketPulse]     = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [movers, setMovers]               = useState({ gainers: [], losers: [] });
  const [moversTab, setMoversTab]         = useState('gainers');

  useEffect(() => {
    loadBriefing();
    loadMarketIndicators();
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

  const loadMarketIndicators = async () => {
    const { data } = await supabase
      .from('market_indicators')
      .select('*')
      .order('position', { ascending: true });
    if (data) {
      setMarketIndicators(data);
      await loadMarketPulse(data);
    }
  };

  const loadMarketPulse = async (indicators = marketIndicators) => {
    try {
      const tickers = indicators.map(m => m.ticker);
      if (tickers.length === 0) return;
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      const pulse = {};
      (data.tickers || []).forEach(t => {
        pulse[t.ticker] = { price: t.day?.c || t.prevDay?.c, change: t.todaysChangePerc };
      });
      const missing = tickers.filter(t => !pulse[t]);
      await Promise.all(missing.map(async (ticker) => {
        try {
          const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`);
          const d = await r.json();
          const result = d.results?.[0];
          if (result) pulse[ticker] = { price: result.c, change: ((result.c - result.o) / result.o) * 100 };
        } catch {}
      }));
      setMarketPulse(pulse);
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

      const gainers = (gainData.tickers || []).slice(0, 5);
      const losers  = (loseData.tickers  || []).slice(0, 5);

      // If market is closed, fall back to previous day data
      if (gainers.length === 0) {
        const getLastTradingDay = () => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sunday
          if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Saturday
          const now = new Date();
          const estHour = now.getUTCHours() - 5;
          if (estHour < 9 || (estHour === 9 && now.getUTCMinutes() < 30)) {
            d.setDate(d.getDate() - 1);
            if (d.getDay() === 0) d.setDate(d.getDate() - 2);
            if (d.getDay() === 6) d.setDate(d.getDate() - 1);
          }
          return d.toISOString().split('T')[0];
        };
        const prevRes = await fetch(
          `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${getLastTradingDay()}?adjusted=true&apiKey=${POLYGON_KEY}`
        );
        const prevData = await prevRes.json();
        const results = (prevData.results || [])
          .filter(r => r.v > 1000000)
          .map(r => ({
            ticker: r.T,
            day: { c: r.c },
            todaysChangePerc: ((r.c - r.o) / r.o) * 100,
          }))
          .sort((a, b) => b.todaysChangePerc - a.todaysChangePerc);

        setMovers({
          gainers: results.slice(0, 5),
          losers:  results.slice(-5).reverse(),
        });
        return;
      }

      setMovers({ gainers, losers });
    } catch {}
  };

  const fmt = (p) => p != null ? `$${Number(p).toFixed(2)}` : '--';
  const fmtPct = (p) => p != null ? `${p > 0 ? '+' : ''}${Number(p).toFixed(1)}%` : '--';

  const pulseItems = marketIndicators.length > 0
    ? marketIndicators.map(m => ({ label: m.label, key: m.ticker }))
    : [{ label: 'S&P 500', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }, { label: 'VIX', key: 'VIXY' }];

  const moversData = movers[moversTab] || [];

  return (
    <div style={styles.scroll}>

      {/* MARKET PULSE */}
      <div style={styles.secLabel}>Market Pulse</div>
      <div style={{ overflow: 'hidden', background: 'var(--card)', borderBottom: '1px solid var(--border)', height: 36, display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <style>{`@keyframes pulseScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        <div style={{
          display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
          animation: `pulseScroll ${pulseItems.length * 5}s linear infinite`,
        }}>
          {[...pulseItems, ...pulseItems].map((item, i) => {
            const d = marketPulse[item.key];
            const chg = d?.change;
            const up = chg > 0;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 18px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>{d ? `$${Number(d.price).toFixed(2)}` : '--'}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: chg == null ? 'var(--text3)' : up ? 'var(--green)' : 'var(--red)' }}>
                  {d ? `${up ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%` : '--'}
                </span>
                <span style={{ color: 'var(--border)', fontSize: 12 }}>│</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* SECTOR GROUP CHAT */}
      <div style={styles.secLabel}>Sector Group Chat</div>
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

      {/* PRIVATE GROUP CHAT */}
      <div style={styles.secLabel}>Private Group Chat</div>
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

      {/* DAILY BRIEFING */}
      <div style={styles.secLabel}>Daily Briefing</div>
      {briefing ? (
        <div style={styles.briefingCard}>
<div style={styles.briefingText}>
            {briefing.content.split('\n').map((line, i) => (
              <div key={i} style={{ marginBottom: line ? 6 : 0 }}>{line}</div>
            ))}
          </div>
          <div style={styles.briefingMeta}>
            Updated {new Date(briefing.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} EST
          </div>
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No briefing posted yet today</span>
        </div>
      )}

      {/* TOP MOVERS */}
      <div style={styles.secLabel}>Top Movers</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {movers.gainers.slice(0, 3).map((m, i) => {
          const chg = m.todaysChangePerc;
          return (
            <div key={`g${i}`} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text1)' }}>{m.ticker}</span>
              {' '}<span style={{ color: 'var(--green)' }}>+{chg?.toFixed(1)}%</span>
            </div>
          );
        })}
        <span style={{ color: 'var(--border)', fontSize: 12, alignSelf: 'center' }}>│</span>
        {movers.losers.slice(0, 2).map((m, i) => {
          const chg = m.todaysChangePerc;
          return (
            <div key={`l${i}`} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text1)' }}>{m.ticker}</span>
              {' '}<span style={{ color: 'var(--red)' }}>{chg?.toFixed(1)}%</span>
            </div>
          );
        })}
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
