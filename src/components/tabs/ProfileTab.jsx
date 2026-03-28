// ============================================
// UPTIKALERTS — ProfileTab.jsx
// User profile, group info, settings
// ============================================

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ProfileTab({ session, profile, group, isAdmin, onSignOut }) {
  const [notifications, setNotifications] = useState({
    alerts:     true,
    briefing:   true,
    broadcasts: true,
    chat:       false,
  });
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${group?.invite_code}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric'
  });

  return (
    <div style={styles.scroll}>

      {/* Profile Card */}
      <div style={styles.profileCard}>
        <div style={styles.avatarWrap}>
          <div style={{
            ...styles.avatar,
            color: profile?.color || 'var(--green)',
            borderColor: (profile?.color || 'var(--green)') + '40',
          }}>
            {profile?.username?.[0]?.toUpperCase() || '?'}
          </div>
        </div>
        <div style={styles.profileInfo}>
          <div style={styles.profileName}>{profile?.username || 'Trader'}</div>
          <div style={styles.profileEmail}>{session?.user?.email}</div>
          <div style={styles.profileBadges}>
            {isAdmin && <span style={styles.badgeAdmin}>Admin</span>}
            {group?.name && <span style={styles.badgeGroup}>{group.name}</span>}
            {profile?.created_at && (
              <span style={styles.badgeMember}>
                Since {formatDate(profile.created_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* My Group */}
      {group && (
        <>
          <div style={styles.secLabel}>My Group</div>
          <div style={styles.groupCard}>
            <div style={styles.groupTop}>
              <div style={styles.groupName}>{group.name}</div>
              {isAdmin && <span style={styles.modBadge}>Moderator</span>}
            </div>
            <button style={styles.inviteBtn} onClick={copyInviteLink}>
              {copied ? '✓ Copied!' : 'Copy Invite Link'}
            </button>
            {group.invite_code && (
              <div style={styles.inviteLink}>
                {window.location.origin}/join/{group.invite_code}
              </div>
            )}
          </div>
        </>
      )}

      {/* Notifications */}
      <div style={styles.secLabel}>Notifications</div>
      <div style={styles.settingsCard}>
        {[
          { key: 'alerts',     label: 'Breakout Alerts'  },
          { key: 'briefing',   label: 'Daily Briefing'   },
          { key: 'broadcasts', label: 'Admin Broadcasts'  },
          { key: 'chat',       label: 'Chat Messages'    },
        ].map((item, i, arr) => (
          <div
            key={item.key}
            style={{
              ...styles.settingRow,
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={styles.settingLeft}>
              <span style={styles.settingLabel}>{item.label}</span>
            </div>
            <div
              style={{
                ...styles.toggle,
                background: notifications[item.key] ? 'var(--green)' : 'var(--border)',
              }}
              onClick={() => toggleNotification(item.key)}
            >
              <div style={{
                ...styles.toggleKnob,
                left: notifications[item.key] ? 'auto' : 3,
                right: notifications[item.key] ? 3 : 'auto',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Account Settings */}
      <div style={styles.secLabel}>Account</div>
      <div style={styles.settingsCard}>
        {[
          { label: 'Trader Name',     value: profile?.username },
          { label: 'Change Password', value: null              },
          { label: 'Email',           value: session?.user?.email?.split('@')[0] + '...' },
        ].map((item, i, arr) => (
          <div
            key={item.label}
            style={{
              ...styles.settingRow,
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
            }}
          >
            <div style={styles.settingLeft}>
              <span style={styles.settingLabel}>{item.label}</span>
            </div>
            <div style={styles.settingRight}>
              {item.value && <span style={styles.settingValue}>{item.value}</span>}
              <span style={styles.settingArrow}>›</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sign Out */}
      <div style={styles.secLabel}>Account Actions</div>
      <button style={styles.signOutBtn} onClick={onSignOut}>
        Sign Out
      </button>

      <div style={{ height: 20 }} />
    </div>
  );
}

const styles = {
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '12px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  profileCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 16, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 14,
  },
  avatarWrap: { flexShrink: 0 },
  avatar: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'var(--green-bg)', border: '2px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 700,
  },
  profileInfo: { flex: 1 },
  profileName:  { fontSize: 16, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  profileEmail: { fontSize: 12, color: 'var(--text2)', marginBottom: 6 },
  profileBadges:{ display: 'flex', gap: 6, flexWrap: 'wrap' },
  badgeAdmin: {
    background: 'rgba(212,160,23,0.1)', color: '#D4A017',
    fontSize: 10, fontWeight: 600, padding: '2px 8px',
    borderRadius: 20, border: '1px solid rgba(212,160,23,0.2)',
  },
  badgeGroup: {
    background: 'var(--blue-bg)', color: 'var(--blue)',
    fontSize: 10, fontWeight: 600, padding: '2px 8px',
    borderRadius: 20, border: '1px solid rgba(74,144,217,0.2)',
  },
  badgeMember: {
    background: 'var(--card2)', color: 'var(--text2)',
    fontSize: 10, fontWeight: 500, padding: '2px 8px',
    borderRadius: 20, border: '1px solid var(--border)',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px',
  },
  groupCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  groupTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  groupName: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  modBadge: {
    background: '#FFFBEB', color: '#D4A017',
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    borderRadius: 20, border: '1px solid rgba(212,160,23,0.2)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  inviteBtn: {
    width: '100%', background: 'var(--card2)',
    border: '1.5px solid var(--border)', color: 'var(--text1)',
    padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  inviteLink: {
    fontSize: 11, color: 'var(--blue)',
    marginTop: 6, textAlign: 'center',
  },
  settingsCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden', marginBottom: 8,
  },
  settingRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '13px 14px',
  },
  settingLeft:  { display: 'flex', alignItems: 'center' },
  settingLabel: { fontSize: 14, color: 'var(--text1)', fontWeight: 500 },
  settingRight: { display: 'flex', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 12, color: 'var(--text2)' },
  settingArrow: { fontSize: 14, color: 'var(--text3)' },
  toggle: {
    width: 40, height: 24, borderRadius: 12,
    position: 'relative', cursor: 'pointer',
    transition: 'background 0.2s', flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute', top: 4,
    width: 16, height: 16, background: '#fff',
    borderRadius: '50%', transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  signOutBtn: {
    width: '100%', background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)', padding: 13, borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    marginBottom: 8,
  },
};
