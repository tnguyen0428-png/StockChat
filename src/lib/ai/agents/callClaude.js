const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-6',
};

export async function callClaude(systemPrompt, userMessage, history = [], tier = 'auto', maxTokens = null) {
  // Keep more history for natural conversation flow
  const recent = (history || []).slice(-12).map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  let model;
  if (tier === 'fast') model = MODELS.fast;
  else if (tier === 'smart') model = MODELS.smart;
  else model = needsSonnet(userMessage) ? MODELS.smart : MODELS.fast;

  // Slightly warmer temperature for more natural voice
  const temperature = 0.7;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 500,
      temperature,
      system: systemPrompt,
      messages: [...recent, { role: 'user', content: userMessage }]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.content[0].text;

  // If Haiku gave a truly empty or broken answer, retry with Sonnet
  // Don't penalize honest hedging like "I don't have live data"
  if (model === MODELS.fast && isWeakAnswer(text, userMessage)) {
    const retry = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODELS.smart,
        max_tokens: maxTokens || 500,
        temperature,
        system: systemPrompt,
        messages: [...recent, { role: 'user', content: userMessage }]
      })
    });
    const retryData = await retry.json();
    if (retryData.error) throw new Error(retryData.error.message);
    return retryData.content[0].text;
  }

  return text;
}

function needsSonnet(msg) {
  let score = 0;
  if ((msg.match(/\?/g) || []).length > 1) score += 0.3;
  if (/compare|versus|vs|better|which|should i|analyze|break down|deep dive/i.test(msg)) score += 0.3;
  if ((msg.match(/\$[A-Z]{1,5}/g) || []).length > 1) score += 0.2;
  if (msg.length > 200) score += 0.2;
  return score > 0.5;
}

function isWeakAnswer(text, userMessage) {
  // Super short = genuinely weak
  if (text.length < 40) return true;

  // Empty platitudes with no substance
  if (text.length < 80 && /i('m| am) (not sure|unable|sorry)/i.test(text)) return true;

  // Don't flag "I don't have live data" as weak — that's honest, not broken
  if (/i don't have (live|real-time|current)/i.test(text)) return false;

  // Multiple hedge phrases in a short response = model is floundering
  const hedges = ["i'm not sure", "i cannot", "i'm unable", "i don't know enough"];
  let count = 0;
  for (const h of hedges) { if (text.toLowerCase().includes(h)) count++; }
  return count >= 2;
}
