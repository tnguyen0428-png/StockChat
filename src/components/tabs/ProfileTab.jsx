// ============================================
// UPTIKALERTS — ProfileTab.jsx
// User profile, settings, and admin panel
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ── Admin Panel ──
function AdminPanel({ session, profile }) {
  const [activeSection, setActiveSection] = useState(null);

  // Groups state
  const [groups, setGroups]           = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSector, setNewGroupSector] = useState('');
  const [newGroupPublic, setNewGroupPublic] = useState(true);

  // Users state
  const [users, setUsers]   = useState([]);

  // Briefing state
  const [briefingText, setBriefingText] = useState('');
  const [briefingMood, setBriefingMood] = useState('neutral');
  const [postingBriefing, setPostingBriefing] = useState(false);

  // Curated list state
  const [selectedGroup, setSelectedGroup] = useState('');
  const [listName, setListName]           = useState('');

  useEffect(() => {
    if (activeSection === 'groups') loadGroups();
    if (activeSection === 'users')  loadUsers();
    if (activeSection === 'briefing' || activeSection === 'lists') loadGroups();
  }, [activeSection]);

  const loadGroups = async () => {
    const { data } = await supabase.from('groups').select('*').order('created_at');
    if (data) setGroups(data);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, group_members(role, groups(name))')
      .order('created_at');
    if (data) setUsers(data);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await supabase.from('groups').insert({
      name:      newGroupName.trim(),
      is_public: newGroupPublic,
      sector:    newGroupSector.trim() || null,
    });
    setNewGroupName('');
    setNewGroupSector('');
    await loadGroups();
  };

  const deleteGroup = async (id) => {
    if (!window.confirm('Delete this group?')) return;
    await supabase.from('groups').delete().eq('id', id);
    await loadGroups();
  };

  const promoteUser = async (userId, groupId) => {
    await supabase
      .from('group_members')
      .update({ role: 'moderator' })
      .eq('user_id', userId)
      .eq('group_id', groupId);
    await loadUsers();
  };

  const removeUser = async (userId, groupId) => {
    if (!window.confirm('Remove this user from the group?')) return;
    await supabase
      .from('group_members')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId);
    await loadUsers();
  };

  const postBriefing = async () => {
    if (!briefingText.trim() || postingBriefing) return;
    setPostingBriefing(true);
    await supabase.from('daily_briefings').insert({
      content: briefingText.trim(),
      mood:    briefingMood,
      tags:    [],
    });
    setBriefingText('');
    setPostingBriefing(false);
    alert('Briefing posted!');
  };

  const createCuratedList = async () => {
    if (!selectedGroup || !listName.trim()) return;
    await supabase.from('curated_lists').insert({
      group_id: selectedGroup,
      name:     listName.trim(),
    });
    setListName('');
    alert('Curated list created!');
  };

  const sections = [
    { id: 'groups',   label: 'Manage Groups'   },
    { id: 'users',    label: 'Manage Users'    },
    { id: 'briefing', label: 'Post Briefing'   },
    { id: 'lists',    label: 'Curated Lists'   },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={adminStyles.secLabel}>Admin Panel</div>

      {sections.map(s => (
        <div key={s.id} style={adminStyles.accordion}>
          <div
            style={adminStyles.accordionHeader}
            onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}
          >
            <span style={adminStyles.accordionLabel}>{s.label}</span>
            <span style={adminStyles.accordionArrow}>{activeSection === s.id ? '▲' : '▼'}</span>
          </div>

          {activeSection === s.id && (

            // ── Groups ──
            s.id === 'groups' ? (
              <div style={adminStyles.body}>
                <div style={adminStyles.row}>
                  <input
                    style={adminStyles.input}
                    placeholder="Group name"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                  />
                  <input
                    style={{ ...adminStyles.input, width: 90 }}
                    placeholder="Sector"
                    value={newGroupSector}
                    onChange={e => setNewGroupSector(e.target.value)}
                  />
                </div>
                <div style={{ ...adminStyles.row, marginBottom: 10 }}>
                  <div
                    style={{ ...adminStyles.toggle, background: newGroupPublic ? 'var(--green)' : 'var(--border)' }}
                    onClick={() => setNewGroupPublic(p => !p)}
                  >
                    <div style={{ ...adminStyles.knob, left: newGroupPublic ? 'auto' : 3, right: newGroupPublic ? 3 : 'auto' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{newGroupPublic ? 'Public' : 'Private'}</span>
                  <button style={adminStyles.btn} onClick={createGroup}>Create</button>
                </div>
                {groups.map(g => (
                  <div key={g.id} style={adminStyles.listRow}>
                    <div>
                      <div style={adminStyles.listName}>{g.name}</div>
                      <div style={adminStyles.listSub}>{g.is_public ? 'Public' : 'Private'}{g.sector ? ` · ${g.sector}` : ''}</div>
                    </div>
                    <button style={adminStyles.removeBtn} onClick={() => deleteGroup(g.id)}>Delete</button>
                  </div>
                ))}
              </div>

            // ── Users ──
            ) : s.id === 'users' ? (
              <div style={adminStyles.body}>
                {users.map(u => (
                  <div key={u.id} style={adminStyles.listRow}>
                    <div>
                      <div style={adminStyles.listName}>{u.username}</div>
                      <div style={adminStyles.listSub}>
                        {u.group_members?.map(gm => `${gm.groups?.name} (${gm.role})`).join(', ') || 'No groups'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {u.group_members?.map(gm => gm.role !== 'moderator' && (
                        <button key={gm.groups?.name} style={adminStyles.promoteBtn} onClick={() => promoteUser(u.id, gm.group_id)}>
                          Mod
                        </button>
                      ))}
                      {u.group_members?.map(gm => (
                        <button key={`rm_${gm.groups?.name}`} style={adminStyles.removeBtn} onClick={() => removeUser(u.id, gm.group_id)}>
                          Remove
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            // ── Briefing ──
            ) : s.id === 'briefing' ? (
              <div style={adminStyles.body}>
                <select
                  style={adminStyles.select}
                  value={briefingMood}
                  onChange={e => setBriefingMood(e.target.value)}
                >
                  <option value="neutral">Neutral</option>
                  <option value="risk-on">Risk On</option>
                  <option value="risk-off">Risk Off</option>
                </select>
                <textarea
                  style={adminStyles.textarea}
                  placeholder="Write today's pre-market briefing..."
                  value={briefingText}
                  onChange={e => setBriefingText(e.target.value)}
                  rows={5}
                />
                <button
                  style={{ ...adminStyles.btn, width: '100%', opacity: postingBriefing || !briefingText.trim() ? 0.6 : 1 }}
                  onClick={postBriefing}
                  disabled={postingBriefing || !briefingText.trim()}
                >
                  {postingBriefing ? 'Posting...' : 'Post Briefing'}
                </button>
              </div>

            // ── Curated Lists ──
            ) : s.id === 'lists' ? (
              <div style={adminStyles.body}>
                <select
                  style={adminStyles.select}
                  value={selectedGroup}
                  onChange={e => setSelectedGroup(e.target.value)}
                >
                  <option value="">Select group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <div style={adminStyles.row}>
                  <input
                    style={adminStyles.input}
                    placeholder="List name (e.g. Top 15 Tech)"
                    value={listName}
                    onChange={e => setListName(e.target.value)}
                  />
                  <button style={adminStyles.btn} onClick={createCuratedList}>Create</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  After creating, add tickers from the Lists tab inside that group.
                </div>
              </div>
            ) : null
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ProfileTab ──
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

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

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
              <span style={styles.badgeMember}>Since {formatDate(profile.created_at)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Admin Panel */}
      {isAdmin && <AdminPanel session={session} profile={profile} />}

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
              {copied ? 'Copied!' : 'Copy Invite Link'}
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
            style={{ ...styles.settingRow, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={styles.settingLabel}>{item.label}</span>
            <div
              style={{ ...styles.toggle, background: notifications[item.key] ? 'var(--green)' : 'var(--border)' }}
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

      {/* Account */}
      <div style={styles.secLabel}>Account</div>
      <div style={styles.settingsCard}>
        {[
          { label: 'Trader Name', value: profile?.username },
          { label: 'Email',       value: session?.user?.email?.split('@')[0] + '...' },
        ].map((item, i, arr) => (
          <div
            key={item.label}
            style={{ ...styles.settingRow, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={styles.settingLabel}>{item.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.value && <span style={styles.settingValue}>{item.value}</span>}
              <span style={styles.settingArrow}>›</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sign Out */}
      <div style={styles.secLabel}>Account Actions</div>
      <button style={styles.signOutBtn} onClick={onSignOut}>Sign Out</button>

      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Admin styles ──
const adminStyles = {
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px',
  },
  accordion: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, marginBottom: 6, overflow: 'hidden',
  },
  accordionHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '13px 14px',
    cursor: 'pointer',
  },
  accordionLabel: { fontSize: 14, fontWeight: 500, color: 'var(--text1)' },
  accordionArrow: { fontSize: 11, color: 'var(--text3)' },
  body: { padding: '0 14px 14px', borderTop: '1px solid var(--border)' },
  row: { display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' },
  input: {
    flex: 1, background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px',
    fontSize: 13, color: 'var(--text1)',
    outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px',
    fontSize: 13, color: 'var(--text1)',
    marginTop: 10, boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px',
    fontSize: 13, color: 'var(--text1)',
    resize: 'none', lineHeight: 1.6,
    fontFamily: 'var(--font)', marginTop: 10,
    boxSizing: 'border-box',
  },
  btn: {
    background: 'var(--green)', color: '#fff',
    border: 'none', padding: '8px 16px',
    borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  listRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    gap: 10,
  },
  listName: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  listSub:  { fontSize: 11, color: 'var(--text3)', marginTop: 1 },
  removeBtn: {
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    flexShrink: 0,
  },
  promoteBtn: {
    background: 'var(--blue-bg)',
    border: '1px solid rgba(74,144,217,0.2)',
    color: 'var(--blue)', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    flexShrink: 0,
  },
  toggle: {
    width: 40, height: 24, borderRadius: 12,
    position: 'relative', cursor: 'pointer',
    transition: 'background 0.2s', flexShrink: 0,
  },
  knob: {
    position: 'absolute', top: 4,
    width: 16, height: 16, background: '#fff',
    borderRadius: '50%', transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
};

// ── Profile styles ──
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
  profileInfo:  { flex: 1 },
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
  inviteLink: { fontSize: 11, color: 'var(--blue)', marginTop: 6, textAlign: 'center' },
  settingsCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden', marginBottom: 8,
  },
  settingRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '13px 14px',
  },
  settingLabel: { fontSize: 14, color: 'var(--text1)', fontWeight: 500 },
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
    fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
  },
};
