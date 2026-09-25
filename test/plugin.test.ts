import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

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

  it("verifies zero hardcoded API keys across repository files and configurations", () => {
    const getTrackedFiles = (): string[] => {
      try {
        const stdout = execSync("git ls-files", { cwd: ROOT, encoding: "utf-8" });
        return stdout.split("\n").filter((f) => f.length > 0 && !f.startsWith(".git"));
      } catch {
        const results: string[] = [];
        const walk = (dir: string) => {
          for (const item of fs.readdirSync(dir)) {
            if (item === ".git" || item === "node_modules") continue;
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
            else results.push(path.relative(ROOT, fullPath));
          }
        };
        walk(ROOT);
        return results;
      }
    };

    const files = getTrackedFiles();
    const keyPattern = /cru_(live|test|demo|svc)_[A-Za-z0-9]{8,}/;

    for (const relativePath of files) {
      if (
        relativePath.startsWith("assets/") &&
        (relativePath.endsWith(".png") || relativePath.endsWith(".jpg"))
      ) {
        continue;
      }
      const content = fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
      expect(content, `Credential pattern detected in ${relativePath}`).not.toMatch(keyPattern);
    }
  });

  it("validates Cruise MCP server tool compatibility and contract against plugin configuration", () => {
    const mcpConfigPath = path.join(ROOT, "plugins/cruise/mcp_config.json");
    expect(fs.existsSync(mcpConfigPath)).toBe(true);

    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    const server = mcpConfig.mcpServers?.cruise;
    expect(server).toBeDefined();

    // Verify server configuration targets Cruise gateway MCP
    expect(server.serverUrl).toContain("/mcp");
    expect(server.headers?.Authorization).toContain("CRUISE_API_KEY");

    // Verify all 3 Cruise MCP tools are documented and integrated across plugin assets
    const rulesContent = fs.readFileSync(
      path.join(ROOT, "plugins/cruise/rules/AGENTS.md"),
      "utf-8"
    );
    const setupSkillContent = fs.readFileSync(
      path.join(ROOT, "plugins/cruise/skills/setup/SKILL.md"),
      "utf-8"
    );
    const cruiseSkillContent = fs.readFileSync(
      path.join(ROOT, "plugins/cruise/skills/cruise/SKILL.md"),
      "utf-8"
    );

    const requiredTools = ["list_models", "get_budget", "get_spend"];
    for (const tool of requiredTools) {
      expect(
        rulesContent.includes(tool),
        `plugins/cruise/rules/AGENTS.md must document tool ${tool}`
      ).toBe(true);
      expect(
        setupSkillContent.includes(tool),
        `plugins/cruise/skills/setup/SKILL.md must document tool ${tool}`
      ).toBe(true);
    }
    expect(cruiseSkillContent).toContain("list_models");
    expect(cruiseSkillContent).toContain("get_budget");

    // Simulate JSON-RPC 2.0 tool execution request payloads generated for Cruise MCP
    const createMcpRpcRequest = (toolName: string, args: Record<string, unknown> = {}) => {
      const endpoint = server.serverUrl.replace(
        "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}",
        "https://cruise.bytesbrains.net"
      );
      const authHeader = server.headers.Authorization.replace(
        "${CRUISE_API_KEY}",
        "test-token"
      );

      return {
        url: endpoint,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          },
        },
      };
    };

    const listModelsReq = createMcpRpcRequest("list_models", { kind: "lanes" });
    expect(listModelsReq.url).toBe("https://cruise.bytesbrains.net/mcp");
    expect(listModelsReq.headers.Authorization).toBe("Bearer test-token");
    expect(listModelsReq.body.params.name).toBe("list_models");

    const getBudgetReq = createMcpRpcRequest("get_budget");
    expect(getBudgetReq.body.params.name).toBe("get_budget");

    const getSpendReq = createMcpRpcRequest("get_spend", { by: "model" });
    expect(getSpendReq.body.params.name).toBe("get_spend");
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

  it("plugins/cruise/skills/cruise/SKILL.md has valid frontmatter, lane runbooks, refusal diagnostics, and capability checks", () => {
    const skillPath = path.join(ROOT, "plugins/cruise/skills/cruise/SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);

    const content = fs.readFileSync(skillPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("name: cruise");
    expect(frontmatter).toContain("description:");

    // Verify all four core routing lanes
    expect(content).toContain("bb/agentic-coding");
    expect(content).toContain("bb/chat-assistant");
    expect(content).toContain("bb/extraction");
    expect(content).toContain("bb/fast");

    // Verify refusal diagnostics distinguishing period cap, lifetime wallet, and rate limits
    expect(content).toContain("budget_exhausted");
    expect(content).toContain("wallet_exhausted");
    expect(content).toContain("rate_limit_exceeded");
    expect(content).toContain("429");
    expect(content).toContain("402");
    expect(content).toContain("Retry-After");

    // Verify inspection of x-cruise.any_member for capabilities
    expect(content).toContain("x-cruise.any_member");
    expect(content).toContain("x-cruise.any_member.tools");
    expect(content).toContain("x-cruise.any_member.streaming");
  });

  it("plugins/cruise/skills/setup/SKILL.md has valid frontmatter, interactive onboarding, demo rehearsal, and safety invariants", () => {
    const setupSkillPath = path.join(ROOT, "plugins/cruise/skills/setup/SKILL.md");
    expect(fs.existsSync(setupSkillPath)).toBe(true);

    const content = fs.readFileSync(setupSkillPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("name: cruise-setup");
    expect(frontmatter).toContain("description:");

    // Verify interactive onboarding and safe environment check
    expect(content).toContain('test -n "$CRUISE_API_KEY"');
    expect(content).toContain("CRUISE_API_KEY");
    expect(content).toContain("CRUISE_BASE_URL");

    // Verify rehearsal demo verification check before live usage
    expect(content).toContain("https://cruise-demo.bytesbrains.net");
    expect(content).toContain("cru_demo_");
    expect(content).toContain("cru_live_");

    // Verify credential security and zero-persistence rules
    expect(content).toMatch(/never write|never persist|zero credential persistence/i);

    // Verify MCP tool checks and troubleshooting guidance
    expect(content).toContain("list_models");
    expect(content).toContain("get_budget");
    expect(content).toContain("get_spend");
    expect(content).toContain("401");
    expect(content).toContain("403");

    // Verify paths referenced in setup skill resolve to existing repository files
    const referencedMcpConfig = path.join(ROOT, "plugins/cruise/mcp_config.json");
    expect(fs.existsSync(referencedMcpConfig)).toBe(true);

    // Verify consistency of all 4 lanes between skills and AGENTS.md rules
    const rulesContent = fs.readFileSync(
      path.join(ROOT, "plugins/cruise/rules/AGENTS.md"),
      "utf-8"
    );
    const lanes = [
      "bb/agentic-coding",
      "bb/chat-assistant",
      "bb/extraction",
      "bb/fast",
    ];
    for (const lane of lanes) {
      expect(content).toContain(lane);
      expect(rulesContent).toContain(lane);
    }
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
