import { describe, it, expect } from 'vitest';
import { followersOf, followedReligionOf, ATHEISM_PRESSURE_PER_POP, FOUNDER_BELIEFS } from '../../../cpu/data/religion';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, majorityReligionOf, dominantReligionOf, BARB_SEAT } from '../../../cpu/core/seats';
import { rosterCS, conquistadorConvert } from '../../../cpu/core/combat';
import { sameReligionToken, founderBeliefOf } from '../../../cpu/core/effects';
import { placeCityStateAt } from '../../../cpu/core/cityStates';
import { spawnUnit } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { City, GameState } from '../../../cpu/core/types';

// A city's MAJORITY religion, measured live (lab 2 scene E, eight draws
// including the decider; tools/civ6lab/runs/religion_20260920T183900Z.jsonl).
// Religion ids here follow the game's order: CATH < PROT < BUD. The rows pass
// the UNCONVERTED pressure the game reported (an accumulator the live game
// keeps — 300 at pop 2 after a shrink — where this engine derives 50 × pop).
const CATH = 0;
const PROT = 1;
const BUD = 2;

describe('followers — pop × pressure share, rounded, forced to sum to pop', () => {
  it('NGAZARGAMU pop 9: CATH 1, PROT 2, BUD 4, none 2 (the largest-remainder allocation)', () => {
    expect(followersOf([212, 641, 940], 9, 400)).toEqual([1, 2, 4, 2]);
  });
  it('STAVANGER pop 6, one Catholic spread: CATH 3, none 3', () => {
    expect(followersOf([220], 6, 300)).toEqual([3, 3]);
  });
  it('STAVANGER pop 3, three groups: one citizen each', () => {
    expect(followersOf([359, 710], 3, 300)).toEqual([1, 1, 1]);
  });
  it('the engine derives the unconverted pressure at 50 per citizen; pop 0 seats nobody', () => {
    expect(ATHEISM_PRESSURE_PER_POP).toBe(50);
    expect(followersOf([], 4)).toEqual([4]);
    expect(followersOf([100], 2)).toEqual([1, 1]);   // 100 vs 100: the remainder tie goes to the lower id
    expect(followersOf([100], 0)).toEqual([0, 0]);
  });
});

describe('the majority — most followers, ties by pressure, at least half the citizens', () => {
  it('NGAZARGAMU: BUD leads on both counts and still fails the half-gate (2 × 4 < 9)', () => {
    expect(followedReligionOf([212, 641, 940], 9, 400)).toBe(-1);
  });
  it('STAVANGER draw 1, pop 6: a 3-3 tie with the unconverted goes to their pressure — no majority', () => {
    expect(followedReligionOf([220], 6, 300)).toBe(-1);
  });
  it('STAVANGER draw 3, pop 2: the same shape with the pressure order flipped — Protestantism', () => {
    expect(followedReligionOf([0, 880], 2, 300)).toBe(PROT);
  });
  it('STAVANGER draw 4, pop 3: the pressure winner is a religion, yet 2 × 1 < 3', () => {
    expect(followedReligionOf([359, 710], 3, 300)).toBe(-1);
  });
  it('STAVANGER draws 5 and 6, pop 2: a 1-1 tie between religions goes to the higher PRESSURE, not the lower id', () => {
    expect(followedReligionOf([579, 532], 2, 0)).toBe(CATH);
    expect(followedReligionOf([434, 752], 2, 0)).toBe(PROT);   // the decider
  });
  it('through the engine\'s own unconverted term: a religion holding every citizen of a one-pop city is its majority; pop 0 is nobody\'s', () => {
    expect(followedReligionOf([0, 0, 300], 1)).toBe(BUD);
    expect(followedReligionOf([300], 0)).toBe(-1);
    // exactly half the citizens is enough; the unconverted at equal followers and higher pressure is not
    expect(followedReligionOf([100], 2)).toBe(CATH);        // 1-1, 100 vs 100: the lower id
    expect(followedReligionOf([90], 2)).toBe(-1);           // 1-1, 90 vs 100: the unconverted
  });
});

// ── THE SEAT'S MAJORITY (GetReligionInMajorityOfCities, measured): strictly
// more than half of the player's cities share a majority; a city with none
// counts in the denominator; a seat that founded nothing can hold one. ONE
// composer (`majorityReligionOf`) for the four readers below.
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function twoSeats(row0: number): GameState {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row0;
  state.seats[1].civ = seatRow('AMERICA');
  state.unitsMode = true;
  return state;
}

/** cities for `seat`, following `follow` (null = no majority) */
function cities(state: GameState, seat: number, follow: (number | null)[]): City[] {
  const spots = seat === 0 ? [[3, 3], [3, 9], [3, 15]] : [[15, 3], [15, 9], [15, 15]];
  return follow.map((g, i) => {
    const c = settleAt(state, tileAtCoords(state.map, spots[i][0], spots[i][1]).index, seat);
    c.followedReligion = g;
    return c;
  });
}

describe('the SEAT majority and its four readers', () => {
  it('more than half of the cities, the majority-less ones in the denominator; a minor by its one city; nobody for the barbarians', () => {
    const state = twoSeats(seatRow('AMERICA'));
    cities(state, 0, [1, 1, null]);
    expect(dominantReligionOf(state.seats[0])).toBe(1);
    expect(majorityReligionOf(state, 0)).toBe(1);
    state.seats[0].cities[1].followedReligion = null;          // 1 of 3
    expect(majorityReligionOf(state, 0)).toBe(-1);
    state.seats[0].cities[1].followedReligion = 0;             // 1-1-none
    expect(majorityReligionOf(state, 0)).toBe(-1);
    expect(majorityReligionOf(state, 1)).toBe(-1);             // no cities at all
    const cs = placeCityStateAt(state, 0, 'CS0', 'religious', tileAtCoords(state.map, 9, 9).index);
    cs.religionPressure = [0, 400];                            // pop 3: 2 followers of 1, 1 unconverted
    expect(majorityReligionOf(state, cs.seat)).toBe(1);
    cs.religionPressure = [0, 100];                            // 100 vs the engine's 150: 1-2, the unconverted
    expect(majorityReligionOf(state, cs.seat)).toBe(-1);
    expect(majorityReligionOf(state, BARB_SEAT)).toBe(-1);
    expect(majorityReligionOf(state, 7)).toBe(-1);
  });

  it('El Escorial: +5 against a player of ANOTHER majority religion — a major or a minor — and nothing when either side has none', () => {
    const state = twoSeats(leaderRow('PHILIP_II'));
    cities(state, 0, [0, 0, null]);
    cities(state, 1, [1, 1, null]);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 3).index, 0)!;
    expect(rosterCS(state, u, 1, 100, false)).toBe(5);
    const cs = placeCityStateAt(state, 0, 'CS0', 'religious', tileAtCoords(state.map, 9, 12).index);
    cs.religionPressure = [0, 400];
    expect(rosterCS(state, u, cs.seat, 100, false)).toBe(5);
    cs.religionPressure = [400];                                // the minor follows Spain's own
    expect(rosterCS(state, u, cs.seat, 100, false)).toBe(0);
    for (const c of state.seats[1].cities) c.followedReligion = 0;   // the foe shares it
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    for (const c of state.seats[1].cities) c.followedReligion = 1;
    state.seats[0].cities[1].followedReligion = null;          // Spain itself has none
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    // another leader — Tamar, who holds no combat-strength row (America's
    // Roosevelt Corollary would pay its own +5 on the home continent)
    const plain = twoSeats(leaderRow('TAMAR'));
    cities(plain, 0, [0, 0, null]);
    cities(plain, 1, [1, 1, null]);
    const w = spawnUnit(plain, 'WARRIOR', tileAtCoords(plain.map, 9, 3).index, 0)!;
    expect(rosterCS(plain, w, 1, 100, false)).toBe(0);
  });

  it("Tamar's duplicate token: one more envoy to a minor whose city follows Georgia's majority", () => {
    const state = twoSeats(leaderRow('TAMAR'));
    cities(state, 0, [0, 0, null]);
    const cs = placeCityStateAt(state, 0, 'CS0', 'religious', tileAtCoords(state.map, 9, 9).index);
    cs.religionPressure = [400];
    expect(sameReligionToken(state, cs, 0)).toBe(1);
    cs.religionPressure = [0, 400];
    expect(sameReligionToken(state, cs, 0)).toBe(0);
    cs.religionPressure = [400];
    state.seats[0].cities[1].followedReligion = null;          // Georgia has no majority
    expect(sameReligionToken(state, cs, 0)).toBe(0);
    const plain = twoSeats(seatRow('AMERICA'));
    cities(plain, 0, [0, 0, null]);
    const cs2 = placeCityStateAt(plain, 0, 'CS0', 'religious', tileAtCoords(plain.map, 9, 9).index);
    cs2.religionPressure = [400];
    expect(sameReligionToken(plain, cs2, 0)).toBe(0);
  });

  it('Mvemba is paid the founder belief of the religion most of his cities follow; everyone else only their own', () => {
    const belief = Object.keys(FOUNDER_BELIEFS)[0];
    const state = twoSeats(leaderRow('MVEMBA'));
    state.seats[1].religion.founded = true;
    state.seats[1].religion.founder = belief;
    cities(state, 0, [1, 1, null]);
    cities(state, 1, [1, 1, 1]);
    expect(founderBeliefOf(state, 1)).toBe(belief);
    expect(founderBeliefOf(state, 0)).toBe(belief);
    state.seats[0].cities[1].followedReligion = null;
    expect(founderBeliefOf(state, 0)).toBeNull();
    const plain = twoSeats(seatRow('AMERICA'));
    plain.seats[1].religion.founded = true;
    plain.seats[1].religion.founder = belief;
    cities(plain, 0, [1, 1, null]);
    expect(founderBeliefOf(plain, 0)).toBeNull();
  });

  it("the Conquistador converts a captured city to its player's MAJORITY — a religion Spain never founded — and nothing without one", () => {
    const state = twoSeats(leaderRow('PHILIP_II'));
    cities(state, 0, [1, 1, null]);
    const [city] = cities(state, 1, [null]);
    const u = spawnUnit(state, 'CONQUISTADOR', city.centerIndex, 0)!;
    expect(state.seats[0].religion.founded).toBe(false);
    conquistadorConvert(state, u, city);
    expect(city.followedReligion).toBe(1);
    city.followedReligion = null;
    state.seats[0].cities[1].followedReligion = null;
    conquistadorConvert(state, u, city);
    expect(city.followedReligion).toBeNull();
  });
});
