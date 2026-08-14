import { readFile } from "node:fs/promises";
import { getConfig } from "./config.js";
import { CannaAIClient } from "./client/cannaai-client.js";
import { CannaAIError } from "./client/errors.js";
import { detectCapabilities } from "./client/capabilities.js";
import { normalizeEnvironmentResponse, normalizePlant, normalizePlantsResponse, unwrapPayloadData } from "./client/normalize.js";

const plantsPath = new URL("../data/plants.json", import.meta.url);
const envPath = new URL("../data/environment.json", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
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

export function createStore({ config = getConfig(), client = null, env = process.env } = {}) {
  const apiClient = config.mode === "api" ? (client ?? createClient(config)) : null;

  async function listPlants() {
    if (config.mode === "mock") return mockListPlants();
    return normalizePlantsResponse(await apiClient.listPlants({ page: 1, limit: 100 })).plants;
  }

  async function getPlant(plantId) {
    if (config.mode === "mock") return mockGetPlant(plantId);
    try {
      const raw = unwrapPayloadData(await apiClient.getPlant(plantId));
      let plant = normalizePlant(raw);
      if (!plant?.id) return null;
      if (plant.strain === "Unknown" || (plant.roomId && plant.location === plant.roomId)) {
        const listed = (await listPlants()).find((candidate) => candidate.id === plantId);
        if (listed) {
          plant = {
            ...listed,
            ...plant,
            strain: plant.strain === "Unknown" ? listed.strain : plant.strain,
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
      if (!(error instanceof CannaAIError) || error.code !== "CANNAAI_NOT_FOUND") throw error;
      const plants = await listPlants();
      return plants.find((plant) => plant.id === plantId) ?? null;
    }
  }

  async function getEnvironment(plantId) {
    if (config.mode === "mock") return mockGetEnvironment(plantId);
    const payload = await apiClient.getEnvironment();
    return normalizeEnvironmentResponse(payload, plantId ? { plantId } : {});
  }

  async function getDashboardData(plantId) {
    const [plant, environment] = await Promise.all([getPlant(plantId), getEnvironment(plantId)]);
    if (!plant) return null;
    return { plant, environment };
  }

  async function getBackendStatus() {
    if (config.mode === "mock") {
      return {
        mode: "mock",
        reachable: true,
        backend: { baseUrlConfigured: false, healthRoute: null, version: null },
      };
    }
    try {
      const status = await apiClient.getStatus();
      return {
        mode: "api",
        reachable: true,
        backend: {
          baseUrlConfigured: Boolean(config.baseUrl),
          healthRoute: status.healthRoute,
          version: safeVersion(status),
        },
      };
    } catch (error) {
      return {
        mode: "api",
        reachable: false,
        backend: { baseUrlConfigured: Boolean(config.baseUrl), healthRoute: null, version: null },
        errorCode: error instanceof CannaAIError ? error.code : "CANNAAI_INTERNAL_ERROR",
      };
    }
  }

  async function getCapabilities() {
    if (config.mode === "mock") {
      return detectCapabilities({ probes: { plants: true, environment: true }, env });
    }

    const [statusResult, plantsResult, environmentResult] = await Promise.allSettled([
      apiClient.getStatus(),
      apiClient.listPlants({ page: 1, limit: 1 }),
      apiClient.getEnvironment(),
    ]);
    return detectCapabilities({
      status: statusResult.status === "fulfilled" ? statusResult.value : null,
      probes: {
        plants: plantsResult.status === "fulfilled",
        environment: environmentResult.status === "fulfilled",
      },
      env,
    });
  }

  return { listPlants, getPlant, getEnvironment, getDashboardData, getBackendStatus, getCapabilities };
}

function defaultStore() {
  return createStore();
}

export async function listPlants() {
  return defaultStore().listPlants();
}

export async function getPlant(plantId) {
  return defaultStore().getPlant(plantId);
}

export async function getEnvironment(plantId) {
  return defaultStore().getEnvironment(plantId);
}

export async function getDashboardData(plantId) {
  return defaultStore().getDashboardData(plantId);
}

export async function getBackendStatus() {
  return defaultStore().getBackendStatus();
}

export async function getCapabilities() {
  return defaultStore().getCapabilities();
}
