// ============================================
// UPTIKALERTS — DashboardPage.jsx
// Main dashboard shell — reads from GroupContext
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGroup } from '../context/GroupContext';

// Tab components
import HomeTab    from '../components/tabs/HomeTab';
// Original: import AlertsTab from '../components/tabs/AlertsTab';
import AlertsTab  from '../components/tabs/AlertsTabRedesign';
import ChatTab    from '../components/tabs/ChatTab';
import ProfileTab from '../components/tabs/ProfileTab';
import HelpTab    from '../components/tabs/HelpTab';
import AITab      from '../components/tabs/AITab';
import PortfolioTab from '../components/tabs/PortfolioTab';
import DailyPickCard from '../components/challenge/DailyPickCard';
// DarkPoolOptionsTab merged into AlertsTabRedesign

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
      .from('breakout_alerts')
      .select('*')
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
      .channel('breakout_alerts_broadcast')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'breakout_alerts',
      }, (payload) => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setActiveBroadcast(payload.new);
        dismissTimerRef.current = setTimeout(() => setActiveBroadcast(null), 40000);
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
    if (loading) return;
    if (activeTab === 'chat' && publicGroups.length > 0 && !activeGroup) {
      const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public');
      if (uptikPublic) enterGroup(uptikPublic);
    }
  }, [activeTab, publicGroups, loading]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Ref so HomeTab can expose its scrollToChat function
  const scrollToChatRef = useRef(null);

  const handleTabChange = useCallback((tab) => {
    if (tab === 'chat') {
      // Redirect Chat to Home and scroll to chat section
      setActiveTab('home');
      setTimeout(() => scrollToChatRef.current?.(), 100);
    } else {
      setActiveTab(tab);
    }
  }, []);

  const handleGroupSelect = (group) => {
    enterGroup(group);
  };

  function broadcastColor(type) {
    const colors = { BULLISH: '#1AAD5E', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
    return colors[type] || '#1AAD5E';
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#132d52',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          <span style={{ color: '#f0ede8' }}>Up</span>
          <span style={{ color: '#8cd9a0' }}>tik</span>
        </div>
        <div style={{
          width: 24, height: 24,
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: '#8cd9a0',
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
      <div style={{ ...styles.content, ...(activeTab === 'home' ? { paddingBottom: 58, overflow: 'hidden' } : {}) }}>
        {activeTab === 'home' && (
          <HomeTab
            session={session}
            onGroupSelect={handleGroupSelect}
            onSignOut={handleSignOut}
            onProfilePress={() => setActiveTab('profile')}
            onTabChange={handleTabChange}
            scrollToChatRef={scrollToChatRef}
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
        {activeTab === 'challenge' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DailyPickCard session={session} />
            <PortfolioTab session={session} />
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
        activeTab={activeTab === 'home' ? 'home' : activeTab}
        onTabChange={handleTabChange}
        unreadAlerts={unreadAlerts}
        unreadChat={unreadChat}
      />

    </div>
  );
}

const styles = {
  page: {
    height: '100dvh', background: 'var(--bg)',
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
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' },
};
