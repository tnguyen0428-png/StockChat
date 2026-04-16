-- ═══════════════════════════════════════════════════════════════════════
-- UPTIKALERTS — Promote confluence to a first-class signal
--
-- WHY:
--   Before this migration, the confluence scanner inserted a summary row
--   with signal_type='confluence' PLUS one row per component signal
--   (signal_type='gap_up', '52w_high', etc.) for the same ticker/time.
--   Three symptoms followed from that shape:
--
--     1. Base-signal cohorts were contaminated. e.g. the 'gap_up' cohort
--        (n=140) included gap_ups that were actually confluence-tagged;
--        its hit rate no longer reflected plain gap_up behavior.
--
--     2. Confluence had no cohort bucket of its own because
--        v_signal_cohort_stats groups by signal_type — and while the
--        'confluence' signal_type technically exists, it rarely reaches
--        50 closed samples, so every confluence card shows "0 of 50".
--
--     3. Tier and component-signal breakdowns lived inside the free-text
--        `notes` column, regex-parsed at render time. Parser drifted from
--        writer (notes: "Score 87 · Tier A · …", parser: /Score:(\d+)/i
--        with a colon that's never actually written) and confluenceScore
--        came back null on every card.
--
-- WHAT THIS DOES:
--   • Adds structured columns: confluence_tier, confluence_score,
--     component_signals, is_confluence_component.
--   • Backfills confluence_tier from either the existing `conviction`
--     column or by parsing `notes`. Same for score + component signals.
--   • Marks the duplicate individual-signal rows as
--     is_confluence_component=true — they stay in the table for audit
--     purposes but the cohort view excludes them so base cohorts become
--     clean.
--   • Updates v_signal_cohort_stats to honor the new flag.
--
-- The application code (breakoutScanner.js) is updated in the same ship
-- to stop inserting the duplicate rows going forward, and to write the
-- new columns directly instead of encoding them in notes.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. New columns on breakout_alerts ─────────────────────────────────────
ALTER TABLE breakout_alerts
  ADD COLUMN IF NOT EXISTS confluence_tier text
    CHECK (confluence_tier IS NULL OR confluence_tier IN ('S','A','B','C','D')),
  ADD COLUMN IF NOT EXISTS confluence_score integer,
  ADD COLUMN IF NOT EXISTS component_signals text[],
  ADD COLUMN IF NOT EXISTS is_confluence_component boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN breakout_alerts.confluence_tier IS
  'S/A/B/C/D tier for confluence-scanned alerts. NULL for non-confluence rows.';
COMMENT ON COLUMN breakout_alerts.confluence_score IS
  'Raw 0-100 confluence score. NULL for non-confluence rows.';
COMMENT ON COLUMN breakout_alerts.component_signals IS
  'Base signals that contributed to this confluence (e.g. {gap_up,52w_high}). NULL for non-confluence rows.';
COMMENT ON COLUMN breakout_alerts.is_confluence_component IS
  'TRUE when this row is a per-signal companion row inserted alongside a confluence summary. Excluded from v_signal_cohort_stats so base cohorts aren''t contaminated.';

-- ── 2. Backfill the new columns from existing data ────────────────────────

-- 2a. Copy tier from `conviction` column (always set by the scanner) onto
--     confluence summary rows. Parse notes only as a fallback.
UPDATE breakout_alerts
SET confluence_tier = COALESCE(
      conviction,
      (regexp_match(notes, 'Tier\s+([SABCD])'))[1]
    )
WHERE signal_type = 'confluence'
  AND confluence_tier IS NULL;

-- 2b. Parse score from notes. Scanner writes e.g. "Score 87 · Tier A · RSI 55…"
UPDATE breakout_alerts
SET confluence_score = (regexp_match(notes, 'Score\s+([0-9]+)'))[1]::integer
WHERE signal_type = 'confluence'
  AND confluence_score IS NULL
  AND notes ~ 'Score\s+[0-9]+';

-- 2c. Parse component signals from notes. Scanner writes "… Signals: gap_up, 52w_high".
--     Trim/split and store as text[].
UPDATE breakout_alerts
SET component_signals = string_to_array(
      trim((regexp_match(notes, 'Signals:\s*(.+)$'))[1]),
      ', '
    )
WHERE signal_type = 'confluence'
  AND component_signals IS NULL
  AND notes ~ 'Signals:\s*';

-- 2d. Flag the duplicate individual-signal rows inserted alongside each
--     confluence summary. Scanner stamps these with
--     "Confluence scan: …" in notes, making the classification exact.
UPDATE breakout_alerts
SET is_confluence_component = true
WHERE signal_type != 'confluence'
  AND notes LIKE 'Confluence scan:%'
  AND is_confluence_component = false;

-- ── 3. Rebuild v_signal_cohort_stats with the cleanup filter ──────────────
-- Only change vs. 20260414000000: `AND NOT a.is_confluence_component`.
-- Base-signal cohorts now reflect stand-alone signal behavior, not the
-- "this signal also hit confluence" subset.
CREATE OR REPLACE VIEW v_signal_cohort_stats AS
SELECT
  a.signal_type,
  s.interval_key                                                         AS horizon,
  COUNT(*)                                                               AS n_samples,
  ROUND(AVG((s.outcome = 'hit')::int)::numeric * 100, 1)                 AS hit_rate_pct,
  ROUND(AVG(s.return_pct)::numeric, 2)                                   AS avg_return_pct,
  ROUND(AVG(s.return_pct) FILTER (WHERE s.outcome = 'hit')::numeric,  2) AS avg_win_pct,
  ROUND(AVG(s.return_pct) FILTER (WHERE s.outcome = 'miss')::numeric, 2) AS avg_loss_pct,
  MAX(s.tracked_at)                                                      AS last_refreshed
FROM alert_performance_snapshots s
JOIN breakout_alerts a ON a.id = s.alert_id
WHERE s.outcome IS NOT NULL
  AND s.tracked_at >= '2026-04-14T00:00:00Z'
  AND NOT a.is_confluence_component    -- ⇐ keeps base cohorts clean
GROUP BY a.signal_type, s.interval_key;

GRANT SELECT ON v_signal_cohort_stats TO authenticated;

COMMENT ON VIEW v_signal_cohort_stats IS
  'Per-(signal_type, horizon) cohort stats. Excludes confluence-component rows so base signals reflect stand-alone behavior. Confluence rows (signal_type=''confluence'') form their own bucket that grows as confluence scans run.';
