// ============================================
// UPTIKALERTS — SellModal.jsx
// Confirm sell — full or partial position exit
// ============================================

import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { isMarketOpen } from '../../utils/marketUtils';

function buildOptions(totalShares) {
  const values = [];
  if (totalShares < 1) {
    let v = 0.1;
    while (v < totalShares - 0.001) {
      values.push(parseFloat(v.toFixed(4)));
      v = parseFloat((v + 0.1).toFixed(4));
    }
  } else if (totalShares < 10) {
    let v = 0.5;
    while (v < totalShares - 0.001) {
      values.push(parseFloat(v.toFixed(4)));
      v = parseFloat((v + 0.5).toFixed(4));
    }
  } else {
    for (let v = 1; v < totalShares - 0.001; v++) {
      values.push(v);
    }
  }
  return values;
}

function snapToOption(target, options, totalShares) {
  if (target >= totalShares - 0.001) return 'all';
  if (options.length === 0) return 'all';
  let closest = options[0];
  let minDiff = Math.abs(options[0] - target);
  for (const opt of options) {
    const diff = Math.abs(opt - target);
    if (diff < minDiff) { minDiff = diff; closest = opt; }
  }
  return String(closest);
}

export default function SellModal({ session, trade, onClose, onComplete }) {
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState('');
  const [selectedQty, setSelectedQty] = useState('all');

  const entryPrice  = Number(trade.entry_price);
  const currentPrice = trade.currentPrice;
  const shares      = Number(trade.shares);
  const gainDollar  = (currentPrice - entryPrice) * shares;
  const gainPct     = ((currentPrice - entryPrice) / entryPrice) * 100;
  const isUp        = gainPct >= 0;

  const options     = useMemo(() => buildOptions(shares), [shares]);
  const sharesToSell = selectedQty === 'all' ? shares : Number(selectedQty);
  const saleValue   = sharesToSell * currentPrice;
  const isFullSell  = Math.abs(sharesToSell - shares) < 0.0001;
  const pct         = (sharesToSell / shares) * 100;

  const chipActive  = (target) => Math.abs(pct - target) < 1;

  const handleChip = (chipPct) => {
    if (chipPct === 100) { setSelectedQty('all'); return; }
    const target = shares * (chipPct / 100);
    setSelectedQty(snapToOption(target, options, shares));
  };

  const handleSell = async () => {
    if (selling) return;
    if (!isMarketOpen()) {
      setError('Market is closed — trades execute during market hours (9:30am-4pm EST)');
      return;
    }
    setSelling(true);
    setError('');

    try {
      if (isFullSell) {
        // ── Full sell (existing logic) ──
        const { error: updateErr } = await supabase
          .from('paper_trades')
          .update({ exit_price: currentPrice, status: 'closed', sold_at: new Date().toISOString() })
          .eq('id', trade.id)
          .eq('status', 'open');
        if (updateErr) throw updateErr;

        const { data: pf, error: readErr } = await supabase
          .from('paper_portfolios').select('cash_balance').eq('user_id', session.user.id).single();
        if (readErr || !pf) throw readErr || new Error('Portfolio not found');

        const newCash = Number(pf.cash_balance) + saleValue;
        const { error: cashErr } = await supabase
          .from('paper_portfolios').update({ cash_balance: newCash }).eq('user_id', session.user.id);
        if (cashErr) throw cashErr;

        console.log(`[Challenge] Sold ${trade.ticker}: +$${saleValue.toFixed(2)}`);
      } else {
        // ── Partial sell ──

        // 1. Read fresh data with race guard
        const { data: fresh, error: freshErr } = await supabase
          .from('paper_trades')
          .select('shares, dollar_amount, status')
          .eq('id', trade.id)
          .single();
        if (freshErr) throw freshErr;
        if (fresh.status !== 'open') throw new Error('Trade already closed');

        const freshShares = Number(fresh.shares);
        if (sharesToSell >= freshShares - 0.0001) throw new Error('Cannot sell more than available shares');

        // 2. Compute split
        const remainingShares   = freshShares - sharesToSell;
        const costPerShare      = Number(fresh.dollar_amount) / freshShares;
        const soldDollarAmount  = costPerShare * sharesToSell;
        const remainDollarAmount = costPerShare * remainingShares;

        // 3. Close original row with sold portion
        const { error: closeErr } = await supabase
          .from('paper_trades')
          .update({
            shares: sharesToSell,
            dollar_amount: soldDollarAmount,
            exit_price: currentPrice,
            status: 'closed',
            sold_at: new Date().toISOString(),
          })
          .eq('id', trade.id)
          .eq('status', 'open');
        if (closeErr) throw closeErr;

        // 4. Insert new open row for remainder
        const { error: insertErr } = await supabase
          .from('paper_trades')
          .insert({
            user_id: session.user.id,
            ticker: trade.ticker,
            shares: remainingShares,
            dollar_amount: remainDollarAmount,
            entry_price: trade.entry_price,
            status: 'open',
            bought_at: trade.bought_at,
          });

        if (insertErr) {
          // 5. Rollback: reopen original row
          await supabase
            .from('paper_trades')
            .update({
              shares: freshShares,
              dollar_amount: fresh.dollar_amount,
              exit_price: null,
              status: 'open',
              sold_at: null,
            })
            .eq('id', trade.id);
          throw insertErr;
        }

        // 6. Credit cash
        const { data: pf, error: readErr } = await supabase
          .from('paper_portfolios').select('cash_balance').eq('user_id', session.user.id).single();
        if (readErr || !pf) throw readErr || new Error('Portfolio not found');

        const newCash = Number(pf.cash_balance) + saleValue;
        const { error: cashErr } = await supabase
          .from('paper_portfolios').update({ cash_balance: newCash }).eq('user_id', session.user.id);
        if (cashErr) throw cashErr;

        console.log(`[Challenge] Partial sell ${trade.ticker}: ${sharesToSell} of ${freshShares} shares, +$${saleValue.toFixed(2)}`);
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to sell. Try again.');
      setSelling(false);
    }
  };

  const btnLabel = selling
    ? 'Selling...'
    : isFullSell
      ? 'Sell All'
      : `Sell ${sharesToSell.toFixed(2)} shares ($${saleValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

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

        {/* Shares quantity selector */}
        <div style={styles.sellQtyLabel}>Shares to sell</div>
        <div style={styles.selectWrapper}>
          <select
            style={styles.sellQtySelect}
            value={selectedQty}
            onChange={e => setSelectedQty(e.target.value)}
          >
            <option value="all">All ({shares.toFixed(4)} shares)</option>
            {options.map(v => (
              <option key={v} value={String(v)}>
                {v % 1 === 0 ? v.toFixed(0) : v.toFixed(v < 1 ? 1 : 1)} shares
              </option>
            ))}
          </select>
          <span style={styles.selectArrow}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path d="M1 1l5 5 5-5" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>

        {/* % quick chips */}
        <div style={styles.chipRow}>
          {[25, 50, 75, 100].map(p => (
            <button
              key={p}
              style={chipActive(p) ? { ...styles.chip, ...styles.chipActive } : styles.chip}
              onClick={() => handleChip(p)}
            >
              {p}%
            </button>
          ))}
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
          {btnLabel}
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
  sellQtyLabel: { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  selectWrapper: { position: 'relative', marginBottom: 12 },
  sellQtySelect: {
    width: '100%', fontSize: 16, fontWeight: 600, color: 'var(--text1)',
    background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '12px 36px 12px 14px', appearance: 'none', WebkitAppearance: 'none',
    fontFamily: 'var(--font)', cursor: 'pointer',
  },
  selectArrow: {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },
  chipRow: {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16,
  },
  chip: {
    background: 'var(--card2)', color: 'var(--text2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 0', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  chipActive: {
    background: '#ef5350', color: '#fff', border: '1px solid #ef5350',
  },
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
