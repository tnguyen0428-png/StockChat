// ============================================
// UPTIKALERTS — TickerBanner.jsx
// Scrolling stock ticker banner with live quotes
// ============================================

import { useState, useEffect, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { isWeekend, isMarketHoliday } from '../../utils/marketUtils';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const REFRESH_INTERVAL = 60000;

const TickerBanner = memo(({ groupId }) => {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;

    let mounted = true;

    const fetchQuotes = async () => {
      if (isWeekend() || isMarketHoliday()) { if (mounted) setLoading(false); return; }
      try {
        const { data: lists } = await supabase
          .from('curated_lists')
          .select('id')
          .eq('group_id', groupId);

        if (!lists || lists.length === 0) {
          if (mounted) setLoading(false);
          return;
        }

        const listIds = lists.map(l => l.id);

        const { data: stocks } = await supabase
          .from('curated_stocks')
          .select('ticker, ranking')
          .in('list_id', listIds)
          .order('ranking', { ascending: true });

        if (!stocks || stocks.length === 0) {
          if (mounted) setLoading(false);
          return;
        }

        const tickers = [...new Set(stocks.map(s => s.ticker))];
        const tickerParam = tickers.join(',');

        const res = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerParam}&apiKey=${POLYGON_KEY}`
        );
        const data = await res.json();

        if (!mounted) return;

        if (data.tickers && data.tickers.length > 0) {
          const rankMap = {};
          stocks.forEach(s => { rankMap[s.ticker] = s.ranking; });
          const quoteData = data.tickers.map(t => ({
            symbol: t.ticker,
            ranking: rankMap[t.ticker] || null,
            price: t.day?.c || t.prevDay?.c || 0,
            change: t.todaysChange || 0,
            changePercent: t.todaysChangePerc || 0,
          }));
          setQuotes(quoteData);
        } else {
          const quoteData = await fetchPrevDayQuotes(tickers);
          if (mounted) setQuotes(quoteData);
        }
      } catch (err) {
        console.error('TickerBanner error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, REFRESH_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [groupId]);

  if (loading) {
    return (
      <div style={styles.banner}>
        <span style={styles.loadingText}>Loading quotes...</span>
      </div>
    );
  }

  if (quotes.length === 0) return null;

  const displayQuotes = [...quotes, ...quotes];

  return (
    <div style={styles.banner}>
      <style>{`
        @keyframes bannerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div style={{
        ...styles.track,
        animationDuration: `${quotes.length * 4}s`,
      }}>
        {displayQuotes.map((q, i) => {
          const isUp = q.change >= 0;
          return (
            <div key={`${q.symbol}-${i}`} style={styles.quoteItem}>
              <img
                src={`https://images.financialmodelingprep.com/symbol/${q.symbol}.png`}
                alt={q.symbol}
                style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'contain', background: 'var(--card)', border: '0.5px solid var(--border)', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              <span style={styles.symbol}>{q.ranking ? `#${q.ranking} ` : ''}{q.symbol}</span>
              <span style={styles.price}>${q.price.toFixed(2)}</span>
              <span style={{ ...styles.change, color: isUp ? 'var(--green)' : '#EF4444' }}>
                {isUp ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
              </span>
              {i < displayQuotes.length - 1 && (
                <span style={styles.divider}>│</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

async function fetchPrevDayQuotes(tickers) {
  if (isWeekend() || isMarketHoliday()) return [];
  const allQuotes = [];
  for (let i = 0; i < tickers.length; i += 20) {
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    const batch = tickers.slice(i, i + 20);
    try {
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      (data.tickers || []).forEach(t => {
        const price = t.day?.c || t.prevDay?.c || 0;
        const change = t.todaysChange || 0;
        const changePercent = t.todaysChangePerc || 0;
        allQuotes.push({ symbol: t.ticker, price, change, changePercent });
      });
    } catch {}
  }
  return allQuotes;
}

export default TickerBanner;

const styles = {
  banner: {
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    overflow: 'hidden',
    flexShrink: 0,
    height: 36,
    display: 'flex',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 11,
    color: 'var(--text3)',
    padding: '0 14px',
  },
  track: {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    animation: 'bannerScroll linear infinite',
  },
  quoteItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 14px',
  },
  symbol: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
  },
  price: {
    fontSize: 15,
    color: 'var(--text2)',
  },
  change: {
    fontSize: 14,
    fontWeight: 600,
  },
  divider: {
    color: 'var(--border)',
    fontSize: 12,
  },
};
