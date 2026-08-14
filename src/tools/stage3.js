import { z } from 'zod';
import {
  getAdvisorStatus,
  askCannaAiAdvisor,
  getAiInsights,
  getInventorySummary,
  listInventoryItems,
} from '../store.js';

const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const computeAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

const providerSchema = z.object({
  id: z.string(),
  status: z.string(),
  healthy: z.boolean(),
  capabilities: z.any().nullable(),
});

const stageSchema = z.object({
  role: z.string(),
  content: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().nullable(),
});

const insightSchema = z.object({
  id: z.string(),
  severity: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  predictedCause: z.string().nullable(),
  recommendedActions: z.array(z.string()),
  timestamp: z.string().nullable(),
  sourceReadings: z.number(),
});

const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  cost: z.number().nullable(),
  lastRestocked: z.string().nullable(),
  lowStockThreshold: z.number().nullable(),
});

function result(text, structuredContent) {
  return { content: [{ type: 'text', text }], structuredContent };
}

export function registerStage3Tools(server) {
  server.registerTool('get_advisor_status', {
    title: 'Get CannaAI advisor status',
    description: 'Use this when the user wants to know which AI providers CannaAI can use for its planner → skeptic → synthesizer advisor workflow before running that workflow.',
    inputSchema: {},
    outputSchema: { workflow: z.string(), providers: z.array(providerSchema) },
    annotations: readAnnotations,
  }, async () => {
    const status = await getAdvisorStatus();
    const healthy = status.providers.filter((provider) => provider.healthy).length;
    return result(`CannaAI reports ${healthy} healthy advisor provider${healthy === 1 ? '' : 's'}.`, status);
  });

  server.registerTool('ask_cannaai_advisor', {
    title: 'Ask CannaAI advisor',
    description: 'Use this when the user explicitly wants CannaAI\'s own multi-stage advisor workflow to evaluate a cultivation or grow-operations task. This runs CannaAI\'s configured AI provider workflow and may consume provider inference.',
    inputSchema: {
      task: z.string().min(1).max(12000),
      context: z.string().max(20000).optional(),
      provider: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    },
    outputSchema: { answer: z.string(), stages: z.array(stageSchema) },
    annotations: computeAnnotations,
    _meta: {
      'openai/toolInvocation/invoking': 'Running CannaAI advisor workflow…',
      'openai/toolInvocation/invoked': 'CannaAI advisor workflow complete.',
    },
  }, async (options) => {
    const advice = await askCannaAiAdvisor(options);
    return result(advice.answer || 'CannaAI returned no synthesized advisor answer.', advice);
  });

  server.registerTool('get_ai_insights', {
    title: 'Get CannaAI AI insights',
    description: 'Use this when the user wants CannaAI\'s predictive analysis of recent sensor trends. The current backend is queried by lookback hours only; this tool intentionally does not claim room-specific filtering.',
    inputSchema: { hours: z.number().int().min(1).max(168).default(24) },
    outputSchema: {
      insights: z.array(insightSchema),
      summary: z.string(),
      coPilotResponse: z.string(),
      latestReadings: z.object({
        vpdKpa: z.number().nullable(), temperatureF: z.number().nullable(), humidityPct: z.number().nullable(), co2Ppm: z.number().nullable(),
      }),
    },
    annotations: readAnnotations,
  }, async ({ hours }) => {
    const insights = await getAiInsights({ hours });
    return result(insights.coPilotResponse || insights.summary || 'CannaAI returned no predictive insight summary.', insights);
  });

  server.registerTool('get_inventory_summary', {
    title: 'Get CannaAI inventory summary',
    description: 'Use this when the user wants the inventory totals, value, category breakdown, or low-stock items reported by CannaAI. Current CannaAI main uses an in-memory/mock inventory implementation, so treat these values as backend-reported and potentially demo data.',
    inputSchema: {},
    outputSchema: {
      items: z.array(inventoryItemSchema),
      statistics: z.object({ totalValue: z.number().nullable(), totalItems: z.number(), lowStockCount: z.number(), categoryBreakdown: z.record(z.string(), z.number()) }),
      lowStockItems: z.array(inventoryItemSchema),
      source: z.string(),
    },
    annotations: readAnnotations,
  }, async () => {
    const inventory = await getInventorySummary();
    return result(`CannaAI reports ${inventory.statistics.totalItems} inventory items and ${inventory.statistics.lowStockCount} low-stock items.`, inventory);
  });

  server.registerTool('list_inventory_items', {
    title: 'List CannaAI inventory items',
    description: 'Use this when the user wants CannaAI-reported inventory items, optionally filtered by category or low-stock status. Current CannaAI main uses an in-memory/mock inventory implementation, so the returned items may be demo data.',
    inputSchema: { category: z.string().min(1).optional(), lowStockOnly: z.boolean().default(false) },
    outputSchema: { items: z.array(inventoryItemSchema), source: z.string() },
    annotations: readAnnotations,
  }, async ({ category, lowStockOnly }) => {
    const items = await listInventoryItems({ category, lowStockOnly });
    return result(`Found ${items.length} matching CannaAI inventory items.`, { items, source: 'cannaai-backend' });
  });
}
