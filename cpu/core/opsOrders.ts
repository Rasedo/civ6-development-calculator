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
import { aiPromotionPick, attacksLeftOf, takePromotion } from './promotions';
import { cityStrikeStrength, damageExpected, hostilePillage, hostilePillageAmount, hostileRangedStrike, unitAttackRange } from './combat';
import { aiStrengths, maxMoves, militaryAiTypeOf, moveTo, passAttack, passFinish, passMoveExec, passMoveUpdate, passNavalPillage, passPatrol, passSafePlot, plotDistance, rangeOf,
  type Pass } from './tactical';
import type { OpsEnv } from './operations/manager';
import type { DefendOrders } from './operations/nodes';
import { unitDomain } from './units';
import { CITY_STRIKE_RANGE } from './phase';
import { allianceTypeWith, cityAtTile, cityStateOfSeat, civsAtWar, isBarbSeat, isCityStateSeat, tileSeat } from './seats';
import { NO_SEAT, type City } from './types';
import { cityStateAt, minorCity } from './cityStates';
import { COMBAT_MAX_HIT_POINTS } from '../data/constants';
import { isWater } from '../../world/query';
import type { MajorAttackTargetView, MajorView } from '../../ai/major/view';

/** `base` as `seat`'s operations read it in its pass: the pass's target list
 *  (the one its attack assignment walks), and its units' planning — their
 *  reach, the plot at a range, the spots and the blow on a target (0x791300
 *  taken as the pass opened) — and its units with no Movement left where an
 *  order ended their moves */
export function passView(state: GameState, seat: number, pass: Pass, base: MajorView): MajorView {
  const unitOf = (id: number): Unit | undefined => state.units.find((u) => u.id === id);
  const reach = (id: number) => pass.plan.get(id)?.reach ?? null;
  return {
    ...base,
    units: (i) => (i !== seat || !pass.ended.size ? base.units(i)
      : base.units(i).map((u) => (pass.ended.has(u.id) ? { ...u, movesLeft: 0 } : u))),
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

/** a plot's relation to `seat` (Rules_Movement 0x530880): 1 its own, a
 *  city-state's it is suzerain of, an ally's; 2 no one's; 3 another's */
function groundOf(state: GameState, seat: number, plot: number): number {
  const owner = tileSeat(state.map.tiles[plot]);
  if (owner === NO_SEAT || owner < 0) return 2;
  if (owner === seat) return 1;
  if (isCityStateSeat(owner) && state.cityStates.find((c) => c.id === cityStateOfSeat(owner))?.suzerain === seat) return 1;
  return allianceTypeWith(state, seat, owner) >= 0 ? 1 : 3;
}

/** the city a district plot belongs to (0x408770), a city-state's included */
function cityOfPlot(state: GameState, plot: number): City | undefined {
  const t = state.map.tiles[plot];
  const cs = cityStateAt(state, plot);
  return cs ? minorCity(cs) : cityAtTile(state, t);
}

/** a unit's damage, its hit points' complement */
const damageOf = (u: Unit): number => COMBAT_MAX_HIT_POINTS - u.hp;

/** the unit hurt to `pct` percent of its hit points (single precision) */
const hurt = (u: Unit, pct: number): boolean =>
  damageOf(u) >= Math.fround(COMBAT_MAX_HIT_POINTS * Math.fround(pct * Math.fround(0.01)));

/** the unit's domain (+0x650: 0 sea, 1 air, 2 land) is the land's */
const landUnit = (u: Unit): boolean => !UNITS[u.type]?.naval && UNITS[u.type]?.air === undefined;

/** a land unit afloat on a plot of danger (+0x650 == 2, 0x834d0) */
const afloatInDanger = (state: GameState, pass: Pass, u: Unit): boolean =>
  landUnit(u) && isWater(state.map.tiles[u.tileIndex]) && pass.danger[u.tileIndex] > 0;

/**
 * THE TEAM UPDATE'S ENDANGERED (0x738f20 over the members): per member, the
 * pass's targets within twice its base Movement in the list's order — a
 * unit of the target that fights, where no unit of the member's player
 * stands beside it (0x6b1b0's ring) and the member's plot holds danger or
 * the target is HIGH, within the target's Movement or its range, adds the
 * blow it would strike the member (0x51a240 on their strengths); a city
 * that strikes, within its range, its strike (0x519370) — and the member
 * the sum would leave with no hit points (a unit that does not fight, any
 * blow at all) is endangered.
 */
function endangered(state: GameState, pass: Pass, members: readonly Unit[]): Unit[] {
  const out: Unit[] = [];
  for (const u of members) {
    const near = 2 * (UNITS[u.type]?.moves ?? 0);
    const mine = aiStrengths(state, u);
    const fights = mine.melee > 0 || mine.ranged > 0 || mine.bombard > 0;
    const beside = state.units.some((x) => x !== u && x.seat === u.seat && plotDistance(state, x.tileIndex, u.tileIndex) === 1);
    let sum = 0;
    for (const e of pass.targets) {
      const d = plotDistance(state, u.tileIndex, e.tile);
      if (d <= near) {
        const ev = e.unit && state.units.includes(e.unit) ? e.unit : null;
        if (ev) {
          const theirs = aiStrengths(state, ev);
          if ((theirs.melee > 0 || theirs.ranged > 0 || theirs.bombard > 0) && !beside
            && (pass.danger[u.tileIndex] > 0 || e.type === 'HIGH')
            && (d <= maxMoves(state, ev) || d <= rangeOf(ev))) {
            sum += damageExpected(Math.max(theirs.melee, theirs.ranged) - mine.melee);
          }
        } else if (e.type === 'COMBAT_DISTRICT') {
          const city = cityOfPlot(state, e.tile);
          const str = city ? cityStrikeStrength(state, city) : 0;
          if (city && str > 0 && plotDistance(state, u.tileIndex, city.centerIndex) <= CITY_STRIKE_RANGE) {
            sum += damageExpected(str - mine.melee);
          }
        }
      }
      if (out.includes(u)) continue;
      if (sum > 0 && !fights) {
        if (!isWater(state.map.tiles[u.tileIndex])) out.push(u);
      } else if (damageOf(u) + sum > COMBAT_MAX_HIT_POINTS) out.push(u);
    }
  }
  return out;
}

/** OPERATION DEFEND UNITS' orders in `seat`'s pass (`DefendOrders`) */
function passDefend(state: GameState, seat: number, pass: Pass, changed: () => void): DefendOrders {
  const unitsOf = (ids: readonly number[]): Unit[] =>
    ids.map((id) => state.units.find((u) => u.id === id && u.seat === seat)).filter((u): u is Unit => !!u);
  const type = (u: Unit) => gameTypeOf('unit', u.type, 'UNIT_');
  const xy = (p: number) => `${p % state.map.width} ${Math.floor(p / state.map.width)}`;
  const inCity = (u: Unit) => state.map.tiles[u.tileIndex].district === 'CITY_CENTER';
  const off = (u: Unit, target: number, range: number) => range < 0 || plotDistance(state, u.tileIndex, target) >= range;
  // Movement left (+0xdb0), none once an order ended its moves
  const moves = (u: Unit) => (pass.ended.has(u.id) ? 0 : u.movesLeft);
  return {
    flagged: (members, pct) => {
      const us = unitsOf(members);
      if (endangered(state, pass, us).length) return true;
      return us.some((u) => hurt(u, pct) || afloatInDanger(state, pass, u));
    },
    execute: (members, target, pct, range) => {
      const lines: { type: string; what: string }[] = [];
      const us = unitsOf(members);
      // the endangered to their safe plots (0x716b90)
      for (const u of endangered(state, pass, us)) {
        if (!off(u, target, range) || aiStrengths(state, u).bombard > 0 || moves(u) <= 0 || inCity(u)) continue;
        const to = passSafePlot(state, pass, u);
        passFinish(pass, u, 'Operation', u.tileIndex);
        if (to >= 0) {
          moveTo(state, u, to, false);
          // arrived, its moves end (0x56d6f0)
          if (state.units.includes(u) && u.tileIndex === to) pass.ended.add(u.id);
          lines.push({ type: type(u), what: `Move ${xy(to)}` });
          changed();
        }
      }
      // the hurt, or a land unit afloat in danger
      for (const u of us) {
        if (!state.units.includes(u) || moves(u) <= 0 || !off(u, target, range)) continue;
        if (!hurt(u, pct) && !afloatInDanger(state, pass, u)) continue;
        // a promotion due: the AI's pick, its turn done
        const k = aiPromotionPick(u);
        if (k >= 0 && takePromotion(u, k)) {
          passFinish(pass, u, 'Operation', u.tileIndex);
          lines.push({ type: type(u), what: 'Promote' });
          changed();
        }
        if (aiStrengths(state, u).bombard > 0) continue;
        // a ship (+0x650 == 0) off friendly ground is released (0x73d1f0):
        // its orders end there, its team keeps it
        if (UNITS[u.type]?.naval && groundOf(state, seat, u.tileIndex) !== 1) continue;
        // a land unit afloat to its safe plot
        if (landUnit(u) && isWater(state.map.tiles[u.tileIndex])) {
          const to = passSafePlot(state, pass, u);
          passFinish(pass, u, 'Operation', u.tileIndex);
          if (to >= 0) {
            moveTo(state, u, to, false);
            // arrived, its moves end (0x56d6f0)
            if (state.units.includes(u) && u.tileIndex === to) pass.ended.add(u.id);
            lines.push({ type: type(u), what: `Move ${xy(to)}` });
            changed();
          }
          if (!state.units.includes(u)) continue;
        }
        // with Movement, a pillage where the plot pays a plunder
        if (moves(u) > 0 && hostilePillageAmount(state, u) > 0) {
          const at = u.tileIndex;
          hostilePillage(state, u);
          lines.push({ type: type(u), what: `Plunder ${xy(at)}` });
          changed();
        }
        // with no Movement left, or a barbarian (0x56c690, 0x469ce0), its
        // orders end there: no fortification, its turn not done
        if (moves(u) <= 0 || isBarbSeat(seat)) continue;
        const owner = tileSeat(state.map.tiles[u.tileIndex]);
        if ((owner !== NO_SEAT && owner >= 0 && civsAtWar(state, seat, owner)) || pass.danger[u.tileIndex] > 0) {
          const to = passSafePlot(state, pass, u);
          passFinish(pass, u, 'Operation', u.tileIndex);
          if (to >= 0 && to !== u.tileIndex) {
            moveTo(state, u, to, false);
            lines.push({ type: type(u), what: `Move ${xy(to)}` });
            changed();
            if (!state.units.includes(u)) continue;
          }
        }
        // fortified, its moves end (0x56d6f0)
        pass.ended.add(u.id);
        passFinish(pass, u, 'Operation', u.tileIndex);
        lines.push({ type: type(u), what: 'Fortify' });
      }
      return lines;
    },
  };
}

/** `seat`'s units of the ids take their type's own AI type (0x79b9c0): a
 *  standing army's DEFENDER turns COMBAT, the pass (where one is open)
 *  reading the type it now holds */
export function ownAiType(state: GameState, seat: number, pass: Pass | null): OpsEnv['ownAiType'] {
  return (ids) => {
    for (const id of ids) {
      const u = state.units.find((x) => x.id === id && x.seat === seat);
      if (!u?.aiDefender) continue;
      delete u.aiDefender;
      if (pass?.ai.has(id)) pass.ai.set(id, militaryAiTypeOf(u));
    }
  };
}

/** the orders of `seat`'s operations in `pass`; `changed` after each */
export function passOrders(state: GameState, seat: number, pass: Pass, changed: () => void):
  Pick<OpsEnv, 'move' | 'strike' | 'attack' | 'moveUpdate' | 'moveExec' | 'defend' | 'patrol' | 'pillage'> {
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
    defend: passDefend(state, seat, pass, changed),
    // the units in the player's unit order (0x6092c0: pool order)
    patrol: (ids) => {
      const us = ids.map(unitOf).filter((u): u is Unit => !!u).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      for (const u of us) {
        if (!state.units.includes(u) || u.movesLeft <= 0) continue;
        passPatrol(state, pass, u);
        changed();
      }
    },
    pillage: (ids) => {
      passNavalPillage(state, pass, ids.map(unitOf).filter((u): u is Unit => !!u).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)));
      changed();
    },
  };
}
