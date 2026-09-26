import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Checks whether the current module is being executed directly via CLI.
 */
export function isDirectExecution(importMetaUrl: string): boolean {
  try {
    return Boolean(
      process.argv[1] &&
        path.resolve(process.argv[1]) === path.resolve(fileURLToPath(importMetaUrl))
    );
  } catch {
    return false;
  }
}
