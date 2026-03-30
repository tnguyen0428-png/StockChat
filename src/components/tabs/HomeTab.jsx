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

  const [briefing, setBriefing]                 = useState(null);
  const [marketPulse, setMarketPulse]           = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [movers, setMovers]                     = useState({ gainers: [], losers: [] });
  const [groupsWithCounts, setGroupsWithCounts] = useState([]);

  useEffect(() => {
    loadBriefing();
    loadMarketIndicators();
    loadMovers();
  }, []);

  useEffect(() => {
    if (publicGroups.length > 0) loadGroupCounts();
  }, [publicGroups]);

  const loadBriefing = async () => {
    const { data } = await supabase
      .from('daily_briefings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setBriefing(data);
  };

  const loadGroupCounts = async () => {
    const { data: counts } = await supabase.from('group_members').select('group_id, id');
    if (counts) {
      const countMap = {};
      counts.forEach(c => { countMap[c.group_id] = (countMap[c.group_id] || 0) + 1; });
      setGroupsWithCounts(publicGroups.map(g => ({ ...g, member_count: countMap[g.id] || 0 })));
    } else {
      setGroupsWithCounts(publicGroups);
    }
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

      if (gainers.length === 0) {
        const getLastTradingDay = () => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          if (d.getDay() === 0) d.setDate(d.getDate() - 2);
          if (d.getDay() === 6) d.setDate(d.getDate() - 1);
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

  const pulseItems = marketIndicators.length > 0
    ? marketIndicators.map(m => ({ label: m.label, key: m.ticker }))
    : [{ label: 'S&P 500', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }, { label: 'VIX', key: 'VIXY' }];

  const displayGroups = groupsWithCounts.length > 0 ? groupsWithCounts : publicGroups;

  return (
    <div style={styles.scroll}>

      {/* MARKET PULSE STRIP */}
      <div style={{ overflow: 'hidden', background: 'var(--card)', borderBottom: '1px solid var(--border)', height: 36, display: 'flex', alignItems: 'center' }}>
        <style>{`
          @keyframes pulseScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes moversScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        `}</style>
        <div style={{
          display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
          animation: `pulseScroll ${pulseItems.length * 5}s linear infinite`,
        }}>
          {[...pulseItems, ...pulseItems].map((item, i) => {
            const d = marketPulse[item.key];
            const chg = d?.change;
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 12px', margin: '0 2px', borderRadius: 6,
                background: chg > 0 ? 'rgba(59,109,17,0.12)' : chg < 0 ? 'rgba(162,45,45,0.1)' : 'transparent',
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{d ? `$${Number(d.price).toFixed(2)}` : '--'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: chg > 0 ? 'var(--green)' : chg < 0 ? 'var(--red)' : 'var(--text3)' }}>
                  {d ? `${chg > 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%` : '--'}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* TOP MOVERS STRIP */}
      <div style={{ overflow: 'hidden', height: 36, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', animation: `moversScroll ${(movers.gainers.length + movers.losers.length) * 3}s linear infinite` }}>
          {[...movers.gainers.slice(0,5), ...movers.losers.slice(0,5), ...movers.gainers.slice(0,5), ...movers.losers.slice(0,5)].map((m, i) => {
            const chg = m.todaysChangePerc;
            const up = chg >= 0;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px', margin: '0 2px', borderRadius: 6, background: up ? 'rgba(59,109,17,0.12)' : 'rgba(162,45,45,0.1)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>{m.ticker}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* SECTOR GROUP CHAT */}
      <div style={styles.secLabel}>Sector Group Chat</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
        {displayGroups.map(group => {
          const memberCount = group.member_count || 0;
          return (
            <div key={group.id}
              style={{ flexShrink: 0, background: '#EAF3DE', border: '1.5px solid #3B6D11', borderRadius: 10, padding: '10px 16px', textAlign: 'center', cursor: 'pointer', minWidth: 82 }}
              onClick={() => onGroupSelect(group)}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1a4d0a' }}>{group.sector || group.name}</div>
              <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 500 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6D11', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                {memberCount}
              </div>
            </div>
          );
        })}
      </div>

      {/* PRIVATE GROUP CHAT */}
      <div style={styles.secLabel}>Private Group Chat</div>
      <div style={{ display: 'flex', gap: 8, paddingLeft: 12, paddingRight: 12 }}>
        <div
          style={{ flex: 1, background: '#EAF3DE', border: '1.5px solid #3B6D11', borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}
          onClick={() => privateGroup && onGroupSelect(privateGroup)}
        >
          <div style={{ fontSize: 10, fontWeight: 500, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Private</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1a4d0a' }}>{privateGroup?.name || 'None yet'}</div>
        </div>
        <div style={{ flex: 1, background: '#EAF3DE', border: '1.5px solid #3B6D11', borderRadius: 10, padding: '12px 14px', opacity: 0.6 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Custom</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1a4d0a' }}>Coming soon</div>
        </div>
      </div>

      {/* DAILY BRIEFING */}
      <div style={styles.secLabel}>Daily Briefing</div>
      {briefing ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
          {briefing.tags?.length > 0 ? (
            briefing.tags.map((article, i, arr) => (
              <div key={i} style={{ padding: '11px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {article.tickers?.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {article.tickers.join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.5, marginBottom: 5 }}>{article.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{article.publisher}</span>
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500, textDecoration: 'none' }}>
                      Read →
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            briefing.content.split('\n').filter(Boolean).map((line, i, arr) => {
              const clean = line.replace(/^•\s*/, '');
              const tickerMatch = clean.match(/\(([^)]+)\)$/);
              const tickers = tickerMatch ? tickerMatch[1] : null;
              const title = tickerMatch ? clean.replace(/\s*\([^)]+\)$/, '') : clean;
              return (
                <div key={i} style={{ padding: '11px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {tickers && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tickers}</div>}
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.5 }}>{title}</div>
                </div>
              );
            })
          )}
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
            Updated {new Date(briefing.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} EST · selected by Admin
          </div>
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No briefing posted yet today</span>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}

const styles = {
  scroll:    { flex: 1, overflowY: 'auto', padding: '0 0 12px', WebkitOverflowScrolling: 'touch' },
  secLabel:  { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text2)', padding: '0 12px', margin: '14px 0 8px' },
  emptyCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 8, marginLeft: 12, marginRight: 12 },
  emptyText: { fontSize: 13, color: 'var(--text3)' },
};
