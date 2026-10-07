/**
 * Eurekas (techs) and inspirations (civics): the install's `Boosts` table,
 * one row per technology or civic, every column the install writes carried
 * in the engine's spelling (`cpu/core/boosts.ts` evaluates each BoostClass).
 *
 * A row's trigger lands `Boost` percent of the item's cost as PROGRESS on
 * that item (the DLL's 0x4cd900 / 0x3a3c00, `boostAmount`), never a cut in
 * its cost.
 */

import type { DistrictId, ImprovementId } from '../core/types';
import { srcConst, xml, type SrcMap } from './provenance';

/** the install's BoostClass, less its BOOST_TRIGGER_ prefix */
export type BoostClass =
  | 'NUM_IMPROVED_TILES' | 'DISCOVER_CONTINENT' | 'CLEAR_CAMP' | 'HAVE_X_UNIQUE_SPECIALTY_DISTRICTS'
  | 'EMPIRE_POPULATION' | 'CREATE_PANTHEON' | 'RESEARCH_TECH' | 'MEET_X_CITY_STATES' | 'HAVE_X_WONDERS'
  | 'HAVE_X_DISTRICTS' | 'RECEIVE_DOW' | 'FOUND_RELIGION' | 'KILL_WITH' | 'HAVE_X_IMPROVEMENTS'
  | 'CITY_POPULATION' | 'HAVE_X_LAND_UNITS' | 'MAINTAIN_X_TRADE_ROUTES' | 'HAVE_X_BUILDINGS'
  | 'OWN_X_UNITS_OF_TYPE' | 'TRAIN_UNIT' | 'HAVE_AN_ALLIANCE' | 'HAVE_X_CITIES_FOLLOWING_YOUR_RELIGION'
  | 'HAVE_X_GREAT_PEOPLE' | 'DOW_CASUS_BELLI' | 'DISTRICT_APPEAL_LEVEL_MINIMUM_X' | 'HAVE_X_CORPS'
  | 'HAVE_X_THEMED_BUILDINGS' | 'AIRBASE_FOREIGN_CONTINENT' | 'SETTLE_COAST' | 'FIND_NATURAL_WONDER'
  | 'MEET_CIV' | 'NUM_BARBS_KILLED' | 'IMPROVE_SPECIFIC_RESOURCE' | 'CONSTRUCT_BUILDING' | 'CULTURVATE_CIVIC'
  | 'HAVE_GOVERNMENT_TIER' | 'HAVE_BUILDING_MOUNTAIN' | 'HAVE_WONDER_PAST_X_ERA' | 'HAVE_UNIT_AND_IMPROVEMENT'
  | 'CREATED_NATIONAL_PARK' | 'HAVE_ALLIANCE_LEVEL_X' | 'ARTIFACT_EXTRACTED' | 'NONE_LATE_GAME_CRITICAL_TECH'
  | 'HAVE_X_ARMIES' | 'KILL_SPECIFIC_UNIT';

export interface BoostDef {
  cls: BoostClass;
  /** `Boost`: the percent of the item's cost the trigger lands */
  pct: number;
  /** `NumItems` */
  n?: number;
  /** `Unit1Type`, `BuildingType`, `DistrictType`, `ImprovementType`,
   *  `ResourceType`, `RequiresResource`, `BoostingTechType`,
   *  `BoostingCivicType`, `GovernmentTierType` (its number) */
  unit?: string;
  building?: string;
  district?: DistrictId;
  improvement?: ImprovementId;
  resource?: string;
  requiresResource?: boolean;
  tech?: string;
  civic?: string;
  govTier?: number;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
}

/** Keyed by tech/civic id (ids never collide between the two trees). */
export const BOOSTS: Record<string, BoostDef> = {
  CRAFTSMANSHIP: { cls: 'NUM_IMPROVED_TILES', pct: 40, n: 3, unit: 'BUILDER',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CRAFTSMANSHIP', 'BoostClass', { expect: 'BOOST_TRIGGER_NUM_IMPROVED_TILES' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CRAFTSMANSHIP', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CRAFTSMANSHIP', 'NumItems'),
      'unit': xml('Boosts', 'CivicType=CIVIC_CRAFTSMANSHIP', 'Unit1Type', { expect: 'UNIT_BUILDER' }),
    } },
  FOREIGN_TRADE: { cls: 'DISCOVER_CONTINENT', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_FOREIGN_TRADE', 'BoostClass', { expect: 'BOOST_TRIGGER_DISCOVER_CONTINENT' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_FOREIGN_TRADE', 'Boost'),
    } },
  MILITARY_TRADITION: { cls: 'CLEAR_CAMP', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRADITION', 'BoostClass', { expect: 'BOOST_TRIGGER_CLEAR_CAMP' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRADITION', 'Boost'),
    } },
  STATE_WORKFORCE: { cls: 'HAVE_X_UNIQUE_SPECIALTY_DISTRICTS', pct: 40, n: 1,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_STATE_WORKFORCE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_UNIQUE_SPECIALTY_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_STATE_WORKFORCE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_STATE_WORKFORCE', 'NumItems'),
    } },
  EARLY_EMPIRE: { cls: 'EMPIRE_POPULATION', pct: 40, n: 6,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_EARLY_EMPIRE', 'BoostClass', { expect: 'BOOST_TRIGGER_EMPIRE_POPULATION' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_EARLY_EMPIRE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_EARLY_EMPIRE', 'NumItems'),
    } },
  MYSTICISM: { cls: 'CREATE_PANTHEON', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MYSTICISM', 'BoostClass', { expect: 'BOOST_TRIGGER_CREATE_PANTHEON' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MYSTICISM', 'Boost'),
    } },
  GAMES_AND_RECREATION: { cls: 'RESEARCH_TECH', pct: 40, tech: 'CONSTRUCTION',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_GAMES_RECREATION', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_GAMES_RECREATION', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_GAMES_RECREATION', 'BoostingTechType', { expect: 'TECH_CONSTRUCTION' }),
    } },
  POLITICAL_PHILOSOPHY: { cls: 'MEET_X_CITY_STATES', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_POLITICAL_PHILOSOPHY', 'BoostClass', { expect: 'BOOST_TRIGGER_MEET_X_CITY_STATES' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_POLITICAL_PHILOSOPHY', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_POLITICAL_PHILOSOPHY', 'NumItems'),
    } },
  DRAMA_AND_POETRY: { cls: 'HAVE_X_WONDERS', pct: 40, n: 1,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_DRAMA_POETRY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_WONDERS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_DRAMA_POETRY', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_DRAMA_POETRY', 'NumItems'),
    } },
  MILITARY_TRAINING: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 1, district: 'ENCAMPMENT',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRAINING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRAINING', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRAINING', 'NumItems'),
      'district': xml('Boosts', 'CivicType=CIVIC_MILITARY_TRAINING', 'DistrictType', { expect: 'DISTRICT_ENCAMPMENT' }),
    } },
  DEFENSIVE_TACTICS: { cls: 'RECEIVE_DOW', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_DEFENSIVE_TACTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_RECEIVE_DOW' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_DEFENSIVE_TACTICS', 'Boost'),
    } },
  RECORDED_HISTORY: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 2, district: 'CAMPUS',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_RECORDED_HISTORY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_RECORDED_HISTORY', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_RECORDED_HISTORY', 'NumItems'),
      'district': xml('Boosts', 'CivicType=CIVIC_RECORDED_HISTORY', 'DistrictType', { expect: 'DISTRICT_CAMPUS' }),
    } },
  THEOLOGY: { cls: 'FOUND_RELIGION', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_THEOLOGY', 'BoostClass', { expect: 'BOOST_TRIGGER_FOUND_RELIGION' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_THEOLOGY', 'Boost'),
    } },
  NAVAL_TRADITION: { cls: 'KILL_WITH', pct: 40, unit: 'QUADRIREME',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_NAVAL_TRADITION', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_WITH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_NAVAL_TRADITION', 'Boost'),
      'unit': xml('Boosts', 'CivicType=CIVIC_NAVAL_TRADITION', 'Unit1Type', { expect: 'UNIT_QUADRIREME' }),
    } },
  FEUDALISM: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 6, improvement: 'FARM', requiresResource: false,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_FEUDALISM', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_FEUDALISM', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_FEUDALISM', 'NumItems'),
      'improvement': xml('Boosts', 'CivicType=CIVIC_FEUDALISM', 'ImprovementType', { expect: 'IMPROVEMENT_FARM' }),
      'requiresResource': xml('Boosts', 'CivicType=CIVIC_FEUDALISM', 'RequiresResource'),
    } },
  COLONIALISM: { cls: 'RESEARCH_TECH', pct: 40, tech: 'ASTRONOMY',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_COLONIALISM', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_COLONIALISM', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_COLONIALISM', 'BoostingTechType', { expect: 'TECH_ASTRONOMY' }),
    } },
  CIVIL_SERVICE: { cls: 'CITY_POPULATION', pct: 40, n: 10,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CIVIL_SERVICE', 'BoostClass', { expect: 'BOOST_TRIGGER_CITY_POPULATION' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CIVIL_SERVICE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CIVIL_SERVICE', 'NumItems'),
    } },
  MERCENARIES: { cls: 'HAVE_X_LAND_UNITS', pct: 40, n: 8,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MERCENARIES', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_LAND_UNITS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MERCENARIES', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_MERCENARIES', 'NumItems'),
    } },
  MEDIEVAL_FAIRES: { cls: 'MAINTAIN_X_TRADE_ROUTES', pct: 40, n: 4, unit: 'TRADER',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'BoostClass', { expect: 'BOOST_TRIGGER_MAINTAIN_X_TRADE_ROUTES' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'NumItems'),
      'unit': xml('Boosts', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'Unit1Type', { expect: 'UNIT_TRADER' }),
    } },
  GUILDS: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'MARKET',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_GUILDS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_GUILDS', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_GUILDS', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_GUILDS', 'BuildingType', { expect: 'BUILDING_MARKET' }),
    } },
  DIVINE_RIGHT: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'TEMPLE',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_DIVINE_RIGHT', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_DIVINE_RIGHT', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_DIVINE_RIGHT', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_DIVINE_RIGHT', 'BuildingType', { expect: 'BUILDING_TEMPLE' }),
    } },
  EXPLORATION: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'CARAVEL',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_EXPLORATION', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_EXPLORATION', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_EXPLORATION', 'NumItems'),
      'unit': xml('Boosts', 'CivicType=CIVIC_EXPLORATION', 'Unit1Type', { expect: 'UNIT_CARAVEL' }),
    } },
  HUMANISM: { cls: 'TRAIN_UNIT', pct: 40, unit: 'GREAT_ARTIST',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_HUMANISM', 'BoostClass', { expect: 'BOOST_TRIGGER_TRAIN_UNIT' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_HUMANISM', 'Boost'),
      'unit': xml('Boosts', 'CivicType=CIVIC_HUMANISM', 'Unit1Type', { expect: 'UNIT_GREAT_ARTIST' }),
    } },
  DIPLOMATIC_SERVICE: { cls: 'HAVE_AN_ALLIANCE', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_DIPLOMATIC_SERVICE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_AN_ALLIANCE' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_DIPLOMATIC_SERVICE', 'Boost'),
    } },
  REFORMED_CHURCH: { cls: 'HAVE_X_CITIES_FOLLOWING_YOUR_RELIGION', pct: 40, n: 6,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_REFORMED_CHURCH', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_CITIES_FOLLOWING_YOUR_RELIGION' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_REFORMED_CHURCH', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_REFORMED_CHURCH', 'NumItems'),
    } },
  MERCANTILISM: { cls: 'TRAIN_UNIT', pct: 40, unit: 'GREAT_MERCHANT',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MERCANTILISM', 'BoostClass', { expect: 'BOOST_TRIGGER_TRAIN_UNIT' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MERCANTILISM', 'Boost'),
      'unit': xml('Boosts', 'CivicType=CIVIC_MERCANTILISM', 'Unit1Type', { expect: 'UNIT_GREAT_MERCHANT' }),
    } },
  ENLIGHTENMENT: { cls: 'HAVE_X_GREAT_PEOPLE', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_GREAT_PEOPLE' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'NumItems'),
    } },
  CIVIL_ENGINEERING: { cls: 'HAVE_X_UNIQUE_SPECIALTY_DISTRICTS', pct: 40, n: 7,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CIVIL_ENGINEERING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_UNIQUE_SPECIALTY_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CIVIL_ENGINEERING', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CIVIL_ENGINEERING', 'NumItems'),
    } },
  NATIONALISM: { cls: 'DOW_CASUS_BELLI', pct: 40,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_NATIONALISM', 'BoostClass', { expect: 'BOOST_TRIGGER_DOW_CASUS_BELLI' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_NATIONALISM', 'Boost'),
    } },
  OPERA_AND_BALLET: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'MUSEUM',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_OPERA_BALLET', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_OPERA_BALLET', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_OPERA_BALLET', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_OPERA_BALLET', 'BuildingType', { expect: 'BUILDING_MUSEUM_ART' }),
    } },
  NATURAL_HISTORY: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'ARCHAEOLOGICAL_MUSEUM',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_NATURAL_HISTORY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_NATURAL_HISTORY', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_NATURAL_HISTORY', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_NATURAL_HISTORY', 'BuildingType', { expect: 'BUILDING_MUSEUM_ARTIFACT' }),
    } },
  URBANIZATION: { cls: 'CITY_POPULATION', pct: 40, n: 15,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_URBANIZATION', 'BoostClass', { expect: 'BOOST_TRIGGER_CITY_POPULATION' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_URBANIZATION', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_URBANIZATION', 'NumItems'),
    } },
  SCORCHED_EARTH: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'FIELD_CANNON',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_SCORCHED_EARTH', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_SCORCHED_EARTH', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_SCORCHED_EARTH', 'NumItems'),
      'unit': xml('Boosts', 'CivicType=CIVIC_SCORCHED_EARTH', 'Unit1Type', { expect: 'UNIT_FIELD_CANNON' }),
    } },
  CONSERVATION: { cls: 'DISTRICT_APPEAL_LEVEL_MINIMUM_X', pct: 40, n: 4, district: 'NEIGHBORHOOD',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CONSERVATION', 'BoostClass', { expect: 'BOOST_TRIGGER_DISTRICT_APPEAL_LEVEL_MINIMUM_X' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CONSERVATION', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CONSERVATION', 'NumItems'),
      'district': xml('Boosts', 'CivicType=CIVIC_CONSERVATION', 'DistrictType', { expect: 'DISTRICT_NEIGHBORHOOD' }),
    } },
  MOBILIZATION: { cls: 'HAVE_X_CORPS', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MOBILIZATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_CORPS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MOBILIZATION', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_MOBILIZATION', 'NumItems'),
    } },
  MASS_MEDIA: { cls: 'RESEARCH_TECH', pct: 40, tech: 'RADIO',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_MASS_MEDIA', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_MASS_MEDIA', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_MASS_MEDIA', 'BoostingTechType', { expect: 'TECH_RADIO' }),
    } },
  CAPITALISM: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'STOCK_EXCHANGE',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CAPITALISM', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CAPITALISM', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CAPITALISM', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_CAPITALISM', 'BuildingType', { expect: 'BUILDING_STOCK_EXCHANGE' }),
    } },
  NUCLEAR_PROGRAM: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'RESEARCH_LAB',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'BuildingType', { expect: 'BUILDING_RESEARCH_LAB' }),
    } },
  SUFFRAGE: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 4, building: 'SEWER',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_SUFFRAGE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_SUFFRAGE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_SUFFRAGE', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_SUFFRAGE', 'BuildingType', { expect: 'BUILDING_SEWER' }),
    } },
  TOTALITARIANISM: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 3, building: 'MILITARY_ACADEMY',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_TOTALITARIANISM', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_TOTALITARIANISM', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_TOTALITARIANISM', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_TOTALITARIANISM', 'BuildingType', { expect: 'BUILDING_MILITARY_ACADEMY' }),
    } },
  CLASS_STRUGGLE: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 3, building: 'FACTORY',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CLASS_STRUGGLE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CLASS_STRUGGLE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CLASS_STRUGGLE', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_CLASS_STRUGGLE', 'BuildingType', { expect: 'BUILDING_FACTORY' }),
    } },
  COLD_WAR: { cls: 'RESEARCH_TECH', pct: 40, tech: 'NUCLEAR_FISSION',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_COLD_WAR', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_COLD_WAR', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_COLD_WAR', 'BoostingTechType', { expect: 'TECH_NUCLEAR_FISSION' }),
    } },
  PROFESSIONAL_SPORTS: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 2, district: 'ENTERTAINMENT_COMPLEX',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'NumItems'),
      'district': xml('Boosts', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'DistrictType', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
    } },
  CULTURAL_HERITAGE: { cls: 'HAVE_X_THEMED_BUILDINGS', pct: 40, n: 1,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CULTURAL_HERITAGE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_THEMED_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CULTURAL_HERITAGE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_CULTURAL_HERITAGE', 'NumItems'),
    } },
  RAPID_DEPLOYMENT: { cls: 'AIRBASE_FOREIGN_CONTINENT', pct: 40, n: 1,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_RAPID_DEPLOYMENT', 'BoostClass', { expect: 'BOOST_TRIGGER_AIRBASE_FOREIGN_CONTINENT' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_RAPID_DEPLOYMENT', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_RAPID_DEPLOYMENT', 'NumItems'),
    } },
  SPACE_RACE: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 1, district: 'SPACEPORT',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_SPACE_RACE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_SPACE_RACE', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_SPACE_RACE', 'NumItems'),
      'district': xml('Boosts', 'CivicType=CIVIC_SPACE_RACE', 'DistrictType', { expect: 'DISTRICT_SPACEPORT' }),
    } },
  GLOBALIZATION: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'AIRPORT',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_GLOBALIZATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_GLOBALIZATION', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_GLOBALIZATION', 'NumItems'),
      'building': xml('Boosts', 'CivicType=CIVIC_GLOBALIZATION', 'BuildingType', { expect: 'BUILDING_AIRPORT' }),
    } },
  SOCIAL_MEDIA: { cls: 'RESEARCH_TECH', pct: 40, tech: 'TELECOMMUNICATIONS',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_SOCIAL_MEDIA', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_SOCIAL_MEDIA', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_SOCIAL_MEDIA', 'BoostingTechType', { expect: 'TECH_TELECOMMUNICATIONS' }),
    } },
  SAILING: { cls: 'SETTLE_COAST', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SAILING', 'BoostClass', { expect: 'BOOST_TRIGGER_SETTLE_COAST' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SAILING', 'Boost'),
    } },
  ASTROLOGY: { cls: 'FIND_NATURAL_WONDER', pct: 40, unit: 'SCOUT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ASTROLOGY', 'BoostClass', { expect: 'BOOST_TRIGGER_FIND_NATURAL_WONDER' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ASTROLOGY', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_ASTROLOGY', 'Unit1Type', { expect: 'UNIT_SCOUT' }),
    } },
  IRRIGATION: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 1, improvement: 'FARM', requiresResource: true,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_IRRIGATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_IRRIGATION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_IRRIGATION', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_IRRIGATION', 'ImprovementType', { expect: 'IMPROVEMENT_FARM' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_IRRIGATION', 'RequiresResource'),
    } },
  ARCHERY: { cls: 'KILL_WITH', pct: 40, unit: 'SLINGER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ARCHERY', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_WITH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ARCHERY', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_ARCHERY', 'Unit1Type', { expect: 'UNIT_SLINGER' }),
    } },
  WRITING: { cls: 'MEET_CIV', pct: 40, unit: 'SCOUT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_WRITING', 'BoostClass', { expect: 'BOOST_TRIGGER_MEET_CIV' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_WRITING', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_WRITING', 'Unit1Type', { expect: 'UNIT_SCOUT' }),
    } },
  MASONRY: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 1, improvement: 'QUARRY', requiresResource: true,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MASONRY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MASONRY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_MASONRY', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_MASONRY', 'ImprovementType', { expect: 'IMPROVEMENT_QUARRY' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_MASONRY', 'RequiresResource'),
    } },
  BRONZE_WORKING: { cls: 'NUM_BARBS_KILLED', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_BRONZE_WORKING', 'BoostClass', { expect: 'BOOST_TRIGGER_NUM_BARBS_KILLED' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_BRONZE_WORKING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_BRONZE_WORKING', 'NumItems'),
    } },
  WHEEL: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 1, improvement: 'MINE', requiresResource: true,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_THE_WHEEL', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_THE_WHEEL', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_THE_WHEEL', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_THE_WHEEL', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_THE_WHEEL', 'RequiresResource'),
    } },
  CELESTIAL_NAVIGATION: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 2, improvement: 'FISHING_BOATS', requiresResource: true,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'ImprovementType', { expect: 'IMPROVEMENT_FISHING_BOATS' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'RequiresResource'),
    } },
  CURRENCY: { cls: 'MAINTAIN_X_TRADE_ROUTES', pct: 40, n: 1, unit: 'TRADER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CURRENCY', 'BoostClass', { expect: 'BOOST_TRIGGER_MAINTAIN_X_TRADE_ROUTES' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CURRENCY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_CURRENCY', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_CURRENCY', 'Unit1Type', { expect: 'UNIT_TRADER' }),
    } },
  HORSEBACK_RIDING: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 1, improvement: 'PASTURE', requiresResource: true,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_HORSEBACK_RIDING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_HORSEBACK_RIDING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_HORSEBACK_RIDING', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_HORSEBACK_RIDING', 'ImprovementType', { expect: 'IMPROVEMENT_PASTURE' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_HORSEBACK_RIDING', 'RequiresResource'),
    } },
  IRON_WORKING: { cls: 'IMPROVE_SPECIFIC_RESOURCE', pct: 40, improvement: 'MINE', resource: 'IRON',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_IRON_WORKING', 'BoostClass', { expect: 'BOOST_TRIGGER_IMPROVE_SPECIFIC_RESOURCE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_IRON_WORKING', 'Boost'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_IRON_WORKING', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'resource': xml('Boosts', 'TechnologyType=TECH_IRON_WORKING', 'ResourceType', { expect: 'RESOURCE_IRON' }),
    } },
  SHIPBUILDING: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'GALLEY',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SHIPBUILDING', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SHIPBUILDING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_SHIPBUILDING', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_SHIPBUILDING', 'Unit1Type', { expect: 'UNIT_GALLEY' }),
    } },
  MATHEMATICS: { cls: 'HAVE_X_UNIQUE_SPECIALTY_DISTRICTS', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MATHEMATICS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_UNIQUE_SPECIALTY_DISTRICTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MATHEMATICS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_MATHEMATICS', 'NumItems'),
    } },
  CONSTRUCTION: { cls: 'CONSTRUCT_BUILDING', pct: 40, building: 'WATER_MILL',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CONSTRUCTION', 'BoostClass', { expect: 'BOOST_TRIGGER_CONSTRUCT_BUILDING' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CONSTRUCTION', 'Boost'),
      'building': xml('Boosts', 'TechnologyType=TECH_CONSTRUCTION', 'BuildingType', { expect: 'BUILDING_WATER_MILL' }),
    } },
  ENGINEERING: { cls: 'CONSTRUCT_BUILDING', pct: 40, building: 'ANCIENT_WALLS',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ENGINEERING', 'BoostClass', { expect: 'BOOST_TRIGGER_CONSTRUCT_BUILDING' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ENGINEERING', 'Boost'),
      'building': xml('Boosts', 'TechnologyType=TECH_ENGINEERING', 'BuildingType', { expect: 'BUILDING_WALLS' }),
    } },
  MILITARY_TACTICS: { cls: 'KILL_WITH', pct: 40, unit: 'SPEARMAN',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MILITARY_TACTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_WITH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MILITARY_TACTICS', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_MILITARY_TACTICS', 'Unit1Type', { expect: 'UNIT_SPEARMAN' }),
    } },
  APPRENTICESHIP: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 3, improvement: 'MINE', requiresResource: false,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_APPRENTICESHIP', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_APPRENTICESHIP', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_APPRENTICESHIP', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_APPRENTICESHIP', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_APPRENTICESHIP', 'RequiresResource'),
    } },
  STIRRUPS: { cls: 'CULTURVATE_CIVIC', pct: 40, civic: 'FEUDALISM',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_STIRRUPS', 'BoostClass', { expect: 'BOOST_TRIGGER_CULTURVATE_CIVIC' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_STIRRUPS', 'Boost'),
      'civic': xml('Boosts', 'TechnologyType=TECH_STIRRUPS', 'BoostingCivicType', { expect: 'CIVIC_FEUDALISM' }),
    } },
  MACHINERY: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 3, unit: 'ARCHER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MACHINERY', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MACHINERY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_MACHINERY', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_MACHINERY', 'Unit1Type', { expect: 'UNIT_ARCHER' }),
    } },
  EDUCATION: { cls: 'TRAIN_UNIT', pct: 40, unit: 'GREAT_SCIENTIST',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_EDUCATION', 'BoostClass', { expect: 'BOOST_TRIGGER_TRAIN_UNIT' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_EDUCATION', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_EDUCATION', 'Unit1Type', { expect: 'UNIT_GREAT_SCIENTIST' }),
    } },
  MILITARY_ENGINEERING: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 1, district: 'AQUEDUCT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'NumItems'),
      'district': xml('Boosts', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'DistrictType', { expect: 'DISTRICT_AQUEDUCT' }),
    } },
  CASTLES: { cls: 'HAVE_GOVERNMENT_TIER', pct: 40, n: 6, govTier: 2,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CASTLES', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_GOVERNMENT_TIER' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CASTLES', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_CASTLES', 'NumItems'),
      'govTier': xml('Boosts', 'TechnologyType=TECH_CASTLES', 'GovernmentTierType', { expect: 'Tier2' }),
    } },
  CARTOGRAPHY: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 2, district: 'HARBOR',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CARTOGRAPHY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CARTOGRAPHY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_CARTOGRAPHY', 'NumItems'),
      'district': xml('Boosts', 'TechnologyType=TECH_CARTOGRAPHY', 'DistrictType', { expect: 'DISTRICT_HARBOR' }),
    } },
  MASS_PRODUCTION: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 1, improvement: 'LUMBER_MILL', requiresResource: false,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MASS_PRODUCTION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MASS_PRODUCTION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_MASS_PRODUCTION', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_MASS_PRODUCTION', 'ImprovementType', { expect: 'IMPROVEMENT_LUMBER_MILL' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_MASS_PRODUCTION', 'RequiresResource'),
    } },
  BANKING: { cls: 'CULTURVATE_CIVIC', pct: 40, civic: 'GUILDS',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_BANKING', 'BoostClass', { expect: 'BOOST_TRIGGER_CULTURVATE_CIVIC' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_BANKING', 'Boost'),
      'civic': xml('Boosts', 'TechnologyType=TECH_BANKING', 'BoostingCivicType', { expect: 'CIVIC_GUILDS' }),
    } },
  GUNPOWDER: { cls: 'CONSTRUCT_BUILDING', pct: 40, building: 'ARMORY',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_GUNPOWDER', 'BoostClass', { expect: 'BOOST_TRIGGER_CONSTRUCT_BUILDING' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_GUNPOWDER', 'Boost'),
      'building': xml('Boosts', 'TechnologyType=TECH_GUNPOWDER', 'BuildingType', { expect: 'BUILDING_ARMORY' }),
    } },
  PRINTING: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'UNIVERSITY',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_PRINTING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_PRINTING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_PRINTING', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_PRINTING', 'BuildingType', { expect: 'BUILDING_UNIVERSITY' }),
    } },
  SQUARE_RIGGING: { cls: 'KILL_WITH', pct: 40, unit: 'MUSKETMAN',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SQUARE_RIGGING', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_WITH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SQUARE_RIGGING', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_SQUARE_RIGGING', 'Unit1Type', { expect: 'UNIT_MUSKETMAN' }),
    } },
  ASTRONOMY: { cls: 'HAVE_BUILDING_MOUNTAIN', pct: 40, building: 'UNIVERSITY',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ASTRONOMY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_BUILDING_MOUNTAIN' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ASTRONOMY', 'Boost'),
      'building': xml('Boosts', 'TechnologyType=TECH_ASTRONOMY', 'BuildingType', { expect: 'BUILDING_UNIVERSITY' }),
    } },
  METAL_CASTING: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'CROSSBOWMAN',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_METAL_CASTING', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_METAL_CASTING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_METAL_CASTING', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_METAL_CASTING', 'Unit1Type', { expect: 'UNIT_CROSSBOWMAN' }),
    } },
  SIEGE_TACTICS: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'TREBUCHET',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SIEGE_TACTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SIEGE_TACTICS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_SIEGE_TACTICS', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_SIEGE_TACTICS', 'Unit1Type', { expect: 'UNIT_TREBUCHET' }),
    } },
  INDUSTRIALIZATION: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'WORKSHOP',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_INDUSTRIALIZATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_INDUSTRIALIZATION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_INDUSTRIALIZATION', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_INDUSTRIALIZATION', 'BuildingType', { expect: 'BUILDING_WORKSHOP' }),
    } },
  SCIENTIFIC_THEORY: { cls: 'CULTURVATE_CIVIC', pct: 40, civic: 'ENLIGHTENMENT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SCIENTIFIC_THEORY', 'BoostClass', { expect: 'BOOST_TRIGGER_CULTURVATE_CIVIC' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SCIENTIFIC_THEORY', 'Boost'),
      'civic': xml('Boosts', 'TechnologyType=TECH_SCIENTIFIC_THEORY', 'BoostingCivicType', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
    } },
  BALLISTICS: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 2, improvement: 'FORT', requiresResource: false,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_BALLISTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_BALLISTICS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_BALLISTICS', 'NumItems'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_BALLISTICS', 'ImprovementType', { expect: 'IMPROVEMENT_FORT' }),
      'requiresResource': xml('Boosts', 'TechnologyType=TECH_BALLISTICS', 'RequiresResource'),
    } },
  MILITARY_SCIENCE: { cls: 'KILL_WITH', pct: 40, unit: 'KNIGHT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_MILITARY_SCIENCE', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_WITH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_MILITARY_SCIENCE', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_MILITARY_SCIENCE', 'Unit1Type', { expect: 'UNIT_KNIGHT' }),
    } },
  STEAM_POWER: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'SHIPYARD',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_STEAM_POWER', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_STEAM_POWER', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_STEAM_POWER', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_STEAM_POWER', 'BuildingType', { expect: 'BUILDING_SHIPYARD' }),
    } },
  SANITATION: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 2, district: 'NEIGHBORHOOD',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SANITATION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SANITATION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_SANITATION', 'NumItems'),
      'district': xml('Boosts', 'TechnologyType=TECH_SANITATION', 'DistrictType', { expect: 'DISTRICT_NEIGHBORHOOD' }),
    } },
  ECONOMICS: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'BANK',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ECONOMICS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ECONOMICS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_ECONOMICS', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_ECONOMICS', 'BuildingType', { expect: 'BUILDING_BANK' }),
    } },
  RIFLING: { cls: 'IMPROVE_SPECIFIC_RESOURCE', pct: 40, improvement: 'MINE', resource: 'NITER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_RIFLING', 'BoostClass', { expect: 'BOOST_TRIGGER_IMPROVE_SPECIFIC_RESOURCE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_RIFLING', 'Boost'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_RIFLING', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'resource': xml('Boosts', 'TechnologyType=TECH_RIFLING', 'ResourceType', { expect: 'RESOURCE_NITER' }),
    } },
  FLIGHT: { cls: 'HAVE_WONDER_PAST_X_ERA', pct: 40, n: 5,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_FLIGHT', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_WONDER_PAST_X_ERA' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_FLIGHT', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_FLIGHT', 'NumItems'),
    } },
  REPLACEABLE_PARTS: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 3, unit: 'LINE_INFANTRY',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'Unit1Type', { expect: 'UNIT_LINE_INFANTRY' }),
    } },
  STEEL: { cls: 'HAVE_UNIT_AND_IMPROVEMENT', pct: 40, unit: 'IRONCLAD', improvement: 'MINE', resource: 'COAL',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_STEEL', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_UNIT_AND_IMPROVEMENT' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_STEEL', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_STEEL', 'Unit1Type', { expect: 'UNIT_IRONCLAD' }),
      'improvement': xml('Boosts', 'TechnologyType=TECH_STEEL', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'resource': xml('Boosts', 'TechnologyType=TECH_STEEL', 'ResourceType', { expect: 'RESOURCE_COAL' }),
    } },
  ELECTRICITY: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'PRIVATEER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ELECTRICITY', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ELECTRICITY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_ELECTRICITY', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_ELECTRICITY', 'Unit1Type', { expect: 'UNIT_PRIVATEER' }),
    } },
  RADIO: { cls: 'CREATED_NATIONAL_PARK', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_RADIO', 'BoostClass', { expect: 'BOOST_TRIGGER_CREATED_NATIONAL_PARK' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_RADIO', 'Boost'),
    } },
  CHEMISTRY: { cls: 'HAVE_ALLIANCE_LEVEL_X', pct: 40, n: 2,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CHEMISTRY', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_ALLIANCE_LEVEL_X' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CHEMISTRY', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_CHEMISTRY', 'NumItems'),
    } },
  COMBUSTION: { cls: 'ARTIFACT_EXTRACTED', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_COMBUSTION', 'BoostClass', { expect: 'BOOST_TRIGGER_ARTIFACT_EXTRACTED' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_COMBUSTION', 'Boost'),
    } },
  ADVANCED_FLIGHT: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'BIPLANE',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'Unit1Type', { expect: 'UNIT_BIPLANE' }),
    } },
  ROCKETRY: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ROCKETRY', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ROCKETRY', 'Boost'),
    } },
  ADVANCED_BALLISTICS: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'OIL_POWER_PLANT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'BuildingType', { expect: 'BUILDING_FOSSIL_FUEL_POWER_PLANT' }),
    } },
  COMBINED_ARMS: { cls: 'HAVE_X_ARMIES', pct: 40, n: 3,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_COMBINED_ARMS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_ARMIES' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_COMBINED_ARMS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_COMBINED_ARMS', 'NumItems'),
    } },
  PLASTICS: { cls: 'IMPROVE_SPECIFIC_RESOURCE', pct: 40, improvement: 'OIL_WELL', resource: 'OIL',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_PLASTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_IMPROVE_SPECIFIC_RESOURCE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_PLASTICS', 'Boost'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_PLASTICS', 'ImprovementType', { expect: 'IMPROVEMENT_OIL_WELL' }),
      'resource': xml('Boosts', 'TechnologyType=TECH_PLASTICS', 'ResourceType', { expect: 'RESOURCE_OIL' }),
    } },
  COMPUTERS: { cls: 'HAVE_GOVERNMENT_TIER', pct: 40, n: 8, govTier: 3,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_COMPUTERS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_GOVERNMENT_TIER' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_COMPUTERS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_COMPUTERS', 'NumItems'),
      'govTier': xml('Boosts', 'TechnologyType=TECH_COMPUTERS', 'GovernmentTierType', { expect: 'Tier3' }),
    } },
  NUCLEAR_FISSION: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FISSION', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FISSION', 'Boost'),
    } },
  SYNTHETIC_MATERIALS: { cls: 'HAVE_X_DISTRICTS', pct: 40, n: 2, district: 'AERODROME',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_DISTRICTS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'NumItems'),
      'district': xml('Boosts', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'DistrictType', { expect: 'DISTRICT_AERODROME' }),
    } },
  TELECOMMUNICATIONS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_TELECOMMUNICATIONS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_TELECOMMUNICATIONS', 'Boost'),
    } },
  SATELLITES: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 2, building: 'BROADCAST_CENTER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SATELLITES', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SATELLITES', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_SATELLITES', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_SATELLITES', 'BuildingType', { expect: 'BUILDING_BROADCAST_CENTER' }),
    } },
  GUIDANCE_SYSTEMS: { cls: 'KILL_SPECIFIC_UNIT', pct: 40, unit: 'FIGHTER',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_GUIDANCE_SYSTEMS', 'BoostClass', { expect: 'BOOST_TRIGGER_KILL_SPECIFIC_UNIT' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_GUIDANCE_SYSTEMS', 'Boost'),
      'unit': xml('Boosts', 'TechnologyType=TECH_GUIDANCE_SYSTEMS', 'Unit1Type', { expect: 'UNIT_FIGHTER' }),
    } },
  LASERS: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 2, unit: 'DRONE',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_LASERS', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_LASERS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_LASERS', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_LASERS', 'Unit1Type', { expect: 'UNIT_DRONE' }),
    } },
  COMPOSITES: { cls: 'OWN_X_UNITS_OF_TYPE', pct: 40, n: 3, unit: 'TANK',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_COMPOSITES', 'BoostClass', { expect: 'BOOST_TRIGGER_OWN_X_UNITS_OF_TYPE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_COMPOSITES', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_COMPOSITES', 'NumItems'),
      'unit': xml('Boosts', 'TechnologyType=TECH_COMPOSITES', 'Unit1Type', { expect: 'UNIT_TANK' }),
    } },
  STEALTH_TECHNOLOGY: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_STEALTH_TECHNOLOGY', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_STEALTH_TECHNOLOGY', 'Boost'),
    } },
  ROBOTICS: { cls: 'CULTURVATE_CIVIC', pct: 40, civic: 'GLOBALIZATION',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ROBOTICS', 'BoostClass', { expect: 'BOOST_TRIGGER_CULTURVATE_CIVIC' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ROBOTICS', 'Boost'),
      'civic': xml('Boosts', 'TechnologyType=TECH_ROBOTICS', 'BoostingCivicType', { expect: 'CIVIC_GLOBALIZATION' }),
    } },
  NUCLEAR_FUSION: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'NUCLEAR_POWER_PLANT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FUSION', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FUSION', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FUSION', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_NUCLEAR_FUSION', 'BuildingType', { expect: 'BUILDING_POWER_PLANT' }),
    } },
  NANOTECHNOLOGY: { cls: 'IMPROVE_SPECIFIC_RESOURCE', pct: 40, improvement: 'MINE', resource: 'ALUMINUM',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_NANOTECHNOLOGY', 'BoostClass', { expect: 'BOOST_TRIGGER_IMPROVE_SPECIFIC_RESOURCE' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_NANOTECHNOLOGY', 'Boost'),
      'improvement': xml('Boosts', 'TechnologyType=TECH_NANOTECHNOLOGY', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'resource': xml('Boosts', 'TechnologyType=TECH_NANOTECHNOLOGY', 'ResourceType', { expect: 'RESOURCE_ALUMINUM' }),
    } },
  ENVIRONMENTALISM: { cls: 'HAVE_X_IMPROVEMENTS', pct: 40, n: 2, improvement: 'SOLAR_FARM',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_ENVIRONMENTALISM', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_IMPROVEMENTS' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_ENVIRONMENTALISM', 'Boost'),
      'n': xml('Boosts', 'CivicType=CIVIC_ENVIRONMENTALISM', 'NumItems'),
      'improvement': xml('Boosts', 'CivicType=CIVIC_ENVIRONMENTALISM', 'ImprovementType', { expect: 'IMPROVEMENT_SOLAR_FARM' }),
    } },
  CORPORATE_LIBERTARIANISM: { cls: 'IMPROVE_SPECIFIC_RESOURCE', pct: 40, improvement: 'MINE', resource: 'URANIUM',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_CORPORATE_LIBERTARIANISM', 'BoostClass', { expect: 'BOOST_TRIGGER_IMPROVE_SPECIFIC_RESOURCE' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_CORPORATE_LIBERTARIANISM', 'Boost'),
      'improvement': xml('Boosts', 'CivicType=CIVIC_CORPORATE_LIBERTARIANISM', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
      'resource': xml('Boosts', 'CivicType=CIVIC_CORPORATE_LIBERTARIANISM', 'ResourceType', { expect: 'RESOURCE_URANIUM' }),
    } },
  DIGITAL_DEMOCRACY: { cls: 'TRAIN_UNIT', pct: 40, unit: 'ROCK_BAND',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_DIGITAL_DEMOCRACY', 'BoostClass', { expect: 'BOOST_TRIGGER_TRAIN_UNIT' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_DIGITAL_DEMOCRACY', 'Boost'),
      'unit': xml('Boosts', 'CivicType=CIVIC_DIGITAL_DEMOCRACY', 'Unit1Type', { expect: 'UNIT_ROCK_BAND' }),
    } },
  SYNTHETIC_TECHNOCRACY: { cls: 'RESEARCH_TECH', pct: 40, tech: 'ROBOTICS',
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_SYNTHETIC_TECHNOCRACY', 'BoostClass', { expect: 'BOOST_TRIGGER_RESEARCH_TECH' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_SYNTHETIC_TECHNOCRACY', 'Boost'),
      'tech': xml('Boosts', 'CivicType=CIVIC_SYNTHETIC_TECHNOCRACY', 'BoostingTechType', { expect: 'TECH_ROBOTICS' }),
    } },
  NEAR_FUTURE_GOVERNANCE: { cls: 'HAVE_GOVERNMENT_TIER', pct: 90, govTier: 4,
    src: {
      'cls': xml('Boosts', 'CivicType=CIVIC_NEAR_FUTURE_GOVERNANCE', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_GOVERNMENT_TIER' }),
      'pct': xml('Boosts', 'CivicType=CIVIC_NEAR_FUTURE_GOVERNANCE', 'Boost'),
      'govTier': xml('Boosts', 'CivicType=CIVIC_NEAR_FUTURE_GOVERNANCE', 'GovernmentTierType', { expect: 'Tier4' }),
    } },
  BUTTRESS: { cls: 'HAVE_WONDER_PAST_X_ERA', pct: 40, n: 2,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_BUTTRESS', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_WONDER_PAST_X_ERA' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_BUTTRESS', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_BUTTRESS', 'NumItems'),
    } },
  REFINING: { cls: 'HAVE_X_BUILDINGS', pct: 40, n: 1, building: 'COAL_POWER_PLANT',
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_REFINING', 'BoostClass', { expect: 'BOOST_TRIGGER_HAVE_X_BUILDINGS' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_REFINING', 'Boost'),
      'n': xml('Boosts', 'TechnologyType=TECH_REFINING', 'NumItems'),
      'building': xml('Boosts', 'TechnologyType=TECH_REFINING', 'BuildingType', { expect: 'BUILDING_COAL_POWER_PLANT' }),
    } },
  SEASTEADS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SEASTEADS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SEASTEADS', 'Boost'),
    } },
  ADVANCED_AI: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ADVANCED_AI', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ADVANCED_AI', 'Boost'),
    } },
  ADVANCED_POWER_CELLS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_ADVANCED_POWER_CELLS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_ADVANCED_POWER_CELLS', 'Boost'),
    } },
  CYBERNETICS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_CYBERNETICS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_CYBERNETICS', 'Boost'),
    } },
  SMART_MATERIALS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_SMART_MATERIALS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_SMART_MATERIALS', 'Boost'),
    } },
  PREDICTIVE_SYSTEMS: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_PREDICTIVE_SYSTEMS', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_PREDICTIVE_SYSTEMS', 'Boost'),
    } },
  OFFWORLD_MISSION: { cls: 'NONE_LATE_GAME_CRITICAL_TECH', pct: 40,
    src: {
      'cls': xml('Boosts', 'TechnologyType=TECH_OFFWORLD_MISSION', 'BoostClass', { expect: 'BOOST_TRIGGER_NONE_LATE_GAME_CRITICAL_TECH' }),
      'pct': xml('Boosts', 'TechnologyType=TECH_OFFWORLD_MISSION', 'Boost'),
    } },
};

/** The technologies and civics that carry no `Boosts` row in the install —
 *  the rows no trigger lands on and the random boost pickers never offer
 *  (the DLL's 0x4ca470 / 0x4caa50 and their civic twins pool only boostable
 *  rows). */
const BOOSTLESS_TECHS = ['POTTERY', 'ANIMAL_HUSBANDRY', 'MINING', 'FUTURE_TECH'] as const;
const BOOSTLESS_CIVICS = [
  'CODE_OF_LAWS', 'IDEOLOGY', 'FUTURE_CIVIC', 'GLOBAL_WARMING_MITIGATION', 'SMART_POWER_DOCTRINE',
  'INFORMATION_WARFARE', 'EXODUS_IMPERATIVE', 'CULTURAL_HEGEMONY',
] as const;
export const BOOSTLESS: ReadonlySet<string> = new Set(srcConst('boosts.boostless', [...BOOSTLESS_TECHS, ...BOOSTLESS_CIVICS], {
  derived: 'the Technologies and Civics rows the layered Boosts table names none of',
  inputs: [
    ...BOOSTLESS_TECHS.map((t) => xml('Boosts', `TechnologyType=TECH_${t}`, 'BoostID', { absent: true })),
    ...BOOSTLESS_CIVICS.map((c) => xml('Boosts', `CivicType=CIVIC_${c}`, 'BoostID', { absent: true })),
  ],
}));
