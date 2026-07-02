/**
 * Buildings (base game, available to every civ; no wonders, no religion
 * worship buildings, no walls — nothing to defend against in stage 1).
 * Costs/yields are base Civ 6, eyeballed where noted. No gold maintenance
 * in stage 1.
 */

import type { DistrictId, Yields } from '../core/types';

export interface BuildingDef {
  id: string;
  name: string;
  district: DistrictId;
  cost: number;
  /** Requires any of these buildings to exist in the city. */
  requiresAny?: string[];
  /** Cannot coexist with these buildings. */
  exclusiveWith?: string[];
  yields?: Partial<Yields>;
  housing?: number;
  amenities?: number;
  /** Regional effects reach city centers within 6 tiles of the district. */
  regional?: boolean;
  /**
   * WATER_MILL: city center must touch a river.
   * SHIPYARD: production equal to the Harbor's gold adjacency bonus.
   */
  special?: 'WATER_MILL' | 'SHIPYARD';
  /** Granted automatically to the capital; never buildable. */
  autoCapital?: boolean;
  /** Worship building — only buildable if your religion selected it. */
  worship?: boolean;
}

const list: BuildingDef[] = [
  // --- City Center ---------------------------------------------------------
  { id: 'PALACE', name: 'Palace', district: 'CITY_CENTER', cost: 0, yields: { production: 2, gold: 5, science: 2, culture: 1 }, housing: 1, amenities: 1, autoCapital: true },
  { id: 'MONUMENT', name: 'Monument', district: 'CITY_CENTER', cost: 60, yields: { culture: 2 } },
  { id: 'GRANARY', name: 'Granary', district: 'CITY_CENTER', cost: 65, yields: { food: 1 }, housing: 2 },
  { id: 'WATER_MILL', name: 'Water Mill', district: 'CITY_CENTER', cost: 80, yields: { food: 1, production: 1 }, special: 'WATER_MILL' },
  { id: 'SEWER', name: 'Sewer', district: 'CITY_CENTER', cost: 200, housing: 2 },

  // --- Campus ----------------------------------------------------------------
  { id: 'LIBRARY', name: 'Library', district: 'CAMPUS', cost: 90, yields: { science: 2 } },
  { id: 'UNIVERSITY', name: 'University', district: 'CAMPUS', cost: 250, requiresAny: ['LIBRARY'], yields: { science: 4 }, housing: 1 },
  { id: 'RESEARCH_LAB', name: 'Research Lab', district: 'CAMPUS', cost: 580, requiresAny: ['UNIVERSITY'], yields: { science: 5 } },

  // --- Holy Site -------------------------------------------------------------
  { id: 'SHRINE', name: 'Shrine', district: 'HOLY_SITE', cost: 70, yields: { faith: 2 } },
  { id: 'TEMPLE', name: 'Temple', district: 'HOLY_SITE', cost: 120, requiresAny: ['SHRINE'], yields: { faith: 4 } },
  // Worship buildings (one unlocked by founding a religion; player's pick)
  { id: 'CATHEDRAL', name: 'Cathedral', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, culture: 3 }, worship: true },
  { id: 'GURDWARA', name: 'Gurdwara', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, food: 2 }, worship: true },
  { id: 'MEETING_HOUSE', name: 'Meeting House', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, production: 2 }, worship: true },
  { id: 'PAGODA', name: 'Pagoda', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, housing: 1, worship: true },
  { id: 'STUPA', name: 'Stupa', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, amenities: 1, worship: true },

  // --- Theater Square ----------------------------------------------------------
  { id: 'AMPHITHEATER', name: 'Amphitheater', district: 'THEATER_SQUARE', cost: 150, yields: { culture: 2 } },
  { id: 'MUSEUM', name: 'Museum', district: 'THEATER_SQUARE', cost: 290, requiresAny: ['AMPHITHEATER'], yields: { culture: 2 } },
  { id: 'BROADCAST_CENTER', name: 'Broadcast Center', district: 'THEATER_SQUARE', cost: 580, requiresAny: ['MUSEUM'], yields: { culture: 4 } },

  // --- Commercial Hub ----------------------------------------------------------
  { id: 'MARKET', name: 'Market', district: 'COMMERCIAL_HUB', cost: 120, yields: { gold: 3 } },
  { id: 'BANK', name: 'Bank', district: 'COMMERCIAL_HUB', cost: 290, requiresAny: ['MARKET'], yields: { gold: 5 } },
  { id: 'STOCK_EXCHANGE', name: 'Stock Exchange', district: 'COMMERCIAL_HUB', cost: 560, requiresAny: ['BANK'], yields: { gold: 7 } },

  // --- Harbor ------------------------------------------------------------------
  { id: 'LIGHTHOUSE', name: 'Lighthouse', district: 'HARBOR', cost: 120, yields: { food: 1, gold: 1 }, housing: 1 },
  { id: 'SHIPYARD', name: 'Shipyard', district: 'HARBOR', cost: 290, requiresAny: ['LIGHTHOUSE'], special: 'SHIPYARD' },
  { id: 'SEAPORT', name: 'Seaport', district: 'HARBOR', cost: 580, requiresAny: ['SHIPYARD'], yields: { food: 2, gold: 2 } },

  // --- Industrial Zone -----------------------------------------------------------
  { id: 'WORKSHOP', name: 'Workshop', district: 'INDUSTRIAL_ZONE', cost: 195, yields: { production: 2 } },
  { id: 'FACTORY', name: 'Factory', district: 'INDUSTRIAL_ZONE', cost: 330, requiresAny: ['WORKSHOP'], yields: { production: 3 }, regional: true },
  { id: 'POWER_PLANT', name: 'Power Plant', district: 'INDUSTRIAL_ZONE', cost: 580, requiresAny: ['FACTORY'], yields: { production: 4 }, regional: true },

  // --- Encampment ------------------------------------------------------------------
  { id: 'BARRACKS', name: 'Barracks', district: 'ENCAMPMENT', cost: 90, exclusiveWith: ['STABLE'], yields: { production: 1 }, housing: 1 },
  { id: 'STABLE', name: 'Stable', district: 'ENCAMPMENT', cost: 120, exclusiveWith: ['BARRACKS'], yields: { production: 1 }, housing: 1 },
  { id: 'ARMORY', name: 'Armory', district: 'ENCAMPMENT', cost: 195, requiresAny: ['BARRACKS', 'STABLE'], yields: { production: 2 } },
  { id: 'MILITARY_ACADEMY', name: 'Military Academy', district: 'ENCAMPMENT', cost: 390, requiresAny: ['ARMORY'], yields: { production: 3 }, housing: 1 },

  // --- Entertainment Complex ----------------------------------------------------------
  { id: 'ARENA', name: 'Arena', district: 'ENTERTAINMENT_COMPLEX', cost: 150, amenities: 1 },
  { id: 'ZOO', name: 'Zoo', district: 'ENTERTAINMENT_COMPLEX', cost: 290, requiresAny: ['ARENA'], amenities: 1, regional: true },
  { id: 'STADIUM', name: 'Stadium', district: 'ENTERTAINMENT_COMPLEX', cost: 580, requiresAny: ['ZOO'], amenities: 2, regional: true }, // amenity amount approximate
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function buildingsForDistrict(district: DistrictId): BuildingDef[] {
  return list.filter((b) => b.district === district && !b.autoCapital);
}
