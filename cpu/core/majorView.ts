/**
 * THE MAJORS' AI'S VIEW OF THIS ENGINE (ai/major/view.ts): one seat-agnostic
 * read-only view over a GameState, in the game's type names. Nothing here
 * writes the state; the slot rebuild a government change would make is laid
 * on copies (`carryLayout`).
 */
import type { MajorCityDefenceView, MajorCityView, MajorGovernorView, MajorKnownCityView, MajorPlotView, MajorSlotView, MajorUnitView, MajorView } from '../../ai/major/view';
import { DIRECTION_TYPES, directionTo, hexDistance, neighborTile, tilesWithin } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable, isWater } from '../../world/query';
import { FX, fmul, fxOf, turnsAt, type AiCityView, type AiDistrictView, type AiPlotView } from './aiValue';
import { AI_YIELDS, type AiWeightInputs, followedStrategies, pseudoYieldWeights, yieldWeights } from './aiWeights';
import { engineId, gameTypeOf, installFeature, installTerrain } from '../data/aliases';
import { cityStateSight, isExplored } from './fog';
import { CITY_STRIKE_RANGE, denounceOpen, loyaltyPerTurn, plotPressure, plotPressureLead, warGate } from './phase';
import { governedCityIds, governorPromotionOpen, governorSum, governorsOf, governorTitlesAvailable } from './governors';
import { GOVERNORS, GOVERNOR_INSTALL_ID, GOVERNOR_PROMOTIONS, GOVERNOR_TITLE_CIVICS, PROMO_INSTALL_ID, promotionBit } from '../data/governors';
import { CITY_STATE_SUZERAIN_BONUS } from '../data/cityStates';
import { BARB_SEAT, borderTurnsFrom, campTiles, cityStateOfSeat, cityHolders, citiesOf, civOf, civsAtWar, delegationWith, denounceActive, seatsAllied, seatsFriends, hiddenResourcesFor, homeContinent, isCiv, isCityStateSeat, leaderOf, majorityReligionOf, metTurnWith, MISSION_DELEGATION, MISSION_EMBASSY, peaceTurnWith, seatOf, tileSeat, unitsOf } from './seats';
import { aiStrengths, assignTo, dangerDistricts, districtHealth, pathTo, planUnit, reachPlots, tacticalTargets, type Pass, type Target } from './tactical';
import { AIR_REBASE_COLS, AIR_STRIKE_COLS, IMPROVEMENT_IDS, unitActionIndex } from './unitActions';
import { airPillageTargets, airStrikeTargets, rebaseTargets } from './air';
import { plotsSeenNow, ringPlots } from './barbarians';
import { centreStrength, cityDefenseStrength, cityStrikeStrength, encircled, predictCityBlow, siegeAssist, unitAttackRange } from './combat';
import { outerPool, wallsTier } from './rules';
import { borderClosedTo, builderCost, cityAtIndex, embarkTechMoves, trainableUnits, traderCost, unitDomain, unitExertsZoc, unitsHostile, unitVisibleTo } from './units';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { CITY_MIN_STRIKE_CS, COST_MULTIPLIER_PCT, EMBARK_MOVES, MP_SCALE } from '../data/constants';
import { snipeRing, snipeRing3 } from './unitOrders';
import { GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST, type SlotKind } from '../data/policies';
import { congressVoter, preference as congressPreference } from './congress';
import { congressTargets, congressTargetsOf } from './congressTargets';
import { DIPLO_VICTORY_POINTS } from '../data/seats';
import { GWO_COUNT } from '../data/greatWorks';
import { gwCountsByObj } from './greatWorks';
import { UNIT_PROMO_CLASS } from '../data/promotions';
import { availableBuildings } from './rules';
import { carryLayout, darkAgeEra, fitPoliciesLoose, getModifiers, governmentBit, governmentSlots, governmentsOpen, inDarkAge, makeYieldCtx, seatGovernment, type YieldCtx,
  unlockedPolicyIds } from './effects';
import { gpCapped, gpOffer, gpOfferCost, greatPersonPointsPerTurn, patronageCost } from './greatPeople';
import { gpActivateOk } from './gpAbility';
import type { City, CityState, DistrictId, GameState, GreatPersonClass, Unit, YieldKey } from './types';
import { BUILDINGS, effectiveBuilding } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { UNIT_HP, UNITS } from '../data/units';
import { IMPROVEMENTS } from '../data/improvements';
import type { ImprovementId } from './types';
import { computeUnlocks } from './effects';
import type { ContractCity } from './aiContracts';
import { civicAnalysis } from './aiCivics';
import { AI_UNIT_INDEX, growthForecast, housingValue, type CityGrowth } from './aiCityBuild';
import { AI_RESOURCES, AI_UNITS } from '../data/aiBuildTables';
import { resourceValue } from './aiResource';
import { stockFree } from './stockpile';
import { minorItemTurns, minorResourceFacts, minorUnitExpected, minorUnitVersion } from './minorBuild';
import { majorItemTurns, majorTraits, majorUnitExpected, majorUnitVersion, seatResearchTurns } from './majorCityBuild';
import { cityStateAt as cityStateAtPlot, envoysHere, envoysOf, hasMet, minorCity, minorWarGate, suzerainOf, suzerainProjectMult } from './cityStates';
import { grievanceWith } from './grievance';
import { tradeCapacity } from './trade';
import { buildingPillaged, buildingVariantAdjacency, effectiveAdjacency, tileYields } from './yields';
import { civEraIndex, computeCityStats } from './city';
import { scoreLines } from './score';
import { domesticTourists, touristsDrawn } from './seatTurn';
import { PROJECTS } from '../data/projects';
import { BELIEF_CATALOGS, BELIEF_SLOTS, PANTHEON_FAITH_COST, PANTHEON_IDS, RELIGION_TYPES, beliefClassOf } from '../data/religion';
import { RESOURCES } from '../../world/resources';
import { tileAppeal } from './appeal';
import { DEFAULT_HANDICAP } from '../data/barbarians';
import { availableProjects, beliefPicks, canFoundReligion, districtCost, districtScaledBase, itemCost, projectCost, settlerCost, unitProdCost } from './game';
import { alliancePayable, dealItemPayable, friendshipPayable, missionOf, missionPayable } from './deals';
import { DEAL_OPEN_BORDERS } from '../data/seats';
import { WAR_KIND_FORMAL, WAR_KIND_SURPRISE } from '../data/warKinds';

/** What the view takes from the majors' AI itself: per major the strategies
 *  it follows (ai/major/strategies.ts), which its weights and its civic list
 *  read (`aiWeights.ts`); and the civics a seat holds where the caller's
 *  state is not the moment the AI reads. */
export interface MajorViewInputs {
  strategies?: ReadonlyMap<number, ReadonlySet<string>>;
  /** per major the agendas its diplomacy carries (ai/major/diplomacy.ts),
   *  which its weights read */
  agendas?: ReadonlyMap<number, readonly string[]>;
  civicsHeld?: (seat: number) => ReadonlySet<string>;
  /** the seat's era (an index into AI_ERAS), where the caller's state is not
   *  the moment the AI reads */
  playerEra?: (seat: number) => number;
}

const slotType = (k: SlotKind): string => `SLOT_${k.toUpperCase()}`;
const districtType = (id: string): string => `DISTRICT_${id}`;

/** a district's yield of a kind (0x24b5a0): its adjacency yield of that
 *  kind, its flat yields, and the yields of the city's buildings in it */
function districtYieldOf(state: GameState, seat: number, city: City, d: { type: DistrictId; tileIndex: number }, key: YieldKey): number {
  const tile = state.map.tiles[d.tileIndex];
  if (tile.districtPillaged) return 0;
  const ctx = makeYieldCtx(state, seat);
  const def = DISTRICTS[d.type];
  let y = 0;
  if (def.adjacencyYield === key) y += effectiveAdjacency(ctx, tile, d.type, buildingVariantAdjacency(ctx.mods.civ, city, d.type));
  y += ctx.mods.districtYieldAdd[d.type]?.[key] ?? 0;
  for (const b of city.buildings) {
    const bd = effectiveBuilding(ctx.mods.civ, b);
    if (bd?.district === d.type && !buildingPillaged(city, b)) y += bd.yields?.[key] ?? 0;
  }
  return y;
}
const YIELD_KEY: Readonly<Record<string, YieldKey>> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold',
  YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};
const AI_YIELD_KEYS: readonly YieldKey[] = AI_YIELDS.map((y) => YIELD_KEY[y]);
const govType = (id: string): string => gameTypeOf('government', id, 'GOVERNMENT_');
const policyType = (id: string): string => gameTypeOf('policy', id, 'POLICY_');
const govId = (type: string): string | null => engineId('government', type, 'GOVERNMENT_', GOVERNMENTS);

const UNIT_ACTION = unitActionIndex(IMPROVEMENT_IDS);

/** the engine's promotion classes whose install type is not PROMOTION_CLASS_ + id */
const PROMO_INSTALL: Readonly<Record<string, string>> = {
  ANTICAV: 'PROMOTION_CLASS_ANTI_CAVALRY', LIGHT_CAV: 'PROMOTION_CLASS_LIGHT_CAVALRY',
  HEAVY_CAV: 'PROMOTION_CLASS_HEAVY_CAVALRY', ESPIONAGE: 'PROMOTION_CLASS_SPY',
};

/** a city's strength, its strike (walls standing) and the strike's reach */
const cityDefence = (state: GameState, c: City): MajorCityDefenceView => ({
  plot: c.centerIndex, strength: cityDefenseStrength(state, c),
  ranged: outerPool(state, c) > 0 ? cityStrikeStrength(state, c) : 0, range: CITY_STRIKE_RANGE,
});

const districtDefence = (d: { plot: number; def: number; strike: number }): MajorCityDefenceView => ({
  plot: d.plot, strength: d.def, ranged: d.strike, range: CITY_STRIKE_RANGE,
});

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

export function majorView(state: GameState, inputs: MajorViewInputs = {}): MajorView {
  const seat = (i: number) => {
    const s = seatOf(state, i);
    if (!s) throw new Error(`majorView: no seat ${i}`);
    return s;
  };
  const slottable = (i: number, gov: string | null): Set<string> => {
    const s = seat(i);
    if (!gov) return new Set();
    return unlockedPolicyIds(s.research, darkAgeEra(state, i), s.government.held, gov);
  };
  const metTurn = (i: number, j: number): number | null => {
    if (isCityStateSeat(j)) {
      const cs = seatOf(state, j) as CityState | undefined;
      return cs && hasMet(cs, i) ? 1 : null;
    }
    if (isCityStateSeat(i)) {
      const cs = seatOf(state, i) as CityState | undefined;
      return cs && hasMet(cs, j) ? 1 : null;
    }
    return isCiv(i) && isCiv(j) ? metTurnWith(state, i, j) : null;
  };
  const weightInputs = (i: number): AiWeightInputs => ({ strategies: inputs.strategies?.get(i) ?? new Set(), agendas: inputs.agendas?.get(i) ?? [] });
  const slotsOf = (i: number): MajorSlotView[] => {
    const cards = seat(i).government.policies;
    return governmentSlots(state, i).map((k, j) => ({ slot: slotType(k), policy: cards[j] ? policyType(cards[j]!) : null }));
  };
  const weights = new Map<number, Record<string, number>>();
  const weightsOf = (i: number): Record<string, number> => {
    let w = weights.get(i);
    if (!w) weights.set(i, (w = yieldWeights(state, i, weightInputs(i))));
    return w;
  };
  const pseudo = new Map<number, Map<string, number>>();
  const pseudoOf = (i: number): Map<string, number> => {
    let w = pseudo.get(i);
    if (!w) pseudo.set(i, (w = pseudoYieldWeights(state, i, weightInputs(i))));
    return w;
  };
  const { map } = state;
  let plots: MajorPlotView[] | null = null;
  let mapCities: MajorCityView[] | null = null;
  // a seat's tactical target list on this state
  const targetLists = new Map<number, Target[]>();
  const targetsOf = (i: number): Target[] => {
    let t = targetLists.get(i);
    if (!t) targetLists.set(i, (t = tacticalTargets(state, i, plotsSeenNow(state, new Set([i])), null, [])));
    return t;
  };
  const seenBy = new Map<number, ReadonlySet<number>>();
  const yctx = new Map<number, YieldCtx>();
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
    plots: () => (plots ??= map.tiles.map((t): MajorPlotView => ({
      index: t.index, x: t.col, y: t.row, water: isWater(t), impassable: isImpassable(t),
      feature: t.feature ? `FEATURE_${t.feature}` : null, resource: t.resource ? `RESOURCE_${t.resource}` : null,
      owner: tileSeat(t), district: !!t.district || centres.has(t.index), city: centres.has(t.index),
      area: t.area ?? -1, region: t.region ?? -1, continent: t.continent ?? -1,
      coastal: isCoastalLand(map, t), freshWater: hasFreshWater(map, t), lake: t.terrain === 'LAKE',
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
    revealed: (i, p) => isExplored(state, i, p),
    campPlots: () => [...campTiles(state)],
    plotYield: (i, p, type) => {
      let ctx = yctx.get(i);
      if (!ctx) yctx.set(i, (ctx = makeYieldCtx(state, i)));
      const key = YIELD_KEY[type];
      return key ? tileYields(ctx, map.tiles[p])[key] : 0;
    },
    resourceVisible: (i, r) => !hiddenOf(i).has(r.replace(/^RESOURCE_/, '')),
    resourceHeld: (i, r) => {
      const id = r.replace(/^RESOURCE_/, '');
      return map.tiles.filter((t) => t.resource === id && tileSeat(t) === i && t.improvement && !t.pillaged).length;
    },
    cityPlots: (i) => seatCities(i).map((c) => c.centerIndex),
    homeContinent: (i) => homeContinent(state, i),
    pressureAt: (i, p) => plotPressure(state, i, map.tiles[p]),
    strategies: (i) => new Set(followedStrategies(i, weightInputs(i))),
    leaderType: (i) => {
      const l = leaderOf(state, i);
      return l ? gameTypeOf('leader', l, 'LEADER_') : null;
    },
    civilizationType: (i) => {
      const c = civOf(state, i);
      return c ? gameTypeOf('civilization', c, 'CIVILIZATION_') : null;
    },
    units: (i) => unitsOf(state, i).map((u) => unitView(state, u)),
    unitReach: (id, turns) => {
      const u = state.units.find((x) => x.id === id);
      return u ? reachPlots(state, u, turns).map((r) => ({ plot: r.tile, turns: r.turns, moves: r.moves })) : [];
    },
    unitPath: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      return u ? pathTo(state, u, p) : [];
    },
    stepDirection: (a, b) => directionTo(map, map.tiles[a], map.tiles[b]),
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
        .flatMap((s) => s.cities.filter((c) => seen[c.centerIndex]).map((c) => cityDefence(state, c)));
    },
    hostileDistricts: (i) => {
      const seen = plotsSeenNow(state, new Set([i]));
      const held = [...cityHolders(state).filter((s) => unitsHostile(state, { seat: i }, s)).flatMap((s) => s.cities),
        ...state.cityStates.filter((cs) => cs.centerIndex >= 0 && unitsHostile(state, { seat: i }, cs)).map(minorCity)];
      return held.flatMap((c) => dangerDistricts(state, c)).filter((d) => seen[d.plot]).map(districtDefence);
    },
    districtDefences: (i) => citiesOf(state, i).flatMap((c) => dangerDistricts(state, c)).map(districtDefence),
    turn: state.turn,
    costMultiplierPct: COST_MULTIPLIER_PCT,
    gameEra: state.gameEra ?? 0,
    cityStates: state.cityStates.length,
    civicsHeld: (i) => inputs.civicsHeld?.(i) ?? new Set(seat(i).research.civics.filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))),
    // the civics AI's last analysis (a city-state's and the Free Cities' kept
    // on their research, none before their first; a major's taken now), its
    // rows whose score the analysis job left above 0 — the row's own value,
    // the turn's propagation not yet run (runs/h1_duelw1121: a city-state's
    // Charismatic Leader first scores the turn after Political Philosophy
    // comes within the horizon, 102 of 105; none of its cards at t1)
    civicList: (i) => new Set((seat(i).research.civicAiEntries ?? (isCiv(i) ? civicAnalysis(state, i, seat(i).culRate ?? 0, weightInputs(i)) : []))
      .filter((e) => e.base > 0).map((e) => gameTypeOf('civic', e.civic, 'CIVIC_'))),
    government: (i) => {
      const g = seatGovernment(state, i);
      return g ? govType(g) : null;
    },
    governmentsHeld: (i) => new Set(GOVERNMENT_LIST.filter((g) => seat(i).government.held & governmentBit(g.id)).map((g) => govType(g.id))),
    governmentsUnlocked: (i) => new Set(governmentsOpen(state, i).map((k) => govType(GOVERNMENT_LIST[k].id))),
    slots: slotsOf,
    slotsUnder: (i, type) => {
      const g = govId(type);
      if (!g || g === seatGovernment(state, i)) return slotsOf(i);
      const before = governmentSlots(state, i);
      const old = fitPoliciesLoose(before, seat(i).government.policies.filter((p): p is string => !!p));
      const after = governmentSlots(state, i, g);
      const open = slottable(i, g);
      const laid = carryLayout(old.map((c, j) => [before[j], c] as const), after, (c) => open.has(c));
      return after.map((k, j) => ({ slot: slotType(k), policy: laid[j] ? policyType(laid[j]!) : null }));
    },
    policiesSlottableUnder: (i, type) => {
      const g = type ? govId(type) : null;
      return new Set([...slottable(i, g)].map(policyType));
    },
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
      return !!city && city.buildings.includes(building.replace(/^BUILDING_/, ''));
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
    unitMaintenances: (i) => state.units.filter((u) => u.seat === i).map((u) => UNITS[u.type]?.maintenance ?? 0),
    playerUnits: (i) => unitsOf(state, i).map((u) => ({ plot: u.tileIndex, type: gameTypeOf('unit', u.type, 'UNIT_') })),
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
    policyColumn: (type) => {
      const id = engineId('policy', type, 'POLICY_', POLICIES);
      return id ? POLICY_LIST.findIndex((p) => p.id === id) : -1;
    },
    governmentColumn: (type) => {
      const id = govId(type);
      return id ? GOVERNMENT_LIST.findIndex((g) => g.id === id) : -1;
    },
    pantheonColumn: (type) => PANTHEON_IDS.indexOf(type.replace(/^BELIEF_/, '')),
    beliefColumn: (type) => {
      const id = type.replace(/^BELIEF_/, '');
      const c = beliefClassOf(id);
      return c >= 0 ? [c, Object.keys(BELIEF_CATALOGS[c]).indexOf(id)] as const : null;
    },
    religionColumn: (type) => RELIGION_TYPES.indexOf(type.replace(/^RELIGION_/, '')),
    religionsFounded: () => new Set(state.seats.flatMap((s) => (s.religion.type ? [`RELIGION_${s.religion.type}`] : []))),
    pantheonOpen: (i) => {
      const s = seatOf(state, i);
      return !!s && isCiv(i) && s.religion.pantheon === null && (s.faith ?? 0) >= PANTHEON_FAITH_COST
        && PANTHEON_IDS.some((id) => !state.claimedPantheons.includes(id));
    },
    religionOpen: (i) => canFoundReligion(state, i).ok,
    beliefPicks: (i) => beliefPicks(state, i),
    majors: () => state.seats.filter((s) => isCiv(s.seat) && (s.cities.length > 0 || unitsOf(state, s.seat).length > 0)).map((s) => s.seat),
    players: () => [...new Set([...state.seats.map((s) => s.seat), ...state.cityStates.map((c) => c.seat), ...(state.freeSeat ? [state.freeSeat.seat] : []), BARB_SEAT])]
      .sort((a, b) => a - b),
    leader: (i) => {
      const l = leaderOf(state, i);
      return l ? gameTypeOf('leader', l, 'LEADER_') : null;
    },
    metTurn,
    atWar: (i, j) => civsAtWar(state, i, j),
    peaceTurns: (i, j) => {
      const since = peaceTurnWith(state, i, j) ?? metTurn(i, j);
      return since === null ? 0 : state.turn - since;
    },
    hasDelegation: (i, j) => delegationWith(state, i, j) === MISSION_DELEGATION,
    hasEmbassy: (i, j) => delegationWith(state, i, j) === MISSION_EMBASSY,
    hasOpenBorders: (i, j) => borderTurnsFrom(state, i, j) > 0,
    playerYield: (i, type) => {
      const key = YIELD_KEY[type];
      return key ? citiesOf(state, i).reduce((a, c) => a + computeCityStats(state, c).total[key], 0) : 0;
    },
    population: (i) => citiesOf(state, i).reduce((a, c) => a + c.population, 0),
    wondersBuilt: (i) => citiesOf(state, i).reduce((a, c) => a + c.wonders.length, 0),
    greatPeopleEarned: (i) => seat(i).gpEarned.length,
    plotsOwned: (i) => state.map.tiles.reduce((a, t) => a + (tileSeat(t) === i ? 1 : 0), 0),
    religionFounded: (i) => (seat(i).religion.founded ? i : null),
    majorityReligion: (i) => {
      const r = majorityReligionOf(state, i);
      return r >= 0 ? r : null;
    },
    beliefsHeld: () => new Set([...state.claimedPantheons, ...state.claimedBeliefs].map((b) => `BELIEF_${b}`)),
    religionBeliefs: (i) => {
      const r = seat(i).religion;
      return r.founded ? BELIEF_SLOTS.flatMap((k) => (r[k] ? [`BELIEF_${r[k]}`] : [])) : [];
    },
    tradeRoutesBetween: (i, j) => {
      const runs = (a: number, b: number) => (seatOf(state, a)?.tradeRoutes ?? []).filter((r) => r.toSeat === b).length;
      return runs(i, j) + runs(j, i);
    },
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
    mapCities: () => (mapCities ??= allCities(state)),
    plotsSeen: (i) => {
      let v = seenBy.get(i);
      if (!v) {
        // a city-state's look is its own (`cityStateSight`)
        const seen = isCityStateSeat(i) ? cityStateSight(state, i) : plotsSeenNow(state, new Set([i]));
        const out = new Set<number>();
        seen.forEach((x, k) => { if (x) out.add(k); });
        seenBy.set(i, (v = out));
      }
      return v;
    },
    startPlots: () => startPlots(state),
    handicap: (i) => seatOf(state, i)?.handicap ?? DEFAULT_HANDICAP,
    playerEra: (i) => inputs.playerEra?.(i) ?? civEraIndex(seat(i).research.techs, seat(i).research.civics),
    techCount: (i) => seat(i).research.techs.length,
    techsHeld: (i) => new Set(seat(i).research.techs.map((t) => gameTypeOf('tech', t, 'TECH_'))),
    militaryStrength: (i) => militaryStrength(state, i),
    domainStrength: (i) => seatOf(state, i)?.unitStrength ?? 0,
    treasury: (i) => seatOf(state, i)?.treasury ?? 0,
    actionOpen: (i, j, action) => {
      if (!isCiv(i) || !isCiv(j) || civsAtWar(state, i, j)) return false;
      if (action === 'DIPLOACTION_DIPLOMATIC_DELEGATION' || action === 'DIPLOACTION_RESIDENT_EMBASSY') {
        return missionPayable(state, i, j) && (missionOf(state, i) === MISSION_EMBASSY) === (action === 'DIPLOACTION_RESIDENT_EMBASSY');
      }
      if (action === 'DIPLOACTION_OPEN_BORDERS') return dealItemPayable(state, i, j, [DEAL_OPEN_BORDERS, 0, 0]);
      if (action === 'DIPLOACTION_DECLARE_FRIENDSHIP') return friendshipPayable(state, i, j);
      if (action === 'DIPLOACTION_ALLIANCE') return alliancePayable(state, i, j, 0);
      if (action === 'DIPLOACTION_DENOUNCE') return denounceOpen(state, i, j);
      return null;
    },
    warOpen: (i, j, formal) => (isCityStateSeat(j) ? minorWarGate(state, cityStateOfSeat(j), i).ok
      : warGate(state, i, j, formal ? WAR_KIND_FORMAL : WAR_KIND_SURPRISE).ok),
    declaredFriends: (i, j) => seatsFriends(state, i, j),
    allied: (i, j) => seatsAllied(state, i, j),
    denouncing: (i, j) => denounceActive(state, i, j),
    favor: (i) => seatOf(state, i)?.diplomaticFavor ?? 0,
    congressTarget: (i, r) => congressPreference(state, r, i, congressVoter(state, i)).target,
    congressTargets: (i, r) => congressTargets(state, i, r),
    congressTargetsOf: (i, type) => congressTargetsOf(state, i, type),
    cityStateBonus: (cs) => {
      const c = seatOf(state, cs) as CityState | undefined;
      return c ? `MINOR_CIV_BONUS_${c.type.toUpperCase()}` : null;
    },
    suzerain: (cs) => {
      const c = seatOf(state, cs) as CityState | undefined;
      return c ? suzerainOf(c) : -1;
    },
    greatWorksByObject: (i) => {
      const out = new Array<number>(GWO_COUNT).fill(0);
      for (const c of citiesOf(state, i)) gwCountsByObj(c).forEach((n, o) => { out[o] += n; });
      return out;
    },
    cityHousing: (i, id) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      return city ? computeCityStats(state, city).housing : 0;
    },
    greatPersonPoints: (i, cls) => seat(i).gpp[cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass] ?? 0,
    greatPersonPrice: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return GP_CLASSES.includes(c) ? gpOfferCost(state, c) : Infinity;
    },
    religionFollowers: (i) => {
      const r = seat(i).religion.type;
      return r ? cityHolders(state).flatMap((s) => s.cities).filter((c) => c.followedReligion === i).length : 0;
    },
    cityBuildable: (i, id) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      return new Set(city ? availableBuildings(state, city).map((b) => gameTypeOf('building', b.id, 'BUILDING_')) : []);
    },
    unitPromotionClass: (type) => {
      const id = engineId('unit', type, 'UNIT_', UNITS);
      const c = id ? UNIT_PROMO_CLASS[id] : undefined;
      return c ? PROMO_INSTALL[c] ?? `PROMOTION_CLASS_${c}` : null;
    },
    cityAmenity: (i, id) => {
      const city = cityOf(i, id);
      if (!city) return { balance: 0, yields: {} };
      const stats = computeCityStats(state, city);
      return { balance: stats.amenities.have - stats.amenities.needed,
        yields: Object.fromEntries(Object.entries(YIELD_KEY).map(([y, k]) => [y, stats.total[k]])) };
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
    missionOpen: (i, j) => (isCiv(i) && isCiv(j) && missionPayable(state, i, j)
      ? (missionOf(state, i) === MISSION_EMBASSY ? 'DIPLOACTION_RESIDENT_EMBASSY' : 'DIPLOACTION_DIPLOMATIC_DELEGATION') : null),
    score: (i) => scoreLines(state, seat(i)).reduce((a, b) => a + b, 0),
    greatPeopleOfClass: (i, cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return GP_CLASSES.includes(c) ? seat(i).gpEarned.filter((id) => GREAT_PEOPLE[c].some((g) => g.id === id)).length : 0;
    },
    greatPersonOffered: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return GP_CLASSES.includes(c) && gpOffer(state, c) !== -2;
    },
    greatPersonPatronage: (i, cls, currency) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      const k = GP_CLASSES.indexOf(c);
      const s = seatOf(state, i);
      if (k < 0 || !s || gpOffer(state, c) < 0 || gpCapped(s, c) || (state.gpPassedBy?.[k] ?? -1) === i) return -1;
      const cost = patronageCost(state, i, c, currency === 'gold');
      const purse = currency === 'gold' ? s.treasury ?? 0 : s.faith;
      return Number.isFinite(cost) && purse >= cost ? cost : -1;
    },
    faith: (i) => seatOf(state, i)?.faith ?? 0,
    greatPersonUsable: (i, cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      const at = GP_CLASSES.includes(c) ? gpOffer(state, c) : -1;
      const s = seatOf(state, i);
      if (at < 0 || !s) return false;
      const person = { type: c, seat: i, gpAt: at, charges: 1, tileIndex: 0 } as Unit;
      return state.map.tiles.some((_t, k) => (s.explored?.[k] ?? 0) > 0 && ((person.tileIndex = k), gpActivateOk(state, person)));
    },
    greatWorksMade: (i) => cityHolders(state).reduce((n, h) => n + h.cities.reduce((m, c) =>
      m + (c.greatWorks ?? []).filter((w) => w.seat === i).length, 0), 0),
    domesticTourists: (i) => domesticTourists(state.seats, seat(i)),
    visitingTourists: (i) => state.seats.reduce((n, o) => n + (o.seat !== i && metTurn(i, o.seat) !== null
      ? touristsDrawn(state.seats, seat(i), o) : 0), 0),
    scienceWonders: (i) => citiesOf(state, i).reduce((n, c) => n + c.wonders.filter((w) => (BUILDINGS[w.id]?.yields?.science ?? 0) > 0).length, 0),
    spaceProjects: (i) => seat(i).projectsDone.filter((id) => PROJECTS[id]?.victory).length,
    cityBuilds: (i) => seatCities(i).map((c) => {
      const head = c.queue[0];
      const unit = head?.kind === 'settler' ? 'UNIT_SETTLER' : head?.kind === 'unit' ? gameTypeOf('unit', head.unit, 'UNIT_') : null;
      if (!head || !unit) return { city: c.id, plot: c.centerIndex, unitType: null, turnsLeft: -1 };
      const prod = Math.max(1, computeCityStats(state, c).total.production);
      return { city: c.id, plot: c.centerIndex, unitType: unit, turnsLeft: Math.max(0, Math.ceil((itemCost(head, state, c) - head.progress) / prod)) };
    }),
    contractCities: (i) => seatCities(i).map((c): ContractCity => {
      const head = c.queue[0];
      const current = !head ? null
        : head.kind === 'settler' ? { unit: 'UNIT_SETTLER', building: null, district: null }
          : head.kind === 'unit' ? { unit: gameTypeOf('unit', head.unit, 'UNIT_'), building: null, district: null }
            : head.kind === 'building' ? { unit: null, building: gameTypeOf('building', head.building, 'BUILDING_'), district: null }
              : head.kind === 'district' ? { unit: null, building: null, district: gameTypeOf('district', head.district, 'DISTRICT_') }
                : null;
      const trainable = new Set(trainableUnits(state, i, c).map((d) => gameTypeOf('unit', d.id, 'UNIT_')));
      const prod = Math.max(1, computeCityStats(state, c).total.production);
      return {
        id: c.id, underThreat: false, current, foundedTurn: c.foundedTurn, currentValue: 0,
        buildingBlocked: () => false, districtBlocked: () => false,
        canTrain: (u) => trainable.has(u),
        trainsSea: [...trainable].some((u) => !!UNITS[engineId('unit', u, 'UNIT_', UNITS) ?? '']?.naval),
        // the queue's turns left (0x17bb40): the item in production counts
        // its progress
        buildTurns: (item) => {
          const id = item.unit ? engineId('unit', item.unit, 'UNIT_', UNITS) : undefined;
          if (!id) return 0;
          const done = head && current?.unit === item.unit ? head.progress : 0;
          return Math.max(0, Math.ceil((unitProdCost(state, i, id, UNITS[id].cost) - done) / prod));
        },
        itemValue: () => 0,
        unitRow: (u) => {
          const d = UNITS[engineId('unit', u, 'UNIT_', UNITS) ?? ''];
          return { combat: d?.combat ?? 0, buildCharges: d?.charges ?? 0, sea: !!d?.naval, mustPurchase: false, recon: false };
        },
        buildingRow: () => ({ defensive: false, mustPurchase: false }),
        districtDefensive: () => false,
      };
    }),
    bestCombatStrength: (i) => seatOf(state, i)?.bestMeleeCS ?? 0,
    knownUnits: (i, j) => {
      if (i === j) return unitsOf(state, j).map((u) => unitView(state, u));
      const seen = isCityStateSeat(i) ? cityStateSight(state, i) : plotsSeenNow(state, new Set([i]));
      return unitsOf(state, j).filter((u) => seen[u.tileIndex] && unitVisibleTo(state, u, i)).map((u) => unitView(state, u));
    },
    barbarianCamps: (i) => [...campTiles(state)].filter((p) => isExplored(state, i, p)).sort((a, b) => a - b),
    barbarianSeat: () => BARB_SEAT,
    plotForeignUnits: (i, p) => state.units.filter((u) => u.tileIndex === p && u.seat !== i && !unitsHostile(state, { seat: i }, u)).length,
    cityPopulation: (p) => cityHolders(state).flatMap((s) => s.cities).find((c) => c.centerIndex === p)?.population
      ?? state.cityStates.find((cs) => cs.centerIndex === p)?.population ?? 0,
    governors: (i): MajorGovernorView[] => governorsOf(seat(i)).map((g, k) => {
      const minor = g.minorId >= 0 ? state.cityStates.find((m) => m.id === g.minorId) : undefined;
      const promotions = new Set<string>();
      if (g.appointed) {
        GOVERNOR_PROMOTIONS.forEach((p, j) => {
          if (p.governor === GOVERNORS[k].id && (p.tier === 0 || promotionBit(g.promotions, j))) promotions.add(PROMO_INSTALL_ID[p.id]);
        });
      }
      return {
        type: GOVERNOR_INSTALL_ID[GOVERNORS[k].id], appointed: g.appointed, promotions,
        city: g.cityId >= 0 ? { seat: i, id: g.cityId } : minor ? { seat: minor.seat, id: -1 } : null,
      };
    }),
    // the engine's roster is the seven governors every seat may appoint
    governorAvailable: (_i, type) => GOVERNORS.some((g) => GOVERNOR_INSTALL_ID[g.id] === type),
    // a title civic the caller's moment holds and the state does not yet
    // grants its title too
    governorTitles: (i) => {
      const held = inputs.civicsHeld?.(i);
      const own = seat(i).research.civics;
      return governorTitlesAvailable(state, i)
        + (held ? GOVERNOR_TITLE_CIVICS.filter((c) => !own.includes(c) && held.has(gameTypeOf('civic', c, 'CIVIC_'))).length : 0);
    },
    governorCanPromote: (i, type, promotion) => {
      const k = GOVERNORS.findIndex((g) => GOVERNOR_INSTALL_ID[g.id] === type);
      const p = GOVERNOR_PROMOTIONS.findIndex((x) => PROMO_INSTALL_ID[x.id] === promotion);
      return k >= 0 && p >= 0 && governorPromotionOpen(state, i, k, p);
    },
    cityLoyaltyPerTurn: (i, id) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      if (!city) return 0;
      const stats = computeCityStats(state, city);
      return fxOf(loyaltyPerTurn(state, city, stats.amenities.tier.name, governedCityIds(seat(i)).has(id), stats.foodSurplus < 0));
    },
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
      const city = citiesOf(state, i).find((c) => c.id === id);
      return city ? city.districts.filter((d) => d.type !== 'CITY_CENTER' && map.tiles[d.tileIndex].districtComplete && DISTRICTS[d.type].countsTowardLimit).length : 0;
    },
    cityStrikes: (i, id) => {
      const minor = isCityStateSeat(i) ? (seatOf(state, i) as CityState | undefined) : undefined;
      const city = minor ? minorCity(minor) : citiesOf(state, i).find((c) => c.id === id);
      return !!city && outerPool(state, city) > 0;
    },
    // a city-state's centre reads its outer defence standing with or
    // without walls (LAB: 0x198310's player +0x12f0 +0xf4 term, its writer
    // unread — every minor's Bastions reads its Outer Defense whole before any
    // walls, runs/h1_duelw1121 Ayutthaya t40-58; in combat a wall-less
    // city-state's centre has no outer pool, its CombatLog damage whole)
    cityOuterStands: (i, id) => {
      const city = cityOf(i, id);
      return !!city && (isCityStateSeat(i) || outerPool(state, city) > 0);
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
    cityStateHasCity: (cs) => {
      const minor = seatOf(state, cs) as CityState | undefined;
      return !!minor && !!minorCity(minor);
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
        defense: cityDefenseStrength(state, city), strength: centreStrength(state, city), damaged: !!hp && hp.hp < hp.max,
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
    attackAssignment: (i, ids, keep, even, survive) => {
      // the seat's pass over the units asked: each one's planning against the
      // seat's target list (the assignment reads no other unit's)
      const units = ids.map((id) => state.units.find((u) => u.id === id)).filter((u): u is Unit => !!u);
      const targets = targetsOf(i);
      const pass: Pass = { seat: i, strike: false, units, reach: new Map(), done: new Set(), ai: new Map(units.map((u) => [u.id, AI_COMBAT_UNIT])),
        targets, plan: new Map(), danger: new Int16Array(0), regions: new Set() };
      for (const u of units) {
        const p = planUnit(state, u, targets);
        pass.plan.set(u.id, p);
        pass.reach.set(u.id, p.reach);
      }
      // a unit target the turn's blows already took is gone from the list
      return assignTo(state, pass, units, targets.filter((t, k) => keep(k) && (!t.unit || state.units.includes(t.unit))), even, survive)
        .map((a) => ({ unit: a.unit.id, from: a.from, move: a.move, attack: a.attack }));
    },
    strikeColumn: (id, p) => {
      const u = state.units.find((x) => x.id === id);
      if (!u) return -1;
      const here = map.tiles[u.tileIndex];
      const d = hexDistance(map, here.col, here.row, map.tiles[p].col, map.tiles[p].row);
      if (d === 1) return UNIT_ACTION[`ATTACK_${directionTo(map, here, map.tiles[p])}`] ?? -1;
      const k2 = d === 2 ? snipeRing(state, here).indexOf(p) : -1;
      if (k2 >= 0) return UNIT_ACTION[`SNIPE_${k2}`] ?? -1;
      const k3 = d === 3 ? snipeRing3(state, here).indexOf(p) : -1;
      return k3 >= 0 ? UNIT_ACTION[`SNIPE3_${k3}`] ?? -1 : -1;
    },
    capturedAs: (type) => {
      const id = engineId('unit', type, 'UNIT_', UNITS);
      const to = id ? UNITS[id].capturedAs : undefined;
      return to ? gameTypeOf('unit', to, 'UNIT_') : null;
    },
    militaryYardstick: (i) => {
      const s = seatOf(state, i);
      return Math.max(1, s?.bestMeleeCS ?? 0, Math.max(s?.bestRangedCS ?? 0, CITY_MIN_STRIKE_CS));
    },
    wmdCount: (i) => (seatOf(state, i)?.wmd ?? []).reduce((a, b) => a + b, 0),
    suzerainOf: (cs) => {
      const c = seatOf(state, cs) as CityState | undefined;
      return c ? suzerainOf(c) : -1;
    },
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
    },
    mostEnvoys: (cs) => {
      const c = seatOf(state, cs) as CityState | undefined;
      if (!c) return 0;
      return Math.max(0, ...state.seats.map((s) => envoysHere(state, c, s.seat)));
    },
  };
}

/** the AI type the majors' attack assignment gives every unit: a fighter
 *  (tactical.ts's AI_COMBAT), none a camp's defender */
const AI_COMBAT_UNIT = 3;

/** the cities the seat has revealed the centre of, as its knowledge base
 *  records them (0x5efaf0): the centre its one defensible district */
function knownCities(state: GameState, seat: number): MajorKnownCityView[] {
  const out: MajorKnownCityView[] = [];
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
      districts: [{ plot: c.centerIndex, defense, walls: walled ? defense : 0, strike: walled ? cityStrikeStrength(state, c) : 0 }],
      resources: [...resources].map(([resource, count]) => ({ resource, count })), greatWorks: (c.greatWorks ?? []).length,
    });
  };
  for (const h of cityHolders(state)) for (const c of h.cities) add(c, (c.origCapitalSeat ?? -1) >= 0);
  for (const cs of state.cityStates) if (cs.centerIndex >= 0) add({ ...minorCity(cs), isCapital: true }, true);
  return out;
}

/** every city on the map with what the AI's knowledge records of it: the
 *  majors', the Free Cities' and the city-states' */
function allCities(state: GameState): MajorCityView[] {
  const out: MajorCityView[] = [];
  const add = (c: City, religion: number) => {
    const t = computeCityStats(state, c).total;
    out.push({ plot: c.centerIndex, owner: c.seat, id: c.id, capital: c.isCapital, yields: AI_YIELD_KEYS.map((k) => t[k]), religion,
      originalCapital: (c.origCapitalSeat ?? -1) >= 0, originalOwner: c.founderSeat ?? c.seat });
  };
  for (const h of cityHolders(state)) for (const c of h.cities) add(c, c.followedReligion ?? -1);
  for (const cs of state.cityStates) {
    if (cs.centerIndex >= 0) add({ ...minorCity(cs), isCapital: true, origCapitalSeat: cs.seat, founderSeat: cs.seat }, majorityReligionOf(state, cs.seat));
  }
  return out;
}

/** the start plot of each player that has one: a major's capital, else its
 *  first founder unit; a city-state's centre, else its first unit */
function startPlots(state: GameState): { plot: number; seat: number }[] {
  const out: { plot: number; seat: number }[] = [];
  const first = (seat: number, founder: boolean) => state.units.find((u) => u.seat === seat && (!founder || !!UNITS[u.type]?.settler));
  for (const s of state.seats) {
    if (!isCiv(s.seat)) continue;
    const cap = citiesOf(state, s.seat).find((c) => c.isCapital);
    const plot = cap ? cap.centerIndex : first(s.seat, true)?.tileIndex;
    if (plot !== undefined) out.push({ plot, seat: s.seat });
  }
  for (const cs of state.cityStates) {
    const plot = cs.centerIndex >= 0 ? cs.centerIndex : first(cs.seat, false)?.tileIndex;
    if (plot !== undefined) out.push({ plot, seat: cs.seat });
  }
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

/** a unit as the majors' AI reads it */
function unitView(state: GameState, u: Unit): MajorUnitView {
  const d = UNITS[u.type];
  return { id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_'), plot: u.tileIndex, founder: !!d?.settler,
    combat: aiStrengths(state, u).melee, ranged: d?.ranged?.strength ?? 0, range: d?.ranged?.range ?? 0, damage: UNIT_HP - u.hp,
    movesLeft: Math.trunc(u.movesLeft * 256 / MP_SCALE),
    baseMoves: u.embarked && !d?.naval ? EMBARK_MOVES + embarkTechMoves(state, u.seat) : d?.moves ?? 0,
    bombard: d?.bombard ?? 0, domain: d?.air ? 'air' : d?.naval ? 'sea' : 'land' };
}
