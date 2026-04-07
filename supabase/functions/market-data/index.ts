import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FMP_KEY = Deno.env.get("FMP_API_KEY");

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

async function fetchQuote(symbol: string) {
  const res = await fetch(
    `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP_KEY}`
  );
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// TODO: Add proper auth check for production
Deno.serve(async () => {
  const results: Record<string, any> = {};
  const errors: Record<string, string> = {};

  // VIX (using VIXY as proxy)
  try {
    const vixy = await fetchQuote("VIXY");
    if (vixy) {
      await supabase.from("market_data").upsert({
        key: "vix_score",
        value: { score: vixy.price, change: vixy.changePercentage },
        updated_at: new Date().toISOString(),
      });
      results.vix = vixy.price;
    } else {
      errors.vix = "No data returned for VIXY";
    }
  } catch (e) {
    errors.vix = e.message;
  }

  // SPY
  try {
    const spy = await fetchQuote("SPY");
    if (spy) {
      await supabase.from("market_data").upsert({
        key: "spy_price",
        value: { price: spy.price, change: spy.changePercentage },
        updated_at: new Date().toISOString(),
      });
      results.spy = spy.price;
    } else {
      errors.spy = "No data returned for SPY";
    }
  } catch (e) {
    errors.spy = e.message;
  }

  // Sectors (individual ETF calls)
  try {
    const sectors = [];
    for (const [symbol, name] of Object.entries(SECTOR_ETFS)) {
      const quote = await fetchQuote(symbol);
      if (quote) {
        sectors.push({
          name: name,
          perf: quote.changePercentage,
        });
      }
    }
    await supabase.from("market_data").upsert({
      key: "sector_performance",
      value: sectors,
      updated_at: new Date().toISOString(),
    });
    results.sectors = sectors.length;
  } catch (e) {
    errors.sectors = e.message;
  }

  // CNN Fear & Greed Index (daily)
  try {
    const fgRes = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata/");
    if (fgRes.ok) {
      const fgData = await fgRes.json();
      const current = fgData?.fear_and_greed?.score;
      const rating = fgData?.fear_and_greed?.rating; // e.g. "Fear", "Greed", "Extreme Fear"
      if (current != null) {
        await supabase.from("market_data").upsert({
          key: "fear_greed",
          value: { score: Math.round(current), rating: rating || null, updated: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        });
        results.fear_greed = Math.round(current);
      }
    } else {
      errors.fear_greed = `CNN endpoint returned ${fgRes.status}`;
    }
  } catch (e) {
    errors.fear_greed = e.message;
  }

  return new Response(
    JSON.stringify({ ok: Object.keys(errors).length === 0, results, errors }),
    { status: 200 }
  );
});
