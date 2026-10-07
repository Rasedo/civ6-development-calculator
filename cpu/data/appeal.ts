/**
 * THE APPEAL TERMS a plot lends each neighbour, as the install's columns
 * carry them: `Features.Appeal`, `Terrains.Appeal` (the mountains and the
 * coast, a lake included), and the feature an owner's civic adds
 * (`Features.AddCivic`). Districts and improvements carry their own column on
 * their rows (`DistrictDef.appealAdjacent`, `ImprovementDef.appealAdjacent`).
 */
import { srcConst, xml } from './provenance';

const feature = (id: string, installId: string, value: number): [string, number] =>
  [id, srcConst(`appeal.feature.${id}`, value, xml('Features', `FeatureType=FEATURE_${installId}`, 'Appeal'))];

/** `Features.Appeal` by engine feature id; a feature not listed lends 0. */
export const FEATURE_APPEAL: Readonly<Record<string, number>> = Object.fromEntries([
  feature('WOODS', 'FOREST', 1),
  feature('RAINFOREST', 'JUNGLE', -1),
  feature('MARSH', 'MARSH', -1),
  feature('FLOODPLAINS', 'FLOODPLAINS', -1),
  feature('FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_GRASSLAND', -1),
  feature('FLOODPLAINS_PLAINS', 'FLOODPLAINS_PLAINS', -1),
  feature('OASIS', 'OASIS', 1),
  feature('BURNING_WOODS', 'BURNING_FOREST', -1),
  feature('BURNT_WOODS', 'BURNT_FOREST', -1),
  feature('BURNING_RAINFOREST', 'BURNING_JUNGLE', -1),
  feature('BURNT_RAINFOREST', 'BURNT_JUNGLE', -1),
  feature('CRATER_LAKE', 'CRATER_LAKE', 2),
  feature('DEAD_SEA', 'DEAD_SEA', 2),
  feature('GALAPAGOS', 'GALAPAGOS', 2),
  feature('GREAT_BARRIER_REEF', 'BARRIER_REEF', 2),
  feature('PANTANAL', 'PANTANAL', 2),
  feature('ULURU', 'ULURU', 4),
  feature('TORRES_DEL_PAINE', 'TORRES_DEL_PAINE', 2),
  feature('MOUNT_KILIMANJARO', 'KILIMANJARO', 2),
  feature('YOSEMITE', 'YOSEMITE', 2),
  feature('CLIFFS_OF_DOVER', 'CLIFFS_DOVER', 4),
  feature('MOUNT_EVEREST', 'EVEREST', 2),
  feature('EYE_OF_THE_SAHARA', 'EYE_OF_THE_SAHARA', 2),
  feature('EYJAFJALLAJOKULL', 'EYJAFJALLAJOKULL', 2),
  feature('VESUVIUS', 'VESUVIUS', 2),
  feature('PAITITI', 'PAITITI', 2),
  feature('GOBUSTAN', 'GOBUSTAN', 2),
  feature('BERMUDA_TRIANGLE', 'BERMUDA_TRIANGLE', 2),
  feature('PIOPIOTAHI', 'PIOPIOTAHI', 2),
  feature('TSINGY', 'TSINGY', 2),
  feature('DEVILS_TOWER', 'DEVILSTOWER', 2),
  feature('WHITE_DESERT', 'WHITEDESERT', 2),
  feature('MATTERHORN', 'MATTERHORN', 2),
  feature('RORAIMA', 'RORAIMA', 2),
  feature('GIANTS_CAUSEWAY', 'GIANTS_CAUSEWAY', 2),
  feature('LAKE_RETBA', 'LAKE_RETBA', 2),
  feature('PAMUKKALE', 'PAMUKKALE', 2),
  feature('DELICATE_ARCH', 'DELICATE_ARCH', 2),
  feature('UBSUNUR_HOLLOW', 'UBSUNUR_HOLLOW', 2),
  feature('HA_LONG_BAY', 'HA_LONG_BAY', 2),
]);

/** `Terrains.Appeal` of a mountain (every TERRAIN_*_MOUNTAIN row) and of the
 *  coast — the game's lakes are coast plots. */
export const MOUNTAIN_APPEAL = srcConst('appeal.terrain.mountain', 1,
  xml('Terrains', 'TerrainType=TERRAIN_GRASS_MOUNTAIN', 'Appeal'));
export const COAST_APPEAL = srcConst('appeal.terrain.coast', 1, xml('Terrains', 'TerrainType=TERRAIN_COAST', 'Appeal'));

/** `Districts.Appeal` of DISTRICT_WONDER — what a completed wonder lends. */
export const WONDER_APPEAL = srcConst('appeal.wonder', 1, xml('Districts', 'DistrictType=DISTRICT_WONDER', 'Appeal'));

/** `Features.AddCivic`: the civic that lets a seat add the feature. CIV6
 *  (Rules_Appeal 0x513d70): a plot under such a feature whose owner holds the
 *  civic scores +1 of its own. */
export const FEATURE_ADD_CIVIC: Readonly<Record<string, string>> = {
  WOODS: srcConst('appeal.addCivic.WOODS', 'CONSERVATION',
    xml('Features', 'FeatureType=FEATURE_FOREST', 'AddCivic', { expect: 'CIVIC_CONSERVATION' })),
};
