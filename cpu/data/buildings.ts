/**
 * Buildings (base game, available to every civ; no wonders, no walls).
 * Every `cost` IS the install's `Buildings.Cost` for the row, through the
 * GAME_SPEED scale the row builder at the foot of this file applies — a
 * unique variant's `cost` is its OWN install row's Cost, never a ratio.
 * Yields are the row's `Building_YieldChanges` rows and nothing else: a
 * clause the install writes as a plot or city modifier (the Lighthouse's
 * Coast Food) is a `special`, not a flat yield, so it is never paid twice.
 * Maintenance is `Buildings.Maintenance`; the cost-tier heuristic in city.ts
 * survives only as a fallback for future unsourced additions. Worship
 * buildings stay 0 (faith-purchased).
 */

import type { DistrictId, Yields } from '../core/types';
import type { FeatureId } from '../../world/types';
import type { AdjacencySource } from './districts';
import type { CivId } from './seats';
import type { PromoClass } from './promotions';
import { GAME_SPEED } from './constants';
import { xml, type SrcMap } from './provenance';

/** CIV6 (BuildingReplaces): a civilization's UNIQUE BUILDING standing in for
 *  this row — the same building in storage, plus the clauses only it
 *  carries (the Stave Church). */
export interface BuildingVariant {
  civ: CivId;
  name: string;
  /**
   * Every column below OVERRIDES the row it replaces; absent takes the base
   * row's own. The install prices a unique building by its own `Cost`, and so
   * does this catalog: a variant's `cost` is that row's `Buildings.Cost`,
   * through the same GAME_SPEED scale the base row's takes.
   */
  cost?: number;
  yields?: Partial<Yields>;
  housing?: number;
  amenities?: number;
  maintenance?: number;
  power?: number;
  poweredYields?: Partial<Yields>;
  regional?: boolean;
  regionalRange?: number;
  /** the unique row's OWN unlock, where it differs from the base row's — the
   *  Madrasa arrives on a CIVIC where the University waits for a tech. */
  unlockTech?: string;
  unlockCivic?: string;
  trainXpPct?: number;
  trainXpClasses?: readonly PromoClass[];
  /** EFFECT_FEATURE_ADJACENCY: one more adjacency rule for a district of the city */
  districtAdjacency?: { district: DistrictId; source: AdjacencySource; amount: number };
  /** extra yields on every Coast tile of the city that carries a resource */
  coastResourceYields?: Partial<Yields>;
  /** CIV6 (Marae, "Has no Great Work slots"): this seat's copy of the row
   *  holds none of the slots the base row declares. */
  noGreatWorks?: boolean;
  /** CIV6 (Marae, MARAE_CULTURE_FEATURES / MARAE_FAITH_FEATURES): yields on
   *  every tile of the city carrying a PASSABLE feature. */
  featureTileYields?: Partial<Yields>;
  /** CIV6 (Tsikhe, TSIKHE_FAITH_GOLDEN_AGE): what the row pays ON TOP while
   *  its seat holds a Golden Age. */
  goldenAgeYields?: Partial<Yields>;
  /** CIV6 (Tsikhe, OuterDefenseHitPoints 200 against the Star Fort's 100):
   *  what the row adds to its city's outer-defense pool on top of its tier. */
  wallsHpBonus?: number;
  /** CIV6 (Grand Bazaar, GRANDBAZAAR_AMENITIES_LUXURIES Amount 1): one
   *  Amenity per DISTINCT luxury this city has improved. */
  amenityPerLuxuryType?: number;
  /** CIV6 (Grand Bazaar, GRANDBAZAAR_ACCUMULATION_STRATEGICS Amount 1): one
   *  extra unit accumulated per DISTINCT strategic this city has improved. */
  strategicPerType?: number;
  /** CIV6 (Ordu, ABILITY_ORDU_INCREASED_MOVEMENT): Movement granted for life
   *  to the classes in `trainMovementClasses`, trained in this row's city. */
  trainMovement?: number;
  trainMovementClasses?: readonly PromoClass[];
  /** CIV6 (Thermal Bath, THERMALBATH_ADDAMENITIES Amount 2): Amenities this
   *  row pays ON TOP while its city holds at least one tile of this feature. */
  amenitiesWithFeature?: { feature: FeatureId; amount: number };
  /** CIV6 (Electronics Factory, ELECTRONICSFACTORY_CULTURE): yields the row
   *  pays once its owner holds `tech`. */
  techYields?: { tech: string; yields: Partial<Yields> };
  /** CIV6 (Marae, MARAE_TOURISM_FEATURES): Tourism per tile of the city
   *  carrying a feature, once `tech` (Flight) is held. */
  tourismPerFeature?: { amount: number; tech?: string };
  /** CIV6 (Thermal Bath, THERMALBATH_ADDTOURISM): Tourism while the city's
   *  border holds a tile of one feature. */
  tourismWithFeature?: { feature: FeatureId; amount: number };
  /** CIV6 (Madrasa, OldYieldType SCIENCE -> NewYieldType FAITH): the row pays
   *  FAITH equal to its district's own adjacency bonus, beside the Science
   *  that bonus already pays. */
  districtAdjacencyAsFaith?: boolean;
}

/** the BuildingDef columns a `BuildingVariant` may override, one list so a
 *  new column is added in exactly one place. */
export const BUILDING_VARIANT_COLUMNS = [
  'cost', 'yields', 'housing', 'amenities', 'maintenance', 'power',
  'poweredYields', 'regional', 'regionalRange', 'trainXpPct', 'trainXpClasses',
] as const;

export interface BuildingDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts): the install row and
   *  column each number came from. Stripped by the exporter; checked by
   *  tools/civ6lab/xml_check.py. */
  src?: SrcMap;
  civVariants?: BuildingVariant[];
  name: string;
  district: DistrictId;
  cost: number;
  requiresAny?: string[];
  /** Cannot coexist with these buildings. */
  exclusiveWith?: string[];
  yields?: Partial<Yields>;
  housing?: number;
  amenities?: number;
  regional?: boolean;
  /**
   * WATER_MILL: city center must touch a river.
   * SHIPYARD: production equal to the Harbor's gold adjacency bonus.
   * LIGHTHOUSE: +1 food on every Coast and Lake tile the city works.
   * MONUMENT: +1 culture while the city sits at maximum loyalty.
   * COAL_PLANT: production equal to the Industrial Zone's own adjacency.
   */
  special?: 'WATER_MILL' | 'SHIPYARD' | 'LIGHTHOUSE' | 'MONUMENT' | 'COAL_PLANT';
  /** A power plant's fuel and its published conversion rate (Power per unit
   *  of the resource burned). */
  fuel?: string;
  fuelRate?: number;
  /** air-unit slots this building adds to its Aerodrome (Hangar, Airport). */
  airSlots?: number;
  /**
   * CIV6: a GOVERNMENT BUILDING's tier — "requires a Tier 2 government
   * (Merchant Republic, Monarchy, or Theocracy)". The seat's CURRENT
   * government must sit at this tier or above.
   */
  govTier?: number;
  /** CIV6 (every Government Plaza building): "Awards +1 Governor Title." */
  govTitle?: number;
  /** CIV6 (Intelligence Agency): "+1 Spy and Spy capacity." */
  spyCapacity?: number;
  /** CIV6 (Grand Master's Chapel): "Grants the ability to buy land military
   *  units with Faith" — an empire-wide grant, like every Plaza building. */
  faithBuyUnits?: boolean;
  /** CIV6 (Grand Master's Chapel): "Pillaging improvements and Districts
   *  provides bonus Faith" — the data's flat 15 / 30 per wreck. */
  pillageFaithImp?: number;
  pillageFaithDist?: number;
  /** CIV6 (Intelligence Agency): "+1 Spy" — the unit id spawned free at
   *  completion (the capacity term is `spyCapacity`). */
  grantUnit?: string;
  /** CIV6 (Consulate): "Spies operate at one level lower when targeting this
   *  city" — the Diplomatic Quarter itself carries the other two levels. */
  spyLevelPenalty?: number;
  /** CIV6 (Consulate): the same penalty "or cities with Encampments" — an
   *  EMPIRE-wide half, paid to every city of the seat holding a live
   *  Encampment, wherever the building itself stands. */
  spyLevelPenaltyEncampment?: number;
  /** CIV6 (Consulate, Chancery): "+2/+3 Influence Points per turn" — envoy
   *  currency, paid to the SEAT rather than to the city. */
  influencePerTurn?: number;
  /** CIV6 (Foreign Ministry, GS): "+3 Diplomatic Favor per turn." */
  favorPerTurn?: number;
  /** CIV6 (Hydroelectric Dam): "Provides 6 Power to the city from renewable
   *  water sources" — a supply with no fuel behind it. */
  powerSupply?: number;
  /** CIV6 (Aquarium, Aquatics Center): "This bonus extends to each City Center
   *  within 9 tiles" — a REGIONAL row whose reach is its own, not the
   *  6-tile default. */
  regionalRange?: number;
  /** CIV6 (Audience Chamber): "-2 Loyalty in Cities without Governors" — over
   *  every city the OWNING SEAT holds, not just the building's own. */
  loyaltyWithoutGovernor?: number;
  /** CIV6 (Audience Chamber): "+2 Amenities and +4 Housing in Cities with
   *  Governors." */
  amenitiesWithGovernor?: number;
  housingWithGovernor?: number;
  /**
   * CIV6 (Grove): "+1 Food and Faith to adjacent unimproved Charming tiles.
   * Yields increased to +2 Food, Faith and Culture for adjacent unimproved
   * Breathtaking tiles." The two bands do not stack: a Breathtaking tile takes
   * the Breathtaking row and nothing else.
   */
  appealYields?: { charming: Partial<Yields>; breathtaking: Partial<Yields> };
  /**
   * CIV6 (GS Power): the building's BASE LOAD — the Power it demands. A city
   * meets its TOTAL demand or none of its buildings are powered, so this is a
   * per-city sum, never a per-building test.
   */
  power?: number;
  /** what the row pays ON TOP once its city is powered ("+N additionally when
   *  Powered"). A REGIONAL row pays it to the same cities its base reaches. */
  poweredYields?: Partial<Yields>;
  poweredAmenities?: number;
  /** CIV6 (Power Plants): this row SUPPLIES Power to its own city and to every
   *  city centre within the regional range of its Industrial Zone. */
  powerPlant?: boolean;
  /** flat loyalty per turn while the building stands. */
  loyalty?: number;
  /** the WALLS TIER this row supplies (1 Ancient, 2 Medieval, 3 Renaissance).
   *  A city's perimeter pool and its defensive Combat Strength both read the
   *  highest tier it holds; the tiers stack, so each row requires the one
   *  below it. */
  walls?: number;
  /** CIV6 (Medieval and Renaissance Walls): "Cannot be purchased with
   *  Gold." */
  noPurchase?: boolean;
  /** Granted automatically to the capital; never buildable. */
  autoCapital?: boolean;
  worship?: boolean;
  /** explicit gold upkeep (real Civ 6) — overrides the cost-tier
   * heuristic in buildingMaintenance where the wiki value is verified. */
  maintenance?: number;
  /**
   * CIV6: "+25% combat experience for all <classes> units trained in this
   * city" — a PERCENTAGE the trained unit carries for life, not starting XP,
   * and the Encampment and Harbor lines STACK on each other.
   */
  trainXpPct?: number;
  /** the promotion classes `trainXpPct` reaches. */
  trainXpClasses?: readonly PromoClass[];
  /** CIV6 (Ancestral Hall): "50% increased Production toward Settlers in this
   *  city" — the building's OWN city, unlike every other Plaza term. */
  settlerProdPct?: number;
  /** CIV6 (Ancestral Hall): "New cities receive a free Builder" — the unit
   *  every city this seat FOUNDS is handed, from the one city that built it. */
  grantUnitNewCity?: string;
  /** CIV6 (Warlord's Throne): "Capturing an enemy City grants 20% bonus
   *  Production in all Cities for 5 turns." */
  conquestProdPct?: number;
  conquestProdTurns?: number;
  /** CIV6 (War Department): "All units heal up to 20 hit points when they
   *  eliminate a unit." */
  healOnKill?: number;
  /** CIV6 (Royal Society): "Builders gain the ability to use all of their
   *  charges to provide bonus Production to a District Project. Once per city
   *  per turn" — this many percent of the project's own cost per charge. */
  projectChargePct?: number;
  /**
   * CIV6 (Flood Barrier): "Constructed automatically around each Coastal
   * Lowland tile belonging to the city; it protects them from flooding when
   * sea level rises." Its price is not a constant — "(80 x coastal lowland
   * tiles) + (80 x coastal lowland tiles x flood level)" — so the row's own
   * `cost` is the per-tile figure and `floodBarrierCost` does the rest.
   */
  floodBarrier?: boolean;
}

const rawList: BuildingDef[] = [
  { id: 'PALACE', name: 'Palace', district: 'CITY_CENTER', cost: 0, yields: { production: 2, gold: 5, science: 2, culture: 1 }, housing: 1, amenities: 2, autoCapital: true,
    src: {
      cost: { stylized: "the Palace is granted with the capital and never produced, so its price is never read; the install's Buildings.Cost 1 is a placeholder for a building nobody builds" },
      district: xml('Buildings', 'BuildingType=BUILDING_PALACE', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      housing: xml('Buildings', 'BuildingType=BUILDING_PALACE', 'Housing'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_PALACE', 'Entertainment'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_PALACE&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_PALACE&YieldType=YIELD_GOLD', 'YieldChange'),
      'yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_PALACE&YieldType=YIELD_SCIENCE', 'YieldChange'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_PALACE&YieldType=YIELD_CULTURE', 'YieldChange'),
      autoCapital: xml('Buildings', 'BuildingType=BUILDING_PALACE', 'Capital'),
    },
  },
  // CIV6 (R&F/GS): "+1 Loyalty. +1 Culture. +1 additional Culture if city is
  // at maximum Loyalty." The +2 culture flat is the VANILLA row.
  { id: 'MONUMENT', name: 'Monument', district: 'CITY_CENTER', cost: 60, yields: { culture: 1 }, loyalty: 1, special: 'MONUMENT', maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MONUMENT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MONUMENT', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_MONUMENT', 'Maintenance'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_MONUMENT&YieldType=YIELD_CULTURE', 'YieldChange'),
      loyalty: xml('ModifierArguments', 'ModifierId=MONUMENT_LOYALTY&Name=Amount', 'Value'),
    },
  },
  { id: 'GRANARY', name: 'Granary', district: 'CITY_CENTER', cost: 65, yields: { food: 1 }, housing: 2, maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GRANARY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GRANARY', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GRANARY', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_GRANARY', 'Housing'),
      'yields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_GRANARY&YieldType=YIELD_FOOD', 'YieldChange'),
    },
  },
  { id: 'WATER_MILL', name: 'Water Mill', district: 'CITY_CENTER', cost: 80, yields: { food: 1, production: 1 }, special: 'WATER_MILL', maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_WATER_MILL', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_WATER_MILL', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_WATER_MILL', 'Maintenance'),
      'yields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_WATER_MILL&YieldType=YIELD_FOOD', 'YieldChange'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_WATER_MILL&YieldType=YIELD_PRODUCTION', 'YieldChange'),
    },
  },
  { id: 'SEWER', name: 'Sewer', district: 'CITY_CENTER', cost: 200, housing: 2, maintenance: 2,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_SEWER', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_SEWER', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_SEWER', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_SEWER', 'Housing'),
    },
  },
  // CIV6 (Flood Barrier): Atomic era, City Center, requires Computers, and
  // "Cannot be Purchased with Gold". Its cost and maintenance are both
  // "Variable" on the page, priced off the lowland tiles it covers.
  // CIV6 (Expansion2_Buildings.xml): Maintenance 1; the BUILD cost scales
  // per protected tile and per sea level (`floodBarrierCost`).
  { id: 'FLOOD_BARRIER', name: 'Flood Barrier', district: 'CITY_CENTER', cost: 80, maintenance: 1, noPurchase: true, floodBarrier: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'Maintenance'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'PurchaseYield')] },
      floodBarrier: xml('Buildings_XP2', 'BuildingType=BUILDING_FLOOD_BARRIER', 'BlocksCoastalFlooding'),
    },
  },
  { id: 'ANCIENT_WALLS', name: 'Ancient Walls', district: 'CITY_CENTER', cost: 80, maintenance: 0, walls: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_WALLS', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_WALLS', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_WALLS', 'Maintenance'),
      walls: { stylized: 'the engine tier index (1 Ancient, 2 Medieval, 3 Renaissance); the install carries OuterDefenseHitPoints, not a tier' },
    },
  },

  { id: 'LIBRARY', name: 'Library', district: 'CAMPUS', cost: 90, yields: { science: 2 }, maintenance: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_LIBRARY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_LIBRARY', 'PrereqDistrict', { expect: 'DISTRICT_CAMPUS' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_LIBRARY', 'Maintenance'),
      'yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_LIBRARY&YieldType=YIELD_SCIENCE', 'YieldChange'),
    },
  },
  {
    id: 'UNIVERSITY', name: 'University', district: 'CAMPUS', cost: 250, requiresAny: ['LIBRARY'], yields: { science: 4 }, housing: 1, maintenance: 2,
    // CIV6 (BUILDING_MADRASA): Cost 250 against the University's 250 (no
    // discount), Maintenance 2, Housing 1, Science 5 — and PrereqCivic
    // THEOLOGY where the University waits for the Education TECH. Its
    // OldYieldType SCIENCE / NewYieldType FAITH row pays the Campus's own
    // adjacency a second time, in Faith.
    civVariants: [{
      civ: 'ARABIA', name: 'Madrasa', yields: { science: 5 },
      unlockCivic: 'THEOLOGY', districtAdjacencyAsFaith: true,
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY', 'PrereqDistrict', { expect: 'DISTRICT_CAMPUS' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY', 'Housing'),
      'yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_UNIVERSITY&YieldType=YIELD_SCIENCE', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_UNIVERSITY', 'PrereqBuilding')] },
      'civVariants.0.yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_MADRASA&YieldType=YIELD_SCIENCE', 'YieldChange'),
      'civVariants.0.unlockCivic': xml('Buildings', 'BuildingType=BUILDING_MADRASA', 'PrereqCivic', { expect: 'CIVIC_THEOLOGY' }),
      'civVariants.0.districtAdjacencyAsFaith': { derived: 'true where the install gives the row a Building_YieldDistrictCopies row paying the district adjacency again in another yield', inputs: [xml('Building_YieldDistrictCopies', 'BuildingType=BUILDING_MADRASA', 'NewYieldType')] },
    },
  },
  { id: 'RESEARCH_LAB', name: 'Research Lab', district: 'CAMPUS', cost: 440, requiresAny: ['UNIVERSITY'], yields: { science: 3 }, power: 3, poweredYields: { science: 5 }, maintenance: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_RESEARCH_LAB', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_RESEARCH_LAB', 'PrereqDistrict', { expect: 'DISTRICT_CAMPUS' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_RESEARCH_LAB', 'Maintenance'),
      'yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_RESEARCH_LAB&YieldType=YIELD_SCIENCE', 'YieldChange'),
      'poweredYields.science': xml('Building_YieldChangesBonusWithPower', 'BuildingType=BUILDING_RESEARCH_LAB&YieldType=YIELD_SCIENCE', 'YieldChange'),
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_RESEARCH_LAB', 'RequiredPower'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_RESEARCH_LAB', 'PrereqBuilding')] },
    },
  },

  { id: 'SHRINE', name: 'Shrine', district: 'HOLY_SITE', cost: 70, yields: { faith: 2 }, maintenance: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_SHRINE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_SHRINE', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_SHRINE', 'Maintenance'),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_SHRINE&YieldType=YIELD_FAITH', 'YieldChange'),
    },
  },
  {
    id: 'TEMPLE', name: 'Temple', district: 'HOLY_SITE', cost: 120, requiresAny: ['SHRINE'], yields: { faith: 4 }, maintenance: 2,
    // CIV6 (Stave Church): "Holy Site districts get an additional standard
    // adjacency bonus from Woods. +1 Production to each coastal resource tile
    // in this city." — the Temple's own numbers otherwise.
    civVariants: [{
      civ: 'NORWAY', name: 'Stave Church',
      districtAdjacency: { district: 'HOLY_SITE', source: 'WOODS', amount: 1 },
      coastResourceYields: { production: 1 },
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_TEMPLE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_TEMPLE', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_TEMPLE', 'Maintenance'),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_TEMPLE&YieldType=YIELD_FAITH', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_TEMPLE', 'PrereqBuilding')] },
      'civVariants.0.districtAdjacency.district': xml('ModifierArguments', 'ModifierId=STAVE_CHURCH_FAITHWOODSADJACENCY&Name=DistrictType', 'Value', { expect: 'DISTRICT_HOLY_SITE' }),
      'civVariants.0.districtAdjacency.source': xml('ModifierArguments', 'ModifierId=STAVE_CHURCH_FAITHWOODSADJACENCY&Name=FeatureType', 'Value', { expect: 'FEATURE_FOREST' }),
      'civVariants.0.districtAdjacency.amount': xml('ModifierArguments', 'ModifierId=STAVE_CHURCH_FAITHWOODSADJACENCY&Name=Amount', 'Value'),
      'civVariants.0.coastResourceYields.production': xml('ModifierArguments', 'ModifierId=STAVECHURCH_SEARESOURCE_PRODUCTION&Name=Amount', 'Value'),
    },
  },
  // CIV6: the install writes the Cathedral ONE Building_YieldChanges row,
  // YIELD_FAITH 3. There is no YIELD_CULTURE row — the Cathedral's Great Work
  // of Art slot is what pays Culture, and this catalog has no column for it.
  { id: 'CATHEDRAL', name: 'Cathedral', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, worship: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_CATHEDRAL', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_CATHEDRAL', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_CATHEDRAL&YieldType=YIELD_FAITH', 'YieldChange'),
      // documentary: the dump emits only columns the row HOLDS, so this tag is
      // never checked — it records why there is no `yields.culture` to check.
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_CATHEDRAL&YieldType=YIELD_CULTURE', 'YieldChange', { absent: true }),
      worship: xml('Buildings', 'BuildingType=BUILDING_CATHEDRAL', 'EnabledByReligion'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_CATHEDRAL', 'PrereqBuilding')] },
    },
  },
  { id: 'GURDWARA', name: 'Gurdwara', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, food: 2 }, worship: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GURDWARA', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GURDWARA', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_GURDWARA&YieldType=YIELD_FAITH', 'YieldChange'),
      worship: xml('Buildings', 'BuildingType=BUILDING_GURDWARA', 'EnabledByReligion'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GURDWARA', 'PrereqBuilding')] },
      'yields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_GURDWARA&YieldType=YIELD_FOOD', 'YieldChange'),
    },
  },
  { id: 'MEETING_HOUSE', name: 'Meeting House', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, production: 2 }, worship: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MEETING_HOUSE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MEETING_HOUSE', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_MEETING_HOUSE&YieldType=YIELD_FAITH', 'YieldChange'),
      worship: xml('Buildings', 'BuildingType=BUILDING_MEETING_HOUSE', 'EnabledByReligion'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_MEETING_HOUSE', 'PrereqBuilding')] },
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_MEETING_HOUSE&YieldType=YIELD_PRODUCTION', 'YieldChange'),
    },
  },
  { id: 'PAGODA', name: 'Pagoda', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, housing: 0, worship: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_PAGODA', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_PAGODA', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_PAGODA&YieldType=YIELD_FAITH', 'YieldChange'),
      worship: xml('Buildings', 'BuildingType=BUILDING_PAGODA', 'EnabledByReligion'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_PAGODA', 'PrereqBuilding')] },
      housing: xml('Buildings', 'BuildingType=BUILDING_PAGODA', 'Housing'),
    },
  },
  { id: 'STUPA', name: 'Stupa', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, amenities: 1, worship: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_STUPA', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_STUPA', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_STUPA&YieldType=YIELD_FAITH', 'YieldChange'),
      worship: xml('Buildings', 'BuildingType=BUILDING_STUPA', 'EnabledByReligion'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_STUPA', 'PrereqBuilding')] },
      amenities: xml('Buildings', 'BuildingType=BUILDING_STUPA', 'Entertainment'),
    },
  },

  {
    id: 'AMPHITHEATER', name: 'Amphitheater', district: 'THEATER_SQUARE', cost: 150, yields: { culture: 2 }, maintenance: 1,
    // CIV6 (BUILDING_MARAE): Cost 150 against the Amphitheater's 150, NO
    // Maintenance column and no `Building_GreatWorks` row at all. Its
    // modifiers pay +1 Culture and +1 Faith on every passable-feature tile of
    // the city, and MARAE_TOURISM_FEATURES +1 Tourism per feature tile after
    // Flight (`tourismPerFeature`).
    civVariants: [{
      civ: 'MAORI', name: 'Marae', maintenance: 0, noGreatWorks: true,
      featureTileYields: { culture: 1, faith: 1 },
      tourismPerFeature: { amount: 1, tech: 'FLIGHT' },
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_AMPHITHEATER', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_AMPHITHEATER', 'PrereqDistrict', { expect: 'DISTRICT_THEATER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_AMPHITHEATER', 'Maintenance'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_AMPHITHEATER&YieldType=YIELD_CULTURE', 'YieldChange'),
      'civVariants.0.maintenance': xml('Buildings', 'BuildingType=BUILDING_MARAE', 'Maintenance'),
      'civVariants.0.noGreatWorks': { derived: 'true where the install gives the unique row NO Building_GreatWorks row at all', inputs: [xml('Building_GreatWorks', 'BuildingType=BUILDING_MARAE', 'NumSlots')] },
      'civVariants.0.featureTileYields.culture': xml('ModifierArguments', 'ModifierId=MARAE_CULTURE_FEATURES&Name=Amount', 'Value'),
      'civVariants.0.featureTileYields.faith': xml('ModifierArguments', 'ModifierId=MARAE_FAITH_FEATURES&Name=Amount', 'Value'),
      'civVariants.0.tourismPerFeature.amount': xml('ModifierArguments', 'ModifierId=MARAE_TOURISM_FEATURES&Name=Amount', 'Value'),
    },
  },
  { id: 'MUSEUM', name: 'Museum', district: 'THEATER_SQUARE', cost: 290, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['ARCHAEOLOGICAL_MUSEUM'], yields: { culture: 2 }, maintenance: 2,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ART', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ART', 'PrereqDistrict', { expect: 'DISTRICT_THEATER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ART', 'Maintenance'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_MUSEUM_ART&YieldType=YIELD_CULTURE', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_MUSEUM_ART', 'PrereqBuilding')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_MUSEUM_ART', 'MutuallyExclusiveBuilding')] },
    },
  },
  {
    id: 'BROADCAST_CENTER', name: 'Broadcast Center', district: 'THEATER_SQUARE', cost: 440, requiresAny: ['MUSEUM'], yields: { culture: 2 }, power: 3, poweredYields: { culture: 4 }, maintenance: 3,
    // CIV6 (BUILDING_FILM_STUDIO): every column matches the Broadcast
    // Center's — Cost 580 against 580, Maintenance 3, RequiredPower 3, the
    // same two Culture rows and the same single MUSIC great-work slot. Its
    // one clause is "+100% Tourism pressure from this city towards other
    // civilizations in the Modern era", a per-PAIR tourism pressure this
    // engine does not carry (recorded in docs/AUDIT.md).
    civVariants: [{ civ: 'AMERICA', name: 'Film Studio' }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_BROADCAST_CENTER', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_BROADCAST_CENTER', 'PrereqDistrict', { expect: 'DISTRICT_THEATER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_BROADCAST_CENTER', 'Maintenance'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_BROADCAST_CENTER&YieldType=YIELD_CULTURE', 'YieldChange'),
      'poweredYields.culture': xml('Building_YieldChangesBonusWithPower', 'BuildingType=BUILDING_BROADCAST_CENTER&YieldType=YIELD_CULTURE', 'YieldChange'),
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_BROADCAST_CENTER', 'RequiredPower'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_BROADCAST_CENTER', 'PrereqBuilding')] },
    },
  },
  { id: 'MARKET', name: 'Market', district: 'COMMERCIAL_HUB', cost: 120, yields: { gold: 2 }, maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MARKET', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MARKET', 'PrereqDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_MARKET', 'Maintenance'),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_MARKET&YieldType=YIELD_GOLD', 'YieldChange'),
    },
  },
  {
    id: 'BANK', name: 'Bank', district: 'COMMERCIAL_HUB', cost: 290, requiresAny: ['MARKET'], yields: { gold: 5 }, maintenance: 0,
    // CIV6 (BUILDING_GRAND_BAZAAR): Cost 220 against the Bank's 290, so
    // 290 x 220/290 = 220 here. Gold 5, no maintenance, and its two
    // modifiers: one Amenity per distinct improved LUXURY and one extra unit
    // accumulated per distinct improved STRATEGIC.
    civVariants: [{
      civ: 'OTTOMAN', name: 'Grand Bazaar', cost: 220,
      amenityPerLuxuryType: 1, strategicPerType: 1,
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_BANK', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_BANK', 'PrereqDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_BANK', 'Maintenance'),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_BANK&YieldType=YIELD_GOLD', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_BANK', 'PrereqBuilding')] },
      'civVariants.0.cost': xml('Buildings', 'BuildingType=BUILDING_GRAND_BAZAAR', 'Cost', { scale: GAME_SPEED }),
      'civVariants.0.amenityPerLuxuryType': xml('ModifierArguments', 'ModifierId=GRANDBAZAAR_AMENITIES_LUXURIES&Name=Amount', 'Value'),
      'civVariants.0.strategicPerType': xml('ModifierArguments', 'ModifierId=GRANDBAZAAR_ACCUMULATION_STRATEGICS&Name=Amount', 'Value'),
    },
  },
  { id: 'STOCK_EXCHANGE', name: 'Stock Exchange', district: 'COMMERCIAL_HUB', cost: 330, requiresAny: ['BANK'], yields: { gold: 4 }, power: 3, poweredYields: { gold: 7 }, maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_STOCK_EXCHANGE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_STOCK_EXCHANGE', 'PrereqDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_STOCK_EXCHANGE', 'Maintenance'),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_STOCK_EXCHANGE&YieldType=YIELD_GOLD', 'YieldChange'),
      'poweredYields.gold': xml('Building_YieldChangesBonusWithPower', 'BuildingType=BUILDING_STOCK_EXCHANGE&YieldType=YIELD_GOLD', 'YieldChange'),
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_STOCK_EXCHANGE', 'RequiredPower'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_STOCK_EXCHANGE', 'PrereqBuilding')] },
    },
  },

  // CIV6: the install writes the Lighthouse NO Building_YieldChanges row at
  // all. Its Food is the LIGHTHOUSE_COAST_FOOD plot modifier (YIELD_FOOD
  // Amount 1 under PLOT_HAS_COAST_REQUIREMENTS) — the `special` below, paid
  // per WORKED Coast/Lake tile in city.ts. The flat `food: 1` this row used to
  // carry was that same fact a second time, and the `gold: 1` beside it had no
  // install row of any kind.
  { id: 'LIGHTHOUSE', name: 'Lighthouse', district: 'HARBOR', cost: 120, housing: 1, special: 'LIGHTHOUSE', maintenance: 0,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_LIGHTHOUSE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_LIGHTHOUSE', 'PrereqDistrict', { expect: 'DISTRICT_HARBOR' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_LIGHTHOUSE', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_LIGHTHOUSE', 'Housing'),
      // documentary: the dump emits only columns the row HOLDS, so these two
      // are never checked — they record that the install has no such rows.
      'yields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_LIGHTHOUSE&YieldType=YIELD_FOOD', 'YieldChange', { absent: true }),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_LIGHTHOUSE&YieldType=YIELD_GOLD', 'YieldChange', { absent: true }),
    },
  },
  { id: 'SHIPYARD', name: 'Shipyard', district: 'HARBOR', cost: 290, requiresAny: ['LIGHTHOUSE'], special: 'SHIPYARD', maintenance: 1, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_SHIPYARD', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_SHIPYARD', 'PrereqDistrict', { expect: 'DISTRICT_HARBOR' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_SHIPYARD', 'Maintenance'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_SHIPYARD', 'PrereqBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=SHIPYARD_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_SHIPYARD', 'BuildingType')] },
    },
  },
  { id: 'SEAPORT', name: 'Seaport', district: 'HARBOR', cost: 440, requiresAny: ['SHIPYARD'], yields: { food: 2, gold: 2 }, housing: 1, maintenance: 0, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'PrereqDistrict', { expect: 'DISTRICT_HARBOR' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'Housing'),
      'yields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_SEAPORT&YieldType=YIELD_FOOD', 'YieldChange'),
      'yields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_SEAPORT&YieldType=YIELD_GOLD', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_SEAPORT', 'PrereqBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=SEAPORT_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_SEAPORT', 'BuildingType')] },
    },
  },

  { id: 'WORKSHOP', name: 'Workshop', district: 'INDUSTRIAL_ZONE', cost: 195, yields: { production: 3 }, maintenance: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_WORKSHOP', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_WORKSHOP', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_WORKSHOP', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_WORKSHOP&YieldType=YIELD_PRODUCTION', 'YieldChange'),
    },
  },
  {
    id: 'FACTORY', name: 'Factory', district: 'INDUSTRIAL_ZONE', cost: 330, requiresAny: ['WORKSHOP'], yields: { production: 3 }, power: 2, poweredYields: { production: 3 }, regional: true, maintenance: 2,
    // CIV6 (BUILDING_ELECTRONICS_FACTORY): Cost 330, Maintenance 2,
    // RequiredPower 2, RegionalRange 6 — every column the Factory's own row
    // carries, so the variant overrides none of them. Where it DOES differ is
    // power: Building_YieldChanges pays the same Production 3 as the Factory,
    // and Building_YieldChangesBonusWithPower pays 5 where the Factory's pays
    // 3. The regional row every city centre within six tiles is paid, and
    // ELECTRONICSFACTORY_CULTURE +4 once ELECTRICITY is held (`techYields`).
    civVariants: [{
      civ: 'JAPAN', name: 'Electronics Factory', yields: { production: 3 }, poweredYields: { production: 5 },
      techYields: { tech: 'ELECTRICITY', yields: { culture: 4 } },
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_FACTORY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_FACTORY', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_FACTORY', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_FACTORY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'poweredYields.production': xml('Building_YieldChangesBonusWithPower', 'BuildingType=BUILDING_FACTORY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_FACTORY', 'RequiredPower'),
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_FACTORY', 'RegionalRange')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_FACTORY', 'PrereqBuilding')] },
      'civVariants.0.yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_ELECTRONICS_FACTORY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'civVariants.0.poweredYields.production': xml('Building_YieldChangesBonusWithPower', 'BuildingType=BUILDING_ELECTRONICS_FACTORY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'civVariants.0.techYields.yields.culture': xml('ModifierArguments', 'ModifierId=ELECTRONICSFACTORY_CULTURE&Name=Amount', 'Value'),
    },
  },
  // THE THREE POWER PLANTS. CIV6 (GS): one per Industrial Zone, each
  // "convert[ing] stockpiles of the relevant resource into Power" at its own
  // published rate — Coal 1:4, Oil 1:4, Uranium 1:16.
  { id: 'COAL_POWER_PLANT', name: 'Coal Power Plant', district: 'INDUSTRIAL_ZONE', cost: 300, requiresAny: ['FACTORY'], exclusiveWith: ['OIL_POWER_PLANT', 'NUCLEAR_POWER_PLANT'], special: 'COAL_PLANT', powerPlant: true, fuel: 'COAL', fuelRate: 4, maintenance: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'Maintenance'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_COAL_POWER_PLANT', 'PrereqBuilding')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_COAL_POWER_PLANT', 'MutuallyExclusiveBuilding')] },
      powerPlant: { derived: 'true where the install row carries a Buildings_XP2.ResourceTypeConvertedToPower', inputs: [xml('Buildings_XP2', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'ResourceTypeConvertedToPower')] },
      fuel: xml('Buildings_XP2', 'BuildingType=BUILDING_COAL_POWER_PLANT', 'ResourceTypeConvertedToPower', { expect: 'RESOURCE_COAL' }),
      fuelRate: { pedia: 'civilopedia published conversion rate (Coal 1:4, Oil 1:4, Uranium 1:16); no install column carries it' },
    },
  },
  { id: 'OIL_POWER_PLANT', name: 'Oil Power Plant', district: 'INDUSTRIAL_ZONE', cost: 360, requiresAny: ['FACTORY'], exclusiveWith: ['COAL_POWER_PLANT', 'NUCLEAR_POWER_PLANT'], yields: { production: 3 }, regional: true, powerPlant: true, fuel: 'OIL', fuelRate: 4, maintenance: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'PrereqBuilding')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'MutuallyExclusiveBuilding')] },
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'RegionalRange')] },
      powerPlant: { derived: 'true where the install row carries a Buildings_XP2.ResourceTypeConvertedToPower', inputs: [xml('Buildings_XP2', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'ResourceTypeConvertedToPower')] },
      fuel: xml('Buildings_XP2', 'BuildingType=BUILDING_FOSSIL_FUEL_POWER_PLANT', 'ResourceTypeConvertedToPower', { expect: 'RESOURCE_OIL' }),
      fuelRate: { pedia: 'civilopedia published conversion rate (Coal 1:4, Oil 1:4, Uranium 1:16); no install column carries it' },
    },
  },
  { id: 'NUCLEAR_POWER_PLANT', name: 'Nuclear Power Plant', district: 'INDUSTRIAL_ZONE', cost: 480, requiresAny: ['FACTORY'], exclusiveWith: ['COAL_POWER_PLANT', 'OIL_POWER_PLANT'], yields: { production: 4, science: 3 }, regional: true, powerPlant: true, fuel: 'URANIUM', fuelRate: 16, maintenance: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_POWER_PLANT', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_POWER_PLANT&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'yields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_POWER_PLANT&YieldType=YIELD_SCIENCE', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_POWER_PLANT', 'PrereqBuilding')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_POWER_PLANT', 'MutuallyExclusiveBuilding')] },
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_POWER_PLANT', 'RegionalRange')] },
      powerPlant: { derived: 'true where the install row carries a Buildings_XP2.ResourceTypeConvertedToPower', inputs: [xml('Buildings_XP2', 'BuildingType=BUILDING_POWER_PLANT', 'ResourceTypeConvertedToPower')] },
      fuel: xml('Buildings_XP2', 'BuildingType=BUILDING_POWER_PLANT', 'ResourceTypeConvertedToPower', { expect: 'RESOURCE_URANIUM' }),
      fuelRate: { pedia: 'civilopedia published conversion rate (Coal 1:4, Oil 1:4, Uranium 1:16); no install column carries it' },
    },
  },

  { id: 'BARRACKS', name: 'Barracks', district: 'ENCAMPMENT', cost: 90, exclusiveWith: ['STABLE'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXpPct: 25, trainXpClasses: ['MELEE', 'RANGED', 'ANTICAV'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'PrereqDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'Housing'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_BARRACKS&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_BARRACKS', 'MutuallyExclusiveBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=BARRACKS_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_BARRACKS', 'BuildingType')] },
    },
  },
  {
    id: 'STABLE', name: 'Stable', district: 'ENCAMPMENT', cost: 120, exclusiveWith: ['BARRACKS'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXpPct: 25, trainXpClasses: ['LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'],
    // CIV6 (BUILDING_ORDU): every Stable column, Cost 120 against 120, plus
    // ABILITY_ORDU_INCREASED_MOVEMENT (+1 Movement for life to Heavy and
    // Light Cavalry trained here). Its XP ability names the same three classes
    // the Stable already carries. Its ORDU_ADJUST_RESOURCE_STOCKPILE_CAP
    // Amount 10 is NOT a second bonus: the Stable carries no such modifier in
    // the install and the Ordu's description names no resource, so the row is
    // the unique standing in for the DLL's own "+10 per Encampment building",
    // which `stockpileCap` already pays every Encampment building here.
    civVariants: [{
      civ: 'MONGOLIA', name: 'Ordu',
      trainMovement: 1, trainMovementClasses: ['LIGHT_CAV', 'HEAVY_CAV'],
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_STABLE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_STABLE', 'PrereqDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_STABLE', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_STABLE', 'Housing'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_STABLE&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_STABLE', 'MutuallyExclusiveBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=STABLE_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_STABLE', 'BuildingType')] },
      'civVariants.0.trainMovement': xml('ModifierArguments', 'ModifierId=ORDU_ADJUST_MOVEMENT&Name=Amount', 'Value'),
      'civVariants.0.trainMovementClasses': { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_ORDU', 'BuildingType')] },
    },
  },
  { id: 'ARMORY', name: 'Armory', district: 'ENCAMPMENT', cost: 195, requiresAny: ['BARRACKS', 'STABLE'], yields: { production: 3 }, maintenance: 2, trainXpPct: 25, trainXpClasses: ['MELEE', 'ANTICAV', 'RANGED', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_ARMORY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_ARMORY', 'PrereqDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_ARMORY', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_ARMORY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_ARMORY', 'PrereqBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=ARMORY_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_ARMORY', 'BuildingType')] },
    },
  },
  { id: 'MILITARY_ACADEMY', name: 'Military Academy', district: 'ENCAMPMENT', cost: 330, requiresAny: ['ARMORY'], yields: { production: 4 }, housing: 1, maintenance: 2, trainXpPct: 25, trainXpClasses: ['MELEE', 'ANTICAV', 'RANGED', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'PrereqDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'Maintenance'),
      housing: xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'Housing'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_MILITARY_ACADEMY&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_MILITARY_ACADEMY', 'PrereqBuilding')] },
      trainXpPct: xml('ModifierArguments', 'ModifierId=MILITARY_ACADEMY_TRAINED_UNIT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_MILITARY_ACADEMY', 'BuildingType')] },
    },
  },

  { id: 'HANGAR', name: 'Hangar', district: 'AERODROME', cost: 380, yields: { production: 2 }, maintenance: 1, airSlots: 1, trainXpPct: 25, trainXpClasses: ['AIR_FIGHTER', 'AIR_BOMBER'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_HANGAR', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_HANGAR', 'PrereqDistrict', { expect: 'DISTRICT_AERODROME' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_HANGAR', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_HANGAR&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      airSlots: xml('ModifierArguments', 'ModifierId=HANGAR_BONUS_AIR_SLOTS&Name=Amount', 'Value'),
      trainXpPct: xml('ModifierArguments', 'ModifierId=HANGAR_TRAINED_AIRCRAFT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_HANGAR', 'BuildingType')] },
    },
  },
  { id: 'AIRPORT', name: 'Airport', district: 'AERODROME', cost: 480, requiresAny: ['HANGAR'], yields: { production: 4 }, maintenance: 2, airSlots: 1, trainXpPct: 50, trainXpClasses: ['AIR_FIGHTER', 'AIR_BOMBER'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_AIRPORT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_AIRPORT', 'PrereqDistrict', { expect: 'DISTRICT_AERODROME' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_AIRPORT', 'Maintenance'),
      'yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_AIRPORT&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_AIRPORT', 'PrereqBuilding')] },
      airSlots: xml('ModifierArguments', 'ModifierId=AIRPORT_BONUS_AIR_SLOTS&Name=Amount', 'Value'),
      trainXpPct: xml('ModifierArguments', 'ModifierId=AIRPORT_TRAINED_AIRCRAFT_XP&Name=Amount', 'Value'),
      trainXpClasses: { derived: 'the promotion classes the install ability reaches, as engine class ids', inputs: [xml('Buildings', 'BuildingType=BUILDING_AIRPORT', 'BuildingType')] },
    },
  },

  { id: 'ARENA', name: 'Arena', district: 'ENTERTAINMENT_COMPLEX', cost: 150, amenities: 2, yields: { culture: 1 }, maintenance: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_ARENA', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_ARENA', 'PrereqDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_ARENA', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_ARENA', 'Entertainment'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_ARENA&YieldType=YIELD_CULTURE', 'YieldChange'),
    },
  },
  {
    id: 'ZOO', name: 'Zoo', district: 'ENTERTAINMENT_COMPLEX', cost: 360, requiresAny: ['ARENA'], amenities: 1, regional: true, maintenance: 2,
    // CIV6 (BUILDING_THERMAL_BATH): Cost 360, the same price as the Zoo.
    // Entertainment 2 against the Zoo's 1, Production 2 of its own,
    // RegionalRange 6 — both reach every city centre within six tiles, as the
    // Zoo's Amenity does. THERMALBATH_ADDAMENITIES pays +2 MORE Amenities
    // and THERMALBATH_ADDTOURISM +3 Tourism while the city holds a Geothermal
    // Fissure (`tourismWithFeature`).
    civVariants: [{
      civ: 'HUNGARY', name: 'Thermal Bath', cost: 360,
      amenities: 2, yields: { production: 2 },
      amenitiesWithFeature: { feature: 'GEOTHERMAL_FISSURE', amount: 2 },
      tourismWithFeature: { feature: 'GEOTHERMAL_FISSURE', amount: 3 },
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_ZOO', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_ZOO', 'PrereqDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_ZOO', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_ZOO', 'Entertainment'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_ZOO', 'PrereqBuilding')] },
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_ZOO', 'RegionalRange')] },
      'civVariants.0.cost': xml('Buildings', 'BuildingType=BUILDING_THERMAL_BATH', 'Cost', { scale: GAME_SPEED }),
      'civVariants.0.amenities': xml('Buildings', 'BuildingType=BUILDING_THERMAL_BATH', 'Entertainment'),
      'civVariants.0.yields.production': xml('Building_YieldChanges', 'BuildingType=BUILDING_THERMAL_BATH&YieldType=YIELD_PRODUCTION', 'YieldChange'),
      'civVariants.0.tourismWithFeature.amount': xml('ModifierArguments', 'ModifierId=THERMALBATH_ADDTOURISM&Name=Amount', 'Value'),
      'civVariants.0.amenitiesWithFeature.amount': xml('ModifierArguments', 'ModifierId=THERMALBATH_ADDAMENITIES&Name=Amount', 'Value'),
    },
  },
  { id: 'STADIUM', name: 'Stadium', district: 'ENTERTAINMENT_COMPLEX', cost: 480, requiresAny: ['ZOO'], amenities: 1, power: 2, poweredAmenities: 2, regional: true, maintenance: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'PrereqDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'Entertainment'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_STADIUM', 'PrereqBuilding')] },
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_STADIUM', 'RequiredPower'),
      poweredAmenities: xml('Buildings_XP2', 'BuildingType=BUILDING_STADIUM', 'EntertainmentBonusWithPower'),
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_STADIUM', 'RegionalRange')] },
    },
  },

  // ARCHAEOLOGICAL MUSEUM — in real Civ 6 the Theater Square offers
  // the ART MUSEUM or the ARCHAEOLOGICAL MUSEUM as a choice; same district,
  // same cost, 3 ARTIFACT slots instead of 3 art slots. APPENDED LAST on
  // purpose: roster order IS the GPU's building index, so inserting it beside
  // the other Theater Square rows would renumber every downstream building in
  // both engines and in every exported fixture.
  { id: 'ARCHAEOLOGICAL_MUSEUM', name: 'Archaeological Museum', district: 'THEATER_SQUARE', cost: 290, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['MUSEUM'], yields: { culture: 2 }, maintenance: 2,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ARTIFACT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ARTIFACT', 'PrereqDistrict', { expect: 'DISTRICT_THEATER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_MUSEUM_ARTIFACT', 'Maintenance'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_MUSEUM_ARTIFACT&YieldType=YIELD_CULTURE', 'YieldChange'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_MUSEUM_ARTIFACT', 'PrereqBuilding')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_MUSEUM_ARTIFACT', 'MutuallyExclusiveBuilding')] },
    },
  },

  // THE UPGRADED WALLS, appended last for the same index-stability reason as
  // the Archaeological Museum above. Both carry the Gathering Storm cost and
  // require the tier below; both refuse a gold purchase.
  { id: 'MEDIEVAL_WALLS', name: 'Medieval Walls', district: 'CITY_CENTER', cost: 220, requiresAny: ['ANCIENT_WALLS'], maintenance: 0, walls: 2, noPurchase: true,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_CASTLE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_CASTLE', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_CASTLE', 'Maintenance'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_CASTLE', 'PrereqBuilding')] },
      walls: { stylized: 'the engine tier index (1 Ancient, 2 Medieval, 3 Renaissance); the install carries OuterDefenseHitPoints, not a tier' },
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_CASTLE', 'PurchaseYield')] },
    },
  },
  {
    id: 'RENAISSANCE_WALLS', name: 'Renaissance Walls', district: 'CITY_CENTER', cost: 300, requiresAny: ['MEDIEVAL_WALLS'], maintenance: 0, walls: 3, noPurchase: true,
    // CIV6 (BUILDING_TSIKHE): Cost 260 against the Star Fort's 300.
    // OuterDefenseHitPoints 200 against the Star
    // Fort's 100 — one tier's worth MORE perimeter, which puts a Georgian
    // city on the Urban Defenses pool while it keeps the Renaissance tier's
    // Combat Strength. Faith 4, paid again while the seat holds a Golden Age.
    // TRAIT_TSIKHE_PRODUCTION (+50% Production toward the Tsikhe) needs no
    // row of its own: it exists in the install only because the Tsikhe is a
    // different BuildingType from the Star Fort, and Strength in Unity's
    // RENAISSANCE_WALLS row in `PROD_MULT_ROWS` already pays it here.
    civVariants: [{
      civ: 'GEORGIA', name: 'Tsikhe', cost: 260,
      yields: { faith: 4 }, goldenAgeYields: { faith: 4 },
      wallsHpBonus: 100,
    }],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'PrereqDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'Maintenance'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_STAR_FORT', 'PrereqBuilding')] },
      walls: { stylized: 'the engine tier index (1 Ancient, 2 Medieval, 3 Renaissance); the install carries OuterDefenseHitPoints, not a tier' },
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'PurchaseYield')] },
      'civVariants.0.cost': xml('Buildings', 'BuildingType=BUILDING_TSIKHE', 'Cost', { scale: GAME_SPEED }),
      'civVariants.0.yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_TSIKHE&YieldType=YIELD_FAITH', 'YieldChange'),
      'civVariants.0.goldenAgeYields.faith': xml('ModifierArguments', 'ModifierId=TSIKHE_FAITH_GOLDEN_AGE&Name=Amount', 'Value'),
      'civVariants.0.wallsHpBonus': { derived: 'the unique row\'s OuterDefenseHitPoints MINUS the row it replaces (200 - 100)', inputs: [xml('Buildings', 'BuildingType=BUILDING_TSIKHE', 'OuterDefenseHitPoints'), xml('Buildings', 'BuildingType=BUILDING_STAR_FORT', 'OuterDefenseHitPoints')] },
    },
  },

  // THE DAM. CIV6: "Provides 6 Power to the city from renewable water
  // sources" — the earliest alternative to a fossil plant, and the densest.
  { id: 'HYDROELECTRIC_DAM', name: 'Hydroelectric Dam', district: 'DAM', cost: 440, maintenance: 1, powerSupply: 6,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_HYDROELECTRIC_DAM', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_HYDROELECTRIC_DAM', 'PrereqDistrict', { expect: 'DISTRICT_DAM' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_HYDROELECTRIC_DAM', 'Maintenance'),
      powerSupply: xml('ModifierArguments', 'ModifierId=HYDROELECTRIC_DAM_FREE_POWER&Name=Amount', 'Value'),
    },
  },

  // THE WATER PARK. The Aquarium and the Aquatics Center reach NINE tiles,
  // not the six every other regional row reaches.
  { id: 'FERRIS_WHEEL', name: 'Ferris Wheel', district: 'WATER_PARK', cost: 290, maintenance: 1, amenities: 2, yields: { culture: 3 },
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_FERRIS_WHEEL', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_FERRIS_WHEEL', 'PrereqDistrict', { expect: 'DISTRICT_WATER_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_FERRIS_WHEEL', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_FERRIS_WHEEL', 'Entertainment'),
      'yields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_FERRIS_WHEEL&YieldType=YIELD_CULTURE', 'YieldChange'),
    },
  },
  { id: 'AQUARIUM', name: 'Aquarium', district: 'WATER_PARK', cost: 360, requiresAny: ['FERRIS_WHEEL'], maintenance: 2, amenities: 1, regional: true, regionalRange: 9,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'PrereqDistrict', { expect: 'DISTRICT_WATER_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'Entertainment'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_AQUARIUM', 'PrereqBuilding')] },
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'RegionalRange')] },
      regionalRange: xml('Buildings', 'BuildingType=BUILDING_AQUARIUM', 'RegionalRange'),
    },
  },
  { id: 'AQUATICS_CENTER', name: 'Aquatics Center', district: 'WATER_PARK', cost: 480, requiresAny: ['AQUARIUM'], maintenance: 3, amenities: 1, poweredAmenities: 2, power: 2, regional: true, regionalRange: 9,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'PrereqDistrict', { expect: 'DISTRICT_WATER_ENTERTAINMENT_COMPLEX' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'Maintenance'),
      amenities: xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'Entertainment'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_AQUATICS_CENTER', 'PrereqBuilding')] },
      power: xml('Buildings_XP2', 'BuildingType=BUILDING_AQUATICS_CENTER', 'RequiredPower'),
      poweredAmenities: xml('Buildings_XP2', 'BuildingType=BUILDING_AQUATICS_CENTER', 'EntertainmentBonusWithPower'),
      regional: { derived: 'true where the install row carries a RegionalRange', inputs: [xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'RegionalRange')] },
      regionalRange: xml('Buildings', 'BuildingType=BUILDING_AQUATICS_CENTER', 'RegionalRange'),
    },
  },

  // THE PRESERVE. CIV6: "Unlike other district buildings, you can build these
  // buildings in any order provided that you have unlocked them both" — which
  // is why the Sanctuary requires nothing.
  { id: 'GROVE', name: 'Grove', district: 'PRESERVE', cost: 150, appealYields: { charming: { food: 1, faith: 1 }, breathtaking: { food: 2, faith: 2, culture: 2 } },
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GROVE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GROVE', 'PrereqDistrict', { expect: 'DISTRICT_PRESERVE' }),
      'appealYields.charming.food': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_GROVE&YieldType=YIELD_FOOD&MinimumValue=2', 'YieldChange'),
      'appealYields.charming.faith': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_GROVE&YieldType=YIELD_FAITH&MinimumValue=2', 'YieldChange'),
      'appealYields.breathtaking.food': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_GROVE&YieldType=YIELD_FOOD&MinimumValue=4', 'YieldChange'),
      'appealYields.breathtaking.faith': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_GROVE&YieldType=YIELD_FAITH&MinimumValue=4', 'YieldChange'),
      'appealYields.breathtaking.culture': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_GROVE&YieldType=YIELD_CULTURE&MinimumValue=4', 'YieldChange'),
    },
  },
  { id: 'SANCTUARY', name: 'Sanctuary', district: 'PRESERVE', cost: 440, appealYields: { charming: { science: 1, gold: 1 }, breathtaking: { science: 2, gold: 2, production: 2 } },
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_SANCTUARY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_SANCTUARY', 'PrereqDistrict', { expect: 'DISTRICT_PRESERVE' }),
      'appealYields.charming.science': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_SANCTUARY&YieldType=YIELD_SCIENCE&MinimumValue=2', 'YieldChange'),
      'appealYields.charming.gold': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_SANCTUARY&YieldType=YIELD_GOLD&MinimumValue=2', 'YieldChange'),
      'appealYields.breathtaking.science': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_SANCTUARY&YieldType=YIELD_SCIENCE&MinimumValue=4', 'YieldChange'),
      'appealYields.breathtaking.gold': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_SANCTUARY&YieldType=YIELD_GOLD&MinimumValue=4', 'YieldChange'),
      'appealYields.breathtaking.production': xml('Adjacent_AppealYieldChanges', 'BuildingType=BUILDING_SANCTUARY&YieldType=YIELD_PRODUCTION&MinimumValue=4', 'YieldChange'),
    },
  },

  // THE DIPLOMATIC QUARTER.
  // CIV6 (Consulate): "+2 Influence Points per turn. Enemy Spy's level is
  // reduced by 1 when targeting this city or cities with Encampments."
  { id: 'CONSULATE', name: 'Consulate', district: 'DIPLOMATIC_QUARTER', cost: 150, maintenance: 1, influencePerTurn: 2, spyLevelPenalty: 1, spyLevelPenaltyEncampment: 1,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_CONSULATE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_CONSULATE', 'PrereqDistrict', { expect: 'DISTRICT_DIPLOMATIC_QUARTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_CONSULATE', 'Maintenance'),
      influencePerTurn: xml('ModifierArguments', 'ModifierId=CONSULATE_INFLUENCEPOINTS&Name=Amount', 'Value'),
      spyLevelPenalty: xml('ModifierArguments', 'ModifierId=CONSULATE_SPY_BONUS&Name=Amount', 'Value'),
      spyLevelPenaltyEncampment: xml('ModifierArguments', 'ModifierId=CONSULATE_SPY_BONUS&Name=Amount', 'Value', { note: 'the same clause reaches this seat\'s Encampment cities' }),
    },
  },
  { id: 'CHANCERY', name: 'Chancery', district: 'DIPLOMATIC_QUARTER', cost: 290, requiresAny: ['CONSULATE'], maintenance: 2, influencePerTurn: 3,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_CHANCERY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_CHANCERY', 'PrereqDistrict', { expect: 'DISTRICT_DIPLOMATIC_QUARTER' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_CHANCERY', 'Maintenance'),
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_CHANCERY', 'PrereqBuilding')] },
      influencePerTurn: xml('ModifierArguments', 'ModifierId=CHANCERY_INFLUENCEPOINTS&Name=Amount', 'Value'),
    },
  },

  // THE GOVERNMENT PLAZA, in three tiers. Each tier needs a government of its
  // own tier and ONE finished building of the tier below, and the three rows
  // of a tier exclude each other: a Plaza ends the game holding three
  // buildings, one per tier. CIV6: "Government Plaza buildings, unlike those
  // of other districts, cannot be purchased with Gold."
  { id: 'ANCESTRAL_HALL', name: 'Ancestral Hall', district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], settlerProdPct: 50, grantUnitNewCity: 'BUILDER',
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_WIDE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_WIDE', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_WIDE', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_WIDE', 'GovernmentTierRequirement', { expect: 'Tier1' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_WIDE_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_WIDE', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_WIDE', 'MutuallyExclusiveBuilding')] },
      settlerProdPct: xml('ModifierArguments', 'ModifierId=GOV_SETTLER_COST_REDUCTION&Name=Amount', 'Value'),
      grantUnitNewCity: xml('ModifierArguments', 'ModifierId=GOV_SETTLER_GRANT_BUILDER&Name=UnitType', 'Value', { expect: 'UNIT_BUILDER' }),
    },
  },
  { id: 'AUDIENCE_CHAMBER', name: 'Audience Chamber', district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['ANCESTRAL_HALL', 'WARLORDS_THRONE'], loyaltyWithoutGovernor: -2, amenitiesWithGovernor: 2, housingWithGovernor: 4,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_TALL', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_TALL', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_TALL', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_TALL', 'GovernmentTierRequirement', { expect: 'Tier1' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_TALL_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_TALL', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_TALL', 'MutuallyExclusiveBuilding')] },
      loyaltyWithoutGovernor: xml('ModifierArguments', 'ModifierId=GOV_TALL_LOYALTY_DEBUFF&Name=Amount', 'Value'),
      amenitiesWithGovernor: xml('ModifierArguments', 'ModifierId=GOV_TALL_AMENITY_BUFF&Name=Amount', 'Value'),
      housingWithGovernor: xml('ModifierArguments', 'ModifierId=GOV_TALL_HOUSING_BUFF&Name=Amount', 'Value'),
    },
  },
  { id: 'WARLORDS_THRONE', name: "Warlord's Throne", district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER'], conquestProdPct: 20, conquestProdTurns: 5,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_CONQUEST', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_CONQUEST', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_CONQUEST', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_CONQUEST', 'GovernmentTierRequirement', { expect: 'Tier1' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_CONQUEST_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_CONQUEST', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_CONQUEST', 'MutuallyExclusiveBuilding')] },
      conquestProdPct: xml('ModifierArguments', 'ModifierId=GOV_PRODUCTION_BOOST_FROM_CAPTURE&Name=Amount', 'Value'),
      conquestProdTurns: xml('ModifierArguments', 'ModifierId=GOV_PRODUCTION_BOOST_FROM_CAPTURE&Name=TurnsActive', 'Value'),
    },
  },
  { id: 'FOREIGN_MINISTRY', name: 'Foreign Ministry', district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, favorPerTurn: 3, requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_CITYSTATES', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_CITYSTATES', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_CITYSTATES', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_CITYSTATES', 'GovernmentTierRequirement', { expect: 'Tier2' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_CITYSTATES_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_CITYSTATES', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_CITYSTATES', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_CITYSTATES', 'PrereqBuilding')] },
      favorPerTurn: xml('ModifierArguments', 'ModifierId=GOVCITYSTATES_ADJUST_FAVOR&Name=Amount', 'Value'),
    },
  },
  { id: 'GRAND_MASTERS_CHAPEL', name: "Grand Master's Chapel", district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, faithBuyUnits: true, pillageFaithImp: 15, pillageFaithDist: 30, yields: { faith: 5 }, requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['FOREIGN_MINISTRY', 'INTELLIGENCE_AGENCY'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_FAITH', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_FAITH', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_FAITH', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_FAITH', 'GovernmentTierRequirement', { expect: 'Tier2' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_FAITH_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_FAITH', 'PurchaseYield')] },
      'yields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_GOV_FAITH&YieldType=YIELD_FAITH', 'YieldChange'),
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_FAITH', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_FAITH', 'PrereqBuilding')] },
      pillageFaithImp: xml('ModifierArguments', 'ModifierId=GOV_FAITH_PILLAGE_IMPROVEMENT_FAITH&Name=Amount', 'Value'),
      pillageFaithDist: xml('ModifierArguments', 'ModifierId=GOV_FAITH_PILLAGE_DISTRICT_FAITH&Name=Amount', 'Value'),
      faithBuyUnits: { derived: 'true where the install row carries a MODIFIER_PLAYER_CITIES_ENABLE_UNIT_FAITH_PURCHASE per land military class', inputs: [xml('ModifierArguments', 'ModifierId=GOV_FAITH_PURCHASE_MELEE&Name=Tag', 'Value')] },
    },
  },
  { id: 'INTELLIGENCE_AGENCY', name: 'Intelligence Agency', district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, spyCapacity: 1, grantUnit: 'SPY', requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_SPIES', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_SPIES', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_SPIES', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_SPIES', 'GovernmentTierRequirement', { expect: 'Tier2' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_SPIES_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_SPIES', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_SPIES', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_SPIES', 'PrereqBuilding')] },
      spyCapacity: xml('ModifierArguments', 'ModifierId=GOV_GRANT_SPY&Name=Amount', 'Value'),
      grantUnit: xml('ModifierArguments', 'ModifierId=GOV_ADD_SPY_UNIT&Name=UnitType', 'Value', { expect: 'UNIT_SPY' }),
    },
  },
  { id: 'NATIONAL_HISTORY_MUSEUM', name: 'National History Museum', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['ROYAL_SOCIETY', 'WAR_DEPARTMENT'],
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_CULTURE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_CULTURE', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_CULTURE', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_CULTURE', 'GovernmentTierRequirement', { expect: 'Tier3' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_CULTURE_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_CULTURE', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_CULTURE', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_CULTURE', 'PrereqBuilding')] },
    },
  },
  { id: 'ROYAL_SOCIETY', name: 'Royal Society', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['NATIONAL_HISTORY_MUSEUM', 'WAR_DEPARTMENT'], projectChargePct: 2,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_SCIENCE', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_SCIENCE', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_SCIENCE', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_SCIENCE', 'GovernmentTierRequirement', { expect: 'Tier3' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_SCIENCE_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_SCIENCE', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_SCIENCE', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_SCIENCE', 'PrereqBuilding')] },
      projectChargePct: xml('ModifierArguments', 'ModifierId=GOV_PROJECT_ABILITY&Name=Amount', 'Value'),
    },
  },
  { id: 'WAR_DEPARTMENT', name: 'War Department', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['NATIONAL_HISTORY_MUSEUM', 'ROYAL_SOCIETY'], healOnKill: 20,
    src: {
      cost: xml('Buildings', 'BuildingType=BUILDING_GOV_MILITARY', 'Cost', { scale: GAME_SPEED }),
      district: xml('Buildings', 'BuildingType=BUILDING_GOV_MILITARY', 'PrereqDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      maintenance: xml('Buildings', 'BuildingType=BUILDING_GOV_MILITARY', 'Maintenance'),
      govTier: xml('Buildings', 'BuildingType=BUILDING_GOV_MILITARY', 'GovernmentTierRequirement', { expect: 'Tier3' }),
      govTitle: xml('ModifierArguments', 'ModifierId=GOV_BUILDING_MILITARY_GRANT_GOVERNOR_POINTS&Name=Delta', 'Value'),
      noPurchase: { derived: 'true where the install row carries NO PurchaseYield', inputs: [xml('Buildings', 'BuildingType=BUILDING_GOV_MILITARY', 'PurchaseYield')] },
      exclusiveWith: { derived: 'the MutuallyExclusiveBuildings rows of this building, as engine ids', inputs: [xml('MutuallyExclusiveBuildings', 'Building=BUILDING_GOV_MILITARY', 'MutuallyExclusiveBuilding')] },
      requiresAny: { derived: 'the BuildingPrereqs rows of this building, as engine ids', inputs: [xml('BuildingPrereqs', 'Building=BUILDING_GOV_MILITARY', 'PrereqBuilding')] },
      healOnKill: xml('ModifierArguments', 'ModifierId=GOV_HEAL_AFTER_DEFEATING_UNIT&Name=Amount', 'Value'),
    },
  },
];

const list: BuildingDef[] = rawList.map((b) => ({
  ...b,
  cost: Math.round(b.cost * GAME_SPEED),
  // A VARIANT's own price is a catalog cost like any other and rides the same
  // game-speed scale as the row it replaces. Missing this made the Grand
  // Bazaar dearer than the Bank instead of cheaper.
  civVariants: b.civVariants?.map(
    (v) => (v.cost === undefined ? v : { ...v, cost: Math.round(v.cost * GAME_SPEED) })),
}));

/**
 * CIV6 (Autocracy): "+1 to all yields for each Government Plaza building,
 * Diplomatic Quarter building, and palace in a city." Derived from the
 * district rather than transcribed, so a new row in either district counts
 * itself; the exporter hands the same answer to the GPU.
 */
export const isGovYieldBuilding = (b: { id: string; district: string }): boolean =>
  b.district === 'GOVERNMENT_PLAZA' || b.district === 'DIPLOMATIC_QUARTER' || b.id === 'PALACE';

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));

/** The power plants, in catalog order — the order both engines walk when they
 *  pick which plant's stockpile answers a city. */
export const POWER_PLANT_IDS: string[] = list.filter((b) => b.powerPlant).map((b) => b.id);

export function buildingsForDistrict(district: DistrictId): BuildingDef[] {
  return list.filter((b) => b.district === district && !b.autoCapital);
}

export const SCRIPTED_HELD_BUILDINGS: ReadonlySet<string> = new Set();

/** the ERA a building first becomes available — the era index of the tech or
 *  civic that unlocks it (0 = unlocked from the start). Heartbeat of Steam's
 *  "Industrial or later building" gate reads this. */
import { TECHS, ERAS } from './techs';
import { CIVICS } from './civics';
export const BUILDING_ERA_INDEX: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const t of Object.values(TECHS)) {
    for (const fx of t.effects ?? []) {
      if (fx.kind === 'unlockBuilding') out[fx.building] = Math.max(0, ERAS.indexOf(t.era));
    }
  }
  for (const c of Object.values(CIVICS)) {
    for (const fx of c.effects ?? []) {
      if (fx.kind === 'unlockBuilding') out[fx.building] = Math.max(0, ERAS.indexOf(c.era));
    }
  }
  return out;
})();


const EFFECTIVE_BUILDING_CACHE = new Map<string, BuildingDef>();

/**
 * THE ROW A SEAT ACTUALLY BUILDS: the base row with its civilization's unique
 * variant merged over it. Every column reader asks here rather than indexing
 * `BUILDINGS` directly, so a unique building's price, yields, Housing,
 * Amenities, upkeep, Power and regional reach all arrive through one door.
 *
 * The clauses a variant carries that are NOT BuildingDef columns (the Marae's
 * feature yields, the Tsikhe's Golden Age Faith, the Ordu's Movement grant)
 * stay on the variant and are read by name — a column here would be a second
 * home for one fact.
 *
 * Memoized on (civilization, id): both are catalog facts that never change
 * inside a game, so the cache can never go stale.
 */
export function effectiveBuilding(civ: string | null | undefined, id: string): BuildingDef | undefined {
  const def = BUILDINGS[id];
  if (!def || !civ || !def.civVariants) return def;
  const v = def.civVariants.find((x) => x.civ === civ);
  if (!v) return def;
  const key = `${civ}|${id}`;
  const hit = EFFECTIVE_BUILDING_CACHE.get(key);
  if (hit) return hit;
  const out: BuildingDef = { ...def, name: v.name };
  for (const k of BUILDING_VARIANT_COLUMNS) {
    const x = v[k];
    if (x !== undefined) (out as unknown as Record<string, unknown>)[k] = x;
  }
  EFFECTIVE_BUILDING_CACHE.set(key, out);
  return out;
}

/** the unique variant of `id` this civilization builds, or undefined. */
export function buildingVariantFor(civ: string | null | undefined, id: string): BuildingVariant | undefined {
  if (!civ) return undefined;
  return BUILDINGS[id]?.civVariants?.find((x) => x.civ === civ);
}
