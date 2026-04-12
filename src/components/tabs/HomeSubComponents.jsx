// ============================================
// UPTIKALERTS — HomeSubComponents.jsx
// Extracted sub-components used by HomeTab
// BriefCard, ChatBubble, UptikCardInline, getTimeAgo
// ============================================

import { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';

// ── Time ago helper ──
export function getTimeAgo(timestamp) {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── BriefCard — single briefing article ──
export function BriefCard({ article, S }) {
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

// ── ChatBubble — single chat message in Home preview ──
export function ChatBubble({ msg, myId, onTapUsername, S, t }) {
  const name = msg.username || msg.profiles?.username || 'User';
  const colors = ['#1AAD5E', '#7B68EE', '#FF7043', '#4CAF50', '#E91E63', '#FF9800'];
  const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
  const isMe = !isAI && myId && msg.user_id === myId;
  const canTap = !isAI && !isMe && onTapUsername;
  const color = isAI ? '#8B5CF6' : (msg.user_color || colors[name.charCodeAt(0) % colors.length]);
  const timeAgo = getTimeAgo(msg.created_at);

  const rawText = msg.text || msg.content || '';

  // Sticker messages — render emoji inline
  if (isSticker(rawText)) {
    const s = STICKERS.find(st => st.id === getStickerId(rawText));
    return (
      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 12px', margin: '0 6px' }}>
        {!isMe && <div style={{ ...S.ccAv, background: color, marginRight: 8 }}>{name[0].toUpperCase()}</div>}
        <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
      </div>
    );
  }

  // For AI messages, parse the ```uptik {json}``` envelope into a clean card + prose
  let card = null;
  let proseText = rawText;
  if (isAI) {
    const m = rawText.match(/`{1,3}\s*uptik\s*([\s\S]*?)`{3}/i);
    if (m) {
      try {
        const jsonStr = m[1].trim().replace(/,\s*([}\]])/g, '$1');
        card = JSON.parse(jsonStr);
      } catch (e) { card = null; }
      proseText = rawText.replace(m[0], '').trim();
    }
    proseText = proseText.replace(/^`+\s*/, '').replace(/`+$/, '').trim();
  }

  const segments = isAI ? proseText.split(/\s*•\s+/) : [proseText];
  const intro = segments[0] || '';
  const bullets = isAI ? segments.slice(1).map(s => s.trim()).filter(Boolean) : [];

  const renderInline = (txt) => txt.split(/(\$[A-Z]{1,5})/g).map((p, i) =>
    p.startsWith('$') && /^\$[A-Z]{1,5}$/.test(p) ? <span key={i} style={S.ccTk}>{p}</span> : p
  );

  // User's own messages — same left-aligned style as others
  if (isMe) {
    return (
      <div style={S.ccMsg}>
        <div style={{ ...S.ccAv, background: color }}>{name[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.ccTop}>
            <span style={{ ...S.ccName, color }}>{name}</span>
            <span style={S.ccTime}>{timeAgo}</span>
          </div>
          <div style={{
            fontSize: 13,
            lineHeight: 1.4,
            color: t.text1,
            fontFamily: 'inherit',
            wordBreak: 'break-word',
          }}>
            {renderInline(proseText)}
          </div>
        </div>
      </div>
    );
  }

  // Left-align for AI and other users
  return (
    <div style={S.ccMsg}>
      <div style={{ ...S.ccAv, background: color }}>{name[0].toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.ccTop}>
          <span
            style={{
              ...S.ccName, color,
              ...(canTap ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: color, textUnderlineOffset: 2, opacity: 0.9 } : {}),
            }}
            onClick={() => { if (canTap) onTapUsername(msg.user_id, name); }}
          >{name}</span>
          <span style={S.ccTime}>{timeAgo}</span>
        </div>
        {card && <UptikCardInline card={card} t={t} />}
        {intro && (
          <div style={S.ccText}>{renderInline(intro)}</div>
        )}
        {bullets.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ ...S.ccText, lineHeight: 1.5 }}>{renderInline(b)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── UptikCardInline — dark navy table card for AI responses ──
export function UptikCardInline({ card, t }) {
  if (!card || !card.type) return null;
  const wrap = {
    background: t.surface,
    borderRadius: 10,
    margin: '6px 0 8px',
    fontFamily: "var(--font-heading)",
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
  const price = { fontWeight: 700, fontSize: 14, color: t.text1 };

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
