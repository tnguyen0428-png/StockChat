// ============================================
// UPTIKALERTS — ChatTab.jsx
// Group view: Chat only
// ============================================

import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { askUpTikAI } from '../../lib/aiAgent';
import FadingMessage from '../shared/FadingMessage';
import TickerMentionCard from '../shared/TickerMentionCard';
import { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';

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
const MSG_COLLAPSE_LEN = 150;

const MessageItem = memo(({ msg, currentUserId, groupId, onFeedback, feedbackGiven, isGrouped }) => {
  const [expanded, setExpanded] = useState(false);
  const isAdmin = msg.is_admin;
  const isAI    = msg.user_id === 'user_ai' || msg.type === 'ai';
  const isLong  = !isAI && (msg.text || '').length > MSG_COLLAPSE_LEN;

  // Extract $TICKER symbols from message text
  const tickerMatches = (msg.text || '').match(/\$[A-Z]{1,5}/g);
  const uniqueTickers = tickerMatches ? [...new Set(tickerMatches)] : [];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formatTime = (ts) => {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
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
    const m = raw.match(/```uptik\s*([\s\S]*?)```/i);
    if (m) {
      try {
        // Tolerate trailing commas / stray chars
        const jsonStr = m[1].trim().replace(/,\s*([}\]])/g, '$1');
        card = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('[ChatTab] Failed to parse uptik card:', e.message, '| Raw:', m[1]?.slice(0, 100));
        card = null;
      }
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

  // Sticker messages — render emoji inline (no avatar)
  if (isSticker(msg.text)) {
    const s = STICKERS.find(st => st.id === getStickerId(msg.text));
    const stickerColor = msg.user_color || '#2a7d4b';
    return (
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '8px 10px',
        marginTop: isGrouped ? 2 : 6,
      }}>
        {!isGrouped && (
          <div style={styles.msgTop}>
            <span style={{ ...styles.msgName, color: stickerColor }}>{msg.username}</span>
            <span style={{ ...styles.msgTime, marginLeft: 'auto' }}>{formatTime(msg.created_at)}</span>
          </div>
        )}
        <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
      </div>
    );
  }

  const nameColor = isAI ? '#8B5CF6' : (msg.user_color || '#2a7d4b');

  // Determine display text (collapse long messages)
  const displayText = (!isAI && isLong && !expanded)
    ? msg.text.slice(0, MSG_COLLAPSE_LEN) + '...'
    : msg.text;

  return (
    <div style={{
      background: isAI ? 'rgba(139,92,246,0.04)' : 'var(--card)',
      border: isAI ? '1px solid rgba(139,92,246,0.15)' : '1px solid var(--border)',
      borderRadius: 10, padding: '8px 10px',
      marginTop: isGrouped ? 2 : 6,
    }}>
      {!isGrouped && (
        <div style={styles.msgTop}>
          <span style={{ ...styles.msgName, color: nameColor }}>{msg.username}</span>
          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
          {isAI    && <span style={styles.aiBadge}>AI</span>}
          <span style={{ ...styles.msgTime, marginLeft: 'auto' }}>{formatTime(msg.created_at)}</span>
        </div>
      )}
      <div style={styles.msgText}>
        {isAI ? renderAIBody(msg.text) : parseText(displayText)}
        {isLong && (
          <span
            onClick={() => setExpanded(e => !e)}
            style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 4 }}
          >
            {expanded ? 'show less' : 'show more'}
          </span>
        )}
      </div>
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
  );
});

// ── Display helpers ──
// Keep the slim header readable on narrow phones — "UpTik Public" is long and
// the default group for almost every user. Rename to "Public Chat" in the UI
// only; underlying group.name stays canonical.
function displayGroupName(name) {
  if (!name) return 'Chat';
  if (name === 'UpTik Public') return 'Public Chat';
  return name;
}

// Simple US market-hours status for the slim header sub-line. Best-effort —
// doesn't account for early closes or holidays, but good enough for a status
// chip that just says "Market open" vs "Market closed".
function getMarketStatus() {
  try {
    const et = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const d = new Date(et);
    const day = d.getDay(); // 0 Sun … 6 Sat
    const mins = d.getHours() * 60 + d.getMinutes();
    const isWeekend = day === 0 || day === 6;
    const isOpen = !isWeekend && mins >= 570 && mins < 960; // 9:30 – 16:00 ET
    return isOpen ? 'Market open' : 'Market closed';
  } catch {
    return '';
  }
}

// ── Main ChatTab ──
export default function ChatTab({ session, profile, group, isAdmin, setUnreadChat, publicGroups, customGroups, enterGroup, onCreateGroup, onShowInvite, activeTab }) {
  const { activeGroup } = useGroup();
  const [watchlist, setWatchlist] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});

  // viewMode: 'chat' (slim header + messages + input) vs 'list' (group selector).
  // Default is 'chat' — landing on the Chat tab should show messages with zero
  // taps. Users hit the back chevron to browse groups; tapping a group snaps
  // back to chat. Keeps the primary action (read/send) on screen.
  const [viewMode, setViewMode] = useState('chat');

  // Re-compute market status once a minute so the sub-line updates around 9:30
  // and 16:00 ET without requiring a tab switch.
  const [marketStatus, setMarketStatus] = useState(() => getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setMarketStatus(getMarketStatus()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ids = [...(publicGroups || []), ...(customGroups || [])].map(g => g.id);
    if (!ids.length) return;
    supabase.from('group_members').select('group_id').in('group_id', ids)
      .then(({ data }) => {
        const counts = {};
        (data || []).forEach(m => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; });
        setMemberCounts(counts);
      });
  }, [publicGroups, customGroups]);
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
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
  const wrapRef        = useRef(null);
  const sendingRef     = useRef(false);
  const messagesRef    = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.user.id)
      .then(({ data }) => { if (data) setWatchlist(data.map(w => w.symbol)); });
  }, [session?.user?.id]);


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

  // Scroll to bottom on initial load (once messages are ready)
  const hasScrolledInit = useRef(false);
  useEffect(() => {
    const el = messagesAreaRef.current;
    if (!el || messages.length === 0 || hasScrolledInit.current) return;
    hasScrolledInit.current = true;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length]);

  // iMessage / WhatsApp behavior: every time the Chat tab becomes active
  // (or the user returns from the group-list subview to the chat subview),
  // snap the messages area to the bottom so the latest message is the
  // first thing they see — zero scroll friction to the live conversation.
  // Tabs use display:none (not unmount), so the component instance survives
  // tab switches; this effect re-runs on every activation transition.
  //
  // useLayoutEffect fires synchronously after React commits the
  // display:none→display:flex change but before the browser paints —
  // reading scrollHeight forces layout, so the write lands on real
  // post-commit dimensions and the first paint is already at the bottom
  // with no visible flash.
  //
  // No ResizeObserver, no multi-timeout cascade. An earlier version tried
  // both and caused scroll shakiness: iOS fires visualViewport.resize
  // whenever the URL bar shows/hides during scroll, which cascaded into
  // ResizeObserver callbacks that wrote scrollTop mid-momentum-scroll and
  // yanked the user's finger back to the bottom. Late content growth
  // (ticker cards loading) is handled by the existing nearBottom pin
  // effect below, which triggers only on message/AI state changes — never
  // during scroll.
  useLayoutEffect(() => {
    if (activeTab !== 'chat' || viewMode !== 'chat' || loading) return;
    const el = messagesAreaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeTab, viewMode, loading, group?.id]);

  // Hard-pin scroll to bottom on any new message or AI loading state —
  // only when the user was already near the bottom. Fires ONLY on
  // [messages.length, aiLoading] changes, never on scroll or viewport
  // resize, so writing scrollTop here can't interrupt momentum scrolling.
  useEffect(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    // Only auto-scroll if user is near bottom — don't yank them away from reading history
    const nearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (!nearBottom()) return;
    const pin = () => {
      if (!nearBottom()) return;
      el.scrollTop = el.scrollHeight;
    };
    const raf = requestAnimationFrame(pin);
    const t = setTimeout(pin, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [messages.length, aiLoading]);

  const callAI = useCallback(async (query) => {
    setAiLoading(true);
    try {
      const recentHistory = messagesRef.current
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
  }, [group?.id, activeGroup?.name, profile?.username, watchlist, aiLastTicker, session?.user?.id]);

  const handleSend = useCallback(async () => {
    // Dismiss the soft keyboard on send. Neal wants the keyboard to go
    // back down after each message so the full chat is visible without
    // needing to swipe the keyboard away. Trade-off: a second message
    // requires re-tapping the input, but the default action (read the
    // conversation you just contributed to) becomes friction-free.
    if (sendingRef.current) return;
    const text = aiMode ? `@AI ${inputText.trim()}` : inputText.trim();
    if (!inputText.trim() || !profile || !group) return;
    sendingRef.current = true;
    try {
      setInputText('');
      inputRef.current?.blur();
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: session.user.id,
        username: profile.username, user_color: profile.color,
        text, type: 'user', is_admin: isAdmin,
      }).select().single();
      if (data) {
        setMessages(prev => [...prev, data]);
        // User just pressed send. Pin to bottom NOW (keyboard still up) and
        // again after the keyboard-dismiss animation completes (~300ms) so
        // the viewport resize doesn't leave their message hidden above the
        // new bottom edge.
        const pinBottom = () => {
          const el = messagesAreaRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        };
        requestAnimationFrame(pinBottom);
        setTimeout(pinBottom, 350);
      }

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
          // Fire-and-forget: we don't want the send UI to wait on this,
          // but we do want to know when it fails — otherwise trending
          // tickers silently stops tracking for this message and we
          // have no trail back to the cause.
          supabase.from('ticker_mentions').insert(rows).then(({ error: tmErr }) => {
            if (tmErr && import.meta.env.DEV) console.warn('[chat] ticker_mentions insert failed:', tmErr?.message || tmErr);
          });
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const mainPublic = (publicGroups || []).find(g => g.name === 'UpTik Public') || (publicGroups || [])[0];
  const privateGroups = customGroups || [];

  // Tap-to-enter helper used by every group row in list view: switch the
  // active group, then snap to chat view so the user lands on messages.
  const openGroup = (g) => {
    enterGroup(g);
    setViewMode('chat');
  };

  return (
    <div ref={wrapRef} style={styles.wrap}>

      {/* ── Group Selector (LIST VIEW) ── */}
      {viewMode === 'list' && (
        <div style={selectorStyles.card}>
          {/* Public Chat row */}
          {mainPublic && (
            <div
              onClick={() => openGroup(mainPublic)}
              style={{ ...selectorStyles.row, background: group?.id === mainPublic.id ? 'rgba(26,173,94,0.08)' : 'transparent' }}
            >
              <div style={{ ...selectorStyles.iconWrap, background: 'rgba(26,173,94,0.15)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1AAD5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <div style={selectorStyles.rowText}>
                <div style={selectorStyles.rowName}>Public Chat</div>
                {memberCounts[mainPublic.id] > 0 && <div style={selectorStyles.rowSub}>{memberCounts[mainPublic.id]} members</div>}
              </div>
              {group?.id === mainPublic.id && <div style={{ ...selectorStyles.activeDot, background: '#1AAD5E' }} />}
            </div>
          )}

          {/* Private Chats label — always expanded. No dropdown toggle:
               keeping private groups visible inline reduces taps and
               cognitive load (core thesis: low-friction > affordances). */}
          <div style={selectorStyles.divider}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={selectorStyles.dividerText}>
              Private Chats{privateGroups.length > 0 ? ` (${privateGroups.length})` : ''}
            </span>
          </div>

          {/* Private group rows + New Group button — always shown */}
          {privateGroups.map(g => {
            const color = g.color || '#7B68EE';
            return (
              <div
                key={g.id}
                onClick={() => openGroup(g)}
                style={{ ...selectorStyles.row, background: group?.id === g.id ? `${color}15` : 'transparent' }}
              >
                <div style={{ ...selectorStyles.iconWrap, background: `${color}20` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div style={selectorStyles.rowText}>
                  <div style={selectorStyles.rowName}>{g.name}</div>
                  {memberCounts[g.id] > 0 && <div style={selectorStyles.rowSub}>{memberCounts[g.id]} members</div>}
                </div>
                {group?.id === g.id && <div style={{ ...selectorStyles.activeDot, background: color }} />}
              </div>
            );
          })}
          <div style={{ padding: '8px 12px' }}>
            <button onClick={onCreateGroup} style={selectorStyles.newGroupBtn}>+ New Group</button>
          </div>
        </div>
      )}

      {/* ── Slim Chat Header (CHAT VIEW) ── */}
      {viewMode === 'chat' && group && (
        <div style={styles.chatHeader}>
          <button
            onClick={() => setViewMode('list')}
            aria-label="Back to group list"
            style={styles.backBtn}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={styles.chatHeaderText}>
            <div style={styles.chatHeaderName}>{displayGroupName(group?.name)}</div>
            <div style={styles.chatHeaderSub}>
              {memberCounts[group?.id] > 0 && (
                <>
                  {memberCounts[group?.id]} member{memberCounts[group?.id] === 1 ? '' : 's'}
                  {marketStatus && ' · '}
                </>
              )}
              {marketStatus}
            </div>
          </div>
          {/* Invite pill — only shown for private groups, the only groups
              where an invite code matters. Public groups join by sector pick,
              so adding a pill there would be empty noise. Tapping reopens
              the same ShareInviteModal the post-create flow uses. */}
          {!group?.is_public && onShowInvite && (
            <button
              onClick={() => onShowInvite(group)}
              aria-label="Invite people"
              style={styles.invitePill}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              <span>Invite</span>
            </button>
          )}
        </div>
      )}

      {/* Chat view — messages + input, only rendered in chat mode */}
      {viewMode === 'chat' && (loading ? (
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
        </div>
      ) : (
        <div ref={messagesAreaRef} style={styles.messagesArea}>
          {/* marginTop:auto on the inner wrapper implements the classic
               iMessage/WhatsApp pattern: when the message list is short,
               the wrapper gets pushed to the bottom of the flex container
               so the newest message sits just above the input bar — no
               big blank space. When the list overflows, marginTop:auto
               resolves to 0 and scrolling works normally. Pinning here
               (not with justify-content) preserves native scroll. */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyText}>Be the first to start the conversation! Try mentioning a stock like $AAPL or ask @AI a question.</div>
            </div>
          )}
          {messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const isGrouped = prev && prev.user_id === msg.user_id && !isSticker(prev.text) && !isSticker(msg.text);
            const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
            const isAIQuestion = msg.type === 'user' && /@AI\b/i.test(msg.text);
            if (isAI) {
              return (
                <FadingMessage key={msg.id} delay={60000} duration={5000} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                  <MessageItem msg={msg} currentUserId={session?.user?.id} groupId={group?.id} onFeedback={handleFeedback} feedbackGiven={feedbackMap[msg.id]}isGrouped={isGrouped} />
                </FadingMessage>
              );
            }
            if (isAIQuestion) {
              return (
                <FadingMessage key={msg.id} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                  <MessageItem msg={msg} currentUserId={session?.user?.id} groupId={group?.id}isGrouped={isGrouped} />
                </FadingMessage>
              );
            }
            return <MessageItem key={msg.id} msg={msg} currentUserId={session?.user?.id} groupId={group?.id}isGrouped={isGrouped} />;
          })}
          {aiLoading && (
            <div style={styles.aiLoading}>
              <span style={{ color: '#8B5CF6', fontSize: 12 }}>AI is analyzing</span>
              <div style={styles.aiDots}>
                {[0,1,2].map(i => <div key={i} style={{ ...styles.aiDot, animationDelay: `${i * 0.2}s` }} />)}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
          </div>
        </div>
      ))}

      {viewMode === 'chat' && (
        <div style={styles.inputBar}>
          <div
            style={{
              borderRadius: 16,
              background: aiMode ? 'rgba(139,92,246,0.15)' : 'var(--card2)',
              border: `1.5px solid ${aiMode ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
              padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            // Prevent the tap from stealing focus off the input. Without this,
            // Android/iOS blur the field on pointerdown and dismiss the soft
            // keyboard — the exact friction we're trying to remove. Using
            // onPointerDown (vs onMouseDown) unifies mouse/touch/pen and is
            // the more future-proof way to cancel the focus transfer across
            // all input stacks; click still fires normally afterwards.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { setAiMode(prev => !prev); inputRef.current?.focus(); }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6' }}>AI</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: aiMode ? '#8B5CF6' : 'var(--text3)' }}>Ask</span>
          </div>
          <input
            ref={inputRef}
            style={{ ...styles.input, borderColor: aiMode ? '#8B5CF6' : 'var(--border)' }}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiMode ? 'Ask AI about any stock...' : 'Chat with your group...'}
            enterKeyHint="send"
            // Hints to iOS Safari that this is a chat message field, not a
            // credential. Without these, Safari shows the "uptikalerts.com"
            // AutoFill chip + password-manager nav in the form accessory
            // bar, inflating the chrome between the input and the keyboard.
            type="text"
            name="chat-message"
            inputMode="text"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck={true}
            data-1p-ignore="true"
            data-lpignore="true"
          />
          <button
            style={{ ...styles.sendBtn, background: aiMode ? '#8B5CF6' : 'var(--green)', opacity: inputText.trim() ? 1 : 0.4 }}
            // No preventDefault on pointerdown here — we want the tap to
            // naturally blur the input so the soft keyboard dismisses
            // alongside the explicit blur() inside handleSend. Both paths
            // (tap button / Enter key) converge on keyboard-down.
            onClick={handleSend}
            disabled={!inputText.trim()}
          >
            ➤
          </button>
        </div>
      )}

    </div>
  );
}

// ── Styles ──
const styles = {
  // paddingTop: env(safe-area-inset-top) protects the topmost element (slim
  // chat header OR list selector) from the iPhone notch now that the navy
  // Uptik Header is hidden on this tab. Falls back to 0 on Android/desktop.
  wrap: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    paddingTop: 'env(safe-area-inset-top, 0px)',
  },
  // Slim 46px chat header — back chevron + group name + member/status line.
  // Reclaims ~110px vs the old selector-card-on-top layout so more messages
  // fit above the keyboard on small screens.
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '0 8px 0 2px',
    minHeight: 46, height: 46,
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none', border: 'none', padding: 0,
    width: 40, height: 40, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text1)', cursor: 'pointer',
    borderRadius: 8,
  },
  chatHeaderText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  chatHeaderName: {
    fontSize: 15, fontWeight: 600, color: 'var(--text1)',
    lineHeight: 1.15,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  chatHeaderSub: {
    fontSize: 11, color: 'var(--text3)',
    marginTop: 2, lineHeight: 1.15,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  invitePill: {
    // Compact pill so it never starves the group-name line on 320px screens.
    display: 'flex', alignItems: 'center', gap: 5,
    flexShrink: 0,
    padding: '6px 10px',
    marginRight: 6,
    background: 'rgba(26,173,94,0.14)',
    color: '#1AAD5E',
    border: '1px solid rgba(26,173,94,0.35)',
    borderRadius: 999,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1,
  },
  messagesArea: {
    flex: 1, overflowY: 'auto',
    padding: '8px 14px',
    WebkitOverflowScrolling: 'touch',
    // display:flex + flexDirection:column enables the marginTop:auto
    // bottom-pin trick on the inner content wrapper, so short message
    // lists sit just above the input bar instead of floating at the top.
    display: 'flex',
    flexDirection: 'column',
  },
  feedbackRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 6, paddingTop: 6,
    borderTop: '1px solid rgba(139,92,246,0.1)',
  },
  feedbackBtn: {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
    fontSize: 13, lineHeight: 1,
    transition: 'background .15s',
  },
  feedbackThanks: {
    fontSize: 11, color: 'var(--text3)',
  },
  msgTop: {
    display: 'flex', alignItems: 'center',
    gap: 5, marginBottom: 4, flexWrap: 'wrap',
  },
  msgName: { fontSize: 13, fontWeight: 600 },
  msgTime: { fontSize: 10, color: 'var(--text3)' },
  adminBadge: {
    background: 'var(--green-bg)', color: 'var(--green)',
    fontSize: 9, fontWeight: 700, padding: '1px 5px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.4px', border: '1px solid rgba(26,173,94,0.15)',
  },
  aiBadge: {
    background: 'rgba(139,92,246,0.12)', color: '#8B5CF6',
    fontSize: 8, fontWeight: 700, padding: '1px 5px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.4px', border: '1px solid rgba(139,92,246,0.15)',
  },
  msgText: {
    fontSize: 13, color: 'var(--text1)',
    lineHeight: 1.5, wordBreak: 'break-word',
  },
  tickerMention: {
    background: 'rgba(212,160,23,0.1)', color: '#D4A017',
    fontSize: 13, fontWeight: 600,
    padding: '1px 5px', borderRadius: 4,
    border: '1px solid rgba(212,160,23,0.25)',
  },
  inputBar: {
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    padding: '8px 12px', display: 'flex',
    gap: 6, alignItems: 'center', flexShrink: 0,
    overflow: 'hidden', boxSizing: 'border-box', width: '100%',
  },
  input: {
    flex: 1, minWidth: 0, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    color: 'var(--text1)', padding: '9px 14px',
    borderRadius: 20, fontFamily: 'var(--font)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  },
  sendBtn: {
    background: 'var(--green)', border: 'none', color: '#fff',
    width: 34, height: 34, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, flexShrink: 0, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  loadingWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  spinner: {
    width: 22, height: 22,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  emptyState: { textAlign: 'center', padding: '40px 20px' },
  emptyWrap:  { textAlign: 'center', padding: '30px 20px' },
  emptyText:  { fontSize: 13, color: 'var(--text2)' },
  aiLoading: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
  aiDots: { display: 'flex', gap: 4 },
  aiDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: '#8B5CF6', animation: 'pulse 1.2s infinite',
  },
};

const selectorStyles = {
  card: {
    margin: '8px 10px 0',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  row: {
    padding: '10px 12px',
    display: 'flex', alignItems: 'center', gap: 10,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  rowSub: { fontSize: 11, color: 'var(--text3)', marginTop: 1 },
  activeDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  divider: {
    background: 'var(--bg2, rgba(0,0,0,0.04))',
    padding: '7px 12px',
    display: 'flex', alignItems: 'center', gap: 6,
    borderTop: '1px solid var(--border)',
  },
  dividerText: { fontSize: 13, fontWeight: 600, color: 'var(--text3)', flex: 1 },
  newGroupBtn: {
    width: '100%', padding: '7px',
    borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: '1px dashed var(--border)',
    background: 'transparent', color: 'var(--text2)',
    cursor: 'pointer',
  },
};