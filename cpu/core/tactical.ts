/**
 * THE GAME'S UNIT AI: the unit pathfinder's reach and path, and the tactical
 * pass a player's units take (GameCore_XP2 TacticalAI;
 * tools/civ6lab/dll_readings.md "C-95: the unit pathfinder and the
 * planning's reach", "C-95: the tactical pass"). The barbarians' turn runs it
 * for their units (`barbarianPhase`).
 */
import type { GameState, Tile, Unit } from './types';
import { DIRECTION_TYPES, hexDistance, neighborTile } from '../../world/hex';
import { isImpassable, isWater } from '../../world/query';
import { MP_SCALE } from '../data/constants';
import { UNITS } from '../data/units';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import {
  cliffBlocksStep, encampmentBlocks, inEnemyZoc, stepCost, stepUnit, unitDomain, unitFullMoves, unitIsNoncombat, unitReligious,
  unitsHostile, unitVisibleTo,
  waterEnterable,
} from './units';
import { BARB_SEAT, NO_SEAT, isBarbSeat, isCityStateSeat, isTerritorial, seatOf, tileCity, tileSeat } from './seats';
import { randRange } from './rand';
import { attackTargets, hostilePillage, hostileRangedStrike, hostileUnitAct, meleeAttack, stackDefender, unitAttackRange } from './combat';
import { canSee } from './fog';
import { barbarianOps, barbarianRules, barbSlots, barbSlotsDying, plotsSeenNow, tribeOf } from './barbarians';
import { generalAuraMP } from './aura';
import { attacksLeftOf, attacksPerTurn } from './promotions';
import type { BarbTribe, ImprovementId } from './types';

/** the pathfinder's fixed point: one Movement is 256 */
const FIX = 256;

/** One plot the pathfinder closed: its plot, the turn it is reached on (1 =
 *  this turn) and the Movement left there, in 1/256. */
export interface Reach {
  tile: number;
  turns: number;
  moves: number;
  /** a plot it would attack into */
  attack: boolean;
}

interface PNode {
  tile: number;
  g: number;
  /** the order among equal costs: below 0 put before its equals, above 0
   *  after them, 0 alone */
  tie: number;
  moves: number;
  turns: number;
  closed: boolean;
  /** a plot the unit attacks into: the path ends there */
  attack?: boolean;
  parent: PNode | null;
}

/** may the unit enter this plot at all (Pathfinder valid 0x2720a0, the
 *  engine's ground): no mountain or impassable plot; its domain's ground; no
 *  unit of another player on the map (an aircraft or a spy holds no plot);
 *  no city centre but its own, no live enemy Encampment; its own units it
 *  walks through */
function enterable(state: GameState, unit: Unit, t: Tile, held: ReadonlySet<number>, centres: ReadonlySet<number>): boolean {
  if (isImpassable(t)) return false;
  const naval = !!UNITS[unit.type]?.naval;
  if (isWater(t) !== naval) return false;
  if (naval && !waterEnterable(state, t, unit)) return false;
  if (held.has(t.index)) return false;
  if (t.district === 'CITY_CENTER' && tileSeat(t) !== unit.seat) return false;
  if (centres.has(t.index)) return false;
  return !encampmentBlocks(state, t, unit);
}

/** the steps' costs a tactical pass holds while it runs, per chassis and
 *  promotions, by plot and DirectionTypes link: the ground holds still but
 *  for a pillage, which drops them (`dropHeldCosts`) */
let costsHeld: Map<string, Int32Array> | null = null;

function heldCostsOf(state: GameState, unit: Unit): Int32Array | null {
  if (!costsHeld) return null;
  const k = `${unit.type}:${unit.promos ?? 0}`;
  let a = costsHeld.get(k);
  if (!a) costsHeld.set(k, (a = new Int32Array(state.map.tiles.length * 6).fill(-1)));
  return a;
}

function stepCostHeld(state: GameState, unit: Unit, from: Tile, to: Tile, di: number, held: Int32Array | null): number {
  if (!held) return stepCost(state, unit, from, to);
  const at = from.index * 6 + di;
  if (held[at] < 0) held[at] = stepCost(state, unit, from, to);
  return held[at];
}

function dropHeldCosts(): void {
  if (costsHeld) costsHeld = new Map();
}

/** `enterable` and `inEnemyZoc` for one search, each plot asked once: the
 *  ground holds still while the pathfinder runs */
function groundOf(state: GameState, unit: Unit): { enter: (t: Tile) => boolean; zoc: (t: Tile) => boolean; attack: (t: Tile) => boolean; known: (i: number) => boolean } {
  const held = new Set<number>();
  const foes = new Set<number>();
  for (const u of state.units) {
    if (u.seat === unit.seat || !onMap(u)) continue;
    held.add(u.tileIndex);
    if (unitsHostile(state, unit, u)) foes.add(u.tileIndex);
  }
  const centres = new Set(state.cityStates.map((c) => c.centerIndex));
  const enters = new Map<number, boolean>();
  const zocs = new Map<number, boolean>();
  const ex = seatOf(state, unit.seat)?.explored;
  const known = (i: number) => !ex || ex.length === 0 || ex[i] === 1;
  const def = UNITS[unit.type];
  const melee = !!def && def.combat > 0;
  const naval = !!def?.naval;
  return {
    known,
    enter: (t) => {
      let v = enters.get(t.index);
      if (v === undefined) enters.set(t.index, (v = known(t.index) && enterable(state, unit, t, held, centres)));
      return v;
    },
    attack: (t) => {
      if (!melee || !known(t.index) || isImpassable(t)) return false;
      if (foes.has(t.index) && isWater(t) === naval) return true;
      const owner = tileSeat(t);
      if (t.district === 'CITY_CENTER' && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return true;
      return !naval && encampmentBlocks(state, t, unit);
    },
    zoc: (t) => {
      let v = zocs.get(t.index);
      if (v === undefined) zocs.set(t.index, (v = inEnemyZoc(state, t.index, unit)));
      return v;
    },
  };
}

/**
 * THE PATHFINDER (Pathfinder_Instance 0x77d10, its step 0x793f0): Dijkstra
 * from the unit's plot — no heuristic (the pool's default, 0x26f330) — over
 * the open nodes by (cost, tie): a node inserted where its cost lies nearer
 * the cheapest open node goes before its equals, else after them (0x775a0),
 * a node made cheaper goes after its new equals (0x79560); each closed node
 * links its neighbours in DirectionTypes order (0xeff730). A step's turns and
 * Movement (0x26e920): a node reached with no Movement starts the next turn
 * at full; a step dearer than the Movement left waits for the next turn,
 * unless it leaves the unit's own plot unmoved, where it spends everything; a
 * zone of control spends everything (`zoc`; the planning's breadth-first
 * search, flag 0x800, reads none). Its cost (0x270dd0): 1000 x the step's
 * Movement +2, and where the step ends the turn's Movement +4, +3 more off
 * the unit's own territory. `onClose` sees each node as it closes; the
 * search stops where it answers true.
 */
function search(state: GameState, unit: Unit, maxTurns: number, zoc: boolean, onClose: (n: PNode) => boolean): void {
  const { map } = state;
  const ground = groundOf(state, unit);
  const held = heldCostsOf(state, unit);
  const nodes = new Map<number, PNode>();
  const full = Math.floor(unitFullMoves(state, unit) * FIX / MP_SCALE);
  const unmoved = unit.movesLeft >= (unit.movesFull ?? unitFullMoves(state, unit));
  const start: PNode = { tile: unit.tileIndex, g: 0, tie: 0, moves: Math.floor(unit.movesLeft * FIX / MP_SCALE),
    turns: 1, closed: false, parent: null };
  nodes.set(start.tile, start);
  // the open nodes, no two of one key; the cheapest and the dearest
  const open: PNode[] = [start];
  let lo: PNode | null = null;
  let hi: PNode | null = null;
  let seq = 0;
  const before = (a: PNode, b: PNode) => a.g < b.g || (a.g === b.g && a.tie < b.tie);
  for (;;) {
    if (!open.length) break;
    // the cheapest node, and the cheapest once it is out
    let bi = 0;
    let si = -1;
    for (let i = 1; i < open.length; i++) {
      if (before(open[i], open[bi])) {
        si = bi;
        bi = i;
      } else if (si < 0 || before(open[i], open[si])) si = i;
    }
    const best = open[bi];
    lo = si >= 0 ? open[si] : null;
    open[bi] = open[open.length - 1];
    open.pop();
    if (!open.length) hi = null;
    else if (hi === null || hi === best) {
      hi = open[0];
      for (const o of open) if (before(hi, o)) hi = o;
    }
    best.closed = true;
    if (onClose(best)) break;
    // an attack's plot is the path's end: no step leaves it
    if (best.attack) continue;
    const from = map.tiles[best.tile];
    for (let di = 0; di < DIRECTION_TYPES.length; di++) {
      const d = DIRECTION_TYPES[di];
      const to = neighborTile(map, from, d);
      if (!to || cliffBlocksStep(state, from, to, unit)) continue;
      const attack = !ground.enter(to);
      if (attack && !ground.attack(to)) continue;
      let pm = best.moves;
      let turns = best.turns;
      if (pm <= 0) {
        turns += 1;
        pm = full;
      }
      let cost: number;
      let moves: number;
      if (attack) {
        // the attack spends the Movement left
        cost = pm;
        moves = 0;
      } else {
        cost = Math.floor(stepCostHeld(state, unit, from, to, di, held) * FIX / MP_SCALE);
        moves = pm - cost;
        if (moves < 0) {
          moves = 0;
          if (best === start && unmoved) cost = pm;
          else if (best.turns === turns) turns += 1;
          else cost = pm > 0 ? pm : FIX;
        }
        if (zoc && moves > 0 && ground.zoc(to)) {
          cost = pm;
          moves = 0;
        }
      }
      if (turns > maxTurns) continue;
      const ends = moves <= 0 ? 4 + (tileSeat(to) !== unit.seat ? 3 : 0) : 0;
      const g = best.g + cost * 1000 + (ends + 2) * FIX;
      const c = nodes.get(to.index);
      if (!c) {
        const n: PNode = { tile: to.index, g, tie: 0, moves, turns, closed: false, parent: best, attack };
        if (lo && hi && g >= lo.g && g <= hi.g) n.tie = Math.abs(g - lo.g) <= Math.abs(g - hi.g) ? -++seq : ++seq;
        nodes.set(n.tile, n);
        open.push(n);
        if (!lo || before(n, lo)) lo = n;
        if (!hi || before(hi, n)) hi = n;
      } else if (g < c.g) {
        c.g = g;
        c.moves = moves;
        c.turns = turns;
        c.parent = best;
        if (!c.closed) {
          c.tie = ++seq;
          if (!lo || before(c, lo)) lo = c;
          if (c === hi) {
            hi = open[0];
            for (const o of open) if (before(hi, o)) hi = o;
          }
        }
      }
    }
  }
}

/** THE REACH (UnitPlanning 0x791e00 -> breadth-first 0x26dcd0, the list
 *  0x26d890 keeps): every plot the unit can stand on within `maxTurns`, in
 *  the order the pathfinder closed them, the unit's own plot first. */
export function reachPlots(state: GameState, unit: Unit, maxTurns: number): Reach[] {
  const out: Reach[] = [];
  search(state, unit, maxTurns, false, (n) => {
    out.push({ tile: n.tile, turns: n.turns, moves: n.moves, attack: !!n.attack });
    return false;
  });
  return out;
}

/** the plots from the unit's to `dest`, the unit's own left out, by the
 *  pathfinder's path (its parents once `dest` closes); empty where none */
export function pathTo(state: GameState, unit: Unit, dest: number): number[] {
  let found = null as PNode | null;
  search(state, unit, Infinity, true, (n) => {
    if (n.tile !== dest) return false;
    found = n;
    return true;
  });
  const out: number[] = [];
  for (let n: PNode | null = found; n && n.parent; n = n.parent) out.push(n.tile);
  return out.reverse();
}

/** a move order carried out (the unit's mission 0x962030): the unit walks
 *  its path as far as its Movement carries it this turn (a zone of control
 *  ends it), the engine's step paying each; it walks through its own units
 *  but stops short of a plot of its own unit that stacks with it */
export function moveTo(state: GameState, unit: Unit, dest: number): void {
  let path = pathTo(state, unit, dest);
  // a path ending on a plot it attacks into: it walks to its side, and
  // strikes it where its Movement and attacks last (the order's attack flag)
  const last = path.length ? path[path.length - 1] : -1;
  const strike = last >= 0 && attackPlot(state, unit, last);
  if (strike) path = path.slice(0, -1);
  walk(state, unit, path);
  if (strike && unit.movesLeft > 0 && attacksLeftOf(unit) > 0 && state.units.includes(unit)
    && plotDistance(state, unit.tileIndex, last) === 1) {
    meleeAttack(state, unit.id, last, unit.seat);
  }
}

/** a plot the unit would attack into rather than enter: one a unit of a
 *  player at war with it holds, or a hostile city centre or Encampment */
function attackPlot(state: GameState, unit: Unit, p: number): boolean {
  const t = state.map.tiles[p];
  if (enemyAt(state, unit, p)) return true;
  const owner = tileSeat(t);
  if (t.district === 'CITY_CENTER' && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return true;
  return encampmentBlocks(state, t, unit);
}

/** the walk of a path as far as the unit's Movement carries it this turn */
function walk(state: GameState, unit: Unit, path: number[]): void {
  const { tiles } = state.map;
  // how far its Movement carries it along the path this turn
  const full = unit.movesFull ?? unitFullMoves(state, unit);
  let mp = unit.movesLeft;
  let from = unit.tileIndex;
  let stop = 0;
  for (const p of path) {
    const cost = stepCost(state, unit, tiles[from], tiles[p]);
    if (mp < cost && mp < full) break;
    mp = Math.max(0, mp - cost);
    stop += 1;
    from = p;
    if (mp <= 0 || inEnemyZoc(state, p, unit)) break;
  }
  while (stop > 0 && stackedAt(state, unit, path[stop - 1])) stop -= 1;
  for (let i = 0; i < stop; i++) {
    if (stepUnit(state, unit, tiles[path[i]]) !== 'moved') return;
  }
}

/** a unit that holds its plot: no aircraft, no spy */
function onMap(u: Unit): boolean {
  const d = unitDomain(u.type);
  return d !== 'air' && d !== 'spy';
}

/** a unit of another player at war with the unit's on the plot (0x5862e0) */
export function enemyAt(state: GameState, unit: Unit, tile: number): boolean {
  return state.units.some((u) => u.tileIndex === tile && onMap(u) && unitsHostile(state, unit, u));
}

/** a unit of the unit's player on the plot that stacks with it, the unit
 *  itself counted (0x585eb0) */
export function stackedAt(state: GameState, unit: Unit, tile: number): boolean {
  const dom = unitDomain(unit.type);
  return state.units.some((u) => u.tileIndex === tile && u.seat === unit.seat && unitDomain(u.type) === dom);
}

/** the hex distance between two plots */
export function plotDistance(state: GameState, a: number, b: number): number {
  const ta = state.map.tiles[a];
  const tb = state.map.tiles[b];
  return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
}

/** TargetTypes, as the tactical target list types its entries */
export type TargetType = 'COMBAT_DISTRICT' | 'PASSIVE_DISTRICT' | 'CAMP' | 'GOODY' | 'TRADER' | 'CIVILIAN' | 'RELIGIOUS'
  | 'LOW' | 'MEDIUM' | 'HIGH' | 'IMPROVEMENT';

/** one entry of the tactical target list: its type, its plot, the player it
 *  belongs to (none for a camp, a goody hut or an improvement) and its unit */
export interface Target {
  type: TargetType;
  tile: number;
  seat: number;
  unit: Unit | null;
}

/** BARBARIAN_DEFENSE_ALL_UNITS / BARBARIAN_DEFENSE_RANGED_UNITS (GlobalParameters) */
const BARB_DEFENSE_ALL = 4;
const BARB_DEFENSE_RANGED = 1;

function rangedStrength(u: Unit): number {
  return UNITS[u.type]?.ranged?.strength ?? 0;
}

/**
 * THE TACTICAL TARGET LIST (0x783980) of `seat`: the plots in index order,
 * each one `seen` (visible) giving
 *  - a district of a player at war: a City Center or an Encampment as
 *    COMBAT_DISTRICT (and nothing else of the plot), a complete unpillaged
 *    other district as PASSIVE_DISTRICT;
 *  - its defending unit of a player at war (0x208b80) as LOW;
 *  - else the first of: a barbarian camp, a goody hut, a Trader at war, its
 *    one civilian at war (CIVILIAN), its religious unit at war (RELIGIOUS), an
 *    unpillaged improvement of a player at war (IMPROVEMENT);
 * and each one only `revealed` its camp, goody hut, improvement or districts.
 * Then a LOW unit stacked with a unit that cannot fight is MEDIUM (0x786d50),
 * and the barbarians' (0x786e70) make HIGH every LOW or MEDIUM unit within
 * BARBARIAN_DEFENSE_ALL_UNITS of one of their camps, or a ranged one within
 * its range + BARBARIAN_DEFENSE_RANGED_UNITS.
 */
export function tacticalTargets(state: GameState, seat: number, seen: ArrayLike<number>, revealed: ArrayLike<number> | null): Target[] {
  const { map } = state;
  const out: Target[] = [];
  const at = new Map<number, Unit[]>();
  for (const u of state.units) {
    if (!onMap(u)) continue;
    const l = at.get(u.tileIndex);
    if (l) l.push(u);
    else at.set(u.tileIndex, [u]);
  }
  const me = { seat };
  const hostile = (s: number) => s !== seat && s !== NO_SEAT && unitsHostile(state, me, { seat: s });
  const camps = new Set(state.barbSeat.camps);
  for (const t of map.tiles) {
    const vis = seen[t.index] === 1;
    if (!vis && !(revealed && revealed[t.index] === 1)) continue;
    const owner = tileSeat(t);
    let combat = false;
    if (t.district !== null) {
      combat = t.district === 'CITY_CENTER' || t.district === 'ENCAMPMENT';
      if (hostile(owner)) {
        if (combat) out.push({ type: 'COMBAT_DISTRICT', tile: t.index, seat: owner, unit: null });
        else if (t.districtComplete && !t.districtPillaged && DISTRICTS[t.district]?.countsTowardLimit) out.push({ type: 'PASSIVE_DISTRICT', tile: t.index, seat: owner, unit: null });
      }
    }
    if (!vis) {
      if (t.district !== null) continue;
      if (camps.has(t.index)) out.push({ type: 'CAMP', tile: t.index, seat: NO_SEAT, unit: null });
      else if (t.goodyHut) out.push({ type: 'GOODY', tile: t.index, seat: NO_SEAT, unit: null });
      else if (t.improvement !== null && !t.pillaged && hostile(owner)) out.push({ type: 'IMPROVEMENT', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    if (combat) continue;
    const here = at.get(t.index) ?? [];
    const fighters = here.filter((u) => unitDomain(u.type) === 'military' && unitsHostile(state, me, u) && unitVisibleTo(state, u, seat));
    if (fighters.length) {
      const d = stackDefender(state, fighters, false);
      out.push({ type: 'LOW', tile: t.index, seat: d.seat, unit: d });
      continue;
    }
    if (camps.has(t.index)) {
      out.push({ type: 'CAMP', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    if (t.goodyHut) {
      out.push({ type: 'GOODY', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    const traders = here.filter((u) => UNITS[u.type]?.trader && unitsHostile(state, me, u));
    if (traders.length) {
      for (const u of traders) out.push({ type: 'TRADER', tile: t.index, seat: u.seat, unit: u });
      continue;
    }
    const civs = here.filter((u) => unitIsNoncombat(u.type) && !UNITS[u.type]?.trader && !unitReligious(u.type));
    if (civs.length === 1 && civs[0].seat !== seat) {
      if (unitsHostile(state, me, civs[0])) out.push({ type: 'CIVILIAN', tile: t.index, seat: civs[0].seat, unit: civs[0] });
      continue;
    }
    const rel = here.filter((u) => unitReligious(u.type));
    if (rel.length === 1 && rel[0].seat !== seat) {
      if (unitsHostile(state, me, rel[0])) out.push({ type: 'RELIGIOUS', tile: t.index, seat: rel[0].seat, unit: rel[0] });
      continue;
    }
    if (t.improvement !== null && !t.pillaged && hostile(owner) && !t.goodyHut) {
      out.push({ type: 'IMPROVEMENT', tile: t.index, seat: NO_SEAT, unit: null });
    }
  }
  // a unit stacked with one that cannot fight
  for (const e of out) {
    if (e.type !== 'LOW') continue;
    const here = at.get(e.tile) ?? [];
    if (here.length > 1 && here.some((u) => !((UNITS[u.type]?.combat ?? 0) > 0) && rangedStrength(u) <= 0)) e.type = 'MEDIUM';
  }
  if (isBarbSeat(seat)) {
    for (const c of out) {
      if (c.type !== 'CAMP') continue;
      for (const e of out) {
        if ((e.type !== 'LOW' && e.type !== 'MEDIUM') || !e.unit) continue;
        const d = plotDistance(state, c.tile, e.tile);
        if (d <= BARB_DEFENSE_ALL) e.type = 'HIGH';
        else if (rangedStrength(e.unit) > 0 && d <= unitAttackRange(e.unit) + BARB_DEFENSE_RANGED) e.type = 'HIGH';
      }
    }
  }
  return out;
}

/** the unit's whole Movement in Movement points (0x56e130) */
function maxMoves(state: GameState, u: Unit): number {
  return Math.floor(unitFullMoves(state, u) / MP_SCALE);
}

/** the unit's attack range: 0 for a unit that fights in melee */
function rangeOf(u: Unit): number {
  return UNITS[u.type]?.ranged ? unitAttackRange(u) : 0;
}

/**
 * THE PLANNING'S TARGETS (0x792f90 at the planning, the spots 0x790c60): the
 * list's targets within 2 x the unit's Movement + its range of it, each with
 * whether the unit has a spot to strike it from within the planning's two
 * turns — a unit target or a COMBAT_DISTRICT only: in melee its plot in the
 * reach, at range a plot of the reach within range of it (in sight beyond 1).
 */
export function planTargets(state: GameState, unit: Unit, reach: readonly Reach[], targets: readonly Target[]):
  Map<Target, boolean> {
  const out = new Map<Target, boolean>();
  const range = rangeOf(unit);
  const lim = maxMoves(state, unit) * PLAN_TURNS + range;
  const inReach = new Set(reach.map((e) => e.tile));
  for (const e of targets) {
    if (plotDistance(state, unit.tileIndex, e.tile) > lim) continue;
    let spot = false;
    const struck = e.type === 'COMBAT_DISTRICT' || e.type === 'CIVILIAN' || e.type === 'LOW' || e.type === 'MEDIUM' || e.type === 'HIGH';
    if (struck) {
      if (range === 0 || e.type === 'CIVILIAN') spot = inReach.has(e.tile);
      else {
        const to = state.map.tiles[e.tile];
        spot = reach.some((r) => {
          if (r.attack) return false;
          const d = plotDistance(state, r.tile, e.tile);
          return d >= 1 && d <= range && (d === 1 || canSee(state.map, state.map.tiles[r.tile], to, false));
        });
      }
    }
    out.set(e, spot);
  }
  return out;
}

/** UnitAiTypes: a unit's AI type (unit +0x1c0) */
const AI_EXPLORE = 2;
const AI_COMBAT = 3;
const AI_DEFENDER = 4;

/** a barbarian unit's AI type: its tribe's camp defender DEFENDER while the
 *  camp stands (0x154830 turns the DEFENDER units of a fallen camp's tribe
 *  COMBAT), its scouts EXPLORE, a civilian none, every other COMBAT */
function aiTypeOf(state: GameState, u: Unit): number {
  if (unitDomain(u.type) !== 'military') return -1;
  const tr = tribeOf(state, u.id);
  if (tr?.alive && tr.defender === u.id) return AI_DEFENDER;
  if (tr?.scouts.includes(u.id)) return AI_EXPLORE;
  return AI_COMBAT;
}

/** WANDER NEAR CAMP's radius (0x77b9a0: the plots within 5 of the camp) */
const WANDER_CAMP_RANGE = 5;
/** DEFEND CAMPS' reach (0x779010 -> 0x774e90: within 3 turns) */
const DEFEND_CAMP_TURNS = 3;
/** the planning's breadth-first search (0x7920d0: two turns) */
const PLAN_TURNS = 2;

/** One pass's state: the units left, each one's planning reach, and those
 *  done (`0x570b40`). */
interface Pass {
  units: Unit[];
  reach: Map<number, Reach[]>;
  done: Set<number>;
  ai: Map<number, number>;
  /** the tactical target list as the pass began, and each unit's planning targets */
  targets: Target[];
  plan: Map<number, Map<Target, boolean>>;
}

/** the move that took the unit, as the game's tactical log names it, and
 *  the plot it went for (-1 none), for the replay's comparison */
let tacticsTrace: ((unit: Unit, move: string, plot: number) => void) | null = null;
export function traceTactics(fn: ((unit: Unit, move: string, plot: number) => void) | null): void {
  tacticsTrace = fn;
}

/** the unit whose move takes the draw being taken, for the replay's hold on
 *  the game's draws; null between draws */
let drawing: Unit | null = null;
export function tacticsDrawing(): Unit | null {
  return drawing;
}

function finish(pass: Pass, u: Unit, move: string, plot = -1): void {
  pass.done.add(u.id);
  tacticsTrace?.(u, move, plot);
}

const live = (state: GameState, pass: Pass, u: Unit) => !pass.done.has(u.id) && state.units.includes(u) && isBarbSeat(u.seat);

/**
 * DEFEND CAMPS (0x779010): each camp in plot order, the first DEFENDER in
 * pool order whose planning reaches it within 3 turns (0x774e90) goes to it
 * ("Barb. Camp Defense"), its turn done.
 */
function defendCamps(state: GameState, pass: Pass): void {
  for (const camp of [...state.barbSeat.camps].sort((a, b) => a - b)) {
    const u = pass.units.find((x) => live(state, pass, x) && pass.ai.get(x.id) === AI_DEFENDER
      && !!pass.reach.get(x.id)?.some((e) => e.tile === camp && e.turns <= DEFEND_CAMP_TURNS));
    if (!u) continue;
    if (u.tileIndex !== camp) moveTo(state, u, camp);
    finish(pass, u, 'Barb. Camp Defense', camp);
  }
}

/**
 * PILLAGE (0x77a810, Pillage District then Pillage Improvement): each
 * PASSIVE_DISTRICT target of the list, then each IMPROVEMENT one (0x783980),
 * still pillageable, in the list's order: the units in pool order whose
 * planning reaches it this turn (0x775340 for 1 turn) and that do not stand on such a
 * plot themselves (0x774380) go there, each one's turn done, until one stands
 * on it and pillages it (`hostilePillage`).
 */
function pillage(state: GameState, pass: Pass, districts: boolean): void {
  const { map } = state;
  for (const e of pass.targets) {
    if (e.type !== (districts ? 'PASSIVE_DISTRICT' : 'IMPROVEMENT')) continue;
    const t = map.tiles[e.tile];
    const owner = tileSeat(t);
    if (!isTerritorial(owner) || !unitsHostile(state, { seat: BARB_SEAT }, { seat: owner })) continue;
    const ok = districts
      ? t.district !== null && t.district !== 'CITY_CENTER' && t.district !== 'ENCAMPMENT' && t.districtComplete && !t.districtPillaged
      : t.improvement !== null && !t.pillaged && !!IMPROVEMENTS[t.improvement as ImprovementId];
    if (!ok) continue;
    for (const u of pass.units) {
      if (!live(state, pass, u) || pass.ai.get(u.id) === undefined || pass.ai.get(u.id)! < AI_EXPLORE) continue;
      if (!pass.reach.get(u.id)?.some((e) => e.tile === t.index && e.turns <= 1)) continue;
      if (u.tileIndex !== t.index) {
        const here = map.tiles[u.tileIndex];
        if (!districts && here.improvement !== null) continue;
        if (districts && here.district !== null) continue;
        moveTo(state, u, t.index);
      }
      const there = u.tileIndex === t.index;
      if (there && hostilePillage(state, u)) dropHeldCosts();
      finish(pass, u, districts ? 'Pillage District' : 'Pillage Improvement', t.index);
      if (there) break;
    }
  }
}

/** the planning's targets of a unit (0x792f90), taken from the pass's target
 *  list and the unit's reach as they stood when the pass began */
function planOf(state: GameState, pass: Pass, u: Unit): Map<Target, boolean> {
  let p = pass.plan.get(u.id);
  if (!p) pass.plan.set(u.id, (p = planTargets(state, u, pass.reach.get(u.id) ?? [], pass.targets)));
  return p;
}

/** a unit of a player at war with the unit holds the plot to fight it (0x208b80) */
function defenderAt(state: GameState, unit: Unit, p: number): boolean {
  return state.units.some((x) => x.tileIndex === p && onMap(x) && unitDomain(x.type) === 'military' && unitsHostile(state, unit, x));
}

/**
 * AN ATTACK ON A TARGET (0x771670) by one unit: a civilian, a Trader or a
 * religious unit it moves onto; a target a fighter holds, or a City Center or
 * Encampment, a ranged unit strikes from where it stands, else from the first
 * plot of its planning reach of this turn with Movement left within its range
 * and none of its own stacking there (0x585eb0) it moves to first; else it
 * goes for the target's plot with the attack flag (`moveTo`).
 */
function strike(state: GameState, pass: Pass, u: Unit, e: Target): void {
  const T = e.tile;
  const range = rangeOf(u);
  const fight = e.type === 'COMBAT_DISTRICT' || defenderAt(state, u, T);
  if (fight && range > 0) {
    if (plotDistance(state, u.tileIndex, T) > range) {
      const spot = (pass.reach.get(u.id) ?? []).find((r) => r.turns === 1 && r.moves > 0 && !r.attack
        && plotDistance(state, r.tile, T) <= range && !stackedOther(state, u, r.tile));
      if (spot) moveTo(state, u, spot.tile);
    }
    if (state.units.includes(u) && plotDistance(state, u.tileIndex, T) <= range && u.movesLeft > 0 && attacksLeftOf(u) > 0) {
      hostileRangedStrike(state, u, T);
    }
    return;
  }
  moveTo(state, u, T);
}

/** a unit of the unit's player on the plot that stacks with it, the unit
 *  itself not counted */
function stackedOther(state: GameState, unit: Unit, tile: number): boolean {
  const dom = unitDomain(unit.type);
  return state.units.some((u) => u !== unit && u.tileIndex === tile && u.seat === unit.seat && unitDomain(u.type) === dom);
}

/** the city a rampaging tribe's unit with no target heads for (0x1479e0): of
 *  the cities its raid, then its assault, waited for that the player holds,
 *  the nearest its camp within 16, else the player's nearest (0x93d570) */
const CHASE_RANGE = 16;
function chaseCity(state: GameState, tr: BarbTribe, P: number): number {
  let best = -1;
  let bd = CHASE_RANGE + 1;
  for (const c of [...(tr.raidTargets ?? []), ...(tr.assaultTargets ?? [])]) {
    if (c.seat !== P || !state.map.tiles[c.plot] || tileSeat(state.map.tiles[c.plot]) !== P) continue;
    const d = plotDistance(state, tr.plot, c.plot);
    if (d < bd) { bd = d; best = c.plot; }
  }
  if (best >= 0) return best;
  bd = CHASE_RANGE + 1;
  for (const c of cityCentresOf(state, P)) {
    const d = plotDistance(state, tr.plot, c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function cityCentresOf(state: GameState, P: number): number[] {
  if (isCityStateSeat(P)) return state.cityStates.filter((c) => c.seat === P && c.centerIndex >= 0).map((c) => c.centerIndex);
  return (seatOf(state, P) as { cities?: { centerIndex: number }[] } | undefined)?.cities?.map((c) => c.centerIndex) ?? [];
}

/**
 * BARBARIAN RAMPAGE (0x778b40): each unit, in pool order, of a tribe whose
 * camp a player's unit took (0x152df0) goes after that player's targets among
 * its planning's: a target it has a spot to strike from before any it has
 * none for, then the nearest it (the list's first of equals), struck
 * (`strike`); with none, it heads for the city of that player its tribe goes
 * after (`chaseCity`): to the first plot of its reach of this turn within
 * its range (1 at least) of the city with none of its own stacking there
 * (0x775c60), its turn done; with no such plot it stays for the moves after.
 */
function rampage(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const tr = tribeOf(state, u.id);
    if (!tr || tr.alive || tr.rampage === undefined) continue;
    const P = tr.rampage;
    let best: Target | null = null;
    let bestSpot = false;
    let bestD = 0;
    for (const [e, spot] of planOf(state, pass, u)) {
      if (e.seat !== P) continue;
      const d = plotDistance(state, e.tile, u.tileIndex);
      if (best && bestSpot && d >= bestD) continue;
      if (spot) {
        best = e; bestSpot = true; bestD = d;
        continue;
      }
      if (best && (bestSpot || bestD <= d)) continue;
      best = e; bestD = d;
    }
    if (best) {
      strike(state, pass, u, best);
      finish(pass, u, 'Barbarian Rampage', best.tile);
      continue;
    }
    const city = chaseCity(state, tr, P);
    if (city < 0) continue;
    const r = Math.max(1, rangeOf(u));
    const spot = (pass.reach.get(u.id) ?? []).find((x) => x.turns === 1
      && plotDistance(state, x.tile, city) <= r && !stackedOther(state, u, x.tile));
    if (!spot) continue;
    moveTo(state, u, spot.tile);
    finish(pass, u, 'Chasing target', spot.tile);
  }
}

/** a unit that can still act this turn (0x56c690) */
function canAct(state: GameState, pass: Pass, u: Unit): boolean {
  return live(state, pass, u) && u.movesLeft > 0;
}

/**
 * THE UNITS THAT CAN REACH A PLOT (0x775340), in pool order: each unit left
 * with a strength to fight with whose planning reach holds the plot within
 * `turns` turns; a camp's DEFENDER goes in only before another unit.
 */
function reachers(state: GameState, pass: Pass, plot: number, turns: number): Unit[] {
  const out: Unit[] = [];
  let held: Unit | null = null;
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const def = UNITS[u.type];
    if (!def || (def.combat <= 0 && rangedStrength(u) <= 0 && def.bombard === undefined)) continue;
    if (!(pass.reach.get(u.id) ?? []).some((e) => e.tile === plot && e.turns <= turns)) continue;
    if (pass.ai.get(u.id) === AI_DEFENDER && !out.length) {
      held = u;
      continue;
    }
    if (held) {
      out.push(held);
      held = null;
    }
    out.push(u);
  }
  return out;
}

/**
 * ATTACK CIVILIANS (0x779240): each CIVILIAN target of the list, the units
 * whose planning reaches its plot within two turns (`reachers`) go for it in
 * their order (0x773270) — each that can act moves onto it with the attack
 * flag, a melee one's turn then done, until the civilian is taken; then each
 * ranged one within its range strikes it.
 */
function attackCivilians(state: GameState, pass: Pass): void {
  for (const e of pass.targets) {
    const v = e.unit;
    if (e.type !== 'CIVILIAN' || !v || !state.units.includes(v)) continue;
    const at = v.tileIndex;
    const cands = reachers(state, pass, at, PLAN_TURNS);
    if (!cands.length) continue;
    const taken = () => !state.units.includes(v) || v.seat !== e.seat || v.tileIndex !== at;
    let gone = false;
    for (const u of cands) {
      if (!canAct(state, pass, u)) continue;
      moveTo(state, u, at);
      if (rangeOf(u) === 0) finish(pass, u, 'Attack Civilian', at);
      if (taken()) { gone = true; break; }
    }
    if (gone) continue;
    for (const u of cands) {
      if (!canAct(state, pass, u) || rangeOf(u) === 0) continue;
      if (plotDistance(state, u.tileIndex, at) > rangeOf(u)) continue;
      if (attacksLeftOf(u) > 0) hostileRangedStrike(state, u, at);
      finish(pass, u, 'Attack Civilian', at);
    }
  }
}

/**
 * PLUNDER TRADER (0x77aa20): each TRADER target of the list, the units whose
 * planning reaches its plot this turn (`reachers`) go for it in their order
 * (0x7746a0) — each that can act moves onto it, plundering it, its turn done,
 * until one stands on its plot.
 */
function plunderTraders(state: GameState, pass: Pass): void {
  for (const e of pass.targets) {
    if (e.type !== 'TRADER') continue;
    for (const u of reachers(state, pass, e.tile, 1)) {
      if (!canAct(state, pass, u)) continue;
      moveTo(state, u, e.tile);
      finish(pass, u, 'Plunder Trader', e.tile);
      if (state.units.includes(u) && u.tileIndex === e.tile) break;
    }
  }
}

/** CHASE TARGET's reach of a target (0x775170, 8 plots) */
const CHASE_SIGHT = 8;

/**
 * CHASE TARGET (0x775670, 0x773030): each land unit left, in pool order,
 * takes the LOW target of the list (0x775170) standing where it does, else
 * the last within 8 of it whose plot its planning reaches within two turns,
 * and moves to the first plot of its reach of this turn within its range (1
 * at least) of the target with none of its own stacking there (0x775c60),
 * its turn done; with no such plot it stays for the moves after.
 */
function chaseTarget(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || UNITS[u.type]?.naval) continue;
    const reach = pass.reach.get(u.id) ?? [];
    let tgt = -1;
    for (const e of pass.targets) {
      if (e.type !== 'LOW') continue;
      const d = plotDistance(state, e.tile, u.tileIndex);
      if (d === 0) { tgt = e.tile; break; }
      if (d >= CHASE_SIGHT) continue;
      if (reach.some((r) => r.tile === e.tile && r.turns <= PLAN_TURNS)) tgt = e.tile;
    }
    if (tgt < 0) continue;
    const r = Math.max(1, rangeOf(u));
    const spot = reach.find((x) => x.turns === 1 && plotDistance(state, x.tile, tgt) <= r
      && !stackedOther(state, u, x.tile));
    if (!spot) continue;
    moveTo(state, u, spot.tile);
    finish(pass, u, 'Chase Target', tgt);
  }
}

/**
 * WANDER NEAR CAMP (0x77b9a0): each unit of AI type above EXPLORE whose
 * tribe's camp stands: of its planning reach, the plots of this turn with no
 * unit at war with it (0x5862e0), none of its own stacking with it (0x585eb0),
 * within 5 of the camp and, where the camp's plot is a city's, of that
 * city's; ONE "Random Direction" draw over their count picks the plot it
 * moves to ("Wander"); with none it heads for its camp ("Wander Back to
 * Camp"). Its turn is done.
 */
function wanderNearCamp(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || (pass.ai.get(u.id) ?? -1) <= AI_EXPLORE) continue;
    const tr = tribeOf(state, u.id);
    if (!tr?.alive) continue;
    const camp = state.map.tiles[tr.plot];
    const campCity = tileSeat(camp) === NO_SEAT ? -1 : tileCity(camp);
    const cands = (pass.reach.get(u.id) ?? []).filter((e) => {
      if (e.turns !== 1 || enemyAt(state, u, e.tile) || stackedAt(state, u, e.tile)) return false;
      if (plotDistance(state, tr.plot, e.tile) > WANDER_CAMP_RANGE) return false;
      const t = state.map.tiles[e.tile];
      return campCity === -1 || (tileSeat(t) === tileSeat(camp) && tileCity(t) === campCity);
    });
    drawing = u;
    const to = cands.length ? cands[randRange(state, cands.length, 'Random Direction')].tile : tr.plot;
    drawing = null;
    moveTo(state, u, to);
    finish(pass, u, cands.length ? 'Wander' : 'Wander Back to Camp', to);
  }
}

/** the units a stand-in still moves, at the game's moves not yet ported: one
 *  an operation took (its raid), one with a target beside it (Attack Units),
 *  a scout (Explore) */
function standIn(state: GameState, pass: Pass, move: string, pick: (u: Unit, tr: BarbTribe | undefined) => boolean): void {
  // the stand-in walks the units in the order the engine made them
  const mine = new Set(pass.units);
  for (const u of state.units.filter((x) => mine.has(x))) {
    if (!live(state, pass, u) || u.movesLeft <= 0) continue;
    if (!pick(u, tribeOf(state, u.id))) continue;
    const here = state.map.tiles[u.tileIndex];
    const was = `${here.pillaged}:${here.districtPillaged}`;
    hostileUnitAct(state, u);
    if (`${here.pillaged}:${here.districtPillaged}` !== was) dropHeldCosts();
    finish(pass, u, move);
  }
}

/**
 * THE BARBARIANS' TACTICAL PASS (TacticalAI 0x771530 over Tactics.xml's
 * "Default Barbarian" and "Default Barbarian HL" lists) for the units that
 * stood before their camps raised this turn's (a unit raised this turn acts
 * from the next): the units in their pool's order (`slot`), each one's
 * planning reach taken before any moves (0x792c90), then the moves in the
 * list's order, each walking the units the moves before it left.
 */
export function barbarianTactics(state: GameState, acting: ReadonlySet<number>): void {
  costsHeld = new Map();
  try {
    tacticalPass(state, acting);
  } finally {
    costsHeld = null;
  }
}

function tacticalPass(state: GameState, acting: ReadonlySet<number>): void {
  const units = state.units.filter((u) => isBarbSeat(u.seat) && acting.has(u.id))
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const ai = new Map<number, number>();
  for (const u of units) ai.set(u.id, aiTypeOf(state, u));
  const reach = new Map<number, Reach[]>();
  for (const u of units) if (ai.get(u.id)! >= AI_EXPLORE) reach.set(u.id, reachPlots(state, u, PLAN_TURNS));
  const seen = plotsSeenNow(state, new Set([BARB_SEAT]));
  const ex = state.barbSeat.explored;
  const targets = tacticalTargets(state, BARB_SEAT, seen, ex.length ? ex : null);
  const pass: Pass = { units, reach, done: new Set(), ai, targets, plan: new Map() };
  // an operation's units are the operation's, not the pass's
  const opUnits = new Set<number>();
  for (const tr of state.barbTribes ?? []) for (const id of tr.op?.units ?? []) opUnits.add(id);
  standIn(state, pass, 'Operation', (u) => opUnits.has(u.id));
  for (const id of opUnits) pass.done.add(id);
  rampage(state, pass);
  // Attack High Priority
  standIn(state, pass, 'Attack Units', (u) => (pass.ai.get(u.id) ?? -1) >= AI_COMBAT && attackTargets(state, u).length > 0);
  defendCamps(state, pass);
  attackCivilians(state, pass);
  plunderTraders(state, pass);
  pillage(state, pass, true);
  pillage(state, pass, false);
  chaseTarget(state, pass);
  wanderNearCamp(state, pass);
  // Explore Land (the homeland list)
  standIn(state, pass, 'HL: Explore', (u) => pass.ai.get(u.id) === AI_EXPLORE);
  // End Turn: the rest stand
  for (const u of pass.units) if (live(state, pass, u)) finish(pass, u, 'HL: End Turn');
}

/** THE ACTION REPLAY'S HOLD on the barbarians' turn: the replay lands the
 *  other players' actions of the turn after the engine's turn, and the
 *  barbarians close the turn after those actions, so the replay runs their
 *  turn there (`barbarianTurn` in cpu/harness/replay.ts); the hold takes the
 *  engine's barbarian turn. Null outside a replay. */
let barbHold: ((state: GameState) => void) | null = null;
let barbRelease: ((state: GameState) => void) | null = null;
export function holdBarbarians(fn: ((state: GameState) => void) | null, release: ((state: GameState) => void) | null = null): void {
  barbHold = fn;
  barbRelease = release;
}

/** the hold's second half, once the turn's end (its random events, its
 *  climate) has struck the map the barbarians' turn left: what the hold
 *  keeps of their units leaves the engine's turn there. Nothing outside a
 *  replay. */
export function releaseBarbarians(state: GameState): void {
  barbRelease?.(state);
}

/** each barbarian's Movement and attacks at the start of its turn */
export function refreshBarbarians(state: GameState): void {
  for (const u of state.units) {
    if (!isBarbSeat(u.seat)) continue;
    u.movesLeft = unitFullMoves(state, u) + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
    u.attacksLeft = attacksPerTurn(u);
  }
}

/**
 * THE BARBARIANS' TURN: their unit pool (`barbSlots`), the game's rules for
 * them (`barbarianRules`: their techs, the camp step, each tribe's turn), their
 * units' AI (`barbarianTactics`), then their operations (`barbarianOps`).
 */
export function barbarianPhase(state: GameState): void {
  if (barbHold) {
    barbHold(state);
    return;
  }
  barbSlots(state);
  const acting = new Set(state.units.filter((u) => isBarbSeat(u.seat)).map((u) => u.id));
  barbarianRules(state, state.turn);
  barbSlots(state);
  refreshBarbarians(state);
  barbarianTactics(state, acting);
  barbarianOps(state);
  barbSlotsDying(state);
}
