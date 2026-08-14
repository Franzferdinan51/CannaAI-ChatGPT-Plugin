import { readFileSync } from 'node:fs';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import {
  getGrowOverview,
  getRoom,
  getEnvironmentHistory,
  listAlerts,
  getPlant,
  getPlantAnalyses,
  getPlantHealthAnalytics,
} from '../store.js';

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

const resources = [
  {
    name: 'cannaai-grow-overview',
    uri: 'ui://cannaai/grow-overview-v1.html',
    file: '../../public/grow-overview-widget.html',
    description: 'CannaAI grow overview with rooms, plants, active alerts, predictive insights, and inventory status.',
  },
  {
    name: 'cannaai-environment-trends',
    uri: 'ui://cannaai/environment-trends-v1.html',
    file: '../../public/environment-trends-widget.html',
    description: 'CannaAI room environment history with summary metrics and inline trend charts.',
  },
  {
    name: 'cannaai-alerts-dashboard',
    uri: 'ui://cannaai/alerts-v1.html',
    file: '../../public/alerts-widget.html',
    description: 'CannaAI read-only alert dashboard grouped by severity and acknowledgement state.',
  },
  {
    name: 'cannaai-analysis-dashboard',
    uri: 'ui://cannaai/analysis-v1.html',
    file: '../../public/analysis-widget.html',
    description: 'CannaAI plant analysis dashboard with stored diagnoses, recommendations, and health analytics.',
  },
].map((resource) => ({
  ...resource,
  html: readFileSync(new URL(resource.file, import.meta.url), 'utf8'),
}));

function result(text, structuredContent) {
  return { content: [{ type: 'text', text }], structuredContent };
}

function registerResource(server, resource) {
  registerAppResource(server, resource.name, resource.uri, {}, async () => ({
    contents: [{
      uri: resource.uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: resource.html,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [] },
        },
        'openai/widgetDescription': resource.description,
      },
    }],
  }));
}

function summarizeVisibleAlerts(alerts) {
  const severityDistribution = {};
  let unacknowledged = 0;
  for (const alert of alerts) {
    severityDistribution[alert.severity] = (severityDistribution[alert.severity] ?? 0) + 1;
    if (!alert.acknowledged) unacknowledged += 1;
  }
  return { total: alerts.length, unacknowledged, severityDistribution };
}

export function registerStage4Views(server) {
  for (const resource of resources) registerResource(server, resource);

  registerAppTool(server, 'render_grow_overview', {
    title: 'Show CannaAI grow overview',
    description: 'Use this when a visual overview of the current CannaAI grow would help summarize rooms, plants, active alerts, predictive insights, and inventory status.',
    inputSchema: { insightHours: z.number().int().min(1).max(168).default(24) },
    outputSchema: { overview: z.any() },
    annotations,
    _meta: {
      ui: { resourceUri: 'ui://cannaai/grow-overview-v1.html' },
      'openai/outputTemplate': 'ui://cannaai/grow-overview-v1.html',
      'openai/toolInvocation/invoking': 'Building grow overview…',
      'openai/toolInvocation/invoked': 'Grow overview ready.',
    },
  }, async ({ insightHours }) => {
    const overview = await getGrowOverview({ insightHours });
    return result('Showing the current CannaAI grow overview.', { overview });
  });

  registerAppTool(server, 'render_environment_trends', {
    title: 'Show CannaAI environment trends',
    description: 'Use this when a visual chart of recent CannaAI room sensor readings would help explain temperature, humidity, VPD, CO2, or light trends.',
    inputSchema: { roomId: z.string().min(1), limit: z.number().int().min(1).max(500).default(100) },
    outputSchema: { room: z.any().nullable(), readings: z.array(z.any()) },
    annotations,
    _meta: {
      ui: { resourceUri: 'ui://cannaai/environment-trends-v1.html' },
      'openai/outputTemplate': 'ui://cannaai/environment-trends-v1.html',
      'openai/toolInvocation/invoking': 'Loading environment trends…',
      'openai/toolInvocation/invoked': 'Environment trends ready.',
    },
  }, async ({ roomId, limit }) => {
    const [room, readings] = await Promise.all([getRoom(roomId), getEnvironmentHistory({ roomId, limit })]);
    return result(`Showing ${readings.length} recent readings for ${room?.name ?? roomId}.`, { room, readings });
  });

  registerAppTool(server, 'render_alerts_dashboard', {
    title: 'Show CannaAI alerts',
    description: 'Use this when a visual read-only alert dashboard would help the user review and prioritize current CannaAI alerts.',
    inputSchema: { severity: z.string().min(1).optional(), acknowledged: z.boolean().optional() },
    outputSchema: { alerts: z.array(z.any()), summary: z.any() },
    annotations,
    _meta: {
      ui: { resourceUri: 'ui://cannaai/alerts-v1.html' },
      'openai/outputTemplate': 'ui://cannaai/alerts-v1.html',
      'openai/toolInvocation/invoking': 'Loading CannaAI alerts…',
      'openai/toolInvocation/invoked': 'CannaAI alerts ready.',
    },
  }, async (filters) => {
    const alerts = await listAlerts(filters);
    const summary = summarizeVisibleAlerts(alerts);
    return result(`Showing ${alerts.length} CannaAI alerts.`, { alerts, summary });
  });

  registerAppTool(server, 'render_plant_analysis', {
    title: 'Show CannaAI plant analysis',
    description: 'Use this when a visual summary of stored CannaAI diagnoses, recommendations, and health analytics would help inspect a specific plant.',
    inputSchema: { plantId: z.string().min(1), timeframe: z.enum(['7d', '30d', '90d']).default('30d') },
    outputSchema: { plant: z.any().nullable(), analyses: z.array(z.any()), analytics: z.any() },
    annotations,
    _meta: {
      ui: { resourceUri: 'ui://cannaai/analysis-v1.html' },
      'openai/outputTemplate': 'ui://cannaai/analysis-v1.html',
      'openai/toolInvocation/invoking': 'Loading plant analysis…',
      'openai/toolInvocation/invoked': 'Plant analysis ready.',
    },
  }, async ({ plantId, timeframe }) => {
    const [plant, analyses, analytics] = await Promise.all([
      getPlant(plantId),
      getPlantAnalyses(plantId),
      getPlantHealthAnalytics({ timeframe, plantId }),
    ]);
    return result(`Showing stored CannaAI analysis for ${plant?.name ?? plantId}.`, { plant, analyses, analytics });
  });
}
