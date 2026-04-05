// ============================================
// UPTIKALERTS — Header.jsx
// Top header bar — context-aware per tab
// Now with custom group creation + invite sharing
// ============================================

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';

const GROUP_COLORS = ['#7B68EE', '#4CAF50', '#FF7043', '#42A5F5', '#FFB300'];

export default function Header({ group, profile, isAdmin, isModerator, activeTab, allGroups, onGroupSwitch, onGroupNameUpdate, onSignOut, onHomePress, onProfilePress }) {
  const { sectorGroups, customGroups, createCustomGroup } = useGroup();

  const [editing, setEditing]           = useState(false);
  const [editName, setEditName]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);

  // Create group state
  const [showCreate, setShowCreate]     = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#7B68EE');
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState('');

  // Invite share state
  const [showInvite, setShowInvite]     = useState(null); // group object
  const [copied, setCopied]             = useState(false);

  const dropdownRef  = useRef(null);
  const avatarRef    = useRef(null);
  const createRef    = useRef(null);

  const canEdit        = isAdmin || isModerator;
  const hasMultiGroup  = (allGroups || []).length > 1 || customGroups.length > 0;

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showDropdown && !showCreate && !showInvite) return;
    const handler = (e) => {
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showDropdown, showCreate, showInvite]);

  // Close avatar menu on outside click
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

  const handleSave = async () => {
    const name = editName.trim();
    if (!name || saving) return;
    setSaving(true);
    const { error } = await supabase.from('groups').update({ name }).eq('id', group.id);
    setSaving(false);
    if (error) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 2000);
      setEditName(group?.name || '');
      setEditing(false);
      return;
    }
    setEditing(false);
    onGroupNameUpdate?.(name);
  };

  const handleGroupSwitch = (g) => {
    setShowDropdown(false);
    onGroupSwitch?.(g);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || creating) return;
    setCreating(true);
    setCreateError('');

    const result = await createCustomGroup(newGroupName, newGroupColor);

    if (result.error) {
      setCreateError(result.error);
      setCreating(false);
      return;
    }

    // Success — show invite screen for the new group
    setCreating(false);
    setShowCreate(false);
    setNewGroupName('');
    setNewGroupColor('#7B68EE');
    setShowDropdown(false);

    // Switch to the new group and show invite
    onGroupSwitch?.(result.group);
    setShowInvite(result.group);
  };

  const getInviteLink = (g) => {
    return `${window.location.origin}/join/${g.invite_code}`;
  };

  const handleCopyLink = async (g) => {
    try {
      await navigator.clipboard.writeText(getInviteLink(g));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for mobile
      const input = document.createElement('input');
      input.value = getInviteLink(g);
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async (g) => {
    const link = getInviteLink(g);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${g.name} on UpTikAlerts`, text: `Join my group "${g.name}" on UpTikAlerts!`, url: link });
      } catch {}
    } else {
      handleCopyLink(g);
    }
  };

  const handleTextLink = (g) => {
    const link = getInviteLink(g);
    const text = encodeURIComponent(`Join my group "${g.name}" on UpTikAlerts! ${link}`);
    window.open(`sms:?body=${text}`, '_self');
  };

  if (activeTab === 'home') return null;

  if (activeTab === 'chat') {
    return (
      <>
        <div style={{ ...styles.header, borderBottom: '2px solid #2a7d4b' }}>
          <div style={styles.chatRow}>
            <span style={styles.chatLabel}>GroupChat</span>
            <span style={styles.chatSep}> · </span>

            {editing ? (
              <>
                <input
                  style={{ ...styles.editInput, borderColor: saveError ? '#EF4444' : 'var(--border)' }}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? '…' : saveError ? 'Error' : 'Save'}
                </button>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <div ref={dropdownRef} style={styles.groupNameWrap}>
                <span
                  style={{
                    ...styles.chatGroupName,
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (!canEdit) return;
                    setEditName(group?.name || '');
                    setEditing(true);
                  }}
                >
                  {group?.name || 'Group'}
                </span>

                {/* Custom group color dot */}
                {group && !group.is_public && group.color && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                )}

                {/* Invite button for custom groups */}
                {group && !group.is_public && group.invite_code && (
                  <button
                    style={styles.inviteBtn}
                    onClick={() => setShowInvite(group)}
                  >
                    Invite
                  </button>
                )}

                <button
                  style={styles.dropdownToggle}
                  onClick={() => setShowDropdown(prev => !prev)}
                >
                  ▼
                </button>

                {showDropdown && (
                  <div style={styles.dropdown}>
                    {/* Sector Groups */}
                    {sectorGroups.length > 0 && (
                      <>
                        <div style={styles.dropdownSection}>Sector groups</div>
                        {sectorGroups.map(g => (
                          <button
                            key={g.id}
                            style={{
                              ...styles.dropdownItem,
                              background: g.id === group?.id ? 'var(--green-bg)' : 'transparent',
                              color: g.id === group?.id ? 'var(--green)' : 'var(--text1)',
                            }}
                            onClick={() => handleGroupSwitch(g)}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{g.name}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Custom Groups */}
                    {customGroups.length > 0 && (
                      <>
                        <div style={{ ...styles.dropdownSection, borderTop: sectorGroups.length > 0 ? '1px solid var(--border)' : 'none' }}>
                          My groups
                        </div>
                        {customGroups.map(g => (
                          <button
                            key={g.id}
                            style={{
                              ...styles.dropdownItem,
                              background: g.id === group?.id ? 'var(--green-bg)' : 'transparent',
                              color: g.id === group?.id ? 'var(--green)' : 'var(--text1)',
                            }}
                            onClick={() => handleGroupSwitch(g)}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#7B68EE', flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{g.name}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Create New Group */}
                    <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
                      <button
                        style={styles.createBtn}
                        onClick={() => { setShowDropdown(false); setShowCreate(true); }}
                      >
                        <div style={styles.createIcon}>+</div>
                        <span>Create new group</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Create Group Modal ── */}
        {showCreate && (
          <div style={styles.modalOverlay} onClick={() => { setShowCreate(false); setCreateError(''); }}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>Create group</div>

              <div style={styles.fieldLabel}>Group name</div>
              <input
                ref={createRef}
                style={styles.modalInput}
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                placeholder="e.g. Options Gang"
                maxLength={40}
                autoFocus
              />

              <div style={styles.fieldLabel}>Color</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {GROUP_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => setNewGroupColor(c)}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: newGroupColor === c ? '2.5px solid var(--text1)' : '2.5px solid transparent',
                      transition: 'border 0.15s',
                    }}
                  />
                ))}
              </div>

              {createError && (
                <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{createError}</div>
              )}

              <button
                style={{ ...styles.modalSendBtn, opacity: creating || !newGroupName.trim() ? 0.5 : 1 }}
                onClick={handleCreateGroup}
                disabled={creating || !newGroupName.trim()}
              >
                {creating ? 'Creating...' : 'Create group'}
              </button>
            </div>
          </div>
        )}

        {/* ── Invite Share Modal ── */}
        {showInvite && (
          <div style={styles.modalOverlay} onClick={() => { setShowInvite(null); setCopied(false); }}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: `${showInvite.color || '#7B68EE'}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={showInvite.color || '#7B68EE'} strokeWidth="1.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>
                  Invite to {showInvite.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.4 }}>
                  Share this link — one tap and they're in.
                </div>
              </div>

              {/* Link display */}
              <div style={styles.linkRow}>
                <span style={styles.linkText}>{getInviteLink(showInvite)}</span>
                <button
                  style={{ ...styles.copyBtn, background: copied ? 'var(--green)' : 'var(--green)' }}
                  onClick={() => handleCopyLink(showInvite)}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Share buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button style={styles.shareOption} onClick={() => handleTextLink(showInvite)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  <span>Text it</span>
                </button>
                <button style={styles.shareOption} onClick={() => handleCopyLink(showInvite)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>Copy link</span>
                </button>
                <button style={styles.shareOption} onClick={() => handleShareLink(showInvite)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  <span>Share</span>
                </button>
              </div>

              <button
                style={{ ...styles.skipBtn, marginTop: 16 }}
                onClick={() => { setShowInvite(null); setCopied(false); }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={styles.header}>
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0 }} onClick={() => onHomePress?.()}>
        {/* U-arrow icon */}
        <svg width="38" height="38" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3" />
          <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.2" opacity="0.6" />
          <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.5" opacity="0.35" />
          <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3" />
        </svg>
        <div>
          <div style={styles.logoRow}>
            <span style={styles.logoUp}>Up</span>
            <span style={styles.logoTik}>tik</span>
          </div>
          <div style={styles.logoAlerts}>alerts</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Bell icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
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
        <div style={styles.slogan}>ONE TEAM, ONE TRADE</div>
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
  // ── Chat tab header ──
  chatRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  chatLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f0f0f0',
  },
  chatSep: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 400,
  },
  groupNameWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  chatGroupName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#8cd9a0',
  },
  inviteBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  dropdownToggle: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: 1,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    zIndex: 100,
    minWidth: 200,
    overflow: 'hidden',
  },
  dropdownSection: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: 'var(--text3)',
    padding: '10px 14px 4px',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--green)',
    background: 'transparent',
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  createIcon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--green)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
  },
  editInput: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text1)',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 6,
    padding: '3px 8px',
    fontFamily: 'var(--font)',
    outline: 'none',
    width: 130,
  },
  saveBtn: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--green)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    marginLeft: 6,
  },
  cancelBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text2)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginLeft: 2,
  },
  // ── Modals ──
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 300,
    padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '20px 16px 16px',
    width: '100%',
    maxWidth: 360,
    margin: '0 12px',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text3)',
    marginBottom: 6,
  },
  modalInput: {
    width: '100%',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--text1)',
    fontFamily: 'var(--font)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 16,
  },
  modalSendBtn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 0',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  // ── Invite modal ──
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    color: 'var(--text3)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  copyBtn: {
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
  },
  shareOption: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 8px',
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
  },
  skipBtn: {
    width: '100%',
    background: 'var(--card2)',
    color: 'var(--text3)',
    border: 'none',
    borderRadius: 12,
    padding: '13px 0',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  // ── Default header ──
  logoRow:    { display: 'flex', alignItems: 'baseline' },
  logoUp:     { fontSize: 20, fontWeight: 500, color: '#f0ede8' },
  logoTik:    { fontSize: 20, fontWeight: 500, color: '#8cd9a0' },
  logoAlerts: {
    fontSize: 12, fontWeight: 300, color: '#d4e4f2', letterSpacing: 2.5,
    fontFamily: "'Outfit', sans-serif",
    marginTop: 0, paddingLeft: 0,
  },
  slogan: {
    fontSize: 12, fontWeight: 300, fontStyle: 'italic',
    color: '#f0ede8', letterSpacing: 1,
    fontFamily: "'Outfit', sans-serif",
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
