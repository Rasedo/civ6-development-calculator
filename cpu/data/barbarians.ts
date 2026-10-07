/**
 * THE BARBARIANS' TABLES (Barbarians.xml, GlobalParameters.xml,
 * Improvements.xml, TypeTags) as the DLL's barbarian manager reads them
 * (`cpu/core/barbarians.ts`; tools/civ6lab/dll_readings.md "H-1: the
 * barbarians' turn").
 */
import { scaleByGameSpeed } from './constants';
import { srcConst, xml } from './provenance';

const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

/** the camps a major adds to the map's target (0x14fcc0 reads the target at
 *  manager +0x110: this times the majors) */
export const BARB_CAMPS_PER_MAJOR = srcConst('barb.campsPerMajor', 3, gp('BARBARIAN_CAMP_MAX_PER_MAJOR_CIV'));
/** the share of the target the first camp step lays at once */
export const BARB_FIRST_TURN_PCT = srcConst('barb.firstTurnPct', 33, gp('BARBARIAN_CAMP_FIRST_TURN_PERCENT_OF_TARGET_TO_ADD'));
/** no camp rises within this of another camp (`<=`) */
export const BARB_CAMP_DIST_CAMP = srcConst('barb.campDistCamp', 7, gp('BARBARIAN_CAMP_MINIMUM_DISTANCE_ANOTHER_CAMP'));
/** no camp rises closer than this to a major's city (`<`) */
export const BARB_CAMP_DIST_CITY = srcConst('barb.campDistCity', 4, gp('BARBARIAN_CAMP_MINIMUM_DISTANCE_CITY'));
/** the barbarians take a tech or civic this percent of the majors hold */
export const BARB_TECH_PCT = srcConst('barb.techPct', 50, gp('BARBARIAN_TECH_PERCENT'));
/** a region (a continent) enters the camp pick when it has more plots than
 *  this (0x153290: `[region + 4] > 10`) */
export const BARB_REGION_MIN = srcConst('barb.regionMin', 10, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x153290)' });
/** a camp's turns of scout-less waiting before it raises a scout (0x1488a0:
 *  `[tribe + 0x2c] >= 5`) */
export const BARB_SCOUT_WAIT = srcConst('barb.scoutWait', 5, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x1488a0)' });
/** a camp's area under this many plots makes its tribe a naval one (0x153d60) */
export const BARB_ISLAND_PLOTS = srcConst('barb.islandPlots', 15, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x153d60)' });
/** a coastal camp needs this many water plots around it for a naval tribe */
export const BARB_COAST_WATER = srcConst('barb.coastWater', 4, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x153d60)' });

/** IMPROVEMENT_BARBARIAN_CAMP's ground (Improvement_ValidTerrains /
 *  Improvement_ValidFeatures), the engine's ids: each terrain flat and on
 *  hills, never a mountain */
export const BARB_CAMP_TERRAINS: readonly string[] = srcConst('barb.campTerrains',
  ['DESERT', 'TUNDRA', 'PLAINS', 'GRASSLAND', 'SNOW'], {
    derived: 'the Improvement_ValidTerrains rows of IMPROVEMENT_BARBARIAN_CAMP, TERRAIN_ prefix stripped, GRASS spelled GRASSLAND, each with its _HILLS row',
    inputs: [xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_BARBARIAN_CAMP&TerrainType=TERRAIN_GRASS_HILLS', 'TerrainType'),
      xml('Improvement_ValidTerrains', 'ImprovementType=IMPROVEMENT_BARBARIAN_CAMP&TerrainType=TERRAIN_GRASS_MOUNTAIN', 'TerrainType', { absent: true })],
  });
export const BARB_CAMP_FEATURES: readonly string[] = srcConst('barb.campFeatures',
  ['WOODS', 'RAINFOREST', 'MARSH', 'VOLCANIC_SOIL', 'FLOODPLAINS', 'FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS'], {
    derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_BARBARIAN_CAMP (Base <- Expansion2), FEATURE_ prefix stripped, FOREST spelled WOODS, JUNGLE RAINFOREST',
    inputs: [xml('Improvement_ValidFeatures', 'ImprovementType=IMPROVEMENT_BARBARIAN_CAMP&FeatureType=FEATURE_FLOODPLAINS_PLAINS', 'FeatureType')],
  });

export type BarbTribeKind = 'NAVAL' | 'CAVALRY' | 'MELEE';
export type BarbTag = 'CLASS_MELEE' | 'CLASS_RANGED' | 'CLASS_ANTI_CAVALRY' | 'CLASS_RECON' | 'CLASS_SIEGE' | 'CLASS_LIGHT_CAVALRY'
  | 'CLASS_HEAVY_CAVALRY' | 'CLASS_MOBILE_RANGED' | 'CLASS_NAVAL_MELEE' | 'CLASS_NAVAL_RANGED';

export interface BarbTribeDef {
  kind: BarbTribeKind;
  coastal: boolean;
  resource?: string;
  resourceRange: number;
  rangedPct: number;
  /** TurnsToWarriorSpawn at the game's speed (0x147fc0 scales it, 0x5254d0) */
  spawnEvery: number;
  scoutTag: BarbTag;
  meleeTag: BarbTag;
  rangedTag: BarbTag;
  defenderTag: BarbTag;
}

const tribeSrc = (t: string, col: string) => xml('BarbarianTribes', `TribeType=TRIBE_${t}`, col);

/** BarbarianTribes, in the table's order: the order a camp's tribe is chosen
 *  in (0x154220: the first whose conditions the camp meets) */
export const BARB_TRIBES: readonly BarbTribeDef[] = [
  { kind: 'NAVAL', coastal: srcConst('barb.naval.coastal', true, tribeSrc('NAVAL', 'IsCoastal')), resourceRange: 0,
    rangedPct: srcConst('barb.naval.rangedPct', 25, tribeSrc('NAVAL', 'PercentRangedUnits')),
    spawnEvery: scaleByGameSpeed(srcConst('barb.naval.spawn', 10, tribeSrc('NAVAL', 'TurnsToWarriorSpawn'))),
    scoutTag: 'CLASS_NAVAL_MELEE', meleeTag: 'CLASS_NAVAL_MELEE', rangedTag: 'CLASS_NAVAL_RANGED', defenderTag: 'CLASS_ANTI_CAVALRY' },
  { kind: 'CAVALRY', coastal: false, resource: srcConst('barb.cavalry.resource', 'RESOURCE_HORSES', tribeSrc('CAVALRY', 'RequiredResource')).replace('RESOURCE_', ''),
    resourceRange: srcConst('barb.cavalry.range', 3, tribeSrc('CAVALRY', 'ResourceRange')),
    rangedPct: srcConst('barb.cavalry.rangedPct', 25, tribeSrc('CAVALRY', 'PercentRangedUnits')),
    spawnEvery: scaleByGameSpeed(srcConst('barb.cavalry.spawn', 25, tribeSrc('CAVALRY', 'TurnsToWarriorSpawn'))),
    scoutTag: 'CLASS_RECON', meleeTag: 'CLASS_LIGHT_CAVALRY', rangedTag: 'CLASS_MOBILE_RANGED', defenderTag: 'CLASS_ANTI_CAVALRY' },
  { kind: 'MELEE', coastal: false, resourceRange: 0,
    rangedPct: srcConst('barb.melee.rangedPct', 25, tribeSrc('MELEE', 'PercentRangedUnits')),
    spawnEvery: scaleByGameSpeed(srcConst('barb.melee.spawn', 15, tribeSrc('MELEE', 'TurnsToWarriorSpawn'))),
    scoutTag: 'CLASS_RECON', meleeTag: 'CLASS_MELEE', rangedTag: 'CLASS_RANGED', defenderTag: 'CLASS_ANTI_CAVALRY' },
];

/** BarbarianTribeNames: ten names a kind; a name may override its tribe's
 *  ranged share (BARBARIAN_NAVAL_2: 100). NumMilitary 5 and NumScouts 1 on
 *  every row (the schema's default, 0x147fc0's). */
export const BARB_NAMES_PER_KIND = srcConst('barb.namesPerKind', 10, {
  derived: 'the BarbarianTribeNames rows of each TribeType',
  inputs: [xml('BarbarianTribeNames', 'TribeNameType=BARBARIAN_NAVAL_10', 'TribeType', { expect: 'TRIBE_NAVAL' })],
});
export const BARB_MAX_UNITS = srcConst('barb.maxUnits', 5, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x147fc0: BarbarianTribeNames.NumMilitary, default 5)' });
export const BARB_MAX_SCOUTS = srcConst('barb.maxScouts', 1, { lab: 'tools/civ6lab/dll_readings.md H-1: the barbarians\' turn (0x147fc0: NumScouts unset, 1)' });
const NAVAL_2_RANGED_PCT = srcConst('barb.naval2.rangedPct', 100,
  xml('BarbarianTribeNames', 'TribeNameType=BARBARIAN_NAVAL_2', 'PercentRangedUnits'));
/** a name's own ranged share, by kind and name index */
export function barbNameRangedPct(kind: BarbTribeKind, name: number): number | undefined {
  return kind === 'NAVAL' && name === 1 ? NAVAL_2_RANGED_PCT : undefined;
}

/** the units of each class tag a tribe may raise, in the Units table's order
 *  (Base <- Expansion1 <- Expansion2): the best one the barbarians' techs and
 *  civics allow is raised (0x147470: the first of the highest Combat) */
export const BARB_TAG_UNITS: Readonly<Record<BarbTag, readonly string[]>> = {
  CLASS_MELEE: ['WARRIOR', 'SWORDSMAN', 'MUSKETMAN', 'INFANTRY', 'MECHANIZED_INFANTRY', 'MAN_AT_ARMS', 'LINE_INFANTRY'],
  CLASS_RANGED: ['SLINGER', 'ARCHER', 'CROSSBOWMAN', 'FIELD_CANNON', 'RANGER', 'MACHINE_GUN'],
  CLASS_ANTI_CAVALRY: ['SPEARMAN', 'PIKEMAN', 'AT_CREW', 'MODERN_AT', 'PIKE_AND_SHOT'],
  CLASS_RECON: ['SCOUT', 'RANGER', 'SPEC_OPS', 'SKIRMISHER'],
  CLASS_SIEGE: ['CATAPULT', 'BOMBARD', 'ARTILLERY', 'ROCKET_ARTILLERY', 'TREBUCHET'],
  CLASS_LIGHT_CAVALRY: ['BARBARIAN_HORSEMAN', 'HORSEMAN', 'CAVALRY', 'HELICOPTER', 'COURSER'],
  CLASS_HEAVY_CAVALRY: ['HEAVY_CHARIOT', 'KNIGHT', 'TANK', 'MODERN_ARMOR', 'CUIRASSIER'],
  CLASS_MOBILE_RANGED: ['BARBARIAN_HORSE_ARCHER', 'RANGER', 'SKIRMISHER'],
  CLASS_NAVAL_MELEE: ['GALLEY', 'CARAVEL', 'IRONCLAD', 'DESTROYER'],
  CLASS_NAVAL_RANGED: ['QUADRIREME', 'FRIGATE', 'PRIVATEER', 'BATTLESHIP', 'SUBMARINE', 'NUCLEAR_SUBMARINE', 'MISSILE_CRUISER'],
};
srcConst('barb.tagUnits', Object.values(BARB_TAG_UNITS).flat(), {
  derived: 'the TypeTags rows of each CLASS_ tag on a Units row with no TraitType but TRAIT_BARBARIAN_BUT_SHOWS_UP_IN_PEDIA, in the Units table\'s order',
  inputs: [xml('TypeTags', 'Type=UNIT_BARBARIAN_HORSEMAN&Tag=CLASS_LIGHT_CAVALRY', 'Tag'),
    xml('Units', 'UnitType=UNIT_BARBARIAN_HORSEMAN', 'TraitType', { expect: 'TRAIT_BARBARIAN_BUT_SHOWS_UP_IN_PEDIA' })],
});

/** the techs the barbarians hold from the start (Technologies.BarbarianFree) */
export const BARB_FREE_TECHS: readonly string[] = srcConst('barb.freeTechs', ['SAILING', 'BRONZE_WORKING', 'SHIPBUILDING'], {
  derived: 'the Technologies rows with BarbarianFree="true", TECH_ prefix stripped',
  inputs: [xml('Technologies', 'TechnologyType=TECH_SAILING', 'BarbarianFree', { expect: true }),
    xml('Technologies', 'TechnologyType=TECH_BRONZE_WORKING', 'BarbarianFree', { expect: true }),
    xml('Technologies', 'TechnologyType=TECH_SHIPBUILDING', 'BarbarianFree', { expect: true })],
});
