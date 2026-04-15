// ============================================
// UPTIKALERTS — DevCohortStatsPage.jsx
// Stage 1 "truth table" — renders v_signal_cohort_stats live.
// This is a dev surface: we look at it before building anything else on top.
// NOT linked from the main UI. Reach it by URL: /dev/cohort-stats
// ============================================

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  confidenceLabel,
  CONFIDENCE_COLORS,
  MIN_SAMPLES_FLOOR,
  MIN_SAMPLES_STRONG,
  HIT_RATE_STRONG,
  HIT_RATE_MIXED,
} from '../lib/signalConfidence';

// Sort order: signal_type alphabetical, then horizon 1d → 3d → 7d → 14d → 30d
const HORIZON_ORDER = { '1d': 1, '3d': 2, '7d': 3, '14d': 4, '30d': 5 };

function fmtPct(n, { signed = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const s = signed && v >= 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function Badge({ label }) {
  const c = CONFIDENCE_COLORS[label] || CONFIDENCE_COLORS.Insufficient;
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: c.bg,
      color: c.fg,
      letterSpacing: 0.2,
    }}>{label}</span>
  );
}

export default function DevCohortStatsPage() {
  const [rows, setRows]       = useState(null);   // null = loading
  const [error, setError]     = useState(null);
  const [refreshAt, setRefreshAt] = useState(0);  // used to re-trigger fetch

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabase
        .from('v_signal_cohort_stats')
        .select('*');
      if (cancelled) return;
      if (error) { setError(error.message); setRows([]); return; }
      const sorted = [...(data || [])].sort((a, b) => {
        const s = (a.signal_type || '').localeCompare(b.signal_type || '');
        if (s !== 0) return s;
        return (HORIZON_ORDER[a.horizon] || 99) - (HORIZON_ORDER[b.horizon] || 99);
      });
      setRows(sorted);
    })();
    return () => { cancelled = true; };
  }, [refreshAt]);

  // ── Summary: total samples + sample-size distribution across cohorts ──
  const totalSamples = (rows || []).reduce((a, r) => a + (r.n_samples || 0), 0);
  const shippable = (rows || []).filter(r => {
    const label = confidenceLabel(r.n_samples, r.hit_rate_pct);
    return label === 'Strong' || label === 'Mixed';
  }).length;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--text1)',
      padding: 24,
      fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, margin: 0, letterSpacing: -0.2 }}>
            Stage 1 — v_signal_cohort_stats
          </h1>
          <button
            onClick={() => setRefreshAt(Date.now())}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text2)',
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >Refresh</button>
        </div>
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>
          Live cohort stats from finalized Polygon-scored snapshots. Numbers come straight from the DB view — no client-side math.
        </div>

        {/* Summary strip */}
        {rows && rows.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 16,
          }}>
            <Stat label="Cohorts" value={rows.length} />
            <Stat label="Total samples" value={totalSamples.toLocaleString()} />
            <Stat label="Shippable (Strong + Mixed)" value={`${shippable} / ${rows.length}`} />
          </div>
        )}

        {/* Table */}
        <div style={{
          background: 'var(--card, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {error && (
            <div style={{ padding: 16, color: '#c0392b', fontSize: 13 }}>
              Error: {error}
            </div>
          )}
          {rows === null && !error && (
            <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          )}
          {rows && rows.length === 0 && !error && (
            <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>
              No cohort data yet. The view is empty — either the migration hasn't been applied, or no snapshots have been tracked with tracked_at ≥ 2026-04-14.
            </div>
          )}
          {rows && rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f3f9' }}>
                  <Th>Signal</Th>
                  <Th>Horizon</Th>
                  <Th align="right">Samples</Th>
                  <Th align="right">Hit rate</Th>
                  <Th align="right">Avg return</Th>
                  <Th align="right">Avg win</Th>
                  <Th align="right">Avg loss</Th>
                  <Th>Confidence</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const label = confidenceLabel(r.n_samples, r.hit_rate_pct);
                  const isLast = i === rows.length - 1;
                  return (
                    <tr key={`${r.signal_type}-${r.horizon}`}>
                      <Td isLast={isLast}><strong>{r.signal_type}</strong></Td>
                      <Td isLast={isLast}>{r.horizon}</Td>
                      <Td isLast={isLast} align="right" mono>{r.n_samples}</Td>
                      <Td isLast={isLast} align="right" mono>
                        {r.hit_rate_pct != null ? `${Number(r.hit_rate_pct).toFixed(1)}%` : '—'}
                      </Td>
                      <Td isLast={isLast} align="right" mono color={Number(r.avg_return_pct) >= 0 ? '#1f9d55' : '#c0392b'}>
                        {fmtPct(r.avg_return_pct, { signed: true })}
                      </Td>
                      <Td isLast={isLast} align="right" mono color="#1f9d55">
                        {fmtPct(r.avg_win_pct, { signed: true })}
                      </Td>
                      <Td isLast={isLast} align="right" mono color="#c0392b">
                        {fmtPct(r.avg_loss_pct, { signed: true })}
                      </Td>
                      <Td isLast={isLast}><Badge label={label} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rule legend */}
        <div style={{
          fontSize: 11,
          letterSpacing: 0.8,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          fontWeight: 700,
          margin: '24px 0 8px 0',
        }}>Confidence rule (single source of truth)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <RuleCell label="Strong"       rule={`n ≥ ${MIN_SAMPLES_STRONG} & hit_rate ≥ ${HIT_RATE_STRONG}%`} />
          <RuleCell label="Mixed"        rule={`n ≥ ${MIN_SAMPLES_FLOOR} & hit_rate ≥ ${HIT_RATE_MIXED}%`} />
          <RuleCell label="Weak"         rule={`n ≥ ${MIN_SAMPLES_FLOOR} & hit_rate < ${HIT_RATE_MIXED}%`} />
          <RuleCell label="Insufficient" rule={`n < ${MIN_SAMPLES_FLOOR}`} />
        </div>

      </div>
    </div>
  );
}

// ── Small helpers (kept inline so this file stays one-shot readable) ──

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      textAlign: align,
      color: 'var(--text3)',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left', mono = false, color, isLast = false }) {
  return (
    <td style={{
      textAlign: align,
      padding: '11px 12px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      color,
    }}>{children}</td>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: 'var(--card, #fff)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text3)', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function RuleCell({ label, rule }) {
  return (
    <div style={{
      background: 'var(--card, #fff)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 12,
    }}>
      <Badge label={label} />
      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: '"SF Mono", Menlo, monospace', marginTop: 4 }}>
        {rule}
      </div>
    </div>
  );
}
