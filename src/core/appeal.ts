/**
 * Tile appeal (eyeballed Civ 6): natural wonders and greenery raise it,
 * heavy industry and jungle/marsh lower it. Drives Neighborhood housing.
 */

import type { GameMap, Tile } from './types';
import { neighbors } from './hex';
import { isMountain } from './query';

export function tileAppeal(map: GameMap, tile: Tile): number {
  let appeal = 0;
  for (const n of neighbors(map, tile)) {
    if (n.wonder) appeal += 2;
    if (n.builtWonder && n.builtWonderComplete) appeal += 1;
    if (n.feature === 'WOODS') appeal += 1;
    if (isMountain(n) && !n.wonder) appeal += 1;
    if (n.terrain === 'COAST' || n.terrain === 'LAKE') appeal += 1;
    if (n.feature === 'RAINFOREST' || n.feature === 'MARSH') appeal -= 1;
    if (n.improvement === 'MINE' || n.improvement === 'QUARRY' || n.improvement === 'OIL_WELL') appeal -= 1;
    if (n.district === 'INDUSTRIAL_ZONE' || n.district === 'ENCAMPMENT') appeal -= 1;
  }
  return appeal;
}

export interface AppealTier {
  name: string;
  /** Housing a Neighborhood provides at this appeal. */
  housing: number;
}

export function appealTier(appeal: number): AppealTier {
  if (appeal >= 4) return { name: 'Breathtaking', housing: 6 };
  if (appeal >= 2) return { name: 'Charming', housing: 5 };
  if (appeal >= 0) return { name: 'Average', housing: 4 };
  if (appeal >= -2) return { name: 'Uninviting', housing: 3 };
  return { name: 'Disgusting', housing: 2 };
}
