// ============================================
// UPTIKALERTS — ChatTab.jsx
// Group chat with realtime messages
// ============================================

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
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
      <div style={{
        ...styles.avatar,
        color: msg.user_color || '#1AAD5E',
        borderColor: (msg.user_color || '#1AAD5E') + '40',
      }}>
        {isAI ? 'AI' : (msg.username?.[0] || '?').toUpperCase()}
      </div>
      <div style={bodyStyle}>
        <div style={styles.msgTop}>
          <span style={{ ...styles.msgName, color: isAI ? '#8B5CF6' : (msg.user_color || '#1AAD5E') }}>
            {msg.username}
          </span>
          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
          {isAI    && <span style={styles.aiBadge}>AI</span>}
          <span style={styles.msgTime}>{formatTime(msg.created_at)}</span>
        </div>
        <div style={styles.msgText}>
          {parseText(msg.text)}
        </div>
      </div>
    </div>
  );
});

// ── Broadcast type auto-detection ──
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

// ── Main ChatTab ──
export default function ChatTab({ session, profile, group, isAdmin, isModerator, setUnreadChat }) {
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // Broadcast modal state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText]           = useState('');
  const [sendingBroadcast, setSendingBroadcast]     = useState(false);

  // Load messages
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

      if (data) setMessages(data);
      setLoading(false);
    };

    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat_${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${group.id}`,
      }, (payload) => {
        setMessages(prev => {
          // Deduplicate — own messages are already added via insert .select()
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setUnreadChat(true);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Call AI assistant
  const callAI = useCallback(async (query) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Unable to analyze right now.';

      await supabase.from('chat_messages').insert({
        group_id: group.id,
        user_id: 'user_ai',
        username: 'AI Assistant',
        user_color: '#8B5CF6',
        text,
        type: 'ai',
        is_admin: false,
      });
    } catch {
      await supabase.from('chat_messages').insert({
        group_id: group.id,
        user_id: 'user_ai',
        username: 'AI Assistant',
        user_color: '#8B5CF6',
        text: 'AI unavailable right now. Try again shortly.',
        type: 'ai',
        is_admin: false,
      });
    } finally {
      setAiLoading(false);
    }
  }, [group?.id]);

  // Send chat message
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !profile || !group) return;

    setInputText('');
    setShowEmoji(false);

    const { data, error } = await supabase.from('chat_messages').insert({
      group_id: group.id,
      user_id: session.user.id,
      username: profile.username,
      user_color: profile.color,
      text,
      type: 'user',
      is_admin: isAdmin,
    }).select().single();

    // Add sender's own message immediately — don't rely solely on realtime
    if (data) setMessages(prev => [...prev, data]);

    // Check for @AI mention
    if (!error && /@AI\b/i.test(text)) {
      const query = text.replace(/@AI\b/gi, '').trim() || text;
      await callAI(query);
    }
  }, [inputText, profile, group, isAdmin, callAI, session]);

  // Send broadcast
  const sendBroadcast = async () => {
    if (!broadcastText.trim() || sendingBroadcast) return;
    setSendingBroadcast(true);

    if (isAdmin) {
      // Admin broadcasts are always neutral — no keyword detection
      const { data: allGroups } = await supabase.from('groups').select('id');
      if (allGroups?.length) {
        const rows = allGroups.map(g => ({
          group_id:     g.id,
          title:        broadcastText.trim(),
          type:         'INFO',
          sent_by:      profile.username,
          is_mod_alert: false,
        }));
        await supabase.from('broadcasts').insert(rows);
      }
    } else {
      // Moderator — auto-detect type from keywords
      const type = detectBroadcastType(broadcastText);
      await supabase.from('broadcasts').insert({
        group_id:     group.id,
        title:        broadcastText.trim(),
        type,
        sent_by:      profile.username,
        is_mod_alert: true,
      });
    }

    setBroadcastText('');
    setSendingBroadcast(false);
    setShowBroadcastModal(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Loading chat...</span>
      </div>
    );
  }

  if (!group) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.emptyIcon}>💬</div>
        <div style={styles.emptyText}>You're not in a group yet.</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, textAlign: 'center', padding: '0 32px' }}>
          Ask your admin to add you to a group, or check your invite link.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>

      {/* Ticker Banner */}
      <TickerBanner groupId={group.id} />

      {/* Messages */}
      <div style={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyText}>No messages yet — say hello!</div>
          </div>
        )}

        {messages.map(msg => (
          <MessageItem
            key={msg.id}
            msg={msg}
            currentUserId={session?.user?.id}
          />
        ))}

        {aiLoading && (
          <div style={styles.aiLoading}>
            <span style={{ color: '#8B5CF6', fontSize: 14 }}>AI is analyzing</span>
            <div style={styles.aiDots}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  ...styles.aiDot,
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Bar */}
      {showEmoji && (
        <div style={styles.emojiBar}>
          {EMOJIS.map(e => (
            <button key={e} style={styles.emojiBtn} onClick={() => addEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div style={styles.inputBar}>
        {(isAdmin || isModerator) && (
          <button
            style={styles.broadcastBtn}
            onClick={() => setShowBroadcastModal(true)}
          >
            BC
          </button>
        )}
        <button
          style={styles.emojiToggle}
          onClick={() => setShowEmoji(prev => !prev)}
        >
          😊
        </button>
        <input
          ref={inputRef}
          style={styles.input}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message #general... $TICKER or @AI"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: inputText.trim() ? 1 : 0.4,
          }}
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
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBroadcast(); }
              }}
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
              style={{
                ...styles.modalSendBtn,
                opacity: sendingBroadcast || !broadcastText.trim() ? 0.6 : 1,
              }}
              onClick={sendBroadcast}
              disabled={sendingBroadcast || !broadcastText.trim()}
            >
              {sendingBroadcast ? 'Sending…' : isAdmin ? 'Send to All Groups' : 'Send to Group'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Styles ──
const styles = {
  wrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  msg: {
    display: 'flex',
    gap: 9,
    padding: '5px 0',
  },
  avatar: {
    width: 36, height: 36,
    borderRadius: '50%',
    background: 'var(--card2)',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
    marginTop: 2,
  },
  msgBody: {
    flex: 1,
  },
  adminBody: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.15)',
    borderRadius: 10,
    padding: '8px 10px',
  },
  aiBody: {
    background: '#F5F3FF',
    border: '1px solid rgba(139,92,246,0.15)',
    borderRadius: 10,
    padding: '8px 10px',
  },
  msgTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  msgName: {
    fontSize: 13,
    fontWeight: 600,
  },
  msgTime: {
    fontSize: 11,
    color: 'var(--text3)',
  },
  adminBadge: {
    background: 'var(--green-bg)',
    color: 'var(--green)',
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    border: '1px solid rgba(26,173,94,0.2)',
  },
  aiBadge: {
    background: '#F5F3FF',
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    border: '1px solid rgba(139,92,246,0.2)',
  },
  msgText: {
    fontSize: 14,
    color: 'var(--text1)',
    lineHeight: 1.6,
    wordBreak: 'break-word',
  },
  tickerMention: {
    background: '#FFFBEB',
    color: '#D4A017',
    fontSize: 14,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid rgba(212,160,23,0.2)',
  },
  emojiBar: {
    display: 'flex',
    gap: 4,
    padding: '6px 12px',
    background: 'var(--card)',
    borderTop: '1px solid var(--border)',
    overflowX: 'auto',
    flexShrink: 0,
    scrollbarWidth: 'none',
  },
  emojiBtn: {
    fontSize: 24,
    cursor: 'pointer',
    padding: '2px 4px',
    background: 'none',
    border: 'none',
    flexShrink: 0,
  },
  inputBar: {
    background: 'var(--card)',
    borderTop: '1px solid var(--border)',
    padding: '8px 12px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  broadcastBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '5px 8px',
    fontSize: 16,
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: 1,
  },
  emojiToggle: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 2,
  },
  input: {
    flex: 1,
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    color: 'var(--text1)',
    padding: '10px 14px',
    borderRadius: 22,
    fontFamily: 'var(--font)',
    fontSize: 16,
    outline: 'none',
  },
  sendBtn: {
    background: 'var(--green)',
    border: 'none',
    color: '#fff',
    width: 40, height: 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  loadingWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: 'var(--text2)',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 14, color: 'var(--text2)' },
  aiLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
  },
  aiDots: { display: 'flex', gap: 4 },
  aiDot: {
    width: 5, height: 5,
    borderRadius: '50%',
    background: '#8B5CF6',
    animation: 'pulse 1.2s infinite',
  },
  // Broadcast modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
    padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '20px 16px 16px',
    width: '100%',
    maxWidth: 460,
    margin: '0 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text1)',
  },
  modalInput: {
    width: '100%',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--text1)',
    resize: 'none',
    fontFamily: 'var(--font)',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  typePreview: {
    fontSize: 11,
    color: 'var(--text3)',
    marginTop: -4,
  },
  modalSendBtn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
