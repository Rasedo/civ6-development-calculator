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
 * unported), City Defense (the defence event).
 */
import type { ArmyRecord, CityState, GameState, Unit } from './types';
import { UNITS } from '../data/units';
import { gameTypeOf } from '../data/aliases';
import { majorView } from './majorView';
import { cityStateTactics, passFinish, plotDistance, type Pass } from './tactical';
import { passOrders, passView } from './opsOrders';
import { newOpsAi, operationsEvaluate, operationsRun, opContracts, opsOf, startOperationNamed, type OpsAi, type OpsEnv } from './operations/manager';
import { lookCamps, type KnownUnit } from './operations/knowledge';
import { NO_PLOT, opDef, opUnits } from './operations/operation';
import { seatUnitRows } from './operations/unitRows';
import { newCityAi } from './aiCityTrees';
import { installType, minorSetItem } from './minorBuild';
import { minorContractCity } from './minorCityAi';
import { BARB_SEAT, campTiles } from './seats';
import { cityStateSight } from './fog';
import type { ContractCity } from './aiContracts';
import type { UnitProductionRow } from './aiUnitProduction';
import type { MajorUnitView, MajorView } from '../../ai/major/view';

/** the definitions a city-state runs */
export const MINOR_OP_DEFS: readonly string[] = ['Attack Barb Camp', 'Barb Camp Tech Boost', 'City Defense'];

/** the replay's view of each minor's operation lines and candidate lines
 *  (null off) */
let tracer: ((seat: number, line: string, candidate: boolean) => void) | null = null;
export function traceMinorOps(fn: ((seat: number, line: string, candidate: boolean) => void) | null): void {
  tracer = fn;
}

/** the minor's view: its units in its pool's order; in its tactical pass,
 *  the pass's target list, planning reaches, spots and blows (`passView`) */
function minorView(state: GameState, cs: CityState, pass: Pass | null): MajorView {
  const base = majorView(state);
  const own = (): MajorUnitView[] => {
    const ids = state.units.filter((u) => u.seat === cs.seat).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((u) => u.id);
    const byId = new Map(base.units(cs.seat).map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  };
  const v: MajorView = { ...base, units: (i) => (i === cs.seat ? own() : base.units(i)) };
  return pass ? passView(state, cs.seat, pass, v) : v;
}

/** a seat's knowledge base's records of a player's units, as the
 *  operations read them */
export function knownOf(records: readonly ArmyRecord[] | undefined, player: number): KnownUnit[] {
  return (records ?? []).filter((r) => r.owner === player).map((r) => {
    const d = UNITS[r.type];
    return { id: r.id, owner: r.owner, type: gameTypeOf('unit', r.type, 'UNIT_'), plot: r.plot, combat: d?.combat ?? 0,
      ranged: d?.ranged?.strength ?? 0, damage: r.damage, seen: r.seen };
  });
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
  let view: MajorView | null = null;
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
    army: (p) => knownOf(cs.armyKnown, p),
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
 *  the player) — a camp's operation against the barbarians, whose city
 *  threat the game holds back while it runs (runs/h1_duelw1117-1128: of the
 *  28 Attack Barb Camp completions 10 the turn City Defense starts) */
export function minorOpNear(state: GameState, cs: CityState, player: number, plot: number, dist: number): boolean {
  if (!cs.ops) return false;
  return opsOf(cs.ops).some((o) => (o.enemy === player || (player === BARB_SEAT && opDef(o).targetType === 'TARGET_BARBARIAN_CAMP'))
    && o.target !== NO_PLOT && plotDistance(state, o.target, plot) <= dist);
}

/** the units the minor's running operations hold */
export const minorOpUnits = (cs: CityState): number[] => (cs.ops ? opsOf(cs.ops).flatMap(opUnits) : []);

/**
 * C: A CITY-STATE'S UNITS' TURN — its tactical pass (`cityStateTactics`),
 * its operations run once the pass has its units' planning: each operation
 * unit's turn is its operation's.
 */
export function cityStateMilitary(state: GameState, cs: CityState): void {
  cityStateTactics(state, cs, (pass) => {
    const ops = opsOfMinor(cs);
    operationsRun(ops, minorEnv(state, cs, pass));
    for (const id of opsOf(ops).flatMap(opUnits)) {
      const u = state.units.find((x) => x.id === id && x.seat === cs.seat);
      if (u) passFinish(pass, u, 'Operation', u.tileIndex);
    }
  });
}

/** a minor's unit as the operations see it (the team's join) */
export const minorUnitView = (u: Unit): Pick<MajorUnitView, 'id' | 'type'> => ({ id: u.id, type: gameTypeOf('unit', u.type, 'UNIT_') });
