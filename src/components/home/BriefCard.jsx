export default function BriefCard({ article, S, index }) {
  const num = String(index + 1).padStart(2, '0');
  const tickers = Array.isArray(article.tickers) ? article.tickers : [];

  const inner = (
    <>
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
      <a href={article.url} target="_blank" rel="noopener noreferrer" style={S.briefRow}>
        {inner}
      </a>
    );
  }

  return <div style={S.briefRow}>{inner}</div>;
}
