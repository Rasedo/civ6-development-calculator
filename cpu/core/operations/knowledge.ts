/**
 * THE MAJOR'S KNOWLEDGE BASE'S ARMY RECORDS (CivKnowledge.cpp at player
 * +0x12b8; the reading is tools/civ6lab/dll_readings.md "C-96: the knowledge
 * base's army records"): one record per unit of another player the seat has
 * seen — its owner, type, strengths, damage and the plot it was last seen on
 * — refreshed at each look (0x7877e0: every unit the seat sees now) and
 * dropped once its age passes ARMY_RECORD_AGE (0x5ebb30). The operations
 * read the strength of a player's known army about a plot from them
 * (0x5eadb0).
 */
import { ARMY_RECORD_AGE } from '../tactical';
import type { MajorView } from '../../../ai/major/view';

/** a unit as the knowledge base holds it */
export interface KnownUnit {
  id: number;
  owner: number;
  type: string;
  plot: number;
  combat: number;
  ranged: number;
  damage: number;
  /** the turn it was last seen */
  seen: number;
}

/** the seat's records, by unit id */
export type ArmyRecords = Map<number, KnownUnit>;

/** the ageing and the look (0x5ebb30, 0x7877e0): records past their age
 *  dropped, then every unit of another player the seat sees recorded where it
 *  stands */
export function lookArmy(records: ArmyRecords, view: MajorView, seat: number, turn: number): void {
  for (const [id, r] of records) if (turn - r.seen > ARMY_RECORD_AGE) records.delete(id);
  for (const p of view.players()) {
    if (p === seat) continue;
    for (const u of view.knownUnits(seat, p)) {
      records.set(u.id, { id: u.id, owner: p, type: u.type, plot: u.plot, combat: u.combat, ranged: u.ranged, damage: u.damage, seen: turn });
    }
  }
}

/** the units the knowledge base holds of a player, in record order */
export const knownArmy = (records: ArmyRecords, player: number): KnownUnit[] => [...records.values()].filter((r) => r.owner === player);

/** the age at most of a record the knowledge base's army strength reads
 *  (0x5eadb0 -> 0x5ef760 with 2, at every caller: the city's threat, the
 *  operations' targets and enemy strength, the city value) */
export const ARMY_READ_AGE = 2;

/** the units of a player the army strength reads: those of age at most
 *  ARMY_READ_AGE, their age `aged` (the turn the records last aged) less
 *  the turn last seen; with no ageing yet, all (of age 0) */
export const recentArmy = (records: ArmyRecords, player: number, aged: number | null): KnownUnit[] =>
  knownArmy(records, player).filter((r) => aged === null || aged - r.seen <= ARMY_READ_AGE);

/** the knowledge base's camps (m_barbarians +0x638, in their order): its
 *  update drops a camp whose plot the seat sees or has revealed with none
 *  there (0x5ebb30), its look adds each camp on a plot it sees or has
 *  revealed (0x7877e0 -> 0x5f0110: visibility +0x290 above 0, else the
 *  revealed byte +0x2f0), in plot order; `seen` names those plots */
export function lookCamps(known: readonly number[], seen: (plot: number) => boolean, camps: Iterable<number>): number[] {
  const now = new Set(camps);
  const out = known.filter((p) => !seen(p) || now.has(p));
  for (const p of [...now].sort((a, b) => a - b)) if (seen(p) && !out.includes(p)) out.push(p);
  return out;
}
