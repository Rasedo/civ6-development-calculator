/**
 * City mechanics: housing, amenities, citizen tile assignment, growth math,
 * cultural border expansion. `computeCityStats` is the single entry point
 * used by the UI and turn loop.
 */

import { addYields, emptyYields, type City, type GameState, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin, hexDistance } from './hex';
import { hasFreshWater, isCoastalLand, isImpassable } from './query';
import { tileYields, cityDistrictYields, cityBuildingYields, regionalEffects, localBuildingAmenities } from './yields';
import { getModifiers, makeYieldCtx, withFollowerBelief, followerReligionForCity, type Modifiers, type YieldCtx } from './effects';
import { tileAppeal, appealTier } from './appeal';
import { cityTradeYields } from './trade';
import { hasRiver } from './query';
import { revealAround } from './fog';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { SPECIALIST_YIELDS } from '../data/greatPeople';
import { warWearinessPenalty } from '../data/rivals';
import { RESOURCES } from '../data/resources';
import {
  CITY_WORK_RADIUS,
  BORDER_MAX_RADIUS,
  borderGrowthCost,
  FOOD_PER_CITIZEN,
  CITIZEN_SCIENCE,
  CITIZEN_CULTURE,
  CITY_CENTER_MIN_FOOD,
  CITY_CENTER_MIN_PRODUCTION,
  HOUSING_FRESH_WATER,
  HOUSING_COASTAL,
  HOUSING_NO_WATER,
  AQUEDUCT_FRESH_BONUS,
  AQUEDUCT_NO_FRESH_TOTAL,
  LUXURY_AMENITY_CITIES,
  growthFoodNeeded,
  housingGrowthFactor,
  amenitiesNeeded,
  amenityTier,
  type AmenityTier,
} from '../data/constants';
import { tileForeignTo, PLAYER_CIV } from './civs';

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
    /** Flat bonuses from government/policies/religion. */
    bonuses: Yields;
    /** Income from this city's outgoing trade routes. */
    trade: Yields;
  };
  /** Final per-turn yields (amenity + government modifiers applied). */
  total: Yields;
  foodSurplus: number;
  /** Surplus after growth modifiers (what actually enters the food box). */
  effectiveFoodSurplus: number;
  growthNeeded: number;
  /** Turns until next citizen; null if not growing. */
  turnsToGrow: number | null;
  border: {
    cost: number;
    progress: number;
    /** Turns until the next culture expansion; null if no culture/candidates. */
    turns: number | null;
    nextTile: number | null;
  };
  /** Citizens working as specialists (already clamped to slots/population). */
  specialistTotal: number;
  /** Gold upkeep of districts + buildings (already subtracted from total.gold). */
  maintenance: number;
}

/** Gold upkeep: commercial money-makers are free, everything else scales with
 * tier. Exported for the rival mirror (P5/S1 — one source of truth). */
export function buildingMaintenance(id: string): number {
  const def = BUILDINGS[id];
  if (!def || def.cost === 0) return 0;
  // P4/D-13: verified real values override the tier heuristic; worship
  // buildings are maintenance-free in real Civ 6.
  if (def.maintenance !== undefined) return def.maintenance;
  if (def.worship) return 0;
  if (def.district === 'COMMERCIAL_HUB') return 0;
  if (def.cost >= 500) return 3;
  if (def.cost >= 190) return 2;
  return 1;
}

export function districtMaintenance(type: string): number {
  // P4/D-14: real Civ 6 also exempts the Commercial Hub and Harbor.
  return type === 'CITY_CENTER' || type === 'NEIGHBORHOOD' || type === 'AQUEDUCT' ||
    type === 'COMMERCIAL_HUB' || type === 'HARBOR'
    ? 0
    : 1;
}

export function cityMaintenance(state: GameState, city: City): number {
  let total = 0;
  for (const d of city.districts) {
    if (state.map.tiles[d.tileIndex].districtComplete) total += districtMaintenance(d.type);
  }
  for (const b of city.buildings) total += buildingMaintenance(b);
  return total;
}

/** Tiles a city could work: owned, in range, passable, not district/wonder tiles. */
export function workableTiles(state: GameState, city: City): Tile[] {
  const center = state.map.tiles[city.centerIndex];
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS).filter(
    (t) =>
      t.cityId === city.id &&
      t.index !== city.centerIndex &&
      !t.district &&
      !t.builtWonder &&
      !isImpassable(t),
  );
}

// ---------------------------------------------------------------------------
// Specialists
// ---------------------------------------------------------------------------

/** Specialist capacity per district tile (one slot per building in it). */
export function citySpecialistSlots(state: GameState, city: City): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of city.districts) {
    if (!SPECIALIST_YIELDS[d.type]) continue;
    if (!state.map.tiles[d.tileIndex].districtComplete) continue;
    const slots = city.buildings.filter((b) => BUILDINGS[b]?.district === d.type).length;
    if (slots > 0) out.set(d.tileIndex, slots);
  }
  return out;
}

/** Assigned specialists clamped to slots (and, in aggregate, to population). */
export function effectiveSpecialists(state: GameState, city: City): Map<number, number> {
  const slots = citySpecialistSlots(state, city);
  const out = new Map<number, number>();
  let budget = city.population;
  for (const [tileIndex, max] of slots) {
    const wanted = city.specialists[String(tileIndex)] ?? 0;
    const n = Math.max(0, Math.min(wanted, max, budget));
    if (n > 0) {
      out.set(tileIndex, n);
      budget -= n;
    }
  }
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

/** Pick which tiles the city's citizens work: locked tiles first, then best score. */
export function assignWorkedTiles(
  state: GameState,
  city: City,
  ctx?: YieldCtx,
  workers = city.population,
): number[] {
  const yctx = ctx ?? makeYieldCtx(state);
  const candidates = workableTiles(state, city);
  const scored = candidates
    .map((t) => ({ index: t.index, score: tileScore(tileYields(yctx, t), city.focus) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const lockedValid = city.lockedTiles.filter((i) => candidates.some((c) => c.index === i));
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

/** Completed districts, excluding the city center. */
function completedDistrictCount(state: GameState, city: City, specialtyOnly: boolean): number {
  return city.districts.filter((d) => {
    if (d.type === 'CITY_CENTER') return false;
    if (!state.map.tiles[d.tileIndex].districtComplete) return false;
    return specialtyOnly ? DISTRICTS[d.type].countsTowardLimit : true;
  }).length;
}

/** Housing from water access, districts, buildings, improvements and policies. */
export function computeHousing(state: GameState, city: City, mods?: Modifiers): number {
  const m = mods ?? getModifiers(state);
  const map = state.map;
  const center = map.tiles[city.centerIndex];

  const fresh = hasFreshWater(map, center);
  let water = fresh
    ? HOUSING_FRESH_WATER
    : isCoastalLand(map, center)
      ? HOUSING_COASTAL
      : HOUSING_NO_WATER;
  const hasAqueduct = city.districts.some(
    (d) => d.type === 'AQUEDUCT' && map.tiles[d.tileIndex].districtComplete,
  );
  if (hasAqueduct) {
    water = fresh ? water + AQUEDUCT_FRESH_BONUS : Math.max(water, AQUEDUCT_NO_FRESH_TOTAL);
  }

  let total = water;
  for (const d of city.districts) {
    if (!map.tiles[d.tileIndex].districtComplete) continue;
    if (d.type === 'NEIGHBORHOOD') {
      total += appealTier(tileAppeal(map, map.tiles[d.tileIndex])).housing;
    } else {
      total += DISTRICTS[d.type].housing;
    }
  }
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def?.housing) total += def.housing;
    const beliefHousing = m.buildingHousingAdd[id];
    if (beliefHousing) total += beliefHousing;
  }
  if (m.riverCity && hasRiver(center)) total += m.riverCity.housing;
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (t.cityId !== city.id || !t.improvement) continue;
    total += IMPROVEMENTS[t.improvement as ImprovementId].housing;
  }

  total += m.housingAll;
  const districtCount = completedDistrictCount(state, city, false);
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.housingIfDistricts) {
    if (districtCount >= rule.min) total += rule.housing;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) total += rule.housing;
  }
  return total;
}

/** Each unique improved luxury grants +1 amenity to the neediest cities. */
export function luxuryAmenities(state: GameState): Map<number, number> {
  const result = new Map<number, number>();
  for (const c of state.cities) result.set(c.id, 0);
  if (state.cities.length === 0) return result;

  const luxuries = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || t.cityId === -1) continue;
    const def = RESOURCES[t.resource];
    if (def.category === 'luxury' && t.improvement === def.improvement) luxuries.add(t.resource);
  }

  // Need = amenities required minus what buildings already provide.
  const baseHave = new Map<number, number>();
  for (const c of state.cities) {
    baseHave.set(c.id, localBuildingAmenities(c) + regionalEffects(state, c).amenities);
  }

  for (let i = 0; i < luxuries.size; i++) {
    const ranked = [...state.cities].sort((a, b) => {
      const needA = amenitiesNeeded(a.population) - (baseHave.get(a.id)! + result.get(a.id)!);
      const needB = amenitiesNeeded(b.population) - (baseHave.get(b.id)! + result.get(b.id)!);
      return needB - needA || a.id - b.id;
    });
    for (const c of ranked.slice(0, LUXURY_AMENITY_CITIES)) {
      result.set(c.id, result.get(c.id)! + 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Cultural border expansion
// ---------------------------------------------------------------------------

/** Unowned tiles this city could claim next (adjacent to its territory, within 5 rings). */
export function borderCandidates(state: GameState, city: City): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of tilesWithin(state.map, center.col, center.row, BORDER_MAX_RADIUS)) {
    if (t.cityId !== -1) continue;
    if (tileForeignTo(t, PLAYER_CIV)) continue; // foreign territory
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && n.cityId === city.id,
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
  const yctx = ctx ?? makeYieldCtx(state);
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

/** Claim a tile for the city (culture growth or purchase). */
export function acquireTile(state: GameState, city: City, tileIndex: number): void {
  state.map.tiles[tileIndex].cityId = city.id;
  city.tilesAcquired += 1;
  revealAround(state, tileIndex, 1);
}

// ---------------------------------------------------------------------------

/** Completed world-wonder defs owned by a city. */
function completedWonders(state: GameState, city: City) {
  return city.wonders
    .filter((w) => state.map.tiles[w.tileIndex].builtWonderComplete)
    .map((w) => ({ def: BUILT_WONDERS[w.id], tileIndex: w.tileIndex }))
    .filter((w) => w.def);
}

/** Empire-wide growth multiplier from wonders (Hanging Gardens). */
function empireGrowthMult(state: GameState): number {
  let mult = 1;
  for (const c of state.cities) {
    for (const w of completedWonders(state, c)) {
      if (w.def.effects?.growthAllMult) mult *= w.def.effects.growthAllMult;
    }
  }
  return mult;
}

/** Amenities reaching `city` from regional wonders (Colosseum). */
function wonderRegionalAmenities(state: GameState, city: City): number {
  const center = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const c of state.cities) {
    for (const w of completedWonders(state, c)) {
      const amt = w.def.effects?.regionalAmenities;
      if (!amt) continue;
      const t = state.map.tiles[w.tileIndex];
      if (hexDistance(t.col, t.row, center.col, center.row) <= 6) n += amt;
    }
  }
  return n;
}

export function computeCityStats(
  state: GameState,
  city: City,
  luxMap?: Map<number, number>,
  mods?: Modifiers,
): CityStats {
  // B-18: layer this city's followed religion's FOLLOWER belief onto the base
  // per-civ modifiers. The player owner religion id is PLAYER_CIV (0); when the
  // coupling switch is inert this reproduces the old (empty, player-never-
  // founds) follower application byte-for-byte.
  const base = mods ?? getModifiers(state);
  const m = withFollowerBelief(state, base, followerReligionForCity(city.followedReligion, PLAYER_CIV));
  const ctx: YieldCtx = { map: state.map, mods: m };
  const map = state.map;
  const center = map.tiles[city.centerIndex];
  const wonders = completedWonders(state, city);
  const hasPetra = wonders.some((w) => w.def.effects?.petraDesert);

  // --- specialists ------------------------------------------------------------
  const specialists = effectiveSpecialists(state, city);
  let specialistTotal = 0;
  for (const n of specialists.values()) specialistTotal += n;

  // --- worked tiles ---------------------------------------------------------
  const worked = assignWorkedTiles(state, city, ctx, city.population - specialistTotal);
  const tiles = emptyYields();
  // The city-center tile is worked for free.
  addYields(tiles, tileYieldsForCenter(ctx, center));
  const petraBonus = (t: Tile) => {
    if (hasPetra && t.terrain === 'DESERT' && t.feature !== 'FLOODPLAINS' && !t.district) {
      addYields(tiles, { food: 2, gold: 2, production: 1 });
    }
  };
  petraBonus(center);
  for (const i of worked) {
    addYields(tiles, tileYields(ctx, map.tiles[i]));
    petraBonus(map.tiles[i]);
  }

  // --- districts & buildings -------------------------------------------------
  const districts = cityDistrictYields(ctx, city);
  for (const [tileIndex, n] of specialists) {
    const inst = city.districts.find((d) => d.tileIndex === tileIndex);
    const y = inst ? SPECIALIST_YIELDS[inst.type] : undefined;
    if (y) addYields(districts, y, n);
  }
  const buildings = cityBuildingYields(ctx, city);
  const regional = regionalEffects(state, city);
  addYields(buildings, regional.yields);
  for (const w of wonders) {
    if (w.def.cityYields) addYields(buildings, w.def.cityYields);
  }
  if (m.faithPerWonder > 0) buildings.faith += m.faithPerWonder * wonders.length;

  const trade = cityTradeYields(state, city);

  const citizens = emptyYields();
  citizens.science = city.population * CITIZEN_SCIENCE;
  citizens.culture = city.population * CITIZEN_CULTURE;

  const bonuses = emptyYields();
  addYields(bonuses, m.cityYields);
  if (city.isCapital) addYields(bonuses, m.capitalYields);

  // --- housing & amenities -----------------------------------------------------
  const housing = computeHousing(state, city, m);
  let have =
    localBuildingAmenities(city) +
    regional.amenities +
    wonderRegionalAmenities(state, city) +
    m.amenitiesAll +
    (m.riverCity && hasRiver(center) ? m.riverCity.amenities : 0) +
    ((luxMap ?? luxuryAmenities(state)).get(city.id) ?? 0);
  // B-15: war weariness is a flat empire-wide amenity drag, applied AFTER the
  // luxury grant (whose ranking stays building-amenities-based) so it shifts the
  // balance/tier without touching the relative luxury distribution.
  have -= warWearinessPenalty(state.warWeariness ?? 0);
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.amenitiesIfSpecialty) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  const needed = amenitiesNeeded(city.population);
  const balance = have - needed;
  const tier = amenityTier(balance);

  // --- totals -------------------------------------------------------------------
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
      empireGrowthMult(state) *
      m.growthMult;
  }
  const growthNeeded = growthFoodNeeded(city.population);
  const turnsToGrow = effective > 0 ? Math.ceil((growthNeeded - city.foodBox) / effective) : null;

  // --- border growth ---------------------------------------------------------
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
