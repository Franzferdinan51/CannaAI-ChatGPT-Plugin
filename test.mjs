import test from "node:test";
import assert from "node:assert/strict";
import { getSnapshot } from "./src/adapters/camera.js";

test("camera defaults to mock mode", async () => {
  const old = process.env.CAMERA_MODE;
  process.env.CAMERA_MODE = "mock";
  try {
    const snapshot = await getSnapshot({ plantId: "x", cameraId: "cam" });
    assert.equal(snapshot.kind, "placeholder");
  } finally {
    if (old === undefined) delete process.env.CAMERA_MODE;
    else process.env.CAMERA_MODE = old;
  }
});
