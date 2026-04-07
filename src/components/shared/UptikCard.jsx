// ── Shared uptik card extractor + rendering ──
// Used by both the group ChatTab and the direct AITab so card rendering is consistent.
// The AI is instructed to prepend a ```uptik {...}``` fenced JSON block when it has data.

import React from 'react';

// Robust extractor: tolerates triple/single/no backticks and unterminated fences via brace matching.
export function extractUptikCard(text) {
  if (!text) return { data: null, prose: text };
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
    let tail = end + 1;
    while (text[tail] === '`') tail++;
    const prose = (text.slice(0, marker.index) + text.slice(tail)).replace(/^[`\s]+|[`\s]+$/g, '').trim();
    return { data, prose };
  } catch {
    return { data: null, prose: text };
  }
}

// Split inline "• a • b • c" into separated rows.
export function renderBulletedNote(text) {
  if (!text) return null;
  const hasBullets = /[•●]/.test(text);
  if (!hasBullets) {
    return text.split(/\n+/).map((line, i) => <div key={i} style={{ marginBottom: 4 }}>{line}</div>);
  }
  const parts = text.split(/\s*[•●]\s*/).map(s => s.trim()).filter(Boolean);
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

const tickerPill = (onClick) => ({
  fontSize: 16, fontWeight: 800, color: '#D4A017', background: '#FFFBEB',
  padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,23,0.3)',
  cursor: onClick ? 'pointer' : 'default',
});

export function EarningsCard({ data, onTickerClick }) {
  const positive = (data.beatPct ?? 0) >= 0;
  const accent = positive ? '#1AAD5E' : '#E05252';
  const bg = positive ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)';
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', borderBottom: '1px solid var(--border)' };
  const lbl = { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
  const val = { fontSize: 15, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: bg, borderBottom: `1px solid ${accent}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span onClick={() => onTickerClick && onTickerClick('$' + data.ticker)} style={tickerPill(onTickerClick)}>${data.ticker}</span>
          {data.price != null && <span style={{ fontSize: 14, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>${Number(data.price).toFixed(2)}</span>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {positive ? '▲' : '▼'} {positive ? 'BEAT' : 'MISS'} {Math.abs(data.beatPct ?? 0).toFixed(1)}%
        </span>
      </div>
      {data.date && <div style={row}><span style={lbl}>Report Date</span><span style={val}>{data.date}</span></div>}
      {data.actual != null && <div style={row}><span style={lbl}>EPS Actual</span><span style={{ ...val, color: accent }}>${Number(data.actual).toFixed(3)}</span></div>}
      {data.est != null && <div style={row}><span style={lbl}>EPS Estimate</span><span style={val}>${Number(data.est).toFixed(3)}</span></div>}
      <div style={{ ...row, borderBottom: ((data.quarters && data.quarters.length > 1) || data.note) ? '1px solid var(--border)' : 'none' }}>
        <span style={lbl}>Surprise</span>
        <span style={{ ...val, color: accent }}>{positive ? '+' : ''}{(data.beatPct ?? 0).toFixed(1)}%</span>
      </div>
      {data.quarters && data.quarters.length > 1 && (
        <div style={{ padding: '10px 12px', background: 'var(--card)' }}>
          <div style={{ ...lbl, marginBottom: 6 }}>History</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.quarters.map((q, i) => {
              const qPos = (q.sign ?? 1) >= 0;
              const qAccent = qPos ? '#1AAD5E' : '#E05252';
              const qBg = qPos ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)';
              const qPct = q.pct != null ? q.pct : Math.abs(q.beatPct ?? 0);
              return (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: qBg, border: `1px solid ${qAccent}33`, fontSize: 12, fontWeight: 600, color: qAccent, fontVariantNumeric: 'tabular-nums' }}>
                  {q.label || 'Q' + (data.quarters.length - i)} · {qPos ? '▲' : '▼'} {qPct.toFixed(1)}%
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

export function PriceQuoteCard({ data, onTickerClick }) {
  const hasPct = data.pct != null || data.changePct != null;
  const pct = data.pct != null ? data.pct : data.changePct;
  const up = hasPct ? pct >= 0 : true;
  const accent = hasPct ? (up ? '#1AAD5E' : '#E05252') : '#6D28D9';
  const bg = hasPct ? (up ? 'rgba(26,173,94,0.08)' : 'rgba(224,82,82,0.08)') : 'rgba(139,92,246,0.08)';
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: bg, borderBottom: `1px solid ${accent}33`, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => onTickerClick && onTickerClick('$' + data.ticker)} style={tickerPill(onTickerClick)}>${data.ticker}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>${Number(data.price).toFixed(2)}</span>
          {data.isClose && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>Last close</span>
          )}
        </div>
        {hasPct && (
          <span style={{ fontSize: 14, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{pct.toFixed(2)}%
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

export function ValuationCard({ data, onTickerClick }) {
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', borderBottom: '1px solid var(--border)' };
  const lbl = { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
  const val = { fontSize: 15, color: 'var(--text1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
  const signColor = (v) => v == null ? 'var(--text1)' : (v >= 0 ? '#1AAD5E' : '#E05252');
  const fmtPct = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span onClick={() => onTickerClick && onTickerClick('$' + data.ticker)} style={tickerPill(onTickerClick)}>${data.ticker}</span>
        <span style={{ fontSize: 12, color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valuation</span>
      </div>
      {data.pe != null && <div style={row}><span style={lbl}>P/E</span><span style={val}>{Number(data.pe).toFixed(1)}</span></div>}
      {data.peg != null && <div style={row}><span style={lbl}>PEG</span><span style={val}>{Number(data.peg).toFixed(2)}</span></div>}
      {data.netMargin != null && <div style={row}><span style={lbl}>Net Margin</span><span style={val}>{Number(data.netMargin).toFixed(1)}%</span></div>}
      {data.salesGrowth != null && <div style={row}><span style={lbl}>Sales Growth</span><span style={{ ...val, color: signColor(data.salesGrowth) }}>{fmtPct(data.salesGrowth)}</span></div>}
      {data.epsGrowth != null && <div style={{ ...row, borderBottom: 'none' }}><span style={lbl}>EPS Growth</span><span style={{ ...val, color: signColor(data.epsGrowth) }}>{fmtPct(data.epsGrowth)}</span></div>}
    </div>
  );
}

export function ComparisonCard({ data, onTickerClick }) {
  const peers = Array.isArray(data.peers) ? data.peers : [];
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)' }}>
      <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span onClick={() => onTickerClick && onTickerClick('$' + data.ticker)} style={tickerPill(onTickerClick)}>${data.ticker}</span>
          {data.price != null && <span style={{ fontSize: 14, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>${Number(data.price).toFixed(2)}</span>}
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
          <span onClick={() => onTickerClick && onTickerClick('$' + p.ticker)} style={{ ...tickerPill(onTickerClick), fontSize: 12, padding: '2px 6px', flexShrink: 0, lineHeight: 1.4 }}>${p.ticker}</span>
          <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, flex: 1 }}>{p.note}</span>
        </div>
      ))}
    </div>
  );
}

// Single entry point: parse the text, render the appropriate card, and any leftover prose below it.
export function UptikMessage({ text, onTickerClick, proseStyle }) {
  const { data, prose } = extractUptikCard(text);
  let card = null;
  if (data && data.type) {
    const note = prose || null;
    if (data.type === 'earnings') {
      const latest = data.quarters?.[0];
      card = <EarningsCard data={{
        ticker: data.ticker, price: data.price,
        date: latest?.label || data.nextEarnings || null,
        actual: latest?.actual ?? null, est: latest?.est ?? null,
        beatPct: latest ? (latest.beatPct ?? 0) : 0,
        quarters: (data.quarters || []).map(q => ({ label: q.label, sign: (q.beatPct ?? 0) >= 0 ? 1 : -1, pct: Math.abs(q.beatPct ?? 0), actual: q.actual ?? null, est: q.est ?? null })),
        note,
      }} onTickerClick={onTickerClick} />;
    } else if (data.type === 'price') {
      card = <PriceQuoteCard data={{ ...data, note }} onTickerClick={onTickerClick} />;
    } else if (data.type === 'valuation') {
      card = <ValuationCard data={{ ...data, note }} onTickerClick={onTickerClick} />;
    } else if (data.type === 'comparison') {
      card = <ComparisonCard data={data} onTickerClick={onTickerClick} />;
    }
  }
  if (card) {
    // Card type handles its own note rendering for earnings/price/valuation. For comparison, render leftover prose below.
    if (data.type === 'comparison' && prose) {
      return <>{card}<div style={{ marginTop: 8, ...(proseStyle || {}) }}>{renderBulletedNote(prose)}</div></>;
    }
    return card;
  }
  // No card → render plain text (with bullet handling).
  return <div style={proseStyle}>{renderBulletedNote(text)}</div>;
}
