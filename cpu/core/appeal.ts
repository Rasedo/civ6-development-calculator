/**
 * Tile appeal: natural wonders and greenery raise it, heavy industry and
 * jungle/marsh lower it. Drives Neighborhood housing, and the
 * Seaside Resort's gold and tourism.
 *
 * CIV6 (wiki "Appeal"): every term below is the real one. A tile that IS a
 * MOUNTAIN scores a flat 4 and a NATURAL WONDER a flat 5, both unaffected by
 * their neighbours; every other tile starts at 0, takes +1 for its own river
 * or lake, and then sums its neighbours: natural wonder +2, wonder / mountain
 * / woods / coast / lake / oasis +1, rainforest / marsh / floodplains / mine /
 * quarry / oil well / industrial zone / encampment / spaceport / pillaged -1.
 * The modifiers are cumulative.
 *
 * `camps` is the barbarian OUTPOST set (`campTiles`) — an outpost is stored on
 * the barbarian seat, not on its tile, so the one caller-supplied argument is
 * how the tile walk sees it. Omitting it drops the penalty, so every caller
 * passes it.
 *
 * Every DISTRICT term comes off `DistrictDef.appealAdjacent` and every
 * IMPROVEMENT term off `ImprovementDef.appealAdjacent`, so the walk never
 * names either type and a new row carries its own appeal.
 *
 * OPEN: the appeal-granting Great People.
 */

import type { GameMap, ImprovementId, Tile } from './types';
import { neighbors } from '../../world/hex';
import { isMountain } from '../../world/query';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';

import { GP_CITY_PERM } from '../data/greatPeople';
/** what the tile's OWNER CITY adds to it, for a caller that can reach the
 *  city list. Undefined when no city in the game carries the channel, which
 *  is the case in every game where no Great Engineer has spent that charge. */
export type GpAppeal = ((t: Tile) => number) | undefined;

export function tileAppeal(map: GameMap, tile: Tile, camps?: ReadonlySet<number>, gpAppeal?: GpAppeal): number {
  if (tile.wonder) return 5;
  if (isMountain(tile)) return 4;
  let appeal = gpAppeal?.(tile) ?? 0;
  if (tile.riverMask !== 0 || tile.terrain === 'LAKE') appeal += 1;
  for (const n of neighbors(map, tile)) {
    if (n.wonder) appeal += 2;
    if (n.builtWonder && n.builtWonderComplete) appeal += 1;
    if (n.feature === 'WOODS') appeal += 1;
    if (isMountain(n) && !n.wonder) appeal += 1;
    if (n.terrain === 'COAST' || n.terrain === 'LAKE') appeal += 1;
    if (n.feature === 'OASIS') appeal += 1;
    if (n.district) appeal += DISTRICTS[n.district].appealAdjacent;
    if (camps?.has(n.index)) appeal -= 1;
    if (n.feature === 'RAINFOREST' || n.feature === 'MARSH') appeal -= 1;
    if (n.feature === 'FLOODPLAINS') appeal -= 1; // sourced, was missing
    if (n.pillaged) appeal -= 1; // "-1 each adjacent pillaged tile"
    if (n.improvement) appeal += IMPROVEMENTS[n.improvement as ImprovementId].appealAdjacent ?? 0;
  }
  return appeal;
}

/** CIV6 (Alvar Aalto, Charles Correa): "This city provides +N Appeal to any
 *  tile it owns." One closure over the seats' cities, built once per walk. */
export function gpAppealResolver(state: {
  seats: { cities: { id: number; seat: number; gpPerm?: number[] }[] }[];
}): GpAppeal {
  const k = GP_CITY_PERM.indexOf('appeal');
  const by = new Map<number, number>();
  for (const s of state.seats) {
    for (const c of s.cities) {
      const n = c.gpPerm?.[k] ?? 0;
      if (n) by.set(c.seat * GP_APPEAL_SEAT_STRIDE + c.id, n);
    }
  }
  if (by.size === 0) return undefined;
  return (t: Tile) => (t.ownerCity < 0 ? 0 : by.get(t.ownerSeat * GP_APPEAL_SEAT_STRIDE + t.ownerCity) ?? 0);
}

/** the (seat, city id) key's stride — wider than any city id a seat can reach. */
const GP_APPEAL_SEAT_STRIDE = 1 << 20;

export interface AppealTier {
  name: string;
  housing: number;
}

/**
 * The Preserve's housing by appeal band. CIV6 publishes only "Grants up to 3
 * Housing based on tile's Appeal" and, on the strategy half, that a low-appeal
 * region "will rarely gain more than 1 Housing from it" — the per-band table
 * is on no page, so THIS BLOCK IS THIS MODEL'S OWN: the published ceiling at
 * Breathtaking, the published floor of about one at Average, and nothing below
 * Uninviting. Both engines read it from the wire.
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
