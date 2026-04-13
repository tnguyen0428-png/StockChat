// ============================================
// UPTIKALERTS — Header.jsx
// Top header bar — logo, market status, avatar
// ============================================

import { useState, useRef, useEffect } from 'react';
import { DarkModeToggle, useTheme } from '../tabs/alertsCasinoComponents';
import { isMarketOpen, isAfterHours } from '../../utils/marketUtils';


export default function Header({ profile, onSignOut, onHomePress, onProfilePress, darkMode, setDarkMode }) {
  const t = useTheme(darkMode);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarRef = useRef(null);

  useEffect(() => {
    if (!showAvatarMenu) return;
    const handler = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showAvatarMenu]);

  const mktOpen = isMarketOpen();
  const mktAH = !mktOpen && isAfterHours();
  const mktLabel = mktOpen ? 'LIVE' : mktAH ? 'AH' : 'CLOSED';
  const mktColor = mktOpen ? '#8cd9a0' : '#ef5350';

  return (
    <div style={styles.header}>
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0 }} onClick={() => onHomePress?.()}>
        <div>
          <div style={styles.logoRow}>
            <svg width="30" height="30" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -5, verticalAlign: 'bottom', position: 'relative', top: 6 }}>
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
            </svg>
            <span style={styles.logoUp}>p</span><span style={styles.logoTik}>tik</span>
          </div>
          <div style={styles.logoAlerts}>a l e r t s</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={styles.statusPill}>
            <div style={{ ...styles.statusDot, background: mktColor }} />
            <span style={{ ...styles.statusText, color: mktColor }}>{mktLabel}</span>
          </div>
          <DarkModeToggle darkMode={darkMode} onToggle={() => setDarkMode(d => !d)} t={t} />
          <div ref={avatarRef} style={{ position: 'relative' }}>
            <div style={styles.avatar} onClick={() => setShowAvatarMenu(prev => !prev)}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f0ede8' }}>
                {(profile?.username || 'U')[0].toUpperCase()}
              </span>
            </div>
            {showAvatarMenu && (
              <div style={styles.avatarMenu}>
                <div style={styles.avatarMenuName}>{profile?.username || 'User'}</div>
                {profile?.email && <div style={styles.avatarMenuEmail}>{profile.email}</div>}
                <div style={styles.avatarMenuDivider} />
                <button style={styles.avatarMenuItem} onClick={() => { setShowAvatarMenu(false); onProfilePress?.(); }}>
                  Profile Settings
                </button>
                <button style={{ ...styles.avatarMenuItem, color: '#EF4444' }} onClick={() => { setShowAvatarMenu(false); onSignOut?.(); }}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    background: '#132d52',
    borderBottom: 'none',
    padding: '10px 16px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  statusPill: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'rgba(255,255,255,0.1)', padding: '2px 7px', borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: '50%' },
  statusText: { fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' },
  logoRow:    { display: 'flex', alignItems: 'baseline' },
  logoUp:     { fontSize: 20, fontWeight: 500, color: '#8cd9a0' },
  logoTik:    { fontSize: 20, fontWeight: 500, color: '#f0ede8' },
  logoAlerts: {
    fontSize: 11, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5,
    fontFamily: "'Outfit', sans-serif",
    marginTop: -3, paddingLeft: 26,
  },
  avatar: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  avatarMenu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
    zIndex: 200, minWidth: 180, overflow: 'hidden',
  },
  avatarMenuName: {
    fontSize: 13, fontWeight: 600, color: 'var(--text1)',
    padding: '12px 14px 2px',
  },
  avatarMenuEmail: {
    fontSize: 11, color: 'var(--text3)',
    padding: '0 14px 10px',
  },
  avatarMenuDivider: {
    height: 1, background: 'var(--border)', margin: '0',
  },
  avatarMenuItem: {
    display: 'block', width: '100%', padding: '11px 14px',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: 500, color: 'var(--text1)',
    textAlign: 'left', fontFamily: 'var(--font)',
  },
};
