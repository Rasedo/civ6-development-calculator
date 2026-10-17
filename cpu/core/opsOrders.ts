/**
 * THE OPERATIONS' UNIT ORDERS IN A TACTICAL PASS: what the operation nodes
 * (cpu/core/operations) give a player's units, carried out through the
 * tactical pass the player's turn opened (cpu/core/tactical.ts) — its
 * planning, its target list, its move orders (0x962030) and its attack
 * assignment (0x776140, carried out by 0x771f80) — so an operation's units
 * move as the pass's own do. The city-states' turn and the operations probe
 * beside the replay both run their operations so.
 */
import type { GameState, Unit } from './types';
import { UNITS } from '../data/units';
import { gameTypeOf } from '../data/aliases';
import { attacksLeftOf } from './promotions';
import { hostileRangedStrike, unitAttackRange } from './combat';
import { moveTo, passAttack, passMoveExec, passMoveUpdate, plotDistance, type Pass } from './tactical';
import type { OpsEnv } from './operations/manager';
import { unitDomain } from './units';
import { CITY_STRIKE_RANGE } from './phase';
import type { MajorAttackTargetView, MajorView } from '../../ai/major/view';

/** `base` as `seat`'s operations read it in its pass: the pass's target list
 *  (the one its attack assignment walks), and its units' planning — their
 *  reach, the plot at a range, the spots and the blow on a target (0x791300
 *  taken as the pass opened) */
export function passView(state: GameState, seat: number, pass: Pass, base: MajorView): MajorView {
  const unitOf = (id: number): Unit | undefined => state.units.find((u) => u.id === id);
  const reach = (id: number) => pass.plan.get(id)?.reach ?? null;
  return {
    ...base,
    attackTargets: (i) => (i !== seat ? base.attackTargets(i) : pass.targets.map((t): MajorAttackTargetView => ({
      type: t.type, plot: t.tile, owner: t.seat, unitType: t.unit ? gameTypeOf('unit', t.unit.type, 'UNIT_') : null,
      range: t.unit ? unitAttackRange(t.unit) : t.type === 'COMBAT_DISTRICT' ? CITY_STRIKE_RANGE : 0,
    }))),
    unitReach: (id, turns) => {
      const r = reach(id);
      return r ? r.filter((x) => x.turns <= turns).map((x) => ({ plot: x.tile, turns: x.turns, moves: x.moves })) : base.unitReach(id, turns);
    },
    planSpot: (id, p, turns, needMoves, range) => {
      const u = unitOf(id);
      const r = reach(id);
      if (!u || !r) return base.planSpot(id, p, turns, needMoves, range);
      const dom = unitDomain(u.type);
      const fights = (x: Unit) => (UNITS[x.type]?.combat ?? 0) > 0;
      for (const e of r) {
        if (plotDistance(state, e.tile, p) !== range || e.turns > turns || (needMoves && e.moves <= 0)) continue;
        if (e.tile === u.tileIndex) return e.tile;
        if (!state.units.some((x) => x !== u && x.tileIndex === e.tile && unitDomain(x.type) === dom && fights(x) === fights(u))) return e.tile;
      }
      return -1;
    },
    attackSpots: (id, p) => {
      const e = pass.plan.get(id)?.entries.find((x) => x.target.tile === p);
      return e ? e.spots.map((x) => ({ plot: x.tile, turns: x.turns })) : [];
    },
    cityBlow: (id, p) => (pass.plan.get(id)?.entries.some((x) => x.target.tile === p && x.spots.length > 0) ? base.cityBlow(id, p) : 0),
  };
}

/** the orders of `seat`'s operations in `pass`; `changed` after each */
export function passOrders(state: GameState, seat: number, pass: Pass, changed: () => void):
  Pick<OpsEnv, 'move' | 'strike' | 'attack' | 'moveUpdate' | 'moveExec'> {
  const unitOf = (id: number): Unit | undefined => state.units.find((u) => u.id === id && u.seat === seat);
  return {
    move: (id, dest) => {
      const u = unitOf(id);
      if (u) moveTo(state, u, dest, false);
      changed();
    },
    // a ranged unit within its range strikes from where it stands; any other
    // goes for the plot with the attack flag
    strike: (id, plot) => {
      const u = unitOf(id);
      if (!u) return;
      const ranged = UNITS[u.type]?.ranged?.strength ?? 0;
      if (ranged > 0 && plotDistance(state, u.tileIndex, plot) <= unitAttackRange(u)) {
        if (u.movesLeft > 0 && attacksLeftOf(u) > 0) hostileRangedStrike(state, u, plot);
      } else moveTo(state, u, plot, true);
      changed();
    },
    attack: (ids, keep, even, survive) => {
      const out = passAttack(state, pass, ids, keep, even, survive, 'Operation');
      changed();
      return out.map((a) => ({ unit: a.unit.id, from: a.from, move: a.move, attack: a.attack }));
    },
    moveUpdate: (members, store, goal, target, range, spread) => passMoveUpdate(state, pass, members, store, goal, target, range, spread),
    moveExec: (members, goal, range, arrived, ready, zero, leaderNamed) => {
      const out = passMoveExec(state, pass, members, goal, range, arrived, ready, (u) => zero(u.id, gameTypeOf('unit', u.type, 'UNIT_')), leaderNamed);
      changed();
      return out.map((x) => ({ type: gameTypeOf('unit', x.unit.type, 'UNIT_'), from: x.from, dest: x.dest, after: x.unit.tileIndex }));
    },
  };
}
