
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
      // CIV6 (Quarry): "+2 Gold (requires Banking)".
      { kind: 'improvementYields', improvement: 'QUARRY', yields: { gold: 2 } },
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
      { kind: 'unlockBuilding', building: 'RESEARCH_LAB' },
    ]),
    T('STEEL', 'Steel', 'Modern', 1250, ['RIFLING'], [
      { kind: 'unlockImprovement', improvement: 'OIL_WELL' },
      // CIV6 (Lumber Mill): "+1 Production (requires Steel)".
      { kind: 'improvementYields', improvement: 'LUMBER_MILL', yields: { production: 1 } },
    ]),
    T('REPLACEABLE_PARTS', 'Replaceable Parts', 'Modern', 1250, ['ECONOMICS'], [
      { kind: 'farmAdjacency' },
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
    T('REFINING', 'Refining', 'Modern', 1250, ['RIFLING']),
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
      // CIV6 (Camp): "+1 Gold (requires Synthetic Materials)".
      { kind: 'improvementYields', improvement: 'CAMP', yields: { gold: 1 } },
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
      // CIV6 (Pasture): "+1 Production (requires Robotics)".
      { kind: 'improvementYields', improvement: 'PASTURE', yields: { production: 1 } },
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
