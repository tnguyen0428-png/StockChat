// ============================================
// UPTIKALERTS — BriefCard.jsx
// Renders a single briefing article row.
// Cosmetic polish: sentiment accent stripe (left edge),
// fading divider (bottom), number column hidden.
//
// New optional props (additive — old callers still work):
//   - isLast: boolean — hides the bottom divider for the last row
//   - researchPrices: object — map of { ticker: { change } }
//     used to derive per-article sentiment tone. Falls back to
//     neutral gray when data is missing.
// ============================================

export default function BriefCard({ article, S, index, isLast, researchPrices }) {
  const num = String(index + 1).padStart(2, '0');
  const tickers = Array.isArray(article.tickers) ? article.tickers : [];

  // Sentiment tone: derive from first ticker's day change.
  // Graceful degrade: no ticker / no price data → neutral gray.
  const firstTicker = tickers[0];
  const firstTickerData = firstTicker && researchPrices?.[firstTicker];
  const chg = firstTickerData?.change;
  const tone = chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral';

  const toneColor = {
    up: '#1AAD5E',
    down: '#ff6b6b',
    neutral: '#c2ccda',
  }[tone];

  // Fading divider at the bottom of each row (except last).
  const dividerStyle = !isLast
    ? {
        backgroundImage:
          'linear-gradient(90deg, #e2e8f0 0%, #e2e8f0 60%, transparent 100%)',
        backgroundSize: 'calc(100% - 12px) 1px',
        backgroundPosition: 'bottom right',
        backgroundRepeat: 'no-repeat',
      }
    : {};

  // Merge the base briefRow style with the divider style.
  // NOTE: the sentiment stripe is now a separate absolutely-positioned <div>
  // inside the row — inset from top/bottom so adjacent stripes don't merge
  // visually into one continuous line.
  const rowStyle = { ...S.briefRow, ...dividerStyle };

  // Stripe element — inset from top/bottom for visual breathing room.
  const stripeStyle = {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 2,
    background: toneColor,
  };

  const inner = (
    <>
      {/* Sentiment stripe — absolutely positioned, inset so stripes don't merge */}
      <div style={stripeStyle} aria-hidden="true" />
      {/* Number span retained for structural safety; hidden via display:none in styles. */}
      <span style={S.briefRowNum}>{num}</span>
      <div style={S.briefRowBody}>
        {tickers.length > 0 && (
          <div style={S.briefRowTickers}>
            {tickers.map(tk => (
              <span key={tk} style={S.briefTicker}>{tk}</span>
            ))}
          </div>
        )}
        <div style={S.briefRowTitle}>{article.title}</div>
        {article.publisher && (
          <div style={S.briefRowPublisher}>{article.publisher}</div>
        )}
      </div>
    </>
  );

  if (article.url) {
    return (
      <a href={article.url} target="_blank" rel="noopener noreferrer" style={rowStyle}>
        {inner}
      </a>
    );
  }

  return <div style={rowStyle}>{inner}</div>;
}
