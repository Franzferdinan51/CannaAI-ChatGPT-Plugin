import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { CannaAIError } from "../src/client/errors.js";

const mockConfig = { mode: "mock", baseUrl: null, apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };
const apiConfig = { mode: "api", baseUrl: "http://cannaai.local", apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };

test("mock mode preserves fixture data", async () => {
  const store = createStore({ config: mockConfig, env: {} });
  const plants = await store.listPlants();
  assert.ok(plants.length >= 1);
  const data = await store.getDashboardData(plants[0].id);
  assert.equal(data.plant.id, plants[0].id);
  assert.ok(data.environment);
});

test("api mode normalizes backend plants", async () => {
  const client = {
    listPlants: async () => ({ success: true, data: { plants: [{ id: "p1", name: "P1", age: 12, locationId: "r1", strain: { name: "Purple Sunshine" } }], pagination: {} } }),
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  const plants = await store.listPlants();
  assert.equal(plants[0].strain, "Purple Sunshine");
  assert.equal(plants[0].day, 12);
  assert.equal(plants[0].roomId, "r1");
});

test("api getPlant uses detail endpoint", async () => {
  const client = {
    getPlant: async () => ({ success: true, data: { id: "p1", name: "Detail", stage: "flower", strain: "Detail Strain" } }),
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  const plant = await store.getPlant("p1");
  assert.equal(plant.name, "Detail");
});

test("api getPlant enriches detail data from list metadata", async () => {
  const client = {
    getPlant: async () => ({ success: true, data: { id: "p1", name: "Detail", stage: "flower", locationId: "r1" } }),
    listPlants: async () => ({ success: true, data: { plants: [{ id: "p1", name: "Detail", stage: "flower", locationId: "r1", strain: { name: "Purple Sunshine" }, room: { name: "Flower Tent" } }], pagination: {} } }),
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  const plant = await store.getPlant("p1");
  assert.equal(plant.strain, "Purple Sunshine");
  assert.equal(plant.location, "Flower Tent");
});

test("api getPlant falls back to list after a detail 404", async () => {
  const client = {
    getPlant: async () => { throw new CannaAIError("CANNAAI_NOT_FOUND", "missing", { status: 404 }); },
    listPlants: async () => ({ success: true, data: { plants: [{ id: "p1", name: "Fallback" }], pagination: {} } }),
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  assert.equal((await store.getPlant("p1")).name, "Fallback");
  assert.equal(await store.getPlant("missing"), null);
});

test("api environment does not mislabel global readings as plant-specific", async () => {
  const client = {
    getEnvironment: async () => ({ success: true, data: { readings: [{ sensorId: "tent-temp", value: 78, data: { type: "temperature", unit: "F" } }] } }),
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  assert.equal(await store.getEnvironment("p1"), null);
  assert.equal((await store.getEnvironment()).temperatureF, 78);
});

test("api status never exposes the base URL", async () => {
  const client = { getStatus: async () => ({ reachable: true, healthRoute: false, payload: null }) };
  const store = createStore({ config: apiConfig, client, env: {} });
  const status = await store.getBackendStatus();
  assert.deepEqual(status, { mode: "api", reachable: true, backend: { baseUrlConfigured: true, healthRoute: false, version: null } });
  assert.equal(JSON.stringify(status).includes("cannaai.local"), false);
});

test("capability probes fail closed", async () => {
  const client = {
    getStatus: async () => { throw new CannaAIError("CANNAAI_UNAVAILABLE", "down"); },
    listPlants: async () => ({ success: true, data: { plants: [] } }),
    getEnvironment: async () => { throw new CannaAIError("CANNAAI_UNAVAILABLE", "down"); },
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  const caps = await store.getCapabilities();
  assert.equal(caps.plants, true);
  assert.equal(caps.environment, false);
  assert.equal(caps.automationWrite, false);
});
