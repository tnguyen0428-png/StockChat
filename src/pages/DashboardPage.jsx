// ============================================
// UPTIKALERTS — DashboardPage.jsx
// Main dashboard shell — reads from GroupContext
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGroup } from '../context/GroupContext';

// Tab components
import HomeTab    from '../components/tabs/HomeTab';
import AlertsTab  from '../components/tabs/AlertsTab';
import ChatTab    from '../components/tabs/ChatTab';
import ProfileTab from '../components/tabs/ProfileTab';
import HelpTab    from '../components/tabs/HelpTab';
import AITab      from '../components/tabs/AITab';

// Shared components
import Header     from '../components/shared/Header';
import BottomNav  from '../components/shared/BottomNav';

export default function DashboardPage({ session }) {
  const navigate = useNavigate();
  const {
    profile, activeGroup, allGroups,
    publicGroups, privateGroup,
    isAdmin, isModerator, loading,
    enterGroup, refreshGroups,
  } = useGroup();

  const [activeTab, setActiveTab]         = useState(() => {
    const redirect = localStorage.getItem('uptik_join_redirect');
    if (redirect) {
      localStorage.removeItem('uptik_join_redirect');
      return redirect;
    }
    return 'home';
  });
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [unreadAlerts, setUnreadAlerts]   = useState(false);
  const [unreadChat, setUnreadChat]       = useState(false);
  const dismissTimerRef = useRef(null);

  // Listen for broadcasts
  useEffect(() => {
    if (!activeGroup?.id) return;

    const cutoff = new Date(Date.now() - 40000).toISOString();
    supabase
      .from('broadcasts')
      .select('*')
      .eq('group_id', activeGroup.id)
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
      .channel(`broadcasts_${activeGroup.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'broadcasts',
        filter: `group_id=eq.${activeGroup.id}`,
      }, (payload) => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setActiveBroadcast(payload.new);
        if (!payload.new.is_mod_alert) {
          dismissTimerRef.current = setTimeout(() => setActiveBroadcast(null), 40000);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeGroup?.id]);

  useEffect(() => {
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
  }, []);

  useEffect(() => {
    if (activeTab === 'alerts') setUnreadAlerts(false);
    if (activeTab === 'chat')   setUnreadChat(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'chat' && publicGroups.length > 0 && !activeGroup) {
      const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public');
      if (uptikPublic) enterGroup(uptikPublic);
    }
  }, [activeTab, publicGroups]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleGroupSelect = (group) => {
    enterGroup(group);
    setActiveTab('chat');
  };

  function broadcastColor(type) {
    const colors = { BULLISH: '#1AAD5E', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
    return colors[type] || '#1AAD5E';
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          <span style={{ color: 'var(--green)' }}>UpTik</span>
          <span style={{ color: 'var(--text1)' }}>Alerts</span>
        </div>
        <div style={{
          width: 24, height: 24,
          border: '2px solid var(--border)',
          borderTopColor: 'var(--green)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={styles.page}>

      <Header
        group={activeGroup}
        profile={profile}
        isAdmin={isAdmin}
        isModerator={isModerator}
        activeTab={activeTab}
        allGroups={allGroups}
        onGroupSwitch={enterGroup}
        onGroupNameUpdate={(newName) => {}}
        onSignOut={handleSignOut}
        onHomePress={() => setActiveTab('home')}
        onProfilePress={() => setActiveTab('profile')}
      />

      {/* Broadcast Banner */}
      {activeBroadcast && (() => {
        const isModAlert = activeBroadcast.is_mod_alert;
        const typeColor  = broadcastColor(activeBroadcast.type);
        const bgColor    = isModAlert ? typeColor : '#1e293b';
        const flashEnd   = isModAlert ? typeColor : 'rgba(255,255,255,0.3)';
        return (
          <>
            <style>{`
              @keyframes bcScroll { 0% { left: 100%; } 100% { left: -200%; } }
              @keyframes bcBgPulse { 0%, 100% { opacity: 0.88; } 50% { opacity: 1; } }
              @keyframes bcTextFlash { 0%, 49% { color: #ffffff; } 50%, 100% { color: ${flashEnd}; } }
            `}</style>
            <div style={{ ...styles.broadcast, background: bgColor, animation: 'bcBgPulse 3.5s ease-in-out infinite' }}>
              {isModAlert && <span style={styles.bcLabel}>{activeBroadcast.type}</span>}
              <div style={styles.bcScrollWrap}>
                <span style={{ ...styles.bcScrollText, animation: 'bcScroll 25s linear infinite, bcTextFlash 2.5s step-end infinite' }}>
                  {activeBroadcast.title}
                </span>
              </div>
              <button onClick={() => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); setActiveBroadcast(null); }} style={styles.bcDismiss}>✕</button>
            </div>
          </>
        );
      })()}

      {/* Tab Content */}
      <div style={styles.content}>
        {activeTab === 'home' && (
          <HomeTab
            session={session}
            onGroupSelect={handleGroupSelect}
            onAIPress={() => setActiveTab('ai')}
            onSignOut={handleSignOut}
            onProfilePress={() => setActiveTab('profile')}
          />
        )}
        {activeTab === 'ai' && <AITab session={session} />}
        {activeTab === 'alerts' && (
          <AlertsTab session={session} group={activeGroup} />
        )}
        {activeTab === 'chat' && activeGroup && (
          <ChatTab
            session={session}
            profile={profile}
            group={activeGroup}
            isAdmin={isAdmin}
            isModerator={isModerator}
            setUnreadChat={setUnreadChat}
          />
        )}
        {activeTab === 'chat' && !activeGroup && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>Loading chat...</div>
          </div>
        )}
        {activeTab === 'help' && <HelpTab />}
        {activeTab === 'profile' && (
          <ProfileTab
            session={session}
            profile={profile}
            group={activeGroup}
            isAdmin={isAdmin}
            onSignOut={handleSignOut}
          />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadAlerts={unreadAlerts}
        unreadChat={unreadChat}
      />

    </div>
  );
}

const styles = {
  page: {
    height: '100vh', background: 'var(--bg)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', maxWidth: 480,
    margin: '0 auto', position: 'relative',
  },
  broadcast: {
    display: 'flex', alignItems: 'center',
    gap: 8, flexShrink: 0,
    padding: '0 12px', height: 44, overflow: 'hidden',
  },
  bcLabel: {
    fontSize: 10, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: 1,
    color: '#fff', flexShrink: 0,
    background: 'rgba(0,0,0,0.22)',
    padding: '3px 8px', borderRadius: 4,
  },
  bcScrollWrap: {
    flex: 1, overflow: 'hidden',
    position: 'relative', height: '100%',
    display: 'flex', alignItems: 'center',
  },
  bcScrollText: {
    position: 'absolute', whiteSpace: 'nowrap',
    fontWeight: 700, fontSize: 14, color: '#fff',
  },
  bcDismiss: {
    background: 'rgba(0,0,0,0.2)', border: 'none',
    color: '#fff', fontSize: 12, cursor: 'pointer',
    flexShrink: 0, width: 22, height: 22,
    borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
  content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};
