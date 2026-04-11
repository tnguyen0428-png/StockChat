import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const STICKERS = [
  { id: 'rocket',   emoji: '🚀', label: 'To the moon' },
  { id: 'bull',     emoji: '🐂', label: 'Bullish' },
  { id: 'bear',     emoji: '🐻', label: 'Bearish' },
  { id: 'diamond',  emoji: '💎', label: 'Diamond hands' },
  { id: 'money',    emoji: '💰', label: 'Money' },
  { id: 'fire',     emoji: '🔥', label: 'Fire' },
  { id: 'skull',    emoji: '💀', label: 'Dead' },
  { id: 'eyes',     emoji: '👀', label: 'Watching' },
  { id: 'crown',    emoji: '👑', label: 'King' },
  { id: 'clown',    emoji: '🤡', label: 'Clown' },
  { id: 'chart_up', emoji: '📈', label: 'Gains' },
  { id: 'chart_dn', emoji: '📉', label: 'Losses' },
];

export default function StickerPicker({ onSend, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ bottom: 0, right: 0 });
  const isSm = size === 'sm';
  const popupW = isSm ? 150 : 220;

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const vh = window.visualViewport?.height || window.innerHeight;
      const vw = window.visualViewport?.width  || window.innerWidth;
      let left = r.right - popupW;
      if (left < 8) left = 8;
      if (left + popupW > vw - 8) left = vw - popupW - 8;
      setPos({ bottom: vh - r.top + 6, left });
    }
  }, [open, popupW]);

  const handlePick = (sticker) => { onSend(sticker); setOpen(false); };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={btnRef} onClick={() => setOpen(!open)} style={{
        width: isSm ? 28 : 34, height: isSm ? 28 : 34, borderRadius: '50%',
        background: open ? 'var(--green-bg, #e8f5ed)' : 'transparent',
        border: `1px solid ${open ? 'var(--green, #8cd9a0)' : 'var(--border, #d8e2ed)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: isSm ? 14 : 17, flexShrink: 0, transition: 'background 0.15s',
      }} title="Stickers">😎</div>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent' }} />
          <div style={{
            position: 'fixed', bottom: pos.bottom, left: pos.left, background: '#fff',
            border: '1px solid #d8e2ed', borderRadius: 14, boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
            padding: isSm ? 6 : 10, zIndex: 10000, display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)', gap: isSm ? 2 : 6, width: popupW,
          }}>
            {STICKERS.map(s => (
              <div key={s.id} onClick={() => handlePick(s)} title={s.label} style={{
                fontSize: isSm ? 20 : 26, padding: isSm ? 4 : 6, borderRadius: 8,
                cursor: 'pointer', textAlign: 'center', transition: 'background 0.1s', lineHeight: 1,
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{s.emoji}</div>
            ))}
          </div>
        </>, document.body
      )}
    </div>
  );
}

export function StickerMessage({ stickerId, size = 'md' }) {
  const sticker = STICKERS.find(s => s.id === stickerId);
  if (!sticker) return null;
  const sm = size === 'sm';
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      background: 'linear-gradient(135deg, #f8fafc, #edf2f7)', borderRadius: sm ? 10 : 14,
      padding: sm ? '4px 8px 3px' : '8px 14px 6px', border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', minWidth: sm ? 36 : 56,
    }} title={sticker.label}>
      <span style={{ fontSize: sm ? 20 : 32, lineHeight: 1 }}>{sticker.emoji}</span>
      <span style={{ fontSize: sm ? 7 : 9, fontWeight: 600, color: '#8896a6', marginTop: sm ? 2 : 3, letterSpacing: 0.3, textTransform: 'uppercase' }}>{sticker.label}</span>
    </div>
  );
}

export function isSticker(text) { return text?.startsWith('sticker:'); }
export function getStickerId(text) { if (!isSticker(text)) return null; return text.split(':')[1]; }
