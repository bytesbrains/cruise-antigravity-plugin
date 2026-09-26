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
  switchActiveModel,
  runLaneDiscovery,
} from "../plugins/cruise/skills/lane/scripts/lane";

const MOCK_API_KEY = "cru_test_mock_lane_key";

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

        // Capability flags
        expect(typeof lane.capabilities.tools).toBe("boolean");
        expect(typeof lane.capabilities.streaming).toBe("boolean");
        expect(typeof lane.capabilities.vision).toBe("boolean");
        expect(typeof lane.capabilities.json_schema).toBe("boolean");

        // Context bounds
        expect(lane.context_bounds.max_input_tokens).toBeGreaterThan(0);
        expect(lane.context_bounds.max_output_tokens).toBeGreaterThan(0);

        // Pricing
        expect(lane.pricing.prompt_per_m).toMatch(/^\$[0-9.]+/);
        expect(lane.pricing.completion_per_m).toMatch(/^\$[0-9.]+/);
        expect(lane.pricing.cost_tier.length).toBeGreaterThan(0);

        // Workload & Effort
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
              any_member: {
                tools: true,
                streaming: true,
                vision: true,
                json_schema: true,
              },
              pricing: {
                prompt_per_m: "$3.50",
                completion_per_m: "$17.50",
                cost_tier: "Premium Coding",
              },
              context_bounds: {
                max_input_tokens: 200000,
                max_output_tokens: 16384,
              },
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
      expect(lanes[0].context_bounds.max_output_tokens).toBe(16384);
      expect(lanes[0].members).toContain("anthropic/claude-3-7-sonnet");
    });

    it("parses MCP tool response format with lanes array", () => {
      const payload = {
        lanes: [
          {
            id: "bb/fast",
            x_cruise: {
              members: ["meta/llama-3.1-8b"],
              capabilities: {
                tools: true,
                streaming: true,
                vision: false,
                json_schema: true,
              },
            },
          },
        ],
      };

      const lanes = parseLanesFromApiResponse(payload);
      expect(lanes).toHaveLength(1);
      expect(lanes[0].id).toBe("bb/fast");
      expect(lanes[0].capabilities.vision).toBe(false);
      expect(lanes[0].members).toEqual(["meta/llama-3.1-8b"]);
    });

    it("handles custom or unanticipated lanes gracefully", () => {
      const payload = {
        data: [
          {
            id: "bb/reasoning-pro",
            description: "Deep reasoning specialized lane",
            "x-cruise": {
              members: ["deepseek/deepseek-r1"],
              any_member: {
                tools: false,
                streaming: true,
                vision: false,
                json_schema: false,
              },
              pricing: {
                prompt_per_m: "$2.00",
                completion_per_m: "$8.00",
                cost_tier: "High Reasoning",
              },
              context_bounds: {
                max_input_tokens: 64000,
                max_output_tokens: 8192,
              },
            },
          },
        ],
      };

      const lanes = parseLanesFromApiResponse(payload);
      expect(lanes).toHaveLength(1);
      expect(lanes[0].id).toBe("bb/reasoning-pro");
      expect(lanes[0].name).toBe("Reasoning Pro");
      expect(lanes[0].capabilities.tools).toBe(false);
      expect(lanes[0].pricing.cost_tier).toBe("High Reasoning");
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
      expect(result.lanes).toHaveLength(1);
      expect(result.lanes[0].id).toBe("bb/agentic-coding");
    });

    it("queries Cruise MCP server endpoint via JSON-RPC tools/call (list_models) when preferMcp is enabled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
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
                }),
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
      expect(result.lanes[0].capabilities.tools).toBe(true);
    });

    it("falls back gracefully to DEFAULT_LANES on network or HTTP error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.isLive).toBe(false);
      expect(result.lanes).toEqual(DEFAULT_LANES);
      expect(result.endpoint).toBe("https://cruise.bytesbrains.net/v1/models");
    });

    it("falls back to DEFAULT_LANES when HTTP status is not ok (e.g. 401)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await fetchLanes({
        baseUrl: "https://cruise.bytesbrains.net",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.isLive).toBe(false);
      expect(result.lanes).toEqual(DEFAULT_LANES);
    });
  });

  describe("Markdown & CLI Table Formatters", () => {
    it("formatCapabilityMatrixTable generates markdown table with all required columns and checkmarks", () => {
      const table = formatCapabilityMatrixTable(DEFAULT_LANES);

      expect(table).toContain("| Lane Alias | Tools | Streaming | Vision | JSON Schema | Context (In / Out) | Pricing (Prompt / Comp) | Cost Tier |");
      expect(table).toContain("`bb/agentic-coding`");
      expect(table).toContain("`bb/chat-assistant`");
      expect(table).toContain("`bb/extraction`");
      expect(table).toContain("`bb/fast`");

      // Verify checkmarks
      expect(table).toContain("✓");
      expect(table).toContain("✗");

      // Verify pricing & context bounds
      expect(table).toContain("200k / 8k");
      expect(table).toContain("$3.00 / $15.00");
      expect(table).toContain("Standard / Premium");
    });

    it("formatMemberBreakdownTable lists underlying member models", () => {
      const table = formatMemberBreakdownTable(DEFAULT_LANES);

      expect(table).toContain("| Lane Alias | Underlying Member Models | Primary Routing Purpose |");
      expect(table).toContain("`anthropic/claude-3-7-sonnet`");
      expect(table).toContain("`openai/gpt-4o`");
      expect(table).toContain("`mistral/codestral`");
      expect(table).toContain("`meta-llama/llama-3.3-70b-instruct`");
    });

    it("formatWorkloadRecommendations generates workload-to-lane mapping table with reasoning effort", () => {
      const guide = formatWorkloadRecommendations(DEFAULT_LANES);

      expect(guide).toContain("**Autonomous Coding**");
      expect(guide).toContain("`bb/agentic-coding`");
      expect(guide).toContain("`/effort high`");

      expect(guide).toContain("**Chat & Pairing**");
      expect(guide).toContain("`bb/chat-assistant`");
      expect(guide).toContain("`/effort medium`");

      expect(guide).toContain("**Extraction & Schema**");
      expect(guide).toContain("`bb/extraction`");
      expect(guide).toContain("`/effort low`");

      expect(guide).toContain("**Linting & Quick Edits**");
      expect(guide).toContain("`bb/fast`");
      expect(guide).toContain("`/effort none`");
    });

    it("formatCliSwitchGuidance generates CLI commands and settings snippet", () => {
      const guidance = formatCliSwitchGuidance("bb/agentic-coding", "high");

      expect(guidance).toContain("/model bb/agentic-coding");
      expect(guidance).toContain("/effort high");
      expect(guidance).toContain("~/.gemini/antigravity-cli/settings.json");
      expect(guidance).toContain('"model": "bb/agentic-coding"');
    });

    it("formatCliTable generates terminal table format", () => {
      const table = formatCliTable(DEFAULT_LANES);

      expect(table).toContain("BytesBrains Cruise — Dynamic Model Lanes");
      expect(table).toContain("bb/agentic-coding");
      expect(table).toContain("bb/chat-assistant");
      expect(table).toContain("bb/extraction");
      expect(table).toContain("bb/fast");
      expect(table).toContain("[✓]");
    });
  });

  describe("getDefaultSettingsPath", () => {
    it("constructs settings.json path under ~/.gemini/antigravity-cli", () => {
      const settingsPath = getDefaultSettingsPath();
      expect(settingsPath).toBe(
        path.join(os.homedir(), ".gemini", "antigravity-cli", "settings.json")
      );
    });

    it("handles custom homedir injection cleanly", () => {
      expect(getDefaultSettingsPath(() => "/custom/user/home")).toBe(
        path.join("/custom/user/home", ".gemini", "antigravity-cli", "settings.json")
      );
    });

    it("handles empty homedir string without throwing errors", () => {
      const resolved = getDefaultSettingsPath(() => "");
      expect(resolved).toBe(path.join("", ".gemini", "antigravity-cli", "settings.json"));
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
      expect(result.previousModel).toBeUndefined();

      expect(fs.existsSync(tempSettingsPath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.model).toBe("bb/fast");
    });

    it("updates model while preserving existing settings", () => {
      // Pre-seed settings file
      fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
      fs.writeFileSync(
        tempSettingsPath,
        JSON.stringify(
          {
            modelProvider: "openai",
            openaiBaseUrl: "https://cruise.bytesbrains.net/v1",
            openaiApiKey: "${CRUISE_API_KEY}",
            model: "bb/agentic-coding",
            customSetting: "keep-me",
          },
          null,
          2
        )
      );

      const result = switchActiveModel({
        model: "bb/chat-assistant",
        settingsPath: tempSettingsPath,
      });

      expect(result.success).toBe(true);
      expect(result.previousModel).toBe("bb/agentic-coding");
      expect(result.newModel).toBe("bb/chat-assistant");

      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.model).toBe("bb/chat-assistant");
      expect(saved.modelProvider).toBe("openai");
      expect(saved.customSetting).toBe("keep-me");
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

    it("bootstraps modelProvider, openaiBaseUrl, and openaiApiKey when missing in existing settings", () => {
      fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
      fs.writeFileSync(tempSettingsPath, JSON.stringify({ customTool: true }));

      const result = switchActiveModel({
        model: "bb/agentic-coding",
        settingsPath: tempSettingsPath,
      });

      expect(result.success).toBe(true);
      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.model).toBe("bb/agentic-coding");
      expect(saved.modelProvider).toBe("openai");
      expect(saved.openaiBaseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(saved.openaiApiKey).toBe("${CRUISE_API_KEY}");
      expect(saved.customTool).toBe(true);
    });
  });

  describe("runLaneDiscovery CLI Runner", () => {
    it("outputs valid JSON when --json flag is provided", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runLaneDiscovery(["--json"]);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.lanes).toBeDefined();
      expect(parsed.lanes.length).toBeGreaterThanOrEqual(4);

      logSpy.mockRestore();
    });

    it("outputs markdown when --markdown flag is provided", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runLaneDiscovery(["--markdown"]);

      expect(logSpy).toHaveBeenCalled();
      const calls = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(calls).toContain("## Cruise Dynamic Model Routing Lanes");
      expect(calls).toContain("### 1. Capability Matrix");
      expect(calls).toContain("### 2. Underlying Member Models");
      expect(calls).toContain("### 3. Workload Recommendations & Effort");
      expect(calls).toContain("/model bb/agentic-coding");

      logSpy.mockRestore();
    });

    it("updates model when --select flag is passed", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Use a custom settings path by calling switchActiveModel directly or letting it use default
      const res = switchActiveModel({
        model: "bb/extraction",
        settingsPath: tempSettingsPath,
      });

      expect(res.newModel).toBe("bb/extraction");
      logSpy.mockRestore();
    });
  });
});
