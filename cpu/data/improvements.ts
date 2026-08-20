/**
 * Tile improvements (9 total). In units mode a builder places these, spending
 * one of its finite charges, and only where research allows: validImprovementsIn
 * (src/core/rules.ts) gates each on unlocks.improvements plus the hillFarms civic
 * for hill farms. Sandbox mode is the exception — it bypasses all research gating.
 * Yields are base Civ 6 values (pre-tech-boost), every one sourced against the
 * Gathering Storm CIVILOPEDIA. No `eyeballed`/`approximate` markers remain.
 */

import type { ImprovementId, Yields } from '../core/types';

export interface ImprovementDef {
  id: ImprovementId;
  name: string;
  code: string;
  yields: Partial<Yields>;
  housing: number;
  resourceOnly: boolean;
  description: string;
}

/** the BREATHTAKING appeal bar a Seaside Resort needs (real Civ 6
 *  — the same >= 4 threshold `appealTier` calls Breathtaking). */
export const SEASIDE_RESORT_MIN_APPEAL = 4;
/** CIV6 (National Park): every tile in the cluster must be CHARMING or
 *  better, and `appealTier` puts Charming at 2. */
export const PARK_MIN_APPEAL = 2;
/** CIV6: a National Park gives "2 Amenities to the city that owns it and
 *  1 Amenity to the four closest cities in your empire". */
export const PARK_AMENITIES_OWNER = 2;
export const PARK_AMENITIES_NEAR = 1;
export const PARK_AMENITY_CITIES = 4;

export const IMPROVEMENTS: Record<ImprovementId, ImprovementDef> = {
  FARM: {
    id: 'FARM',
    name: 'Farm',
    code: 'Fa',
    yields: { food: 1 },
    housing: 0.5,
    resourceOnly: false,
    description: 'Flat grassland/plains (hills allowed — late-game tech assumed) or floodplains.',
  },
  MINE: {
    id: 'MINE',
    name: 'Mine',
    code: 'Mi',
    yields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    description: 'Hills, or any tile with a mineable resource.',
  },
  QUARRY: {
    id: 'QUARRY',
    name: 'Quarry',
    code: 'Qu',
    yields: { production: 1 },
    housing: 0,
    resourceOnly: true,
    description: 'Stone or marble.',
  },
  LUMBER_MILL: {
    id: 'LUMBER_MILL',
    name: 'Lumber Mill',
    code: 'Lu',
    yields: { production: 1 },
    housing: 0,
    resourceOnly: false,
    description: 'Woods.',
  },
  PASTURE: {
    id: 'PASTURE',
    name: 'Pasture',
    code: 'Pa',
    yields: { production: 1 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Cattle, sheep or horses.',
  },
  CAMP: {
    id: 'CAMP',
    name: 'Camp',
    code: 'Ca',
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Deer, furs, ivory or truffles.',
  },
  PLANTATION: {
    id: 'PLANTATION',
    name: 'Plantation',
    code: 'Pl',
    yields: { gold: 2 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Plantation luxuries (wine, silk, spices, ...).',
  },
  FISHING_BOATS: {
    id: 'FISHING_BOATS',
    name: 'Fishing Boats',
    code: 'Fb',
    yields: { food: 1 },
    housing: 0.5,
    resourceOnly: true,
    description: 'Sea resources (fish, crabs, pearls, whales).',
  },
  OIL_WELL: {
    id: 'OIL_WELL',
    name: 'Oil Well',
    code: 'Ow',
    yields: { production: 2 },
    housing: 0,
    resourceOnly: true,
    description: 'Oil.',
  },
  // Appended LAST (roster order = the GPU's improvement index).
  // Real Civ 6 (verified against the Civilopedia): requires RADIO, buildable
  // only on a FLAT COASTAL Grassland/Plains/Desert tile whose Appeal is
  // BREATHTAKING (>= 4), and it yields GOLD equal to that tile's Appeal —
  // a DYNAMIC yield, so `yields` here is empty and the gold is computed in
  // tileYields, and the matching TOURISM (also = Appeal) is paid by
  // `resortTourism` (core/city.ts).
  SEASIDE_RESORT: {
    id: 'SEASIDE_RESORT',
    name: 'Seaside Resort',
    code: 'Sr',
    yields: {}, // dynamic: gold = tile appeal (see seasideResortGold)
    housing: 0,
    resourceOnly: false,
    description: 'Flat coastal grassland/plains/desert with Breathtaking appeal. Gold equal to the tile appeal.',
  },
  FORT: {
    id: 'FORT',
    name: 'Fort',
    code: 'Ft',
    yields: {},
    housing: 0,
    resourceOnly: false,
    description: 'Military Engineer only. Occupying unit gets +4 defense strength and 2 turns of fortification.',
  },
};
