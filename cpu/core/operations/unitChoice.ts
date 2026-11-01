/**
 * THE MILITARY AI'S UNIT CHOICE FOR A TEAM (AI/UnitProduction.cpp 0x79bd30,
 * its check 0x79cba0; `tools/civ6lab/dll_readings.md` "C-97: City Defense
 * and the assault target's validity"): over the military AI's unit
 * production table (+0x268, `unitProductionEntries`) the unit a team that
 * lacks a requirement asks to be built.
 */
import { AI_UNIT_AI_PRIORITY } from '../../data/aiOperations';
import type { UnitProductionRow } from '../aiUnitProduction';
import { stdSort } from '../stdSort';
import { hasAiType } from './operation';

/** The table as the military AI stores it: its entries (`rows`, the Units'
 *  order) stable-sorted (0x797980, std::stable_sort) under 0x79d3a0 — a
 *  buildable entry first, then the at-war sum, the sum over every player,
 *  the strength, each greater first. */
function storedTable(rows: readonly UnitProductionRow[]): UnitProductionRow[] {
  return [...rows].sort((a, b) => {
    if (a.buildable !== b.buildable) return a.buildable ? -1 : 1;
    if (a.atWar !== b.atWar) return b.atWar - a.atWar;
    if (a.all !== b.all) return b.all - a.all;
    return b.strength - a.strength;
  });
}

/** The order the choice walks: a copy of the stored table (`storedTable`)
 *  sorted by the game's std::sort (0x7976f0, `stdSort`) under the
 *  comparator 0x79d3e0 — a buildable entry (+0x0e) first; against a player,
 *  its per-player sum (+0x38) greater first; then the at-war sum (+0x2c),
 *  the sum over every player (+0x30), the strength (+0x18). Equals land
 *  where the unstable sort puts them. */
export function choiceOrder(rows: readonly UnitProductionRow[], player: number): UnitProductionRow[] {
  return stdSort(storedTable(rows), (a, b) => {
    if (a.buildable !== b.buildable) return a.buildable;
    if (player >= 0) {
      const pa = a.perPlayer.get(player) ?? 0;
      const pb = b.perPlayer.get(player) ?? 0;
      if (pa !== pb) return pa > pb;
    }
    if (a.atWar !== b.atWar) return a.atWar > b.atWar;
    if (a.all !== b.all) return a.all > b.all;
    return a.strength > b.strength;
  });
}

/** an entry the choice may take: standing (+0x0e set, +0x08 clear), of an
 *  AI type `need` asks and none `full` bars; `priority` where a type it
 *  matched is a UnitAiTypes Priority one (its row's +0x30 and +0x31) */
function fits(e: UnitProductionRow, need: readonly string[], full: readonly string[]): { ok: boolean; priority: boolean } {
  if (!e.buildable || e.obsolete) return { ok: false, priority: false };
  let matched = false;
  let priority = false;
  for (const t of need) {
    if (!hasAiType(e.unit, t)) continue;
    matched = true;
    if (AI_UNIT_AI_PRIORITY.includes(t)) priority = true;
  }
  if (!matched || full.some((t) => hasAiType(e.unit, t))) return { ok: false, priority: false };
  // the maintenance resource's test (0x79c277): the player's turn income of
  // it (Player_Resources +0x350) above its units' fuel bill (0x4ab270)
  if (!e.maintained) return { ok: false, priority: false };
  return { ok: true, priority };
}

/** 0x79bd30: in the order above against `player`, the first entry that
 *  fits; a later one replaces it where it is a priority one and the chosen
 *  is not, or, neither turning priority off, where both its at-war sum and
 *  its sum over every player pass the chosen's; an entry with a maintenance
 *  resource only where the player's income of it passes its units' bill.
 *  Null for none. */
export function chooseUnit(rows: readonly UnitProductionRow[], need: readonly string[], full: readonly string[], player: number): string | null {
  let chosen: UnitProductionRow | null = null;
  let chosenPriority = false;
  for (const e of choiceOrder(rows, player)) {
    const f = fits(e, need, full);
    if (!f.ok) continue;
    if (chosenPriority && !f.priority) continue;
    if (chosen && !(f.priority && !chosenPriority) && !(e.all > chosen.all && e.atWar > chosen.atWar)) continue;
    chosen = e;
    chosenPriority = f.priority;
  }
  return chosen?.unit ?? null;
}

/** 0x79cba0: the unit still one the choice could take */
export function keepUnit(rows: readonly UnitProductionRow[], unit: string, need: readonly string[], full: readonly string[]): boolean {
  const e = rows.find((r) => r.unit === unit);
  return !!e && fits(e, need, full).ok;
}
