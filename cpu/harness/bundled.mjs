/**
 * A TypeScript entry run as one bundle: `node cpu/harness/bundled.mjs <entry.ts> [args...]` runs `entry.ts` as
 * `npx vite-node <entry.ts> [args...]` does, bundled by esbuild at each start (a third of a second) instead of
 * transformed module by module, so it starts in under a second and never runs a stale build. Each module reads its own
 * `import.meta.url`, as under vite-node. The bundle is written beside the system's temporary files and removed at exit.
 *
 *   node cpu/harness/bundled.mjs cpu/harness/run.ts -- <dump.jsonl> --aiscore <out> [--memory aimem] [--from T] [--to T]
 */
import { build } from 'esbuild';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) throw new Error('usage: node cpu/harness/bundled.mjs <entry.ts> [args...]');
const out = join(tmpdir(), `civ6-bundle-${process.pid}-${Date.now()}.mjs`);
await build({
  entryPoints: [resolve(entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: out,
  logLevel: 'warning',
  plugins: [{
    name: 'own-url',
    setup(build) {
      // each module's import.meta.url its own file's, not the bundle's
      build.onLoad({ filter: /\.[cm]?[jt]s$/ }, (a) => {
        const text = readFileSync(a.path, 'utf8');
        if (!text.includes('import.meta.url')) return undefined;
        return { contents: text.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(a.path).href)), loader: a.path.endsWith('.ts') ? 'ts' : 'js' };
      });
    },
  }],
});
process.on('exit', () => {
  try {
    unlinkSync(out);
  } catch {
    // already gone
  }
});
// the entry sees its own arguments, as under vite-node
process.argv.splice(1, 2, resolve(entry));
await import(pathToFileURL(out).href);
