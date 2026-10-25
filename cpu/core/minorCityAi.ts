/**
 * THE CITY-STATES' CITY AI (GameCore_XP2 AI/CityBuild.cpp, AI/Economic.cpp;
 * `tools/civ6lab/dll_readings.md` "C-96: the city events, trees and
 * contracts"): what a minor's city builds and buys, its AI's own pick. Each
 * turn after its turn start (the step works the item in hand, `minorBuild`),
 * as the game's Control Manager runs a player's lists:
 *
 *  - B: the Economic AI's savings turn (0x687bf0, `savingsTurn`), the
 *    military AI's turn (`minorOpsEvaluate`) — both `minorMilitaryTurn`,
 *    before the knowledge base's look;
 *  - A: the city's update (0x5ce680): its threat (0x5cbd10, `cityThreat`
 *    on its knowledge base's records; its operations, against no enemy,
 *    leave it as it is), the contract in hand checked (0x5d7e00), the slots
 *    of trees no longer running freed, the plot analysis (0x5ce970,
 *    `minorPlotEvals`), the improvement pick (0x5c9a00) and the events —
 *    City Defense (its operation manager's start, `minorOpsStart`), the
 *    building or unit event, the district event, the improvement event — a
 *    city its AI first sees this turn running none;
 *  - C: the Default Specialization where the queue is empty (0x5d4d70: the
 *    contract in hand where it takes the turn, else the pick), the
 *    purchases (0x5ce5b0's tail: a threatened city buys the first unit of
 *    its list while TryPurchaseUnits succeeds), the trees' tick (0x7ffdd0),
 *    their orders carried out at once; its operations' trees tick in its
 *    units' turn (`cityStateMilitary`).
 *
 * The plot analysis covers the 37 plots within three of the centre in the
 * city's plot order (AI_CityBuild.csv's PLOT ANALYSIS LOG, the centre
 * first).
 */
import type { City, CityState, DistrictId, GameState, Seat, Tile, Unit } from './types';
import { BUILDINGS } from '../data/buildings';
import { BUILDER_COST_STEP, UNITS } from '../data/units';
import { TECHS as TECHS_KNOWN } from '../data/techs';
import { CIVICS as CIVICS_KNOWN } from '../data/civics';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { GAME_COST_ESCALATION, gameProgressPct, scaleByGameSpeed } from '../data/constants';
import { AI_BUILDINGS, AI_DISTRICT_LISTS, AI_DISTRICTS, AI_FEATURES, AI_IMPROVEMENTS, AI_PROJECTS, AI_RESOURCES, AI_UNITS } from '../data/aiBuildTables';
import { AI_CITY_EVENTS, AI_CITY_EVENT_LISTS } from '../data/aiCityTrees';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { engineId, gameTypeOf, installFeature } from '../data/aliases';
import { axialToOffset, hexDistance, inBounds, neighbors, offsetToAxial, wrapCol } from '../../world/hex';
import { isCoastalLand } from '../../world/query';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, buildingTable, defaultSpecialization, housingValue, specializationBests, unitTable,
  type CityBuildFacts, type CityBuildTables, type PickFacts } from './aiCityBuild';
import { projectTable } from './aiProjectValue';
import { improvementValue, type PlotValueFacts } from './aiPlotValue';
import { districtValue, type DistrictValueFacts } from './aiDistrictValue';
import { resourceValue } from './aiResource';
import { accumulationPct } from './stockpile';
import { FX, FX_MIN, fmul, pseudoYieldValue } from './aiValue';
import {
  buildingEvent, defenseEvent, defensiveCancel, districtEvent, freeSlots, goalsReached, improvementEvent, newCityAi, pickImprovement, tickCityTrees,
  type CityAi, type CityTreeCity, type CityTreeWorld, type PlotEval, type TreeUnit,
} from './aiCityTrees';
import { cityContracts, contractBuilt, inHandCheck, queueContract, takesTurn, type AiContract, type ContractItem } from './aiContracts';
import { newEconomicMemory, purchaseContracts, purchaseTurn, purchasePick, savingsTurn, type PurchaseCity, type PurchaseEntry } from './aiEconomic';
import { unitProductionEntries } from './aiUnitProduction';
import { cityThreat, type CityThreat } from './operations/cityThreat';
import { aiView } from './aiView';
import { AI_GREAT_PERSON_CLASSES } from '../data/aiTables';
import { minorJobUnits, minorOpContracts, minorOpLive, minorOpNear, minorOpsEvaluate, minorOpsStart } from './minorOps';
import { freeOpNear } from './freeOps';
import { ARMY_READ_AGE } from './operations/knowledge';
import { joinBuilt } from './operations/manager';
import { minorCity, minorFoodFocus } from './cityStates';
import { FREE_SEAT, campTiles, civOf, freeSeatOf, hiddenResourcesFor, isCiv, seatOf, tileSeat } from './seats';
import { cityAppealResolver } from './governors';
import { canPlaceDistrictIn, canRemoveFeature, suzerainNames, validImprovementsIn } from './rules';
import { borderCandidates, computeCityStats } from './city';
import { goldAffordable, tilePurchaseCost } from './game';
import { computeUnlocksIn, makeYieldCtx } from './effects';
import { eruptionHazardTurns, floodHazardTurns } from './disasters';
import { baseAdjacency, improvementAdjacency } from './yields';
import { tileAppeal } from './appeal';
import { builderHarvest, builderRemoveFeature, purchaseSpotBlocked } from './units';
import { aiStrengths, dangerPlane, moveTo, reachPlots, turnsToPlot } from './tactical';
import { randRange } from './rand';
import {
  installType, minorBuildFacts, minorBuilderLays, minorBuyUnit, minorItemOfType, minorItemType, minorKnownUnits, minorPickFacts, minorRepairsDistrictAt, minorUnderThreat,
  minorProjectFacts, minorResourceCounts, minorResourceFacts, minorSetItem, minorUnitPrice, minorUnitVersion, minorQueueOk,
} from './minorBuild';

/** the city's plots, the centre first, as axial offsets from it (the city's
 *  plot order, AI_CityBuild.csv's PLOT ANALYSIS LOG) */
export const CITY_PLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1],
  [0, 2], [1, 1], [2, 0], [2, -1], [2, -2], [1, -2], [0, -2], [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2],
  [0, 3], [1, 2], [2, 1], [3, 0], [3, -1], [3, -2], [3, -3], [2, -3], [1, -3], [0, -3], [-1, -2], [-2, -1], [-3, 0],
  [-3, 1], [-3, 2], [-3, 3], [-2, 3], [-1, 3],
];

/** the city's plots in its plot order: their tile indices, the centre first
 *  (those off the map left out) */
export function cityPlots(state: GameState, centre: number): number[] {
  const map = state.map;
  const t = map.tiles[centre];
  const [q, r] = offsetToAxial(t.col, t.row);
  const out: number[] = [];
  for (const [dq, dr] of CITY_PLOT_OFFSETS) {
    const [col, row] = axialToOffset(q + dq, r + dr);
    if (!inBounds(map, col, row)) continue;
    out.push(row * map.width + wrapCol(map, col));
  }
  return out;
}

const RES = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));
const FEATURE_ROW = new Map(AI_FEATURES.map((r) => [r.type, r] as const));
const YIELD_KEY: Record<string, string> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};
/** per AI district row its engine district, null none */
const DISTRICT_ENGINE = new Map(AI_DISTRICTS.map((r) => [r.type, engineId('district', r.type, 'DISTRICT_', DISTRICTS) as DistrictId | null]));
/** per AI improvement row its engine improvement, null none */
const IMPROVEMENT_ENGINE = new Map(AI_IMPROVEMENTS.map((r) => [r.type, engineId('improvement', r.type, 'IMPROVEMENT_', IMPROVEMENTS)]));
/** an engine district's install type: the traitless AI row whose engine id it is */
const districtType = (id: string): string =>
  AI_DISTRICTS.find((r) => r.trait === null && engineId('district', r.type, 'DISTRICT_', DISTRICTS) === id)?.type ?? `DISTRICT_${id}`;

/** the improvement rows' options for the minor, the improvements' own
 *  research waived, a ground row's civic held */
function groundOpts(state: GameState, cs: CityState) {
  const seat = cs.seat;
  const unlocks = { ...computeUnlocksIn(cs.research, []), improvements: new Set(Object.keys(IMPROVEMENTS)) };
  return {
    unlocks, ownsTile: (t: Tile) => tileSeat(t) === seat, map: state.map, camps: campTiles(state),
    gpAppeal: cityAppealResolver(state), suzerain: suzerainNames(state, seat), civ: civOf(state, seat),
  };
}

/** the improvements the plot takes as it stands — its feature and resource
 *  kept — for the trees' nodes (Check Plot, Clear Plot, Build Improvement:
 *  0x35fd60). A city-state's Builder clears a plot before it builds there,
 *  never both at once (runs/h1_duelw1117-1128: no city-state improvement
 *  laid the turn its plot's feature or resource went; 1124 Granada's
 *  Builder on plot 570's Marsh t7-t21, the Marsh gone t22, the Alcazar
 *  t24) */
function standingImprovements(state: GameState, cs: CityState, tile: Tile): readonly string[] {
  return validImprovementsIn(seenGround(state, cs, tile), groundOpts(state, cs));
}

/** the plot as the minor sees it: a resource whose revealing technology it
 *  lacks is none (runs/h1_duelv1128 t2 Nazca: plot 473's unrevealed Horses
 *  read "No resource", its Farm valued 72.45) */
function seenGround(state: GameState, cs: CityState, tile: Tile): Tile {
  return tile.resource && hiddenResourcesFor(state, cs.seat).has(tile.resource) ? { ...tile, resource: null } : tile;
}

/** a plot's feature and the resource the seat sees on it, install types
 *  (the trees' `plotGround`) */
export function plotGroundOf(state: GameState, seat: number, plot: number): { feature: string | null; resource: string | null } {
  const tile = state.map.tiles[plot];
  const seen = tile.resource && !hiddenResourcesFor(state, seat).has(tile.resource) ? tile.resource : null;
  return {
    feature: tile.feature ? installFeature(tile.feature) : null,
    resource: seen ? gameTypeOf('resource', seen, 'RESOURCE_') : null,
  };
}

/** the improvements the ground of a plot takes for the minor, the
 *  improvements' own research waived (CanHaveImprovement, 0x35fd60) — a
 *  ground row's civic (the Farm on Hills, a feature row) held: those of the
 *  plot as it stands, of the plot with its resource harvested (one with
 *  Resource_Harvests rows) and with its
 *  removable feature cleared (the value prices the harvest and the clearing) */
function groundImprovements(state: GameState, cs: CityState, actual: Tile): Set<string> {
  const opts = groundOpts(state, cs);
  const tile = seenGround(state, cs, actual);
  const clearable = !!tile.feature && !!FEATURE_ROW.get(installFeature(tile.feature))?.removable;
  const harvestable = !!tile.resource && (RES.get(gameTypeOf('resource', tile.resource, 'RESOURCE_'))?.harvests.length ?? 0) > 0;
  const out = new Set<string>(validImprovementsIn(tile, opts));
  for (const [harvest, clear] of [[true, false], [false, true], [true, true]]) {
    if ((harvest && !harvestable) || (clear && !clearable)) continue;
    const ground = { ...tile, resource: harvest ? null : tile.resource, feature: clear ? null : tile.feature };
    for (const id of validImprovementsIn(ground, opts)) out.add(id);
  }
  return out;
}

/** a minor's verdict on a district by its type, its traits' district lists summed
 *  (AiLists System Districts: MINOR_CIV_DEFAULT_TRAIT disfavours the
 *  specialty districts, its type's trait favours its own): 1 favoured, -1
 *  disfavoured — the analysis values no district it disfavours
 *  (runs/h1_duelv1117: no city-state's plot ever values a Holy Site; the
 *  cultural Antananarivo values Theaters, the militaristic Valletta
 *  Encampments) — 0 neither */
export function minorDistrictVerdict(type: string, district: string): -1 | 0 | 1 {
  const v = (AI_DISTRICT_LISTS.MINOR_CIV_DEFAULT_TRAIT?.[district] ?? 0)
    + (AI_DISTRICT_LISTS[`MINOR_CIV_${type.toUpperCase()}_TRAIT`]?.[district] ?? 0);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/**
 * THE PLOT ANALYSIS of a minor's city (0x5ce970 per plot, the centre first):
 * per plot its flags — the seat owns it, an improvement may stand on its
 * ground (research waived) where no district or improvement stands, a district may stand
 * where the analysis values one, an unowned plot beside one of the seat's —
 * and its improvements' and districts' values in database order. An
 * improvement the ground does not take, a district the plot cannot hold or
 * the city has, one the minor's type disfavours (`minorDistrictVerdict`):
 * FX(-9999); one only a drought on the plot bars, 0. The centre and a district's plot stand
 * unanalysed (0), but the plot of the city's own pillaged district, which
 * values that district alone, its repair (`districtValue`: x2;
 * runs/h1_duelw1127 Muscat t160: the Commercial Hub pillaged, "Build City
 * District" submitted on it at 5469.0). T: an improvement's the research and civics AIs' turns to
 * its technology and civic (the larger), a district's its build turns plus
 * those. A flood's and an eruption's turns as the AI expects them
 * (`floodHazardTurns`, `eruptionHazardTurns`); an inland
 * city-state on a river trains ships (0x1c77c0's sea test unread).
 */
export function minorPlotEvals(state: GameState, cs: CityState, facts: CityBuildFacts, buildings: readonly number[]): PlotEval[] {
  const map = state.map;
  const city = minorCity(cs);
  const r = cs.research;
  const yctx = makeYieldCtx(state, cs.seat);
  const resFacts = minorResourceFacts(state, cs);
  const forecast = facts.forecast;
  const centre = map.tiles[cs.centerIndex];
  const candidates = new Set(borderCandidates(state, city));
  const specialty = (cs.districts ?? []).filter((x) => DISTRICTS[x.type]?.countsTowardLimit).length;
  const unseen = hiddenResourcesFor(state, cs.seat);
  const hidden = (res: string): boolean => unseen.has(res);
  const impT = AI_IMPROVEMENTS.map((row) => Math.max(facts.techTurns(row.tech), facts.civicTurns(row.civic)));
  const distT = AI_DISTRICTS.map((row) => facts.buildTurns(row.type) + Math.max(facts.techTurns(row.tech), facts.civicTurns(row.civic)));
  const trainsSea = facts.trainsDomain('DOMAIN_SEA') || (centre.riverMask ?? 0) !== 0;
  const camps = campTiles(state);
  const gp = cityAppealResolver(state);
  const out: PlotEval[] = [];
  for (const plot of cityPlots(state, cs.centerIndex)) {
    const tile = map.tiles[plot];
    const owned = tileSeat(tile) === cs.seat;
    const nearOwned = !owned && neighbors(map, tile).some((n) => tileSeat(n) === cs.seat);
    // the plot of the city's own pillaged district: its repair is valued
    const repair = minorRepairsDistrictAt(state, cs, plot);
    if (plot === cs.centerIndex || (tile.district && !repair)) {
      out.push({ plot, owned, improvable: false, districtOk: false, nearOwned,
        improvements: AI_IMPROVEMENTS.map(() => 0), districts: AI_DISTRICTS.map(() => 0) });
      continue;
    }
    const f: PlotValueFacts = {
      view: facts.view, seat: cs.seat,
      improvement: tile.improvement ? gameTypeOf('improvement', tile.improvement, 'IMPROVEMENT_') : null,
      pillaged: !!tile.pillaged,
      resource: tile.resource && !hidden(tile.resource) ? gameTypeOf('resource', tile.resource, 'RESOURCE_') : null,
      feature: tile.feature ? installFeature(tile.feature) : null,
      floodTurns: floodHazardTurns(state, plot),
      eruptionTurns: eruptionHazardTurns(state, plot),
      appeal: tileAppeal(map, tile, camps, gp),
      besideHousingDistrict: neighbors(map, tile).some((n) => n.district !== null && (DISTRICTS[n.district]?.housing ?? 0) > 0),
      unitCost: (u) => (u === 'UNIT_BUILDER' ? UNITS.BUILDER.cost + scaleByGameSpeed(BUILDER_COST_STEP) * cs.buildersTrained
        : UNITS[engineId('unit', u, 'UNIT_', UNITS) ?? '']?.cost ?? 0),
      buildsUnit: (u) => minorUnitVersion(u) === u,
      extraCharges: () => 0,
      progressPct: gameProgressPct(r.techs.length, r.civics.length),
      escalation: GAME_COST_ESCALATION,
      speedScaled: scaleByGameSpeed,
      adjacency: (impType, y) => {
        const id = engineId('improvement', impType, 'IMPROVEMENT_', IMPROVEMENTS) as Parameters<typeof improvementAdjacency>[2] | null;
        if (!id) return 0;
        return (improvementAdjacency(yctx, tile, id) as unknown as Record<string, number>)[YIELD_KEY[y]] ?? 0;
      },
      housingValue: (housing, t, h) => housingValue(facts.growth, forecast, housing, t, h),
      resourceValue: (res, count, t, h) => {
        const row = RES.get(res);
        return row ? resourceValue(resFacts, row, count, t, h) : 0;
      },
      accumulationPct: accumulationPct(state, cs.seat, tile.terrain),
    };
    const ground = owned && !repair ? groundImprovements(state, cs, tile) : new Set<string>();
    // an improvement a drought on the plot bars, which its ground takes
    // otherwise, is valued 0: the plot test asks no drought (runs/h1_duelv1128
    // Hong Kong: the Farm at 9:6 72.45 to t4, 0.00 through the drought of
    // t5-t9, 71.45 at t10; the drought of t16-t17 makes 8:5's, 7:6's and
    // 7:7's Farms and 8:6's Camp 0.00, 7:5's Mine 71.45)
    const dry = owned && !repair && tile.droughtTurns > 0 ? groundImprovements(state, cs, { ...tile, droughtTurns: 0 }) : ground;
    const improvements = AI_IMPROVEMENTS.map((row, i) => {
      const id = IMPROVEMENT_ENGINE.get(row.type);
      if (!id || !dry.has(id)) return FX_MIN;
      if (!ground.has(id)) return impT[i] >= AI_VALUE_HORIZON ? FX_MIN : 0;
      return improvementValue(f, row.type, impT[i], AI_VALUE_HORIZON);
    });
    // a district's adjacency at the plot, once per district
    const adjOf = new Map<string, number>();
    const districtAdj = (d: string, y: string): number => {
      const id = DISTRICT_ENGINE.get(d) ?? null;
      if (!id || YIELD_KEY[y] !== DISTRICTS[id].adjacencyYield) return 0;
      let v = adjOf.get(id);
      if (v === undefined) adjOf.set(id, (v = baseAdjacency(yctx, tile, id)));
      return v;
    };
    // the plot test (0x35f2d0) asks no population limit: the value's own
    // term reads it (runs/h1_duelv1124 Bologna t20: its Campus at the
    // limit of 3 citizens, its Harbor rows valued 33-41 and its tree's
    // Celestial Navigation contract at 50.0, as logged)
    const placed = new Map<DistrictId, boolean>();
    let others: string[] | undefined;
    const placeable = (id: DistrictId): boolean => {
      let ok = placed.get(id);
      if (ok === undefined) placed.set(id, (ok = canPlaceDistrictIn(state, city, id, plot, { unlocks: null, ownsTile: () => true, anyCount: true }).ok));
      return ok;
    };
    const df: DistrictValueFacts = {
      ...f,
      owned: tile.ownerSeat >= 0,
      purchaseCost: tile.ownerSeat >= 0 ? 0 : candidates.has(plot) ? tilePurchaseCost(state, city, plot) : -1,
      lake: tile.terrain === 'LAKE',
      keepsFeature: () => !!f.feature && !FEATURE_ROW.get(f.feature)?.removable,
      district: repair ? districtType(tile.district!) : null,
      districtPillaged: repair,
      isCity: false,
      districtAdjacency: districtAdj,
      rowsAdjacency: districtAdj,
      otherDistricts: (d) => (others ??= AI_DISTRICTS.filter((x) => {
        if (x.trait !== null || x.type === 'DISTRICT_CITY_CENTER' || x.type === 'DISTRICT_WONDER') return false;
        const id = DISTRICT_ENGINE.get(x.type) ?? null;
        if (!id || (cs.districts ?? []).some((c) => c.type === id)) return false;
        return placeable(id);
      }).map((x) => x.type)).filter((x) => x !== d),
      chronology: facts.era + 1,
      districtCount: specialty,
      districtCap: 1 + Math.floor((cs.population - 1) / 3),
      cityTrains: (dom) => facts.trainsDomain(dom) || (dom === 'DOMAIN_SEA' && trainsSea),
      playerTrains: (dom) => facts.trainsDomain(dom) || (dom === 'DOMAIN_SEA' && trainsSea),
      domainUnitsValue: () => 0,
      regionalCities: () => 0,
      riverPlots: () => ({ improved: 0, districted: 0 }),
      canalTrade: 0,
      projectValue: () => 0,
      spaceRace: () => false,
      favoured: () => false,
      districtsOf: (d) => (cs.districts ?? []).filter((x) => districtType(x.type) === d).length,
      buildingsValue: (d) => {
        let best = FX_MIN;
        AI_BUILDINGS.forEach((b, i) => { if (b.district === d && buildings[i] > best) best = buildings[i]; });
        return best;
      },
    };
    const districts = AI_DISTRICTS.map((row, i) => {
      if (row.trait !== null || row.type === 'DISTRICT_CITY_CENTER' || row.type === 'DISTRICT_WONDER') return FX_MIN;
      const id = DISTRICT_ENGINE.get(row.type) ?? null;
      if (repair) {
        // the pillaged district's plot values its own row alone
        if (!id || id !== tile.district) return FX_MIN;
      } else if (!id || (cs.districts ?? []).some((c) => c.type === id) || !placeable(id)) return FX_MIN;
      if (minorDistrictVerdict(cs.type, row.type) < 0) return FX_MIN;
      return districtValue(df, row.type, distT[i], AI_VALUE_HORIZON);
    });
    out.push({
      plot, owned, nearOwned,
      // 0x5ce970's +0x54: an improvement the plot test takes, a plot holding
      // one among them, its own valued 0 (runs/h1_duelv1117 Valletta t10-t14:
      // its improved Farms' 0.00 the researched pick over plot 321's Mine
      // without Mining, no tree until Mining at t15)
      improvable: owned && dry.size > 0,
      districtOk: districts.some((v) => v > FX_MIN && v !== 0),
      improvements, districts,
    });
  }
  return out;
}

/** 0x5d0860 with neither the checks nor the defensive filter: the best
 *  building not held or in hand whose prerequisite building and district
 *  stand (CanConstruct's reasons clear), FX(-9999) none */
export function eventBuilding(t: CityBuildTables, pf: PickFacts): { index: number; value: number } {
  let index = -1;
  let value = FX_MIN;
  AI_BUILDINGS.forEach((b, k) => {
    if (pf.buildingHeld(b.type) || !pf.reasonsClear(b.type)) return;
    if (t.buildings[k] > value) {
      value = t.buildings[k];
      index = k;
    }
  });
  return { index, value };
}

/** 0x5d2600 unchecked, defensive: the best combat unit with no FoundCity,
 *  no build charges, no CLASS_RECON, FX(-9999) none */
export function eventUnit(t: CityBuildTables): { index: number; value: number } {
  let index = -1;
  let value = FX_MIN;
  AI_UNITS.forEach((u, k) => {
    if (u.foundCity || u.buildCharges > 0 || u.combat === 0 || u.recon) return;
    if (t.units[k] > value) {
      value = t.units[k];
      index = k;
    }
  });
  return { index, value };
}

/** the minor's item in hand as a contract item, null none */
function currentItem(cs: CityState): ContractItem | null {
  const t = minorItemType(cs);
  if (!t) return null;
  return { unit: t.startsWith('UNIT_') ? t : null, building: t.startsWith('BUILDING_') ? t : null, district: t.startsWith('DISTRICT_') ? t : null };
}

/** the minor's city as its contracts, events and trees read it */
function minorTreeCity(state: GameState, cs: CityState, facts: CityBuildFacts, tables: CityBuildTables, pf: PickFacts,
  evals: PlotEval[], threat: number): CityTreeCity {
  const city = minorCity(cs);
  return {
    id: city.id, name: cs.name, underThreat: minorUnderThreat(cs, threat),
    current: currentItem(cs),
    foundedTurn: cs.foundedTurn ?? -99,
    currentValue: cs.prodSetValue ?? FX_MIN,
    // CanConstruct refuses for good a building the city holds, a district it
    // holds complete and unpillaged (a pillaged one's repair it takes)
    buildingBlocked: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return !id || (cs.buildings ?? []).includes(id);
    },
    districtBlocked: (d) => {
      const id = engineId('district', d, 'DISTRICT_', DISTRICTS);
      return !id || (cs.districts ?? []).some((x) => x.type === id && state.map.tiles[x.tileIndex].districtComplete
        && !state.map.tiles[x.tileIndex].districtPillaged);
    },
    canTrain: (u) => pf.canTrain(u),
    trainsSea: facts.trainsDomain('DOMAIN_SEA'),
    buildTurns: (c) => facts.buildTurns(c.unit ?? c.building ?? c.district ?? ''),
    itemValue: (c) => (c.unit ? tables.units[AI_UNIT_INDEX.get(c.unit) ?? -1] ?? FX_MIN
      : c.building ? tables.buildings[AI_BUILDING_INDEX.get(c.building) ?? -1] ?? FX_MIN : FX_MIN),
    unitRow: (u) => {
      const r = AI_UNITS[AI_UNIT_INDEX.get(u)!];
      return { combat: r.combat, buildCharges: r.buildCharges, sea: r.domain === 'DOMAIN_SEA', mustPurchase: r.mustPurchase, recon: r.recon };
    },
    buildingRow: (b) => {
      const r = AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!];
      return { defensive: r.defenseModifier > 0 || r.outerDefenseStrength > 0, mustPurchase: false };
    },
    // a district with hit points (DistrictInfo +0x58 set, +0x5c above 0):
    // the City Center, the Encampment and its replacements
    districtDefensive: (d) => (AI_DISTRICTS.find((r) => r.type === d)?.hitPoints ?? 0) > 0,
    evals, bestImprovement: -1, buildings: tables.buildings, units: tables.units,
    eventBuilding: eventBuilding(tables, pf), eventUnit: eventUnit(tables),
    // Build Unit's test reads the city's buildings (0x18e9f0 -> 0x18fe60), not
    // its queue (runs/h1_duelw1121 Antioch t45: its Walls queued by the
    // Default Specialization, the walls tree's contract submitted that turn)
    buildingHeld: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return !!id && (cs.buildings ?? []).includes(id);
    },
    districtHeld: (d) => facts.hasDistrict(d),
    threat,
    plot: cs.centerIndex,
  };
}

/** THE CLEARINGS HELD: the action replay names the plots whose feature or
 *  resource the game's own city-state kept through the turn (record t+1's),
 *  which a minor's Builder then leaves standing. Null outside a replay. */
let clearHeld: ((plot: number, clears: 'feature' | 'resource') => boolean) | null = null;
export function holdMinorClears(held: typeof clearHeld): void {
  clearHeld = held;
}

/** the minor's world as its trees read it and act on it; `spent` the units
 *  whose last charge an order took */
function minorTreeWorld(state: GameState, cs: CityState, ai: CityAi, city: CityTreeCity): CityTreeWorld {
  const r = cs.research;
  const spent = new Set<number>();
  const unitOf = (id: number): Unit | undefined => state.units.find((u) => u.id === id && u.seat === cs.seat);
  const owned = (plot: number) => tileSeat(state.map.tiles[plot]) === cs.seat;
  let danger: Int16Array | undefined;
  return {
    turn: state.turn, seat: cs.seat, cities: [city],
    get units() {
      return state.units.filter((u) => u.seat === cs.seat)
        .map((u): TreeUnit => ({ id: u.id, type: installType('unit', u.type, 'UNIT_'), plot: u.tileIndex, charges: u.charges ?? 0 }));
    },
    techHeld: (t) => {
      const id = engineId('tech', t, 'TECH_', TECHS_KNOWN);
      return !!id && r.techs.includes(id);
    },
    civicHeld: (c) => {
      const id = engineId('civic', c, 'CIVIC_', CIVICS_KNOWN);
      return !!id && r.civics.includes(id);
    },
    canImprove: (plot, imp) => {
      const id = engineId('improvement', imp, 'IMPROVEMENT_', IMPROVEMENTS);
      const tile = state.map.tiles[plot];
      // a plot holding an improvement takes none but its own pillaged one's
      // repair (0x7f6ea0: the plot test, then the repair, else FAILURE)
      if (tile.improvement && !(tile.pillaged && tile.improvement === id)) return false;
      return !!id && owned(plot) && standingImprovements(state, cs, tile).includes(id);
    },
    builderType: () => (minorUnitVersion('UNIT_BUILDER') === 'UNIT_BUILDER' ? 'UNIT_BUILDER' : null),
    plotCity: (plot) => (owned(plot) ? city.id : -2),
    reachThisTurn: (u, plot, moves) => {
      const unit = unitOf(u.id);
      return !!unit && reachPlots(state, unit, 1).some((e) => e.tile === plot && (!moves || e.moves > 0));
    },
    turnsTo: (u, plot) => {
      const unit = unitOf(u.id);
      return unit ? turnsToPlot(state, unit, plot) : 0;
    },
    canPlaceDistrict: (plot, d) => {
      const id = engineId('district', d, 'DISTRICT_', DISTRICTS) as DistrictId | null;
      if (!id) return false;
      // the plot of its own pillaged district takes that district's repair
      if (state.map.tiles[plot].district === id && minorRepairsDistrictAt(state, cs, plot)) return true;
      return canPlaceDistrictIn(state, minorCity(cs), id, plot, { unlocks: null, ownsTile: (t) => tileSeat(t) === cs.seat }).ok;
    },
    plotOwner: (plot) => tileSeat(state.map.tiles[plot]),
    plotGround: (plot) => plotGroundOf(state, cs.seat, plot),
    // its danger map as the trees first read it in the turn (`dangerPlane`)
    danger: (plot) => (danger ??= dangerPlane(state, cs.seat))[plot],
    buildersMakeDistricts: false,
    buildersMakeWonders: false,
    districtTie: () => randRange(state, 2, 'City Build District Choice'),
    distance: (a, b) => {
      const ta = state.map.tiles[a];
      const tb = state.map.tiles[b];
      return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
    },
    newContractId: () => ai.nextContract++,
    newTreeId: () => ai.nextTree++,
    log: () => undefined,
    clearProduction: () => minorSetItem(state, cs, null),
    order: (u, kind, plot, imp, safe) => {
      const unit = unitOf(u);
      if (!unit) return;
      if (kind === 'move') {
        moveTo(state, unit, plot, false, safe ? (p) => (danger ??= dangerPlane(state, cs.seat))[p] > 0 : undefined);
        return;
      }
      if (unit.tileIndex !== plot) return;
      const tile = state.map.tiles[plot];
      if (kind === 'improve') {
        const id = imp ? engineId('improvement', imp, 'IMPROVEMENT_', IMPROVEMENTS) : null;
        if (!id) return;
        // the repair of the plot's own pillaged improvement: no charge
        if (tile.improvement === id && tile.pillaged) {
          tile.pillaged = false;
          unit.movesLeft = 0;
          return;
        }
        if ((unit.charges ?? 0) <= 1) spent.add(u);
        minorBuilderLays(state, unit, plot, id);
        return;
      }
      // the plot's improvement goes first, at no charge (runs/h1_duelv1124
      // Cardiff's Lumber Mill on plot 626 gone at t116 with the Builder's
      // charge kept, the Forest at t117, the Farm at t122); then its
      // feature, else its resource
      if (tile.improvement) {
        tile.improvement = null;
        tile.pillaged = false;
        unit.movesLeft = 0;
        return;
      }
      if ((unit.charges ?? 0) <= 1) spent.add(u);
      const clears = tile.feature && canRemoveFeature(state, tile, cs.seat).ok ? 'feature' : tile.resource ? 'resource' : null;
      // a clearing held stands, the Builder's turn spent and its charge kept
      if (clears && clearHeld?.(plot, clears)) {
        unit.movesLeft = 0;
        return;
      }
      if (clears === 'feature') builderRemoveFeature(state, unit.id, cs.seat);
      else if (clears === 'resource') builderHarvest(state, unit.id);
    },
    unitAlive: (u) => !!unitOf(u) && !spent.has(u),
    startOperation: (name, plot) => minorOpsStart(state, cs, name, plot),
    operationLive: (id) => minorOpLive(cs, id),
    heldContracts: () => minorOpContracts(cs),
  };
}

/** the minor's city as the contracts its operations submit read it */
export function minorContractCity(state: GameState, cs: CityState): CityTreeCity {
  const facts = minorBuildFacts(state, cs, minorKnownUnits(cs));
  const tables: CityBuildTables = {
    buildings: buildingTable(facts),
    units: unitTable(facts).map((v) => v ?? FX_MIN),
    projects: projectTable(minorProjectFacts(cs, facts)),
  };
  return minorTreeCity(state, cs, facts, tables, minorPickFacts(state, cs, facts), [], cs.threat ?? -1);
}

/** the minor's unit list for its purchases (CityBuildAI +0x650: the
 *  military AI's unit production table copied to the city, 0x79a320),
 *  sorted as 0x79d3a0 sorts it — the buildable first, then by the at-war
 *  players' sums, every player's sums and the strength, each the larger
 *  first (equal entries in database order) */
function purchaseEntries(state: GameState, cs: CityState): PurchaseEntry[] {
  const r = cs.research;
  const records = cs.armyKnown ?? [];
  const known = new Map<string, number>();
  const by = new Map<string, number>();
  for (const rec of records) {
    const t = installType('unit', rec.type, 'UNIT_');
    known.set(t, (known.get(t) ?? 0) + 1);
    by.set(`${t}:${rec.owner}`, (by.get(`${t}:${rec.owner}`) ?? 0) + 1);
  }
  const own = new Map<string, number>();
  for (const u of state.units) {
    if (u.seat !== cs.seat) continue;
    const t = installType('unit', u.type, 'UNIT_');
    own.set(t, (own.get(t) ?? 0) + 1);
  }
  const holds = (x: string): boolean => {
    const t = x.startsWith('TECH_') ? engineId('tech', x, 'TECH_', TECHS_KNOWN) : null;
    const c = x.startsWith('CIVIC_') ? engineId('civic', x, 'CIVIC_', CIVICS_KNOWN) : null;
    return (!!t && r.techs.includes(t)) || (!!c && r.civics.includes(c));
  };
  const wars = seatOf(state, cs.seat)?.wars ?? [];
  const players = [...new Set(records.map((x) => x.owner))].sort((a, b) => a - b);
  const rows = unitProductionEntries({
    isVersion: (u) => minorUnitVersion(u) === u,
    obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
    owned: (u) => own.get(u) ?? 0,
    known: (u) => known.get(u) ?? 0,
    knownBy: (u, p) => by.get(`${u}:${p}`) ?? 0,
    players,
    atWar: (p) => wars.includes(p),
    buildable: (u) => {
      const row = AI_UNITS[AI_UNIT_INDEX.get(u)!];
      return (!row.tech || holds(row.tech)) && (!row.civic || holds(row.civic));
    },
  });
  const order = rows.map((x, i) => [x, i] as const).sort(([a, i], [b, j]) =>
    (Number(b.buildable) - Number(a.buildable)) || (b.atWar - a.atWar) || (b.all - a.all) || (b.strength - a.strength) || (i - j));
  return order.map(([x]) => ({ unit: x.unit, valid: true, rank: x.all, subRank: x.atWar }));
}

/**
 * THE STANDING ARMY (0x5ca7e0, the city's full update): its quota, the whole
 * part of PSEUDOYIELD_STANDING_ARMY_NUMBER (1.0 at a minor's weight) times
 * the square root of its population (float32, as the game's fixed point).
 * Its list: the minor's units of AI type DEFENDER (`aiDefender`), in its
 * units' order (taken as pool order); then each unit of AI type COMBAT (a
 * fighting unit, not civilian, not recon) outside every running operation,
 * of the land or — where the city is coastal — the sea, in that order, joins
 * as a DEFENDER while the list is below the quota, else takes the place of
 * the list's weakest (the first of the lowest Combat, 0x5c4910) where its
 * Combat is higher (`aiStrengths`, 0x56dc90 with 0), the weakest turned
 * COMBAT. The count it lacks, the quota
 * less the list (CityBuildAI +0x2d8, below 0 where the list outgrows a quota
 * that fell), which the military AI adds to its Combat Desire as
 * PSEUDOYIELD_STANDING_ARMY_VALUE each. The release of a DEFENDER with
 * +0xf30 above 0 held by the player's +0x1278 is unread.
 */
export function minorStandingArmy(state: GameState, cs: CityState): number {
  if (cs.centerIndex < 0) return 0;
  const root = Math.fround(Math.sqrt(cs.population));
  const fl = Math.floor(root);
  const quota = fmul(pseudoYieldValue(aiView(state), cs.seat, FX, 'PSEUDOYIELD_STANDING_ARMY_NUMBER'),
    fl * FX + Math.trunc(Math.fround(Math.fround(root - fl) * 256))) >> 8;
  const busy = new Set(minorJobUnits(cs));
  const coastal = isCoastalLand(state.map, state.map.tiles[cs.centerIndex]);
  const own = state.units.filter((u) => u.seat === cs.seat).sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
  const list = own.filter((u) => u.aiDefender);
  const combat = (u: Unit) => aiStrengths(state, u).melee;
  const weakest = (): Unit | null => list.reduce<Unit | null>((w, u) => (w === null || combat(u) < combat(w) ? u : w), null);
  for (const u of own) {
    if (u.aiDefender || busy.has(u.id)) continue;
    const row = AI_UNITS[AI_UNIT_INDEX.get(installType('unit', u.type, 'UNIT_')) ?? -1];
    if (!row || row.civilian || row.recon || Math.max(row.combat, row.rangedCombat, row.bombard) <= 0) continue;
    if (row.domain !== 'DOMAIN_LAND' && !(row.domain === 'DOMAIN_SEA' && coastal)) continue;
    if (list.length < quota) {
      u.aiDefender = true;
      list.push(u);
      continue;
    }
    const w = weakest();
    if (!w || combat(w) >= combat(u)) continue;
    delete w.aiDefender;
    list.splice(list.indexOf(w), 1);
    u.aiDefender = true;
    list.push(u);
  }
  return quota - list.length;
}

/** the minor's city threat (0x5cbd10) on its knowledge base's records aged
 *  at most ARMY_READ_AGE (runs/h1_duelv1117 Caguana t50: three Warrior
 *  records on 611, seen at t33, t35 and t50, the one of t50 alone counts,
 *  and the game starts no City Defense) and its running operations
 *  (`minorOpNear`) */
export function minorThreat(state: GameState, cs: CityState): CityThreat {
  return knownThreat(aiView(state) as unknown as Parameters<typeof cityThreat>[0], cs, cs.seat, cs.centerIndex,
    (p, plot, dist) => minorOpNear(state, cs, p, plot, dist));
}

/** the minor's defensive cancel (`defensiveCancel`): its queue's head, the
 *  item in hand (a repair its building's), its city AI's tables, the
 *  district's value at its plot off the plot analysis */
function minorDefensiveCancel(state: GameState, cs: CityState, ai: CityAi, city: CityTreeCity, tables: CityBuildTables,
  pf: PickFacts): number | null {
  const k = cs.prodItem ?? '';
  const [kind, id] = k.split(':');
  const head = {
    unit: kind === 'unit' ? installType('unit', id, 'UNIT_') : null,
    building: kind === 'building' || kind === 'repair' ? installType('building', id, 'BUILDING_') : null,
    district: kind === 'district' ? installType('district', id, 'DISTRICT_') : null,
    project: kind === 'project' ? installType('project', id, 'PROJECT_') : null,
  };
  return defensiveCancel(ai, city.id, city.underThreat, {
    head,
    unitValue: (u) => tables.units[AI_UNIT_INDEX.get(u) ?? -1] ?? FX_MIN,
    buildingValue: (b) => tables.buildings[AI_BUILDING_INDEX.get(b) ?? -1] ?? FX_MIN,
    districtValue: (d) => {
      const e = city.evals.find((x) => x.plot === cs.prodSite);
      const row = AI_DISTRICTS.findIndex((r) => r.type === d);
      return e && row >= 0 ? e.districts[row] : 0;
    },
    projectValue: (p) => tables.projects[AI_PROJECTS.findIndex((r) => r.type === p)] ?? FX_MIN,
    bestPlainBuilding: () => specializationBests(tables, { ...pf, defense: false }).building.value,
    bestDefensiveUnit: () => specializationBests(tables, { ...pf, defense: true }).unit.value,
  }, () => minorSetItem(state, cs, null));
}

/** a city's threat (0x5cbd10) on its holder's knowledge base's records aged
 *  at most ARMY_READ_AGE */
function knownThreat(view: Parameters<typeof cityThreat>[0], holder: Seat, seat: number, centre: number,
  operationNear: (player: number, plot: number, dist: number) => boolean): CityThreat {
  const aged = holder.armyAged;
  const records = (holder.armyKnown ?? []).filter((x) => aged === undefined || aged - x.seen <= ARMY_READ_AGE);
  return cityThreat(view, seat, centre, {
    army: (p) => records.filter((x) => x.owner === p).map((x) => ({
      id: x.id, owner: x.owner, type: installType('unit', x.type, 'UNIT_'), plot: x.plot,
      combat: UNITS[x.type as keyof typeof UNITS]?.combat ?? 0, ranged: UNITS[x.type as keyof typeof UNITS]?.ranged?.strength ?? 0,
      damage: x.damage, seen: x.seen,
    })),
    operationNear,
  });
}

/** A FREE CITY's threat (0x5cbd10, its CityBuildAI's update) on the Free
 *  Cities' knowledge base (`freeKnowledge`): the full civs are the players
 *  it fights (0x469cd0 — the military AI's floor counts each major at war:
 *  runs/h1_duelw1123 t200-t201, no Free City, desire 0.5 = -0.5 + 0.5 x 2),
 *  the city-states not; the Free Cities' running operations against a
 *  player (their raids, `freeOpNear`) */
export function freeCityThreat(state: GameState, city: City): CityThreat {
  const view = aiView(state) as unknown as Parameters<typeof cityThreat>[0];
  const fights = (i: number, j: number): boolean => (i === FREE_SEAT && isCiv(j)) || (j === FREE_SEAT && isCiv(i));
  const free: typeof view = Object.assign(Object.create(view), { atWar: (i: number, j: number) => fights(i, j) || view.atWar(i, j) });
  return knownThreat(free, freeSeatOf(state), FREE_SEAT, city.centerIndex, (p, plot, dist) => freeOpNear(state, p, plot, dist));
}

let tracer: ((line: string) => void) | null = null;

/** a lab's view of each minor's AI turn: its bests, its contracts, its
 *  trees, its item (null off) */
export function traceMinorAi(fn: ((line: string) => void) | null): void {
  tracer = fn;
}

/**
 * B: THE MINOR'S SAVINGS AND MILITARY AI'S TURN, on its knowledge base as
 * its last look left it: the look of the turn comes after the operations'
 * evaluation (runs/h1_duelv1124 player 2: the camp 8:14 placed in t5, in
 * its knowledge base's t6 log, its candidate from t7; so 1121 player 2's
 * 10:2 and player 4's 34:23, 1127 player 4's 6:8: each a camp placed on a
 * plot the minor had revealed).
 */
export function minorMilitaryTurn(state: GameState, cs: CityState): void {
  if (cs.centerIndex < 0) return;
  const eco = (cs.economy ??= newEconomicMemory());
  // its GREAT_PEOPLE slot stands apart while the game has a class available
  // (0x2f7eb0 reads the game's classes, not the player's; runs/h1_duelw1124
  // Bologna's Warrior contract of t15 bought at t18, at 101 + 6 Gold, the
  // folded slot's savings passing from t16; 1127 p4's Builder at t46, p2's
  // at t210, as logged)
  savingsTurn(eco, Math.trunc(cs.treasury * FX), minorGreatPersonClass(state));
  // its contract purchases, in its city on the threat its last update stored
  if (cs.cityAi) {
    const pcity = minorPurchaseCity(state, cs, cs.threat ?? -1);
    purchaseContracts(eco, cs.cityAi, false, (c) => (c.city === -1 || c.city === pcity.id ? [pcity] : []),
      (_c, u) => minorBuyInstall(state, cs, u));
  }
  minorOpsEvaluate(state, cs);
}

/** a Great Person class is available in the game (0x2f7eb0, the majors'
 *  `greatPersonClassAvailable` over the AI's classes) */
export function minorGreatPersonClass(state: GameState): boolean {
  const view = aiView(state);
  return AI_GREAT_PERSON_CLASSES.some((c) => view.greatPersonClassAvailable(c));
}

/** the minor's city as TryPurchaseUnits reads it: its Gold price of the
 *  unit; the purchase request lets it through where the purse covers the
 *  price and the centre or a plot beside it takes the unit */
function minorPurchaseCity(state: GameState, cs: CityState, threat: number): PurchaseCity {
  const price = (u: string): number => {
    const id = engineId('unit', u, 'UNIT_', UNITS);
    return id ? minorUnitPrice(state, cs, id, 'gold') : -1;
  };
  return {
    id: minorCity(cs).id,
    goldCost: price,
    threat,
    // the purchase request (0x977570): the purse covers the price and the
    // city's centre takes the unit (`purchaseSpotBlocked`) — a unit bought
    // stands on the centre, so one of its stacking class there refuses it
    // (runs/h1_duelw1124 Granada
    // t20-t23 and runs/h1_duelm1117 Antananarivo t24-t26: threatened, the
    // Gold there, a Warrior on the centre, nothing bought; every logged
    // military purchase of the five duels bought onto a centre with no
    // military unit)
    canPurchase: (u) => {
      if (!goldAffordable(cs.treasury, price(u))) return false;
      const id = engineId('unit', u, 'UNIT_', UNITS);
      return !!id && !purchaseSpotBlocked(state, cs, cs.seat, id);
    },
  };
}

/** the minor buys the install's unit `u` in Gold (`minorBuyUnit`) */
function minorBuyInstall(state: GameState, cs: CityState, u: string): void {
  const id = engineId('unit', u, 'UNIT_', UNITS);
  if (id) minorBuyUnit(state, cs, id, 'gold');
}

/**
 * THE MINOR'S CITY AI TURN (the order above, after `minorMilitaryTurn` and
 * the knowledge base's look): its city's update and events, the Default
 * Specialization on an empty queue, its purchases, its trees' tick.
 * `fresh`: its city AI had not run before this turn (the founding turn's
 * first look).
 */
export function minorAiTurn(state: GameState, cs: CityState, fresh: boolean): void {
  if (cs.centerIndex < 0) return;
  const ai = (cs.cityAi ??= newCityAi());
  const eco = (cs.economy ??= newEconomicMemory());
  // A: the city's update
  // a founding turn's first look reads the military AI's unit production
  // table as it stood before the city: no known unit, every entry 1.0
  // (runs/h1_duelv1117 t1: every city-state's Warrior, Slinger and Builder
  // on the one curve of 1.0), and no city modifier yet
  const known = fresh ? () => 0 : minorKnownUnits(cs);
  const facts = minorBuildFacts(state, cs, known, fresh);
  const tables: CityBuildTables = {
    buildings: buildingTable(facts),
    units: unitTable(facts).map((v) => v ?? FX_MIN),
    projects: projectTable(minorProjectFacts(cs, facts)),
  };
  cs.unitValues = tables.units;
  if (!fresh) cs.resourceCounts = Object.fromEntries(minorResourceCounts(state, cs));
  const t = minorThreat(state, cs);
  const threat = t.level;
  cs.threat = threat;
  cs.threatNear = t.near;
  const pf = minorPickFacts(state, cs, facts);
  cs.standingArmyShort = minorStandingArmy(state, cs);
  const evals = minorPlotEvals(state, cs, facts, tables.buildings);
  const city = minorTreeCity(state, cs, facts, tables, pf, evals, threat);
  const w = minorTreeWorld(state, cs, ai, city);
  const r = cs.research;
  goalsReached(ai, (g) => w.techHeld(g) || w.civicHeld(g),
    (g) => (r.tech !== null && g === installType('tech', r.tech, 'TECH_')) || (r.civic !== null && g === installType('civic', r.civic, 'CIVIC_')),
    (p) => tileSeat(state.map.tiles[p]) === cs.seat);
  freeSlots(ai, w, city.id);
  inHandCheck(ai, city, () => minorSetItem(state, cs, null));
  city.current = currentItem(cs);
  city.eventBuilding = eventBuilding(tables, pf);
  city.bestImprovement = pickImprovement(ai, w, evals);
  const list = AI_CITY_EVENTS[AI_CITY_EVENT_LISTS.MINOR_CIV_DEFAULT_TRAIT];
  if (!fresh) {
    // its Food focus (0x5cdae0), set before the events
    const st = computeCityStats(state, minorCity(cs));
    minorFoodFocus(state, cs, st.foodSurplus, st.housing);
    // the City Defense event (0x5cced0) opens with the defensive cancel
    const was = cs.prodItem;
    const cancelled = minorDefensiveCancel(state, cs, ai, city, tables, pf);
    if (cancelled !== null) {
      city.current = currentItem(cs);
      tracer?.(`t${state.turn} ${cs.name} Canceling current build ${was ?? '-'}, OLD VALUE ${(cancelled / FX).toFixed(1)}`);
    }
    defenseEvent(ai, w, city, list.CITY_UNDER_THREAT ?? null);
    buildingEvent(ai, w, city, list.CITY_EVENT_UNIT_OR_BUILDING);
    districtEvent(ai, w, city, list.CITY_EVENT_DISTRICT);
    improvementEvent(ai, w, city, list.CITY_EVENT_IMPROVEMENT);
  }
  // C: the Default Specialization on an empty queue
  if (!cs.prodItem) {
    const hand = cityContracts(ai, city, () => undefined);
    const bests = specializationBests(tables, pf);
    const item = hand ? contractItemOf(hand) : null;
    // the queue's refusal FAILS the contract and the turn falls to the pick
    // (0x5d5162 -> 0x5d516a)
    if (hand && takesTurn(hand, bests.unit.value, bests.project.value)
      && queueContract(hand, city, () => !!item && minorQueueOk(state, cs, item), () => undefined) && item) {
      minorSetItem(state, cs, item);
      cs.prodSetValue = hand.value;
    } else {
      ai.inHand[city.id] = -1;
      const pick = defaultSpecialization(tables, pf);
      const item = pick ? minorItemOfType(pick.type) : null;
      if (pick && item && minorQueueOk(state, cs, item)) {
        minorSetItem(state, cs, item);
        cs.prodSetValue = pick.value;
      }
    }
    city.current = currentItem(cs);
    city.currentValue = cs.prodSetValue ?? FX_MIN;
  }
  // the purchases: a threatened city buys its list's first unit while it may
  if (threat > -1) {
    const entries = purchaseEntries(state, cs);
    purchaseTurn(eco, minorPurchaseCity(state, cs, threat), false, () => purchasePick(entries, (u) => pf.canTrain(u),
      (u) => !AI_UNITS[AI_UNIT_INDEX.get(u)!].mustPurchase, () => null, null), (_c, u) => minorBuyInstall(state, cs, u));
  }
  // the trees' tick
  tickCityTrees(ai, w);
  if (tracer) {
    const b = specializationBests(tables, pf);
    const name = (k: string, i: number) => (i < 0 ? '-' : (k === 'b' ? AI_BUILDINGS[i].type : AI_UNITS[i]?.type ?? `${i}`));
    tracer(`t${state.turn} ${cs.name} threat ${threat} under ${city.underThreat} item ${cs.prodItem ?? '-'} ${Math.round(cs.prodProgress ?? 0)}`
      + ` best b ${name('b', b.building.index)} ${(b.building.value / FX).toFixed(1)} u ${name('u', b.unit.index)} ${(b.unit.value / FX).toFixed(1)} p ${b.project.index} ${(b.project.value / FX).toFixed(1)}`
      + ` imp ${city.bestImprovement} slots ${JSON.stringify(ai.slots[city.id] ?? [])}`
      + ` trees [${ai.trees.map((t) => `${t.id}:${t.name.split(' ').pop()}:${t.trigger.building ?? t.trigger.unit ?? t.trigger.district ?? t.trigger.improvement}@${t.trigger.plot}`).join(' ')}]`
      + ` contracts [${ai.contracts.map((c) => `${c.id}:${c.unit ?? c.building ?? c.district ?? ai.techContracts[c.id] ?? 'PLOT'}:${c.progress}:${(c.value / FX).toFixed(1)}`).join(' ')}] hand ${ai.inHand[city.id] ?? -1}`);
  }
}

/** a contract's item as the minor's item (a district at the contract's plot) */
function contractItemOf(c: AiContract) {
  if (c.unit) return minorItemOfType(c.unit);
  if (c.building) return minorItemOfType(c.building);
  if (c.district) {
    const id = engineId('district', c.district, 'DISTRICT_', DISTRICTS) as DistrictId | null;
    return id && c.plot >= 0 ? { district: id, site: c.plot } : null;
  }
  return null;
}

/** an item the minor's step built hands its contracts in (the completion
 *  signals): the unit's id, -1 for a building or district */
export function minorItemBuilt(cs: CityState, item: ContractItem, unitId: number): void {
  const ai = cs.cityAi;
  if (!ai) return;
  contractBuilt(ai, minorCity(cs).id, item, unitId, (tree, unit) => {
    const t = ai.trees.find((x) => x.id === tree);
    if (t) {
      if (!t.units.includes(unit)) t.units.push(unit);
    } else if (cs.ops && item.unit) joinBuilt(cs.ops, tree, { id: unit, type: item.unit });
  });
}
