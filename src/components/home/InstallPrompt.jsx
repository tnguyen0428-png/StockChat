// ============================================
// UPTIKALERTS — InstallPrompt.jsx
// One-time "Add to Home Screen" card for iOS Safari users in browser mode.
// Shows on visit >= 2, dismisses forever on × tap. Silent on Android, Chrome
// iOS, already-installed PWAs, and any in-app browser.
// ============================================

import { useState, useEffect } from 'react';
import { safeGet, safeSet } from '../../lib/safeStorage';

const VISITS_KEY    = 'uptik_a2hs_visits';
const DISMISSED_KEY = 'uptik_a2hs_dismissed';
const MIN_VISITS    = 2;

// Only real iOS Safari qualifies. Other iOS browsers (Chrome/Firefox/Edge)
// all use WebKit but none of them expose Add-to-Home-Screen, so showing the
// prompt there would be a dead-end. In-app browsers (Instagram, FB, etc.)
// are detected and excluded for the same reason.
function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|Instagram|FBAN|FBAV|Line|MicroMessenger/i.test(ua);
  return !isOtherBrowser;
}

// Already installed → navigator.standalone is the iOS signal; display-mode
// covers the spec-compliant path too for future-proofing.
function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

export default function InstallPrompt({ t }) {
  const [show, setShow]         = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isIOSSafari() || isStandalone()) return;
    if (safeGet(DISMISSED_KEY)) return;

    const count = parseInt(safeGet(VISITS_KEY) || '0', 10) + 1;
    safeSet(VISITS_KEY, String(count));

    if (count >= MIN_VISITS) setShow(true);
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    safeSet(DISMISSED_KEY, '1');
    setShow(false);
  };

  return (
    <div style={{ padding: '0 14px 14px' }}>
      <div style={{
        background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>📱</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text1, marginBottom: 2 }}>
              Install UpTikAlerts
            </div>
            <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.4 }}>
              Full-screen on your iPhone — no Safari bars, more room for messages.
            </div>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            style={{
              background: 'transparent', border: 'none', color: t.text3,
              fontSize: 20, lineHeight: 1, padding: '0 4px', cursor: 'pointer',
              flexShrink: 0,
            }}
          >×</button>
        </div>

        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent', border: `1px solid ${t.green}`,
              color: t.green, borderRadius: 7,
              padding: '5px 10px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
            }}
          >How?</button>
        ) : (
          <ol style={{
            fontSize: 11, color: t.text2, lineHeight: 1.6,
            margin: 0, paddingLeft: 18,
          }}>
            <li>Tap the Share button (□ with ↑) at the bottom of Safari</li>
            <li>Scroll down → tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong>, then launch from your home screen.</li>
          </ol>
        )}
      </div>
    </div>
  );
}
