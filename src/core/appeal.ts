/**
 * Tile appeal: natural wonders and greenery raise it, heavy industry and
 * jungle/marsh lower it. Drives Neighborhood housing, and (since #71/#73) the
 * Seaside Resort's gold and tourism.
 *
 * #78 SOURCING SWEEP (2026-07-28), verified against the Civilization wiki's
 * Appeal page. Every term below is CORRECT as written: an adjacent NATURAL
 * WONDER is +2, an adjacent MOUNTAIN / WOODS / COAST or LAKE is +1, and an
 * adjacent RAINFOREST, MARSH, MINE, QUARRY, OIL WELL, INDUSTRIAL ZONE or
 * ENCAMPMENT is -1. The modifiers are cumulative, as here.
 *
 * TWO SOURCED GAPS, recorded not fixed (each is an appeal change that moves
 * Neighborhood housing AND Seaside Resort yields, so it needs its own gated
 * round on both engines):
 *  1. An adjacent OASIS gives +1 in real Civ 6; this model has no oasis term.
 *     Adjacent RIVERS also give +1 — the model credits LAKE by terrain but not
 *     a river edge.
 *  2. A tile that IS a MOUNTAIN or a NATURAL WONDER is BREATHTAKING by default
 *     in real Civ 6, irrespective of its neighbours. This model scores every
 *     tile purely from adjacency, so such a tile only reaches Breathtaking if
 *     its own neighbours happen to add up.
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
