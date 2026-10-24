/**
 * THE OPERATION NODES (the s_LeafUpdateFunctions, s_DecisionUpdateFunctions,
 * s_DecoratorUpdateFunctions and the action executions of AI/BehaviorTree;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the behaviour trees"
 * and "C-97: the operations"). Each node reads its TreeData by name and the
 * operation it runs in; an action's moves leave as the seat's unit action
 * rows through the context's `act`, the view then read anew.
 */
import type { OpsSettle } from './types';
import { BT_ERROR, BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SKIPPED, BT_SUCCESS, dataBool, dataFloat, dataInt, dataTag, dataValue,
  type BtHandler, type BtNode, type BtRun } from '../behaviorTree';
import { NO_PLOT, addMember, hasAiType, memberStrength, moveTo, opDef, opUnit, opUnits, targetGone, teamDef, teamReqs, unitsById, xy, type OpTeam,
  type Operation } from './operation';
import { chooseUnit, keepUnit } from './unitChoice';
import type { UnitProductionRow } from '../aiUnitProduction';
import { AI_UNITS } from '../../data/aiBuildTables';
import { AI_UNIT_INDEX } from '../aiCityBuild';
import { FX } from '../aiValue';
import { desiredStrength, recruitOperation } from './recruit';
import { cityDefense } from './cityValue';
import { armyStrength } from './evaluate';
import type { KnownUnit } from './knowledge';
import { ASSAULT_NODES, attackUnitsExecute, operationAttackExecute, updateTeam } from './assault';
import { BARBARIAN_NODES, type BarbarianHooks } from './barbarian';
import type { MajorAttackView, MajorUnitView, MajorView } from '../../../ai/major/view';
import type { MoveStore } from '../tactical';
import { CP_ACCEPTED, CP_CANCELLED, CP_CLAIMED, CP_COMPLETED, CP_FAILED, CP_IN_PROGRESS, buildUnitNode, contractManagerNode, submitContract,
  treeContractOf, type AiContract, type ContractNodeWorld } from '../aiContracts';

/** a request an operation's Operation Diplomacy made of the diplomatic AI
 *  (a diplomatic contract, contract manager +0x368 type 4): the
 *  DiplomaticActionType against the enemy, at the tree's present value */
export interface DiplomacyRequest {
  id: number;
  action: string;
  enemy: number;
  value: number;
  turn: number;
  op: number;
}

/** OPERATION DEFEND UNITS' orders (0x80ee70 / 0x80d790) for a team's
 *  members in the seat's units' turn: `flagged` the update's test — a
 *  member endangered (the team update's list, 0x738f20), hurt to the
 *  percentage or fortified in danger; `execute` the execution's — the
 *  endangered to their safe plots; the hurt promoted where a promotion is
 *  due, released off friendly ground, pillaging where the plot pays a plunder,
 *  moved off a plot of danger (a barbarian not), fortified — its lines, the
 *  units released */
export interface DefendOrders {
  flagged(members: readonly number[], pct: number): boolean;
  execute(members: readonly number[], target: number, pct: number, range: number):
    { lines: readonly { type: string; what: string }[]; released: readonly number[] };
}

export interface OpsContext {
  seat: number;
  turn: number;
  /** the view as the actions so far left the game */
  view(): MajorView;
  /** carry out the seat's unit action rows now */
  act(rows: number[][]): void;
  /** the unit's move to the plot as far as its Movement carries it this
   *  turn, `mate` (its formation's other unit, -1 none) stepping with it */
  move(id: number, dest: number, mate: number): void;
  /** the unit's blow on the plot: from where it stands beside it or in its
   *  range, else along its path, the last step the attack */
  strike(id: number, plot: number): void;
  /** the attack assignment (the tactical pass's) over the units against the
   *  seat's tactical targets `keep` picks — `even` refusing a losing
   *  exchange, `survive` a blow that kills the unit — carried out
   *  (0x771f80); the assignments */
  attack(ids: readonly number[], keep: (k: number) => boolean, even: boolean, survive: boolean): readonly MajorAttackView[];
  /** OPERATION MOVE's update for a team (0x81a130): its members, the node's
   *  store for it, the goal, whether the goal is the target, Range to goal
   *  and Unit distance — its status, arrived, the store kept, and win: the
   *  target reached, which ends the node's update */
  moveUpdate(members: readonly number[], store: MoveStore | undefined, goal: number, target: boolean, range: number,
    spread: number): { status: number; arrived: boolean; store: MoveStore | undefined; win: boolean };
  /** OPERATION MOVE's execution for a team (0x816cb0): range: the radius
   *  cap, the node's Unit distance; zero: a unit whose
   *  radius is 0 (a formation's, the Leader Tag's), leaderNamed: the node
   *  names a Leader Tag — each mover's type, its plot before, the plot it
   *  went for and the plot it stands on */
  moveExec(members: readonly number[], goal: number, range: number, arrived: boolean, ready: boolean,
    zero: (id: number, type: string) => boolean, leaderNamed: boolean): readonly { type: string; from: number; dest: number; after: number }[];
  /** Operation Defend Units' orders, where the seat's units' turn gives
   *  them; none, the node moves no unit */
  defend?: DefendOrders;
  /** NAVAL PATROL's execution for the units (0x803060), in the player's
   *  unit order: each with Movement left takes HL Explore's target and moves
   *  there, its turn done; none, the node moves no unit */
  patrol?: (ids: readonly number[]) => void;
  /** NAVAL PILLAGE's execution for the units (0x803250), in the player's
   *  unit order: their blows on their planning's district or unit target;
   *  none, the node strikes nothing */
  pillage?: (ids: readonly number[]) => void;
  /** the units take their type's own AI type (0x79b9c0: COMBAT for a
   *  fighting unit), a standing army's DEFENDER among them leaving it */
  ownAiType(ids: readonly number[]): void;
  op: Operation;
  /** the units in any operation (none recruitable elsewhere) */
  assigned(): ReadonlySet<number>;
  /** the seat's other operations */
  others(): readonly Operation[];
  /** what the shared contract nodes read of the operation's tree */
  contractWorld(): ContractNodeWorld;
  /** the seat's diplomatic requests standing, their ids their places */
  diplomacy: readonly DiplomacyRequest[];
  requestDiplomacy(action: string, enemy: number, value: number): number;
  /** the seat's settling AI, none for a party that never settles */
  settle: OpsSettle | null;
  /** a city's threat by its plot (CityBuildAI +0x1b8), -1 none */
  threat(plot: number): number;
  /** the seat's unit production entries (the military AI's +0x268) */
  unitRows(): readonly UnitProductionRow[];
  /** the camps its knowledge base holds, in its order */
  camps(): readonly number[];
  /** a player's army records in its knowledge base */
  army(player: number): readonly KnownUnit[];
  /** the tribes the barbarians' operations run for (null for any other
   *  party) */
  barbarian: BarbarianHooks | null;
  log(line: string): void;
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
      ctx.log(`${op.def}, Operation Change Target ${why}`);
      switchToBackup(op);
      return BT_SUCCESS;
    };
    if (!targetValid(ctx, op)) {
      if (backupOk) return swap('INVALID, Changing to backup');
      ctx.log(`${op.def}, Operation Change Target INVALID, No backup`);
      return BT_FAILURE;
    }
    if (dataBool(node, 'Always Swap') && backupOk) return swap('INVALID, Changing to backup');
    if (dataBool(node, 'Fail on Invalid Team') && !op.teams.every((t) => t.members.length > 0)) {
      ctx.log(`${op.def}, Operation Change Target INVALID TEAM`);
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
        ctx.log(`${op.def}, Operation Change Target MISSING REQURED UNIT`);
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
    ctx.log(`${op.def}, Operation Change Target TOO WEAK`);
    return BT_FAILURE;
  },
};

/** the city's garrison heal a turn (GlobalParameters
 *  COMBAT_HEAL_CITY_GARRISON, GlobalParameters +0x1b8) */
const CITY_GARRISON_HEAL = 20;

/** THE ASSAULT'S TARGET STILL VALID (0x73abf0's COMBAT_DISTRICT branch): the
 *  seat's known record of the city on the target (this turn's) — none,
 *  invalid; its defenses and walls (0x5eb600) no more than its defensible
 *  districts (+0x58), valid; a walled-city definition (TargetParameter 1,
 *  op +0x124), valid; else per member of its teams: one the walls do not
 *  hold back (a siege assist on the city), valid; else its predicted blow
 *  on the city summed — one blow at the garrison's heal or more, valid; two
 *  at half of it or more, valid; the small blows' sum above the heal,
 *  valid; none of these, invalid. The blow back on the member is unread
 *  (none). */
function assaultTargetValid(ctx: OpsContext, op: Operation): boolean {
  const view = ctx.view();
  const owner = view.plots()[op.target].owner;
  const rec = view.knownCities(ctx.seat).find((k) => k.plot === op.target && k.owner === owner);
  if (!rec) return false;
  const marks = rec.districts.reduce((n, d) => n + (d.defense > 0 ? 1 : 0) + (d.walls > 0 ? 1 : 0), 0);
  if (marks <= rec.districts.length) return true;
  if (opDef(op).targetParameter === 1) return true;
  let sum = 0;
  let big = 0;
  for (const id of opUnits(op)) {
    if (view.wallsBypassed(id, op.target)) return true;
    const dealt = view.cityBlowFrom(id, op.target);
    sum += dealt;
    if (dealt >= CITY_GARRISON_HEAL) return true;
    if (dealt < CITY_GARRISON_HEAL >> 1) {
      if (sum > CITY_GARRISON_HEAL) return true;
    } else if (++big > 1) return true;
  }
  return false;
}

/** the target still one the operation can act on (0x73abf0): a city
 *  assault's (assaultTargetValid); for a settle target, a plot the seat may
 *  found on that still scores; for a camp target, a camp the seat knows
 *  still standing on it */
export function targetValid(ctx: OpsContext, op: Operation): boolean {
  if (op.target === NO_PLOT) return false;
  const type = opDef(op).targetType;
  if (type === 'TARGET_ENEMY_COMBAT_DISTRICT') return assaultTargetValid(ctx, op);
  if (type === 'TARGET_SETTLE_LOCATION') return ctx.settle?.canFoundAt(op.target) ?? false;
  if (type === 'TARGET_BARBARIAN_CAMP') return !targetGone(ctx, op);
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
    const lower = ctx.others().filter((o) => o !== op && !o.locked && opDef(o).priority < opDef(op).priority);
    const freed = lower.flatMap(opUnits).map((id) => units.get(id)).filter((u): u is MajorUnitView => !!u);
    if (freed.length) {
      const taken = recruitOperation(view, ctx.seat, op, [...freed], inProgress, range, units, (l) => ctx.log(l));
      for (const u of taken) {
        for (const o of lower) for (const t of o.teams) t.members = t.members.filter((id) => id !== u.id);
      }
    }
    // the operation's units (the player's walk 0x6092c0) each take their
    // type's own AI type (unit +0x168, 0x79b9c0)
    ctx.ownAiType(opUnits(op));
    refreshStrengths(ctx);
    const after = opUnits(op).length;
    const unit = opUnit(op);
    ctx.log(`${op.def}, Operation Recruit, ${after} units, Recruited ${after - before}, Contract for: ${unit ?? 'NONE'}`);
    if (m.done && after === 0) return BT_FAILURE;
    // the recruit's contract (the Contract ID tag): failed, the node fails;
    // completed, it leaves the tree
    const w = ctx.contractWorld();
    const tag = dataTag(node, 'Contract ID');
    const c = tag ? treeContractOf(w.book, w.tree, run.blackboard.get(tag)) : undefined;
    if (c && c.progress === CP_FAILED) {
      w.tree.contracts = w.tree.contracts.filter((id) => id !== c.id);
      return BT_FAILURE;
    }
    if (c && c.progress === CP_COMPLETED) w.tree.contracts = w.tree.contracts.filter((id) => id !== c.id);
    if (creation && unit !== null) m.unit = unit;
    if (m.done || inProgress || op.teams.every((t) => t.ready)) {
      m.done = true;
      return BT_SUCCESS;
    }
    if (c || (creation && m.unit)) return BT_RUNNING;
    return BT_FAILURE;
  },
  execute: recruitContract,
};

/** RECRUIT UNITS' EXECUTION (0x8189f0): for the unit the update asked
 *  (+0x8c) with a Contract ID tag — the tag's contract accepted or in
 *  progress for that unit stays; any other is cancelled and leaves the tree
 *  — a contract for it: its value the Recruit Value tag's (x 3 for a unit
 *  with a Bombard strength, row +0x40), its turn limit the Time Limit's
 *  (autovariable +0x168, the contract's +0x1c0), the unit joining the
 *  tree once built; submitted, the tag holding it. A levy (Allow Levying,
 *  0x449b70) is unported. */
function recruitContract(node: BtNode, run: BtRun, ctx: OpsContext): void {
  const m = run.mem[node.index];
  const unit = m.unit as string | undefined;
  const tag = dataTag(node, 'Contract ID');
  if (!unit || !tag) return;
  const w = ctx.contractWorld();
  const held = treeContractOf(w.book, w.tree, run.blackboard.get(tag));
  if (held) {
    if ((held.progress === CP_ACCEPTED || held.progress === CP_IN_PROGRESS) && held.unit === unit) return;
    held.progress = CP_CANCELLED;
    w.tree.contracts = w.tree.contracts.filter((id) => id !== held.id);
  }
  const row = AI_UNITS[AI_UNIT_INDEX.get(unit) ?? -1];
  const value = (Number(tagOf(run, node, 'Recruit Value')) || 0) * FX * (row && row.bombard > 0 ? 3 : 1);
  const limit = dataInt(node, 'Time Limit');
  const c: AiContract = {
    id: w.newContractId(), tree: w.tree.id, treeName: w.tree.name, unit, building: null, district: null, plot: -1,
    value, city: -1, maxTurns: limit !== undefined && limit > 0 ? limit : 0, turns: -1, progress: CP_CLAIMED, assign: true,
  };
  w.tree.contracts.push(c.id);
  submitContract(w.book, c, w.cities, w.turn, (city) => w.clearProduction(city), (city, k) => w.submitted(city, k));
  run.blackboard.set(tag, c.id);
}

/** a data tag's value on the blackboard */
function tagOf(run: BtRun, node: BtNode, name: string): unknown {
  const t = dataTag(node, name);
  return t ? run.blackboard.get(t) : undefined;
}

/** the operation's strengths (0x73eb60, 0x73f7d0): the enemy's about the
 *  target, each team's (teamUpdate) and their sum. The enemy's: of the
 *  players it counts — the operation's enemy, else every player at war with
 *  the seat (the barbarians with everyone) — the army the knowledge base
 *  records within 3 of the target (0x5eadb0), then each known city within 3
 *  of the target its defense (0x5eb2c0, without
 *  its byte: the strongest of its districts' defense - 10 and walls, whole), the
 *  first of them with a defense above 0, where the enemy is none or a full
 *  civilization, the shortfall of the enemy's units' strength there below
 *  its owner's best combat strength (PlayerStats +0xf0) too */
export function refreshStrengths(ctx: OpsContext): void {
  const { op } = ctx;
  const view = ctx.view();
  op.enemyStrength = op.target === NO_PLOT ? 0 : enemyStrengthAbout(ctx, view);
  let total = 0;
  const targets = view.attackTargets(ctx.seat);
  for (const t of op.teams) {
    teamUpdate(ctx, t);
    updateTeam(view, ctx.seat, op, t, targets);
    total += t.strength;
  }
  op.strength = total;
}

function enemyStrengthAbout(ctx: OpsContext, view: MajorView): number {
  const { op } = ctx;
  const barb = view.barbarianSeat();
  const counts = (p: number): boolean => p !== ctx.seat && (p === op.enemy || (op.enemy < 0 && (view.atWar(ctx.seat, p) || p === barb || ctx.seat === barb)));
  const players = view.players().filter(counts);
  const units = new Map(players.map((p) => [p, armyStrength(view, ctx.army(p), op.target, 3, 0)] as const));
  let strength = 0;
  for (const p of players) strength += units.get(p)!;
  const enemyUnits = op.enemy >= 0 ? units.get(op.enemy) ?? 0 : 0;
  let garrison = op.enemy >= 0 && !view.majors().includes(op.enemy);
  for (const p of players) {
    for (const k of view.knownCities(ctx.seat)) {
      if (k.owner !== p || view.plotDistance(k.plot, op.target) > 3) continue;
      const def = Math.trunc(cityDefense(k, false));
      strength += def;
      if (def <= 0 || garrison) continue;
      const best = view.bestCombatStrength(k.owner);
      if (enemyUnits < best) strength += best - enemyUnits;
      garrison = true;
    }
  }
  return strength;
}

/** THE TEAM UPDATE (0x73fba0): per requirement the members carrying its AI
 *  type (one with a Dependence counted only where a member carries that
 *  type); the strength, each member's larger of combat and ranged strength
 *  less a tenth of its damage. Each requirement counted: below its
 *  MinNumber (or, with none, below its MinPercentage of the members) it is
 *  needed and the minimums unmet, else had; at its MaxNumber (or, with
 *  none, where one more passes its MaxPercentage of one more member) full.
 *  Ready (+0x11): the minimums met and, with an InitialStrengthAdvantage,
 *  the strength at the enemy's plus the desired (0x723ab0) or more; ongoing
 *  (+0x12) likewise with the OngoingStrengthAdvantage. The unit to build
 *  (+0x14): the one it had where the readiness held and the choice may
 *  still take it (0x79cba0), else the choice (0x79bd30) over the needed
 *  types (the had ones where none is needed), barring the full ones,
 *  against the operation's enemy. */
function teamUpdate(ctx: OpsContext, t: OpTeam): void {
  const { op } = ctx;
  const view = ctx.view();
  const units = unitsById(view, ctx.seat);
  const types = t.members.map((id) => units.get(id)?.type).filter((x): x is string => !!x);
  const reqs = teamReqs(t);
  t.counts = reqs.map((r) => types.filter((u) => hasAiType(u, r.aiType)).length);
  t.strength = t.members.reduce((s, id) => {
    const u = units.get(id);
    return u ? s + memberStrength(u) : s;
  }, 0);
  const n = t.members.length;
  const need: string[] = [];
  const have: string[] = [];
  const full: string[] = [];
  let mins = true;
  reqs.forEach((r, i) => {
    if (r.dependence && !types.some((u) => hasAiType(u, r.dependence!))) return;
    const c = t.counts[i];
    if (r.min !== null && r.min >= 0) {
      mins = mins && c >= r.min;
      (c < r.min ? need : have).push(r.aiType);
    } else {
      const want = Math.fround(n * r.minPercentage);
      mins = mins && c >= Math.trunc(want);
      (want > c ? need : have).push(r.aiType);
    }
    if (r.max !== null && r.max >= 0) {
      if (c >= r.max) full.push(r.aiType);
    } else if (c + 1 > Math.fround((n + 1) * r.maxPercentage)) full.push(r.aiType);
  });
  const wasReady = t.ready;
  const reaches = (adv: number): boolean =>
    t.strength >= Math.trunc(op.enemyStrength + desiredStrength(view, ctx.seat, op.enemy, adv, op.enemyStrength));
  t.minsMet = mins;
  const def = teamDef(op, t);
  t.ready = mins && (def.initialStrengthAdvantage === 0 || reaches(def.initialStrengthAdvantage));
  t.ongoing = t.ready && (def.ongoingStrengthAdvantage === 0 || reaches(def.ongoingStrengthAdvantage));
  const wanted = need.length ? need : have;
  const rows = ctx.unitRows();
  const old = t.unit;
  t.unit = old !== null && wasReady === t.ready && keepUnit(rows, old, wanted, full) ? old : null;
  if (t.unit === null || wasReady !== t.ready) t.unit = chooseUnit(rows, wanted, full, op.enemy);
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

// OPERATION MOVE (0x81a130 update, 0x816cb0 execution): the node holds one
// arrival flag (+0x70), cleared as its update begins; the teams in turn, a
// team ready with no member passed over (0x73ab20), each team's update over
// its members and the node's store for it (`moveUpdate`) writing the flag,
// the goal its slot (Move To: 0 the rally, 1 the target), Range to goal and
// Unit distance (default 1); a team with no goal FAILS; AlwaysRunning, the
// first team's update leaves the flag clear and the node RUNNING, no store
// kept (runs/h1_duelv1117 t112-122: city-state 3's City Defense Crossbowman,
// recruited in its city 42:13, then each turn garrisoned there, moves on to
// 41:13); a team reaching the target ends the update SUCCESS, the flag as
// that team's distance left it; else SUCCESS where the flag stands, else
// RUNNING. The execution moves each team (`moveExec`, its radius capped by
// the Unit distance) unless the flag stands in an operation ready, a unit in
// a formation or of the node's
// Leader Tag on its goal itself
const operationMove: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const slot = dataInt(node, 'Move To (enum)') ?? 1;
    const range = dataInt(node, 'Range to goal') ?? 0;
    const spread = dataInt(node, 'Unit distance') ?? 1;
    m.arrived = false;
    for (const [k, t] of ctx.op.teams.entries()) {
      if (t.ready && t.members.length === 0) continue;
      const goal = t.goals[slot] ?? NO_PLOT;
      if (goal === NO_PLOT) return BT_FAILURE;
      if (dataBool(node, 'AlwaysRunning')) return BT_RUNNING;
      const stores = (m.stores ??= {}) as Record<number, MoveStore>;
      const r = ctx.moveUpdate(t.members, stores[k], goal, slot === 1, range, spread);
      if (r.store) stores[k] = r.store;
      m.arrived = r.arrived;
      if (r.win) return BT_SUCCESS;
    }
    return m.arrived ? BT_SUCCESS : BT_RUNNING;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    const slot = dataInt(node, 'Move To (enum)') ?? 1;
    // the execution's radius cap is the node's Unit distance (its slot 3,
    // node +0x30; 1 where the node names none), not its Range to goal
    const range = dataInt(node, 'Unit distance') ?? 1;
    const leader = dataValue(node, 'Leader Tag');
    const arrived = !!m.arrived;
    const paired = new Set(ctx.op.formations.flat());
    // the operation ready (0x73aa60): its units may be built, or every team ready
    const ready = ctx.op.allowUnitConstruction || ctx.op.teams.every((t) => t.ready);
    for (const t of ctx.op.teams) {
      const goal = t.goals[slot] ?? NO_PLOT;
      if (goal === NO_PLOT) continue;
      const v = ctx.view();
      const moved = ctx.moveExec(t.members, goal, range, arrived, ready, (id, type) => paired.has(id) || (!!leader && hasAiType(type, leader)), !!leader);
      for (const x of moved) ctx.log(`${ctx.op.def}, Operation Move, ${x.type}, ${xy(v, x.from)}, ${xy(v, x.dest)}, ${xy(ctx.view(), x.after)}`);
    }
  },
};

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

// OPERATION ATTACK (0x80ec10): SUCCESS once the target is gone, RUNNING while
// the operation holds units, else FAILURE
const operationAttack: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    return opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE;
  },
};

// OPERATION ATTACK UNITS (0x80ecf0): SUCCESS once the target is gone; else
// RUNNING where the node says Always Running, SUCCESS where not
const operationAttackUnits: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    return dataBool(node, 'Always Running') ? BT_RUNNING : BT_SUCCESS;
  },
};

// NAVAL PATROL, NAVAL PILLAGE (0x803880): RUNNING while the operation holds
// units, else FAILURE
const navalUnitsRunning: BtHandler<OpsContext> = {
  update: (_node, _run, ctx) => (opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE),
};

// NAVAL PILLAGE's execution (0x803250): the operation's units' blows on
// their planning's district or unit target (no line)
const navalPillage: BtHandler<OpsContext> = {
  ...navalUnitsRunning,
  execute: (_node, _run, ctx) => ctx.pillage?.(opUnits(ctx.op)),
};

// NAVAL PATROL's execution (0x803060): the operation's units, each with
// Movement left, to HL Explore's target (no line)
const navalPatrol: BtHandler<OpsContext> = {
  ...navalUnitsRunning,
  execute: (_node, _run, ctx) => ctx.patrol?.(opUnits(ctx.op)),
};

/** the unit targets Naval Choose Target's list takes (0x802ea0:
 *  TARGET_CIVILIAN_UNIT through TARGET_HIGH_PRIORITY_UNIT) */
const NAVAL_CHOOSE_TYPES = new Set(['CIVILIAN', 'LOW', 'MEDIUM', 'HIGH']);

// NAVAL CHOOSE TARGET (0x803590, its list 0x802ea0): of the seat's tactical
// target list, the unit targets (civilian through high priority) on a plot
// of the node's Target Domain (DOMAIN_SEA: water; any other, the default
// DOMAIN_LAND among them: land), the nearest the operation's target, the
// first of equals, becomes its target and rally with each team's goals
// (0x73e7d0) and its children run, SUCCESS; with none the walk skips them,
// FAILURE where the node says Fail for no target (unset: it does), else
// SUCCESS
const navalChooseTarget: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const v = ctx.view();
    const P = v.plots();
    const sea = (dataValue(node, 'Target Domain') ?? 'DOMAIN_LAND') === 'DOMAIN_SEA';
    let best = NO_PLOT;
    let bd = Infinity;
    for (const t of v.attackTargets(ctx.seat)) {
      if (!NAVAL_CHOOSE_TYPES.has(t.type) || t.plot < 0 || !!P[t.plot].water !== sea) continue;
      const d = ctx.op.target >= 0 ? v.plotDistance(ctx.op.target, t.plot) : 0;
      if (best !== NO_PLOT && d >= bd) continue;
      best = t.plot;
      bd = d;
    }
    const m = run.mem[node.index];
    m.found = best !== NO_PLOT;
    if (best === NO_PLOT) return (dataBool(node, 'Fail for no target') ?? true) ? BT_FAILURE : BT_SUCCESS;
    const op = ctx.op;
    op.target = best;
    op.rally = best;
    for (const t of op.teams) {
      t.goals[0] = best;
      t.goals[1] = best;
    }
    return BT_SUCCESS;
  },
  next: (node, run) => (run.mem[node.index].found && run.status[node.index] !== BT_SKIPPED ? node.index + 1 : node.end),
};

// OPERATION IS READY (0x81a090): every team's minimums met
const operationIsReady: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    return ctx.op.teams.every((t) => t.ready) ? BT_SUCCESS : BT_FAILURE;
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
  child(node, run, own, s, _child, ctx) {
    // the child begun: it runs on
    if (s === BT_FRESH) return { own, finished: false };
    const m = run.mem[node.index];
    const limit = dataInt(node, 'Turns to Run') ?? 0;
    const elapsed = ctx.turn - (m.start as number);
    if (dataBool(node, 'Limit Is Min') && elapsed <= limit && s !== BT_FAILURE && s !== BT_ERROR) return { own: BT_RUNNING, finished: true };
    // the RUNNING child's limit at the game's speed (0x5254d0)
    if (s === BT_RUNNING && elapsed >= Math.trunc(limit * ctx.view().costMultiplierPct / 100)) {
      const fail = dataBool(node, 'Fail at Limit');
      return { own: fail === false ? BT_SUCCESS : BT_FAILURE, finished: true };
    }
    return { own: s, finished: true };
  },
};

// OPERATION DEFEND UNITS (0x80ee70 update, 0x80d790 execution): the update
// SUCCEEDS, marking the node where a team's member is endangered, hurt to
// AutoProtect Percentage (33) of its hit points, or fortified in danger; the
// marked node's execution protects the members outside Protect Outside
// Range (-1: all) of the target, and a unit it releases leaves its team
const operationDefendUnits: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const pct = dataInt(node, 'AutoProtect Percentage') ?? 33;
    const d = ctx.defend;
    run.mem[node.index].marked = !!d && ctx.op.teams.some((t) => d.flagged(t.members, pct));
    return BT_SUCCESS;
  },
  execute(node, run, ctx) {
    const d = ctx.defend;
    if (!d || !run.mem[node.index].marked) return;
    const pct = dataInt(node, 'AutoProtect Percentage') ?? 33;
    const range = dataInt(node, 'Protect Outside Range') ?? -1;
    for (const t of ctx.op.teams) {
      const out = d.execute(t.members, ctx.op.target, pct, range);
      if (out.released.length) t.members = t.members.filter((id) => !out.released.includes(id));
      for (const x of out.lines) ctx.log(`${ctx.op.def}, Operation Protect Units, ${x.type}, ${x.what}`);
    }
  },
};

export const OP_NODES: Readonly<Record<string, BtHandler<OpsContext>>> = {
  'Decode Trigger': decodeTrigger,
  'Operation Defend Units': operationDefendUnits,
  'Operation Change Target': changeTarget,
  'Find Available Unit': findAvailableUnit,
  'Contract Manager Decorator': contractManagerNode<OpsContext>((ctx) => ctx.contractWorld()),
  'Build Unit': buildUnitNode<OpsContext>((ctx) => ctx.contractWorld()),
  'Recruit Units': recruitUnits,
  'Operation Move': operationMove,
  'Lock Units': lockUnits,
  'Make Formation': makeFormation,
  'Operation Attack Units': { ...operationAttackUnits, execute: attackUnitsExecute },
  ...ASSAULT_NODES,
  ...BARBARIAN_NODES,
  'Operation Attack':{ ...operationAttack, execute: operationAttackExecute },
  'Naval Patrol': navalPatrol,
  'Naval Pillage': navalPillage,
  'Naval Choose Target': navalChooseTarget,
  'Operation Naval Escort': success,
  Settle: settle,
  'Operation Is Ready': operationIsReady,
  'Turn Limiter': turnLimiter,
};
