/**
 * THE FREE CITIES' RAID (FreeCities_Manager, GameCore_XP2 0x2765f0 -> 0x277470
 * -> 0x274ea0; `tools/civ6lab/dll_readings.md` "C-60: the Free Cities Raid")
 * on the one operation manager (cpu/core/operations). The Free Cities' manager
 * state is `freeSeat.ops`; `freeSeat.cityAi` holds the ids their operations'
 * trees take (they hold no contract: a Free City runs no city tree, and the
 * Free Cities Assault names no Contract ID); their knowledge base
 * `freeSeat.armyKnown` (`freeKnowledge`).
 *
 *  - THE START (`freeRaidSignal`): the manager's game-signal listeners —
 *    a combat on a Free City's district (0x276d90: the attacker), a Free
 *    City's district pillaged (0x276e70) or an improvement of its pillaged
 *    (0x276ff0: the owner of the last unit on the plot, the pillager) — find
 *    the Free City's record (its centre's plot, 0x277470) and, where it never
 *    raided (+0x20 and +0x24 at -1: a Free City raids ONCE in its life),
 *    start "Free Cities Raid" on that player: the target the player's first
 *    city's plot, the rally the Free City's centre (0x7265b0, 0x73e7d0), no
 *    enemy (op +0x2a0 unset: its Attack Units lists every player's units,
 *    runs/h1_duelw1123 t205-t212), the record the player and the
 *    operation's tree (+0x20, +0x24). A Free
 *    City's turn (0x274010) clears +0x24 once that tree is gone; +0x20 stays.
 *  - THE RUN: in the Free Cities' tactical pass, once each unit's planning is
 *    taken, the operations' trees tick (`operationsRun`) and their units'
 *    turns are theirs (`freeCitiesMilitary`). The Free Cities weigh no
 *    candidate (AI_Operation_Eval.csv holds no player 62 line while the Raid
 *    runs).
 *  - THE THREAT: a Free City's threat passes over a player the Free Cities
 *    run an operation against whose target lies within 5 of the undamaged
 *    city (`freeOpNear`, 0x723cf0) — the raid names none.
 */
import type { City, GameState, Unit } from './types';
import { majorView } from './majorView';
import { passOrders, passView, ownAiType } from './opsOrders';
import { recentOf } from './minorOps';
import { newOpsAi, operationsRun, opsOf, startOperationAt, type OpsAi, type OpsEnv } from './operations/manager';
import { NO_PLOT, opUnits } from './operations/operation';
import { seatUnitRows } from './operations/unitRows';
import { newCityAi, type CityAi } from './aiCityTrees';
import { FREE_SEAT, freeSeatOf, isCiv, seatOf } from './seats';
import { freeCityTactics, passFinish, passPillage, plotDistance, type Pass } from './tactical';
import { installType } from './minorBuild';
import type { MajorUnitView, MajorView } from '../../ai/major/view';

/** the definition the Free Cities run (Leaders.OperationList "Free Cities
 *  Operations") */
export const FREE_RAID_DEF = 'Free Cities Raid';

/** the replay's view of the Free Cities' operation lines (null off) */
let tracer: ((line: string) => void) | null = null;
export function traceFreeOps(fn: ((line: string) => void) | null): void {
  tracer = fn;
}

const opsOfFree = (state: GameState): OpsAi => (freeSeatOf(state).ops ??= newOpsAi(FREE_SEAT));

/** the Free Cities' city AI: the ids their operations' trees take */
const freeCitiesBook = (state: GameState): CityAi => (freeSeatOf(state).cityAi ??= newCityAi());

/** the Free Cities fight every full civ (0x469cd0; the military AI's floor
 *  counts each major at war, runs/h1_duelw1123 t200-t201) and no city-state */
export const freeFights = (i: number, j: number): boolean => (i === FREE_SEAT && isCiv(j)) || (j === FREE_SEAT && isCiv(i));

/** the Free Cities' view: their units in their pool's order, the full civs
 *  at war with them; in their tactical pass, the pass's target list,
 *  planning reaches, spots and blows (`passView`) */
function freeView(state: GameState, pass: Pass | null): MajorView {
  const base = majorView(state);
  const own = (): MajorUnitView[] => {
    const ids = state.units.filter((u) => u.seat === FREE_SEAT).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((u) => u.id);
    const byId = new Map(base.units(FREE_SEAT).map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  };
  const v: MajorView = { ...base, units: (i) => (i === FREE_SEAT ? own() : base.units(i)), atWar: (i, j) => freeFights(i, j) || base.atWar(i, j) };
  return pass ? passView(state, FREE_SEAT, pass, v) : v;
}

/** the orders of a turn part outside the Free Cities' pass: none is given */
const refuse = (): never => {
  throw new Error('the Free Cities\' operations order their units in their tactical pass alone');
};
const outsidePass: Pick<OpsEnv, 'move' | 'strike' | 'attack' | 'moveUpdate' | 'moveExec'> = {
  move: refuse, strike: refuse, attack: refuse, moveUpdate: refuse, moveExec: refuse,
};

/** the Free Cities' trees make no contract (no Contract ID tag) */
const noContract = (): never => {
  throw new Error('the Free Cities\' operations make no contract');
};

const unitOf = (state: GameState, id: number): Unit | undefined => state.units.find((u) => u.id === id && u.seat === FREE_SEAT);

function freeEnv(state: GameState, pass: Pass | null): OpsEnv {
  const free = freeSeatOf(state);
  const book = freeCitiesBook(state);
  let view: MajorView | null = null;
  const fresh = () => (view ??= freeView(state, pass));
  const changed = () => {
    view = null;
  };
  return {
    turn: state.turn,
    view: fresh,
    defs: [FREE_RAID_DEF],
    army: (p) => recentOf(free, p),
    camps: () => [],
    known: () => fresh().knownCities(FREE_SEAT),
    threat: (plot) => free.cities.find((c) => c.centerIndex === plot)?.aiThreat ?? -1,
    book: () => book,
    newContractId: noContract,
    contractCities: noContract,
    clearProduction: noContract,
    newOpId: () => book.nextTree++,
    settle: null,
    unitRows: () => {
      const by = new Map<string, number>();
      for (const r of free.armyKnown ?? []) {
        const k = `${installType('unit', r.type, 'UNIT_')}|${r.owner}`;
        by.set(k, (by.get(k) ?? 0) + 1);
      }
      const v = fresh();
      return seatUnitRows(state, FREE_SEAT, (u, p) => by.get(`${u}|${p}`) ?? 0, v.players(), (p) => v.atWar(FREE_SEAT, p));
    },
    // a unit action row of theirs: a pillage where the unit stands
    act: (rows) => {
      if (!pass) refuse();
      const v = fresh();
      const units = v.units(FREE_SEAT);
      const pillage = v.unitActionColumn('PILLAGE');
      for (const row of rows) {
        row.forEach((a, col) => {
          if (a < 0) return;
          if (a !== pillage) throw new Error(`the Free Cities' operations give no action ${a}`);
          const u = unitOf(state, units[col].id);
          if (u) passPillage(state, pass!, u);
        });
      }
      changed();
    },
    ...(pass ? passOrders(state, FREE_SEAT, pass, changed) : outsidePass),
    ownAiType: ownAiType(state, FREE_SEAT, pass),
    log: (l) => tracer?.(l),
    logEval: () => undefined,
  };
}

/**
 * 0x274ea0, A FREE CITY STARTS ITS RAID on `player`, where the city never
 * raided: the target the player's first city's plot (none with no city: no
 * start), the rally the Free City's centre, no enemy; the record the player
 * and the operation's id. Recorded: runs/h1_duelw1123 t205, Rome's Warrior pillaging
 * Chen's improvement — "Free Cities Raid, Started", TARGET 11:13, Rome's
 * capital, its recruit's "Contract for: UNIT_ARCHER".
 */
export function freeRaidStart(state: GameState, city: City, player: number): void {
  if (city.freeRaid) return;
  const target = seatOf(state, player)?.cities[0]?.centerIndex ?? -1;
  if (target < 0) return;
  const op = startOperationAt(opsOfFree(state), freeEnv(state, null), FREE_RAID_DEF, -1, target, city.centerIndex);
  city.freeRaid = { player, op: op.id };
}

/** a running operation of the Free Cities against `player` whose target
 *  lies within `dist` of `plot` (0x723cf0: its enemy op +0x2a0 the player;
 *  a Free City's threat skips that player while the city is whole) */
export function freeOpNear(state: GameState, player: number, plot: number, dist: number): boolean {
  const ops = state.freeSeat?.ops;
  if (!ops) return false;
  return opsOf(ops).some((o) => o.enemy === player && o.target !== NO_PLOT && plotDistance(state, o.target, plot) <= dist);
}

/** a game signal on a Free City's plot `plot` (its centre, a district of its
 *  or an improvement of its) by `player`'s unit: the Free City holding the
 *  plot starts its raid (0x277470) */
export function freeRaidSignal(state: GameState, plot: number, player: number): void {
  const free = state.freeSeat;
  if (!free || player < 0 || player === FREE_SEAT) return;
  const t = state.map.tiles[plot];
  const city = free.cities.find((c) => c.centerIndex === plot)
    ?? (t.ownerSeat === FREE_SEAT ? free.cities.find((c) => c.id === t.ownerCity) : undefined);
  if (city) freeRaidStart(state, city, player);
}

/** a Free City's turn (0x274010's head): its raid's tree gone, the record's
 *  tree is cleared, the player raided kept */
export function freeRaidCheck(state: GameState, city: City): void {
  const r = city.freeRaid;
  if (!r || r.op === -1) return;
  const ops = freeSeatOf(state).ops;
  if (!ops || !opsOf(ops).some((o) => o.id === r.op)) r.op = -1;
}

/** the operations' trees in the Free Cities' tactical pass, once each unit's
 *  planning is taken; the operations' units' turns are theirs */
export function freeCitiesMilitary(state: GameState): void {
  freeCityTactics(state, (pass) => {
    const ops = opsOfFree(state);
    operationsRun(ops, freeEnv(state, pass));
    for (const id of opsOf(ops).flatMap(opUnits)) {
      const u = unitOf(state, id);
      if (u) passFinish(pass, u, 'Operation', u.tileIndex);
    }
  });
}
