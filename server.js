import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  listPlants,
  getPlant,
  getEnvironment,
  getDashboardData,
  getBackendStatus,
  getCapabilities,
} from "./src/store.js";
import { emptyCapabilities } from "./src/client/capabilities.js";
import { getSnapshot } from "./src/adapters/camera.js";
import { analyzePlantImage } from "./src/lib/vision.js";
import { registerStage2Tools } from "./src/tools/stage2.js";

const PLUGIN_VERSION = "0.3.0";
const WIDGET_URI = "ui://cannaai/plant-dashboard-v1.html";
const widgetHtml = readFileSync(new URL("./public/plant-widget.html", import.meta.url), "utf8");

const plantSchema = z.object({
  id: z.string(),
  name: z.string(),
  strain: z.string(),
  stage: z.string(),
  day: z.number().nullable().optional(),
  roomId: z.string().nullable().optional(),
  location: z.string(),
  medium: z.string().nullable().optional(),
  plantedAt: z.string().nullable().optional(),
  expectedHarvestAt: z.string().nullable().optional(),
  cameraId: z.string().nullable().optional(),
  healthStatus: z.string().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  notes: z.string().optional(),
});

const environmentSchema = z.object({
  temperatureF: z.number().nullable().optional(),
  humidityPct: z.number().nullable().optional(),
  vpdKpa: z.number().nullable().optional(),
  co2Ppm: z.number().nullable().optional(),
  soilMoisturePct: z.number().nullable().optional(),
  ec: z.number().nullable().optional(),
  ph: z.number().nullable().optional(),
  ppfd: z.number().nullable().optional(),
  dewPointF: z.number().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
}).nullable();

const snapshotSchema = z.object({
  kind: z.string(),
  plantId: z.string(),
  cameraId: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  mimeType: z.string().optional(),
  capturedAt: z.string(),
  message: z.string().optional(),
});

const capabilitySchema = z.object({
  plants: z.boolean(),
  rooms: z.boolean(),
  environment: z.boolean(),
  environmentHistory: z.boolean(),
  cameras: z.boolean(),
  imageAnalysis: z.boolean(),
  trichomeAnalysis: z.boolean(),
  analysisHistory: z.boolean(),
  alerts: z.boolean(),
  canopy: z.boolean(),
  analytics: z.boolean(),
  advisors: z.boolean(),
  aiInsights: z.boolean(),
  inventory: z.boolean(),
  harvests: z.boolean(),
  automationRead: z.boolean(),
  automationWrite: z.boolean(),
});

const backendReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

function textResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function safeMode() {
  const mode = String(process.env.CANNAAI_MODE ?? "mock").trim().toLowerCase();
  return mode === "api" ? "api" : "mock";
}

export function createCannaAiServer() {
  const server = new McpServer(
    { name: "cannaai-plant-monitor", version: PLUGIN_VERSION },
    {
      instructions:
        "Use CannaAI tools for the user's own plant records, environment readings, and camera snapshots. Check CannaAI capabilities before assuming optional features exist. Distinguish visible observations from diagnoses. Prefer read-only inspection tools before recommendations.",
    }
  );

  registerAppResource(
    server,
    "cannaai-plant-dashboard",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: ["https://*"],
              },
            },
            "openai/widgetDescription":
              "CannaAI plant dashboard showing a selected plant, environmental metrics, camera snapshot, and optional image analysis.",
          },
        },
      ],
    })
  );

  server.registerTool(
    "get_cannaai_status",
    {
      title: "Check CannaAI status",
      description:
        "Use this when you need to know whether the configured CannaAI backend is reachable and whether the app is using mock or real API data.",
      inputSchema: {},
      outputSchema: {
        mode: z.enum(["mock", "api"]),
        reachable: z.boolean(),
        backend: z.object({
          baseUrlConfigured: z.boolean(),
          healthRoute: z.boolean().nullable(),
          version: z.string().nullable(),
        }),
        pluginVersion: z.string(),
        errorCode: z.string().optional(),
      },
      annotations: backendReadAnnotations,
    },
    async () => {
      try {
        const status = await getBackendStatus();
        return textResult(
          status.mode === "mock"
            ? "CannaAI is running in mock data mode."
            : status.reachable
              ? "The configured CannaAI backend is reachable."
              : "The configured CannaAI backend is not reachable.",
          { ...status, pluginVersion: PLUGIN_VERSION }
        );
      } catch {
        return textResult("CannaAI backend configuration is invalid.", {
          mode: safeMode(),
          reachable: false,
          backend: {
            baseUrlConfigured: Boolean(String(process.env.CANNAAI_BASE_URL ?? "").trim()),
            healthRoute: null,
            version: null,
          },
          pluginVersion: PLUGIN_VERSION,
          errorCode: "CANNAAI_VALIDATION_ERROR",
        });
      }
    }
  );

  server.registerTool(
    "get_cannaai_capabilities",
    {
      title: "Get CannaAI capabilities",
      description:
        "Use this when you need to know which optional CannaAI features are actually available before choosing specialized grow, analysis, camera, history, or automation tools.",
      inputSchema: {},
      outputSchema: { capabilities: capabilitySchema },
      annotations: backendReadAnnotations,
    },
    async () => {
      try {
        const capabilities = await getCapabilities();
        const enabled = Object.entries(capabilities).filter(([, value]) => value).map(([key]) => key);
        return textResult(
          enabled.length ? `Available CannaAI capabilities: ${enabled.join(", ")}.` : "No CannaAI backend capabilities are currently available.",
          { capabilities }
        );
      } catch {
        return textResult("CannaAI capabilities could not be determined.", { capabilities: emptyCapabilities() });
      }
    }
  );

  server.registerTool(
    "list_plants",
    {
      title: "List plants",
      description:
        "Use this when the user wants to see, find, compare, or choose plants in their CannaAI grow.",
      inputSchema: {},
      outputSchema: { plants: z.array(plantSchema) },
      annotations: backendReadAnnotations,
    },
    async () => {
      const plants = await listPlants();
      return textResult(`Found ${plants.length} plants.`, { plants });
    }
  );

  server.registerTool(
    "get_plant",
    {
      title: "Get plant",
      description:
        "Use this when the user wants details about one specific plant and you already know its stable plant ID.",
      inputSchema: { plantId: z.string().min(1) },
      outputSchema: { plant: plantSchema.nullable() },
      annotations: backendReadAnnotations,
    },
    async ({ plantId }) => {
      const plant = await getPlant(plantId);
      return textResult(
        plant ? `Loaded ${plant.name}.` : `Plant ${plantId} was not found.`,
        { plant }
      );
    }
  );

  server.registerTool(
    "get_environment",
    {
      title: "Get plant environment",
      description:
        "Use this when the user asks about current temperature, humidity, VPD, CO2, soil moisture, EC, pH, PPFD, or other environment readings for one plant. If the connected backend only exposes grow-wide readings and cannot associate them with the plant, this returns no plant-specific environment rather than guessing.",
      inputSchema: { plantId: z.string().min(1) },
      outputSchema: { plantId: z.string(), environment: environmentSchema },
      annotations: backendReadAnnotations,
    },
    async ({ plantId }) => {
      const environment = await getEnvironment(plantId);
      return textResult(
        environment ? `Loaded current environment for ${plantId}.` : `No plant-specific environment data found for ${plantId}.`,
        { plantId, environment }
      );
    }
  );

  server.registerTool(
    "get_latest_snapshot",
    {
      title: "Get latest plant snapshot",
      description:
        "Use this when the user wants to see the latest camera image for a specific plant. This reads the plant's configured camera and returns the newest snapshot reference.",
      inputSchema: { plantId: z.string().min(1) },
      outputSchema: { plant: plantSchema, snapshot: snapshotSchema },
      annotations: { ...backendReadAnnotations, openWorldHint: true },
    },
    async ({ plantId }) => {
      const plant = await getPlant(plantId);
      if (!plant) throw new Error(`Plant ${plantId} was not found.`);
      const snapshot = await getSnapshot({ plantId, cameraId: plant.cameraId });
      return textResult(
        snapshot.url ? `Loaded the latest snapshot for ${plant.name}.` : snapshot.message,
        { plant, snapshot }
      );
    }
  );

  server.registerTool(
    "analyze_plant_snapshot",
    {
      title: "Analyze plant snapshot",
      description:
        "Use this when the user wants visual assessment of a specific plant from its latest CannaAI camera snapshot. It retrieves the image, combines it with current environment data, and performs server-side vision analysis.",
      inputSchema: {
        plantId: z.string().min(1),
        question: z.string().min(1).max(1200).optional(),
      },
      outputSchema: {
        plant: plantSchema,
        environment: environmentSchema,
        snapshot: snapshotSchema,
        analysis: z.object({ model: z.string(), text: z.string() }),
      },
      annotations: { ...backendReadAnnotations, openWorldHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "Checking the plant image…",
        "openai/toolInvocation/invoked": "Plant image checked.",
      },
    },
    async ({ plantId, question }) => {
      const data = await getDashboardData(plantId);
      if (!data) throw new Error(`Plant ${plantId} was not found.`);
      const snapshot = await getSnapshot({ plantId, cameraId: data.plant.cameraId });
      if (!snapshot.url) throw new Error(snapshot.message || "No snapshot URL is available.");
      const analysis = await analyzePlantImage({
        imageUrl: snapshot.url,
        plant: data.plant,
        environment: data.environment,
        question,
      });
      return textResult(analysis.text, {
        ...data,
        snapshot,
        analysis,
      });
    }
  );

  registerAppTool(
    server,
    "render_plant_dashboard",
    {
      title: "Show plant dashboard",
      description:
        "Use this after identifying a plant ID when a visual CannaAI dashboard would help the user inspect that plant. It renders plant details and environment data; the widget can then fetch snapshots or request analysis.",
      inputSchema: { plantId: z.string().min(1) },
      outputSchema: {
        plant: plantSchema,
        environment: environmentSchema,
      },
      annotations: backendReadAnnotations,
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Opening plant dashboard…",
        "openai/toolInvocation/invoked": "Plant dashboard ready.",
      },
    },
    async ({ plantId }) => {
      const data = await getDashboardData(plantId);
      if (!data) throw new Error(`Plant ${plantId} was not found.`);
      return textResult(`Showing ${data.plant.name}.`, data);
    }
  );

  registerStage2Tools(server);

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      name: "CannaAI ChatGPT Plant App",
      version: PLUGIN_VERSION,
      mcp: MCP_PATH,
      cannaaiMode: safeMode(),
      backendConfigured: Boolean(String(process.env.CANNAAI_BASE_URL ?? "").trim()),
      cameraMode: process.env.CAMERA_MODE ?? "mock",
      visionEnabled: Boolean(process.env.OPENAI_API_KEY),
    }));
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createCannaAiServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`CannaAI MCP server: http://localhost:${port}${MCP_PATH}`);
});
