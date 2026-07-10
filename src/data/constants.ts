/**
 * Core rule constants and formulas (base Civ 6, eyeballed where noted).
 */

export const MAP_SIZES = {
  duel: { name: 'Duel (44×26)', width: 44, height: 26 },
  tiny: { name: 'Tiny (60×38)', width: 60, height: 38 },
  small: { name: 'Small (74×46)', width: 74, height: 46 },
  standard: { name: 'Standard (84×54)', width: 84, height: 54 },
} as const;

export type MapSizeId = keyof typeof MAP_SIZES;

/** Minimum distance between city centers.
 * P4/D-5: real Civ 6 blocks settling within 3 tiles of any center. */
export const CITY_MIN_DIST = 4;

/** Tiles a city can work / place districts in (rings from the center). */
export const CITY_WORK_RADIUS = 3;

/** Borders can grow culturally out to this many rings. */
export const BORDER_MAX_RADIUS = 5;

/** Culture needed for a city's next border expansion (n = tiles acquired so
 * far). P4/D-16: the real Civ 6 curve, 10 + (6t)^1.3 with t the 1-based tile
 * count — first tile still ~20, but later tiles cost properly more. */
export function borderGrowthCost(n: number): number {
  return Math.floor(10 + Math.pow(6 * (n + 1), 1.3));
}

// (P4/D-17: the old culture-cost×4 tile pricing died — tilePurchaseCost now
// carries the real ring/progress/purchased schedule directly.)

/** Gold price of buying a building/unit = production cost × this (Civ 6). */
/** Game-speed cost multiplier (GS-1): Online-ish pace. All production AND
 * research costs scale by this so the whole game accelerates uniformly
 * (~1/0.6 = 1.67x faster), pulling the plateau earlier. Purchases (x4 the
 * production cost) inherit it automatically. */
export const GAME_SPEED = 0.6;

export const GOLD_PURCHASE_MULT = 4;
/** Faith price of buying a worship building = production cost × this. */
export const FAITH_PURCHASE_MULT = 2;

export const FOOD_PER_CITIZEN = 2;

/** Each citizen contributes these yields directly (Civ 6). */
export const CITIZEN_SCIENCE = 0.7;
export const CITIZEN_CULTURE = 0.3;

/** Worked city-center tile is floored to these yields. */
export const CITY_CENTER_MIN_FOOD = 2;
export const CITY_CENTER_MIN_PRODUCTION = 1;

/** Food needed to grow from `pop` to `pop`+1 (Civ 6 formula). */
export function growthFoodNeeded(pop: number): number {
  return Math.floor(15 + 8 * (pop - 1) + Math.pow(pop - 1, 1.5));
}

/** Growth multiplier from spare housing (housing - population). */
export function housingGrowthFactor(remaining: number): number {
  if (remaining >= 2) return 1;
  if (remaining >= 1) return 0.5;
  return 0.25;
}

/** Amenities a city needs (none for the first 2 citizens, then 1 per 2). */
export function amenitiesNeeded(pop: number): number {
  return Math.max(0, Math.ceil((pop - 2) / 2));
}

export interface AmenityTier {
  name: string;
  growthFactor: number;
  /** Multiplier on non-food yields. */
  yieldFactor: number;
}

/** Tier from amenity balance (have - needed). P4/D-12: real Civ 6 bands —
 * Content is exactly 0, Displeased −1..−2, Unhappy −3 and below (the Unrest/
 * Revolt tiers below that are unimplemented: no rebel mechanics here). */
export function amenityTier(balance: number): AmenityTier {
  if (balance >= 3) return { name: 'Ecstatic', growthFactor: 1.2, yieldFactor: 1.1 };
  if (balance >= 1) return { name: 'Happy', growthFactor: 1.1, yieldFactor: 1.05 };
  if (balance >= 0) return { name: 'Content', growthFactor: 1, yieldFactor: 1 };
  if (balance >= -2) return { name: 'Displeased', growthFactor: 0.85, yieldFactor: 0.95 };
  return { name: 'Unhappy', growthFactor: 0.7, yieldFactor: 0.9 };
}

/** Housing from city-site water access. */
export const HOUSING_FRESH_WATER = 5;
export const HOUSING_COASTAL = 3;
export const HOUSING_NO_WATER = 2;
/** Aqueduct: +2 if the city already has fresh water, else raises water housing to 6. */
export const AQUEDUCT_FRESH_BONUS = 2;
export const AQUEDUCT_NO_FRESH_TOTAL = 6;

/** Each unique improved luxury gives +1 amenity to this many neediest cities. */
export const LUXURY_AMENITY_CITIES = 4;

/** Range (tiles from the district) of regional building effects. */
export const REGIONAL_RANGE = 6;

/** One specialty district allowed at pop 1, +1 per 3 population. */
export function maxSpecialtyDistricts(pop: number): number {
  return Math.floor((pop - 1) / 3) + 1;
}

export const CITY_NAMES = [
  'Aurelia', 'Brightwater', 'Cedarholm', 'Dunmore', 'Eastgate', 'Fairhaven',
  'Goldcrest', 'Highbury', 'Ironvale', 'Jadeport', 'Kingsmere', 'Larkspur',
  'Mistral', 'Northwind', 'Oakenshield', 'Pinecrest', 'Quarrytown', 'Ravenrock',
  'Silverbrook', 'Thornfield', 'Umberlight', 'Vantage', 'Westmarch', 'Yarrow',
  'Zephyria', 'Ashford', 'Briarwood', 'Coldspring', 'Dawnstar', 'Elmsworth',
  'Foxglove', 'Greyharbor', 'Hollowbrook', 'Ivorygate', 'Juniper', 'Kestrel',
];
