-- ============================================
-- UPTIKALERTS — AI Learning Infrastructure
-- Phase 1: Response logging + feedback loop
-- ============================================

-- AI Response Log — tracks every AI response for analysis
CREATE TABLE IF NOT EXISTS ai_response_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  response TEXT NOT NULL,
  agent_type TEXT NOT NULL,              -- 'data', 'macro', 'knowledge'
  model_used TEXT,                       -- 'claude-haiku-4-5', 'claude-sonnet-4-6'
  ticker TEXT,                           -- resolved ticker if any
  cached BOOLEAN DEFAULT false,
  hallucination_blocked BOOLEAN DEFAULT false,
  processing_ms INTEGER,
  user_level TEXT,                       -- beginner/intermediate/advanced at time of response
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI Feedback — already exists in some form, but let's make it robust
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message_id UUID,                       -- links to chat message
  log_id UUID REFERENCES ai_response_log(id) ON DELETE SET NULL,
  question TEXT,
  response TEXT,
  agent_type TEXT,
  rating TEXT NOT NULL,                  -- 'up' or 'down'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI User Memory — extend with preference tracking
-- (create if not exists, or alter if it does)
CREATE TABLE IF NOT EXISTS ai_user_memory (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  experience_level TEXT DEFAULT 'beginner',
  watched_tickers TEXT[] DEFAULT '{}',
  question_count INTEGER DEFAULT 0,
  last_question_at TIMESTAMPTZ,
  -- New learning fields
  preferred_length TEXT DEFAULT 'auto',    -- 'short', 'medium', 'detailed', 'auto'
  positive_responses INTEGER DEFAULT 0,    -- count of thumbs up
  negative_responses INTEGER DEFAULT 0,    -- count of thumbs down
  recent_corrections INTEGER DEFAULT 0,    -- count of "no/wrong" follow-ups
  topics_of_interest TEXT[] DEFAULT '{}',  -- learned from question patterns
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_response_log_user ON ai_response_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_response_log_agent ON ai_response_log(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_rating ON ai_feedback(rating, created_at DESC);

-- RLS policies
ALTER TABLE ai_response_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_memory ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own data
CREATE POLICY "response_log_insert" ON ai_response_log FOR INSERT WITH CHECK (true);
CREATE POLICY "response_log_read" ON ai_response_log FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "feedback_insert" ON ai_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "feedback_read" ON ai_feedback FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "memory_all" ON ai_user_memory FOR ALL USING (user_id = auth.uid());
