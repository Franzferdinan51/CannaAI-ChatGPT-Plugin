function fillTemplate(template, values) {
  return template.replace(/\{(plantId|cameraId)\}/g, (_, key) =>
    encodeURIComponent(values[key] ?? "")
  );
}

export async function getSnapshot({ plantId, cameraId }) {
  const mode = (process.env.CAMERA_MODE ?? "mock").toLowerCase();

  if (mode === "mock") {
    return {
      kind: "placeholder",
      plantId,
      cameraId,
      url: null,
      capturedAt: new Date().toISOString(),
      message:
        "Camera adapter is in mock mode. Set CAMERA_MODE=http and CAMERA_SNAPSHOT_URL_TEMPLATE to connect CannaAI or an IP-camera snapshot endpoint.",
    };
  }

  if (mode !== "http") {
    throw new Error(`Unsupported CAMERA_MODE: ${mode}`);
  }

  const template = process.env.CAMERA_SNAPSHOT_URL_TEMPLATE?.trim();
  if (!template) {
    throw new Error(
      "CAMERA_SNAPSHOT_URL_TEMPLATE is required when CAMERA_MODE=http"
    );
  }

  const url = fillTemplate(template, { plantId, cameraId });
  const headers = {};
  if (process.env.CAMERA_BEARER_TOKEN) {
    headers.authorization = `Bearer ${process.env.CAMERA_BEARER_TOKEN}`;
  }

  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Snapshot endpoint returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Snapshot endpoint did not return an image (${contentType || "unknown content type"})`);
  }

  return {
    kind: "image",
    plantId,
    cameraId,
    url,
    mimeType: contentType.split(";")[0],
    capturedAt: new Date().toISOString(),
  };
}
