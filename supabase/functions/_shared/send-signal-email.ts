// ============================================
// UPTIKALERTS — SendGrid signal-alert email helper
//
// Sends a single transactional alert via SendGrid Dynamic Template
// d-3d1642ef82484b10b699923d23112763 (signal-alert-v1).
//
// IMPORTANT: never throws. The scanner must not crash if SendGrid is
// rate-limited, down, or the API key rotates. All failures are returned
// in the result object so the caller can log them.
// ============================================

const SENDGRID_TEMPLATE_ID = 'd-3d1642ef82484b10b699923d23112763';
const SENDGRID_FROM_EMAIL  = 'noreply@uptikalerts.com';
const SENDGRID_FROM_NAME   = 'UpTikAlerts';
const APP_BASE_URL         = 'https://uptikalerts.com';

// SendGrid Unsubscribe Group (ASM = Advanced Suppression Manager).
// All signal-alert emails ship with this group_id so:
//   1. SendGrid auto-suppresses recipients who clicked Unsubscribe (defense
//      in depth — even if our recipient query ever returns someone who has
//      opted out, SendGrid still blocks the send).
//   2. The email body's <%asm_group_unsubscribe_raw_url%> tag resolves to
//      a one-click opt-out URL specific to this group.
//   3. CAN-SPAM compliance: each commercial email has a working unsubscribe.
//
// IMPORTANT: this group is intentionally NOT marked "default" in SendGrid.
// Auth emails (Supabase signup/reset) use a different channel (SMTP) and
// must NOT be subject to this group's suppressions.
const SENDGRID_ASM_GROUP_ID = 33466; // "Signal Alerts" group

// ── Static company-name map ──────────────────────────────────────────
// Mirrors the WATCHLIST in scan-vol-surge. Keep in sync when the
// watchlist changes. (Cheaper than calling Polygon's ticker-details
// endpoint on every email.)
const COMPANY_NAMES: Record<string, string> = {
  NVDA:  'NVIDIA Corporation',
  PLTR:  'Palantir Technologies',
  SMCI:  'Super Micro Computer',
  CRWD:  'CrowdStrike Holdings',
  AAPL:  'Apple Inc.',
  TSLA:  'Tesla, Inc.',
  AMD:   'Advanced Micro Devices',
  META:  'Meta Platforms',
  AMZN:  'Amazon.com, Inc.',
  MSFT:  'Microsoft Corporation',
  GOOGL: 'Alphabet Inc.',
  SOFI:  'SoFi Technologies',
  COIN:  'Coinbase Global',
  MARA:  'MARA Holdings',
  RIVN:  'Rivian Automotive',
};

// Maps internal signal_type slugs → human-readable labels for the email.
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  vol_surge: 'Volume Surge',
  breakout:  'Breakout',
  breakdown: 'Breakdown',
};

export interface SignalEmailInput {
  recipient_email: string;
  ticker: string;
  signal_type: string;   // internal slug, e.g. 'vol_surge'
  price: number;
  change_pct: number;
  triggered_at: Date;
}

export interface SignalEmailResult {
  ok: boolean;
  recipient: string;
  ticker: string;
  status?: number;
  error?: string;
}

export async function sendSignalAlertEmail(
  input: SignalEmailInput,
): Promise<SignalEmailResult> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      recipient: input.recipient_email,
      ticker: input.ticker,
      error: 'Missing env var: SENDGRID_API_KEY',
    };
  }

  const sign        = input.change_pct >= 0 ? '+' : '';
  const changeColor = input.change_pct >= 0 ? '#10b981' : '#ef4444';

  // Warn loudly when sentinel fallbacks fire — these silently degrade the
  // email if a new ticker or signal_type slips through without being added
  // to the static maps above. (CLAUDE.md rule #22.)
  const companyName = COMPANY_NAMES[input.ticker];
  if (!companyName) {
    console.warn(`[send-signal-email] missing company_name for ticker=${input.ticker} — falling back to ticker symbol. Add it to COMPANY_NAMES.`);
  }
  const signalLabel = SIGNAL_TYPE_LABELS[input.signal_type];
  if (!signalLabel) {
    console.warn(`[send-signal-email] missing label for signal_type=${input.signal_type} — falling back to raw slug. Add it to SIGNAL_TYPE_LABELS.`);
  }

  const payload = {
    from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
    personalizations: [{
      to: [{ email: input.recipient_email }],
      dynamic_template_data: {
        ticker:        input.ticker,
        company_name:  companyName ?? input.ticker,
        signal_type:   signalLabel ?? input.signal_type,
        triggered_at:  formatEt(input.triggered_at),
        price:         input.price.toFixed(2),
        change_pct:    `${sign}${input.change_pct.toFixed(2)}%`,
        change_color:  changeColor,
        cta_url:       `${APP_BASE_URL}/ticker/${input.ticker}?utm_source=email&utm_medium=alert&utm_campaign=${input.signal_type}`,
        mute_url:      `${APP_BASE_URL}/alerts/mute?ticker=${input.ticker}`,
        settings_url:  `${APP_BASE_URL}/settings/alerts`,
      },
    }],
    template_id: SENDGRID_TEMPLATE_ID,
    asm: {
      group_id: SENDGRID_ASM_GROUP_ID,
      groups_to_display: [SENDGRID_ASM_GROUP_ID],
    },
  };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    // SendGrid returns 202 on success with empty body
    if (res.status === 202) {
      return { ok: true, recipient: input.recipient_email, ticker: input.ticker, status: 202 };
    }

    const body = await res.text();
    return {
      ok: false,
      recipient: input.recipient_email,
      ticker: input.ticker,
      status: res.status,
      error: `SendGrid HTTP ${res.status}: ${body.slice(0, 300)}`,
    };
  } catch (err) {
    return {
      ok: false,
      recipient: input.recipient_email,
      ticker: input.ticker,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// "2:34 PM ET" — uses Intl.DateTimeFormat with timeZone: 'America/New_York'
// so DST transitions (EDT/EST) are handled automatically. Hardcoding a
// fixed UTC offset like -04:00 is wrong half the year (EST = UTC-5
// Nov–Mar) and would put the user-visible time off by an hour.
function formatEt(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${fmt.format(d)} ET`;
}
