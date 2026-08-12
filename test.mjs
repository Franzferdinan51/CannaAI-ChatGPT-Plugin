import test from "node:test";
import assert from "node:assert/strict";
import { listPlants, getDashboardData } from "./src/store.js";
import { getSnapshot } from "./src/adapters/camera.js";

test("fixture plant data loads", async () => {
  const plants = await listPlants();
  assert.ok(plants.length >= 1);
  const data = await getDashboardData(plants[0].id);
  assert.equal(data.plant.id, plants[0].id);
  assert.ok(data.environment);
});

test("camera defaults to mock mode", async () => {
  const old = process.env.CAMERA_MODE;
  process.env.CAMERA_MODE = "mock";
  const snapshot = await getSnapshot({ plantId: "x", cameraId: "cam" });
  assert.equal(snapshot.kind, "placeholder");
  if (old === undefined) delete process.env.CAMERA_MODE; else process.env.CAMERA_MODE = old;
});
