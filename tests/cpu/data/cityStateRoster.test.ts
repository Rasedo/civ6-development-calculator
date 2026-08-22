import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CITY_STATE_NAMES,
  CITY_STATE_TYPES,
  CITY_STATE_SUZERAIN_BONUS,
  CITY_STATE_SUZERAIN_LIVE,
  SUZ_EFFECTS,
} from '../../../cpu/data/cityStates';
import type { CityStateType } from '../../../cpu/core/types';

/** `seeder/place.ts` cannot import from cpu/ — the seeder directory is hashed
 *  into genStamp and an unhashed input would let world generation drift
 *  without moving the stamp. Read its copy of the pool as TEXT instead. */
function seederPools(): Record<string, string[]> {
  const src = readFileSync(new URL('../../../seeder/place.ts', import.meta.url), 'utf8');
  const block = /const CITY_STATE_NAMES[^{]*\{([\s\S]*?)\n\};/.exec(src);
  expect(block).not.toBeNull();
  const out: Record<string, string[]> = {};
  for (const line of block![1].split('\n')) {
    const m = /^\s*(\w+):\s*\[([^\]]*)\]/.exec(line);
    if (!m) continue;
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return out;
}

describe('the city-state roster', () => {
  it('gives every placeable name a catalog row of its own type', () => {
    for (const type of CITY_STATE_TYPES) {
      for (const name of CITY_STATE_NAMES[type]) {
        const row = CITY_STATE_SUZERAIN_BONUS[name];
        expect(row, `${name} has no CITY_STATE_SUZERAIN_BONUS row`).toBeDefined();
        expect(row.type, `${name} is typed ${row.type} but pooled under ${type}`).toBe(type);
        expect(row.name).toBe(name);
      }
    }
  });

  it('keeps the seeder pool inside the catalog pool, type for type', () => {
    const seeder = seederPools();
    expect(Object.keys(seeder).sort()).toEqual([...CITY_STATE_TYPES].sort());
    for (const type of CITY_STATE_TYPES) {
      expect(seeder[type].length).toBeGreaterThan(0);
      for (const name of seeder[type]) {
        expect(CITY_STATE_NAMES[type as CityStateType], `seeder places ${name} as ${type}`)
          .toContain(name);
      }
    }
  });

  it('pays every catalog row exactly one way — a rule or a channel', () => {
    for (const [name, row] of Object.entries(CITY_STATE_SUZERAIN_BONUS)) {
      const rule = row.suz !== undefined;
      const live = CITY_STATE_SUZERAIN_LIVE[name] !== undefined;
      expect(rule && live, `${name} pays both a rule and a channel`).toBe(false);
      if (rule) expect(SUZ_EFFECTS).toContain(row.suz!);
      if (live) expect(row.channel).toBe(CITY_STATE_SUZERAIN_LIVE[name]);
    }
  });

  it('names every rule row in the wire order, without holes', () => {
    const used = new Set(Object.values(CITY_STATE_SUZERAIN_BONUS).map((r) => r.suz).filter(Boolean));
    expect([...SUZ_EFFECTS].sort()).toEqual([...used].sort());
    expect(new Set(SUZ_EFFECTS).size).toBe(SUZ_EFFECTS.length);
  });
});
