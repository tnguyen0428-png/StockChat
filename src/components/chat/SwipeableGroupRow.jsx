// ============================================
// UPTIKALERTS — SwipeableGroupRow.jsx
// iOS "full-swipe-to-delete" trigger for private group rows. Swiping left
// reveals a red Delete panel proportional to finger travel. Release under
// the commit threshold → snaps back to 0. Release past the threshold →
// snaps back AND fires onDelete, which the parent routes to a confirmation
// modal before the destructive action actually runs. There's no sticky
// open state here — the swipe is purely the trigger; the confirmation
// lives in the modal, not in the row.
// ============================================

import { useRef, useState } from 'react';

const PEEK_WIDTH = 64;            // fixed width of the red panel (icon-only)
const COMMIT_THRESHOLD = 120;     // px dragged past which release commits delete
const AXIS_LOCK_THRESHOLD = 5;    // px before deciding horizontal vs vertical

export default function SwipeableGroupRow({
  onEnter,            // tap handler — enter the group
  onDelete,           // fired when a full swipe is released past COMMIT_THRESHOLD
  children,           // the actual visible row content
  rowStyle,           // passthrough style for the foreground row
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef(null);      // null | 'x' | 'y'
  const wasDrag = useRef(false);  // true once we've moved past AXIS_LOCK on X
  const pointerId = useRef(null);
  const containerRef = useRef(null);

  const beginDrag = (e) => {
    // Ignore secondary pointers (right-click, extra fingers).
    if (e.button != null && e.button !== 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = null;
    wasDrag.current = false;
    setDragging(true);
  };

  const moveDrag = (e) => {
    if (!dragging || e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // First move past threshold picks an axis. Horizontal wins the lock when
    // it dominates; otherwise native vertical scroll takes over. Mirrors
    // touch-action:pan-y, and also catches mouse drags on desktop.
    if (axis.current == null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_THRESHOLD) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis.current === 'x') {
        wasDrag.current = true;
        // Capture the pointer so the stream survives the finger leaving the
        // element bounds during a fast swipe.
        try { e.target.setPointerCapture?.(e.pointerId); } catch {}
      }
    }
    if (axis.current !== 'x') return;

    // Clamp: can't drag right past 0 (closed), no hard left cap — we want
    // long swipes to visibly commit by sliding the row all the way off.
    let next = dx;
    if (next > 0) next = 0;
    setDragX(next);
  };

  const endDrag = (e) => {
    if (e && e.pointerId !== pointerId.current && pointerId.current != null) return;
    pointerId.current = null;
    setDragging(false);

    if (axis.current === 'x') {
      const shouldCommit = Math.abs(dragX) >= COMMIT_THRESHOLD;
      // Always snap back — the row doesn't disappear on swipe. Confirmation
      // is handled upstream in a modal, so the row should stay in place
      // until the user either confirms (parent removes it) or cancels
      // (parent leaves it). Keeping the row visible during the prompt also
      // gives the user a clear referent for what they're about to leave.
      setDragX(0);
      if (shouldCommit) {
        // Ghost-click guard: a committing swipe causes the parent to open a
        // confirmation modal immediately. The browser will still synthesize
        // a click event from this pointerup — and because the modal appears
        // centered under the finger (or over the row), that click can land
        // on the modal overlay (firing Cancel) or worse, on the destructive
        // "Leave" button, deleting the group before the user can read the
        // prompt. Swallow the next click at document capture level with
        // stopImmediatePropagation so no listener sees it. Fail-safe removes
        // the listener after 400ms in case no click materializes.
        const swallow = (ev) => {
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          ev.preventDefault();
          document.removeEventListener('click', swallow, true);
        };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 400);
        onDelete?.();
      }
    }
    // Reset axis AFTER tap detection so onClick can still read wasDrag.current
    axis.current = null;
  };

  // Tap: never enter mid-drag. Otherwise a normal tap on the foreground
  // enters the group.
  const handleClick = (e) => {
    if (wasDrag.current) {
      wasDrag.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onEnter?.();
  };

  // Visual intensity of the red panel grows as the drag progresses. Past the
  // commit threshold we go full-strength and lock in, so the user feels the
  // "point of no return" without us having to change the layout.
  const revealRatio = Math.min(Math.abs(dragX) / COMMIT_THRESHOLD, 1);

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Red Delete panel — sits behind, revealed as the foreground slides left.
          Purely visual affordance; no click target (the whole gesture is the
          interaction). aria-hidden because the delete action is driven by the
          swipe itself, not a focusable button. */}
      <div
        aria-hidden="true"
        style={{
          ...styles.deletePanel,
          // Fade in the red as the drag builds, so a tiny nudge doesn't flash
          // a full destructive color. 0 → 1 across the commit threshold.
          opacity: dragging ? revealRatio : 0,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
        </svg>
      </div>

      {/* Foreground — existing row content; translated left as user drags */}
      <div
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleClick}
        style={{
          ...rowStyle,
          transform: `translateX(${dragX}px)`,
          // Preserve any caller-provided transition (e.g. row background fade
          // for the active group highlight) alongside our transform snap.
          transition: dragging
            ? 'none'
            : `transform 0.18s ease-out${rowStyle?.transition ? `, ${rowStyle.transition}` : ''}`,
          position: 'relative',
          // pan-y lets vertical scrolling pass through; we still block the
          // native horizontal pan since we're handling it manually.
          touchAction: 'pan-y',
          // Solid background so the red Delete panel doesn't bleed through
          // the translucent row highlight.
          background: rowStyle?.background || 'var(--card)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  deletePanel: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: PEEK_WIDTH,
    // iOS system red — more recognizable as destructive than a muted tone.
    background: '#FF3B30',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Pointer events off: the whole panel is a visual affordance, not a
    // button. Release-past-threshold is the commit gesture.
    pointerEvents: 'none',
    transition: 'opacity 0.12s ease-out',
  },
};
