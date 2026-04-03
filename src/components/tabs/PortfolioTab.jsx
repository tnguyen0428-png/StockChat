// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Portfolio Challenge: A+C combo design
// Rank + chart + catch-the-leader + inline buy + activity feed
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import SellModal from '../portfolio/SellModal';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;
const STARTING_CASH = 50000;

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
  const [selectedTicker, setSelectedTicker] = useState(null); // { symbol, name, price }
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
  const [aheadUser, setAheadUser] = useState(null); // { username, pctReturn, gap }

  // Activity feed
  const [activity, setActivity] = useState([]);

  const refreshRef = useRef(null);

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

    // Find my rank + person ahead
    const myIdx = entries.findIndex(e => e.userId === session?.user?.id);
    if (myIdx >= 0) {
      setMyRank(myIdx + 1);
      if (myIdx > 0) {
        const ahead = entries[myIdx - 1];
        setAheadUser({
          username: ahead.username,
          rank: myIdx, // their rank is myIdx (0-indexed + 1 = myIdx)
          gap: (ahead.pctReturn - entries[myIdx].pctReturn).toFixed(2),
          progress: ahead.pctReturn !== 0
            ? Math.min(100, Math.max(0, (entries[myIdx].pctReturn / ahead.pctReturn) * 100))
            : 0,
        });
      } else {
        setAheadUser(null); // user is #1
      }
    }
    setLbLoading(false);
  }, [session?.user?.id]);

  // Load leaderboard on mount (need rank for portfolio view)
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

  // Realtime activity subscription
  useEffect(() => {
    const channel = supabase
      .channel('portfolio_activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'paper_trades',
      }, () => {
        loadActivity();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadActivity]);

  // ── Search (debounced) ──
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
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
      if (!price) {
        setBuyError("Couldn't fetch price. Try again.");
        return;
      }
      setSelectedTicker({ symbol: item.symbol, name: item.name, price });
      setShowPresets(true);
      setShowCustom(false);
      setCustomAmount('');
    } catch {
      setBuyError("Couldn't fetch price. Try again.");
    }
  };

  // ── Buy with preset or custom amount ──
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
      // Reset and reload
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

  // ── Calculations ──
  const totalPositionsValue = trades.reduce((sum, t) => {
    const curPrice = prices[t.ticker] || Number(t.entry_price);
    return sum + (Number(t.shares) * curPrice);
  }, 0);
  const cashBalance = Number(portfolio?.cash_balance || 0);
  const totalValue = cashBalance + totalPositionsValue;
  const totalReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
  const isPositive = totalReturn >= 0;

  const onSellComplete = () => {
    setSellTrade(null);
    loadPortfolio();
    loadLeaderboard();
    loadActivity();
  };

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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

      {/* ── 1. Segmented control ── */}
      <div style={s.segWrap}>
        <div style={s.segBar}>
          <button
            style={{ ...s.segBtn, ...(view === 'portfolio' ? s.segActive : {}) }}
            onClick={() => setView('portfolio')}
          >My Portfolio</button>
          <button
            style={{ ...s.segBtn, ...(view === 'leaderboard' ? s.segActive : {}) }}
            onClick={() => setView('leaderboard')}
          >Leaderboard</button>
        </div>
      </div>

      {view === 'portfolio' ? (
        <>
          {/* ── 2. Rank circle + Value hero ── */}
          <div style={s.heroRow}>
            <div style={s.rankCircle}>
              <div style={s.rankNum}>#{myRank || '-'}</div>
            </div>
            <div style={s.heroInfo}>
              <div style={s.heroValueRow}>
                <span style={{ ...s.heroValue, color: isPositive ? '#3B6D11' : '#E24B4A' }}>
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ ...s.heroPct, color: isPositive ? '#3B6D11' : '#E24B4A' }}>
                  {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
                </span>
              </div>
              <div style={s.heroMeta}>
                {myRank && <span style={{ color: '#3B6D11' }}>Rank #{myRank}</span>}
                <span style={{ color: 'var(--text3)' }}>·</span>
                <span style={{ color: 'var(--text3)' }}>
                  Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {lastUpdated && (
                <div style={s.heroTimestamp}>
                  Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          {/* ── 3. Sparkline chart placeholder ── */}
          <div style={s.chartPlaceholder}>
            <svg width="100%" height="40" viewBox="0 0 300 40" preserveAspectRatio="none" style={{ opacity: 0.15 }}>
              <polyline points="0,35 20,32 40,28 60,30 80,22 100,25 120,18 140,20 160,14 180,16 200,10 220,12 240,8 260,10 280,6 300,4"
                fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div style={s.chartLabel}>Portfolio chart coming soon</div>
          </div>

          {/* ── 4. Catch-the-leader bar ── */}
          {myRank !== null && (
            <div style={s.leaderBar}>
              {aheadUser ? (
                <>
                  <div style={s.leaderText}>
                    <span style={{ fontWeight: 600 }}>{aheadUser.gap}%</span> behind{' '}
                    <span style={{ fontWeight: 600 }}>{aheadUser.username} (#{aheadUser.rank})</span>
                  </div>
                  <div style={s.leaderTrack}>
                    <div style={{ ...s.leaderFill, width: `${Math.max(5, aheadUser.progress)}%` }} />
                  </div>
                </>
              ) : (
                <div style={{ ...s.leaderText, color: '#3B6D11' }}>
                  You're in the lead!
                </div>
              )}
            </div>
          )}

          {/* ── 5. Add ticker input ── */}
          <div style={s.addSection}>
            <div style={s.addRow}>
              <input
                style={s.addInput}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                placeholder="ADD TICKER"
                maxLength={5}
              />
              <button
                style={s.addBtn}
                onClick={() => {
                  if (searchResults.length > 0) {
                    handleSelectTicker(searchResults[0]);
                  }
                }}
              >Add</button>
            </div>

            {/* Search dropdown */}
            {searchResults.length > 0 && (
              <div style={s.dropdown}>
                {searchResults.map(r => (
                  <div key={r.symbol} style={s.dropdownRow} onClick={() => handleSelectTicker(r)}>
                    <span style={s.dropdownTicker}>{r.symbol}</span>
                    <span style={s.dropdownName}>{r.name}</span>
                    <span style={s.dropdownExchange}>{r.exchange}</span>
                  </div>
                ))}
              </div>
            )}
            {searching && <div style={s.searchHint}>Searching...</div>}

            {/* ── 6. Quick invest presets ── */}
            {showPresets && selectedTicker && (
              <div style={s.presetCard}>
                <div style={s.presetHeader}>
                  <div>
                    <span style={s.presetTicker}>{selectedTicker.symbol}</span>
                    <span style={s.presetPrice}>${selectedTicker.price.toFixed(2)}</span>
                  </div>
                  <button style={s.presetClose} onClick={clearSelection}>×</button>
                </div>
                {!showCustom ? (
                  <div style={s.presetBtns}>
                    <button style={s.presetBtn} onClick={() => executeBuy(1000)}>
                      {buying ? '...' : '$1K'}
                    </button>
                    <button style={s.presetBtn} onClick={() => executeBuy(5000)}>
                      {buying ? '...' : '$5K'}
                    </button>
                    <button style={s.presetBtn} onClick={() => executeBuy(10000)}>
                      {buying ? '...' : '$10K'}
                    </button>
                    <button style={s.presetBtnOther} onClick={() => setShowCustom(true)}>
                      Other
                    </button>
                  </div>
                ) : (
                  <div style={s.customRow}>
                    <div style={s.customInputWrap}>
                      <span style={s.customDollar}>$</span>
                      <input
                        style={s.customInput}
                        type="number"
                        inputMode="decimal"
                        value={customAmount}
                        onChange={e => setCustomAmount(e.target.value)}
                        placeholder="Amount"
                        autoFocus
                      />
                    </div>
                    <button
                      style={{
                        ...s.customBuyBtn,
                        opacity: (parseFloat(customAmount) > 0 && !buying) ? 1 : 0.4,
                      }}
                      onClick={() => executeBuy(parseFloat(customAmount) || 0)}
                      disabled={!(parseFloat(customAmount) > 0) || buying}
                    >
                      {buying ? '...' : 'Buy'}
                    </button>
                  </div>
                )}
                {buyError && <div style={s.buyError}>{buyError}</div>}
              </div>
            )}
            {buyError && !showPresets && <div style={s.buyError}>{buyError}</div>}
          </div>

          {/* ── 7. Open positions ── */}
          <div style={s.section}>
            <div style={s.secLabel}>Positions · {trades.length}</div>
            {trades.length === 0 ? (
              <div style={s.emptyText}>No positions yet — add a ticker above</div>
            ) : (
              trades.map(trade => {
                const curPrice = prices[trade.ticker] || Number(trade.entry_price);
                const entryPrice = Number(trade.entry_price);
                const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
                const isUp = pctGain >= 0;
                const currentValue = Number(trade.shares) * curPrice;
                return (
                  <div
                    key={trade.id}
                    style={s.posRow}
                    onClick={() => setSellTrade({ ...trade, currentPrice: curPrice })}
                  >
                    <div>
                      <div style={s.posTicker}>{trade.ticker}</div>
                      <div style={s.posDetail}>
                        ${Number(trade.dollar_amount).toLocaleString()} · {Number(trade.shares).toFixed(2)} shares
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ ...s.posPct, color: isUp ? '#3B6D11' : '#E24B4A' }}>
                        {isUp ? '+' : ''}{pctGain.toFixed(2)}%
                      </div>
                      <div style={s.posVal}>
                        ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {trades.length > 0 && (
              <div style={s.sellHint}>Tap a position to sell</div>
            )}
          </div>

          {/* ── 8. Live activity feed ── */}
          {activity.length > 0 && (
            <div style={s.section}>
              <div style={s.secLabel}>Live activity</div>
              {activity.map((a, i) => {
                const isSell = a.status === 'closed';
                const username = a.profiles?.username || 'Unknown';
                const ts = isSell ? a.sold_at : a.bought_at;
                return (
                  <div key={a.id || i} style={s.actRow}>
                    <span style={s.actUser}>{username}</span>
                    <span style={{ color: 'var(--text2)' }}>
                      {' '}{isSell ? 'sold' : 'bought'} {a.ticker}
                    </span>
                    <span style={s.actTime}> · {timeAgo(ts)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ height: 20 }} />
        </>
      ) : (

        /* ── LEADERBOARD VIEW ── */
        <div style={s.section}>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={s.skeleton} />)
          ) : leaderboard.length === 0 ? (
            <div style={s.emptyText}>No participants yet.</div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.userId === session?.user?.id;
              const isUp = entry.pctReturn >= 0;
              const isExpanded = expandedUser === entry.userId;
              return (
                <div key={entry.userId}>
                  <div
                    style={{
                      ...s.lbRow,
                      background: isMe ? 'rgba(59,109,17,0.08)' : 'transparent',
                    }}
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

      {/* ── SellModal ── */}
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
  segWrap: { padding: '14px 16px 0' },
  segBar: { display: 'flex', background: 'var(--card2)', borderRadius: 10, padding: 3, gap: 2 },
  segBtn: {
    flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: 'transparent', color: 'var(--text3)',
    fontFamily: 'var(--font)', transition: 'all 0.15s',
  },
  segActive: {
    background: 'var(--card)', color: 'var(--text1)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  // Hero
  heroRow: {
    padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 14,
  },
  rankCircle: {
    width: 52, height: 52, borderRadius: '50%', background: '#EAF3DE',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankNum: { fontSize: 22, fontWeight: 700, color: '#27500A' },
  heroInfo: { flex: 1 },
  heroValueRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  heroValue: { fontSize: 24, fontWeight: 700 },
  heroPct: { fontSize: 14, fontWeight: 600 },
  heroMeta: { display: 'flex', gap: 6, fontSize: 12, marginTop: 3 },
  heroTimestamp: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },

  // Chart placeholder
  chartPlaceholder: {
    margin: '12px 16px 0', padding: '10px 14px',
    background: 'var(--card)', borderRadius: 10, border: '1px dashed var(--border)',
    position: 'relative', overflow: 'hidden',
  },
  chartLabel: {
    fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 4,
  },

  // Catch-the-leader
  leaderBar: {
    margin: '12px 16px 0', padding: '10px 12px',
    background: '#FAEEDA', borderRadius: 8,
  },
  leaderText: { fontSize: 13, color: '#633806' },
  leaderTrack: {
    height: 4, background: '#EDD9A3', borderRadius: 2, marginTop: 8,
  },
  leaderFill: {
    height: 4, background: '#BA7517', borderRadius: 2, transition: 'width 0.3s',
  },

  // Add ticker
  addSection: { padding: '12px 16px 0', position: 'relative' },
  addRow: { display: 'flex', gap: 8 },
  addInput: {
    flex: 1, background: 'var(--card2)', border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '11px 12px', fontSize: 14, fontWeight: 600,
    color: 'var(--text1)', fontFamily: 'var(--font)', outline: 'none',
    letterSpacing: 0.5,
  },
  addBtn: {
    background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8,
    padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)',
  },

  // Search dropdown
  dropdown: {
    position: 'absolute', left: 16, right: 16, top: 56,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    zIndex: 50, overflow: 'hidden',
  },
  dropdownRow: {
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  },
  dropdownTicker: { fontSize: 14, fontWeight: 700, color: 'var(--text1)', minWidth: 55 },
  dropdownName: {
    fontSize: 13, color: 'var(--text3)', flex: 1,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
  },
  dropdownExchange: { fontSize: 11, color: 'var(--text3)', flexShrink: 0 },
  searchHint: { fontSize: 12, color: 'var(--text3)', marginTop: 4 },

  // Preset card
  presetCard: {
    marginTop: 8, padding: '12px 14px', background: '#EAF3DE',
    borderRadius: 10, border: '1px solid rgba(59,109,17,0.2)',
  },
  presetHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  presetTicker: { fontSize: 15, fontWeight: 700, color: '#1a4d0a' },
  presetPrice: { fontSize: 13, color: '#3B6D11', marginLeft: 8 },
  presetClose: {
    background: 'none', border: 'none', fontSize: 20, color: '#3B6D11',
    cursor: 'pointer', padding: '0 4px', lineHeight: 1,
  },
  presetBtns: { display: 'flex', gap: 6 },
  presetBtn: {
    flex: 1, padding: '10px 0', borderRadius: 8,
    border: '1.5px solid #3B6D11', background: 'transparent',
    fontSize: 14, fontWeight: 600, color: '#3B6D11',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  presetBtnOther: {
    flex: 1, padding: '10px 0', borderRadius: 8,
    border: '1px solid var(--border)', background: 'transparent',
    fontSize: 14, fontWeight: 600, color: 'var(--text2)',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  customRow: { display: 'flex', gap: 8 },
  customInputWrap: {
    flex: 1, display: 'flex', alignItems: 'center',
    background: '#fff', border: '1.5px solid #3B6D11', borderRadius: 8,
    padding: '0 10px',
  },
  customDollar: { fontSize: 16, fontWeight: 600, color: '#3B6D11', marginRight: 4 },
  customInput: {
    flex: 1, border: 'none', background: 'transparent', padding: '10px 0',
    fontSize: 16, fontWeight: 600, color: '#1a4d0a', outline: 'none',
    fontFamily: 'var(--font)',
  },
  customBuyBtn: {
    background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'opacity 0.15s',
  },
  buyError: { fontSize: 12, color: '#E24B4A', marginTop: 6 },

  // Positions
  section: { padding: '0 16px 8px' },
  secLabel: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '14px 0 8px',
  },
  emptyText: { fontSize: 14, color: 'var(--text3)', padding: '16px 0', textAlign: 'center' },
  posRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', background: 'var(--card)', borderRadius: 10,
    border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer',
  },
  posTicker: { fontSize: 14, fontWeight: 700, color: 'var(--text1)' },
  posDetail: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  posPct: { fontSize: 14, fontWeight: 600 },
  posVal: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  sellHint: {
    fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '6px 0',
  },

  // Activity feed
  actRow: { fontSize: 13, padding: '5px 0', color: 'var(--text2)' },
  actUser: { fontWeight: 600, color: 'var(--text1)' },
  actTime: { fontSize: 12, color: 'var(--text3)' },

  // Leaderboard
  lbRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '13px 14px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
  },
  lbRank: { fontSize: 14, fontWeight: 700, color: 'var(--text2)', width: 30 },
  lbName: { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text1)' },
  lbYou: { fontSize: 12, fontWeight: 400, color: 'var(--text3)' },
  lbReturn: { fontSize: 14, fontWeight: 700, width: 70, textAlign: 'right' },
  lbCount: { fontSize: 11, color: 'var(--text3)', width: 40, textAlign: 'right' },
  lbExpanded: {
    padding: '4px 14px 12px 44px', display: 'flex', flexWrap: 'wrap', gap: 8,
  },
  lbTicker: {
    display: 'flex', gap: 6, alignItems: 'center',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 10px',
  },
  lbTickerName: { fontSize: 12, fontWeight: 700, color: 'var(--text1)' },

  // Loading
  skeleton: {
    height: 52, borderRadius: 12, marginBottom: 10,
    background: 'var(--card2)', animation: 'pulse 1.5s ease-in-out infinite',
  },
};
