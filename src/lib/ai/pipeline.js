import { guardrail } from './guardrail';
import { checkCache, setCache, clearCache } from './cache';
import { route } from './router';
import { dataAgent } from './agents/dataAgent';
import { knowledgeAgent } from './agents/knowledgeAgent';
import { macroAgent } from './agents/macroAgent';
import { getMemory, updateMemory } from './memory';

const AGENTS = { data: dataAgent, knowledge: knowledgeAgent, macro: macroAgent };

console.log('[UpTik AI] Pipeline loaded. Agents: data, knowledge, macro. Memory: enabled.');

function checkForHallucination(response, context, agentType) {
  if (agentType === 'knowledge') return response;

  const price = context?.livePrice?.price;
  const realVolume = context?.livePrice?.volume;
  const hasRealData = price != null && price > 0;
  const hasMarketData = context?.marketData?.spy?.price != null;
  const ticker = context?.ticker || 'that stock';

  const responsePrices = [...response.matchAll(/\$(\d+\.?\d*)/g)].map(m => parseFloat(m[1]));
  const volumeMatch = response.match(/(\d+\.?\d*)\s*(million|M)\s*(shares|volume)/i);
  const responseVolume = volumeMatch ? parseFloat(volumeMatch[1]) * 1e6 : null;

  // No data but response has prices = hallucination
  if (agentType === 'data' && !hasRealData && responsePrices.length > 0) {
    console.warn('[UpTik AI] HALLUCINATION BLOCKED: no price data but response has $amounts');
    return `I don't have live data for ${ticker} right now. Markets may be closed. Not financial advice.`;
  }

  if (agentType === 'data' && hasRealData) {
    const realPrice = parseFloat(price);

    // Check price accuracy (>5% off = fabricated)
    if (responsePrices.length > 0) {
      const mainResponsePrice = responsePrices[0];
      const priceDiff = Math.abs(mainResponsePrice - realPrice) / realPrice;
      if (priceDiff > 0.05) {
        console.warn('[UpTik AI] HALLUCINATION BLOCKED: price mismatch. Real:', realPrice, 'Response:', mainResponsePrice);
        return `${ticker} last traded at $${realPrice.toFixed(2)}. Not financial advice.`;
      }
    }

    // Check volume accuracy (>20% off = strip it)
    if (responseVolume && realVolume) {
      const volDiff = Math.abs(responseVolume - realVolume) / realVolume;
      if (volDiff > 0.20) {
        console.warn('[UpTik AI] Volume mismatch stripped. Real:', realVolume, 'Response:', responseVolume);
        response = response.replace(/\d+\.?\d*\s*(million|M)\s*(shares|volume)[^.]*\./i, '');
      }
    } else if (responseVolume && !realVolume) {
      console.warn('[UpTik AI] Volume claim stripped — no real volume data');
      response = response.replace(/\d+\.?\d*\s*(million|M)\s*(shares|volume)[^.]*\./i, '');
    }

    // Strip any price targets or levels not from Polygon data
    for (const rp of responsePrices) {
      const diff = Math.abs(rp - realPrice) / realPrice;
      if (diff > 0.01 && diff <= 1.0) {
        console.warn('[UpTik AI] Stripping fabricated price level: $' + rp, '(real: $' + realPrice + ')');
        const escaped = rp.toString().replace('.', '\\.');
        const regex = new RegExp(`[^.]*\\$${escaped}[^.]*\\.?`, 'g');
        response = response.replace(regex, '');
      }
    }

    // Check for fabricated percentages when change is null
    const realChange = context?.livePrice?.changePercent;
    const responsePercents = [...response.matchAll(/(\d+\.?\d*)%/g)].map(m => parseFloat(m[1]));
    if (realChange === null && responsePercents.length > 0) {
      console.warn('[UpTik AI] HALLUCINATION BLOCKED: no change data but response has percentages');
      return `${ticker} last closed at $${realPrice.toFixed(2)}. Markets are closed so I don't have today's change data. Not financial advice.`;
    }
  }

  // Macro: no market data but response has prices
  if (agentType === 'macro' && !hasMarketData && responsePrices.length > 0) {
    console.warn('[UpTik AI] HALLUCINATION BLOCKED: no market data but response has $amounts');
    return "I don't have live market data right now. Markets may be closed. Check back when they open.";
  }

  // Hard strip: remove any trailing sentence that ends with ?
  response = response.replace(/\s*[^.!]*\?\s*$/, '').trim();
  if (response && !response.endsWith('.') && !response.endsWith('!')) response += '.';

  return response.trim();
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
