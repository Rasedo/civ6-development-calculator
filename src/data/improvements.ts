/**
 * Tile improvements. Stage 1 has no builders/units: improvements are placed
 * instantly and for free (like a builder with infinite charges), and no tech
 * gating is applied. Yields are base Civ 6 values (pre-tech-boost),
 * eyeballed where noted.
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
    yields: { gold: 2 }, // approximate
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
};
