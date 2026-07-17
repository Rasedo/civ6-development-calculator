/**
 * Civics tree — the full GS ~50-node tree (B-12). The first 30 nodes are the
 * historical compact tree, kept BYTE-IDENTICAL (append-only) so every index and
 * tie-break is preserved; the remainder fill the real topology through the
 * Atomic/Information eras. Costs are real-anchored culture.
 *
 * The appended nodes are PURE TREE NODES: their real unlocks are policy cards
 * and tier-3 governments — the POLICIES/GOVERNMENTS surface owned by Slice P
 * (#46) — so they carry NO unlock effects here (recorded in ROUND_B2_LOG),
 * keeping the merge clean. Inspirations attach only where expressible against
 * an exported target; the rest are uninspirable (recorded).
 */

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

    // ========================================================================
    // B-12: full-tree expansion (index 30+). Pure tree nodes — real policy /
    // government unlocks belong to Slice P's POLICIES/GOVERNMENTS surface, so
    // no unlock effects here. NUCLEAR_PROGRAM carries the one expressible
    // inspiration (Research Lab, an exported Campus building).
    // ========================================================================

    // --- Classical (fill) ----------------------------------------------------
    C('MILITARY_TRAINING', 'Military Training', 'Classical', 120, ['MILITARY_TRADITION', 'GAMES_AND_RECREATION']),
    C('DEFENSIVE_TACTICS', 'Defensive Tactics', 'Classical', 175, ['GAMES_AND_RECREATION']),

    // --- Medieval (fill) -----------------------------------------------------
    C('MERCENARIES', 'Mercenaries', 'Medieval', 385, ['FEUDALISM']),

    // --- Renaissance (fill) --------------------------------------------------
    C('MERCANTILISM', 'Mercantilism', 'Renaissance', 655, ['HUMANISM']),
    C('DIPLOMATIC_SERVICE', 'Diplomatic Service', 'Renaissance', 655, ['EXPLORATION']),

    // --- Industrial (fill) ---------------------------------------------------
    C('OPERA_AND_BALLET', 'Opera and Ballet', 'Industrial', 870, ['HUMANISM']),
    C('COLONIALISM', 'Colonialism', 'Industrial', 920, ['MERCANTILISM']),
    C('CONSERVATION', 'Conservation', 'Industrial', 1060, ['NATURAL_HISTORY']),

    // --- Modern (fill) -------------------------------------------------------
    C('MOBILIZATION', 'Mobilization', 'Modern', 1410, ['NATIONALISM']),
    C('IDEOLOGY', 'Ideology', 'Modern', 660, ['MASS_MEDIA']),
    C('NUCLEAR_PROGRAM', 'Nuclear Program', 'Modern', 1830, ['CLASS_STRUGGLE']),
    C('CAPITALISM', 'Capitalism', 'Modern', 1620, ['MASS_MEDIA']),
    C('CULTURAL_HERITAGE', 'Cultural Heritage', 'Modern', 1500, ['CONSERVATION']),

    // --- Atomic (new era) ----------------------------------------------------
    C('COLD_WAR', 'Cold War', 'Atomic', 2200, ['MOBILIZATION']),
    C('SPACE_RACE', 'Space Race', 'Atomic', 2200, ['COLD_WAR']),
    C('RAPID_DEPLOYMENT', 'Rapid Deployment', 'Atomic', 2200, ['COLD_WAR']),
    C('ENVIRONMENTALISM', 'Environmentalism', 'Atomic', 2340, ['CULTURAL_HERITAGE']),

    // --- Information (new era) ------------------------------------------------
    C('GLOBALIZATION', 'Globalization', 'Information', 2500, ['SPACE_RACE', 'CAPITALISM']),
    C('SOCIAL_MEDIA', 'Social Media', 'Information', 2500, ['GLOBALIZATION']),
    C('NEAR_FUTURE_GOVERNANCE', 'Near Future Governance', 'Information', 2600, ['GLOBALIZATION']),
    C('INFORMATION_WARFARE', 'Information Warfare', 'Information', 2600, ['RAPID_DEPLOYMENT']),
  ].map((c) => [c.id, c]),
);
