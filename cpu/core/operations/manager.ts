/**
 * THE OPERATION MANAGER (AI/MilitaryAI 0x722690 -> 0x727510, Operation.cpp;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the operations"), the
 * one manager of every party that runs operations: the majors and the
 * city-states (their limits by their leader trait); a party that settles
 * hands it its settling AI (OpsSettle). Its state is plain data (`OpsAi`):
 * a city-state's lives in its state.
 *
 * A seat's turn in three parts, as the game's Control Manager runs them:
 *  - the military AI's turn (`operationsEvaluate`, list B): the operations
 *    lose the units gone; for a seat that settles, the settle evaluation's
 *    AI_EVENT_DESIRE_SETTLE starts the "Settle New City" operation
 *    (TriggeredBehaviorTrees TRIGGER_SETTLE_SPOT, through 0x800c60 ->
 *    0x7265b0) where the seat runs none; the candidates (evaluate.ts) on the
 *    knowledge base's records of the turn before, the valid ones' values
 *    logged; a running operation's candidate names its backup (0x73e610);
 *    the best new candidate that starts itself — the highest Priority, then
 *    the best odds, the first of equals — where the seat runs fewer of its
 *    OperationType than its limits allow (0x726470) is the one to start;
 *  - the cities' update (list A): a threatened city starts City Defense at
 *    its plot (the defence event 0x5cced0 through the start by name 0x7265b0,
 *    `startOperationNamed`);
 *  - the operations' run (`operationsRun`, with the tree manager's tick):
 *    each running operation logs its target and refreshes its strengths and
 *    its teams' readiness (0x73eb60, 0x73f7d0, 0x73b360); the chosen
 *    candidate starts; then each operation's tree ticks, an operation whose
 *    tree ends complete.
 *
 * The operations live in the manager's pool (+0x2e0, 0x71e370): an operation
 * takes the slot freed last, else a new one, and the manager walks them in
 * slot order.
 */
import { AI_LEADER_OP_LISTS, AI_OP_DEFS, AI_OP_LIMIT_LISTS, AI_OP_LISTS, AI_TREES } from '../../data/aiOperations';
import { compileTree, tick, BT_FRESH, type BtNode, type BtRun } from '../behaviorTree';
import { NO_PLOT, addMember, newTeams, opDef, opUnits, xy, type Operation } from './operation';
import { OP_NODES, refreshStrengths, switchToBackup, type DiplomacyRequest, type OpsContext } from './nodes';
import type { ContractBook, ContractCity, ContractNodeWorld } from '../aiContracts';
import { evaluate, type ArmyUnit, type Candidate } from './evaluate';
import type { KnownUnit } from './knowledge';
import type { AiOpDef, OpsSettle } from './types';
import type { UnitProductionRow } from '../aiUnitProduction';
import type { MajorAttackView, MajorKnownCityView, MajorUnitView, MajorView } from '../../../ai/major/view';

export interface OpsAi {
  seat: number;
  /** the pool's slots, null where free */
  slots: (Operation | null)[];
  /** the freed slots, the last freed on top */
  free: number[];
  /** the players the seat prepares for war with (m_prepareForWarWith, set
   *  by PrepareForWarWith 0x724f30): their WAR definitions are candidates
   *  short of war */
  prepareForWar: number[];
  /** the diplomatic requests its operations made (Operation Diplomacy),
   *  their ids their places; none of them is taken up here */
  diplomacy: DiplomacyRequest[];
  /** the new candidate the military AI's turn chose, started at the run */
  pick: { def: string; enemy: number; target: number; rally: number } | null;
}

/** what the manager reads and does beside its own state */
export interface OpsEnv {
  turn: number;
  /** the view as the actions so far left the game */
  view(): MajorView;
  /** the definitions the seat runs (null: its leader's list, `allowedOps`) */
  defs: readonly string[] | null;
  /** the knowledge base: a player's army records, the camps, the city
   *  records as the turn before left them */
  army(player: number): readonly KnownUnit[];
  camps(): readonly number[];
  known(): readonly MajorKnownCityView[];
  /** a city's threat by its plot (CityBuildAI +0x1b8), -1 none */
  threat(plot: number): number;
  /** the seat's contract book, its next contract's id, its cities as the
   *  contracts read them, the production a submission clears */
  book(): ContractBook;
  newContractId(): number;
  contractCities(): readonly ContractCity[];
  clearProduction(city: ContractCity): void;
  /** the id the next operation's tree takes */
  newOpId(): number;
  /** the seat's settling AI, none for a party that never settles */
  settle: OpsSettle | null;
  /** the seat's unit production entries (the military AI's +0x268) */
  unitRows(): readonly UnitProductionRow[];
  /** the seat's orders: its unit action rows; a move; a blow; an attack
   *  assignment over its units against the targets `keep` picks of its
   *  tactical target list, carried out (the tactical pass's 0x771f80) */
  act(rows: number[][]): void;
  move(id: number, dest: number, mate: number): void;
  strike(id: number, plot: number): void;
  attack(ids: readonly number[], keep: (k: number) => boolean, even: boolean, survive: boolean): readonly MajorAttackView[];
  /** Operation Move's update and execution for a team (`OpsContext`) */
  moveUpdate: OpsContext['moveUpdate'];
  moveExec: OpsContext['moveExec'];
  /** the operation lines (AI_Operation.csv without its turn and player) and
   *  the candidate lines (AI_Operation_Eval.csv) */
  log(line: string): void;
  logEval(line: string): void;
}

export const newOpsAi = (seat: number): OpsAi => ({ seat, slots: [], free: [], prepareForWar: [], diplomacy: [], pick: null });

/** PrepareForWarWith (0x724f30): the seat prepares for war with the player,
 *  or no longer */
export function prepareForWarWith(ai: OpsAi, player: number, on: boolean): void {
  ai.prepareForWar = ai.prepareForWar.filter((p) => p !== player);
  if (on) ai.prepareForWar.push(player);
}

/** THE WAR DECLARATIONS' NOT-READY HOOK (0x6742d0): the seat prepares for
 *  war with `player` where the majors it fights or prepares for war with
 *  number at most half the living majors, and `player` is neither its
 *  declared friend nor its ally */
export function notReadyHook(ai: OpsAi, view: MajorView, player: number): void {
  const majors = view.majors();
  const n = majors.filter((q) => q !== ai.seat && (view.atWar(ai.seat, q) || ai.prepareForWar.includes(q))).length;
  if (n > majors.length >> 1) return;
  if (view.declaredFriends(ai.seat, player) || view.allied(ai.seat, player)) return;
  prepareForWarWith(ai, player, true);
}

/** the diplomatic AI's handler 0x650890 (a game signal between the seat and
 *  the player: the port takes it for their peace): the seat prepares for
 *  war with the player no more (its completion of the operations whose
 *  enemy it no longer fights, op +0x138 below 4, unported) */
export function peaceMade(ai: OpsAi, player: number): void {
  prepareForWarWith(ai, player, false);
}

/** THE WAR OPERATION READY (0x723db0): the first running operation against
 *  `player` that is ready where `needReady` asks (its teams' minimums met,
 *  or its units may be built for it) decides — with no goal slot asked, yes;
 *  else whether a member of a team stands within `dist` of the team's goal
 *  of `slot`. The Surprise War asks (true, 2, the march point) */
export function warOperationReady(ai: OpsAi, view: MajorView, player: number, needReady: boolean, dist: number, slot: number): boolean {
  const units = new Map(view.units(ai.seat).map((u) => [u.id, u]));
  for (const op of opsOf(ai)) {
    if (op.enemy !== player) continue;
    if (needReady && !(op.teams.every((t) => t.ready) || op.allowUnitConstruction)) continue;
    if (slot < 0) return true;
    for (const t of op.teams) {
      const g = t.goals[slot] ?? NO_PLOT;
      for (const id of t.members) {
        const u = units.get(id);
        if (u && g !== NO_PLOT && view.plotDistance(u.plot, g) <= dist) return true;
      }
    }
    return false;
  }
  return false;
}

/** the wars' can-do (0x673800): a war operation ready, a member within 2 of
 *  its march point (0x723db0(p, 1, 2, 5)) */
export const surpriseWarReady = (ai: OpsAi, view: MajorView, player: number): boolean =>
  warOperationReady(ai, view, player, true, 2, 5);

/** the running operations in slot order */
export const opsOf = (ai: OpsAi): Operation[] => ai.slots.filter((o): o is Operation => o !== null);

const TREES = new Map<string, BtNode[]>();
function treeOf(name: string): BtNode[] {
  let t = TREES.get(name);
  if (!t) TREES.set(name, (t = compileTree(name, AI_TREES[name] ?? [])));
  return t;
}

/** the definitions a leader may run (Leaders.OperationList, else
 *  Default_List): its list's base first, then its own rows, a removing row
 *  dropping its definition */
export function allowedOps(leader: string | null): AiOpDef[] {
  const resolve = (name: string): string[] => {
    const l = AI_OP_LISTS[name];
    if (!l) return [];
    const out = l.base ? resolve(l.base) : [];
    for (const r of l.ops) {
      const k = out.indexOf(r.def);
      if (r.remove) {
        if (k >= 0) out.splice(k, 1);
      } else if (k < 0) out.push(r.def);
    }
    return out;
  };
  return resolve((leader && AI_LEADER_OP_LISTS[leader]) ?? 'Default_List').map((n) => AI_OP_DEFS[n]).filter(Boolean);
}

/** the seat's operation limits by OperationType (AiOperationTypes and
 *  PerWarOperationTypes lists: its leader trait's — a major's
 *  TRAIT_LEADER_MAJOR_CIV, a city-state's MINOR_CIV_DEFAULT_TRAIT — and a
 *  major's of the strategies it follows) */
function limitsOf(view: MajorView, seat: number): { base: Map<string, number>; perWar: Map<string, number> } {
  const base = new Map<string, number>();
  const perWar = new Map<string, number>();
  const followed = view.majors().includes(seat) ? view.strategies(seat) : new Set<string>();
  const trait = view.majors().includes(seat) ? 'TRAIT_LEADER_MAJOR_CIV' : view.cityStateSeats().includes(seat) ? 'MINOR_CIV_DEFAULT_TRAIT' : null;
  for (const l of AI_OP_LIMIT_LISTS) {
    const applies = (l.trait !== null && l.trait === trait) || (!l.trait && !l.agenda && l.strategies.length > 0 && l.strategies.every((s) => followed.has(s)));
    if (!applies) continue;
    const into = l.system === 'PerWarOperationTypes' ? perWar : base;
    for (const [k, v] of Object.entries(l.items)) into.set(k, (into.get(k) ?? 0) + v);
  }
  return { base, perWar };
}

/** the seat's staging plots a candidate's rally is chosen from: its cities */
const stagingPlots = (view: MajorView, seat: number): readonly number[] => view.cityPlots(seat);

/** start an operation (0x73a120): a pool slot, its teams, target and rally,
 *  its tree */
function startOperation(ai: OpsAi, env: OpsEnv, def: AiOpDef, enemy: number, target: number, rally: number): Operation {
  const nodes = treeOf(def.tree ?? '');
  const op: Operation = {
    id: env.newOpId(), def: def.name, enemy, target, rally, backup: null, teams: newTeams(def, env.view(), target),
    status: nodes.map(() => BT_FRESH), mem: nodes.map(() => ({})), bb: {}, done: false, started: env.turn, enemyStrength: 0, strength: 0,
    triggerUnits: [], triggerValue: 0, locked: false, allowUnitConstruction: false, contracts: [], formations: [],
  };
  for (const t of op.teams) {
    t.goals[0] = rally;
    t.goals[1] = target;
  }
  const slot = ai.free.length ? ai.free.pop()! : ai.slots.length;
  ai.slots[slot] = op;
  env.log(`${def.name}, Started`);
  return op;
}

/** the manager's start by name (0x7265b0): the definition against no enemy
 *  at the plot, its rally the plot; the operation's id */
export function startOperationNamed(ai: OpsAi, env: OpsEnv, name: string, plot: number): number {
  return startOperation(ai, env, AI_OP_DEFS[name], -1, plot, plot).id;
}

function endOperation(ai: OpsAi, op: Operation): void {
  const k = ai.slots.indexOf(op);
  if (k < 0) return;
  ai.slots[k] = null;
  ai.free.push(k);
}

/** the seat's running operations of an OperationType */
const count = (ai: OpsAi, type: string | null): number => opsOf(ai).filter((o) => opDef(o).operationType === type).length;

/** the seat's units in any operation */
const assigned = (ai: OpsAi): Set<number> => new Set(opsOf(ai).flatMap(opUnits));

/** a unit a city trained for a contract an operation's tree made joins the
 *  operation's first team, where no operation holds it already (the
 *  completion signal 0x5f5650, Release Unit When Built unset); false where
 *  no running operation made the contract */
export function joinBuilt(ai: OpsAi, tree: number, unit: Pick<MajorUnitView, 'id' | 'type'>): boolean {
  const op = opsOf(ai).find((o) => o.id === tree);
  if (!op) return false;
  if (op.teams.length && !assigned(ai).has(unit.id)) addMember(op.teams[0], unit);
  return true;
}

/** the contracts the seat's running operations hold */
export const opContracts = (ai: OpsAi): number[] => opsOf(ai).flatMap((o) => o.contracts);

/** THE MILITARY AI'S TURN (list B): the units gone leave their operations;
 *  the settle start; the candidates evaluated, logged, the backups named and
 *  the new one to start chosen */
export function operationsEvaluate(ai: OpsAi, env: OpsEnv): void {
  const view = env.view();
  // the seat's operations lose the units gone
  const live = new Set(view.units(ai.seat).map((u) => u.id));
  for (const op of opsOf(ai)) {
    for (const t of op.teams) t.members = t.members.filter((id) => live.has(id));
    refreshStrengths(context(ai, env, op));
  }
  const allowed = env.defs ? env.defs.map((n) => AI_OP_DEFS[n]) : allowedOps(view.leaderType(ai.seat));
  const staging = stagingPlots(view, ai.seat);
  const army = (p: number): readonly ArmyUnit[] => (p === ai.seat ? view.units(ai.seat) : env.army(p));
  const blank = (def: AiOpDef, enemy: number): Candidate => ({ def, enemy, presetRally: NO_PLOT, presetStrength: null, op: null,
    valid: false, odds: 0, value: 0, target: NO_PLOT, rally: NO_PLOT });
  // the military AI's turn (0x7271d0 -> 0x722d70): the candidates — the
  // running operations', then per other player at war with the seat or
  // prepared for war with its WAR definitions, then each allowed definition
  // against no enemy — evaluated on the knowledge base's records as the turn
  // before left them
  const cands: Candidate[] = [];
  for (const op of opsOf(ai)) cands.push({ ...blank(opDef(op), op.enemy), presetRally: op.target, presetStrength: op.strength, op });
  for (const p of view.players()) {
    if (p === ai.seat || !(view.atWar(ai.seat, p) || ai.prepareForWar.includes(p))) continue;
    for (const def of allowed) if (def.enemyType === 'WAR') cands.push(blank(def, p));
  }
  for (const def of allowed) if (def.enemyType === 'NONE') cands.push(blank(def, -1));
  const inputs = { settle: env.settle, camps: env.camps(), taken: new Set(opsOf(ai).map((o) => o.target)), known: env.known, army };
  for (const c of cands) evaluate(view, ai.seat, c, staging, inputs);
  const { base, perWar } = limitsOf(view, ai.seat);
  // AI_EVENT_DESIRE_SETTLE (0x7265b0): for a seat that settles, Settle New City starts where the seat
  // runs fewer than its limit, from the candidate for it: the settle site as
  // its target (else the candidate's), the candidate's rally; with no target
  // the candidate is weighed again for the new operation and its target
  // becomes the backup it switches to
  const settleDef = AI_OP_DEFS['Settle New City'];
  const settleCand = cands.find((c) => c.def === settleDef && !c.op);
  const settleType = settleDef.operationType ?? '';
  if (env.settle && settleCand && count(ai, settleType) < (base.get(settleType) ?? 0)) {
    const site = view.cityPlots(ai.seat).length > 0 ? env.settle?.best(-1) ?? null : null;
    const op = startOperation(ai, env, settleDef, -1, site ? site.plot : settleCand.target, settleCand.rally);
    if (op.target === NO_PLOT) {
      const again: Candidate = { ...blank(settleDef, -1), presetRally: op.target, presetStrength: op.strength, op };
      evaluate(view, ai.seat, again, staging, inputs);
      if (again.valid) {
        op.backup = { target: again.target, rally: again.rally, enemy: again.enemy };
        switchToBackup(op);
      }
    }
  }
  // the manager's pick: a running operation's candidate is its backup; of
  // the new ones that start themselves the best under the limits
  const wars = view.majors().filter((p) => p !== ai.seat && view.atWar(ai.seat, p)).length;
  let best: Candidate | null = null;
  for (const c of cands) {
    if (!c.valid) continue;
    env.logEval(`${c.enemy}, ${c.def.name}, ${(c.value / 256).toFixed(1)}`);
    if (c.op) {
      c.op.backup = { target: c.target, rally: c.rally, enemy: c.enemy };
      continue;
    }
    if (!c.def.selfStart) continue;
    if (best && !(c.def.priority > best.def.priority || (c.def.priority === best.def.priority && c.odds > best.odds))) continue;
    const type = c.def.operationType;
    if (type && count(ai, type) >= (perWar.get(type) ?? 0) * wars + (base.get(type) ?? 0)) continue;
    best = c;
  }
  ai.pick = best ? { def: best.def.name, enemy: best.enemy, target: best.target, rally: best.rally } : null;
}

/** THE OPERATIONS' RUN (with the tree manager's tick): each operation's
 *  target and teams logged; the chosen candidate started; the trees, in
 *  slot order */
export function operationsRun(ai: OpsAi, env: OpsEnv): void {
  for (const op of opsOf(ai)) {
    const view = env.view();
    env.log(`${op.def} running, TARGET ${xy(view, op.target)}`);
    refreshStrengths(context(ai, env, op));
    const units = new Map(env.view().units(ai.seat).map((u) => [u.id, u]));
    op.teams.forEach((t, k) => {
      const names = t.members.map((id) => units.get(id)?.type).filter(Boolean).map((n) => `${n}; `).join('');
      env.log(`${op.def}, ,${k}, ${t.ready ? 'Ready' : 'Not Ready'}, ${names}`);
    });
  }
  const pick = ai.pick;
  ai.pick = null;
  if (pick) startOperation(ai, env, AI_OP_DEFS[pick.def], pick.enemy, pick.target, pick.rally);
  for (const op of opsOf(ai)) {
    const run: BtRun = { name: op.def, nodes: treeOf(opDef(op).tree ?? ''), status: op.status, mem: op.mem,
      blackboard: new Map(Object.entries(op.bb)), done: op.done };
    tick(run, OP_NODES, context(ai, env, op));
    op.bb = Object.fromEntries(run.blackboard);
    op.done = run.done;
    if (op.done) {
      env.log(`${op.def}, Operation complete`);
      endOperation(ai, op);
    }
  }
}

/** what the shared contract nodes read of an operation's tree: the seat's
 *  book and cities, the tree's own contracts */
function contractWorld(ai: OpsAi, env: OpsEnv, op: Operation): ContractNodeWorld {
  const view = env.view();
  return {
    book: env.book(),
    tree: { id: op.id, name: opDef(op).tree ?? op.def, get contracts() { return op.contracts; }, set contracts(v) { op.contracts = v; } },
    turn: env.turn,
    get cities() { return env.contractCities(); },
    newContractId: () => env.newContractId(),
    clearProduction: (city) => env.clearProduction(city), submitted: () => undefined,
    techHeld: (t) => view.techsHeld(ai.seat).has(t), civicHeld: (c) => view.civicsHeld(ai.seat).has(c), holds: () => false,
  };
}

function context(ai: OpsAi, env: OpsEnv, op: Operation): OpsContext {
  return {
    seat: ai.seat,
    turn: env.turn,
    view: env.view,
    act: env.act,
    move: env.move,
    strike: env.strike,
    attack: env.attack,
    moveUpdate: env.moveUpdate,
    moveExec: env.moveExec,
    op,
    assigned: () => assigned(ai),
    others: () => opsOf(ai),
    contractWorld: () => contractWorld(ai, env, op),
    diplomacy: ai.diplomacy,
    requestDiplomacy: (action, enemy, value) => {
      const id = ai.diplomacy.length;
      ai.diplomacy.push({ id, action, enemy, value, turn: env.turn, op: op.id });
      return id;
    },
    settle: env.settle,
    threat: env.threat,
    unitRows: env.unitRows,
    camps: env.camps,
    log: env.log,
  };
}

/** remap the seat's unit ids (a caller whose engine renumbers units between
 *  turns): an id the map lacks leaves its operation */
export function remapUnits(ai: OpsAi, map: (id: number) => number | undefined): void {
  const ids = (xs: readonly number[]): number[] => xs.flatMap((id) => {
    const n = map(id);
    return n === undefined ? [] : [n];
  });
  for (const op of opsOf(ai)) {
    for (const t of op.teams) t.members = ids(t.members);
    op.triggerUnits = ids(op.triggerUnits);
    op.formations = op.formations.flatMap(([a, b]) => {
      const x = map(a);
      const y = map(b);
      return x === undefined || y === undefined ? [] : [[x, y] as [number, number]];
    });
    for (const [k, v] of Object.entries(op.bb)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'number')) op.bb[k] = ids(v as number[]);
    }
  }
}
