/**
 * THE CITY BUILD AI'S VIEW OF A MAJOR'S CITY (`aiCityBuild.ts`): the facts
 * the value tables read (`majorBuildFacts`), what the Default
 * Specialization pick reads beside them (`majorPickFacts`), an item's price
 * and the turns to it at the city's Production, and the production column
 * an item takes (`majorItemColumn`). The minors' twins are
 * `minorBuildFacts` / `minorPickFacts` (`minorBuild.ts`).
 */
import type { City, DistrictId, GameState, QueueItem, YieldKey } from './types';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { DISTRICTS } from '../data/districts';
import { PROJECTS } from '../data/projects';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS } from '../data/policies';
import { CIV_LEADERS } from '../data/seats';
import { AI_CIVILIZATION_TRAITS, AI_LEADER_TRAITS } from '../data/aiTables';
import { AI_BUILDINGS, AI_UNITS } from '../data/aiBuildTables';
import { engineId } from '../data/aliases';
import { RESOURCES } from '../../world/resources';
import { hasRiver } from '../../world/query';
import { hexDistance, tilesWithin } from '../../world/hex';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, constructibleNow, growthForecast, type AmenityCity, type CityBuildFacts, type PickFacts } from './aiCityBuild';
import { FX, fxOf, turnsAt } from './aiValue';
import { unitProductionTable } from './aiUnitProduction';
import { researchAnalysis } from './aiResearch';
import { civicAnalysis } from './aiCivics';
import { majorView, type MajorViewInputs } from './majorView';
import { analysedTurns, installType, promotionWeight } from './minorBuild';
import { civEraIndex, computeCityStats } from './city';
import { researchCost } from './economy';
import { getModifiers, prodBoostPct, seatGovernment } from './effects';
import { citiesOf, seatOf } from './seats';
import { cityLowlands } from './climate';
import { buildingCostIn, worshipOffered } from './rules';
import { builderCost, cityNavalCapable, traderCost } from './units';
import { districtCost, projectCost, settlerCost, unitStepCost, unitsAcquired } from './game';
import { tradeCapacity } from './trade';
import { handicapOf } from './barbarians';
import { productionObs, unitGates } from './decideObsCities';
import { prodLayout, queueItemColumn } from './prodLayout';

const YIELD_KEY: Readonly<Record<string, YieldKey>> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};

/** the traits a major holds: its leader's and its civilization's, and the
 *  majors' default trait */
export function majorTraits(state: GameState, seat: number): string[] {
  const row = CIV_LEADERS[seatOf(state, seat)?.civ ?? -1];
  if (!row) return ['TRAIT_LEADER_MAJOR_CIV'];
  return ['TRAIT_LEADER_MAJOR_CIV', ...(AI_LEADER_TRAITS[`LEADER_${row.leader}`] ?? []),
    ...(AI_CIVILIZATION_TRAITS[`CIVILIZATION_${row.civ}`] ?? [])];
}

/** the engine's queue item of an install type in a major's city (a district
 *  without its plot: -1), null for one the engine does not carry */
export function majorQueueItem(state: GameState, seat: number, city: City, type: string): QueueItem | null {
  if (type.startsWith('BUILDING_')) {
    const id = engineId('building', type, 'BUILDING_', BUILDINGS);
    return id ? { kind: 'building', building: id, progress: 0 } : null;
  }
  if (type.startsWith('UNIT_')) {
    const id = engineId('unit', type, 'UNIT_', UNITS);
    if (!id) return null;
    if (id === 'SETTLER') return { kind: 'settler', progress: 0, cost: settlerCost(state, seat) };
    if (id === 'BUILDER') return { kind: 'unit', unit: id, progress: 0, cost: builderCost(state, seat) };
    if (id === 'TRADER') return { kind: 'unit', unit: id, progress: 0, cost: traderCost(state, seat) };
    return { kind: 'unit', unit: id, progress: 0, ...(UNITS[id].costStep === undefined ? {} : { cost: unitStepCost(id, unitsAcquired(state, seat, id)) }) };
  }
  if (type.startsWith('DISTRICT_')) {
    const id = engineId('district', type, 'DISTRICT_', DISTRICTS) as DistrictId | null;
    return id ? { kind: 'district', district: id, tileIndex: -1, progress: 0, cost: districtCost(state, seat, id) } : null;
  }
  if (type.startsWith('PROJECT_')) {
    const id = engineId('project', type, 'PROJECT_', PROJECTS);
    return id ? { kind: 'project', project: id, progress: 0, cost: projectCost(state, seat, id, city) } : null;
  }
  return null;
}

/** an engine queue item's price in a major's city */
function itemPrice(state: GameState, city: City, q: QueueItem): number {
  if (q.kind === 'building') return buildingCostIn(state, city, q.building);
  if (q.kind === 'unit') return q.cost ?? UNITS[q.unit]?.cost ?? 0;
  if (q.kind === 'settler' || q.kind === 'project') return q.cost;
  if (q.kind === 'district') return q.cost ?? DISTRICTS[q.district].cost;
  return 0;
}

const keyOf = (q: QueueItem): string => (q.kind === 'building' ? `b:${q.building}` : q.kind === 'unit' ? `u:${q.unit}`
  : q.kind === 'settler' ? 's' : q.kind === 'district' ? `d:${q.district}` : q.kind === 'project' ? `p:${q.project}` : `w:${q.wonder}`);

/** the install type of a major's queue item, null for a wonder */
export function majorItemType(q: QueueItem | undefined): string | null {
  if (!q) return null;
  if (q.kind === 'building') return installType('building', q.building, 'BUILDING_');
  if (q.kind === 'unit') return installType('unit', q.unit, 'UNIT_');
  if (q.kind === 'settler') return 'UNIT_SETTLER';
  if (q.kind === 'district') return installType('district', q.district, 'DISTRICT_');
  if (q.kind === 'project') return installType('project', q.project, 'PROJECT_');
  return null;
}

/** THE CITY BUILD AI'S VIEW OF A MAJOR'S CITY, its knowledge base's unit
 *  counts `known` */
export function majorBuildFacts(state: GameState, city: City, known: (unit: string) => number,
                                inputs?: MajorViewInputs): CityBuildFacts {
  const seat = city.seat;
  const s = seatOf(state, seat)!;
  const stats = computeCityStats(state, city);
  const r = s.research;
  const view = majorView(state, inputs);
  const traits = majorTraits(state, seat);
  const own = citiesOf(state, seat);
  const amenityOf = (c: City): AmenityCity => {
    const st = c === city ? stats : computeCityStats(state, c);
    return {
      balance: st.amenities.have - st.amenities.needed,
      yields: Object.fromEntries(Object.entries(YIELD_KEY).map(([y, k]) => [y, st.total[k]])),
    };
  };
  const amenity = amenityOf(city);
  const science = stats.total.science + own.filter((c) => c !== city).reduce((n, c) => n + computeCityStats(state, c).total.science, 0);
  const culture = stats.total.culture + own.filter((c) => c !== city).reduce((n, c) => n + computeCityStats(state, c).total.culture, 0);
  const techEntries = researchAnalysis(state, seat, science).map((e) => ({ id: e.tech, next: e.next, turns: e.turns, owned: e.owned }));
  const civicEntries = civicAnalysis(state, seat, culture).map((e) => ({ id: e.civic, next: e.next, turns: e.turns, owned: e.owned }));
  const techLeft = r.tech ? turnsAt(researchCost(state, r.tech, false, seat) * FX - fxOf(r.techProgress), fxOf(science)) : -1;
  const civicLeft = r.civic ? turnsAt(researchCost(state, r.civic, true, seat) * FX - fxOf(r.civicProgress), fxOf(culture)) : -1;
  const has = new Set(city.buildings);
  const centre = state.map.tiles[city.centerIndex];
  const worship = worshipOffered(state, city);
  const own_units = new Map<string, number>();
  for (const u of state.units) {
    if (u.seat !== seat) continue;
    const t = installType('unit', u.type, 'UNIT_');
    own_units.set(t, (own_units.get(t) ?? 0) + 1);
  }
  const holds = (x: string): boolean => {
    const t = x.startsWith('TECH_') ? engineId('tech', x, 'TECH_', TECHS) : null;
    const c = x.startsWith('CIVIC_') ? engineId('civic', x, 'CIVIC_', CIVICS) : null;
    return (!!t && r.techs.includes(t)) || (!!c && r.civics.includes(c));
  };
  const unitVersion = (u: string): string | null => {
    const row = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
    if (!row || !row.canTrain) return null;
    if (row.trait) return traits.includes(row.trait) ? u : null;
    // a unique unit of the player's standing in place of the base
    const unique = AI_UNITS.find((x) => x.trait && traits.includes(x.trait)
      && engineId('unit', x.type, 'UNIT_', UNITS) !== null && UNITS[engineId('unit', x.type, 'UNIT_', UNITS)!]?.replaces === engineId('unit', u, 'UNIT_', UNITS));
    return unique ? unique.type : u;
  };
  const mods = getModifiers(state, seat);
  const growth = {
    surplus: fxOf(stats.foodSurplus),
    housing: stats.housing,
    population: city.population,
    stored: fxOf(city.foodBox),
    multiplier: stats.foodSurplus > 0 ? Math.round((stats.effectiveFoodSurplus / stats.foodSurplus) * FX) : FX,
  };
  return {
    view,
    seat,
    cityId: city.id,
    population: city.population,
    capital: city.isCapital,
    districtCount: city.districts.length,
    hasWonder: (city.wonders ?? []).length > 0,
    atWar: s.wars.length > 0,
    era: civEraIndex(r.techs, r.civics),
    yieldPct: (y) => Math.round(((stats.yieldPct[YIELD_KEY[y]] ?? 0) - (y === 'YIELD_FOOD' ? 0 : stats.amenities.tier.yieldFactor - 1)) * 100),
    version: (b) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b) ?? -1];
      if (!row) return null;
      if (row.trait) return traits.includes(row.trait) ? b : null;
      const unique = AI_BUILDINGS.find((x) => x.replaces === b && x.trait && traits.includes(x.trait));
      return unique ? unique.type : b;
    },
    unitVersion,
    hasBuilding: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return !!id && has.has(id);
    },
    hasDistrict: (d) => {
      const id = engineId('district', d, 'DISTRICT_', DISTRICTS);
      return id === 'CITY_CENTER' || (!!id && city.districts.some((x) => x.type === id && state.map.tiles[x.tileIndex].districtComplete));
    },
    governmentTier: GOVERNMENTS[seatGovernment(state, seat) ?? '']?.tier ?? 0,
    worship: worship ? installType('building', worship, 'BUILDING_') : null,
    riverside: hasRiver(centre),
    groundRefuses: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      if (!id) return true;
      return !!BUILDINGS[id].floodBarrier && cityLowlands(state, city).length === 0;
    },
    amenity,
    regionalAmenities: (range) => own.filter((c) => hexDistance(state.map, state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row,
      centre.col, centre.row) <= range).map(amenityOf),
    fullCiv: true,
    tribe: false,
    unitCount: state.units.filter((u) => u.seat === seat).length,
    unitProduction: unitProductionTable({
      isVersion: (u) => unitVersion(u) === u,
      obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
      owned: (u) => own_units.get(u) ?? 0,
      known,
    }),
    trainsDomain: (d) => d !== 'DOMAIN_SEA' || cityNavalCapable(state, city),
    combatCount: tradeCapacity(state, seat),
    extraCopies: () => 0,
    promotionWeight: (cls) => promotionWeight(traits, cls),
    resourceAccess: (res) => {
      const id = engineId('resource', res, 'RESOURCE_', RESOURCES);
      if (!id) return false;
      if ((s.stockpile?.[Object.keys(RESOURCES).indexOf(id)] ?? 0) > 0) return true;
      return own.some((c) => tilesWithin(state.map, state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, 3)
        .some((t) => t.resource === id));
    },
    handicap: handicapOf(state, seat),
    growth,
    forecast: growthForecast(growth),
    current: majorItemType(city.queue[0]),
    techTurns: (t) => analysedTurns(techEntries, t && engineId('tech', t, 'TECH_', TECHS), r.techs, r.tech, techLeft),
    civicTurns: (c) => analysedTurns(civicEntries, c && engineId('civic', c, 'CIVIC_', CIVICS), r.civics, r.civic, civicLeft),
    buildTurns: (type) => {
      const q = majorQueueItem(state, seat, city, type);
      if (!q) return 500;
      const k = keyOf(q);
      const inQueue = city.queue.find((x) => keyOf(x) === k);
      const progress = (inQueue?.progress ?? 0) + (city.productionBank ?? 0);
      const rate = fxOf(stats.total.production * (1 + prodBoostPct(mods, q, s.gpPerm)));
      return turnsAt(itemPrice(state, city, q) * FX - fxOf(progress), rate);
    },
  };
}

/** What the Default Specialization pick reads of a major's city: the
 *  building held or in hand, CanConstruct (`constructibleNow` on the facts,
 *  and the engine's own offer), CanTrain and the projects (the engine's
 *  production columns open, `productionObs`), the favoured items none, the
 *  plain pick (the defensive one's inputs unread). */
export function majorPickFacts(state: GameState, city: City, facts: CityBuildFacts): PickFacts {
  const s = seatOf(state, city.seat)!;
  const L = prodLayout();
  const open = new Set(productionObs(state, s, { ...city, queue: [] }, unitGates(state, city.seat)).prodOpen);
  const inHand = majorItemType(city.queue[0]);
  const held = city.buildings;
  const col = (type: string): number => queueItemColumn(majorQueueItem(state, city.seat, city, type) ?? undefined);
  return {
    buildingHeld: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return inHand === b || (!!id && held.includes(id));
    },
    canConstruct: (b) => {
      const c = col(b);
      return c >= 0 && c < L.NB && open.has(c) && constructibleNow(facts, AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!]);
    },
    reasonsClear: (b) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!];
      if (row.district && !facts.hasDistrict(row.district)) return false;
      return !row.prereqs.length || row.prereqs.some((p) => facts.hasBuilding(p));
    },
    canTrain: (u) => {
      const c = col(u);
      return c >= 0 && open.has(c);
    },
    canProduce: (p) => {
      const c = col(p);
      return c >= 0 && open.has(c);
    },
    favored: () => 0,
    defense: false,
  };
}

/** THE CITY BUILD AI'S VIEW OF A FREE CITY: a major's view of the city
 *  over the Free Cities' seat, but no full civilization, its trait
 *  TRAIT_LEADER_FREE_CITIES' promotion lists, its research and civics turns
 *  its own research AI's analysis (`minorResearch`'s entries, as a
 *  city-state's), no strategic stockpile, no government, no combat units
 *  counted against its trade */
export function freeCityBuildFacts(state: GameState, city: City): CityBuildFacts {
  const f = majorBuildFacts(state, city, () => 0);
  const r = seatOf(state, city.seat)!.research;
  const techEntries = (r.aiEntries ?? []).map((e) => ({ id: e.tech, next: e.next, turns: e.turns, owned: e.owned }));
  const civicEntries = (r.civicAiEntries ?? []).map((e) => ({ id: e.civic, next: e.next, turns: e.turns, owned: e.owned }));
  const culture = citiesOf(state, city.seat).reduce((n, c) => n + computeCityStats(state, c).total.culture, 0);
  const civicLeft = r.civic ? turnsAt(researchCost(state, r.civic, true, city.seat) * FX - fxOf(r.civicProgress), fxOf(culture)) : -1;
  const centre = state.map.tiles[city.centerIndex];
  return {
    ...f,
    fullCiv: false,
    governmentTier: 0,
    combatCount: 0,
    promotionWeight: (cls) => promotionWeight(['TRAIT_LEADER_FREE_CITIES'], cls),
    resourceAccess: (res) => {
      const id = engineId('resource', res, 'RESOURCE_', RESOURCES);
      return !!id && tilesWithin(state.map, centre.col, centre.row, 3).some((t) => t.resource === id);
    },
    techTurns: (t) => analysedTurns(techEntries, t && engineId('tech', t, 'TECH_', TECHS), r.techs, r.tech, r.aiLeftSeen ?? 0),
    civicTurns: (c) => analysedTurns(civicEntries, c && engineId('civic', c, 'CIVIC_', CIVICS), r.civics, r.civic, civicLeft),
  };
}

/** the production column of an install type in a major's city (-1 none) */
export function majorItemColumn(state: GameState, city: City, type: string): number {
  return queueItemColumn(majorQueueItem(state, city.seat, city, type) ?? undefined);
}
