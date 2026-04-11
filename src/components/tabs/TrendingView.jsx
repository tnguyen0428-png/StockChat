// ============================================
// UPTIKALERTS — TrendingView.jsx
// Group Trending: auto-ranked tickers by mentions & sentiment
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getBatchQuotes } from '../../lib/polygonQuote';


// ── Styles ──
const styles = {
  container: {
    flex: 1,
    backgroundColor: 'var(--bg)',
    padding: '16px',
    overflowY: 'auto',
    minHeight: 0,
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text1)',
    margin: 0,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text2)',
    margin: 0,
  },
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  filterPill: {
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text2)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  filterPillActive: {
    backgroundColor: 'var(--border)',
    color: 'var(--text1)',
    border: '1px solid var(--border)',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '16px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  cardHover: {
    borderColor: '#2e5a8f',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  rankBadge: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '700',
    flexShrink: 0,
  },
  tickerLogo: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
    color: '#fff',
    flexShrink: 0,
  },
  cardInfo: {
    flex: 1,
  },
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  },
  tickerName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text1)',
    margin: 0,
  },
  companyName: {
    fontSize: '12px',
    color: 'var(--text2)',
    margin: 0,
    marginTop: '2px',
  },
  priceSection: {
    textAlign: 'right',
  },
  price: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text1)',
    margin: 0,
  },
  changePct: {
    fontSize: '13px',
    fontWeight: '500',
    margin: 0,
    marginTop: '2px',
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    justifyContent: 'space-between',
    paddingTop: '12px',
    borderTop: '1px solid var(--border)',
  },
  sentimentBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  sentimentBarContainer: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--border)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  sentimentBarFill: {
    height: '100%',
    backgroundColor: 'var(--green)',
    transition: 'width 0.2s ease',
  },
  sentimentPercent: {
    fontSize: '12px',
    color: 'var(--text2)',
    minWidth: '36px',
    textAlign: 'right',
  },
  statsSection: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  statLabel: {
    color: 'var(--text3)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '2px',
  },
  statValue: {
    color: 'var(--text1)',
    fontWeight: '600',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
    color: 'var(--text2)',
  },
  emptyStateIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyStateText: {
    fontSize: '16px',
    margin: 0,
    marginBottom: '8px',
  },
  emptyStateHint: {
    fontSize: '13px',
    color: 'var(--text3)',
    margin: 0,
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--border)',
    borderTop: '3px solid var(--text1)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// ── Add keyframe animation ──
if (!document.getElementById('trending-view-keyframes')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'trending-view-keyframes';
  styleEl.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleEl);
}

// ── Helper: Get logo color for ticker ──
function getLogoColor(ticker) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ((hash << 5) - hash) + ticker.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

// ── Helper: Format number to 1-2 decimal places ──
function formatPrice(num) {
  if (num == null) return 'N/A';
  if (num < 10) return num.toFixed(2);
  if (num < 100) return num.toFixed(2);
  return num.toFixed(2);
}

// ── Helper: Format percentage ──
function formatPercent(num) {
  if (num == null) return 'N/A';
  return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

// ── Helper: Calculate time window for filter ──
function getTimeWindow(filter) {
  const now = new Date();
  switch (filter) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return start.toISOString();
    }
    case 'all':
    default:
      return null;
  }
}

// ── Main component ──
export default function TrendingView({ session, group }) {
  const [tickers, setTickers] = useState([]);
  const [timeFilter, setTimeFilter] = useState('week');
  const [loading, setLoading] = useState(false);

  // ── Fetch trending tickers ──
  useEffect(() => {
    if (!session?.user?.id || !group?.id) return;

    const fetchTrending = async () => {
      setLoading(true);
      try {
        const timeWindow = getTimeWindow(timeFilter);

        // Query ticker_mentions for active group
        let mentionsQuery = supabase
          .from('ticker_mentions')
          .select('ticker, created_at')
          .eq('group_id', group.id);

        if (timeWindow) {
          mentionsQuery = mentionsQuery.gte('created_at', timeWindow);
        }

        const { data: mentions, error: mentionsError } = await mentionsQuery;
        // Gracefully handle any error (e.g. table doesn't exist yet)
        if (mentionsError) {
          setTickers([]);
          setLoading(false);
          return;
        }

        if (!mentions || mentions.length === 0) {
          setTickers([]);
          setLoading(false);
          return;
        }

        // Count mentions per ticker
        const mentionMap = {};
        mentions.forEach(m => {
          mentionMap[m.ticker] = (mentionMap[m.ticker] || 0) + 1;
        });

        const uniqueTickers = Object.keys(mentionMap);

        // Query sentiment votes (bull/bear counts)
        const { data: sentiments, error: sentimentError } = await supabase
          .from('ticker_sentiment')
          .select('ticker, sentiment')
          .in('ticker', uniqueTickers)
          .eq('group_id', group.id);

        if (sentimentError) throw sentimentError;

        const sentimentMap = {};
        (sentiments || []).forEach(s => {
          if (!sentimentMap[s.ticker]) sentimentMap[s.ticker] = { bulls: 0, bears: 0 };
          if (s.sentiment === 'bull') sentimentMap[s.ticker].bulls++;
          else if (s.sentiment === 'bear') sentimentMap[s.ticker].bears++;
        });

        // Query price targets
        const { data: targets, error: targetsError } = await supabase
          .from('ticker_targets')
          .select('ticker, target_price')
          .in('ticker', uniqueTickers)
          .eq('group_id', group.id);

        if (targetsError) throw targetsError;

        const targetMap = {};
        (targets || []).forEach(t => {
          targetMap[t.ticker] = t.target_price;
        });

        // Fetch live prices from Polygon (batch snapshot)
        const priceMap = await getBatchQuotes(uniqueTickers);

        // Build ticker array with calculations
        const tickerList = uniqueTickers.map(ticker => {
          const mentions = mentionMap[ticker];
          const sentiment = sentimentMap[ticker] || { bulls: 0, bears: 0 };
          const priceInfo = priceMap[ticker] || {};
          const avgTarget = targetMap[ticker];

          const totalVotes = sentiment.bulls + sentiment.bears;
          const bullPct = totalVotes > 0 ? (sentiment.bulls / totalVotes) * 100 : 50;

          // Sentiment score: 0 to 2, where 1 is neutral
          const sentimentScore = totalVotes > 0
            ? 1 + ((sentiment.bulls - sentiment.bears) / (sentiment.bulls + sentiment.bears)) * 0.5
            : 1;

          // Rank score: mentions * sentiment weight
          const rankScore = mentions * sentimentScore;

          return {
            ticker,
            mentions,
            bulls: sentiment.bulls,
            bears: sentiment.bears,
            bullPct,
            avgTarget,
            price: priceInfo.price || 0,
            change: priceInfo.change || 0,
            changePct: priceInfo.changePct || 0,
            name: priceInfo.name || ticker,
            rankScore,
          };
        });

        // Sort by rank score (descending)
        tickerList.sort((a, b) => b.rankScore - a.rankScore);

        setTickers(tickerList);
      } catch (err) {
        // Silently handle — tables may not exist yet
        setTickers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, [session?.user?.id, group?.id, timeFilter]);

  // ── Render ticker card ──
  const renderCard = useCallback((ticker, index) => {
    const rank = index + 1;
    let rankColor = 'var(--text3)';
    if (rank === 1) rankColor = '#FFD700';
    else if (rank === 2) rankColor = '#C0C0C0';
    else if (rank === 3) rankColor = '#CD7F32';

    const changeColor = ticker.changePct >= 0 ? 'var(--green)' : '#F09595';
    const logoColor = getLogoColor(ticker.ticker);

    return (
      <div
        key={ticker.ticker}
        style={{
          ...styles.card,
          ':hover': { ...styles.cardHover },
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#2e5a8f';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        {/* Header: rank + logo + ticker info + price */}
        <div style={styles.cardHeader}>
          <div style={{ ...styles.rankBadge, color: rankColor, fontSize: '20px' }}>
            {rank}
          </div>
          <div style={{ ...styles.tickerLogo, backgroundColor: logoColor }}>
            {ticker.ticker.substring(0, 2)}
          </div>
          <div style={styles.cardInfo}>
            <div style={styles.cardTopRow}>
              <div>
                <h3 style={styles.tickerName}>{ticker.ticker}</h3>
                <p style={styles.companyName}>{ticker.name}</p>
              </div>
              <div style={styles.priceSection}>
                <p style={styles.price}>${formatPrice(ticker.price)}</p>
                <p style={{ ...styles.changePct, color: changeColor }}>
                  {formatPercent(ticker.changePct)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row: sentiment bar + stats */}
        <div style={styles.bottomRow}>
          <div style={styles.sentimentBar}>
            <div style={styles.sentimentBarContainer}>
              <div
                style={{
                  ...styles.sentimentBarFill,
                  width: `${ticker.bullPct}%`,
                }}
              />
            </div>
            <span style={styles.sentimentPercent}>{ticker.bullPct.toFixed(0)}%</span>
          </div>

          <div style={styles.statsSection}>
            {ticker.avgTarget && (
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Target</span>
                <span style={styles.statValue}>${formatPrice(ticker.avgTarget)}</span>
              </div>
            )}
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Mentions</span>
              <span style={styles.statValue}>{ticker.mentions}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Votes</span>
              <span style={styles.statValue}>{ticker.bulls + ticker.bears}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }, []);

  // ── Render loading state ──
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Group Trending</h1>
          <p style={styles.subtitle}>Auto-ranked by mentions & sentiment</p>
        </div>
        <div style={styles.loadingSpinner}>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  // ── Render empty state ──
  if (tickers.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Group Trending</h1>
          <p style={styles.subtitle}>Auto-ranked by mentions & sentiment</p>
        </div>

        <div style={styles.filterRow}>
          {['today', 'week', 'all'].map(filter => (
            <button
              key={filter}
              style={{
                ...styles.filterPill,
                ...(timeFilter === filter ? styles.filterPillActive : {}),
              }}
              onClick={() => setTimeFilter(filter)}
            >
              {filter === 'today' ? 'Today' : filter === 'week' ? 'This week' : 'All time'}
            </button>
          ))}
        </div>

        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>📊</div>
          <p style={styles.emptyStateText}>No tickers trending yet.</p>
          <p style={styles.emptyStateHint}>Mention $TICKER in chat to get started.</p>
        </div>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Group Trending</h1>
        <p style={styles.subtitle}>Auto-ranked by mentions & sentiment</p>
      </div>

      <div style={styles.filterRow}>
        {['today', 'week', 'all'].map(filter => (
          <button
            key={filter}
            style={{
              ...styles.filterPill,
              ...(timeFilter === filter ? styles.filterPillActive : {}),
            }}
            onClick={() => setTimeFilter(filter)}
          >
            {filter === 'today' ? 'Today' : filter === 'week' ? 'This week' : 'All time'}
          </button>
        ))}
      </div>

      <div style={styles.cardList}>
        {tickers.map((ticker, idx) => renderCard(ticker, idx))}
      </div>
    </div>
  );
}
