// ============================================
// UPTIKALERTS — ProfileTab.jsx
// User profile, settings, and admin panel
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import RiskMeter from '../profile/RiskMeter';
import AdminPanel from '../profile/AdminPanel';

export default function ProfileTab({ session, profile, group, isAdmin, onSignOut }) {
  const { refreshGroups } = useGroup();
  const [notifications, setNotifications] = useState({ alerts: true, briefing: true, broadcasts: true, chat: false });
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingName, setSavingName] = useState(false);

  // ── Change Password (in-app) ──
  // Inline reveal — click the row to expose a single new-password input.
  // Uses supabase.auth.updateUser({ password }) which works against the
  // user's current authenticated session (no re-auth required).
  const [editingPw, setEditingPw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', session.user.id)
        .single();
      if (!cancelled && data?.notif_prefs) setNotifications(data.notif_prefs);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const copyInviteLink = async () => {
    // Only flip "Copied!" when writeText actually succeeded — otherwise the
    // user sees a confirmation while their clipboard is empty (e.g. browser
    // blocked clipboard access, iframe without permission, etc.).
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}/join/${group?.invite_code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ProfileTab] Clipboard copy failed:', err?.message);
    }
  };

  const handleToggle = async (key) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    const { error } = await supabase
      .from('profiles')
      .update({ notif_prefs: updated })
      .eq('id', session.user.id);
    if (error) {
      console.error('[ProfileTab] Toggle notification failed:', error.message);
      setNotifications(notifications); // revert on failure
    }
  };

  const savePassword = async () => {
    if (savingPw) return;
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwError('');
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('different from the old') || msg.includes('same as')) {
        setPwError('New password must be different from your current password.');
      } else if (msg.includes('weak') || msg.includes('at least') || msg.includes('character')) {
        setPwError(error.message);
      } else {
        setPwError(error.message || 'Could not update password. Please try again.');
      }
      return;
    }
    // Success — show checkmark, clear input, auto-collapse after 2s.
    setNewPassword('');
    setPwSuccess(true);
    setTimeout(() => {
      setPwSuccess(false);
      setEditingPw(false);
    }, 2000);
    document.activeElement?.blur();
  };

  const cancelPasswordEdit = () => {
    setEditingPw(false);
    setNewPassword('');
    setPwError('');
    setPwSuccess(false);
    document.activeElement?.blur();
  };

  const saveUsername = async () => {
    if (!newUsername.trim() || !session?.user?.id || savingName) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.trim() })
      .eq('id', session.user.id);
    if (!error) {
      await refreshGroups();
      setEditingName(false);
    }
    setSavingName(false);
    document.activeElement?.blur();
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div style={styles.scroll}>
      <div style={styles.profileCard}>
        <div style={styles.avatarWrap}>
          <div style={{ ...styles.avatar, color: profile?.color || 'var(--green)', borderColor: (profile?.color || 'var(--green)') + '40' }}>
            {profile?.username?.[0]?.toUpperCase() || '?'}
          </div>
        </div>
        <div style={styles.profileInfo}>
          <div style={styles.profileName}>{profile?.username || 'Trader'}</div>
          <div style={styles.profileEmail}>{session?.user?.email}</div>
          <div style={styles.profileBadges}>
            {isAdmin && <span style={styles.badgeAdmin}>Admin</span>}
            {group?.name && <span style={styles.badgeGroup}>{group.name}</span>}
            {profile?.created_at && <span style={styles.badgeMember}>Since {formatDate(profile.created_at)}</span>}
          </div>
        </div>
      </div>

      <RiskMeter session={session} />

      {isAdmin && <AdminPanel />}

      {group && (
        <>
          <div style={styles.secLabel}>My Group</div>
          <div style={styles.groupCard}>
            <div style={styles.groupTop}>
              <div style={styles.groupName}>{group.name}</div>
              {isAdmin && <span style={styles.modBadge}>Moderator</span>}
            </div>
            <button style={styles.inviteBtn} onClick={copyInviteLink}>{copied ? 'Copied!' : 'Copy Invite Link'}</button>
            {group.invite_code && <div style={styles.inviteLink}>{window.location.origin}/join/{group.invite_code}</div>}
          </div>
        </>
      )}

      <div style={styles.secLabel}>Notifications</div>
      <div style={styles.settingsCard}>
        {[{ key: 'alerts', label: 'Breakout Alerts' }, { key: 'briefing', label: 'Daily Briefing' }, { key: 'broadcasts', label: 'Admin Broadcasts' }, { key: 'chat', label: 'Chat Messages' }].map((item, i, arr) => (
          <div key={item.key} style={{ ...styles.settingRow, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={styles.settingLabel}>{item.label}</span>
            <div style={{ ...styles.toggle, background: notifications[item.key] ? 'var(--green)' : 'var(--border)' }} onClick={() => handleToggle(item.key)}>
              <div style={{ ...styles.toggleKnob, left: notifications[item.key] ? 'auto' : 3, right: notifications[item.key] ? 3 : 'auto' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.secLabel}>Account</div>
      <div style={styles.settingsCard}>
        <div style={{ ...styles.settingRow, borderBottom: '1px solid var(--border)' }}>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <input
                style={styles.nameInput}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value.slice(0, 20))}
                placeholder="New name"
                autoFocus
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && saveUsername()}
                enterKeyHint="done"
              />
              <button style={styles.nameSaveBtn} onClick={saveUsername} disabled={savingName}>
                {savingName ? '..' : 'Save'}
              </button>
              <button style={styles.nameCancelBtn} onClick={() => { setEditingName(false); document.activeElement?.blur(); }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
              onClick={() => { setEditingName(true); setNewUsername(profile?.username || ''); }}>
              <span style={styles.settingLabel}>Trader Name</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={styles.settingValue}>{profile?.username || 'Trader'}</span>
                <span style={{ fontSize: 10, color: '#3B6D11', fontWeight: 500 }}>edit</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ ...styles.settingRow, borderBottom: '1px solid var(--border)' }}>
          <span style={styles.settingLabel}>Email</span>
          <span style={styles.settingValue}>{session?.user?.email?.split('@')[0] + '...'}</span>
        </div>
        <div style={styles.settingRow}>
          {pwSuccess ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={styles.settingLabel}>Password</span>
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ Updated</span>
            </div>
          ) : editingPw ? (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                <input
                  style={styles.nameInput}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (min 6)"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && savePassword()}
                  // Don't let the browser autofill the user's existing saved
                  // password here — that would submit their old password and
                  // Supabase rejects it with "new password should be different
                  // from the old password".
                  autoComplete="new-password"
                  name="new-password"
                  enterKeyHint="done"
                />
                <button style={styles.nameSaveBtn} onClick={savePassword} disabled={savingPw}>
                  {savingPw ? '..' : 'Save'}
                </button>
                <button style={styles.nameCancelBtn} onClick={cancelPasswordEdit}>✕</button>
              </div>
              {pwError && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{pwError}</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
              onClick={() => { setEditingPw(true); setNewPassword(''); setPwError(''); }}>
              <span style={styles.settingLabel}>Password</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={styles.settingValue}>••••••••</span>
                <span style={{ fontSize: 10, color: '#3B6D11', fontWeight: 500 }}>change</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.secLabel}>Account Actions</div>
      <button style={styles.signOutBtn} onClick={onSignOut}>Sign Out</button>
      <div style={{ height: 20 }} />
    </div>
  );
}

// NOTE: stub styles reconstructed after a file truncation. Polish to taste.
const styles = {
  scroll:        { padding: 16, paddingBottom: 16, overflowY: 'auto', height: '100%' },
  profileCard:   { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 },
  avatarWrap:    { flexShrink: 0 },
  avatar:        { width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, background: 'var(--card2)', border: '2px solid var(--green)' },
  profileInfo:   { flex: 1, minWidth: 0 },
  profileName:   { fontSize: 16, fontWeight: 600, color: 'var(--text1)' },
  profileEmail:  { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  profileBadges: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badgeAdmin:    { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 600 },
  badgeGroup:    { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--card2)', color: 'var(--text2)', border: '1px solid var(--border)' },
  badgeMember:   { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--card2)', color: 'var(--text3)', border: '1px solid var(--border)' },
  secLabel:      { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  groupCard:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 },
  groupTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  groupName:     { fontSize: 15, fontWeight: 600, color: 'var(--text1)' },
  modBadge:      { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 600 },
  inviteBtn:     { width: '100%', background: 'var(--green)', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  inviteLink:    { fontSize: 11, color: 'var(--text3)', marginTop: 8, wordBreak: 'break-all' },
  settingsCard:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  settingRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px' },
  settingLabel:  { fontSize: 13, color: 'var(--text1)' },
  settingValue:  { fontSize: 13, color: 'var(--text3)' },
  toggle:        { width: 36, height: 20, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' },
  toggleKnob:    { position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s, right 0.2s' },
  nameInput:     { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text1)', outline: 'none' },
  nameSaveBtn:   { background: 'var(--green)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 6 },
  nameCancelBtn: { background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginLeft: 6 },
  signOutBtn:    { width: '100%', background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16 },
};
