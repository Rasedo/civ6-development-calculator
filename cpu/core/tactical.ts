/**
 * THE GAME'S UNIT AI: the unit pathfinder's reach and path, and the tactical
 * pass a player's units take (GameCore_XP2 TacticalAI;
 * tools/civ6lab/dll_readings.md "C-95: the unit pathfinder and the
 * planning's reach", "C-95: the tactical pass", "C-96: the city-states'
 * tactical pass"). The barbarians' turn runs it for their units
 * (`barbarianPhase`), a city-state's turn for its own (`cityStateTactics`),
 * the Free Cities' turn for theirs (`freeCityTactics`).
 */
import type { City, CityState, GameState, Tile, Unit } from './types';
import { DIRECTION_TYPES, axialToOffset, hexDistance, neighborTile, offsetToAxial, tileAt, tilesWithin } from '../../world/hex';
import { isCoastalLand, isImpassable, isWater } from '../../world/query';
import { COMBAT_BOMBARD_VS_UNIT, COST_MULTIPLIER_PCT, MP_SCALE } from '../data/constants';
import { UNITS, UNIT_HP } from '../data/units';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import {
  canEmbark, cliffBlocksStep, encampmentBlocks, inEnemyZoc, stepCost, stepUnit, unitDomain, unitFullMoves, unitIsNoncombat, unitReligious,
  unitsHostile, unitVisibleTo,
  waterEnterable,
} from './units';
import { BARB_SEAT, FREE_SEAT, NO_SEAT, cityHolders, civsAtWar, isBarbSeat, isCityStateSeat, isCiv, isTerritorial, seatOf, tileCity, tileSeat } from './seats';
import { OPEN_BORDERS_CIVIC } from '../data/seats';
import { randRange } from './rand';
import { cityDefenseStrength, cityStrikeStrength, coastalRaid, damageExpected, hostilePillage, hostileRangedStrike, hostileUnitAct, meleeAttack, meleeUnitStrengths, rangedUnitStrengths, stackDefender, unitAttackRange } from './combat';
import { CITY_STRIKE_RANGE } from './phase';
import { outerPool } from './rules';
import { cityStateAt, minorCity } from './cityStates';
import { irradiated } from './nuclear';
import { canSee, unitSight } from './fog';
import { barbarianScouts, barbarianRules, barbSlots, barbSlotsDying, opTurn, plotsSeenNow, poolDying, poolSlots, ringPlots, tribeOf } from './barbarians';
import { RAID_HOME_RANGE, RAID_HOME_SPREAD, RAID_MARCH_RANGE, RAID_MARCH_SPREAD, RAID_RANGE, RAID_SCORE, RAID_TURNS } from '../data/barbarians';
import { generalAuraMP } from './aura';
import { attacksLeftOf, attacksPerTurn } from './promotions';
import type { BarbOp, BarbTribe, ImprovementId } from './types';

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
 *  engine's ground): no mountain or impassable plot; its domain's ground —
 *  a land unit's water too where its player may embark it (`canEmbark`); no
 *  unit of a player at war with it (an aircraft or a spy holds no plot) —
 *  another player's unit it passes, never ending there (`groundOf`'s
 *  `stand`); no city centre but its own, no live enemy Encampment; its own
 *  units it walks through */
function enterable(state: GameState, unit: Unit, t: Tile, foes: ReadonlySet<number>,
  embarks: boolean): boolean {
  if (isImpassable(t)) return false;
  const naval = !!UNITS[unit.type]?.naval;
  if (isWater(t) !== naval && !(embarks && isWater(t))) return false;
  if (isWater(t) && !waterEnterable(state, t, unit)) return false;
  if (foes.has(t.index)) return false;
  if (t.district === 'CITY_CENTER' && tileSeat(t) !== unit.seat) return false;
  return !encampmentBlocks(state, t, unit);
}

/** a major's territory closed to a city-state's unit: the major holds the
 *  open-borders civic (Early Empire) and is not at war with it — the planning
 *  of a city-state's units leaves such plots out (runs/h1_duelw1117 t32-37:
 *  city-state 4's Warriors' AI_Planning.csv rows never take China's (32,11)
 *  and (33,10) beside its own plots) */
function majorClosedToMinor(state: GameState, seat: number, t: Tile): boolean {
  const owner = tileSeat(t);
  if (!isCiv(owner)) return false;
  return !!seatOf(state, owner)?.research.civics.includes(OPEN_BORDERS_CIVIC) && !civsAtWar(state, seat, owner);
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
 *  ground holds still while the pathfinder runs; `stand`, may the unit end
 *  its move there — no other player's unit on it (the list's 0x586900) */
interface Ground {
  enter: (t: Tile) => boolean;
  zoc: (t: Tile) => boolean;
  attack: (t: Tile) => boolean;
  known: (i: number) => boolean;
  stand: (i: number) => boolean;
}

function groundOf(state: GameState, unit: Unit, revealedOnly = true): Ground {
  const held = new Set<number>();
  const foes = new Set<number>();
  for (const u of state.units) {
    if (u.seat === unit.seat || !onMap(u)) continue;
    held.add(u.tileIndex);
    if (unitsHostile(state, unit, u)) foes.add(u.tileIndex);
  }
  const enters = new Map<number, boolean>();
  const zocs = new Map<number, boolean>();
  const ex = seatOf(state, unit.seat)?.explored;
  // the breadth-first lists keep only the plots the player revealed; a path
  // (`revealedOnly` false) takes any
  const known = (i: number) => !revealedOnly || !ex || ex.length === 0 || ex[i] === 1;
  const def = UNITS[unit.type];
  const melee = !!def && def.combat > 0;
  const naval = !!def?.naval;
  // the barbarians' land units plan no water (none of 6,269 of their planning
  // rows on runs/h1_duelw1117, 1121 and 1124 holds a water plot; a major's
  // and a city-state's do from their Shipbuilding, AI_Planning.csv)
  const embarks = canEmbark(state, unit) && !isBarbSeat(unit.seat);
  const minor = isCityStateSeat(unit.seat);
  return {
    known,
    stand: (i) => !held.has(i),
    enter: (t) => {
      let v = enters.get(t.index);
      if (v === undefined) {
        enters.set(t.index, (v = known(t.index) && enterable(state, unit, t, foes, embarks)
          && !(minor && majorClosedToMinor(state, unit.seat, t))));
      }
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
 * search stops where it answers true. `onLink` sees each link the search
 * prices (the cost callback 0x26d6f0): the plot, the plot it is linked from,
 * the turn and Movement the step reaches it with, and whether it attacks —
 * the start first, linked from itself.
 */
function search(state: GameState, unit: Unit, maxTurns: number, zoc: boolean, onClose: (n: PNode, ground: Ground) => boolean,
  onLink?: (tile: number, from: number, turns: number, moves: number, attack: boolean) => void): void {
  const { map } = state;
  const ground = groundOf(state, unit, !zoc);
  const held = heldCostsOf(state, unit);
  const nodes = new Map<number, PNode>();
  // a turn starts on the full Movement of the domain its plot holds the unit
  // in: embarked on water, a land unit's own pool ashore
  const naval = !!UNITS[unit.type]?.naval;
  const fullLand = Math.floor(unitFullMoves(state, naval ? unit : { ...unit, embarked: false }) * FIX / MP_SCALE);
  const fullSea = Math.floor(unitFullMoves(state, naval ? unit : { ...unit, embarked: true }) * FIX / MP_SCALE);
  const unmoved = unit.movesLeft >= (unit.movesFull ?? unitFullMoves(state, unit));
  const start: PNode = { tile: unit.tileIndex, g: 0, tie: 0, moves: Math.floor(unit.movesLeft * FIX / MP_SCALE),
    turns: 1, closed: false, parent: null };
  nodes.set(start.tile, start);
  // the start is priced too, linked from itself
  onLink?.(start.tile, start.tile, start.turns, start.moves, false);
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
    if (onClose(best, ground)) break;
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
        pm = !naval && isWater(from) ? fullSea : fullLand;
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
      onLink?.(to.index, best.tile, turns, moves, attack);
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
  search(state, unit, maxTurns, false, (n, ground) => {
    // a plot another player's unit holds the unit only passes (0x586900)
    if (n.attack || ground.stand(n.tile)) out.push({ tile: n.tile, turns: n.turns, moves: n.moves, attack: !!n.attack });
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
 *  but stops short of a plot of its own unit that stacks with it. A path
 *  ending on a plot it attacks into stops at its side, and with `strike`
 *  the unit strikes it there. */
export function moveTo(state: GameState, unit: Unit, dest: number, strike = true): void {
  let path = pathTo(state, unit, dest);
  // a path ending on a plot it attacks into: it walks to its side, and
  // strikes it where its Movement and attacks last (the order's attack flag)
  const last = path.length ? path[path.length - 1] : -1;
  const into = last >= 0 && attackPlot(state, unit, last);
  if (into) path = path.slice(0, -1);
  walk(state, unit, path);
  if (into && strike && unit.movesLeft > 0 && attacksLeftOf(unit) > 0 && state.units.includes(unit)
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
  while (stop > 0 && (stackedAt(state, unit, path[stop - 1]) || foreignAt(state, unit, path[stop - 1]))) stop -= 1;
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

/** a unit of another player than the unit's on the plot (an aircraft or a
 *  spy holds none) */
function foreignAt(state: GameState, unit: Unit, tile: number): boolean {
  return state.units.some((u) => u.tileIndex === tile && u.seat !== unit.seat && onMap(u));
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
export type TargetType = 'FRIENDLY_CITY' | 'COMBAT_DISTRICT' | 'PASSIVE_DISTRICT' | 'CAMP' | 'GOODY' | 'TRADER' | 'CIVILIAN'
  | 'RELIGIOUS' | 'LOW' | 'MEDIUM' | 'HIGH' | 'IMPROVEMENT';

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
 *  - a district of its own as FRIENDLY_CITY; of a player at war a City
 *    Center or an Encampment as COMBAT_DISTRICT (and nothing else of the
 *    plot), a complete unpillaged other district as PASSIVE_DISTRICT;
 *  - its defending unit of a player at war (0x208b80) as LOW;
 *  - else the first of: a barbarian camp, a goody hut, a Trader at war, its
 *    one civilian at war (CIVILIAN), its religious unit at war (RELIGIOUS), an
 *    unpillaged improvement of a player at war (IMPROVEMENT);
 * and each one only `revealed` its camp, goody hut, improvement or districts.
 * Then a LOW unit stacked with a unit that cannot fight is MEDIUM (0x786d50),
 * and the player's prioritization (TacticalAI +0xa8) runs: the barbarians'
 * (0x786e70) make HIGH every LOW or MEDIUM unit within
 * BARBARIAN_DEFENSE_ALL_UNITS of one of their camps, or a ranged one within
 * its range + BARBARIAN_DEFENSE_RANGED_UNITS; every other player's (0x787000)
 * takes each FRIENDLY_CITY entry in list order and makes HIGH each LOW or
 * MEDIUM unit that threatens it — one with a ranged or bombard strength
 * within its range of the plot, any other nearer than twice its Movement.
 * (An ALLY_SUPPORT entry, a district of an ally, makes them MEDIUM: a
 * city-state and the Free Cities hold no ally.)
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
    if (owner === seat && t.district !== null) {
      out.push({ type: 'FRIENDLY_CITY', tile: t.index, seat, unit: null });
    }
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
  } else {
    for (const c of out) {
      if (c.type !== 'FRIENDLY_CITY') continue;
      for (const e of out) {
        if ((e.type !== 'LOW' && e.type !== 'MEDIUM') || !e.unit) continue;
        const d = plotDistance(state, e.unit.tileIndex, c.tile);
        const shoots = rangedStrength(e.unit) > 0 || (UNITS[e.unit.type]?.bombard ?? 0) > 0;
        if (shoots ? d <= unitAttackRange(e.unit) : d < 2 * maxMoves(state, e.unit)) e.type = 'HIGH';
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

/** One spot of a planning target (0x790c60): the plot the unit would strike
 *  the target from, the turn the blow would fall on, and the target's
 *  predicted blow back on the unit standing there (0x791470): the damage the
 *  unit takes, the damage the target takes. */
export interface Spot {
  tile: number;
  turns: number;
  backTaken: number;
  backDealt: number;
}

/** One planning target (the planner's 0xd0 entries): the list's target, its
 *  spots (six at most) and the predicted blow from where the unit stands
 *  (0x791470): the damage dealt and taken. */
export interface PlanEntry {
  target: Target;
  spots: Spot[];
  dealt: number;
  taken: number;
}

/** A unit's planning (AI Unit Planning 0x792c90): its reach, its targets,
 *  and whether a predicted blow of it kills (+0x60). */
export interface Planner {
  reach: Reach[];
  entries: PlanEntry[];
  wins: boolean;
}

/** the targets a unit strikes or takes */
const STRUCK = new Set<TargetType>(['COMBAT_DISTRICT', 'CIVILIAN', 'LOW', 'MEDIUM', 'HIGH']);
const UNIT_TARGET = new Set<TargetType>(['CIVILIAN', 'LOW', 'MEDIUM', 'HIGH']);
const FIGHTER_TARGET = new Set<TargetType>(['LOW', 'MEDIUM', 'HIGH']);

/** a unit's health in the AI's reckoning (0x56e0d0 less its damage) */
function healthOf(u: Unit): number {
  return u.hp;
}

/** a unit with a strength to fight with (0x56dc90, 0x56e3e0, 0x56daa0) */
function canFight(u: Unit): boolean {
  const def = UNITS[u.type];
  return !!def && (def.combat > 0 || rangedStrength(u) > 0 || def.bombard !== undefined);
}

/** a target's unit, still on the map */
function targetUnit(state: GameState, e: Target): Unit | null {
  return e.unit && state.units.includes(e.unit) ? e.unit : null;
}

/** THE COMBAT PREDICTION (0x791470's simulation, Rules_Combat under the
 *  simulation flag): the blow `attacker` would strike `defender` on `at`
 *  with, from where it stands — the damage it deals and the damage it takes
 *  (none at range, none from an embarked defender) */
export function predictBlow(state: GameState, attacker: Unit, defender: Unit, at: number): { dealt: number; taken: number } {
  if (rangedStrength(attacker) > 0) {
    const s = rangedUnitStrengths(state, attacker, at, defender);
    return { dealt: damageExpected(s.atk - s.def), taken: 0 };
  }
  const s = meleeUnitStrengths(state, attacker, at, defender);
  return { dealt: damageExpected(s.atk - s.def), taken: defender.embarked ? 0 : damageExpected(s.def - s.atk) };
}

/**
 * THE PLANNING (AI Unit Planning 0x792c90 -> 0x7920d0, 0x791e00, 0x791470)
 * of one unit at the start of its player's turn:
 *  - its targets (0x792f90): the list's within 2 x its Movement + its range
 *    of it, in the list's order;
 *  - its reach: the breadth-first search of two turns (`reachPlots`), and on
 *    each link it prices the spots (0x790c60, six at most a target, a plot
 *    once) of each unit target or COMBAT_DISTRICT — at range a plot within
 *    the range (in sight beyond 1; a land unit's on land), its turn the
 *    step's, the next where it ends with no Movement; in melee the plot an
 *    attack on the target's plot is linked from, of the attack's turn, and a
 *    plot beside the target no other player's unit holds that the step ends
 *    on with no Movement (the next turn) or that is the unit's own (this
 *    turn); a civilian's plot taken from the plot it is linked from;
 *  - per target with a spot the predicted blow from where it stands
 *    (`predictBlow`; a civilian taken 150), copied to every spot, and per
 *    spot of a fighter the fighter's blow back on it standing there; a blow
 *    that kills marks the planning `wins`.
 */
export function planUnit(state: GameState, unit: Unit, targets: readonly Target[]): Planner {
  const R = rangeOf(unit);
  const lim = maxMoves(state, unit) * PLAN_TURNS + R;
  const naval = !!UNITS[unit.type]?.naval;
  const fights = canFight(unit);
  const entries: PlanEntry[] = [];
  for (const e of targets) {
    if (plotDistance(state, unit.tileIndex, e.tile) > lim) continue;
    entries.push({ target: e, spots: [], dealt: 0, taken: 0 });
  }
  const { tiles } = state.map;
  const water = (p: number) => isWater(tiles[p]);
  const foreignAt = (p: number) => {
    const dom = unitDomain(unit.type);
    return state.units.some((x) => x.tileIndex === p && x.seat !== unit.seat && onMap(x) && unitDomain(x.type) === dom);
  };
  const reach: Reach[] = [];
  const onLink =(P: number, parent: number, T: number, M: number) => {
    for (const E of entries) {
      const ty = E.target.type;
      if (!STRUCK.has(ty)) continue;
      const TP = E.target.tile;
      const d = plotDistance(state, P, TP);
      let spot = P;
      let turns = T;
      let dd = d;
      let fixed = false;
      let taken = false;
      if (R !== 0 ? ty === 'CIVILIAN' && d === 0 : d === 0) taken = true;
      else if (R === 0 && d === 1 && (M === 0 || P === unit.tileIndex) && !foreignAt(P)) {
        dd = 0;
        fixed = M !== 0;
      }
      if (taken) {
        if (naval ? !water(P) && tiles[P].district !== 'CITY_CENTER' : water(P)) continue;
        spot = parent;
        fixed = true;
      }
      if (!fixed && M === 0) turns = T + 1;
      if (dd > R || E.spots.length >= 6) continue;
      if (!naval && (R === 0 ? water(TP) : water(spot))) continue;
      if (dd > 0 && ty === 'CIVILIAN') continue;
      if (E.spots.some((s) => s.tile === spot)) continue;
      if (!fights) continue;
      if (UNIT_TARGET.has(ty) ? !targetUnit(state, E.target) : tiles[TP].district === null) continue;
      if (R > 1 && dd > 1 && !canSee(state.map, tiles[spot], tiles[TP], false)) continue;
      E.spots.push({ tile: spot, turns, backTaken: 0, backDealt: 0 });
    }
  };
  search(state, unit, PLAN_TURNS, false, (n, ground) => {
    // a plot another player's unit holds the unit only passes (0x586900)
    if (n.attack || ground.stand(n.tile)) reach.push({ tile: n.tile, turns: n.turns, moves: n.moves, attack: !!n.attack });
    return false;
  }, entries.length ? onLink : undefined);
  let wins = false;
  for (const E of entries) {
    if (!E.spots.length) continue;
    const v = UNIT_TARGET.has(E.target.type) ? targetUnit(state, E.target) : null;
    if (!v) continue;
    const blow = predictBlow(state, unit, v, v.tileIndex);
    E.dealt = E.target.type === 'CIVILIAN' ? CIVILIAN_TAKEN : blow.dealt;
    E.taken = blow.taken;
    if (E.dealt > healthOf(v)) wins = true;
    if (!FIGHTER_TARGET.has(E.target.type)) continue;
    const at = unit.tileIndex;
    for (const s of E.spots) {
      unit.tileIndex = s.tile;
      const back = predictBlow(state, v, unit, s.tile);
      unit.tileIndex = at;
      s.backTaken = back.dealt;
      s.backDealt = back.taken;
    }
  }
  return { reach, entries, wins };
}

/** one unit's danger (0x716400): a unit with a bombard strength takes its
 *  combat strength where that tops the bombard less
 *  COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER, else that less; any other the
 *  larger of its combat and ranged strengths */
export function unitDanger(melee: number, ranged: number, bombard: number): number {
  if (bombard > 0) {
    const vs = bombard - COMBAT_BOMBARD_VS_UNIT;
    return melee > vs ? melee : vs;
  }
  return melee > ranged ? melee : ranged;
}

/** a unit's strengths as the AI reads them (0x56dc90, 0x56e3e0, 0x56daa0):
 *  combat, ranged (none for a unit with a bombard) and bombard */
function aiStrengths(u: Unit): { melee: number; ranged: number; bombard: number } {
  const d = UNITS[u.type];
  const bombard = d?.bombard ?? 0;
  return { melee: d?.combat ?? 0, ranged: bombard > 0 ? 0 : d?.ranged?.strength ?? 0, bombard };
}

/**
 * THE DANGER MAP (InfluenceMap 0x717460, the player's m_influence, a plot
 * read by 0x716a90): per player at war with `seat`, each unit of it the seat
 * sees now with a combat, ranged or bombard strength adds its danger
 * (`unitDanger`) to every plot its one-turn planning search closes from where
 * it stands on its full Movement (0x7921e0 -> 0x26df90, its attacks
 * included), and to a second list, each plot once: every other plot within
 * its range (0x56e3d0) of those and — a unit that may coastal raid (+0x18bd,
 * CanRaid) — the land plots beside them (one it reaches too takes the
 * danger twice); an aircraft to the plots within its range. Each such
 * city whose centre the seat sees adds its defence on its centre and its
 * strike over its strike's reach, else 1 on each plot beside it (0x715ff0).
 * Then the seat's own cities: each centre 0, each plot their strike covers
 * down by its strength, to 1 at least (0x716080). The game builds it as the
 * player's turn opens.
 */
export function dangerPlane(state: GameState, seat: number): Int16Array {
  const { map } = state;
  const out = new Int16Array(map.tiles.length);
  const seen = plotsSeenNow(state, new Set([seat]));
  const within = (p: number, r: number) => {
    const t = map.tiles[p];
    return tilesWithin(map, t.col, t.row, r).map((x) => x.index);
  };
  for (const u of state.units) {
    if (!onMap(u) && unitDomain(u.type) !== 'air') continue;
    if (unitReligious(u.type) || !unitsHostile(state, { seat }, u) || !seen[u.tileIndex] || !unitVisibleTo(state, u, seat)) continue;
    const st = aiStrengths(u);
    if (st.melee <= 0 && st.ranged <= 0 && st.bombard <= 0) continue;
    const s = unitDanger(st.melee, st.ranged, st.bombard);
    const R = rangeOf(u);
    if (unitDomain(u.type) === 'air') {
      for (const p of within(u.tileIndex, R)) out[p] += s;
      continue;
    }
    const reach: number[] = [];
    const full = { ...u, movesLeft: unitFullMoves(state, u) };
    search(state, full, 1, false, (n) => {
      reach.push(n.tile);
      return false;
    });
    const inReach = new Set(reach);
    const extra: number[] = [];
    const inExtra = new Set<number>();
    for (const p of reach) {
      for (const q of within(p, R)) {
        if (inReach.has(q) || inExtra.has(q)) continue;
        inExtra.add(q);
        extra.push(q);
      }
    }
    if (UNITS[u.type]?.raider) {
      for (const p of reach) {
        for (const q of within(p, 1)) {
          if (q === p || isWater(map.tiles[q]) || inExtra.has(q)) continue;
          inExtra.add(q);
          extra.push(q);
        }
      }
    }
    for (const p of reach) out[p] += s;
    for (const p of extra) out[p] += s;
  }
  // a city's strengths in whole numbers (the 24.8 values shifted down, 0x24ae80, 0x249ee0)
  const cityStrike = (c: City) => outerPool(state, c) > 0 ? Math.floor(cityStrikeStrength(state, c)) : 0;
  const citiesHeld = (h: { seat: number; cities: City[] }) => isCityStateSeat(h.seat)
    ? state.cityStates.filter((cs) => cs.seat === h.seat && cs.centerIndex >= 0).map(minorCity) : h.cities;
  for (const h of [...cityHolders(state), ...state.cityStates]) {
    if (!unitsHostile(state, { seat }, h)) continue;
    for (const c of citiesHeld(h)) {
      if (!seen[c.centerIndex]) continue;
      const def = Math.floor(cityDefenseStrength(state, c));
      if (def > 0) out[c.centerIndex] += def;
      const strike = cityStrike(c);
      for (const p of within(c.centerIndex, strike > 0 ? CITY_STRIKE_RANGE : 1)) if (p !== c.centerIndex) out[p] += strike > 0 ? strike : 1;
    }
  }
  const own = seatOf(state, seat);
  for (const c of own ? citiesHeld(own) : []) {
    if (cityDefenseStrength(state, c) > 0) out[c.centerIndex] = 0;
    const strike = cityStrike(c);
    if (strike <= 0) continue;
    for (const p of within(c.centerIndex, CITY_STRIKE_RANGE)) {
      if (p === c.centerIndex || out[p] <= 0) continue;
      out[p] = out[p] - strike > 1 ? out[p] - strike : 1;
    }
  }
  return out;
}

/** the predicted damage of taking a civilian (0x791470: 150) */
const CIVILIAN_TAKEN = 150;

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

/** A UNIT THE TACTICAL PASS TAKES (the tactical unit selector 0x7710f0 over
 *  the units no AI system holds): one of AI type EXPLORE or above, an
 *  explorer (`explorer`, PSEUDOYIELD_UNIT_EXPLORER) only while its tribe
 *  rampages; the rest are the homeland's */
function tacticalUnit(state: GameState, u: Unit, ai: number): boolean {
  if (ai < AI_EXPLORE) return false;
  if (ai !== AI_EXPLORE || !UNITS[u.type]?.explorer) return true;
  const tr = tribeOf(state, u.id);
  return !!tr && !tr.alive && tr.rampage !== undefined;
}

/** WANDER NEAR CAMP's radius (0x77b9a0: the plots within 5 of the camp) */
const WANDER_CAMP_RANGE = 5;
/** DEFEND CAMPS' reach (0x779010 -> 0x774e90: within 3 turns) */
const DEFEND_CAMP_TURNS = 3;
/** the planning's breadth-first search (0x7920d0: two turns) */
const PLAN_TURNS = 2;

/** One pass's state: its player, whether a move that ends on a plot it
 *  attacks into strikes it (the barbarians'; not a city-state's or the Free
 *  Cities' wander or chase), the units left, each one's planning reach, and
 *  those done (`0x570b40`). */
export interface Pass {
  seat: number;
  strike: boolean;
  units: Unit[];
  reach: Map<number, Reach[]>;
  done: Set<number>;
  ai: Map<number, number>;
  /** the tactical target list as the pass began, and each unit's planning */
  targets: Target[];
  plan: Map<number, Planner>;
  /** the player's danger map as the pass began (`dangerPlane`) */
  danger: Int16Array;
  /** the regions of every plot the player revealed as the pass began — the
   *  target list's set (0x783980), its tertiary region list (0x6fad50) */
  regions: Set<number>;
}

/** the move that took the unit, as the game's tactical log names it, the
 *  plot it went for and the plot it struck (-1 none), for the replay's comparison */
let tacticsTrace: ((unit: Unit, move: string, plot: number, attack: number) => void) | null = null;
export function traceTactics(fn: ((unit: Unit, move: string, plot: number, attack: number) => void) | null): void {
  tacticsTrace = fn;
}

/** the unit whose move takes the draw being taken, for the replay's hold on
 *  the game's draws; null between draws */
let drawing: Unit | null = null;
export function tacticsDrawing(): Unit | null {
  return drawing;
}

function finish(pass: Pass, u: Unit, move: string, plot = -1, attack = -1): void {
  pass.done.add(u.id);
  tacticsTrace?.(u, move, plot, attack);
}

const live = (state: GameState, pass: Pass, u: Unit) => !pass.done.has(u.id) && state.units.includes(u) && u.seat === pass.seat;

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
    for (const { target: e, spots } of pass.plan.get(u.id)?.entries ?? []) {
      const spot = spots.length > 0;
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

/**
 * THE HOMELAND'S PLUNDER TRADER (0x70f610, the first move of "Default
 * Barbarian HL"): each TRADER target of the list, each homeland unit left
 * and not yet queued whose plot this turn's search closes on the target's
 * (0x791300: one turn, the plot itself) is queued with it ("Plunder
 * Trader"); the queue carried out as the move ends (0x70a440): each queued
 * unit that can act goes onto its plot (0x962190; a civilian stands beside
 * the trader, runs/h1_duelw1124 t137-t151 the captured Builder), its turn
 * done.
 */
function homelandPlunder(state: GameState, pass: Pass): void {
  const queue: { u: Unit; plot: number }[] = [];
  const queued = new Set<number>();
  for (const e of pass.targets) {
    if (e.type !== 'TRADER') continue;
    for (const u of pass.units) {
      if (!live(state, pass, u) || queued.has(u.id) || u.movesLeft <= 0) continue;
      let hit = false;
      search(state, u, 1, false, (n, ground) => {
        hit = n.tile === e.tile && n.turns <= 1 && ground.stand(n.tile);
        return hit;
      });
      if (!hit) continue;
      queue.push({ u, plot: e.tile });
      queued.add(u.id);
    }
  }
  for (const q of queue) {
    if (!canAct(state, pass, q.u)) continue;
    moveTo(state, q.u, q.plot);
    finish(pass, q.u, 'Plunder Trader', q.plot);
  }
}

/**
 * COASTAL RAID (0x7794b0): each IMPROVEMENT, then PASSIVE_DISTRICT target of
 * the list in its order on coastal land, each unit left that may raid
 * (+0x18bd, a raider) whose planning of two turns holds a plot beside it
 * (0x791300 at range 1) is queued with that plot ("Coastal Raid"); the queue
 * carried out (0x7735d0): each queued unit that can still act goes to its
 * plot with the attack flag, then raids the target where it may (0x95b100,
 * 0x95b7c0), its turn done.
 */
function coastalRaids(state: GameState, pass: Pass): void {
  const queue: { u: Unit; spot: number; plot: number }[] = [];
  for (const e of pass.targets) {
    if (e.type !== 'IMPROVEMENT' && e.type !== 'PASSIVE_DISTRICT') continue;
    if (!isCoastalLand(state.map, state.map.tiles[e.tile])) continue;
    for (const u of pass.units) {
      if (!live(state, pass, u) || !UNITS[u.type]?.raider) continue;
      const spot = reachAt(state, pass, u, e.tile, PLAN_TURNS, false, 1);
      if (spot >= 0) queue.push({ u, spot, plot: e.tile });
    }
  }
  for (const q of queue) {
    if (!canAct(state, pass, q.u)) continue;
    if (q.u.tileIndex !== q.spot) moveTo(state, q.u, q.spot);
    if (state.units.includes(q.u) && coastalRaid(state, q.u, q.plot)) dropHeldCosts();
    finish(pass, q.u, 'Coastal Raid', q.spot);
  }
}

/** ATTACK UNITS' reach of the targets one assignment takes (0x76eb50) */
const ATTACK_TARGETS_RANGE = 5;
/** a target's health in the assignment (0x776140): 1.1 in 24.8 (0x119) of
 *  its whole, less its damage */
const ATTACK_HEALTH_256 = 281;
/** a kill's worth in the gain (0x7702b0) */
const ATTACK_KILL = 100;
/** a barbarian target's worth (0x7702b0, @0xd5aff4) */
const ATTACK_BARB = Math.fround(0.8);

/**
 * THE UNITS THAT CAN STRIKE A PLOT (0x775340 as Attack Units asks it, 2
 * turns): each unit left, in pool order, with a strength to fight with,
 * whose planning reach holds — in melee the plot within two turns, at range
 * a plot exactly its range from it within two turns with Movement left and
 * none of its own units stacking there unless it is its own (0x78fa10); a
 * camp's DEFENDER goes in only before another unit.
 */
function strikers(state: GameState, pass: Pass, plot: number): Unit[] {
  const out: Unit[] = [];
  let held: Unit | null = null;
  for (const u of pass.units) {
    if (!live(state, pass, u) || !canFight(u)) continue;
    const reach = pass.reach.get(u.id) ?? [];
    const ranged = rangedStrength(u) > 0;
    const R = ranged ? rangeOf(u) : 0;
    const ok = R === 0
      ? reach.some((e) => e.tile === plot && e.turns <= PLAN_TURNS && (!ranged || e.moves > 0))
      : reach.some((e) => plotDistance(state, e.tile, plot) === R && e.turns <= PLAN_TURNS && e.moves > 0
        && (!stackedAt(state, u, e.tile) || e.tile === u.tileIndex));
    if (!ok) continue;
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

/** one unit's claim on a spot in the assignment: the unit, the target, the
 *  damage it would deal, the turn of the blow, its worth as last weighed */
interface Claim { unit: number; target: number; dealt: number; turns: number; value: number }
interface AssignSpot { tile: number; claims: Claim[]; holder: number; holderTarget: number }
interface AssignTarget { target: Target; unit: Unit; health: number; damage: number; units: number[]; barb: boolean }
/** one unit's assignment (0x38 entries): its spot, the plot it strikes (-1
 *  where the blow falls on a later turn), where it stands, its damage */
export interface Assigned { unit: Unit; move: number; attack: number; from: number; damage: number; civilian: boolean }

/**
 * THE ASSIGNMENT (0x776140) of `units` to the spots of `targets`:
 *  - each target's health (1.1 x its whole, less its damage);
 *  - each unit with Movement left: per target its planning's spots (in
 *    order), save — but against a HIGH target — one where the damage it
 *    takes in the blow and the blow back passes the damage it deals in both,
 *    or would kill it; a DEFENDER's only on its own plot, a unit that has
 *    moved only its own plot this turn, and no spot another unit holds that
 *    stacks with it (its own unit with Movement left aside); each a claim on
 *    the spot (the spots in the order first claimed);
 *  - the Generalized Assignment (MathAlgorithm_GeneralizedAssignmentProblem
 *    0x8b5bf0, one pass): spot by spot each unit's gain there (`gain`, less
 *    its worth at its own spot), the first largest positive taking it, the
 *    spot's holder let go (`claim`);
 *  - each assigned unit's move: its spot, and the target's plot as the
 *    attack where its claim's blow falls this turn, sorted (0x7704e0).
 */
/** the assignment with its two filters: `exchange` drops a spot where the
 *  damage the unit takes passes the damage it deals, `survive` one where it
 *  would die (0x776140's fifth and sixth arguments); a HIGH target drops
 *  neither */
export function assignTo(state: GameState, pass: Pass, units: Unit[], targets: Target[], exchange: boolean, survive: boolean): Assigned[] {
  const tg: AssignTarget[] = [];
  for (const t of targets) {
    const v = targetUnit(state, t)!;
    tg.push({ target: t, unit: v, health: Math.floor(UNIT_HP * ATTACK_HEALTH_256 / 256) - (UNIT_HP - healthOf(v)),
      damage: 0, units: [], barb: isBarbSeat(v.seat) });
  }
  const spots: AssignSpot[] = [];
  units.forEach((u, i) => {
    if (u.movesLeft <= 0) return;
    const p = pass.plan.get(u.id);
    if (!p) return;
    const moved = u.movesLeft < (u.movesFull ?? unitFullMoves(state, u));
    tg.forEach((T, k) => {
      const E = p.entries.find((e) => e.target === T.target);
      if (!E) return;
      for (const s of E.spots) {
        const takes = E.taken + s.backTaken;
        if (T.target.type !== 'HIGH' && ((exchange && takes > E.dealt + s.backDealt) || (survive && takes > healthOf(u)))) continue;
        if (pass.ai.get(u.id) === AI_DEFENDER && s.tile !== u.tileIndex) continue;
        if (s.turns === 1 && moved && s.tile !== u.tileIndex) continue;
        const dom = unitDomain(u.type);
        if (state.units.some((x) => x.tileIndex === s.tile && onMap(x) && x !== T.unit
          && !(x.seat === u.seat && x.movesLeft > 0) && unitDomain(x.type) === dom)) continue;
        let sp = spots.find((x) => x.tile === s.tile);
        if (!sp) spots.push((sp = { tile: s.tile, claims: [], holder: -1, holderTarget: -1 }));
        sp.claims.push({ unit: i, target: k, dealt: E.dealt, turns: s.turns, value: 0 });
      }
    });
  });
  // the unit's worth at a spot (0x7702b0)
  const gain = (i: number, j: number): number => {
    let best = 0;
    for (const c of spots[j].claims) {
      if (c.unit !== i) continue;
      const T = tg[c.target];
      const blow = Math.trunc(c.dealt / c.turns);
      if (T.units.includes(i)) return blow + (T.damage >= T.health ? ATTACK_KILL : 0);
      let v = T.damage >= T.health ? T.health - T.damage + ATTACK_KILL : blow;
      if (T.barb) v = Math.trunc(Math.fround(v * ATTACK_BARB));
      c.value = v;
      if (v > best) best = v;
    }
    return best;
  };
  // the unit takes the spot (0x770710): let go of its old one and of the
  // spot's holder, claim its best there; the holder let go returned
  const claim = (i: number, j: number, prev: number): number => {
    if (prev >= 0) {
      for (const c of spots[prev].claims) {
        if (c.unit !== i) continue;
        const T = tg[c.target];
        const at = T.units.indexOf(i);
        if (at < 0) continue;
        T.units.splice(at, 1);
        if (c.turns === 1) T.damage -= c.dealt;
      }
      spots[prev].holder = -1;
      spots[prev].holderTarget = -1;
    }
    const S = spots[j];
    const occ = S.holder;
    if (occ >= 0) {
      const c = S.claims.find((x) => x.unit === occ && x.target === S.holderTarget);
      if (c) {
        const T = tg[c.target];
        const at = T.units.indexOf(occ);
        if (at >= 0) T.units.splice(at, 1);
        if (c.turns === 1) T.damage -= c.dealt;
      }
    }
    let best = S.claims[0];
    for (const c of S.claims.slice(1)) {
      const mine = best.unit !== i;
      if (mine !== (c.unit !== i) ? mine : best.value < c.value) best = c;
    }
    if (best && best.unit === i) {
      const T = tg[best.target];
      T.units.push(i);
      if (best.turns === 1) T.damage += best.dealt;
      S.holder = i;
      S.holderTarget = best.target;
    }
    return occ;
  };
  const at = units.map(() => -1);
  for (let j = 0; j < spots.length; j++) {
    let pick = -1;
    let top = 0;
    for (let i = 0; i < units.length; i++) {
      const w = at[i] === -1 || at[i] === j ? gain(i, j) : gain(i, j) - gain(i, at[i]);
      if (pick < 0 || w > top) { pick = i; top = w; }
    }
    if (pick < 0 || top <= 0 || at[pick] === j) continue;
    const occ = claim(pick, j, at[pick]);
    at[pick] = j;
    if (occ >= 0) at[occ] = -1;
  }
  const out: (Assigned | null)[] = units.map((u, i) => {
    if (at[i] < 0) return null;
    const S = spots[at[i]];
    const c = S.claims.find((x) => x.unit === i && tg[x.target].units.includes(i));
    if (!c) return null;
    const T = tg[c.target];
    return { unit: u, move: S.tile, attack: c.turns === 1 ? T.unit.tileIndex : -1, from: u.tileIndex,
      damage: UNIT_HP - healthOf(u), civilian: T.target.type === 'CIVILIAN' };
  });
  return mergeSort(out, (a, b) => assignedBefore(state, a, b)).filter((a): a is Assigned => a !== null);
}

/** the order the assignments run in (0x7704e0): one with a spot before one
 *  without; one whose spot is where the other stands after it, one standing
 *  where the other's spot is before it; else the shorter move, at equal
 *  lengths the less damaged unit, then the lower pool slot (the game compares
 *  the unit IDs, whose low half is the slot) */
function assignedBefore(state: GameState, a: Assigned | null, b: Assigned | null): boolean {
  if (!a || !b) return !!a && !b;
  if (a.move === b.from) return false;
  if (a.from === b.move) return true;
  const da = plotDistance(state, a.from, a.move);
  const db = plotDistance(state, b.from, b.move);
  if (da !== db) return da < db;
  if (a.damage !== b.damage) return a.damage < b.damage;
  return (a.unit.slot ?? 0) < (b.unit.slot ?? 0);
}

/** EASTL's merge sort with a buffer (0x76f0f0 -> 0x76f320): halves of n / 2,
 *  each merge taking the second run's head only where it goes strictly first */
function mergeSort<T>(a: T[], before: (x: T, y: T) => boolean): T[] {
  if (a.length < 2) return a.slice();
  const h = a.length >> 1;
  const l = mergeSort(a.slice(0, h), before);
  const r = mergeSort(a.slice(h), before);
  const out: T[] = [];
  let i = 0;
  let k = 0;
  while (i < l.length && k < r.length) out.push(before(r[k], l[i]) ? r[k++] : l[i++]);
  while (i < l.length) out.push(l[i++]);
  while (k < r.length) out.push(r[k++]);
  return out;
}

/**
 * THE ASSIGNMENT CARRIED OUT (0x771f80), in its order: every unit to its
 * spot (a move order, again where it stopped short and no unit at war or of
 * its own stands there); a siege unit strikes its attack; a ranged unit
 * strikes it unless its melee is the stronger and it can reach the plot this
 * turn; then every unit moves onto its attack (the attack flag) — a
 * civilian taken, a fighter struck in melee; each one's turn done.
 */
function carryOut(state: GameState, pass: Pass, out: Assigned[], move = 'Attack Units'): void {
  for (const a of out) {
    const u = a.unit;
    if (!state.units.includes(u) || u.tileIndex === a.move) continue;
    moveTo(state, u, a.move);
    if (state.units.includes(u) && u.tileIndex !== a.move && !enemyAt(state, u, a.move) && !stackedAt(state, u, a.move)) {
      moveTo(state, u, a.move);
    }
  }
  const strikeAt = (u: Unit, p: number) => {
    if (p >= 0 && plotDistance(state, u.tileIndex, p) <= unitAttackRange(u) && attacksLeftOf(u) > 0) hostileRangedStrike(state, u, p);
  };
  for (const a of out) {
    const u = a.unit;
    if (a.civilian || !canAct(state, pass, u) || UNITS[u.type]?.bombard === undefined) continue;
    strikeAt(u, a.attack);
    u.movesLeft = 0;
    finish(pass, u, move, a.move, a.attack);
  }
  for (const a of out) {
    const u = a.unit;
    if (a.civilian || !canAct(state, pass, u) || rangedStrength(u) <= 0) continue;
    const melee = (UNITS[u.type]?.combat ?? 0) > rangedStrength(u)
      && !!pass.reach.get(u.id)?.some((e) => e.tile === a.attack && e.turns <= 1);
    if (melee) continue;
    strikeAt(u, a.attack);
    u.movesLeft = 0;
    finish(pass, u, move, a.move, a.attack);
  }
  for (const a of out) {
    const u = a.unit;
    if (!state.units.includes(u)) continue;
    if (a.attack >= 0 && canAct(state, pass, u)) moveTo(state, u, a.attack);
    if (state.units.includes(u)) u.movesLeft = 0;
    if (!pass.done.has(u.id)) finish(pass, u, move, a.move, a.attack);
  }
}

/**
 * ATTACK HIGH / MEDIUM / LOW PRIORITY (0x7784b0 with the target type; LOW
 * takes the RELIGIOUS targets too): each target of the type in the list's
 * order, its unit still on the map, the units that can strike its plot
 * (`strikers`) assigned (`assignTo`) over the targets of its type
 * within 5 of it, and the assignment carried out (`carryOut`).
 */
function attackUnits(state: GameState, pass: Pass, type: TargetType): void {
  for (const e of pass.targets) {
    if (e.type !== type && !(type === 'LOW' && e.type === 'RELIGIOUS')) continue;
    const v = targetUnit(state, e);
    if (!v) continue;
    const units = strikers(state, pass, v.tileIndex);
    if (!units.length) continue;
    const near = pass.targets.filter((t) => t.type === e.type && targetUnit(state, t)
      && plotDistance(state, t.unit!.tileIndex, v.tileIndex) <= ATTACK_TARGETS_RANGE);
    carryOut(state, pass, assignTo(state, pass, units, near, type !== 'HIGH', type !== 'HIGH'));
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
    moveTo(state, u, spot.tile, pass.strike);
    finish(pass, u, 'Chase Target', tgt);
  }
}

/**
 * WANDER NEAR CAMP (0x77b9a0): each unit of AI type above EXPLORE whose
 * camp stands — the plot the player's signals answer for its group
 * (0x771250, `homeOf`: a barbarian tribe's camp): of its planning reach, the
 * plots of this turn with no unit at war with it (0x5862e0), none of its own
 * stacking with it (0x585eb0), within 5 of the camp and, where the camp's
 * plot is a city's, of that city's; ONE "Random Direction" draw over their
 * count picks the plot it moves to ("Wander"); with none it heads for its
 * camp ("Wander Back to Camp"). Its turn is done.
 */
function wanderNearCamp(state: GameState, pass: Pass, homeOf: (u: Unit) => number): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || (pass.ai.get(u.id) ?? -1) <= AI_EXPLORE) continue;
    const home = homeOf(u);
    if (home < 0) continue;
    const camp = state.map.tiles[home];
    const campCity = tileSeat(camp) === NO_SEAT ? -1 : tileCity(camp);
    const cands = (pass.reach.get(u.id) ?? []).filter((e) => {
      if (e.turns !== 1 || enemyAt(state, u, e.tile) || stackedAt(state, u, e.tile)) return false;
      if (plotDistance(state, home, e.tile) > WANDER_CAMP_RANGE) return false;
      const t = state.map.tiles[e.tile];
      return campCity === -1 || (tileSeat(t) === tileSeat(camp) && tileCity(t) === campCity);
    });
    drawing = u;
    const to = cands.length ? cands[randRange(state, cands.length, 'Random Direction')].tile : home;
    drawing = null;
    moveTo(state, u, to, pass.strike);
    finish(pass, u, cands.length ? 'Wander' : 'Wander Back to Camp', to);
  }
}

/**
 * HEAL (0x779a70, its moves 0x7737c0): each unit left, in pool order, that
 * has taken damage (+0xcf0) is healed: a land unit holds its plot (it
 * fortifies, 0x95eae0, or sleeps, 0x9686d0); a naval one outside its own
 * territory heads for its player's nearest city (the first of equals), on
 * its own ground it holds. Its turn is done. An embarked unit (0x8be30)
 * or on a plot of danger (`pass.danger` above 0, 0x716a90) is left.
 */
function heal(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || u.hp >= UNIT_HP || !!u.embarked || pass.danger[u.tileIndex] > 0) continue;
    if (UNITS[u.type]?.naval && tileSeat(state.map.tiles[u.tileIndex]) !== u.seat) {
      let best = -1;
      let bd = -1;
      for (const c of cityCentresOf(state, u.seat)) {
        const d = plotDistance(state, u.tileIndex, c);
        if (bd < 0 || d < bd) { bd = d; best = c; }
      }
      if (best >= 0) moveTo(state, u, best, pass.strike);
    }
    finish(pass, u, 'Heal');
  }
}

/**
 * Does the unit on a plot of danger `d` (> 0) flee — MOVE TO SAFETY's test
 * (0x77a4b0), `hl` the homeland's (0x70f3b0)? One with no strength or
 * embarked (0x8be30) does. A hurt one (+0xcf0): a barbarian's (0x56ee80)
 * at sea does; else the tactical one with half its health or less lost
 * (0x56e0d0) where its planning holds no blow that kills (+0x60, none
 * without a planning), the homeland's with a quarter or more lost. A whole
 * barbarian holds; any other whole one flees where `d` tops its strength —
 * the larger of combat and ranged, by 20 (tactical); `unitDanger`, by 15
 * (homeland).
 */
function flees(pass: Pass, u: Unit, d: number, hl: boolean): boolean {
  const st = aiStrengths(u);
  const ranged = st.ranged;
  if (st.melee <= 0 && ranged <= 0 && st.bombard <= 0) return true;
  if (u.embarked) return true;
  const barb = isBarbSeat(u.seat);
  const damage = UNIT_HP - u.hp;
  if (damage > 0) {
    if (barb && UNITS[u.type]?.naval) return true;
    if (hl) return 4 * damage >= UNIT_HP;
    if (2 * damage < UNIT_HP) return false;
    return !pass.plan.get(u.id)?.wins;
  }
  if (barb) return false;
  if (hl) return d > unitDanger(st.melee, ranged, st.bombard) + 15;
  return d > Math.max(st.melee, ranged) + 20;
}

/** A plot whose district carries HitPoints (Districts.HitPoints: the city
 *  centre, the Encampment and its replacement), a city-state's centre
 *  included. */
function garrisonDistrict(state: GameState, t: Tile): boolean {
  if (t.district === 'CITY_CENTER' || t.district === 'ENCAMPMENT') return true;
  const cs = cityStateAt(state, t.index);
  return !!cs && cs.centerIndex === t.index;
}

/**
 * THE SAFE PLOT (InfluenceMap 0x716b90) for the unit: of its planning reach,
 * the plots of this turn not `taken` already, none of its own units stacking
 * with it there (0x585eb0, itself counted) and no unit at war with it
 * (0x5861f0), none in fallout (0x2d2100). A FORT is a plot of the player's
 * own territory whose district has HitPoints (DistrictInfo +0x58: the city
 * centre and the Encampment, `garrisonDistrict`). Against the best so far,
 * the first taken: a fort over any plot but a fort, of two forts the lower
 * danger; a plot of no danger over one of danger, a fort aside; of two of no
 * danger the player's own territory, else the one with less Movement left;
 * of two in danger, on the player's own territory, its own over another's,
 * then the lower danger, then less Movement left, a fort or a plot of no
 * danger kept; off it, the lower danger, then the farther from the unit. A
 * unit with no combat strength skips a water plot of danger while the best is
 * on land. -1 none.
 */
function safePlot(state: GameState, pass: Pass, u: Unit, taken: ReadonlySet<number>): number {
  const plan = pass.plan.get(u.id);
  if (!plan) return -1;
  const noCombat = aiStrengths(u).melee <= 0;
  let best = -1;
  let bFort = false;
  let bSafe = false;
  let bOwn = false;
  let bWater = false;
  let bDanger = 0;
  let bMoves = 0;
  let bDist = 0;
  for (const r of plan.reach) {
    if (r.turns > 1 || taken.has(r.tile)) continue;
    const t = state.map.tiles[r.tile];
    if (irradiated(t)) continue;
    if (stackedAt(state, u, r.tile) || enemyAt(state, u, r.tile)) continue;
    const d = pass.danger[r.tile];
    const safe = d <= 0;
    const own = tileSeat(t) === u.seat;
    const fort = own && garrisonDistrict(state, t);
    const water = isWater(t);
    const dist = plotDistance(state, u.tileIndex, r.tile);
    if (best >= 0) {
      if (!bWater && noCombat && water && d > 0) continue;
      let take: boolean;
      if (fort) take = !bFort || d < bDanger;
      else if (safe && !bFort) take = !bSafe || (own && !bOwn) || r.moves < bMoves;
      else if (own) take = !bFort && !bSafe && (!bOwn || d < bDanger || (d === bDanger && r.moves < bMoves));
      else take = d < bDanger || (d === bDanger && dist > bDist);
      if (!take) continue;
    }
    best = r.tile;
    bFort = fort;
    bSafe = safe;
    bOwn = own;
    bWater = water;
    bDanger = d;
    bMoves = r.moves;
    bDist = dist;
  }
  return best;
}

/**
 * MOVE TO SAFETY (0x77a4b0, its moves 0x774190): each unit left on a plot of
 * danger that flees (`flees`) is listed ("Move to safety", its danger
 * logged), then each in turn goes to its safe plot (`safePlot`, the plots
 * the ones before it took left out), its turn done (0x773fb0); one with no
 * safe plot stays for the moves after.
 */
function moveToSafety(state: GameState, pass: Pass): void {
  const list = pass.units.filter((u) => live(state, pass, u) && pass.danger[u.tileIndex] > 0
    && flees(pass, u, pass.danger[u.tileIndex], false));
  const taken = new Set<number>();
  for (const u of list) {
    if (!live(state, pass, u)) continue;
    const p = safePlot(state, pass, u, taken);
    if (p < 0) continue;
    taken.add(p);
    moveTo(state, u, p, false);
    finish(pass, u, 'Move to safety', p);
  }
}

/**
 * THE HOMELAND'S MOVE TO SAFETY (0x70f3b0, each unit 0x70bf90): each unit
 * left on a plot of danger that flees (`flees`, the homeland's test) goes to
 * its safe plot (`safePlot`, the plots the ones before it took left out);
 * with none a barbarian fortifies where it stands ("Fortify in place"), any
 * other stays for the moves after.
 */
function homelandSafety(state: GameState, pass: Pass): void {
  const taken = new Set<number>();
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const d = pass.danger[u.tileIndex];
    if (d <= 0 || !flees(pass, u, d, true)) continue;
    const p = safePlot(state, pass, u, taken);
    if (p >= 0) {
      taken.add(p);
      moveTo(state, u, p, false);
      finish(pass, u, 'HL: Move To Safety', p);
    } else if (isBarbSeat(u.seat)) finish(pass, u, 'HL: Move To Safety', u.tileIndex);
  }
}

/** EXPLORE LAND's rounds over the homeland's units (0x70ce90: three at most) */
const EXPLORE_ROUNDS = 3;

/** the plots the player revealed (its `explored`; none tracked: every plot) */
function revealedOf(state: GameState, seat: number): (i: number) => boolean {
  const ex = seatOf(state, seat)?.explored;
  return (i) => !ex || ex.length === 0 || ex[i] === 1;
}

/** the regions of every plot the player revealed: the tactical target
 *  list's set (0x783980), stored as the player's tertiary region list
 *  (0x6fad50) */
function seenRegions(state: GameState, seat: number): Set<number> {
  const revealed = revealedOf(state, seat);
  const out = new Set<number>();
  for (const t of state.map.tiles) if ((t.region ?? -1) >= 0 && revealed(t.index)) out.add(t.region!);
  return out;
}

/** may the explorer go to the plot (0x70bd40): not its own; one its player
 *  revealed; another player's ground only at war with it; no unit on it
 *  (+0x4c); on its own area unless it embarks (the barbarians never), a
 *  hull on water; no city centre but its player's */
function exploreOk(state: GameState, u: Unit, p: number, revealed: (i: number) => boolean): boolean {
  if (p === u.tileIndex || !revealed(p)) return false;
  const t = state.map.tiles[p];
  const owner = tileSeat(t);
  if (owner !== NO_SEAT && owner !== u.seat && !unitsHostile(state, u, { seat: owner })) return false;
  if (state.units.some((x) => x.tileIndex === p && onMap(x))) return false;
  const naval = !!UNITS[u.type]?.naval;
  const here = state.map.tiles[u.tileIndex];
  if ((t.area ?? -1) !== (here.area ?? -1) && !(canEmbark(state, u) && !isBarbSeat(u.seat)) && (!naval || !isWater(t))) return false;
  return !(t.district === 'CITY_CENTER' && owner !== u.seat);
}

/** the nearest plot the unit's player never revealed that the set takes and
 *  the unit may enter, no unit on it (0x70b6f0, 0x70b550: plots in index
 *  order, the first of equals); -1 none */
function nearestUnrevealed(state: GameState, u: Unit, revealed: (i: number) => boolean, inSet: (t: Tile) => boolean): number {
  const ground = groundOf(state, u, false);
  let best = -1;
  let bd = Infinity;
  for (const t of state.map.tiles) {
    if (!inSet(t) || revealed(t.index)) continue;
    const d = plotDistance(state, u.tileIndex, t.index);
    if (d >= bd || state.units.some((x) => x.tileIndex === t.index && onMap(x)) || !ground.enter(t)) continue;
    best = t.index;
    bd = d;
  }
  return best;
}

/**
 * HL EXPLORE (0x70aa40) for one explorer: of the plots its search of this
 * turn closes (0x26df90 on its Movement left) with no danger, none chosen
 * this move and one it may go to (`exploreOk`), the one whose sight (the
 * plots within its sight it sees from there, `canSee`) holds the most plots
 * its player never revealed (0x70a6c0, the first of equals, above 0); else,
 * on the move's first round, the nearest unrevealed plot of its region
 * where the player has not revealed all of it ("cur region", a path to it
 * existing; a unit off any region the nearest of its area, "cur area");
 * else the nearest unrevealed plot of the player's region lists (0x70b6f0,
 * a path to it existing) — the primary and the secondary its cities' (a
 * player with none holds none), the tertiary the regions of the plots it
 * revealed ("tertiary regions"); else the plot whose sight holds the most
 * plots the player does not see now (0x70a8b0, "fallback"). The unit's own
 * plot joins the chosen.
 */
function exploreTarget(state: GameState, pass: Pass, u: Unit, chosen: Set<number>, first: boolean,
  revealed: (i: number) => boolean, seenNow: Uint8Array): { plot: number; move: string } | null {
  const { map } = state;
  const sight = unitSight(u, state);
  const look = (p: number) => {
    const t = map.tiles[p];
    return tilesWithin(map, t.col, t.row, sight).filter((q) => canSee(map, t, q, false)).map((q) => q.index);
  };
  let best1 = -1;
  let v1Best = 0;
  let best2 = -1;
  let v2Best = 0;
  search(state, u, 1, false, (n, ground) => {
    const p = n.tile;
    if (!ground.stand(p) || pass.danger[p] > 0 || chosen.has(p) || !exploreOk(state, u, p, revealed)) return false;
    const seen = look(p);
    const v1 = seen.filter((q) => !revealed(q)).length;
    const v2 = seen.filter((q) => !seenNow[q]).length;
    if (v1 > v1Best) {
      best1 = p;
      v1Best = v1;
    }
    if (best2 < 0 || v2 > v2Best) {
      best2 = p;
      v2Best = v2;
    }
    return false;
  });
  chosen.add(u.tileIndex);
  if (best1 >= 0) return { plot: best1, move: 'HL: Explore' };
  if (!first) return null;
  const here = map.tiles[u.tileIndex];
  const reg = here.region ?? -1;
  if (reg >= 0) {
    if (map.tiles.some((t) => t.region === reg && !revealed(t.index))) {
      const p = nearestUnrevealed(state, u, revealed, (t) => t.region === reg);
      if (p >= 0 && !chosen.has(p) && pathTo(state, u, p).length) return { plot: p, move: 'HL: Explore cur region' };
    }
  } else {
    const area = here.area ?? -1;
    const p = nearestUnrevealed(state, u, revealed, (t) => (t.area ?? -1) === area);
    if (p >= 0 && !chosen.has(p) && pathTo(state, u, p).length) return { plot: p, move: 'HL: Explore cur area' };
  }
  if (pass.regions.size) {
    const p = nearestUnrevealed(state, u, revealed, (t) => pass.regions.has(t.region ?? -1));
    if (p >= 0 && !chosen.has(p) && pathTo(state, u, p).length) return { plot: p, move: 'HL: Explore tertiary regions' };
  }
  return best2 >= 0 ? { plot: best2, move: 'HL: Explore fallback' } : null;
}

/**
 * EXPLORE LAND (0x70ce90): up to three rounds over the homeland's units in
 * pool order, each round's moves carried out together as it ends (0x70a440)
 * and another round only where one moved: each unit of AI type EXPLORE with
 * Movement left and no more than half its health lost — in a later round
 * one standing where its last move was for — takes its target
 * (`exploreTarget`, the fallbacks on the first round alone), the target
 * joining the chosen, and moves to it (0x962030); the move it first took
 * names its turn.
 */
function exploreLand(state: GameState, pass: Pass): void {
  const revealed = revealedOf(state, pass.seat);
  const chosen = new Set<number>();
  const went = new Map<number, number>();
  const firstMove = new Map<Unit, { move: string; plot: number }>();
  for (let round = 1; round <= EXPLORE_ROUNDS; round++) {
    const seenNow = plotsSeenNow(state, new Set([pass.seat]));
    const moves: { u: Unit; plot: number; move: string }[] = [];
    for (const u of pass.units) {
      if (!live(state, pass, u) || pass.ai.get(u.id) !== AI_EXPLORE || u.movesLeft <= 0) continue;
      if (UNIT_HP - u.hp > UNIT_HP >> 1) continue;
      const last = went.get(u.id);
      if (last !== undefined && u.tileIndex !== last) continue;
      const t = exploreTarget(state, pass, u, chosen, round === 1, revealed, seenNow);
      if (!t) continue;
      chosen.add(t.plot);
      moves.push({ u, ...t });
    }
    for (const m of moves) {
      moveTo(state, m.u, m.plot, false);
      if (!firstMove.has(m.u)) firstMove.set(m.u, { move: m.move, plot: m.plot });
      went.set(m.u.id, m.plot);
    }
    if (!moves.length) break;
  }
  for (const [u, m] of firstMove) finish(pass, u, m.move, m.plot);
}

/** WANDER NEAR CITY's radius (0x77bf50: the plots within 5 of the city) */
const WANDER_CITY_RANGE = 5;
/** the radius FindAlternateLocation searches round the city (0x77bf50 -> 0x585940) */
const WANDER_BACK_RANGE = 3;

/**
 * WANDER NEAR CITY (0x77bf50) for a player of no full civilization (a
 * city-state): each unit left of AI type EXPLORE or above with Movement
 * left (+0xdb0), in pool order: of its planning reach, the plots of this
 * turn within 5 of the player's capital (`home`) with no unit at war with it
 * (0x5862e0) and none of its own stacking with it (0x585eb0); ONE "Random
 * Direction" draw over their count picks the plot it moves to ("Wander") —
 * the weights the loop builds are never read. With none it moves to the
 * plot `alternateLocation` finds round the capital ("Wander Back to City",
 * the row naming the capital), else it stays. Its turn is done.
 */
function wanderNearCity(state: GameState, pass: Pass, home: number): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || (pass.ai.get(u.id) ?? -1) < AI_EXPLORE || u.movesLeft <= 0) continue;
    const cands = (pass.reach.get(u.id) ?? []).filter((e) => e.turns === 1
      && plotDistance(state, home, e.tile) <= WANDER_CITY_RANGE && !enemyAt(state, u, e.tile) && !stackedAt(state, u, e.tile));
    if (cands.length) {
      drawing = u;
      const to = cands[randRange(state, cands.length, 'Random Direction')].tile;
      drawing = null;
      moveTo(state, u, to, pass.strike);
      finish(pass, u, 'Wander', to);
      continue;
    }
    const to = alternateLocation(state, u, home, WANDER_BACK_RANGE);
    if (to >= 0) moveTo(state, u, to, pass.strike);
    finish(pass, u, 'Wander Back to City', home);
  }
}

/**
 * FIND ALTERNATE LOCATION (Unit_Placement 0x585940) for the unit round
 * `plot`: the plots within `range` of it (0x1e000) — the game's axial steps
 * (dx, dy) over -range..range, dx the outer — that the unit may enter
 * (0x586360: its ground, `groundOf`), where no other player's unit stands
 * and none of its own that stacks with it; the nearest `plot` wins, a plot
 * of another area than `plot`'s counted three times as far, the first of
 * equals. -1 none.
 */
function alternateLocation(state: GameState, unit: Unit, plot: number, range: number): number {
  const { map } = state;
  const at = map.tiles[plot];
  const [q0, r0] = offsetToAxial(at.col, at.row);
  const ground = groundOf(state, unit);
  const dom = unitDomain(unit.type);
  let best = -1;
  let bestScore = Infinity;
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const n = (dx < 0) !== (dy < 0) && dx !== 0 && dy !== 0 ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx) + Math.abs(dy);
      if (n > range) continue;
      const [c, r] = axialToOffset(q0 + dx, r0 + dy);
      const t = tileAt(map, c, r);
      if (!t || !ground.enter(t)) continue;
      if (state.units.some((o) => o !== unit && o.tileIndex === t.index && onMap(o)
        && (o.seat !== unit.seat || unitDomain(o.type) === dom))) continue;
      let score = plotDistance(state, plot, t.index);
      if ((t.area ?? -1) !== (at.area ?? -1)) score *= 3;
      if (score < bestScore) {
        bestScore = score;
        best = t.index;
      }
    }
  }
  return best;
}

/** a city-state's units the pass walks: its military units, of AI type
 *  COMBAT (a civilian, a support unit none) */
function minorAiTypeOf(u: Unit): number {
  return unitDomain(u.type) === 'military' ? AI_COMBAT : -1;
}

/**
 * A CITY-STATE'S TACTICAL TURN (TacticalAI 0x771530 over Tactics.xml's
 * "Minor Civ Tactical" and "Minor Civ Homeland" lists): its unit pool
 * (`poolSlots`, slot 0 its founding Settler's), each unit's planning reach
 * taken before any moves, its tactical target list, then the moves in the
 * list's order, each walking the units the moves before it left, in pool
 * order — Attack High Priority, Move to Safety, Attack Medium Priority,
 * Attack Low Priority, Heal, Chase Target (no strike), Wander Near City
 * (Support Formation, Attack Civilians, Promotion and Make Military
 * Formation not ported); the homeland's Move to Safety, then its End Turn
 * takes the rest.
 */
export function cityStateTactics(state: GameState, cityState: CityState): void {
  const pool = (cityState.unitPool ??= { size: 1, free: [], dying: [] });
  poolSlots(pool, state.units.filter((u) => u.seat === cityState.seat));
  costsHeld = new Map();
  try {
    const pass = openPass(state, cityState.seat, minorAiTypeOf);
    attackUnits(state, pass, 'HIGH');
    moveToSafety(state, pass);
    attackUnits(state, pass, 'MEDIUM');
    attackUnits(state, pass, 'LOW');
    heal(state, pass);
    chaseTarget(state, pass);
    wanderNearCity(state, pass, cityState.centerIndex);
    homelandSafety(state, pass);
    for (const u of pass.units) if (live(state, pass, u)) finish(pass, u, 'HL: End Turn');
  } finally {
    costsHeld = null;
  }
  poolDying(pool, state.units.filter((u) => u.seat === cityState.seat));
}

/**
 * THE FREE CITIES' TACTICAL TURN (their "FreeCitiesTactics" and
 * "FreeCitiesHomeland" lists, Expansion1_Leaders.xml): their unit pool, then
 * Attack High Priority, Attack Medium Priority, Move to Safety, Attack Low
 * Priority, Wander Near Camp — the camp their signals answer (0x771250,
 * unread for them) read as the unit's Free City, else the nearest — and the
 * homeland's End Turn.
 */
export function freeCityTactics(state: GameState): void {
  const free = state.freeSeat;
  if (!free) return;
  const pool = (free.unitPool ??= { size: 0, free: [], dying: [] });
  poolSlots(pool, state.units.filter((u) => u.seat === FREE_SEAT));
  costsHeld = new Map();
  try {
    const pass = openPass(state, FREE_SEAT, minorAiTypeOf);
    attackUnits(state, pass, 'HIGH');
    attackUnits(state, pass, 'MEDIUM');
    moveToSafety(state, pass);
    attackUnits(state, pass, 'LOW');
    wanderNearCamp(state, pass, (u) => freeHome(state, u));
    for (const u of pass.units) if (live(state, pass, u)) finish(pass, u, 'HL: End Turn');
  } finally {
    costsHeld = null;
  }
  poolDying(pool, state.units.filter((u) => u.seat === FREE_SEAT));
}

/** a Free Cities unit's home: the centre of the Free City that granted it,
 *  else of the nearest Free City (the first of equals); -1 none */
function freeHome(state: GameState, u: Unit): number {
  const cities = state.freeSeat?.cities ?? [];
  const own = cities.find((c) => c.id === u.freeCity);
  if (own) return own.centerIndex;
  let best = -1;
  let bd = Infinity;
  for (const c of cities) {
    const d = plotDistance(state, u.tileIndex, c.centerIndex);
    if (d < bd) { bd = d; best = c.centerIndex; }
  }
  return best;
}

/** a player's tactical pass as it opens: its units in pool order, their AI
 *  types, their planning reach, its tactical target list (what it sees) */
export function openPass(state: GameState, seat: number, aiOf: (u: Unit) => number): Pass {
  const units = state.units.filter((u) => u.seat === seat && aiOf(u) >= 0).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const ai = new Map<number, number>();
  for (const u of units) ai.set(u.id, aiOf(u));
  const targets = tacticalTargets(state, seat, plotsSeenNow(state, new Set([seat])), null);
  const reach = new Map<number, Reach[]>();
  const plan = new Map<number, Planner>();
  for (const u of units) {
    const p = planUnit(state, u, targets);
    plan.set(u.id, p);
    reach.set(u.id, p.reach);
  }
  return { seat, strike: false, units, reach, done: new Set(), ai, targets, plan, danger: dangerPlane(state, seat), regions: seenRegions(state, seat) };
}

// THE BARBARIANS' RAID ("Raid City", BehaviorTrees.xml; the reading is
// tools/civ6lab/dll_readings.md "C-95: the barbarians' raid"): the tree's
// tick (0x7d3a00) as its nodes answer — each node's update in the walk, the
// root Sequence resuming at the child that ran, then every node that
// SUCCEEDED or RUNS executed in node order (0x7cb3d0).

/** a node's status in the walk */
const BT_OK = 1;
const BT_RUN = 2;
const BT_FAIL = 3;

/** the root Sequence's children */
const RAID_RECRUIT = 2;
const RAID_MARCH = 9;
const RAID_RAID = 12;
const RAID_HOME = 22;
const RAID_NOTIFY = 25;

/** the plot a unit of an operation stands on, -1 for a member killed */
function memberAt(state: GameState, id: number): Unit | null {
  return state.units.find((u) => u.id === id && isBarbSeat(u.seat)) ?? null;
}

/** the operation's living members in pool order (the engines take the pool
 *  slot for the team's order) */
function opMembers(state: GameState, op: BarbOp): Unit[] {
  return op.units.map((id) => memberAt(state, id)).filter((u): u is Unit => !!u)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/** nearest the goal first, then by pool slot; a member killed last */
const nearestFirst = (a: { u: Unit | null; d: number }, b: { u: Unit | null; d: number }): number =>
  a.d - b.d || (a.u?.slot ?? Infinity) - (b.u?.slot ?? Infinity) || 0;

/** every plot the unit's path finder closes (`pathTo`'s search with no
 *  end): the plots it has a path to */
function pathPlots(state: GameState, unit: Unit): Set<number> {
  const out = new Set<number>();
  search(state, unit, Infinity, true, (n) => {
    out.add(n.tile);
    return false;
  });
  return out;
}

/** a member's distance to the goal; a member killed stands off the map */
function goalDistance(state: GameState, u: Unit | null, goal: number): number {
  return u ? plotDistance(state, u.tileIndex, goal) : Infinity;
}

/** the operation's target is gone (0x73a8e0): no city centre stands on it */
function raidTargetGone(state: GameState, op: BarbOp): boolean {
  const t = state.map.tiles[op.target.plot];
  if (t.district === 'CITY_CENTER') return false;
  const cs = cityStateAt(state, t.index);
  return !(cs && cs.centerIndex === t.index);
}

/** a plot of the unit's planning (0x791300) within `turns`: with `range` 0
 *  the goal itself, else a plot exactly `range` from it with none of its own
 *  stacking there but its own plot (0x78fa10); `moves` asks Movement left */
function reachAt(state: GameState, pass: Pass, u: Unit, goal: number, turns: number, moves: boolean, range: number): number {
  for (const e of pass.reach.get(u.id) ?? []) {
    if (e.turns > turns || (moves && e.moves <= 0)) continue;
    if (range === 0 ? e.tile !== goal : plotDistance(state, e.tile, goal) !== range) continue;
    if (range > 0 && stackedAt(state, u, e.tile) && e.tile !== u.tileIndex) continue;
    return e.tile;
  }
  return -1;
}

/**
 * OPERATION MOVE'S UPDATE (0x81a130) for the operation's team: its members
 * not stored at the node (the node's list, kept while its goal holds)
 * nearest the goal first (a member killed last); the nearest within the
 * range — or its planning reaching a plot at the range this turn with
 * Movement left — has the team arrived, a stored member within the range
 * too. A goal of the target: arrived is SUCCESS. Else the members within
 * the unit distance of the goal, and of those in turn, are the team; more
 * than half outside it and it has not arrived. The list keeps the stored
 * members out of the unit distance of the others.
 */
function moveUpdate(state: GameState, pass: Pass, op: BarbOp, node: number, goal: number, target: boolean,
  range: number, spread: number): { status: number; arrived: boolean } {
  const stores = (op.store ??= {});
  const kept = stores[node]?.goal === goal ? stores[node].list : [];
  let list = kept.filter((id) => memberAt(state, id));
  const others: { id: number; u: Unit | null; d: number }[] = op.units
    .filter((id) => !list.includes(id))
    .map((id) => {
      const u = memberAt(state, id);
      return { id, u, d: goalDistance(state, u, goal) };
    });
  const sortOthers = () => others.sort(nearestFirst);
  sortOthers();
  let arrived = false;
  let reach = false;
  if (others.length) {
    arrived = others[0].d <= range;
    if (!arrived && others[0].u) reach = reachAt(state, pass, others[0].u, goal, 1, true, range) >= 0;
    if (!arrived) {
      const keep: number[] = [];
      for (const id of list) {
        const u = memberAt(state, id);
        if (!u) continue;
        if (goalDistance(state, u, goal) <= range) {
          arrived = true;
          reach = true;
          others.push({ id, u, d: goalDistance(state, u, goal) });
        } else keep.push(id);
      }
      list = keep;
    }
    if (arrived) {
      sortOthers();
      list = list.filter((id) => !others.some((o) => o.id === id));
    }
  } else {
    const stored = list.map((id) => ({ id, u: memberAt(state, id) })).filter((o) => o.u)
      .map((o) => ({ ...o, d: goalDistance(state, o.u, goal) })).sort(nearestFirst);
    if (stored.length) {
      others.push(stored[0]);
      list = list.filter((id) => id !== stored[0].id);
      arrived = stored[0].d <= range;
    }
  }
  if ((arrived || reach) && target) return { status: BT_OK, arrived: true };
  if (spread !== 0) {
    let end = others.findIndex((o) => o.d > spread);
    if (end < 0) end = others.length;
    for (;;) {
      let next = others.length;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        const near = o.u && others.slice(0, end).some((c) => c.u && plotDistance(state, c.u.tileIndex, o.u!.tileIndex) <= spread);
        if (!near) { next = i; break; }
      }
      if (next <= end) break;
      end = next;
    }
    if (2 * (others.length - end) >= others.length) arrived = false;
  }
  if (spread > 0 && list.length) {
    const keep: number[] = [];
    for (const id of list) {
      const u = memberAt(state, id);
      const near = u && others.some((o) => o.u && plotDistance(state, o.u.tileIndex, u.tileIndex) <= spread);
      if (u && !near) { keep.push(id); continue; }
      if (u && goalDistance(state, u, goal) <= range) arrived = true;
    }
    list = keep;
  }
  stores[node] = { list, goal };
  return { status: arrived ? BT_OK : BT_RUN, arrived };
}

/** the goal barred to the unit (0x586360, 0x5862e0, 0x585eb0): no path to
 *  it, a unit at war with it there, or one of its own that stacks with it */
function moveBarred(state: GameState, u: Unit, goal: number, paths: ReadonlySet<number>): boolean {
  if (!paths.has(goal)) return true;
  if (enemyAt(state, u, goal)) return true;
  return stackedAt(state, u, goal) || foreignAt(state, u, goal);
}

/**
 * OPERATION MOVE'S EXECUTION (0x816cb0): nothing where the update found the
 * team arrived; else each member left with Movement, nearest the goal
 * first, takes a move order (0x962030): its radius the smaller of the
 * node's range and its attack range (0 for a ship), at least 1 where the
 * goal is barred to it (`moveBarred`); the first plot of its planning of two
 * turns at the radius (0x791300) where it lies in the goal's region, else of
 * the plots within the radius of the goal (the ring walk 0x6aef0, the test
 * 0x815d50) one in the goal's region before one outside, then the nearest
 * it, its own plot or one with none of its own and a path to it; none, the
 * goal with the attack flag.
 */
function moveExec(state: GameState, pass: Pass, op: BarbOp, goal: number, range: number, arrived: boolean): void {
  if (arrived) return;
  const region = state.map.tiles[goal].region ?? -1;
  const movers = op.units.map((id) => memberAt(state, id))
    .filter((u): u is Unit => !!u && canAct(state, pass, u))
    .map((u) => ({ u, d: plotDistance(state, u.tileIndex, goal) }))
    .sort(nearestFirst).map((x) => x.u!);
  for (const u of movers) {
    if (!canAct(state, pass, u)) continue;
    let r = UNITS[u.type]?.naval ? 0 : Math.min(range, rangeOf(u));
    const paths = pathPlots(state, u);
    if (u.tileIndex !== goal && moveBarred(state, u, goal, paths)) r = Math.max(1, r);
    let dest = goal;
    let strike = false;
    const p = reachAt(state, pass, u, goal, PLAN_TURNS, false, r);
    if (p >= 0 && region >= 0 && (state.map.tiles[p].region ?? -1) === region) dest = p;
    else if (r > 0) {
      let best = -1;
      let bestD = -1;
      let bestIn = false;
      for (const q of ringPlots(state, goal, r)) {
        const inRegion = (state.map.tiles[q].region ?? -1) === region;
        const d = plotDistance(state, u.tileIndex, q);
        if (bestD >= 0) {
          if (inRegion === bestIn && d >= bestD) continue;
          if (inRegion !== bestIn && !inRegion) continue;
        }
        if (q !== u.tileIndex && state.units.some((x) => x !== u && x.tileIndex === q && x.seat === u.seat)) continue;
        if (q !== u.tileIndex && !paths.has(q)) continue;
        best = q;
        bestD = d;
        bestIn = inRegion;
      }
      if (best >= 0) dest = best;
      else strike = true;
    }
    finish(pass, u, 'Operation', dest);
    moveTo(state, u, dest, strike);
  }
}

/** OPERATION ATTACK UNITS' "nearby" targets (0x80bd20 -> 0x80c080): the unit
 *  targets of the list (a civilian through a HIGH unit) not the player's own
 *  within max(2, its Movement left) of a member */
function opNearbyTargets(state: GameState, pass: Pass, units: readonly Unit[]): Target[] {
  return pass.targets.filter((e) => {
    if (!['CIVILIAN', 'RELIGIOUS', 'TRADER', 'LOW', 'MEDIUM', 'HIGH'].includes(e.type)) return false;
    const v = targetUnit(state, e);
    if (!v || v.seat === pass.seat) return false;
    return units.some((u) => plotDistance(state, u.tileIndex, v.tileIndex) <= Math.max(2, Math.floor(u.movesLeft / MP_SCALE)));
  });
}

/**
 * OPERATION ATTACK UNITS' EXECUTION (0x80ceb0): the team's members left with
 * Movement on land (a bombard unit only against a city of another player,
 * or a DEFENDER), the list's unit targets near them (`opNearbyTargets`),
 * the assignment (0x776140) dropping a spot that would kill the unit — and
 * one of a losing exchange for a team of one — carried out (0x771f80).
 */
function opAttackExec(state: GameState, pass: Pass, op: BarbOp): void {
  const cityTarget = !raidTargetGone(state, op) && tileSeat(state.map.tiles[op.target.plot]) !== pass.seat;
  const units = opMembers(state, op).filter((u) => canAct(state, pass, u)
    && !UNITS[u.type]?.naval && (UNITS[u.type]?.bombard === undefined || cityTarget || pass.ai.get(u.id) === AI_DEFENDER));
  if (!units.length) return;
  const targets = opNearbyTargets(state, pass, units);
  if (!targets.length) return;
  carryOut(state, pass, assignTo(state, pass, units, targets, units.length === 1, true), 'Operation');
}

/**
 * OPERATION PILLAGE'S EXECUTION (0x811390): each IMPROVEMENT, then each
 * PASSIVE_DISTRICT target of the list in its order, on the ground of the
 * target's city, unpillaged: the first member standing on it with Movement
 * left, on land and with no bombard strength, pillages it (0x963190).
 */
function opPillageExec(state: GameState, pass: Pass, op: BarbOp): void {
  const tt = state.map.tiles[op.target.plot];
  for (const e of pass.targets) {
    if (e.type !== 'IMPROVEMENT' && e.type !== 'PASSIVE_DISTRICT') continue;
    const t = state.map.tiles[e.tile];
    if (tileSeat(t) !== tileSeat(tt) || tileCity(t) !== tileCity(tt)) continue;
    if (e.type === 'IMPROVEMENT' ? (!t.improvement || t.pillaged) : (!t.districtComplete || t.districtPillaged)) continue;
    const u = opMembers(state, op).find((x) => canAct(state, pass, x)
      && x.tileIndex === e.tile && !UNITS[x.type]?.naval && UNITS[x.type]?.bombard === undefined);
    if (!u) continue;
    if (hostilePillage(state, u)) dropHeldCosts();
    finish(pass, u, 'Operation', e.tile);
  }
}

/**
 * A RAID'S TICK ("Raid City"): the recruit (nodes 2-8, `opTurn`) until its
 * force is whole or its limiter ends it; the march (Concurrent 9: Operation
 * Attack Units 10, Operation Move 11 to the target, range 2); the raid
 * (Priority 12: Barbarian Raid Check 13 — the tribe's score at 10 ends it —
 * else the Turn Limiter 14, at least 10 turns, over Concurrent 15: Attack
 * Units 16, Operation Pillage 17, In Difficulty Range 18 over Operation
 * Attack City 19, Operation Defend Units 20, Operation Move 21 about the
 * target, range 3); the way home (Concurrent 22: Attack Units 23, Operation
 * Move 24 to the rally, range 1, unit distance 4); Notify Owner 25. A child
 * that RUNS ends the walk, the root resuming there next turn; a FAILURE
 * ends the tree. Operation Attack Units' update SUCCEEDS; Operation Pillage's
 * FAILS once the operation holds no living unit. The tick runs no
 * Operation Attack City (In Difficulty Range admits it against a target owner
 * at Immortal or above) and moves no unit under Operation Defend Units.
 */
function raidTick(state: GameState, pass: Pass, tr: BarbTribe, op: BarbOp): void {
  const exec: (() => void)[] = [];
  let root = op.resume ?? RAID_RECRUIT;
  const end = (status: number) => {
    if (status === BT_RUN) op.resume = root;
    else {
      op.done = true;
      delete op.resume;
    }
  };
  if (root === RAID_RECRUIT) {
    if (!op.recruited) opTurn(state, tr, op);
    if (!op.recruited) return end(BT_RUN);
    root = RAID_MARCH;
  }
  const target = op.target.plot;
  if (root === RAID_MARCH) {
    exec.push(() => opAttackExec(state, pass, op));
    const mv = moveUpdate(state, pass, op, 11, target, true, RAID_MARCH_RANGE, RAID_MARCH_SPREAD);
    exec.push(() => moveExec(state, pass, op, target, RAID_MARCH_RANGE, mv.arrived));
    if (mv.status !== BT_OK) {
      exec.forEach((f) => f());
      return end(mv.status);
    }
    root = RAID_RAID;
  }
  if (root === RAID_RAID) {
    let status = BT_OK;
    if ((tr.score ?? 0) < RAID_SCORE) {
      op.raidFrom ??= state.turn;
      exec.push(() => opAttackExec(state, pass, op));
      const alive = op.units.some((id) => memberAt(state, id));
      let conc = BT_OK;
      if (!raidTargetGone(state, op) && !alive) conc = BT_FAIL;
      else {
        exec.push(() => opPillageExec(state, pass, op));
        const mv = moveUpdate(state, pass, op, 21, target, true, RAID_RANGE, 1);
        exec.push(() => moveExec(state, pass, op, target, RAID_RANGE, mv.arrived));
        conc = Math.max(conc, mv.status);
      }
      const elapsed = state.turn - op.raidFrom;
      if (elapsed <= RAID_TURNS && conc !== BT_FAIL) status = BT_RUN;
      else if (conc === BT_RUN && elapsed >= Math.trunc(RAID_TURNS * COST_MULTIPLIER_PCT / 100)) status = BT_OK;
      else status = conc;
    }
    if (status !== BT_OK) {
      exec.forEach((f) => f());
      return end(status);
    }
    root = RAID_HOME;
  }
  if (root === RAID_HOME) {
    const rally = op.rally ?? tr.plot;
    exec.push(() => opAttackExec(state, pass, op));
    const mv = moveUpdate(state, pass, op, 24, rally, false, RAID_HOME_RANGE, RAID_HOME_SPREAD);
    exec.push(() => moveExec(state, pass, op, rally, RAID_HOME_RANGE, mv.arrived));
    if (mv.status !== BT_OK) {
      exec.forEach((f) => f());
      return end(mv.status);
    }
    root = RAID_NOTIFY;
  }
  exec.forEach((f) => f());
  // NOTIFY OWNER (0x7c6fa0 -> the tribe's 0x148270): the raid's city goes to
  // the tribe's city assault list — the assault (0x1497d0) refuses while the
  // raid stands
  (tr.assaultTargets ??= []).push(op.target);
  end(BT_OK);
}

/**
 * THE BARBARIANS' OPERATIONS' TREES (the operation manager 0x727510, in
 * the player's turn before its tactical pass): each tribe's operation in
 * the tribes' order: a raid's tick (`raidTick`), a city assault's
 * recruit.
 */
function barbarianOpTrees(state: GameState, pass: Pass): void {
  for (const tr of state.barbTribes ?? []) {
    const op = tr.op;
    if (!op || op.done) continue;
    if (!op.assault) raidTick(state, pass, tr, op);
    else if (!op.recruited) opTurn(state, tr, op);
  }
}

/** the units a stand-in still moves, at the game's moves not yet ported: a
 *  city assault's */
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
 * planning reach taken before any moves (0x792c90), the operations' trees
 * (`barbarianOpTrees`), then the moves in the
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
  const all = state.units.filter((u) => isBarbSeat(u.seat) && acting.has(u.id))
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const ai = new Map<number, number>();
  for (const u of all) ai.set(u.id, aiTypeOf(state, u));
  const seen = plotsSeenNow(state, new Set([BARB_SEAT]));
  const ex = state.barbSeat.explored;
  const targets = tacticalTargets(state, BARB_SEAT, seen, ex.length ? ex : null);
  const reach = new Map<number, Reach[]>();
  const plan = new Map<number, Planner>();
  for (const u of all) {
    if (ai.get(u.id)! < AI_EXPLORE) continue;
    const p = planUnit(state, u, targets);
    plan.set(u.id, p);
    reach.set(u.id, p.reach);
  }
  const pass: Pass = { seat: BARB_SEAT, strike: true, units: all, reach, done: new Set(), ai, targets, plan,
    danger: dangerPlane(state, BARB_SEAT), regions: seenRegions(state, BARB_SEAT) };
  // the operations' trees first (their manager's job opens the player's
  // turn); then an operation's units are the operation's
  barbarianOpTrees(state, pass);
  const opUnits = new Set<number>();
  const assaults = new Set<number>();
  for (const tr of state.barbTribes ?? []) {
    for (const id of tr.op?.units ?? []) {
      opUnits.add(id);
      if (tr.op?.assault) assaults.add(id);
    }
  }
  standIn(state, pass, 'Operation', (u) => assaults.has(u.id));
  for (const id of opUnits) pass.done.add(id);
  pass.units = all.filter((u) => !opUnits.has(u.id) && tacticalUnit(state, u, ai.get(u.id)!));
  rampage(state, pass);
  attackUnits(state, pass, 'HIGH');
  defendCamps(state, pass);
  attackCivilians(state, pass);
  plunderTraders(state, pass);
  coastalRaids(state, pass);
  pillage(state, pass, true);
  pillage(state, pass, false);
  attackUnits(state, pass, 'MEDIUM');
  moveToSafety(state, pass);
  attackUnits(state, pass, 'LOW');
  chaseTarget(state, pass);
  wanderNearCamp(state, pass, (u) => {
    const tr = tribeOf(state, u.id);
    return tr?.alive ? tr.plot : -1;
  });
  // THE HOMELAND ("Default Barbarian HL") takes every unit left: Plunder
  // Trader, Move To Safety, Explore Land
  pass.units = all;
  homelandPlunder(state, pass);
  homelandSafety(state, pass);
  exploreLand(state, pass);
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
 * units' AI (`barbarianTactics`: their operations' trees, then their
 * tactical pass), then their scouts (`barbarianScouts`).
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
  barbarianScouts(state);
  barbSlotsDying(state);
}
