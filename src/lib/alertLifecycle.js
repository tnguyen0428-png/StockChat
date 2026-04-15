// ============================================
// UPTIKALERTS — alertLifecycle.js
// Pure helpers that turn (alert, perf_row, cohort_stats) into the
// lifecycle display state for one card. No supabase, no React, no
// side effects — so this is easy to test and to swap out for the
// Stage 2 pre-computed fields once the enrichment pipeline lands.
// ============================================

import { confidenceLabel } from './signalConfidence';

// Tune points for the lifecycle state machine. All thresholds live here
// so the UI renderer never has to know about them.
export const JUST_FIRED_MAX_MIN = 15;
export const WINDOW_HOURS_1D    = 20;  // typical 1d "outcome window" tracked by edge fn
export const NEAR_PEAK_FRACTION = 0.85;  // within 85% of avg_win_pct → near peak

// Minutes in a human-friendly form: "45m" / "3h" / "1d 4h"
export function humanDuration(mins) {
  if (mins == null || !Number.isFinite(mins)) return '';
  const m = Math.max(0, Math.round(mins));
  if (m < 60)    return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  if (h < 24)    return rm > 0 && h < 6 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h - d * 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function signedPct(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;
}

/**
 * Compute the lifecycle display state for a single alert.
 *
 * @param {object} alert                - row from breakout_alerts
 * @param {object|null} perfRow         - matching row from alert_performance (or null)
 * @param {object|null} cohort          - row from v_signal_cohort_stats for (signal_type, '1d'), or null
 * @param {number} [nowMs]              - injected clock for testing
 * @returns {object} { stage, statusText, subText, dotColor, isAction, confidence }
 */
export function lifecycleStateFor(alert, perfRow, cohort, nowMs = Date.now()) {
  const createdMs = alert?.created_at ? new Date(alert.created_at).getTime() : nowMs;
  const ageMin    = Math.max(0, (nowMs - createdMs) / 60000);

  // Current move on the alert. Same precedence as mapAlert in AlertsTabRedesign.
  const changePct = Number(
    alert?.change ?? alert?.change_pct ?? alert?.gap_pct ?? 0
  );

  // Cohort-derived confidence line. If the cohort is missing or too small,
  // label resolves to 'Insufficient' and the UI shows the muted fallback.
  const n    = Number(cohort?.n_samples ?? NaN);
  const hit  = Number(cohort?.hit_rate_pct ?? NaN);
  const label = confidenceLabel(n, hit);
  const confidence = {
    label,
    hitRatePct: Number.isFinite(hit) ? hit : null,
    nSamples:   Number.isFinite(n) ? n : null,
    horizon:    cohort?.horizon || '1d',
    avgWinPct:  cohort?.avg_win_pct ?? null,
    avgReturnPct: cohort?.avg_return_pct ?? null,
  };

  // ── Closed? ──
  if (perfRow && perfRow.outcome) {
    const closedPct = Number(perfRow.return_pct ?? changePct);
    const isWin = perfRow.outcome === 'hit' && closedPct >= 0;
    const closedIn = perfRow.tracked_at
      ? humanDuration((new Date(perfRow.tracked_at).getTime() - createdMs) / 60000)
      : '1d';
    return {
      stage: isWin ? 'closed_winner' : 'closed_miss',
      statusText: isWin ? 'Closed · winner' : 'Closed · miss',
      subText: `${signedPct(closedPct) ?? '—'} in ${closedIn}`,
      dotColor: isWin ? 'win' : 'loss',
      isAction: false,
      confidence,
    };
  }

  // ── Window expired without outcome? ──
  // Edge function tracks 1d at 20h. If we're past 24h and still no perfRow,
  // show a quiet "window closed" rather than pretend it's still live.
  if (ageMin >= 24 * 60) {
    return {
      stage: 'expired',
      statusText: 'Window closed',
      subText: 'no outcome recorded yet',
      dotColor: 'idle',
      isAction: false,
      confidence,
    };
  }

  // ── Cohort-derived states only fire when the cohort is trustworthy ──
  // If confidence.label is 'Insufficient' (sample count below the floor),
  // every downstream state that makes a "similar setups" claim degrades
  // to the plain "Live · on track" message. Consistency with the confidence
  // line: we never surface cohort-backed copy unless the cohort has enough
  // history to back it up.
  const cohortTrustworthy = label !== 'Insufficient';

  // ── Just fired ──
  if (ageMin < JUST_FIRED_MAX_MIN) {
    const typicalPeak = cohortTrustworthy && Number.isFinite(Number(cohort?.avg_win_pct))
      ? signedPct(cohort.avg_win_pct, 1)
      : null;
    return {
      stage: 'just_fired',
      statusText: 'Just fired',
      subText: typicalPeak ? `typical peak ${typicalPeak} in ~${WINDOW_HOURS_1D}h` : `window: ${WINDOW_HOURS_1D}h`,
      dotColor: 'idle',
      isAction: false,
      confidence,
    };
  }

  // ── Near typical peak (action card) ──
  // Only flag near-peak if we have a trustworthy cohort benchmark AND the
  // current move is within NEAR_PEAK_FRACTION of the typical winning move.
  // This is the "open the app" moment — push-notification trigger.
  const avgWin = Number(cohort?.avg_win_pct);
  if (cohortTrustworthy && Number.isFinite(avgWin) && avgWin > 0 && changePct >= avgWin * NEAR_PEAK_FRACTION) {
    return {
      stage: 'near_peak',
      statusText: 'Near typical peak',
      subText: `similar setups avg ${signedPct(avgWin, 1)} here`,
      dotColor: 'warn',
      isAction: true,
      confidence,
    };
  }

  // ── Live · below typical ──
  // Same gate — don't tell a user their alert is lagging based on 8 samples.
  const avgReturn = Number(cohort?.avg_return_pct);
  if (cohortTrustworthy && ageMin >= 120 && Number.isFinite(avgReturn) && changePct < avgReturn - 0.3) {
    const at = Math.round(ageMin / 60);
    return {
      stage: 'live_below',
      statusText: 'Live · below typical',
      subText: `similar were ${signedPct(avgReturn, 1)} by ${at}h`,
      dotColor: 'live',
      isAction: false,
      confidence,
    };
  }

  // ── Live · on track (catch-all in-window state) ──
  const remainingMin = Math.max(0, WINDOW_HOURS_1D * 60 - ageMin);
  return {
    stage: 'live_on_track',
    statusText: 'Live · on track',
    subText: `${humanDuration(ageMin)} in · ${humanDuration(remainingMin)} left in window`,
    dotColor: 'live',
    isAction: false,
    confidence,
  };
}

// Feature-flag helper: read the dev flag from localStorage.
// Set with:  localStorage.setItem('uptik_dev_mode', '1')
export function isDevMode() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try { return window.localStorage.getItem('uptik_dev_mode') === '1'; }
  catch { return false; }
}

export function getLifecycleView() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try { return window.localStorage.getItem('uptik_lifecycle_view') === '1'; }
  catch { return false; }
}
export function setLifecycleView(on) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem('uptik_lifecycle_view', on ? '1' : '0'); } catch {}
}
