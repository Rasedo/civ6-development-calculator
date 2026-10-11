/**
 * THE OPERATION MANAGER (AI/MilitaryAI 0x722690 -> 0x727510, Operation.cpp;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the operations"), the
 * one manager of every party that runs operations: the majors and the
 * city-states (their limits by their leader trait); a party that settles
 * hands it its settling AI (OpsSettle).
 *
 * Each turn of the seat: for a seat that settles, the settle evaluation's
 * AI_EVENT_DESIRE_SETTLE starts the "Settle New City" operation
 * (TriggeredBehaviorTrees TRIGGER_SETTLE_SPOT, through 0x800c60 -> 0x7265b0)
 * where the seat runs none;
 * the military AI's turn builds the candidates and evaluates them
 * (evaluate.ts) on the knowledge base's city records of the turn before;
 * the manager logs the valid ones' values and, the records refreshed, the
 * CITY VALUES; each city's threat and its City Defense (cityDefense); a
 * running operation's candidate names its backup (0x73e610); each
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
import { AI_LEADER_OP_LISTS, AI_OP_DEFS, AI_OP_LIMIT_LISTS, AI_OP_LISTS, AI_TREES } from '../../data/aiOperations';
import { compileTree, newRun, tick, type BtNode } from '../behaviorTree';
import { NO_PLOT, addMember, newTeams, opUnits, xy, type Operation } from './operation';
import { OP_NODES, refreshStrengths, switchToBackup, type DiplomacyRequest, type OpsContext } from './nodes';
import { CP_ACCEPTED, CP_FAILED, CP_IN_PROGRESS, contractBuilt, contractEvaluate, newContractBook, queueContract, reapContracts, type ContractBook,
  type ContractItem, type ContractNodeWorld } from '../aiContracts';
import { evaluate, type ArmyUnit, type Candidate } from './evaluate';
import { knownArmy, lookArmy, type ArmyRecords } from './knowledge';
import { cityValue } from './cityValue';
import { cityThreat } from './cityThreat';
import type { AiOpDef, OpsSettle } from './types';
import type { MajorKnownCityView, MajorView } from '../../../ai/major/view';

export interface OpsAi {
  seat: number;
  /** the pool's slots, null where free */
  slots: (Operation | null)[];
  /** the freed slots, the last freed on top */
  free: number[];
  nextOp: number;
  /** the seat's contracts (aiContracts.ts), its operations' trees' */
  book: ContractBook;
  nextContract: number;

  /** the players the seat prepares for war with (m_prepareForWarWith, set
   *  by PrepareForWarWith 0x724f30): their WAR definitions are candidates
   *  short of war */
  prepareForWar: Set<number>;
  /** the diplomatic requests its operations made (Operation Diplomacy), by
   *  id; none of them is taken up here */
  diplomacy: Map<number, DiplomacyRequest>;
  /** the knowledge base's city records as the turn before left them (the
   *  records refresh after the military AI's evaluation), null before the
   *  first */
  known: readonly MajorKnownCityView[] | null;
  /** the knowledge base's army records */
  army: ArmyRecords;
  /** each city's threat (CityBuildAI +0x1b8, -1 none) and its defence
   *  slot's operation (CityEvents slot 5, -1 none), by the city's plot */
  threat: Map<number, number>;
  defense: Map<number, number>;
}

export interface OpsTurnEnv {
  turn: number;
  /** the view as the actions so far left the game */
  view(): MajorView;
  /** carry out the seat's unit action rows now */
  act(rows: number[][]): void;
  /** the units the seat's cities trained as its turn began: the city, the
   *  unit and its UnitType */
  built: readonly { city: number; unit: number; type: string }[];
  /** what a city of the seat produces once its turn's choice is made (the
   *  Default Specialization runs before the trees tick), null for nothing */
  producing(city: number): ContractItem | null;
  /** the seat's settling AI, none for a party that never settles */
  settle: OpsSettle | null;
}

/** a turn's AI_Operation.csv lines and AI_Operation_Eval.csv lines, each
 *  without its turn and player, and the "CITY VALUES" its evaluation lines
 *  close with: per city the seat knows of another player, its value (24.8) */
export interface OpsTurnLog {
  lines: string[];
  evals: string[];
  cityValues: { plot: number; value: number }[];
}

export const newOpsAi = (seat: number): OpsAi => ({ seat, slots: [], free: [], nextOp: 0, book: newContractBook(), nextContract: 0,
  prepareForWar: new Set(), diplomacy: new Map(), known: null, army: new Map() , threat: new Map(), defense: new Map() });

/** PrepareForWarWith (0x724f30): the seat prepares for war with the player,
 *  or no longer */
export function prepareForWarWith(ai: OpsAi, player: number, on: boolean): void {
  if (on) ai.prepareForWar.add(player);
  else ai.prepareForWar.delete(player);
}

/** THE WAR DECLARATIONS' NOT-READY HOOK (0x6742d0): the seat prepares for
 *  war with `player` where the majors it fights or prepares for war with
 *  number at most half the living majors, and `player` is neither its
 *  declared friend nor its ally */
export function notReadyHook(ai: OpsAi, view: MajorView, player: number): void {
  const majors = view.majors();
  const n = majors.filter((q) => q !== ai.seat && (view.atWar(ai.seat, q) || ai.prepareForWar.has(q))).length;
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
function startOperation(ai: OpsAi, view: MajorView, def: AiOpDef, enemy: number, target: number, rally: number, turn: number,
  log: (l: string) => void): Operation {
  const op: Operation = {
    id: ai.nextOp++, def, enemy, target, rally, backup: null, teams: newTeams(def, view, target),
    run: newRun(def.tree ?? '', treeOf(def.tree ?? '')), started: turn, enemyStrength: 0, strength: 0,
    triggerUnits: [], triggerValue: 0, locked: false, allowUnitConstruction: false, contracts: [], formations: [],
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

/** THE CITIES' UPDATE (0x5ce680) as the operations read it: each city's
 *  threat (0x5cbd10, cityThreat); a threatened city whose defence slot holds
 *  no running operation starts City Defense at its plot (the defence event
 *  0x5cced0 through the manager's start by name 0x7265b0), the slot holding
 *  it */
function cityDefense(ai: OpsAi, view: MajorView, turn: number, log: (l: string) => void): void {
  const def = AI_OP_DEFS['City Defense'];
  for (const city of view.cityPlots(ai.seat)) {
    const threat = cityThreat(view, ai.seat, city, {
      army: (p) => knownArmy(ai.army, p),
      operationNear: (p, plot, dist) => opsOf(ai).some((o) => o.enemy === p && o.target !== NO_PLOT && view.plotDistance(o.target, plot) <= dist),
    });
    ai.threat.set(city, threat);
    const slot = ai.defense.get(city) ?? -1;
    if (slot !== -1 && opsOf(ai).some((o) => o.id === slot)) continue;
    ai.defense.set(city, -1);
    if (threat <= -1 || !def) continue;
    ai.defense.set(city, startOperation(ai, view, def, -1, city, city, turn, log).id);
  }
}

/** the seat's running operations of an OperationType */
const count = (ai: OpsAi, type: string | null): number => opsOf(ai).filter((o) => o.def.operationType === type).length;

/** the seat's units in any operation */
const assigned = (ai: OpsAi): Set<number> => new Set(opsOf(ai).flatMap(opUnits));

/** the contracts as the seat's cities stand (their production the
 *  caller's): those no live operation's tree holds leave the book; a city
 *  producing an accepted contract's unit queues it (vt +0x38); a unit a city
 *  trained completes its queued contract (the completion signal 0x5f5650),
 *  the unit joining the operation whose tree made it (Release Unit When
 *  Built unset) */
function updateContracts(ai: OpsAi, view: MajorView, env: OpsTurnEnv): void {
  reapContracts(ai.book, new Set(opsOf(ai).flatMap((o) => o.contracts)));
  const cities = view.contractCities(ai.seat).map((x) => ({ ...x, current: env.producing(x.id) }));
  for (const c of ai.book.contracts) {
    if (!c.unit || c.progress !== CP_ACCEPTED) continue;
    const city = cities.find((x) => (c.city === -1 || x.id === c.city) && x.current?.unit === c.unit);
    if (city) queueContract(c, city, () => true, () => undefined);
  }
  for (const b of env.built) {
    contractBuilt(ai.book, b.city, { unit: b.type, building: null, district: null }, b.unit, (tree, id) => {
      const op = opsOf(ai).find((o) => o.id === tree);
      const unit = view.units(ai.seat).find((x) => x.id === id);
      if (op && op.teams.length && unit && !assigned(ai).has(id)) addMember(op.teams[0], unit);
    });
  }
  // the in-hand check (0x5d7e00): a queued contract's city values it, its
  // turns the city's; one its city no longer produces FAILS
  for (const c of ai.book.contracts) {
    const city = c.queued && c.progress === CP_IN_PROGRESS ? cities.find((x) => x.id === c.city) : undefined;
    if (city && !contractEvaluate(c, city)) c.progress = CP_FAILED;
  }
}

/** what the shared contract nodes read of an operation's tree: the seat's
 *  book, its cities (their production cleared by the caller, none here: the
 *  majors' production stands on the record), the tree's own contracts */
function contractWorld(ai: OpsAi, env: OpsTurnEnv, op: Operation): ContractNodeWorld {
  const view = env.view();
  return {
    book: ai.book,
    tree: { id: op.id, name: op.def.tree ?? op.def.name, get contracts() { return op.contracts; }, set contracts(v) { op.contracts = v; } },
    turn: env.turn, cities: view.contractCities(ai.seat), newContractId: () => ai.nextContract++,
    clearProduction: () => undefined, submitted: () => undefined,
    techHeld: (t) => view.techsHeld(ai.seat).has(t), civicHeld: (c) => view.civicsHeld(ai.seat).has(c), holds: () => false,
  };
}

/** One turn of the seat's operations. */
export function operationsTurn(ai: OpsAi, env: OpsTurnEnv): OpsTurnLog {
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
  updateContracts(ai, view, env);
  const allowed = allowedOps(view.leaderType(ai.seat));
  const staging = stagingPlots(view, ai.seat);
  const army = (p: number): readonly ArmyUnit[] => (p === ai.seat ? view.units(ai.seat) : knownArmy(ai.army, p));
  const blank = (def: AiOpDef, enemy: number): Candidate => ({ def, enemy, presetRally: NO_PLOT, presetStrength: null, op: null,
    valid: false, odds: 0, value: 0, target: NO_PLOT, rally: NO_PLOT });
  // the military AI's turn (0x7271d0 -> 0x722d70): the candidates — the
  // running operations', then per other player at war with the seat or
  // prepared for war with its WAR definitions, then each allowed definition
  // against no enemy — evaluated on the knowledge base's city records as the
  // turn before left them
  const cands: Candidate[] = [];
  for (const op of opsOf(ai)) cands.push({ ...blank(op.def, op.enemy), presetRally: op.target, presetStrength: op.strength, op });
  for (const p of view.players()) {
    if (p === ai.seat || !(view.atWar(ai.seat, p) || ai.prepareForWar.has(p))) continue;
    for (const def of allowed) if (def.enemyType === 'WAR') cands.push(blank(def, p));
  }
  for (const def of allowed) if (def.enemyType === 'NONE') cands.push(blank(def, -1));
  const inputs = { settle: env.settle, taken: new Set(opsOf(ai).map((o) => o.target)), known: ai.known ?? view.knownCities(ai.seat), army };
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
  // the knowledge base's city records refresh, and the CITY VALUES the
  // manager logs after the evaluation lines read them: each known city of
  // another player
  const known = (ai.known = view.knownCities(ai.seat));
  lookArmy(ai.army, view, ai.seat, env.turn);
  const cityValues = known.filter((k) => k.owner !== ai.seat).map((k) => ({ plot: k.plot, value: cityValue(view, ai.seat, k, known, army) }));
  cityDefense(ai, view, env.turn, log);
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
    contractWorld: () => contractWorld(ai, env, op),
    diplomacy: ai.diplomacy,
    requestDiplomacy: (action, enemy, value) => {
      const id = ai.diplomacy.size;
      ai.diplomacy.set(id, { id, action, enemy, value, turn: env.turn, op: op.id });
      return id;
    },
    settle: env.settle,
    threat: (plot) => ai.threat.get(plot) ?? -1,
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
