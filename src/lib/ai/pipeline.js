import { guardrail } from './guardrail';
import { checkCache, setCache } from './cache';
import { route } from './router';
import { dataAgent } from './agents/dataAgent';
import { knowledgeAgent } from './agents/knowledgeAgent';
import { macroAgent } from './agents/macroAgent';
import { getMemory, updateMemory } from './memory';

const AGENTS = { data: dataAgent, knowledge: knowledgeAgent, macro: macroAgent };

console.log('[UpTik AI] Pipeline loaded. Agents: data, knowledge, macro. Memory: enabled.');

function checkForHallucination(response, context, agentType) {
  if (agentType === 'knowledge') return response; // education doesn't need price data

  const hasPriceData = context?.livePrice?.price != null;
  const hasMarketData = context?.marketData?.spy?.price != null;
  const hasAlertData = context?.compressedAlerts && context.compressedAlerts !== 'No alerts today.';
  const mentionsPrices = /\$\d+\.\d{2}/.test(response);
  const mentionsPercent = /\d+\.\d+%/.test(response);

  // If data agent has no price data but response contains specific dollar amounts
  if (agentType === 'data' && !hasPriceData && mentionsPrices) {
    console.warn('[UpTik AI] HALLUCINATION BLOCKED: response had prices but no price data available');
    return "I don't have live price data for that ticker right now. Markets may be closed or the price feed is unavailable. Check Yahoo Finance or your broker app for the current price.";
  }

  // If macro agent has no market data but response contains specific numbers
  if (agentType === 'macro' && !hasMarketData && mentionsPrices) {
    console.warn('[UpTik AI] HALLUCINATION BLOCKED: macro response had prices but no market data');
    return "I don't have live market data right now. Markets may be closed. Check back when they open.";
  }

  return response;
}

// Strip markdown formatting for clean chat display
function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function runPipeline(userMessage, conversationHistory, supabase, userId) {
  const start = Date.now();
  console.log('[UpTik AI] Processing:', userMessage);

  // Step 1: Guardrail (free — no API call)
  const guard = guardrail(userMessage);
  if (guard.blocked) {
    console.log(`[UpTik AI] BLOCKED | ${Date.now() - start}ms`);
    return { reply: guard.message, meta: { blocked: true, ms: Date.now() - start } };
  }

  // Step 2: Cache check (free — in-memory)
  const cached = checkCache(userMessage);
  if (cached.hit) {
    console.log(`[UpTik AI] CACHE HIT | ${Date.now() - start}ms`);
    return { reply: cached.response, meta: { cached: true, ms: Date.now() - start } };
  }

  // Step 3: Load user memory (free — Supabase read)
  const memory = await getMemory(supabase, userId);

  // Step 4: Route to the right agent (rule-based first, Haiku fallback)
  const routing = await route(userMessage, conversationHistory);
  console.log('[UpTik AI] Route:', routing.agent, routing.params?.ticker || '');

  // Step 5: Run the agent — fetch context + generate response
  const agent = AGENTS[routing.agent];
  if (!agent) {
    console.warn('[UpTik AI] Unknown agent:', routing.agent, '— falling back to knowledge');
    const fallback = AGENTS.knowledge;
    const ctx = await fallback.fetchContext(supabase, routing.params);
    const raw = await fallback.respond(userMessage, conversationHistory, ctx, memory);
    return { reply: stripMarkdown(raw), meta: { agent: 'knowledge', cached: false, ms: Date.now() - start, userLevel: memory.level } };
  }

  const context = await agent.fetchContext(supabase, routing.params);
  const rawResponse = await agent.respond(userMessage, conversationHistory, context, memory);
  let response = stripMarkdown(rawResponse);

  // Post-response: hallucination check
  response = checkForHallucination(response, context, routing.agent);

  // Cache it, update memory (non-blocking)
  setCache(userMessage, response);
  updateMemory(supabase, userId, userMessage, routing, memory).catch(() => {});

  const result = {
    reply: response,
    meta: {
      agent: routing.agent,
      ticker: routing.params?.ticker || null,
      cached: false,
      ms: Date.now() - start,
      userLevel: memory.level,
    }
  };

  console.log(`[UpTik AI] ${result.meta.agent} agent | ${result.meta.cached ? 'CACHE HIT' : 'fresh'} | ${result.meta.ms}ms | level: ${result.meta.userLevel}`);

  return result;
}
