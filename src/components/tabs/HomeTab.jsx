// ============================================
// UPTIKALERTS — HomeTab.jsx
// Slim header → thin pulse → watchlist → briefing
// ============================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTheme } from './alertsCasinoComponents';

// ── Extracted modules ──
import { safeGet } from '../../lib/safeStorage';
import { getHomeStyles } from './homeStyles';
import BriefCard from '../home/BriefCard';

// ── Hooks ──
import { useMarketData } from '../../hooks/useMarketData';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useSectorResearch } from '../../hooks/useSectorResearch';

export default function HomeTab({ session, onTabChange, darkMode }) {
  const t = useTheme(darkMode);

  // ── Market data ──
  const { marketPulse, marketIndicators, futuresData, futuresLabels, marketStatus, loadMarketIndicators } = useMarketData();

  // ── Watchlist ──
  const {
    watchlist, setWatchlist,
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searchLoading, addingTicker, toast,
    loadWatchlist, addToWatchlist, removeFromWatchlist,
    handleSearchChange, showToast,
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

  // ── UI refs ──
  const outerWrapRef  = useRef(null);
  const searchRef     = useRef(null);

  // ═══════════════════════════════════════
  // INITIAL LOAD
  // ═══════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await Promise.allSettled([
        loadBriefing(),
        loadMarketIndicators(),
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
  // BRIEFING
  // ═══════════════════════════════════════
  const loadBriefing = async () => {
    try {
      const { data } = await supabase
        .from('daily_briefings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setBriefing(data);
    } catch (err) {
      console.error('[Briefing] Load error:', err.message);
    }
  };

  // ═══════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════
  const DEFAULT_ITEMS = [{ label: 'S&P 500', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }];

  // Keywords that identify futures/commodities indicators — hide these during market hours
  const FUTURES_KEYWORDS = ['futures', 'fut', 'gold', 'silver', 'oil', 'vix', 'gc=f', 'cl=f', 'si=f', 'es=f', 'nq=f', 'ym=f'];
  const isFuturesItem = (item) => {
    const label = (item.label || '').toLowerCase();
    const key = (item.key || item.ticker || '').toLowerCase();
    return FUTURES_KEYWORDS.some(kw => label.includes(kw) || key.includes(kw));
  };

  const pulseItems = (() => {
    if (marketStatus === 'open') {
      // Filter out futures/commodities from DB indicators during market hours
      if (marketIndicators.length > 0) {
        const stockOnly = marketIndicators
          .filter(m => !isFuturesItem({ label: m.label, key: m.ticker }))
          .map(m => ({ label: m.label, key: m.ticker }));
        return stockOnly.length > 0 ? stockOnly : DEFAULT_ITEMS;
      }
      return DEFAULT_ITEMS;
    }
    // Outside market hours: show everything (futures + commodities welcome)
    if (futuresLabels.length > 0) return futuresLabels;
    if (marketIndicators.length > 0) return marketIndicators.map(m => ({ label: m.label, key: m.ticker }));
    return DEFAULT_ITEMS;
  })();

  // During market hours: only show market data (no futures)
  // Outside market hours: merge in futures/fallback data
  const activePulse = marketStatus === 'open' ? marketPulse : { ...marketPulse, ...futuresData };

  const briefingArticles = briefing?.tags?.length > 0
    ? briefing.tags
    : briefing?.content
      ? briefing.content.split('\n').filter(Boolean).map(line => {
          const clean = line.replace(/^•\s*/, '');
          const tickerMatch = clean.match(/\(([^)]+)\)$/);
          return {
            tickers: tickerMatch ? tickerMatch[1].split(',').map(t => t.trim()) : [],
            title: tickerMatch ? clean.replace(/\s*\([^)]+\)$/, '') : clean,
            url: null,
          };
        })
      : [];

  const hasWatchlist = watchlist.length > 0;

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  // ── Styles (extracted to homeStyles.js) ──
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
                const pts = d?.pointChange;
                const isFut = d?.isFutures || isFuturesItem(item);
                const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '';
                const color = chg > 0 ? '#5eed8a' : chg < 0 ? '#ff6b6b' : '#8a9bb0';
                return (
                  <span key={i} style={S.pulseItem}>
                    <span style={S.pulseName}>{item.label}</span>
                    {isFut ? (
                      /* Futures: show points + percentage */
                      <span style={{ ...S.pulseVal, color, fontSize: 14, fontWeight: 600 }}>
                        {d ? (() => {
                          const points = Math.abs((chg / 100) * price);
                          return `${arrow}${points.toFixed(2)} (${Math.abs(chg).toFixed(2)}%)`;
                        })() : '--'}
                      </span>
                    ) : (
                      /* Stocks: show full price + percentage */
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

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div style={S.content}>

        {/* ── STOCKS (Watchlist first for engagement) ── */}
        <div style={S.stocksSection}>
          <div style={S.stocksHeader}>
            <span style={S.stocksTitle}>Stocks</span>
          </div>
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

              <div style={S.stocksScroll}>
                {researchLoading ? (
                  <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 13 }}>Loading...</div>
                ) : researchStocks.length === 0 ? (
                  researchSector === '__mylist__' ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: t.text3, fontSize: 13 }}>
                      No tickers in your list yet
                    </div>
                  ) : (
                    <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 13 }}>
                      No rankings available for {researchSector} yet
                    </div>
                  )
                ) : (
                  researchStocks.map((stock, i) => {
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
                  })
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

        <div style={S.sectionDivider} />

        {/* ── TODAY'S MARKET (briefing, collapsed by default) ── */}
        <div style={S.briefSection}>
          <div style={S.briefHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.briefTitle}>Today's Market</span>
              {briefing && (
                <span style={S.briefTime}>
                  {new Date(briefing.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} EST
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
            <div style={S.briefEmpty}>No briefing posted yet today</div>
          )}
        </div>

      </div>
    </div>
  );
}
