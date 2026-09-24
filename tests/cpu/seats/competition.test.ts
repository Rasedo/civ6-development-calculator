/** SCORED COMPETITIONS, TypeScript half.
 *
 * Sourced from the Civilopedia (World Congress) and the wiki's Competition and
 * Climate Accords pages:
 *   - "If enacted, players who vote in favor of the Scored Competition will
 *     compete to contribute to the cause. The players that contribute the most
 *     will receive lucrative rewards."
 *   - a competition runs for exactly 30 turns, "after which it ends and winners
 *     are chosen"; "the civilization with the highest score wins the Gold Tier
 *     rewards. Additionally, all civs whose scores fall within the top 25%
 *     (including the Gold Tier winner) win the Silver Tier rewards, and all
 *     civs whose scores fall within the next highest quarter (i.e. the top
 *     26-50%) win the Bronze Tier rewards."
 *   - Climate Accords is scored "1 point per turn for each CO2 emission less
 *     than the highest polluter"; Gold 2 Diplomatic Victory points, Silver 100
 *     Diplomatic Favor, Bronze 50 Diplomatic Favor.
 *
 * The GPU twin is `tests/gpu/congress_vote_test.py`'s competition poke.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { resolveCompetition, startCompetition, competitionOf, scoreProject, raiseAidRequest, scoreGoldGift } from '../../../cpu/core/competition';
import { targetSpaceSize } from '../../../cpu/core/congress';
import { PROJECTS } from '../../../cpu/data/projects';
import { emitCarbon } from '../../../cpu/core/climate';
import {
  COMPETITIONS, COMPETITION_CLIMATE, COMPETITION_TURNS, COMPETITION_WORLDS_FAIR,
  COMPETITION_WORLD_GAMES, COMPETITION_SPACE_STATION, COMPETITION_AID_REQUEST, CONGRESS_COMPETITION,
} from '../../../cpu/data/seats';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat } from '../../../cpu/core/types';
import { gpPermOf } from '../../../cpu/data/greatPeople';
import { gpDistrictTourism } from '../../../cpu/core/city';

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  const city: City = {
    id: s.nextCityId++, name: `City${seat}`, seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seat, city.id);
  s.cities.push(city);
  if (state.seats.length <= seat) state.seats.length = seat;
  state.seats[seat] = s;
  return s;
}

function table(): GameState {
  const state = makeState(makeMap(20, 12, 'GRASSLAND'));
  state.seats = [];
  addSeat(state, 0, 3, 6);
  addSeat(state, 1, 9, 6);
  addSeat(state, 2, 15, 6);
  return state;
}

/** One turn of emissions, then the turn's competition bookkeeping. */
function burn(state: GameState, per: readonly number[]): void {
  per.forEach((raw, seat) => emitCarbon(state, seat, raw));
  resolveCompetition(state);
}

const CLIMATE = COMPETITIONS[COMPETITION_CLIMATE];

const FAIR = COMPETITIONS[COMPETITION_WORLDS_FAIR];

/** One turn of Great Person points, then the turn's bookkeeping. */
function earn(state: GameState, per: readonly number[]): void {
  per.forEach((n, seat) => {
    const sx = state.seats[seat];
    if (sx) (sx.gppTurn ??= {}).SCIENTIST = ((sx.gppTurn ?? {}).SCIENTIST ?? 0) + n;
  });
  resolveCompetition(state);
}

describe("the World's Fair", () => {
  it('carries the install rewards', () => {
    // CIV6 (Expansion2_Emergencies.xml, EMERGENCY_WORLDS_FAIR): FIRST PLACE
    // +1 Diplomatic Victory point and +100 Great Person points; TOP TIER +50
    // Favor and 2 random Industrial..Information civic boosts; BOTTOM 1.
    // the eight `WORLDS_FAIR_SCORE_GPP_*` rows, ScoreAmount 1 apiece — every
    // Great Person class but the Prophet
    expect(FAIR.scored.map((r) => r.source)).toEqual(Array(8).fill('gpp'));
    expect(FAIR.scored.map((r) => r.of)).toEqual([
      'GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN',
    ]);
    expect(FAIR.scored.every((r) => r.amount === 1)).toBe(true);
    expect(FAIR.goldPoints).toBe(1);
    expect(FAIR.goldGpp).toBe(100);
    expect(FAIR.silverFavor).toBe(50);
    expect(FAIR.bronzeFavor).toBe(0);
    expect(FAIR.silverBoosts).toBe(2);
    expect(FAIR.bronzeBoosts).toBe(1);
    expect(FAIR.boostEras).toEqual(['Industrial', 'Information']);
  });

  it('scores the Great Person points EARNED, and clears the stash each turn', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLDS_FAIR, [0, 1, 2]);
    earn(state, [7, 3, 0]);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(7);
    expect(c.score[1]).toBe(3);
    expect(c.score[2]).toBe(0);
    // the stash is read ONCE and cleared, so a quiet turn adds nothing
    expect(state.seats[0].gppTurn).toBeUndefined();
    resolveCompetition(state);
    expect(competitionOf(state)!.score[0]).toBe(7);
  });

  it('pays the winner its victory point and its Great Person points', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLDS_FAIR, [0, 1, 2]);
    earn(state, [9, 1, 0]);
    const c = competitionOf(state)!;
    c.left = 1;
    const dv = state.seats[0].diplomaticPoints ?? 0;
    resolveCompetition(state);
    expect(competitionOf(state)).toBeUndefined();
    expect(state.seats[0].diplomaticPoints).toBe(dv + FAIR.goldPoints);
    expect(state.seats[0].gpp.SCIENTIST).toBe(FAIR.goldGpp);
    // ...and the Prophet is not one of the classes it scores
    expect(state.seats[0].gpp.PROPHET ?? 0).toBe(0);
  });
});

describe('a scored competition', () => {
  it('scores the gap to the highest polluter, and the polluter scores nothing', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    burn(state, [10, 4, 0]);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(0);   // the highest polluter is the baseline
    expect(c.score[1]).toBe(6);
    expect(c.score[2]).toBe(10);
    // ...and the turn's emission is spent, never carried
    expect(state.seats[0].co2Turn).toBe(0);
    burn(state, [10, 4, 0]);
    expect(c.score[2]).toBe(20);
  });

  it('only the field competes', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1]);
    burn(state, [10, 4, 0]);
    const c = competitionOf(state)!;
    expect(c.member[2]).toBe(0);
    expect(c.score[2]).toBe(0);
    expect(c.score[1]).toBe(6);
  });

  it('pays the podium when the 30 turns run out, and then ends', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    for (let i = 0; i < COMPETITION_TURNS; i++) burn(state, [10, 4, 0]);
    expect(competitionOf(state)).toBeUndefined();
    // three in the field: silver is the top quarter rounded up (1 seat), and
    // bronze the quarter below it (the second).
    expect(state.seats[2].diplomaticPoints).toBe(CLIMATE.goldPoints);
    expect(state.seats[2].diplomaticFavor).toBe(CLIMATE.silverFavor);
    expect(state.seats[1].diplomaticPoints ?? 0).toBe(0);
    expect(state.seats[1].diplomaticFavor).toBe(CLIMATE.bronzeFavor);
    expect(state.seats[0].diplomaticFavor ?? 0).toBe(0);
  });

  it('a tie takes the lower seat, one total order both engines share', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    // seats 1 and 2 emit nothing, so both trail seat 0 by the same gap
    for (let i = 0; i < COMPETITION_TURNS; i++) burn(state, [10, 0, 0]);
    expect(state.seats[1].diplomaticPoints).toBe(CLIMATE.goldPoints);
    expect(state.seats[2].diplomaticPoints ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// THE TWO COMPETITIONS THAT SCORE ON HOLDINGS.
//
// CIV6 (Expansion2_Emergencies.xml): "Maintaining Stadiums" and "Maintaining
// Campus Districts" score every turn the building or district STANDS, while
// "Completing the Training Athletes project" scores once. That split is the
// whole point of the table being a list — the World Games score on all three
// at once, and the engine walks the rows rather than forking on the row's id.
// ---------------------------------------------------------------------------
describe('the World Games', () => {
  it('carries the install score table and rewards', () => {
    const g = COMPETITIONS[COMPETITION_WORLD_GAMES];
    expect(g.scored).toEqual([
      { source: 'project', amount: 50, of: 'TRAIN_ATHLETES' },
      { source: 'building', amount: 1, of: 'STADIUM' },
      { source: 'building', amount: 1, of: 'AQUATICS_CENTER' },
    ]);
    expect(g.goldPoints).toBe(1);
    expect(g.silverFavor).toBe(50);
    expect(g.bronzeFavor).toBe(0);
  });

  it('scores a Stadium every turn it stands, and each city separately', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLD_GAMES, [0, 1, 2]);
    state.seats[0].cities[0].buildings.push('STADIUM', 'AQUATICS_CENTER');
    state.seats[1].cities[0].buildings.push('STADIUM');
    resolveCompetition(state);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(2);   // both venues, 1 apiece
    expect(c.score[1]).toBe(1);
    expect(c.score[2]).toBe(0);
    resolveCompetition(state);
    expect(c.score[0]).toBe(4);   // ...and again next turn: it is MAINTAINED
  });

  it('pays the athletes project once, at its completion', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLD_GAMES, [0, 1, 2]);
    scoreProject(state, 0, 'TRAIN_ATHLETES');
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(50);
    // a project no row names pays nothing, and a seat outside the field
    // scores nothing at all
    scoreProject(state, 0, 'TRAIN_ASTRONAUTS');
    expect(c.score[0]).toBe(50);
    c.member[1] = 0;
    scoreProject(state, 1, 'TRAIN_ATHLETES');
    expect(c.score[1]).toBe(0);
  });
});

describe('the Space Station', () => {
  it('carries the install score table and rewards', () => {
    const s = COMPETITIONS[COMPETITION_SPACE_STATION];
    expect(s.scored).toEqual([
      { source: 'project', amount: 30, of: 'TRAIN_ASTRONAUTS' },
      { source: 'district', amount: 5, of: 'SPACEPORT' },
      { source: 'district', amount: 1, of: 'CAMPUS' },
    ]);
    expect(s.goldPoints).toBe(1);
    expect(s.silverFavor).toBe(50);
  });

  it('counts only districts that STAND', () => {
    const state = table();
    startCompetition(state, COMPETITION_SPACE_STATION, [0, 1, 2]);
    const city = state.seats[0].cities[0];
    const port = tileAtCoords(state.map, 4, 6);
    port.district = 'SPACEPORT';
    port.districtComplete = false;
    city.districts.push({ type: 'SPACEPORT', tileIndex: port.index });
    resolveCompetition(state);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(0);   // queued, not finished
    port.districtComplete = true;
    resolveCompetition(state);
    expect(c.score[0]).toBe(5);
  });
});

// The World Games' and the Space Station's EXTRA rewards ride the
// seat's permanent run — CIV6 (EmergencyRewards): the winner's own row, then
// the top quarter's (the winner included) and the next quarter's.
describe("the podium's permanent rewards", () => {
  /** a field of three with the scores 9 / 5 / 1: gold is seat 0, the top
   *  quarter (ceil 0.75 = 1) is seat 0 alone, the next (ceil 1.5 = 2) seat 1. */
  function podium(kind: number): GameState {
    const state = table();
    startCompetition(state, kind, [0, 1, 2]);
    const c = competitionOf(state)!;
    c.score[0] = 9;
    c.score[1] = 5;
    c.score[2] = 1;
    c.left = 1;
    resolveCompetition(state);
    expect(competitionOf(state)).toBeUndefined();
    return state;
  }

  it('World Games: +2 Campus tourism to the winner, Stadium and Aquatics Center tourism to the tiers', () => {
    const state = podium(COMPETITION_WORLD_GAMES);
    const [a, b, d] = state.seats;
    expect(gpPermOf(a, 'campusTourism')).toBe(2);
    expect(gpPermOf(b, 'campusTourism')).toBe(0);
    expect(gpPermOf(a, 'stadiumTourism')).toBe(2); // the winner sits in the top quarter too
    expect(gpPermOf(a, 'aquaticsTourism')).toBe(2);
    expect(gpPermOf(b, 'stadiumTourism')).toBe(1);
    expect(gpPermOf(b, 'aquaticsTourism')).toBe(1);
    expect(gpPermOf(d, 'stadiumTourism')).toBe(0);
    // the READER: a Stadium on a complete Entertainment Complex pays the perm,
    // a pillaged one does not
    const city = a.cities[0];
    const t = tileAtCoords(state.map, 4, 6);
    t.district = 'ENTERTAINMENT_COMPLEX';
    t.districtComplete = true;
    city.districts.push({ type: 'ENTERTAINMENT_COMPLEX', tileIndex: t.index });
    expect(gpDistrictTourism(state, 0, a.cities)).toBe(0);
    city.buildings.push('STADIUM');
    expect(gpDistrictTourism(state, 0, a.cities)).toBe(2);
    city.pillagedBuildings = ['STADIUM'];
    expect(gpDistrictTourism(state, 0, a.cities)).toBe(0);
  });

  it("Space Station: the winner's craft flies 3 farther, the tiers +40% / +20% space-race production", () => {
    const state = podium(COMPETITION_SPACE_STATION);
    const [a, b, d] = state.seats;
    expect(gpPermOf(a, 'exoSpeed')).toBe(3);
    expect(gpPermOf(b, 'exoSpeed')).toBe(0);
    expect(gpPermOf(a, 'spaceProdPct')).toBe(40);
    expect(gpPermOf(b, 'spaceProdPct')).toBe(20);
    expect(gpPermOf(d, 'spaceProdPct')).toBe(0);
  });
});

describe('the Aid Request', () => {
  // CIV6 (EMERGENCY_SEND_AID): Duration 30, Trigger PLAYER_LOSES_POP_TO_RANDOM_EVENT;
  // FromGold 1, FromProject PROJECT_SEND_AID 200, FromAtWar -30, FromBadCO2Footprint
  // -400; 2 Diplomatic Victory points / 100 / 50 Favor
  const AID = COMPETITIONS[COMPETITION_AID_REQUEST];

  it('carries the install rows and is TRIGGERED, never on the ballot', () => {
    expect(AID.id).toBe('AID_REQUEST');
    expect(AID.triggered).toBe(true);
    expect(AID.scored).toEqual([
      { source: 'gold', amount: 1 },
      { source: 'project', amount: 200, of: 'SEND_AID' },
      { source: 'atWar', amount: -30 },
      { source: 'co2Top', amount: -400 },
    ]);
    expect(AID.goldPoints).toBe(2);
    expect(AID.silverFavor).toBe(100);
    expect(AID.bronzeFavor).toBe(50);
    expect(COMPETITIONS.indexOf(AID)).toBe(COMPETITIONS.length - 1); // last: the ballot's rows come first
    const state = table();
    expect(targetSpaceSize(state, CONGRESS_COMPETITION)).toBe(COMPETITIONS.length - 1);
    expect(PROJECTS.SEND_AID!.competitionOnly).toBe('AID_REQUEST');
  });

  it('a random-event population loss raises it against the victim, and a running competition blocks it', () => {
    const state = table();
    raiseAidRequest(state, 1);
    const c = competitionOf(state)!;
    expect(c.kind).toBe(COMPETITION_AID_REQUEST);
    expect(c.target).toBe(1);
    expect(c.member).toEqual([1, 0, 1]);
    expect(c.left).toBe(COMPETITION_TURNS);
    raiseAidRequest(state, 2); // one slot: nothing changes
    expect(competitionOf(state)!.target).toBe(1);
  });

  it('scores gold reaching the target, the project, war with the target and the top polluter', () => {
    const state = table();
    raiseAidRequest(state, 1);
    const c = competitionOf(state)!;
    scoreGoldGift(state, 0, 1, 40);   // a member's gold to the target
    scoreGoldGift(state, 2, 0, 40);   // ...to somebody else: nothing
    scoreGoldGift(state, 1, 0, 40);   // the target gives: nothing (not a member)
    expect(c.score).toEqual([40, 0, 0]);
    scoreProject(state, 2, 'SEND_AID');
    expect(c.score).toEqual([40, 0, 200]);
    state.seats[2]!.wars.push(1);
    state.seats[1]!.wars.push(2);
    burn(state, [0, 0, 7]);           // seat 2 is the world's top polluter AND at war with the target
    expect(c.score).toEqual([40, 0, 200 - 30 - 400]);
    burn(state, [0, 0, 0]);           // nobody emits: nobody is bad
    expect(c.score).toEqual([40, 0, 200 - 60 - 400]);
  });

  it('pays 2 Diplomatic Victory points and 100 Favor to the winner; a two-seat field has no bronze quarter', () => {
    const state = table();
    raiseAidRequest(state, 1);
    const c = competitionOf(state)!;
    c.score[0] = 9;
    c.score[2] = 1;
    c.left = 1;
    resolveCompetition(state);
    expect(competitionOf(state)).toBeUndefined();
    expect(state.seats[0]!.diplomaticPoints ?? 0).toBe(2);
    expect(state.seats[0]!.diplomaticFavor ?? 0).toBe(100);
    // the field is everyone but the target — two seats: the top quarter
    // (ceil 0.5 = 1) is the winner and the next quarter (ceil 1.0 = 1) is
    // the same rank, so the second takes nothing — the published quarters
    expect(state.seats[2]!.diplomaticFavor ?? 0).toBe(0);
    expect(state.seats[1]!.diplomaticPoints ?? 0).toBe(0); // the target is not in the field
    expect(state.seats[1]!.diplomaticFavor ?? 0).toBe(0);
  });
});
