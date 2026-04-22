-- ============================================
-- UPTIKALERTS — Supabase Database Tables
-- Run this in Supabase SQL editor
-- ============================================

-- PROFILES
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  color text default '#1AAD5E',
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- GROUPS
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  moderator_id uuid references profiles(id),
  invite_code text unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- GROUP MEMBERS
create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member', -- 'moderator' or 'member'
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

-- TIER SETTINGS (no hardcoded limits)
create table tier_settings (
  id uuid primary key default gen_random_uuid(),
  tier_name text unique not null,
  ticker_limit integer default 3,
  alert_history_limit integer default 3,
  created_at timestamptz default now()
);

-- Insert default tier settings
insert into tier_settings (tier_name, ticker_limit, alert_history_limit) values
  ('freemium', 3, 3),
  ('tier1', 10, 999),
  ('tier2', 20, 999),
  ('tier3', 999, 999);

-- CHAT MESSAGES
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id text not null,
  username text not null,
  user_color text default '#1AAD5E',
  text text not null,
  type text default 'user', -- 'user', 'ai', 'alert'
  is_admin boolean default false,
  reactions jsonb default '{}',
  tickers text[],
  created_at timestamptz default now()
);

-- GROUP TICKERS (moderator controlled watch list)
create table group_tickers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  symbol text not null,
  created_at timestamptz default now(),
  unique(group_id, symbol)
);

-- BROADCASTS
create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  title text not null,
  body text,
  type text default 'BULLISH', -- 'BULLISH', 'BEARISH', 'WATCHLIST', 'INFO'
  tickers text[],
  sent_by text default 'Admin',
  is_mod_alert boolean default false, -- true = moderator alert (no auto-dismiss, single group)
  created_at timestamptz default now()
);

-- DAILY BRIEFINGS
create table daily_briefings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  content text not null,
  mood text default 'neutral', -- 'risk-on', 'risk-off', 'neutral'
  tags jsonb default '[]',
  created_at timestamptz default now()
);

-- BREAKOUT ALERTS
create table breakout_alerts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  ticker text not null,
  signal_type text not null, -- '52w_high', 'vol_surge', 'gap_up', 'ma_cross', 'vcp'
  price numeric,
  change_pct numeric,
  volume bigint,
  rel_volume numeric,
  notes text,
  created_at timestamptz default now()
);

-- CURATED LISTS
create table curated_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  name text not null,
  sector text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- CURATED STOCKS
create table curated_stocks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references curated_lists(id) on delete cascade,
  ticker text not null,
  ranking integer default 1,
  sector text,
  score integer default 0,
  entry_low numeric,
  entry_high numeric,
  thesis text,
  notes text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- USER WATCHLIST
create table user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  symbol text not null,
  created_at timestamptz default now(),
  unique(user_id, group_id, symbol)
);

-- MOD NEWS PICKS
create table mod_news_picks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  title text not null,
  url text not null,
  note text,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
alter table profiles        enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table chat_messages    enable row level security;
alter table group_tickers    enable row level security;
alter table broadcasts       enable row level security;
alter table daily_briefings  enable row level security;
alter table breakout_alerts  enable row level security;
alter table curated_lists    enable row level security;
alter table curated_stocks   enable row level security;
alter table user_watchlist   enable row level security;
alter table mod_news_picks   enable row level security;

-- Profiles: users can read all, update own
create policy "profiles_read"   on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);

-- Group members can read their group data
create policy "group_read" on groups for select
  using (id in (select group_id from group_members where user_id = auth.uid()));

-- Chat: group members can read and insert
create policy "chat_read" on chat_messages for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "chat_insert" on chat_messages for insert
  with check (group_id in (select group_id from group_members where user_id = auth.uid()));

-- Tickers: group members can read, moderators can write
create policy "tickers_read" on group_tickers for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));

-- Broadcasts: group members can read
create policy "broadcasts_read" on broadcasts for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));

-- Broadcasts: admins can insert to any group
create policy "broadcasts_insert_admin" on broadcasts for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Broadcasts: moderators can insert to their own group
create policy "broadcasts_insert_mod" on broadcasts for insert
  with check (
    group_id in (
      select group_id from group_members
      where user_id = auth.uid() and role = 'moderator'
    )
  );

-- Briefings: group members can read
create policy "briefings_read" on daily_briefings for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));

-- Alerts: group members can read
create policy "alerts_read" on breakout_alerts for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));

-- Curated lists: group members can read
create policy "lists_read" on curated_lists for select
  using (group_id in (select group_id from group_members where user_id = auth.uid()));
create policy "stocks_read" on curated_stocks for select
  using (list_id in (select id from curated_lists where group_id in
    (select group_id from group_members where user_id = auth.uid())));

-- Watchlist: users manage own
create policy "watchlist_read"   on user_watchlist for select using (user_id = auth.uid());
create policy "watchlist_insert" on user_watchlist for insert with check (user_id = auth.uid());
create policy "watchlist_delete" on user_watchlist for delete using (user_id = auth.uid());

-- ============================================
-- MARKET INDICATORS (admin-editable)
-- ============================================
create table market_indicators (
  id           uuid primary key default gen_random_uuid(),
  ticker       text not null,
  label        text not null,
  position     integer not null,
  is_vix_style boolean default false,
  created_at   timestamptz default now()
);

insert into market_indicators (ticker, label, position, is_vix_style) values
  ('SPY',  'S&P 500', 1, false),
  ('QQQ',  'NASDAQ',  2, false),
  ('DIA',  'DOW',     3, false),
  ('VIXY', 'VIX',     4, true),
  ('GLD',  'GOLD',    5, false),
  ('SLV',  'SILVER',  6, false);

alter table market_indicators enable row level security;

create policy "indicators_read" on market_indicators for select using (true);
create policy "indicators_insert" on market_indicators for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
create policy "indicators_update" on market_indicators for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
create policy "indicators_delete" on market_indicators for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ============================================
-- REALTIME
-- Run this so chat messages, alerts, and broadcasts push to clients instantly
-- ============================================
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table breakout_alerts;
alter publication supabase_realtime add table broadcasts;
alter publication supabase_realtime add table group_tickers;

-- ============================================
-- AUTO CREATE PROFILE ON SIGNUP
-- ============================================
-- IMPORTANT: SECURITY DEFINER functions in Supabase run with an empty
-- search_path by default (security hardening), so unqualified 'profiles'
-- resolves to nothing and the insert fails with 42P01 "relation profiles
-- does not exist" — surfaced to the client as the generic "Database error
-- saving new user", and the auth.users row rolls back. Prevent this two
-- ways: SET search_path on the function AND schema-qualify public.profiles.
-- Keep this in sync with supabase/migrations/20260416000000_unique_username.sql
-- which layers collision-retry on top of this body.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'Trader'),
    '#1AAD5E'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
