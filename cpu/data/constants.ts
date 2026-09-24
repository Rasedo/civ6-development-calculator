/**
 * Core rule constants and formulas (base Civ 6). The WATER-HOUSING block is
 * sourced against the wiki, all five values confirmed; the rest of this file
 * has NOT been swept (AUDIT B-D).
 */

import { srcConst, xml } from './provenance';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

/** Minimum distance between city centers.
 * Real Civ 6 blocks settling within 3 tiles of any center. */

export const CITY_WORK_RADIUS = srcConst('seats.workRadius', 3,
  { ...gp('CITY_MIN_RANGE'), note: 'the settle-distance floor; this engine reads the same 3 as the work radius' });

export const BORDER_MAX_RADIUS = srcConst('constants.BORDER_MAX_RADIUS', 5,
  gp('PLOT_INFLUENCE_MAX_ACQUIRE_DISTANCE'));

/** Culture needed for a city's next border expansion (n = tiles acquired so
 * far). The real Civ 6 curve, 10 + (6t)^1.3 with t the 1-based tile
 * count — first tile still ~20, but later tiles cost properly more. */
export function borderGrowthCost(n: number): number {
  return Math.floor(10 + Math.pow(6 * (n + 1), 1.3));
}

/** Gold price of buying a building/unit = production cost × this (Civ 6). */
export const GAME_SPEED = srcConst('gameSpeed', 0.6, {
  stylized: 'the COMPRESSION this engine plays at — every install production cost passes through '
    + 'it; the install\'s own GameSpeeds table has no 0.6 row',
});

/** THE PURCHASE PRICE, measured live (lab 2 scene G — all 302 priced rows of
 *  one city fitted, then a real 445-gold transaction; runs/purchase_*.jsonl):
 *  `price = floor(mult × C / PURCHASE_DIVISOR) × PURCHASE_DIVISOR`, mult 4 for
 *  gold and 2 for faith, C the CITY's speed-scaled production cost. FLOOR,
 *  never nearest (a Slinger at cost 17 buys for 65 gold and 30 faith), and
 *  progress already invested never lowers it. The install's
 *  GOLD_PURCHASE_MULTIPLIER 2 is the gold-to-faith RATIO, not the multiplier
 *  on the cost; the faith rate is the same 2 for every chassis, land combat
 *  units included. `goldPrice` / `faithPrice` apply the floor last. */
export const GOLD_PURCHASE_MULT = srcConst('scenario.goldPurchaseMult', 4, {
  lab: 'runs/purchase_20260920T181359Z.jsonl',
  note: 'the install publishes GOLD_PURCHASE_MULTIPLIER 2 — the gold price is twice the faith price, and the faith price is 2 × the cost',
});
export const FAITH_PURCHASE_MULT = srcConst('scenario.faithPurchaseMult', 2, {
  lab: 'runs/purchase_20260920T181359Z.jsonl',
  note: 'no install row carries the faith rate; measured 2 × the scaled cost on every priced chassis and building',
});
export const PURCHASE_DIVISOR = srcConst('scenario.purchaseDivisor', 5, gp('PURCHASE_DIVISOR'));

export const FOOD_PER_CITIZEN = srcConst('foodPerCitizen', 2,
  gp('CITY_FOOD_CONSUMPTION_PER_POPULATION'));

/**
 * THE MOVEMENT UNIT. CIV6 publishes a route's movement cost in QUARTERS of a
 * point — 1.0 for the Ancient and Classical Road, 0.75 for the Industrial,
 * 0.5 for the Modern and 0.25 for the Railroad — so a quarter point is what
 * this engine counts in. Every catalog figure below stays in WHOLE points and
 * is multiplied where it enters, which is `unitFullMoves` and nowhere else.
 */
export const MP_SCALE = srcConst('mpScale', 4, {
  stylized: 'the QUARTER point — the unit this engine counts movement in, so the install\'s '
    + '1.0 / 0.75 / 0.5 / 0.25 route costs are whole numbers here',
});

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
export const ROAD_TIER_MP: readonly number[] = srcConst('roadTierMp', [4, 4, 3, 2], {
  derived: 'Routes.MovementCost x MP_SCALE for ROUTE_ANCIENT_ROAD, ROUTE_MEDIEVAL_ROAD, '
    + 'ROUTE_INDUSTRIAL_ROAD, ROUTE_MODERN_ROAD in that order (1, 1, 0.75, 0.50)',
  inputs: [
    xml('Routes', 'RouteType=ROUTE_ANCIENT_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_MEDIEVAL_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_INDUSTRIAL_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_MODERN_ROAD', 'MovementCost'),
  ],
});
export const ROAD_TIER_BRIDGES: readonly boolean[] = [false, true, true, true];
/** the world-era index at which each road tier arrives, ascending. */
export const ROAD_TIER_ERA: readonly number[] = srcConst('roadTierEra', [0, 1, 4, 5], {
  derived: 'the ChronologyIndex of each road tier\'s Routes.PrereqEra, zero-based (the Ancient '
    + 'road carries none): ERA_CLASSICAL 1, ERA_INDUSTRIAL 4, ERA_MODERN 5',
  inputs: [
    xml('Routes', 'RouteType=ROUTE_MEDIEVAL_ROAD', 'PrereqEra'),
    xml('Routes', 'RouteType=ROUTE_INDUSTRIAL_ROAD', 'PrereqEra'),
    xml('Routes', 'RouteType=ROUTE_MODERN_ROAD', 'PrereqEra'),
  ],
});

/** CIV6 (Railroad): "Movement Cost 0.25", and it "Creates Bridges over
 *  Rivers" like every tier above the Ancient road. */
export const RAILROAD_MP = srcConst('railroadMp', 1,
  xml('Routes', 'RouteType=ROUTE_RAILROAD', 'MovementCost', { scale: MP_SCALE }));

/** what EMBARKING or DISEMBARKING costs on top of the step, unless a Harbor
 *  or a coastal City Center makes the dock free. Two whole points. */
export const EMBARK_TRANSITION_MP = srcConst('embarkTransitionMp', 2 * MP_SCALE, {
  derived: 'MOVEMENT_EMBARK_COST x MP_SCALE — the install writes the dock in whole points, this '
    + 'engine in quarters',
  inputs: [gp('MOVEMENT_EMBARK_COST')],
});

/** CIV6 (Railroad): the tech that unlocks it, and the resources one tile
 *  costs — "does not cost a charge, but does cost 1 Iron and 1 Coal". */
export const RAILROAD_TECH = srcConst('constants.RAILROAD_TECH', 'STEAM_POWER',
  xml('Routes_XP2', 'RouteType=ROUTE_RAILROAD', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }));
export const RAILROAD_COST: readonly (readonly [string, number])[] = [['IRON', 1], ['COAL', 1]];

/**
 * EMBARK: the movement points a land unit has while EMBARKED (on water).
 * CIV6 (Movement): "Embarked units have 2 Movement in the Classical Era;
 * the following techs each add more: Square Rigging (+1), Steam Power (+2) and
 * Combustion (+1)." Water tiles enter at cost 1.
 */
export const EMBARK_MOVES = srcConst('combat.embarkMoves', 2, gp('MOVEMENT_WHILE_EMBARKED_BASE'));
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
export const SEA_MOVE_TECH = srcConst('constants.SEA_MOVE_TECH', 'MATHEMATICS',
  xml('Technologies', 'TechnologyType=TECH_MATHEMATICS', 'TechnologyType',
    { expect: 'TECH_MATHEMATICS' }));
export const SEA_MOVE_TECH_BONUS = srcConst('constants.SEA_MOVE_TECH_BONUS', 1, {
  pedia: 'the GS Civilopedia Movement page ("+1 Movement after researching Mathematics" to every '
    + 'unit at sea); the install carries it as a modifier, not as a readable column',
});

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
export const EMBARKED_DEFENSE_CS_BY_ERA: readonly number[] =
  srcConst('combat.embarkedDefenseCsByEra', [15, 15, 15, 30, 35, 50, 55, 55, 55], {
    derived: 'Eras.EmbarkedUnitStrength in ChronologyIndex order, with the ANCIENT row repeating '
      + 'the Classical tier (the install writes 10 there; embarking needs a Classical technology, '
      + 'so this engine never reads an Ancient embark)',
    inputs: [xml('Eras', 'EraType=ERA_CLASSICAL', 'EmbarkedUnitStrength')],
  });

/** CIV6 (GlobalParameters.xml): COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20 —
 *  the one number the install publishes beside the cavalry capture's
 *  permission. The curve through it is this model's (STYLIZED, owner
 *  ruling): an even fight is a coin flip, certain at +base, nothing at
 *  -base — see `captureRoll`. */
export const CAPTURE_BASE_STRENGTH_DIFF = srcConst('combat.captureBaseDiff', 20,
  gp('COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE'));
/** the hit points a captured unit arrives with — STYLIZED, no source */
export const CAPTURED_UNIT_HP = srcConst('combat.capturedHp', 25,
  { stylized: 'the hit points a captured unit arrives with; the install publishes none' });

/** master switch for WATER movement (a land unit embarking and taking water
 * steps). It is on: walkers embark under the full embark/movement model and
 * the embarked/naval combat overrides. With `live=false` every walker stays
 * land-only. The exporter ships it as rules.embarkLive so the GPU mirror
 * (`_embark_live`) stays in lockstep; tests flip it with setEmbarkLive. */
export const embarkState = { live: true };
export function setEmbarkLive(v: boolean): void {
  embarkState.live = v;
}

/** Each citizen contributes these yields directly (Civ 6). */
export const CITIZEN_SCIENCE = srcConst('citizenScience', 0.5, {
  derived: 'SCIENCE_PERCENTAGE_YIELD_PER_POP / 100 — the install writes the share as a percentage',
  inputs: [gp('SCIENCE_PERCENTAGE_YIELD_PER_POP')],
});
export const CITIZEN_CULTURE = srcConst('citizenCulture', 0.3, {
  derived: 'CULTURE_PERCENTAGE_YIELD_PER_POP / 100 — the install writes the share as a percentage',
  inputs: [gp('CULTURE_PERCENTAGE_YIELD_PER_POP')],
});

export const CITY_CENTER_MIN_FOOD = srcConst('centerMinFood', 2,
  gp('YIELD_FOOD_CITY_TERRAIN_REPLACE'));
/** CIV6 (GlobalParameters, PILLAGE_BUILDING_REPAIR_PERCENT 25): a pillaged
 *  building is repaired from its city's queue for this share of its price. */
export const PILLAGE_BUILDING_REPAIR_PERCENT = srcConst('pillageBuildingRepairPct', 25,
  gp('PILLAGE_BUILDING_REPAIR_PERCENT'));
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

/** CIV6 (CITY_POP_PER_AMENITY 2): a city needs one Amenity per this many
 *  citizens, rounded up — the need `GetAmenitiesNeeded` reads in the live
 *  game (1 at pop 1, 2 at 4, 3 at 5 and 6, 4 at 7, 5 at 9, 6 at 12, 7 at 13),
 *  and the tier is the named supply less exactly that. */
export const CITY_POP_PER_AMENITY = srcConst('amenityPopPer', 2, gp('CITY_POP_PER_AMENITY'));

export function amenitiesNeeded(pop: number): number {
  return Math.ceil(pop / CITY_POP_PER_AMENITY);
}

export interface AmenityTier {
  name: string;
  growthFactor: number;
  yieldFactor: number;
}

/** Tier from amenity balance (have - needed). CIV6 (`Happinesses`, all seven
 * rows, as `Expansion2_Buildings.xml`'s updates leave them):
 * `MinimumAmenityScore` is `min`, `GrowthModifier` and `NonFoodYieldModifier`
 * are the two factors as 1 + pct/100 — Ecstatic 5+, Happy 3..4, Content
 * 0..2, Displeased −1..−2, Unhappy −3..−4, Unrest −5..−6, Revolt −7 and
 * below. The rows' `RebellionPoints` are not modelled. */
export const AMENITY_TIERS: readonly (AmenityTier & { min: number })[] = [
  { min: 5, name: 'Ecstatic', growthFactor: 1.2, yieldFactor: 1.2 },
  { min: 3, name: 'Happy', growthFactor: 1.1, yieldFactor: 1.1 },
  { min: 0, name: 'Content', growthFactor: 1, yieldFactor: 1 },
  { min: -2, name: 'Displeased', growthFactor: 0.85, yieldFactor: 0.9 },
  { min: -4, name: 'Unhappy', growthFactor: 0.7, yieldFactor: 0.8 },
  { min: -6, name: 'Unrest', growthFactor: 0, yieldFactor: 0.7 },
  { min: -999, name: 'Revolt', growthFactor: 0, yieldFactor: 0.6 },
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
const housingWiki = (what: string) => ({
  pedia: `the GS Housing / Aqueduct pages (${what}); the install carries city-site housing as a `
    + 'DLL rule, not as a readable column',
});
export const HOUSING_FRESH_WATER = srcConst<number>('housing.fresh', 5,
  housingWiki('5 for fresh water'));
export const HOUSING_COASTAL = srcConst<number>('housing.coastal', 3, housingWiki('3 for coastal'));
export const HOUSING_NO_WATER = srcConst<number>('housing.none', 2, housingWiki('2 for no water'));
export const AQUEDUCT_FRESH_BONUS = srcConst('housing.aqFreshBonus', 2,
  gp('CITY_POPULATION_AQUEDUCT_BOOST'));
export const AQUEDUCT_NO_FRESH_TOTAL = srcConst('housing.aqNoFreshTotal', 6,
  gp('CITY_POPULATION_AQUEDUCT_MIN'));

export const LUXURY_AMENITY_CITIES = 4;

export const REGIONAL_RANGE = 6;

/**
 * CIV6 (GS): "each source produces a certain number of the resource per turn,
 * which is then added to your stockpile" — the number is the improved tile's
 * own GS yield, per resource page. An unimproved or pillaged source produces
 * nothing, which is the same predicate `civHasStrategic` already asks.
 */
const perTurn = (res: string, n: number) => srcConst(`strategic.rate.${res}`, n, {
  pedia: `the GS ${res.charAt(0)}${res.slice(1).toLowerCase()} resource page — the improved tile's `
    + 'own per-turn stockpile yield; the install writes it as an improvement modifier, '
    + 'not as a Resources column',
});
export const STRATEGIC_PER_TURN: Record<string, number> = {
  HORSES: perTurn('HORSES', 2),
  IRON: perTurn('IRON', 2),
  NITER: perTurn('NITER', 2),
  COAL: perTurn('COAL', 3),
  OIL: perTurn('OIL', 3),
  ALUMINUM: perTurn('ALUMINUM', 2),
  URANIUM: perTurn('URANIUM', 3),
};

/** The stockpile index space: one slot per strategic resource, in the order
 *  above. Both engines address a stockpile by slot, and the wire ships the
 *  slot -> resource-table mapping so a tile's `rid` can find it. */
export const STRATEGIC_IDS: string[] = Object.keys(STRATEGIC_PER_TURN);

/** A fresh, empty bank — the one place the stockpile's shape is written. */
export function emptyStockpile(): number[] {
  return STRATEGIC_IDS.map(() => 0);
}

/** How far a Trader's road-laying walk may reach in one leg. It lives here,
 *  in a LEAF module: `TRADE_WALK_EXPIRY_RAIL` is computed from it at module
 *  load, and a cycle between trade.ts and units.ts would leave that NaN. */
export const TRADE_ROAD_MAX_STEPS = 32;

/** CIV6 (GS): "The maximum stockpile amount is initially 50 for each resource
 *  but constructing Encampment buildings in your empire (Barracks, Armory,
 *  etc.) will increase your maximum stockpile by 10 per building for all
 *  resources." */
export const STOCKPILE_CAP_BASE = srcConst('strategic.capBase', 50, {
  pedia: 'the GS Resources page ("The maximum stockpile amount is initially 50 for each resource"); '
    + 'the install carries the cap as a DLL rule',
});
export const STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING =
  srcConst('strategic.capPerEncampmentBuilding', 10, {
    pedia: 'the GS Resources page ("increase your maximum stockpile by 10 per building")',
  });

/** CIV6 (GS): every unit in this roster that asks for a strategic resource
 *  asks for 20 of it, paid "at the moment you start production (or the moment
 *  you purchase it)" — Horseman, Swordsman, Knight, Musketman and Bombard each
 *  say so on their own page. */
export const UNIT_RESOURCE_COST = srcConst('constants.UNIT_RESOURCE_COST', 20, {
  pedia: 'the GS unit pages (Horseman, Swordsman, Knight, Musketman, Bombard each ask 20 of their '
    + 'strategic resource at the moment production starts)',
});

/** CIV6 (Resource, GS): a unit whose seat could not meet its fuel bill this
 *  turn fights at "-20 Insufficient <resource>" (the combat preview's line) —
 *  GlobalParameters COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL, a flat 20. */
export const FUEL_SHORT_CS = srcConst('strategic.fuelShortCs', 20,
  gp('COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL'));

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

/** CIV6 (GlobalParameters, measured live — tools/civ6lab/reports/lab3_report.md,
 *  "The damage formula itself"): one hit deals
 *  `round((COMBAT_BASE_DAMAGE + rand(COMBAT_MAX_EXTRA_DAMAGE)) × (1 + COMBAT_POWER_SCALING)^(S_att − S_def))`,
 *  floored at COMBAT_MINIMUM_DAMAGE — an integer draw 0..11 and a compound 4% per
 *  strength point. The community's 30·e^(0.04Δ)·(0.8..1.2) agrees only within
 *  |Δ| ≤ 5 and misses by 3 damage at Δ = 30. COMBAT_DAMAGE_MULTIPLIER_MINIMUM
 *  0.25 does NOT floor this multiplier (a Warrior previews 1 against a GDR). */
export const COMBAT_BASE_DAMAGE = srcConst('combat.baseDamage', 24, gp('COMBAT_BASE_DAMAGE'));
export const COMBAT_MAX_EXTRA_DAMAGE = srcConst('combat.maxExtraDamage', 12, gp('COMBAT_MAX_EXTRA_DAMAGE'));
export const COMBAT_POWER_SCALING = srcConst('combat.powerScaling', 0.04, gp('COMBAT_POWER_SCALING'));
export const COMBAT_MINIMUM_DAMAGE = srcConst('combat.minimumDamage', 1, gp('COMBAT_MINIMUM_DAMAGE'));
