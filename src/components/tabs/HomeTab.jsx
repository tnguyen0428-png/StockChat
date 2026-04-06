// ============================================
// UPTIKALERTS — HomeTab.jsx (Redesigned V1)
// Slim header → thin pulse → watchlist → briefing → live chat w/ AI
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { isWeekend, isMarketHoliday, isMarketOpen, isAfterHours } from '../../utils/marketUtils';
import { askUpTikAI } from '../../lib/aiAgent';
import CreateGroupModal from '../shared/CreateGroupModal';
import InviteModal from '../shared/InviteModal';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

// ── Popular tickers for new user onboarding ──
const POPULAR_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'SPY', 'META'];

export default function HomeTab({ session, onGroupSelect, onSignOut, onProfilePress, onTabChange, scrollToChatRef }) {
  const { publicGroups, privateGroup, activeGroup, profile, customGroups } = useGroup();

  // ── Market data state (kept from original) ──
  const [briefing, setBriefing]                 = useState(null);
  const [marketPulse, setMarketPulse]           = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [futuresData, setFuturesData]           = useState({});
  const [futuresLabels, setFuturesLabels]       = useState([]);

  // ── Watchlist state ──
  const [watchlist, setWatchlist]               = useState([]);
  const [showSearch, setShowSearch]             = useState(false);
  const [searchQuery, setSearchQuery]           = useState('');
  const [searchResults, setSearchResults]       = useState([]);
  const [searchLoading, setSearchLoading]       = useState(false);
  const [addingTicker, setAddingTicker]         = useState(null);
  const [toast, setToast]                       = useState(null);

  // ── Briefing state ──
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  // ── Chat preview state ──
  const [chatMessages, setChatMessages]         = useState([]);
  const [homeGroup, setHomeGroup]               = useState(null);

  // ── Group creation modals ──
  const [showCreateGroup, setShowCreateGroup]   = useState(false);
  const [showInviteGroup, setShowInviteGroup]   = useState(null);

  // ── Research / Curated Lists state ──
  const [researchSector, setResearchSector]     = useState(null);
  const [researchStocks, setResearchStocks]     = useState([]);
  const [researchLoading, setResearchLoading]   = useState(false);
  const [researchExpanded, setResearchExpanded] = useState(null);
  const [researchPrices, setResearchPrices]     = useState({});

  // ── Chat input state (sends from Home page) ──
  const [chatInput, setChatInput]               = useState('');
  const [chatSending, setChatSending]           = useState(false);
  const [aiMode, setAiMode]                     = useState(false);
  const [chatExpanded, setChatExpanded]          = useState(false);
  const [aiLoading, setAiLoading]               = useState(false);
  const chatInputRef = useRef(null);
  const chatStripRef = useRef(null);
  const chatSectionRef = useRef(null);

  // Expose scrollToChat for parent (when Chat bottom nav is tapped)
  useEffect(() => {
    if (scrollToChatRef) {
      scrollToChatRef.current = () => {
        chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        chatInputRef.current?.focus();
      };
    }
  }, [scrollToChatRef]);

  // ── UI state ──
  const [showProfileMenu, setShowProfileMenu]   = useState(false);
  const profileMenuRef = useRef(null);
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  // ═══════════════════════════════════════
  // MARKET STATUS
  // ═══════════════════════════════════════
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

  const marketStatus = getMarketStatus();

  // ═══════════════════════════════════════
  // INITIAL LOAD
  // ═══════════════════════════════════════
  useEffect(() => {
    loadBriefing();
    loadMarketIndicators();
    loadWatchlist();
  }, []);

  useEffect(() => {
    if (publicGroups.length > 0) {
      loadChatPreview();
    }
  }, [publicGroups]);

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
  // GROUP COUNTS & CHAT PREVIEW
  // ═══════════════════════════════════════
  const loadChatMessages = async (groupOverride, expanded) => {
    const target = groupOverride || homeGroup || publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
    if (!target) return;

    const msgLimit = expanded ? 25 : 5;
    let { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('group_id', target.id)
      .order('created_at', { ascending: false })
      .limit(msgLimit);

    // Fallback: if no messages in target group, try any group
    if (!data || data.length === 0) {
      const { data: fallback } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(msgLimit);
      data = fallback;
    }

    if (data) setChatMessages(data.reverse());
  };

  // Alias for backward compat
  const loadChatPreview = () => loadChatMessages(null, chatExpanded);

  // ── Load curated sector research ──
  const [researchSectors, setResearchSectors] = useState([]);

  // Load available sectors on mount + auto-show "All"
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('curated_stocks').select('sector');
      if (data) {
        const unique = [...new Set(data.map(s => s.sector).filter(Boolean))];
        setResearchSectors(unique);
        // Don't auto-load — let user pick a sector
      }
    })();
  }, []);

  const loadResearch = async (sector) => {
    setResearchSector(sector);
    setResearchLoading(true);
    setResearchExpanded(null);
    try {
      let query = supabase.from('curated_stocks').select('*');

      if (sector === 'All') {
        // Show all stocks ranked by score
        query = query.order('score', { ascending: false }).limit(15);
      } else {
        query = query.ilike('sector', `%${sector}%`).order('score', { ascending: false }).limit(15);
      }

      const { data: stocks } = await query;
      if (stocks?.length > 0) {
        // Deduplicate by ticker, keep highest score
        const seen = {};
        stocks.forEach(s => {
          if (!seen[s.ticker] || s.score > seen[s.ticker].score) seen[s.ticker] = s;
        });
        const unique = Object.values(seen).sort((a, b) => b.score - a.score);
        const ranked = unique.map((s, i) => ({ ...s, ranking: i + 1 }));
        setResearchStocks(ranked);
        // Fetch live prices for these tickers
        fetchResearchPrices(ranked.map(s => s.ticker));
      } else {
        setResearchStocks([]);
      }
    } catch (err) {
      console.error('[Research] Load error:', err.message);
      setResearchStocks([]);
    }
    setResearchLoading(false);
  };

  const fetchResearchPrices = async (tickers) => {
    if (!tickers.length || !FMP_KEY) return;
    try {
      // FMP stable/quote only supports single symbols on this plan — fetch in parallel
      const results = await Promise.allSettled(
        tickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const prices = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          if (q.symbol && q.price) prices[q.symbol] = { price: q.price, change: q.changePercentage };
        }
      });
      setResearchPrices(prev => ({ ...prev, ...prices }));
    } catch (err) {
      console.error('[Research] Price fetch error:', err.message);
    }
  };

  // ── Resolve the UpTik Public group (cached) ──
  useEffect(() => {
    const findGroup = async () => {
      // First try from context
      const fromCtx = publicGroups.find(g => g.name === 'UpTik Public');
      if (fromCtx) { setHomeGroup(fromCtx); return; }
      // Fallback: query directly
      const { data } = await supabase
        .from('groups')
        .select('*')
        .eq('name', 'UpTik Public')
        .single();
      if (data) setHomeGroup(data);
      else if (publicGroups[0]) setHomeGroup(publicGroups[0]);
    };
    findGroup();
  }, [publicGroups]);

  // ── Send message from Home page ──
  const handleHomeSend = async () => {
    const raw = chatInput.trim();
    if (!raw || chatSending || !profile || !homeGroup) return;
    const text = aiMode ? `@AI ${raw}` : raw;

    setChatSending(true);
    try {
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: homeGroup.id,
        user_id: session.user.id,
        username: profile.username,
        user_color: profile.color,
        text,
        type: 'user',
        is_admin: false,
      }).select().single();

      if (error) {
        console.error('[Home] Send error:', error);
      } else if (data) {
        setChatInput('');
        setChatMessages(prev => [...prev.slice(-4), data]);
        // Scroll chat to bottom
        setTimeout(() => {
          if (chatStripRef.current) {
            chatStripRef.current.scrollTop = chatStripRef.current.scrollHeight;
          }
        }, 50);

        // If AI mode, call AI and insert response
        if (aiMode) {
          setAiLoading(true);
          try {
            const query = raw;
            const { text: aiReply } = await askUpTikAI({
              userText: query,
              history: [],
              username: profile?.username,
              groupName: homeGroup?.name,
              watchlist: watchlist.map(w => w.symbol),
            });
            const { data: aiMsg } = await supabase.from('chat_messages').insert({
              group_id: homeGroup.id, user_id: 'user_ai',
              username: 'UpTik', user_color: '#8B5CF6',
              text: aiReply, type: 'ai', is_admin: false,
            }).select().single();
            if (aiMsg) setChatMessages(prev => [...prev, aiMsg]);
          } catch (aiErr) {
            console.error('[Home AI] Error:', aiErr.message);
          } finally {
            setAiLoading(false);
          }
        }

        loadChatPreview();
      }
    } catch (err) {
      console.error('[Home] Send failed:', err.message);
    } finally {
      setChatSending(false);
    }
  };

  // ═══════════════════════════════════════
  // MARKET PULSE (kept from original)
  // ═══════════════════════════════════════
  const loadFutures = async () => {
    try {
      const futureSymbols = ['ES=F', 'NQ=F', 'YM=F', 'GC=F', 'CL=F'];
      const futuresMap = { 'ES=F': 'S&P Fut', 'NQ=F': 'Nas Fut', 'YM=F': 'Dow Fut', 'GC=F': 'Gold', 'CL=F': 'Oil' };
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
      if (status !== 'open') await loadFutures();
    }
  };

  const loadMarketPulse = async (indicators = marketIndicators) => {
    try {
      const tickers = indicators.map(m => m.ticker);
      if (tickers.length === 0) return;
      if (isWeekend() || isMarketHoliday()) return;

      const fetchTickers = isAfterHours()
        ? tickers.filter(t => ['SPY', 'QQQ', 'DIA'].includes(t))
        : tickers;
      if (fetchTickers.length === 0) return;

      const res = await fetch(
        `https://api.polygon.io/v3/snapshot?ticker.any_of=${fetchTickers.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      const pulse = {};

      (data.results || []).forEach(t => {
        const s = t.session;
        const ms = t.market_status;
        let change = s.regular_trading_change_percent;
        let price = s.close || s.price;
        let label = '';
        if (ms !== 'open') {
          if (s.late_trading_change_percent) {
            change = s.late_trading_change_percent;
            price = s.close + (s.late_trading_change || 0);
            label = 'AH';
          } else if (s.early_trading_change_percent) {
            change = s.early_trading_change_percent;
            label = 'PM';
          }
        }
        pulse[t.ticker] = { price, change, label };
      });

      if (isMarketOpen()) {
        const missing = tickers.filter(t => !pulse[t]);
        for (let i = 0; i < missing.length; i += 20) {
          if (i > 0) await new Promise(r => setTimeout(r, 1000));
          try {
            const batch = missing.slice(i, i + 20);
            const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}&apiKey=${POLYGON_KEY}`);
            const d = await r.json();
            (d.tickers || []).forEach(t => {
              const price = t.day?.c || t.prevDay?.c || 0;
              const prev = t.prevDay?.c || t.day?.o || price;
              pulse[t.ticker] = { price, change: prev ? ((price - prev) / prev) * 100 : 0, label: '' };
            });
          } catch {}
        }
      }
      setMarketPulse(pulse);
    } catch {}
  };

  // ═══════════════════════════════════════
  // WATCHLIST CRUD
  // ═══════════════════════════════════════
  const loadWatchlist = async () => {
    const { data } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });
    if (data) {
      setWatchlist(data);
    }
  };

  const addToWatchlist = async (symbol) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper || watchlist.find(w => w.symbol === upper)) return;
    setAddingTicker(upper);

    // Use first available group, or null
    const groupId = activeGroup?.id || publicGroups[0]?.id;
    const { data, error } = await supabase
      .from('user_watchlist')
      .insert({ user_id: session.user.id, group_id: groupId, symbol: upper })
      .select()
      .single();

    if (data && !error) {
      const newList = [...watchlist, data];
      setWatchlist(newList);
      fetchResearchPrices([upper]);
      showToast(`${upper} added to My List`);
      // If My List is active, refresh the displayed stocks
      if (researchSector === '__mylist__') {
        setResearchStocks(newList.map((w, i) => ({
          id: w.id, ticker: w.symbol, ranking: i + 1,
          score: null, thesis: null, notes: null, _isWatchlist: true,
        })));
      }
    }
    setAddingTicker(null);
  };

  const removeFromWatchlist = async (id, symbol) => {
    await supabase.from('user_watchlist').delete().eq('id', id);
    const newList = watchlist.filter(w => w.id !== id);
    setWatchlist(newList);
    showToast(`${symbol} removed`);
    // If My List is active, refresh the displayed stocks
    if (researchSector === '__mylist__') {
      setResearchStocks(newList.map((w, i) => ({
        id: w.id, ticker: w.symbol, ranking: i + 1,
        score: null, thesis: null, notes: null, _isWatchlist: true,
      })));
    }
  };

  // ═══════════════════════════════════════
  // TICKER SEARCH
  // ═══════════════════════════════════════
  const searchTickers = useCallback(async (query) => {
    if (query.length < 1) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=5&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      setSearchResults((data.results || []).map(t => ({
        symbol: t.ticker,
        name: t.name,
        alreadyAdded: watchlist.some(w => w.symbol === t.ticker),
      })));
    } catch {
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, [watchlist]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchTickers(val), 300);
  };

  // ═══════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ═══════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════
  const pulseItems = marketStatus === 'open'
    ? (marketIndicators.length > 0
        ? marketIndicators.map(m => ({ label: m.label, key: m.ticker }))
        : [{ label: 'S&P', key: 'SPY' }, { label: 'Nasdaq', key: 'QQQ' }, { label: 'Dow', key: 'DIA' }])
    : futuresLabels.length > 0
      ? futuresLabels
      : marketIndicators.map(m => ({ label: m.label, key: m.ticker }));

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
  return (
    <div style={S.scroll}>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={S.toast}>
          <span style={{ fontSize: 14 }}>✓</span> {toast}
        </div>
      )}

      {/* ═══ SLIM HEADER ═══ */}
      <div style={S.header}>
        <div style={S.hLeft}>
          <div style={S.logoRow}>
            <span style={S.logoUp}>Up</span>
            <span style={S.logoTik}>Tik</span>
          </div>
        </div>
        <div style={S.hRight}>
          <div style={S.statusPill}>
            <div style={{ ...S.statusDot, background: marketStatus === 'open' ? '#8cd9a0' : '#ef5350' }} />
            <span style={{ ...S.statusText, color: marketStatus === 'open' ? '#8cd9a0' : '#ef5350' }}>
              {marketStatus === 'open' ? 'LIVE' : marketStatus === 'premarket' ? 'PRE' : marketStatus === 'afterhours' ? 'AH' : 'CLOSED'}
            </span>
          </div>
          <div ref={profileMenuRef} style={{ position: 'relative' }}>
            <div style={S.avatar} onClick={() => setShowProfileMenu(p => !p)}>
              {(profile?.username || 'U')[0].toUpperCase()}
            </div>
            {showProfileMenu && (
              <div style={S.profileMenu}>
                <div style={S.pmName}>{profile?.username || 'User'}</div>
                <div style={S.pmItem} onClick={() => { setShowProfileMenu(false); onProfilePress?.(); }}>Profile</div>
                <div style={{ ...S.pmItem, color: '#EF4444' }} onClick={() => { setShowProfileMenu(false); onSignOut?.(); }}>Sign Out</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MARKET TICKER SCROLL ═══ */}
      <div style={S.combinedBar}>
        <div style={S.barContent}>
          <div style={S.barScroll}>
            <style>{`@keyframes pulseScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', animation: `pulseScroll ${Math.max(pulseItems.length * 4, 12)}s linear infinite` }}>
              {[...pulseItems, ...pulseItems].map((item, i) => {
                const d = activePulse[item.key];
                const chg = d?.change;
                const arrow = chg > 0 ? '▲' : '▼';
                const color = chg > 0 ? '#8cd9a0' : chg < 0 ? '#e05252' : '#5a7080';
                return (
                  <span key={i} style={S.pulseItem}>
                    <span style={S.pulseName}>{item.label}</span>
                    <span style={{ ...S.pulseVal, color }}>
                      {d ? `${arrow}${Math.abs(chg).toFixed(2)}%` : '--'}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div style={S.content}>

        {/* ── WATCHLIST SEARCH (appears when adding tickers) ── */}
        {showSearch && (
          <div style={S.searchOverlay}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#132d52' }}>Add to My List</span>
              <span style={{ fontSize: 12, color: '#2a7d4b', fontWeight: 500, cursor: 'pointer' }} onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>Done</span>
            </div>
            <div style={S.searchBarLight}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a8ea3" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                ref={searchRef}
                style={S.searchInputLight}
                placeholder="Search ticker or company..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <span style={{ color: '#7a8ea3', cursor: 'pointer', fontSize: 16 }} onClick={() => { setSearchQuery(''); setSearchResults([]); }}>×</span>
              )}
            </div>
            {!searchQuery && (
              <div style={{ ...S.wlPopRow, marginTop: 8 }}>
                <span style={S.wlPopLabel}>Popular:</span>
                {POPULAR_TICKERS.map(t => (
                  <span key={t} style={{ ...S.wlPopChip, ...(addingTicker === t ? { opacity: 0.5 } : {}), ...(watchlist.some(w => w.symbol === t) ? { opacity: 0.4 } : {}) }} onClick={() => addToWatchlist(t)}>{t}</span>
                ))}
              </div>
            )}
            {searchResults.length > 0 && (
              <div style={S.searchResultsLight}>
                {searchResults.map(r => (
                  <div key={r.symbol} style={S.searchItemLight}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2d4a' }}>{r.symbol}</div>
                      <div style={{ fontSize: 10, color: '#7a8ea3' }}>{r.name}</div>
                    </div>
                    {r.alreadyAdded ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#7a8ea3', padding: '4px 12px' }}>Added ✓</span>
                    ) : (
                      <button style={S.siAddBtnLight} onClick={() => { addToWatchlist(r.symbol); setSearchResults(prev => prev.map(s => s.symbol === r.symbol ? { ...s, alreadyAdded: true } : s)); }}>+ Add</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {searchLoading && <div style={{ padding: '8px 0', fontSize: 11, color: '#7a8ea3', textAlign: 'center' }}>Searching...</div>}
          </div>
        )}

        {/* ── DAILY BRIEFING (collapsible) ── */}
        <div style={S.briefSection}>
          <div style={S.briefHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.briefTitle}>Daily Briefing</span>
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
              {/* Always show first article */}
              <BriefCard article={briefingArticles[0]} />
              {/* Show rest when expanded */}
              {briefingExpanded && briefingArticles.slice(1).map((a, i) => (
                <BriefCard key={i} article={a} />
              ))}
            </>
          ) : (
            <div style={S.briefEmpty}>No briefing posted yet today</div>
          )}
        </div>

        <div style={S.sectionDivider} />

        {/* ── SECTOR RESEARCH ── */}
        <div style={S.resSection}>
          <div style={S.resHeader}>
            <span style={S.resTitle}>Sector Research</span>
            <span style={S.resSub}>Top 15 Ranked</span>
          </div>

          {/* Sector pills — "My List" first, then dynamic from DB, deduplicated by short label */}
          <div style={S.resPills}>
            {/* My List pill — always first */}
            <div
              style={{ ...S.resPill, ...(researchSector === '__mylist__' ? S.resPillActive : {}) }}
              onClick={() => {
                if (researchSector === '__mylist__') {
                  setResearchSector(null);
                  setResearchStocks([]);
                } else {
                  setResearchSector('__mylist__');
                  setResearchExpanded(null);
                  // Load watchlist stocks into research format
                  const wlStocks = watchlist.map((w, i) => ({
                    id: w.id,
                    ticker: w.symbol,
                    ranking: i + 1,
                    score: null,
                    thesis: null,
                    notes: null,
                    _isWatchlist: true,
                  }));
                  setResearchStocks(wlStocks);
                  // Fetch prices for watchlist tickers
                  if (watchlist.length > 0) {
                    fetchResearchPrices(watchlist.map(w => w.symbol));
                  }
                }
              }}
            >
              My List{hasWatchlist ? ` (${watchlist.length})` : ''}
            </div>
            {(() => {
              const SHORT = { 'Communication Services': 'Comms', 'Communication': 'Comms', 'Consumer Discretionary': 'Consumer', 'Consumer Cyclical': 'Consumer', 'Consumer Staples': 'Staples', 'Information Technology': 'Tech', 'Technology': 'Tech', 'Industrials': 'Indust.', 'Financial Services': 'Finance', 'Real Estate': 'RE' };
              const seen = new Set();
              return researchSectors.filter(sec => sec !== 'Auto').filter(sec => {
                const label = SHORT[sec] || sec;
                if (seen.has(label)) return false;
                seen.add(label);
                return true;
              }).map(sec => (
                <div
                  key={sec}
                  style={{ ...S.resPill, ...(researchSector === sec ? S.resPillActive : {}) }}
                  onClick={() => researchSector === sec ? (setResearchSector(null), setResearchStocks([])) : loadResearch(sec)}
                >
                  {SHORT[sec] || sec}
                </div>
              ));
            })()}
          </div>

          {/* Results */}
          {researchSector && (
            <div style={S.resCard}>
              {researchLoading ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#7a8ea3', fontSize: 13 }}>Loading...</div>
              ) : researchStocks.length === 0 ? (
                researchSector === '__mylist__' ? (
                  /* Empty watchlist state */
                  <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#7a8ea3', marginBottom: 10 }}>No tickers in your list yet</div>
                    <div style={S.wlPopRow}>
                      <span style={S.wlPopLabel}>Popular:</span>
                      {POPULAR_TICKERS.map(t => (
                        <span key={t} style={{ ...S.wlPopChip, ...(addingTicker === t ? { opacity: 0.5 } : {}) }} onClick={() => addToWatchlist(t)}>{t}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 16, textAlign: 'center', color: '#7a8ea3', fontSize: 13 }}>
                    No rankings available for {researchSector} yet
                  </div>
                )
              ) : (
                <>
                  {/* Column headers — different for My List vs Sector */}
                  <div style={S.resHeaderRow}>
                    {researchSector === '__mylist__' ? (
                      <>
                        <span style={{ ...S.resColTicker, flex: 'none', minWidth: 60 }}>Ticker</span>
                        <span style={{ ...S.resColScore, flex: 1, textAlign: 'center' }}>CHG%</span>
                        <span style={S.resColPrice}>Price</span>
                        <span style={{ minWidth: 28 }}></span>
                      </>
                    ) : (
                      <>
                        <span style={S.resColRank}>Rank</span>
                        <span style={S.resColTicker}>Ticker</span>
                        <span style={S.resColScore}>Score</span>
                        <span style={S.resColPrice}>Price</span>
                      </>
                    )}
                  </div>
                  {researchStocks.map((stock, i) => {
                    const isOpen = researchExpanded === stock.id;
                    const isMyList = researchSector === '__mylist__';
                    const priceData = researchPrices[stock.ticker];
                    const chg = priceData?.change;
                    const isUp = chg > 0;
                    return (
                      <div key={stock.id} style={S.resRow}>
                        <div style={S.resRowTop} onClick={() => !isMyList && setResearchExpanded(isOpen ? null : stock.id)}>
                          {isMyList ? (
                            <>
                              <span style={{ ...S.resTicker, flex: 'none', minWidth: 60 }}>{stock.ticker}</span>
                              <span style={{ flex: 1, textAlign: 'center' }}>
                                {priceData ? (
                                  <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: isUp ? '#2a7d4b' : chg < 0 ? '#e05252' : '#5a7080',
                                  }}>
                                    {isUp ? '▲' : chg < 0 ? '▼' : ''} {chg != null ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#7a8ea3' }}>—</span>
                                )}
                              </span>
                              <span style={S.resPrice}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                              <span
                                style={S.wlRemoveBtn}
                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.id, stock.ticker); }}
                                title="Remove"
                              >×</span>
                            </>
                          ) : (
                            <>
                              <span style={S.resRank}>#{stock.ranking}</span>
                              <span style={S.resTicker}>{stock.ticker}</span>
                              <span style={S.resScoreWrap}>
                                <span style={S.resChev}>{isOpen ? '▲' : '▼'}</span>
                                {stock.score != null && (
                                  <span style={{
                                    ...S.resScoreBadge,
                                    background: stock.score >= 70 ? 'rgba(140,217,160,0.15)' : stock.score >= 50 ? 'rgba(255,193,7,0.15)' : 'rgba(224,82,82,0.1)',
                                    color: stock.score >= 70 ? '#2a7d4b' : stock.score >= 50 ? '#b8860b' : '#e05252',
                                  }}>{stock.score}</span>
                                )}
                              </span>
                              <span style={S.resPrice}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                            </>
                          )}
                        </div>
                        {!isMyList && isOpen && (
                          <div style={S.resExpandedBody}>
                            {stock.notes && (
                              <div style={S.resMetrics}>{stock.notes}</div>
                            )}
                            {stock.thesis && (
                              <div style={S.resThesis}>{stock.thesis}</div>
                            )}
                            {!stock.thesis && !stock.notes && (
                              <div style={{ ...S.resThesis, fontStyle: 'italic', color: '#7a8ea3' }}>No analysis available yet</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* + Add Ticker button for My List */}
                  {researchSector === '__mylist__' && (
                    <div
                      style={S.wlAddTicker}
                      onClick={() => setShowSearch(true)}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700 }}>+</span> Add Ticker
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div style={S.sectionDivider} />

        {/* ── LIVE CHAT — UpTik Public only ── */}
        <div ref={chatSectionRef} style={S.chatSection}>
          <div style={S.csHeader}>
            <div style={S.csTitle}>
              Live Chat
              <div style={S.csLive}>
                <div style={S.csLiveDot} />
                {uptikPublic ? 'live' : ''}
              </div>
            </div>
            <button
              style={S.csViewAll}
              onClick={() => {
                const next = !chatExpanded;
                setChatExpanded(next);
                loadChatMessages(null, next);
              }}
            >
              {chatExpanded ? 'Show less ‹' : 'View all ›'}
            </button>
          </div>

          {/* Chat messages — UpTik Public feed */}
          <div style={S.chatCard}>
            <div ref={chatStripRef} style={{ ...S.ccMsgs, ...(chatExpanded ? { maxHeight: 400, overflow: 'hidden auto' } : {}) }}>
              {chatMessages.length > 0 ? (
                chatMessages.map((msg, i) => (
                  <ChatBubble key={msg.id || i} msg={msg} />
                ))
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: '#7a8ea3', fontSize: 13 }}>
                  No recent messages
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

        <div style={S.sectionDivider} />

        {/* ── MY GROUPS + CREATE GROUP CTA ── */}
        <div style={S.groupSection}>
          <div style={S.groupSectionHeader}>
            <span style={S.groupSectionTitle}>My Groups</span>
            <button style={S.groupCreateBtn} onClick={() => setShowCreateGroup(true)}>
              + New
            </button>
          </div>

          {/* Existing private groups */}
          {customGroups.length > 0 ? (
            <div style={S.myGroupsPills}>
              {customGroups.map(g => (
                <div
                  key={g.id}
                  style={S.myGroupPill}
                  onClick={() => { onGroupSelect?.(g); onTabChange?.('chat'); }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#7B68EE', flexShrink: 0 }} />
                  <span style={S.myGroupName}>{g.name}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7a8ea3" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
              <div
                style={{ ...S.myGroupPill, border: '1px dashed #d8e2ed', color: '#2a7d4b' }}
                onClick={() => setShowCreateGroup(true)}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>+</span>
                <span style={S.myGroupName}>Create</span>
              </div>
            </div>
          ) : (
            /* Empty state — invite to create first group */
            <div style={S.groupCta} onClick={() => setShowCreateGroup(true)}>
              <div style={S.groupCtaIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2a7d4b" strokeWidth="1.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              </div>
              <div style={S.groupCtaText}>
                <div style={S.groupCtaTitle}>Start a group</div>
                <div style={S.groupCtaSub}>Chat privately with friends — invite with a link</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2a7d4b" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          )}
        </div>

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

      {/* ═══ FIXED CHAT INPUT — pinned above bottom nav ═══ */}
      <div style={S.fixedChatBar}>
        <div
          style={{ ...S.ccAiBtn, ...(aiMode ? S.ccAiBtnActive : S.ccAiBtnOff) }}
          onClick={() => setAiMode(prev => !prev)}
        >AI</div>
        <input
          ref={chatInputRef}
          style={{ ...S.ccInput, ...(aiMode ? { border: '1.5px solid #8B5CF6' } : {}) }}
          placeholder={aiMode ? 'Ask AI anything...' : 'Message UpTik Public...'}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleHomeSend(); } }}
        />
        <button
          style={{ ...S.ccSend, opacity: chatInput.trim() ? 1 : 0.4, ...(aiMode ? { background: '#8B5CF6' } : {}) }}
          onClick={handleHomeSend}
          disabled={!chatInput.trim() || chatSending}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════

function BriefCard({ article }) {
  return (
    <div style={S.briefCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {article.tickers?.length > 0 && (
          <div style={S.bfTickers}>{Array.isArray(article.tickers) ? article.tickers.join(' · ') : article.tickers}</div>
        )}
        <div style={S.bfTitle}>{article.title}</div>
      </div>
      {article.url && (
        <a href={article.url} target="_blank" rel="noopener noreferrer" style={S.bfLink}>Read →</a>
      )}
    </div>
  );
}

function ChatBubble({ msg }) {
  const name = msg.username || msg.profiles?.username || 'User';
  const colors = ['#2a7d4b', '#7B68EE', '#FF7043', '#4CAF50', '#E91E63', '#FF9800'];
  const color = msg.user_color || colors[name.charCodeAt(0) % colors.length];
  const timeAgo = getTimeAgo(msg.created_at);

  // chat_messages uses "text", group_chat_messages used "content"
  const rawText = msg.text || msg.content || '';
  const parts = rawText.split(/(\$[A-Z]{1,5})/g);

  return (
    <div style={S.ccMsg}>
      <div style={{ ...S.ccAv, background: color }}>{name[0].toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.ccTop}>
          <span style={{ ...S.ccName, color }}>{name}</span>
          <span style={S.ccTime}>{timeAgo}</span>
        </div>
        <div style={S.ccText}>
          {parts.map((p, i) => p.startsWith('$') ? <span key={i} style={S.ccTk}>{p}</span> : p)}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp) {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const S = {
  scroll: { flex: 1, overflowY: 'auto', padding: 0, WebkitOverflowScrolling: 'touch' },

  // ── Toast ──
  toast: {
    position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
    background: '#2a7d4b', color: '#fff', fontSize: 12, fontWeight: 600,
    padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 12px rgba(42,125,75,0.3)',
    display: 'flex', alignItems: 'center', gap: 6, zIndex: 10000,
  },

  // ── Header (40px) ──
  header: {
    background: '#132d52', padding: '8px 14px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0,
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: 5 },
  logoRow: { display: 'flex', alignItems: 'baseline' },
  logoUp: { fontSize: 18, fontWeight: 500, color: '#f0ede8' },
  logoTik: { fontSize: 18, fontWeight: 500, color: '#8cd9a0' },
  hRight: { display: 'flex', alignItems: 'center', gap: 8 },
  statusPill: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'rgba(255,255,255,0.1)', padding: '2px 7px', borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: '50%' },
  statusText: { fontSize: 9, fontWeight: 600, letterSpacing: '0.04em' },
  avatar: {
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600, color: '#f0ede8', cursor: 'pointer',
  },
  profileMenu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: -4, width: 130,
    background: '#132d52', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden',
  },
  pmName: { fontSize: 12, fontWeight: 600, color: '#e0e0e0', padding: '9px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  pmItem: { fontSize: 12, fontWeight: 500, color: '#ccc', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' },

  // ── Market Ticker Bar ──
  combinedBar: { background: '#1a3a5e', flexShrink: 0 },
  barContent: { padding: '6px 0', minHeight: 30 },
  barScroll: { overflow: 'hidden', display: 'flex', alignItems: 'center' },
  pulseItem: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px' },
  pulseName: { fontSize: 11, fontWeight: 500, color: '#4a6178' },
  pulseVal: { fontSize: 11, fontWeight: 700 },

  // ── Content ──
  content: { flex: 1, overflowY: 'auto', paddingBottom: 56, background: '#eef2f7' },
  sectionDivider: { height: 1, background: '#dce4ed', margin: '0 14px' },

  fixedChatBar: {
    position: 'fixed', bottom: 58, left: 0, right: 0,
    maxWidth: 480, margin: '0 auto',
    padding: '10px 14px', background: '#eef2f7',
    display: 'flex', alignItems: 'center', gap: 8,
    zIndex: 9998,
  },

  // ── Watchlist / My List helpers ──
  wlPopRow: { display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' },
  wlPopLabel: { fontSize: 10, color: '#3e5568', marginRight: 2, alignSelf: 'center' },
  wlPopChip: {
    fontSize: 11, fontWeight: 600, color: '#8cd9a0',
    background: 'rgba(140,217,160,0.1)', border: '1px solid rgba(140,217,160,0.2)',
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
  },


  // ── Briefing ──
  briefSection: { padding: '10px 14px 8px' },
  briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  briefTitle: { fontSize: 13, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em' },
  briefTime: { fontSize: 10, color: '#7a8ea3' },
  briefToggle: { fontSize: 11, color: '#2a7d4b', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  briefCard: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
    padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
  },
  bfTickers: { fontSize: 10, fontWeight: 700, color: '#2a7d4b', marginBottom: 2 },
  bfTitle: { fontSize: 12, color: '#1a2d4a', fontWeight: 500, lineHeight: 1.3 },
  bfLink: { color: '#2a7d4b', fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
  briefEmpty: { background: '#f8fafc', border: '1px solid #d8e2ed', borderRadius: 10, padding: 16, textAlign: 'center', fontSize: 13, color: '#7a8ea3' },

  // ── Research section ──
  resSection: { padding: '10px 14px 8px' },
  resHeader: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  resTitle: { fontSize: 13, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em' },
  resSub: { fontSize: 10, color: '#7a8ea3', fontWeight: 500 },
  resPills: { display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none' },
  resPill: {
    flexShrink: 0, padding: '5px 14px', borderRadius: 14, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', border: '1px solid #d8e2ed', background: '#fff', color: '#4a6178',
  },
  resPillActive: { background: '#132d52', color: '#fff', borderColor: '#132d52' },
  resCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 12,
    maxHeight: 260, overflowY: 'auto',
  },
  resRow: {
    padding: '8px 12px', borderBottom: '1px solid #f5f7fa', cursor: 'pointer',
  },
  resRowTop: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  resRank: { fontSize: 11, fontWeight: 700, color: '#7a8ea3', minWidth: 24 },
  resTicker: { fontSize: 13, fontWeight: 700, color: '#1a2d4a', flex: 1 },
  resScoreWrap: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 },
  resScoreBadge: {
    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8, textAlign: 'center',
  },
  resPrice: { fontSize: 12, fontWeight: 600, color: '#3a5068', minWidth: 70, textAlign: 'right' },
  resHeaderRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
    borderBottom: '1.5px solid #e2e8f0', background: '#f8fafc',
  },
  resColRank: { fontSize: 10, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 24 },
  resColTicker: { fontSize: 10, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 },
  resColScore: { fontSize: 10, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 36, textAlign: 'center', flex: 1 },
  resColPrice: { fontSize: 10, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 70, textAlign: 'right' },
  resChev: { fontSize: 9, color: '#7a8ea3' },
  resExpandedBody: {
    padding: '6px 12px 8px 36px', background: '#f8fafc', borderTop: '1px solid #eef2f7',
  },
  resMetrics: {
    fontSize: 11, color: '#2a7d4b', fontWeight: 600, lineHeight: 1.5, marginBottom: 4,
  },
  resThesis: {
    fontSize: 12, color: '#4a6178', lineHeight: 1.4,
  },

  // ── Chat section ──
  chatSection: { padding: '12px 14px 8px' },
  csHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  csTitle: { fontSize: 13, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 },
  csLive: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#2a7d4b', fontWeight: 500 },
  csLiveDot: { width: 5, height: 5, borderRadius: '50%', background: '#2a7d4b', animation: 'pulse 1.5s ease-in-out infinite' },
  csViewAll: { fontSize: 12, color: '#2a7d4b', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },

  // ── My Groups section ──
  groupSection: { padding: '0 14px 16px' },
  groupSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupSectionTitle: { fontSize: 15, fontWeight: 700, color: '#132d52', letterSpacing: '-0.01em' },
  groupCreateBtn: {
    fontSize: 12, fontWeight: 600, color: '#2a7d4b', background: 'none', border: 'none',
    cursor: 'pointer', padding: '4px 0',
  },
  myGroupsPills: { display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, justifyContent: 'center', flexWrap: 'wrap' },
  myGroupPill: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    borderRadius: 10, border: '1px solid #d8e2ed', background: '#fff', cursor: 'pointer',
  },
  myGroupName: { fontSize: 13, fontWeight: 600, color: '#1a2d4a' },
  groupCta: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    background: 'linear-gradient(135deg, #f0f7f3 0%, #e8f4ec 100%)', borderRadius: 12,
    border: '1px solid #c8e6d0', cursor: 'pointer',
  },
  groupCtaIcon: {
    width: 40, height: 40, borderRadius: '50%', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    border: '1px solid #c8e6d0',
  },
  groupCtaText: { flex: 1 },
  groupCtaTitle: { fontSize: 14, fontWeight: 700, color: '#132d52', marginBottom: 2 },
  groupCtaSub: { fontSize: 11, color: '#5a8a6a', lineHeight: 1.3 },

  chatCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 12, overflow: 'hidden',
  },
  ccMsgs: { padding: 0 },
  ccMsg: {
    padding: '8px 12px', borderBottom: '1px solid #f5f7fa',
    display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  ccFooter: {
    padding: '8px 12px', background: '#f8fafc',
    display: 'flex', alignItems: 'center', gap: 8,
    borderTop: '1px solid #eef2f7',
  },
  ccAv: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0,
  },
  ccTop: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 },
  ccName: { fontSize: 12, fontWeight: 600 },
  ccTime: { fontSize: 10, color: '#7a8ea3', marginLeft: 'auto' },
  ccText: { fontSize: 13, color: '#4a6178', lineHeight: 1.4 },
  ccTk: { color: '#2a7d4b', fontWeight: 600 },
  // ccFooter replaced by fixedChatBar
  ccAiBtn: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
    transition: 'all 0.2s',
  },
  ccAiBtnOff: {
    background: '#8a9bb0', color: '#fff',
  },
  ccAiBtnActive: {
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: '#fff', boxShadow: '0 0 8px rgba(139,92,246,0.4)',
  },
  ccInput: {
    flex: 1, background: '#fff', border: '1.5px solid #b0bec5',
    borderRadius: 20, padding: '6px 14px', fontSize: 13, color: '#1a2d4a',
    fontFamily: 'inherit', outline: 'none',
  },
  ccSend: {
    width: 32, height: 32, borderRadius: '50%', background: '#2a7d4b',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(42,125,75,0.3)',
  },

  // ── My List styles ──
  wlRemoveBtn: {
    minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, color: '#c0c8d0', cursor: 'pointer', borderRadius: '50%',
    transition: 'color 0.15s',
  },
  wlAddTicker: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: '10px 12px', fontSize: 13, fontWeight: 600,
    color: '#2a7d4b', cursor: 'pointer', borderTop: '1.5px dashed #d8e2ed',
    background: '#f8fafc',
  },

  // ── Search overlay (light theme) ──
  searchOverlay: {
    padding: '10px 14px', background: '#fff', border: '1px solid #d8e2ed',
    borderRadius: 12, margin: '8px 14px 0',
  },
  searchBarLight: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#f5f7fa', border: '1px solid #d8e2ed',
    borderRadius: 10, padding: '7px 12px',
  },
  searchInputLight: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontFamily: 'inherit', fontSize: 12, color: '#1a2d4a',
  },
  searchResultsLight: {
    marginTop: 6, background: '#f8fafc',
    border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
  },
  searchItemLight: {
    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid #f0f3f6', cursor: 'pointer',
  },
  siAddBtnLight: {
    fontSize: 11, fontWeight: 600, color: '#2a7d4b', background: 'rgba(42,125,75,0.08)',
    border: '1px solid rgba(42,125,75,0.2)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
