
import type { City, GameState, QueueItem, Seat } from './types';
import { logPopWrite } from './difflog';
import { gainPopulationPressure } from '../data/religion';
import { seatOf, allianceLevelWith, alliedAtLevel, dominantReligionOf } from './seats';
import { decayGrievances, grievanceFavorPenalty, grievanceHeldCapitals } from './grievance';
import { chargeProjectResource, chargeUnitResource } from './stockpile';
import { isSuzerain } from './cityStates';
import { cardFavorPerBuilding, seatTourism, seatTourismReligious, seatBuildingSum, tourismIntlPct, lateEraTourism, civEraIndex } from './city';
import { seatGovernment, slottedPolicyIndices } from './effects';
import { selectResearch } from './economy';
import { GOVERNMENTS } from '../data/policies';
import { growthFoodNeeded } from '../data/constants';
import { ALLIANCE_C3_TOUR_PCT, ALLIANCE_CULTURAL, DIPLO_FAVOR_PER_SUZERAIN, FAVOR_OCCUPIED_CAPITAL, FAVOR_PER_ALLIANCE, ENLIGHTENMENT_CIVIC, TOURISM_RELIGIOUS_PENALTY_PCT, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST } from '../data/seats';
import { seatWonderFlag } from './wonders';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { emergencyEnvoyGold } from './emergency';
import { pollutionFavorPenalty } from './climate';
import { congressPolicyFavor, congressSuzFavorMult } from './congress';
import { tourismFavorOf, slotFavorOf } from './effects';

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
 *  Diplomatic Favor per turn per level" - the LEVEL sum over live
 *  alliances. */
export function allianceLevels(state: GameState, seat: number): number {
  return state.seats.reduce((n, o) => n + (o.seat !== seat ? allianceLevelWith(state, seat, o.seat) : 0), 0);
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
  // the cards the seat CHOSE (a driver decision), not a fill of its own
  return congressPolicyFavor(state, slottedPolicyIndices(state, seat));
}

/** CIV6 (City-State Emergency, success): "+1 Gold/turn for each Envoy they
 *  have" — every envoy this seat has placed, not just the ones at the minor
 *  the emergency was about. Banked with the seat's gold. */
export function emergencyEnvoyIncome(state: GameState, seat: number): number {
  const placed = state.cityStates.reduce((n, cs) => n + (cs.envoys[seat] ?? 0), 0);
  return emergencyEnvoyGold(state, seat, placed);
}

export function seatAccumulators(state: GameState, seat: number, govCityIds?: ReadonlySet<number>): void {
  const s = seatOf(state, seat);
  if (!s) return;
  let natGeneral = seatTourism(state, seat, govCityIds);
  const natReligious = seatTourismReligious(state, seat);
  // CIV6 (Film Studio): the per-rival extra, read with the same snapshot
  const late = lateEraTourism(state, seat, govCityIds);
  // stored before the ally reads below, so the terms never compound
  s.tourRate = natGeneral + natReligious;
  // CIV6 (Cultural alliance 3): "+20% of your ally's Tourism".
  for (const o of state.seats) {
    if (o.seat !== seat && alliedAtLevel(state, seat, o.seat, ALLIANCE_CULTURAL, 3)) {
      natGeneral += Math.floor(ALLIANCE_C3_TOUR_PCT * (o.tourRate ?? 0));
    }
  }
  s.tourism = (s.tourism ?? 0) + natGeneral;
  s.tourismReligious = (s.tourismReligious ?? 0) + natReligious;
  bankTourismPerRival(state, s, natGeneral, natReligious, late);
  updateCulturalDominance(state.seats, s);
  s.diplomaticFavor = Math.max(0, (s.diplomaticFavor ?? 0)
    + diplomaticFavorPerTurn(seatGovernment(state, seat), suzerainCount(state, seat),
                             policyTreatyFavor(state, seat), occupiedCapitals(state, seat),
                             allianceLevels(state, seat),
                             seatBuildingSum(state, seat, 'favorPerTurn') + cardFavorPerBuilding(state, seat),
                             pollutionFavorPenalty(state, seat),
                             grievanceFavorPenalty(state, seat)));
  // CIV6 (Faces of Peace): "For every 100 Tourism per turn earn 1 Diplomatic
  // Favor per turn" — this turn's OWN rate, the number stored just above
  // (`TOURISM_FAVOR_ROWS`)
  s.diplomaticFavor += tourismFavorOf(state, seat, s.tourRate ?? 0);
  // CIV6 (Founding Fathers): "+1 Diplomatic Favor per turn for every Wildcard
  // slot in their government" (`SLOT_FAVOR_ROWS`)
  s.diplomaticFavor += slotFavorOf(state, seat);
  // The GRIEVANCE ledger's own turn: what this seat is still owed decays
  // pairwise (once per pair, on its lower seat), and every original capital it
  // sits in keeps charging while that war is over.
  grievanceHeldCapitals(state, seat);
  decayGrievances(state, seat);
}

export function seatGrowth(city: City, surplus: number, growthNeeded: number, turn = 0): void {
  city.foodBox += surplus;
  if (city.foodBox >= growthNeeded) {
    gainPopulationPressure(city, 1);
    city.population += 1;
    logPopWrite(turn, city, 'gr');
    city.foodBox -= growthNeeded;
  } else if (city.foodBox < 0) {
    // CIV6: a starving city loses a citizen and its box stands at the new
    // size's threshold plus the turn's (negative) surplus (the six duels'
    // records, 43 of 43 starvations: runs/h1_duelw1108 Taiyuan t220, pop 7
    // -> 6 on -2 Food, the box 0.86 -> 31 = 33 - 2); a one-citizen city keeps
    // its citizen and an empty box
    if (city.population > 1) {
      city.population -= 1;
      city.foodBox = growthFoodNeeded(city.population) + surplus;
    } else city.foodBox = 0;
    logPopWrite(turn, city, 'sv');
  }
}

export function commitProduction(state: GameState, seat: number, city: City, item: QueueItem): void {
  // CIV6 (Formations): a DIRECT-trained Corps pays double the chassis'
  // strategic resource and an Army triple; a merge pays nothing.
  if (item.kind === 'unit') chargeUnitResource(state, seat, item.unit, city, item.formation ?? 0);
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
function bankTourismPerRival(
  state: GameState, s: Seat, general: number, religious: number,
  late: { extra: number; minEra: number } | null = null,
): void {
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
    // CIV6 (Film Studio, FILMSTUDIO_ENHANCEDLATETOURISM): the extra lands on
    // a rival in the Modern era or later, through the same percent
    const gen = late && civEraIndex(other.research.techs, other.research.civics) >= late.minEra
      ? general + late.extra : general;
    s.tourismTo[o] = (s.tourismTo[o] ?? 0) + Math.floor(gen * Math.max(0, 100 + pct) / 100);
    s.tourismReligiousTo[o] = (s.tourismReligiousTo[o] ?? 0)
      + Math.floor(religious * Math.max(0, 100 + relPct) / 100);
  }
}

/** A seat's citizens (PlayerCulture 0x3a1fb0): lifetime culture over
 *  TOURISM_CULTURE_PER_CITIZEN, floored. Culture is milli-rounded before the
 *  floor so a sub-milli float drift cannot move a count across engines. */
export function seatCitizens(s: Seat): number {
  return Math.floor(Math.round((s.cultureTotal ?? 0) * 1000) / 1000 / CULTURE_PER_DOMESTIC_TOURIST);
}

/** The tourists `p`'s banked tourism toward `o` would move, before `o`'s
 *  citizens cap them (0x399b90's term): the bank over
 *  TOURISM_TOURISM_TO_MOVE_CITIZEN, then over the number of majors. */
function rawTourists(seats: readonly Seat[], p: Seat, o: number): number {
  const bank = (p.tourismTo?.[o] ?? 0) + (p.tourismReligiousTo?.[o] ?? 0);
  return Math.floor(Math.floor(bank / TOURISM_PER_VISITOR_PER_CIV) / seats.length);
}

/** The tourists `p` draws from `o` among the majors `seats` (0x394fa0): its
 *  raw count, scaled by `o`'s citizens over every major's raw count toward
 *  `o` when those exceed the citizens. */
export function touristsDrawn(seats: readonly Seat[], p: Seat, o: Seat): number {
  if (p.seat === o.seat) return 0;
  const raw = rawTourists(seats, p, o.seat);
  let demand = 0;
  for (const q of seats) if (q.seat !== o.seat) demand += rawTourists(seats, q, o.seat);
  const cit = seatCitizens(o);
  return cit < demand ? Math.floor(raw * cit / Math.max(demand, 1)) : raw;
}

/** A seat's DOMESTIC tourists (the staycationers, +0x10b0): its citizens
 *  less every tourist the other majors draw from it. */
export function domesticTourists(seats: readonly Seat[], o: Seat): number {
  let taken = 0;
  for (const p of seats) taken += touristsDrawn(seats, p, o);
  return seatCitizens(o) - taken;
}

/** A seat's VISITING tourists (0x39bee0): the tourists it draws from every
 *  other major. */
export function visitingTourists(seats: readonly Seat[], p: Seat): number {
  let n = 0;
  for (const o of seats) n += touristsDrawn(seats, p, o);
  return n;
}

/** Cultural dominance (0x393af0), on the seat's own turn after its tourism
 *  lands: the seat dominates each other major whose domestic tourists its
 *  visiting tourists exceed, stops below them, and keeps its flag at equal. */
export function updateCulturalDominance(seats: readonly Seat[], s: Seat): void {
  const v = visitingTourists(seats, s);
  s.culturallyDominant ??= [];
  for (const o of seats) {
    if (o.seat === s.seat) continue;
    const d = domesticTourists(seats, o);
    if (v > d) s.culturallyDominant[o.seat] = true;
    else if (v < d) s.culturallyDominant[o.seat] = false;
  }
}
