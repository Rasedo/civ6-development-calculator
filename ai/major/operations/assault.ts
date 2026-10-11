/**
 * THE CITY ASSAULT'S NODES AND THE OPERATIONS' ATTACKS (AI/BehaviorTree
 * OperationCityAttack.cpp, OperationSupport.cpp, OperationAttack.cpp, the
 * team update in Operation.cpp; the reading is tools/civ6lab/dll_readings.md
 * "C-97: the war operations").
 *
 * The Early and Siege City Assault trees ask whether the seat is at war with
 * the operation's enemy (Is At War), whether its units' blows this turn take
 * half the city's hit points left (Can Alpha City), and ask the diplomatic AI
 * to denounce or declare war on the enemy (Operation Diplomacy, a diplomatic
 * contract); their units attack the targets of the seat's tactical target
 * list the node picks through the tactical attack assignment, the
 * assignment's moves and blows leaving as the seat's unit action rows.
 */
import { BT_ERROR, BT_FAILURE, BT_RUNNING, BT_SUCCESS, dataBool, dataInt, dataTag, type BtHandler } from '../../../cpu/core/behaviorTree';
import { NO_PLOT, type OpTeam, type Operation } from './operation';
import { moveTo, opUnits, targetGone, unitsById, xy } from './operation';
import type { OpsContext } from './nodes';
import type { MajorAttackTargetView, MajorUnitView, MajorView } from '../view';


/** a datum's value where the node holds the datum, `absent` where not (the
 *  nodes read a missing datum so) */
const flag = (node: Parameters<BtHandler<OpsContext>['update']>[0], name: string, absent: boolean): boolean =>
  node.data[name] === undefined ? absent : dataBool(node, name) ?? absent;

// THE TEAM UPDATE (0x738f20, from 0x73f7d0): the members' centre, the march
// point and, with enemy targets in reach, the battle line

/** the tactical targets a team's members weigh (the unit targets CIVILIAN
 *  to HIGH, the enemy's districts) */
const WEIGHED = new Set(['CIVILIAN', 'LOW', 'MEDIUM', 'HIGH', 'COMBAT_DISTRICT', 'PASSIVE_DISTRICT']);

/** floor(y / 2), as the plots' offset rows turn into axial columns */
const half = (y: number): number => Math.floor(y / 2);

/** the plot at offset coordinates, -1 off the map */
function plotAt(view: MajorView, x: number, y: number): number {
  const plots = view.plots();
  const hit = plots.find((p) => p.x === x && p.y === y);
  return hit ? hit.index : NO_PLOT;
}

/** C's roundf: half away from zero */
const roundf = (v: number): number => Math.fround(Math.sign(v) * Math.round(Math.abs(v)));

/** a float cube position rounded to a plot (0x38070: each component
 *  rounded; where they no longer sum to 0, the one rounded furthest — by the
 *  sum's sign — rebuilt from the other two) */
function cubePlot(view: MajorView, q: number, y: number, z: number): number {
  const f = Math.fround;
  let rq = roundf(q);
  let ry = roundf(y);
  let rz = roundf(z);
  const s = f(f(ry + rq) + rz);
  if (s !== 0) {
    const [dq, dy, dz] = s > 0 ? [f(q - rq), f(y - ry), f(z - rz)] : [f(rq - q), f(ry - y), f(rz - z)];
    const low = Math.min(dq, dy);
    const m = low > dz ? dz : low;
    if (m === dq) rq = -f(rz + ry);
    else if (m === dy) ry = -f(rz + rq);
    else rz = -f(ry + rq);
  }
  const qi = Math.trunc(rq);
  const yi = Math.trunc(ry);
  return plotAt(view, qi + half(yi), yi);
}

/** the march point (0x7397d3..0x739b04): with the operation's enemy at peace
 *  with the seat, the first plot from the target back along the line to the
 *  rally (single-precision steps of one plot) whose owner lets the seat's
 *  units in — the seat's own, no one's, or one whose borders stand open to
 *  it; the rally where none is before it; with no enemy or at war, the
 *  target */
function marchPoint(view: MajorView, seat: number, op: Operation, t: OpTeam): number {
  const rally = t.goals[0];
  const target = t.goals[1];
  if (op.enemy < 0 || view.atWar(seat, op.enemy)) return target;
  if (rally < 0 || target < 0) return rally;
  const f = Math.fround;
  const P = view.plots();
  const qR = f(P[rally].x - half(P[rally].y));
  const yR = f(P[rally].y);
  const zR = f(f(-qR) - yR);
  let q = f(P[target].x - half(P[target].y));
  let y = f(P[target].y);
  let z = f(f(-q) - y);
  const n = Math.trunc(Math.max(Math.abs(f(q - qR)), Math.abs(f(y - yR)), Math.abs(f(f(y - yR) + f(q - qR)))));
  const dq = f(f(q - qR) / n);
  const dy = f(f(y - yR) / n);
  let plot = cubePlot(view, q, y, z);
  for (;;) {
    if (q === qR && y === yR && z === zR) return rally;
    if (plot < 0) return rally;
    if (!view.borderClosed(seat, plot)) return plot;
    q = f(q - dq);
    y = f(y - dy);
    z = f(f(-q) - y);
    plot = cubePlot(view, q, y, z);
  }
}

/** the team update's goals: the centre (slot 3), the march point (slot 5),
 *  and the battle line (slot 4) — halfway, in axial steps cut toward 0, from
 *  the centre to the average of the targets within twice a member's base
 *  Movement of it (the sums' unsigned quotients) — with the team engaged
 *  where it has such targets */
export function updateTeam(view: MajorView, seat: number, op: Operation, t: OpTeam, targets: readonly MajorAttackTargetView[]): void {
  const units = unitsById(view, seat);
  const P = view.plots();
  let n = 0;
  let sq = 0;
  let sy = 0;
  const near: number[] = [];
  for (const id of t.members) {
    const u = units.get(id);
    if (!u) continue;
    n++;
    sq += P[u.plot].x - half(P[u.plot].y);
    sy += P[u.plot].y;
    targets.forEach((g, k) => {
      if (!WEIGHED.has(g.type) || view.plotDistance(u.plot, g.plot) > 2 * u.baseMoves || near.includes(k)) return;
      near.push(k);
    });
  }
  t.engaged = false;
  if (n === 0) return;
  const cq = Math.trunc(sq / n);
  const cy = Math.trunc(sy / n);
  t.goals[3] = plotAt(view, cq + half(cy), cy);
  t.goals[5] = marchPoint(view, seat, op, t);
  if (!near.length) return;
  t.engaged = true;
  let tq = 0;
  let ty = 0;
  for (const k of near) {
    const p = P[targets[k].plot];
    tq += p.x - half(p.y);
    ty += p.y;
  }
  const aq = ((tq >>> 0) / near.length) >>> 0 | 0;
  const ay = ((ty >>> 0) / near.length) >>> 0 | 0;
  const bq = Math.trunc((aq + cq) / 2);
  const by = Math.trunc((ay + cy) / 2);
  t.goals[4] = plotAt(view, bq + half(by), by);
}

// IS AT WAR (0x7edde0)
const isAtWar: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    const view = ctx.view();
    const min = node.data['Minimum Number'] === undefined ? 1 : dataInt(node, 'Minimum Number') ?? 0;
    const barbarians = flag(node, 'Include Barbarian', false);
    const withTarget = flag(node, 'With Operation Target', false);
    // the DLL tests Skip For Minors' presence and reads With Operation
    // Target's value for it
    const skipMinors = node.data['Skip For Minors'] !== undefined && withTarget;
    if (skipMinors && !view.majors().includes(ctx.op.enemy)) return BT_SUCCESS;
    let n = 0;
    for (const p of view.players()) {
      if (p === ctx.seat) continue;
      if (p === view.barbarianSeat() && !barbarians) continue;
      if (!view.atWar(ctx.seat, p)) continue;
      if (withTarget && p !== ctx.op.enemy) continue;
      if (++n >= min) return BT_SUCCESS;
    }
    return BT_FAILURE;
  },
};

// CAN ALPHA CITY (0x812cc0): the blows the operation's units with Movement
// left would strike the target city from where their planning reaches it
// take at least half of its hit points left
const canAlphaCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const view = ctx.view();
    const { op } = ctx;
    if (targetGone(view, ctx.seat, op) || op.target === NO_PLOT) return BT_FAILURE;
    const hp = view.cityHitPoints(op.target);
    if (!hp) return BT_FAILURE;
    const units = unitsById(view, ctx.seat);
    let sum = 0;
    for (const t of op.teams) {
      for (const id of t.members) {
        const u = units.get(id);
        if (!u || u.movesLeft <= 0) continue;
        sum += view.cityBlow(id, op.target);
      }
    }
    return Math.fround(sum) >= Math.fround(Math.fround(hp.max - hp.damage) * 0.5) ? BT_SUCCESS : BT_FAILURE;
  },
};

// OPERATION DIPLOMACY (0x819db0 update, 0x8163f0 execution)
const operationDiplomacy: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    const view = ctx.view();
    const has = (k: string) => node.data[k] !== undefined;
    if (!has('Desires Denouncement') && !has('Had Denounced') && !has('Desires War') && !has('Is At War')) return BT_ERROR;
    const enemy = ctx.op.enemy;
    if (enemy < 0) return BT_ERROR;
    if (has('Had Denounced') && dataBool(node, 'Had Denounced') && !view.denounced(ctx.seat, enemy)) return BT_SUCCESS;
    if (has('Is At War') && dataBool(node, 'Is At War') && !view.atWar(ctx.seat, enemy)) return BT_FAILURE;
    if (!has('Contract')) return BT_SUCCESS;
    if (has('Desires Denouncement') && dataBool(node, 'Desires Denouncement')) return BT_SUCCESS;
    if (!has('Desires War') || !dataBool(node, 'Desires War')) return BT_SUCCESS;
    return view.atWar(ctx.seat, enemy) ? BT_SUCCESS : BT_RUNNING;
  },
  // the request to the diplomatic AI: a denouncement where the node desires
  // one and the seat has neither denounced the enemy nor gone to war with it;
  // a surprise war where it desires war and is not at war; one diplomatic
  // contract a tag holds
  execute(node, run, ctx) {
    const view = ctx.view();
    const enemy = ctx.op.enemy;
    let action: string | null = null;
    if (dataBool(node, 'Desires Denouncement')) {
      if (view.denounced(ctx.seat, enemy) || view.atWar(ctx.seat, enemy)) return;
      action = 'DIPLOACTION_DENOUNCE';
    }
    if (dataBool(node, 'Desires War')) {
      if (view.atWar(ctx.seat, enemy)) return;
      action = 'DIPLOACTION_DECLARE_SURPRISE_WAR';
    }
    if (!action) return;
    const tag = dataTag(node, 'Contract');
    const held = tag ? run.blackboard.get(tag) : undefined;
    if (typeof held === 'number' && ctx.diplomacy.has(held)) return;
    const value = Number(run.blackboard.get(dataTag(node, 'Present Value') ?? '') ?? 0) || 0;
    const id = ctx.requestDiplomacy(action, enemy, value);
    if (tag) run.blackboard.set(tag, id);
  },
};

// OPERATION ATTACK CITY (0x813250): SUCCESS once the target is gone; a target
// that is no city nor a district FAILS; RUNNING while the operation holds
// units, else FAILURE
const operationAttackCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const view = ctx.view();
    if (targetGone(view, ctx.seat, ctx.op)) return BT_SUCCESS;
    const p = view.plots()[ctx.op.target];
    if (!p.city && !p.district) return BT_FAILURE;
    return opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE;
  },
};

// OPERATION AIR ASSAULT (0x813140): SUCCESS once the target is gone, or
// while it is a city or a district; else FAILURE
const operationAirAssault: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const view = ctx.view();
    if (targetGone(view, ctx.seat, ctx.op)) return BT_SUCCESS;
    const p = view.plots()[ctx.op.target];
    return p.city || p.district ? BT_SUCCESS : BT_FAILURE;
  },
};

// OPERATION PILLAGE (0x8134a0): ERROR where its three data are all present
// and false; SUCCESS once the target is gone or while the operation holds
// units, else FAILURE
const operationPillage: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    if (!flag(node, 'Pillage Districts', true) && !flag(node, 'Pillage Improvements', true) && !flag(node, 'Get Goody Huts', true)) return BT_ERROR;
    if (targetGone(ctx.view(), ctx.seat, ctx.op)) return BT_SUCCESS;
    return opUnits(ctx.op).length > 0 ? BT_SUCCESS : BT_FAILURE;
  },
};

// OPERATION SIEGE CITY (0x8136a0): SUCCESS once the target is gone; ERROR
// with no enemy; SUCCESS while the operation holds units, else FAILURE
const operationSiegeCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    if (targetGone(ctx.view(), ctx.seat, ctx.op)) return BT_SUCCESS;
    if (ctx.op.enemy < 0) return BT_ERROR;
    return opUnits(ctx.op).length > 0 ? BT_SUCCESS : BT_FAILURE;
  },
};

// BUILD MILITARY IMPROVEMENT (0x7e9b10): ERROR with neither a defensive nor a
// specific improvement asked; else SUCCESS (the unit with build charges it
// picks builds in its execution)
const buildMilitaryImprovement: BtHandler<OpsContext> = {
  update(node) {
    const defensive = flag(node, 'Defensive Improvement', false);
    const specific = node.data['Specific Improvement']?.value ?? '';
    return defensive || specific !== '' ? BT_SUCCESS : BT_ERROR;
  },
};

// OPERATION ATTACK UNITS' EXECUTION (0x80ceb0)

/** the targets an Attack Units node picks for a team (0x80bd20, 0x80be90,
 *  0x80bb50, 0x80b830): Attack Nearby Units — another player's targets at war
 *  with the seat (with an enemy named, of the enemy's but its civilians) within
 *  the larger of 2 and a member's Movement left of it; else Attack Along
 *  March — another player's targets ahead of the battle line toward the
 *  target (the axial dot product above 0); else Attack Near Target — targets
 *  of players at war with the seat within 3 + their reach of the target;
 *  else all */
function pickTargets(node: Parameters<BtHandler<OpsContext>['update']>[0], view: MajorView, seat: number, op: Operation,
  t: OpTeam, members: readonly MajorUnitView[], targets: readonly MajorAttackTargetView[]): (k: number) => boolean {
  const P = view.plots();
  const axial = (p: number): [number, number, number] => {
    const q = P[p].x - half(P[p].y);
    return [q, P[p].y, -(q + P[p].y)];
  };
  if (flag(node, 'Attack Nearby Units', false)) {
    return (k) => {
      const g = targets[k];
      if (g.owner === seat) return false;
      if (!view.atWar(seat, g.owner) && op.enemy === -1) return false;
      if (op.enemy !== -1 && g.owner !== op.enemy && g.type !== 'CIVILIAN') return false;
      return members.some((u) => view.plotDistance(u.plot, g.plot) <= Math.max(2, u.movesLeft >> 8));
    };
  }
  if (flag(node, 'Attack Along March', false)) {
    const A = t.goals[1];
    const B = t.goals[4];
    return (k) => {
      const g = targets[k];
      if (g.owner === seat || A < 0 || B < 0) return false;
      const [aq, ay, az] = axial(A);
      const [bq, by, bz] = axial(B);
      const [gq, gy, gz] = axial(g.plot);
      return (gq - bq) * (aq - bq) + (gy - by) * (ay - by) + (gz - bz) * (az - bz) > 0;
    };
  }
  if (flag(node, 'Attack Near Target', false)) {
    const A = t.goals[1];
    return (k) => {
      const g = targets[k];
      return g.owner !== seat && view.atWar(seat, g.owner) && A >= 0 && view.plotDistance(g.plot, A) <= 3 + g.range;
    };
  }
  return () => true;
}

/** a unit's blow on a plot as the seat's action rows: beside it or at range
 *  the strike from where it stands; else the path's steps this turn, the
 *  last into the plot an attack */
function strike(ctx: OpsContext, id: number, plot: number): void {
  const view = ctx.view();
  const units = view.units(ctx.seat);
  const col = units.findIndex((u) => u.id === id);
  if (col < 0) return;
  const u = units[col];
  const direct = view.strikeColumn(id, plot);
  if (direct >= 0 && (u.ranged > 0 || view.plotDistance(u.plot, plot) === 1)) {
    const row = units.map(() => -1);
    row[col] = direct;
    ctx.act([row]);
    return;
  }
  const path = view.unitPath(id, plot);
  if (path.length === 0) return;
  const last = path[path.length - 2] ?? u.plot;
  if (last !== u.plot) moveTo(ctx, u, last);
  const v = ctx.view();
  const at = v.units(ctx.seat).find((x) => x.id === id);
  if (!at || at.movesLeft <= 0) return;
  const c = v.strikeColumn(id, plot);
  if (c < 0) return;
  const row = v.units(ctx.seat).map(() => -1);
  row[v.units(ctx.seat).findIndex((x) => x.id === id)] = c;
  ctx.act([row]);
}

/** per team: its members with Movement left and in no formation (a siege
 *  unit only against an enemy city), the targets the node picks logged, the
 *  attack assignment over them (`even` where unequal attacks are not allowed
 *  and one unit goes; `survive` always) logged and carried out in its order
 *  (0x771f80): every unit to its plot, then the siege units' blows, the
 *  ranged units' (unless their melee strength is the greater and the target
 *  beside them), then the rest moving onto their targets */
function attackUnitsExecute(node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  const view = ctx.view();
  const P = view.plots();
  const enemyCity = op.target >= 0 && P[op.target].city && P[op.target].owner !== ctx.seat;
  const allowUnequal = flag(node, 'Allow Unequal Attacks', false);
  for (const t of op.teams) {
    if (!t.engaged && t.strength <= 0) continue;
    const v = ctx.view();
    const units = unitsById(v, ctx.seat);
    const paired = new Set(op.formations.flat());
    const members = t.members.map((id) => units.get(id)).filter((u): u is MajorUnitView =>
      !!u && u.movesLeft > 0 && !paired.has(u.id) && (u.bombard <= 0 || enemyCity));
    const targets = v.attackTargets(ctx.seat);
    const keep = pickTargets(node, v, ctx.seat, op, t, members, targets);
    const picked = targets.map((_g, k) => k).filter(keep);
    picked.forEach((k, i) => {
      const g = targets[k];
      ctx.log(g.unitType
        ? `${op.def.name}, Op Attack Units Targets, Target ${i}, Owner ${g.owner}, ${g.unitType}, ${xy(v, g.plot)}`
        : `${op.def.name}, Op Attack Units Targets, Target ${i}, NULL TARGET`);
    });
    const set = new Set(picked);
    const out = v.attackAssignment(ctx.seat, members.map((u) => u.id), (k) => set.has(k), !allowUnequal && members.length === 1, true);
    for (const a of out) {
      const u = units.get(a.unit);
      if (!u) continue;
      ctx.log(`${op.def.name}, Operation Attack Units, ${u.type}, At ${xy(v, u.plot)}, Move ${xy(v, a.move)}, Attack ${xy(v, a.attack)}`);
    }
    const now = (id: number) => ctx.view().units(ctx.seat).find((x) => x.id === id);
    for (const a of out) {
      const u = now(a.unit);
      if (u && u.plot !== a.move) moveTo(ctx, u, a.move);
    }
    const done = new Set<number>();
    for (const a of out) {
      const u = now(a.unit);
      if (!u || u.bombard <= 0 || u.movesLeft <= 0) continue;
      if (a.attack >= 0) strike(ctx, a.unit, a.attack);
      done.add(a.unit);
    }
    for (const a of out) {
      const u = now(a.unit);
      if (!u || done.has(a.unit) || u.ranged <= 0 || u.movesLeft <= 0) continue;
      if (u.combat > u.ranged && ctx.view().unitReach(a.unit, 1).some((r) => r.plot === a.attack)) continue;
      if (a.attack >= 0) strike(ctx, a.unit, a.attack);
      done.add(a.unit);
    }
    for (const a of out) {
      const u = now(a.unit);
      if (!u || done.has(a.unit) || a.attack < 0 || u.movesLeft <= 0) continue;
      strike(ctx, a.unit, a.attack);
    }
  }
}

export const ASSAULT_NODES: Readonly<Record<string, BtHandler<OpsContext>>> = {
  'Is At War': isAtWar,
  'Can Alpha City': canAlphaCity,
  'Operation Diplomacy': operationDiplomacy,
  'Operation Attack City': operationAttackCity,
  'Operation Air Assault': operationAirAssault,
  'Operation Pillage': operationPillage,
  'Operation Siege City': operationSiegeCity,
  'Build Military Improvement': buildMilitaryImprovement,
};

export { attackUnitsExecute };
