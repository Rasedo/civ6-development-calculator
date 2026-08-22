/**
 * Core rule constants and formulas (base Civ 6). The WATER-HOUSING block is
 * sourced against the wiki, all five values confirmed; the rest of this file
 * has NOT been swept (AUDIT B-D).
 */

export const MAP_SIZES = {
  duel: { name: 'Duel (44×26)', width: 44, height: 26 },
  tiny: { name: 'Tiny (60×38)', width: 60, height: 38 },
  small: { name: 'Small (74×46)', width: 74, height: 46 },
  standard: { name: 'Standard (84×54)', width: 84, height: 54 },
} as const;

export type MapSizeId = keyof typeof MAP_SIZES;

/** Minimum distance between city centers.
 * Real Civ 6 blocks settling within 3 tiles of any center. */

export const CITY_WORK_RADIUS = 3;

export const BORDER_MAX_RADIUS = 5;

/** Culture needed for a city's next border expansion (n = tiles acquired so
 * far). The real Civ 6 curve, 10 + (6t)^1.3 with t the 1-based tile
 * count — first tile still ~20, but later tiles cost properly more. */
export function borderGrowthCost(n: number): number {
  return Math.floor(10 + Math.pow(6 * (n + 1), 1.3));
}


/** Gold price of buying a building/unit = production cost × this (Civ 6). */
export const GAME_SPEED = 0.6;

export const GOLD_PURCHASE_MULT = 4;
export const FAITH_PURCHASE_MULT = 2;

export const FOOD_PER_CITIZEN = 2;

/** EMBARK: flat movement points a land unit has while EMBARKED (on
 * water). Tech upgrades to embarked movement are unmodeled. Water tiles enter
 * at cost 1; embark/disembark transitions cost ALL remaining MP (real Civ 6). */
export const EMBARK_MOVES = 2;

/**
 * CIV6 (Combat, "Attacking embarked units"): an embarked unit defends at a
 * Combat Strength "normalized for all unit classes", which "is used when
 * embarked units are defending, depends on the owner's current technological
 * era (not the World Era), and is updated upon discovery of the first
 * technology or civic of that era". Indexed by `ERAS`. The published list
 * starts at Classical — embarking needs a Classical technology, so the Ancient
 * row repeats the first stated tier rather than inventing one. NO terrain,
 * fortify, support or class terms ride on top: the class is what the
 * normalization removes.
 */
export const EMBARKED_DEFENSE_CS_BY_ERA: readonly number[] = [15, 15, 15, 30, 35, 50, 55, 55, 55];

/** master switch for the LIVE scripted WATER movement (the seat
 * war-march taking water steps). N1 lands the full embark/movement MODEL and
 * plumbing but keeps the scripted water-stepping INERT (false): turning it on
 * needs the N2 embarked/naval COMBAT overrides AND embark-aware peace-act /
 * patrol — an embarked unit surviving into a peace turn is otherwise an
 * incoherent intermediate state that cannot be mirrored TS↔GPU cleanly. With
 * `live=false` every walker stays land-only and the gates are byte-identical to
 * the pre-N1 base. N2 flips it true alongside the rest of the naval package.
 * The exporter ships it as rules.embarkLive so the GPU mirror stays in lockstep;
 * tests poke both engines (setEmbarkLive / sim._embark_live) to exercise the
 * water-step path. */
export const embarkState = { live: true };
export function setEmbarkLive(v: boolean): void {
  embarkState.live = v;
}

/** Each citizen contributes these yields directly (Civ 6). */
export const CITIZEN_SCIENCE = 0.5;
export const CITIZEN_CULTURE = 0.3;

export const CITY_CENTER_MIN_FOOD = 2;
export const CITY_CENTER_MIN_PRODUCTION = 1;

/** Food needed to grow from `pop` to `pop`+1 (Civ 6 formula). */
export function growthFoodNeeded(pop: number): number {
  return Math.floor(15 + 8 * (pop - 1) + Math.pow(pop - 1, 1.5));
}

export function housingGrowthFactor(remaining: number): number {
  if (remaining >= 2) return 1;
  if (remaining >= 1) return 0.5;
  return 0.25;
}

export function amenitiesNeeded(pop: number): number {
  return Math.max(0, Math.ceil((pop - 2) / 2));
}

export interface AmenityTier {
  name: string;
  growthFactor: number;
  yieldFactor: number;
}

/** Tier from amenity balance (have - needed). Real Civ 6 bands —
 * Content is exactly 0, Displeased −1..−2, Unhappy −3 and below (the Unrest/
 * Revolt tiers below that are unimplemented: no rebel mechanics here). */
export function amenityTier(balance: number): AmenityTier {
  if (balance >= 3) return { name: 'Ecstatic', growthFactor: 1.2, yieldFactor: 1.1 };
  if (balance >= 1) return { name: 'Happy', growthFactor: 1.1, yieldFactor: 1.05 };
  if (balance >= 0) return { name: 'Content', growthFactor: 1, yieldFactor: 1 };
  if (balance >= -2) return { name: 'Displeased', growthFactor: 0.85, yieldFactor: 0.95 };
  return { name: 'Unhappy', growthFactor: 0.7, yieldFactor: 0.9 };
}

/**
 * Housing from city-site water access.
 *
 * SOURCING SWEEP: VERIFIED CORRECT against the Civilization
 * wiki's Housing / Aqueduct pages — real Civ 6 gives 5 Housing for fresh water
 * (river/lake/oasis), 3 for coastal and 2 for no water, and the Aqueduct raises
 * a non-fresh city to a TOTAL of 6 (so +4 landlocked, +3 coastal) while adding
 * a flat +2 to a city that already has fresh water. All five values below
 * already matched; no change was needed. Recorded so the next sweep does not
 * re-derive it.
 */
export const HOUSING_FRESH_WATER = 5;
export const HOUSING_COASTAL = 3;
export const HOUSING_NO_WATER = 2;
export const AQUEDUCT_FRESH_BONUS = 2;
export const AQUEDUCT_NO_FRESH_TOTAL = 6;

export const LUXURY_AMENITY_CITIES = 4;

export const REGIONAL_RANGE = 6;

/**
 * CIV6 (GS): "each source produces a certain number of the resource per turn,
 * which is then added to your stockpile" — the number is the improved tile's
 * own GS yield, per resource page. An unimproved or pillaged source produces
 * nothing, which is the same predicate `civHasStrategic` already asks.
 */
export const STRATEGIC_PER_TURN: Record<string, number> = {
  HORSES: 2, IRON: 2, NITER: 2, COAL: 3, OIL: 3, ALUMINUM: 2, URANIUM: 3,
};

/** The stockpile index space: one slot per strategic resource, in the order
 *  above. Both engines address a stockpile by slot, and the wire ships the
 *  slot -> resource-table mapping so a tile's `rid` can find it. */
export const STRATEGIC_IDS: string[] = Object.keys(STRATEGIC_PER_TURN);

/** A fresh, empty bank — the one place the stockpile's shape is written. */
export function emptyStockpile(): number[] {
  return STRATEGIC_IDS.map(() => 0);
}

/** CIV6 (GS): "The maximum stockpile amount is initially 50 for each resource
 *  but constructing Encampment buildings in your empire (Barracks, Armory,
 *  etc.) will increase your maximum stockpile by 10 per building for all
 *  resources." */
export const STOCKPILE_CAP_BASE = 50;
export const STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING = 10;

/** CIV6 (GS): every unit in this roster that asks for a strategic resource
 *  asks for 20 of it, paid "at the moment you start production (or the moment
 *  you purchase it)" — Horseman, Swordsman, Knight, Musketman and Bombard each
 *  say so on their own page. */
export const UNIT_RESOURCE_COST = 20;

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
