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

/**
 * THE MOVEMENT UNIT. CIV6 publishes a route's movement cost in QUARTERS of a
 * point — 1.0 for the Ancient and Classical Road, 0.75 for the Industrial,
 * 0.5 for the Modern and 0.25 for the Railroad — so a quarter point is what
 * this engine counts in. Every catalog figure below stays in WHOLE points and
 * is multiplied where it enters, which is `unitFullMoves` and nowhere else.
 */
export const MP_SCALE = 4;

/**
 * THE ROAD LADDER. CIV6: "Roads are upgraded by researching technologies, or
 * more specifically, by reaching specific eras. Upon doing so, all roads in
 * your territory will upgrade to the next level automatically." Each tier's
 * own Civilopedia page gives its Movement Cost and whether it bridges:
 *   Ancient 1.0 no bridges | Classical 1.0 bridges
 *   Industrial 0.75 bridges | Modern 0.5 bridges
 * The tier is the WORLD's era count here, latched where the era boundary
 * already fires in lockstep on both engines — "your territory" is a per-seat
 * reading this model does not carry.
 */
export const ROAD_TIER_MP: readonly number[] = [4, 4, 3, 2];
export const ROAD_TIER_BRIDGES: readonly boolean[] = [false, true, true, true];
/** the world-era index at which each road tier arrives, ascending. */
export const ROAD_TIER_ERA: readonly number[] = [0, 1, 4, 5];

/** CIV6 (Railroad): "Movement Cost 0.25", and it "Creates Bridges over
 *  Rivers" like every tier above the Ancient road. */
export const RAILROAD_MP = 1;

/** what EMBARKING or DISEMBARKING costs on top of the step, unless a Harbor
 *  or a coastal City Center makes the dock free. Two whole points. */
export const EMBARK_TRANSITION_MP = 2 * MP_SCALE;

/** CIV6 (Railroad): the tech that unlocks it, and the resources one tile
 *  costs — "does not cost a charge, but does cost 1 Iron and 1 Coal". */
export const RAILROAD_TECH = 'STEAM_POWER';
export const RAILROAD_COST: readonly (readonly [string, number])[] = [['IRON', 1], ['COAL', 1]];

/**
 * EMBARK: the movement points a land unit has while EMBARKED (on water).
 * CIV6 (Movement): "Embarked units have 2 Movement in the Classical Era;
 * the following techs each add more: Square Rigging (+1), Steam Power (+2) and
 * Combustion (+1)." Water tiles enter at cost 1.
 */
export const EMBARK_MOVES = 2;
export const EMBARK_MOVE_TECHS: readonly (readonly [string, number])[] = [
  ['SQUARE_RIGGING', 1], ['STEAM_POWER', 2], ['COMBUSTION', 1],
];

/**
 * CIV6 (Movement): "all units moving at sea (including embarked land units)
 * receive +1 Movement after researching Mathematics. Note that this detail
 * doesn't appear anywhere in the Civilopedia information on naval units, so
 * you shouldn't be surprised to see 5 Movement on a Frigate when its
 * Civilopedia entry says it has only 4." So it rides on the chassis stat
 * rather than being folded into it, and reaches HULLS as well as passengers.
 */
export const SEA_MOVE_TECH = 'MATHEMATICS';
export const SEA_MOVE_TECH_BONUS = 1;

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

/** CIV6 (GlobalParameters.xml): COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20 —
 *  the one number the install publishes beside the cavalry capture's
 *  permission. The curve through it is this model's (STYLIZED, owner ruling
 *  2026-09-04): an even fight is a coin flip, certain at +base, nothing at
 *  -base — see `captureRoll`. */
export const CAPTURE_BASE_STRENGTH_DIFF = 20;
/** the hit points a captured unit arrives with — STYLIZED, no source */
export const CAPTURED_UNIT_HP = 25;

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
export const AMENITY_TIERS: readonly (AmenityTier & { min: number })[] = [
  { min: 3, name: 'Ecstatic', growthFactor: 1.2, yieldFactor: 1.1 },
  { min: 1, name: 'Happy', growthFactor: 1.1, yieldFactor: 1.05 },
  { min: 0, name: 'Content', growthFactor: 1, yieldFactor: 1 },
  { min: -2, name: 'Displeased', growthFactor: 0.85, yieldFactor: 0.95 },
  { min: -999, name: 'Unhappy', growthFactor: 0.7, yieldFactor: 0.9 },
];

export function amenityTier(balance: number): AmenityTier {
  return AMENITY_TIERS.find((t) => balance >= t.min) ?? AMENITY_TIERS[AMENITY_TIERS.length - 1];
}

/** The tier's WIRE index — the row order both engines address a tier by. */
export function amenityTierIndex(name: string): number {
  return AMENITY_TIERS.findIndex((t) => t.name === name);
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
/** How far a Trader's road-laying walk may reach in one leg. It lives here,
 *  in a LEAF module: `TRADE_WALK_EXPIRY_RAIL` is computed from it at module
 *  load, and a cycle between trade.ts and units.ts would leave that NaN. */
export const TRADE_ROAD_MAX_STEPS = 32;

export const STOCKPILE_CAP_BASE = 50;
export const STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING = 10;

/** CIV6 (GS): every unit in this roster that asks for a strategic resource
 *  asks for 20 of it, paid "at the moment you start production (or the moment
 *  you purchase it)" — Horseman, Swordsman, Knight, Musketman and Bombard each
 *  say so on their own page. */
export const UNIT_RESOURCE_COST = 20;

/** CIV6 (Resource, GS): a unit whose seat could not meet its fuel bill this
 *  turn fights at "-20 Insufficient <resource>" (the combat preview's line) —
 *  GlobalParameters COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL, a flat 20. */
export const FUEL_SHORT_CS = 20;

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
