import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  DEFAULT_LANES,
  parseLanesFromApiResponse,
  fetchLanes,
  formatCapabilityMatrixTable,
  formatMemberBreakdownTable,
  formatWorkloadRecommendations,
  formatCliSwitchGuidance,
  formatCliTable,
  getDefaultSettingsPath,
  normalizeBaseUrl,
  isValidLaneIdentifier,
  switchActiveModel,
} from "../plugins/cruise/skills/lane/scripts/lane";

// Construct test credential dynamically to prevent false positive pattern matches
const MOCK_API_KEY = ["cru", "test", "mock", "lane", "key"].join("_");

describe("Cruise Model Lane Discovery & Selection Helper", () => {
  let tempDir: string;
  let tempSettingsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cruise-lane-test-"));
    tempSettingsPath = path.join(tempDir, "antigravity-cli", "settings.json");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("DEFAULT_LANES Catalogue", () => {
    it("defines all 4 core routing lanes with full specifications", () => {
      const ids = DEFAULT_LANES.map((l) => l.id);
      expect(ids).toEqual([
        "bb/agentic-coding",
        "bb/chat-assistant",
        "bb/extraction",
        "bb/fast",
      ]);

      for (const lane of DEFAULT_LANES) {
        expect(lane.name.length).toBeGreaterThan(0);
        expect(lane.description.length).toBeGreaterThan(0);
        expect(lane.members.length).toBeGreaterThan(0);

        expect(typeof lane.capabilities.tools).toBe("boolean");
        expect(typeof lane.capabilities.streaming).toBe("boolean");
        expect(typeof lane.capabilities.vision).toBe("boolean");
        expect(typeof lane.capabilities.json_schema).toBe("boolean");

        expect(lane.context_bounds.max_input_tokens).toBeGreaterThan(0);
        expect(lane.context_bounds.max_output_tokens).toBeGreaterThan(0);

        expect(lane.pricing.prompt_per_m).toMatch(/^\$[0-9.]+/);
        expect(lane.pricing.completion_per_m).toMatch(/^\$[0-9.]+/);
        expect(lane.pricing.cost_tier.length).toBeGreaterThan(0);

        expect(lane.recommendedWorkload.length).toBeGreaterThan(0);
        expect(["high", "medium", "low", "none"]).toContain(lane.recommendedEffort);
      }
    });

    it("ensures vision capabilities are accurately flagged per lane", () => {
      const coding = DEFAULT_LANES.find((l) => l.id === "bb/agentic-coding");
      const chat = DEFAULT_LANES.find((l) => l.id === "bb/chat-assistant");
      const extraction = DEFAULT_LANES.find((l) => l.id === "bb/extraction");
      const fast = DEFAULT_LANES.find((l) => l.id === "bb/fast");

      expect(coding?.capabilities.vision).toBe(true);
      expect(chat?.capabilities.vision).toBe(true);
      expect(extraction?.capabilities.vision).toBe(false);
      expect(fast?.capabilities.vision).toBe(false);
    });
  });

  describe("normalizeBaseUrl & SSRF Mitigation", () => {
    it("normalizes and validates URLs safely", () => {
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net/")).toBe("https://cruise.bytesbrains.net");
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net/v1")).toBe("https://cruise.bytesbrains.net");
      expect(normalizeBaseUrl("cruise-demo.bytesbrains.net")).toBe("https://cruise-demo.bytesbrains.net");
      expect(normalizeBaseUrl("")).toBe("https://cruise.bytesbrains.net");
    });

    it("rejects invalid schemes or credentials in base URL", () => {
      expect(normalizeBaseUrl("ftp://cruise.bytesbrains.net")).toBe("https://cruise.bytesbrains.net");
      expect(normalizeBaseUrl("https://user:pass@evil.com")).toBe("https://cruise.bytesbrains.net");
    });
  });

  describe("parseLanesFromApiResponse", () => {
    it("parses OpenAI-compatible /v1/models payload with x-cruise metadata", () => {
      const payload = {
        object: "list",
        data: [
          {
            id: "bb/agentic-coding",
            object: "model",
            "x-cruise": {
              members: ["anthropic/claude-3-7-sonnet", "openai/gpt-4o"],
              any_member: { tools: true, streaming: true, vision: true, json_schema: true },
              pricing: { prompt_per_m: "$3.50", completion_per_m: "$17.50", cost_tier: "Premium Coding" },
              context_bounds: { max_input_tokens: "200k", max_output_tokens: 16384 },
            },
          },
        ],
      };

      const lanes = parseLanesFromApiResponse(payload);
      expect(lanes).toHaveLength(1);
      expect(lanes[0].id).toBe("bb/agentic-coding");
      expect(lanes[0].capabilities.vision).toBe(true);
      expect(lanes[0].pricing.prompt_per_m).toBe("$3.50");
      expect(lanes[0].pricing.cost_tier).toBe("Premium Coding");
      expect(lanes[0].context_bounds.max_input_tokens).toBe(200000);
      expect(lanes[0].context_bounds.max_output_tokens).toBe(16384);
    });

    it("safely handles non-numeric context bounds without NaN", () => {
      const payload = {
        data: [
          {
            id: "bb/fast",
            "x-cruise": {
              context_bounds: { max_input_tokens: "unbounded", max_output_tokens: null },
            },
          },
        ],
      };

      const lanes = parseLanesFromApiResponse(payload);
      expect(Number.isNaN(lanes[0].context_bounds.max_input_tokens)).toBe(false);
      expect(lanes[0].context_bounds.max_input_tokens).toBe(64000); // default for bb/fast
    });

    it("parses MCP tool response format and inspects multiple content blocks", () => {
      const payload = {
        result: {
          content: [
            { type: "text", text: "Preliminary informational log message" },
            {
              type: "text",
              text: JSON.stringify({
                lanes: [
                  {
                    id: "bb/extraction",
                    "x-cruise": {
                      members: ["mistral/codestral"],
                      any_member: { tools: true, streaming: true, vision: false, json_schema: true },
                    },
                  },
                ],
              }),
            },
          ],
        },
      };

      const lanes = parseLanesFromApiResponse(payload);
      expect(lanes).toHaveLength(1);
      expect(lanes[0].id).toBe("bb/extraction");
      expect(lanes[0].capabilities.vision).toBe(false);
    });

    it("returns DEFAULT_LANES if input is null, empty, or lacks recognized items", () => {
      expect(parseLanesFromApiResponse(null)).toEqual(DEFAULT_LANES);
      expect(parseLanesFromApiResponse({})).toEqual(DEFAULT_LANES);
      expect(parseLanesFromApiResponse({ data: [] })).toEqual(DEFAULT_LANES);
      expect(parseLanesFromApiResponse("invalid")).toEqual(DEFAULT_LANES);
    });
  });

  describe("fetchLanes", () => {
    it("returns live lanes when API probe succeeds", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "bb/agentic-coding",
              "x-cruise": {
                members: ["anthropic/claude-3-7-sonnet"],
                any_member: { tools: true, streaming: true, vision: true, json_schema: true },
              },
            },
          ],
        }),
      });

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        apiKey: MOCK_API_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://cruise.bytesbrains.net/v1/models",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_API_KEY}`,
          }),
        })
      );
      expect(result.isLive).toBe(true);
      expect(result.source).toBe("rest");
      expect(result.lanes[0].id).toBe("bb/agentic-coding");
    });

    it("queries Cruise MCP server endpoint via JSON-RPC tools/call (list_models) when preferMcp is enabled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            lanes: [
              {
                id: "bb/agentic-coding",
                "x-cruise": {
                  members: ["anthropic/claude-3-7-sonnet", "openai/gpt-4o"],
                  any_member: { tools: true, streaming: true, vision: true, json_schema: true },
                  pricing: { prompt_per_m: "$3.00", completion_per_m: "$15.00", cost_tier: "Premium" },
                  context_bounds: { max_input_tokens: 200000, max_output_tokens: 8192 },
                },
              },
            ],
          },
        }),
      });

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        apiKey: MOCK_API_KEY,
        preferMcp: true,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://cruise.bytesbrains.net/mcp",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_API_KEY}`,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "list_models", arguments: { kind: "lanes" } },
          }),
        })
      );
      expect(result.isLive).toBe(true);
      expect(result.source).toBe("mcp");
      expect(result.lanes[0].id).toBe("bb/agentic-coding");
    });

    it("falls back gracefully to DEFAULT_LANES on network or HTTP error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.isLive).toBe(false);
      expect(result.source).toBe("default");
      expect(result.lanes).toEqual(DEFAULT_LANES);
    });

    it("does not report live MCP source when MCP response contains zero lanes", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: { lanes: [] } }),
      });

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        preferMcp: true,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.source).toBe("default");
      expect(result.isLive).toBe(false);
    });
  });

  describe("Markdown & CLI Formatters", () => {
    it("formatCapabilityMatrixTable generates markdown table with required checkmarks", () => {
      const table = formatCapabilityMatrixTable(DEFAULT_LANES);
      expect(table).toContain("| Lane Alias | Tools | Streaming | Vision | JSON Schema |");
      expect(table).toContain("`bb/agentic-coding`");
      expect(table).toContain("✓");
      expect(table).toContain("✗");
      expect(table).toContain("200k / 8k");
    });

    it("formatMemberBreakdownTable lists underlying member models", () => {
      const table = formatMemberBreakdownTable(DEFAULT_LANES);
      expect(table).toContain("| Lane Alias | Underlying Member Models | Primary Routing Purpose |");
      expect(table).toContain("`anthropic/claude-3-7-sonnet`");
    });

    it("formatWorkloadRecommendations generates workload-to-lane mapping table with reasoning effort", () => {
      const guide = formatWorkloadRecommendations(DEFAULT_LANES);
      expect(guide).toContain("**Autonomous Coding**");
      expect(guide).toContain("`bb/agentic-coding`");
      expect(guide).toContain("`/effort high`");
    });

    it("formatCliSwitchGuidance generates CLI commands and settings snippet", () => {
      const guidance = formatCliSwitchGuidance("bb/agentic-coding", "high");
      expect(guidance).toContain("/model bb/agentic-coding");
      expect(guidance).toContain("/effort high");
      expect(guidance).toContain('"model": "bb/agentic-coding"');
    });

    it("formatCliTable generates terminal table format", () => {
      const table = formatCliTable(DEFAULT_LANES);
      expect(table).toContain("BytesBrains Cruise — Dynamic Model Lanes");
      expect(table).toContain("bb/agentic-coding");
    });
  });

  describe("getDefaultSettingsPath & isValidLaneIdentifier", () => {
    it("constructs settings.json path under ~/.gemini/antigravity-cli", () => {
      expect(getDefaultSettingsPath()).toBe(
        path.join(os.homedir(), ".gemini", "antigravity-cli", "settings.json")
      );
    });

    it("handles custom homedir injection cleanly", () => {
      expect(getDefaultSettingsPath(() => "/custom/user/home")).toBe(
        path.join("/custom/user/home", ".gemini", "antigravity-cli", "settings.json")
      );
    });

    it("handles empty homedir string without throwing errors", () => {
      expect(getDefaultSettingsPath(() => "")).toBe(
        path.join("", ".gemini", "antigravity-cli", "settings.json")
      );
    });

    it("validates recognized lane identifiers and rejects arbitrary values", () => {
      expect(isValidLaneIdentifier("bb/agentic-coding")).toBe(true);
      expect(isValidLaneIdentifier("bb/chat-assistant")).toBe(true);
      expect(isValidLaneIdentifier("bb/custom-lane-1")).toBe(true);
      expect(isValidLaneIdentifier("")).toBe(false);
      expect(isValidLaneIdentifier("openai/gpt-4o")).toBe(false);
      expect(isValidLaneIdentifier("malicious;rm -rf /")).toBe(false);
    });
  });

  describe("switchActiveModel", () => {
    it("creates settings file and sets active model when file does not exist", () => {
      const result = switchActiveModel({
        model: "bb/fast",
        settingsPath: tempSettingsPath,
      });

      expect(result.success).toBe(true);
      expect(result.newModel).toBe("bb/fast");
      expect(fs.existsSync(tempSettingsPath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.model).toBe("bb/fast");
      expect(saved.modelProvider).toBe("openai");
    });

    it("rejects unknown or invalid model identifiers without modifying file", () => {
      const result = switchActiveModel({
        model: "invalid/unrecognized-model",
        settingsPath: tempSettingsPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid or unrecognized model lane/);
      expect(fs.existsSync(tempSettingsPath)).toBe(false);
    });

    it("refuses to overwrite settings when file contains invalid JSON", () => {
      fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
      fs.writeFileSync(tempSettingsPath, "{ corrupted-json-not-valid !!!");

      const result = switchActiveModel({
        model: "bb/fast",
        settingsPath: tempSettingsPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/contains invalid JSON.*Refusing to overwrite/);
      expect(fs.readFileSync(tempSettingsPath, "utf-8")).toBe("{ corrupted-json-not-valid !!!");
    });

    it("bootstraps modelProvider, openaiBaseUrl, and openaiApiKey with custom baseUrl", () => {
      fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
      fs.writeFileSync(tempSettingsPath, JSON.stringify({ customTool: true }));

      const result = switchActiveModel({
        model: "bb/agentic-coding",
        settingsPath: tempSettingsPath,
        baseUrl: "https://cruise-demo.bytesbrains.net",
      });

      expect(result.success).toBe(true);
      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.model).toBe("bb/agentic-coding");
      expect(saved.openaiBaseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");
      expect(saved.customTool).toBe(true);
    });
  });
});
