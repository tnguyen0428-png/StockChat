export function guardrail(message) {
  const lower = message.toLowerCase().trim();

  if (lower.length < 2) {
    return { blocked: true, message: "Hey! Ask me about any stock, today's alerts, or a trading concept." };
  }

  const offTopic = ['crypto', 'bitcoin', 'ethereum', 'solana', 'forex', 'gambling', 'casino', 'lottery'];
  if (offTopic.some(w => lower.includes(w))) {
    return { blocked: true, message: "I'm focused on US stocks and options right now. Ask me about a ticker, today's alerts, or how something works!" };
  }

  const harmful = ['hack', 'insider trading', 'manipulate', 'pump and dump', 'front run'];
  if (harmful.some(w => lower.includes(w))) {
    return { blocked: true, message: "I can't help with that. Let's stick to legitimate trading strategies and education." };
  }

  return { blocked: false };
}
