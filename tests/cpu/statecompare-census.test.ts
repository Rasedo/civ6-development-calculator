/** STATE COMPARE — the census and the digest algebra, TypeScript half.
 *
 * The census is the anti-rot contract: every field of every type the manifest
 * names in `censusTypes` is either covered by a manifest field or excluded
 * with a reason. Adding a field to `GameState` without deciding what compares
 * it fails HERE, not months later as an AUDIT finding.
 *
 * The algebra tests pin what the digest's correctness rests on: row order
 * must not matter (the two engines walk rows in different orders), key and
 * column order must matter, and `exact`/`milli` must stay separate findings.
 * Cross-language BIT-equality with `gpu/core/statecompare.py` is not pinned
 * here — the serve gate's digest lane proves it live over real state every
 * run, which is a stronger check than any fixture.
 */
import { describe, it, expect } from 'vitest';
import { census, checkExtractors, foldRows, loadManifest } from '../../cpu/core/statecompare';

describe('statecompare census', () => {
  it('every censusTypes field is covered or excluded with a reason', () => {
    expect(census()).toEqual([]);
  });

  it('the extractor set matches the manifest field set exactly', () => {
    expect(() => checkExtractors()).not.toThrow();
  });

  it('every manifest field carries a compare kind and at least one surface', () => {
    for (const g of loadManifest().groups) {
      for (const f of g.fields) {
        expect(['exact', 'milli']).toContain(f.compare);
        // a `derived` field is a computed guard (game.cityCount) — the one
        // shape with no stored field or plane behind it
        if (!f.derived) expect(f.covers.length + f.planes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('statecompare digest algebra', () => {
  const keys = [3, 7, 11];
  const cols = [
    { compare: 'exact' as const, vals: [1, 2, 3] },
    { compare: 'milli' as const, vals: [0.5, [1.25, -2.5], 0] },
    { compare: 'exact' as const, vals: [[4, 5], [], [6]] },
  ];

  it('row order does not change the digest', () => {
    const shuffled = [keys[2], keys[0], keys[1]];
    const scols = cols.map((c) => ({ compare: c.compare, vals: [c.vals[2], c.vals[0], c.vals[1]] }));
    expect(foldRows(shuffled, scols)).toEqual(foldRows(keys, cols));
  });

  it('a changed key changes the digest', () => {
    expect(foldRows([3, 7, 12], cols)).not.toEqual(foldRows(keys, cols));
  });

  it('column order changes the digest', () => {
    const swapped = [cols[2], cols[1], cols[0]];
    expect(foldRows(keys, swapped).exact).not.toBe(foldRows(keys, cols).exact);
  });

  it('a milli drift moves only the milli digest, and only past half a milli-unit', () => {
    const base = foldRows(keys, cols);
    const nudge = (d: number) =>
      foldRows(keys, [cols[0], { compare: 'milli', vals: [0.5 + d, [1.25, -2.5], 0] }, cols[2]]);
    expect(nudge(0.0004)).toEqual(base); // rounds to the same milli-unit
    const moved = nudge(0.001);
    expect(moved.milli).not.toBe(base.milli);
    expect(moved.exact).toBe(base.exact);
  });

  it('an exact integer off-by-one changes the exact digest — the class the flat trace tolerance passed', () => {
    const moved = foldRows(keys, [{ compare: 'exact', vals: [1, 2, 4] }, cols[1], cols[2]]);
    expect(moved.exact).not.toBe(foldRows(keys, cols).exact);
    expect(moved.milli).toBe(foldRows(keys, cols).milli);
  });

  it('digests are 64-bit hex strings', () => {
    const d = foldRows(keys, cols);
    expect(d.exact).toMatch(/^[0-9a-f]{16}$/);
    expect(d.milli).toMatch(/^[0-9a-f]{16}$/);
  });
});
