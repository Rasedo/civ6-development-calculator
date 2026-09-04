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
    elevations: ['FLAT'],
    appealAdjacent: -1,
    airSlots: 3,
    description: 'Military Engineer only, flat land. Bases 3 aircraft and costs its neighbours a point of appeal.',
  },
  // CIV6 (Missile Silo): "Base for launching nukes", built by the Military
  // Engineer, unlocked by Rocketry, and its terrain list is the five FLAT
  // land terrains this map carries. Plunder: None.
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
    appealAdjacent: 2,
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 faith +1 culture, +2 faith beside a wonder, +1 culture on floodplains, +2 appeal around. Not beside another Sphinx.',
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
  // `CanBuildOutsideTerritory`, PlunderType PLUNDER_NONE (C-20).
  MOUNTAIN_TUNNEL: {
    id: 'MOUNTAIN_TUNNEL',
    name: 'Mountain Tunnel',
    code: 'Tn',
    yields: {},
    housing: 0,
    resourceOnly: false,
    engineer: true,
    elevations: ['MOUNTAIN'],
    // it is the ONE improvement that stands on impassable ground, and the one
    // a unit may enter without being able to work
    noPillage: true,
    description: 'Military Engineer only, on a mountain, built from an adjacent tile. A movement portal to the next tunnel on its range, at 2 Movement. Cannot be pillaged or removed.',
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
