import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantCivics } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { getModifiers, wonderExtraSlots } from '../../../cpu/core/effects';
import { greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { unitKillEvent } from '../../../cpu/core/eras';
import { rosterCS } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { districtAdjacency } from '../../../cpu/core/yields';
import { neighbors } from '../../../world/hex';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { HAPPY_YIELD_ROWS, HAPPY_GPP_ROWS, POLICY_SLOT_ROWS, POST_COMBAT_YIELD_ROWS, DISTRICT_ADJ_ROWS } from '../../../cpu/data/civilizations';
import { UNITS } from '../../../cpu/data/units';
import { RESOURCES } from '../../../world/resources';
import type { City, GameState, Tile } from '../../../cpu/core/types';

/**
 * THE SEAT'S ROSTER ROWS (CIV6, the install's TraitModifiers): the happiness
 * percentages and Great Person points of the Scottish Enlightenment, the
 * government slot of Plato's Republic and the Holy Roman Emperor, the Culture
 * and Faith a kill pays Gorgo and Tamar, Thermopylae's per-policy strength,
 * and the Amazon's rainforest adjacency.
 */
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

/** Improved luxuries this seat owns — each is one Amenity in its four
 *  nearest cities, which is how a scene reaches Happy and Ecstatic. */
const LUXURIES = ['WINE', 'COTTON', 'DYES', 'INCENSE', 'SILVER', 'JADE'] as const;
function giveLuxuries(state: GameState, city: City, n: number): void {
  const ring = neighbors(state.map, state.map.tiles[city.centerIndex]);
  for (let i = 0; i < n; i++) {
    const t = ring[i];
    setTileOwner(t, 0, city.id);
    t.resource = LUXURIES[i];
    t.improvement = RESOURCES[LUXURIES[i]].improvement;
    t.feature = null;
  }
}

describe('the Scottish Enlightenment', () => {
  it('pays a happy city 5% more Science and Production, an ecstatic one 10%', () => {
    expect(HAPPY_YIELD_ROWS.length).toBe(4);
    const yieldsOf = (row: number, luxuries: number) => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      city.population = 6; // needs 2 Amenities, so the luxuries decide the tier
      city.buildings.push('LIBRARY'); // something to scale
      giveLuxuries(state, city, luxuries);
      const st = computeCityStats(state, city);
      return { tier: st.amenities.tier.name, science: st.total.science, production: st.total.production, gold: st.total.gold };
    };
    const contentScot = yieldsOf(seatRow('SCOTLAND'), 1);
    const contentPlain = yieldsOf(seatRow('AMERICA'), 1);
    expect(contentScot.tier).toBe('Content');
    expect(contentScot.science).toBeCloseTo(contentPlain.science, 9);
    const happyScot = yieldsOf(seatRow('SCOTLAND'), 2);
    const happyPlain = yieldsOf(seatRow('AMERICA'), 2);
    expect(happyScot.tier).toBe('Happy');
    expect(happyScot.science).toBeCloseTo(happyPlain.science * 1.05, 9);
    expect(happyScot.production).toBeCloseTo(happyPlain.production * 1.05, 9);
    expect(happyScot.gold).toBeCloseTo(happyPlain.gold, 9); // an unnamed yield is untouched
    const ecstaticScot = yieldsOf(seatRow('SCOTLAND'), 4);
    const ecstaticPlain = yieldsOf(seatRow('AMERICA'), 4);
    expect(ecstaticScot.tier).toBe('Ecstatic');
    expect(ecstaticScot.science).toBeCloseTo(ecstaticPlain.science * 1.1, 9);
  });

  it('pays a happy city a Great Scientist point per Campus, doubled while ecstatic', () => {
    expect(HAPPY_GPP_ROWS.length).toBe(4);
    const pointsOf = (row: number, luxuries: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      city.population = 6; // needs 2 Amenities, so the luxuries decide the tier
      const t = neighbors(state.map, state.map.tiles[city.centerIndex])[5];
      setTileOwner(t, 0, city.id);
      t.district = 'CAMPUS';
      t.districtComplete = true;
      city.districts.push({ type: 'CAMPUS', tileIndex: t.index } as City['districts'][number]);
      giveLuxuries(state, city, luxuries);
      return greatPersonPointsPerTurn(state, 0).SCIENTIST;
    };
    const plain = pointsOf(seatRow('AMERICA'), 2);
    expect(pointsOf(seatRow('SCOTLAND'), 2)).toBe(plain + 1);
    expect(pointsOf(seatRow('SCOTLAND'), 4)).toBe(plain + 2);
    expect(pointsOf(seatRow('SCOTLAND'), 1)).toBe(plain); // Content pays nothing
  });
});

describe('the roster government slots', () => {
  it("Plato's Republic adds a Wildcard, the Holy Roman Emperor a Military", () => {
    expect(POLICY_SLOT_ROWS.length).toBe(2);
    const greece = sceneAs(seatRow('GREECE'));
    expect(wonderExtraSlots(greece, 0).wildcard).toBe(1);
    expect(wonderExtraSlots(greece, 0).military).toBe(0);
    expect(wonderExtraSlots(greece, 1).wildcard).toBe(0);
    const germany = sceneAs(leaderRow('BARBAROSSA'));
    expect(wonderExtraSlots(germany, 0).military).toBe(1);
    expect(wonderExtraSlots(germany, 0).wildcard).toBe(0);
  });
});

describe('what a kill pays', () => {
  it("Gorgo takes Culture and Tamar Faith, half the defeated unit's strength", () => {
    expect(POST_COMBAT_YIELD_ROWS.length).toBe(2);
    const half = Math.floor((UNITS.WARRIOR.combat ?? 0) / 2);
    expect(half).toBeGreaterThan(0);
    const gorgo = sceneAs(leaderRow('GORGO'));
    const before = gorgo.seats[0].research.civicProgress;
    unitKillEvent(gorgo, 0, { type: 'WARRIOR' }, { type: 'WARRIOR', seat: 1 });
    expect(gorgo.seats[0].research.civicProgress).toBe(before + half);
    // a BARBARIAN victim pays too
    unitKillEvent(gorgo, 0, { type: 'WARRIOR' }, { type: 'WARRIOR', seat: 200 });
    expect(gorgo.seats[0].research.civicProgress).toBe(before + 2 * half);
    const tamar = sceneAs(leaderRow('TAMAR'));
    const faith = tamar.seats[0].faith;
    unitKillEvent(tamar, 0, { type: 'WARRIOR' }, { type: 'WARRIOR', seat: 1 });
    expect(tamar.seats[0].faith).toBe(faith + half);
    // a plain seat banks nothing, and a CIVILIAN victim has no strength
    const plain = sceneAs(seatRow('AMERICA'));
    const p0 = plain.seats[0].research.civicProgress;
    unitKillEvent(plain, 0, { type: 'WARRIOR' }, { type: 'WARRIOR', seat: 1 });
    expect(plain.seats[0].research.civicProgress).toBe(p0);
    const g2 = gorgo.seats[0].research.civicProgress;
    unitKillEvent(gorgo, 0, { type: 'WARRIOR' }, { type: 'SETTLER', seat: 1 });
    expect(gorgo.seats[0].research.civicProgress).toBe(g2);
  });

  it('Thermopylae: +1 Combat Strength for every Military policy slotted', () => {
    const state = sceneAs(leaderRow('GORGO'));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(getModifiers(state, 0).militaryPolicies).toBe(0);
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    // the first government's military slots fill as the cards unlock
    grantCivics(state, 'CODE_OF_LAWS', 'FOREIGN_TRADE', 'CRAFTSMANSHIP', 'MILITARY_TRADITION');
    const n = getModifiers(state, 0).militaryPolicies;
    expect(n).toBeGreaterThan(0);
    expect(rosterCS(state, u, 1, 100, false)).toBe(n);
    const plain = sceneAs(seatRow('AMERICA'));
    plain.unitsMode = true;
    grantCivics(plain, 'CODE_OF_LAWS', 'FOREIGN_TRADE', 'CRAFTSMANSHIP', 'MILITARY_TRADITION');
    const w = spawnUnit(plain, 'WARRIOR', tileAtCoords(plain.map, 5, 5).index, 0)!;
    expect(rosterCS(plain, w, 1, 100, false)).toBe(0);
  });
});

describe('the Amazon', () => {
  it("gives Brazil's four districts a rainforest adjacency, and nobody else's", () => {
    expect(DISTRICT_ADJ_ROWS.filter((r) => r.source === 'RAINFOREST').length).toBe(4);
    const adjOf = (row: number, type: 'CAMPUS' | 'HARBOR'): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      const site = neighbors(state.map, state.map.tiles[city.centerIndex])[0];
      setTileOwner(site, 0, city.id);
      let n = 0;
      for (const t of neighbors(state.map, site) as Tile[]) {
        if (t.index === city.centerIndex) continue;
        t.feature = 'RAINFOREST';
        n += 1;
      }
      const add = getModifiers(state, 0).districtAdjacencyAdd[type] ?? [];
      return districtAdjacency(state.map, site, type, add) - districtAdjacency(state.map, site, type, []);
    };
    expect(adjOf(seatRow('BRAZIL'), 'CAMPUS')).toBeGreaterThan(0);
    expect(adjOf(seatRow('AMERICA'), 'CAMPUS')).toBe(0);
    expect(adjOf(seatRow('BRAZIL'), 'HARBOR')).toBe(0); // an unnamed district
  });
});
