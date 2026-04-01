// ============================================
// UPTIKALERTS — BottomNav.jsx
// 5 tabs: Home, Alerts, Chat (center), Help, Profile
// ============================================

const HomeIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
      fill={active ? 'var(--green)' : 'var(--text3)'} />
  </svg>
);

const AlertsIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"
      fill={active ? 'var(--green)' : 'var(--text3)'} />
  </svg>
);

const ProfileIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
      fill={active ? 'var(--green)' : 'var(--text3)'} />
  </svg>
);

const HelpIcon = ({ active }) => (
  <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${active ? 'var(--green)' : 'var(--text3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text3)', lineHeight: 1 }}>?</div>
);

const ChatIcon = ({ active, highlighted }) => (
  <svg width={highlighted ? 24 : 22} height={highlighted ? 24 : 22} viewBox="0 0 24 24" fill="none">
    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
      fill={highlighted ? '#fff' : (active ? 'var(--green)' : 'var(--text3)')} />
  </svg>
);

const TABS = [
  { id: 'home',    label: 'Home',    Icon: HomeIcon    },
  { id: 'alerts',  label: 'Alerts',  Icon: AlertsIcon  },
  { id: 'chat',    label: 'Chat',    Icon: ChatIcon    },
  { id: 'help',    label: 'Help',    Icon: HelpIcon    },
  { id: 'profile', label: 'Profile', Icon: ProfileIcon },
];

export default function BottomNav({ activeTab, onTabChange, unreadAlerts }) {
  return (
    <div style={styles.nav}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        const hasBadge = id === 'alerts' && unreadAlerts;
        const isChat = id === 'chat';
        return (
          <div key={id} style={{ ...styles.item, ...(isChat ? { marginTop: -22 } : {}) }} onClick={() => onTabChange(id)}>
            <div style={styles.iconWrap}>
              {isChat ? (
                <div style={styles.chatCircle}>
                  <Icon active={isActive} highlighted />
                </div>
              ) : (
                <Icon active={isActive} />
              )}
              {hasBadge && <div style={styles.badge} />}
            </div>
            <span style={{
              ...styles.label,
              color: isChat ? 'var(--green)' : (isActive ? 'var(--green)' : 'var(--text3)'),
              fontWeight: isChat ? 600 : 500,
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
    height: 58, background: 'var(--card)',
    borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-around',
    alignItems: 'center', paddingBottom: 4,
    flexShrink: 0, boxShadow: '0 -1px 6px rgba(0,0,0,0.04)',
  },
  item: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 3, cursor: 'pointer',
    padding: '4px 20px', borderRadius: 8,
    WebkitTapHighlightColor: 'transparent',
  },
  iconWrap: { position: 'relative' },
  chatCircle: {
    width: 52, height: 52, borderRadius: '50%',
    background: 'linear-gradient(135deg, #8bc34a, #5a9a35)',
    border: '3px solid var(--card)',
    boxShadow: '0 4px 14px rgba(139,195,74,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -2, right: -4,
    width: 7, height: 7, background: 'var(--red)',
    borderRadius: '50%', border: '1.5px solid var(--card)',
  },
  label: { fontSize: 11, fontWeight: 500 },
};
