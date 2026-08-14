import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";
import { CannaAIClient } from "../src/client/cannaai-client.js";
import { CannaAIError } from "../src/client/errors.js";

test("config defaults to mock mode", () => {
  const config = getConfig({});
  assert.equal(config.mode, "mock");
  assert.equal(config.timeoutMs, 15000);
});

test("api mode requires a base URL", () => {
  assert.throws(() => getConfig({ CANNAAI_MODE: "api" }), /CANNAAI_BASE_URL/);
});

test("client sends bearer auth", async () => {
  let seenAuthorization = null;
  const fetchImpl = async (_url, init) => {
    seenAuthorization = init.headers.authorization;
    return new Response(JSON.stringify({ success: true, data: { plants: [], pagination: {} } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new CannaAIClient({ baseUrl: "http://cannaai.local", apiToken: "super-secret", timeoutMs: 1000, fetchImpl });
  await client.listPlants();
  assert.equal(seenAuthorization, "Bearer super-secret");
});

test("client maps 404 to CANNAAI_NOT_FOUND", async () => {
  const client = new CannaAIClient({
    baseUrl: "http://cannaai.local",
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => new Response("missing", { status: 404 }),
  });
  await assert.rejects(() => client.getPlant("missing"), (error) => {
    assert.ok(error instanceof CannaAIError);
    assert.equal(error.code, "CANNAAI_NOT_FOUND");
    assert.equal(error.retryable, false);
    return true;
  });
});

test("client retries one transient GET failure", async () => {
  let calls = 0;
  const client = new CannaAIClient({
    baseUrl: "http://cannaai.local",
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network down");
      return new Response(JSON.stringify({ success: true, data: { plants: [], pagination: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await client.listPlants();
  assert.equal(calls, 2);
});

test("status falls back when health route is missing", async () => {
  const paths = [];
  const client = new CannaAIClient({
    baseUrl: "http://cannaai.local",
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async (url) => {
      paths.push(url.pathname + url.search);
      if (url.pathname === "/api/health") return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ success: true, data: { plants: [], pagination: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const status = await client.getStatus();
  assert.equal(status.reachable, true);
  assert.equal(status.healthRoute, false);
  assert.deepEqual(paths, ["/api/health", "/api/plants?page=1&limit=1"]);
});

test("client rejects arbitrary URLs", async () => {
  const client = new CannaAIClient({ baseUrl: "http://cannaai.local", fetchImpl: async () => { throw new Error("should not run"); } });
  await assert.rejects(() => client.request("https://example.com/api/plants"), /relative \/api/);
});
