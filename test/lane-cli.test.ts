import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runLaneDiscovery } from "../plugins/cruise/skills/lane/scripts/lane";

describe("runLaneDiscovery CLI Execution", () => {
  let tempDir: string;
  let tempSettingsPath: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cruise-lane-cli-test-"));
    tempSettingsPath = path.join(tempDir, "antigravity-cli", "settings.json");
    originalFetch = globalThis.fetch;

    // Stub network fetch to prevent external network calls
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network disabled in test suite"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("outputs valid JSON when --json flag is provided without external network", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runLaneDiscovery(["--json"]);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.lanes).toBeDefined();
    expect(parsed.lanes.length).toBeGreaterThanOrEqual(4);
    expect(parsed.isLive).toBe(false);
    expect(parsed.source).toBe("default");

    logSpy.mockRestore();
  });

  it("outputs formatted markdown documentation when --markdown flag is provided", async () => {
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

  it("executes --select workflow and exits process with 1 for unknown lane", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit);

    await expect(runLaneDiscovery(["--select=unknown-lane-xyz"])).rejects.toThrow(
      "process.exit called"
    );

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown lane "unknown-lane-xyz"')
    );

    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("executes --select workflow with recognized lane and custom environment", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runLaneDiscovery(
      ["--select=bb/extraction"],
      { CRUISE_BASE_URL: "https://cruise-demo.bytesbrains.net" } as NodeJS.ProcessEnv,
      tempSettingsPath
    );

    expect(logSpy).toHaveBeenCalledWith('Switched active model to "bb/extraction".');
    expect(fs.existsSync(tempSettingsPath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"));
    expect(saved.model).toBe("bb/extraction");
    expect(saved.openaiBaseUrl).toBe("https://cruise-demo.bytesbrains.net/v1");

    logSpy.mockRestore();
  });
});
