-- ═══════════════════════════════════════════════════════════════════════
-- UPTIKALERTS — Stage 1: v_signal_cohort_stats
-- The "truth table" the algorithm reads before it decorates any alert.
-- One row per (signal_type, horizon) with cohort stats from finalized
-- Polygon-scored snapshots only. FMP-era rows are excluded so cohort
-- stats aren't contaminated by cross-vendor price drift.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_signal_cohort_stats AS
SELECT
  a.signal_type,
  s.interval_key                                                       AS horizon,
  COUNT(*)                                                             AS n_samples,
  ROUND(AVG((s.outcome = 'hit')::int)::numeric * 100, 1)               AS hit_rate_pct,
  ROUND(AVG(s.return_pct)::numeric, 2)                                 AS avg_return_pct,
  ROUND(AVG(s.return_pct) FILTER (WHERE s.outcome = 'hit')::numeric,  2) AS avg_win_pct,
  ROUND(AVG(s.return_pct) FILTER (WHERE s.outcome = 'miss')::numeric, 2) AS avg_loss_pct,
  MAX(s.tracked_at)                                                    AS last_refreshed
FROM alert_performance_snapshots s
JOIN breakout_alerts a ON a.id = s.alert_id
WHERE s.outcome IS NOT NULL
  AND s.tracked_at >= '2026-04-14T00:00:00Z'
GROUP BY a.signal_type, s.interval_key;

-- Grant read access to authenticated clients only. Earlier draft included
-- `anon` for convenience; removed because anyone hitting the public anon key
-- could then scrape the signal edge stats. Logged-in users go through the
-- `authenticated` role, which is all the app ever needs.
GRANT SELECT ON v_signal_cohort_stats TO authenticated;

COMMENT ON VIEW v_signal_cohort_stats IS
  'Per-(signal_type, horizon) cohort stats for Polygon-scored snapshots only. Powers the Stage 1 confidence algorithm.';
