import { describe, it, expect } from 'vitest';
import { PLAYER_CIV, civOfRival } from '../src/core/seats';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { cliffBlocks, cliffBlocksStep } from '../src/core/units';
import { neighborTile } from '../src/core/hex';
import type { Tile } from '../src/core/types';

// B-26 (#79) CLIFFS. Sourced from the Civ 6 wiki (Cliffs page): cliffs sit on
// the land/water boundary and are "an unbreakable barrier to embarking and
// disembarking" — that is their ENTIRE function, and it is what makes a
// cliff-ringed city safe from naval invasion. Exceptions: a city tile, and a
// Harbor, whose pass is OWNER-ONLY ("when YOUR units use it... Enemy units
// won't").
//
// NOT modelled, checked and deliberately excluded: cliffs do NOT block Harbor
// CONSTRUCTION ("A Harbor may still be built next to Cliffs"), and there is no
// sourced rule that they block naval attacks on a city — community reports say
// naval melee can attack through cliffs, so nothing is implemented for it.

describe('B-26: cliffs block embark and disembark', () => {
  function setup() {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const land = tileAtCoords(state.map, 5, 5);
    land.elevation = 'HILLS';
    // find a real neighbour and make it water, then set the cliff bit for it
    let dir = -1;
    let sea: Tile | null = null;
    for (let d = 0; d < 6; d++) {
      const n = neighborTile(state.map, land, d);
      if (n) {
        dir = d;
        sea = n;
        break;
      }
    }
    sea!.terrain = 'OCEAN';
    land.cliffMask = 1 << dir;
    return { state, land, sea: sea! };
  }

  it('blocks the land/water crossing in both directions', () => {
    const { state, land, sea } = setup();
    const unit = { seat: PLAYER_CIV };
    expect(cliffBlocks(state, land, sea, unit)).toBe(true); // embark
    expect(cliffBlocks(state, sea, land, unit)).toBe(true); // disembark
  });

  it('never touches a land-to-land step', () => {
    const { state, land } = setup();
    const inland = tileAtCoords(state.map, 6, 6);
    expect(cliffBlocks(state, land, inland, { seat: PLAYER_CIV })).toBe(false);
  });

  it('a city centre ignores cliffs', () => {
    const { state, land, sea } = setup();
    land.district = 'CITY_CENTER';
    expect(cliffBlocks(state, land, sea, { seat: PLAYER_CIV })).toBe(false);
  });

  it('a Harbor passes its OWNER only, never the enemy', () => {
    const { state, land, sea } = setup();
    land.district = 'HARBOR';
    land.cityId = 1; // the player's territory
    expect(cliffBlocks(state, land, sea, { seat: PLAYER_CIV })).toBe(false);
    // an enemy using the same Harbor tile is still walled out
    expect(cliffBlocks(state, land, sea, { seat: civOfRival(0) })).toBe(true);
  });

  it('an edge with no cliff bit is free', () => {
    const { state, land, sea } = setup();
    land.cliffMask = 0;
    expect(cliffBlocks(state, land, sea, { seat: PLAYER_CIV })).toBe(false);
  });

  // #79 REGRESSION. The rule was correct but reached only ONE of the movers:
  // TS applied it in the player's walkPath alone, while the GPU applied it in
  // its rival war-march alone — DISJOINT sets. A rival musketman therefore
  // embarked over a cliff on TS and not on the GPU (off-script gate, seed 9015
  // t198: TS moved 360->316 onto water, the GPU held). Scripted parity was
  // green throughout; only the rollout reached a cliff edge with a rival on it.
  describe('cliffBlocksStep: the step-level rule every mover shares', () => {
    it('blocks a land unit crossing a cliff edge, both directions', () => {
      const { state, land, sea } = setup();
      const u = { type: 'MUSKETMAN', seat: civOfRival(0) };
      expect(cliffBlocksStep(state, land, sea, u)).toBe(true); // embark
      expect(cliffBlocksStep(state, sea, land, u)).toBe(true); // disembark
    });

    it('ignores a non-transition and exempts naval movers', () => {
      const { state, land, sea } = setup();
      const inland = tileAtCoords(state.map, 6, 6);
      // land->land is never a cliff question
      expect(cliffBlocksStep(state, land, inland, { type: 'MUSKETMAN', seat: PLAYER_CIV })).toBe(false);
      // a naval unit never transitions, so the cliff cannot gate it
      expect(cliffBlocksStep(state, land, sea, { type: 'GALLEY', seat: PLAYER_CIV })).toBe(false);
    });

    // The BEHAVIOURAL half of this regression — a rival war-march refusing a
    // cliffed embark — lives in tests/naval-embark.test.ts, where the march
    // harness already exists.
  });
});
