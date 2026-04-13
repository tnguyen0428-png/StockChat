// ============================================
// UPTIKALERTS — GroupContext.jsx
// Centralized group and user state
// ============================================

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { safeGet, safeSet, safeRemove } from '../lib/safeStorage';

const GroupContext = createContext(null);

export function GroupProvider({ session, children }) {
  const [profile, setProfile]       = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [allGroups, setAllGroups]   = useState([]);
  const [publicGroups, setPublicGroups] = useState([]);
  const [privateGroup, setPrivateGroup] = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    loadAll();
  }, [session?.user?.id]);

  const loadAll = async () => {
    setLoading(true);
    const results = await Promise.allSettled([loadProfile(), loadPublicGroups()]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const names = ['loadProfile', 'loadPublicGroups'];
        console.error(`[GroupContext] ${names[i]} failed:`, r.reason);
      }
    });
    setLoading(false);
  };

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, group_members(*, groups(*))')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) { console.error('[GroupContext] loadProfile query error:', error.message); return; }
      if (!data) return;

      setProfile(data);
      const rawGroups = (data.group_members || [])
        .map(gm => gm.groups)
        .filter(Boolean);
      // Deduplicate by id (duplicate group_members rows cause repeated entries)
      const seen = new Set();
      const groups = rawGroups.filter(g => seen.has(g.id) ? false : seen.add(g.id));
      setAllGroups(groups);

      // Find private group
      const priv = groups.find(g => g.is_public === false);
      if (priv) setPrivateGroup(priv);

      // Restore last active group
      const savedId = safeGet('uptik_active_group');
      const saved = savedId ? groups.find(g => g.id === savedId) : null;
      if (saved) {
        setActiveGroup(saved);
      } else if (savedId) {
        // Group exists but user isn't a member yet (e.g. just joined via invite link)
        const { data: fallbackGroup } = await supabase
          .from('groups')
          .select('*')
          .eq('id', savedId)
          .maybeSingle();
        if (fallbackGroup) {
          // Auto-join so membership is recorded and the sidebar populates
          const { error: joinError } = await supabase
            .from('group_members')
            .upsert({ group_id: savedId, user_id: session.user.id, role: 'member' }, { onConflict: 'group_id,user_id' });
          if (joinError) console.error('[GroupContext] Auto-join fallback failed:', joinError.message);
          else await loadProfile(); // re-sync so allGroups includes the new membership
          setActiveGroup(fallbackGroup);
        } else {
          // Group no longer exists — clear the stale reference
          safeRemove('uptik_active_group');
        }
      }
    } catch (err) {
      console.error('[GroupContext] loadProfile crashed:', err);
    }
  };

  const loadPublicGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: true });
      if (error) { console.error('[GroupContext] loadPublicGroups error:', error.message); return; }
      if (data) setPublicGroups(data);
    } catch (err) {
      console.error('[GroupContext] loadPublicGroups crashed:', err);
    }
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
    safeSet('uptik_active_group', group.id);
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
      safeRemove('uptik_active_group');
    }

    await loadProfile();
    return { success: true };
  };

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