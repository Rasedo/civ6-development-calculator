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
import { IMPROVEMENTS } from '../data/improvements';
import {
  cliffBlocksStep, encampmentBlocks, inEnemyZoc, stepCost, stepUnit, unitDomain, unitFullMoves, unitsHostile,
  waterEnterable,
} from './units';
import { BARB_SEAT, NO_SEAT, isBarbSeat, isTerritorial, tileCity, tileSeat } from './seats';
import { randRange } from './rand';
import { attackTargets, hostilePillage, hostileUnitAct } from './combat';
import { barbarianOps, barbarianRules, barbSlots, barbSlotsDying, plotsSeenNow, tribeOf } from './barbarians';
import { generalAuraMP } from './aura';
import { attacksPerTurn } from './promotions';
import type { BarbTribe, ImprovementId } from './types';

/** the pathfinder's fixed point: one Movement is 256 */
const FIX = 256;

/** One plot the pathfinder closed: its plot, the turn it is reached on (1 =
 *  this turn) and the Movement left there, in 1/256. */
export interface Reach {
  tile: number;
  turns: number;
  moves: number;
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
function groundOf(state: GameState, unit: Unit): { enter: (t: Tile) => boolean; zoc: (t: Tile) => boolean } {
  const held = new Set<number>();
  for (const u of state.units) if (u.seat !== unit.seat && onMap(u)) held.add(u.tileIndex);
  const centres = new Set(state.cityStates.map((c) => c.centerIndex));
  const enters = new Map<number, boolean>();
  const zocs = new Map<number, boolean>();
  return {
    enter: (t) => {
      let v = enters.get(t.index);
      if (v === undefined) enters.set(t.index, (v = enterable(state, unit, t, held, centres)));
      return v;
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
    const from = map.tiles[best.tile];
    for (let di = 0; di < DIRECTION_TYPES.length; di++) {
      const d = DIRECTION_TYPES[di];
      const to = neighborTile(map, from, d);
      if (!to || !ground.enter(to) || cliffBlocksStep(state, from, to, unit)) continue;
      let pm = best.moves;
      let turns = best.turns;
      if (pm <= 0) {
        turns += 1;
        pm = full;
      }
      let cost = Math.floor(stepCostHeld(state, unit, from, to, di, held) * FIX / MP_SCALE);
      let moves = pm - cost;
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
      if (turns > maxTurns) continue;
      const ends = moves <= 0 ? 4 + (tileSeat(to) !== unit.seat ? 3 : 0) : 0;
      const g = best.g + cost * 1000 + (ends + 2) * FIX;
      const c = nodes.get(to.index);
      if (!c) {
        const n: PNode = { tile: to.index, g, tie: 0, moves, turns, closed: false, parent: best };
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
    out.push({ tile: n.tile, turns: n.turns, moves: n.moves });
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
  const { tiles } = state.map;
  const path = pathTo(state, unit, dest);
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
 * pillageable plot the barbarians see of a player they fight — a complete
 * district not a city centre or Encampment, then an improvement — in plot
 * order (the target list 0x783980), the units in pool order whose planning
 * reaches it this turn (0x775340 for 1 turn) and that do not stand on such a
 * plot themselves (0x774380) go there, each one's turn done, until one stands
 * on it and pillages it (`hostilePillage`).
 */
function pillage(state: GameState, pass: Pass, seen: Uint8Array, districts: boolean): void {
  const { map } = state;
  for (const t of map.tiles) {
    if (!seen[t.index]) continue;
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

/** the units a stand-in still moves, at the game's moves not yet read
 *  (docs/AUDIT.md C-95): one an operation took (its raid), one of a tribe
 *  whose camp fell (Barbarian Rampage), one with a target beside it (Attack
 *  Units), a scout (Explore) */
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
  const pass: Pass = { units, reach, done: new Set(), ai };
  // an operation's units are the operation's, not the pass's
  const opUnits = new Set<number>();
  for (const tr of state.barbTribes ?? []) for (const id of tr.op?.units ?? []) opUnits.add(id);
  standIn(state, pass, 'Operation', (u) => opUnits.has(u.id));
  for (const id of opUnits) pass.done.add(id);
  // Barbarian Rampage
  standIn(state, pass, 'Barbarian Rampage', (u, tr) => (pass.ai.get(u.id) ?? -1) >= AI_COMBAT && !!tr && !tr.alive);
  // Attack High Priority
  standIn(state, pass, 'Attack Units', (u) => (pass.ai.get(u.id) ?? -1) >= AI_COMBAT && attackTargets(state, u).length > 0);
  defendCamps(state, pass);
  const seen = plotsSeenNow(state, new Set([BARB_SEAT]));
  pillage(state, pass, seen, true);
  pillage(state, pass, seen, false);
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
