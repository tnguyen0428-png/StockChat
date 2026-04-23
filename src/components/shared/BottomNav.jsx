// ============================================
// UPTIKALERTS — BottomNav.jsx
// 5 tabs: Home, Alerts, Chat, Challenge, Profile
// Uniform icon sizing — no elevated chat
// ============================================

const HomeIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
      fill={active ? '#132d52' : '#8a9bb8'} />
  </svg>
);

const AlertsIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"
      fill={active ? '#132d52' : '#8a9bb8'} />
  </svg>
);

const ProfileIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
      fill={active ? '#132d52' : '#8a9bb8'} />
  </svg>
);

const ChatIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
      fill={active ? '#132d52' : '#8a9bb8'} />
  </svg>
);

const ChallengeIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
      fill={active ? '#132d52' : '#8a9bb8'} />
  </svg>
);

const TABS = [
  { id: 'home',      label: 'Home',      Icon: HomeIcon      },
  { id: 'alerts',    label: 'Alerts',    Icon: AlertsIcon    },
  { id: 'chat',      label: 'Chat',      Icon: ChatIcon      },
  { id: 'challenge', label: 'Challenge',  Icon: ChallengeIcon },
  { id: 'profile',   label: 'Profile',   Icon: ProfileIcon   },
];

export default function BottomNav({ activeTab, onTabChange, unreadAlerts }) {
  return (
    <div style={styles.nav}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        const hasBadge = id === 'alerts' && unreadAlerts;
        return (
          <div key={id} style={styles.item} onClick={() => onTabChange(id)}>
            <div style={styles.iconWrap}>
              <Icon active={isActive} />
              {hasBadge && <div style={styles.badge} />}
            </div>
            <span style={{
              ...styles.label,
              color: isActive ? '#132d52' : '#8a9bb8',
              fontWeight: isActive ? 600 : 500,
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  nav: {
    height: 58, background: '#f8fafc',
    borderTop: '0.5px solid #d8e2ed',
    display: 'flex', justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
    boxShadow: '0 -1px 4px rgba(19,45,82,0.04)',
    flexShrink: 0,
    width: '100%', maxWidth: 480, margin: '0 auto',
    zIndex: 9999,
  },
  item: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 3, cursor: 'pointer',
    padding: '4px 0', borderRadius: 8,
    flex: 1, minWidth: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -2, right: -4,
    width: 7, height: 7, background: 'var(--red)',
    borderRadius: '50%', border: '1.5px solid #f8fafc',
  },
  label: { fontSize: 11, fontWeight: 500 },
};
