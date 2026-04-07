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
    bg: '#f8fafc', card: '#ffffff', cardHover: '#f8fafc',
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

// ── Rolex Gauge (subtle background) ──
export function RolexGauge({ score, t, darkMode }) {
  const s = score ?? 34;
  const needleAngle = -90 + (Math.min(Math.max(s, 0), 50) / 50) * 180;
  const cx = 160, cy = 150, nr = 80;
  const rad = (needleAngle - 90) * Math.PI / 180;
  const nx = cx + nr * Math.cos(rad);
  const ny = cy + nr * Math.sin(rad);

  return (
    <svg viewBox="0 0 320 170" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.25 }}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e"/>
          <stop offset="30%" stopColor="#84cc16"/>
          <stop offset="50%" stopColor="#eab308"/>
          <stop offset="75%" stopColor="#f97316"/>
          <stop offset="100%" stopColor="#ef4444"/>
        </linearGradient>
      </defs>
      {/* Outer bezel */}
      <path d="M60 150 A100 100 0 0 1 260 150" fill="none" stroke={darkMode ? "#2a4a6e" : "#c8d6e5"} strokeWidth="10"/>
      {/* Fluted bezel ticks */}
      <path d="M60 150 A100 100 0 0 1 260 150" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeDasharray="1 3.5"/>
      {/* Color gauge track */}
      <path d="M68 150 A92 92 0 0 1 252 150" fill="none" stroke="url(#gaugeGrad)" strokeWidth="3" strokeLinecap="round"/>
      {/* Tick marks */}
      {[-72,-54,-36,-18,0,18,36,54,72].map(angle => (
        <line key={angle} x1="72" y1="140" x2="72" y2="148" stroke="rgba(255,255,255,0.4)" strokeWidth="1" transform={`rotate(${angle}, 160, 150)`}/>
      ))}
      {/* Labels */}
      <text x="62" y="165" textAnchor="middle" fontSize="8" fill="#22c55e" fontWeight="600" style={{ fontFamily: "'Outfit', sans-serif" }}>GREED</text>
      <text x="258" y="165" textAnchor="middle" fontSize="8" fill="#ef4444" fontWeight="600" style={{ fontFamily: "'Outfit', sans-serif" }}>FEAR</text>
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={t.text1} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="4" fill={darkMode ? "#1e3d62" : "#c8d6e5"} stroke={t.text1} strokeWidth="1"/>
      <circle cx={cx} cy={cy} r="1.5" fill={t.text1}/>
    </svg>
  );
}

// ── Poker Chip ──
export function PokerChip({ alert, isSelected, onTap, size, t }) {
  const isFlow = alert.isFlowSignal;
  const isPos = isFlow ? (alert.confidence >= 70) : (alert.change >= 0);
  const borderColor = isPos ? t.green : t.red;
  const isAOTD = alert.isAlertOfDay;
  const pctText = isFlow
    ? `${alert.confidence}%`
    : (isPos ? "+" : "") + (typeof alert.changePercent === 'number' ? alert.changePercent.toFixed(2) : alert.changePercent) + "%";

  const tickerSize = size >= 68 ? 15 : size >= 58 ? 13 : size >= 48 ? 11 : 10;
  const pctSize = size >= 68 ? 12 : size >= 58 ? 10 : size >= 48 ? 9 : 8;
  const innerSize = size - 16;

  return (
    <div onClick={() => onTap(alert)} style={{
      width: size, height: size, borderRadius: '50%',
      border: `${isAOTD ? 3 : 2.5}px solid ${isAOTD ? t.gold : borderColor}`,
      background: `${borderColor}15`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative',
      transform: isSelected ? 'scale(1.1)' : 'scale(1)',
      transition: 'transform .15s',
      animation: isSelected ? 'none' : (isAOTD ? 'chipPulseGold 3s ease-in-out infinite' : isPos ? 'chipPulseGreen 3s ease-in-out infinite' : 'chipPulseRed 2.5s ease-in-out infinite'),
      boxShadow: isSelected ? `0 0 20px ${borderColor}40` : undefined,
    }}>
      <div style={{
        position: 'absolute', width: innerSize, height: innerSize, borderRadius: '50%',
        border: `1px dashed ${borderColor}45`,
      }}/>
      {isAOTD && (
        <div style={{
          position: 'absolute', top: -5,
          background: t.gold, color: '#0a1628',
          fontSize: 6, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px',
        }}>AOTD</div>
      )}
      <span style={{ fontSize: tickerSize, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif", lineHeight: 1, position: 'relative' }}>{alert.ticker}</span>
      <span style={{ fontSize: pctSize, fontWeight: 700, color: borderColor, lineHeight: 1.2, position: 'relative' }}>{pctText}</span>
    </div>
  );
}

// ── Mystery Chip (Options / Dark Pool) ──
export function MysteryChip({ type, isSelected, onTap, size, t }) {
  const isOptions = type === 'options';
  const borderColor = isOptions ? t.gold : t.amber;
  const label = isOptions ? 'Options' : <span style={{ textAlign: 'center', lineHeight: 1.1 }}>Dark<br/>Pool</span>;
  const emoji = isOptions ? '💰' : '🏦';
  const tickerSize = size >= 68 ? 13 : 12;

  return (
    <div onClick={() => onTap(type)} style={{
      width: size, height: size, borderRadius: '50%',
      border: `${isOptions ? 3 : 2.5}px solid ${borderColor}`,
      background: `${borderColor}12`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative',
      transform: isSelected ? 'scale(1.1)' : 'scale(1)',
      transition: 'transform .15s',
      animation: isSelected ? 'none' : 'chipPulseGold 3s ease-in-out infinite',
      boxShadow: isSelected ? `0 0 20px ${borderColor}40` : undefined,
    }}>
      <div style={{
        position: 'absolute', width: size - 16, height: size - 16, borderRadius: '50%',
        border: `1px dashed ${borderColor}45`,
      }}/>
      {isOptions && (
        <div style={{
          position: 'absolute', top: -5,
          background: t.gold, color: '#0a1628',
          fontSize: 6, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px',
        }}>AOTD</div>
      )}
      <span style={{ fontSize: tickerSize, fontWeight: 700, color: t.text1, fontFamily: "'Outfit', sans-serif", lineHeight: 1, position: 'relative' }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: borderColor, lineHeight: 1, position: 'relative', marginTop: 2 }}>{emoji}</span>
    </div>
  );
}

// ── Chip Field (gauge background + scattered poker chips) ──
export function ChipField({ alerts, fearScore, history, selectedId, onChipTap, onMysteryTap, mysterySelected, t, darkMode }) {
  // Deduplicate by ticker — keep highest confidence for each
  const uniqueMap = new Map();
  alerts.forEach(a => {
    const existing = uniqueMap.get(a.ticker);
    if (!existing || a.confidence > existing.confidence) {
      uniqueMap.set(a.ticker, a);
    }
  });
  const getSortValue = (a) => a.isFlowSignal ? (a.confidence || 0) : Math.abs(a.changePercent || 0);
  const sorted = [...uniqueMap.values()]
    .sort((a, b) => {
      if (a.isAlertOfDay && !b.isAlertOfDay) return -1;
      if (!a.isAlertOfDay && b.isAlertOfDay) return 1;
      return getSortValue(b) - getSortValue(a);
    })
    .slice(0, 2); // Reduced to 2 scanner chips to make room for mystery chips

  const getChipSize = (pct, alert) => {
    if (alert?.isFlowSignal) {
      const conf = alert.confidence || 0;
      if (conf >= 85) return 82;
      if (conf >= 75) return 72;
      if (conf >= 65) return 60;
      return 52;
    }
    const abs = Math.abs(pct || 0);
    if (abs >= 4) return 82;
    if (abs >= 2) return 72;
    if (abs >= 1) return 60;
    return 52;
  };

  // 4 slots: Options mystery (top-right), scanner chip 1 (top-left), Dark Pool mystery (mid-left), scanner chip 2 (bottom-left)
  const slots = [
    { top: '6%', right: '6%' },   // Options mystery chip
    { top: '10%', left: '5%' },   // Scanner chip 1
    { top: '38%', left: '28%' },  // Dark Pool mystery chip
    { top: '55%', left: '8%' },   // Scanner chip 2
  ];

  // Build bead plate dots
  const dots = [];
  if (history && history.length > 0) {
    const reversed = [...history].reverse();
    let cols = [], col = [], cType = null;
    reversed.forEach(h => {
      const hit = h.type === 'hit' || (h.result != null && h.result > 0);
      if (cType === null) { cType = hit; col.push(hit); }
      else if (hit === cType) { col.push(hit); }
      else { cols.push([...col]); col = [hit]; cType = hit; }
    });
    if (col.length > 0) cols.push(col);
    dots.push(...cols);
  }

  const hits = (history || []).filter(h => h.type === 'hit' || (h.result != null && h.result > 0)).length;
  const hitRate = history && history.length > 0 ? Math.round((hits / history.length) * 100) : 0;

  return (
    <div style={{ position: 'relative', height: 210, marginBottom: 8, overflow: 'hidden' }}>
      <style>{`
        @keyframes chipFloat0 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(3px,-4px); } }
        @keyframes chipFloat1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-4px,3px); } }
        @keyframes chipFloat2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(2px,4px); } }
        @keyframes chipFloat3 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-3px,-3px); } }
        @keyframes chipFloat4 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(4px,2px); } }
        @keyframes chipPulseGreen { 0%,100% { box-shadow: 0 0 6px rgba(93,202,165,0.2), 0 0 20px rgba(93,202,165,0.1); } 50% { box-shadow: 0 0 18px rgba(93,202,165,0.5), 0 0 36px rgba(93,202,165,0.15); } }
        @keyframes chipPulseRed { 0%,100% { box-shadow: 0 0 6px rgba(240,149,149,0.2), 0 0 20px rgba(240,149,149,0.1); } 50% { box-shadow: 0 0 18px rgba(240,149,149,0.5), 0 0 36px rgba(240,149,149,0.15); } }
        @keyframes chipPulseGold { 0%,100% { box-shadow: 0 0 6px rgba(212,160,23,0.2), 0 0 20px rgba(212,160,23,0.1); } 50% { box-shadow: 0 0 18px rgba(212,160,23,0.5), 0 0 36px rgba(212,160,23,0.15); } }
      `}</style>
      <RolexGauge score={fearScore} t={t} darkMode={darkMode} />

      {/* Score label */}
      <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', opacity: 0.45 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: (fearScore ?? 34) > 30 ? '#f97316' : (fearScore ?? 34) > 20 ? '#eab308' : '#22c55e', fontFamily: "'Outfit', sans-serif" }}>{Math.round(fearScore ?? 34)}</div>
        <div style={{ fontSize: 7, fontWeight: 600, color: (fearScore ?? 34) > 30 ? '#f97316' : (fearScore ?? 34) > 20 ? '#eab308' : '#22c55e', fontFamily: "'Outfit', sans-serif", letterSpacing: 1.5, marginTop: -2 }}>
          {(fearScore ?? 34) > 30 ? "FEARFUL" : (fearScore ?? 34) > 20 ? "NEUTRAL" : "GREEDY"}
        </div>
      </div>

      {/* Bead plate */}
      <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 3, opacity: 0.45 }}>
        {dots.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {col.map((isHit, di) => (
              <div key={di} style={{ width: 4, height: 4, borderRadius: '50%', background: isHit ? t.green : t.red }} />
            ))}
          </div>
        ))}
        {dots.length > 0 && <span style={{ fontSize: 8, color: t.text3, marginLeft: 2 }}>{hitRate}%</span>}
      </div>

      {/* Poker chips */}
      {/* Mystery Options chip — slot 0 (top-right) */}
      <div style={{ position: 'absolute', ...slots[0], animation: `chipFloat0 6s ease-in-out infinite` }}>
        <MysteryChip type="options" isSelected={mysterySelected === 'options'} onTap={onMysteryTap} size={82} t={t} />
      </div>

      {/* Scanner chip 1 — slot 1 (top-left) */}
      {sorted[0] && (
        <div style={{ position: 'absolute', ...slots[1], animation: `chipFloat1 7.5s ease-in-out infinite` }}>
          <PokerChip alert={sorted[0]} isSelected={selectedId === sorted[0].id} onTap={onChipTap} size={getChipSize(sorted[0].changePercent, sorted[0])} t={t} />
        </div>
      )}

      {/* Mystery Dark Pool chip — slot 2 (mid-left) */}
      <div style={{ position: 'absolute', ...slots[2], animation: `chipFloat2 9s ease-in-out infinite` }}>
        <MysteryChip type="darkpool" isSelected={mysterySelected === 'darkpool'} onTap={onMysteryTap} size={72} t={t} />
      </div>

      {/* Scanner chip 2 — slot 3 (bottom-left) */}
      {sorted[1] && (
        <div style={{ position: 'absolute', ...slots[3], animation: `chipFloat3 7.5s ease-in-out infinite` }}>
          <PokerChip alert={sorted[1]} isSelected={selectedId === sorted[1].id} onTap={onChipTap} size={getChipSize(sorted[1].changePercent, sorted[1])} t={t} />
        </div>
      )}
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
