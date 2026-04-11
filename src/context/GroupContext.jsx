// ============================================
// UPTIKALERTS — GroupContext.jsx
// Centralized group and user state
// ============================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const GroupContext = createContext(null);

export function GroupProvider({ session, children }) {
  const [profile, setProfile]       = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [allGroups, setAllGroups]   = useState([]);
  const [publicGroups, setPublicGroups] = useState([]);
  const [privateGroup, setPrivateGroup] = useState(null);
  const [loading, setLoading]       = useState(true);

  // ── DM State ──
  const [dmConversations, setDmConversations] = useState([]);
  const [activeDM, setActiveDM]     = useState(null);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);

  // ── Online Presence ──
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    if (!session?.user) return;
    loadAll();
  }, [session?.user?.id]);

  // ── Presence: track who's online ──
  useEffect(() => {
    if (!session?.user?.id) return;

    const presenceChannel = supabase.channel('uptik-presence', {
      config: { presence: { key: session.user.id } },
    });

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      setOnlineUsers(new Set(Object.keys(state)));
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => supabase.removeChannel(presenceChannel);
  }, [session?.user?.id]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProfile(), loadPublicGroups(), loadDMConversations()]);
    setLoading(false);
  };

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, group_members(*, groups(*))')
      .eq('id', session.user.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
      const groups = (data.group_members || [])
        .map(gm => gm.groups)
        .filter(Boolean);
      setAllGroups(groups);

      // Find private group
      const priv = groups.find(g => g.is_public === false);
      if (priv) setPrivateGroup(priv);

      // Restore last active group
      const savedId = localStorage.getItem('uptik_active_group');
      const saved = savedId ? groups.find(g => g.id === savedId) : null;
      if (saved) {
        setActiveGroup(saved);
      } else if (savedId) {
        // Fallback: group may not be in member list yet (just joined)
        const { data: fallbackGroup } = await supabase
          .from('groups')
          .select('*')
          .eq('id', savedId)
          .maybeSingle();
        if (fallbackGroup) setActiveGroup(fallbackGroup);
      }
    }
  };

  const loadPublicGroups = async () => {
    const { data } = await supabase
      .from('groups')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: true });
    if (data) setPublicGroups(data);
  };

  const enterGroup = async (group) => {
    // Auto-join public group if not already a member
    const isMember = allGroups.some(g => g.id === group.id);
    if (!isMember && group.is_public) {
      const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: session.user.id,
        role: 'member',
      });
      if (error) console.error('[GroupContext] Auto-join failed:', error.message);
      else await loadProfile();
    }
    setActiveGroup(group);
    localStorage.setItem('uptik_active_group', group.id);
  };

  // ── Custom Group: Create ──
  const createCustomGroup = async (name, color = '#7B68EE') => {
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Group name is required' };

    // 1. Insert the group
    const { data: newGroup, error: groupError } = await supabase
      .from('groups')
      .insert({
        name: trimmed,
        color,
        is_public: false,
        sector: null,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (groupError) return { error: groupError.message };

    // 2. Add creator as member with 'creator' role
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: newGroup.id,
        user_id: session.user.id,
        role: 'creator',
      });

    if (memberError) {
      // Rollback: delete the orphaned group
      await supabase.from('groups').delete().eq('id', newGroup.id);
      return { error: memberError.message };
    }

    // 3. Refresh groups so it appears in the switcher
    await loadProfile();

    return { group: newGroup };
  };

  // ── Custom Group: Leave ──
  const leaveCustomGroup = async (groupId) => {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', session.user.id);

    if (error) return { error: error.message };

    // If leaving the active group, clear it
    if (activeGroup?.id === groupId) {
      setActiveGroup(null);
      localStorage.removeItem('uptik_active_group');
    }

    await loadProfile();
    return { success: true };
  };

  // ── DM: Load all conversations ──
  const loadDMConversations = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('dm_participants')
        .select('*, groups(*), other:profiles!dm_participants_other_user_id_fkey(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      // Graceful fallback if migration hasn't run yet
      if (error) {
        console.warn('[DM] dm_participants not available:', error.message);
        return;
      }

      if (data && data.length > 0) {
        // Batch: get all DM group IDs, then fetch last messages + unread in fewer queries
        const groupIds = data.map(dp => dp.group_id);

        // Fetch last message per DM group (one query)
        const { data: recentMsgs } = await supabase
          .from('chat_messages')
          .select('group_id, text, created_at, username')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false });

        // Build last-message map (first occurrence per group is the latest)
        const lastMsgMap = {};
        for (const msg of (recentMsgs || [])) {
          if (!lastMsgMap[msg.group_id]) lastMsgMap[msg.group_id] = msg;
        }

        const convos = data.map(dp => {
          const lastMsg = lastMsgMap[dp.group_id] || null;
          const readCutoff = dp.last_read_at || dp.created_at;

          // Count actual unread messages (not just 1)
          const unreadCount = (recentMsgs || []).filter(msg =>
            msg.group_id === dp.group_id &&
            new Date(msg.created_at) > new Date(readCutoff)
          ).length;

          return {
            groupId: dp.group_id,
            group: dp.groups,
            otherUser: dp.other,
            lastMessage: lastMsg,
            unreadCount,
            lastReadAt: dp.last_read_at,
          };
        });

        setDmConversations(convos);
        // Total unread messages across all DMs (not count of unread conversations)
        setDmUnreadCount(convos.reduce((sum, c) => sum + c.unreadCount, 0));
      } else {
        setDmConversations([]);
        setDmUnreadCount(0);
      }
    } catch (err) {
      // Migration not yet applied — silently degrade
      console.warn('[DM] Failed to load DMs:', err.message);
    }
  };

  // ── DM: Start or open a DM with another user ──
  const startDM = async (otherUserId) => {
    if (!session?.user?.id || otherUserId === session.user.id) return null;

    // Use the DB function to find or create
    const { data, error } = await supabase
      .rpc('find_or_create_dm', { user_a: session.user.id, user_b: otherUserId });

    if (error) {
      console.error('[DM] Failed to start DM:', error.message);
      return null;
    }

    const dmGroupId = data;

    // Load the other user's profile
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .maybeSingle();

    // Load the group
    const { data: dmGroup } = await supabase
      .from('groups')
      .select('*')
      .eq('id', dmGroupId)
      .maybeSingle();

    // Compute shared tickers between both users' watchlists
    await computeSharedTickers(dmGroupId, session.user.id, otherUserId);

    // Refresh DM list
    await loadDMConversations();

    const dm = { groupId: dmGroupId, group: dmGroup, otherUser: otherProfile };
    setActiveDM(dm);
    return dm;
  };

  // ── DM: Compute shared watchlist tickers ──
  const computeSharedTickers = async (dmGroupId, userA, userB) => {
    const [{ data: wlA }, { data: wlB }] = await Promise.all([
      supabase.from('user_watchlist').select('symbol').eq('user_id', userA),
      supabase.from('user_watchlist').select('symbol').eq('user_id', userB),
    ]);

    const symbolsA = new Set((wlA || []).map(w => w.symbol));
    const shared = (wlB || []).filter(w => symbolsA.has(w.symbol)).map(w => w.symbol);

    // Upsert shared tickers
    if (shared.length > 0) {
      await supabase.from('dm_shared_tickers').upsert(
        shared.map(symbol => ({ group_id: dmGroupId, symbol, updated_at: new Date().toISOString() })),
        { onConflict: 'group_id,symbol' }
      );
    }
  };

  // ── DM: Mark conversation as read ──
  // Memoized so effects in DMChat can safely list it as a dependency
  // without re-running on every GroupProvider render.
  const markDMRead = useCallback(async (dmGroupId) => {
    if (!session?.user?.id) return;
    try {
      await supabase
        .from('dm_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('group_id', dmGroupId)
        .eq('user_id', session.user.id);
    } catch (err) {
      console.warn('[DM] markDMRead failed:', err.message);
      return;
    }

    // Update local state — use functional updaters to avoid stale closures
    setDmConversations(prev => {
      const updated = prev.map(c =>
        c.groupId === dmGroupId ? { ...c, unreadCount: 0, lastReadAt: new Date().toISOString() } : c
      );
      // Decrement by the actual number of unread messages in this DM, not just 1
      const wasUnread = prev.find(c => c.groupId === dmGroupId)?.unreadCount || 0;
      if (wasUnread > 0) {
        setDmUnreadCount(prevCount => Math.max(0, prevCount - wasUnread));
      }
      return updated;
    });
  }, [session?.user?.id]);

  // ── DM: Delete (soft) — removes YOUR side of the conversation ──
  const deleteDM = async (dmGroupId) => {
    if (!session?.user?.id) return;
    try {
      await supabase
        .from('dm_participants')
        .delete()
        .eq('group_id', dmGroupId)
        .eq('user_id', session.user.id);

      // Remove from local state instantly
      setDmConversations(prev => {
        const updated = prev.filter(c => c.groupId !== dmGroupId);
        setDmUnreadCount(updated.reduce((sum, c) => sum + c.unreadCount, 0));
        return updated;
      });

      // If this DM was active, close it
      if (activeDM?.groupId === dmGroupId) closeDM();
    } catch (err) {
      console.warn('[DM] deleteDM failed:', err.message);
    }
  };

  // ── DM: Close active DM ──
  const closeDM = () => setActiveDM(null);

  const refreshGroups = async () => {
    await loadAll();
  };

  // ── Derived state ──
  const isAdmin = profile?.is_admin || false;
  const isModerator = profile?.group_members?.find(
    gm => gm.group_id === activeGroup?.id
  )?.role === 'moderator';

  // Split groups into sector (public) and custom (private, no sector)
  const sectorGroups = allGroups.filter(g => g.is_public);
  const customGroups = allGroups.filter(g => !g.is_public && !g.sector);

  return (
    <GroupContext.Provider value={{
      profile, activeGroup, allGroups,
      publicGroups, privateGroup,
      sectorGroups, customGroups,
      isAdmin, isModerator, loading,
      enterGroup, refreshGroups,
      setActiveGroup,
      createCustomGroup, leaveCustomGroup,
      // DM
      dmConversations, activeDM, dmUnreadCount,
      startDM, markDMRead, closeDM, setActiveDM,
      loadDMConversations, deleteDM,
      // Presence
      onlineUsers,
    }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used inside GroupProvider');
  return ctx;
}
