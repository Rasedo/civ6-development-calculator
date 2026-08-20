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
 * OPEN: the rest of the real adjacency list — Dam, Canal, Water Park and
 * Preserve (no such district here), the unique improvements, and the
 * appeal-granting Great People — waits on systems this model does not have.
 */

import type { GameMap, Tile } from './types';
import { neighbors } from '../../world/hex';
import { isMountain } from '../../world/query';

export function tileAppeal(map: GameMap, tile: Tile, camps?: ReadonlySet<number>): number {
  if (tile.wonder) return 5;
  if (isMountain(tile)) return 4;
  let appeal = 0;
  if (tile.riverMask !== 0 || tile.terrain === 'LAKE') appeal += 1;
  for (const n of neighbors(map, tile)) {
    if (n.wonder) appeal += 2;
    if (n.builtWonder && n.builtWonderComplete) appeal += 1;
    if (n.feature === 'WOODS') appeal += 1;
    if (isMountain(n) && !n.wonder) appeal += 1;
    if (n.terrain === 'COAST' || n.terrain === 'LAKE') appeal += 1;
    if (n.feature === 'OASIS') appeal += 1;
    if (n.district === 'HOLY_SITE' || n.district === 'THEATER_SQUARE' || n.district === 'ENTERTAINMENT_COMPLEX') appeal += 1;
    if (camps?.has(n.index)) appeal -= 1;
    if (n.feature === 'RAINFOREST' || n.feature === 'MARSH') appeal -= 1;
    if (n.feature === 'FLOODPLAINS') appeal -= 1; // sourced, was missing
    if (n.pillaged) appeal -= 1; // "-1 each adjacent pillaged tile"
    if (n.improvement === 'MINE' || n.improvement === 'QUARRY' || n.improvement === 'OIL_WELL') appeal -= 1;
    if (n.district === 'INDUSTRIAL_ZONE' || n.district === 'ENCAMPMENT' || n.district === 'SPACEPORT') appeal -= 1;
  }
  return appeal;
}

export interface AppealTier {
  name: string;
  housing: number;
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
