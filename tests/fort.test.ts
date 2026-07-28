import { describe, expect, it } from 'vitest';
import { terrainDefense } from '../src/core/combat';
import { IMPROVEMENTS } from '../src/data/improvements';
import { validImprovementsIn } from '../src/core/rules';
import type { Tile } from '../src/core/types';

/**
 * AUDIT B-27 (#78) — the FORT. MEASURED gate reachability is ZERO (no seed
 * builds a Military Engineer, so no fort is ever placed), which makes scripted
 * parity vacuous for this mechanic. These tests construct the configuration
 * directly instead of hoping a seed wanders into it.
 */
const tile = (over: Partial<Tile> = {}): Tile =>
  ({
    index: 0,
    col: 0,
    row: 0,
    terrain: 'PLAINS',
    elevation: 'FLAT',
    feature: null,
    resource: null,
    improvement: null,
    district: null,
    wonder: null,
    builtWonder: null,
    riverMask: 0,
    ...over,
  }) as Tile;

describe('B-27 fort', () => {
  it('grants the occupying unit +4 defense strength', () => {
    const bare = terrainDefense(tile());
    const fort = terrainDefense(tile({ improvement: 'FORT' }));
    expect(fort - bare).toBe(4);
  });

  it('stacks with terrain rather than replacing it', () => {
    // Hills are +3; a fort on hills must be +7, not +4.
    const hills = terrainDefense(tile({ elevation: 'HILLS' }));
    expect(hills).toBe(3);
    expect(terrainDefense(tile({ elevation: 'HILLS', improvement: 'FORT' }))).toBe(7);
  });

  it('carries no yields — its whole value is defensive', () => {
    expect(IMPROVEMENTS.FORT.yields).toEqual({});
    expect(IMPROVEMENTS.FORT.housing).toBe(0);
  });

  it('is offered to a MILITARY_ENGINEER and to nobody else', () => {
    const t = tile();
    const opts = { unlocks: null, ownsTile: () => true };
    // A builder (or any caller that names no unit) must never see it.
    expect(validImprovementsIn(t, opts)).not.toContain('FORT');
    expect(validImprovementsIn(t, { ...opts, builder: 'BUILDER' })).not.toContain('FORT');
    expect(validImprovementsIn(t, { ...opts, builder: 'MILITARY_ENGINEER' })).toContain('FORT');
  });
});
