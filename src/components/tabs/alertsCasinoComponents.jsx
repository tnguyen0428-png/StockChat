// ============================================
// UPTIKALERTS — alertsCasinoComponents.jsx
// Casino-themed components for AlertsTab redesign
// ============================================

import { useState, useEffect } from 'react';

// ── Dark / Light Theme System ──
export function useTheme(darkMode) {
  return darkMode ? {
    bg: '#0a1628', card: '#132d52', cardHover: '#1a3d6e',
    surface: '#0e1e36', surfaceAlt: '#0a1628',
    border: '#1e3d62', borderLight: '#1a3558',
    text1: '#e8edf2', text2: '#8ca4c0', text3: '#5a7a9a',
    green: '#5DCAA5', red: '#F09595', gold: '#D4A017', amber: '#FAC775',
    purple: '#a78bfa', blue: '#7B8CDE', pink: '#f472b6',
    greenBg: 'rgba(93,202,165,0.1)', redBg: 'rgba(240,149,149,0.1)',
    goldBg: 'rgba(212,160,23,0.1)', purpleBg: 'rgba(167,139,250,0.1)',
    blueBg: 'rgba(123,140,222,0.1)', pinkBg: 'rgba(244,114,182,0.1)',
    btnActive: '#1a3d6e', shadow: '0 1px 3px rgba(0,0,0,.2)',
  } : {
    bg: '#ffffff', card: '#ffffff', cardHover: '#f8fafc',
    surface: '#f8fafc', surfaceAlt: '#f1f5f9',
    border: '#e2e8f0', borderLight: '#f1f5f9',
    text1: '#0f172a', text2: '#64748b', text3: '#94a3b8',
    green: '#16a34a', red: '#dc2626', gold: '#d97706', amber: '#f59e0b',
    purple: '#7c3aed', blue: '#2563eb', pink: '#ec4899',
    greenBg: 'rgba(22,163,74,0.08)', redBg: 'rgba(220,38,38,0.08)',
    goldBg: 'rgba(217,119,6,0.08)', purpleBg: 'rgba(124,58,237,0.08)',
    blueBg: 'rgba(37,99,235,0.08)', pinkBg: 'rgba(236,72,153,0.08)',
    btnActive: '#1e293b', shadow: '0 1px 3px rgba(0,0,0,.06)',
  };
}

// ── Confidence Ring ──
export function ConfidenceRing({ value, size = 16, t }) {
  const r = (size - 3) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / 100, 0), 1);
  const offset = circ * (1 - pct);
  const color = value >= 80 ? t.green : value >= 65 ? t.gold : t.red;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}30`} strokeWidth="2.5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90, ${size/2}, ${size/2})`} />
    </svg>
  );
}

// ── Alert Arc (Blackjack Semicircle) ──
// Shows top 5 alerts dealt along a curved arc. AOTD at apex.
export function AlertArc({ alerts, onTap, t, darkMode }) {
  const top5 = [...alerts].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  if (top5.length === 0) return null;
  const aotd = top5[0];
  const sides = top5.slice(1);
  const positions = [
    { x: 6, y: 38, w: 60, h: 32, rot: -8 },
    { x: 60, y: 43, w: 58, h: 28, rot: -3 },
    { x: 155, y: 43, w: 58, h: 28, rot: 3 },
    { x: 204, y: 38, w: 60, h: 32, rot: 8 },
  ];
  const arcBg = darkMode ? 'rgba(212,160,23,0.06)' : 'rgba(26,45,74,0.03)';
  const arcLine = darkMode ? 'rgba(212,160,23,0.12)' : 'rgba(26,45,74,0.08)';

  return (
    <div style={{ padding: '4px 4px 0', textAlign: 'center' }}>
      <svg viewBox="0 0 270 82" style={{ width: '100%', height: 'auto', maxWidth: 420 }}>
        <path d="M10 76 Q10 6, 135 6 Q260 6, 260 76" fill="none" stroke={arcBg} strokeWidth="16" />
        <path d="M10 76 Q10 6, 135 6 Q260 6, 260 76" fill="none" stroke={arcLine} strokeWidth="0.5" strokeDasharray="3 2" />
        {/* AOTD center */}
        <g style={{ cursor: 'pointer' }} onClick={() => onTap && onTap(aotd)}>
          <rect x="98" y="4" width="74" height="42" rx="7" fill={`${t.gold}12`} stroke={`${t.gold}50`} strokeWidth="0.8" />
          <text x="135" y="14" textAnchor="middle" fontSize="5" fill={t.gold} fontWeight="700" letterSpacing="0.8" style={{ fontFamily: "'Outfit', sans-serif" }}>ALERT OF THE DAY</text>
          <text x="135" y="28" textAnchor="middle" fontSize="13" fill={t.text1} fontWeight="700" style={{ fontFamily: "'Outfit', sans-serif" }}>{aotd.ticker}</text>
          <text x="118" y="40" textAnchor="middle" fontSize="7" fill={aotd.change >= 0 ? t.green : t.red} fontWeight="600">{aotd.change >= 0 ? '+' : ''}{typeof aotd.changePercent === 'number' ? aotd.changePercent.toFixed(2) : aotd.changePercent}%</text>
          <text x="155" y="40" textAnchor="middle" fontSize="7" fill={t.text2} fontWeight="600">{aotd.confidence}%</text>
        </g>
        {/* Side cards */}
        {sides.map((alert, i) => {
          const p = positions[i];
          if (!p) return null;
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          return (
            <g key={alert.id || i} transform={`rotate(${p.rot}, ${cx}, ${cy})`} style={{ cursor: 'pointer' }} onClick={() => onTap && onTap(alert)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="5" fill={t.card} stroke={t.border} strokeWidth="0.5" />
              <text x={cx} y={p.y + (p.h > 30 ? 13 : 12)} textAnchor="middle" fontSize={p.h > 30 ? '9' : '8'} fill={t.text1} fontWeight="700" style={{ fontFamily: "'Outfit', sans-serif" }}>{alert.ticker}</text>
              <text x={cx} y={p.y + p.h - (p.h > 30 ? 7 : 5)} textAnchor="middle" fontSize="6" fill={alert.change >= 0 ? t.green : t.red} fontWeight="600">{alert.confidence}% {alert.change >= 0 ? '+' : ''}{typeof alert.changePercent === 'number' ? alert.changePercent.toFixed(1) : alert.changePercent}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Bead Plate (Baccarat Streak Dots) ──
// Shows AOTD track record as streak columns. Green = hit, Red = miss.
export function BeadPlate({ history, t }) {
  if (!history || history.length === 0) return null;
  const reversed = [...history].reverse();
  const columns = [];
  let currentCol = [], currentType = null;
  reversed.forEach(h => {
    const isHit = h.type === 'hit' || (h.result != null && h.result > 0);
    if (currentType === null) { currentType = isHit; currentCol.push(isHit); }
    else if (isHit === currentType) { currentCol.push(isHit); }
    else { columns.push([...currentCol]); currentCol = [isHit]; currentType = isHit; }
  });
  if (currentCol.length > 0) columns.push(currentCol);

  const hits = history.filter(h => h.type === 'hit' || (h.result != null && h.result > 0)).length;
  const hitRate = history.length > 0 ? Math.round((hits / history.length) * 100) : 0;
  const avgReturn = history.length > 0 ? (history.reduce((s, h) => s + (h.result || 0), 0) / history.length).toFixed(1) : '0';
  let streakCount = 0, streakIsWin = null;
  for (let i = 0; i < history.length; i++) {
    const isHit = history[i].type === 'hit' || (history[i].result != null && history[i].result > 0);
    if (i === 0) { streakIsWin = isHit; streakCount = 1; }
    else if (isHit === streakIsWin) { streakCount++; }
    else break;
  }

  return (
    <div style={{ padding: '0 12px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {col.map((isHit, di) => (
              <div key={di} style={{ width: 7, height: 7, borderRadius: '50%', background: isHit ? t.green : t.red }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: t.text3, fontFamily: "'DM Sans', sans-serif" }}>
        {hitRate}% hit · +{avgReturn}% avg · <span style={{ color: streakIsWin ? t.green : t.red, fontWeight: 600 }}>{streakCount}{streakIsWin ? 'W' : 'L'}</span>
      </div>
    </div>
  );
}

// ── Dark Mode Toggle Button ──
export function DarkModeToggle({ darkMode, onToggle, t }) {
  return (
    <button onClick={onToggle} style={{
      width: 30, height: 30, borderRadius: '50%', background: t.surface,
      border: `1px solid ${t.border}`, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, padding: 0, lineHeight: 1,
    }} aria-label="Toggle dark mode">
      {darkMode ? '☀️' : '🌙'}
    </button>
  );
}
