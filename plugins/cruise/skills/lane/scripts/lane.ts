import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BASE_URL,
  DEFAULT_LANES,
  FetchLanesOptions,
  LaneInfo,
  SwitchModelOptions,
  SwitchModelResult,
} from "./types";
import {
  formatCapabilityMatrixTable,
  formatCliSwitchGuidance,
  formatCliTable,
  formatMemberBreakdownTable,
  formatWorkloadRecommendations,
} from "./formatters";

// Re-export types and formatters for unified consumer access
export * from "./types";
export * from "./formatters";

/**
 * Normalizes and validates the Cruise Base URL, preventing SSRF attacks.
 * Enforces http/https protocol and blocks credentials in URLs.
 */
export function normalizeBaseUrl(rawUrl?: string): string {
  if (!rawUrl || rawUrl.trim().length === 0) {
    return DEFAULT_BASE_URL;
  }

  let cleaned = rawUrl.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/v1")) {
    cleaned = cleaned.slice(0, -3).replace(/\/+$/, "");
  }

  if (cleaned.includes("://")) {
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      return DEFAULT_BASE_URL;
    }
  } else {
    if (cleaned.startsWith("localhost") || cleaned.startsWith("127.0.0.1")) {
      cleaned = `http://${cleaned}`;
    } else {
      cleaned = `https://${cleaned}`;
    }
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_BASE_URL;
    }
    if (parsed.username || parsed.password) {
      return DEFAULT_BASE_URL;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/**
 * Safely parses numeric token context bounds, handling numbers or strings like "200k"
 * without producing NaN.
 */
function parseContextBound(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const kMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*k$/i);
    if (kMatch) {
      const val = parseFloat(kMatch[1]) * 1000;
      if (Number.isFinite(val) && val > 0) return Math.round(val);
    }
    const val = Number(trimmed);
    if (Number.isFinite(val) && val > 0) return Math.round(val);
  }
  return fallback;
}

/**
 * Parses raw API response data (OpenAI /v1/models or MCP list_models payload)
 * into a strongly typed array of LaneInfo objects.
 */
export function parseLanesFromApiResponse(payload: unknown): LaneInfo[] {
  if (!payload || typeof payload !== "object") {
    return DEFAULT_LANES;
  }

  const raw = payload as Record<string, unknown>;

  // Handle MCP tool response payload wrapper (JSON-RPC 2.0 result)
  let candidateList: unknown[] = [];
  if (raw.result && typeof raw.result === "object") {
    const resObj = raw.result as Record<string, unknown>;
    if (Array.isArray(resObj.content)) {
      for (const item of resObj.content) {
        if (item && typeof item === "object" && "text" in item) {
          try {
            const parsed = JSON.parse(String((item as { text: unknown }).text));
            const subLanes = parseLanesFromApiResponse(parsed);
            // Only return early if this content block actually contained parsed entries
            if (subLanes !== DEFAULT_LANES && subLanes.length > 0) {
              return subLanes;
            }
          } catch {
            // continue looking through subsequent content items
          }
        }
      }
    }
    candidateList = Array.isArray(resObj.lanes)
      ? resObj.lanes
      : Array.isArray(resObj.data)
      ? resObj.data
      : Array.isArray(resObj.models)
      ? resObj.models
      : [];
  } else {
    candidateList = Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw.lanes)
      ? raw.lanes
      : Array.isArray(raw.models)
      ? raw.models
      : [];
  }

  if (candidateList.length === 0) {
    return DEFAULT_LANES;
  }

  const lanes: LaneInfo[] = [];

  for (const item of candidateList) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = String(entry.id || entry.name || "");
    if (!id) continue;

    const xCruise = (entry["x-cruise"] || entry.x_cruise || {}) as Record<string, unknown>;
    const defaultMatch = DEFAULT_LANES.find((l) => l.id === id);

    const anyMember = (xCruise.any_member || xCruise.capabilities || {}) as Record<string, unknown>;
    const tools = typeof anyMember.tools === "boolean" ? anyMember.tools : defaultMatch?.capabilities.tools ?? true;
    const streaming = typeof anyMember.streaming === "boolean" ? anyMember.streaming : defaultMatch?.capabilities.streaming ?? true;
    const vision = typeof anyMember.vision === "boolean" ? anyMember.vision : defaultMatch?.capabilities.vision ?? false;
    const json_schema = typeof anyMember.json_schema === "boolean" ? anyMember.json_schema : defaultMatch?.capabilities.json_schema ?? true;

    const members: string[] = Array.isArray(xCruise.members)
      ? (xCruise.members as string[])
      : defaultMatch?.members ?? [id];

    const pricingRaw = (xCruise.pricing || {}) as Record<string, unknown>;
    const prompt_per_m = String(pricingRaw.prompt_per_m || defaultMatch?.pricing.prompt_per_m || "$1.00");
    const completion_per_m = String(pricingRaw.completion_per_m || defaultMatch?.pricing.completion_per_m || "$3.00");
    const cost_tier = String(pricingRaw.cost_tier || defaultMatch?.pricing.cost_tier || "Standard");

    const boundsRaw = (xCruise.context_bounds || {}) as Record<string, unknown>;
    const max_input_tokens = parseContextBound(
      boundsRaw.max_input_tokens,
      defaultMatch?.context_bounds.max_input_tokens || 128000
    );
    const max_output_tokens = parseContextBound(
      boundsRaw.max_output_tokens,
      defaultMatch?.context_bounds.max_output_tokens || 4096
    );

    const name = defaultMatch?.name || id.replace(/^bb\//, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const description = defaultMatch?.description || String(entry.description || "Cruise dynamic routing lane");
    const recommendedWorkload = defaultMatch?.recommendedWorkload || "General development and query tasks";
    const recommendedEffort = defaultMatch?.recommendedEffort || "medium";

    lanes.push({
      id,
      name,
      description,
      capabilities: { tools, streaming, vision, json_schema },
      members,
      pricing: { prompt_per_m, completion_per_m, cost_tier },
      context_bounds: { max_input_tokens, max_output_tokens },
      recommendedWorkload,
      recommendedEffort,
    });
  }

  return lanes.length > 0 ? lanes : DEFAULT_LANES;
}

/**
 * Fetches available model lanes dynamically from the Cruise MCP endpoint or REST gateway.
 * Falls back to default canonical lanes if offline or unauthenticated.
 */
export async function fetchLanes(options: FetchLanesOptions = {}): Promise<{
  lanes: LaneInfo[];
  isLive: boolean;
  endpoint: string;
  source: "mcp" | "rest" | "default";
}> {
  const fetcher = options.fetchFn || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.CRUISE_BASE_URL);
  const apiKey = options.apiKey || process.env.CRUISE_API_KEY;

  if (!fetcher) {
    return { lanes: DEFAULT_LANES, isLive: false, endpoint: `${baseUrl}/v1/models`, source: "default" };
  }

  const authHeaders: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    authHeaders.Authorization = `Bearer ${apiKey}`;
  }

  // 1. Try MCP JSON-RPC tools/call (list_models) first if requested
  if (options.preferMcp) {
    const mcpEndpoint = `${baseUrl}/mcp`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

      const mcpRes = await fetcher(mcpEndpoint, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_models", arguments: { kind: "lanes" } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (mcpRes.ok) {
        const mcpData = await mcpRes.json();
        // Verify payload actually contains lane entries before declaring live MCP source
        const rawRes = (mcpData as Record<string, unknown>)?.result ?? mcpData;
        const resObj = rawRes as Record<string, unknown>;
        const hasLiveEntries = Boolean(
          (Array.isArray(resObj?.lanes) && resObj.lanes.length > 0) ||
          (Array.isArray(resObj?.data) && resObj.data.length > 0) ||
          (Array.isArray(resObj?.models) && resObj.models.length > 0) ||
          (Array.isArray(resObj?.content) && resObj.content.length > 0)
        );

        if (hasLiveEntries) {
          const lanes = parseLanesFromApiResponse(mcpData);
          if (lanes !== DEFAULT_LANES && lanes.length > 0) {
            return { lanes, isLive: true, endpoint: mcpEndpoint, source: "mcp" };
          }
        }
      }
    } catch {
      // Fall through to REST probe
    }
  }

  // 2. Try OpenAI-compatible /v1/models probe
  const restEndpoint = `${baseUrl}/v1/models`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

    const res = await fetcher(restEndpoint, {
      method: "GET",
      headers: authHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const lanes = parseLanesFromApiResponse(data);
      if (lanes !== DEFAULT_LANES && lanes.length > 0) {
        return { lanes, isLive: true, endpoint: restEndpoint, source: "rest" };
      }
    }
  } catch {
    // Non-fatal fallback to default lanes
  }

  return { lanes: DEFAULT_LANES, isLive: false, endpoint: restEndpoint, source: "default" };
}

/**
 * Resolves the default settings.json path for Antigravity CLI.
 */
export function getDefaultSettingsPath(homedirFn: () => string = os.homedir): string {
  const home = (typeof homedirFn === "function" ? homedirFn() : os.homedir()) || "";
  return path.join(home, ".gemini", "antigravity-cli", "settings.json");
}

/**
 * Validates if a model name is a valid lane alias or identifier.
 */
export function isValidLaneIdentifier(model: string): boolean {
  if (!model || typeof model !== "string" || model.trim().length === 0) {
    return false;
  }
  const trimmed = model.trim();
  return DEFAULT_LANES.some((l) => l.id === trimmed) || /^bb\/[a-z0-9_-]+$/.test(trimmed);
}

/**
 * Updates the active model in ~/.gemini/antigravity-cli/settings.json.
 * Validates model identifier and JSON structure first, refusing to overwrite corrupted files.
 * Bootstraps missing provider/base URL settings if updating fresh configurations.
 */
export function switchActiveModel(options: SwitchModelOptions): SwitchModelResult {
  const targetPath = options.settingsPath || getDefaultSettingsPath();
  const dir = path.dirname(targetPath);
  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.CRUISE_BASE_URL);

  if (!isValidLaneIdentifier(options.model)) {
    return {
      success: false,
      settingsPath: targetPath,
      newModel: options.model,
      updatedSettings: {},
      error: `Invalid or unrecognized model lane "${options.model}". Must be a valid lane ID (e.g. bb/agentic-coding, bb/chat-assistant, bb/extraction, bb/fast).`,
    };
  }

  let settings: Record<string, unknown> = {};
  let previousModel: string | undefined;

  if (fs.existsSync(targetPath)) {
    try {
      const content = fs.readFileSync(targetPath, "utf-8");
      settings = JSON.parse(content);
      if (typeof settings.model === "string") {
        previousModel = settings.model;
      }
    } catch (err) {
      const errorMessage = `Settings file at ${targetPath} contains invalid JSON: ${err instanceof Error ? err.message : String(err)}. Refusing to overwrite corrupted settings.`;
      return {
        success: false,
        settingsPath: targetPath,
        newModel: options.model,
        updatedSettings: {},
        error: errorMessage,
      };
    }
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Bootstrap provider configuration if not already configured
  if (!settings.modelProvider) {
    settings.modelProvider = "openai";
  }
  if (!settings.openaiBaseUrl) {
    settings.openaiBaseUrl = `${baseUrl}/v1`;
  }
  if (!settings.openaiApiKey) {
    settings.openaiApiKey = "${CRUISE_API_KEY}";
  }

  settings.model = options.model;

  fs.writeFileSync(targetPath, JSON.stringify(settings, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });

  return {
    success: true,
    settingsPath: targetPath,
    previousModel,
    newModel: options.model,
    updatedSettings: settings,
  };
}

/**
 * Main execution runner for CLI usage.
 */
export async function runLaneDiscovery(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  settingsPath?: string
): Promise<void> {
  const isJson = argv.includes("--json");
  const isMarkdown = argv.includes("--markdown");
  const preferMcp = argv.includes("--mcp");
  const selectArg = argv.find((a) => a.startsWith("--select="));
  const selectedLane = selectArg ? selectArg.split("=")[1] : undefined;

  const { lanes, isLive, endpoint, source } = await fetchLanes({ preferMcp });

  if (selectedLane) {
    const laneExists = lanes.some((l) => l.id === selectedLane) || DEFAULT_LANES.some((l) => l.id === selectedLane);
    if (!laneExists) {
      console.error(`Error: Unknown lane "${selectedLane}". Available: ${lanes.map((l) => l.id).join(", ")}`);
      process.exit(1);
    }
    const switchResult = switchActiveModel({
      model: selectedLane,
      baseUrl: env.CRUISE_BASE_URL,
      settingsPath,
    });
    if (!switchResult.success) {
      console.error(`Error updating settings: ${switchResult.error}`);
      process.exit(1);
    }
    console.log(`Switched active model to "${selectedLane}".`);
    console.log(`Settings updated at: ${switchResult.settingsPath}`);
    return;
  }

  if (isJson) {
    console.log(JSON.stringify({ isLive, endpoint, source, lanes }, null, 2));
    return;
  }

  if (isMarkdown) {
    console.log("## Cruise Dynamic Model Routing Lanes\n");
    console.log(`Source: ${isLive ? `Live ${source.toUpperCase()} endpoint (${endpoint})` : "Default catalogue"}\n`);
    console.log("### 1. Capability Matrix\n");
    console.log(formatCapabilityMatrixTable(lanes));
    console.log("\n### 2. Underlying Member Models\n");
    console.log(formatMemberBreakdownTable(lanes));
    console.log("\n### 3. Workload Recommendations & Effort\n");
    console.log(formatWorkloadRecommendations(lanes));
    console.log("\n" + formatCliSwitchGuidance(lanes[0]?.id || "bb/agentic-coding"));
    return;
  }

  // Default terminal output
  console.log(formatCliTable(lanes));
  console.log(`Status: ${isLive ? `Live connected via ${source.toUpperCase()} (${endpoint})` : "Using standard lane catalogue"}\n`);
  console.log("Workload Mappings:");
  for (const lane of lanes) {
    console.log(`  • ${lane.id.padEnd(20)} -> ${lane.recommendedWorkload} (Suggested: /effort ${lane.recommendedEffort})`);
  }
  console.log("\nSwitch session model in agy CLI: /model <lane-id>");
  console.log("Adjust reasoning effort:        /effort <high|medium|low|none>");
  console.log("Persist permanently:           node plugins/cruise/skills/lane/scripts/lane.ts --select=<lane-id>\n");
}

// Entrypoint check for ES modules
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runLaneDiscovery().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
