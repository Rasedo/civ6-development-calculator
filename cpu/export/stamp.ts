import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join as pathJoin, relative, sep } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(pathJoin(dir, e.name), out);
    } else if (e.name.endsWith('.ts')) {
      out.push(pathJoin(dir, e.name));
    }
  }
}

export function exportStamp(params: unknown): string {
  const files: string[] = [];
  for (const r of ['cpu', 'world']) walk(pathJoin(ROOT, r), files);
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(ROOT, f).split(sep).join('/'));
    h.update(readFileSync(f));
  }
  h.update(JSON.stringify(params));
  return h.digest('hex');
}
