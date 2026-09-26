import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  normalizeBaseUrl,
  validateApiKeyFormat,
  probeCredentials,
  updateCliSettings,
  getShellExportGuidance,
  collectSetupInputs,
  validateAndProbeCredentials,
  runInteractiveSetup,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} from "../plugins/cruise/skills/setup/scripts/setup";

const ROOT = path.resolve(__dirname, "..");

describe("Interactive /cruise-setup Wizard & Settings Persistence", () => {
  let tempDir: string;
  let tempSettingsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cruise-setup-test-"));
    tempSettingsPath = path.join(tempDir, "antigravity-cli", "settings.json");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("normalizeBaseUrl", () => {
    it("defaults to production gateway URL if empty or whitespace", () => {
      expect(normalizeBaseUrl()).toBe(DEFAULT_BASE_URL);
      expect(normalizeBaseUrl("")).toBe(DEFAULT_BASE_URL);
      expect(normalizeBaseUrl("   ")).toBe(DEFAULT_BASE_URL);
    });

    it("strips trailing slashes", () => {
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net/")).toBe(
        "https://cruise.bytesbrains.net"
      );
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net///")).toBe(
        "https://cruise.bytesbrains.net"
      );
    });

    it("strips trailing /v1 path if provided by user", () => {
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net/v1")).toBe(
        "https://cruise.bytesbrains.net"
      );
      expect(normalizeBaseUrl("https://cruise.bytesbrains.net/v1/")).toBe(
        "https://cruise.bytesbrains.net"
      );
    });

    it("handles rehearsal demo base URL correctly", () => {
      expect(
        normalizeBaseUrl("https://cruise-demo.bytesbrains.net/v1")
      ).toBe("https://cruise-demo.bytesbrains.net");
    });

    it("prepends https protocol if missing", () => {
      expect(normalizeBaseUrl("cruise.bytesbrains.net")).toBe(
        "https://cruise.bytesbrains.net"
      );
    });

    it("throws error for malformed URLs", () => {
      expect(() => normalizeBaseUrl("http://:invalid url")).toThrow(
        /Invalid Cruise Base URL/
      );
    });
  });

  describe("validateApiKeyFormat", () => {
    it("accepts valid Cruise virtual keys", () => {
      expect(validateApiKeyFormat("cru_live_mock_key").valid).toBe(true);
      expect(validateApiKeyFormat("cru_demo_mock_key").valid).toBe(true);
      expect(validateApiKeyFormat("cru_test_mock_key").valid).toBe(true);
      expect(validateApiKeyFormat("cru_svc_mock_key").valid).toBe(true);
    });

    it("rejects empty or whitespace keys", () => {
      const res = validateApiKeyFormat("");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("cannot be empty");
    });

    it("rejects upstream third-party vendor keys", () => {
      const openaiKey = validateApiKeyFormat("sk-test1234567890123");
      expect(openaiKey.valid).toBe(false);
      expect(openaiKey.error).toMatch(/Vendor API key detected/);

      const anthropicKey = validateApiKeyFormat("sk-ant-test12345678901");
      expect(anthropicKey.valid).toBe(false);
      expect(anthropicKey.error).toMatch(/Vendor API key detected/);

      const googleKey = validateApiKeyFormat("AIzaSyMockKey12345678");
      expect(googleKey.valid).toBe(false);
      expect(googleKey.error).toMatch(/Non-Cruise credentials provided/);
    });

    it("rejects keys without proper cru_ prefix", () => {
      const res = validateApiKeyFormat("random_key_string");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Key must begin with cru_live_.*or cru_demo_/);
    });

    it("rejects keys that are too short", () => {
      const res = validateApiKeyFormat("cru_live_1");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/too short/);
    });
  });

  describe("probeCredentials", () => {
    it("successfully validates credentials and extracts models when probe succeeds", async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://cruise.bytesbrains.net/v1/models");
        expect(init?.headers).toBeDefined();
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer cru_live_mock");

        return new Response(
          JSON.stringify({
            data: [
              { id: "bb/agentic-coding" },
              { id: "bb/chat-assistant" },
              { id: "bb/extraction" },
              { id: "bb/fast" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const result = await probeCredentials("cru_live_mock", "https://cruise.bytesbrains.net", {
        fetchFn: mockFetch,
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.models).toContain("bb/agentic-coding");
      expect(result.models).toContain("bb/fast");
    });

    it("returns descriptive failure for HTTP 401 Unauthorized", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("Unauthorized", { status: 401 });
      };

      const result = await probeCredentials("cru_live_mock", "https://cruise.bytesbrains.net", {
        fetchFn: mockFetch,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain("HTTP 401 Unauthorized");
    });

    it("returns descriptive failure for HTTP 403 Forbidden", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("Forbidden", { status: 403 });
      };

      const result = await probeCredentials("cru_live_mock", "https://cruise.bytesbrains.net", {
        fetchFn: mockFetch,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.message).toContain("HTTP 403 Forbidden");
    });

    it("handles connection failure gracefully", async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error("ECONNREFUSED connect 127.0.0.1:443");
      };

      const result = await probeCredentials("cru_live_mock", "https://cruise.bytesbrains.net", {
        fetchFn: mockFetch,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.message).toContain("Network error");
    });
  });

  describe("updateCliSettings", () => {
    it("creates settings file with required OpenAI compatible configuration", () => {
      const res = updateCliSettings({
        settingsPath: tempSettingsPath,
        baseUrl: "https://cruise.bytesbrains.net",
      });

      expect(res.updated).toBe(true);
      expect(fs.existsSync(tempSettingsPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.modelProvider).toBe("openai");
      expect(saved.openaiBaseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(saved.openaiApiKey).toBe("${CRUISE_API_KEY}");
      expect(saved.model).toBe(DEFAULT_MODEL);
    });

    it("preserves existing configuration settings during update", () => {
      fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
      fs.writeFileSync(
        tempSettingsPath,
        JSON.stringify(
          {
            theme: "dark",
            telemetry: false,
            customPlugins: ["other-plugin"],
          },
          null,
          2
        )
      );

      updateCliSettings({
        settingsPath: tempSettingsPath,
        baseUrl: "https://cruise-demo.bytesbrains.net/v1",
      });

      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.theme).toBe("dark");
      expect(saved.telemetry).toBe(false);
      expect(saved.customPlugins).toEqual(["other-plugin"]);
      expect(saved.modelProvider).toBe("openai");
      expect(saved.openaiBaseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");
      expect(saved.openaiApiKey).toBe("${CRUISE_API_KEY}");
      expect(saved.model).toBe("bb/agentic-coding");
    });

    it("never persists a raw API key into settings.json", () => {
      updateCliSettings({
        settingsPath: tempSettingsPath,
        baseUrl: "https://cruise.bytesbrains.net",
      });

      const fileContent = fs.readFileSync(tempSettingsPath, "utf-8");
      expect(fileContent).toContain('"${CRUISE_API_KEY}"');
      expect(fileContent).not.toMatch(/cru_(live|demo|test|svc)_/);
    });
  });

  describe("getShellExportGuidance", () => {
    it("generates guidance for zsh shell profile", () => {
      const guidance = getShellExportGuidance("cru_live_mock", "https://cruise.bytesbrains.net");
      expect(guidance.exportCommand).toContain('export CRUISE_API_KEY="cru_live_mock"');
      expect(guidance.instructions).toContain("export CRUISE_API_KEY");
    });

    it("includes CRUISE_BASE_URL export when non-default base URL is used", () => {
      const guidance = getShellExportGuidance(
        "cru_demo_mock",
        "https://cruise-demo.bytesbrains.net"
      );
      expect(guidance.exportCommand).toContain('export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"');
    });

    it("uses safe placeholder if API key is not passed", () => {
      const guidance = getShellExportGuidance();
      expect(guidance.exportCommand).toContain('export CRUISE_API_KEY="<your-cruise-api-key>"');
    });
  });

  describe("collectSetupInputs & validateAndProbeCredentials", () => {
    it("collects and normalizes options without prompting in non-interactive mode", async () => {
      const inputs = await collectSetupInputs(
        {
          apiKey: "cru_live_mock",
          baseUrl: "https://cruise.bytesbrains.net/v1",
        },
        null
      );
      expect(inputs.apiKey).toBe("cru_live_mock");
      expect(inputs.baseUrl).toBe("https://cruise.bytesbrains.net");
      expect(inputs.model).toBe("bb/agentic-coding");
    });

    it("skips probe when skipProbe is true", async () => {
      const outcome = await validateAndProbeCredentials("cru_live_mock", "https://cruise.bytesbrains.net", {
        skipProbe: true,
      });
      expect(outcome.validated).toBe(true);
    });
  });

  describe("runInteractiveSetup (End-to-End Non-Interactive)", () => {
    it("executes complete setup wizard and writes settings successfully", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            data: [{ id: "bb/agentic-coding" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const result = await runInteractiveSetup({
        apiKey: "cru_live_mock",
        baseUrl: "https://cruise.bytesbrains.net",
        settingsPath: tempSettingsPath,
        nonInteractive: true,
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.baseUrl).toBe("https://cruise.bytesbrains.net");
      expect(fs.existsSync(tempSettingsPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
      expect(saved.modelProvider).toBe("openai");
      expect(saved.openaiBaseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(saved.openaiApiKey).toBe("${CRUISE_API_KEY}");
    });

    it("aborts when credential probe fails in non-interactive mode", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("Unauthorized", { status: 401 });
      };

      await expect(
        runInteractiveSetup({
          apiKey: "cru_live_mock",
          baseUrl: "https://cruise.bytesbrains.net",
          settingsPath: tempSettingsPath,
          nonInteractive: true,
          fetchFn: mockFetch,
        })
      ).rejects.toThrow(/Credential validation failed/);

      expect(fs.existsSync(tempSettingsPath)).toBe(false);
    });
  });

  describe("Executable Setup Scripts & Permissions", () => {
    it("plugins/cruise/skills/setup/scripts/setup.sh exists, is executable, and delegates to setup.ts", () => {
      const scriptPath = path.join(
        ROOT,
        "plugins/cruise/skills/setup/scripts/setup.sh"
      );
      expect(fs.existsSync(scriptPath)).toBe(true);
      fs.accessSync(scriptPath, fs.constants.X_OK);

      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("setup.ts");
      expect(content).toContain("tsx");
    });

    it("plugins/cruise/skills/setup/scripts/setup.ts exists and exports wizard functions", () => {
      const tsPath = path.join(
        ROOT,
        "plugins/cruise/skills/setup/scripts/setup.ts"
      );
      expect(fs.existsSync(tsPath)).toBe(true);
    });
  });
});
