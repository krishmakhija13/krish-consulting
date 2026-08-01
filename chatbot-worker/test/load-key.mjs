/* Reads GEMINI_API_KEY for the behaviour tests. Test-only — the deployed Worker
   reads its key from Worker secrets and never touches a .env file. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

// Minimal KEY=value reader — no dependency, and no ambiguity about which file
// gets loaded. Tolerates quotes, an `export` prefix, and spaces around `=`.
export function keyFromEnvFile(file) {
  if (!existsSync(file)) return '';
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    return match[1].trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  }
  return '';
}

// An existing environment variable wins over the file.
export function loadKey() {
  return (process.env.GEMINI_API_KEY || keyFromEnvFile(ENV_FILE)).trim();
}
