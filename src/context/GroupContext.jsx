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
      if (saved) setActiveGroup(saved);
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

  const refreshGroups = async () => {
    await loadAll();
  };

  const isAdmin = profile?.is_admin || false;
  const isModerator = profile?.group_members?.find(
    gm => gm.group_id === activeGroup?.id
  )?.role === 'moderator';

  return (
    <GroupContext.Provider value={{
      profile, activeGroup, allGroups,
      publicGroups, privateGroup,
      isAdmin, isModerator, loading,
      enterGroup, refreshGroups,
      setActiveGroup,
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
