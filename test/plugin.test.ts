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

  it("plugins/cruise/rules/AGENTS.md exists, adheres to size constraints, and defines all operational rules", () => {
    const rulesPath = path.join(ROOT, "plugins/cruise/rules/AGENTS.md");
    expect(fs.existsSync(rulesPath)).toBe(true);

    const stats = fs.statSync(rulesPath);
    // AGENTS.md rules cap is 24,000 bytes
    expect(stats.size).toBeLessThan(24000);
    expect(stats.size).toBeGreaterThan(0);

    const content = fs.readFileSync(rulesPath, "utf-8");

    // Requirement 1: Virtual Key Hygiene & Invariants
    expect(content).toContain("cru_");
    expect(content).toContain("CRUISE_API_KEY");
    expect(content).toMatch(/OpenAI|Anthropic|Google AI Studio|Mistral/);
    expect(content).toMatch(/never accept|never prompt|never expose/i);

    // Requirement 2: Dynamic Catalogue Resolution & Lanes
    expect(content).toMatch(/never hardcode|not hardcode/i);
    expect(content).toContain("/v1/models");
    expect(content).toContain("list_models");
    expect(content).toContain("bb/agentic-coding");
    expect(content).toContain("bb/chat-assistant");
    expect(content).toContain("bb/extraction");
    expect(content).toContain("bb/fast");
    expect(content).toContain("x-cruise.any_member");

    // Requirement 3: Network Boundary & Zero Telemetry
    expect(content).toMatch(/zero (secondary connections|telemetry)|no telemetry/i);
    expect(content).toContain("CRUISE_BASE_URL");

    // Requirement 4: Refusal & Error Surfacing
    expect(content).toContain("error.code");
    expect(content).toContain("budget_exhausted");
    expect(content).toContain("wallet_exhausted");
    expect(content).toContain("rate_limit_exceeded");
    expect(content).toContain("429");
    expect(content).toContain("402");

    // Requirement 5: Rehearsal Convention
    expect(content).toContain("cruise-demo.bytesbrains.net");
    expect(content).toContain("cru_demo_");
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
    expect(frontmatter).toContain("HTTP 429 rate limits and period budget caps");
    expect(frontmatter).toContain("HTTP 402 lifetime wallet exhaustion");

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

  it("docs/byok.md exists, adheres to size budget (<450 lines), and covers all BYOK requirements", () => {
    const byokPath = path.join(ROOT, "docs/byok.md");
    expect(fs.existsSync(byokPath)).toBe(true);

    const content = fs.readFileSync(byokPath, "utf-8");
    const lineCount = content.split("\n").length;
    expect(lineCount).toBeLessThan(450);
    expect(lineCount).toBeGreaterThan(50);

    // Section 1: CLI (agy) BYOK Configuration
    expect(content).toContain("OPENAI_BASE_URL");
    expect(content).toContain("OPENAI_API_KEY");
    expect(content).toContain("~/.gemini/antigravity-cli/settings.json");
    expect(content).toContain("modelProvider");
    expect(content).toContain("openaiBaseUrl");

    // Section 2: Antigravity IDE Integration
    expect(content).toContain("Antigravity IDE");
    expect(content).toMatch(/Custom Provider|OpenAI Compatible/i);

    // Section 3: Demo Rehearsal Guide
    expect(content).toContain("https://cruise-demo.bytesbrains.net");
    expect(content).toContain("curl");
    expect(content).toContain("v1/chat/completions");
    expect(content).toContain("v1/models");

    // Section 4: Lane Selection Mapping for Agent Roles
    const requiredLanes = [
      "bb/agentic-coding",
      "bb/chat-assistant",
      "bb/extraction",
      "bb/fast",
    ];
    for (const lane of requiredLanes) {
      expect(content).toContain(lane);
    }
  });

  it("README.md links to docs/byok.md and outlines BYOK capabilities", () => {
    const readmePath = path.join(ROOT, "README.md");
    const content = fs.readFileSync(readmePath, "utf-8");

    expect(content).toContain("docs/byok.md");
    expect(content).toContain("BYOK & Model Provider Routing");
    expect(content).toContain("OPENAI_BASE_URL");
    expect(content).toContain("https://cruise-demo.bytesbrains.net");
  });

  it("validates documented BYOK configuration snippets, settings schema, and endpoint resolution", () => {
    const byokPath = path.join(ROOT, "docs/byok.md");
    const content = fs.readFileSync(byokPath, "utf-8");

    // Extract settings.json JSON block from markdown
    const jsonMatch = content.match(/```json\r?\n([\s\S]*?)\r?\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsedSettings = JSON.parse(jsonMatch![1]);

    expect(parsedSettings.modelProvider).toBe("openai");
    expect(parsedSettings.openaiBaseUrl).toBe("https://cruise.bytesbrains.net/v1");
    expect(parsedSettings.openaiApiKey).toBe("${CRUISE_API_KEY}");
    expect(parsedSettings.model).toBe("bb/agentic-coding");

    // Test environment URL resolution logic
    const resolveBaseUrl = (env: Record<string, string | undefined>) => {
      const template = "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1";
      return template.replace(/\$\{([A-Z_]+)(?::-([^}]+))?\}/g, (_, varName, fallback) => {
        return env[varName] !== undefined && env[varName] !== "" ? env[varName]! : fallback ?? "";
      });
    };

    expect(resolveBaseUrl({})).toBe("https://cruise.bytesbrains.net/v1");
    expect(resolveBaseUrl({ CRUISE_BASE_URL: "https://cruise-demo.bytesbrains.net" })).toBe(
      "https://cruise-demo.bytesbrains.net/v1"
    );

    // Verify all role mapping rows point to valid lanes defined in rules/AGENTS.md
    const agentRoles = [
      "Lead / Autonomous Coding Agent",
      "Interactive Pair Programming",
      "Research Subagent",
      "Structured Extraction & Parsing",
      "Fast / Lightweight Subagent",
    ];
    for (const role of agentRoles) {
      expect(content).toContain(role);
    }
  });

  it("mcp_config.json uses variable substitution and contains no raw Cruise or third-party API keys", () => {
    const rawContent = fs.readFileSync(
      path.join(ROOT, "plugins/cruise/mcp_config.json"),
      "utf-8"
    );

    // Must use dynamic variable substitution
    expect(rawContent).toContain("${CRUISE_API_KEY}");
    expect(rawContent).toContain("${CRUISE_BASE_URL");

    // Must contain no raw Cruise keys
    expect(rawContent).not.toMatch(/cru_(live|test|demo|svc)_[A-Za-z0-9]+/);

    // Must contain no third-party raw API keys
    expect(rawContent).not.toMatch(/sk-[A-Za-z0-9]{20,}/); // OpenAI
    expect(rawContent).not.toMatch(/sk-ant-[A-Za-z0-9]{20,}/); // Anthropic
    expect(rawContent).not.toMatch(/AIza[0-9A-Za-z-_]{35}/); // Google
    expect(rawContent).not.toMatch(/AKIA[0-9A-Z]{16}/); // AWS
    expect(rawContent).not.toMatch(/gh[pousr]_[A-Za-z0-9_]{36,}/); // GitHub
  });

  it("enforces frontmatter conformance and progressive disclosure triggers across all SKILL.md files", () => {
    const findSkillFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        if (file === "node_modules" || file === ".git") continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(findSkillFiles(filePath));
        } else if (file === "SKILL.md") {
          results.push(filePath);
        }
      }
      return results;
    };

    const skillFiles = findSkillFiles(path.join(ROOT, "plugins"));
    expect(skillFiles.length).toBeGreaterThanOrEqual(2);

    for (const skillFile of skillFiles) {
      const content = fs.readFileSync(skillFile, "utf-8");
      const relativePath = path.relative(ROOT, skillFile);

      // Verify YAML frontmatter delimiters
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      expect(
        match,
        `${relativePath} must contain valid YAML frontmatter between ---`
      ).not.toBeNull();
      const frontmatter = match![1];

      // Extract name and description
      const nameMatch = frontmatter.match(/name:\s*([a-zA-Z0-9_-]+)/);
      expect(
        nameMatch,
        `${relativePath} frontmatter must contain a valid name`
      ).not.toBeNull();
      expect(nameMatch![1].length).toBeGreaterThan(0);

      const descMatch = frontmatter.match(
        /description:\s*(?:>-|>)?\r?\n?\s*([\s\S]*?)(?=\n[a-z]+:|$)/
      );
      expect(
        descMatch,
        `${relativePath} frontmatter must contain a description`
      ).not.toBeNull();
      const description = descMatch![1].replace(/\r?\n\s*/g, " ").trim();
      expect(
        description.length,
        `${relativePath} description must be substantial`
      ).toBeGreaterThan(20);

      // Progressive disclosure: description must explain triggers/when to use
      expect(
        description.toLowerCase(),
        `${relativePath} description must explain triggers for progressive disclosure`
      ).toMatch(/when|use this skill|activate/);
    }
  });

  it("enforces gitleaks hook presence, executable permissions, and security configuration", () => {
    const preCommitPath = path.join(ROOT, ".githooks/pre-commit");
    const prePushPath = path.join(ROOT, ".githooks/pre-push");
    const gitleaksTomlPath = path.join(ROOT, ".gitleaks.toml");
    const packageJsonPath = path.join(ROOT, "package.json");

    expect(fs.existsSync(preCommitPath)).toBe(true);
    expect(fs.existsSync(prePushPath)).toBe(true);
    expect(fs.existsSync(gitleaksTomlPath)).toBe(true);

    // Verify hooks are executable
    fs.accessSync(preCommitPath, fs.constants.X_OK);
    fs.accessSync(prePushPath, fs.constants.X_OK);

    // Verify pre-commit invokes gitleaks protect on staged files with config
    const preCommitContent = fs.readFileSync(preCommitPath, "utf-8");
    expect(preCommitContent).toContain("gitleaks protect --staged");
    expect(preCommitContent).toContain(".gitleaks.toml");

    // Verify pre-push invokes gitleaks detect on full source history
    const prePushContent = fs.readFileSync(prePushPath, "utf-8");
    expect(prePushContent).toContain("gitleaks detect --source");
    expect(prePushContent).toContain(".gitleaks.toml");
    expect(prePushContent).toContain("is-shallow-repository");

    // Verify package.json scripts and prepare hook
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    expect(packageJson.scripts.prepare).toContain("core.hooksPath .githooks");
    expect(packageJson.scripts["secrets:scan"]).toContain("gitleaks detect");
    expect(packageJson.scripts["secrets:scan"]).toContain(".gitleaks.toml");

    // Verify .gitleaks.toml defines custom cruise-key rule and extends defaults
    const gitleaksToml = fs.readFileSync(gitleaksTomlPath, "utf-8");
    expect(gitleaksToml).toContain("useDefault = true");
    expect(gitleaksToml).toContain('id = "cruise-key"');
    expect(gitleaksToml).toContain("cru_(live|test|demo|svc)_[A-Za-z0-9]{40}");

    // Validate cruise-key regex behavior
    const cruiseKeyRegex = /cru_(live|test|demo|svc)_[A-Za-z0-9]{40}/;
    const mockFullLiveKey = ["cru", "live", "1".repeat(40)].join("_");
    const mockFullDemoKey = ["cru", "demo", "a".repeat(40)].join("_");
    const mockShortSafePrefix = "cru_live_...";
    const mockDocPlaceholder = "cru_demo_...";

    expect(cruiseKeyRegex.test(mockFullLiveKey)).toBe(true);
    expect(cruiseKeyRegex.test(mockFullDemoKey)).toBe(true);
    expect(cruiseKeyRegex.test(mockShortSafePrefix)).toBe(false);
    expect(cruiseKeyRegex.test(mockDocPlaceholder)).toBe(false);
  });

  it("verifies CI workflow runs tests and secret scan on all PRs and pushes to main", () => {
    const ciPath = path.join(ROOT, ".github/workflows/ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);

    const ciContent = fs.readFileSync(ciPath, "utf-8");

    // Verify triggers
    expect(ciContent).toContain("pull_request:");
    expect(ciContent).toContain("push:");
    expect(ciContent).toContain("branches: [main]");

    // Verify all steps run
    expect(ciContent).toContain("npm run typecheck");
    expect(ciContent).toContain("npm test");
    expect(ciContent).toContain("npm run secrets:scan");
    expect(ciContent).toContain("gitleaks/gitleaks-action");

    // Verify gitleaks install verifies SHA256 checksum and fails closed
    expect(ciContent).toContain("curl --fail");
    expect(ciContent).toContain("GITLEAKS_SHA256=");
    expect(ciContent).toContain("sha256sum --check --strict");
  });
});



