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
  // DM peer lookup: { [groupId]: { userId, username, color } }. DM groups
  // store a generic "DM" name, so to render them in the private chat list
  // we need the OTHER participant's display info. Populated during
  // loadProfile and refreshed whenever the membership graph changes.
  const [dmPeers, setDmPeers]       = useState({});

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

      // DM surfacing — do this INDEPENDENTLY of the group_members join above.
      // The find_or_create_dm RPC is supposed to insert a group_members row
      // for both participants (so chat_messages RLS accepts their messages),
      // but older deployments don't, and the user_a row in particular has
      // gone missing in production. Using dm_participants as the source of
      // truth for "which DM groups does this user belong to" keeps the
      // sidebar populated regardless of that drift.
      //
      // We do a two-step fetch (participants, then profiles by id) rather
      // than a PostgREST embedded join — dm_participants has two FKs into
      // profiles (user_id + other_user_id) so embed joins need explicit FK
      // disambiguation, and that FK name isn't guaranteed stable across
      // environments.
      const { data: dmRows, error: dmError } = await supabase
        .from('dm_participants')
        .select('group_id, other_user_id')
        .eq('user_id', session.user.id);

      if (dmError) {
        console.error('[GroupContext] dm_participants lookup failed:', dmError.message);
        setDmPeers({});
      } else if (dmRows && dmRows.length > 0) {
        // Heal missing group_members rows. The deployed find_or_create_dm
        // RPC skipped the user_a insert for some DMs, leaving our own row
        // missing from group_members. Without that row, chat_messages RLS
        // rejects our sends. An upsert is idempotent and safe to run every
        // load — but to avoid an unnecessary write on every mount we only
        // fire it for DM groups where we can't already see our membership.
        const dmGroupIds = dmRows.map(r => r.group_id);
        const knownMembershipGroupIds = new Set(
          (data.group_members || []).map(gm => gm.group_id)
        );
        const missingMembershipIds = dmGroupIds.filter(id => !knownMembershipGroupIds.has(id));
        if (missingMembershipIds.length > 0) {
          const rows = missingMembershipIds.map(gid => ({
            group_id: gid,
            user_id: session.user.id,
            role: 'member',
          }));
          const { error: healErr } = await supabase
            .from('group_members')
            .upsert(rows, { onConflict: 'group_id,user_id' });
          if (healErr && import.meta.env.DEV) {
            console.warn('[GroupContext] DM group_members heal failed:', healErr.message);
          }
        }

        // Fetch peer profiles
        const otherIds = [...new Set(dmRows.map(r => r.other_user_id).filter(Boolean))];
        const profileMap = {};
        if (otherIds.length > 0) {
          const { data: profs, error: profsError } = await supabase
            .from('profiles')
            .select('id, username, color')
            .in('id', otherIds);
          if (profsError) {
            console.error('[GroupContext] DM peer profiles lookup failed:', profsError.message);
          } else if (profs) {
            profs.forEach(pr => { profileMap[pr.id] = pr; });
          }
        }

        // Fetch DM group rows for any DM groups we're not already seeing
        // via group_members — so allGroups contains every DM this user is
        // in, not just the ones where group_members was properly wired.
        const knownIds = new Set(groups.map(g => g.id));
        const missingIds = dmGroupIds.filter(id => !knownIds.has(id));
        let missingGroups = [];
        if (missingIds.length > 0) {
          const { data: extraGroups, error: extraErr } = await supabase
            .from('groups')
            .select('*')
            .in('id', missingIds);
          if (extraErr) {
            console.error('[GroupContext] DM group fetch failed:', extraErr.message);
          } else if (extraGroups) {
            missingGroups = extraGroups;
          }
        }
        if (missingGroups.length > 0) {
          const mergedSeen = new Set();
          const merged = [...groups, ...missingGroups].filter(g => mergedSeen.has(g.id) ? false : mergedSeen.add(g.id));
          setAllGroups(merged);
        }

        const map = {};
        dmRows.forEach(r => {
          const prof = profileMap[r.other_user_id];
          if (!prof && import.meta.env.DEV) {
            console.warn('[GroupContext] DM peer profile missing for', { group_id: r.group_id, other_user_id: r.other_user_id });
          }
          map[r.group_id] = {
            userId: r.other_user_id,
            username: prof?.username || 'User',
            color: prof?.color,
          };
        });
        setDmPeers(map);
      } else {
        setDmPeers({});
      }

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

    // For DM groups, also remove our dm_participants row. loadProfile() uses
    // dm_participants as the source of truth for DM surfacing, so without
    // this the DM re-appears on the next reload even after the group_members
    // delete succeeds. Safe no-op when the row doesn't exist (non-DM group).
    const { error: dmError } = await supabase
      .from('dm_participants')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', session.user.id);
    if (dmError && import.meta.env.DEV) {
      console.warn('[GroupContext] dm_participants delete failed:', dmError.message);
    }

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

  // ── DM: open or create a 1:1 conversation with another user ──
  // Calls the SECURITY DEFINER RPC that either returns the existing DM
  // group's id or creates the group + both dm_participants rows + both
  // group_members rows in one round trip. Then re-hydrates the profile so
  // the new DM shows up in customGroups / dmPeers and enters it.
  const openDm = async (otherUserId) => {
    if (!session?.user?.id) return { error: 'Not signed in' };
    if (!otherUserId || otherUserId === session.user.id) {
      return { error: 'Invalid DM target' };
    }

    const { data: groupId, error } = await supabase.rpc('find_or_create_dm', {
      user_a: session.user.id,
      user_b: otherUserId,
    });
    if (error) {
      console.error('[GroupContext] find_or_create_dm failed:', error.message);
      return { error: error.message };
    }
    if (!groupId) return { error: 'DM creation returned no id' };

    // Belt-and-suspenders: ensure the caller's own group_members row exists.
    // The deployed find_or_create_dm RPC is supposed to insert this, but in
    // production user_a's row is frequently missing — which breaks chat_messages
    // RLS and makes sending messages fail silently. Upserting here is
    // idempotent and cheap.
    const { error: membershipErr } = await supabase
      .from('group_members')
      .upsert(
        { group_id: groupId, user_id: session.user.id, role: 'member' },
        { onConflict: 'group_id,user_id' }
      );
    if (membershipErr && import.meta.env.DEV) {
      console.warn('[GroupContext] openDm membership backfill failed:', membershipErr.message);
    }

    // Re-hydrate so the new DM appears in allGroups + dmPeers
    await loadProfile();

    // Fetch the group row so we can setActiveGroup directly (loadProfile may
    // not have propagated allGroups yet when we set state below).
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();
    if (groupErr) {
      console.error('[GroupContext] openDm group fetch failed:', groupErr.message);
      return { error: groupErr.message };
    }
    if (group) {
      setActiveGroup(group);
      safeSet('uptik_active_group', group.id);
    }
    return { group };
  };

  // ── Derived state ──
  const isAdmin = profile?.is_admin || false;
  const isModerator = profile?.group_members?.find(
    gm => gm.group_id === activeGroup?.id
  )?.role === 'moderator';

  // Split groups into sector (public, non-DM) and custom (private + DM).
  // NOTE: DM groups were created by find_or_create_dm() without explicitly
  // setting is_public, so they inherit the table default (true). We do NOT
  // want DMs in the public/sector rail — they land under Private Chats and
  // render with the peer's display info (see ChatTab private-rows block).
  // The filter keys off is_dm first so this stays correct regardless of
  // what is_public says on legacy DM rows.
  const sectorGroups = allGroups.filter(g => g.is_public && !g.is_dm);
  const customGroups = allGroups.filter(g => g.is_dm || (!g.is_public && !g.sector));

  return (
    <GroupContext.Provider value={{
      profile, activeGroup, allGroups,
      publicGroups, privateGroup,
      sectorGroups, customGroups,
      dmPeers,
      isAdmin, isModerator, loading,
      enterGroup, refreshGroups,
      setActiveGroup,
      createCustomGroup, leaveCustomGroup,
      openDm,
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