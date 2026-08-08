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
  /** Two-letter code drawn on the map. */
  code: string;
  yields: Partial<Yields>;
  housing: number;
  /** Only buildable on a resource that lists this improvement. */
  resourceOnly: boolean;
  description: string;
}

/** the BREATHTAKING appeal bar a Seaside Resort needs (real Civ 6
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
    // SOURCING SWEEP, CORRECTED TWICE. This value was
    // ORIGINALLY 2 with an "approximate" marker. Slice 1 changed it to 1 on
    // the strength of a web-SEARCH SUMMARY — and that was WRONG. The
    // Gathering Storm CIVILOPEDIA entry for the Camp reads "+2 Gold" and
    // "+0.5 Housing", so the original 2 was right all along and is restored.
    // The marker is cleared because the value is now sourced from the
    // Civilopedia itself rather than from a summary of search results.
    // NOT MODELED (recorded): the Camp also gains +1 Food and +1 Production
    // with the MERCANTILISM civic, and a further +2 Gold with SYNTHETIC
    // MATERIALS. This model pays the base yield only.
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
  // tileYields. The matching TOURISM (also = Appeal) is NOT modeled: tourism
  // does not exist in either engine yet (a recorded residual).
  SEASIDE_RESORT: {
    id: 'SEASIDE_RESORT',
    name: 'Seaside Resort',
    code: 'Sr',
    yields: {}, // dynamic: gold = tile appeal (see seasideResortGold)
    housing: 0,
    resourceOnly: false,
    description: 'Flat coastal grassland/plains/desert with Breathtaking appeal. Gold equal to the tile appeal.',
  },
  // The FORT, sourced from the Gathering Storm Civilopedia —
  // "Occupying unit receives +4 Defense Strength, and automatically gains 2
  // turns of fortification." Built by a MILITARY ENGINEER (never a Builder),
  // prerequisite tech Siege Tactics. It carries NO yields: its whole effect is
  // defensive, which is why it is the first improvement here whose value never
  // shows up in a city's yield sum.
  // NOT MODELLED, recorded rather than folded in: the "deals minor damage to
  // and depletes the movement of hostile units walking onto this tile" half —
  // neither engine has a tile-enters-damage hook, and inventing a number for it
  // would be exactly the guessed-constant failure this sweep exists to catch.
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
