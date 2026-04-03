// ============================================
// UPTIKALERTS — HomeTab.jsx
// Homepage: briefing, groups, market pulse
// ============================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

export default function HomeTab({ session, onGroupSelect, onAIPress, onSignOut, onProfilePress }) {
  const { publicGroups, privateGroup, activeGroup, profile } = useGroup();

  const [briefing, setBriefing]                 = useState(null);
  const [marketPulse, setMarketPulse]           = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [futuresData, setFuturesData]           = useState({});
  const [futuresLabels, setFuturesLabels]       = useState([]);
  const [groupsWithCounts, setGroupsWithCounts] = useState([]);
  const [showProfileMenu, setShowProfileMenu]   = useState(false);
  const profileMenuRef = useRef(null);

  // Close profile menu on outside click
  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showProfileMenu]);

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
  const uptikPublic = displayGroups.find(g => g.name === 'UpTik Public');
  const sectorGroups = displayGroups.filter(g => g.name !== 'UpTik Public');

  return (
    <div style={styles.scroll}>

      {/* HEADER */}
      <div style={{ background: '#354030', padding: '10px 14px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#fff' }}>
            <span style={{ color: '#f0f0f0' }}>Up</span><span style={{ color: '#a0e070' }}>Tik</span><span style={{ color: '#f0f0f0' }}>Alerts</span>
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
          <div ref={profileMenuRef} style={{ position: 'relative' }}>
            <div
              style={{ width: 27, height: 27, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              onClick={() => setShowProfileMenu(prev => !prev)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            {showProfileMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: -4, width: 140, background: '#1e1e1e', border: '1px solid #333', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -5, right: 11, width: 10, height: 10, background: '#1e1e1e', borderLeft: '1px solid #333', borderTop: '1px solid #333', transform: 'rotate(45deg)' }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', padding: '9px 12px 8px', borderBottom: '1px solid #2a2a2a' }}>
                  {profile?.username || 'User'}
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: '#ccc', padding: '8px 12px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer' }}
                  onClick={() => { setShowProfileMenu(false); onProfilePress?.(); }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Profile
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: '#EF4444', padding: '8px 12px', cursor: 'pointer' }}
                  onClick={() => { setShowProfileMenu(false); onSignOut?.(); }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MARKET PULSE STRIP */}
      <div style={{ overflow: 'hidden', background: '#1c2a1c', borderBottom: '1px solid #354535', height: 52, display: 'flex', alignItems: 'center' }}>
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
            const arrow = chg > 0 ? '▲' : '▼';
            const changeColor = chg > 0 ? '#b5e655' : chg < 0 ? 'var(--red)' : 'var(--text3)';
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', margin: '0 4px', borderRadius: 10, background: chg > 0 ? 'rgba(59,109,17,0.2)' : chg < 0 ? 'rgba(162,45,45,0.15)' : 'transparent' }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: '#8aaa7a' }}>{item.label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: changeColor }}>
                  {d ? (isFutures
                    ? `${arrow} ${chg > 0 ? '+' : ''}${pointChange} (${chg > 0 ? '+' : ''}${chg.toFixed(2)}%)`
                    : `${arrow}${Math.abs(chg).toFixed(2)}%`
                  ) : '--'}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* GROUP CHAT — MEDIUM OLIVE */}
      <div style={{ background: '#1c2a1c', paddingBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#7a9a6a', padding: '8px 12px 4px' }}>Group Chat</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 12px 0' }}>
          {/* Public */}
          {uptikPublic && (
            <div
              style={{ flexShrink: 0, background: '#243424', border: '1.5px solid #4a7a2a', borderRadius: 10, padding: '8px 12px', textAlign: 'center', cursor: 'pointer', minWidth: 80 }}
              onClick={() => onGroupSelect(uptikPublic)}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#7aaa5a', letterSpacing: 0.5, marginBottom: 3 }}>PUBLIC</div>
              <div style={{ fontSize: 13, color: '#ddd', fontWeight: 500, marginBottom: 3 }}>{uptikPublic.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#b5e655', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, color: '#b5e655' }}>{uptikPublic.member_count || 0}</span>
              </div>
            </div>
          )}

          {/* Private */}
          <div
            style={{ flexShrink: 0, background: '#243424', border: '1.5px solid #4a7a2a', borderRadius: 10, padding: '8px 12px', textAlign: 'center', cursor: privateGroup ? 'pointer' : 'default', minWidth: 80, opacity: privateGroup ? 1 : 0.6 }}
            onClick={() => privateGroup && onGroupSelect(privateGroup)}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: '#7aaa5a', letterSpacing: 0.5, marginBottom: 3 }}>PRIVATE</div>
            <div style={{ fontSize: 13, color: '#ddd', fontWeight: 500, marginBottom: 3 }}>{privateGroup?.name || 'None'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#b5e655', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, color: '#b5e655' }}>0</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: '#3a5a2a', margin: '6px 2px', flexShrink: 0 }} />

          {/* Sector groups */}
          {sectorGroups.map(group => {
            const memberCount = group.member_count || 0;
            return (
              <div key={group.id}
                style={{ flexShrink: 0, background: '#2a3a2a', border: '1px solid #3a4a3a', borderRadius: 10, padding: '8px 12px', textAlign: 'center', cursor: 'pointer', minWidth: 72 }}
                onClick={() => onGroupSelect(group)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#b5e655', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <span style={{ fontSize: 13, color: '#ccc', fontWeight: 500 }}>{group.sector || group.name}</span>
                </div>
                <span style={{ fontSize: 11, color: '#b5e655' }}>{memberCount}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* LIGHT THEME ZONE */}
      <div style={{ background: '#f4f7f0' }}>

        {/* DAILY BRIEFING */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#7a8a6a', padding: '8px 12px 4px' }}>Daily Briefing</div>
        {briefing ? (
          <div style={{ background: '#ffffff', border: '1px solid #dde5d5', borderRadius: 10, overflow: 'hidden', marginBottom: 8, marginLeft: 12, marginRight: 12 }}>
            {briefing.tags?.length > 0 ? (
              briefing.tags.map((article, i, arr) => (
                <div key={i} style={{ padding: '9px 12px', borderBottom: i < arr.length - 1 ? '1px solid #e8ede2' : 'none', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {article.tickers?.length > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#3B6D11', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {article.tickers.join(' · ')}
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.35 }}>{article.title}</div>
                  </div>
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, color: '#3B6D11', fontWeight: 600, textDecoration: 'none', flexShrink: 0, marginTop: 2 }}>
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
                  <div key={i} style={{ padding: '9px 12px', borderBottom: i < arr.length - 1 ? '1px solid #e8ede2' : 'none' }}>
                    {tickers && <div style={{ fontSize: 12, fontWeight: 700, color: '#3B6D11', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tickers}</div>}
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.35 }}>{title}</div>
                  </div>
                );
              })
            )}
            <div style={{ padding: '8px 14px', fontSize: 12, color: '#8a9a7a', borderTop: '1px solid #e8ede2' }}>
              Updated {new Date(briefing.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} EST · selected by Admin
            </div>
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid #dde5d5', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 8, marginLeft: 12, marginRight: 12 }}>
            <span style={{ fontSize: 15, color: '#8a9a7a' }}>No briefing posted yet today</span>
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
    </div>
  );
}

const styles = {
  scroll:    { flex: 1, overflowY: 'auto', padding: 0, WebkitOverflowScrolling: 'touch' },
};
