
import type { Era, ResearchEffect } from './techs';
import { GAME_SPEED } from './constants';

export interface CivicDef {
  id: string;
  name: string;
  era: Era;
  cost: number;
  prereqs: string[];
  effects: ResearchEffect[];
}

const C = (
  id: string,
  name: string,
  era: Era,
  cost: number,
  prereqs: string[],
  effects: ResearchEffect[] = [],
): CivicDef => ({ id, name, era, cost: Math.round(cost * GAME_SPEED), prereqs, effects });

export const CIVICS: Record<string, CivicDef> = Object.fromEntries(
  [
    C('CODE_OF_LAWS', 'Code of Laws', 'Ancient', 20, [], [
      { kind: 'unlockGovernment', government: 'CHIEFDOM' },
      { kind: 'unlockPolicy', policy: 'URBAN_PLANNING' },
      { kind: 'unlockPolicy', policy: 'GOD_KING' },
      // wiring (real Civ 6): Code of Laws also grants Discipline + Survey.
      { kind: 'unlockPolicy', policy: 'DISCIPLINE' },
      { kind: 'unlockPolicy', policy: 'SURVEY' },
    ]),
    C('CRAFTSMANSHIP', 'Craftsmanship', 'Ancient', 40, ['CODE_OF_LAWS'], [
      { kind: 'unlockPolicy', policy: 'AGOGE' },
      { kind: 'unlockPolicy', policy: 'ILKUM' },
    ]),
    C('FOREIGN_TRADE', 'Foreign Trade', 'Ancient', 40, ['CODE_OF_LAWS'], [
      { kind: 'unlockPolicy', policy: 'CARAVANSARIES' },
      { kind: 'unlockPolicy', policy: 'MARITIME_INDUSTRIES' },
    ]),
    C('MILITARY_TRADITION', 'Military Tradition', 'Ancient', 50, ['CRAFTSMANSHIP'], [
      { kind: 'unlockPolicy', policy: 'MANEUVER' },
      { kind: 'unlockPolicy', policy: 'STRATEGOS' },
    ]),
    C('STATE_WORKFORCE', 'State Workforce', 'Ancient', 70, ['CRAFTSMANSHIP'], [
      { kind: 'unlockDistrict', district: 'GOVERNMENT_PLAZA' },
      { kind: 'unlockPolicy', policy: 'CONSCRIPTION' },
      { kind: 'unlockPolicy', policy: 'CORVEE' },
    ]),
    C('EARLY_EMPIRE', 'Early Empire', 'Ancient', 70, ['FOREIGN_TRADE'], [
      { kind: 'unlockPolicy', policy: 'LAND_SURVEYORS' },
      { kind: 'unlockPolicy', policy: 'COLONIZATION' },
    ]),
    C('MYSTICISM', 'Mysticism', 'Ancient', 50, ['FOREIGN_TRADE'], [
      { kind: 'unlockDistrict', district: 'PRESERVE' },
      { kind: 'unlockBuilding', building: 'GROVE' },
      { kind: 'unlockPolicy', policy: 'INSPIRATION' },
      { kind: 'unlockPolicy', policy: 'REVELATION' },
    ]),

    C('GAMES_AND_RECREATION', 'Games and Recreation', 'Classical', 110, ['STATE_WORKFORCE'], [
      { kind: 'unlockDistrict', district: 'ENTERTAINMENT_COMPLEX' },
      { kind: 'unlockBuilding', building: 'ARENA' },
      { kind: 'unlockPolicy', policy: 'INSULAE' },
    ]),
    C('POLITICAL_PHILOSOPHY', 'Political Philosophy', 'Classical', 110, ['STATE_WORKFORCE', 'EARLY_EMPIRE'], [
      { kind: 'unlockGovernment', government: 'AUTOCRACY' },
      { kind: 'unlockGovernment', government: 'OLIGARCHY' },
      { kind: 'unlockGovernment', government: 'CLASSICAL_REPUBLIC' },
      { kind: 'unlockPolicy', policy: 'DIPLOMATIC_LEAGUE' },
      { kind: 'unlockPolicy', policy: 'CHARISMATIC_LEADER' },
    ]),
    C('DRAMA_AND_POETRY', 'Drama and Poetry', 'Classical', 110, ['EARLY_EMPIRE'], [
      { kind: 'unlockDistrict', district: 'THEATER_SQUARE' },
      { kind: 'unlockBuilding', building: 'AMPHITHEATER' },
      { kind: 'unlockPolicy', policy: 'LITERARY_TRADITION' },
    ]),
    C('THEOLOGY', 'Theology', 'Classical', 120, ['DRAMA_AND_POETRY', 'MYSTICISM'], [
      { kind: 'unlockBuilding', building: 'TEMPLE' },
      { kind: 'unlockPolicy', policy: 'SCRIPTURE' },
    ]),
    C('RECORDED_HISTORY', 'Recorded History', 'Classical', 175, ['POLITICAL_PHILOSOPHY', 'DRAMA_AND_POETRY'], [
      { kind: 'unlockPolicy', policy: 'NATURAL_PHILOSOPHY' },
    ]),
    C('NAVAL_TRADITION', 'Naval Tradition', 'Medieval', 220, ['DEFENSIVE_TACTICS'], [
      { kind: 'unlockPolicy', policy: 'NAVAL_INFRASTRUCTURE' },
    ]),

    C('FEUDALISM', 'Feudalism', 'Medieval', 300, ['DEFENSIVE_TACTICS'], [
      { kind: 'farmAdjacency' },
      { kind: 'unlockPolicy', policy: 'FEUDAL_CONTRACT' },
      { kind: 'unlockPolicy', policy: 'SERFDOM' },
    ]),
    C('CIVIL_SERVICE', 'Civil Service', 'Medieval', 300, ['DEFENSIVE_TACTICS', 'RECORDED_HISTORY'], []),
    C('GUILDS', 'Guilds', 'Medieval', 420, ['FEUDALISM', 'CIVIL_SERVICE'], [
      { kind: 'unlockPolicy', policy: 'TOWN_CHARTERS' },
      { kind: 'unlockPolicy', policy: 'CRAFTSMEN' },
    ]),
    C('MEDIEVAL_FAIRES', 'Medieval Faires', 'Medieval', 420, ['FEUDALISM'], [
      { kind: 'unlockPolicy', policy: 'AESTHETICS' },
      { kind: 'unlockPolicy', policy: 'MEDINA_QUARTER' },
    ]),
    C('DIVINE_RIGHT', 'Divine Right', 'Medieval', 340, ['CIVIL_SERVICE', 'THEOLOGY'], [
      { kind: 'unlockGovernment', government: 'MONARCHY' },
      { kind: 'unlockPolicy', policy: 'CHIVALRY' },
      { kind: 'unlockPolicy', policy: 'GOTHIC_ARCHITECTURE' },
    ]),

    C('EXPLORATION', 'Exploration', 'Renaissance', 440, ['MERCENARIES', 'MEDIEVAL_FAIRES'], [
      { kind: 'unlockGovernment', government: 'MERCHANT_REPUBLIC' },
    ]),
    C('REFORMED_CHURCH', 'Reformed Church', 'Renaissance', 440, ['GUILDS', 'DIVINE_RIGHT'], [
      { kind: 'unlockGovernment', government: 'THEOCRACY' },
      { kind: 'unlockPolicy', policy: 'SIMULTANEUM' },
    ]),
    C('HUMANISM', 'Humanism', 'Renaissance', 600, ['MEDIEVAL_FAIRES', 'GUILDS'], [
      { kind: 'unlockBuilding', building: 'MUSEUM' },
      // Real Civ 6 unlocks BOTH museums with Humanism — the Art Museum and
      // the Archaeological Museum are the same choice point. A building with
      // no unlock at all is worse than wrong: TS omits it from
      // `unlocks.buildings` while the GPU reads unlockTech -1 as "always
      // available", so the two engines disagreed — and it surfaced as a
      // treasury/culture divergence at t193, mentioning no museum anywhere.
      { kind: 'unlockBuilding', building: 'ARCHAEOLOGICAL_MUSEUM' },
    ]),
    C('ENLIGHTENMENT', 'The Enlightenment', 'Renaissance', 720, ['HUMANISM', 'DIPLOMATIC_SERVICE'], [
      { kind: 'unlockPolicy', policy: 'RATIONALISM' },
      { kind: 'unlockPolicy', policy: 'FREE_MARKETS' },
      { kind: 'unlockPolicy', policy: 'LIBERALISM' },
    ]),

    C('CIVIL_ENGINEERING', 'Civil Engineering', 'Industrial', 1010, ['MERCANTILISM'], [
      { kind: 'hillFarms' },
      { kind: 'unlockPolicy', policy: 'PUBLIC_WORKS' },
      { kind: 'unlockPolicy', policy: 'SKYSCRAPERS' },
    ]),
    C('NATIONALISM', 'Nationalism', 'Industrial', 1010, ['ENLIGHTENMENT']),
    C('NATURAL_HISTORY', 'Natural History', 'Industrial', 1050, ['COLONIALISM'], [
      { kind: 'unlockBuilding', building: 'ZOO' },
      { kind: 'unlockDistrict', district: 'WATER_PARK' },
      { kind: 'unlockBuilding', building: 'FERRIS_WHEEL' },
      { kind: 'unlockBuilding', building: 'AQUARIUM' },
    ]),
    C('URBANIZATION', 'Urbanization', 'Industrial', 1210, ['CIVIL_ENGINEERING', 'NATIONALISM'], [
      { kind: 'unlockDistrict', district: 'NEIGHBORHOOD' },
    ]),

    C('MASS_MEDIA', 'Mass Media', 'Modern', 1540, ['NATURAL_HISTORY', 'URBANIZATION']),
    C('PROFESSIONAL_SPORTS', 'Professional Sports', 'Atomic', 2185, ['IDEOLOGY'], [
      { kind: 'unlockBuilding', building: 'STADIUM' },
      { kind: 'unlockBuilding', building: 'AQUATICS_CENTER' },
    ]),
    C('SUFFRAGE', 'Suffrage', 'Modern', 1640, ['IDEOLOGY'], [
      { kind: 'unlockGovernment', government: 'DEMOCRACY' },
      { kind: 'unlockPolicy', policy: 'NEW_DEAL' },
      { kind: 'unlockPolicy', policy: 'ECONOMIC_UNION' },
    ]),
    C('CLASS_STRUGGLE', 'Class Struggle', 'Modern', 1640, ['IDEOLOGY'], [
      { kind: 'unlockGovernment', government: 'COMMUNISM' },
      { kind: 'unlockPolicy', policy: 'FIVE_YEAR_PLAN' },
    ]),
    C('TOTALITARIANISM', 'Totalitarianism', 'Modern', 1640, ['IDEOLOGY'], [
      { kind: 'unlockGovernment', government: 'FASCISM' },
    ]),


    C('MILITARY_TRAINING', 'Military Training', 'Classical', 120, ['MILITARY_TRADITION', 'GAMES_AND_RECREATION'], [
      { kind: 'unlockPolicy', policy: 'VETERANCY' },
    ]),
    C('DEFENSIVE_TACTICS', 'Defensive Tactics', 'Classical', 175, ['GAMES_AND_RECREATION'], [
      { kind: 'unlockPolicy', policy: 'BASTIONS' },
    ]),

    C('MERCENARIES', 'Mercenaries', 'Medieval', 340, ['MILITARY_TRAINING', 'FEUDALISM']),

    C('MERCANTILISM', 'Mercantilism', 'Renaissance', 720, ['HUMANISM']),
    C('DIPLOMATIC_SERVICE', 'Diplomatic Service', 'Renaissance', 600, ['GUILDS'], [
      { kind: 'unlockBuilding', building: 'CHANCERY' },
    ]),

    C('OPERA_AND_BALLET', 'Opera and Ballet', 'Industrial', 800, ['ENLIGHTENMENT'], [
      { kind: 'unlockPolicy', policy: 'GRAND_OPERA' },
    ]),
    C('COLONIALISM', 'Colonialism', 'Industrial', 800, ['MERCANTILISM']),
    C('CONSERVATION', 'Conservation', 'Modern', 1540, ['NATURAL_HISTORY'], [
      { kind: 'unlockBuilding', building: 'SANCTUARY' },
    ]),

    C('SCORCHED_EARTH', 'Scorched Earth', 'Industrial', 1210, ['NATIONALISM'], [
      { kind: 'unlockPolicy', policy: 'TOTAL_WAR' },
    ]),
    C('MOBILIZATION', 'Mobilization', 'Modern', 1540, ['URBANIZATION', 'SCORCHED_EARTH'], [
      { kind: 'unlockPolicy', policy: 'LEVEE_EN_MASSE' },
    ]),
    C('IDEOLOGY', 'Ideology', 'Modern', 1640, ['MASS_MEDIA', 'MOBILIZATION']),
    C('NUCLEAR_PROGRAM', 'Nuclear Program', 'Modern', 1715, ['IDEOLOGY']),
    C('CAPITALISM', 'Capitalism', 'Modern', 1580, ['MASS_MEDIA']),
    C('CULTURAL_HERITAGE', 'Cultural Heritage', 'Atomic', 1955, ['CONSERVATION']),

    C('COLD_WAR', 'Cold War', 'Atomic', 2185, ['IDEOLOGY'], [
      { kind: 'unlockPolicy', policy: 'CONTAINMENT' },
    ]),
    C('SPACE_RACE', 'Space Race', 'Atomic', 2415, ['COLD_WAR']),
    C('RAPID_DEPLOYMENT', 'Rapid Deployment', 'Atomic', 2415, ['COLD_WAR'], [
      { kind: 'unlockPolicy', policy: 'MILITARY_FIRST' },
    ]),
    C('ENVIRONMENTALISM', 'Environmentalism', 'Information', 2880, ['CULTURAL_HERITAGE', 'RAPID_DEPLOYMENT']),

    C('GLOBALIZATION', 'Globalization', 'Information', 2880, ['RAPID_DEPLOYMENT', 'SPACE_RACE']),
    C('SOCIAL_MEDIA', 'Social Media', 'Information', 2880, ['SPACE_RACE', 'PROFESSIONAL_SPORTS'], [
      { kind: 'unlockPolicy', policy: 'COLLECTIVE_ACTIVISM' },
      { kind: 'unlockPolicy', policy: 'ONLINE_COMMUNITIES' },
    ]),
    C('NEAR_FUTURE_GOVERNANCE', 'Near Future Governance', 'Information', 3100, ['ENVIRONMENTALISM', 'GLOBALIZATION']),
    // CIV6: Information Warfare's only published gate is the Future ERA; its
    // real parents are Future civics this tree does not carry, so the deepest
    // Information-era civic stands in as the prereq.
    C('INFORMATION_WARFARE', 'Information Warfare', 'Future', 3200, ['NEAR_FUTURE_GOVERNANCE']),
    // CIV6 (Global Warming Mitigation): a Future civic that "unlocks the
    // Carbon Recapture project and awards 3 Envoys and 1 Diplomatic Victory
    // point".
    C('GLOBAL_WARMING_MITIGATION', 'Global Warming Mitigation', 'Future', 3200, ['NEAR_FUTURE_GOVERNANCE']),
  ].map((c) => [c.id, c]),
);
