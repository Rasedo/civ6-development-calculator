/**
 * Buildings (base game, available to every civ; no wonders, no walls).
 * P4/D-13: costs + yields verified against civfanatics.com/civ6/info/building
 * (2026-07-10) — the real cost ladder 60/65/80/105/135/175/225/265/355/405/525.
 * Maintenance: every building carries the VERIFIED base-game upkeep
 * (civ6bbg.github.io/en_US/buildings_base_game.html, 2026-07-10); the
 * cost-tier heuristic in city.ts survives only as a fallback for future
 * unverified additions. Worship buildings stay 0 (faith-purchased).
 */

import type { DistrictId, Yields } from '../core/types';
import { GAME_SPEED } from './constants';

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
  /** P4/D-13: explicit gold upkeep (real Civ 6) — overrides the cost-tier
   * heuristic in buildingMaintenance where the wiki value is verified. */
  maintenance?: number;
  /** B-17 (ROUND B7): flat combat XP a unit TRAINED or PURCHASED in this
   * city starts with (best tier over the city's Encampment military buildings
   * counts, not the sum — see MILITARY_TRAINING_XP / encampmentTrainXp). */
  trainXp?: number;
}

const rawList: BuildingDef[] = [
  // --- City Center ---------------------------------------------------------
  { id: 'PALACE', name: 'Palace', district: 'CITY_CENTER', cost: 0, yields: { production: 2, gold: 5, science: 2, culture: 1 }, housing: 1, amenities: 1, autoCapital: true },
  { id: 'MONUMENT', name: 'Monument', district: 'CITY_CENTER', cost: 60, yields: { culture: 2 }, maintenance: 0 },
  { id: 'GRANARY', name: 'Granary', district: 'CITY_CENTER', cost: 65, yields: { food: 1 }, housing: 2, maintenance: 0 },
  { id: 'WATER_MILL', name: 'Water Mill', district: 'CITY_CENTER', cost: 80, yields: { food: 1, production: 1 }, special: 'WATER_MILL', maintenance: 0 },
  { id: 'SEWER', name: 'Sewer', district: 'CITY_CENTER', cost: 405, housing: 2, maintenance: 2 },
  // AUDIT B-1: Ancient Walls — the one defensive tier this stage. A plain
  // CITY_CENTER building (no yields/housing, 0 upkeep) unlocked by MASONRY;
  // its game effect (a 100-HP outer-defense pool + the once-per-turn city
  // ranged strike) lives in combat.ts/rivals.ts, not in the yield pipeline.
  { id: 'ANCIENT_WALLS', name: 'Ancient Walls', district: 'CITY_CENTER', cost: 80, maintenance: 0 },

  // --- Campus ----------------------------------------------------------------
  { id: 'LIBRARY', name: 'Library', district: 'CAMPUS', cost: 80, yields: { science: 2 }, maintenance: 1 },
  { id: 'UNIVERSITY', name: 'University', district: 'CAMPUS', cost: 225, requiresAny: ['LIBRARY'], yields: { science: 4 }, housing: 1, maintenance: 2 },
  { id: 'RESEARCH_LAB', name: 'Research Lab', district: 'CAMPUS', cost: 525, requiresAny: ['UNIVERSITY'], yields: { science: 5 }, maintenance: 3 },

  // --- Holy Site -------------------------------------------------------------
  { id: 'SHRINE', name: 'Shrine', district: 'HOLY_SITE', cost: 65, yields: { faith: 2 }, maintenance: 1 },
  { id: 'TEMPLE', name: 'Temple', district: 'HOLY_SITE', cost: 105, requiresAny: ['SHRINE'], yields: { faith: 4 }, maintenance: 2 },
  // Worship buildings (one unlocked by founding a religion; player's pick)
  { id: 'CATHEDRAL', name: 'Cathedral', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, culture: 3 }, worship: true },
  { id: 'GURDWARA', name: 'Gurdwara', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, food: 2 }, worship: true },
  { id: 'MEETING_HOUSE', name: 'Meeting House', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3, production: 2 }, worship: true },
  { id: 'PAGODA', name: 'Pagoda', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, housing: 1, worship: true },
  { id: 'STUPA', name: 'Stupa', district: 'HOLY_SITE', cost: 190, requiresAny: ['TEMPLE'], yields: { faith: 3 }, amenities: 1, worship: true },

  // --- Theater Square ----------------------------------------------------------
  { id: 'AMPHITHEATER', name: 'Amphitheater', district: 'THEATER_SQUARE', cost: 135, yields: { culture: 2 }, maintenance: 1 },
  { id: 'MUSEUM', name: 'Museum', district: 'THEATER_SQUARE', cost: 265, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['ARCHAEOLOGICAL_MUSEUM'], yields: { culture: 2 }, maintenance: 2 },
  { id: 'BROADCAST_CENTER', name: 'Broadcast Center', district: 'THEATER_SQUARE', cost: 525, requiresAny: ['MUSEUM'], yields: { culture: 4 }, maintenance: 3 },
  // --- Commercial Hub ----------------------------------------------------------
  { id: 'MARKET', name: 'Market', district: 'COMMERCIAL_HUB', cost: 105, yields: { gold: 3 }, maintenance: 0 },
  { id: 'BANK', name: 'Bank', district: 'COMMERCIAL_HUB', cost: 265, requiresAny: ['MARKET'], yields: { gold: 5 }, maintenance: 0 },
  { id: 'STOCK_EXCHANGE', name: 'Stock Exchange', district: 'COMMERCIAL_HUB', cost: 355, requiresAny: ['BANK'], yields: { gold: 7 }, maintenance: 0 },

  // --- Harbor ------------------------------------------------------------------
  { id: 'LIGHTHOUSE', name: 'Lighthouse', district: 'HARBOR', cost: 105, yields: { food: 1, gold: 1 }, housing: 1, maintenance: 0 },
  { id: 'SHIPYARD', name: 'Shipyard', district: 'HARBOR', cost: 265, requiresAny: ['LIGHTHOUSE'], special: 'SHIPYARD', maintenance: 1 },
  { id: 'SEAPORT', name: 'Seaport', district: 'HARBOR', cost: 525, requiresAny: ['SHIPYARD'], yields: { food: 2, gold: 2 }, maintenance: 0 },

  // --- Industrial Zone -----------------------------------------------------------
  { id: 'WORKSHOP', name: 'Workshop', district: 'INDUSTRIAL_ZONE', cost: 175, yields: { production: 2 }, maintenance: 1 },
  { id: 'FACTORY', name: 'Factory', district: 'INDUSTRIAL_ZONE', cost: 355, requiresAny: ['WORKSHOP'], yields: { production: 3 }, regional: true, maintenance: 2 },
  { id: 'POWER_PLANT', name: 'Power Plant', district: 'INDUSTRIAL_ZONE', cost: 525, requiresAny: ['FACTORY'], yields: { production: 4 }, regional: true, maintenance: 3 },

  // --- Encampment ------------------------------------------------------------------
  // B-17 (ROUND B7) trainXp: units trained/purchased here start with this XP
  // (best tier counts, not sum — BARRACKS/STABLE 5, ARMORY 10, MIL_ACADEMY 15).
  { id: 'BARRACKS', name: 'Barracks', district: 'ENCAMPMENT', cost: 80, exclusiveWith: ['STABLE'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXp: 5 },
  { id: 'STABLE', name: 'Stable', district: 'ENCAMPMENT', cost: 105, exclusiveWith: ['BARRACKS'], yields: { production: 1 }, housing: 1, maintenance: 1, trainXp: 5 },
  { id: 'ARMORY', name: 'Armory', district: 'ENCAMPMENT', cost: 175, requiresAny: ['BARRACKS', 'STABLE'], yields: { production: 2 }, maintenance: 2, trainXp: 10 },
  { id: 'MILITARY_ACADEMY', name: 'Military Academy', district: 'ENCAMPMENT', cost: 355, requiresAny: ['ARMORY'], yields: { production: 3 }, housing: 1, maintenance: 2, trainXp: 15 },

  // --- Entertainment Complex ----------------------------------------------------------
  // #78 SOURCING SWEEP (2026-07-28): amenities 1 -> 2. The GS Civilopedia's
  // Arena entry reads "+1 Culture" and "+2 Amenities from entertainment"; the
  // culture was already right, the amenity count was not.
  { id: 'ARENA', name: 'Arena', district: 'ENTERTAINMENT_COMPLEX', cost: 135, amenities: 2, yields: { culture: 1 }, maintenance: 1 },
  { id: 'ZOO', name: 'Zoo', district: 'ENTERTAINMENT_COMPLEX', cost: 405, requiresAny: ['ARENA'], amenities: 1, regional: true, maintenance: 2 },
  // #78 SOURCING SWEEP (2026-07-28): amenities 2 (approximate) -> 1, the GS
  // Civilopedia's base value ("+1 Amenity from entertainment"). The further
  // "+2 Amenities additionally when POWERED" is NOT modeled — no power system
  // exists in either engine — and is recorded as a residual rather than folded
  // into the base, which is what the old 2 effectively did.
  { id: 'STADIUM', name: 'Stadium', district: 'ENTERTAINMENT_COMPLEX', cost: 600, requiresAny: ['ZOO'], amenities: 1, regional: true, maintenance: 3 },

  // B-20 (#79) ARCHAEOLOGICAL MUSEUM — in real Civ 6 the Theater Square offers
  // the ART MUSEUM or the ARCHAEOLOGICAL MUSEUM as a choice; same district,
  // same cost, 3 ARTIFACT slots instead of 3 art slots. APPENDED LAST on
  // purpose: roster order IS the GPU's building index, so inserting it beside
  // the other Theater Square rows would renumber every downstream building in
  // both engines and in every exported fixture.
  { id: 'ARCHAEOLOGICAL_MUSEUM', name: 'Archaeological Museum', district: 'THEATER_SQUARE', cost: 265, requiresAny: ['AMPHITHEATER'], exclusiveWith: ['MUSEUM'], yields: { culture: 2 }, maintenance: 2 },
];

const list: BuildingDef[] = rawList.map((b) => ({ ...b, cost: Math.round(b.cost * GAME_SPEED) }));

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function buildingsForDistrict(district: DistrictId): BuildingDef[] {
  return list.filter((b) => b.district === district && !b.autoCapital);
}

/**
 * B9 (A-9): buildings held out of every SCRIPTED pick (rival queue, rival
 * gold purchase, exporter building table → the scripted player and the GPU)
 * while their support channel is still missing on one engine. The player UI
 * path (availableBuildings) is intentionally NOT gated. EMPTY since B9-R2
 * shipped the regional-effects channel; the plumbing stays for future
 * inert-first stages.
 */
export const SCRIPTED_HELD_BUILDINGS: ReadonlySet<string> = new Set();
