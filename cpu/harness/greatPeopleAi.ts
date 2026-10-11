/**
 * THE MAJORS' GREAT PEOPLE AI IN THE ACTION REPLAY (ai/major/greatPeople.ts):
 * at each AI turn's close, after the savings turn, every AI major's Gold
 * patronage, then its Faith patronage, lands through the engine's
 * patronage verb (`patronizeGreatPerson`, the record's `buy` kind 4 and
 * `buyFaith` kind 15); each is scored against the game's own of the pair:
 * a person `Game_GreatPeople.csv` grants the player at the turn whose class
 * held fewer points at record t, with the points the class earned across
 * the pair before, than the person's cost, the currency the purse that paid
 * the lacking points (Faith 150 + 10 a point, Gold 200 + 15: the drop
 * across the pair nearest the price; neither drop at its least price, none).
 * Beside it, the Faith patronage on the record's own purse: the record t's
 * Faith and the turn's Faith against each class's price from the log's
 * person of the class (its last "Added to Present Timeline" row) and the
 * record's points with the turn's (the points the class earned across the
 * pair before), the engine player's patronage discount (Oracle), a person
 * neither its points claim nor a second Prophet, and one the engine's
 * player could act on.
 */
import { existsSync, readFileSync } from 'node:fs';
import { faithPatronage, goldPatronage } from '../../ai/major/greatPeople';
import { AI_GREAT_PERSON_CLASSES } from '../../ai/major/tables';
import type { DiploActionMemory } from '../../ai/major/diploActions';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { patronizeGreatPerson } from '../core/greatPeople';
import { seatWonders } from '../core/wonders';
import type { GameState } from '../core/types';
import { GP_CLASSES } from '../data/greatPeople';
import { num, type Catalog, type TurnRecord } from './record';

interface Grant { player: number; cls: string; cost: number }

/** Game_GreatPeople.csv's "Granted to Player" rows by turn, and its "Added
 *  to Present Timeline" rows in order ([turn, class, cost]) */
function readGrants(path: string): { grants: Map<number, Grant[]>; added: [number, string, number][] } {
  const grants = new Map<number, Grant[]>();
  const added: [number, string, number][] = [];
  if (!existsSync(path)) return { grants, added };
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 7) continue;
    const t = Number(c[0]);
    if (c[1] === 'Added to Present Timeline') added.push([t, c[3], Number(c[5])]);
    if (c[1] !== 'Granted to Player') continue;
    const list = grants.get(t) ?? [];
    list.push({ player: Number(c[6]), cls: c[3], cost: Number(c[5]) });
    grants.set(t, list);
  }
  return { grants, added };
}

export interface GreatPeopleAiTally {
  /** the port's patronages, the game's, and those both made (the turn, the
   *  player, the class and the currency alike) */
  ours: number;
  game: number;
  equal: number;
  /** the Faith patronage on the record's purse: decided, and as the game's */
  onRecord: number;
  onRecordEqual: number;
  misses: string[];
}

export class GreatPeopleProbe {
  private readonly grants: Map<number, Grant[]>;
  private readonly added: [number, string, number][];
  /** each player's points at the last record t, per class */
  private readonly last = new Map<number, number[]>();
  readonly tally: GreatPeopleAiTally = { ours: 0, game: 0, equal: 0, onRecord: 0, onRecordEqual: 0, misses: [] };

  /** `seats`: the AI majors, seat -> player id */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>, private readonly cat: Catalog) {
    ({ grants: this.grants, added: this.added } = readGrants(dumpPath.replace(/\.jsonl$/, '.logs/Game_GreatPeople.csv')));
  }

  /** the game's patronages of the pair (`a` record t, `b` record t + 1) by
   *  player, `${class}:${currency}` */
  private gameOf(a: TurnRecord, b: TurnRecord): Map<number, string[]> {
    const out = new Map<number, string[]>();
    for (const g of this.grants.get(a.turn) ?? []) {
      const p0 = a.players.find((p) => p.id === g.player);
      const p1 = b.players.find((p) => p.id === g.player);
      const k = (this.cat.greatPersonClasses ?? []).indexOf(g.cls);
      if (!p0 || !p1 || k < 0 || !Array.isArray(p0.gpp)) continue;
      const prev = this.last.get(g.player);
      const rate = prev ? Math.max(0, num(p0.gpp[k]) - prev[k]) : 0;
      const lacked = g.cost - num(p0.gpp[k]) - rate;
      if (lacked <= 0.5) continue;
      const faith = num(p0.faith) + num(p0.faithYield) - num(p1.faith);
      const gold = num(p0.gold) + num(p0.goldYield) - num(p0.maintTotal) - num(p1.gold);
      const offF = Math.abs(faith - (150 + 10 * lacked));
      const offG = Math.abs(gold - (200 + 15 * lacked));
      // neither purse paid a patronage's least price: no patronage
      if (faith < 150 && gold < 200) continue;
      const list = out.get(g.player) ?? [];
      list.push(`${g.cls.replace(/^GREAT_PERSON_CLASS_/, '')}:${offF <= offG ? 'faith' : 'gold'}`);
      out.set(g.player, list);
    }
    for (const p of a.players) if (Array.isArray(p.gpp)) this.last.set(p.id, p.gpp.map((v) => num(v)));
    return out;
  }

  /** the Faith patronage (0x751590) on record `a`'s purse: the class, null
   *  for none */
  /** a Great Prophet the log grants the player before `turn` */
  private prophetBefore(pid: number, turn: number): boolean {
    for (const [t, list] of this.grants) {
      if (t < turn && list.some((g) => g.player === pid && g.cls === 'GREAT_PERSON_CLASS_PROPHET')) return true;
    }
    return false;
  }

  private onRecord(a: TurnRecord, pid: number, discount: number, usable: (cls: string) => boolean,
                   prev: number[] | undefined): string | null {
    const p0 = a.players.find((p) => p.id === pid);
    if (!p0 || !Array.isArray(p0.gpp)) return null;
    const faith = num(p0.faith) + num(p0.faithYield);
    let best: string | null = null;
    let bestPrice = -1;
    for (const cls of AI_GREAT_PERSON_CLASSES) {
      const k = (this.cat.greatPersonClasses ?? []).indexOf(cls);
      let cost = -1;
      for (const [t, c, v] of this.added) if (t <= a.turn && c === cls) cost = v;
      // a person its points claim is the claim's; a Prophet past the
      // player's first is not its to earn
      const held = k < 0 ? 0 : num(p0.gpp[k]) + (prev ? Math.max(0, num(p0.gpp[k]) - prev[k]) : 0);
      if (k < 0 || cost < 0 || held >= cost || (cls === 'GREAT_PERSON_CLASS_PROPHET' && this.prophetBefore(pid, a.turn))) continue;
      const price = Math.floor((150 + 10 * (cost - held)) * (1 - discount / 100));
      if (faith <= price || (best !== null && price >= bestPrice) || !usable(cls)) continue;
      best = cls.replace(/^GREAT_PERSON_CLASS_/, '');
      bestPrice = price;
    }
    return best;
  }

  /** ONE AI TURN's close: each AI major's Gold, then Faith patronage, applied
   *  and scored */
  turn(state: GameState, a: TurnRecord, b: TurnRecord, inputs: MajorViewInputs, mem: DiploActionMemory): void {
    const prevOf = new Map(this.last);
    const game = this.gameOf(a, b);
    for (const [seat, pid] of this.seats) {
      const ours: string[] = [];
      const gold = goldPatronage(majorView(state, inputs), mem, seat);
      if (gold) {
        const c = gold.replace(/^GREAT_PERSON_CLASS_/, '');
        if (patronizeGreatPerson(state, seat, GP_CLASSES.indexOf(c as never), 'gold').ok) ours.push(`${c}:gold`);
      }
      const faith = faithPatronage(majorView(state, inputs), seat);
      if (faith) {
        const c = faith.replace(/^GREAT_PERSON_CLASS_/, '');
        if (patronizeGreatPerson(state, seat, GP_CLASSES.indexOf(c as never), 'faith').ok) ours.push(`${c}:faith`);
      }
      const theirs = game.get(pid) ?? [];
      const view = majorView(state, inputs);
      const discount = seatWonders(state, seat).reduce((n, w) => n + (w.def.effects?.patronageFaithPct ?? 0), 0);
      const rec = this.onRecord(a, pid, discount, (cls) => view.greatPersonUsable(seat, cls), prevOf.get(pid));
      if (rec) {
        this.tally.onRecord++;
        if (theirs.includes(`${rec}:faith`)) this.tally.onRecordEqual++;
      }
      const t = this.tally;
      t.ours += ours.length;
      t.game += theirs.length;
      const left = [...theirs];
      for (const o of ours) {
        const i = left.indexOf(o);
        if (i >= 0) {
          t.equal++;
          left.splice(i, 1);
        }
      }
      if ((ours.length || theirs.length) && (ours.length !== theirs.length || left.length) && t.misses.length < 40) {
        t.misses.push(`t${a.turn} p${pid}: ours [${ours.join(' ')}] game [${theirs.join(' ')}]`);
      }
    }
  }
}

/** the tally as the replay report's section */
export function greatPeopleAiMarkdown(t: GreatPeopleAiTally): string[] {
  return ['', "## The majors' AI: the Great People's patronage (ai/major/greatPeople.ts)", '',
    `- Patronages: the port's ${t.ours}, the game's ${t.game} (Game_GreatPeople.csv grants beyond the class's points), both ${t.equal}.`,
    `- The Faith patronage on the record's purse: ${t.onRecord} decided, ${t.onRecordEqual} as the game's.`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`)];
}
