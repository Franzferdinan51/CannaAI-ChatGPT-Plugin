function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function normalizeAdvisorStatus(payload) {
  const providers = Array.isArray(payload?.providers) ? payload.providers.map((provider) => ({
    id: String(provider?.id ?? provider?.name ?? 'unknown'),
    status: String(provider?.status ?? 'unknown'),
    healthy: typeof provider?.healthy === 'boolean' ? provider.healthy : provider?.status !== 'unhealthy',
    capabilities: Array.isArray(provider?.capabilities) ? provider.capabilities : provider?.capabilities ?? null,
  })) : [];
  return {
    workflow: String(payload?.workflow ?? 'planner → skeptic → synthesizer'),
    providers,
  };
}

export function normalizeAdvisorResult(payload) {
  const stages = Array.isArray(payload?.stages) ? payload.stages.map((stage) => ({
    role: String(stage?.role ?? 'unknown'),
    content: String(stage?.content ?? ''),
    provider: stage?.provider == null ? null : String(stage.provider),
    model: stage?.model == null ? null : String(stage.model),
    latencyMs: num(stage?.latency ?? stage?.latencyMs),
  })) : [];
  return {
    answer: String(payload?.answer ?? ''),
    stages,
  };
}

export function normalizeAiInsights(payload) {
  const insights = Array.isArray(payload?.insights) ? payload.insights.map((insight) => ({
    id: String(insight?.id ?? ''),
    severity: String(insight?.severity ?? 'low').toLowerCase(),
    type: String(insight?.type ?? 'unknown'),
    title: String(insight?.title ?? ''),
    description: String(insight?.description ?? ''),
    predictedCause: insight?.predicted_cause == null ? null : String(insight.predicted_cause),
    recommendedActions: Array.isArray(insight?.recommended_actions) ? insight.recommended_actions.map(String) : [],
    timestamp: iso(insight?.timestamp),
    sourceReadings: num(insight?.source_readings) ?? 0,
  })).filter((insight) => insight.id || insight.title) : [];

  const latest = payload?.latest_readings && typeof payload.latest_readings === 'object' ? payload.latest_readings : {};
  return {
    insights,
    summary: String(payload?.summary ?? ''),
    coPilotResponse: String(payload?.co_pilot_response ?? ''),
    latestReadings: {
      vpdKpa: num(latest.vpd ?? latest.vpdKpa),
      temperatureF: num(latest.temperature ?? latest.temperatureF),
      humidityPct: num(latest.humidity ?? latest.humidityPct),
      co2Ppm: num(latest.co2 ?? latest.co2Ppm),
    },
  };
}

function normalizeInventoryItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? 'Unnamed item'),
    category: item.category == null ? null : String(item.category),
    quantity: num(item.quantity),
    unit: item.unit == null ? null : String(item.unit),
    cost: num(item.cost),
    lastRestocked: item.lastRestocked == null ? null : String(item.lastRestocked),
    lowStockThreshold: num(item.lowStockThreshold),
  };
}

export function normalizeInventory(payload) {
  const items = Array.isArray(payload?.inventory) ? payload.inventory.map(normalizeInventoryItem).filter((item) => item?.id) : [];
  const lowStockItems = Array.isArray(payload?.lowStockItems) ? payload.lowStockItems.map(normalizeInventoryItem).filter((item) => item?.id) : [];
  const stats = payload?.statistics && typeof payload.statistics === 'object' ? payload.statistics : {};
  const categoryBreakdown = stats.categoryBreakdown && typeof stats.categoryBreakdown === 'object'
    ? Object.fromEntries(Object.entries(stats.categoryBreakdown).map(([key, value]) => [key, num(value)]).filter(([, value]) => value !== null))
    : {};
  return {
    items,
    statistics: {
      totalValue: num(stats.totalValue),
      totalItems: num(stats.totalItems) ?? items.length,
      lowStockCount: num(stats.lowStockCount) ?? lowStockItems.length,
      categoryBreakdown,
    },
    lowStockItems,
    source: 'cannaai-backend',
  };
}
