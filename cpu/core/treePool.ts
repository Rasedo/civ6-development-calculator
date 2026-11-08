/**
 * THE TREE MANAGER'S POOL (manager +0x3a0, 0x7ff7b0 -> 0x7fef20) of a
 * non-major player: every behaviour tree's control the player runs — a
 * city-state's city trees, its operations' trees and its "Upgrade Units"
 * trees, the Free Cities' operations' trees, the barbarians' trees — takes
 * its slot here. A new control takes the slot its free list's head names
 * (the last freed), else the pool's next new slot; its id is the pool's next
 * generation over the slot (+0x28 += 0x10000, or'd with the slot). The used
 * list runs in slot order, the order the tick (0x7ffdd0) walks the trees
 * in, once per priority; the destroy loop after the walk (0x7cb2e0) frees
 * each ended tree's slot to the free list's head, in slot order.
 *
 * Slots 0 and 1 are every player's two standing controls, held for good
 * (no tree: the AI memory reader lists the trees alone), generation 2 a
 * control gone before the first tree; a city-state's slot 2 holds its
 * standing Simple City Tree from its founding (generation 3, 196610), so its
 * first other tree is generation 4 in slot 3 (runs/h1_duely1117, 1121, 1124,
 * 1127, 1128: every city-state's Simple City Tree 3:2, its next control 4:3;
 * every barbarians' first tree 3:2, 196610).
 */
import type { Seat } from './types';
import { isCityStateSeat } from './seats';

const TREE_SLOT = 0x10000;

/** a control id's slot in the pool */
export const treeSlot = (id: number): number => id % TREE_SLOT;

/** a control id's generation */
export const treeGen = (id: number): number => Math.floor(id / TREE_SLOT);

/** the slots the player's standing controls hold for good */
export const treeHeld = (seat: number): number => (isCityStateSeat(seat) ? 3 : 2);

/** the generation the player's first tree takes */
export const treeFirstGen = (seat: number): number => treeHeld(seat) + 1;

/** A NEW TREE of the player's pool (0x7fef20): its id */
export function newTreeId(seat: Seat): number {
  const gen = seat.opsNext ?? treeFirstGen(seat.seat);
  seat.opsNext = gen + 1;
  const free = (seat.treeFree ??= []);
  let slot = free.pop();
  if (slot === undefined) {
    slot = seat.treeSlots ?? treeHeld(seat.seat);
    seat.treeSlots = slot + 1;
  }
  return gen * TREE_SLOT + slot;
}

/** THE POOL'S DESTROY LOOP after the walk (0x7ffdd0 -> 0x7cb2e0): each slot
 *  past the standing controls' whose tree no longer runs (none of `live`'s
 *  ids) goes to the free list's head, in slot order (the last freed, the
 *  highest, taken first) */
export function freeEndedTrees(seat: Seat, live: Iterable<number>): void {
  const on = new Set([...live].map(treeSlot));
  const free = (seat.treeFree ??= []);
  for (let s = treeHeld(seat.seat); s < (seat.treeSlots ?? treeHeld(seat.seat)); s++) if (!on.has(s) && !free.includes(s)) free.push(s);
}
