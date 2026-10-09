/**
 * THE CITY-STATES' QUESTS (Game_Quests, GameCore_XP2_Release.dll;
 * `tools/civ6lab/dll_readings.md` "H-1: the city-states' quests"): the
 * quest logics and the rows each type's picker walks, in the game
 * database's row order — the picker's draw indexes its candidates in that
 * order, so the order is the rule.
 */
import type { GreatPersonClass } from '../core/types';
import type { DistrictId } from '../../world/types';
import { srcConst, xml } from './provenance';

const READING = "tools/civ6lab/dll_readings.md H-1: the city-states' quests";

/** the quest logics in the order Game_Quests 0x93aaa0 registers them — the
 *  Quests table's own rows; a pair's candidate types are walked in it */
export const QUEST_TYPES = srcConst('quests.types',
  ['CONVERT', 'TRADE', 'CAMP', 'TRAIN', 'ZONE', 'TECH', 'CIVIC', 'GREAT_PERSON'] as const, {
    derived: 'the Quests rows in load order, as Game_Quests 0x93aaa0 registers their logics',
    inputs: [
      'QUEST_CONVERT_CAPITAL_TO_RELIGION', 'QUEST_SEND_TRADE_ROUTE', 'QUEST_CLEAR_BARBARIAN_CAMP', 'QUEST_TRAIN_UNIT_TYPE',
      'QUEST_ZONE_DISTRICT_TYPE', 'QUEST_TRIGGER_TECH_BOOST', 'QUEST_TRIGGER_CIVIC_BOOST', 'QUEST_RECRUIT_GREAT_PERSON_CLASS',
    ].map((q) => xml('Quests', `QuestType=${q}`, 'QuestType')),
  });
export type QuestType = (typeof QUEST_TYPES)[number];

/** the quests a pair holds at once: Game_Quests 0x939980 gives 1 − the
 *  standing ones */
export const QUEST_MAX_STANDING = srcConst('quests.maxStanding', 1, { lab: `${READING} (0x939980)` });

/** the Units rows Train Unit's picker walks (0x84b860 over the table, the
 *  DLL's 0x84bdc0 keeping each): CanTrain, a Combat, RangedCombat or
 *  Bombard, and a PrereqTech or PrereqCivic (a row with neither has no era
 *  and matches none) — in the game's row order, as the engine names them
 *  (the uniques of civilizations the engine does not hold left out) */
const QUEST_UNIT_ROWS: readonly [string, string][] = [
  ['GALLEY', 'UNIT_GALLEY'], ['LONGSHIP', 'UNIT_NORWEGIAN_LONGSHIP'], ['ARCHER', 'UNIT_ARCHER'], ['SPEARMAN', 'UNIT_SPEARMAN'],
  ['HEAVY_CHARIOT', 'UNIT_HEAVY_CHARIOT'], ['HOPLITE', 'UNIT_GREEK_HOPLITE'], ['SWORDSMAN', 'UNIT_SWORDSMAN'], ['HORSEMAN', 'UNIT_HORSEMAN'],
  ['SAKA_HORSE_ARCHER', 'UNIT_SCYTHIAN_HORSE_ARCHER'], ['LEGION', 'UNIT_ROMAN_LEGION'], ['NGAO_MBEBA', 'UNIT_KONGO_SHIELD_BEARER'],
  ['CATAPULT', 'UNIT_CATAPULT'], ['QUADRIREME', 'UNIT_QUADRIREME'], ['MARYANNU_CHARIOT_ARCHER', 'UNIT_EGYPTIAN_CHARIOT_ARCHER'],
  ['SAMURAI', 'UNIT_JAPANESE_SAMURAI'], ['BERSERKER', 'UNIT_NORWEGIAN_BERSERKER'], ['KNIGHT', 'UNIT_KNIGHT'], ['VARU', 'UNIT_INDIAN_VARU'],
  ['MAMLUK', 'UNIT_ARABIAN_MAMLUK'], ['CROSSBOWMAN', 'UNIT_CROSSBOWMAN'], ['CROUCHING_TIGER', 'UNIT_CHINESE_CROUCHING_TIGER'],
  ['PIKEMAN', 'UNIT_PIKEMAN'], ['MUSKETMAN', 'UNIT_MUSKETMAN'], ['CONQUISTADOR', 'UNIT_SPANISH_CONQUISTADOR'], ['CARAVEL', 'UNIT_CARAVEL'],
  ['BOMBARD', 'UNIT_BOMBARD'], ['FRIGATE', 'UNIT_FRIGATE'], ['PRIVATEER', 'UNIT_PRIVATEER'], ['SEA_DOG', 'UNIT_ENGLISH_SEADOG'],
  ['FIELD_CANNON', 'UNIT_FIELD_CANNON'], ['CAVALRY', 'UNIT_CAVALRY'], ['COSSACK', 'UNIT_RUSSIAN_COSSACK'], ['REDCOAT', 'UNIT_ENGLISH_REDCOAT'],
  ['GARDE_IMPERIALE', 'UNIT_FRENCH_GARDE_IMPERIALE'], ['IRONCLAD', 'UNIT_IRONCLAD'], ['ROUGH_RIDER', 'UNIT_AMERICAN_ROUGH_RIDER'],
  ['RANGER', 'UNIT_RANGER'], ['BIPLANE', 'UNIT_BIPLANE'], ['INFANTRY', 'UNIT_INFANTRY'], ['ARTILLERY', 'UNIT_ARTILLERY'],
  ['BATTLESHIP', 'UNIT_BATTLESHIP'], ['MINAS_GERAES', 'UNIT_BRAZILIAN_MINAS_GERAES'], ['SUBMARINE', 'UNIT_SUBMARINE'],
  ['U_BOAT', 'UNIT_GERMAN_UBOAT'], ['AT_CREW', 'UNIT_AT_CREW'], ['TANK', 'UNIT_TANK'], ['FIGHTER', 'UNIT_FIGHTER'],
  ['P51_MUSTANG', 'UNIT_AMERICAN_P51'], ['BOMBER', 'UNIT_BOMBER'], ['MACHINE_GUN', 'UNIT_MACHINE_GUN'],
  ['AIRCRAFT_CARRIER', 'UNIT_AIRCRAFT_CARRIER'], ['DESTROYER', 'UNIT_DESTROYER'], ['HELICOPTER', 'UNIT_HELICOPTER'],
  ['NUCLEAR_SUBMARINE', 'UNIT_NUCLEAR_SUBMARINE'], ['MECHANIZED_INFANTRY', 'UNIT_MECHANIZED_INFANTRY'],
  ['ROCKET_ARTILLERY', 'UNIT_ROCKET_ARTILLERY'], ['JET_FIGHTER', 'UNIT_JET_FIGHTER'], ['JET_BOMBER', 'UNIT_JET_BOMBER'],
  ['MISSILE_CRUISER', 'UNIT_MISSILE_CRUISER'], ['MODERN_AT', 'UNIT_MODERN_AT'], ['MODERN_ARMOR', 'UNIT_MODERN_ARMOR'],
  ['MAN_AT_ARMS', 'UNIT_MAN_AT_ARMS'], ['LINE_INFANTRY', 'UNIT_LINE_INFANTRY'], ['TREBUCHET', 'UNIT_TREBUCHET'], ['IMPI', 'UNIT_ZULU_IMPI'],
  ['HWACHA', 'UNIT_KOREAN_HWACHA'], ['HIGHLANDER', 'UNIT_SCOTTISH_HIGHLANDER'], ['DE_ZEVEN_PROVINCIEN', 'UNIT_DE_ZEVEN_PROVINCIEN'],
  ['KESHIG', 'UNIT_MONGOLIAN_KESHIG'], ['KHEVSURETI', 'UNIT_GEORGIAN_KHEVSURETI'], ['MALON_RAIDER', 'UNIT_MAPUCHE_MALON_RAIDER'],
  ['SPEC_OPS', 'UNIT_SPEC_OPS'], ['PIKE_AND_SHOT', 'UNIT_PIKE_AND_SHOT'], ['SKIRMISHER', 'UNIT_SKIRMISHER'], ['COURSER', 'UNIT_COURSER'],
  ['CUIRASSIER', 'UNIT_CUIRASSIER'], ['GIANT_DEATH_ROBOT', 'UNIT_GIANT_DEATH_ROBOT'], ['MOUNTIE', 'UNIT_CANADA_MOUNTIE'],
  ['BLACK_ARMY', 'UNIT_HUNGARY_BLACK_ARMY'], ['HUSZAR', 'UNIT_HUNGARY_HUSZAR'], ['WARAKAQ', 'UNIT_INCA_WARAKAQ'],
  ['MANDEKALU_CAVALRY', 'UNIT_MALI_MANDEKALU_CAVALRY'], ['TOA', 'UNIT_MAORI_TOA'], ['BARBARY_CORSAIR', 'UNIT_OTTOMAN_BARBARY_CORSAIR'],
  ['BIREME', 'UNIT_PHOENICIA_BIREME'], ['JANISSARY', 'UNIT_SULEIMAN_JANISSARY'], ['CAROLEAN', 'UNIT_SWEDEN_CAROLEAN'],
];
export const QUEST_UNITS: readonly string[] = srcConst('quests.units', QUEST_UNIT_ROWS.map(([id]) => id), {
  derived: 'the Units rows in the game\'s row order (the records\' catalog) with CanTrain, a Combat, RangedCombat or Bombard above 0 '
    + `and a PrereqTech or PrereqCivic (${READING}, 0x84bdc0)`,
  inputs: QUEST_UNIT_ROWS.map(([id, type]) => xml('Units', `UnitType=${type}`, 'UnitType', { note: id })),
});

/** the Districts rows Zone District's picker walks (0x84dc20 over the
 *  table, 0x84e030 keeping each): RequiresPopulation — in the game's row
 *  order: the engine's district, the civilization whose unique row it is
 *  ('' for the base row), the row's prerequisite (a tech, or a civic where
 *  `QUEST_DISTRICT_CIVIC` says so) and its MaxPerPlayer (-1 none) */
const QUEST_DISTRICT_ROWS: readonly [DistrictId, string, string, string, boolean, number][] = [
  ['HOLY_SITE', '', 'DISTRICT_HOLY_SITE', 'ASTROLOGY', false, -1],
  ['CAMPUS', '', 'DISTRICT_CAMPUS', 'WRITING', false, -1],
  ['ENCAMPMENT', '', 'DISTRICT_ENCAMPMENT', 'BRONZE_WORKING', false, -1],
  ['HARBOR', '', 'DISTRICT_HARBOR', 'CELESTIAL_NAVIGATION', false, -1],
  ['AERODROME', '', 'DISTRICT_AERODROME', 'FLIGHT', false, -1],
  ['COMMERCIAL_HUB', '', 'DISTRICT_COMMERCIAL_HUB', 'CURRENCY', false, -1],
  ['ENTERTAINMENT_COMPLEX', '', 'DISTRICT_ENTERTAINMENT_COMPLEX', 'GAMES_AND_RECREATION', true, -1],
  ['THEATER_SQUARE', '', 'DISTRICT_THEATER', 'DRAMA_AND_POETRY', true, -1],
  ['INDUSTRIAL_ZONE', '', 'DISTRICT_INDUSTRIAL_ZONE', 'APPRENTICESHIP', false, -1],
  ['THEATER_SQUARE', 'GREECE', 'DISTRICT_ACROPOLIS', 'DRAMA_AND_POETRY', true, -1],
  ['INDUSTRIAL_ZONE', 'GERMANY', 'DISTRICT_HANSA', 'APPRENTICESHIP', false, -1],
  ['HOLY_SITE', 'RUSSIA', 'DISTRICT_LAVRA', 'ASTROLOGY', false, -1],
  ['ENTERTAINMENT_COMPLEX', 'BRAZIL', 'DISTRICT_STREET_CARNIVAL', 'GAMES_AND_RECREATION', true, -1],
  ['HARBOR', 'ENGLAND', 'DISTRICT_ROYAL_NAVY_DOCKYARD', 'CELESTIAL_NAVIGATION', false, -1],
  ['ENCAMPMENT', 'ZULU', 'DISTRICT_IKANDA', 'BRONZE_WORKING', false, -1],
  ['CAMPUS', 'KOREA', 'DISTRICT_SEOWON', 'WRITING', false, -1],
  ['GOVERNMENT_PLAZA', '', 'DISTRICT_GOVERNMENT', 'STATE_WORKFORCE', true, 1],
  ['WATER_PARK', '', 'DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'NATURAL_HISTORY', true, -1],
  ['WATER_PARK', 'BRAZIL', 'DISTRICT_WATER_STREET_CARNIVAL', 'NATURAL_HISTORY', true, -1],
  ['HARBOR', 'PHOENICIA', 'DISTRICT_COTHON', 'CELESTIAL_NAVIGATION', false, -1],
  ['COMMERCIAL_HUB', 'MALI', 'DISTRICT_SUGUBA', 'CURRENCY', false, -1],
  ['PRESERVE', '', 'DISTRICT_PRESERVE', 'MYSTICISM', true, -1],
  ['DIPLOMATIC_QUARTER', '', 'DISTRICT_DIPLOMATIC_QUARTER', 'MATHEMATICS', false, 1],
];
const DISTRICT_SRC = (what: string, tag: (r: (typeof QUEST_DISTRICT_ROWS)[number]) => ReturnType<typeof xml>) => ({
  derived: `the Districts rows with RequiresPopulation in the game's row order, their ${what} (${READING}, 0x84e030)`,
  inputs: QUEST_DISTRICT_ROWS.map(tag),
});
export const QUEST_DISTRICTS: readonly DistrictId[] = srcConst('quests.districts', QUEST_DISTRICT_ROWS.map((r) => r[0]),
  DISTRICT_SRC('rows', (r) => xml('Districts', `DistrictType=${r[2]}`, 'RequiresPopulation', { expect: 'true', note: r[0] }))) as readonly DistrictId[];
export const QUEST_DISTRICT_CIVS: readonly string[] = srcConst('quests.districtCivs', QUEST_DISTRICT_ROWS.map((r) => r[1]),
  DISTRICT_SRC('unique civilizations', (r) => xml('Districts', `DistrictType=${r[2]}`, 'TraitType', r[1] ? { note: r[1] } : { absent: true })));
export const QUEST_DISTRICT_PREREQ: readonly string[] = srcConst('quests.districtPrereq', QUEST_DISTRICT_ROWS.map((r) => r[3]),
  DISTRICT_SRC('prerequisites', (r) => xml('Districts', `DistrictType=${r[2]}`, r[4] ? 'PrereqCivic' : 'PrereqTech', { note: r[3] })));
export const QUEST_DISTRICT_CIVIC: readonly boolean[] = QUEST_DISTRICT_ROWS.map((r) => r[4]);
export const QUEST_DISTRICT_MAX: readonly number[] = srcConst('quests.districtMax', QUEST_DISTRICT_ROWS.map((r) => r[5]),
  DISTRICT_SRC('MaxPerPlayer', (r) => xml('Districts', `DistrictType=${r[2]}`, 'MaxPerPlayer', { note: String(r[5]) })));

/** the GreatPersonClasses rows Recruit Great Person Class's picker walks, in
 *  the game's row order — the Comandante General's left out
 *  (AvailableInTimeline false: it is never on offer) */
export const QUEST_GP_CLASSES: readonly GreatPersonClass[] = srcConst('quests.gpClasses',
  ['GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'PROPHET', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN'], {
    derived: `the GreatPersonClasses rows in the game's row order (${READING}, 0x84ab50)`,
    inputs: ['GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'PROPHET', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN']
      .map((c) => xml('GreatPersonClasses', `GreatPersonClassType=GREAT_PERSON_CLASS_${c}`, 'GreatPersonClassType')),
  }) as readonly GreatPersonClass[];

/** Clear Barbarian Camp: a camp within this many tiles of the minor's
 *  capital makes the quest valid (0x849a70 walks the plots in range 5) and
 *  a camp the actor clears there completes it (0x849c00, distance <= 5) */
export const QUEST_CAMP_RADIUS = srcConst('quests.campRadius', 5, { lab: `${READING} (0x849a70, 0x849c00)` });

/** the envoys a completed quest gives its actor (0x84a0e0: one Influence
 *  token from the actor to the minor) */
export const QUEST_ENVOYS = srcConst('quests.envoys', 1, { lab: `${READING} (0x84a0e0)` });
