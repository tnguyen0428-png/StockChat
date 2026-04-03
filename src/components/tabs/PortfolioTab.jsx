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

export default function PortfolioTab({ session }) {
  const { profile } = useGroup();
  const [view, setView] = useState('portfolio');
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [sellTrade, setSellTrade] = useState(null);

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
  const [riskLevel, setRiskLevel] = useState({ level: 'Low', bars: 2, color: '#3B6D11', note: '' });

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
      supabase.from('paper_portfolios').select('*, profiles(username)'),
      supabase.from('paper_trades').select('*').eq('status', 'open'),
    ]);
    if (!allPortfolios) { setLbLoading(false); return; }

    allTradesRef.current = allTrades || [];

    const allTickers = [...new Set((allTrades || []).map(t => t.ticker))];
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
      const userTrades = (allTrades || []).filter(t => t.user_id === pf.user_id);
      const positionsValue = userTrades.reduce((sum, t) => {
        const curPrice = priceMap[t.ticker] || Number(t.entry_price);
        return sum + (Number(t.shares) * curPrice);
      }, 0);
      const totalValue = Number(pf.cash_balance) + positionsValue;
      const pctReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
      return {
        userId: pf.user_id,
        username: pf.profiles?.username || 'Unknown',
        totalValue,
        pctReturn,
        positions: userTrades.map(t => ({
          ticker: t.ticker,
          pctGain: priceMap[t.ticker]
            ? ((priceMap[t.ticker] - Number(t.entry_price)) / Number(t.entry_price)) * 100
            : 0,
        })),
        openCount: userTrades.length,
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
        else setRiskLevel({ level: 'Low', bars: 2, color: '#3B6D11', note: 'Well diversified' });
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

  // ── NEW: Trash talk ──
  const loadTrashTalk = useCallback(async () => {
    const { data } = await supabase
      .from('challenge_chat')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setTrashTalkMsgs(data.reverse());
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
  const seasonEnd = new Date('2025-06-30');
  const seasonStart = new Date('2025-04-01');
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
                    <span style={{ ...s.valSm, color: isPositive ? '#3B6D11' : '#E24B4A' }}>
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isPositive ? '#3B6D11' : '#E24B4A' }}>
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
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#3B6D11' }}>You're in the lead!</div>
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
                      <div><b style={{ fontSize: 12, color: '#1a4d0a' }}>{selectedTicker.symbol}</b> <span style={{ fontSize: 10, color: '#3B6D11' }}>${selectedTicker.price.toFixed(2)}</span></div>
                      <button style={{ background: 'none', border: 'none', fontSize: 14, color: '#3B6D11', cursor: 'pointer', lineHeight: 1 }} onClick={clearSelection}>×</button>
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
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#3B6D11' }}>$</span>
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
                      <div key={trade.id} style={s.posRowSm} onClick={() => setSellTrade({ ...trade, currentPrice: curPrice })}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)' }}>{trade.ticker}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? '#3B6D11' : '#E24B4A' }}>
                          {isUp ? '+' : ''}{pctGain.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', marginBottom: 6 }}>Badges earned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(BADGE_DEFS).map(([key, def]) => {
                    const earned = userBadges.includes(key);
                    return (
                      <div key={key} style={{ textAlign: 'center' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: earned ? def.bg : 'transparent',
                          border: earned ? `2px solid ${def.border}` : '2px dashed var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: earned ? def.color : 'var(--text3)',
                        }}>
                          {earned ? def.label[0] : '?'}
                        </div>
                        <div style={{ fontSize: 8, color: earned ? def.color : 'var(--text3)', marginTop: 2 }}>
                          {earned ? def.label : 'Locked'}
                        </div>
                      </div>
                    );
                  })}
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
                <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 2 }}>$50k cash · ranked by % return</div>
                <div style={{ height: 3, background: '#C0DD97', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: 3, background: '#3B6D11', borderRadius: 2, width: `${seasonProgress}%`, transition: 'width 0.3s' }} />
                </div>
              </div>

            </div>
          </div>
        </>
      ) : (

        /* ── LEADERBOARD VIEW (full width, unchanged) ── */
        <div style={s.section}>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={s.skeleton} />)
          ) : leaderboard.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>No participants yet.</div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.userId === session?.user?.id;
              const isUp = entry.pctReturn >= 0;
              const isExpanded = expandedUser === entry.userId;
              return (
                <div key={entry.userId}>
                  <div
                    style={{ ...s.lbRow, background: isMe ? 'rgba(59,109,17,0.08)' : 'transparent' }}
                    onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}
                  >
                    <div style={s.lbRank}>#{idx + 1}</div>
                    <div style={s.lbName}>
                      {entry.username}
                      {isMe && <span style={s.lbYou}> (you)</span>}
                    </div>
                    <div style={{ ...s.lbReturn, color: isUp ? '#3B6D11' : '#E24B4A' }}>
                      {isUp ? '+' : ''}{entry.pctReturn.toFixed(2)}%
                    </div>
                    <div style={s.lbCount}>{entry.openCount} pos</div>
                  </div>
                  {isExpanded && entry.positions.length > 0 && (
                    <div style={s.lbExpanded}>
                      {entry.positions.map((p, i) => (
                        <div key={i} style={s.lbTicker}>
                          <span style={s.lbTickerName}>{p.ticker}</span>
                          <span style={{ color: p.pctGain >= 0 ? '#3B6D11' : '#E24B4A', fontSize: 12 }}>
                            {p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
    background: '#1c2a1c', overflow: 'hidden', height: 22,
    display: 'flex', alignItems: 'center', marginTop: 8,
  },
  tapeInner: {
    display: 'flex', whiteSpace: 'nowrap',
    animation: 'tickerScroll 30s linear infinite',
  },
  tapeText: { fontSize: 10, color: '#8bc34a', fontFamily: 'var(--font)', paddingRight: 40 },

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
    background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 6,
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
    border: '1px solid #3B6D11', background: 'transparent',
    fontSize: 11, fontWeight: 600, color: '#3B6D11',
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
    background: '#fff', border: '1px solid #3B6D11', borderRadius: 5, padding: '0 6px',
  },
  customInputSm: {
    flex: 1, border: 'none', background: 'transparent', padding: '6px 0',
    fontSize: 12, fontWeight: 600, color: '#1a4d0a', outline: 'none', fontFamily: 'var(--font)',
  },
  customBuySm: {
    background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 5,
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
};
