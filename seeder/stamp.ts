import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join as pathJoin, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SELF = 'stamp.ts';

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

export function sourceStampOver(roots: string[], params: unknown): string {
  const h = createHash('sha256');
  for (const f of stampedFiles(roots)) {
    h.update(relative(ROOT, f).split(sep).join('/'));
    // the working tree's line endings are an accident of autocrlf and of
    // which files a tool rewrote since checkout; the stamp names the SOURCE,
    // so CRLF folds to LF before hashing (a fresh checkout failed the lock)
    h.update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  }
  h.update(JSON.stringify(params));
  return h.digest('hex');
}

export function genStamp(params: unknown): string {
  return sourceStampOver(['world', 'seeder'], params);
}
