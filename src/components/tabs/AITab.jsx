// ============================================
// UPTIKALERTS — AITab.jsx
// UpTik AI — private AI assistant
// ============================================
import { useState, useRef, useEffect } from 'react';
import { useGroup } from '../../context/GroupContext';
import { supabase } from '../../lib/supabase';
import { askUpTikAI, stripMarkdown } from '../../lib/aiAgent';
import FadingMessage from '../shared/FadingMessage';

const QUICK_CHIPS = [
  'How do I join a group?',
  'Explain the scoring system',
  'What stocks are trending?',
  'How do I use my watchlist?',
  'What is the Daily Briefing?',
];

export default function AITab({ session }) {
  const { profile, activeGroup } = useGroup();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [lastTicker, setLastTicker] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadWatchlist();
    setMessages([{
      role: 'assistant',
      text: `Hey ${profile?.username || 'there'} — what are we researching today?`
    }]);
  }, [profile?.username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadWatchlist = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('user_watchlist')
      .select('symbol')
      .eq('user_id', session.user.id);
    if (data) setWatchlist(data.map(w => w.symbol));
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput('');
    const userMsg = { role: 'user', text: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.text }));

      const { text: aiText, newLastTicker } = await askUpTikAI({
        userText,
        history,
        lastTicker,
        username: profile?.username,
        groupName: activeGroup?.name,
        watchlist,
      });

      setLastTicker(newLastTicker);
      setMessages(prev => [...prev, { role: 'assistant', text: aiText }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Unable to respond right now. Try again shortly.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* AI Header */}
      <div style={{ background: '#4C1D95', padding: '12px 16px', borderBottom: '2px solid #7C3AED', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>AI</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>UpTik AI</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>Filter out the noise.</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, WebkitOverflowScrolling: 'touch' }}>
        {messages.map((msg, i) => {
          const bubble = (
            <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>AI</div>
              )}
              <div style={{
                maxWidth: '80%', padding: '10px 13px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                background: msg.role === 'user' ? '#7C3AED' : 'var(--card)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                color: msg.role === 'user' ? '#fff' : 'var(--text1)',
                fontSize: 14, lineHeight: 1.6,
              }}>
                {msg.text}
              </div>
            </div>
          );
          if (i === 0 && msg.role === 'assistant') {
            return <div key={i}>{bubble}</div>;
          }
          return (
            <FadingMessage key={i} onRemove={() => setMessages(prev => prev.filter((_, idx) => idx !== i))}>
              {bubble}
            </FadingMessage>
          );
        })}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>AI</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '2px 12px 12px 12px', padding: '10px 13px', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick chips */}
      {messages.length <= 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 16px 8px', flexShrink: 0 }}>
          {QUICK_CHIPS.map((chip, i) => (
            <div key={i} onClick={() => sendMessage(chip)} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20, background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.3)', color: '#6D28D9', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {chip}
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '8px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, background: 'var(--card)' }}>
        <input
          style={{ flex: 1, background: 'var(--card2)', border: '1.5px solid var(--border)', borderRadius: 22, padding: '10px 14px', fontSize: 14, color: 'var(--text1)', outline: 'none', fontFamily: 'var(--font)' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask UpTik AI..."
          enterKeyHint="send"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{ width: 40, height: 40, borderRadius: '50%', background: input.trim() ? '#7C3AED' : 'var(--border)', border: 'none', color: '#fff', fontSize: 16, cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}
        >➤</button>
      </div>
    </div>
  );
}
