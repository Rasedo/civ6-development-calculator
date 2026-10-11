/**
 * THE MAJORS' AI'S VIEW OF THIS ENGINE (ai/major/view.ts): one seat-agnostic
 * read-only view over a GameState, in the game's type names. Nothing here
 * writes the state; the slot rebuild a government change would make is laid
 * on copies (`carryLayout`).
 */
import type { MajorCityDefenceView, MajorCityView, MajorPlotView, MajorSlotView, MajorUnitView, MajorView } from '../../ai/major/view';
import { directionTo, hexDistance, tilesWithin } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable, isWater } from '../../world/query';
import { fxOf, type AiCityView, type AiDistrictView, type AiPlotView } from './aiValue';
import { AI_YIELDS, type AiWeightInputs, followedStrategies, pseudoYieldWeights, yieldWeights } from './aiWeights';
import { engineId, gameTypeOf, installFeature, installTerrain } from '../data/aliases';
import { isExplored } from './fog';
import { CITY_STRIKE_RANGE, plotPressure } from './phase';
import { BARB_SEAT, borderTurnsFrom, campTiles, cityHolders, citiesOf, civOf, civsAtWar, delegationWith, hiddenResourcesFor, homeContinent, isCiv, isCityStateSeat, leaderOf, majorityReligionOf, metTurnWith, MISSION_DELEGATION, MISSION_EMBASSY, peaceTurnWith, seatOf, tileSeat, unitsOf } from './seats';
import { pathTo, reachPlots } from './tactical';
import { IMPROVEMENT_IDS, unitActionIndex } from './unitActions';
import { plotsSeenNow, ringPlots } from './barbarians';
import { cityDefenseStrength, cityStrikeStrength, unitAttackRange } from './combat';
import { outerPool } from './rules';
import { builderCost, traderCost, unitDomain, unitsHostile, unitVisibleTo } from './units';
import { CIVICS } from '../data/civics';
import { COST_MULTIPLIER_PCT, MP_SCALE } from '../data/constants';
import { GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST, type SlotKind } from '../data/policies';
import { congressPolicyBlocked } from './congress';
import { carryLayout, darkAgeEra, fitPoliciesLoose, governmentBit, governmentSlots, governmentsOpen, inDarkAge, makeYieldCtx, seatGovernment, type YieldCtx,
  unlockedPolicyIds } from './effects';
import { gpOffer } from './greatPeople';
import type { City, CityState, DistrictId, GameState, GreatPersonClass, Unit, YieldKey } from './types';
import { BUILDINGS, effectiveBuilding } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { UNIT_HP, UNITS } from '../data/units';
import { civicAnalysis } from './aiCivics';
import { envoysOf, hasMet, minorCity, suzerainOf } from './cityStates';
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
import { beliefPicks, canFoundReligion, itemCost, settlerCost, unitProdCost } from './game';

/** What the view takes from the majors' AI itself: per major the strategies
 *  it follows (ai/major/strategies.ts), which its weights and its civic list
 *  read (`aiWeights.ts`); and the civics a seat holds where the caller's
 *  state is not the moment the AI reads. */
export interface MajorViewInputs {
  strategies?: ReadonlyMap<number, ReadonlySet<string>>;
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

/** a city's strength, its strike (walls standing) and the strike's reach */
const cityDefence = (state: GameState, c: City): MajorCityDefenceView => ({
  plot: c.centerIndex, strength: cityDefenseStrength(state, c),
  ranged: outerPool(state, c) > 0 ? cityStrikeStrength(state, c) : 0, range: CITY_STRIKE_RANGE,
});

export function majorView(state: GameState, inputs: MajorViewInputs = {}): MajorView {
  const seat = (i: number) => {
    const s = seatOf(state, i);
    if (!s) throw new Error(`majorView: no seat ${i}`);
    return s;
  };
  const slottable = (i: number, gov: string | null): Set<string> => {
    const s = seat(i);
    if (!gov) return new Set();
    return unlockedPolicyIds(s.research, congressPolicyBlocked(state), darkAgeEra(state, i), s.government.held, gov);
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
  const weightInputs = (i: number): AiWeightInputs => ({ strategies: inputs.strategies?.get(i) ?? new Set() });
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
    cityPlots: (i) => citiesOf(state, i).map((c) => c.centerIndex),
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
    units: (i) => unitsOf(state, i).map(unitView),
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
    cityDefences: (i) => citiesOf(state, i).map((c) => cityDefence(state, c)),
    turn: state.turn,
    costMultiplierPct: COST_MULTIPLIER_PCT,
    gameEra: state.gameEra ?? 0,
    cityStates: state.cityStates.length,
    civicsHeld: (i) => inputs.civicsHeld?.(i) ?? new Set(seat(i).research.civics.filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))),
    civicList: (i) => new Set(civicAnalysis(state, i, seat(i).culRate ?? 0, weightInputs(i)).filter((e) => e.score > 0)
      .map((e) => gameTypeOf('civic', e.civic, 'CIVIC_'))),
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
    greatPersonClassAvailable: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return !GP_CLASSES.includes(c) || gpOffer(state, c) !== -2;
    },
    cities: (i): AiCityView[] => citiesOf(state, i).map((c) => ({ id: c.id, capital: c.isCapital })),
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
    districts: (i): AiDistrictView[] => citiesOf(state, i).flatMap((c) => c.districts
      .filter((d) => d.type !== 'CITY_CENTER')
      .map((d) => ({ cityId: c.id, type: districtType(d.type) }))),
    districtYield: (i, id, type, yieldType) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
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
    // the trade AI's knowledge base (its route evaluation) is not read
    tradeKnowledge: () => null,
    influenceTokensUsed: (i) => state.cityStates.reduce((n, cs) => n + envoysOf(cs, i), 0),
    tributaries: (i) => state.cityStates.filter((cs) => suzerainOf(cs) === i).length,
    unitMaintenances: (i) => state.units.filter((u) => u.seat === i).map((u) => UNITS[u.type]?.maintenance ?? 0),
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
    envoys: (cs, i) => {
      const c = seatOf(state, cs) as CityState | undefined;
      return c?.envoys?.[i] ?? 0;
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
        const seen = plotsSeenNow(state, new Set([i]));
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
    militaryStrength: (i) => militaryStrength(state, i),
    score: (i) => scoreLines(state, seat(i)).reduce((a, b) => a + b, 0),
    greatPeopleOfClass: (i, cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return GP_CLASSES.includes(c) ? seat(i).gpEarned.filter((id) => GREAT_PEOPLE[c].some((g) => g.id === id)).length : 0;
    },
    greatPersonOffered: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return GP_CLASSES.includes(c) && gpOffer(state, c) !== -2;
    },
    greatWorksMade: (i) => cityHolders(state).reduce((n, h) => n + h.cities.reduce((m, c) =>
      m + (c.greatWorks ?? []).filter((w) => w.seat === i).length, 0), 0),
    domesticTourists: (i) => domesticTourists(state.seats, seat(i)),
    visitingTourists: (i) => state.seats.reduce((n, o) => n + (o.seat !== i && metTurn(i, o.seat) !== null
      ? touristsDrawn(state.seats, seat(i), o) : 0), 0),
    scienceWonders: (i) => citiesOf(state, i).reduce((n, c) => n + c.wonders.filter((w) => (BUILDINGS[w.id]?.yields?.science ?? 0) > 0).length, 0),
    spaceProjects: (i) => seat(i).projectsDone.filter((id) => PROJECTS[id]?.victory).length,
    cityBuilds: (i) => citiesOf(state, i).map((c) => {
      const head = c.queue[0];
      const unit = head?.kind === 'settler' ? 'UNIT_SETTLER' : head?.kind === 'unit' ? gameTypeOf('unit', head.unit, 'UNIT_') : null;
      if (!head || !unit) return { plot: c.centerIndex, unitType: null, turnsLeft: -1 };
      const prod = Math.max(1, computeCityStats(state, c).total.production);
      return { plot: c.centerIndex, unitType: unit, turnsLeft: Math.max(0, Math.ceil((itemCost(head, state, c) - head.progress) / prod)) };
    }),
    bestCombatStrength: (i) => unitsOf(state, i).reduce((m, u) => Math.max(m, UNITS[u.type]?.combat ?? 0), 0),
    knownUnits: (i, j) => {
      if (i === j) return unitsOf(state, j).map(unitView);
      const seen = plotsSeenNow(state, new Set([i]));
      return unitsOf(state, j).filter((u) => seen[u.tileIndex] && unitVisibleTo(state, u, i)).map(unitView);
    },
    barbarianCamps: (i) => [...campTiles(state)].filter((p) => isExplored(state, i, p)).sort((a, b) => a - b),
    barbarianSeat: () => BARB_SEAT,
    plotForeignUnits: (i, p) => state.units.filter((u) => u.tileIndex === p && u.seat !== i && !unitsHostile(state, { seat: i }, u)).length,
    cityPopulation: (p) => cityHolders(state).flatMap((s) => s.cities).find((c) => c.centerIndex === p)?.population ?? 0,
  };
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
 *  greater of its combat and ranged strengths x its hit points left over its
 *  most, 24.8 truncated, and the treasury's whole gold / 12 as a raw 24.8;
 *  the sum's whole part */
function militaryStrength(state: GameState, seat: number): number {
  let sum = 0;
  for (const u of unitsOf(state, seat)) {
    const d = UNITS[u.type];
    if (!d) continue;
    const str = Math.max(d.combat ?? 0, d.ranged?.strength ?? 0) << 8;
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

/** a unit as the majors' AI reads it */
function unitView(u: Unit): MajorUnitView {
  const d = UNITS[u.type];
  return { id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_'), plot: u.tileIndex, founder: !!d?.settler,
    combat: d?.combat ?? 0, ranged: d?.ranged?.strength ?? 0, range: d?.ranged?.range ?? 0, damage: UNIT_HP - u.hp,
    movesLeft: Math.trunc(u.movesLeft * 256 / MP_SCALE) };
}
