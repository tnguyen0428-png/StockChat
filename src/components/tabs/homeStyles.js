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
    barContent: { padding: '8px 0', minHeight: 34 },
    barScroll: { overflow: 'hidden', display: 'flex', alignItems: 'center' },
    pulseItem: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px' },
    pulseName: { fontSize: 13, fontWeight: 600, color: '#b8cde0', letterSpacing: 0.3 },
    pulsePrice: { fontSize: 13, fontWeight: 700 },
    pulseVal: { fontSize: 12, fontWeight: 600 },

    // ── Content (scrollable area) ──
    content: { flex: 1, overflowY: 'auto', paddingBottom: 8, background: t.bg, position: 'relative', zIndex: 1 },
    sectionDivider: { height: 1, background: t.border, margin: '0 14px' },

    fixedChatBar: {
      flexShrink: 0,
      padding: '12px 14px 14px', background: t.surface,
      display: 'flex', alignItems: 'center', gap: 10,
      position: 'relative', zIndex: 50,
      borderTop: `1px solid ${t.border}`,
      pointerEvents: 'auto',
      overflow: 'hidden', boxSizing: 'border-box', width: '100%',
    },

    // ── Watchlist / My List helpers ──
    wlPopRow: { display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' },
    wlPopLabel: { fontSize: 11, color: t.text2, marginRight: 2, alignSelf: 'center' },
    wlPopChip: {
      fontSize: 12, fontWeight: 600, color: t.green,
      background: 'rgba(94,237,138,0.1)', border: '1px solid rgba(26,173,94,0.2)',
      borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
    },

    // ── Briefing ──
    briefSection: { padding: '12px 14px 8px' },
    briefHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    briefTitle: { fontSize: 15, fontWeight: 700, color: t.text1, letterSpacing: '-0.01em' },
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
    stocksSection: { padding: '0 16px 8px' },
    stocksHeader: { marginBottom: 6 },
    stocksTitle: { fontSize: 15, fontWeight: 700, color: t.text1, fontFamily: "var(--font-heading)" },
    stocksBtns: { display: 'flex', gap: 8 },
    stocksBtn: {
      padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', border: '1px solid #8cd9a0', background: 'rgba(140,217,160,0.08)',
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
      display: 'flex', alignItems: 'center', padding: '7px 10px',
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

    // ── Chat section ──
    chatSection: { padding: '12px 14px 8px' },
    csHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    csTitle: { fontSize: 15, fontWeight: 700, color: t.text1, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 },
    csLive: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.green, fontWeight: 500 },
    csLiveDot: { width: 5, height: 5, borderRadius: '50%', background: '#1AAD5E', animation: 'pulse 1.5s ease-in-out infinite' },
    privateChatBtn: {
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 600, color: '#fff',
      background: '#1AAD5E', border: 'none', borderRadius: 14,
      padding: '5px 12px', cursor: 'pointer',
      fontFamily: 'inherit',
    },

    // ── My Groups section ──
    groupSection: { padding: '12px 14px 16px' },
    groupSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    groupSectionTitle: { fontSize: 15, fontWeight: 700, color: t.text1, letterSpacing: '-0.01em' },
    groupCreateBtn: {
      fontSize: 13, fontWeight: 600, color: t.green, background: 'none', border: 'none',
      cursor: 'pointer', padding: '4px 0',
    },
    myGroupsPills: { display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, justifyContent: 'center', flexWrap: 'wrap' },
    myGroupPill: {
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
      borderRadius: 12, border: `1px solid ${t.border}`, background: t.card, cursor: 'pointer',
    },
    myGroupName: { fontSize: 14, fontWeight: 600, color: t.text1 },
    groupCta: {
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      background: `linear-gradient(135deg, ${t.surface} 0%, ${t.card} 100%)`, borderRadius: 12,
      border: `1px solid ${t.border}`, cursor: 'pointer',
    },
    groupCtaIcon: {
      width: 40, height: 40, borderRadius: '50%', background: t.card,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      border: `1px solid ${t.border}`,
    },
    groupCtaText: { flex: 1 },
    groupCtaTitle: { fontSize: 15, fontWeight: 700, color: t.text1, marginBottom: 2 },
    groupCtaSub: { fontSize: 12, color: t.text2, lineHeight: 1.3 },

    chatCard: {
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
    },
    ccMsgs: { padding: 6, display: 'flex', flexDirection: 'column', gap: 6 },
    ccMsg: {
      padding: '10px 12px',
      background: 'rgba(139,92,246,0.08)',
      borderRadius: 10,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    },
    ccFooter: {
      padding: '8px 12px', background: t.surface,
      display: 'flex', alignItems: 'center', gap: 8,
      borderTop: `1px solid ${t.border}`,
    },
    ccAv: {
      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0,
    },
    ccTop: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 },
    ccName: { fontSize: 13, fontWeight: 600 },
    ccTime: { fontSize: 11, color: t.text3, marginLeft: 'auto' },
    ccText: { fontSize: 13, color: t.text1, lineHeight: 1.4 },
    ccTk: { color: t.green, fontWeight: 600 },
    ccAiBtn: {
      width: 36, height: 36, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
      transition: 'all 0.2s',
    },
    ccAiBtnOff: {
      background: t.surface, color: t.purple, border: `1px solid ${t.border}`,
    },
    ccAiBtnActive: {
      background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
      color: '#fff', boxShadow: '0 0 8px rgba(139,92,246,0.4)',
    },
    ccInputWrap: {
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
      background: t.card, border: `1.5px solid ${t.border}`,
      borderRadius: 20, height: 42, paddingRight: 4,
      boxSizing: 'border-box',
    },
    ccInput: {
      flex: 1, minWidth: 0, background: 'transparent', border: 'none',
      padding: '8px 0 8px 16px', fontSize: 15, color: t.text1,
      fontFamily: 'inherit', outline: 'none', height: '100%',
      boxSizing: 'border-box',
    },
    ccMic: {
      width: 32, height: 32, borderRadius: '50%', background: 'transparent',
      border: 'none', cursor: 'pointer', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
    },
    ccMicActive: {
      background: '#EF4444',
      boxShadow: '0 0 10px rgba(239,68,68,0.4)',
      animation: 'pulse 1.2s ease-in-out infinite',
    },
    ccSend: {
      width: 38, height: 38, borderRadius: '50%', background: '#1AAD5E',
      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    },

    // ── My List styles ──
    wlRemoveBtn: {
      minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', borderRadius: '50%',
      transition: 'opacity 0.15s', opacity: 0.7,
    },
    wlAddSection: {
      padding: '8px 12px',
      background: t.card, border: `1px solid ${t.border}`, borderTop: 'none',
      borderRadius: '0 0 12px 12px', marginTop: -1,
    },
    wlAddSearchBar: {
      display: 'flex', alignItems: 'center', gap: 8,
      background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12,
      padding: '8px 12px', cursor: 'text',
    },
    wlAddBtn: {
      flexShrink: 0, marginLeft: 'auto',
      fontSize: 12, fontWeight: 600, color: '#fff',
      background: '#1AAD5E', border: 'none',
      borderRadius: 14, padding: '5px 12px', cursor: 'pointer',
    },

    // ── Search overlay (light theme) ──
    searchOverlay: {
      padding: '10px 14px', background: t.card, border: `1px solid ${t.border}`,
      borderRadius: 12, margin: '8px 14px 0',
    },
    searchBarLight: {
      display: 'flex', alignItems: 'center', gap: 8,
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '7px 12px',
    },
    searchInputLight: {
      flex: 1, background: 'none', border: 'none', outline: 'none',
      fontFamily: 'inherit', fontSize: 13, color: t.text1,
    },
    searchResultsLight: {
      marginTop: 6, background: t.card,
      border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
    },
    searchItemLight: {
      padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${t.border}`, cursor: 'pointer',
    },
    siAddBtnLight: {
      fontSize: 12, fontWeight: 600, color: t.green, background: 'rgba(26,173,94,0.08)',
      border: '1px solid rgba(26,173,94,0.2)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer',
      fontFamily: 'inherit',
    },
  };
}
