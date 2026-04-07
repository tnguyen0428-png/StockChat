-- ============================================
-- UPTIKALERTS — Portfolio Challenge Tables
-- Paper trading competition with leaderboard
-- ============================================

-- 1. Paper Portfolios — one row per user, tracks cash balance
CREATE TABLE IF NOT EXISTS paper_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  cash_balance NUMERIC DEFAULT 50000 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Paper Trades — individual buy/sell positions
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  dollar_amount NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'closed')),
  bought_at TIMESTAMPTZ NOT NULL,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Portfolio Badges — earned behavioral badges
CREATE TABLE IF NOT EXISTS portfolio_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_type)
);

-- 4. Challenge Chat — trash talk messages
CREATE TABLE IF NOT EXISTS challenge_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  reactions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_status ON paper_trades (user_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_trades_bought_at ON paper_trades (bought_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_badges_user ON portfolio_badges (user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_chat_created ON challenge_chat (created_at DESC);

-- ── RPC: ensure_paper_portfolio ──
-- Creates a portfolio for the current user if one doesn't exist
CREATE OR REPLACE FUNCTION ensure_paper_portfolio()
RETURNS void AS $$
BEGIN
  INSERT INTO paper_portfolios (user_id, cash_balance)
  VALUES (auth.uid(), 50000)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS Policies ──

-- paper_portfolios
ALTER TABLE paper_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios_select_all" ON paper_portfolios
  FOR SELECT USING (true);

CREATE POLICY "portfolios_insert_own" ON paper_portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "portfolios_update_own" ON paper_portfolios
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- paper_trades
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select_all" ON paper_trades
  FOR SELECT USING (true);

CREATE POLICY "trades_insert_own" ON paper_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trades_update_own" ON paper_trades
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- portfolio_badges
ALTER TABLE portfolio_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_select_all" ON portfolio_badges
  FOR SELECT USING (true);

CREATE POLICY "badges_insert_own" ON portfolio_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- challenge_chat
ALTER TABLE challenge_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_select_all" ON challenge_chat
  FOR SELECT USING (true);

CREATE POLICY "chat_insert_own" ON challenge_chat
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_update_own" ON challenge_chat
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Enable realtime for live updates ──
ALTER PUBLICATION supabase_realtime ADD TABLE paper_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE challenge_chat;
