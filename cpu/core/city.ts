
import { addYields, emptyYields, type City, type CityState, type DistrictId, type GameState, type Seat, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable, isMountain } from '../../world/query';
import { tileYields, improvementAdjacency, cityDistrictYields, cityBuildingYields, buildingEraYields, regionalEffects, localAmenities, darkBuildings, cityHasFeature, buildingPillaged, effectiveAdjacency, buildingVariantAdjacency, liveSpecialtyCount } from './yields';
import { seatGovernment, getModifiers, notFoundedSum, religionsPresent, makeYieldCtx, withFollowerBelief, withGovernor, followerReligionsForCity, type Modifiers, type YieldCtx } from './effects';
import { tileAppeal, appealTier, appealBand, PRESERVE_APPEAL_HOUSING } from './appeal';
import { TECHS, ERAS } from '../data/techs'; // wonder/civ era scale
import { CIVICS } from '../data/civics';
/** base tourism every completed wonder pays (real Civ 6). */
export const WONDER_TOURISM_BASE = 2;
import { cityTradeYields } from './trade';
import { hasRiver, isWater, naturalWonderAt } from '../../world/query';
import { revealAround } from './fog';
import { nextRandom } from './rand';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS, buildingVariantFor, effectiveBuilding, isGovYieldBuilding } from '../data/buildings';
import { YIELD_KEYS } from '../../world/types';
import { wallsLevel } from './rules';
import { cityAppealResolver, governorBuildingYields, governorFlag, governorMult, governorSum, minorGovernorEffects, cityGovernorEffects, cityGovernorTitles } from './governors';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { completedWonders, seatWonderSum, seatWonders } from './wonders';
import { goldenCulturePerDistrict, goldenDedication } from './eras';
import { PARK_AMENITIES_OWNER, PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../data/improvements';
import { SPECIALIST_YIELDS, SPECIALIST_TIERS, GW_PRINTING_TECH } from '../data/greatPeople';
import { greatWorkTourism, greatWorkYields, gwCountsByObj, relicTourism } from './greatWorks';
import { GWO_ARTIFACT, GWO_RELIC, GWO_WRITING } from '../data/greatWorks';
import { congressBannedLuxury, congressDuplicateLuxury, congressGrowthMult, congressGwMult } from './congress';
import { cityStateItemProduction, suzerainEffect, minorCity, minorLuxuries, suzerainMinorSeats } from './cityStates';
import { ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE, ZANZIBAR_LUXURIES, ZANZIBAR_LUXURY_AMENITIES, BUENOS_AIRES_AMENITIES } from '../data/cityStates';
import { bankruptAmenities, DEAL_LUXURY, DED_FREE_INQUIRY, HOLY_CITY_TOURISM, TOURISM_PCT_ROWS, LOYALTY_MAX, GOV_INTOLERANCE, TOURISM_GOV_MULT, TOURISM_OPEN_BORDERS_PCT, TOURISM_ROUTE_PCT } from '../data/seats';
import { LUXURY_IDS, RESOURCES, resourceImprovement } from '../../world/resources';
import { FEATURES, isFloodplains } from '../../world/features';
import { CITY_WORK_RADIUS, BORDER_MAX_RADIUS, PLOT_INFLUENCE, borderGrowthCost, FOOD_PER_CITIZEN, CITIZEN_SCIENCE, CITIZEN_CULTURE, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, LUXURY_AMENITY_CITIES, growthFoodNeeded, housingGrowthFactor, amenitiesNeeded, amenityTier, amenityTierIndex, type AmenityTier } from '../data/constants';
import { hiddenResourcesFor } from './seats';
import { tileSeat, tileCity, setTileOwner, tileBelongsTo,tileOwnedByCiv, seatOf, citiesOf, civOf, civVariantOf, tileClaimed, campTiles, borderTurnsFrom, isCityStateSeat } from './seats';
import { warWearinessLosses } from './weariness';
import { garrisonOf } from './units';
import { floodBarrierScale } from './climate';
import { DED_STEAM, DED_WISH, WISH_PARK_TOURISM_MULT, WISH_WONDER_TOURISM_NUM, WISH_WONDER_TOURISM_DEN } from '../data/seats';

import { GP_ADJ_TOURISM_PCT, GP_BUILDING_TOURISM, GP_BUILDING_YIELDS, gpCityPermOf, gpPermOf, gpTilePermOf } from '../data/greatPeople';
export interface CityStats {
  city: City;
  housing: number;
  /** the housing by the game's parts, `HOUSING_PARTS` order */
  housingParts: number[];
  amenities: { have: number; needed: number; balance: number; tier: AmenityTier };
  workedTiles: number[];
  breakdown: {
    tiles: Yields;
    districts: Yields;
    buildings: Yields;
    citizens: Yields;
    bonuses: Yields;
    trade: Yields;
  };
  total: Yields;
  foodSurplus: number;
  effectiveFoodSurplus: number;
  growthNeeded: number;
  turnsToGrow: number | null;
  border: {
    cost: number;
    progress: number;
    turns: number | null;
    nextTile: number | null;
  };
  specialistTotal: number;
  maintenance: number;
}

export function buildingMaintenance(state: GameState, city: City, id: string): number {
  // a unique building may carry no upkeep where the row it replaces does
  // (the Marae), so the SEAT decides which row is being priced
  const def = effectiveBuilding(civOf(state, city.seat), id);
  if (!def) return 0;
  // a Flood Barrier's upkeep scales as its price does
  return def.floodBarrier ? def.maintenance * floodBarrierScale(state, city) : def.maintenance;
}

export function districtMaintenance(type: DistrictId): number {
  return DISTRICTS[type].maintenance;
}

/**
 * Sum one numeric BuildingDef field over every building this seat holds whose
 * district is complete and unpillaged — the shape of every empire-wide
 * building term (spy capacity, influence, diplomatic favor), which pays from
 * the one city that built it to the whole seat.
 */
export function seatBuildingSum(
  state: GameState,
  seat: number,
  key: 'spyCapacity' | 'influencePerTurn' | 'favorPerTurn' | 'govTitle' | 'loyaltyWithoutGovernor'
    | 'amenitiesWithGovernor' | 'housingWithGovernor' | 'healOnKill' | 'conquestProdPct'
    | 'conquestProdTurns' | 'projectChargePct' | 'levyDiscountPct',
): number {
  let n = 0;
  for (const city of citiesOf(state, seat)) {
    const dark = darkBuildings(state.map, city);
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (!def || dark.has(id)) continue;
      n += def[key] ?? 0;
    }
  }
  return n;
}

/**
 * The same sum over ONE city — the shape of a Plaza term that names "this
 * city" rather than the empire.
 */
export function cityBuildingSum(
  state: GameState,
  city: { buildings: string[]; districts?: City['districts']; pillagedBuildings?: string[] },
  key: 'settlerProdPct',
): number {
  const dark = darkBuildings(state.map, city);
  let n = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || dark.has(id)) continue;
    n += def[key] ?? 0;
  }
  return n;
}

/** CIV6 (Ancestral Hall): "New cities receive a free Builder" — what a
 *  standing building hands every city this seat founds, or null. */
export function newCityGrantUnit(state: GameState, seat: number): string | null {
  for (const city of citiesOf(state, seat)) {
    const dark = darkBuildings(state.map, city);
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (def?.grantUnitNewCity && !dark.has(id)) return def.grantUnitNewCity;
    }
  }
  return null;
}

/** CIV6: a city's upkeep — each COMPLETE district's, a PILLAGED one paying
 *  none (the game's `maintDistricts` falls to 0 across three pillage windows
 *  of one Campus, runs/h1_duelw1104), and every building's, a pillaged one
 *  still paying. */
export function cityMaintenance(state: GameState, city: City): number {
  let total = 0;
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.districtComplete && !t.districtPillaged) total += districtMaintenance(d.type);
  }
  for (const b of city.buildings) total += buildingMaintenance(state, city, b);
  return total;
}

export function workableTiles(state: GameState, city: City): Tile[] {
  const center = state.map.tiles[city.centerIndex];
  // CIV6 (Mit'a, EFFECT_ADJUST_PLAYER_TERRAIN_WORK_IMPASSABLE_MODIFIER):
  // "Citizens may work Mountain tiles" — the roster's own row, and the ONLY
  // impassable ground it opens (an ice sheet stays unworkable).
  const mtnOk = getModifiers(state, city.seat).workMountains;
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS).filter(
    (t) =>
      tileBelongsTo(t, city) &&
      t.index !== city.centerIndex &&
      !t.district &&
      !t.builtWonder &&
      !t.submerged &&
      // a CONTAMINATED tile is still worked: measured live (lab 3 part two —
      // every worked tile of a city contaminated by hand, the citizens stayed,
      // the yields and the food surplus were unchanged); fallout hurts the
      // units standing in it and nothing else
      (!isImpassable(t) || (mtnOk && isMountain(t) && !t.feature))
      // CIV6 (`Improvements.Workable` false): the Ski Resort's mountain
      && !(t.improvement && IMPROVEMENTS[t.improvement as ImprovementId]?.unworkable),
  );
}

export function citySpecialistSlots(state: GameState, city: City): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of city.districts) {
    if (!SPECIALIST_YIELDS[d.type]) continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // pillaged district has no working specialists
    // ...and a pillaged building seats nobody
    const slots = city.buildings.filter((b) => BUILDINGS[b]?.district === d.type && !buildingPillaged(city, b)).length;
    if (slots > 0) out.set(d.tileIndex, slots);
  }
  return out;
}

/** WHO MANS THE SLOTS. The citizens the player PINNED (`specialistPref`, a
 * count per PLACEABLE_DISTRICTS index) go in first, clamped to the district's
 * open slots and to the city's population; then the automatic rule spends the
 * OVERFLOW — population beyond the workable plots — on whatever slots are
 * still free, in PLACEABLE_DISTRICTS order. CIV6 (wiki "Specialists (Civ6)"):
 * "Specialists are also particularly useful when a city grows large later in
 * the game, and has more Population than there are normal tiles to work."
 * With nothing pinned this is exactly the automatic rule, which is what an
 * unmanaged city gets. Zero-draw on both engines. */
export function effectiveSpecialists(state: GameState, city: City): Map<number, number> {
  const slots = citySpecialistSlots(state, city);
  const out = new Map<number, number>();
  let budget = Math.max(0, city.population);
  PLACEABLE_DISTRICTS.forEach((type, di) => {
    const pin = city.specialistPref?.[di] ?? -1;
    if (pin <= 0 || budget <= 0) return;
    const inst = city.districts.find((d) => d.type === type);
    if (!inst) return;
    const n = Math.min(pin, slots.get(inst.tileIndex) ?? 0, budget);
    if (n > 0) {
      out.set(inst.tileIndex, n);
      budget -= n;
    }
  });
  let overflow = Math.max(0, budget - workableTiles(state, city).length);
  for (const type of PLACEABLE_DISTRICTS) {
    if (overflow <= 0) break;
    const inst = city.districts.find((d) => d.type === type);
    if (!inst) continue;
    const taken = out.get(inst.tileIndex) ?? 0;
    const n = Math.min((slots.get(inst.tileIndex) ?? 0) - taken, overflow);
    if (n > 0) {
      out.set(inst.tileIndex, taken + n);
      overflow -= n;
    }
  }
  return out;
}

/** A specialist's yields in this city: the base row, upgraded when the
 * district's TOP building stands ('WORSHIP' = any worship building). */
function specialistYields(district: import('./types').DistrictId, buildings: readonly string[]): Partial<Yields> | undefined {
  const base = SPECIALIST_YIELDS[district];
  if (!base) return undefined;
  const tier = SPECIALIST_TIERS[district];
  const has = tier
    ? tier.buildings.some((b) => (b === 'WORSHIP' ? buildings.some((x) => BUILDINGS[x]?.worship) : buildings.includes(b)))
    : false;
  if (!tier || !has) return base;
  const out: Partial<Yields> = { ...base };
  for (const [k, v] of Object.entries(tier.add) as [YieldKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

const FOCUS_BASE: Record<YieldKey, number> = {
  food: 2,
  production: 2,
  gold: 1,
  science: 1,
  culture: 1,
  faith: 1,
};

export function tileScore(y: Yields, focus: FocusId): number {
  let score = 0;
  for (const k of Object.keys(FOCUS_BASE) as YieldKey[]) {
    let w = FOCUS_BASE[k];
    if (focus !== 'balanced' && focus === k) w += 3;
    score += y[k] * w;
  }
  return score;
}

/**
 * THE TILES A CITY ACTUALLY WORKS THIS TURN.
 *
 * `assignWorkedTiles` answers "which of these candidates, for this many
 * citizens"; this answers the question the ENGINE asks — the same city, with
 * the specialists already diverted — so the yield walk and the state census
 * read one composer instead of two spellings of the citizen count.
 *
 * Returned in the WALK'S OWN ORDER — locked plots first, then by score. The
 * pick is a set and a comparison should canonicalise it, but the walk sums
 * f64 yields in this order and re-ordering it would move the last ulp, so the
 * sort belongs at the census and never here.
 *
 * `spent` is the specialist count the caller has already computed; the walk
 * has it in hand, and passing it keeps this the ONE place the citizen count
 * is spelled.
 */
export function workedTilesOf(state: GameState, city: City, ctx?: YieldCtx, spent?: number): number[] {
  const yctx = ctx ?? makeYieldCtx(state, city.seat);
  let specialistTotal = spent;
  if (specialistTotal === undefined) {
    specialistTotal = 0;
    for (const n of effectiveSpecialists(state, city).values()) specialistTotal += n;
  }
  return assignWorkedTiles(state, city, yctx, city.population - specialistTotal);
}

export function assignWorkedTiles(
  state: GameState,
  city: City,
  ctx?: YieldCtx,
  workers = city.population,
): number[] {
  const yctx = ctx ?? makeYieldCtx(state, city.seat);
  const candidates = workableTiles(state, city);
  const scored = candidates
    .map((t) => ({ index: t.index, score: tileScore(tileYields(yctx, t), city.focus) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  // LOCKED plots first, in tile order — the citizens the player placed by
  // hand, ahead of anything the score would have chosen.
  const lockedValid = candidates.filter((t) => t.locked).map((t) => t.index).sort((a, b) => a - b);
  const worked: number[] = lockedValid.slice(0, workers);
  for (const s of scored) {
    if (worked.length >= workers) break;
    if (!worked.includes(s.index)) worked.push(s.index);
  }
  return worked;
}

/** City-center tile yields, floored per Civ 6. */
export function tileYieldsForCenter(ctx: YieldCtx, center: Tile): Yields {
  const y = tileYields(ctx, { ...center, district: null });
  y.food = Math.max(y.food, CITY_CENTER_MIN_FOOD);
  y.production = Math.max(y.production, CITY_CENTER_MIN_PRODUCTION);
  return y;
}

/** CIV6 (Marae): the yields a civilization's unique building pays on every
 *  tile of the city carrying a PASSABLE feature, summed over the buildings
 *  given. A natural wonder is a feature, so a passable one is paid. */
function buildingVariantFeatureYields(state: GameState, seat: number, buildings: readonly string[]): Partial<Yields> | null {
  let out: Partial<Yields> | null = null;
  const civ = civOf(state, seat);
  for (const id of buildings) {
    const y = buildingVariantFor(civ, id)?.featureTileYields;
    if (!y) continue;
    out = out ?? {};
    for (const k of Object.keys(y) as (keyof Yields)[]) out[k] = (out[k] ?? 0) + (y[k] ?? 0);
  }
  return out;
}

/** CIV6 (STAVE_CHURCH_SEA_RESOURCE_REQUIREMENTS — the Stave Church's
 *  production, the Aquarium's science): the yields the buildings given pay
 *  on every Coast tile of the city carrying a resource its owner can see,
 *  summed over a base row's clause and a unique row's. */
export function buildingCoastYields(state: GameState, seat: number, buildings: readonly string[]): Partial<Yields> | null {
  let out: Partial<Yields> | null = null;
  for (const id of buildings) {
    for (const y of [BUILDINGS[id]?.coastResourceYields, civVariantOf(state, seat, BUILDINGS[id]?.civVariants)?.coastResourceYields]) {
      if (!y) continue;
      out = out ?? {};
      for (const k of Object.keys(y) as (keyof Yields)[]) out[k] = (out[k] ?? 0) + (y[k] ?? 0);
    }
  }
  return out;
}

/**
 * THE CITY'S PLOT YIELDS (COLLECTION_CITY_PLOT_YIELDS): what the city's own
 * buildings and wonders pay on a plot of the city, on top of `tileYields`.
 * The walk adds it for the centre and each worked plot, after the pick — the
 * tile score ranks without it.
 *
 * - a wonder naming a TERRAIN or FEATURE pays on the city's own tiles;
 *   `empire` widens the payer to every city the seat holds (Etemenanki's
 *   Marsh). The centre counts and a districted tile does not.
 * - CIV6 (Great Bath, GREATBATH_FLOODFAITH): Faith on a Floodplains plot per
 *   flood that plot has taken — the recorded games read it on the city's
 *   Floodplains plots alone, each with its own river's count.
 *
 * The building rows below pay only from a building that stands lit
 * (`darkBuildings`): a pillaged Lighthouse feeds no Coast plot.
 * - CIV6 (Water Mill; WATERMILL_ADDRICEFOOD, _ADDWHEATYIELD, _ADDMAIZEYIELD):
 *   +1 Food on a plot carrying a bonus resource a Farm improves (Rice, Wheat,
 *   Maize), farmed or not.
 * - CIV6 (Lighthouse, Shipyard, Seaport; `coastPlotYields`): yields on every
 *   Coast plot, the Shipyard's only where nothing is built.
 * - CIV6 (Stave Church, Aquarium; REQUIRES_PLOT_HAS_VISIBLE_RESOURCE): a Coast
 *   tile carrying a resource the city's owner can SEE.
 * - CIV6 (Aquarium, AQUARIUM_REEF_REQUIREMENTS): every tile of one feature.
 * - CIV6 (Marae): every tile with a passable feature or natural wonder.
 * - CIV6 (Forestry Management, FORESTRY_MANAGEMENT_FEATURE_NO_IMPROVEMENT_GOLD
 *   under PLOT_HAS_ANY_FEATURE_NO_IMPROVEMENTS): the city's governor pays a
 *   plot that carries a feature and no improvement.
 *
 * A plot under an impassable feature (Ice) yields nothing, so none of these
 * reach it.
 */
export function cityPlotBonus(state: GameState, city: City): (t: Tile, isCenter: boolean, out: Yields) => void {
  const tileRules: NonNullable<NonNullable<BuiltWonderDef['effects']>['tileYields']> = [];
  let faithPerFlood = 0;
  for (const w of completedWonders(state, city)) {
    for (const r of w.def.effects?.tileYields ?? []) tileRules.push(r);
    faithPerFlood += w.def.effects?.faithPerFlood ?? 0;
  }
  for (const c of citiesOf(state, city.seat)) {
    if (c.id === city.id) continue;
    for (const w of completedWonders(state, c)) {
      for (const r of w.def.effects?.tileYields ?? []) if (r.empire) tileRules.push(r);
    }
  }
  const dark = darkBuildings(state.map, city);
  const lit = city.buildings.filter((id) => !dark.has(id));
  const hasWaterMill = lit.includes('WATER_MILL');
  const coastRows = lit.flatMap((id) => BUILDINGS[id]?.coastPlotYields ?? []);
  const coastResY = buildingCoastYields(state, city.seat, lit);
  const featPlotY = lit.flatMap((id) => BUILDINGS[id]?.plotFeatureYields ?? []);
  const hiddenRes = hiddenResourcesFor(state, city.seat);
  const featTileY = buildingVariantFeatureYields(state, city.seat, lit);
  const goldPerFeature = governorSum(state, city, (e) => e.goldPerFeature);
  return (t, isCenter, out) => {
    if (t.feature !== null && FEATURES[t.feature]?.impassable) return;
    if (tileRules.length && !(t.district && !isCenter)) {
      for (const r of tileRules) {
        if (r.terrain && t.terrain !== r.terrain) continue;
        if (r.feature && t.feature !== r.feature) continue;
        if (r.excludeFeature && t.feature === r.excludeFeature) continue;
        addYields(out, r.yields);
      }
    }
    if (faithPerFlood && isFloodplains(t.feature)) out.faith += faithPerFlood * (t.floodCount ?? 0);
    if (hasWaterMill && t.resource) {
      const r = RESOURCES[t.resource];
      if (r?.category === 'bonus' && r.improvement === 'FARM') out.food += 1;
    }
    if (t.terrain === 'COAST' || t.terrain === 'LAKE') {
      for (const r of coastRows) if (!r.unimproved || t.improvement === null) addYields(out, r.yields);
    }
    if (coastResY && t.terrain === 'COAST' && t.resource !== null && !hiddenRes.has(t.resource)) addYields(out, coastResY);
    for (const f of featPlotY) if (t.feature === f.feature) addYields(out, f.yields);
    if (featTileY && t.feature !== null) addYields(out, featTileY);
    if (goldPerFeature && t.feature !== null && t.improvement === null) out.gold += goldPerFeature;
  };
}

/** What the city's centre plot yields: `tileYieldsForCenter`, the
 *  roster's centre rows per adjacent tile of the named terrain (CIV6,
 *  EFFECT_TERRAIN_ADJACENCY, `CENTER_ADJ_ROWS`), and the city's plot yields
 *  (`cityPlotBonus`). */
export function cityCentreYields(
  state: GameState, city: City, ctx: YieldCtx = cityYieldCtx(state, city),
  plotBonus = cityPlotBonus(state, city),
): Yields {
  const center = state.map.tiles[city.centerIndex];
  const out = tileYieldsForCenter(ctx, center);
  for (const r of ctx.mods.centerAdj) {
    out[r.yield] += r.amount * neighbors(state.map, center).filter((n) => n.terrain === r.terrain).length;
  }
  plotBonus(center, true, out);
  return out;
}

/** The yield context the city's walk reads its plots on: the seat's
 *  modifiers with the city's followed religion's beliefs and its governor. */
export function cityYieldCtx(state: GameState, city: City, mods?: Modifiers): YieldCtx {
  const base = mods ?? getModifiers(state, city.seat);
  return makeYieldCtx(state, city.seat, withGovernor(state,
    withFollowerBelief(state, base, followerReligionsForCity(base, city)), city));
}

/** The city's housing in the game's own breakdown, the order of its growth
 *  getters: water (with the Aqueduct), buildings (with wonders), districts,
 *  improvements, civics (policies, governments, governors, traits), great
 *  people, starting era. */
export const HOUSING_PARTS = ['water', 'buildings', 'districts', 'improvements', 'civics', 'greatPeople', 'startingEra'] as const;

export function computeHousing(state: GameState, city: City, mods?: Modifiers): number {
  return housingParts(state, city, mods).reduce((a, b) => a + b, 0);
}

export function housingParts(state: GameState, city: City, mods?: Modifiers): number[] {
  const m = mods ?? getModifiers(state, city.seat);
  const map = state.map;
  const center = map.tiles[city.centerIndex];

  const fresh = hasFreshWater(map, center);
  let water = fresh
    ? HOUSING_FRESH_WATER
    : isCoastalLand(map, center)
      ? HOUSING_COASTAL
      : HOUSING_NO_WATER;
  const hasAqueduct = city.districts.some(
    (d) =>
      d.type === 'AQUEDUCT' &&
      map.tiles[d.tileIndex].districtComplete &&
      !map.tiles[d.tileIndex].districtPillaged, // a pillaged Aqueduct gives no housing
  );
  if (hasAqueduct) {
    water = fresh ? water + AQUEDUCT_FRESH_BONUS : Math.max(water, AQUEDUCT_NO_FRESH_TOTAL);
  }

  const dark = darkBuildings(map, city);
  const camps = campTiles(state);
  const gpa = cityAppealResolver(state);
  // CIV6 (Bath): its Districts row adds "Housing 2" on top of the water,
  // a district part of the breakdown
  let districts = hasAqueduct ? civVariantOf(state, city.seat, DISTRICTS.AQUEDUCT.civVariants)?.housing ?? 0 : 0;
  for (const d of city.districts) {
    const dt = map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // a pillaged district's housing is dark
    const ddef = DISTRICTS[d.type];
    if (d.type === 'NEIGHBORHOOD') {
      districts += appealTier(tileAppeal(map, dt, camps, gpa)).housing;
    } else if (ddef.appealHousing) {
      districts += PRESERVE_APPEAL_HOUSING[appealBand(tileAppeal(map, dt, camps, gpa))];
    } else {
      districts += ddef.housing;
    }
  }
  let buildings = wonderCityFlat(state, city, 'cityHousing') + seatWonderSum(state, city.seat, 'empireHousing');
  for (const id of city.buildings) {
    const def = effectiveBuilding(civOf(state, city.seat), id);
    if (dark.has(id)) continue; // in a pillaged district, or pillaged itself
    if (def?.housing) buildings += def.housing;
    // CIV6 (LIGHTHOUSE_COASTAL_CITY_HOUSING): more while the centre is coastal
    if (def?.coastalHousing && isCoastalLand(map, center)) buildings += def.coastalHousing;
    // CIV6 (Kupe's Voyage): "The Palace receives +3 Housing"
    if (def?.autoCapital) for (const r of m.capital) buildings += r.palaceHousing ?? 0;
    const beliefHousing = m.buildingHousingAdd[id];
    if (beliefHousing) buildings += beliefHousing;
  }
  let civics = 0;
  if (m.riverCity && hasRiver(center)) civics += m.riverCity.housing;
  // CIV6: the improvements' Housing / TilesRequired shares sum over the city
  // and pay WHOLE housing — `GetHousingFromImprovements` is the floor of the
  // city's sum, 1,366 of 1,366 cities where a per-kind floor would differ
  // (one Farm and one Pasture pay 1; runs/h1_duelw1103 / 1104).
  let impHousing = 0;
  let impCivic = 0;
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    // a pillaged improvement houses nobody
    if (!tileBelongsTo(t, city) || !t.improvement || t.pillaged) continue;
    const idef = IMPROVEMENTS[t.improvement as ImprovementId];
    impHousing += idef.housing;
    if (idef.housingCivic && m.impUpgrades.has(idef.housingCivic)) impCivic += 1;
  }
  const improvements = Math.floor(impHousing) + impCivic;

  civics += m.housingAll;
  /* CIV6 (Classical Republic / Insulae / Medina Quarter / New Deal):
   * housing in every city with at least 1/2/3/3 specialty districts. */
  const specialtyCount = liveSpecialtyCount(state, city);
  for (const rule of m.housingIfDistricts) {
    if (specialtyCount >= rule.min) civics += rule.housing;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) civics += rule.housing;
  }
  /* CIV6 (Monarchy): "+1 Housing per level of Walls" — the level BUILT, so a
   * city with no wall standing is paid nothing however far its tech ran. */
  if (m.housingPerWallLevel) civics += m.housingPerWallLevel * wallsLevel(city);
  return [water, buildings, districts, improvements, civics, gpCityPermOf(city, 'housing'), 0];
}

/** CIV6 (Autocracy): how many government buildings STAND in this city — the
 *  Government Plaza's and the Diplomatic Quarter's, and the Palace. A dark
 *  district takes its buildings with it, as it does for their yields. */
function govYieldBuildingCount(state: GameState, city: City): number {
  const dark = darkBuildings(state.map, city);
  let n = 0;
  for (const b of city.buildings) {
    const def = BUILDINGS[b];
    if (def && !dark.has(b) && isGovYieldBuilding(def)) n += 1;
  }
  return n;
}

/**
 * Per luxury, the copies `seat` holds and the copies it can still trade.
 * SPARE: its own improved, unpillaged plots and city centres standing on a
 * luxury, plus those of every city-state
 * it is suzerain of (CIV6: "Gain ownership of all the city-state's
 * resources"), plus the copies a Great Person granted it (`gpLuxCopies`),
 * less the copies its running deals send out. HELD: the spare
 * copies plus those running deals bring in — a copy received on a deal is not
 * the receiver's to trade on. `_lux_holdings` is the twin.
 */
export function luxuryHoldings(state: GameState, seat: number): { held: Map<string, number>; spare: Map<string, number> } {
  const spare = new Map<string, number>();
  const add = (m: Map<string, number>, r: string, n: number): void => { m.set(r, (m.get(r) ?? 0) + n); };
  const suz = suzerainMinorSeats(state, seat);
  const minorCentres = new Set((state.cityStates ?? []).map((c) => c.centerIndex));
  for (const t of state.map.tiles) {
    if (!t.resource || RESOURCES[t.resource].category !== 'luxury') continue;
    const owner = tileSeat(t);
    if (owner !== seat && !suz.has(owner)) continue;
    // CIV6: a city founded on a luxury holds it — the centre stands in for
    // the improvement (runs/h1_duelw1104 Wine, 1106 Diamonds, 1108 Marble:
    // each seat's record holds one copy more than its improved plots, the
    // one under its city centre, from the founding turn on)
    const centre = t.district === 'CITY_CENTER' || minorCentres.has(t.index);
    if (centre || (t.improvement === resourceImprovement(t) && !t.pillaged)) add(spare, t.resource, 1);
  }
  const granted = seatOf(state, seat)?.gpLuxCopies ?? [];
  granted.forEach((n, i) => { if (n > 0) add(spare, LUXURY_IDS[i]!, n); });
  const held = new Map<string, number>();
  for (const [key, term] of Object.entries(state.dealTerms ?? {})) {
    const [from, to] = key.split('>').map(Number);
    if (from !== seat && to !== seat) continue;
    for (const [kind, a] of term.items) {
      if (kind !== DEAL_LUXURY) continue;
      const r = LUXURY_IDS[a];
      if (!r) continue;
      if (from === seat) add(spare, r, -1);
      else add(held, r, 1);
    }
  }
  for (const [r, n] of spare) add(held, r, n);
  return { held, spare };
}

/**
 * Every amenity `city` has but its luxuries', net of war weariness and
 * bankruptcy — the sum `luxuryAmenities` ranks cities on, and the one the
 * tier balance adds the luxuries to. `m` is the city's own modifiers (its
 * governor and follower beliefs folded in), `regionalAmenities` what the
 * regional buildings reaching it pay. `ww` is the war-weariness part, for
 * the amenity log.
 */
function nonLuxuryAmenities(
  state: GameState, city: City, m: Modifiers, regionalAmenities: number,
): { have: number; ww: number } {
  const center = state.map.tiles[city.centerIndex];
  let have =
    localAmenities(state, city) +
    parkAmenities(state, city) +
    regionalAmenities +
    wonderRegionalAmenities(state, city) +
    wonderCityFlat(state, city, 'cityAmenities') +
    wonderImprovementAmenities(state, city) +
    improvementAmenities(state, city) +
    m.amenitiesAll +
    // CIV6 (Retainers): "+1 Amenity in cities with a garrisoned unit"
    (m.amenitiesWithGarrison && garrisonOf(state, city) ? m.amenitiesWithGarrison : 0) +
    // CIV6 (Sports Media): "Stadiums generate +1 Amenity"
    m.amenitiesWithBuilding.reduce((n, r) => n + (city.buildings.includes(r.building) ? r.amenities : 0), 0) +
    (m.riverCity && hasRiver(center) ? m.riverCity.amenities : 0) +
    gpCityPermOf(city, 'amenities') +
    notFoundedSum(state, city, 'amenity') +
    // CIV6 (Dharma): "Cities gain an Amenity for every Religion with at least
    // 1 Follower" (`RELIGION_AMENITY_ROWS`)
    (m.religionAmenities.length
      ? m.religionAmenities.reduce((n, r) => n + r.amenities
        * religionsPresent(city).filter((g) => (city.religionPressure?.[g] ?? 0) >= r.followers).length, 0)
      : 0);
  const ww = warWearinessLosses(state, city.seat).get(city.id) ?? 0;
  have -= ww;
  // CIV6 (GOLD_NEGATIVE_BALANCE_AMENITY_LOSS_LINE): every city of a seat
  // whose last upkeep fell short loses amenities to bankruptcy
  have -= bankruptAmenities(seatOf(state, city.seat)?.goldShortfall ?? 0);
  const specialtyCount = liveSpecialtyCount(state, city);
  for (const rule of m.amenitiesIfSpecialty) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  return { have, ww };
}

/**
 * Which cities each luxury's amenity reaches. CIV6 has no install row for it
 * (a DLL rule); this is the rule fitted on the H-1 records
 * (`GetAmenitiesFromLuxuries` per city):
 * - every copy a luxury serves goes to `reach` cities (LUXURY_AMENITY_CITIES
 *   for a worked one), one amenity each;
 * - the cities stand in ONE list, founding (id) order at first, and before
 *   every copy that list is stably re-sorted by need — amenitiesNeeded less
 *   the city's non-luxury amenities (`nonLuxuryAmenities`) and the luxury
 *   amenities granted so far — so equally needy cities keep the order the
 *   previous copy left them in;
 * - the Luxury Policy's duplicated luxury serves first, and while it does a
 *   city holding fewer of its copies ranks ahead of any holding more.
 */
export function luxuryAmenities(state: GameState, seat: number): Map<number, number> {
  // a city-state's one city is its `minorCity` view (its Seat's `cities` is
  // empty): an improved luxury on its ground serves it like any city's
  const minor = isCityStateSeat(seat) ? (seatOf(state, seat) as CityState | undefined) : undefined;
  const cities = minor ? [minorCity(minor)] : citiesOf(state, seat);
  const result = new Map<number, number>();
  for (const c of cities) result.set(c.id, 0);
  if (cities.length === 0) return result;

  // CIV6 (Luxury Policy): "A: +1 Amenity on duplicates of a Resource. /
  // B: This Luxury resource grants no Amenities." B silences the named
  // luxury outright; A pays one extra full-reach round per copy the seat
  // holds beyond the first — its own, its city-states', its Great Persons',
  // its deals' (1104 China's six Cocoa, four of them its own plots, pay five
  // extra rounds, t143-162).
  const banned = congressBannedLuxury(state);
  const dupLux = congressDuplicateLuxury(state);
  const held = luxuryHoldings(state, seat).held;
  const dupCopies = dupLux && dupLux !== banned ? Math.max(0, held.get(dupLux) ?? 0) : 0;
  // every luxury the seat holds a copy of — its own, its city-states', its
  // deals' (`luxuryHoldings`) — serves one full-reach round
  const luxuries = new Set<string>();
  for (const [r, n] of held) if (n > 0 && r !== banned) luxuries.add(r);
  // CIV6 (Affluence): "While established in a city-state, provides a copy of
  // its Luxury resources to you." A copy of one already worked is no second
  // amenity, which the set answers by itself.
  for (const cityState of state.cityStates ?? []) {
    if (!minorGovernorEffects(state, seat, cityState.id).some((e) => e.minorLuxuries)) continue;
    for (const r of minorLuxuries(state, cityState)) if (r !== banned) luxuries.add(r);
  }

  const baseHave = new Map<number, number>();
  if (cities.length > 1) {
    const seatMods = getModifiers(state, seat);
    for (const c of cities) {
      const m = withGovernor(state, withFollowerBelief(state, seatMods, followerReligionsForCity(seatMods, c)), c);
      baseHave.set(c.id, nonLuxuryAmenities(state, c, m,
        regionalEffects(state, c, governorFlag(state, c, (e) => e.industryAllSources)).amenities).have);
    }
  }

  // CIV6 (John Spilsbury, Helena Rubinstein, Levi Strauss, Estee Lauder): an
  // INVENTED luxury serves cities exactly like a worked one, and its own row
  // says how many it reaches.
  // CIV6 (Zanzibar): Cinnamon and Cloves are luxuries with `Frequency="0"` —
  // they stand on no map tile, so they cannot be a resource id here. Each is
  // `Happiness="6"`, which this model spells as a SIX-city reach, the same
  // shape an invented luxury already has.
  const zanzibar = suzerainEffect(state, seat, 'spiceLuxuries')
    ? new Array<number>(ZANZIBAR_LUXURIES).fill(ZANZIBAR_LUXURY_AMENITIES) : [];
  // CIV6 (Buenos Aires): "Your bonus resources behave like luxury resources,
  // providing +1 Amenity per resource"
  // (`MODIFIER_PLAYER_OWNED_BONUS_RESOURCE_EXTRA_AMENITIES`, Amount 1). The
  // modifier's gate is OWNERSHIP, so an unimproved copy counts.
  const bonusLux = new Set<string>();
  if (suzerainEffect(state, seat, 'bonusAmenities')) {
    for (const t of state.map.tiles) {
      if (!t.resource || tileSeat(t) !== seat) continue;
      if (RESOURCES[t.resource]?.category === 'bonus') bonusLux.add(t.resource);
    }
  }
  // the duplicated luxury's copies serve first, all of them
  const dupRounds = dupCopies > 1 ? dupCopies : 0;
  const reach = [
    ...new Array<number>(luxuries.size + Math.max(0, dupCopies - 1)).fill(LUXURY_AMENITY_CITIES),
    ...(seatOf(state, seat)?.gpLuxuries ?? []),
    ...zanzibar,
    ...new Array<number>(bonusLux.size).fill(BUENOS_AIRES_AMENITIES),
  ];
  const dlR = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (dlR) dlR.push(`r:${seat} t${state.turn} lux${luxuries.size} dup${dupCopies} reach[${reach.join(',')}]`);
  const need = (c: City): number => amenitiesNeeded(c.population) - ((baseHave.get(c.id) ?? 0) + result.get(c.id)!);
  const dupHeld = new Map<number, number>();
  for (const c of cities) dupHeld.set(c.id, 0);
  // ONE list, re-sorted in place: Array.prototype.sort is stable, so a tie
  // keeps the order the previous copy left
  const order = [...cities].sort((a, b) => a.id - b.id);
  reach.forEach((n, i) => {
    const dup = i < dupRounds;
    order.sort((a, b) => (dup ? dupHeld.get(a.id)! - dupHeld.get(b.id)! : 0) || need(b) - need(a));
    for (const c of order.slice(0, n)) {
      result.set(c.id, result.get(c.id)! + 1);
      if (dup) dupHeld.set(c.id, dupHeld.get(c.id)! + 1);
    }
  });
  return result;
}

export function borderCandidates(state: GameState, city: City): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of tilesWithin(state.map, center.col, center.row, BORDER_MAX_RADIUS)) {
    if (tileClaimed(t)) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && tileBelongsTo(n, city),
    );
    if (adjOwn) out.push(t.index);
  }
  return out;
}

export function resourcePriority(tile: Tile): number {
  if (!tile.resource) return 0;
  const cat = RESOURCES[tile.resource].category;
  return cat === 'luxury' ? 3 : cat === 'strategic' ? 2 : 1;
}

/**
 * CIV6 (City_Culture, the GetNextBuyablePlot scorer): what claiming plot `t`
 * COSTS city `city` — the lowest cost is claimed. Every term is a
 * `PLOT_INFLUENCE_*` GlobalParameter except the 3-ring bound and the
 * neighbours' -1s, which the DLL spells as literals:
 * - distance d to the centre: d · DISTANCE_MULTIPLIER · 2;
 * - a resource the seat can see: RESOURCE_COST within 3 rings; any other
 *   plot pays WATER_COST if water and RING_COST beyond 3 rings;
 * - an improvement: RING_COST on a barbarian outpost, IMPROVEMENT_COST on
 *   any other (a Tribal Village included);
 * - a natural wonder: NW_COST;
 * - YIELD_POINT_COST per point of the plot's yields to the seat;
 * - -1 per UNOWNED neighbour holding a seen resource, -1 per unowned
 *   neighbouring natural wonder, and -1 once more if such a wonder lies
 *   within 3 rings of the centre.
 */
export function borderPlotCost(state: GameState, city: City, t: Tile, yctx: YieldCtx,
  hidden: ReadonlySet<string>, camps: ReadonlySet<number>): number {
  const P = PLOT_INFLUENCE;
  const ctr = state.map.tiles[city.centerIndex];
  const d = hexDistance(state.map, ctr.col, ctr.row, t.col, t.row);
  let cost = d * P.distanceMultiplier * 2;
  if (t.resource !== null && !hidden.has(t.resource)) {
    if (d <= 3) cost += P.resourceCost;
  } else {
    if (isWater(t)) cost += P.waterCost;
    if (d > 3) cost += P.ringCost;
  }
  if (camps.has(t.index)) cost += P.ringCost;
  else if (t.improvement !== null || t.goodyHut) cost += P.improvementCost;
  if (naturalWonderAt(t)) cost += P.nwCost;
  const y = tileYields(yctx, t);
  cost += P.yieldPointCost * (y.food + y.production + y.gold + y.science + y.culture + y.faith);
  let nwNear = false;
  for (const n of neighbors(state.map, t)) {
    if (tileClaimed(n)) continue;
    if (n.resource !== null && !hidden.has(n.resource)) cost -= 1;
    if (naturalWonderAt(n)) {
      cost -= 1;
      if (hexDistance(state.map, ctr.col, ctr.row, n.col, n.row) <= 3) nwNear = true;
    }
  }
  return nwNear ? cost - 1 : cost;
}

/** The plots culture growth would claim next: every candidate at the lowest
 *  `borderPlotCost`, in tile-index order. The game draws one of them. A
 *  candidate is unowned, and the roster's plot rows
 *  (MODIFIER_PLAYER_ADJUST_PLOT_YIELD, COLLECTION_PLAYER_PLOT_YIELDS) pay
 *  only the seat's OWN plots, so the cost reads none of them
 *  (runs/h1_duelw1109 t137-149: Guangzhou's pick skips Auckland's coast). */
export function borderBestPlots(state: GameState, city: City, ctx?: YieldCtx): number[] {
  const own = ctx ?? makeYieldCtx(state, city.seat);
  const yctx: YieldCtx = { ...own, mods: { ...own.mods, plotYields: [] } };
  const hidden = hiddenResourcesFor(state, city.seat);
  const camps = campTiles(state);
  let best = Infinity;
  let out: number[] = [];
  for (const i of borderCandidates(state, city).sort((a, b) => a - b)) {
    const c = borderPlotCost(state, city, state.map.tiles[i], yctx, hidden, camps);
    if (c < best) { best = c; out = [i]; } else if (c === best) out.push(i);
  }
  return out;
}

/** The first of `borderBestPlots`: the plot a gold purchase offers. */
export function pickBorderTile(state: GameState, city: City, ctx?: YieldCtx): number | null {
  return borderBestPlots(state, city, ctx)[0] ?? null;
}

/** CIV6 (the "GetNextBuyablePlot picker"): ONE draw among `borderBestPlots`,
 *  even a single one; null, and no draw, with nothing in reach. */
export function drawBorderPlot(state: GameState, city: City, ctx?: YieldCtx): number | null {
  const ties = borderBestPlots(state, city, ctx);
  if (ties.length === 0) return null;
  return ties[Math.floor(nextRandom(state) * ties.length)];
}

/** A plot joins the city: its owner, and the seat's sight of it. A purchase
 *  is this alone; `acquireTile` is this plus the count the culture cost
 *  climbs on. */
export function claimTile(state: GameState, city: City, tileIndex: number): void {
  setTileOwner(state.map.tiles[tileIndex], city.seat, city.id);
  revealAround(state, city.seat, tileIndex, 1);
}

/** A plot the city takes with its culture (or a minor's envoys): the claim,
 *  and `tilesAcquired` — the `n` of `borderGrowthCost`. */
export function acquireTile(state: GameState, city: City, tileIndex: number): void {
  claimTile(state, city, tileIndex);
  city.tilesAcquired += 1;
}

/** CIV6 (LOC_PLOTINFO_SWAP_TILE_OWNER_TOOLTIP): "Claim this tile to be worked
 *  by this city, instead of your other city. Ownership cannot be swapped if
 *  the tile has a district, a wonder, or is next to the other city's center
 *  tile." — and the Golf Course's and Open-Air Museum's "Tiles with <row>
 *  cannot be swapped" (`noSwap`). The tile must be held by ANOTHER living
 *  city of the claimant's seat. A district under construction and a wonder
 *  site both stand on the plot, so both refuse; a city centre is a district
 *  and is never swapped. The claimant's REACH is measured against the live
 *  game's `CityManager.GetCommandTargets`: the plot lies within its work
 *  radius (3) AND touches a plot the claimant already owns. The swap costs
 *  nothing. `_swap_tile_ok` is the twin. */
export function swapTileOk(state: GameState, city: City, tileIndex: number): boolean {
  const t = state.map.tiles[tileIndex];
  if (!t || tileSeat(t) !== city.seat || tileCity(t) === city.id) return false;
  const loser = citiesOf(state, city.seat).find((c) => c.id === tileCity(t));
  if (!loser) return false;
  if (t.district || t.builtWonder) return false;
  if (t.improvement && IMPROVEMENTS[t.improvement as ImprovementId].noSwap) return false;
  const ctr = state.map.tiles[city.centerIndex];
  if (hexDistance(state.map, ctr.col, ctr.row, t.col, t.row) > CITY_WORK_RADIUS) return false;
  const lc = state.map.tiles[loser.centerIndex];
  if (hexDistance(state.map, lc.col, lc.row, t.col, t.row) <= 1) return false;
  return neighbors(state.map, t).some((n) => tileBelongsTo(n, city));
}

/** The amenity tier's growth percent in the game's 256ths, truncated toward
 *  zero (DLL 0x1b62d0: the percent's 24.8 value over 100, an integer divide). */
export function growth256(factor: number): number {
  return Math.trunc((factor - 1) * 256);
}

/** An EFFECT_ADJUST_CITY_GROWTH percent as the city's growth accumulator
 *  holds it, in 256ths, floored (+15% 38, +20% 51, −20% −52). */
export function growthPct256(factor: number): number {
  return Math.floor((factor - 1) * 256);
}

/** What detaching a growth percent leaves in the accumulator: its attach
 *  plus its detach, −1 where the percent is no whole number of 256ths. */
export function growthDetachResidue(factor: number): number {
  return Math.floor((factor - 1) * 256) + Math.floor((1 - factor) * 256);
}

/** The seat-wide growth percents in 256ths: the Migration Treaty's, then each
 *  wonder's. */
export function empireGrowth256(state: GameState, seat: number): number {
  let n = growthPct256(congressGrowthMult(state, seat));
  for (const c of citiesOf(state, seat)) {
    for (const w of completedWonders(state, c)) {
      if (w.def.effects?.growthAllMult) n += growthPct256(w.def.effects.growthAllMult);
    }
  }
  return n;
}

/** The flat amenities and housing a city's OWN complete wonders pay it — a
 *  regional wonder's amenities reach it through `regionalWondersReaching`. */
function wonderCityFlat(state: GameState, city: City,
  key: 'cityAmenities' | 'cityHousing' | 'routesToCityScience' | 'domesticRoutesToCityFaith'): number {
  let n = 0;
  for (const w of completedWonders(state, city)) {
    if (key === 'cityAmenities' && w.def.effects?.regionalRange) continue;
    n += w.def.effects?.[key] ?? 0;
  }
  return n;
}

/** Amenities from the improvements around a wonder that pays per improvement
 *  (Temple of Artemis counts Camps, Pastures and Plantations within 4). */
function wonderImprovementAmenities(state: GameState, city: City): number {
  let n = 0;
  for (const w of completedWonders(state, city)) {
    const lake = w.def.effects?.amenityPerLake;
    if (lake) {
      const t = state.map.tiles[w.tileIndex];
      for (const near of tilesWithin(state.map, t.col, t.row, lake.range)) if (near.terrain === 'LAKE') n += 1;
    }
    const rule = w.def.effects?.amenityPerImprovement;
    if (!rule) continue;
    const t = state.map.tiles[w.tileIndex];
    for (const near of tilesWithin(state.map, t.col, t.row, rule.range)) {
      if (near.improvement && (rule.improvements as readonly string[]).includes(near.improvement)) n += 1;
    }
  }
  return n;
}

/**
 * What the city's own improvements pay it in amenities, PER INSTANCE — both
 * modifiers adjust the improvement's own amenity, one payment per
 * improvement. CIV6 (SKI_RESORT_AMENITY,
 * MODIFIER_CITY_OWNER_ADJUST_IMPROVEMENT_AMENITY): `amenity`, always.
 * CIV6 (CITY_PARK_WATER_AMENITY, MODIFIER_SINGLE_CITY_ADJUST_IMPROVEMENT_AMENITY
 * behind ADJACENT_TO_WATER_REQUIREMENTS): `amenityAdjacentWater`, for
 * standing beside water — the RING, so a drowned neighbour counts as the sea
 * it now is, and a river edge counts as well (a TEST_ANY over coast, river
 * and lake).
 */
function improvementAmenities(state: GameState, city: City): number {
  let n = 0;
  for (const t of state.map.tiles) {
    if (!t.improvement || t.pillaged || !tileBelongsTo(t, city)) continue;
    const def = IMPROVEMENTS[t.improvement as ImprovementId];
    n += def?.amenity ?? 0;
    const wet = def?.amenityAdjacentWater ?? 0;
    if (wet && (hasRiver(t) || neighbors(state.map, t).some((nb) => isWater(nb)))) n += wet;
  }
  return n;
}

/** The seat's complete REGIONAL wonders whose reach takes in this city's
 *  centre, in catalog order. Measured from the WONDER TILE, not from the
 *  city holding it, on the wonder's own RegionalRange: a Mexico City
 *  suzerain extends the DISTRICT regional effects its Civilopedia line
 *  names, which a wonder's aura is not. */
function regionalWondersReaching(state: GameState, city: City) {
  const center = state.map.tiles[city.centerIndex];
  return seatWonders(state, city.seat).filter((w) => {
    const r = w.def.effects?.regionalRange;
    if (!r) return false;
    const t = state.map.tiles[w.tileIndex];
    return hexDistance(state.map, t.col, t.row, center.col, center.row) <= r;
  });
}

function wonderRegionalAmenities(state: GameState, city: City): number {
  return regionalWondersReaching(state, city).reduce((n, w) => n + (w.def.effects?.cityAmenities ?? 0), 0);
}

/** CIV6 (Disinformation Campaign): "+3 Diplomatic Favor per turn for each
 *  Broadcast Center" — the card names a building and pays per copy standing. */
export function cardFavorPerBuilding(state: GameState, seat: number): number {
  const rows = getModifiers(state, seat).favorPerBuilding;
  if (rows.length === 0) return 0;
  let n = 0;
  for (const c of citiesOf(state, seat)) {
    for (const r of rows) if (c.buildings.includes(r.building)) n += r.favor;
  }
  return n;
}

/** CIV6 (MODIFIER_PLAYER_RELIGION_ADD_RELIGIOUS_BELIEF_YIELD): the beliefs'
 *  yields the PLAYER takes, in no city — per follower and per city following
 *  (`beliefSeatYields`), each completed district of a type the belief names
 *  (Lay Ministry) and each city holding a completed World Wonder (Sacred
 *  Places), counted over the belief seat's own cities. */
export function beliefSeatYields(state: GameState, seat: number, m: Modifiers): Yields {
  const out = emptyYields();
  addYields(out, m.beliefSeatYields);
  const perD = Object.entries(m.beliefPerDistrict) as [DistrictId, Partial<Yields>][];
  const perW = Object.keys(m.beliefPerWonderCity).length > 0;
  if (!perD.length && !perW) return out;
  for (const c of citiesOf(state, seat)) {
    for (const [type, y] of perD) {
      const n = c.districts.filter((d) => d.type === type && state.map.tiles[d.tileIndex].districtComplete).length;
      if (n) addYields(out, y, n);
    }
    if (perW && completedWonders(state, c).length > 0) addYields(out, m.beliefPerWonderCity);
  }
  return out;
}

/**
 * A civ's ERA INDEX — the highest era among its completed techs
 * and civics (real Civ 6 advances a civ's era with its research). Used only
 * by wonder tourism, which pays "1 for each era you have advanced PAST the
 * era in which that wonder was first available", so wonder era and civ era
 * must be measured on the SAME scale. 0 (Ancient) when nothing is done.
 */
export function civEraIndex(techIds: readonly string[], civicIds: readonly string[]): number {
  let e = 0;
  for (const id of techIds) {
    const i = ERAS.indexOf(TECHS[id]?.era);
    if (i > e) e = i;
  }
  for (const id of civicIds) {
    const i = ERAS.indexOf(CIVICS[id]?.era);
    if (i > e) e = i;
  }
  return e;
}

function wonderEraIndex(id: string): number {
  const def = BUILT_WONDERS[id];
  if (!def) return 0;
  if (def.requiresTech) return Math.max(0, ERAS.indexOf(TECHS[def.requiresTech]?.era));
  if (def.requiresCivic) return Math.max(0, ERAS.indexOf(CIVICS[def.requiresCivic]?.era));
  return 0;
}

/**
 * The per-turn TOURISM a civ's COMPLETED wonders generate. Real
 * Civ 6: each wonder is worth 2 Tourism plus 1 for every era the owner has
 * advanced past the wonder's own era.
 */
function wonderTourism(
  state: GameState,
  era: number,
  owns: (t: Tile) => boolean,
  govCities: ReadonlySet<number> | null,
  // CIV6 (France, EFFECT_ADJUST_CITY_TOURISM): "Tourism from wonders of any
  // era is +100%" — the WONDER half only, which is what this body is
  // (`WONDER_TOURISM_ROWS`). Required, not defaulted: the one caller knows
  // the seat and a silent 0 would read as "France has no bonus".
  rosterPct: number,
): number {
  let t = 0;
  for (const tile of state.map.tiles) {
    if (!tile.builtWonder || !tile.builtWonderComplete || !owns(tile)) continue;
    const base = WONDER_TOURISM_BASE + Math.max(0, era - wonderEraIndex(tile.builtWonder));
    const wished = govCities?.has(tile.ownerCity ?? -1)
      ? Math.floor((base * WISH_WONDER_TOURISM_NUM) / WISH_WONDER_TOURISM_DEN)
      : base;
    t += rosterPct ? Math.floor((wished * (100 + rosterPct)) / 100) : wished;
  }
  return t;
}

/**
 * CIV6: the Batey "provides Tourism after researching Flight" and the
 * Colossal Heads "provide Tourism from Faith after researching Flight" — in
 * both cases equal to the improvement's own output of the named yield, which
 * is what the tile walk already computes. A row with no tech gate (the
 * Seastead's Culture) pays from the start.
 */
function suzerainTourism(state: GameState, seat: number, owns: (t: Tile) => boolean): number {
  const techs = seatOf(state, seat)?.research.techs ?? [];
  const ctx = makeYieldCtx(state, seat);
  let t = 0;
  for (const tile of state.map.tiles) {
    if (!tile.improvement || tile.pillaged || !owns(tile)) continue;
    const def = IMPROVEMENTS[tile.improvement as ImprovementId];
    if (!def.tourismFrom || (def.tourismTech && !techs.includes(def.tourismTech))) continue;
    const base = def.yields[def.tourismFrom] ?? 0;
    t += base + (improvementAdjacency(ctx, tile, def.id)[def.tourismFrom] ?? 0);
  }
  return t;
}

/** CIV6 (`Improvement_Tourism` TOURISMSOURCE_APPEAL): Tourism equal to the
 *  plot's Appeal, floored at 0, from every row that names it (the Seaside
 *  and Ski Resorts). CIV6 (CRISTOREDENTOR_BEACHTOURISM, ImprovementType
 *  IMPROVEMENT_BEACH_RESORT): the beach multiplier scales the Seaside Resort's alone. */
function resortTourism(state: GameState, owns: (t: Tile) => boolean, beachMult: number): number {
  let t = 0;
  const camps = campTiles(state);
  const gpa = cityAppealResolver(state);
  for (const tile of state.map.tiles) {
    if (!tile.improvement || tile.pillaged || !owns(tile)) continue;
    if (!IMPROVEMENTS[tile.improvement as ImprovementId]?.tourismFromAppeal) continue;
    t += Math.max(0, tileAppeal(state.map, tile, camps, gpa)) * (tile.improvement === 'SEASIDE_RESORT' ? beachMult : 1);
  }
  return t;
}

/** The product of one wonder-effect multiplier over a seat's complete
 *  wonders, in CATALOG order so both engines fold it the same way. */
function wonderMult(state: GameState, cities: readonly City[], key: 'religiousTourismMult' | 'resortTourismMult'): number {
  let m = 1;
  for (const c of cities) for (const w of completedWonders(state, c)) m *= w.def.effects?.[key] ?? 1;
  return m;
}

/** Does this city hold a National Park? The ANCHOR tile names the cluster,
 *  which is the same test `parkAmenities` pays on. */
export function cityHasPark(state: GameState, city: City): boolean {
  for (const tile of state.map.tiles) {
    if ((tile.park ?? -1) !== tile.index) continue;
    if (tileSeat(tile) === city.seat && tile.ownerCity === city.id) return true;
  }
  return false;
}

/**
 * The AMENITIES a seat's National Parks pay this city. CIV6: a park
 * gives "2 Amenities to the city that owns it and 1 Amenity to the four
 * closest cities in your empire" — closest by centre-tile hex distance to the
 * park, ties by city id, and the OWNING city never double-dips as one of the
 * four. A park is four tiles; the CLUSTER pays once, so the payout is keyed
 * on the park tile with the LOWEST index in each owning-city group.
 */
export function parkAmenities(state: GameState, city: City): number {
  const cities = citiesOf(state, city.seat);
  if (cities.length === 0) return 0;
  let have = 0;
  for (const tile of state.map.tiles) {
    // ONE payout per park, taken at its ANCHOR — the tile that names the
    // cluster. Two parks side by side stay two parks.
    if ((tile.park ?? -1) !== tile.index || tileSeat(tile) !== city.seat) continue;
    const ownerId = tile.ownerCity;
    if (ownerId === city.id) have += PARK_AMENITIES_OWNER;
    const near = cities
      .filter((c) => c.id !== ownerId)
      .map((c) => ({ c, d: hexDistance2(state, c.centerIndex, tile.index) }))
      .sort((a, b) => a.d - b.d || a.c.id - b.c.id)
      .slice(0, PARK_AMENITY_CITIES);
    if (near.some((n) => n.c.id === city.id)) have += PARK_AMENITIES_NEAR;
  }
  return have;
}

function hexDistance2(state: GameState, a: number, b: number): number {
  const ta = state.map.tiles[a];
  const tb = state.map.tiles[b];
  if (!ta || !tb) return 1 << 20;
  return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
}

/** CIV6: a National Park "provides Tourism equal to the total Appeal of
 *  all the tiles included in it" — read LIVE, so an appeal-lowering
 *  neighbour moves the park's payout (and can take it negative). */
function parkTourism(state: GameState, owns: (t: Tile) => boolean): number {
  let t = 0;
  const camps = campTiles(state);
  const gpa = cityAppealResolver(state);
  for (const tile of state.map.tiles) {
    if ((tile.park ?? -1) < 0 || !owns(tile)) continue;
    t += tileAppeal(state.map, tile, camps, gpa);
  }
  return t;
}

/** The Great Person DISTRICT tourism: CIV6 (Jamsetji Tata / Masaru Ibuka)
 *  +10 per complete Campus / Industrial Zone the seat holds, and (Kenzo
 *  Tange) a city's district adjacency bonuses as Tourism. A pillaged
 *  district is dark, as it is for every district yield. */
export function gpDistrictTourism(state: GameState, seat: number, cities: readonly City[]): number {
  const s = seatOf(state, seat);
  const campus = gpPermOf(s, 'campusTourism');
  const iz = gpPermOf(s, 'izTourism');
  let t = 0;
  let ctx: YieldCtx | undefined;
  for (const c of cities) {
    const adjPct = gpCityPermOf(c, 'adjTourism');
    for (const d of c.districts) {
      const tile = state.map.tiles[d.tileIndex];
      if (!tile.districtComplete || tile.districtPillaged) continue;
      if (d.type === 'CAMPUS') t += campus;
      else if (d.type === 'INDUSTRIAL_ZONE') t += iz;
      // CIV6 (World Games): per Stadium / Aquatics Center standing on its district
      for (const b of GP_BUILDING_TOURISM) {
        if (d.type === b.district && c.buildings.includes(b.building) && !buildingPillaged(c, b.building)) t += gpPermOf(s, b.perm);
      }
      const y = DISTRICTS[d.type].adjacencyYield;
      if (!adjPct || !y) continue;
      ctx ??= makeYieldCtx(state, seat);
      const adj = effectiveAdjacency(ctx, tile, d.type, buildingVariantAdjacency(ctx.mods.civ, c, d.type));
      t += Math.floor((adj * (GP_ADJ_TOURISM_PCT[y] ?? 0)) / 100);
    }
  }
  return t;
}

/** The Tourism a building pays its city: flat on its own district (Ferris
 *  Wheel, Shopping Mall — `BuildingDef.tourism`), and once the seat holds a
 *  civic (Conservation's walls and Arena — `BuildingDef.civicTourism`); and a unique building's —
 *  CIV6 (Marae, MARAE_TOURISM_FEATURES; Thermal Bath, THERMALBATH_ADDTOURISM)
 *  per owned tile carrying a feature (EFFECT_ADJUST_CITY_TOURISM_PER_FEATURE
 *  names no passability) once Flight is held, or flat while the border holds
 *  a Geothermal Fissure. A dark building (its district or itself pillaged)
 *  pays nothing. */
export function buildingTourism(state: GameState, seat: number, cities: readonly City[]): number {
  const civ = civOf(state, seat);
  const techs = seatOf(state, seat)?.research.techs ?? [];
  const civics = seatOf(state, seat)?.research.civics ?? [];
  let t = 0;
  for (const c of cities) {
    const dark = darkBuildings(state.map, c);
    for (const id of c.buildings) {
      if (dark.has(id)) continue;
      t += BUILDINGS[id]?.tourism ?? 0;
      const ct = BUILDINGS[id]?.civicTourism;
      if (ct && civics.includes(ct.civic)) t += ct.amount;
      const bv = buildingVariantFor(civ, id);
      if (!bv) continue;
      const pf = bv.tourismPerFeature;
      if (pf && (!pf.tech || techs.includes(pf.tech))) {
        let n = 0;
        for (const tile of state.map.tiles) {
          if (tileSeat(tile) !== seat || tile.ownerCity !== c.id) continue;
          if (tile.feature !== null) n += 1;
        }
        t += pf.amount * n;
      }
      const wf = bv.tourismWithFeature;
      if (wf && cityHasFeature(state, c, wf.feature)) t += wf.amount;
    }
  }
  return t;
}

/** CIV6 (MODIFIER_PLAYER_ADJUST_TOURISM, `TOURISM_PCT_ROWS`): the percent the
 *  seat's research adds to every city's Tourism. `_seat_tourism_pct` is the
 *  twin. */
export function seatTourismPct(state: GameState, seat: number): number {
  const r = seatOf(state, seat)?.research;
  if (!r) return 0;
  let pct = 0;
  for (const x of TOURISM_PCT_ROWS) {
    if ((x.tech && r.techs.includes(x.tech)) || (x.civic && r.civics.includes(x.civic))) pct += x.pct;
  }
  return pct;
}

/** a city's half of its Tourism raised by the seat's percent, floored
 *  (GetTourism: each half per city, 1108 China t223: Computers' 25% on 46,
 *  40, 26, 20, 8 and 7 reads 57, 50, 32, 25, 10 and 8) */
const raisedTourism = (t: number, pct: number): number => (pct ? Math.floor((t * (100 + pct)) / 100) : t);

/** The GENERAL half of a seat's per-turn tourism: each city's own, raised by
 *  the seat's percent (`seatTourismPct`) — with none, the seat's whole sum. */
export function seatTourism(
  state: GameState,
  seat: number,
  govCityIds?: ReadonlySet<number>,
): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  const cities = citiesOf(state, seat);
  const pct = seatTourismPct(state, seat);
  if (!pct) return tourismOf(state, s, cities, cities, (tile: Tile) => tileOwnedByCiv(tile, seat), govCityIds);
  let t = 0;
  for (const c of cities) {
    t += raisedTourism(tourismOf(state, s, [c], cities, (tile: Tile) => tileBelongsTo(tile, c), govCityIds), pct);
  }
  return t;
}

/** The RELIGIOUS half one city makes: its relics (its own wonder multiplier)
 *  and the Holy Cities it holds. */
function cityReligiousTourism(state: GameState, city: City): number {
  let t = relicTourism(state, city, congressGwMult(state)) * wonderMult(state, [city], 'religiousTourismMult');
  for (const g of state.seats) {
    if (g.religion.founded && g.religion.holyTile === city.centerIndex) t += HOLY_CITY_TOURISM;
  }
  return t;
}

/** One city's share of its seat's tourism, both halves: what its works,
 *  districts, buildings and plots make, its relics and a Holy City it holds,
 *  each half raised by the seat's percent (the game's per-city GetTourism). */
export function cityTourism(state: GameState, city: City): number {
  const s = seatOf(state, city.seat);
  if (!s) return 0;
  const pct = seatTourismPct(state, city.seat);
  return raisedTourism(tourismOf(state, s, [city], citiesOf(state, city.seat), (tile: Tile) => tileBelongsTo(tile, city)), pct)
    + raisedTourism(cityReligiousTourism(state, city), pct);
}

/** CIV6 (Film Studio, FILMSTUDIO_ENHANCEDLATETOURISM): the EXTRA a seat
 *  sends to each civilization in the Modern era or later — `pct` of the
 *  tourism each city holding the row makes on its own (its works, its
 *  districts and buildings, its tiles), floored per city. Null when no
 *  standing row carries the clause. Banked per rival beside the national
 *  output (`bankTourismPerRival`), never in the national figure. */
export function lateEraTourism(
  state: GameState,
  seat: number,
  govCityIds?: ReadonlySet<number>,
): { extra: number; minEra: number } | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  const civ = civOf(state, seat);
  const cities = citiesOf(state, seat);
  let extra = 0;
  let minEra = -1;
  for (const c of cities) {
    const dark = darkBuildings(state.map, c);
    for (const id of c.buildings) {
      if (dark.has(id)) continue;
      const lt = buildingVariantFor(civ, id)?.lateEraTourism;
      if (!lt) continue;
      const era = ERAS.indexOf(lt.minEra);
      minEra = minEra < 0 ? era : Math.min(minEra, era);
      const own = tourismOf(state, s, [c], cities, (tile: Tile) => tileBelongsTo(tile, c), govCityIds);
      extra += Math.floor(own * lt.pct / 100);
    }
  }
  return minEra < 0 ? null : { extra, minEra };
}

/** The general tourism made by `cities` (their works, districts and
 *  buildings) and by the tiles `owns` admits; `allCities` carries the
 *  seat-wide wonder multipliers whichever cities are summed. */
function tourismOf(
  state: GameState,
  s: Seat,
  cities: readonly City[],
  allCities: readonly City[],
  owns: (t: Tile) => boolean,
  govCityIds?: ReadonlySet<number>,
): number {
  const seat = s.seat;
  let t = 0;
  const printing = s.research.techs.includes(GW_PRINTING_TECH);
  const km = congressGwMult(state);
  for (const c of cities) {
    // CIV6 (Curator): "+100% Tourism from Great Works in this city."
    t += greatWorkTourism(state, c, printing, km) * governorMult(state, c, (e) => e.gwTourismMult);
  }
  const era = civEraIndex(s.research.techs, s.research.civics);
  // CIV6 (Wish You Were Here, Golden face): "+100% Tourism to all National
  // Parks", and "Cities with Governors receive 50% Tourism from World
  // Wonders". `govCityIds` is the caller's loop-top governor seating — the
  // same snapshot the loyalty payout used, taken before any loyalty moved.
  const golden = goldenDedication(state, seat, DED_WISH);
  const parkMult = golden ? WISH_PARK_TOURISM_MULT : 1;
  return t + suzerainTourism(state, seat, owns) + gpDistrictTourism(state, seat, cities) + buildingTourism(state, seat, cities)
    + resortTourism(state, owns, wonderMult(state, allCities, 'resortTourismMult'))
    + parkTourism(state, owns) * parkMult
    + wonderTourism(state, era, owns, golden ? govCityIds ?? null : null,
                    getModifiers(state, seat).wonderTourismPct);
}

/** CIV6 (Tourism): the RELIGIOUS half of a seat's per-turn tourism — "Relics
 *  generate Religious Tourism" and "Holy Cities generate +8 Religious Tourism
 *  per turn" — banked apart (`Seat.tourismReligious`) because a rival's
 *  Enlightenment or a different religion halves THIS half at the read
 *  (`cultureVictor`), never the general half. St. Basil's multiplier is the
 *  HOLDING city's, and a religion's Holy City pays its CURRENT owner; each
 *  city's half raised by the seat's percent. */
export function seatTourismReligious(state: GameState, seat: number): number {
  const pct = seatTourismPct(state, seat);
  let t = 0;
  for (const c of citiesOf(state, seat)) t += raisedTourism(cityReligiousTourism(state, c), pct);
  return t;
}

/**
 * CIV6 (Tourism, "International Modifiers"): "After national modifiers have
 * been applied to generate the national Tourism output, further modifiers
 * affect the output to each individual civilization. International Modifiers
 * are SUMMED (not compounded) and calculated per each foreign civilization."
 *
 * The percent `from` sends toward `to`: +25% Open Borders, +25% for an
 * international Trade Route, +50% more for a route with Online Communities,
 * and the different-government penalty (0 when the two run the same one).
 * The religious half adds its own two halvings at the accrual site.
 */
export function tourismIntlPct(state: GameState, from: number, to: number): number {
  let pct = 0;
  if (borderTurnsFrom(state, to, from) > 0) pct += TOURISM_OPEN_BORDERS_PCT;
  const routed = (seatOf(state, from)?.tradeRoutes ?? []).some((r) => r.toSeat === to);
  // CIV6 (Sarah Breedlove): "+25% Tourism from Trade Routes", the card's channel
  if (routed) pct += TOURISM_ROUTE_PCT + getModifiers(state, from).tourismRouteBonus + gpPermOf(seatOf(state, from), 'tourismRouteBonus');
  const ga = seatGovernment(state, from);
  const gb = seatGovernment(state, to);
  if (ga !== gb) {
    pct -= ((GOV_INTOLERANCE[ga ?? ''] ?? 0) + (GOV_INTOLERANCE[gb ?? ''] ?? 0)) * TOURISM_GOV_MULT;
  }
  return pct;
}

export function computeCityStats(
  state: GameState,
  city: City,
  luxMap?: Map<number, number>,
  mods?: Modifiers,
  /**
   * Store this walk's worked-tile pick on the city. FALSE for every
   * caller but `seatPhase`'s read after the productions, the one each city
   * grows, claims and takes its loyalty on: `computeCityStats` is a pure read
   * that other rules call at other points in the turn, and a pick recorded
   * from the SCORE walk would be the post-growth one. One writer, so the
   * stored pick is the pick the turn actually used.
   */
  record = false,
): CityStats {
  const base = mods ?? getModifiers(state, city.seat);
  const m = withGovernor(state,
    withFollowerBelief(state, base, followerReligionsForCity(base, city)), city);
  const ctx = makeYieldCtx(state, city.seat, m);
  const map = state.map;
  const wonders = completedWonders(state, city);

  const specialists = effectiveSpecialists(state, city);
  let specialistTotal = 0;
  for (const n of specialists.values()) specialistTotal += n;

  const worked = workedTilesOf(state, city, ctx, specialistTotal);
  // the pick this walk MADE, kept where the census can read it. Never a
  // recomputation, and never from a second caller: the city's growth lands
  // after its last read of the turn, so a fresh call would answer for a city
  // the turn did not run on.
  if (record) city.workedTiles = worked;

  const tiles = emptyYields();
  const plotBonus = cityPlotBonus(state, city);
  addYields(tiles, cityCentreYields(state, city, ctx, plotBonus));
  for (const i of worked) {
    addYields(tiles, tileYields(ctx, map.tiles[i]));
    plotBonus(map.tiles[i], false, tiles);
  }

  const districts = cityDistrictYields(ctx, city);
  // CIV6 (GS Civilopedia, Free Inquiry, Golden face): "Commercial Hub and
  // Harbor district's Gold adjacency bonus provides Science as well."
  if (goldenDedication(state, city.seat, DED_FREE_INQUIRY)) {
    for (const d of city.districts) {
      if (d.type !== 'COMMERCIAL_HUB' && d.type !== 'HARBOR') continue;
      const t = map.tiles[d.tileIndex];
      if (!t.districtComplete || t.districtPillaged) continue;
      districts.science += effectiveAdjacency(ctx, t, d.type);
    }
  }
  // CIV6 (Heartbeat of Steam, Golden face): "Campus district's Science
  // adjacency bonus provides Production as well."
  if (goldenDedication(state, city.seat, DED_STEAM)) {
    for (const d of city.districts) {
      if (d.type !== 'CAMPUS') continue;
      const t = map.tiles[d.tileIndex];
      if (!t.districtComplete || t.districtPillaged) continue;
      districts.production += effectiveAdjacency(ctx, t, 'CAMPUS');
    }
  }
  // CIV6 (Hildegard of Bingen): "This Holy Site district's Faith adjacency
  // bonus provides Science as well" — the district the charge was spent on
  for (const d of city.districts) {
    if (d.type !== 'HOLY_SITE') continue;
    const t = map.tiles[d.tileIndex];
    if (!t.districtComplete || t.districtPillaged || !gpTilePermOf(t, 'faithAdjScience')) continue;
    districts.science += effectiveAdjacency(ctx, t, 'HOLY_SITE');
  }
  for (const [tileIndex, n] of specialists) {
    const inst = city.districts.find((d) => d.tileIndex === tileIndex);
    const y = inst ? specialistYields(inst.type, city.buildings) : undefined;
    if (y) addYields(districts, y, n);
  }
  const buildings = cityBuildingYields(ctx, city, city.powered ?? false);
  addYields(buildings, buildingEraYields(state, city));
  const regional = regionalEffects(
    state, city, governorFlag(state, city, (e) => e.industryAllSources));
  addYields(buildings, regional.yields);
  for (const w of regionalWondersReaching(state, city)) {
    if (w.def.cityYields) addYields(buildings, w.def.cityYields);
  }
  for (const w of wonders) {
    if (w.def.cityYields && !w.def.effects?.regionalRange) addYields(buildings, w.def.cityYields);
    // CIV6 (Ruhr Valley): "+1 Production for each Mine and Quarry in this
    // city" — the improvements on the tiles this city OWNS, a pillaged one
    // producing nothing.
    const perImp = w.def.effects?.cityYieldPerImprovement;
    if (!perImp) continue;
    let n = 0;
    for (const t of map.tiles) {
      if (!tileBelongsTo(t, city) || t.pillaged || !t.improvement) continue;
      if ((perImp.improvements as readonly string[]).includes(t.improvement)) n += 1;
    }
    if (n) addYields(buildings, perImp.yields, n);
  }
  if (m.faithPerWonder > 0) buildings.faith += m.faithPerWonder * wonders.length;
  // the Great Works held here, a themed holder's paying twice
  const gwy = greatWorkYields(state, city);
  buildings.culture += gwy.culture;
  // Golden PEN_BRUSH_AND_VOICE — +1 Culture per SPECIALTY district, from
  // THIS CITY'S OWNER's dedication, which is the row the GPU reads. Every
  // EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT row (this one, the governor's
  // Faith, Digital Democracy's Culture) counts the live specialty districts:
  // a pillaged one pays nothing (runs/h1_duelw1108, Xi'an t104: Moksha's 2
  // Faith a district on its Holy Site and Theater Square alone, its Campus
  // pillaged — 9 Faith before its tier, not 11)
  buildings.culture += goldenCulturePerDistrict(state, city.seat) * liveSpecialtyCount(state, city);
  buildings.faith += gwy.faith;
  // CIV6 (Leonardo da Vinci, Hypatia, Newton, Einstein, James Watt;
  // `GP_BUILDING_YIELDS`): a spent Great Person's add to one building's own
  // yield, paid by each lit copy standing here — a REGIONAL building's add
  // stays in its own city (runs/h1_duelw1109 t183: Watt built Rome's Factory,
  // whose reach paid Arretium, Antium and Setia +3 Production and no more)
  const gpOwner = seatOf(state, city.seat);
  const gpDark = darkBuildings(map, city);
  for (const r of GP_BUILDING_YIELDS) {
    const n = gpPermOf(gpOwner, r.perm);
    if (!n || !city.buildings.includes(r.building) || gpDark.has(r.building)) continue;
    buildings[r.yield] += n;
  }
  // CIV6 (Monument): "+1 additional Culture if city is at maximum Loyalty."
  if ((city.loyalty ?? LOYALTY_MAX) >= LOYALTY_MAX) {
    for (const b of city.buildings) if (BUILDINGS[b]?.special === 'MONUMENT') buildings.culture += 1;
  }
  // CIV 6, Anshan's suzerain: "+2 Science from each Great Work of Writing.
  // +1 Science from each Relic and Artifact."
  const byObj = gwCountsByObj(city);
  if (suzerainEffect(state, city.seat, 'worksScience')) {
    buildings.science += ANSHAN_WRITING_SCIENCE * byObj[GWO_WRITING]!
      + ANSHAN_RELIC_SCIENCE * (byObj[GWO_RELIC]! + byObj[GWO_ARTIFACT]!);
  }
  // CIV6 (EFFECT_ADJUST_CITY_GREATWORK_YIELD): the roster's per-work rows
  // (`GREAT_WORK_YIELD_ROWS`), per work of the row's object type held here
  for (const r of ctx.mods.greatWorkYields) buildings[r.yield] += r.amount * byObj[r.obj]!;

  const trade = cityTradeYields(state, city);

  const citizens = emptyYields();
  citizens.science = city.population * CITIZEN_SCIENCE;
  citizens.culture = city.population * CITIZEN_CULTURE;

  const bonuses = emptyYields();
  addYields(bonuses, m.cityYields);
  if (city.isCapital) addYields(bonuses, m.capitalYields);
  // CIV6 (Autocracy): "+1 to all yields for each Government Plaza building,
  // Diplomatic Quarter building, and palace in a city."
  if (m.yieldsPerGovBuilding) {
    const n = m.yieldsPerGovBuilding * govYieldBuildingCount(state, city);
    for (const k of YIELD_KEYS) bonuses[k] += n;
  }
  // per-CITIZEN yields: a governor's Tax Collector, Connoisseur and
  // Researcher, and the two governments that pay by citizen in a governed
  // city. Flat adds, so they ride the multipliers below like every bonus.
  for (const k of Object.keys(m.perCitizen) as YieldKey[]) {
    bonuses[k] = (bonuses[k] ?? 0) + city.population * (m.perCitizen[k] ?? 0);
  }
  if (m.faithPerSpecialty) {
    bonuses.faith += m.faithPerSpecialty * liveSpecialtyCount(state, city);
  }
  // CIV6 (Digital Democracy, EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT): "+2
  // Culture per Specialty District"
  for (const k of Object.keys(m.yieldPerSpecialty) as YieldKey[]) {
    const n = m.yieldPerSpecialty[k] ?? 0;
    if (n) bonuses[k] += n * liveSpecialtyCount(state, city);
  }
  // CIV6 (Land Acquisition): "+3 Gold per turn from each foreign Trade
  // Route passing through the city" — another seat's route, a city-state's
  // included, whose stored course reaches this centre past its origin: a
  // route ENDING here passes through too (runs/h1_duelw1109: Reyna's
  // Shenyang t120-130 and Beijing t136+ each +3 from one minor's route in).
  const perPass = governorSum(state, city, (e) => e.passRouteGold);
  if (perPass) {
    let n = 0;
    for (const sx of [...state.seats, ...(state.cityStates ?? [])]) {
      if (sx.seat === city.seat) continue;
      for (const r of sx.tradeRoutes ?? []) {
        if ((r.course ?? []).slice(1).includes(city.centerIndex)) n += 1;
      }
    }
    bonuses.gold += perPass * n;
  }
  // CIV6 (Industrialist, Renewable Subsidizer): the named buildings' own
  // extra yields while the governor holds the promotion
  addYields(bonuses, governorBuildingYields(state, city));
  // CIV6 (University of Sankore): "+2 Science for every Trade Route to this
  // city. Domestic Trade Routes give an additional +1 Faith to this city."
  const perIn = wonderCityFlat(state, city, 'routesToCityScience');
  const perDom = wonderCityFlat(state, city, 'domesticRoutesToCityFaith');
  if (perIn || perDom) {
    let all = 0;
    let dom = 0;
    for (const sx of state.seats) {
      for (const r of sx.tradeRoutes ?? []) {
        if (sx.seat === city.seat ? r.to === city.id
          : r.toSeat === city.seat && r.toSeatCity === city.id) {
          all += 1;
          if (sx.seat === city.seat) dom += 1;
        }
      }
    }
    bonuses.science += perIn * all;
    bonuses.faith += perDom * dom;
  }
  // CIV6 (Industrial / Militaristic envoys, ADJUST_*_PRODUCTION): the flat
  // toward the item at the head of the queue is the city's Production as
  // the game reads it (City:GetYield), under the city's percents
  // (runs/h1_duelw1108, Xi'an: 10 at t25 building an Archer with one envoy
  // in Militaristic Wolin where its plots, Palace and Urban Planning pay 9;
  // 14.4 at t95, (15 + 1) x 0.9 at its tier)
  if (city.queue[0]) bonuses.production += cityStateItemProduction(state, city, city.queue[0].kind);
  // CIV6 (Project_YieldConversions): the yield the last production step
  // converted from a district project, under the city's percents
  // (runs/h1_duelw1108, Aquileia t112-125: Campus Research Grants on 9.9
  // Production read 7.625 Science, (7 + 15% x 9.9) x 0.9 Displeased)
  if (city.projectYield) bonuses[city.projectYield.key] += city.projectYield.amount;

  const hParts = housingParts(state, city, m);
  const housing = hParts.reduce((a, b) => a + b, 0);
  // THE RANKING BASE — everything `luxuryAmenities` ranks cities on, and the
  // one split point both engines share. Named so the amenity log can print
  // it: a disagreement here is a different sum, a disagreement in `lux`
  // alone is a different allocation of the same one.
  const { have: amenBase, ww: wwLoss } = nonLuxuryAmenities(state, city, m, regional.amenities);
  const have = amenBase + ((luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0);
  const needed = amenitiesNeeded(city.population);
  const balance = have - needed;
  const tier = amenityTier(balance);
  const dl = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (dl && record) {
    dl.push(`c:${city.seat}:${city.id} base${amenBase} lux${(luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0}`
      + ` ww${wwLoss} have${have} need${needed} bal${balance}`
      + ` tier${amenityTierIndex(tier.name)}`
      // the COMPLETE specialty count this city carries: a governor's
      // `faithPerSpecialty` pays one faith a turn off it, so a count one
      // apart is an exact one-faith drift with no other symptom.
      + ` spec${liveSpecialtyCount(state, city)}`);
  }
  // the tier this walk RAN ON, kept where the census can read it — never a
  // recomputation, for the same reason `workedTiles` is not one: the city's
  // growth lands after its last read and moves what a fresh call would
  // answer.
  if (record) city.amenityTier = amenityTierIndex(tier.name);

  const total = emptyYields();
  addYields(total, tiles);
  addYields(total, districts);
  addYields(total, buildings);
  addYields(total, citizens);
  addYields(total, bonuses);
  addYields(total, trade);
  // CIV6 (Ibn Khaldun, MODIFIER_PLAYER_CITIES_ADJUST_HAPPINESS_YIELD_BAB): the
  // seat's percent on every non-Food yield at the Happy / Ecstatic tier
  const gpHappy = tier.name === 'Happy' ? gpPermOf(seatOf(state, city.seat), 'happyYieldPct')
    : tier.name === 'Ecstatic' ? gpPermOf(seatOf(state, city.seat), 'ecstaticYieldPct') : 0;
  // CIV6 (GameAttribute::Value 0xaa740, the city yield's attribute): ONE
  // modifier per yield, value = base + base x modifier / 100 — every percent
  // on a city's yield (its amenity tier's, the cards', the governor's, the
  // wonders') SUMS into it (runs/h1_duelw1108, Handan at t105: 12.5 Science
  // reads 13.125, x 1.05 = -10% Displeased + 15% Librarian, not x 0.9 x 1.15)
  const pct = emptyYields();
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as YieldKey[]) {
    pct[k] += tier.yieldFactor - 1;
    // CIV6 (EFFECT_ADJUST_CITY_HAPPINESS_YIELD): the roster's per-tier rows
    // (`HAPPY_YIELD_ROWS`)
    for (const r of m.happyYields) if (r.tier === tier.name && r.yield === k) pct[k] += r.pct / 100;
    pct[k] += gpHappy / 100;
    // CIV6 (Toqui, EFFECT_ADJUST_CITY_YIELD_MODIFIER): the roster's rows for a
    // city with an ESTABLISHED governor, tripled in one this seat did not found
    if (m.governorYields.length && cityGovernorEffects(state, city).length > 0) {
      const founded = (city.founderSeat ?? city.seat) === city.seat;
      for (const r of m.governorYields) if (r.yield === k && r.founded === founded) pct[k] += r.pct / 100;
    }
    // CIV6 (Hwarang, EFFECT_ADJUST_CITY_YIELD_MODIFIER_PER_GOVERNOR_TITLE):
    // "+3% ... for each Promotion they have earned, including their first"
    if (m.governorTitleYields.length) {
      const titles = cityGovernorTitles(state, city);
      if (titles > 0) for (const r of m.governorTitleYields) if (r.yield === k) pct[k] += (r.pct * titles) / 100;
    }
    // CIV6 (Righteousness of the Faith): the worship building this row holds
    // adds to the city's Science, Faith and Culture
    if (m.worship.length && (k === 'science' || k === 'faith' || k === 'culture')
      && city.buildings.some((b) => BUILDINGS[b]?.worship === true)) {
      for (const r of m.worship) pct[k] += r.yieldPct / 100;
    }
  }
  for (const k of Object.keys(m.yieldMult) as YieldKey[]) {
    pct[k] += (m.yieldMult[k] ?? 1) - 1;
    // CIV6 (Monasticism): "+75% Science in cities with a Holy Site";
    // (Robber Barons): "+50% Gold in cities with a Stock Exchange. +25%
    // Production in cities with a Factory." Each names one city FACT, so the
    // percent pays only where that fact stands.
    for (const r of m.districtYieldMult) {
      if (r.yield === k && city.districts.some((d) => d.type === r.district
        && state.map.tiles[d.tileIndex].districtComplete
        && !state.map.tiles[d.tileIndex].districtPillaged)) pct[k] += r.mult - 1;
    }
    for (const r of m.buildingYieldMult) {
      if (r.yield === k && city.buildings.includes(r.building)) pct[k] += r.mult - 1;
    }
  }
  // Each seat wonder: its own city's percent where it stands here, and its
  // empire-wide one.
  for (const w of seatWonders(state, city.seat)) {
    const mine = wonders.some((x) => x.idx === w.idx);
    for (const mult of [mine ? w.def.effects?.cityYieldMult : undefined, w.def.effects?.empireYieldMult]) {
      if (!mult) continue;
      for (const k of Object.keys(mult) as YieldKey[]) pct[k] += (mult[k] ?? 1) - 1;
    }
  }
  for (const k of YIELD_KEYS) total[k] *= 1 + pct[k];
  const maintenance = cityMaintenance(state, city);
  total.gold -= maintenance;

  const foodSurplus = total.food - city.population * FOOD_PER_CITIZEN;
  let effective = foodSurplus;
  if (foodSurplus > 0) {
    // CIV6 (City:GetOverallGrowthModifier, DLL 0x1b62d0): one modifier in
    // the game's 1/256 fixed point — 256, plus the amenity tier's percent
    // truncated to 256ths, plus the city's growth accumulator (0x1b6180: each
    // EFFECT_ADJUST_CITY_GROWTH percent — the wonders', the Migration
    // Treaty's, the beliefs', the governor's — floored, and the residue its
    // detaches left, `City.growthDrift`), never below none; then times the
    // housing factor, floored (runs/h1_duelw1108: Displeased −15% −38 and the
    // Hanging Gardens' +15% 38; the Migration Treaty's +20% 51 attached and
    // −52 detached leaves its cities 37 — Xi'an t160 255/256, t159 293/256)
    const m256 = Math.max(0, 256 + growth256(tier.growthFactor) + empireGrowth256(state, city.seat)
      + growthPct256(m.growthMult) + (city.growthDrift ?? 0));
    effective = foodSurplus * Math.floor(housingGrowthFactor(housing - city.population) * m256) / 256;
  }
  const growthNeeded = growthFoodNeeded(city.population);
  const turnsToGrow = effective > 0 ? Math.ceil((growthNeeded - city.foodBox) / effective) : null;

  const borderCost = borderGrowthCost(city.tilesAcquired);
  const nextTile = (city.nextPlot ?? -1) >= 0 ? city.nextPlot! : null;
  const borderTurns =
    nextTile !== null && total.culture > 0
      ? Math.max(0, Math.ceil((borderCost - city.cultureBox) / total.culture))
      : null;

  return {
    city,
    housing,
    housingParts: hParts,
    amenities: { have, needed, balance, tier },
    workedTiles: worked,
    breakdown: { tiles, districts, buildings, citizens, bonuses, trade },
    total,
    foodSurplus,
    effectiveFoodSurplus: effective,
    growthNeeded,
    turnsToGrow,
    border: { cost: borderCost, progress: city.cultureBox, turns: borderTurns, nextTile },
    specialistTotal,
    maintenance,
  };
}
