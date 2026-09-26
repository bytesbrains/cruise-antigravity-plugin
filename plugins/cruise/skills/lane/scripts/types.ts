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
  preferMcp?: boolean;
}

export interface SwitchModelOptions {
  model: string;
  settingsPath?: string;
  baseUrl?: string;
}

export interface SwitchModelResult {
  success: boolean;
  settingsPath: string;
  previousModel?: string;
  newModel: string;
  updatedSettings: Record<string, unknown>;
  error?: string;
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
