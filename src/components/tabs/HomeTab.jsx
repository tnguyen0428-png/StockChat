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
import FadingMessage from '../shared/FadingMessage';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

// ── Popular tickers for new user onboarding ──
const POPULAR_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'SPY', 'META'];

// ── Onboarding sector picks ──
const ONBOARD_TRENDING = [
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'META', name: 'Meta' },
];
const ONBOARD_SECTORS = [
  { name: 'Technology', color: '#4CAF50', tickers: ['MSFT', 'GOOG', 'AMZN', 'CRM', 'INTC'] },
  { name: 'Energy', color: '#FF9800', tickers: ['XOM', 'CVX', 'OXY', 'SLB'] },
  { name: 'Healthcare', color: '#E91E63', tickers: ['JNJ', 'UNH', 'PFE', 'ABBV'] },
  { name: 'Finance', color: '#2196F3', tickers: ['JPM', 'BAC', 'GS', 'V'] },
  { name: 'Consumer', color: '#9C27B0', tickers: ['DIS', 'NKE', 'SBUX', 'MCD'] },
];

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
  const savedSector = localStorage.getItem('uptik_last_sector');
  const [researchSector, setResearchSectorRaw]  = useState(savedSector || null);
  const setResearchSector = (val) => {
    setResearchSectorRaw(val);
    if (val) localStorage.setItem('uptik_last_sector', val);
    else localStorage.removeItem('uptik_last_sector');
  };
  const [researchStocks, setResearchStocks]     = useState([]);
  const [researchLoading, setResearchLoading]   = useState(false);
  const [researchExpanded, setResearchExpanded] = useState(null);
  const [researchPrices, setResearchPrices]     = useState({});

  // ── Onboarding state (first-login flow) ──
  const [showOnboarding, setShowOnboarding]     = useState(false);
  const [onboardSelected, setOnboardSelected]   = useState(new Set());
  const [onboardPrices, setOnboardPrices]       = useState({});
  const [onboardSearch, setOnboardSearch]        = useState('');
  const [onboardSearchResults, setOnboardSearchResults] = useState([]);
  const [onboardSearchLoading, setOnboardSearchLoading] = useState(false);
  const onboardSearchTimeout = useRef(null);

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
    loadWatchlist().then(() => {
      // Restore saved sector on mount
      const saved = localStorage.getItem('uptik_last_sector');
      if (saved && saved !== '__mylist__') {
        loadResearch(saved);
      }
    });
  }, []);

  // ── First-login detection: show onboarding if watchlist is empty & never dismissed ──
  useEffect(() => {
    const checkOnboarding = async () => {
      const dismissed = localStorage.getItem('uptik_onboarding_done');
      if (dismissed) return;
      // Check if user has any watchlist items
      const { data, count } = await supabase
        .from('user_watchlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      if (count === 0) {
        setShowOnboarding(true);
        // Fetch trending prices for onboarding display
        fetchOnboardPrices();
      }
    };
    checkOnboarding();
  }, []);

  const fetchOnboardPrices = async () => {
    if (!FMP_KEY) return;
    const allTickers = [
      ...ONBOARD_TRENDING.map(t => t.symbol),
      ...ONBOARD_SECTORS.flatMap(s => s.tickers),
    ];
    const unique = [...new Set(allTickers)];
    try {
      const results = await Promise.allSettled(
        unique.map(t =>
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
        const res = await fetch(
          `https://api.polygon.io/v3/reference/tickers?search=${val}&active=true&limit=6&apiKey=${POLYGON_KEY}`
        );
        const data = await res.json();
        setOnboardSearchResults((data.results || []).map(t => ({
          symbol: t.ticker, name: t.name,
        })));
      } catch { setOnboardSearchResults([]); }
      setOnboardSearchLoading(false);
    }, 300);
  };

  const finishOnboarding = async () => {
    const tickers = [...onboardSelected];
    localStorage.setItem('uptik_onboarding_done', '1');
    setShowOnboarding(false);
    // Batch add all selected tickers to watchlist
    if (tickers.length > 0) {
      const groupId = activeGroup?.id || publicGroups[0]?.id;
      const inserts = tickers.map(symbol => ({
        user_id: session.user.id,
        group_id: groupId,
        symbol,
      }));
      const { data } = await supabase.from('user_watchlist').insert(inserts).select();
      if (data) {
        setWatchlist(data);
        fetchResearchPrices(tickers);
        showToast(`${tickers.length} stock${tickers.length > 1 ? 's' : ''} added to My List!`);
      }
    }
  };

  const skipOnboarding = () => {
    localStorage.setItem('uptik_onboarding_done', '1');
    setShowOnboarding(false);
  };

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
      // Restore My List view if it was the last-opened pill
      const saved = localStorage.getItem('uptik_last_sector');
      if (saved === '__mylist__' && data.length > 0) {
        setResearchSectorRaw('__mylist__');
        setResearchStocks(data.map((w, i) => ({
          id: w.id, ticker: w.symbol, ranking: i + 1,
          score: null, thesis: null, notes: null, _isWatchlist: true,
        })));
        fetchResearchPrices(data.map(w => w.symbol));
      }
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

      {/* ═══ ONBOARDING OVERLAY (first login only) ═══ */}
      {showOnboarding && (
        <div style={OB.overlay}>
          {/* Welcome */}
          <div style={OB.header}>
            <div style={OB.wave}>👋</div>
            <div style={OB.title}>Welcome to UpTik!</div>
            <div style={OB.sub}>Pick some stocks to watch. You'll get live prices, alerts, and see what the community says about them.</div>
          </div>

          {/* Progress */}
          <div style={OB.progress}>
            <span style={OB.count}><span style={{ color: '#2a7d4b' }}>{onboardSelected.size}</span> selected</span>
            <div style={OB.barTrack}>
              <div style={{ ...OB.barFill, width: `${Math.min((onboardSelected.size / 5) * 100, 100)}%` }} />
            </div>
            <span style={{ fontSize: 11, color: '#7a8ea3' }}>min 1</span>
          </div>

          {/* Search */}
          <div style={OB.search}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a8ea3" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              style={OB.searchInput}
              placeholder="Search any ticker or company..."
              value={onboardSearch}
              onChange={e => handleOnboardSearch(e.target.value)}
            />
            {onboardSearch && (
              <span style={{ color: '#7a8ea3', cursor: 'pointer', fontSize: 16 }} onClick={() => { setOnboardSearch(''); setOnboardSearchResults([]); }}>×</span>
            )}
          </div>

          {/* Search results */}
          {onboardSearchResults.length > 0 && (
            <div style={OB.searchResults}>
              {onboardSearchResults.map(r => (
                <div key={r.symbol} style={OB.searchItem}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2d4a' }}>{r.symbol}</div>
                    <div style={{ fontSize: 10, color: '#7a8ea3' }}>{r.name}</div>
                  </div>
                  {onboardSelected.has(r.symbol) ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#2a7d4b', padding: '4px 12px' }}>Added ✓</span>
                  ) : (
                    <button style={OB.searchAddBtn} onClick={() => toggleOnboardTicker(r.symbol)}>+ Add</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {onboardSearchLoading && <div style={{ padding: '8px 20px', fontSize: 11, color: '#7a8ea3' }}>Searching...</div>}

          {/* Scrollable picks area */}
          <div style={OB.scrollArea}>
            {/* Trending */}
            <div style={OB.section}>
              <div style={OB.sectionTitle}>
                <span style={{ fontSize: 14 }}>🔥</span> Trending Now
              </div>
              <div style={OB.trendingGrid}>
                {ONBOARD_TRENDING.map(t => {
                  const sel = onboardSelected.has(t.symbol);
                  const p = onboardPrices[t.symbol];
                  const chg = p?.change;
                  return (
                    <div
                      key={t.symbol}
                      style={{ ...OB.trendingChip, ...(sel ? OB.trendingChipSel : {}) }}
                      onClick={() => toggleOnboardTicker(t.symbol)}
                    >
                      <span style={OB.tcTicker}>{t.symbol}</span>
                      {chg != null && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: chg >= 0 ? '#2a7d4b' : '#e05252' }}>
                          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                        </span>
                      )}
                      <span style={{ fontSize: sel ? 13 : 16, color: sel ? '#2a7d4b' : '#b0bec5' }}>
                        {sel ? '✓' : '+'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sectors */}
            <div style={OB.section}>
              <div style={OB.sectionTitle}>
                <span style={{ fontSize: 14 }}>📊</span> Browse by Sector
              </div>
              {ONBOARD_SECTORS.map(sector => (
                <div key={sector.name} style={OB.sectorGroup}>
                  <div style={OB.sectorLabel}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sector.color, display: 'inline-block' }} />
                    {sector.name}
                  </div>
                  <div style={OB.sectorStocks}>
                    {sector.tickers.map(t => {
                      const sel = onboardSelected.has(t);
                      return (
                        <div
                          key={t}
                          style={{ ...OB.sectorStock, ...(sel ? OB.sectorStockSel : {}) }}
                          onClick={() => toggleOnboardTicker(t)}
                        >
                          {t} <span style={{ fontSize: 13, color: sel ? '#2a7d4b' : '#c0c8d0' }}>{sel ? '✓' : '+'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer CTA */}
          <div style={OB.footer}>
            <button
              style={{ ...OB.cta, ...(onboardSelected.size === 0 ? { opacity: 0.5 } : {}) }}
              onClick={finishOnboarding}
              disabled={onboardSelected.size === 0}
            >
              Build My Watchlist{onboardSelected.size > 0 ? ` (${onboardSelected.size})` : ''} →
            </button>
            <div style={OB.skip} onClick={skipOnboarding}>Skip for now</div>
          </div>
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

        {/* Search overlay moved inline into My List card below */}

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
            <div style={{ ...S.resCard, ...(researchSector === '__mylist__' ? { borderRadius: '12px 12px 0 0' } : {}) }}>
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
                        <span style={{ ...S.resColTicker, flex: 1 }}>Ticker</span>
                        <span style={{ ...S.resColPrice, flex: 'none', minWidth: 70, textAlign: 'right' }}>Price</span>
                        <span style={{ ...S.resColScore, flex: 'none', minWidth: 80, textAlign: 'right' }}>CHG%</span>
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
                              <span style={{ ...S.resTicker, flex: 1 }}>{stock.ticker}</span>
                              <span style={{ ...S.resPrice, flex: 'none', minWidth: 70 }}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                              <span style={{ flex: 'none', minWidth: 80, textAlign: 'right' }}>
                                {priceData ? (
                                  <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: isUp ? '#2a7d4b' : chg < 0 ? '#e05252' : '#5a7080',
                                  }}>
                                    {isUp ? '▲' : chg < 0 ? '▼' : ''}{chg != null ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#7a8ea3' }}>—</span>
                                )}
                              </span>
                              <span
                                style={S.wlRemoveBtn}
                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.id, stock.ticker); }}
                                title="Remove"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2a7d4b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>
                                </svg>
                              </span>
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
                </>
              )}
            </div>
          )}

          {/* Add ticker search — below the card, always visible when My List is active */}
          {researchSector === '__mylist__' && (
            <div style={S.wlAddSection}>
              <div style={S.wlAddSearchBar} onClick={() => { if (!showSearch) setShowSearch(true); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a8ea3" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                {showSearch ? (
                  <input
                    ref={searchRef}
                    style={S.searchInputLight}
                    placeholder="Search ticker or company..."
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <span style={{ fontSize: 12, color: '#7a8ea3' }}>+ Add ticker...</span>
                )}
                {showSearch && searchQuery && (
                  <span style={{ color: '#7a8ea3', cursor: 'pointer', fontSize: 16 }} onClick={(e) => { e.stopPropagation(); setSearchQuery(''); setSearchResults([]); }}>×</span>
                )}
                <span
                  style={S.wlAddBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showSearch) {
                      setShowSearch(false); setSearchQuery(''); setSearchResults([]);
                    } else {
                      setShowSearch(true);
                    }
                  }}
                >
                  {showSearch ? 'Done' : '+ Add'}
                </span>
              </div>
              {showSearch && searchResults.length > 0 && (
                <div style={{ marginTop: 6 }}>
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
              {showSearch && searchLoading && <div style={{ padding: '6px 0', fontSize: 11, color: '#7a8ea3', textAlign: 'center' }}>Searching...</div>}
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
              style={S.privateChatBtn}
              onClick={() => onTabChange?.('profile')}
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
                chatMessages.map((msg, i) => {
                  const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
                  const isAIQuestion = msg.type === 'user' && /@AI\b/i.test(msg.text);
                  if (isAI || isAIQuestion) {
                    return (
                      <FadingMessage key={msg.id || i} delay={60000} duration={5000} onRemove={() => setChatMessages(prev => prev.filter(m => m.id !== msg.id))}>
                        <ChatBubble msg={msg} />
                      </FadingMessage>
                    );
                  }
                  return <ChatBubble key={msg.id || i} msg={msg} />;
                })
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
    background: '#2a7d4b', color: '#fff', fontSize: 13, fontWeight: 600,
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
  statusText: { fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' },
  avatar: {
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600, color: '#f0ede8', cursor: 'pointer',
  },
  profileMenu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: -4, width: 130,
    background: '#132d52', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden',
  },
  pmName: { fontSize: 13, fontWeight: 600, color: '#e0e0e0', padding: '9px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  pmItem: { fontSize: 13, fontWeight: 500, color: '#2a7d4b', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' },

  // ── Market Ticker Bar ──
  combinedBar: { background: '#1a3a5e', flexShrink: 0 },
  barContent: { padding: '6px 0', minHeight: 30 },
  barScroll: { overflow: 'hidden', display: 'flex', alignItems: 'center' },
  pulseItem: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px' },
  pulseName: { fontSize: 12, fontWeight: 500, color: '#4a6178' },
  pulseVal: { fontSize: 12, fontWeight: 700 },

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
  wlPopLabel: { fontSize: 11, color: '#3e5568', marginRight: 2, alignSelf: 'center' },
  wlPopChip: {
    fontSize: 12, fontWeight: 600, color: '#2a7d4b',
    background: 'rgba(42,125,75,0.08)', border: '1px solid rgba(42,125,75,0.2)',
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
  },


  // ── Briefing ──
  briefSection: { padding: '12px 14px 8px' },
  briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  briefTitle: { fontSize: 15, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em' },
  briefTime: { fontSize: 11, color: '#7a8ea3' },
  briefToggle: { fontSize: 12, color: '#2a7d4b', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  briefCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 12,
    padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
  },
  bfTickers: { fontSize: 11, fontWeight: 700, color: '#2a7d4b', marginBottom: 2 },
  bfTitle: { fontSize: 13, color: '#1a2d4a', fontWeight: 500, lineHeight: 1.3 },
  bfLink: { color: '#2a7d4b', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
  briefEmpty: { background: '#f8fafc', border: '1px solid #d8e2ed', borderRadius: 12, padding: 16, textAlign: 'center', fontSize: 13, color: '#7a8ea3' },

  // ── Research section ──
  resSection: { padding: '12px 14px 8px' },
  resHeader: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  resTitle: { fontSize: 15, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em' },
  resSub: { fontSize: 11, color: '#7a8ea3', fontWeight: 500 },
  resPills: { display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none' },
  resPill: {
    flexShrink: 0, padding: '5px 14px', borderRadius: 14, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: '1px solid #d8e2ed', background: '#fff', color: '#2a7d4b',
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
  resRank: { fontSize: 12, fontWeight: 700, color: '#7a8ea3', minWidth: 24 },
  resTicker: { fontSize: 13, fontWeight: 700, color: '#1a2d4a', flex: 1 },
  resScoreWrap: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 },
  resScoreBadge: {
    fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 8, textAlign: 'center',
  },
  resPrice: { fontSize: 13, fontWeight: 600, color: '#3a5068', minWidth: 70, textAlign: 'right' },
  resHeaderRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
    borderBottom: '1.5px solid #d8e2ed', background: '#f8fafc',
  },
  resColRank: { fontSize: 11, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 24 },
  resColTicker: { fontSize: 11, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 },
  resColScore: { fontSize: 11, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 36, textAlign: 'center', flex: 1 },
  resColPrice: { fontSize: 11, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 70, textAlign: 'right' },
  resChev: { fontSize: 10, color: '#2a7d4b' },
  resExpandedBody: {
    padding: '6px 12px 8px 36px', background: '#f8fafc', borderTop: '1px solid #eef2f7',
  },
  resMetrics: {
    fontSize: 12, color: '#2a7d4b', fontWeight: 600, lineHeight: 1.5, marginBottom: 4,
  },
  resThesis: {
    fontSize: 13, color: '#4a6178', lineHeight: 1.4,
  },

  // ── Chat section ──
  chatSection: { padding: '12px 14px 8px' },
  csHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  csTitle: { fontSize: 15, fontWeight: 700, color: '#1a2d4a', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 },
  csLive: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#2a7d4b', fontWeight: 500 },
  csLiveDot: { width: 5, height: 5, borderRadius: '50%', background: '#2a7d4b', animation: 'pulse 1.5s ease-in-out infinite' },
  privateChatBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 600, color: '#fff',
    background: '#2a7d4b', border: 'none', borderRadius: 12,
    padding: '5px 12px', cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(42,125,75,0.3)',
    fontFamily: 'inherit',
  },

  // ── My Groups section ──
  groupSection: { padding: '12px 14px 16px' },
  groupSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupSectionTitle: { fontSize: 15, fontWeight: 700, color: '#132d52', letterSpacing: '-0.01em' },
  groupCreateBtn: {
    fontSize: 13, fontWeight: 600, color: '#2a7d4b', background: 'none', border: 'none',
    cursor: 'pointer', padding: '4px 0',
  },
  myGroupsPills: { display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, justifyContent: 'center', flexWrap: 'wrap' },
  myGroupPill: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    borderRadius: 12, border: '1px solid #d8e2ed', background: '#fff', cursor: 'pointer',
  },
  myGroupName: { fontSize: 14, fontWeight: 600, color: '#1a2d4a' },
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
  groupCtaTitle: { fontSize: 15, fontWeight: 700, color: '#132d52', marginBottom: 2 },
  groupCtaSub: { fontSize: 12, color: '#5a8a6a', lineHeight: 1.3 },

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
  ccName: { fontSize: 13, fontWeight: 600 },
  ccTime: { fontSize: 11, color: '#7a8ea3', marginLeft: 'auto' },
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
    cursor: 'pointer', borderRadius: '50%',
    transition: 'opacity 0.15s', opacity: 0.7,
  },
  wlAddSection: {
    padding: '8px 12px',
    background: '#fff', border: '1px solid #d8e2ed', borderTop: 'none',
    borderRadius: '0 0 12px 12px', marginTop: -1,
  },
  wlAddSearchBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1.5px solid #d8e2ed', borderRadius: 12,
    padding: '8px 12px', cursor: 'text',
  },
  wlAddBtn: {
    flexShrink: 0, marginLeft: 'auto',
    fontSize: 12, fontWeight: 700, color: '#fff',
    background: '#2a7d4b', border: 'none',
    borderRadius: 12, padding: '5px 12px', cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(42,125,75,0.3)',
  },

  // ── Search overlay (light theme) ──
  searchOverlay: {
    padding: '10px 14px', background: '#fff', border: '1px solid #d8e2ed',
    borderRadius: 12, margin: '8px 14px 0',
  },
  searchBarLight: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#f5f7fa', border: '1px solid #d8e2ed',
    borderRadius: 12, padding: '7px 12px',
  },
  searchInputLight: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontFamily: 'inherit', fontSize: 13, color: '#1a2d4a',
  },
  searchResultsLight: {
    marginTop: 6, background: '#f8fafc',
    border: '1px solid #d8e2ed', borderRadius: 12, overflow: 'hidden',
  },
  searchItemLight: {
    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid #f0f3f6', cursor: 'pointer',
  },
  siAddBtnLight: {
    fontSize: 12, fontWeight: 600, color: '#2a7d4b', background: 'rgba(42,125,75,0.08)',
    border: '1px solid rgba(42,125,75,0.2)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

// ═══════════════════════════════════════
// ONBOARDING STYLES
// ═══════════════════════════════════════
const OB = {
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(238,242,247,0.98)', zIndex: 100,
    display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  header: { textAlign: 'center', padding: '28px 20px 4px' },
  wave: { fontSize: 32, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: '#132d52', marginBottom: 4, letterSpacing: '-0.02em' },
  sub: { fontSize: 13, color: '#5a7080', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' },

  progress: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '10px 20px 4px',
  },
  count: { fontSize: 12, fontWeight: 600, color: '#132d52' },
  barTrack: { flex: 1, maxWidth: 180, height: 4, background: '#d8e2ed', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: '#2a7d4b', borderRadius: 4, transition: 'width 0.4s ease' },

  search: {
    margin: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1.5px solid #d8e2ed', borderRadius: 12, padding: '10px 14px',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontFamily: 'inherit', fontSize: 13, color: '#1a2d4a',
  },
  searchResults: {
    margin: '6px 20px 0', background: '#fff', border: '1px solid #d8e2ed',
    borderRadius: 10, overflow: 'hidden',
  },
  searchItem: {
    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid #f0f3f6',
  },
  searchAddBtn: {
    fontSize: 11, fontWeight: 600, color: '#2a7d4b', background: 'rgba(42,125,75,0.08)',
    border: '1px solid rgba(42,125,75,0.2)', borderRadius: 8, padding: '4px 12px',
    cursor: 'pointer', fontFamily: 'inherit',
  },

  scrollArea: { flex: 1, overflowY: 'auto', paddingBottom: 8 },

  section: { padding: '12px 20px 4px' },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: '#7a8ea3', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  },

  trendingGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  trendingChip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12,
    background: '#fff', border: '1.5px solid #d8e2ed', cursor: 'pointer', transition: 'all 0.2s',
  },
  trendingChipSel: { borderColor: '#2a7d4b', background: 'rgba(42,125,75,0.06)' },
  tcTicker: { fontSize: 13, fontWeight: 700, color: '#132d52' },

  sectorGroup: { marginBottom: 14 },
  sectorLabel: {
    fontSize: 11, fontWeight: 600, color: '#5a7080', marginBottom: 6, paddingLeft: 2,
    display: 'flex', alignItems: 'center', gap: 5,
  },
  sectorStocks: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  sectorStock: {
    padding: '6px 12px', borderRadius: 12, background: '#fff', border: '1px solid #d8e2ed',
    fontSize: 12, fontWeight: 600, color: '#1a2d4a', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  sectorStockSel: { borderColor: '#2a7d4b', background: 'rgba(42,125,75,0.08)', color: '#2a7d4b' },

  footer: { padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  cta: {
    width: '100%', padding: 14, border: 'none', borderRadius: 14,
    fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    background: '#2a7d4b', color: '#fff', boxShadow: '0 4px 16px rgba(42,125,75,0.25)',
    transition: 'all 0.2s',
  },
  skip: {
    textAlign: 'center', fontSize: 13, color: '#7a8ea3', cursor: 'pointer',
    padding: 4, fontWeight: 500,
  },
};
