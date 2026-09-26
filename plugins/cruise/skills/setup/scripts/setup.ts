import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import {
  type SetupWizardOptions,
  type ProbeResult,
  type SettingsUpdateResult,
  type ShellGuidanceResult,
  type SetupWizardResult,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} from "./types.js";

export {
  type SetupWizardOptions,
  type ProbeResult,
  type SettingsUpdateResult,
  type ShellGuidanceResult,
  type SetupWizardResult,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
};

import { updateIdeSettings } from "./ide-config.js";

export {
  updateIdeSettings,
  createCruiseCustomProvider,
  validateIdeSettings,
  resolveIdeSettingsPath,
  type IdeCustomProvider,
  type IdeSettings,
  type IdeSettingsOptions,
  type IdeSettingsUpdateResult,
} from "./ide-config.js";

/**
 * Normalizes and validates the Cruise Base URL.
 * Strips trailing slashes, removes trailing /v1 if entered, and ensures protocol.
 */
export function normalizeBaseUrl(rawUrl?: string): string {
  if (!rawUrl || rawUrl.trim().length === 0) return DEFAULT_BASE_URL;

  let cleaned = rawUrl.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/v1")) {
    cleaned = cleaned.slice(0, -3).replace(/\/+$/, "");
  }

  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    const isLocal = cleaned.startsWith("localhost") || cleaned.startsWith("127.0.0.1");
    cleaned = `${isLocal ? "http" : "https"}://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    throw new Error(`Invalid Cruise Base URL: "${rawUrl}"`);
  }
}

/**
 * Validates the syntax of a Cruise API key.
 * Enforces key prefix conventions (cru_live_, cru_demo_, cru_test_, cru_svc_)
 * and detects accidental vendor keys.
 */
export function validateApiKeyFormat(key?: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return { valid: false, error: "Cruise API key cannot be empty." };
  }

  const trimmed = key.trim();

  // Check for common upstream vendor keys
  if (trimmed.startsWith("sk-ant-") || trimmed.startsWith("sk-")) {
    return {
      valid: false,
      error: "Vendor API key detected. Cruise only accepts Cruise-issued virtual keys (cru_live_... or cru_demo_...). Upstream provider keys are managed centrally by the Cruise gateway.",
    };
  }

  if (trimmed.startsWith("AIza") || trimmed.startsWith("ghp_")) {
    return {
      valid: false,
      error: "Non-Cruise credentials provided. Please provide a Cruise virtual key starting with cru_live_ or cru_demo_.",
    };
  }

  const validPrefixes = ["cru_live_", "cru_demo_", "cru_test_", "cru_svc_"];
  const hasValidPrefix = validPrefixes.some((prefix) => trimmed.startsWith(prefix));

  if (!hasValidPrefix) {
    return {
      valid: false,
      error: "Invalid Cruise API key format. Key must begin with cru_live_ (production) or cru_demo_ (free rehearsal).",
    };
  }

  if (trimmed.length < 12) {
    return {
      valid: false,
      error: "API key is too short. Please ensure you entered the full virtual key.",
    };
  }

  return { valid: true };
}

/**
 * Sends an authenticated probe to /v1/models to verify credential connectivity.
 */
export async function probeCredentials(
  apiKey: string,
  baseUrl: string,
  options?: { fetchFn?: typeof fetch; timeoutMs?: number }
): Promise<ProbeResult> {
  const fetchImpl = options?.fetchFn || globalThis.fetch;
  const timeoutMs = options?.timeoutMs || 10000;
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const endpoint = `${normalizedUrl}/v1/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.ok) {
      let models: string[] = [];
      try {
        const data = (await response.json()) as { data?: Array<{ id?: string }> };
        if (Array.isArray(data?.data)) {
          models = data.data.map((m) => m.id ?? "").filter(Boolean);
        }
      } catch {
        // Non-JSON or empty response, but HTTP 200 confirmed
      }

      return {
        ok: true,
        status: response.status,
        message: "Credentials successfully validated against Cruise gateway.",
        models,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        status: 401,
        message: "HTTP 401 Unauthorized: Invalid or expired API key. If using a cru_demo_ key, ensure the Base URL points to https://cruise-demo.bytesbrains.net.",
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        message: "HTTP 403 Forbidden: Key does not have permission to access /v1/models or the requested workspace.",
      };
    }

    return {
      ok: false,
      status: response.status,
      message: `HTTP ${response.status}: Model catalogue probe failed.`,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      message: isAbort
        ? `Request timed out connecting to ${endpoint}`
        : `Network error connecting to ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Updates ~/.gemini/antigravity-cli/settings.json safely.
 * Preserves existing settings while configuring modelProvider, openaiBaseUrl,
 * openaiApiKey (as dynamic "${CRUISE_API_KEY}"), and default model.
 */
export function updateCliSettings(options: {
  settingsPath?: string;
  baseUrl?: string;
  model?: string;
}): SettingsUpdateResult {
  const targetPath =
    options.settingsPath ||
    path.join(os.homedir(), ".gemini", "antigravity-cli", "settings.json");
  const parentDir = path.dirname(targetPath);

  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  let existingSettings: Record<string, unknown> = {};
  if (fs.existsSync(targetPath)) {
    try {
      const raw = fs.readFileSync(targetPath, "utf-8");
      if (raw.trim().length > 0) {
        existingSettings = JSON.parse(raw);
      }
    } catch {
      existingSettings = {};
    }
  }

  const normalizedBase = normalizeBaseUrl(options.baseUrl);

  const updatedSettings: Record<string, unknown> = {
    ...existingSettings,
    modelProvider: "openai",
    openaiBaseUrl: `${normalizedBase}/v1`,
    openaiApiKey: "${CRUISE_API_KEY}",
    model: options.model || DEFAULT_MODEL,
  };

  fs.writeFileSync(targetPath, JSON.stringify(updatedSettings, null, 2) + "\n", "utf-8");

  return {
    updated: true,
    path: targetPath,
    settings: updatedSettings,
  };
}

/**
 * Formulates user guidance for exporting CRUISE_API_KEY in shell profile.
 */
export function getShellExportGuidance(apiKey?: string, baseUrl?: string): ShellGuidanceResult {
  const userShell = process.env.SHELL || "";
  const isZsh = userShell.endsWith("zsh");
  const shellFile = isZsh ? "~/.zshrc" : "~/.bashrc";
  const reloadCommand = isZsh ? "source ~/.zshrc" : "source ~/.bashrc";

  const normUrl = normalizeBaseUrl(baseUrl);
  const isCustomUrl = normUrl !== DEFAULT_BASE_URL;

  const keyPlaceholder = apiKey ? `"${apiKey}"` : '"<your-cruise-api-key>"';
  let exportCommand = `export CRUISE_API_KEY=${keyPlaceholder}`;
  if (isCustomUrl) {
    exportCommand += `\nexport CRUISE_BASE_URL="${normUrl}"`;
  }

  const instructions = [
    `To ensure persistent access across all Antigravity CLI sessions, add the following export to ${shellFile}:`,
    "",
    "```sh",
    exportCommand,
    "```",
    "",
    `Then reload your profile by running: \`${reloadCommand}\``,
  ].join("\n");

  return {
    shellFile,
    exportCommand,
    reloadCommand,
    instructions,
  };
}

/**
 * Collects wizard inputs either from supplied options or via interactive readline prompts.
 */
export async function collectSetupInputs(
  options: SetupWizardOptions,
  rl: readline.Interface | null
): Promise<{ apiKey: string; baseUrl: string; model: string }> {
  let baseUrlInput = options.baseUrl;
  if (!baseUrlInput && rl) {
    const prompt = `Enter Cruise Base URL [default: ${DEFAULT_BASE_URL}]: `;
    const answer = await rl.question(prompt);
    baseUrlInput = answer.trim() || DEFAULT_BASE_URL;
  } else if (!baseUrlInput) {
    baseUrlInput = process.env.CRUISE_BASE_URL || DEFAULT_BASE_URL;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrlInput);

  let apiKey = options.apiKey;
  const existingEnvKey = process.env.CRUISE_API_KEY;

  if (!apiKey && rl) {
    if (existingEnvKey) {
      const masked = `${existingEnvKey.slice(0, 10)}...`;
      console.log(`Found CRUISE_API_KEY in environment (${masked}).`);
      const answer = await rl.question("Press Enter to use existing key, or paste a new key: ");
      apiKey = answer.trim() || existingEnvKey;
    } else {
      const answer = await rl.question("Enter your Cruise API key (cru_live_... or cru_demo_...): ");
      apiKey = answer.trim();
    }
  } else if (!apiKey) {
    apiKey = existingEnvKey;
  }

  if (!apiKey) {
    throw new Error("No Cruise API key provided. Setup aborted.");
  }

  const formatCheck = validateApiKeyFormat(apiKey);
  if (!formatCheck.valid) {
    throw new Error(formatCheck.error);
  }

  return {
    apiKey,
    baseUrl: normalizedBaseUrl,
    model: options.model || DEFAULT_MODEL,
  };
}

/**
 * Validates credentials against Cruise gateway with interactive recovery prompts if applicable.
 */
export async function validateAndProbeCredentials(
  apiKey: string,
  baseUrl: string,
  options?: { skipProbe?: boolean; fetchFn?: typeof fetch; rl?: readline.Interface | null }
): Promise<{ validated: boolean; models?: string[]; message: string }> {
  if (options?.skipProbe) {
    return { validated: true, message: "Credential probe skipped by option." };
  }

  console.log(`\nValidating credentials against ${baseUrl}/v1/models...`);
  const probeResult = await probeCredentials(apiKey, baseUrl, {
    fetchFn: options?.fetchFn,
  });

  if (!probeResult.ok) {
    console.error(`\n❌ Validation Failed: ${probeResult.message}`);
    if (options?.rl) {
      const proceed = await options.rl.question(
        "Do you still want to persist this configuration? (y/N): "
      );
      if (proceed.trim().toLowerCase() !== "y") {
        throw new Error(`Credential validation failed: ${probeResult.message}`);
      }
      return { validated: false, message: probeResult.message };
    }
    throw new Error(`Credential validation failed: ${probeResult.message}`);
  }

  console.log("✅ Credentials verified successfully!");
  if (probeResult.models && probeResult.models.length > 0) {
    console.log(`   Available lanes: ${probeResult.models.join(", ")}`);
  }

  return { validated: true, models: probeResult.models, message: probeResult.message };
}

/**
 * Coordinates the full interactive setup wizard workflow.
 */
export async function runInteractiveSetup(
  options: SetupWizardOptions = {}
): Promise<SetupWizardResult> {
  const isInteractive = !options.nonInteractive;
  let rl: readline.Interface | null = null;

  if (isInteractive) {
    rl = readline.createInterface({ input, output });
  }

  try {
    console.log("==================================================");
    console.log("   BytesBrains Cruise — Antigravity Setup Wizard  ");
    console.log("==================================================");
    console.log();

    // 1. Collect and validate inputs
    const inputs = await collectSetupInputs(options, rl);

    // 2. Validate and probe credentials
    const probeOutcome = await validateAndProbeCredentials(inputs.apiKey, inputs.baseUrl, {
      skipProbe: options.skipProbe,
      fetchFn: options.fetchFn,
      rl,
    });

    // 3. Persist CLI settings
    console.log("\nConfiguring Antigravity CLI settings...");
    const settingsResult = updateCliSettings({
      settingsPath: options.settingsPath,
      baseUrl: inputs.baseUrl,
      model: inputs.model,
    });
    console.log(`✅ Settings successfully saved to: ${settingsResult.path}`);

    // 4. Optionally configure Antigravity IDE custom provider
    let ideSettingsPath: string | undefined;
    const shouldConfigureIde =
      options.configureIde === true ||
      Boolean(options.ideSettingsPath) ||
      (isInteractive && (await promptConfigureIde(rl)));

    if (shouldConfigureIde) {
      console.log("\nConfiguring Antigravity IDE custom provider settings...");
      const ideResult = updateIdeSettings({
        settingsPath: options.ideSettingsPath,
        baseUrl: inputs.baseUrl,
        models: probeOutcome.models,
      });
      ideSettingsPath = ideResult.path;
      console.log(`✅ IDE provider successfully registered in: ${ideSettingsPath}`);
    }

    // 5. Output guidance
    console.log("\n--------------------------------------------------");
    console.log("Shell Environment Configuration:");
    console.log("--------------------------------------------------");
    const guidance = getShellExportGuidance(inputs.apiKey, inputs.baseUrl);
    console.log(guidance.instructions);
    console.log("--------------------------------------------------\n");

    return {
      success: true,
      message: "Cruise configuration completed successfully.",
      baseUrl: inputs.baseUrl,
      settingsPath: settingsResult.path,
      ideSettingsPath,
      models: probeOutcome.models,
    };
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

async function promptConfigureIde(rl: readline.Interface | null): Promise<boolean> {
  if (!rl) return false;
  const answer = await rl.question("Configure Antigravity IDE Settings UI custom provider? (Y/n): ");
  return answer.trim().toLowerCase() !== "n";
}

const isDirectExecution = (): boolean => {
  try {
    return Boolean(
      process.argv[1] &&
        path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const options: SetupWizardOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && args[i + 1]) {
      options.apiKey = args[++i];
    } else if (args[i] === "--base-url" && args[i + 1]) {
      options.baseUrl = args[++i];
    } else if (args[i] === "--settings-path" && args[i + 1]) {
      options.settingsPath = args[++i];
    } else if (args[i] === "--ide-path" && args[i + 1]) {
      options.ideSettingsPath = args[++i];
      options.configureIde = true;
    } else if (args[i] === "--ide") {
      options.configureIde = true;
    } else if (args[i] === "--cli-only") {
      options.configureIde = false;
    } else if (args[i] === "--model" && args[i + 1]) {
      options.model = args[++i];
    } else if (args[i] === "--skip-probe") {
      options.skipProbe = true;
    } else if (args[i] === "--non-interactive") {
      options.nonInteractive = true;
    }
  }

  runInteractiveSetup(options).catch((err) => {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  });
}
