import type { SeatEmitter } from './decideObs';
import type { GameState } from './types';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENT_LIST, POLICY_LIST, SLOT_KINDS } from '../data/policies';
import { PEACE_GOLD_COST, WAR_MIN_TURNS } from '../data/seats';
import { warKindCode } from '../data/warKinds';
import { availableCivicsIn, availableTechsIn, governmentsOpen, governmentSlots, inDarkAge, seatGovernment, unlockedPolicyIds } from './effects';
import { effectiveResearchCost, goldAffordable } from './game';
import { congressPolicyBlocked } from './congress';
import { cityStateById, hasMet, isSuzerain } from './cityStates';
import { civsAtWar, atWarWithAny, isCityStateSeat, cityStateOfSeat, seatOf, treatyTurnsWith, warTurnsWith } from './seats';
import { warTargets } from './phase';
import { defaultWarKind, warBuffRowsOf, warKindAllowed } from './casusBelli';

/**
 * THE DECISION MASKS (research, policies, war and its kind table).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */

/** Per table index the effective cost of every open item, -1 where it is
 *  not open: the record's research arms accept exactly the open ones. */
function openCosts(state: GameState, seat: number, civic: boolean): number[] {
  const research = seatOf(state, seat)!.research;
  const table = civic ? CIVICS : TECHS;
  const open = new Set((civic ? availableCivicsIn(research) : availableTechsIn(research)).map((d) => d.id));
  return Object.values(table).map((d) => (open.has(d.id) ? effectiveResearchCost(state, seat, d.id, d.cost) : -1));
}

/** The `research` group: `tech_cost` and `civic_cost` per table index. */
export function researchObs(state: GameState, seat: number): { tech_cost: number[]; civic_cost: number[] } {
  return { tech_cost: openCosts(state, seat, false), civic_cost: openCosts(state, seat, true) };
}

/** The `policy` group: the card indices the seat may slot under the
 *  government it is in (the record's validator, `unlockedPolicyIds`),
 *  ascending, and that government's slots by kind — `governmentSlots`, the
 *  list `fitPolicies` lays the set into; empty and all zero without one.
 *  Then that government's `GOVERNMENT_LIST` position (-1 none) and the
 *  positions the record's government arm accepts now (`governmentsOpen`). */
export function policyObs(state: GameState, seat: number): {
  unlocked: number[]; slots: number[]; government: number; gov_open: number[];
} {
  const s = seatOf(state, seat)!;
  const gov = seatGovernment(state, seat);
  const government = gov ? GOVERNMENT_LIST.findIndex((g) => g.id === gov) : -1;
  const gov_open = governmentsOpen(state, seat);
  if (!gov) return { unlocked: [], slots: [0, 0, 0, 0], government, gov_open };
  const open = unlockedPolicyIds(s.research, congressPolicyBlocked(state), inDarkAge(state, seat), s.government.held, gov);
  const unlocked: number[] = [];
  POLICY_LIST.forEach((p, i) => { if (open.has(p.id)) unlocked.push(i); });
  const held = governmentSlots(state, seat);
  return { unlocked, slots: SLOT_KINDS.map((k) => held.filter((x) => x === k).length), government, gov_open };
}

export interface WarObs {
  targets: number;
  declare: number[];
  sue: number[];
  kind_default: number[];
  kind_own: number[];
  at_war: boolean;
}

/** The `war` group over the war head's columns (`warTargets`). A column is
 *  OPEN to declare where the target stands (a city-state still on the
 *  roster and met), no war is on and no peace treaty binds; the declaration's
 *  own verb re-validates the rest (friendship, the casus belli, the bans) at
 *  apply. Open to SUE where the war has run `WAR_MIN_TURNS`, and a major's
 *  peace price is affordable from this seat's treasury (the record's peace
 *  arm) or a minor's suzerain is not at war with this seat
 *  (`sueForPeaceWithCityState`). Per MAJOR column the kind a declaration
 *  takes: `defaultWarKind`, and the leader's own buffed kind where
 *  `warKindAllowed` holds it (`WAR_BUFF_ROWS`, the last such row), else the
 *  default; -1 on a column not open to declare. */
export function warObs(state: GameState, seat: number): WarObs {
  const me = seatOf(state, seat)!;
  const targets = warTargets(state, seat);
  const declare: number[] = [];
  const sue: number[] = [];
  const kindDefault: number[] = [];
  const kindOwn: number[] = [];
  const buffs = warBuffRowsOf(state, seat);
  targets.forEach((foe, k) => {
    let live = true;
    let peaceOk: boolean;
    const waited = warTurnsWith(state, seat, foe);
    if (isCityStateSeat(foe)) {
      const cs = cityStateById(state, cityStateOfSeat(foe));
      live = !!cs && hasMet(cs, seat);
      peaceOk = !!cs && !state.seats.some((x) => x.seat !== seat && civsAtWar(state, x.seat, seat) && isSuzerain(state, cs, x.seat));
    } else {
      live = !!seatOf(state, foe);
      peaceOk = goldAffordable(me.treasury ?? 0, PEACE_GOLD_COST(waited));
    }
    const atWar = civsAtWar(state, seat, foe);
    const open = live && !atWar && treatyTurnsWith(state, seat, foe) === 0;
    if (open) declare.push(k);
    if (live && atWar && waited >= WAR_MIN_TURNS && peaceOk) sue.push(k);
    if (isCityStateSeat(foe)) return;
    let dfl = -1;
    let own = -1;
    if (open) {
      dfl = defaultWarKind(state, seat, foe);
      own = dfl;
      for (const r of buffs) {
        const kind = warKindCode(r.kind);
        if (warKindAllowed(state, seat, foe, kind)) own = kind;
      }
    }
    kindDefault.push(dfl);
    kindOwn.push(own);
  });
  return {
    targets: targets.length, declare, sue, kind_default: kindDefault, kind_own: kindOwn,
    at_war: atWarWithAny(state, seat),
  };
}

export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  research: researchObs,
  policy: policyObs,
  war: warObs,
};
