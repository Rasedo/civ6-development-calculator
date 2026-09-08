/** THE WAR KINDS, TypeScript half.
 *
 * Sourced from the install (Base DiplomaticActions.xml as Expansion1 updates
 * it, Expansion1_Leaders.xml's DiplomaticYieldSource modifiers, the LOC text
 * of each casus belli):
 *   - every `DIPLOACTION_DECLARE_*_WAR` row carries an `InitiatorPrereqCivic`,
 *     a `DenouncementTurnsRequired` and one requirement column
 *     (`RequiresAdjacentEmpires`, `RequiresOccupiedFriendlyCity`, ...), and
 *     three warmonger percents the grievance ledger scales its bases by;
 *   - TRAIT_TERRITORIAL_WAR_PREREQ_OVERRIDE puts Chandragupta's Territorial
 *     War at Military Training, TRAIT_LIBERATION_WAR_PREREQ_OVERRIDE Robert
 *     the Bruce's Liberation War at Defensive Tactics;
 *   - the declarer's buffs run `TurnsActive` 10: +5 Combat Strength and +2
 *     Movement (Arthashastra), +100% Production and +2 Movement (Bannockburn);
 *   - Religious alliance 3: "Bonus Religious Pressure in cities with no
 *     followers of your ally's Religion" (ALLIANCE_RELIGIOUS_PRESSURE, 20).
 *
 * The GPU twin is `tests/gpu/war_kinds_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import {
  emptySeat, setAllianceTypeWith, setAlliancePtsWith, setAllyTurnsWith, setFriendTurnsWith, setTileOwner,
  setWarTurnsWith, setWar, warDeclaredBy, warKindWith, warTurnsWith, civsAtWar,
} from '../../../cpu/core/seats';
import {
  defaultWarKind, warBuffCS, warBuffLive, warBuffMoves, warBuffProdPct, warKindAllowed,
} from '../../../cpu/core/casusBelli';
import { rosterCS } from '../../../cpu/core/combat';
import { spawnUnit, unitFullMoves } from '../../../cpu/core/units';
import { spreadReligiousPressureForTest } from '../../../cpu/core/game';
import { grievanceWith, grievanceWarDeclared } from '../../../cpu/core/grievance';
import { MP_SCALE } from '../../../cpu/data/constants';
import {
  AGREEMENT_TURNS, ALLIANCE_L3_QP, ALLIANCE_RELIGIOUS, ALLIANCE_REL3_PRESSURE_PCT, CIV_LEADERS, DED_TO_ARMS,
  GRIEVANCE_WAR_BASE,
} from '../../../cpu/data/seats';
import {
  FORMAL_WAR_MIN_TURNS, WAR_BUFF_TURNS, WAR_KINDS, WAR_KIND_FORMAL, WAR_KIND_GOLDEN, WAR_KIND_LIBERATION, WAR_KIND_THIRD_PARTY,
  WAR_KIND_RECONQUEST, WAR_KIND_SURPRISE, WAR_KIND_TERRITORIAL,
} from '../../../cpu/data/warKinds';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat, SeatActionRecord } from '../../../cpu/core/types';

function addCity(state: GameState, s: Seat, col: number, row: number, capital: boolean): City {
  const tile = tileAtCoords(state.map, col, row);
  const city: City = {
    id: s.nextCityId++, name: `City${s.seat}-${col}`, seat: s.seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: capital, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, s.seat, city.id);
  s.cities.push(city);
  return city;
}

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  if (state.seats.length <= seat) state.seats.length = seat;
  state.seats[seat] = s;
  addCity(state, s, col, row, true);
  return s;
}

/** three seats in a row, each with a capital and a second city two rows
 *  down — every pair of neighbours has two cities within ten tiles of two */
function table(): GameState {
  const state = makeState(makeMap(24, 14, 'GRASSLAND'));
  state.seats = [];
  state.turn = 100;
  for (const [seat, col] of [[0, 3], [1, 9], [2, 15]] as const) {
    const s = addSeat(state, seat, col, 5);
    addCity(state, s, col, 8, false);
  }
  return state;
}

const REC = (over: Partial<SeatActionRecord>): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], ...over });

function play(state: GameState, recs: Record<number, Partial<SeatActionRecord>>): void {
  state.seatActions = {
    [state.turn - 1]: Object.fromEntries(Object.entries(recs).map(([k, v]) => [k, REC(v)])),
  };
  seatPhase(state);
}

const leader = (id: string) => CIV_LEADERS.findIndex((l) => l.leader === id);
/** seat 1's war column against seat 2: `warTargets(1)` = [0, 2] */
const ON_SEAT_2 = 1;

describe('the war kinds', () => {
  it('the civic gate refuses a kind before its civic, and the roster override lets the leader declare early', () => {
    const state = table();
    state.seats[1].denounced[2] = state.turn - FORMAL_WAR_MIN_TURNS;
    // the requirement holds (two cities each within ten tiles), the civic does not
    expect(warKindAllowed(state, 1, 2, WAR_KIND_TERRITORIAL)).toBe(false);
    play(state, { 1: { war: ON_SEAT_2, warKind: WAR_KIND_TERRITORIAL } });
    expect(civsAtWar(state, 1, 2)).toBe(false);  // a refused kind refuses the war, it never falls back

    state.seats[1].research.civics.push('MOBILIZATION');
    expect(warKindAllowed(state, 1, 2, WAR_KIND_TERRITORIAL)).toBe(true);
    play(state, { 1: { war: ON_SEAT_2, warKind: WAR_KIND_TERRITORIAL } });
    expect(civsAtWar(state, 1, 2)).toBe(true);
    expect(warKindWith(state, 1, 2)).toBe(WAR_KIND_TERRITORIAL);
    expect(warKindWith(state, 2, 1)).toBe(WAR_KIND_TERRITORIAL);
    expect(warDeclaredBy(state, 1, 2)).toBe(true);
    expect(warDeclaredBy(state, 2, 1)).toBe(false);
    // CIV6 (DiplomaticActions.xml, TERRITORIAL_WAR WarmongerPercent 75)
    expect(grievanceWith(state, 2, 1)).toBe(Math.round((GRIEVANCE_WAR_BASE * WAR_KINDS[WAR_KIND_TERRITORIAL].pct[0]) / 100));

    // CIV6 (TRAIT_TERRITORIAL_WAR_PREREQ_OVERRIDE, CIVIC_MILITARY_TRAINING)
    const s2 = table();
    s2.seats[1].denounced[2] = s2.turn - FORMAL_WAR_MIN_TURNS;
    s2.seats[1].research.civics.push('MILITARY_TRAINING');
    expect(warKindAllowed(s2, 1, 2, WAR_KIND_TERRITORIAL)).toBe(false);
    s2.seats[1].civ = leader('CHANDRAGUPTA');
    expect(warKindAllowed(s2, 1, 2, WAR_KIND_TERRITORIAL)).toBe(true);

    // CIV6 (TRAIT_LIBERATION_WAR_PREREQ_OVERRIDE, CIVIC_DEFENSIVE_TACTICS):
    // seat 2 holds a city founded by seat 0, seat 1's friend
    const s3 = table();
    s3.seats[1].denounced[2] = s3.turn - FORMAL_WAR_MIN_TURNS;
    s3.seats[2].cities[1].founderSeat = 0;
    setFriendTurnsWith(s3, 1, 0, AGREEMENT_TURNS);
    s3.seats[1].research.civics.push('DEFENSIVE_TACTICS');
    expect(warKindAllowed(s3, 1, 2, WAR_KIND_LIBERATION)).toBe(false);
    s3.seats[1].civ = leader('ROBERT_THE_BRUCE');
    expect(warKindAllowed(s3, 1, 2, WAR_KIND_LIBERATION)).toBe(true);
    // ...and the requirement is the friend's city, not any occupied one
    s3.seats[2].cities[1].founderSeat = 2;
    expect(warKindAllowed(s3, 1, 2, WAR_KIND_LIBERATION)).toBe(false);
  });

  it('the denouncement may stand in either direction, and the default kind is the cheapest casus belli held', () => {
    const state = table();
    expect(defaultWarKind(state, 1, 2)).toBe(WAR_KIND_SURPRISE);
    // CIV6 (Formal War): "a player that Denounced you or that you have Denounced"
    state.seats[2].denounced[1] = state.turn - FORMAL_WAR_MIN_TURNS;
    expect(warKindAllowed(state, 1, 2, WAR_KIND_FORMAL)).toBe(true);
    expect(defaultWarKind(state, 1, 2)).toBe(WAR_KIND_FORMAL);
    // the To Arms! dedicant's war is a quarter of the formal price, so it wins
    state.seats[1].age = 2;
    (state.seats[1].dedicationPicks ??= []).push(DED_TO_ARMS);
    expect(defaultWarKind(state, 1, 2)).toBe(WAR_KIND_GOLDEN);
    // a city of seat 1's own held by seat 2 opens the free Reconquest war
    state.seats[2].cities[1].founderSeat = 1;
    state.seats[1].research.civics.push('DEFENSIVE_TACTICS');
    expect(defaultWarKind(state, 1, 2)).toBe(WAR_KIND_RECONQUEST);
    play(state, { 1: { war: ON_SEAT_2 } });  // no kind recorded: the default
    expect(warKindWith(state, 1, 2)).toBe(WAR_KIND_RECONQUEST);
    expect(grievanceWith(state, 2, 1)).toBe(0);  // RECONQUEST_WAR WarmongerPercent 0
  });

  it('the 10-turn buff pays on the turn of the declaration and not on the eleventh', () => {
    const state = table();
    state.seats[1].civ = leader('CHANDRAGUPTA');
    state.seats[1].research.civics.push('MILITARY_TRAINING');
    state.seats[1].denounced[2] = state.turn - FORMAL_WAR_MIN_TURNS;
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 6).index, 1)!;
    const theirs = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 15, 6).index, 2)!;
    const movesBefore = unitFullMoves(state, mine);
    expect(rosterCS(state, mine, 2, 100, false)).toBe(0);
    play(state, { 1: { war: ON_SEAT_2, warKind: WAR_KIND_TERRITORIAL } });
    expect(warKindWith(state, 1, 2)).toBe(WAR_KIND_TERRITORIAL);
    expect(warTurnsWith(state, 1, 2)).toBeLessThan(WAR_BUFF_TURNS);
    expect(warBuffLive(state, 1, WAR_KIND_TERRITORIAL)).toBe(true);
    // CIV6 (TRAIT_TERRITORIAL_WAR_COMBAT Amount 5, TRAIT_TERRITORIAL_WAR_MOVEMENT Amount 2)
    expect(warBuffCS(state, 1)).toBe(5);
    expect(rosterCS(state, mine, 2, 100, false)).toBe(5);
    expect(unitFullMoves(state, mine) - movesBefore).toBe(2 * MP_SCALE);
    // the TARGET earns nothing
    expect(warBuffCS(state, 2)).toBe(0);
    expect(rosterCS(state, theirs, 1, 100, false)).toBe(0);
    expect(warBuffMoves(state, 2)).toBe(0);
    // the tenth turn still pays, the eleventh does not
    setWarTurnsWith(state, 1, 2, WAR_BUFF_TURNS - 1);
    expect(warBuffCS(state, 1)).toBe(5);
    setWarTurnsWith(state, 1, 2, WAR_BUFF_TURNS);
    expect(warBuffCS(state, 1)).toBe(0);
    expect(unitFullMoves(state, mine)).toBe(movesBefore);

    // CIV6 (TRAIT_LIBERATION_WAR_PRODUCTION YIELD_PRODUCTION Amount 100)
    const s2 = table();
    s2.seats[1].civ = leader('ROBERT_THE_BRUCE');
    s2.seats[1].research.civics.push('DEFENSIVE_TACTICS');
    s2.seats[1].denounced[2] = s2.turn - FORMAL_WAR_MIN_TURNS;
    s2.seats[2].cities[1].founderSeat = 0;
    setFriendTurnsWith(s2, 1, 0, AGREEMENT_TURNS);
    expect(warBuffProdPct(s2, 1)).toBe(0);
    play(s2, { 1: { war: ON_SEAT_2, warKind: WAR_KIND_LIBERATION } });
    expect(warKindWith(s2, 1, 2)).toBe(WAR_KIND_LIBERATION);
    expect(grievanceWith(s2, 2, 1)).toBe(0);  // LIBERATION_WAR WarmongerPercent 0
    expect(warBuffProdPct(s2, 1)).toBe(100);
    expect(warBuffMoves(s2, 1)).toBe(2);
    setWarTurnsWith(s2, 1, 2, WAR_BUFF_TURNS);
    expect(warBuffProdPct(s2, 1)).toBe(0);
  });

  it("Religious alliance 3 presses 20% harder into a city with none of the ally's religion", () => {
    const build = (): GameState => {
      const state = table();
      for (const g of [0, 1]) {
        const s = state.seats[g];
        s.religion.founded = true;
        s.religion.holyTile = s.cities[0].centerIndex;
        for (const c of s.cities) c.followedReligion = g;
      }
      return state;
    };
    // seat 1's two cities (6 and ~7 tiles from seat 2's capital) press it at
    // 4 (the Holy City) + 1 per turn; seat 0's stand 12 tiles away and press nothing
    const plain = build();
    spreadReligiousPressureForTest(plain);
    const p0 = plain.seats[2].cities[0].religionPressure!;
    expect(p0[1]).toBe(5);
    expect(p0[0]).toBe(0);

    const allied = build();
    setAllianceTypeWith(allied, 0, 1, ALLIANCE_RELIGIOUS);
    setAllyTurnsWith(allied, 0, 1, AGREEMENT_TURNS);
    setAlliancePtsWith(allied, 0, 1, ALLIANCE_L3_QP);
    spreadReligiousPressureForTest(allied);
    const p1 = allied.seats[2].cities[0].religionPressure!;
    expect(p1[1]).toBe(Math.floor((5 * (100 + ALLIANCE_REL3_PRESSURE_PCT)) / 100));

    // ...and not where the ally's religion already has followers
    const seeded = build();
    setAllianceTypeWith(seeded, 0, 1, ALLIANCE_RELIGIOUS);
    setAllyTurnsWith(seeded, 0, 1, AGREEMENT_TURNS);
    setAlliancePtsWith(seeded, 0, 1, ALLIANCE_L3_QP);
    seeded.seats[2].cities[0].religionPressure = [1, 0, 0];
    spreadReligiousPressureForTest(seeded);
    expect(seeded.seats[2].cities[0].religionPressure![1]).toBe(5);
  });
});

describe('the THIRD PARTY war', () => {
  // CIV6 (Expansion1_DiplomaticActions.xml, DIPLOACTION_THIRD_PARTY_WAR):
  // "Join another player's war against a target civilization."
  // InitiatorPrereqCivic CIVIC_FOREIGN_TRADE, NO DenouncementTurnsRequired,
  // WarmongerPercent / Capture / Raze 100 / 100 / 300. `Agreement="true"` is
  // how the UI reaches it, not what it costs — see warKinds.ts.
  const scene = (): GameState => {
    const state = table();
    state.seats[0]!.research.civics.push('FOREIGN_TRADE');
    return state;
  };

  it('carries the install row column for column', () => {
    const d = WAR_KINDS[WAR_KIND_THIRD_PARTY]!;
    expect(d.id).toBe('thirdParty');
    expect(d.civic).toBe('FOREIGN_TRADE');
    expect(d.denounceTurns).toBe(-1); // no denouncement column at all
    expect([...d.pct]).toEqual([100, 100, 300]);
  });

  it('opens only when an ALLY is already at war with the target', () => {
    const state = scene();
    expect(warKindAllowed(state, 0, 1, WAR_KIND_THIRD_PARTY)).toBe(false);
    setAllyTurnsWith(state, 0, 2, 20);
    expect(warKindAllowed(state, 0, 1, WAR_KIND_THIRD_PARTY)).toBe(false); // ally at peace
    setWar(state, 2, 1, true);
    expect(warKindAllowed(state, 0, 1, WAR_KIND_THIRD_PARTY)).toBe(true);
  });

  it('asks for its civic and for no denouncement', () => {
    const bare = table(); // no FOREIGN_TRADE
    setAllyTurnsWith(bare, 0, 2, 20);
    setWar(bare, 2, 1, true);
    expect(warKindAllowed(bare, 0, 1, WAR_KIND_THIRD_PARTY)).toBe(false);

    const state = scene();
    setAllyTurnsWith(state, 0, 2, 20);
    setWar(state, 2, 1, true);
    // a FORMAL war at the same price is shut here: it wants a five-turn-old
    // denouncement, and that is exactly what this row is for.
    expect(warKindAllowed(state, 0, 1, WAR_KIND_FORMAL)).toBe(false);
    expect(warKindAllowed(state, 0, 1, WAR_KIND_THIRD_PARTY)).toBe(true);
  });

  it('prices the declaration at the Formal war percent', () => {
    const state = scene();
    setAllyTurnsWith(state, 0, 2, 20);
    setWar(state, 2, 1, true);
    grievanceWarDeclared(state, 0, 1, WAR_KIND_THIRD_PARTY);
    expect(grievanceWith(state, 1, 0))
      .toBe(Math.round((GRIEVANCE_WAR_BASE * WAR_KINDS[WAR_KIND_THIRD_PARTY]!.pct[0]) / 100));
  });
});
