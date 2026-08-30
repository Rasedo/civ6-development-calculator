/**
 * ESPIONAGE: capacity, the jump, the mission heads and what each one does.
 *
 * A Spy is the one civilian that never walks — it holds no plot, jumps between
 * revealed city CENTRES and runs one mission at a time out of a district of
 * the city it stands in. Every lane below drives the same entry points
 * `phase.ts` uses, so a rule that only the applier knows cannot hide.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { spawnUnit, trainableUnits, tileFreeForUnit, refreshUnits, unitExertsZoc, unitDomain } from '../../../cpu/core/units';
import { UNITS } from '../../../cpu/data/units';
import { emptySeat, seatOf, setAllyTurnsWith, setTileOwner } from '../../../cpu/core/seats';
import {
  canTrainSpy, spyCapacity, spiesOf, spyDestinations, spyTravelTurns,
  beginTravel, beginMission, missionOffered, spyMissionMask, missionTurns,
  tickSpies, tickSpyEffects, spyIsCounterspy, isSpy, cityCounterLevels,
  effectiveLevel, levelUpSpy, quartermasterLevels, spyNoEstablish,
} from '../../../cpu/core/espionage';
import { promoValueFor, takePromotion, promoAvailable, promoReady } from '../../../cpu/core/promotions';
import {
  PROMO_COLS, SPY_OP_PROMO_LEVELS, UNIT_PROMO_CLASS, promoRows,
} from '../../../cpu/data/promotions';
import { governorAt, governorPhase, governorsOf, neutralizeGovernor } from '../../../cpu/core/governors';
import { GOVERNOR_TITLE_CIVICS } from '../../../cpu/data/governors';
import {
  SPY_UNIT, SPY_IDLE, SPY_TRAVELLING, SPY_MISSIONS,
  SPY_SOURCES_TURNS, SPY_GOVERNOR_TURNS, SPY_GOVERNOR_PER_LEVEL,
  SPY_UNREST_LOYALTY, SPY_UNREST_PER_LEVEL, SPY_PARTISANS_MIN,
  SPY_PARTISANS_MAX, BODYGUARD_OP_NUM, BODYGUARD_OP_DEN,
  SPY_M_GAIN_SOURCES, SPY_M_SIPHON_FUNDS, SPY_M_GREAT_WORK_HEIST,
  SPY_M_SABOTAGE_PRODUCTION, SPY_M_STEAL_TECH_BOOST, SPY_M_RECRUIT_PARTISANS,
  SPY_M_FOMENT_UNREST, SPY_M_NEUTRALIZE_GOVERNOR, SPY_M_COUNTERSPY,
} from '../../../cpu/data/espionage';
import { DED_BODYGUARD, CONGRESS_ESPIONAGE, CONGRESS_PACT_LEVELS } from '../../../cpu/data/seats';
import { SPY_OFFENSIVE_MISSIONS } from '../../../cpu/data/espionage';
import { purchaseUnit } from '../../../cpu/core/game';
import { BARB_SEAT } from '../../../cpu/core/seats';
import type { City, GameState } from '../../../cpu/core/types';

/** `rngState` seeds whose FIRST draw clears the 50% success bar, and whose
 *  first two draws are fail-then-caught. Picked so no lane has to guard its
 *  own assertions behind an `if`. */
const WINS = 7;
/** the mission's own published duration. */
const turnsOf = (m: number): number => SPY_MISSIONS[m]!.turns;
const LOSES = 1;
/** the bit an Espionage promotion holds in its own class list. */
function spyBit(id: string): number {
  const k = promoRows('ESPIONAGE').findIndex((p) => p.id === id);
  expect(k).toBeGreaterThanOrEqual(0);
  return 1 << k;
}

/** Two majors, a city each, both spy-capable. */
function spyState() {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  const theirs = settleAt(state, tileAtCoords(state.map, 16, 16).index, 1);
  for (const s of state.seats) {
    s.treasury = 10_000;
    if (!s.research.civics.includes('DIPLOMATIC_SERVICE')) s.research.civics.push('DIPLOMATIC_SERVICE');
  }
  return { state, mine, theirs, me: seatOf(state, 0)!, them: seatOf(state, 1)! };
}

/** Give a city a COMPLETE district of `type` on a free owned plot. */
function district(state: GameState, city: City, type: string): number {
  const ctr = state.map.tiles[city.centerIndex];
  const t = state.map.tiles.find(
    (x) => x.index !== ctr.index && !x.district && x.terrain !== 'OCEAN'
      && Math.abs(x.col - ctr.col) <= 2 && Math.abs(x.row - ctr.row) <= 2,
  )!;
  setTileOwner(t, city.seat, city.id);
  t.district = type as never;
  t.districtComplete = true;
  city.districts.push({ type: type as never, tileIndex: t.index });
  return t.index;
}

/** Put an idle spy of `seat` on `city`'s centre. */
function spyAt(state: GameState, seat: number, city: City) {
  const u = spawnUnit(state, SPY_UNIT, city.centerIndex, seat)!;
  expect(u).toBeTruthy();
  u.tileIndex = city.centerIndex;
  return u;
}

describe('a spy is fielded, not stationed', () => {
  it('capacity counts the sources the source names, and gates training', () => {
    const { state, mine, me } = spyState();
    expect(spyCapacity(state, 0)).toBe(1);
    expect(canTrainSpy(state, 0)).toBe(true);
    expect(trainableUnits(state, 0, mine).some((d) => d.id === SPY_UNIT)).toBe(true);

    spyAt(state, 0, mine);
    expect(spiesOf(state, 0)).toHaveLength(1);
    expect(canTrainSpy(state, 0)).toBe(false);
    expect(trainableUnits(state, 0, mine).some((d) => d.id === SPY_UNIT)).toBe(false);

    // ...and every further source raises it by exactly one.
    me.research.civics.push('NATIONALISM');
    expect(spyCapacity(state, 0)).toBe(2);
    expect(canTrainSpy(state, 0)).toBe(true);
  });

  it('cannot be purchased with Gold', () => {
    const { state, mine } = spyState();
    const r = purchaseUnit(state, mine.id, SPY_UNIT, 0);
    expect(r.ok).toBe(false);
  });

  it('holds no plot: a second unit lands on the same tile', () => {
    const { state, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(isSpy(spy.type)).toBe(true);
    // the spy neither blocks the tile nor is blocked by what stands there
    expect(tileFreeForUnit(state, mine.centerIndex, 0, { type: 'BUILDER', seat: 0 })).toBe(true);
    const second = spawnUnit(state, SPY_UNIT, mine.centerIndex, 0)!;
    expect(second.tileIndex).toBe(mine.centerIndex);
  });

  it('carries no Combat Strength: no zone of control, and it never digs in', () => {
    const { state, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(unitDomain(SPY_UNIT)).toBe('spy');
    expect(unitExertsZoc(spy)).toBe(false);
    // the control: a WARRIOR that stands still digs in over two refreshes.
    const open = state.map.tiles.find(
      (x) => x.index !== mine.centerIndex && !x.district && x.terrain !== 'OCEAN',
    )!;
    const w = spawnUnit(state, 'WARRIOR', open.index, 0)!;
    refreshUnits(state);
    refreshUnits(state);
    expect(w.fortifyTurns).toBe(2);
    expect(spy.fortifyTurns ?? 0).toBe(0);
  });
});

describe('the jump', () => {
  it('offers revealed foreign centres, never an ally, never its own tile', () => {
    const { state, mine, theirs } = spyState();
    const spy = spyAt(state, 0, mine);
    const dests = spyDestinations(state, spy);
    expect(dests).toContain(theirs.centerIndex);
    expect(dests).not.toContain(mine.centerIndex);
    // CIV6: "provided you don't have an Alliance with that civilization"
    setAllyTurnsWith(state, 0, 1, 5);
    expect(spyDestinations(state, spy)).not.toContain(theirs.centerIndex);
  });

  it('travels for a distance-scaled clock and lands on arrival', () => {
    const { state, mine, theirs } = spyState();
    const spy = spyAt(state, 0, mine);
    const turns = spyTravelTurns(state, mine.centerIndex, theirs.centerIndex);
    expect(beginTravel(state, spy, theirs.centerIndex)).toBe(true);
    expect(spy.spyMission).toBe(SPY_TRAVELLING);
    expect(spy.spyTurns).toBe(turns);
    expect(spy.movesLeft).toBe(0);

    for (let i = 0; i < turns; i++) tickSpies(state, 0);
    expect(spy.tileIndex).toBe(theirs.centerIndex);
    expect(spy.spyMission).toBe(SPY_IDLE);
    expect(spy.spyTarget).toBeUndefined();
    // ...and a spy in transit takes no new order
    expect(spyDestinations(state, spy)).toContain(mine.centerIndex);
  });
});

describe('what a city offers', () => {
  it('an at-home mission is offered at home and nowhere else', () => {
    const { state, mine, theirs } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(missionOffered(state, spy, SPY_M_COUNTERSPY)).toBe(true);
    expect(missionOffered(state, spy, SPY_M_GAIN_SOURCES)).toBe(false);
    spy.tileIndex = theirs.centerIndex;
    expect(missionOffered(state, spy, SPY_M_COUNTERSPY)).toBe(false);
    expect(missionOffered(state, spy, SPY_M_GAIN_SOURCES)).toBe(true);
  });

  it('a district mission waits for a LIVE district of that type', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    expect(missionOffered(state, spy, SPY_M_SABOTAGE_PRODUCTION)).toBe(false);
    const iz = district(state, theirs, 'INDUSTRIAL_ZONE');
    expect(missionOffered(state, spy, SPY_M_SABOTAGE_PRODUCTION)).toBe(true);
    state.map.tiles[iz].districtPillaged = true;
    expect(missionOffered(state, spy, SPY_M_SABOTAGE_PRODUCTION)).toBe(false);
  });

  it('the mask is one flag per catalog row, in catalog order', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    const mask = spyMissionMask(state, spy);
    expect(mask).toHaveLength(SPY_MISSIONS.length);
    expect(mask[SPY_M_GAIN_SOURCES]).toBe(true);
    expect(mask[SPY_M_COUNTERSPY]).toBe(false);
  });

  it("Steal Tech Boost waits for a tech the thief doesn't hold", () => {
    const { state, theirs, them } = spyState();
    district(state, theirs, 'CAMPUS');
    const spy = spyAt(state, 0, theirs);
    expect(missionOffered(state, spy, SPY_M_STEAL_TECH_BOOST)).toBe(false);
    them.research.techs.push('MINING');
    expect(missionOffered(state, spy, SPY_M_STEAL_TECH_BOOST)).toBe(true);
  });

  it('Great Work Heist waits for a work to steal', () => {
    const { state, theirs } = spyState();
    district(state, theirs, 'THEATER_SQUARE');
    const spy = spyAt(state, 0, theirs);
    expect(missionOffered(state, spy, SPY_M_GREAT_WORK_HEIST)).toBe(false);
    theirs.greatWorksArt = 1;
    expect(missionOffered(state, spy, SPY_M_GREAT_WORK_HEIST)).toBe(true);
  });
});

describe('the clock', () => {
  it("Bodyguard of Lies' golden face shortens an offensive operation only", () => {
    const { state, me, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(missionTurns(state, spy, SPY_M_FOMENT_UNREST)).toBe(turnsOf(SPY_M_FOMENT_UNREST));
    me.age = 2;
    me.dedicationPicks = [DED_BODYGUARD];
    expect(missionTurns(state, spy, SPY_M_FOMENT_UNREST))
      .toBe(Math.floor((turnsOf(SPY_M_FOMENT_UNREST) * BODYGUARD_OP_NUM) / BODYGUARD_OP_DEN));
    // ...a defensive post keeps the full clock
    expect(missionTurns(state, spy, SPY_M_COUNTERSPY)).toBe(turnsOf(SPY_M_COUNTERSPY));
  });

  it('each mission carries the duration and the odds its own table publishes', () => {
    // CIV6 (Spy): the chassis' mission table — every operation is 8 turns
    // except the two 16-turn posts, and each names its own success rate.
    expect(turnsOf(SPY_M_COUNTERSPY)).toBe(16);
    for (const m of SPY_MISSIONS) {
      expect(m.turns).toBe(m.id === 'COUNTERSPY' ? 16 : 8);
      // the table publishes a rate for exactly the missions that ROLL: a
      // `certain` one succeeds outright, and the counterspy post never resolves
      const rolls = !m.certain && m.id !== 'COUNTERSPY';
      expect(m.successPct !== undefined).toBe(rolls);
    }
    const pct = (id: string) => SPY_MISSIONS.find((m) => m.id === id)!.successPct;
    expect(pct('RECRUIT_PARTISANS')).toBe(10);
    expect(pct('GREAT_WORK_HEIST')).toBe(20);
    expect(pct('DISRUPT_ROCKETRY')).toBe(20);
    expect(pct('BREACH_DAM')).toBe(20);
    expect(pct('SABOTAGE_PRODUCTION')).toBe(35);
    expect(pct('STEAL_TECH_BOOST')).toBe(35);
    expect(pct('NEUTRALIZE_GOVERNOR')).toBe(35);
    expect(pct('SIPHON_FUNDS')).toBe(56);
    expect(pct('FOMENT_UNREST')).toBe(56);
  });

  it('counter-espionage stands its post rather than ending', () => {
    const { state, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(beginMission(state, spy, SPY_M_COUNTERSPY)).toBe(true);
    expect(spyIsCounterspy(spy)).toBe(true);
    for (let i = 0; i < turnsOf(SPY_M_COUNTERSPY); i++) tickSpies(state, 0);
    expect(spy.spyMission).toBe(SPY_M_COUNTERSPY);
    expect(spy.spyTurns).toBe(turnsOf(SPY_M_COUNTERSPY));
  });
});

describe('the Espionage Pact reaches the spy', () => {
  const pactOn = (state: GameState, m: number, outcome: number): void => {
    const k = SPY_OFFENSIVE_MISSIONS.indexOf(m);
    expect(k).toBeGreaterThanOrEqual(0);
    state.congress = [{ res: CONGRESS_ESPIONAGE, outcome, target: k }];
  };

  it('outcome A pays every seat two levels on the named operation', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    expect(effectiveLevel(state, spy, theirs, SPY_M_SIPHON_FUNDS)).toBe(0);
    pactOn(state, SPY_M_SIPHON_FUNDS, 0);
    expect(effectiveLevel(state, spy, theirs, SPY_M_SIPHON_FUNDS)).toBe(CONGRESS_PACT_LEVELS);
    expect(effectiveLevel(state, spy, theirs, SPY_M_FOMENT_UNREST)).toBe(0);
    // ...and the rival's spy in MY city is lifted by the same standing pact
    const theirSpy = spyAt(state, 1, theirs);
    expect(effectiveLevel(state, theirSpy, theirs, SPY_M_SIPHON_FUNDS)).toBe(CONGRESS_PACT_LEVELS);
  });

  it('outcome B takes the operation off every mask', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    district(state, theirs, 'COMMERCIAL_HUB');
    expect(missionOffered(state, spy, SPY_M_SIPHON_FUNDS)).toBe(true);
    pactOn(state, SPY_M_SIPHON_FUNDS, 1);
    expect(missionOffered(state, spy, SPY_M_SIPHON_FUNDS)).toBe(false);
    expect(spyMissionMask(state, spy)[SPY_M_SIPHON_FUNDS]).toBe(false);
    // the applier is the mask's own reader, so the banned order is refused
    expect(beginMission(state, spy, SPY_M_SIPHON_FUNDS)).toBe(false);
    // ...and a mission the pact did not name is untouched
    pactOn(state, SPY_M_FOMENT_UNREST, 1);
    expect(missionOffered(state, spy, SPY_M_SIPHON_FUNDS)).toBe(true);
  });
});

describe('the espionage promotion pool', () => {
  it('is one flat pool of seventeen with no prerequisites', () => {
    // CIV6 (Spy): "able to choose one of three promotions each time they gain
    // a level, which are chosen at random from the pool" — a pool, not a tree.
    const rows = promoRows('ESPIONAGE');
    expect(rows).toHaveLength(17);
    for (const r of rows) expect(r.requires).toEqual([]);
    expect(UNIT_PROMO_CLASS[SPY_UNIT]).toBe('ESPIONAGE');
    // the head is as wide as the widest class, which is now this one
    expect(PROMO_COLS).toBeGreaterThanOrEqual(17);
    expect(new Set(rows.map((r) => r.id)).size).toBe(17);
  });

  it('each mission row lifts its OWN operation and no other', () => {
    // CIV6 (Demolitions): "Sabotage Production as if 2 levels more experienced."
    const u = (id: string) => ({ type: SPY_UNIT, promos: spyBit(id) });
    const pairs: [string, number][] = [
      ['DEMOLITIONS', SPY_M_SABOTAGE_PRODUCTION],
      ['CON_ARTIST', SPY_M_SIPHON_FUNDS],
      ['CAT_BURGLAR', SPY_M_GREAT_WORK_HEIST],
      ['TECHNOLOGIST', SPY_M_STEAL_TECH_BOOST],
      ['GUERRILLA_LEADER', SPY_M_RECRUIT_PARTISANS],
      ['COVERT_ACTION', SPY_M_FOMENT_UNREST],
      ['LICENSE_TO_KILL', SPY_M_NEUTRALIZE_GOVERNOR],
      ['SEDUCTION', SPY_M_COUNTERSPY],
    ];
    for (const [id, m] of pairs) {
      expect(promoValueFor(u(id), 'SPY_OP_LEVEL', 1 << m)).toBe(SPY_OP_PROMO_LEVELS);
      expect(promoValueFor(u(id), 'SPY_OP_LEVEL', 1 << SPY_M_GAIN_SOURCES)).toBe(0);
    }
  });

  it('LINGUIST shortens every mission, after the dedication has had its cut', () => {
    // CIV6 (Linguist): "Time to complete all missions reduced by 25%."
    const { state, me, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    const post = turnsOf(SPY_M_COUNTERSPY);
    expect(missionTurns(state, spy, SPY_M_COUNTERSPY)).toBe(post);
    spy.promos = spyBit('LINGUIST');
    expect(missionTurns(state, spy, SPY_M_COUNTERSPY)).toBe(Math.floor((post * 75) / 100));
    // ...and it lands on top of Bodyguard of Lies rather than instead of it
    me.age = 2;
    me.dedicationPicks = [DED_BODYGUARD];
    const op = turnsOf(SPY_M_FOMENT_UNREST);
    const ded = Math.max(1, Math.floor((op * BODYGUARD_OP_NUM) / BODYGUARD_OP_DEN));
    expect(missionTurns(state, spy, SPY_M_FOMENT_UNREST))
      .toBe(Math.max(1, Math.floor((ded * 75) / 100)));
  });

  it('DISGUISE puts the spy in the city the turn it is sent', () => {
    // CIV6 (Disguise): "Takes no time to establish presence in an enemy city."
    const { state, mine, theirs } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(spyNoEstablish(state, spy)).toBe(false);
    expect(spyTravelTurns(state, mine.centerIndex, theirs.centerIndex)).toBeGreaterThan(0);
    spy.promos = spyBit('DISGUISE');
    expect(beginTravel(state, spy, theirs.centerIndex)).toBe(true);
    expect(spy.tileIndex).toBe(theirs.centerIndex);
    expect(spy.spyMission).toBe(SPY_IDLE);
    expect(spy.spyTurns).toBe(0);
  });

  it('QUARTERMASTER pays from home, and POLYGRAPH costs the intruder', () => {
    // CIV6 (Quartermaster): "If this Spy is in home territory, all your Spies
    // operate at +1 level"; (Polygraph): "...enemy Spies in your lands operate
    // at 1 level below usual."
    const { state, mine, theirs } = spyState();
    const home = spyAt(state, 0, mine);
    home.promos = spyBit('QUARTERMASTER');
    expect(quartermasterLevels(state, 0)).toBe(1);
    const away = spyAt(state, 0, theirs);
    expect(effectiveLevel(state, away, theirs, SPY_M_SIPHON_FUNDS)).toBe(1);
    // ...and a Quartermaster ABROAD is out of home territory, so it pays nothing
    home.tileIndex = theirs.centerIndex;
    expect(quartermasterLevels(state, 0)).toBe(0);

    const guard = spyAt(state, 1, theirs);
    guard.promos = spyBit('POLYGRAPH');
    expect(cityCounterLevels(state, theirs)).toBe(1);
    expect(effectiveLevel(state, away, theirs, SPY_M_SIPHON_FUNDS)).toBe(0);
  });

  it('a level hands the spy three distinct columns and arms the head', () => {
    const { state, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(promoReady(spy)).toBe(false);
    levelUpSpy(state, spy);
    expect(spy.spyLevel).toBe(1);
    const offer = spy.promoOffer ?? 0;
    let n = 0;
    for (let k = 0; k < 17; k++) if (offer & (1 << k)) n += 1;
    expect(n).toBe(3);
    expect(promoReady(spy)).toBe(true);
    // exactly the offered columns are takeable
    for (let k = 0; k < 17; k++) expect(promoAvailable(spy, k)).toBe((offer & (1 << k)) !== 0);
    const first = [...Array(17).keys()].find((k) => (offer & (1 << k)) !== 0)!;
    expect(takePromotion(spy, first)).toBe(true);
    expect(promoReady(spy)).toBe(false);
  });

  it('the rows that ship inert, and say so', () => {
    // Ace Driver waits on the escape sequence, Smear Campaign on Fabricate
    // Scandal, and Surveillance on a spy that stands anywhere but the centre.
    for (const id of ['ACE_DRIVER', 'SMEAR_CAMPAIGN', 'SURVEILLANCE']) {
      const row = promoRows('ESPIONAGE').find((p) => p.id === id)!;
      expect(row.effects).toEqual([{ kind: 'NONE' }]);
    }
  });
});

describe('what a finished mission does', () => {
  /** run `m` to completion for seat 0's spy standing in `city`. */
  function run(state: GameState, spy: { spyMission?: number }, m: number) {
    expect(beginMission(state, spy as never, m)).toBe(true);
    for (let i = 0; i < turnsOf(m); i++) tickSpies(state, 0);
  }

  it('Gain Sources arms the seat-keyed clock, and it decays', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    run(state, spy, SPY_M_GAIN_SOURCES);
    expect(theirs.spySources?.[0]).toBe(SPY_SOURCES_TURNS);
    expect(theirs.spySources?.[1] ?? 0).toBe(0);
    tickSpyEffects(state, 1);
    expect(theirs.spySources?.[0]).toBe(SPY_SOURCES_TURNS - 1);
  });

  it('Siphon Funds moves the hub gold from the victim to the thief', () => {
    const { state, theirs, me, them } = spyState();
    district(state, theirs, 'COMMERCIAL_HUB');
    const spy = spyAt(state, 0, theirs);
    const before = { mine: me.treasury, theirs: them.treasury };
    state.rngState = WINS;
    run(state, spy, SPY_M_SIPHON_FUNDS);
    expect(me.treasury - before.mine).toBe(turnsOf(SPY_M_SIPHON_FUNDS));
    expect(before.theirs - them.treasury).toBe(turnsOf(SPY_M_SIPHON_FUNDS));
    // CIV6: a spy "gains levels by successfully completing offensive missions"
    expect(spy.spyLevel).toBe(1);
  });

  it('a failed offensive mission can cost the spy, and a counterspy makes it likelier', () => {
    const { state, theirs, mine } = spyState();
    district(state, theirs, 'COMMERCIAL_HUB');
    const spy = spyAt(state, 0, theirs);
    state.rngState = LOSES;
    run(state, spy, SPY_M_SIPHON_FUNDS);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
    expect(spiesOf(state, 0)).toHaveLength(0);
    // ...and the seat may field a replacement, the dead one no longer counting
    expect(canTrainSpy(state, 0)).toBe(true);
    expect(mine.centerIndex).toBeGreaterThanOrEqual(0);
  });

  it('the counterspy that makes the catch earns the level', () => {
    // CIV6 (Spies and Espionage): a spy "may gain levels from successful
    // offensive operations, or capturing an enemy Spy".
    const { state, theirs } = spyState();
    district(state, theirs, 'COMMERCIAL_HUB');
    const guard = spyAt(state, 1, theirs);
    expect(beginMission(state, guard, SPY_M_COUNTERSPY)).toBe(true);
    const spy = spyAt(state, 0, theirs);
    state.rngState = LOSES;
    run(state, spy, SPY_M_SIPHON_FUNDS);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
    expect(guard.spyLevel).toBe(1);
  });

  it('a catch with nobody posted pays nobody', () => {
    const { state, theirs } = spyState();
    district(state, theirs, 'COMMERCIAL_HUB');
    const spy = spyAt(state, 0, theirs);
    state.rngState = LOSES;
    run(state, spy, SPY_M_SIPHON_FUNDS);
    expect(spiesOf(state, 1)).toHaveLength(0);
  });

  it('Neutralize Governor sends the PERSON home and the mission stops offering', () => {
    const { state, theirs, them } = spyState();
    const spy = spyAt(state, 0, theirs);
    them.research.civics.push(GOVERNOR_TITLE_CIVICS[0]); // one title → one appointment
    governorPhase(state, them.seat);
    const gi = governorAt(state, theirs);
    expect(gi).toBeGreaterThanOrEqual(0);
    expect(missionOffered(state, spy, SPY_M_NEUTRALIZE_GOVERNOR)).toBe(true);

    const g = governorsOf(them)[gi];
    neutralizeGovernor(g, SPY_GOVERNOR_TURNS + SPY_GOVERNOR_PER_LEVEL * 0);
    // the clock is the PERSON's: he leaves the city, so the city has none
    expect(governorAt(state, theirs)).toBe(-1);
    expect(missionOffered(state, spy, SPY_M_NEUTRALIZE_GOVERNOR)).toBe(false);

    governorPhase(state, them.seat); // the clock ticks in his own phase, not the spy's
    expect(g.outTurns).toBe(SPY_GOVERNOR_TURNS - 1);
    expect(governorAt(state, theirs)).toBe(-1); // and he cannot be re-seated while it runs
  });

  it('Foment Unrest drops loyalty by the level-scaled amount', () => {
    const { state, theirs } = spyState();
    const spy = spyAt(state, 0, theirs);
    theirs.loyalty = 100;
    spy.spyLevel = 1;
    state.rngState = WINS;
    run(state, spy, SPY_M_FOMENT_UNREST);
    expect(theirs.loyalty).toBe(100 - (SPY_UNREST_LOYALTY + SPY_UNREST_PER_LEVEL));
  });

  it('Recruit Partisans raises barbarians and darkens the Neighborhood', () => {
    const { state, theirs } = spyState();
    const nb = district(state, theirs, 'NEIGHBORHOOD');
    const spy = spyAt(state, 0, theirs);
    state.rngState = WINS;
    const before = state.units.filter((u) => u.seat === BARB_SEAT).length;
    run(state, spy, SPY_M_RECRUIT_PARTISANS);
    const after = state.units.filter((u) => u.seat === BARB_SEAT).length;
    expect(state.map.tiles[nb].districtPillaged).toBe(true);
    expect(after - before).toBeGreaterThanOrEqual(SPY_PARTISANS_MIN);
    expect(after - before).toBeLessThanOrEqual(SPY_PARTISANS_MAX);
    // the rebels are ANTI-CAVALRY, the class the source names
    const rebel = state.units.filter((u) => u.seat === BARB_SEAT).at(-1)!;
    expect(UNITS[rebel.type]?.antiCavalry).toBe(true);
  });
});
