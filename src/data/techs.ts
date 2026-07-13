/**
 * Technology tree — a compact 22-node tree that keeps Civ 6's real names,
 * shape and gating for everything this calculator models. Costs are
 * eyeballed base-game science values. Pure-military techs are omitted.
 */

import type { DistrictId, ImprovementId, Yields } from '../core/types';
import { GAME_SPEED } from './constants';

export type Era = 'Ancient' | 'Classical' | 'Medieval' | 'Renaissance' | 'Industrial' | 'Modern';

export const ERAS: Era[] = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Industrial', 'Modern'];

export type ResearchEffect =
  | { kind: 'unlockImprovement'; improvement: ImprovementId }
  | { kind: 'unlockDistrict'; district: DistrictId }
  | { kind: 'unlockBuilding'; building: string }
  | { kind: 'unlockFeatureRemoval'; feature: string }
  /** Permanent yield bonus for every instance of an improvement. */
  | { kind: 'improvementYields'; improvement: ImprovementId; yields: Partial<Yields> }
  /** Farms gain +1 food when adjacent to 2+ farms (stacks per tier). */
  | { kind: 'farmAdjacency' }
  /** Farms become buildable on grassland/plains hills. */
  | { kind: 'hillFarms' }
  | { kind: 'unlockGovernment'; government: string }
  | { kind: 'unlockPolicy'; policy: string };

export interface TechDef {
  id: string;
  name: string;
  era: Era;
  cost: number;
  prereqs: string[];
  effects: ResearchEffect[];
}

const T = (
  id: string,
  name: string,
  era: Era,
  cost: number,
  prereqs: string[],
  effects: ResearchEffect[] = [],
): TechDef => ({ id, name, era, cost: Math.round(cost * GAME_SPEED), prereqs, effects });

export const TECHS: Record<string, TechDef> = Object.fromEntries(
  [
    // --- Ancient -------------------------------------------------------------
    T('POTTERY', 'Pottery', 'Ancient', 25, [], [{ kind: 'unlockBuilding', building: 'GRANARY' }]),
    T('ANIMAL_HUSBANDRY', 'Animal Husbandry', 'Ancient', 25, [], [
      { kind: 'unlockImprovement', improvement: 'PASTURE' },
      { kind: 'unlockImprovement', improvement: 'CAMP' },
    ]),
    T('MINING', 'Mining', 'Ancient', 25, [], [
      { kind: 'unlockImprovement', improvement: 'MINE' },
      { kind: 'unlockImprovement', improvement: 'QUARRY' },
      { kind: 'unlockFeatureRemoval', feature: 'WOODS' },
    ]),
    T('SAILING', 'Sailing', 'Ancient', 50, [], [
      { kind: 'unlockImprovement', improvement: 'FISHING_BOATS' },
    ]),
    T('ARCHERY', 'Archery', 'Ancient', 50, ['ANIMAL_HUSBANDRY']),
    T('ASTROLOGY', 'Astrology', 'Ancient', 50, [], [
      { kind: 'unlockDistrict', district: 'HOLY_SITE' },
      { kind: 'unlockBuilding', building: 'SHRINE' },
    ]),
    T('IRRIGATION', 'Irrigation', 'Ancient', 50, ['POTTERY'], [
      { kind: 'unlockImprovement', improvement: 'PLANTATION' },
      { kind: 'unlockFeatureRemoval', feature: 'MARSH' },
    ]),
    T('WRITING', 'Writing', 'Ancient', 50, ['POTTERY'], [
      { kind: 'unlockDistrict', district: 'CAMPUS' },
      { kind: 'unlockBuilding', building: 'LIBRARY' },
    ]),
    T('MASONRY', 'Masonry', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockBuilding', building: 'ANCIENT_WALLS' }, // AUDIT B-1
    ]),
    T('BRONZE_WORKING', 'Bronze Working', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockDistrict', district: 'ENCAMPMENT' },
      { kind: 'unlockBuilding', building: 'BARRACKS' },
      { kind: 'unlockFeatureRemoval', feature: 'RAINFOREST' },
    ]),
    T('WHEEL', 'Wheel', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockBuilding', building: 'WATER_MILL' },
    ]),

    // --- Classical ------------------------------------------------------------
    T('CELESTIAL_NAVIGATION', 'Celestial Navigation', 'Classical', 120, ['SAILING', 'ASTROLOGY'], [
      { kind: 'unlockDistrict', district: 'HARBOR' },
      { kind: 'unlockBuilding', building: 'LIGHTHOUSE' },
    ]),
    T('CURRENCY', 'Currency', 'Classical', 120, ['WRITING'], [
      { kind: 'unlockDistrict', district: 'COMMERCIAL_HUB' },
      { kind: 'unlockBuilding', building: 'MARKET' },
    ]),
    T('HORSEBACK_RIDING', 'Horseback Riding', 'Classical', 120, ['ANIMAL_HUSBANDRY'], [
      { kind: 'unlockBuilding', building: 'STABLE' },
    ]),
    T('MATHEMATICS', 'Mathematics', 'Classical', 200, ['CURRENCY']),
    T('CONSTRUCTION', 'Construction', 'Classical', 200, ['WHEEL', 'HORSEBACK_RIDING'], [
      { kind: 'unlockImprovement', improvement: 'LUMBER_MILL' },
    ]),
    T('ENGINEERING', 'Engineering', 'Classical', 200, ['WHEEL'], [
      { kind: 'unlockDistrict', district: 'AQUEDUCT' },
    ]),

    // --- Medieval --------------------------------------------------------------
    T('APPRENTICESHIP', 'Apprenticeship', 'Medieval', 275, ['CURRENCY', 'HORSEBACK_RIDING'], [
      { kind: 'unlockDistrict', district: 'INDUSTRIAL_ZONE' },
      { kind: 'unlockBuilding', building: 'WORKSHOP' },
      { kind: 'improvementYields', improvement: 'MINE', yields: { production: 1 } },
    ]),
    T('MILITARY_ENGINEERING', 'Military Engineering', 'Medieval', 335, ['CONSTRUCTION'], [
      { kind: 'unlockBuilding', building: 'ARMORY' },
    ]),
    T('EDUCATION', 'Education', 'Medieval', 335, ['APPRENTICESHIP', 'MATHEMATICS'], [
      { kind: 'unlockBuilding', building: 'UNIVERSITY' },
    ]),
    T('BANKING', 'Banking', 'Medieval', 390, ['EDUCATION'], [
      { kind: 'unlockBuilding', building: 'BANK' },
    ]),

    // --- Renaissance ------------------------------------------------------------
    T('MASS_PRODUCTION', 'Mass Production', 'Renaissance', 580, ['EDUCATION', 'CONSTRUCTION'], [
      { kind: 'unlockBuilding', building: 'SHIPYARD' },
    ]),
    T('ASTRONOMY', 'Astronomy', 'Renaissance', 580, ['EDUCATION']),

    // --- Industrial --------------------------------------------------------------
    T('INDUSTRIALIZATION', 'Industrialization', 'Industrial', 930, ['MASS_PRODUCTION'], [
      { kind: 'unlockBuilding', building: 'FACTORY' },
      { kind: 'improvementYields', improvement: 'MINE', yields: { production: 1 } },
    ]),
    T('SANITATION', 'Sanitation', 'Industrial', 930, ['MASS_PRODUCTION'], [
      { kind: 'unlockBuilding', building: 'SEWER' },
    ]),
    T('ECONOMICS', 'Economics', 'Industrial', 930, ['BANKING'], [
      { kind: 'unlockBuilding', building: 'STOCK_EXCHANGE' },
    ]),
    T('MILITARY_SCIENCE', 'Military Science', 'Industrial', 1070, ['MILITARY_ENGINEERING'], [
      { kind: 'unlockBuilding', building: 'MILITARY_ACADEMY' },
    ]),

    // --- Modern -------------------------------------------------------------------
    T('ELECTRICITY', 'Electricity', 'Modern', 1250, ['INDUSTRIALIZATION'], [
      { kind: 'unlockBuilding', building: 'POWER_PLANT' },
      { kind: 'unlockBuilding', building: 'SEAPORT' },
    ]),
    T('RADIO', 'Radio', 'Modern', 1250, ['INDUSTRIALIZATION'], [
      { kind: 'unlockBuilding', building: 'BROADCAST_CENTER' },
    ]),
    T('CHEMISTRY', 'Chemistry', 'Modern', 1250, ['SANITATION'], [
      { kind: 'unlockBuilding', building: 'RESEARCH_LAB' },
    ]),
    T('STEEL', 'Steel', 'Modern', 1370, ['INDUSTRIALIZATION'], [
      { kind: 'unlockImprovement', improvement: 'OIL_WELL' },
    ]),
    T('REPLACEABLE_PARTS', 'Replaceable Parts', 'Modern', 1370, ['ECONOMICS'], [
      { kind: 'farmAdjacency' },
    ]),
  ].map((t) => [t.id, t]),
);
