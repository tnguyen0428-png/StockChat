// ============================================
// UPTIKALERTS — ListsTab.jsx
// Curated stock lists + personal watchlist
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function ListsTab({ session, profile, group, isAdmin }) {
  const isMod = isAdmin || profile?.group_members?.[0]?.role === 'moderator';

  const [view, setView]           = useState('curated');
  const [lists, setLists]         = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [expanded, setExpanded]   = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [watchlistError, setWatchlistError] = useState('');
  const [loading, setLoading]     = useState(false);
  const [addTickers, setAddTickers] = useState({});

  useEffect(() => {
    if (!group?.id) return;
    loadLists();
    loadWatchlist();
  }, [group?.id]);

  const loadLists = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('curated_lists')
      .select('*, curated_stocks(*)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });
    if (data) setLists(data);
    setLoading(false);
  };

  const loadWatchlist = async () => {
    const { data } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (data) setWatchlist(data);
  };

  // Realtime updates for curated lists
  useEffect(() => {
    if (!group?.id) return;
    const channel = supabase
      .channel(`lists_${group.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'curated_stocks',
      }, () => loadLists())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  // ── Expand / collapse stock card ──

  const handleExpand = (stock) => {
    if (expanded === stock.id) {
      setExpanded(null);
      return;
    }
    setExpanded(stock.id);
    setNotesDraft(stock.notes ?? '');
  };

  // ── Mod: stock management ──

  const handleAddStock = async (listId) => {
    const ticker = (addTickers[listId] || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!ticker) return;
    const list = lists.find(l => l.id === listId);
    const nextRank = list?.curated_stocks?.length
      ? Math.max(...list.curated_stocks.map(s => s.ranking)) + 1
      : 1;
    const { error } = await supabase.from('curated_stocks').insert({
      list_id: listId,
      ticker,
      ranking: nextRank,
    });
    if (!error) {
      setAddTickers(prev => ({ ...prev, [listId]: '' }));
      await loadLists();
    }
  };

  const handleDeleteStock = async (stock) => {
    if (!window.confirm(`Remove ${stock.ticker} from this list?`)) return;
    const { error: delErr } = await supabase.from('curated_stocks').delete().eq('id', stock.id);
    if (delErr) { console.error('[ListsTab] Delete stock failed:', delErr.message); return; }
    const list = lists.find(l => l.curated_stocks?.some(s => s.id === stock.id));
    const remaining = (list?.curated_stocks || [])
      .filter(s => s.id !== stock.id)
      .sort((a, b) => a.ranking - b.ranking);
    if (remaining.length) {
      const results = await Promise.all(
        remaining.map((s, i) =>
          supabase.from('curated_stocks').update({ ranking: i + 1 }).eq('id', s.id)
        )
      );
      results.forEach((r, i) => {
        if (r.error) console.error(`[ListsTab] Re-rank stock ${remaining[i].id} failed:`, r.error.message);
      });
    }
    if (expanded === stock.id) setExpanded(null);
    await loadLists();
  };

  const handleSaveStock = async (stockId) => {
    if (savingStock) return;
    setSavingStock(true);
    const { error } = await supabase
      .from('curated_stocks')
      .update({
        notes:      notesDraft || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockId);
    if (error) console.error('[ListsTab] Save stock failed:', error.message);
    setSavingStock(false);
    await loadLists();
  };

  // ── Personal watchlist ──

  const showWatchlistError = (msg) => {
    setWatchlistError(msg);
    setTimeout(() => setWatchlistError(''), 3000);
  };

  const addToWatchlist = async () => {
    const sym = newTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!sym || sym.length > 5) {
      showWatchlistError('Enter a valid ticker (1–5 letters).');
      return;
    }
    if (watchlist.find(w => w.symbol === sym)) {
      showWatchlistError(`${sym} is already in your watchlist.`);
      return;
    }
    console.log('[addToWatchlist] inserting:', sym, 'for user:', session.user.id);
    const { data, error } = await supabase
      .from('user_watchlist')
      .insert({ user_id: session.user.id, symbol: sym })
      .select()
      .single();
    console.log('[addToWatchlist] result — data:', data, 'error:', error);
    if (error) {
      showWatchlistError(error.message || 'Failed to add ticker. Please try again.');
      return;
    }
    if (data) {
      setWatchlist(prev => [data, ...prev]);
      setNewTicker('');
      setWatchlistError('');
    }
  };

  const removeFromWatchlist = async (id) => {
    const { error } = await supabase.from('user_watchlist').delete().eq('id', id);
    if (error) { console.error('[ListsTab] Remove watchlist failed:', error.message); return; }
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.wrap}>

      {/* View Toggle */}
      <div style={styles.toggle}>
        <button
          style={{ ...styles.toggleBtn, ...(view === 'curated' ? styles.toggleActive : {}) }}
          onClick={() => setView('curated')}
        >
          📋 Curated Lists
        </button>
        <button
          style={{ ...styles.toggleBtn, ...(view === 'watchlist' ? styles.toggleActive : {}) }}
          onClick={() => setView('watchlist')}
        >
          ⭐ My Watchlist
        </button>
      </div>

      <div style={styles.scroll}>

        {/* ── CURATED LISTS ── */}
        {view === 'curated' && (
          <>
            {lists.length === 0 && (
              <div style={styles.emptyWrap}>
                <div style={styles.emptyIcon}>📋</div>
                <div style={styles.emptyTitle}>No lists yet</div>
                <div style={styles.emptyText}>
                  Your moderator hasn't posted any curated lists yet.
                </div>
              </div>
            )}

            {lists.map(list => (
              <div key={list.id} style={{ marginBottom: 24 }}>

                <div style={styles.secLabel}>{list.name}</div>
                <div style={styles.slotsInfo}>
                  {list.curated_stocks?.length || 0} stocks
                </div>

                {/* Mod: add stock input — always visible at top */}
                {isMod && (
                  <div style={styles.addRow}>
                    <input
                      style={styles.addInput}
                      value={addTickers[list.id] || ''}
                      onChange={e => setAddTickers(prev => ({
                        ...prev,
                        [list.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                      }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddStock(list.id)}
                      placeholder="+ ADD TICKER"
                      maxLength={5}
                    />
                    <button style={styles.addBtn} onClick={() => handleAddStock(list.id)}>
                      Add
                    </button>
                  </div>
                )}

                {/* Stock items */}
                {list.curated_stocks
                  ?.sort((a, b) => a.ranking - b.ranking)
                  .map(stock => {
                    const isExpanded = expanded === stock.id;
                    return (
                      <div key={stock.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <div
                          style={{ ...styles.watchItem, borderBottom: 'none', cursor: 'pointer' }}
                          onClick={() => handleExpand(stock)}
                        >
                          <span style={styles.watchCheck}>✓</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ ...styles.watchTicker, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {stock.ticker}
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </div>
                          {isMod && (
                            <button
                              style={styles.removeBtn}
                              onClick={e => { e.stopPropagation(); handleDeleteStock(stock); }}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div style={styles.expandedBody}>
                            {isMod ? (
                              <>
                                <textarea
                                  style={styles.notesInput}
                                  value={notesDraft}
                                  onChange={e => setNotesDraft(e.target.value)}
                                  placeholder="Notes, catalysts, targets..."
                                />
                                <button
                                  style={{ ...styles.addBtn, width: '100%', opacity: savingStock ? 0.6 : 1 }}
                                  onClick={() => handleSaveStock(stock.id)}
                                  disabled={savingStock}
                                >
                                  {savingStock ? 'Saving...' : 'Save'}
                                </button>
                              </>
                            ) : (
                              <div style={styles.notesText}>
                                {stock.notes
                                  ? stock.notes
                                  : <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>No notes yet.</span>
                                }
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

              </div>
            ))}
          </>
        )}

        {/* ── PERSONAL WATCHLIST ── */}
        {view === 'watchlist' && (
          <>
            <div style={styles.secLabel}>My Personal Watchlist</div>
            <div style={styles.slotsInfo}>
              {watchlist.length} tickers added
            </div>

            <div style={styles.addRow}>
              <input
                style={styles.addInput}
                value={newTicker}
                onChange={e => setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
                placeholder="+ ADD TICKER"
                maxLength={5}
              />
              <button style={styles.addBtn} onClick={addToWatchlist}>Add</button>
            </div>

            {watchlistError && (
              <div style={styles.watchlistError}>{watchlistError}</div>
            )}

            {watchlist.length === 0 && (
              <div style={styles.emptyWrap}>
                <div style={styles.emptyIcon}>⭐</div>
                <div style={styles.emptyText}>Add tickers you want to track personally</div>
              </div>
            )}

            {watchlist.map(item => (
              <div key={item.id} style={styles.watchItem}>
                <span style={styles.watchCheck}>✓</span>
                <div>
                  <div style={styles.watchTicker}>{item.symbol}</div>
                  <div style={styles.watchDate}>Added {formatDate(item.created_at)}</div>
                </div>
                <button
                  style={styles.removeBtn}
                  onClick={() => removeFromWatchlist(item.id)}
                >
                  Remove
                </button>
              </div>
            ))}

            <div style={styles.shareHint}>
              💬 Type <strong>$TICKER</strong> in chat to share with the group
            </div>
          </>
        )}

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}

const styles = {
  // ── Layout ──
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  toggle: {
    display: 'flex', background: 'var(--card2)',
    borderRadius: 8, padding: 3, margin: '10px 12px 0',
    gap: 3, flexShrink: 0,
  },
  toggleBtn: {
    flex: 1, padding: '8px 0', borderRadius: 6,
    fontSize: 12, fontWeight: 500,
    color: 'var(--text2)', background: 'transparent',
    border: 'none', cursor: 'pointer', transition: 'all .15s',
  },
  toggleActive: {
    background: 'var(--card)', color: 'var(--text1)',
    fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '8px 12px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  loadingWrap: {
    flex: 1, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },

  // ── Section label ──
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px', margin: '10px 0 6px',
  },

  // ── Add row (shared: curated + watchlist) ──
  slotsInfo: { fontSize: 11, color: 'var(--text3)', marginBottom: 8, padding: '0 4px' },
  addRow:    { display: 'flex', gap: 8, marginBottom: 10 },
  addInput: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 14, fontWeight: 700,
    color: '#D4A017', fontFamily: 'var(--font)',
    outline: 'none', textTransform: 'uppercase',
    boxSizing: 'border-box',
  },
  addBtn: {
    background: 'var(--green)', color: '#fff',
    border: 'none', padding: '9px 16px',
    borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },

  watchlistError: {
    color: '#e05252', fontSize: 12, marginBottom: 8, marginTop: -4,
  },

  // ── Watch / stock items (shared style) ──
  watchItem: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '10px 0',
    borderBottom: '1px solid var(--border)',
    gap: 10,
  },
  watchCheck:  { color: '#1AAD5E', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  watchTicker: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  watchDate:   { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  removeBtn: {
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    flexShrink: 0,
  },

  // ── Expanded notes panel ──
  expandedBody: {
    padding: '8px 0 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  notesInput: {
    width: '100%',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 13, color: 'var(--text1)',
    fontFamily: 'var(--font)',
    resize: 'none', height: 72, lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  notesText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 },

  // ── Empty states ──
  emptyWrap:  { textAlign: 'center', padding: '30px 20px' },
  emptyIcon:  { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 },

  // ── Watchlist footer hint ──
  shareHint: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.2)',
    borderRadius: 8, padding: '10px 12px',
    fontSize: 12, color: 'var(--text2)',
    lineHeight: 1.5, marginTop: 14,
  },
};
