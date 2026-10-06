/**
 * Tile appeal: natural wonders and greenery raise it, heavy industry and
 * jungle/marsh lower it. Drives Neighborhood housing, and the
 * Seaside Resort's gold and tourism.
 *
 * CIV6 (GameCore_XP2 Rules_Appeal 0x513d70, its neighbour term 0x513780):
 * the plot starts at its owner city's own
 * term (`AppealOwners.flat`), and a NATURAL WONDER returns that + 5 — a water
 * one included —, any other WATER plot 0, a
 * MOUNTAIN that + 4. Any other plot takes +1 for its own river, -1 for its
 * own pillaged improvement and -1 for its own complete, pillaged district,
 * then sums its six neighbours, each lending:
 * - a wonder: `Districts.Appeal` of DISTRICT_WONDER once it is built;
 *   another district: its `Districts.Appeal` once COMPLETE, -1 more while
 *   pillaged — a district under construction lends nothing;
 * - its feature's `Features.Appeal`, its terrain's `Terrains.Appeal`
 *   (mountain, coast), its improvement's `Improvements.Appeal`, -1 while that
 *   improvement is pillaged, -1 for a barbarian outpost;
 * - what its OWN city adds (`AppealOwners.lend`: the feature appeal rows,
 *   the governor's unimproved-feature term).
 * Last, a plot under a feature its owner's civic adds (`Features.AddCivic`:
 * Woods with Conservation) scores +1 of its own.
 *
 * `camps` is the barbarian OUTPOST set (`campTiles`) — an outpost is stored on
 * the barbarian seat, not on its tile, so the one caller-supplied argument is
 * how the tile walk sees it. Omitting it drops the penalty, so every caller
 * passes it.
 */

import type { GameMap, ImprovementId, Tile } from './types';
import { neighbors } from '../../world/hex';
import { isMountain, isWater, naturalWonderAt } from '../../world/query';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { COAST_APPEAL, FEATURE_ADD_CIVIC, FEATURE_APPEAL, MOUNTAIN_APPEAL, WONDER_APPEAL } from '../data/appeal';

/** what the plots' OWNER CITIES add, built by `cityAppealResolver`. */
export interface AppealOwners {
  /** the owner city's term on its own plot (Alvar Aalto, Charles Correa, a
   *  National Park under Roosevelt Corollary) */
  flat(t: Tile): number;
  /** what a NEIGHBOUR lends through its own city: the feature appeal rows
   *  (Amazon) and its governor's unimproved-feature term (Forestry Management) */
  lend(n: Tile): number;
  /** does the plot's owner hold the civic that adds its feature? */
  addCivic(t: Tile): boolean;
}
export type GpAppeal = AppealOwners | undefined;

/** What neighbour `n` lends every plot beside it. */
function lent(n: Tile, camps?: ReadonlySet<number>, owners?: AppealOwners): number {
  let a = 0;
  if (n.builtWonder) {
    if (n.builtWonderComplete) a += WONDER_APPEAL;
  } else if (n.district && n.districtComplete) {
    a += DISTRICTS[n.district].appealAdjacent;
    if (n.district !== 'CITY_CENTER' && n.districtPillaged) a -= 1;
  }
  if (n.feature) a += FEATURE_APPEAL[n.feature] ?? 0;
  if (isMountain(n)) a += MOUNTAIN_APPEAL;
  if (n.terrain === 'COAST' || n.terrain === 'LAKE') a += COAST_APPEAL;
  if (n.improvement) {
    a += IMPROVEMENTS[n.improvement as ImprovementId].appealAdjacent ?? 0;
    if (n.pillaged) a -= 1;
  }
  if (camps?.has(n.index)) a -= 1;
  return a + (owners?.lend(n) ?? 0);
}

export function tileAppeal(map: GameMap, tile: Tile, camps?: ReadonlySet<number>, owners?: GpAppeal): number {
  const flat = owners?.flat(tile) ?? 0;
  if (naturalWonderAt(tile)) return flat + 5;
  if (isWater(tile)) return 0;
  if (isMountain(tile)) return flat + 4;
  let appeal = flat;
  if (tile.riverMask !== 0) appeal += 1;
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete && tile.districtPillaged) appeal -= 1;
  if (tile.improvement && tile.pillaged) appeal -= 1;
  for (const n of neighbors(map, tile)) appeal += lent(n, camps, owners);
  if (tile.feature && FEATURE_ADD_CIVIC[tile.feature] && owners?.addCivic(tile)) appeal += 1;
  return appeal;
}

interface AppealTier {
  name: string;
  housing: number;
}

/**
 * The Preserve's housing by appeal band: the district's `Housing` 1 plus its
 * `AppealHousingChanges` row, +2 / +1 / 0 / -1 / -1 from Breathtaking down
 * (`DLC/KublaiKhan_Vietnam/Data/KublaiKhan_Vietnam_Districts.xml`). Both
 * engines read it from the wire.
 */
export const PRESERVE_APPEAL_HOUSING = [3, 2, 1, 0, 0];

/** The band index `PRESERVE_APPEAL_HOUSING` is keyed by, and the Neighborhood
 *  housing ladder's own order: Breathtaking, Charming, Average, Uninviting,
 *  Disgusting. */
export function appealBand(appeal: number): number {
  if (appeal >= 4) return 0;
  if (appeal >= 2) return 1;
  if (appeal >= -1) return 2;
  if (appeal >= -3) return 3;
  return 4;
}

export function appealTier(appeal: number): AppealTier {
  // Real Civ 6 bands: Breathtaking >= 4, Charming 2..3, Average -1..1,
  // Uninviting -3..-2, Disgusting <= -4. The negative side matters —
  // term, because the tier drives Neighborhood HOUSING and housing feeds growth.
  if (appeal >= 4) return { name: 'Breathtaking', housing: 6 };
  if (appeal >= 2) return { name: 'Charming', housing: 5 };
  if (appeal >= -1) return { name: 'Average', housing: 4 };
  if (appeal >= -3) return { name: 'Uninviting', housing: 3 };
  return { name: 'Disgusting', housing: 2 };
}
