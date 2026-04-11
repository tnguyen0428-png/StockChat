// ============================================
// TickerMentionCard — inline card when $TICKER is mentioned in chat
// Shows live price, bull/bear voting, price target, mentions
// ============================================

import { useState, useEffect, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { getTickerQuote } from '../../lib/polygonQuote';

// ── Sentiment cache per group+ticker (reload on vote) ──
async function fetchSentiment(groupId, ticker) {
  try {
    const { data, error } = await supabase
      .from('ticker_sentiment')
      .select('sentiment')
      .eq('group_id', groupId)
      .eq('ticker', ticker);
    if (error || !data) return { bulls: 0, bears: 0 };
    const bulls = data.filter(d => d.sentiment === 'bull').length;
    const bears = data.filter(d => d.sentiment === 'bear').length;
    return { bulls, bears };
  } catch {
    return { bulls: 0, bears: 0 };
  }
}

async function fetchMentionCount(groupId, ticker) {
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count, error } = await supabase
      .from('ticker_mentions')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('ticker', ticker)
      .gte('created_at', weekAgo);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

async function fetchAvgTarget(groupId, ticker) {
  try {
    const { data, error } = await supabase
      .from('ticker_targets')
      .select('target_price')
      .eq('group_id', groupId)
      .eq('ticker', ticker);
    if (error || !data || data.length === 0) return null;
    const avg = data.reduce((s, d) => s + d.target_price, 0) / data.length;
    return avg;
  } catch {
    return null;
  }
}

// ── Vote handler ──
async function castVote(groupId, ticker, userId, sentiment) {
  try {
    const { error } = await supabase
      .from('ticker_sentiment')
      .upsert(
        { group_id: groupId, ticker, user_id: userId, sentiment },
        { onConflict: 'group_id,ticker,user_id' }
      );
    return !error;
  } catch {
    return false;
  }
}

// ── Helper: color for ticker logo ──
function logoColor(ticker) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = ((h << 5) - h) + ticker.charCodeAt(i);
  return colors[Math.abs(h) % colors.length];
}

const TickerMentionCard = memo(({ ticker, groupId, userId }) => {
  const sym = ticker.replace('$', '');
  const [price, setPrice] = useState(null);
  const [sentiment, setSentiment] = useState({ bulls: 0, bears: 0 });
  const [mentions, setMentions] = useState(0);
  const [target, setTarget] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    getTickerQuote(sym).then(d => { if (d) setPrice(d); });
    if (groupId) {
      fetchSentiment(groupId, sym).then(setSentiment);
      fetchMentionCount(groupId, sym).then(setMentions);
      fetchAvgTarget(groupId, sym).then(setTarget);
      // Check user's existing vote
      if (userId) {
        supabase
          .from('ticker_sentiment')
          .select('sentiment')
          .eq('group_id', groupId)
          .eq('ticker', sym)
          .eq('user_id', userId)
          .maybeSingle()
          .then(({ data }) => { if (data) setMyVote(data.sentiment); });
      }
    }
  }, [sym, groupId, userId]);

  const handleVote = useCallback(async (side) => {
    if (voting || !groupId || !userId) return;
    setVoting(true);
    const ok = await castVote(groupId, sym, userId, side);
    if (ok) {
      setMyVote(side);
      // Re-fetch sentiment
      const fresh = await fetchSentiment(groupId, sym);
      setSentiment(fresh);
    }
    setVoting(false);
  }, [groupId, userId, sym, voting]);

  const changeColor = price?.changePct >= 0 ? 'var(--green)' : '#F09595';
  const bg = logoColor(sym);

  return (
    <div style={s.card}>
      {/* Top row: logo + ticker + price */}
      <div style={s.topRow}>
        <div style={{ ...s.logo, backgroundColor: bg }}>
          {sym.substring(0, 2)}
        </div>
        <div style={s.info}>
          <span style={s.sym}>{sym}</span>
          {price?.name && (
            <span style={s.company}>{price.name.length > 22 ? price.name.substring(0, 22) + '…' : price.name}</span>
          )}
        </div>
        {price && (
          <div style={s.priceCol}>
            <span style={s.price}>${price.price?.toFixed(2)}</span>
            <span style={{ ...s.change, color: changeColor }}>
              {price.changePct >= 0 ? '+' : ''}{price.changePct?.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Bottom row: bull/bear + target + mentions */}
      <div style={s.bottomRow}>
        <button
          style={{
            ...s.voteBtn,
            ...(myVote === 'bull' ? s.voteBtnActive : {}),
            borderColor: 'var(--green)',
          }}
          onClick={() => handleVote('bull')}
          disabled={voting}
        >
          🐂 {sentiment.bulls || 0}
        </button>
        <button
          style={{
            ...s.voteBtn,
            ...(myVote === 'bear' ? { ...s.voteBtnActive, background: 'rgba(240,149,149,0.15)', borderColor: '#F09595' } : {}),
            borderColor: '#F09595',
          }}
          onClick={() => handleVote('bear')}
          disabled={voting}
        >
          🐻 {sentiment.bears || 0}
        </button>
        {target && (
          <span style={s.targetBadge}>🎯 ${target.toFixed(0)}</span>
        )}
        {mentions > 0 && (
          <span style={s.mentionsBadge}>{mentions} mention{mentions !== 1 ? 's' : ''} this week</span>
        )}
      </div>
    </div>
  );
});

TickerMentionCard.displayName = 'TickerMentionCard';
export default TickerMentionCard;

// ── Styles ──
const s = {
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    marginTop: 6,
    marginBottom: 2,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  sym: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text1)',
  },
  company: {
    fontSize: 11,
    color: 'var(--text3)',
    lineHeight: 1.2,
  },
  priceCol: {
    textAlign: 'right',
    flexShrink: 0,
  },
  price: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text1)',
    display: 'block',
  },
  change: {
    fontSize: 12,
    fontWeight: 500,
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  voteBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text1)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'var(--font)',
  },
  voteBtnActive: {
    background: 'rgba(94,237,138,0.15)',
  },
  targetBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--green)',
    background: 'var(--green-bg, rgba(94,237,138,0.08))',
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(94,237,138,0.2)',
  },
  mentionsBadge: {
    fontSize: 11,
    color: 'var(--text3)',
    marginLeft: 'auto',
  },
};
