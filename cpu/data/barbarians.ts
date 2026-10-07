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
  | 'CLASS_HEAVY_CAVALRY' | 'CLASS_MOBILE_RANGED' | 'CLASS_NAVAL_MELEE' | 'CLASS_NAVAL_RANGED' | 'CLASS_BATTERING_RAM';

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
  CLASS_BATTERING_RAM: ['BATTERING_RAM'],
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

/**
 * THE ATTACK FORCES (BarbarianAttackForces, BarbarianTribeForces): a raid's
 * or a city assault's units, by the tribe's kind, picked by the target
 * owner's handicap (0x147640: the first row of the tribe's whose RaidingForce
 * matches and whose Min/MaxTargetDifficulty hold the handicap). The counts
 * are its Num*Units, each a class tag; SpawnRate is the tribe's spawn
 * interval while the operation recruits (0x149760, at the speed).
 */
export interface BarbForce {
  raiding: boolean;
  /** Min / MaxTargetDifficulty as Difficulties indices (-1: open) */
  minDiff: number;
  maxDiff: number;
  /** SpawnRate at the game's speed */
  rate: number;
  /** [tag, count] in the recruit's order: melee, ranged, siege, support */
  units: readonly (readonly [BarbTag, number])[];
}

/** Difficulties, in the table's order (Difficulties.xml): a handicap is its index */
export const DIFFICULTIES = ['SETTLER', 'CHIEFTAIN', 'WARLORD', 'PRINCE', 'KING', 'EMPEROR', 'IMMORTAL', 'DEITY'] as const;
srcConst('barb.difficulties', [...DIFFICULTIES], {
  derived: 'the Difficulties rows in the table\'s order, DIFFICULTY_ prefix stripped',
  inputs: [xml('Difficulties', 'DifficultyType=DIFFICULTY_PRINCE', 'DifficultyType')],
});
/** the handicap of a player the game set none for: the AI's (Prince) */
export const DEFAULT_HANDICAP = DIFFICULTIES.indexOf('PRINCE');

const forceSrc = (f: string, col: string) => xml('BarbarianAttackForces', `AttackForceType=${f}`, col);
const diff = (d: string | null) => (d ? DIFFICULTIES.indexOf(d as typeof DIFFICULTIES[number]) : -1);
function force(id: string, raiding: boolean, min: string | null, max: string | null, rate: number,
  units: [BarbTag, number][]): BarbForce {
  srcConst(`barb.force.${id}`, [rate, ...units.map(([, n]) => n)], {
    derived: `BarbarianAttackForces ${id}: SpawnRate, then NumMeleeUnits / NumRangeUnits / NumSiegeUnits / NumSupportUnits that are set`,
    inputs: [forceSrc(id, 'SpawnRate'), forceSrc(id, 'NumMeleeUnits')],
  });
  return { raiding, minDiff: diff(min), maxDiff: diff(max), rate: scaleByGameSpeed(rate), units };
}
/** BarbarianTribeForces by tribe kind, in the table's order */
export const BARB_FORCES: Readonly<Record<BarbTribeKind, readonly BarbForce[]>> = {
  MELEE: [
    force('LowDifficultyStandardRaid', true, null, 'CHIEFTAIN', 2, [['CLASS_MELEE', 1]]),
    force('StandardRaid', true, 'WARLORD', 'EMPEROR', 2, [['CLASS_MELEE', 2], ['CLASS_RANGED', 1]]),
    force('HighDifficultyStandardRaid', true, 'IMMORTAL', null, 1, [['CLASS_MELEE', 3], ['CLASS_RANGED', 2]]),
    force('LowDifficultyStandardAttack', false, null, 'CHIEFTAIN', 2, [['CLASS_MELEE', 2], ['CLASS_RANGED', 1], ['CLASS_SIEGE', 1]]),
    force('StandardAttack', false, 'WARLORD', 'EMPEROR', 2, [['CLASS_MELEE', 3], ['CLASS_RANGED', 2], ['CLASS_SIEGE', 1], ['CLASS_BATTERING_RAM', 1]]),
    force('HighDifficultyStandardAttack', false, 'IMMORTAL', null, 1, [['CLASS_MELEE', 4], ['CLASS_RANGED', 3], ['CLASS_SIEGE', 2], ['CLASS_BATTERING_RAM', 1]]),
  ],
  CAVALRY: [
    force('LowDifficultyCavalryRaid', true, null, 'CHIEFTAIN', 2, [['CLASS_LIGHT_CAVALRY', 1]]),
    force('CavalryRaid', true, 'WARLORD', 'EMPEROR', 2, [['CLASS_LIGHT_CAVALRY', 2], ['CLASS_MOBILE_RANGED', 1]]),
    force('HighDifficultyCavalryRaid', true, 'IMMORTAL', null, 1, [['CLASS_LIGHT_CAVALRY', 3], ['CLASS_MOBILE_RANGED', 2]]),
    force('LowDifficultyCavalryAttack', false, null, 'CHIEFTAIN', 2, [['CLASS_LIGHT_CAVALRY', 2], ['CLASS_MOBILE_RANGED', 1], ['CLASS_HEAVY_CAVALRY', 1]]),
    force('CavalryAttack', false, 'WARLORD', 'EMPEROR', 2, [['CLASS_LIGHT_CAVALRY', 3], ['CLASS_MOBILE_RANGED', 2], ['CLASS_HEAVY_CAVALRY', 1]]),
    force('HighDifficultyCavalryAttack', false, 'IMMORTAL', null, 1, [['CLASS_LIGHT_CAVALRY', 4], ['CLASS_MOBILE_RANGED', 3], ['CLASS_HEAVY_CAVALRY', 2]]),
  ],
  NAVAL: [
    force('LowDifficultyNavalRaid', true, null, 'CHIEFTAIN', 2, [['CLASS_NAVAL_MELEE', 1]]),
    force('NavalRaid', true, 'WARLORD', 'EMPEROR', 2, [['CLASS_NAVAL_MELEE', 2], ['CLASS_NAVAL_RANGED', 1]]),
    force('HighDifficultyNavalRaid', true, 'IMMORTAL', null, 1, [['CLASS_NAVAL_MELEE', 3], ['CLASS_NAVAL_RANGED', 2]]),
    force('LowDifficultyNavalAttack', false, null, 'CHIEFTAIN', 2, [['CLASS_NAVAL_MELEE', 2], ['CLASS_NAVAL_RANGED', 1], ['CLASS_NAVAL_RANGED', 1]]),
    force('NavalAttack', false, 'WARLORD', 'EMPEROR', 2, [['CLASS_NAVAL_MELEE', 3], ['CLASS_NAVAL_RANGED', 2], ['CLASS_NAVAL_RANGED', 1]]),
    force('HighDifficultyNavalAttack', false, 'IMMORTAL', null, 1, [['CLASS_NAVAL_MELEE', 4], ['CLASS_NAVAL_RANGED', 3], ['CLASS_NAVAL_RANGED', 2]]),
  ],
};

/** the force a tribe of this kind raises against a city of this handicap
 *  (0x147640), undefined where no row holds it */
export function barbForce(kind: BarbTribeKind, raiding: boolean, handicap: number): BarbForce | undefined {
  return BARB_FORCES[kind].find((f) => f.raiding === raiding
    && (f.minDiff < 0 || f.minDiff <= handicap) && (f.maxDiff < 0 || f.maxDiff >= handicap));
}

/** a tribe's boldness: each of its turns, an enemy its unit kills, a unit of
 *  it lost in combat, a scout of it lost in combat (0x1488a0, 0x148e90) */
export const BARB_BOLD_TURN = srcConst('barb.boldTurn', 2, gp('BARBARIAN_BOLDNESS_PER_TURN'));
export const BARB_BOLD_KILL = srcConst('barb.boldKill', 15, gp('BARBARIAN_BOLDNESS_PER_KILL'));
export const BARB_BOLD_UNIT_LOST = srcConst('barb.boldUnitLost', -10, gp('BARBARIAN_BOLDNESS_PER_UNIT_LOST'));
export const BARB_BOLD_SCOUT_LOST = srcConst('barb.boldScoutLost', -5, gp('BARBARIAN_BOLDNESS_PER_SCOUT_LOST'));
/** the boldness a raid and a city assault wait for (BarbarianTribes
 *  RaidingBoldness / CityAttackBoldness; BARBARIAN_NAVAL_3's own 100) */
export const BARB_RAID_BOLDNESS = srcConst('barb.raidBoldness', 10, tribeSrc('MELEE', 'RaidingBoldness'));
export const BARB_ASSAULT_BOLDNESS = srcConst('barb.assaultBoldness', 25, tribeSrc('MELEE', 'CityAttackBoldness'));
const NAVAL_3_RAID_BOLDNESS = srcConst('barb.naval3.raidBoldness', 100,
  xml('BarbarianTribeNames', 'TribeNameType=BARBARIAN_NAVAL_3', 'RaidingBoldness'));
/** a name's own RaidingBoldness, by kind and name index */
export function barbNameRaidBoldness(kind: BarbTribeKind, name: number): number | undefined {
  return kind === 'NAVAL' && name === 2 ? NAVAL_3_RAID_BOLDNESS : undefined;
}
/** a scout's report of a player's city waits this many turns after the last,
 *  less the throttle per handicap level (0x153ef0) */
export const BARB_SPOT_THROTTLE = srcConst('barb.spotThrottle', 18, gp('BARBARIAN_MAX_THROTTLE_PER_RAID'));
export const BARB_SPOT_THROTTLE_PER_LEVEL = srcConst('barb.spotThrottlePerLevel', 3, gp('BARBARIAN_LOWER_THROTTLE_PER_DIFFICULTY'));
/** "Barbarian Found City": the scout walks home to this range of its camp,
 *  then reports (Move Unit's To Range) */
export const BARB_HOME_RANGE = srcConst('barb.homeRange', 1,
  xml('TreeData', 'TreeName=Barbarian Found City&NodeId=4&DefnId=4', 'DefaultData'));
/** "Barbarian Found City" walks its scout home beside Protect Unit (its
 *  Concurrent node): a scout damaged by at least this share of its health
 *  that stands where an enemy can strike holds its report (0x7f07c0) */
export const BARB_PROTECT_DAMAGE = srcConst('barb.protectDamage', 0.25,
  xml('TreeData', 'TreeName=Barbarian Found City&NodeId=3&DefnId=1', 'DefaultData'));
/** the turns a raid ("Raid City" node 5) and a city assault ("Barbarian City
 *  Attack" node 7) recruit before their Turn Limiter gives up */
export const BARB_RAID_RECRUIT_TURNS = srcConst('barb.raidRecruitTurns', 10,
  xml('TreeData', 'TreeName=Raid City&NodeId=5&DefnId=0', 'DefaultData'));
export const BARB_ASSAULT_RECRUIT_TURNS = srcConst('barb.assaultRecruitTurns', 15,
  xml('TreeData', 'TreeName=Barbarian City Attack&NodeId=7&DefnId=0', 'DefaultData'));
