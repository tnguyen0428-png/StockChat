// ============================================
// UPTIKALERTS — DashboardPage.jsx
// Main dashboard shell with 5 tab navigation
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Tab components
import HomeTab    from '../components/tabs/HomeTab';
import AlertsTab  from '../components/tabs/AlertsTab';
import ChatTab    from '../components/tabs/ChatTab';

import ProfileTab from '../components/tabs/ProfileTab';

// Shared components
import Header     from '../components/shared/Header';
import BottomNav  from '../components/shared/BottomNav';

const LS_KEY = 'uptik_selected_group';

export default function DashboardPage({ session }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [profile, setProfile] = useState(null);
  const [group, setGroup] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [unreadAlerts, setUnreadAlerts] = useState(false);
  const [unreadChat, setUnreadChat] = useState(false);

  // Auto-dismiss timer ref
  const dismissTimerRef = useRef(null);

  // Load user profile and group
  useEffect(() => {
    if (!session?.user) return;

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

        if (groups.length) {
          const savedId = localStorage.getItem(LS_KEY);
          const saved   = savedId ? groups.find(g => g.id === savedId) : null;
          const active  = saved || groups[0];
          setGroup(active);
          localStorage.setItem(LS_KEY, active.id);
        }
      }
    };

    loadProfile();
  }, [session]);

  // Switch active group (called from Header group switcher)
  const switchGroup = (g) => {
    setGroup(g);
    setActiveBroadcast(null);
    localStorage.setItem(LS_KEY, g.id);
  };

  // Listen for broadcasts + fetch recent one on load
  useEffect(() => {
    if (!group?.id) return;

    // Show most recent admin broadcast if it arrived within last 40s
    const cutoff = new Date(Date.now() - 40000).toISOString();
    supabase
      .from('broadcasts')
      .select('*')
      .eq('group_id', group.id)
      .eq('is_mod_alert', false)
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActiveBroadcast(data);
          const age = Date.now() - new Date(data.created_at).getTime();
          const remaining = 40000 - age;
          if (remaining > 0) {
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = setTimeout(() => setActiveBroadcast(null), remaining);
          }
        }
      });

    const channel = supabase
      .channel(`broadcasts_${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'broadcasts',
        filter: `group_id=eq.${group.id}`,
      }, (payload) => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setActiveBroadcast(payload.new);
        if (!payload.new.is_mod_alert) {
          dismissTimerRef.current = setTimeout(() => setActiveBroadcast(null), 40000);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  // Cleanup dismiss timer on unmount
  useEffect(() => {
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
  }, []);

  // Mark alerts/chat as read when tab opened
  useEffect(() => {
    if (activeTab === 'alerts') setUnreadAlerts(false);
    if (activeTab === 'chat') setUnreadChat(false);
  }, [activeTab]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isAdmin     = profile?.is_admin || false;
  // Check moderator role against the active group specifically
  const isModerator = profile?.group_members?.find(gm => gm.group_id === group?.id)?.role === 'moderator';

  return (
    <div style={styles.page}>

      {/* Header */}
      <Header
        group={group}
        profile={profile}
        isAdmin={isAdmin}
        isModerator={isModerator}
        activeTab={activeTab}
        allGroups={allGroups}
        onGroupSwitch={switchGroup}
        onGroupNameUpdate={(newName) => setGroup(prev => ({ ...prev, name: newName }))}
        onSignOut={handleSignOut}
      />

      {/* Active Broadcast Banner */}
      {activeBroadcast && (() => {
        const isModAlert = activeBroadcast.is_mod_alert;
        const typeColor  = broadcastColor(activeBroadcast.type);
        const bgColor    = isModAlert ? typeColor : '#1e293b';
        const flashEnd   = isModAlert ? typeColor : 'rgba(255,255,255,0.3)';
        return (
          <>
            <style>{`
              @keyframes bcScroll {
                0%   { left: 100%; }
                100% { left: -200%; }
              }
              @keyframes bcBgPulse {
                0%, 100% { opacity: 0.88; }
                50%       { opacity: 1; }
              }
              @keyframes bcTextFlash {
                0%, 49%   { color: #ffffff; }
                50%, 100% { color: ${flashEnd}; }
              }
            `}</style>
            <div style={{
              ...styles.broadcast,
              background: bgColor,
              animation: 'bcBgPulse 3.5s ease-in-out infinite',
            }}>
              {isModAlert && (
                <span style={styles.bcLabel}>{activeBroadcast.type}</span>
              )}
              <div style={styles.bcScrollWrap}>
                <span style={{
                  ...styles.bcScrollText,
                  animation: 'bcScroll 25s linear infinite, bcTextFlash 2.5s step-end infinite',
                }}>
                  {activeBroadcast.title}
                </span>
              </div>
              <button
                onClick={() => {
                  if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                  setActiveBroadcast(null);
                }}
                style={styles.bcDismiss}
              >
                ✕
              </button>
            </div>
          </>
        );
      })()}

      {/* Tab Content */}
      <div style={styles.content}>
        {activeTab === 'home' && (
  <HomeTab
    session={session}
    profile={profile}
    allGroups={allGroups}
    isAdmin={isAdmin}
    onGroupSelect={(g, tab) => { switchGroup(g); setActiveTab(tab); }}
    onGroupsRefresh={async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, group_members(*, groups(*))')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data) {
        const groups = (data.group_members || []).map(gm => gm.groups).filter(Boolean);
        setAllGroups(groups);
      }
    }}
  />
)}
        {activeTab === 'alerts'  && <AlertsTab session={session} group={group} />}
        {activeTab === 'chat'    && <ChatTab session={session} profile={profile} group={group} isAdmin={isAdmin} isModerator={isModerator} setUnreadChat={setUnreadChat} />}
        
        {activeTab === 'profile' && <ProfileTab session={session} profile={profile} group={group} isAdmin={isAdmin} onSignOut={handleSignOut} />}
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadAlerts={unreadAlerts}
        unreadChat={unreadChat}
      />

    </div>
  );
}

// ── Color helper (used by broadcast banner) ──
function broadcastColor(type) {
  const colors = { BULLISH: '#1AAD5E', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
  return colors[type] || '#1AAD5E';
}

// ── Styles ──
const styles = {
  page: {
    height: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    maxWidth: 480,
    margin: '0 auto',
    position: 'relative',
  },
  broadcast: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    padding: '0 12px',
    height: 44,
    overflow: 'hidden',
  },
  bcLabel: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#fff',
    flexShrink: 0,
    background: 'rgba(0,0,0,0.22)',
    padding: '3px 8px',
    borderRadius: 4,
  },
  bcScrollWrap: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  bcScrollText: {
    position: 'absolute',
    whiteSpace: 'nowrap',
    fontWeight: 700,
    fontSize: 14,
    color: '#fff',
  },
  bcDismiss: {
    background: 'rgba(0,0,0,0.2)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};
