// ============================================
// UPTIKALERTS — AlertsTab.jsx
// Breakout alerts feed + broadcast history
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const BADGE_CONFIG = {
  '52w_high':  { color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(26,173,94,0.3)',  label: '52W High'  },
  'vol_surge': { color: 'var(--blue)',  bg: 'var(--blue-bg)',  border: 'rgba(74,144,217,0.3)', label: 'Vol Surge' },
  'gap_up':    { color: '#D4A017',      bg: '#FFFBEB',         border: 'rgba(212,160,23,0.3)', label: 'Gap Up'    },
  'ma_cross':  { color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(26,173,94,0.3)',  label: 'MA Cross'  },
  'vcp':       { color: '#8B5CF6',      bg: '#F5F3FF',         border: 'rgba(139,92,246,0.3)', label: 'VCP'       },
};

const BC_COLORS = {
  BULLISH:   { color: '#1AAD5E', bg: '#F0FBF5', border: 'rgba(26,173,94,0.25)'   },
  BEARISH:   { color: '#E05252', bg: '#FEF2F2', border: 'rgba(224,82,82,0.25)'   },
  WATCHLIST: { color: '#D4A017', bg: '#FFFBEB', border: 'rgba(212,160,23,0.25)'  },
  INFO:      { color: '#4A90D9', bg: '#EFF6FF', border: 'rgba(74,144,217,0.25)'  },
};

export default function AlertsTab({ session, group }) {
  const [alerts, setAlerts]         = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState(null);
  const [filter, setFilter]         = useState('all');

  useEffect(() => {
    if (!group?.id) return;

    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadAlerts(), loadBroadcasts()]);
      setLoading(false);
    };

    const loadAlerts = async () => {
      const { data } = await supabase
        .from('breakout_alerts')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setAlerts(data);
    };

    const loadBroadcasts = async () => {
      const { data } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('group_id', group.id)
        .eq('is_mod_alert', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setBroadcasts(data);
    };

    loadAll();

    // Realtime — new breakout alerts appear instantly
    const channel = supabase
      .channel(`alerts_${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'breakout_alerts',
        filter: `group_id=eq.${group.id}`,
      }, (payload) => {
        setAlerts(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  const formatDate = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return isToday
      ? `Today · ${time}`
      : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
  };

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter(a => a.signal_type === filter);

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.scroll}>

      {/* ── BROADCAST HISTORY ── */}
      {broadcasts.length > 0 && (
        <>
          <div style={styles.secLabel}>Broadcast History</div>
          <div style={styles.bcList}>
            {broadcasts.map(bc => {
              const cfg = BC_COLORS[bc.type] || BC_COLORS.INFO;
              return (
                <div key={bc.id} style={{ ...styles.bcRow, borderColor: cfg.border, background: cfg.bg }}>
                  <div style={{ ...styles.bcDot, background: cfg.color }} />
                  <div style={styles.bcBody}>
                    <div style={styles.bcTitle}>{bc.title}</div>
                    <div style={styles.bcMeta}>
                      <span style={{ ...styles.bcType, color: cfg.color }}>{bc.type}</span>
                      <span style={styles.bcSep}>·</span>
                      <span>{bc.sent_by}</span>
                      <span style={styles.bcSep}>·</span>
                      <span>{formatDate(bc.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── BREAKOUT ALERTS ── */}
      <div style={styles.secLabel}>Breakout Alerts</div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        {['all', '52w_high', 'vol_surge', 'gap_up', 'ma_cross', 'vcp'].map(f => (
          <button
            key={f}
            style={{
              ...styles.filterBtn,
              background: filter === f ? 'var(--green-bg)' : 'var(--card)',
              color: filter === f ? 'var(--green)' : 'var(--text2)',
              borderColor: filter === f ? 'rgba(26,173,94,0.3)' : 'var(--border)',
              fontWeight: filter === f ? 600 : 400,
            }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : BADGE_CONFIG[f]?.label || f}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyIcon}>🔍</div>
          <div style={styles.emptyTitle}>No alerts yet</div>
          <div style={styles.emptyText}>
            The scanner is watching for breakout setups. Alerts appear here when parameters are met — not every day will have alerts.
          </div>
        </div>
      )}

      {filtered.map(alert => {
        const badge = BADGE_CONFIG[alert.signal_type] || BADGE_CONFIG['52w_high'];
        const isExpanded = expanded === alert.id;

        return (
          <div
            key={alert.id}
            style={styles.alertCard}
            onClick={() => setExpanded(isExpanded ? null : alert.id)}
          >
            <div style={styles.alertTop}>
              <div>
                <div style={styles.alertDate}>{formatDate(alert.created_at)}</div>
                <div style={styles.alertTicker}>{alert.ticker}</div>
                <div style={styles.alertDetail}>
                  ${alert.price?.toFixed(2)} · Vol {alert.rel_volume?.toFixed(1)}x avg · {alert.change_pct > 0 ? '+' : ''}{alert.change_pct?.toFixed(1)}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  ...styles.badge,
                  color: badge.color,
                  background: badge.bg,
                  borderColor: badge.border,
                }}>
                  {badge.label}
                </div>
                <div style={styles.expandHint}>
                  {isExpanded ? '▲' : '▼'}
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={styles.expandedBody}>
                <div style={styles.expandedRow}>
                  <span style={styles.expandedLabel}>Price</span>
                  <span style={styles.expandedValue}>${alert.price?.toFixed(2)}</span>
                </div>
                <div style={styles.expandedRow}>
                  <span style={styles.expandedLabel}>Change</span>
                  <span style={{
                    ...styles.expandedValue,
                    color: alert.change_pct >= 0 ? 'var(--green)' : 'var(--red)',
                  }}>
                    {alert.change_pct > 0 ? '+' : ''}{alert.change_pct?.toFixed(2)}%
                  </span>
                </div>
                <div style={styles.expandedRow}>
                  <span style={styles.expandedLabel}>Volume</span>
                  <span style={styles.expandedValue}>{alert.volume?.toLocaleString()}</span>
                </div>
                <div style={styles.expandedRow}>
                  <span style={styles.expandedLabel}>Rel Volume</span>
                  <span style={styles.expandedValue}>{alert.rel_volume?.toFixed(1)}x avg</span>
                </div>
                {alert.notes && (
                  <div style={styles.alertNotes}>{alert.notes}</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ height: 20 }} />
    </div>
  );
}

const styles = {
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '4px 12px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  loadingWrap: {
    flex: 1, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--navy)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)',
    padding: '0 4px', margin: '14px 0 8px',
  },
  // Broadcast history
  bcList: {
    display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4,
  },
  bcRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid',
  },
  bcDot: {
    width: 7, height: 7, borderRadius: '50%',
    flexShrink: 0, marginTop: 4,
  },
  bcBody: { flex: 1 },
  bcTitle: {
    fontSize: 13, color: 'var(--text1)',
    lineHeight: 1.4, marginBottom: 4,
  },
  bcMeta: {
    display: 'flex', gap: 4, alignItems: 'center',
    fontSize: 10, color: 'var(--text3)',
  },
  bcType: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' },
  bcSep:  { color: 'var(--border)' },
  // Filter bar
  filterBar: {
    display: 'flex', gap: 6,
    overflowX: 'auto', padding: '4px 0 8px',
    scrollbarWidth: 'none',
  },
  filterBtn: {
    flexShrink: 0, padding: '5px 12px',
    borderRadius: 20, fontSize: 11,
    border: '1px solid', cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'all .15s',
  },
  emptyWrap: {
    textAlign: 'center', padding: '40px 20px',
  },
  emptyIcon:  { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 },
  alertCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
    marginBottom: 8, cursor: 'pointer',
    transition: 'border-color .15s',
  },
  alertTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertDate:   { fontSize: 11, color: 'var(--text3)', marginBottom: 3 },
  alertTicker: { fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  alertDetail: { fontSize: 12, color: 'var(--text2)' },
  badge: {
    fontSize: 10, fontWeight: 600,
    padding: '4px 9px', borderRadius: 6,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', border: '1px solid',
    marginBottom: 4,
  },
  expandHint: { fontSize: 10, color: 'var(--text3)', textAlign: 'right' },
  expandedBody: {
    marginTop: 10, paddingTop: 10,
    borderTop: '1px solid var(--border)',
  },
  expandedRow: {
    display: 'flex', justifyContent: 'space-between',
    padding: '4px 0',
  },
  expandedLabel: { fontSize: 12, color: 'var(--text2)' },
  expandedValue: { fontSize: 12, fontWeight: 600, color: 'var(--text1)' },
  alertNotes: {
    fontSize: 13, color: 'var(--text2)',
    lineHeight: 1.6, marginTop: 8,
    padding: '8px 10px',
    background: 'var(--card2)',
    borderRadius: 6,
  },
};
