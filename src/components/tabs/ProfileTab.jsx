// ============================================
// UPTIKALERTS — ProfileTab.jsx
// User profile, settings, and admin panel
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { runScreener, SECTOR_MAP } from '../../lib/screener';

// ── Admin Panel ──
function AdminPanel({ session, profile }) {
  const [activeSection, setActiveSection] = useState(null);

  // Groups state
  const [groups, setGroups]             = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSector, setNewGroupSector] = useState('');
  const [newGroupPublic, setNewGroupPublic] = useState(true);

  // Users state
  const [users, setUsers] = useState([]);

  // Briefing state
  const [briefingText, setBriefingText]       = useState('');
  const [briefingMood, setBriefingMood]       = useState('neutral');
  const [postingBriefing, setPostingBriefing] = useState(false);

  // Curated list state
  const [selectedGroup, setSelectedGroup] = useState('');
  const [listName, setListName]           = useState('');

  // Screener state
  const [screenerSector, setScreenerSector]     = useState('Tech');
  const [screenerGroup, setScreenerGroup]       = useState('');
  const [screenerRunning, setScreenerRunning]   = useState(false);
  const [screenerProgress, setScreenerProgress] = useState(0);
  const [screenerResults, setScreenerResults]   = useState([]);
  const [screenerSaved, setScreenerSaved]       = useState(false);

  // News Scanner state
  const [newsItems, setNewsItems]       = useState([]);
  const [newsLoading, setNewsLoading]   = useState(false);
  const [selectedNews, setSelectedNews] = useState([]);
  const [postingNews, setPostingNews]   = useState(false);

  useEffect(() => {
    if (activeSection === 'groups')   loadGroups();
    if (activeSection === 'users')    loadUsers();
    if (activeSection === 'briefing') loadGroups();
    if (activeSection === 'lists')    loadGroups();
    if (activeSection === 'screener') loadGroups();
    if (activeSection === 'news')     fetchNews();
  }, [activeSection]);

  const loadGroups = async () => {
    const { data } = await supabase.from('groups').select('*').order('created_at');
    if (data) setGroups(data);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, group_members(role, group_id, groups(name))')
      .order('created_at');
    if (data) setUsers(data);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await supabase.from('groups').insert({
      name: newGroupName.trim(), is_public: newGroupPublic,
      sector: newGroupSector.trim() || null,
    });
    setNewGroupName(''); setNewGroupSector('');
    await loadGroups();
  };

  const deleteGroup = async (id) => {
    if (!window.confirm('Delete this group?')) return;
    await supabase.from('groups').delete().eq('id', id);
    await loadGroups();
  };

  const promoteUser = async (userId, groupId) => {
    await supabase.from('group_members').update({ role: 'moderator' }).eq('user_id', userId).eq('group_id', groupId);
    await loadUsers();
  };

  const removeUser = async (userId, groupId) => {
    if (!window.confirm('Remove this user?')) return;
    await supabase.from('group_members').delete().eq('user_id', userId).eq('group_id', groupId);
    await loadUsers();
  };

  const postBriefing = async () => {
    if (!briefingText.trim() || postingBriefing) return;
    setPostingBriefing(true);
    await supabase.from('daily_briefings').insert({ content: briefingText.trim(), mood: briefingMood, tags: [] });
    setBriefingText(''); setPostingBriefing(false);
    alert('Briefing posted!');
  };

  const createCuratedList = async () => {
    if (!selectedGroup || !listName.trim()) return;
    await supabase.from('curated_lists').insert({ group_id: selectedGroup, name: listName.trim() });
    setListName('');
    alert('Curated list created!');
  };

  const handleRunScreener = async () => {
    const matchingGroup = groups.find(g => g.name === screenerSector);
    if (!matchingGroup) { alert(`No group found for ${screenerSector}. Please create it first.`); return; }
    setScreenerGroup(matchingGroup.id);
    setScreenerRunning(true); setScreenerProgress(0);
    setScreenerResults([]); setScreenerSaved(false);
    try {
      const results = await runScreener(screenerSector, (pct) => setScreenerProgress(pct));
      setScreenerResults(results);
    } catch (e) {
      alert('Screener error: ' + e.message);
    } finally {
      setScreenerRunning(false);
    }
  };

  const handleSaveResults = async () => {
    if (!screenerResults.length || !screenerGroup) return;
    let { data: list } = await supabase
      .from('curated_lists').select('*')
      .eq('group_id', screenerGroup).eq('name', `Top 15 ${screenerSector}`).maybeSingle();
    if (!list) {
      const { data: newList } = await supabase
        .from('curated_lists').insert({ group_id: screenerGroup, name: `Top 15 ${screenerSector}`, sector: screenerSector })
        .select().single();
      list = newList;
    }
    if (!list) { alert('Could not create list.'); return; }
    await supabase.from('curated_stocks').delete().eq('list_id', list.id);
    const rows = screenerResults.map((r, i) => ({
      list_id: list.id, ticker: r.symbol, ranking: i + 1, score: r.score, sector: r.sector,
      thesis: r.thesis,
      notes: `P/E: ${r.pe?.toFixed(1) || 'N/A'} · PEG: ${r.peg?.toFixed(2) || 'N/A'} · Net Margin: ${r.netMargin ? (r.netMargin * 100).toFixed(1) + '%' : 'N/A'} · Sales Growth: ${r.salesGrowth != null ? r.salesGrowth + '%' : 'N/A'} · EPS Growth: ${r.epsGrowth != null ? r.epsGrowth + '%' : 'N/A'} · Beat Rate: ${r.beatRate != null ? r.beatRate + '%' : 'N/A'}`,
    }));
    await supabase.from('curated_stocks').insert(rows);
    setScreenerSaved(true);
    alert(`Saved top 15 ${screenerSector} stocks!`);
  };

  const fetchNews = async () => {
    setNewsLoading(true);
    setSelectedNews([]);
    try {
      const res = await fetch(`https://api.polygon.io/v2/reference/news?limit=20&apiKey=${import.meta.env.VITE_POLYGON_API_KEY}`);
      const data = await res.json();
      setNewsItems(data.results || []);
    } catch {}
    setNewsLoading(false);
  };

  const postNewsBriefing = async () => {
    if (!selectedNews.length || postingNews) return;
    setPostingNews(true);
    const content = selectedNews
      .map(id => {
        const item = newsItems.find(n => n.id === id);
        return item ? `• ${item.title} (${item.tickers?.slice(0,3).join(', ')})` : '';
      })
      .filter(Boolean)
      .join('\n');
    await supabase.from('daily_briefings').insert({ content, mood: 'neutral', tags: [] });
    setSelectedNews([]);
    setPostingNews(false);
    alert('Briefing posted!');
  };

  const sections = [
    { id: 'news',     label: 'News Scanner'  },
    { id: 'screener', label: 'Run Screener'  },
    { id: 'briefing', label: 'Post Briefing' },
    { id: 'lists',    label: 'Curated Lists' },
    { id: 'groups',   label: 'Manage Groups' },
    { id: 'users',    label: 'Manage Users'  },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={adminStyles.secLabel}>Admin Panel</div>
      {sections.map(s => (
        <div key={s.id} style={adminStyles.accordion}>
          <div style={adminStyles.accordionHeader} onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}>
            <span style={adminStyles.accordionLabel}>{s.label}</span>
            <span style={adminStyles.accordionArrow}>{activeSection === s.id ? '▲' : '▼'}</span>
          </div>

          {activeSection === s.id && (
            s.id === 'screener' ? (
              <div style={adminStyles.body}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10, marginBottom: 10 }}>
                  Scores top stocks from S&P 500 + Nasdaq 100 by sector using FMP data.
                </div>
                <div style={adminStyles.row}>
                  <select style={adminStyles.select} value={screenerSector} onChange={e => setScreenerSector(e.target.value)}>
                    {Object.keys(SECTOR_MAP).filter(s => s !== 'General').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <button
                  style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: screenerRunning ? 0.6 : 1 }}
                  onClick={handleRunScreener} disabled={screenerRunning}
                >
                  {screenerRunning ? `Scanning... ${screenerProgress}%` : `Run ${screenerSector} Screener`}
                </button>
                {screenerRunning && (
                  <div style={adminStyles.progressBar}>
                    <div style={{ ...adminStyles.progressFill, width: `${screenerProgress}%` }} />
                  </div>
                )}
                {screenerResults.length > 0 && (
                  <>
                    <div style={{ ...adminStyles.secLabel, marginTop: 14 }}>Top {screenerResults.length} {screenerSector} Stocks</div>
                    {screenerResults.map((r, i) => (
                      <div key={r.symbol} style={adminStyles.listRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={adminStyles.rank}>#{i + 1}</span>
                            <span style={adminStyles.listName}>{r.symbol}</span>
                            <span style={adminStyles.scoreTag}>{r.score}</span>
                          </div>
                          <div style={adminStyles.listSub}>P/E {r.pe?.toFixed(1) || 'N/A'} · PEG {r.peg?.toFixed(2) || 'N/A'} · Beat {r.beatRate}%</div>
                          <div style={adminStyles.thesisText}>{r.thesis}</div>
                        </div>
                      </div>
                    ))}
                    <button
                      style={{ ...adminStyles.btn, width: '100%', marginTop: 12, background: screenerSaved ? '#888' : 'var(--green)' }}
                      onClick={handleSaveResults} disabled={screenerSaved}
                    >
                      {screenerSaved ? 'Saved!' : 'Save to Curated List'}
                    </button>
                  </>
                )}
              </div>
            ) : s.id === 'briefing' ? (
              <div style={adminStyles.body}>
                <select style={{ ...adminStyles.select, marginTop: 10 }} value={briefingMood} onChange={e => setBriefingMood(e.target.value)}>
                  <option value="neutral">Neutral</option>
                  <option value="risk-on">Risk On</option>
                  <option value="risk-off">Risk Off</option>
                </select>
                <textarea style={adminStyles.textarea} placeholder="Write today's pre-market briefing..." value={briefingText} onChange={e => setBriefingText(e.target.value)} rows={5} />
                <button style={{ ...adminStyles.btn, width: '100%', opacity: postingBriefing || !briefingText.trim() ? 0.6 : 1 }} onClick={postBriefing} disabled={postingBriefing || !briefingText.trim()}>
                  {postingBriefing ? 'Posting...' : 'Post Briefing'}
                </button>
              </div>
            ) : s.id === 'lists' ? (
              <div style={adminStyles.body}>
                <select style={{ ...adminStyles.select, marginTop: 10 }} value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                  <option value="">Select group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <div style={adminStyles.row}>
                  <input style={adminStyles.input} placeholder="List name" value={listName} onChange={e => setListName(e.target.value)} />
                  <button style={adminStyles.btn} onClick={createCuratedList}>Create</button>
                </div>
              </div>
            ) : s.id === 'groups' ? (
              <div style={adminStyles.body}>
                <div style={adminStyles.row}>
                  <input style={adminStyles.input} placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                  <input style={{ ...adminStyles.input, width: 90 }} placeholder="Sector" value={newGroupSector} onChange={e => setNewGroupSector(e.target.value)} />
                </div>
                <div style={{ ...adminStyles.row, marginBottom: 10 }}>
                  <div style={{ ...adminStyles.toggle, background: newGroupPublic ? 'var(--green)' : 'var(--border)' }} onClick={() => setNewGroupPublic(p => !p)}>
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
            ) : s.id === 'news' ? (
              <div style={adminStyles.body}>
                <button style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: newsLoading ? 0.6 : 1 }} onClick={fetchNews} disabled={newsLoading}>
                  {newsLoading ? 'Loading...' : 'Refresh News'}
                </button>
                <div style={{ maxHeight: 400, overflowY: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 8 }}>
                  {newsItems.map(item => (
                    <div key={item.id}
                      style={{ ...adminStyles.listRow, background: selectedNews.includes(item.id) ? 'var(--green-bg)' : 'transparent', borderRadius: 8, padding: '10px 8px', cursor: 'pointer' }}
                      onClick={() => setSelectedNews(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.4 }}>{item.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                          {item.tickers?.slice(0,5).join(', ')} · {new Date(item.published_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, background: selectedNews.includes(item.id) ? 'var(--green)' : 'var(--card2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedNews.includes(item.id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedNews.length > 0 && (
                  <button style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: postingNews ? 0.6 : 1 }} onClick={postNewsBriefing} disabled={postingNews}>
                    {postingNews ? 'Posting...' : `Post ${selectedNews.length} article${selectedNews.length > 1 ? 's' : ''} as briefing`}
                  </button>
                )}
              </div>
            ) : s.id === 'users' ? (
              <div style={adminStyles.body}>
                {users.map(u => (
                  <div key={u.id} style={adminStyles.listRow}>
                    <div style={{ flex: 1 }}>
                      <div style={adminStyles.listName}>{u.username}</div>
                      <div style={adminStyles.listSub}>{u.group_members?.map(gm => `${gm.groups?.name} (${gm.role})`).join(', ') || 'No groups'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {u.group_members?.filter(gm => gm.role !== 'moderator' && gm.role !== 'admin').map(gm => (
                        <button key={`mod_${gm.group_id}`} style={adminStyles.promoteBtn} onClick={() => promoteUser(u.id, gm.group_id)}>Mod</button>
                      ))}
                      {u.group_members?.map(gm => (
                        <button key={`rm_${gm.group_id}`} style={adminStyles.removeBtn} onClick={() => removeUser(u.id, gm.group_id)}>Remove</button>
                      ))}
                    </div>
                  </div>
                ))}
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
  const [notifications, setNotifications] = useState({ alerts: true, briefing: true, broadcasts: true, chat: false });
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/join/${group?.invite_code}`).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const toggleNotification = (key) => setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
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

      {isAdmin && <AdminPanel session={session} profile={profile} />}

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
            <div style={{ ...styles.toggle, background: notifications[item.key] ? 'var(--green)' : 'var(--border)' }} onClick={() => toggleNotification(item.key)}>
              <div style={{ ...styles.toggleKnob, left: notifications[item.key] ? 'auto' : 3, right: notifications[item.key] ? 3 : 'auto' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.secLabel}>Account</div>
      <div style={styles.settingsCard}>
        {[{ label: 'Trader Name', value: profile?.username }, { label: 'Email', value: session?.user?.email?.split('@')[0] + '...' }].map((item, i, arr) => (
          <div key={item.label} style={{ ...styles.settingRow, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={styles.settingLabel}>{item.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.value && <span style={styles.settingValue}>{item.value}</span>}
              <span style={styles.settingArrow}>›</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.secLabel}>Account Actions</div>
      <button style={styles.signOutBtn} onClick={onSignOut}>Sign Out</button>
      <div style={{ height: 20 }} />
    </div>
  );
}

const adminStyles = {
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  accordion: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  accordionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', cursor: 'pointer' },
  accordionLabel: { fontSize: 14, fontWeight: 500, color: 'var(--text1)' },
  accordionArrow: { fontSize: 11, color: 'var(--text3)' },
  body: { padding: '0 14px 14px', borderTop: '1px solid var(--border)' },
  row: { display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' },
  input: { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text1)', outline: 'none', boxSizing: 'border-box' },
  select: { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text1)', boxSizing: 'border-box' },
  textarea: { width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text1)', resize: 'none', lineHeight: 1.6, fontFamily: 'var(--font)', marginTop: 10, boxSizing: 'border-box' },
  btn: { background: 'var(--green)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  listRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 10 },
  listName: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  listSub: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  thesisText: { fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 },
  rank: { fontSize: 11, color: 'var(--text3)', fontWeight: 600, minWidth: 20 },
  scoreTag: { fontSize: 11, fontWeight: 700, background: 'var(--green-bg)', color: 'var(--green)', padding: '1px 7px', borderRadius: 10, border: '1px solid rgba(26,173,94,0.2)' },
  removeBtn: { background: 'var(--red-bg)', border: '1px solid rgba(224,82,82,0.2)', color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', flexShrink: 0 },
  promoteBtn: { background: 'var(--blue-bg)', border: '1px solid rgba(74,144,217,0.2)', color: 'var(--blue)', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', flexShrink: 0 },
  toggle: { width: 40, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 },
  knob: { position: 'absolute', top: 4, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  progressBar: { height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--green)', borderRadius: 3, transition: 'width 0.3s' },
};

const styles = {
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 12px', WebkitOverflowScrolling: 'touch' },
  profileCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 },
  avatarWrap: { flexShrink: 0 },
  avatar: { width: 56, height: 56, borderRadius: '50%', background: 'var(--green-bg)', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  profileEmail: { fontSize: 12, color: 'var(--text2)', marginBottom: 6 },
  profileBadges: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  badgeAdmin: { background: 'rgba(212,160,23,0.1)', color: '#D4A017', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(212,160,23,0.2)' },
  badgeGroup: { background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(74,144,217,0.2)' },
  badgeMember: { background: 'var(--card2)', color: 'var(--text2)', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' },
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  groupCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 },
  groupTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  groupName: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  modBadge: { background: '#FFFBEB', color: '#D4A017', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(212,160,23,0.2)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  inviteBtn: { width: '100%', background: 'var(--card2)', border: '1.5px solid var(--border)', color: 'var(--text1)', padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inviteLink: { fontSize: 11, color: 'var(--blue)', marginTop: 6, textAlign: 'center' },
  settingsCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px' },
  settingLabel: { fontSize: 14, color: 'var(--text1)', fontWeight: 500 },
  settingValue: { fontSize: 12, color: 'var(--text2)' },
  settingArrow: { fontSize: 14, color: 'var(--text3)' },
  toggle: { width: 40, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 },
  toggleKnob: { position: 'absolute', top: 4, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  signOutBtn: { width: '100%', background: 'var(--red-bg)', border: '1px solid rgba(224,82,82,0.2)', color: 'var(--red)', padding: 13, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 },
};
