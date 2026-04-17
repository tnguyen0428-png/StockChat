// ============================================
// UPTIKALERTS — track-alert-performance Edge Function
// Multi-interval performance tracking: 1d, 3d, 7d, 14d, 30d
// Runs on pg_cron every 3 hours (see 20260415000000_track_alert_performance_cron.sql).
// Checks alert_performance_snapshots for due intervals.
//
// ───────────────────────────────────────────────────────────────────────────
// WHY THIS LOOKS MORE COMPLICATED THAN "FETCH CURRENT PRICE AND COMPARE"
// ───────────────────────────────────────────────────────────────────────────
// Each alert gets 5 pending snapshot rows (1d, 3d, 7d, 14d, 30d). Each row's
// "due moment" is `created_at + INTERVAL_HOURS[interval_key]`.
//
// Earlier versions of this function fetched the CURRENT Polygon price and used
// it to close every due row. If the cron ever lagged (or never ran), a 7-day-
// old alert would have 1d, 3d, AND 7d rows all flipping to the same current
// price in a single run — producing identical return_pct across horizons and
// contaminating v_signal_cohort_stats with meaningless multi-horizon stats.
//
// The right behavior: each interval must be scored using the price AT THAT
// INTERVAL'S DUE MOMENT, not "now". So:
//   • If a snapshot is due within the last few hours → current price is fine.
//     (Backwards-compatible cheap path; we stay on the snapshot endpoint.)
//   • If a snapshot is OVERDUE by more than OVERDUE_THRESHOLD_HOURS → fall
//     back to Polygon hourly aggregates and read the close of the bar that
//     contains (or immediately follows) the due moment. This is the only way
//     a late run produces correct horizon-specific data.
//
// We group overdue snapshots by ticker and fetch the full needed hourly-bar
// range in a single call per ticker, regardless of how many intervals that
// ticker has pending, so API volume is bounded by distinct ticker count.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Polygon is the canonical price source across the app (scan-vol-surge,
// price-lookup, breakoutScanner). Alert entry prices come from Polygon,
// so exit prices must come from Polygon too — otherwise vendor drift
// contaminates every hit/miss decision.
const POLYGON_BASE = 'https://api.polygon.io';

// Polygon snapshot endpoint accepts many tickers at once; chunk to stay
// well under any URL-length / response-size limits.
const POLY_BATCH_SIZE = 200;

// If a snapshot is due within this window, it's "on-time" and we use the
// current snapshot price. Outside this window the snapshot is overdue and
// we must fetch the historical bar at the due moment instead.
const OVERDUE_THRESHOLD_HOURS = 6;

// Throttle between per-ticker aggregates calls. Polygon's published rate
// limits vary by plan (Basic/Starter = 5/min, Developer = 100/min, Advanced
// = unlimited). Firing aggs back-to-back without pacing was producing
// silent 429s for the tail of each run, which showed up as "skipped_no_price"
// because fetchHistoricalBars returns [] on 429. 170ms ≈ 350/min — safely
// under Developer's 100/min when serialized, and well under Advanced's cap.
// Starter-plan users should override POLY_AGGS_DELAY_MS via env if needed.
const POLY_AGGS_DELAY_MS_DEFAULT = 170;

// Retry policy for a single aggs call that gets rate-limited. We back off
// and retry a couple of times before giving up and returning [].
const POLY_AGGS_MAX_RETRIES = 2;
const POLY_AGGS_RETRY_BACKOFF_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Interval configs: how many hours after alert each interval should be checked
const INTERVAL_HOURS: Record<string, number> = {
  '1d':  20,   // ~1 trading day (20h buffer)
  '3d':  68,   // ~3 trading days
  '7d':  164,  // ~7 calendar days
  '14d': 332,  // ~14 calendar days
  '30d': 716,  // ~30 calendar days
};

// Hit thresholds: what % return counts as a "hit" at each interval
const HIT_THRESHOLDS: Record<string, number> = {
  '1d':  0,    // any positive = hit
  '3d':  0,    // any positive = hit
  '7d':  1,    // need +1% for 7d hit
  '14d': 2,    // need +2% for 14d hit
  '30d': 3,    // need +3% for 30d hit
};

type PendingSnapshot = {
  id: string;
  alert_id: string;
  ticker: string;
  interval_key: string;
  alert_price: number;
  created_at: string;
};

type EnrichedSnapshot = PendingSnapshot & {
  dueMs: number;
  isOverdue: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Batched Polygon snapshot fetch. One HTTP call can return many tickers, so
// for a typical cron run (a few dozen tickers) this collapses to a single
// request — no per-ticker sleep loop, no 50 serial FMP calls.
async function fetchCurrentPrices(
  tickers: string[],
  apiKey: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (tickers.length === 0) return out;

  const unique = [...new Set(tickers)];
  for (let i = 0; i < unique.length; i += POLY_BATCH_SIZE) {
    const chunk = unique.slice(i, i + POLY_BATCH_SIZE);
    const url =
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers` +
      `?tickers=${chunk.join(',')}&apiKey=${apiKey}`;

    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.error('[perf-track] Polygon rate limit (snapshot) — aborting this run');
        break;
      }
      if (!res.ok) {
        console.error(`[perf-track] Polygon snapshot HTTP ${res.status}: ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      for (const snap of data.tickers ?? []) {
        // Prefer live last-trade → today's close → prev-day close. Same
        // precedence as the price-lookup edge function so all consumers
        // of "current price" see the same number.
        const price = snap.lastTrade?.p || snap.day?.c || snap.prevDay?.c || null;
        if (price && price > 0 && snap.ticker) {
          out.set(snap.ticker, price);
        }
      }
    } catch (err) {
      console.error('[perf-track] Polygon snapshot fetch threw:', (err as Error).message);
    }
  }

  return out;
}

// Fetch hourly aggregates for one ticker across a date range. Returns an
// ascending-sorted array of {t, c} bars (epoch ms, close). Empty array on
// any error — callers handle that as "no historical price available".
//
// The range is widened by 1 day on the low end and 2 days on the high end so
// weekends and holidays (no bars) don't leave us with nothing to pick from.
async function fetchHistoricalBars(
  ticker: string,
  fromMs: number,
  toMs: number,
  apiKey: string,
): Promise<Array<{ t: number; c: number }>> {
  const from = isoDate(fromMs - 24 * 3600_000);
  const to   = isoDate(toMs + 48 * 3600_000);
  const url =
    `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/hour/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  // Retry loop: back off on 429 a couple of times before giving up.
  for (let attempt = 0; attempt <= POLY_AGGS_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        if (attempt < POLY_AGGS_MAX_RETRIES) {
          console.warn(`[perf-track] 429 on aggs ${ticker}, backing off (attempt ${attempt + 1})`);
          await sleep(POLY_AGGS_RETRY_BACKOFF_MS * (attempt + 1));
          continue;
        }
        console.error(`[perf-track] Polygon rate limit (aggs ${ticker}) after ${attempt + 1} tries`);
        return [];
      }
      if (!res.ok) {
        console.error(`[perf-track] Polygon aggs HTTP ${res.status} for ${ticker} (${from} → ${to})`);
        return [];
      }
      const data = await res.json();
      const bars = (data.results ?? []) as Array<{ t: number; c: number }>;
      const cleaned = bars
        .filter(b => typeof b.t === 'number' && typeof b.c === 'number')
        .sort((a, b) => a.t - b.t);
      // Explicit trace per ticker so empty-result cases show up in logs
      // alongside the HTTP status above. Makes production debugging painless.
      console.log(`[perf-track] aggs ${ticker} ${from}→${to}: ${cleaned.length} bars (status=${data.status ?? 'ok'})`);
      return cleaned;
    } catch (err) {
      console.error(`[perf-track] Polygon aggs threw for ${ticker}:`, (err as Error).message);
      return [];
    }
  }
  return [];
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Max age (ms) we'll tolerate between the closest available bar and the
// snapshot's due moment before declaring "no data" and returning null. 48h
// covers a normal weekend. Anything longer than that and we'd be writing
// a stale price as if it were the due-moment price — better to skip the
// row and let the next cron run retry once Polygon backfills the gap.
const STALE_TOLERANCE_MS = 48 * 3600_000;

// Pick the bar whose timestamp is at or just after the target moment. If
// nothing is at/after (target falls past last bar), fall back to the last
// bar ONLY IF it's within STALE_TOLERANCE_MS of the target. Otherwise
// return null so the row stays pending and gets retried next run instead
// of being closed with a wrong-reference price.
function priceAt(
  bars: Array<{ t: number; c: number }>,
  targetMs: number,
): number | null {
  if (!bars.length) return null;
  const first = bars.find(b => b.t >= targetMs);
  if (first) return first.c;
  const last = bars[bars.length - 1];
  if ((targetMs - last.t) > STALE_TOLERANCE_MS) return null;
  return last.c;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url   = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    // Only run on weekdays unless forced. Weekend runs waste Polygon budget —
    // no new bars, and any snapshot "due" on a weekend gets picked up on
    // Monday's runs anyway.
    const now = new Date();
    const dow = now.getUTCDay();
    if (!force && (dow === 0 || dow === 6)) {
      return json({ skipped: true, reason: 'weekend' });
    }

    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonKey) throw new Error('Missing env var: POLYGON_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ══════════════════════════════════════════════════════════════════
    // PART A: Multi-interval snapshots
    // ══════════════════════════════════════════════════════════════════

    // Pull pending rows — ONE QUERY PER INTERVAL so every row we pull is
    // actually due.
    //
    // ROOT CAUSE THIS REPLACES (2026-04-15 instrumentation finding):
    // A single "500 oldest pending rows ORDER BY created_at ASC" query was
    // getting starved. 14d/30d rows live in the table for weeks before they
    // become due, so the oldest 500 pending rows were ~485 not-yet-due
    // 14d/30d rows plus a sliver of older short-horizon rows. All the
    // past-due 1d/3d/7d rows for newer alerts lived past position 500 and
    // were never seen. Tracker reported "20 due out of 500 pulled" while
    // ~240 past-due rows sat untouched in the tail.
    //
    // The fix: fan out into 5 queries, each scoped to one interval_key with
    // its own `created_at <= now - INTERVAL_HOURS[interval]` predicate. The
    // database filters out not-yet-due rows before they hit our window, so
    // every row pulled is guaranteed due. Per-interval budgets (200 each)
    // cap total reads at 1000 — well under what Polygon can handle in a
    // single run — and guarantee that one slow-maturing interval can't
    // starve another.
    //
    // Side-benefit: distinct-ticker fan-out is now a function of actually-
    // due alerts across intervals, not oldest-accumulated 14d/30d rows that
    // share few tickers with the short-horizon bulk.
    const { count: totalPendingInTable } = await supabase
      .from('alert_performance_snapshots')
      .select('id', { count: 'exact', head: true })
      .is('tracked_at', null);

    const PER_INTERVAL_LIMIT = 200;
    const intervalQueries = Object.entries(INTERVAL_HOURS).map(
      async ([intervalKey, hours]) => {
        const cutoffIso = new Date(now.getTime() - hours * 3600_000).toISOString();
        const { data, error } = await supabase
          .from('alert_performance_snapshots')
          .select('id, alert_id, ticker, interval_key, alert_price, created_at')
          .is('tracked_at', null)
          .eq('interval_key', intervalKey)
          .lte('created_at', cutoffIso)
          .order('created_at', { ascending: true })
          .limit(PER_INTERVAL_LIMIT);
        if (error) {
          console.error(`[perf-track] Pending fetch failed for ${intervalKey}: ${error.message}`);
          return [];
        }
        return (data || []) as PendingSnapshot[];
      },
    );
    const intervalChunks = await Promise.all(intervalQueries);
    const pendingSnapshots: PendingSnapshot[] = intervalChunks.flat();

    const overdueThresholdMs = OVERDUE_THRESHOLD_HOURS * 3600_000;

    // Per-interval counters for diagnostic logging. We want to see, inside
    // the pending window we pulled, how each interval_key bucket breaks
    // down into: pulled / due / overdue / not-yet-due / unknown-interval.
    type IntervalBreakdown = {
      pulled: number;
      due: number;
      overdue: number;
      not_yet_due: number;
      unknown_interval: number;
      oldest_created_at: string | null;
      newest_created_at: string | null;
    };
    const breakdown: Record<string, IntervalBreakdown> = {};
    const bumpBreakdown = (key: string, field: keyof IntervalBreakdown, createdAt?: string) => {
      if (!breakdown[key]) {
        breakdown[key] = {
          pulled: 0, due: 0, overdue: 0, not_yet_due: 0, unknown_interval: 0,
          oldest_created_at: null, newest_created_at: null,
        };
      }
      if (typeof breakdown[key][field] === 'number') {
        (breakdown[key][field] as number)++;
      }
      if (createdAt) {
        if (!breakdown[key].oldest_created_at || createdAt < breakdown[key].oldest_created_at) {
          breakdown[key].oldest_created_at = createdAt;
        }
        if (!breakdown[key].newest_created_at || createdAt > breakdown[key].newest_created_at) {
          breakdown[key].newest_created_at = createdAt;
        }
      }
    };

    // Filter to "due" snapshots and stamp each with its precise due moment
    // + whether it's overdue enough to require historical data.
    const dueSnapshots: EnrichedSnapshot[] = [];
    for (const snap of pendingSnapshots) {
      const key = snap.interval_key ?? 'null';
      bumpBreakdown(key, 'pulled', snap.created_at);

      const hours = INTERVAL_HOURS[snap.interval_key];
      if (!hours) {
        bumpBreakdown(key, 'unknown_interval');
        continue;
      }
      const createdMs = new Date(snap.created_at).getTime();
      const dueMs = createdMs + hours * 3600_000;
      if (now.getTime() < dueMs) {
        bumpBreakdown(key, 'not_yet_due');
        continue;
      }
      bumpBreakdown(key, 'due');
      const isOverdue = (now.getTime() - dueMs) > overdueThresholdMs;
      if (isOverdue) bumpBreakdown(key, 'overdue');
      dueSnapshots.push({ ...snap, dueMs, isOverdue });
    }

    console.log(
      `[perf-track] pulled=${pendingSnapshots.length} of total_pending=${totalPendingInTable ?? '?'} ` +
      `(per_interval_limit=${PER_INTERVAL_LIMIT})  due=${dueSnapshots.length}  ` +
      `overdue=${dueSnapshots.filter(s => s.isOverdue).length}`,
    );
    // With the per-interval filtered query every pulled row should also be
    // due — `not_yet_due` in the breakdown should always read 0. If it
    // doesn't, our cutoff math is off (clock skew, or INTERVAL_HOURS out of
    // sync with what the SQL predicate computed).
    console.log('[perf-track] per-interval breakdown:', JSON.stringify(breakdown, null, 0));

    // ── Fetch historical hourly bars per ticker for OVERDUE snapshots ──
    // One API call per distinct ticker covers all its overdue intervals.
    const overdueByTicker = new Map<string, EnrichedSnapshot[]>();
    for (const s of dueSnapshots) {
      if (!s.isOverdue) continue;
      const arr = overdueByTicker.get(s.ticker) ?? [];
      arr.push(s);
      overdueByTicker.set(s.ticker, arr);
    }

    // Throttle aggs calls. Env override lets us loosen or tighten per plan
    // without redeploying code.
    const aggsDelayMs = Number(Deno.env.get('POLY_AGGS_DELAY_MS') ?? POLY_AGGS_DELAY_MS_DEFAULT);

    const historicalByTicker = new Map<string, Array<{ t: number; c: number }>>();
    let i = 0;
    for (const [ticker, snaps] of overdueByTicker) {
      const minDue = Math.min(...snaps.map(s => s.dueMs));
      const maxDue = Math.max(...snaps.map(s => s.dueMs));
      const bars = await fetchHistoricalBars(ticker, minDue, maxDue, polygonKey);
      historicalByTicker.set(ticker, bars);
      i++;
      // Sleep after each call EXCEPT the last, so we don't add tail latency.
      if (i < overdueByTicker.size && aggsDelayMs > 0) {
        await sleep(aggsDelayMs);
      }
    }

    // ── Fetch current prices for ON-TIME snapshots (cheap batched path) ──
    const onTimeTickers = dueSnapshots.filter(s => !s.isOverdue).map(s => s.ticker);
    const currentPrices = await fetchCurrentPrices(onTimeTickers, polygonKey);

    // ── Legacy pending rows (alert_performance table, 24h one-shot) ──
    // Same batched snapshot fetch serves these — they don't need historical
    // accuracy because they're the old 24h-only system and the legacy cron
    // ran hourly when it was active.
    const cutoff = new Date(now.getTime() - 20 * 3600_000).toISOString();
    // Was .limit(50) — sized back when the legacy cron ran hourly and 50/hour
    // easily kept up. Now that this cron runs every 3h, 50 per run means
    // throughput is 50 rows / 3h ≈ 17/h, which lags behind typical alert-
    // generation rates and produces a backlog any time cron misses a window.
    // Observed gap (2026-04-15 → 2026-04-17) left ~117 due rows pending that
    // the next run could only chip away at. 500 is enough to catch up a full
    // day's worth of skipped runs in a single execution while staying well
    // under the 150s edge-function timeout (Polygon snapshot batches 200
    // tickers/call → ~3 HTTP calls total for legacy prices).
    const { data: legacyPending, error: legacyErr } = await supabase
      .from('alert_performance')
      .select('id, ticker, alert_price, alert_time')
      .is('outcome', null)
      .is('admin_outcome', null)
      .lt('alert_time', cutoff)
      .order('alert_time', { ascending: true })
      .limit(500);
    if (legacyErr) {
      console.error('[perf-track] Legacy fetch error:', legacyErr.message);
    }
    const legacyTickers = (legacyPending || []).map(p => p.ticker);
    const legacyPrices = legacyTickers.length > 0
      ? await fetchCurrentPrices(legacyTickers, polygonKey)
      : new Map<string, number>();

    // ══════════════════════════════════════════════════════════════════
    // SCORE each due snapshot with the price appropriate to its state
    // ══════════════════════════════════════════════════════════════════
    const results = { tracked: 0, skipped_no_price: 0, skipped_bad_alert_price: 0, errors: 0 };
    const sampleClosures: string[] = [];

    for (const snap of dueSnapshots) {
      if (!snap.alert_price || snap.alert_price <= 0) {
        results.skipped_bad_alert_price++;
        continue;
      }

      let price: number | null | undefined;
      if (snap.isOverdue) {
        price = priceAt(historicalByTicker.get(snap.ticker) ?? [], snap.dueMs);
      } else {
        price = currentPrices.get(snap.ticker) ?? null;
      }

      if (!price) {
        results.skipped_no_price++;
        continue;
      }

      const returnPct = round2(((price - snap.alert_price) / snap.alert_price) * 100);
      const threshold = HIT_THRESHOLDS[snap.interval_key] ?? 0;
      const outcome = returnPct >= threshold ? 'hit' : 'miss';

      const { error: updateErr } = await supabase
        .from('alert_performance_snapshots')
        .update({
          snapshot_price: price,
          return_pct: returnPct,
          outcome,
          tracked_at: now.toISOString(),
        })
        .eq('id', snap.id);

      if (updateErr) {
        console.error(`[perf-track] Update failed ${snap.ticker}/${snap.interval_key}: ${updateErr.message}`);
        results.errors++;
      } else {
        results.tracked++;
        if (sampleClosures.length < 20) {
          sampleClosures.push(
            `${snap.ticker}/${snap.interval_key}=${returnPct >= 0 ? '+' : ''}${returnPct}%` +
            `${snap.isOverdue ? ' [hist]' : ''}`,
          );
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // PART B: Legacy 24h tracking — unchanged behavior
    // ══════════════════════════════════════════════════════════════════
    const legacyResults = { tracked: 0, skipped: 0, errors: 0 };

    for (const row of (legacyPending || [])) {
      const currentPrice = legacyPrices.get(row.ticker);
      if (!currentPrice || !row.alert_price || row.alert_price <= 0) {
        legacyResults.skipped++;
        continue;
      }
      const returnPct = round2(((currentPrice - row.alert_price) / row.alert_price) * 100);
      const outcome = returnPct >= 0 ? 'hit' : 'miss';
      const { error: updateErr } = await supabase
        .from('alert_performance')
        .update({
          price_24h: currentPrice,
          return_pct: returnPct,
          outcome,
          tracked_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (updateErr) legacyResults.errors++;
      else           legacyResults.tracked++;
    }

    const summary = {
      ok: true,
      snapshots: {
        total_pending_in_table: totalPendingInTable ?? null,
        pulled_into_window: pendingSnapshots.length,
        per_interval_limit: PER_INTERVAL_LIMIT,
        due: dueSnapshots.length,
        overdue: dueSnapshots.filter(s => s.isOverdue).length,
        distinct_tickers_overdue: overdueByTicker.size,
        ...results,
      },
      per_interval_breakdown: breakdown,
      legacy: legacyResults,
      sample_closures: sampleClosures,
    };
    console.log('[perf-track] Complete:', JSON.stringify(summary));
    return json(summary);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[perf-track] Fatal:', msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
