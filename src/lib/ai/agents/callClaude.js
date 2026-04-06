const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-6',
};

export async function callClaude(systemPrompt, userMessage, history = [], tier = 'auto') {
  const recent = (history || []).slice(-8).map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  let model;
  if (tier === 'fast') model = MODELS.fast;
  else if (tier === 'smart') model = MODELS.smart;
  else model = needsSonnet(userMessage) ? MODELS.smart : MODELS.fast;

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
      max_tokens: 100,
      system: systemPrompt,
      messages: [...recent, { role: 'user', content: userMessage }]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.content[0].text;

  // If Haiku gave a weak answer, retry with Sonnet
  if (model === MODELS.fast && isWeakAnswer(text)) {
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
        max_tokens: 100,
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
  if (/compare|versus|vs|better|which|should i|analyze/i.test(msg)) score += 0.3;
  if ((msg.match(/\$[A-Z]{1,5}/g) || []).length > 1) score += 0.2;
  if (msg.length > 200) score += 0.2;
  return score > 0.5;
}

function isWeakAnswer(text) {
  if (text.length < 60) return true;
  const hedges = ["i think", "probably", "not sure", "i believe", "i don't have", "i can't"];
  let count = 0;
  for (const h of hedges) { if (text.toLowerCase().includes(h)) count++; }
  return count >= 2;
}
