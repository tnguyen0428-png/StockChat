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
  const [listening, setListening] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const msgIdCounter = useRef(0);

  const nextMsgId = () => `ai-msg-${++msgIdCounter.current}`;

  const handleFeedback = async (msgId, rating) => {
    setFeedbackMap(prev => ({ ...prev, [msgId]: rating }));
    const msg = messages.find(m => m.id === msgId);
    let question = '';
    const idx = messages.findIndex(m => m.id === msgId);
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { question = messages[i].text; break; }
    }
    try {
      await supabase.from('ai_feedback').insert({
        user_id: session.user.id,
        message_id: null,
        question,
        response: msg?.text || '',
        rating,
      });
    } catch (err) {
      console.warn('[Feedback] Save failed:', err.message);
    }
  };

  useEffect(() => {
    loadWatchlist();
    setMessages([{
      id: nextMsgId(),
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

  const toggleMic = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput('');
    inputRef.current?.focus();
    const userMsg = { id: nextMsgId(), role: 'user', text: userText };
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
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'assistant', text: aiText }]);
    } catch {
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'assistant', text: 'Unable to respond right now. Try again shortly.' }]);
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
          const isAssistant = msg.role === 'assistant';
          const rated = feedbackMap[msg.id];
          const bubble = (
            <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
              {isAssistant && (
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>AI</div>
              )}
              <div style={{ maxWidth: '80%' }}>
                <div style={{
                  padding: '10px 13px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: msg.role === 'user' ? '#7C3AED' : 'var(--card)',
                  border: isAssistant ? '1px solid var(--border)' : 'none',
                  color: msg.role === 'user' ? '#fff' : 'var(--text1)',
                  fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
                {isAssistant && i > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    {rated ? (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{rated === 'up' ? '👍' : '👎'} Thanks!</span>
                    ) : (
                      <>
                        <button onClick={() => handleFeedback(msg.id, 'up')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>👍</button>
                        <button onClick={() => handleFeedback(msg.id, 'down')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>👎</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          if (i === 0 && isAssistant) {
            return <div key={msg.id}>{bubble}</div>;
          }
          return (
            <FadingMessage key={msg.id} delay={120000} duration={5000} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
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
          ref={inputRef}
          style={{ flex: 1, background: 'var(--card2)', border: '1.5px solid var(--border)', borderRadius: 22, padding: '10px 14px', fontSize: 14, color: 'var(--text1)', outline: 'none', fontFamily: 'var(--font)' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask UpTik AI..."
          enterKeyHint="send"
        />
        <div
          onClick={toggleMic}
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: listening ? 1 : 0.35, transition: 'opacity 0.15s' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={listening ? '#7C3AED' : 'var(--text1)'}>
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </div>
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{ width: 40, height: 40, borderRadius: '50%', background: input.trim() ? '#7C3AED' : 'var(--border)', border: 'none', color: '#fff', fontSize: 16, cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}
        >➤</button>
      </div>
    </div>
  );
}
