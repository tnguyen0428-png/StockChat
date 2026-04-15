-- Sync breakout_alerts columns for confluence scoring system
-- Safe to run multiple times — all statements use IF NOT EXISTS

ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS conviction      text;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS sector_tier     text;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS avg_volume      bigint;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS high_52w        numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS pct_from_high   numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS gap_pct         numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS short_ma        numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS long_ma         numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS short_ma_period integer;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS long_ma_period  integer;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS volume_ratio    numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS open_price      numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS prev_close      numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS rel_volume      numeric;
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS featured        boolean DEFAULT false;
