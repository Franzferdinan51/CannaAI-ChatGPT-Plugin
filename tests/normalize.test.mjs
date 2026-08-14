import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlant, normalizePlantsResponse, normalizeEnvironmentResponse } from "../src/client/normalize.js";
import { detectCapabilities } from "../src/client/capabilities.js";

const rawPlant = {
  id: "plant-1",
  name: "Purple Sunshine #1",
  strainId: "strain-1",
  stage: "flowering",
  age: 54,
  plantedDate: "2026-06-20T00:00:00.000Z",
  locationId: "room-1",
  notes: "keeper",
  isActive: true,
  strain: { name: "Purple Sunshine", type: "hybrid" },
};

test("normalizes a real CannaAI plant record", () => {
  const plant = normalizePlant(rawPlant);
  assert.equal(plant.id, "plant-1");
  assert.equal(plant.name, "Purple Sunshine #1");
  assert.equal(plant.strain, "Purple Sunshine");
  assert.equal(plant.stage, "flowering");
  assert.equal(plant.day, 54);
  assert.equal(plant.roomId, "room-1");
  assert.equal(plant.location, "room-1");
  assert.equal(plant.plantedAt, "2026-06-20T00:00:00.000Z");
  assert.equal(plant.notes, "keeper");
});

test("normalizes paginated plant envelope", () => {
  const result = normalizePlantsResponse({ success: true, data: { plants: [rawPlant], pagination: { page: 1, total: 1 } } });
  assert.equal(result.plants.length, 1);
  assert.equal(result.pagination.total, 1);
});

test("normalizes named sensor readings without guessing ranges", () => {
  const payload = {
    success: true,
    data: {
      readings: [
        { sensorId: "tent-temp", value: 25, data: { type: "temperature", unit: "C" }, timestamp: "2026-08-13T20:00:00Z" },
        { sensorId: "tent-rh", value: 55, data: { sensorType: "humidity", unit: "%" }, timestamp: "2026-08-13T20:00:01Z" },
        { sensorId: "sensor-x", value: 1.3, data: { name: "VPD", unit: "kPa" }, timestamp: "2026-08-13T20:00:02Z" },
        { sensorId: "co2-main", value: 900, data: {}, timestamp: "2026-08-13T20:00:03Z" },
        { sensorId: "unknown", value: 6.3, data: {}, timestamp: "2026-08-13T20:00:04Z" },
      ],
      environment: { location: "grow-tent", timestamp: "2026-08-13T20:00:05Z" },
    },
  };
  const env = normalizeEnvironmentResponse(payload);
  assert.equal(env.temperatureF, 77);
  assert.equal(env.humidityPct, 55);
  assert.equal(env.vpdKpa, 1.3);
  assert.equal(env.co2Ppm, 900);
  assert.equal(env.ph, null);
  assert.equal(env.updatedAt, "2026-08-13T20:00:04.000Z");
});

test("does not pretend generic readings are plant-specific", () => {
  const payload = { success: true, data: { readings: [{ sensorId: "tent-temp", value: 78, data: { type: "temperature", unit: "F" } }] } };
  assert.equal(normalizeEnvironmentResponse(payload, { plantId: "plant-1" }), null);
});

test("uses explicitly plant-associated readings", () => {
  const payload = { success: true, data: { readings: [{ sensorId: "plant-temp", plantId: "plant-1", value: 78, data: { type: "temperature", unit: "F" } }] } };
  assert.equal(normalizeEnvironmentResponse(payload, { plantId: "plant-1" }).temperatureF, 78);
});

test("capabilities are complete and deterministic", () => {
  const caps = detectCapabilities({ probes: { plants: true, environment: true }, env: { OPENAI_API_KEY: "x" } });
  assert.equal(caps.plants, true);
  assert.equal(caps.environment, true);
  assert.equal(caps.imageAnalysis, true);
  assert.equal(caps.trichomeAnalysis, false);
  assert.equal(caps.automationWrite, false);
  assert.equal(Object.keys(caps).length, 17);
});
