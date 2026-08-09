// PARSE-CHECK + MODULE BOUNDARY, in one ~300ms pass.
//
// 1. Every .ts under the source roots must PARSE. A parse is not a typecheck,
//    but it catches the class where a mangled file killed a gate with an
//    empty error while tsc, vitest and the fixtures all stayed green.
//
// 2. THE BOUNDARY: `world/` imports nothing
//    but itself and node builtins; `seeder/` imports only itself, `world/`
//    and node builtins. If a seeder symbol needs to know what a tile is
//    WORTH or what a rule DOES, it does not belong there — this check makes
//    that a red X instead of a review comment.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const ROOTS = ['cpu', 'seeder', 'world', 'tools', 'tests'];

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'worlds') yield* walk(join(dir, e.name));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.mjs')) {
      yield join(dir, e.name);
    }
  }
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g;

function boundaryOk(file, spec) {
  const norm = file.split('\\').join('/');
  const inWorld = norm.startsWith('world/');
  const inSeeder = norm.startsWith('seeder/');
  if (!inWorld && !inSeeder) return true;
  if (spec.startsWith('node:')) return true;
  if (!spec.startsWith('.')) return false; // package imports are outside both
  // resolve the specifier's top-level root relative to the importing file
  const parts = norm.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const root = parts[0];
  return inWorld ? root === 'world' : root === 'world' || root === 'seeder';
}

let files = 0;
let bad = 0;
for (const root of ROOTS) {
  for (const p of walk(root)) {
    files += 1;
    const src = readFileSync(p, 'utf8');
    if (p.endsWith('.ts')) {
      try {
        transformSync(src, { loader: 'ts' });
      } catch (e) {
        bad++;
        console.error(`PARSE FAIL ${p}`);
        for (const err of e.errors ?? []) {
          console.error(`  ${err.location?.line}:${err.location?.column} ${err.text}`);
        }
        continue;
      }
    }
    for (const m of src.matchAll(IMPORT_RE)) {
      if (!boundaryOk(p, m[1])) {
        bad++;
        console.error(`BOUNDARY FAIL ${p}: imports '${m[1]}' — world/ imports only world/+node; seeder/ only seeder/+world/+node`);
      }
    }
  }
}
if (bad > 0) {
  console.error(`${bad} failure(s)`);
  process.exit(1);
}
console.log(`parse-check OK — ${files} files parse; world/ and seeder/ respect the module boundary`);
