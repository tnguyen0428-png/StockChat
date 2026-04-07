// ============================================
// Build feedback-aware context for AI prompts
// This is how the AI "learns" from user interactions
// ============================================

export function buildFeedbackContext(memory) {
  if (!memory) return '';

  const parts = [];

  // Feedback hints from recent ratings
  if (memory.feedback_hints?.length > 0) {
    parts.push(`ADAPT YOUR RESPONSE — based on this user's recent feedback:\n${memory.feedback_hints.map(h => `- ${h}`).join('\n')}`);
  }

  // Satisfaction signal
  if (memory.satisfaction === 'unhappy') {
    parts.push('NOTE: This user has been rating your responses poorly. Step up your game — be more helpful, more accurate, and more conversational. Give them a reason to rate you well.');
  } else if (memory.satisfaction === 'mixed') {
    parts.push('NOTE: This user has given mixed feedback. Pay extra attention to answering exactly what they asked.');
  }

  // Length preference
  if (memory.preferred_length === 'short') {
    parts.push('LENGTH: This user prefers SHORT responses. Be brief — get to the point fast.');
  } else if (memory.preferred_length === 'detailed') {
    parts.push('LENGTH: This user prefers DETAILED responses. Give them more data, more context, more analysis.');
  }

  // Recent correction
  if (memory.recent_corrections > 0) {
    parts.push('CAUTION: This user recently corrected you. Be extra careful with facts. If you\'re not sure about something, say so instead of guessing.');
  }

  // Topics of interest
  if (memory.topics_of_interest?.length > 0) {
    parts.push(`This user frequently asks about: ${memory.topics_of_interest.slice(-5).join(', ')}`);
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}
