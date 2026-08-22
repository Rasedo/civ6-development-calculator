
import type { City, GameState, QueueItem } from './types';
import { seatOf, civsAtWar, seatsAllied } from './seats';
import { isSuzerain } from './cityStates';
import { seatTourism } from './city';
import { computeAdoption } from './effects';
import { selectResearch } from './economy';
import { GOVERNMENTS, GOVERNMENTS_ADOPTION_LIVE, POLICY_LIST } from '../data/policies';
import { DIPLO_FAVOR_PER_SUZERAIN, FAVOR_OCCUPIED_CAPITAL, FAVOR_PER_ALLIANCE } from '../data/seats';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { emergencyEnvoyGold } from './emergency';
import { congressPolicyBlocked, congressPolicyFavor, congressSuzFavorMult } from './congress';
import { wonderExtraSlots } from './effects';

/** Suzerained city-states, each weighted by what TREATY ORGANIZATION does to
 *  the favor its TYPE pays — x2 on outcome A, x0 on B, 1 while nothing
 *  stands. Unweighted this is a plain count. */
export function suzerainCount(state: GameState, seat: number): number {
  return state.cityStates.reduce(
    (n, cityState) => n + (isSuzerain(cityState, seat)
      ? congressSuzFavorMult(state, CITY_STATE_TYPES.indexOf(cityState.type)) : 0), 0);
}

export function diplomaticFavorPerTurn(gov: string | null, suzerains: number, treaty = 0,
                                       occupiedCapitals = 0, alliances = 0): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains + treaty
    + FAVOR_PER_ALLIANCE * alliances
    - FAVOR_OCCUPIED_CAPITAL * occupiedCapitals;
}

/** CIV6 (Alliance): "In Gathering Storm, each Alliance gives you +1
 *  Diplomatic Favor per turn per level." Levels are not modeled, so every
 *  live alliance pays the level-1 rate. */
export function allianceCount(state: GameState, seat: number): number {
  return state.seats.reduce((n, o) => n + (o.seat !== seat && seatsAllied(state, seat, o.seat) ? 1 : 0), 0);
}

/** Original capitals this seat holds that it did not found — the -5/turn
 *  each. A city whose founder is gone still counts: the penalty is for
 *  sitting in it, not for who is left to resent it. */
export function occupiedCapitals(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  return s.cities.reduce((n, c) => n + ((c.origCapitalSeat ?? -1) >= 0
    && (c.origCapitalSeat ?? -1) !== seat ? 1 : 0), 0);
}

/** POLICY TREATY outcome A pays every seat holding the named card. */
function policyTreatyFavor(state: GameState, seat: number): number {
  const sx = seatOf(state, seat);
  if (!sx) return 0;
  const held: number[] = [];
  for (const id of computeAdoption(sx.research, wonderExtraSlots(state, seat), congressPolicyBlocked(state)).policies) {
    const i = id ? POLICY_LIST.findIndex((card) => card.id === id) : -1;
    if (i >= 0) held.push(i);
  }
  return congressPolicyFavor(state, held);
}

export function seatGovernmentId(state: GameState, seat: number): string | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  return GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(s.research).government : s.government.current;
}

export function atPeaceWithAllCivs(state: GameState, seat: number): boolean {
  for (let other = 0; other < state.seats.length; other++) {
    if (other !== seat && civsAtWar(state, seat, other)) return false;
  }
  return true;
}

/** CIV6 (City-State Emergency, success): "+1 Gold/turn for each Envoy they
 *  have" — every envoy this seat has placed, not just the ones at the minor
 *  the emergency was about. */
function emergencyEnvoyIncome(state: GameState, seat: number): number {
  const placed = state.cityStates.reduce((n, cs) => n + (cs.envoys[seat] ?? 0), 0);
  return emergencyEnvoyGold(state, seat, placed);
}

export function seatAccumulators(state: GameState, seat: number, govCityIds?: ReadonlySet<number>): void {
  const s = seatOf(state, seat);
  if (!s) return;
  s.treasury = (s.treasury ?? 0) + emergencyEnvoyIncome(state, seat);
  s.tourism = (s.tourism ?? 0) + seatTourism(state, seat, govCityIds);
  s.diplomaticFavor = Math.max(0, (s.diplomaticFavor ?? 0)
    + diplomaticFavorPerTurn(seatGovernmentId(state, seat), suzerainCount(state, seat),
                             policyTreatyFavor(state, seat), occupiedCapitals(state, seat),
                             allianceCount(state, seat)));
  if ((s.warmonger ?? 0) > 0 && atPeaceWithAllCivs(state, seat)) {
    s.warmonger = (s.warmonger ?? 0) - 1;
  }
}

export function seatGrowth(city: City, surplus: number, growthNeeded: number): void {
  city.foodBox += surplus;
  if (city.foodBox >= growthNeeded) {
    city.population += 1;
    city.foodBox -= growthNeeded;
  } else if (city.foodBox < 0) {
    city.population = Math.max(1, city.population - 1);
    city.foodBox = 0;
  }
}

export function commitProduction(state: GameState, seat: number, city: City, item: QueueItem): void {
  city.queue.push(item);
  if (process.env.CIV6_ALOG) {
    const what =
      item.kind === 'unit' ? item.unit
      : item.kind === 'building' ? item.building
      : item.kind === 'district' ? item.district
      : item.kind === 'wonder' ? item.wonder
      : item.kind === 'project' ? item.project
      : item.kind;
    console.error(`ALOG t${state.turn} s${seat} prod city=${city.id} ${item.kind}:${what}`);
  }
}


export function commitResearch(state: GameState, seat: number, kind: 'tech' | 'civic', id: string | null): void {
  const s = seatOf(state, seat);
  if (!s) return;
  selectResearch(s.research, id, kind === 'civic');
  if (process.env.CIV6_ALOG && id !== null) {
    console.error(`ALOG t${state.turn} s${seat} ${kind} ${id}`);
  }
}

export function logUnitOrder(state: GameState, seat: number, unitId: number, verb: string, tileIndex: number): void {
  if (process.env.CIV6_ALOG) {
    console.error(`ALOG t${state.turn} s${seat} ${verb} unit=${unitId} tile=${tileIndex}`);
  }
}
