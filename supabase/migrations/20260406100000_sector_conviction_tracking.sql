-- ═══════════════════════════════════════════════════════════════════════
-- UPTIKALERTS — Phase 1-3: Sector Tagging, Multi-Day Conviction, Long-Term Tracking
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. TICKER SECTORS — sector + market cap mapping
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS ticker_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  company text,
  sector text NOT NULL,           -- e.g. 'AI_INFRA_COOLING', 'NUCLEAR_ENERGY'
  sector_tier integer DEFAULT 3,  -- 1=hottest, 2=strong, 3=emerging
  market_cap_b numeric,           -- market cap in billions
  last_updated timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticker_sectors_ticker ON ticker_sectors(ticker);
CREATE INDEX IF NOT EXISTS idx_ticker_sectors_sector ON ticker_sectors(sector);

ALTER TABLE ticker_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticker_sectors_read" ON ticker_sectors FOR SELECT USING (true);

-- ═══════════════════════════════════════
-- 2. SEED SECTOR DATA — ~150 tickers across all sectors
-- ═══════════════════════════════════════

-- ── Tier 1: AI Infrastructure / Cooling ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('VRT',  'Vertiv Holdings',         'AI_INFRA_COOLING', 1, 41.6),
  ('MOD',  'Modine Manufacturing',    'AI_INFRA_COOLING', 1, 6.5),
  ('TT',   'Trane Technologies',      'AI_INFRA_COOLING', 1, 80.0),
  ('JCI',  'Johnson Controls',        'AI_INFRA_COOLING', 1, 23.6),
  ('CRWV', 'CoreWeave',               'AI_INFRA_COMPUTE', 1, 25.0),
  ('AGX',  'Argan Inc',               'AI_INFRA_COMPUTE', 1, 4.3),
  ('CIFR', 'Cipher Mining',           'AI_INFRA_COMPUTE', 1, 3.5),
  ('STRL', 'Sterling Infrastructure', 'AI_INFRA_COMPUTE', 1, 7.0),
  ('ETN',  'Eaton Corporation',       'AI_INFRA_POWER',   1, 130.0),
  ('WCC',  'Wesco International',     'AI_INFRA_POWER',   1, 8.5)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 1: Nuclear / AI Power ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('CEG',  'Constellation Energy',  'NUCLEAR_ENERGY', 1, 75.0),
  ('BWXT', 'BWX Technologies',      'NUCLEAR_ENERGY', 1, 12.0),
  ('GEV',  'GE Vernova',            'NUCLEAR_ENERGY', 1, 70.0),
  ('NEE',  'NextEra Energy',        'NUCLEAR_ENERGY', 1, 150.0),
  ('D',    'Dominion Energy',       'NUCLEAR_ENERGY', 1, 45.0),
  ('PWR',  'Quanta Services',       'GRID_POWER',     1, 45.0),
  ('MTZ',  'MasTec Inc',            'GRID_POWER',     1, 12.0),
  ('EMR',  'Emerson Electric',      'GRID_POWER',     1, 65.0),
  ('XYL',  'Xylem Inc',             'GRID_POWER',     1, 30.0),
  ('FLEX', 'Flex Ltd',              'GRID_POWER',     1, 15.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 1: Memory / HBM ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('MU',   'Micron Technology',       'SEMICONDUCTORS_HBM', 1, 55.0),
  ('AMKR', 'Amkor Technology',        'SEMICONDUCTORS_HBM', 1, 7.0),
  ('TSEM', 'Tower Semiconductor',     'SEMICONDUCTORS_HBM', 1, 10.0),
  ('GFS',  'GlobalFoundries',         'SEMICONDUCTORS_HBM', 1, 25.0),
  ('LSCC', 'Lattice Semiconductor',   'SEMICONDUCTORS_HBM', 1, 7.5),
  ('MRVL', 'Marvell Technology',      'SEMICONDUCTORS_HBM', 1, 60.0),
  ('MTSI', 'MACOM Technology',        'SEMICONDUCTORS_HBM', 1, 10.0),
  ('QCOM', 'Qualcomm',               'SEMICONDUCTORS_HBM', 1, 180.0),
  ('AMAT', 'Applied Materials',       'SEMICONDUCTORS_HBM', 1, 140.0),
  ('KLAC', 'KLA Corporation',         'SEMICONDUCTORS_HBM', 1, 90.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 2: Photonics / Optical ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('IPGP', 'IPG Photonics',       'PHOTONICS_OPTICAL', 2, 5.0),
  ('LITE', 'Lumentum Holdings',   'PHOTONICS_OPTICAL', 2, 5.5),
  ('COHR', 'Coherent Corp',       'PHOTONICS_OPTICAL', 2, 15.0),
  ('IIVI', 'II-VI / Coherent',    'PHOTONICS_OPTICAL', 2, 15.0),
  ('ANET', 'Arista Networks',     'PHOTONICS_OPTICAL', 2, 100.0),
  ('CIEN', 'Ciena Corporation',   'PHOTONICS_OPTICAL', 2, 8.0),
  ('VIAV', 'Viavi Solutions',     'PHOTONICS_OPTICAL', 2, 3.5),
  ('FNSR', 'Finisar',             'PHOTONICS_OPTICAL', 2, 4.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 2: Agentic AI Platforms ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('PATH', 'UiPath',              'AGENTIC_AI', 2, 15.0),
  ('INOD', 'Innodata Inc',        'AGENTIC_AI', 2, 3.0),
  ('QLYS', 'Qualys Inc',          'AGENTIC_AI', 2, 5.0),
  ('AI',   'C3.ai',               'AGENTIC_AI', 2, 4.0),
  ('BBAI', 'BigBear.ai',          'AGENTIC_AI', 2, 3.0),
  ('SOUN', 'SoundHound AI',       'AGENTIC_AI', 2, 5.0),
  ('UPST', 'Upstart Holdings',    'AGENTIC_AI', 2, 5.0),
  ('DDOG', 'Datadog',             'AGENTIC_AI', 2, 40.0),
  ('ESTC', 'Elastic NV',          'AGENTIC_AI', 2, 10.0),
  ('MDB',  'MongoDB',             'AGENTIC_AI', 2, 15.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 2: Defense AI / Autonomous ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('AVAV', 'AeroVironment',        'DEFENSE_AI', 2, 8.0),
  ('TDY',  'Teledyne Technologies','DEFENSE_AI', 2, 30.0),
  ('RDW',  'Redwire Corporation',  'DEFENSE_AI', 2, 4.5),
  ('RCAT', 'Red Cat Holdings',     'DEFENSE_AI', 2, 3.0),
  ('KTOS', 'Kratos Defense',       'DEFENSE_AI', 2, 5.5),
  ('BWXT', 'BWX Tech (Defense)',   'DEFENSE_AI', 2, 12.0),
  ('HII',  'Huntington Ingalls',   'DEFENSE_AI', 2, 10.0),
  ('LHX',  'L3Harris Technologies','DEFENSE_AI', 2, 45.0),
  ('NOC',  'Northrop Grumman',     'DEFENSE_AI', 2, 70.0),
  ('LDOS', 'Leidos Holdings',      'DEFENSE_AI', 2, 20.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 3: Quantum Computing ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('IONQ', 'IonQ Inc',           'QUANTUM', 3, 12.0),
  ('QBTS', 'D-Wave Quantum',     'QUANTUM', 3, 3.0),
  ('RGTI', 'Rigetti Computing',  'QUANTUM', 3, 3.5),
  ('QUBT', 'Quantum Computing',  'QUANTUM', 3, 3.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 3: Robotics / Automation ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('ROK',  'Rockwell Automation',  'ROBOTICS', 3, 40.0),
  ('TER',  'Teradyne',             'ROBOTICS', 3, 18.0),
  ('ZBRA', 'Zebra Technologies',   'ROBOTICS', 3, 15.0),
  ('ISRG', 'Intuitive Surgical',   'ROBOTICS', 3, 170.0),
  ('BRKS', 'Brooks Automation',    'ROBOTICS', 3, 5.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 3: Space / Satellite ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('RKLB', 'Rocket Lab',          'SPACE_SAT', 3, 10.0),
  ('IRDM', 'Iridium Comms',       'SPACE_SAT', 3, 6.0),
  ('GSAT', 'Globalstar',          'SPACE_SAT', 3, 3.0),
  ('ASTS', 'AST SpaceMobile',     'SPACE_SAT', 3, 3.0),
  ('VSAT', 'Viasat',              'SPACE_SAT', 3, 3.5)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 3: Biotech AI ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('RXRX', 'Recursion Pharma',    'BIOTECH_AI', 3, 3.0),
  ('ABCL', 'AbCellera',           'BIOTECH_AI', 3, 3.0),
  ('ABSI', 'Absci Corp',          'BIOTECH_AI', 3, 3.0),
  ('CRL',  'Charles River Labs',  'BIOTECH_AI', 3, 15.0),
  ('VEEV', 'Veeva Systems',       'BIOTECH_AI', 3, 35.0),
  ('IQVIA','Iqvia Holdings',      'BIOTECH_AI', 3, 25.0)
ON CONFLICT (ticker) DO NOTHING;

-- ── Tier 3: Battery / Energy Storage ──
INSERT INTO ticker_sectors (ticker, company, sector, sector_tier, market_cap_b) VALUES
  ('BE',   'Bloom Energy',        'ENERGY_STORAGE', 3, 5.0),
  ('FLNC', 'Fluence Energy',      'ENERGY_STORAGE', 3, 6.0),
  ('EOSE', 'Eos Energy',          'ENERGY_STORAGE', 3, 3.0),
  ('FSLR', 'First Solar',         'ENERGY_STORAGE', 3, 20.0),
  ('ENPH', 'Enphase Energy',      'ENERGY_STORAGE', 3, 10.0),
  ('SEDG', 'SolarEdge',           'ENERGY_STORAGE', 3, 3.5)
ON CONFLICT (ticker) DO NOTHING;

-- ═══════════════════════════════════════
-- 3. ADD SECTOR COLUMN TO breakout_alerts
-- ═══════════════════════════════════════
ALTER TABLE breakout_alerts
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS conviction text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS sector_tier integer;

CREATE INDEX IF NOT EXISTS idx_breakout_alerts_sector ON breakout_alerts(sector);
CREATE INDEX IF NOT EXISTS idx_breakout_alerts_conviction ON breakout_alerts(conviction);

-- ═══════════════════════════════════════
-- 4. TICKER ACTIVITY LOG — multi-day tracking
-- Tracks daily rollups per ticker for dark pool + options
-- Used to detect 3-out-of-5-day patterns
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS ticker_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  activity_type text NOT NULL,      -- 'options' or 'darkpool'
  trading_date date NOT NULL,
  trade_count integer DEFAULT 0,
  total_premium numeric DEFAULT 0,  -- sum of options premium (options only)
  total_dp_value numeric DEFAULT 0, -- sum of dark pool dollar value (darkpool only)
  net_direction text,               -- 'bullish', 'bearish', 'neutral'
  created_at timestamptz DEFAULT now(),
  UNIQUE(ticker, activity_type, trading_date)
);

CREATE INDEX IF NOT EXISTS idx_activity_log_ticker_date ON ticker_activity_log(ticker, trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON ticker_activity_log(trading_date DESC);

ALTER TABLE ticker_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_read" ON ticker_activity_log FOR SELECT USING (true);

-- ═══════════════════════════════════════
-- 5. ALERT PERFORMANCE SNAPSHOTS — multi-interval tracking
-- Tracks returns at 1d, 3d, 7d, 14d, 30d
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS alert_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES breakout_alerts(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  interval_key text NOT NULL,       -- '1d', '3d', '7d', '14d', '30d'
  alert_price numeric NOT NULL,     -- price at alert time (denormalized for fast reads)
  snapshot_price numeric,           -- price at this interval
  return_pct numeric,               -- ((snapshot_price - alert_price) / alert_price) * 100
  outcome text,                     -- 'hit' or 'miss' (hit = return_pct > threshold)
  tracked_at timestamptz,           -- when snapshot was taken
  created_at timestamptz DEFAULT now(),
  UNIQUE(alert_id, interval_key)
);

CREATE INDEX IF NOT EXISTS idx_perf_snapshots_alert ON alert_performance_snapshots(alert_id);
CREATE INDEX IF NOT EXISTS idx_perf_snapshots_ticker ON alert_performance_snapshots(ticker);
CREATE INDEX IF NOT EXISTS idx_perf_snapshots_interval ON alert_performance_snapshots(interval_key);

ALTER TABLE alert_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_snapshots_read" ON alert_performance_snapshots FOR SELECT USING (true);

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE ticker_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE alert_performance_snapshots;

-- ═══════════════════════════════════════
-- 6. AUTO-CREATE PERFORMANCE SNAPSHOTS
-- When a breakout alert is created, pre-create
-- pending snapshot rows for all intervals
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_create_performance_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alert_performance_snapshots (alert_id, ticker, interval_key, alert_price)
  VALUES
    (NEW.id, COALESCE(NEW.ticker, '—'), '1d',  COALESCE(NEW.price, 0)),
    (NEW.id, COALESCE(NEW.ticker, '—'), '3d',  COALESCE(NEW.price, 0)),
    (NEW.id, COALESCE(NEW.ticker, '—'), '7d',  COALESCE(NEW.price, 0)),
    (NEW.id, COALESCE(NEW.ticker, '—'), '14d', COALESCE(NEW.price, 0)),
    (NEW.id, COALESCE(NEW.ticker, '—'), '30d', COALESCE(NEW.price, 0))
  ON CONFLICT (alert_id, interval_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_create_perf_snapshots
  AFTER INSERT ON breakout_alerts
  FOR EACH ROW EXECUTE FUNCTION auto_create_performance_snapshots();

-- ═══════════════════════════════════════
-- 7. SECTOR DISPLAY LABELS
-- Register sector types in alert_types for filter pills
-- ═══════════════════════════════════════
INSERT INTO alert_types (type_key, label, color, icon, position) VALUES
  ('sector:AI_INFRA_COOLING',  'AI Cooling',       '#06B6D4', '❄️', 10),
  ('sector:AI_INFRA_COMPUTE',  'AI Compute',       '#8B5CF6', '🖥️', 11),
  ('sector:AI_INFRA_POWER',    'AI Power',         '#F59E0B', '⚡', 12),
  ('sector:NUCLEAR_ENERGY',    'Nuclear',          '#10B981', '☢️', 13),
  ('sector:GRID_POWER',        'Grid/Power',       '#EF4444', '🔌', 14),
  ('sector:SEMICONDUCTORS_HBM','Memory/HBM',       '#3B82F6', '💾', 15),
  ('sector:PHOTONICS_OPTICAL', 'Photonics',        '#EC4899', '💡', 16),
  ('sector:AGENTIC_AI',        'Agentic AI',       '#6366F1', '🧠', 17),
  ('sector:DEFENSE_AI',        'Defense AI',       '#78716C', '🛡️', 18),
  ('sector:QUANTUM',           'Quantum',          '#A855F7', '⚛️', 19),
  ('sector:ROBOTICS',          'Robotics',         '#F97316', '🤖', 20),
  ('sector:SPACE_SAT',         'Space/Sat',        '#0EA5E9', '🛰️', 21),
  ('sector:BIOTECH_AI',        'Biotech AI',       '#84CC16', '🧬', 22),
  ('sector:ENERGY_STORAGE',    'Energy Storage',   '#FBBF24', '🔋', 23)
ON CONFLICT (type_key) DO NOTHING;

-- ═══════════════════════════════════════
-- 8. HELPER VIEW: Multi-day conviction check
-- Returns tickers with 3+ active days in last 5 trading days
-- ═══════════════════════════════════════
CREATE OR REPLACE VIEW v_multi_day_conviction AS
SELECT
  ticker,
  activity_type,
  COUNT(DISTINCT trading_date) AS active_days,
  SUM(trade_count) AS total_trades,
  SUM(total_premium) AS total_premium,
  SUM(total_dp_value) AS total_dp_value,
  MAX(trading_date) AS last_active
FROM ticker_activity_log
WHERE trading_date >= CURRENT_DATE - INTERVAL '7 days'  -- ~5 trading days
GROUP BY ticker, activity_type
HAVING COUNT(DISTINCT trading_date) >= 3;
