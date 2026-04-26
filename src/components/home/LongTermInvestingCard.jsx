// ============================================
// UPTIKALERTS — LongTermInvestingCard.jsx
// Content-only renderer for the Long Term Investing view inside the stocks
// card. Anchors the lesson on S&P 500 historical returns (~10% annual with
// dividends since 1928). Three at-a-glance scorecards up top show what $10k
// would have grown to over 10 / 20 / 30 years. Below, a live calculator lets
// the user plug their own starting amount, monthly contribution, time
// horizon, and assumed return — the result card explicitly breaks out how
// much of the final value came from compounding vs from contributions.
//
// The growth chart is the "Skyline Bars" design from the chart-redesign
// handoff: one bar per year, hatched contributions on the bottom, solid
// brand-blue gains stacked on top, and the snowball year (first year gains
// exceed contributions) highlighted in warm yellow with a soft glow column,
// a dashed marker, and a small "❄ SNOWBALL · YR n" pill above the chart.
// Tap or drag to scrub; arrow keys step year by year. The tooltip in the
// top-right shows the inspected year's value at all times.
// ============================================

import { useState, useMemo, useRef, useEffect } from 'react';

// Pre-computed at the S&P long-term average (10% annual, dividends reinvested).
// Each scenario assumes a one-time $10k lump sum (no monthly contributions),
// so users can mentally extrapolate. Footnote handles the disclaimer.
const SCORECARDS = [
  { years: 10, value: 25937, label: '$10k in the S&P 10 yrs ago' },
  { years: 20, value: 67275, label: '$10k in the S&P 20 yrs ago' },
  { years: 30, value: 174494, label: '$10k in the S&P 30 yrs ago' },
];

const RATE_HINTS = [
  { value: 3,  label: '3% bonds' },
  { value: 10, label: '10% S&P avg' },
  { value: 20, label: '20% growth' },
  { value: 40, label: '40% speculative' },
];

// Chart design tokens from the Skyline handoff. Some map onto the app theme
// (mute → t.text3, rule → t.border) but the brand-blue and warm-yellow
// chart palette is fixed by the design spec, not theme-dependent.
const CHART_BLUE       = '#4a90d9';
const CHART_INK        = '#0f1d2e';
const CHART_SNOWBALL   = '#f0b341';
const CHART_SNOWBALL_SOFT = '#fff5dd';

// ---------- math (lifted directly from the design handoff) ----------

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

// "$5k" / "$250k" / "$1.5M" — used for axis labels, tooltip, and hero number.
// Keeps trailing-zero suppression in the M range so we render "$1M" not
// "$1.00M".
function fmtCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) {
    return '$' + (n / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  }
  if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + Math.round(n);
}

// Round a Y-axis max up to a 1 / 2 / 2.5 / 5 / 10 × 10^n tier so gridlines
// land on aesthetically clean values regardless of the projection size.
function niceMax(maxValue) {
  if (maxValue <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const norm = maxValue / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

// Builds [{year, total, contributed, gain}, ...] year 0 → year N.
// Monthly compounding with deposits at the START of each month, which is
// how brokerages typically handle DRIP / auto-deposit. Returns a fresh
// array; safe to memoize.
function buildChartSeries(principal, monthly, ratePct, years) {
  const m = ratePct / 100 / 12;
  const out = [];
  let bal = principal;
  let contributed = principal;
  out.push({ year: 0, total: bal, contributed, gain: 0 });
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < 12; i++) {
      bal = bal * (1 + m) + monthly;
      contributed += monthly;
    }
    out.push({ year: y, total: bal, contributed, gain: bal - contributed });
  }
  return out;
}

// First year where compounded gains meet or exceed contributed dollars.
// Returns null when it never crosses (e.g., short horizons at low rates
// with heavy ongoing contributions). Caller hides snowball decorations
// when this is null.
function findSnowball(series) {
  for (let i = 1; i < series.length; i++) {
    if (series[i].gain >= series[i].contributed) return i;
  }
  return null;
}

function rateBucket(r) {
  if (r >= 9.5 && r <= 10.5) return 'S&P average';
  if (r >= 6.5 && r <= 7.5) return 'inflation-adjusted';
  if (r <= 4)               return 'bond-like return';
  if (r >= 12 && r < 18)    return 'bull-market pace';
  if (r >= 18 && r < 28)    return 'aggressive growth';
  if (r >= 28)              return 'very speculative';
  return r.toFixed(1) + '% annual';
}

// ---------- main component ----------

export default function LongTermInvestingCard({ t }) {
  const [start, setStart]     = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears]     = useState(20);
  const [rate, setRate]       = useState(10);
  // Year the chart is currently inspecting via tap/drag/keyboard. Defaults
  // to the final year so the at-rest tooltip shows the projected total.
  // Re-clamps when `years` shrinks below the active scrub.
  const [scrubYear, setScrubYear] = useState(20);
  useEffect(() => {
    if (scrubYear > years) setScrubYear(years);
  }, [years, scrubYear]);

  const series = useMemo(
    () => buildChartSeries(start, monthly, rate, years),
    [start, monthly, rate, years]
  );
  const snowballYear = useMemo(() => findSnowball(series), [series]);
  const final = series[series.length - 1];
  const compoundedShare = final.total > 0
    ? Math.round((final.gain / final.total) * 100)
    : 0;

  return (
    <div>
      {/* Section header — mirrors stocksHeaderRow rhythm */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${t.border}`,
        background: t.surface,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 600, color: t.text3,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>The power of compound returns</span>
      </div>

      <div style={{ padding: '14px 12px' }}>

        {/* Educational lead */}
        <p style={{
          fontSize: 12, color: t.text1, lineHeight: 1.55,
          margin: '0 0 14px',
        }}>
          Compounding means your returns start earning returns too. Over a decade or two, the snowball does most of the heavy lifting — not stock picking.
        </p>

        {/* Historical scorecards */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          marginBottom: 16,
        }}>
          {SCORECARDS.map(c => (
            <div key={c.years} style={{
              background: t.surface, borderRadius: 8,
              padding: '10px 8px',
              border: `0.5px solid ${t.border}`,
            }}>
              <div style={{ fontSize: 10, color: t.text3, marginBottom: 3, lineHeight: 1.3 }}>
                {c.label}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700, color: t.text1,
                fontFamily: "'Outfit', sans-serif",
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}>{fmt(c.value)}</div>
              <div style={{ fontSize: 9, color: t.text3, marginTop: 2 }}>at S&P avg ~10%</div>
            </div>
          ))}
        </div>

        {/* Calculator section */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: t.text3,
          textTransform: 'uppercase', letterSpacing: 0.5,
          marginBottom: 10,
        }}>Try your own numbers</div>

        <SliderRow
          label="Starting amount"
          value={start}
          min={1000} max={1000000} step={1000}
          onChange={setStart}
          display={fmt(start)}
          t={t}
        />
        <SliderRow
          label="Monthly contribution"
          value={monthly}
          min={0} max={10000} step={50}
          onChange={setMonthly}
          display={fmt(monthly)}
          t={t}
        />
        <SliderRow
          label="Years invested"
          value={years}
          min={5} max={40} step={1}
          onChange={setYears}
          display={`${years} yrs`}
          t={t}
        />
        <SliderRow
          label="Annual return"
          value={rate}
          min={3} max={40} step={0.5}
          onChange={setRate}
          display={`${rate.toFixed(1)}%`}
          t={t}
        />

        {/* Rate hint markers under the rate slider — spans the slider width
            (which is now full-width inside SliderRow) so the labels actually
            sit under the slider track instead of running past its right edge. */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: t.text3,
          margin: '0 0 14px',
        }}>
          {RATE_HINTS.map(h => (
            <span key={h.value}>{h.label}</span>
          ))}
        </div>

        {/* Result / hero card — shows the projected total + the contributions
            vs gains breakdown, anchoring the chart's takeaway in plain
            numbers. The chart below visualizes the same data per-year. */}
        <div style={{
          background: 'rgba(74,144,217,0.08)',
          border: '0.5px solid rgba(74,144,217,0.3)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: '#4a90d9', marginBottom: 3 }}>
            After {years} years at {rateBucket(rate)}
          </div>
          <div style={{
            fontSize: 24, fontWeight: 700, color: '#4a90d9',
            fontFamily: "'Outfit', sans-serif",
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}>{fmt(final.total)}</div>
          <div style={{
            fontSize: 11, color: '#4a90d9', opacity: 0.85, marginTop: 5,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.45,
          }}>
            {fmt(final.contributed)} contributed · {fmt(final.gain)} gained
            <br />
            <strong style={{ fontWeight: 600 }}>{compoundedShare}%</strong> of your total came from compounding
          </div>
        </div>

        {/* Skyline Bars chart — implementation of the design handoff. */}
        <SkylineBars
          series={series}
          snowballYear={snowballYear}
          scrubYear={scrubYear}
          setScrubYear={setScrubYear}
          years={years}
          t={t}
        />

        {/* Legend — 3 items per the spec: solid Gains swatch, hatched
            Contributions swatch, warm Snowball-year swatch. */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          fontSize: 10, color: t.text3,
          flexWrap: 'wrap',
          marginTop: 8, marginBottom: 12,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: CHART_BLUE, display: 'inline-block',
            }} />
            Gains
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              border: `1px solid ${CHART_BLUE}`,
              background: `repeating-linear-gradient(45deg, ${CHART_BLUE}, ${CHART_BLUE} 1.5px, transparent 1.5px, transparent 3px)`,
              display: 'inline-block',
            }} />
            Contributions
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: CHART_SNOWBALL, display: 'inline-block',
            }} />
            Snowball year
          </span>
        </div>

        {/* Footnote */}
        <div style={{
          fontSize: 10, color: t.text3, lineHeight: 1.5, fontStyle: 'italic',
        }}>
          The S&P 500 has averaged about 10% annual returns since 1928 with dividends reinvested (roughly 7% after inflation). Past performance does not guarantee future results.
        </div>
      </div>
    </div>
  );
}

// ---------- Slider row (unchanged from prior fix) ----------

// Slider row — label + value on top, full-width native range input below.
// Stacked layout (vs side-by-side) prevents label-column wrapping at narrow
// widths ("Monthly contribution" was wrapping to two lines under the old
// fixed-100px label column) and gives the slider the full content width for
// a bigger touch target. The label/value pair uses space-between so the
// readout stays right-aligned without a brittle minWidth.
function SliderRow({ label, value, min, max, step, onChange, display, t }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 8,
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 11, color: t.text3 }}>{label}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: t.text1,
          fontVariantNumeric: 'tabular-nums',
        }}>{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#4a90d9', display: 'block', margin: 0 }}
      />
    </div>
  );
}

// ---------- Skyline Bars chart subcomponent ----------
//
// One bar per year, two stacked segments per bar:
//   bottom = hatched contributions (deposits user made by that year)
//   top    = solid gains (compounding earnings on top of deposits)
// On the snowball year (first year gains exceed contributions) the gains
// segment is solid warm yellow with a vertical glow column behind it, a
// dashed warm-yellow marker line through the bar, and a small "❄ SNOWBALL
// · YR n" pill above the chart. Tap/drag/keyboard scrubs the active year
// and updates the top-right tooltip.
function SkylineBars({ series, snowballYear, scrubYear, setScrubYear, years, t }) {
  // Fixed viewBox so the chart scales uniformly with whatever pixel width
  // its container gives it. 336×200 ≈ the design's 1.66:1 aspect.
  const W = 336;
  const H = 200;
  const padL = 36;
  const padR = 10;
  const padT = 26;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Bar gap shrinks as years grow so the bars stay readable without
  // overflowing the inner width. Per the handoff.
  const gap = years <= 10 ? 3 : years <= 20 ? 2 : 1;
  const barWidth = (innerW - gap * years) / (years + 1);

  // Y axis: round the projection's max up to a "nice" tier so gridlines
  // land on $0 / midV / maxV cleanly regardless of input.
  const maxV = useMemo(() => {
    const m = series.reduce((a, p) => Math.max(a, p.total), 0);
    return niceMax(m);
  }, [series]);

  const xFor = (yearIdx) => padL + (barWidth + gap) * yearIdx;
  const yFor = (v) => padT + innerH - (maxV > 0 ? (v / maxV) * innerH : 0);
  const baseline = padT + innerH;

  const svgRef = useRef(null);
  const [isPressed, setIsPressed] = useState(false);

  // Map a clientX to the closest year by snapping to the nearest bar's
  // center. Same handler covers tap and drag.
  const updateScrubFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i <= years; i++) {
      const cx = xFor(i) + barWidth / 2;
      const d = Math.abs(cx - vbX);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    setScrubYear(Math.max(0, Math.min(years, nearest)));
  };

  const handlePointerDown = (e) => {
    setIsPressed(true);
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
    updateScrubFromEvent(e);
  };
  const handlePointerMove = (e) => {
    if (isPressed) updateScrubFromEvent(e);
  };
  const handlePointerUp = () => setIsPressed(false);

  const handleKeyDown = (e) => {
    let next = scrubYear;
    if (e.key === 'ArrowLeft')      next = Math.max(0, scrubYear - 1);
    else if (e.key === 'ArrowRight') next = Math.min(years, scrubYear + 1);
    else if (e.key === 'Home')       next = 0;
    else if (e.key === 'End')        next = years;
    else if (e.key === 'PageDown')   next = Math.max(0, scrubYear - 5);
    else if (e.key === 'PageUp')     next = Math.min(years, scrubYear + 5);
    else return;
    e.preventDefault();
    setScrubYear(next);
  };

  // X-axis tick labels: sparse 0 / ¼ / ½ / ¾ / N years.
  const xTicks = useMemo(() => {
    if (years <= 0) return [0];
    const ticks = [0, Math.round(years / 4), Math.round(years / 2), Math.round((3 * years) / 4), years];
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [years]);

  // Tooltip data (always shown — defaults to scrubYear, which defaults
  // to final year). Defined first because the snowball pill needs to
  // clamp to the tooltip's left edge.
  const ttPt = series[Math.max(0, Math.min(scrubYear, series.length - 1))];
  const ttW = 78;
  const ttH = 26;
  const ttX = W - padR - ttW;
  const ttY = 4;

  // Snowball pill — clamped on the left to the chart's left padding, on
  // the right to the tooltip's left edge minus a 4px gap so the two never
  // overlap regardless of where the snowball year lands.
  const snowballBarX = snowballYear !== null ? xFor(snowballYear) : 0;
  const snowballBarCx = snowballBarX + barWidth / 2;
  const pillW = 86;
  const pillH = 14;
  const pillRightLimit = ttX - 4 - pillW;
  const pillX = snowballYear !== null
    ? Math.max(padL, Math.min(pillRightLimit, snowballBarCx - pillW / 2))
    : 0;
  const pillY = 6;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%', height: 'auto', display: 'block',
          touchAction: 'none', userSelect: 'none',
          cursor: isPressed ? 'grabbing' : 'pointer',
        }}
        role="slider"
        aria-label="Year scrubber"
        aria-valuemin={0}
        aria-valuemax={years}
        aria-valuenow={scrubYear}
        aria-valuetext={`Year ${scrubYear}, ${fmtCompact(ttPt.total)}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <defs>
          {/* 45° hatched pattern for contributions. Drawing the diagonal
              stripe directly via a path beats patternTransform="rotate(45)"
              on a tiny cell — the latter under-renders at narrow bar widths
              because each cell only contains a sliver of the rotated line.
              Matches the design's 1.5px stripe / 3px spacing visual. */}
          <pattern
            id="hatch"
            patternUnits="userSpaceOnUse"
            width="6" height="6"
          >
            <path d="M -1 7 L 7 -1 M -1 1 L 1 -1 M 5 7 L 7 5"
                  stroke={CHART_BLUE} strokeWidth="1.5" />
          </pattern>

          {/* Soft warm-yellow vertical gradient for the snowball glow column */}
          <linearGradient id="snowballGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={CHART_SNOWBALL} stopOpacity="0" />
            <stop offset="50%"  stopColor={CHART_SNOWBALL} stopOpacity="0.25" />
            <stop offset="100%" stopColor={CHART_SNOWBALL} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Snowball glow column — back layer, slightly wider than the bar
            and extending past the chart top/bottom for a softer halo. */}
        {snowballYear !== null && (
          <rect
            x={snowballBarX - 4}
            y={padT - 8}
            width={barWidth + 8}
            height={innerH + 16}
            fill="url(#snowballGlow)"
          />
        )}

        {/* Y gridlines — solid baseline, dashed midline + top */}
        {[0, maxV / 2, maxV].map((v, i) => (
          <line
            key={`g${i}`}
            x1={padL} x2={W - padR}
            y1={yFor(v)} y2={yFor(v)}
            stroke={t.border}
            strokeWidth="1"
            strokeDasharray={i === 0 ? '0' : '2 4'}
            opacity={i === 0 ? 0.95 : 0.7}
          />
        ))}

        {/* Y-axis labels at $0 / mid / max */}
        {[0, maxV / 2, maxV].map((v, i) => (
          <text
            key={`yl${i}`}
            x={padL - 6}
            y={yFor(v) + 3}
            fontSize="10"
            fontFamily="'Outfit', sans-serif"
            fontWeight="500"
            fill={t.text3}
            textAnchor="end"
            fontVariantNumeric="tabular-nums"
          >
            {fmtCompact(v)}
          </text>
        ))}

        {/* Bars */}
        {series.map((p, i) => {
          const x = xFor(i);
          const yTop = yFor(p.total);
          const yMid = yFor(p.contributed);
          const isSnowball = i === snowballYear;
          const gainsFill = isSnowball ? CHART_SNOWBALL : CHART_BLUE;
          return (
            <g key={`b${i}`}>
              {/* Contributions (lower) — hatched. No outline stroke because
                  on narrow bars (12px) it competes with the pattern. */}
              {yMid < baseline && (
                <rect
                  x={x}
                  y={yMid}
                  width={barWidth}
                  height={Math.max(0, baseline - yMid)}
                  fill="url(#hatch)"
                />
              )}
              {/* Gains (upper) — solid blue, or warm yellow on snowball year */}
              {yTop < yMid && (
                <rect
                  x={x}
                  y={yTop}
                  width={barWidth}
                  height={Math.max(0, yMid - yTop)}
                  fill={gainsFill}
                />
              )}
            </g>
          );
        })}

        {/* Current-year outline (the scrubbed bar) — drawn after bars so it
            sits on top, 1px outset for visual separation. */}
        {scrubYear >= 0 && scrubYear <= years && (() => {
          const p = series[scrubYear];
          const x = xFor(scrubYear);
          const yTop = yFor(p.total);
          return (
            <rect
              x={x - 1}
              y={yTop - 1}
              width={barWidth + 2}
              height={baseline - yTop + 2}
              fill="none"
              stroke={CHART_INK}
              strokeWidth="1.5"
              pointerEvents="none"
            />
          );
        })()}

        {/* Snowball dashed marker line through the snowball year */}
        {snowballYear !== null && (
          <line
            x1={snowballBarCx} x2={snowballBarCx}
            y1={padT - 2} y2={baseline + 2}
            stroke={CHART_SNOWBALL}
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.7"
            pointerEvents="none"
          />
        )}

        {/* Snowball pill above the chart — "❄ SNOWBALL · YR n" */}
        {snowballYear !== null && (
          <g pointerEvents="none">
            <rect
              x={pillX}
              y={pillY}
              width={pillW}
              height={pillH}
              rx="3"
              fill={CHART_SNOWBALL}
            />
            <text
              x={pillX + pillW / 2}
              y={pillY + 10}
              fontSize="9"
              fontFamily="'Outfit', sans-serif"
              fontWeight="700"
              fill={CHART_INK}
              textAnchor="middle"
              letterSpacing="0.04em"
            >
              ❄ SNOWBALL · YR {snowballYear}
            </text>
          </g>
        )}

        {/* X-axis labels — sparse: 0, ¼, ½, ¾, N */}
        {xTicks.map((yr, i) => (
          <text
            key={`xl${i}`}
            x={xFor(yr) + barWidth / 2}
            y={H - 10}
            fontSize="10"
            fontFamily="'Outfit', sans-serif"
            fontWeight="500"
            fill={t.text3}
            textAnchor="middle"
            fontVariantNumeric="tabular-nums"
          >
            {yr}
          </text>
        ))}
        {/* Tooltip pill — top-right, ink background, always visible */}
        <g pointerEvents="none">
          <rect
            x={ttX}
            y={ttY}
            width={ttW}
            height={ttH}
            rx="4"
            fill={CHART_INK}
          />
          <text
            x={ttX + 6}
            y={ttY + 11}
            fontSize="9"
            fontFamily="'Outfit', sans-serif"
            fontWeight="500"
            fill="rgba(255,255,255,0.55)"
          >
            YR {ttPt.year}
          </text>
          <text
            x={ttW + ttX - 6}
            y={ttY + 22}
            fontSize="11"
            fontFamily="'Outfit', sans-serif"
            fontWeight="600"
            fill="#fff"
            textAnchor="end"
            fontVariantNumeric="tabular-nums"
          >
            {fmtCompact(ttPt.total)}
          </text>
        </g>
      </svg>
    </div>
  );
}
