/**
 * Tile improvements. In units mode a builder places these, spending
 * one of its finite charges, and only where research allows: validImprovementsIn
 * (cpu/core/rules.ts) gates each on unlocks.improvements plus the hillFarms civic
 * for hill farms. Sandbox mode is the exception — it bypasses all research gating.
 * Yields are base Civ 6 values (pre-tech-boost), every one sourced against the
 * Gathering Storm CIVILOPEDIA. No `eyeballed`/`approximate` markers remain.
 */

import type { DistrictId, ImprovementId, PlunderRow, Yields, YieldKey } from '../core/types';
import type { Elevation, FeatureId, TerrainId } from '../../world/types';
import type { CivId, LeaderId } from './seats';
import { xml, type SrcMap } from './provenance';

/**
 * What a neighbour pays a SUZERAIN improvement. Each row counts the
 * neighbours that match ANY of its sources, divides by `per`, and pays
 * `yields` for each whole group. A civic may improve the rate, the payout, or
 * both — which is exactly how the three sourced rows below read.
 */
interface ImpAdjacency {
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
  /** CIV6 (`MODIFIER_SINGLE_PLOT_ADJUST_PLOT_YIELDS` over a `PLOT_ADJACENT_*`
   *  requirement set): the requirement is a yes/no test of the plot, so the
   *  row pays `yields` ONCE when any neighbour matches, however many do. */
  once?: boolean;
}

export interface ImprovementDef {
  id: ImprovementId;
  /** PROVENANCE, per column (cpu/data/provenance.ts): the install row and column
   *  each number came from. Stripped by the exporter; checked by
   *  tools/install/xml_check.py. */
  src?: SrcMap;
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
  /** CIV6 (a TRAIT_LEADER_* `TraitType`): a LEADER's improvement — a seat
   *  led by this leader alone lays it, whatever civilization it plays. */
  uniqueLeader?: LeaderId;
  /** CIV6 (MOUNTAIN_PORTAL, EFFECT_MOUNTAIN_PORTAL): "Acts as a movement
   *  portal on a mountain range, allowing units to move into it and exit from
   *  another portal at the cost of 2 Movement" — its mountain is enterable,
   *  and every portal on one range leads to the others (`portalExit`). */
  portal?: boolean;
  /** CIV6 (`Improvements_XP2.BuildOnAdjacentPlot`): "Can only be built on an
   *  adjacent Mountain tile" — the unit stands OFF the plot it improves
   *  (`adjacentPlotTarget`). */
  adjacentPlot?: boolean;
  /** CIV6 (Improvement_ValidFeatures): the ONLY features the row may stand
   *  on. Absent is the install writing no row, and the row refuses every
   *  feature plot. Every arm of `validImprovementsIn` that reads the catalog's
   *  ground clause reads it, the Lumber Mill's too; the Farm, Mine, Seaside
   *  Resort and the resource rows spell their own ground. */
  features?: FeatureId[];
  /** CIV6 (`Improvement_ValidFeatures.PrereqCivic`): a listed feature the row
   *  takes only once the seat holds this civic (`Unlocks.featureRows`). */
  featureCivics?: Partial<Record<FeatureId, string>>;
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
   *  is handed for free. */
  defenseCS?: number;
  grantsFortification?: number;
  /** CIV6 (Great Wall, `BuildInLine` / `BuildOnFrontier`): the row may only
   *  be laid along the seat's own BORDER, each segment beside the last. */
  buildInLine?: boolean;
  buildOnFrontier?: boolean;
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
   *  swapped" — the tile-swap verb refuses the plot (`swapTileOk`). */
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
  /** CIV6 (MERCHANT_RENEWABLE_ENERGY_*_GENERATE_POWER,
   *  MODIFIER_SINGLE_CITY_ADJUST_FREE_POWER behind
   *  CITY_HAS_GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY): Power the row
   *  supplies its city ON TOP of `power` while the owning city's governor
   *  holds the promotion. */
  governorPower?: { promo: string; amount: number };
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

/** CIV6 (Renewable Subsidizer): "All Offshore Wind Farms, Solar Farms, Wind
 *  Farms, Geothermal Plants and Hydroelectric Dams in this city receive +2
 *  Power and +2 Gold" — the renewable generators' half. The Gold is
 *  RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD (a plot yield over the
 *  PLOT_HAS_RENEWABLE_IMPROVEMENT set), the Power each row's own
 *  MERCHANT_RENEWABLE_ENERGY_*_GENERATE_POWER; the Dam's half rides the
 *  promotion (`buildingYields`, `buildingPower`). */
const RENEWABLE_SUBSIDY = {
  governorYields: { promo: 'RENEWABLE_SUBSIDIZER', yields: { gold: 2 } },
  governorPower: { promo: 'RENEWABLE_SUBSIDIZER', amount: 2 },
};
/** the install's names for each generator: its power row's middle, and the
 *  requirement that names it inside PLOT_HAS_RENEWABLE_IMPROVEMENT. */
const RENEWABLE_SUBSIDY_REQ: Readonly<Record<string, string>> = {
  SOLAR_FARM: 'REQUIRES_CITY_HAS_SOLAR_FARM',
  WIND_FARM: 'REQUIRES_CITY_HAS_WIND_FARM',
  GEOTHERMAL: 'REQUIRES_CITY_HAS_GEOTHERMAL_PLANT',
  OFFSHORE_WIND_FARM: 'REQUIRES_CITY_HAS_OFFSHORE_WIND_FARM',
};
const renewableSubsidySrc = (power: string): SrcMap => ({
  'governorYields.promo': xml('GovernorPromotionModifiers',
    'GovernorPromotionType=GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY&ModifierId=RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD',
    'GovernorPromotionType', { expect: 'GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY' }),
  'governorYields.yields.gold': xml('ModifierArguments',
    'ModifierId=RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD&Name=Amount', 'Value',
    { note: `PLOT_HAS_RENEWABLE_IMPROVEMENT names this row through ${RENEWABLE_SUBSIDY_REQ[power]}` }),
  'governorPower.promo': xml('RequirementArguments',
    'RequirementId=REQUIRES_CITY_HAS_GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY&Name=GovernorPromotionType',
    'Value', { expect: 'GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY' }),
  'governorPower.amount': xml('ModifierArguments',
    `ModifierId=MERCHANT_RENEWABLE_ENERGY_${power}_GENERATE_POWER&Name=Amount`, 'Value'),
});

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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_FARM', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_FARM', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_FARM&YieldType=YIELD_FOOD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_FARM', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_FARM', 'TilesRequired')] },
      resourceOnly: { derived: 'false: the install writes Improvement_ValidTerrains rows for the Farm beside its ValidResources rows, so it is not resource-ONLY', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_FARM', 'TerrainType')] },
    },
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
    src: {
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_MINE', 'Appeal'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_MINE', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_MINE', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_MINE&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MINE', 'Housing'),
      resourceOnly: { derived: 'false: the install writes Improvement_ValidTerrains rows for the Mine beside its ValidResources rows, so it is not resource-ONLY', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MINE', 'TerrainType')] },
    },
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
    src: {
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_QUARRY', 'Appeal'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_QUARRY', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_QUARRY', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_QUARRY', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_QUARRY', 'ResourceType')] },
    },
  },
  LUMBER_MILL: {
    id: 'LUMBER_MILL',
    name: 'Lumber Mill',
    code: 'Lu',
    plunder: { kind: 'gold', amount: 50 },
    // Improvement_YieldChanges (Expansion2_Improvements.xml): YIELD_PRODUCTION 2.
    yields: { production: 2 },
    // CIV6 (Lumber Mill): "+1 Production if adjacent to River."
    riverYields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    features: ['WOODS', 'RAINFOREST'],
    featureCivics: { RAINFOREST: 'MERCANTILISM' },
    description: 'Woods, or Rainforest from Mercantilism. +2 production, +1 more on a river.',
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_LUMBER_MILL (FEATURE_FOREST, FEATURE_JUNGLE), as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'FeatureType')] },
      'featureCivics.RAINFOREST': xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_LUMBER_MILL&FeatureType=FEATURE_JUNGLE', 'PrereqCivic', { expect: 'CIVIC_MERCANTILISM' }),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_LUMBER_MILL&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'ResourceType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_PASTURE', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_PASTURE', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_PASTURE', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_PASTURE', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_PASTURE', 'ResourceType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_CAMP', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_CAMP', 'PlunderAmount'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_GOLD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_CAMP', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_CAMP', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_CAMP', 'ResourceType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_PLANTATION', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_PLANTATION', 'PlunderAmount'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_PLANTATION&YieldType=YIELD_GOLD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_PLANTATION', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_PLANTATION', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_PLANTATION', 'ResourceType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_FISHING_BOATS&YieldType=YIELD_FOOD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'ResourceType')] },
    },
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
    src: {
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'Appeal'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_OIL_WELL&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'ResourceType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_BEACH_RESORT', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_BEACH_RESORT', 'PlunderAmount'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_BEACH_RESORT', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_BEACH_RESORT', 'ResourceType')] },
    },
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
    ...RENEWABLE_SUBSIDY,
    elevations: ['FLAT'],
    excludeTerrains: ['SNOW'],
    description: 'Flat non-snow land with no feature. Supplies 2 Power to its city from the sun.',
    src: {
      ...renewableSubsidySrc('SOLAR_FARM'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'PlunderAmount'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_SOLAR_FARM&YieldType=YIELD_GOLD', 'YieldChange'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_SOLAR_FARM&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'ResourceType')] },
      groundOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'Domain', { expect: 'DOMAIN_LAND' }),
      power: xml('ModifierArguments', 'ModifierId=SOLAR_FARM_GENERATE_POWER&Name=Amount', 'Value'),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_SOLAR_FARM', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'TerrainType')] },
    },
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
    ...RENEWABLE_SUBSIDY,
    elevations: ['HILLS'],
    description: 'Hills with no feature. Supplies 2 Power to its city from the wind.',
    src: {
      ...renewableSubsidySrc('WIND_FARM'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'PlunderAmount'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_WIND_FARM&YieldType=YIELD_GOLD', 'YieldChange'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_WIND_FARM&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'ResourceType')] },
      groundOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'Domain', { expect: 'DOMAIN_LAND' }),
      power: xml('ModifierArguments', 'ModifierId=WIND_FARM_GENERATE_POWER&Name=Amount', 'Value'),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_WIND_FARM', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'TerrainType')] },
    },
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
    ...RENEWABLE_SUBSIDY,
    requiresFeature: 'GEOTHERMAL_FISSURE',
    description: 'A Geothermal Fissure. Supplies 4 Power to its city from the ground.',
    features: ['GEOTHERMAL_FISSURE'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_GEOTHERMAL_PLANT, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'FeatureType')] },
      ...renewableSubsidySrc('GEOTHERMAL'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'PlunderAmount'),
      'yields.science': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT&YieldType=YIELD_SCIENCE', 'YieldChange'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'ResourceType')] },
      groundOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'Domain', { expect: 'DOMAIN_LAND' }),
      power: xml('ModifierArguments', 'ModifierId=GEOTHERMAL_GENERATE_POWER&Name=Amount', 'Value'),
      requiresFeature: xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT&FeatureType=FEATURE_GEOTHERMAL_FISSURE', 'FeatureType', { expect: 'FEATURE_GEOTHERMAL_FISSURE' }),
    },
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
    // Fort's own columns; the Great Wall and the Pa carry the same pair.
    defenseCS: 4,
    grantsFortification: 2,
    // CIV6 (Fort): "can be built on any featureless land tile"; its one
    // Improvement_ValidFeatures row is Volcanic Soil.
    description: 'Military Engineer only, featureless land. Occupying unit gets +4 defense strength and 2 turns of fortification.',
    features: ['VOLCANIC_SOIL'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_FORT, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_FORT', 'FeatureType')] },
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_FORT', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_FORT', 'ResourceType')] },
      engineer: xml('Improvement_ValidBuildUnits', 'ImprovementType=IMPROVEMENT_FORT&UnitType=UNIT_MILITARY_ENGINEER', 'UnitType', { expect: 'UNIT_MILITARY_ENGINEER' }),
      outsideTerritory: xml('Improvements', 'ImprovementType=IMPROVEMENT_FORT', 'CanBuildOutsideTerritory', { expect: true }),
      defenseCS: xml('Improvements', 'ImprovementType=IMPROVEMENT_FORT', 'DefenseModifier'),
      grantsFortification: xml('Improvements', 'ImprovementType=IMPROVEMENT_FORT', 'GrantFortification'),
    },
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
    features: ['VOLCANIC_SOIL'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_AIRSTRIP, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'FeatureType')] },
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'ResourceType')] },
      engineer: xml('Improvement_ValidBuildUnits', 'ImprovementType=IMPROVEMENT_AIRSTRIP&UnitType=UNIT_MILITARY_ENGINEER', 'UnitType', { expect: 'UNIT_MILITARY_ENGINEER' }),
      outsideTerritory: xml('Improvements', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'CanBuildOutsideTerritory', { expect: true }),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_AIRSTRIP', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'TerrainType')] },
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'Appeal'),
      airSlots: xml('Improvements', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'AirSlots'),
    },
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
    features: ['VOLCANIC_SOIL'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_MISSILE_SILO, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'FeatureType')] },
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'ResourceType')] },
      engineer: xml('Improvement_ValidBuildUnits', 'ImprovementType=IMPROVEMENT_MISSILE_SILO&UnitType=UNIT_MILITARY_ENGINEER', 'UnitType', { expect: 'UNIT_MILITARY_ENGINEER' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_MISSILE_SILO, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MISSILE_SILO', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'TerrainType')] },
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_BATEY', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_BATEY', 'PlunderAmount'),
      'yields.culture': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_BATEY&YieldType=YIELD_CULTURE', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_BATEY', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_BATEY', 'ResourceType')] },
      suzerainOf: xml('Improvements', 'ImprovementType=IMPROVEMENT_BATEY', 'TraitType', { expect: 'MINOR_CIV_CAGUANA_TRAIT' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_BATEY, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_BATEY', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_BATEY', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_BATEY', 'TerrainType')] },
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_BATEY', 'SameAdjacentValid', { expect: false }),
      'adjacency.0.bonusResource': xml('Adjacency_YieldChanges', 'ID=Batey_BonusResourceAdjacency', 'AdjacentResourceClass', { expect: 'RESOURCECLASS_BONUS' }),
      'adjacency.0.district': xml('Adjacency_YieldChanges', 'ID=Batey_EntertainmentComplexAdjacency', 'AdjacentDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Batey_BonusResourceAdjacency', 'TilesRequired'),
      'adjacency.0.yields.culture': xml('Adjacency_YieldChanges', 'ID=Batey_BonusResourceAdjacency', 'YieldChange'),
      'adjacency.0.upgradeCivic': xml('Adjacency_YieldChanges', 'ID=Batey_LateBonusResourceAdjacency', 'PrereqCivic', { expect: 'CIVIC_EXPLORATION' }),
      'adjacency.0.upgradeYields.culture': xml('Adjacency_YieldChanges', 'ID=Batey_LateBonusResourceAdjacency', 'YieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_BATEY', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_BATEY', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    // CIV6: "Cannot be built on Snow or Snow Hills."; its one
    // Improvement_ValidFeatures row is Volcanic Soil.
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
    features: ['VOLCANIC_SOIL'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_COLOSSAL_HEAD, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'FeatureType')] },
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'PlunderAmount'),
      'yields.faith': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD&YieldType=YIELD_FAITH', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'ResourceType')] },
      suzerainOf: xml('Improvements', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'TraitType', { expect: 'MINOR_CIV_LA_VENTA_TRAIT' }),
      'adjacency.0.features': xml('Adjacency_YieldChanges', 'ID=ColossalHead_FaithForestEarly', 'AdjacentFeature', { expect: 'FEATURE_FOREST' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=ColossalHead_FaithForestEarly', 'TilesRequired'),
      'adjacency.0.yields.faith': xml('Adjacency_YieldChanges', 'ID=ColossalHead_FaithForestEarly', 'YieldChange'),
      'adjacency.0.upgradeCivic': xml('Adjacency_YieldChanges', 'ID=ColossalHead_FaithForestLate', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }),
      'adjacency.0.upgradePer': xml('Adjacency_YieldChanges', 'ID=ColossalHead_FaithForestLate', 'TilesRequired'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'TourismSource', { expect: 'TOURISMSOURCE_FAITH' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_COLOSSAL_HEAD', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'PlunderAmount'),
      'yields.faith': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_MONASTERY&YieldType=YIELD_FAITH', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MONASTERY', 'ResourceType')] },
      suzerainOf: xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'TraitType', { expect: 'MINOR_CIV_ARMAGH_TRAIT' }),
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'SameAdjacentValid', { expect: false }),
      'adjacency.0.anyDistrict': xml('Adjacency_YieldChanges', 'ID=Monastery_DistrictAdjacency', 'OtherDistrictAdjacent', { expect: true }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Monastery_DistrictAdjacency', 'TilesRequired'),
      'adjacency.0.yields.faith': xml('Adjacency_YieldChanges', 'ID=Monastery_DistrictAdjacency', 'YieldChange'),
      religiousHeal: xml('Improvements', 'ImprovementType=IMPROVEMENT_MONASTERY', 'ReligiousUnitHealRate'),
    },
  },
  // CIV6 (Offshore Wind Farm): "+2 Production", "Provides 2 Power per turn",
  // "Must be constructed on Coast and Lake", unlocked by Predictive Systems
  // and built by Builders. The install names no Improvement_ValidFeatures row
  // for it, so a Reef plot refuses it as Woods refuse a Farm.
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
    ...RENEWABLE_SUBSIDY,
    terrains: ['COAST', 'LAKE'],
    description: 'Coast or Lake with no feature. Supplies 2 Power to its city from the wind.',
    src: {
      ...renewableSubsidySrc('OFFSHORE_WIND_FARM'),
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'ResourceType')] },
      waterOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'Domain', { expect: 'DOMAIN_SEA' }),
      power: xml('ModifierArguments', 'ModifierId=OFFSHORE_WIND_FARM_GENERATE_POWER&Name=Amount', 'Value'),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_OFFSHORE_WIND_FARM, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'TerrainType')] },
    },
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
    // CIV6 (SPHINX_WONDERADJACENCY_FAITH): "+2 Faith if next to a wonder" —
    // a yes/no requirement set, so two wonders pay it once
    adjacency: [{ builtWonder: true, once: true, per: 1, yields: { faith: 2 } }],
    // CIV6 (SPHINX_FLOODPLAINS_CULTURE): "+1 Culture if built on Floodplains"
    featureYields: { features: ['FLOODPLAINS'], yields: { culture: 1 } },
    // Improvements.xml (Expansion2_Improvements.xml): `Appeal="2"`
    appealAdjacent: 2,
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+1 faith +1 culture, +2 faith beside a wonder, +1 culture on floodplains, +2 appeal around. Not beside another Sphinx.',
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'PlunderAmount'),
      'yields.faith': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_SPHINX&YieldType=YIELD_FAITH', 'YieldChange'),
      'yields.culture': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_SPHINX&YieldType=YIELD_CULTURE', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_SPHINX', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_SPHINX', 'CivilizationType', { expect: 'CIVILIZATION_EGYPT' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_SPHINX, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_SPHINX', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_SPHINX', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_SPHINX', 'TerrainType')] },
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_SPHINX, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_SPHINX', 'FeatureType')] },
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'SameAdjacentValid', { expect: false }),
      'adjacency.0.builtWonder': xml('ImprovementModifiers', 'ImprovementType=IMPROVEMENT_SPHINX&ModifierId=SPHINX_WONDERADJACENCY_FAITH', 'ModifierId', { expect: 'SPHINX_WONDERADJACENCY_FAITH' }),
      'adjacency.0.yields.faith': xml('ModifierArguments', 'ModifierId=SPHINX_WONDERADJACENCY_FAITH&Name=Amount', 'Value'),
      'adjacency.0.once': xml('Modifiers', 'ModifierId=SPHINX_WONDERADJACENCY_FAITH', 'SubjectRequirementSetId', { expect: 'PLOT_ADJACENT_TO_WONDER_REQUIREMENTS' }),
      'featureYields.features': xml('ImprovementModifiers', 'ImprovementType=IMPROVEMENT_SPHINX&ModifierId=SPHINX_FLOODPLAINS_CULTURE', 'ModifierId', { expect: 'SPHINX_FLOODPLAINS_CULTURE' }),
      'featureYields.yields.culture': xml('ModifierArguments', 'ModifierId=SPHINX_FLOODPLAINS_CULTURE&Name=Amount', 'Value'),
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'Appeal'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_SPHINX', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_SPHINX', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    features: ['VOLCANIC_SOIL'],
    src: {
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_TERRACE_FARM, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'FeatureType')] },
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_TERRACE_FARM&YieldType=YIELD_FOOD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_TERRACE_FARM', 'CivilizationType', { expect: 'CIVILIZATION_INCA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_TERRACE_FARM, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_TERRACE_FARM', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_TERRACE_FARM', 'TerrainType')] },
      'adjacency.0.mountain': xml('Adjacency_YieldChanges', 'ID=Terrace_GrassMountainAdjacency', 'AdjacentTerrain', { expect: 'TERRAIN_GRASS_MOUNTAIN' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Terrace_GrassMountainAdjacency', 'TilesRequired'),
      'adjacency.0.yields.food': xml('Adjacency_YieldChanges', 'ID=Terrace_GrassMountainAdjacency', 'YieldChange'),
      'adjacency.1.district': xml('Adjacency_YieldChanges', 'ID=Terrace_AqueductAdjacency', 'AdjacentDistrict', { expect: 'DISTRICT_AQUEDUCT' }),
      'adjacency.1.per': xml('Adjacency_YieldChanges', 'ID=Terrace_AqueductAdjacency', 'TilesRequired'),
      'adjacency.1.yields.production': xml('Adjacency_YieldChanges', 'ID=Terrace_AqueductAdjacency', 'YieldChange'),
      'adjacency.2.sameImprovement': xml('Adjacency_YieldChanges', 'ID=Terrace_MedievalAdjacency', 'AdjacentImprovement', { expect: 'IMPROVEMENT_TERRACE_FARM' }),
      'adjacency.2.requiresCivic': xml('Adjacency_YieldChanges', 'ID=Terrace_MedievalAdjacency', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
      'adjacency.2.per': xml('Adjacency_YieldChanges', 'ID=Terrace_MedievalAdjacency', 'TilesRequired'),
      'adjacency.2.yields.food': xml('Adjacency_YieldChanges', 'ID=Terrace_MedievalAdjacency', 'YieldChange'),
      'adjacency.2.upgradeTech': xml('Adjacency_YieldChanges', 'ID=Terrace_MechanizedAdjacency', 'PrereqTech', { expect: 'TECH_REPLACEABLE_PARTS' }),
      'adjacency.2.upgradePer': xml('Adjacency_YieldChanges', 'ID=Terrace_MechanizedAdjacency', 'TilesRequired'),
    },
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
    portal: true,
    adjacentPlot: true,
    description: 'Military Engineer only, on a mountain, built from an adjacent tile. A movement portal to the next portal on its range, at 2 Movement. Cannot be pillaged or removed.',
    src: {
      portal: xml('ImprovementModifiers', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL&ModifierId=MOUNTAIN_PORTAL', 'ModifierId', { expect: 'MOUNTAIN_PORTAL' }),
      adjacentPlot: xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'BuildOnAdjacentPlot', { expect: true }),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'ResourceType')] },
      engineer: xml('Improvement_ValidBuildUnits', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL&UnitType=UNIT_MILITARY_ENGINEER', 'UnitType', { expect: 'UNIT_MILITARY_ENGINEER' }),
      outsideTerritory: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'CanBuildOutsideTerritory', { expect: true }),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MOUNTAIN_TUNNEL', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'TerrainType')] },
      noPillage: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'PlunderType', { expect: 'PLUNDER_NONE' }),
      disasterResistant: xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'DisasterResistant', { expect: true }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'PlunderAmount'),
      'yields.culture': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_CHATEAU&YieldType=YIELD_CULTURE', 'YieldChange'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_CHATEAU&YieldType=YIELD_GOLD', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_CHATEAU', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_CHATEAU', 'CivilizationType', { expect: 'CIVILIZATION_FRANCE' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_CHATEAU, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_CHATEAU', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_CHATEAU', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_CHATEAU', 'TerrainType')] },
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_CHATEAU, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_CHATEAU', 'FeatureType')] },
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'SameAdjacentValid', { expect: false }),
      requiresAdjacentResource: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'RequiresAdjacentBonusOrLuxury', { expect: true }),
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHATEAU', 'Appeal'),
      'riverYields.gold': xml('Adjacency_YieldChanges', 'ID=Chateau_River', 'YieldChange'),
      'adjacency.0.builtWonder': xml('Adjacency_YieldChanges', 'ID=Chateau_WonderEarly', 'AdjacentWonder', { expect: true }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Chateau_WonderEarly', 'TilesRequired'),
      'adjacency.0.yields.culture': xml('Adjacency_YieldChanges', 'ID=Chateau_WonderEarly', 'YieldChange'),
      'adjacency.0.upgradeTech': xml('Adjacency_YieldChanges', 'ID=Chateau_WonderLate', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
      'adjacency.0.upgradeYields.culture': xml('Adjacency_YieldChanges', 'ID=Chateau_WonderLate', 'YieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CHATEAU', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CHATEAU', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_CHEMAMULL&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_CHEMAMULL', 'CivilizationType', { expect: 'CIVILIZATION_MAPUCHE' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_CHEMAMULL, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_CHEMAMULL', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'TerrainType')] },
      minAppeal: xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'MinimumAppeal'),
      'appealYield.yield': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'YieldFromAppeal', { expect: 'YIELD_CULTURE' }),
      'appealYield.pct': xml('Improvements', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'YieldFromAppealPercent'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CHEMAMULL', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'PlunderAmount'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_GOLF_COURSE&YieldType=YIELD_GOLD', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_GOLF_COURSE', 'CivilizationType', { expect: 'CIVILIZATION_SCOTLAND' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_GOLF_COURSE, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_GOLF_COURSE', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'TerrainType')] },
      onePerCity: xml('Improvements', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'OnePerCity', { expect: true }),
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'Appeal'),
      'adjacency.0.district': xml('Adjacency_YieldChanges', 'ID=GolfCourse_CityCenterAdjacency', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=GolfCourse_CityCenterAdjacency', 'TilesRequired'),
      'adjacency.0.yields.culture': xml('Adjacency_YieldChanges', 'ID=GolfCourse_CityCenterAdjacency', 'YieldChange'),
      'adjacency.1.district': xml('Adjacency_YieldChanges', 'ID=GolfCourse_EntertainmentComplexAdjacency', 'AdjacentDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      'adjacency.1.per': xml('Adjacency_YieldChanges', 'ID=GolfCourse_EntertainmentComplexAdjacency', 'TilesRequired'),
      'adjacency.1.yields.culture': xml('Adjacency_YieldChanges', 'ID=GolfCourse_EntertainmentComplexAdjacency', 'YieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_GOLF_COURSE', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    // (PLOT_DAMAGE_TO_WALKING_INTO / _ADJACENT 10 is the Zombie Defense game
    // mode's TypeProperties row — DLC/Portugal/Data/Portugal_Improvements_MODE.xml —
    // not the baseline ruleset's; the Great Wall damages nobody here.)
    // CIV6 (GreatWall_Gold at Masonry, GreatWall_Culture at Castles): per
    // adjacent SEGMENT, which is the row's own kind.
    adjacency: [
      { improvement: 'GREAT_WALL', per: 1, yields: { gold: 2 } },
      { improvement: 'GREAT_WALL', requiresCivic: 'CASTLES', per: 1, yields: { culture: 2 } },
    ],
    tourismFrom: 'culture',
    tourismTech: 'FLIGHT',
    description: '+4 defence and 2 turns of fortification to its occupant, 10 damage to an enemy entering or passing. +2 gold per adjacent segment, +2 culture per segment from Castles. Along the border only.',
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'PlunderAmount'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_GREAT_WALL', 'CivilizationType', { expect: 'CIVILIZATION_CHINA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_GREAT_WALL, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_GREAT_WALL', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'TerrainType')] },
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_GREAT_WALL, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'FeatureType')] },
      buildInLine: xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'BuildInLine', { expect: true }),
      buildOnFrontier: xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'BuildOnFrontier', { expect: true }),
      defenseCS: xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'DefenseModifier'),
      grantsFortification: xml('Improvements', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'GrantFortification'),
      disasterResistant: xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'DisasterResistant', { expect: true }),
      'adjacency.0.improvement': xml('Adjacency_YieldChanges', 'ID=GreatWall_Gold', 'AdjacentImprovement', { expect: 'IMPROVEMENT_GREAT_WALL' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=GreatWall_Gold', 'TilesRequired'),
      'adjacency.0.yields.gold': xml('Adjacency_YieldChanges', 'ID=GreatWall_Gold', 'YieldChange'),
      'adjacency.1.improvement': xml('Adjacency_YieldChanges', 'ID=GreatWall_Culture', 'AdjacentImprovement', { expect: 'IMPROVEMENT_GREAT_WALL' }),
      'adjacency.1.requiresCivic': xml('Adjacency_YieldChanges', 'ID=GreatWall_Culture', 'PrereqTech', { expect: 'TECH_CASTLES' }),
      'adjacency.1.per': xml('Adjacency_YieldChanges', 'ID=GreatWall_Culture', 'TilesRequired'),
      'adjacency.1.yields.culture': xml('Adjacency_YieldChanges', 'ID=GreatWall_Culture', 'YieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_GREAT_WALL', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'PlunderAmount'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_ICE_HOCKEY_RINK', 'CivilizationType', { expect: 'CIVILIZATION_CANADA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_ICE_HOCKEY_RINK, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_ICE_HOCKEY_RINK', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'TerrainType')] },
      onePerCity: xml('Improvements', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'OnePerCity', { expect: true }),
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'Appeal'),
      'adjacency.0.terrains': xml('Adjacency_YieldChanges', 'ID=Hockey_TundraAdjacency', 'AdjacentTerrain', { expect: 'TERRAIN_TUNDRA' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Hockey_TundraAdjacency', 'TilesRequired'),
      'adjacency.0.yields.culture': xml('Adjacency_YieldChanges', 'ID=Hockey_TundraAdjacency', 'YieldChange'),
      'researchYields.0.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK&YieldType=YIELD_FOOD&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'PrereqCivic', { expect: 'CIVIC_PROFESSIONAL_SPORTS' }),
      'researchYields.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK&YieldType=YIELD_FOOD&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'BonusYieldChange'),
      'researchYields.0.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK&YieldType=YIELD_PRODUCTION&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'BonusYieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_ICE_HOCKEY_RINK', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_KURGAN', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_KURGAN', 'PlunderAmount'),
      'yields.faith': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_KURGAN&YieldType=YIELD_FAITH', 'YieldChange'),
      'yields.gold': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_KURGAN&YieldType=YIELD_GOLD', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_KURGAN', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_KURGAN', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_KURGAN', 'CivilizationType', { expect: 'CIVILIZATION_SCYTHIA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_KURGAN, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_KURGAN', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_KURGAN', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_KURGAN', 'TerrainType')] },
      'adjacency.0.improvement': xml('Adjacency_YieldChanges', 'ID=Kurgan_Faith', 'AdjacentImprovement', { expect: 'IMPROVEMENT_PASTURE' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Kurgan_Faith', 'TilesRequired'),
      'adjacency.0.yields.faith': xml('Adjacency_YieldChanges', 'ID=Kurgan_Faith', 'YieldChange'),
      'adjacency.0.upgradeTech': xml('Adjacency_YieldChanges', 'ID=Kurgan_Faith_Stirrups', 'PrereqTech', { expect: 'TECH_STIRRUPS' }),
      'adjacency.0.upgradeYields.faith': xml('Adjacency_YieldChanges', 'ID=Kurgan_Faith_Stirrups', 'YieldChange'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_KURGAN', 'TourismSource', { expect: 'TOURISMSOURCE_FAITH' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_KURGAN', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
    healsAfterAction: true,
    noPillage: true,
    description: 'Built by the Toa on a hill, inside or outside your borders. +4 defence and 2 turns of fortification to its occupant, and a Maori unit on one heals even after moving or attacking.',
    src: {
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_MAORI_PA', 'CivilizationType', { expect: 'CIVILIZATION_MAORI' }),
      builtBy: xml('Improvement_ValidBuildUnits', 'ImprovementType=IMPROVEMENT_MAORI_PA&UnitType=UNIT_MAORI_TOA', 'UnitType', { expect: 'UNIT_MAORI_TOA' }),
      outsideTerritory: xml('Improvements', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'CanBuildOutsideTerritory', { expect: true }),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MAORI_PA', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'TerrainType')] },
      defenseCS: xml('Improvements', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'DefenseModifier'),
      grantsFortification: xml('Improvements', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'GrantFortification'),
      noPillage: xml('Improvements', 'ImprovementType=IMPROVEMENT_MAORI_PA', 'PlunderType', { expect: 'NO_PLUNDER' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'PlunderAmount'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_MEKEWAP&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_MEKEWAP', 'CivilizationType', { expect: 'CIVILIZATION_CREE' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_MEKEWAP, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MEKEWAP', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'TerrainType')] },
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'SameAdjacentValid', { expect: false }),
      requiresAdjacentResource: xml('Improvements', 'ImprovementType=IMPROVEMENT_MEKEWAP', 'RequiresAdjacentBonusOrLuxury', { expect: true }),
      'adjacency.0.bonusResource': xml('Adjacency_YieldChanges', 'ID=Mekewap_FirstBonusAdjacency', 'AdjacentResourceClass', { expect: 'RESOURCECLASS_BONUS' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Mekewap_FirstBonusAdjacency', 'TilesRequired'),
      'adjacency.0.yields.food': xml('Adjacency_YieldChanges', 'ID=Mekewap_FirstBonusAdjacency', 'YieldChange'),
      'adjacency.0.upgradeCivic': xml('Adjacency_YieldChanges', 'ID=Mekewap_SecondBonusAdjacency', 'PrereqCivic', { expect: 'CIVIC_CONSERVATION' }),
      'adjacency.0.upgradePer': xml('Adjacency_YieldChanges', 'ID=Mekewap_SecondBonusAdjacency', 'TilesRequired'),
      'adjacency.1.luxuryResource': xml('Adjacency_YieldChanges', 'ID=Mekewap_ThirdBonusAdjacency', 'AdjacentResourceClass', { expect: 'RESOURCECLASS_LUXURY' }),
      'adjacency.1.requiresCivic': xml('Adjacency_YieldChanges', 'ID=Mekewap_ThirdBonusAdjacency', 'PrereqTech', { expect: 'TECH_CARTOGRAPHY' }),
      'adjacency.1.per': xml('Adjacency_YieldChanges', 'ID=Mekewap_ThirdBonusAdjacency', 'TilesRequired'),
      'adjacency.1.yields.gold': xml('Adjacency_YieldChanges', 'ID=Mekewap_ThirdBonusAdjacency', 'YieldChange'),
      'researchYields.0.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MEKEWAP&YieldType=YIELD_PRODUCTION&PrereqCivic=CIVIC_CIVIL_SERVICE', 'PrereqCivic', { expect: 'CIVIC_CIVIL_SERVICE' }),
      'researchYields.0.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MEKEWAP&YieldType=YIELD_PRODUCTION&PrereqCivic=CIVIC_CIVIL_SERVICE', 'BonusYieldChange'),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_MISSION', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_MISSION', 'PlunderAmount'),
      'yields.faith': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_MISSION&YieldType=YIELD_FAITH', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MISSION', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MISSION', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_MISSION', 'CivilizationType', { expect: 'CIVILIZATION_SPAIN' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_MISSION, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MISSION', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MISSION', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MISSION', 'TerrainType')] },
      'adjacency.0.district': xml('Adjacency_YieldChanges', 'ID=Mission_Science_Campus', 'AdjacentDistrict', { expect: 'DISTRICT_CAMPUS' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Mission_Science_Campus', 'TilesRequired'),
      'adjacency.0.yields.science': xml('Adjacency_YieldChanges', 'ID=Mission_Science_Campus', 'YieldChange'),
      'adjacency.1.district': xml('Adjacency_YieldChanges', 'ID=Mission_Science_HolySite', 'AdjacentDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'adjacency.1.per': xml('Adjacency_YieldChanges', 'ID=Mission_Science_HolySite', 'TilesRequired'),
      'adjacency.1.yields.science': xml('Adjacency_YieldChanges', 'ID=Mission_Science_HolySite', 'YieldChange'),
      'researchYields.0.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MISSION&YieldType=YIELD_SCIENCE&PrereqCivic=CIVIC_CULTURAL_HERITAGE', 'PrereqCivic', { expect: 'CIVIC_CULTURAL_HERITAGE' }),
      'researchYields.0.yields.science': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MISSION&YieldType=YIELD_SCIENCE&PrereqCivic=CIVIC_CULTURAL_HERITAGE', 'BonusYieldChange'),
      'offCapitalContinentYields.faith': xml('ModifierArguments', 'ModifierId=MISSION_NEWCONTINENT_FAITH&Name=Amount', 'Value'),
      'offCapitalContinentYields.production': xml('ModifierArguments', 'ModifierId=MISSION_NEWCONTINENT_PRODUCTION&Name=Amount', 'Value'),
      'offCapitalContinentYields.food': xml('ModifierArguments', 'ModifierId=MISSION_NEWCONTINENT_FOOD&Name=Amount', 'Value'),
      loyaltyAdjacentOffContinent: xml('ModifierArguments', 'ModifierId=TRAIT_MISSION_IDENTITY_PER_TURN_MODIFIER&Name=Amount', 'Value'),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'PlunderAmount'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_OPEN_AIR_MUSEUM', 'CivilizationType', { expect: 'CIVILIZATION_SWEDEN' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_OPEN_AIR_MUSEUM, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_OPEN_AIR_MUSEUM', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'TerrainType')] },
      onePerCity: xml('Improvements', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'OnePerCity', { expect: true }),
      loyalty: xml('ModifierArguments', 'ModifierId=OPEN_AIR_MUSEUM_LOYALTY&Name=Amount', 'Value'),
      'terrainKindYields.yields.culture': xml('ModifierArguments', 'ModifierId=OPEN_AIR_MUSEUM_CULTURE_FOR_TERRAIN_CLASS_CITIES&Name=Amount', 'Value'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_OPEN_AIR_MUSEUM', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_POLDER&YieldType=YIELD_FOOD', 'YieldChange'),
      'yields.production': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_POLDER&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_POLDER', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_POLDER', 'CivilizationType', { expect: 'CIVILIZATION_NETHERLANDS' }),
      waterOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'Domain', { expect: 'DOMAIN_SEA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_POLDER, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_POLDER', 'TerrainType')] },
      adjacentLandMin: xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'ValidAdjacentTerrainAmount'),
      movementCost: xml('Improvements', 'ImprovementType=IMPROVEMENT_POLDER', 'MovementChange', { expect: 2, note: 'MovementChange is the surcharge; the catalog holds the whole cost (1 + 2)' }),
      'adjacency.0.sameImprovement': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Food_Early', 'AdjacentImprovement', { expect: 'IMPROVEMENT_POLDER' }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Food_Early', 'TilesRequired'),
      'adjacency.0.yields.food': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Food_Early', 'YieldChange'),
      'adjacency.0.upgradeTech': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Food_Late', 'PrereqTech', { expect: 'TECH_REPLACEABLE_PARTS' }),
      'adjacency.0.upgradeYields.food': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Food_Late', 'YieldChange'),
      'adjacency.0.upgradeYields.production': xml('Adjacency_YieldChanges', 'ID=Polder_Polder_Production', 'YieldChange'),
      'researchYields.0.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_POLDER&YieldType=YIELD_GOLD&PrereqCivic=CIVIC_CIVIL_ENGINEERING', 'PrereqCivic', { expect: 'CIVIC_CIVIL_ENGINEERING' }),
      'researchYields.0.yields.gold': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_POLDER&YieldType=YIELD_GOLD&PrereqCivic=CIVIC_CIVIL_ENGINEERING', 'BonusYieldChange'),
    },
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
    // CIV6 (STEPWELL_FARMADJACENCY_FOOD, STEPWELL_HOLYSITEADJACENCY_FAITH):
    // two SINGLE_PLOT modifiers over yes/no requirement sets — +1 Food while
    // any neighbour holds a Farm, +1 Faith while any holds a Holy Site
    adjacency: [
      { improvement: 'FARM', once: true, per: 1, yields: { food: 1 } },
      { district: 'HOLY_SITE', once: true, per: 1, yields: { faith: 1 } },
    ],
    description: '+1 food +1 housing on flat ground, never beside another Stepwell. +1 food beside a Farm, +1 faith beside a Holy Site. +1 faith from Feudalism, +1 more food from Professional Sports.',
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_STEPWELL', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_STEPWELL', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_STEPWELL&YieldType=YIELD_FOOD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_STEPWELL', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_STEPWELL', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_STEPWELL', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_STEPWELL', 'CivilizationType', { expect: 'CIVILIZATION_INDIA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_STEPWELL, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_STEPWELL', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_STEPWELL', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_STEPWELL', 'TerrainType')] },
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_STEPWELL', 'SameAdjacentValid', { expect: false }),
      'adjacency.0.improvement': xml('RequirementArguments', 'RequirementId=REQUIRES_PLOT_ADJACENT_TO_FARM&Name=ImprovementType', 'Value', { expect: 'IMPROVEMENT_FARM' }),
      'adjacency.0.yields.food': xml('ModifierArguments', 'ModifierId=STEPWELL_FARMADJACENCY_FOOD&Name=Amount', 'Value'),
      'adjacency.0.once': xml('Modifiers', 'ModifierId=STEPWELL_FARMADJACENCY_FOOD', 'SubjectRequirementSetId', { expect: 'PLOT_ADJACENT_TO_FARM_REQUIREMENTS' }),
      'adjacency.1.district': xml('RequirementArguments', 'RequirementId=REQUIRES_PLOT_ADJACENT_TO_HOLYSITE&Name=DistrictType', 'Value', { expect: 'DISTRICT_HOLY_SITE' }),
      'adjacency.1.yields.faith': xml('ModifierArguments', 'ModifierId=STEPWELL_HOLYSITEADJACENCY_FAITH&Name=Amount', 'Value'),
      'adjacency.1.once': xml('Modifiers', 'ModifierId=STEPWELL_HOLYSITEADJACENCY_FAITH', 'SubjectRequirementSetId', { expect: 'PLOT_ADJACENT_TO_HOLYSITE_REQUIREMENTS' }),
      'researchYields.0.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_STEPWELL&YieldType=YIELD_FAITH&PrereqCivic=CIVIC_FEUDALISM', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
      'researchYields.0.yields.faith': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_STEPWELL&YieldType=YIELD_FAITH&PrereqCivic=CIVIC_FEUDALISM', 'BonusYieldChange'),
      'researchYields.1.civic': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_STEPWELL&YieldType=YIELD_FOOD&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'PrereqCivic', { expect: 'CIVIC_PROFESSIONAL_SPORTS' }),
      'researchYields.1.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_STEPWELL&YieldType=YIELD_FOOD&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'BonusYieldChange'),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'PlunderAmount'),
      'yields.food': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_FISHERY&YieldType=YIELD_FOOD', 'YieldChange'),
      housing: { derived: 'Housing / TilesRequired — the install writes the CLUSTER total', inputs: [xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'Housing'), xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'TilesRequired')] },
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_FISHERY', 'ResourceType')] },
      waterOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'Domain', { expect: 'DOMAIN_SEA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_FISHERY, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_FISHERY', 'TerrainType')] },
      'governorYields.yields.production': xml('ModifierArguments', 'ModifierId=FISHERY_GOVERNOR_PRODUCTION&Name=Amount', 'Value'),
      'adjacency.0.seaResource': xml('Adjacency_YieldChanges', 'ID=Fishery_SeaResourceAdjacency', 'AdjacentSeaResource', { expect: true }),
      'adjacency.0.per': xml('Adjacency_YieldChanges', 'ID=Fishery_SeaResourceAdjacency', 'TilesRequired'),
      'adjacency.0.yields.food': xml('Adjacency_YieldChanges', 'ID=Fishery_SeaResourceAdjacency', 'YieldChange'),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'PlunderAmount'),
      'yields.culture': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_CITY_PARK&YieldType=YIELD_CULTURE', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'ResourceType')] },
      groundOnly: xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'Domain', { expect: 'DOMAIN_LAND' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_CITY_PARK, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'TerrainType')] },
      appealAdjacent: xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'Appeal'),
      noAdjacentSame: xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'SameAdjacentValid', { expect: false }),
      'governorYields.yields.culture': xml('ModifierArguments', 'ModifierId=CITY_PARK_GOVERNOR_CULTURE&Name=Amount', 'Value'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
      amenityAdjacentWater: xml('ModifierArguments', 'ModifierId=CITY_PARK_WATER_AMENITY&Name=Amount', 'Value'),
    },
  },
  // CIV6 (Qhapaq Ñan, Expansion2_Improvements_Major.xml): Pachacuti's own
  // Mountain Tunnel — "Unlocks the Builder ability to construct a Qhapaq Ñan,
  // unique to Pachacuti. Acts as a movement portal on a mountain range,
  // allowing units to move into it and exit from another portal at the cost
  // of 2 Movement. ... Can only be built on an adjacent Mountain tile. Cannot
  // be pillaged or removed." TraitType TRAIT_LEADER_PACHACUTI_IMPROVEMENT_MOUNTAIN_ROAD,
  // PrereqCivic CIVIC_FOREIGN_TRADE, `Improvement_ValidBuildUnits` UNIT_BUILDER,
  // the five mountain terrains, CanBuildOutsideTerritory, PLUNDER_NONE, and
  // the Tunnel's own MOUNTAIN_PORTAL modifier. No yield row.
  MOUNTAIN_ROAD: {
    id: 'MOUNTAIN_ROAD',
    name: 'Qhapaq Ñan',
    code: 'Qn',
    yields: {},
    housing: 0,
    resourceOnly: false,
    uniqueLeader: 'PACHACUTI',
    outsideTerritory: true,
    elevations: ['MOUNTAIN'],
    noPillage: true,
    disasterResistant: true,
    portal: true,
    adjacentPlot: true,
    description: 'Pachacuti\'s Builders only, on a mountain, built from an adjacent tile. A movement portal to the next portal on its range, at 2 Movement. Cannot be pillaged or removed.',
    src: {
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'ResourceType')] },
      uniqueLeader: xml('LeaderTraits', 'LeaderType=LEADER_PACHACUTI&TraitType=TRAIT_LEADER_PACHACUTI_IMPROVEMENT_MOUNTAIN_ROAD', 'LeaderType', { expect: 'LEADER_PACHACUTI' }),
      outsideTerritory: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'CanBuildOutsideTerritory', { expect: true }),
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_MOUNTAIN_ROAD', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'TerrainType')] },
      noPillage: xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'PlunderType', { expect: 'PLUNDER_NONE' }),
      disasterResistant: xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'DisasterResistant', { expect: true }),
      portal: xml('ImprovementModifiers', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD&ModifierId=MOUNTAIN_PORTAL', 'ModifierId', { expect: 'MOUNTAIN_PORTAL' }),
      adjacentPlot: xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_MOUNTAIN_ROAD', 'BuildOnAdjacentPlot', { expect: true }),
    },
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
    src: {
      'plunder.kind': xml('Improvements', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Improvements', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'PlunderAmount'),
      'yields.science': xml('Improvement_YieldChanges', 'ImprovementType=IMPROVEMENT_ZIGGURAT&YieldType=YIELD_SCIENCE', 'YieldChange'),
      housing: xml('Improvements', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'Housing'),
      resourceOnly: { derived: 'true where the install writes Improvement_ValidResources rows for the row', inputs: [xml('Improvement_ValidResources', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'ResourceType')] },
      uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_IMPROVEMENT_ZIGGURAT', 'CivilizationType', { expect: 'CIVILIZATION_SUMERIA' }),
      terrains: { derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_ZIGGURAT, as engine terrain ids', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'TerrainType')] },
      elevations: { derived: 'the HILLS / MOUNTAIN half of the Improvement_ValidTerrains rows of IMPROVEMENT_ZIGGURAT', inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'TerrainType')] },
      features: { derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_ZIGGURAT, as engine feature ids', inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'FeatureType')] },
      'riverYields.culture': xml('ModifierArguments', 'ModifierId=ZIGGURAT_RIVERADJACENCY_CULTURE&Name=Amount', 'Value'),
      tourismFrom: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'TourismSource', { expect: 'TOURISMSOURCE_CULTURE' }),
      tourismTech: xml('Improvement_Tourism', 'ImprovementType=IMPROVEMENT_ZIGGURAT', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
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
