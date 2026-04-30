// ============================================
// UPTIKALERTS - Presence (who's online)
// ============================================
//
// Two hooks backed by a SINGLE shared Supabase Realtime channel
// ('online-users'):
//   usePresenceTracker(userId) - broadcasts the signed-in user as online.
//                                Mount once at App level so every signed-in
//                                client appears in everyone else's presence
//                                state.
//   useOnlineUserIds()         - read-only. Returns a Set of user IDs
//                                currently connected. Mount where you want
//                                to render online indicators (AdminPanel).
//
// Why a module-level singleton:
//   supabase.channel(name) returns the SAME underlying channel for repeated
//   calls with the same name. Calling .on('presence', ...) on it after
//   .subscribe() throws "cannot add presence callbacks after joining a
//   channel". So we centralise: ONE channel, ONE set of listeners, ONE
//   subscribe(), and a tiny pub/sub for React readers.
//
// Why presence instead of a last_active column:
//   - Zero schema/migration cost.
//   - Zero extra DB writes.
//   - Goes offline instantly on tab close (websocket drop), so the admin's
//     view never lies about who's around right now.
// ============================================

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const PRESENCE_CHANNEL = 'online-users';

// -- Singleton state ------------------------------------------------
let channel     = null;
let joinPromise = null;
let onlineIds   = new Set();
const listeners = new Set();

const notify = () => { for (const l of listeners) l(onlineIds); };

const computeOnlineIds = () => {
  if (!channel) return new Set();
  const state = channel.presenceState();
  // We don't set a presence key, so Supabase keys metas by a per-connection
  // UUID. Aggregate user_ids from the metas instead - same user across
  // multiple tabs collapses naturally because we only care about the Set.
  const ids = new Set();
  for (const metas of Object.values(state)) {
    for (const m of metas) {
      if (m && m.user_id) ids.add(m.user_id);
    }
  }
  return ids;
};

const ensureChannel = () => {
  if (channel) return { channel, joinPromise };

  channel = supabase.channel(PRESENCE_CHANNEL);

  const sync = () => {
    onlineIds = computeOnlineIds();
    notify();
  };

  // Attach all listeners BEFORE subscribe() - Supabase rejects .on() once
  // the channel has joined.
  channel
    .on('presence', { event: 'sync' },  sync)
    .on('presence', { event: 'join' },  sync)
    .on('presence', { event: 'leave' }, sync);

  joinPromise = new Promise((resolve, reject) => {
    // Supabase invokes this callback for every state transition. Settle the
    // promise once: first SUBSCRIBED resolves; first terminal failure
    // rejects. Subsequent reconnect/disconnect cycles after a successful
    // join are ignored here (the channel keeps working internally) so a
    // transient CLOSED doesn't kill tracking.
    let settled = false;
    channel.subscribe((status) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        resolve();
      } else if (
        status === 'TIMED_OUT' ||
        status === 'CHANNEL_ERROR' ||
        status === 'CLOSED'
      ) {
        settled = true;
        reject(new Error('Presence channel subscription failed: ' + status));
      }
    });
  });

  return { channel, joinPromise };
};

// -- Tracker: broadcasts the current user's presence ----------------
export function usePresenceTracker(userId) {
  useEffect(() => {
    if (!userId) return;

    const { channel: ch, joinPromise: ready } = ensureChannel();
    let cancelled = false;

    // Wait for the websocket to actually join before calling track() -
    // otherwise Supabase silently drops the track or throws. The .catch()
    // is required: without it a channel failure produces an unhandled
    // promise rejection AND leaves the admin staring at all-grey dots with
    // no clue why. Surface it in console so the failure is debuggable.
    ready
      .then(() => {
        if (cancelled) return;
        ch.track({ user_id: userId });
      })
      .catch((err) => {
        console.error('[Presence] subscribe failed; user will appear offline:', err);
      });

    return () => {
      cancelled = true;
      // Untrack so other clients see this user go offline immediately on
      // sign-out / userId change. The channel itself stays alive so the
      // admin's reader keeps observing other users.
      if (ch.state === 'joined') ch.untrack();
    };
  }, [userId]);
}

// -- Reader: returns the Set of online user IDs --------------------
export function useOnlineUserIds() {
  const [ids, setIds] = useState(() => onlineIds);

  useEffect(() => {
    const { joinPromise: ready } = ensureChannel();
    const listener = (next) => setIds(next);
    listeners.add(listener);
    // Sync current state in case the channel was already populated before
    // this hook mounted.
    setIds(onlineIds);
    // Reader-side failure was previously silent — admin debugging "why are
    // all dots grey?" had no signal. Surface it in dev so the cause is
    // visible without polluting prod consoles.
    ready.catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[Presence] reader unavailable:', err);
      }
    });
    return () => { listeners.delete(listener); };
  }, []);

  return ids;
}
