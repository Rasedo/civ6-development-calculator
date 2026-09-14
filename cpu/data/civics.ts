
import type { Era, ResearchEffect } from './techs';
import { GAME_SPEED } from './constants';
import { xml, type SrcMap } from './provenance';

export interface CivicDef {
  id: string;
  name: string;
  era: Era;
  cost: number;
  prereqs: string[];
  effects: ResearchEffect[];
  /** PROVENANCE, per column — see CIVIC_SRC below. */
  src?: SrcMap;
}

/** PROVENANCE (cpu/data/provenance.ts), keyed by row id and attached by the row
 *  builder below — these rows are built through a positional helper, so the tag
 *  cannot ride inside the call. Stripped by the exporter; checked by
 *  tools/civ6lab/xml_check.py. */
const CIVIC_SRC: Readonly<Record<string, SrcMap>> = {
  CODE_OF_LAWS: {
    era: xml('Civics', 'CivicType=CIVIC_CODE_OF_LAWS', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_CODE_OF_LAWS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no CivicPrereqs row for CIVIC_CODE_OF_LAWS' },
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_CHIEFDOM', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_URBAN_PLANNING', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_GOD_KING', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.3.policy': xml('Policies', 'PolicyType=POLICY_DISCIPLINE', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.4.policy': xml('Policies', 'PolicyType=POLICY_SURVEY', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
  },
  CRAFTSMANSHIP: {
    era: xml('Civics', 'CivicType=CIVIC_CRAFTSMANSHIP', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_CRAFTSMANSHIP', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CRAFTSMANSHIP&PrereqCivic=CIVIC_CODE_OF_LAWS', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_SPHINX', 'PrereqCivic', { expect: 'CIVIC_CRAFTSMANSHIP' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_AGOGE', 'PrereqCivic', { expect: 'CIVIC_CRAFTSMANSHIP' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_ILKUM', 'PrereqCivic', { expect: 'CIVIC_CRAFTSMANSHIP' }),
  },
  FOREIGN_TRADE: {
    era: xml('Civics', 'CivicType=CIVIC_FOREIGN_TRADE', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_FOREIGN_TRADE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_FOREIGN_TRADE&PrereqCivic=CIVIC_CODE_OF_LAWS', 'PrereqCivic', { expect: 'CIVIC_CODE_OF_LAWS' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_CARAVANSARIES', 'PrereqCivic', { expect: 'CIVIC_FOREIGN_TRADE' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_MARITIME_INDUSTRIES', 'PrereqCivic', { expect: 'CIVIC_FOREIGN_TRADE' }),
  },
  MILITARY_TRADITION: {
    era: xml('Civics', 'CivicType=CIVIC_MILITARY_TRADITION', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_MILITARY_TRADITION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_MILITARY_TRADITION&PrereqCivic=CIVIC_CRAFTSMANSHIP', 'PrereqCivic', { expect: 'CIVIC_CRAFTSMANSHIP' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_MANEUVER', 'PrereqCivic', { expect: 'CIVIC_MILITARY_TRADITION' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_STRATEGOS', 'PrereqCivic', { expect: 'CIVIC_MILITARY_TRADITION' }),
  },
  STATE_WORKFORCE: {
    era: xml('Civics', 'CivicType=CIVIC_STATE_WORKFORCE', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_STATE_WORKFORCE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_STATE_WORKFORCE&PrereqCivic=CIVIC_CRAFTSMANSHIP', 'PrereqCivic', { expect: 'CIVIC_CRAFTSMANSHIP' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_CONSCRIPTION', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_CORVEE', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }),
  },
  EARLY_EMPIRE: {
    era: xml('Civics', 'CivicType=CIVIC_EARLY_EMPIRE', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_EARLY_EMPIRE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_EARLY_EMPIRE&PrereqCivic=CIVIC_FOREIGN_TRADE', 'PrereqCivic', { expect: 'CIVIC_FOREIGN_TRADE' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_LAND_SURVEYORS', 'PrereqCivic', { expect: 'CIVIC_EARLY_EMPIRE' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_COLONIZATION', 'PrereqCivic', { expect: 'CIVIC_EARLY_EMPIRE' }),
  },
  MYSTICISM: {
    era: xml('Civics', 'CivicType=CIVIC_MYSTICISM', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Civics', 'CivicType=CIVIC_MYSTICISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_MYSTICISM&PrereqCivic=CIVIC_FOREIGN_TRADE', 'PrereqCivic', { expect: 'CIVIC_FOREIGN_TRADE' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_GROVE', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_INSPIRATION', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
    'effects.3.policy': xml('Policies', 'PolicyType=POLICY_REVELATION', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
  },
  GAMES_AND_RECREATION: {
    era: xml('Civics', 'CivicType=CIVIC_GAMES_RECREATION', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_GAMES_RECREATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_GAMES_RECREATION&PrereqCivic=CIVIC_STATE_WORKFORCE', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_CITY_PARK', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
    'effects.1.district': xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
    'effects.2.building': xml('Buildings', 'BuildingType=BUILDING_ARENA', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
    'effects.3.policy': xml('Policies', 'PolicyType=POLICY_INSULAE', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
  },
  POLITICAL_PHILOSOPHY: {
    era: xml('Civics', 'CivicType=CIVIC_POLITICAL_PHILOSOPHY', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_POLITICAL_PHILOSOPHY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_POLITICAL_PHILOSOPHY, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_POLITICAL_PHILOSOPHY&PrereqCivic=CIVIC_STATE_WORKFORCE', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }), xml('CivicPrereqs', 'Civic=CIVIC_POLITICAL_PHILOSOPHY&PrereqCivic=CIVIC_EARLY_EMPIRE', 'PrereqCivic', { expect: 'CIVIC_EARLY_EMPIRE' })] },
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_AUTOCRACY', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
    'effects.1.government': xml('Governments', 'GovernmentType=GOVERNMENT_OLIGARCHY', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
    'effects.2.government': xml('Governments', 'GovernmentType=GOVERNMENT_CLASSICAL_REPUBLIC', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
    'effects.3.policy': xml('Policies', 'PolicyType=POLICY_DIPLOMATIC_LEAGUE', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
    'effects.4.policy': xml('Policies', 'PolicyType=POLICY_CHARISMATIC_LEADER', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
  },
  DRAMA_AND_POETRY: {
    era: xml('Civics', 'CivicType=CIVIC_DRAMA_POETRY', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_DRAMA_POETRY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_DRAMA_POETRY&PrereqCivic=CIVIC_EARLY_EMPIRE', 'PrereqCivic', { expect: 'CIVIC_EARLY_EMPIRE' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_THEATER', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_AMPHITHEATER', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_LITERARY_TRADITION', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' }),
  },
  THEOLOGY: {
    era: xml('Civics', 'CivicType=CIVIC_THEOLOGY', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_THEOLOGY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_THEOLOGY, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_THEOLOGY&PrereqCivic=CIVIC_DRAMA_POETRY', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' }), xml('CivicPrereqs', 'Civic=CIVIC_THEOLOGY&PrereqCivic=CIVIC_MYSTICISM', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_TEMPLE', 'PrereqCivic', { expect: 'CIVIC_THEOLOGY' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_SCRIPTURE', 'PrereqCivic', { expect: 'CIVIC_THEOLOGY' }),
  },
  RECORDED_HISTORY: {
    era: xml('Civics', 'CivicType=CIVIC_RECORDED_HISTORY', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_RECORDED_HISTORY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_RECORDED_HISTORY, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_RECORDED_HISTORY&PrereqCivic=CIVIC_POLITICAL_PHILOSOPHY', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }), xml('CivicPrereqs', 'Civic=CIVIC_RECORDED_HISTORY&PrereqCivic=CIVIC_DRAMA_POETRY', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_NATURAL_PHILOSOPHY', 'PrereqCivic', { expect: 'CIVIC_RECORDED_HISTORY' }),
  },
  NAVAL_TRADITION: {
    era: xml('Civics', 'CivicType=CIVIC_NAVAL_TRADITION', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_NAVAL_TRADITION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_NAVAL_TRADITION&PrereqCivic=CIVIC_DEFENSIVE_TACTICS', 'PrereqCivic', { expect: 'CIVIC_DEFENSIVE_TACTICS' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_NAVAL_INFRASTRUCTURE', 'PrereqCivic', { expect: 'CIVIC_NAVAL_TRADITION' }),
  },
  FEUDALISM: {
    era: xml('Civics', 'CivicType=CIVIC_FEUDALISM', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_FEUDALISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_FEUDALISM&PrereqCivic=CIVIC_DEFENSIVE_TACTICS', 'PrereqCivic', { expect: 'CIVIC_DEFENSIVE_TACTICS' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_FEUDAL_CONTRACT', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_SERFDOM', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
  },
  CIVIL_SERVICE: {
    era: xml('Civics', 'CivicType=CIVIC_CIVIL_SERVICE', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_CIVIL_SERVICE', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_CIVIL_SERVICE, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_CIVIL_SERVICE&PrereqCivic=CIVIC_DEFENSIVE_TACTICS', 'PrereqCivic', { expect: 'CIVIC_DEFENSIVE_TACTICS' }), xml('CivicPrereqs', 'Civic=CIVIC_CIVIL_SERVICE&PrereqCivic=CIVIC_RECORDED_HISTORY', 'PrereqCivic', { expect: 'CIVIC_RECORDED_HISTORY' })] },
  },
  GUILDS: {
    era: xml('Civics', 'CivicType=CIVIC_GUILDS', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_GUILDS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_GUILDS, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_GUILDS&PrereqCivic=CIVIC_FEUDALISM', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }), xml('CivicPrereqs', 'Civic=CIVIC_GUILDS&PrereqCivic=CIVIC_CIVIL_SERVICE', 'PrereqCivic', { expect: 'CIVIC_CIVIL_SERVICE' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_TOWN_CHARTERS', 'PrereqCivic', { expect: 'CIVIC_GUILDS' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_CRAFTSMEN', 'PrereqCivic', { expect: 'CIVIC_GUILDS' }),
  },
  MEDIEVAL_FAIRES: {
    era: xml('Civics', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_MEDIEVAL_FAIRES', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_MEDIEVAL_FAIRES&PrereqCivic=CIVIC_FEUDALISM', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_AESTHETICS', 'PrereqCivic', { expect: 'CIVIC_MEDIEVAL_FAIRES' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_MEDINA_QUARTER', 'PrereqCivic', { expect: 'CIVIC_MEDIEVAL_FAIRES' }),
  },
  DIVINE_RIGHT: {
    era: xml('Civics', 'CivicType=CIVIC_DIVINE_RIGHT', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_DIVINE_RIGHT', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_DIVINE_RIGHT, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_DIVINE_RIGHT&PrereqCivic=CIVIC_CIVIL_SERVICE', 'PrereqCivic', { expect: 'CIVIC_CIVIL_SERVICE' }), xml('CivicPrereqs', 'Civic=CIVIC_DIVINE_RIGHT&PrereqCivic=CIVIC_THEOLOGY', 'PrereqCivic', { expect: 'CIVIC_THEOLOGY' })] },
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_MONARCHY', 'PrereqCivic', { expect: 'CIVIC_DIVINE_RIGHT' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_CHIVALRY', 'PrereqCivic', { expect: 'CIVIC_DIVINE_RIGHT' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_GOTHIC_ARCHITECTURE', 'PrereqCivic', { expect: 'CIVIC_DIVINE_RIGHT' }),
  },
  EXPLORATION: {
    era: xml('Civics', 'CivicType=CIVIC_EXPLORATION', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_EXPLORATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_EXPLORATION, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_EXPLORATION&PrereqCivic=CIVIC_MERCENARIES', 'PrereqCivic', { expect: 'CIVIC_MERCENARIES' }), xml('CivicPrereqs', 'Civic=CIVIC_EXPLORATION&PrereqCivic=CIVIC_MEDIEVAL_FAIRES', 'PrereqCivic', { expect: 'CIVIC_MEDIEVAL_FAIRES' })] },
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_MERCHANT_REPUBLIC', 'PrereqCivic', { expect: 'CIVIC_EXPLORATION' }),
  },
  REFORMED_CHURCH: {
    era: xml('Civics', 'CivicType=CIVIC_REFORMED_CHURCH', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_REFORMED_CHURCH', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_REFORMED_CHURCH, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_REFORMED_CHURCH&PrereqCivic=CIVIC_GUILDS', 'PrereqCivic', { expect: 'CIVIC_GUILDS' }), xml('CivicPrereqs', 'Civic=CIVIC_REFORMED_CHURCH&PrereqCivic=CIVIC_DIVINE_RIGHT', 'PrereqCivic', { expect: 'CIVIC_DIVINE_RIGHT' })] },
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_THEOCRACY', 'PrereqCivic', { expect: 'CIVIC_REFORMED_CHURCH' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_SIMULTANEUM', 'PrereqCivic', { expect: 'CIVIC_REFORMED_CHURCH' }),
  },
  HUMANISM: {
    era: xml('Civics', 'CivicType=CIVIC_HUMANISM', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_HUMANISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_HUMANISM, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_HUMANISM&PrereqCivic=CIVIC_MEDIEVAL_FAIRES', 'PrereqCivic', { expect: 'CIVIC_MEDIEVAL_FAIRES' }), xml('CivicPrereqs', 'Civic=CIVIC_HUMANISM&PrereqCivic=CIVIC_GUILDS', 'PrereqCivic', { expect: 'CIVIC_GUILDS' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ART', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ARTIFACT', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }),
  },
  ENLIGHTENMENT: {
    era: xml('Civics', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_THE_ENLIGHTENMENT, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_THE_ENLIGHTENMENT&PrereqCivic=CIVIC_HUMANISM', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }), xml('CivicPrereqs', 'Civic=CIVIC_THE_ENLIGHTENMENT&PrereqCivic=CIVIC_DIPLOMATIC_SERVICE', 'PrereqCivic', { expect: 'CIVIC_DIPLOMATIC_SERVICE' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_RATIONALISM', 'PrereqCivic', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_FREE_MARKET', 'PrereqCivic', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_LIBERALISM', 'PrereqCivic', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
  },
  CIVIL_ENGINEERING: {
    era: xml('Civics', 'CivicType=CIVIC_CIVIL_ENGINEERING', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_CIVIL_ENGINEERING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CIVIL_ENGINEERING&PrereqCivic=CIVIC_MERCANTILISM', 'PrereqCivic', { expect: 'CIVIC_MERCANTILISM' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_PUBLIC_WORKS', 'PrereqCivic', { expect: 'CIVIC_CIVIL_ENGINEERING' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_SKYSCRAPERS', 'PrereqCivic', { expect: 'CIVIC_CIVIL_ENGINEERING' }),
  },
  NATIONALISM: {
    era: xml('Civics', 'CivicType=CIVIC_NATIONALISM', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_NATIONALISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_NATIONALISM&PrereqCivic=CIVIC_THE_ENLIGHTENMENT', 'PrereqCivic', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
  },
  NATURAL_HISTORY: {
    era: xml('Civics', 'CivicType=CIVIC_NATURAL_HISTORY', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_NATURAL_HISTORY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_NATURAL_HISTORY&PrereqCivic=CIVIC_COLONIALISM', 'PrereqCivic', { expect: 'CIVIC_COLONIALISM' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_ZOO', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
    'effects.1.district': xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
    'effects.2.building': xml('Buildings', 'BuildingType=BUILDING_FERRIS_WHEEL', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
    'effects.3.building': xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
    'effects.4.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_SPHINX&YieldType=YIELD_CULTURE&PrereqCivic=CIVIC_NATURAL_HISTORY', 'ImprovementType', { expect: 'IMPROVEMENT_SPHINX' }),
    'effects.4.yields.culture': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_SPHINX&YieldType=YIELD_CULTURE&PrereqCivic=CIVIC_NATURAL_HISTORY', 'BonusYieldChange'),
    'effects.5.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_ZIGGURAT&YieldType=YIELD_CULTURE&PrereqCivic=CIVIC_NATURAL_HISTORY', 'ImprovementType', { expect: 'IMPROVEMENT_ZIGGURAT' }),
    'effects.5.yields.culture': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_ZIGGURAT&YieldType=YIELD_CULTURE&PrereqCivic=CIVIC_NATURAL_HISTORY', 'BonusYieldChange'),
  },
  URBANIZATION: {
    era: xml('Civics', 'CivicType=CIVIC_URBANIZATION', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_URBANIZATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_URBANIZATION, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_URBANIZATION&PrereqCivic=CIVIC_CIVIL_ENGINEERING', 'PrereqCivic', { expect: 'CIVIC_CIVIL_ENGINEERING' }), xml('CivicPrereqs', 'Civic=CIVIC_URBANIZATION&PrereqCivic=CIVIC_NATIONALISM', 'PrereqCivic', { expect: 'CIVIC_NATIONALISM' })] },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'PrereqCivic', { expect: 'CIVIC_URBANIZATION' }),
  },
  MASS_MEDIA: {
    era: xml('Civics', 'CivicType=CIVIC_MASS_MEDIA', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_MASS_MEDIA', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_MASS_MEDIA, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_MASS_MEDIA&PrereqCivic=CIVIC_NATURAL_HISTORY', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }), xml('CivicPrereqs', 'Civic=CIVIC_MASS_MEDIA&PrereqCivic=CIVIC_URBANIZATION', 'PrereqCivic', { expect: 'CIVIC_URBANIZATION' })] },
  },
  PROFESSIONAL_SPORTS: {
    era: xml('Civics', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Civics', 'CivicType=CIVIC_PROFESSIONAL_SPORTS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_PROFESSIONAL_SPORTS&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'PrereqCivic', { expect: 'CIVIC_PROFESSIONAL_SPORTS' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'PrereqCivic', { expect: 'CIVIC_PROFESSIONAL_SPORTS' }),
  },
  SUFFRAGE: {
    era: xml('Civics', 'CivicType=CIVIC_SUFFRAGE', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_SUFFRAGE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_SUFFRAGE&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_DEMOCRACY', 'PrereqCivic', { expect: 'CIVIC_SUFFRAGE' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_NEW_DEAL', 'PrereqCivic', { expect: 'CIVIC_SUFFRAGE' }),
    'effects.2.policy': xml('Policies', 'PolicyType=POLICY_ECONOMIC_UNION', 'PrereqCivic', { expect: 'CIVIC_SUFFRAGE' }),
  },
  CLASS_STRUGGLE: {
    era: xml('Civics', 'CivicType=CIVIC_CLASS_STRUGGLE', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_CLASS_STRUGGLE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CLASS_STRUGGLE&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_COMMUNISM', 'PrereqCivic', { expect: 'CIVIC_CLASS_STRUGGLE' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_FIVE_YEAR_PLAN', 'PrereqCivic', { expect: 'CIVIC_CLASS_STRUGGLE' }),
  },
  TOTALITARIANISM: {
    era: xml('Civics', 'CivicType=CIVIC_TOTALITARIANISM', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_TOTALITARIANISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_TOTALITARIANISM&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
    'effects.0.government': xml('Governments', 'GovernmentType=GOVERNMENT_FASCISM', 'PrereqCivic', { expect: 'CIVIC_TOTALITARIANISM' }),
  },
  MILITARY_TRAINING: {
    era: xml('Civics', 'CivicType=CIVIC_MILITARY_TRAINING', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_MILITARY_TRAINING', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_MILITARY_TRAINING, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_MILITARY_TRAINING&PrereqCivic=CIVIC_MILITARY_TRADITION', 'PrereqCivic', { expect: 'CIVIC_MILITARY_TRADITION' }), xml('CivicPrereqs', 'Civic=CIVIC_MILITARY_TRAINING&PrereqCivic=CIVIC_GAMES_RECREATION', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_VETERANCY', 'PrereqCivic', { expect: 'CIVIC_MILITARY_TRAINING' }),
  },
  DEFENSIVE_TACTICS: {
    era: xml('Civics', 'CivicType=CIVIC_DEFENSIVE_TACTICS', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_DEFENSIVE_TACTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_DEFENSIVE_TACTICS&PrereqCivic=CIVIC_GAMES_RECREATION', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_BASTIONS', 'PrereqCivic', { expect: 'CIVIC_DEFENSIVE_TACTICS' }),
  },
  MERCENARIES: {
    era: xml('Civics', 'CivicType=CIVIC_MERCENARIES', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_MERCENARIES', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_MERCENARIES, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_MERCENARIES&PrereqCivic=CIVIC_MILITARY_TRAINING', 'PrereqCivic', { expect: 'CIVIC_MILITARY_TRAINING' }), xml('CivicPrereqs', 'Civic=CIVIC_MERCENARIES&PrereqCivic=CIVIC_FEUDALISM', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' })] },
  },
  MERCANTILISM: {
    era: xml('Civics', 'CivicType=CIVIC_MERCANTILISM', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_MERCANTILISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_MERCANTILISM&PrereqCivic=CIVIC_HUMANISM', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }),
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_PRODUCTION&PrereqCivic=CIVIC_MERCANTILISM', 'ImprovementType', { expect: 'IMPROVEMENT_CAMP' }),
    'effects.0.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_PRODUCTION&PrereqCivic=CIVIC_MERCANTILISM', 'BonusYieldChange'),
    'effects.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_FOOD&PrereqCivic=CIVIC_MERCANTILISM', 'BonusYieldChange'),
  },
  DIPLOMATIC_SERVICE: {
    era: xml('Civics', 'CivicType=CIVIC_DIPLOMATIC_SERVICE', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Civics', 'CivicType=CIVIC_DIPLOMATIC_SERVICE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_DIPLOMATIC_SERVICE&PrereqCivic=CIVIC_GUILDS', 'PrereqCivic', { expect: 'CIVIC_GUILDS' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_CHANCERY', 'PrereqCivic', { expect: 'CIVIC_DIPLOMATIC_SERVICE' }),
  },
  OPERA_AND_BALLET: {
    era: xml('Civics', 'CivicType=CIVIC_OPERA_BALLET', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_OPERA_BALLET', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_OPERA_BALLET&PrereqCivic=CIVIC_THE_ENLIGHTENMENT', 'PrereqCivic', { expect: 'CIVIC_THE_ENLIGHTENMENT' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_GRAND_OPERA', 'PrereqCivic', { expect: 'CIVIC_OPERA_BALLET' }),
  },
  COLONIALISM: {
    era: xml('Civics', 'CivicType=CIVIC_COLONIALISM', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_COLONIALISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_COLONIALISM&PrereqCivic=CIVIC_MERCANTILISM', 'PrereqCivic', { expect: 'CIVIC_MERCANTILISM' }),
  },
  CONSERVATION: {
    era: xml('Civics', 'CivicType=CIVIC_CONSERVATION', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_CONSERVATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CONSERVATION&PrereqCivic=CIVIC_NATURAL_HISTORY', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_SANCTUARY', 'PrereqCivic', { expect: 'CIVIC_CONSERVATION' }),
  },
  SCORCHED_EARTH: {
    era: xml('Civics', 'CivicType=CIVIC_SCORCHED_EARTH', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Civics', 'CivicType=CIVIC_SCORCHED_EARTH', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_SCORCHED_EARTH&PrereqCivic=CIVIC_NATIONALISM', 'PrereqCivic', { expect: 'CIVIC_NATIONALISM' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_TOTAL_WAR', 'PrereqCivic', { expect: 'CIVIC_SCORCHED_EARTH' }),
  },
  MOBILIZATION: {
    era: xml('Civics', 'CivicType=CIVIC_MOBILIZATION', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_MOBILIZATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_MOBILIZATION, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_MOBILIZATION&PrereqCivic=CIVIC_URBANIZATION', 'PrereqCivic', { expect: 'CIVIC_URBANIZATION' }), xml('CivicPrereqs', 'Civic=CIVIC_MOBILIZATION&PrereqCivic=CIVIC_SCORCHED_EARTH', 'PrereqCivic', { expect: 'CIVIC_SCORCHED_EARTH' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_LEVEE_EN_MASSE', 'PrereqCivic', { expect: 'CIVIC_MOBILIZATION' }),
  },
  IDEOLOGY: {
    era: xml('Civics', 'CivicType=CIVIC_IDEOLOGY', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_IDEOLOGY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_IDEOLOGY, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_IDEOLOGY&PrereqCivic=CIVIC_MASS_MEDIA', 'PrereqCivic', { expect: 'CIVIC_MASS_MEDIA' }), xml('CivicPrereqs', 'Civic=CIVIC_IDEOLOGY&PrereqCivic=CIVIC_MOBILIZATION', 'PrereqCivic', { expect: 'CIVIC_MOBILIZATION' })] },
  },
  NUCLEAR_PROGRAM: {
    era: xml('Civics', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_NUCLEAR_PROGRAM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_NUCLEAR_PROGRAM&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
  },
  CAPITALISM: {
    era: xml('Civics', 'CivicType=CIVIC_CAPITALISM', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Civics', 'CivicType=CIVIC_CAPITALISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CAPITALISM&PrereqCivic=CIVIC_MASS_MEDIA', 'PrereqCivic', { expect: 'CIVIC_MASS_MEDIA' }),
  },
  CULTURAL_HERITAGE: {
    era: xml('Civics', 'CivicType=CIVIC_CULTURAL_HERITAGE', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Civics', 'CivicType=CIVIC_CULTURAL_HERITAGE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_CULTURAL_HERITAGE&PrereqCivic=CIVIC_CONSERVATION', 'PrereqCivic', { expect: 'CIVIC_CONSERVATION' }),
  },
  COLD_WAR: {
    era: xml('Civics', 'CivicType=CIVIC_COLD_WAR', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Civics', 'CivicType=CIVIC_COLD_WAR', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_COLD_WAR&PrereqCivic=CIVIC_IDEOLOGY', 'PrereqCivic', { expect: 'CIVIC_IDEOLOGY' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_CONTAINMENT', 'PrereqCivic', { expect: 'CIVIC_COLD_WAR' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_SECOND_STRIKE_CAPABILITY', 'PrereqCivic', { expect: 'CIVIC_COLD_WAR' }),
  },
  SPACE_RACE: {
    era: xml('Civics', 'CivicType=CIVIC_SPACE_RACE', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Civics', 'CivicType=CIVIC_SPACE_RACE', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_SPACE_RACE&PrereqCivic=CIVIC_COLD_WAR', 'PrereqCivic', { expect: 'CIVIC_COLD_WAR' }),
  },
  RAPID_DEPLOYMENT: {
    era: xml('Civics', 'CivicType=CIVIC_RAPID_DEPLOYMENT', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Civics', 'CivicType=CIVIC_RAPID_DEPLOYMENT', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('CivicPrereqs', 'Civic=CIVIC_RAPID_DEPLOYMENT&PrereqCivic=CIVIC_COLD_WAR', 'PrereqCivic', { expect: 'CIVIC_COLD_WAR' }),
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_MILITARY_FIRST', 'PrereqCivic', { expect: 'CIVIC_RAPID_DEPLOYMENT' }),
  },
  ENVIRONMENTALISM: {
    era: xml('Civics', 'CivicType=CIVIC_ENVIRONMENTALISM', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Civics', 'CivicType=CIVIC_ENVIRONMENTALISM', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_ENVIRONMENTALISM, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_ENVIRONMENTALISM&PrereqCivic=CIVIC_CULTURAL_HERITAGE', 'PrereqCivic', { expect: 'CIVIC_CULTURAL_HERITAGE' }), xml('CivicPrereqs', 'Civic=CIVIC_ENVIRONMENTALISM&PrereqCivic=CIVIC_RAPID_DEPLOYMENT', 'PrereqCivic', { expect: 'CIVIC_RAPID_DEPLOYMENT' })] },
  },
  GLOBALIZATION: {
    era: xml('Civics', 'CivicType=CIVIC_GLOBALIZATION', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Civics', 'CivicType=CIVIC_GLOBALIZATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_GLOBALIZATION, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_GLOBALIZATION&PrereqCivic=CIVIC_RAPID_DEPLOYMENT', 'PrereqCivic', { expect: 'CIVIC_RAPID_DEPLOYMENT' }), xml('CivicPrereqs', 'Civic=CIVIC_GLOBALIZATION&PrereqCivic=CIVIC_SPACE_RACE', 'PrereqCivic', { expect: 'CIVIC_SPACE_RACE' })] },
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PLANTATION&YieldType=YIELD_GOLD&PrereqCivic=CIVIC_GLOBALIZATION', 'ImprovementType', { expect: 'IMPROVEMENT_PLANTATION' }),
    'effects.0.yields.gold': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PLANTATION&YieldType=YIELD_GOLD&PrereqCivic=CIVIC_GLOBALIZATION', 'BonusYieldChange'),
  },
  SOCIAL_MEDIA: {
    era: xml('Civics', 'CivicType=CIVIC_SOCIAL_MEDIA', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Civics', 'CivicType=CIVIC_SOCIAL_MEDIA', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_SOCIAL_MEDIA, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_SOCIAL_MEDIA&PrereqCivic=CIVIC_SPACE_RACE', 'PrereqCivic', { expect: 'CIVIC_SPACE_RACE' }), xml('CivicPrereqs', 'Civic=CIVIC_SOCIAL_MEDIA&PrereqCivic=CIVIC_PROFESSIONAL_SPORTS', 'PrereqCivic', { expect: 'CIVIC_PROFESSIONAL_SPORTS' })] },
    'effects.0.policy': xml('Policies', 'PolicyType=POLICY_COLLECTIVE_ACTIVISM', 'PrereqCivic', { expect: 'CIVIC_SOCIAL_MEDIA' }),
    'effects.1.policy': xml('Policies', 'PolicyType=POLICY_ONLINE_COMMUNITIES', 'PrereqCivic', { expect: 'CIVIC_SOCIAL_MEDIA' }),
  },
  NEAR_FUTURE_GOVERNANCE: {
    era: xml('Civics', 'CivicType=CIVIC_NEAR_FUTURE_GOVERNANCE', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Civics', 'CivicType=CIVIC_NEAR_FUTURE_GOVERNANCE', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the CivicPrereqs rows of CIVIC_NEAR_FUTURE_GOVERNANCE, read as an AND-list', inputs: [xml('CivicPrereqs', 'Civic=CIVIC_NEAR_FUTURE_GOVERNANCE&PrereqCivic=CIVIC_ENVIRONMENTALISM', 'PrereqCivic', { expect: 'CIVIC_ENVIRONMENTALISM' }), xml('CivicPrereqs', 'Civic=CIVIC_NEAR_FUTURE_GOVERNANCE&PrereqCivic=CIVIC_GLOBALIZATION', 'PrereqCivic', { expect: 'CIVIC_GLOBALIZATION' })] },
  },
  INFORMATION_WARFARE: {
    era: xml('Civics', 'CivicType=CIVIC_INFORMATION_WARFARE', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Civics', 'CivicType=CIVIC_INFORMATION_WARFARE', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no CivicPrereqs row for CIVIC_INFORMATION_WARFARE (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  GLOBAL_WARMING_MITIGATION: {
    era: xml('Civics', 'CivicType=CIVIC_GLOBAL_WARMING_MITIGATION', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Civics', 'CivicType=CIVIC_GLOBAL_WARMING_MITIGATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no CivicPrereqs row for CIVIC_GLOBAL_WARMING_MITIGATION (its only published gate is the era); the deepest node this tree carries stands in' },
    'effects.0.envoys': xml('ModifierArguments', 'ModifierId=CIVIC_AWARD_THREE_INFLUENCE_TOKENS&Name=Amount', 'Value'),
    'effects.0.dvp': xml('ModifierArguments', 'ModifierId=CIVIC_MITIGATION_GRANT_DIPLOVP&Name=Amount', 'Value'),
  },
};

const C = (
  id: string,
  name: string,
  era: Era,
  cost: number,
  prereqs: string[],
  effects: ResearchEffect[] = [],
): CivicDef => ({
  id, name, era, cost: Math.round(cost * GAME_SPEED), prereqs, effects,
  ...(CIVIC_SRC[id] ? { src: CIVIC_SRC[id] } : {}),
});

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
      { kind: 'unlockImprovement', improvement: 'SPHINX' }, // CIV6 (Sphinx): PrereqCivic
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
      // CIV6 (IMPROVEMENT_CITY_PARK, PrereqCivic): the CIVIC opens the row;
      // the PARKS_AND_RECREATION governor promotion opens the CITY.
      { kind: 'unlockImprovement', improvement: 'CITY_PARK' },
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
      // CIV6 (Improvement_BonusYieldChanges): the Sphinx and the Ziggurat
      // each gain +1 Culture at Natural History.
      { kind: 'improvementYields', improvement: 'SPHINX', yields: { culture: 1 } },
      { kind: 'improvementYields', improvement: 'ZIGGURAT', yields: { culture: 1 } },
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

    C('MERCANTILISM', 'Mercantilism', 'Renaissance', 720, ['HUMANISM'], [
      // CIV6 (Camp): "+1 Production (requires Mercantilism)" and "+1 Food
      // (requires Mercantilism)".
      { kind: 'improvementYields', improvement: 'CAMP', yields: { production: 1, food: 1 } },
    ]),
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
      { kind: 'unlockPolicy', policy: 'SECOND_STRIKE_CAPABILITY' },
    ]),
    C('SPACE_RACE', 'Space Race', 'Atomic', 2415, ['COLD_WAR']),
    C('RAPID_DEPLOYMENT', 'Rapid Deployment', 'Atomic', 2415, ['COLD_WAR'], [
      { kind: 'unlockPolicy', policy: 'MILITARY_FIRST' },
    ]),
    C('ENVIRONMENTALISM', 'Environmentalism', 'Information', 2880, ['CULTURAL_HERITAGE', 'RAPID_DEPLOYMENT']),

    C('GLOBALIZATION', 'Globalization', 'Information', 2880, ['RAPID_DEPLOYMENT', 'SPACE_RACE'], [
      // CIV6 (Plantation): "+2 Gold (requires Globalization)".
      { kind: 'improvementYields', improvement: 'PLANTATION', yields: { gold: 2 } },
    ]),
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
    C('GLOBAL_WARMING_MITIGATION', 'Global Warming Mitigation', 'Future', 3200, ['NEAR_FUTURE_GOVERNANCE'], [
      // CIV6: "Awards 3 Envoys. Awards 1 Diplomatic Victory point."
      { kind: 'award', envoys: 3, dvp: 1 },
    ]),
  ].map((c) => [c.id, c]),
);
