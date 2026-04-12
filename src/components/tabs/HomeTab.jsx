// ============================================
// UPTIKALERTS — HomeTab.jsx (Redesigned V1)
// Slim header → thin pulse → watchlist → briefing → live chat w/ AI
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { getBatchQuotes } from '../../lib/polygonQuote';
import CreateGroupModal from '../shared/CreateGroupModal';
import InviteModal from '../shared/InviteModal';
import StickerPicker from '../shared/StickerPicker';
import { useTheme } from './alertsCasinoComponents';

// ── Extracted modules ──
import { POLYGON_KEY, POPULAR_TICKERS, ONBOARD_TRENDING, ONBOARD_SECTORS } from './homeConstants';
import { safeGet, safeSet } from '../../lib/safeStorage';
import { getHomeStyles, getOnboardingStyles } from './homeStyles';
import { BriefCard, ChatBubble } from './HomeSubComponents';
import OnboardingOverlay from './OnboardingOverlay';

// ── Hooks ──
import { useMarketData } from '../../hooks/useMarketData';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useSectorResearch } from '../../hooks/useSectorResearch';
import { useHomeChat } from '../../hooks/useHomeChat';

export default function HomeTab({ session, onGroupSelect, onTabChange, scrollToChatRef, onOpenDMs, onStartDM, darkMode }) {
  const { publicGroups, privateGroup, activeGroup, profile, customGroups } = useGroup();

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

  // ── Chat ──
  const {
    chatMessages,
    homeGroup, setHomeGroup,
    chatInput, setChatInput,
    chatSending,
    aiMode, setAiMode,
    chatExpanded,
    aiLoading, isListening,
    chatInputRef, chatStripRef, chatSectionRef,
    handleHomeSend, handleHomeSendSticker, toggleListening,
  } = useHomeChat(session, profile, publicGroups, watchlist);

  // ── Briefing state ──
  const [briefing, setBriefing]                 = useState(null);
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  // ── Group creation modals ──
  const [showCreateGroup, setShowCreateGroup]   = useState(false);
  const [showInviteGroup, setShowInviteGroup]   = useState(null);

  // ── Onboarding state (first-login flow) ──
  const [showOnboarding, setShowOnboarding]     = useState(false);
  const [onboardSelected, setOnboardSelected]   = useState(new Set());
  const [onboardPrices, setOnboardPrices]       = useState({});
  const [onboardSearch, setOnboardSearch]        = useState('');
  const [onboardSearchResults, setOnboardSearchResults] = useState([]);
  const [onboardSearchLoading, setOnboardSearchLoading] = useState(false);
  const onboardSearchTimeout = useRef(null);

  // ── UI refs ──
  const contentRef    = useRef(null);
  const outerWrapRef  = useRef(null);
  const chatBarRef    = useRef(null);
  const searchRef     = useRef(null);

  // Scroll content to bottom when input is tapped (backup for iOS timing)
  const handleChatInputFocus = useCallback(() => {
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    }, 300);
  }, []);

  // Expose scrollToChat for parent (when Chat bottom nav is tapped)
  useEffect(() => {
    if (scrollToChatRef) {
      scrollToChatRef.current = () => {
        chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      };
    }
  }, [scrollToChatRef]);

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

  // ── First-login detection: show onboarding if watchlist is empty & never dismissed ──
  useEffect(() => {
    const checkOnboarding = async () => {
      const dismissed = safeGet('uptik_onboarding_done');
      if (dismissed) return;
      const { count } = await supabase
        .from('user_watchlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      if (count === 0) {
        setShowOnboarding(true);
        fetchOnboardPrices();
      }
    };
    checkOnboarding();
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
  // ONBOARDING
  // ═══════════════════════════════════════
  const fetchOnboardPrices = async () => {
    if (!POLYGON_KEY) return;
    const allTickers = [
      ...ONBOARD_TRENDING.map(t => t.symbol),
      ...ONBOARD_SECTORS.flatMap(s => s.tickers),
    ];
    const unique = [...new Set(allTickers)];
    try {
      const quotes = await getBatchQuotes(unique);
      const prices = {};
      Object.entries(quotes).forEach(([symbol, q]) => {
        if (q && q.price) prices[symbol] = { price: q.price, change: q.changePct };
      });
      setOnboardPrices(prices);
    } catch (err) {
      console.error('[Onboard] Price fetch error:', err.message);
    }
  };

  const toggleOnboardTicker = (symbol) => {
    setOnboardSelected(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const handleOnboardSearch = (val) => {
    setOnboardSearch(val);
    if (onboardSearchTimeout.current) clearTimeout(onboardSearchTimeout.current);
    if (val.length < 1) { setOnboardSearchResults([]); return; }
    setOnboardSearchLoading(true);
    onboardSearchTimeout.current = setTimeout(async () => {
      try {
        const upper = val.toUpperCase();
        const majorExchanges = new Set(['XNYS', 'XNAS', 'XASE']);
        const [exactRes, searchRes] = await Promise.all([
          fetch(`https://api.polygon.io/v3/reference/tickers?ticker=${upper}&active=true&apiKey=${POLYGON_KEY}`),
          fetch(`https://api.polygon.io/v3/reference/tickers?search=${val}&active=true&market=stocks&locale=us&limit=8&apiKey=${POLYGON_KEY}`),
        ]);
        const [exactData, searchData] = await Promise.all([exactRes.json(), searchRes.json()]);
        const filtered = (searchData.results || []).filter(t =>
          majorExchanges.has(t.primary_exchange)
        );
        const seen = new Set();
        const merged = [];
        for (const t of [...(exactData.results || []), ...filtered]) {
          if (!seen.has(t.ticker)) {
            seen.add(t.ticker);
            merged.push(t);
          }
        }
        setOnboardSearchResults(merged.slice(0, 6).map(t => ({
          symbol: t.ticker, name: t.name,
        })));
      } catch { setOnboardSearchResults([]); }
      setOnboardSearchLoading(false);
    }, 300);
  };

  const finishOnboarding = async () => {
    const tickers = [...onboardSelected];
    safeSet('uptik_onboarding_done', '1');
    setShowOnboarding(false);
    if (tickers.length > 0) {
      const inserts = tickers.map(symbol => ({
        user_id: session.user.id,
        symbol,
      }));
      const { data } = await supabase.from('user_watchlist').insert(inserts).select();
      if (data) {
        setWatchlist(data);
        fetchResearchPrices(tickers);
        showToast(`${tickers.length} stock${tickers.length > 1 ? 's' : ''} added to Watchlist!`);
      }
    }
  };

  const skipOnboarding = () => {
    safeSet('uptik_onboarding_done', '1');
    setShowOnboarding(false);
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

  const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public');

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
  const OB = getOnboardingStyles(t);

  return (
    <div ref={outerWrapRef} style={S.outerWrap}>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={S.toast}>
          <span style={{ fontSize: 14 }}>✓</span> {toast}
        </div>
      )}

      {/* ═══ ONBOARDING OVERLAY (first login only) ═══ */}
      {showOnboarding && (
        <OnboardingOverlay
          OB={OB} t={t}
          onboardSelected={onboardSelected}
          toggleOnboardTicker={toggleOnboardTicker}
          onboardSearch={onboardSearch}
          handleOnboardSearch={handleOnboardSearch}
          onboardSearchResults={onboardSearchResults}
          setOnboardSearch={setOnboardSearch}
          setOnboardSearchResults={setOnboardSearchResults}
          onboardSearchLoading={onboardSearchLoading}
          onboardPrices={onboardPrices}
          finishOnboarding={finishOnboarding}
          skipOnboarding={skipOnboarding}
        />
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
      <div ref={contentRef} style={S.content}>

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
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: t.text3, marginBottom: 10 }}>No tickers in your list yet</div>
                      <div style={S.wlPopRow}>
                        <span style={S.wlPopLabel}>Popular:</span>
                        {POPULAR_TICKERS.map(t => (
                          <span key={t} style={{ ...S.wlPopChip, ...(addingTicker === t ? { opacity: 0.5 } : {}) }} onClick={() => addToWatchlist(t)}>{t}</span>
                        ))}
                      </div>
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

        <div style={S.sectionDivider} />

        {/* ── COMMUNITY CHAT ── */}
        <div ref={chatSectionRef} style={S.chatSection}>
          <div style={S.csHeader}>
            <div style={S.csTitle}>
              Community Chat
              <div style={S.csLive}>
                <div style={S.csLiveDot} />
                {uptikPublic ? 'live' : ''}
              </div>
            </div>
            <button
              style={S.privateChatBtn}
              onClick={() => onOpenDMs?.()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Private Chat
            </button>
          </div>

          {/* Chat messages — UpTik Public feed */}
          <div style={S.chatCard}>
            <div ref={chatStripRef} style={{ ...S.ccMsgs, ...(chatExpanded ? { maxHeight: 400, overflow: 'hidden auto' } : {}) }}>
              {chatMessages.length > 0 ? (
                // No FadingMessage — auto-disappearing messages fight stickiness
                // and any refetch path resurrects them with fresh timers, looking broken.
                chatMessages.slice(-2).map((msg, i) => (
                  <ChatBubble key={msg.id || i} msg={msg} myId={session?.user?.id} S={S} t={t} onTapUsername={(userId, username) => {
                    if (onStartDM) { onStartDM(userId, username); onTabChange?.('chat'); }
                  }} />
                ))
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 13 }}>
                  No messages yet — type below to start chatting!
                </div>
              )}
              {aiLoading && (
                <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ ...S.ccAv, ...S.ccAiBtnActive, width: 28, height: 28 }}>AI</div>
                  <span style={{ fontSize: 13, color: '#8B5CF6', fontStyle: 'italic' }}>Thinking...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ SUGGESTION CHIPS — context-aware cold-start prompts ═══ */}
        {aiMode && !chatInput && (() => {
          const wl = (watchlist || []).slice(0, 2).map(w => (w.symbol || w.ticker || '').toUpperCase()).filter(Boolean);
          const chips = [];
          if (wl[0]) chips.push(`Summarize ${wl[0]}`);
          chips.push('Top movers today');
          if (wl[1]) chips.push(`${wl[1]} earnings`);
          else chips.push('Earnings this week');
          return (
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 12px 0',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
            }}>
              {chips.slice(0, 3).map((c, i) => (
                <div
                  key={i}
                  onClick={() => { setChatInput(c); chatInputRef.current?.focus(); }}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px',
                    borderRadius: 14,
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    fontSize: 11,
                    fontWeight: 500,
                    color: t.text1,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >{c}</div>
              ))}
            </div>
          );
        })()}

      </div>

      {/* ═══ CHAT INPUT — pinned outside scroll area ═══ */}
      <div ref={chatBarRef} style={S.fixedChatBar}>
        <div
          style={{ ...S.ccAiBtn, ...(aiMode ? S.ccAiBtnActive : S.ccAiBtnOff) }}
          onClick={() => setAiMode(prev => !prev)}
        >AI</div>
        <div style={{ ...S.ccInputWrap, ...(aiMode ? { border: '1.5px solid #8B5CF6' } : {}) }}>
          <input
            ref={chatInputRef}
            style={S.ccInput}
            placeholder={aiMode ? 'Ask AI about any stock...' : 'Chat with the community...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onFocus={handleChatInputFocus}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleHomeSend(); } }}
          />
          <div
            style={{ ...S.ccMic, ...(isListening ? S.ccMicActive : {}) }}
            onClick={() => toggleListening(showToast)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isListening ? '#fff' : t.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="11" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
        </div>
        <StickerPicker onSend={handleHomeSendSticker} size="md" />
        <button
          style={{ ...S.ccSend, opacity: chatInput.trim() ? 1 : 0.4, ...(aiMode ? { background: '#8B5CF6' } : {}) }}
          onClick={handleHomeSend}
          disabled={!chatInput.trim() || chatSending}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      {/* ── Modals ── */}
      <CreateGroupModal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onCreated={(group) => {
          setShowCreateGroup(false);
          setShowInviteGroup(group);
        }}
      />
      <InviteModal
        group={showInviteGroup}
        onClose={() => setShowInviteGroup(null)}
      />
    </div>
  );
}
