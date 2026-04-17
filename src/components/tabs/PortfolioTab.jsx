// ============================================
// UPTIKALERTS — PortfolioTab.jsx
// Portfolio Challenge: Split-panel layout
// Left: portfolio + buy | Right: game cards
// ============================================

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from './alertsCasinoComponents';
import SellModal from '../portfolio/SellModal';

import { SEASON_START, SEASON_END } from '../../lib/constants';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useLeaderboard, BADGE_DEFS, getTier } from '../../hooks/useLeaderboard';
import { useSmackTalk, REACTIONS } from '../../hooks/useSmackTalk';
import { getPortfolioStyles } from './portfolioStyles';

export default function PortfolioTab({ session, darkMode, keyboardOpen = false, activeTab }) {
  const [showPortfolio, setShowPortfolio]     = useState(false);
  const [showAllRankings, setShowAllRankings] = useState(false);

  // Ref on the outer scroll container so we can pin scrollTop across the
  // re-render storm that happens when smack talk is sent (supabase insert →
  // realtime INSERT → loadTrashTalk → setTrashTalkMsgs). Without this, the
  // page visibly snaps back to the top mid-send on mobile.
  const scrollRef = useRef(null);

  // Ref on the smack talk input so we can pull it flush to the bottom of
  // the scroll container when it gets focus. Default iOS auto-scroll parks
  // the input mid-viewport, leaving a huge empty gap above the keyboard.
  const smackInputRef = useRef(null);

  // Ref on the smack talk messages scroll container so we can snap it to
  // the bottom (newest message) when the Challenge tab becomes active and
  // when new smack arrives — iMessage/WhatsApp default.
  const smackMsgsRef = useRef(null);

  // ── Hooks ──
  const portfolio = usePortfolio(session);
  const lb        = useLeaderboard(session, portfolio.trades, portfolio.prices);
  const smack     = useSmackTalk(session);

  const {
    trades, prices, loadingData, sellTrade, setSellTrade,
    closedTrades, showHistory, setShowHistory,
    searchQuery, setSearchQuery, searchResults, searching,
    selectedTicker, showPresets, customAmount, setCustomAmount,
    showCustom, setShowCustom, buyError, buying,
    handleSelectTicker, executeBuy, clearSelection, onSellComplete,
    totalPositionsValue, cashBalance, totalValue, totalReturn, isPositive, marketOpen,
  } = portfolio;

  const {
    leaderboard, expandedUser, setExpandedUser,
    lbLoading, myRank, aheadUser, activity,
    userBadges,
    loadLeaderboard, loadActivity,
  } = lb;

  const {
    trashTalkMsgs, trashTalkInput, setTrashTalkInput,
    chatReactions, sendTrashTalk, toggleReaction,
  } = smack;

  // ── Auto-scroll Smack Talk to the newest message ──
  // iMessage / WhatsApp behavior:
  //   1. When the Challenge tab becomes active, the smack list shows the
  //      latest message with zero extra taps.
  //   2. When a new message arrives, it pulls into view — unless the user
  //      has scrolled up to read history, in which case we leave them.
  //
  // We intentionally DO NOT attach a scroll listener to smackMsgs.
  // Reading scrollHeight/clientHeight on every scroll event on mobile can
  // cause layout recalc jank and make the outer page feel shaky. Instead,
  // we snapshot the PRIOR scrollHeight in a ref and compare it to the
  // current scrollTop+clientHeight the next time a message arrives — that
  // tells us whether the user was at the bottom BEFORE the new message
  // extended the content, with zero per-frame work during scrolling.
  const prevSmackScrollHeightRef = useRef(0);
  // Tab activation: always snap to bottom on entry (fresh look at latest).
  useEffect(() => {
    if (activeTab !== 'challenge') return;
    requestAnimationFrame(() => {
      const el = smackMsgsRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      prevSmackScrollHeightRef.current = el.scrollHeight;
    });
  }, [activeTab]);
  // New messages (including initial load): pull down only if the user
  // was at/near the bottom BEFORE the new content landed.
  useEffect(() => {
    const el = smackMsgsRef.current;
    if (!el) return;
    const prevHeight = prevSmackScrollHeightRef.current;
    const wasNearBottom = prevHeight === 0 || (prevHeight - el.scrollTop - el.clientHeight) < 40;
    prevSmackScrollHeightRef.current = el.scrollHeight;
    if (!wasNearBottom) return;
    requestAnimationFrame(() => {
      if (smackMsgsRef.current) smackMsgsRef.current.scrollTop = smackMsgsRef.current.scrollHeight;
    });
  }, [trashTalkMsgs.length]);

  // ── handleSellComplete: portfolio side + leaderboard/activity refresh ──
  const handleSellComplete = () => {
    onSellComplete();
    loadLeaderboard();
    loadActivity();
  };

  // ── Pull the smack input flush to the bottom of the viewport on focus ──
  // iOS (and some Android browsers) auto-scroll a focused input into view by
  // centering it vertically. That leaves a visible gap between the input
  // and the keyboard — wasted real estate and extra friction. Wait for the
  // keyboard animation to settle, then explicitly scroll the outer scroll
  // container so the input bottom sits 8px above the viewport bottom.
  const pinSmackInputToBottom = () => {
    const scrollEl = scrollRef.current;
    const inputEl  = smackInputRef.current;
    if (!scrollEl || !inputEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();
    const inputRect  = inputEl.getBoundingClientRect();
    const delta = inputRect.bottom - (scrollRect.bottom - 8);
    if (delta > 0) scrollEl.scrollTop = scrollEl.scrollTop + delta;
  };

  const handleSmackFocus = () => {
    // Two passes: once right after tap (if keyboard is already up from a
    // previous send), once after the 350ms iOS keyboard animation.
    requestAnimationFrame(pinSmackInputToBottom);
    setTimeout(pinSmackInputToBottom, 350);
  };

  // ── Send smack talk while pinning scroll position ──
  // The page was snapping to the top after every send on mobile. Root cause:
  // the realtime INSERT → loadTrashTalk → setTrashTalkMsgs re-render combined
  // with the input clear was resetting scrollTop on the outer scroll
  // container. Snapshot scrollTop before the send, then restore it after
  // React has reconciled (rAF) and once more after the keyboard/viewport
  // has had time to settle (350ms).
  const handleSendSmack = () => {
    const el = scrollRef.current;
    const saved = el ? el.scrollTop : 0;
    const pin = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = saved;
    };
    // Force the inner smackMsgs list to treat the user as "at the bottom"
    // so the realtime round-trip of their own message pulls into view,
    // even if they had scrolled up earlier in the session. We do this by
    // zeroing prevSmackScrollHeightRef: the length-change effect treats 0
    // as the "first load / always scroll" signal.
    prevSmackScrollHeightRef.current = 0;
    sendTrashTalk();
    requestAnimationFrame(pin);
    setTimeout(pin, 120);
    setTimeout(pin, 350);
  };

  // ── Theme setup ──
  const _t = useTheme(darkMode);
  // Extend with portfolio-specific overrides + medal colors
  const t = {
    ..._t,
    // Portfolio uses a brighter green than the shared theme
    green: darkMode ? '#5eed8a' : '#16a34a',
    greenBg: darkMode ? 'rgba(94,237,138,0.1)' : 'rgba(22,163,74,0.08)',
    medalGold:   'linear-gradient(135deg,#FFD700,#e6a800)',
    medalSilver: 'linear-gradient(135deg,#C0C0C0,#909090)',
    medalBronze: 'linear-gradient(135deg,#CD7F32,#a0622d)',
    pctGold:   darkMode ? '#FFD700' : '#b8860b',
    pctSilver: darkMode ? '#C0C0C0' : '#6b7280',
    pctBronze: darkMode ? '#8cd9a0' : '#16a34a',
  };

  const s = getPortfolioStyles(t);

  // ── Season dates ──
  const daysLeft       = Math.max(0, Math.ceil((SEASON_END - new Date()) / 86400000));
  const seasonProgress = Math.min(100, Math.max(0, ((new Date() - SEASON_START) / (SEASON_END - SEASON_START)) * 100));

  // ── Ticker tape text — others only (memoized) ──
  const myUid    = session?.user?.id;
  const tapeText = useMemo(() => {
    const others = activity.filter(a => a.user_id !== myUid);
    if (others.length === 0) return 'Waiting for group activity…';
    return others.map(a => {
      const who  = a.profiles?.username || 'Someone';
      const verb = a.status === 'closed' ? 'sold' : 'bought';
      const amt  = a.dollar_amount ? ` $${(Number(a.dollar_amount) / 1000).toFixed(0)}k` : '';
      return `${who} ${verb} ${a.ticker}${amt}`;
    }).join(' · ');
  }, [activity, myUid]);

  // ── Helpers ──
  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const sectorColor = (avg) => {
    if (avg > 1)  return { bg: '#EAF3DE', color: '#27500A' };
    if (avg > 0)  return { bg: '#E1F5EE', color: '#085041' };
    if (avg > -1) return { bg: '#FAEEDA', color: '#633806' };
    return { bg: '#FCEBEB', color: '#791F1F' };
  };

  // ── Loading ──
  if (loadingData) {
    return (
      <div style={s.scroll}>
        <div style={{ padding: 20 }}>
          {[1, 2, 3].map(i => <div key={i} style={s.skeleton} />)}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={s.scroll}>
      {/* 80px bottom padding clears the BottomNav. When the keyboard is
           open the BottomNav is unmounted (DashboardPage), so that reserve
           becomes dead white space below the smack input — drop it to 8px
           so the input can sit flush with the keyboard. */}
      <div style={{ padding: keyboardOpen ? '8px 12px 8px' : '8px 12px 80px' }}>

        {/* HEADER ROW */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🏆</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text1 }}>Paper Trading</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: t.green, background: t.greenBg, padding: '2px 6px', borderRadius: 4 }}>S1</span>
            </div>
            <div style={{ fontSize: 10, color: t.text2, marginTop: 2, marginLeft: 24 }}>Practice trading with virtual money — no real money involved</div>
          </div>
        </div>

        {/* Info banner */}
        <div style={{ background: t.greenBg || 'rgba(90,238,138,0.08)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 14 }}>💡</span>
          <span style={{ fontSize: 11, color: t.text2, lineHeight: 1.4 }}>This is a <b style={{ color: t.text1 }}>paper trading simulator</b>. You start with $50K virtual cash to practice buying and selling stocks. No real money is used.</span>
        </div>

        {/* TOP BAR */}
        {trades.length === 0 ? (
          <div style={s.barNew}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
            <div style={s.barNewText}>
              <div style={s.barNewTitle}>Practice Trading</div>
              <div style={s.barNewSub}><b style={{ color: t.green }}>$50K virtual cash</b> · learn risk-free with your group</div>
            </div>
            <div style={s.barNewBtn} onClick={() => setShowPortfolio(true)}>Join →</div>
          </div>
        ) : (
          <div style={s.barActive}>
            <div style={s.barRank}><span style={s.barRankText}>#{myRank || '-'}</span></div>
            <div style={s.barStats}>
              <div style={s.barStatsTop}>
                <span style={{ fontSize: 16, fontWeight: 700, color: isPositive ? t.green : t.red }}>{isPositive ? '+' : ''}{totalReturn.toFixed(1)}%</span>
                {userBadges.length > 0 && <span style={{ display: 'flex', gap: 2 }}>{userBadges.slice(0, 3).map(key => { const def = BADGE_DEFS[key]; return def ? <span key={key} style={{ fontSize: 12 }} title={def.label}>{def.emoji}</span> : null; })}</span>}
              </div>
              <div style={s.barStatsBottom}>
                {aheadUser ? <span>🎯 {aheadUser.gap}% behind {aheadUser.username}</span> : myRank !== null ? <span style={{ color: t.green }}>👑 In the lead!</span> : null}
                <span style={{ color: t.green, fontWeight: 600 }}>Cash ${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div style={{ ...s.barPortBtn, ...(showPortfolio ? s.barPortBtnOpen : {}) }} onClick={() => setShowPortfolio(p => !p)}>Portfolio {showPortfolio ? '▲' : '▼'}</div>
          </div>
        )}

        {/* MARKET CLOSED BANNER */}
        {!marketOpen && (
          <div style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 11, color: '#D4A017', textAlign: 'center' }}>
            Market closed — trades execute during market hours (9:30am-4pm EST)
          </div>
        )}

        {/* PORTFOLIO DROPDOWN */}
        {showPortfolio && (
          <div style={s.portDrop}>
            <div style={s.portCash}>
              <div style={s.portCashItem}><div style={s.portCashLabel}>Total</div><div style={{ ...s.portCashVal, color: t.green }}>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
              <div style={{ ...s.portCashItem, borderLeft: `1px solid ${t.border}` }}><div style={s.portCashLabel}>Cash</div><div style={s.portCashVal}>${cashBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
              <div style={{ ...s.portCashItem, borderLeft: `1px solid ${t.border}` }}><div style={s.portCashLabel}>Invested</div><div style={s.portCashVal}>${totalPositionsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
            </div>
            <div style={s.portSecLabel}>Positions · {trades.length}</div>
            {trades.length === 0 ? (
              <div style={{ fontSize: 11, color: t.text3, padding: '8px 12px' }}>You haven't made any trades yet. Search for a stock below and tap Buy to start practicing!</div>
            ) : trades.map(trade => {
              const curPrice  = prices[trade.ticker] || Number(trade.entry_price);
              const entryPrice = Number(trade.entry_price);
              const pctGain   = ((curPrice - entryPrice) / entryPrice) * 100;
              const isUp      = pctGain >= 0;
              return (
                <div key={trade.id} style={s.portPos}>
                  <span style={s.portPosTk}>{trade.ticker}</span>
                  <span style={s.portPosInfo}>{Number(trade.shares).toFixed(1)} · avg ${entryPrice.toFixed(2)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? t.green : t.red, minWidth: 45, textAlign: 'right', marginRight: 6 }}>{isUp ? '+' : ''}{pctGain.toFixed(1)}%</span>
                  <div onClick={(e) => { e.stopPropagation(); setSellTrade({ ...trade, currentPrice: curPrice }); }} style={s.portPosSell}>Sell</div>
                </div>
              );
            })}
            <div style={s.portBuyRow}>
              <input style={s.portBuyInput} value={searchQuery} onChange={e => setSearchQuery(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="ADD TICKER" maxLength={5} />
              <button style={s.portBuyBtn} onClick={() => { if (searchResults.length > 0) handleSelectTicker(searchResults[0]); }}>Buy</button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ borderTop: `1px solid ${t.border}` }}>
                {searchResults.map(r => (
                  <div key={r.symbol} style={s.portSearchRow} onClick={() => handleSelectTicker(r)}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{r.symbol}</span>
                    <span style={{ fontSize: 10, color: t.text3, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</span>
                  </div>
                ))}
              </div>
            )}
            {searching && <div style={{ fontSize: 10, color: t.text3, padding: '6px 12px' }}>Searching...</div>}
            {showPresets && selectedTicker && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${t.border}`, background: t.surface }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div><b style={{ fontSize: 12, color: t.green }}>{selectedTicker.symbol}</b> <span style={{ fontSize: 10, color: t.green }}>${selectedTicker.price.toFixed(2)}</span></div>
                  <button style={{ background: 'none', border: 'none', fontSize: 14, color: t.green, cursor: 'pointer' }} onClick={clearSelection}>×</button>
                </div>
                {!showCustom ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1000, 5000, 10000].map(amt => (<button key={amt} style={s.presetBtnSm} onClick={() => executeBuy(amt, () => Promise.all([loadLeaderboard(), loadActivity()]))}>{buying ? '..' : `$${amt / 1000}K`}</button>))}
                    <button style={s.otherBtnSm} onClick={() => setShowCustom(true)}>Other</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={s.customWrapSm}><span style={{ fontSize: 12, fontWeight: 600, color: t.green }}>$</span><input style={s.customInputSm} type="number" inputMode="decimal" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="Amt" autoFocus /></div>
                    <button style={{ ...s.customBuySm, opacity: (parseFloat(customAmount) > 0 && !buying) ? 1 : 0.4 }} onClick={() => executeBuy(parseFloat(customAmount) || 0, () => Promise.all([loadLeaderboard(), loadActivity()]))} disabled={!(parseFloat(customAmount) > 0) || buying}>{buying ? '..' : 'Buy'}</button>
                  </div>
                )}
                {buyError && <div style={{ fontSize: 10, color: t.red, marginTop: 3 }}>{buyError}</div>}
              </div>
            )}
            <div onClick={() => setShowHistory(!showHistory)} style={s.portHistToggle}>{showHistory ? 'Hide History ▲' : `Trade History (${closedTrades.length}) ▼`}</div>
            {showHistory && (
              <div style={{ padding: '0 12px 8px' }}>
                {closedTrades.length > 0 && (() => {
                  const wins     = closedTrades.filter(t => Number(t.exit_price) > Number(t.entry_price)).length;
                  const totalPL  = closedTrades.reduce((sum, t) => sum + (Number(t.exit_price) - Number(t.entry_price)) * Number(t.shares), 0);
                  const avgHold  = closedTrades.reduce((sum, t) => { if (!t.sold_at || !t.bought_at) return sum; return sum + (new Date(t.sold_at) - new Date(t.bought_at)) / 86400000; }, 0) / closedTrades.length;
                  const winRate  = Math.round((wins / closedTrades.length) * 100);
                  return (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Win rate</div><div style={{ fontSize: 14, fontWeight: 700, color: winRate >= 50 ? t.green : t.red }}>{winRate}%</div></div>
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Avg hold</div><div style={{ fontSize: 14, fontWeight: 700, color: t.text1 }}>{avgHold.toFixed(1)}d</div></div>
                      <div style={{ flex: 1, background: t.surface, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.text3 }}>Total P&L</div><div style={{ fontSize: 14, fontWeight: 700, color: totalPL >= 0 ? t.green : t.red }}>{totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toFixed(0)}</div></div>
                    </div>
                  );
                })()}
                {closedTrades.map(trade => {
                  const entry = Number(trade.entry_price); const exit = Number(trade.exit_price);
                  const pl = (exit - entry) * Number(trade.shares); const pctReturn = ((exit - entry) / entry) * 100; const isWin = pl >= 0;
                  const holdMs = trade.sold_at && trade.bought_at ? new Date(trade.sold_at) - new Date(trade.bought_at) : 0;
                  const holdHours = holdMs / 3600000; const holdDisplay = holdHours < 24 ? `${Math.round(holdHours)}h` : `${Math.round(holdHours / 24)}d`;
                  const buyDate = trade.bought_at ? new Date(trade.bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (<div key={trade.id} style={{ padding: '6px 0', borderBottom: `1px solid ${t.border}` }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: t.text1 }}>{trade.ticker}</span><span style={{ fontSize: 10, color: t.text3 }}>{buyDate} · {holdDisplay}</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: isWin ? t.green : t.red }}>{isWin ? '+' : ''}{pctReturn.toFixed(1)}%</span></div></div>);
                })}
                {closedTrades.length === 0 && <div style={{ fontSize: 11, color: t.text3, textAlign: 'center', padding: '8px 0' }}>No closed trades yet</div>}
              </div>
            )}
          </div>
        )}

        {/* UNIFIED RANKINGS */}
        <div style={s.rankingsCard}>
          <div style={s.rankingsHdr}>
            <span style={s.rankingsTitle}>Season 1 Rankings</span>
            {leaderboard.length > 5 && (
              <span style={s.rankingsShow} onClick={() => setShowAllRankings(p => !p)}>
                {showAllRankings ? 'Show less ▲' : `Show all ${leaderboard.length} ▼`}
              </span>
            )}
          </div>
          {lbLoading ? (
            [1, 2, 3].map(i => <div key={i} style={{ ...s.skeleton, height: 40, margin: '0 12px 8px' }} />)
          ) : leaderboard.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', padding: '20px 0' }}>No participants yet</div>
          ) : (
            <>
              {leaderboard.slice(0, 3).map((entry, idx) => {
                const medalBg  = [t.medalGold, t.medalSilver, t.medalBronze][idx];
                const pctColor = [t.pctGold, t.pctSilver, t.pctBronze][idx];
                const isMe     = entry.userId === session?.user?.id;
                const topStock = entry.positions?.[0];
                const note     = topStock
                  ? `${topStock.ticker} ${topStock.pctGain >= 0 ? '+' : ''}${topStock.pctGain.toFixed(0)}% since buy`
                  : entry.openCount === 0 ? 'Watching from the sidelines' : `${entry.openCount} positions active`;
                return (
                  <div key={entry.userId} style={{ ...s.topRow, ...(isMe ? { background: `${t.green}08` } : {}) }}
                    onClick={() => setExpandedUser(expandedUser === entry.userId ? null : entry.userId)}>
                    <div style={{ ...s.topMedal, background: medalBg }}>{idx + 1}</div>
                    <div style={s.topInfo}>
                      <div style={s.topName}>{entry.username}{isMe ? ' ★' : ''}</div>
                      <div style={s.topNote}>{note}</div>
                    </div>
                    <div style={{ ...s.topPct, color: pctColor }}>{entry.pctReturn >= 0 ? '+' : ''}{entry.pctReturn.toFixed(1)}%</div>
                  </div>
                );
              })}
              {/* Expanded positions for any expanded user */}
              {leaderboard.map(entry => (
                expandedUser === entry.userId && entry.positions?.length > 0 ? (
                  <div key={`exp-${entry.userId}`} style={s.expandedPositions}>
                    {entry.positions.map((p, i) => (
                      <div key={i} style={s.expandedChip}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{p.ticker}</span>
                        <span style={{ fontSize: 10, color: p.pctGain >= 0 ? t.green : t.red }}>{p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null
              ))}
              {leaderboard.length > 3 && <div style={s.rankDivider} />}
              {leaderboard.slice(3, showAllRankings ? undefined : 5).map((entry, idx) => {
                const rank       = idx + 4;
                const isMe       = entry.userId === session?.user?.id;
                const isUp       = entry.pctReturn >= 0;
                const isExpanded = expandedUser === entry.userId;
                const topStock   = entry.positions?.[0];
                const note       = entry.openCount === 0 ? 'Watching from the sidelines'
                  : topStock ? `${topStock.ticker} ${topStock.pctGain >= 0 ? 'up' : 'down'} ${Math.abs(topStock.pctGain).toFixed(0)}%`
                  : `${entry.openCount} positions active`;
                return (
                  <div key={entry.userId}>
                    <div style={{ ...s.rankRow, ...(isMe ? { border: `2px solid ${t.green}60` } : {}) }}
                      onClick={() => setExpandedUser(isExpanded ? null : entry.userId)}>
                      <div style={s.rankNum}>{rank}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {entry.username}
                          {isMe && <span style={{ fontSize: 8, color: t.green, background: t.greenBg, padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>YOU</span>}
                        </div>
                        <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{note}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? t.green : t.red, flexShrink: 0 }}>{isUp ? '+' : ''}{entry.pctReturn.toFixed(1)}%</div>
                    </div>
                    {isExpanded && entry.positions?.length > 0 && (
                      <div style={s.expandedPositions}>
                        {entry.positions.map((p, i) => (
                          <div key={i} style={s.expandedChip}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: t.text1 }}>{p.ticker}</span>
                            <span style={{ fontSize: 10, color: p.pctGain >= 0 ? t.green : t.red }}>{p.pctGain >= 0 ? '+' : ''}{p.pctGain.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* TODAY'S RACE */}
        <div style={s.raceCard}>
          <div style={s.raceCardHdr}><span style={s.raceCardTitle}>🏁 Today's Race</span><span style={s.raceCardSub}>{daysLeft} days left</span></div>
          <div style={s.raceCardBody}>
            {(() => {
              const sorted = [...leaderboard].sort((a, b) => b.pctReturn - a.pctReturn);
              const best = sorted[0]; const worst = sorted[sorted.length - 1];
              if (!best) return <div style={{ fontSize: 11, color: t.text3 }}>Waiting for participants...</div>;
              return (<div style={{ fontSize: 11, color: t.text1, lineHeight: 1.6 }}>
                <span style={{ color: t.green, fontWeight: 600 }}>▲ {best.username} +{best.pctReturn.toFixed(1)}%</span>
                {best.positions?.[0] && <span style={{ color: t.text3 }}> — {best.positions[0].ticker}</span>}<br/>
                {worst && worst.userId !== best.userId && (<><span style={{ color: t.red, fontWeight: 600 }}>▼ {worst.username} {worst.pctReturn >= 0 ? '+' : ''}{worst.pctReturn.toFixed(1)}%</span>{worst.positions?.[0] && <span style={{ color: t.text3 }}> — {worst.positions[0].ticker}</span>}</>)}
              </div>);
            })()}
          </div>
        </div>

        {/* DAILY LEARN */}
        <div style={s.learnCard}>
          <div style={s.learnCardHdr}><span style={{ fontSize: 9, fontWeight: 700, color: t.purple }}>💡 LEARN</span></div>
          <div style={s.learnCardBody}>
            {trades.length === 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 3 }}>What is a stock ticker?</div>
                <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.6 }}>A short code for a company. AAPL = Apple, NVDA = Nvidia, TSLA = Tesla. Tap Join above to pick your first stock!</div>
              </>
            ) : (() => {
              const lessons = [
                {
                  title: 'Forward P/E — Are you overpaying?',
                  body: 'Price divided by next year\'s expected earnings. A stock at $100 with $5 expected earnings = 20x P/E. Lower means cheaper relative to profits. Compare within the same sector — tech P/Es are naturally higher than banks.',
                },
                {
                  title: 'DCF — Is it undervalued?',
                  body: 'Discounted Cash Flow estimates what a stock is worth based on future cash flows. Green dot on your watchlist = stock trades below fair value (potential bargain). Red dot = trades above fair value (potentially expensive).',
                },
                {
                  title: 'PEG Ratio — Growth at a fair price?',
                  body: 'P/E divided by earnings growth rate. Under 1.0 = you\'re paying less than the growth justifies (good deal). Over 2.0 = you\'re paying a premium. PEG adjusts P/E for growth — a high P/E is fine if growth is high too.',
                },
                {
                  title: 'Revenue Growth — Is the business expanding?',
                  body: 'Year-over-year increase in total sales. 20%+ is strong for large companies. Revenue grows before profits do — it tells you if customers are buying more. Shrinking revenue is a red flag even if profits look okay.',
                },
                {
                  title: 'Net Margin — How profitable is each dollar?',
                  body: 'Profit as a percentage of revenue. If a company earns $1B on $10B revenue, that\'s 10% margin. Software companies often hit 25%+, retailers might be 3-5%. Higher margins = more room to survive downturns.',
                },
                {
                  title: 'EPS Growth — Are profits actually growing?',
                  body: 'Earnings Per Share growth shows if the company is making more money per share over time. Consistent 15%+ EPS growth is a strong signal. Watch for one-time boosts that inflate EPS temporarily.',
                },
                {
                  title: 'Debt/Equity — How leveraged are they?',
                  body: 'Total debt divided by shareholder equity. Under 1.0 = conservative. Over 2.0 = heavily leveraged. High debt is risky when interest rates are high — the company spends more on interest payments instead of growth.',
                },
              ];
              const dayIndex = new Date().getDay();
              const lesson = lessons[dayIndex % lessons.length];
              return (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text1, marginBottom: 3 }}>{lesson.title}</div>
                  <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.6 }}>{lesson.body}</div>
                </>
              );
            })()}
          </div>
        </div>

        {/* SMACK TALK */}
        <div style={s.smackWrap}>
          <div style={s.smackHdr}><span>💬 Smack Talk</span><div style={s.smackLive}><div style={s.smackDot} /> LIVE</div></div>
          <div ref={smackMsgsRef} style={{ ...s.smackMsgs, maxHeight: 150 }}>
            {trashTalkMsgs.length === 0 ? (
              <div style={{ fontSize: 11, color: t.text3, padding: '8px 0' }}>No smack yet — be the first</div>
            ) : trashTalkMsgs.map((m) => {
              const lbEntry  = leaderboard.find(e => e.userId === m.user_id);
              const rank     = lbEntry ? leaderboard.indexOf(lbEntry) + 1 : null;
              const tier     = lbEntry ? getTier(lbEntry.pctReturn) : null;
              const medalBg  = rank === 1 ? t.medalGold : rank === 2 ? t.medalSilver : rank === 3 ? t.medalBronze : t.border;
              const rxns     = chatReactions[m.id] || {};
              return (
                <div key={m.id} style={s.smackMsg}>
                  <div style={s.smackMsgTop}>
                    <div style={{ ...s.smackAv, background: medalBg, color: rank && rank <= 3 ? '#fff' : t.text3 }}>{(m.profiles?.username || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.text1 }}>{m.profiles?.username || 'Anon'}</span>
                        {tier && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: tier.bg, color: tier.color, fontWeight: 500 }}>{tier.short}</span>}
                        <span style={{ fontSize: 9, color: t.text3, marginLeft: 'auto' }}>{timeAgo(m.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: t.text1, lineHeight: 1.35, marginTop: 2 }}>{m.message}</div>
                    </div>
                  </div>
                  <div style={s.rxnRow}>
                    {REACTIONS.map(r => { const users = rxns[r.label] || []; const myReacted = users.includes(session?.user?.id); if (users.length === 0 && !myReacted) return null; return (<div key={r.label} style={{ ...s.rxnPill, ...(myReacted ? s.rxnLit : {}) }} onClick={() => toggleReaction(m.id, r.label)}><span style={{ fontSize: 12 }}>{r.emoji}</span><span style={{ ...s.rxnCt, ...(myReacted ? { color: t.green } : {}) }}>{users.length}</span></div>); })}
                    <div style={s.rxnAdd} onClick={() => { const firstUnused = REACTIONS.find(r => !(rxns[r.label] || []).includes(session?.user?.id)); if (firstUnused) toggleReaction(m.id, firstUnused.label); }}>+</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={s.smackInput}>
            <input
              ref={smackInputRef}
              style={s.smackInputField}
              value={trashTalkInput}
              onChange={e => setTrashTalkInput(e.target.value.slice(0, 200))}
              placeholder="Talk your talk..."
              onKeyDown={e => e.key === 'Enter' && handleSendSmack()}
              onFocus={handleSmackFocus}
              enterKeyHint="send"
            />
            {/* preventDefault on pointerdown stops the button from stealing
                 focus off the input on mobile. Keeps the soft keyboard up
                 across consecutive sends — same pattern as the chat send.
                 handleSendSmack also pins scrollTop across the re-render
                 so the page doesn't snap to the top on send. */}
            <button style={s.smackSendBtn} onPointerDown={(e) => e.preventDefault()} onClick={handleSendSmack}>Send</button>
          </div>
        </div>

      </div>

      {sellTrade && (
        <SellModal session={session} trade={sellTrade} onClose={() => setSellTrade(null)} onComplete={handleSellComplete} />
      )}
    </div>
  );
}
