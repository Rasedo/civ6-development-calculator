/**
 * Map resources (a curated base-game subset). `improvement` is the improvement
 * that works the resource.
 *
 * SOURCING SWEEP: the BONUS-resource yields were checked
 * against the Civilization wiki resource list and are ALL CORRECT as written —
 * Wheat, Rice, Cattle, Sheep and Bananas at +1 Food, Stone and Deer at
 * +1 Production. No change was needed.
 *
 * ONE SOURCED RESIDUAL found in the same pass: real Civ 6 gives RICE and WHEAT
 * an ADDITIONAL +1 Food when the city has a working WATER MILL. This model
 * gates the Water Mill on a river (`special === 'WATER_MILL'`) and pays its own
 * flat +1 food/+1 production, but does NOT pay the per-resource rice/wheat
 * bonus. Recorded rather than fixed: it is a yield change needing its own gated
 * round, and both engines would have to add the term at the same position.
 *
 * The LUXURY and STRATEGIC rows below are NOT yet swept.
 */

import type { Elevation, ImprovementId, ResourceCategory, TerrainId, Tile, YieldKey, Yields } from './types';
import { TERRAINS } from './terrains';

export interface ResourceDef {
  id: string;
  name: string;
  category: ResourceCategory;
  yields: Partial<Yields>;
  improvement: ImprovementId;
  terrains: TerrainId[];
  elevations: Elevation[];
  requiresFeature?: string[];
  okFeatures?: string[];
  /** CIV6 (Resource_ValidFeatures beside Resource_ValidTerrains): features
   *  the resource stands on WHATEVER the terrain beneath — Amber's Woods and
   *  Rainforest, where `terrains` is its Coast alone. */
  anyTerrainFeatures?: string[];
  /** CIV6 (Improvement_ValidResources): the improvement that works it on a
   *  WATER plot, where `improvement` works it on land (Amber: Fishing Boats
   *  at sea, a Mine ashore). `resourceImprovement` reads the plot. */
  waterImprovement?: ImprovementId;
  /** If set, resource never spawns on a feature. */
  noFeature?: boolean;
  /** CIV6 (Resources.PrereqTech): the technology that REVEALS the resource.
   *  Until a civilization holds it the tile is plain ground to that
   *  civilization — no yield, no improvement, no access, no accrual
   *  (`hiddenResourcesFor` / `_res_hidden`). Only the strategics carry one. */
  revealTech?: string;
  /**
   * Yield granted (era-scaled lump) when a builder harvests it in units
   * mode, removing the resource. Only some bonus resources, as in Civ 6.
   */
  harvestYield?: YieldKey;
  /**
   * CIV6 (Resource_Harvests.Amount): the harvest's BASE lump before the game
   * progress scale — 20 for every Food and Production resource the install
   * lists, and 40 for the two Gold ones. A feature CHOP is a different table
   * and keeps its own base; only a resource reads this.
   */
  harvestAmount?: number;
}

const FLAT: Elevation[] = ['FLAT'];
const HILLS: Elevation[] = ['HILLS'];
const ANY: Elevation[] = ['FLAT', 'HILLS'];

export const RESOURCES: Record<string, ResourceDef> = {
  WHEAT: { id: 'WHEAT', name: 'Wheat', category: 'bonus', yields: { food: 1 }, improvement: 'FARM', terrains: ['PLAINS'], elevations: FLAT, okFeatures: ['FLOODPLAINS', 'FLOODPLAINS_PLAINS'], harvestAmount: 20, harvestYield: 'food' },
  RICE: { id: 'RICE', name: 'Rice', category: 'bonus', yields: { food: 1 }, improvement: 'FARM', terrains: ['GRASSLAND'], elevations: FLAT, okFeatures: ['MARSH', 'FLOODPLAINS_GRASSLAND'], harvestAmount: 20, harvestYield: 'food' },
  CATTLE: { id: 'CATTLE', name: 'Cattle', category: 'bonus', yields: { food: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND'], elevations: FLAT, noFeature: true, harvestAmount: 20, harvestYield: 'food' },
  SHEEP: { id: 'SHEEP', name: 'Sheep', category: 'bonus', yields: { food: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT'], elevations: HILLS, noFeature: true, harvestAmount: 20, harvestYield: 'food' },
  STONE: { id: 'STONE', name: 'Stone', category: 'bonus', yields: { production: 1 }, improvement: 'QUARRY', terrains: ['GRASSLAND'], elevations: ANY, noFeature: true, harvestAmount: 20, harvestYield: 'production' },
  DEER: { id: 'DEER', name: 'Deer', category: 'bonus', yields: { production: 1 }, improvement: 'CAMP', terrains: ['TUNDRA', 'GRASSLAND', 'PLAINS'], elevations: ANY, requiresFeature: ['WOODS'], harvestAmount: 20, harvestYield: 'production' },
  BANANAS: { id: 'BANANAS', name: 'Bananas', category: 'bonus', yields: { food: 1 }, improvement: 'PLANTATION', terrains: ['PLAINS'], elevations: FLAT, requiresFeature: ['RAINFOREST'], harvestAmount: 20, harvestYield: 'food' },
  FISH: { id: 'FISH', name: 'Fish', category: 'bonus', yields: { food: 1 }, improvement: 'FISHING_BOATS', terrains: ['COAST', 'LAKE'], elevations: FLAT, harvestAmount: 20, harvestYield: 'food' },
  CRABS: { id: 'CRABS', name: 'Crabs', category: 'bonus', yields: { gold: 2 }, improvement: 'FISHING_BOATS', terrains: ['COAST'], elevations: FLAT, harvestAmount: 40, harvestYield: 'gold' },
  COPPER: { id: 'COPPER', name: 'Copper', category: 'bonus', yields: { gold: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA'], elevations: HILLS, noFeature: true, harvestAmount: 40, harvestYield: 'gold' },
  // CIV6 (GranColombia_Maya_Resources.xml): RESOURCE_MAIZE, a bonus resource
  // of flat Grassland and Plains with no feature row, +2 Gold, worked by a
  // Farm, harvested for 40 Gold.
  MAIZE: { id: 'MAIZE', name: 'Maize', category: 'bonus', yields: { gold: 2 }, improvement: 'FARM', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true, harvestAmount: 40, harvestYield: 'gold' },

  HORSES: { id: 'HORSES', name: 'Horses', category: 'strategic', revealTech: 'ANIMAL_HUSBANDRY', yields: { food: 1, production: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  IRON: { id: 'IRON', name: 'Iron', category: 'strategic', revealTech: 'BRONZE_WORKING', yields: { science: 1 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'], elevations: HILLS, noFeature: true },
  NITER: { id: 'NITER', name: 'Niter', category: 'strategic', revealTech: 'MILITARY_ENGINEERING', yields: { food: 1, production: 1 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], elevations: FLAT, okFeatures: ['FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS'] },
  COAL: { id: 'COAL', name: 'Coal', category: 'strategic', revealTech: 'INDUSTRIALIZATION', yields: { production: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS'], elevations: HILLS, noFeature: true },
  OIL: { id: 'OIL', name: 'Oil', category: 'strategic', revealTech: 'REFINING', yields: { production: 3 }, improvement: 'OIL_WELL', waterImprovement: 'OFFSHORE_OIL_RIG', terrains: ['DESERT', 'TUNDRA', 'SNOW'], elevations: FLAT, noFeature: true },
  ALUMINUM: { id: 'ALUMINUM', name: 'Aluminum', category: 'strategic', revealTech: 'RADIO', yields: { science: 1 }, improvement: 'MINE', terrains: ['DESERT', 'PLAINS'], elevations: HILLS, noFeature: true },
  URANIUM: { id: 'URANIUM', name: 'Uranium', category: 'strategic', revealTech: 'COMBINED_ARMS', yields: { production: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'], elevations: ANY, noFeature: true },

  WINE: { id: 'WINE', name: 'Wine', category: 'luxury', yields: { food: 1, gold: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  COTTON: { id: 'COTTON', name: 'Cotton', category: 'luxury', yields: { gold: 3 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, okFeatures: ['FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS'] },
  SILK: { id: 'SILK', name: 'Silk', category: 'luxury', yields: { gold: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, requiresFeature: ['WOODS'] },
  DYES: { id: 'DYES', name: 'Dyes', category: 'luxury', yields: { faith: 1 }, improvement: 'PLANTATION', terrains: ['PLAINS', 'GRASSLAND'], elevations: FLAT, requiresFeature: ['RAINFOREST', 'WOODS'] },
  SPICES: { id: 'SPICES', name: 'Spices', category: 'luxury', yields: { food: 2 }, improvement: 'PLANTATION', terrains: ['PLAINS'], elevations: FLAT, requiresFeature: ['RAINFOREST'] },
  SUGAR: { id: 'SUGAR', name: 'Sugar', category: 'luxury', yields: { food: 2 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'DESERT'], elevations: FLAT, requiresFeature: ['MARSH', 'FLOODPLAINS', 'FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS'] },
  CITRUS: { id: 'CITRUS', name: 'Citrus', category: 'luxury', yields: { food: 2 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  TEA: { id: 'TEA', name: 'Tea', category: 'luxury', yields: { science: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND'], elevations: ANY, noFeature: true },
  TOBACCO: { id: 'TOBACCO', name: 'Tobacco', category: 'luxury', yields: { faith: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  INCENSE: { id: 'INCENSE', name: 'Incense', category: 'luxury', yields: { faith: 1 }, improvement: 'PLANTATION', terrains: ['DESERT', 'PLAINS'], elevations: FLAT, noFeature: true },
  FURS: { id: 'FURS', name: 'Furs', category: 'luxury', yields: { food: 1, gold: 1 }, improvement: 'CAMP', terrains: ['TUNDRA'], elevations: ANY },
  IVORY: { id: 'IVORY', name: 'Ivory', category: 'luxury', yields: { food: 1, production: 1 }, improvement: 'CAMP', terrains: ['PLAINS', 'DESERT'], elevations: FLAT, noFeature: true },
  TRUFFLES: { id: 'TRUFFLES', name: 'Truffles', category: 'luxury', yields: { gold: 3 }, improvement: 'CAMP', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, requiresFeature: ['WOODS', 'MARSH', 'RAINFOREST'] },
  DIAMONDS: { id: 'DIAMONDS', name: 'Diamonds', category: 'luxury', yields: { gold: 3 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA'], elevations: HILLS, noFeature: true },
  SILVER: { id: 'SILVER', name: 'Silver', category: 'luxury', yields: { gold: 3 }, improvement: 'MINE', terrains: ['DESERT', 'TUNDRA'], elevations: ANY, noFeature: true },
  JADE: { id: 'JADE', name: 'Jade', category: 'luxury', yields: { culture: 1 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], elevations: ANY, noFeature: true },
  MARBLE: { id: 'MARBLE', name: 'Marble', category: 'luxury', yields: { culture: 1 }, improvement: 'QUARRY', terrains: ['GRASSLAND', 'PLAINS'], elevations: ANY, noFeature: true },
  SALT: { id: 'SALT', name: 'Salt', category: 'luxury', yields: { food: 1, gold: 1 }, improvement: 'MINE', terrains: ['DESERT', 'PLAINS', 'TUNDRA'], elevations: FLAT, noFeature: true },
  PEARLS: { id: 'PEARLS', name: 'Pearls', category: 'luxury', yields: { faith: 1 }, improvement: 'FISHING_BOATS', terrains: ['COAST'], elevations: FLAT },
  WHALES: { id: 'WHALES', name: 'Whales', category: 'luxury', yields: { production: 1, gold: 1 }, improvement: 'FISHING_BOATS', terrains: ['COAST'], elevations: FLAT },
  // CIV6 (Expansion1_Resources.xml, which Gathering Storm loads): RESOURCECLASS_LUXURY,
  // Happiness 4, +1 Culture, Resource_ValidTerrains Coast and
  // Resource_ValidFeatures Jungle and Forest; Expansion1_Improvements.xml
  // works it with Fishing Boats or a Mine (MustRemoveFeature false).
  AMBER: { id: 'AMBER', name: 'Amber', category: 'luxury', yields: { culture: 1 }, improvement: 'MINE', waterImprovement: 'FISHING_BOATS', terrains: ['COAST'], elevations: ANY, anyTerrainFeatures: ['WOODS', 'RAINFOREST'] },
  // CIV6 (Resources.xml): Cocoa +3 Gold on Jungle, a Plantation; Coffee +1
  // Culture on Grassland or Jungle, a Plantation; Gypsum +1 Gold +1 Production
  // on Desert/Plains/Tundra Hills and flat Plains, a Quarry; Mercury +1 Science
  // on Plains, a Mine. Expansion1_Resources.xml: Olives +1 Gold +1 Production
  // on Grassland, a Plantation; Turtles +1 Science on Reef, Fishing Boats.
  // GranColombia_Maya_Resources.xml: Honey +2 Food on Grassland or Plains, a
  // Camp. Every row is RESOURCECLASS_LUXURY, Happiness 4.
  COCOA: { id: 'COCOA', name: 'Cocoa', category: 'luxury', yields: { gold: 3 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, requiresFeature: ['RAINFOREST'] },
  COFFEE: { id: 'COFFEE', name: 'Coffee', category: 'luxury', yields: { culture: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND'], elevations: FLAT, anyTerrainFeatures: ['RAINFOREST'] },
  GYPSUM: { id: 'GYPSUM', name: 'Gypsum', category: 'luxury', yields: { gold: 1, production: 1 }, improvement: 'QUARRY', terrains: ['DESERT', 'PLAINS', 'TUNDRA'], elevations: HILLS, noFeature: true },
  MERCURY: { id: 'MERCURY', name: 'Mercury', category: 'luxury', yields: { science: 1 }, improvement: 'MINE', terrains: ['PLAINS'], elevations: FLAT, noFeature: true },
  OLIVES: { id: 'OLIVES', name: 'Olives', category: 'luxury', yields: { gold: 1, production: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND'], elevations: FLAT, noFeature: true },
  TURTLES: { id: 'TURTLES', name: 'Turtles', category: 'luxury', yields: { science: 1 }, improvement: 'FISHING_BOATS', terrains: [], elevations: FLAT, anyTerrainFeatures: ['REEF'] },
  HONEY: { id: 'HONEY', name: 'Honey', category: 'luxury', yields: { food: 2 }, improvement: 'CAMP', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
};

/** The improvement that works the resource on THIS plot: the row's water
 *  improvement on a water plot, where it names one, else its own. */
export function resourceImprovement(tile: Tile): ImprovementId | null {
  if (!tile.resource) return null;
  const def = RESOURCES[tile.resource];
  if (!def) return null;
  return def.waterImprovement && TERRAINS[tile.terrain].water ? def.waterImprovement : def.improvement;
}

/** the LUXURY rows in catalog order — the one shared order every luxury
 *  index rides: the tile plane's `lux`, and the Congress target space. */
export const LUXURY_IDS = Object.values(RESOURCES)
  .filter((r) => r.category === 'luxury')
  .map((r) => r.id);
