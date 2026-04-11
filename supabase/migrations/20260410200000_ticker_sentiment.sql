-- Create ticker_mentions table
CREATE TABLE IF NOT EXISTS ticker_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticker_mentions_group_ticker
  ON ticker_mentions(group_id, ticker);

CREATE INDEX IF NOT EXISTS idx_ticker_mentions_group_created
  ON ticker_mentions(group_id, created_at);

-- Create ticker_sentiment table
CREATE TABLE IF NOT EXISTS ticker_sentiment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  user_id uuid NOT NULL,
  sentiment text NOT NULL CHECK (sentiment IN ('bull', 'bear')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, ticker, user_id)
);

-- Create ticker_targets table
CREATE TABLE IF NOT EXISTS ticker_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  user_id uuid NOT NULL,
  target_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, ticker, user_id)
);

-- Enable RLS on all tables
ALTER TABLE ticker_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_targets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ticker_mentions
CREATE POLICY "Users can read ticker_mentions for their groups"
  ON ticker_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = ticker_mentions.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own ticker_mentions"
  ON ticker_mentions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ticker_sentiment
CREATE POLICY "Users can read ticker_sentiment for their groups"
  ON ticker_sentiment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = ticker_sentiment.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own ticker_sentiment"
  ON ticker_sentiment
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ticker_sentiment"
  ON ticker_sentiment
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ticker_targets
CREATE POLICY "Users can read ticker_targets for their groups"
  ON ticker_targets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = ticker_targets.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own ticker_targets"
  ON ticker_targets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ticker_targets"
  ON ticker_targets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add ticker_sentiment to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE ticker_sentiment;
