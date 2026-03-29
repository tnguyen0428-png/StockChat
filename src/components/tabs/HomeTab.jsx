// ============================================
// UPTIKALERTS — HomeTab.jsx
// Homepage: briefing, sectors, private groups,
// market pulse, top movers
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const SECTOR_ORDER = ['Tech', 'Healthcare', 'Energy', 'Finance', 'Industrial', 'General'];

export default function HomeTab({ session, profile, allGroups, isAdmin, onGroupSelect, onGroupsRefresh }) {
  const [publicGroups, setPublicGroups]   = useState([]);
  const [privateGroups, setPrivateGroups] = useState([]);
  const [briefing, setBriefing]           = useState(null);
  const [marketPulse, setMarketPulse]     = useState({});
  const [movers, setMovers]               = useState({ gainers: [], losers: [] });
  const [moversTab, setMoversTab]         = useState('gainers');
  const [loading, setLoading]             = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinInvite, setShowJoinInvite]   = useState(false);
  const [newGroupName, setNewGroupName]   = useState('');
  const [inviteCode, setInviteCode]       = useState('');
  const [joiningId, setJoiningId]         = useState(null);

  useEffect(() => {
    loadData();
  }, [session?.user?.id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadGroups(),
      loadBriefing(),
      loadMarketPulse(),
      loadMovers(),
    ]);
    setLoading(false);
  };

  const loadGroups = async () => {
    const { data: pub } = await supabase
      .from('groups')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: true });

    if (pub) {
      const sorted = [...pub].sort((a, b) => {
        const ai = SECTOR_ORDER.indexOf(a.sector || a.name);
        const bi = SECTOR_ORDER.indexOf(b.sector || b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setPublicGroups(sorted);
    }

    const { data: memberships } = await supabase
      .from('group_members')
      .select('*, groups(*)')
      .eq('user_id', session.user.id);

    if (memberships) {
      const priv = memberships
        .map(gm => gm.groups)
        .filter(g => g && g.is_public === false);
      setPrivateGroups(priv);
    }
  };

  const loadBriefing = async () => {
    const { data } = await supabase
      .from('daily_briefings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setBriefing(data);
  };

  const loadMarketPulse = async () => {
    try {
      const tickers = ['SPY', 'QQQ', 'DIA', 'VIXY'];
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_KEY}`
      );
      const data = await res.json();
      if (data.tickers) {
        const pulse = {};
        data.tickers.forEach(t => {
          pulse[t.ticker] = {
            price: t.day?.c || t.prevDay?.c,
            change: t.todaysChangePerc,
          };
        });
        setMarketPulse(pulse);
      }
    } catch {}
  };

  const loadMovers = async () => {
    try {
      const [gainRes, loseRes] = await Promise.all([
        fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_KEY}`),
        fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/losers?apiKey=${POLYGON_KEY}`),
      ]);
      const gainData = await gainRes.json();
      const loseData = await loseRes.json();
      setMovers({
        gainers: (gainData.tickers || []).slice(0, 5),
        losers:  (loseData.tickers  || []).slice(0, 5),
      });
    } catch {}
  };

  const handleSectorTap = async (group) => {
    const isMember = (allGroups || []).some(g => g.id === group.id);
    if (!isMember) {
      setJoiningId(group.id);
      await supabase.from('group_members').insert({
        group_id: group.id,
        user_id:  session.user.id,
        role:     'member',
      });
      await onGroupsRefresh?.();
      setJoiningId(null);
    }
    onGroupSelect?.(group, 'chat');
  };

  const handlePrivateTap = (group) => {
    onGroupSelect?.(group, 'chat');
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data } = await supabase
      .from('groups')
      .insert({ name: newGroupName.trim(), is_public: false, moderator_id: session.user.id })
      .select()
      .single();
    if (data) {
      await supabase.from('group_members').insert({
        group_id: data.id,
        user_id:  session.user.id,
        role:     'moderator',
      });
      setPrivateGroups(prev => [...prev, data]);
      setNewGroupName('');
      setShowCreateGroup(false);
      onGroupsRefresh?.();
    }
  };

  const handleJoinInvite = async () => {
    if (!inviteCode.trim()) return;
    const code = inviteCode.trim().split('/').pop();
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('invite_code', code)
      .maybeSingle();
    if (group) {
      await supabase.from('group_members').insert({
        group_id: group.id,
        user_id:  session.user.id,
        role:     'member',
      });
      if (!group.is_public) setPrivateGroups(prev => [...prev, group]);
      setInviteCode('');
      setShowJoinInvite(false);
      onGroupsRefresh?.();
      onGroupSelect?.(group, 'chat');
    }
  };

  const fmt = (p) => p != null ? `$${Number(p).toFixed(2)}` : '--';
  const fmtPct = (p) => p != null ? `${p > 0 ? '+' : ''}${Number(p).toFixed(1)}%` : '--';

  const pulseItems = [
    { label: 'S&P 500', key: 'SPY'  },
    { label: 'Nasdaq',  key: 'QQQ'  },
    { label: 'Dow',     key: 'DIA'  },
    { label: 'VIX',     key: 'VIXY' },
  ];

  const moversData = movers[moversTab] || [];

  return (
    <div style={styles.scroll}>

      {/* ── DAILY BRIEFING ── */}
      <div style={styles.secLabel}>Daily Briefing</div>
      {briefing ? (
        <div style={styles.briefingCard}>
          <div style={styles.briefingTag}>Pre-market</div>
          <div style={styles.briefingText}>{briefing.content}</div>
          <div style={styles.briefingMeta}>
            Updated {new Date(briefing.created_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit'
            })} EST
          </div>
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No briefing posted yet today</span>
        </div>
      )}

      {/* ── SECTORS ── */}
      <div style={styles.secLabel}>Sectors</div>
      <div style={styles.pillRow}>
        {publicGroups.map(group => {
          const isMember = (allGroups || []).some(g => g.id === group.id);
          const isJoining = joiningId === group.id;
          return (
            <div
              key={group.id}
              style={{ ...styles.pill, ...(isMember ? styles.pillActive : {}), opacity: isJoining ? 0.6 : 1 }}
              onClick={() => !isJoining && handleSectorTap(group)}
            >
              {isJoining ? '...' : (group.sector || group.name)}
            </div>
          );
        })}
      </div>

      {/* ── PRIVATE GROUPS ── */}
      <div style={styles.secLabel}>Private Groups</div>
      <div style={styles.pillRow}>
        {privateGroups.map(group => (
          <div key={group.id} style={styles.pillPrivate} onClick={() => handlePrivateTap(group)}>
            {group.name}
          </div>
        ))}
        {!showCreateGroup && !showJoinInvite && (
          <>
            <button style={styles.createBtn} onClick={() => setShowCreateGroup(true)}>
              + Create group
            </button>
            <div style={styles.pill} onClick={() => setShowJoinInvite(true)}>
              Join via Invite
            </div>
          </>
        )}
      </div>

      {showCreateGroup && (
        <div style={styles.inlineForm}>
          <input
            style={styles.input}
            placeholder="Group name"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
            autoFocus
          />
          <div style={styles.formBtns}>
            <button style={styles.createBtn} onClick={handleCreateGroup}>Create</button>
            <button style={styles.cancelBtn} onClick={() => { setShowCreateGroup(false); setNewGroupName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {showJoinInvite && (
        <div style={styles.inlineForm}>
          <input
            style={styles.input}
            placeholder="Paste invite code or link"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoinInvite()}
            autoFocus
          />
          <div style={styles.formBtns}>
            <button style={styles.createBtn} onClick={handleJoinInvite}>Join</button>
            <button style={styles.cancelBtn} onClick={() => { setShowJoinInvite(false); setInviteCode(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── MARKET PULSE ── */}
      <div style={styles.secLabel}>Market Pulse</div>
      <div style={styles.pulseGrid}>
        {pulseItems.map(item => {
          const d   = marketPulse[item.key];
          const chg = d?.change;
          const up  = chg > 0;
          return (
            <div key={item.key} style={styles.pulseCard}>
              <div style={styles.pulseLabel}>{item.label}</div>
              <div style={styles.pulseVal}>{d ? fmt(d.price) : '--'}</div>
              <div style={{ ...styles.pulseChg, color: chg == null ? 'var(--text3)' : up ? 'var(--green)' : 'var(--red)' }}>
                {d ? fmtPct(chg) : '--'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── TOP MOVERS ── */}
      <div style={styles.secLabel}>Top Movers</div>
      <div style={styles.moversCard}>
        <div style={styles.tabRow}>
          {[
            { id: 'gainers', label: 'Gainers' },
            { id: 'losers',  label: 'Losers'  },
          ].map(t => (
            <div
              key={t.id}
              style={{ ...styles.tab, ...(moversTab === t.id ? styles.tabActive : {}) }}
              onClick={() => setMoversTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>

        {moversData.length === 0 ? (
          <div style={styles.emptyText}>Loading...</div>
        ) : (
          moversData.map((m, i) => {
            const chg = m.todaysChangePerc;
            const up  = chg >= 0;
            return (
              <div
                key={i}
                style={{
                  ...styles.moverRow,
                  borderBottom: i < moversData.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={styles.moverTicker}>{m.ticker}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={styles.moverPrice}>{fmt(m.day?.c)}</div>
                  <div style={{ ...styles.moverPct, color: up ? 'var(--green)' : 'var(--red)' }}>
                    {fmtPct(chg)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

const styles = {
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '4px 12px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)',
    padding: '0 4px', margin: '14px 0 8px',
  },
  briefingCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  briefingTag: {
    display: 'inline-block', fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 4,
    background: 'var(--blue-bg)', color: 'var(--blue)',
    marginBottom: 6,
  },
  briefingText: { fontSize: 13, color: 'var(--text1)', lineHeight: 1.7 },
  briefingMeta: { fontSize: 10, color: 'var(--text3)', marginTop: 6 },
  pillRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  pill: {
    fontSize: 13, padding: '6px 14px', borderRadius: 20,
    border: '1px solid var(--border)', color: 'var(--text2)',
    background: 'var(--card)', cursor: 'pointer', fontWeight: 500,
  },
  pillActive: {
    background: 'var(--card2)', color: 'var(--text1)',
    borderColor: 'var(--text3)',
  },
  pillPrivate: {
    fontSize: 13, padding: '6px 14px', borderRadius: 20,
    border: '1px solid rgba(26,173,94,0.4)',
    color: '#1AAD5E', background: 'var(--green-bg)',
    cursor: 'pointer', fontWeight: 500,
  },
  createBtn: {
    fontSize: 13, fontWeight: 600,
    padding: '6px 16px', borderRadius: 20,
    background: '#1AAD5E', color: '#fff',
    border: 'none', cursor: 'pointer',
  },
  cancelBtn: {
    fontSize: 13, padding: '6px 14px', borderRadius: 20,
    border: '1px solid var(--border)', color: 'var(--text2)',
    background: 'var(--card)', cursor: 'pointer',
  },
  inlineForm: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 4,
  },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text1)', fontSize: 14, marginBottom: 8,
    boxSizing: 'border-box',
  },
  formBtns: { display: 'flex', gap: 8 },
  pulseGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6, marginBottom: 4,
  },
  pulseCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 6px',
  },
  pulseLabel: { fontSize: 9, color: 'var(--text3)', marginBottom: 2 },
  pulseVal:   { fontSize: 12, fontWeight: 600, color: 'var(--text1)' },
  pulseChg:   { fontSize: 10 },
  moversCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '0 14px 14px', marginBottom: 8,
  },
  tabRow: {
    display: 'flex', gap: 14,
    borderBottom: '1px solid var(--border)',
    marginBottom: 10, marginLeft: -14, marginRight: -14, paddingLeft: 14,
  },
  tab: {
    fontSize: 11, padding: '9px 0',
    color: 'var(--text3)', borderBottom: '2px solid transparent',
    cursor: 'pointer',
  },
  tabActive: {
    color: 'var(--text1)', fontWeight: 600,
    borderBottomColor: 'var(--green)',
  },
  moverRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '8px 0',
  },
  moverTicker: { fontSize: 14, fontWeight: 600, color: 'var(--text1)' },
  moverPrice:  { fontSize: 13, fontWeight: 500, color: 'var(--text1)' },
  moverPct:    { fontSize: 11 },
  emptyCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 8,
  },
  emptyText: { fontSize: 13, color: 'var(--text3)' },
};
