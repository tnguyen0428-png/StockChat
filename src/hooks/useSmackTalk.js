import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const REACTIONS = [
  { emoji: '🔥', label: 'fire' },
  { emoji: '💀', label: 'dead' },
  { emoji: '👑', label: 'respect' },
  { emoji: '👀', label: 'watching' },
  { emoji: '😂', label: 'cap' },
];

export function useSmackTalk(session) {
  const [trashTalkMsgs, setTrashTalkMsgs]   = useState([]);
  const [trashTalkInput, setTrashTalkInput] = useState('');
  const [chatReactions, setChatReactions]   = useState({});

  const loadTrashTalk = useCallback(async () => {
    const { data, error } = await supabase
      .from('challenge_chat')
      .select('*, profiles(username, color)')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.error('[SmackTalk] loadTrashTalk failed:', error.message);
    if (data) {
      setTrashTalkMsgs(data.reverse());
      const rxnMap = {};
      data.forEach(m => { if (m.reactions) rxnMap[m.id] = m.reactions; });
      setChatReactions(prev => ({ ...prev, ...rxnMap }));
    }
  }, []);

  useEffect(() => { loadTrashTalk(); }, [loadTrashTalk]);

  useEffect(() => {
    const channel = supabase
      .channel('challenge_chat_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenge_chat' }, () => loadTrashTalk())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadTrashTalk]);

  const sendTrashTalk = async () => {
    const msg = trashTalkInput.trim();
    if (!msg || !session?.user?.id) return;
    // Clear input immediately so UX feels responsive. DO NOT blur the active
    // element — that dismisses the mobile keyboard after every send and
    // forces the user to re-tap the field. Every modern chat app keeps the
    // keyboard up for consecutive smack talk. Matches the chat send fix.
    setTrashTalkInput('');
    const { error } = await supabase.from('challenge_chat').insert({
      user_id: session.user.id,
      message: msg,
    });
    if (error) console.error('[SmackTalk] sendTrashTalk failed:', error.message);
  };

  const toggleReaction = async (msgId, reactionType) => {
    if (!session?.user?.id) return;
    const current  = chatReactions[msgId] || {};
    const users    = current[reactionType] || [];
    const alreadyReacted = users.includes(session.user.id);
    const updated  = {
      ...current,
      [reactionType]: alreadyReacted
        ? users.filter(u => u !== session.user.id)
        : [...users, session.user.id],
    };
    setChatReactions(prev => ({ ...prev, [msgId]: updated }));
    try {
      const { error } = await supabase.from('challenge_chat').update({ reactions: updated }).eq('id', msgId);
      if (error) console.error('[SmackTalk] toggleReaction failed:', error.message);
    } catch (err) {
      console.error('[SmackTalk] toggleReaction threw:', err.message);
    }
  };

  return {
    trashTalkMsgs,
    trashTalkInput, setTrashTalkInput,
    chatReactions,
    loadTrashTalk, sendTrashTalk, toggleReaction,
  };
}
