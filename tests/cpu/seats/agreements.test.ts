/** THE DIPLOMATIC AGREEMENTS, TypeScript half.
 *
 * Sourced from the Civ 6 wiki (Diplomacy, Alliance, Movement, Archaeologist):
 *   - "All of them have limited duration of 30 turns, after which they have to
 *     be renewed."
 *   - Friendship runs 30 turns and Declared Friends "cannot undertake hostile
 *     actions (such as Denouncing or going to war) against each other".
 *   - "Alliances become possible after developing the Civil Service civic. You
 *     can only enter into an Alliance with a civilization if you and its
 *     leader are Declared Friends." Allies "automatically have Open Borders",
 *     and in GS each alliance pays "+1 Diplomatic Favor per turn per level".
 *   - "A Denunciation lasts for 30 turns, after which its effects expire" and
 *     "Five turns after denouncing a rival, you gain a Formal War Casus Belli".
 *   - "Granting open borders to a rival doesn't mean that rival also grants
 *     open borders to you", and the grant "becomes available" with Early
 *     Empire — the civic that closed the border.
 *   - "units of one civ may only enter the territory of another civ if they
 *     have granted them Open Borders"; "Traders ignore borders" and so do
 *     religious units.
 *
 * The GPU twin is `tests/gpu/geopolitics_test.py`'s pokes i, i2 and i3.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import {
  allyTurnsWith, borderTurnsFrom, denounceActive, denounceCasusBelli, emptySeat,
  friendTurnsWith, seatsAllied, setAllyTurnsWith, setBorderTurnsFrom, setFriendTurnsWith,
  setTileOwner, setWar, tileSeat, warIsFormal,
} from '../../../cpu/core/seats';
import { borderClosedTo, spawnUnit, tileFreeForUnit } from '../../../cpu/core/units';
import { diplomaticFavorPerTurn, allianceCount } from '../../../cpu/core/seatTurn';
import { gwCount } from '../../../cpu/data/greatPeople';
import {
  AGREEMENT_TURNS, ALLIANCE_CIVIC, FAVOR_PER_ALLIANCE, FORMAL_WAR_MIN_TURNS, OPEN_BORDERS_CIVIC,
} from '../../../cpu/data/seats';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat, SeatActionRecord } from '../../../cpu/core/types';
import { grievanceWith } from '../../../cpu/core/grievance';

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  const city: City = {
    id: s.nextCityId++, name: `City${seat}`, seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seat, city.id);
  s.cities.push(city);
  if (state.seats.length <= seat) state.seats.length = seat;
  state.seats[seat] = s;
  return s;
}

function table(width = 20): GameState {
  const state = makeState(makeMap(width, 12, 'GRASSLAND'));
  state.seats = [];
  addSeat(state, 0, 3, 6);
  addSeat(state, 1, 9, 6);
  addSeat(state, 2, 15, 6);
  return state;
}

/** An agreement signed THIS turn has already paid its first tick by the time
 *  the phase ends: the verbs run at the head of `seatPhase` and the pair
 *  countdown at its tail, exactly as the peace treaty does. */
const SIGNED = AGREEMENT_TURNS - 1;

const REC = (over: Partial<SeatActionRecord>): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], ...over });

function play(state: GameState, recs: Record<number, Partial<SeatActionRecord>>): void {
  state.seatActions = {
    [state.turn - 1]: Object.fromEntries(
      Object.entries(recs).map(([k, v]) => [k, REC(v)]),
    ),
  };
  seatPhase(state);
}

describe('the agreements run on one 30-turn clock', () => {
  it('a Declaration of Friendship is symmetric and blocks the hostile verbs', () => {
    const state = table();
    play(state, { 1: { friend: [2] } });
    expect(friendTurnsWith(state, 1, 2)).toBe(SIGNED);
    expect(friendTurnsWith(state, 2, 1)).toBe(SIGNED);

    play(state, { 1: { denounce: [2] } });
    expect(denounceActive(state, 1, 2)).toBe(false);

    const targets = state.seats[1].wars;
    play(state, { 1: { war: 1 } }); // the declare column against seat 2
    expect(targets).toEqual([]);
  });

  it('an alliance needs the civic AND a Declared Friend, and pays favor', () => {
    const state = table();
    play(state, { 1: { ally: [2] } });
    expect(seatsAllied(state, 1, 2)).toBe(false);

    setFriendTurnsWith(state, 1, 2, AGREEMENT_TURNS);
    play(state, { 1: { ally: [2] } });
    expect(seatsAllied(state, 1, 2)).toBe(false); // still no Civil Service

    state.seats[1].research.civics.push(ALLIANCE_CIVIC);
    play(state, { 1: { ally: [2] } });
    expect(allyTurnsWith(state, 1, 2)).toBe(SIGNED);
    expect(allyTurnsWith(state, 2, 1)).toBe(SIGNED);

    expect(allianceCount(state, 1)).toBe(1);
    expect(diplomaticFavorPerTurn(null, 0, 0, 0, 1)
      - diplomaticFavorPerTurn(null, 0, 0, 0, 0)).toBe(FAVOR_PER_ALLIANCE);
  });

  it('a denouncement expires at the agreement term, and its casus belli with it', () => {
    const state = table();
    state.turn = 50;
    play(state, { 1: { denounce: [2] } });
    const stamped = state.seats[1].denounced[2];
    expect(stamped).toBe(50); // the stamp IS the clock, and it starts now

    state.turn = stamped + FORMAL_WAR_MIN_TURNS - 1;
    expect(denounceCasusBelli(state, 1, 2)).toBe(false);
    state.turn = stamped + FORMAL_WAR_MIN_TURNS;
    expect(denounceCasusBelli(state, 1, 2)).toBe(true);
    state.turn = stamped + AGREEMENT_TURNS;
    expect(denounceActive(state, 1, 2)).toBe(false);
    expect(denounceCasusBelli(state, 1, 2)).toBe(false);
  });

  it('an old grudge makes the war FORMAL and an expired one does not', () => {
    for (const [age, formal] of [[FORMAL_WAR_MIN_TURNS, true], [AGREEMENT_TURNS, false]] as const) {
      const state = table();
      state.turn = 100;
      state.seats[1].denounced[2] = state.turn - age;
      play(state, { 1: { war: 1 } });
      expect(state.seats[1].wars).toContain(2);
      expect(warIsFormal(state, 1, 2)).toBe(formal);
    }
  });

  it('the border grant is DIRECTED, needs the grantor’s civic, and dies with the peace', () => {
    const state = table();
    play(state, { 1: { borders: [2] } });
    expect(borderTurnsFrom(state, 1, 2)).toBe(0);

    state.seats[1].research.civics.push(OPEN_BORDERS_CIVIC);
    play(state, { 1: { borders: [2] } });
    expect(borderTurnsFrom(state, 1, 2)).toBe(SIGNED);
    expect(borderTurnsFrom(state, 2, 1)).toBe(0);

    setBorderTurnsFrom(state, 2, 1, AGREEMENT_TURNS);
    play(state, { 1: { war: 1 } });
    expect(state.seats[1].wars).toContain(2);
    expect(borderTurnsFrom(state, 1, 2)).toBe(0);
    expect(borderTurnsFrom(state, 2, 1)).toBe(0);
  });

  it('every clock counts down once per pair per turn and expires at zero', () => {
    const state = table();
    setFriendTurnsWith(state, 1, 2, 2);
    setAllyTurnsWith(state, 1, 2, 2);
    setBorderTurnsFrom(state, 1, 2, 2);
    setBorderTurnsFrom(state, 2, 1, 1);
    play(state, {});
    expect(friendTurnsWith(state, 1, 2)).toBe(1);
    expect(allyTurnsWith(state, 1, 2)).toBe(1);
    expect(borderTurnsFrom(state, 1, 2)).toBe(1);
    expect(borderTurnsFrom(state, 2, 1)).toBe(0);
    play(state, {});
    expect(seatsAllied(state, 1, 2)).toBe(false);
    expect(borderTurnsFrom(state, 2, 1)).toBe(0);
  });

  it('an ally of the VICTIM is dragged into the war and an ally of the aggressor is not', () => {
    const state = table();
    setAllyTurnsWith(state, 0, 2, AGREEMENT_TURNS);
    play(state, { 1: { war: 1 } });
    expect(state.seats[1].wars).toContain(2);
    expect(state.seats[0].wars).toContain(1);
    expect(warIsFormal(state, 0, 1)).toBe(true);
    expect(grievanceWith(state, 2, 0)).toBe(0);  // the dragged ally chose nothing

    const s2 = table();
    setAllyTurnsWith(s2, 0, 1, AGREEMENT_TURNS);
    play(s2, { 1: { war: 1 } });
    expect(s2.seats[1].wars).toContain(2);
    expect(s2.seats[0].wars).not.toContain(2);
  });
});

describe('the closed border', () => {
  it('opens only for war, an ally, the owner’s own grant, or a unit that ignores it', () => {
    const state = table();
    const foreign = state.map.tiles.find((t) => tileSeat(t) === 2)!;
    expect(borderClosedTo(state, 1, foreign)).toBe(false); // no Early Empire yet

    state.seats[2].research.civics.push(OPEN_BORDERS_CIVIC);
    expect(borderClosedTo(state, 1, foreign)).toBe(true);
    expect(borderClosedTo(state, 2, foreign)).toBe(false);

    setBorderTurnsFrom(state, 1, 2, AGREEMENT_TURNS); // the wrong direction
    expect(borderClosedTo(state, 1, foreign)).toBe(true);
    setBorderTurnsFrom(state, 2, 1, AGREEMENT_TURNS);
    expect(borderClosedTo(state, 1, foreign)).toBe(false);
    setBorderTurnsFrom(state, 2, 1, 0);

    setAllyTurnsWith(state, 1, 2, AGREEMENT_TURNS);
    expect(borderClosedTo(state, 1, foreign)).toBe(false);
    setAllyTurnsWith(state, 1, 2, 0);

    setWar(state, 1, 2, true);
    expect(borderClosedTo(state, 1, foreign)).toBe(false);
    setWar(state, 1, 2, false);

    expect(borderClosedTo(state, 1, foreign, 'WARRIOR')).toBe(true);
    expect(borderClosedTo(state, 1, foreign, 'TRADER')).toBe(false);
    expect(borderClosedTo(state, 1, foreign, 'MISSIONARY')).toBe(false);
    expect(borderClosedTo(state, 1, foreign, 'APOSTLE')).toBe(false);
  });

  it('refuses the step that would cross it', () => {
    const state = table();
    state.unitsMode = true;
    state.seats[2].research.civics.push(OPEN_BORDERS_CIVIC);
    const foreign = state.map.tiles.find((t) => tileSeat(t) === 2 && !t.district)!;
    const unit = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 6).index, 1)!;
    expect(tileFreeForUnit(state, foreign.index, 1, unit)).toBe(false);
    setBorderTurnsFrom(state, 2, 1, AGREEMENT_TURNS);
    expect(tileFreeForUnit(state, foreign.index, 1, unit)).toBe(true);
  });
});

describe('a Great Work changes hands', () => {
  it('leaves the giver, lands in the taker, and carries its provenance', () => {
    const state = table();
    const from = state.seats[1].cities[0];
    const home = state.seats[2].cities[0];
    from.buildings.push('MUSEUM');
    home.buildings.push('MUSEUM');
    from.greatWorksArt = 1;
    from.gwArtType = [4, -1, -1];
    from.gwArtArtist = [2, -1, -1];

    play(state, { 1: { gift: [[1, 2]] } });
    expect(gwCount(from, 1)).toBe(0);
    expect(gwCount(home, 1)).toBe(1);
    expect(from.gwArtType![0]).toBe(-1);
    expect(home.gwArtType![0]).toBe(4);
    expect(home.gwArtArtist![0]).toBe(2);
  });

  it('gives nothing away at war, and nothing it does not hold', () => {
    const state = table();
    const from = state.seats[1].cities[0];
    const home = state.seats[2].cities[0];
    from.buildings.push('MUSEUM');
    home.buildings.push('MUSEUM');
    from.greatWorksArt = 1;
    setWar(state, 1, 2, true);
    play(state, { 1: { gift: [[1, 2]] } });
    expect(gwCount(from, 1)).toBe(1);

    setWar(state, 1, 2, false);
    from.greatWorksArt = 0;
    play(state, { 1: { gift: [[1, 2]] } });
    expect(gwCount(home, 1)).toBe(0);
  });
});
