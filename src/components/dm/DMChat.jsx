// ============================================
// UPTIKALERTS — DMChat.jsx
// Private 1:1 chat with shared ticker context + AI
// Features: online presence, typing indicator,
//   read receipts, emoji reactions
// ============================================

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { askUpTikAI } from '../../lib/aiAgent';
import StickerPicker, { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';

// ── Stock-themed reaction emoji set ──
const REACTION_EMOJIS = ['🔥', '🚀', '📈', '📉', '🤔', '👍'];

// ── Shared Ticker Pill Bar ──
function SharedTickerBar({ groupId, onTapTicker }) {
  const [tickers, setTickers] = useState([]);

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from('dm_shared_tickers')
      .select('symbol')
      .eq('group_id', groupId)
      .order('updated_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (data) setTickers(data.map(d => d.symbol));
      });
  }, [groupId]);

  if (tickers.length === 0) return null;

  return (
    <div style={tickerStyles.bar}>
      <span style={tickerStyles.label}>Shared</span>
      <div style={tickerStyles.pills}>
        {tickers.map(sym => (
          <div key={sym} style={tickerStyles.pill} onClick={() => onTapTicker(sym)}>
            ${sym}
          </div>
        ))}
      </div>
    </div>
  );
}

const tickerStyles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderBottom: '1px solid var(--border)',
    background: 'var(--card)', flexShrink: 0, overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  label: {
    fontSize: 10, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0,
  },
  pills: {
    display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
  },
  pill: {
    background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)',
    color: '#D4A017', fontSize: 12, fontWeight: 700,
    padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'background 0.15s',
  },
};

// ── Reaction display under a message ──
function ReactionChips({ reactions, currentUserId, onToggle }) {
  if (!reactions || reactions.length === 0) return null;

  // Group by emoji: { '🔥': [userId1, userId2], ... }
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r.user_id);
  });

  return (
    <div style={reactionStyles.chips}>
      {Object.entries(grouped).map(([emoji, users]) => {
        const isMine = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            style={{
              ...reactionStyles.chip,
              ...(isMine ? reactionStyles.chipMine : {}),
            }}
            onClick={(e) => { e.stopPropagation(); onToggle(emoji); }}
          >
            {emoji} {users.length > 1 ? users.length : ''}
          </button>
        );
      })}
    </div>
  );
}

const reactionStyles = {
  chips: {
    display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap',
  },
  chip: {
    background: 'var(--card2)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '2px 8px', fontSize: 13,
    cursor: 'pointer', lineHeight: 1.4, display: 'flex',
    alignItems: 'center', gap: 2, fontFamily: 'inherit',
  },
  chipMine: {
    background: 'rgba(94,237,138,0.1)', borderColor: 'rgba(94,237,138,0.3)',
  },
};

// ── Reaction Picker (appears on double-tap/long-press) ──
function ReactionPicker({ onPick, onClose }) {
  return (
    <div style={pickerStyles.overlay} onClick={onClose}>
      <div style={pickerStyles.bar} onClick={e => e.stopPropagation()}>
        {REACTION_EMOJIS.map(emoji => (
          <button
            key={emoji}
            style={pickerStyles.btn}
            onClick={() => { onPick(emoji); onClose(); }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

const pickerStyles = {
  overlay: {
    position: 'absolute', inset: 0, zIndex: 20,
    background: 'rgba(0,0,0,0.05)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bar: {
    display: 'flex', gap: 4, background: 'var(--card)',
    borderRadius: 20, padding: '6px 10px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    border: '1px solid var(--border)',
  },
  btn: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '4px 6px', borderRadius: 8,
    transition: 'transform 0.1s',
    lineHeight: 1,
  },
};

// ── Message Item (DM-specific with reactions) ──
const DMMessageItem = memo(({ msg, currentUserId, otherUser, onFeedback, feedbackGiven, reactions, onToggleReaction, onShowReactionPicker, showingPicker }) => {
  const isMe = msg.user_id === currentUserId;
  const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
  const [hovered, setHovered] = useState(false);

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(ts).toLocaleDateString();
  };

  const parseText = (text) => {
    const parts = text.split(/(\$[A-Z]{1,5})/g);
    return parts.map((part, i) =>
      /^\$[A-Z]{1,5}$/.test(part)
        ? <span key={i} style={msgStyles.tickerMention}>{part}</span>
        : part
    );
  };

  // Always-visible react button (low opacity, like trash icon pattern)
  const reactTrigger = !isAI ? (
    <button
      style={{ ...msgStyles.reactBtn, opacity: showingPicker ? 1 : 0.35 }}
      onClick={(e) => { e.stopPropagation(); onShowReactionPicker(msg.id); }}
      title="React"
    >
      +
    </button>
  ) : null;

  // Inline mini picker (shows below the react button when active)
  const inlinePicker = showingPicker ? (
    <div style={msgStyles.inlinePicker}>
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          style={msgStyles.inlinePickerBtn}
          onClick={(e) => { e.stopPropagation(); onToggleReaction(msg.id, emoji); }}
        >
          {emoji}
        </button>
      ))}
    </div>
  ) : null;

  // Sticker messages
  if (isSticker(msg.text)) {
    const s = STICKERS.find(st => st.id === getStickerId(msg.text));
    return (
      <div
        style={{ ...msgStyles.row, justifyContent: isMe ? 'flex-end' : 'flex-start' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}>
          <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
          {reactTrigger}
          {inlinePicker}
          <ReactionChips reactions={reactions} currentUserId={currentUserId} onToggle={(emoji) => onToggleReaction(msg.id, emoji)} />
        </div>
      </div>
    );
  }

  // AI messages
  if (isAI) {
    return (
      <div style={msgStyles.row}>
        <div style={msgStyles.aiBody}>
          <div style={msgStyles.aiHeader}>
            <span style={msgStyles.aiName}>UpTik AI</span>
            <span style={msgStyles.aiBadge}>AI</span>
            <span style={msgStyles.time}>{formatTime(msg.created_at)}</span>
          </div>
          <div style={msgStyles.text}>{parseText(msg.text)}</div>
          {onFeedback && (
            <div style={msgStyles.feedbackRow}>
              {feedbackGiven ? (
                <span style={msgStyles.feedbackThanks}>{feedbackGiven === 'up' ? '👍' : '👎'} Thanks!</span>
              ) : (
                <>
                  <button onClick={() => onFeedback(msg.id, 'up')} style={msgStyles.feedbackBtn}>👍</button>
                  <button onClick={() => onFeedback(msg.id, 'down')} style={msgStyles.feedbackBtn}>👎</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular messages — bubble with always-visible react button beside it
  return (
    <div style={{ ...msgStyles.row, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {isMe && reactTrigger}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
        <div style={{
          ...msgStyles.bubble,
          ...(isMe ? msgStyles.bubbleMe : msgStyles.bubbleThem),
        }}>
          <div style={msgStyles.text}>{parseText(msg.text)}</div>
          <span style={{ ...msgStyles.time, textAlign: isMe ? 'right' : 'left' }}>
            {formatTime(msg.created_at)}
          </span>
        </div>
        {inlinePicker}
        <ReactionChips reactions={reactions} currentUserId={currentUserId} onToggle={(emoji) => onToggleReaction(msg.id, emoji)} />
      </div>
      {!isMe && reactTrigger}
    </div>
  );
});

const msgStyles = {
  row: { padding: '3px 0', display: 'flex', gap: 6, alignItems: 'flex-start' },
  bubble: {
    padding: '10px 14px', borderRadius: 16,
    fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word',
  },
  bubbleMe: {
    background: '#132d52', color: '#e8f0fe',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    background: 'var(--card2)', color: 'var(--text1)',
    border: '1px solid var(--border)',
    borderBottomLeftRadius: 4,
  },
  aiBody: {
    background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.15)',
    borderRadius: 12, padding: '10px 12px', width: '100%',
  },
  aiHeader: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  aiName: { fontSize: 13, fontWeight: 700, color: '#8B5CF6' },
  aiBadge: {
    background: 'rgba(139,92,246,0.1)', color: '#8B5CF6',
    fontSize: 10, fontWeight: 700, padding: '1px 5px',
    borderRadius: 3, letterSpacing: 0.5,
  },
  time: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  text: { fontSize: 15, lineHeight: 1.55, wordBreak: 'break-word' },
  tickerMention: {
    background: '#FFFBEB', color: '#D4A017',
    fontSize: 13, fontWeight: 600, padding: '1px 5px',
    borderRadius: 4, border: '1px solid rgba(212,160,23,0.2)',
  },
  feedbackRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(139,92,246,0.1)',
  },
  feedbackBtn: {
    background: 'none', border: '1px solid #e2e8f0',
    borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
    fontSize: 14, lineHeight: 1,
  },
  feedbackThanks: { fontSize: 12, color: '#94a3b8' },
  reactBtn: {
    width: 24, height: 24, borderRadius: '50%',
    background: 'var(--card)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: 'var(--text3)', cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', lineHeight: 1,
    padding: 0, fontFamily: 'inherit', flexShrink: 0,
    alignSelf: 'center',
  },
  inlinePicker: {
    display: 'flex', gap: 2, background: 'var(--card)',
    borderRadius: 16, padding: '4px 6px', marginTop: 4,
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
    border: '1px solid var(--border)', zIndex: 10,
  },
  inlinePickerBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', padding: '2px 4px', borderRadius: 6,
    lineHeight: 1, transition: 'transform 0.1s',
  },
};

// ── Typing indicator dots ──
function TypingIndicator({ username }) {
  return (
    <div style={typingStyles.wrap}>
      <span style={typingStyles.text}>{username} is typing</span>
      <div style={typingStyles.dots}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...typingStyles.dot, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

const typingStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 0 8px 0',
  },
  text: {
    fontSize: 12, color: 'var(--text3)', fontStyle: 'italic',
  },
  dots: { display: 'flex', gap: 3 },
  dot: {
    width: 4, height: 4, borderRadius: '50%',
    background: 'var(--text3)', animation: 'pulse 1.2s infinite',
  },
};

// ── Main DM Chat Component ──
export default function DMChat({ session, dm, onBack }) {
  const { profile, markDMRead, onlineUsers } = useGroup();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const lastTickerRef = useRef(null);
  const dmWrapRef = useRef(null);
  const channelRef = useRef(null);

  // ── Typing indicator state ──
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingBroadcast = useRef(0);

  // ── iOS/Android keyboard handling via visualViewport ──
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (dmWrapRef.current) {
        const top = dmWrapRef.current.getBoundingClientRect().top;
        const available = vv.height - top;
        dmWrapRef.current.style.height = `${Math.max(available, 120)}px`;
        dmWrapRef.current.style.maxHeight = `${Math.max(available, 120)}px`;
      }
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      if (dmWrapRef.current) {
        dmWrapRef.current.style.height = '';
        dmWrapRef.current.style.maxHeight = '';
      }
    };
  }, []);

  // ── Read receipt state ──
  const [otherReadAt, setOtherReadAt] = useState(null);

  // ── Reaction state (local map: { msgId: [{ emoji, user_id }] }) ──
  const [reactionsMap, setReactionsMap] = useState({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);

  const groupId = dm?.groupId;
  const otherUser = dm?.otherUser;
  const currentUserId = session?.user?.id;
  const otherUserId = otherUser?.id;
  const isOtherOnline = onlineUsers.has(otherUserId);

  // ── Load messages + reactions ──
  useEffect(() => {
    if (!groupId) return;
    setLoading(true);

    const loadData = async () => {
      // Load messages
      const { data: msgData } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages(msgData || []);

      // Load reactions for these messages
      const msgIds = (msgData || []).map(m => m.id).filter(Boolean);
      if (msgIds.length > 0) {
        const { data: rxData } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', msgIds);
        if (rxData) {
          const map = {};
          rxData.forEach(r => {
            if (!map[r.message_id]) map[r.message_id] = [];
            map[r.message_id].push(r);
          });
          setReactionsMap(map);
        }
      }

      // Load other user's last_read_at for read receipts
      const { data: otherParticipant } = await supabase
        .from('dm_participants')
        .select('last_read_at')
        .eq('group_id', groupId)
        .eq('user_id', otherUserId)
        .maybeSingle();
      if (otherParticipant?.last_read_at) {
        setOtherReadAt(otherParticipant.last_read_at);
      }

      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
    };
    loadData();

    // Mark as read
    markDMRead(groupId);

    // ── Realtime channel: messages + typing + read receipts ──
    const channel = supabase
      .channel(`dm_${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        // Only mark-as-read + broadcast when the message is from the OTHER user.
        // Our own echo doesn't need to trigger a read receipt back to ourselves.
        if (payload.new?.user_id && payload.new.user_id !== currentUserId) {
          markDMRead(groupId);
          channel.send({ type: 'broadcast', event: 'read', payload: { userId: currentUserId, readAt: new Date().toISOString() } });
        }
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
      }, (payload) => {
        const r = payload.new;
        if (r) {
          setReactionsMap(prev => ({
            ...prev,
            [r.message_id]: [...(prev[r.message_id] || []), r],
          }));
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
      }, (payload) => {
        const r = payload.old;
        if (r) {
          setReactionsMap(prev => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] || []).filter(rx => rx.id !== r.id),
          }));
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setOtherTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
        }
      })
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setOtherReadAt(payload.readAt);
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Broadcast initial read
    setTimeout(() => {
      channel.send({ type: 'broadcast', event: 'read', payload: { userId: currentUserId, readAt: new Date().toISOString() } });
    }, 500);

    return () => {
      clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [groupId, currentUserId, otherUserId, markDMRead]);

  // ── Typing broadcast on input change ──
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    const now = Date.now();
    if (now - lastTypingBroadcast.current > 2000 && channelRef.current) {
      lastTypingBroadcast.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId },
      });
    }
  };

  // ── Toggle reaction on a message ──
  const handleToggleReaction = async (messageId, emoji) => {
    if (!messageId || !session?.user?.id) return;

    const existing = (reactionsMap[messageId] || []).find(
      r => r.emoji === emoji && r.user_id === session.user.id
    );

    if (existing) {
      // Remove reaction
      await supabase.from('message_reactions').delete().eq('id', existing.id);
      setReactionsMap(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id),
      }));
    } else {
      // Add reaction
      const { data } = await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: session.user.id,
        emoji,
      }).select().single();
      if (data) {
        setReactionsMap(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), data],
        }));
      }
    }
    setReactionPickerMsgId(null); // Close picker after reacting
  };

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    const isAIRequest = /@AI\b/i.test(text);
    const cleanText = text.replace(/@AI\s*/i, '').trim();

    // @AI with nothing else to ask — silently ignore so we don't post
    // a dangling "@AI" message with no response underneath.
    if (isAIRequest && !cleanText) return;

    setInputText('');

    // Insert user message
    await supabase.from('chat_messages').insert({
      group_id: groupId,
      user_id: session.user.id,
      username: profile?.username || 'You',
      user_color: profile?.color || '#5eed8a',
      text,
      type: 'user',
    });

    // If @AI, fire off AI response
    if (isAIRequest && cleanText) {
      setAiLoading(true);
      try {
        const result = await askUpTikAI({
          userText: cleanText,
          history: messages.slice(-8).map(m => ({ role: m.type === 'ai' ? 'assistant' : 'user', content: m.text })),
          lastTicker: lastTickerRef.current,
          username: profile?.username,
          groupName: `DM with ${otherUser?.username || 'user'}`,
          watchlist: [],
          userId: session.user.id,
        });
        lastTickerRef.current = result.newLastTicker;

        await supabase.from('chat_messages').insert({
          group_id: groupId,
          user_id: 'user_ai',
          username: 'UpTik AI',
          user_color: '#8B5CF6',
          text: result.text,
          type: 'ai',
        });
      } catch (e) {
        console.error('[DM AI]', e);
        await supabase.from('chat_messages').insert({
          group_id: groupId,
          user_id: 'user_ai',
          username: 'UpTik AI',
          user_color: '#8B5CF6',
          text: "Couldn't process that request right now. Try again in a moment.",
          type: 'ai',
        }).catch(() => {});
      } finally {
        if (mountedRef.current) setAiLoading(false);
      }
    }
  };

  const handleSendSticker = async (sticker) => {
    await supabase.from('chat_messages').insert({
      group_id: groupId,
      user_id: session.user.id,
      username: profile?.username || 'You',
      user_color: profile?.color || '#5eed8a',
      text: `sticker:${sticker.id}`,
      type: 'user',
    });
  };

  const handleTickerTap = (symbol) => {
    setInputText(`@AI What's the latest on $${symbol}?`);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedback = async (msgId, rating) => {
    setFeedbackMap(prev => ({ ...prev, [msgId]: rating }));
    await supabase.from('ai_feedback').insert({
      message_id: msgId,
      user_id: session.user.id,
      rating,
    }).catch(() => {});
  };

  // ── Find the last message I sent (for read receipt) ──
  const lastSentMsg = [...messages].reverse().find(m => m.user_id === session?.user?.id);
  const showSeen = lastSentMsg && otherReadAt && new Date(otherReadAt) >= new Date(lastSentMsg.created_at);

  return (
    <div ref={dmWrapRef} style={styles.wrap}>
      {/* Header with online status */}
      <div style={styles.header}>
        <div style={styles.backBtn} onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="var(--text1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ ...styles.avatar, background: otherUser?.color || '#5eed8a' }}>
            {(otherUser?.username || '?')[0].toUpperCase()}
          </div>
          {isOtherOnline && <div style={styles.onlineDot} />}
        </div>
        <div style={styles.headerInfo}>
          <div style={styles.headerName}>{otherUser?.username || 'User'}</div>
          <div style={styles.headerHint}>
            {isOtherOnline ? (
              <span style={{ color: '#22c55e', fontWeight: 500 }}>Online</span>
            ) : (
              'Offline'
            )}
          </div>
        </div>
      </div>

      {/* Shared Tickers */}
      <SharedTickerBar groupId={groupId} onTapTicker={handleTickerTap} />

      {/* Messages */}
      {loading ? (
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
        </div>
      ) : (
        <div style={styles.messagesArea}>
          {messages.length === 0 && (
            <div style={styles.emptyChat}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>👋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>
                Start chatting with {otherUser?.username}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                Type @AI to bring UpTik AI into the conversation
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={msg.id || idx}>
              <DMMessageItem
                msg={msg}
                currentUserId={session?.user?.id}
                otherUser={otherUser}
                onFeedback={msg.type === 'ai' ? handleFeedback : null}
                feedbackGiven={feedbackMap[msg.id]}
                reactions={reactionsMap[msg.id] || []}
                onToggleReaction={handleToggleReaction}
                onShowReactionPicker={(msgId) => setReactionPickerMsgId(prev => prev === msgId ? null : msgId)}
                showingPicker={reactionPickerMsgId === msg.id}
              />
              {/* Read receipt: show "Seen" under the last message I sent */}
              {showSeen && msg.id === lastSentMsg?.id && (
                <div style={styles.seenLabel}>Seen</div>
              )}
            </div>
          ))}
          {/* Typing indicator */}
          {otherTyping && <TypingIndicator username={otherUser?.username || 'User'} />}
          {aiLoading && (
            <div style={styles.aiLoading}>
              <span style={{ color: '#8B5CF6', fontSize: 13 }}>AI is thinking</span>
              <div style={styles.aiDots}>
                {[0,1,2].map(i => <div key={i} style={{ ...styles.aiDot, animationDelay: `${i * 0.2}s` }} />)}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div style={styles.inputBar}>
        <input
          ref={inputRef}
          style={styles.input}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Message... or @AI to ask"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
        />
        <StickerPicker onSend={handleSendSticker} size="md" />
        <button
          style={{ ...styles.sendBtn, opacity: inputText.trim() ? 1 : 0.4 }}
          onClick={handleSend}
          disabled={!inputText.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderBottom: '1px solid var(--border)',
    background: 'var(--card)', flexShrink: 0,
  },
  backBtn: {
    cursor: 'pointer', padding: 4, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, flexShrink: 0,
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 9, height: 9, borderRadius: '50%',
    background: '#22c55e',
    border: '2px solid var(--card, #f8fafc)',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  headerHint: { fontSize: 11, color: 'var(--text3)' },
  messagesArea: {
    flex: 1, overflowY: 'auto', padding: '10px 12px',
    WebkitOverflowScrolling: 'touch', position: 'relative',
  },
  emptyChat: {
    textAlign: 'center', padding: '40px 20px',
  },
  seenLabel: {
    fontSize: 11, color: 'var(--text3)', textAlign: 'right',
    padding: '2px 4px 0 0', fontStyle: 'italic',
  },
  inputBar: {
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
    display: 'flex', gap: 6,
    alignItems: 'center', flexShrink: 0,
  },
  input: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)', color: 'var(--text1)',
    padding: '10px 14px', borderRadius: 20,
    fontFamily: 'var(--font)', fontSize: 15, outline: 'none',
  },
  sendBtn: {
    background: '#132d52', border: 'none', color: '#fff',
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  loadingWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 24, height: 24, border: '2px solid var(--border)',
    borderTopColor: 'var(--green)', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  aiLoading: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
  aiDots: { display: 'flex', gap: 4 },
  aiDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: '#8B5CF6', animation: 'pulse 1.2s infinite',
  },
};
