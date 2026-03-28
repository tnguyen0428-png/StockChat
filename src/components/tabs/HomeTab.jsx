// ============================================
// UPTIKALERTS — HomeTab.jsx
// Home screen — briefing, news, recent alerts
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import MarketIndicators from './MarketIndicators';

export default function HomeTab({ session, profile, group, isAdmin }) {
  const [briefing, setBriefing]     = useState(null);
  const [news, setNews]             = useState([]);
  const [modPick, setModPick]       = useState(null);
  const [alerts, setAlerts]         = useState([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!group?.id) return;
    loadAll();
  }, [group?.id]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      loadBriefing(),
      loadAlerts(),
      loadNews(),
    ]);
    setLoading(false);
  };

  const loadBriefing = async () => {
    const { data } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setBriefing(data);
  };

  const loadAlerts = async () => {
    const { data } = await supabase
      .from('breakout_alerts')
      .select('*')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setAlerts(data);
  };

  const loadNews = async () => {
    try {
      const apiKey = import.meta.env.VITE_POLYGON_API_KEY;
      const res = await fetch(
        `https://api.polygon.io/v2/reference/news?limit=4&apiKey=${apiKey}`
      );
      const data = await res.json();
      if (data.results) setNews(data.results.slice(0, 4));
    } catch {}

    // Load moderator pick
    const { data } = await supabase
      .from('mod_news_picks')
      .select('*')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setModPick(data);
  };

  const moodConfig = {
    'risk-on':  { label: '● Risk On',  color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(26,173,94,0.2)'  },
    'risk-off': { label: '● Risk Off', color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'rgba(224,82,82,0.2)'  },
    'neutral':  { label: '● Neutral',  color: '#D4A017',      bg: '#FFFBEB',         border: 'rgba(212,160,23,0.2)' },
  };

  const badgeColors = {
    '52w_high':   { color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(26,173,94,0.3)',  label: '52W High'   },
    'vol_surge':  { color: 'var(--blue)',  bg: 'var(--blue-bg)',  border: 'rgba(74,144,217,0.3)', label: 'Vol Surge'  },
    'gap_up':     { color: '#D4A017',      bg: '#FFFBEB',         border: 'rgba(212,160,23,0.3)', label: 'Gap Up'     },
    'ma_cross':   { color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(26,173,94,0.3)',  label: 'MA Cross'   },
    'vcp':        { color: '#8B5CF6',      bg: '#F5F3FF',         border: 'rgba(139,92,246,0.3)', label: 'VCP'        },
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.scroll}>

      {/* MARKET INDICATORS */}
      <MarketIndicators isAdmin={isAdmin} />

      {/* DAILY BRIEFING */}
      <div style={styles.secLabel}>Daily Briefing</div>

      {briefing ? (
        <div style={{
          ...styles.briefingCard,
          borderLeftColor: moodConfig[briefing.mood]?.color || 'var(--green)',
        }}>
          <div style={styles.briefingTop}>
            <span style={styles.briefingLbl}>📋 Morning Note</span>
            <span style={styles.briefingDate}>{formatDate(briefing.created_at)}</span>
          </div>
          {briefing.mood && (
            <div style={{
              ...styles.moodPill,
              color: moodConfig[briefing.mood].color,
              background: moodConfig[briefing.mood].bg,
              borderColor: moodConfig[briefing.mood].border,
            }}>
              {moodConfig[briefing.mood].label}
            </div>
          )}
          <div style={styles.briefingText}>{briefing.content}</div>
          {briefing.tags?.length > 0 && (
            <div style={styles.tagRow}>
              {briefing.tags.map((tag, i) => (
                <span key={i} style={{
                  ...styles.tag,
                  color: tag.type === 'g' ? 'var(--green)' : tag.type === 'r' ? 'var(--red)' : 'var(--text2)',
                  background: tag.type === 'g' ? 'var(--green-bg)' : tag.type === 'r' ? 'var(--red-bg)' : 'var(--card2)',
                  borderColor: tag.type === 'g' ? 'rgba(26,173,94,0.3)' : tag.type === 'r' ? 'rgba(224,82,82,0.3)' : 'var(--border)',
                }}>
                  {tag.text}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No briefing posted yet today</span>
        </div>
      )}

      {/* MARKET NEWS */}
      <div style={styles.secLabel}>Market News</div>
      <div style={styles.newsCard}>

        {/* Headlines */}
        {news.map((item, i) => (
          <div key={i} style={{
            ...styles.headline,
            borderBottom: i < news.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={styles.headlineDot} />
            <div style={styles.headlineBody}>
              <div style={styles.headlineSource}>
                {item.publisher?.name || 'News'}
              </div>
              <div style={styles.headlineText}>{item.title}</div>
              <div style={styles.headlineTime}>
                {new Date(item.published_utc).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        ))}

        {news.length === 0 && (
          <div style={styles.emptyText}>Loading news...</div>
        )}

        {/* Moderator Pick */}
        {modPick && (
          <div style={styles.modPick} onClick={() => window.open(modPick.url, '_blank')}>
            <span style={styles.modIcon}>📌</span>
            <div>
              <div style={styles.modLabel}>Moderator Pick</div>
              <div style={styles.modTitle}>{modPick.title}</div>
              {modPick.note && <div style={styles.modNote}>{modPick.note}</div>}
              <div style={styles.modLink}>→ Read article</div>
            </div>
          </div>
        )}

      </div>

      {/* RECENT ALERTS */}
      <div style={styles.secLabel}>Recent Alerts</div>

      {alerts.length === 0 && (
        <div style={styles.emptyCard}>
          <span style={styles.emptyText}>No alerts yet — scanner is watching</span>
        </div>
      )}

      {alerts.map(alert => {
        const badge = badgeColors[alert.signal_type] || badgeColors['52w_high'];
        return (
          <div key={alert.id} style={styles.alertCard}>
            <div>
              <div style={styles.alertDate}>{formatDate(alert.created_at)}</div>
              <div style={styles.alertTicker}>{alert.ticker}</div>
              <div style={styles.alertDetail}>
                ${alert.price?.toFixed(2)} · Vol {alert.rel_volume?.toFixed(1)}x avg · {alert.change_pct > 0 ? '+' : ''}{alert.change_pct?.toFixed(1)}%
              </div>
            </div>
            <div style={{
              ...styles.badge,
              color: badge.color,
              background: badge.bg,
              borderColor: badge.border,
            }}>
              {badge.label}
            </div>
          </div>
        );
      })}

      <div style={{ height: 20 }} />
    </div>
  );
}

const styles = {
  scroll: {
    flex: 1,
    overflowY: 'auto',
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
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)',
    padding: '0 4px', margin: '14px 0 8px',
  },
  briefingCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  briefingTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  briefingLbl: {
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--green)',
  },
  briefingDate: { fontSize: 10, color: 'var(--text3)' },
  moodPill: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 600,
    padding: '3px 9px', borderRadius: 20,
    marginBottom: 8, border: '1px solid',
  },
  briefingText: {
    fontSize: 14, color: 'var(--text1)',
    lineHeight: 1.7, marginBottom: 10,
  },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tag: {
    fontSize: 11, fontWeight: 600,
    padding: '3px 8px', borderRadius: 5,
    border: '1px solid',
  },
  newsCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  headline: {
    display: 'flex', gap: 8,
    padding: '8px 0', alignItems: 'flex-start',
  },
  headlineDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: 'var(--border)', flexShrink: 0, marginTop: 6,
  },
  headlineBody: { flex: 1 },
  headlineSource: {
    fontSize: 10, fontWeight: 600,
    color: 'var(--text3)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 2,
  },
  headlineText: { fontSize: 13, color: 'var(--text1)', lineHeight: 1.4 },
  headlineTime: { fontSize: 10, color: 'var(--text3)', marginTop: 2 },
  modPick: {
    background: '#FFFBEB',
    border: '1px solid rgba(212,160,23,0.2)',
    borderRadius: 8, padding: '10px 12px',
    marginTop: 10, display: 'flex', gap: 8,
    cursor: 'pointer',
  },
  modIcon: { fontSize: 14, flexShrink: 0 },
  modLabel: {
    fontSize: 10, fontWeight: 700,
    color: '#D4A017', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 2,
  },
  modTitle: { fontSize: 13, color: 'var(--text1)', lineHeight: 1.4, marginBottom: 3 },
  modNote:  { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  modLink:  { fontSize: 11, color: 'var(--blue)', marginTop: 3 },
  alertCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
    marginBottom: 8, display: 'flex',
    justifyContent: 'space-between', alignItems: 'center',
  },
  alertDate:   { fontSize: 11, color: 'var(--text3)', marginBottom: 3 },
  alertTicker: { fontSize: 16, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  alertDetail: { fontSize: 12, color: 'var(--text2)' },
  badge: {
    fontSize: 10, fontWeight: 600,
    padding: '4px 9px', borderRadius: 6,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', border: '1px solid',
  },
  emptyCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: 20,
    textAlign: 'center', marginBottom: 8,
  },
  emptyText: { fontSize: 13, color: 'var(--text3)' },
};
