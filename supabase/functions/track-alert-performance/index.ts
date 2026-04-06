// ============================================
// UPTIKALERTS — track-alert-performance Edge Function
// Multi-interval performance tracking: 1d, 3d, 7d, 14d, 30d
// Runs via pg_cron at 4:30 PM ET daily
// Checks alert_performance_snapshots for due intervals
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FMP_BASE = 'https://financialmodelingprep.com/stable';

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPrice(ticker: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${FMP_BASE}/quote?symbol=${ticker}&apikey=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0].price || data[0].previousClose || null;
    }
    return null;
  } catch {
    return null;
  }
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

    const fmpKey = Deno.env.get('FMP_API_KEY');
    if (!fmpKey) throw new Error('Missing env var: FMP_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ══════════════════════════════════════════════════════════════════
    // PART A: Multi-interval snapshots (new system)
    // Check alert_performance_snapshots for due intervals
    // ══════════════════════════════════════════════════════════════════

    // Find snapshot rows that haven't been tracked yet
    const { data: pendingSnapshots, error: snapErr } = await supabase
      .from('alert_performance_snapshots')
      .select('id, alert_id, ticker, interval_key, alert_price, created_at')
      .is('tracked_at', null)
      .order('created_at', { ascending: true })
      .limit(100);

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

    // Batch by unique ticker to minimize API calls
    const snapshotTickers = new Set(dueSnapshots.map(s => s.ticker));
    const prices = new Map<string, number>();

    for (const ticker of snapshotTickers) {
      const price = await fetchPrice(ticker, fmpKey);
      if (price !== null) prices.set(ticker, price);
      await sleep(200);
    }

    console.log(`[perf-track] Fetched prices for ${prices.size} of ${snapshotTickers.size} tickers`);

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
    // Keep this for backwards compatibility
    // ══════════════════════════════════════════════════════════════════

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

    const legacyResults = { tracked: 0, skipped: 0, errors: 0 };

    if (pending && pending.length > 0) {
      // Fetch any additional prices not already fetched
      const legacyTickers = new Set(pending.map(p => p.ticker));
      for (const ticker of legacyTickers) {
        if (!prices.has(ticker)) {
          const price = await fetchPrice(ticker, fmpKey);
          if (price !== null) prices.set(ticker, price);
          await sleep(200);
        }
      }

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
