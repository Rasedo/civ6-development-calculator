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
import { BT_ERROR, BT_FAILURE, BT_RUNNING, BT_SUCCESS, dataBool, dataInt, dataTag, type BtHandler } from '../behaviorTree';
import { NO_PLOT, type OpTeam, type Operation } from './operation';
import { generalizedAssignment } from '../aiAssignment';
import { holdsUnits, moveTo, opUnits, targetGone, unitsById, xy } from './operation';
import type { OpsContext } from './nodes';
import type { AiAttackTargetView, AiUnitView, AiView } from '../aiViewTypes';


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
function plotAt(view: AiView, x: number, y: number): number {
  const plots = view.plots();
  const hit = plots.find((p) => p.x === x && p.y === y);
  return hit ? hit.index : NO_PLOT;
}

/** C's roundf: half away from zero */
const roundf = (v: number): number => Math.fround(Math.sign(v) * Math.round(Math.abs(v)));

/** a float cube position rounded to a plot (0x38070: each component
 *  rounded; where they no longer sum to 0, the one rounded furthest — by the
 *  sum's sign — rebuilt from the other two) */
function cubePlot(view: AiView, q: number, y: number, z: number): number {
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
function marchPoint(view: AiView, seat: number, op: Operation, t: OpTeam): number {
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
export function updateTeam(view: AiView, seat: number, op: Operation, t: OpTeam, targets: readonly AiAttackTargetView[]): void {
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
    if (targetGone(ctx, op) || op.target === NO_PLOT) return BT_FAILURE;
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

// IS CITY THREATENED (0x813050): the target gone (0x73a8e0), or the city on
// it threatened (CityBuildAI +0x1b8 above -1): SUCCESS; else FAILURE
const isCityThreatened: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const { op } = ctx;
    if (targetGone(ctx, op)) return BT_SUCCESS;
    return op.target !== NO_PLOT && ctx.threat(op.target) > -1 ? BT_SUCCESS : BT_FAILURE;
  },
};

// GARRISON CITY (0x8133c0 update, 0x810d30 execution): SUCCESS with the
// target gone, RUNNING while the operation holds units, else FAILURE
const garrisonCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    return opUnits(ctx.op).length > 0 ? BT_RUNNING : BT_FAILURE;
  },
  execute: garrisonExecute,
};

/** the garrison's pick (0x810d30) over the operation's units in the
 *  player's unit order (0x6092c0): the
 *  one on the city its garrison (its ranged strength, or its Bombard less 5
 *  where higher, and its Combat); of those whose planning reaches the city
 *  this turn (0x791300, 1 turn) the candidate — a RangedCombat above the
 *  best so far and the garrison's, else a Bombard less 5 above the best with
 *  the garrison holding no ranged strength, else (none chosen, the garrison
 *  no ranged strength, no ranged best) a Combat above the best and the
 *  garrison's. With no garrison of the operation's and no military unit of
 *  the seat on the city, the candidate moves in. With a garrison and a
 *  stronger candidate, the candidate moves beside the city (the swap
 *  command 0x972880 into it is unported). The garrison's turn ends, a
 *  military unit's of the seat on the city, the candidate's (0x570b40). The
 *  fortify commands are none in the action rows. */
function garrisonExecute(_node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const view = ctx.view();
  const { op } = ctx;
  const city = op.target;
  if (city === NO_PLOT) return;
  const units = unitsById(view, ctx.seat);
  let garrison: AiUnitView | null = null;
  let gRanged = 0;
  let gCombat = 0;
  let bestRanged = 0;
  let bestCombat = 0;
  let pick: AiUnitView | null = null;
  // the operation's units as the unit evaluator lists them by job
  // (0x6092c0): in the player's unit order, not the teams' (runs/h1_duelw1121
  // Hunza t13: of City Defense's Warriors, recruited 196610 first, the older
  // 131073 two plots off garrisons the city, not 196610 beside it)
  const held = new Set(opUnits(op));
  for (const v of view.units(ctx.seat)) {
    if (!held.has(v.id)) continue;
    const u = units.get(v.id);
    if (!u) continue;
    if (u.plot === city) {
      garrison = u;
      gCombat = u.combat;
      gRanged = Math.max(u.ranged, u.bombard - 5);
      continue;
    }
    if (!view.unitReach(u.id, 1).some((r) => r.plot === city)) continue;
    if (u.ranged > bestRanged && u.ranged > gRanged) {
      bestRanged = u.ranged;
      pick = u;
    } else if (u.bombard - 5 > bestRanged && gRanged === 0) {
      bestRanged = u.bombard - 5;
      pick = u;
    }
    if (u.combat > bestCombat && u.combat > gCombat) {
      bestCombat = u.combat;
      if (!pick && gRanged === 0 && bestRanged === 0) pick = u;
    }
  }
  // each unit the execution takes its turn ends (0x570b40, dl 1): the
  // garrison, a military unit of the seat on the city, the candidate it
  // moves (runs/h1_dueldA1117 Antananarivo t24: City Defense's Warrior on
  // 32:5 stands, Operation Move takes only the one on 29:3)
  if (!garrison) {
    const standing = view.units(ctx.seat).find((u) => u.plot === city && u.combat + u.ranged + u.bombard > 0);
    if (standing) {
      ctx.endTurn?.(standing.id);
      return;
    }
    if (pick) {
      moveTo(ctx, pick, city);
      ctx.endTurn?.(pick.id);
    }
    return;
  }
  ctx.endTurn?.(garrison.id);
  const stronger = gRanged < bestRanged || (gRanged <= 0 && gCombat < bestCombat);
  if (!stronger || !pick) return;
  const spot = view.planSpot(pick.id, city, 1, true, 1);
  if (spot >= 0 && spot !== pick.plot) moveTo(ctx, pick, spot);
  ctx.endTurn?.(pick.id);
}

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
  // desiring war, the operation's units may be built (AllowUnitConstruction)
  // and, not at war, a surprise war; one diplomatic contract a tag holds
  execute(node, run, ctx) {
    const view = ctx.view();
    const enemy = ctx.op.enemy;
    let action: string | null = null;
    if (dataBool(node, 'Desires Denouncement')) {
      if (view.denounced(ctx.seat, enemy) || view.atWar(ctx.seat, enemy)) return;
      action = 'DIPLOACTION_DENOUNCE';
    }
    if (dataBool(node, 'Desires War')) {
      ctx.op.allowUnitConstruction = true;
      if (view.atWar(ctx.seat, enemy)) return;
      action = 'DIPLOACTION_DECLARE_SURPRISE_WAR';
    }
    if (!action) return;
    const tag = dataTag(node, 'Contract');
    const held = tag ? run.blackboard.get(tag) : undefined;
    if (typeof held === 'number' && ctx.diplomacy.some((d) => d.id === held)) return;
    const value = Number(run.blackboard.get(dataTag(node, 'Present Value') ?? '') ?? 0) || 0;
    const id = ctx.requestDiplomacy(action, enemy, value);
    if (tag) run.blackboard.set(tag, id);
  },
};

// OPERATION ATTACK CITY (0x813250): SUCCESS once the target is gone; a target
// that is no city nor a district FAILS; RUNNING while the operation holds a
// living unit, else FAILURE
const operationAttackCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const view = ctx.view();
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    const p = view.plots()[ctx.op.target];
    if (!p.city && !p.district) return BT_FAILURE;
    return holdsUnits(ctx, ctx.op) ? BT_RUNNING : BT_FAILURE;
  },
};

// OPERATION AIR ASSAULT (0x813140): SUCCESS once the target is gone, or
// while it is a city or a district; else FAILURE
const operationAirAssault: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    const view = ctx.view();
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    const p = view.plots()[ctx.op.target];
    return p.city || p.district ? BT_SUCCESS : BT_FAILURE;
  },
};

// OPERATION PILLAGE (0x8134a0): ERROR where its three data are all present
// and false; SUCCESS once the target is gone or while the operation holds a
// living unit, else FAILURE
const operationPillage: BtHandler<OpsContext> = {
  update(node, _run, ctx) {
    if (!flag(node, 'Pillage Districts', true) && !flag(node, 'Pillage Improvements', true) && !flag(node, 'Get Goody Huts', true)) return BT_ERROR;
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    return holdsUnits(ctx, ctx.op) ? BT_SUCCESS : BT_FAILURE;
  },
};

// OPERATION SIEGE CITY (0x8136a0): SUCCESS once the target is gone; ERROR
// with no enemy; SUCCESS while the operation holds a living unit, else FAILURE
const operationSiegeCity: BtHandler<OpsContext> = {
  update(_node, _run, ctx) {
    if (targetGone(ctx, ctx.op)) return BT_SUCCESS;
    if (ctx.op.enemy < 0) return BT_ERROR;
    return holdsUnits(ctx, ctx.op) ? BT_SUCCESS : BT_FAILURE;
  },
};

// BUILD MILITARY IMPROVEMENT (0x7e9b10 update, 0x7e9120 execution): ERROR
// with neither a defensive nor a specific improvement asked; else the
// improvements — the defensive ones (CanBuildOutsideTerritory with a
// DefenseModifier) in database order, then the one named — and of the
// operation's units with build charges left, the first that builds the first
// improvement it can is held for the execution, which has it build there;
// SUCCESS
const buildMilitaryImprovement: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.unit = -1;
    m.improvement = null;
    const defensive = flag(node, 'Defensive Improvement', false);
    const specific = node.data['Specific Improvement']?.value ?? '';
    if (!defensive && specific === '') return BT_ERROR;
    const view = ctx.view();
    const list = [...(defensive ? view.defensiveImprovements() : []), ...(specific ? [specific] : [])];
    const units = opUnits(ctx.op).filter((id) => view.buildCharges(id) > 0);
    for (const imp of list) {
      const id = units.find((u) => view.unitBuildsImprovement(ctx.seat, u, imp));
      if (id === undefined) continue;
      m.unit = id;
      m.improvement = imp;
      break;
    }
    return BT_SUCCESS;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    const view = ctx.view();
    const units = view.units(ctx.seat);
    const col = units.findIndex((u) => u.id === m.unit);
    if (col < 0 || typeof m.improvement !== 'string') return;
    const action = view.unitActionColumn(`BUILD_${m.improvement.replace(/^IMPROVEMENT_/, '')}`);
    if (action < 0) return;
    const row = units.map(() => -1);
    row[col] = action;
    ctx.act([row]);
  },
};

// OPERATION ATTACK UNITS' EXECUTION (0x80ceb0)

/** the unit targets of the list (0x80c080: a civilian through a HIGH unit) */
const UNIT_TARGETS = new Set(['CIVILIAN', 'RELIGIOUS', 'TRADER', 'LOW', 'MEDIUM', 'HIGH']);

/** the targets an Attack Units node picks for a team (0x80bd20, 0x80be90,
 *  0x80bb50, 0x80b830): Attack Nearby Units — another player's unit targets
 *  (the list's units are of players hostile to the seat, the barbarians
 *  among them; with an enemy named, the enemy's but its civilians) within
 *  the larger of 2 and a member's Movement left of it; else Attack Along
 *  March — another player's targets ahead of the battle line toward the
 *  target (the axial dot product above 0); else Attack Near Target — targets
 *  of players at war with the seat within 3 + their reach of the target;
 *  else all */
function pickTargets(node: Parameters<BtHandler<OpsContext>['update']>[0], view: AiView, seat: number, op: Operation,
  t: OpTeam, members: readonly AiUnitView[], targets: readonly AiAttackTargetView[]): (k: number) => boolean {
  const P = view.plots();
  const axial = (p: number): [number, number, number] => {
    const q = P[p].x - half(P[p].y);
    return [q, P[p].y, -(q + P[p].y)];
  };
  if (flag(node, 'Attack Nearby Units', false)) {
    return (k) => {
      const g = targets[k];
      if (!UNIT_TARGETS.has(g.type) || g.owner === seat) return false;
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

/** per team engaged or with a unit taken in (0x80ceb0: team +0x90, +0x58):
 *  its members with Movement left and in no formation (a siege
 *  unit only against an enemy city), the targets the node picks logged, the
 *  attack assignment over them (`even` where unequal attacks are not allowed
 *  and one unit goes; `survive` always) carried out (the seat's `attack`)
 *  and logged */
function attackUnitsExecute(node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  const view = ctx.view();
  const P = view.plots();
  const enemyCity = op.target >= 0 && P[op.target].city && P[op.target].owner !== ctx.seat;
  const allowUnequal = flag(node, 'Allow Unequal Attacks', false);
  for (const t of op.teams) {
    if (!t.engaged && t.joined === 0) continue;
    const v = ctx.view();
    const units = unitsById(v, ctx.seat);
    const paired = new Set(op.formations.flat());
    const members = t.members.map((id) => units.get(id)).filter((u): u is AiUnitView =>
      !!u && u.movesLeft > 0 && !paired.has(u.id) && (u.bombard <= 0 || enemyCity));
    const targets = v.attackTargets(ctx.seat);
    const keep = pickTargets(node, v, ctx.seat, op, t, members, targets);
    const picked = targets.map((_g, k) => k).filter(keep);
    picked.forEach((k, i) => {
      const g = targets[k];
      ctx.log(g.unitType
        ? `${op.def}, Op Attack Units Targets, Target ${i}, Owner ${g.owner}, ${g.unitType}, ${xy(v, g.plot)}`
        : `${op.def}, Op Attack Units Targets, Target ${i}, NULL TARGET`);
    });
    const set = new Set(picked);
    const out = ctx.attack(members.map((u) => u.id), (k) => set.has(k), !allowUnequal && members.length === 1, true);
    for (const a of out) {
      const u = units.get(a.unit);
      if (!u) continue;
      ctx.log(`${op.def}, Operation Attack Units, ${u.type}, At ${xy(v, u.plot)}, Move ${xy(v, a.move)}, Attack ${xy(v, a.attack)}`);
    }
  }
}

// OPERATION ATTACK CITY'S EXECUTION (0x8109e0)

/** the targets within 3 of the operation's target (0x80f280) */
const CITY_ATTACK_RANGE = 3;

/** per team: its members alive with Movement left (0x56c690); the seat's
 *  COMBAT_DISTRICT targets within 3 of the operation's target; the
 *  assignment over them (neither filter of a losing exchange, the one of a
 *  blow that kills the unit kept) carried out and logged "Operation City
 *  Attack" */
function attackCityExecute(_node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  if (op.target === NO_PLOT) return;
  for (const t of op.teams) {
    const v = ctx.view();
    const units = unitsById(v, ctx.seat);
    const members = t.members.map((id) => units.get(id)).filter((u): u is AiUnitView => !!u && u.movesLeft > 0);
    const targets = v.attackTargets(ctx.seat);
    const out = ctx.attack(members.map((u) => u.id),
      (k) => targets[k].type === 'COMBAT_DISTRICT' && v.plotDistance(targets[k].plot, op.target) <= CITY_ATTACK_RANGE, false, true);
    for (const a of out) {
      const u = units.get(a.unit);
      if (u) ctx.log(`${op.def}, Operation City Attack, ${u.type}, ${xy(v, u.plot)}, Move ${xy(v, a.move)}, Attack ${xy(v, a.attack)}`);
    }
  }
}

// OPERATION AIR ASSAULT'S EXECUTION (0x80fb50)

/** the target kinds by the node's priorities (1-3, each its slot), the
 *  slot of no kind left empty (0x80fb50: IMPROVEMENT, COMBAT_DISTRICT,
 *  PASSIVE_DISTRICT) */
function airPriorities(node: Parameters<BtHandler<OpsContext>['update']>[0]): (string | null)[] {
  const slots: (string | null)[] = [null, null, null];
  const put = (name: string, kind: string) => {
    if (node.data[name] === undefined) return;
    slots[Math.max(0, Math.min((dataInt(node, name) ?? 0) - 1, 2))] = kind;
  };
  put('Improvement Priority (1-3)', 'IMPROVEMENT');
  put('Combat District Priority (1-3)', 'COMBAT_DISTRICT');
  put('Passive District Priority (1-3)', 'PASSIVE_DISTRICT');
  return slots;
}

/** the bombers — air units with a bombard strength and Movement left, the
 *  teams' members, then the seat's units in no operation within their range
 *  of the target; per target kind in priority order, its targets within 3
 *  of the operation's target (0x80f0d0), each struck by every bomber that
 *  reaches it ("Operation Air Attack"); then each bomber with Movement left
 *  rebases to the base nearest the target, nearer than it stands ("ReBase").
 *  Its contract for the Bomber Unit Type goes unported. */
function airAssaultExecute(node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  if (op.target === NO_PLOT) return;
  const v = ctx.view();
  const bomber = (u: AiUnitView) => u.domain === 'air' && u.bombard > 0 && u.movesLeft > 0;
  const inOps = new Set(ctx.others().flatMap(opUnits));
  const own = op.teams.flatMap((t) => t.members);
  const units = unitsById(v, ctx.seat);
  const bombers = [
    ...own.map((id) => units.get(id)).filter((u): u is AiUnitView => !!u && bomber(u)),
    ...v.units(ctx.seat).filter((u) => bomber(u) && !inOps.has(u.id) && !own.includes(u.id) && v.plotDistance(u.plot, op.target) <= u.range),
  ];
  if (!bombers.length) return;
  const now = (id: number) => ctx.view().units(ctx.seat).find((x) => x.id === id);
  for (const kind of airPriorities(node)) {
    if (!kind) continue;
    for (const g of ctx.view().attackTargets(ctx.seat)) {
      if (g.type !== kind || ctx.view().plotDistance(g.plot, op.target) > CITY_ATTACK_RANGE) continue;
      for (const b of bombers) {
        const u = now(b.id);
        if (!u || u.movesLeft <= 0) continue;
        const cv = ctx.view();
        if (cv.plotDistance(u.plot, g.plot) > u.range) continue;
        const col = cv.airStrikeColumn(u.id, g.plot, kind === 'IMPROVEMENT');
        if (col < 0) continue;
        const row = cv.units(ctx.seat).map((x) => (x.id === u.id ? col : -1));
        ctx.act([row]);
        ctx.log(`${op.def}, Operation Air Attack, ${u.type}, ${xy(cv, u.plot)}, Attack ${xy(cv, g.plot)}`);
      }
    }
  }
  for (const b of bombers) {
    const u = now(b.id);
    if (!u || u.movesLeft <= 0) continue;
    const cv = ctx.view();
    let best: { plot: number; column: number } | null = null;
    let bestD = cv.plotDistance(u.plot, op.target);
    for (const o of cv.rebaseOptions(u.id)) {
      if (o.plot === u.plot) continue;
      const d = cv.plotDistance(o.plot, op.target);
      if (bestD >= 0 && d >= bestD) continue;
      best = o;
      bestD = d;
    }
    if (!best || best.column < 0) continue;
    ctx.log(`${op.def}, Operation Air Attack, ${u.type}, ${xy(cv, u.plot)}, ReBase ${xy(cv, best.plot)}`);
    const row = cv.units(ctx.seat).map((x) => (x.id === u.id ? best!.column : -1));
    ctx.act([row]);
  }
}

// OPERATION PILLAGE'S EXECUTION (0x811390)

/** a unit's pillage where it stands, as its action row */
function pillageHere(ctx: OpsContext, id: number): void {
  const view = ctx.view();
  const units = view.units(ctx.seat);
  const col = units.findIndex((u) => u.id === id);
  const action = view.unitActionColumn('PILLAGE');
  if (col < 0 || action < 0) return;
  const row = units.map(() => -1);
  row[col] = action;
  ctx.act([row]);
}

/** per target of the seat's list — an improvement (Pillage Improvements),
 *  a passive district (Pillage Districts), a goody hut (Get Goody Huts), each
 *  kind unless the node's flag says false — on the land of the operation's
 *  target's owner:
 *  of the teams' members on land or at sea off it, with no bombard
 *  strength, in no formation, with Movement left, that may pillage (a goody
 *  hut any): one on it pillages there ("Operation Pillage City", its plot
 *  the three; runs/h1_duelw11xx: every such line of the barbarians'); else of those within twice their
 *  Movement of it (any for a goody hut) whose planning reaches it within two
 *  turns with Movement left there (0x791300 at range 0), the nearest goes
 *  ("Operation Pillage City, From, Goal, Move") and pillages on arrival */
function pillageExecute(node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  const improvements = flag(node, 'Pillage Improvements', true);
  const districts = flag(node, 'Pillage Districts', true);
  const goodies = flag(node, 'Get Goody Huts', true);
  const v0 = ctx.view();
  const P = v0.plots();
  const owner = op.target >= 0 ? P[op.target].owner : -1;
  const now = (id: number) => ctx.view().units(ctx.seat).find((x) => x.id === id);
  for (const g of v0.attackTargets(ctx.seat)) {
    const goody = g.type === 'GOODY';
    if (!((improvements && g.type === 'IMPROVEMENT') || (districts && g.type === 'PASSIVE_DISTRICT') || (goodies && goody))) continue;
    if (owner >= 0 && P[g.plot].owner !== owner) continue;
    let best: AiUnitView | null = null;
    let bestD = 0;
    let spot = NO_PLOT;
    for (const t of op.teams) {
      for (const id of t.members) {
        const u = now(id);
        if (!u || (u.domain === 'sea' && P[g.plot].water) || u.bombard > 0 || op.formations.some((f) => f.includes(id)) || u.movesLeft <= 0) continue;
        if (!goody && u.combat <= 0) continue;
        if (u.plot === g.plot) {
          pillageHere(ctx, id);
          ctx.log(`${op.def}, Operation Pillage City, ${u.type}, From ${xy(v0, u.plot)}, Goal: ${xy(v0, g.plot)}, Move ${xy(v0, u.plot)}`);
          continue;
        }
        const v = ctx.view();
        if (!goody && v.plotDistance(u.plot, g.plot) >= 2 * (u.movesLeft >> 8)) continue;
        const s = v.planSpot(id, g.plot, 2, true, 0);
        if (s < 0) continue;
        const d = v.plotDistance(u.plot, s);
        if (best && d >= bestD) continue;
        best = u;
        bestD = d;
        spot = s;
      }
    }
    if (!best) continue;
    const from = best.plot;
    moveTo(ctx, best, spot);
    const after = now(best.id)?.plot ?? from;
    if (after === g.plot) pillageHere(ctx, best.id);
    if (after !== from) ctx.log(`${op.def}, Operation Pillage City, ${best.type}, From ${xy(v0, from)}, Goal: ${xy(v0, g.plot)}, Move ${xy(v0, after)}`);
  }
}

// OPERATION SIEGE CITY'S EXECUTION (0x811e80)

/** an encirclement slot about the city (0x812950): the plot beside it in
 *  the direction, its domain (sea, land), whether it joins the next slot
 *  (+0xc) and the one before (+0xd) — the two plots of one domain with no
 *  river between — the count of units ringing it (+0x10) and its holder */
interface SiegeSlot { plot: number; sea: boolean; next: boolean; prev: boolean; count: number; holder: number }

function siegeSlots(view: AiView, city: number): SiegeSlot[] {
  const P = view.plots();
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const plot = view.adjacentPlot(city, i);
    if (plot < 0) return { plot, sea: false, next: false, prev: false, count: 1, holder: -1 };
    const sea = P[plot].water;
    const joins = (n: number, edge: number) => n >= 0 && P[n].water === sea && !view.riverEdge(plot, edge);
    return { plot, sea, next: joins(view.adjacentPlot(city, (i + 1) % 6), (i + 2) % 6),
      prev: joins(view.adjacentPlot(city, (i + 5) % 6), (i + 4) % 6), count: 0, holder: -1 };
  });
}

/** per team the operation's units with Movement left, no bombard strength
 *  and a planning: where the city on the target is not encircled (0x24bf70),
 *  the six slots about it shared out by the generalized assignment (three
 *  passes): a unit standing on a slot starts on it (λ 0x80f9d0); a slot's
 *  gain (λ 0x80f6b0) for a unit of its domain that reaches it — the unit
 *  taken off its own slot — is 0 where every slot is held and it holds none
 *  of this one, else (1 + 1 for the slot unheld or held by it alone) plus
 *  the same for each joined slot beside it where the unit holds a zone of
 *  control, times (1 + 1 reached this turn + 1 with Movement left there),
 *  + 100 where it completes the ring (holding it alone, or every slot held
 *  and it reached this turn); taking a slot (λ 0x80f4a0) a unit reaching it
 *  this turn rings it and, with a zone of control, the slots it joins. Then
 *  slot by slot each holder not already on a slot moves to it ("Operation
 *  Siege City, From, Goal, Move"), again while one moved. The step beside
 *  the city of the units that pass a zone of control (its gates unread)
 *  goes unported; where the city is encircled its ranged units strike it
 *  ("Operation Siege City Attack"). */
function siegeCityExecute(_node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  const target = op.target;
  if (target === NO_PLOT) return;
  const now = (id: number) => ctx.view().units(ctx.seat).find((x) => x.id === id);
  const v = ctx.view();
  if (v.encircled(target)) {
    for (const id of opUnits(op)) {
      const u = now(id);
      if (!u || u.movesLeft <= 0 || u.range <= 0) continue;
      ctx.log(`${op.def}, Operation Siege City Attack, ${u.type} ${xy(v, u.plot)}`);
      ctx.strike(id, target);
    }
    return;
  }
  const slots = siegeSlots(v, target);
  const units = opUnits(op).map((id) => now(id)).filter((u): u is AiUnitView => !!u && u.movesLeft > 0 && u.bombard <= 0);
  const reach = units.map((u) => (s: SiegeSlot) => (s.plot >= 0 && (u.domain === 'sea') === s.sea && u.domain !== 'air' ? v.reachOf(u.id, s.plot) : null));
  const zoc = units.map((u) => v.exertsZoc(u.id));
  const ring = (j: number, d: number) => {
    const s = slots[j];
    s.count += d;
    return s;
  };
  const neighbours = (j: number): number[] => [slots[j].next ? (j + 1) % 6 : -1, slots[j].prev ? (j + 5) % 6 : -1].filter((x) => x >= 0);
  const take = (i: number, j: number, d: number) => {
    const r = reach[i](slots[j]);
    if (!r || r.turns !== 1) return;
    ring(j, d);
    if (zoc[i]) for (const n of neighbours(j)) ring(n, d);
  };
  const gain = (i: number, j: number, cur: number): number => {
    const s = slots[j];
    if (s.plot < 0) return 0;
    const r = reach[i](s);
    if (!r) return 0;
    if (cur >= 0) take(i, cur, -1);
    const mult = 1 + (r.turns === 1 ? 1 : 0) + (r.moves !== 0 ? 1 : 0);
    let empty = slots.filter((x) => x.count === 0).length;
    const own = s.holder === i;
    let full = own && empty === 0;
    if (empty === 0 && !own) return 0;
    let sum = 1 + (s.count === (own ? 1 : 0) ? 1 : 0);
    if (own) full = full && s.count === 1;
    else if (s.count === 0) empty--;
    if (zoc[i]) {
      for (const n of neighbours(j)) {
        const c = slots[n].count;
        sum += 1 + (c === (own ? 1 : 0) ? 1 : 0);
        if (own) full = full && c === 1;
        else if (c === 0) empty--;
      }
    }
    if (!own && r.turns === 1 && empty === 0) full = true;
    if (cur >= 0) take(i, cur, 1);
    return sum * mult + (full ? 100 : 0);
  };
  const move = (i: number, j: number, cur: number): number => {
    if (cur >= 0 && slots[cur].holder === i) {
      slots[cur].holder = -1;
      take(i, cur, -1);
    }
    const old = slots[j].holder;
    slots[j].holder = i;
    take(i, j, 1);
    return old;
  };
  const at = units.map(() => -1);
  slots.forEach((s, j) => units.forEach((u, i) => {
    if (u.plot !== s.plot) return;
    move(i, j, -1);
    at[i] = j;
  }));
  generalizedAssignment(units.length, slots.length, at, gain, move, SIEGE_PASSES);
  const onSlot = (plot: number) => slots.some((s) => s.holder >= 0 && now(units[s.holder].id)?.plot === plot);
  for (let moved = true; moved;) {
    moved = false;
    for (const s of slots) {
      if (s.holder < 0) continue;
      const u = now(units[s.holder].id);
      if (!u || u.plot === s.plot || onSlot(s.plot)) continue;
      const from = u.plot;
      moveTo(ctx, u, s.plot);
      const after = now(u.id)?.plot ?? from;
      if (after === from) continue;
      moved = true;
      ctx.log(`${op.def}, Operation Siege City, ${u.type}, From ${xy(v, from)}, Goal: ${xy(v, s.plot)}, Move ${xy(v, after)}`);
    }
  }
}

/** the generalized assignment's passes in the siege (its last argument) */
const SIEGE_PASSES = 3;

// OPERATION ATTACK'S EXECUTION (0x80c180)

/** a unit onto a plot (UNITOPERATION_MOVE_TO): a blow where a hostile unit
 *  or city stands there, else the move */
function moveOnto(ctx: OpsContext, u: AiUnitView, plot: number): void {
  const v = ctx.view();
  const hostile = v.hostileUnits(ctx.seat).some((h) => h.plot === plot) || v.hostileCities(ctx.seat).some((c) => c.plot === plot);
  if (hostile) ctx.strike(u.id, plot);
  else moveTo(ctx, u, plot);
}

/** per team with a target (its goal slot 1), in four passes over its
 *  members alive with Movement left (0x56c690):
 *  - beyond its reach (max(1, its range)) of the target: to its planning's
 *    spot exactly that far within two turns ("Attack Target Move"), else
 *    straight for the target ("Attack Target Move Direct"); on the target,
 *    UNITCOMMAND_TREAT_WITH_CLAN_DISPERSE (the Barbarian Clans mode's, none
 *    here);
 *  - its planning's entry for the target: to its spot of the fewest turns
 *    (the first of equals, its own plot at 0 turns) where that is not 0
 *    ("Attack Target Move Melee");
 *  - a unit on the target (Plot +0x4c): each member with a range strikes it
 *    ("Attack Target Range Attack");
 *  - each onto the target ("Attack Target Melee Attack"). */
function operationAttackExecute(_node: Parameters<BtHandler<OpsContext>['update']>[0], _run: unknown, ctx: OpsContext): void {
  const { op } = ctx;
  const now = (id: number) => ctx.view().units(ctx.seat).find((x) => x.id === id);
  const line = (kind: string, u: AiUnitView, at: number, rest = '') =>
    ctx.log(`${op.def}, ${kind}, ${u.type}, At ${xy(ctx.view(), at)}${rest}`);
  for (const t of op.teams) {
    const target = t.goals[1];
    if (target === NO_PLOT) continue;
    for (const id of [...t.members]) {
      const u = now(id);
      if (!u || u.movesLeft <= 0) continue;
      const reach = Math.max(1, u.range);
      const v = ctx.view();
      if (v.plotDistance(u.plot, target) <= reach) continue;
      const spot = v.planSpot(id, target, 2, false, reach);
      moveTo(ctx, u, spot >= 0 ? spot : target);
      const after = now(id)?.plot ?? u.plot;
      line(spot >= 0 ? 'Attack Target Move' : 'Attack Target Move Direct', u, u.plot,
        `, Move ${xy(v, spot)}, Arrive ${xy(v, after)}`);
    }
    for (const id of [...t.members]) {
      const u = now(id);
      if (!u || u.movesLeft <= 0) continue;
      const v = ctx.view();
      let best = NO_PLOT;
      let turns = 0;
      for (const s of v.attackSpots(id, target)) {
        if (best === NO_PLOT || s.turns < turns) {
          best = s.plot;
          turns = s.turns;
        }
        if (s.plot === u.plot) {
          turns = 0;
          break;
        }
      }
      if (best === NO_PLOT || turns === 0) continue;
      moveTo(ctx, u, best);
      line('Attack Target Move Melee', u, u.plot, `, Move ${xy(v, best)}, Arrive ${xy(v, now(id)?.plot ?? u.plot)}`);
    }
    if (ctx.view().plotUnitCount(target) > 0) {
      for (const id of [...t.members]) {
        const u = now(id);
        if (!u || u.movesLeft <= 0 || u.range <= 0) continue;
        line('Attack Target Range Attack', u, u.plot);
        ctx.strike(id, target);
      }
    }
    for (const id of [...t.members]) {
      const u = now(id);
      if (!u || u.movesLeft <= 0) continue;
      line('Attack Target Melee Attack', u, u.plot);
      moveOnto(ctx, u, target);
    }
  }
}

export const ASSAULT_NODES: Readonly<Record<string, BtHandler<OpsContext>>> = {
  'Is At War': isAtWar,
  'Can Alpha City': canAlphaCity,
  'Is City Threatened': isCityThreatened,
  'Garrison City': garrisonCity,
  'Operation Diplomacy': operationDiplomacy,
  'Operation Attack City': { ...operationAttackCity, execute: attackCityExecute },
  'Operation Air Assault': { ...operationAirAssault, execute: airAssaultExecute },
  'Operation Pillage': { ...operationPillage, execute: pillageExecute },
  'Operation Siege City': { ...operationSiegeCity, execute: siegeCityExecute },
  'Build Military Improvement': buildMilitaryImprovement,
};

export { attackUnitsExecute, operationAttackExecute };
