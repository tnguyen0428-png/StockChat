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

    // ── Briefing ──
    briefSection: { padding: '8px 14px 6px' },
    briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    briefTitle: { fontSize: 14, fontWeight: 700, color: t.text1, letterSpacing: '-0.01em' },
    briefTime: { fontSize: 11, color: t.text3 },
    briefToggle: { fontSize: 12, color: t.green, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
    briefCard: {
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
    },
    bfTickers: { fontSize: 11, fontWeight: 700, color: t.green, marginBottom: 2 },
    bfTitle: { fontSize: 13, color: t.text1, fontWeight: 500, lineHeight: 1.3 },
    bfLink: { color: t.green, fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
    briefEmpty: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, textAlign: 'center', fontSize: 13, color: t.text3 },

    // ── Stocks section (inline) ──
    stocksSection: { padding: '0 14px 6px' },
    stocksBtns: { display: 'flex', gap: 8, marginBottom: 8 },
    stocksBtn: {
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
      cursor: 'pointer', border: '1px solid rgba(26,173,94,0.4)', background: 'rgba(26,173,94,0.06)',
      color: t.green, fontFamily: "var(--font)",
    },
    stocksBtnActive: { background: '#1AAD5E', color: '#fff', borderColor: '#1AAD5E' },
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
