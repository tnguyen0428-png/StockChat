// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Paper trading challenge — inline design
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

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Inline buy flow
  const [tickerQuery, setTickerQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [buyAmount, setBuyAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');

  const refreshRef = useRef(null);
  const searchTimer = useRef(null);
  const inputRef = useRef(null);
  const amountRef = useRef(null);

  // ── Data loading ──

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
    setLbLoading(false);
  }, [prices]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // Load leaderboard on mount (need rank for portfolio view) and on tab switch
  useEffect(() => { loadLeaderboard(); }, []);
  useEffect(() => { if (view === 'leaderboard') loadLeaderboard(); }, [view]);

  // Refresh prices every 30s
  useEffect(() => {
    if (view !== 'portfolio' || trades.length === 0) return;
    refreshRef.current = setInterval(() => {
      const tickers = [...new Set(trades.map(t => t.ticker))].join(',');
      fetchPrices(tickers);
    }, 30000);
    return () => clearInterval(refreshRef.current);
  }, [view, trades]);

  // ── Inline search ──

  useEffect(() => {
    if (!tickerQuery.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(tickerQuery)}&limit=5&apikey=${FMP_KEY}`
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
  }, [tickerQuery]);

  const handleSelectTicker = async (item) => {
    setBuyError('');
    setSearchResults([]);
    setTickerQuery('');
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/quote-short?symbol=${item.symbol}&apikey=${FMP_KEY}`
      );
      const data = await res.json();
      const price = Array.isArray(data) && data[0] ? data[0].price : null;
      if (!price) { setBuyError("Couldn't fetch price. Try again."); return; }
      setSelectedTicker({ symbol: item.symbol, name: item.name, price });
      setTimeout(() => amountRef.current?.focus(), 100);
    } catch {
      setBuyError("Couldn't fetch price. Try again.");
    }
  };

  const cancelBuy = () => {
    setSelectedTicker(null);
    setBuyAmount('');
    setBuyError('');
  };

  const dollarAmount = parseFloat(buyAmount) || 0;
  const shares = selectedTicker?.price ? dollarAmount / selectedTicker.price : 0;

  const handleBuy = async () => {
    if (!selectedTicker || dollarAmount <= 0 || dollarAmount > cashBalance || buying) return;
    setBuying(true);
    setBuyError('');

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

      cancelBuy();
      loadPortfolio();
      loadLeaderboard();
    } catch (err) {
      setBuyError(err.message || 'Failed to buy. Try again.');
      setBuying(false);
    }
  };

  const onSellComplete = () => {
    setSellTrade(null);
    loadPortfolio();
    loadLeaderboard();
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

  // Rank from leaderboard
  const myRankIdx = leaderboard.findIndex(e => e.userId === session?.user?.id);
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;

  // Catch-the-leader
  const leaderAbove = myRankIdx > 0 ? leaderboard[myRankIdx - 1] : null;
  const gapPct = leaderAbove ? leaderAbove.pctReturn - totalReturn : 0;
  const isLeader = myRank === 1;

  // Progress bar: how close to person above (capped 0-100)
  let progressPct = 0;
  if (leaderAbove && leaderAbove.pctReturn !== 0) {
    progressPct = Math.max(0, Math.min(100, (totalReturn / leaderAbove.pctReturn) * 100));
  }
  if (isLeader) progressPct = 100;

  const canBuy = selectedTicker && dollarAmount > 0 && dollarAmount <= cashBalance && !buying;

  // ── Loading ──

  if (loadingData) {
    return (
      <div style={S.scroll}>
        <div style={{ padding: 20 }}>
          {[1, 2, 3].map(i => <div key={i} style={S.skeleton} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={S.scroll}>
      {/* 1. Segmented control */}
      <div style={S.segWrap}>
        <div style={S.segBar}>
          <button
            style={{ ...S.segBtn, ...(view === 'portfolio' ? S.segActive : {}) }}
            onClick={() => setView('portfolio')}
          >My Portfolio</button>
          <button
            style={{ ...S.segBtn, ...(view === 'leaderboard' ? S.segActive : {}) }}
            onClick={() => setView('leaderboard')}
          >Leaderboard</button>
        </div>
      </div>

      {view === 'portfolio' ? (
        <>
          {/* 2. Rank circle + Value hero */}
          <div style={S.hero}>
            <div style={S.rankCircle}>
              <span style={S.rankText}>{myRank ? `#${myRank}` : '--'}</span>
            </div>
            <div style={S.heroRight}>
              <div style={{ ...S.heroValue, color: isPositive ? '#27500A' : '#ef5350' }}>
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ ...S.heroPct, color: isPositive ? '#3B6D11' : '#ef5350' }}>
                {isPositive ? '+' : ''}{totalReturn.toFixed(2)}% all time
              </div>
              <div style={S.heroCash}>
                Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {lastUpdated && (
                <div style={S.heroTime}>
                  Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          {/* 3. Sparkline placeholder */}
          <div style={S.chartPlaceholder}>
            <span style={S.chartText}>Portfolio chart coming soon</span>
          </div>

          {/* 4. Catch-the-leader bar */}
          {myRank !== null && leaderboard.length > 1 && (
            <div style={S.leaderBar}>
              {isLeader ? (
                <div style={S.leaderWin}>You're in the lead!</div>
              ) : (
                <>
                  <div style={S.leaderLabel}>
                    {gapPct.toFixed(2)}% behind {leaderAbove?.username} (#{myRank - 1})
                  </div>
                  <div style={S.progressTrack}>
                    <div style={{ ...S.progressFill, width: `${progressPct}%` }} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 5. Add ticker input */}
          <div style={S.addSection}>
            <div style={S.addRow}>
              <div style={S.addInputWrap}>
                <input
                  ref={inputRef}
                  style={S.addInput}
                  value={tickerQuery}
                  onChange={e => {
                    const v = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                    setTickerQuery(v);
                    if (selectedTicker) cancelBuy();
                  }}
                  placeholder="ADD TICKER"
                />
                {searching && <span style={S.addSpinner}>...</span>}
              </div>
              {!selectedTicker && (
                <button style={{ ...S.addBtn, opacity: 0.4 }} disabled>Add</button>
              )}
            </div>

            {/* Search dropdown */}
            {searchResults.length > 0 && !selectedTicker && (
              <div style={S.dropdown}>
                {searchResults.map(r => (
                  <div key={r.symbol} style={S.dropItem} onClick={() => handleSelectTicker(r)}>
                    <span style={S.dropTicker}>{r.symbol}</span>
                    <span style={S.dropName}>{r.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Inline buy card */}
            {selectedTicker && (
              <div style={S.buyCard}>
                <div style={S.buyCardHeader}>
                  <div>
                    <span style={S.buyCardTicker}>{selectedTicker.symbol}</span>
                    <span style={S.buyCardName}>{selectedTicker.name}</span>
                  </div>
                  <button style={S.buyCardClose} onClick={cancelBuy}>X</button>
                </div>
                <div style={S.buyCardPrice}>
                  ${selectedTicker.price.toFixed(2)} <span style={S.buyCardPriceLabel}>current</span>
                </div>
                <div style={S.amountRow}>
                  <span style={S.dollarSign}>$</span>
                  <input
                    ref={amountRef}
                    style={S.amountInput}
                    type="number"
                    inputMode="decimal"
                    value={buyAmount}
                    onChange={e => setBuyAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <button
                    style={{ ...S.buyBtn, opacity: canBuy ? 1 : 0.4 }}
                    onClick={handleBuy}
                    disabled={!canBuy}
                  >
                    {buying ? '...' : 'Buy'}
                  </button>
                </div>
                {dollarAmount > 0 && selectedTicker.price > 0 && (
                  <div style={S.buyHint}>
                    {shares.toFixed(4)} shares at ${selectedTicker.price.toFixed(2)}
                  </div>
                )}
                {dollarAmount > cashBalance && (
                  <div style={S.buyErr}>Exceeds cash (${cashBalance.toFixed(2)})</div>
                )}
                {buyError && <div style={S.buyErr}>{buyError}</div>}
              </div>
            )}
          </div>

          {/* 6. Open positions */}
          {trades.length > 0 && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Open Positions</div>
              {trades.map(trade => {
                const curPrice = prices[trade.ticker] || Number(trade.entry_price);
                const entryPrice = Number(trade.entry_price);
                const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
                const isUp = pctGain >= 0;
                return (
                  <div
                    key={trade.id}
                    style={S.posRow}
                    onClick={() => setSellTrade({ ...trade, currentPrice: curPrice })}
                  >
                    <div>
                      <div style={S.posTicker}>{trade.ticker}</div>
                      <div style={S.posDetail}>
                        {Number(trade.shares).toFixed(2)} shares @ ${entryPrice.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ ...S.posPrice, color: isUp ? '#3B6D11' : '#ef5350' }}>
                        ${curPrice.toFixed(2)}
                      </div>
                      <div style={{ ...S.posPct, color: isUp ? '#3B6D11' : '#ef5350' }}>
                        {isUp ? '+' : ''}{pctGain.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {trades.length === 0 && (
            <div style={S.emptyHint}>Search a ticker above to make your first trade.</div>
          )}
        </>
      ) : (
        /* Leaderboard view */
        <div style={S.section}>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={S.skeleton} />)
          ) : leaderboard.length === 0 ? (
            <div style={S.emptyHint}>No participants yet.</div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.userId === session?.user?.id;
              const isUp = entry.pctReturn >= 0;
              const isExpanded = expandedUser === entry.userId;
              return (
                <div key={entry.userId}>
                  <div
                    style={{ ...S.lbRow, background: isMe ? 'rgba(59,109,17,0.08)' : 'transparent' }}
                    onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}
                  >
                    <div style={S.lbRank}>#{idx + 1}</div>
                    <div style={S.lbName}>
                      {entry.username}
                      {isMe && <span style={S.lbYou}> (you)</span>}
                    </div>
                    <div style={{ ...S.lbReturn, color: isUp ? '#3B6D11' : '#ef5350' }}>
                      {isUp ? '+' : ''}{entry.pctReturn.toFixed(2)}%
                    </div>
                    <div style={S.lbCount}>{entry.openCount} pos</div>
                  </div>
                  {isExpanded && entry.positions.length > 0 && (
                    <div style={S.lbExpanded}>
                      {entry.positions.map((p, i) => (
                        <div key={i} style={S.lbTicker}>
                          <span style={S.lbTickerName}>{p.ticker}</span>
                          <span style={{ color: p.pctGain >= 0 ? '#3B6D11' : '#ef5350', fontSize: 12 }}>
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

      {/* Sell modal */}
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

// ── Styles ──

const S = {
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
  segActive: { background: 'var(--card)', color: 'var(--text1)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },

  // Hero
  hero: {
    display: 'flex', alignItems: 'center', gap: 16,
    margin: '14px 16px 0', padding: '16px 16px',
    background: 'var(--card)', borderRadius: 14,
    border: '1px solid var(--border)',
  },
  rankCircle: {
    width: 52, height: 52, borderRadius: '50%', background: '#EAF3DE',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankText: { fontSize: 18, fontWeight: 800, color: '#27500A' },
  heroRight: { flex: 1 },
  heroValue: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  heroPct: { fontSize: 13, fontWeight: 600, marginTop: 2 },
  heroCash: { fontSize: 12, color: 'var(--text3)', marginTop: 4 },
  heroTime: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },

  // Chart placeholder
  chartPlaceholder: {
    margin: '10px 16px 0', height: 60, borderRadius: 10,
    background: 'var(--card2)', border: '1px dashed var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  chartText: { fontSize: 12, color: 'var(--text3)' },

  // Catch-the-leader
  leaderBar: {
    margin: '10px 16px 0', padding: '10px 14px',
    background: '#FAEEDA', borderRadius: 10,
  },
  leaderLabel: { fontSize: 13, fontWeight: 600, color: '#8B6914', marginBottom: 6 },
  progressTrack: {
    height: 5, borderRadius: 3, background: 'rgba(139,105,20,0.15)',
  },
  progressFill: {
    height: 5, borderRadius: 3, background: '#C8960C',
    transition: 'width 0.3s ease',
  },
  leaderWin: { fontSize: 13, fontWeight: 700, color: '#3B6D11' },

  // Add ticker
  addSection: { margin: '12px 16px 0', position: 'relative' },
  addRow: { display: 'flex', gap: 8 },
  addInputWrap: {
    flex: 1, display: 'flex', alignItems: 'center',
    background: 'var(--card)', border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '0 12px',
  },
  addInput: {
    flex: 1, background: 'transparent', border: 'none',
    padding: '11px 0', fontSize: 14, fontWeight: 600,
    color: 'var(--text1)', fontFamily: 'var(--font)',
    outline: 'none', letterSpacing: 0.5,
  },
  addSpinner: { fontSize: 12, color: 'var(--text3)' },
  addBtn: {
    background: '#3B6D11', color: '#fff', border: 'none',
    borderRadius: 10, padding: '11px 20px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', flexShrink: 0,
  },

  // Dropdown
  dropdown: {
    position: 'absolute', top: 46, left: 0, right: 0, zIndex: 50,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    overflow: 'hidden',
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px', cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
  },
  dropTicker: { fontSize: 14, fontWeight: 700, color: 'var(--text1)', minWidth: 56 },
  dropName: { fontSize: 13, color: 'var(--text3)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },

  // Inline buy card
  buyCard: {
    marginTop: 8, padding: '14px 14px',
    background: 'var(--card)', border: '1.5px solid #3B6D11',
    borderRadius: 12,
  },
  buyCardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 6,
  },
  buyCardTicker: { fontSize: 16, fontWeight: 700, color: 'var(--text1)', marginRight: 8 },
  buyCardName: { fontSize: 12, color: 'var(--text3)' },
  buyCardClose: {
    background: 'none', border: 'none', fontSize: 14, fontWeight: 700,
    color: 'var(--text3)', cursor: 'pointer', padding: '0 4px',
    fontFamily: 'var(--font)',
  },
  buyCardPrice: { fontSize: 14, fontWeight: 600, color: 'var(--text1)', marginBottom: 10 },
  buyCardPriceLabel: { fontSize: 11, fontWeight: 400, color: 'var(--text3)' },
  amountRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--card2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '0 8px 0 12px',
  },
  dollarSign: { fontSize: 16, fontWeight: 600, color: 'var(--text3)' },
  amountInput: {
    flex: 1, background: 'transparent', border: 'none',
    padding: '10px 0', fontSize: 18, fontWeight: 600,
    color: 'var(--text1)', fontFamily: 'var(--font)', outline: 'none',
  },
  buyBtn: {
    background: '#3B6D11', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 18px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font)', flexShrink: 0,
    transition: 'opacity 0.15s',
  },
  buyHint: { fontSize: 12, color: 'var(--text3)', marginTop: 6 },
  buyErr: { fontSize: 12, color: '#ef5350', marginTop: 4 },

  // Positions
  section: { padding: '0 16px 16px' },
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    padding: '14px 0 8px',
  },
  posRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '13px 14px', background: 'var(--card)',
    borderRadius: 12, marginBottom: 6, cursor: 'pointer',
    border: '1px solid var(--border)',
  },
  posTicker: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  posDetail: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  posPrice: { fontSize: 14, fontWeight: 600 },
  posPct: { fontSize: 12, fontWeight: 600, marginTop: 2 },
  emptyHint: { fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '28px 16px' },

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
