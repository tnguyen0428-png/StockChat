// ============================================
// UPTIKALERTS — InviteModal.jsx
// Shared modal for sharing group invite links
// Used by Header.jsx and HomeTab.jsx
// ============================================

import { useState } from 'react';

export default function InviteModal({ group, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!group) return null;

  const getLink = () => `${window.location.origin}/join/${group.invite_code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = getLink();
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    const link = getLink();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${group.name} on UpTikAlerts`, text: `Join my group "${group.name}" on UpTikAlerts!`, url: link });
      } catch {}
    } else {
      handleCopy();
    }
  };

  const handleText = () => {
    const link = getLink();
    const text = encodeURIComponent(`Join my group "${group.name}" on UpTikAlerts! ${link}`);
    window.open(`sms:?body=${text}`, '_self');
  };

  return (
    <div style={S.overlay} onClick={() => onClose()}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `${group.color || '#7B68EE'}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={group.color || '#7B68EE'} strokeWidth="1.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>
            Invite to {group.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.4 }}>
            Share this link — one tap and they're in.
          </div>
        </div>

        {/* Link display */}
        <div style={S.linkRow}>
          <span style={S.linkText}>{getLink()}</span>
          <button
            style={{ ...S.copyBtn, background: 'var(--green)' }}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={S.shareOption} onClick={handleText}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Text it</span>
          </button>
          <button style={S.shareOption} onClick={handleCopy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy link</span>
          </button>
          <button style={S.shareOption} onClick={handleShare}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span>Share</span>
          </button>
        </div>

        <button style={{ ...S.skipBtn, marginTop: 16 }} onClick={() => onClose()}>
          Done
        </button>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 300,
    padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '20px 16px 16px',
    width: '100%',
    maxWidth: 360,
    margin: '0 12px',
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    color: 'var(--text3)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  copyBtn: {
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
  },
  shareOption: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 8px',
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
  },
  skipBtn: {
    width: '100%',
    background: 'var(--card2)',
    color: 'var(--text3)',
    border: 'none',
    borderRadius: 12,
    padding: '13px 0',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};
