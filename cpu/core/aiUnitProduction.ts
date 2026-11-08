/**
 * THE MILITARY AI'S UNIT PRODUCTION TABLE (GameCore_XP2 AI/UnitProduction.cpp
 * 0x7989e0; `tools/civ6lab/dll_readings.md` "C-96 / C-97: the unit value").
 * Once a turn, before its cities' analyses, the player's military AI values
 * each unit it may build against the units its knowledge base has seen:
 *
 *  - its entries, in the Units' database order: each unit that is the
 *    player's own version of itself, and, where the unit is obsolete to the
 *    player (its ObsoleteTech / ObsoleteCivic or their Mandatory columns
 *    held, 0x538460), only while the player still holds one; a unit not
 *    yet trainable (its PrereqTech or PrereqCivic unheld, 0x4cb590 /
 *    0x39d490) only where player signal +0x168 answers for it (0x798c26):
 *    its one listener, the research AI's 0x75d3d0, where
 *    m_turnsToResearchUnit is not 0 for it (`researchListed`);
 *  - the opposition: per unit type of Combat above 0 that is not obsolete to
 *    the player and whose PseudoYieldType is none or a combat one, the count
 *    the knowledge base holds of it over every player (0x5eb650) — N in all;
 *  - per entry the sum of each such count times the efficiency of the entry
 *    against that type (`unitEfficiency`, row the opposing type);
 *  - the entry's value N over that sum, x1.25 for a civilization's unique
 *    unit (TraitType); where N is 0 (0x7997bd..0x799924) N reads 1 and
 *    every entry's sums over every player (+0x30) and over those at war
 *    (+0x2c) and its per-player sums (the 64 players) 1.0, its value 1.0;
 *  - the entry's maintenance resource and amount are Units_XP2's row at the
 *    unit's Units index (0x28a940 on the Units index; none past the table's
 *    count: `tableMaintenanceResource`), so the Field Cannon carries the
 *    Rocket Artillery's Oil 1 and the Infantry none. Where the player's turn
 *    income of that resource less its units' fuel bill of it falls below
 *    the amount, the value is divided by the amount less that surplus when
 *    the divisor is above 1.
 *
 * The city build AI's unit value reads it (0x79ca90: 0 for a unit the table
 * lacks) and 0x79d2d0 (the entry's obsolete flag); the operations' unit
 * choice (0x79bd30) its entries (`unitProductionEntries`): beside the value,
 * the sums of the at-war players' counts (+0x2c) and of each player's (the
 * per-player vector +0x38), the sum over every player (+0x30), the entry
 * buildable (+0x0e: its PrereqTech and PrereqCivic held, its
 * StrategicResource owned), its strength (+0x18: max(Combat,
 * RangedCombat)) and its maintenance resource (+0x24).
 */
import { AI_UNITS } from '../data/aiBuildTables';
import { engineId } from '../data/aliases';
import { TECHS } from '../data/techs';
import { unitEfficiency } from './aiUnitEfficiency';
import { FX, fdiv, fmul, fxConst } from './aiValue';

/** what the table reads of its player */
export interface UnitProductionFacts {
  /** the unit is the player's own version of itself (player +0x12e8 +0x1c0) */
  isVersion(unit: string): boolean;
  /** the unit is obsolete to the player (0x538460) */
  obsolete(unit: string): boolean;
  /** the unit trainable or the research AI's listener answering for it
   *  (`researchListed`) */
  listed(unit: string): boolean;
  /** the player's units of the type (0x4f2c90) */
  owned(unit: string): number;
  /** the knowledge base's count of the unit type over every player (the
   *  per-player counts 0x5eb650 reads, AI_Knowledge.csv's ARMY lines) */
  known(unit: string): number;
  /** the same per player, with the players of the game's list (+0x4a0) and
   *  those at war with the player (0x469cd0); absent, none */
  knownBy?(unit: string, player: number): number;
  players?: readonly number[];
  atWar?(player: number): boolean;
  /** the unit's PrereqTech and PrereqCivic held and its StrategicResource
   *  stocked (0x4aa790) */
  buildable?(unit: string): boolean;
  /** the player's turn income of an install strategic resource (Player_Resources
   *  +0x350) less its units' fuel bill of it (0x4ab270, `strategicSurplus`) */
  surplus(resource: string): number;
}

export interface UnitProductionEntry {
  value: number;
  obsolete: boolean;
}

/** one entry of the table as the operations' unit choice reads it */
export interface UnitProductionRow extends UnitProductionEntry {
  unit: string;
  buildable: boolean;
  /** the sums over the at-war players (+0x2c) and over every player (+0x30),
   *  24.8, and per player (+0x38) */
  atWar: number;
  all: number;
  perPlayer(player: number): number;
  /** max(Combat, RangedCombat) (+0x18) */
  strength: number;
  /** its maintenance resource (+0x24: Units_XP2's row at its Units index), null for none */
  maintenance: string | null;
  /** the player's turn income of that resource (Player_Resources +0x350)
   *  above its units' fuel bill of it (+0x12e8 +0x1168, 0x4ab270): the unit
   *  choice's maintenance test; true for none */
  maintained: boolean;
}

const COMBAT_PSEUDO = new Set(['PSEUDOYIELD_UNIT_COMBAT', 'PSEUDOYIELD_UNIT_NAVAL_COMBAT', 'PSEUDOYIELD_UNIT_AIR_COMBAT']);
const UNIQUE = fxConst(1.25);

const AI_UNIT_ROW = new Map(AI_UNITS.map((u, i) => [u.type, i]));

/** 0x798b65..0x798c4c: the install unit `unit` stands in the table where
 *  its PrereqTech and PrereqCivic are held (`holds`: 0x4cb590 / 0x39d490,
 *  none counting as held), else where the research AI's listener 0x75d3d0
 *  answers — its m_turnsToResearchUnit at the unit, the turns its end of
 *  turn kept on the unit's PrereqTech (`ResearchState.researchTurns`, by
 *  engine technology), not 0: a unit with no PrereqTech, or locked by its
 *  civic alone, never answers */
export function researchListed(holds: (x: string) => boolean, turns: Readonly<Record<string, number>> | undefined, unit: string): boolean {
  const u = AI_UNITS[AI_UNIT_ROW.get(unit) ?? -1];
  if (!u) return false;
  if ((!u.tech || holds(u.tech)) && (!u.civic || holds(u.civic))) return true;
  const tech = u.tech ? engineId('tech', u.tech, 'TECH_', TECHS) : null;
  return !!tech && (turns?.[tech] ?? 0) !== 0;
}

/** the table's listing test for a seat of research `r`: a city-state's and
 *  the Free Cities' through their research AI (`researchListed`); a major's
 *  research AI is not run in the engine, its listener read as answering for
 *  every unit */
export function seatListed(r: { researchTurns?: Readonly<Record<string, number>> }, holds: (x: string) => boolean,
                           major: boolean): (unit: string) => boolean {
  return major ? () => true : (u) => researchListed(holds, r.researchTurns, u);
}

/** 0x7989e0: the table, by unit type */
export function unitProductionTable(f: UnitProductionFacts): Map<string, UnitProductionEntry> {
  return new Map(unitProductionEntries(f).map((e) => [e.unit, { value: e.value, obsolete: e.obsolete }]));
}

/** 0x7989e0: the table's entries in the Units' database order */
export function unitProductionEntries(f: UnitProductionFacts): UnitProductionRow[] {
  const entries: number[] = [];
  AI_UNITS.forEach((u, k) => {
    if (!f.isVersion(u.type)) return;
    if (f.obsolete(u.type) && f.owned(u.type) <= 0) return;
    if (!f.listed(u.type)) return;
    entries.push(k);
  });
  const sums = new Map<number, number>(entries.map((k) => [k, 0]));
  const all = new Map<number, number>(entries.map((k) => [k, 0]));
  const atWar = new Map<number, number>(entries.map((k) => [k, 0]));
  const perPlayer = new Map<number, Map<number, number>>(entries.map((k) => [k, new Map()]));
  const players = f.players ?? [];
  const eff = unitEfficiency();
  let total = 0;
  AI_UNITS.forEach((u, i) => {
    if (u.combat === 0 || f.obsolete(u.type)) return;
    if (u.pseudo && !COMBAT_PSEUDO.has(u.pseudo)) return;
    const n = f.known(u.type);
    if (n <= 0) return;
    total += n;
    let w = 0;
    for (const p of players) if (f.atWar?.(p)) w += f.knownBy?.(u.type, p) ?? 0;
    for (const k of entries) {
      sums.set(k, sums.get(k)! + eff[i][k] * n);
      // the choice's sums read the table's other way (the entry's row
      // against the opposing unit's column): AI_Operation.csv's "Contract
      // for" names the Warrior Monk against Warriors and Spearmen, the
      // strongest; the value's way names the Scout
      const e = eff[k][i];
      all.set(k, all.get(k)! + e * n);
      atWar.set(k, atWar.get(k)! + e * w);
      const per = perPlayer.get(k)!;
      for (const p of players) {
        const c = f.knownBy?.(u.type, p) ?? 0;
        if (c > 0) per.set(p, (per.get(p) ?? 0) + e * c);
      }
    }
  });
  if (total === 0) {
    for (const k of entries) {
      all.set(k, FX);
      atWar.set(k, FX);
    }
  }
  return entries.map((k) => {
    const per = perPlayer.get(k)!;
    const u = AI_UNITS[k];
    let v = total === 0 ? FX : sums.get(k)! > 0 ? fdiv(total * FX, sums.get(k)!) : 0;
    if (u.trait) v = fmul(v, UNIQUE);
    const res = u.tableMaintenanceResource;
    const surplus = res ? f.surplus(res) : 0;
    if (res && surplus < u.tableMaintenanceAmount) {
      const d = (u.tableMaintenanceAmount - surplus) * FX;
      if (d > FX) v = fdiv(v, d);
    }
    return {
      unit: u.type, value: v, obsolete: f.obsolete(u.type), buildable: f.buildable?.(u.type) ?? false,
      atWar: atWar.get(k)!, all: all.get(k)!, perPlayer: (p) => (total === 0 ? FX : per.get(p) ?? 0),
      strength: Math.max(u.combat, u.rangedCombat),
      maintenance: res,
      maintained: !res || surplus > 0,
    };
  });
}
