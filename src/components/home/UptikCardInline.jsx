export default function UptikCardInline({ card, t }) {
  if (!card || !card.type) return null;

  const wrap = {
    background: t.surface,
    borderRadius: 10,
    margin: '6px 0 8px',
    fontFamily: 'var(--font-heading)',
    overflow: 'hidden',
    color: t.text1,
    border: `1px solid ${t.border}`,
  };
  const head = {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${t.border}`,
  };
  const ticker = { fontWeight: 700, fontSize: 15, color: '#8B5CF6', letterSpacing: 0.4 };
  const price  = { fontWeight: 700, fontSize: 14, color: t.text1 };

  if (card.type === 'earnings') {
    const qs = card.quarters || [];
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>{card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(3)}</span>}
        </div>
        <div>
          {qs.map((q, i) => {
            const beat = Number(q.beatPct) >= 0;
            const sign = beat ? '+' : '';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                borderBottom: i < qs.length - 1 ? `1px solid ${t.border}` : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: t.text3, fontWeight: 500 }}>{q.label}</span>
                <span style={{ color: beat ? '#1AAD5E' : 'var(--red)', fontWeight: 600 }}>
                  ${Number(q.actual).toFixed(2)} vs ${Number(q.est).toFixed(2)} ({sign}{Number(q.beatPct).toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
        {card.nextEarnings && (
          <div style={{
            padding: '8px 14px',
            fontSize: 11, fontWeight: 600,
            color: t.text3,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            borderTop: `1px solid ${t.border}`,
          }}>
            Next: {card.nextEarnings}
          </div>
        )}
      </div>
    );
  }

  if (card.type === 'price') {
    return (
      <div style={wrap}>
        <div style={{ ...head, borderBottom: 'none' }}>
          <span style={ticker}>{card.ticker}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
            {card.volume && <span style={{ fontSize: 11, color: t.text3 }}>Vol {card.volume}</span>}
            {card.isClosed && <span style={{ fontSize: 11, color: t.text3 }}>· Closed</span>}
          </span>
        </div>
      </div>
    );
  }

  if (card.type === 'valuation') {
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={ticker}>{card.ticker}</span>
          {card.price != null && <span style={price}>${Number(card.price).toFixed(2)}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', padding: '10px 14px' }}>
          {card.pe != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: t.text3 }}>P/E </span>
              <span style={{ color: t.text1, fontWeight: 600 }}>{card.pe}</span>
            </div>
          )}
          {card.peg != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: t.text3 }}>PEG </span>
              <span style={{ color: t.text1, fontWeight: 600 }}>{card.peg}</span>
            </div>
          )}
          {card.netMargin != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: t.text3 }}>Margin </span>
              <span style={{ color: t.text1, fontWeight: 600 }}>{card.netMargin}%</span>
            </div>
          )}
          {card.salesGrowth != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: t.text3 }}>Sales </span>
              <span style={{ color: '#5eed8a', fontWeight: 600 }}>+{card.salesGrowth}%</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
