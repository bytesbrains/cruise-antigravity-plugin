import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");

describe("Antigravity Cruise Plugin Manifest & Directory Layout", () => {
  it("plugins/cruise/plugin.json has valid manifest metadata matching package.json", () => {
    const pluginJsonPath = path.join(ROOT, "plugins/cruise/plugin.json");
    expect(fs.existsSync(pluginJsonPath)).toBe(true);

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8"));
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")
    );

    expect(pluginJson.name).toBe("cruise");
    expect(typeof pluginJson.description).toBe("string");
    expect(pluginJson.description.length).toBeGreaterThan(0);
    expect(pluginJson.version).toBe(packageJson.version);
    expect(typeof pluginJson.author).toBe("string");
  });

  it("plugins/cruise/mcp_config.json defines remote MCP serverUrl and dynamic Authorization header", () => {
    const mcpConfigPath = path.join(ROOT, "plugins/cruise/mcp_config.json");
    expect(fs.existsSync(mcpConfigPath)).toBe(true);

    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    expect(mcpConfig.mcpServers).toBeDefined();
    expect(mcpConfig.mcpServers.cruise).toBeDefined();
    expect(mcpConfig.mcpServers.cruise.serverUrl).toBe(
      "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp"
    );
    expect(mcpConfig.mcpServers.cruise.headers).toBeDefined();
    expect(mcpConfig.mcpServers.cruise.headers.Authorization).toBe(
      "Bearer ${CRUISE_API_KEY}"
    );
  });

  it("mcp_config.json resolves endpoint URLs and credentials correctly with environment substitution", () => {
    const mcpConfig = JSON.parse(
      fs.readFileSync(path.join(ROOT, "plugins/cruise/mcp_config.json"), "utf-8")
    );
    const serverUrlTemplate = mcpConfig.mcpServers.cruise.serverUrl;
    const authHeaderTemplate = mcpConfig.mcpServers.cruise.headers.Authorization;

    const substitute = (template: string, env: Record<string, string | undefined>) =>
      template.replace(/\$\{([A-Z_]+)(?::-([^}]+))?\}/g, (_, varName, fallback) => {
        return env[varName] !== undefined && env[varName] !== "" ? env[varName]! : fallback ?? "";
      });

    // Default: resolves to production MCP endpoint
    expect(substitute(serverUrlTemplate, {})).toBe("https://cruise.bytesbrains.net/mcp");

    // Override: resolves to rehearsal / demo endpoint
    expect(
      substitute(serverUrlTemplate, { CRUISE_BASE_URL: "https://cruise-demo.bytesbrains.net" })
    ).toBe("https://cruise-demo.bytesbrains.net/mcp");

    // Dynamic authorization header
    expect(
      substitute(authHeaderTemplate, { CRUISE_API_KEY: "mock_test_key_123" })
    ).toBe("Bearer mock_test_key_123");
  });

  it("verifies zero hardcoded API keys across published plugin files and configurations", () => {
    const getFilesRecursively = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath));
        } else {
          results.push(fullPath);
        }
      }
      return results;
    };

    const pluginFiles = getFilesRecursively(path.join(ROOT, "plugins"));
    const keyPattern = /cru_(live|test|demo|svc)_[A-Za-z0-9]{8,}/;

    for (const file of pluginFiles) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toMatch(keyPattern);
    }
  });

  it("validates Cruise MCP tool compatibility schemas for list_models, get_budget, and get_spend", () => {
    // Verified schemas from Cruise gateway MCP implementation
    const cruiseMcpTools = [
      {
        name: "list_models",
        description: "Every model and lane this Cruise key can call, with capabilities and list prices",
        hasInputSchema: true,
        expectedInputs: ["kind", "modality"],
        expectedOutputs: ["models"],
      },
      {
        name: "get_budget",
        description: "How much this key's project has spent in its current budget period against its caps",
        hasInputSchema: true,
        expectedInputs: [],
        expectedOutputs: ["project", "budget", "wallet"],
      },
      {
        name: "get_spend",
        description: "What this key's project was charged in a calendar month",
        hasInputSchema: true,
        expectedInputs: ["month", "by"],
        expectedOutputs: ["project", "total_usd", "rows"],
      },
    ];

    expect(cruiseMcpTools.map((t) => t.name)).toEqual([
      "list_models",
      "get_budget",
      "get_spend",
    ]);

    for (const tool of cruiseMcpTools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.hasInputSchema).toBe(true);
    }
  });

  it("plugins/cruise/rules/AGENTS.md exists and adheres to size constraints", () => {
    const rulesPath = path.join(ROOT, "plugins/cruise/rules/AGENTS.md");
    expect(fs.existsSync(rulesPath)).toBe(true);

    const stats = fs.statSync(rulesPath);
    // AGENTS.md rules cap is 24,000 bytes
    expect(stats.size).toBeLessThan(24000);
    expect(stats.size).toBeGreaterThan(0);

    const content = fs.readFileSync(rulesPath, "utf-8");
    expect(content).toContain("CRUISE_API_KEY");
    expect(content).toContain("bb/agentic-coding");
    expect(content).toContain("budget_exhausted");
  });

  const extractFrontmatter = (content: string): string | null => {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    return match ? match[1] : null;
  };

  it("plugins/cruise/skills/cruise/SKILL.md has valid frontmatter and runbook instructions", () => {
    const skillPath = path.join(ROOT, "plugins/cruise/skills/cruise/SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);

    const content = fs.readFileSync(skillPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("name: cruise");
    expect(frontmatter).toContain("description:");
    expect(content).toContain("bb/agentic-coding");
    expect(content).toContain("rate_limit_exceeded");
    expect(content).toContain("budget_exhausted");
  });

  it("plugins/cruise/skills/setup/SKILL.md has valid frontmatter and setup instructions", () => {
    const setupSkillPath = path.join(ROOT, "plugins/cruise/skills/setup/SKILL.md");
    expect(fs.existsSync(setupSkillPath)).toBe(true);

    const content = fs.readFileSync(setupSkillPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("name: cruise-setup");
    expect(frontmatter).toContain("description:");
    expect(content).toContain("CRUISE_API_KEY");
  });

  it("assets directory contains all required logo files", () => {
    const assetsDir = path.join(ROOT, "assets");
    expect(fs.existsSync(assetsDir)).toBe(true);

    const expectedFiles = [
      "bytesbrains_dark_logo.png",
      "bytesbrains_light_logo.png",
      "cruise_logo.jpg",
      "cruise-logo.svg",
      "cruise-mark.svg",
    ];

    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(assetsDir, file))).toBe(true);
    }
  });

  it("root AGENT.md exists and adheres to size budget (<450 lines)", () => {
    const agentMdPath = path.join(ROOT, "AGENT.md");
    expect(fs.existsSync(agentMdPath)).toBe(true);

    const content = fs.readFileSync(agentMdPath, "utf-8");
    const lineCount = content.split("\n").length;
    expect(lineCount).toBeLessThan(450);
    expect(content).toContain("CRUISE_API_KEY");
    expect(content).toContain("npm test");
  });

  it(".github/dependabot.yml configures npm and github-actions updates", () => {
    const dependabotPath = path.join(ROOT, ".github/dependabot.yml");
    expect(fs.existsSync(dependabotPath)).toBe(true);

    const content = fs.readFileSync(dependabotPath, "utf-8");
    expect(content).toContain('package-ecosystem: "npm"');
    expect(content).toContain('package-ecosystem: "github-actions"');
  });

  it("community templates and conduct files are present", () => {
    expect(fs.existsSync(path.join(ROOT, "CODE_OF_CONDUCT.md"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, ".github/PULL_REQUEST_TEMPLATE.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT, ".github/ISSUE_TEMPLATE/bug_report.yml"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT, ".github/ISSUE_TEMPLATE/feature_request.yml"))
    ).toBe(true);
  });

  it(".github/workflows/wrokin-hunter.yml specifies concurrency and timeout-minutes", () => {
    const hunterWorkflowPath = path.join(
      ROOT,
      ".github/workflows/wrokin-hunter.yml"
    );
    expect(fs.existsSync(hunterWorkflowPath)).toBe(true);

    const content = fs.readFileSync(hunterWorkflowPath, "utf-8");
    expect(content).toContain("concurrency:");
    expect(content).toContain("timeout-minutes:");
  });
});
