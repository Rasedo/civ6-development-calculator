/**
 * THE KNOWLEDGE BASE'S RECORDS (CivKnowledge.cpp; the reading is
 * tools/civ6lab/dll_readings.md "C-96: the knowledge base's army records"):
 * a unit of another player as a record holds it, the age its army strength
 * reads (0x5eadb0), and the camps' update and look.
 */

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

/** the age at most of a record the knowledge base's army strength reads
 *  (0x5eadb0 -> 0x5ef760 with 2, at every caller: the city's threat, the
 *  operations' targets and enemy strength, the city value) */
export const ARMY_READ_AGE = 2;

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
