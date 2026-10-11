/**
 * THE OPERATION MANAGER (AI/MilitaryAI 0x722690 -> 0x727510, Operation.cpp;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the operations").
 *
 * Each turn of an AI major: the settle evaluation's AI_EVENT_DESIRE_SETTLE
 * starts the "Settle New City" operation (TriggeredBehaviorTrees
 * TRIGGER_SETTLE_SPOT, through 0x800c60 -> 0x7265b0) where the seat runs none;
 * the manager evaluates its candidates (evaluate.ts) and logs the valid ones'
 * values; a running operation's candidate names its backup (0x73e610); each
 * running operation logs its target and refreshes its strengths and its
 * teams' readiness (0x73eb60, 0x73f7d0, 0x73b360); the best new candidate
 * that starts itself — the highest Priority, then the best odds, the first
 * of equals — starts where the seat runs fewer of its OperationType than its
 * limits allow (0x726470); then each operation's tree ticks, an operation
 * whose tree ends complete.
 *
 * The operations live in the manager's pool (+0x2e0, 0x71e370): an operation
 * takes the slot freed last, else a new one, and the manager walks them in
 * slot order.
 */
import { AI_LEADER_OP_LISTS, AI_OP_DEFS, AI_OP_LIMIT_LISTS, AI_OP_LISTS, AI_TREES } from './tables';
import { compileTree, newRun, tick, type BtNode } from '../../../cpu/core/behaviorTree';
import { NO_PLOT, addMember, newTeams, opUnits, xy, type Operation } from './operation';
import { OP_NODES, refreshStrengths, switchToBackup, type Contract, type DiplomacyRequest, type OpsContext } from './nodes';
import { evaluate, type ArmyUnit, type Candidate } from './evaluate';
import { knownArmy, lookArmy, type ArmyRecords } from './knowledge';
import { cityValue } from './cityValue';
import { bestSettleSite, settleRegions, type SettleRegions } from '../settle';
import type { AiOpDef } from './types';
import type { MajorKnownCityView, MajorView } from '../view';

export interface OpsAi {
  seat: number;
  /** the pool's slots, null where free */
  slots: (Operation | null)[];
  /** the freed slots, the last freed on top */
  free: number[];
  nextOp: number;
  contracts: Map<number, Contract>;
  nextContract: number;
  /** the players the seat prepares for war with (m_prepareForWarWith, set
   *  by PrepareForWarWith 0x724f30): their WAR definitions are candidates
   *  short of war */
  prepareForWar: Set<number>;
  /** the diplomatic requests its operations made (Operation Diplomacy), by
   *  id; none of them is taken up here */
  diplomacy: Map<number, DiplomacyRequest>;
  /** the knowledge base's city records as its last refresh left them, null
   *  before the first */
  known: readonly MajorKnownCityView[] | null;
  /** the knowledge base's army records */
  army: ArmyRecords;
}

export interface OpsTurnEnv {
  turn: number;
  /** the view as the actions so far left the game */
  view(): MajorView;
  /** carry out the seat's unit action rows now */
  act(rows: number[][]): void;
}

/** a turn's AI_Operation.csv lines and AI_Operation_Eval.csv lines, each
 *  without its turn and player, and the "CITY VALUES" its evaluation lines
 *  close with: per city the seat knows of another player, its value (24.8) */
export interface OpsTurnLog {
  lines: string[];
  evals: string[];
  cityValues: { plot: number; value: number }[];
}

export const newOpsAi = (seat: number): OpsAi => ({ seat, slots: [], free: [], nextOp: 0, contracts: new Map(), nextContract: 0,
  prepareForWar: new Set(), diplomacy: new Map(), known: null, army: new Map() });

/** PrepareForWarWith (0x724f30): the seat prepares for war with the player,
 *  or no longer */
export function prepareForWarWith(ai: OpsAi, player: number, on: boolean): void {
  if (on) ai.prepareForWar.add(player);
  else ai.prepareForWar.delete(player);
}

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
 *  PerWarOperationTypes lists: a major's trait lists and those of the
 *  strategies it follows) */
function limitsOf(view: MajorView, seat: number): { base: Map<string, number>; perWar: Map<string, number> } {
  const base = new Map<string, number>();
  const perWar = new Map<string, number>();
  const followed = view.strategies(seat);
  for (const l of AI_OP_LIMIT_LISTS) {
    const applies = l.trait === 'TRAIT_LEADER_MAJOR_CIV' || (!l.trait && !l.agenda && l.strategies.length > 0 && l.strategies.every((s) => followed.has(s)));
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
function startOperation(ai: OpsAi, view: MajorView, def: AiOpDef, enemy: number, target: number, rally: number, turn: number,
  log: (l: string) => void): Operation {
  const op: Operation = {
    id: ai.nextOp++, def, enemy, target, rally, backup: null, teams: newTeams(def, view, target),
    run: newRun(def.tree ?? '', treeOf(def.tree ?? '')), started: turn, enemyStrength: 0, strength: 0,
    triggerUnits: [], triggerValue: 0, locked: false, formations: [],
  };
  for (const t of op.teams) {
    t.goals[0] = rally;
    t.goals[1] = target;
  }
  const slot = ai.free.length ? ai.free.pop()! : ai.slots.length;
  ai.slots[slot] = op;
  log(`${def.name}, Started`);
  return op;
}

function endOperation(ai: OpsAi, op: Operation): void {
  const k = ai.slots.indexOf(op);
  if (k < 0) return;
  ai.slots[k] = null;
  ai.free.push(k);
}

/** the seat's running operations of an OperationType */
const count = (ai: OpsAi, type: string | null): number => opsOf(ai).filter((o) => o.def.operationType === type).length;

/** the seat's units in any operation */
const assigned = (ai: OpsAi): Set<number> => new Set(opsOf(ai).flatMap(opUnits));

/** the production requests, as the seat's cities and units stand: done once
 *  a unit of the type stands that did not when it was made, building while a
 *  city builds the type (its turns to finish), else submitted */
function updateContracts(ai: OpsAi, view: MajorView): void {
  const units = view.units(ai.seat);
  const builds = view.cityBuilds(ai.seat);
  for (const c of ai.contracts.values()) {
    if (c.state === 'done' || c.state === 'failed') continue;
    // the unit built joins the operation that asked for it (the contract's
    // tree keeps it: Release Unit When Built 0)
    const built = units.find((u) => u.type === c.unitType && !c.before.includes(u.id) && !assigned(ai).has(u.id));
    if (built) {
      c.state = 'done';
      c.turnsLeft = 0;
      const op = opsOf(ai).find((o) => o.id === c.op);
      if (op && op.teams.length) addMember(op.teams[0], built);
      continue;
    }
    const b = builds.filter((x) => x.unitType === c.unitType).sort((x, y) => x.turnsLeft - y.turnsLeft)[0];
    if (b) {
      c.state = 'building';
      c.turnsLeft = b.turnsLeft;
    } else {
      c.state = 'submitted';
      c.turnsLeft = -1;
    }
  }
}

/** One turn of the seat's operations. */
export function operationsTurn(ai: OpsAi, env: OpsTurnEnv, sr?: SettleRegions): OpsTurnLog {
  const lines: string[] = [];
  const evals: string[] = [];
  const log = (l: string) => lines.push(l);
  const view = env.view();
  // the seat's operations lose the units gone
  const live = new Set(view.units(ai.seat).map((u) => u.id));
  for (const op of opsOf(ai)) {
    for (const t of op.teams) t.members = t.members.filter((id) => live.has(id));
    refreshStrengths(context(ai, env, op, log));
  }
  updateContracts(ai, view);
  const regions = sr ?? settleRegions(view, ai.seat);
  // the candidates (0x722d70, evaluated before the turn's triggers): the
  // running operations', then each allowed definition's against no enemy
  const cands: Candidate[] = [];
  const blank = (def: AiOpDef, enemy: number): Candidate => ({ def, enemy, presetRally: NO_PLOT, presetStrength: null, op: null,
    valid: false, odds: 0, value: 0, target: NO_PLOT, rally: NO_PLOT });
  for (const op of opsOf(ai)) cands.push({ ...blank(op.def, op.enemy), presetRally: op.target, presetStrength: op.strength, op });
  // per other player at war with the seat or prepared for war with, its WAR
  // definitions
  const allowed = allowedOps(view.leaderType(ai.seat));
  for (const p of view.players()) {
    if (p === ai.seat || !(view.atWar(ai.seat, p) || ai.prepareForWar.has(p))) continue;
    for (const def of allowed) if (def.enemyType === 'WAR') cands.push(blank(def, p));
  }
  for (const def of allowed) if (def.enemyType === 'NONE') cands.push(blank(def, -1));
  const staging = stagingPlots(view, ai.seat);
  const army = (p: number): readonly ArmyUnit[] => (p === ai.seat ? view.units(ai.seat) : knownArmy(ai.army, p));
  const inputs = { regions, taken: new Set(opsOf(ai).map((o) => o.target)), known: ai.known ?? view.knownCities(ai.seat), army };
  for (const c of cands) evaluate(view, ai.seat, c, staging, inputs);
  const { base, perWar } = limitsOf(view, ai.seat);
  // AI_EVENT_DESIRE_SETTLE (0x7265b0): Settle New City starts where the seat
  // runs fewer than its limit, from the candidate for it: the settle site as
  // its target (else the candidate's), the candidate's rally; with no target
  // the candidate is weighed again for the new operation and its target
  // becomes the backup it switches to
  const settleDef = AI_OP_DEFS['Settle New City'];
  const settleCand = cands.find((c) => c.def === settleDef && !c.op);
  const settleType = settleDef.operationType ?? '';
  if (settleCand && count(ai, settleType) < (base.get(settleType) ?? 0)) {
    const site = view.cityPlots(ai.seat).length > 0 ? bestSettleSite(regions) : null;
    const op = startOperation(ai, view, settleDef, -1, site ? site.plot : settleCand.target, settleCand.rally, env.turn, log);
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
    evals.push(`${c.enemy}, ${c.def.name}, ${(c.value / 256).toFixed(1)}`);
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
  // the knowledge base's city records refresh after the evaluation (the
  // evaluation of a turn reads the records the turn before logged), and
  // the CITY VALUES the evaluation lines close with read them: each known
  // city of another player
  const known = (ai.known = view.knownCities(ai.seat));
  lookArmy(ai.army, view, ai.seat, env.turn);
  const cityValues = known.filter((k) => k.owner !== ai.seat).map((k) => ({ plot: k.plot, value: cityValue(view, ai.seat, k, known, army) }));
  // each operation's target and teams
  for (const op of opsOf(ai)) {
    log(`${op.def.name} running, TARGET ${xy(view, op.target)}`);
    const ctx = context(ai, env, op, log);
    refreshStrengths(ctx);
    const units = new Map(view.units(ai.seat).map((u) => [u.id, u]));
    op.teams.forEach((t, k) => {
      const names = t.members.map((id) => units.get(id)?.type).filter(Boolean).map((n) => `${n}; `).join('');
      log(`${op.def.name}, ,${k}, ${t.ready ? 'Ready' : 'Not Ready'}, ${names}`);
    });
  }
  if (best) startOperation(ai, view, best.def, best.enemy, best.target, best.rally, env.turn, log);
  // the trees, in slot order
  for (const op of opsOf(ai)) {
    tick(op.run, OP_NODES, context(ai, env, op, log));
    if (op.run.done) {
      log(`${op.def.name}, Operation complete`);
      endOperation(ai, op);
    }
  }
  return { lines, evals, cityValues };
}

function context(ai: OpsAi, env: OpsTurnEnv, op: Operation, log: (l: string) => void): OpsContext {
  return {
    seat: ai.seat,
    turn: env.turn,
    view: env.view,
    act: env.act,
    op,
    assigned: () => assigned(ai),
    others: () => opsOf(ai),
    contracts: ai.contracts,
    newContract: (unitType) => {
      const c: Contract = { id: ai.nextContract++, unitType, state: 'submitted', turnsLeft: -1, op: op.id,
        before: env.view().units(ai.seat).filter((u) => u.type === unitType).map((u) => u.id) };
      ai.contracts.set(c.id, c);
      updateContracts(ai, env.view());
      return c;
    },
    diplomacy: ai.diplomacy,
    requestDiplomacy: (action, enemy, value) => {
      const id = ai.diplomacy.size;
      ai.diplomacy.set(id, { id, action, enemy, value, turn: env.turn, op: op.id });
      return id;
    },
    log,
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
    for (const [k, v] of op.run.blackboard) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'number')) op.run.blackboard.set(k, ids(v as number[]));
    }
  }
  for (const c of ai.contracts.values()) c.before = ids(c.before);
  // a record of a unit the map no longer names keeps a negative key of its
  // own
  const records = [...ai.army.values()];
  let orphan = Math.min(0, ...records.map((r) => r.id)) - 1;
  ai.army.clear();
  for (const r of records) {
    const id = r.id < 0 ? r.id : map(r.id) ?? orphan--;
    ai.army.set(id, { ...r, id });
  }
}
