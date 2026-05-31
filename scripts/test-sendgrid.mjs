// ============================================
// UPTIKALERTS — one-shot SendGrid health check
//
// Mirrors the exact payload built in
// supabase/functions/_shared/send-signal-email.ts so a 202 here means
// the production helper would also succeed: same template, same sender
// identity, same ASM group, same dynamic_template_data keys.
//
// Usage:
//   SENDGRID_API_KEY=<new key>  TEST_TO=you@example.com  node scripts/test-sendgrid.mjs
//
// Exit code 0 = SendGrid accepted (HTTP 202). Anything else = failure
// and the response body is printed for diagnosis.
// ============================================

const apiKey = process.env.SENDGRID_API_KEY;
const to     = process.env.TEST_TO;

if (!apiKey) {
  console.error('FAIL: SENDGRID_API_KEY env var is not set.');
  console.error('Run with: SENDGRID_API_KEY=<key> TEST_TO=you@example.com node scripts/test-sendgrid.mjs');
  process.exit(2);
}

if (!to) {
  console.error('FAIL: TEST_TO env var is not set (recipient address).');
  console.error('Run with: SENDGRID_API_KEY=<key> TEST_TO=you@example.com node scripts/test-sendgrid.mjs');
  process.exit(2);
}

const SENDGRID_TEMPLATE_ID  = 'd-3d1642ef82484b10b699923d23112763';
const SENDGRID_FROM_EMAIL   = 'noreply@uptikalerts.com';
const SENDGRID_FROM_NAME    = 'UpTikAlerts';
const SENDGRID_ASM_GROUP_ID = 33466;
const APP_BASE_URL          = 'https://uptikalerts.com';

const now    = new Date();
const fmt    = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
});
const ticker = 'NVDA';
const signal = 'vol_surge';

const payload = {
  from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
  personalizations: [{
    to: [{ email: to }],
    dynamic_template_data: {
      ticker:        ticker,
      company_name:  'NVIDIA Corporation',
      signal_type:   'Volume Surge',
      triggered_at:  `${fmt.format(now)} ET`,
      price:         '925.43',
      change_pct:    '+3.21%',
      change_color:  '#10b981',
      cta_url:       `${APP_BASE_URL}/ticker/${ticker}?utm_source=email&utm_medium=alert&utm_campaign=${signal}&test=1`,
      mute_url:      `${APP_BASE_URL}/alerts/mute?ticker=${ticker}`,
      settings_url:  `${APP_BASE_URL}/settings/alerts`,
    },
  }],
  template_id: SENDGRID_TEMPLATE_ID,
  asm: {
    group_id:           SENDGRID_ASM_GROUP_ID,
    groups_to_display: [SENDGRID_ASM_GROUP_ID],
  },
  // Tag this send so it's easy to find in SendGrid Activity → Search.
  custom_args: { test_run: 'post-upgrade-health-check' },
  categories: ['health-check'],
};

console.log(`→ Sending test signal-alert email to ${to} via SendGrid…`);
console.log(`  template_id: ${SENDGRID_TEMPLATE_ID}`);
console.log(`  from:        ${SENDGRID_FROM_NAME} <${SENDGRID_FROM_EMAIL}>`);
console.log(`  asm_group:   ${SENDGRID_ASM_GROUP_ID}`);

const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify(payload),
});

const xMsgId = res.headers.get('x-message-id');

if (res.status === 202) {
  console.log(`\n✓ SendGrid accepted (HTTP 202).`);
  if (xMsgId) console.log(`  x-message-id: ${xMsgId}`);
  console.log(`  Check Activity Feed in SendGrid dashboard and the inbox at ${to} within ~30s.`);
  process.exit(0);
} else {
  const body = await res.text();
  console.error(`\n✗ SendGrid rejected: HTTP ${res.status}`);
  console.error(body);
  process.exit(1);
}
