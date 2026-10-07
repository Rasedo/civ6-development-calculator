/**
 * Tile features. Yield modifiers follow Civ 6 with Gathering Storm:
 * woods +1P, rainforest +1F, marsh +1F, desert floodplains +2F, grassland and
 * plains floodplains nothing, oasis +3F+1G, reef +1F+1P, ice impassable.
 */

import type { TerrainId, YieldKey, Yields } from './types';

interface FeatureDef {
  id: string;
  name: string;
  yields: Partial<Yields>;
  terrains: TerrainId[];
  allowHills: boolean;
  impassable?: boolean;
  removable: boolean;
  freshWater?: boolean;
  /** CIV6 (Features.xml `Feature_Removes`): what removing it pays, per yield,
   *  before the progress escalation (`lumpValue`) */
  chop?: Partial<Record<YieldKey, number>>;
  /** a NATURAL WONDER row — one roster with every other feature. Its
   *  `yields` are the tile's WHOLE yields (no terrain underneath),
   *  `adjacentYields` pay every neighbouring tile, and a
   *  `doublesAdjacentTerrain` row doubles the neighbour's terrain yields
   *  instead. Spawn rules, size and colour stay in `WONDERS`. */
  naturalWonder?: boolean;
  adjacentYields?: Partial<Yields>;
  doublesAdjacentTerrain?: boolean;
  /** CIV6 (Expansion2_Features.xml `Feature_Floodplains`, tag
   *  CLASS_FLOODPLAINS): one of the three floodplains — the class a flood
   *  strikes and most floodplains rules name (`isFloodplains`). */
  floodplains?: boolean;
  /** Gold every INTERNATIONAL trade route out of a city holding the feature
   *  pays (MODIFIER_ALL_CITIES_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL on
   *  a CITY_HAS_<feature> subject), once however many of its plots the city
   *  holds. */
  cityIntlRouteGold?: number;
  /** Amenities a city holding the feature earns, once however many of its
   *  plots the city holds (MODIFIER_ALL_CITIES_ADJUST_NATURAL_WONDER_AMENITY
   *  on a CITY_HAS_<feature> subject; the game's GetAmenitiesFromNaturalWonders) */
  cityAmenities?: number;
}

/** The FLOODPLAINS CLASS: the desert, grassland and plains floodplains. A rule
 *  the install writes against `FEATURE_FLOODPLAINS` alone reads the desert
 *  row by name instead. */
export function isFloodplains(feature: string | null | undefined): boolean {
  return !!feature && FEATURES[feature]?.floodplains === true;
}

/** Features a builder can CLEAR — the Deforestation Treaty's target space,
 *  and the order its wire target index addresses. */
export function clearableFeatures(): string[] {
  return Object.values(FEATURES).filter((f) => f.removable && f.chop).map((f) => f.id);
}

export const FEATURES: Record<string, FeatureDef> = {
  WOODS: {
    id: 'WOODS',
    name: 'Woods',
    yields: { production: 1 },
    terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'],
    allowHills: true,
    removable: true,
    chop: { production: 20 },
  },
  RAINFOREST: {
    id: 'RAINFOREST',
    name: 'Rainforest',
    yields: { food: 1 },
    terrains: ['PLAINS'],
    allowHills: true,
    removable: true,
    chop: { food: 10, production: 10 },
  },
  MARSH: {
    id: 'MARSH',
    name: 'Marsh',
    yields: { food: 1 },
    terrains: ['GRASSLAND'],
    allowHills: false,
    removable: true,
    chop: { food: 20 },
  },
  // CIV6 (Features.xml FEATURE_FLOODPLAINS, Food 3, which
  // Expansion2_Features.xml's Feature_YieldChanges update sets to 2): the
  // DESERT floodplains. Gathering Storm's grassland and plains floodplains are
  // features of their own, appended below.
  FLOODPLAINS: {
    id: 'FLOODPLAINS',
    name: 'Floodplains',
    yields: { food: 2 },
    terrains: ['DESERT'],
    allowHills: false,
    removable: false,
    floodplains: true,
  },
  OASIS: {
    id: 'OASIS',
    name: 'Oasis',
    yields: { food: 3, gold: 1 },
    terrains: ['DESERT'],
    allowHills: false,
    removable: false,
    freshWater: true,
  },
  REEF: {
    id: 'REEF',
    name: 'Reef',
    yields: { food: 1, production: 1 },
    terrains: ['COAST'],
    allowHills: false,
    removable: false,
  },
  ICE: {
    id: 'ICE',
    name: 'Ice',
    yields: {},
    terrains: ['COAST', 'OCEAN'],
    allowHills: false,
    impassable: true,
    removable: false,
  },
  // APPENDED LAST — roster order IS the wire's feature index.
  // CIV6 (Geothermal Fissure): "+1 Science", and the ground a GEOTHERMAL
  // PLANT must stand on. Unremovable — no builder clears one.
  GEOTHERMAL_FISSURE: {
    id: 'GEOTHERMAL_FISSURE',
    name: 'Geothermal Fissure',
    yields: { science: 1 },
    terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'],
    allowHills: true,
    removable: false,
  },
  // CIV6 (Volcanic Soil): "This land adjacent to a volcano has suffered from
  // a previous eruption ... Can receive additional yields from environmental
  // effects" — the `fertility` channel, which the eruption lays down. The row
  // carries the NAME, which Fire Goddess pays Faith on; an eruption paints it
  // on its ring (`paintVolcanicSoil`).
  VOLCANIC_SOIL: {
    id: 'VOLCANIC_SOIL',
    name: 'Volcanic Soil',
    yields: {},
    terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'],
    allowHills: true,
    removable: false,
  },
};

// The NATURAL WONDERS, appended LAST — this record's order is the exported
// feature index, so anything but an append renumbers every other row.
// Real Civ 6 Crater Lake yields 5 Faith and 1 Science on its tile
// (Civilization wiki, "Crater Lake (Civ6)"); Dead Sea +2 culture / +2 faith.
const NW = { terrains: [] as TerrainId[], allowHills: false, removable: false, naturalWonder: true };
Object.assign(FEATURES, {
  CRATER_LAKE: { id: 'CRATER_LAKE', name: 'Crater Lake', yields: { science: 1, faith: 5 }, ...NW, freshWater: true },
  DEAD_SEA: { id: 'DEAD_SEA', name: 'Dead Sea', yields: { faith: 2, culture: 2 }, ...NW },
  GALAPAGOS: { id: 'GALAPAGOS', name: 'Galápagos Islands', yields: {}, impassable: true, adjacentYields: { science: 2 }, ...NW },
  // CIV6 (Features.xml Feature_YieldChanges): FEATURE_BARRIER_REEF Food 3, Science 2
  GREAT_BARRIER_REEF: { id: 'GREAT_BARRIER_REEF', name: 'Great Barrier Reef', yields: { food: 3, science: 2 }, ...NW },
  PANTANAL: { id: 'PANTANAL', name: 'Pantanal', yields: { food: 2, culture: 2 }, ...NW },
  ULURU: { id: 'ULURU', name: 'Uluru', yields: {}, impassable: true, adjacentYields: { culture: 2, faith: 2 }, ...NW },
  TORRES_DEL_PAINE: { id: 'TORRES_DEL_PAINE', name: 'Torres del Paine', yields: {}, impassable: true, doublesAdjacentTerrain: true, ...NW },
  // CIV6 (Features.xml Feature_AdjacentYields): Kilimanjaro Food 2, Everest Faith 1
  MOUNT_KILIMANJARO: { id: 'MOUNT_KILIMANJARO', name: 'Mount Kilimanjaro', yields: {}, impassable: true, adjacentYields: { food: 2 }, ...NW },
  YOSEMITE: { id: 'YOSEMITE', name: 'Yosemite', yields: {}, impassable: true, adjacentYields: { gold: 1, food: 1, science: 1 }, ...NW },
  // CIV6 (Features.xml): the Cliffs are passable and pay their own plots Food 2,
  // Gold 3, Culture 3 (Feature_YieldChanges), nothing to their neighbours
  // (runs/h1_duelw1117 plots 581 / 625, h1_duelw1118 569 / 613: 2F 3G 3C)
  CLIFFS_OF_DOVER: { id: 'CLIFFS_OF_DOVER', name: 'Cliffs of Dover', yields: { food: 2, gold: 3, culture: 3 }, ...NW },
  MOUNT_EVEREST: { id: 'MOUNT_EVEREST', name: 'Mount Everest', yields: {}, impassable: true, adjacentYields: { faith: 1 }, ...NW },
  // CIV6 (Expansion1_Features_Major.xml, Expansion1_Expansion2.xml): Production 2, Science 1
  EYE_OF_THE_SAHARA: { id: 'EYE_OF_THE_SAHARA', name: 'Eye of the Sahara', yields: { production: 2, science: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// THE FIRE'S FEATURES, appended after the wonders. CIV6
// (GranColombia_Maya_Expansion2.xml): a Woods or Rainforest a fire burns,
// then leaves burnt until it regrows. No Feature_YieldChanges row — the plot
// yields its terrain alone — and not Removable; `Feature_ValidTerrains` gives
// the burning and burnt Woods Grassland, Plains and Tundra and the Rainforest's
// Grassland and Plains, flat or hills. Nothing lays one at map generation.
Object.assign(FEATURES, {
  BURNING_WOODS: { id: 'BURNING_WOODS', name: 'Burning Woods', yields: {}, terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], allowHills: true, removable: false },
  BURNT_WOODS: { id: 'BURNT_WOODS', name: 'Burnt Woods', yields: {}, terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], allowHills: true, removable: false },
  BURNING_RAINFOREST: { id: 'BURNING_RAINFOREST', name: 'Burning Rainforest', yields: {}, terrains: ['GRASSLAND', 'PLAINS'], allowHills: true, removable: false },
  BURNT_RAINFOREST: { id: 'BURNT_RAINFOREST', name: 'Burnt Rainforest', yields: {}, terrains: ['GRASSLAND', 'PLAINS'], allowHills: true, removable: false },
} satisfies Record<string, FeatureDef>);

// THE GATHERING STORM VOLCANO WONDERS, appended after the fires. CIV6
// (`VikingsLandmarks_Features.xml` with its `_Expansion2.xml` update, and
// `Expansion2_Features.xml`): both Impassable, Appeal 2 like every wonder
// here, no Feature_YieldChanges row. Eyjafjallajokull's Feature_AdjacentYields
// are Food 1 (the Expansion2 update of the pack's 2) and Culture 1; Vesuvius's
// Production 1.
Object.assign(FEATURES, {
  EYJAFJALLAJOKULL: { id: 'EYJAFJALLAJOKULL', name: 'Eyjafjallajökull', yields: {}, impassable: true, adjacentYields: { food: 1, culture: 1 }, ...NW },
  VESUVIUS: { id: 'VESUVIUS', name: 'Vesuvius', yields: {}, impassable: true, adjacentYields: { production: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// GATHERING STORM'S OTHER TWO FLOODPLAINS, appended after the volcano wonders.
// CIV6 (Expansion2_Features.xml): FEATURE_FLOODPLAINS_GRASSLAND on Grassland
// and FEATURE_FLOODPLAINS_PLAINS on Plains (`Feature_ValidTerrains`), no
// Feature_YieldChanges row — the plot yields its terrain alone (the game's
// plots read 2F on grassland and 1F 1P on plains, runs/h1_duelw1103 / 1104) —
// RequiresRiver, DefenseModifier -2 and Appeal -1 as the desert row, and both
// in `Feature_Floodplains`.
Object.assign(FEATURES, {
  FLOODPLAINS_GRASSLAND: { id: 'FLOODPLAINS_GRASSLAND', name: 'Floodplains (Grassland)', yields: {}, terrains: ['GRASSLAND'], allowHills: false, removable: false, floodplains: true },
  FLOODPLAINS_PLAINS: { id: 'FLOODPLAINS_PLAINS', name: 'Floodplains (Plains)', yields: {}, terrains: ['PLAINS'], allowHills: false, removable: false, floodplains: true },
} satisfies Record<string, FeatureDef>);

// PAITITI, appended after the floodplains. CIV6 (GranColombia_Maya_Features.xml):
// a three-plot Impassable natural wonder, Appeal 2, paying every neighbouring
// plot 3 Gold and 2 Culture (Feature_AdjacentYields), and PAITITI_GOLD_FROM_INTERNATIONAL_
// TRADE_ROUTES: +4 Gold on every international route out of a city holding
// it. The engines' map generator lays none; an imported world carries it.
Object.assign(FEATURES, {
  PAITITI: { id: 'PAITITI', name: 'Paititi', yields: {}, impassable: true, adjacentYields: { gold: 3, culture: 2 }, cityIntlRouteGold: 4, ...NW },
} satisfies Record<string, FeatureDef>);

// GOBUSTAN and the BERMUDA TRIANGLE, appended after Paititi. Neither is
// Impassable, so a city works their plots. CIV6 (Expansion2_Features.xml):
// FEATURE_GOBUSTAN, three plots of Plains, Feature_YieldChanges Culture 3 and
// Production 1 (the plot's whole yields — the game's plots read 1P 3C,
// runs/h1_duelw1105), Appeal 2, MovementChange 1 (`terrainMp`),
// DefenseModifier 3 (`featureDefense`), SightThroughModifier 1. CIV6
// (GranColombia_Maya_Features.xml): FEATURE_BERMUDA_TRIANGLE, three plots of
// Ocean, no Feature_YieldChanges row, Feature_AdjacentYields Science 5 — its
// own plots, each beside the other two, read 10 Science (runs/h1_duelw1105).
// Its MODIFIER_UNIT_TELEPORT and ABILITY_MYSTERIOUS_CURRENTS are not
// modelled. The engines' map generator lays neither; an imported world
// carries them.
Object.assign(FEATURES, {
  GOBUSTAN: { id: 'GOBUSTAN', name: 'Gobustan', yields: { culture: 3, production: 1 }, ...NW },
  BERMUDA_TRIANGLE: { id: 'BERMUDA_TRIANGLE', name: 'Bermuda Triangle', yields: {}, adjacentYields: { science: 5 }, ...NW },
} satisfies Record<string, FeatureDef>);

// SIX MORE WONDERS, appended after the Bermuda Triangle; the engines' map
// generator lays none, an imported world carries them. CIV6
// (Feature_AdjacentYields, every neighbouring plot paid once per wonder plot
// it touches): PIOPIOTAHI (three plots) Gold 1 Culture 1, TSINGY Culture 1
// Science 1, DEVILSTOWER Faith 1 Production 1, GIANTS_CAUSEWAY (two plots)
// Culture 1 — all four Impassable (runs/h1_duelw1106 Piopiotahi, 1108 Tsingy,
// 1104 Devil's Tower, 1107 the Causeway: each neighbour reads the rows).
// LAKE_RETBA (two plots, Lake, passable): Feature_YieldChanges Production 1,
// Gold 2, Culture 2, its plots' whole yields (runs/h1_duelw1107 read
// 0F 1P 2G 2C). PAMUKKALE (two plots, Impassable) pays no plot: its
// `Adjacency_YieldChanges` rows go to the districts beside it (`PAMUKKALE`
// in `AdjacencySource`); a city holding it earns 1 Amenity (PAMUKKALE_AMENITY,
// Expansion2_Features.xml: runs/h1_duelw1106 Taiyuan and Jerusalem, 1117
// Taiyuan with one plot or both read GetAmenitiesFromNaturalWonders 1).
// Giant's Causeway's ABILITY_SPEAR_OF_FIONN and Pamukkale's second Amenity
// beside an Entertainment Complex are not modelled.
Object.assign(FEATURES, {
  PIOPIOTAHI: { id: 'PIOPIOTAHI', name: 'Piopiotahi', yields: {}, impassable: true, adjacentYields: { gold: 1, culture: 1 }, ...NW },
  TSINGY: { id: 'TSINGY', name: 'Tsingy de Bemaraha', yields: {}, impassable: true, adjacentYields: { culture: 1, science: 1 }, ...NW },
  DEVILS_TOWER: { id: 'DEVILS_TOWER', name: "Devil's Tower", yields: {}, impassable: true, adjacentYields: { faith: 1, production: 1 }, ...NW },
  GIANTS_CAUSEWAY: { id: 'GIANTS_CAUSEWAY', name: "Giant's Causeway", yields: {}, impassable: true, adjacentYields: { culture: 1 }, ...NW },
  LAKE_RETBA: { id: 'LAKE_RETBA', name: 'Lake Retba', yields: { production: 1, gold: 2, culture: 2 }, ...NW },
  PAMUKKALE: { id: 'PAMUKKALE', name: 'Pamukkale', yields: {}, impassable: true, cityAmenities: 1, ...NW, freshWater: true },
} satisfies Record<string, FeatureDef>);

// THREE MORE WONDERS, appended after Pamukkale; the engines' map generator
// lays none, an imported world carries them. CIV6 (Expansion1_Features_Major.xml):
// DELICATE_ARCH (one plot of Desert, Impassable, SightThroughModifier 1),
// Feature_AdjacentYields Faith 2 Gold 1; UBSUNUR_HOLLOW (four plots of
// Tundra, passable, MovementChange 1, DefenseModifier -2),
// Feature_YieldChanges Food 1 Production 1 Faith 2. CIV6
// (Indonesia_Khmer_GameplayData.xml): HA_LONG_BAY (two plots of Coast,
// passable, DefenseModifier 15), Feature_YieldChanges Food 3 Production 1
// Culture 1. A wonder's own Feature_YieldChanges are its plots' whole yields.
Object.assign(FEATURES, {
  DELICATE_ARCH: { id: 'DELICATE_ARCH', name: 'Delicate Arch', yields: {}, impassable: true, adjacentYields: { faith: 2, gold: 1 }, ...NW },
  UBSUNUR_HOLLOW: { id: 'UBSUNUR_HOLLOW', name: 'Ubsunur Hollow', yields: { food: 1, production: 1, faith: 2 }, ...NW },
  HA_LONG_BAY: { id: 'HA_LONG_BAY', name: 'Ha Long Bay', yields: { food: 3, production: 1, culture: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// THE WHITE DESERT, appended after Ha Long Bay; the engines' map generator
// lays none, an imported world carries it. CIV6 (Expansion2_Features.xml):
// four plots of Desert, flat, hills or mountain, passable, no
// SightThroughModifier; Feature_YieldChanges Culture 1 Gold 4 Science 1, its
// plots' whole yields (runs/h1_duelw1119).
Object.assign(FEATURES, {
  WHITE_DESERT: { id: 'WHITE_DESERT', name: 'White Desert', yields: { culture: 1, gold: 4, science: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// THE MATTERHORN, appended after the White Desert; the engines' map
// generator lays none, an imported world carries it. CIV6
// (Expansion1_Features_Major.xml): one plot, Impassable, Appeal 2,
// SightThroughModifier 2, no Feature_YieldChanges row; Feature_AdjacentYields
// Culture 1 to every neighbouring plot (runs/h1_duelw1124: the city beside
// it reads the Culture). Its MATTERHORN_ADJACENT_UNITS_GRANT_ABILITY (Alpine
// Training) is not modelled.
Object.assign(FEATURES, {
  MATTERHORN: { id: 'MATTERHORN', name: 'Matterhorn', yields: {}, impassable: true, adjacentYields: { culture: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// MOUNT RORAIMA, appended after the Matterhorn; the engines' map generator
// lays none, an imported world carries it. CIV6 (Expansion1_Features_Major.xml):
// four plots, Impassable, Appeal 2, SightThroughModifier 2, no
// Feature_YieldChanges row; Feature_AdjacentYields Faith 1 Science 1 to
// every neighbouring plot (runs/h1_duelw1128).
Object.assign(FEATURES, {
  RORAIMA: { id: 'RORAIMA', name: 'Mount Roraima', yields: {}, impassable: true, adjacentYields: { faith: 1, science: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);

// IK KIL, appended after the Matterhorn; the engines' map generator lays
// none, an imported world carries it. CIV6 (Expansion2_Features.xml): one
// plot of Grassland or Plains, flat or hills, Impassable, Appeal 2,
// AddsFreshWater, no Feature_YieldChanges or Feature_AdjacentYields row
// (runs/h1_duelw1126 plot 498: no camp may stand on it). Its
// IKKIL_PRODUCTION_WONDER / IKKIL_PRODUCTION_DISTRICT (+50% Production toward
// a wonder or a district beside it, in every city) are not modelled.
Object.assign(FEATURES, {
  IKKIL: { id: 'IKKIL', name: 'Ik Kil', yields: {}, impassable: true, ...NW, freshWater: true },
} satisfies Record<string, FeatureDef>);
