/**
 * Tile improvements (9 total). In units mode a builder places these, spending
 * one of its finite charges, and only where research allows: validImprovementsIn
 * (src/core/rules.ts) gates each on unlocks.improvements plus the hillFarms civic
 * for hill farms. Sandbox mode is the exception — it bypasses all research gating.
 * Yields are base Civ 6 values (pre-tech-boost). #78 sourced every value in
 * this file against the Civilization wiki's GS improvement data; the CAMP gold
 * was the one error (2 -> 1). No `eyeballed`/`approximate` markers remain here.
 */

import type { ImprovementId, Yields } from '../core/types';

export interface ImprovementDef {
  id: ImprovementId;
  name: string;
  /** Two-letter code drawn on the map. */
  code: string;
  yields: Partial<Yields>;
  housing: number;
  /** Only buildable on a resource that lists this improvement. */
  resourceOnly: boolean;
  description: string;
}

/** B-27 (#71): the BREATHTAKING appeal bar a Seaside Resort needs (real Civ 6
 *  — the same >= 4 threshold `appealTier` calls Breathtaking). */
export const SEASIDE_RESORT_MIN_APPEAL = 4;

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
    // #78 SOURCING SWEEP (2026-07-28): was `gold: 2 // approximate`, and the
    // approximation was WRONG. Real Civ 6 (Gathering Storm) gives a Camp
    // +1 Gold and +0.5 Housing — verified against the Civilization wiki's
    // "Camp (Civ6)" page and its GS improvement-values module. Plantation
    // (+2 gold), Pasture (+1 production) and Quarry (+1 production) were
    // re-verified in the same pass and are correct as written.
    yields: { gold: 1 },
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
  // B-27 (#71): appended LAST (roster order = the GPU's improvement index).
  // Real Civ 6 (verified against the Civilopedia): requires RADIO, buildable
  // only on a FLAT COASTAL Grassland/Plains/Desert tile whose Appeal is
  // BREATHTAKING (>= 4), and it yields GOLD equal to that tile's Appeal —
  // a DYNAMIC yield, so `yields` here is empty and the gold is computed in
  // tileYields. The matching TOURISM (also = Appeal) is NOT modeled: tourism
  // does not exist in either engine yet (a recorded B-20 residual).
  SEASIDE_RESORT: {
    id: 'SEASIDE_RESORT',
    name: 'Seaside Resort',
    code: 'Sr',
    yields: {}, // dynamic: gold = tile appeal (see seasideResortGold)
    housing: 0,
    resourceOnly: false,
    description: 'Flat coastal grassland/plains/desert with Breathtaking appeal. Gold equal to the tile appeal.',
  },
};
