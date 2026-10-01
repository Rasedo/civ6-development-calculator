// The autoplay importer and checks: a hand-built turn record of a 6x4 game map
// becomes the engine GameState the H-1 checks read.
import { describe, expect, it } from 'vitest';
import { advanceHistory, importTurn, newHistory } from '../../../cpu/harness/import';
import { hexDistance } from '../../../world/hex';
import { diffActions, stateChecks } from '../../../cpu/harness/checks';
import type { Catalog, DumpCity, DumpPlayer, DumpUnit, TurnRecord } from '../../../cpu/harness/record';
import { seatOfCityState } from '../../../cpu/core/seats';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX } from '../../../cpu/data/governors';

const CAT: Catalog = {
  terrains: ['TERRAIN_GRASS', 'TERRAIN_GRASS_HILLS', 'TERRAIN_PLAINS', 'TERRAIN_COAST', 'TERRAIN_OCEAN', 'TERRAIN_DESERT_MOUNTAIN'],
  features: ['FEATURE_FOREST', 'FEATURE_VOLCANO', 'FEATURE_NOT_IN_ENGINE'],
  resources: ['RESOURCE_WHEAT', 'RESOURCE_NOT_IN_ENGINE'],
  improvements: ['IMPROVEMENT_FARM', 'IMPROVEMENT_GOODY_HUT', 'IMPROVEMENT_BARBARIAN_CAMP'],
  districts: ['DISTRICT_CITY_CENTER', 'DISTRICT_CAMPUS', 'DISTRICT_SEOWON'],
  buildings: ['BUILDING_PALACE', 'BUILDING_MONUMENT', 'BUILDING_LIBRARY', 'BUILDING_MADRASA', 'BUILDING_PYRAMIDS', 'BUILDING_NOT_IN_ENGINE'],
  units: ['UNIT_WARRIOR', 'UNIT_SWORDSMAN', 'UNIT_AZTEC_EAGLE_WARRIOR', 'UNIT_SETTLER'],
  techs: ['TECH_POTTERY', 'TECH_WRITING'],
  civics: ['CIVIC_CODE_OF_LAWS'],
  policies: ['POLICY_GOD_KING'],
  governments: ['GOVERNMENT_CHIEFDOM'],
  beliefs: [],
  religions: [],
  routes: ['ROUTE_ANCIENT_ROAD'],
  projects: [],
  eras: ['ERA_ANCIENT'],
  governors: ['GOVERNOR_THE_MERCHANT'],
  promotions: ['GOVERNOR_PROMOTION_MERCHANT_LAND_ACQUISITION'],
  buildingReplaces: [['BUILDING_MADRASA', 'BUILDING_UNIVERSITY'], ['BUILDING_NOT_IN_ENGINE', 'BUILDING_LIBRARY']],
  districtReplaces: [['DISTRICT_SEOWON', 'DISTRICT_CAMPUS']],
  unitReplaces: [['UNIT_AZTEC_EAGLE_WARRIOR', 'UNIT_WARRIOR']],
  leaderInherits: [['LEADER_MINOR_CIV_GENEVA', 'LEADER_MINOR_CIV_SCIENTIFIC']],
  wonders: ['BUILDING_PYRAMIDS'],
};

const W = 6;
const H = 4;

/** a plot row: [terrain, feature, resource, count, improvement, pillaged,
 *  owner, district, wonder, wonderComplete, route, river, cliff, fresh,
 *  appeal, workers, yields, lake, routePillaged, owning city] */
function plot(terrain = 0, extra: Partial<Record<number, unknown>> = {}): (number | number[])[] {
  const p: (number | number[])[] = [terrain, -1, -1, 0, -1, 0, -1, -1, -1, 0, -1, 0, 0, 0, 0, 0, [2, 0, 0, 0, 0, 0], 0, 0, -1];
  for (const [k, v] of Object.entries(extra)) p[Number(k)] = v as number;
  return p;
}

function player(id: number, over: Partial<DumpPlayer>): DumpPlayer {
  return {
    id, major: true, minor: false, barb: false, free: false, human: false, civ: 'CIVILIZATION_ROME', leader: 'LEADER_TRAJAN',
    gold: 100, goldYield: 5, maintTotal: 0, maintBuildings: 0, maintDistricts: 0, maintUnits: 0, faith: 3, faithYield: 0,
    pantheon: -1, religionCreated: -1, scienceYield: 2, researching: 1, researchProgress: 4, researchCost: 20,
    cultureYield: 1, civic: -1, government: 0, inAnarchy: false, anarchyEnd: -1, techs: '10', techBoosts: '01', civics: '1', civicBoosts: '0',
    era: 0, eraScore: 3, darkThreshold: 8, goldenThreshold: 19, darkAge: false, goldenAge: false, heroic: false,
    favor: 0, tourism: 0, tokens: 0, suzerain: -1, policies: [0, -1], wars: [], met: [], envoysReceived: [], gpp: [],
    ...over,
  };
}

function city(over: Partial<DumpCity>): DumpCity {
  return {
    owner: 0, id: 65536, name: 'LOC_CITY_NAME_ROMA', x: 2, y: 1, pop: 3, capital: true, originalOwner: 0, occupied: false,
    yields: [0, 0, 0, 0, 0, 0], food: 4, foodSurplus: 2, growthThreshold: 16, turnsToGrow: 6, housing: 5, housingParts: [],
    housingGrowthMod: 1, happinessGrowthMod: 0, overallGrowthMod: 1, amenities: 2, amenitiesNeeded: 2, happiness: 4,
    amenityParts: [], culture: 7, cultureYield: 2, nextPlot: -1, nextPlotCost: 10, turnsToExpand: 2, loyalty: 100,
    maxLoyalty: 100, loyaltyPerTurn: 0, loyaltyLevel: 3, majorityReligion: -1, religions: [], governor: -1, buy: [],
    plotBuy: [], buildings: [[0, 0], [1, 0], [3, 0], [4, 0], [5, 0]],
    districts: [[0, 2, 1, true, false, 18, 20, 200, 0, 0], [2, 3, 2, true, false, 0, 0, 0, 0, 0]],
    worked: [8, 9, 15], plots: [7, 8, 9, 14, 15, 1, 2], queue: [],
    ...over,
  };
}

function unit(owner: number, id: number, type: number, x: number, y: number): DumpUnit {
  return { owner, id, type, x, y, damage: 10, moves: 2, maxMoves: 2, xp: 0, level: 1, formation: 0,
    buildCharges: 0, spreadCharges: 0, religion: -1, embarked: false };
}

function record(turn: number, over: Partial<TurnRecord> = {}): TurnRecord {
  const map = Array.from({ length: H }, () => Array.from({ length: W }, () => plot()));
  map[0][0] = plot(3, { 17: 1 });                        // coast in a lake
  map[0][1] = plot(4);                                   // ocean
  map[1][3] = plot(1, { 1: 0, 11: 4, 6: 0, 19: 65536 }); // hills woods, W of a river (its E edge)
  map[1][4] = plot(0, { 1: 1 });                         // a volcano
  map[1][2] = plot(2, { 6: 0, 7: 0, 19: 65536 });        // the centre
  map[1][1] = plot(0, { 2: 1, 3: 1, 6: 0, 19: 65536 });  // a resource the engine lacks
  map[2][2] = plot(0, { 2: 0, 3: 1, 4: 0, 6: 0, 19: 65536, 10: 0 });
  map[2][3] = plot(0, { 7: 2, 6: 0, 19: 65536, 15: 1 }); // the Seowon, one specialist
  map[0][2] = plot(0, { 6: 0, 19: 65536, 8: 4, 9: 1 });  // the Pyramids
  map[3][5] = plot(0, { 4: 2 });                         // a barbarian camp
  map[3][0] = plot(2, { 6: 2 });                         // the city-state's ground
  return {
    turn, seed: 12345, moved: false,
    head: { W, H, wrapX: true, localPlayer: 0 },
    map,
    players: [
      player(0, { governors: [[0, 0, 65536, true, 0, 0, [0]]] }),
      player(1, { leader: 'LEADER_NOT_IN_ROSTER', civ: 'CIVILIZATION_ELSEWHERE', wars: [0] }),
      player(2, { major: false, minor: true, leader: 'LEADER_MINOR_CIV_GENEVA', civ: 'CIVILIZATION_GENEVA', envoysReceived: [[0, 2]], suzerain: 0 }),
    ],
    religions: [],
    cities: [
      city({}),
      city({ owner: 2, id: 131072, name: 'LOC_CITY_NAME_GENEVA', x: 0, y: 3, capital: false, buildings: [[0, 0]],
        districts: [[0, 0, 3, true, false, 10, 0, 200, 0, 0]], worked: [18], plots: [18] }),
    ],
    units: [unit(0, 1, 0, 2, 1), unit(0, 2, 2, 3, 1), unit(1, 3, 0, 5, 3)],
    errors: [],
    ...over,
  };
}

describe('importTurn', () => {
  const imp = importTurn(record(10), CAT);
  const t = imp.state.map.tiles;

  it('reads terrain, elevation, features and resources, counting what the engine lacks', () => {
    expect(t[0].terrain).toBe('LAKE');
    expect(t[1].terrain).toBe('OCEAN');
    expect([t[9].terrain, t[9].elevation, t[9].feature]).toEqual(['GRASSLAND', 'HILLS', 'WOODS']);
    expect(t[10].volcano).toBe(true);
    expect(t[10].feature).toBeNull();
    expect(t[7].resource).toBeNull();
    expect(imp.gaps.get('resource:RESOURCE_NOT_IN_ENGINE')).toBe(1);
    expect(imp.tileGaps.get(7)?.has('resource:RESOURCE_NOT_IN_ENGINE')).toBe(true);
    expect(t[14].resource).toBe('WHEAT');
    expect(t[14].improvement).toBe('FARM');
    expect(t[14].road).toBe(true);
    expect(imp.state.barbSeat.camps).toEqual([23]);
  });

  it('turns the game river bits into both sides of the edge', () => {
    // plot 9 is W of the river: its E edge (engine dir 0) and plot 10's W edge (dir 3)
    expect(t[9].riverMask & 1).toBe(1);
    expect(t[10].riverMask & (1 << 3)).toBe(1 << 3);
  });

  it('seats the majors densely, the minor as a city-state, and names the roster gap', () => {
    expect(imp.seatOfPlayer.get(0)).toBe(0);
    expect(imp.seatOfPlayer.get(1)).toBe(1);
    expect(imp.seatOfPlayer.get(2)).toBe(seatOfCityState(0));
    expect(imp.state.seats[0].civ).toBeGreaterThanOrEqual(0);
    expect(imp.state.seats[1].civ).toBe(-1);
    expect(imp.gaps.get('leader:LEADER_NOT_IN_ROSTER')).toBe(1);
    expect(imp.state.seats[0].wars).toEqual([1]);
    const cs = imp.state.cityStates[0];
    expect(cs.type).toBe('scientific');
    expect(cs.envoys[0]).toBe(2);
    expect(cs.suzerain).toBe(0);
    expect(cs.centerIndex).toBe(18);
  });

  it('imports research, government and purse', () => {
    const s = imp.state.seats[0];
    expect(s.research.techs).toEqual(['POTTERY']);
    expect(s.research.boosted).toEqual(['WRITING']);
    expect(s.research.tech).toBe('WRITING');
    expect(s.research.techProgress).toBe(4);
    expect(s.research.civics).toEqual(['CODE_OF_LAWS']);
    expect(s.government.chosen).toBe('CHIEFDOM');
    expect(s.government.policies).toEqual(['GOD_KING']);
    expect([s.treasury, s.faith, s.eraScore]).toEqual([100, 3, 3]);
  });

  it('builds the city: plots, worked plots, buildings, districts, wonders and specialists', () => {
    const c = imp.state.seats[0].cities[0];
    expect(c.centerIndex).toBe(8);
    expect(c.population).toBe(3);
    expect(c.buildings).toEqual(['PALACE', 'MONUMENT', 'UNIVERSITY', 'LIBRARY']);
    expect(imp.gaps.get('building-as-base:BUILDING_MADRASA')).toBeUndefined();
    expect(imp.gaps.get('building-as-base:BUILDING_NOT_IN_ENGINE')).toBe(1);
    expect(imp.cityGaps.get('0:65536')?.has('building-as-base:BUILDING_NOT_IN_ENGINE')).toBe(true);
    expect(c.wonders).toEqual([{ id: 'PYRAMIDS', tileIndex: 2 }]);
    expect(c.districts.map((d) => d.type)).toEqual(['CITY_CENTER', 'CAMPUS']);
    expect(t[15].district).toBe('CAMPUS');
    expect(t[8].district).toBe('CITY_CENTER');
    expect(c.hp).toBe(180);
    for (const q of [7, 8, 9, 14, 15, 1, 2]) expect([t[q].ownerSeat, t[q].ownerCity]).toEqual([0, c.id]);
    expect(t[9].locked).toBe(true);
    expect(t[14].locked).toBeUndefined();
    expect(c.specialistPref?.filter((n) => n > 0)).toEqual([1]);
  });

  it('seats the governor in its city with its promotions', () => {
    const g = imp.state.seats[0].governors![GOVERNOR_INDEX.REYNA];
    expect(g.appointed).toBe(true);
    expect(g.cityId).toBe(imp.state.seats[0].cities[0].id);
    expect(g.establishTurns).toBe(0);
    expect(g.promotions).toBe(1 << GOVERNOR_PROMOTION_INDEX.LAND_ACQUISITION);
  });

  it('maps a unique unit to the row it replaces', () => {
    expect(imp.state.units.map((u) => [u.type, u.seat, u.tileIndex, u.hp])).toEqual([
      ['WARRIOR', 0, 8, 90], ['WARRIOR', 0, 9, 90], ['WARRIOR', 1, 23, 90],
    ]);
    expect(imp.gaps.get('unit-as-base:UNIT_AZTEC_EAGLE_WARRIOR')).toBe(1);
  });
});

describe('the history', () => {
  it('carries the best melee trained and the culture expansions', () => {
    const h = newHistory();
    const a = record(1);
    const b = record(2, {
      units: [...record(1).units, unit(0, 9, 1, 2, 2)],
      cities: [city({ culture: 1 }), record(1).cities[1]],
    });
    advanceHistory(h, a, CAT);
    advanceHistory(h, b, CAT);
    expect(h.bestMelee.get(0)).toBe(35);
    expect(h.cultureTaken.get(8)).toBe(1);
    const imp = importTurn(b, CAT, h);
    expect(imp.state.seats[0].bestMeleeCS).toBe(35);
    expect(imp.state.seats[0].cities[0].tilesAcquired).toBe(1);
    expect(imp.tilesUnknown.size).toBe(0);
  });

  it('marks the cities standing before a record that starts late', () => {
    const h = newHistory();
    advanceHistory(h, record(40), CAT);
    expect(importTurn(record(40), CAT, h).tilesUnknown.has(8)).toBe(true);
  });
});

describe('the wrap', () => {
  it('the imported map wraps in x as the record head says', () => {
    const map = importTurn(record(10), CAT).state.map;
    expect(map.wrapX).toBe(true);
    expect(hexDistance(map, 0, 0, 5, 0)).toBe(1);
    expect(hexDistance(map, 0, 0, 2, 0)).toBe(2);
  });
});

describe('the checks', () => {
  it('compare a plain plot and a seam plot', () => {
    const rs = stateChecks(record(10), CAT);
    const plot = (i: number) => rs.find((r) => r.check === 'plot.yields' && r.subject.startsWith(`plot ${i} `));
    expect(plot(13)?.ok).toBe(true);
    expect(plot(6)?.skip).toBeUndefined();
  });

  it('read the actions off two records: a new unit and a spent charge', () => {
    const a = record(10, { units: [{ ...record(10).units[0], spreadCharges: 2, religion: 3 }] });
    const b = record(11, { units: [{ ...record(10).units[0], spreadCharges: 1, religion: 3 }, record(10).units[1]] });
    const acts = diffActions(a, b);
    expect(acts.unitsNew.map((u) => u.plot)).toEqual([9]);
    expect(acts.spreads).toEqual([{ owner: 0, religion: 3, plot: 8 }]);
  });
});
