/**
 * THE ECONOMY RESIDUE, TS side: a building's purchase price off its
 * fractional scaled cost, the policy unlock's Gold, a city-state's Palace, the
 * Great Prophet's one-per-player cap, the Dar-e Mehr's era Faith in a Holy
 * Site's healing faith, the renewable and water rows' feature refusal and the
 * builder's governor-gated jobs. The GPU twin is tests/gpu/eco_residue_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics, grantTechs, standDistrict } from '../helpers';
import { emptySeat, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { buildingPurchaseCost, buildingFaithCost, unitPurchaseCost } from '../../../cpu/core/game';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { faithPrice, goldPrice, makeYieldCtx, policyUnlockCost, seatGovernment } from '../../../cpu/core/effects';
import { minorCity } from '../../../cpu/core/cityStates';
import { computeCityStats } from '../../../cpu/core/city';
import { advanceGreatPeople, gpCapped, patronizeGreatPerson } from '../../../cpu/core/greatPeople';
import { holySiteFaith } from '../../../cpu/core/units';
import { gameEraIndex } from '../../../cpu/core/yields';
import { validImprovements, validImprovementsIn } from '../../../cpu/core/rules';
import { governorsOf } from '../../../cpu/core/governors';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { builderJobAt, jobCtx } from '../../../cpu/core/targetSites';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { GREAT_PEOPLE, GP_CLASSES } from '../../../cpu/data/greatPeople';
import { GOVERNMENT_LIST, POLICY_LIST } from '../../../cpu/data/policies';
import { CIVIC_UNLOCK_MAX_COST, CIVIC_UNLOCK_MIN_COST, CIVIC_UNLOCK_PER_TURN_DROP, GAME_SPEED, POLICY_UNLOCK_K_BASE, POLICY_UNLOCK_K_PER_TECH, POLICY_UNLOCK_ROUND } from '../../../cpu/data/constants';
import { tilesWithin } from '../../../world/hex';
import type { CityState, GameState, SeatActionRecord } from '../../../cpu/core/types';

const GOV = (id: string) => GOVERNMENT_LIST.findIndex((g) => g.id === id);
const REC = (government?: number, policies?: number[]): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], government, policies });

describe('a building buys off its fractional scaled cost', () => {
  it('prices the Granary (Cost 65) at 130 gold and 65 faith, as the lab record reads', () => {
    const state = makeState();
    settleAt(state, tileAtCoords(state.map, 5, 5).index);
    expect(BUILDINGS.GRANARY.cost).toBe(32);
    expect(BUILDINGS.GRANARY.buyCost).toBe(65 * GAME_SPEED);
    expect(goldPrice(state, 0, buildingPurchaseCost(state, 0, 'GRANARY'))).toBe(130);
    expect(faithPrice(state, 0, buildingFaithCost(state, 0, 'GRANARY'))).toBe(65);
    expect(goldPrice(state, 0, buildingPurchaseCost(state, 0, 'WORKSHOP'))).toBe(390);
    // a unit keeps the truncated cost: the Slinger (Cost 35) buys for 65
    expect(goldPrice(state, 0, unitPurchaseCost(state, 'SLINGER', 0))).toBe(65);
  });
});

describe('the policy unlock', () => {
  function scene(): GameState {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    grantCivics(state, 'CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    return state;
  }

  it('is free the turn after a civic, then the maximum, dropping a step a turn to the minimum, times k', () => {
    const state = scene();
    const s = seatOf(state, 0)!;
    expect([CIVIC_UNLOCK_MAX_COST, CIVIC_UNLOCK_PER_TURN_DROP, CIVIC_UNLOCK_MIN_COST]).toEqual([50, 5, 10]);
    expect([POLICY_UNLOCK_K_BASE, POLICY_UNLOCK_K_PER_TECH, POLICY_UNLOCK_ROUND]).toEqual([15, 1, 5]);
    s.government.civicTurn = 10;
    // no techs: k = 1.5 — 75, 67.5 rounded half up to 70, the floor 15
    s.research.techs = [];
    const at = (turn: number) => { state.turn = turn; return policyUnlockCost(state, 0); };
    expect([at(11), at(12), at(13), at(100)]).toEqual([0, 75, 70, 15]);
    // 31 techs: k = 4.6 — the lab's jump to 230 at 31 techs, 207 to 205, the
    // floor 46 to 45
    s.research.techs = Array.from({ length: 31 }, (_, i) => `TECH_${i}`);
    expect([at(11), at(12), at(13), at(100)]).toEqual([0, 230, 205, 45]);
  });

  it('charges a government change outside the window once, and refuses one the purse cannot meet', () => {
    const state = scene();
    const s = seatOf(state, 0)!;
    s.government.civicTurn = 1;
    s.research.techs = [];
    state.turn = 5; // three turns past the window: the row's 40 at k = 1.5
    const cost = policyUnlockCost(state, 0);
    expect(cost).toBe(60);
    s.treasury = cost - 1;
    applySeatActionRecord(state, s, REC(GOV('OLIGARCHY')));
    expect(seatGovernment(state, 0)).toBe('AUTOCRACY');
    expect(s.treasury).toBe(cost - 1);
    s.treasury = cost + 7;
    // the government and a new card set in one record pay once
    const card = POLICY_LIST.findIndex((p) => p.id === 'DISCIPLINE');
    applySeatActionRecord(state, s, REC(GOV('OLIGARCHY'), [card]));
    expect(seatGovernment(state, 0)).toBe('OLIGARCHY');
    expect(s.government.policies).toContain('DISCIPLINE');
    expect(s.treasury).toBe(7);
    // naming what the seat already holds changes nothing and costs nothing
    applySeatActionRecord(state, s, REC(GOV('OLIGARCHY'), [card]));
    expect(s.treasury).toBe(7);
  });

  it('is free in the window', () => {
    const state = scene();
    const s = seatOf(state, 0)!;
    s.government.civicTurn = 4;
    state.turn = 5;
    s.treasury = 0;
    applySeatActionRecord(state, s, REC(GOV('CLASSICAL_REPUBLIC')));
    expect(seatGovernment(state, 0)).toBe('CLASSICAL_REPUBLIC');
    expect(s.treasury).toBe(0);
  });
});

describe('a city-state holds the Palace', () => {
  it('its city earns the Palace\'s +5 Gold and its other yields', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const center = tileAtCoords(state.map, 6, 6);
    const cs: CityState = {
      ...emptySeat(seatOfCityState(0)),
      id: 0, name: 'CS0', type: 'religious', centerIndex: center.index, population: 1, envoys: {}, met: [0],
    };
    for (const t of tilesWithin(state.map, 6, 6, 1)) setTileOwner(t, seatOfCityState(0));
    state.cityStates.push(cs);
    state.cityStateMax = 1;
    const city = minorCity(cs);
    expect(city.buildings).toContain('PALACE');
    const withPalace = computeCityStats(state, city).total;
    const bare = computeCityStats(state, { ...city, buildings: city.buildings.filter((b) => b !== 'PALACE') }).total;
    expect(withPalace.gold - bare.gold).toBe(BUILDINGS.PALACE.yields!.gold);
    expect(BUILDINGS.PALACE.yields!.gold).toBe(5);
    expect(withPalace.production).toBeGreaterThan(bare.production);
  });
});

describe('the Great Prophet, one per player', () => {
  it('a seat that has earned its Prophet takes no other', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const s = seatOf(state, 0)!;
    const ci = GP_CLASSES.indexOf('PROPHET');
    expect(gpCapped(s, 'PROPHET')).toBe(false);
    s.gpEarned.push(GREAT_PEOPLE.PROPHET[0].id);
    expect(gpCapped(s, 'PROPHET')).toBe(true);
    expect(gpCapped(s, 'GENERAL')).toBe(false);
    s.gpp.PROPHET = 100000;
    s.faith = 100000;
    s.treasury = 100000;
    const before = state.units.length;
    advanceGreatPeople(state, 0);
    expect(state.units.filter((u) => u.type === 'PROPHET').length).toBe(0);
    expect(state.units.length).toBe(before);
    expect(s.gpp.PROPHET).toBeGreaterThanOrEqual(100000); // the points wait
    expect(patronizeGreatPerson(state, 0, ci, 'faith').ok).toBe(false);
  });
});

describe('a Holy Site\'s healing faith counts the Dar-e Mehr\'s era Faith', () => {
  it('adds a Faith per era since the Dar-e Mehr was built', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    grantTechs(state, 'ASTROLOGY');
    const hs = tileAtCoords(state.map, 6, 5);
    standDistrict(state, city, 'HOLY_SITE', hs.index);
    city.buildings.push('SHRINE', 'TEMPLE', 'DAR_E_MEHR');
    const ctx = makeYieldCtx(state, 0);
    const era = gameEraIndex(state);
    city.buildingEras = { DAR_E_MEHR: era };
    const now = holySiteFaith(state, hs, ctx);
    city.buildingEras = { DAR_E_MEHR: era - 2 };
    expect(holySiteFaith(state, hs, ctx)).toBe(now + 2 * BUILDINGS.DAR_E_MEHR.yieldsPerEra!.faith!);
    // a pillaged building pays none of its Faith
    city.pillagedBuildings = ['DAR_E_MEHR'];
    expect(holySiteFaith(state, hs, ctx)).toBe(now - BUILDINGS.DAR_E_MEHR.yields!.faith!);
  });
});

describe('a row with no Improvement_ValidFeatures row refuses a feature plot', () => {
  it('the Solar Farm refuses Woods; the Fishery and the Polder refuse a Reef', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const t = tileAtCoords(state.map, 3, 3);
    const opts = { unlocks: null, ownsTile: () => true, map: state.map };
    expect(validImprovementsIn(t, opts)).toContain('SOLAR_FARM');
    t.feature = 'WOODS';
    expect(validImprovementsIn(t, opts)).not.toContain('SOLAR_FARM');
    const h = tileAtCoords(state.map, 3, 6);
    h.elevation = 'HILLS';
    expect(validImprovementsIn(h, opts)).toContain('WIND_FARM');
    h.feature = 'WOODS';
    expect(validImprovementsIn(h, opts)).not.toContain('WIND_FARM');
    const c = tileAtCoords(state.map, 8, 8);
    c.terrain = 'COAST';
    const water = { ...opts, civ: 'NETHERLANDS', govPromos: new Set(['AQUACULTURE']) };
    const bare = validImprovementsIn(c, water);
    expect(bare).toEqual(expect.arrayContaining(['FISHERY', 'POLDER', 'OFFSHORE_WIND_FARM']));
    c.feature = 'REEF';
    const onReef = validImprovementsIn(c, water);
    expect(onReef).not.toContain('FISHERY');
    expect(onReef).not.toContain('POLDER');
    expect(onReef).not.toContain('OFFSHORE_WIND_FARM');
  });
});

describe('the builder\'s job plane reads the owning city\'s governor', () => {
  it('a City Park is a job only where the governor holds its promotion', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    grantCivics(state, 'GAMES_AND_RECREATION');
    // a Snow plot: no Farm, Mine or Lumber Mill, so only the Park could work it
    const t = tilesWithin(state.map, 5, 5, 1).find((x) => x.index !== city.centerIndex)!;
    t.terrain = 'SNOW';
    t.feature = null;
    t.resource = null;
    setTileOwner(t, 0, city.id);
    expect(builderJobAt(state, jobCtx(state, 0), t)).toBe(false);
    const g = governorsOf(seatOf(state, 0)!)[GOVERNOR_INDEX.LIANG];
    g.appointed = true;
    g.cityId = city.id;
    g.establishTurns = 0;
    g.promotions = promotionBitValue(GOVERNOR_PROMOTION_INDEX.PARKS_AND_RECREATION!);
    expect(validImprovements(state, t, 0)).toContain('CITY_PARK');
    expect(builderJobAt(state, jobCtx(state, 0), t)).toBe(true);
  });
});
