# UpTikAlerts — Project Memory

## Priority 1 — Core Product Goal
**Intuitive, low-friction, simple — to achieve stickiness.**

Every feature, UI change, and interaction decision must be evaluated against this goal first. When in doubt:
- Fewer taps > more taps
- Immediate clarity > explanatory text
- Default action visible > hidden in a menu
- Remove friction before adding features
- If it doesn't make the app stickier or simpler, don't ship it

## Rule — Apply On Every Change
Before making ANY change (code, UI, copy, data, flow), Claude must explicitly check it against the core goal: **"Intuitive, low-friction, simple — to achieve stickiness."** If a change adds friction, complexity, or cognitive load without a clear stickiness payoff, stop and propose a simpler alternative.

## Rule — Pull Before Starting Each Day
Every day before starting work on StockChat, Claude must pull the latest from the remote (`git pull`) to make sure the local tree matches origin before doing anything. This prevents editing stale files and creating merge conflicts against work Neal committed from another machine. Do this before any read, edit, build, or live test on the first action of the session.

## Rule — Always Test In Localhost First
After any code change, Claude must verify it live in localhost (via the browser MCP: navigate/screenshot/console) before reporting the change as done. No "should work" claims — confirm with eyes on the running app.

## Rule — pg_cron auth uses Supabase Vault

Any new pg_cron job that calls a Supabase edge function must read the JWT
from `vault.decrypted_secrets WHERE name = 'service_role_key'` for the
Authorization header. Do NOT use `current_setting('app.service_role_key', true)`
— that pattern requires ALTER DATABASE which Supabase blocks for the
postgres role, and the cron silently 401s with no visible error.

Pattern for the cron body:

  'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')

The vault secret itself is set up once manually via SQL Editor:

  SELECT vault.create_secret('<jwt>', 'service_role_key', '<description>');

See migrations 20260415000000_track_alert_performance_cron.sql and
20260502000000_scan_confluence_cron.sql for reference implementations.

## Rule — Pre-Commit Quality Checklist
Before reporting ANY code change as done, Claude must run through every item below. Report only real issues with file paths and line numbers. Do not report theoretical concerns.

### Build & Syntax
1. Run the build and confirm zero errors or warnings
2. Check for duplicate function names, duplicate CSS properties on the same element, and duplicate event listeners

### Values & Data
3. Check for hardcoded pixel values that should use variables, safe-area env(), or dynamic calculation — no hardcoded snapshots of runtime values (like viewport height on mount)
4. Check that no content is truncated, clipped, or cut off — especially on 320px wide screens and devices with notches/gesture bars
5. Check for code that fails silently: missing error handling, swallowed exceptions, unreachable code after early returns

### Layout & CSS
6. Check for double/stacked padding or margin between parent and child containers that could create visible gaps
7. Check for nested overflow:hidden chains that could clip content or break scrolling
8. Check that flex:1 children inside scrollable parents have minHeight:0, and flex children that should shrink have minWidth:0
9. Check that no inline styles change based on runtime state in a way that causes layout flashing or jumps (e.g., tab switches toggling overflow or padding)

### Mobile (iOS + Android)
10. Check that visualViewport or keyboard-handling code doesn't fire on desktop or when the component is display:none — and that getBoundingClientRect() isn't called on hidden elements (returns zeros)
11. Check that env(safe-area-inset-bottom) always has a fallback value and that bottom nav spacing is consistent across all tabs/views
12. Check for input bars and toolbars that might overflow or clip on narrow screens

### Tab / Route Persistence
13. Check that switching between display:none and display:flex doesn't break flex layout recalculation or cause content to disappear
14. Check that useEffects with DOM measurements don't run while the component is hidden

### Regression
15. List every page/tab/view affected by this change and confirm each one still works — do not ship changes that fix one view but break another

### Data & Metrics
16. When multiple numeric stats are shown side-by-side, confirm they describe the same population — same query, same filters, same sample
17. When showing a count, confirm it isn't secretly a display cap (.slice(0, N), .limit(N)) being presented as a real total
18. When showing a win rate or success ratio, confirm the UI threshold matches the backend scoring function's threshold
19. For any stat with n < 30, flag sample-size noise before shipping — don't present small-sample percentages as stable numbers
20. When Claude fixes a bug that represents a new failure class not covered by this checklist, propose a new item before reporting done

### Data Plumbing & Silent Failures
21. When mapping rows between fetch and render (useMemo projections, adapters, row builders), pass whole rows through by default. Hand-picked column allowlists silently drop data when the schema evolves — prefer `rows.slice(...)` over `rows.map(r => ({ a: r.a, b: r.b }))` unless there's a concrete reason to narrow.
22. When a fallback renders a sentinel value (em-dash, dash, N/A, null, 0, ""), it must log a dev-mode warning (`import.meta.env.DEV && console.warn(...)`) with enough context (signal_type, ticker, row) to diagnose. Silent sentinels let failures accumulate invisibly in production.
