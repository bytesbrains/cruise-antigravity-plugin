export interface SetupWizardOptions {
  apiKey?: string;
  baseUrl?: string;
  settingsPath?: string;
  ideSettingsPath?: string;
  configureIde?: boolean;
  model?: string;
  skipProbe?: boolean;
  nonInteractive?: boolean;
  fetchFn?: typeof fetch;
}

export interface ProbeResult {
  ok: boolean;
  status: number;
  message: string;
  models?: string[];
}

export interface SettingsUpdateResult {
  updated: boolean;
  path: string;
  settings: Record<string, unknown>;
}

export interface ShellGuidanceResult {
  shellFile: string;
  exportCommand: string;
  reloadCommand: string;
  instructions: string;
}

export interface SetupWizardResult {
  success: boolean;
  message: string;
  baseUrl: string;
  settingsPath: string;
  ideSettingsPath?: string;
  models?: string[];
}

export const DEFAULT_BASE_URL = "https://cruise.bytesbrains.net";
export const DEFAULT_MODEL = "bb/agentic-coding";
