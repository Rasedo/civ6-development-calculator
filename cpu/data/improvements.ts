/**
 * Tile improvements (9 total). In units mode a builder places these, spending
 * one of its finite charges, and only where research allows: validImprovementsIn
 * (src/core/rules.ts) gates each on unlocks.improvements plus the hillFarms civic
 * for hill farms. Sandbox mode is the exception — it bypasses all research gating.
 * Yields are base Civ 6 values (pre-tech-boost), every one sourced against the
 * Gathering Storm CIVILOPEDIA. No `eyeballed`/`approximate` markers remain.
 */

import type { DistrictId, ImprovementId, PlunderRow, Yields, YieldKey } from '../core/types';
import type { Elevation, FeatureId, TerrainId } from '../../world/types';
import type { CivId } from './seats';

/**
 * What a neighbour pays a SUZERAIN improvement. Each row counts the
 * neighbours that match ANY of its sources, divides by `per`, and pays
 * `yields` for each whole group. A civic may improve the rate, the payout, or
 * both — which is exactly how the three sourced rows below read.
 */
export interface ImpAdjacency {
  /** count a neighbour carrying a BONUS resource. */
  bonusResource?: boolean;
  /** count a neighbour holding this completed district. */
  district?: DistrictId;
  /** count a neighbour holding ANY completed district. */
  anyDistrict?: boolean;
  /** CIV6 (REQUIREMENT_PLOT_ADJACENT_TO_WONDER): per adjacent COMPLETED world wonder. */
  builtWonder?: boolean;
  /** count a neighbour carrying one of these live features. */
  features?: FeatureId[];
  /** count an adjacent MOUNTAIN (the Terrace Farm's own clause). */
  mountain?: boolean;
  /** count a neighbour carrying THIS improvement. */
  sameImprovement?: boolean;
  /** CIV6 (AdjacentSeaResource): count a neighbour that is WATER and
   *  carries a resource — the Fishery's own adjacency. */
  seaResource?: boolean;
  /** the civic the rule needs before it pays at all. */
  requiresCivic?: string;
  /** the TECH that improves the rule, beside `upgradeCivic`. */
  upgradeTech?: string;
  per: number;
  yields: Partial<Yields>;
  /** the civic that improves the rule, and what it improves it to. */
  upgradeCivic?: string;
  upgradePer?: number;
  upgradeYields?: Partial<Yields>;
  /** count a neighbour carrying a LUXURY resource (the Chateau's Gold, the
   *  Mekewap's late Gold). */
  luxuryResource?: boolean;
  /** count a neighbour standing on one of these terrains (the Ice Hockey
   *  Rink's Tundra and Snow). */
  terrains?: TerrainId[];
  /** count a neighbour carrying THIS NAMED improvement — `sameImprovement`
   *  widened to a row that names somebody else's (the Kurgan's Pasture). */
  improvement?: ImprovementId;
}

export interface ImprovementDef {
  id: ImprovementId;
  name: string;
  code: string;
  yields: Partial<Yields>;
  housing: number;
  resourceOnly: boolean;
  description: string;
  /** the CITY-STATE whose SUZERAIN may build it (a `CITY_STATE_SUZERAIN_BONUS` key). */
  suzerainOf?: string;
  /** CIV6 (Civilizations.xml): a UNIQUE IMPROVEMENT — this civilization's
   *  Builders alone lay it (`validImprovementsIn` / `_uniq_improvement_ok`). */
  uniqueTo?: CivId;
  /** CIV6 (Improvement_ValidFeatures): the ONLY features the row may stand
   *  on; absent leaves the feature unchecked, as the older rows are. */
  features?: FeatureId[];
  /** CIV6 (a SINGLE_PLOT modifier): extra yields while standing on one of
   *  these features (the Sphinx's Floodplains Culture). */
  featureYields?: { features: FeatureId[]; yields: Partial<Yields> };
  /** terrain it may stand on; absent = any land. */
  terrains?: TerrainId[];
  /** terrain it refuses. */
  excludeTerrains?: TerrainId[];
  /** elevations it may stand on; absent = flat and hills alike. */
  elevations?: Elevation[];
  /** may not neighbour another of its own kind. */
  noAdjacentSame?: boolean;
  /** what its neighbours pay it. */
  adjacency?: ImpAdjacency[];
  /** the civic that adds one more Housing on top of `housing`. */
  housingCivic?: string;
  /** HP a friendly RELIGIOUS unit standing on it heals each turn. */
  religiousHeal?: number;
  /** tourism equal to this yield of its own, once `tourismTech` is in. */
  tourismFrom?: YieldKey;
  tourismTech?: string;
  /** what it takes off a NEIGHBOUR's appeal, the district column's twin. */
  appealAdjacent?: number;
  /** aircraft it bases. */
  airSlots?: number;
  /** CIV6 (Power): what this improvement supplies, per turn, to the city that
   *  owns its tile — a renewable source, so no stockpile stands behind it. */
  power?: number;
  /** built by the MILITARY ENGINEER rather than the Builder. */
  engineer?: boolean;
  /** refuses a tile that still carries a feature. */
  noFeature?: boolean;
  /** the row may stand ONLY on this feature (the Geothermal Plant). */
  requiresFeature?: FeatureId;
  /** what the row pays extra on a RIVER tile (the Lumber Mill's second
   *  Production), on top of `yields`. */
  riverYields?: Partial<Yields>;
  /** a Builder places this row on its own catalog GROUND alone — no resource
   *  under it, no suzerainty, no appeal bar, and not the Engineer's list. */
  groundOnly?: boolean;
  /** a Builder row that stands on WATER with no resource under it — its
   *  `terrains` list is the whole ground rule (the Offshore Wind Farm's
   *  "Coast and Lake"). */
  waterOnly?: boolean;
  /** CIV6 (Pillaging, GS data): what wrecking it pays the pillager;
   *  absent = NO_PLUNDER. */
  plunder?: PlunderRow;
  /** CIV6 (Mountain Tunnel): "Cannot be pillaged or removed" — PlunderType
   *  PLUNDER_NONE, and the pillage verb refuses it outright rather than
   *  wrecking it for nothing. */
  noPillage?: boolean;
  /** CIV6 (`OnePerCity`): one city holds at most one of these. */
  onePerCity?: boolean;
  /** CIV6 (`MinimumAppeal`): the row refuses a tile below this Appeal (the
   *  Chemamull's Breathtaking bar, the Seaside Resort's own constant). */
  minAppeal?: number;
  /** CIV6 (`YieldFromAppeal` / `YieldFromAppealPercent`): the row pays this
   *  share of its tile's APPEAL as the named yield (the Chemamull's 75%
   *  Culture). Floored, as every other tile yield here is. */
  appealYield?: { yield: YieldKey; pct: number };
  /** CIV6 (`DefenseModifier`): what a unit standing on it adds to its own
   *  defence, and CIV6 (`GrantFortification`): the turns of fortification it
   *  is handed for free. The Fort's own numbers, now on the data. */
  defenseCS?: number;
  grantsFortification?: number;
  /** CIV6 (Great Wall, `BuildInLine` / `BuildOnFrontier`): the row may only
   *  be laid along the seat's own BORDER, each segment beside the last. */
  buildInLine?: boolean;
  buildOnFrontier?: boolean;
  /** CIV6 (PLOT_DAMAGE_TO_WALKING_INTO / PLOT_DAMAGE_TO_WALKING_ADJACENT):
   *  what an enemy unit takes for stepping onto the tile, and for walking
   *  beside it. RECORDED, not read: this engine has no damage-on-entry hook,
   *  which is unit-movement machinery. */
  damageEntering?: number;
  damageAdjacent?: number;
  /** CIV6 (`RequiresAdjacentBonusOrLuxury`): the row refuses a tile with no
   *  Bonus or Luxury resource beside it (the Chateau, the Mekewap). */
  requiresAdjacentResource?: boolean;
  /** CIV6 (`MovementChange`): what the tile costs to enter once the row
   *  stands on it (the Polder's 3, i.e. 2 above the flat 1). */
  movementCost?: number;
  /** CIV6 (`ValidAdjacentTerrainAmount`): the row needs at least this many
   *  PASSABLE LAND neighbours (the Polder's three). */
  adjacentLandMin?: number;
  /** CIV6 (`Improvement_ValidBuildUnits`): the unit that lays it, where that
   *  is neither the Builder nor the Military Engineer (the Pa's Toa). */
  builtBy?: string;
  /** CIV6 (`CanBuildOutsideTerritory`): the row may stand on unowned ground. */
  outsideTerritory?: boolean;
  /** CIV6 (Pa): "A Maori unit occupying a Pa heals even if they just moved or
   *  attacked" — the improvement's OWNER's units alone. */
  healsAfterAction?: boolean;
  /** CIV6 (`MODIFIER_PLAYER_CITIES_ADJUST_IDENTITY_PER_TURN`): Loyalty per
   *  turn the row pays the city that holds it (the Open-Air Museum's). */
  loyalty?: number;
  /** the same, paid only to a city NOT on the seat's capital continent (the
   *  Mission's, which reaches a city ADJACENT to the improvement). */
  loyaltyAdjacentOffContinent?: number;
  /** CIV6 (`Improvement_BonusYieldChanges`): what the row pays extra once the
   *  seat holds the named tech or civic — "additional yields as you advance
   *  through the Technology and Civics Tree". */
  researchYields?: readonly { tech?: string; civic?: string; yields: Partial<Yields> }[];
  /** CIV6 (Mission): what the row pays on a tile whose continent is NOT the
   *  seat's capital's. */
  offCapitalContinentYields?: Partial<Yields>;
  /** CIV6 (Open-Air Museum): yields per TERRAIN KIND on which this seat has
   *  founded at least one city — the five the row names, counted once each. */
  terrainKindYields?: { terrains: readonly TerrainId[]; yields: Partial<Yields> };
  /** CIV6 (`DisasterResistant`): a storm or a flood leaves it standing. */
  disasterResistant?: boolean;
  /** CIV6 (Golf Course, Open-Air Museum): "Tiles with <row> cannot be
   *  swapped" — recorded; this engine has no tile-swap verb. */
  noSwap?: boolean;
  /**
   * CIV6 (Aquaculture, Parks and Recreation): the GOVERNOR PROMOTION the
   * owning city's governor must hold before a Builder may lay this row at
   * all — "The Fishery unique improvement can be built in the city on
   * coastal plots", "The City Park unique improvement can be built in the
   * city". A gate on the CITY, not on the seat, so it travels with the
   * governor.
   */
  governorPromo?: string;
  /**
   * CIV6 (FISHERY_GOVERNOR_PRODUCTION, CITY_PARK_GOVERNOR_CULTURE, both
   * MODIFIER_SINGLE_PLOT_ADJUST_PLOT_YIELDS behind
   * `CITY_HAS_GOVERNOR_PROMOTION_*`): what the plot pays ON TOP of `yields`
   * while the owning city's governor still holds the promotion.
   *
   * SEPARATE from `governorPromo` on purpose, and that is the whole reason
   * the install writes it as a modifier rather than folding it into the row:
   * the promotion gates the BUILD, and the improvement stands after the
   * governor leaves — but this payment stops.
   */
  governorYields?: { promo: string; yields: Partial<Yields> };
  /**
   * CIV6 (CITY_PARK_WATER_AMENITY,
   * MODIFIER_SINGLE_CITY_ADJUST_IMPROVEMENT_AMENITY behind
   * ADJACENT_TO_WATER_REQUIREMENTS): amenities this row pays its CITY —
   * per instance, not per city — when its tile touches water.
   */
  amenityAdjacentWater?: number;
}

/** the BREATHTAKING appeal bar a Seaside Resort needs (real Civ 6
 *  — the same >= 4 threshold `appealTier` calls Breathtaking). */
export const SEASIDE_RESORT_MIN_APPEAL = 4;
/** CIV6 (National Park): every tile in the cluster must be CHARMING or
 *  better, and `appealTier` puts Charming at 2. */
export const PARK_MIN_APPEAL = 2;
/** CIV6 (Biosphere): "+200% Power" for every renewable source — three times
 *  the published figure, not two. */
export const BIOSPHERE_POWER_MULT = 3;
/** CIV6: a National Park gives "2 Amenities to the city that owns it and
 *  1 Amenity to the four closest cities in your empire". */
export const PARK_AMENITIES_OWNER = 2;
export const PARK_AMENITIES_NEAR = 1;
export const PARK_AMENITY_CITIES = 4;

export const IMPROVEMENTS: Record<ImprovementId, ImprovementDef> = {
  FARM: {
    id: 'FARM',
    name: 'Farm',
    code: 'Fa',
    plunder: { kind: 'heal', amount: 50 },
    yields: { food: 1 },
    housing: 0.5,
    resourceOnly: false,
    description: 'Flat grassland/plains (hills allowed — late-game tech assumed) or floodplains.',
  },
  MINE: {
    id: 'MINE',
    // CIV6 (Appeal): a mine, a quarry and an oil well each take a point off
    // every neighbour.
    appealAdjacent: -1,
    name: 'Mine',
    code: 'Mi',
    plunder: { kind: 'gold', amount: 50 },
    yields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    description: 'Hills, or any tile with a mineable resource.',
  },
  QUARRY: {
    id: 'QUARRY',
    // CIV6 (Appeal): a mine, a quarry and an oil well each take a point off
    // every neighbour.
    appealAdjacent: -1,
    name: 'Quarry',
    code: 'Qu',
    plunder: { kind: 'faith', amount: 25 },
    yields: { production: 1 },
    housing: 0,
    resourceOnly: true,
    description: 'Stone or marble.',
  },
  LUMBER_MILL: {
    id: 'LUMBER_MILL',
    name: 'Lumber Mill',
    code: 'Lu',
    plunder: { kind: 'gold', amount: 50 },
    yields: { production: 1 },
    // CIV6 (Lumber Mill): "+1 Production. +1 Production if adjacent to River."
    riverYields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    description: 'Woods. +1 production more on a river.',
  },
  PASTURE: {
    id: 'PASTURE',
    name: 'Pasture',
    code: 'Pa',
    plunder: { kind: 'faith', amount: 25 },
    yields: { production: 1 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Cattle, sheep or horses.',
  },
  CAMP: {
    id: 'CAMP',
    name: 'Camp',
    code: 'Ca',
    plunder: { kind: 'faith', amount: 25 },
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Deer, furs, ivory or truffles.',
  },
  PLANTATION: {
    id: 'PLANTATION',
    name: 'Plantation',
    code: 'Pl',
    plunder: { kind: 'faith', amount: 25 },
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Plantation luxuries (wine, silk, spices, ...).',
  },
  FISHING_BOATS: {
    id: 'FISHING_BOATS',
    name: 'Fishing Boats',
    code: 'Fb',
    plunder: { kind: 'heal', amount: 50 },
    yields: { food: 1 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Sea resources (fish, crabs, pearls, whales).',
  },
  OIL_WELL: {
    id: 'OIL_WELL',
    // CIV6 (Appeal): a mine, a quarry and an oil well each take a point off
    // every neighbour.
    appealAdjacent: -1,
    name: 'Oil Well',
    code: 'Ow',
    plunder: { kind: 'gold', amount: 50 },
    yields: { production: 2 },
    housing: 0,
    resourceOnly: true,
    description: 'Oil.',
  },
  // Appended LAST (roster order = the GPU's improvement index).
  // Real Civ 6 (verified against the Civilopedia): requires RADIO, buildable
  // only on a FLAT COASTAL Grassland/Plains/Desert tile whose Appeal is
  // BREATHTAKING (>= 4), and it yields GOLD equal to that tile's Appeal —
  // a DYNAMIC yield, so `yields` here is empty and the gold is computed in
  // tileYields, and the matching TOURISM (also = Appeal) is paid by
  // `resortTourism` (core/city.ts).
  SEASIDE_RESORT: {
    id: 'SEASIDE_RESORT',
    name: 'Seaside Resort',
    code: 'Sr',
    plunder: { kind: 'gold', amount: 50 },
    yields: {}, // dynamic: gold = tile appeal (see seasideResortGold)
    housing: 0,
    resourceOnly: false,
    description: 'Flat coastal grassland/plains/desert with Breathtaking appeal. Gold equal to the tile appeal.',
  },
  // THE TWO RENEWABLE GENERATORS A LAND BUILDER CAN REACH. Each supplies its
  // city with Power from a source no stockpile stands behind, which is why
  // `cityPower` counts them against demand before it asks a plant to burn.
  // CIV6 (Solar Farm): "Provides 2 Power per turn", "+1 Gold" and "+1
  // Production", "Must be built on flat terrain. Cannot be built on Snow."
  SOLAR_FARM: {
    id: 'SOLAR_FARM',
    name: 'Solar Farm',
    code: 'So',
    plunder: { kind: 'gold', amount: 50 },
    yields: { gold: 1, production: 1 },
    housing: 0,
    resourceOnly: false,
    groundOnly: true,
    power: 2,
    elevations: ['FLAT'],
    excludeTerrains: ['SNOW'],
    description: 'Flat non-snow land. Supplies 2 Power to its city from the sun.',
  },
  // CIV6 (Wind Farm): "Provides 2 Power per turn", "+2 Gold" and "+1
  // Production", "Must be built on Hills terrain".
  WIND_FARM: {
    id: 'WIND_FARM',
    name: 'Wind Farm',
    code: 'Wf',
    plunder: { kind: 'gold', amount: 50 },
    yields: { gold: 2, production: 1 },
    housing: 0,
    resourceOnly: false,
    groundOnly: true,
    power: 2,
    elevations: ['HILLS'],
    description: 'Hills. Supplies 2 Power to its city from the wind.',
  },
  // CIV6 (Geothermal Plant): "+1 Science", "+2 Production" and "Provides 4
  // Power per turn"; it "may only be constructed on a special terrain
  // feature: the Geothermal Fissure".
  GEOTHERMAL_PLANT: {
    id: 'GEOTHERMAL_PLANT',
    name: 'Geothermal Plant',
    code: 'Gp',
    plunder: { kind: 'gold', amount: 50 },
    yields: { science: 1, production: 2 },
    housing: 0,
    resourceOnly: false,
    groundOnly: true,
    power: 4,
    requiresFeature: 'GEOTHERMAL_FISSURE',
    description: 'A Geothermal Fissure. Supplies 4 Power to its city from the ground.',
  },
  // THE MILITARY ENGINEER'S OWN TWO. Both pages read "in your own or neutral
  // territory", which is the engineer branch's rule rather than a column.
  FORT: {
    id: 'FORT',
    name: 'Fort',
    code: 'Ft',
    yields: {},
    housing: 0,
    resourceOnly: false,
    engineer: true,
    // CIV6 (`Improvements.CanBuildOutsideTerritory`): true on this row. It is
    // a PER-ROW column, not a property of the Engineer — the Missile Silo
    // carries it explicitly FALSE and stays inside its owner's borders.
    outsideTerritory: true,
    // CIV6 (Improvements.xml `DefenseModifier` / `GrantFortification`): the
    // Fort's own columns, on the data now that the Great Wall and the Pa
    // carry the same pair.
    defenseCS: 4,
    grantsFortification: 2,
    // CIV6 (Fort): "can be built on any featureless land tile".
    noFeature: true,
    description: 'Military Engineer only, featureless land. Occupying unit gets +4 defense strength and 2 turns of fortification.',
  },
  // CIV6 (Airstrip): "provides a base for military aircraft and may be built
  // on flat terrain"; "+3 aircraft slots", "-1 Appeal". Its infobox terrain
  // list is every FLAT land terrain, so the elevation clause states it once.
  AIRSTRIP: {
    id: 'AIRSTRIP',
    name: 'Airstrip',
    code: 'As',
    yields: {},
    housing: 0,
    resourceOnly: false,
    engineer: true,
    // CIV6 (`Improvements.CanBuildOutsideTerritory`): true on this row. It is
    // a PER-ROW column, not a property of the Engineer — the Missile Silo
    // carries it explicitly FALSE and stays inside its owner's borders.
    outsideTerritory: true,
    elevations: ['FLAT'],
    appealAdjacent: -1,
    airSlots: 3,
    description: 'Military Engineer only, flat land. Bases 3 aircraft and costs its neighbours a point of appeal.',
  },
  // CIV6 (Missile Silo): "Base for launching nukes", built by the Military
  // Engineer, unlocked by Rocketry, and its terrain list is the five FLAT
  // land terrains this map carries. Plunder: None. It is the one Engineer
  // row with `CanBuildOutsideTerritory="false"` written out, so it alone
  // needs its owner's borders — which is why that column is per-row here.
  MISSILE_SILO: {
    id: 'MISSILE_SILO',
    name: 'Missile Silo',
    code: 'Si',
    yields: {},
    housing: 0,
    resourceOnly: false,
    engineer: true,
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT'],
    description: 'Military Engineer only, flat land. Launches nuclear devices at range.',
  },
  // THE SUZERAIN IMPROVEMENTS. Each is built by "a player that is the
  // Suzerain of" one city-state, and each row below is that improvement's own
  // Civilopedia page, read line by line.
  BATEY: {
    id: 'BATEY',
    name: 'Batey',
    code: 'By',
    plunder: { kind: 'faith', amount: 25 },
    yields: { culture: 1 },
    housing: 0,
    resourceOnly: false,
    suzerainOf: 'Caguana',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    // CIV6: "Cannot be built on Hills tiles or adjacent to another Batey."
    elevations: ['FLAT'],
    noAdjacentSame: true,
    // CIV6: "+1 Culture for every adjacent Bonus Resource or Entertainment
    // Complex (increasing to +2 Culture with Exploration)."
    adjacency: [{
      bonusResource: true, district: 'ENTERTAINMENT_COMPLEX', per: 1,
      yields: { culture: 1 }, upgradeCivic: 'EXPLORATION', upgradeYields: { culture: 2 },
    }],
    // CIV6: "Provides Tourism after researching Flight."
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 culture, +1 more per adjacent bonus resource or Entertainment Complex (+2 with Exploration). Flat, not beside another Batey.',
  },
  COLOSSAL_HEADS: {
    id: 'COLOSSAL_HEADS',
    name: 'Colossal Heads',
    code: 'Ch',
    plunder: { kind: 'faith', amount: 25 },
    yields: { faith: 2 },
    housing: 0,
    resourceOnly: false,
    suzerainOf: 'La Venta',
    // CIV6: "Cannot be built on Snow or Snow Hills." The page's terrain list
    // also names Volcanic Soil, which this map has no carrier for — an
    // eruption enriches the ground it stands on instead of retexturing it.
    excludeTerrains: ['SNOW'],
    // CIV6: "+1 Faith for every 2 adjacent Woods or Rainforests (increasing to
    // +1 Faith for every adjacent Woods or Rainforest with Humanism)."
    adjacency: [{
      features: ['WOODS', 'RAINFOREST'], per: 2, yields: { faith: 1 },
      upgradeCivic: 'HUMANISM', upgradePer: 1,
    }],
    // CIV6: "Provides Tourism from Faith after researching Flight."
    tourismFrom: 'faith',
    tourismTech: 'FLIGHT',
    description: '+2 faith, +1 more per 2 adjacent Woods/Rainforest (per 1 with Humanism). Anywhere but snow.',
  },
  MONASTERY: {
    id: 'MONASTERY',
    name: 'Monastery',
    code: 'My',
    plunder: { kind: 'faith', amount: 25 },
    yields: { faith: 2 },
    // CIV6 [GS]: "+1 Housing" and "+1 additional Housing (with Colonialism)".
    housing: 1,
    housingCivic: 'COLONIALISM',
    resourceOnly: false,
    suzerainOf: 'Armagh',
    // CIV6: "Cannot be adjacent to another Monastery."
    noAdjacentSame: true,
    // CIV6 [GS]: "+1 Faith for every 2 adjacent Districts."
    adjacency: [{ anyDistrict: true, per: 2, yields: { faith: 1 } }],
    // CIV6: "Provides +15 HP healing every turn for friendly religious units."
    religiousHeal: 15,
    description: '+2 faith, +1 more per 2 adjacent districts, +1 housing (+1 with Colonialism), heals religious units 15. Not beside another Monastery.',
  },
  // CIV6 (Offshore Wind Farm): "+2 Production", "Provides 2 Power per turn",
  // "Must be constructed on Coast and Lake", unlocked by Predictive Systems
  // and built by Builders.
  OFFSHORE_WIND_FARM: {
    id: 'OFFSHORE_WIND_FARM',
    name: 'Offshore Wind Farm',
    code: 'Ow',
    plunder: { kind: 'gold', amount: 50 },
    yields: { production: 2 },
    housing: 0,
    resourceOnly: false,
    waterOnly: true,
    power: 2,
    terrains: ['COAST', 'LAKE'],
    description: 'Coast or Lake. Supplies 2 Power to its city from the wind.',
  },
  // CIV6 (Civilizations.xml): the roster's UNIQUE IMPROVEMENTS, each read off
  // the install's Improvements tables.
  SPHINX: {
    id: 'SPHINX',
    name: 'Sphinx',
    code: 'Sx',
    plunder: { kind: 'faith', amount: 25 },
    yields: { faith: 1, culture: 1 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'EGYPT',
    terrains: ['DESERT', 'TUNDRA', 'PLAINS', 'GRASSLAND'],
    elevations: ['FLAT', 'HILLS'],
    features: ['FLOODPLAINS'],
    noAdjacentSame: true,
    // CIV6 (SPHINX_WONDERADJACENCY_FAITH): "+2 Faith if next to a wonder"
    adjacency: [{ builtWonder: true, per: 1, yields: { faith: 2 } }],
    // CIV6 (SPHINX_FLOODPLAINS_CULTURE): "+1 Culture if built on Floodplains"
    featureYields: { features: ['FLOODPLAINS'], yields: { culture: 1 } },
    // CIV6 (Improvements.xml, `Appeal="1"`): ONE, not the two an earlier
    // round took off the civilopedia — the XML outranks the pedia.
    appealAdjacent: 1,
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 faith +1 culture, +2 faith beside a wonder, +1 culture on floodplains, +1 appeal around. Not beside another Sphinx.',
  },
  // CIV6 (Improvements.xml / Adjacency_YieldChanges): the Inca's Terrace
  // Farm — hills of three terrains, +1 Food and (Housing 2 in the install's
  // half-units) +1 Housing, +1 Food per adjacent Mountain, +2 Production per
  // adjacent Aqueduct, and its own kind adjacent: one Food per TWO at
  // Feudalism, per ONE at Replaceable Parts.
  TERRACE_FARM: {
    id: 'TERRACE_FARM',
    name: 'Terrace Farm',
    code: 'Tf',
    plunder: { kind: 'heal', amount: 50 },
    yields: { food: 1 },
    housing: 1,
    resourceOnly: false,
    uniqueTo: 'INCA',
    terrains: ['GRASSLAND', 'PLAINS', 'DESERT'],
    elevations: ['HILLS'],
    adjacency: [
      { mountain: true, per: 1, yields: { food: 1 } },
      { district: 'AQUEDUCT', per: 1, yields: { production: 2 } },
      { sameImprovement: true, requiresCivic: 'FEUDALISM', per: 2, yields: { food: 1 },
        upgradeTech: 'REPLACEABLE_PARTS', upgradePer: 1 },
    ],
    description: '+1 food, +1 housing on hills. +1 food per adjacent mountain, +2 production per adjacent Aqueduct, and its own kind beside it from Feudalism.',
  },
  // CIV6 (Mountain Tunnel): "Acts as a movement portal on a mountain range,
  // allowing units to move into it and exit from another portal at the cost
  // of 2 Movement. ... Can only be built on an adjacent Mountain tile. Cannot
  // be pillaged or removed." Expansion2_Improvements.xml: PrereqTech
  // TECH_CHEMISTRY, `Improvement_ValidBuildUnits` names UNIT_MILITARY_ENGINEER
  // alone, `Improvement_ValidTerrains` the five mountain rows,
  // `CanBuildOutsideTerritory`, PlunderType PLUNDER_NONE.
  MOUNTAIN_TUNNEL: {
    id: 'MOUNTAIN_TUNNEL',
    name: 'Mountain Tunnel',
    code: 'Tn',
    yields: {},
    housing: 0,
    resourceOnly: false,
    engineer: true,
    // CIV6 (`Improvements.CanBuildOutsideTerritory`): true on this row. It is
    // a PER-ROW column, not a property of the Engineer — the Missile Silo
    // carries it explicitly FALSE and stays inside its owner's borders.
    outsideTerritory: true,
    elevations: ['MOUNTAIN'],
    // it is the ONE improvement that stands on impassable ground, and the one
    // a unit may enter without being able to work
    noPillage: true,
    // CIV6 (`Improvements_XP2.DisasterResistant` = true): a flood or
    // a storm passes over it. `noPillage` answers the PILLAGE verb; this
    // answers the disaster walk, and they are two different callers.
    disasterResistant: true,
    description: 'Military Engineer only, on a mountain, built from an adjacent tile. A movement portal to the next tunnel on its range, at 2 Movement. Cannot be pillaged or removed.',
  },
  // CIV6 (Civilizations.xml): the twelve unique improvements the roster's
  // seated civilizations still owed, each read off the install's Improvements
  // tables. `Housing / TilesRequired` is the install's per-tile share, which
  // is why a `Housing="2" TilesRequired="2"` row is 1 here.
  CHATEAU: {
    id: 'CHATEAU',
    name: 'Chateau',
    code: 'Ch',
    plunder: { kind: 'faith', amount: 25 },
    yields: { culture: 2, gold: 1 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'FRANCE',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    features: ['FLOODPLAINS'],
    noAdjacentSame: true,
    requiresAdjacentResource: true,
    appealAdjacent: 1,
    // CIV6 (Chateau_River): "+2 Gold if on a tile containing a River edge"
    riverYields: { gold: 2 },
    // CIV6 (Chateau_WonderEarly / _WonderLate): +1 Culture per adjacent
    // wonder, +2 once Flight is in.
    adjacency: [{ builtWonder: true, per: 1, yields: { culture: 1 },
                  upgradeTech: 'FLIGHT', upgradeYields: { culture: 2 } }],
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+2 culture +1 gold, +1 culture per adjacent wonder (+2 from Flight), +2 gold on a river. Beside a resource, never beside another Chateau.',
  },
  CHEMAMULL: {
    id: 'CHEMAMULL',
    name: 'Chemamull',
    code: 'Cm',
    plunder: { kind: 'faith', amount: 25 },
    yields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'MAPUCHE',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    // CIV6 (`MinimumAppeal="4"`, `YieldFromAppeal` CULTURE at 75%)
    minAppeal: 4,
    appealYield: { yield: 'culture', pct: 75 },
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 production, and culture equal to 75% of the tile appeal. Breathtaking ground only.',
  },
  GOLF_COURSE: {
    id: 'GOLF_COURSE',
    name: 'Golf Course',
    code: 'Gc',
    plunder: { kind: 'heal', amount: 50 },
    yields: { gold: 2 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'SCOTLAND',
    // the install lists every terrain but the two DESERT rows
    terrains: ['GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    onePerCity: true,
    noSwap: true,
    appealAdjacent: 1,
    // CIV6 (GolfCourse_CityCenterAdjacency / _EntertainmentComplexAdjacency)
    adjacency: [
      { district: 'CITY_CENTER', per: 1, yields: { culture: 1 } },
      { district: 'ENTERTAINMENT_COMPLEX', per: 1, yields: { culture: 1 } },
    ],
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+2 gold, +1 culture beside a City Center and +1 beside an Entertainment Complex. One per city, never on desert.',
  },
  GREAT_WALL: {
    id: 'GREAT_WALL',
    name: 'Great Wall',
    code: 'Gw',
    plunder: { kind: 'gold', amount: 50 },
    yields: {},
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'CHINA',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    features: ['VOLCANIC_SOIL'],
    buildInLine: true,
    buildOnFrontier: true,
    defenseCS: 4,
    grantsFortification: 2,
    disasterResistant: true,
    damageEntering: 10,
    damageAdjacent: 10,
    // CIV6 (GreatWall_Gold at Masonry, GreatWall_Culture at Castles): per
    // adjacent SEGMENT, which is the row's own kind.
    adjacency: [
      { improvement: 'GREAT_WALL', per: 1, yields: { gold: 2 } },
      { improvement: 'GREAT_WALL', requiresCivic: 'CASTLES', per: 1, yields: { culture: 2 } },
    ],
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+4 defence and 2 turns of fortification to its occupant, 10 damage to an enemy entering or passing. +2 gold per adjacent segment, +2 culture per segment from Castles. Along the border only.',
  },
  ICE_HOCKEY_RINK: {
    id: 'ICE_HOCKEY_RINK',
    name: 'Ice Hockey Rink',
    code: 'Hk',
    plunder: { kind: 'heal', amount: 50 },
    yields: {},
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'CANADA',
    terrains: ['SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    onePerCity: true,
    appealAdjacent: 2,
    // CIV6 (Hockey_Snow/SnowHills/Tundra/TundraHillsAdjacency): one Culture
    // per adjacent cold tile — four install rows, one here, because the
    // engine's terrain and elevation are separate columns.
    adjacency: [{ terrains: ['SNOW', 'TUNDRA'], per: 1, yields: { culture: 1 } }],
    // CIV6 (Improvement_BonusYieldChanges 26, 27)
    researchYields: [{ civic: 'PROFESSIONAL_SPORTS', yields: { food: 2, production: 2 } }],
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 culture per adjacent tundra or snow tile, +2 food and +2 production from Professional Sports. Tundra and snow only, one per city.',
  },
  KURGAN: {
    id: 'KURGAN',
    name: 'Kurgan',
    code: 'Kg',
    plunder: { kind: 'faith', amount: 25 },
    yields: { faith: 1, gold: 3 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'SCYTHIA',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT'],
    // CIV6 (Kurgan_Faith / _Faith_Stirrups): per adjacent PASTURE, doubled
    // once Stirrups is in.
    adjacency: [{ improvement: 'PASTURE', per: 1, yields: { faith: 1 },
                  upgradeTech: 'STIRRUPS', upgradeYields: { faith: 2 } }],
    tourismFrom: 'faith',
    tourismTech: 'FLIGHT',
    description: '+1 faith +3 gold, +1 faith per adjacent Pasture (+2 from Stirrups). Flat ground only.',
  },
  MAORI_PA: {
    id: 'MAORI_PA',
    name: 'Pa',
    code: 'Pa',
    yields: {},
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'MAORI',
    // the TOA lays it, not the Builder, and it may stand on unowned ground
    builtBy: 'TOA',
    outsideTerritory: true,
    elevations: ['HILLS'],
    defenseCS: 4,
    grantsFortification: 2,
    damageEntering: 10,
    healsAfterAction: true,
    noPillage: true,
    description: 'Built by the Toa on a hill, inside or outside your borders. +4 defence and 2 turns of fortification to its occupant, and a Maori unit on one heals even after moving or attacking.',
  },
  MEKEWAP: {
    id: 'MEKEWAP',
    name: 'Mekewap',
    code: 'Mk',
    plunder: { kind: 'heal', amount: 50 },
    yields: { production: 1 },
    housing: 1,
    resourceOnly: false,
    uniqueTo: 'CREE',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    noAdjacentSame: true,
    requiresAdjacentResource: true,
    // CIV6 (Mekewap_First/Second/ThirdBonusAdjacency): one Food per TWO
    // adjacent Bonus resources, per ONE from Conservation; +2 Gold per
    // adjacent Luxury once Cartography is in.
    adjacency: [
      { bonusResource: true, per: 2, yields: { food: 1 },
        upgradeCivic: 'CONSERVATION', upgradePer: 1 },
      { luxuryResource: true, requiresCivic: 'CARTOGRAPHY', per: 1, yields: { gold: 2 } },
    ],
    // CIV6 (Improvement_BonusYieldChanges 24)
    researchYields: [{ civic: 'CIVIL_SERVICE', yields: { production: 1 } }],
    description: '+1 production +1 housing. +1 food per two adjacent bonus resources (per one from Conservation), +2 gold per adjacent luxury from Cartography. Beside a resource, never beside another Mekewap.',
  },
  MISSION: {
    id: 'MISSION',
    name: 'Mission',
    code: 'Ms',
    plunder: { kind: 'faith', amount: 25 },
    yields: { faith: 2 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'SPAIN',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    // CIV6 (Mission_Science_Campus / _Science_HolySite)
    adjacency: [
      { district: 'CAMPUS', per: 1, yields: { science: 1 } },
      { district: 'HOLY_SITE', per: 1, yields: { science: 1 } },
    ],
    // CIV6 (Improvement_BonusYieldChanges 17)
    researchYields: [{ civic: 'CULTURAL_HERITAGE', yields: { science: 2 } }],
    // CIV6: "+2 Faith, +1 Production, and +1 Food if on a different continent
    // than your Capital"
    offCapitalContinentYields: { faith: 2, production: 1, food: 1 },
    // CIV6 (TRAIT_MISSION_IDENTITY_PER_TURN_MODIFIER, Amount 2): +2 Loyalty
    // per turn to a city ADJACENT to one, off the capital's continent.
    loyaltyAdjacentOffContinent: 2,
    description: '+2 faith, +2 science from Cultural Heritage, +1 science per adjacent Campus and Holy Site. Off your capital continent it also pays +2 faith +1 production +1 food, and +2 loyalty to a city beside it.',
  },
  OPEN_AIR_MUSEUM: {
    id: 'OPEN_AIR_MUSEUM',
    name: 'Open-Air Museum',
    code: 'Oa',
    plunder: { kind: 'faith', amount: 25 },
    yields: {},
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'SWEDEN',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT', 'HILLS'],
    onePerCity: true,
    noSwap: true,
    loyalty: 2,
    // CIV6: "+2 Culture and +2 Tourism for each type of terrain (Snow,
    // Tundra, Desert, Plains or Grassland) in which at least one Swedish city
    // is founded." The Tourism half rides `tourismFrom`.
    terrainKindYields: {
      terrains: ['SNOW', 'TUNDRA', 'DESERT', 'PLAINS', 'GRASSLAND'],
      yields: { culture: 2 },
    },
    tourismFrom: 'culture',
    description: '+2 loyalty per turn, and +2 culture for each of the five terrain kinds you have founded a city on. One per city.',
  },
  POLDER: {
    id: 'POLDER',
    name: 'Polder',
    code: 'Po',
    plunder: { kind: 'faith', amount: 25 },
    yields: { food: 1, production: 1 },
    housing: 0.5,
    resourceOnly: false,
    uniqueTo: 'NETHERLANDS',
    // a Builder row on WATER whose ground rule is its terrain list alone
    waterOnly: true,
    terrains: ['COAST', 'LAKE'],
    adjacentLandMin: 3,
    movementCost: 3,
    // CIV6 (Polder_Polder_Food_Early/Late, Polder_Polder_Production)
    adjacency: [
      { sameImprovement: true, per: 1, yields: { food: 1 },
        upgradeTech: 'REPLACEABLE_PARTS', upgradeYields: { food: 2, production: 1 } },
    ],
    // CIV6 (Improvement_BonusYieldChanges 25)
    researchYields: [{ civic: 'CIVIL_ENGINEERING', yields: { gold: 4 } }],
    description: '+1 food +1 production +0.5 housing on coast or lake beside three or more land tiles. +1 food per adjacent Polder, +2 food and +1 production each from Replaceable Parts, +4 gold from Civil Engineering. Costs 3 movement to enter.',
  },
  STEPWELL: {
    id: 'STEPWELL',
    name: 'Stepwell',
    code: 'Sw',
    plunder: { kind: 'heal', amount: 50 },
    yields: { food: 1 },
    housing: 1,
    resourceOnly: false,
    uniqueTo: 'INDIA',
    terrains: ['DESERT', 'GRASSLAND', 'PLAINS', 'SNOW', 'TUNDRA'],
    elevations: ['FLAT'],
    noAdjacentSame: true,
    // CIV6 (Improvement_BonusYieldChanges 19, 20)
    researchYields: [
      { civic: 'FEUDALISM', yields: { faith: 1 } },
      { civic: 'PROFESSIONAL_SPORTS', yields: { food: 1 } },
    ],
    // The description's "+1 Faith beside a Holy Site, +1 Food beside a Farm"
    // has NO `Improvement_Adjacencies` row in the install — both halves are
    // DLL-side, so they are recorded rather than invented.
    description: '+1 food +1 housing on flat ground, never beside another Stepwell. +1 faith from Feudalism, +1 more food from Professional Sports.',
  },
  // ---- THE TWO GOVERNOR IMPROVEMENTS ----
  // CIV6 (DLC/Expansion2/Data/Expansion1_Improvements.xml — Expansion2 is the
  // LAST layer and it is the one that gives the Fishery its Housing and
  // TilesRequired). Neither is a civilization's unique: each is unlocked by a
  // GOVERNOR PROMOTION in the city that holds the plot, which is why both
  // promotions have sat in `governors.ts` with empty effects.
  FISHERY: {
    id: 'FISHERY',
    name: 'Fishery',
    code: 'Fy',
    plunder: { kind: 'heal', amount: 50 },
    // Improvement_YieldChanges: FOOD +1, PRODUCTION +0. The zero is carried
    // literally: it is there so the governor modifier below has a production
    // term to raise.
    yields: { food: 1 },
    // `Housing="1" TilesRequired="2"` — one Housing per two of them, which is
    // the half this catalog stores, exactly as the Farm's does.
    housing: 0.5,
    resourceOnly: false,
    waterOnly: true,
    terrains: ['COAST'],
    governorPromo: 'AQUACULTURE',
    governorYields: { promo: 'AQUACULTURE', yields: { production: 1 } },
    // Improvement_Adjacencies -> Fishery_SeaResourceAdjacency:
    // YIELD_FOOD +1, TilesRequired 1, AdjacentSeaResource true
    adjacency: [{ seaResource: true, per: 1, yields: { food: 1 } }],
    description: 'Coast only, and only where the governor of the owning city holds Aquaculture. +1 food, +1 more per adjacent sea resource, +1 production while that governor stays.',
  },
  CITY_PARK: {
    id: 'CITY_PARK',
    name: 'City Park',
    code: 'Cp',
    plunder: { kind: 'heal', amount: 50 },
    yields: { culture: 1 },
    housing: 0,
    resourceOnly: false,
    groundOnly: true,
    // Improvement_ValidTerrains names every LAND terrain, flat and hills
    // alike, so the row carries no elevation clause.
    terrains: ['DESERT', 'TUNDRA', 'PLAINS', 'GRASSLAND', 'SNOW'],
    // `Appeal="2"`: what the row does to its NEIGHBOURS, the column every
    // other improvement here reads that way (the Mine's -1, the camp's -1).
    appealAdjacent: 2,
    // `SameAdjacentValid="false"`
    noAdjacentSame: true,
    governorPromo: 'PARKS_AND_RECREATION',
    governorYields: { promo: 'PARKS_AND_RECREATION', yields: { culture: 3 } },
    // Improvement_Tourism: TOURISMSOURCE_CULTURE, PrereqTech TECH_FLIGHT,
    // ScalingFactor 100
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    amenityAdjacentWater: 1,
    description: 'Any land, never beside another, and only where the governor of the owning city holds Parks and Recreation. +1 culture (+3 more while that governor stays), +2 appeal to its neighbours, +1 amenity beside water, tourism from Flight.',
  },
  ZIGGURAT: {
    id: 'ZIGGURAT',
    name: 'Ziggurat',
    code: 'Zg',
    plunder: { kind: 'gold', amount: 50 },
    yields: { science: 2 },
    housing: 0,
    resourceOnly: false,
    uniqueTo: 'SUMERIA',
    terrains: ['DESERT', 'TUNDRA', 'PLAINS', 'GRASSLAND', 'SNOW'],
    elevations: ['FLAT'],
    features: ['FLOODPLAINS'],
    // CIV6 (ZIGGURAT_RIVERADJACENCY_CULTURE): "+1 Culture if next to River"
    riverYields: { culture: 1 },
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+2 science, +1 culture beside a river. Flat ground, floodplains allowed.',
  },
};

/**
 * CIV6 (`Improvements.DefenseModifier`): what an improvement adds to the
 * Combat Strength of whoever stands on it — physical and theological alike.
 * The Fort's own 4, and the same 4 on China's Great Wall and the Maori Pa, so
 * the three read ONE column instead of three `=== 'FORT'` tests.
 *
 * A LEAF: `promotions.ts` reads it and must not import `combat.ts`, which
 * already imports promotions.
 */
export function improvementDefenseCS(tile: { improvement?: string | null; pillaged?: boolean }): number {
  if (!tile.improvement || tile.pillaged) return 0;
  return IMPROVEMENTS[tile.improvement as ImprovementId]?.defenseCS ?? 0;
}

/** does an improvement on this tile shelter its occupant at all? The
 *  "is this defensible ground" test a district shares. */
export function improvementIsCover(tile: { improvement?: string | null; pillaged?: boolean } | undefined): boolean {
  return !!tile && improvementDefenseCS(tile) > 0;
}
