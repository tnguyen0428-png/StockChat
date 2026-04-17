// ============================================
// UPTIKALERTS — HomeTab.jsx
// Slim header → ticker strip → status card → hot movers → watchlist → briefing
// ============================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTheme } from './alertsCasinoComponents';

// ── Extracted modules ──
import { safeGet, safeSet } from '../../lib/safeStorage';
import { getHomeStyles } from './homeStyles';
import BriefCard from '../home/BriefCard';

// ── Hooks ──
import { useMarketData } from '../../hooks/useMarketData';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useSectorResearch } from '../../hooks/useSectorResearch';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useGroup } from '../../context/GroupContext';

const SIGNAL_LABELS = {
  gap_up: 'Gap Up',
  vol_surge: 'Vol Surge',
  ma_cross: 'MA Cross',
  high_52w: '52W High',
  flow_signal: 'Flow',
  confluence: 'Confluence',
};

const QUICK_ADD = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'SPY', 'META'];

export default function HomeTab({ session, onTabChange, darkMode }) {
  const t = useTheme(darkMode);
  const { profile } = useGroup();

  // ── Market data ──
  const { marketPulse, marketIndicators, futuresData, futuresLabels, marketStatus, loadMarketIndicators } = useMarketData();

  // ── Portfolio & Leaderboard ──
  const { trades, prices, totalReturn, loadingData: portfolioLoading } = usePortfolio(session);
  const { myRank, aheadUser, loadLeaderboard } = useLeaderboard(session, trades, prices);

  // ── Watchlist ──
  const {
    watchlist,
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searchLoading, toast,
    loadWatchlist, addToWatchlist, removeFromWatchlist,
    handleSearchChange,
  } = useWatchlist(session);

  // ── Sector research ──
  const {
    researchSector, setResearchSector,
    researchStocks, setResearchStocks,
    researchLoading, researchExpanded, setResearchExpanded,
    researchPrices, showSectorDropdown, setShowSectorDropdown,
    sectorLabels, loadResearch, fetchResearchPrices,
  } = useSectorResearch(watchlist);

  // ── Briefing state ──
  const [briefing, setBriefing]                 = useState(null);
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  // ── Onboarding ──
  const [onboarding, setOnboarding] = useState(() => safeGet('uptik_onboarding') || {});

  // ── Recent Activity ──
  const [recentActivity, setRecentActivity] = useState([]);

  // ── Hot movers ──
  const [hotMovers, setHotMovers] = useState([]);

  // (moved to below loadHotMovers — single canonical copy)

  // ── UI refs ──
  const outerWrapRef    = useRef(null);
  const searchRef       = useRef(null);
  const autoExpandedRef = useRef(false);

  // ═══════════════════════════════════════
  // INITIAL LOAD
  // ═══════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await Promise.allSettled([
        loadBriefing(),
        loadMarketIndicators(),
        loadLeaderboard(),
        loadHotMovers(),
        loadRecentActivity(),
        loadWatchlist().then(() => {
          if (cancelled) return;
          const saved = safeGet('uptik_last_sector');
          if (saved && saved !== '__mylist__') loadResearch(saved);
        }),
      ]);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // ═══════════════════════════════════════
  // HOT MOVERS
  // ═══════════════════════════════════════
  const loadHotMovers = async () => {
    try {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 7);
      windowStart.setHours(0, 0, 0, 0);

      // Primary: featured confluence alerts from last 7 days
      const { data: confluenceAlerts, error: confluenceErr } = await supabase
        .from('breakout_alerts')
        .select('ticker, signal_type, change_pct, conviction, notes, confluence_score, confluence_tier')
        .eq('signal_type', 'confluence')
        .eq('featured', true)
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(4);

      if (confluenceErr) console.error('[HomeTab] confluence query error:', confluenceErr.message);

      if (confluenceAlerts && confluenceAlerts.length > 0) {
        console.log('[HomeTab] Hot movers: using featured confluence alerts', confluenceAlerts.length);
        setHotMovers(confluenceAlerts.slice(0, 4));
        return;
      }

      // Fallback 1: recent non-confluence alerts deduped by ticker
      const { data: recentAlerts, error: recentErr } = await supabase
        .from('breakout_alerts')
        .select('ticker, signal_type, change_pct, conviction, notes, confluence_score, confluence_tier')
        .neq('signal_type', 'confluence')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (recentErr) console.error('[HomeTab] recent alerts fallback error:', recentErr.message);

      if (recentAlerts && recentAlerts.length > 0) {
        const seen = new Map();
        for (const a of recentAlerts) {
          if (!seen.has(a.ticker)) seen.set(a.ticker, a);
          if (seen.size === 4) break;
        }
        console.log('[HomeTab] Hot movers: using recent deduped alerts', seen.size);
        setHotMovers([...seen.values()]);
        return;
      }

      // Fallback 2: watchlist popularity
      const { data: wlData, error: wlErr } = await supabase
        .from('user_watchlist')
        .select('symbol');
      if (wlErr) console.error('[HomeTab] user_watchlist fallback error:', wlErr.message);
      if (wlData && wlData.length > 0) {
        const counts = {};
        wlData.forEach(row => { counts[row.symbol] = (counts[row.symbol] || 0) + 1; });
        const top4 = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([symbol, count]) => ({
            ticker: symbol,
            signal_type: 'popular',
            change_pct: null,
            conviction: null,
            notes: null,
            _watchCount: count,
          }));
        console.log('[HomeTab] Hot movers: using watchlist popularity', top4.length);
        setHotMovers(top4);
      }
    } catch (err) {
      console.error('[HomeTab] loadHotMovers failed:', err.message);
    }
  };

  // Fetch prices whenever hotMovers list changes
  useEffect(() => {
    if (hotMovers.length > 0) {
      fetchResearchPrices(hotMovers.map(m => m.ticker));
    }
  }, [hotMovers]);

  // Auto-expand watchlist on first load when no sector is selected
  useEffect(() => {
    if (watchlist.length > 0 && researchSector === null && !autoExpandedRef.current) {
      autoExpandedRef.current = true;
      setResearchSector('__mylist__');
      const wlStocks = watchlist.map((w, i) => ({
        id: w.id, ticker: w.symbol, ranking: i + 1,
        score: null, thesis: null, notes: null, _isWatchlist: true,
      }));
      setResearchStocks(wlStocks);
      fetchResearchPrices(watchlist.map(w => w.symbol));
    }
  }, [watchlist]);

  // ═══════════════════════════════════════
  // BRIEFING
  // ═══════════════════════════════════════
  const loadBriefing = async () => {
    try {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      // First try today's briefing
      const { data: todayData } = await supabase
        .from('daily_briefings')
        .select('*')
        .gte('created_at', todayMidnight.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (todayData) {
        setBriefing(todayData);
        return;
      }

      // Fall back to most recent briefing from any date
      const { data: recentData } = await supabase
        .from('daily_briefings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentData) setBriefing(recentData);
    } catch (err) {
      console.error('[Briefing] Load error:', err.message);
    }
  };

  // ═══════════════════════════════════════
  // RECENT ACTIVITY
  // ═══════════════════════════════════════
  const loadRecentActivity = async () => {
    try {
      const { data, error } = await supabase
        .from('paper_trades')
        .select('ticker, status, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) console.error('[HomeTab] recent activity error:', error.message);
      if (data) setRecentActivity(data);
    } catch (err) {
      console.error('[HomeTab] loadRecentActivity failed:', err.message);
    }
  };

  const formatActivityTime = (isoString) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ═══════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════
  const hasJoinedChallenge = trades.length > 0;
  const isPositive = (totalReturn || 0) >= 0;
  const username = profile?.username || 'Trader';

  const DEFAULT_ITEMS = [{ label: 'S&P 500', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }];

  const FUTURES_KEYWORDS = ['futures', 'fut', 'gold', 'silver', 'oil', 'vix', 'gc=f', 'cl=f', 'si=f', 'es=f', 'nq=f', 'ym=f'];
  const isFuturesItem = (item) => {
    const label = (item.label || '').toLowerCase();
    const key = (item.key || item.ticker || '').toLowerCase();
    return FUTURES_KEYWORDS.some(kw => label.includes(kw) || key.includes(kw));
  };

  const pulseItems = (() => {
    if (marketStatus === 'open') {
      if (marketIndicators.length > 0) {
        const stockOnly = marketIndicators
          .filter(m => !isFuturesItem({ label: m.label, key: m.ticker }))
          .map(m => ({ label: m.label, key: m.ticker }));
        return stockOnly.length > 0 ? stockOnly : DEFAULT_ITEMS;
      }
      return DEFAULT_ITEMS;
    }
    if (futuresLabels.length > 0) return futuresLabels;
    if (marketIndicators.length > 0) return marketIndicators.map(m => ({ label: m.label, key: m.ticker }));
    return DEFAULT_ITEMS;
  })();

  const activePulse = marketStatus === 'open' ? marketPulse : { ...marketPulse, ...futuresData };

  const briefingArticles = briefing?.tags?.length > 0
    ? briefing.tags
    : briefing?.content
      ? briefing.content.split('\n').filter(Boolean).map(line => {
          const clean = line.replace(/^•\s*/, '');
          const tickerMatch = clean.match(/\(([^)]+)\)$/);
          return {
            tickers: tickerMatch ? tickerMatch[1].split(',').map(tk => tk.trim()) : [],
            title: tickerMatch ? clean.replace(/\s*\([^)]+\)$/, '') : clean,
            url: null,
          };
        })
      : [];

  const hasWatchlist = watchlist.length > 0;

  // ── Onboarding helpers ──
  const markDone = (key) => {
    const updated = { ...onboarding, [key]: true };
    setOnboarding(updated);
    safeSet('uptik_onboarding', updated);
  };

  const onboardingStepDefs = [
    {
      key: 'watchlist',
      emoji: '🔍',
      title: 'Add first stock',
      desc: 'Search and add a stock to your watchlist',
      done: watchlist.length > 0,
      action: () => {
        setResearchSector('__mylist__');
        setResearchExpanded(null);
        const wlStocks = watchlist.map((w, i) => ({
          id: w.id, ticker: w.symbol, ranking: i + 1,
          score: null, thesis: null, notes: null, _isWatchlist: true,
        }));
        setResearchStocks(wlStocks);
        setShowSearch(true);
      },
      actionLabel: 'Search stocks',
    },
    {
      key: 'challenge',
      emoji: '🏆',
      title: 'Join Challenge',
      desc: 'Trade with $50K virtual cash and compete',
      done: trades.length > 0,
      action: () => onTabChange?.('challenge'),
      actionLabel: 'Go to Challenge',
    },
    {
      key: 'chat',
      emoji: '💬',
      title: 'Say hello in chat',
      desc: 'Introduce yourself to the group',
      done: !!onboarding.chat,
      action: () => { markDone('chat'); onTabChange?.('chat'); },
      actionLabel: 'Open Chat',
    },
    {
      key: 'sectors',
      emoji: '📊',
      title: 'Explore sector picks',
      desc: 'Browse analyst-curated stock picks by sector',
      done: !!onboarding.sectors,
      action: () => { markDone('sectors'); setShowSectorDropdown(true); },
      actionLabel: 'Browse Sectors',
    },
  ];

  const completedCount = onboardingStepDefs.filter(s => s.done).length;
  const onboardingComplete = completedCount === 4;

  // ── Styles ──
  const S = getHomeStyles(t);

  return (
    <div ref={outerWrapRef} style={S.outerWrap}>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={S.toast}>
          <span style={{ fontSize: 14 }}>✓</span> {toast}
        </div>
      )}

      {/* ═══ MARKET TICKER SCROLL ═══ */}
      <div style={S.combinedBar}>
        <div style={S.barContent}>
          <div style={S.barScroll}>
            <style>{`@keyframes pulseScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', animation: `pulseScroll ${Math.max(pulseItems.length * 4, 12)}s linear infinite` }}>
              {[...pulseItems, ...pulseItems].map((item, i) => {
                const d = activePulse[item.key];
                const chg = d?.change;
                const price = d?.price;
                const isFut = d?.isFutures || isFuturesItem(item);
                const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '';
                const color = chg > 0 ? '#5eed8a' : chg < 0 ? '#ff6b6b' : '#8a9bb0';
                return (
                  <span key={i} style={S.pulseItem}>
                    <span style={S.pulseName}>{item.label}</span>
                    {isFut ? (
                      <span style={{ ...S.pulseVal, color, fontSize: 14, fontWeight: 600 }}>
                        {d ? (() => {
                          const points = Math.abs((chg / 100) * price);
                          return `${arrow}${points.toFixed(2)} (${Math.abs(chg).toFixed(2)}%)`;
                        })() : '--'}
                      </span>
                    ) : (
                      <>
                        <span style={{ ...S.pulsePrice, color: '#dbe6f0' }}>
                          {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                        </span>
                        <span style={{ ...S.pulseVal, color }}>
                          {d ? `${arrow}${Math.abs(chg).toFixed(2)}%` : ''}
                        </span>
                      </>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MARKET CONTEXT ═══ */}
      {marketStatus === 'open' && (() => {
        const items = pulseItems
          .map(item => ({ item, d: activePulse[item.key] }))
          .filter(({ d }) => d?.change != null);
        if (items.length < 2) return null;
        const best = items.reduce((a, b) => a.d.change > b.d.change ? a : b);
        const worst = items.reduce((a, b) => a.d.change < b.d.change ? a : b);
        return (
          <div style={{ padding: '4px 14px', fontSize: 11, color: t.text2 }}>
            📊{' '}
            <span style={{ color: t.green, fontWeight: 600 }}>
              {best.item.label} leading {best.d.change > 0 ? '+' : ''}{best.d.change.toFixed(2)}%
            </span>
            {' · '}
            <span style={{ color: '#ff6b6b', fontWeight: 600 }}>
              {worst.item.label} lagging {worst.d.change.toFixed(2)}%
            </span>
          </div>
        );
      })()}

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div style={S.content}>

        {/* ── TODAY'S MARKET (briefing) ── */}
        <div style={S.briefSection}>
          <div style={S.briefHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.briefTitle}>Daily Briefing</span>
              {briefing && (
                <span style={S.briefTime}>
                  {(() => {
                    const briefDate = new Date(briefing.created_at);
                    const todayMidnight = new Date();
                    todayMidnight.setHours(0, 0, 0, 0);
                    const isToday = briefDate >= todayMidnight;
                    const timeStr = briefDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return (isToday ? '' : 'Yesterday · ') + timeStr + ' EST';
                  })()}
                </span>
              )}
            </div>
            {briefingArticles.length > 1 && (
              <button style={S.briefToggle} onClick={() => setBriefingExpanded(p => !p)}>
                {briefingExpanded ? 'Less ▲' : `+${briefingArticles.length - 1} more ▼`}
              </button>
            )}
          </div>

          {briefingArticles.length > 0 ? (
            <>
              <BriefCard article={briefingArticles[0]} S={S} />
              {briefingExpanded && briefingArticles.slice(1).map((a, i) => (
                <BriefCard key={i} article={a} S={S} />
              ))}
            </>
          ) : (
            <div style={{ ...S.briefEmpty, textAlign: 'center', padding: '16px 14px' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>📰</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 4 }}>Briefing posts weekdays at 9:00 AM EST</div>
              <div style={{ fontSize: 11, color: t.text3 }}>AI-generated market summary with today's top headlines and alerts</div>
            </div>
          )}
        </div>

        {/* ═══ NEW USER CTA ═══ */}
        {!portfolioLoading && !hasJoinedChallenge && (
          <div
            style={{
              margin: '10px 14px 4px',
              background: 'linear-gradient(135deg, #0d2a4a 0%, #1a3a5e 60%, #0d3d2a 100%)',
              borderRadius: 12,
              padding: '14px 14px',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            onClick={() => onTabChange?.('challenge')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>🏆</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Test Your Skills</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                  <span style={{ color: t.green, fontWeight: 600 }}>$50K virtual cash</span> — pick stocks, compete with your crew, prove your picks
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {['📊 Curated picks', '📈 Live data', '🏅 Leaderboard'].map(chip => (
                    <span key={chip} style={{
                      fontSize: 10, color: 'rgba(255,255,255,0.8)',
                      background: 'rgba(255,255,255,0.1)', borderRadius: 6,
                      padding: '3px 7px',
                    }}>{chip}</span>
                  ))}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: t.green, color: '#fff',
                  padding: '8px 16px', borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                }}>
                  Start Trading →
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ HOT TODAY ═══ */}
        {hotMovers.length > 0 && (
          <div style={{ padding: '6px 14px 4px' }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.text1 }}>Hot Today 🔥</span>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
              {hotMovers.map((mover, i) => {
                const isPopular = mover.signal_type === 'popular';
                const chg = isPopular ? null : Number(mover.change_pct ?? 0);
                const priceData = researchPrices[mover.ticker];
                const isConfluence = mover.signal_type === 'confluence';
                const tierColors = { S: '#d4af37', A: '#22c55e', B: '#3b82f6', C: '#888' };
                const score = mover.confluence_score ?? null;
                return (
                  <div key={i} style={{
                    flexShrink: 0, width: 100, borderRadius: 10,
                    background: t.card, border: `1px solid ${t.border}`,
                    padding: '8px 8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text1 }}>{mover.ticker}</span>
                      {isConfluence && mover.conviction && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: tierColors[mover.conviction] ?? '#888', border: `1px solid ${tierColors[mover.conviction] ?? '#888'}`, borderRadius: 3, padding: '0 3px', lineHeight: '14px' }}>
                          {mover.conviction}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: t.text3, marginBottom: 3 }}>
                      {isPopular ? `${mover._watchCount || 0} watching` : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
                    </div>
                    {priceData && (
                      <div style={{ fontSize: 10, color: t.text2 }}>
                        ${priceData.price.toFixed(2)}
                      </div>
                    )}
                    {isConfluence && score && (
                      <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                        Score {score}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STOCKS ── */}
        <div style={S.stocksSection}>
          <div style={S.stocksBtns}>
            <div
              style={{ ...S.stocksBtn, ...(researchSector === '__mylist__' ? S.stocksBtnActive : {}) }}
              onClick={() => {
                if (researchSector === '__mylist__') {
                  setResearchSector(null);
                  setResearchStocks([]);
                } else {
                  setShowSectorDropdown(false);
                  setResearchSector('__mylist__');
                  setResearchExpanded(null);
                  const wlStocks = watchlist.map((w, i) => ({
                    id: w.id, ticker: w.symbol, ranking: i + 1,
                    score: null, thesis: null, notes: null, _isWatchlist: true,
                  }));
                  setResearchStocks(wlStocks);
                  if (watchlist.length > 0) fetchResearchPrices(watchlist.map(w => w.symbol));
                }
              }}
            >
              Watchlist{hasWatchlist ? ` (${watchlist.length})` : ''}
            </div>
            <div style={{ position: 'relative' }}>
              <div
                style={{ ...S.stocksBtn, ...(researchSector && researchSector !== '__mylist__' ? S.stocksBtnActive : {}), ...(showSectorDropdown ? S.stocksBtnActive : {}) }}
                onClick={() => {
                  if (showSectorDropdown) {
                    setShowSectorDropdown(false);
                  } else {
                    setShowSectorDropdown(true);
                    if (researchSector === '__mylist__') {
                      setResearchSector(null);
                      setResearchStocks([]);
                    }
                  }
                }}
              >
                {researchSector && researchSector !== '__mylist__' ? `${researchSector} ▼` : 'Sectors ▼'}
              </div>
              {showSectorDropdown && (
                <div style={S.sectorDropdown}>
                  {sectorLabels.map(label => (
                    <div
                      key={label}
                      style={{ ...S.sectorDropItem, ...(researchSector === label ? { color: t.green, fontWeight: 600 } : {}) }}
                      onClick={() => {
                        setShowSectorDropdown(false);
                        loadResearch(label);
                      }}
                    >
                      {label}{researchSector === label ? ' ✓' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {researchSector && (
            <div style={S.stocksCard}>
              <div style={S.stocksHeaderRow}>
                {researchSector === '__mylist__' ? (
                  <>
                    <span style={{ ...S.stocksColLabel, flex: 1 }}>Ticker</span>
                    <span style={{ ...S.stocksColLabel, width: 60, textAlign: 'right' }}>Price</span>
                    <span style={{ ...S.stocksColLabel, width: 60, textAlign: 'right' }}>Chg%</span>
                    <span style={{ width: 24 }}></span>
                  </>
                ) : (
                  <>
                    <span style={{ ...S.stocksColLabel, width: 28 }}>Rank</span>
                    <span style={{ ...S.stocksColLabel, flex: 1 }}>Ticker</span>
                    <span style={{ ...S.stocksColLabel, flex: 1, textAlign: 'center' }}>Score</span>
                    <span style={{ ...S.stocksColLabel, width: 60, textAlign: 'right' }}>Price</span>
                  </>
                )}
              </div>

              <div style={{ ...S.stocksScroll, maxHeight: 'none' }}>
                {researchLoading ? (
                  <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 13 }}>Loading...</div>
                ) : researchStocks.length === 0 ? (
                  researchSector === '__mylist__' ? (
                    /* ── Watchlist empty state ── */
                    <div style={{ padding: '16px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 4 }}>Build your watchlist</div>
                      <div style={{ fontSize: 12, color: t.text3, marginBottom: 10 }}>
                        Track stocks you care about and follow live prices.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {QUICK_ADD.map(ticker => (
                          <div
                            key={ticker}
                            style={{
                              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                              border: `1px solid ${t.green}`, color: t.green,
                              fontSize: 12, fontWeight: 600,
                              background: 'rgba(26,173,94,0.06)',
                            }}
                            onClick={() => addToWatchlist(ticker)}
                          >
                            + {ticker}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* ── Sectors empty state ── */
                    <div style={{ padding: '16px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 4 }}>
                        We do the research
                      </div>
                      <div style={{ fontSize: 12, color: t.text3, lineHeight: 1.5, marginBottom: 10 }}>
                        Our analysts curate the top picks in {researchSector} — ranked by signal strength and conviction.
                      </div>
                      <div
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          fontSize: 12, fontWeight: 600, color: t.green, cursor: 'pointer',
                        }}
                        onClick={() => loadResearch(researchSector)}
                      >
                        Load {researchSector} →
                      </div>
                    </div>
                  )
                ) : (
                  <>
                  {researchStocks.map((stock, i) => {
                    const isOpen = researchExpanded === stock.id;
                    const isMyList = researchSector === '__mylist__';
                    const priceData = researchPrices[stock.ticker];
                    const chg = priceData?.change;
                    const isUp = chg > 0;
                    return (
                      <div key={stock.id}>
                        <div
                          style={{ ...S.stocksRow, ...(isOpen ? { background: t.surface } : {}) }}
                          onClick={() => !isMyList && setResearchExpanded(isOpen ? null : stock.id)}
                        >
                          {isMyList ? (
                            <>
                              <span style={{ ...S.stocksRowTk, flex: 1 }}>{stock.ticker}</span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: t.text3 }}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, fontWeight: 600, color: isUp ? '#1AAD5E' : chg < 0 ? 'var(--red)' : t.text3 }}>
                                {chg != null ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                              </span>
                              <span
                                style={{ width: 24, textAlign: 'center', fontSize: 14, color: 'var(--border)', cursor: 'pointer' }}
                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.id, stock.ticker); }}
                              >×</span>
                            </>
                          ) : (
                            <>
                              <span style={{ width: 28, fontSize: 11, fontWeight: 700, color: t.text3 }}>#{stock.ranking}</span>
                              <span style={{ ...S.stocksRowTk, flex: 1 }}>{stock.ticker}</span>
                              <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                {stock.score != null && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                    background: stock.score >= 70 ? 'rgba(140,217,160,0.15)' : stock.score >= 50 ? 'rgba(255,193,7,0.15)' : 'rgba(224,82,82,0.1)',
                                    color: stock.score >= 70 ? '#1AAD5E' : stock.score >= 50 ? 'var(--yellow)' : 'var(--red)',
                                  }}>{stock.score}</span>
                                )}
                                <span style={{ fontSize: 10, color: 'var(--border)' }}>{isOpen ? '▲' : '▼'}</span>
                              </span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: t.text3 }}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                            </>
                          )}
                        </div>
                        {!isMyList && isOpen && (
                          <div style={S.stocksExpand}>
                            {stock.notes && <div style={{ fontSize: 11, color: t.text1, lineHeight: 1.5 }}>{stock.notes}</div>}
                            {stock.thesis && <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.5, marginTop: 4 }}>{stock.thesis}</div>}
                            {!stock.thesis && !stock.notes && <div style={{ fontSize: 11, color: t.text3, fontStyle: 'italic' }}>No analysis available yet</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </>
                )}
              </div>

              {researchSector === '__mylist__' && (
                <div style={S.stocksAddBar}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  {showSearch ? (
                    <input
                      ref={searchRef}
                      style={S.stocksAddInput}
                      placeholder="Search ticker or company..."
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: t.text3, flex: 1, cursor: 'pointer' }} onClick={() => setShowSearch(true)}>+ Add ticker...</span>
                  )}
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: t.green, cursor: 'pointer' }}
                    onClick={() => {
                      if (showSearch) { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }
                      else setShowSearch(true);
                    }}
                  >{showSearch ? 'Done' : '+ Add'}</span>
                </div>
              )}

              {researchSector === '__mylist__' && showSearch && searchResults.length > 0 && (
                <div style={{ maxHeight: 120, overflowY: 'auto', borderTop: `1px solid ${t.border}` }}>
                  {searchResults.map(r => (
                    <div key={r.symbol} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text1 }}>{r.symbol}</div>
                        <div style={{ fontSize: 9, color: t.text3 }}>{r.name}</div>
                      </div>
                      {r.alreadyAdded ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.text3 }}>Added ✓</span>
                      ) : (
                        <button style={{ background: '#1AAD5E', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => { addToWatchlist(r.symbol); setSearchResults(prev => prev.map(s => s.symbol === r.symbol ? { ...s, alreadyAdded: true } : s)); }}
                        >+ Add</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {researchSector === '__mylist__' && showSearch && searchLoading && (
                <div style={{ padding: '6px 0', fontSize: 11, color: t.text3, textAlign: 'center' }}>Searching...</div>
              )}
            </div>
          )}
        </div>

        {/* ═══ GET STARTED CHECKLIST ═══ */}
        {!onboardingComplete && (
          <div style={{ padding: '8px 14px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text1, marginBottom: 8 }}>Get Started</div>
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {onboardingStepDefs.map((step, i, arr) => (
                <div
                  key={step.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderBottom: i < arr.length - 1 ? `1px solid ${t.border}` : 'none',
                    opacity: step.done ? 0.6 : 1,
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                    border: `2px solid ${step.done ? '#1AAD5E' : t.border}`,
                    background: step.done ? '#1AAD5E' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {step.done && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{step.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginBottom: 2, textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</div>
                    <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.4 }}>{step.desc}</div>
                  </div>
                  {!step.done && (
                    <button
                      style={{
                        background: 'transparent', border: `1px solid ${t.green}`,
                        color: t.green, borderRadius: 7,
                        padding: '5px 10px', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                      onClick={step.action}
                    >{step.actionLabel}</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#1AAD5E',
                width: `${(completedCount / 4) * 100}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: t.text3, marginTop: 4, textAlign: 'right' }}>{completedCount}/4 complete</div>
          </div>
        )}

        {/* ═══ RECENT ACTIVITY ═══ */}
        {onboardingComplete && recentActivity.length > 0 && (
          <div style={{ padding: '8px 14px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text1, marginBottom: 8 }}>Recent Activity</div>
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {recentActivity.slice(0, 4).map((trade, i, arr) => {
                const isBuy = trade.status === 'open';
                const actorName = trade.profiles?.username || 'Someone';
                const action = isBuy ? 'bought' : 'sold';
                const dotColor = isBuy ? '#1AAD5E' : '#ff6b6b';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderBottom: i < arr.length - 1 ? `1px solid ${t.border}` : 'none',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, color: t.text1 }}>
                      <span style={{ fontWeight: 600 }}>{actorName}</span>{' '}{action}{' '}
                      <span style={{ fontWeight: 700, color: isBuy ? '#1AAD5E' : '#ff6b6b' }}>{trade.ticker}</span>
                    </div>
                    <div style={{ fontSize: 10, color: t.text3, flexShrink: 0 }}>
                      {formatActivityTime(trade.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
