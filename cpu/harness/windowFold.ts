/**
 * WHAT A `--from` WINDOW TAKES FROM THE RECORDS BEFORE IT, beside the import's
 * history (`advanceHistory`): the barbarians' tribes (`TribeFold`), which no
 * record holds and a run from the first record builds turn by turn. The fold
 * observes every record before the window and the window's first, in order,
 * then answers the state the window opens on.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { BarbTribe, GameState } from '../core/types';
import { BARB_SEAT } from '../core/seats';
import { BARB_MAX_SCOUTS, BARB_NAMES_PER_KIND, BARB_TAG_UNITS, BARB_TRIBES, BARB_BOLD_KILL, BARB_BOLD_SCOUT_LOST,
  BARB_BOLD_TURN, BARB_BOLD_UNIT_LOST, BARB_PILLAGE_SCORE, BARB_SCOUT_WAIT, type BarbTribeKind } from '../data/barbarians';
import { unitDomain } from '../core/units';
import { engineRowOf, type Imported } from './import';
import type { Catalog, TurnRecord } from './record';
import type { Decision } from './replayActions';

/** a camp's rise in Barbarians.csv: its turn, its tribe's kind and name, its
 *  defender's unit, its plot */
interface Rise { turn: number; kind: BarbTribeKind; name: number; defender: string; x: number; y: number }
/** a unit a tribe raised (Barbarians_Units.csv): its turn, the tribe's index
 *  among the rises, the unit */
interface Raised { turn: number; tribe: number; type: string }

/** the rows of the log's last game (a header line opens each) */
function lastGame(path: string): string[][] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const start = lines.reduce((at, l, i) => (l.startsWith('Turn,') ? i : at), -1);
  return lines.slice(start + 1).filter(Boolean).map((l) => l.split(',').map((x) => x.trim()));
}

/** a tribe being folded: the engine's tribe on record keys */
interface Folded { tribe: Omit<BarbTribe, 'units' | 'scouts' | 'defender' | 'fresh'>; units: string[]; scouts: string[]; defender?: string; fresh: string[] }

/**
 * THE BARBARIANS' TRIBES a run from the first record holds (`BarbTribe`),
 * from the game's own barbarian logs: each camp's rise (Barbarians.csv —
 * the tribe's kind, its BarbarianTribeNames row, its plot; the tribe's index
 * its order) and each unit a tribe raised (Barbarians_Units.csv — its tribe,
 * its unit), the log's turn T in record T+1. A rise's first unit of its
 * defender's type is the camp's defender; a raise is a scout where its
 * kind's scout class holds it and the tribe's turn reached its scout's
 * (`tribeTurn`'s clocks run over the turns, each logged raise striking
 * them), else one of its units, counted where its kind's melee or ranged
 * class holds it and the tribe's own interval struck (one off it is its
 * operation's, uncounted). The record's kills (`kill`) move the boldness and
 * the counts as `barbBattleDeath` does, its pillages (`pillage`) the raid
 * score as `barbPillageScore` does, an upgrade (`upgrade`) puts its new unit
 * in the old one's place; a camp a record no longer holds is dead, taken
 * before the barbarians' turn, rampaging against the player whose unit
 * stands on it. Each raise is the record's new barbarian unit of its type,
 * in the units' serial order. Not folded: the tribes' operations, their
 * raid and assault targets, their scouts' reports (`op`, `every`, `queue`,
 * `raidTargets`, `assaultTargets`, `homing`, `saw`).
 */
export class TribeFold {
  private readonly rises: Rise[] = [];
  private readonly raised = new Map<number, Raised[]>();
  private readonly tribes: Folded[] = [];
  private known = new Set<string>();
  private lastTurn = 0;

  constructor(dumpPath: string, private readonly W: number) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    for (const r of lastGame(`${logs}Barbarians.csv`)) {
      const m = /^LOC_BARBARIAN_(NAVAL|CAVALRY|MELEE)_(\d+)$/.exec(r[1] ?? '');
      const xy = /^(\d+)-(\d+)$/.exec(r[3] ?? '');
      if (!m || !xy) continue;
      this.rises.push({ turn: Number(r[0]), kind: m[1] as BarbTribeKind, name: Number(m[2]) - 1,
        defender: r[2].replace(/^UNIT_/, ''), x: Number(xy[1]), y: Number(xy[2]) });
    }
    for (const r of lastGame(`${logs}Barbarians_Units.csv`)) {
      const m = /^LOC_UNIT_(.+)_NAME$/.exec(r[2] ?? '');
      if (!m) continue;
      const t = Number(r[0]);
      (this.raised.get(t) ?? (this.raised.set(t, []), this.raised.get(t)!)).push({ turn: t, tribe: Number(r[1]), type: m[1] });
    }
  }

  /** the logs hold the barbarians' tribes */
  get logged(): boolean { return this.rises.length > 0; }

  /** record `rec` (the game's barbarian turns before it folded in), and the
   *  kills of the pair it opens (`decisions`, none for the window's first) */
  observe(rec: TurnRecord, imp: Imported, cat: Catalog, decisions: readonly Decision[]): void {
    const barb = imp.playerOfSeat.get(BARB_SEAT);
    const fresh = rec.units.filter((u) => u.owner === barb && !this.known.has(`${u.owner}:${u.id}`))
      .sort((a, b) => Math.floor(a.id / 65536) - Math.floor(b.id / 65536));
    const typeOf = new Map(fresh.map((u) => [`${u.owner}:${u.id}`, engineRowOf(cat, 'unit', u.type)] as const));
    const take = (type: string): string | undefined => {
      for (const [k, t] of typeOf) if (t === type) { typeOf.delete(k); return k; }
      return undefined;
    };
    // a camp the record no longer holds: taken in the turn before, ahead of
    // the barbarians' turn, its tribe dead, rampaging against the player
    // whose unit took it
    const camps = new Set(imp.state.barbSeat.camps);
    for (const f of this.tribes) {
      if (!f.tribe.alive || camps.has(f.tribe.plot)) continue;
      f.tribe.alive = false;
      const taker = rec.units.find((u) => u.y * this.W + u.x === f.tribe.plot && u.owner !== barb && imp.seatOfPlayer.has(u.owner));
      if (taker) f.tribe.rampage = imp.seatOfPlayer.get(taker.owner)!;
    }
    // the barbarians' turns the logs hold before this record
    for (let t = this.lastTurn + 1; t < rec.turn; t++) this.barbTurn(t, take);
    this.lastTurn = Math.max(this.lastTurn, rec.turn - 1);
    this.known = new Set(rec.units.filter((u) => u.owner === barb).map((u) => `${u.owner}:${u.id}`));
    for (const d of decisions) {
      // an upgrade's unit, a new id, stays its tribe's in the place it held
      if (d.kind === 'upgrade') {
        const f = this.tribeOf(d.unit);
        this.known.add(d.into);
        if (!f) continue;
        if (f.defender === d.unit) f.defender = d.into;
        for (const list of [f.units, f.scouts, f.fresh]) {
          const k = list.indexOf(d.unit);
          if (k >= 0) list[k] = d.into;
        }
      }
      if (d.kind === 'pillage') {
        const by = this.tribeOf(d.unit);
        if (by) by.tribe.score = (by.tribe.score ?? 0) + BARB_PILLAGE_SCORE;
      }
      if (d.kind !== 'kill') continue;
      const killer = this.tribeOf(d.killerUnit);
      const victim = this.tribeOf(d.victimUnit);
      if (d.player === barb && d.victim !== barb && killer) killer.tribe.boldness = (killer.tribe.boldness ?? 0) + BARB_BOLD_KILL;
      else if (d.victim === barb && d.player !== barb && d.killerType >= 0 && victim) {
        if (victim.scouts.includes(d.victimUnit)) {
          victim.tribe.boldness = (victim.tribe.boldness ?? 0) + BARB_BOLD_SCOUT_LOST;
          victim.tribe.scoutCount -= 1;
          victim.tribe.scoutTurns = 0;
        } else {
          victim.tribe.boldness = (victim.tribe.boldness ?? 0) + BARB_BOLD_UNIT_LOST;
          const type = engineRowOf(cat, 'unit', d.victimType);
          if (!type || unitDomain(type) !== 'support') victim.tribe.unitCount -= 1;
        }
      }
    }
  }

  private tribeOf(key: string): Folded | undefined {
    return this.tribes.find((f) => f.defender === key || f.units.includes(key) || f.scouts.includes(key));
  }

  /** the barbarians' turn `t`: each standing tribe's turn, then the camps
   *  that rose */
  private barbTurn(t: number, take: (type: string) => string | undefined): void {
    const rows = this.raised.get(t) ?? [];
    this.tribes.forEach((f, i) => {
      const tr = f.tribe;
      if (!tr.alive) return;
      const def = BARB_TRIBES.find((d) => d.kind === tr.kind)!;
      f.fresh = [];
      const mine = rows.filter((r) => r.tribe === i);
      // the clocks as `tribeTurn` runs them, a logged raise striking its own
      tr.spawnTurns += 1;
      const strike = tr.spawnTurns >= def.spawnEvery;
      const short = tr.scoutCount < BARB_MAX_SCOUTS;
      const scoutDue = !strike && short && tr.scoutTurns + 1 >= BARB_SCOUT_WAIT;
      let raisedUnit = false;
      let raisedScout = false;
      for (const r of mine) {
        const key = take(r.type);
        const scoutClass = BARB_TAG_UNITS[def.scoutTag].includes(r.type);
        const unitClass = [def.meleeTag, def.rangedTag].some((g) => BARB_TAG_UNITS[g].includes(r.type));
        if (scoutClass && !raisedScout && (!unitClass || (scoutDue && short))) {
          raisedScout = true;
          tr.scoutCount += 1;
          if (key) f.scouts.push(key);
        } else {
          // a raise off the tribe's own interval is its operation's, uncounted
          raisedUnit = true;
          if (unitClass && strike) tr.unitCount += 1;
          if (key) { f.units.push(key); f.fresh.push(key); }
        }
      }
      if (strike || raisedUnit) tr.spawnTurns = 0;
      else if (short) {
        tr.scoutTurns += 1;
        if (raisedScout || tr.scoutTurns >= BARB_SCOUT_WAIT) tr.scoutTurns = 0;
      }
      tr.boldness = (tr.boldness ?? 0) + BARB_BOLD_TURN;
    });
    // the camps that rose: the tribe takes its turn the turn it rises
    for (const rise of this.rises) {
      if (rise.turn !== t) continue;
      const index = this.tribes.length;
      const f: Folded = {
        tribe: { plot: rise.y * this.W + rise.x, alive: true, kind: rise.kind, name: Math.min(rise.name, BARB_NAMES_PER_KIND - 1),
          spawnTurns: 1, scoutTurns: 0, unitCount: 0, scoutCount: 0, boldness: BARB_BOLD_TURN },
        units: [], scouts: [], fresh: [],
      };
      const def = BARB_TRIBES.find((d) => d.kind === rise.kind)!;
      for (const r of rows.filter((x) => x.tribe === index)) {
        const key = take(r.type);
        if (!f.defender && r.type === rise.defender) f.defender = key ?? '';
        else if (BARB_TAG_UNITS[def.scoutTag].includes(r.type)) {
          f.tribe.scoutCount += 1;
          if (key) f.scouts.push(key);
        }
      }
      this.tribes.push(f);
    }
  }

  /** the folded tribes on the window's first state, each unit the engine
   *  unit `unitOf` names (one gone by then dropped) */
  seed(state: GameState, unitOf: (key: string) => number | undefined): void {
    const ids = (keys: readonly string[]) => keys.flatMap((k) => { const id = unitOf(k); return id === undefined ? [] : [id]; });
    state.barbTribes = this.tribes.map((f) => {
      const defender = f.defender === undefined ? undefined : unitOf(f.defender);
      const fresh = ids(f.fresh);
      return { ...f.tribe, units: ids(f.units), scouts: ids(f.scouts), ...(defender !== undefined ? { defender } : {}), ...(fresh.length ? { fresh } : {}) };
    });
  }
}
