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
// All values use the standard compound formulas. No external data feed —
// these are educational projections, not predictions.
// ============================================

import { useState, useMemo } from 'react';

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

  // Build the SVG path for the growth curve. Plot is normalized to the final
  // value so the curve always fills the height — this exaggerates the early
  // flat period, which is the point: compound growth feels invisible until
  // it doesn't.
  const chart = useMemo(() => {
    const W = 600, H = 140, PL = 8, PR = 8, PT = 8, PB = 18;
    const iw = W - PL - PR, ih = H - PT - PB;
    const maxV = projection.pts[projection.pts.length - 1].value;
    const xStep = iw / (projection.pts.length - 1);
    let path = '', area = '';
    projection.pts.forEach((p, i) => {
      const x = PL + i * xStep;
      const y = PT + ih - (maxV > 0 ? (p.value / maxV) * ih : 0);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      if (i === 0) area = `M${x.toFixed(1)},${(PT + ih).toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)} `;
      else area += `L${x.toFixed(1)},${y.toFixed(1)} `;
    });
    area += `L${(PL + iw).toFixed(1)},${(PT + ih).toFixed(1)} Z`;
    return { path, area, W, H, PL, PR };
  }, [projection]);

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

        {/* Growth curve */}
        <svg
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 140, display: 'block', marginBottom: 12 }}
        >
          <path d={chart.area} fill="rgba(74,144,217,0.18)" />
          <path d={chart.path} stroke="#4a90d9" strokeWidth="2" fill="none" />
          <text x={chart.PL} y={chart.H - 4} fontSize="10" fill={t.text3}>Year 0</text>
          <text x={chart.W - chart.PR} y={chart.H - 4} fontSize="10" fill={t.text3} textAnchor="end">
            Year {years}
          </text>
        </svg>

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
