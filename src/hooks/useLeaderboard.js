import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { FMP_KEY, STARTING_CASH } from '../lib/constants';

export const BADGE_DEFS = {
  champion: { label: 'Champion', emoji: '👑', bg: '#FAEEDA', border: '#BA7517', color: '#854F0B' },
  expert:   { label: 'Expert',   emoji: '🎯', bg: '#E6F1FB', border: '#378ADD', color: '#0C447C' },
  newbie:   { label: 'Newbie',   emoji: '🌱', bg: '#EAF3DE', border: '#639922', color: '#27500A' },
  diamond:  { label: 'Diamond',  emoji: '💎', bg: '#EEEDFE', border: '#7F77DD', color: '#3C3489' },
  streak:   { label: 'Streak',   emoji: '🔥', bg: '#E1F5EE', border: '#1D9E75', color: '#085041' },
};

export const TIER_DEFS = [
  { min: 15,       label: 'LEGEND',       short: 'LEG',  bg: 'rgba(255,215,0,0.15)',   color: '#b8960e' },
  { min: 10,       label: 'WALL ST WOLF', short: 'WOLF', bg: 'rgba(255,215,0,0.2)',    color: '#FFD700' },
  { min: 5,        label: 'MARKET SHARK', short: 'SHARK',bg: 'rgba(140,160,220,0.2)',  color: '#7B8CDE' },
  { min: 0,        label: 'RISING STAR',  short: 'STAR', bg: 'rgba(205,127,50,0.2)',   color: '#CD7F32' },
  { min: -Infinity,label: 'ROOKIE',       short: 'ROOK', bg: 'rgba(122,142,163,0.15)', color: '#7a8ea3' },
];

export const getTier = (pctReturn) =>
  TIER_DEFS.find(t => pctReturn >= t.min) || TIER_DEFS[TIER_DEFS.length - 1];

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

// Hook takes (session, trades, prices) from usePortfolio
export function useLeaderboard(session, trades, prices) {
  const [leaderboard, setLeaderboard]   = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [lbLoading, setLbLoading]       = useState(false);
  const [myRank, setMyRank]             = useState(null);
  const [aheadUser, setAheadUser]       = useState(null);
  const [activity, setActivity]         = useState([]);
  const [hotTickers, setHotTickers]     = useState([]);
  const [sectorData, setSectorData]     = useState([]);
  const [userBadges, setUserBadges]     = useState([]);
  const [riskLevel, setRiskLevel]       = useState({ level: 'Low', bars: 2, color: '#2a7d4b', note: '' });
  const [myTotalTrades, setMyTotalTrades] = useState(0);
  const [myWinRate, setMyWinRate]       = useState({ wins: 0, total: 0, pct: 0 });
  const [myBestPick, setMyBestPick]     = useState(null);

  const allTradesRef = useRef([]);
  // Refs to always hold the latest trades/prices without stale closure issues
  const tradesRef = useRef(trades);
  const pricesRef = useRef(prices);
  useEffect(() => { tradesRef.current = trades; }, [trades]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);

  // ── Leaderboard ──
  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    const [{ data: allPortfolios, error: pfErr }, { data: allTrades, error: trErr }] = await Promise.all([
      supabase.from('paper_portfolios').select('*, profiles(username)').limit(100),
      supabase.from('paper_trades').select('*').limit(1000),
    ]);
    if (pfErr) console.error('[Leaderboard] loadLeaderboard portfolios failed:', pfErr.message);
    if (trErr) console.error('[Leaderboard] loadLeaderboard trades failed:', trErr.message);
    if (!allPortfolios) { setLbLoading(false); return; }

    const openTrades = (allTrades || []).filter(t => t.status === 'open');
    allTradesRef.current = openTrades;

    // Fetch fresh prices for all open positions (leaderboard-only price map)
    const allTickers = [...new Set(openTrades.map(t => t.ticker))];
    const lbPrices = {};
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
                lbPrices[data[0].symbol] = data[0].price;
              }
            } catch (err) {
              console.error('[Leaderboard] price fetch failed:', sym, err.message);
            }
          }));
          if (i + 6 < allTickers.length) await new Promise(r => setTimeout(r, 250));
        }
      } catch (err) {
        console.error('[Leaderboard] batch price fetch failed:', err.message);
      }
    }

    const entries = allPortfolios.map(pf => {
      const userOpenTrades = openTrades.filter(t => t.user_id === pf.user_id);
      const positionsValue = userOpenTrades.reduce((sum, t) => {
        const curPrice = lbPrices[t.ticker] || Number(t.entry_price);
        return sum + (Number(t.shares) * curPrice);
      }, 0);
      const totalValue  = Number(pf.cash_balance) + positionsValue;
      const pctReturn   = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
      const behaviorBadges = detectBehaviorBadges(pf.user_id, allTrades || []);
      return {
        userId: pf.user_id,
        username: pf.profiles?.username || 'Unknown',
        totalValue,
        pctReturn,
        positions: userOpenTrades.map(t => ({
          ticker: t.ticker,
          pctGain: lbPrices[t.ticker]
            ? ((lbPrices[t.ticker] - Number(t.entry_price)) / Number(t.entry_price)) * 100
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
    const { data, error } = await supabase
      .from('paper_trades')
      .select('*, profiles(username)')
      .order('bought_at', { ascending: false })
      .limit(5);
    if (error) console.error('[Leaderboard] loadActivity failed:', error.message);
    if (data) setActivity(data);
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  useEffect(() => {
    const channel = supabase
      .channel('portfolio_activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'paper_trades' }, () => loadActivity())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadActivity]);

  // ── Hot tickers ──
  const loadHotTickers = useCallback(async () => {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data, error } = await supabase
      .from('paper_trades')
      .select('ticker, status')
      .gt('bought_at', since);
    if (error) console.error('[Leaderboard] loadHotTickers failed:', error.message);
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

  // ── Sector heat map ──
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

      // Calculate risk from user's positions (use latest trades/prices via refs)
      const currentTrades = tradesRef.current;
      const currentPrices = pricesRef.current;
      const myTickers = currentTrades.map(t => t.ticker);
      const myPositionSectors = {};
      data.forEach(d => {
        if (myTickers.includes(d.symbol) && d.sector) {
          const val = currentTrades
            .filter(t => t.ticker === d.symbol)
            .reduce((sum, t) => sum + Number(t.shares) * (currentPrices[t.ticker] || Number(t.entry_price)), 0);
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
    } catch (err) {
      console.error('[Leaderboard] loadSectorData failed:', err.message);
    }
  }, []);

  useEffect(() => {
    if (allTradesRef.current.length > 0) loadSectorData();
  }, [leaderboard]);

  // ── Badges ──
  const loadBadges = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: badges, error: badgeErr } = await supabase
      .from('portfolio_badges')
      .select('badge_type')
      .eq('user_id', session.user.id);
    if (badgeErr) console.error('[Leaderboard] loadBadges fetch failed:', badgeErr.message);
    const earned = (badges || []).map(b => b.badge_type);
    setUserBadges(earned);

    // Auto-award
    const { count: totalTrades, error: countErr } = await supabase
      .from('paper_trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id);
    if (countErr) console.error('[Leaderboard] trade count failed:', countErr.message);

    const awards = [];
    if (totalTrades >= 1 && !earned.includes('newbie')) awards.push('newbie');
    if (totalTrades >= 10 && !earned.includes('expert')) awards.push('expert');

    for (const badge of awards) {
      try {
        await supabase.from('portfolio_badges').insert({ user_id: session.user.id, badge_type: badge });
      } catch (err) {
        console.error('[Leaderboard] badge insert failed (unique constraint ok):', err.message);
      }
    }
    if (awards.length > 0) setUserBadges(prev => [...prev, ...awards]);
  }, [session?.user?.id]);

  useEffect(() => { loadBadges(); }, [loadBadges]);

  // Award champion badge after leaderboard loads
  useEffect(() => {
    if (myRank === 1 && !userBadges.includes('champion') && session?.user?.id) {
      supabase.from('portfolio_badges').insert({ user_id: session.user.id, badge_type: 'champion' })
        .then(() => setUserBadges(prev => [...prev, 'champion']))
        .catch(err => console.error('[Leaderboard] champion badge insert failed:', err.message));
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
      const pctGain  = ((curPrice - Number(t.entry_price)) / Number(t.entry_price)) * 100;
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
      const { count, error } = await supabase
        .from('paper_trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      if (error) console.error('[Leaderboard] myStats trade count failed:', error.message);
      if (!cancelled) setMyTotalTrades(count || 0);
    })();
    return () => { cancelled = true; };
  }, [trades, prices, session?.user?.id]);

  return {
    leaderboard, expandedUser, setExpandedUser,
    lbLoading, myRank, aheadUser,
    activity, hotTickers, sectorData,
    userBadges, riskLevel,
    myTotalTrades, myWinRate, myBestPick,
    loadLeaderboard, loadActivity, loadHotTickers, loadSectorData, loadBadges,
  };
}
