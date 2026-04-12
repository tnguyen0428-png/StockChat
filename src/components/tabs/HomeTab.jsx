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
import StickerPicker from '../shared/StickerPicker';
import { useTheme } from './alertsCasinoComponents';

// ── Extracted modules ──
import { POLYGON_KEY, FMP_KEY, POPULAR_TICKERS, ONBOARD_TRENDING, ONBOARD_SECTORS, FUTURES_MAP } from './homeConstants';
import { getHomeStyles, getOnboardingStyles } from './homeStyles';
import { BriefCard, ChatBubble } from './HomeSubComponents';
import OnboardingOverlay from './OnboardingOverlay';

export default function HomeTab({ session, onGroupSelect, onTabChange, scrollToChatRef, onOpenDMs, onStartDM, darkMode }) {
  const { publicGroups, privateGroup, activeGroup, profile, customGroups } = useGroup();

  const t = useTheme(darkMode);

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
  const savedSector = (() => { try { return localStorage.getItem('uptik_last_sector'); } catch { return null; } })();
  const [researchSector, setResearchSectorRaw]  = useState(savedSector || null);
  const setResearchSector = (val) => {
    setResearchSectorRaw(val);
    try { if (val) localStorage.setItem('uptik_last_sector', val); else localStorage.removeItem('uptik_last_sector'); } catch { /* iOS private */ }
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
  const [chatInput, setChatInputRaw]            = useState(() => { try { return localStorage.getItem('uptik_chat_draft') || ''; } catch { return ''; } });
  const setChatInput = (val) => { setChatInputRaw(val); try { if (val) localStorage.setItem('uptik_chat_draft', val); else localStorage.removeItem('uptik_chat_draft'); } catch { /* iOS private */ } };
  const [chatSending, setChatSending]           = useState(false);
  const [aiMode, setAiMode]                     = useState(() => { try { return localStorage.getItem('uptik_ai_mode') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('uptik_ai_mode', aiMode ? '1' : '0'); } catch { /* iOS private */ } }, [aiMode]);
  const [chatExpanded, setChatExpanded]          = useState(false);
  const [aiLoading, setAiLoading]               = useState(false);
  const [aiLastTicker, setAiLastTicker]         = useState(null);
  const [isListening, setIsListening]           = useState(false);
  const recognitionRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatStripRef = useRef(null);
  const chatSectionRef = useRef(null);
  const chatBarRef = useRef(null);
  const contentRef = useRef(null);
  const outerWrapRef = useRef(null);
  const initialVH = useRef(window.innerHeight);

  // ── iOS keyboard handling via visualViewport ──
  // iOS Safari scrolls the visual viewport instead of resizing it (offsetTop > 0).
  // Android Chrome resizes natively — skip override there to avoid fighting the browser.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (!outerWrapRef.current) return;
      const keyboardOpen = vv.height < initialVH.current * 0.75;
      if (keyboardOpen && vv.offsetTop > 0) {
        // iOS: viewport scrolled, need manual height override
        const layoutTop = outerWrapRef.current.getBoundingClientRect().top;
        const visibleTop = layoutTop - vv.offsetTop;
        const available = vv.height - visibleTop;
        outerWrapRef.current.style.height = `${Math.max(available, 120)}px`;
        outerWrapRef.current.style.maxHeight = `${Math.max(available, 120)}px`;
        // Also scroll content to bottom so messages are near the input bar
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      } else {
        // Android / keyboard closed: let native resize + flex handle it
        outerWrapRef.current.style.height = '';
        outerWrapRef.current.style.maxHeight = '';
      }
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      if (outerWrapRef.current) {
        outerWrapRef.current.style.height = '';
        outerWrapRef.current.style.maxHeight = '';
      }
    };
  }, []);

  // Also scroll content to bottom when input is tapped (backup for iOS timing)
  const handleChatInputFocus = useCallback(() => {
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    }, 300);
  }, []);

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
    let cancelled = false;
    const init = async () => {
      // Run in parallel — none of these depend on each other
      await Promise.allSettled([
        loadBriefing(),
        loadMarketIndicators(),
        loadWatchlist().then(() => {
          if (cancelled) return;
          try {
            const saved = localStorage.getItem('uptik_last_sector');
            if (saved && saved !== '__mylist__') loadResearch(saved);
          } catch {}
        }),
      ]);
    };
    init();
    return () => { cancelled = true; };
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
        showToast(`${tickers.length} stock${tickers.length > 1 ? 's' : ''} added to Watchlist!`);
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
    // Realtime subscription for chat messages on Home preview.
    // We use a unique channel name so it doesn't collide with ChatTab's channel.
    // This is intentionally lightweight — just appends new messages to the preview.
    const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
    if (!uptikPublic) return;
    let cancelled = false;
    const channel = supabase
      .channel('home_chat_' + uptikPublic.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: 'group_id=eq.' + uptikPublic.id,
      }, (payload) => {
        if (cancelled) return;
        setChatMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new].slice(-50); // cap at 50 to avoid unbounded growth
        });
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [publicGroups]);

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
    if (!raw || chatSending || !profile) return;
    // Resolve homeGroup if not yet set
    let group = homeGroup;
    if (!group) {
      group = publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
      if (group) setHomeGroup(group);
    }
    if (!group) return;
    const text = aiMode ? `@AI ${raw}` : raw;

    chatInputRef.current?.blur();
    setChatSending(true);
    try {
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: group.id,
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
              groupName: group?.name,
              watchlist: watchlist.map(w => w.symbol),
            });
            if (newLastTicker) setAiLastTicker(newLastTicker);
            const { data: aiMsg } = await supabase.from('chat_messages').insert({
              group_id: group.id, user_id: 'user_ai',
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
      showToast(`${upper} added to Watchlist`);
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
            onClick={toggleListening}
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