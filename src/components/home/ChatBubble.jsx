import { STICKERS, isSticker, getStickerId } from '../shared/StickerPicker';
import UptikCardInline from './UptikCardInline';

function getTimeAgo(timestamp) {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ChatBubble({ msg, myId, onTapUsername, t, S }) {
  const name = msg.username || msg.profiles?.username || 'User';
  const colors = ['#1AAD5E', '#7B68EE', '#FF7043', '#4CAF50', '#E91E63', '#FF9800'];
  const isAI = msg.user_id === 'user_ai' || msg.type === 'ai';
  const isMe = !isAI && myId && msg.user_id === myId;
  const canTap = !isAI && !isMe && onTapUsername;
  const color = isAI ? '#8B5CF6' : (msg.user_color || colors[name.charCodeAt(0) % colors.length]);
  const timeAgo = getTimeAgo(msg.created_at);
  const rawText = msg.text || msg.content || '';

  // Sticker messages
  if (isSticker(rawText)) {
    const s = STICKERS.find(st => st.id === getStickerId(rawText));
    return (
      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 12px', margin: '0 6px' }}>
        {!isMe && <div style={{ ...S.ccAv, background: color, marginRight: 8 }}>{name[0].toUpperCase()}</div>}
        <span style={{ fontSize: 32, lineHeight: 1 }} title={s?.label}>{s?.emoji || '?'}</span>
      </div>
    );
  }

  // Parse AI card envelope
  let card = null;
  let proseText = rawText;
  if (isAI) {
    const m = rawText.match(/`{1,3}\s*uptik\s*([\s\S]*?)`{3}/i);
    if (m) {
      try {
        const jsonStr = m[1].trim().replace(/,\s*([}\]])/g, '$1');
        card = JSON.parse(jsonStr);
      } catch { card = null; }
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

  if (isMe) {
    return (
      <div style={S.ccMsg}>
        <div style={{ ...S.ccAv, background: color }}>{name[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.ccTop}>
            <span style={{ ...S.ccName, color }}>{name}</span>
            <span style={S.ccTime}>{timeAgo}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.4, color: t.text1, fontFamily: 'inherit', wordBreak: 'break-word' }}>
            {renderInline(proseText)}
          </div>
        </div>
      </div>
    );
  }

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
        {intro && <div style={S.ccText}>{renderInline(intro)}</div>}
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
