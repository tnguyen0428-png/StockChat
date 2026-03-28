// ============================================
// UPTIKALERTS — MarketIndicators.jsx
// Horizontal scrollable market indicator cards
// Admin-editable via market_indicators table
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const REFRESH_INTERVAL = 60000;

const DEFAULTS = [
  { ticker: 'SPY',  label: 'S&P 500', position: 1, is_vix_style: false },
  { ticker: 'QQQ',  label: 'NASDAQ',  position: 2, is_vix_style: false },
  { ticker: 'DIA',  label: 'DOW',     position: 3, is_vix_style: false },
  { ticker: 'VIXY', label: 'VIX',     position: 4, is_vix_style: true  },
  { ticker: 'GLD',  label: 'GOLD',    position: 5, is_vix_style: false },
  { ticker: 'SLV',  label: 'SILVER',  position: 6, is_vix_style: false },
];

export default function MarketIndicators({ isAdmin }) {
  const [indicators, setIndicators] = useState(DEFAULTS);
  const [quotes, setQuotes]         = useState({});
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState(false);
  const [editData, setEditData]     = useState([]);
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  // Load indicators from DB on mount
  useEffect(() => {
    loadIndicators();
  }, []);

  const loadIndicators = async () => {
    const { data } = await supabase
      .from('market_indicators')
      .select('*')
      .order('position', { ascending: true });
    if (data && data.length > 0) setIndicators(data);
  };

  // Fetch quotes whenever indicators list changes
  useEffect(() => {
    if (!indicators.length) return;
    let mounted = true;

    const fetchQuotes = async () => {
      const tickers = indicators.map(i => i.ticker).join(',');
      try {
        const res = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}&apiKey=${POLYGON_KEY}`
        );
        const data = await res.json();

        if (data.tickers && data.tickers.length > 0) {
          const map = {};
          data.tickers.forEach(t => {
            map[t.ticker] = {
              price:         t.day?.c           || t.prevDay?.c || 0,
              change:        t.todaysChange      || 0,
              changePercent: t.todaysChangePerc  || 0,
            };
          });
          if (mounted) setQuotes(map);
        } else {
          const map = await fetchPrevDay(indicators.map(i => i.ticker));
          if (mounted) setQuotes(map);
        }
      } catch {
        const map = await fetchPrevDay(indicators.map(i => i.ticker));
        if (mounted) setQuotes(map);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, REFRESH_INTERVAL);
    return () => { mounted = false; clearInterval(interval); };
  }, [indicators]);

  // ── Admin edit handlers ──

  const openEdit = () => {
    setEditData(indicators.map(ind => ({ ...ind })));
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const updateItem = (index, field, value) => {
    setEditData(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const addItem = () => {
    setEditData(prev => [...prev, {
      _tempId: Date.now(),
      ticker: '',
      label: '',
      position: prev.length + 1,
      is_vix_style: false,
    }]);
  };

  const removeItem = (index) => {
    setEditData(prev =>
      prev.filter((_, i) => i !== index)
          .map((item, i) => ({ ...item, position: i + 1 }))
    );
  };

  const saveIndicators = async () => {
    const valid = editData
      .filter(item => item.ticker.trim() && item.label.trim())
      .map((item, i) => ({
        ticker:       item.ticker.trim().toUpperCase(),
        label:        item.label.trim(),
        position:     i + 1,
        is_vix_style: item.is_vix_style || false,
      }));

    if (!valid.length) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      // Clear existing rows then insert fresh set
      await supabase.from('market_indicators').delete().gte('position', 0);
      const { data, error } = await supabase
        .from('market_indicators')
        .insert(valid)
        .select();

      if (error) throw error;

      // Sort by position in JS since .order() can't chain after insert
      const sorted = (data || []).sort((a, b) => a.position - b.position);
      setIndicators(sorted);
      setSaveStatus('success');
      setTimeout(() => {
        setEditing(false);
        setSaveStatus(null);
      }, 800);
    } catch (err) {
      console.error('Save indicators error:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──

  if (loading) {
    return (
      <div style={styles.wrap}>
        <div style={styles.row}>
          {indicators.map((_, i) => <div key={i} style={styles.skeleton} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>

      {/* Header row — edit button for admins */}
      <div style={styles.headerRow}>
        <span style={styles.sectionLabel}>Market</span>
        {isAdmin && (
          <button style={styles.editBtn} onClick={editing ? cancelEdit : openEdit}>
            {editing ? 'Cancel' : '✎ Edit'}
          </button>
        )}
      </div>

      {/* Indicator cards */}
      <div style={styles.row}>
        {indicators.map(ind => {
          const q = quotes[ind.ticker];
          const pct = q?.changePercent ?? 0;
          const isPositive = ind.is_vix_style ? pct < 0 : pct >= 0;
          const accentColor = isPositive ? 'var(--green)' : 'var(--red)';

          return (
            <div key={ind.ticker} style={styles.card}>
              <div style={styles.cardLabel}>{ind.label}</div>
              {q ? (
                <>
                  <div style={styles.price}>${q.price.toFixed(2)}</div>
                  <div style={{ ...styles.change, color: accentColor }}>
                    {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                  </div>
                </>
              ) : (
                <div style={styles.noData}>—</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Admin edit panel */}
      {editing && (
        <div style={styles.editPanel}>

          {/* Column headers */}
          <div style={styles.editHeader}>
            <span style={{ ...styles.editHeaderLabel, flex: 1 }}>Display Name</span>
            <span style={{ ...styles.editHeaderLabel, flex: '0 0 58px' }}>Ticker</span>
            <span style={{ ...styles.editHeaderLabel, flex: '0 0 62px', textAlign: 'center' }}>Invert ↕</span>
            <span style={{ width: 24 }} />
          </div>

          {/* Indicator rows */}
          {editData.map((item, i) => (
            <div key={item.id || item._tempId || i} style={styles.editRow}>

              <input
                style={styles.editInput}
                value={item.label}
                onChange={e => updateItem(i, 'label', e.target.value)}
                placeholder="e.g. S&P 500"
              />

              <input
                style={{ ...styles.editInput, ...styles.tickerInput }}
                value={item.ticker}
                onChange={e => updateItem(i, 'ticker', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                placeholder="SPY"
                maxLength={5}
              />

              {/* Invert colors toggle — for VIX-style tickers where down = good */}
              <div style={styles.toggleWrap} onClick={() => updateItem(i, 'is_vix_style', !item.is_vix_style)}>
                <div style={{
                  ...styles.toggle,
                  background: item.is_vix_style ? 'var(--green)' : 'var(--border)',
                }}>
                  <div style={{
                    ...styles.toggleKnob,
                    left: item.is_vix_style ? 'auto' : 2,
                    right: item.is_vix_style ? 2 : 'auto',
                  }} />
                </div>
              </div>

              <button style={styles.deleteBtn} onClick={() => removeItem(i)}>✕</button>

            </div>
          ))}

          {/* Invert hint */}
          <div style={styles.invertHint}>
            ↕ Invert = green when price drops (use for VIX/volatility tickers)
          </div>

          {/* Status message */}
          {saveStatus === 'error' && (
            <div style={styles.statusError}>Failed to save. Check your connection and try again.</div>
          )}
          {saveStatus === 'success' && (
            <div style={styles.statusSuccess}>✓ Saved successfully</div>
          )}

          {/* Actions */}
          <div style={styles.editActions}>
            <button style={styles.addBtn} onClick={addItem}>+ Add Indicator</button>
            <button
              style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
              onClick={saveIndicators}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

        </div>
      )}

    </div>
  );
}

async function fetchPrevDay(tickers) {
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const res = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      const r = data.results?.[0];
      if (!r) return [ticker, null];
      const change = r.c - r.o;
      const changePercent = (change / r.o) * 100;
      return [ticker, { price: r.c, change, changePercent }];
    })
  );

  const map = {};
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value[1]) {
      map[r.value[0]] = r.value[1];
    }
  });
  return map;
}

const styles = {
  wrap: {
    marginBottom: 4,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 4px 4px',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)',
  },
  editBtn: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--green)', background: 'none',
    border: 'none', cursor: 'pointer',
  },
  row: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    paddingBottom: 4,
    scrollbarWidth: 'none',
  },
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '8px 10px',
    minWidth: 90,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  skeleton: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    minWidth: 90,
    height: 62,
    flexShrink: 0,
    opacity: 0.5,
  },
  cardLabel: {
    fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    color: 'var(--text3)',
  },
  price: {
    fontSize: 13, fontWeight: 700,
    color: 'var(--text1)',
  },
  change: {
    fontSize: 11, fontWeight: 600,
  },
  noData: {
    fontSize: 13, color: 'var(--text3)',
  },
  editPanel: {
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  editHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
    borderBottom: '1px solid var(--border)',
  },
  editHeaderLabel: {
    fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    color: 'var(--text3)',
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  editInput: {
    flex: 1,
    background: 'var(--card)',
    border: '1.5px solid var(--border)',
    borderRadius: 7,
    padding: '6px 10px',
    fontSize: 13,
    color: 'var(--text1)',
    fontFamily: 'var(--font)',
  },
  tickerInput: {
    flex: '0 0 58px',
    fontWeight: 700,
    color: 'var(--green)',
    textTransform: 'uppercase',
  },
  toggleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    flexShrink: 0,
  },
  toggle: {
    width: 32, height: 18,
    borderRadius: 9,
    position: 'relative',
    transition: 'background 0.2s',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2, width: 14, height: 14,
    background: '#fff',
    borderRadius: '50%',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  invertHint: {
    fontSize: 10, color: 'var(--text3)',
    lineHeight: 1.5, paddingTop: 2,
  },
  statusError: {
    fontSize: 12, color: 'var(--red)',
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    borderRadius: 6, padding: '6px 10px',
  },
  statusSuccess: {
    fontSize: 12, color: 'var(--green)',
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.2)',
    borderRadius: 6, padding: '6px 10px',
  },
  deleteBtn: {
    background: 'none', border: 'none',
    color: 'var(--red)', fontSize: 13,
    cursor: 'pointer', flexShrink: 0,
    padding: '4px 2px',
  },
  editActions: {
    display: 'flex',
    gap: 8,
    marginTop: 2,
  },
  addBtn: {
    flex: 1,
    background: 'var(--card)',
    border: '1.5px dashed var(--border)',
    borderRadius: 8,
    padding: '7px 0',
    fontSize: 12, fontWeight: 600,
    color: 'var(--text2)',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    background: 'var(--green)',
    border: 'none',
    borderRadius: 8,
    padding: '7px 0',
    fontSize: 12, fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
