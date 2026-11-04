// Loads .env into process.env. Import first in any script that needs config.
import { readFileSync } from 'node:fs';

try {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined) process.env[key] = value.replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env: rely on the ambient environment.
}
