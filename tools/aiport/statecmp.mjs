/**
 * Two saves of the AI score's carried state compared (`cpu/harness/stateSave.ts`):
 *
 *   node tools/aiport/statecmp.mjs <a.state | dir> <b.state | dir> [--max N]
 *
 * Two files: `EQUAL` where the two hold the same state and bookkeeping
 * (every value, every key and its order, every Map's and Set's order, every
 * shared object's first place), else the paths that differ (20 by default;
 * `--max N`), each with both values.
 * Two directories: every save both hold under one name, a line each.
 * A header's own fields (the sha, the time) are not compared. Exit code 1
 * where anything differs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { zstdDecompressSync } from 'node:zlib';

function read(path) {
  const bytes = readFileSync(path);
  const nl = bytes.indexOf(10);
  return { head: JSON.parse(bytes.toString('utf8', 0, nl)), raw: zstdDecompressSync(bytes.subarray(nl + 1)) };
}

const show = (v) => {
  if (v === undefined) return 'undefined';
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${v.length})`;
  if (v instanceof Map || v instanceof Set) return `${v.constructor.name}(${v.size})`;
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 160 ? `${s.slice(0, 160)}...` : s;
};

/** the paths at which `a` and `b` differ, into `out` up to `max`; an object
 *  met before is compared by the place it was first met at (a shared unit) */
function diff(a, b, path, out, max, seenA, seenB) {
  if (out.length >= max) return;
  if (Object.is(a, b)) return;
  const ta = a === null ? 'null' : typeof a;
  const tb = b === null ? 'null' : typeof b;
  if (ta !== 'object' || tb !== 'object') {
    out.push(`${path}: ${show(a)} | ${show(b)}`);
    return;
  }
  const wa = seenA.get(a);
  const wb = seenB.get(b);
  if (wa !== undefined || wb !== undefined) {
    if (wa !== wb) out.push(`${path}: shared with ${wa ?? 'nothing'} | ${wb ?? 'nothing'}`);
    return;
  }
  seenA.set(a, path);
  seenB.set(b, path);
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    out.push(`${path}: ${a.constructor?.name} | ${b.constructor?.name}`);
    return;
  }
  if (ArrayBuffer.isView(a)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} | ${b.length}`);
    else for (let i = 0; i < a.length && out.length < max; i++) if (a[i] !== b[i]) out.push(`${path}[${i}]: ${a[i]} | ${b[i]}`);
    return;
  }
  if (a instanceof Map) {
    const ka = [...a.keys()];
    const kb = [...b.keys()];
    if (ka.length !== kb.length) out.push(`${path}: Map size ${ka.length} | ${kb.length}`);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
      const name = typeof ka[i] === 'object' ? `#${i}` : String(ka[i]);
      diff(ka[i], kb[i], `${path}.key(${name})`, out, max, seenA, seenB);
      diff(a.get(ka[i]), b.get(kb[i]), `${path}.get(${name})`, out, max, seenA, seenB);
    }
    return;
  }
  if (a instanceof Set) {
    diff([...a], [...b], `${path}.values`, out, max, seenA, seenB);
    return;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.join('\n') !== kb.join('\n')) {
    const onlyA = ka.filter((k) => !(k in b));
    const onlyB = kb.filter((k) => !(k in a));
    if (onlyA.length || onlyB.length) out.push(`${path}: keys only in A [${onlyA}] | only in B [${onlyB}]`);
    else out.push(`${path}: key order ${ka.slice(0, 12)} | ${kb.slice(0, 12)}`);
  }
  if (Array.isArray(a) && a.length !== b.length) out.push(`${path}: length ${a.length} | ${b.length}`);
  for (const k of ka) if (k in b) diff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`, out, max, seenA, seenB);
}

function compare(pa, pb, max) {
  const a = read(pa);
  const b = read(pb);
  if (a.raw.equals(b.raw)) return [];
  // the bytes of two equal states may differ: V8 writes one number as an
  // integer or as a double by how the object holding it was built
  const out = [];
  diff(deserialize(a.raw), deserialize(b.raw), '', out, max, new Map(), new Map());
  return out;
}

const args = process.argv.slice(2);
const at = args.indexOf('--max');
const max = at >= 0 ? Number(args.splice(at, 2)[1]) : 20;
const [pa, pb] = args;
if (!pa || !pb) throw new Error('usage: node tools/aiport/statecmp.mjs <a.state | dir> <b.state | dir> [--max N]');
let differ = false;
if (statSync(pa).isDirectory()) {
  const names = readdirSync(pa).filter((f) => f.endsWith('.state') && readdirSync(pb).includes(f)).sort();
  if (!names.length) console.log('no save under one name in both');
  for (const f of names) {
    const out = compare(join(pa, f), join(pb, f), max);
    differ ||= out.length > 0;
    console.log(`${f}: ${out.length ? `DIFFERS at ${out.length}${out.length >= max ? '+' : ''} paths` : 'EQUAL'}`);
    for (const l of out) console.log(`  ${l}`);
  }
} else {
  const out = compare(pa, pb, max);
  differ = out.length > 0;
  console.log(out.length ? out.join('\n') : 'EQUAL');
}
process.exit(differ ? 1 : 0);
