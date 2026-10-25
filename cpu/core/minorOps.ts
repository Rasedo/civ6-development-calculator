/**
 * THE CITY-STATES' OPERATIONS IN THE ENGINE'S MINOR TURN, on the one
 * operation manager (cpu/core/operations; the reading is
 * tools/civ6lab/dll_readings.md "C-97: the operations" and "C-96: the
 * city-states' operations"). A minor's manager state is `CityState.ops`;
 * its knowledge base is its own (`armyKnown`, `campsKnown`); its contracts
 * are its city AI's (`cityAi`, the one contract book of the player), the
 * operations' trees taking their ids from the city AI's tree serial. Its
 * turn, as the game's Control Manager runs a player's lists:
 *
 *  - B: the military AI's turn (`minorOpsEvaluate`, from `minorMilitaryTurn`,
 *    before the turn's knowledge base look);
 *  - A: the city's defence event starts City Defense (`minorOpsStart`);
 *  - C: the operations' run in its tactical pass, after each unit's
 *    planning (`cityStateMilitary`): the operations' units are theirs, the
 *    tactical moves take the rest.
 *
 * A minor runs the definitions both twins carry the trees of: Attack Barb
 * Camp (its own start), Barb Camp Tech Boost (never started: its trigger is
 * unported), Civilian Builder Capture (a candidate only: it starts itself
 * not), City Defense (the defence event), Naval Superiority (its own start,
 * off a coastal city) — the Default_List's order.
 */
import type { ArmyRecord, CityState, GameState, Unit } from './types';
import { UNITS } from '../data/units';
import { gameTypeOf } from '../data/aliases';
import { aiView } from './aiView';
import { cityStateTactics, moveTo, passFinish, plotDistance, type Pass } from './tactical';
import { ownAiType, passOrders, passView } from './opsOrders';
import { newOpsAi, operationsEvaluate, operationsRun, opContracts, opsOf, startOperationNamed, type OpsAi, type OpsEnv } from './operations/manager';
import { ARMY_READ_AGE, lookCamps, type KnownUnit } from './operations/knowledge';
import { NO_PLOT, opDef, opUnits } from './operations/operation';
import { seatUnitRows } from './operations/unitRows';
import { newCityAi } from './aiCityTrees';
import { installType, minorCanUpgrade, minorSetItem, minorUpgradeUnit, minorUpgradeVisible } from './minorBuild';
import { minorContractCity, minorSecondHook } from './minorCityAi';
import { campTiles, tileSeat } from './seats';
import { disbandUnit } from './units';
import { goldAffordable } from './game';
import { FX } from './aiValue';
import { newEconomicMemory, upgradePurchase } from './aiEconomic';
import { minorCity } from './cityStates';
import { isCoastalLand } from '../../world/query';
import { MINOR_UPGRADE_GOLD } from '../data/cityStates';
import { AI_MINOR_TRIGGERS, AI_TRIGGERED_TREES } from '../data/aiOperations';
import { cityStateSight } from './fog';
import type { ContractCity } from './aiContracts';
import type { UnitProductionRow } from './aiUnitProduction';
import type { AiUnitView, AiView } from './aiViewTypes';

/** the definitions a city-state runs */
export const MINOR_OP_DEFS: readonly string[] = ['Attack Barb Camp', 'Barb Camp Tech Boost', 'Civilian Builder Capture', 'City Defense',
  'Naval Superiority'];

/** the replay's view of each minor's operation lines and candidate lines
 *  (null off) */
let tracer: ((seat: number, line: string, candidate: boolean) => void) | null = null;
export function traceMinorOps(fn: ((seat: number, line: string, candidate: boolean) => void) | null): void {
  tracer = fn;
}

/** the minor's view: its units in its pool's order; in its tactical pass,
 *  the pass's target list, planning reaches, spots and blows (`passView`) */
function minorView(state: GameState, cs: CityState, pass: Pass | null): AiView {
  const base = aiView(state);
  const own = (): AiUnitView[] => {
    const ids = state.units.filter((u) => u.seat === cs.seat).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((u) => u.id);
    const byId = new Map(base.units(cs.seat).map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  };
  const v: AiView = { ...base, units: (i) => (i === cs.seat ? own() : base.units(i)) };
  return pass ? passView(state, cs.seat, pass, v) : v;
}

/** a seat's knowledge base's records of a player's units, as the
 *  operations read them */
function knownOf(records: readonly ArmyRecord[] | undefined, player: number): KnownUnit[] {
  return (records ?? []).filter((r) => r.owner === player).map((r) => {
    const d = UNITS[r.type];
    return { id: r.id, owner: r.owner, type: gameTypeOf('unit', r.type, 'UNIT_'), plot: r.plot, combat: d?.combat ?? 0,
      ranged: d?.ranged?.strength ?? 0, damage: r.damage, seen: r.seen };
  });
}


/** a city-state's or the barbarians' records of a player's units the army
 *  strength reads: those aged at most ARMY_READ_AGE (their age the last
 *  ageing's turn less the turn last seen; records never aged are of age 0) */
export function recentOf(holder: { armyKnown?: ArmyRecord[]; armyAged?: number }, player: number): KnownUnit[] {
  const aged = holder.armyAged;
  return knownOf(aged === undefined ? holder.armyKnown : holder.armyKnown?.filter((r) => aged - r.seen <= ARMY_READ_AGE), player);
}

/** the knowledge base's camps (its look, `lookCamps`) on the plots the
 *  minor has revealed: the plots it sees join its revealed ones first */
export function minorCampsLook(state: GameState, cs: CityState): void {
  const sight = cityStateSight(state, cs.seat);
  const revealed = (cs.revealed ??= new Array<number>(state.map.tiles.length).fill(0));
  sight.forEach((v, p) => {
    if (v) revealed[p] = 1;
  });
  const camps = lookCamps(cs.campsKnown ?? [], (p) => revealed[p] === 1, campTiles(state));
  if (camps.length) cs.campsKnown = camps;
  else delete cs.campsKnown;
}

function minorEnv(state: GameState, cs: CityState, pass: Pass | null): OpsEnv {
  const ai = (cs.cityAi ??= newCityAi());
  let view: AiView | null = null;
  const fresh = () => (view ??= minorView(state, cs, pass));
  const changed = () => {
    view = null;
  };
  let rows: UnitProductionRow[] | null = null;
  let cities: ContractCity[] | null = null;
  return {
    turn: state.turn,
    view: fresh,
    defs: MINOR_OP_DEFS,
    // its own army as it stands, and the records its knowledge base keeps of
    // its units gone, read to their age: a Warrior lost still counts two
    // turns (runs/h1_duelw1121 Antioch: Attack Barb Camp invalid at t5 on
    // its two Warriors as they stand, valid at t9 alone, its Warrior lost
    // at t7 counted from its t6 record once the camp's Scout's record has
    // aged out, invalid again at t10)
    army: (p) => {
      if (p !== cs.seat) return recentOf(cs, p);
      const live = fresh().units(cs.seat);
      const ids = new Set(live.map((u) => u.id));
      return [...live.map((u) => ({ id: u.id, owner: cs.seat, type: u.type, plot: u.plot, combat: u.combat, ranged: u.ranged, damage: u.damage, seen: state.turn })),
        ...recentOf(cs, p).filter((r) => !ids.has(r.id))];
    },
    camps: () => cs.campsKnown ?? [],
    known: () => fresh().knownCities(cs.seat),
    threat: (plot) => (plot === cs.centerIndex ? cs.threat ?? -1 : -1),
    book: () => ai,
    newContractId: () => ai.nextContract++,
    contractCities: () => (cities ??= [minorContractCity(state, cs)]),
    clearProduction: () => {
      minorSetItem(state, cs, null);
      cities = null;
    },
    newOpId: () => ai.nextTree++,
    settle: null,
    unitRows: () => (rows ??= (() => {
      const by = new Map<string, number>();
      for (const r of cs.armyKnown ?? []) {
        const k = `${installType('unit', r.type, 'UNIT_')}|${r.owner}`;
        by.set(k, (by.get(k) ?? 0) + 1);
      }
      const v = fresh();
      return seatUnitRows(state, cs.seat, (u, p) => by.get(`${u}|${p}`) ?? 0, v.players(), (p) => v.atWar(cs.seat, p));
    })()),
    act: () => {
      throw new Error('a city-state\'s operations give their units move and attack orders alone');
    },
    ...(pass ? passOrders(state, cs.seat, pass, changed) : outsidePass),
    ownAiType: ownAiType(state, cs.seat, pass),
    log: (l) => tracer?.(cs.seat, l, false),
    logEval: (l) => tracer?.(cs.seat, l, true),
  };
}

const opsOfMinor = (cs: CityState): OpsAi => (cs.ops ??= newOpsAi(cs.seat));

/** the orders of a turn part outside the units' turn: none is given there */
const refuse = (): never => {
  throw new Error('a city-state\'s operations order their units in its units\' turn alone');
};
const outsidePass: Pick<OpsEnv, 'move' | 'strike' | 'attack' | 'moveUpdate' | 'moveExec'> = {
  move: refuse, strike: refuse, attack: refuse, moveUpdate: refuse, moveExec: refuse,
};

/** B: the minor's military AI's turn */
export function minorOpsEvaluate(state: GameState, cs: CityState): void {
  operationsEvaluate(opsOfMinor(cs), minorEnv(state, cs, null));
}

/** A: the defence event's start (0x7265b0): the operation's id */
export function minorOpsStart(state: GameState, cs: CityState, name: string, plot: number): number {
  return startOperationNamed(opsOfMinor(cs), minorEnv(state, cs, null), name, plot);
}

/** the operation of the id still runs */
export const minorOpLive = (cs: CityState, id: number): boolean => !!cs.ops && opsOf(cs.ops).some((o) => o.id === id);

/** the contracts the minor's running operations hold */
export const minorOpContracts = (cs: CityState): number[] => (cs.ops ? opContracts(cs.ops) : []);

/** a running operation of the minor against `player` whose target lies
 *  within `dist` of `plot` (0x723cf0, not asked ready: its enemy op +0x2a0
 *  the player itself — a camp's operation names none, so it holds back no
 *  threat: runs/h1_duelw1121 Hunza t13, its Attack Barb Camp's target 10:2
 *  three from the city, the barbarian Quadrireme at 11:2 starts City
 *  Defense, which takes the camp operation's Warriors) */
export function minorOpNear(state: GameState, cs: CityState, player: number, plot: number, dist: number): boolean {
  if (!cs.ops) return false;
  return opsOf(cs.ops).some((o) => o.enemy === player && o.target !== NO_PLOT && plotDistance(state, o.target, plot) <= dist);
}

/** the units the minor's running operations hold */
export const minorOpUnits = (cs: CityState): number[] => (cs.ops ? opsOf(cs.ops).flatMap(opUnits) : []);

/** the units in a job of the minor (unit +0x7d0): its running operations'
 *  and its "Upgrade Units" trees' */
export const minorJobUnits = (cs: CityState): number[] => [...minorOpUnits(cs), ...(cs.upgrading ?? [])];

/** the move a unit the "Upgrade Units" trees hold takes in the pass: the
 *  tree's, which logs no tactical row */
export const UPGRADE_MOVE = 'Upgrade Units';

/** the "Upgrade Units" trees' priority (TriggeredBehaviorTrees, both triggers) */
const UPGRADE_TREE_PRIORITY = AI_TRIGGERED_TREES.find((t) => t.tree === 'Upgrade Units' && AI_MINOR_TRIGGERS.includes(t.trigger))?.priority ?? 0;

/**
 * THE CITY-STATE'S "UPGRADE UNITS" TREES (MinorCivTriggeredTrees:
 * TRIGGER_TECH_UPGRADE / TRIGGER_CIVIC_UPGRADE, Priority 3, no operation;
 * `tools/civ6lab/dll_readings.md` "C-99: the upgrade trees"), their tick in
 * the operations' run. The trigger (0x800c60) starts a tree per technology
 * or civic gained; the trees' units are one list (`CityState.upgrading`, in
 * the player's unit order), a tree running while it holds a unit: Concurrent
 * over Find Available Unit, Find Unit Targets, Upgrade Units and Move Unit.
 *  - FIND AVAILABLE UNIT (0x7ec7b0, Upgradeable Units): the evaluator's offer
 *    (0x60a8c0) — the minor's units in no operation (a city tree's are its
 *    Builders, which have no upgrade), their turn not done, then
 *    those of its unlocked operations of a lower priority, which leave them —
 *    each whose upgrade its research unlocks (0x58fff0, the visible test)
 *    joining; none held, the tree FAILS and ends;
 *  - UPGRADE UNITS' EXECUTION (0x7ef850): each whose upgrade may go now
 *    (0x58fff0's full test, the treasury covering the price) the economic
 *    AI buys (0x68c940, `upgradePurchase`) upgrades — a new unit, out of the
 *    trees (runs/h1_duelw1121 city-state 3's Galley, taken from Naval
 *    Superiority at t89 as Cartography lands, the operation completing
 *    empty, home by t91, a Caravel from t92);
 *  - FIND UNIT TARGETS (0x7ed200, Nearest Owned City; its job 0x7eba40) and
 *    MOVE UNIT'S EXECUTION (0x7eeba0, no Location): each unit left goes for
 *    the minor's city centre, a ship for a coastal centre or else the city's
 *    Harbor; a unit with none, and every unit with none, the tree FAILS;
 *  - each unit the trees hold has its turn done (0x7d2190): no tactical
 *    move, no operation's offer (runs/h1_duelw1128 Hong Kong t144-250, its
 *    six units held from Gunpowder on with no Gold to upgrade: no tactical
 *    row, City Defense recruiting none and completing each turn).
 *  - THE DELETION (0x7ef850 with Can Delete, the node's data absent: true):
 *    a unit whose upgrade the treasury cannot buy (the full test failing, the
 *    visible one passing) is deleted on the minor's own ground where its
 *    upgrade asks no strategic resource (0x591000 -1); one whose upgrade may
 *    go but the economic AI does not buy, where its upgrade asks none or it
 *    holds at most one promotion beside more than 10 of its type; one no
 *    longer visible, released and deleted (runs/h1_duelu1128 Bologna at 0
 *    Gold: its eight Scouts, Skirmishers asking no resource, gone at t240;
 *    1128 Hong Kong's Warriors and Men-at-Arms, Iron and Niter asked, held).
 */
export function upgradeTreesTick(state: GameState, cs: CityState, pass: Pass): void {
  const own = (id: number) => state.units.find((u) => u.id === id && u.seat === cs.seat);
  const trig = !!cs.upgradeTrigger;
  delete cs.upgradeTrigger;
  if (!cs.upgrading && !trig) return;
  const held = new Set((cs.upgrading ?? []).filter((id) => own(id)));
  const order = (ids: Iterable<number>) => [...ids].map(own).filter((u): u is Unit => !!u).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  // Find Available Unit: the free units, then the lower-priority operations'
  const busy = new Set(minorOpUnits(cs));
  for (const u of order(state.units.filter((x) => x.seat === cs.seat).map((x) => x.id))) {
    if (held.has(u.id) || busy.has(u.id) || pass.done.has(u.id)) continue;
    if (minorUpgradeVisible(cs, u)) held.add(u.id);
  }
  const ops = cs.ops ? opsOf(cs.ops) : [];
  for (const op of ops) {
    if (op.locked || opDef(op).priority >= UPGRADE_TREE_PRIORITY) continue;
    for (const t of op.teams) {
      for (const id of t.members) {
        const u = own(id);
        if (u && !pass.done.has(id) && minorUpgradeVisible(cs, u)) held.add(id);
      }
      t.members = t.members.filter((id) => !held.has(id));
    }
  }
  if (!held.size) {
    delete cs.upgrading;
    return;
  }
  // Find Unit Targets: none of the units with a target, the tree FAILS
  const targets = new Map(order(held).map((u) => [u.id, upgradeTarget(state, cs, u)] as const));
  if (![...targets.values()].some((p) => p >= 0)) {
    delete cs.upgrading;
    return;
  }
  // Upgrade Units' execution (Can Delete: the node holds no data, true),
  // then Move Unit's
  const eco = (cs.economy ??= newEconomicMemory());
  const drop = (u: Unit): void => {
    held.delete(u.id);
    disbandUnit(state, u.id);
  };
  for (const u of order(held)) {
    if (upgradeMayGo(state, cs, u)) {
      if (upgradePurchase(eco, MINOR_UPGRADE_GOLD * FX)) {
        if (minorUpgradeUnit(state, cs, u)) held.delete(u.id);
        continue;
      }
      if (upgradeUnasked(u) || (promotionCount(u) <= 1 && state.units.filter((x) => x.seat === cs.seat && x.type === u.type).length > 10)) drop(u);
      continue;
    }
    if (unupgradedDeleted(state, cs, u)) drop(u);
  }
  for (const u of order(held)) {
    const p = targets.get(u.id) ?? -1;
    if (p >= 0 && u.tileIndex !== p && u.movesLeft > 0) moveTo(state, u, p, false);
  }
  for (const u of order(held)) passFinish(pass, u, UPGRADE_MOVE, u.tileIndex);
  cs.upgrading = order(held).map((u) => u.id);
}

/** Upgrade Units' full test (0x58fff0 with r8 0): the research, the minor's
 *  ground, Movement left and the treasury covering the price */
export function upgradeMayGo(state: GameState, cs: CityState, u: Unit): boolean {
  return minorCanUpgrade(state, cs, u) && goldAffordable(cs.treasury, MINOR_UPGRADE_GOLD);
}

/** the unit's upgrade asks no strategic resource (0x591000 -1) */
const upgradeUnasked = (u: Unit): boolean => !UNITS[UNITS[u.type]?.upgradesTo ?? '']?.requiresResource;

/** Upgrade Units with Can Delete on a held unit whose full test fails: one
 *  no longer visible (0x58fff0 with r8 1) deleted, a visible one deleted on
 *  the minor's own ground where its upgrade asks no strategic resource */
export function unupgradedDeleted(state: GameState, cs: CityState, u: Unit): boolean {
  if (!minorUpgradeVisible(cs, u)) return true;
  return tileSeat(state.map.tiles[u.tileIndex]) === cs.seat && upgradeUnasked(u);
}

/** the promotions a unit holds (its `promos` bits) */
function promotionCount(u: Unit): number {
  let n = 0;
  for (let b = u.promos ?? 0; b; b &= b - 1) n += 1;
  return n;
}

/** Find Unit Targets' plot for a unit (the job 0x7eba40, a city-state's one
 *  city): its centre; a ship's the centre where coastal, else its Harbor's
 *  plot; -1 none */
function upgradeTarget(state: GameState, cs: CityState, u: Unit): number {
  if (cs.centerIndex < 0) return -1;
  if (!UNITS[u.type]?.naval) return cs.centerIndex;
  if (isCoastalLand(state.map, state.map.tiles[cs.centerIndex])) return cs.centerIndex;
  return minorCity(cs).districts.find((d) => d.type === 'HARBOR')?.tileIndex ?? -1;
}

/** THE REPLAY'S HOLD AROUND A CITY'S SECOND HOOK (`holdSecondHook`): the
 *  copy of the replay's units' turn stands on record t+1's ground, its city
 *  trees' orders on the ground the city's turn found. Null outside a replay. */
let hookHeld: ((state: GameState, cs: CityState, run: () => void) => void) | null = null;
export function holdSecondHook(fn: typeof hookHeld): void {
  hookHeld = fn;
}

/**
 * C: A CITY-STATE'S UNITS' TURN — its tactical pass (`cityStateTactics`),
 * its operations run once the pass has its units' planning: each operation
 * unit's turn is its operation's; its city's second hook
 * (`minorSecondHook`) in its pass among the trees.
 */
export function cityStateMilitary(state: GameState, cs: CityState): void {
  cityStateTactics(state, cs, (pass) => {
    const ops = opsOfMinor(cs);
    const env = minorEnv(state, cs, pass);
    operationsRun(ops, { ...env, trees: [{ priority: UPGRADE_TREE_PRIORITY, tick: () => upgradeTreesTick(state, cs, pass) }],
      cityHook: () => (hookHeld ?? ((_st, _cs, run) => run()))(state, cs, () => minorSecondHook(state, cs)), held: () => cs.upgrading ?? [] });
    for (const id of opsOf(ops).flatMap(opUnits)) {
      const u = state.units.find((x) => x.id === id && x.seat === cs.seat);
      if (u) passFinish(pass, u, 'Operation', u.tileIndex);
    }
  });
}

/** a minor's unit as the operations see it (the team's join) */
export const minorUnitView = (u: Unit): Pick<AiUnitView, 'id' | 'type'> => ({ id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_') });
