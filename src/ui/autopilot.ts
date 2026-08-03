/**
 * THE UI AUTOPILOT — #51 deletion 4 (owner directive 2026-08-03).
 *
 * These are the player-seat AUTO-POLICIES the UI runs between macro
 * decisions: builders self-assign, scouts explore, military units fight,
 * chase and garrison. They are UI PRODUCT BEHAVIOR, not engine rules —
 * moved here out of `core/rlenv.ts` so the engine/gate work never
 * references a scripted player policy again (the decision server drives
 * every gated seat; the UI will be revisited at a later date).
 *
 * Nothing under gpu/ or scripts/ may import this file.
 */
import type { GameState, Unit } from '../core/types';
import { isPlayerSeat, tileSeat } from '../core/seats';
import { orderMove, builderImprove, builderRepair, setExploreMission, unitsHostile } from '../core/units';
import { attackTargets, meleeAttack } from '../core/combat';
import { validImprovements } from '../core/rules';
import { hexDistance } from '../core/hex';
import { UNITS } from '../data/units';

function autoBuilder(state: GameState, unit: Unit): void {
  const tile = state.map.tiles[unit.tileIndex];
  if (tile.pillaged && isPlayerSeat(tileSeat(tile))) {
    builderRepair(state, unit.id);
    return;
  }
  const options = validImprovements(state, tile);
  if (options.length > 0 && !tile.improvement && isPlayerSeat(tileSeat(tile))) {
    builderImprove(state, unit.id, options[0]);
    return;
  }
  if (unit.path) return;
  // Head to the nearest ownable job: pillaged tile first, then unimproved.
  let best: number | null = null;
  let bestDist = 99;
  for (const t of state.map.tiles) {
    if (!isPlayerSeat(tileSeat(t))) continue;
    const job = (t.pillaged || (!t.improvement && validImprovements(state, t).length > 0));
    if (!job) continue;
    const d = hexDistance(tile.col, tile.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      best = t.index;
    }
  }
  if (best !== null && best !== unit.tileIndex) orderMove(state, unit.id, best);
}

function autoMilitary(state: GameState, unit: Unit): void {
  // Fight anything in reach.
  const targets = attackTargets(state, unit);
  if (targets.length > 0) {
    meleeAttack(state, unit.id, targets[0]);
    return;
  }
  if (unit.path) return;
  const here = state.map.tiles[unit.tileIndex];
  // Chase hostiles (barbarians, at-war rivals) threatening the empire.
  let prey: number | null = null;
  let preyDist = 8;
  for (const b of state.units) {
    if (!unitsHostile(state, unit, b)) continue;
    const bt = state.map.tiles[b.tileIndex];
    const nearEmpire = state.cities.some((c) => {
      const ct = state.map.tiles[c.centerIndex];
      return hexDistance(bt.col, bt.row, ct.col, ct.row) <= 6;
    });
    if (!nearEmpire) continue;
    const d = hexDistance(here.col, here.row, bt.col, bt.row);
    if (d < preyDist) {
      preyDist = d;
      prey = b.tileIndex;
    }
  }
  if (prey !== null) {
    // Move adjacent to the prey (its tile itself is enemy-blocked).
    const pt = state.map.tiles[prey];
    const spot = state.map.tiles
      .filter((t) => hexDistance(t.col, t.row, pt.col, pt.row) === 1)
      .sort((a, b) => hexDistance(a.col, a.row, here.col, here.row) - hexDistance(b.col, b.row, here.col, here.row))[0];
    if (spot) orderMove(state, unit.id, spot.index);
    return;
  }
  // Otherwise garrison the nearest city.
  const home = state.cities
    .map((c) => c.centerIndex)
    .sort((a, b) => {
      const ta = state.map.tiles[a];
      const tb = state.map.tiles[b];
      return hexDistance(ta.col, ta.row, here.col, here.row) - hexDistance(tb.col, tb.row, here.col, here.row);
    })[0];
  if (home !== undefined && home !== unit.tileIndex) orderMove(state, unit.id, home);
}

export function playerAutoPhase(state: GameState): void {
  if (!state.unitsMode) return;
  for (const unit of [...state.units]) {
    if (!isPlayerSeat(unit.seat) || unit.movesLeft <= 0) continue;
    if (!state.units.includes(unit)) continue; // died mid-phase
    const def = UNITS[unit.type];
    if (def?.charges !== undefined) {
      autoBuilder(state, unit);
    } else if (unit.type === 'SCOUT' && state.fogOfWar) {
      if (unit.mission !== 'explore') setExploreMission(state, unit.id, true);
    } else if ((def?.combat ?? 0) > 0) {
      autoMilitary(state, unit);
    }
  }
}
