/**
 * Civics tree — compact but Civ 6-faithful: unlocks the culture-side
 * districts/buildings, policy cards, governments, hill farms and the
 * Feudalism farm-adjacency bonus. Costs are eyeballed culture values.
 */

import type { Era, ResearchEffect } from './techs';

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
): CivicDef => ({ id, name, era, cost, prereqs, effects });

export const CIVICS: Record<string, CivicDef> = Object.fromEntries(
  [
    // --- Ancient -------------------------------------------------------------
    C('CODE_OF_LAWS', 'Code of Laws', 'Ancient', 20, [], [
      { kind: 'unlockGovernment', government: 'CHIEFDOM' },
      { kind: 'unlockPolicy', policy: 'URBAN_PLANNING' },
      { kind: 'unlockPolicy', policy: 'GOD_KING' },
    ]),
    C('CRAFTSMANSHIP', 'Craftsmanship', 'Ancient', 40, ['CODE_OF_LAWS']),
    C('FOREIGN_TRADE', 'Foreign Trade', 'Ancient', 40, ['CODE_OF_LAWS']),
    C('MILITARY_TRADITION', 'Military Tradition', 'Ancient', 50, ['CRAFTSMANSHIP'], [
      { kind: 'unlockPolicy', policy: 'VETERANCY' },
    ]),
    C('STATE_WORKFORCE', 'State Workforce', 'Ancient', 70, ['CRAFTSMANSHIP']),
    C('EARLY_EMPIRE', 'Early Empire', 'Ancient', 70, ['FOREIGN_TRADE'], [
      { kind: 'unlockPolicy', policy: 'LAND_SURVEYORS' },
      { kind: 'unlockPolicy', policy: 'INSULAE' },
    ]),
    C('MYSTICISM', 'Mysticism', 'Ancient', 50, ['FOREIGN_TRADE']),

    // --- Classical ------------------------------------------------------------
    C('GAMES_AND_RECREATION', 'Games and Recreation', 'Classical', 110, ['STATE_WORKFORCE'], [
      { kind: 'unlockDistrict', district: 'ENTERTAINMENT_COMPLEX' },
      { kind: 'unlockBuilding', building: 'ARENA' },
    ]),
    C('POLITICAL_PHILOSOPHY', 'Political Philosophy', 'Classical', 110, ['STATE_WORKFORCE', 'EARLY_EMPIRE'], [
      { kind: 'unlockGovernment', government: 'AUTOCRACY' },
      { kind: 'unlockGovernment', government: 'OLIGARCHY' },
      { kind: 'unlockGovernment', government: 'CLASSICAL_REPUBLIC' },
    ]),
    C('DRAMA_AND_POETRY', 'Drama and Poetry', 'Classical', 110, ['EARLY_EMPIRE'], [
      { kind: 'unlockDistrict', district: 'THEATER_SQUARE' },
      { kind: 'unlockBuilding', building: 'AMPHITHEATER' },
    ]),
    C('THEOLOGY', 'Theology', 'Classical', 120, ['MYSTICISM'], [
      { kind: 'unlockBuilding', building: 'TEMPLE' },
      { kind: 'unlockPolicy', policy: 'SCRIPTURE' },
    ]),
    C('RECORDED_HISTORY', 'Recorded History', 'Classical', 175, ['POLITICAL_PHILOSOPHY', 'DRAMA_AND_POETRY'], [
      { kind: 'unlockPolicy', policy: 'NATURAL_PHILOSOPHY' },
    ]),
    C('NAVAL_TRADITION', 'Naval Tradition', 'Classical', 200, ['GAMES_AND_RECREATION'], [
      { kind: 'unlockPolicy', policy: 'NAVAL_INFRASTRUCTURE' },
    ]),

    // --- Medieval --------------------------------------------------------------
    C('FEUDALISM', 'Feudalism', 'Medieval', 275, ['THEOLOGY'], [{ kind: 'farmAdjacency' }]),
    C('CIVIL_SERVICE', 'Civil Service', 'Medieval', 275, ['RECORDED_HISTORY'], []),
    C('GUILDS', 'Guilds', 'Medieval', 385, ['FEUDALISM', 'CIVIL_SERVICE'], [
      { kind: 'unlockPolicy', policy: 'TOWN_CHARTERS' },
      { kind: 'unlockPolicy', policy: 'CRAFTSMEN' },
    ]),
    C('MEDIEVAL_FAIRES', 'Medieval Faires', 'Medieval', 385, ['GUILDS'], [
      { kind: 'unlockPolicy', policy: 'AESTHETICS' },
    ]),
    C('DIVINE_RIGHT', 'Divine Right', 'Medieval', 385, ['CIVIL_SERVICE'], [
      { kind: 'unlockGovernment', government: 'MONARCHY' },
      { kind: 'unlockPolicy', policy: 'MEDINA_QUARTER' },
    ]),

    // --- Renaissance ------------------------------------------------------------
    C('EXPLORATION', 'Exploration', 'Renaissance', 400, ['MEDIEVAL_FAIRES'], [
      { kind: 'unlockGovernment', government: 'MERCHANT_REPUBLIC' },
    ]),
    C('REFORMED_CHURCH', 'Reformed Church', 'Renaissance', 400, ['DIVINE_RIGHT'], [
      { kind: 'unlockGovernment', government: 'THEOCRACY' },
      { kind: 'unlockPolicy', policy: 'SIMULTANEUM' },
    ]),
    C('HUMANISM', 'Humanism', 'Renaissance', 540, ['MEDIEVAL_FAIRES'], [
      { kind: 'unlockBuilding', building: 'MUSEUM' },
      { kind: 'unlockPolicy', policy: 'GRAND_OPERA' },
    ]),
    C('ENLIGHTENMENT', 'The Enlightenment', 'Renaissance', 655, ['HUMANISM'], [
      { kind: 'unlockPolicy', policy: 'RATIONALISM' },
      { kind: 'unlockPolicy', policy: 'FREE_MARKETS' },
      { kind: 'unlockPolicy', policy: 'LIBERALISM' },
    ]),

    // --- Industrial --------------------------------------------------------------
    C('CIVIL_ENGINEERING', 'Civil Engineering', 'Industrial', 920, ['ENLIGHTENMENT'], [
      { kind: 'hillFarms' },
    ]),
    C('NATIONALISM', 'Nationalism', 'Industrial', 920, ['ENLIGHTENMENT']),
    C('NATURAL_HISTORY', 'Natural History', 'Industrial', 870, ['ENLIGHTENMENT'], [
      { kind: 'unlockBuilding', building: 'ZOO' },
    ]),
    C('URBANIZATION', 'Urbanization', 'Industrial', 1060, ['CIVIL_ENGINEERING', 'NATIONALISM'], [
      { kind: 'unlockDistrict', district: 'NEIGHBORHOOD' },
    ]),

    // --- Modern -------------------------------------------------------------------
    C('MASS_MEDIA', 'Mass Media', 'Modern', 1410, ['URBANIZATION']),
    C('PROFESSIONAL_SPORTS', 'Professional Sports', 'Modern', 1480, ['URBANIZATION'], [
      { kind: 'unlockBuilding', building: 'STADIUM' },
    ]),
    C('SUFFRAGE', 'Suffrage', 'Modern', 1715, ['MASS_MEDIA'], [
      { kind: 'unlockGovernment', government: 'DEMOCRACY' },
      { kind: 'unlockPolicy', policy: 'NEW_DEAL' },
    ]),
    C('CLASS_STRUGGLE', 'Class Struggle', 'Modern', 1715, ['MASS_MEDIA'], [
      { kind: 'unlockGovernment', government: 'COMMUNISM' },
      { kind: 'unlockPolicy', policy: 'FIVE_YEAR_PLAN' },
    ]),
    C('TOTALITARIANISM', 'Totalitarianism', 'Modern', 1715, ['MASS_MEDIA'], [
      { kind: 'unlockGovernment', government: 'FASCISM' },
    ]),
  ].map((c) => [c.id, c]),
);
