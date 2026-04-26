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
// The growth chart is a stacked-area visual: the lighter band is what the
// user contributed, the darker band on top is what compounding earned. A
// "Snowball" marker drops on the year compounded gains overtake total
// contributions — usually the most surprising number in the calculator.
// Drag along the chart to inspect any year's value.
//
// All values use the standard compound formulas. No external data feed —
// these are educational projections, not predictions.
// ============================================

import { useState, useMemo, useRef } from 'react';

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

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

// Compact dollar formatter for axis labels and tooltips. $5k / $250k / $1.5M.
function fmtShort(v) {
  if (v === 0) return '$0';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 10e6 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
  return '$' + Math.round(v);
}

// Pick a "nice" tick step (1, 2, 2.5, 5, 10 × 10^n) so axis labels are
// human-friendly. Aim for roughly 5 ticks across the range.
function tickStep(max) {
  if (max <= 0) return 1;
  const target = max / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  if (norm <= 1)   return 1   * mag;
  if (norm <= 2)   return 2   * mag;
  if (norm <= 2.5) return 2.5 * mag;
  if (norm <= 5)   return 5   * mag;
  return 10 * mag;
}

// Catmull-Rom → Bezier conversion for a smooth, gently-curved path through
// the projection points. Tension of 1 is the standard CR spline; lower
// tightens the curve toward straight lines. Compound-growth projections look
// best with the default — visibly smooth without overshoot.
function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }
  let s = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    s += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return s;
}

// Same conversion but emits only the C segments (no leading M). Used to
// chain smooth runs inside larger paths (e.g., area fills that walk forward
// then back).
function smoothSegments(pts) {
  if (pts.length < 2) return '';
  let s = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    s += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return s;
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

export default function LongTermInvestingCard({ t }) {
  const [start, setStart]     = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears]     = useState(20);
  const [rate, setRate]       = useState(10);
  // Year index the user is inspecting via touch / mouse hover. null when
  // not interacting — that's when the static snowball marker shows.
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  // Derived projection. Monthly compounding so the math matches how
  // brokerages actually compound. fvLump uses annual compounding because
  // the user-facing "annual return" slider is annualized; mixing the two
  // is a small rounding sin but keeps the slider intuitive. The compounded
  // share calculation is what makes the "snowball" lesson visible.
  const projection = useMemo(() => {
    const R = rate / 100;
    const m = R / 12;
    const pts = [{ year: 0, value: start }];
    for (let yr = 1; yr <= years; yr++) {
      const fvLump = start * Math.pow(1 + R, yr);
      const fvPmt  = m > 0 ? monthly * (Math.pow(1 + m, yr * 12) - 1) / m : monthly * yr * 12;
      pts.push({ year: yr, value: fvLump + fvPmt });
    }
    const final = pts[pts.length - 1].value;
    const contributed = start + (monthly * 12 * years);
    const gained = final - contributed;
    const compoundedShare = final > 0 ? Math.round((gained / final) * 100) : 0;
    return { final, contributed, gained, compoundedShare, pts };
  }, [start, monthly, years, rate]);

  // Chart geometry — stacked area with smooth Bezier curves. Two layers:
  //   bottom = what you contributed (start + monthly·12·yr)
  //   top    = what compounding earned (value − contributed)
  // The cross-over point where compounded gains exceed contributions is the
  // "snowball" moment. At S&P-average rates with steady contributions it
  // typically lands around year 10–15 — surprising to most people, which
  // is why marking it on the chart is the strongest teaching beat.
  const chart = useMemo(() => {
    const W = 360, H = 200, PL = 38, PR = 12, PT = 18, PB = 22;
    const iw = W - PL - PR;
    const ih = H - PT - PB;

    const finalValue = projection.pts[projection.pts.length - 1].value;
    const step = tickStep(finalValue);
    const yMax = Math.max(step, Math.ceil(finalValue / step) * step);

    const xFor = (yr) => PL + (years > 0 ? (yr / years) * iw : 0);
    const yFor = (v)  => PT + ih - (yMax > 0 ? (v / yMax) * ih : 0);
    const baseline = PT + ih;

    // Per-year points: total value, contributed-so-far, gained.
    const pts = projection.pts.map(p => {
      const contributed = Math.min(start + monthly * 12 * p.year, p.value);
      return {
        x: xFor(p.year),
        yV: yFor(p.value),
        yC: yFor(contributed),
        year: p.year,
        value: p.value,
        contributed,
        gained: p.value - contributed,
      };
    });

    // First year where compounded gains exceed contributed dollars.
    // null when it never crosses (e.g., 5 yrs at 3% with heavy contributions).
    const breakEven = pts.find(p => p.gained > p.contributed) || null;

    // Smooth Bezier paths.
    const vPts = pts.map(p => ({ x: p.x, y: p.yV }));
    const cPts = pts.map(p => ({ x: p.x, y: p.yC }));
    const valuePath   = smoothPath(vPts);
    const contribPath = smoothPath(cPts);

    // Contributions area: baseline → up at firstX → smooth along contributed
    // line → down at lastX → close.
    const lastIdx = pts.length - 1;
    const contribArea =
      `M${pts[0].x.toFixed(1)},${baseline.toFixed(1)} ` +
      `L${pts[0].x.toFixed(1)},${pts[0].yC.toFixed(1)}` +
      smoothSegments(cPts) +
      ` L${pts[lastIdx].x.toFixed(1)},${baseline.toFixed(1)} Z`;

    // Growth area: smooth forward along value line, drop down to contributed
    // at right edge, smooth back along reversed contributed line, close.
    const cPtsRev = [...cPts].reverse();
    const growthArea =
      `M${pts[0].x.toFixed(1)},${pts[0].yV.toFixed(1)}` +
      smoothSegments(vPts) +
      ` L${pts[lastIdx].x.toFixed(1)},${pts[lastIdx].yC.toFixed(1)}` +
      smoothSegments(cPtsRev) +
      ' Z';

    // Y ticks at every step from 0 to yMax.
    const yTicks = [];
    for (let v = 0; v <= yMax + 0.5; v += step) yTicks.push(v);

    // X ticks: aim for 4–5 evenly spaced years, always include 0 and final.
    const xStep = years <= 8 ? Math.max(1, Math.ceil(years / 4)) : 5;
    const xTicks = [];
    for (let yr = 0; yr <= years; yr += xStep) xTicks.push(yr);
    if (xTicks[xTicks.length - 1] !== years) xTicks.push(years);

    return {
      W, H, PL, PR, PT, PB, ih, baseline, yMax,
      valuePath, contribPath, contribArea, growthArea,
      yTicks, xTicks, yFor, xFor, breakEven, pts,
    };
  }, [projection, start, monthly, years]);

  // Map a pointer position to the closest projection point. Used by both
  // mouse hover and touch drag — same handler.
  const handlePointer = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * chart.W;
    let nearest = 0;
    let minDist = Math.abs(chart.pts[0].x - vbX);
    for (let i = 1; i < chart.pts.length; i++) {
      const d = Math.abs(chart.pts[i].x - vbX);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    setHoverIdx(nearest);
  };
  const clearHover = () => setHoverIdx(null);

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
          min={1000} max={100000} step={1000}
          onChange={setStart}
          display={fmt(start)}
          t={t}
        />
        <SliderRow
          label="Monthly contribution"
          value={monthly}
          min={0} max={2000} step={50}
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

        {/* Result card — the payoff. Compounded share is the wow number. */}
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
          }}>{fmt(projection.final)}</div>
          <div style={{
            fontSize: 11, color: '#4a90d9', opacity: 0.85, marginTop: 5,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.45,
          }}>
            {fmt(projection.contributed)} contributed · {fmt(projection.gained)} gained
            <br />
            <strong style={{ fontWeight: 600 }}>{projection.compoundedShare}%</strong> of your total came from compounding
          </div>
        </div>

        {/* Stacked-area growth chart with smooth Bezier curves, gradient
            fills, and a draggable crosshair tooltip. touchAction:'pan-y'
            keeps vertical scroll usable on mobile while still capturing
            horizontal drags for the crosshair. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          style={{
            width: '100%', height: 'auto', display: 'block',
            marginTop: 4, touchAction: 'pan-y',
            cursor: hoverIdx !== null ? 'crosshair' : 'pointer',
          }}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={clearHover}
          onPointerCancel={clearHover}
        >
          <defs>
            {/* Vertical gradient on compounding-gains area: deeper at top,
                fading toward the boundary line. */}
            <linearGradient id="gainsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4a90d9" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#4a90d9" stopOpacity="0.18" />
            </linearGradient>
            {/* Lighter gradient on contributions: subtle, anchors the
                visual without competing with the gains layer. */}
            <linearGradient id="contribGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4a90d9" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#4a90d9" stopOpacity="0.06" />
            </linearGradient>
            {/* Soft drop shadow under the value line so it lifts off the
                area fills. Tuned to feel like depth, not a bevel. */}
            <filter id="curveShadow" x="-5%" y="-10%" width="110%" height="120%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.2"
                            floodColor="#4a90d9" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Horizontal gridlines at each y-tick. Solid baseline, dashed above. */}
          {chart.yTicks.map((tick, i) => (
            <line
              key={`g${i}`}
              x1={chart.PL} x2={chart.W - chart.PR}
              y1={chart.yFor(tick)} y2={chart.yFor(tick)}
              stroke={t.border}
              strokeWidth={i === 0 ? 0.75 : 0.5}
              strokeDasharray={i === 0 ? '0' : '2,3'}
              opacity={i === 0 ? 0.9 : 0.5}
            />
          ))}

          {/* Stacked areas with gradients */}
          <path d={chart.contribArea} fill="url(#contribGrad)" />
          <path d={chart.growthArea}  fill="url(#gainsGrad)" />

          {/* Boundary line (between contributions and gains) */}
          <path
            d={chart.contribPath}
            stroke="rgba(74,144,217,0.55)"
            strokeWidth="1"
            fill="none"
            strokeDasharray="3,2"
          />

          {/* Total value line — the hero. Drop shadow lifts it off the fills. */}
          <path
            d={chart.valuePath}
            stroke="#4a90d9"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#curveShadow)"
          />

          {/* Start dot at year 0 */}
          {chart.pts.length > 0 && (
            <circle
              cx={chart.pts[0].x}
              cy={chart.pts[0].yV}
              r="2.5"
              fill="#fff"
              stroke="#4a90d9"
              strokeWidth="1.25"
            />
          )}

          {/* End dot at final year */}
          {chart.pts.length > 0 && (
            <circle
              cx={chart.pts[chart.pts.length - 1].x}
              cy={chart.pts[chart.pts.length - 1].yV}
              r="3"
              fill="#4a90d9"
              stroke="#fff"
              strokeWidth="1.5"
            />
          )}

          {/* Snowball marker — solid dot with halo + label. Hidden while
              the user is actively inspecting via crosshair to keep the
              chart uncluttered. */}
          {chart.breakEven && hoverIdx === null && (
            <g>
              <circle
                cx={chart.breakEven.x}
                cy={chart.breakEven.yV}
                r="5"
                fill="rgba(74,144,217,0.18)"
              />
              <circle
                cx={chart.breakEven.x}
                cy={chart.breakEven.yV}
                r="3"
                fill="#4a90d9"
                stroke="#fff"
                strokeWidth="1.5"
              />
              <text
                x={chart.breakEven.x}
                y={chart.breakEven.yV - 10}
                fontSize="9"
                fontWeight="600"
                fill="#4a90d9"
                textAnchor={chart.breakEven.year > years * 0.7 ? 'end' : 'start'}
                dx={chart.breakEven.year > years * 0.7 ? -7 : 7}
              >
                Snowball · Yr {chart.breakEven.year}
              </text>
            </g>
          )}

          {/* Hover crosshair + tooltip. Activates on pointer hover/drag,
              shows the year, total value, and gain at that point. */}
          {hoverIdx !== null && chart.pts[hoverIdx] && (() => {
            const p = chart.pts[hoverIdx];
            const tipW = 96;
            const tipH = 38;
            // Flip tooltip to the left of the crosshair if near right edge.
            const tipX = p.x > chart.W - tipW - 8
              ? p.x - tipW - 6
              : p.x + 6;
            const tipY = Math.max(
              chart.PT + 2,
              Math.min(p.yV - tipH / 2, chart.baseline - tipH - 2)
            );
            return (
              <g pointerEvents="none">
                <line
                  x1={p.x} x2={p.x}
                  y1={chart.PT} y2={chart.baseline}
                  stroke="#4a90d9"
                  strokeWidth="0.75"
                  opacity="0.7"
                />
                <circle cx={p.x} cy={p.yC} r="2.5" fill="#fff" stroke="#4a90d9" strokeWidth="1" />
                <circle cx={p.x} cy={p.yV} r="3.5" fill="#4a90d9" stroke="#fff" strokeWidth="1.5" />
                <rect
                  x={tipX} y={tipY}
                  width={tipW} height={tipH}
                  rx="6"
                  fill="#1a2b3d"
                  opacity="0.95"
                />
                <text x={tipX + 8} y={tipY + 12} fontSize="9" fill="#9ca3af">
                  Year {p.year}
                </text>
                <text
                  x={tipX + 8} y={tipY + 24}
                  fontSize="11" fontWeight="700" fill="#fff"
                  fontVariantNumeric="tabular-nums"
                >
                  {fmtShort(p.value)}
                </text>
                <text
                  x={tipX + 8} y={tipY + 33}
                  fontSize="8" fill="#9ca3af"
                  fontVariantNumeric="tabular-nums"
                >
                  {fmtShort(p.gained)} from compounding
                </text>
              </g>
            );
          })()}

          {/* Y-axis labels on the left */}
          {chart.yTicks.map((tick, i) => (
            <text
              key={`y${i}`}
              x={chart.PL - 4}
              y={chart.yFor(tick) + 3}
              fontSize="9"
              fill={t.text3}
              textAnchor="end"
              fontVariantNumeric="tabular-nums"
            >
              {fmtShort(tick)}
            </text>
          ))}

          {/* X-axis labels along the bottom */}
          {chart.xTicks.map((yr, i) => (
            <text
              key={`x${i}`}
              x={chart.xFor(yr)}
              y={chart.H - 5}
              fontSize="9"
              fill={t.text3}
              textAnchor={i === 0 ? 'start' : i === chart.xTicks.length - 1 ? 'end' : 'middle'}
              fontVariantNumeric="tabular-nums"
            >
              Yr {yr}
            </text>
          ))}
        </svg>

        {/* Legend + interaction hint */}
        <div style={{
          display: 'flex', gap: 14, fontSize: 10, color: t.text3,
          marginTop: 4, marginBottom: 4, paddingLeft: 38,
          flexWrap: 'wrap', lineHeight: 1.4,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, background: 'rgba(74,144,217,0.45)',
              borderRadius: 2, display: 'inline-block',
            }} />
            Compounding gains
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, background: 'rgba(74,144,217,0.18)',
              borderRadius: 2, display: 'inline-block',
            }} />
            Your contributions
          </span>
        </div>
        <div style={{
          fontSize: 9, color: t.text3, paddingLeft: 38,
          marginBottom: 12, fontStyle: 'italic',
        }}>
          Drag along the chart to inspect any year.
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
