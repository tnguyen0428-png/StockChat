export async function getMemory(supabase, userId) {
  if (!userId) return { level: 'beginner', watched_tickers: [], question_count: 0 };
  try {
    const { data, error } = await supabase
      .from('ai_user_memory')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !data) return { level: 'beginner', watched_tickers: [], question_count: 0 };
    return {
      level: data.experience_level || 'beginner',
      watched_tickers: data.watched_tickers || [],
      question_count: data.question_count || 0,
    };
  } catch {
    return { level: 'beginner', watched_tickers: [], question_count: 0 };
  }
}

export async function updateMemory(supabase, userId, message, routing, current) {
  if (!userId) return;
  const ticker = routing.params?.ticker?.toUpperCase();
  const newCount = (current.question_count || 0) + 1;

  // Auto-detect experience level from jargon usage
  const jargon = /\b(RSI|SMA|EMA|MACD|IV|OI|delta|theta|gamma|vega|P\/E|EBITDA|fibonacci|bollinger|stochastic|ichimoku)\b/i;
  let level = current.level || 'beginner';
  if (newCount > 50 || jargon.test(message)) level = 'advanced';
  else if (newCount > 15) level = 'intermediate';

  // Merge watched tickers
  const watched = ticker
    ? [...new Set([ticker, ...(current.watched_tickers || [])])].slice(0, 20)
    : (current.watched_tickers || []);

  try {
    await supabase.from('ai_user_memory').upsert({
      user_id: userId,
      experience_level: level,
      watched_tickers: watched,
      question_count: newCount,
      last_question_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Memory] Update failed:', err.message);
  }
}
