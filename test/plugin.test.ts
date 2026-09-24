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

  it("plugins/cruise/mcp_config.json defines remote MCP serverUrl", () => {
    const mcpConfigPath = path.join(ROOT, "plugins/cruise/mcp_config.json");
    expect(fs.existsSync(mcpConfigPath)).toBe(true);

    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    expect(mcpConfig.mcpServers).toBeDefined();
    expect(mcpConfig.mcpServers.cruise).toBeDefined();
    expect(mcpConfig.mcpServers.cruise.serverUrl).toBe(
      "https://cruise.bytesbrains.net/mcp/sse"
    );
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
});
