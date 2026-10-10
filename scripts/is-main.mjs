import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// URL pathnames have /C:/ prefixes and encoded spaces on Windows.
// Convert both sides to filesystem paths before comparing the CLI entry.
export function isMain(moduleUrl, entry = process.argv[1]) {
  return Boolean(entry) && resolve(entry) === fileURLToPath(moduleUrl);
}
