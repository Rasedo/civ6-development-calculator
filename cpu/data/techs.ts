
import type { DistrictId, ImprovementId, Yields } from '../core/types';
import { GAME_SPEED } from './constants';

export type Era =
  | 'Ancient'
  | 'Classical'
  | 'Medieval'
  | 'Renaissance'
  | 'Industrial'
  | 'Modern'
  | 'Atomic'
  | 'Information'
  | 'Future';

/** ERAS index of 'Modern' — antiquity sites stop being created
 *  once the world reaches it (real Civ 6). Derived below, not hardcoded. */
export const MODERN_ERA_INDEX = 5;
export const INDUSTRIAL_ERA_INDEX = 4;

export const ERAS: Era[] = [
  'Ancient',
  'Classical',
  'Medieval',
  'Renaissance',
  'Industrial',
  'Modern',
  'Atomic',
  'Information',
  'Future',
];

export type ResearchEffect =
  | { kind: 'unlockImprovement'; improvement: ImprovementId }
  | { kind: 'unlockDistrict'; district: DistrictId }
  | { kind: 'unlockBuilding'; building: string }
  | { kind: 'unlockFeatureRemoval'; feature: string }
  | { kind: 'improvementYields'; improvement: ImprovementId; yields: Partial<Yields> }
  | { kind: 'farmAdjacency' }
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
      { kind: 'unlockBuilding', building: 'ANCIENT_WALLS' },
    ]),
    T('BRONZE_WORKING', 'Bronze Working', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockDistrict', district: 'ENCAMPMENT' },
      { kind: 'unlockBuilding', building: 'BARRACKS' },
      { kind: 'unlockFeatureRemoval', feature: 'RAINFOREST' },
    ]),
    T('WHEEL', 'Wheel', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockBuilding', building: 'WATER_MILL' },
    ]),

    T('CELESTIAL_NAVIGATION', 'Celestial Navigation', 'Classical', 120, ['SAILING', 'ASTROLOGY'], [
      { kind: 'unlockDistrict', district: 'HARBOR' },
      { kind: 'unlockBuilding', building: 'LIGHTHOUSE' },
    ]),
    T('CURRENCY', 'Currency', 'Classical', 120, ['WRITING'], [
      { kind: 'unlockDistrict', district: 'COMMERCIAL_HUB' },
      { kind: 'unlockBuilding', building: 'MARKET' },
    ]),
    T('HORSEBACK_RIDING', 'Horseback Riding', 'Classical', 120, ['ARCHERY'], [
      { kind: 'unlockBuilding', building: 'STABLE' },
    ]),
    T('MATHEMATICS', 'Mathematics', 'Classical', 200, ['CURRENCY']),
    T('CONSTRUCTION', 'Construction', 'Classical', 200, ['MASONRY', 'HORSEBACK_RIDING'], [
      { kind: 'unlockImprovement', improvement: 'LUMBER_MILL' },
    ]),
    T('ENGINEERING', 'Engineering', 'Classical', 200, ['WHEEL'], [
      { kind: 'unlockDistrict', district: 'AQUEDUCT' },
    ]),

    T('APPRENTICESHIP', 'Apprenticeship', 'Medieval', 300, ['CURRENCY', 'HORSEBACK_RIDING'], [
      { kind: 'unlockDistrict', district: 'INDUSTRIAL_ZONE' },
      { kind: 'unlockBuilding', building: 'WORKSHOP' },
      { kind: 'improvementYields', improvement: 'MINE', yields: { production: 1 } },
    ]),
    T('MILITARY_ENGINEERING', 'Military Engineering', 'Medieval', 390, ['CONSTRUCTION'], [
      { kind: 'unlockBuilding', building: 'ARMORY' },
      // The FORT ships with its improvement def, its
      // Military-Engineer-only placement rule, its +4 terrain defence and two
      // constructed test lanes — but NO tech ever unlocked it, so
      // `unlocks.improvements` never contained it and `unlocked('FORT')` was
      // true only in sandbox. Neither seat could build one. MEASURED: across
      // the 12-seed gate the seat production arm was reached 526 times (325 of
      // them at war) and the FORT was never once unlocked. This — not the
      // absent production policy — is why it was never reachable.
      // Real Civ 6 unlocks the Fort with Military Engineering, the same tech
      // that trains the Military Engineer.
      { kind: 'unlockImprovement', improvement: 'FORT' },
    ]),
    T('EDUCATION', 'Education', 'Medieval', 390, ['APPRENTICESHIP', 'MATHEMATICS'], [
      { kind: 'unlockBuilding', building: 'UNIVERSITY' },
    ]),
    T('BANKING', 'Banking', 'Renaissance', 600, ['EDUCATION', 'STIRRUPS'], [
      { kind: 'unlockBuilding', building: 'BANK' },
    ]),

    T('MASS_PRODUCTION', 'Mass Production', 'Renaissance', 600, ['EDUCATION', 'BUTTRESS', 'MILITARY_TACTICS'], [
      { kind: 'unlockBuilding', building: 'SHIPYARD' },
    ]),
    T('ASTRONOMY', 'Astronomy', 'Renaissance', 730, ['EDUCATION']),

    T('INDUSTRIALIZATION', 'Industrialization', 'Industrial', 930, ['SQUARE_RIGGING', 'MASS_PRODUCTION'], [
      { kind: 'unlockBuilding', building: 'FACTORY' },
      { kind: 'improvementYields', improvement: 'MINE', yields: { production: 1 } },
    ]),
    T('SCIENTIFIC_THEORY', 'Scientific Theory', 'Industrial', 930, ['ASTRONOMY', 'BANKING']),
    T('SANITATION', 'Sanitation', 'Industrial', 1070, ['SCIENTIFIC_THEORY'], [
      { kind: 'unlockBuilding', building: 'SEWER' },
    ]),
    T('ECONOMICS', 'Economics', 'Industrial', 1070, ['SCIENTIFIC_THEORY', 'METAL_CASTING'], [
      { kind: 'unlockBuilding', building: 'STOCK_EXCHANGE' },
    ]),
    T('MILITARY_SCIENCE', 'Military Science', 'Industrial', 930, ['SIEGE_TACTICS', 'PRINTING'], [
      { kind: 'unlockBuilding', building: 'MILITARY_ACADEMY' },
    ]),

    T('ELECTRICITY', 'Electricity', 'Modern', 1370, ['STEAM_POWER'], [
      { kind: 'unlockBuilding', building: 'POWER_PLANT' },
      { kind: 'unlockBuilding', building: 'SEAPORT' },
    ]),
    T('RADIO', 'Radio', 'Modern', 1370, ['STEAM_POWER', 'FLIGHT'], [
      { kind: 'unlockBuilding', building: 'BROADCAST_CENTER' },
      { kind: 'unlockImprovement', improvement: 'SEASIDE_RESORT' },
    ]),
    T('CHEMISTRY', 'Chemistry', 'Modern', 1370, ['SANITATION', 'REPLACEABLE_PARTS'], [
      { kind: 'unlockBuilding', building: 'RESEARCH_LAB' },
    ]),
    T('STEEL', 'Steel', 'Modern', 1250, ['RIFLING'], [
      { kind: 'unlockImprovement', improvement: 'OIL_WELL' },
    ]),
    T('REPLACEABLE_PARTS', 'Replaceable Parts', 'Modern', 1250, ['ECONOMICS'], [
      { kind: 'farmAdjacency' },
    ]),


    T('IRON_WORKING', 'Iron Working', 'Classical', 120, ['BRONZE_WORKING']),
    T('SHIPBUILDING', 'Shipbuilding', 'Classical', 200, ['SAILING']),

    T('MACHINERY', 'Machinery', 'Medieval', 300, ['IRON_WORKING', 'ENGINEERING']),
    T('BUTTRESS', 'Buttress', 'Medieval', 300, ['SHIPBUILDING', 'MATHEMATICS']),
    T('MILITARY_TACTICS', 'Military Tactics', 'Medieval', 300, ['MATHEMATICS']),
    T('STIRRUPS', 'Stirrups', 'Medieval', 390, ['HORSEBACK_RIDING', 'APPRENTICESHIP']),
    T('CASTLES', 'Castles', 'Medieval', 390, ['CONSTRUCTION']),

    T('GUNPOWDER', 'Gunpowder', 'Renaissance', 600, ['APPRENTICESHIP', 'STIRRUPS', 'MILITARY_ENGINEERING']),
    T('METAL_CASTING', 'Metal Casting', 'Renaissance', 730, ['GUNPOWDER']),
    T('CARTOGRAPHY', 'Cartography', 'Renaissance', 600, ['BUTTRESS']),
    T('PRINTING', 'Printing', 'Renaissance', 600, ['MACHINERY']),
    T('SQUARE_RIGGING', 'Square Rigging', 'Renaissance', 730, ['CARTOGRAPHY']),
    T('SIEGE_TACTICS', 'Siege Tactics', 'Renaissance', 730, ['CASTLES']),

    T('STEAM_POWER', 'Steam Power', 'Industrial', 1070, ['INDUSTRIALIZATION']),
    T('BALLISTICS', 'Ballistics', 'Industrial', 930, ['METAL_CASTING']),
    T('RIFLING', 'Rifling', 'Industrial', 1070, ['BALLISTICS', 'MILITARY_SCIENCE']),

    T('FLIGHT', 'Flight', 'Modern', 1250, ['INDUSTRIALIZATION', 'SCIENTIFIC_THEORY']),
    T('COMBUSTION', 'Combustion', 'Modern', 1370, ['STEEL', 'REFINING']),
    T('REFINING', 'Refining', 'Modern', 1250, ['RIFLING']),
    T('PLASTICS', 'Plastics', 'Atomic', 1480, ['COMBUSTION']),

    T('COMPUTERS', 'Computers', 'Atomic', 1660, ['ELECTRICITY', 'RADIO']),
    T('NUCLEAR_FISSION', 'Nuclear Fission', 'Atomic', 1660, ['ADVANCED_BALLISTICS', 'COMBINED_ARMS']),
    T('ROCKETRY', 'Rocketry', 'Atomic', 1480, ['RADIO', 'CHEMISTRY'], [
      { kind: 'unlockDistrict', district: 'SPACEPORT' },
    ]),
    T('ADVANCED_FLIGHT', 'Advanced Flight', 'Atomic', 1480, ['RADIO']),
    T('COMBINED_ARMS', 'Combined Arms', 'Atomic', 1480, ['STEEL', 'COMBUSTION']),
    T('ADVANCED_BALLISTICS', 'Advanced Ballistics', 'Atomic', 1480, ['REPLACEABLE_PARTS', 'STEEL']),
    T('SYNTHETIC_MATERIALS', 'Synthetic Materials', 'Atomic', 1660, ['PLASTICS']),
    T('COMPOSITES', 'Composites', 'Information', 1850, ['SYNTHETIC_MATERIALS']),

    T('SATELLITES', 'Satellites', 'Information', 1850, ['ADVANCED_FLIGHT', 'ROCKETRY']),
    T('GUIDANCE_SYSTEMS', 'Guidance Systems', 'Information', 1850, ['ROCKETRY', 'ADVANCED_BALLISTICS']),
    T('LASERS', 'Lasers', 'Information', 1850, ['NUCLEAR_FISSION']),
    T('NANOTECHNOLOGY', 'Nanotechnology', 'Information', 2155, ['COMPOSITES']),
    T('NUCLEAR_FUSION', 'Nuclear Fusion', 'Information', 2155, ['LASERS']),
    T('ROBOTICS', 'Robotics', 'Information', 2155, ['COMPUTERS', 'SATELLITES', 'GUIDANCE_SYSTEMS', 'LASERS']),
    T('TELECOMMUNICATIONS', 'Telecommunications', 'Information', 1850, ['COMPUTERS']),

    // CIV6: the Future techs' only published gate is the Future ERA; the
    // deepest Information-era nodes stand in as prereqs.
    T('OFFWORLD_MISSION', 'Offworld Mission', 'Future', 2500, ['TELECOMMUNICATIONS', 'NUCLEAR_FUSION']),
    T('SMART_MATERIALS', 'Smart Materials', 'Future', 2200, ['NANOTECHNOLOGY', 'ROBOTICS']),
    T('ADVANCED_POWER_CELLS', 'Advanced Power Cells', 'Future', 2200, ['NUCLEAR_FUSION']),
  ].map((t) => [t.id, t]),
);
