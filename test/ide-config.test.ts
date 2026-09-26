import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import {
  resolveIdeSettingsPath,
  createCruiseCustomProvider,
  validateIdeSettings,
  updateIdeSettings,
  DEFAULT_CRUISE_PROVIDER_NAME,
  DEFAULT_IDE_MODELS,
  DEFAULT_IDE_API_KEY,
} from "../plugins/cruise/skills/setup/scripts/ide-config.js";
import { runInteractiveSetup } from "../plugins/cruise/skills/setup/scripts/setup.js";

const ROOT = path.resolve(__dirname, "..");
const MOCK_API_KEY = ["cru", "test", "mock", "ide", "key"].join("_");

describe("Antigravity IDE Custom Provider Configuration & Settings UI Integration", () => {
  let tempDir: string;
  let tempIdeSettingsPath: string;
  let tempCliSettingsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cruise-ide-test-"));
    tempIdeSettingsPath = path.join(tempDir, "ide-settings.json");
    tempCliSettingsPath = path.join(tempDir, "cli-settings.json");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("JSON Schema & Provider Specification", () => {
    it("plugins/cruise/schemas/ide-settings.schema.json exists, parses, and defines required fields", () => {
      const schemaPath = path.join(
        ROOT,
        "plugins/cruise/schemas/ide-settings.schema.json"
      );
      expect(fs.existsSync(schemaPath)).toBe(true);

      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      expect(schema.$schema).toContain("json-schema.org");
      expect(schema.properties["antigravity.ai.customProviders"]).toBeDefined();

      const def = schema.definitions.CustomProvider;
      expect(def).toBeDefined();
      expect(def.required).toContain("name");
      expect(def.required).toContain("baseUrl");
      expect(def.required).toContain("apiKey");
      expect(def.required).toContain("models");
    });
  });

  describe("resolveIdeSettingsPath", () => {
    it("defaults to ~/.gemini/settings.json for global scope", () => {
      const resolved = resolveIdeSettingsPath();
      expect(resolved).toBe(path.join(os.homedir(), ".gemini", "settings.json"));
    });

    it("resolves workspace .gemini/settings.json when targetScope is workspace", () => {
      const resolved = resolveIdeSettingsPath({
        targetScope: "workspace",
        workspaceRoot: tempDir,
      });
      expect(resolved).toBe(path.join(tempDir, ".gemini", "settings.json"));
    });

    it("resolves workspace .vscode/settings.json when targetScope is vscode", () => {
      const resolved = resolveIdeSettingsPath({
        targetScope: "vscode",
        workspaceRoot: tempDir,
      });
      expect(resolved).toBe(path.join(tempDir, ".vscode", "settings.json"));
    });

    it("prioritizes explicit settingsPath when provided", () => {
      const explicit = path.join(tempDir, "custom", "my-settings.json");
      const resolved = resolveIdeSettingsPath({
        settingsPath: explicit,
        targetScope: "workspace",
      });
      expect(resolved).toBe(path.resolve(explicit));
    });
  });

  describe("createCruiseCustomProvider", () => {
    it("creates standard Cruise custom provider with defaults", () => {
      const provider = createCruiseCustomProvider();
      expect(provider.name).toBe(DEFAULT_CRUISE_PROVIDER_NAME);
      expect(provider.baseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(provider.apiKey).toBe(DEFAULT_IDE_API_KEY);
      expect(provider.models).toEqual(DEFAULT_IDE_MODELS);
    });

    it("normalizes custom base URL and appends /v1 cleanly", () => {
      const provider = createCruiseCustomProvider({
        baseUrl: "https://cruise-demo.bytesbrains.net/v1/",
      });
      expect(provider.baseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");
    });

    it("preserves custom models list if provided", () => {
      const provider = createCruiseCustomProvider({
        models: ["bb/agentic-coding", "bb/fast"],
      });
      expect(provider.models).toEqual(["bb/agentic-coding", "bb/fast"]);
    });
  });

  describe("validateIdeSettings", () => {
    it("validates compliant settings object", () => {
      const sample = {
        "antigravity.ai.customProviders": [
          {
            name: "BytesBrains Cruise",
            baseUrl: "https://cruise.bytesbrains.net/v1",
            apiKey: "${env:CRUISE_API_KEY}",
            models: ["bb/agentic-coding", "bb/chat-assistant"],
          },
        ],
      };
      const result = validateIdeSettings(sample);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects invalid types and missing required fields", () => {
      expect(validateIdeSettings(null).valid).toBe(false);
      expect(validateIdeSettings([]).valid).toBe(false);

      const missingProviders = validateIdeSettings({ theme: "Default" });
      expect(missingProviders.valid).toBe(false);
      expect(missingProviders.errors).toContain(
        "Settings object must define 'antigravity.ai.customProviders'."
      );

      const invalidProvider = {
        "antigravity.ai.customProviders": [
          {
            name: "",
            baseUrl: "not-a-valid-url",
            apiKey: "",
            models: [],
          },
        ],
      };
      const result = validateIdeSettings(invalidProvider);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("updateIdeSettings", () => {
    it("creates new IDE settings file if none exists with 0o600 permissions", () => {
      const result = updateIdeSettings({
        settingsPath: tempIdeSettingsPath,
      });

      expect(result.updated).toBe(true);
      expect(fs.existsSync(tempIdeSettingsPath)).toBe(true);
      const stats = fs.statSync(tempIdeSettingsPath);
      expect(stats.mode & 0o777).toBe(0o600);

      const saved = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(saved["antigravity.ai.customProviders"]).toBeDefined();
      expect(saved["antigravity.ai.customProviders"]).toHaveLength(1);

      const provider = saved["antigravity.ai.customProviders"][0];
      expect(provider.name).toBe("BytesBrains Cruise");
      expect(provider.baseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(provider.apiKey).toBe("${env:CRUISE_API_KEY}");
      expect(provider.models).toEqual(DEFAULT_IDE_MODELS);
    });

    it("preserves other IDE settings and other custom providers (non-destructive merge)", () => {
      fs.writeFileSync(
        tempIdeSettingsPath,
        JSON.stringify(
          {
            theme: "Default",
            selectedAuthType: "gemini-api-key",
            "editor.fontSize": 14,
            "antigravity.ai.customProviders": [
              {
                name: "Existing Other Provider",
                baseUrl: "https://other-provider.local/v1",
                apiKey: "${env:OTHER_KEY}",
                models: ["other-model"],
              },
            ],
          },
          null,
          2
        )
      );

      updateIdeSettings({
        settingsPath: tempIdeSettingsPath,
        baseUrl: "https://cruise-demo.bytesbrains.net",
      });

      const saved = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(saved.theme).toBe("Default");
      expect(saved.selectedAuthType).toBe("gemini-api-key");
      expect(saved["editor.fontSize"]).toBe(14);
      expect(saved["antigravity.ai.customProviders"]).toHaveLength(2);

      const other = saved["antigravity.ai.customProviders"][0];
      expect(other.name).toBe("Existing Other Provider");

      const cruise = saved["antigravity.ai.customProviders"][1];
      expect(cruise.name).toBe("BytesBrains Cruise");
      expect(cruise.baseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");
      expect(cruise.apiKey).toBe("${env:CRUISE_API_KEY}");
    });

    it("updates existing BytesBrains Cruise entry in place if already present", () => {
      fs.writeFileSync(
        tempIdeSettingsPath,
        JSON.stringify(
          {
            "antigravity.ai.customProviders": [
              {
                name: "BytesBrains Cruise",
                baseUrl: "https://old-endpoint.net/v1",
                apiKey: "${env:OLD_KEY}",
                models: ["old-lane"],
                customField: "keep-me",
              },
            ],
          },
          null,
          2
        )
      );

      updateIdeSettings({
        settingsPath: tempIdeSettingsPath,
        baseUrl: "https://cruise.bytesbrains.net",
        models: ["bb/agentic-coding", "bb/fast"],
      });

      const saved = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(saved["antigravity.ai.customProviders"]).toHaveLength(1);
      const cruise = saved["antigravity.ai.customProviders"][0];
      expect(cruise.baseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(cruise.models).toEqual(["bb/agentic-coding", "bb/fast"]);
      expect(cruise.customField).toBe("keep-me");
    });

    it("preserves custom provider name when updating in place", () => {
      fs.writeFileSync(
        tempIdeSettingsPath,
        JSON.stringify({
          "antigravity.ai.customProviders": [
            {
              name: "My Custom Cruise Name",
              baseUrl: "https://cruise.bytesbrains.net/v1",
              apiKey: "${env:CRUISE_API_KEY}",
              models: ["bb/agentic-coding"],
            },
          ],
        })
      );

      updateIdeSettings({
        settingsPath: tempIdeSettingsPath,
        baseUrl: "https://cruise-demo.bytesbrains.net",
      });

      const saved = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(saved["antigravity.ai.customProviders"]).toHaveLength(1);
      expect(saved["antigravity.ai.customProviders"][0].name).toBe("My Custom Cruise Name");
      expect(saved["antigravity.ai.customProviders"][0].baseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");
    });

    it("throws clear error when settings file contains invalid JSON", () => {
      fs.writeFileSync(tempIdeSettingsPath, "{ corrupted json: missing quotes }");
      expect(() =>
        updateIdeSettings({ settingsPath: tempIdeSettingsPath })
      ).toThrow(/Failed to parse existing IDE settings/);
    });

    it("never persists literal API credentials to disk", () => {
      updateIdeSettings({
        settingsPath: tempIdeSettingsPath,
      });

      const fileContent = fs.readFileSync(tempIdeSettingsPath, "utf-8");
      expect(fileContent).toContain('"${env:CRUISE_API_KEY}"');
      expect(fileContent).not.toMatch(/cru_(live|demo|test|svc)_/);
    });
  });

  describe("Integration with runInteractiveSetup", () => {
    it("configures both CLI settings and IDE custom provider settings when requested", async () => {
      const mockFetch: typeof fetch = async () => {
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

      const result = await runInteractiveSetup({
        apiKey: MOCK_API_KEY,
        baseUrl: "https://cruise.bytesbrains.net",
        settingsPath: tempCliSettingsPath,
        ideSettingsPath: tempIdeSettingsPath,
        configureIde: true,
        nonInteractive: true,
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(tempCliSettingsPath)).toBe(true);
      expect(fs.existsSync(tempIdeSettingsPath)).toBe(true);

      const cliSettings = JSON.parse(fs.readFileSync(tempCliSettingsPath, "utf-8"));
      expect(cliSettings.modelProvider).toBe("openai");
      expect(cliSettings.openaiBaseUrl).toBe("https://cruise.bytesbrains.net/v1");

      const ideSettings = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(ideSettings["antigravity.ai.customProviders"]).toBeDefined();
      const prov = ideSettings["antigravity.ai.customProviders"][0];
      expect(prov.name).toBe("BytesBrains Cruise");
      expect(prov.baseUrl).toBe("https://cruise.bytesbrains.net/v1");
      expect(prov.apiKey).toBe("${env:CRUISE_API_KEY}");
      expect(prov.models).toContain("bb/agentic-coding");
      expect(prov.models).toContain("bb/fast");
    });
  });

  describe("CLI Standalone Runner", () => {
    it("executes ide-config.ts standalone via tsx runner", () => {
      const runner = path.join(ROOT, "node_modules/.bin/tsx");
      const script = path.join(
        ROOT,
        "plugins/cruise/skills/setup/scripts/ide-config.ts"
      );

      const stdout = execFileSync(
        runner,
        [
          script,
          "--settings-path",
          tempIdeSettingsPath,
          "--base-url",
          "https://cruise.bytesbrains.net",
        ],
        { encoding: "utf-8" }
      );

      expect(stdout).toContain("Successfully configured Antigravity IDE custom provider");
      expect(fs.existsSync(tempIdeSettingsPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(tempIdeSettingsPath, "utf-8"));
      expect(saved["antigravity.ai.customProviders"][0].name).toBe("BytesBrains Cruise");
    });
  });
});
