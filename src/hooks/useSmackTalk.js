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
    // Client-side join with profiles. challenge_chat.user_id FK points at
    // auth.users (not profiles) as of migration 20260426000000, so
    // PostgREST can't resolve a `select('*, profiles(...)')` embed —
    // it errors with "Could not find a relationship between
    // 'challenge_chat' and 'profiles' in the schema cache". Fetch rows
    // and profiles separately, then stitch by user_id to preserve the
    // `m.profiles?.username` / `m.profiles?.color` shape the renderer
    // in PortfolioTab depends on.
    const { data: rows, error } = await supabase
      .from('challenge_chat')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      console.error('[SmackTalk] loadTrashTalk failed:', error.message);
      return;
    }
    if (!rows) return;
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    let profilesById = {};
    if (userIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, color')
        .in('id', userIds);
      if (pErr) console.error('[SmackTalk] loadTrashTalk profiles failed:', pErr.message);
      if (profs) profilesById = Object.fromEntries(profs.map(p => [p.id, p]));
    }
    const merged = rows.map(r => {
      const profile = profilesById[r.user_id] || null;
      if (!profile && import.meta.env.DEV) {
        console.warn('[SmackTalk] profile lookup missed for chat row', { msgId: r.id, userId: r.user_id });
      }
      return { ...r, profiles: profile };
    });
    setTrashTalkMsgs(merged.reverse());
    const rxnMap = {};
    merged.forEach(m => { if (m.reactions) rxnMap[m.id] = m.reactions; });
    setChatReactions(prev => ({ ...prev, ...rxnMap }));
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
