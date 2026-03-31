// ============================================
// UPTIKALERTS — AITab.jsx
// UpTik AI — private AI assistant
// ============================================
import { useState, useRef, useEffect } from 'react';
import { useGroup } from '../../context/GroupContext';
import { supabase } from '../../lib/supabase';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const stripMarkdown = (text) => {
  return text
    .replace(/#{1,6}\s+/g, '')        // remove headers
    .replace(/\*\*(.*?)\*\*/g, '$1')  // remove bold
    .replace(/\*(.*?)\*/g, '$1')      // remove italic
    .replace(/`(.*?)`/g, '$1')        // remove code
    .replace(/^\s*[-•]\s+/gm, '• ')  // normalize bullets
    .replace(/\n{3,}/g, '\n\n')       // max double newlines
    .trim();
};

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
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadWatchlist();
    setMessages([{
      role: 'assistant',
      text: `Hi ${profile?.username || 'there'}! I'm UpTik AI — your fundamental analysis assistant. I focus on earnings, revenue growth, valuations and long-term business quality. What would you like to research today?`
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

  const buildSystemPrompt = (stockContext = '') => `You are UpTik AI, the trading assistant for UpTikAlerts. You are sharp, direct, and human — like a knowledgeable friend who trades stocks.

PERSONALITY:
- Conversational and natural, never robotic
- Brief by default — 2-3 sentences max unless asked for more
- Confident but not arrogant
- Occasionally drop a famous investor quote naturally (Buffett, Munger, Lynch, Marks, Druckenmiller)

RESPONSE RULES:
- Answer the question first, disclaimers last and keep them very short
- If you have real-time data in context, USE IT — answer directly and specifically
- Only ask a clarifying question if you genuinely don't understand what they're asking
- Never give a wall of text — if it needs more than 3 sentences, wait for the user to ask
- Write like a text from a smart friend, not a compliance document
- Plain text only, no markdown, no bullet points, no headers

CONTENT:
- Talk freely about trending stocks, price momentum, what's hot and what's not
- Focus on fundamentals when relevant but don't ignore momentum and market sentiment
- Frame opinions as analysis not advice — say "looks strong" not "you should buy"
- Use UpTikAlerts features naturally — mention curated lists, sector groups, daily briefing

USER CONTEXT:
- User's name: ${profile?.username || 'Trader'}
- Active group: ${activeGroup?.name || 'None'}
- Watchlist: ${watchlist.length > 0 ? watchlist.join(', ') : 'empty'}${stockContext}

APP KNOWLEDGE:
UpTikAlerts scoring: Earnings 30% / Fundamentals 25% / Sales Growth 20% / Valuation 10% / Price Trend 10% / Market Cap 5%. Sectors: Tech, Healthcare, Finance, Energy, Industrial, Consumer, Communication. Features: Daily Briefing, Curated Lists, Alerts, Watchlist, Private Chat.

GOOD RESPONSE EXAMPLES:
User: "What stocks are trending up?" → "Tech is leading right now — NVDA and META have strong momentum this week. Want me to break down the fundamentals on either?"
User: "What's SPY at?" → "No live prices on my end — check the Market Pulse strip on your home screen. Last close was around 634. Want a read on where the market is fundamentally?"
User: "Market feels scary" → "Totally normal feeling. As Buffett says — be fearful when others are greedy, be greedy when others are fearful. What are you watching?"`

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput('');
    const userMsg = { role: 'user', text: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      // Detect ticker symbols in the query
      const tickerMatches = userText.match(/\b[A-Z]{1,5}\b|\$[A-Z]{1,5}/g) || [];
      const tickers = [...new Set(tickerMatches.map(t => t.replace('$', '')))].slice(0, 3);

      // Fetch FMP data for detected tickers
      let stockContext = '';
      if (tickers.length > 0) {
        const stockData = await Promise.all(tickers.map(async (ticker) => {
          try {
            const [profileRes, earningsRes] = await Promise.all([
              fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apiKey=${import.meta.env.VITE_FMP_API_KEY}`),
              fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apiKey=${import.meta.env.VITE_FMP_API_KEY}`),
            ]);
            const profile = await profileRes.json();
            const earnings = await earningsRes.json();
            const p = profile?.[0];
            const nextEarnings = earnings?.find(e => e.epsActual === null);
            const lastEarnings = earnings?.find(e => e.epsActual !== null);
            if (!p) return null;
            return `${ticker}: price $${p.price}, sector ${p.sector}, mktcap $${(p.marketCap/1e9).toFixed(1)}B, next earnings ${nextEarnings?.date || 'unknown'}, last EPS actual ${lastEarnings?.epsActual} vs est ${lastEarnings?.epsEstimated}`;
          } catch { return null; }
        }));
        const validData = stockData.filter(Boolean);
        if (validData.length > 0) {
          stockContext = `\n\nREAL-TIME STOCK DATA:\n${validData.join('\n')}`;
        }
      }

      const history = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.text }));
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: buildSystemPrompt(stockContext),
          messages: history,
        }),
      });
      const data = await res.json();
      const aiText = stripMarkdown(data.content?.[0]?.text || 'Unable to respond right now. Try again shortly.');
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
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>Fundamentals · Long-term · No hype</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, WebkitOverflowScrolling: 'touch' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
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
        ))}
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
