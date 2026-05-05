-- ═══════════════════════════════════════════════════════════════════════
-- Exclude dead-lettered snapshots from v_signal_cohort_stats.
--
-- track-alert-performance now writes outcome='no_data' for snapshots that
-- stay un-priced past DEAD_LETTER_THRESHOLD_HOURS (delisted tickers like
-- PXD, MRO, ATVI). The previous view filtered `outcome IS NOT NULL`, which
-- would have counted no_data rows in n_samples and treated them as misses
-- in hit_rate_pct (since (outcome='hit')::int = 0). Tightening to
-- IN ('hit','miss') keeps cohort stats faithful to actually-scored rows.
--
-- Re-emits the body of 20260415120000_confluence_first_class.sql verbatim
-- aside from the outcome filter — CREATE OR REPLACE so existing grants
-- and the comment from that migration carry through unchanged.
-- ═══════════════════════════════════════════════════════════════════════

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
WHERE s.outcome IN ('hit', 'miss')
  AND s.tracked_at >= '2026-04-14T00:00:00Z'
  AND NOT a.is_confluence_component
GROUP BY a.signal_type, s.interval_key;

GRANT SELECT ON v_signal_cohort_stats TO authenticated;
