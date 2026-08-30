import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner, seatOf } from '../../../cpu/core/seats';
import { cityCounterLevels } from '../../../cpu/core/espionage';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState } from '../../../cpu/core/types';

// CIV6 (Consulate): "+2 Influence Points per turn. Enemy Spy's level is
// reduced by 1 when targeting this city OR CITIES WITH ENCAMPMENTS." The
// second half is empire-wide: the building stands in one city and covers
// every OTHER city of the seat that holds a live Encampment.

/** Give a city a COMPLETE district of `type` on a free owned plot. */
function district(state: GameState, city: City, type: string): number {
  const ctr = state.map.tiles[city.centerIndex];
  const t = state.map.tiles.find(
    (x) => x.index !== ctr.index && !x.district && x.terrain !== 'OCEAN'
      && Math.abs(x.col - ctr.col) <= 2 && Math.abs(x.row - ctr.row) <= 2,
  )!;
  setTileOwner(t, city.seat, city.id);
  t.district = type as never;
  t.districtComplete = true;
  city.districts.push({ type: type as never, tileIndex: t.index });
  return t.index;
}

function world() {
  const state = makeState(makeMap(24, 24));
  state.seats.push(emptySeat(1));
  const capital = settleAt(state, tileAtCoords(state.map, 4, 4).index, 1);
  const other = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
  return { state, capital, other };
}

describe('the Consulate row', () => {
  it('carries both halves of the published text', () => {
    expect(BUILDINGS.CONSULATE.influencePerTurn).toBe(2);
    expect(BUILDINGS.CONSULATE.spyLevelPenalty).toBe(1);
    expect(BUILDINGS.CONSULATE.spyLevelPenaltyEncampment).toBe(1);
  });

  it('and it is the only building with the empire-wide half', () => {
    const wide = Object.values(BUILDINGS).filter((b) => (b.spyLevelPenaltyEncampment ?? 0) > 0);
    expect(wide.map((b) => b.id)).toEqual(['CONSULATE']);
  });
});

describe('what the Consulate covers', () => {
  it('its own city, with no Encampment anywhere', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    // the Diplomatic Quarter itself takes 2 off, the Consulate standing in it 1
    expect(cityCounterLevels(state, capital)).toBe(3);
    expect(cityCounterLevels(state, other)).toBe(0);
  });

  it('...and the OTHER city, once that one holds a live Encampment', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    district(state, other, 'ENCAMPMENT');
    expect(cityCounterLevels(state, other)).toBe(1);
    // ...and the Consulate's own city still counts it exactly once
    expect(cityCounterLevels(state, capital)).toBe(3);
  });

  it('...counting once per Consulate, not once per Encampment', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    district(state, other, 'ENCAMPMENT');
    // a THIRD city with an Encampment changes nothing for `other`
    const third = settleAt(state, tileAtCoords(state.map, 18, 18).index, 1);
    district(state, third, 'ENCAMPMENT');
    expect(cityCounterLevels(state, other)).toBe(1);
    expect(cityCounterLevels(state, third)).toBe(1);
  });

  it('...and a second Consulate elsewhere stacks', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    district(state, other, 'ENCAMPMENT');
    const third = settleAt(state, tileAtCoords(state.map, 18, 18).index, 1);
    district(state, third, 'DIPLOMATIC_QUARTER');
    third.buildings.push('CONSULATE');
    expect(cityCounterLevels(state, other)).toBe(2);
  });
});

describe('what it does not cover', () => {
  it('a city with no Encampment', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    district(state, other, 'CAMPUS');
    expect(cityCounterLevels(state, other)).toBe(0);
  });

  it('an Encampment that is not FINISHED', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    const t = state.map.tiles[district(state, other, 'ENCAMPMENT')];
    t.districtComplete = false;
    expect(cityCounterLevels(state, other)).toBe(0);
  });

  it('an Encampment that is PILLAGED', () => {
    const { state, capital, other } = world();
    district(state, capital, 'DIPLOMATIC_QUARTER');
    capital.buildings.push('CONSULATE');
    const t = state.map.tiles[district(state, other, 'ENCAMPMENT')];
    t.districtPillaged = true;
    expect(cityCounterLevels(state, other)).toBe(0);
  });

  it('a Consulate whose own Diplomatic Quarter is pillaged', () => {
    const { state, capital, other } = world();
    const dq = state.map.tiles[district(state, capital, 'DIPLOMATIC_QUARTER')];
    capital.buildings.push('CONSULATE');
    district(state, other, 'ENCAMPMENT');
    expect(cityCounterLevels(state, other)).toBe(1);
    dq.districtPillaged = true;
    expect(cityCounterLevels(state, other)).toBe(0);
    expect(cityCounterLevels(state, capital)).toBe(0);
  });

  it('and a RIVAL empire Consulate', () => {
    const { state, other } = world();
    const mine = settleAt(state, tileAtCoords(state.map, 20, 4).index, 0);
    district(state, mine, 'DIPLOMATIC_QUARTER');
    mine.buildings.push('CONSULATE');
    district(state, other, 'ENCAMPMENT');
    expect(seatOf(state, 0)!.cities.length).toBe(1);
    expect(cityCounterLevels(state, other)).toBe(0);
  });
});
