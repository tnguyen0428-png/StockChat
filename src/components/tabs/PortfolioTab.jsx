// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Portfolio Challenge: Split-panel layout
// Left: portfolio + buy | Right: game cards
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import SellModal from '../portfolio/SellModal';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;
const STARTING_CASH = 50000;

const BADGE_DEFS = {
  champion: { label: 'Champion', bg: '#FAEEDA', border: '#BA7517', color: '#854F0B' },
  expert:   { label: 'Expert',   bg: '#E6F1FB', border: '#378ADD', color: '#0C447C' },
  newbie:   { label: 'Newbie',   bg: '#EAF3DE', border: '#639922', color: '#27500A' },
  diamond:  { label: 'Diamond',  bg: '#EEEDFE', border: '#7F77DD', color: '#3C3489' },
  streak:   { label: 'Streak',   bg: '#E1F5EE', border: '#1D9E75', color: '#085041' },
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
    return holdHours < 48 && Number(t.sold_price) < Number(t.entry_price);
  });
  if (paperHands) badges.push({ type: 'paper_hands', label: 'PAPER HANDS', bg: 'rgba(212,160,23,0.2)', color: '#FAC775' });

  const openTrades = allTrades.filter(t => t.user_id === userId && t.status === 'open');
  const diamond = openTrades.some(t => {
    if (!t.bought_at) return false;
    return (Date.now() - new Date(t.bought_at).getTime()) > 30 * 86400000;
  });
  if (diamond) badges.push({ type: 'diamond_hands', label: 'DIAMOND', bg: 'rgba(29,158,117,0.2)', color: '#5DCAA5' });

  const lastThree = userTrades.sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at)).slice(0, 3);
  if (lastThree.length >= 3 && lastThree.every(t => Number(t.sold_price) > Number(t.entry_price))) {
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
    await supabase.rpc('ensure_paper_portfolio');
    const [{ data: pf }, { data: openTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*').eq('user_id', session.user.id).single(),
      supabase.from('paper_trades').select('*').eq('user_id', session.user.id).eq('status', 'open'),
    ]);
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
      const res = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=${tickers}&apikey=${FMP_KEY}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const map = {};
        data.forEach(q => { map[q.symbol] = q.price; });
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
        const res = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=${allTickers.join(',')}&apikey=${FMP_KEY}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(q => { priceMap[q.symbol] = q.price; });
          setPrices(prev => ({ ...prev, ...priceMap }));
        }
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
      const { error: insertErr } = await supabase.from('paper_trades').insert({
        user_id: session.user.id,
        ticker: selectedTicker.symbol,
        shares,
        dollar_amount: dollarAmount,
        entry_price: selectedTicker.price,
        status: 'open',
        bought_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
      const { error: updateErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: cashBalance - dollarAmount })
        .eq('user_id', session.user.id);
      if (updateErr) throw updateErr;
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
    if (!trashTalkInput.trim() || !session?.user?.id) return;
    await supabase.from('challenge_chat').insert({
      user_id: session.user.id,
      message: trashTalkInput.trim(),
    });
    setTrashTalkInput('');
    document.activeElement?.blur();
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

  // ── Calculations ──
  const totalPositionsValue = trades.reduce((sum, t) => {
    const curPrice = prices[t.ticker] || Number(t.entry_price);
    return sum + (Number(t.shares) * curPrice);
  }, 0);
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

  // Ticker tape text
  const tapeText = activity.length > 0
    ? activity.map(a => {
        const who = a.profiles?.username || 'Someone';
        const verb = a.status === 'closed' ? 'sold' : 'bought';
        const amt = a.dollar_amount ? ` $${(Number(a.dollar_amount) / 1000).toFixed(0)}k` : '';
        return `${who} ${verb} ${a.ticker}${amt}`;
      }).join(' · ')
    : 'No recent activity';

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
        <>
          {/* ZONE 2: Live ticker tape */}
          <div style={s.tape}>
            <div style={s.tapeInner}>
              <span style={s.tapeText}>{tapeText} · {tapeText} · </span>
            </div>
          </div>

          {/* ZONE 3: Split panel */}
          <div style={s.splitWrap}>

            {/* ── LEFT COLUMN ── */}
            <div style={s.leftCol}>

              {/* Rank + value */}
              <div style={s.heroCompact}>
                <div style={s.rankSm}>
                  <span style={s.rankSmText}>#{myRank || '-'}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ ...s.valSm, color: isPositive ? '#2a7d4b' : '#E24B4A' }}>
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isPositive ? '#2a7d4b' : '#E24B4A' }}>
                      {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                    Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    {lastUpdated && <> · {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div style={s.chartSm}>
                <svg width="100%" height="36" viewBox="0 0 300 36" preserveAspectRatio="none" style={{ opacity: 0.15 }}>
                  <polyline points="0,32 20,29 40,25 60,27 80,20 100,23 120,16 140,18 160,12 180,14 200,9 220,11 240,7 260,9 280,5 300,3"
                    fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>

              {/* Catch-the-leader */}
              {myRank !== null && (
                <div style={s.leaderBarSm}>
                  {aheadUser ? (
                    <>
                      <div style={{ fontSize: 10, color: '#633806' }}>
                        <b>{aheadUser.gap}%</b> behind <b>{aheadUser.username}</b>
                      </div>
                      <div style={s.leaderTrackSm}>
                        <div style={{ ...s.leaderFillSm, width: `${Math.max(5, aheadUser.progress)}%` }} />
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#2a7d4b' }}>You're in the lead!</div>
                  )}
                </div>
              )}

              {/* Add ticker */}
              <div style={s.addSm}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    style={s.addInputSm}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    placeholder="ADD TICKER"
                    maxLength={5}
                  />
                  <button style={s.addBtnSm} onClick={() => { if (searchResults.length > 0) handleSelectTicker(searchResults[0]); }}>Add</button>
                </div>

                {searchResults.length > 0 && (
                  <div style={s.dropdownSm}>
                    {searchResults.map(r => (
                      <div key={r.symbol} style={s.dropRowSm} onClick={() => handleSelectTicker(r)}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)' }}>{r.symbol}</span>
                        <span style={{ fontSize: 10, color: 'var(--text3)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {searching && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Searching...</div>}

                {showPresets && selectedTicker && (
                  <div style={s.presetSm}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div><b style={{ fontSize: 12, color: '#1a4d0a' }}>{selectedTicker.symbol}</b> <span style={{ fontSize: 10, color: '#2a7d4b' }}>${selectedTicker.price.toFixed(2)}</span></div>
                      <button style={{ background: 'none', border: 'none', fontSize: 14, color: '#2a7d4b', cursor: 'pointer', lineHeight: 1 }} onClick={clearSelection}>×</button>
                    </div>
                    {!showCustom ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1000, 5000, 10000].map(amt => (
                          <button key={amt} style={s.presetBtnSm} onClick={() => executeBuy(amt)}>
                            {buying ? '..' : `$${amt / 1000}K`}
                          </button>
                        ))}
                        <button style={s.otherBtnSm} onClick={() => setShowCustom(true)}>Other</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <div style={s.customWrapSm}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#2a7d4b' }}>$</span>
                          <input
                            style={s.customInputSm}
                            type="number"
                            inputMode="decimal"
                            value={customAmount}
                            onChange={e => setCustomAmount(e.target.value)}
                            placeholder="Amt"
                            autoFocus
                          />
                        </div>
                        <button
                          style={{ ...s.customBuySm, opacity: (parseFloat(customAmount) > 0 && !buying) ? 1 : 0.4 }}
                          onClick={() => executeBuy(parseFloat(customAmount) || 0)}
                          disabled={!(parseFloat(customAmount) > 0) || buying}
                        >{buying ? '..' : 'Buy'}</button>
                      </div>
                    )}
                    {buyError && <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 3 }}>{buyError}</div>}
                  </div>
                )}
                {buyError && !showPresets && <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 3 }}>{buyError}</div>}
              </div>

              {/* Positions */}
              <div style={{ padding: '6px 0 0' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                  Positions · {trades.length}
                </div>
                {trades.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text3)', padding: '8px 0' }}>No positions yet</div>
                ) : (
                  trades.map(trade => {
                    const curPrice = prices[trade.ticker] || Number(trade.entry_price);
                    const entryPrice = Number(trade.entry_price);
                    const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
                    const isUp = pctGain >= 0;
                    return (
                      <div key={trade.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 6px', background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 4, gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{trade.ticker}</span>
                            <span style={{ fontSize: 13, color: 'var(--text3)' }}>{Number(trade.shares).toFixed(1)} shares</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <span style={{ fontSize: 13, color: 'var(--text3)' }}>${Number(trade.entry_price).toFixed(2)}</span>
                            <span style={{ fontSize: 13, color: 'var(--text3)' }}>→</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>${curPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginRight: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? '#2a7d4b' : '#E24B4A' }}>
                            {isUp ? '+' : '-'}${Math.abs(Number(trade.shares) * (curPrice - entryPrice)).toFixed(2)}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isUp ? '#2a7d4b' : '#E24B4A' }}>
                            {isUp ? '+' : ''}{pctGain.toFixed(1)}%
                          </div>
                        </div>
                        <div
                          onClick={(e) => { e.stopPropagation(); setSellTrade({ ...trade, currentPrice: curPrice }); }}
                          style={{ background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', color: '#E24B4A', fontSize: 13, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                        >Sell</div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>

              <div
                onClick={() => setShowHistory(!showHistory)}
                style={{ fontSize: 13, fontWeight: 600, color: '#4A90D9', cursor: 'pointer', padding: '6px 0', textAlign: 'center', marginTop: 4 }}
              >
                {showHistory ? 'Hide History' : `Trade History (${closedTrades.length})`}
              </div>

              {showHistory && (
                <div style={{ marginTop: 6 }}>
                  {closedTrades.length > 0 && (() => {
                    const wins = closedTrades.filter(t => Number(t.sold_price) > Number(t.entry_price)).length;
                    const totalPL = closedTrades.reduce((sum, t) => {
                      return sum + (Number(t.sold_price) - Number(t.entry_price)) * Number(t.shares);
                    }, 0);
                    const avgHold = closedTrades.reduce((sum, t) => {
                      if (!t.sold_at || !t.bought_at) return sum;
                      return sum + (new Date(t.sold_at) - new Date(t.bought_at)) / 86400000;
                    }, 0) / closedTrades.length;
                    const winRate = Math.round((wins / closedTrades.length) * 100);
                    return (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Win rate</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: winRate >= 50 ? '#2a7d4b' : '#E24B4A' }}>{winRate}%</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Avg hold</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{avgHold.toFixed(1)}d</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total P&L</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: totalPL >= 0 ? '#2a7d4b' : '#E24B4A' }}>
                            {totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toFixed(0)}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {closedTrades.map(trade => {
                    const entry = Number(trade.entry_price);
                    const exit = Number(trade.sold_price);
                    const shares = Number(trade.shares);
                    const pl = (exit - entry) * shares;
                    const pctReturn = ((exit - entry) / entry) * 100;
                    const isWin = pl >= 0;
                    const holdMs = trade.sold_at && trade.bought_at ? new Date(trade.sold_at) - new Date(trade.bought_at) : 0;
                    const holdHours = holdMs / 3600000;
                    const holdDisplay = holdHours < 24 ? `${Math.round(holdHours)}h hold` : `${Math.round(holdHours / 24)}d hold`;
                    const isDayTrade = holdHours < 24;
                    const isPaperHands = !isWin && holdHours < 48;
                    const isDiamondHands = holdHours >= 720;
                    const buyDate = trade.bought_at ? new Date(trade.bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                    return (
                      <div key={trade.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{trade.ticker}</span>
                          {isDayTrade && <span style={{ fontSize: 11, fontWeight: 600, color: '#791F1F', background: 'rgba(224,82,82,0.1)', padding: '1px 6px', borderRadius: 3 }}>Day traitor</span>}
                          {isDiamondHands && <span style={{ fontSize: 11, fontWeight: 600, color: '#085041', background: 'rgba(29,158,117,0.1)', padding: '1px 6px', borderRadius: 3 }}>Diamond hands</span>}
                          {isPaperHands && !isDayTrade && <span style={{ fontSize: 11, fontWeight: 600, color: '#854F0B', background: 'rgba(212,160,23,0.1)', padding: '1px 6px', borderRadius: 3 }}>Paper hands</span>}
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: isWin ? '#2a7d4b' : '#E24B4A' }}>
                            {isWin ? '+' : '-'}${Math.abs(pl).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }}>
                          <span>{buyDate}</span>
                          <span>·</span>
                          <span>{holdDisplay}</span>
                          <span>·</span>
                          <span style={{ color: isWin ? '#2a7d4b' : '#E24B4A', fontWeight: 600 }}>
                            {isWin ? '+' : ''}{pctReturn.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {closedTrades.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No closed trades yet</div>
                  )}
                </div>
              )}
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={s.rightCol}>

              {/* Card 1: Hot in the group */}
              <div style={s.cardAmber}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#633806', marginBottom: 4 }}>Hot in the group</div>
                {hotTickers.length === 0 ? (
                  <div style={{ fontSize: 10, color: '#854F0B' }}>No activity yet</div>
                ) : (
                  hotTickers.map((h, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#854F0B', padding: '2px 0' }}>
                      <b>{h.ticker}</b> — {h.bought > 0 ? `${h.bought} bought` : ''}{h.bought > 0 && h.sold > 0 ? ', ' : ''}{h.sold > 0 ? `${h.sold} sold` : ''}
                    </div>
                  ))
                )}
              </div>

              {/* Card 2: Sector heat map */}
              <div style={s.cardDefault}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', marginBottom: 4 }}>Sector heat map</div>
                {sectorData.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>Loading...</div>
                ) : (
                  sectorData.map((sec, i) => {
                    const sc = sectorColor(sec.avgChange);
                    return (
                      <div key={i} style={{ ...s.sectorRow, background: sc.bg }}>
                        <span style={{ fontSize: 9, color: sc.color, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sec.name}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: sc.color }}>{sec.avgChange >= 0 ? '+' : ''}{sec.avgChange.toFixed(1)}%</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Card 3: Badges */}
              <div style={s.cardDefault}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', marginBottom: 6 }}>Badges</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(() => {
                    const earnedEntries = Object.entries(BADGE_DEFS).filter(([key]) => userBadges.includes(key));
                    const lockedCount = Object.keys(BADGE_DEFS).filter(key => !userBadges.includes(key)).length;
                    const pillStyle = (bg, border, color) => ({
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 10,
                      fontSize: 8, fontWeight: 700,
                      background: bg, border: `1px solid ${border}`, color,
                    });
                    return (
                      <>
                        {earnedEntries.map(([key, def]) => (
                          <span key={key} style={pillStyle(def.bg, def.border, def.color)}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: def.border, flexShrink: 0 }} />
                            {def.label}
                          </span>
                        ))}
                        {lockedCount > 0 && (
                          <span style={pillStyle('transparent', 'var(--border)', 'var(--text3)')}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                            {lockedCount} locked
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Card 4: Risk meter */}
              <div style={s.cardBorder}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)' }}>Risk meter</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: riskLevel.color }}>{riskLevel.level}</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i <= riskLevel.bars ? riskLevel.color : '#EDD9A3',
                    }} />
                  ))}
                </div>
                {riskLevel.note && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>{riskLevel.note}</div>}
              </div>

              {/* Card 5: Trash talk */}
              <div style={s.cardPurple}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#3C3489', marginBottom: 4 }}>Trash talk</div>
                {trashTalkMsgs.length === 0 ? (
                  <div style={{ fontSize: 10, color: '#534AB7' }}>No smack yet...</div>
                ) : (
                  trashTalkMsgs.map((m, i) => (
                    <div key={m.id || i} style={{ fontSize: 10, color: '#534AB7', padding: '1px 0' }}>
                      <b>{m.profiles?.username || 'Anon'}</b>: {m.message}
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <input
                    style={s.ttInput}
                    value={trashTalkInput}
                    onChange={e => setTrashTalkInput(e.target.value.slice(0, 200))}
                    placeholder="Talk smack..."
                    onKeyDown={e => e.key === 'Enter' && sendTrashTalk()}
                  />
                  <button style={s.ttSend} onClick={sendTrashTalk}>Send</button>
                </div>
              </div>

              {/* Card 6: Season countdown */}
              <div style={s.cardGreen}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#27500A' }}>Season 1 · {daysLeft} days left</div>
                <div style={{ fontSize: 10, color: '#2a7d4b', marginTop: 2 }}>$50k cash · ranked by % return</div>
                <div style={{ height: 3, background: '#C0DD97', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: 3, background: '#2a7d4b', borderRadius: 2, width: `${seasonProgress}%`, transition: 'width 0.3s' }} />
                </div>
              </div>

            </div>
          </div>
        </>
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

  // Ticker tape
  tape: {
    background: '#0f2440', overflow: 'hidden', height: 22,
    display: 'flex', alignItems: 'center', marginTop: 8,
  },
  tapeInner: {
    display: 'flex', whiteSpace: 'nowrap',
    animation: 'tickerScroll 30s linear infinite',
  },
  tapeText: { fontSize: 10, color: '#8cd9a0', fontFamily: 'var(--font)', paddingRight: 40 },

  // Split layout
  splitWrap: { display: 'flex', minHeight: 0 },
  leftCol: { flex: '0 0 54%', borderRight: '0.5px solid var(--border)', padding: '10px 8px 10px 12px', position: 'relative' },
  rightCol: { flex: '0 0 46%', padding: '10px 12px 10px 8px', display: 'flex', flexDirection: 'column', gap: 7 },

  // Left: compact hero
  heroCompact: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  rankSm: {
    width: 36, height: 36, borderRadius: '50%', background: '#EAF3DE',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankSmText: { fontSize: 14, fontWeight: 800, color: '#27500A' },
  valSm: { fontSize: 17, fontWeight: 700 },

  // Left: chart
  chartSm: {
    height: 36, borderRadius: 6, background: 'var(--card)',
    border: '1px dashed var(--border)', overflow: 'hidden', marginBottom: 6,
  },

  // Left: catch-the-leader
  leaderBarSm: { padding: '5px 8px', background: '#FAEEDA', borderRadius: 6, marginBottom: 6 },
  leaderTrackSm: { height: 3, background: '#EDD9A3', borderRadius: 2, marginTop: 4 },
  leaderFillSm: { height: 3, background: '#BA7517', borderRadius: 2, transition: 'width 0.3s' },

  // Left: add ticker
  addSm: { marginBottom: 6, position: 'relative' },
  addInputSm: {
    flex: 1, background: 'var(--card2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 8px', fontSize: 11, fontWeight: 600,
    color: 'var(--text1)', fontFamily: 'var(--font)', outline: 'none',
    letterSpacing: 0.4, width: '100%', boxSizing: 'border-box',
  },
  addBtnSm: {
    background: '#2a7d4b', color: '#fff', border: 'none', borderRadius: 6,
    padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', flexShrink: 0,
  },
  dropdownSm: {
    position: 'absolute', left: 0, right: 0, top: 34, zIndex: 50,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden',
  },
  dropRowSm: {
    padding: '8px 8px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center',
  },

  // Left: presets
  presetSm: {
    marginTop: 5, padding: '8px 8px', background: '#EAF3DE',
    borderRadius: 6, border: '1px solid rgba(59,109,17,0.2)',
  },
  presetBtnSm: {
    flex: 1, padding: '6px 0', borderRadius: 5,
    border: '1px solid #2a7d4b', background: 'transparent',
    fontSize: 11, fontWeight: 600, color: '#2a7d4b',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  otherBtnSm: {
    flex: 1, padding: '6px 0', borderRadius: 5,
    border: '1px solid var(--border)', background: 'transparent',
    fontSize: 11, fontWeight: 600, color: 'var(--text2)',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  customWrapSm: {
    flex: 1, display: 'flex', alignItems: 'center',
    background: '#fff', border: '1px solid #2a7d4b', borderRadius: 5, padding: '0 6px',
  },
  customInputSm: {
    flex: 1, border: 'none', background: 'transparent', padding: '6px 0',
    fontSize: 12, fontWeight: 600, color: '#1a4d0a', outline: 'none', fontFamily: 'var(--font)',
  },
  customBuySm: {
    background: '#2a7d4b', color: '#fff', border: 'none', borderRadius: 5,
    padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },

  // Left: positions
  posRowSm: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 6px', background: 'var(--card)', borderRadius: 6,
    border: '1px solid var(--border)', marginBottom: 3, cursor: 'pointer',
  },

  // Right: card variants
  cardAmber: { padding: 8, borderRadius: 7, background: '#FAEEDA' },
  cardDefault: { padding: 8, borderRadius: 7, background: 'var(--card2)' },
  cardBorder: { padding: 8, borderRadius: 7, border: '0.5px solid var(--border)' },
  cardPurple: { padding: 8, borderRadius: 7, background: '#EEEDFE' },
  cardGreen: { padding: 8, borderRadius: 7, background: '#EAF3DE' },

  // Right: sector row
  sectorRow: { height: 13, borderRadius: 3, padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },

  // Right: trash talk
  ttInput: {
    flex: 1, background: 'rgba(255,255,255,0.5)', border: '1px solid #CECBF6',
    borderRadius: 5, padding: '5px 8px', fontSize: 9, color: '#3C3489',
    fontFamily: 'var(--font)', outline: 'none',
  },
  ttSend: {
    background: '#534AB7', color: '#fff', border: 'none', borderRadius: 5,
    padding: '5px 10px', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },

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
