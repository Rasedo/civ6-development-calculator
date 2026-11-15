/**
 * THE GAME'S INTERMEDIATE AI STATE AGAINST OURS: what the game's tactical AI
 * holds between a turn's memory and its decisions, read from the recording's
 * unit stream (`<stem>.aiunits.jsonl`, tools/civ6lab/aimem.py `Units`), set
 * beside the same structures of our engine at the same moment. Nothing here
 * feeds the engine: every kind only compares.
 *
 * As a city-state's, the Free Cities' or the barbarians' tactical pass opens
 * (`tracePlanning`: the target list built, every unit planned, no unit moved)
 * against the game's record of its tactical pass (site `tacpass`, whose
 * plannings and target list stand as built before the operations' trees
 * moved a unit) and every player's units at its tactical step (site
 * `tactical`, the plots the plannings open on):
 *
 *   - plan.unit: per unit either side plans, whether both hold a planning —
 *     ours by its record key, one no record names with the game's planned
 *     unit of its type on its plot;
 *   - plan.input: per unit both plan, what its planning read of it — plot,
 *     Movement left, damage, embarked; plan.aiType a military unit's AI type
 *     as the pass takes it (EXPLORE 2, COMBAT 3, DEFENDER 4);
 *   - plan.reach: its reach, the plots with their turns (plan.reach.moves the
 *     Movement left on each plot, plan.reach.order the list's order, each
 *     where the kind before it agrees);
 *   - plan.targets: the targets its planning holds, of the entries both
 *     target lists hold (type, plot, owner, unit type);
 *   - plan.spots: per target both hold, the spots it would strike from with
 *     their turns, in order;
 *   - plan.kills: per target both hold a spot of, whether its blow kills;
 *   - plan.blow: per spot both hold, the predicted blow dealt and taken and
 *     the blow back dealt and taken (a district's blow dealt the planning's
 *     own `predictDistrictExchange`, which its entry does not keep);
 *   - targets: the player's tactical target list (targets.order its order
 *     where the entries agree);
 *   - kb.cities: per city either knowledge base holds — ours the one the
 *     operations read (`AiView.knownCities`) — its owner, population,
 *     capital flags and each defensible district's cached defense, walls and
 *     strike strengths, the districts in plot order; kb.cities.list a
 *     city-state's own list of the cities it knows
 *     (`CityState.citiesKnown`), kb.cities.list.order its order where the
 *     members agree.
 *
 * At a city-state's military AI's upgrade step against the game's end look:
 *
 *   - unit.table: the unit production table's entries, each its value
 *     (unit.table.held the units held per entry both tables list).
 *
 * LEFT OUT, counted by reason (`leftOut`): a unit whose planning opens on
 * another plot than the game's (its reach, targets, spots and blows are not
 * compared: the worlds differ before the planning); the game's planning of
 * a unit off the map by its pass that ours no longer holds (the planning
 * runs before the turn's upgrades and a Builder's last charge); the target
 * list's and a planning's entries of a TargetType the engine's list has no
 * type for; a planning's entry only one side's target list holds (a miss of
 * `targets`, not of the planning); the AI type of a unit whose game row
 * changes it between its tactical step and its pass (ours is read between).
 */
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { neighbors } from '../../world/hex';
import { isWater } from '../../world/query';
import { aiView } from '../core/aiView';
import { predictDistrictExchange } from '../core/combat';
import { installType, minorKnownUnits, minorUnitProduction } from '../core/minorBuild';
import { cityHolders, isBarbSeat, tileSeat } from '../core/seats';
import type { Pass, PlanEntry, Target, TargetType } from '../core/tactical';
import { NO_SEAT, type CityState, type GameState, type Unit } from '../core/types';
import { unitDomain, unitExertsZoc, unitsHostile } from '../core/units';
import { gameTypeOf } from '../data/aliases';
import { MP_SCALE } from '../data/constants';
import { UNIT_HP, UNITS } from '../data/units';

/** one comparison: ours, the game's */
export interface StateRead {
  kind: string;
  subject: string;
  equal: boolean;
  ours: string;
  game: string;
}

/** one unit's planning as the stream holds it: the reach's (x, y, turns,
 *  Movement left) quads, the targets' 0xd0 bytes as ints */
interface GamePlan {
  reach: number[];
  targets: number[][];
}

/** one record of the stream */
interface GameUnitsRead {
  /** at `tacpass` and `endlook` the player's unit rows, at `start` and
   *  `tactical` every player's by player */
  units?: number[][] | Record<string, number[][]>;
  plans?: Record<string, GamePlan> | null;
  /** the tactical target list, ten ints an entry */
  targets?: number[];
  /** per known city its first 0x30 bytes as ints and its defensible
   *  districts, eight ints each */
  kbCities?: [number[], number[]][];
  unitTable?: { built: number; entries: number[][] };
}

type Site = 'start' | 'tactical' | 'log' | 'tacpass' | 'endlook';

/**
 * THE GAME'S UNIT STREAM beside a recording: its lines indexed by site, turn
 * and player as the file is scanned once, each record read and parsed when
 * asked for (a second end look of a player's turn replaces the first).
 */
export class GameUnits {
  private readonly fd: number;
  private readonly index = new Map<string, [number, number]>();
  private readonly unitCol: Record<string, number> = {};

  constructor(path: string) {
    this.fd = openSync(path, 'r');
    const size = fstatSync(this.fd).size;
    const chunk = Buffer.allocUnsafe(1 << 22);
    const lines: [number, number][] = [];
    let start = 0;
    for (let pos = 0; pos < size;) {
      const n = readSync(this.fd, chunk, 0, chunk.length, pos);
      if (n <= 0) break;
      for (let from = 0; ;) {
        const nl = chunk.indexOf(10, from);
        if (nl < 0 || nl >= n) break;
        lines.push([start, pos + nl - start]);
        start = pos + nl + 1;
        from = nl + 1;
      }
      pos += n;
    }
    if (start < size) lines.push([start, size - start]);
    const head = Buffer.allocUnsafe(96);
    lines.forEach(([at, len], k) => {
      if (k === 0) {
        const cols = (this.read(at, len) as { cols?: { unit?: string[] } }).cols;
        (cols?.unit ?? []).forEach((name, i) => { this.unitCol[name] = i; });
        return;
      }
      const n = readSync(this.fd, head, 0, Math.min(head.length, len), at);
      const m = /^\{"site":\s*"(\w+)",\s*"player":\s*(\d+),\s*"turn":\s*(\d+)/.exec(head.toString('latin1', 0, n));
      if (m) this.index.set(`${m[1]}:${m[3]}:${m[2]}`, [at, len]);
    });
  }

  static of(dumpPath: string): GameUnits | undefined {
    const path = dumpPath.replace(/\.jsonl$/, '.aiunits.jsonl');
    return existsSync(path) ? new GameUnits(path) : undefined;
  }

  private read(at: number, len: number): unknown {
    const buf = Buffer.allocUnsafe(len);
    readSync(this.fd, buf, 0, len, at);
    return JSON.parse(buf.toString('utf8'));
  }

  at(site: Site, turn: number, player: number): GameUnitsRead | undefined {
    const e = this.index.get(`${site}:${turn}:${player}`);
    return e ? this.read(e[0], e[1]) as GameUnitsRead : undefined;
  }

  /** a unit row's column by the member's name */
  col(name: string): number {
    return this.unitCol[name] ?? -1;
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** the engine's target types by the game's TargetTypes index (Operations.xml's
 *  rows in order); the game's other types have none */
const TARGET_OF: Readonly<Record<number, TargetType>> = {
  0: 'FRIENDLY_CITY', 1: 'COMBAT_DISTRICT', 2: 'PASSIVE_DISTRICT', 4: 'CAMP', 6: 'CIVILIAN', 7: 'RELIGIOUS', 8: 'TRADER',
  9: 'LOW', 10: 'MEDIUM', 11: 'HIGH', 12: 'IMPROVEMENT', 14: 'GOODY',
};
const GAME_TARGETS = ['FRIENDLY_CITY', 'ENEMY_COMBAT_DISTRICT', 'ENEMY_PASSIVE_DISTRICT', 'NEUTRAL_CITY', 'BARBARIAN_CAMP', 'NEUTRAL_CIVILIAN_UNIT',
  'CIVILIAN_UNIT', 'RELIGIOUS_CIVILIAN', 'TRADER', 'LOW_PRIORITY_UNIT', 'MEDIUM_PRIORITY_UNIT', 'HIGH_PRIORITY_UNIT', 'ENEMY_IMPROVEMENT',
  'SETTLE_LOCATION', 'GOODY_HUT', 'ALLY_SUPPORT', 'AIR_UNIT', 'NAVAL_SUPERIORITY', 'SCRIPT_SUPPLIED'];

/** what a pass's comparison reads of the replay's world */
export interface PassWorld {
  W: number;
  /** the catalog's unit types by the game's Units index */
  unitNames: readonly string[];
  /** a unit's record key (`player:id`), undefined for one no record names */
  keyOf(u: Unit): string | undefined;
  playerOf(seat: number): number;
}

const SHOWN = 16;

/** two lists as multisets: the entries only ours holds, those only the game's */
function onlyOf(ours: readonly string[], game: readonly string[]): [string[], string[]] {
  const left = new Map<string, number>();
  for (const g of game) left.set(g, (left.get(g) ?? 0) + 1);
  const mine: string[] = [];
  for (const o of ours) {
    const n = left.get(o) ?? 0;
    if (n > 0) left.set(o, n - 1);
    else mine.push(o);
  }
  return [mine, [...left].flatMap(([g, n]) => Array<string>(n).fill(g))];
}

/** two lists as multisets: each side its count and the entries only it holds */
function listRead(kind: string, subject: string, ours: readonly string[], game: readonly string[], head: [string, string] = ['', '']): StateRead {
  const [mine, theirs] = onlyOf(ours, game);
  const show = (h: string, n: number, only: string[]) => `${h}n${n}${only.length ? ` only ${only.length}: ${only.slice(0, SHOWN).join(' ')}` : ''}`;
  return { kind, subject, equal: mine.length + theirs.length === 0, ours: show(head[0], ours.length, mine), game: show(head[1], game.length, theirs) };
}

/** two lists in order: the first place they differ, with the entries there */
function orderRead(kind: string, subject: string, ours: readonly string[], game: readonly string[]): StateRead {
  let k = 0;
  while (k < ours.length && k < game.length && ours[k] === game[k]) k += 1;
  const equal = k === ours.length && k === game.length;
  const show = (x: readonly string[]) => (equal ? `n${x.length}` : `#${k} ${x.slice(k, k + 4).join(' ')}`);
  return { kind, subject, equal, ours: show(ours), game: show(game) };
}

/** a 24.8 number whole where it is, else to four places (1 / 256 apart) */
const fx = (v: number) => String(+(v / 256).toFixed(4));

/**
 * One tactical pass as it opens against the game's record of the player's
 * turn: the kinds above but the unit table's. `leftOut` counts what is not
 * compared, by reason.
 */
export function readPass(game: GameUnits, w: PassWorld, state: GameState, pass: Pass, turn: number, leftOut: Record<string, number>): StateRead[] {
  const player = w.playerOf(pass.seat);
  const tp = game.at('tacpass', turn, player);
  if (!tp) return [];
  const out: StateRead[] = [];
  const leave = (why: string) => { leftOut[why] = (leftOut[why] ?? 0) + 1; };
  const { tiles } = state.map;
  const xy = (p: number) => `${p % w.W}:${Math.floor(p / w.W)}`;
  const P = `p${player}`;

  // every player's units as the player's tactical step found them, the
  // player's own by id
  const [cId, cType, cX, cY, cMoves, cDamage, cEmbarked, cAi] = ['m_id', 'm_eTypeIndex', 'm_kLocation', 'y', 'm_xMovesRemaining', 'm_iDamage', 'm_bEmbarked',
    'm_eAIType'].map((n) => game.col(n));
  const typeName = (index: number) => (w.unitNames[index] ?? `unit${index}`).replace(/^UNIT_/, '');
  const typeOfOurs = (u: Unit) => gameTypeOf('unit', u.type, 'UNIT_').replace(/^UNIT_/, '');
  const stepRows = new Map<number, number[]>();
  const stepTypes = new Map<string, string>();
  const step = game.at('tactical', turn, player)?.units;
  if (step && !Array.isArray(step)) {
    for (const [owner, rows] of Object.entries(step)) for (const row of rows) stepTypes.set(`${owner}:${row[cId]}`, typeName(row[cType]));
    for (const row of step[String(player)] ?? []) stepRows.set(row[cId], row);
  }

  // an entry of either list: its type, plot and what it is — a unit by its
  // owner and unit type, a district by its owner
  const entryOf = (type: string, x: number, y: number, word: number, id: number) => {
    const owner = word & 0xffff;
    const comp = (word >>> 16) & 0xffff;
    return `${type}@${x}:${y}${comp === 1 ? `#p${owner}:${stepTypes.get(`${owner}:${id}`) ?? `u${id}`}` : comp === 3 ? `#p${owner}` : ''}`;
  };
  const ourEntry = (e: Target) => `${e.type}@${xy(e.tile)}${e.unit ? `#p${w.playerOf(e.unit.seat)}:${typeOfOurs(e.unit)}`
    : e.seat !== NO_SEAT ? `#p${w.playerOf(e.seat)}` : ''}`;
  const gameEntries = (flat: readonly number[][], at: [number, number, number, number, number], where: string): { entry: string; raw: number[] }[] => {
    const list: { entry: string; raw: number[] }[] = [];
    for (const t of flat) {
      const type = TARGET_OF[t[at[0]]];
      if (!type) leave(`${where}: ${GAME_TARGETS[t[at[0]]] ?? `type ${t[at[0]]}`} entries, no engine type`);
      else list.push({ entry: entryOf(type, t[at[1]], t[at[2]], t[at[3]], t[at[4]]), raw: t });
    }
    return list;
  };

  // THE TARGET LIST; the entries only one side's holds are its own misses,
  // out of each planning's targets
  const oneSided = new Set<string>();
  if (tp.targets) {
    const flat: number[][] = [];
    for (let i = 0; i + 10 <= tp.targets.length; i += 10) flat.push(tp.targets.slice(i, i + 10));
    const theirs = gameEntries(flat, [0, 1, 2, 4, 5], 'targets').map((e) => e.entry);
    const ours = pass.targets.map(ourEntry);
    const sets = listRead('targets', P, ours, theirs);
    for (const e of onlyOf(ours, theirs).flat()) oneSided.add(e);
    out.push(sets);
    if (sets.equal) out.push(orderRead('targets.order', P, ours, theirs));
  }

  // THE KNOWN CITIES
  if (tp.kbCities) {
    const theirs = new Map<string, string>();
    // each side's districts in plot order
    const inOrder = (ds: [number, string][]) => ds.sort((a, b) => a[0] - b[0]).map((d) => d[1]).join(', ');
    for (const [c, ds] of tp.kbCities) {
      const districts: [number, string][] = [];
      for (let i = 0; i + 8 <= ds.length; i += 8) {
        districts.push([ds[i + 3] + ds[i + 4] * w.W, `${ds[i + 3]}:${ds[i + 4]} ${fx(ds[i + 5])}/${fx(ds[i + 6])}/${fx(ds[i + 7])}`]);
      }
      theirs.set(`${c[2]}:${c[3]}`, `p${c[0] & 0xffff} pop${c[7]} cap${c[5] & 0xff}${(c[5] >>> 8) & 0xff} | ${inOrder(districts)}`);
    }
    const ours = new Map<string, string>();
    for (const k of aiView(state).knownCities(pass.seat)) {
      ours.set(xy(k.plot), `p${w.playerOf(k.owner)} pop${k.population} cap${k.originalCapital ? 1 : 0}${k.capital ? 1 : 0} | `
        + inOrder(k.districts.map((d) => [d.plot, `${xy(d.plot)} ${fx(Math.round(d.defense * 256))}/${fx(Math.round(d.walls * 256))}/${fx(Math.round(d.strike * 256))}`])));
    }
    for (const plot of new Set([...ours.keys(), ...theirs.keys()])) {
      const [a, b] = [ours.get(plot) ?? 'none', theirs.get(plot) ?? 'none'];
      out.push({ kind: 'kb.cities', subject: `${P} city ${plot}`, equal: a === b, ours: a, game: b });
    }
    // a city-state's own list of them (`CityState.citiesKnown`): its
    // members, then their order
    const cs = state.cityStates.find((c) => c.seat === pass.seat);
    if (cs) {
      const centre = (owner: number, id: number) => (id < 0 ? state.cityStates.find((c) => c.seat === owner)?.centerIndex
        : cityHolders(state).find((h) => h.seat === owner)?.cities.find((c) => c.id === id)?.centerIndex) ?? -1;
      const listed = (cs.citiesKnown ?? []).map((k) => { const p = centre(k.owner, k.id); return `p${w.playerOf(k.owner)}@${p < 0 ? 'gone' : xy(p)}`; });
      const held = tp.kbCities.map(([c]) => `p${c[0] & 0xffff}@${c[2]}:${c[3]}`);
      const members = listRead('kb.cities.list', P, listed, held);
      out.push(members);
      if (members.equal) out.push(orderRead('kb.cities.list.order', P, listed, held));
    }
  }

  // THE PLANNINGS
  if (!tp.plans) return out;
  const passRows = new Map<number, number[]>();
  if (Array.isArray(tp.units)) for (const row of tp.units) passRows.set(row[cId], row);
  const typeOfGame = (id: number) => {
    const row = stepRows.get(id) ?? passRows.get(id);
    return row ? typeName(row[cType]) : '?';
  };
  const planned = new Map<number, GamePlan>();
  for (const [id, pl] of Object.entries(tp.plans)) if (pl.reach.length >= 4) planned.set(Number(id), pl);

  // each of our planned units with the game's of its record key; one no
  // record names with the game's planned unit of its type on its plot
  const pairs: { u: Unit; id: number }[] = [];
  const taken = new Set<number>();
  const unkeyed: Unit[] = [];
  const lone: Unit[] = [];
  const ours = pass.units.filter((u) => pass.plan.has(u.id));
  for (const u of ours) {
    const key = w.keyOf(u);
    const id = key !== undefined && key.startsWith(`${player}:`) ? Number(key.slice(key.indexOf(':') + 1)) : undefined;
    if (id === undefined) unkeyed.push(u);
    else if (planned.has(id) && !taken.has(id)) { pairs.push({ u, id }); taken.add(id); } else lone.push(u);
  }
  for (const u of unkeyed) {
    const type = typeOfOurs(u);
    const id = [...planned].find(([g, pl]) => !taken.has(g) && pl.reach[0] + pl.reach[1] * w.W === u.tileIndex && typeOfGame(g) === type)?.[0];
    if (id === undefined) lone.push(u);
    else { pairs.push({ u, id }); taken.add(id); }
  }
  const ourOf = new Map<string, Unit>();
  for (const u of state.units) if (u.seat === pass.seat) { const k = w.keyOf(u); if (k !== undefined) ourOf.set(k, u); }
  for (const u of lone) {
    const key = w.keyOf(u);
    const id = key === undefined ? undefined : Number(key.slice(key.indexOf(':') + 1));
    const row = id === undefined ? undefined : passRows.get(id);
    const theirs = id === undefined || (!row && !stepRows.has(id)) ? 'no such unit'
      : `${tp.plans[String(id)] ? 'no reach' : 'no planning'}${stepRows.has(id) ? '' : ', made since its tactical step'}${row ? ` mv${row[cMoves]}` : ''}`;
    out.push({ kind: 'plan.unit', subject: `${P} u${id ?? 'new'} ${typeOfOurs(u)}`, equal: false,
      ours: `plans at ${xy(u.tileIndex)} ${unitDomain(u.type)} mv${(u.movesLeft * 256) / MP_SCALE}`, game: theirs });
  }
  for (const [id, pl] of planned) {
    if (taken.has(id)) continue;
    const u = ourOf.get(`${player}:${id}`);
    // a unit off the map by its pass (upgraded, spent or killed since its
    // planning ran) keeps its planning; ours holds no such unit
    if (!u && (passRows.get(id)?.[cX] ?? 0) < 0) {
      leave('plan.unit: the game\'s planning of a unit off the map by its pass (upgraded, spent or killed since the planning ran), ours gone');
      continue;
    }
    out.push({ kind: 'plan.unit', subject: `${P} u${id} ${typeOfGame(id)}`, equal: false,
      ours: u ? `no planning ${unitDomain(u.type)} at ${xy(u.tileIndex)}${pass.units.includes(u) ? '' : ', not of the pass'}` : 'no such unit',
      game: `plans at ${pl.reach[0]}:${pl.reach[1]}` });
  }

  // what stands on and beside a plot, for a differing reach plot: w water,
  // d a district, u another player's unit, m the player's own, z beside a
  // hostile unit exerting a zone of control, o another player's ground, x
  // not revealed to the player
  const at = new Map<number, Unit[]>();
  for (const u of state.units) {
    const l = at.get(u.tileIndex);
    if (l) l.push(u);
    else at.set(u.tileIndex, [u]);
  }
  const me = { seat: pass.seat };
  const revealed = isBarbSeat(pass.seat) ? state.barbSeat.explored : state.cityStates.find((c) => c.seat === pass.seat)?.revealed;
  const tags = (p: number): string => {
    const t = tiles[p];
    if (!t) return '?';
    const here = at.get(p) ?? [];
    const owner = tileSeat(t);
    return (isWater(t) ? 'w' : '') + (t.district !== null ? 'd' : '') + (here.some((u) => u.seat !== pass.seat) ? 'u' : '')
      + (here.some((u) => u.seat === pass.seat) ? 'm' : '')
      + (neighbors(state.map, t).some((n) => (at.get(n.index) ?? []).some((u) => unitsHostile(state, me, u) && unitExertsZoc(u))) ? 'z' : '')
      + (owner !== NO_SEAT && owner !== pass.seat ? 'o' : '') + (revealed?.length && revealed[p] !== 1 ? 'x' : '');
  };

  for (const { u, id } of pairs) {
    const pl = planned.get(id)!;
    const ourPlan = pass.plan.get(u.id)!;
    const U = `${P} u${id} ${typeOfOurs(u)}`;
    out.push({ kind: 'plan.unit', subject: U, equal: true, ours: 'plans', game: 'plans' });
    const row = stepRows.get(id);
    if (row) {
      const a = `${xy(u.tileIndex)} mv${(u.movesLeft * 256) / MP_SCALE} dmg${UNIT_HP - u.hp} ${u.embarked ? 'embarked' : '-'}`;
      const b = `${row[cX]}:${row[cY]} mv${row[cMoves]} dmg${row[cDamage]} ${row[cEmbarked] ? 'embarked' : '-'}`;
      out.push({ kind: 'plan.input', subject: U, equal: a === b, ours: a, game: b });
    }
    // its AI type as the pass takes it (ours of a military unit), where the
    // game's stands unchanged from its tactical step to its pass
    const ai = pass.ai.get(u.id) ?? -1;
    const atPass = passRows.get(id);
    if (ai >= 0 && row && atPass) {
      if (row[cAi] !== atPass[cAi]) leave('plan.aiType: the game\'s unit changes its AI type between its tactical step and its pass');
      else out.push({ kind: 'plan.aiType', subject: U, equal: ai === row[cAi], ours: `ai${ai}`, game: `ai${row[cAi]}` });
    }
    if (pl.reach[0] + pl.reach[1] * w.W !== u.tileIndex) {
      leave('plan: the unit\'s planning opens on another plot than the game\'s (reach, targets, spots, blows)');
      continue;
    }
    // the reach
    const quads: [number, number, number][] = [];
    for (let i = 0; i + 4 <= pl.reach.length; i += 4) quads.push([pl.reach[i] + pl.reach[i + 1] * w.W, pl.reach[i + 2], pl.reach[i + 3]]);
    const domain = UNITS[u.type]?.naval ? 'sea' : u.embarked ? 'embarked' : unitDomain(u.type) === 'military' ? 'land' : unitDomain(u.type);
    const mine = ourPlan.reach.map((r) => `${xy(r.tile)}/${r.turns}`);
    const theirs = quads.map(([p, t]) => `${xy(p)}/${t}`);
    const reach = listRead('plan.reach', U, mine, theirs, [`${domain} at ${xy(u.tileIndex)} mv${ourPlan.reach[0]?.moves ?? '?'} `, `mv${quads[0][2]} `]);
    if (!reach.equal) {
      // the differing plots with their Movement left and what stands there
      const mv = new Map<string, number>([...ourPlan.reach.map((r) => [`o${xy(r.tile)}/${r.turns}`, r.moves] as const),
        ...quads.map(([p, t, m]) => [`g${xy(p)}/${t}`, m] as const)]);
      const tag = (side: string, text: string) => text.replace(/(\d+):(\d+)\/(\d+)/g, (s, x, y) => `${s}/${mv.get(side + s) ?? '?'}[${tags(Number(x) + Number(y) * w.W)}]`);
      reach.ours = reach.ours.replace(/ only .*/, (s) => tag('o', s));
      reach.game = reach.game.replace(/ only .*/, (s) => tag('g', s));
    }
    out.push(reach);
    if (reach.equal) {
      const moves = listRead('plan.reach.moves', U, ourPlan.reach.map((r) => `${xy(r.tile)}/${r.turns}/${r.moves}`), quads.map(([p, t, m]) => `${xy(p)}/${t}/${m}`),
        [`${domain} at ${xy(u.tileIndex)} `, '']);
      if (!moves.equal) {
        const tag = (text: string) => text.replace(/(\d+):(\d+)\/\d+\/-?\d+/g, (e, x, y) => `${e}[${tags(Number(x) + Number(y) * w.W)}]`);
        moves.ours = moves.ours.replace(/ only .*/, tag);
        moves.game = moves.game.replace(/ only .*/, tag);
      }
      out.push(moves);
      if (moves.equal) out.push(orderRead('plan.reach.order', U, mine, theirs));
    }
    // the targets, then per target both hold its spots and per spot its blows
    const listed = (entry: string) => {
      if (!oneSided.has(entry)) return true;
      leave('plan.targets: a planning\'s entry only one side\'s target list holds (missed under targets)');
      return false;
    };
    const theirTargets = gameEntries(pl.targets, [0, 4, 5, 2, 3], 'plan.targets');
    out.push(listRead('plan.targets', U, ourPlan.entries.map((e) => ourEntry(e.target)).filter(listed), theirTargets.map((e) => e.entry).filter(listed)));
    const byEntry = new Map<string, number[]>();
    for (const e of theirTargets) if (!byEntry.has(e.entry)) byEntry.set(e.entry, e.raw);
    const seen = new Set<string>();
    for (const E of ourPlan.entries) {
      const entry = ourEntry(E.target);
      const t = byEntry.get(entry);
      if (!t || seen.has(entry)) continue;
      seen.add(entry);
      const n = Math.max(0, Math.min(t[6], 6));
      if (!n && !E.spots.length) continue;
      const spot = (k: number) => t[7 + 2 * k] + t[8 + 2 * k] * w.W;
      // a district's blow dealt is the planning's own (`planUnit` keeps it
      // in no entry: the assignment prices a district as it runs)
      let own: number | undefined;
      const dealt = () => (E.target.type === 'COMBAT_DISTRICT' ? (own ??= predictDistrictExchange(state, u, E.target.tile).dealt) : E.dealt);
      const a = E.spots.map((s) => `${xy(s.tile)}/${s.turns}`).join(' ') || 'none';
      const b = Array.from({ length: n }, (_, k) => `${xy(spot(k))}/${t[19 + k]}`).join(' ') || 'none';
      out.push({ kind: 'plan.spots', subject: `${U} > ${entry}`, equal: a === b, ours: a, game: b });
      // whether the blow kills (the entry's +0xc4), where both hold a spot
      if (n && E.spots.length) {
        const kills = (t[49] & 0xff) !== 0;
        out.push({ kind: 'plan.kills', subject: `${U} > ${entry}`, equal: E.kills === kills, ours: `${E.kills ? 'kills' : 'no kill'} d${dealt()}`,
          game: `${kills ? 'kills' : 'no kill'} d${t[25]}` });
      }
      for (let k = 0; k < n; k++) {
        const s = E.spots.find((x) => x.tile === spot(k));
        if (s) out.push(blowRead(`${U} > ${entry} from ${xy(s.tile)}`, dealt(), E, s, t, k));
      }
    }
  }
  return out;
}

/** one spot's predicted blows: dealt / taken, the blow back dealt / taken */
function blowRead(subject: string, dealt: number, E: PlanEntry, s: PlanEntry['spots'][number], t: readonly number[], k: number): StateRead {
  const a = `d${dealt} t${E.taken} bd${s.backDealt} bt${s.backTaken}`;
  const b = `d${t[25 + k]} t${t[31 + k]} bd${t[43 + k]} bt${t[37 + k]}`;
  return { kind: 'plan.blow', subject, equal: a === b, ours: a, game: b };
}

/**
 * A city-state's unit production table as its military AI reads it now (the
 * engine's entries by install unit type, 24.8 values, on the units its
 * knowledge base counts) against the game's at the end look of its turn: the
 * entries with their values, then the units held per entry both list.
 */
export function readUnitTable(game: GameUnits, unitNames: readonly string[], state: GameState, cs: CityState, turn: number, player: number): StateRead[] {
  const t = game.at('endlook', turn, player)?.unitTable;
  if (!t?.built) return [];
  const ours = minorUnitProduction(state, cs, minorKnownUnits(cs));
  const held = new Map<string, number>();
  for (const u of state.units) {
    if (u.seat !== cs.seat) continue;
    const type = installType('unit', u.type, 'UNIT_');
    held.set(type, (held.get(type) ?? 0) + 1);
  }
  const name = (type: string) => type.replace(/^UNIT_/, '');
  const theirs = new Map(t.entries.map((e) => [unitNames[e[0]] ?? `unit${e[0]}`, e] as const));
  const P = `p${player}`;
  const both = [...ours.keys()].filter((type) => theirs.has(type));
  return [
    listRead('unit.table', P, [...ours].map(([type, e]) => `${name(type)}=${e.value}`), [...theirs].map(([type, e]) => `${name(type)}=${e[88] ?? 0}`)),
    listRead('unit.table.held', P, both.map((type) => `${name(type)}=${held.get(type) ?? 0}`), both.map((type) => `${name(type)}=${theirs.get(type)![8] ?? 0}`)),
  ];
}
