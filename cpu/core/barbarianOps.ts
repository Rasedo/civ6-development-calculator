/**
 * THE BARBARIANS' OPERATIONS AND TREES on the one operation manager
 * (cpu/core/operations; the readings are tools/civ6lab/dll_readings.md
 * "C-95: the barbarians' raid" and "C-95: the scout's tree"). The barbarian
 * player's manager state is `barbSeat.ops`; a tribe starts its raid
 * ("Barbarian Attack", the tree "Raid City") or its city assault
 * ("Barbarian City Assault", "Barbarian City Attack") through the manager's
 * start by name (0x149980 / 0x1497d0), the tree's Tribe tag its index, the
 * assault against the target's owner; a scout that saw a city walks home
 * under the tree "Barbarian Found City" (`homing`). The player's turn: the
 * military AI's part logs and refreshes the operations
 * (`barbarianOpsTurn`, in the tactical pass once the knowledge base aged and
 * looked); then, once each unit's planning is taken, every tree ticks in the
 * order it was made
 * (`barbarianTrees`), and the trees' units are theirs. The barbarians weigh
 * no candidate, and a member killed stays in its team.
 */
import type { BarbHoming, BarbTarget, BarbTribe, GameState, Unit } from './types';
import { BARB_SEAT, isBarbSeat } from './seats';
import { aiView } from './aiView';
import { passOrders, passView } from './opsOrders';
import { recentOf } from './minorOps';
import { newOpsAi, operationsRefresh, opsOf, startOperationAt, tickOperation, type OpsAi, type OpsEnv } from './operations/manager';
import { evaluate, type Candidate, type EvalInputs } from './operations/evaluate';
import { NO_PLOT, addMember, opDef, opUnits, type Operation } from './operations/operation';
import type { BarbarianHooks } from './operations/barbarian';
import { BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SUCCESS, compileTree, dataBool, dataFloat, dataInt, dataTag, tick, type BtHandler, type BtNode, type BtRun } from './behaviorTree';
import { AI_OP_DEFS, AI_TREES } from '../data/aiOperations';
import { moveTo, passEnd, passPillage, passReachAt, passSafePlot, turnsToPlot, type Pass } from './tactical';
import { barbUnitFor, handicapOf, raidBoldness } from './barbarians';
import { BARB_TAG_UNITS, barbForce, type BarbTag } from '../data/barbarians';
import { gameTypeOf } from '../data/aliases';
import { UNIT_HP } from '../data/units';
import type { AiUnitView, AiView } from './aiViewTypes';

/** the definitions the tribes start */
export const BARB_RAID_DEF = 'Barbarian Attack';
export const BARB_ASSAULT_DEF = 'Barbarian City Assault';
/** the definition a capture starts (BarbarianTriggeredTrees:
 *  TRIGGER_CAPTURE_BARBARIAN, the tree "Escort Worker To Camp") */
export const BARB_CAPTURE_DEF = 'Barbarian Builder Capture';
/** the trees' priorities: the highest of the barbarians' definitions (the
 *  City Assault's 4) first; a scout's tree 3 (its requestPriority in the
 *  game's AI memory, runs/h1_duely1128 "Barbarian Found City") */
export const BARB_TREE_TOP_PRIORITY = Math.max(...[BARB_RAID_DEF, BARB_ASSAULT_DEF, BARB_CAPTURE_DEF].map((d) => AI_OP_DEFS[d].priority));
export const BARB_SCOUT_PRIORITY = 3;

/** THE CAPTURES HELD: the action replay's captures are the record's, landed
 *  before the barbarians' turn; it names whether one starts its operation
 *  now (`ticked`: the units of the operations the walk has ticked so far,
 *  null at the turn's end) by its captor; null outside a replay */
let captureHeld: ((capture: { captive: number; captor: number }, ticked: ReadonlySet<number> | null) => boolean) | null = null;
export function holdBarbCaptures(held: typeof captureHeld): void {
  captureHeld = held;
}

/** the replay's view of the barbarians' operation lines (null off) */
let tracer: ((line: string) => void) | null = null;
export function traceBarbOps(fn: ((line: string) => void) | null): void {
  tracer = fn;
}

const opsOfBarbs = (state: GameState): OpsAi => (state.barbSeat.ops ??= newOpsAi(BARB_SEAT));

/** the operation of the id, null where none runs */
export function barbOp(state: GameState, id: number): Operation | null {
  return state.barbSeat.ops ? opsOf(state.barbSeat.ops).find((o) => o.id === id) ?? null : null;
}

/** the barbarians' view: their units in their pool's order; in their
 *  tactical pass, the pass's target list, planning reaches, spots, blows */
function barbView(state: GameState, pass: Pass | null): AiView {
  const base = aiView(state);
  const own = (): AiUnitView[] => {
    const ids = state.units.filter((u) => isBarbSeat(u.seat)).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((u) => u.id);
    const byId = new Map(base.units(BARB_SEAT).map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  };
  const v: AiView = { ...base, units: (i) => (i === BARB_SEAT ? own() : base.units(i)) };
  return pass ? passView(state, BARB_SEAT, pass, v) : v;
}

const tribeAt = (state: GameState, k: number): BarbTribe | undefined => state.barbTribes?.[k];

/** the camps the barbarians' knowledge base holds: every camp, in plot
 *  order (their own camps, each seen by its defender) */
const campsKnown = (state: GameState): number[] => state.barbSeat.campsKnown ?? [];

const unitOf = (state: GameState, id: number): Unit | undefined => state.units.find((u) => u.id === id && isBarbSeat(u.seat));

/** BARBARIAN SPAWN CHANGE's execution (0x7c6e50) on tribe `k`: its spawn
 *  interval the force's SpawnRate (`rate`, the force of a raiding party or
 *  not, by the target owner's handicap), else back to its own */
export function barbSpawnChange(state: GameState, k: number, rate: boolean, raiding: boolean): void {
  const tr = tribeAt(state, k);
  if (!tr) return;
  const force = rate && tr.op ? barbForce(tr.kind, raiding, handicapOf(state, tr.op.target.seat)) : undefined;
  if (force) tr.every = force.rate;
  else if (!rate) delete tr.every;
}

/** what the barbarians' nodes ask of a tribe */
function hooksOf(state: GameState): BarbarianHooks {
  return {
    spawnChange: (k, rate, raiding) => barbSpawnChange(state, k, rate, raiding),
    // the force (0x7c7580: the BarbarianAttackForces row by the target
    // owner's handicap, each class the barbarians cannot raise dropped,
    // 0x144610) from the tribe's units of each class, those raised this turn
    // not yet among them, in the unit evaluator's walk (0x60a8c0: the
    // player's units +0x12e8 -> +0xd8, the pool's slot order; runs/h1_duelw1127
    // t35 the Warrior of slot 5 before the older one of slot 16); whole, it
    // joins the operation's team; else the rest is asked for, melee first
    recruit(k, op, raiding) {
      const tr = tribeAt(state, k);
      if (!tr || !tr.op) return false;
      const force = barbForce(tr.kind, raiding, handicapOf(state, tr.op.target.seat));
      const fresh = new Set(tr.fresh ?? []);
      // the unit evaluator's walk (0x60a8c0): the player's units unassigned
      // (+0x7d0 -1), alive, in the pool's slot order; the tribe's request
      // (0x7c62f0) fills each class's count in that order, and a later unit
      // of the class with less damage (+0xcf0) takes the place of the first
      // held one with more
      const inOps = new Set(opsOf(opsOfBarbs(state)).flatMap((o) => opUnits(o)));
      const free = tr.units.filter((id) => unitOf(state, id) && !fresh.has(id) && !inOps.has(id))
        .sort((a, b) => (unitOf(state, a)!.slot ?? 0) - (unitOf(state, b)!.slot ?? 0));
      const damage = (id: number) => UNIT_HP - unitOf(state, id)!.hp;
      const taken: number[] = [];
      // the units it lacks asked for by their class (0x155b50: the class's
      // name, its unit chosen when the tribe raises it, 0x144fb0 -> 0x147470)
      const missing: BarbTag[] = [];
      for (const [tag, n] of force?.units ?? []) {
        if (!barbUnitFor(state, tag)) continue;
        const held: number[] = [];
        for (const id of free) {
          const u = unitOf(state, id)!;
          if (taken.includes(id) || !BARB_TAG_UNITS[tag].includes(u.type)) continue;
          if (held.length < n) {
            held.push(id);
            continue;
          }
          const k = held.findIndex((h) => damage(id) < damage(h));
          if (k >= 0) held[k] = id;
        }
        taken.push(...held);
        for (let j = held.length; j < n; j++) missing.push(tag);
      }
      if (missing.length) {
        tr.queue = missing;
        return false;
      }
      // the operation's units listed by the player's walk (0x6092c0) join in
      // slot order
      taken.sort((a, b) => (unitOf(state, a)!.slot ?? 0) - (unitOf(state, b)!.slot ?? 0));
      for (const id of taken) addMember(op.teams[0], { id, type: gameTypeOf('unit', unitOf(state, id)!.type, 'UNIT_') });
      return true;
    },
    score: (k) => tribeAt(state, k)?.score ?? 0,
    // NOTIFY OWNER (0x148270): the raid's tree offers its city to the city
    // assault, which refuses while the raid stands — the city to the
    // tribe's assault list; the assault's own tree adds nothing (a city goes
    // to the raid list only from a bribed tribe)
    notify(k, op) {
      const tr = tribeAt(state, k);
      if (!tr?.op || tr.op.id !== op.id || tr.op.assault) return;
      (tr.assaultTargets ??= []).push(tr.op.target);
    },
  };
}

/** the orders of a turn part outside the barbarians' pass: none is given */
const refuse = (): never => {
  throw new Error('the barbarians\' operations order their units in their tactical pass alone');
};
const outsidePass: Pick<OpsEnv, 'move' | 'strike' | 'attack' | 'moveUpdate' | 'moveExec'> = {
  move: refuse, strike: refuse, attack: refuse, moveUpdate: refuse, moveExec: refuse,
};

function barbEnv(state: GameState, pass: Pass | null): OpsEnv {
  let view: AiView | null = null;
  const fresh = () => (view ??= barbView(state, pass));
  const changed = () => {
    view = null;
  };
  const none = (): never => {
    throw new Error('the barbarians\' operations hold no contracts');
  };
  return {
    turn: state.turn,
    view: fresh,
    defs: [],
    army: (p) => recentOf(state.barbSeat, p),
    camps: () => campsKnown(state),
    known: () => [],
    threat: () => -1,
    book: none,
    newContractId: none,
    contractCities: () => [],
    clearProduction: none,
    newOpId: () => newBarbTreeId(state),
    settle: null,
    unitRows: () => [],
    // a unit action row of theirs: a pillage where the unit stands
    act: (rows) => {
      if (!pass) refuse();
      const v = fresh();
      const units = v.units(BARB_SEAT);
      const pillage = v.unitActionColumn('PILLAGE');
      for (const row of rows) {
        row.forEach((a, col) => {
          if (a < 0) return;
          if (a !== pillage) throw new Error(`the barbarians' operations give no action ${a}`);
          const u = unitOf(state, units[col].id);
          if (u) passPillage(state, pass!, u);
        });
      }
      changed();
    },
    ...(pass ? passOrders(state, BARB_SEAT, pass, changed) : outsidePass),
    barbarian: hooksOf(state),
    ownAiType: () => {
      throw new Error('the barbarians\' operations recruit through Barbarian Recruit alone');
    },
    log: (l) => tracer?.(l),
    logEval: () => undefined,
  };
}

/**
 * A TRIBE STARTS ITS RAID OR ITS CITY ASSAULT (0x149980 / 0x1497d0): never
 * beside another; the manager's start by name with the city's plot, the
 * target set (0x73e7d0) — the rally the tribe's camp —, the assault against
 * the city's owner (op +0x2a0), the tree's Tribe tag the tribe.
 * Whether it started; its tree ticks in the trees' walk.
 */
export function barbOpStart(state: GameState, tribe: BarbTribe, target: BarbTarget, assault: boolean): boolean {
  if (tribe.op) return false;
  const ai = opsOfBarbs(state);
  const env = barbEnv(state, null);
  const op = startOperationAt(ai, env, assault ? BARB_ASSAULT_DEF : BARB_RAID_DEF, assault ? target.seat : -1, target.plot, tribe.plot);
  op.triggerValue = (state.barbTribes ?? []).indexOf(tribe);
  tribe.op = { id: op.id, assault, target };
  return true;
}

/** the tribe's operation still runs */
export const barbOpLive = (state: GameState, tribe: BarbTribe): boolean => !!tribe.op && !!barbOp(state, tribe.op.id);

/** the nodes of a definition's tree the twins compare: the Sequence the
 *  trigger opens (its resume), the Turn Limiter over Barbarian Recruit and
 *  the raid's Turn Limiter (Limit Is Min) — their first turns; -1 none */
function treeMarks(def: string): { seq: number; recruit: number; raid: number } {
  const nodes = compileTree(def, AI_TREES[AI_OP_DEFS[def].tree ?? ''] ?? []);
  const decode = nodes.findIndex((n) => n.type === 'Decode Trigger');
  const rec = nodes.findIndex((n) => n.type === 'Barbarian Recruit');
  return {
    seq: decode >= 0 ? nodes[decode].parent : -1,
    recruit: rec >= 0 ? nodes[rec].parent : -1,
    raid: nodes.findIndex((n) => n.type === 'Turn Limiter' && n.data['Limit Is Min']?.value === 'true'),
  };
}

/** the tribe's operation as the twins compare it: its kind (0 none, 1 a
 *  raid, 2 an assault), the target's owner and plot, the rally, the player
 *  it is against, its tree's id, the child its trigger's Sequence resumes
 *  at, the first turns of its recruit's and its raid's Turn Limiters, its
 *  members living and killed */
export function barbOpRecord(state: GameState, tribe: BarbTribe): number[] {
  const op = tribe.op ? barbOp(state, tribe.op.id) : null;
  if (!tribe.op || !op) return [0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0];
  const m = treeMarks(op.def);
  const at = (i: number, k: string): number => (i >= 0 && typeof op.mem[i][k] === 'number' ? (op.mem[i][k] as number) : -1);
  const members = opUnits(op);
  const living = members.filter((id) => unitOf(state, id)).length;
  return [tribe.op.assault ? 2 : 1, tribe.op.target.seat, op.target, op.rally, op.enemy, op.id,
    at(m.seq, 'resume'), at(m.recruit, 'start'), at(m.raid, 'start'), living, (op.killed ?? 0) + members.length - living];
}

/**
 * THE BARBARIANS' OPERATIONS' RUN in their tactical pass (the operation
 * manager 0x727510, opening the player's turn): each running operation's
 * target and teams logged and refreshed, its tree ticked, in slot order;
 * their units' turns are the operations'. The ids of the operations' units.
 */
export function barbarianOpsTurn(state: GameState): void {
  const ai = state.barbSeat.ops;
  if (!ai || !opsOf(ai).length) return;
  const env = barbEnv(state, null);
  // the members killed leave their teams, counted to their operation
  for (const op of opsOf(ai)) {
    for (const t of op.teams) {
      const living = t.members.filter((id) => unitOf(state, id));
      const gone = t.members.length - living.length;
      if (!gone) continue;
      t.members = living;
      op.killed = (op.killed ?? 0) + gone;
    }
  }
  // a running operation's candidate names its backup (0x727510 -> 0x73e610,
  // before the operations' strengths are refreshed at 0x727c74): its target
  // from its own, at the strength its last refresh left (none on the turn
  // after its start); a camp's enemy strength the walk's 6 alone, the
  // barbarians' army about it counted only for another player (0x7476f9)
  const view = env.view();
  const inputs: EvalInputs = {
    settle: null, camps: campsKnown(state), taken: new Set(opsOf(ai).map((o) => o.target)), known: () => view.knownCities(BARB_SEAT),
    army: (p) => (p === BARB_SEAT ? [] : env.army(p)),
  };
  for (const op of opsOf(ai)) {
    const c: Candidate = { def: opDef(op), enemy: op.enemy, presetRally: op.target, presetStrength: op.strength, op,
      valid: false, odds: 0, value: 0, target: NO_PLOT, rally: NO_PLOT };
    evaluate(view, BARB_SEAT, c, [], inputs);
    if (c.valid) op.backup = { target: c.target, rally: c.rally, enemy: c.enemy };
  }
  operationsRefresh(ai, env);
}

/**
 * THE CAPTURES' OPERATIONS (AI_EVENT_UNIT_CAPTURED
 * from the capture 0x212500, the triggered tree 0x800c60): each capture
 * starts "Barbarian Builder Capture" by name (0x7265b0) on the captive's
 * plot, its rally the plot, the event's units — the captive, then its
 * captor — joining its team (0x737e80), the captor leaving the operation it
 * held. A capture inside the trees' walks starts at once and its tree ticks
 * in its priority's walk where that is yet to come (`barbarianTrees`); one
 * of the tactical pass after them first ticks in the next turn's walk.
 */
export function barbarianCaptures(state: GameState, ticked: ReadonlySet<number> | null = null): void {
  const caps = state.barbCaptures ?? [];
  delete state.barbCaptures;
  if (!caps.length) return;
  const ai = opsOfBarbs(state);
  for (const c of caps) {
    const { captive, captor } = c;
    const cu = unitOf(state, captive);
    if (!cu) continue;
    if (captureHeld && !captureHeld(c, ticked)) {
      (state.barbCaptures ??= []).push(c);
      continue;
    }
    const units = [cu, unitOf(state, captor)].filter((u): u is Unit => !!u);
    for (const o of opsOf(ai)) for (const t of o.teams) t.members = t.members.filter((id) => !units.some((u) => u.id === id));
    const op = startOperationAt(ai, barbEnv(state, null), BARB_CAPTURE_DEF, -1, cu.tileIndex, cu.tileIndex);
    op.triggerUnits = units.map((u) => u.id);
    for (const u of units) addMember(op.teams[0], { id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_') });
  }
}

/** a tree's id: the tree manager's pool generation over its slot (0x7fef20:
 *  +0x28 += 0x10000, or'd with the slot) */
const TREE_SLOT = 0x10000;
export const treeSlot = (id: number): number => id % TREE_SLOT;

/** THE POOL AS THE GAME OPENS: slots 0 and 1 held for good by the
 *  barbarians' two standing controls (no tree: the AI memory reader lists
 *  the trees alone), generation 2 a control gone before the first tree, so
 *  the first tree is generation 3 in slot 2 (runs/h1_duely1117, 1121, 1124,
 *  1127, 1128: each one's first barbarian tree 196610) */
export const BARB_TREE_HELD = 2;
export const BARB_TREE_FIRST_GEN = 3;

/**
 * A NEW TREE OF THE BARBARIANS (the tree manager's pool +0x3a0, 0x7fef20):
 * the slot its free list's head names — the last one freed — else the
 * pool's next new slot; the pool's list of trees kept in slot order. Its id
 * the next generation over the slot.
 */
export function newBarbTreeId(state: GameState): number {
  const seat = state.barbSeat;
  const gen = seat.opsNext ?? BARB_TREE_FIRST_GEN;
  seat.opsNext = gen + 1;
  const free = (seat.treeFree ??= []);
  let slot = free.pop();
  if (slot === undefined) {
    slot = seat.treeSlots ?? BARB_TREE_HELD;
    seat.treeSlots = slot + 1;
  }
  return gen * TREE_SLOT + slot;
}

/** THE POOL'S DESTROY LOOP after the walk (0x7ffdd0 -> 0x7cb2e0): each slot
 *  past the standing controls' whose tree ended goes to the free list's
 *  head, in slot order (the last freed, the highest, taken first) */
function freeEndedTrees(state: GameState): void {
  const seat = state.barbSeat;
  const live = new Set([...(seat.ops ? opsOf(seat.ops).map((o) => o.id) : []),
    ...(state.barbTribes ?? []).flatMap((t) => (t.homing ? [t.homing.id] : []))].map(treeSlot));
  const free = (seat.treeFree ??= []);
  for (let s = BARB_TREE_HELD; s < (seat.treeSlots ?? BARB_TREE_HELD); s++) if (!live.has(s) && !free.includes(s)) free.push(s);
}

/**
 * THE BARBARIANS' TREES' TICK in their tactical pass (the tree manager's
 * tick 0x7ffdd0, list C of the player's turn, once each unit's planning is
 * taken): once per priority, the highest first, each tree of the player of
 * that priority — its operations' (their definitions' Priority) and its
 * scouts' (`BARB_SCOUT_PRIORITY`) — in the pool's slot order (0x7cb3d0:
 * tree +0x548), a tree a tree's order starts ticking in its own priority's
 * walk where that walk is yet to come, or in the same walk where its slot
 * lies past the one ticking (one reusing a freed slot before it waits for
 * the next turn: runs/h1_duelw1105 log t12, tribe 4's raid in tribe 0's
 * scout's old slot 0 first recruits at t13, its Warriors from t14). A
 * capture an operation's blow takes starts its operation there
 * (`barbarianCaptures`): runs/h1_duely1128 t35 / t37, the City Assault's
 * (priority 4) Warrior takes China's Settler on 16:13 and the capture's
 * "Escort Worker To Camp" (priority 3) ticks in the walk after it —
 * Started, Operation Move, Change Target INVALID, complete. The trees that
 * ended free their slots after the walks. The operations' units' turns are
 * their operations'; a scout its tree moved has its turn ended. The ids of
 * the units the trees held.
 */
export function barbarianTrees(state: GameState, pass: Pass): Set<number> {
  const held = new Set<number>();
  const ai = opsOfBarbs(state);
  for (let priority = BARB_TREE_TOP_PRIORITY; priority >= 0; priority--) {
    for (let last = -1; ;) {
      const ops = opsOf(ai).filter((o) => opDef(o).priority === priority && treeSlot(o.id) > last);
      const scouts = priority === BARB_SCOUT_PRIORITY ? (state.barbTribes ?? []).filter((t) => t.homing && treeSlot(t.homing.id) > last) : [];
      const op = ops.reduce<Operation | null>((a, o) => (!a || treeSlot(o.id) < treeSlot(a.id) ? o : a), null);
      const tr = scouts.reduce<BarbTribe | null>((a, t) => (!a || treeSlot(t.homing!.id) < treeSlot(a.homing!.id) ? t : a), null);
      if (!op && !tr) break;
      if (op && (!tr || treeSlot(op.id) < treeSlot(tr.homing!.id))) {
        last = treeSlot(op.id);
        for (const id of opUnits(op)) held.add(id);
        tickOperation(ai, barbEnv(state, pass), op);
        for (const id of opUnits(op)) held.add(id);
      } else {
        last = treeSlot(tr!.homing!.id);
        tickScout(state, pass, tr!);
      }
      barbarianCaptures(state, held);
    }
  }
  freeEndedTrees(state);
  for (const id of held) pass.done.add(id);
  return held;
}

// THE SCOUT'S TREE ("Barbarian Found City", the tribes' ScoutingBehaviorTree;
// the reading is tools/civ6lab/dll_readings.md "C-95: the scout's tree"):
// Sequence 0 over Decode Trigger 1 (its Location the camp, "Home Camp"; its
// Value the tribe, "Tribe Index"), Concurrent 2 over Protect Unit 3 and Move
// Unit 4, then Notify Owner 5.

export const BARB_SCOUT_TREE = 'Barbarian Found City';

let scoutNodes: BtNode[] | null = null;
const scoutTreeNodes = (): BtNode[] => (scoutNodes ??= compileTree(BARB_SCOUT_TREE, AI_TREES[BARB_SCOUT_TREE] ?? []));

interface ScoutCtx {
  state: GameState;
  pass: Pass;
  tribe: BarbTribe;
  home: BarbHoming;
}

/** the tree's units: its scout while it lives */
const scoutUnits = (c: ScoutCtx): Unit[] => {
  const u = unitOf(c.state, c.home.scout);
  return u ? [u] : [];
};

const tagged = (run: BtRun, node: BtNode, name: string): unknown => {
  const t = dataTag(node, name);
  return t ? run.blackboard.get(t) : undefined;
};

/** Protect Unit's share of the health in 8.8 (0x7f07c0) */
function protectShare(node: BtNode): number {
  const pct = dataFloat(node, 'Damage Percentage') ?? 0;
  const whole = Math.floor(pct);
  return whole + Math.trunc((pct - whole) * 256) / 256;
}

/** a unit hurt by the share or more on a plot the danger map rates above 0 */
const endangered = (c: ScoutCtx, node: BtNode, u: Unit): boolean =>
  UNIT_HP - u.hp >= protectShare(node) * UNIT_HP && c.pass.danger[u.tileIndex] > 0;

const SCOUT_NODES: Readonly<Record<string, BtHandler<ScoutCtx>>> = {
  // DECODE TRIGGER (0x7f2970): the trigger's location (the camp) and value
  // (the tribe) to their tags
  'Decode Trigger': {
    update(node, run, c) {
      const loc = dataTag(node, 'Trigger Location');
      if (loc) run.blackboard.set(loc, c.tribe.plot);
      const val = dataTag(node, 'Trigger Value');
      if (val) run.blackboard.set(val, (c.state.barbTribes ?? []).indexOf(c.tribe));
      return BT_SUCCESS;
    },
  },
  // PROTECT UNIT (0x7f07c0 update, 0x7ef0e0 execution): none of its units
  // FAILS; one endangered RUNS, else SUCCESS. The execution: each endangered
  // unit to its safe plot (0x716b90) where that is another, its turn ended
  'Protect Unit': {
    update(node, run, c) {
      const us = scoutUnits(c);
      if (!us.length) return BT_FAILURE;
      const n = us.filter((u) => endangered(c, node, u)).length;
      run.mem[node.index].count = n;
      return n ? BT_RUNNING : BT_SUCCESS;
    },
    execute(node, run, c) {
      if (!((run.mem[node.index].count as number) > 0)) return;
      for (const u of scoutUnits(c)) {
        if (!endangered(c, node, u)) continue;
        const p = passSafePlot(c.state, c.pass, u);
        if (p >= 0 && p !== u.tileIndex) moveTo(c.state, u, p, false);
        passEnd(c.pass, u);
      }
    },
  },
  // MOVE UNIT (0x7f0020 update, 0x7eeba0 execution). The update: no
  // Location SUCCESS; no unit SUCCESS. The unit it holds (its memory): its
  // planning reaching a plot at To Range of the location this turn
  // (0x791300) SUCCESS, else RUNNING; none held, the unit whose planning
  // reaches the location itself this turn, with Movement left there first,
  // else the one whose path (0x272a60, `turnsToPlot`: a camp its defender
  // holds is a goal) takes the fewest turns, is held — SUCCESS where it
  // reaches it with Movement left, else RUNNING; none FAILS. The execution:
  // the held unit's turn ends; it goes for the plot at To Range its planning
  // reaches this turn, else the location (a plot of danger only where Allow
  // Danger)
  'Move Unit': {
    update(node, run, c) {
      const m = run.mem[node.index];
      const loc = tagged(run, node, 'Location');
      if (typeof loc !== 'number' || loc < 0) return BT_SUCCESS;
      const us = scoutUnits(c);
      if (!us.length) {
        m.unit = -1;
        return BT_SUCCESS;
      }
      const range = dataInt(node, 'To Range') ?? 0;
      const held = typeof m.unit === 'number' ? us.find((u) => u.id === m.unit) : undefined;
      if (held) {
        if (!c.pass.plan.has(held.id)) return BT_FAILURE;
        return passReachAt(c.state, c.pass, held, loc, 1, false, range) >= 0 ? BT_SUCCESS : BT_RUNNING;
      }
      m.unit = -1;
      let pick: Unit | null = null;
      let soon = Infinity;
      let moves = false;
      for (const u of us) {
        if (c.pass.plan.has(u.id) && passReachAt(c.state, c.pass, u, loc, 1, false, 0) >= 0) {
          if (!moves && passReachAt(c.state, c.pass, u, loc, 1, true, 0) >= 0) {
            moves = true;
            pick = u;
          } else pick ??= u;
          soon = 1;
          continue;
        }
        const turns = turnsToPlot(c.state, u, loc);
        if (turns > 0 && turns < soon) {
          soon = turns;
          pick = u;
        }
      }
      if (!pick) return BT_FAILURE;
      m.unit = pick.id;
      return moves ? BT_SUCCESS : BT_RUNNING;
    },
    execute(node, run, c) {
      const m = run.mem[node.index];
      const loc = tagged(run, node, 'Location');
      const u = typeof m.unit === 'number' ? scoutUnits(c).find((x) => x.id === m.unit) : undefined;
      if (!u || typeof loc !== 'number' || loc < 0) return;
      const range = dataInt(node, 'To Range') ?? 0;
      const reach = c.pass.plan.has(u.id) ? passReachAt(c.state, c.pass, u, loc, 1, false, range) : -1;
      const plot = reach >= 0 ? reach : loc;
      passEnd(c.pass, u);
      if (!(dataBool(node, 'Allow Danger') ?? true) && c.pass.danger[plot] > 0) return;
      if (u.tileIndex !== plot) moveTo(c.state, u, plot, false);
    },
  },
  // NOTIFY OWNER (0x7c6fa0 -> 0x148270, the scout's tree): the tribe raids
  // the city at once where its Boldness reaches its RaidingBoldness and no
  // raid of it stands (0x149980), else the city to its raid list
  'Notify Owner': {
    update: () => BT_SUCCESS,
    execute(_node, _run, c) {
      const tr = c.tribe;
      const target = c.home.target;
      const can = !(tr.op && !tr.op.assault);
      if (can && (tr.boldness ?? 0) >= raidBoldness(tr) && barbOpStart(c.state, tr, target, false)) return;
      (tr.raidTargets ??= []).push(target);
    },
  },
};

/** the tribe's scout's tree as the twins compare it: the city's owner and
 *  centre, the tree's id, the child its Sequence resumes at, whether its
 *  Move Unit holds the scout; none, -1s */
export function barbHomingRecord(tribe: BarbTribe): number[] {
  const h = tribe.homing;
  if (!h) return [-1, -1, -1, -1, -1];
  const resume = typeof h.mem[0]?.resume === 'number' ? (h.mem[0].resume as number) : -1;
  const held = typeof h.mem[4]?.unit === 'number' && (h.mem[4].unit as number) >= 0 ? 1 : 0;
  return [h.target.seat, h.target.plot, h.id, resume, held];
}

/** the scout's tree's tick; a tree that ends leaves its tribe */
function tickScout(state: GameState, pass: Pass, tribe: BarbTribe): void {
  const home = tribe.homing!;
  const nodes = scoutTreeNodes();
  const run: BtRun = { name: BARB_SCOUT_TREE, nodes, status: home.status, mem: home.mem,
    blackboard: new Map(Object.entries(home.bb)), done: false };
  tick(run, SCOUT_NODES, { state, pass, tribe, home });
  home.bb = Object.fromEntries(run.blackboard);
  if (run.done && tribe.homing === home) delete tribe.homing;
}

/** THE SCOUT'S TREE'S START (0x1485c0, from the scout's look): on the scout
 *  alone, its trigger the camp and the tribe, the city it saw; a new tree
 *  of the player's pool (`newBarbTreeId`) */
export function barbScoutTreeStart(state: GameState, tribe: BarbTribe, scout: number, target: BarbTarget): void {
  const nodes = scoutTreeNodes();
  const id = newBarbTreeId(state);
  tribe.homing = { id, scout, target, status: nodes.map(() => BT_FRESH), mem: nodes.map(() => ({})), bb: {} };
}
