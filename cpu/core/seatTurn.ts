
import type { City, GameState, QueueItem, Seat } from './types';
import { seatOf, civsAtWar, seatsAllied } from './seats';
import { decayGrievances, grievanceFavorPenalty, grievanceHeldCapitals } from './grievance';
import { chargeProjectResource, chargeUnitResource } from './stockpile';
import { isSuzerain } from './cityStates';
import { cardFavorPerBuilding, seatTourism, seatTourismReligious, seatBuildingSum, tourismIntlPct } from './city';
import { computeAdoption, inDarkAge } from './effects';
import { selectResearch } from './economy';
import { GOVERNMENTS, GOVERNMENTS_ADOPTION_LIVE, POLICY_LIST } from '../data/policies';
import { DIPLO_FAVOR_PER_SUZERAIN, FAVOR_OCCUPIED_CAPITAL, FAVOR_PER_ALLIANCE, ENLIGHTENMENT_CIVIC, TOURISM_RELIGIOUS_PENALTY_PCT } from '../data/seats';
import { seatWonderFlag } from './wonders';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { emergencyEnvoyGold } from './emergency';
import { pollutionFavorPenalty } from './climate';
import { congressPolicyBlocked, congressPolicyFavor, congressSuzFavorMult } from './congress';
import { wonderExtraSlots } from './effects';

/** Suzerained city-states, each weighted by what TREATY ORGANIZATION does to
 *  the favor its TYPE pays — x2 on outcome A, x0 on B, 1 while nothing
 *  stands. Unweighted this is a plain count. */
export function suzerainCount(state: GameState, seat: number): number {
  return state.cityStates.reduce(
    (n, cityState) => n + (isSuzerain(state, cityState, seat)
      ? congressSuzFavorMult(state, CITY_STATE_TYPES.indexOf(cityState.type)) : 0), 0);
}

export function diplomaticFavorPerTurn(gov: string | null, suzerains: number, treaty = 0,
                                       occupiedCapitals = 0, alliances = 0,
                                       buildings = 0, pollution = 0, grievances = 0): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains + treaty
    + FAVOR_PER_ALLIANCE * alliances + buildings
    - FAVOR_OCCUPIED_CAPITAL * occupiedCapitals - pollution - grievances;
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
  for (const id of computeAdoption(sx.research, wonderExtraSlots(state, seat), congressPolicyBlocked(state), inDarkAge(state, seat), sx.government.held).policies) {
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
  const natGeneral = seatTourism(state, seat, govCityIds);
  const natReligious = seatTourismReligious(state, seat);
  s.tourism = (s.tourism ?? 0) + natGeneral;
  s.tourismReligious = (s.tourismReligious ?? 0) + natReligious;
  bankTourismPerRival(state, s, natGeneral, natReligious);
  s.diplomaticFavor = Math.max(0, (s.diplomaticFavor ?? 0)
    + diplomaticFavorPerTurn(seatGovernmentId(state, seat), suzerainCount(state, seat),
                             policyTreatyFavor(state, seat), occupiedCapitals(state, seat),
                             allianceCount(state, seat),
                             seatBuildingSum(state, seat, 'favorPerTurn') + cardFavorPerBuilding(state, seat),
                             pollutionFavorPenalty(state, seat),
                             grievanceFavorPenalty(state, seat)));
  // The GRIEVANCE ledger's own turn: what this seat is still owed decays
  // pairwise (once per pair, on its lower seat), and every original capital it
  // sits in keeps charging while that war is over.
  grievanceHeldCapitals(state, seat);
  decayGrievances(state, seat);
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
  if (item.kind === 'unit') chargeUnitResource(state, seat, item.unit, city);
  else if (item.kind === 'project') chargeProjectResource(state, seat, item.project);
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

/**
 * The national output lands on EACH foreign civ through its own summed
 * international modifier (`tourismIntlPct`), and the two sourced
 * RELIGIOUS-ONLY halvings — "-50% for Different Religions", which "doesn't
 * apply if you haven't founded a religion", and "-50% if the foreign
 * civilization has The Enlightenment", which Cristo Redentor's shield
 * cancels — are summed into the religious half's own percent. A total below
 * -100% pays nothing rather than draining the bank.
 */
function bankTourismPerRival(state: GameState, s: Seat, general: number, religious: number): void {
  const n = state.seats.length;
  s.tourismTo ??= [];
  s.tourismReligiousTo ??= [];
  const shielded = seatWonderFlag(state, s.seat, 'holyTourismShield');
  for (let o = 0; o < n; o++) {
    if (o === s.seat) continue;
    const other = state.seats[o];
    if (!other) continue;
    const pct = tourismIntlPct(state, s.seat, o);
    let relPct = pct;
    if (other.research.civics.includes(ENLIGHTENMENT_CIVIC) && !shielded) relPct -= TOURISM_RELIGIOUS_PENALTY_PCT;
    const dom = dominantReligionOf(other);
    if (s.religion.founded && dom >= 0 && dom !== s.seat) relPct -= TOURISM_RELIGIOUS_PENALTY_PCT;
    s.tourismTo[o] = (s.tourismTo[o] ?? 0) + Math.floor(general * Math.max(0, 100 + pct) / 100);
    s.tourismReligiousTo[o] = (s.tourismReligiousTo[o] ?? 0)
      + Math.floor(religious * Math.max(0, 100 + relPct) / 100);
  }
}

/** The religion MORE THAN HALF of a seat's cities follow, or -1 — religion
 *  ids are founder seat ids, so at most one can pass the bar. */
export function dominantReligionOf(s: { cities: { followedReligion?: number | null }[] }): number {
  const n = s.cities.length;
  const count = new Map<number, number>();
  for (const c of s.cities) {
    if (c.followedReligion == null || c.followedReligion < 0) continue;
    count.set(c.followedReligion, (count.get(c.followedReligion) ?? 0) + 1);
  }
  for (const [g, k] of count) if (k * 2 > n) return g;
  return -1;
}
