// ============================================
// UPTIKALERTS — ShareInviteModal.jsx
// Shown right after a user creates a private group, and re-openable
// from the chat header "Invite" pill. Surfaces the invite URL with
// one-tap copy + native share sheet.
// ============================================

import { useEffect, useState } from 'react';

export default function ShareInviteModal({ open, group, onClose, justCreated = false }) {
  const [copied, setCopied] = useState(false);
  const [shareErr, setShareErr] = useState(null);

  // Reset copy state whenever the modal reopens for a different group
  useEffect(() => {
    if (open) {
      setCopied(false);
      setShareErr(null);
    }
  }, [open, group?.id]);

  if (!open || !group) return null;

  // Fall back to just the raw code in the unlikely case invite_code is null —
  // the RPC still accepts the bare code in the manual-join flow.
  const url = group.invite_code
    ? `${window.location.origin}/join/${group.invite_code}`
    : '';

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[ShareInviteModal] clipboard copy failed:', err?.message || err);
      setShareErr('Copy blocked by browser — long-press the link to copy manually.');
    }
  };

  const handleShare = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${group.name}" on UpTikAlerts`,
          text: `Jump into "${group.name}" on UpTikAlerts`,
          url,
        });
      } catch (err) {
        // User-cancelled share throws AbortError — that's fine, stay silent
        if (err?.name !== 'AbortError' && import.meta.env.DEV) {
          console.warn('[ShareInviteModal] navigator.share failed:', err?.message || err);
        }
      }
    } else {
      // Desktop / unsupported — just copy
      handleCopy();
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.celebrate}>
          <div style={styles.bubble}>{justCreated ? '🎉' : '📩'}</div>
        </div>

        <h3 style={styles.title}>
          {justCreated ? `"${group.name}" is live` : `Invite to ${group.name}`}
        </h3>
        <p style={styles.hint}>
          {justCreated
            ? 'Share this link so your people can jump in. They\'ll see chat, trades, and alerts.'
            : 'Anyone with this link can join the group.'}
        </p>

        <div style={styles.linkBox}>
          <div style={styles.url}>{url}</div>
        </div>

        {shareErr && <div style={styles.err}>{shareErr}</div>}

        <div style={styles.actions}>
          <button style={styles.btnSecondary} onClick={handleShare}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
          <button
            style={{ ...styles.btnPrimary, ...(copied ? styles.btnPrimaryCopied : {}) }}
            onClick={handleCopy}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        <button style={styles.btnGhost} onClick={onClose}>
          {justCreated ? "I'll invite later" : 'Done'}
        </button>

        {justCreated && (
          <div style={styles.tail}>
            You can grab this link again from your Profile tab anytime.
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '0 20px',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
  },
  modal: {
    background: 'var(--card)',
    borderRadius: 18,
    padding: '22px 20px 18px',
    width: '100%',
    maxWidth: 340,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  celebrate: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1AAD5E 0%, #2ed77a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    boxShadow: '0 8px 24px rgba(26,173,94,0.35)',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text1)',
    margin: 0,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: 'var(--text2)',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.45,
  },
  linkBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
  },
  url: {
    flex: 1,
    fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
    fontSize: 12,
    color: 'var(--text1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    userSelect: 'all',
  },
  err: {
    fontSize: 12,
    color: '#e74c3c',
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 2,
  },
  btnPrimary: {
    flex: 1,
    padding: '12px 0',
    background: '#1AAD5E',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'background 0.15s',
  },
  btnPrimaryCopied: {
    background: '#2ed77a',
  },
  btnSecondary: {
    flex: 1,
    padding: '12px 0',
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnGhost: {
    background: 'transparent',
    color: 'var(--text3)',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '8px 0',
    marginTop: 2,
  },
  tail: {
    fontSize: 11,
    color: 'var(--text3)',
    textAlign: 'center',
    padding: '4px 8px 0',
    lineHeight: 1.5,
  },
};
