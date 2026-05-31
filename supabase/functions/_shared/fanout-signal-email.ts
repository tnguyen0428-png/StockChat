// ============================================
// UPTIKALERTS — fanoutSignalAlertEmail
//
// Called by scan-vol-surge and scan-confluence immediately after a
// breakout_alerts row lands. Pulls watchers via the public RPC
// get_signal_email_recipients (joins user_watchlist + auth.users behind
// SECURITY DEFINER so we don't expose the auth schema), then fans out
// to sendSignalAlertEmail with Promise.allSettled.
//
// Contract:
//   - Never throws. Email is best-effort; the alert row in DB is the
//     source of truth, so a failed fanout must not break the scanner.
//   - Returns { sent, failed, skipped_reason?, results } so the caller can
//     log a one-line summary.
//   - Each failure is logged with full context (signal_type, ticker,
//     recipient, status, error) — CLAUDE.md rule #22.
//   - change_pct or price null at entry → skip the whole fanout (alert
//     still landed). Rendering "+0.00%" / "$null" would be the sentinel
//     rule #22 forbids.
// ============================================

import { sendSignalAlertEmail, type SignalEmailResult } from './send-signal-email.ts';

// Loose typing on the supabase client to avoid the version-dependent
// @supabase/supabase-js generic noise. The scanners pass us their own
// service-role client; we only need .rpc() off it.
type ServiceClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export interface SignalFanoutInput {
  ticker: string;
  signal_type: string;            // internal slug, e.g. 'vol_surge' | 'confluence'
  price: number | null;
  change_pct: number | null;
  triggered_at: Date;
}

export interface SignalFanoutSummary {
  sent: number;
  failed: number;
  skipped_reason?: string;
  results: SignalEmailResult[];
}

interface Recipient {
  user_id: string;
  email: string;
}

export async function fanoutSignalAlertEmail(
  supabase: ServiceClient,
  input: SignalFanoutInput,
): Promise<SignalFanoutSummary> {
  // Guard: missing numeric fields would render as sentinel values in the
  // email ("+0.00%", "$null"). Skip the send and warn loudly per rule #22
  // so the gap shows up in logs instead of silently degrading the email.
  if (input.price == null || input.change_pct == null) {
    console.warn('[fanout] skipping send — missing numeric field', {
      signal_type: input.signal_type,
      ticker: input.ticker,
      price: input.price,
      change_pct: input.change_pct,
    });
    return { sent: 0, failed: 0, skipped_reason: 'missing_numeric_field', results: [] };
  }

  // Single round trip through the SECURITY DEFINER RPC — no auth.users
  // exposure, no N+1. The RPC joins user_watchlist → auth.users on the
  // ticker and filters to confirmed addresses (email_confirmed_at IS NOT
  // NULL). There is no email_alerts_enabled column — see migration
  // 20260522000000_get_signal_email_recipients.sql.
  const { data, error } = await supabase.rpc('get_signal_email_recipients', {
    p_ticker: input.ticker,
  });

  if (error) {
    console.error('[fanout] recipients RPC failed', {
      signal_type: input.signal_type,
      ticker: input.ticker,
      error: error.message,
    });
    return { sent: 0, failed: 0, skipped_reason: 'rpc_error', results: [] };
  }

  const recipients = (data as Recipient[] | null) ?? [];
  if (recipients.length === 0) {
    // Legitimate "nobody opted in" — log at info level, not warn.
    console.log(`[fanout] ${input.signal_type} ${input.ticker}: 0 recipients`);
    return { sent: 0, failed: 0, results: [] };
  }

  // Parallel send. Each call is independent so one failure doesn't
  // delay or block the others. The helper itself never throws — every
  // failure is in the resolved result — so allSettled is defensive
  // belt-and-suspenders against an unexpected runtime error.
  const settled = await Promise.allSettled(
    recipients.map((r) => {
      // Defensive: RPC filters NULL emails, but a malformed row would
      // still cause the helper to fail. Warn and skip the row itself
      // rather than letting it pollute the failure count.
      if (!r.email) {
        console.warn('[fanout] recipient missing email', {
          signal_type: input.signal_type,
          ticker: input.ticker,
          user_id: r.user_id,
        });
        return Promise.resolve<SignalEmailResult>({
          ok: false,
          recipient: '',
          ticker: input.ticker,
          error: 'missing_email_for_user_id:' + r.user_id,
        });
      }
      return sendSignalAlertEmail({
        recipient_email: r.email,
        ticker:          input.ticker,
        signal_type:     input.signal_type,
        price:           input.price as number,
        change_pct:      input.change_pct as number,
        triggered_at:    input.triggered_at,
      });
    }),
  );

  const results: SignalEmailResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    // Should be unreachable — the helper traps its own exceptions —
    // but if it somehow throws, record it as a failure with context
    // so debugging doesn't require a SendGrid Activity Feed dive.
    const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
    return {
      ok: false,
      recipient: recipients[i]?.email ?? '',
      ticker: input.ticker,
      error: `helper_threw:${reason}`,
    };
  });

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      sent++;
    } else {
      failed++;
      console.error('[fanout] send failed', {
        signal_type: input.signal_type,
        ticker: input.ticker,
        recipient: r.recipient,
        status: r.status,
        error: r.error,
      });
    }
  }

  console.log(`[fanout] ${input.signal_type} ${input.ticker}: sent=${sent} failed=${failed} total=${recipients.length}`);
  return { sent, failed, results };
}
