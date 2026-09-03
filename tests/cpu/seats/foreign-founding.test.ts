import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf, onHomeContinent } from '../../../cpu/core/seats';
import { bestTrainableOfClass } from '../../../cpu/core/units';
import { GRANT_UNIT_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { UNIT_PROMO_CLASS } from '../../../cpu/data/promotions';
import { UNITS } from '../../../cpu/data/units';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Pax Britannica): "All cities founded on a continent other than your
 * home continent receive a free melee unit." CIV6 (Treasure Fleet): "Cities
 * not on your original Capital's continent receive ... a builder when
 * founded." Both fire at the SAME hook, keyed on the founded tile's landmass
 * against the seat's original capital's (C-48).
 *
 * The GPU twin is tests/gpu/foreign_founding_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leadRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

/** Two landmasses split by a column of ocean. */
function scene(row: number): GameState {
  const map = makeMap(24, 24, 'GRASSLAND');
  for (const t of map.tiles) if (t.col === 12) t.terrain = 'OCEAN';
  const state = makeState(map);
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  return state;
}

const unitsOf = (state: GameState, seat: number) =>
  state.units.filter((u) => u.seat === seat).map((u) => u.type);

describe('a city founded on a foreign continent', () => {
  it('carries both rows on the install`s two carriers', () => {
    const rows = GRANT_UNIT_ROWS.filter((r) => r.foreignContinent);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.civ === 'SPAIN')?.unit).toBe('BUILDER');
    expect(rows.find((r) => r.leader === 'VICTORIA')?.promoClass).toBe('MELEE');
    // exactly one of the two ways to name what is granted
    for (const r of rows) expect(Boolean(r.unit) !== Boolean(r.promoClass)).toBe(true);
  });

  it('grants Spain a Builder abroad and nothing at home', () => {
    const state = scene(civRow('SPAIN'));
    const home = settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    expect(home).toBeTruthy();
    // the FIRST city can never be foreign: its own landmass is the home one
    expect(onHomeContinent(state, 0, home.centerIndex)).toBe(true);
    const afterFirst = unitsOf(state, 0);
    expect(afterFirst.filter((t) => t === 'BUILDER').length).toBe(0);

    settleAt(state, tileAtCoords(state.map, 4, 12).index, 0);   // same landmass
    expect(unitsOf(state, 0).filter((t) => t === 'BUILDER').length).toBe(0);

    settleAt(state, tileAtCoords(state.map, 18, 5).index, 0);   // across the water
    expect(unitsOf(state, 0).filter((t) => t === 'BUILDER').length).toBe(1);
  });

  it('grants Victoria the best MELEE chassis she could train', () => {
    const state = scene(leadRow('VICTORIA'));
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    const before = unitsOf(state, 0).length;
    settleAt(state, tileAtCoords(state.map, 18, 5).index, 0);
    const after = unitsOf(state, 0);
    expect(after.length).toBe(before + 1);
    const got = after[after.length - 1];
    expect(UNIT_PROMO_CLASS[got]).toBe('MELEE');
    // ...and it is the STRONGEST one the reader would pick
    expect(got).toBe(bestTrainableOfClass(state, 0, 'MELEE'));
  });

  it('picks the strongest of the class, ties by catalog order', () => {
    const state = scene(leadRow('VICTORIA'));
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    const pick = bestTrainableOfClass(state, 0, 'MELEE');
    expect(pick).toBeTruthy();
    const best = UNITS[pick!];
    for (const d of Object.values(UNITS)) {
      if (UNIT_PROMO_CLASS[d.id] !== 'MELEE') continue;
      // nothing trainable of the class beats it
      if ((d.combat ?? 0) > (best.combat ?? 0)) {
        expect(bestTrainableOfClass(state, 0, 'MELEE')).not.toBe(d.id);
      }
    }
  });

  it('gives a seat the roster does not name nothing at all', () => {
    const state = scene(-1);
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    const before = unitsOf(state, 0).length;
    settleAt(state, tileAtCoords(state.map, 18, 5).index, 0);
    expect(unitsOf(state, 0).length).toBe(before);
    expect(seatOf(state, 0)!.civ).toBe(-1);
  });
});
