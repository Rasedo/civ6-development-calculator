/**
 * City mechanics: housing, amenities, citizen tile assignment, growth math.
 * `computeCityStats` is the single entry point used by the UI and turn loop.
 */

import { addYields, emptyYields, type City, type GameState, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin } from './hex';
import { hasFreshWater, isCoastalLand, isImpassable } from './query';
import { tileYields, cityDistrictYields, cityBuildingYields, regionalEffects, localBuildingAmenities } from './yields';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import {
  CITY_WORK_RADIUS,
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
  };
  /** Final per-turn yields (amenity modifier applied to non-food). */
  total: Yields;
  foodSurplus: number;
  /** Surplus after growth modifiers (what actually enters the food box). */
  effectiveFoodSurplus: number;
  growthNeeded: number;
  /** Turns until next citizen; null if not growing. */
  turnsToGrow: number | null;
}

/** Tiles a city could work: owned, in range, passable, not a district tile. */
export function workableTiles(state: GameState, city: City): Tile[] {
  const center = state.map.tiles[city.centerIndex];
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS).filter(
    (t) => t.cityId === city.id && t.index !== city.centerIndex && !t.district && !isImpassable(t),
  );
}

const FOCUS_BASE: Record<YieldKey, number> = {
  food: 2,
  production: 2,
  gold: 1,
  science: 1,
  culture: 1,
  faith: 1,
};

function tileScore(y: Yields, focus: FocusId): number {
  let score = 0;
  for (const k of Object.keys(FOCUS_BASE) as YieldKey[]) {
    let w = FOCUS_BASE[k];
    if (focus !== 'balanced' && focus === k) w += 3;
    score += y[k] * w;
  }
  return score;
}

/** Pick which tiles the city's citizens work: locked tiles first, then best score. */
export function assignWorkedTiles(state: GameState, city: City): number[] {
  const candidates = workableTiles(state, city);
  const scored = candidates
    .map((t) => ({ index: t.index, score: tileScore(tileYields(t), city.focus) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const lockedValid = city.lockedTiles.filter((i) => candidates.some((c) => c.index === i));
  const worked: number[] = lockedValid.slice(0, city.population);
  for (const s of scored) {
    if (worked.length >= city.population) break;
    if (!worked.includes(s.index)) worked.push(s.index);
  }
  return worked;
}

/** City-center tile yields, floored per Civ 6. */
export function tileYieldsForCenter(center: Tile): Yields {
  const y = tileYields({ ...center, district: null });
  y.food = Math.max(y.food, CITY_CENTER_MIN_FOOD);
  y.production = Math.max(y.production, CITY_CENTER_MIN_PRODUCTION);
  return y;
}

/** Housing from water access, districts, buildings and improvements. */
export function computeHousing(state: GameState, city: City): number {
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
    if (map.tiles[d.tileIndex].districtComplete) total += DISTRICTS[d.type].housing;
  }
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def?.housing) total += def.housing;
  }
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (t.cityId !== city.id || !t.improvement) continue;
    total += IMPROVEMENTS[t.improvement as ImprovementId].housing;
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

export function computeCityStats(
  state: GameState,
  city: City,
  luxMap?: Map<number, number>,
): CityStats {
  const map = state.map;
  const center = map.tiles[city.centerIndex];

  // --- worked tiles ---------------------------------------------------------
  const worked = assignWorkedTiles(state, city);
  const tiles = emptyYields();
  // The city-center tile is worked for free.
  addYields(tiles, tileYieldsForCenter(center));
  for (const i of worked) addYields(tiles, tileYields(map.tiles[i]));

  // --- districts & buildings -------------------------------------------------
  const districts = cityDistrictYields(map, city);
  const buildings = cityBuildingYields(map, city);
  const regional = regionalEffects(state, city);
  addYields(buildings, regional.yields);

  const citizens = emptyYields();
  citizens.science = city.population * CITIZEN_SCIENCE;
  citizens.culture = city.population * CITIZEN_CULTURE;

  // --- housing & amenities -----------------------------------------------------
  const housing = computeHousing(state, city);
  const have =
    localBuildingAmenities(city) +
    regional.amenities +
    ((luxMap ?? luxuryAmenities(state)).get(city.id) ?? 0);
  const needed = amenitiesNeeded(city.population);
  const balance = have - needed;
  const tier = amenityTier(balance);

  // --- totals -------------------------------------------------------------------
  const total = emptyYields();
  addYields(total, tiles);
  addYields(total, districts);
  addYields(total, buildings);
  addYields(total, citizens);
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as YieldKey[]) {
    total[k] *= tier.yieldFactor;
  }

  const foodSurplus = total.food - city.population * FOOD_PER_CITIZEN;
  let effective = foodSurplus;
  if (foodSurplus > 0) {
    effective = foodSurplus * housingGrowthFactor(housing - city.population) * tier.growthFactor;
  }
  const growthNeeded = growthFoodNeeded(city.population);
  const turnsToGrow = effective > 0 ? Math.ceil((growthNeeded - city.foodBox) / effective) : null;

  return {
    city,
    housing,
    amenities: { have, needed, balance, tier },
    workedTiles: worked,
    breakdown: { tiles, districts, buildings, citizens },
    total,
    foodSurplus,
    effectiveFoodSurplus: effective,
    growthNeeded,
    turnsToGrow,
  };
}
