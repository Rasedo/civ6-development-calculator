/**
 * THE AI'S VIEW OF THIS ENGINE (cpu/core/aiViewTypes.ts): one seat-agnostic
 * read-only view over a GameState, in the game's type names. Nothing here
 * writes the state; the slot rebuild a government change would make is laid
 * on copies (`carryLayout`).
 */
import type { AiCityDefenceView, AiKnownCityView, AiMapPlotView, AiUnitView, AiView } from './aiViewTypes';
import { DIRECTION_TYPES, hexDistance, neighborTile, tilesWithin } from '../../world/hex';
import { isCoastalLand, isImpassable, isWater } from '../../world/query';
import { FX, fmul, fxOf, turnsAt, type AiCityView, type AiDistrictView, type AiPlotView } from './aiValue';
import { AI_YIELDS, pseudoYieldWeights, yieldWeights } from './aiWeights';
import { engineId, gameTypeOf, installFeature, installTerrain } from '../data/aliases';
import { isExplored } from './fog';
import { CITY_STRIKE_RANGE, plotPressureLead } from './phase';
import { governorSum } from './governors';
import { CITY_STATE_SUZERAIN_BONUS, MINOR_UPGRADE_GOLD, govInfluence } from '../data/cityStates';
import { BARB_SEAT, FREE_SEAT, campTiles, cityHolders, citiesOf, civsAtWar, denounceActive, seatsAllied, seatsFriends, hiddenResourcesFor, homeContinent, isCiv, onHomeContinent, isCityStateSeat, leaderOf, majorityReligionOf, seatOf, tileSeat, unitsOf } from './seats';
import { aiStrengths, districtHealth, planUnit, reachPlots, tacticalTargets, type Target } from './tactical';
import { AIR_REBASE_COLS, AIR_STRIKE_COLS, IMPROVEMENT_IDS, unitActionIndex } from './unitActions';
import { airPillageTargets, airStrikeTargets, rebaseTargets } from './air';
import { plotsSeenNow, ringPlots } from './barbarians';
import { cityDefenseStrength, cityStrikeStrength, encircled, garrisonTerm, predictCityBlow, siegeAssist, unitAttackRange } from './combat';
import { outerPool, wallsTier } from './rules';
import { borderClosedTo, builderCost, cityAtIndex, embarkTechMoves, traderCost, unitFullMoves, unitDomain, unitExertsZoc, unitsHostile, unitVisibleTo } from './units';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { COST_MULTIPLIER_PCT, EMBARK_MOVES, MP_SCALE } from '../data/constants';
import { GP_CLASSES } from '../data/greatPeople';
import { GOVERNMENT_LIST } from '../data/policies';
import { DIPLO_VICTORY_POINTS } from '../data/seats';
import { getModifiers, governmentBit, inDarkAge, makeYieldCtx, seatGovernment } from './effects';
import { gpOffer, greatPersonPointsPerTurn } from './greatPeople';
import type { City, CityState, DistrictId, GameState, GreatPersonClass, Unit, YieldKey } from './types';
import { BUILDINGS, effectiveBuilding } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { UNIT_HP, UNITS } from '../data/units';
import { IMPROVEMENTS } from '../data/improvements';
import type { ImprovementId } from './types';
import { computeUnlocks } from './effects';
import { civicAnalysis } from './aiCivics';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, amenityCityOf, growthForecast, housingValue, type CityGrowth } from './aiCityBuild';
import { AI_BUILDINGS, AI_RESOURCES, AI_UNITS } from '../data/aiBuildTables';
import { unitProductionTable } from './aiUnitProduction';
import { resourceValue } from './aiResource';
import { stockFree } from './stockpile';
import { minorItemTurns, minorKnownUnits, minorUpgradeVisible, minorResourceFacts, minorUnitExpected, minorUnitProduction, minorUnitVersion } from './minorBuild';
import { majorItemTurns, majorTraits, majorUnitExpected, majorUnitVersion, seatResearchTurns } from './freeCityBuild';
import { cityStateAt as cityStateAtPlot, envoysHere, envoysOf, minorCity, suzerainOf, suzerainProjectMult } from './cityStates';
import { grievanceWith } from './grievance';
import { tradeCapacity } from './trade';
import { buildingVariantAdjacency, effectiveAdjacency } from './yields';
import { civEraIndex, computeCityStats } from './city';
import { PROJECTS } from '../data/projects';
import { RESOURCES } from '../../world/resources';
import { tileAppeal } from './appeal';
import { DEFAULT_HANDICAP } from '../data/barbarians';
import { availableProjects, districtCost, districtScaledBase, projectCost, settlerCost, unitProdCost } from './game';

const districtType = (id: string): string => `DISTRICT_${id}`;

/** a district's yield of a kind (0x24b5a0: District::GetYield 0x249850 and
 *  0x24aae0): its adjacency yield of that kind at its plot (0x366df0) and its
 *  flat yields; none on a pillaged plot. The city's buildings in it are no
 *  part of it (runs/h1_duelw1124 player 4 t40: Natural Philosophy 29 for a
 *  Campus of adjacency 2 beside its Library; 1121 Hunza's Commercial Hub of
 *  no adjacency beside its Market, none) */
function districtYieldOf(state: GameState, seat: number, city: City, d: { type: DistrictId; tileIndex: number }, key: YieldKey): number {
  const tile = state.map.tiles[d.tileIndex];
  if (tile.districtPillaged) return 0;
  const ctx = makeYieldCtx(state, seat);
  const def = DISTRICTS[d.type];
  let y = 0;
  if (def.adjacencyYield === key) y += effectiveAdjacency(ctx, tile, d.type, buildingVariantAdjacency(ctx.mods.civ, city, d.type));
  y += ctx.mods.districtYieldAdd[d.type]?.[key] ?? 0;
  return y;
}
const YIELD_KEY: Readonly<Record<string, YieldKey>> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold',
  YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};
const AI_YIELD_KEYS: readonly YieldKey[] = AI_YIELDS.map((y) => YIELD_KEY[y]);
const govType = (id: string): string => gameTypeOf('government', id, 'GOVERNMENT_');
const UNIT_ACTION = unitActionIndex(IMPROVEMENT_IDS);

/** a city's growth as the growth forecast reads it (`CityGrowth`) */
export function cityGrowth(state: GameState, city: City): CityGrowth {
  const stats = computeCityStats(state, city);
  return {
    surplus: fxOf(stats.foodSurplus),
    housing: stats.housing,
    population: city.population,
    stored: fxOf(city.foodBox),
    multiplier: stats.foodSurplus > 0 ? Math.round((stats.effectiveFoodSurplus / stats.foodSurplus) * FX) : FX,
  };
}

export function aiView(state: GameState): AiView {
  const seat = (i: number) => {
    const s = seatOf(state, i);
    if (!s) throw new Error(`aiView: no seat ${i}`);
    return s;
  };
  const weights = new Map<number, Record<string, number>>();
  const weightsOf = (i: number): Record<string, number> => {
    let w = weights.get(i);
    if (!w) weights.set(i, (w = yieldWeights(state, i)));
    return w;
  };
  const pseudo = new Map<number, Map<string, number>>();
  const pseudoOf = (i: number): Map<string, number> => {
    let w = pseudo.get(i);
    if (!w) pseudo.set(i, (w = pseudoYieldWeights(state, i)));
    return w;
  };
  const { map } = state;
  let plots: AiMapPlotView[] | null = null;
  // a seat's tactical target list on this state
  const targetLists = new Map<number, Target[]>();
  const targetsOf = (i: number): Target[] => {
    let t = targetLists.get(i);
    if (!t) targetLists.set(i, (t = tacticalTargets(state, i, plotsSeenNow(state, new Set([i])), null, [])));
    return t;
  };
  const unitTables = new Map<number, ReadonlyMap<string, { value: number }>>();
  const hidden = new Map<number, ReadonlySet<string>>();
  const hiddenOf = (i: number) => {
    let h = hidden.get(i);
    if (!h) hidden.set(i, (h = hiddenResourcesFor(state, i)));
    return h;
  };
  // a seat's city by id; a city-state's one city is its own view
  // (`minorCity`, id -1)
  const cityOf = (i: number, id: number): City | undefined => {
    if (isCityStateSeat(i)) {
      const cs = seatOf(state, i) as CityState | undefined;
      return cs && cs.centerIndex >= 0 ? minorCity(cs) : undefined;
    }
    return citiesOf(state, i).find((c) => c.id === id);
  };
  // a seat's cities; a city-state's its one city (`minorCity`)
  const seatCities = (i: number): City[] => {
    if (!isCityStateSeat(i)) return citiesOf(state, i);
    const cs = seatOf(state, i) as CityState | undefined;
    return cs && cs.centerIndex >= 0 ? [minorCity(cs)] : [];
  };
  const centres = new Set([...state.seats, ...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : [])]
    .flatMap((s) => s.cities.map((c) => c.centerIndex)));
  for (const cs of state.cityStates) if (cs.centerIndex >= 0) centres.add(cs.centerIndex);
  return {
    plots: () => (plots ??= map.tiles.map((t): AiMapPlotView => ({
      index: t.index, x: t.col, y: t.row, water: isWater(t),
      owner: tileSeat(t), district: !!t.district || centres.has(t.index), city: centres.has(t.index),
      area: t.area ?? -1, region: t.region ?? -1,
      coastal: isCoastalLand(map, t), lake: t.terrain === 'LAKE',
    }))),
    plotsWithin: (p, r) => {
      const t = map.tiles[p];
      return tilesWithin(map, t.col, t.row, r).map((x) => x.index);
    },
    plotsRing: (p, r) => ringPlots(state, p, r),
    plotDistance: (a, b) => {
      const ta = map.tiles[a];
      const tb = map.tiles[b];
      return hexDistance(map, ta.col, ta.row, tb.col, tb.row);
    },
    resourceHeld: (i, r) => {
      const id = r.replace(/^RESOURCE_/, '');
      return map.tiles.filter((t) => t.resource === id && tileSeat(t) === i && t.improvement && !t.pillaged).length;
    },
    cityPlots: (i) => seatCities(i).map((c) => c.centerIndex),
    leaderType: (i) => {
      const l = leaderOf(state, i);
      return l ? gameTypeOf('leader', l, 'LEADER_') : null;
    },
    units: (i) => unitsOf(state, i).map((u) => unitView(state, u)),
    unitReach: (id, turns) => {
      const u = state.units.find((x) => x.id === id);
      return u ? reachPlots(state, u, turns).map((r) => ({ plot: r.tile, turns: r.turns, moves: r.moves })) : [];
    },
    unitActionColumn: (name) => UNIT_ACTION[name] ?? -1,
    hostileUnits: (i) => {
      const seen = plotsSeenNow(state, new Set([i]));
      return state.units.filter((u) => unitsHostile(state, { seat: i }, u) && seen[u.tileIndex] && unitVisibleTo(state, u, i))
        .flatMap((u) => {
          const d = UNITS[u.type];
          const bombard = d?.bombard ?? 0;
          const melee = d?.combat ?? 0;
          const ranged = bombard > 0 ? 0 : d?.ranged?.strength ?? 0;
          if (melee <= 0 && ranged <= 0 && bombard <= 0) return [];
          return [{ id: u.id, plot: u.tileIndex, melee, ranged, bombard, range: unitAttackRange(u), air: unitDomain(u.type) === 'air' }];
        });
    },
    hostileCities: (i) => {
      const seen = plotsSeenNow(state, new Set([i]));
      return cityHolders(state).filter((s) => unitsHostile(state, { seat: i }, s))
        .flatMap((s) => s.cities.filter((c) => seen[c.centerIndex]).map((c): AiCityDefenceView => ({ plot: c.centerIndex })));
    },
    costMultiplierPct: COST_MULTIPLIER_PCT,
    gameEra: state.gameEra ?? 0,
    cityStates: state.cityStates.length,
    civicsHeld: (i) => new Set(seat(i).research.civics.filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))),
    // the civics AI's last analysis (a city-state's and the Free Cities' kept
    // on their research, none before their first; a major's taken now), its
    // rows whose score the analysis job left above 0 — the row's own value,
    // the turn's propagation not yet run (runs/h1_duelw1121: a city-state's
    // Charismatic Leader first scores the turn after Political Philosophy
    // comes within the horizon, 102 of 105; none of its cards at t1)
    civicList: (i) => new Set((seat(i).research.civicAiEntries ?? (isCiv(i) ? civicAnalysis(state, i, seat(i).culRate ?? 0) : []))
      .filter((e) => e.base > 0).map((e) => gameTypeOf('civic', e.civic, 'CIVIC_'))),
    government: (i) => {
      const g = seatGovernment(state, i);
      return g ? govType(g) : null;
    },
    governmentsHeld: (i) => new Set(GOVERNMENT_LIST.filter((g) => seat(i).government.held & governmentBit(g.id)).map((g) => govType(g.id))),
    darkAge: (i) => inDarkAge(state, i),
    goldenAge: (i) => seat(i).age === 2,
    fullCiv: (i) => isCiv(i),
    greatPersonClassAvailable: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return !GP_CLASSES.includes(c) || gpOffer(state, c) !== -2;
    },
    // a city-state's one city is its capital
    cities: (i): AiCityView[] => seatCities(i).map((c) => ({ id: c.id, capital: c.isCapital || isCityStateSeat(i) })),
    cityOwnedPlots: (i, id): AiPlotView[] => {
      // a city-state's one city is its own view (`minorCity`, id -1) and owns
      // its whole ground
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      if (!city) return [];
      const centre = map.tiles[city.centerIndex];
      return tilesWithin(map, centre.col, centre.row, 3)
        .filter((t) => tileSeat(t) === i && (minor || t.ownerCity === city.id))
        .map((t) => ({
          terrain: installTerrain(t.terrain, t.elevation),
          feature: t.feature ? installFeature(t.feature) : null,
          resource: t.resource ? `RESOURCE_${t.resource}` : null,
          resourceVisible: !!t.resource && !hiddenOf(i).has(t.resource),
          improvement: t.improvement,
          impassable: isImpassable(t),
          resourceClass: t.resource && RESOURCES[t.resource] ? `RESOURCECLASS_${RESOURCES[t.resource].category.toUpperCase()}` : null,
          improved: !!t.resource && !!t.improvement && RESOURCES[t.resource]?.improvement === t.improvement,
          appeal: tileAppeal(map, t),
        }));
    },
    cityYield: (i, id, type) => {
      // a city-state's one city is its own view (`minorCity`, id -1)
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      const key = YIELD_KEY[type];
      return city && key ? computeCityStats(state, city).total[key] : 0;
    },
    yieldWeight: (i, type) => weightsOf(i)[type] ?? 0,
    pseudoYieldWeight: (i, type) => pseudoOf(i).get(type) ?? 0,
    districts: (i): AiDistrictView[] => seatCities(i).flatMap((c) => c.districts
      .filter((d) => d.type !== 'CITY_CENTER')
      .map((d) => ({ cityId: c.id, type: districtType(d.type) }))),
    districtYield: (i, id, type, yieldType) => {
      const city = cityOf(i, id);
      const key = YIELD_KEY[yieldType];
      const d = city?.districts.find((x) => districtType(x.type) === type);
      return city && d && key ? districtYieldOf(state, i, city, d, key) : 0;
    },
    cityHasBuilding: (i, id, building) => {
      const city = cityOf(i, id);
      // the install type as the engine's id (BUILDING_WALLS is ANCIENT_WALLS);
      // a civilization's own building (BUILDING_TSIKHE, the engine's
      // RENAISSANCE_WALLS) only in a city of its trait: a city-state's Star
      // Fort is no Tsikhe (runs/h1_duelu1117 Antananarivo t132-t148, Limes
      // valued on the Tsikhe it lacks, 84-97 as logged)
      const trait = AI_BUILDINGS[AI_BUILDING_INDEX.get(building) ?? -1]?.trait;
      if (trait && (isCityStateSeat(i) || !majorTraits(state, i).includes(trait))) return false;
      const b = engineId('building', building, 'BUILDING_', BUILDINGS);
      return !!city && !!b && city.buildings.includes(b);
    },
    cityHasDistrict: (i, id, type) => {
      const city = cityOf(i, id);
      return !!city && city.districts.some((d) => districtType(d.type) === type);
    },
    cityReligion: (i, id) => {
      if (isCityStateSeat(i)) return majorityReligionOf(state, i);
      return cityOf(i, id)?.followedReligion ?? -1;
    },
    plotTerrain: (p) => installTerrain(map.tiles[p].terrain, map.tiles[p].elevation),
    plotFeature: (p) => (map.tiles[p].feature ? installFeature(map.tiles[p].feature!) : null),
    plotsWithinReadAsAxial: (p, r) => {
      const t = map.tiles[p];
      const col = t.col + (t.row >> 1);
      const out: number[] = [];
      for (let row = Math.max(0, t.row - r); row <= Math.min(map.height - 1, t.row + r); row++) {
        for (let c = 0; c < map.width; c++) if (hexDistance(map, col, t.row, c, row) <= r) out.push(row * map.width + c);
      }
      return out;
    },
    cityDistricts: (i, id) => cityOf(i, id)?.districts.map((d) => districtType(d.type)) ?? [],
    cityPlot: (i, id) => cityOf(i, id)?.centerIndex ?? -1,
    districtPlot: (i, id, type) => {
      const c = cityOf(i, id);
      return c?.districts.find((d) => districtType(d.type) === type)?.tileIndex ?? null;
    },
    cityFoodSurplus: (i, id) => {
      const c = cityOf(i, id);
      return c ? fxOf(computeCityStats(state, c).foodSurplus) : 0;
    },
    districtCost: (i, type) => {
      const id = engineId('district', type, 'DISTRICT_', DISTRICTS) as DistrictId | null;
      if (!id) return 0;
      return isCityStateSeat(i) ? districtScaledBase(seat(i).research, id) : districtCost(state, i, id);
    },
    resourceStockFree: (i, type) => {
      const id = engineId('resource', type, 'RESOURCE_', RESOURCES);
      return id ? stockFree(state, i, id) : 0;
    },
    resourceValueOf: (i, type, count, t, h) => {
      const cs = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const row = AI_RESOURCES.find((r) => r.type === type);
      return cs && cs.centerIndex >= 0 && row ? resourceValue(minorResourceFacts(state, cs), row, count, t, h) : 0;
    },
    buildingsBuilt: (type) => {
      const id = engineId('building', type, 'BUILDING_', BUILDINGS);
      if (!id) return 0;
      return [...cityHolders(state).flatMap((h) => h.cities), ...state.cityStates.flatMap((cs) => (cs.centerIndex >= 0 ? [minorCity(cs)] : []))]
        .filter((c) => c.buildings.includes(id)).length;
    },
    unitCost: (i, type) => {
      const id = engineId('unit', type, 'UNIT_', UNITS);
      if (!id) return 0;
      if (UNITS[id].settler) return settlerCost(state, i);
      if (id === 'BUILDER') return builderCost(state, i);
      if (UNITS[id].trader) return traderCost(state, i);
      return Math.trunc(unitProdCost(state, i, id, UNITS[id].cost));
    },
    districtBuildingYields: (i, type, yieldType) => {
      const key = YIELD_KEY[yieldType];
      const civ = makeYieldCtx(state, i).mods.civ;
      return Object.values(BUILDINGS).filter((b) => districtType(b.district) === type).map((b) => ({
        building: `BUILDING_${b.id}`,
        amount: key ? effectiveBuilding(civ, b.id)?.yields?.[key] ?? 0 : 0,
      }));
    },
    tradeRouteCapacity: (i) => tradeCapacity(state, i),
    traders: (i) => unitsOf(state, i).filter((u) => UNITS[u.type]?.trader).length,
    // a city-state's trade AI's route value (`minorTradeValue`); a major's
    // is not read
    tradeKnowledge: (i) => (isCityStateSeat(i) ? state.cityStates.find((c) => c.seat === i)?.tradeValue ?? 0 : null),
    influenceTokensUsed: (i) => state.cityStates.reduce((n, cs) => n + envoysOf(cs, i), 0),
    tributaries: (i) => state.cityStates.filter((cs) => suzerainOf(cs) === i).length,
    cityStateCount: () => state.cityStates.filter((cs) => cs.centerIndex >= 0).length,
    unitMaintenances: (i) => state.units.filter((u) => u.seat === i).map((u) => UNITS[u.type]?.maintenance ?? 0),
    // a city-state's units whose upgrade its research unlocks, each at the
    // city-state's upgrade price; another party's not read
    unitUpgradeGolds: (i) => {
      const cs = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      return cs ? state.units.filter((u) => u.seat === i && minorUpgradeVisible(cs, u)).map(() => MINOR_UPGRADE_GOLD) : [];
    },
    // its government's (a city-state's Chiefdom); the Free Cities accrue none
    influencePointsPerTurn: (i) => (i === FREE_SEAT ? 0 : govInfluence(seatGovernment(state, i)).points),
    treasury: (i) => seatOf(state, i)?.treasury ?? 0,
    // a city-state's item in hand a unit; another party's queue not read
    cityTrainingUnit: (i) => {
      const cs = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      return !!cs?.prodItem?.startsWith('unit:');
    },
    grossGoldYield: (i) => seatCities(i).reduce((a, c) => {
      const st = computeCityStats(state, c);
      return a + st.total.gold + st.maintenance;
    }, 0),
    // a city-state's table on its knowledge base's counts; a major's or the
    // Free Cities' on their own versions, the Free Cities knowing none
    unitProductionValue: (i, type) => {
      let table = unitTables.get(i);
      if (!table) {
        const s = seatOf(state, i);
        if (!s) return 0;
        if (isCityStateSeat(i)) table = minorUnitProduction(state, s as CityState, minorKnownUnits(s as CityState));
        else {
          const traits = majorTraits(state, i);
          const r = s.research;
          const own = new Map<string, number>();
          for (const u of unitsOf(state, i)) {
            const t = gameTypeOf('unit', u.type, 'UNIT_');
            own.set(t, (own.get(t) ?? 0) + 1);
          }
          const holds = (x: string): boolean => {
            const t = x.startsWith('TECH_') ? engineId('tech', x, 'TECH_', TECHS) : null;
            const c = x.startsWith('CIVIC_') ? engineId('civic', x, 'CIVIC_', CIVICS) : null;
            return (!!t && r.techs.includes(t)) || (!!c && r.civics.includes(c));
          };
          const known = i === FREE_SEAT ? () => 0 : minorKnownUnits(s as CityState);
          table = unitProductionTable({
            isVersion: (u) => majorUnitVersion(traits, u) === u,
            obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
            owned: (u) => own.get(u) ?? 0,
            known,
          });
        }
        unitTables.set(i, table);
      }
      return table.get(type)?.value ?? 0;
    },
    playerUnits: (i) => unitsOf(state, i).map((u) => ({ plot: u.tileIndex, type: gameTypeOf('unit', u.type, 'UNIT_'), moves: Math.floor(unitFullMoves(state, u) / MP_SCALE), level: u.level ?? 1 })),
    barbarianSeats: () => [BARB_SEAT],
    bestUnitOfClass: (i, cls) => {
      const traits = isCityStateSeat(i) ? null : majorTraits(state, i);
      const r = seat(i).research;
      let best: string | null = null;
      let top = 0;
      for (const row of AI_UNITS) {
        const version = traits ? majorUnitVersion(traits, row.type) : minorUnitVersion(row.type);
        if (version !== row.type || row.mustPurchase || row.promotionClass !== cls) continue;
        const tech = row.tech ? engineId('tech', row.tech, 'TECH_', TECHS) : null;
        if (row.tech && (!tech || !r.techs.includes(tech))) continue;
        const civic = row.civic ? engineId('civic', row.civic, 'CIVIC_', CIVICS) : null;
        if (row.civic && (!civic || !r.civics.includes(civic))) continue;
        const st = Math.max(row.combat, row.rangedCombat);
        if (st >= top) {
          top = st;
          best = row.type;
        }
      }
      return best;
    },
    // a record's age as its holder's last ageing left it (`armyAged`; the
    // turn where none ran); its plot's area and region (record +0x18 / +0x1c)
    knownStrength: (h, p, plot, maxAge) => {
      const holder = seatOf(state, h);
      const area = map.tiles[plot]?.area ?? -1;
      const turn = holder?.armyAged ?? state.turn;
      let sum = 0;
      for (const r of holder?.armyKnown ?? []) {
        if (r.owner !== p || turn - r.seen > maxAge) continue;
        const t = map.tiles[r.plot];
        if (!t || ((t.area ?? -1) !== area && (t.region ?? -1) !== -1)) continue;
        const row = AI_UNITS[AI_UNIT_INDEX.get(gameTypeOf('unit', r.type, 'UNIT_')) ?? -1];
        sum += row ? Math.max(row.combat, row.rangedCombat) : 0;
      }
      return sum;
    },
    majors: () => state.seats.filter((s) => isCiv(s.seat) && (s.cities.length > 0 || unitsOf(state, s.seat).length > 0)).map((s) => s.seat),
    players: () => [...new Set([...state.seats.map((s) => s.seat), ...state.cityStates.map((c) => c.seat), ...(state.freeSeat ? [state.freeSeat.seat] : []), BARB_SEAT])]
      .sort((a, b) => a - b),
    atWar: (i, j) => civsAtWar(state, i, j),
    playerYield: (i, type) => {
      const key = YIELD_KEY[type];
      return key ? citiesOf(state, i).reduce((a, c) => a + computeCityStats(state, c).total[key], 0) : 0;
    },
    religionFounded: (i) => (seat(i).religion.founded ? i : null),
    cityStateSeats: () => state.cityStates.map((c) => c.seat),
    // GetTokensReceived (0x44c860): the store and the tokens a governor
    // posted there brings (0x44caa0)
    envoys: (cs, i) => {
      const c = seatOf(state, cs) as CityState | undefined;
      return c ? envoysHere(state, c, i) : 0;
    },
    grievances: (i, j) => Math.max(0, grievanceWith(state, i, j)),
    militaryUnits: (i, domain) => unitsOf(state, i).filter((u) => {
      const d = UNITS[u.type];
      if (!d || d.combat <= 0) return false;
      if (domain === 'DOMAIN_AIR') return !!d.air;
      if (domain === 'DOMAIN_SEA') return !!d.naval;
      return !d.air && !d.naval;
    }).length,
    handicap: (i) => seatOf(state, i)?.handicap ?? DEFAULT_HANDICAP,
    playerEra: (i) => civEraIndex(seat(i).research.techs, seat(i).research.civics),
    techsHeld: (i) => new Set(seat(i).research.techs.map((t) => gameTypeOf('tech', t, 'TECH_'))),
    militaryStrength: (i) => militaryStrength(state, i),
    domainStrength: (i) => seatOf(state, i)?.unitStrength ?? 0,
    declaredFriends: (i, j) => seatsFriends(state, i, j),
    allied: (i, j) => seatsAllied(state, i, j),
    denouncing: (i, j) => denounceActive(state, i, j),
    // a city-state's one city stands on its home continent, the Free Cities
    // hold no capital: no city-state
    // nor any major lists Colonial Taxes (runs/h1_duelw1117 / 1121 / 1124 /
    // 1127 / 1128)
    cityOnHomeContinent: (i, id) => {
      if (isCityStateSeat(i) || i === FREE_SEAT) return true;
      const city = cityOf(i, id);
      return homeContinent(state, i) < 0 || (!!city && onHomeContinent(state, i, city.centerIndex));
    },
    cityAmenity: (i, id) => {
      const city = cityOf(i, id);
      if (!city) return { balance: 0, yields: {} };
      return amenityCityOf(computeCityStats(state, city));
    },
    // a city-state's forecast is its city's update's (`CityState.aiGrowth`),
    // any other city's its growth as it stands
    cityHousingValue: (i, id, housing, t, h) => {
      const city = cityOf(i, id);
      if (!city) return 0;
      const g = cityGrowth(state, city);
      const cs = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      return housingValue(g, growthForecast(cs?.aiGrowth ?? g), housing, t, h);
    },
    greatPersonPointsPerTurn: (i, cls) => greatPersonPointsPerTurn(state, i)[cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass] ?? 0,
    diplomaticPoints: (i) => seat(i).diplomaticPoints ?? 0,
    diplomaticVictoryPoints: DIPLO_VICTORY_POINTS,
    competitionLeads: (i) => {
      const c = state.competition;
      if (!c || c.left <= 0) return 0;
      const scoring = c.score.map((v, s) => ({ v, s })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v || a.s - b.s);
      const rank = scoring.findIndex((x) => x.s === i);
      return rank >= 0 && rank <= Math.trunc(scoring.length / 4) ? 1 : 0;
    },
    cityCanProject: (i, id, type) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      const p = engineId('project', type, 'PROJECT_', PROJECTS);
      return !!city && !!p && availableProjects(state, city).some((x) => x.id === p);
    },
    bestCombatStrength: (i) => seatOf(state, i)?.bestMeleeCS ?? 0,
    barbarianCamps: (i) => [...campTiles(state)].filter((p) => isExplored(state, i, p)).sort((a, b) => a - b),
    barbarianSeat: () => BARB_SEAT,
    cityPopulation: (p) => cityHolders(state).flatMap((s) => s.cities).find((c) => c.centerIndex === p)?.population
      ?? state.cityStates.find((cs) => cs.centerIndex === p)?.population ?? 0,
    // the engine's roster is the seven governors every seat may appoint
    // a title civic the caller's moment holds and the state does not yet
    // grants its title too
    minorCivilization: (cs) => {
      const minor = seatOf(state, cs) as CityState | undefined;
      if (!minor || !isCityStateSeat(cs)) return null;
      return CITY_STATE_SUZERAIN_BONUS[minor.name]?.civ ?? `CIVILIZATION_${minor.name.toUpperCase().replace(/[ -]/g, '_')}`;
    },
    cityCitizens: (i, id) => {
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      return city?.population ?? 0;
    },
    citySpecialtyDistricts: (i, id) => {
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      return city ? city.districts.filter((d) => d.type !== 'CITY_CENTER' && map.tiles[d.tileIndex].districtComplete && DISTRICTS[d.type].countsTowardLimit).length : 0;
    },
    cityStrikes: (i, id) => {
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      return !!city && outerPool(state, city) > 0;
    },
    // a centre's outer defence stands where its walls' pool is above 0, a
    // city-state's alike: every city-state's Bastions is first logged the
    // turn its walls complete (runs/h1_duelw1117 / 1121 / 1124 / 1127 / 1128,
    // the fifteen city-states)
    cityOuterStands: (i, id) => {
      const city = cityOf(i, id);
      return !!city && outerPool(state, city) > 0;
    },
    cityStrike: (i, id) => {
      const city = cityOf(i, id);
      return city ? Math.trunc(cityStrikeStrength(state, city)) : 0;
    },
    // a city-state's train turns and expected count as its city's update
    // reads them (`minorItemTurns`), any other city's its queue's
    researchTurns: (i, type) => seatResearchTurns(state, i)(type),
    cityItemTurns: (i, id, type, extra, scale) => {
      if (isCityStateSeat(i)) {
        const cs = seatOf(state, i) as CityState | undefined;
        return cs && cs.centerIndex >= 0 ? minorItemTurns(state, cs, type, extra, scale) : -1;
      }
      const city = cityOf(i, id);
      return city ? majorItemTurns(state, city, type, extra, scale) : -1;
    },
    cityUnitExpected: (i, id, type) => {
      if (isCityStateSeat(i)) {
        const cs = seatOf(state, i) as CityState | undefined;
        return cs && cs.centerIndex >= 0 ? minorUnitExpected(state, cs, type) : 0;
      }
      const city = cityOf(i, id);
      return city ? majorUnitExpected(state, city, type) : 0;
    },
    projectCompletions: (i, type) => {
      const id = engineId('project', type, 'PROJECT_', PROJECTS);
      return id ? seat(i).projectsDone.filter((x) => x === id).length : 0;
    },
    projectTurns: (i, cityId, type, extra) => {
      const city = citiesOf(state, i).find((c) => c.id === cityId);
      const id = engineId('project', type, 'PROJECT_', PROJECTS);
      if (!city || !id) return -1;
      // the Production toward the project as the turn step pays it
      const mult = (1 + governorSum(state, city, (e) => e.projectProdPct?.[id]) / 100) * getModifiers(state, i).projectProdMult
        * suzerainProjectMult(state, i) * (1 + (seat(i).researchProjectPct ?? 0) / 100);
      const rate = fmul(fxOf(computeCityStats(state, city).total.production * mult), FX + extra);
      const kept = city.queue.find((q) => q.kind === 'project' && q.project === id)?.progress ?? 0;
      return turnsAt(fxOf(projectCost(state, i, id, city) - kept - (city.productionBank ?? 0)), rate);
    },
    knownCities: (i) => knownCities(state, i),
    pressureLead: (i, p) => plotPressureLead(state, i, map.tiles[p]),
    borderClosed: (i, p) => borderClosedTo(state, i, map.tiles[p]),
    denounced: (i, j) => denounceActive(state, i, j),
    cityHitPoints: (p) => {
      const d = districtHealth(state, p);
      return d ? { max: d.max, damage: d.max - d.hp } : null;
    },
    cityBlow: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return 0;
      const target = { type: 'COMBAT_DISTRICT' as const, tile: p, seat: tileSeat(map.tiles[p]), unit: null };
      return planUnit(state, u, [target]).entries.some((e) => e.spots.length > 0) ? predictCityBlow(state, u, p) : 0;
    },
    cityDefense: (p) => {
      const held = cityAtIndex(state, p);
      const cs = held ? undefined : cityStateAtPlot(state, p);
      const city = held ? held.city : cs && cs.centerIndex === p ? minorCity(cs) : null;
      if (!city) return null;
      const hp = districtHealth(state, p);
      return {
        defense: cityDefenseStrength(state, city, false), garrison: garrisonTerm(state, city), damaged: !!hp && hp.hp < hp.max,
        districts: city.districts.length, capital: held ? city.isCapital : true,
        wonder: city.wonders.some((w) => state.map.tiles[w.tileIndex].builtWonderComplete), population: city.population,
      };
    },
    cityBlowFrom: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      return u ? predictCityBlow(state, u, p) : 0;
    },
    wallsBypassed: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      const held = cityAtIndex(state, p);
      const cs = held ? undefined : cityStateAtPlot(state, p);
      const shape = held ? held.city : cs && cs.centerIndex === p ? { buildings: cs.buildings ?? [], seat: cs.seat, outerHp: cs.outerHp } : null;
      return !!u && !!shape && siegeAssist(state, u, p, wallsTier(state, shape)) !== 0;
    },
    attackTargets: (i) => targetsOf(i).map((t) => ({
      type: t.type, plot: t.tile, owner: t.seat, unitType: t.unit ? gameTypeOf('unit', t.unit.type, 'UNIT_') : null,
      range: t.unit ? unitAttackRange(t.unit) : t.type === 'COMBAT_DISTRICT' ? CITY_STRIKE_RANGE : 0,
    })),
    planSpot: (id, p, turns, needMoves, range) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return -1;
      const at = map.tiles[p];
      const dom = unitDomain(u.type);
      const fights = (x: Unit) => (UNITS[x.type]?.combat ?? 0) > 0;
      for (const r of planUnit(state, u, targetsOf(u.seat)).reach) {
        const t = map.tiles[r.tile];
        if (hexDistance(map, t.col, t.row, at.col, at.row) !== range || r.turns > turns || (needMoves && r.moves <= 0)) continue;
        if (r.tile === u.tileIndex) return r.tile;
        if (!state.units.some((x) => x !== u && x.tileIndex === r.tile && unitDomain(x.type) === dom && fights(x) === fights(u))) return r.tile;
      }
      return -1;
    },
    attackSpots: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return [];
      const e = planUnit(state, u, targetsOf(u.seat)).entries.find((x) => x.target.tile === p);
      return e ? e.spots.map((s) => ({ plot: s.tile, turns: s.turns })) : [];
    },
    plotUnitCount: (p) => state.units.filter((u) => u.tileIndex === p && u.hp > 0).length,
    adjacentPlot: (p, dir) => neighborTile(map, map.tiles[p], DIRECTION_TYPES[dir])?.index ?? -1,
    riverEdge: (p, dir) => (map.tiles[p].riverMask & (1 << DIRECTION_TYPES[dir])) !== 0,
    encircled: (p) => {
      const held = cityAtIndex(state, p);
      if (held) return encircled(state, map.tiles[p], held.holder.seat);
      const cs = cityStateAtPlot(state, p);
      return !!cs && cs.centerIndex === p && encircled(state, map.tiles[p], cs.seat);
    },
    reachOf: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      const r = u ? planUnit(state, u, targetsOf(u.seat)).reach.find((x) => x.tile === p) : undefined;
      return r ? { turns: r.turns, moves: r.moves } : null;
    },
    defensiveImprovements: () => Object.values(IMPROVEMENTS).filter((d) => d.outsideTerritory && (d.defenseCS ?? 0) > 0)
      .map((d) => gameTypeOf('improvement', d.id, 'IMPROVEMENT_')),
    buildCharges: (id) => state.units.find((x) => x.id === id)?.charges ?? 0,
    airStrikeColumn: (id, p, improvement) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return -1;
      const k = (improvement ? airPillageTargets : airStrikeTargets)(state, u, AIR_STRIKE_COLS).indexOf(p);
      return k < 0 ? -1 : UNIT_ACTION[`${improvement ? 'AIR_PILLAGE' : 'AIR_STRIKE'}_${k}`] ?? -1;
    },
    rebaseOptions: (id) => {
      const u = state.units.find((x) => x.id === id);
      return u ? rebaseTargets(state, u, AIR_REBASE_COLS).map((p, k) => ({ plot: p, column: UNIT_ACTION[`REBASE_${k}`] ?? -1 })) : [];
    },
    unitBuildsImprovement: (i, id, imp) => {
      const u = state.units.find((x) => x.id === id);
      const key = engineId('improvement', imp, 'IMPROVEMENT_', IMPROVEMENTS) as ImprovementId | undefined;
      const def = key ? IMPROVEMENTS[key] : undefined;
      if (!u || !def) return false;
      // CIV6 (Legion): the Roman Fort is the FORT row, laid without its tech
      if (UNITS[u.type]?.fortBuilder) return def.id === 'FORT';
      return u.type === (def.engineer ? 'MILITARY_ENGINEER' : 'BUILDER') && computeUnlocks(state, i).improvements.has(def.id);
    },
    exertsZoc: (id) => {
      const u = state.units.find((x) => x.id === id);
      return !!u && unitExertsZoc(u);
    }
  };
}

/** the cities the seat has revealed the centre of, as its knowledge base
 *  records them (0x5efaf0): the centre its one defensible district */
function knownCities(state: GameState, seat: number): AiKnownCityView[] {
  const out: AiKnownCityView[] = [];
  const add = (c: City, originalCapital: boolean) => {
    if (!isExplored(state, seat, c.centerIndex)) return;
    const t = computeCityStats(state, c).total;
    const defense = cityDefenseStrength(state, c);
    const walled = outerPool(state, c) > 0;
    const resources = new Map<string, number>();
    for (const tile of state.map.tiles) {
      if (tile.ownerCity !== c.id || tileSeat(tile) !== c.seat || !tile.resource || !tile.improvement || tile.pillaged) continue;
      const r = `RESOURCE_${tile.resource}`;
      resources.set(r, (resources.get(r) ?? 0) + 1);
    }
    out.push({
      plot: c.centerIndex, owner: c.seat, id: c.id, population: c.population, originalCapital, capital: c.isCapital,
      yields: AI_YIELD_KEYS.map((k) => Math.trunc(t[k])), wonders: c.wonders.length,
      districts: [{ plot: c.centerIndex, defense, walls: walled ? defense : 0, strike: walled ? cityStrikeStrength(state, c) : 0 }]
    });
  };
  for (const h of cityHolders(state)) for (const c of h.cities) add(c, (c.origCapitalSeat ?? -1) >= 0);
  for (const cs of state.cityStates) if (cs.centerIndex >= 0) add({ ...minorCity(cs), isCapital: true }, true);
  return out;
}

/** PlayerStats' m_iMilitaryStrength (0x4bb1e0, every domain): per unit the
 *  greater of its combat (`aiStrengths`, 0x56dc90 with 0) and ranged
 *  strengths x its hit points left over its most, 24.8 truncated, and the
 *  treasury's whole gold / 12 as a raw 24.8; the sum's whole part */
function militaryStrength(state: GameState, seat: number): number {
  let sum = 0;
  for (const u of unitsOf(state, seat)) {
    const d = UNITS[u.type];
    if (!d) continue;
    const str = Math.max(aiStrengths(state, u).melee, d.ranged?.strength ?? 0) << 8;
    const left = Math.max(0, u.hp) << 8;
    sum += Math.trunc((Math.trunc((str * left) / 256) * 256) / (UNIT_HP << 8));
  }
  // the treasury term reads the whole gold as the raw value (runs/h1_duelw1124:
  // China's Science Victory starts at t6, the turn Rome's Scout first shows in
  // the stored strengths, not at t4 on a gold term of gold / 12)
  const gold = Math.trunc(seatOf(state, seat)?.treasury ?? 0);
  sum += Math.trunc(Math.trunc((gold * 256) / 6) / 512);
  return sum >> 8;
}

/** PlayerStats' strength over every domain (0x4bd0d0(-1): +0x210 less
 *  +0x390, m_iMilitaryStrength less m_iMilitaryStrengthFromGold, computed at
 *  0x4bb1e0 as the player's turn starts, before its production):
 *  `militaryStrength`'s unit term without its treasury's, stored on the seat
 *  — runs/h1_duelv1127: a city-state's Military Tradition worth PV(20) a
 *  Warrior; runs/h1_duelw1121 Antioch: the Warrior its t13 production trains
 *  counts in Military Tradition's value from t14 */
export function storeUnitStrength(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  let sum = 0;
  for (const u of unitsOf(state, seat)) {
    const d = UNITS[u.type];
    if (!d) continue;
    const str = Math.max(d.combat ?? 0, d.ranged?.strength ?? 0) << 8;
    sum += Math.trunc((Math.trunc((str * (Math.max(0, u.hp) << 8)) / 256) * 256) / (UNIT_HP << 8));
  }
  s.unitStrength = sum >> 8;
}

/** a unit as the AI reads it */
function unitView(state: GameState, u: Unit): AiUnitView {
  const d = UNITS[u.type];
  return { id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_'), plot: u.tileIndex, founder: !!d?.settler,
    combat: aiStrengths(state, u).melee, ranged: d?.ranged?.strength ?? 0, range: d?.ranged?.range ?? 0, damage: UNIT_HP - u.hp,
    movesLeft: Math.trunc(u.movesLeft * 256 / MP_SCALE),
    baseMoves: u.embarked && !d?.naval ? EMBARK_MOVES + embarkTechMoves(state, u.seat) : d?.moves ?? 0,
    bombard: d?.bombard ?? 0, domain: d?.air ? 'air' : d?.naval ? 'sea' : 'land' };
}
