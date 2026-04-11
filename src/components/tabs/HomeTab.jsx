// ============================================
// UPTIKALERTS — HomeTab.jsx (Redesigned V1)
// Slim header → thin pulse → watchlist → briefing → live chat w/ AI
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { isWeekend, isMarketHoliday, isMarketOpen, isAfterHours } from '../../utils/marketUtils';
import { askUpTikAI } from '../../lib/aiAgent';
import { getBatchQuotes } from '../../lib/polygonQuote';
import CreateGroupModal from '../shared/CreateGroupModal';
import InviteModal from '../shared/InviteModal';
import StickerPicker, { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';

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

export default function HomeTab({ session, onGroupSelect, onSignOut, onProfilePress, onTabChange, scrollToChatRef, onOpenDMs, onStartDM }) {
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
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);

  useEffect(() => {
    if (!showSectorDropdown) return;
    const handleClick = () => setShowSectorDropdown(false);
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [showSectorDropdown]);

  // ── Onboarding state (first-login flow) ──
  const [showOnboarding, setShowOnboarding]     = useState(false);
  const [onboardSelected, setOnboardSelected]   = useState(new Set());
  const [onboardPrices, setOnboardPrices]       = useState({});
  const [onboardSearch, setOnboardSearch]        = useState('');
  const [onboardSearchResults, setOnboardSearchResults] = useState([]);
  const [onboardSearchLoading, setOnboardSearchLoading] = useState(false);
  const onboardSearchTimeout = useRef(null);

  // ── Chat input state (sends from Home page) ──
  const [chatInput, setChatInputRaw]            = useState(() => localStorage.getItem('uptik_chat_draft') || '');
  const setChatInput = (val) => { setChatInputRaw(val); if (val) localStorage.setItem('uptik_chat_draft', val); else localStorage.removeItem('uptik_chat_draft'); };
  const [chatSending, setChatSending]           = useState(false);
  const [aiMode, setAiMode]                     = useState(() => localStorage.getItem('uptik_ai_mode') === '1');
  useEffect(() => { localStorage.setItem('uptik_ai_mode', aiMode ? '1' : '0'); }, [aiMode]);
  const [chatExpanded, setChatExpanded]          = useState(false);
  const [aiLoading, setAiLoading]               = useState(false);
  const [aiLastTicker, setAiLastTicker]         = useState(null);
  const [isListening, setIsListening]           = useState(false);
  const recognitionRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatStripRef = useRef(null);
  const chatSectionRef = useRef(null);
  const chatBarRef = useRef(null);

  // ── Voice input (Web Speech API) ──
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('Voice input not supported on this browser'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalTranscript = '';
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setChatInput(chatInput + finalTranscript + interim);
    };
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Cleanup on unmount
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  // Pin scroll to the latest chat message — works whether the chat is the scroller
  // (expanded mode) or the page is the scroller (collapsed mode on Home)
  useEffect(() => {
    const el = chatStripRef.current;
    if (!el) return;
    // Find the actual scroller (inner container, ancestor, or window)
    const findScroller = () => {
      if (el.scrollHeight > el.clientHeight) return el;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const scroller = findScroller();
    const nearBottom = () => {
      const isWin = scroller === document.scrollingElement || scroller === document.documentElement;
      const top = isWin ? window.scrollY : scroller.scrollTop;
      const h = isWin ? document.documentElement.scrollHeight : scroller.scrollHeight;
      const ch = isWin ? window.innerHeight : scroller.clientHeight;
      return h - top - ch < 120;
    };
    // If the user has scrolled up to read history, don't yank them back
    if (!nearBottom()) return;
    const pin = () => {
      if (!nearBottom()) return; // bail if user scrolled away mid-pin
      const isWin = scroller === document.scrollingElement || scroller === document.documentElement;
      if (isWin) window.scrollTo(0, document.documentElement.scrollHeight);
      else scroller.scrollTop = scroller.scrollHeight;
    };
    const raf = requestAnimationFrame(pin);
    const t1 = setTimeout(pin, 80);
    const t2 = setTimeout(pin, 250);
    const t3 = setTimeout(pin, 600);
    const t4 = setTimeout(pin, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, [chatMessages.length, aiLoading]);


  // Expose scrollToChat for parent (when Chat bottom nav is tapped)
  useEffect(() => {
    if (scrollToChatRef) {
      scrollToChatRef.current = () => {
        chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (isMarketHoliday()) return 'closed';
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
      return; // disabled for now — re-enable by removing this line
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
    localStorage.setItem('uptik_onboarding_done', '1');
    setShowOnboarding(false);
    // Batch add all selected tickers to watchlist
    if (tickers.length > 0) {
      const inserts = tickers.map(symbol => ({
        user_id: session.user.id,
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

  const sectorLabels = (() => {
    const SHORT = { 'Communication Services': 'Communication', 'Communication': 'Communication', 'Consumer Discretionary': 'Consumer', 'Consumer Cyclical': 'Consumer', 'Consumer Defensive': 'Consumer', 'Consumer Staples': 'Consumer', 'Information Technology': 'Tech', 'Technology': 'Tech', 'Industrials': 'Industrial', 'Industrial': 'Industrial', 'Financial Services': 'Finance', 'Finance': 'Finance', 'Real Estate': 'Real Estate', 'RealEstate': 'Real Estate', 'Basic Materials': 'Materials', 'Materials': 'Materials' };
    const seen = new Set();
    return researchSectors.filter(sec => sec !== 'Auto' && sec !== 'ETF').filter(sec => {
      const label = SHORT[sec] || sec;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    }).map(sec => SHORT[sec] || sec);
  })();

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

  // ── Sticker → insert emoji into input ──
  const handleHomeSendSticker = (sticker) => {
    const current = chatInputRef.current?.value || '';
    setChatInput(current + sticker.emoji);
    if (chatInputRef.current) chatInputRef.current.focus();
  };

  // ── Send message from Home page ──
  const handleHomeSend = async () => {
    const raw = chatInput.trim();
    if (!raw || chatSending || !profile || !homeGroup) return;
    const text = aiMode ? `@AI ${raw}` : raw;

    chatInputRef.current?.blur();
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
        // Append in place — no slicing/truncation (avoids flicker on send)
        setChatMessages(prev => [...prev, data]);
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
            // Build recent history from chat messages for pronoun resolution
            const recentHistory = chatMessages
              .filter(m => m.user_id === 'user_ai' || /@AI\b/i.test(m.text))
              .slice(-8)
              .map(m => ({
                role: m.user_id === 'user_ai' ? 'assistant' : 'user',
                content: (m.text || '').replace(/@AI\s*/i, ''),
              }));
            const { text: aiReply, newLastTicker } = await askUpTikAI({
              userText: query,
              history: recentHistory,
              lastTicker: aiLastTicker,
              username: profile?.username,
              groupName: homeGroup?.name,
              watchlist: watchlist.map(w => w.symbol),
            });
            if (newLastTicker) setAiLastTicker(newLastTicker);
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
        // Note: no loadChatPreview() refetch — local state is already up to date,
        // and refetching would remount FadingMessage and cause a screen flicker.
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
  // ── Futures / off-hours ticker ──
  // Uses FMP real index + commodity quotes (^GSPC, ^IXIC, ^DJI, GCUSD, CLUSD)
  // Shows percentage only — no full price (these are index levels, not tradeable prices)
  const FUTURES_MAP = {
    'ES=F':  'S&P Fut',
    'NQ=F':  'Nas Fut',
    'YM=F':  'Dow Fut',
    'GC=F':  'Gold',
    'CL=F':  'Oil',
  };

  const loadFutures = async () => {
    console.log('[Futures] Loading real futures data...');

    // ── PRIMARY: Supabase edge function (server-side Yahoo, no CORS issues) ──
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-futures`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.futures?.length > 0) {
          const pulse = {};
          const labels = [];
          data.futures.forEach(f => {
            pulse[f.symbol] = { price: f.price, change: f.pctChange, label: 'FUT', isFutures: true };
            labels.push({ key: f.symbol, label: f.label });
          });
          console.log(`[Futures] Edge function: ${data.futures.length}/5`, data.futures.map(f => `${f.label} ${f.pctChange.toFixed(2)}%`));
          setFuturesData(pulse);
          setFuturesLabels(labels);
          return; // success
        }
      }
      console.warn('[Futures] Edge function returned no data, trying CORS proxies...');
    } catch (err) {
      console.warn('[Futures] Edge function failed:', err.message);
    }

    // ── FALLBACK: CORS proxies for Yahoo Finance ──
    const symbols = Object.keys(FUTURES_MAP).join(',');
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const CORS_PROXIES = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    ];

    for (const proxyUrl of CORS_PROXIES) {
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;
        const data = await res.json();
        const quotes = data.quoteResponse?.result;
        if (!quotes || quotes.length === 0) continue;

        const pulse = {};
        const labels = [];
        for (const sym of Object.keys(FUTURES_MAP)) {
          const q = quotes.find(r => r.symbol === sym);
          if (!q) continue;
          const price = q.regularMarketPrice;
          const prev = q.regularMarketPreviousClose || q.previousClose;
          if (!price || !prev) continue;
          const pctChange = ((price - prev) / prev) * 100;
          pulse[sym] = { price, change: pctChange, label: 'FUT', isFutures: true };
          labels.push({ key: sym, label: FUTURES_MAP[sym] });
        }

        if (labels.length >= 1) {
          console.log(`[Futures] CORS proxy: ${labels.length}/5`);
          setFuturesData(pulse);
          setFuturesLabels(labels);
          return;
        }
      } catch {}
    }

    // ── All Yahoo methods failed — ETF fallback ──
    console.log('[Futures] All Yahoo failed, falling back to ETFs');
    await loadFuturesETFFallback();
  };

  // ETF fallback: use SPY/QQQ/DIA if FMP index quotes don't work
  const loadFuturesETFFallback = async () => {
    if (!FMP_KEY) return;
    const etfMap = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow', GLD: 'Gold', USO: 'Oil' };
    const tickers = Object.keys(etfMap);
    try {
      const results = await Promise.allSettled(
        tickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const pulse = {};
      const futLabels = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          const ticker = tickers[idx];
          if (q.price) {
            const pctChange = q.changesPercentage ?? q.changePercentage ?? 0;
            pulse[ticker] = { price: q.price, change: pctChange, label: 'FUT', isFutures: true };
            futLabels.push({ key: ticker, label: etfMap[ticker] });
          }
        }
      });
      if (futLabels.length > 0) {
        setFuturesData(pulse);
        setFuturesLabels(futLabels);
      }
    } catch (err) {
      console.error('[Futures ETF Fallback] Error:', err.message);
    }
  };

  // ── FMP Fallback: always-available ticker data ──
  // Writes to marketPulse + marketIndicators (not futures) so it works during any market status
  const loadFMPFallback = async () => {
    if (!FMP_KEY) return;
    const fallbackTickers = ['SPY', 'QQQ', 'DIA', 'IWM', 'AAPL'];
    const fallbackLabels = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow', IWM: 'Russell', AAPL: 'Apple' };
    try {
      const results = await Promise.allSettled(
        fallbackTickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const pulse = {};
      const indicators = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          const ticker = fallbackTickers[idx];
          if (q.price) {
            pulse[ticker] = { price: q.price, change: q.changesPercentage ?? q.changePercentage ?? 0, label: '' };
            indicators.push({ ticker, label: fallbackLabels[ticker] || ticker, position: idx });
          }
        }
      });
      if (Object.keys(pulse).length > 0) {
        setMarketPulse(prev => ({ ...prev, ...pulse }));
        setMarketIndicators(prev => prev.length > 0 ? prev : indicators);
      }
    } catch (err) {
      console.error('[FMP Fallback] Error:', err.message);
    }
  };

  const loadMarketIndicators = async () => {
    const { data } = await supabase
      .from('market_indicators')
      .select('*')
      .order('position', { ascending: true });
    if (data && data.length > 0) {
      setMarketIndicators(data);
      await loadMarketPulse(data);
      const status = getMarketStatus();
      if (status !== 'open') await loadFutures();
    } else {
      // No indicators in DB — go straight to FMP fallback
      await loadFMPFallback();
    }
  };

  const loadMarketPulse = async (indicators = marketIndicators) => {
    try {
      const tickers = indicators.map(m => m.ticker);
      if (tickers.length === 0) return;

      // Try Polygon first (works during market hours + extended hours)
      const fetchTickers = isAfterHours()
        ? tickers.filter(t => ['SPY', 'QQQ', 'DIA'].includes(t))
        : tickers;

      let pulse = {};
      let polygonWorked = false;

      if (fetchTickers.length > 0 && !isWeekend() && !isMarketHoliday()) {
        try {
          const res = await fetch(
            `https://api.polygon.io/v3/snapshot?ticker.any_of=${fetchTickers.join(',')}&apiKey=${POLYGON_KEY}`
          );
          const data = await res.json();

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
          polygonWorked = Object.keys(pulse).length > 0;
        } catch {
          polygonWorked = false;
        }
      }

      // FMP fallback — if Polygon returned nothing (weekend, holiday, API issue)
      if (!polygonWorked && FMP_KEY) {
        const fmpTickers = tickers.length > 0 ? tickers : ['SPY', 'QQQ', 'DIA'];
        try {
          const results = await Promise.allSettled(
            fmpTickers.map(t =>
              fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
                .then(r => r.json())
            )
          );
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
              const q = r.value[0];
              const ticker = fmpTickers[idx];
              if (q.price) {
                pulse[ticker] = { price: q.price, change: q.changesPercentage ?? q.changePercentage ?? 0, label: '' };
              }
            }
          });
        } catch (err) {
          console.error('[MarketPulse FMP fallback] Error:', err.message);
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

    const { data, error } = await supabase
      .from('user_watchlist')
      .insert({ user_id: session.user.id, symbol: upper })
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
    const { error } = await supabase.from('user_watchlist').delete().eq('id', id);
    if (error) { console.error('[HomeTab] Remove watchlist failed:', error.message); return; }
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
      const upper = query.toUpperCase();
      const majorExchanges = new Set(['XNYS', 'XNAS', 'XASE']);
      // Exact ticker match + text search (US stocks only) in parallel
      const [exactRes, searchRes] = await Promise.all([
        fetch(`https://api.polygon.io/v3/reference/tickers?ticker=${upper}&active=true&apiKey=${POLYGON_KEY}`),
        fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&market=stocks&locale=us&limit=8&apiKey=${POLYGON_KEY}`),
      ]);
      const [exactData, searchData] = await Promise.all([exactRes.json(), searchRes.json()]);
      // Filter text search results to major US exchanges (excludes OTC/pink sheets)
      const filtered = (searchData.results || []).filter(t =>
        majorExchanges.has(t.primary_exchange)
      );
      // Merge: exact match first, then filtered results (deduplicated)
      const seen = new Set();
      const merged = [];
      for (const t of [...(exactData.results || []), ...filtered]) {
        if (!seen.has(t.ticker)) {
          seen.add(t.ticker);
          merged.push(t);
        }
      }
      setSearchResults(merged.slice(0, 6).map(t => ({
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
  return (
    <div style={S.outerWrap}>

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
            <span style={OB.count}><span style={{ color: 'var(--green-btn)' }}>{onboardSelected.size}</span> selected</span>
            <div style={OB.barTrack}>
              <div style={{ ...OB.barFill, width: `${Math.min((onboardSelected.size / 5) * 100, 100)}%` }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>min 1</span>
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
              <span style={{ color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }} onClick={() => { setOnboardSearch(''); setOnboardSearchResults([]); }}>×</span>
            )}
          </div>

          {/* Search results */}
          {onboardSearchResults.length > 0 && (
            <div style={OB.searchResults}>
              {onboardSearchResults.map(r => (
                <div key={r.symbol} style={OB.searchItem}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{r.symbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.name}</div>
                  </div>
                  {onboardSelected.has(r.symbol) ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-btn)', padding: '4px 12px' }}>Added ✓</span>
                  ) : (
                    <button style={OB.searchAddBtn} onClick={() => toggleOnboardTicker(r.symbol)}>+ Add</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {onboardSearchLoading && <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--text3)' }}>Searching...</div>}

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
                        <span style={{ fontSize: 11, fontWeight: 600, color: chg >= 0 ? '#1AAD5E' : 'var(--red)' }}>
                          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                        </span>
                      )}
                      <span style={{ fontSize: sel ? 13 : 16, color: sel ? '#1AAD5E' : '#7a8ea3' }}>
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
                          {t} <span style={{ fontSize: 13, color: sel ? '#1AAD5E' : '#c0c8d0' }}>{sel ? '✓' : '+'}</span>
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
          <div>
            <div style={S.logoRow}>
              <svg width="30" height="30" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -5, verticalAlign: 'bottom', position: 'relative', top: 6 }}>
                <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
                <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
                <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
                <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
              </svg>
              <span style={S.logoUp}>p</span><span style={S.logoTik}>tik</span>
            </div>
            <div style={S.logoAlerts}>a l e r t s</div>
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

        {/* ── STOCKS ── */}
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
              My List{hasWatchlist ? ` (${watchlist.length})` : ''}
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
                      style={{ ...S.sectorDropItem, ...(researchSector === label ? { color: 'var(--green-btn)', fontWeight: 600 } : {}) }}
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
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
                ) : researchStocks.length === 0 ? (
                  researchSector === '__mylist__' ? (
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 10 }}>No tickers in your list yet</div>
                      <div style={S.wlPopRow}>
                        <span style={S.wlPopLabel}>Popular:</span>
                        {POPULAR_TICKERS.map(t => (
                          <span key={t} style={{ ...S.wlPopChip, ...(addingTicker === t ? { opacity: 0.5 } : {}) }} onClick={() => addToWatchlist(t)}>{t}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
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
                          style={{ ...S.stocksRow, ...(isOpen ? { background: '#f8fafc' } : {}) }}
                          onClick={() => !isMyList && setResearchExpanded(isOpen ? null : stock.id)}
                        >
                          {isMyList ? (
                            <>
                              <span style={{ ...S.stocksRowTk, flex: 1 }}>{stock.ticker}</span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, fontWeight: 600, color: isUp ? '#1AAD5E' : chg < 0 ? 'var(--red)' : '#7a8ea3' }}>
                                {chg != null ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                              </span>
                              <span
                                style={{ width: 24, textAlign: 'center', fontSize: 14, color: 'var(--border)', cursor: 'pointer' }}
                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.id, stock.ticker); }}
                              >×</span>
                            </>
                          ) : (
                            <>
                              <span style={{ width: 28, fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>#{stock.ranking}</span>
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
                              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>
                                {priceData ? `$${priceData.price.toFixed(2)}` : '—'}
                              </span>
                            </>
                          )}
                        </div>
                        {!isMyList && isOpen && (
                          <div style={S.stocksExpand}>
                            {stock.notes && <div style={{ fontSize: 11, color: 'var(--text1)', lineHeight: 1.5 }}>{stock.notes}</div>}
                            {stock.thesis && <div style={{ fontSize: 11, color: '#5a6f85', lineHeight: 1.5, marginTop: 4 }}>{stock.thesis}</div>}
                            {!stock.thesis && !stock.notes && <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No analysis available yet</div>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {researchSector === '__mylist__' && (
                <div style={S.stocksAddBar}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a8ea3" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
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
                    <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1, cursor: 'pointer' }} onClick={() => setShowSearch(true)}>+ Add ticker...</span>
                  )}
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-btn)', cursor: 'pointer' }}
                    onClick={() => {
                      if (showSearch) { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }
                      else setShowSearch(true);
                    }}
                  >{showSearch ? 'Done' : '+ Add'}</span>
                </div>
              )}

              {researchSector === '__mylist__' && showSearch && searchResults.length > 0 && (
                <div style={{ maxHeight: 120, overflowY: 'auto', borderTop: '1px solid #f0f4f8' }}>
                  {searchResults.map(r => (
                    <div key={r.symbol} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f5f7fa' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{r.symbol}</div>
                        <div style={{ fontSize: 9, color: 'var(--text3)' }}>{r.name}</div>
                      </div>
                      {r.alreadyAdded ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Added ✓</span>
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
                <div style={{ padding: '6px 0', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>Searching...</div>
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
                chatMessages.map((msg, i) => (
                  <ChatBubble key={msg.id || i} msg={msg} myId={session?.user?.id} onTapUsername={(userId, username) => {
                    if (onStartDM) { onStartDM(userId, username); onTabChange?.('chat'); }
                  }} />
                ))
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
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
                    background: '#fff',
                    border: '1px solid #d8e2ed',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--text1)',
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
            placeholder={aiMode ? 'Ask AI anything...' : 'Message UpTik Public...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleHomeSend(); } }}
          />
          <div
            style={{ ...S.ccMic, ...(isListening ? S.ccMicActive : {}) }}
            onClick={toggleListening}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isListening ? '#fff' : '#7a8ea3'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function ChatBubble({ msg, myId, onTapUsername }) {
  const name = msg.username || msg.profiles?.username || 'User';
  const colors = ['#1AAD5E', '#7B68EE', '#FF7043', '#4CAF50', '#E91E63', '#FF9800'];
  const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
  const isMe = !isAI && myId && msg.user_id === myId;
  const canTap = !isAI && !isMe && onTapUsername;
  const color = isAI ? '#8B5CF6' : (msg.user_color || colors[name.charCodeAt(0) % colors.length]);
  const timeAgo = getTimeAgo(msg.created_at);

  const rawText = msg.text || msg.content || '';

  // Sticker messages — render emoji inline
  if (isSticker(rawText)) {
    const s = STICKERS.find(st => st.id === getStickerId(rawText));
    return (
      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 12px', margin: '0 6px' }}>
        {!isMe && <div style={{ ...S.ccAv, background: color, marginRight: 8 }}>{name[0].toUpperCase()}</div>}
        <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
      </div>
    );
  }

  // For AI messages, parse the ```uptik {json}``` envelope into a clean card + prose
  let card = null;
  let proseText = rawText;
  if (isAI) {
    const m = rawText.match(/`{1,3}\s*uptik\s*([\s\S]*?)`{3}/i);
    if (m) {
      try {
        const jsonStr = m[1].trim().replace(/,\s*([}\]])/g, '$1');
        card = JSON.parse(jsonStr);
      } catch (e) { card = null; }
      proseText = rawText.replace(m[0], '').trim();
    }
    proseText = proseText.replace(/^`+\s*/, '').replace(/`+$/, '').trim();
  }

  const segments = isAI ? proseText.split(/\s*•\s+/) : [proseText];
  const intro = segments[0] || '';
  const bullets = isAI ? segments.slice(1).map(s => s.trim()).filter(Boolean) : [];

  const renderInline = (txt) => txt.split(/(\$[A-Z]{1,5})/g).map((p, i) =>
    p.startsWith('$') && /^\$[A-Z]{1,5}$/.test(p) ? <span key={i} style={S.ccTk}>{p}</span> : p
  );

  // iMessage-style right-align for the current user's own messages
  if (isMe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px', background: '#f8fafc', borderRadius: 10, margin: '0 6px' }}>
        <div style={{
          maxWidth: '78%',
          background: '#1AAD5E',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '16px 16px 4px 16px',
          fontSize: 13,
          lineHeight: 1.4,
          fontFamily: 'inherit',
          wordBreak: 'break-word',
        }}>
          {renderInline(proseText)}
        </div>
      </div>
    );
  }

  // Left-align for AI and other users
  return (
    <div style={S.ccMsg}>
      <div style={{ ...S.ccAv, background: color }}>{name[0].toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.ccTop}>
          <span
            style={{
              ...S.ccName, color,
              ...(canTap ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: color, textUnderlineOffset: 2, opacity: 0.9 } : {}),
            }}
            onClick={() => { if (canTap) onTapUsername(msg.user_id, name); }}
          >{name}</span>
          <span style={S.ccTime}>{timeAgo}</span>
        </div>
        {card && <UptikCardInline card={card} />}
        {intro && (
          <div style={S.ccText}>{renderInline(intro)}</div>
        )}
        {bullets.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ ...S.ccText, lineHeight: 1.5 }}>{renderInline(b)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Dark navy table card — single mental model, full beat-streak at a glance
function UptikCardInline({ card }) {
  if (!card || !card.type) return null;
  const wrap = {
    background: '#eef2f7',
    borderRadius: 10,
    margin: '6px 0 8px',
    fontFamily: "var(--font-heading)",
    overflow: 'hidden',
    color: 'var(--text1)',
    border: '1px solid #d8e2ed',
  };
  const head = {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #d8e2ed',
  };
  const ticker = { fontWeight: 700, fontSize: 15, color: '#8B5CF6', letterSpacing: 0.4 };
  const price = { fontWeight: 700, fontSize: 14, color: 'var(--text1)' };

  if (card.type === 'earnings') {
    const qs = card.quarters || [];
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>{card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(3)}</span>}
        </div>
        <div>
          {qs.map((q, i) => {
            const beat = Number(q.beatPct) >= 0;
            const sign = beat ? '+' : '';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                borderBottom: i < qs.length - 1 ? '1px solid #d8e2ed' : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{q.label}</span>
                <span style={{ color: beat ? '#1AAD5E' : 'var(--red)', fontWeight: 600 }}>
                  ${Number(q.actual).toFixed(2)} vs ${Number(q.est).toFixed(2)} ({sign}{Number(q.beatPct).toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
        {card.nextEarnings && (
          <div style={{
            padding: '8px 14px',
            fontSize: 11, fontWeight: 600,
            color: 'var(--text3)',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            borderTop: '1px solid #d8e2ed',
          }}>
            Next: {card.nextEarnings}
          </div>
        )}
      </div>
    );
  }

  if (card.type === 'price') {
    return (
      <div style={wrap}>
        <div style={{ ...head, borderBottom: 'none' }}>
          <span style={ticker}>{card.ticker}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
            {card.volume && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Vol {card.volume}</span>}
            {card.isClosed && <span style={{ fontSize: 11, color: 'var(--text3)' }}>· Closed</span>}
          </span>
        </div>
      </div>
    );
  }

  if (card.type === 'valuation') {
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>{card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', padding: '10px 14px' }}>
          {card.pe != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text3)' }}>P/E </span>
              <span style={{ color: '#e6ecf5', fontWeight: 600 }}>{card.pe}</span>
            </div>
          )}
          {card.peg != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text3)' }}>PEG </span>
              <span style={{ color: '#e6ecf5', fontWeight: 600 }}>{card.peg}</span>
            </div>
          )}
          {card.netMargin != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text3)' }}>Margin </span>
              <span style={{ color: '#e6ecf5', fontWeight: 600 }}>{card.netMargin}%</span>
            </div>
          )}
          {card.salesGrowth != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text3)' }}>Sales </span>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>+{card.salesGrowth}%</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
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
  outerWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },

  // ── Toast ──
  toast: {
    position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
    background: '#1AAD5E', color: '#fff', fontSize: 13, fontWeight: 600,
    padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 12px rgba(26,173,94,0.3)',
    display: 'flex', alignItems: 'center', gap: 6, zIndex: 10000,
  },

  // ── Header ──
  header: {
    background: '#132d52', padding: '10px 16px 8px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0,
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: 5 },
  logoRow: { display: 'flex', alignItems: 'baseline' },
  logoUp: { fontSize: 20, fontWeight: 500, color: '#8cd9a0' },
  logoTik: { fontSize: 20, fontWeight: 500, color: '#f0ede8' },
  logoAlerts: { fontSize: 11, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5, fontFamily: "var(--font-heading)", marginTop: -3, paddingLeft: 26 },
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
  pmItem: { fontSize: 13, fontWeight: 500, color: 'var(--green-btn)', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' },

  // ── Market Ticker Bar ──
  combinedBar: { background: '#1a3a5e', flexShrink: 0 },
  barContent: { padding: '8px 0', minHeight: 34 },
  barScroll: { overflow: 'hidden', display: 'flex', alignItems: 'center' },
  pulseItem: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px' },
  pulseName: { fontSize: 13, fontWeight: 600, color: '#b8cde0', letterSpacing: 0.3 },
  pulsePrice: { fontSize: 13, fontWeight: 700 },
  pulseVal: { fontSize: 12, fontWeight: 600 },

  // ── Content (scrollable area) ──
  content: { flex: 1, overflowY: 'auto', paddingBottom: 8, background: '#eef2f7', position: 'relative', zIndex: 1 },
  sectionDivider: { height: 1, background: '#dce4ed', margin: '0 14px' },

  fixedChatBar: {
    flexShrink: 0,
    padding: '12px 14px 14px', background: '#eef2f7',
    display: 'flex', alignItems: 'center', gap: 10,
    position: 'relative', zIndex: 50,
    borderTop: '1px solid #d8e2ed',
  },

  // ── Watchlist / My List helpers ──
  wlPopRow: { display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' },
  wlPopLabel: { fontSize: 11, color: '#3e5568', marginRight: 2, alignSelf: 'center' },
  wlPopChip: {
    fontSize: 12, fontWeight: 600, color: 'var(--green-btn)',
    background: 'rgba(26,173,94,0.08)', border: '1px solid rgba(26,173,94,0.2)',
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
  },


  // ── Briefing ──
  briefSection: { padding: '12px 14px 8px' },
  briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  briefTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', letterSpacing: '-0.01em' },
  briefTime: { fontSize: 11, color: 'var(--text3)' },
  briefToggle: { fontSize: 12, color: 'var(--green-btn)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  briefCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 12,
    padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
  },
  bfTickers: { fontSize: 11, fontWeight: 700, color: 'var(--green-btn)', marginBottom: 2 },
  bfTitle: { fontSize: 13, color: 'var(--text1)', fontWeight: 500, lineHeight: 1.3 },
  bfLink: { color: 'var(--green-btn)', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
  briefEmpty: { background: '#f8fafc', border: '1px solid #d8e2ed', borderRadius: 12, padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text3)' },

  // ── Stocks section (inline) ──
  stocksSection: { padding: '0 16px 8px' },
  stocksHeader: { marginBottom: 6 },
  stocksTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', fontFamily: "var(--font-heading)" },
  stocksBtns: { display: 'flex', gap: 8 },
  stocksBtn: {
    padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: '1px solid #8cd9a0', background: 'rgba(140,217,160,0.08)',
    color: 'var(--green-btn)', fontFamily: "var(--font)",
  },
  stocksBtnActive: { background: '#1AAD5E', color: '#fff', borderColor: '#1AAD5E' },
  sectorDropdown: {
    position: 'absolute', left: 0, top: '100%', marginTop: 4,
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
    zIndex: 100, minWidth: 140,
  },
  sectorDropItem: {
    padding: '10px 16px', fontSize: 13, color: 'var(--text1)', cursor: 'pointer',
    borderBottom: '1px solid #f5f7fa', fontFamily: "var(--font)",
  },
  stocksCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 10,
    overflow: 'hidden', marginTop: 8,
  },
  stocksHeaderRow: {
    display: 'flex', alignItems: 'center', padding: '6px 10px',
    borderBottom: '1px solid #d8e2ed', background: '#fafbfc',
  },
  stocksColLabel: {
    fontSize: 9, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  stocksScroll: { maxHeight: 200, overflowY: 'auto' },
  stocksRow: {
    display: 'flex', alignItems: 'center', padding: '7px 10px',
    borderBottom: '1px solid #f5f7fa', cursor: 'pointer',
  },
  stocksRowTk: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  stocksExpand: {
    padding: '8px 10px 8px 38px', background: '#f8fafc',
    borderBottom: '1px solid #f0f4f8',
  },
  stocksAddBar: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
    borderTop: '1px solid #d8e2ed', background: '#fafbfc',
    borderRadius: '0 0 10px 10px',
  },
  stocksAddInput: {
    flex: 1, border: 'none', outline: 'none', fontSize: 13,
    color: 'var(--text1)', background: 'transparent', fontFamily: "var(--font)",
  },

  // ── Chat section ──
  chatSection: { padding: '12px 14px 8px' },
  csHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  csTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 },
  csLive: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green-btn)', fontWeight: 500 },
  csLiveDot: { width: 5, height: 5, borderRadius: '50%', background: '#1AAD5E', animation: 'pulse 1.5s ease-in-out infinite' },
  privateChatBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 600, color: '#fff',
    background: '#1AAD5E', border: 'none', borderRadius: 14,
    padding: '5px 12px', cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── My Groups section ──
  groupSection: { padding: '12px 14px 16px' },
  groupSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupSectionTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', letterSpacing: '-0.01em' },
  groupCreateBtn: {
    fontSize: 13, fontWeight: 600, color: 'var(--green-btn)', background: 'none', border: 'none',
    cursor: 'pointer', padding: '4px 0',
  },
  myGroupsPills: { display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, justifyContent: 'center', flexWrap: 'wrap' },
  myGroupPill: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    borderRadius: 12, border: '1px solid #d8e2ed', background: '#fff', cursor: 'pointer',
  },
  myGroupName: { fontSize: 14, fontWeight: 600, color: 'var(--text1)' },
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
  groupCtaTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  groupCtaSub: { fontSize: 12, color: '#5a8a6a', lineHeight: 1.3 },

  chatCard: {
    background: '#fff', border: '1px solid #d8e2ed', borderRadius: 12, overflow: 'hidden',
  },
  ccMsgs: { padding: 6, display: 'flex', flexDirection: 'column', gap: 6 },
  ccMsg: {
    padding: '10px 12px',
    background: '#f8fafc',
    borderRadius: 10,
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
  ccTime: { fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' },
  ccText: { fontSize: 13, color: '#4a6178', lineHeight: 1.4 },
  ccTk: { color: 'var(--green-btn)', fontWeight: 600 },
  // ccFooter replaced by fixedChatBar
  ccAiBtn: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
    transition: 'all 0.2s',
  },
  ccAiBtnOff: {
    background: '#7a8ea3', color: '#fff',
  },
  ccAiBtnActive: {
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: '#fff', boxShadow: '0 0 8px rgba(139,92,246,0.4)',
  },
  ccInputWrap: {
    flex: 1, display: 'flex', alignItems: 'center',
    background: '#fff', border: '1.5px solid #d8e2ed',
    borderRadius: 20, height: 42, paddingRight: 4,
  },
  ccInput: {
    flex: 1, background: 'transparent', border: 'none',
    padding: '8px 0 8px 16px', fontSize: 15, color: 'var(--text1)',
    fontFamily: 'inherit', outline: 'none', height: '100%',
  },
  ccMic: {
    width: 32, height: 32, borderRadius: '50%', background: 'transparent',
    border: 'none', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s',
  },
  ccMicActive: {
    background: '#EF4444',
    boxShadow: '0 0 10px rgba(239,68,68,0.4)',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  ccSend: {
    width: 38, height: 38, borderRadius: '50%', background: '#1AAD5E',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
    fontSize: 12, fontWeight: 600, color: '#fff',
    background: '#1AAD5E', border: 'none',
    borderRadius: 14, padding: '5px 12px', cursor: 'pointer',
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
    fontFamily: 'inherit', fontSize: 13, color: 'var(--text1)',
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
    fontSize: 12, fontWeight: 600, color: 'var(--green-btn)', background: 'rgba(26,173,94,0.08)',
    border: '1px solid rgba(26,173,94,0.2)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer',
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
  barFill: { height: '100%', background: '#1AAD5E', borderRadius: 4, transition: 'width 0.4s ease' },

  search: {
    margin: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1.5px solid #d8e2ed', borderRadius: 12, padding: '10px 14px',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontFamily: 'inherit', fontSize: 13, color: 'var(--text1)',
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
    fontSize: 11, fontWeight: 600, color: 'var(--green-btn)', background: 'rgba(26,173,94,0.08)',
    border: '1px solid rgba(26,173,94,0.2)', borderRadius: 8, padding: '4px 12px',
    cursor: 'pointer', fontFamily: 'inherit',
  },

  scrollArea: { flex: 1, overflowY: 'auto', paddingBottom: 8 },

  section: { padding: '12px 20px 4px' },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  },

  trendingGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  trendingChip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12,
    background: '#fff', border: '1.5px solid #d8e2ed', cursor: 'pointer', transition: 'all 0.2s',
  },
  trendingChipSel: { borderColor: '#1AAD5E', background: 'rgba(26,173,94,0.06)' },
  tcTicker: { fontSize: 13, fontWeight: 700, color: '#132d52' },

  sectorGroup: { marginBottom: 14 },
  sectorLabel: {
    fontSize: 11, fontWeight: 600, color: '#5a7080', marginBottom: 6, paddingLeft: 2,
    display: 'flex', alignItems: 'center', gap: 5,
  },
  sectorStocks: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  sectorStock: {
    padding: '6px 12px', borderRadius: 12, background: '#fff', border: '1px solid #d8e2ed',
    fontSize: 12, fontWeight: 600, color: 'var(--text1)', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  sectorStockSel: { borderColor: 'var(--green-btn)', background: 'rgba(26,173,94,0.08)', color: 'var(--green-btn)' },

  footer: { padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  cta: {
    width: '100%', padding: 14, border: 'none', borderRadius: 14,
    fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    background: 'var(--green-btn)', color: '#fff', boxShadow: '0 4px 16px rgba(26,173,94,0.25)',
    transition: 'all 0.2s',
  },
  skip: {
    textAlign: 'center', fontSize: 13, color: 'var(--text3)', cursor: 'pointer',
    padding: 4, fontWeight: 500,
  },
};