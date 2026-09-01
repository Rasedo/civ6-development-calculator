/**
 * Buildings (base game, available to every civ; no wonders, no walls).
 * Costs + yields verified against civfanatics.com/civ6/info/building
 * — the real cost ladder 60/65/80/105/135/175/225/265/355/405/525.
 * Maintenance: every building carries the VERIFIED base-game upkeep
 * (civ6bbg.github.io/en_US/buildings_base_game.html); the
 * cost-tier heuristic in city.ts survives only as a fallback for future
 * unverified additions. Worship buildings stay 0 (faith-purchased).
 */

import type { DistrictId, Yields } from '../core/types';
import type { PromoClass } from './promotions';
import { GAME_SPEED } from './constants';

export interface BuildingDef {
  id: string;
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
  /** CIV6 (National History Museum): "Provides 4 slots for any Great Work" —
   *  ONE shared pool, which a work of any kind falls into once the slots of
   *  its own kind are full. */
  anyWorkSlots?: number;
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
  { id: 'PALACE', name: 'Palace', district: 'CITY_CENTER', cost: 0, yields: { production: 2, gold: 5, science: 2, culture: 1 }, housing: 1, amenities: 1, autoCapital: true },
  // CIV6 (R&F/GS): "+1 Loyalty. +1 Culture. +1 additional Culture if city is
  // at maximum Loyalty." The +2 culture flat is the VANILLA row.
  { id: 'MONUMENT', name: 'Monument', district: 'CITY_CENTER', cost: 60, yields: { culture: 1 }, loyalty: 1, special: 'MONUMENT', maintenance: 0 },
  { id: 'GRANARY', name: 'Granary', district: 'CITY_CENTER', cost: 65, yields: { food: 1 }, housing: 2, maintenance: 0 },
  { id: 'WATER_MILL', name: 'Water Mill', district: 'CITY_CENTER', cost: 80, yields: { food: 1, production: 1 }, special: 'WATER_MILL', maintenance: 0 },
  { id: 'SEWER', name: 'Sewer', district: 'CITY_CENTER', cost: 200, housing: 2, maintenance: 2 },
  // CIV6 (Flood Barrier): Atomic era, City Center, requires Computers, and
  // "Cannot be Purchased with Gold". Its cost and maintenance are both
  // "Variable" on the page, priced off the lowland tiles it covers.
  // CIV6 (Expansion2_Buildings.xml): Maintenance 1; the BUILD cost scales
  // per protected tile and per sea level (`floodBarrierCost`).
  { id: 'FLOOD_BARRIER', name: 'Flood Barrier', district: 'CITY_CENTER', cost: 80, maintenance: 1, noPurchase: true, floodBarrier: true },
  { id: 'ANCIENT_WALLS', name: 'Ancient Walls', district: 'CITY_CENTER', cost: 80, maintenance: 0, walls: 1 },

  { id: 'LIBRARY', name: 'Library', district: 'CAMPUS', cost: 90, yields: { science: 2 }, maintenance: 1 },
  { id: 'UNIVERSITY', name: 'University', district: 'CAMPUS', cost: 250, requiresAny: ['LIBRARY'], yields: { science: 4 }, housing: 1, maintenance: 2 },
  { id: 'RESEARCH_LAB', name: 'Research Lab', district: 'CAMPUS', cost: 440, requiresAny: ['UNIVERSITY'], yields: { science: 3 }, power: 3, poweredYields: { science: 5 }, maintenance: 3 },

  { id: 'SHRINE', name: 'Shrine', district: 'HOLY_SITE', cost: 70, yields: { faith: 2 }, maintenance: 1 },
  { id: 'TEMPLE', name: 'Temple', district: 'HOLY_SITE', cost: 120, requiresAny: ['SHRINE'], yields: { faith: 4 }, maintenance: 2 },
  { id: 'CATHEDRAL', name: 'Cathedral', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, culture: 3 }, worship: true },
  { id: 'GURDWARA', name: 'Gurdwara', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, food: 2 }, worship: true },
  { id: 'MEETING_HOUSE', name: 'Meeting House', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, production: 2 }, worship: true },
  { id: 'PAGODA', name: 'Pagoda', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, housing: 1, worship: true },
  { id: 'STUPA', name: 'Stupa', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, amenities: 1, worship: true },

  { id: 'AMPHITHEATER', name: 'Amphitheater', district: 'THEATER_SQUARE', cost: 150, yields: { culture: 2 }, maintenance: 1 },
  { id: 'MUSEUM', name: 'Museum', district: 'THEATER_SQUARE', cost: 290, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['ARCHAEOLOGICAL_MUSEUM'], yields: { culture: 2 }, maintenance: 2 },
  { id: 'BROADCAST_CENTER', name: 'Broadcast Center', district: 'THEATER_SQUARE', cost: 440, requiresAny: ['MUSEUM'], yields: { culture: 2 }, power: 3, poweredYields: { culture: 4 }, maintenance: 3 },
  { id: 'MARKET', name: 'Market', district: 'COMMERCIAL_HUB', cost: 120, yields: { gold: 2 }, maintenance: 0 },
  { id: 'BANK', name: 'Bank', district: 'COMMERCIAL_HUB', cost: 290, requiresAny: ['MARKET'], yields: { gold: 5 }, maintenance: 0 },
  { id: 'STOCK_EXCHANGE', name: 'Stock Exchange', district: 'COMMERCIAL_HUB', cost: 330, requiresAny: ['BANK'], yields: { gold: 4 }, power: 3, poweredYields: { gold: 7 }, maintenance: 0 },

  // CIV6: "+1 Food. +1 Food in Coast and Lake tiles controlled by the city.
  // +1 Gold. +1 Housing."
  { id: 'LIGHTHOUSE', name: 'Lighthouse', district: 'HARBOR', cost: 120, yields: { food: 1, gold: 1 }, housing: 1, special: 'LIGHTHOUSE', maintenance: 0 },
  { id: 'SHIPYARD', name: 'Shipyard', district: 'HARBOR', cost: 290, requiresAny: ['LIGHTHOUSE'], special: 'SHIPYARD', maintenance: 1, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER'] },
  { id: 'SEAPORT', name: 'Seaport', district: 'HARBOR', cost: 440, requiresAny: ['SHIPYARD'], yields: { food: 2, gold: 2 }, housing: 1, maintenance: 0, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER'] },

  { id: 'WORKSHOP', name: 'Workshop', district: 'INDUSTRIAL_ZONE', cost: 195, yields: { production: 3 }, maintenance: 1 },
  { id: 'FACTORY', name: 'Factory', district: 'INDUSTRIAL_ZONE', cost: 330, requiresAny: ['WORKSHOP'], yields: { production: 3 }, power: 2, poweredYields: { production: 3 }, regional: true, maintenance: 2 },
  // THE THREE POWER PLANTS. CIV6 (GS): one per Industrial Zone, each
  // "convert[ing] stockpiles of the relevant resource into Power" at its own
  // published rate — Coal 1:4, Oil 1:4, Uranium 1:16.
  { id: 'COAL_POWER_PLANT', name: 'Coal Power Plant', district: 'INDUSTRIAL_ZONE', cost: 300, requiresAny: ['FACTORY'], exclusiveWith: ['OIL_POWER_PLANT', 'NUCLEAR_POWER_PLANT'], special: 'COAL_PLANT', powerPlant: true, fuel: 'COAL', fuelRate: 4, maintenance: 3 },
  { id: 'OIL_POWER_PLANT', name: 'Oil Power Plant', district: 'INDUSTRIAL_ZONE', cost: 360, requiresAny: ['FACTORY'], exclusiveWith: ['COAL_POWER_PLANT', 'NUCLEAR_POWER_PLANT'], yields: { production: 3 }, regional: true, powerPlant: true, fuel: 'OIL', fuelRate: 4, maintenance: 3 },
  { id: 'NUCLEAR_POWER_PLANT', name: 'Nuclear Power Plant', district: 'INDUSTRIAL_ZONE', cost: 480, requiresAny: ['FACTORY'], exclusiveWith: ['COAL_POWER_PLANT', 'OIL_POWER_PLANT'], yields: { production: 4, science: 3 }, regional: true, powerPlant: true, fuel: 'URANIUM', fuelRate: 16, maintenance: 3 },

  { id: 'BARRACKS', name: 'Barracks', district: 'ENCAMPMENT', cost: 90, exclusiveWith: ['STABLE'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXpPct: 25, trainXpClasses: ['MELEE', 'RANGED', 'ANTICAV'] },
  { id: 'STABLE', name: 'Stable', district: 'ENCAMPMENT', cost: 120, exclusiveWith: ['BARRACKS'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXpPct: 25, trainXpClasses: ['LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'] },
  { id: 'ARMORY', name: 'Armory', district: 'ENCAMPMENT', cost: 195, requiresAny: ['BARRACKS', 'STABLE'], yields: { production: 3 }, maintenance: 2, trainXpPct: 25, trainXpClasses: ['MELEE', 'ANTICAV', 'RANGED', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'] },
  { id: 'MILITARY_ACADEMY', name: 'Military Academy', district: 'ENCAMPMENT', cost: 330, requiresAny: ['ARMORY'], yields: { production: 4 }, housing: 1, maintenance: 2, trainXpPct: 25, trainXpClasses: ['MELEE', 'ANTICAV', 'RANGED', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'] },

  { id: 'HANGAR', name: 'Hangar', district: 'AERODROME', cost: 380, yields: { production: 2 }, maintenance: 1, airSlots: 1, trainXpPct: 25, trainXpClasses: ['AIR_FIGHTER', 'AIR_BOMBER'] },
  { id: 'AIRPORT', name: 'Airport', district: 'AERODROME', cost: 480, requiresAny: ['HANGAR'], yields: { production: 3 }, maintenance: 2, airSlots: 1, trainXpPct: 50, trainXpClasses: ['AIR_FIGHTER', 'AIR_BOMBER'] },

  { id: 'ARENA', name: 'Arena', district: 'ENTERTAINMENT_COMPLEX', cost: 150, amenities: 2, yields: { culture: 1 }, maintenance: 1 },
  { id: 'ZOO', name: 'Zoo', district: 'ENTERTAINMENT_COMPLEX', cost: 360, requiresAny: ['ARENA'], amenities: 1, regional: true, maintenance: 2 },
  { id: 'STADIUM', name: 'Stadium', district: 'ENTERTAINMENT_COMPLEX', cost: 480, requiresAny: ['ZOO'], amenities: 1, power: 2, poweredAmenities: 2, regional: true, maintenance: 3 },

  // ARCHAEOLOGICAL MUSEUM — in real Civ 6 the Theater Square offers
  // the ART MUSEUM or the ARCHAEOLOGICAL MUSEUM as a choice; same district,
  // same cost, 3 ARTIFACT slots instead of 3 art slots. APPENDED LAST on
  // purpose: roster order IS the GPU's building index, so inserting it beside
  // the other Theater Square rows would renumber every downstream building in
  // both engines and in every exported fixture.
  { id: 'ARCHAEOLOGICAL_MUSEUM', name: 'Archaeological Museum', district: 'THEATER_SQUARE', cost: 290, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['MUSEUM'], yields: { culture: 2 }, maintenance: 2 },

  // THE UPGRADED WALLS, appended last for the same index-stability reason as
  // the Archaeological Museum above. Both carry the Gathering Storm cost and
  // require the tier below; both refuse a gold purchase.
  { id: 'MEDIEVAL_WALLS', name: 'Medieval Walls', district: 'CITY_CENTER', cost: 220, requiresAny: ['ANCIENT_WALLS'], maintenance: 0, walls: 2, noPurchase: true },
  { id: 'RENAISSANCE_WALLS', name: 'Renaissance Walls', district: 'CITY_CENTER', cost: 300, requiresAny: ['MEDIEVAL_WALLS'], maintenance: 0, walls: 3, noPurchase: true },

  // THE DAM. CIV6: "Provides 6 Power to the city from renewable water
  // sources" — the earliest alternative to a fossil plant, and the densest.
  { id: 'HYDROELECTRIC_DAM', name: 'Hydroelectric Dam', district: 'DAM', cost: 440, maintenance: 1, powerSupply: 6 },

  // THE WATER PARK. The Aquarium and the Aquatics Center reach NINE tiles,
  // not the six every other regional row reaches.
  { id: 'FERRIS_WHEEL', name: 'Ferris Wheel', district: 'WATER_PARK', cost: 290, maintenance: 1, amenities: 2, yields: { culture: 3 } },
  { id: 'AQUARIUM', name: 'Aquarium', district: 'WATER_PARK', cost: 360, requiresAny: ['FERRIS_WHEEL'], maintenance: 2, amenities: 1, regional: true, regionalRange: 9 },
  { id: 'AQUATICS_CENTER', name: 'Aquatics Center', district: 'WATER_PARK', cost: 660, requiresAny: ['AQUARIUM'], maintenance: 3, amenities: 1, poweredAmenities: 2, power: 2, regional: true, regionalRange: 9 },

  // THE PRESERVE. CIV6: "Unlike other district buildings, you can build these
  // buildings in any order provided that you have unlocked them both" — which
  // is why the Sanctuary requires nothing.
  { id: 'GROVE', name: 'Grove', district: 'PRESERVE', cost: 150, appealYields: { charming: { food: 1, faith: 1 }, breathtaking: { food: 2, faith: 2, culture: 2 } } },
  { id: 'SANCTUARY', name: 'Sanctuary', district: 'PRESERVE', cost: 440, appealYields: { charming: { science: 1, gold: 1 }, breathtaking: { science: 2, gold: 2, production: 2 } } },

  // THE DIPLOMATIC QUARTER.
  // CIV6 (Consulate): "+2 Influence Points per turn. Enemy Spy's level is
  // reduced by 1 when targeting this city or cities with Encampments."
  { id: 'CONSULATE', name: 'Consulate', district: 'DIPLOMATIC_QUARTER', cost: 150, maintenance: 1, influencePerTurn: 2, spyLevelPenalty: 1, spyLevelPenaltyEncampment: 1 },
  { id: 'CHANCERY', name: 'Chancery', district: 'DIPLOMATIC_QUARTER', cost: 290, requiresAny: ['CONSULATE'], maintenance: 2, influencePerTurn: 3 },

  // THE GOVERNMENT PLAZA, in three tiers. Each tier needs a government of its
  // own tier and ONE finished building of the tier below, and the three rows
  // of a tier exclude each other: a Plaza ends the game holding three
  // buildings, one per tier. CIV6: "Government Plaza buildings, unlike those
  // of other districts, cannot be purchased with Gold."
  { id: 'ANCESTRAL_HALL', name: 'Ancestral Hall', district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], settlerProdPct: 50, grantUnitNewCity: 'BUILDER' },
  { id: 'AUDIENCE_CHAMBER', name: 'Audience Chamber', district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['ANCESTRAL_HALL', 'WARLORDS_THRONE'], loyaltyWithoutGovernor: -2, amenitiesWithGovernor: 2, housingWithGovernor: 4 },
  { id: 'WARLORDS_THRONE', name: "Warlord's Throne", district: 'GOVERNMENT_PLAZA', cost: 150, maintenance: 1, govTier: 1, govTitle: 1, noPurchase: true, exclusiveWith: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER'], conquestProdPct: 20, conquestProdTurns: 5 },
  { id: 'FOREIGN_MINISTRY', name: 'Foreign Ministry', district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, favorPerTurn: 3, requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'] },
  { id: 'GRAND_MASTERS_CHAPEL', name: "Grand Master's Chapel", district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, faithBuyUnits: true, pillageFaithImp: 15, pillageFaithDist: 30, yields: { faith: 5 }, requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['FOREIGN_MINISTRY', 'INTELLIGENCE_AGENCY'] },
  { id: 'INTELLIGENCE_AGENCY', name: 'Intelligence Agency', district: 'GOVERNMENT_PLAZA', cost: 290, maintenance: 2, govTier: 2, govTitle: 1, noPurchase: true, spyCapacity: 1, grantUnit: 'SPY', requiresAny: ['ANCESTRAL_HALL', 'AUDIENCE_CHAMBER', 'WARLORDS_THRONE'], exclusiveWith: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL'] },
  { id: 'NATIONAL_HISTORY_MUSEUM', name: 'National History Museum', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['ROYAL_SOCIETY', 'WAR_DEPARTMENT'], anyWorkSlots: 4 },
  { id: 'ROYAL_SOCIETY', name: 'Royal Society', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['NATIONAL_HISTORY_MUSEUM', 'WAR_DEPARTMENT'], projectChargePct: 2 },
  { id: 'WAR_DEPARTMENT', name: 'War Department', district: 'GOVERNMENT_PLAZA', cost: 440, maintenance: 3, govTier: 3, govTitle: 1, noPurchase: true, requiresAny: ['FOREIGN_MINISTRY', 'GRAND_MASTERS_CHAPEL', 'INTELLIGENCE_AGENCY'], exclusiveWith: ['NATIONAL_HISTORY_MUSEUM', 'ROYAL_SOCIETY'], healOnKill: 20 },
];

const list: BuildingDef[] = rawList.map((b) => ({ ...b, cost: Math.round(b.cost * GAME_SPEED) }));

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
