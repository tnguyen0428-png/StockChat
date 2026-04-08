-- Add featured flag to breakout_alerts for history tracking
-- Only top 3-4 alerts per day (the ones shown as poker chips) get featured = true
ALTER TABLE breakout_alerts ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- Index for fast history queries
CREATE INDEX IF NOT EXISTS idx_breakout_alerts_featured ON breakout_alerts (featured) WHERE featured = true;

-- RLS policy to allow updating the featured flag
CREATE POLICY "alerts_update_all" ON breakout_alerts FOR UPDATE USING (true) WITH CHECK (true);
