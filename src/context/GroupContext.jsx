// ============================================
// UPTIKALERTS — GroupContext.jsx
// Centralized group and user state
// ============================================

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
    await Promise.all([loadProfile(), loadPublicGroups()]);
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
      await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: session.user.id,
        role: 'member',
      });
      await loadProfile();
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

    if (memberError) return { error: memberError.message };

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
