// ============================================
// UPTIKALERTS — ChatTab.jsx
// Group view: Chat only
// ============================================

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { askUpTikAI } from '../../lib/aiAgent';
import FadingMessage from '../shared/FadingMessage';
import TickerBanner from './TickerBanner';
import TickerMentionCard from '../shared/TickerMentionCard';
import StickerPicker, { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';

const EMOJIS = ['🔥','📈','📉','🚀','💪','🎯','👀','💰','⚠️','✅','❌','😎','🤔','👋','🙌','😂','💎','🐂','🐻','⏰'];

// ── UptikCard: renders the ```uptik {json}``` envelope as a clean card ──
const UptikCard = ({ card }) => {
  if (!card || !card.type) return null;
  const wrap = {
    border: '1px solid rgba(139,92,246,0.25)',
    background: 'rgba(139,92,246,0.06)',
    borderRadius: 10,
    padding: '10px 12px',
    marginBottom: 8,
    fontFamily: "'Outfit', sans-serif",
  };
  const head = { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 };
  const ticker = { fontWeight: 700, fontSize: 14, color: '#8B5CF6', letterSpacing: 0.3 };
  const price = { fontWeight: 600, fontSize: 13 };
  const sub = { fontSize: 11, opacity: 0.7 };

  if (card.type === 'earnings') {
    // Stickiness rule: only show 2 most recent quarters
    const qs = (card.quarters || []).slice(0, 2);
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>${card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
          <span style={sub}>Earnings beats</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {qs.map((q, i) => {
            const beat = Number(q.beatPct) >= 0;
            return (
              <div key={i} style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                padding: '6px 8px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{q.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>${Number(q.actual).toFixed(2)} <span style={{ opacity: 0.6, fontWeight: 400 }}>vs ${Number(q.est).toFixed(2)}</span></div>
                <div style={{ fontSize: 11, fontWeight: 700, color: beat ? '#22c55e' : '#ef4444' }}>
                  {beat ? '▲' : '▼'} {Math.abs(Number(q.beatPct)).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
        {card.nextEarnings && (
          <div style={{ ...sub, marginTop: 6 }}>Next: {card.nextEarnings}</div>
        )}
      </div>
    );
  }

  if (card.type === 'price') {
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>${card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
          {card.volume && <span style={sub}>Vol {card.volume}</span>}
          {card.isClosed && <span style={sub}>• Market closed</span>}
        </div>
      </div>
    );
  }

  // Unknown type — render nothing rather than raw JSON
  return null;
};

// ── Message Item ──
const MessageItem = memo(({ msg, currentUserId, groupId, onFeedback, feedbackGiven, onTapUsername }) => {
  const isAdmin = msg.is_admin;
  const isAI    = msg.user_id === 'user_ai' || msg.type === 'ai';

  // Extract $TICKER symbols from message text
  const tickerMatches = (msg.text || '').match(/\$[A-Z]{1,5}/g);
  const uniqueTickers = tickerMatches ? [...new Set(tickerMatches)] : [];

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

  // Parse the ```uptik {json}``` envelope into a clean card + prose body
  const renderAIBody = (raw) => {
    if (!raw) return null;

    // Extract envelope JSON if present
    let card = null;
    let clean = raw;
    const m = raw.match(/`{1,3}\s*uptik\s*([\s\S]*?)`{3}/i);
    if (m) {
      try {
        // Tolerate trailing commas / stray chars
        const jsonStr = m[1].trim().replace(/,\s*([}\]])/g, '$1');
        card = JSON.parse(jsonStr);
      } catch (e) { card = null; }
      clean = raw.replace(m[0], '').trim();
    }
    clean = clean.replace(/^`+\s*/, '').replace(/`+$/, '').trim();

    // Split prose on bullet markers
    const segments = clean.split(/\s*•\s+/);
    const intro = segments[0]?.trim();
    const bullets = segments.slice(1).map(s => s.trim()).filter(Boolean);

    return (
      <>
        {card && <UptikCard card={card} />}
        {intro && <div style={{ marginTop: card ? 8 : 0, marginBottom: bullets.length ? 8 : 0 }}>{parseText(intro)}</div>}
        {bullets.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ lineHeight: 1.5 }}>{parseText(b)}</li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const bodyStyle = {
    ...styles.msgBody,
    ...(isAdmin ? styles.adminBody : {}),
    ...(isAI    ? styles.aiBody    : {}),
  };

  // Sticker messages — render emoji inline
  if (isSticker(msg.text)) {
    const s = STICKERS.find(st => st.id === getStickerId(msg.text));
    const isMe = currentUserId && msg.user_id === currentUserId;
    return (
      <div style={{ ...styles.msg, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: msg.user_color || '#2a7d4b', marginBottom: 2 }}>{msg.username}</span>
          <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.msg}>
      <div style={bodyStyle}>
        <div style={styles.msgTop}>
          <span
            style={{
              ...styles.msgName,
              color: isAI ? '#8B5CF6' : (msg.user_color || '#2a7d4b'),
              ...((!isAI && msg.user_id !== currentUserId && onTapUsername) ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: isAI ? '#8B5CF6' : (msg.user_color || '#2a7d4b'), textUnderlineOffset: 2 } : {}),
            }}
            onClick={() => {
              if (!isAI && msg.user_id !== currentUserId && onTapUsername) {
                onTapUsername(msg.user_id, msg.username);
              }
            }}
          >
            {msg.username}
          </span>
          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
          {isAI    && <span style={styles.aiBadge}>AI</span>}
          <span style={styles.msgTime}>{formatTime(msg.created_at)}</span>
        </div>
        <div style={styles.msgText}>{isAI ? renderAIBody(msg.text) : parseText(msg.text)}</div>
        {/* Ticker mention cards — show inline card for each $TICKER */}
        {!isAI && uniqueTickers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {uniqueTickers.map(t => (
              <TickerMentionCard
                key={t}
                ticker={t}
                groupId={groupId || msg.group_id}
                userId={currentUserId}
              />
            ))}
          </div>
        )}
        {isAI && onFeedback && (
          <div style={styles.feedbackRow}>
            {feedbackGiven ? (
              <span style={styles.feedbackThanks}>{feedbackGiven === 'up' ? '👍' : '👎'} Thanks!</span>
            ) : (
              <>
                <button onClick={() => onFeedback(msg.id, 'up')} style={styles.feedbackBtn}>👍</button>
                <button onClick={() => onFeedback(msg.id, 'down')} style={styles.feedbackBtn}>👎</button>
              </>
            )}
          </div>
        )}
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
  const colors = { BULLISH: '#2a7d4b', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
  return colors[type] || '#2a7d4b';
}

// ── Main ChatTab ──
export default function ChatTab({ session, profile, group, isAdmin, isModerator, setUnreadChat, onStartDM }) {
  const { activeGroup } = useGroup();
  const [watchlist, setWatchlist] = useState([]);
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiLastTicker, setAiLastTicker] = useState(null);
  const [aiMode, setAiMode]         = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});

  const handleFeedback = useCallback(async (msgId, rating) => {
    setFeedbackMap(prev => ({ ...prev, [msgId]: rating }));
    // Find the AI response and the question before it
    const msgIndex = messages.findIndex(m => m.id === msgId);
    const aiMsg = messages[msgIndex];
    let question = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].user_id !== 'user_ai') { question = messages[i].text; break; }
    }
    try {
      await supabase.from('ai_feedback').insert({
        user_id: session.user.id,
        message_id: msgId,
        question: question.replace(/@AI\b/gi, '').trim(),
        response: aiMsg?.text || '',
        rating,
      });
    } catch (err) {
      console.warn('[Feedback] Save failed:', err.message);
    }
  }, [messages, session, supabase]);
  const [loading, setLoading]       = useState(false);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const inputRef       = useRef(null);
  const sendingRef     = useRef(false);

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
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setMessages(data.reverse().filter(m => m.type !== 'ai' && !/@AI\b/i.test(m.text)));
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
          const updated = [...prev, payload.new];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
        setUnreadChat(true);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  // Hard-pin scroll to bottom on any new message or AI loading state.
  // Uses the container directly + ResizeObserver so tall AI answers that
  // grow after mount still get pulled fully into view.
  useEffect(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const pin = () => { el.scrollTop = el.scrollHeight; };
    const raf = requestAnimationFrame(pin);
    const t = setTimeout(pin, 120);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(pin);
      ro.observe(el);
      // Observe last child too — its height growing is the real signal
      if (el.lastElementChild) ro.observe(el.lastElementChild);
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro?.disconnect();
    };
  }, [messages.length, aiLoading]);

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
      const { error: aiInsertErr } = await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik', user_color: '#8B5CF6',
        text, type: 'ai', is_admin: false,
      });
      if (aiInsertErr) console.error('[ChatTab] AI message insert failed:', aiInsertErr.message);
    } catch(err) {
      console.error('UpTik AI error:', err.message, err);
      const { error: errInsertErr } = await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik', user_color: '#8B5CF6',
        text: `Error: ${err.message}`,
        type: 'ai', is_admin: false,
      });
      if (errInsertErr) console.error('[ChatTab] Error message insert failed:', errInsertErr.message);
    } finally {
      setAiLoading(false);
    }
  }, [group?.id, activeGroup?.name, profile?.username, watchlist, messages, aiLastTicker]);

  const handleSend = useCallback(async () => {
    if (sendingRef.current) return;
    const text = aiMode ? `@AI ${inputText.trim()}` : inputText.trim();
    if (!inputText.trim() || !profile || !group) return;
    sendingRef.current = true;
    try {
      setInputText('');
      setShowEmoji(false);
      inputRef.current?.blur();
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: session.user.id,
        username: profile.username, user_color: profile.color,
        text, type: 'user', is_admin: isAdmin,
      }).select().single();
      if (data) setMessages(prev => [...prev, data]);

      // Track $TICKER mentions for Trending (fire-and-forget)
      if (data) {
        const tickers = text.match(/\$[A-Z]{1,5}/g);
        if (tickers && tickers.length > 0) {
          const uniqueT = [...new Set(tickers)];
          const rows = uniqueT.map(t => ({
            group_id: group.id,
            ticker: t.replace('$', ''),
            message_id: data.id,
            user_id: session.user.id,
          }));
          supabase.from('ticker_mentions').insert(rows).then(() => {});
        }
      }

      if (!error && /@AI\b/i.test(text)) {
        const query = text.replace(/@AI\b/gi, '').trim() || text;
        await callAI(query);
      }
    } finally {
      sendingRef.current = false;
    }
  }, [inputText, aiMode, profile, group, isAdmin, callAI, session]);

  const handleSendSticker = useCallback((sticker) => {
    setInputText(prev => prev + sticker.emoji);
    inputRef.current?.focus();
  }, []);

  const sendBroadcast = async () => {
    if (!broadcastText.trim() || sendingBroadcast) return;
    setSendingBroadcast(true);
    const alertType = isAdmin ? 'INFO' : detectBroadcastType(broadcastText);
    const { error } = await supabase.from('breakout_alerts').insert({
      alert_type: alertType, title: broadcastText.trim(), sent_by: profile.username,
    });
    if (error) {
      console.error('[ChatTab] Broadcast insert failed:', error.message);
      setSendingBroadcast(false);
      return;
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

  // ── Tap username to start DM ──
  const handleTapUsername = (userId, username) => {
    if (onStartDM) onStartDM(userId, username);
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

      {/* Chat view */}
      {loading ? (
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
        </div>
      ) : (
        <div ref={messagesAreaRef} style={styles.messagesArea}>
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyText}>No messages yet — say hello!</div>
            </div>
          )}
          {messages.map(msg => {
            const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
            const isAIQuestion = msg.type === 'user' && /@AI\b/i.test(msg.text);
            if (isAI) {
              return (
                <FadingMessage key={msg.id} delay={60000} duration={5000} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                  <MessageItem msg={msg} currentUserId={session?.user?.id} groupId={group?.id} onFeedback={handleFeedback} feedbackGiven={feedbackMap[msg.id]} onTapUsername={handleTapUsername} />
                </FadingMessage>
              );
            }
            if (isAIQuestion) {
              return (
                <FadingMessage key={msg.id} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                  <MessageItem msg={msg} currentUserId={session?.user?.id} groupId={group?.id} onTapUsername={handleTapUsername} />
                </FadingMessage>
              );
            }
            return <MessageItem key={msg.id} msg={msg} currentUserId={session?.user?.id} groupId={group?.id} onTapUsername={handleTapUsername} />;
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
        <div
          style={{
            borderRadius: 20,
            background: aiMode ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : '#1a1a2e',
            border: aiMode ? 'none' : '1.5px solid rgba(139,92,246,0.3)',
            padding: '7px 12px',
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onClick={() => { setAiMode(prev => !prev); inputRef.current?.focus(); }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: aiMode ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>AI</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: aiMode ? '#fff' : '#8B5CF6' }}>Ask</span>
        </div>
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
        {(isAdmin || isModerator) && (
          <div style={{ flexShrink: 0, cursor: 'pointer', opacity: 0.5 }} onClick={() => setShowBroadcastModal(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#888"/>
            </svg>
          </div>
        )}
        <StickerPicker onSend={handleSendSticker} size="md" />
        <button
          style={{ ...styles.sendBtn, background: aiMode ? '#8B5CF6' : 'var(--green)', opacity: inputText.trim() ? 1 : 0.4 }}
          onClick={handleSend}
          disabled={!inputText.trim()}
        >
          ➤
        </button>
      </div>

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
  feedbackRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 6, paddingTop: 6,
    borderTop: '1px solid rgba(139,92,246,0.1)',
  },
  feedbackBtn: {
    background: 'none', border: '1px solid #e2e8f0',
    borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
    fontSize: 14, lineHeight: 1,
    transition: 'background .15s',
  },
  feedbackThanks: {
    fontSize: 12, color: '#94a3b8',
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
    gap: 6, alignItems: 'center', flexShrink: 0,
  },
  emojiToggle: {
    background: 'none', border: 'none',
    fontSize: 22, cursor: 'pointer', flexShrink: 0, padding: 2,
  },
  input: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    color: 'var(--text1)', padding: '10px 14px',
    borderRadius: 20, fontFamily: 'var(--font)',
    fontSize: 15, outline: 'none',
  },
  sendBtn: {
    background: 'var(--green)', border: 'none', color: '#fff',
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0, cursor: 'pointer',
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
