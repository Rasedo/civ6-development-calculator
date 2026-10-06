// The engine's storm against the harness's replay of the game's draws
// (`cpu/harness/eventDraws.ts`, the reference that lands the recorded storms
// of runs/h1_duelw1115 / 1116): from one generator state both take the same
// draws and land the same plots and the same fertility, birth and both walks.
import { describe, expect, it } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { drought, droughtStart, stormBirth, stormWalk } from '../../../cpu/core/disasters';
import { STORM_EVENTS, STORM_LAST_TURN_PCT } from '../../../cpu/data/disasters';
import { Civ6Random } from '../../../cpu/harness/civ6Random';
import { droughtDraws, newOutcome, stormBirth as replayBirth, stormWalk as replayWalk, type StruckPlot } from '../../../cpu/harness/eventDraws';
import type { GameState, Tile } from '../../../cpu/core/types';

/** a board of `terrain` with a band of the other ground through it, one
 *  sturdy land unit at (9, 9) */
function board(terrain: 'SNOW' | 'OCEAN', other: 'GRASSLAND' | 'COAST'): { state: GameState; unitAt: number } {
  const state = makeState(makeMap(22, 22, terrain));
  state.unitsMode = true;
  for (const t of state.map.tiles) if (t.col === 6 || t.row === 14) t.terrain = other;
  const at = tileAtCoords(state.map, 9, 9);
  at.terrain = 'GRASSLAND';
  const u = spawnUnit(state, 'WARRIOR', at.index, 0)!;
  u.hp = 1_000_000;
  return { state, unitAt: at.index };
}

/** the engine's fertility laid since `before`, summed */
const laid = (tiles: readonly Tile[], before: number[]) =>
  tiles.reduce((n, t, i) => n + t.fertility + t.fertilityProd - before[i], 0);

describe('the engine\'s storm draws as the replay does', () => {
  for (const [id, terrain, other] of [['BLIZZARD_CRIPPLING', 'SNOW', 'GRASSLAND'], ['HURRICANE_CAT_5', 'OCEAN', 'COAST'],
    ['BLIZZARD_SIGNIFICANT', 'SNOW', 'GRASSLAND']] as const) {
    it(`${id}: the birth and both walks take the replay's draws and land its plots`, () => {
      const e = STORM_EVENTS.findIndex((s) => s.id === id);
      for (const seed of [1, 77, 4242, 99991, 2026, 31337]) {
        const { state, unitAt } = board(terrain, other);
        const map = state.map;
        const ctx = (i: number): StruckPlot => ({ tile: map.tiles[i], immune: false, landUnits: i === unitAt ? 1 : 0,
          navalUnits: 0, garrison: false, walls: false, lowland: false });
        state.rngState = seed;
        const rng = new Civ6Random(seed);
        const before = map.tiles.map((t) => t.fertility + t.fertilityProd);
        // the replay reads the board as it stood: the engine lays fertility
        // as it goes, which the replay's draws do not see
        const out = newOutcome();
        const replayed = replayBirth(rng, map, e, 10, ctx, out);
        stormBirth(state, e, false);
        const rec = state.storms![0];
        expect(rec.at).toBe(replayed!.at);
        expect(state.rngState).toBe(rng.state);
        expect(laid(map.tiles, before)).toBe(replayed!.added);
        for (const [turn, pct] of [[11, 100], [12, STORM_LAST_TURN_PCT]] as const) {
          const was = map.tiles.map((t) => t.fertility + t.fertilityProd);
          const added0 = replayed!.added;
          replayWalk(rng, map, replayed!, turn, ctx, out);
          stormWalk(state, rec, pct, false);
          expect(rec.at).toBe(replayed!.at);
          expect(new Set(rec.struck)).toEqual(replayed!.struck);
          expect(state.rngState).toBe(rng.state);
          expect(laid(map.tiles, was)).toBe(replayed!.added - added0);
        }
      }
    });
  }
});

describe('the engine\'s drought draws as the replay does', () => {
  it('the start plot\'s weighted pick, then one draw per row on each land plot of its footprint', () => {
    for (const sev of [0, 1]) {
      for (const seed of [5, 1234, 777777]) {
        const state = makeState(makeMap(22, 22, 'GRASSLAND'));
        for (const t of state.map.tiles) if (t.col === 15) t.terrain = 'COAST';
        state.rngState = seed;
        const rng = new Civ6Random(seed);
        const at = droughtDraws(rng, state.map, sev, new Set(), new Set(), []);
        const centre = droughtStart(state)!;
        drought(state, centre, sev, false);
        expect(centre.index).toBe(at);
        expect(state.rngState).toBe(rng.state);
      }
    }
  });
});
