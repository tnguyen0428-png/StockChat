// ============================================
// UPTIKALERTS — HomeTab.jsx
// Homepage: briefing, sectors, private group,
// market pulse, top movers
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

export default function HomeTab({ session, onGroupSelect, onAIPress }) {
  const { publicGroups, privateGroup, activeGroup, profile } = useGroup();

  const [briefing, setBriefing]                 = useState(null);
  const [marketPulse, setMarketPulse]           = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [futuresData, setFuturesData]           = useState({});
  const [futuresLabels, setFuturesLabels]       = useState([]);
  const [groupsWithCounts, setGroupsWithCounts] = useState([]);

  const getMarketStatus = () => {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = est.getDay();
    const timeInMinutes = est.getHours() * 60 + est.getMinutes();
    if (day === 0 || day === 6) return 'closed';
    if (timeInMinutes < 570) return 'premarket';
    if (timeInMinutes >= 570 && timeInMinutes < 960) return 'open';
    return 'afterhours';
  };

  useEffect(() => {
    loadBriefing();
    loadMarketIndicators();
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

  const loadFutures = async () => {
    try {
      const futureSymbols = ['ES=F', 'NQ=F', 'YM=F', 'GC=F', 'CL=F'];
      const futuresMap = {
        'ES=F': 'S&P Futures',
        'NQ=F': 'Nas Futures',
        'YM=F': 'Dow Futures',
        'GC=F': 'Gold',
        'CL=F': 'Oil',
      };
      const results = await Promise.all(futureSymbols.map(async (symbol) => {
        try {
          const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`)}`);
          const data = await res.json();
          const meta = data.chart?.result?.[0]?.meta;
          if (!meta) return null;
          const price = meta.regularMarketPrice;
          const prev = meta.previousClose;
          const change = ((price - prev) / prev) * 100;
          return { symbol, price, change, label: futuresMap[symbol] };
        } catch { return null; }
      }));
      const valid = results.filter(Boolean);
      const pulse = {};
      valid.forEach(r => { pulse[r.symbol] = { price: r.price, change: r.change, label: 'FUT' }; });
      setFuturesData(pulse);
      setFuturesLabels(valid.map(r => ({ key: r.symbol, label: r.label })));
    } catch {}
  };

  const loadMarketIndicators = async () => {
    const { data } = await supabase
      .from('market_indicators')
      .select('*')
      .order('position', { ascending: true });
    if (data) {
      setMarketIndicators(data);
      await loadMarketPulse(data);
      const status = getMarketStatus();
      if (status !== 'open') {
        await loadFutures();
      }
    }
  };

  const loadMarketPulse = async (indicators = marketIndicators) => {
    try {
      const tickers = indicators.map(m => m.ticker);
      if (tickers.length === 0) return;

      // Use v3 snapshot for extended hours support
      const res = await fetch(
        `https://api.polygon.io/v3/snapshot?ticker.any_of=${tickers.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      const pulse = {};

      (data.results || []).forEach(t => {
        const session = t.session;
        const marketStatus = t.market_status;

        let change = session.regular_trading_change_percent;
        let price = session.close || session.price;
        let label = '';

        if (marketStatus !== 'open') {
          if (session.late_trading_change_percent) {
            change = session.late_trading_change_percent;
            price = session.close + (session.late_trading_change || 0);
            label = 'AH';
          } else if (session.early_trading_change_percent) {
            change = session.early_trading_change_percent;
            label = 'PM';
          }
        }

        pulse[t.ticker] = { price, change, label };
      });

      // Fallback for missing tickers (GLD, SLV etc)
      const missing = tickers.filter(t => !pulse[t]);
      await Promise.all(missing.map(async (ticker) => {
        try {
          const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`);
          const d = await r.json();
          const result = d.results?.[0];
          if (result) pulse[ticker] = { price: result.c, change: ((result.c - result.o) / result.o) * 100, label: '' };
        } catch {}
      }));

      setMarketPulse(pulse);
    } catch {}
  };

  const marketStatus = getMarketStatus();

  const pulseItems = marketStatus === 'open'
    ? (marketIndicators.length > 0 ? marketIndicators.map(m => ({ label: m.label, key: m.ticker })) : [{ label: 'S&P 500', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }, { label: 'VIX', key: 'VIXY' }])
    : futuresLabels.length > 0 ? futuresLabels : marketIndicators.map(m => ({ label: m.label, key: m.ticker }));

  const activePulse = marketStatus === 'open' ? marketPulse : { ...marketPulse, ...futuresData };

  const displayGroups = groupsWithCounts.length > 0 ? groupsWithCounts : publicGroups;

  return (
    <div style={styles.scroll}>

      {/* HEADER */}
      <div style={{ background: '#354030', padding: '10px 14px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#fff' }}>
            <span style={{ color: 'var(--green)' }}>UpTik</span>Alerts
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>Trade smarter as a group.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: marketStatus === 'open' ? 'rgba(59,109,17,0.25)' : 'rgba(162,45,45,0.25)', padding: '3px 8px', borderRadius: 10 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: marketStatus === 'open' ? '#8bc34a' : '#ef5350' }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: marketStatus === 'open' ? '#8bc34a' : '#ef5350', letterSpacing: '0.04em' }}>
              {marketStatus === 'open' ? 'LIVE' : marketStatus === 'premarket' ? 'PRE' : marketStatus === 'afterhours' ? 'AH' : 'CLOSED'}
            </span>
          </div>
          <div style={{ width: 27, height: 27, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
            {profile?.username?.[0]?.toUpperCase() || 'A'}
          </div>
        </div>
      </div>

      {/* MARKET PULSE STRIP */}
      <div style={{ overflow: 'hidden', background: 'var(--card)', borderBottom: '1px solid var(--border)', height: 30, display: 'flex', alignItems: 'center' }}>
        <style>{`
          @keyframes pulseScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        `}</style>
        <div style={{
          display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
          animation: `pulseScroll ${pulseItems.length * 5}s linear infinite`,
        }}>
          {[...pulseItems, ...pulseItems].map((item, i) => {
            const d = activePulse[item.key];
            const chg = d?.change;
            const isFutures = d?.label === 'FUT';
            const pointChange = isFutures ? ((chg / 100) * Number(d.price)).toFixed(2) : null;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px', margin: '0 2px', borderRadius: 6, background: chg > 0 ? 'rgba(59,109,17,0.12)' : chg < 0 ? 'rgba(162,45,45,0.1)' : 'transparent' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>{item.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: chg > 0 ? 'var(--green)' : chg < 0 ? 'var(--red)' : 'var(--text3)' }}>
                  {d ? (isFutures
                    ? `${chg > 0 ? '▲' : '▼'} ${chg > 0 ? '+' : ''}${pointChange}`
                    : `${chg > 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%`
                  ) : '--'}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* SECTOR GROUP CHAT */}
      <div style={styles.secLabel}>Sector Group Chat</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 12px 8px' }}>
        {displayGroups.filter(g => g.name !== 'UpTik Public').map(group => {
          const memberCount = group.member_count || 0;
          return (
            <div key={group.id}
              style={{ flexShrink: 0, background: '#1e2a1e', border: '1px solid #2a3a2a', borderRadius: 10, padding: '7px 12px', textAlign: 'center', cursor: 'pointer', minWidth: 68 }}
              onClick={() => onGroupSelect(group)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#8bc34a', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: 14, color: '#ccc', fontWeight: 500 }}>{group.sector || group.name}</span>
              </div>
              <span style={{ fontSize: 11, color: '#8bc34a' }}>{memberCount}</span>
            </div>
          );
        })}
      </div>

      {/* GROUP CHAT BUTTONS */}
      <div style={{ display: 'flex', gap: 8, paddingLeft: 12, paddingRight: 12 }}>
        {/* Public Group Chat */}
        <div
          style={{ flex: 1, background: '#EAF3DE', border: '1.5px solid #3B6D11', borderRadius: 10, padding: '11px 13px', cursor: 'pointer' }}
          onClick={() => {
            const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public');
            if (uptikPublic) onGroupSelect(uptikPublic);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#3B6D11"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#3B6D11' }}>Public Group Chat</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1a4d0a' }}>UpTik Public</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6D11', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: '#3B6D11', fontWeight: 500 }}>
                {groupsWithCounts.find(g => g.name === 'UpTik Public')?.member_count || publicGroups.find(g => g.name === 'UpTik Public')?.member_count || 0}
              </span>
            </div>
          </div>
        </div>
        {/* Private Chat */}
        <div
          style={{ flex: 1, background: '#EAF3DE', border: '1.5px solid #3B6D11', borderRadius: 10, padding: '11px 13px', cursor: privateGroup ? 'pointer' : 'default', opacity: privateGroup ? 1 : 0.6 }}
          onClick={() => privateGroup && onGroupSelect(privateGroup)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#3B6D11"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#3B6D11' }}>Private Chat</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1a4d0a' }}>{privateGroup?.name || 'No private group'}</div>
        </div>
      </div>

      {/* DAILY BRIEFING */}
      <div style={styles.secLabel}>Daily Briefing</div>
      {briefing ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
          {briefing.tags?.length > 0 ? (
            briefing.tags.map((article, i, arr) => (
              <div key={i} style={{ padding: '7px 10px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {article.tickers?.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {article.tickers.join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{article.title}</div>
                </div>
                {article.url && (
                  <a href={article.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}>
                    Read →
                  </a>
                )}
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
                  {tickers && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tickers}</div>}
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.5 }}>{title}</div>
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

      {/* UPTIK AI BUTTON */}
      <div
        onClick={() => onAIPress?.()}
        style={{ background: '#F5F3FF', border: '1.5px solid rgba(139,92,246,0.35)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 14, marginBottom: 4, marginLeft: 12, marginRight: 12 }}
      >
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>AI</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#6D28D9' }}>Ask UpTik AI</div>
          <div style={{ fontSize: 11, color: 'rgba(109,40,217,0.6)', marginTop: 2 }}>Filter out the noise.</div>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

const styles = {
  scroll:    { flex: 1, overflowY: 'auto', padding: '0 0 12px', WebkitOverflowScrolling: 'touch' },
  secLabel:  { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '8px 12px 4px' },
  emptyCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 8, marginLeft: 12, marginRight: 12 },
  emptyText: { fontSize: 15, color: 'var(--text3)' },
};
