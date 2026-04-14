// ============================================
// UPTIKALERTS — track-alert-performance Edge Function
// Multi-interval performance tracking: 1d, 3d, 7d, 14d, 30d
// Runs via pg_cron at 4:30 PM ET daily
// Checks alert_performance_snapshots for due intervals
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

  // Dedupe + chunk
  const unique = [...new Set(tickers)];
  for (let i = 0; i < unique.length; i += POLY_BATCH_SIZE) {
    const chunk = unique.slice(i, i + POLY_BATCH_SIZE);
    const url =
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers` +
      `?tickers=${chunk.join(',')}&apiKey=${apiKey}`;

    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.error('[perf-track] Polygon rate limit — aborting this run');
        break;
      }
      if (!res.ok) {
        console.error(`[perf-track] Polygon HTTP ${res.status}: ${res.statusText}`);
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
      console.error('[perf-track] Polygon fetch threw:', (err as Error).message);
    }
  }

  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url   = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    // Only run on weekdays unless forced
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
    // PART A: Multi-interval snapshots (new system)
    // Check alert_performance_snapshots for due intervals
    // ══════════════════════════════════════════════════════════════════

    // Find snapshot rows that haven't been tracked yet.
    // Limit bumped from 100 → 500 to drain the backlog faster; Polygon's snapshot
    // endpoint handles 200 tickers/call so at most 3 batched fetches per run.
    const { data: pendingSnapshots, error: snapErr } = await supabase
      .from('alert_performance_snapshots')
      .select('id, alert_id, ticker, interval_key, alert_price, created_at')
      .is('tracked_at', null)
      .order('created_at', { ascending: true })
      .limit(500);

    if (snapErr) {
      console.error('[perf-track] Failed to fetch pending snapshots:', snapErr.message);
    }

    const dueSnapshots = (pendingSnapshots || []).filter(snap => {
      const hours = INTERVAL_HOURS[snap.interval_key];
      if (!hours) return false;
      const alertTime = new Date(snap.created_at).getTime();
      const dueTime = alertTime + hours * 60 * 60 * 1000;
      return now.getTime() >= dueTime;
    });

    console.log(`[perf-track] Found ${dueSnapshots.length} due snapshots out of ${(pendingSnapshots || []).length} pending`);

    // ── Query legacy pending rows up-front so we can batch-fetch prices once ──
    const cutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();

    const { data: pending, error: fetchErr } = await supabase
      .from('alert_performance')
      .select('id, ticker, alert_price, alert_time')
      .is('outcome', null)
      .is('admin_outcome', null)
      .lt('alert_time', cutoff)
      .order('alert_time', { ascending: true })
      .limit(50);

    if (fetchErr) {
      console.error('[perf-track] Legacy fetch error:', fetchErr.message);
    }

    // One batched Polygon snapshot call covers both snapshots + legacy rows
    const allTickers = [
      ...dueSnapshots.map(s => s.ticker),
      ...(pending || []).map(p => p.ticker),
    ];
    const prices = await fetchCurrentPrices(allTickers, polygonKey);
    const uniqueRequested = new Set(allTickers).size;
    console.log(`[perf-track] Polygon returned prices for ${prices.size} of ${uniqueRequested} unique tickers`);

    const snapshotResults = { tracked: 0, skipped: 0, errors: 0 };
    const trackedDetails: string[] = [];

    for (const snap of dueSnapshots) {
      const currentPrice = prices.get(snap.ticker);
      if (!currentPrice || !snap.alert_price || snap.alert_price <= 0) {
        snapshotResults.skipped++;
        continue;
      }

      const returnPct = round2(((currentPrice - snap.alert_price) / snap.alert_price) * 100);
      const threshold = HIT_THRESHOLDS[snap.interval_key] ?? 0;
      const outcome = returnPct >= threshold ? 'hit' : 'miss';

      const { error: updateErr } = await supabase
        .from('alert_performance_snapshots')
        .update({
          snapshot_price: currentPrice,
          return_pct: returnPct,
          outcome,
          tracked_at: now.toISOString(),
        })
        .eq('id', snap.id);

      if (updateErr) {
        console.error(`[perf-track] Snapshot ${snap.ticker}/${snap.interval_key}: ${updateErr.message}`);
        snapshotResults.errors++;
      } else {
        snapshotResults.tracked++;
        trackedDetails.push(`${snap.ticker}/${snap.interval_key}=${returnPct >= 0 ? '+' : ''}${returnPct}%`);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // PART B: Legacy 24h tracking (alert_performance table)
    // Prices were already fetched in the batched Polygon call above.
    // ══════════════════════════════════════════════════════════════════

    const legacyResults = { tracked: 0, skipped: 0, errors: 0 };

    if (pending && pending.length > 0) {
      for (const row of pending) {
        const currentPrice = prices.get(row.ticker);
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

        if (updateErr) {
          legacyResults.errors++;
        } else {
          legacyResults.tracked++;
          console.log(`[perf-track] Legacy ${row.ticker}: ${outcome} (${returnPct >= 0 ? '+' : ''}${returnPct}%)`);
        }
      }
    }

    const summary = {
      ok: true,
      snapshots: snapshotResults,
      legacy: legacyResults,
      tracked_details: trackedDetails.slice(0, 20),
    };
    console.log('[perf-track] Complete:', JSON.stringify(summary));
    return json(summary);

  } catch (err: any) {
    console.error('[perf-track] Fatal:', err.message);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
