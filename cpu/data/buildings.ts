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
}

const rawList: BuildingDef[] = [
  { id: 'PALACE', name: 'Palace', district: 'CITY_CENTER', cost: 0, yields: { production: 2, gold: 5, science: 2, culture: 1 }, housing: 1, amenities: 1, autoCapital: true },
  // CIV6 (R&F/GS): "+1 Loyalty. +1 Culture. +1 additional Culture if city is
  // at maximum Loyalty." The +2 culture flat is the VANILLA row.
  { id: 'MONUMENT', name: 'Monument', district: 'CITY_CENTER', cost: 60, yields: { culture: 1 }, loyalty: 1, special: 'MONUMENT', maintenance: 0 },
  { id: 'GRANARY', name: 'Granary', district: 'CITY_CENTER', cost: 65, yields: { food: 1 }, housing: 2, maintenance: 0 },
  { id: 'WATER_MILL', name: 'Water Mill', district: 'CITY_CENTER', cost: 80, yields: { food: 1, production: 1 }, special: 'WATER_MILL', maintenance: 0 },
  { id: 'SEWER', name: 'Sewer', district: 'CITY_CENTER', cost: 200, housing: 2, maintenance: 2 },
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
  { id: 'SHIPYARD', name: 'Shipyard', district: 'HARBOR', cost: 290, requiresAny: ['LIGHTHOUSE'], special: 'SHIPYARD', maintenance: 1, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED'] },
  { id: 'SEAPORT', name: 'Seaport', district: 'HARBOR', cost: 440, requiresAny: ['SHIPYARD'], yields: { food: 2, gold: 2 }, housing: 1, maintenance: 0, trainXpPct: 25, trainXpClasses: ['NAVAL_MELEE', 'NAVAL_RANGED'] },

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

  { id: 'HANGAR', name: 'Hangar', district: 'AERODROME', cost: 380, yields: { production: 2 }, maintenance: 1, airSlots: 1 },
  { id: 'AIRPORT', name: 'Airport', district: 'AERODROME', cost: 480, requiresAny: ['HANGAR'], yields: { production: 3 }, maintenance: 2, airSlots: 1 },

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
];

const list: BuildingDef[] = rawList.map((b) => ({ ...b, cost: Math.round(b.cost * GAME_SPEED) }));

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
