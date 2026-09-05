import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { meleeAttack, mayCapture } from '../../../cpu/core/combat';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { CAPTURE_ROWS } from '../../../cpu/data/civilizations';
import { MP_SCALE, CAPTURED_UNIT_HP } from '../../../cpu/data/constants';
import type { GameState, Unit } from '../../../cpu/core/types';

/**
 * A DEFEATED CAVALRY UNIT MAY BE CAPTURED (C-58).
 *
 * CIV6 (Mongol Horde): cavalry gains "a chance to capture defeated enemy
 * cavalry class units". The install publishes the PERMISSION and one number
 * beside it, COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20; the curve through it
 * is this model's (STYLIZED, owner ruling 2026-09-04): even fight = coin flip,
 * certain at +20 Combat Strength, nothing at -20. The roll is ONE draw right
 * after the two damage rolls, taken whenever a capture is POSSIBLE — the
 * stream is the parity contract: three draws for a carrier's cavalry beating
 * cavalry, two for anyone else.
 *
 * The GPU twin is tests/gpu/capture_cavalry_test.py.
 */
const STEP = 0x6d2b79f5; // mulberry32's per-draw increment, on both engines
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function draws(s0: number, s1: number): number {
  // the state is a 32-bit counter stepping by STEP and wrapping, so count steps
  for (let k = 0; k <= 8; k++) if (((s0 + k * STEP) >>> 0) === (s1 >>> 0)) return k;
  throw new Error(`the stream moved by a non-draw amount: ${s0} -> ${s1}`);
}

function scene(carrier: boolean, atkType: string, defType: string, opts: { atkForm?: number; defForm?: number } = {}) {
  const state: GameState = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  state.seats[0].civ = carrier ? seatRow('MONGOLIA') : -1;
  setWar(state, 0, 1, true);
  const a = tileAtCoords(state.map, 5, 5);
  const d = tileAtCoords(state.map, 6, 5);
  const atk = spawnUnit(state, atkType, a.index, 0)!;
  const dfd = spawnUnit(state, defType, d.index, 1)!;
  atk.movesLeft = 2 * MP_SCALE;
  atk.formation = opts.atkForm ?? 0;
  dfd.formation = opts.defForm ?? 0;
  dfd.hp = 1; // one blow ends it either way
  const s0 = state.rngState;
  const r = meleeAttack(state, atk.id, d.index, 0);
  expect(r.ok, r.reason).toBe(true);
  return { state, atk, dfd, tile: d.index, n: draws(s0, state.rngState) };
}

const alive = (state: GameState, u: Unit) => state.units.find((x) => x.id === u.id);

describe('the cavalry capture', () => {
  it('is one row: Genghis Khan, the two cavalry classes on both chassis', () => {
    expect(CAPTURE_ROWS).toHaveLength(1);
    expect(CAPTURE_ROWS[0].leader).toBe('GENGHIS_KHAN');
    expect([...CAPTURE_ROWS[0].classes].sort()).toEqual(['HEAVY_CAV', 'LIGHT_CAV']);
  });

  it("re-seats the beaten Horseman under the captor's flag where it fell, at 25 HP, its turn spent", () => {
    // an army Knight (+17) over a wounded Horseman reads past +20: certain
    const { state, atk, dfd, tile, n } = scene(true, 'KNIGHT', 'HORSEMAN', { atkForm: 2 });
    const kept = alive(state, dfd);
    expect(kept, 'the beaten unit was killed').toBeDefined();
    expect(kept!.seat).toBe(0);
    expect(kept!.type).toBe('HORSEMAN');
    expect(kept!.tileIndex).toBe(tile);
    expect(kept!.hp).toBe(CAPTURED_UNIT_HP);
    expect(kept!.movesLeft).toBe(0);
    expect(state.units[state.units.length - 1].id, 'the captured unit joins the roster LAST').toBe(dfd.id);
    expect(alive(state, atk)!.tileIndex, 'the attacker advanced onto its own unit').not.toBe(tile);
    expect(n, 'a possible capture costs exactly ONE extra draw').toBe(3);
  });

  it('draws the roll and misses when the curve reads 0', () => {
    const { state, dfd, n } = scene(true, 'HORSEMAN', 'KNIGHT', { defForm: 2 });
    expect(alive(state, dfd)).toBeUndefined();
    expect(n).toBe(3);
  });

  it('never rolls for a non-carrier, or without cavalry on both sides', () => {
    for (const [carrier, atk, dfd] of [[false, 'KNIGHT', 'HORSEMAN'], [true, 'WARRIOR', 'HORSEMAN'], [true, 'KNIGHT', 'WARRIOR']] as const) {
      const r = scene(carrier, atk, dfd, { atkForm: 2 });
      expect(alive(r.state, r.dfd), `${atk} vs ${dfd} captured`).toBeUndefined();
      expect(r.n, `${atk} vs ${dfd} drew a capture roll`).toBe(2);
    }
  });

  it('refuses a passenger at sea', () => {
    const state: GameState = makeState(makeMap(16, 16, 'GRASSLAND'));
    state.seats.push(emptySeat(1));
    state.seats[0].civ = seatRow('MONGOLIA');
    const atk = spawnUnit(state, 'KNIGHT', tileAtCoords(state.map, 5, 5).index, 0)!;
    const dfd = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 6, 5).index, 1)!;
    expect(mayCapture(state, atk, dfd)).toBe(true);
    dfd.embarked = true;
    expect(mayCapture(state, atk, dfd)).toBe(false);
  });
});
