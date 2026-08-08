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

import type { Elevation, ImprovementId, ResourceCategory, TerrainId, YieldKey, Yields } from './types';

export interface ResourceDef {
  id: string;
  name: string;
  category: ResourceCategory;
  yields: Partial<Yields>;
  improvement: ImprovementId;
  /** Valid base terrains. */
  terrains: TerrainId[];
  /** Valid elevations (FLAT/HILLS). */
  elevations: Elevation[];
  /** If set, resource only spawns on one of these features. */
  requiresFeature?: string[];
  /** Features the resource may additionally coexist with. */
  okFeatures?: string[];
  /** If set, resource never spawns on a feature. */
  noFeature?: boolean;
  /**
   * Yield granted (era-scaled lump) when a builder harvests it in units
   * mode, removing the resource. Only some bonus resources, as in Civ 6.
   */
  harvestYield?: YieldKey;
}

const FLAT: Elevation[] = ['FLAT'];
const HILLS: Elevation[] = ['HILLS'];
const ANY: Elevation[] = ['FLAT', 'HILLS'];

export const RESOURCES: Record<string, ResourceDef> = {
  // --- Bonus ---------------------------------------------------------------
  WHEAT: { id: 'WHEAT', name: 'Wheat', category: 'bonus', yields: { food: 1 }, improvement: 'FARM', terrains: ['PLAINS'], elevations: FLAT, okFeatures: ['FLOODPLAINS'], harvestYield: 'food' },
  RICE: { id: 'RICE', name: 'Rice', category: 'bonus', yields: { food: 1 }, improvement: 'FARM', terrains: ['GRASSLAND'], elevations: FLAT, okFeatures: ['MARSH'], harvestYield: 'food' },
  CATTLE: { id: 'CATTLE', name: 'Cattle', category: 'bonus', yields: { food: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND'], elevations: FLAT, noFeature: true },
  SHEEP: { id: 'SHEEP', name: 'Sheep', category: 'bonus', yields: { food: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT'], elevations: HILLS, noFeature: true },
  STONE: { id: 'STONE', name: 'Stone', category: 'bonus', yields: { production: 1 }, improvement: 'QUARRY', terrains: ['GRASSLAND'], elevations: ANY, noFeature: true, harvestYield: 'production' },
  DEER: { id: 'DEER', name: 'Deer', category: 'bonus', yields: { production: 1 }, improvement: 'CAMP', terrains: ['TUNDRA', 'GRASSLAND', 'PLAINS'], elevations: ANY, requiresFeature: ['WOODS'], harvestYield: 'production' },
  BANANAS: { id: 'BANANAS', name: 'Bananas', category: 'bonus', yields: { food: 1 }, improvement: 'PLANTATION', terrains: ['PLAINS'], elevations: FLAT, requiresFeature: ['RAINFOREST'], harvestYield: 'food' },
  FISH: { id: 'FISH', name: 'Fish', category: 'bonus', yields: { food: 1 }, improvement: 'FISHING_BOATS', terrains: ['COAST', 'LAKE'], elevations: FLAT, harvestYield: 'food' },
  CRABS: { id: 'CRABS', name: 'Crabs', category: 'bonus', yields: { gold: 2 }, improvement: 'FISHING_BOATS', terrains: ['COAST'], elevations: FLAT, harvestYield: 'gold' },
  COPPER: { id: 'COPPER', name: 'Copper', category: 'bonus', yields: { gold: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA'], elevations: HILLS, noFeature: true, harvestYield: 'gold' },

  // --- Strategic -----------------------------------------------------------
  HORSES: { id: 'HORSES', name: 'Horses', category: 'strategic', yields: { food: 1, production: 1 }, improvement: 'PASTURE', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  IRON: { id: 'IRON', name: 'Iron', category: 'strategic', yields: { science: 1 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'], elevations: HILLS, noFeature: true },
  NITER: { id: 'NITER', name: 'Niter', category: 'strategic', yields: { food: 1, production: 1 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], elevations: FLAT, noFeature: true },
  COAL: { id: 'COAL', name: 'Coal', category: 'strategic', yields: { production: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS'], elevations: HILLS, noFeature: true },
  OIL: { id: 'OIL', name: 'Oil', category: 'strategic', yields: { production: 3 }, improvement: 'OIL_WELL', terrains: ['DESERT', 'TUNDRA', 'SNOW'], elevations: FLAT, noFeature: true },
  ALUMINUM: { id: 'ALUMINUM', name: 'Aluminum', category: 'strategic', yields: { science: 1 }, improvement: 'MINE', terrains: ['DESERT', 'PLAINS'], elevations: HILLS, noFeature: true },
  URANIUM: { id: 'URANIUM', name: 'Uranium', category: 'strategic', yields: { production: 2 }, improvement: 'MINE', terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'], elevations: ANY, noFeature: true },

  // --- Luxury --------------------------------------------------------------
  WINE: { id: 'WINE', name: 'Wine', category: 'luxury', yields: { food: 1, gold: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  COTTON: { id: 'COTTON', name: 'Cotton', category: 'luxury', yields: { gold: 3 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, noFeature: true },
  SILK: { id: 'SILK', name: 'Silk', category: 'luxury', yields: { gold: 1 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'PLAINS'], elevations: FLAT, requiresFeature: ['WOODS'] },
  DYES: { id: 'DYES', name: 'Dyes', category: 'luxury', yields: { faith: 1 }, improvement: 'PLANTATION', terrains: ['PLAINS', 'GRASSLAND'], elevations: FLAT, requiresFeature: ['RAINFOREST', 'WOODS'] },
  SPICES: { id: 'SPICES', name: 'Spices', category: 'luxury', yields: { food: 2 }, improvement: 'PLANTATION', terrains: ['PLAINS'], elevations: FLAT, requiresFeature: ['RAINFOREST'] },
  SUGAR: { id: 'SUGAR', name: 'Sugar', category: 'luxury', yields: { food: 2 }, improvement: 'PLANTATION', terrains: ['GRASSLAND', 'DESERT'], elevations: FLAT, requiresFeature: ['MARSH', 'FLOODPLAINS'] },
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
};

export const RESOURCE_CATEGORY_COLORS: Record<ResourceCategory, string> = {
  bonus: '#c8d6b9',
  luxury: '#8e6fb0',
  strategic: '#c97a4a',
};
