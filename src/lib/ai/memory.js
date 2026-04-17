export async function getMemory(supabase, userId) {
  const defaults = {
    level: 'beginner',
    watched_tickers: [],
    question_count: 0,
    preferred_length: 'auto',
    satisfaction: 'neutral',     // 'happy', 'neutral', 'unhappy'
    recent_downvotes: 0,
    feedback_hints: [],          // e.g. ["user prefers shorter responses", "user corrected last answer"]
  };
  if (!userId) return defaults;

  try {
    // Fetch memory + recent feedback in parallel
    const [memoryResult, feedbackResult, correctionResult] = await Promise.allSettled([
      supabase.from('ai_user_memory').select('*').eq('user_id', userId).single(),
      supabase.from('ai_feedback').select('rating').eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('ai_response_log').select('question, response').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(3),
    ]);

    const data = memoryResult.status === 'fulfilled' ? memoryResult.value.data : null;
    const recentFeedback = feedbackResult.status === 'fulfilled' ? (feedbackResult.value.data || []) : [];
    const recentResponses = correctionResult.status === 'fulfilled' ? (correctionResult.value.data || []) : [];

    // Analyze feedback patterns
    const ups = recentFeedback.filter(f => f.rating === 'up').length;
    const downs = recentFeedback.filter(f => f.rating === 'down').length;
    const satisfaction = downs > ups * 2 ? 'unhappy' : downs > ups ? 'mixed' : 'happy';

    // Build feedback hints for the AI
    const hints = [];
    if (downs >= 3) hints.push('User has been rating responses poorly — try a different approach, be more helpful and detailed.');
    if (data?.preferred_length === 'short') hints.push('User prefers shorter responses.');
    if (data?.preferred_length === 'detailed') hints.push('User prefers detailed responses with more data.');
    if (data?.recent_corrections > 0) hints.push('User recently corrected the AI — double-check your facts.');

    return {
      level: data?.experience_level || 'beginner',
      watched_tickers: data?.watched_tickers || [],
      question_count: data?.question_count || 0,
      preferred_length: data?.preferred_length || 'auto',
      satisfaction,
      recent_downvotes: downs,
      feedback_hints: hints,
      recent_responses: recentResponses,
    };
  } catch {
    return defaults;
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

  // Detect corrections — user says "no", "wrong", "that's not right", etc.
  const correctionPattern = /\b(no|wrong|incorrect|that's not right|not right|not what i asked|try again|you're wrong|that's wrong|nope)\b/i;
  const recentCorrections = correctionPattern.test(message) ? (current.recent_corrections || 0) + 1 : 0;

  // Learn preferred length from patterns
  const shortPatterns = /\b(too long|shorter|brief|just the|quick|tldr)\b/i;
  const longPatterns = /\b(more detail|explain more|go deeper|break it down|elaborate|tell me more)\b/i;
  let preferredLength = current.preferred_length || 'auto';
  if (shortPatterns.test(message)) preferredLength = 'short';
  else if (longPatterns.test(message)) preferredLength = 'detailed';

  // Learn topics of interest from ticker patterns
  const topics = current.topics_of_interest || [];
  if (routing.agent === 'macro' && !topics.includes('macro')) topics.push('macro');
  if (ticker && !topics.includes(ticker)) {
    topics.push(ticker);
    if (topics.length > 10) topics.shift(); // keep last 10
  }

  try {
    await supabase.from('ai_user_memory').upsert({
      user_id: userId,
      experience_level: level,
      watched_tickers: watched,
      question_count: newCount,
      preferred_length: preferredLength,
      recent_corrections: recentCorrections,
      topics_of_interest: topics,
      last_question_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (err) {
    console.warn('[Memory] Update failed:', err.message);
  }
}
