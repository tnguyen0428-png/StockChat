// safeStorage — localStorage wrappers that handle iOS private browsing
// (where localStorage throws SecurityError on access)

export function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* iOS private browsing */ }
}

export function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* iOS private browsing */ }
}
