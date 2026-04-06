// ============================================
// UPTIKALERTS — alertsTabStyles.js
// All style objects for AlertsTab
// ============================================

export const swipeStyles = {
  wrapper: { position: 'relative', overflowX: 'hidden', overflowY: 'visible', borderRadius: 12, marginBottom: 10 },
  actionLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    pointerEvents: 'none', zIndex: 0,
  },
  actionLeft: {
    background: '#16A34A', color: '#fff', fontWeight: 700, fontSize: 13,
    padding: '0 18px', height: '100%', display: 'flex', alignItems: 'center',
    borderRadius: '12px 0 0 12px',
  },
  actionRight: {
    background: '#9CA3AF', color: '#fff', fontWeight: 700, fontSize: 13,
    padding: '0 18px', height: '100%', display: 'flex', alignItems: 'center',
    marginLeft: 'auto', borderRadius: '0 12px 12px 0',
  },
  toast: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)', color: '#fff', fontWeight: 700,
    fontSize: 12, padding: '6px 16px', borderRadius: 20, zIndex: 10,
    pointerEvents: 'none', animation: 'fadeInOut 0.9s ease forwards',
  },
};

export const heatStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  tile: {
    borderRadius: 8, padding: '14px 10px', minHeight: 56,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  tileName: {
    fontSize: 10, fontWeight: 600, color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.9,
  },
  tilePerf: { fontSize: 14, fontWeight: 700, color: '#fff' },
};

export const ovStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'var(--bg)', zIndex: 10001,
    display: 'flex', flexDirection: 'column',
    maxWidth: 480, margin: '0 auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 16px 12px', flexShrink: 0,
    borderBottom: '1px solid var(--border)',
  },
  headerTicker: { fontSize: 22, fontWeight: 800, color: 'var(--text1)' },
  headerName: { fontSize: 13, color: 'var(--text3)', marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'var(--card)', border: '1px solid var(--border)',
    fontSize: 16, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text2)',
  },
  scrollBody: {
    flex: 1, overflowY: 'auto', padding: '16px 16px 120px',
    WebkitOverflowScrolling: 'touch',
  },
  priceSection: { marginBottom: 20 },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: 12 },
  priceBig: { fontSize: 32, fontWeight: 800, color: 'var(--text1)' },
  priceChange: { fontSize: 14, fontWeight: 700 },
  realtime: { fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  chartPlaceholder: {
    height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text3)', fontSize: 13, background: 'var(--card)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  rangePill: {
    flex: 1, padding: '6px 0', minHeight: 32,
    fontSize: 11, fontWeight: 600, borderRadius: 16,
    border: '1px solid', cursor: 'pointer', textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1, color: 'var(--text3)', marginBottom: 10,
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr',
    gap: 12, marginBottom: 20,
  },
  statCell: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
  },
  statLabel: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text3)', marginBottom: 6,
  },
  statValue: { fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 },
  statExplain: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, marginTop: 4 },
  rangeTrack: {
    flex: 1, height: 4, background: 'var(--border)',
    borderRadius: 2, position: 'relative',
  },
  rangeDot: {
    position: 'absolute', top: -4, width: 12, height: 12,
    borderRadius: '50%', background: 'var(--green)',
    border: '2px solid var(--card)', transform: 'translateX(-50%)',
  },
  whyCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '14px', marginBottom: 20,
  },
  whySignal: { fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 },
  whyRationale: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 },
  actionRow: {
    display: 'flex', gap: 10, marginBottom: 20,
  },
  actionBtnOutline: {
    flex: 1, padding: '12px 0', minHeight: 48,
    fontSize: 13, fontWeight: 700, borderRadius: 10,
    background: 'transparent', color: 'var(--green)',
    border: '2px solid var(--green)', cursor: 'pointer',
  },
  actionBtnSolid: {
    flex: 1, padding: '12px 0', minHeight: 48,
    fontSize: 13, fontWeight: 700, borderRadius: 10,
    background: 'var(--green)', color: '#fff',
    border: 'none', cursor: 'pointer',
  },
  toast: {
    position: 'absolute', bottom: 100, left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--text1)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 600,
    padding: '8px 20px', borderRadius: 20,
    zIndex: 10002,
  },
};

export const styles = {
  scroll: {
    flex: 1, overflowY: 'auto',
    padding: '4px 12px 100px',
    WebkitOverflowScrolling: 'touch',
    background: 'var(--bg)',
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
    color: 'var(--text3)', padding: '0 4px',
  },
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
  sortRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  sortLabel: { fontSize: 11, color: 'var(--text3)' },
  sortSelect: {
    fontSize: 11, color: 'var(--text2)',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
  },
  groupHeader: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '10px 4px 4px',
  },
  emptyWrap:  { textAlign: 'center', padding: '40px 20px' },
  emptyIcon:  { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 },
  alertCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderLeft: '4px solid var(--border)',
    borderRadius: 12, padding: '13px 14px 0',
    marginBottom: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    maxWidth: 430,
  },
  cardTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  cardTopLeft: { display: 'flex', flexDirection: 'column', gap: 1 },
  alertTicker: { fontSize: 17, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.2 },
  companyName: { fontSize: 12, color: 'var(--text3)', marginTop: 1 },
  priceBlock:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  priceText:   { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  changeText:  { fontSize: 12, fontWeight: 600, color: '#16A34A' },
  cardMiddle: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 7,
  },
  alertDate: { fontSize: 11, color: 'var(--text3)' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600,
    padding: '3px 9px', borderRadius: 20,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', border: '1px solid',
  },
  badgeDot: { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  signalText: {
    fontSize: 12, color: 'var(--text2)',
    lineHeight: 1.55, marginBottom: 16,
  },
  cardFooter: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--border)',
    padding: '7px 0', fontSize: 12,
  },
  footerCell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  footerLabel: {
    fontSize: 9, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  footerRight: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  chevron: {
    fontSize: 14, color: 'var(--text3)',
    display: 'inline-block', transition: 'transform 0.2s ease',
  },
  metricValue: { fontWeight: 700, fontSize: 12, color: 'var(--text1)' },
  expandPanel: {
    overflow: 'hidden', transition: 'max-height 0.22s ease',
    background: 'color-mix(in srgb, var(--card) 90%, var(--text3) 10%)',
    margin: '0 -14px', padding: '0 14px',
    borderTop: '1px solid var(--border)',
  },
  expandPanelInner: { padding: '12px 0 10px' },
  expandContext: {
    fontSize: 11, color: 'var(--text3)',
    lineHeight: 1.5, margin: '0 0 10px',
  },
  confRationale: {
    fontSize: 11, color: 'var(--text2)',
    lineHeight: 1.7,
    background: 'color-mix(in srgb, var(--card) 92%, var(--green) 8%)',
    borderRadius: 8, padding: '8px 12px', marginBottom: 10,
  },
  expandGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 10, marginBottom: 12,
  },
  expandItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  expandLabel: {
    fontSize: 10, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
  },
  expandValue: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  viewChartBtn: {
    width: '100%', padding: '8px 0',
    minHeight: 44,
    fontSize: 12, fontWeight: 600,
    color: 'var(--green)', background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.3)',
    borderRadius: 8, cursor: 'pointer',
  },
  scanToggleBtn: {
    fontSize: 11, fontWeight: 600,
    padding: '4px 10px', borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--text2)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  scanBtn: {
    fontSize: 11, fontWeight: 600,
    padding: '5px 12px', borderRadius: 20,
    border: '1px solid rgba(26,173,94,0.4)',
    background: 'var(--green-bg)', color: 'var(--green)',
    whiteSpace: 'nowrap', cursor: 'pointer',
  },
  scanBtnBlue:   { border: '1px solid rgba(74,144,217,0.4)',  background: 'var(--blue-bg)', color: 'var(--blue)' },
  scanBtnGold:   { border: '1px solid rgba(212,160,23,0.4)',  background: '#FFFBEB', color: '#D4A017' },
  scanBtnPurple: { border: '1px solid rgba(139,92,246,0.4)',  background: '#F5F3FF', color: '#8B5CF6' },
  scanStatus: { fontSize: 12, textAlign: 'center', padding: '6px 12px 2px' },
  aotdLabel: {
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1,
    color: '#D97706', padding: '0 4px 5px',
  },
  subTabBar: {
    display: 'flex', gap: 8, padding: '0 0 10px',
  },
  subTabBtn: {
    flex: 1, padding: '10px 0', minHeight: 44,
    borderRadius: 24, fontSize: 13, fontWeight: 600,
    border: '1px solid', cursor: 'pointer',
    textAlign: 'center', transition: 'all .15s',
  },
  statRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  statBox: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  statBoxLabel: {
    fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text3)',
  },
  statBoxValue: {
    fontSize: 20, fontWeight: 700,
  },
  historyDots: {
    display: 'flex', gap: 6, padding: '4px 4px 8px',
    justifyContent: 'flex-start', alignItems: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  historyStatLine: {
    fontSize: 11, color: 'var(--text2)',
    padding: '0 4px 8px',
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', minHeight: 44,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12, marginBottom: 6,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  historyDatePill: {
    fontSize: 10, fontWeight: 600, color: 'var(--text3)',
    background: 'var(--border)', borderRadius: 6,
    padding: '3px 7px', flexShrink: 0, whiteSpace: 'nowrap',
  },
  historyMiddle: {
    flex: 1, display: 'flex', flexDirection: 'column',
    gap: 2, minWidth: 0,
  },
  historyTicker: {
    fontSize: 13, fontWeight: 700, color: 'var(--text1)',
  },
  historySignal: {
    fontSize: 11, color: 'var(--text2)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  historyPriceJourney: {
    fontSize: 10, color: 'var(--text3)',
  },
  historyBadge: {
    fontSize: 11, fontWeight: 700, flexShrink: 0,
    padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
  },
  bestWorstRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  bestWorstCard: {
    flex: 1, borderLeft: '4px solid',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '8px 10px',
    display: 'flex', flexDirection: 'column', gap: 2,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  bestWorstLabel: {
    fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text3)',
  },
  bestWorstText: {
    fontSize: 11, color: 'var(--text1)',
  },
  pastPerf: {
    fontSize: 11, color: 'var(--text2)',
    padding: '8px 0', marginBottom: 4,
    borderTop: '1px solid var(--border)',
  },
  pastPerfLabel: {
    color: 'var(--text3)', fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  darkModeBtn: {
    width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, background: 'var(--card)',
    border: '1px solid var(--border)', borderRadius: '50%',
    cursor: 'pointer', padding: 0, lineHeight: 1,
  },
};
