// The action replay's decisions: what a pair of hand-built turn records says
// each player chose, read off the snapshots' difference and off the record's
// own event log.
import { describe, expect, it } from 'vitest';
import { InferredActions, RecordedActions, activePlayer, headCompleted, type Decision } from '../../../cpu/harness/replayActions';
import type { Catalog, DumpCity, DumpPlayer, DumpUnit, TurnRecord } from '../../../cpu/harness/record';
import { gameHash } from '../../../cpu/harness/aliases';

const CAT: Catalog = {
  terrains: ['TERRAIN_GRASS'], features: ['FEATURE_FOREST'], resources: ['RESOURCE_WHEAT'],
  improvements: ['IMPROVEMENT_FARM', 'IMPROVEMENT_GOODY_HUT', 'IMPROVEMENT_BARBARIAN_CAMP'],
  districts: ['DISTRICT_CITY_CENTER', 'DISTRICT_CAMPUS'], buildings: ['BUILDING_PALACE', 'BUILDING_MONUMENT', 'BUILDING_GRANARY'],
  units: ['UNIT_SETTLER', 'UNIT_BUILDER', 'UNIT_WARRIOR'], techs: ['TECH_POTTERY', 'TECH_MINING'], civics: ['CIVIC_CODE_OF_LAWS'],
  policies: ['POLICY_GOD_KING', 'POLICY_DISCIPLINE'], governments: ['GOVERNMENT_CHIEFDOM'], beliefs: ['BELIEF_GOD_OF_THE_FORGE'],
  religions: [], routes: [], projects: [], eras: ['ERA_ANCIENT'], governors: [], promotions: [],
  buildingReplaces: [], districtReplaces: [], unitReplaces: [], leaderInherits: [], wonders: [],
};

const W = 8;
const H = 6;

/** a plot row: [terrain, feature, resource, count, improvement, pillaged, owner, district, wonder, ...] */
function plot(extra: Partial<Record<number, unknown>> = {}): (number | number[])[] {
  const p: (number | number[])[] = [0, -1, -1, 0, -1, 0, -1, -1, -1, 0, -1, 0, 0, 0, 0, 0, [2, 0, 0, 0, 0, 0], 0, 0, -1];
  for (const [k, v] of Object.entries(extra)) p[Number(k)] = v as number;
  return p;
}

function player(id: number, over: Partial<DumpPlayer> = {}): DumpPlayer {
  return {
    id, major: true, minor: false, barb: false, free: false, human: false, civ: 'CIVILIZATION_ROME', leader: 'LEADER_TRAJAN',
    gold: 100, goldYield: 5, maintTotal: 0, maintBuildings: 0, maintDistricts: 0, maintUnits: 0, faith: 0, faithYield: 0,
    pantheon: -1, religionCreated: -1, scienceYield: 2, researching: 0, researchProgress: 4, cultureYield: 1, civic: 0,
    government: 0, techs: '00', techBoosts: '00', civics: '0', civicBoosts: '0', era: 0, eraScore: 0, darkThreshold: 8,
    goldenThreshold: 19, darkAge: false, goldenAge: false, heroic: false, favor: 0, tourism: 0, tokens: 0, suzerain: -1,
    policies: [], wars: [], met: [], envoysReceived: [], gpp: [], ...over,
  };
}

function city(over: Partial<DumpCity> = {}): DumpCity {
  return {
    owner: 0, id: 65536, name: 'LOC_CITY_NAME_ROMA', x: 2, y: 2, pop: 3, capital: true, originalOwner: 0, occupied: false,
    yields: [0, 0, 0, 0, 0, 0], food: 4, foodSurplus: 2, growthThreshold: 16, turnsToGrow: 6, housing: 5, housingParts: [],
    housingGrowthMod: 1, happinessGrowthMod: 0, overallGrowthMod: 1, amenities: 2, amenitiesNeeded: 2, happiness: 4,
    amenityParts: [], culture: 7, cultureYield: 2, nextPlot: 20, nextPlotCost: 10, turnsToExpand: 2, loyalty: 100,
    maxLoyalty: 100, loyaltyPerTurn: 0, loyaltyLevel: 3, majorityReligion: -1, religions: [], governor: -1,
    buy: [['U', 2, 20, 80, 0], ['U', 1, 25, 100, 0]], plotBuy: [], buildings: [[0, 0]],
    districts: [[0, 2, 2, true, false, 10, 0, 200, 0, 0]], worked: [18, 19], plots: [18, 19, 26, 27], queue: [], ...over,
  };
}

function unit(owner: number, id: number, type: number, x: number, y: number, over: Partial<DumpUnit> = {}): DumpUnit {
  return { owner, id, type, x, y, damage: 0, moves: 2, maxMoves: 2, xp: 0, level: 1, formation: 0, buildCharges: 0,
    spreadCharges: 0, religion: -1, embarked: false, ...over };
}

function record(turn: number, over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    turn, seed: 1, moved: false, head: { W, H, wrapX: false, localPlayer: 0 },
    map: Array.from({ length: H }, () => Array.from({ length: W }, () => plot())),
    players: [player(0, { turnActive: true }), player(1, { turnActive: false })],
    religions: [], cities: [city(), city({ owner: 1, id: 65536, name: 'LOC_CITY_NAME_XIAN', x: 6, y: 4, plots: [38, 39], worked: [38] })],
    units: [], errors: [], ...over,
  };
}

const of = <K extends Decision['kind']>(ds: Decision[], kind: K) => ds.filter((d): d is Extract<Decision, { kind: K }> => d.kind === kind);
const src = new InferredActions();

describe('InferredActions', () => {
  it('lands the active player before the turn and every other player after it', () => {
    const a = record(10);
    expect(activePlayer(a)).toBe(0);
    const q = of(src.decisions(a, record(11), CAT), 'queue');
    expect(q.find((d) => d.player === 0)?.phase).toBe('before');
    expect(q.find((d) => d.player === 1)?.phase).toBe('after');
  });

  it('reads a non-active player\'s queue off the later record', () => {
    const a = record(10);
    const b = record(11);
    b.cities[1].queue = [{ BuildingType: 1 }];
    const q = of(src.decisions(a, b, CAT), 'queue').find((d) => d.player === 1)!;
    expect(q.items).toEqual([{ kind: 'building', row: 1, plot: -1 }]);
  });

  it('keeps the item the active player\'s start of turn completed ahead of the queue it shows after', () => {
    const a = record(10);
    a.cities[0].queue = [{ BuildingType: 1 }];
    const b = record(11);
    b.cities[0].buildings = [[0, 0], [1, 0]];
    b.cities[0].queue = [{ UnitType: 2 }];
    expect(headCompleted(a, b, a.cities[0], b.cities[0])).toBe(true);
    const q = of(src.decisions(a, b, CAT), 'queue').find((d) => d.player === 0)!;
    expect(q.items.map((s) => `${s.kind}:${s.row}`)).toEqual(['building:1', 'unit:2']);
    // the completed building is no purchase
    expect(of(src.decisions(a, b, CAT), 'buyBuilding')).toEqual([]);
  });

  it('runs the active player\'s step on the technology it completed, every other player\'s on the record\'s pick', () => {
    const a = record(10);
    const b = record(11);
    b.players[0] = player(0, { turnActive: true, techs: '10', researching: 1 });
    b.players[1] = player(1, { researching: 1 });
    const r = of(src.decisions(a, b, CAT), 'research');
    expect(r.find((d) => d.player === 0)?.tech).toBe(0);
    expect(r.find((d) => d.player === 1)?.tech).toBe(1);
  });

  it('finds a founding on a plot no city stood on, with the Settler it spent', () => {
    const a = record(10, { units: [unit(1, 7, 0, 1, 4)] });
    const b = record(11);
    b.cities.push(city({ owner: 1, id: 131073, name: 'LOC_CITY_NAME_CHANGSHA', x: 1, y: 4, capital: false }));
    const ds = src.decisions(a, b, CAT);
    expect(of(ds, 'found')).toEqual([{ kind: 'found', phase: 'after', player: 1, plot: 33, unit: '1:7' }]);
    expect(of(ds, 'unitGone')).toEqual([{ kind: 'unitGone', phase: 'after', player: 1, unit: '1:7', why: 'founded' }]);
  });

  it('reads a plot as bought only with gold spent, and never the plot the culture box paid for', () => {
    const a = record(10);
    const b = record(11);
    b.cities[0].plots = [18, 19, 26, 27, 20, 21];
    b.cities[0].culture = 1;
    b.players[0] = player(0, { turnActive: true, gold: 105 });
    expect(of(src.decisions(a, b, CAT), 'buyPlot')).toEqual([]);
    b.players[0] = player(0, { turnActive: true, gold: 50 });
    expect(of(src.decisions(a, b, CAT), 'buyPlot').map((d) => d.plot)).toEqual([21]);
  });

  it('tells a bought unit from a trained or a granted one by the price the purse paid', () => {
    const a = record(10);
    a.cities[0].queue = [{ UnitType: 1 }];
    const b = record(11, { units: [unit(0, 9, 2, 2, 2), unit(0, 10, 1, 2, 3), unit(1, 11, 2, 6, 4)] });
    b.players[0] = player(0, { turnActive: true, gold: 25 });
    const ds = src.decisions(a, b, CAT);
    expect(of(ds, 'buyUnit').map((d) => [d.unit, d.currency])).toEqual([['0:9', 'gold']]);
    const born = of(ds, 'unitNew');
    expect(born.find((d) => d.unit === '0:10')?.why).toBe('trained');
    expect(born.find((d) => d.unit === '1:11')?.why).toBe('other');
  });

  it('pays a village to the major whose unit reached it, its Gold the rise past the income', () => {
    const a = record(10, { units: [unit(1, 5, 2, 4, 1)] });
    a.map[1][5] = plot({ 4: 1 });
    const b = record(11, { units: [unit(1, 5, 2, 5, 1)] });
    b.players[1] = player(1, { gold: 130 });
    const v = of(src.decisions(a, b, CAT), 'village');
    expect(v).toEqual([{ kind: 'village', phase: 'after', player: 1, plot: 13, gold: 25, faith: 0, techBoosts: [], civicBoosts: [], popCity: -1 }]);
  });

  it('reads a cleared camp, a fight and a move', () => {
    const a = record(10, { units: [unit(1, 5, 2, 4, 1)] });
    a.map[1][5] = plot({ 4: 2 });
    const b = record(11, { units: [unit(1, 5, 2, 5, 1, { damage: 30 })] });
    const ds = src.decisions(a, b, CAT);
    expect(of(ds, 'camp')).toEqual([{ kind: 'camp', phase: 'after', player: 1, plot: 13, unit: '1:5' }]);
    expect(of(ds, 'combat')).toEqual([{ kind: 'combat', phase: 'after', player: 1, unit: '1:5', hp: 70 }]);
    expect(of(ds, 'move')).toEqual([{ kind: 'move', phase: 'after', player: 1, unit: '1:5', plot: 13 }]);
  });
});

describe('RecordedActions', () => {
  it('takes what the event log names and keeps the inference for the rest', () => {
    const a = record(10);
    a.cities[0].queue = [{ BuildingType: 1 }];
    const b = record(11, { units: [unit(0, 9, 2, 2, 2)] });
    b.cities[0].queue = [{ BuildingType: 1 }];
    b.players[0] = player(0, { turnActive: true, gold: 25 });
    (b as TurnRecord & { actions: unknown[] }).actions = [
      [1, 10, 'CityProductionChanged', 0, 65536, 0, 1, 0],
      [2, 10, 'UnitAddedToMap', 0, 9, 2, 2],
      [3, 10, 'CityProductionCompleted', 0, 65536, 0, 2, false, 0],
      [4, 10, 'SomethingNew', 1, 2, 3],
    ];
    const rec = new RecordedActions();
    const ds = rec.decisions(a, b, CAT);
    // the active player switched to a Builder in its actions: the log's head
    expect(of(ds, 'queue').find((d) => d.player === 0)?.items[0]).toEqual({ kind: 'unit', row: 1, plot: -1 });
    // the Warrior the inference read as bought (the purse fell by its price)
    // the log shows completed by production
    expect(of(ds, 'buyUnit')).toEqual([]);
    expect(of(ds, 'unitNew').find((d) => d.unit === '0:9')?.why).toBe('trained');
    expect(rec.settled.get('unitOrigin')).toMatchObject({ log: 1, inferred: 1, agree: 0 });
    expect(rec.unread.get('SomethingNew')).toBe(1);
    // a record without the log is the inference's alone
    expect(rec.decisions(a, record(11), CAT)).toEqual(src.decisions(a, record(11), CAT));
  });

  it('reads a purchase\'s kind off its hash: a plot bought, a unit bought', () => {
    const a = record(10);
    const b = record(11, { units: [unit(1, 4, 2, 6, 4)] });
    b.cities[1].plots = [38, 39, 30];
    b.players[1] = player(1, { gold: 25 });
    (b as TurnRecord & { actions: unknown[] }).actions = [
      [1, 10, 'CityMadePurchase', 1, 65536, 6, 3, gameHash('PLOT'), -1],
      [2, 10, 'CityMadePurchase', 1, 65536, 6, 4, gameHash('UNIT'), 2],
      [3, 10, 'UnitAddedToMap', 1, 4, 6, 4],
    ];
    const ds = new RecordedActions().decisions(a, b, CAT);
    expect(of(ds, 'buyPlot')).toEqual([{ kind: 'buyPlot', phase: 'after', player: 1, city: 38, plot: 30 }]);
    expect(of(ds, 'buyUnit')).toEqual([{ kind: 'buyUnit', phase: 'after', player: 1, city: 38, type: 2, unit: '1:4', currency: 'gold' }]);
  });
});
