// ============================================
// UPTIKALERTS — BuyModal.jsx
// Bottom sheet: search ticker → enter amount → buy
// ============================================

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

export default function BuyModal({ session, cashBalance, onClose, onComplete }) {
  const [step, setStep] = useState('search'); // 'search' | 'amount'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // { symbol, name, price }
  const [amount, setAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef(null);
  const inputRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setResults([]);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(query)}&limit=5&apikey=${FMP_KEY}`
        );
        const data = await res.json();
        console.log('FMP search:', data);
        if (Array.isArray(data)) {
          setResults(data.filter(d => {
            const ex = (d.exchangeShortName || d.exchange || '').toUpperCase();
            return ex.includes('NYSE') || ex.includes('NASDAQ');
          }));
        }
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const handleSelect = async (item) => {
    setError('');
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/quote-short?symbol=${item.symbol}&apikey=${FMP_KEY}`
      );
      const data = await res.json();
      const price = Array.isArray(data) && data[0] ? data[0].price : null;
      if (!price) {
        setError("Couldn't fetch price. Try again.");
        return;
      }
      setSelected({ symbol: item.symbol, name: item.name, price });
      setStep('amount');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setError("Couldn't fetch price. Try again.");
    }
  };

  const dollarAmount = parseFloat(amount) || 0;
  const shares = selected?.price ? dollarAmount / selected.price : 0;
  const canBuy = dollarAmount > 0 && dollarAmount <= cashBalance && selected?.price;

  const handleBuy = async () => {
    if (!canBuy || buying) return;
    setBuying(true);
    setError('');

    try {
      // Fetch fresh cash balance to prevent race condition (stale React state)
      const { data: pf, error: pfErr } = await supabase
        .from('paper_portfolios')
        .select('cash_balance')
        .eq('user_id', session.user.id)
        .single();
      if (pfErr) throw pfErr;
      const freshCash = Number(pf.cash_balance);
      if (dollarAmount > freshCash) {
        setError(`Insufficient funds ($${freshCash.toFixed(2)} available)`);
        setBuying(false);
        return;
      }

      const { data: trade, error: insertErr } = await supabase.from('paper_trades').insert({
        user_id: session.user.id,
        ticker: selected.symbol,
        shares: shares,
        dollar_amount: dollarAmount,
        entry_price: selected.price,
        status: 'open',
        bought_at: new Date().toISOString(),
      }).select('id').single();
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: freshCash - dollarAmount })
        .eq('user_id', session.user.id);
      if (updateErr) {
        // Rollback: delete the trade if cash update failed
        await supabase.from('paper_trades').delete().eq('id', trade.id);
        throw updateErr;
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to buy. Try again.');
      setBuying(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.dragHandle} />

        {step === 'search' ? (
          <>
            <div style={styles.title}>Buy Stock</div>
            <input
              style={styles.input}
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              placeholder="Search ticker (e.g. AAPL)"
              autoFocus
            />
            {searching && <div style={styles.hint}>Searching...</div>}
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.resultsList}>
              {results.map(r => (
                <div key={r.symbol} style={styles.resultRow} onClick={() => handleSelect(r)}>
                  <div style={styles.resultTicker}>{r.symbol}</div>
                  <div style={styles.resultName}>{r.name}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <button style={styles.backBtn} onClick={() => { setStep('search'); setSelected(null); setAmount(''); setError(''); }}>
              Back
            </button>
            <div style={styles.title}>{selected.symbol}</div>
            <div style={styles.subtitle}>{selected.name}</div>
            <div style={styles.priceRow}>
              Current price: <span style={styles.priceVal}>${selected.price.toFixed(2)}</span>
            </div>

            <div style={styles.fieldLabel}>How much to invest?</div>
            <div style={styles.amountWrap}>
              <span style={styles.dollarSign}>$</span>
              <input
                ref={inputRef}
                style={styles.amountInput}
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {dollarAmount > 0 && selected.price > 0 && (
              <div style={styles.hint}>
                {shares.toFixed(4)} shares at ${selected.price.toFixed(2)}
              </div>
            )}
            {dollarAmount > cashBalance && (
              <div style={styles.error}>Exceeds cash balance (${cashBalance.toFixed(2)})</div>
            )}
            <div style={styles.cashLabel}>
              Available: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            {error && <div style={styles.error}>{error}</div>}

            <button
              style={{ ...styles.buyBtn, opacity: canBuy && !buying ? 1 : 0.4 }}
              onClick={handleBuy}
              disabled={!canBuy || buying}
            >
              {buying ? 'Buying...' : 'Buy'}
            </button>
          </>
        )}
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
    maxHeight: '85vh', overflowY: 'auto',
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2, background: 'var(--border)',
    margin: '0 auto 16px',
  },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginBottom: 4 },
  subtitle: { fontSize: 13, color: 'var(--text3)', marginBottom: 12 },
  input: {
    width: '100%', background: 'var(--card2)', border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '12px 14px', fontSize: 15, color: 'var(--text1)',
    fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box',
    marginBottom: 8,
  },
  resultsList: { marginTop: 4 },
  resultRow: {
    padding: '12px 10px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
  },
  resultTicker: { fontSize: 14, fontWeight: 700, color: 'var(--text1)', minWidth: 60 },
  resultName: { fontSize: 13, color: 'var(--text3)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--green)', fontSize: 13,
    fontWeight: 600, cursor: 'pointer', padding: '0 0 10px', fontFamily: 'var(--font)',
  },
  priceRow: { fontSize: 14, color: 'var(--text2)', marginBottom: 20 },
  priceVal: { fontWeight: 700, color: 'var(--text1)' },
  fieldLabel: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5, color: 'var(--text3)', marginBottom: 8,
  },
  amountWrap: {
    display: 'flex', alignItems: 'center', background: 'var(--card2)',
    border: '1.5px solid var(--border)', borderRadius: 10, padding: '0 14px',
    marginBottom: 6,
  },
  dollarSign: { fontSize: 18, fontWeight: 600, color: 'var(--text3)', marginRight: 4 },
  amountInput: {
    flex: 1, background: 'transparent', border: 'none', padding: '14px 0',
    fontSize: 20, fontWeight: 600, color: 'var(--text1)',
    fontFamily: 'var(--font)', outline: 'none',
  },
  hint: { fontSize: 13, color: 'var(--text3)', marginBottom: 4 },
  error: { fontSize: 12, color: '#ef5350', marginBottom: 6 },
  cashLabel: { fontSize: 12, color: 'var(--text3)', marginBottom: 18 },
  buyBtn: {
    width: '100%', background: '#3B6D11', color: '#fff', border: 'none',
    borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'opacity 0.15s',
  },
};
