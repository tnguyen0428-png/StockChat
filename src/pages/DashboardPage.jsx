// ============================================
// UPTIKALERTS — DashboardPage.jsx
// Main dashboard shell — reads from GroupContext
// ============================================

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGroup } from '../context/GroupContext';
import { DARK_THEME, LIGHT_THEME } from '../components/tabs/alertsMockData';

// HomeTab is the default landing tab — load eagerly so first paint is instant
import HomeTab from '../components/tabs/HomeTab';

// Everything else is lazy — split into separate chunks, fetched on first tab visit
const AlertsTab     = lazy(() => import('../components/tabs/AlertsTabRedesign'));
const ChatTab       = lazy(() => import('../components/tabs/ChatTab'));
const ProfileTab    = lazy(() => import('../components/tabs/ProfileTab'));
const HelpTab       = lazy(() => import('../components/tabs/HelpTab'));
const AITab         = lazy(() => import('../components/tabs/AITab'));
const PortfolioTab  = lazy(() => import('../components/tabs/PortfolioTab'));
const TrendingView  = lazy(() => import('../components/tabs/TrendingView'));
const DMInbox       = lazy(() => import('../components/dm/DMInbox'));
const DMChat        = lazy(() => import('../components/dm/DMChat'));
const TabFallback = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
  </div>
);

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
    // DM
    dmConversations, activeDM, dmUnreadCount,
    startDM, markDMRead, closeDM, setActiveDM,
  } = useGroup();

  // ── Global dark mode — persists across tab switches ──
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('uptik_darkMode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const theme = darkMode ? DARK_THEME : LIGHT_THEME;
    Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    try { localStorage.setItem('uptik_darkMode', String(darkMode)); } catch {}
  }, [darkMode]);

  const [activeTab, setActiveTab]         = useState(() => {
    try {
      const redirect = localStorage.getItem('uptik_join_redirect');
      if (redirect) {
        localStorage.removeItem('uptik_join_redirect');
        return redirect;
      }
    } catch { /* localStorage unavailable — iOS private browsing */ }
    return 'home';
  });
  // Track which tabs have been visited so we can lazy-mount but never unmount
  const [mountedTabs, setMountedTabs] = useState(new Set(['home']));
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [unreadAlerts, setUnreadAlerts]   = useState(false);
  const [unreadChat, setUnreadChat]       = useState(false);
  const [chatMode, setChatMode]           = useState('chat'); // 'chat' | 'trending' | 'dms' | 'dm-chat'
  const [startingDM, setStartingDM]       = useState(false);
  const dismissTimerRef = useRef(null);

  // ── Hide BottomNav when iOS/Android keyboard is open ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

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

  // Mark tabs as visited so they stay mounted (display:none) instead of unmounting
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
    if (activeTab === 'alerts') setUnreadAlerts(false);
    if (activeTab === 'chat')   setUnreadChat(false);
  }, [activeTab]);

  // Auto-join UpTik Public if no group is active (any tab, not just chat)
  useEffect(() => {
    if (loading || activeGroup) return;
    if (publicGroups.length > 0) {
      const uptikPublic = publicGroups.find(g => g.name === 'UpTik Public');
      if (uptikPublic) enterGroup(uptikPublic);
    }
  }, [publicGroups, loading, activeGroup]);

  // ── DM Handlers ──
  const handleStartDM = async (otherUserId, otherUsername) => {
    // Optimistically flip to dm-chat mode so we don't flash the Groups or
    // Inbox view between tap and RPC resolution. A small loader covers the gap.
    setActiveTab('chat');
    setChatMode('dm-chat');
    setStartingDM(true);
    try {
      const dm = await startDM(otherUserId);
      if (!dm) {
        // Creation failed — fall back to the inbox rather than stranding the user
        setChatMode('dms');
      }
    } finally {
      setStartingDM(false);
    }
  };

  const handleOpenDMFromInbox = (convo) => {
    setActiveDM(convo);
    setChatMode('dm-chat');
  };

  const handleBackFromDM = () => {
    closeDM();
    setChatMode('chat');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Ref so HomeTab can expose its scrollToChat function
  const scrollToChatRef = useRef(null);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    // When tapping Chat tab while already on Chat, cycle: dm-chat → dms → chat
    // This gives users a way back without accidentally destroying their DM.
    if (tab === 'chat') {
      setChatMode(prev => {
        if (prev === 'dm-chat') return 'dms';  // go to inbox, not hard-close
        return 'chat';
      });
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
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -6, verticalAlign: 'bottom', position: 'relative', top: 7 }}>
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
            </svg>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#8cd9a0' }}>p</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#f0ede8' }}>tik</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5, marginTop: -3, paddingLeft: 34, fontFamily: "'Outfit', sans-serif" }}>a l e r t s</div>
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
        darkMode={darkMode}
        setDarkMode={setDarkMode}
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

      {/* Tab Content — tabs use display:none instead of unmounting so scroll
           position, subscriptions, and in-progress state survive tab switches. */}
      <div style={styles.content}>

        {/* ── Home (eagerly loaded) ── */}
        <div style={{ display: activeTab === 'home' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
          <HomeTab
            session={session}
            onGroupSelect={handleGroupSelect}
            onTabChange={handleTabChange}
            scrollToChatRef={scrollToChatRef}
            onOpenDMs={() => { setActiveTab('chat'); setChatMode('dms'); }}
            onStartDM={handleStartDM}
            darkMode={darkMode}
          />
        </div>

        {/* ── AI ── */}
        {mountedTabs.has('ai') && (
          <div style={{ display: activeTab === 'ai' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
            <Suspense fallback={<TabFallback />}>
              <AITab session={session} />
            </Suspense>
          </div>
        )}

        {/* ── Alerts ── */}
        {mountedTabs.has('alerts') && (
          <div style={{ display: activeTab === 'alerts' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
            <Suspense fallback={<TabFallback />}>
              <AlertsTab session={session} group={activeGroup} darkMode={darkMode} />
            </Suspense>
          </div>
        )}

        {/* ── Chat ── */}
        {mountedTabs.has('chat') && (
          <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {/* Chat | Trending | DMs toggle — only show when not in active DM chat */}
            {chatMode !== 'dm-chat' && (
              <div style={styles.chatToggleRow}>
                <div
                  style={{ ...styles.chatTogglePill, ...(chatMode === 'chat' ? styles.chatToggleActive : {}) }}
                  onClick={() => setChatMode('chat')}
                >
                  Chat
                </div>
                <div
                  style={{ ...styles.chatTogglePill, ...(chatMode === 'trending' ? styles.chatToggleActive : {}) }}
                  onClick={() => setChatMode('trending')}
                >
                  Trending
                </div>
                <div
                  style={{ ...styles.chatTogglePill, ...(chatMode === 'dms' ? styles.chatToggleActive : {}), position: 'relative' }}
                  onClick={() => setChatMode('dms')}
                >
                  DMs
                  {dmUnreadCount > 0 && (
                    <span style={styles.dmBadge}>{dmUnreadCount > 9 ? '9+' : dmUnreadCount}</span>
                  )}
                </div>
              </div>
            )}

            {/* Group Chat view */}
            {chatMode === 'chat' && activeGroup && (
              <Suspense fallback={<TabFallback />}>
                <ChatTab
                  session={session}
                  profile={profile}
                  group={activeGroup}
                  isAdmin={isAdmin}
                  isModerator={isModerator}
                  setUnreadChat={setUnreadChat}
                  onStartDM={handleStartDM}
                />
              </Suspense>
            )}
            {chatMode === 'chat' && !activeGroup && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text3)' }}>Loading chat...</div>
              </div>
            )}

            {/* Trending view */}
            {chatMode === 'trending' && (
              <Suspense fallback={<TabFallback />}>
                <TrendingView session={session} group={activeGroup} />
              </Suspense>
            )}

            {/* DM views */}
            {chatMode === 'dms' && (
              <Suspense fallback={<TabFallback />}>
                <DMInbox onOpenDM={handleOpenDMFromInbox} />
              </Suspense>
            )}
            {chatMode === 'dm-chat' && activeDM && !startingDM && (
              <Suspense fallback={<TabFallback />}>
                <DMChat session={session} dm={activeDM} onBack={handleBackFromDM} />
              </Suspense>
            )}
            {chatMode === 'dm-chat' && startingDM && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>Starting chat…</div>
              </div>
            )}
            {chatMode === 'dm-chat' && !activeDM && !startingDM && (
              <Suspense fallback={<TabFallback />}>
                <DMInbox onOpenDM={handleOpenDMFromInbox} />
              </Suspense>
            )}
          </div>
        )}

        {/* ── Challenge ── */}
        {mountedTabs.has('challenge') && (
          <div style={{ display: activeTab === 'challenge' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
            <Suspense fallback={<TabFallback />}>
              <PortfolioTab session={session} darkMode={darkMode} />
            </Suspense>
          </div>
        )}

        {/* ── Help (lightweight — remount is fine) ── */}
        {activeTab === 'help' && (
          <Suspense fallback={<TabFallback />}>
            <HelpTab />
          </Suspense>
        )}

        {/* ── Profile (lightweight — remount is fine) ── */}
        {activeTab === 'profile' && (
          <Suspense fallback={<TabFallback />}>
            <ProfileTab
              session={session}
              profile={profile}
              group={activeGroup}
              isAdmin={isAdmin}
              onSignOut={handleSignOut}
            />
          </Suspense>
        )}
      </div>

      {!keyboardOpen && (
        <BottomNav
          activeTab={activeTab === 'home' ? 'home' : activeTab}
          onTabChange={handleTabChange}
          unreadAlerts={unreadAlerts}
          unreadChat={unreadChat}
          dmUnreadCount={dmUnreadCount}
        />
      )}

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
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' },
  chatToggleRow: {
    display: 'flex', gap: 0, padding: '6px 14px',
    background: 'var(--card)', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    position: 'sticky', top: 0, zIndex: 10,
  },
  chatTogglePill: {
    flex: 1, textAlign: 'center', padding: '7px 0',
    fontSize: 12, fontWeight: 500, color: 'var(--text3)',
    cursor: 'pointer', borderRadius: 8,
    transition: 'all 0.15s',
  },
  chatToggleActive: {
    background: 'var(--btn-active, #132d52)', color: '#fff',
    fontWeight: 600, borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  dmBadge: {
    position: 'absolute', top: 2, right: 12,
    background: '#5eed8a', color: '#0a1628',
    fontSize: 9, fontWeight: 700,
    minWidth: 16, height: 16, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
  },
};