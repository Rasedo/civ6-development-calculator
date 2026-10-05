/**
 * The Founder and Enhancer beliefs the install ships beyond the first pools,
 * and the Dar-e Mehr's per-era Faith. The GPU twin is
 * tests/gpu/belief_effects_test.py.
 *
 * CIV6 (Beliefs.xml, Expansion2_Beliefs.xml): LAY_MINISTRY
 * (BELIEF_YIELD_PER_DISTRICT), SACRED_PLACES (BELIEF_YIELD_PER_CITY_WITH_WONDER),
 * MISSIONARY_ZEAL (ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST), MONASTIC_ISOLATION
 * (EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS 100), RELIGIOUS_COLONIZATION (the
 * measured 200 x ceil(pop/2) + 2 a new city starts with), HOLY_WATERS
 * (MODIFIER_ALL_UNITS_ADJUST_HEAL_RELIGION_PER_TURN 10); the Dar-e Mehr's
 * Building_YieldsPerEra; the cities following a founder belief pays per; the
 * worship building a city's majority religion offers.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders, standBuilding } from '../helpers';
import { foundCity, condemnHeretic } from '../../../cpu/core/game';
import { seatOf, emptySeat, setWar } from '../../../cpu/core/seats';
import { beliefSeatYields, computeCityStats } from '../../../cpu/core/city';
import { getModifiers, makeYieldCtx, religionFollowers } from '../../../cpu/core/effects';
import { availableBuildings } from '../../../cpu/core/rules';
import { placeCityStateAt } from '../../../cpu/core/cityStates';
import { moveCostInto, riverCharge, religiousHeal, spawnUnit } from '../../../cpu/core/units';
import { transferCity } from '../../../cpu/core/phase';
import { completeQueueItem } from '../../../cpu/core/production';
import { gameEraIndex } from '../../../cpu/core/yields';
import { FOUNDER_BELIEFS, ENHANCER_BELIEFS, colonizeFoundingPressure } from '../../../cpu/data/religion';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { MP_SCALE } from '../../../cpu/data/constants';
import type { City, DistrictId, GameState } from '../../../cpu/core/types';

function sandboxCity() {
  const state = makeState(makeMap(20, 20));
  state.sandbox = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
  expandBorders(state, city, 2);
  return { state, city };
}

/** a complete district of `type` on (col, row), in the city's registry */
function district(state: GameState, city: City, type: DistrictId, col: number, row: number): void {
  const t = tileAtCoords(state.map, col, row);
  t.district = type;
  t.districtComplete = true;
  city.districts.push({ type, tileIndex: t.index });
}

/** the yields seat 0's beliefs pay the player, in no city */
function seatBelief(state: GameState) {
  return beliefSeatYields(state, 0, getModifiers(state, 0));
}

/** seat 0's religion, founded, holding `founder` / `enhancer` */
function religion(state: GameState, founder: string | null, enhancer: string | null): void {
  const rel = seatOf(state, 0)!.religion;
  rel.founded = true;
  rel.founder = founder;
  rel.enhancer = enhancer;
}

describe('the catalogs hold the install\'s nine Founders and nine Enhancers', () => {
  it('every row, RELIGIOUS_COLONIZATION the 200 a new city starts with', () => {
    expect(Object.keys(FOUNDER_BELIEFS)).toHaveLength(9);
    expect(Object.keys(ENHANCER_BELIEFS)).toHaveLength(9);
    for (const id of ['LAY_MINISTRY', 'SACRED_PLACES']) expect(FOUNDER_BELIEFS[id]).toBeDefined();
    for (const id of ['MISSIONARY_ZEAL', 'MONASTIC_ISOLATION', 'RELIGIOUS_COLONIZATION', 'HOLY_WATERS']) {
      expect(ENHANCER_BELIEFS[id]).toBeDefined();
    }
    expect(ENHANCER_BELIEFS.RELIGIOUS_COLONIZATION.effects).toEqual({ colonizePressure: 200 });
  });
});

describe('Founder beliefs', () => {
  it('Lay Ministry pays the player +1 Faith per Holy Site and +1 Culture per Theater Square, the capital none', () => {
    const { state, city } = sandboxCity();
    district(state, city, 'HOLY_SITE', 10, 9);
    district(state, city, 'THEATER_SQUARE', 8, 9);
    const capital = computeCityStats(state, city).breakdown.bonuses;
    const before = seatBelief(state);
    religion(state, 'LAY_MINISTRY', null);
    const after = seatBelief(state);
    expect(after.faith - before.faith).toBe(1);
    expect(after.culture - before.culture).toBe(1);
    expect(computeCityStats(state, city).breakdown.bonuses).toEqual(capital);
    // an unfinished district pays nothing
    tileAtCoords(state.map, 8, 9).districtComplete = false;
    expect(seatBelief(state).culture - before.culture).toBe(0);
  });

  it('Sacred Places pays +2 of four yields per city holding a completed World Wonder', () => {
    const { state, city } = sandboxCity();
    const t = tileAtCoords(state.map, 10, 10);
    t.builtWonder = 'STONEHENGE';
    t.builtWonderComplete = true;
    city.wonders.push({ id: 'STONEHENGE', tileIndex: t.index });
    const before = seatBelief(state);
    religion(state, 'SACRED_PLACES', null);
    const after = seatBelief(state);
    for (const k of ['science', 'culture', 'gold', 'faith'] as const) expect(after[k] - before[k]).toBe(2);
    t.builtWonderComplete = false;
    const none = seatBelief(state);
    expect(none.faith - before.faith).toBe(0);
  });

  it('Pilgrimage pays +2 Faith per city following the religion anywhere: a foreign major\'s, a city-state\'s', () => {
    const { state, city } = sandboxCity();
    religion(state, 'PILGRIMAGE', null);
    state.seats.push(emptySeat(1));
    const other = foundCity(state, tileAtCoords(state.map, 16, 16).index, 1).city!;
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', tileAtCoords(state.map, 3, 16).index);
    const faith = () => seatBelief(state).faith;
    const f0 = faith();
    city.followedReligion = 0;
    expect(faith() - f0).toBe(2);
    other.followedReligion = 0;
    expect(faith() - f0).toBe(4);
    cs.religionPressure = [500, 0];
    expect(faith() - f0).toBe(6);
    // a city following another religion counts nothing
    other.followedReligion = 1;
    expect(faith() - f0).toBe(4);
  });

  it('World Church pays 0.25 Culture per follower anywhere, unfloored, a minority\'s followers included', () => {
    const { state, city } = sandboxCity();
    religion(state, 'WORLD_CHURCH', null);
    state.seats.push(emptySeat(1));
    const other = foundCity(state, tileAtCoords(state.map, 16, 16).index, 1).city!;
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', tileAtCoords(state.map, 3, 16).index);
    const culture = () => seatBelief(state).culture;
    const c0 = culture();
    // one follower at home: a quarter, not floored away
    city.religionPressure = [500, 0];
    expect(religionFollowers(state, 0)).toBe(1);
    expect(culture() - c0).toBe(0.25);
    // one of a foreign city's four citizens, the unconverted its majority
    other.population = 4;
    other.religionPressure = [60, 0];
    expect(religionFollowers(state, 0)).toBe(2);
    expect(culture() - c0).toBe(0.5);
    // a city-state's two
    cs.population = 2;
    cs.religionPressure = [500, 0];
    expect(religionFollowers(state, 0)).toBe(4);
    expect(culture() - c0).toBe(1);
    // another religion's followers count nothing
    other.religionPressure = [0, 60];
    expect(religionFollowers(state, 0)).toBe(3);
    expect(culture() - c0).toBe(0.75);
  });
});

describe('Enhancer beliefs', () => {
  it('Missionary Zeal: the seat\'s religious units pay no terrain, feature or river Movement', () => {
    const { state, city } = sandboxCity();
    const from = tileAtCoords(state.map, 9, 9);
    const to = tileAtCoords(state.map, 10, 9);
    to.elevation = 'HILLS';
    to.feature = 'WOODS';
    from.riverMask = 0b111111;
    const missionary = spawnUnit(state, 'MISSIONARY', city.centerIndex, 0)!;
    const warrior = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    expect(moveCostInto(state, from, to, missionary)).toBe(3 * MP_SCALE);
    expect(riverCharge(state, from, to, missionary)).toBeGreaterThan(0);
    religion(state, null, 'MISSIONARY_ZEAL');
    expect(moveCostInto(state, from, to, missionary)).toBe(MP_SCALE);
    expect(riverCharge(state, from, to, missionary)).toBe(0);
    // a military unit keeps the schedule
    expect(moveCostInto(state, from, to, warrior)).toBe(3 * MP_SCALE);
    expect(riverCharge(state, from, to, warrior)).toBeGreaterThan(0);
  });

  it('Monastic Isolation: the religion loses nothing to a lost theological combat', () => {
    for (const [enhancer, lost] of [[null, 125], ['MONASTIC_ISOLATION', 0]] as const) {
      const state = makeState(makeMap(20, 20));
      const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
      state.seats.push(emptySeat(1));
      const rel1 = seatOf(state, 1)!.religion;
      rel1.founded = true;
      rel1.enhancer = enhancer;
      city.religionPressure = [0, 500];
      spawnUnit(state, 'MISSIONARY', city.centerIndex, 1);
      const soldier = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
      soldier.tileIndex = city.centerIndex;   // an own-tile verb: it shares the heretic's tile
      setWar(state, 0, 1, true);
      expect(condemnHeretic(state, soldier).ok).toBe(true);
      expect(city.religionPressure![1]).toBe(500 - lost);
    }
  });

  it('Religious Colonization: a city founded by a seat whose majority religion holds it starts following it at 202', () => {
    for (const [enhancer, want] of [[null, -1], ['RELIGIOUS_COLONIZATION', 0]] as const) {
      const { state, city } = sandboxCity();
      religion(state, null, enhancer);
      city.followedReligion = 0;
      const next = foundCity(state, tileAtCoords(state.map, 16, 16).index, 0).city!;
      expect(next.followedReligion ?? -1).toBe(want);
      expect(next.religionPressure?.[0] ?? 0).toBe(want >= 0 ? 202 : 0);
    }
  });

  it('Religious Colonization: the founding pressure is 200 per two citizens, rounded up, plus 2', () => {
    const rate = ENHANCER_BELIEFS.RELIGIOUS_COLONIZATION.effects.colonizePressure!;
    expect([1, 4, 7, 10, 13].map((pop) => colonizeFoundingPressure(rate, pop))).toEqual([202, 402, 802, 1002, 1402]);
  });

  it('Holy Waters: +10 healing on or next to a Holy Site of a city following the religion, for any religious unit', () => {
    const { state, city } = sandboxCity();
    district(state, city, 'HOLY_SITE', 10, 9);
    city.followedReligion = 0;
    const near = tileAtCoords(state.map, 11, 9);
    const mine = spawnUnit(state, 'MISSIONARY', near.index, 0)!;
    const heal = (u: typeof mine) => religiousHeal(state, u, makeYieldCtx(state, u.seat));
    const base = heal(mine);
    religion(state, null, 'HOLY_WATERS');
    expect(heal(mine) - base).toBe(10);
    // the install names no owner: another seat's religious unit takes it too
    const theirs = { ...mine, id: 999, seat: 3 };
    expect(heal(theirs)).toBe(10);
    // a city that does not follow the religion carries none
    city.followedReligion = null;
    expect(heal(mine) - base).toBe(0);
  });
});

describe('a worship building is offered by the city\'s majority religion', () => {
  it('another seat\'s building where the city follows its religion, none once one stands', () => {
    const { state, city } = sandboxCity();
    district(state, city, 'HOLY_SITE', 10, 9);
    city.buildings.push('SHRINE', 'TEMPLE');
    religion(state, null, null);
    seatOf(state, 0)!.religion.worship = 'WAT';
    state.seats.push(emptySeat(1));
    const r1 = seatOf(state, 1)!.religion;
    r1.founded = true;
    r1.worship = 'MOSQUE';
    const offered = () => availableBuildings(state, city).filter((b) => b.worship).map((b) => b.id);
    expect(offered()).toEqual([]);
    city.followedReligion = 1;
    expect(offered()).toEqual(['MOSQUE']);
    city.followedReligion = 0;
    expect(offered()).toEqual(['WAT']);
    // a city holding one is offered no other
    city.buildings.push('WAT');
    city.followedReligion = 1;
    expect(offered()).toEqual([]);
  });
});

describe('the Dar-e Mehr pays +1 Faith per game era since constructed or last repaired', () => {
  function withDarEMehr() {
    const { state, city } = sandboxCity();
    district(state, city, 'HOLY_SITE', 10, 9);
    city.buildings.push('SHRINE', 'TEMPLE');
    const rel = seatOf(state, 0)!.religion;
    rel.founded = true;
    rel.worship = 'DAR_E_MEHR';
    city.followedReligion = 0;
    return { state, city };
  }

  it('stamps the era it is built in and pays one Faith per era since', () => {
    const { state, city } = withDarEMehr();
    expect(BUILDINGS.DAR_E_MEHR.yieldsPerEra).toEqual({ faith: 1 });
    state.gameEra = 1;
    standBuilding(state, city, 'DAR_E_MEHR');
    expect(city.buildingEras).toEqual({ DAR_E_MEHR: 1 });
    const faith = () => computeCityStats(state, city).breakdown.buildings.faith;
    const f0 = faith();
    state.gameEra = 3;
    expect(gameEraIndex(state)).toBe(3);
    expect(faith() - f0).toBe(2);
    // a dark Dar-e Mehr pays nothing
    tileAtCoords(state.map, 10, 9).districtPillaged = true;
    expect(faith()).toBe(0);
    tileAtCoords(state.map, 10, 9).districtPillaged = false;
    // the queue completing it again (its repair) stamps the era anew
    completeQueueItem(state, city, { kind: 'building', building: 'DAR_E_MEHR', progress: 0 }, 1);
    expect(city.buildingEras).toEqual({ DAR_E_MEHR: 3 });
    expect(faith()).toBe(f0);
  });

  it('the stamp rides the city through a capture', () => {
    const { state, city } = withDarEMehr();
    state.turn = 0;
    standBuilding(state, city, 'DAR_E_MEHR');
    state.seats.push(emptySeat(1));
    expect(transferCity(state, 0, seatOf(state, 1)!, city, 'conquered')).toBe(true);
    const held = seatOf(state, 1)!.cities.find((c) => c.centerIndex === city.centerIndex)!;
    expect(held.buildings).toContain('DAR_E_MEHR');
    expect(held.buildingEras).toEqual({ DAR_E_MEHR: 0 });
  });
});
