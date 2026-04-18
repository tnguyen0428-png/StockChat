// ============================================
// UPTIKALERTS — DashboardPage.jsx
// Main dashboard shell — reads from GroupContext
// ============================================

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGroup } from '../context/GroupContext';
import { DARK_THEME, LIGHT_THEME } from '../lib/constants';
import { safeGet, safeSet, safeRemove } from '../lib/safeStorage';

// HomeTab is the default landing tab — load eagerly so first paint is instant
import HomeTab from '../components/tabs/HomeTab';

// Join-group modal — shown from chat tab
import JoinGroupModal from '../components/chat/JoinGroupModal';

// Share-invite modal — shown right after creating a private group,
// and re-openable from the chat header "Invite" pill.
import ShareInviteModal from '../components/chat/ShareInviteModal';

// Everything else is lazy — split into separate chunks, fetched on first tab visit
const AlertsTab    = lazy(() => import('../components/tabs/AlertsTabRedesign'));
const ChatTab      = lazy(() => import('../components/tabs/ChatTab'));
const ProfileTab   = lazy(() => import('../components/tabs/ProfileTab'));
const HelpTab      = lazy(() => import('../components/tabs/HelpTab'));
const PortfolioTab = lazy(() => import('../components/tabs/PortfolioTab'));

const TabFallback = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
  </div>
);

// Shared components
import Header    from '../components/shared/Header';
import BottomNav from '../components/shared/BottomNav';

export default function DashboardPage({ session }) {
  const navigate = useNavigate();
  const {
    profile, activeGroup, allGroups,
    publicGroups, customGroups,
    isAdmin, isModerator, loading,
    enterGroup, refreshGroups,
    createCustomGroup,
  } = useGroup();

  // ── Global dark mode — persists across tab switches ──
  const [darkMode, setDarkMode] = useState(() => safeGet('uptik_darkMode') === 'true');

  useEffect(() => {
    const theme = darkMode ? DARK_THEME : LIGHT_THEME;
    Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    safeSet('uptik_darkMode', String(darkMode));
  }, [darkMode]);

  // Compute initial tab from join redirect (read once, clear once)
  const [activeTabInit] = useState(() => {
    const redirect = safeGet('uptik_join_redirect');
    if (redirect) safeRemove('uptik_join_redirect');
    return redirect || 'home';
  });

  const [activeTab, setActiveTab]   = useState(activeTabInit);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Invite-modal state — `inviteGroup` controls visibility; `inviteJustCreated`
  // swaps the copy between celebratory (post-create) and neutral (reopen from
  // chat header pill). Keeping them as separate pieces of state avoids the
  // footgun of resetting `justCreated` inside the close handler.
  const [inviteGroup, setInviteGroup] = useState(null);
  const [inviteJustCreated, setInviteJustCreated] = useState(false);

  // Track which tabs have been visited so we can lazy-mount but never unmount
  const [mountedTabs, setMountedTabs] = useState(new Set(['home']));
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [unreadAlerts, setUnreadAlerts]   = useState(false);
  const [unreadChat, setUnreadChat]       = useState(false);
  const dismissTimerRef = useRef(null);

  // ── Keyboard detection + single viewport handler ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [vpStyle, setVpStyle] = useState({});
  const initialVH = useRef(window.innerHeight);
  const pageRef = useRef(null);
  // Cache the last vpStyle signature so we can skip setVpStyle when the
  // computed values haven't meaningfully changed. iOS fires visualViewport
  // events during URL-bar show/hide on every scroll frame — unconditionally
  // calling setVpStyle with a new object literal each time re-renders the
  // entire page tree on every scroll, which amplifies any downstream
  // scroll-position writes and makes the whole app feel shaky.
  const lastVpKeyRef = useRef('');
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Detect keyboard by viewport shrinkage only. The earlier
      // "vv.offsetTop > 0" clause fired spuriously during iOS rubber-band
      // scroll and pinch interactions, flickering keyboardOpen true/false
      // and unmounting/remounting BottomNav mid-scroll — the visible
      // shakiness users reported. Pure shrinkage > 100px is a reliable,
      // non-flickering signal for keyboard presence.
      const shrinkage = initialVH.current - vv.height;
      const isKB = shrinkage > 100;
      setKeyboardOpen(isKB);
      if (isKB) {
        // Size the page to the visible viewport above the keyboard so the
        // bottom-anchored input bar sits above the keyboard. Using a pure
        // height:vv.height approach (not bottom:0) because bottom:0 hid
        // the input bar entirely in iOS 17+ Safari Private mode — there,
        // interactive-widget=resizes-content doesn't shrink the layout
        // viewport and bottom:0 extends the page below the keyboard.
        // height:vv.height is the conservative fix: input bar is always
        // visible, and any tiny gap between it and the keyboard's
        // accessory bar is strictly cosmetic.
        const offsetTop = Math.round(vv.offsetTop);
        const vhRounded = Math.round(vv.height);
        // Cache key to skip no-op setVpStyle during iOS keyboard-animation
        // frames that arrive with unchanged rounded values.
        const key = `${offsetTop}|${vhRounded}`;
        if (key === lastVpKeyRef.current) return;
        lastVpKeyRef.current = key;
        setVpStyle({
          position: 'fixed',
          top: `${offsetTop}px`,
          left: 0,
          right: 0,
          height: `${vhRounded}px`,
          maxWidth: 480,
          margin: '0 auto',
        });
      } else {
        if (lastVpKeyRef.current === '') return;
        lastVpKeyRef.current = '';
        setVpStyle({});
      }
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
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

  // ── Group Handlers ──
  const handleCreateGroup = async () => {
    const name = window.prompt('Group name:');
    if (!name?.trim()) return;
    const { group, error } = await createCustomGroup(name.trim());
    if (error) { alert(error); return; }
    if (group) {
      enterGroup(group);
      // Surface the invite link immediately — without this, testers create a
      // group and have no idea how to add members. This is the friction the
      // ShareInviteModal exists to remove.
      setInviteJustCreated(true);
      setInviteGroup(group);
    }
  };

  const handleShowInvite = useCallback((g) => {
    setInviteJustCreated(false);
    setInviteGroup(g);
  }, []);

  const handleCloseInvite = useCallback(() => {
    setInviteGroup(null);
    // Leave `inviteJustCreated` as-is — the modal is unmounted so the flag
    // doesn't show, and the next opener sets it explicitly anyway.
  }, []);

  const handleGroupJoined = async ({ id }) => {
    safeSet('uptik_active_group', id);
    await refreshGroups();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);


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
    <div ref={pageRef} style={{ ...styles.page, ...vpStyle }}>

      {/* Hide the navy Uptik app bar on Chat tab — messaging apps don't show
           app chrome above the conversation. Reclaims ~80px for messages.
           Home/Alerts/Challenge/Profile still get the Header. The slim chat
           header inside ChatTab handles the top safe-area on iPhones. */}
      {activeTab !== 'chat' && (
        <Header
          profile={profile}
          onSignOut={handleSignOut}
          onHomePress={() => setActiveTab('home')}
          onProfilePress={() => setActiveTab('profile')}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      )}

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
            onTabChange={handleTabChange}
            darkMode={darkMode}
          />
        </div>

        {/* ── Alerts ── */}
        {mountedTabs.has('alerts') && (
          <div style={{ display: activeTab === 'alerts' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
            <Suspense fallback={<TabFallback />}>
              <AlertsTab session={session} group={activeGroup} darkMode={darkMode} isAdmin={isAdmin} />
            </Suspense>
          </div>
        )}

        {/* ── Chat ── */}
        {mountedTabs.has('chat') && (
          <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Suspense fallback={<TabFallback />}>
              <ChatTab
                session={session}
                profile={profile}
                group={activeGroup}
                isAdmin={isAdmin}
                isModerator={isModerator}
                setUnreadChat={setUnreadChat}
                allGroups={allGroups}
                publicGroups={publicGroups}
                customGroups={customGroups}
                enterGroup={enterGroup}
                onCreateGroup={handleCreateGroup}
                onJoinGroup={() => setShowJoinModal(true)}
                onShowInvite={handleShowInvite}
                activeTab={activeTab}
              />
            </Suspense>
          </div>
        )}

        {/* ── Challenge ── */}
        {mountedTabs.has('challenge') && (
          <div style={{ display: activeTab === 'challenge' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
            <Suspense fallback={<TabFallback />}>
              <PortfolioTab session={session} darkMode={darkMode} keyboardOpen={keyboardOpen} activeTab={activeTab} />
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
        />
      )}

      <JoinGroupModal
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoined={handleGroupJoined}
      />

      <ShareInviteModal
        open={!!inviteGroup}
        group={inviteGroup}
        onClose={handleCloseInvite}
        justCreated={inviteJustCreated}
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
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' },
};
