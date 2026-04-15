// ============================================
// UPTIKALERTS — signalConfidence.js
// Single source of truth for cohort → confidence label bucketing.
// Used by the dev truth-table page today; will be called by the alert
// trigger pipeline (Stage 2) and the card renderer (Stage 3).
// If thresholds change, change them here — nowhere else.
// ============================================

// Minimum cohort sizes. Below the floor we refuse to show numbers at all —
// showing a "68%" hit rate backed by 15 trades would be dishonest and
// app-store reviewable.
export const MIN_SAMPLES_FLOOR = 50;          // below this → Insufficient
export const MIN_SAMPLES_STRONG = 100;        // Strong needs 2× the floor

// Hit-rate cutoffs. These map onto the four-tier UI label.
export const HIT_RATE_STRONG = 65;
export const HIT_RATE_MIXED  = 55;

/**
 * Bucket a single cohort row into a user-facing confidence label.
 *
 * @param {number} nSamples    - cohort size
 * @param {number} hitRatePct  - 0..100
 * @returns {'Strong'|'Mixed'|'Weak'|'Insufficient'}
 */
export function confidenceLabel(nSamples, hitRatePct) {
  // Supabase returns Postgres `numeric` columns as JS strings by default, so
  // upstream callers pass us "86" / "62.5" instead of 86 / 62.5. Coerce once
  // here so the rest of the function stays numeric. Non-numeric input
  // (null, undefined, "") still falls through to Insufficient below.
  const n  = Number(nSamples);
  const hr = Number(hitRatePct);
  if (!Number.isFinite(n) || n < MIN_SAMPLES_FLOOR) return 'Insufficient';
  if (!Number.isFinite(hr)) return 'Insufficient';
  if (n >= MIN_SAMPLES_STRONG && hr >= HIT_RATE_STRONG) return 'Strong';
  if (hr >= HIT_RATE_MIXED) return 'Mixed';
  return 'Weak';
}

// Palette hook for the four labels. Kept here so downstream components
// can't drift on color meanings.
export const CONFIDENCE_COLORS = {
  Strong:       { bg: '#e6f4ec', fg: '#1f9d55' },
  Mixed:        { bg: '#fdf2de', fg: '#c47a00' },
  Weak:         { bg: '#fbe7e4', fg: '#c0392b' },
  Insufficient: { bg: '#eceff5', fg: '#8a95a7' },
};
