/**
 * Tile improvements (9 total). In units mode a builder places these, spending
 * one of its finite charges, and only where research allows: validImprovementsIn
 * (src/core/rules.ts) gates each on unlocks.improvements plus the hillFarms civic
 * for hill farms. Sandbox mode is the exception — it bypasses all research gating.
 * Yields are base Civ 6 values (pre-tech-boost), every one sourced against the
 * Gathering Storm CIVILOPEDIA. No `eyeballed`/`approximate` markers remain.
 */

import type { DistrictId, ImprovementId, Yields, YieldKey } from '../core/types';
import type { Elevation, FeatureId, TerrainId } from '../../world/types';

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
  /** count a neighbour carrying one of these live features. */
  features?: FeatureId[];
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
  /** built by the MILITARY ENGINEER rather than the Builder. */
  engineer?: boolean;
  /** refuses a tile that still carries a feature. */
  noFeature?: boolean;
}

/** the BREATHTAKING appeal bar a Seaside Resort needs (real Civ 6
 *  — the same >= 4 threshold `appealTier` calls Breathtaking). */
export const SEASIDE_RESORT_MIN_APPEAL = 4;
/** CIV6 (National Park): every tile in the cluster must be CHARMING or
 *  better, and `appealTier` puts Charming at 2. */
export const PARK_MIN_APPEAL = 2;
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
    yields: { production: 1 },
    housing: 0,
    resourceOnly: true,
    description: 'Stone or marble.',
  },
  LUMBER_MILL: {
    id: 'LUMBER_MILL',
    name: 'Lumber Mill',
    code: 'Lu',
    yields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    description: 'Woods.',
  },
  PASTURE: {
    id: 'PASTURE',
    name: 'Pasture',
    code: 'Pa',
    yields: { production: 1 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Cattle, sheep or horses.',
  },
  CAMP: {
    id: 'CAMP',
    name: 'Camp',
    code: 'Ca',
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Deer, furs, ivory or truffles.',
  },
  PLANTATION: {
    id: 'PLANTATION',
    name: 'Plantation',
    code: 'Pl',
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Plantation luxuries (wine, silk, spices, ...).',
  },
  FISHING_BOATS: {
    id: 'FISHING_BOATS',
    name: 'Fishing Boats',
    code: 'Fb',
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
    yields: {}, // dynamic: gold = tile appeal (see seasideResortGold)
    housing: 0,
    resourceOnly: false,
    description: 'Flat coastal grassland/plains/desert with Breathtaking appeal. Gold equal to the tile appeal.',
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
  // THE SUZERAIN IMPROVEMENTS. Each is built by "a player that is the
  // Suzerain of" one city-state, and each row below is that improvement's own
  // Civilopedia page, read line by line.
  BATEY: {
    id: 'BATEY',
    name: 'Batey',
    code: 'By',
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
};
