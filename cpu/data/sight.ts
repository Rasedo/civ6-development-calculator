/**
 * HOW SIGHT IS SPENT — measured in the live game (ask 11;
 * `tools/civ6lab/sight_find.lua` + `sight_read.lua`, 17 geometries): it is
 * OCCLUSION BY ELEVATION, not a budget. A tile on the ray from the observer
 * hides everything behind it iff its SightThroughModifier sum — its
 * elevation's plus its feature's — EXCEEDS the observer's own SightModifier;
 * the range is the unit's BaseSightRange alone (a hill adds height, never
 * range); Sentry's `CanSee` means the FEATURE half of the through-cost is 0.
 *
 * CIV6 (Terrains.xml, every layer): every *_HILLS row carries
 * `SightModifier="1" SightThroughModifier="1"`, every *_MOUNTAIN row 2 and 2 —
 * the height a tile stands at is the height it puts in the way, so one table
 * serves both. CIV6 (Features.xml, all layers): FEATURE_FOREST 1 (this
 * engine's WOODS), FEATURE_JUNGLE 1 (RAINFOREST); of the natural wonders this
 * engine fields, ULURU 1, TORRES_DEL_PAINE 2, KILIMANJARO 2, YOSEMITE 2,
 * EVEREST 2 — Crater Lake, the Dead Sea, Galapagos, the Barrier Reef, the
 * Pantanal, Dover and the Eye of the Sahara carry no column at all.
 */
import { srcConst, xml } from './provenance';

const terr = (t: string) => xml('Terrains', `TerrainType=${t}`, 'SightThroughModifier');
const feat = (f: string) => xml('Features', `FeatureType=${f}`, 'SightThroughModifier');

export const ELEVATION_SIGHT: Readonly<Record<string, number>> = {
  HILLS: srcConst('improvements.sightHills', 1, terr('TERRAIN_GRASS_HILLS')),
  MOUNTAIN: srcConst('improvements.sightMountain', 2, terr('TERRAIN_GRASS_MOUNTAIN')),
};

export const FEATURE_SIGHT_THROUGH: Readonly<Record<string, number>> = {
  WOODS: srcConst('improvements.featSightThrough.WOODS', 1, feat('FEATURE_FOREST')),
  RAINFOREST: srcConst('improvements.featSightThrough.RAINFOREST', 1, feat('FEATURE_JUNGLE')),
  ULURU: srcConst('improvements.featSightThrough.ULURU', 1, feat('FEATURE_ULURU')),
  TORRES_DEL_PAINE: srcConst('improvements.featSightThrough.TORRES_DEL_PAINE', 2,
    feat('FEATURE_TORRES_DEL_PAINE')),
  MOUNT_KILIMANJARO: srcConst('improvements.featSightThrough.MOUNT_KILIMANJARO', 2,
    feat('FEATURE_KILIMANJARO')),
  YOSEMITE: srcConst('improvements.featSightThrough.YOSEMITE', 2, feat('FEATURE_YOSEMITE')),
  MOUNT_EVEREST: srcConst('improvements.featSightThrough.MOUNT_EVEREST', 2, feat('FEATURE_EVEREST')),
  // the pack's fire features (GranColombia_Maya_Expansion2.xml) keep the Woods' 1
  BURNING_WOODS: srcConst('improvements.featSightThrough.BURNING_WOODS', 1, feat('FEATURE_BURNING_FOREST')),
  BURNT_WOODS: srcConst('improvements.featSightThrough.BURNT_WOODS', 1, feat('FEATURE_BURNT_FOREST')),
  BURNING_RAINFOREST: srcConst('improvements.featSightThrough.BURNING_RAINFOREST', 1, feat('FEATURE_BURNING_JUNGLE')),
  BURNT_RAINFOREST: srcConst('improvements.featSightThrough.BURNT_RAINFOREST', 1, feat('FEATURE_BURNT_JUNGLE')),
};

/** the farthest any chassis looks — the reach of the static line table both
 *  engines precompute (the Mountie's 4 plus a Spyglass is 5). */
export const SIGHT_MAX = srcConst('improvements.sightMax', 5, {
  stylized: 'the precomputed line table\'s reach, sized to the deepest chassis this roster '
    + 'fields (the Mountie\'s BaseSightRange 4 plus a Spyglass); no install row states a ceiling',
});
