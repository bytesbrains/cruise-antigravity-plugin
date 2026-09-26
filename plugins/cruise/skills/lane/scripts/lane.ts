import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

export interface LaneCapabilities {
  tools: boolean;
  streaming: boolean;
  vision: boolean;
  json_schema: boolean;
}

export interface LanePricing {
  prompt_per_m: string;
  completion_per_m: string;
  cost_tier: string;
}

export interface LaneContextBounds {
  max_input_tokens: number;
  max_output_tokens: number;
}

export interface LaneInfo {
  id: string;
  name: string;
  description: string;
  capabilities: LaneCapabilities;
  members: string[];
  pricing: LanePricing;
  context_bounds: LaneContextBounds;
  recommendedWorkload: string;
  recommendedEffort: "high" | "medium" | "low" | "none";
}

export interface FetchLanesOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface SwitchModelOptions {
  model: string;
  settingsPath?: string;
}

export interface SwitchModelResult {
  success: boolean;
  settingsPath: string;
  previousModel?: string;
  newModel: string;
  updatedSettings: Record<string, unknown>;
}

export const DEFAULT_BASE_URL = "https://cruise.bytesbrains.net";

export const DEFAULT_LANES: LaneInfo[] = [
  {
    id: "bb/agentic-coding",
    name: "Agentic Coding",
    description: "Autonomous code generation, multi-step debugging, complex refactoring, test suites",
    capabilities: {
      tools: true,
      streaming: true,
      vision: true,
      json_schema: true,
    },
    members: ["anthropic/claude-3-7-sonnet", "openai/gpt-4o"],
    pricing: {
      prompt_per_m: "$3.00",
      completion_per_m: "$15.00",
      cost_tier: "Standard / Premium",
    },
    context_bounds: {
      max_input_tokens: 200000,
      max_output_tokens: 8192,
    },
    recommendedWorkload: "Autonomous coding, complex refactoring, multi-file edits, test suite implementation",
    recommendedEffort: "high",
  },
  {
    id: "bb/chat-assistant",
    name: "Chat Assistant",
    description: "Conversational pairing, code explanations, documentation reviews, interactive queries",
    capabilities: {
      tools: true,
      streaming: true,
      vision: true,
      json_schema: true,
    },
    members: ["anthropic/claude-3-5-haiku", "openai/gpt-4o-mini"],
    pricing: {
      prompt_per_m: "$0.80",
      completion_per_m: "$3.20",
      cost_tier: "Balanced",
    },
    context_bounds: {
      max_input_tokens: 128000,
      max_output_tokens: 4096,
    },
    recommendedWorkload: "Interactive chat, PR reviews, code explanations, conceptual design queries",
    recommendedEffort: "medium",
  },
  {
    id: "bb/extraction",
    name: "Extraction",
    description: "Structured data parsing, AST metadata extraction, strict JSON Schema compliance",
    capabilities: {
      tools: true,
      streaming: true,
      vision: false,
      json_schema: true,
    },
    members: ["mistral/codestral", "meta-llama/llama-3.3-70b-instruct"],
    pricing: {
      prompt_per_m: "$0.50",
      completion_per_m: "$1.50",
      cost_tier: "High-Fidelity / Extraction",
    },
    context_bounds: {
      max_input_tokens: 128000,
      max_output_tokens: 4096,
    },
    recommendedWorkload: "Structured data extraction, AST parsing, OpenAPI/JSON schema conformance checking",
    recommendedEffort: "low",
  },
  {
    id: "bb/fast",
    name: "Fast",
    description: "Ultra-low latency summaries, quick fixes, commit messages, lint corrections",
    capabilities: {
      tools: true,
      streaming: true,
      vision: false,
      json_schema: true,
    },
    members: [
      "cloudflare/@cf/meta/llama-3.1-8b-instruct",
      "google/gemini-2.0-flash-lite",
    ],
    pricing: {
      prompt_per_m: "$0.15",
      completion_per_m: "$0.60",
      cost_tier: "Ultra-Low Cost",
    },
    context_bounds: {
      max_input_tokens: 64000,
      max_output_tokens: 2048,
    },
    recommendedWorkload: "High-frequency lint fixes, commit message generation, formatting, quick lookups",
    recommendedEffort: "none",
  },
];

/**
 * Parses raw API response data (OpenAI /v1/models format or MCP list_models payload)
 * into a strongly typed array of LaneInfo objects.
 */
export function parseLanesFromApiResponse(payload: unknown): LaneInfo[] {
  if (!payload || typeof payload !== "object") {
    return DEFAULT_LANES;
  }

  const raw = payload as Record<string, unknown>;
  const list: unknown[] = Array.isArray(raw.data)
    ? raw.data
    : Array.isArray(raw.lanes)
    ? raw.lanes
    : Array.isArray(raw.models)
    ? raw.models
    : [];

  if (list.length === 0) {
    return DEFAULT_LANES;
  }

  const lanes: LaneInfo[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = String(entry.id || entry.name || "");
    if (!id) continue;

    // Check if item corresponds to a known lane or has x-cruise metadata
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
    const max_input_tokens = Number(boundsRaw.max_input_tokens || defaultMatch?.context_bounds.max_input_tokens || 128000);
    const max_output_tokens = Number(boundsRaw.max_output_tokens || defaultMatch?.context_bounds.max_output_tokens || 4096);

    const name = defaultMatch?.name || id.replace(/^bb\//, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const description = defaultMatch?.description || String(entry.description || "Cruise dynamic routing lane");
    const recommendedWorkload = defaultMatch?.recommendedWorkload || "General development and query tasks";
    const recommendedEffort = defaultMatch?.recommendedEffort || "medium";

    lanes.push({
      id,
      name,
      description,
      capabilities: {
        tools,
        streaming,
        vision,
        json_schema,
      },
      members,
      pricing: {
        prompt_per_m,
        completion_per_m,
        cost_tier,
      },
      context_bounds: {
        max_input_tokens,
        max_output_tokens,
      },
      recommendedWorkload,
      recommendedEffort,
    });
  }

  return lanes.length > 0 ? lanes : DEFAULT_LANES;
}

/**
 * Fetches available model lanes dynamically from the Cruise gateway or MCP endpoint.
 * Falls back to default canonical lanes if offline or unauthenticated.
 */
export async function fetchLanes(options: FetchLanesOptions = {}): Promise<{
  lanes: LaneInfo[];
  isLive: boolean;
  endpoint: string;
}> {
  const fetcher = options.fetchFn || globalThis.fetch;
  const baseUrl = (options.baseUrl || process.env.CRUISE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
  const apiKey = options.apiKey || process.env.CRUISE_API_KEY;
  const endpoint = `${baseUrl}/v1/models`;

  if (!fetcher) {
    return { lanes: DEFAULT_LANES, isLive: false, endpoint };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

    const res = await fetcher(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const lanes = parseLanesFromApiResponse(data);
      return { lanes, isLive: true, endpoint };
    }
  } catch {
    // Non-fatal fallback to default lanes
  }

  return { lanes: DEFAULT_LANES, isLive: false, endpoint };
}

/**
 * Formats the capability matrix into a structured Markdown comparison table.
 */
export function formatCapabilityMatrixTable(lanes: LaneInfo[]): string {
  const lines: string[] = [
    "| Lane Alias | Tools | Streaming | Vision | JSON Schema | Context (In / Out) | Pricing (Prompt / Comp) | Cost Tier |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |",
  ];

  for (const lane of lanes) {
    const caps = lane.capabilities;
    const t = caps.tools ? "✓" : "✗";
    const s = caps.streaming ? "✓" : "✗";
    const v = caps.vision ? "✓" : "✗";
    const j = caps.json_schema ? "✓" : "✗";
    const inTokens = lane.context_bounds.max_input_tokens >= 1000
      ? `${Math.round(lane.context_bounds.max_input_tokens / 1000)}k`
      : `${lane.context_bounds.max_input_tokens}`;
    const outTokens = lane.context_bounds.max_output_tokens >= 1000
      ? `${Math.round(lane.context_bounds.max_output_tokens / 1000)}k`
      : `${lane.context_bounds.max_output_tokens}`;
    const context = `${inTokens} / ${outTokens}`;
    const pricing = `${lane.pricing.prompt_per_m} / ${lane.pricing.completion_per_m}`;
    const tier = lane.pricing.cost_tier;

    lines.push(`| \`${lane.id}\` | ${t} | ${s} | ${v} | ${j} | ${context} | ${pricing} | ${tier} |`);
  }

  return lines.join("\n");
}

/**
 * Formats the underlying member model breakdown table.
 */
export function formatMemberBreakdownTable(lanes: LaneInfo[]): string {
  const lines: string[] = [
    "| Lane Alias | Underlying Member Models | Primary Routing Purpose |",
    "| :--- | :--- | :--- |",
  ];

  for (const lane of lanes) {
    const membersFormatted = lane.members.map((m) => `\`${m}\``).join(", ");
    lines.push(`| \`${lane.id}\` | ${membersFormatted} | ${lane.description} |`);
  }

  return lines.join("\n");
}

/**
 * Formats workload recommendations and reasoning effort settings.
 */
export function formatWorkloadRecommendations(lanes: LaneInfo[] = DEFAULT_LANES): string {
  const lines: string[] = [
    "| Target Workload | Recommended Lane | Suggested Effort | Rationale & Ideal Use Cases |",
    "| :--- | :--- | :--- | :--- |",
  ];

  const mappings: { workload: string; laneId: string; effort: string; rationale: string }[] = [
    {
      workload: "**Autonomous Coding**",
      laneId: "bb/agentic-coding",
      effort: "`/effort high`",
      rationale: "Multi-step tool calling, architectural refactoring, full test suite generation",
    },
    {
      workload: "**Chat & Pairing**",
      laneId: "bb/chat-assistant",
      effort: "`/effort medium`",
      rationale: "Interactive pair programming, code explanations, concept reviews, PR feedback",
    },
    {
      workload: "**Extraction & Schema**",
      laneId: "bb/extraction",
      effort: "`/effort low`",
      rationale: "Strict JSON schema outputs, AST metadata parsing, structured data extraction",
    },
    {
      workload: "**Linting & Quick Edits**",
      laneId: "bb/fast",
      effort: "`/effort none`",
      rationale: "High-frequency lint fixes, commit message drafting, quick lookups, minimal latency",
    },
  ];

  for (const m of mappings) {
    const lane = lanes.find((l) => l.id === m.laneId);
    const laneDisplay = lane ? `\`${lane.id}\`` : `\`${m.laneId}\``;
    lines.push(`| ${m.workload} | ${laneDisplay} | ${m.effort} | ${m.rationale} |`);
  }

  return lines.join("\n");
}

/**
 * Generates interactive CLI switching commands for the user.
 */
export function formatCliSwitchGuidance(selectedLane: string = "bb/agentic-coding", effort: string = "high"): string {
  return [
    "### Interactive Session Switching Commands",
    "",
    "To switch the active model in your current `agy` CLI session, enter:",
    "```sh",
    `/model ${selectedLane}`,
    "```",
    "",
    "To tune the reasoning effort level:",
    "```sh",
    `/effort ${effort}`,
    "```",
    "*(Options: `high`, `medium`, `low`, `none`)*",
    "",
    "To persist this default across all future sessions, update your settings file (`~/.gemini/antigravity-cli/settings.json`):",
    "```json",
    "{",
    '  "modelProvider": "openai",',
    '  "openaiBaseUrl": "https://cruise.bytesbrains.net/v1",',
    '  "openaiApiKey": "${CRUISE_API_KEY}",',
    `  "model": "${selectedLane}"`,
    "}",
    "```",
  ].join("\n");
}

/**
 * Formats a terminal-friendly (ASCII / ANSI) table for direct CLI invocation.
 */
export function formatCliTable(lanes: LaneInfo[]): string {
  const header = [
    "=========================================================================================================",
    "                               BytesBrains Cruise — Dynamic Model Lanes                                  ",
    "=========================================================================================================",
  ].join("\n");

  const tableRows: string[] = [];
  tableRows.push(
    "LANE ID             | TOOLS | STREAM | VISION | SCHEMA | CONTEXT     | PRICING (M)      | COST TIER"
  );
  tableRows.push(
    "--------------------+-------+--------+--------+--------+-------------+------------------+----------------"
  );

  for (const lane of lanes) {
    const id = lane.id.padEnd(19);
    const t = (lane.capabilities.tools ? "[✓]" : "[ ]").padEnd(5);
    const s = (lane.capabilities.streaming ? "[✓]" : "[ ]").padEnd(6);
    const v = (lane.capabilities.vision ? "[✓]" : "[ ]").padEnd(6);
    const j = (lane.capabilities.json_schema ? "[✓]" : "[ ]").padEnd(6);
    const inK = Math.round(lane.context_bounds.max_input_tokens / 1000);
    const outK = Math.round(lane.context_bounds.max_output_tokens / 1000);
    const ctx = `${inK}k / ${outK}k`.padEnd(11);
    const pricing = `${lane.pricing.prompt_per_m} / ${lane.pricing.completion_per_m}`.padEnd(16);
    const tier = lane.pricing.cost_tier;

    tableRows.push(`${id} | ${t} | ${s} | ${v} | ${j} | ${ctx} | ${pricing} | ${tier}`);
  }

  return [header, tableRows.join("\n"), "========================================================================================================="].join("\n");
}

/**
 * Resolves the default settings.json path for Antigravity CLI.
 */
export function getDefaultSettingsPath(): string {
  const home = os.homedir();
  return path.join(home, ".gemini", "antigravity-cli", "settings.json");
}

/**
 * Updates the active model in ~/.gemini/antigravity-cli/settings.json.
 */
export function switchActiveModel(options: SwitchModelOptions): SwitchModelResult {
  const targetPath = options.settingsPath || getDefaultSettingsPath();
  const dir = path.dirname(targetPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
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
    } catch {
      settings = {};
    }
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
export async function runLaneDiscovery(argv: string[] = process.argv.slice(2)): Promise<void> {
  const isJson = argv.includes("--json");
  const isMarkdown = argv.includes("--markdown");
  const selectArg = argv.find((a) => a.startsWith("--select="));
  const selectedLane = selectArg ? selectArg.split("=")[1] : undefined;

  const { lanes, isLive, endpoint } = await fetchLanes();

  if (selectedLane) {
    const laneExists = lanes.some((l) => l.id === selectedLane) || DEFAULT_LANES.some((l) => l.id === selectedLane);
    if (!laneExists) {
      console.error(`Error: Unknown lane "${selectedLane}". Available: ${lanes.map((l) => l.id).join(", ")}`);
      process.exit(1);
    }
    const switchResult = switchActiveModel({ model: selectedLane });
    console.log(`Switched active model to "${selectedLane}".`);
    console.log(`Settings updated at: ${switchResult.settingsPath}`);
    return;
  }

  if (isJson) {
    console.log(JSON.stringify({ isLive, endpoint, lanes }, null, 2));
    return;
  }

  if (isMarkdown) {
    console.log("## Cruise Dynamic Model Routing Lanes\n");
    console.log(`Source: ${isLive ? `Live endpoint (${endpoint})` : "Default catalogue"}\n`);
    console.log("### 1. Capability Matrix\n");
    console.log(formatCapabilityMatrixTable(lanes));
    console.log("\n### 2. Underlying Member Models\n");
    console.log(formatMemberBreakdownTable(lanes));
    console.log("\n### 3. Workload Recommendations & Effort\n");
    console.log(formatWorkloadRecommendations(lanes));
    console.log("\n" + formatCliSwitchGuidance());
    return;
  }

  // Default terminal output
  console.log(formatCliTable(lanes));
  console.log(`Status: ${isLive ? `Live connected (${endpoint})` : "Using standard lane catalogue"}\n`);
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
