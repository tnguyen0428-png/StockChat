// ============================================
// UPTIKALERTS — test-fanout (THROWAWAY VERIFICATION HARNESS)
//
// PURPOSE
// Exposes the fanout path (RPC join + optional SendGrid send) over HTTP
// so it can be verified against production without modifying
// scan-vol-surge or scan-confluence themselves and without spinning up
// a local Supabase stack.
//
// DRY-RUN GATE (FAIL-SAFE DEFAULT)
// To prevent accidentally emailing real watchers during plumbing
// verification, this harness defaults to dry-run mode: it calls the RPC
// to fetch recipients, logs them, and returns WITHOUT calling
// sendSignalAlertEmail. The only way to actually send is to explicitly
// set DRY_RUN=false in the function's edge secrets:
//
//   supabase secrets set DRY_RUN=false --project-ref <ref>
//
// Anything other than the literal string 'false' (including missing,
// empty, 'true', '0', or any typo) keeps the harness in dry-run.
// This gate is in addition to per-request scoping by ticker — by only
// seeding test user_watchlist rows on a specific test ticker, real
// watchers on real tickers are never returned by the RPC.
//
// The dry-run path also touches NOTHING in the DB: the breakout_alerts
// insert happens ONLY on a live run (DRY_RUN=false). There is deliberately no
// way to opt into a write during a dry-run — dry-run exists to prove the
// RPC join / fanout plumbing without leaving any trace in real alert data.
//
// LIFECYCLE
// This function exists for ONE verification run. After the production
// scanners are confirmed wired correctly, this function MUST be:
//   1. Deleted from the remote project (`supabase functions delete test-fanout`)
//   2. Deleted from this directory
// If you are reading this after that verification run, this file is
// orphaned — delete it.
//
// INVOCATION
//   POST /functions/v1/test-fanout
//   Authorization: Bearer <service_role_key>
//   Content-Type: application/json
//   {
//     "ticker": "NVDA",
//     "signal_type": "vol_surge",
//     "price": 175.75,
//     "change_pct": 3.21,
//     "skip_insert": false   // optional — set true to never insert, even on
//                            // a live run (fanout only). A dry-run never
//                            // inserts regardless of this flag.
//   }
//
// Returns JSON {
//   dry_run, insert_ok, insert_error,
//   recipients: [{ user_id, email }, ...],   // present in dry-run
//   fanout: { sent, failed, ... }            // present only when DRY_RUN=false
// }
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fanoutSignalAlertEmail } from '../_shared/fanout-signal-email.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const ticker      = typeof body.ticker === 'string'      ? body.ticker      : null;
  const signal_type = typeof body.signal_type === 'string' ? body.signal_type : 'vol_surge';
  const price       = typeof body.price === 'number'       ? body.price       : null;
  const change_pct  = typeof body.change_pct === 'number'  ? body.change_pct  : null;
  const skip_insert = body.skip_insert === true;

  if (!ticker)            return json({ error: 'ticker required' }, 400);
  if (price === null)     return json({ error: 'price required (number)' }, 400);
  if (change_pct === null) return json({ error: 'change_pct required (number)' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Fail-safe gate: anything other than the literal 'false' string keeps
  // the harness in dry-run. Missing/empty/typo'd env values all stay safe.
  const dry_run = Deno.env.get('DRY_RUN') !== 'false';

  // On a LIVE run, insert a real breakout_alerts row so the verification
  // mirrors what scan-vol-surge produces (CLAUDE.md rule 15: confirm the row
  // lands in DB before fanout fires). Fail-safe: a dry-run NEVER writes — there
  // is deliberately no opt-in to insert during a dry-run, so plumbing checks
  // can't pollute real alert data or the stats counts. `skip_insert` suppresses
  // the write even on a live run (fanout-only).
  const do_insert = !skip_insert && !dry_run;
  let insert_ok = false;
  let insert_error: string | null = null;
  if (do_insert) {
    const sign = change_pct >= 0 ? '+' : '';
    const { error } = await supabase.from('breakout_alerts').insert({
      signal_type,
      tickers:    [ticker],
      title:      `${ticker} Test Surge`,
      body:       `$${price} test alert · ${sign}${change_pct}%`,
      sent_by:    'scanner:test-fanout',
    });
    insert_ok = !error;
    insert_error = error?.message ?? null;
  }

  if (dry_run) {
    // Mirror the same RPC the helper would call, but stop short of sending.
    // Surfaces exactly which user_id / email values would have been emailed
    // so we can prove the join is correct without touching SendGrid.
    const { data, error } = await supabase.rpc('get_signal_email_recipients', {
      p_ticker: ticker,
    });
    if (error) {
      console.error('[test-fanout] dry-run RPC failed', { ticker, error: error.message });
      return json({
        ticker, signal_type, dry_run: true, insert_ok, insert_error,
        rpc_error: error.message, recipients: [],
      });
    }
    const recipients = (data as Array<{ user_id: string; email: string }> | null) ?? [];
    console.log(`[test-fanout] DRY_RUN ${signal_type} ${ticker}: ${recipients.length} recipients would have been emailed`);
    return json({
      ticker, signal_type, dry_run: true, insert_ok, insert_error,
      recipients,
    });
  }

  const fanout = await fanoutSignalAlertEmail(supabase, {
    ticker,
    signal_type,
    price,
    change_pct,
    triggered_at: new Date(),
  });

  return json({ ticker, signal_type, dry_run: false, insert_ok, insert_error, fanout });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
