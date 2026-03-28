// ============================================
// UPTIKALERTS — Header.jsx
// Top header bar
// ============================================

export default function Header({ group, profile, isAdmin }) {
  return (
    <div style={styles.header}>
      <div>
        <div style={styles.logoRow}>
          <span style={styles.logoUp}>UpTik</span>
          <span style={styles.logoTik}>Alerts</span>
        </div>
        <div style={styles.sub}>
          {group?.name || '# general'}
        </div>
      </div>
      <div style={styles.right}>
        <div style={styles.onlineRow}>
          <div style={styles.onlineDot} />
          <span style={styles.onlineTxt}>Online</span>
        </div>
        {isAdmin && (
          <span style={styles.adminPill}>Admin</span>
        )}
        {profile?.username && (
          <span style={styles.userPill}>{profile.username}</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  header: {
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  logoRow: { display: 'flex', alignItems: 'center' },
  logoUp:  { fontSize: 18, fontWeight: 700, color: 'var(--green)' },
  logoTik: { fontSize: 18, fontWeight: 700, color: 'var(--text1)' },
  sub:     { fontSize: 11, color: 'var(--text2)', marginTop: 1 },
  right:   { display: 'flex', alignItems: 'center', gap: 6 },
  onlineRow: { display: 'flex', alignItems: 'center', gap: 4 },
  onlineDot: {
    width: 7, height: 7,
    borderRadius: '50%',
    background: 'var(--green)',
    animation: 'pulse 2s infinite',
  },
  onlineTxt: { fontSize: 11, color: 'var(--text2)' },
  adminPill: {
    background: 'rgba(212,160,23,0.1)',
    color: '#D4A017',
    fontSize: 11, fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 20,
    border: '1px solid rgba(212,160,23,0.2)',
  },
  userPill: {
    background: 'var(--green-bg)',
    color: 'var(--green)',
    fontSize: 11, fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 20,
    border: '1px solid rgba(26,173,94,0.2)',
  },
};
