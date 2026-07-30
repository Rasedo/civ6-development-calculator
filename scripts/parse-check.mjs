// #51/S1.3i: PARSE-CHECK every file in scripts/.
//
// Most of scripts/ cannot be typechecked (`@types/node` is not installed), and
// scripts/ is the whole parity harness — the exporter, the scripted policy, the
// replay oracle, the hunt state-log. Tonight a regex turned `wrapped.cityIds`
// into `tileCity(wrapped)s` in replay-gpu.ts; `tsc` was clean, `vitest` was
// 463/463, the fixtures were byte-identical, and the OFF-SCRIPT GATE died with
// an empty error because all four shard replays crashed on a syntax error.
// Earlier in the same session a stray double-comma import broke esbuild four
// separate times, for the same reason.
//
// A parse is not a typecheck, but it costs ~200ms and catches the entire class.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const dir = 'scripts';
let bad = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
  const p = join(dir, f);
  try {
    transformSync(readFileSync(p, 'utf8'), { loader: 'ts' });
  } catch (e) {
    bad++;
    console.error(`PARSE FAIL ${p}`);
    for (const err of e.errors ?? []) {
      console.error(`  ${err.location?.line}:${err.location?.column} ${err.text}`);
    }
  }
}
if (bad > 0) {
  console.error(`${bad} script(s) do not parse`);
  process.exit(1);
}
console.log(`parse-check OK — ${readdirSync(dir).filter((n) => n.endsWith('.ts')).length} scripts`);
