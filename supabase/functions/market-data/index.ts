import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// market-data: refreshes vix_score, spy_price, sector_performance, and
// fear_greed in market_data. Fully free-tier:
//   - VIX, SPY, sector ETFs → Yahoo Finance (one batched HTTP call)
//   - Fear & Greed → CNN's public endpoint
// No FMP / no paid API. Both Yahoo and CNN need a browser User-Agent to
// avoid silent 403s.

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

// Browser-like UA — Yahoo and CNN both block requests without one.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Pull all symbols (^VIX, SPY, sector ETFs) in one Yahoo call.
// One round trip → less surface area for rate-limiting / partial failure.
async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, { price: number; change: number }>> {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbols.join(","));
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  });
  if (!r.ok) throw new Error(`Yahoo returned ${r.status}`);
  const j = await r.json();
  const out: Record<string, { price: number; change: number }> = {};
  for (const q of j?.quoteResponse?.result || []) {
    if (q.regularMarketPrice != null) {
      out[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChangePercent ?? 0,
      };
    }
  }
  return out;
}

Deno.serve(async () => {
  const results: Record<string, any> = {};
  const errors: Record<string, string> = {};

  // ── Yahoo: VIX + SPY + sectors in one call ──
  let quotes: Record<string, { price: number; change: number }> = {};
  try {
    quotes = await fetchYahooQuotes(["^VIX", "SPY", ...Object.keys(SECTOR_ETFS)]);
  } catch (e) {
    errors.yahoo = (e as Error).message;
  }

  // VIX (^VIX index, not VIXY ETF — the ETF was the bug in the old version)
  try {
    const vix = quotes["^VIX"];
    if (vix) {
      await supabase.from("market_data").upsert({
        key: "vix_score",
        value: { score: vix.price, change: vix.change },
        updated_at: new Date().toISOString(),
      });
      results.vix = vix.price;
    } else if (!errors.yahoo) {
      errors.vix = "Yahoo returned no ^VIX quote";
    }
  } catch (e) {
    errors.vix = (e as Error).message;
  }

  // SPY
  try {
    const spy = quotes["SPY"];
    if (spy) {
      await supabase.from("market_data").upsert({
        key: "spy_price",
        value: { price: spy.price, change: spy.change },
        updated_at: new Date().toISOString(),
      });
      results.spy = spy.price;
    } else if (!errors.yahoo) {
      errors.spy = "Yahoo returned no SPY quote";
    }
  } catch (e) {
    errors.spy = (e as Error).message;
  }

  // Sector ETFs
  try {
    const sectors: { name: string; perf: number }[] = [];
    for (const [symbol, name] of Object.entries(SECTOR_ETFS)) {
      const q = quotes[symbol];
      if (q) sectors.push({ name, perf: q.change });
    }
    if (sectors.length > 0) {
      await supabase.from("market_data").upsert({
        key: "sector_performance",
        value: sectors,
        updated_at: new Date().toISOString(),
      });
      results.sectors = sectors.length;
    } else if (!errors.yahoo) {
      errors.sectors = "Yahoo returned no sector quotes";
    }
  } catch (e) {
    errors.sectors = (e as Error).message;
  }

  // ── CNN Fear & Greed ──
  // Free, unofficial JSON endpoint. Needs a browser UA — without one
  // CNN silently 403s and the response parses as missing fields, which
  // is how the previous version of this function failed silently and
  // never wrote a fear_greed row.
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
        await supabase.from("market_data").upsert({
          key: "fear_greed",
          value: {
            score: Math.round(score),
            rating,
            updated: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        });
        results.fear_greed = Math.round(score);
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
