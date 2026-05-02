import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// market-data: refreshes vix_score, spy_price, sector_performance, and
// fear_greed in market_data.
//
// Data sources (chosen for reliability from Supabase edge function infra):
//   - VIX        → CBOE official delayed quotes  (cdn.cboe.com)
//   - SPY/sectors→ Polygon snapshot              (api.polygon.io)
//   - Fear&Greed → CNN unofficial JSON           (production.dataviz.cnn.io)
//
// Why not Yahoo Finance: query[12].finance.yahoo.com both rate-limit Supabase's
// edge function IP range (429 Too Many Requests on direct probes), so the v7
// quote and v8 chart endpoints can't be used for cron-cadence calls. Confirmed
// 2026-05-02. CBOE returns ^VIX cleanly with no auth.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology",
  XLV: "Healthcare",
  XLE: "Energy",
  XLF: "Financials",
  XLY: "Consumer",
  XLI: "Industrials",
};

// Browser-like UA for CBOE and CNN (both serve different content without one).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── VIX from CBOE ───────────────────────────────────────────────────────────
// Returns shape: { timestamp, data: { symbol, last, price_change, price_change_percent,
//                                    open, prev_day_close, ... } }
// `last` is null right after market open; fall through to open → prev_close.
async function fetchCboeVix(): Promise<{ score: number; change: number } | null> {
  const r = await fetch(
    "https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json",
    { headers: { "User-Agent": UA, "Accept": "application/json" } }
  );
  if (!r.ok) throw new Error(`CBOE returned ${r.status}`);
  const j = await r.json();
  const data = j?.data;
  if (!data) return null;
  const priceRaw = data.last ?? data.open ?? data.prev_day_close;
  const changeRaw = data.price_change_percent ?? 0;
  if (priceRaw == null) return null;
  return { score: Number(priceRaw), change: Number(changeRaw) };
}

// ── SPY + sector ETFs from Polygon (one batched snapshot) ───────────────────
async function fetchPolygonQuotes(
  symbols: string[],
  apiKey: string,
): Promise<Record<string, { price: number; change: number }>> {
  const url =
    "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=" +
    encodeURIComponent(symbols.join(",")) +
    `&apiKey=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Polygon returned ${r.status}`);
  const j = await r.json();
  const out: Record<string, { price: number; change: number }> = {};
  for (const t of (j?.tickers ?? [])) {
    const price = t.day?.c ?? t.prevDay?.c;
    const change = t.todaysChangePerc ?? 0;
    if (price != null) {
      out[t.ticker] = { price: Number(price), change: Number(change) };
    }
  }
  return out;
}

Deno.serve(async () => {
  const results: Record<string, any> = {};
  const errors: Record<string, string> = {};

  const polygonKey = Deno.env.get("POLYGON_API_KEY");
  if (!polygonKey) {
    return new Response(
      JSON.stringify({ error: "Missing env var: POLYGON_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── VIX (CBOE) ──
  try {
    const vix = await fetchCboeVix();
    if (vix) {
      const { error: dbErr } = await supabase.from("market_data").upsert({
        key: "vix_score",
        value: { score: vix.score, change: vix.change },
        updated_at: new Date().toISOString(),
      });
      if (dbErr) errors.vix = `DB upsert failed: ${dbErr.message}`;
      else results.vix = vix.score;
    } else {
      errors.vix = "CBOE returned no usable VIX data";
    }
  } catch (e) {
    errors.vix = (e as Error).message;
  }

  // ── SPY + sectors (Polygon) ──
  let polyQuotes: Record<string, { price: number; change: number }> = {};
  try {
    polyQuotes = await fetchPolygonQuotes(["SPY", ...Object.keys(SECTOR_ETFS)], polygonKey);
  } catch (e) {
    errors.polygon = (e as Error).message;
  }

  // SPY
  try {
    const spy = polyQuotes["SPY"];
    if (spy) {
      const { error: dbErr } = await supabase.from("market_data").upsert({
        key: "spy_price",
        value: { price: spy.price, change: spy.change },
        updated_at: new Date().toISOString(),
      });
      if (dbErr) errors.spy = `DB upsert failed: ${dbErr.message}`;
      else results.spy = spy.price;
    } else if (!errors.polygon) {
      errors.spy = "Polygon returned no SPY snapshot";
    }
  } catch (e) {
    errors.spy = (e as Error).message;
  }

  // Sector ETFs
  try {
    const sectors: { name: string; perf: number }[] = [];
    for (const [symbol, name] of Object.entries(SECTOR_ETFS)) {
      const q = polyQuotes[symbol];
      if (q) sectors.push({ name, perf: q.change });
    }
    if (sectors.length > 0) {
      const { error: dbErr } = await supabase.from("market_data").upsert({
        key: "sector_performance",
        value: sectors,
        updated_at: new Date().toISOString(),
      });
      if (dbErr) errors.sectors = `DB upsert failed: ${dbErr.message}`;
      else results.sectors = sectors.length;
    } else if (!errors.polygon) {
      errors.sectors = "Polygon returned no sector snapshots";
    }
  } catch (e) {
    errors.sectors = (e as Error).message;
  }

  // ── CNN Fear & Greed ──
  try {
    const fgRes = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/",
      { headers: { "User-Agent": UA, "Accept": "application/json, text/plain, */*" } }
    );
    if (!fgRes.ok) {
      errors.fear_greed = `CNN returned ${fgRes.status}`;
    } else {
      const fg = await fgRes.json();
      const score  = fg?.fear_and_greed?.score  ?? fg?.score;
      const rating = fg?.fear_and_greed?.rating ?? fg?.rating ?? null;
      if (score == null) {
        errors.fear_greed = `CNN missing score field. Top keys: ${Object.keys(fg || {}).join(",") || "(empty)"}`;
      } else {
        const { error: dbErr } = await supabase.from("market_data").upsert({
          key: "fear_greed",
          value: {
            score: Math.round(score),
            rating,
            updated: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        });
        if (dbErr) errors.fear_greed = `DB upsert failed: ${dbErr.message}`;
        else results.fear_greed = Math.round(score);
      }
    }
  } catch (e) {
    errors.fear_greed = (e as Error).message;
  }

  return new Response(
    JSON.stringify({ ok: Object.keys(errors).length === 0, results, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
