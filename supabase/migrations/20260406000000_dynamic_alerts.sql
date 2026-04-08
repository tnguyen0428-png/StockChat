-- ============================================
-- Migration: Dynamic Alerts System
-- New tables for alert performance tracking,
-- options flow, dark pool, and dynamic filter types
-- Run in Supabase SQL editor
-- ============================================

-- ═══════════════════════════════════════
-- 1. ALERT TYPES (dynamic filter registry)
-- New scanner types auto-register here
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS alert_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key    text UNIQUE NOT NULL,       -- e.g. '52w_high', 'vol_surge', 'gap_up'
  label       text NOT NULL,              -- e.g. 'Yearly High', 'Volume Spike'
  color       text DEFAULT '#2563eb',     -- hex color for filter pill
  icon        text DEFAULT '📊',          -- emoji icon
  position    integer DEFAULT 99,         -- sort order in filter bar
  is_active   boolean DEFAULT true,       -- hide without deleting
  created_at  timestamptz DEFAULT now()
);

-- Seed with existing scanner types
INSERT INTO alert_types (type_key, label, color, icon, position) VALUES
  ('52w_high',   '52W High (5%)',       '#D97706', '⚡', 1),
  ('vol_surge',  'Vol Surge (2x Avg)',  '#7C3AED', '🔥', 2),
  ('gap_up',     'Gap Up (1.5%)',       '#16A34A', '📈', 3),
  ('ma_cross',   'MA Cross (9/21)',     '#2563EB', '🔀', 4),
  ('vcp',        'VCP Pattern',         '#EC4899', '📐', 5)
ON CONFLICT (type_key) DO NOTHING;

ALTER TABLE alert_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_types_read" ON alert_types FOR SELECT USING (true);
CREATE POLICY "alert_types_admin_write" ON alert_types FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ═══════════════════════════════════════
-- 2. ALERT PERFORMANCE (auto-track + admin override)
-- Links to breakout_alerts, tracks 24h result
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS alert_performance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        uuid REFERENCES breakout_alerts(id) ON DELETE CASCADE,
  ticker          text NOT NULL,
  alert_price     numeric NOT NULL,
  alert_change    numeric,                -- change % at time of alert
  signal_type     text,                   -- '52w_high', 'vol_surge', etc.
  signal_desc     text,                   -- human-readable signal description
  alert_time      timestamptz NOT NULL,   -- when the alert fired

  -- Performance tracking
  price_24h       numeric,                -- price ~24h after alert
  return_pct      numeric,                -- ((price_24h - alert_price) / alert_price) * 100
  outcome         text,                   -- 'hit' or 'miss' (hit = positive return)
  tracked_at      timestamptz,            -- when the 24h check ran

  -- Admin override
  admin_outcome   text,                   -- admin can override outcome
  admin_notes     text,                   -- admin explanation
  admin_id        uuid REFERENCES profiles(id),
  admin_updated   timestamptz,

  -- Effective outcome (admin takes precedence)
  -- Use: COALESCE(admin_outcome, outcome) in queries

  created_at      timestamptz DEFAULT now(),
  UNIQUE(alert_id)
);

ALTER TABLE alert_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_read" ON alert_performance FOR SELECT USING (true);
CREATE POLICY "perf_insert_service" ON alert_performance FOR INSERT WITH CHECK (true);
CREATE POLICY "perf_update_admin" ON alert_performance FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ═══════════════════════════════════════
-- 3. OPTIONS FLOW (from Unusual Whales)
-- Stores unusual options activity
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS options_flow (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uw_id           text UNIQUE,              -- Unusual Whales trade ID (dedup key)
  ticker          text NOT NULL,
  company         text,

  -- Trade details
  direction       text NOT NULL,            -- 'bullish', 'bearish', 'neutral'
  trade_type      text,                     -- 'sweep', 'block', 'split', 'golden_sweep'
  sentiment       text,                     -- 'above_ask', 'below_bid', 'at_mid'

  -- Contract info
  strike          numeric,
  expiry          date,
  option_type     text,                     -- 'call' or 'put'

  -- Size & price
  premium         numeric,                  -- total premium paid
  size            integer,                  -- number of contracts
  open_interest   integer,
  volume          integer,
  underlying_price numeric,                 -- stock price at time of trade

  -- Derived
  is_unusual      boolean DEFAULT false,    -- flagged as unusual by UW
  is_otm          boolean DEFAULT false,    -- out of the money
  bet_desc        text,                     -- e.g. "Above $200 by Apr 11"

  executed_at     timestamptz NOT NULL,     -- when the trade happened
  fetched_at      timestamptz DEFAULT now() -- when we pulled it
);

CREATE INDEX idx_options_flow_ticker ON options_flow(ticker);
CREATE INDEX idx_options_flow_executed ON options_flow(executed_at DESC);

ALTER TABLE options_flow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_flow_read" ON options_flow FOR SELECT USING (true);
CREATE POLICY "options_flow_insert" ON options_flow FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════
-- 4. DARKPOOL TRADES (from Unusual Whales)
-- Stores dark pool / off-exchange prints
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS darkpool_trades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uw_id           text UNIQUE,              -- Unusual Whales ID (dedup key)
  ticker          text NOT NULL,
  company         text,

  -- Trade details
  price           numeric NOT NULL,
  shares          bigint NOT NULL,
  dollar_value    numeric,                  -- price * shares
  direction       text DEFAULT 'neutral',   -- 'buying', 'selling', 'neutral'

  -- Context
  multiplier      numeric,                  -- how many x normal trade size
  venue           text,                     -- which dark pool / ATS
  note            text,                     -- auto-generated explanation

  executed_at     timestamptz NOT NULL,
  fetched_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_darkpool_ticker ON darkpool_trades(ticker);
CREATE INDEX idx_darkpool_executed ON darkpool_trades(executed_at DESC);

ALTER TABLE darkpool_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "darkpool_read" ON darkpool_trades FOR SELECT USING (true);
CREATE POLICY "darkpool_insert" ON darkpool_trades FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════
-- 5. ENABLE REALTIME on new tables
-- ═══════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE options_flow;
ALTER PUBLICATION supabase_realtime ADD TABLE darkpool_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE alert_performance;

-- ═══════════════════════════════════════
-- 6. HELPER: Auto-register new alert types
-- When a new signal_type appears in breakout_alerts,
-- auto-insert it into alert_types
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_register_alert_type()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alert_types (type_key, label, position)
  VALUES (
    COALESCE(NEW.signal_type, 'unknown'),
    INITCAP(REPLACE(COALESCE(NEW.signal_type, 'unknown'), '_', ' ')),
    99
  )
  ON CONFLICT (type_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_register_alert_type
  AFTER INSERT ON breakout_alerts
  FOR EACH ROW EXECUTE FUNCTION auto_register_alert_type();

-- ═══════════════════════════════════════
-- 7. HELPER: Auto-create performance row
-- When a new breakout alert is inserted,
-- create a pending performance record
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_create_performance_row()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alert_performance (
    alert_id, ticker, alert_price, alert_change,
    signal_type, signal_desc, alert_time
  ) VALUES (
    NEW.id,
    COALESCE(NEW.ticker, '—'),
    COALESCE(NEW.price, 0),
    NEW.change_pct,
    NEW.signal_type,
    NEW.notes,
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (alert_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_create_performance
  AFTER INSERT ON breakout_alerts
  FOR EACH ROW EXECUTE FUNCTION auto_create_performance_row();
