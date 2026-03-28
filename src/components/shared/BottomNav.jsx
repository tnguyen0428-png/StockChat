// ============================================
// UPTIKALERTS — BottomNav.jsx
// Bottom navigation bar
// ============================================

const TABS = [
  { id: 'home',    icon: null, label: 'Home'    },
  { id: 'alerts',  icon: null, label: 'Alerts'  },
  { id: 'chat',    icon: '💬', label: 'Chat'    },
  { id: 'lists',   icon: null, label: 'Lists'   },
  { id: 'profile', icon: null, label: 'Profile' },
];

export default function BottomNav({ activeTab, onTabChange, unreadAlerts, unreadChat }) {
  return (
    <div style={styles.nav}>
      {TABS.map(tab => {
        const isActive  = activeTab === tab.id;
        const hasBadge  = (tab.id === 'alerts' && unreadAlerts) || (tab.id === 'chat' && unreadChat);

        return (
          <div
            key={tab.id}
            style={{ ...styles.item, color: isActive ? 'var(--green)' : 'var(--text2)' }}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon ? (
              <div style={styles.iconWrap}>
                <span style={styles.icon}>{tab.icon}</span>
                {hasBadge && <div style={styles.badge} />}
              </div>
            ) : (
              <div style={styles.iconWrap}>
                <span style={styles.textLabel}>{tab.label}</span>
                {hasBadge && <div style={styles.badge} />}
              </div>
            )}
            {tab.icon && <span style={styles.label}>{tab.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  nav: {
    height: 58,
    background: 'var(--card)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 4,
    flexShrink: 0,
    boxShadow: '0 -1px 6px rgba(0,0,0,0.04)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 8,
    transition: 'color 0.15s',
    WebkitTapHighlightColor: 'transparent',
  },
  iconWrap: {
    position: 'relative',
  },
  icon: {
    fontSize: 22,
    lineHeight: 1,
  },
  badge: {
    position: 'absolute',
    top: -2, right: -4,
    width: 7, height: 7,
    background: 'var(--red)',
    borderRadius: '50%',
    border: '1.5px solid var(--card)',
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
  },
  textLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: 1,
  },
};
