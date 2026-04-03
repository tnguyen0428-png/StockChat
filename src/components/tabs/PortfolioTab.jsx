// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Paper trading challenge: portfolio + leaderboard
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import BuyModal from '../portfolio/BuyModal';
import SellModal from '../portfolio/SellModal';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;
const STARTING_CASH = 50000;

export default function PortfolioTab({ session }) {
  const { profile } = useGroup();
  const [view, setView] = useState('portfolio'); // 'portfolio' | 'leaderboard'
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showBuy, setShowBuy] = useState(false);
  const [sellTrade, setSellTrade] = useState(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [lbLoading, setLbLoading] = useState(false);

  const refreshRef = useRef(null);

  // -- Init portfolio + fetch data --
  const loadPortfolio = useCallback(async () => {
    if (!session?.user?.id) return;

    // Ensure portfolio exists
    await supabase.rpc('ensure_paper_portfolio');

    const [{ data: pf }, { data: openTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*').eq('user_id', session.user.id).single(),
      supabase.from('paper_trades').select('*').eq('user_id', session.user.id).eq('status', 'open'),
    ]);

    setPortfolio(pf);
    setTrades(openTrades || []);
    setLoadingData(false);

    // Fetch prices for open tickers
    if (openTrades?.length > 0) {
      const tickers = [...new Set(openTrades.map(t => t.ticker))].join(',');
      await fetchPrices(tickers);
    }
  }, [session?.user?.id]);

  const fetchPrices = async (tickers) => {
    if (!tickers) return;
    try {
      const res = await fetch(`https://financialmodelingprep.com/stable/quote-short/${tickers}?apikey=${FMP_KEY}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const map = {};
        data.forEach(q => { map[q.symbol] = q.price; });
        setPrices(map);
        setLastUpdated(new Date());
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  // Refresh prices every 30s while on portfolio view
  useEffect(() => {
    if (view !== 'portfolio' || trades.length === 0) return;
    refreshRef.current = setInterval(() => {
      const tickers = [...new Set(trades.map(t => t.ticker))].join(',');
      fetchPrices(tickers);
    }, 30000);
    return () => clearInterval(refreshRef.current);
  }, [view, trades]);

  // -- Leaderboard --
  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    const [{ data: allPortfolios }, { data: allTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*, profiles(username)'),
      supabase.from('paper_trades').select('*').eq('status', 'open'),
    ]);

    if (!allPortfolios) { setLbLoading(false); return; }

    // Get all open tickers for price fetch
    const allTickers = [...new Set((allTrades || []).map(t => t.ticker))];
    let priceMap = { ...prices };
    if (allTickers.length > 0) {
      try {
        const res = await fetch(`https://financialmodelingprep.com/stable/quote-short/${allTickers.join(',')}?apikey=${FMP_KEY}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(q => { priceMap[q.symbol] = q.price; });
          setPrices(priceMap);
        }
      } catch { /* silent */ }
    }

    // Build leaderboard entries
    const entries = allPortfolios.map(pf => {
      const userTrades = (allTrades || []).filter(t => t.user_id === pf.user_id);
      const positionsValue = userTrades.reduce((sum, t) => {
        const curPrice = priceMap[t.ticker] || t.entry_price;
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

  useEffect(() => {
    if (view === 'leaderboard') loadLeaderboard();
  }, [view]);

  // -- Calculations --
  const totalPositionsValue = trades.reduce((sum, t) => {
    const curPrice = prices[t.ticker] || Number(t.entry_price);
    return sum + (Number(t.shares) * curPrice);
  }, 0);
  const cashBalance = Number(portfolio?.cash_balance || 0);
  const totalValue = cashBalance + totalPositionsValue;
  const totalReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
  const isPositive = totalReturn >= 0;

  const onBuyComplete = () => {
    setShowBuy(false);
    loadPortfolio();
  };

  const onSellComplete = () => {
    setSellTrade(null);
    loadPortfolio();
  };

  // -- Loading skeleton --
  if (loadingData) {
    return (
      <div style={styles.scroll}>
        <div style={{ padding: 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={styles.skeleton} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.scroll}>
      {/* Segmented control */}
      <div style={styles.segWrap}>
        <div style={styles.segBar}>
          <button
            style={{ ...styles.segBtn, ...(view === 'portfolio' ? styles.segActive : {}) }}
            onClick={() => setView('portfolio')}
          >
            My Portfolio
          </button>
          <button
            style={{ ...styles.segBtn, ...(view === 'leaderboard' ? styles.segActive : {}) }}
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
        </div>
      </div>

      {view === 'portfolio' ? (
        <>
          {/* Header card */}
          <div style={styles.headerCard}>
            <div style={styles.headerLabel}>Total Portfolio Value</div>
            <div style={{ ...styles.headerValue, color: isPositive ? '#3B6D11' : '#ef5350' }}>
              ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ ...styles.headerReturn, color: isPositive ? '#3B6D11' : '#ef5350' }}>
              {isPositive ? '+' : ''}{totalReturn.toFixed(2)}% from $50,000
            </div>
            <div style={styles.headerCash}>
              Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {lastUpdated && (
              <div style={styles.timestamp}>
                Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
            )}
          </div>

          {/* Open positions */}
          {trades.length > 0 ? (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Open Positions</div>
              {trades.map(trade => {
                const curPrice = prices[trade.ticker] || Number(trade.entry_price);
                const entryPrice = Number(trade.entry_price);
                const pctGain = ((curPrice - entryPrice) / entryPrice) * 100;
                const isUp = pctGain >= 0;
                return (
                  <div
                    key={trade.id}
                    style={styles.posRow}
                    onClick={() => setSellTrade({ ...trade, currentPrice: curPrice })}
                  >
                    <div style={styles.posLeft}>
                      <div style={styles.posTicker}>{trade.ticker}</div>
                      <div style={styles.posDetail}>
                        {Number(trade.shares).toFixed(2)} shares @ ${entryPrice.toFixed(2)}
                      </div>
                    </div>
                    <div style={styles.posRight}>
                      <div style={{ ...styles.posPrice, color: isUp ? '#3B6D11' : '#ef5350' }}>
                        ${curPrice.toFixed(2)}
                      </div>
                      <div style={{ ...styles.posPct, color: isUp ? '#3B6D11' : '#ef5350' }}>
                        {isUp ? '+' : ''}{pctGain.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>Start your challenge!</div>
              <div style={styles.emptyText}>You have $50,000 to invest.</div>
              <button style={styles.emptyBtn} onClick={() => setShowBuy(true)}>
                + Buy Your First Stock
              </button>
            </div>
          )}

          {/* Buy button (only when positions exist) */}
          {trades.length > 0 && (
            <div style={styles.buyWrap}>
              <button style={styles.buyBtn} onClick={() => setShowBuy(true)}>
                + Buy Stock
              </button>
            </div>
          )}
        </>
      ) : (
        /* Leaderboard view */
        <div style={styles.section}>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={styles.skeleton} />)
          ) : leaderboard.length === 0 ? (
            <div style={styles.emptyText}>No participants yet.</div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.userId === session?.user?.id;
              const isUp = entry.pctReturn >= 0;
              const isExpanded = expandedUser === entry.userId;
              return (
                <div key={entry.userId}>
                  <div
                    style={{
                      ...styles.lbRow,
                      background: isMe ? 'rgba(59,109,17,0.08)' : 'transparent',
                    }}
                    onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}
                  >
                    <div style={styles.lbRank}>#{idx + 1}</div>
                    <div style={styles.lbName}>
                      {entry.username}
                      {isMe && <span style={styles.lbYou}> (you)</span>}
                    </div>
                    <div style={{ ...styles.lbReturn, color: isUp ? '#3B6D11' : '#ef5350' }}>
                      {isUp ? '+' : ''}{entry.pctReturn.toFixed(2)}%
                    </div>
                    <div style={styles.lbCount}>{entry.openCount} pos</div>
                  </div>
                  {isExpanded && entry.positions.length > 0 && (
                    <div style={styles.lbExpanded}>
                      {entry.positions.map((p, i) => (
                        <div key={i} style={styles.lbTicker}>
                          <span style={styles.lbTickerName}>{p.ticker}</span>
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

      {/* Modals */}
      {showBuy && (
        <BuyModal
          session={session}
          cashBalance={cashBalance}
          onClose={() => setShowBuy(false)}
          onComplete={onBuyComplete}
        />
      )}
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

const styles = {
  scroll: { flex: 1, overflowY: 'auto', background: 'var(--bg)' },

  // Segmented control
  segWrap: { padding: '14px 16px 0' },
  segBar: {
    display: 'flex', background: 'var(--card2)', borderRadius: 10,
    padding: 3, gap: 2,
  },
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

  // Header card
  headerCard: {
    margin: '14px 16px', padding: '18px 16px',
    background: 'var(--card)', borderRadius: 14,
    border: '1px solid var(--border)',
  },
  headerLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerValue: { fontSize: 28, fontWeight: 700, marginTop: 4, lineHeight: 1.2 },
  headerReturn: { fontSize: 14, fontWeight: 600, marginTop: 4 },
  headerCash: { fontSize: 13, color: 'var(--text2)', marginTop: 8 },
  timestamp: { fontSize: 11, color: 'var(--text3)', marginTop: 6 },

  // Positions
  section: { padding: '0 16px 16px' },
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    padding: '12px 0 8px',
  },
  posRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 14px', background: 'var(--card)',
    borderRadius: 12, marginBottom: 8, cursor: 'pointer',
    border: '1px solid var(--border)',
  },
  posLeft: {},
  posTicker: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  posDetail: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  posRight: { textAlign: 'right' },
  posPrice: { fontSize: 14, fontWeight: 600 },
  posPct: { fontSize: 12, fontWeight: 600, marginTop: 2 },

  // Empty state
  emptyState: {
    padding: '48px 32px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginBottom: 6 },
  emptyText: { fontSize: 14, color: 'var(--text3)', marginBottom: 24 },
  emptyBtn: {
    background: '#3B6D11', color: '#fff', border: 'none',
    borderRadius: 12, padding: '14px 28px',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)',
  },

  // Buy button
  buyWrap: {
    padding: '8px 16px 20px', display: 'flex', justifyContent: 'center',
  },
  buyBtn: {
    background: '#3B6D11', color: '#fff', border: 'none',
    borderRadius: 24, padding: '12px 32px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)',
    boxShadow: '0 2px 8px rgba(59,109,17,0.3)',
  },

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
    padding: '4px 14px 12px 44px',
    display: 'flex', flexWrap: 'wrap', gap: 8,
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
