// ============================================
// UPTIKALERTS — SellModal.jsx
// Confirm sell — full position close only (V1)
// ============================================

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isMarketOpen } from '../../utils/marketUtils';

export default function SellModal({ session, trade, onClose, onComplete }) {
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState('');

  const entryPrice = Number(trade.entry_price);
  const currentPrice = trade.currentPrice;
  const shares = Number(trade.shares);
  const gainDollar = (currentPrice - entryPrice) * shares;
  const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const isUp = gainPct >= 0;
  const saleValue = shares * currentPrice;

  const handleSell = async () => {
    if (selling) return;
    if (!isMarketOpen()) {
      setError('Market is closed — trades execute during market hours (9:30am-4pm EST)');
      return;
    }
    setSelling(true);
    setError('');

    try {
      // Close the trade first
      const { error: updateErr } = await supabase
        .from('paper_trades')
        .update({
          exit_price: currentPrice,
          status: 'closed',
          sold_at: new Date().toISOString(),
        })
        .eq('id', trade.id)
        .eq('status', 'open'); // Guard: only close if still open (prevents double-sell)
      if (updateErr) throw updateErr;

      // Return cash — read fresh balance then update atomically
      const { data: pf, error: readErr } = await supabase
        .from('paper_portfolios')
        .select('cash_balance')
        .eq('user_id', session.user.id)
        .single();
      if (readErr || !pf) throw readErr || new Error('Portfolio not found');

      const previousCash = Number(pf.cash_balance);
      const newCash = previousCash + saleValue;
      const { error: cashErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: newCash })
        .eq('user_id', session.user.id);
      if (cashErr) throw cashErr;

      console.log(`[Challenge] Sold ${trade.ticker}: cash ${previousCash} → ${newCash} (+${saleValue.toFixed(2)})`);

      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to sell. Try again.');
      setSelling(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.dragHandle} />

        <div style={styles.title}>{trade.ticker}</div>

        <div style={styles.grid}>
          <div style={styles.gridItem}>
            <div style={styles.gridLabel}>Entry Price</div>
            <div style={styles.gridVal}>${entryPrice.toFixed(2)}</div>
          </div>
          <div style={styles.gridItem}>
            <div style={styles.gridLabel}>Current Price</div>
            <div style={{ ...styles.gridVal, color: isUp ? '#3B6D11' : '#ef5350' }}>
              ${currentPrice.toFixed(2)}
            </div>
          </div>
          <div style={styles.gridItem}>
            <div style={styles.gridLabel}>Shares</div>
            <div style={styles.gridVal}>{shares.toFixed(4)}</div>
          </div>
          <div style={styles.gridItem}>
            <div style={styles.gridLabel}>Gain / Loss</div>
            <div style={{ ...styles.gridVal, color: isUp ? '#3B6D11' : '#ef5350' }}>
              {isUp ? '+' : ''}${gainDollar.toFixed(2)} ({isUp ? '+' : ''}{gainPct.toFixed(2)}%)
            </div>
          </div>
        </div>

        <div style={styles.saleRow}>
          Sale value: <span style={styles.saleVal}>
            ${saleValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={{ ...styles.sellBtn, opacity: selling ? 0.5 : 1 }}
          onClick={handleSell}
          disabled={selling}
        >
          {selling ? 'Selling...' : 'Sell All'}
        </button>
        <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 300, padding: 0,
  },
  sheet: {
    background: 'var(--card)', borderRadius: '18px 18px 0 0',
    padding: '12px 20px 28px', width: '100%', maxWidth: 480,
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2, background: 'var(--border)',
    margin: '0 auto 16px',
  },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16,
  },
  gridItem: {
    background: 'var(--card2)', borderRadius: 10, padding: '12px 14px',
    border: '1px solid var(--border)',
  },
  gridLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  gridVal: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  saleRow: { fontSize: 14, color: 'var(--text2)', marginBottom: 20, textAlign: 'center' },
  saleVal: { fontWeight: 700, color: 'var(--text1)', fontSize: 16 },
  error: { fontSize: 12, color: '#ef5350', marginBottom: 8, textAlign: 'center' },
  sellBtn: {
    width: '100%', background: '#ef5350', color: '#fff', border: 'none',
    borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: 8,
  },
  cancelBtn: {
    width: '100%', background: 'var(--card2)', color: 'var(--text3)',
    border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 14,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
};
