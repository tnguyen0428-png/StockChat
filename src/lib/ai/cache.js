const cache = new Map();
const TTL = 5 * 60 * 1000;
const THRESHOLD = 0.85;

const STOPWORDS = new Set(['the','a','an','is','are','was','were','what','how','why','do','does','can','tell','me','about','whats','please','hey','hi','hello','thanks','i','my','to','in','of','and','for','it','this','that','with']);

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s$]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => !STOPWORDS.has(w)).sort().join(' ');
}

function similarity(a, b) {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function checkCache(question) {
  const now = Date.now();
  const norm = normalize(question);
  for (const [key, entry] of cache) {
    if (now - entry.ts > TTL) { cache.delete(key); continue; }
    if (similarity(norm, entry.norm) >= THRESHOLD) {
      return { hit: true, response: entry.response };
    }
  }
  return { hit: false };
}

export function clearCache() {
  cache.clear();
  console.log('[Cache] Cleared all entries');
}

export function setCache(question, response) {
  const norm = normalize(question);
  cache.set(norm, { norm, response, ts: Date.now() });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    cache.delete(oldest[0]);
  }
}
