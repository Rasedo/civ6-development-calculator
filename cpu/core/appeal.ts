/**
 * Tile appeal: natural wonders and greenery raise it, heavy industry and
 * jungle/marsh lower it. Drives Neighborhood housing, and (since #71/#73) the
 * Seaside Resort's gold and tourism.
 *
 * SOURCING SWEEP, verified against the Civilization wiki's
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
import { neighbors } from '../../world/hex';
import { isMountain } from '../../world/query';

export function tileAppeal(map: GameMap, tile: Tile): number {
  // A NATURAL WONDER tile is a fixed 5 and a MOUNTAIN tile a fixed
  // 4, and NEITHER is affected by its neighbours — adjacency does not reach
  // them at all. (The Civilopedia's terser "+4 if the tile is on a Mountain"
  // reads as additive; that is the wrong reading. Only BLANKET AURAS —
  // Eiffel Tower, Golden Gate Bridge, Alvar Aalto, Charles Correa — modify
  // these, because they overwrite the tile's own property rather than sending
  // an adjacency signal. None of those are modelled here, so the values are
  // final; when one is added it must apply ON TOP of these, not through the
  // neighbour loop.)
  if (tile.wonder) return 5;
  if (isMountain(tile)) return 4;
  let appeal = 0;
  // "+1 if the tile is on a River or Lake" — ON-TILE, not adjacent.
  if (tile.riverMask !== 0 || tile.terrain === 'LAKE') appeal += 1;
  for (const n of neighbors(map, tile)) {
    if (n.wonder) appeal += 2;
    if (n.builtWonder && n.builtWonderComplete) appeal += 1;
    if (n.feature === 'WOODS') appeal += 1;
    if (isMountain(n) && !n.wonder) appeal += 1;
    if (n.terrain === 'COAST' || n.terrain === 'LAKE') appeal += 1;
    if (n.feature === 'OASIS') appeal += 1; // #78: sourced, was missing
    if (n.feature === 'RAINFOREST' || n.feature === 'MARSH') appeal -= 1;
    if (n.feature === 'FLOODPLAINS') appeal -= 1; // #78: sourced, was missing
    if (n.pillaged) appeal -= 1; // #78: "-1 each adjacent pillaged tile"
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
  // Real Civ 6 bands: Breathtaking >= 4, Charming 2..3, Average -1..1,
  // Uninviting -3..-2, Disgusting <= -4. The negative side matters —
  // term, because the tier drives Neighborhood HOUSING and housing feeds growth.
  if (appeal >= 4) return { name: 'Breathtaking', housing: 6 };
  if (appeal >= 2) return { name: 'Charming', housing: 5 };
  if (appeal >= -1) return { name: 'Average', housing: 4 };
  if (appeal >= -3) return { name: 'Uninviting', housing: 3 };
  return { name: 'Disgusting', housing: 2 };
}
