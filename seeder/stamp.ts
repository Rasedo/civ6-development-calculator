/**
 * THE GENERATOR STAMP — which source produced a world set.
 *
 * Hashes every `.ts` under `world/` and `seeder/` (the full transitive
 * surface a world file can depend on — the seeder may import nothing else)
 * PLUS the generator parameters, so a materially different world set can
 * never carry an identical stamp. The old stamp hashed `seeder/**` alone and
 * under-covered by an order of magnitude; the compiled-planes stamp (which
 * must cover `cpu/data/**`) lives in `cpu/export/stamp.ts`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join as pathJoin, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SELF = 'stamp.ts';

/** Every source file under the given repo-relative roots, sorted. */
export function stampedFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'worlds' && e.name !== 'node_modules') walk(pathJoin(dir, e.name));
      } else if (e.name.endsWith('.ts') && !(e.name === SELF && dir.endsWith('seeder'))) {
        out.push(pathJoin(dir, e.name));
      }
    }
  };
  for (const r of roots) walk(pathJoin(ROOT, r));
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** sha256 over (relative path, bytes) of the named roots plus `params`. */
export function sourceStampOver(roots: string[], params: unknown): string {
  const h = createHash('sha256');
  for (const f of stampedFiles(roots)) {
    h.update(relative(ROOT, f).split(sep).join('/'));
    h.update(readFileSync(f));
  }
  h.update(JSON.stringify(params));
  return h.digest('hex');
}

/** The world-generator stamp: world/ + seeder/ sources + the run's params. */
export function genStamp(params: unknown): string {
  return sourceStampOver(['world', 'seeder'], params);
}
