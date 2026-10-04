// Bundles the decision-server client (`cpu/driver/serve.ts`) into ONE ESM
// file that a bare `node` runs:
//
//   node cpu/driver/bundle.mjs <out.mjs>
//
// `gpu/serve_gate.py` builds it once per gate process and runs one `node
// <out.mjs>` child per seed. A child is then one node process holding the
// engine and nothing else — no npx shim beside it, no vite server, module
// graph or esbuild service inside it.
//
// Each module's `import.meta.url` is its own SOURCE file's URL, so a module
// that resolves a path against its own location (statecompare.ts reads the
// manifest beside the repo root) reads the same file it reads unbundled.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const out = process.argv[2];
if (!out) {
  console.error('usage: node cpu/driver/bundle.mjs <out.mjs>');
  process.exit(2);
}

const ownUrl = {
  name: 'own-import-meta-url',
  setup(b) {
    b.onLoad({ filter: /\.ts$/ }, async (a) => ({
      contents: (await readFile(a.path, 'utf8')).replaceAll(
        'import.meta.url', JSON.stringify(pathToFileURL(a.path).href)),
      loader: 'ts',
    }));
  },
};

await build({
  entryPoints: [fileURLToPath(new URL('./serve.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'esnext',
  outfile: out,
  logLevel: 'error',
  plugins: [ownUrl],
});
