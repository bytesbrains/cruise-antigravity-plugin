import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { normalizeBaseUrl } from "./setup.js";

export interface IdeCustomProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  [key: string]: unknown;
}

export interface IdeSettings {
  "antigravity.ai.customProviders"?: IdeCustomProvider[];
  [key: string]: unknown;
}

export type IdeSettingsScope = "global" | "workspace" | "vscode";

export interface IdeSettingsOptions {
  settingsPath?: string;
  targetScope?: IdeSettingsScope;
  workspaceRoot?: string;
  baseUrl?: string;
  apiKey?: string;
  name?: string;
  models?: string[];
}

export interface IdeSettingsUpdateResult {
  updated: boolean;
  path: string;
  provider: IdeCustomProvider;
  settings: IdeSettings;
}

export const DEFAULT_CRUISE_PROVIDER_NAME = "BytesBrains Cruise";
export const DEFAULT_IDE_MODELS = [
  "bb/agentic-coding",
  "bb/chat-assistant",
  "bb/extraction",
  "bb/fast",
];
export const DEFAULT_IDE_API_KEY = "${env:CRUISE_API_KEY}";

/**
 * Resolves the absolute path to the target IDE settings.json file.
 */
export function resolveIdeSettingsPath(options?: IdeSettingsOptions): string {
  if (options?.settingsPath && options.settingsPath.trim().length > 0) {
    return path.resolve(options.settingsPath.trim());
  }

  const root = options?.workspaceRoot || process.cwd();

  switch (options?.targetScope) {
    case "workspace":
      return path.join(root, ".gemini", "settings.json");
    case "vscode":
      return path.join(root, ".vscode", "settings.json");
    case "global":
    default:
      return path.join(os.homedir(), ".gemini", "settings.json");
  }
}

/**
 * Constructs an Antigravity IDE custom provider definition for BytesBrains Cruise.
 */
export function createCruiseCustomProvider(
  options?: Partial<IdeCustomProvider>
): IdeCustomProvider {
  const normBase = normalizeBaseUrl(options?.baseUrl);
  const baseUrlWithV1 = `${normBase}/v1`;

  const models =
    options?.models && options.models.length > 0
      ? [...options.models]
      : [...DEFAULT_IDE_MODELS];

  return {
    name: options?.name?.trim() || DEFAULT_CRUISE_PROVIDER_NAME,
    baseUrl: baseUrlWithV1,
    apiKey: options?.apiKey?.trim() || DEFAULT_IDE_API_KEY,
    models,
  };
}

/**
 * Validates settings object against Antigravity IDE custom provider schema.
 */
export function validateIdeSettings(settings: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { valid: false, errors: ["Settings root must be a JSON object."] };
  }

  const s = settings as Record<string, unknown>;
  const providers = s["antigravity.ai.customProviders"];

  if (providers !== undefined) {
    if (!Array.isArray(providers)) {
      errors.push("'antigravity.ai.customProviders' must be an array.");
    } else {
      providers.forEach((prov, idx) => {
        if (!prov || typeof prov !== "object" || Array.isArray(prov)) {
          errors.push(`Provider at index ${idx} must be an object.`);
          return;
        }

        const p = prov as Record<string, unknown>;
        if (typeof p.name !== "string" || p.name.trim().length === 0) {
          errors.push(`Provider at index ${idx} requires a non-empty 'name' string.`);
        }

        if (typeof p.baseUrl !== "string" || !/^https?:\/\/.+/.test(p.baseUrl.trim())) {
          errors.push(
            `Provider at index ${idx} requires a valid http/https 'baseUrl' string.`
          );
        }

        if (typeof p.apiKey !== "string" || p.apiKey.trim().length === 0) {
          errors.push(`Provider at index ${idx} requires a non-empty 'apiKey' string.`);
        }

        if (
          !Array.isArray(p.models) ||
          p.models.length === 0 ||
          p.models.some((m) => typeof m !== "string" || m.trim().length === 0)
        ) {
          errors.push(
            `Provider at index ${idx} requires a non-empty array of model strings.`
          );
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Updates Antigravity IDE settings non-destructively, registering or updating
 * the BytesBrains Cruise custom provider and its virtual lanes.
 */
export function updateIdeSettings(options?: IdeSettingsOptions): IdeSettingsUpdateResult {
  const targetPath = resolveIdeSettingsPath(options);
  const parentDir = path.dirname(targetPath);

  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  let existingSettings: IdeSettings = {};
  if (fs.existsSync(targetPath)) {
    const raw = fs.readFileSync(targetPath, "utf-8");
    if (raw.trim().length > 0) {
      try {
        existingSettings = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Failed to parse existing IDE settings at ${targetPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  const cruiseProvider = createCruiseCustomProvider({
    name: options?.name,
    baseUrl: options?.baseUrl,
    apiKey: options?.apiKey,
    models: options?.models,
  });

  const existingProviders = Array.isArray(existingSettings["antigravity.ai.customProviders"])
    ? [...existingSettings["antigravity.ai.customProviders"]]
    : [];

  const existingIndex = existingProviders.findIndex(
    (p) => p && typeof p === "object" && p.name === cruiseProvider.name
  );

  if (existingIndex >= 0) {
    existingProviders[existingIndex] = {
      ...existingProviders[existingIndex],
      ...cruiseProvider,
    };
  } else {
    existingProviders.push(cruiseProvider);
  }

  const updatedSettings: IdeSettings = {
    ...existingSettings,
    "antigravity.ai.customProviders": existingProviders,
  };

  const validation = validateIdeSettings(updatedSettings);
  if (!validation.valid) {
    throw new Error(`Invalid IDE configuration: ${validation.errors.join("; ")}`);
  }

  fs.writeFileSync(targetPath, JSON.stringify(updatedSettings, null, 2) + "\n", "utf-8");

  return {
    updated: true,
    path: targetPath,
    provider: cruiseProvider,
    settings: updatedSettings,
  };
}

// Standalone execution runner
const isDirectExecution = (): boolean => {
  try {
    if (process.argv[1]) {
      const currentFilePath = fileURLToPath(import.meta.url);
      return path.resolve(process.argv[1]) === path.resolve(currentFilePath);
    }
  } catch {
    return false;
  }
  return false;
};

if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const options: IdeSettingsOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--settings-path" && args[i + 1]) {
      options.settingsPath = args[++i];
    } else if (args[i] === "--workspace") {
      options.targetScope = "workspace";
    } else if (args[i] === "--vscode") {
      options.targetScope = "vscode";
    } else if (args[i] === "--global") {
      options.targetScope = "global";
    } else if (args[i] === "--base-url" && args[i + 1]) {
      options.baseUrl = args[++i];
    } else if (args[i] === "--api-key" && args[i + 1]) {
      options.apiKey = args[++i];
    } else if (args[i] === "--name" && args[i + 1]) {
      options.name = args[++i];
    } else if (args[i] === "--models" && args[i + 1]) {
      options.models = args[++i].split(",").map((m) => m.trim()).filter(Boolean);
    }
  }

  try {
    const res = updateIdeSettings(options);
    console.log(`✅ Successfully configured Antigravity IDE custom provider in ${res.path}`);
    console.log(`   Provider: ${res.provider.name}`);
    console.log(`   Endpoint: ${res.provider.baseUrl}`);
    console.log(`   Models: ${res.provider.models.join(", ")}`);
  } catch (err) {
    console.error(`❌ Error configuring IDE settings: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
