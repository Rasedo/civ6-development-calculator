
import type { DistrictId, ImprovementId, Yields } from '../core/types';
import { GAME_SPEED } from './constants';
import { xml, type SrcMap } from './provenance';

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
  | { kind: 'unlockPolicy'; policy: string }
  /** a ONE-OFF paid at completion (Global Warming Mitigation: "Awards 3
   *  Envoys / Awards 1 Diplomatic Victory point"). */
  | { kind: 'award'; envoys?: number; dvp?: number };

export interface TechDef {
  id: string;
  name: string;
  era: Era;
  cost: number;
  prereqs: string[];
  effects: ResearchEffect[];
  /** PROVENANCE, per column — see TECH_SRC below. */
  src?: SrcMap;
}

/** PROVENANCE (cpu/data/provenance.ts), keyed by row id and attached by the row
 *  builder below — these rows are built through a positional helper, so the tag
 *  cannot ride inside the call. Stripped by the exporter; checked by
 *  tools/civ6lab/xml_check.py. */
const TECH_SRC: Readonly<Record<string, SrcMap>> = {
  POTTERY: {
    era: xml('Technologies', 'TechnologyType=TECH_POTTERY', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_POTTERY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no TechnologyPrereqs row for TECH_POTTERY' },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_GRANARY', 'PrereqTech', { expect: 'TECH_POTTERY' }),
  },
  ANIMAL_HUSBANDRY: {
    era: xml('Technologies', 'TechnologyType=TECH_ANIMAL_HUSBANDRY', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ANIMAL_HUSBANDRY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no TechnologyPrereqs row for TECH_ANIMAL_HUSBANDRY' },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_PASTURE', 'PrereqTech', { expect: 'TECH_ANIMAL_HUSBANDRY' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_CAMP', 'PrereqTech', { expect: 'TECH_ANIMAL_HUSBANDRY' }),
  },
  MINING: {
    era: xml('Technologies', 'TechnologyType=TECH_MINING', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MINING', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no TechnologyPrereqs row for TECH_MINING' },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_MINE', 'PrereqTech', { expect: 'TECH_MINING' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_QUARRY', 'PrereqTech', { expect: 'TECH_MINING' }),
    'effects.2.feature': xml('Features', 'FeatureType=FEATURE_FOREST', 'RemoveTech', { expect: 'TECH_MINING' }),
  },
  SAILING: {
    era: xml('Technologies', 'TechnologyType=TECH_SAILING', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SAILING', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no TechnologyPrereqs row for TECH_SAILING' },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHING_BOATS', 'PrereqTech', { expect: 'TECH_SAILING' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_FISHERY', 'PrereqTech', { expect: 'TECH_SAILING' }),
  },
  ARCHERY: {
    era: xml('Technologies', 'TechnologyType=TECH_ARCHERY', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ARCHERY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_ARCHERY&PrereqTech=TECH_ANIMAL_HUSBANDRY', 'PrereqTech', { expect: 'TECH_ANIMAL_HUSBANDRY' }),
  },
  ASTROLOGY: {
    era: xml('Technologies', 'TechnologyType=TECH_ASTROLOGY', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ASTROLOGY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'a tree root: the install writes no TechnologyPrereqs row for TECH_ASTROLOGY' },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'PrereqTech', { expect: 'TECH_ASTROLOGY' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_SHRINE', 'PrereqTech', { expect: 'TECH_ASTROLOGY' }),
  },
  IRRIGATION: {
    era: xml('Technologies', 'TechnologyType=TECH_IRRIGATION', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_IRRIGATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_IRRIGATION&PrereqTech=TECH_POTTERY', 'PrereqTech', { expect: 'TECH_POTTERY' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_PLANTATION', 'PrereqTech', { expect: 'TECH_IRRIGATION' }),
    'effects.1.feature': xml('Features', 'FeatureType=FEATURE_MARSH', 'RemoveTech', { expect: 'TECH_IRRIGATION' }),
  },
  WRITING: {
    era: xml('Technologies', 'TechnologyType=TECH_WRITING', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_WRITING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_WRITING&PrereqTech=TECH_POTTERY', 'PrereqTech', { expect: 'TECH_POTTERY' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'PrereqTech', { expect: 'TECH_WRITING' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_LIBRARY', 'PrereqTech', { expect: 'TECH_WRITING' }),
  },
  MASONRY: {
    era: xml('Technologies', 'TechnologyType=TECH_MASONRY', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MASONRY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_MASONRY&PrereqTech=TECH_MINING', 'PrereqTech', { expect: 'TECH_MINING' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_WALLS', 'PrereqTech', { expect: 'TECH_MASONRY' }),
  },
  BRONZE_WORKING: {
    era: xml('Technologies', 'TechnologyType=TECH_BRONZE_WORKING', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_BRONZE_WORKING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_BRONZE_WORKING&PrereqTech=TECH_MINING', 'PrereqTech', { expect: 'TECH_MINING' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
    'effects.2.feature': xml('Features', 'FeatureType=FEATURE_JUNGLE', 'RemoveTech', { expect: 'TECH_BRONZE_WORKING' }),
  },
  WHEEL: {
    era: xml('Technologies', 'TechnologyType=TECH_THE_WHEEL', 'EraType', { expect: 'ERA_ANCIENT' }),
    cost: xml('Technologies', 'TechnologyType=TECH_THE_WHEEL', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_THE_WHEEL&PrereqTech=TECH_MINING', 'PrereqTech', { expect: 'TECH_MINING' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_WATER_MILL', 'PrereqTech', { expect: 'TECH_THE_WHEEL' }),
  },
  CELESTIAL_NAVIGATION: {
    era: xml('Technologies', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_CELESTIAL_NAVIGATION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_CELESTIAL_NAVIGATION&PrereqTech=TECH_SAILING', 'PrereqTech', { expect: 'TECH_SAILING' }), xml('TechnologyPrereqs', 'Technology=TECH_CELESTIAL_NAVIGATION&PrereqTech=TECH_ASTROLOGY', 'PrereqTech', { expect: 'TECH_ASTROLOGY' })] },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'PrereqTech', { expect: 'TECH_CELESTIAL_NAVIGATION' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_LIGHTHOUSE', 'PrereqTech', { expect: 'TECH_CELESTIAL_NAVIGATION' }),
  },
  CURRENCY: {
    era: xml('Technologies', 'TechnologyType=TECH_CURRENCY', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CURRENCY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_CURRENCY&PrereqTech=TECH_WRITING', 'PrereqTech', { expect: 'TECH_WRITING' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'PrereqTech', { expect: 'TECH_CURRENCY' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_MARKET', 'PrereqTech', { expect: 'TECH_CURRENCY' }),
  },
  HORSEBACK_RIDING: {
    era: xml('Technologies', 'TechnologyType=TECH_HORSEBACK_RIDING', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_HORSEBACK_RIDING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_HORSEBACK_RIDING&PrereqTech=TECH_ARCHERY', 'PrereqTech', { expect: 'TECH_ARCHERY' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_STABLE', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' }),
  },
  MATHEMATICS: {
    era: xml('Technologies', 'TechnologyType=TECH_MATHEMATICS', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MATHEMATICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_MATHEMATICS&PrereqTech=TECH_CURRENCY', 'PrereqTech', { expect: 'TECH_CURRENCY' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'PrereqTech', { expect: 'TECH_MATHEMATICS' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_CONSULATE', 'PrereqTech', { expect: 'TECH_MATHEMATICS' }),
  },
  CONSTRUCTION: {
    era: xml('Technologies', 'TechnologyType=TECH_CONSTRUCTION', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CONSTRUCTION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_CONSTRUCTION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_CONSTRUCTION&PrereqTech=TECH_MASONRY', 'PrereqTech', { expect: 'TECH_MASONRY' }), xml('TechnologyPrereqs', 'Technology=TECH_CONSTRUCTION&PrereqTech=TECH_HORSEBACK_RIDING', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' })] },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_LUMBER_MILL', 'PrereqTech', { expect: 'TECH_CONSTRUCTION' }),
  },
  ENGINEERING: {
    era: xml('Technologies', 'TechnologyType=TECH_ENGINEERING', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ENGINEERING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_ENGINEERING&PrereqTech=TECH_THE_WHEEL', 'PrereqTech', { expect: 'TECH_THE_WHEEL' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'PrereqTech', { expect: 'TECH_ENGINEERING' }),
  },
  APPRENTICESHIP: {
    era: xml('Technologies', 'TechnologyType=TECH_APPRENTICESHIP', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_APPRENTICESHIP', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_APPRENTICESHIP, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_APPRENTICESHIP&PrereqTech=TECH_CURRENCY', 'PrereqTech', { expect: 'TECH_CURRENCY' }), xml('TechnologyPrereqs', 'Technology=TECH_APPRENTICESHIP&PrereqTech=TECH_HORSEBACK_RIDING', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' })] },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_WORKSHOP', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }),
    'effects.2.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MINE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_APPRENTICESHIP', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
    'effects.2.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MINE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_APPRENTICESHIP', 'BonusYieldChange'),
  },
  MILITARY_ENGINEERING: {
    era: xml('Technologies', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MILITARY_ENGINEERING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_MILITARY_ENGINEERING&PrereqTech=TECH_CONSTRUCTION', 'PrereqTech', { expect: 'TECH_CONSTRUCTION' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_ARMORY', 'PrereqTech', { expect: 'TECH_MILITARY_ENGINEERING' }),
  },
  EDUCATION: {
    era: xml('Technologies', 'TechnologyType=TECH_EDUCATION', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_EDUCATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_EDUCATION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_EDUCATION&PrereqTech=TECH_APPRENTICESHIP', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }), xml('TechnologyPrereqs', 'Technology=TECH_EDUCATION&PrereqTech=TECH_MATHEMATICS', 'PrereqTech', { expect: 'TECH_MATHEMATICS' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY', 'PrereqTech', { expect: 'TECH_EDUCATION' }),
  },
  BANKING: {
    era: xml('Technologies', 'TechnologyType=TECH_BANKING', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_BANKING', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_BANKING, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_BANKING&PrereqTech=TECH_EDUCATION', 'PrereqTech', { expect: 'TECH_EDUCATION' }), xml('TechnologyPrereqs', 'Technology=TECH_BANKING&PrereqTech=TECH_STIRRUPS', 'PrereqTech', { expect: 'TECH_STIRRUPS' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_BANK', 'PrereqTech', { expect: 'TECH_BANKING' }),
  },
  MASS_PRODUCTION: {
    era: xml('Technologies', 'TechnologyType=TECH_MASS_PRODUCTION', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MASS_PRODUCTION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_MASS_PRODUCTION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_MASS_PRODUCTION&PrereqTech=TECH_EDUCATION', 'PrereqTech', { expect: 'TECH_EDUCATION' }), xml('TechnologyPrereqs', 'Technology=TECH_MASS_PRODUCTION&PrereqTech=TECH_BUTTRESS', 'PrereqTech', { expect: 'TECH_BUTTRESS' }), xml('TechnologyPrereqs', 'Technology=TECH_MASS_PRODUCTION&PrereqTech=TECH_MILITARY_TACTICS', 'PrereqTech', { expect: 'TECH_MILITARY_TACTICS' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_SHIPYARD', 'PrereqTech', { expect: 'TECH_MASS_PRODUCTION' }),
  },
  ASTRONOMY: {
    era: xml('Technologies', 'TechnologyType=TECH_ASTRONOMY', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ASTRONOMY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_ASTRONOMY&PrereqTech=TECH_EDUCATION', 'PrereqTech', { expect: 'TECH_EDUCATION' }),
  },
  INDUSTRIALIZATION: {
    era: xml('Technologies', 'TechnologyType=TECH_INDUSTRIALIZATION', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_INDUSTRIALIZATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_INDUSTRIALIZATION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_INDUSTRIALIZATION&PrereqTech=TECH_SQUARE_RIGGING', 'PrereqTech', { expect: 'TECH_SQUARE_RIGGING' }), xml('TechnologyPrereqs', 'Technology=TECH_INDUSTRIALIZATION&PrereqTech=TECH_MASS_PRODUCTION', 'PrereqTech', { expect: 'TECH_MASS_PRODUCTION' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_FACTORY', 'PrereqTech', { expect: 'TECH_INDUSTRIALIZATION' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'PrereqTech', { expect: 'TECH_INDUSTRIALIZATION' }),
    'effects.2.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MINE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_INDUSTRIALIZATION', 'ImprovementType', { expect: 'IMPROVEMENT_MINE' }),
    'effects.2.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_MINE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_INDUSTRIALIZATION', 'BonusYieldChange'),
  },
  SCIENTIFIC_THEORY: {
    era: xml('Technologies', 'TechnologyType=TECH_SCIENTIFIC_THEORY', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SCIENTIFIC_THEORY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_SCIENTIFIC_THEORY, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_SCIENTIFIC_THEORY&PrereqTech=TECH_ASTRONOMY', 'PrereqTech', { expect: 'TECH_ASTRONOMY' }), xml('TechnologyPrereqs', 'Technology=TECH_SCIENTIFIC_THEORY&PrereqTech=TECH_BANKING', 'PrereqTech', { expect: 'TECH_BANKING' })] },
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PLANTATION&YieldType=YIELD_FOOD&PrereqTech=TECH_SCIENTIFIC_THEORY', 'ImprovementType', { expect: 'IMPROVEMENT_PLANTATION' }),
    'effects.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PLANTATION&YieldType=YIELD_FOOD&PrereqTech=TECH_SCIENTIFIC_THEORY', 'BonusYieldChange'),
  },
  SANITATION: {
    era: xml('Technologies', 'TechnologyType=TECH_SANITATION', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SANITATION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_SANITATION&PrereqTech=TECH_SCIENTIFIC_THEORY', 'PrereqTech', { expect: 'TECH_SCIENTIFIC_THEORY' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_SEWER', 'PrereqTech', { expect: 'TECH_SANITATION' }),
  },
  ECONOMICS: {
    era: xml('Technologies', 'TechnologyType=TECH_ECONOMICS', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ECONOMICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_ECONOMICS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_ECONOMICS&PrereqTech=TECH_SCIENTIFIC_THEORY', 'PrereqTech', { expect: 'TECH_SCIENTIFIC_THEORY' }), xml('TechnologyPrereqs', 'Technology=TECH_ECONOMICS&PrereqTech=TECH_METAL_CASTING', 'PrereqTech', { expect: 'TECH_METAL_CASTING' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_STOCK_EXCHANGE', 'PrereqTech', { expect: 'TECH_ECONOMICS' }),
  },
  MILITARY_SCIENCE: {
    era: xml('Technologies', 'TechnologyType=TECH_MILITARY_SCIENCE', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MILITARY_SCIENCE', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_MILITARY_SCIENCE, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_MILITARY_SCIENCE&PrereqTech=TECH_SIEGE_TACTICS', 'PrereqTech', { expect: 'TECH_SIEGE_TACTICS' }), xml('TechnologyPrereqs', 'Technology=TECH_MILITARY_SCIENCE&PrereqTech=TECH_PRINTING', 'PrereqTech', { expect: 'TECH_PRINTING' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
  },
  ELECTRICITY: {
    era: xml('Technologies', 'TechnologyType=TECH_ELECTRICITY', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ELECTRICITY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_ELECTRICITY&PrereqTech=TECH_STEAM_POWER', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }),
    'effects.2.building': xml('Buildings', 'BuildingType=BUILDING_HYDROELECTRIC_DAM', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }),
  },
  RADIO: {
    era: xml('Technologies', 'TechnologyType=TECH_RADIO', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_RADIO', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_RADIO, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_RADIO&PrereqTech=TECH_STEAM_POWER', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }), xml('TechnologyPrereqs', 'Technology=TECH_RADIO&PrereqTech=TECH_FLIGHT', 'PrereqTech', { expect: 'TECH_FLIGHT' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_BROADCAST_CENTER', 'PrereqTech', { expect: 'TECH_RADIO' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_BEACH_RESORT', 'PrereqTech', { expect: 'TECH_RADIO' }),
  },
  CHEMISTRY: {
    era: xml('Technologies', 'TechnologyType=TECH_CHEMISTRY', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CHEMISTRY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_CHEMISTRY, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_CHEMISTRY&PrereqTech=TECH_SANITATION', 'PrereqTech', { expect: 'TECH_SANITATION' }), xml('TechnologyPrereqs', 'Technology=TECH_CHEMISTRY&PrereqTech=TECH_REPLACEABLE_PARTS', 'PrereqTech', { expect: 'TECH_REPLACEABLE_PARTS' })] },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_MOUNTAIN_TUNNEL', 'PrereqTech', { expect: 'TECH_CHEMISTRY' }),
    'effects.1.building': xml('Buildings', 'BuildingType=BUILDING_RESEARCH_LAB', 'PrereqTech', { expect: 'TECH_CHEMISTRY' }),
  },
  STEEL: {
    era: xml('Technologies', 'TechnologyType=TECH_STEEL', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_STEEL', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_STEEL&PrereqTech=TECH_RIFLING', 'PrereqTech', { expect: 'TECH_RIFLING' }),
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_LUMBER_MILL&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_STEEL', 'ImprovementType', { expect: 'IMPROVEMENT_LUMBER_MILL' }),
    'effects.0.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_LUMBER_MILL&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_STEEL', 'BonusYieldChange'),
  },
  REPLACEABLE_PARTS: {
    era: xml('Technologies', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_REPLACEABLE_PARTS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_REPLACEABLE_PARTS&PrereqTech=TECH_ECONOMICS', 'PrereqTech', { expect: 'TECH_ECONOMICS' }),
    'effects.1.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_REPLACEABLE_PARTS', 'ImprovementType', { expect: 'IMPROVEMENT_PASTURE' }),
    'effects.1.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_REPLACEABLE_PARTS', 'BonusYieldChange'),
  },
  IRON_WORKING: {
    era: xml('Technologies', 'TechnologyType=TECH_IRON_WORKING', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_IRON_WORKING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_IRON_WORKING&PrereqTech=TECH_BRONZE_WORKING', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
  },
  SHIPBUILDING: {
    era: xml('Technologies', 'TechnologyType=TECH_SHIPBUILDING', 'EraType', { expect: 'ERA_CLASSICAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SHIPBUILDING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_SHIPBUILDING&PrereqTech=TECH_SAILING', 'PrereqTech', { expect: 'TECH_SAILING' }),
  },
  MACHINERY: {
    era: xml('Technologies', 'TechnologyType=TECH_MACHINERY', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MACHINERY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_MACHINERY, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_MACHINERY&PrereqTech=TECH_IRON_WORKING', 'PrereqTech', { expect: 'TECH_IRON_WORKING' }), xml('TechnologyPrereqs', 'Technology=TECH_MACHINERY&PrereqTech=TECH_ENGINEERING', 'PrereqTech', { expect: 'TECH_ENGINEERING' })] },
  },
  BUTTRESS: {
    era: xml('Technologies', 'TechnologyType=TECH_BUTTRESS', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_BUTTRESS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_BUTTRESS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_BUTTRESS&PrereqTech=TECH_SHIPBUILDING', 'PrereqTech', { expect: 'TECH_SHIPBUILDING' }), xml('TechnologyPrereqs', 'Technology=TECH_BUTTRESS&PrereqTech=TECH_MATHEMATICS', 'PrereqTech', { expect: 'TECH_MATHEMATICS' })] },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_DAM', 'PrereqTech', { expect: 'TECH_BUTTRESS' }),
  },
  MILITARY_TACTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_MILITARY_TACTICS', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_MILITARY_TACTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_MILITARY_TACTICS&PrereqTech=TECH_MATHEMATICS', 'PrereqTech', { expect: 'TECH_MATHEMATICS' }),
  },
  STIRRUPS: {
    era: xml('Technologies', 'TechnologyType=TECH_STIRRUPS', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_STIRRUPS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_STIRRUPS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_STIRRUPS&PrereqTech=TECH_HORSEBACK_RIDING', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' }), xml('TechnologyPrereqs', 'Technology=TECH_STIRRUPS&PrereqTech=TECH_APPRENTICESHIP', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' })] },
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_FOOD&PrereqTech=TECH_STIRRUPS', 'ImprovementType', { expect: 'IMPROVEMENT_PASTURE' }),
    'effects.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_FOOD&PrereqTech=TECH_STIRRUPS', 'BonusYieldChange'),
  },
  CASTLES: {
    era: xml('Technologies', 'TechnologyType=TECH_CASTLES', 'EraType', { expect: 'ERA_MEDIEVAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CASTLES', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_CASTLES&PrereqTech=TECH_CONSTRUCTION', 'PrereqTech', { expect: 'TECH_CONSTRUCTION' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_CASTLE', 'PrereqTech', { expect: 'TECH_CASTLES' }),
  },
  GUNPOWDER: {
    era: xml('Technologies', 'TechnologyType=TECH_GUNPOWDER', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_GUNPOWDER', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_GUNPOWDER, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_GUNPOWDER&PrereqTech=TECH_APPRENTICESHIP', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }), xml('TechnologyPrereqs', 'Technology=TECH_GUNPOWDER&PrereqTech=TECH_STIRRUPS', 'PrereqTech', { expect: 'TECH_STIRRUPS' }), xml('TechnologyPrereqs', 'Technology=TECH_GUNPOWDER&PrereqTech=TECH_MILITARY_ENGINEERING', 'PrereqTech', { expect: 'TECH_MILITARY_ENGINEERING' })] },
  },
  METAL_CASTING: {
    era: xml('Technologies', 'TechnologyType=TECH_METAL_CASTING', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_METAL_CASTING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_METAL_CASTING&PrereqTech=TECH_GUNPOWDER', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
  },
  CARTOGRAPHY: {
    era: xml('Technologies', 'TechnologyType=TECH_CARTOGRAPHY', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CARTOGRAPHY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_CARTOGRAPHY&PrereqTech=TECH_BUTTRESS', 'PrereqTech', { expect: 'TECH_BUTTRESS' }),
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_FISHING_BOATS&YieldType=YIELD_GOLD&PrereqTech=TECH_CARTOGRAPHY', 'ImprovementType', { expect: 'IMPROVEMENT_FISHING_BOATS' }),
    'effects.0.yields.gold': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_FISHING_BOATS&YieldType=YIELD_GOLD&PrereqTech=TECH_CARTOGRAPHY', 'BonusYieldChange'),
  },
  PRINTING: {
    era: xml('Technologies', 'TechnologyType=TECH_PRINTING', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_PRINTING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_PRINTING&PrereqTech=TECH_MACHINERY', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
  },
  SQUARE_RIGGING: {
    era: xml('Technologies', 'TechnologyType=TECH_SQUARE_RIGGING', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SQUARE_RIGGING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_SQUARE_RIGGING&PrereqTech=TECH_CARTOGRAPHY', 'PrereqTech', { expect: 'TECH_CARTOGRAPHY' }),
  },
  SIEGE_TACTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_SIEGE_TACTICS', 'EraType', { expect: 'ERA_RENAISSANCE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SIEGE_TACTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_SIEGE_TACTICS&PrereqTech=TECH_CASTLES', 'PrereqTech', { expect: 'TECH_CASTLES' }),
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'PrereqTech', { expect: 'TECH_SIEGE_TACTICS' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_FORT', 'PrereqTech', { expect: 'TECH_SIEGE_TACTICS' }),
  },
  STEAM_POWER: {
    era: xml('Technologies', 'TechnologyType=TECH_STEAM_POWER', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_STEAM_POWER', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_STEAM_POWER&PrereqTech=TECH_INDUSTRIALIZATION', 'PrereqTech', { expect: 'TECH_INDUSTRIALIZATION' }),
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_CANAL', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }),
  },
  BALLISTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_BALLISTICS', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_BALLISTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_BALLISTICS&PrereqTech=TECH_METAL_CASTING', 'PrereqTech', { expect: 'TECH_METAL_CASTING' }),
  },
  RIFLING: {
    era: xml('Technologies', 'TechnologyType=TECH_RIFLING', 'EraType', { expect: 'ERA_INDUSTRIAL' }),
    cost: xml('Technologies', 'TechnologyType=TECH_RIFLING', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_RIFLING, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_RIFLING&PrereqTech=TECH_BALLISTICS', 'PrereqTech', { expect: 'TECH_BALLISTICS' }), xml('TechnologyPrereqs', 'Technology=TECH_RIFLING&PrereqTech=TECH_MILITARY_SCIENCE', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' })] },
  },
  FLIGHT: {
    era: xml('Technologies', 'TechnologyType=TECH_FLIGHT', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_FLIGHT', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_FLIGHT, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_FLIGHT&PrereqTech=TECH_INDUSTRIALIZATION', 'PrereqTech', { expect: 'TECH_INDUSTRIALIZATION' }), xml('TechnologyPrereqs', 'Technology=TECH_FLIGHT&PrereqTech=TECH_SCIENTIFIC_THEORY', 'PrereqTech', { expect: 'TECH_SCIENTIFIC_THEORY' })] },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_AIRSTRIP', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
  },
  COMBUSTION: {
    era: xml('Technologies', 'TechnologyType=TECH_COMBUSTION', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_COMBUSTION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_COMBUSTION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_COMBUSTION&PrereqTech=TECH_STEEL', 'PrereqTech', { expect: 'TECH_STEEL' }), xml('TechnologyPrereqs', 'Technology=TECH_COMBUSTION&PrereqTech=TECH_REFINING', 'PrereqTech', { expect: 'TECH_REFINING' })] },
  },
  REFINING: {
    era: xml('Technologies', 'TechnologyType=TECH_REFINING', 'EraType', { expect: 'ERA_MODERN' }),
    cost: xml('Technologies', 'TechnologyType=TECH_REFINING', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_REFINING&PrereqTech=TECH_RIFLING', 'PrereqTech', { expect: 'TECH_RIFLING' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_OIL_WELL', 'PrereqTech', { expect: 'TECH_REFINING' }),
  },
  PLASTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_PLASTICS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_PLASTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_PLASTICS&PrereqTech=TECH_COMBUSTION', 'PrereqTech', { expect: 'TECH_COMBUSTION' }),
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_FISHING_BOATS&YieldType=YIELD_FOOD&PrereqTech=TECH_PLASTICS', 'ImprovementType', { expect: 'IMPROVEMENT_FISHING_BOATS' }),
    'effects.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_FISHING_BOATS&YieldType=YIELD_FOOD&PrereqTech=TECH_PLASTICS', 'BonusYieldChange'),
  },
  COMPUTERS: {
    era: xml('Technologies', 'TechnologyType=TECH_COMPUTERS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_COMPUTERS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_COMPUTERS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_COMPUTERS&PrereqTech=TECH_ELECTRICITY', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }), xml('TechnologyPrereqs', 'Technology=TECH_COMPUTERS&PrereqTech=TECH_RADIO', 'PrereqTech', { expect: 'TECH_RADIO' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'PrereqTech', { expect: 'TECH_COMPUTERS' }),
  },
  NUCLEAR_FISSION: {
    era: xml('Technologies', 'TechnologyType=TECH_NUCLEAR_FISSION', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_NUCLEAR_FISSION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_NUCLEAR_FISSION, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_NUCLEAR_FISSION&PrereqTech=TECH_ADVANCED_BALLISTICS', 'PrereqTech', { expect: 'TECH_ADVANCED_BALLISTICS' }), xml('TechnologyPrereqs', 'Technology=TECH_NUCLEAR_FISSION&PrereqTech=TECH_COMBINED_ARMS', 'PrereqTech', { expect: 'TECH_COMBINED_ARMS' })] },
    'effects.0.building': xml('Buildings', 'BuildingType=BUILDING_POWER_PLANT', 'PrereqTech', { expect: 'TECH_NUCLEAR_FISSION' }),
  },
  ROCKETRY: {
    era: xml('Technologies', 'TechnologyType=TECH_ROCKETRY', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ROCKETRY', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_ROCKETRY, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_ROCKETRY&PrereqTech=TECH_RADIO', 'PrereqTech', { expect: 'TECH_RADIO' }), xml('TechnologyPrereqs', 'Technology=TECH_ROCKETRY&PrereqTech=TECH_CHEMISTRY', 'PrereqTech', { expect: 'TECH_CHEMISTRY' })] },
    'effects.0.district': xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'PrereqTech', { expect: 'TECH_ROCKETRY' }),
    'effects.1.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_MISSILE_SILO', 'PrereqTech', { expect: 'TECH_ROCKETRY' }),
    'effects.2.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_ROCKETRY', 'ImprovementType', { expect: 'IMPROVEMENT_QUARRY' }),
    'effects.2.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_ROCKETRY', 'BonusYieldChange'),
  },
  ADVANCED_FLIGHT: {
    era: xml('Technologies', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ADVANCED_FLIGHT', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_ADVANCED_FLIGHT&PrereqTech=TECH_RADIO', 'PrereqTech', { expect: 'TECH_RADIO' }),
  },
  COMBINED_ARMS: {
    era: xml('Technologies', 'TechnologyType=TECH_COMBINED_ARMS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_COMBINED_ARMS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_COMBINED_ARMS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_COMBINED_ARMS&PrereqTech=TECH_STEEL', 'PrereqTech', { expect: 'TECH_STEEL' }), xml('TechnologyPrereqs', 'Technology=TECH_COMBINED_ARMS&PrereqTech=TECH_COMBUSTION', 'PrereqTech', { expect: 'TECH_COMBUSTION' })] },
  },
  ADVANCED_BALLISTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ADVANCED_BALLISTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_ADVANCED_BALLISTICS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_ADVANCED_BALLISTICS&PrereqTech=TECH_REPLACEABLE_PARTS', 'PrereqTech', { expect: 'TECH_REPLACEABLE_PARTS' }), xml('TechnologyPrereqs', 'Technology=TECH_ADVANCED_BALLISTICS&PrereqTech=TECH_STEEL', 'PrereqTech', { expect: 'TECH_STEEL' })] },
  },
  SYNTHETIC_MATERIALS: {
    era: xml('Technologies', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'EraType', { expect: 'ERA_ATOMIC' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SYNTHETIC_MATERIALS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_SYNTHETIC_MATERIALS&PrereqTech=TECH_PLASTICS', 'PrereqTech', { expect: 'TECH_PLASTICS' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_GEOTHERMAL_PLANT', 'PrereqTech', { expect: 'TECH_SYNTHETIC_MATERIALS' }),
    'effects.1.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_GOLD&PrereqTech=TECH_SYNTHETIC_MATERIALS', 'ImprovementType', { expect: 'IMPROVEMENT_CAMP' }),
    'effects.1.yields.gold': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_GOLD&PrereqTech=TECH_SYNTHETIC_MATERIALS', 'BonusYieldChange'),
  },
  COMPOSITES: {
    era: xml('Technologies', 'TechnologyType=TECH_COMPOSITES', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_COMPOSITES', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_COMPOSITES&PrereqTech=TECH_SYNTHETIC_MATERIALS', 'PrereqTech', { expect: 'TECH_SYNTHETIC_MATERIALS' }),
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_WIND_FARM', 'PrereqTech', { expect: 'TECH_COMPOSITES' }),
  },
  STEALTH_TECHNOLOGY: {
    era: xml('Technologies', 'TechnologyType=TECH_STEALTH_TECHNOLOGY', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_STEALTH_TECHNOLOGY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_STEALTH_TECHNOLOGY&PrereqTech=TECH_SYNTHETIC_MATERIALS', 'PrereqTech', { expect: 'TECH_SYNTHETIC_MATERIALS' }),
  },
  SATELLITES: {
    era: xml('Technologies', 'TechnologyType=TECH_SATELLITES', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SATELLITES', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_SATELLITES, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_SATELLITES&PrereqTech=TECH_ADVANCED_FLIGHT', 'PrereqTech', { expect: 'TECH_ADVANCED_FLIGHT' }), xml('TechnologyPrereqs', 'Technology=TECH_SATELLITES&PrereqTech=TECH_ROCKETRY', 'PrereqTech', { expect: 'TECH_ROCKETRY' })] },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_SOLAR_FARM', 'PrereqTech', { expect: 'TECH_SATELLITES' }),
  },
  GUIDANCE_SYSTEMS: {
    era: xml('Technologies', 'TechnologyType=TECH_GUIDANCE_SYSTEMS', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_GUIDANCE_SYSTEMS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_GUIDANCE_SYSTEMS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_GUIDANCE_SYSTEMS&PrereqTech=TECH_ROCKETRY', 'PrereqTech', { expect: 'TECH_ROCKETRY' }), xml('TechnologyPrereqs', 'Technology=TECH_GUIDANCE_SYSTEMS&PrereqTech=TECH_ADVANCED_BALLISTICS', 'PrereqTech', { expect: 'TECH_ADVANCED_BALLISTICS' })] },
  },
  LASERS: {
    era: xml('Technologies', 'TechnologyType=TECH_LASERS', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_LASERS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_LASERS&PrereqTech=TECH_NUCLEAR_FISSION', 'PrereqTech', { expect: 'TECH_NUCLEAR_FISSION' }),
  },
  NANOTECHNOLOGY: {
    era: xml('Technologies', 'TechnologyType=TECH_NANOTECHNOLOGY', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_NANOTECHNOLOGY', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_NANOTECHNOLOGY&PrereqTech=TECH_COMPOSITES', 'PrereqTech', { expect: 'TECH_COMPOSITES' }),
  },
  NUCLEAR_FUSION: {
    era: xml('Technologies', 'TechnologyType=TECH_NUCLEAR_FUSION', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_NUCLEAR_FUSION', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_NUCLEAR_FUSION&PrereqTech=TECH_LASERS', 'PrereqTech', { expect: 'TECH_LASERS' }),
  },
  ROBOTICS: {
    era: xml('Technologies', 'TechnologyType=TECH_ROBOTICS', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ROBOTICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { derived: 'the TechnologyPrereqs rows of TECH_ROBOTICS, read as an AND-list', inputs: [xml('TechnologyPrereqs', 'Technology=TECH_ROBOTICS&PrereqTech=TECH_COMPUTERS', 'PrereqTech', { expect: 'TECH_COMPUTERS' }), xml('TechnologyPrereqs', 'Technology=TECH_ROBOTICS&PrereqTech=TECH_SATELLITES', 'PrereqTech', { expect: 'TECH_SATELLITES' }), xml('TechnologyPrereqs', 'Technology=TECH_ROBOTICS&PrereqTech=TECH_GUIDANCE_SYSTEMS', 'PrereqTech', { expect: 'TECH_GUIDANCE_SYSTEMS' }), xml('TechnologyPrereqs', 'Technology=TECH_ROBOTICS&PrereqTech=TECH_LASERS', 'PrereqTech', { expect: 'TECH_LASERS' })] },
    'effects.0.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_FOOD&PrereqTech=TECH_ROBOTICS', 'ImprovementType', { expect: 'IMPROVEMENT_PASTURE' }),
    'effects.0.yields.food': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_FOOD&PrereqTech=TECH_ROBOTICS', 'BonusYieldChange'),
  },
  TELECOMMUNICATIONS: {
    era: xml('Technologies', 'TechnologyType=TECH_TELECOMMUNICATIONS', 'EraType', { expect: 'ERA_INFORMATION' }),
    cost: xml('Technologies', 'TechnologyType=TECH_TELECOMMUNICATIONS', 'Cost', { scale: GAME_SPEED }),
    prereqs: xml('TechnologyPrereqs', 'Technology=TECH_TELECOMMUNICATIONS&PrereqTech=TECH_COMPUTERS', 'PrereqTech', { expect: 'TECH_COMPUTERS' }),
  },
  OFFWORLD_MISSION: {
    era: xml('Technologies', 'TechnologyType=TECH_OFFWORLD_MISSION', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_OFFWORLD_MISSION', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_OFFWORLD_MISSION (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  SMART_MATERIALS: {
    era: xml('Technologies', 'TechnologyType=TECH_SMART_MATERIALS', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_SMART_MATERIALS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_SMART_MATERIALS (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  ADVANCED_POWER_CELLS: {
    era: xml('Technologies', 'TechnologyType=TECH_ADVANCED_POWER_CELLS', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ADVANCED_POWER_CELLS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_ADVANCED_POWER_CELLS (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  ADVANCED_AI: {
    era: xml('Technologies', 'TechnologyType=TECH_ADVANCED_AI', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_ADVANCED_AI', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_ADVANCED_AI (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  CYBERNETICS: {
    era: xml('Technologies', 'TechnologyType=TECH_CYBERNETICS', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_CYBERNETICS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_CYBERNETICS (its only published gate is the era); the deepest node this tree carries stands in' },
  },
  PREDICTIVE_SYSTEMS: {
    era: xml('Technologies', 'TechnologyType=TECH_PREDICTIVE_SYSTEMS', 'EraType', { expect: 'ERA_FUTURE' }),
    cost: xml('Technologies', 'TechnologyType=TECH_PREDICTIVE_SYSTEMS', 'Cost', { scale: GAME_SPEED }),
    prereqs: { stylized: 'the install writes no TechnologyPrereqs row for TECH_PREDICTIVE_SYSTEMS (its only published gate is the era); the deepest node this tree carries stands in' },
    'effects.0.improvement': xml('Improvements', 'ImprovementType=IMPROVEMENT_OFFSHORE_WIND_FARM', 'PrereqTech', { expect: 'TECH_PREDICTIVE_SYSTEMS' }),
    'effects.1.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_PREDICTIVE_SYSTEMS', 'ImprovementType', { expect: 'IMPROVEMENT_QUARRY' }),
    'effects.1.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_PREDICTIVE_SYSTEMS', 'BonusYieldChange'),
    'effects.2.improvement': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_OIL_WELL&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_PREDICTIVE_SYSTEMS', 'ImprovementType', { expect: 'IMPROVEMENT_OIL_WELL' }),
    'effects.2.yields.production': xml('Improvement_BonusYieldChanges', 'ImprovementType=IMPROVEMENT_OIL_WELL&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_PREDICTIVE_SYSTEMS', 'BonusYieldChange'),
  },
};

const T = (
  id: string,
  name: string,
  era: Era,
  cost: number,
  prereqs: string[],
  effects: ResearchEffect[] = [],
): TechDef => ({
  id, name, era, cost: Math.round(cost * GAME_SPEED), prereqs, effects,
  ...(TECH_SRC[id] ? { src: TECH_SRC[id] } : {}),
});

export const TECHS: Record<string, TechDef> = Object.fromEntries(
  [
    T('POTTERY', 'Pottery', 'Ancient', 25, [], [
      { kind: 'unlockBuilding', building: 'GRANARY' },
      { kind: 'unlockImprovement', improvement: 'MEKEWAP' }, // CIV6 (Mekewap): PrereqTech
    ]),
    T('ANIMAL_HUSBANDRY', 'Animal Husbandry', 'Ancient', 25, [], [
      { kind: 'unlockImprovement', improvement: 'PASTURE' },
      { kind: 'unlockImprovement', improvement: 'CAMP' },
      { kind: 'unlockImprovement', improvement: 'KURGAN' }, // CIV6 (Kurgan): PrereqTech
    ]),
    T('MINING', 'Mining', 'Ancient', 25, [], [
      { kind: 'unlockImprovement', improvement: 'MINE' },
      { kind: 'unlockImprovement', improvement: 'QUARRY' },
      { kind: 'unlockFeatureRemoval', feature: 'WOODS' },
    ]),
    T('SAILING', 'Sailing', 'Ancient', 50, [], [
      { kind: 'unlockImprovement', improvement: 'FISHING_BOATS' },
      // CIV6 (IMPROVEMENT_FISHERY, PrereqTech): the TECH opens the row; the
      // AQUACULTURE governor promotion opens the CITY.
      { kind: 'unlockImprovement', improvement: 'FISHERY' },
    ]),
    T('ARCHERY', 'Archery', 'Ancient', 50, ['ANIMAL_HUSBANDRY']),
    T('ASTROLOGY', 'Astrology', 'Ancient', 50, [], [
      { kind: 'unlockDistrict', district: 'HOLY_SITE' },
      { kind: 'unlockBuilding', building: 'SHRINE' },
    ]),
    T('IRRIGATION', 'Irrigation', 'Ancient', 50, ['POTTERY'], [
      { kind: 'unlockImprovement', improvement: 'PLANTATION' },
      { kind: 'unlockFeatureRemoval', feature: 'MARSH' },
      { kind: 'unlockImprovement', improvement: 'STEPWELL' }, // CIV6 (Stepwell): PrereqTech
    ]),
    T('WRITING', 'Writing', 'Ancient', 50, ['POTTERY'], [
      { kind: 'unlockDistrict', district: 'CAMPUS' },
      { kind: 'unlockBuilding', building: 'LIBRARY' },
    ]),
    T('MASONRY', 'Masonry', 'Ancient', 80, ['MINING'], [
      { kind: 'unlockBuilding', building: 'ANCIENT_WALLS' },
      { kind: 'unlockImprovement', improvement: 'GREAT_WALL' }, // CIV6 (Great Wall): PrereqTech
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
    T('MATHEMATICS', 'Mathematics', 'Classical', 200, ['CURRENCY'], [
      { kind: 'unlockDistrict', district: 'DIPLOMATIC_QUARTER' },
      { kind: 'unlockBuilding', building: 'CONSULATE' },
    ]),
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
    ]),
    T('EDUCATION', 'Education', 'Medieval', 390, ['APPRENTICESHIP', 'MATHEMATICS'], [
      { kind: 'unlockBuilding', building: 'UNIVERSITY' },
      { kind: 'unlockImprovement', improvement: 'MISSION' }, // CIV6 (Mission): PrereqTech
    ]),
    T('BANKING', 'Banking', 'Renaissance', 600, ['EDUCATION', 'STIRRUPS'], [
      { kind: 'unlockBuilding', building: 'BANK' },
      // no Quarry clause: Improvement_BonusYieldChanges has NO row for the
      // Quarry at TECH_BANKING (its bonus rows are +1 Production at Gunpowder,
      // Rocketry and Predictive Systems).
    ]),

    T('MASS_PRODUCTION', 'Mass Production', 'Renaissance', 600, ['EDUCATION', 'BUTTRESS', 'MILITARY_TACTICS'], [
      { kind: 'unlockBuilding', building: 'SHIPYARD' },
    ]),
    T('ASTRONOMY', 'Astronomy', 'Renaissance', 730, ['EDUCATION']),

    T('INDUSTRIALIZATION', 'Industrialization', 'Industrial', 930, ['SQUARE_RIGGING', 'MASS_PRODUCTION'], [
      { kind: 'unlockBuilding', building: 'FACTORY' },
      { kind: 'unlockBuilding', building: 'COAL_POWER_PLANT' },
      { kind: 'improvementYields', improvement: 'MINE', yields: { production: 1 } },
    ]),
    T('SCIENTIFIC_THEORY', 'Scientific Theory', 'Industrial', 930, ['ASTRONOMY', 'BANKING'], [
      // CIV6 (Plantation): "+1 Food (requires Scientific Theory)".
      { kind: 'improvementYields', improvement: 'PLANTATION', yields: { food: 1 } },
    ]),
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
      { kind: 'unlockBuilding', building: 'OIL_POWER_PLANT' },
      { kind: 'unlockBuilding', building: 'SEAPORT' },
      { kind: 'unlockBuilding', building: 'HYDROELECTRIC_DAM' },
    ]),
    T('RADIO', 'Radio', 'Modern', 1370, ['STEAM_POWER', 'FLIGHT'], [
      { kind: 'unlockBuilding', building: 'BROADCAST_CENTER' },
      { kind: 'unlockImprovement', improvement: 'SEASIDE_RESORT' },
    ]),
    T('CHEMISTRY', 'Chemistry', 'Modern', 1370, ['SANITATION', 'REPLACEABLE_PARTS'], [
      { kind: 'unlockImprovement', improvement: 'MOUNTAIN_TUNNEL' },
      { kind: 'unlockBuilding', building: 'RESEARCH_LAB' },
    ]),
    T('STEEL', 'Steel', 'Modern', 1250, ['RIFLING'], [
      // CIV6 (Lumber Mill): "+1 Production (requires Steel)".
      { kind: 'improvementYields', improvement: 'LUMBER_MILL', yields: { production: 1 } },
    ]),
    T('REPLACEABLE_PARTS', 'Replaceable Parts', 'Modern', 1250, ['ECONOMICS'], [
      { kind: 'farmAdjacency' },
      // Improvement_BonusYieldChanges row 232.
      { kind: 'improvementYields', improvement: 'PASTURE', yields: { production: 1 } },
    ]),


    T('IRON_WORKING', 'Iron Working', 'Classical', 120, ['BRONZE_WORKING']),
    T('SHIPBUILDING', 'Shipbuilding', 'Classical', 200, ['SAILING']),

    T('MACHINERY', 'Machinery', 'Medieval', 300, ['IRON_WORKING', 'ENGINEERING']),
    T('BUTTRESS', 'Buttress', 'Medieval', 300, ['SHIPBUILDING', 'MATHEMATICS'], [
      { kind: 'unlockDistrict', district: 'DAM' },
    ]),
    T('MILITARY_TACTICS', 'Military Tactics', 'Medieval', 300, ['MATHEMATICS']),
    T('STIRRUPS', 'Stirrups', 'Medieval', 390, ['HORSEBACK_RIDING', 'APPRENTICESHIP'], [
      // CIV6 (Pasture): "+1 Food (requires Stirrups)".
      { kind: 'improvementYields', improvement: 'PASTURE', yields: { food: 1 } },
    ]),
    T('CASTLES', 'Castles', 'Medieval', 390, ['CONSTRUCTION'], [
      { kind: 'unlockBuilding', building: 'MEDIEVAL_WALLS' },
    ]),

    T('GUNPOWDER', 'Gunpowder', 'Renaissance', 600, ['APPRENTICESHIP', 'STIRRUPS', 'MILITARY_ENGINEERING']),
    T('METAL_CASTING', 'Metal Casting', 'Renaissance', 730, ['GUNPOWDER']),
    T('CARTOGRAPHY', 'Cartography', 'Renaissance', 600, ['BUTTRESS'], [
      // CIV6 (Fishing Boats): "+2 Gold (requires Cartography)".
      { kind: 'improvementYields', improvement: 'FISHING_BOATS', yields: { gold: 2 } },
    ]),
    T('PRINTING', 'Printing', 'Renaissance', 600, ['MACHINERY']),
    T('SQUARE_RIGGING', 'Square Rigging', 'Renaissance', 730, ['CARTOGRAPHY']),
    T('SIEGE_TACTICS', 'Siege Tactics', 'Renaissance', 730, ['CASTLES'], [
      { kind: 'unlockBuilding', building: 'RENAISSANCE_WALLS' },
      // Improvements.xml: IMPROVEMENT_FORT's PrereqTech is TECH_SIEGE_TACTICS,
      // NOT Military Engineering (which only trains the Military Engineer that
      // places it). Until #264 the Fort hung off Military Engineering here and
      // the row's comment asserted the install said so.
      { kind: 'unlockImprovement', improvement: 'FORT' },
    ]),

    T('STEAM_POWER', 'Steam Power', 'Industrial', 1070, ['INDUSTRIALIZATION'], [
      { kind: 'unlockDistrict', district: 'CANAL' },
    ]),
    T('BALLISTICS', 'Ballistics', 'Industrial', 930, ['METAL_CASTING']),
    T('RIFLING', 'Rifling', 'Industrial', 1070, ['BALLISTICS', 'MILITARY_SCIENCE']),

    T('FLIGHT', 'Flight', 'Modern', 1250, ['INDUSTRIALIZATION', 'SCIENTIFIC_THEORY'], [
      { kind: 'unlockImprovement', improvement: 'AIRSTRIP' },
    ]),
    T('COMBUSTION', 'Combustion', 'Modern', 1370, ['STEEL', 'REFINING']),
    T('REFINING', 'Refining', 'Modern', 1250, ['RIFLING'], [
      // Expansion2_Improvements.xml: IMPROVEMENT_OIL_WELL's PrereqTech is
      // TECH_REFINING (GS moved it off Steel).
      { kind: 'unlockImprovement', improvement: 'OIL_WELL' },
    ]),
    T('PLASTICS', 'Plastics', 'Atomic', 1480, ['COMBUSTION'], [
      // CIV6 (Fishing Boats): "+1 Food (requires Plastics)".
      { kind: 'improvementYields', improvement: 'FISHING_BOATS', yields: { food: 1 } },
    ]),

    T('COMPUTERS', 'Computers', 'Atomic', 1660, ['ELECTRICITY', 'RADIO'], [
      { kind: 'unlockBuilding', building: 'FLOOD_BARRIER' },
    ]),
    T('NUCLEAR_FISSION', 'Nuclear Fission', 'Atomic', 1660, ['ADVANCED_BALLISTICS', 'COMBINED_ARMS'], [
      { kind: 'unlockBuilding', building: 'NUCLEAR_POWER_PLANT' },
    ]),
    T('ROCKETRY', 'Rocketry', 'Atomic', 1480, ['RADIO', 'CHEMISTRY'], [
      { kind: 'unlockDistrict', district: 'SPACEPORT' },
      { kind: 'unlockImprovement', improvement: 'MISSILE_SILO' },
      // CIV6 (Quarry): "+1 Production (requires Rocketry)".
      { kind: 'improvementYields', improvement: 'QUARRY', yields: { production: 1 } },
    ]),
    T('ADVANCED_FLIGHT', 'Advanced Flight', 'Atomic', 1480, ['RADIO']),
    T('COMBINED_ARMS', 'Combined Arms', 'Atomic', 1480, ['STEEL', 'COMBUSTION']),
    T('ADVANCED_BALLISTICS', 'Advanced Ballistics', 'Atomic', 1480, ['REPLACEABLE_PARTS', 'STEEL']),
    T('SYNTHETIC_MATERIALS', 'Synthetic Materials', 'Atomic', 1660, ['PLASTICS'], [
      { kind: 'unlockImprovement', improvement: 'GEOTHERMAL_PLANT' },
      // Improvement_BonusYieldChanges row 225: the Camp's Synthetic Materials
      // bonus is +2 Gold.
      { kind: 'improvementYields', improvement: 'CAMP', yields: { gold: 2 } },
    ]),
    T('COMPOSITES', 'Composites', 'Information', 1850, ['SYNTHETIC_MATERIALS'], [
      { kind: 'unlockImprovement', improvement: 'WIND_FARM' },
    ]),
    T('STEALTH_TECHNOLOGY', 'Stealth Technology', 'Information', 1850, ['SYNTHETIC_MATERIALS']),

    T('SATELLITES', 'Satellites', 'Information', 1850, ['ADVANCED_FLIGHT', 'ROCKETRY'], [
      { kind: 'unlockImprovement', improvement: 'SOLAR_FARM' },
    ]),
    T('GUIDANCE_SYSTEMS', 'Guidance Systems', 'Information', 1850, ['ROCKETRY', 'ADVANCED_BALLISTICS']),
    T('LASERS', 'Lasers', 'Information', 1850, ['NUCLEAR_FISSION']),
    T('NANOTECHNOLOGY', 'Nanotechnology', 'Information', 2155, ['COMPOSITES']),
    T('NUCLEAR_FUSION', 'Nuclear Fusion', 'Information', 2155, ['LASERS']),
    T('ROBOTICS', 'Robotics', 'Information', 2155, ['COMPUTERS', 'SATELLITES', 'GUIDANCE_SYSTEMS', 'LASERS'], [
      // Improvement_BonusYieldChanges row 233: the Pasture's Robotics bonus is
      // +1 FOOD. Its +1 Production is row 232, at Replaceable Parts.
      { kind: 'improvementYields', improvement: 'PASTURE', yields: { food: 1 } },
    ]),
    T('TELECOMMUNICATIONS', 'Telecommunications', 'Information', 1850, ['COMPUTERS']),

    // CIV6: the Future techs' only published gate is the Future ERA; the
    // deepest Information-era nodes stand in as prereqs.
    T('OFFWORLD_MISSION', 'Offworld Mission', 'Future', 2500, ['TELECOMMUNICATIONS', 'NUCLEAR_FUSION']),
    T('SMART_MATERIALS', 'Smart Materials', 'Future', 2200, ['NANOTECHNOLOGY', 'ROBOTICS']),
    T('ADVANCED_POWER_CELLS', 'Advanced Power Cells', 'Future', 2200, ['NUCLEAR_FUSION']),
    // The two Future nodes the GIANT DEATH ROBOT's other upgrades hang on.
    // Their published cost is "2200 or 2300", the same pair the two rows
    // above carry, and this catalog reads that pair as 2200 throughout.
    T('ADVANCED_AI', 'Advanced AI', 'Future', 2200, ['ROBOTICS']),
    T('CYBERNETICS', 'Cybernetics', 'Future', 2200, ['ROBOTICS', 'NANOTECHNOLOGY']),
    // CIV6 (Predictive Systems): Future era, 2200 Science, "Unlocks Offshore
    // Wind Farm improvement" and "+1 Production to Quarry, Oil Well, and Oil
    // Rig improvements" — the Oil Rig's share waits on an improvement this
    // catalog does not hold.
    T('PREDICTIVE_SYSTEMS', 'Predictive Systems', 'Future', 2200, ['TELECOMMUNICATIONS', 'ROBOTICS'], [
      { kind: 'unlockImprovement', improvement: 'OFFSHORE_WIND_FARM' },
      { kind: 'improvementYields', improvement: 'QUARRY', yields: { production: 1 } },
      { kind: 'improvementYields', improvement: 'OIL_WELL', yields: { production: 1 } },
    ]),
  ].map((t) => [t.id, t]),
);
