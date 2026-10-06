// The autoplay importer and checks: a hand-built turn record of a 6x4 game map
// becomes the engine GameState the H-1 checks read.
import { describe, expect, it } from 'vitest';
import { advanceHistory, citiesNotStarted, importTurn, newHistory, notStarted } from '../../../cpu/harness/import';
import { hexDistance } from '../../../world/hex';
import { diffActions, stateChecks } from '../../../cpu/harness/checks';
import type { Catalog, DumpCity, DumpPlayer, DumpUnit, TurnRecord } from '../../../cpu/harness/record';
import { seatOfCityState } from '../../../cpu/core/seats';
import { envoysHere } from '../../../cpu/core/cityStates';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX } from '../../../cpu/data/governors';
import { gameHash } from '../../../cpu/harness/aliases';
import { eraEvents, transitionChecks } from '../../../cpu/harness/checks';
import { GW_HOLDERS, GWO_RELIC, GWO_WRITING, holderSlots } from '../../../cpu/data/greatWorks';
import { GP_CITY_PERM, GREAT_PEOPLE } from '../../../cpu/data/greatPeople';
import { CONGRESS_RESOLUTIONS, DEAL_LUXURY, UDT_DISTRICTS, DEAL_TURNS, MOMENT_PANTHEON_FIRST } from '../../../cpu/data/seats';
import { LUXURY_IDS } from '../../../world/resources';
import { settlerCost } from '../../../cpu/core/game';
import { clearableFeatures } from '../../../world/features';

const CAT: Catalog = {
  terrains: ['TERRAIN_GRASS', 'TERRAIN_GRASS_HILLS', 'TERRAIN_PLAINS', 'TERRAIN_COAST', 'TERRAIN_OCEAN', 'TERRAIN_DESERT_MOUNTAIN'],
  features: ['FEATURE_FOREST', 'FEATURE_VOLCANO', 'FEATURE_NOT_IN_ENGINE'],
  resources: ['RESOURCE_WHEAT', 'RESOURCE_NOT_IN_ENGINE', 'RESOURCE_WINE'],
  improvements: ['IMPROVEMENT_FARM', 'IMPROVEMENT_GOODY_HUT', 'IMPROVEMENT_BARBARIAN_CAMP', 'IMPROVEMENT_PLANTATION'],
  districts: ['DISTRICT_CITY_CENTER', 'DISTRICT_CAMPUS', 'DISTRICT_SEOWON'],
  buildings: ['BUILDING_PALACE', 'BUILDING_MONUMENT', 'BUILDING_LIBRARY', 'BUILDING_MADRASA', 'BUILDING_PYRAMIDS', 'BUILDING_NOT_IN_ENGINE',
    'BUILDING_AMPHITHEATER', 'BUILDING_BANK'],
  units: ['UNIT_WARRIOR', 'UNIT_SWORDSMAN', 'UNIT_AZTEC_EAGLE_WARRIOR', 'UNIT_SETTLER'],
  techs: ['TECH_POTTERY', 'TECH_WRITING'],
  civics: ['CIVIC_CODE_OF_LAWS'],
  policies: ['POLICY_GOD_KING'],
  governments: ['GOVERNMENT_CHIEFDOM'],
  beliefs: ['BELIEF_GOD_OF_THE_FORGE'],
  religions: ['RELIGION_TAOISM'],
  routes: ['ROUTE_ANCIENT_ROAD'],
  projects: ['PROJECT_ENHANCE_DISTRICT_CAMPUS'],
  eras: ['ERA_ANCIENT'],
  governors: ['GOVERNOR_THE_MERCHANT', 'GOVERNOR_THE_AMBASSADOR'],
  promotions: ['GOVERNOR_PROMOTION_MERCHANT_LAND_ACQUISITION', 'GOVERNOR_PROMOTION_MERCHANT_HARBORMASTER', 'GOVERNOR_PROMOTION_AMBASSADOR_MESSENGER'],
  buildingReplaces: [['BUILDING_MADRASA', 'BUILDING_UNIVERSITY'], ['BUILDING_NOT_IN_ENGINE', 'BUILDING_LIBRARY']],
  districtReplaces: [['DISTRICT_SEOWON', 'DISTRICT_CAMPUS']],
  unitReplaces: [['UNIT_AZTEC_EAGLE_WARRIOR', 'UNIT_WARRIOR']],
  leaderInherits: [['LEADER_MINOR_CIV_GENEVA', 'LEADER_MINOR_CIV_SCIENTIFIC']],
  wonders: ['BUILDING_PYRAMIDS'],
  greatWorks: [
    ['GREATWORK_HOMER_1', 'GREATWORKOBJECT_WRITING', 'GREAT_PERSON_INDIVIDUAL_HOMER', ''],
    ['GREATWORK_RELIC_1', 'GREATWORKOBJECT_RELIC', '', ''],
  ],
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
      player(0, { governors: [[0, 0, 65536, true, 0, 0, [0, 1]]] }),
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
    // the default title is held implicitly: only the promotion taken sets a bit
    expect(g.promotions).toBe(1 << GOVERNOR_PROMOTION_INDEX.HARBORMASTER);
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
    // the box falls on the next plot the city held: the culture paid for it
    const a = record(1, { cities: [city({ nextPlot: 9 }), record(1).cities[1]] });
    const b = record(2, {
      units: [...record(1).units, unit(0, 9, 1, 2, 2)],
      cities: [city({ culture: 1 }), record(1).cities[1]],
    });
    advanceHistory(h, a, CAT);
    advanceHistory(h, b, CAT);
    expect(h.bestMelee.get(0)).toBe(35);
    expect(h.cultureTaken.get(8)).toBe(1);
    // a box that falls with no next plot held pays for none
    const h2 = newHistory();
    advanceHistory(h2, record(1), CAT);
    advanceHistory(h2, b, CAT);
    expect(h2.cultureTaken.get(8)).toBeUndefined();
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

  it('raises the best melee on no unit first seen embarked', () => {
    const h = newHistory();
    advanceHistory(h, record(1), CAT);
    advanceHistory(h, record(2, { units: [...record(1).units, { ...unit(0, 9, 1, 2, 2), embarked: true }] }), CAT);
    expect(h.bestMelee.get(0) ?? 0).toBe(0);
  });
});

describe('the recorded random events', () => {
  const cat: Catalog = { ...CAT, randomEvents: ['RANDOM_EVENT_DROUGHT_MAJOR', 'RANDOM_EVENT_FLOOD_MODERATE'] };
  it('dry a recorded drought\'s footprint for its turns at the game speed', () => {
    const h = newHistory();
    const at = 1 * W + 3;
    const ev = (turn: number) => [[turn, 0, at, at, 0, 0, 0, 0]] as TurnRecord['events'];
    advanceHistory(h, record(9, { events: [] }), cat);
    const dry = (turn: number) => {
      const r = record(turn, { events: ev(10) });
      advanceHistory(h, r, cat);
      return importTurn(r, cat, h).state.map.tiles[at].droughtTurns;
    };
    expect(dry(10)).toBe(2);
    expect(dry(11)).toBe(1);
    expect(dry(12)).toBe(0);
  });

  it('read no yields off the records where the records carry events', () => {
    // a bare plot's Food rises with no event recorded: no fertility lands
    const h = newHistory();
    const at = 2 * W + 4;
    advanceHistory(h, record(9, { events: [] }), cat);
    const b = record(10, { events: [] });
    b.map[2][4] = plot(0, { 16: [3, 0, 0, 0, 0, 0] });
    advanceHistory(h, b, cat);
    expect(importTurn(b, cat, h).state.map.tiles[at].fertility).toBe(0);
    // without events the reading lands
    const h2 = newHistory();
    advanceHistory(h2, record(9), cat);
    const c = record(10);
    c.map[2][4] = plot(0, { 16: [3, 0, 0, 0, 0, 0] });
    advanceHistory(h2, c, cat);
    expect(importTurn(c, cat, h2).state.map.tiles[at].fertility).toBe(1);
  });
});

describe('the turn-start witness', () => {
  it('names the players whose start ran between two records, and those a dump caught midway', () => {
    // the boxes stand still in both records: read off them, every major is late
    const a = record(5);
    const b = record(6);
    expect([...notStarted(a, b)]).toEqual([0, 2]);
    // the witness says player 0's start completed between them, player 2's not
    const wa = record(5, { starts: { 0: [5, 5], 2: [4, 4] } });
    const wb = record(6, { starts: { 0: [6, 6], 2: [4, 4] } });
    expect([...notStarted(wa, wb)]).toEqual([2]);
    expect(citiesNotStarted(wa, wb).size).toBe(0);
    // a dump that caught player 0's start begun and not done
    const mid = record(6, { starts: { 0: [6, 5], 2: [5, 5] } });
    expect([...citiesNotStarted(wa, mid)]).toEqual(['0:65536']);
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
    expect(acts.spreads.map(({ owner, religion, plot, n }) => ({ owner, religion, plot, n })))
      .toEqual([{ owner: 0, religion: 3, plot: 8, n: 1 }]);
  });
});

const holder = (id: string) => GW_HOLDERS.findIndex((h) => h.id === id);

describe('the great works', () => {
  it('place each work in its holder slot with its object and maker', () => {
    const rec = record(10, { cities: [city({ buildings: [[0, 0], [1, 0], [6, 0]],
      greatWorks: [[6, 1, 7, 0], [0, 0, 8, 1]] }), record(10).cities[1]] });
    const c = importTurn(rec, CAT).state.seats[0].cities[0];
    expect(c.greatWorks).toEqual([
      { slot: holderSlots(holder('PALACE'))[0], obj: GWO_RELIC, maker: -1, era: -1, seat: 0 },
      { slot: holderSlots(holder('AMPHITHEATER'))[1], obj: GWO_WRITING,
        maker: GREAT_PEOPLE.WRITER.findIndex((p) => p.id === 'GP_HOMER'), era: -1, seat: 0 },
    ].sort((a, b) => a.slot - b.slot));
  });

  it('read a work in a Bank as the widening Giovanni de’ Medici left', () => {
    const rec = record(10, { cities: [city({ buildings: [[0, 0], [7, 0]], greatWorks: [[7, 0, 9, 0]] }),
      record(10).cities[1]] });
    const c = importTurn(rec, CAT).state.seats[0].cities[0];
    expect(c.greatWorks?.map((w) => w.slot)).toEqual([holderSlots(holder('BANK'))[0]]);
    expect(c.gpPerm?.[GP_CITY_PERM.indexOf('bankGwSlots')]).toBe(2);
  });
});

describe('the World Congress', () => {
  it('hashes a type name as the game does', () => {
    expect(gameHash('MAPSIZE_DUEL')).toBe(388991850);
    expect(gameHash('WC_RES_WORLD_RELIGION')).toBe(-1311232414);
  });

  it('carries each resolution with its outcome and target', () => {
    const rec = record(10, {
      religions: [{ Religion: 0, Founder: 0, Beliefs: [] }],
      congress: {
        1: { Type: gameHash('WC_RES_WORLD_RELIGION'), ChosenLabel: 'A', ChosenThing: 'LOC_RELIGION_TAOISM' },
        2: { Type: gameHash('WC_RES_URBAN_DEVELOPMENT'), ChosenLabel: 'Б', ChosenThing: 'LOC_DISTRICT_CAMPUS_NAME' },
        3: { Type: gameHash('WC_RES_URBAN_DEVELOPMENT'), ChosenLabel: 'A', ChosenThing: 'LOC_DISTRICT_CITY_CENTER_NAME' },
        4: { Type: gameHash('WC_RES_TRADE_TREATY'), ChosenLabel: 'A', ChosenThing: '1' },
        5: { Type: gameHash('WC_RES_DEFORESTATION_TREATY'), ChosenLabel: 'A', ChosenThing: 'LOC_FEATURE_JUNGLE_NAME' },
        6: { Type: gameHash('WC_RES_DIPLOVICTORY'), ChosenLabel: 'A', ChosenThing: '1' },
        Stage: -2147483648,
      },
    });
    const imp = importTurn(rec, CAT);
    const res = (id: string) => CONGRESS_RESOLUTIONS.findIndex((r) => r.id === id);
    expect(imp.state.congress).toEqual([
      { res: res('WORLD_RELIGION'), outcome: 0, target: 0 },
      { res: res('URBAN_DEVELOPMENT_TREATY'), outcome: 1, target: UDT_DISTRICTS.indexOf('CAMPUS') },
      { res: res('URBAN_DEVELOPMENT_TREATY'), outcome: 0, target: UDT_DISTRICTS.indexOf('CITY_CENTER') },
      { res: res('TRADE_POLICY'), outcome: 0, target: 1 },
      { res: res('DEFORESTATION_TREATY'), outcome: 0, target: clearableFeatures().indexOf('RAINFOREST') },
    ]);
    expect(imp.congressGaps).toEqual([]);
  });
});

describe('the build queue', () => {
  const queue = [{ UnitType: 3 }, { BuildingType: 2 }, { DistrictType: 1, Location: { x: 4, y: 2 } },
    { BuildingType: 4, Location: { x: 1, y: 2 } }, { ProjectType: 0 }];

  it('carries each entry as the engine item, its progress where the record has it', () => {
    const rec = record(10, { cities: [city({ queue, queueProgress: [5, 7, 'err:no reader', 0, 2] }), record(10).cities[1]] });
    const imp = importTurn(rec, CAT);
    const q = imp.state.seats[0].cities[0].queue;
    expect(q.map((x) => [x.kind, x.progress])).toEqual([['settler', 5], ['building', 7], ['district', 0], ['wonder', 0], ['project', 2]]);
    // the price the engine would lock queueing it into an empty queue
    expect(q[0]).toMatchObject({ cost: settlerCost(importTurn(record(10), CAT).state, 0) });
    expect(q[1]).toMatchObject({ building: 'LIBRARY' });
    expect(q[2]).toMatchObject({ district: 'CAMPUS', tileIndex: 16 });
    expect((q[2] as { cost: number }).cost).toBeGreaterThan(0);
    expect(q[3]).toMatchObject({ wonder: 'PYRAMIDS', tileIndex: 13 });
    expect(q[4]).toMatchObject({ project: 'RESEARCH_GRANTS' });
    expect(imp.queueProgressRead).toBe(true);
  });

  it('stands every item at 0 when the record carries no progress', () => {
    const imp = importTurn(record(10, { cities: [city({ queue }), record(10).cities[1]] }), CAT);
    expect(imp.state.seats[0].cities[0].queue.every((x) => x.progress === 0)).toBe(true);
    expect(imp.queueProgressRead).toBe(false);
  });
});

describe('the ages', () => {
  const at = (turn: number, eraScore: number, dark: number, golden: number, flags: Partial<DumpPlayer> = {}) =>
    record(turn, { players: [player(0, { eraScore, darkThreshold: dark, goldenThreshold: golden, ...flags }), ...record(turn).players.slice(1)] });

  it('fold every era transition into the past ages; the era score and the bars are the game\'s', () => {
    const h = newHistory();
    const recs = [at(1, 0, 8, 19), at(2, 5, 8, 19), at(3, 6, 12, 23, { darkAge: true }),
      at(4, 30, 43, 54, { goldenAge: true, heroic: true })];
    for (const r of recs) advanceHistory(h, r, CAT);
    expect(h.eraTurns).toEqual([3, 4]);
    const s = importTurn(recs[3], CAT, h).state.seats[0];
    expect([s.age, s.prevAge, s.darkAges, s.goldenAges]).toEqual([2, 0, 1, 1]);
    expect([s.eraScore, s.darkBar, s.goldenBar]).toEqual([30, 43, 54]);
    expect([h.gameEra, h.eraStartTurn, h.eraCountdown]).toEqual([2, 4, -1]);
  });
});

describe('the era checks', () => {
  const antium = city({ id: 65537, name: 'LOC_CITY_NAME_ANTIUM', x: 4, y: 2, capital: false, buildings: [],
    districts: [[0, 4, 2, true, false, 10, 0, 200, 0, 0]], worked: [], plots: [16] });

  it('read a founded city and a pantheon off the pair', () => {
    const a = record(10);
    const b = record(11, { cities: [...record(11).cities, antium], players: [player(0, { pantheon: 0 }), ...record(11).players.slice(1)] });
    expect(eraEvents(a, b, CAT).get(0)?.events.map(([w]) => w)).toEqual(['found ANTIUM', 'pantheon']);
  });

  it('pay them through the engine and compare with the game', () => {
    const a = record(10);
    const b = record(11, {
      cities: [city({ food: 6, culture: 9 }), record(11).cities[1], antium],
      players: [player(0, { pantheon: 0, eraScore: 3 + MOMENT_PANTHEON_FIRST }), ...record(11).players.slice(1)],
    });
    const r = transitionChecks(a, b, CAT).find((x) => x.check === 'step.eraScore' && x.subject.startsWith('seat 0 '));
    // a plain founding records no moment; the world's first pantheon pays its row
    expect(r).toMatchObject({ ok: true, game: MOMENT_PANTHEON_FIRST, ours: MOMENT_PANTHEON_FIRST });
  });
});

describe("a governor's envoys", () => {
  it("come back out of the game's envoy count, which already holds them", () => {
    // `GetTokensReceived` read 3 -> 5 the turn Amani established (runs/h1_duelw1105, Nalanda t63-67)
    const r = record(10);
    r.players = [
      player(0, { governors: [[1, 2, 131072, true, 0, 0, [2]]] }), r.players[1],
      player(2, { major: false, minor: true, leader: 'LEADER_MINOR_CIV_GENEVA', civ: 'CIVILIZATION_GENEVA', envoysReceived: [[0, 5]], suzerain: 0 }),
    ];
    const imp = importTurn(r, CAT);
    const cs = imp.state.cityStates[0];
    expect(imp.state.seats[0].governors![GOVERNOR_INDEX.AMANI].promotions).toBe(0);
    expect(cs.envoys[0]).toBe(3);
    expect(envoysHere(imp.state, cs, 0)).toBe(5);
  });
});

describe('the luxuries that cross', () => {
  /** seat 0 works two improved Wine plots (7 and 14); the players' luxury
   *  rows are the record's [resource, held, exported] */
  function wines(lux0: [number, number, number][], lux1: [number, number, number][]): TurnRecord {
    const r = record(10);
    r.map[1][1] = plot(0, { 2: 2, 3: 1, 4: 3, 6: 0, 19: 65536 });
    r.map[2][2] = plot(0, { 2: 2, 3: 1, 4: 3, 6: 0, 19: 65536 });
    r.players = [player(0, { luxuries: lux0 }), player(1, { luxuries: lux1 }), r.players[2]];
    return r;
  }

  it('carries an export matched to an import as a running luxury deal', () => {
    const imp = importTurn(wines([[2, 1, 1]], [[2, 1, 0]]), CAT);
    expect(imp.state.dealTerms?.['0>1']).toEqual({ left: DEAL_TURNS, items: [[DEAL_LUXURY, LUXURY_IDS.indexOf('WINE'), 1]] });
    expect([...imp.gaps.keys()].filter((k) => k.startsWith('luxury'))).toEqual([]);
  });

  it('leaves an import nobody exported as the seat gap', () => {
    const imp = importTurn(wines([[2, 2, 0]], [[2, 1, 0]]), CAT);
    expect(imp.state.dealTerms?.['0>1']).toBeUndefined();
    expect(imp.seatGaps.get(1)?.has('luxury-imported:RESOURCE_WINE')).toBe(true);
    expect(imp.seatGaps.get(0)?.has('luxury-imported:RESOURCE_WINE')).toBeFalsy();
  });
});
