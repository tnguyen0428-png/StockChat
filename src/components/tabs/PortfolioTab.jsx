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
import { useTheme } from './alertsCasinoComponents';

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

export default function PortfolioTab({ session, darkMode }) {
  const { profile } = useGroup();

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
  const [showAllRankings, setShowAllRankings] = useState(false);

  // Leaderboard v2 state
  const [chatReactions, setChatReactions] = useState({});
  const [myTotalTrades, setMyTotalTrades] = useState(0);
  const [myWinRate, setMyWinRate] = useState({ wins: 0, total: 0, pct: 0 });
  const [myBestPick, setMyBestPick] = useState(null);

  const refreshRef = useRef(null);
  const allTradesRef = useRef([]);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

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
      if (Object.keys(map).length > 0 && mountedRef.current) {
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

      // Check for existing open position in same ticker
      const { data: existingTrade } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('ticker', selectedTicker.symbol)
        .eq('status', 'open')
        .maybeSingle();

      let tradeId;
      if (existingTrade) {
        const oldShares = Number(existingTrade.shares);
        const oldPrice = Number(existingTrade.entry_price);
        const oldDollar = Number(existingTrade.dollar_amount);
        const newShares = oldShares + shares;
        const newAvgPrice = ((oldPrice * oldShares) + (selectedTicker.price * shares)) / newShares;
        const newDollar = oldDollar + dollarAmount;
        const { error: mergeErr } = await supabase
          .from('paper_trades')
          .update({ shares: newShares, entry_price: newAvgPrice, dollar_amount: newDollar })
          .eq('id', existingTrade.id);
        if (mergeErr) throw mergeErr;
        tradeId = existingTrade.id;
      } else {
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
        tradeId = trade.id;
      }

      const { error: updateErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: freshCash - dollarAmount })
        .eq('user_id', session.user.id);
      if (updateErr) {
        if (!existingTrade) {
          await supabase.from('paper_trades').delete().eq('id', tradeId);
        } else {
          await supabase.from('paper_trades').update({
            shares: existingTrade.shares,
            entry_price: existingTrade.entry_price,
            dollar_amount: existingTrade.dollar_amount,
          }).eq('id', existingTrade.id);
        }
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
    let cancelled = false;
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
    // Total trades count (async — must check mounted)
    (async () => {
      const { count } = await supabase
        .from('paper_trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      if (!cancelled) setMyTotalTrades(count || 0);
    })();
    return () => { cancelled = true; };
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

  const _t = useTheme(darkMode);
  // Extend with portfolio-specific overrides + medal colors
  const t = {
    ..._t,
    // Portfolio uses a brighter green than the shared theme
    green: darkMode ? '#5eed8a' : '#16a34a',
    greenBg: darkMode ? 'rgba(94,237,138,0.1)' : 'rgba(22,163,74,0.08)',
    medalGold: 'linear-gradient(135deg,#FFD700,#e6a800)',
    medalSilver: 'linear-gradient(135deg,#C0C0C0,#909090)',
    medalBronze: 'linear-gradient(135deg,#CD7F32,#a0622d)',
    pctGold: darkMode ? '#FFD700' : '#b8860b',
    pctSilver: darkMode ? '#C0C0C0' : '#6b7280',
    pctBronze: darkMode ? '#8cd9a0' : '#16a34a',
  };

  const s = {
    scroll: { flex: 1, overflowY: 'auto', background: t.bg, minHeight: '100%' },
    barNew: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: t.card, border: `1px solid ${t.green}25`, borderRadius: 12, marginBottom: 8 },
    barNewText: { flex: 1 },
    barNewTitle: { fontSize: 12, fontWeight: 700, color: t.text1 },
    barNewSub: { fontSize: 10, color: t.text3, marginTop: 2 },
    barNewBtn: { background: t.green, color: t.btnText, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
    barActive: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, marginBottom: 8 },
    barRank: { width: 30, height: 30, borderRadius: '50%', background: t.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    barRankText: { fontSize: 13, fontWeight: 800, color: t.green },
    barStats: { flex: 1 },
    barStatsTop: { display: 'flex', alignItems: 'center', gap: 6 },
    barStatsBottom: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: t.text3, marginTop: 2, flexWrap: 'wrap' },
    barPortBtn: { background: t.greenBg, border: `1px solid ${t.green}40`, borderRadius: 8, padding: '6px 12px', fontSize: 10, fontWeight: 600, color: t.green, cursor: 'pointer', flexShrink: 0 },
    barPortBtnOpen: { background: t.green, color: t.btnText, borderColor: t.green },
    portDrop: { background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 8, overflow: 'hidden' },
    portCash: { display: 'flex' },
    portCashItem: { flex: 1, padding: '10px 8px', textAlign: 'center' },
    portCashLabel: { fontSize: 9, color: t.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 },
    portCashVal: { fontSize: 15, fontWeight: 700, color: t.text1, marginTop: 2 },
    portSecLabel: { fontSize: 9, fontWeight: 600, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 12px 4px', borderTop: `1px solid ${t.border}` },
    portPos: { display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${t.border}` },
    portPosTk: { fontSize: 13, fontWeight: 700, color: t.text1, width: 48 },
    portPosInfo: { flex: 1, fontSize: 11, color: t.text3 },
    portPosSell: { fontSize: 10, fontWeight: 600, color: t.red, background: t.redBg, border: `1px solid ${t.red}30`, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 },
    portBuyRow: { display: 'flex', gap: 4, padding: '8px 12px', borderTop: `1px solid ${t.border}` },
    portBuyInput: { flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, fontWeight: 600, color: t.text1, fontFamily: 'var(--font)', outline: 'none', letterSpacing: 0.4 },
    portBuyBtn: { background: t.green, color: t.btnText, border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
    portSearchRow: { padding: '8px 12px', borderBottom: `1px solid ${t.border}`, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' },
    portHistToggle: { fontSize: 10, fontWeight: 600, color: t.blue, textAlign: 'center', padding: '8px 12px', cursor: 'pointer', borderTop: `1px solid ${t.border}` },
    presetBtnSm: { flex: 1, padding: '6px 0', borderRadius: 5, border: `1px solid ${t.green}`, background: 'transparent', fontSize: 11, fontWeight: 600, color: t.green, cursor: 'pointer', fontFamily: 'var(--font)' },
    otherBtnSm: { flex: 1, padding: '6px 0', borderRadius: 5, border: `1px solid ${t.border}`, background: 'transparent', fontSize: 11, fontWeight: 600, color: t.text2, cursor: 'pointer', fontFamily: 'var(--font)' },
    customWrapSm: { flex: 1, display: 'flex', alignItems: 'center', background: t.card, border: `1px solid ${t.green}`, borderRadius: 5, padding: '0 6px' },
    customInputSm: { flex: 1, border: 'none', background: 'transparent', padding: '6px 0', fontSize: 12, fontWeight: 600, color: t.green, outline: 'none', fontFamily: 'var(--font)' },
    customBuySm: { background: t.green, color: t.btnText, border: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
    rankingsCard: { background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 8, overflow: 'hidden' },
    rankingsHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 8px' },
    rankingsTitle: { fontSize: 11, fontWeight: 700, color: t.text1, textTransform: 'uppercase', letterSpacing: 0.5 },
    rankingsShow: { fontSize: 10, fontWeight: 600, color: t.blue, cursor: 'pointer' },
    topRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${t.border}`, cursor: 'pointer' },
    topMedal: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 },
    topInfo: { flex: 1, minWidth: 0 },
    topName: { fontSize: 13, fontWeight: 700, color: t.text1 },
    topNote: { fontSize: 10, color: t.text2, marginTop: 2, lineHeight: 1.4 },
    topBadge: { color: t.purple, fontWeight: 600 },
    topPct: { fontSize: 15, fontWeight: 700, flexShrink: 0 },
    rankDivider: { height: 1, background: t.border, margin: '2px 12px' },
    rankRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid transparent', borderTop: `1px solid ${t.border}`, cursor: 'pointer' },
    rankNum: { width: 24, height: 24, borderRadius: '50%', background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: t.text3, flexShrink: 0 },
    expandedPositions: { padding: '4px 12px 8px 48px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: `1px solid ${t.border}` },
    expandedChip: { display: 'flex', gap: 4, alignItems: 'center', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 8px' },
    raceCard: { background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 8, overflow: 'hidden' },
    raceCardHdr: { padding: '10px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    raceCardTitle: { fontSize: 11, fontWeight: 700, color: t.text1 },
    raceCardSub: { fontSize: 9, color: t.text3 },
    raceCardBody: { padding: '0 12px 10px' },
    learnCard: { background: t.card, borderRadius: 12, border: `1px solid ${t.purple}30`, marginBottom: 8, overflow: 'hidden' },
    learnCardHdr: { padding: '10px 12px 4px' },
    learnCardBody: { padding: '0 12px 10px' },
    skeleton: { height: 52, borderRadius: 12, marginBottom: 10, background: t.surface, animation: 'pulse 1.5s ease-in-out infinite' },
    smackWrap: { margin: 0, background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, overflow: 'hidden' },
    smackHdr: { fontSize: 10, color: t.text1, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, padding: '10px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    smackLive: { fontSize: 8, color: t.green, background: t.greenBg, padding: '2px 6px', borderRadius: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 },
    smackDot: { width: 5, height: 5, borderRadius: '50%', background: t.green },
    smackMsgs: { padding: '0 12px 6px', maxHeight: 150, overflowY: 'auto' },
    smackMsg: { padding: '6px 0', borderTop: `1px solid ${t.border}` },
    smackMsgTop: { display: 'flex', alignItems: 'flex-start', gap: 8 },
    smackAv: { width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 },
    rxnRow: { display: 'flex', gap: 4, marginTop: 5, marginLeft: 30 },
    rxnPill: { display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 12, cursor: 'pointer', border: `0.5px solid ${t.border}`, background: t.surface, fontSize: 11 },
    rxnLit: { background: t.greenBg, borderColor: t.green },
    rxnCt: { fontSize: 10, fontWeight: 600, color: t.text3 },
    rxnAdd: { padding: '2px 6px', borderRadius: 12, cursor: 'pointer', fontSize: 11, border: `0.5px dashed ${t.border}`, background: 'transparent', color: t.text3, display: 'flex', alignItems: 'center', gap: 2 },
    smackInput: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderTop: `1px solid ${t.border}`, background: t.surface },
    smackInputField: { flex: 1, background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: t.text1, fontFamily: 'var(--font)', outline: 'none' },
    smackSendBtn: { background: t.green, color: t.btnText, border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
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

  return (
    <div style={s.scroll}>
      <div style={{ padding: '8px 12px 80px' }}>

        {/* HEADER ROW */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🏆</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text1 }}>Portfolio Challenge</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: t.green, background: t.greenBg, padding: '2px 6px', borderRadius: 4 }}>S1</span>
            </div>
            <div style={{ fontSize: 10, color: t.text2, marginTop: 2, marginLeft: 24 }}>Trade with $50K fake money · learn together</div>
          </div>
        </div>

        {/* TOP BAR */}
        {trades.length === 0 ? (
          <div style={s.barNew}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
            <div style={s.barNewText}>
              <div style={s.barNewTitle}>Paper Trading Challenge</div>
              <div style={s.barNewSub}><b style={{ color: t.green }}>$50K fake money</b> · compete with your crew</div>
            </div>
            <div style={s.barNewBtn} onClick={() => setShowPortfolio(true)}>Join →</div>
          </div>
        ) : (
          <div style={s.barActive}>
            <div style={s.barRank}><span style={s.barRankText}>#{myRank || '-'}</span></div>
            <div style={s.barStats}>
              <div style={s.barStatsTop}>
                <span style={{ fontSize: 16, fontWeight: 700, color: isPositive ? t.green : t.red }}>{isPositive ? '+' : ''}{totalReturn.toFixed(1)}%</span>
                {userBadges.length > 0 && <span style={{ display: 'flex', gap: 2 }}>{userBadges.slice(0, 3).map(key => { const def = BADGE_DEFS[key]; return def ? <span key={key} style={{ fontSize: 12 }} title={def.label}>{def.emoji}</span> : null; })}</span>}
              </div>
              <div style={s.barStatsBottom}>
                {aheadUser ? <span>🎯 {aheadUser.gap}% behind {aheadUser.username}</span> : myRank !== null ? <span style={{ color: t.green }}>👑 In the lead!</span> : null}
                <span style={{ color: t.green, fontWeight: 600 }}>Cash ${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div style={{ ...s.barPortBtn, ...(showPortfolio ? s.barPortBtnOpen : {}) }} onClick={() => setShowPortfolio(p => !p)}>Portfolio {showPortfolio ? '▲' : '▼'}</div>
          </div>
        )}

        {/* PORTFOLIO DROPDOWN */}
        {showPortfolio && (
          <div style={s.portDrop}>
            <div style={s.portCash}>
              <div style={s.portCashItem}><div style={s.portCashLabel}>Total</div><div style={{ ...s.portCashVal, color: t.green }}>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
              <div style={{ ...s.portCashItem, borderLeft: `1px solid ${t.border}` }}><div style={s.portCashLabel}>Cash</div><div style={s.portCashVal}>${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
              <div style={{ ...s.portCashItem, borderLeft: `1px solid ${t.border}` }}><div style={s.portCashLabel}>Invested</div><div style={s.portCashVal}>${totalPositionsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
            </div>
            <div style={s.portSecLabel}>Positions · {trades.length}</div>
            {trades.length === 0 ? (
              <div style={{ fontSize: 11, color: t.text3, padding: '8px 12px' }}>No positions yet — add a ticker below</div>
            ) : trades.map(trade => {
              const curPrice = prices[trade.ticker] || Number(trade.entry_price);
              const entryPrice = Number(trade.entry_price);
              const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
              const isUp = pctGain >= 0;
              return (
                <div key={trade.id} style={s.portPos}>
                  <span style={s.portPosTk}>{trade.ticker}</span>
                  <span style={s.portPosInfo}>{Number(trade.shares).toFixed(1)} · avg ${entryPrice.toFixed(2)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? t.green : t.red, minWidth: 45, textAlign: 'right', marginRight: 6 }}>{isUp ? '+' : ''}{pctGain.toFixed(1)}%</span>
                  <div onClick={(e) => { e.stopPropagation(); setSellTrade({ ...trade, currentPrice: curPrice }); }} style={s.portPosSell}>Sell</div>
                </div>
              );
            })}
            <div style={s.portBuyRow}>
              <input style={s.portBuyInput} value={searchQuery} onChange={e => setSearchQuery(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="ADD TICKER" maxLength={5} />
              <button style={s.portBuyBtn} onClick={() => { if (searchResults.length > 0) handleSelectTicker(searchResults[0]); }}>Buy</button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ borderTop: `1px solid ${t.border}` }}>
                {searchResults.map(r => (
                  <div key={r.symbol} style={s.portSearchRow} onClick={() => handleSelectTicker(r)}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{r.symbol}</span>
                    <span style={{ fontSize: 10, color: t.text3, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</span>
                  </div>
                ))}
              </div>
            )}
            {searching && <div style={{ fontSize: 10, color: t.text3, padding: '6px 12px' }}>Searching...</div>}
            {showPresets && selectedTicker && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${t.border}`, background: t.surface }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div><b style={{ fontSize: 12, color: t.green }}>{selectedTicker.symbol}</b> <span style={{ fontSize: 10, color: t.green }}>${selectedTicker.price.toFixed(2)}</span></div>
                  <button style={{ background: 'none', border: 'none', fontSize: 14, color: t.green, cursor: 'pointer' }} onClick={clearSelection}>×</button>
                </div>
                {!showCustom ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1000, 5000, 10000].map(amt => (<button key={amt} style={s.presetBtnSm} onClick={() => executeBuy(amt)}>{buying ? '..' : `$${amt / 1000}K`}</button>))}
                    <button style={s.otherBtnSm} onClick={() => setShowCustom(true)}>Other</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={s.customWrapSm}><span style={{ fontSize: 12, fontWeight: 600, color: t.green }}>$</span><input style={s.customInputSm} type="number" inputMode="decimal" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="Amt" autoFocus /></div>
                    <button style={{ ...s.customBuySm, opacity: (parseFloat(customAmount) > 0 && !buying) ? 1 : 0.4 }} onClick={() => executeBuy(parseFloat(customAmount) || 0)} disabled={!(parseFloat(customAmount) > 0) || buying}>{buying ? '..' : 'Buy'}</button>
                  </div>
                )}
                {buyError && <div style={{ fontSize: 10, color: t.red, marginTop: 3 }}>{buyError}</div>}
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
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Win rate</div><div style={{ fontSize: 14, fontWeight: 700, color: winRate >= 50 ? t.green : t.red }}>{winRate}%</div></div>
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Avg hold</div><div style={{ fontSize: 14, fontWeight: 700, color: t.text1 }}>{avgHold.toFixed(1)}d</div></div>
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Total P&L</div><div style={{ fontSize: 14, fontWeight: 700, color: totalPL >= 0 ? t.green : t.red }}>{totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toFixed(0)}</div></div>
                    </div>
                  );
                })()}
                {closedTrades.map(trade => {
                  const entry = Number(trade.entry_price); const exit = Number(trade.exit_price);
                  const pl = (exit - entry) * Number(trade.shares); const pctReturn = ((exit - entry) / entry) * 100; const isWin = pl >= 0;
                  const holdMs = trade.sold_at && trade.bought_at ? new Date(trade.sold_at) - new Date(trade.bought_at) : 0;
                  const holdHours = holdMs / 3600000; const holdDisplay = holdHours < 24 ? `${Math.round(holdHours)}h` : `${Math.round(holdHours / 24)}d`;
                  const buyDate = trade.bought_at ? new Date(trade.bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (<div key={trade.id} style={{ padding: '6px 0', borderBottom: `1px solid ${t.border}` }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: t.text1 }}>{trade.ticker}</span><span style={{ fontSize: 10, color: t.text3 }}>{buyDate} · {holdDisplay}</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: isWin ? t.green : t.red }}>{isWin ? '+' : ''}{pctReturn.toFixed(1)}%</span></div></div>);
                })}
                {closedTrades.length === 0 && <div style={{ fontSize: 11, color: t.text3, textAlign: 'center', padding: '8px 0' }}>No closed trades yet</div>}
              </div>
            )}
          </div>
        )}

        {/* UNIFIED RANKINGS */}
        <div style={s.rankingsCard}>
          <div style={s.rankingsHdr}>
            <span style={s.rankingsTitle}>Season 1 Rankings</span>
            {leaderboard.length > 5 && (
              <span style={s.rankingsShow} onClick={() => setShowAllRankings(p => !p)}>
                {showAllRankings ? 'Show less ▲' : `Show all ${leaderboard.length} ▼`}
              </span>
            )}
          </div>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={{ ...s.skeleton, height: 40, margin: '0 12px 8px' }} />)
          ) : leaderboard.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: '20px 0' }}>No participants yet</div>
          ) : (
            <>
              {leaderboard.slice(0, 3).map((entry, idx) => {
                const medalBg = [t.medalGold, t.medalSilver, t.medalBronze][idx];
                const pctColor = [t.pctGold, t.pctSilver, t.pctBronze][idx];
                const isMe = entry.userId === session?.user?.id;
                const topStock = entry.positions?.[0];
                const note = topStock
                  ? `${topStock.ticker} ${topStock.pctGain >= 0 ? '+' : ''}${topStock.pctGain.toFixed(0)}% since buy`
                  : entry.openCount === 0 ? 'Watching from the sidelines' : `${entry.openCount} positions active`;
                return (
                  <div key={entry.userId} style={{ ...s.topRow, ...(isMe ? { background: `${t.green}08` } : {}) }}
                    onClick={() => setExpandedUser(expandedUser === entry.userId ? null : entry.userId)}>
                    <div style={{ ...s.topMedal, background: medalBg }}>{idx + 1}</div>
                    <div style={s.topInfo}>
                      <div style={s.topName}>{entry.username}{isMe ? ' ★' : ''}</div>
                      <div style={s.topNote}>{note}</div>
                    </div>
                    <div style={{ ...s.topPct, color: pctColor }}>{entry.pctReturn >= 0 ? '+' : ''}{entry.pctReturn.toFixed(1)}%</div>
                  </div>
                );
              })}
              {/* Expanded positions for any expanded user */}
              {leaderboard.map(entry => (
                expandedUser === entry.userId && entry.positions?.length > 0 ? (
                  <div key={`exp-${entry.userId}`} style={s.expandedPositions}>
                    {entry.positions.map((p, i) => (
                      <div key={i} style={s.expandedChip}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{p.ticker}</span>
                        <span style={{ fontSize: 10, color: p.pctGain >= 0 ? t.green : t.red }}>{p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null
              ))}
              {leaderboard.length > 3 && <div style={s.rankDivider} />}
              {leaderboard.slice(3, showAllRankings ? undefined : 5).map((entry, idx) => {
                const rank = idx + 4;
                const isMe = entry.userId === session?.user?.id;
                const isUp = entry.pctReturn >= 0;
                const isExpanded = expandedUser === entry.userId;
                const topStock = entry.positions?.[0];
                const note = entry.openCount === 0 ? 'Watching from the sidelines'
                  : topStock ? `${topStock.ticker} ${topStock.pctGain >= 0 ? 'up' : 'down'} ${Math.abs(topStock.pctGain).toFixed(0)}%`
                  : `${entry.openCount} positions active`;
                return (
                  <div key={entry.userId}>
                    <div style={{ ...s.rankRow, ...(isMe ? { border: `2px solid ${t.green}60` } : {}) }}
                      onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}>
                      <div style={s.rankNum}>{rank}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {entry.username}
                          {isMe && <span style={{ fontSize: 8, color: t.green, background: t.greenBg, padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>YOU</span>}
                        </div>
                        <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{note}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? t.green : t.red, flexShrink: 0 }}>{isUp ? '+' : ''}{entry.pctReturn.toFixed(1)}%</div>
                    </div>
                    {isExpanded && entry.positions?.length > 0 && (
                      <div style={s.expandedPositions}>
                        {entry.positions.map((p, i) => (
                          <div key={i} style={s.expandedChip}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{p.ticker}</span>
                            <span style={{ fontSize: 10, color: p.pctGain >= 0 ? t.green : t.red }}>{p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* TODAY'S RACE */}
        <div style={s.raceCard}>
          <div style={s.raceCardHdr}><span style={s.raceCardTitle}>🏁 Today's Race</span><span style={s.raceCardSub}>{daysLeft} days left</span></div>
          <div style={s.raceCardBody}>
            {(() => {
              const sorted = [...leaderboard].sort((a, b) => b.pctReturn - a.pctReturn);
              const best = sorted[0]; const worst = sorted[sorted.length - 1];
              if (!best) return <div style={{ fontSize: 11, color: t.text3 }}>Waiting for participants...</div>;
              return (<div style={{ fontSize: 11, color: t.text1, lineHeight: 1.6 }}>
                <span style={{ color: t.green, fontWeight: 600 }}>▲ {best.username} +{best.pctReturn.toFixed(1)}%</span>
                {best.positions?.[0] && <span style={{ color: t.text3 }}> — {best.positions[0].ticker}</span>}<br/>
                {worst && worst.userId !== best.userId && (<><span style={{ color: t.red, fontWeight: 600 }}>▼ {worst.username} {worst.pctReturn >= 0 ? '+' : ''}{worst.pctReturn.toFixed(1)}%</span>{worst.positions?.[0] && <span style={{ color: t.text3 }}> — {worst.positions[0].ticker}</span>}</>)}
              </div>);
            })()}
          </div>
        </div>

        {/* DAILY LEARN */}
        <div style={s.learnCard}>
          <div style={s.learnCardHdr}><span style={{ fontSize: 9, fontWeight: 700, color: t.purple }}>💡 LEARN</span></div>
          <div style={s.learnCardBody}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 3 }}>{trades.length === 0 ? 'What is a stock ticker?' : 'When to cut your losses'}</div>
            <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.6 }}>{trades.length === 0 ? "A short code for a company. AAPL = Apple, NVDA = Nvidia, TSLA = Tesla. Tap Join above to pick your first stock!" : "Most pros set a stop at 15-20%. If a stock drops that much from your buy price, consider whether your original thesis still holds."}</div>
          </div>
        </div>

        {/* SMACK TALK */}
        <div style={s.smackWrap}>
          <div style={s.smackHdr}><span>💬 Smack Talk</span><div style={s.smackLive}><div style={s.smackDot} /> LIVE</div></div>
          <div style={{ ...s.smackMsgs, maxHeight: 150 }}>
            {trashTalkMsgs.length === 0 ? (
              <div style={{ fontSize: 11, color: t.text3, padding: '8px 0' }}>No smack yet — be the first</div>
            ) : trashTalkMsgs.map((m) => {
              const lbEntry = leaderboard.find(e => e.userId === m.user_id);
              const rank = lbEntry ? leaderboard.indexOf(lbEntry) + 1 : null;
              const tier = lbEntry ? getTier(lbEntry.pctReturn) : null;
              const medalBg = rank === 1 ? t.medalGold : rank === 2 ? t.medalSilver : rank === 3 ? t.medalBronze : t.border;
              const rxns = chatReactions[m.id] || {};
              return (
                <div key={m.id} style={s.smackMsg}>
                  <div style={s.smackMsgTop}>
                    <div style={{ ...s.smackAv, background: medalBg, color: rank && rank <= 3 ? '#fff' : t.text3 }}>{(m.profiles?.username || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.text1 }}>{m.profiles?.username || 'Anon'}</span>
                        {tier && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: tier.bg, color: tier.color, fontWeight: 500 }}>{tier.short}</span>}
                        <span style={{ fontSize: 9, color: t.text3, marginLeft: 'auto' }}>{timeAgo(m.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: t.text1, lineHeight: 1.35, marginTop: 2 }}>{m.message}</div>
                    </div>
                  </div>
                  <div style={s.rxnRow}>
                    {REACTIONS.map(r => { const users = rxns[r.label] || []; const myReacted = users.includes(session?.user?.id); if (users.length === 0 && !myReacted) return null; return (<div key={r.label} style={{ ...s.rxnPill, ...(myReacted ? s.rxnLit : {}) }} onClick={() => toggleReaction(m.id, r.label)}><span style={{ fontSize: 12 }}>{r.emoji}</span><span style={{ ...s.rxnCt, ...(myReacted ? { color: t.green } : {}) }}>{users.length}</span></div>); })}
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

      {sellTrade && (
        <SellModal session={session} trade={sellTrade} onClose={() => setSellTrade(null)} onComplete={onSellComplete} />
      )}
    </div>
  );
}
