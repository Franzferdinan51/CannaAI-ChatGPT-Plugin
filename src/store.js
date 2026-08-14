import { readFile } from 'node:fs/promises';
import { getConfig } from './config.js';
import { CannaAIClient } from './client/cannaai-client.js';
import { CannaAIError } from './client/errors.js';
import { detectCapabilities } from './client/capabilities.js';
import { normalizeEnvironmentResponse, normalizePlant, normalizePlantsResponse, unwrapPayloadData } from './client/normalize.js';
import {
  normalizeRoom,
  normalizeRoomsResponse,
  normalizeAlert,
  normalizeAlertsResponse,
  normalizeSensorHistory,
  normalizeAnalysesResponse,
  normalizeAnalysisHistory,
  normalizePlantHealthAnalytics,
  normalizeCanopyStatus,
  normalizeTrichomeCapabilities,
  compareEnvironmentSeries,
  summarizeAlerts,
} from './client/normalize-stage2.js';
import {
  normalizeAdvisorStatus,
  normalizeAdvisorResult,
  normalizeAiInsights,
  normalizeInventory,
} from './client/normalize-stage3.js';

const plantsPath = new URL('../data/plants.json', import.meta.url);
const envPath = new URL('../data/environment.json', import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function mockListPlants() {
  return readJson(plantsPath);
}

async function mockGetPlant(plantId) {
  const plants = await mockListPlants();
  return plants.find((plant) => plant.id === plantId) ?? null;
}

async function mockGetEnvironment(plantId) {
  const env = await readJson(envPath);
  return env[plantId] ?? null;
}

async function mockListRooms() {
  const plants = await mockListPlants();
  const seen = new Map();
  for (const plant of plants) {
    const id = String(plant.roomId ?? plant.location ?? 'Unassigned');
    if (!seen.has(id)) seen.set(id, { id, name: String(plant.location ?? id), temperatureF: null, humidityPct: null, co2Ppm: null, active: true, createdAt: null, updatedAt: null });
  }
  return [...seen.values()];
}

function createClient(config) {
  return new CannaAIClient({
    baseUrl: config.baseUrl,
    apiToken: config.apiToken,
    timeoutMs: config.timeoutMs,
  });
}

function safeVersion(status) {
  const payload = status?.payload;
  const data = unwrapPayloadData(payload);
  return data?.version ?? payload?.version ?? null;
}

function emptyAnalytics(timeframe = '7d') {
  return {
    timeframe,
    summary: { avgHealthScore: null, totalAnalyses: 0, statusDistribution: {}, trendData: [] },
    topIssues: [],
    records: [],
    plantStats: null,
    dateRange: null,
  };
}

export function createStore({ config = getConfig(), client = null, env = process.env } = {}) {
  const apiClient = config.mode === 'api' ? (client ?? createClient(config)) : null;

  async function listPlants() {
    if (config.mode === 'mock') return mockListPlants();
    return normalizePlantsResponse(await apiClient.listPlants({ page: 1, limit: 100 })).plants;
  }

  async function getPlant(plantId) {
    if (config.mode === 'mock') return mockGetPlant(plantId);
    try {
      const raw = unwrapPayloadData(await apiClient.getPlant(plantId));
      let plant = normalizePlant(raw);
      if (!plant?.id) return null;
      if (plant.strain === 'Unknown' || (plant.roomId && plant.location === plant.roomId)) {
        const listed = (await listPlants()).find((candidate) => candidate.id === plantId);
        if (listed) {
          plant = {
            ...listed,
            ...plant,
            strain: plant.strain === 'Unknown' ? listed.strain : plant.strain,
            location: plant.roomId && plant.location === plant.roomId ? listed.location : plant.location,
            cameraId: plant.cameraId ?? listed.cameraId,
            medium: plant.medium ?? listed.medium,
            expectedHarvestAt: plant.expectedHarvestAt ?? listed.expectedHarvestAt,
            healthStatus: plant.healthStatus ?? listed.healthStatus,
          };
        }
      }
      return plant;
    } catch (error) {
      if (!(error instanceof CannaAIError) || error.code !== 'CANNAAI_NOT_FOUND') throw error;
      const plants = await listPlants();
      return plants.find((plant) => plant.id === plantId) ?? null;
    }
  }

  async function getEnvironment(plantId) {
    if (config.mode === 'mock') return mockGetEnvironment(plantId);
    const payload = await apiClient.getEnvironment();
    return normalizeEnvironmentResponse(payload, plantId ? { plantId } : {});
  }

  async function getDashboardData(plantId) {
    const [plant, environment] = await Promise.all([getPlant(plantId), getEnvironment(plantId)]);
    if (!plant) return null;
    return { plant, environment };
  }

  async function listRooms() {
    if (config.mode === 'mock') return mockListRooms();
    return normalizeRoomsResponse(await apiClient.listRooms());
  }

  async function getRoom(roomId) {
    if (config.mode === 'mock') return (await mockListRooms()).find((room) => room.id === roomId) ?? null;
    try {
      return normalizeRoom(unwrapPayloadData(await apiClient.getRoom(roomId)));
    } catch (error) {
      if (error instanceof CannaAIError && error.code === 'CANNAAI_NOT_FOUND') return null;
      throw error;
    }
  }

  async function listRoomPlants(roomId) {
    const plants = await listPlants();
    return plants.filter((plant) => String(plant.roomId ?? plant.location ?? '') === String(roomId));
  }

  async function getEnvironmentHistory({ roomId = null, sensorId = null, limit = 50 } = {}) {
    if (config.mode === 'mock') return [];
    return normalizeSensorHistory(await apiClient.getSensorHistory({ roomId, sensorId, limit }));
  }

  async function compareEnvironment({ roomIdA, roomIdB, limit = 100 }) {
    if (!roomIdA || !roomIdB || roomIdA === roomIdB) throw new Error('compareEnvironment requires two distinct room IDs.');
    const [seriesA, seriesB] = await Promise.all([
      getEnvironmentHistory({ roomId: roomIdA, limit }),
      getEnvironmentHistory({ roomId: roomIdB, limit }),
    ]);
    return { roomIdA, roomIdB, ...compareEnvironmentSeries(seriesA, seriesB) };
  }

  async function listAlerts(filters = {}) {
    if (config.mode === 'mock') return [];
    let alerts = normalizeAlertsResponse(await apiClient.listAlerts());
    if (filters.severity) alerts = alerts.filter((alert) => alert.severity === String(filters.severity).toLowerCase());
    if (typeof filters.acknowledged === 'boolean') alerts = alerts.filter((alert) => alert.acknowledged === filters.acknowledged);
    if (filters.type) alerts = alerts.filter((alert) => alert.type === filters.type);
    if (filters.sensorId) alerts = alerts.filter((alert) => alert.sensorId === filters.sensorId);
    return alerts;
  }

  async function getAlert(alertId) {
    if (config.mode === 'mock') return null;
    return (await listAlerts()).find((alert) => alert.id === String(alertId)) ?? null;
  }

  async function summarizeActiveAlerts() {
    return summarizeAlerts(await listAlerts({ acknowledged: false }));
  }

  async function getPlantAnalyses(plantId) {
    if (config.mode === 'mock') return [];
    return normalizeAnalysesResponse(await apiClient.getPlantAnalyses(plantId));
  }

  async function getAnalysis(plantId, analysisId) {
    return (await getPlantAnalyses(plantId)).find((analysis) => analysis.id === analysisId) ?? null;
  }

  async function getAnalysisHistory() {
    if (config.mode === 'mock') return [];
    return normalizeAnalysisHistory(await apiClient.getAnalysisHistory());
  }

  async function getPlantHealthAnalytics({ timeframe = '7d', plantId = null } = {}) {
    if (config.mode === 'mock') return emptyAnalytics(timeframe);
    return normalizePlantHealthAnalytics(await apiClient.getPlantHealthAnalytics({ timeframe, plantId }));
  }

  async function comparePlants({ plantIds, timeframe = '7d' }) {
    const uniqueIds = [...new Set((plantIds ?? []).map(String))];
    if (uniqueIds.length < 2) throw new Error('comparePlants requires at least two distinct plant IDs.');
    const rows = await Promise.all(uniqueIds.map(async (plantId) => {
      const plant = await getPlant(plantId);
      let analytics = null;
      try {
        analytics = await getPlantHealthAnalytics({ timeframe, plantId });
      } catch (error) {
        if (!(error instanceof CannaAIError) || !['CANNAAI_NOT_FOUND', 'CANNAAI_UNAVAILABLE', 'CANNAAI_INTERNAL_ERROR'].includes(error.code)) throw error;
      }
      return {
        plant,
        analytics: analytics ? {
          avgHealthScore: analytics.summary.avgHealthScore,
          totalAnalyses: analytics.summary.totalAnalyses,
          topIssues: analytics.topIssues,
        } : null,
      };
    }));
    return { timeframe, plants: rows };
  }

  async function getCanopyStatus() {
    if (config.mode === 'mock') return null;
    return normalizeCanopyStatus(await apiClient.getCanopyStatus());
  }

  async function getTrichomeCapabilities() {
    if (config.mode === 'mock') return { status: null, supportedDevices: [], analysisOptions: {}, performance: {}, updatedAt: null };
    return normalizeTrichomeCapabilities(await apiClient.getTrichomeCapabilities());
  }

  async function getAdvisorStatus() {
    if (config.mode === 'mock') return { workflow: 'planner → skeptic → synthesizer', providers: [] };
    return normalizeAdvisorStatus(await apiClient.getAdvisorStatus());
  }

  async function askCannaAiAdvisor(options = {}) {
    if (config.mode === 'mock') {
      throw new CannaAIError('CANNAAI_UNSUPPORTED', 'CannaAI advisor execution requires api mode.');
    }
    return normalizeAdvisorResult(await apiClient.runAdvisor(options));
  }

  async function getAiInsights({ hours = 24 } = {}) {
    const parsedHours = Number.parseInt(String(hours), 10);
    const safeHours = Math.min(168, Math.max(1, Number.isFinite(parsedHours) ? parsedHours : 24));
    if (config.mode === 'mock') {
      return {
        insights: [],
        summary: 'CannaAI AI insights are unavailable in mock mode.',
        coPilotResponse: '',
        latestReadings: { vpdKpa: null, temperatureF: null, humidityPct: null, co2Ppm: null },
      };
    }
    return normalizeAiInsights(await apiClient.getAiInsights({ hours: safeHours }));
  }

  async function getInventorySummary() {
    if (config.mode === 'mock') {
      return {
        items: [],
        statistics: { totalValue: null, totalItems: 0, lowStockCount: 0, categoryBreakdown: {} },
        lowStockItems: [],
        source: 'mock',
      };
    }
    return normalizeInventory(await apiClient.getInventory());
  }

  async function listInventoryItems({ category = null, lowStockOnly = false } = {}) {
    const inventory = await getInventorySummary();
    let items = inventory.items;
    if (category) {
      const expected = String(category).trim().toLowerCase();
      items = items.filter((item) => String(item.category ?? '').toLowerCase() === expected);
    }
    if (lowStockOnly) {
      const lowIds = new Set(inventory.lowStockItems.map((item) => item.id));
      items = items.filter((item) => lowIds.has(item.id) || (
        item.quantity !== null && item.lowStockThreshold !== null && item.quantity <= item.lowStockThreshold
      ));
    }
    return items;
  }

  async function getBackendStatus() {
    if (config.mode === 'mock') {
      return {
        mode: 'mock',
        reachable: true,
        backend: { baseUrlConfigured: false, healthRoute: null, version: null },
      };
    }
    try {
      const status = await apiClient.getStatus();
      return {
        mode: 'api',
        reachable: true,
        backend: {
          baseUrlConfigured: Boolean(config.baseUrl),
          healthRoute: status.healthRoute,
          version: safeVersion(status),
        },
      };
    } catch (error) {
      return {
        mode: 'api',
        reachable: false,
        backend: { baseUrlConfigured: Boolean(config.baseUrl), healthRoute: null, version: null },
        errorCode: error instanceof CannaAIError ? error.code : 'CANNAAI_INTERNAL_ERROR',
      };
    }
  }

  async function getCapabilities() {
    if (config.mode === 'mock') {
      return detectCapabilities({ probes: { plants: true, environment: true, rooms: true }, env });
    }

    const probe = (method, args = []) => {
      if (typeof apiClient?.[method] !== 'function') {
        return Promise.reject(new CannaAIError('CANNAAI_UNSUPPORTED', `CannaAI client method ${method} is unavailable.`));
      }
      return apiClient[method](...args);
    };

    const [statusResult, plantsResult, environmentResult, roomsResult, sensorsResult, alertsResult, historyResult, analyticsResult, canopyResult, trichomeResult, advisorsResult, aiInsightsResult, inventoryResult] = await Promise.allSettled([
      probe('getStatus'),
      probe('listPlants', [{ page: 1, limit: 1 }]),
      probe('getEnvironment'),
      probe('listRooms'),
      probe('getSensorHistory', [{ limit: 1 }]),
      probe('listAlerts'),
      probe('getAnalysisHistory'),
      probe('getPlantHealthAnalytics', [{ timeframe: '7d' }]),
      probe('getCanopyStatus'),
      probe('getTrichomeCapabilities'),
      probe('getAdvisorStatus'),
      probe('getAiInsights', [{ hours: 1 }]),
      probe('getInventory'),
    ]);

    let plantAnalysesAvailable = false;
    if (plantsResult.status === 'fulfilled') {
      const firstPlant = normalizePlantsResponse(plantsResult.value).plants[0];
      if (firstPlant && typeof apiClient?.getPlantAnalyses === 'function') {
        try {
          await apiClient.getPlantAnalyses(firstPlant.id);
          plantAnalysesAvailable = true;
        } catch {
          plantAnalysesAvailable = false;
        }
      }
    }

    return detectCapabilities({
      status: statusResult.status === 'fulfilled' ? statusResult.value : null,
      probes: {
        plants: plantsResult.status === 'fulfilled',
        environment: environmentResult.status === 'fulfilled',
        rooms: roomsResult.status === 'fulfilled',
        environmentHistory: sensorsResult.status === 'fulfilled',
        alerts: alertsResult.status === 'fulfilled',
        analysisHistory: historyResult.status === 'fulfilled' || plantAnalysesAvailable,
        analytics: analyticsResult.status === 'fulfilled',
        canopy: canopyResult.status === 'fulfilled',
        trichomeAnalysis: trichomeResult.status === 'fulfilled',
        advisors: advisorsResult.status === 'fulfilled',
        aiInsights: aiInsightsResult.status === 'fulfilled',
        inventory: inventoryResult.status === 'fulfilled',
      },
      env,
    });
  }

  return {
    listPlants, getPlant, getEnvironment, getDashboardData,
    listRooms, getRoom, listRoomPlants, getEnvironmentHistory, compareEnvironment,
    listAlerts, getAlert, summarizeActiveAlerts,
    getPlantAnalyses, getAnalysis, getAnalysisHistory, getPlantHealthAnalytics, comparePlants,
    getCanopyStatus, getTrichomeCapabilities,
    getAdvisorStatus, askCannaAiAdvisor, getAiInsights, getInventorySummary, listInventoryItems,
    getBackendStatus, getCapabilities,
  };
}

function defaultStore() {
  return createStore();
}

export async function listPlants() { return defaultStore().listPlants(); }
export async function getPlant(plantId) { return defaultStore().getPlant(plantId); }
export async function getEnvironment(plantId) { return defaultStore().getEnvironment(plantId); }
export async function getDashboardData(plantId) { return defaultStore().getDashboardData(plantId); }
export async function listRooms() { return defaultStore().listRooms(); }
export async function getRoom(roomId) { return defaultStore().getRoom(roomId); }
export async function listRoomPlants(roomId) { return defaultStore().listRoomPlants(roomId); }
export async function getEnvironmentHistory(options) { return defaultStore().getEnvironmentHistory(options); }
export async function compareEnvironment(options) { return defaultStore().compareEnvironment(options); }
export async function listAlerts(filters) { return defaultStore().listAlerts(filters); }
export async function getAlert(alertId) { return defaultStore().getAlert(alertId); }
export async function summarizeActiveAlerts() { return defaultStore().summarizeActiveAlerts(); }
export async function getPlantAnalyses(plantId) { return defaultStore().getPlantAnalyses(plantId); }
export async function getAnalysis(plantId, analysisId) { return defaultStore().getAnalysis(plantId, analysisId); }
export async function getAnalysisHistory() { return defaultStore().getAnalysisHistory(); }
export async function getPlantHealthAnalytics(options) { return defaultStore().getPlantHealthAnalytics(options); }
export async function comparePlants(options) { return defaultStore().comparePlants(options); }
export async function getCanopyStatus() { return defaultStore().getCanopyStatus(); }
export async function getTrichomeCapabilities() { return defaultStore().getTrichomeCapabilities(); }
export async function getAdvisorStatus() { return defaultStore().getAdvisorStatus(); }
export async function askCannaAiAdvisor(options) { return defaultStore().askCannaAiAdvisor(options); }
export async function getAiInsights(options) { return defaultStore().getAiInsights(options); }
export async function getInventorySummary() { return defaultStore().getInventorySummary(); }
export async function listInventoryItems(options) { return defaultStore().listInventoryItems(options); }
export async function getBackendStatus() { return defaultStore().getBackendStatus(); }
export async function getCapabilities() { return defaultStore().getCapabilities(); }
