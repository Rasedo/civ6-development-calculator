import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { getModifiers, wonderExtraSlots, slotFavorOf, greatWorkLoyalty } from '../../../cpu/core/effects';
import { cityHasPark } from '../../../cpu/core/city';
import { cityAppealResolver, emptyGovernors } from '../../../cpu/core/governors';
import { trainXpPct } from '../../../cpu/core/combat';
import { formationTierFor, spawnUnit } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { GOVERNMENT_LIST } from '../../../cpu/data/policies';
import { CIVICS } from '../../../cpu/data/civics';
import {
  SLOT_CONVERT_ROWS, SLOT_FAVOR_ROWS, PLAZA_DISTRICT_PROD_ROWS, GREAT_WORK_LOYALTY_ROWS,
  GOVERNOR_XP_ROWS, CONQUEST_FORMATION_ROWS, SPY_PROMO_ROWS, PARK_APPEAL_ROWS,
  SKIP_FREE_CITY_ROWS, UNIT_POP_COST_ROWS, AUTO_THEME_ROWS,
} from '../../../cpu/data/civilizations';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE SLOT, THE GREAT WORK AND THE CONQUERED FORMATION (CIV6, the install's
 * TraitModifiers): Founding Fathers, Founder of Carthage, Eleanor's loyalty
 * aura, the Toqui's training XP, Isibongo's conquest, the Flying Squadron and
 * the Roosevelt Corollary.
 *
 * The GPU twin is tests/gpu/slot_rows_test.py.
 */
const PLAIN = -1;
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

/** Adopt a government that holds a Diplomatic slot, by researching whatever
 *  civic unlocks it — `computeAdoption` picks the highest TIER unlocked. */
function adoptDiplomatic(state: GameState, seat: number): { id: string; dip: number; wild: number } {
  const want = GOVERNMENT_LIST.filter((x) => x.slots.includes('diplomatic'));
  let picked: (typeof want)[number] | undefined;
  for (const [cid, c] of Object.entries(CIVICS)) {
    for (const e of c.effects ?? []) {
      if (e.kind !== 'unlockGovernment') continue;
      const g = want.find((x) => x.id === e.government);
      if (!g) continue;
      if (!picked || g.tier > picked.tier) {
        picked = g;
        state.seats[seat].research.civics = [cid];
      }
    }
  }
  expect(picked).toBeTruthy();
  return {
    id: picked!.id,
    dip: picked!.slots.filter((k) => k === 'diplomatic').length,
    wild: picked!.slots.filter((k) => k === 'wildcard').length,
  };
}

describe('the wire', () => {
  it('carries every batch-thirteen family that ships, and none that cannot', () => {
    expect(SLOT_CONVERT_ROWS.length).toBe(1);
    expect(SLOT_FAVOR_ROWS.length).toBe(1);
    expect(PLAZA_DISTRICT_PROD_ROWS.length).toBe(1);
    expect(GREAT_WORK_LOYALTY_ROWS.length).toBe(2); // both Eleanors
    expect(GOVERNOR_XP_ROWS.length).toBe(2);
    expect(CONQUEST_FORMATION_ROWS.length).toBe(1);
    expect(SPY_PROMO_ROWS.length).toBe(1);
    expect(PARK_APPEAL_ROWS.length).toBe(1);
    // these three are SOURCED but blocked, and deliberately off the wire —
    // an exported row nothing reads would read as shipped in every census
    expect(SKIP_FREE_CITY_ROWS.length).toBe(2);
    expect(UNIT_POP_COST_ROWS.length).toBe(1);
    expect(AUTO_THEME_ROWS.length).toBe(2);
  });
});

describe('Founding Fathers', () => {
  it('moves every Diplomatic slot to Wildcard, in whatever government is adopted', () => {
    const america = sceneAs(seatRow('AMERICA'));
    const plain = sceneAs(PLAIN);
    const g = adoptDiplomatic(america, 0);
    adoptDiplomatic(plain, 0);
    expect(g.dip).toBeGreaterThan(0);
    const a = wonderExtraSlots(america, 0);
    const p = wonderExtraSlots(plain, 0);
    expect(a.diplomatic).toBe(p.diplomatic - g.dip);
    expect(a.wildcard).toBe(p.wildcard + g.dip);
  });

  it('pays a Favor per Wildcard slot, counting the converted ones', () => {
    const america = sceneAs(seatRow('AMERICA'));
    const plain = sceneAs(PLAIN);
    const g = adoptDiplomatic(america, 0);
    adoptDiplomatic(plain, 0);
    expect(slotFavorOf(plain, 0)).toBe(0);
    expect(slotFavorOf(america, 0)).toBe(g.wild + g.dip);
  });
});

describe('Eleanor', () => {
  it('pulls a foreign city down one Loyalty per Great Work in range', () => {
    const scene = (row: number, works: number, far: boolean) => {
      const state = sceneAs(PLAIN);
      state.seats[1].civ = row;
      const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      const theirs = settleAt(state, tileAtCoords(state.map, far ? 18 : 8, far ? 18 : 5).index, 1);
      theirs.greatWorksWriting = works;
      return greatWorkLoyalty(state, mine);
    };
    expect(scene(leaderRow('ELEANOR_ENGLAND'), 0, false)).toBe(0);
    expect(scene(leaderRow('ELEANOR_ENGLAND'), 3, false)).toBe(-3);
    expect(scene(leaderRow('ELEANOR_FRANCE'), 3, false)).toBe(-3);
    expect(scene(PLAIN, 3, false)).toBe(0);
    // ...and nothing past the row's own range
    expect(scene(leaderRow('ELEANOR_ENGLAND'), 3, true)).toBe(0);
  });

  it('never pulls its OWN city down', () => {
    const state = sceneAs(leaderRow('ELEANOR_ENGLAND'));
    const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
    const other = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    other.greatWorksArt = 5;
    expect(greatWorkLoyalty(state, mine)).toBe(0);
  });
});

describe('the Toqui', () => {
  it('adds training XP under an established governor, tripled where it did not found', () => {
    const pct = (row: number, founded: boolean, governed: boolean): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      city.founderSeat = founded ? 0 : 1;
      if (governed) {
        state.seats[0].governors = emptyGovernors();
        state.seats[0].governors[0] = { appointed: true, cityId: city.id, minorId: -1, establishTurns: 0, outTurns: 0, promotions: 0 };
      }
      return trainXpPct(state, city, 'MELEE');
    };
    const plain = pct(PLAIN, true, true);
    expect(pct(seatRow('MAPUCHE'), true, true)).toBe(plain + 10);
    expect(pct(seatRow('MAPUCHE'), false, true)).toBe(plain + 30);
    expect(pct(seatRow('MAPUCHE'), true, false)).toBe(plain); // no governor, no XP
  });
});

describe('Isibongo', () => {
  it('names the tier the civics allow, and nothing beyond it', () => {
    const state = sceneAs(seatRow('ZULU'));
    settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    expect(formationTierFor(state, 0, 'WARRIOR')).toBe(0); // no civic yet
    state.seats[0].research.civics = ['MERCENARIES'];
    expect(formationTierFor(state, 0, 'WARRIOR')).toBe(1);
    // a chassis that forms nothing stays at none
    expect(formationTierFor(state, 0, 'BUILDER')).toBe(0);
    expect(getModifiers(state, 0).conquestFormation).toBe(true);
    expect(getModifiers(sceneAs(PLAIN), 0).conquestFormation).toBe(false);
  });
});

describe('the Flying Squadron', () => {
  it('gives Catherine a spy that is born promoted', () => {
    const level = (row: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      const u = spawnUnit(state, 'SPY', city.centerIndex, 0);
      return u?.spyLevel ?? 0;
    };
    expect(level(leaderRow('CATHERINE_DE_MEDICI'))).toBe(1);
    expect(level(PLAIN)).toBe(0);
  });
});

describe('the Roosevelt Corollary', () => {
  it('adds an Appeal to every tile of a city holding a National Park', () => {
    const appeal = (row: number, park: boolean): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      const t = tileAtCoords(state.map, 8, 7);
      setTileOwner(t, 0, city.id);
      if (park) t.park = t.index;
      expect(cityHasPark(state, city)).toBe(park);
      const resolve = cityAppealResolver(state);
      return resolve ? resolve(t) : 0;
    };
    expect(appeal(leaderRow('T_ROOSEVELT'), true)).toBe(1);
    expect(appeal(leaderRow('T_ROOSEVELT'), false)).toBe(0);
    expect(appeal(PLAIN, true)).toBe(0);
  });
});
