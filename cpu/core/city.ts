
import { addYields, emptyYields, type City, type DistrictId, type GameState, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable, isMountain } from '../../world/query';
import { tileYields, improvementAdjacency, cityDistrictYields, cityBuildingYields, regionalEffects, localAmenities, darkBuildings, buildingPillaged, effectiveAdjacency, completedDistrictCount } from './yields';
import { computeAdoption, getModifiers, notFoundedSum, religionsPresent, makeYieldCtx, withFollowerBelief, withGovernor, followerReligionsForCity, type Modifiers, type YieldCtx } from './effects';
import { tileAppeal, appealTier, appealBand, PRESERVE_APPEAL_HOUSING } from './appeal';
import { TECHS, ERAS } from '../data/techs'; // wonder/civ era scale
import { CIVICS } from '../data/civics';
/** base tourism every completed wonder pays (real Civ 6). */
export const WONDER_TOURISM_BASE = 2;
import { cityTradeYields } from './trade';
import { hasRiver, isWater } from '../../world/query';
import { revealAround } from './fog';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS, buildingVariantFor, effectiveBuilding, isGovYieldBuilding } from '../data/buildings';
import { YIELD_KEYS } from '../../world/types';
import { wallsLevel } from './rules';
import { cityAppealResolver, governorFlag, governorMult, governorSum, minorGovernorEffects, cityGovernorEffects, cityGovernorTitles } from './governors';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { completedWonders } from './wonders';
import { goldenCulturePerDistrict, goldenDedication } from './eras';
import { PARK_AMENITIES_OWNER, PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../data/improvements';
import { SPECIALIST_YIELDS, SPECIALIST_TIERS, GW_PRINTING_TECH } from '../data/greatPeople';
import { greatWorkTourism, greatWorkYields, gwCountsByObj, relicTourism } from './greatWorks';
import { GWO_ARTIFACT, GWO_RELIC, GWO_WRITING } from '../data/greatWorks';
import { congressBannedLuxury, congressDuplicateLuxury, congressGrowthMult, congressGwMult } from './congress';
import { suzerainEffect, minorLuxuries } from './cityStates';
import { ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE, ZANZIBAR_LUXURIES, ZANZIBAR_LUXURY_AMENITIES, BUENOS_AIRES_AMENITIES } from '../data/cityStates';
import { warWearinessPenalty, DED_FREE_INQUIRY, HOLY_CITY_TOURISM, LOYALTY_MAX, GOV_INTOLERANCE, TOURISM_GOV_MULT, TOURISM_OPEN_BORDERS_PCT, TOURISM_ROUTE_PCT } from '../data/seats';
import { RESOURCES } from '../../world/resources';
import { FEATURES } from '../../world/features';
import { CITY_WORK_RADIUS, BORDER_MAX_RADIUS, borderGrowthCost, FOOD_PER_CITIZEN, CITIZEN_SCIENCE, CITIZEN_CULTURE, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, LUXURY_AMENITY_CITIES, REGIONAL_RANGE, growthFoodNeeded, housingGrowthFactor, amenitiesNeeded, amenityTier, amenityTierIndex, type AmenityTier } from '../data/constants';
import { tileSeat, setTileOwner, tileBelongsTo, tileOwnedByCiv, seatOf, citiesOf, civOf, civVariantOf, tileClaimed, campTiles, borderTurnsFrom } from './seats';
import { wwMax } from './weariness';
import { DED_STEAM, DED_WISH, WISH_PARK_TOURISM_MULT, WISH_WONDER_TOURISM_NUM, WISH_WONDER_TOURISM_DEN } from '../data/seats';

import { gpCityPermOf, gpPermOf } from '../data/greatPeople';
import { irradiated } from './nuclear';
export interface CityStats {
  city: City;
  housing: number;
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

export function buildingMaintenance(id: string, civ?: string | null): number {
  // a unique building may carry no upkeep where the row it replaces does
  // (the Marae), so the SEAT decides which row is being priced
  const def = effectiveBuilding(civ, id);
  if (!def || def.cost === 0) return 0;
  // Verified real values override the tier heuristic; worship
  // buildings are maintenance-free in real Civ 6.
  if (def.maintenance !== undefined) return def.maintenance;
  if (def.worship) return 0;
  if (def.district === 'COMMERCIAL_HUB') return 0;
  if (def.cost >= 500) return 3;
  if (def.cost >= 190) return 2;
  return 1;
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
    | 'conquestProdTurns' | 'projectChargePct',
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

export function cityMaintenance(state: GameState, city: City): number {
  let total = 0;
  for (const d of city.districts) {
    if (state.map.tiles[d.tileIndex].districtComplete) total += districtMaintenance(d.type);
  }
  const civ = civOf(state, city.seat);
  for (const b of city.buildings) total += buildingMaintenance(b, civ);
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
      // CIV6: contaminated tiles "cannot be worked by the city until the
      // contamination timer expires or until the tile is cleaned".
      !irradiated(t) &&
      (!isImpassable(t) || (mtnOk && isMountain(t) && !t.feature)),
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
export function specialistYields(district: import('./types').DistrictId, buildings: readonly string[]): Partial<Yields> | undefined {
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
 *  tile of the city carrying a PASSABLE feature, summed over the buildings the
 *  city holds. A natural wonder is a feature, so a passable one is paid. */
export function buildingVariantFeatureYields(state: GameState, city: City): Partial<Yields> | null {
  let out: Partial<Yields> | null = null;
  const civ = civOf(state, city.seat);
  for (const id of city.buildings) {
    const y = buildingVariantFor(civ, id)?.featureTileYields;
    if (!y) continue;
    out = out ?? {};
    for (const k of Object.keys(y) as (keyof Yields)[]) out[k] = (out[k] ?? 0) + (y[k] ?? 0);
  }
  return out;
}

/** CIV6 (Stave Church): the yields a civilization's unique building pays on
 *  every Coast tile of the city that carries a resource, summed over the
 *  buildings the city holds. */
export function buildingVariantCoastYields(state: GameState, city: City): Partial<Yields> | null {
  let out: Partial<Yields> | null = null;
  for (const id of city.buildings) {
    const y = civVariantOf(state, city.seat, BUILDINGS[id]?.civVariants)?.coastResourceYields;
    if (!y) continue;
    out = out ?? {};
    for (const k of Object.keys(y) as (keyof Yields)[]) out[k] = (out[k] ?? 0) + (y[k] ?? 0);
  }
  return out;
}

export function computeHousing(state: GameState, city: City, mods?: Modifiers): number {
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
    // CIV6 (Bath): its Districts row adds "Housing 2" on top of the water
    water += civVariantOf(state, city.seat, DISTRICTS.AQUEDUCT.civVariants)?.housing ?? 0;
  }

  const dark = darkBuildings(map, city);
  const camps = campTiles(state);
  const gpa = cityAppealResolver(state);
  let total = water;
  for (const d of city.districts) {
    const dt = map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // a pillaged district's housing is dark
    const ddef = DISTRICTS[d.type];
    if (d.type === 'NEIGHBORHOOD') {
      total += appealTier(tileAppeal(map, dt, camps, gpa)).housing;
    } else if (ddef.appealHousing) {
      total += PRESERVE_APPEAL_HOUSING[appealBand(tileAppeal(map, dt, camps, gpa))];
    } else {
      total += ddef.housing;
    }
  }
  for (const id of city.buildings) {
    const def = effectiveBuilding(civOf(state, city.seat), id);
    if (dark.has(id)) continue; // in a pillaged district, or pillaged itself
    if (def?.housing) total += def.housing;
    // CIV6 (Kupe's Voyage): "The Palace receives +3 Housing"
    if (def?.autoCapital) for (const r of m.capital) total += r.palaceHousing ?? 0;
    const beliefHousing = m.buildingHousingAdd[id];
    if (beliefHousing) total += beliefHousing;
  }
  if (m.riverCity && hasRiver(center)) total += m.riverCity.housing;
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (!tileBelongsTo(t, city) || !t.improvement) continue;
    const idef = IMPROVEMENTS[t.improvement as ImprovementId];
    total += idef.housing;
    if (idef.housingCivic && m.impUpgrades.has(idef.housingCivic)) total += 1;
  }

  total += m.housingAll;
  /* CIV6 (Insulae / Medina Quarter): "+1/+2 Housing in all cities with at
   * least 2/3 specialty districts." */
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.housingIfDistricts) {
    if (specialtyCount >= rule.min) total += rule.housing;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) total += rule.housing;
  }
  /* CIV6 (Classical Republic): "All cities with a district receive +1
   * Housing and +1 Amenity" — ANY completed district, where the
   * specialty-gated rules above ask for more. */
  if (m.cityWithDistrict.length && completedDistrictCount(state, city, false) >= 1) {
    for (const rule of m.cityWithDistrict) total += rule.housing;
  }
  /* CIV6 (Monarchy): "+1 Housing per level of Walls" — the level BUILT, so a
   * city with no wall standing is paid nothing however far its tech ran. */
  if (m.housingPerWallLevel) total += m.housingPerWallLevel * wallsLevel(city);
  return total;
}

/** CIV6 (Autocracy): how many government buildings STAND in this city — the
 *  Government Plaza's and the Diplomatic Quarter's, and the Palace. A dark
 *  district takes its buildings with it, as it does for their yields. */
export function govYieldBuildingCount(state: GameState, city: City): number {
  const dark = darkBuildings(state.map, city);
  let n = 0;
  for (const b of city.buildings) {
    const def = BUILDINGS[b];
    if (def && !dark.has(b) && isGovYieldBuilding(def)) n += 1;
  }
  return n;
}

export function luxuryAmenities(state: GameState, seat: number): Map<number, number> {
  const cities = citiesOf(state, seat);
  const result = new Map<number, number>();
  for (const c of cities) result.set(c.id, 0);
  if (cities.length === 0) return result;

  // CIV6 (Luxury Policy): "A: +1 Amenity on duplicates of a Resource. /
  // B: This Luxury resource grants no Amenities." B silences the named
  // luxury outright; A pays one extra full-reach round per OWN improved
  // copy beyond the first.
  const banned = congressBannedLuxury(state);
  const dupLux = congressDuplicateLuxury(state);
  let dupCopies = 0;
  const luxuries = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || tileSeat(t) !== seat) continue;
    const def = RESOURCES[t.resource];
    if (def.category === 'luxury' && t.improvement === def.improvement && t.resource !== banned) {
      luxuries.add(t.resource);
      if (t.resource === dupLux) dupCopies++;
    }
  }
  // CIV6 (Affluence): "While established in a city-state, provides a copy of
  // its Luxury resources to you." A copy of one already worked is no second
  // amenity, which the set answers by itself.
  for (const cityState of state.cityStates ?? []) {
    if (!minorGovernorEffects(state, seat, cityState.id).some((e) => e.minorLuxuries)) continue;
    for (const r of minorLuxuries(state, cityState)) if (r !== banned) luxuries.add(r);
  }

  const baseHave = new Map<number, number>();
  for (const c of cities) {
    baseHave.set(c.id, localAmenities(state, c) + parkAmenities(state, c)
      + regionalEffects(state, c, governorFlag(state, c, (e) => e.industryAllSources)).amenities);
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
  const reach = [
    ...new Array<number>(luxuries.size + Math.max(0, dupCopies - 1)).fill(LUXURY_AMENITY_CITIES),
    ...(seatOf(state, seat)?.gpLuxuries ?? []),
    ...zanzibar,
    ...new Array<number>(bonusLux.size).fill(BUENOS_AIRES_AMENITIES),
  ];
  const amR = (globalThis as { __amLog?: string[] }).__amLog;
  if (amR) amR.push(`r:${seat} t${state.turn} lux${luxuries.size} dup${dupCopies} reach[${reach.join(',')}]`);
  for (const n of reach) {
    const ranked = [...cities].sort((a, b) => {
      const needA = amenitiesNeeded(a.population) - (baseHave.get(a.id)! + result.get(a.id)!);
      const needB = amenitiesNeeded(b.population) - (baseHave.get(b.id)! + result.get(b.id)!);
      return needB - needA || a.id - b.id;
    });
    for (const c of ranked.slice(0, n)) {
      result.set(c.id, result.get(c.id)! + 1);
    }
  }
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

/** The tile culture growth would claim next (Civ 6-ish priorities). */
export function pickBorderTile(state: GameState, city: City, ctx?: YieldCtx): number | null {
  const yctx = ctx ?? makeYieldCtx(state, city.seat);
  const center = state.map.tiles[city.centerIndex];
  const candidates = borderCandidates(state, city);
  if (candidates.length === 0) return null;
  const score = (i: number) => {
    const t = state.map.tiles[i];
    const y = tileYields(yctx, t);
    const ySum = y.food + y.production + y.gold + y.science + y.culture + y.faith;
    return {
      dist: hexDistance(center.col, center.row, t.col, t.row),
      res: resourcePriority(t),
      ySum,
      i,
    };
  };
  return candidates
    .map(score)
    .sort((a, b) => a.dist - b.dist || b.res - a.res || b.ySum - a.ySum || a.i - b.i)[0].i;
}

export function acquireTile(state: GameState, city: City, tileIndex: number): void {
  setTileOwner(state.map.tiles[tileIndex], city.seat, city.id);
  city.tilesAcquired += 1;
  revealAround(state, city.seat, tileIndex, 1);
}


export function empireGrowthMult(state: GameState, seat: number): number {
  // Migration Treaty first, wonders after — the GPU folds in this order.
  let mult = congressGrowthMult(state, seat);
  for (const c of citiesOf(state, seat)) {
    for (const w of completedWonders(state, c)) {
      if (w.def.effects?.growthAllMult) mult *= w.def.effects.growthAllMult;
    }
  }
  return mult;
}

/** The flat amenities and housing a city's OWN complete wonders pay it. */
function wonderCityFlat(state: GameState, city: City,
  key: 'cityAmenities' | 'cityHousing' | 'routesToCityScience' | 'domesticRoutesToCityFaith'): number {
  let n = 0;
  for (const w of completedWonders(state, city)) n += w.def.effects?.[key] ?? 0;
  return n;
}

/** Amenities from the improvements around a wonder that pays per improvement
 *  (Temple of Artemis counts Camps, Pastures and Plantations within 4). */
function wonderImprovementAmenities(state: GameState, city: City): number {
  let n = 0;
  for (const w of completedWonders(state, city)) {
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
 * CIV6 (CITY_PARK_WATER_AMENITY,
 * MODIFIER_SINGLE_CITY_ADJUST_IMPROVEMENT_AMENITY behind
 * ADJACENT_TO_WATER_REQUIREMENTS): what the city's own improvements pay it
 * for standing beside water. PER INSTANCE — the modifier is
 * SINGLE_CITY_ADJUST_IMPROVEMENT_AMENITY, one payment per improvement, so a
 * second City Park beside water pays a second amenity.
 *
 * "Beside water" reads the RING, so a drowned neighbour counts as the sea it
 * now is, and a river edge counts as well — the requirement set is a
 * TEST_ANY over coast, river and lake.
 */
function improvementWaterAmenities(state: GameState, city: City): number {
  let n = 0;
  for (const t of state.map.tiles) {
    if (!t.improvement || t.pillaged || !tileBelongsTo(t, city)) continue;
    const amt = IMPROVEMENTS[t.improvement as ImprovementId]?.amenityAdjacentWater ?? 0;
    if (!amt) continue;
    if (hasRiver(t) || neighbors(state.map, t).some((nb) => isWater(nb))) n += amt;
  }
  return n;
}

function wonderRegionalAmenities(state: GameState, city: City): number {
  const center = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const c of citiesOf(state, city.seat)) {
    for (const w of completedWonders(state, c)) {
      const amt = w.def.effects?.regionalAmenities;
      if (!amt) continue;
      const t = state.map.tiles[w.tileIndex];
      // Measured from the WONDER TILE, not from the city holding it, on the
      // BASE reach. A Mexico City suzerain extends the DISTRICT regional
      // effects its Civilopedia line names, which a wonder's aura is not.
      if (hexDistance(t.col, t.row, center.col, center.row) <= REGIONAL_RANGE) n += amt;
    }
  }
  return n;
}

/**
 * A civ's ERA INDEX — the highest era among its completed techs
 * and civics (real Civ 6 advances a civ's era with its research). Used only
 * by wonder tourism, which pays "1 for each era you have advanced PAST the
 * era in which that wonder was first available", so wonder era and civ era
 * must be measured on the SAME scale. 0 (Ancient) when nothing is done.
 */
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

export function wonderEraIndex(id: string): number {
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
 * is what the tile walk already computes.
 */
function suzerainTourism(state: GameState, seat: number, owns: (t: Tile) => boolean): number {
  const techs = seatOf(state, seat)?.research.techs ?? [];
  const ctx = makeYieldCtx(state, seat);
  let t = 0;
  for (const tile of state.map.tiles) {
    if (!tile.improvement || tile.pillaged || !owns(tile)) continue;
    const def = IMPROVEMENTS[tile.improvement as ImprovementId];
    if (!def.tourismFrom || !def.tourismTech || !techs.includes(def.tourismTech)) continue;
    const base = def.yields[def.tourismFrom] ?? 0;
    t += base + (improvementAdjacency(ctx, tile, def.id)[def.tourismFrom] ?? 0);
  }
  return t;
}

function resortTourism(state: GameState, owns: (t: Tile) => boolean): number {
  let t = 0;
  const camps = campTiles(state);
  const gpa = cityAppealResolver(state);
  for (const tile of state.map.tiles) {
    if (tile.improvement !== 'SEASIDE_RESORT' || tile.pillaged || !owns(tile)) continue;
    t += Math.max(0, tileAppeal(state.map, tile, camps, gpa));
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

/**
 * The AMENITIES a seat's National Parks pay this city. CIV6: a park
 * gives "2 Amenities to the city that owns it and 1 Amenity to the four
 * closest cities in your empire" — closest by centre-tile hex distance to the
 * park, ties by city id, and the OWNING city never double-dips as one of the
 * four. A park is four tiles; the CLUSTER pays once, so the payout is keyed
 * on the park tile with the LOWEST index in each owning-city group.
 */
/** Does this city hold a National Park? The ANCHOR tile names the cluster,
 *  which is the same test `parkAmenities` pays on. */
export function cityHasPark(state: GameState, city: City): boolean {
  for (const tile of state.map.tiles) {
    if ((tile.park ?? -1) !== tile.index) continue;
    if (tileSeat(tile) === city.seat && tile.ownerCity === city.id) return true;
  }
  return false;
}

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
  return hexDistance(ta.col, ta.row, tb.col, tb.row);
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

export function seatTourism(
  state: GameState,
  seat: number,
  govCityIds?: ReadonlySet<number>,
): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  let t = 0;
  const printing = s.research.techs.includes(GW_PRINTING_TECH);
  const km = congressGwMult(state);
  const cities = citiesOf(state, seat);
  for (const c of cities) {
    // CIV6 (Curator): "+100% Tourism from Great Works in this city."
    t += greatWorkTourism(state, c, printing, km) * governorMult(state, c, (e) => e.gwTourismMult);
  }
  const owns = (tile: Tile) => tileOwnedByCiv(tile, seat);
  const era = civEraIndex(s.research.techs, s.research.civics);
  // CIV6 (Wish You Were Here, Golden face): "+100% Tourism to all National
  // Parks", and "Cities with Governors receive 50% Tourism from World
  // Wonders". `govCityIds` is the caller's loop-top governor seating — the
  // same snapshot the loyalty payout used, taken before any loyalty moved.
  const golden = goldenDedication(state, seat, DED_WISH);
  const parkMult = golden ? WISH_PARK_TOURISM_MULT : 1;
  return t + suzerainTourism(state, seat, owns)
    + resortTourism(state, owns) * wonderMult(state, cities, 'resortTourismMult')
    + parkTourism(state, owns) * parkMult
    + wonderTourism(state, era, owns, golden ? govCityIds ?? null : null,
                    getModifiers(state, seat).wonderTourismPct);
}

/** CIV6 (Tourism): the RELIGIOUS half of a seat's per-turn tourism — "Relics
 *  generate Religious Tourism" and "Holy Cities generate +8 Religious Tourism
 *  per turn" — banked apart (`Seat.tourismReligious`) because a rival's
 *  Enlightenment or a different religion halves THIS half at the read
 *  (`cultureVictor`), never the general half. St. Basil's multiplier is the
 *  HOLDING city's, and a religion's Holy City pays its CURRENT owner. */
export function seatTourismReligious(state: GameState, seat: number): number {
  const cities = citiesOf(state, seat);
  let t = 0;
  for (const c of cities) {
    t += relicTourism(state, c) * wonderMult(state, [c], 'religiousTourismMult');
  }
  for (const g of state.seats) {
    const ht = g.religion.holyTile;
    if (!g.religion.founded || ht == null || ht < 0) continue;
    if (cities.some((c) => c.centerIndex === ht)) t += HOLY_CITY_TOURISM;
  }
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
  if (routed) pct += TOURISM_ROUTE_PCT + getModifiers(state, from).tourismRouteBonus;
  const ga = computeAdoption(seatOf(state, from)!.research).government;
  const gb = computeAdoption(seatOf(state, to)!.research).government;
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
   * caller but `seatPhase`'s loop-top snapshot: `computeCityStats` is a pure
   * read that four other rules call at four other points in the turn, and a
   * pick recorded from the SCORE walk would be the post-growth one — the turn
   * itself ran on the snapshot. One writer, so the stored pick is the pick
   * the turn actually used.
   */
  record = false,
): CityStats {
  const base = mods ?? getModifiers(state, city.seat);
  const m = withGovernor(state,
    withFollowerBelief(state, base, followerReligionsForCity(base, city)), city);
  const ctx = makeYieldCtx(state, city.seat, m);
  const map = state.map;
  const center = map.tiles[city.centerIndex];
  const wonders = completedWonders(state, city);
  // CIV6: a wonder that names a TERRAIN or FEATURE pays its yields on the
  // city's own tiles; `empire` widens the payer to every city the seat holds
  // (Etemenanki's Marsh). The centre counts — it is a worked tile — and a
  // districted tile does not, since its terrain yields are dark anyway.
  const tileRules: NonNullable<NonNullable<BuiltWonderDef['effects']>['tileYields']> = [];
  for (const w of wonders) for (const r of w.def.effects?.tileYields ?? []) tileRules.push(r);
  for (const c of citiesOf(state, city.seat)) {
    if (c.id === city.id) continue;
    for (const w of completedWonders(state, c)) {
      for (const r of w.def.effects?.tileYields ?? []) if (r.empire) tileRules.push(r);
    }
  }

  const specialists = effectiveSpecialists(state, city);
  let specialistTotal = 0;
  for (const n of specialists.values()) specialistTotal += n;

  const worked = workedTilesOf(state, city, ctx, specialistTotal);
  // the pick this walk MADE, kept where the census can read it. Never a
  // recomputation, and never from a second caller: the walk is a loop-top
  // SNAPSHOT, so a growth landing later in the same turn would change what a
  // fresh call answers while the turn itself ran on this one.
  if (record) city.workedTiles = worked;

  const tiles = emptyYields();
  addYields(tiles, tileYieldsForCenter(ctx, center));
  // CIV6 (EFFECT_TERRAIN_ADJACENCY): the roster's centre rows, per adjacent
  // tile of the named terrain (`CENTER_ADJ_ROWS`)
  for (const r of ctx.mods.centerAdj) {
    tiles[r.yield] += r.amount * neighbors(state.map, center).filter((n) => n.terrain === r.terrain).length;
  }
  const wonderTileBonus = (t: Tile, isCenter: boolean) => {
    if (!tileRules.length || (t.district && !isCenter)) return;
    for (const r of tileRules) {
      if (r.terrain && t.terrain !== r.terrain) continue;
      if (r.feature && t.feature !== r.feature) continue;
      if (r.excludeFeature && t.feature === r.excludeFeature) continue;
      addYields(tiles, r.yields);
    }
  };
  const hasWaterMill = city.buildings.includes('WATER_MILL');
  const waterMillBonus = (t: Tile) => {
    if (!hasWaterMill || t.improvement !== 'FARM' || !t.resource) return;
    const r = RESOURCES[t.resource];
    if (r?.category === 'bonus' && r.improvement === 'FARM') tiles.food += 1;
  };
  // CIV6 (Lighthouse): "+1 Food in Coast and Lake tiles controlled by the
  // city" — the tile pays it, so only a WORKED one materializes.
  const hasLighthouse = city.buildings.includes('LIGHTHOUSE');
  const lighthouseBonus = (t: Tile) => {
    if (hasLighthouse && (t.terrain === 'COAST' || t.terrain === 'LAKE')) tiles.food += 1;
    // CIV6 (Stave Church): "+1 Production to each coastal resource tile in
    // this city" — a Coast tile carrying a resource, the same way.
    if (coastResY && t.terrain === 'COAST' && t.resource !== null) addYields(tiles, coastResY);
  };
  const coastResY = buildingVariantCoastYields(state, city);
  // CIV6 (Marae): "+1 Culture and Faith to all of this city's tiles with a
  // passable feature or natural wonder" — a plot yield, so only a WORKED tile
  // materializes it, exactly as the Lighthouse's Food does.
  const featTileY = buildingVariantFeatureYields(state, city);
  const featureTileBonus = (t: Tile) => {
    if (!featTileY || t.feature === null || FEATURES[t.feature]?.impassable) return;
    addYields(tiles, featTileY);
  };
  wonderTileBonus(center, true);
  waterMillBonus(center);
  lighthouseBonus(center);
  featureTileBonus(center);
  for (const i of worked) {
    addYields(tiles, tileYields(ctx, map.tiles[i]));
    wonderTileBonus(map.tiles[i], false);
    waterMillBonus(map.tiles[i]);
    lighthouseBonus(map.tiles[i]);
    featureTileBonus(map.tiles[i]);
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
  for (const [tileIndex, n] of specialists) {
    const inst = city.districts.find((d) => d.tileIndex === tileIndex);
    const y = inst ? specialistYields(inst.type, city.buildings) : undefined;
    if (y) addYields(districts, y, n);
  }
  const buildings = cityBuildingYields(ctx, city, city.powered ?? false);
  const regional = regionalEffects(
    state, city, governorFlag(state, city, (e) => e.industryAllSources));
  addYields(buildings, regional.yields);
  for (const w of wonders) {
    if (w.def.cityYields) addYields(buildings, w.def.cityYields);
    // CIV6 (Great Bath): "+1 Faith for every time a tile belonging to this
    // city has been Flooded."
    if (w.def.effects?.faithPerFlood) {
      let floods = 0;
      for (const t of state.map.tiles) if (tileBelongsTo(t, city)) floods += t.floodCount ?? 0;
      buildings.faith += w.def.effects.faithPerFlood * floods;
    }
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
  // THIS CITY'S OWNER's dedication, which is the row the GPU reads.
  buildings.culture += goldenCulturePerDistrict(state, city.seat) * completedDistrictCount(state, city, true);
  buildings.faith += gwy.faith;
  // CIV6 (Leonardo da Vinci): "Workshops provide +3 Culture" — seat-wide,
  // per standing Workshop.
  const wcult = gpPermOf(seatOf(state, city.seat), 'workshopCulture');
  if (wcult && city.buildings.includes('WORKSHOP')) buildings.culture += wcult;
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

  const trade = cityTradeYields(state, city, m.routeGold);

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
    bonuses.faith += m.faithPerSpecialty * completedDistrictCount(state, city, true);
  }
  // CIV6 (Forestry Management): "This city receives +2 Gold for each
  // unimproved feature" — the tiles this city OWNS that still carry one.
  const perFeature = governorSum(state, city, (e) => e.goldPerFeature);
  if (perFeature) {
    let n = 0;
    for (const t of map.tiles) {
      if (tileBelongsTo(t, city) && t.feature && !t.improvement) n += 1;
    }
    bonuses.gold += perFeature * n;
  }
  // CIV6 (Land Acquisition): "+3 Gold per turn from each foreign Trade
  // Route passing through the city" — a foreign route whose stored CHAIN
  // holds this centre.
  const perPass = governorSum(state, city, (e) => e.passRouteGold);
  if (perPass) {
    let n = 0;
    for (const sx of state.seats) {
      if (sx.seat === city.seat) continue;
      for (const r of sx.tradeRoutes ?? []) {
        if ((r.chain ?? []).includes(city.centerIndex)) n += 1;
      }
    }
    bonuses.gold += perPass * n;
  }
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

  const housing = computeHousing(state, city, m) + wonderCityFlat(state, city, 'cityHousing')
    + gpCityPermOf(city, 'housing');
  // THE RANKING BASE — everything `luxuryAmenities` ranks cities on, and the
  // one split point both engines share. Named so the amenity log can print
  // it: a disagreement here is a different sum, a disagreement in `lux`
  // alone is a different allocation of the same one.
  const amenBase =
    localAmenities(state, city) +
    parkAmenities(state, city) +
    regional.amenities;
  let have =
    amenBase +
    wonderRegionalAmenities(state, city) +
    wonderCityFlat(state, city, 'cityAmenities') +
    wonderImprovementAmenities(state, city) +
    improvementWaterAmenities(state, city) +
    m.amenitiesAll +
    (m.riverCity && hasRiver(center) ? m.riverCity.amenities : 0) +
    ((luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0) +
    gpCityPermOf(city, 'amenities') +
    notFoundedSum(state, city, 'amenity') +
    // CIV6 (Dharma): "Cities gain an Amenity for every Religion with at least
    // 1 Follower" (`RELIGION_AMENITY_ROWS`)
    (m.religionAmenities.length
      ? m.religionAmenities.reduce((n, r) => n + r.amenities
        * religionsPresent(city).filter((g) => (city.religionPressure?.[g] ?? 0) >= r.followers).length, 0)
      : 0);
  have -= warWearinessPenalty(wwMax(seatOf(state, city.seat)));
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.amenitiesIfSpecialty) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  if (m.cityWithDistrict.length && completedDistrictCount(state, city, false) >= 1) {
    for (const rule of m.cityWithDistrict) have += rule.amenities;
  }
  const needed = amenitiesNeeded(city.population);
  const balance = have - needed;
  const tier = amenityTier(balance);
  const am = (globalThis as { __amLog?: string[] }).__amLog;
  if (am && record) {
    am.push(`c:${city.id} base${amenBase} lux${(luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0}`
      + ` ww${warWearinessPenalty(wwMax(seatOf(state, city.seat)))} have${have} need${needed} bal${balance}`
      + ` tier${amenityTierIndex(tier.name)}`);
  }
  // the tier this walk RAN ON, kept where the census can read it — never a
  // recomputation, for the same reason `workedTiles` is not one: the walk is
  // a loop-top snapshot and the turn's own growth moves what a fresh call
  // would answer.
  if (record) city.amenityTier = amenityTierIndex(tier.name);

  const total = emptyYields();
  addYields(total, tiles);
  addYields(total, districts);
  addYields(total, buildings);
  addYields(total, citizens);
  addYields(total, bonuses);
  addYields(total, trade);
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as YieldKey[]) {
    total[k] *= tier.yieldFactor;
    // CIV6 (EFFECT_ADJUST_CITY_HAPPINESS_YIELD): the roster's per-tier rows
    // (`HAPPY_YIELD_ROWS`) — a percentage over the same total
    for (const r of m.happyYields) if (r.tier === tier.name && r.yield === k) total[k] *= 1 + r.pct / 100;
    // CIV6 (Toqui, EFFECT_ADJUST_CITY_YIELD_MODIFIER): the roster's rows for a
    // city with an ESTABLISHED governor, tripled in one this seat did not found
    if (m.governorYields.length && cityGovernorEffects(state, city).length > 0) {
      const founded = (city.founderSeat ?? city.seat) === city.seat;
      for (const r of m.governorYields) if (r.yield === k && r.founded === founded) total[k] *= 1 + r.pct / 100;
    }
    // CIV6 (Hwarang, EFFECT_ADJUST_CITY_YIELD_MODIFIER_PER_GOVERNOR_TITLE):
    // "+3% ... for each Promotion they have earned, including their first"
    if (m.governorTitleYields.length) {
      const titles = cityGovernorTitles(state, city);
      if (titles > 0) for (const r of m.governorTitleYields) if (r.yield === k) total[k] *= 1 + (r.pct * titles) / 100;
    }
    // CIV6 (Righteousness of the Faith): the worship building this row holds
    // adds to the city's Science, Faith and Culture
    if (m.worship.length && (k === 'science' || k === 'faith' || k === 'culture')
      && city.buildings.some((b) => BUILDINGS[b]?.worship === true)) {
      for (const r of m.worship) total[k] *= 1 + r.yieldPct / 100;
    }
  }
  for (const k of Object.keys(m.yieldMult) as YieldKey[]) {
    total[k] *= m.yieldMult[k] ?? 1;
    // CIV6 (Monasticism): "+75% Science in cities with a Holy Site";
    // (Robber Barons): "+50% Gold in cities with a Stock Exchange. +25%
    // Production in cities with a Factory." Each names one city FACT, so the
    // multiplier pays only where that fact stands.
    for (const r of m.districtYieldMult) {
      if (r.yield === k && city.districts.some((d) => d.type === r.district
        && state.map.tiles[d.tileIndex].districtComplete
        && !state.map.tiles[d.tileIndex].districtPillaged)) total[k] *= r.mult;
    }
    for (const r of m.buildingYieldMult) {
      if (r.yield === k && city.buildings.includes(r.building)) total[k] *= r.mult;
    }
  }
  for (const w of wonders) {
    const mult = w.def.effects?.cityYieldMult;
    if (!mult) continue;
    for (const k of Object.keys(mult) as YieldKey[]) {
      total[k] *= mult[k] ?? 1;
    }
  }
  const maintenance = cityMaintenance(state, city);
  total.gold -= maintenance;

  const foodSurplus = total.food - city.population * FOOD_PER_CITIZEN;
  let effective = foodSurplus;
  if (foodSurplus > 0) {
    effective =
      foodSurplus *
      housingGrowthFactor(housing - city.population) *
      tier.growthFactor *
      empireGrowthMult(state, city.seat) *
      m.growthMult;
  }
  const growthNeeded = growthFoodNeeded(city.population);
  const turnsToGrow = effective > 0 ? Math.ceil((growthNeeded - city.foodBox) / effective) : null;

  const borderCost = Math.round(
    (borderGrowthCost(city.tilesAcquired) * m.borderCostMult * 100) /
      (100 + governorSum(state, city, (e) => e.borderExpansionPct)),
  );
  const nextTile = pickBorderTile(state, city, ctx);
  const borderTurns =
    nextTile !== null && total.culture > 0
      ? Math.max(0, Math.ceil((borderCost - city.cultureBox) / total.culture))
      : null;

  return {
    city,
    housing,
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
