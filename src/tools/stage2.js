import { z } from 'zod';
import {
  listRooms,
  getRoom,
  listRoomPlants,
  getEnvironmentHistory,
  compareEnvironment,
  listAlerts,
  getAlert,
  summarizeActiveAlerts,
  getPlantAnalyses,
  getAnalysis,
  getAnalysisHistory,
  getPlantHealthAnalytics,
  comparePlants,
  getCanopyStatus,
  getTrichomeCapabilities,
} from '../store.js';

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

const roomSchema = z.object({
  id: z.string(), name: z.string(), temperatureF: z.number().nullable(), humidityPct: z.number().nullable(),
  co2Ppm: z.number().nullable(), active: z.boolean().nullable(), createdAt: z.string().nullable(), updatedAt: z.string().nullable(),
});

const plantSchema = z.object({
  id: z.string(), name: z.string(), strain: z.string(), stage: z.string(), day: z.number().nullable().optional(),
  roomId: z.string().nullable().optional(), location: z.string(), medium: z.string().nullable().optional(),
  plantedAt: z.string().nullable().optional(), expectedHarvestAt: z.string().nullable().optional(), cameraId: z.string().nullable().optional(),
  healthStatus: z.string().nullable().optional(), isActive: z.boolean().nullable().optional(), notes: z.string().optional(),
});

const historyRowSchema = z.object({
  timestamp: z.string().nullable(), temperatureF: z.number().nullable(), humidityPct: z.number().nullable(),
  vpdKpa: z.number().nullable(), co2Ppm: z.number().nullable(), light: z.number().nullable(), source: z.string().nullable(),
  roomId: z.string().nullable(), sensorId: z.string().nullable(),
});

const alertSchema = z.object({
  id: z.string(), sensorId: z.string().nullable(), type: z.string(), severity: z.string(), message: z.string(),
  acknowledged: z.boolean(), createdAt: z.string().nullable(), updatedAt: z.string().nullable(),
});

const analysisSchema = z.object({
  id: z.string(), plantId: z.string().nullable(), diagnosis: z.string(), urgency: z.string().nullable(),
  confidence: z.number().nullable(), healthScore: z.number().nullable(), recommendations: z.array(z.string()),
  provider: z.string().nullable(), createdAt: z.string().nullable(), result: z.any().nullable(),
});

const analyticsSchema = z.object({
  timeframe: z.string(),
  summary: z.object({
    avgHealthScore: z.number().nullable(), totalAnalyses: z.number(), statusDistribution: z.record(z.string(), z.number()),
    trendData: z.array(z.object({ date: z.string().nullable(), avgScore: z.number().nullable(), minScore: z.number().nullable(), maxScore: z.number().nullable(), count: z.number().nullable() })),
  }),
  topIssues: z.array(z.object({ issue: z.string(), count: z.number() })),
  records: z.array(z.object({ id: z.string(), plantId: z.string().nullable(), plantName: z.string().nullable(), healthScore: z.number().nullable(), healthStatus: z.string().nullable(), timestamp: z.string().nullable() })),
  plantStats: z.any().nullable(), dateRange: z.any().nullable(),
});

function result(text, structuredContent) {
  return { content: [{ type: 'text', text }], structuredContent };
}

export function registerStage2Tools(server) {
  server.registerTool('list_rooms', {
    title: 'List grow rooms',
    description: 'Use this when the user wants to see the grow rooms or zones known to CannaAI.',
    inputSchema: {}, outputSchema: { rooms: z.array(roomSchema) }, annotations,
  }, async () => {
    const rooms = await listRooms();
    return result(`Found ${rooms.length} grow rooms.`, { rooms });
  });

  server.registerTool('get_room', {
    title: 'Get grow room',
    description: 'Use this when the user wants details about one CannaAI grow room and you already know its room ID.',
    inputSchema: { roomId: z.string().min(1) }, outputSchema: { room: roomSchema.nullable() }, annotations,
  }, async ({ roomId }) => {
    const room = await getRoom(roomId);
    return result(room ? `Loaded ${room.name}.` : `Room ${roomId} was not found.`, { room });
  });

  server.registerTool('list_room_plants', {
    title: 'List plants in room',
    description: 'Use this when the user wants the plants assigned to a specific CannaAI room or zone.',
    inputSchema: { roomId: z.string().min(1) }, outputSchema: { roomId: z.string(), plants: z.array(plantSchema) }, annotations,
  }, async ({ roomId }) => {
    const plants = await listRoomPlants(roomId);
    return result(`Found ${plants.length} plants in room ${roomId}.`, { roomId, plants });
  });

  server.registerTool('get_environment_history', {
    title: 'Get environment history',
    description: 'Use this when the user wants recent CannaAI sensor history for a room, sensor, or the grow overall. Results are bounded to at most 500 readings.',
    inputSchema: { roomId: z.string().min(1).optional(), sensorId: z.string().min(1).optional(), limit: z.number().int().min(1).max(500).default(50) },
    outputSchema: { readings: z.array(historyRowSchema) }, annotations,
  }, async ({ roomId, sensorId, limit }) => {
    const readings = await getEnvironmentHistory({ roomId, sensorId, limit });
    return result(`Loaded ${readings.length} sensor readings.`, { readings });
  });

  server.registerTool('compare_environment', {
    title: 'Compare room environments',
    description: 'Use this when the user wants to compare recent environmental averages between two different CannaAI rooms.',
    inputSchema: { roomIdA: z.string().min(1), roomIdB: z.string().min(1), limit: z.number().int().min(1).max(500).default(100) },
    outputSchema: { comparison: z.any() }, annotations,
  }, async ({ roomIdA, roomIdB, limit }) => {
    const comparison = await compareEnvironment({ roomIdA, roomIdB, limit });
    return result(`Compared ${roomIdA} with ${roomIdB} across recent sensor readings.`, { comparison });
  });

  server.registerTool('list_alerts', {
    title: 'List CannaAI alerts',
    description: 'Use this when the user wants recent CannaAI alerts, optionally filtered by severity, acknowledgement, type, or sensor.',
    inputSchema: {
      severity: z.string().min(1).optional(), acknowledged: z.boolean().optional(), type: z.string().min(1).optional(), sensorId: z.string().min(1).optional(),
    }, outputSchema: { alerts: z.array(alertSchema) }, annotations,
  }, async (filters) => {
    const alerts = await listAlerts(filters);
    return result(`Found ${alerts.length} matching alerts.`, { alerts });
  });

  server.registerTool('get_alert', {
    title: 'Get CannaAI alert',
    description: 'Use this when the user wants details about one alert and you already know its alert ID.',
    inputSchema: { alertId: z.string().min(1) }, outputSchema: { alert: alertSchema.nullable() }, annotations,
  }, async ({ alertId }) => {
    const alert = await getAlert(alertId);
    return result(alert ? `Loaded alert ${alertId}.` : `Alert ${alertId} was not found.`, { alert });
  });

  server.registerTool('summarize_active_alerts', {
    title: 'Summarize active alerts',
    description: 'Use this when the user wants a quick CannaAI alert overview focused on currently unacknowledged high-priority conditions.',
    inputSchema: {}, outputSchema: { summary: z.any() }, annotations,
  }, async () => {
    const summary = await summarizeActiveAlerts();
    return result(`${summary.unacknowledged} unacknowledged alerts are currently reported.`, { summary });
  });

  server.registerTool('get_plant_analyses', {
    title: 'Get plant analyses',
    description: 'Use this when the user wants recent stored CannaAI analyses for a specific plant.',
    inputSchema: { plantId: z.string().min(1) }, outputSchema: { plantId: z.string(), analyses: z.array(analysisSchema) }, annotations,
  }, async ({ plantId }) => {
    const analyses = await getPlantAnalyses(plantId);
    return result(`Loaded ${analyses.length} analyses for ${plantId}.`, { plantId, analyses });
  });

  server.registerTool('get_analysis', {
    title: 'Get plant analysis',
    description: 'Use this when the user wants one stored plant analysis and already knows both its plant ID and analysis ID.',
    inputSchema: { plantId: z.string().min(1), analysisId: z.string().min(1) }, outputSchema: { analysis: analysisSchema.nullable() }, annotations,
  }, async ({ plantId, analysisId }) => {
    const analysis = await getAnalysis(plantId, analysisId);
    return result(analysis ? `Loaded analysis ${analysisId}.` : `Analysis ${analysisId} was not found for ${plantId}.`, { analysis });
  });

  server.registerTool('get_analysis_history', {
    title: 'Get analysis history',
    description: 'Use this when the user wants the legacy/global analysis history reported by the connected CannaAI backend. Persistence depends on that backend implementation.',
    inputSchema: {}, outputSchema: { history: z.array(analysisSchema) }, annotations,
  }, async () => {
    const history = await getAnalysisHistory();
    return result(`Loaded ${history.length} global analysis history entries.`, { history });
  });

  server.registerTool('get_plant_health_analytics', {
    title: 'Get plant health analytics',
    description: 'Use this when the user wants CannaAI health-score trends, status distribution, or top issues over 7, 30, or 90 days.',
    inputSchema: { timeframe: z.enum(['7d', '30d', '90d']).default('7d'), plantId: z.string().min(1).optional() },
    outputSchema: { analytics: analyticsSchema }, annotations,
  }, async ({ timeframe, plantId }) => {
    const analytics = await getPlantHealthAnalytics({ timeframe, plantId });
    return result(`Loaded ${timeframe} plant health analytics${plantId ? ` for ${plantId}` : ''}.`, { analytics });
  });

  server.registerTool('compare_plants', {
    title: 'Compare plants',
    description: 'Use this when the user wants to compare two to six CannaAI plants using metadata and available health analytics without inventing missing metrics.',
    inputSchema: { plantIds: z.array(z.string().min(1)).min(2).max(6), timeframe: z.enum(['7d', '30d', '90d']).default('7d') },
    outputSchema: { comparison: z.any() }, annotations,
  }, async ({ plantIds, timeframe }) => {
    const comparison = await comparePlants({ plantIds, timeframe });
    return result(`Compared ${comparison.plants.length} plants over ${timeframe}.`, { comparison });
  });

  server.registerTool('get_canopy_status', {
    title: 'Get canopy status',
    description: 'Use this when the user wants the canopy status reported by the CannaAI backend. Treat it as backend-reported data; some CannaAI builds currently expose a simple/demo canopy payload.',
    inputSchema: {},
    outputSchema: { canopy: z.object({ coveragePct: z.number().nullable(), height: z.number().nullable(), width: z.number().nullable(), density: z.string().nullable(), source: z.string() }) },
    annotations,
  }, async () => {
    const canopy = await getCanopyStatus();
    return result(canopy ? 'Loaded the CannaAI canopy status.' : 'No canopy status is available.', { canopy });
  });

  server.registerTool('get_trichome_capabilities', {
    title: 'Get trichome analysis capabilities',
    description: 'Use this when the user wants to know whether the connected CannaAI build supports trichome analysis and what camera/magnification requirements it reports before attempting an analysis.',
    inputSchema: {},
    outputSchema: { capabilities: z.object({ status: z.string().nullable(), supportedDevices: z.array(z.any()), analysisOptions: z.any(), performance: z.any(), updatedAt: z.string().nullable() }) },
    annotations,
  }, async () => {
    const capabilities = await getTrichomeCapabilities();
    return result(`Trichome analysis capability status: ${capabilities.status ?? 'unknown'}.`, { capabilities });
  });
}
