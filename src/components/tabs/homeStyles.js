// ============================================
// UPTIKALERTS — homeStyles.js
// Style objects for HomeTab (theme-dependent)
// ============================================

// ── Main HomeTab styles ──
export function getHomeStyles(t) {
  return {
    outerWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },

    // ── Toast ──
    toast: {
      position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
      background: '#1AAD5E', color: '#fff', fontSize: 13, fontWeight: 600,
      padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 12px rgba(26,173,94,0.3)',
      display: 'flex', alignItems: 'center', gap: 6, zIndex: 10000,
    },

    // ── Market Ticker Bar ──
    combinedBar: { background: '#1a3a5e', flexShrink: 0 },
    barContent: { padding: '6px 0', minHeight: 34 },
    barScroll: { overflow: 'hidden', display: 'flex', alignItems: 'center' },
    pulseItem: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px' },
    pulseName: { fontSize: 13, fontWeight: 600, color: '#b8cde0', letterSpacing: 0.3 },
    pulsePrice: { fontSize: 13, fontWeight: 700 },
    pulseVal: { fontSize: 12, fontWeight: 600 },

    // ── Content (scrollable area) ──
    content: { flex: 1, overflowY: 'auto', paddingBottom: 8, background: t.bg, position: 'relative', zIndex: 1 },
    sectionDivider: { height: 1, background: t.border, margin: '0 14px' },

    // ── Briefing (editorial / morning-paper layout) ──
    briefSection: {
      margin: '10px 14px 8px',
      padding: 14,
      background: `linear-gradient(135deg, ${t.card} 0%, ${t.surface} 100%)`,
      border: `1px solid ${t.border}`,
      borderLeft: '3px solid #132d52',
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(19,45,82,0.04)',
      position: 'relative',
      overflow: 'hidden',
    },
    briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    briefKicker: {
      fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 500,
      color: t.text1, letterSpacing: '-0.02em', lineHeight: 1.15,
    },
    briefMeta: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
    briefTime: { fontSize: 11, color: t.text3 },
    moodPill: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 20,
    },
    moodDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    briefArticlesHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
    briefArticlesLabel: {
      fontSize: 9, fontWeight: 700, color: t.text3,
      textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0,
    },
    briefArticlesRule: { flex: 1, height: 1, background: `linear-gradient(90deg, ${t.border}, transparent)` },
    briefArticlesCount: { fontSize: 9, fontWeight: 700, color: t.text3, flexShrink: 0 },
    briefRow: {
      display: 'flex', alignItems: 'flex-start', gap: 0,
      padding: '12px 0 12px 12px',
      textDecoration: 'none', color: 'inherit',
      position: 'relative',
      borderBottom: 'none',
    },
    briefRowNum: { display: 'none' },
    briefRowBody: { flex: 1, minWidth: 0 },
    briefRowTickers: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 3 },
    briefTicker: {
      fontSize: 9, fontWeight: 700, color: '#132d52',
      background: 'linear-gradient(135deg, rgba(19,45,82,0.08), rgba(19,45,82,0.12))',
      borderRadius: 3,
      padding: '1px 5px', letterSpacing: 0.5,
    },
    briefRowTitle: { fontSize: 13, color: t.text1, fontWeight: 500, lineHeight: 1.35 },
    briefRowPublisher: { fontSize: 10, color: t.text3, marginTop: 2 },
    briefExpand: {
      marginTop: 10, fontSize: 10, fontWeight: 700, color: '#132d52',
      textTransform: 'uppercase', letterSpacing: 0.8,
      background: 'rgba(19,45,82,0.06)',
      border: '1px solid rgba(19,45,82,0.15)',
      borderRadius: 7,
      cursor: 'pointer',
      fontFamily: 'inherit',
      padding: '7px 12px',
      display: 'flex', alignItems: 'center', gap: 4,
    },
    briefEmpty: {
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '20px 16px', textAlign: 'center',
    },

    // ── Stocks section (inline) ──
    stocksSection: { padding: '0 14px 6px' },
    stocksHeader: { marginBottom: 6 },
    stocksTitle: { fontSize: 14, fontWeight: 700, color: t.text1, fontFamily: "var(--font-heading)" },
    stocksBtns: { display: 'flex', gap: 8, marginBottom: 8 },
    stocksBtn: {
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
      cursor: 'pointer',
      border: '1px solid rgba(19,45,82,0.4)',
      background: 'rgba(19,45,82,0.06)',
      color: '#132d52',
      fontFamily: "var(--font)",
    },
    stocksBtnActive: {
      background: '#132d52',
      color: '#fff',
      borderColor: '#132d52',
      boxShadow: '0 2px 8px rgba(19,45,82,0.25)',
    },
    sectorDropdown: {
      position: 'absolute', left: 0, top: '100%', marginTop: 4,
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden',
      zIndex: 100, minWidth: 140,
    },
    sectorDropItem: {
      padding: '10px 16px', fontSize: 13, color: t.text1, cursor: 'pointer',
      borderBottom: `1px solid ${t.border}`, fontFamily: "var(--font)",
    },
    stocksCard: {
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
      overflow: 'hidden', marginTop: 8,
      boxShadow: '0 1px 3px rgba(19,45,82,0.04)',
    },
    stocksHeaderRow: {
      display: 'flex', alignItems: 'center', padding: '6px 10px',
      borderBottom: `1px solid ${t.border}`, background: t.surface,
    },
    stocksColLabel: {
      fontSize: 9, fontWeight: 600, color: t.text3,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    stocksScroll: { maxHeight: 200, overflowY: 'auto' },
    stocksRow: {
      display: 'flex', alignItems: 'center', padding: '5px 10px',
      borderBottom: `1px solid ${t.border}`, cursor: 'pointer',
    },
    stocksRowTk: { fontSize: 13, fontWeight: 600, color: t.text1 },
    stocksExpand: {
      padding: '8px 10px 8px 38px', background: t.surface,
      borderBottom: `1px solid ${t.border}`,
    },
    stocksAddBar: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      borderTop: `1px solid ${t.border}`, background: t.surface,
      borderRadius: '0 0 10px 10px',
    },
    stocksAddInput: {
      flex: 1, border: 'none', outline: 'none', fontSize: 13,
      color: t.text1, background: 'transparent', fontFamily: "var(--font)",
    },
  };
}
