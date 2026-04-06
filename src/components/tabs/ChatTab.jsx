// ============================================
// UPTIKALERTS — ChatTab.jsx
// Group view: Chat / Lists / Watchlist sub-tabs
// ============================================

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { scoreTicker } from '../../lib/screener';
import { useGroup } from '../../context/GroupContext';
import { askUpTikAI } from '../../lib/aiAgent';
import FadingMessage from '../shared/FadingMessage';
import TickerBanner from './TickerBanner';
import { isWeekend, isMarketHoliday } from '../../utils/marketUtils';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

const EMOJIS = ['🔥','📈','📉','🚀','💪','🎯','👀','💰','⚠️','✅','❌','😎','🤔','👋','🙌','😂','💎','🐂','🐻','⏰'];

// ── Structured JSON card extractor (preferred path) ──
// The AI is instructed to prepend a ```uptik {...}``` fenced block when it has verified data.
// Returns { data, prose } where data has a `type` field and prose is the cleaned message.
function extractUptikCard(text) {
  if (!text) return { data: null, prose: text };
  // Find the uptik marker (any number of backticks, or none), then brace-match the JSON.
  const marker = text.match(/(`{0,3})\s*uptik\s*/i);
  if (!marker) return { data: null, prose: text };
  const startIdx = marker.index + marker[0].length;
  const braceStart = text.indexOf('{', startIdx);
  if (braceStart === -1 || braceStart > startIdx + 4) return { data: null, prose: text };
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = braceStart; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return { data: null, prose: text };
  try {
    const data = JSON.parse(text.slice(braceStart, end + 1));
    // Swallow trailing backticks after the JSON block
    let tail = end + 1;
    while (text[tail] === '`') tail++;
    const prose = (text.slice(0, marker.index) + text.slice(tail)).trim();
    return { data, prose };
  } catch {
    return { data: null, prose: text };
  }
}

// ── Earnings card parser ──
// Handles both single-quarter and multi-quarter bullet-list earnings replies.
function parseEarningsCard(text) {
  if (!text || !/(beat|miss)/i.test(text)) return null;
  const tickerM = text.match(/\b([A-Z]{1,5})\b\s*[—–-]\s*\$?([\d.,]+)/);
  if (!tickerM) return null;
  // Extract all quarters mentioned: "Feb '26: Beat by 1.8% ($0.74 vs $0.727 est)"
  const quarters = [];
  // Pattern A: "[Label]: Beat by X% ($A vs $E est)"
  const reA = /(?:([A-Z][a-z]{2,9}\s*['’]?\d{2,4}|[A-Z][a-z]{2,9}\s+\d{1,2},?\s*\d{4})[^:]*:?\s*)?(Beat|Miss(?:ed)?)\s*by\s*([\d.]+)\s*%(?:\s*\(?\$?([\d.]+)\s*(?:vs|versus)\s*\$?([\d.]+)\s*(?:est(?:imate)?)?\)?)?/gi;
  // Pattern B: "[Label] beat/miss $A vs $E est (+/-X%)"
  const reB = /(?:([A-Z][a-z]{2,9}\s*['’]?\d{2,4}|[A-Z][a-z]{2,9}\s+\d{1,2},?\s*\d{4})[^$]*?)?(beat|miss(?:ed)?)\s*\$?([\d.]+)\s*(?:vs|versus)\s*\$?([\d.]+)\s*(?:est(?:imate)?)?\s*\(?\s*([+-]?[\d.]+)\s*%\)?/gi;
  let m;
  while ((m = reA.exec(text)) !== null) {
    quarters.push({
      label: m[1] || null,
      sign: /^beat/i.test(m[2]) ? 1 : -1,
      pct: parseFloat(m[3]),
      actual: m[4] ? parseFloat(m[4]) : null,
      est: m[5] ? parseFloat(m[5]) : null,
    });
  }
  if (quarters.length === 0) {
    while ((m = reB.exec(text)) !== null) {
      const pct = parseFloat(m[5]);
      quarters.push({
        label: m[1] || null,
        sign: /^beat/i.test(m[2]) ? 1 : -1,
        pct: Math.abs(pct),
        actual: parseFloat(m[3]),
        est: parseFloat(m[4]),
      });
    }
  }
  // Pattern C: "$A vs $E est (X% beat/miss)"
  if (quarters.length === 0) {
    const reC = /\$?([\d.]+)\s*(?:vs|versus)\s*\$?([\d.]+)\s*est(?:imate)?\s*\(?\s*([\d.]+)\s*%\s*(beat|miss(?:ed)?)\)?/gi;
    while ((m = reC.exec(text)) !== null) {
      quarters.push({
        label: null,
        sign: /^beat/i.test(m[4]) ? 1 : -1,
        pct: parseFloat(m[3]),
        actual: parseFloat(m[1]),
        est: parseFloat(m[2]),
      });
    }
  }
  if (quarters.length === 0) return null;
  const latest = quarters[0];
  // Everything after the price line is context/narrative.
  const noteText = text.slice(tickerM.index + tickerM[0].length).replace(/^[,\s.]*(?:last\s+close\.?)?/i, '').trim() || null;
  return {
    ticker: tickerM[1],
    price: parseFloat(tickerM[2].replace(/,/g, '')),
    date: latest.label,
    actual: latest.actual,
    est: latest.est,
    beatPct: latest.sign * latest.pct,
    quarters, // array for multi-quarter history strip
    note: noteText,
  };
}

function EarningsCard({ data, onTickerClick }) {
  const positive = data.beatPct >= 0;
  const accent = positive ? '#1AAD5E' : '#E05252';
  const bg     = positive ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)';
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', borderBottom: '1px solid var(--border)' };
  const lbl = { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
  const val = { fontSize: 15, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: bg, borderBottom: `1px solid ${accent}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            onClick={() => onTickerClick && onTickerClick('$' + data.ticker)}
            style={{ fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default' }}
          >${data.ticker}</span>
          <span style={{ fontSize: 14, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>${data.price.toFixed(2)}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {positive ? '▲' : '▼'} {positive ? 'BEAT' : 'MISS'} {Math.abs(data.beatPct).toFixed(1)}%
        </span>
      </div>
      {data.date && (
        <div style={row}>
          <span style={lbl}>Report Date</span>
          <span style={val}>{data.date}</span>
        </div>
      )}
      {data.actual != null && (
        <div style={row}>
          <span style={lbl}>EPS Actual</span>
          <span style={{ ...val, color: accent }}>${data.actual.toFixed(3)}</span>
        </div>
      )}
      {data.est != null && (
        <div style={row}>
          <span style={lbl}>EPS Estimate</span>
          <span style={val}>${data.est.toFixed(3)}</span>
        </div>
      )}
      <div style={{ ...row, borderBottom: ((data.quarters && data.quarters.length > 1) || data.note) ? '1px solid var(--border)' : 'none' }}>
        <span style={lbl}>Surprise</span>
        <span style={{ ...val, color: accent }}>{positive ? '+' : ''}{data.beatPct.toFixed(1)}%</span>
      </div>
      {data.quarters && data.quarters.length > 1 && (
        <div style={{ padding: '10px 12px', background: 'var(--card)' }}>
          <div style={{ ...lbl, marginBottom: 6 }}>History</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.quarters.map((q, i) => {
              const qPos = q.sign >= 0;
              const qAccent = qPos ? '#1AAD5E' : '#E05252';
              const qBg = qPos ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)';
              return (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: qBg, border: `1px solid ${qAccent}33`, fontSize: 12, fontWeight: 600, color: qAccent, fontVariantNumeric: 'tabular-nums' }}>
                  {q.label || 'Q' + (data.quarters.length - i)} · {qPos ? '▲' : '▼'} {q.pct.toFixed(1)}%
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.note && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, borderTop: data.quarters && data.quarters.length > 1 ? '1px solid var(--border)' : 'none', background: 'var(--card)' }}>
          {renderBulletedNote(data.note)}
        </div>
      )}
    </div>
  );
}

// ── Price quote card parser ──
// Matches "AAPL — $187.43, up 1.2%", "AAPL — $187.43, last close", "$AAPL at $187.43"
function parsePriceQuoteCard(text) {
  if (!text) return null;
  // Skip if earnings parser will handle it
  if (/(beat|miss(?:ed)?)\s*by\s*[\d.]+\s*%/i.test(text)) return null;
  // Skip if valuation parser will handle it (numeric P/E present)
  if (/P\/E[:\s]+[\d.]+/i.test(text)) return null;
  const m = text.match(/\$?\b([A-Z]{1,5})\b\s*(?:—|–|-|at|:)\s*\$?([\d,]+\.?\d*)/);
  if (!m) return null;
  const price = parseFloat(m[2].replace(/,/g, ''));
  if (!price || price > 100000) return null;
  const pctM = text.match(/(up|down|\+|-)\s*([\d.]+)\s*%/i);
  let pct = pctM ? parseFloat(pctM[2]) : null;
  if (pct != null && (/^down$/i.test(pctM[1]) || pctM[1] === '-')) pct = -pct;
  const volM = text.match(/([\d.]+)\s*([KMB])\s*shares/i);
  const isClose = /last close|closing price|market(?:'s)?\s*closed/i.test(text);
  // Build context note from rest of text (everything after first period)
  const parts = text.split(/[.!?]\s/);
  const note = parts.slice(1).filter(p => p.trim()).join('. ').trim() || null;
  return {
    ticker: m[1], price, pct, note,
    volume: volM ? `${volM[1]}${volM[2].toUpperCase()}` : null,
    isClose,
  };
}

function PriceQuoteCard({ data, onTickerClick }) {
  const hasPct = data.pct != null;
  const up = hasPct ? data.pct >= 0 : true;
  const accent = hasPct ? (up ? '#1AAD5E' : '#E05252') : '#6D28D9';
  const bg = hasPct ? (up ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)') : 'rgba(139,92,246,0.08)';
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: bg, borderBottom: `1px solid ${accent}33`, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            onClick={() => onTickerClick && onTickerClick('$' + data.ticker)}
            style={{ fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default' }}
          >${data.ticker}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>${data.price.toFixed(2)}</span>
          {data.isClose && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>Last close</span>
          )}
        </div>
        {hasPct && (
          <span style={{ fontSize: 14, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{data.pct.toFixed(2)}%
          </span>
        )}
      </div>
      {data.volume && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: data.note ? '1px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Volume</span>
          <span style={{ fontSize: 14, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{data.volume} shares</span>
        </div>
      )}
      {data.note && (
        <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          {renderBulletedNote(data.note)}
        </div>
      )}
    </div>
  );
}

// Split inline "• a • b • c" into separated rows; paragraphs without bullets render as-is.
function renderBulletedNote(text) {
  if (!text) return null;
  // Normalize: ensure a bullet at the start of each bullet chunk
  const hasBullets = /[•●]/.test(text);
  if (!hasBullets) {
    return text.split(/\n+/).map((line, i) => <div key={i} style={{ marginBottom: 4 }}>{line}</div>);
  }
  // Split on bullets, keeping the delimiter off
  const parts = text.split(/\s*[•●]\s*/).map(s => s.trim()).filter(Boolean);
  // If the first part is prose (no bullet prefix in original), keep it as an intro paragraph
  const startsWithBullet = /^\s*[•●]/.test(text);
  const intro = !startsWithBullet ? parts.shift() : null;
  return (
    <>
      {intro && <div style={{ marginBottom: 8 }}>{intro}</div>}
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
          <span style={{ color: '#8B5CF6', fontWeight: 700, lineHeight: 1.6 }}>•</span>
          <span style={{ flex: 1 }}>{p}</span>
        </div>
      ))}
    </>
  );
}

// ── Valuation card parser ──
// Matches replies like "AAPL — P/E: 32, PEG: 2.1, Net Margin: 25%, Sales Growth: 8%"
function parseValuationCard(text) {
  if (!text) return null;
  if (!/P\/E/i.test(text)) return null;
  const tickerM = text.match(/\b([A-Z]{1,5})\b/);
  const pe = text.match(/P\/E[:\s]+([\d.]+)/i);
  const peg = text.match(/PEG[:\s]+([\d.]+)/i);
  const netM = text.match(/Net Margin[:\s]+([\d.]+)\s*%/i);
  const sales = text.match(/Sales Growth[:\s]+([-\d.]+)\s*%/i);
  const epsG = text.match(/EPS Growth[:\s]+([-\d.]+)\s*%/i);
  if (!tickerM || !pe) return null;
  return {
    ticker: tickerM[1],
    pe: parseFloat(pe[1]),
    peg: peg ? parseFloat(peg[1]) : null,
    netMargin: netM ? parseFloat(netM[1]) : null,
    salesGrowth: sales ? parseFloat(sales[1]) : null,
    epsGrowth: epsG ? parseFloat(epsG[1]) : null,
  };
}

function ValuationCard({ data, onTickerClick }) {
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', borderBottom: '1px solid var(--border)' };
  const lbl = { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
  const val = { fontSize: 15, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
  const signColor = (v) => v == null ? 'var(--text1)' : (v >= 0 ? '#1AAD5E' : '#E05252');
  const fmtPct = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          onClick={() => onTickerClick && onTickerClick('$' + data.ticker)}
          style={{ fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default' }}
        >${data.ticker}</span>
        <span style={{ fontSize: 12, color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valuation</span>
      </div>
      <div style={row}><span style={lbl}>P/E</span><span style={val}>{data.pe.toFixed(1)}</span></div>
      {data.peg != null && <div style={row}><span style={lbl}>PEG</span><span style={val}>{data.peg.toFixed(2)}</span></div>}
      {data.netMargin != null && <div style={row}><span style={lbl}>Net Margin</span><span style={val}>{data.netMargin.toFixed(1)}%</span></div>}
      {data.salesGrowth != null && <div style={row}><span style={lbl}>Sales Growth</span><span style={{ ...val, color: signColor(data.salesGrowth) }}>{fmtPct(data.salesGrowth)}</span></div>}
      {data.epsGrowth != null && <div style={{ ...row, borderBottom: 'none' }}><span style={lbl}>EPS Growth</span><span style={{ ...val, color: signColor(data.epsGrowth) }}>{fmtPct(data.epsGrowth)}</span></div>}
    </div>
  );
}

// ── Options flow card parser ──
// Matches "$AAPL 200C 4/18 — $2.1M premium, bullish"
function parseOptionsFlowCard(text) {
  if (!text) return null;
  const m = text.match(/\$?\b([A-Z]{1,5})\b\s+(\d+(?:\.\d+)?)\s*([CP])\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[—–-]\s*\$?([\d.]+)\s*([KMB])\s*(?:premium)?/i);
  if (!m) return null;
  const sent = /bullish/i.test(text) ? 'bullish' : /bearish/i.test(text) ? 'bearish' : null;
  return {
    ticker: m[1], strike: parseFloat(m[2]), side: m[3].toUpperCase(),
    expiry: m[4], premium: parseFloat(m[5]), unit: m[6].toUpperCase(), sentiment: sent,
  };
}

function OptionsFlowCard({ data, onTickerClick }) {
  const bull = data.sentiment === 'bullish' || (data.side === 'C' && data.sentiment !== 'bearish');
  const accent = bull ? '#1AAD5E' : '#E05252';
  const bg = bull ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)';
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', borderBottom: '1px solid var(--border)' };
  const lbl = { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
  const val = { fontSize: 15, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ padding: '10px 12px', background: bg, borderBottom: `1px solid ${accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          onClick={() => onTickerClick && onTickerClick('$' + data.ticker)}
          style={{ fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default' }}
        >${data.ticker}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {bull ? '▲ Bullish Flow' : '▼ Bearish Flow'}
        </span>
      </div>
      <div style={row}><span style={lbl}>Contract</span><span style={val}>{data.strike} {data.side === 'C' ? 'Call' : 'Put'}</span></div>
      <div style={row}><span style={lbl}>Expiry</span><span style={val}>{data.expiry}</span></div>
      <div style={{ ...row, borderBottom: 'none' }}><span style={lbl}>Premium</span><span style={{ ...val, color: accent }}>${data.premium}{data.unit}</span></div>
    </div>
  );
}

// ── Comparison card (peers vs anchor ticker) ──
function ComparisonCard({ data, onTickerClick }) {
  const peers = Array.isArray(data.peers) ? data.peers : [];
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            onClick={() => onTickerClick && onTickerClick('$' + data.ticker)}
            style={{ fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default' }}
          >${data.ticker}</span>
          {data.price != null && (
            <span style={{ fontSize: 14, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>${Number(data.price).toFixed(2)}</span>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>vs peers</span>
      </div>
      {data.headline && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text1)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
          {data.headline}
        </div>
      )}
      {peers.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: i < peers.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span
            onClick={() => onTickerClick && onTickerClick('$' + p.ticker)}
            style={{ fontSize: 12, fontWeight: 800, color: '#D4A017', background: '#FFFBEB', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)', cursor: onTickerClick ? 'pointer' : 'default', flexShrink: 0, lineHeight: 1.4 }}
          >${p.ticker}</span>
          <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, flex: 1 }}>{p.note}</span>
        </div>
      ))}
    </div>
  );
}

// ── Message Item ──
const MessageItem = memo(({ msg, currentUserId, onFeedback, feedbackGiven, onTickerClick }) => {
  const isAdmin = msg.is_admin;
  const isAI    = msg.user_id === 'user_ai';

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const parseText = (text, onTickerClick) => {
    // Match both $TICKER and bare TICKER mentions (only well-known patterns in AI responses)
    const parts = text.split(/(\$[A-Z]{1,5})/g);
    return parts.map((part, i) =>
      /^\$[A-Z]{1,5}$/.test(part)
        ? <span key={i} style={{ ...styles.tickerMention, ...(onTickerClick ? { cursor: 'pointer' } : {}) }} onClick={() => onTickerClick && onTickerClick(part)}>{part}</span>
        : part
    );
  };

  const bodyStyle = {
    ...styles.msgBody,
    ...(isAdmin ? styles.adminBody : {}),
    ...(isAI    ? styles.aiBody    : {}),
  };

  return (
    <div style={styles.msg}>
      <div style={bodyStyle}>
        <div style={styles.msgTop}>
          <span style={{ ...styles.msgName, color: isAI ? '#8B5CF6' : (msg.user_color || '#2a7d4b') }}>
            {msg.username}
          </span>
          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
          {isAI    && <span style={styles.aiBadge}>AI</span>}
          <span style={styles.msgTime}>{formatTime(msg.created_at)}</span>
        </div>
        {(() => {
          if (isAI) {
            // Preferred path: structured JSON card block from AI
            const { data: cardData, prose } = extractUptikCard(msg.text);
            if (cardData && cardData.type) {
              const note = prose || null;
              let card = null;
              if (cardData.type === 'earnings') {
                const latest = cardData.quarters?.[0];
                card = <EarningsCard data={{
                  ticker: cardData.ticker, price: cardData.price,
                  date: latest?.label || cardData.nextEarnings || null,
                  actual: latest?.actual ?? null, est: latest?.est ?? null,
                  beatPct: latest ? (latest.beatPct ?? 0) : 0,
                  quarters: (cardData.quarters || []).map(q => ({ label: q.label, sign: (q.beatPct ?? 0) >= 0 ? 1 : -1, pct: Math.abs(q.beatPct ?? 0), actual: q.actual ?? null, est: q.est ?? null })),
                  note,
                }} onTickerClick={onTickerClick} />;
              } else if (cardData.type === 'price') {
                card = <PriceQuoteCard data={{
                  ticker: cardData.ticker, price: cardData.price,
                  pct: cardData.changePct ?? null,
                  volume: cardData.volume || null,
                  isClose: !!cardData.isClose,
                  note,
                }} onTickerClick={onTickerClick} />;
              } else if (cardData.type === 'comparison') {
                card = <ComparisonCard data={cardData} onTickerClick={onTickerClick} />;
              } else if (cardData.type === 'valuation') {
                card = <ValuationCard data={{
                  ticker: cardData.ticker,
                  pe: cardData.pe, peg: cardData.peg ?? null,
                  netMargin: cardData.netMargin ?? null,
                  salesGrowth: cardData.salesGrowth ?? null,
                  epsGrowth: cardData.epsGrowth ?? null,
                }} onTickerClick={onTickerClick} />;
              }
              if (card) return card;
            }
            // Fallback: regex parsers against prose (if AI didn't emit JSON yet)
            const fallbackText = prose || msg.text;
            const earnings = parseEarningsCard(fallbackText);
            if (earnings) return <EarningsCard data={earnings} onTickerClick={onTickerClick} />;
            const valuation = parseValuationCard(fallbackText);
            if (valuation) return <ValuationCard data={valuation} onTickerClick={onTickerClick} />;
            const flow = parseOptionsFlowCard(fallbackText);
            if (flow) return <OptionsFlowCard data={flow} onTickerClick={onTickerClick} />;
            const quote = parsePriceQuoteCard(fallbackText);
            if (quote) return <PriceQuoteCard data={quote} onTickerClick={onTickerClick} />;
            return <div style={styles.msgText}>{parseText(fallbackText, onTickerClick)}</div>;
          }
          return <div style={styles.msgText}>{parseText(msg.text, null)}</div>;
        })()}
        {isAI && onFeedback && (
          <div style={styles.feedbackRow}>
            {feedbackGiven ? (
              <span style={styles.feedbackThanks}>{feedbackGiven === 'up' ? '👍' : '👎'} Thanks!</span>
            ) : (
              <>
                <button onClick={() => onFeedback(msg.id, 'up')} style={styles.feedbackBtn}>👍</button>
                <button onClick={() => onFeedback(msg.id, 'down')} style={styles.feedbackBtn}>👎</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Broadcast helpers ──
function detectBroadcastType(text) {
  const lower = text.toLowerCase();
  const word = (w) => new RegExp(`\\b${w}\\b`).test(lower);
  const bullish   = ['buy','call','calls','bullish','long','breakout','moon','rocket','rip','squeeze','rally','pump'];
  const bearish   = ['sell','put','puts','bearish','short','dump','crash','drop','fade','tank'];
  const watchlist = ['watch','watching','monitor','tracking','wait'];
  if (bullish.some(w => word(w)))   return 'BULLISH';
  if (bearish.some(w => word(w)))   return 'BEARISH';
  if (watchlist.some(w => word(w)) || lower.includes('eye on')) return 'WATCHLIST';
  return 'INFO';
}

function broadcastColor(type) {
  const colors = { BULLISH: '#2a7d4b', BEARISH: '#E05252', WATCHLIST: '#D4A017', INFO: '#4A90D9' };
  return colors[type] || '#2a7d4b';
}

// ── Lists sub-view ──
function ListsView({ group, isAdmin, isModerator, isOpenList, onAskAI }) {
  const isMod = isAdmin || isModerator || isOpenList;
  const [lists, setLists] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [addTickers, setAddTickers] = useState({});
  const [loading, setLoading] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [quoteData, setQuoteData] = useState({});
  const [watcherCounts, setWatcherCounts] = useState({});

  useEffect(() => {
    if (!group?.id) return;
    loadLists();
    const channel = supabase
      .channel(`lists_${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'curated_stocks' }, loadLists)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  const loadLists = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('curated_lists')
      .select('*, curated_stocks(*)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });
    if (data) {
      setLists(data);
      const allTickers = data.flatMap(l => (l.curated_stocks || []).map(s => s.ticker));
      if (allTickers.length > 0) fetchQuotes(allTickers);
      if (allTickers.length > 0) fetchWatcherCounts(allTickers);
    }
    setLoading(false);
  };

  const fetchQuotes = async (tickers) => {
    const unique = [...new Set(tickers)];
    const promises = unique.map(sym =>
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP_KEY}`)
        .then(r => r.json())
        .then(json => { const item = Array.isArray(json) ? json[0] : json; return item?.symbol ? item : null; })
        .catch(() => null)
    );
    const results = await Promise.allSettled(promises);
    const qm = {};
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) qm[r.value.symbol] = r.value; });
    setQuoteData(prev => ({ ...prev, ...qm }));
  };

  const fetchWatcherCounts = async (tickers) => {
    const unique = [...new Set(tickers)];
    const counts = {};
    for (const ticker of unique) {
      const { count } = await supabase
        .from('user_watchlist')
        .select('*', { count: 'exact', head: true })
        .eq('symbol', ticker);
      counts[ticker] = count || 0;
    }
    setWatcherCounts(counts);
  };

  const handleExpand = (stock) => {
    if (expanded === stock.id) { setExpanded(null); return; }
    setExpanded(stock.id);
    setNotesDraft(stock.notes ?? '');
  };

  const handleAddStock = async (listId) => {
    const ticker = (addTickers[listId] || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!ticker) return;
    const list = lists.find(l => l.id === listId);
    const nextRank = list?.curated_stocks?.length
      ? Math.max(...list.curated_stocks.map(s => s.ranking)) + 1 : 1;

    let score = 0;
    let notes = null;
    let thesis = null;
    try {
      const result = await scoreTicker(ticker);
      if (result) {
        score = result.score;
        thesis = result.thesis;
        notes = `P/E: ${result.pe?.toFixed(1) || 'N/A'} · PEG: ${result.peg?.toFixed(2) || 'N/A'} · Net Margin: ${result.netMargin ? (result.netMargin * 100).toFixed(1) + '%' : 'N/A'} · Sales Growth: ${result.salesGrowth != null ? result.salesGrowth + '%' : 'N/A'} · EPS Growth: ${result.epsGrowth != null ? result.epsGrowth + '%' : 'N/A'} · Beat Rate: ${result.beatRate != null ? result.beatRate + '%' : 'N/A'}`;
      }
    } catch {}

    const { error } = await supabase.from('curated_stocks').insert({
      list_id: listId, ticker, ranking: nextRank, score, notes, thesis,
    });
    if (!error) {
      setAddTickers(prev => ({ ...prev, [listId]: '' }));
      await loadLists();
    }
  };

  const handleDeleteStock = async (stock) => {
    if (!window.confirm(`Remove ${stock.ticker}?`)) return;
    await supabase.from('curated_stocks').delete().eq('id', stock.id);
    if (expanded === stock.id) setExpanded(null);
    await loadLists();
  };

  const handleSaveStock = async (stockId) => {
    if (savingStock) return;
    setSavingStock(true);
    await supabase.from('curated_stocks').update({ notes: notesDraft || null, updated_at: new Date().toISOString() }).eq('id', stockId);
    setSavingStock(false);
    await loadLists();
  };

  const formatUpdatedDate = (list) => {
    const stocks = list.curated_stocks || [];
    const dates = stocks.map(s => s.updated_at).filter(Boolean).sort().reverse();
    if (dates.length > 0) {
      return new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return new Date(list.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M6.5 7v4M9.5 7v4M3.5 4l.75 9a1 1 0 001 .9h5.5a1 1 0 001-.9L12.5 4"
        stroke="var(--red)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  if (loading) return <div style={styles.loadingWrap}><div style={styles.spinner} /></div>;

  return (
    <div style={styles.subScroll}>
      {lists.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyText}>No curated lists yet</div>
        </div>
      )}
      {lists.map(list => {
        const stockCount = list.curated_stocks?.length || 0;
        return (
          <div key={list.id} style={{ marginBottom: 20 }}>
            <div style={lv.header}>
              <div style={lv.headerRow}>
                <span style={lv.headerName}>{list.name}</span>
                <span style={lv.rankingTag}>Ranking</span>
              </div>
              <div style={lv.headerUpdated}>Updated {formatUpdatedDate(list)} · {stockCount} stocks</div>
              <div style={lv.legendToggle} onClick={() => setLegendOpen(!legendOpen)}>
                <span style={lv.legendDot} />
                {legendOpen ? 'Scoring method ▲' : 'Scoring method ▼'}
              </div>
              {legendOpen && (
                <div style={lv.legendExpanded}>
                  {['Earnings 30%','Fundamentals 25%','Sales Growth 20%','Valuation 10%','Price Trend 10%','Market Cap 5%'].map(item => (
                    <span key={item} style={lv.legendItem}>
                      <span style={lv.legendDot} />
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {isMod && (
              <div style={styles.addRow}>
                <input
                  style={styles.addInput}
                  value={addTickers[list.id] || ''}
                  onChange={e => setAddTickers(prev => ({ ...prev, [list.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddStock(list.id)}
                  placeholder="ADD TICKER"
                  maxLength={5}
                />
                <button style={styles.addBtn} onClick={() => handleAddStock(list.id)}>Add</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: '8%', flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>Ranking</span>
              <span style={{ width: '10%', flexShrink: 0 }} />
              <span style={{ width: '16%', flexShrink: 0 }} />
              <span style={{ width: '22%', flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)', textAlign: 'center' }}>Score</span>
              <span style={{ width: '34%', flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)', textAlign: 'right' }}>Price</span>
              <span style={{ width: '10%', flexShrink: 0 }} />
            </div>

            {list.curated_stocks?.sort((a, b) => a.ranking - b.ranking).map(stock => {
              const isExpanded = expanded === stock.id;
              const q = quoteData[stock.ticker];
              const pct = q?.changePercentage;
              const watchers = watcherCounts[stock.ticker] || 0;

              return (
                <div key={stock.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0', cursor: 'pointer' }} onClick={() => handleExpand(stock)}>
                    <span style={{ width: '8%', flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>#{stock.ranking}</span>
                    <div style={{ width: '10%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={`https://images.financialmodelingprep.com/symbol/${stock.ticker}.png`}
                        alt={stock.ticker}
                        style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain', background: 'var(--card2)', border: '0.5px solid var(--border)' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    </div>
                    <span style={{ width: '16%', flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{stock.ticker}</span>
                    <div style={{ width: '22%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--green-bg)', color: '#1a5c10', padding: '1px 7px', borderRadius: 10, border: '1px solid rgba(26,173,94,0.3)' }}>{stock.score}</span>
                      <span style={{ fontSize: 9, color: 'var(--text3)' }}>{isExpanded ? '▼' : '▲'}</span>
                    </div>
                    <div style={{ width: '34%', flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>{q ? `$${q.price?.toFixed(2)}` : '—'}</div>
                      {pct != null && (
                        <div style={{ fontSize: 11, color: pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </div>
                      )}
                    </div>
                    {isMod && (
                      <div style={{ width: '10%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); handleDeleteStock(stock); }}>
                        <TrashIcon />
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div style={lv.expandedBody}>
                      {stock.notes && (
                        <div style={lv.metricsRow}>
                          {stock.notes.split(' · ').map((m, i) => (
                            <span key={i} style={lv.metric}>
                              {i > 0 && '· '}
                              {m.split(': ').map((part, j) =>
                                j === 1 ? <b key={j} style={{ fontWeight: 500, color: 'var(--text1)' }}>{part}</b> : part + ': '
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {stock.thesis && (
                        <>
                          <div style={lv.thesisLabel}>Thesis</div>
                          <div style={lv.thesisText}>{stock.thesis}</div>
                        </>
                      )}
                      {isMod && (
                        <>
                          <textarea
                            style={styles.notesInput}
                            value={notesDraft}
                            onChange={e => setNotesDraft(e.target.value)}
                            placeholder="Notes, catalysts, targets..."
                          />
                          <button
                            style={{ ...styles.addBtn, width: '100%', opacity: savingStock ? 0.6 : 1 }}
                            onClick={() => handleSaveStock(stock.id)}
                            disabled={savingStock}
                          >
                            {savingStock ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      )}
                      <div style={lv.expandedFooter}>
                        <div style={lv.watchers}>
                          <b style={{ fontWeight: 500, color: 'var(--text2)' }}>{watchers}</b> members watching
                        </div>
                        <button style={lv.askAiBtn} onClick={(e) => { e.stopPropagation(); onAskAI && onAskAI(stock.ticker); }}>
                          Ask AI about {stock.ticker}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </div>
  );
}

const lv = {
  header: { padding: '12px 4px 8px', borderBottom: '1px solid var(--border)' },
  headerRow: { display: 'flex', alignItems: 'center', gap: 8 },
  headerName: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  rankingTag: { fontSize: 11, fontWeight: 600, background: 'var(--green-bg)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(26,173,94,0.3)' },
  headerUpdated: { fontSize: 11, color: 'var(--text3)', marginTop: 4 },
  legendToggle: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' },
  legendDot: { display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', marginRight: 3, flexShrink: 0 },
  legendExpanded: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' },
  legendItem: { fontSize: 11, color: 'var(--text2)', fontWeight: 500 },
  expandedBody: { padding: '10px 4px 14px', background: 'var(--card2)', borderRadius: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  metricsRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  metric: { fontSize: 11, color: 'var(--text2)' },
  thesisLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  thesisText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  expandedFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  watchers: { fontSize: 11, color: 'var(--text3)' },
  askAiBtn: { background: '#132d52', color: '#8cd9a0', border: 'none', padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
};

// ── Watchlist sub-view (global — no group filter) ──
function WatchlistView({ session, onAskAI }) {
  const [watchlist, setWatchlist] = useState([]);
  const [newTicker, setNewTicker] = useState('');
  const [quoteData, setQuoteData] = useState({});
  const [dcfData, setDcfData] = useState({});
  const [ratioData, setRatioData] = useState({});
  const [detailData, setDetailData] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [detailLoading, setDetailLoading] = useState(null);
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    const cachedQuotes = localStorage.getItem('uptik_wl_quotes');
    const cachedDcf = localStorage.getItem('uptik_wl_dcf');
    const cachedRatios = localStorage.getItem('uptik_wl_ratios');
    const cachedDetails = localStorage.getItem('uptik_wl_details');
    if (cachedQuotes) try { setQuoteData(JSON.parse(cachedQuotes)); } catch {}
    if (cachedDcf) try { setDcfData(JSON.parse(cachedDcf)); } catch {}
    if (cachedRatios) try { setRatioData(JSON.parse(cachedRatios)); } catch {}
    if (cachedDetails) try { setDetailData(JSON.parse(cachedDetails)); } catch {}
  }, []);

  useEffect(() => { loadWatchlist(); }, [session?.user?.id]);

  const loadWatchlist = async () => {
    const { data } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (data) {
      setWatchlist(data);
      if (data.length > 0) fetchBatchData(data.map(d => d.symbol));
    }
  };

  const fetchBatchData = async (symbols) => {
    if (symbols.length === 0) return;
    // Quote — individual calls (batch not supported on this plan)
    const quotePromises = symbols.map(sym =>
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP_KEY}`)
        .then(r => r.json())
        .then(json => {
          const item = Array.isArray(json) ? json[0] : json;
          return item?.symbol ? item : null;
        })
        .catch(() => null)
    );
    const quoteResults = await Promise.allSettled(quotePromises);
    const qm = {};
    quoteResults.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        qm[r.value.symbol] = r.value;
      }
    });
    setQuoteData(prev => {
      const merged = { ...prev, ...qm };
      localStorage.setItem('uptik_wl_quotes', JSON.stringify(merged));
      return merged;
    });
    // DCF — individual calls
    const dcfPromises = symbols.map(sym =>
      fetch(`https://financialmodelingprep.com/stable/discounted-cash-flow?symbol=${sym}&apikey=${FMP_KEY}`)
        .then(r => r.json())
        .then(json => {
          const item = Array.isArray(json) ? json[0] : json;
          return item?.symbol ? item : null;
        })
        .catch(() => null)
    );
    const dcfResults = await Promise.allSettled(dcfPromises);
    const dm = {};
    dcfResults.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        dm[r.value.symbol] = r.value;
      }
    });
    console.log('DCF results:', Object.keys(dm).length, 'tickers with DCF data');
    setDcfData(prev => {
      const merged = { ...prev, ...dm };
      localStorage.setItem('uptik_wl_dcf', JSON.stringify(merged));
      return merged;
    });
    // Ratios — individual calls for Fwd P/E on collapsed row
    const ratioPromises = symbols.map(sym =>
      fetch(`https://financialmodelingprep.com/stable/ratios?symbol=${sym}&limit=1&apikey=${FMP_KEY}`)
        .then(r => r.json())
        .then(json => {
          const item = Array.isArray(json) ? json[0] : json;
          return item?.symbol ? { symbol: item.symbol, pe: item.priceToEarningsRatio } : null;
        })
        .catch(() => null)
    );
    const ratioResults = await Promise.allSettled(ratioPromises);
    const rm = {};
    ratioResults.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        rm[r.value.symbol] = r.value;
      }
    });
    setRatioData(prev => {
      const merged = { ...prev, ...rm };
      localStorage.setItem('uptik_wl_ratios', JSON.stringify(merged));
      return merged;
    });
  };

  const fetchDetail = async (symbol) => {
    if (detailData[symbol]) return;
    setDetailLoading(symbol);
    const base = 'https://financialmodelingprep.com/stable';
    try {
      const [profRes, ratRes, growRes, earnRes] = await Promise.all([
        fetch(`${base}/profile?symbol=${symbol}&apikey=${FMP_KEY}`),
        fetch(`${base}/ratios?symbol=${symbol}&limit=1&apikey=${FMP_KEY}`),
        fetch(`${base}/income-statement-growth?symbol=${symbol}&limit=1&apikey=${FMP_KEY}`),
        fetch(`${base}/earnings?symbol=${symbol}&apikey=${FMP_KEY}`),
      ]);
      const [prof, rat, grow, earn] = await Promise.all([profRes.json(), ratRes.json(), growRes.json(), earnRes.json()]);
      const p = Array.isArray(prof) ? prof[0] : prof;
      const r = Array.isArray(rat) ? rat[0] : {};
      const g = Array.isArray(grow) ? grow[0] : {};
      const nextEarnings = Array.isArray(earn) ? earn.find(e => new Date(e.date) > new Date())?.date : null;
      const newDetail = {
        companyName: p?.companyName || symbol,
        sector: p?.sector || '',
        mktCap: p?.marketCap || 0,
        image: p?.image || '',
        forwardPE: r?.priceToEarningsRatio || null,
        pegRatio: r?.priceToEarningsGrowthRatio || null,
        netMargin: r?.netProfitMargin || null,
        debtEquity: r?.debtToEquityRatio || null,
        revenueGrowth: g?.revenueGrowth || null,
        epsGrowth: g?.epsgrowth || null,
        nextEarnings,
      };
      setDetailData(prev => {
        const updated = { ...prev, [symbol]: newDetail };
        localStorage.setItem('uptik_wl_details', JSON.stringify(updated));
        return updated;
      });
    } catch (e) { console.error('Detail fetch error:', e); }
    setDetailLoading(null);
  };

  const addToWatchlist = async () => {
    const sym = newTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!sym || sym.length > 5) return;
    if (watchlist.find(w => w.symbol === sym)) return;
    const { data } = await supabase
      .from('user_watchlist')
      .insert({ user_id: session.user.id, symbol: sym })
      .select()
      .single();
    if (data) {
      setWatchlist(prev => [data, ...prev]);
      setNewTicker('');
      fetchBatchData([sym]);
    }
  };

  const removeFromWatchlist = async (id) => {
    await supabase.from('user_watchlist').delete().eq('id', id);
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  const toggleExpand = (symbol) => {
    if (expanded === symbol) { setExpanded(null); return; }
    setExpanded(symbol);
    fetchDetail(symbol);
  };

  const fmtPct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
  const fmtCap = (v) => {
    if (!v) return '—';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toLocaleString()}`;
  };

  const sorted = [...watchlist].sort((a, b) => {
    if (sortBy === 'change') {
      const ca = quoteData[a.symbol]?.changePercentage || 0;
      const cb = quoteData[b.symbol]?.changePercentage || 0;
      return cb - ca;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div style={styles.subScroll}>
      {/* Sort pills */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px 4px' }}>
        {[{ key: 'recent', label: 'Recent' }, { key: 'change', label: '% Chg' }].map(s => (
          <div key={s.key} onClick={() => setSortBy(s.key)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            ...(sortBy === s.key
              ? { background: '#1a2d4a', color: '#fff' }
              : { background: '#f8fafc', border: '1px solid #d8e2ed', color: '#7a8ea3' }),
          }}>{s.label}</div>
        ))}
      </div>

      {/* Add input */}
      <div style={{ ...styles.addRow, padding: '6px 14px' }}>
        <input
          style={{ ...styles.addInput, fontSize: 14 }}
          value={newTicker}
          onChange={e => setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
          placeholder="ADD TICKER"
          maxLength={5}
        />
        <button style={{ ...styles.addBtn, fontSize: 14 }} onClick={addToWatchlist}>Add</button>
      </div>

      {watchlist.length === 0 && (
        <div style={styles.emptyWrap}>
          <div style={styles.emptyText}>Add tickers you want to track personally</div>
        </div>
      )}

      {/* Ticker cards */}
      <div style={{ padding: '0 14px' }}>
        {sorted.map(item => {
          const sym = item.symbol;
          const q = quoteData[sym] || {};
          const dcf = dcfData[sym];
          const isExp = expanded === sym;
          const det = detailData[sym];
          const price = q.price || 0;
          const chg = q.change || 0;
          const chgPct = q.changePercentage || 0;
          const isUp = chgPct >= 0;
          const dcfVal = dcf?.dcf;
          const dcfDiff = dcfVal && price ? ((dcfVal - price) / price) * 100 : null;
          const dcfUp = dcfDiff != null ? dcfDiff >= 0 : null;
          const peValue = ratioData[sym]?.pe;
          const peDisplay = (peValue != null && peValue > 0) ? peValue.toFixed(1) : 'N/A';
          const peColor = !peValue || peValue <= 0 ? '#7a8ea3' : peValue > 50 ? '#E05252' : '#1a2d4a';
          const dotColor = dcfUp === true ? '#1AAD5E' : dcfUp === false ? '#E05252' : null;

          return (
            <div key={item.id} style={ws.card} onClick={() => toggleExpand(sym)}>
              {/* Top row */}
              <div style={ws.cardTop}>
                <img
                  src={`https://images.financialmodelingprep.com/symbol/${sym}.png`}
                  alt=""
                  style={ws.logo}
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
                <div style={{ ...ws.logoFallback, display: 'none' }}>{sym.slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={ws.ticker}>{sym}</div>
                  <div style={ws.companyName}>{det?.companyName || q.name || ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={ws.price}>{price ? `$${price.toFixed(2)}` : '—'}</div>
                  <div style={{ ...ws.change, color: isUp ? '#1AAD5E' : '#E05252' }}>
                    {price ? `${chg >= 0 ? '+' : '-'}$${Math.abs(chg).toFixed(2)} (${chg >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)` : ''}
                  </div>
                </div>
              </div>
              {/* Bottom row */}
              <div style={ws.cardBottom}>
                <span style={{ fontSize: 12, color: '#7a8ea3' }}>Fwd P/E</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: peColor }}>{peDisplay}</span>
                {dotColor && <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dotColor || '#7a8ea3'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, cursor: 'pointer', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={ws.detail} onClick={e => e.stopPropagation()}>
                  {detailLoading === sym ? (
                    <div style={{ fontSize: 13, color: '#7a8ea3', padding: '10px 0', textAlign: 'center' }}>Loading fundamentals...</div>
                  ) : (
                    <>
                      {/* DCF bar */}
                      {dcfVal > 0 && price > 0 && (
                        <div style={{ ...ws.dcfBar, background: dcfUp ? 'rgba(26,173,94,0.06)' : 'rgba(224,82,82,0.04)', borderLeft: `3px solid ${dcfUp ? '#1AAD5E' : '#E05252'}` }}>
                          <div>
                            <span style={ws.dcfLabel}>DCF fair value </span>
                            <span style={ws.dcfValue}>${dcfVal.toFixed(2)}</span>
                          </div>
                          <span style={{ ...ws.dcfDiff, color: dcfUp ? '#1AAD5E' : '#E05252' }}>
                            {dcfDiff != null ? `${dcfUp ? '+' : ''}${dcfDiff.toFixed(1)}% ${dcfUp ? 'upside' : 'over'}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Smart tags */}
                      {det && (
                        <div style={ws.tagRow}>
                          {det.sector && <span style={{ ...ws.tag, background: 'rgba(74,144,217,0.1)', color: '#4A90D9' }}>{det.sector}</span>}
                          {det.nextEarnings && (() => {
                            const days = Math.ceil((new Date(det.nextEarnings) - new Date()) / 86400000);
                            if (days > 0 && days <= 14) return <span style={{ ...ws.tag, background: 'rgba(212,160,23,0.1)', color: '#D4A017' }}>ER in {days}d</span>;
                            if (days > 14) return <span style={{ ...ws.tag, background: 'rgba(212,160,23,0.1)', color: '#D4A017' }}>ER {new Date(det.nextEarnings).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
                            return null;
                          })()}
                          {dcfUp === true && <span style={{ ...ws.tag, background: 'rgba(26,173,94,0.1)', color: '#1AAD5E' }}>Undervalued</span>}
                          {dcfUp === false && <span style={{ ...ws.tag, background: 'rgba(224,82,82,0.08)', color: '#E05252' }}>Overvalued</span>}
                          {det.debtEquity != null && det.debtEquity > 1.5 && <span style={{ ...ws.tag, background: 'rgba(224,82,82,0.08)', color: '#E05252' }}>High Debt</span>}
                        </div>
                      )}

                      {/* Metric rows (no Fwd P/E — already on collapsed) */}
                      {det && [
                        { label: 'PEG ratio', value: det.pegRatio != null ? det.pegRatio.toFixed(2) : '—' },
                        { label: 'Net margin', value: fmtPct(det.netMargin) },
                        { label: 'EPS growth', value: fmtPct(det.epsGrowth), color: det.epsGrowth != null ? (det.epsGrowth >= 0 ? '#1AAD5E' : '#E05252') : null },
                        { label: 'Revenue growth', value: fmtPct(det.revenueGrowth), color: det.revenueGrowth != null ? (det.revenueGrowth >= 0 ? '#1AAD5E' : '#E05252') : null },
                        { label: 'Debt / Equity', value: det.debtEquity != null ? det.debtEquity.toFixed(2) : '—', color: det.debtEquity > 1.5 ? '#E05252' : null },
                        { label: 'Market cap', value: fmtCap(det.mktCap) },
                      ].map(m => (
                        <div key={m.label} style={ws.metricRow}>
                          <span style={ws.metricLabel}>{m.label}</span>
                          <span style={{ ...ws.metricValue, ...(m.color ? { color: m.color } : {}) }}>{m.value}</span>
                        </div>
                      ))}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button style={ws.askAiBtn} onClick={() => onAskAI && onAskAI(sym)}>Ask AI</button>
                        <button style={ws.removeBtn} onClick={() => removeFromWatchlist(item.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...styles.watchHint, padding: '10px 14px' }}>
        Tap any ticker to see fundamentals. Type $TICKER in chat to share.
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

const ws = {
  card: { background: '#f8fafc', border: '1px solid #d8e2ed', borderRadius: 10, marginBottom: 8, overflow: 'hidden', cursor: 'pointer' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 4px' },
  cardBottom: { display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 10px 50px' },
  logo: { width: 30, height: 30, borderRadius: 7, objectFit: 'contain', flexShrink: 0 },
  logoFallback: { width: 30, height: 30, borderRadius: 7, background: '#d8e2ed', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#7a8ea3', flexShrink: 0 },
  ticker: { fontSize: 15, fontWeight: 700, color: '#1a2d4a' },
  companyName: { fontSize: 12, color: '#7a8ea3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  price: { fontSize: 15, fontWeight: 600, color: '#1a2d4a' },
  change: { fontSize: 12, fontWeight: 600 },
  dcfBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', margin: '0 12px 8px', borderRadius: '0 6px 6px 0' },
  dcfLabel: { fontSize: 12, color: '#7a8ea3' },
  dcfValue: { fontSize: 14, fontWeight: 700, color: '#1a2d4a' },
  dcfDiff: { fontSize: 13, fontWeight: 700 },
  detail: { borderTop: '1px solid #d8e2ed', padding: '10px 12px', background: '#fff' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  tag: { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4 },
  metricRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eef2f7' },
  metricLabel: { fontSize: 13, color: '#7a8ea3' },
  metricValue: { fontSize: 13, fontWeight: 600, color: '#1a2d4a' },
  askAiBtn: { flex: 1, fontSize: 13, fontWeight: 600, color: '#8B5CF6', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' },
  removeBtn: { width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(224,82,82,0.06)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, cursor: 'pointer', padding: '7px 0' },
};

// ── Main ChatTab ──
export default function ChatTab({ session, profile, group, isAdmin, isModerator, setUnreadChat }) {
  const { activeGroup } = useGroup();
  const [watchlist, setWatchlist] = useState([]);
  const [subTab, setSubTab]         = useState('chat');
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiLastTicker, setAiLastTicker] = useState(null);
  const [aiMode, setAiMode]         = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [aiLoadingTicker, setAiLoadingTicker] = useState(null);

  const handleFeedback = useCallback(async (msgId, rating) => {
    setFeedbackMap(prev => ({ ...prev, [msgId]: rating }));
    // Find the AI response and the question before it
    const msgIndex = messages.findIndex(m => m.id === msgId);
    const aiMsg = messages[msgIndex];
    let question = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].user_id !== 'user_ai') { question = messages[i].text; break; }
    }
    try {
      await supabase.from('ai_feedback').insert({
        user_id: session.user.id,
        message_id: msgId,
        question: question.replace(/@AI\b/gi, '').trim(),
        response: aiMsg?.text || '',
        rating,
      });
    } catch (err) {
      console.warn('[Feedback] Save failed:', err.message);
    }
  }, [messages, session, supabase]);
  const [loading, setLoading]       = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const sendingRef     = useRef(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.user.id)
      .then(({ data }) => { if (data) setWatchlist(data.map(w => w.symbol)); });
  }, [session?.user?.id]);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText]           = useState('');
  const [sendingBroadcast, setSendingBroadcast]     = useState(false);

  useEffect(() => {
    if (!group?.id) return;
    const loadMessages = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setMessages(data.reverse().filter(m => m.type !== 'ai' && !/@AI\b/i.test(m.text)));
      setLoading(false);
    };
    loadMessages();

    const channel = supabase
      .channel(`chat_${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${group.id}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          const updated = [...prev, payload.new];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
        setUnreadChat(true);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const callAI = useCallback(async (query) => {
    setAiLoading(true);
    // Extract ticker for loading indicator — only match $TICKER format or standalone uppercase tickers
    const LOADING_IGNORE = new Set([
      'WHAT', 'WHATS', 'HOW', 'THE', 'TELL', 'ABOUT', 'TODAY', 'MARKET',
      'MOVING', 'COMPARE', 'GOOD', 'BEST', 'LAST', 'WHEN', 'DOES', 'THEIR',
      'THIS', 'THAT', 'HOT', 'RIGHT', 'TGT', 'BUY', 'SELL', 'PRICE',
      'HIGH', 'LOW', 'TOP', 'YES', 'NOW', 'JUST', 'LIKE', 'WILL',
    ]);
    const dollarTicker = query.match(/\$([A-Z]{1,5})\b/);
    const bareTicker = query.match(/\b([A-Z]{2,5})\b/);
    const extractedTicker = dollarTicker ? dollarTicker[1] : (bareTicker && !LOADING_IGNORE.has(bareTicker[1]) ? bareTicker[1] : null);
    setAiLoadingTicker(extractedTicker);
    try {
      const recentHistory = messages
        .filter(m => m.type === 'user' || m.type === 'ai')
        .slice(-10)
        .map(m => ({
          role: m.user_id === 'user_ai' ? 'assistant' : 'user',
          content: m.text,
        }));

      const { text, newLastTicker } = await askUpTikAI({
        userText: query,
        history: recentHistory,
        lastTicker: aiLastTicker,
        username: profile?.username,
        groupName: activeGroup?.name,
        watchlist,
      });
      setAiLastTicker(newLastTicker);
      await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik', user_color: '#8B5CF6',
        text, type: 'ai', is_admin: false,
      });
    } catch(err) {
      console.error('UpTik AI error:', err.message, err);
      await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: 'user_ai',
        username: 'UpTik', user_color: '#8B5CF6',
        text: `Error: ${err.message}`,
        type: 'ai', is_admin: false,
      });
    } finally {
      setAiLoading(false);
    }
  }, [group?.id, activeGroup?.name, profile?.username, watchlist, messages, aiLastTicker]);

  // Generate contextual follow-up chips based on last AI response
  const COMMON_WORDS = new Set([
    'TODAY', 'NOW', 'ALL', 'THE', 'HOW', 'WHAT', 'WHY', 'BUY', 'SELL',
    'MARKET', 'GOOD', 'BEST', 'TOP', 'HOT', 'RIGHT', 'TGT', 'YES', 'NO',
    'HIGH', 'LOW', 'TELL', 'GET', 'JUST', 'LIKE', 'WILL', 'CAN', 'THIS',
    'THAT', 'FOR', 'ARE', 'NOT', 'BUT', 'HAS', 'HAD', 'BEEN', 'DOES',
    'HOLD', 'MOVE', 'DROP', 'RISE', 'FALL', 'GAIN', 'LOSS', 'BULL', 'BEAR',
    'LONG', 'SHORT', 'SAFE', 'FREE', 'FAST', 'SLOW', 'REAL', 'SURE',
    'STOCK', 'TRADE', 'PRICE', 'SHARE', 'FUND', 'BOND', 'CASH', 'DEBT',
  ]);
  const getFollowUpChips = useCallback(() => {
    if (aiLoading) return [];
    const lastAI = [...messages].reverse().find(m => m.user_id === 'user_ai');
    if (!lastAI) return [];
    const ticker = aiLastTicker;
    if (!ticker || COMMON_WORDS.has(ticker)) return [];
    const text = lastAI.text;
    const chips = [];
    // Prefer structured JSON card type when available (reliable, no keyword guessing)
    const { data: card, prose } = extractUptikCard(text);
    const cardType = card?.type || null;
    const proseText = prose || text;
    // Stronger keyword gates for the fallback path (avoid e.g. "earnings" appearing in narrative)
    const isEarningsProse  = /\b(?:beat|miss(?:ed)?)\s*(?:by\s*)?[\d.]+\s*%|\$[\d.]+\s+vs\s+\$[\d.]+/i.test(proseText);
    const isValuationProse = /P\/E[:\s]+[\d.]+|PEG[:\s]+[\d.]+/i.test(proseText);
    const isFlowProse      = /\b[\d.]+\s*[CP]\b.*\$[\d.]+[KMB]|unusual flow|dark pool/i.test(proseText);
    const isChartProse     = /\b(support|resistance|breakout)\b.*\$[\d.]+/i.test(proseText);
    const isPriceProse     = /last close|closing price|\d+\s*[KMB]\s*shares/i.test(proseText);

    const isComparisonProse = /\b(?:vs|versus)\b.*\$?[A-Z]{1,5}/.test(proseText) || (proseText.match(/\b[A-Z]{2,5}\b/g) || []).length >= 3;
    if (cardType === 'comparison' || (isComparisonProse && cardType !== 'earnings' && cardType !== 'valuation')) {
      chips.push(`Which has the best margins?`);
      chips.push(`Which is the safer bet right now?`);
      chips.push(`Who's winning on growth?`);
    } else if (cardType === 'earnings' || isEarningsProse) {
      chips.push(`What's ${ticker}'s next catalyst?`);
      chips.push(`How did ${ticker} guide forward?`);
    } else if (cardType === 'valuation' || isValuationProse) {
      chips.push(`Is ${ticker} overvalued vs peers?`);
      chips.push(`Compare ${ticker} to its sector`);
    } else if (cardType === 'flow' || isFlowProse) {
      chips.push(`Show more ${ticker} unusual flow`);
      chips.push(`What does the dark pool say on ${ticker}?`);
    } else if (isChartProse) {
      chips.push(`What's ${ticker}'s next key level?`);
      chips.push(`Is ${ticker} in a trend?`);
    } else if (cardType === 'price' || isPriceProse) {
      chips.push(`How did ${ticker}'s last earnings go?`);
      chips.push(`What's ${ticker}'s next catalyst?`);
      chips.push(`Any unusual flow on ${ticker}?`);
    } else {
      // Pure prose with no structured signal (e.g. "I don't have data for KR")
      chips.push(`What matters most for ${ticker}?`);
      chips.push(`Compare ${ticker} to competitors`);
      chips.push(`Is ${ticker} a good buy right now?`);
    }
    return chips.slice(0, 3);
  }, [messages, aiLastTicker, aiLoading]);

  // Handle ticker click from AI responses
  const handleTickerClick = useCallback((ticker) => {
    const clean = ticker.replace('$', '');
    setAiMode(true);
    setInputText(`Tell me about ${clean}`);
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    if (sendingRef.current) return;
    const text = aiMode ? `@AI ${inputText.trim()}` : inputText.trim();
    if (!inputText.trim() || !profile || !group) return;
    sendingRef.current = true;
    try {
      setInputText('');
      setShowEmoji(false);
      inputRef.current?.blur();
      const { data, error } = await supabase.from('chat_messages').insert({
        group_id: group.id, user_id: session.user.id,
        username: profile.username, user_color: profile.color,
        text, type: 'user', is_admin: isAdmin,
      }).select().single();
      if (data) setMessages(prev => [...prev, data]);
      if (!error && /@AI\b/i.test(text)) {
        const query = text.replace(/@AI\b/gi, '').trim() || text;
        await callAI(query);
      }
    } finally {
      sendingRef.current = false;
    }
  }, [inputText, aiMode, profile, group, isAdmin, callAI, session]);

  const sendBroadcast = async () => {
    if (!broadcastText.trim() || sendingBroadcast) return;
    setSendingBroadcast(true);
    if (isAdmin) {
      await supabase.from('breakout_alerts').insert({
        alert_type: 'INFO', title: broadcastText.trim(), sent_by: profile.username,
      });
    } else {
      const type = detectBroadcastType(broadcastText);
      await supabase.from('breakout_alerts').insert({
        alert_type: type, title: broadcastText.trim(), sent_by: profile.username,
      });
    }
    setBroadcastText('');
    setSendingBroadcast(false);
    setShowBroadcastModal(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const addEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (!group) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.emptyText}>Select a group from the Home tab to start chatting.</div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>

      {/* Ticker Banner */}
      <TickerBanner groupId={group.id} />

      {/* Sub-tabs */}
      <div style={styles.subTabRow}>
        {['chat', 'lists', 'watchlist'].map(t => (
          <div
            key={t}
            style={{ ...styles.subTab, ...(subTab === t ? styles.subTabActive : {}) }}
            onClick={() => setSubTab(t)}
          >
            {t === 'chat' ? 'Chat' : t === 'lists' ? 'Lists' : `Watchlist (${watchlist.length})`}
          </div>
        ))}
      </div>

      {/* Lists view */}
      {subTab === 'lists' && (
        <ListsView group={group} isAdmin={isAdmin} isModerator={isModerator} isOpenList={group?.name === 'UpTik Public'} onAskAI={(sym) => { setSubTab('chat'); setInputText(`@AI Research $${sym}`); }} />
      )}

      {/* Watchlist view */}
      {subTab === 'watchlist' && (
        <WatchlistView session={session} onAskAI={(sym) => { setSubTab('chat'); setInputText(`@AI Research $${sym}`); }} />
      )}

      {/* Chat view */}
      {subTab === 'chat' && (
        <>
          {loading ? (
            <div style={styles.loadingWrap}>
              <div style={styles.spinner} />
            </div>
          ) : (
            <div style={styles.messagesArea}>
              {messages.length === 0 && (
                <div style={styles.emptyState}>
                  <div style={styles.emptyText}>No messages yet — say hello!</div>
                </div>
              )}
              {messages.map(msg => {
                const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
                const isAIQuestion = msg.type === 'user' && /@AI\b/i.test(msg.text);
                if (isAI) {
                  return (
                    <FadingMessage key={msg.id} delay={120000} duration={5000} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                      <MessageItem msg={msg} currentUserId={session?.user?.id} onFeedback={handleFeedback} feedbackGiven={feedbackMap[msg.id]} onTickerClick={handleTickerClick} />
                    </FadingMessage>
                  );
                }
                if (isAIQuestion) {
                  return (
                    <FadingMessage key={msg.id} onRemove={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}>
                      <MessageItem msg={msg} currentUserId={session?.user?.id} />
                    </FadingMessage>
                  );
                }
                return <MessageItem key={msg.id} msg={msg} currentUserId={session?.user?.id} />;
              })}
              {aiLoading && (
                <div style={styles.aiLoading}>
                  <span style={{ color: '#8B5CF6', fontSize: 14 }}>
                    {aiLoadingTicker ? `Pulling data for ${aiLoadingTicker}...` : 'AI is analyzing...'}
                  </span>
                  <div style={styles.aiDots}>
                    {[0,1,2].map(i => <div key={i} style={{ ...styles.aiDot, animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                </div>
              )}
              {/* Follow-up suggestion chips after AI response */}
              {!aiLoading && aiMode && getFollowUpChips().length > 0 && (
                <div style={styles.chipRow}>
                  {getFollowUpChips().map((chip, i) => (
                    <button key={i} onClick={() => { setInputText(chip); inputRef.current?.focus(); }} style={styles.chip}>
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {showEmoji && (
            <div style={styles.emojiBar}>
              {EMOJIS.map(e => (
                <button key={e} style={styles.emojiBtn} onClick={() => addEmoji(e)}>{e}</button>
              ))}
            </div>
          )}

          {/* Starter prompt chips when AI mode is active and no AI messages yet */}
          {aiMode && !aiLoading && !messages.some(m => m.user_id === 'user_ai') && (() => {
            const wl = (watchlist || []).slice(0, 2);
            const chips = ["What's moving today?"];
            if (wl.length >= 1) chips.push(`How's $${wl[0]} doing?`);
            if (wl.length >= 2) chips.push(`Compare $${wl[0]} vs $${wl[1]}`);
            if (wl.length === 0) { chips.push("Tell me about $NVDA"); chips.push("How's the market?"); }
            return (
              <div style={styles.starterChipRow}>
                {chips.map((chip, i) => (
                  <button key={i} onClick={() => { setInputText(chip.replace(/\$/g, '')); inputRef.current?.focus(); }} style={styles.starterChip}>
                    {chip}
                  </button>
                ))}
              </div>
            );
          })()}

          <div style={styles.inputBar}>
            <div
              style={{
                borderRadius: 20,
                background: aiMode ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : '#1a1a2e',
                border: aiMode ? 'none' : '1.5px solid rgba(139,92,246,0.3)',
                padding: '7px 12px',
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onClick={() => { setAiMode(prev => !prev); inputRef.current?.focus(); }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: aiMode ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>AI</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: aiMode ? '#fff' : '#8B5CF6' }}>Ask</span>
            </div>
            <input
              ref={inputRef}
              style={{ ...styles.input, borderColor: aiMode ? '#8B5CF6' : 'var(--border)' }}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={aiMode ? 'Ask UpTik AI...' : 'Message... $TICKER or @AI'}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
            />
            {(isAdmin || isModerator) && (
              <div style={{ flexShrink: 0, cursor: 'pointer', opacity: 0.5 }} onClick={() => setShowBroadcastModal(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#888"/>
                </svg>
              </div>
            )}
            <button
              style={{ ...styles.sendBtn, background: aiMode ? '#8B5CF6' : 'var(--green)', opacity: inputText.trim() ? 1 : 0.4 }}
              onClick={handleSend}
              disabled={!inputText.trim()}
            >
              ➤
            </button>
          </div>
        </>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div style={styles.modalOverlay} onClick={() => setShowBroadcastModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {isAdmin ? 'Broadcast to All Groups' : 'Send Group Alert'}
            </div>
            <textarea
              style={styles.modalInput}
              placeholder="e.g. AAPL breaking out, calls looking good"
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBroadcast(); } }}
              rows={3}
              autoFocus
            />
            {!isAdmin && (
              <div style={styles.typePreview}>
                Type: <strong style={{ color: broadcastColor(detectBroadcastType(broadcastText || '')) }}>
                  {detectBroadcastType(broadcastText || '')}
                </strong>
              </div>
            )}
            <button
              style={{ ...styles.modalSendBtn, opacity: sendingBroadcast || !broadcastText.trim() ? 0.6 : 1 }}
              onClick={sendBroadcast}
              disabled={sendingBroadcast || !broadcastText.trim()}
            >
              {sendingBroadcast ? 'Sending...' : isAdmin ? 'Send to All Groups' : 'Send to Group'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Styles ──
const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  subTabRow: {
    display: 'flex', borderBottom: '1px solid var(--border)',
    background: 'var(--card)', flexShrink: 0,
  },
  subTab: {
    flex: 1, textAlign: 'center', padding: '10px 0',
    fontSize: 13, color: 'var(--text3)',
    borderBottom: '2px solid transparent', cursor: 'pointer',
  },
  subTabActive: {
    color: 'var(--text1)', fontWeight: 600,
    borderBottomColor: 'var(--green)',
  },
  subScroll: {
    flex: 1, overflowY: 'auto',
    padding: '8px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  secLabel: {
    fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--text3)', padding: '0 4px',
    margin: '10px 0 8px',
  },
  addRow: { display: 'flex', gap: 8, marginBottom: 10 },
  addInput: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 14, fontWeight: 700,
    color: '#D4A017', fontFamily: 'var(--font)',
    outline: 'none', textTransform: 'uppercase',
    boxSizing: 'border-box',
  },
  addBtn: {
    background: 'var(--green)', color: '#fff',
    border: 'none', padding: '9px 16px',
    borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  listItem: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '10px 0',
    borderBottom: '1px solid var(--border)', gap: 10,
  },
  listTicker: { fontSize: 15, fontWeight: 700, color: 'var(--text1)' },
  removeBtn: {
    background: 'var(--red-bg)',
    border: '1px solid rgba(224,82,82,0.2)',
    color: 'var(--red)', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    flexShrink: 0,
  },
  expandedBody: {
    padding: '8px 0 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  notesInput: {
    width: '100%', background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 13, color: 'var(--text1)',
    fontFamily: 'var(--font)',
    resize: 'none', height: 72, lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  notesText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 },
  watchHint: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.2)',
    borderRadius: 8, padding: '10px 12px',
    fontSize: 12, color: 'var(--text2)',
    lineHeight: 1.5, marginTop: 14,
  },
  messagesArea: {
    flex: 1, overflowY: 'auto',
    padding: '10px 12px',
    WebkitOverflowScrolling: 'touch',
  },
  msg: { padding: '5px 0' },
  msgBody: { flex: 1 },
  adminBody: {
    background: 'var(--green-bg)',
    border: '1px solid rgba(26,173,94,0.15)',
    borderRadius: 10, padding: '8px 10px',
  },
  aiBody: {
    background: '#F5F3FF',
    border: '1px solid rgba(139,92,246,0.15)',
    borderRadius: 10, padding: '8px 10px',
  },
  feedbackRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 6, paddingTop: 6,
    borderTop: '1px solid rgba(139,92,246,0.1)',
  },
  feedbackBtn: {
    background: 'none', border: '1px solid #e2e8f0',
    borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
    fontSize: 14, lineHeight: 1,
    transition: 'background .15s',
  },
  feedbackThanks: {
    fontSize: 12, color: '#94a3b8',
  },
  msgTop: {
    display: 'flex', alignItems: 'center',
    gap: 6, marginBottom: 4, flexWrap: 'wrap',
  },
  msgName: { fontSize: 15, fontWeight: 600 },
  msgTime: { fontSize: 12, color: 'var(--text3)' },
  adminBadge: {
    background: 'var(--green-bg)', color: 'var(--green)',
    fontSize: 11, fontWeight: 700, padding: '1px 6px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.5px', border: '1px solid rgba(26,173,94,0.2)',
  },
  aiBadge: {
    background: '#F5F3FF', color: '#8B5CF6',
    fontSize: 11, fontWeight: 700, padding: '1px 6px',
    borderRadius: 3, textTransform: 'uppercase',
    letterSpacing: '0.5px', border: '1px solid rgba(139,92,246,0.2)',
  },
  msgText: {
    fontSize: 16, color: 'var(--text1)',
    lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
  },
  tickerMention: {
    background: '#FFFBEB', color: '#D4A017',
    fontSize: 14, fontWeight: 600,
    padding: '1px 6px', borderRadius: 4,
    border: '1px solid rgba(212,160,23,0.2)',
  },
  emojiBar: {
    display: 'flex', gap: 4, padding: '6px 12px',
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none',
  },
  emojiBtn: {
    fontSize: 24, cursor: 'pointer', padding: '2px 4px',
    background: 'none', border: 'none', flexShrink: 0,
  },
  inputBar: {
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    padding: '8px 12px', display: 'flex',
    gap: 6, alignItems: 'center', flexShrink: 0,
  },
  emojiToggle: {
    background: 'none', border: 'none',
    fontSize: 22, cursor: 'pointer', flexShrink: 0, padding: 2,
  },
  input: {
    flex: 1, background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    color: 'var(--text1)', padding: '10px 14px',
    borderRadius: 20, fontFamily: 'var(--font)',
    fontSize: 15, outline: 'none',
  },
  sendBtn: {
    background: 'var(--green)', border: 'none', color: '#fff',
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  loadingWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  spinner: {
    width: 24, height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  emptyState: { textAlign: 'center', padding: '40px 20px' },
  emptyWrap:  { textAlign: 'center', padding: '30px 20px' },
  emptyText:  { fontSize: 14, color: 'var(--text2)' },
  aiLoading: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
  aiDots: { display: 'flex', gap: 4 },
  aiDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: '#8B5CF6', animation: 'pulse 1.2s infinite',
  },
  chipRow: {
    display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0 8px',
  },
  chip: {
    fontSize: 12, padding: '5px 12px', borderRadius: 16,
    background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.25)',
    color: '#6D28D9', cursor: 'pointer', fontFamily: 'var(--font)',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  starterChipRow: {
    display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 12px 2px',
    background: 'var(--card)',
  },
  starterChip: {
    fontSize: 12, padding: '6px 14px', borderRadius: 18,
    background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', border: '1px solid rgba(139,92,246,0.3)',
    color: '#6D28D9', cursor: 'pointer', fontFamily: 'var(--font)',
    fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'center', zIndex: 100, padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '20px 16px 16px',
    width: '100%', maxWidth: 460, margin: '0 12px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text1)' },
  modalInput: {
    width: '100%', background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '10px 12px',
    fontSize: 14, color: 'var(--text1)',
    resize: 'none', fontFamily: 'var(--font)',
    lineHeight: 1.5, boxSizing: 'border-box',
  },
  typePreview: { fontSize: 11, color: 'var(--text3)', marginTop: -4 },
  modalSendBtn: {
    width: '100%', background: 'var(--green)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '13px 0',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
