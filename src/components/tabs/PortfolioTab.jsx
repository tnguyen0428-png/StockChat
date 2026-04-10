// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Portfolio Challenge: Split-panel layout
// Left: portfolio + buy | Right: game cards
// ============================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import SellModal from '../portfolio/SellModal';
import StickerPicker from '../shared/StickerPicker';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;
const STARTING_CASH = 50000;

const BADGE_DEFS = {
  champion: { label: 'Champion', emoji: '👑', bg: '#FAEEDA', border: '#BA7517', color: '#854F0B' },
  expert:   { label: 'Expert',   emoji: '🎯', bg: '#E6F1FB', border: '#378ADD', color: '#0C447C' },
  newbie:   { label: 'Newbie',   emoji: '🌱', bg: '#EAF3DE', border: '#639922', color: '#27500A' },
  diamond:  { label: 'Diamond',  emoji: '💎', bg: '#EEEDFE', border: '#7F77DD', color: '#3C3489' },
  streak:   { label: 'Streak',   emoji: '🔥', bg: '#E1F5EE', border: '#1D9E75', color: '#085041' },
};

const TIER_DEFS = [
  { min: 15, label: 'LEGEND', short: 'LEG', bg: 'rgba(255,215,0,0.15)', color: '#b8960e' },
  { min: 10, label: 'WALL ST WOLF', short: 'WOLF', bg: 'rgba(255,215,0,0.2)', color: '#FFD700' },
  { min: 5,  label: 'MARKET SHARK', short: 'SHARK', bg: 'rgba(140,160,220,0.2)', color: '#7B8CDE' },
  { min: 0,  label: 'RISING STAR', short: 'STAR', bg: 'rgba(205,127,50,0.2)', color: '#CD7F32' },
  { min: -Infinity, label: 'ROOKIE', short: 'ROOK', bg: 'rgba(122,142,163,0.15)', color: '#7a8ea3' },
];

const getTier = (pctReturn) => TIER_DEFS.find(t => pctReturn >= t.min) || TIER_DEFS[TIER_DEFS.length - 1];

const REACTIONS = [
  { emoji: '🔥', label: 'fire' },
  { emoji: '💀', label: 'dead' },
  { emoji: '👑', label: 'respect' },
  { emoji: '👀', label: 'watching' },
  { emoji: '😂', label: 'cap' },
];

function detectBehaviorBadges(userId, allTrades) {
  const userTrades = allTrades.filter(t => t.user_id === userId && t.status === 'closed');
  const badges = [];

  const recentClosed = userTrades.filter(t => {
    if (!t.sold_at) return false;
    const age = Date.now() - new Date(t.sold_at).getTime();
    return age < 7 * 86400000;
  });
  const dayTrades = recentClosed.filter(t => {
    if (!t.sold_at || !t.bought_at) return false;
    return (new Date(t.sold_at) - new Date(t.bought_at)) < 24 * 3600000;
  });
  if (dayTrades.length >= 3) badges.push({ type: 'day_traitor', label: 'DAY TRAITOR', bg: 'rgba(224,82,82,0.2)', color: '#F09595' });

  const paperHands = recentClosed.some(t => {
    if (!t.sold_at || !t.bought_at) return false;
    const holdHours = (new Date(t.sold_at) - new Date(t.bought_at)) / 3600000;
    return holdHours < 48 && Number(t.exit_price) < Number(t.entry_price);
  });
  if (paperHands) badges.push({ type: 'paper_hands', label: 'PAPER HANDS', bg: 'rgba(212,160,23,0.2)', color: '#FAC775' });

  const openTrades = allTrades.filter(t => t.user_id === userId && t.status === 'open');
  const diamond = openTrades.some(t => {
    if (!t.bought_at) return false;
    return (Date.now() - new Date(t.bought_at).getTime()) > 30 * 86400000;
  });
  if (diamond) badges.push({ type: 'diamond_hands', label: 'DIAMOND', bg: 'rgba(29,158,117,0.2)', color: '#5DCAA5' });

  const lastThree = userTrades.sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at)).slice(0, 3);
  if (lastThree.length >= 3 && lastThree.every(t => Number(t.exit_price) > Number(t.entry_price))) {
    badges.push({ type: 'hot_streak', label: 'HOT STREAK', bg: 'rgba(255,215,0,0.2)', color: '#FFD700' });
  }

  return badges;
}

export default function PortfolioTab({ session }) {
  const { profile } = useGroup();
  const [view, setView] = useState('portfolio');
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [sellTrade, setSellTrade] = useState(null);
  const [closedTrades, setClosedTrades] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Inline buy state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [buying, setBuying] = useState(false);
  const searchTimer = useRef(null);

  // Leaderboard + rank
  const [leaderboard, setLeaderboard] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [myRank, setMyRank] = useState(null);
  const [aheadUser, setAheadUser] = useState(null);

  // Activity feed
  const [activity, setActivity] = useState([]);

  // NEW: Right column state
  const [hotTickers, setHotTickers] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [userBadges, setUserBadges] = useState([]);
  const [trashTalkMsgs, setTrashTalkMsgs] = useState([]);
  const [trashTalkInput, setTrashTalkInput] = useState('');
  const [riskLevel, setRiskLevel] = useState({ level: 'Low', bars: 2, color: '#2a7d4b', note: '' });
  const [showPortfolio, setShowPortfolio] = useState(false);

  // Leaderboard v2 state
  const [chatReactions, setChatReactions] = useState({});
  const [myTotalTrades, setMyTotalTrades] = useState(0);
  const [myWinRate, setMyWinRate] = useState({ wins: 0, total: 0, pct: 0 });
  const [myBestPick, setMyBestPick] = useState(null);

  const refreshRef = useRef(null);
  const allTradesRef = useRef([]);

  // ── Load portfolio ──
  const loadPortfolio = useCallback(async () => {
    if (!session?.user?.id) return;

    // Check if portfolio already exists BEFORE calling ensure_paper_portfolio
    // This prevents the RPC from potentially resetting an existing portfolio
    const { data: existingPf } = await supabase
      .from('paper_portfolios')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!existingPf) {
      // Only call ensure_paper_portfolio for truly new users
      await supabase.rpc('ensure_paper_portfolio');
    }

    const [{ data: pf }, { data: openTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*').eq('user_id', session.user.id).single(),
      supabase.from('paper_trades').select('*').eq('user_id', session.user.id).eq('status', 'open'),
    ]);

    // Safety check: if portfolio exists but cash_balance got reset to starting amount
    // while user has trade history, something went wrong — log it
    if (pf && existingPf && Number(pf.cash_balance) === STARTING_CASH && Number(existingPf.cash_balance) !== STARTING_CASH) {
      console.error('[Challenge] POSSIBLE DATA RESET DETECTED — cash_balance was', existingPf.cash_balance, 'now', pf.cash_balance);
      // Restore the pre-RPC value
      await supabase.from('paper_portfolios')
        .update({ cash_balance: existingPf.cash_balance })
        .eq('user_id', session.user.id);
      pf.cash_balance = existingPf.cash_balance;
    }

    setPortfolio(pf);
    setTrades(openTrades || []);
    setLoadingData(false);
    if (openTrades?.length > 0) {
      const tickers = [...new Set(openTrades.map(t => t.ticker))].join(',');
      await fetchPrices(tickers);
    }
  }, [session?.user?.id]);

  const fetchPrices = async (tickers) => {
    if (!tickers) return;
    try {
      // FMP plan only supports single symbol per request — fetch individually
      const symbols = tickers.split(',').map(s => s.trim()).filter(Boolean);
      const map = {};
      for (let i = 0; i < symbols.length; i += 6) {
        const batch = symbols.slice(i, i + 6);
        await Promise.all(batch.map(async (sym) => {
          try {
            const res = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=${sym}&apikey=${FMP_KEY}`);
            const data = await res.json();
            if (Array.isArray(data) && data[0]?.price) {
              map[data[0].symbol] = data[0].price;
            }
          } catch { /* skip */ }
        }));
        if (i + 6 < symbols.length) await new Promise(r => setTimeout(r, 250));
      }
      if (Object.keys(map).length > 0) {
        setPrices(prev => ({ ...prev, ...map }));
        setLastUpdated(new Date());
      }
    } catch { /* silent */ }
  };

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // Refresh prices every 30s
  useEffect(() => {
    if (trades.length === 0) return;
    refreshRef.current = setInterval(() => {
      const tickers = [...new Set(trades.map(t => t.ticker))].join(',');
      fetchPrices(tickers);
    }, 30000);
    return () => clearInterval(refreshRef.current);
  }, [trades]);

  // ── Leaderboard (loads on mount for rank) ──
  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    const [{ data: allPortfolios }, { data: allTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*, profiles(username)').limit(100),
      supabase.from('paper_trades').select('*').limit(1000),
    ]);
    if (!allPortfolios) { setLbLoading(false); return; }

    const openTrades = (allTrades || []).filter(t => t.status === 'open');
    allTradesRef.current = openTrades;

    const allTickers = [...new Set(openTrades.map(t => t.ticker))];
    let priceMap = { ...prices };
    if (allTickers.length > 0) {
      try {
        // FMP plan only supports single symbol per request
        for (let i = 0; i < allTickers.length; i += 6) {
          const batch = allTickers.slice(i, i + 6);
          await Promise.all(batch.map(async (sym) => {
            try {
              const res = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=${sym}&apikey=${FMP_KEY}`);
              const data = await res.json();
              if (Array.isArray(data) && data[0]?.price) {
                priceMap[data[0].symbol] = data[0].price;
              }
            } catch { /* skip */ }
          }));
          if (i + 6 < allTickers.length) await new Promise(r => setTimeout(r, 250));
        }
        setPrices(prev => ({ ...prev, ...priceMap }));
      } catch { /* silent */ }
    }

    const entries = allPortfolios.map(pf => {
      const userOpenTrades = openTrades.filter(t => t.user_id === pf.user_id);
      const positionsValue = userOpenTrades.reduce((sum, t) => {
        const curPrice = priceMap[t.ticker] || Number(t.entry_price);
        return sum + (Number(t.shares) * curPrice);
      }, 0);
      const totalValue = Number(pf.cash_balance) + positionsValue;
      const pctReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
      const behaviorBadges = detectBehaviorBadges(pf.user_id, allTrades || []);
      return {
        userId: pf.user_id,
        username: pf.profiles?.username || 'Unknown',
        totalValue,
        pctReturn,
        positions: userOpenTrades.map(t => ({
          ticker: t.ticker,
          pctGain: priceMap[t.ticker]
            ? ((priceMap[t.ticker] - Number(t.entry_price)) / Number(t.entry_price)) * 100
            : 0,
        })),
        openCount: userOpenTrades.length,
        behaviorBadges,
      };
    });

    entries.sort((a, b) => b.pctReturn - a.pctReturn);
    setLeaderboard(entries);

    const myIdx = entries.findIndex(e => e.userId === session?.user?.id);
    if (myIdx >= 0) {
      setMyRank(myIdx + 1);
      if (myIdx > 0) {
        const ahead = entries[myIdx - 1];
        setAheadUser({
          username: ahead.username,
          rank: myIdx,
          gap: (ahead.pctReturn - entries[myIdx].pctReturn).toFixed(2),
          progress: ahead.pctReturn !== 0
            ? Math.min(100, Math.max(0, (entries[myIdx].pctReturn / ahead.pctReturn) * 100))
            : 0,
        });
      } else {
        setAheadUser(null);
      }
    }
    setLbLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { loadLeaderboard(); }, []);

  // ── Activity feed ──
  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('paper_trades')
      .select('*, profiles(username)')
      .order('bought_at', { ascending: false })
      .limit(5);
    if (data) setActivity(data);
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  const loadClosedTrades = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('paper_trades')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'closed')
      .order('sold_at', { ascending: false })
      .limit(20);
    if (data) setClosedTrades(data);
  }, [session?.user?.id]);

  useEffect(() => { loadClosedTrades(); }, [loadClosedTrades]);

  useEffect(() => {
    const channel = supabase
      .channel('portfolio_activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'paper_trades' }, () => loadActivity())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadActivity]);

  // ── Search (debounced) ──
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(searchQuery)}&limit=5&apikey=${FMP_KEY}`
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data.filter(d => {
            const ex = (d.exchangeShortName || d.exchange || '').toUpperCase();
            return ex.includes('NYSE') || ex.includes('NASDAQ');
          }));
        }
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  // ── Select ticker from search ──
  const handleSelectTicker = async (item) => {
    setBuyError('');
    setSearchResults([]);
    setSearchQuery('');
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/quote-short?symbol=${item.symbol}&apikey=${FMP_KEY}`
      );
      const data = await res.json();
      const price = Array.isArray(data) && data[0] ? data[0].price : null;
      if (!price) { setBuyError("Couldn't fetch price. Try again."); return; }
      setSelectedTicker({ symbol: item.symbol, name: item.name, price });
      setShowPresets(true);
      setShowCustom(false);
      setCustomAmount('');
    } catch {
      setBuyError("Couldn't fetch price. Try again.");
    }
  };

  // ── Buy ──
  const executeBuy = async (dollarAmount) => {
    if (!selectedTicker?.price || dollarAmount <= 0 || buying) return;
    if (dollarAmount > cashBalance) {
      setBuyError(`Exceeds cash ($${cashBalance.toLocaleString()})`);
      return;
    }
    setBuying(true);
    setBuyError('');
    const shares = dollarAmount / selectedTicker.price;
    try {
      // Fetch fresh cash balance to prevent race condition (stale React state)
      const { data: pf, error: pfErr } = await supabase
        .from('paper_portfolios')
        .select('cash_balance')
        .eq('user_id', session.user.id)
        .single();
      if (pfErr) throw pfErr;
      const freshCash = Number(pf.cash_balance);
      if (dollarAmount > freshCash) {
        setBuyError(`Insufficient funds ($${freshCash.toLocaleString()} available)`);
        setBuying(false);
        return;
      }

      const { data: trade, error: insertErr } = await supabase.from('paper_trades').insert({
        user_id: session.user.id,
        ticker: selectedTicker.symbol,
        shares,
        dollar_amount: dollarAmount,
        entry_price: selectedTicker.price,
        status: 'open',
        bought_at: new Date().toISOString(),
      }).select('id').single();
      if (insertErr) throw insertErr;
      const { error: updateErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: freshCash - dollarAmount })
        .eq('user_id', session.user.id);
      if (updateErr) {
        // Rollback: delete the trade if cash update failed
        await supabase.from('paper_trades').delete().eq('id', trade.id);
        throw updateErr;
      }
      setSelectedTicker(null);
      setShowPresets(false);
      setShowCustom(false);
      setCustomAmount('');
      await loadPortfolio();
      await loadLeaderboard();
      await loadActivity();
    } catch (err) {
      setBuyError(err.message || 'Failed to buy.');
    } finally {
      setBuying(false);
    }
  };

  const clearSelection = () => {
    setSelectedTicker(null);
    setShowPresets(false);
    setShowCustom(false);
    setCustomAmount('');
    setBuyError('');
  };

  const onSellComplete = () => {
    setSellTrade(null);
    loadPortfolio();
    loadLeaderboard();
    loadActivity();
    loadClosedTrades();
  };

  // ── NEW: Hot tickers ──
  const loadHotTickers = useCallback(async () => {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data } = await supabase
      .from('paper_trades')
      .select('ticker, status')
      .gt('bought_at', since);
    if (!data) return;
    const counts = {};
    data.forEach(t => {
      if (!counts[t.ticker]) counts[t.ticker] = { bought: 0, sold: 0 };
      if (t.status === 'open') counts[t.ticker].bought++;
      else counts[t.ticker].sold++;
    });
    const sorted = Object.entries(counts)
      .map(([ticker, c]) => ({ ticker, bought: c.bought, sold: c.sold, total: c.bought + c.sold }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    setHotTickers(sorted);
  }, []);

  useEffect(() => { loadHotTickers(); }, [loadHotTickers]);

  // ── NEW: Sector heat map ──
  const loadSectorData = useCallback(async () => {
    const allTickers = [...new Set((allTradesRef.current || []).map(t => t.ticker))];
    if (allTickers.length === 0) return;
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/profile?symbol=${allTickers.join(',')}&apikey=${FMP_KEY}`
      );
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const sectors = {};
      data.forEach(d => {
        if (!d.sector) return;
        if (!sectors[d.sector]) sectors[d.sector] = { changes: [], count: 0 };
        sectors[d.sector].changes.push(d.changes || 0);
        sectors[d.sector].count++;
      });
      const sectorList = Object.entries(sectors)
        .map(([name, s]) => ({
          name,
          avgChange: s.changes.reduce((a, b) => a + b, 0) / s.changes.length,
        }))
        .sort((a, b) => b.avgChange - a.avgChange)
        .slice(0, 5);
      setSectorData(sectorList);

      // Calculate risk from user's positions
      const myTickers = trades.map(t => t.ticker);
      const myPositionSectors = {};
      data.forEach(d => {
        if (myTickers.includes(d.symbol) && d.sector) {
          const val = trades
            .filter(t => t.ticker === d.symbol)
            .reduce((sum, t) => sum + Number(t.shares) * (prices[t.ticker] || Number(t.entry_price)), 0);
          myPositionSectors[d.sector] = (myPositionSectors[d.sector] || 0) + val;
        }
      });
      const totalVal = Object.values(myPositionSectors).reduce((a, b) => a + b, 0);
      if (totalVal > 0) {
        const maxSector = Object.entries(myPositionSectors).sort((a, b) => b[1] - a[1])[0];
        const pct = (maxSector[1] / totalVal) * 100;
        if (pct > 60) setRiskLevel({ level: 'High', bars: 4, color: '#E24B4A', note: `${pct.toFixed(0)}% in ${maxSector[0].toLowerCase()} — diversify` });
        else if (pct > 40) setRiskLevel({ level: 'Medium', bars: 3, color: '#BA7517', note: `${pct.toFixed(0)}% in ${maxSector[0].toLowerCase()}` });
        else setRiskLevel({ level: 'Low', bars: 2, color: '#2a7d4b', note: 'Well diversified' });
      }
    } catch { /* silent */ }
  }, [trades, prices]);

  useEffect(() => {
    if (allTradesRef.current.length > 0) loadSectorData();
  }, [leaderboard]);

  // ── NEW: Badges ──
  const loadBadges = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: badges } = await supabase
      .from('portfolio_badges')
      .select('badge_type')
      .eq('user_id', session.user.id);
    const earned = (badges || []).map(b => b.badge_type);
    setUserBadges(earned);

    // Auto-award
    const { count: totalTrades } = await supabase
      .from('paper_trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id);

    const awards = [];
    if (totalTrades >= 1 && !earned.includes('newbie')) awards.push('newbie');
    if (totalTrades >= 10 && !earned.includes('expert')) awards.push('expert');

    for (const badge of awards) {
      try {
        await supabase.from('portfolio_badges').insert({ user_id: session.user.id, badge_type: badge });
      } catch { /* silent - unique constraint */ }
    }
    if (awards.length > 0) setUserBadges(prev => [...prev, ...awards]);
  }, [session?.user?.id]);

  useEffect(() => { loadBadges(); }, [loadBadges]);

  // Award champion badge after leaderboard loads
  useEffect(() => {
    if (myRank === 1 && !userBadges.includes('champion') && session?.user?.id) {
      supabase.from('portfolio_badges').insert({ user_id: session.user.id, badge_type: 'champion' })
        .then(() => setUserBadges(prev => [...prev, 'champion']))
        .catch(() => {});
    }
  }, [myRank]);

  // ── Compute my stats ──
  useEffect(() => {
    if (!session?.user?.id || trades.length === 0) return;
    // Best pick
    let best = null;
    trades.forEach(t => {
      const curPrice = prices[t.ticker] || Number(t.entry_price);
      const pctGain = ((curPrice - Number(t.entry_price)) / Number(t.entry_price)) * 100;
      if (!best || pctGain > best.pctGain) best = { ticker: t.ticker, pctGain };
    });
    setMyBestPick(best);
    // Win rate
    const wins = trades.filter(t => {
      const curPrice = prices[t.ticker] || Number(t.entry_price);
      return curPrice >= Number(t.entry_price);
    }).length;
    setMyWinRate({ wins, total: trades.length, pct: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0 });
    // Total trades count
    (async () => {
      const { count } = await supabase
        .from('paper_trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      setMyTotalTrades(count || 0);
    })();
  }, [trades, prices, session?.user?.id]);

  // ── NEW: Trash talk ──
  const loadTrashTalk = useCallback(async () => {
    const { data } = await supabase
      .from('challenge_chat')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) {
      setTrashTalkMsgs(data.reverse());
      const rxnMap = {};
      data.forEach(m => { if (m.reactions) rxnMap[m.id] = m.reactions; });
      setChatReactions(prev => ({ ...prev, ...rxnMap }));
    }
  }, []);

  useEffect(() => { loadTrashTalk(); }, [loadTrashTalk]);

  useEffect(() => {
    const channel = supabase
      .channel('challenge_chat_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenge_chat' }, () => loadTrashTalk())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadTrashTalk]);

  const sendTrashTalk = async () => {
    const msg = trashTalkInput.trim();
    if (!msg || !session?.user?.id) return;
    // Clear input immediately so UX feels responsive
    setTrashTalkInput('');
    document.activeElement?.blur();
    const { error } = await supabase.from('challenge_chat').insert({
      user_id: session.user.id,
      message: msg,
    });
    if (error) { console.error('[PortfolioTab] Send message failed:', error.message); }
  };

  const sendSticker = (sticker) => {
    setTrashTalkInput(prev => prev + sticker.emoji);
  };

  const toggleReaction = async (msgId, reactionType) => {
    if (!session?.user?.id) return;
    const current = chatReactions[msgId] || {};
    const users = current[reactionType] || [];
    const alreadyReacted = users.includes(session.user.id);
    const updated = {
      ...current,
      [reactionType]: alreadyReacted
        ? users.filter(u => u !== session.user.id)
        : [...users, session.user.id],
    };
    setChatReactions(prev => ({ ...prev, [msgId]: updated }));
    try {
      await supabase.from('challenge_chat').update({ reactions: updated }).eq('id', msgId);
    } catch { /* silent */ }
  };

  // ── Calculations (memoized — only recompute when trades/prices/portfolio change) ──
  const totalPositionsValue = useMemo(() => trades.reduce((sum, t) => {
    const curPrice = prices[t.ticker] || Number(t.entry_price);
    return sum + (Number(t.shares) * curPrice);
  }, 0), [trades, prices]);
  const cashBalance = Number(portfolio?.cash_balance || 0);
  const totalValue = cashBalance + totalPositionsValue;
  const totalReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
  const isPositive = totalReturn >= 0;

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Season countdown
  const seasonEnd = new Date('2026-06-30');
  const seasonStart = new Date('2026-04-01');
  const daysLeft = Math.max(0, Math.ceil((seasonEnd - new Date()) / 86400000));
  const seasonProgress = Math.min(100, Math.max(0, ((new Date() - seasonStart) / (seasonEnd - seasonStart)) * 100));

  // Ticker tape text — others only (memoized)
  const myUid = session?.user?.id;
  const tapeText = useMemo(() => {
    const others = activity.filter(a => a.user_id !== myUid);
    if (others.length === 0) return 'Waiting for group activity…';
    return others.map(a => {
      const who = a.profiles?.username || 'Someone';
      const verb = a.status === 'closed' ? 'sold' : 'bought';
      const amt = a.dollar_amount ? ` $${(Number(a.dollar_amount) / 1000).toFixed(0)}k` : '';
      return `${who} ${verb} ${a.ticker}${amt}`;
    }).join(' · ');
  }, [activity, myUid]);

  const sectorColor = (avg) => {
    if (avg > 1) return { bg: '#EAF3DE', color: '#27500A' };
    if (avg > 0) return { bg: '#E1F5EE', color: '#085041' };
    if (avg > -1) return { bg: '#FAEEDA', color: '#633806' };
    return { bg: '#FCEBEB', color: '#791F1F' };
  };

  // ── Loading ──
  if (loadingData) {
    return (
      <div style={s.scroll}>
        <div style={{ padding: 20 }}>
          {[1, 2, 3].map(i => <div key={i} style={s.skeleton} />)}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════
  return (
    <div style={s.scroll}>
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* ZONE 1: Segmented control */}
      <div style={s.segWrap}>
        <div style={s.segBar}>
          <button style={{ ...s.segBtn, ...(view === 'portfolio' ? s.segActive : {}) }} onClick={() => setView('portfolio')}>My Portfolio</button>
          <button style={{ ...s.segBtn, ...(view === 'leaderboard' ? s.segActive : {}) }} onClick={() => setView('leaderboard')}>Leaderboard</button>
        </div>
      </div>

      {view === 'portfolio' ? (
        <div style={{ padding: '0 12px 12px' }}>

          {/* TOP BAR */}
          {trades.length === 0 ? (
            <div style={s.barNew}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
              <div style={s.barNewText}>
                <div style={s.barNewTitle}>Paper Trading Challenge</div>
                <div style={s.barNewSub}><b style={{ color: 'var(--green-btn)' }}>$50K fake money</b> · compete with your crew</div>
              </div>
              <div style={s.barNewBtn} onClick={() => setShowPortfolio(true)}>Join →</div>
            </div>
          ) : (
            <div style={s.barActive}>
              <div style={s.barRank}><span style={s.barRankText}>#{myRank || '-'}</span></div>
              <div style={s.barStats}>
                <div style={s.barStatsTop}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: isPositive ? 'var(--green-btn)' : 'var(--red)' }}>{isPositive ? '+' : ''}{totalReturn.toFixed(1)}%</span>
                  {userBadges.length > 0 && <span style={{ display: 'flex', gap: 2 }}>{userBadges.slice(0, 3).map(key => { const def = BADGE_DEFS[key]; return def ? <span key={key} style={{ fontSize: 12 }} title={def.label}>{def.emoji}</span> : null; })}</span>}
                </div>
                <div style={s.barStatsBottom}>
                  {aheadUser ? <span>🎯 {aheadUser.gap}% behind {aheadUser.username}</span> : myRank !== null ? <span style={{ color: 'var(--green-btn)' }}>👑 In the lead!</span> : null}
                  <span style={{ color: 'var(--green-btn)', fontWeight: 600 }}>Cash ${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
              <div style={{ ...s.barPortBtn, ...(showPortfolio ? s.barPortBtnOpen : {}) }} onClick={() => setShowPortfolio(p => !p)}>Portfolio {showPortfolio ? '▲' : '▼'}</div>
            </div>
          )}

          {/* PORTFOLIO DROPDOWN */}
          {showPortfolio && (
            <div style={s.portDrop}>
              <div style={s.portCash}>
                <div style={s.portCashItem}><div style={s.portCashLabel}>Total</div><div style={{ ...s.portCashVal, color: 'var(--green-btn)' }}>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                <div style={{ ...s.portCashItem, borderLeft: '1px solid var(--border)' }}><div style={s.portCashLabel}>Cash</div><div style={s.portCashVal}>${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                <div style={{ ...s.portCashItem, borderLeft: '1px solid var(--border)' }}><div style={s.portCashLabel}>Invested</div><div style={s.portCashVal}>${totalPositionsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
              </div>
              <div style={s.portSecLabel}>Positions · {trades.length}</div>
              {trades.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 12px' }}>No positions yet — add a ticker below</div>
              ) : trades.map(trade => {
                const curPrice = prices[trade.ticker] || Number(trade.entry_price);
                const entryPrice = Number(trade.entry_price);
                const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
                const isUp = pctGain >= 0;
                return (
                  <div key={trade.id} style={s.portPos}>
                    <span style={s.portPosTk}>{trade.ticker}</span>
                    <span style={s.portPosInfo}>{Number(trade.shares).toFixed(1)} · avg ${entryPrice.toFixed(2)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--green-btn)' : 'var(--red)', minWidth: 45, textAlign: 'right', marginRight: 6 }}>{isUp ? '+' : ''}{pctGain.toFixed(1)}%</span>
                    <div onClick={(e) => { e.stopPropagation(); setSellTrade({ ...trade, currentPrice: curPrice }); }} style={s.portPosSell}>Sell</div>
                  </div>
                );
              })}
              <div style={s.portBuyRow}>
                <input style={s.portBuyInput} value={searchQuery} onChange={e => setSearchQuery(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="ADD TICKER" maxLength={5} />
                <button style={s.portBuyBtn} onClick={() => { if (searchResults.length > 0) handleSelectTicker(searchResults[0]); }}>Buy</button>
              </div>
              {searchResults.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {searchResults.map(r => (
                    <div key={r.symbol} style={s.portSearchRow} onClick={() => handleSelectTicker(r)}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)' }}>{r.symbol}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {searching && <div style={{ fontSize: 10, color: 'var(--text3)', padding: '6px 12px' }}>Searching...</div>}
              {showPresets && selectedTicker && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--green-bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div><b style={{ fontSize: 12, color: 'var(--green-btn)' }}>{selectedTicker.symbol}</b> <span style={{ fontSize: 10, color: 'var(--green-btn)' }}>${selectedTicker.price.toFixed(2)}</span></div>
                    <button style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--green-btn)', cursor: 'pointer' }} onClick={clearSelection}>×</button>
                  </div>
                  {!showCustom ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1000, 5000, 10000].map(amt => (<button key={amt} style={s.presetBtnSm} onClick={() => executeBuy(amt)}>{buying ? '..' : `$${amt / 1000}K`}</button>))}
                      <button style={s.otherBtnSm} onClick={() => setShowCustom(true)}>Other</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={s.customWrapSm}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-btn)' }}>$</span><input style={s.customInputSm} type="number" inputMode="decimal" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="Amt" autoFocus /></div>
                      <button style={{ ...s.customBuySm, opacity: (parseFloat(customAmount) > 0 && !buying) ? 1 : 0.4 }} onClick={() => executeBuy(parseFloat(customAmount) || 0)} disabled={!(parseFloat(customAmount) > 0) || buying}>{buying ? '..' : 'Buy'}</button>
                    </div>
                  )}
                  {buyError && <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 3 }}>{buyError}</div>}
                </div>
              )}
              <div onClick={() => setShowHistory(!showHistory)} style={s.portHistToggle}>{showHistory ? 'Hide History ▲' : `Trade History (${closedTrades.length}) ▼`}</div>
              {showHistory && (
                <div style={{ padding: '0 12px 8px' }}>
                  {closedTrades.length > 0 && (() => {
                    const wins = closedTrades.filter(t => Number(t.exit_price) > Number(t.entry_price)).length;
                    const totalPL = closedTrades.reduce((sum, t) => sum + (Number(t.exit_price) - Number(t.entry_price)) * Number(t.shares), 0);
                    const avgHold = closedTrades.reduce((sum, t) => { if (!t.sold_at || !t.bought_at) return sum; return sum + (new Date(t.sold_at) - new Date(t.bought_at)) / 86400000; }, 0) / closedTrades.length;
                    const winRate = Math.round((wins / closedTrades.length) * 100);
                    return (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--text3)' }}>Win rate</div><div style={{ fontSize: 14, fontWeight: 700, color: winRate >= 50 ? 'var(--green-btn)' : 'var(--red)' }}>{winRate}%</div></div>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--text3)' }}>Avg hold</div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{avgHold.toFixed(1)}d</div></div>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--text3)' }}>Total P&L</div><div style={{ fontSize: 14, fontWeight: 700, color: totalPL >= 0 ? 'var(--green-btn)' : 'var(--red)' }}>{totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toFixed(0)}</div></div>
                      </div>
                    );
                  })()}
                  {closedTrades.map(trade => {
                    const entry = Number(trade.entry_price); const exit = Number(trade.exit_price); const pl = (exit - entry) * Number(trade.shares);
                    const pctReturn = ((exit - entry) / entry) * 100; const isWin = pl >= 0;
                    const holdMs = trade.sold_at && trade.bought_at ? new Date(trade.sold_at) - new Date(trade.bought_at) : 0;
                    const holdHours = holdMs / 3600000; const holdDisplay = holdHours < 24 ? `${Math.round(holdHours)}h` : `${Math.round(holdHours / 24)}d`;
                    const buyDate = trade.bought_at ? new Date(trade.bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    return (<div key={trade.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{trade.ticker}</span><span style={{ fontSize: 10, color: 'var(--text3)' }}>{buyDate} · {holdDisplay}</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: isWin ? 'var(--green-btn)' : 'var(--red)' }}>{isWin ? '+' : ''}{pctReturn.toFixed(1)}%</span></div></div>);
                  })}
                  {closedTrades.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No closed trades yet</div>}
                </div>
              )}
            </div>
          )}

          {/* TODAY'S RACE */}
          <div style={s.raceCard}>
            <div style={s.raceCardHdr}><span style={s.raceCardTitle}>🏁 Today's Race</span><span style={s.raceCardSub}>{daysLeft} days left</span></div>
            <div style={s.raceCardBody}>
              {(() => {
                const sorted = [...leaderboard].sort((a, b) => b.pctReturn - a.pctReturn);
                const best = sorted[0]; const worst = sorted[sorted.length - 1];
                if (!best) return <div style={{ fontSize: 11, color: 'var(--text3)' }}>Waiting for participants...</div>;
                return (<div style={{ fontSize: 11, color: 'var(--text1)', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--green-btn)', fontWeight: 600 }}>▲ {best.username} +{best.pctReturn.toFixed(1)}%</span>
                  {best.positions?.[0] && <span style={{ color: 'var(--text3)' }}> — {best.positions[0].ticker}</span>}<br/>
                  {worst && worst.userId !== best.userId && (<><span style={{ color: 'var(--red)', fontWeight: 600 }}>▼ {worst.username} {worst.pctReturn >= 0 ? '+' : ''}{worst.pctReturn.toFixed(1)}%</span>{worst.positions?.[0] && <span style={{ color: 'var(--text3)' }}> — {worst.positions[0].ticker}</span>}</>)}
                </div>);
              })()}
            </div>
          </div>

          {/* DAILY LEARN */}
          <div style={s.learnCard}>
            <div style={s.learnCardHdr}><span style={{ fontSize: 9, fontWeight: 700, color: '#8B5CF6' }}>💡 LEARN</span></div>
            <div style={s.learnCardBody}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)', marginBottom: 3 }}>{trades.length === 0 ? 'What is a stock ticker?' : 'When to cut your losses'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>{trades.length === 0 ? "A short code for a company. AAPL = Apple, NVDA = Nvidia, TSLA = Tesla. Tap Join above to pick your first stock!" : "Most pros set a stop at 15-20%. If a stock drops that much from your buy price, consider whether your original thesis still holds."}</div>
            </div>
          </div>

          {/* SMACK TALK */}
          <div style={s.smackWrap}>
            <div style={s.smackHdr}><span>💬 Smack Talk</span><div style={s.smackLive}><div style={s.smackDot} /> LIVE</div></div>
            <div style={{ ...s.smackMsgs, maxHeight: 150 }}>
              {trashTalkMsgs.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>No smack yet — be the first</div>
              ) : trashTalkMsgs.map((m) => {
                const lbEntry = leaderboard.find(e => e.userId === m.user_id);
                const rank = lbEntry ? leaderboard.indexOf(lbEntry) + 1 : null;
                const tier = lbEntry ? getTier(lbEntry.pctReturn) : null;
                const medalBg = rank === 1 ? 'linear-gradient(135deg,#FFD700,#e6a800)' : rank === 2 ? 'linear-gradient(135deg,#C0C0C0,#909090)' : rank === 3 ? 'linear-gradient(135deg,#CD7F32,#a0622d)' : '#d8e2ed';
                const rxns = chatReactions[m.id] || {};
                return (
                  <div key={m.id} style={s.smackMsg}>
                    <div style={s.smackMsgTop}>
                      <div style={{ ...s.smackAv, background: medalBg, color: rank && rank <= 3 ? '#fff' : 'var(--text3)' }}>{(m.profiles?.username || '?')[0].toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text1)' }}>{m.profiles?.username || 'Anon'}</span>
                          {tier && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: tier.bg, color: tier.color, fontWeight: 500 }}>{tier.short}</span>}
                          <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>{timeAgo(m.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text1)', lineHeight: 1.35, marginTop: 2 }}>{m.message}</div>
                      </div>
                    </div>
                    <div style={s.rxnRow}>
                      {REACTIONS.map(r => { const users = rxns[r.label] || []; const myReacted = users.includes(session?.user?.id); if (users.length === 0 && !myReacted) return null; return (<div key={r.label} style={{ ...s.rxnPill, ...(myReacted ? s.rxnLit : {}) }} onClick={() => toggleReaction(m.id, r.label)}><span style={{ fontSize: 12 }}>{r.emoji}</span><span style={{ ...s.rxnCt, ...(myReacted ? { color: '#3B6D11' } : {}) }}>{users.length}</span></div>); })}
                      <div style={s.rxnAdd} onClick={() => { const firstUnused = REACTIONS.find(r => !(rxns[r.label] || []).includes(session?.user?.id)); if (firstUnused) toggleReaction(m.id, firstUnused.label); }}>+</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={s.smackInput}>
              <input style={s.smackInputField} value={trashTalkInput} onChange={e => setTrashTalkInput(e.target.value.slice(0, 200))} placeholder="Talk your talk..." onKeyDown={e => e.key === 'Enter' && sendTrashTalk()} enterKeyHint="send" />
              <button style={s.smackSendBtn} onClick={() => sendTrashTalk()}>Send</button>
            </div>
          </div>

        </div>
      ) : (

        /* ── LEADERBOARD VIEW — GAMIFIED ── */
        <div style={{ padding: '0 0 8px' }}>

          {/* Race lanes — top 3 */}
          <div style={s.raceBg}>
            <div style={s.raceTop}>
              <span style={s.raceLabel}>Season 1 · Race to the top</span>
              <div style={s.raceTimer}>
                <span style={s.rtBox}>{daysLeft}d</span>
                <span style={s.rtSep}>:</span>
                <span style={s.rtBox}>{String(Math.floor((seasonEnd - new Date()) / 3600000) % 24).padStart(2, '0')}h</span>
                <span style={s.rtSep}>:</span>
                <span style={s.rtBox}>{String(Math.floor((seasonEnd - new Date()) / 60000) % 60).padStart(2, '0')}m</span>
              </div>
            </div>
            {lbLoading ? (
              [1, 2, 3].map(i => <div key={i} style={{ ...s.skeleton, height: 28, marginBottom: 10 }} />)
            ) : leaderboard.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '16px 0' }}>No participants yet</div>
            ) : (
              <div style={s.track}>
                {leaderboard.slice(0, 3).map((entry, idx) => {
                  const tier = getTier(entry.pctReturn);
                  const medalBg = idx === 0 ? 'linear-gradient(135deg,#FFD700,#e6a800)' : idx === 1 ? 'linear-gradient(135deg,#C0C0C0,#909090)' : 'linear-gradient(135deg,#CD7F32,#a0622d)';
                  const laneBg = idx === 0 ? 'rgba(255,215,0,0.12)' : idx === 1 ? 'rgba(192,192,192,0.08)' : 'rgba(205,127,50,0.08)';
                  const barWidth = idx === 0 ? '100%' : `${Math.max(10, (entry.pctReturn / Math.max(leaderboard[0]?.pctReturn || 1, 0.01)) * 100)}%`;
                  const barGrad = idx === 0 ? 'linear-gradient(90deg,#FFD700,#8cd9a0)' : idx === 1 ? 'linear-gradient(90deg,#C0C0C0,#7B8CDE)' : 'linear-gradient(90deg,#CD7F32,#8cd9a0)';
                  const pctColor = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#8cd9a0';
                  const isMe = entry.userId === session?.user?.id;
                  return (
                    <div key={entry.userId} style={{ ...s.lane, background: laneBg, ...(isMe ? { border: '1px solid rgba(140,217,160,0.4)' } : {}) }}>
                      <div style={s.laneLeft}>
                        <div style={{ ...s.laneMedal, background: medalBg }}>{idx + 1}</div>
                        <span style={s.laneName}>{entry.username}{isMe ? ' ★' : ''}</span>
                        <span style={{ ...s.laneTier, background: tier.bg, color: tier.color }}>{tier.short}</span>
                        {entry.behaviorBadges?.map(b => (
                          <span key={b.type} style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, background: b.bg, color: b.color, fontWeight: 600 }}>{b.label}</span>
                        ))}
                      </div>
                      <div style={s.laneBarWrap}><div style={{ ...s.laneBar, width: barWidth, background: barGrad }} /></div>
                      <span style={{ ...s.lanePct, color: pctColor }}>{entry.pctReturn >= 0 ? '+' : ''}{entry.pctReturn.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Your stats strip */}
          {myRank !== null && (() => {
            const myEntry = leaderboard.find(e => e.userId === session?.user?.id);
            const myTier = myEntry ? getTier(myEntry.pctReturn) : getTier(0);
            return (
              <div style={s.youStrip}>
                <span style={s.youBadge}>#{myRank} YOU</span>
                {myEntry?.behaviorBadges?.map(b => (
                  <span key={b.type} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: b.bg, color: b.color, fontWeight: 600 }}>{b.label}</span>
                ))}
                <div style={s.youMid}>
                  <span style={s.youVal}>
                    <strong>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong> · {trades.length} pos
                  </span>
                  {aheadUser && <span style={s.youCatch}>{aheadUser.gap}% behind {aheadUser.username}</span>}
                  {!aheadUser && <span style={{ fontSize: 10, color: '#27500A', background: '#EAF3DE', padding: '2px 6px', borderRadius: 3 }}>In the lead!</span>}
                </div>
                <div style={s.youRight}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isPositive ? '#3B6D11' : '#E24B4A' }}>
                    {isPositive ? '+' : ''}{totalReturn.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stat cards grid */}
          <div style={s.statGrid}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Best pick</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: myBestPick && myBestPick.pctGain >= 0 ? '#3B6D11' : '#E24B4A', marginTop: 2 }}>
                {myBestPick ? myBestPick.ticker : '—'}
              </div>
              <div style={s.statSub}>{myBestPick ? `${myBestPick.pctGain >= 0 ? '+' : ''}${myBestPick.pctGain.toFixed(1)}% since buy` : 'No positions'}</div>
              {myBestPick && (
                <div style={s.statBar}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, Math.max(5, Math.abs(myBestPick.pctGain) * 4))}%`, background: myBestPick.pctGain >= 0 ? '#3B6D11' : '#E24B4A' }} />
                </div>
              )}
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Total trades</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginTop: 2 }}>{myTotalTrades}</div>
              <div style={s.statSub}>
                {leaderboard.length > 0
                  ? `Top ${Math.max(1, Math.round((1 - (leaderboard.findIndex(e => e.userId === session?.user?.id) / Math.max(leaderboard.length, 1))) * 100))}% in group`
                  : 'Start trading!'}
              </div>
              <div style={s.statBar}>
                <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, myTotalTrades * 8)}%`, background: '#185FA5' }} />
              </div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Win rate</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginTop: 2 }}>{myWinRate.pct}%</div>
              <div style={s.statSub}>{myWinRate.wins} of {myWinRate.total} picks green</div>
              <div style={s.statBar}>
                <div style={{ height: '100%', borderRadius: 2, width: `${myWinRate.pct}%`, background: '#3B6D11' }} />
              </div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Next badge</div>
              {(() => {
                const unearned = Object.entries(BADGE_DEFS).find(([key]) => !userBadges.includes(key));
                if (!unearned) return <div style={{ fontSize: 11, color: 'var(--text1)', fontWeight: 600, marginTop: 2 }}>All earned!</div>;
                const [key, def] = unearned;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: def.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: def.color, fontWeight: 700 }}>
                        {def.label[0]}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text1)' }}>{def.label}</span>
                    </div>
                    <div style={s.statSub}>{key === 'expert' ? 'Make 10 trades' : key === 'champion' ? 'Reach #1' : key === 'diamond' ? 'Hold 7 days' : key === 'streak' ? '5-day streak' : 'Make your first trade'}</div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Full rankings */}
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, marginTop: 8 }}>
              <span style={s.sectionTitle}>Full rankings</span>
              <span style={{ fontSize: 9, color: '#3B6D11' }}>tap to peek</span>
            </div>
            {leaderboard.slice(3).map((entry, idx) => {
              const rank = idx + 4;
              const isMe = entry.userId === session?.user?.id;
              const isUp = entry.pctReturn >= 0;
              const tier = getTier(entry.pctReturn);
              const isExpanded = expandedUser === entry.userId;
              const barW = leaderboard[0]?.pctReturn > 0 ? Math.max(0, (entry.pctReturn / leaderboard[0].pctReturn) * 100) : 0;
              return (
                <div key={entry.userId}>
                  <div
                    style={{ ...s.rankRow, ...(isMe ? { border: '2px solid #8cd9a0' } : {}) }}
                    onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}
                  >
                    <div style={s.rankNum}>{rank}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {entry.username}
                        {isMe && <span style={{ fontSize: 8, color: '#3B6D11', background: '#EAF3DE', padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>YOU</span>}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', display: 'flex', gap: 6, marginTop: 1 }}>
                        <span>{entry.openCount} pos</span>
                        <span style={{ color: tier.color, fontWeight: 500 }}>{tier.short}</span>
                        {entry.behaviorBadges?.map(b => (
                          <span key={b.type} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: b.bg, color: b.color, fontWeight: 600 }}>{b.label}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ width: 40, height: 3, background: '#eef2f7', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${Math.max(0, barW)}%`, background: isUp ? '#3B6D11' : '#E24B4A' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? '#3B6D11' : '#E24B4A', flexShrink: 0, width: 55, textAlign: 'right' }}>
                      {isUp ? '+' : ''}{entry.pctReturn.toFixed(1)}%
                    </div>
                  </div>
                  {isExpanded && entry.positions.length > 0 && (
                    <div style={{ padding: '4px 14px 8px 44px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {entry.positions.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)' }}>{p.ticker}</span>
                          <span style={{ fontSize: 10, color: p.pctGain >= 0 ? '#3B6D11' : '#E24B4A' }}>{p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {leaderboard.length <= 3 && leaderboard.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>All players shown in race lanes above</div>
            )}
          </div>

          {/* Activity feed chips */}
          <div style={s.feedScroll}>
            {activity.slice(0, 6).map((a, i) => {
              const who = a.profiles?.username || 'Someone';
              const isSell = a.status === 'closed';
              return (
                <div key={a.id || i} style={s.feedChip}>
                  <div style={{ ...s.feedDot, background: isSell ? '#E24B4A' : '#3B6D11' }} />
                  <strong>{who}</strong>&nbsp;{isSell ? '-' : '+'}{a.ticker} · {timeAgo(a.bought_at)}
                </div>
              );
            })}
            {activity.length === 0 && <div style={{ ...s.feedChip, color: 'var(--text3)' }}>No activity yet</div>}
          </div>

          {/* Smack talk with reactions */}
          <div style={s.smackWrap}>
            <div style={s.smackHdr}>
              <span>Smack talk</span>
              <div style={s.smackLive}><div style={s.smackDot} /> LIVE</div>
            </div>
            <div style={s.smackMsgs}>
              {trashTalkMsgs.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>No smack yet — be the first</div>
              ) : (
                trashTalkMsgs.map((m) => {
                  const lbEntry = leaderboard.find(e => e.userId === m.user_id);
                  const rank = lbEntry ? leaderboard.indexOf(lbEntry) + 1 : null;
                  const tier = lbEntry ? getTier(lbEntry.pctReturn) : null;
                  const medalBg = rank === 1 ? 'linear-gradient(135deg,#FFD700,#e6a800)' : rank === 2 ? 'linear-gradient(135deg,#C0C0C0,#909090)' : rank === 3 ? 'linear-gradient(135deg,#CD7F32,#a0622d)' : '#d8e2ed';
                  const rxns = chatReactions[m.id] || {};
                  return (
                    <div key={m.id} style={s.smackMsg}>
                      <div style={s.smackMsgTop}>
                        <div style={{ ...s.smackAv, background: medalBg, color: rank && rank <= 3 ? '#fff' : 'var(--text3)' }}>
                          {(m.profiles?.username || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text1)' }}>{m.profiles?.username || 'Anon'}</span>
                            {tier && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: tier.bg, color: tier.color, fontWeight: 500 }}>{tier.short}</span>}
                            <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>{timeAgo(m.created_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text1)', lineHeight: 1.35, marginTop: 2 }}>{m.message}</div>
                        </div>
                      </div>
                      <div style={s.rxnRow}>
                        {REACTIONS.map(r => {
                          const users = rxns[r.label] || [];
                          const myReacted = users.includes(session?.user?.id);
                          if (users.length === 0 && !myReacted) return null;
                          return (
                            <div key={r.label} style={{ ...s.rxnPill, ...(myReacted ? s.rxnLit : {}) }} onClick={() => toggleReaction(m.id, r.label)}>
                              <span style={{ fontSize: 12 }}>{r.emoji}</span>
                              <span style={{ ...s.rxnCt, ...(myReacted ? { color: '#3B6D11' } : {}) }}>{users.length}</span>
                            </div>
                          );
                        })}
                        <div style={s.rxnAdd} onClick={() => {
                          const msgId = m.id;
                          const firstUnused = REACTIONS.find(r => !(rxns[r.label] || []).includes(session?.user?.id));
                          if (firstUnused) toggleReaction(msgId, firstUnused.label);
                        }}>+</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={s.smackInput}>
              <input
                style={s.smackInputField}
                value={trashTalkInput}
                onChange={e => setTrashTalkInput(e.target.value.slice(0, 200))}
                placeholder="Talk your talk..."
                onKeyDown={e => e.key === 'Enter' && sendTrashTalk()}
                enterKeyHint="send"
              />
              <button style={s.smackSendBtn} onClick={sendTrashTalk}>Send</button>
            </div>
          </div>

        </div>
      )}

      {/* SellModal */}
      {sellTrade && (
        <SellModal
          session={session}
          trade={sellTrade}
          onClose={() => setSellTrade(null)}
          onComplete={onSellComplete}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const s = {
  scroll: { flex: 1, overflowY: 'auto', background: 'var(--bg)' },

  // Segmented control
  segWrap: { padding: '10px 12px 0' },
  segBar: { display: 'flex', background: 'var(--card2)', borderRadius: 8, padding: 2, gap: 2 },
  segBtn: {
    flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: 'transparent', color: 'var(--text3)',
    fontFamily: 'var(--font)', transition: 'all 0.15s',
  },
  segActive: { background: 'var(--card)', color: 'var(--text1)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },

  // Top bar — new user
  barNew: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--green-bg)', border: '1px solid rgba(59,109,17,0.15)', borderRadius: 10, marginTop: 8, marginBottom: 8 },
  barNewText: { flex: 1 },
  barNewTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text1)' },
  barNewSub: { fontSize: 10, color: 'var(--text3)', marginTop: 2 },
  barNewBtn: { background: 'var(--green-btn)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  // Top bar — active user
  barActive: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 8, marginBottom: 8 },
  barRank: { width: 30, height: 30, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  barRankText: { fontSize: 13, fontWeight: 800, color: 'var(--green-btn)' },
  barStats: { flex: 1 },
  barStatsTop: { display: 'flex', alignItems: 'center', gap: 6 },
  barStatsBottom: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text3)', marginTop: 2, flexWrap: 'wrap' },
  barPortBtn: { background: 'var(--green-bg)', border: '1px solid rgba(59,109,17,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: 10, fontWeight: 600, color: 'var(--green-btn)', cursor: 'pointer', flexShrink: 0 },
  barPortBtnOpen: { background: 'var(--green-btn)', color: '#fff', borderColor: 'var(--green-btn)' },
  // Portfolio dropdown
  portDrop: { background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, overflow: 'hidden' },
  portCash: { display: 'flex' },
  portCashItem: { flex: 1, padding: '10px 8px', textAlign: 'center' },
  portCashLabel: { fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 },
  portCashVal: { fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginTop: 2 },
  portSecLabel: { fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 12px 4px', borderTop: '1px solid var(--border)' },
  portPos: { display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' },
  portPosTk: { fontSize: 13, fontWeight: 700, color: 'var(--text1)', width: 48 },
  portPosInfo: { flex: 1, fontSize: 11, color: 'var(--text3)' },
  portPosSell: { fontSize: 10, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid rgba(224,82,82,0.2)', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 },
  portBuyRow: { display: 'flex', gap: 4, padding: '8px 12px', borderTop: '1px solid var(--border)' },
  portBuyInput: { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text1)', fontFamily: 'var(--font)', outline: 'none', letterSpacing: 0.4 },
  portBuyBtn: { background: 'var(--green-btn)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  portSearchRow: { padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' },
  portHistToggle: { fontSize: 10, fontWeight: 600, color: 'var(--blue)', textAlign: 'center', padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' },
  // Preset buy styles (kept)
  presetBtnSm: { flex: 1, padding: '6px 0', borderRadius: 5, border: '1px solid var(--green-btn)', background: 'transparent', fontSize: 11, fontWeight: 600, color: 'var(--green-btn)', cursor: 'pointer', fontFamily: 'var(--font)' },
  otherBtnSm: { flex: 1, padding: '6px 0', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  customWrapSm: { flex: 1, display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--green-btn)', borderRadius: 5, padding: '0 6px' },
  customInputSm: { flex: 1, border: 'none', background: 'transparent', padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--green-btn)', outline: 'none', fontFamily: 'var(--font)' },
  customBuySm: { background: 'var(--green-btn)', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  // Cards
  raceCard: { background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, overflow: 'hidden' },
  raceCardHdr: { padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  raceCardTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text1)' },
  raceCardSub: { fontSize: 9, color: 'var(--text3)' },
  raceCardBody: { padding: '0 12px 10px' },
  learnCard: { background: 'var(--card)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.12)', marginBottom: 8, overflow: 'hidden' },
  learnCardHdr: { padding: '8px 12px 4px' },
  learnCardBody: { padding: '0 12px 10px' },

  // Leaderboard (full width, unchanged)
  section: { padding: '0 16px 8px' },
  lbRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '13px 14px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
  },
  lbRank: { fontSize: 14, fontWeight: 700, color: 'var(--text2)', width: 30 },
  lbName: { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text1)' },
  lbYou: { fontSize: 12, fontWeight: 400, color: 'var(--text3)' },
  lbReturn: { fontSize: 14, fontWeight: 700, width: 70, textAlign: 'right' },
  lbCount: { fontSize: 11, color: 'var(--text3)', width: 40, textAlign: 'right' },
  lbExpanded: { padding: '4px 14px 12px 44px', display: 'flex', flexWrap: 'wrap', gap: 8 },
  lbTicker: {
    display: 'flex', gap: 6, alignItems: 'center',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 10px',
  },
  lbTickerName: { fontSize: 12, fontWeight: 700, color: 'var(--text1)' },

  // Loading
  skeleton: { height: 52, borderRadius: 12, marginBottom: 10, background: 'var(--card2)', animation: 'pulse 1.5s ease-in-out infinite' },

  // ── Leaderboard v2: Race lanes ──
  raceBg: {
    margin: '8px 16px 0', background: 'linear-gradient(135deg,#132d52,#1a3d6e)',
    borderRadius: 12, padding: '10px 12px', position: 'relative', overflow: 'hidden',
  },
  raceTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  raceLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 },
  raceTimer: { display: 'flex', gap: 3, alignItems: 'center' },
  rtBox: { background: 'rgba(255,255,255,0.1)', color: '#8cd9a0', fontSize: 10, fontWeight: 600, padding: '2px 4px', borderRadius: 3 },
  rtSep: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
  track: { display: 'flex', flexDirection: 'column', gap: 10 },
  lane: {
    display: 'flex', alignItems: 'center', borderRadius: 6, padding: '0 8px', height: 28,
    border: '1px solid transparent',
  },
  laneLeft: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 0 },
  laneMedal: {
    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  laneName: { fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' },
  laneTier: { fontSize: 8, padding: '1px 5px', borderRadius: 2, fontWeight: 500, whiteSpace: 'nowrap' },
  laneBarWrap: {
    flex: 1, margin: '0 8px', height: 6, background: 'rgba(255,255,255,0.06)',
    borderRadius: 3, overflow: 'hidden',
  },
  laneBar: { height: '100%', borderRadius: 3 },
  lanePct: { fontSize: 13, fontWeight: 700, flexShrink: 0 },

  // ── Your stats strip ──
  youStrip: {
    margin: '8px 16px 0', background: 'var(--card)', border: '2px solid #8cd9a0',
    borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
  },
  youBadge: { background: '#3B6D11', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, flexShrink: 0 },
  youMid: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  youVal: { fontSize: 12, color: 'var(--text1)' },
  youCatch: { fontSize: 10, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' },
  youRight: { textAlign: 'right', flexShrink: 0 },

  // ── Stat cards grid ──
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '8px 16px 0' },
  statCard: { background: 'var(--card)', borderRadius: 10, border: '0.5px solid var(--border)', padding: '8px 10px' },
  statLabel: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 500 },
  statSub: { fontSize: 10, color: 'var(--text3)', marginTop: 1 },
  statBar: { height: 3, background: '#eef2f7', borderRadius: 2, marginTop: 4, overflow: 'hidden' },

  // ── Section titles ──
  sectionTitle: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 },

  // ── Rank rows ──
  rankRow: {
    background: 'var(--card)', borderRadius: 8, border: '0.5px solid var(--border)',
    padding: '7px 10px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  },
  rankNum: {
    width: 20, height: 20, borderRadius: '50%', background: '#d8e2ed',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 600, color: 'var(--text3)', flexShrink: 0,
  },

  // ── Activity feed chips ──
  feedScroll: {
    margin: '8px 16px 0', display: 'flex', gap: 8, overflowX: 'auto',
    scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', padding: '2px 0',
  },
  feedChip: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 10, color: 'var(--text1)', background: 'var(--card)',
    border: '0.5px solid var(--border)', padding: '4px 8px', borderRadius: 6,
  },
  feedDot: { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },

  // ── Smack talk ──
  smackWrap: { margin: '8px 16px 10px', background: 'var(--card)', borderRadius: 10, border: '0.5px solid var(--border)', overflow: 'hidden' },
  smackHdr: {
    fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4,
    fontWeight: 500, padding: '8px 10px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  smackLive: {
    fontSize: 8, color: '#3B6D11', background: '#EAF3DE', padding: '2px 6px',
    borderRadius: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
  },
  smackDot: { width: 5, height: 5, borderRadius: '50%', background: '#3B6D11' },
  smackMsgs: { padding: '0 10px 6px', maxHeight: 200, overflowY: 'auto' },
  smackMsg: { padding: '6px 0', borderTop: '0.5px solid var(--border)' },
  smackMsgTop: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  smackAv: {
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0,
  },
  rxnRow: { display: 'flex', gap: 4, marginTop: 5, marginLeft: 30 },
  rxnPill: {
    display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
    borderRadius: 12, cursor: 'pointer', border: '0.5px solid var(--border)',
    background: '#eef2f7', fontSize: 11,
  },
  rxnLit: { background: '#EAF3DE', borderColor: '#3B6D11' },
  rxnCt: { fontSize: 10, fontWeight: 600, color: 'var(--text3)' },
  rxnAdd: {
    padding: '2px 6px', borderRadius: 12, cursor: 'pointer', fontSize: 11,
    border: '0.5px dashed var(--border)', background: 'transparent', color: 'var(--text3)',
    display: 'flex', alignItems: 'center', gap: 2,
  },
  smackInput: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '0.5px solid var(--border)', background: '#eef2f7' },
  smackInputField: {
    flex: 1, background: 'var(--card)', border: '0.5px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--text1)',
    fontFamily: 'var(--font)', outline: 'none',
  },
  smackSendBtn: {
    background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },
};
