export default function BriefCard({ article, S }) {
  return (
    <div style={S.briefCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {article.tickers?.length > 0 && (
          <div style={S.bfTickers}>{Array.isArray(article.tickers) ? article.tickers.join(' · ') : article.tickers}</div>
        )}
        <div style={S.bfTitle}>{article.title}</div>
      </div>
      {article.url && (
        <a href={article.url} target="_blank" rel="noopener noreferrer" style={S.bfLink}>Read →</a>
      )}
    </div>
  );
}
