import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { askUpTikAI } from '../lib/aiAgent';

export function useHomeChat(session, profile, publicGroups, watchlist) {
  const [chatMessages, setChatMessages] = useState([]);
  const [homeGroup, setHomeGroup]       = useState(null);
  const [chatInput, setChatInputRaw]    = useState(() => localStorage.getItem('uptik_chat_draft') || '');
  const [chatSending, setChatSending]   = useState(false);
  const [aiMode, setAiMode]             = useState(() => localStorage.getItem('uptik_ai_mode') === '1');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiLastTicker, setAiLastTicker] = useState(null);
  const [isListening, setIsListening]   = useState(false);

  const recognitionRef = useRef(null);
  const chatInputRef   = useRef(null);
  const chatStripRef   = useRef(null);
  const chatSectionRef = useRef(null);

  const setChatInput = (val) => {
    setChatInputRaw(val);
    if (val) localStorage.setItem('uptik_chat_draft', val);
    else localStorage.removeItem('uptik_chat_draft');
  };

  // Persist AI mode preference
  useEffect(() => {
    localStorage.setItem('uptik_ai_mode', aiMode ? '1' : '0');
  }, [aiMode]);

  // Cleanup speech recognition on unmount
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  // Pin scroll to latest chat message
  useEffect(() => {
    const el = chatStripRef.current;
    if (!el) return;
    const findScroller = () => {
      if (el.scrollHeight > el.clientHeight) return el;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const scroller = findScroller();
    const nearBottom = () => {
      const isWin = scroller === document.scrollingElement || scroller === document.documentElement;
      const top = isWin ? window.scrollY : scroller.scrollTop;
      const h = isWin ? document.documentElement.scrollHeight : scroller.scrollHeight;
      const ch = isWin ? window.innerHeight : scroller.clientHeight;
      return h - top - ch < 120;
    };
    if (!nearBottom()) return;
    const pin = () => {
      if (!nearBottom()) return;
      const isWin = scroller === document.scrollingElement || scroller === document.documentElement;
      if (isWin) window.scrollTo(0, document.documentElement.scrollHeight);
      else scroller.scrollTop = scroller.scrollHeight;
    };
    const raf = requestAnimationFrame(pin);
    const t1 = setTimeout(pin, 80);
    const t2 = setTimeout(pin, 250);
    const t3 = setTimeout(pin, 600);
    const t4 = setTimeout(pin, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, [chatMessages.length, aiLoading]);

  // Resolve UpTik Public group
  useEffect(() => {
    const findGroup = async () => {
      try {
        const fromCtx = publicGroups.find(g => g.name === 'UpTik Public');
        if (fromCtx) { setHomeGroup(fromCtx); return; }
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .eq('name', 'UpTik Public')
          .single();
        if (error && error.code !== 'PGRST116') throw error; // ignore "not found"
        if (data) setHomeGroup(data);
        else if (publicGroups[0]) setHomeGroup(publicGroups[0]);
      } catch (err) {
        console.error('[HomeChat] findGroup failed:', err.message);
        if (publicGroups[0]) setHomeGroup(publicGroups[0]);
      }
    };
    findGroup();
  }, [publicGroups]);

  // Load chat preview + subscribe to real-time updates
  useEffect(() => {
    if (publicGroups.length > 0) {
      loadChatMessages(null, chatExpanded);
    }
    const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
    if (!uptikPublic) return;
    const channel = supabase
      .channel('home_chat_' + uptikPublic.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: 'group_id=eq.' + uptikPublic.id,
      }, (payload) => {
        setChatMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [publicGroups]);

  const loadChatMessages = async (groupOverride, expanded) => {
    const target = groupOverride || homeGroup || publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
    if (!target) return;
    try {
      const msgLimit = expanded ? 25 : 5;
      let { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('group_id', target.id)
        .order('created_at', { ascending: false })
        .limit(msgLimit);
      if (error) throw error;
      if (!data || data.length === 0) {
        const { data: fallback, error: fbErr } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(msgLimit);
        if (fbErr) throw fbErr;
        data = fallback;
      }
      if (data) setChatMessages(data.reverse());
    } catch (err) {
      console.error('[HomeChat] loadChatMessages failed:', err.message);
    }
  };

  const handleHomeSend = async () => {
    const raw = chatInput.trim();
    if (!raw || chatSending || !profile) return;
    let group = homeGroup;
    if (!group) {
      group = publicGroups.find(g => g.name === 'UpTik Public') || publicGroups[0];
      if (group) setHomeGroup(group);
    }
    if (!group) return;
    const text = aiMode ? `@AI ${raw}` : raw;

    chatInputRef.current?.blur();
    setChatSending(true);
    try {
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: group.id,
        user_id: session.user.id,
        username: profile.username,
        user_color: profile.color,
        text,
        type: 'user',
        is_admin: false,
      }).select().single();

      if (error) {
        console.error('[Home] Send error:', error);
      } else if (data) {
        setChatInput('');
        setChatMessages(prev => [...prev, data]);
        setTimeout(() => {
          if (chatStripRef.current) {
            chatStripRef.current.scrollTop = chatStripRef.current.scrollHeight;
          }
        }, 50);

        if (aiMode) {
          setAiLoading(true);
          try {
            const recentHistory = chatMessages
              .filter(m => m.user_id === 'user_ai' || /@AI\b/i.test(m.text))
              .slice(-8)
              .map(m => ({
                role: m.user_id === 'user_ai' ? 'assistant' : 'user',
                content: (m.text || '').replace(/@AI\s*/i, ''),
              }));
            const { text: aiReply, newLastTicker } = await askUpTikAI({
              userText: raw,
              history: recentHistory,
              lastTicker: aiLastTicker,
              username: profile?.username,
              groupName: group?.name,
              watchlist: watchlist.map(w => w.symbol),
            });
            if (newLastTicker) setAiLastTicker(newLastTicker);
            const { data: aiMsg } = await supabase.from('chat_messages').insert({
              group_id: group.id, user_id: 'user_ai',
              username: 'UpTik', user_color: '#8B5CF6',
              text: aiReply, type: 'ai', is_admin: false,
            }).select().single();
            if (aiMsg) setChatMessages(prev => [...prev, aiMsg]);
          } catch (aiErr) {
            console.error('[Home AI] Error:', aiErr.message);
          } finally {
            setAiLoading(false);
          }
        }
      }
    } catch (err) {
      console.error('[Home] Send failed:', err.message);
    } finally {
      setChatSending(false);
    }
  };

  const toggleListening = (showToast) => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast?.('Voice input not supported on this browser'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalTranscript = '';
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setChatInput(chatInput + finalTranscript + interim);
    };
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleHomeSendSticker = (sticker) => {
    const current = chatInputRef.current?.value || '';
    setChatInput(current + sticker.emoji);
    if (chatInputRef.current) chatInputRef.current.focus();
  };

  return {
    chatMessages, setChatMessages,
    homeGroup, setHomeGroup,
    chatInput, setChatInput,
    chatSending,
    aiMode, setAiMode,
    chatExpanded, setChatExpanded,
    aiLoading,
    aiLastTicker,
    isListening,
    recognitionRef, chatInputRef, chatStripRef, chatSectionRef,
    loadChatMessages,
    handleHomeSend, handleHomeSendSticker, toggleListening,
  };
}
