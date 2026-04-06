// ============================================
// UPTIKALERTS — scan-vol-surge Edge Function
// Scans 15 tickers every 15 min during market hours
// and inserts vol_surge alerts when rel_volume >= 2.0
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WATCHLIST = [
  'NVDA', 'PLTR', 'SMCI', 'CRWD', 'AAPL',
  'TSLA', 'AMD',  'META', 'AMZN', 'MSFT',
  'GOOGL','SOFI', 'COIN', 'MARA', 'RIVN',
];

const POLYGON_BASE  = 'https://api.polygon.io';
const VOL_THRESHOLD = 0.1; // TEMP: lowered for testing (restore to 2.0)
const AVG_DAYS      = 20;
const POLY_DELAY_MS = 300; // ~3 req/s — stays within free tier limits

// ── Market hours guard ────────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (dow === 0 || dow === 6) return false;

  // Approximate ET: EDT = UTC-4 (Mar–Nov), EST = UTC-5 (Nov–Mar).
  // We use -4 year-round; the cron window + this guard together prevent
  // firing outside true market hours.
  const etMinutes = (now.getUTCHours() - 4) * 60 + now.getUTCMinutes();
  return etMinutes >= 9 * 60 + 30 && etMinutes < 16 * 60;
}

// ── Polygon helpers ───────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function polyGet(path: string, apiKey: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${POLYGON_BASE}${path}${sep}apiKey=${apiKey}`);

  if (res.status === 429) {
    throw new Error('Polygon rate limit — back off and retry next cycle');
  }
  if (!res.ok) {
    throw new Error(`Polygon HTTP ${res.status}: ${res.statusText} (${path})`);
  }
  return res.json();
}

interface SnapData {
  price: number;
  volume: number;
  changePct: number;
}

async function fetchSnapshots(apiKey: string): Promise<Map<string, SnapData>> {
  const tickers = WATCHLIST.join(',');
  const data = await polyGet(
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}`,
    apiKey,
  );

  const map = new Map<string, SnapData>();
  for (const snap of data.tickers ?? []) {
    const dayVol = snap.day?.v ?? 0;

    if (dayVol > 0) {
      // Market is open — use live day data
      map.set(snap.ticker, {
        price:     snap.day.c,
        volume:    dayVol,
        changePct: snap.todaysChangePerc ?? 0,
      });
    } else if (snap.prevDay?.v > 0) {
      // Market closed — fall back to previous day data
      const prevClose = snap.prevDay.c;
      const prevOpen  = snap.prevDay.o;
      const changePct = prevOpen > 0 ? ((prevClose - prevOpen) / prevOpen) * 100 : 0;
      map.set(snap.ticker, {
        price:     prevClose,
        volume:    snap.prevDay.v,
        changePct: round2(changePct),
      });
    }
    // If neither has volume, ticker is simply omitted from the map
  }
  return map;
}

async function fetchAvgVolume(ticker: string, apiKey: string): Promise<number> {
  // Go back 35 calendar days to ensure we capture ~20 trading days
  const to   = new Date();
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 35);

  const data = await polyGet(
    `/v2/aggs/ticker/${ticker}/range/1/day` +
    `/${from.toISOString().slice(0, 10)}` +
    `/${to.toISOString().slice(0, 10)}` +
    `?adjusted=true&sort=asc&limit=30`,
    apiKey,
  );

  const bars: any[] = data.results ?? [];
  if (bars.length === 0) return 0;

  const recent = bars.slice(-AVG_DAYS);
  return recent.reduce((sum, b) => sum + b.v, 0) / recent.length;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function alreadyAlertedToday(
  supabase: ReturnType<typeof createClient>,
  ticker: string,
): Promise<boolean> {
  // Use midnight ET as the day boundary (approximate: midnight UTC-4)
  const now        = new Date();
  const etOffset   = 4 * 60 * 60 * 1000;
  const etMidnight = new Date(now.getTime() - etOffset);
  etMidnight.setUTCHours(0, 0, 0, 0);
  const utcMidnight = new Date(etMidnight.getTime() + etOffset);

  const { data } = await supabase
    .from('breakout_alerts')
    .select('id')
    .eq('alert_type', 'vol_surge')
    .contains('tickers', [ticker])
    .gte('created_at', utcMidnight.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// ── Main handler ──────────────────────────────────────────────────────────────

const MOCK_ALERTS = [
  { ticker: 'NVDA', price: 175.75, volume: 420000000, relVolume: 2.5, changePct: 3.2  },
  { ticker: 'TSLA', price: 248.50, volume: 185000000, relVolume: 3.1, changePct: -1.4 },
  { ticker: 'PLTR', price: 92.10,  volume: 98000000,  relVolume: 4.2, changePct: 5.8  },
];

Deno.serve(async (req) => {
  try {
    const url      = new URL(req.url);
    const force    = url.searchParams.get('force') === 'true';
    const testMode = url.searchParams.get('test')  === 'true';

    // ── Test mode: insert mock data, skip Polygon entirely ──
    if (testMode) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const inserted: string[] = [];
      for (const m of MOCK_ALERTS) {
        const sign = m.changePct >= 0 ? '+' : '';
        const sign = m.changePct >= 0 ? '+' : '';
        const { error } = await supabase.from('breakout_alerts').insert({
          alert_type: 'vol_surge',
          tickers:    [m.ticker],
          title:      `${m.ticker} Volume Surge — ${m.relVolume.toFixed(1)}x avg`,
          body:       `$${m.price} · Vol ${m.relVolume.toFixed(1)}x above 20-day average · ${sign}${m.changePct}%`,
          sent_by:    'scanner:test',
        });
        if (error) {
          console.error(`[vol-scan:test] ${m.ticker}: ${error.message}`);
        } else {
          inserted.push(m.ticker);
        }
      }
      console.log('[vol-scan:test] Inserted mock alerts:', inserted);
      return json({ test: true, inserted });
    }

    if (!force && !isMarketHours()) {
      console.log('[vol-scan] Outside market hours — skipping');
      return json({ skipped: true, reason: 'outside market hours' });
    }

    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonKey) throw new Error('Missing env var: POLYGON_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log(`[vol-scan] Scanning ${WATCHLIST.length} tickers`);

    // One batched Polygon call for all current quotes
    const snapshots = await fetchSnapshots(polygonKey);
    console.log(`[vol-scan] Snapshot ok — ${snapshots.size} tickers returned`);

    const inserted: string[] = [];
    const skipped:  string[] = [];
    const errors:   { ticker: string; message: string }[] = [];

    for (const ticker of WATCHLIST) {
      try {
        const snap = snapshots.get(ticker);
        if (!snap || snap.volume === 0) {
          console.log(`[vol-scan] ${ticker}: no snapshot data`);
          skipped.push(ticker);
          continue;
        }

        await sleep(POLY_DELAY_MS); // rate-limit agg calls

        const avgVolume = await fetchAvgVolume(ticker, polygonKey);
        if (avgVolume === 0) {
          console.log(`[vol-scan] ${ticker}: no historical volume`);
          skipped.push(ticker);
          continue;
        }

        const relVolume = snap.volume / avgVolume;
        console.log(
          `[vol-scan] ${ticker}: rel_vol=${relVolume.toFixed(2)}` +
          ` (today=${snap.volume.toLocaleString()} / avg=${Math.round(avgVolume).toLocaleString()})`,
        );

        if (relVolume < VOL_THRESHOLD) {
          skipped.push(ticker);
          continue;
        }

        const duplicate = await alreadyAlertedToday(supabase, ticker);
        if (duplicate) {
          console.log(`[vol-scan] ${ticker}: already alerted today`);
          skipped.push(ticker);
          continue;
        }

        const sign = snap.changePct >= 0 ? '+' : '';
        const { error } = await supabase.from('breakout_alerts').insert({
          alert_type: 'vol_surge',
          tickers:    [ticker],
          title:      `${ticker} Volume Surge — ${relVolume.toFixed(1)}x avg`,
          body:       `$${round2(snap.price)} · Vol ${relVolume.toFixed(1)}x above 20-day average · ${sign}${round2(snap.changePct)}%`,
          sent_by:    'scanner',
        });

        if (error) {
          console.error(`[vol-scan] ${ticker}: insert failed — ${error.message}`);
          errors.push(ticker);
        } else {
          console.log(`[vol-scan] ${ticker}: ALERT INSERTED (rel_vol=${relVolume.toFixed(2)})`);
          inserted.push(ticker);
        }
      } catch (err: any) {
        console.error(`[vol-scan] ${ticker}: ${err.message}`);
        errors.push({ ticker, message: err.message });
      }
    }

    const summary = { inserted, skipped, errors, total: WATCHLIST.length };
    console.log('[vol-scan] Complete:', JSON.stringify(summary));
    return json(summary);

  } catch (err: any) {
    console.error('[vol-scan] Fatal:', err.message);
    return json({ error: err.message }, 500);
  }
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
