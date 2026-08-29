
import { addYields, emptyYields, type City, type DistrictId, type GameState, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin, hexDistance } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable } from '../../world/query';
import { tileYields, improvementAdjacency, cityDistrictYields, cityBuildingYields, regionalEffects, localAmenities, pillagedDistrictTypes, effectiveAdjacency, completedDistrictCount } from './yields';
import { computeAdoption, getModifiers, makeYieldCtx, withFollowerBelief, withGovernor, followerReligionForCity, type Modifiers, type YieldCtx } from './effects';
import { tileAppeal, appealTier, appealBand, gpAppealResolver, PRESERVE_APPEAL_HOUSING } from './appeal';
import { TECHS, ERAS } from '../data/techs'; // wonder/civ era scale
import { CIVICS } from '../data/civics';
/** base tourism every completed wonder pays (real Civ 6). */
export const WONDER_TOURISM_BASE = 2;
import { cityTradeYields } from './trade';
import { hasRiver } from '../../world/query';
import { revealAround } from './fog';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS, isGovYieldBuilding } from '../data/buildings';
import { YIELD_KEYS } from '../../world/types';
import { wallsLevel } from './rules';
import { governorMult } from './governors';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { completedWonders } from './wonders';
import { goldenCulturePerDistrict, goldenDedication } from './eras';
import { PARK_AMENITIES_OWNER, PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../data/improvements';
import { SPECIALIST_YIELDS, SPECIALIST_TIERS, greatWorkCulture, greatWorkTourism, relicFaith, relicTourism, artifactCulture, artifactTourism, GW_PRINTING_TECH } from '../data/greatPeople';
import { congressGrowthMult, congressGwMult } from './congress';
import { suzerainEffect } from './cityStates';
import { ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE } from '../data/cityStates';
import { warWearinessPenalty, DED_FREE_INQUIRY, HOLY_CITY_TOURISM, LOYALTY_MAX, GOV_INTOLERANCE, TOURISM_GOV_MULT, TOURISM_OPEN_BORDERS_PCT, TOURISM_ROUTE_PCT } from '../data/seats';
import { RESOURCES } from '../../world/resources';
import { CITY_WORK_RADIUS, BORDER_MAX_RADIUS, borderGrowthCost, FOOD_PER_CITIZEN, CITIZEN_SCIENCE, CITIZEN_CULTURE, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, LUXURY_AMENITY_CITIES, REGIONAL_RANGE, growthFoodNeeded, housingGrowthFactor, amenitiesNeeded, amenityTier, type AmenityTier } from '../data/constants';
import { tileSeat, setTileOwner, tileBelongsTo, tileOwnedByCiv, seatOf, citiesOf, tileClaimed, campTiles, borderTurnsFrom } from './seats';
import { wwMax } from './weariness';
import { DED_STEAM, DED_WISH, WISH_PARK_TOURISM_MULT, WISH_WONDER_TOURISM_NUM, WISH_WONDER_TOURISM_DEN } from '../data/seats';

import { gpCityPermOf, gpPermOf } from '../data/greatPeople';
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

export function buildingMaintenance(id: string): number {
  const def = BUILDINGS[id];
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
    | 'conquestProdTurns',
): number {
  let n = 0;
  for (const city of citiesOf(state, seat)) {
    const dark = pillagedDistrictTypes(state.map, city.districts);
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (!def || dark.has(def.district)) continue;
      n += def[key] ?? 0;
    }
  }
  return n;
}

/**
 * The same sum over ONE city — the shape of a Plaza term that names "this
 * city" rather than the empire, and of the any-Great-Work slot pool.
 */
export function cityBuildingSum(
  state: GameState,
  city: { buildings: string[]; districts?: City['districts'] },
  key: 'settlerProdPct' | 'anyWorkSlots',
): number {
  const dark = pillagedDistrictTypes(state.map, city.districts ?? []);
  let n = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || dark.has(def.district)) continue;
    n += def[key] ?? 0;
  }
  return n;
}

/** CIV6 (Ancestral Hall): "New cities receive a free Builder" — what a
 *  standing building hands every city this seat founds, or null. */
export function newCityGrantUnit(state: GameState, seat: number): string | null {
  for (const city of citiesOf(state, seat)) {
    const dark = pillagedDistrictTypes(state.map, city.districts);
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (def?.grantUnitNewCity && !dark.has(def.district)) return def.grantUnitNewCity;
    }
  }
  return null;
}

export function cityMaintenance(state: GameState, city: City): number {
  let total = 0;
  for (const d of city.districts) {
    if (state.map.tiles[d.tileIndex].districtComplete) total += districtMaintenance(d.type);
  }
  for (const b of city.buildings) total += buildingMaintenance(b);
  return total;
}

export function workableTiles(state: GameState, city: City): Tile[] {
  const center = state.map.tiles[city.centerIndex];
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS).filter(
    (t) =>
      tileBelongsTo(t, city) &&
      t.index !== city.centerIndex &&
      !t.district &&
      !t.builtWonder &&
      !isImpassable(t),
  );
}


export function citySpecialistSlots(state: GameState, city: City): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of city.districts) {
    if (!SPECIALIST_YIELDS[d.type]) continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // pillaged district has no working specialists
    const slots = city.buildings.filter((b) => BUILDINGS[b]?.district === d.type).length;
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
  }

  const pillaged = pillagedDistrictTypes(map, city.districts);
  const camps = campTiles(state);
  const gpa = gpAppealResolver(state);
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
    const def = BUILDINGS[id];
    if (def && pillaged.has(def.district)) continue; // buildings in a pillaged district are dark
    if (def?.housing) total += def.housing;
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
  const dark = pillagedDistrictTypes(state.map, city.districts);
  let n = 0;
  for (const b of city.buildings) {
    const def = BUILDINGS[b];
    if (def && !dark.has(def.district) && isGovYieldBuilding(def)) n += 1;
  }
  return n;
}

export function luxuryAmenities(state: GameState, seat: number): Map<number, number> {
  const cities = citiesOf(state, seat);
  const result = new Map<number, number>();
  for (const c of cities) result.set(c.id, 0);
  if (cities.length === 0) return result;

  const luxuries = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || tileSeat(t) !== seat) continue;
    const def = RESOURCES[t.resource];
    if (def.category === 'luxury' && t.improvement === def.improvement) luxuries.add(t.resource);
  }

  const baseHave = new Map<number, number>();
  for (const c of cities) {
    baseHave.set(c.id, localAmenities(state, c) + parkAmenities(state, c) + regionalEffects(state, c).amenities);
  }

  // CIV6 (John Spilsbury, Helena Rubinstein, Levi Strauss, Estee Lauder): an
  // INVENTED luxury serves cities exactly like a worked one, and its own row
  // says how many it reaches.
  const reach = [
    ...new Array<number>(luxuries.size).fill(LUXURY_AMENITY_CITIES),
    ...(seatOf(state, seat)?.gpLuxuries ?? []),
  ];
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
function wonderCityFlat(state: GameState, city: City, key: 'cityAmenities' | 'cityHousing'): number {
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
): number {
  let t = 0;
  for (const tile of state.map.tiles) {
    if (!tile.builtWonder || !tile.builtWonderComplete || !owns(tile)) continue;
    const base = WONDER_TOURISM_BASE + Math.max(0, era - wonderEraIndex(tile.builtWonder));
    t += govCities?.has(tile.ownerCity ?? -1)
      ? Math.floor((base * WISH_WONDER_TOURISM_NUM) / WISH_WONDER_TOURISM_DEN)
      : base;
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
  const gpa = gpAppealResolver(state);
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
  const gpa = gpAppealResolver(state);
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
    t += (greatWorkTourism(c, printing, km) + artifactTourism(c))
      * governorMult(state, c, (e) => e.gwTourismMult);
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
    + wonderTourism(state, era, owns, golden ? govCityIds ?? null : null);
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
    t += relicTourism(c) * wonderMult(state, [c], 'religiousTourismMult');
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
): CityStats {
  const base = mods ?? getModifiers(state, city.seat);
  const m = withGovernor(state,
    withFollowerBelief(state, base, followerReligionForCity(city.followedReligion, city.seat)), city);
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

  const worked = assignWorkedTiles(state, city, ctx, city.population - specialistTotal);
  const tiles = emptyYields();
  addYields(tiles, tileYieldsForCenter(ctx, center));
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
  };
  wonderTileBonus(center, true);
  waterMillBonus(center);
  lighthouseBonus(center);
  for (const i of worked) {
    addYields(tiles, tileYields(ctx, map.tiles[i]));
    wonderTileBonus(map.tiles[i], false);
    waterMillBonus(map.tiles[i]);
    lighthouseBonus(map.tiles[i]);
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
  const regional = regionalEffects(state, city);
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
  buildings.culture += greatWorkCulture(city);
  buildings.culture += artifactCulture(city); // +3 culture per artifact
  // Golden PEN_BRUSH_AND_VOICE — +1 Culture per SPECIALTY district, from
  // THIS CITY'S OWNER's dedication, which is the row the GPU reads.
  buildings.culture += goldenCulturePerDistrict(state, city.seat) * completedDistrictCount(state, city, true);
  buildings.faith += relicFaith(city);
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
  if (suzerainEffect(state, city.seat, 'worksScience')) {
    buildings.science += ANSHAN_WRITING_SCIENCE * (city.greatWorksWriting ?? 0)
      + ANSHAN_RELIC_SCIENCE * ((city.relics ?? 0) + (city.artifacts ?? 0));
  }

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

  const housing = computeHousing(state, city, m) + wonderCityFlat(state, city, 'cityHousing')
    + gpCityPermOf(city, 'housing');
  let have =
    localAmenities(state, city) +
    parkAmenities(state, city) +
    regional.amenities +
    wonderRegionalAmenities(state, city) +
    wonderCityFlat(state, city, 'cityAmenities') +
    wonderImprovementAmenities(state, city) +
    m.amenitiesAll +
    (m.riverCity && hasRiver(center) ? m.riverCity.amenities : 0) +
    ((luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0) +
    gpCityPermOf(city, 'amenities');
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

  const total = emptyYields();
  addYields(total, tiles);
  addYields(total, districts);
  addYields(total, buildings);
  addYields(total, citizens);
  addYields(total, bonuses);
  addYields(total, trade);
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as YieldKey[]) {
    total[k] *= tier.yieldFactor;
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

  const borderCost = Math.round(borderGrowthCost(city.tilesAcquired) * m.borderCostMult);
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
