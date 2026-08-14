import { CannaAIError, errorFromStatus, timeoutError, unavailableError } from "./errors.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateBaseUrl(baseUrl) {
  if (!baseUrl) throw new Error("CannaAIClient requires baseUrl.");
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("CannaAIClient baseUrl must use http or https.");
  }
  return baseUrl.replace(/\/+$/, "");
}

function buildApiUrl(baseUrl, path) {
  if (typeof path !== "string" || !path.startsWith("/api/")) {
    throw new Error("CannaAIClient only accepts relative /api/... paths.");
  }
  if (/^\/\/|^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error("CannaAIClient does not accept absolute URLs.");
  }
  return new URL(path, `${baseUrl}/`);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new CannaAIError("CANNAAI_INTERNAL_ERROR", "CannaAI returned invalid JSON.", {
        status: response.status,
        retryable: response.status >= 500,
      });
    }
  }
  return null;
}

export class CannaAIClient {
  constructor({ baseUrl, apiToken = null, timeoutMs = 15000, fetchImpl = globalThis.fetch, retryDelayMs = 50 } = {}) {
    this.baseUrl = validateBaseUrl(baseUrl);
    this.apiToken = apiToken || null;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.retryDelayMs = retryDelayMs;
    if (typeof this.fetchImpl !== "function") throw new Error("CannaAIClient requires fetch support.");
  }

  async request(path, { method = "GET", headers = {}, body = undefined } = {}) {
    const url = buildApiUrl(this.baseUrl, path);
    const upperMethod = String(method).toUpperCase();
    const maxAttempts = upperMethod === "GET" ? 2 : 1;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const requestHeaders = { accept: "application/json", ...headers };
        if (this.apiToken) requestHeaders.authorization = `Bearer ${this.apiToken}`;
        const response = await this.fetchImpl(url, {
          method: upperMethod,
          headers: requestHeaders,
          body,
          signal: controller.signal,
          redirect: "follow",
        });
        const payload = await parseResponse(response);
        if (!response.ok) throw errorFromStatus(response.status);
        return payload;
      } catch (error) {
        let normalized;
        if (error instanceof CannaAIError) {
          normalized = error;
        } else if (error?.name === "AbortError" || controller.signal.aborted) {
          normalized = timeoutError(error);
        } else {
          normalized = unavailableError(error);
        }
        lastError = normalized;
        if (attempt >= maxAttempts || !normalized.retryable) throw normalized;
        await sleep(this.retryDelayMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  async getStatus() {
    try {
      const payload = await this.request("/api/health");
      return { reachable: true, healthRoute: true, payload };
    } catch (error) {
      if (!(error instanceof CannaAIError) || error.code !== "CANNAAI_NOT_FOUND") throw error;
      await this.listPlants({ page: 1, limit: 1 });
      return { reachable: true, healthRoute: false, payload: null };
    }
  }

  listPlants({ page = 1, limit = 100 } = {}) {
    const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
    return this.request(`/api/plants?page=${safePage}&limit=${safeLimit}`);
  }

  getPlant(plantId) {
    return this.request(`/api/plants/${encodeURIComponent(plantId)}`);
  }

  getEnvironment() {
    return this.request("/api/environment");
  }
}
