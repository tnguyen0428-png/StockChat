// ============================================
// UPTIKALERTS — institutionalFlow.js
// Thin client wrapper around the scan-uw-flow edge function.
// The Unusual Whales API key lives only on the server.
// ============================================

import { supabase } from './supabase';

export async function runInstitutionalFlowScan({ minPremium = 250_000 } = {}) {
  const { data, error } = await supabase.functions.invoke('scan-uw-flow', {
    body: { minPremium },
  });
  if (error) throw error;

  const insertedCount = Array.isArray(data?.inserted)
    ? data.inserted.length
    : (data?.inserted ?? 0);
  const hits = Array.isArray(data?.inserted)
    ? data.inserted.map(ticker => ({ ticker }))
    : (data?.hits ?? []);

  return { inserted: insertedCount, hits, raw: data };
}
