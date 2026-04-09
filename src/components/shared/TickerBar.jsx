// ============================================
// UPTIKALERTS — TickerBar.jsx
// Moderator controlled scrolling ticker bar
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { polyFetch } from '../../lib/polygonClient';
import { isWeekend, isMarketHoliday } from '../../utils/marketUtils';

export default function TickerBar({ isAdmin, groupId }) {
  const [tickers, setTickers]     = useState([]);
  const [prices, setPrices]       = useState({});
  const [editing, setEditing]     = useState(false);
  const [newTicker, setNewTicker] = useState('');

  // Load tickers from Supabase
  useEffect(() => {
    if (!groupId) return;

    const loadTickers = async () => {
      const { data } = await supabase
        .from('group_tickers')
        .select('symbol')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (data) setTickers(data.map(t => t.symbol));
    };

    loadTickers();

    // Realtime updates
    const channel = supabase
      .channel(`tickers_${groupId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_tickers',
        filter: `group_id=eq.${groupId}`,
      }, () => loadTickers())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [groupId]);

  // Fetch prices from Polygon.io
  useEffect(() => {
    if (!tickers.length) return;

    const fetchPrices = async () => {
      if (isWeekend() || isMarketHoliday()) return;
      const results = {};

      for (let i = 0; i < tickers.length; i += 20) {
        if (i > 0) await new Promise(r => setTimeout(r, 1000));
        const batch = tickers.slice(i, i + 20);
        try {
          const data = await polyFetch(
            `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}`
          );
          (data.tickers || []).forEach(t => {
            results[t.ticker] = {
              price: t.day?.c || t.prevDay?.c || 0,
              change: t.todaysChange || 0,
              changePct: t.todaysChangePerc || 0,
            };
          });
        } catch {}
      }

      setPrices(results);
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5 * 60 * 1000); // refresh every 5 mins
    return () => clearInterval(interval);
  }, [tickers]);

  const addTicker = async () => {
    const sym = newTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!sym || sym.length > 5 || tickers.includes(sym)) return;
    const { error } = await supabase.from('group_tickers').insert({ group_id: groupId, symbol: sym });
    if (error) { console.error('[TickerBar] Add ticker failed:', error.message); return; }
    setNewTicker('');
  };

  const removeTicker = async (sym) => {
    const { error } = await supabase.from('group_tickers').delete()
      .eq('group_id', groupId)
      .eq('symbol', sym);
    if (error) console.error('[TickerBar] Remove ticker failed:', error.message);
  };

  if (!tickers.length && !isAdmin) return null;

  const tickerItems = tickers.map(sym => {
    const p = prices[sym];
    const positive = p ? p.changePct >= 0 : true;
    return (
      <span key={sym} style={styles.item}>
        <span style={styles.sym}>{sym}</span>
        {p && (
          <>
            <span style={styles.price}>${p.price.toFixed(2)}</span>
            <span style={{ ...styles.change, color: positive ? 'var(--green)' : 'var(--red)' }}>
              {positive ? '▲' : '▼'}{Math.abs(p.changePct).toFixed(2)}%
            </span>
          </>
        )}
        <span style={styles.sep}>•</span>
      </span>
    );
  });

  return (
    <div style={styles.wrap}>

      {/* Label row */}
      <div style={styles.labelRow}>
        <span style={styles.labelTxt}>📌 Watch List</span>
        {isAdmin && (
          <button style={styles.editBtn} onClick={() => setEditing(e => !e)}>
            {editing ? '✓ Done' : '⚙️ Edit'}
          </button>
        )}
      </div>

      {/* Scrolling ticker */}
      {tickers.length > 0 && (
        <div style={styles.scrollArea}>
          <div style={styles.track}>
            {tickerItems}
            {tickerItems}
          </div>
        </div>
      )}

      {tickers.length === 0 && isAdmin && (
        <div style={styles.emptyTicker}>Add tickers below to show in watch list</div>
      )}

      {/* Admin edit panel */}
      {editing && isAdmin && (
        <div style={styles.editPanel}>
          <div style={styles.editRow}>
            <input
              style={styles.editInput}
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && addTicker()}
              placeholder="ADD TICKER"
              maxLength={5}
            />
            <button style={styles.addBtn} onClick={addTicker}>+ Add</button>
          </div>
          <div style={styles.tagRow}>
            {tickers.map(sym => (
              <div key={sym} style={styles.tag}>
                {sym}
                <span style={styles.tagRemove} onClick={() => removeTicker(sym)}>✕</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  wrap: {
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 12px 2px',
    borderBottom: '1px solid var(--border)',
  },
  labelTxt: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'var(--text3)',
  },
  editBtn: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--green)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  scrollArea: {
    padding: '8px 0',
    overflow: 'hidden',
  },
  track: {
    display: 'inline-flex',
    whiteSpace: 'nowrap',
    animation: 'tickerScroll 25s linear infinite',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
  },
  sym: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text1)',
  },
  price: {
    fontSize: 13,
    color: 'var(--text2)',
  },
  change: {
    fontSize: 13,
  },
  sep: {
    color: 'var(--border)',
    fontSize: 16,
    marginLeft: 6,
  },
  emptyTicker: {
    fontSize: 12,
    color: 'var(--text3)',
    padding: '8px 12px',
    textAlign: 'center',
  },
  editPanel: {
    background: 'var(--card2)',
    borderTop: '1px solid var(--border)',
    padding: '10px 12px',
  },
  editRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
  },
  editInput: {
    flex: 1,
    background: 'var(--card)',
    border: '1.5px solid var(--border)',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 14,
    fontWeight: 700,
    color: '#D4A017',
    fontFamily: 'var(--font)',
    outline: 'none',
    textTransform: 'uppercase',
  },
  addBtn: {
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tagRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text1)',
  },
  tagRemove: {
    color: 'var(--red)',
    fontSize: 11,
    cursor: 'pointer',
  },
};
