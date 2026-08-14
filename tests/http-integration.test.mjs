import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { CannaAIClient } from "../src/client/cannaai-client.js";
import { createStore } from "../src/store.js";

async function withServer(handler, fn) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("client and store integrate with CannaAI-shaped HTTP routes", async () => {
  await withServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/health") {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false }));
      return;
    }
    if (req.url?.startsWith("/api/plants?")) {
      res.end(JSON.stringify({ success: true, data: {
        plants: [{ id: "p1", name: "Purple Sunshine #1", strain: { name: "Purple Sunshine" }, stage: "flowering", age: 50, locationId: "room-1" }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      } }));
      return;
    }
    if (req.url === "/api/plants/p1") {
      res.end(JSON.stringify({ success: true, data: { id: "p1", name: "Purple Sunshine #1", stage: "flowering", age: 50, locationId: "room-1" } }));
      return;
    }
    if (req.url === "/api/environment") {
      res.end(JSON.stringify({ success: true, data: { readings: [{ sensorId: "tent-temp", value: 78.5, data: { type: "temperature", unit: "F" } }] } }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false }));
  }, async (baseUrl) => {
    const client = new CannaAIClient({ baseUrl, timeoutMs: 2000, retryDelayMs: 0 });
    const status = await client.getStatus();
    assert.equal(status.healthRoute, false);

    const store = createStore({
      config: { mode: "api", baseUrl, apiToken: null, timeoutMs: 2000, writeToolsEnabled: false, automationEnabled: false },
      client,
      env: {},
    });
    const plants = await store.listPlants();
    assert.equal(plants[0].strain, "Purple Sunshine");
    const plant = await store.getPlant("p1");
    assert.equal(plant.strain, "Purple Sunshine");
    assert.equal(await store.getEnvironment("p1"), null);
    assert.equal((await store.getEnvironment()).temperatureF, 78.5);
  });
});
