/**
 * THE OPERATION NODES (the s_LeafUpdateFunctions, s_DecisionUpdateFunctions,
 * s_DecoratorUpdateFunctions and the action executions of AI/BehaviorTree;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the behaviour trees"
 * and "C-97: the operations"). Each node reads its TreeData by name and the
 * operation it runs in; an action's moves leave as the seat's unit action
 * rows through the context's `act`, the view then read anew.
 */
import { BT_ERROR, BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SUCCESS, dataBool, dataFloat, dataInt, dataTag, dataValue,
  type BtHandler, type BtRun } from './bt';
import { NO_PLOT, addMember, hasAiType, memberStrength, teamReady, type Operation } from './operation';
import { desiredStrength, recruitOperation } from './recruit';
import { canFoundAt } from '../settle';
import type { MajorUnitView, MajorView } from '../view';

/** a production request an operation's Build Unit made (a CityBuildAI
 *  contract): Submitted until a city takes it up, Building while one does,
 *  Done once its unit stands, Failed when dropped */
export interface Contract {
  id: number;
  unitType: string;
  state: 'submitted' | 'building' | 'done' | 'failed';
  /** the building city's turns to finish, -1 while none builds it */
  turnsLeft: number;
  /** the units of the type the seat held when it was made */
  before: number[];
  /** the operation it was made for: its unit joins it when built */
  op: number;
}

export interface OpsContext {
  seat: number;
  turn: number;
  /** the view as the actions so far left the game */
  view(): MajorView;
  /** carry out the seat's unit action rows now */
  act(rows: number[][]): void;
  op: Operation;
  /** the units in any operation (none recruitable elsewhere) */
  assigned(): ReadonlySet<number>;
  /** the seat's other operations */
  others(): readonly Operation[];
  contracts: Map<number, Contract>;
  newContract(unitType: string): Contract;
  log(line: string): void;
}

const unitsById = (view: MajorView, seat: number): Map<number, MajorUnitView> => new Map(view.units(seat).map((u) => [u.id, u]));
const xy = (view: MajorView, p: number): string => (p < 0 ? '-9999:-9999' : `${view.plots()[p].x}:${view.plots()[p].y}`);

/** the units the operation holds, every team's, in team then join order */
export function opUnits(op: Operation): number[] {
  return op.teams.flatMap((t) => t.members);
}

/** a unit list held under a tag */
function tagUnits(run: BtRun, tag: string | undefined): number[] {
  const v = tag ? run.blackboard.get(tag) : undefined;
  return Array.isArray(v) ? (v as number[]) : [];
}

// DECODE TRIGGER (0x7f2970): the trigger's units and value into their tags
const decodeTrigger: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const units = dataTag(node, 'Trigger Units');
    if (units) run.blackboard.set(units, [...ctx.op.triggerUnits]);
    const value = dataTag(node, 'Trigger Value');
    if (value) run.blackboard.set(value, ctx.op.triggerValue);
    return BT_SUCCESS;
  },
};

// OPERATION CHANGE TARGET (0x8196d0)
/** the target's strength gates (0x723ab0 then the comparisons of 0x8196d0):
 *  weaker than the backup amount asks, with a backup of the target's kind,
 *  the operation swaps to it (WEAK); weaker than the failure amount asks, it
 *  fails (TOO WEAK) */
const changeTarget: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    const { op } = ctx;
    const view = ctx.view();
    const backupOk = op.backup !== null && op.backup.target !== NO_PLOT;
    const swap = (why: string): number => {
      ctx.log(`${op.def.name}, Operation Change Target ${why}`);
      switchToBackup(op);
      return BT_SUCCESS;
    };
    if (!targetValid(view, ctx.seat, op)) {
      if (backupOk) return swap('INVALID, Changing to backup');
      ctx.log(`${op.def.name}, Operation Change Target INVALID, No backup`);
      return BT_FAILURE;
    }
    if (dataBool(node, 'Always Swap') && backupOk) return swap('INVALID, Changing to backup');
    if (dataBool(node, 'Fail on Invalid Team') && !op.teams.every((t) => t.members.length > 0)) {
      ctx.log(`${op.def.name}, Operation Change Target INVALID TEAM`);
      return BT_FAILURE;
    }
    const tag = dataValue(node, 'Required Tag');
    if (tag) {
      let found = false;
      const units = unitsById(view, ctx.seat);
      for (const id of opUnits(op)) {
        const u = units.get(id);
        if (!u || !hasAiType(u.type, tag)) continue;
        found = true;
        if (view.unitReach(u.id, 1).some((r) => r.plot === op.target)) return BT_SUCCESS;
      }
      if (!found) {
        ctx.log(`${op.def.name}, Operation Change Target MISSING REQURED UNIT`);
        return BT_FAILURE;
      }
    }
    if (op.enemyStrength <= 0) return BT_SUCCESS;
    const backupAmt = dataFloat(node, 'Backup Amount') ?? 0;
    const failAmt = dataFloat(node, 'Failure Amount') ?? -1;
    const backupNeed = Math.trunc(desiredStrength(view, ctx.seat, op.enemy, backupAmt, op.enemyStrength)) + op.enemyStrength;
    const failNeed = Math.trunc(desiredStrength(view, ctx.seat, op.enemy, failAmt, op.enemyStrength)) + op.enemyStrength;
    if (op.strength < backupNeed && backupOk) return swap('WEAK, Changing to backup');
    if (op.strength >= failNeed) return BT_SUCCESS;
    ctx.log(`${op.def.name}, Operation Change Target TOO WEAK`);
    return BT_FAILURE;
  },
};

/** the target still one the operation can act on (0x73abf0): for a settle
 *  target, a plot the seat may found on that still scores */
export function targetValid(view: MajorView, seat: number, op: Operation): boolean {
  if (op.target === NO_PLOT) return false;
  if (op.def.targetType === 'TARGET_SETTLE_LOCATION') return canFoundAt(view, seat, op.target);
  return true;
}

/** the backup becomes the target (0x73e870): the target, its rally and its
 *  enemy, each team's goals with them */
export function switchToBackup(op: Operation): void {
  if (!op.backup) return;
  op.target = op.backup.target;
  op.rally = op.backup.rally;
  op.enemy = op.backup.enemy;
  op.backup = null;
  for (const t of op.teams) {
    t.goals[0] = op.rally;
    t.goals[1] = op.target;
  }
}

// FIND AVAILABLE UNIT (0x7ec7b0): a unit of the type the node names, held by
// the tree already or free, joins the operation; its id in Found Unit
const findAvailableUnit: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const view = ctx.view();
    const type = dataValue(node, 'Unit Type');
    // the Unit Type joins the Desired Units list, which the tree's Build Unit
    // then reads
    const listTag = dataTag(node, 'Desired Units');
    const listed = listTag ? run.blackboard.get(listTag) : undefined;
    const desired: string[] = Array.isArray(listed) ? (listed as string[]) : [];
    if (type && !desired.includes(type)) desired.push(type);
    if (listTag) run.blackboard.set(listTag, desired);
    const wanted = new Set(desired);
    const units = view.units(ctx.seat);
    const held = opUnits(ctx.op);
    let found = units.find((u) => held.includes(u.id) && wanted.has(u.type));
    if (!found) {
      const busy = ctx.assigned();
      found = units.find((u) => !busy.has(u.id) && wanted.has(u.type));
      if (found && ctx.op.teams.length) addMember(ctx.op.teams[0], found);
    }
    if (!found) return BT_FAILURE;
    const tag = dataTag(node, 'Found Unit');
    if (tag) run.blackboard.set(tag, [found.id]);
    return BT_SUCCESS;
  },
};

// CONTRACT MANAGER DECORATOR (0x7f17a0 update, 0x7f1500 child)
const contractManager: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const contractTag = dataTag(node, 'Contract');
    const turnLimit = dataInt(node, 'Turn Limit');
    const remaining = dataInt(node, 'Turns Remaining') ?? -1;
    if (!contractTag || turnLimit === undefined) return BT_ERROR;
    const block = dataBool(node, 'Block While Running') ?? true;
    m.next = node.firstChild;
    m.counter = ((m.counter as number | undefined) ?? 0) + 1;
    const over = (m.counter as number) > turnLimit && turnLimit >= 0;
    // each contract's check (0x7f2220): in progress, the turn limit past
    // cancels it (FAILURE), else it is not alive; done, it SUCCEEDS where the
    // decorator blocks or counts turns remaining; gone, it FAILS
    let status = BT_FRESH;
    let alive = true;
    let near = false;
    let has = false;
    const id = run.blackboard.get(contractTag);
    const c = typeof id === 'number' ? ctx.contracts.get(id) : undefined;
    if (c) {
      if (c.state === 'submitted' || c.state === 'building') {
        if (over) {
          c.state = 'failed';
          status = status === BT_RUNNING ? BT_RUNNING : BT_FAILURE;
        }
        if (block && status === BT_SUCCESS) status = BT_RUNNING;
        alive = false;
      } else if (c.state === 'done') {
        if (block || remaining >= 0) status = Math.max(status, BT_SUCCESS);
      } else {
        run.blackboard.delete(contractTag);
        status = Math.max(status, BT_FAILURE);
      }
      has = true;
      if (remaining >= 0 && c.turnsLeft >= 0 && c.turnsLeft <= remaining) near = true;
    }
    if (alive) m.counter = 0;
    if (status === BT_FAILURE) {
      if (c) c.state = 'failed';
      m.next = node.end;
      return BT_FAILURE;
    }
    if (status === BT_SUCCESS) {
      if (block) m.next = node.end;
      return BT_SUCCESS;
    }
    if (block && (status === BT_RUNNING || has)) {
      m.next = node.end;
      return BT_RUNNING;
    }
    if (remaining < 0) return status;
    if (near) return BT_FRESH;
    m.next = node.end;
    return BT_RUNNING;
  },
  child(_node, _run, own, s) {
    const v = Math.max(own === BT_FRESH ? s : own, s);
    return { own: v, finished: v !== BT_FRESH };
  },
  next(node, run) {
    return (run.mem[node.index].next as number | undefined) ?? node.firstChild;
  },
};

// BUILD UNIT (0x7f4e00): the operation's production request, a contract
// for the first of the desired units; RUNNING while it stands
const buildUnit: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const tag = dataTag(node, 'Contract ID');
    const id = tag ? run.blackboard.get(tag) : undefined;
    if (typeof id === 'number' && ctx.contracts.get(id)) return BT_RUNNING;
    const listTag = dataTag(node, 'Desired Units');
    const listed = listTag ? run.blackboard.get(listTag) : undefined;
    if (!Array.isArray(listed) || listed.length === 0) return BT_FAILURE;
    const type = String(listed[0]);
    const c = ctx.newContract(type);
    if (tag) run.blackboard.set(tag, c.id);
    return BT_RUNNING;
  },
};

// RECRUIT UNITS (0x81c820 update; the recruit 0x60a8c0 -> 0x738050)
const recruitUnits: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const { op } = ctx;
    const view = ctx.view();
    const units = unitsById(view, ctx.seat);
    const inProgress = dataBool(node, 'Already in progress') ?? false;
    const creation = dataBool(node, 'Allow creation') ?? true;
    const range = dataInt(node, 'Recruit Range') ?? -1;
    const before = opUnits(op).length;
    // the evaluator's two offers (0x60a8c0): the seat's units in no
    // operation; then the units the recruit signal frees — those of its
    // unlocked operations of a lower priority, which leave them
    const busy = ctx.assigned();
    const offer = view.units(ctx.seat).filter((u) => !busy.has(u.id));
    recruitOperation(view, ctx.seat, op, offer, inProgress, range, units, (l) => ctx.log(l));
    const lower = ctx.others().filter((o) => o !== op && !o.locked && o.def.priority < op.def.priority);
    const freed = lower.flatMap(opUnits).map((id) => units.get(id)).filter((u): u is MajorUnitView => !!u);
    if (freed.length) {
      const taken = recruitOperation(view, ctx.seat, op, [...freed], inProgress, range, units, (l) => ctx.log(l));
      for (const u of taken) {
        for (const o of lower) for (const t of o.teams) t.members = t.members.filter((id) => id !== u.id);
      }
    }
    refreshStrengths(ctx);
    const after = opUnits(op).length;
    const contract = contractFor(ctx);
    ctx.log(`${op.def.name}, Operation Recruit, ${after} units, Recruited ${after - before}, Contract for: ${contract ?? 'UNIT_WARRIOR_MONK'}`);
    if (m.done && after === 0) return BT_FAILURE;
    if (m.done || inProgress || op.teams.every(teamReady)) {
      m.done = true;
      return BT_SUCCESS;
    }
    if (contract || creation) return BT_RUNNING;
    return BT_FAILURE;
  },
};

/** the unit type of the operation's open production request, null for none */
function contractFor(ctx: OpsContext): string | null {
  for (const c of ctx.contracts.values()) {
    if (c.op === ctx.op.id && (c.state === 'submitted' || c.state === 'building')) return c.unitType;
  }
  return null;
}

/** the operation's strengths (0x73eb60, 0x73f7d0): the enemy's about the
 *  target (the hostile units the seat sees within 3 of it, each its larger
 *  of combat and ranged strength), each team's members' and their sum */
export function refreshStrengths(ctx: OpsContext): void {
  const { op } = ctx;
  const view = ctx.view();
  const units = unitsById(view, ctx.seat);
  op.enemyStrength = op.target === NO_PLOT ? 0 : view.hostileUnits(ctx.seat)
    .filter((h) => view.plotDistance(h.plot, op.target) <= 3)
    .reduce((s, h) => s + Math.max(h.melee, h.ranged), 0);
  let total = 0;
  for (const t of op.teams) {
    t.counts = t.reqs.map((r) => t.members.filter((id) => {
      const u = units.get(id);
      return !!u && hasAiType(u.type, r.aiType);
    }).length);
    t.strength = t.members.reduce((s, id) => {
      const u = units.get(id);
      return u ? s + memberStrength(u) : s;
    }, 0);
    t.ready = teamReady(t);
    total += t.strength;
  }
  op.strength = total;
}

// LOCK UNITS (0x7f5240): the units locked to the operation
const lockUnits: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    ctx.op.locked = dataBool(node, 'Lock Units') ?? false;
    return BT_SUCCESS;
  },
};

// MAKE FORMATION (0x7efd70): the civilian and its escort move as one
/** the team's planned pairs (0x73b8a0): each civilian member of the
 *  Civilian Unit type not yet escorted takes, of the free members of the
 *  Combat Unit type that fight, the one whose planning reaches the
 *  civilian's plot in the fewest turns (then the least Movement spent, the
 *  first of equals); they meet on the civilian's plot */
function planFormations(view: MajorView, seat: number, op: Operation, civ: string, combat: string): { pairs: [number, number, number][]; near: boolean } {
  const units = unitsById(view, seat);
  const paired = new Set(op.formations.flat());
  const pairs: [number, number, number][] = [];
  let near = true;
  for (const t of op.teams) {
    const escorts = t.members.filter((id) => {
      const u = units.get(id);
      return !!u && !paired.has(id) && !u.founder && u.combat > 0 && hasAiType(u.type, combat);
    });
    for (const id of t.members) {
      const c = units.get(id);
      if (!c || paired.has(id) || c.combat > 0 || !hasAiType(c.type, civ)) continue;
      let best = -1;
      let bestTurns = 4;
      let bestCost = 0;
      for (const e of escorts) {
        if (paired.has(e)) continue;
        const r = view.unitReach(e, 2).find((x) => x.plot === c.plot);
        if (!r) continue;
        const cost = -r.moves;
        if (r.turns < bestTurns || (r.turns === bestTurns && cost < bestCost)) {
          best = e;
          bestTurns = r.turns;
          bestCost = cost;
        }
      }
      if (best < 0) continue;
      pairs.push([id, best, c.plot]);
      paired.add(id);
      paired.add(best);
      if (bestTurns > 1) near = false;
    }
  }
  return { pairs, near };
}

const makeFormation: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    if (dataBool(node, 'Destroy Formations')) return BT_SUCCESS;
    const civ = dataValue(node, 'Civilian Unit');
    const combat = dataValue(node, 'Combat Unit');
    if (!civ || !combat) return BT_SUCCESS;
    const plan = planFormations(ctx.view(), ctx.seat, ctx.op, civ, combat);
    run.mem[node.index].pairs = plan.pairs;
    return plan.near ? BT_SUCCESS : BT_RUNNING;
  },
  // the escort walks to the civilian's plot; met there, they form
  execute(node, run, ctx) {
    const { op } = ctx;
    if (dataBool(node, 'Destroy Formations')) {
      op.formations = [];
      return;
    }
    const pairs = (run.mem[node.index].pairs as [number, number, number][] | undefined) ?? [];
    for (const [civ, escort, plot] of pairs) {
      const e = ctx.view().units(ctx.seat).find((u) => u.id === escort);
      if (e && e.plot !== plot) moveTo(ctx, e, plot);
      const v = ctx.view();
      const a = v.units(ctx.seat).find((u) => u.id === civ);
      const b = v.units(ctx.seat).find((u) => u.id === escort);
      if (a && b && a.plot === b.plot && !op.formations.some((f) => f.includes(civ) || f.includes(escort))) op.formations.push([civ, escort]);
    }
  },
};

// OPERATION MOVE (0x81a130 update, 0x816cb0 execution)
/** a team's members as the move orders them: those of the leader's AI type
 *  (all where the node names none), nearest the goal first, the first of
 *  equals in join order */
function moveOrder(view: MajorView, units: ReadonlyMap<number, MajorUnitView>, ids: readonly number[], goal: number, leader: string | undefined): MajorUnitView[] {
  const us = ids.map((id) => units.get(id)).filter((u): u is MajorUnitView => !!u && (!leader || hasAiType(u.type, leader)));
  return us.map((u, k) => ({ u, k, d: view.plotDistance(u.plot, goal) })).sort((a, b) => a.d - b.d || a.k - b.k).map((x) => x.u);
}

const operationMove: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const view = ctx.view();
    const units = unitsById(view, ctx.seat);
    const slot = dataInt(node, 'Move To (enum)') ?? 1;
    const range = dataInt(node, 'Range to goal') ?? 0;
    const unitDist = dataInt(node, 'Unit distance') ?? 0;
    const leader = dataValue(node, 'Leader Tag');
    m.arrived = false;
    let running = false;
    for (const t of ctx.op.teams) {
      const goal = t.goals[slot] ?? NO_PLOT;
      if (goal === NO_PLOT) return BT_FAILURE;
      const order = moveOrder(view, units, t.members, goal, leader);
      if (order.length === 0) continue;
      const head = order[0];
      let arrived = view.plotDistance(head.plot, goal) <= range;
      if (unitDist > 0 && arrived) {
        const all = moveOrder(view, units, t.members, goal, undefined);
        const strays = all.filter((u) => view.plotDistance(u.plot, head.plot) > unitDist).length;
        if (2 * strays >= all.length) arrived = false;
      }
      if (!arrived) running = true;
      m.arrived = (m.arrived as boolean) || arrived;
    }
    if (dataBool(node, 'AlwaysRunning')) return BT_RUNNING;
    return running || !m.arrived ? BT_RUNNING : BT_SUCCESS;
  },
  execute(node, _run, ctx) {
    const slot = dataInt(node, 'Move To (enum)') ?? 1;
    const range = dataInt(node, 'Range to goal') ?? 0;
    const leader = dataValue(node, 'Leader Tag');
    for (const t of ctx.op.teams) {
      const goal = t.goals[slot] ?? NO_PLOT;
      if (goal === NO_PLOT) continue;
      const view = ctx.view();
      const units = unitsById(view, ctx.seat);
      const order = moveOrder(view, units, t.members, goal, undefined);
      for (const first of order) {
        const v = ctx.view();
        const u = v.units(ctx.seat).find((x) => x.id === first.id);
        if (!u) continue;
        const pair = ctx.op.formations.find((f) => f.includes(u.id));
        const mate = pair ? (pair[0] === u.id ? pair[1] : pair[0]) : -1;
        const dest = moveDest(v, ctx.seat, u, goal, range, leader, mate);
        const from = u.plot;
        moveTo(ctx, u, dest);
        const after = ctx.view().units(ctx.seat).find((x) => x.id === u.id)?.plot ?? from;
        ctx.log(`${ctx.op.def.name}, Operation Move, ${u.type}, ${xy(v, from)}, ${xy(v, dest)}, ${xy(v, after)}`);
      }
    }
  },
};

const military = (u: MajorUnitView): boolean => u.combat > 0 || u.ranged > 0;

/** The plot a unit moves to for a goal (0x816cb0). Its search radius: the
 *  smaller of the node's Range to goal and the unit's own attack Range, 0 for
 *  a unit in a formation or one of the node's Leader Tag; at least 1 where
 *  the goal is barred to it — no path, a visible enemy there, or a unit
 *  that keeps it out (0x585eb0: its own of the same class, another
 *  player's) — and, the goal open, for a unit outside the Leader Tag and any
 *  formation where the node names one and its range is above 0. With a
 *  radius, of the plots within it of the goal (the ring walk 0x6aef0 with the
 *  test 0x815d50): one in the goal's region before one outside, then the
 *  nearest the unit, the first of equals in the walk; its own plot, or one
 *  with no other unit of the seat but its formation mate that its path
 *  reaches. Without one, or none found: the goal. */
function moveDest(view: MajorView, seat: number, u: MajorUnitView, goal: number, range: number, leader: string | undefined, mate: number): number {
  const inFormation = mate >= 0;
  const tagged = !!leader && hasAiType(u.type, leader);
  let r = Math.min(range, inFormation || tagged ? 0 : u.range);
  const mine = view.units(seat);
  if (u.plot !== goal && barred(view, seat, u, goal, mate)) r = Math.max(1, r);
  else if (range > 0 && leader && !inFormation && !tagged) r = Math.max(1, r);
  if (r <= 0) return goal;
  const plots = view.plots();
  const region = plots[goal].region;
  let best = NO_PLOT;
  let bestD = -1;
  let bestIn = false;
  for (const p of view.plotsRing(goal, r)) {
    const inRegion = plots[p].region === region;
    const d = view.plotDistance(u.plot, p);
    if (bestD >= 0) {
      if (inRegion === bestIn && d >= bestD) continue;
      if (inRegion !== bestIn && !inRegion) continue;
    }
    if (p !== u.plot && (mine.some((x) => x.id !== u.id && x.id !== mate && x.plot === p) || view.unitPath(u.id, p).length === 0)) continue;
    best = p;
    bestD = d;
    bestIn = inRegion;
  }
  return best === NO_PLOT ? goal : best;
}

/** the goal barred to the unit (0x586360, 0x5862e0, 0x585eb0): no path, a
 *  visible unit of a player at war with the seat there, or a unit there that
 *  keeps it out — one of the seat's own of its class (not its formation
 *  mate), or any of another player's */
function barred(view: MajorView, seat: number, u: MajorUnitView, goal: number, mate: number): boolean {
  if (view.unitPath(u.id, goal).length === 0) return true;
  if (view.hostileUnits(seat).some((h) => h.plot === goal)) return true;
  if (view.units(seat).some((x) => x.id !== u.id && x.id !== mate && x.plot === goal && military(x) === military(u))) return true;
  return view.plotForeignUnits(seat, goal) > 0;
}


/** a unit's move order to a plot: the steps of its path, as far as its
 *  Movement carries it this turn (the engine refuses the rest) */
export function moveTo(ctx: OpsContext, u: MajorUnitView, dest: number): void {
  if (u.plot === dest || u.movesLeft <= 0) return;
  const view = ctx.view();
  const path = view.unitPath(u.id, dest);
  if (path.length === 0) return;
  const reach = new Map(view.unitReach(u.id, 1).map((r) => [r.plot, r] as const));
  const units = view.units(ctx.seat);
  const col = units.findIndex((x) => x.id === u.id);
  if (col < 0) return;
  // a formation's other unit steps with it
  const pair = ctx.op.formations.find((f) => f.includes(u.id));
  const mate = pair ? units.findIndex((x) => x.id === (pair[0] === u.id ? pair[1] : pair[0])) : -1;
  const together = mate >= 0 && units[mate].plot === u.plot;
  const rows: number[][] = [];
  let at = u.plot;
  for (const p of path) {
    const r = reach.get(p);
    if (!r || r.turns > 1) break;
    const row = units.map(() => -1);
    const a = view.unitActionColumn(`MOVE_${view.stepDirection(at, p)}`);
    row[col] = a;
    if (together) row[mate] = a;
    rows.push(row);
    at = p;
  }
  if (rows.length) ctx.act(rows);
}

// SETTLE (0x7f0b30 update, 0x7ef530 execution): a unit that founds cities
// whose planning reaches the target this turn; it founds there
const settle: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.unit = -1;
    const view = ctx.view();
    const units = unitsById(view, ctx.seat);
    const listed = tagUnits(run, dataTag(node, 'Settler Unit'));
    const ids = listed.length ? listed : opUnits(ctx.op);
    for (const id of ids) {
      const u = units.get(id);
      if (!u || !u.founder) continue;
      if (u.plot !== ctx.op.target && !view.unitReach(u.id, 1).some((r) => r.plot === ctx.op.target)) continue;
      m.unit = u.id;
      return BT_SUCCESS;
    }
    return BT_FAILURE;
  },
  execute(node, run, ctx) {
    const id = run.mem[node.index].unit as number;
    if (id === undefined || id < 0) return;
    const view = ctx.view();
    const units = view.units(ctx.seat);
    const col = units.findIndex((x) => x.id === id);
    if (col < 0 || units[col].plot !== ctx.op.target) return;
    const row = units.map(() => -1);
    row[col] = view.unitActionColumn('FOUND_CITY');
    ctx.act([row]);
  },
};

const success: BtHandler<OpsContext> = { update: () => BT_SUCCESS };

/** the operation's target gone (0x73a8e0): a camp target no camp the seat
 *  knows stands on; a city target no city stands on; never a friendly city
 *  or a settle site; any other kind always */
function targetGone(view: MajorView, seat: number, op: Operation): boolean {
  switch (op.def.targetType) {
    case 'TARGET_BARBARIAN_CAMP':
      return !view.barbarianCamps(seat).includes(op.target);
    case 'TARGET_ENEMY_COMBAT_DISTRICT':
    case 'TARGET_ENEMY_PASSIVE_DISTRICT':
      return op.target === NO_PLOT || !view.plots()[op.target].city;
    case 'TARGET_FRIENDLY_CITY':
    case 'TARGET_SETTLE_LOCATION':
      return false;
    default:
      return true;
  }
}

// OPERATION ATTACK (0x80ec10): SUCCESS once the target is gone, RUNNING while
// the operation holds units, else FAILURE
const operationAttack: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    if (targetGone(ctx.view(), ctx.seat, ctx.op)) return BT_SUCCESS;
    return opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE;
  },
};

// OPERATION ATTACK UNITS (0x80ecf0): SUCCESS once the target is gone; else
// RUNNING where the node says Always Running, SUCCESS where not
const operationAttackUnits: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    if (targetGone(ctx.view(), ctx.seat, ctx.op)) return BT_SUCCESS;
    return dataBool(node, 'Always Running') ? BT_RUNNING : BT_SUCCESS;
  },
};

// NAVAL PATROL, NAVAL PILLAGE (0x803880): RUNNING while the operation holds
// units, else FAILURE
const navalUnitsRunning: BtHandler<OpsContext> = {
  update: (_node, _run, ctx) => (opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE),
};

// NAVAL CHOOSE TARGET (0x803590): of the targets of its domain the
// tactical analysis lists, the nearest the operation's target becomes the
// target and its children run; with none the walk skips them, FAILURE where
// the node says Fail for no target. The seat's naval targets are not listed
// here: none is found.
const navalChooseTarget: BtHandler<OpsContext> = {
  update(node) {
    return dataBool(node, 'Fail for no target') ? BT_FAILURE : BT_SUCCESS;
  },
  next: (node) => node.end,
};

// OPERATION IS READY (0x81a090): every team's minimums met
const operationIsReady: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    return ctx.op.teams.every(teamReady) ? BT_SUCCESS : BT_FAILURE;
  },
};

// TURN LIMITER (0x7f21c0 update, 0x7f1620 child): its child runs until the
// turns (at the game's speed) since it first ran are spent
const turnLimiter: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    if (node.firstChild < 0) return BT_ERROR;
    if (!m.start) m.start = ctx.turn;
    return BT_FRESH;
  },
  child(node, run, _own, s, _child, ctx) {
    const m = run.mem[node.index];
    const limit = dataInt(node, 'Turns to Run') ?? 0;
    const elapsed = ctx.turn - (m.start as number);
    if (dataBool(node, 'Limit Is Min') && elapsed <= limit && s !== BT_FAILURE && s !== BT_ERROR) return { own: BT_RUNNING, finished: true };
    // the RUNNING child's limit at the game's speed (0x5254d0)
    if (s === BT_RUNNING && elapsed >= Math.trunc(limit * ctx.view().costMultiplierPct / 100)) {
      const fail = dataBool(node, 'Fail at Limit');
      return { own: fail === false ? BT_SUCCESS : BT_FAILURE, finished: true };
    }
    return { own: s, finished: s !== BT_FRESH };
  },
};

export const OP_NODES: Readonly<Record<string, BtHandler<OpsContext>>> = {
  'Decode Trigger': decodeTrigger,
  'Operation Defend Units': success,
  'Operation Change Target': changeTarget,
  'Find Available Unit': findAvailableUnit,
  'Contract Manager Decorator': contractManager,
  'Build Unit': buildUnit,
  'Recruit Units': recruitUnits,
  'Operation Move': operationMove,
  'Lock Units': lockUnits,
  'Make Formation': makeFormation,
  'Operation Attack Units': operationAttackUnits,
  'Operation Attack': operationAttack,
  'Naval Patrol': navalUnitsRunning,
  'Naval Pillage': navalUnitsRunning,
  'Naval Choose Target': navalChooseTarget,
  'Operation Naval Escort': success,
  Settle: settle,
  'Operation Is Ready': operationIsReady,
  'Turn Limiter': turnLimiter,
};
