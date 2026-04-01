// ============================================
// UPTIKALERTS — ChatTab.jsx
// Group view: Chat / Lists / Watchlist sub-tabs
// ============================================

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { scoreTicker } from '../../lib/screener';
import { useGroup } from '../../context/GroupContext';
import { askUpTikAI } from '../../lib/aiAgent';
import FadingMessage from '../shared/FadingMessage';
import TickerBanner from './TickerBanner';

const EMOJIS = ['🔥','📈','📉','🚀','💪','🎯','👀','💰','⚠️','✅','❌','😎','🤔','👋','🙌','😂','💎','🐂','🐻','⏰'];

// ── Message Item ──
const MessageItem = memo(({ msg, currentUserId }) => {
  const isAdmin = msg.is_admin;
  const isAI    = msg.user_id === 'user_ai';

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const parseText = (text) => {
    const parts = text.split(/(\$[A-Z]{1,5})/g);
    return parts.map((part, i) =>
      /^\$[A-Z]{1,5}$/.test(part)
        ? <span key={i} style={styles.tickerMention}>{part}</span>
        : part
    );
  };

  const bodyStyle = {
    ...styles.msgBody,
    ...(isAdmin ? styles.adminBody : {}),
    ...(isAI    ? styles.aiBody    : {}),
  };

  return (
    <div style={styles.msg}>
      <div style={bodyStyle}>
        <div style={styles.msgTop}>
          <span style={{ ...styles.msgName, color: isAI ? '#8B5CF6' : (msg.user_color || '#1AAD5E') }}>
            {msg.username}
          </span>
          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
          {isAI    && <span style={styles.aiBadge}>AI</span>}
          <span style={styles.msgTime}>{formatTime(msg.created_at)}</span>
        </div>
        <div style={styles.msgText}>{parseText(msg.text)}</div>
      </div>
    </div>
  );
});

// ── Broadcast helpers ──
function detectBroadcastType(text) {
  const lower = text.toLowerCase();
  const word = (w) => new RegExp(`\\b${w}\\b`).test(lower);
  const bullish   = ['buy','call','calls','bullish','long','breakout','moon','rocket','rip','squeeze','rally','pump'];
  const bearish   = ['sell','put','puts','bearish','short','dump','crash','drop','fade','tank'];
  const watchlist = ['watch','watching','monitor','tracking','wait'];
  if (bullish.some(w => word(w)))   return 'BULLISH';
  if (bearish.some(w => word(w)))   return 'BEARISH';
  if (watchlist.some(w => word(w)) || lower.includes('eye on')) return 'WATCHLIST';
  return 'INFO';
}

function broadcastColor(type) {
  const colors = { BULLISH: '#1AAD5E', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
  return colors[type] || '#1AAD5E';
}

// ── Lists sub-view ──
function ListsView({ group, isAdmin, isModerator, isOpenList }) {
  const isMod = isAdmin || isModerator || isOpenList;
  const [lists, setLists]       = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [addTickers, setAddTickers]   = useState({});
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!group?.id) return;
    loadLists();
    const channel = supabase
      .channel(`lists_${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'curated_stocks' }, loadLists)
      .subscribe();
    return () => supabase.removeChannel(channel);
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

  const handleExpand = (stock) => {
    if (expanded === stock.id) { setExpanded(null); return; }
    setExpanded(stock.id);
    setNotesDraft(stock.notes ?? '');
  };

  const handleAddStock = async (listId) => {
    const ticker = (addTickers[listId] || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!ticker) return;
    const list = lists.find(l => l.id === listId);
    const nextRank = list?.curated_stocks?.length
      ? Math.max(...list.curated_stocks.map(s => s.ranking)) + 1 : 1;

    // Score the ticker automatically
    let score = 0;
    let notes = null;
    let thesis = null;
    try {
      const result = await scoreTicker(ticker);
      if (result) {
        score = result.score;
        thesis = result.thesis;
        notes = `P/E: ${result.pe?.toFixed(1) || 'N/A'} · PEG: ${result.peg?.toFixed(2) || 'N/A'} · Net Margin: ${result.netMargin ? (result.netMargin * 100).toFixed(1) + '%' : 'N/A'} · Sales Growth: ${result.salesGrowth != null ? result.salesGrowth + '%' : 'N/A'} · EPS Growth: ${result.epsGrowth != null ? result.epsGrowth + '%' : 'N/A'} · Beat Rate: ${result.beatRate != null ? result.beatRate + '%' : 'N/A'}`;
      }
    } catch {}

    const { error } = await supabase.from('curated_stocks').insert({
      list_id: listId,
      ticker,
      ranking: nextRank,
      score,
      notes,
      thesis,
    });
    if (!error) {
      setAddTickers(prev => ({ ...prev, [listId]: '' }));
      await loadLists();
    }
  };

  const handleDeleteStock = async (stock) => {
    if (!window.confirm(`Remove ${stock.ticker}?`)) return;
    await supabase.from('curated_stocks').delete().eq('id', stock.id);
    if (expanded === stock.id) setExpanded(null);
    await loadLists();
  };

  const handleSaveStock = async (stockId) => {
    if (savingStock) return;
    setSavingStock(true);
    await supabase.from('curated_stocks').update({ notes: notesDraft || null, updated_at: new Date().toISOString() }).eq('id', stockId);
    setSavingStock(false);
    await loadLists();
  };

  if (loading) return <div style={styles.loadingWrap}><div style={styles.spinner} /></div>;

  return (
    <div style={styles.subScroll}>
      {lists.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyText}>No curated lists yet</div>
        </div>
      )}
      {lists.map(list => (
        <div key={list.id} style={{ marginBottom: 20 }}>
          <div style={styles.secLabel}>{list.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            {['Earnings 30%','Fundamentals 25%','Sales Growth 20%','Valuation 10%','Price Trend 10%','Market Cap 5%'].map(item => (
              <span key={item} style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', marginRight: 3, verticalAlign: 'middle' }} />
                {item}
              </span>
            ))}
          </div>
          {isMod && (
            <div style={styles.addRow}>
              <input
                style={styles.addInput}
                value={addTickers[list.id] || ''}
                onChange={e => setAddTickers(prev => ({ ...prev, [list.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
                onKeyDown={e => e.key === 'Enter' && handleAddStock(list.id)}
                placeholder="ADD TICKER"
                maxLength={5}
              />
              <button style={styles.addBtn} onClick={() => handleAddStock(list.id)}>Add</button>
            </div>
          )}
          {list.curated_stocks?.sort((a, b) => a.ranking - b.ranking).map(stock => {
            const isExpanded = expanded === stock.id;
            return (
              <div key={stock.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ ...styles.listItem, cursor: 'pointer' }} onClick={() => handleExpand(stock)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', minWidth: 20 }}>#{stock.ranking}</span>
                    <img
                      src={`https://images.financialmodelingprep.com/symbol/${stock.ticker}.png`}
                      alt={stock.ticker}
                      style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: 'var(--card2)', border: '0.5px solid var(--border)', flexShrink: 0 }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>{stock.ticker}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--card2)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0, marginRight: 8 }}>{stock.score}</span>
                  </div>
                  {isMod && (
                    <button style={styles.removeBtn} onClick={e => { e.stopPropagation(); handleDeleteStock(stock); }}>
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
                        {stock.notes || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>No notes yet.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Watchlist sub-view (global — no group filter) ──
function WatchlistView({ session }) {
  const [watchlist, setWatchlist] = useState([]);
  const [newTicker, setNewTicker] = useState('');

  useEffect(() => {
    loadWatchlist();
  }, [session?.user?.id]);

  const loadWatchlist = async () => {
    const { data } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (data) setWatchlist(data);
  };

  const addToWatchlist = async () => {
    const sym = newTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!sym || sym.length > 5) return;
    if (watchlist.find(w => w.symbol === sym)) return;
    const { data } = await supabase
      .from('user_watchlist')
      .insert({ user_id: session.user.id, symbol: sym })
      .select()
      .single();
    if (data) { setWatchlist(prev => [data, ...prev]); setNewTicker(''); }
  };

  const removeFromWatchlist = async (id) => {
    await supabase.from('user_watchlist').delete().eq('id', id);
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={styles.subScroll}>
      <div style={styles.secLabel}>My Watchlist · {watchlist.length} tickers</div>
      <div style={styles.addRow}>
        <input
          style={styles.addInput}
          value={newTicker}
          onChange={e => setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
          placeholder="ADD TICKER"
          maxLength={5}
        />
        <button style={styles.addBtn} onClick={addToWatchlist}>Add</button>
      </div>
      {watchlist.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyText}>Add tickers you want to track personally</div>
        </div>
      )}
      {watchlist.map(item => (
        <div key={item.id} style={styles.listItem}>
          <div style={{ flex: 1 }}>
            <div style={styles.listTicker}>{item.symbol}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Added {formatDate(item.created_at)}</div>
          </div>
          <button style={styles.removeBtn} onClick={() => removeFromWatchlist(item.id)}>Remove</button>
        </div>
      ))}
      <div style={styles.watchHint}>
        Type $TICKER in chat to share with the group
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Main ChatTab ──
export default function ChatTab({ session, profile, group, isAdmin, isModerator, setUnreadChat }) {
  const { activeGroup } = useGroup();
  const [watchlist, setWatchlist] = useState([]);
  const [subTab, setSubTab]         = useState('chat');
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiLastTicker, setAiLastTicker] = useState(null);
  const [aiMode, setAiMode]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.user.id)
      .then(({ data }) => { if (data) setWatchlist(data.map(w => w.symbol)); });
  }, [session?.user?.id]);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText]           = useState('');
  const [sendingBroadcast, setSendingBroadcast]     = useState(false);

  useEffect(() => {
    if (!group?.id) return;
    const loadMessages = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true })
        .limit(100);
      if (data) setMessages(data.filter(m => m.type !== 'ai' && !/@AI\b/i.test(m.text)));
      setLoading(false);
    };
    loadMessages();

    const channel = supabase
      .channel(`chat_${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${group.id}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setUnreadChat(true);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const callAI = useCallback(async (query) => {
    setAiLoading(true);
    try {
      const recentHistory = messages
        .filter(m => m.type === 'user' || m.type === 'ai')
        .slice(-10)
        .map(m => ({
          role: m.user_id === 'user_ai' ? 'assistant' : 'user',
          content: m.text,
        }));

      const { text, newLastTicker } = await askUpTikAI({
        userText: query,
        history: recentHistory,
        lastTicker: aiLastTicker,
        username: profile?.username,
        groupName: activeGroup?.name,
        watchlist,
      });
      setAiLastTicker(newLastTicker);
      await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik AI', user_color: '#8B5CF6',
        text, type: 'ai', is_admin: false,
      });
    } catch(err) {
      console.error('UpTik AI error:', err.message, err);
      await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik AI', user_color: '#8B5CF6',
        text: `Error: ${err.message}`,
        type: 'ai', is_admin: false,
      });
    } finally {
      setAiLoading(false);
    }
  }, [group?.id, activeGroup?.name, profile?.username, watchlist, messages, aiLastTicker]);

  const handleSend = useCallback(async () => {
    const text = aiMode ? `@AI ${inputText.trim()}` : inputText.trim();
    if (!inputText.trim() || !profile || !group) return;
    setInputText('');
    setShowEmoji(false);
    setAiMode(false);
    inputRef.current?.focus();
    const { data, error } = await supabase.from('chat_messages').insert({
      group_id: group.id, user_id: session.user.id,
      username: profile.username, user_color: profile.color,
      text, type: 'user', is_admin: isAdmin,
    }).select().single();
    if (data) setMessages(prev => [...prev, data]);
    if (!error && /@AI\b/i.test(text)) {
      const query = text.replace(/@AI\b/gi, '').trim() || text;
      await callAI(query);
    }
  }, [inputText, aiMode, profile, group, isAdmin, callAI, session]);

  const sendBroadcast = async () => {
    if (!broadcastText.trim() || sendingBroadcast) return;
    setSendingBroadcast(true);
    if (isAdmin) {
      const { data: allGroups } = await supabase.from('groups').select('id');
      if (allGroups?.length) {
        await supabase.from('broadcasts').insert(
          allGroups.map(g => ({ group_id: g.id, title: broadcastText.trim(), type: 'INFO', sent_by: profile.username, is_mod_alert: false }))
        );
      }
    } else {
      const type = detectBroadcastType(broadcastText);
      await supabase.from('broadcasts').insert({
        group_id: group.id, title: broadcastText.trim(),
        type, sent_by: profile.username, is_mod_alert: true,
      });
    }
    setBroadcastText('');
    setSendingBroadcast(false);
    setShowBroadcastModal(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const addEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (!group) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.emptyText}>Select a group from the Home tab to start chatting.</div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>

      {/* Ticker Banner */}
      <TickerBanner groupId={group.id} />

      {/* Sub-tabs */}
      <div style={styles.subTabRow}>
        {['chat', 'lists', 'watchlist'].map(t => (
          <div
            key={t}
            style={{ ...styles.subTab, ...(subTab === t ? styles.subTabActive : {}) }}
            onClick={() => setSubTab(t)}
          >
            {t === 'chat' ? 'Chat' : t === 'lists' ? 'Lists' : 'Watchlist'}
          </div>
        ))}
      </div>

      {/* Lists view */}
      {subTab === 'lists' && (
        <ListsView group={group} isAdmin={isAdmin} isModerator={isModerator} isOpenList={group?.name === 'UpTik Public'} />
      )}

      {/* Watchlist view */}
      {subTab === 'watchlist' && (
        <WatchlistView session={session} />
      )}

      {/* Chat view */}
      {subTab === 'chat' && (
        <>
          {loading ? (
            <div style={styles.loadingWrap}>
              <div style={styles.spinner} />
            </div>
          ) : (
            <div style={styles.messagesArea}>
              {messages.length === 0 && (
                <div style={styles.emptyState}>
                  <div style={styles.emptyText}>No messages yet — say hello!</div>
                </div>
              )}
              {messages.map(msg => {
                const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
                const isAIQuestion = msg.type === 'user' && /@AI\b/i.test(msg.text);
                if (isAI || isAIQuestion) {
                  return (
                    <FadingMessage key={msg.id} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                      <MessageItem msg={msg} currentUserId={session?.user?.id} />
                    </FadingMessage>
                  );
                }
                return <MessageItem key={msg.id} msg={msg} currentUserId={session?.user?.id} />;
              })}
              {aiLoading && (
                <div style={styles.aiLoading}>
                  <span style={{ color: '#8B5CF6', fontSize: 14 }}>AI is analyzing</span>
                  <div style={styles.aiDots}>
                    {[0,1,2].map(i => <div key={i} style={{ ...styles.aiDot, animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {showEmoji && (
            <div style={styles.emojiBar}>
              {EMOJIS.map(e => (
                <button key={e} style={styles.emojiBtn} onClick={() => addEmoji(e)}>{e}</button>
              ))}
            </div>
          )}

          <div style={styles.inputBar}>
            {(isAdmin || isModerator) && (
              <button style={styles.broadcastBtn} onClick={() => setShowBroadcastModal(true)}>BC</button>
            )}
            <input
              ref={inputRef}
              style={{ ...styles.input, borderColor: aiMode ? '#8B5CF6' : 'var(--border)' }}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={aiMode ? 'Ask UpTik AI...' : 'Message... $TICKER or @AI'}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
            />
            <button
              style={{
                background: aiMode ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'var(--card2)',
                border: aiMode ? 'none' : '1px solid var(--border)',
                borderRadius: 8, padding: '5px 9px',
                fontSize: 11, fontWeight: 700,
                color: aiMode ? '#fff' : 'var(--text3)',
                cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                transition: 'all 0.15s',
              }}
              onClick={() => { setAiMode(prev => !prev); inputRef.current?.focus(); }}
            >
              AI
            </button>
            <button
              style={{ ...styles.sendBtn, opacity: inputText.trim() ? 1 : 0.4 }}
              onClick={handleSend}
              disabled={!inputText.trim()}
            >
              ➤
            </button>
          </div>
        </>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div style={styles.modalOverlay} onClick={() => setShowBroadcastModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {isAdmin ? 'Broadcast to All Groups' : 'Send Group Alert'}
            </div>
            <textarea
              style={styles.modalInput}
              placeholder="e.g. AAPL breaking out, calls looking good"
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBroadcast(); } }}
              rows={3}
              autoFocus
            />
            {!isAdmin && (
              <div style={styles.typePreview}>
                Type: <strong style={{ color: broadcastColor(detectBroadcastType(broadcastText || '')) }}>
                  {detectBroadcastType(broadcastText || '')}
                </strong>
              </div>
            )}
            <button
              style={{ ...styles.modalSendBtn, opacity: sendingBroadcast || !broadcastText.trim() ? 0.6 : 1 }}
              onClick={sendBroadcast}
              disabled={sendingBroadcast || !broadcastText.trim()}
            >
              {sendingBroadcast ? 'Sending...' : isAdmin ? 'Send to All Groups' : 'Send to Group'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Styles ──
const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  subTabRow: {
    display: 'flex', borderBottom: '1px solid var(--border)',
    background: 'var(--card)', flexShrink: 0,
  },
  subTab: {
    flex: 1, textAlign: 'center', padding: '10px 0',
    fontSize: 13, color: 'var(--text3)',
    borderBottom: '2px solid transparent', cursor: 'pointer',
  },
  subTabActive: {
    color: 'var(--text1)', fontWeight: 600,
    borderBottomColor: 'var(--green)',
  },
  subScroll: {
    flex: 1, overflowY: 'auto',
    padding: '8px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px',
    margin: '10px 0 8px',
  },
  addRow: { display: 'flex', gap: 8, marginBottom: 10 },
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
  listItem: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '10px 0',
    borderBottom: '1px solid var(--border)', gap: 10,
  },
  listTicker: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  removeBtn: {
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    flexShrink: 0,
  },
  expandedBody: {
    padding: '8px 0 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  notesInput: {
    width: '100%', background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 13, color: 'var(--text1)',
    fontFamily: 'var(--font)',
    resize: 'none', height: 72, lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  notesText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 },
  watchHint: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.2)',
    borderRadius: 8, padding: '10px 12px',
    fontSize: 12, color: 'var(--text2)',
    lineHeight: 1.5, marginTop: 14,
  },
  messagesArea: {
    flex: 1, overflowY: 'auto',
    padding: '10px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  msg: { padding: '5px 0' },
  msgBody: { flex: 1 },
  adminBody: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.15)',
    borderRadius: 10, padding: '8px 10px',
  },
  aiBody: {
    background: '#F5F3FF',
    border: '1px solid rgba(139,92,246,0.15)',
    borderRadius: 10, padding: '8px 10px',
  },
  msgTop: {
    display: 'flex', alignItems: 'center',
    gap: 6, marginBottom: 4, flexWrap: 'wrap',
  },
  msgName: { fontSize: 15, fontWeight: 600 },
  msgTime: { fontSize: 12, color: 'var(--text3)' },
  adminBadge: {
    background: 'var(--green-bg)', color: 'var(--green)',
    fontSize: 11, fontWeight: 700, padding: '1px 6px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.5px', border: '1px solid rgba(26,173,94,0.2)',
  },
  aiBadge: {
    background: '#F5F3FF', color: '#8B5CF6',
    fontSize: 11, fontWeight: 700, padding: '1px 6px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.5px', border: '1px solid rgba(139,92,246,0.2)',
  },
  msgText: {
    fontSize: 16, color: 'var(--text1)',
    lineHeight: 1.6, wordBreak: 'break-word',
  },
  tickerMention: {
    background: '#FFFBEB', color: '#D4A017',
    fontSize: 14, fontWeight: 600,
    padding: '1px 6px', borderRadius: 4,
    border: '1px solid rgba(212,160,23,0.2)',
  },
  emojiBar: {
    display: 'flex', gap: 4, padding: '6px 12px',
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none',
  },
  emojiBtn: {
    fontSize: 24, cursor: 'pointer', padding: '2px 4px',
    background: 'none', border: 'none', flexShrink: 0,
  },
  inputBar: {
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    padding: '8px 12px', display: 'flex',
    gap: 8, alignItems: 'center', flexShrink: 0,
  },
  broadcastBtn: {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '5px 8px',
    fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1,
  },
  emojiToggle: {
    background: 'none', border: 'none',
    fontSize: 22, cursor: 'pointer', flexShrink: 0, padding: 2,
  },
  input: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    color: 'var(--text1)', padding: '10px 14px',
    borderRadius: 22, fontFamily: 'var(--font)',
    fontSize: 16, outline: 'none',
  },
  sendBtn: {
    background: 'var(--green)', border: 'none', color: '#fff',
    width: 40, height: 40, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, flexShrink: 0, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  loadingWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  emptyState: { textAlign: 'center', padding: '40px 20px' },
  emptyWrap:  { textAlign: 'center', padding: '30px 20px' },
  emptyText:  { fontSize: 14, color: 'var(--text2)' },
  aiLoading: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
  aiDots: { display: 'flex', gap: 4 },
  aiDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: '#8B5CF6', animation: 'pulse 1.2s infinite',
  },
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'center', zIndex: 100, padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '20px 16px 16px',
    width: '100%', maxWidth: 460, margin: '0 12px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text1)' },
  modalInput: {
    width: '100%', background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '10px 12px',
    fontSize: 14, color: 'var(--text1)',
    resize: 'none', fontFamily: 'var(--font)',
    lineHeight: 1.5, boxSizing: 'border-box',
  },
  typePreview: { fontSize: 11, color: 'var(--text3)', marginTop: -4 },
  modalSendBtn: {
    width: '100%', background: 'var(--green)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '13px 0',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
