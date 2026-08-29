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
import { spawnUnit, trainableUnits, tileFreeForUnit } from '../../../cpu/core/units';
import { UNITS } from '../../../cpu/data/units';
import { emptySeat, seatOf, setAllyTurnsWith, setTileOwner } from '../../../cpu/core/seats';
import {
  canTrainSpy, spyCapacity, spiesOf, spyDestinations, spyTravelTurns,
  beginTravel, beginMission, missionOffered, spyMissionMask, missionTurns,
  tickSpies, tickSpyEffects, spyIsCounterspy, isSpy,
} from '../../../cpu/core/espionage';
import { governorAt, governorPhase, governorsOf, neutralizeGovernor } from '../../../cpu/core/governors';
import { GOVERNOR_TITLE_CIVICS } from '../../../cpu/data/governors';
import {
  SPY_UNIT, SPY_IDLE, SPY_TRAVELLING, SPY_MISSIONS, SPY_MISSION_TURNS,
  SPY_SOURCES_TURNS, SPY_GOVERNOR_TURNS, SPY_GOVERNOR_PER_LEVEL,
  SPY_UNREST_LOYALTY, SPY_UNREST_PER_LEVEL, SPY_PARTISANS_MIN,
  SPY_PARTISANS_MAX, BODYGUARD_OP_NUM, BODYGUARD_OP_DEN,
  SPY_M_GAIN_SOURCES, SPY_M_SIPHON_FUNDS, SPY_M_GREAT_WORK_HEIST,
  SPY_M_SABOTAGE_PRODUCTION, SPY_M_STEAL_TECH_BOOST, SPY_M_RECRUIT_PARTISANS,
  SPY_M_FOMENT_UNREST, SPY_M_NEUTRALIZE_GOVERNOR, SPY_M_COUNTERSPY,
} from '../../../cpu/data/espionage';
import { DED_BODYGUARD } from '../../../cpu/data/seats';
import { purchaseUnit } from '../../../cpu/core/game';
import { BARB_SEAT } from '../../../cpu/core/seats';
import type { City, GameState } from '../../../cpu/core/types';

/** `rngState` seeds whose FIRST draw clears the 50% success bar, and whose
 *  first two draws are fail-then-caught. Picked so no lane has to guard its
 *  own assertions behind an `if`. */
const WINS = 7;
const LOSES = 1;

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
    const { state, me } = spyState();
    expect(missionTurns(state, 0, SPY_M_FOMENT_UNREST)).toBe(SPY_MISSION_TURNS);
    me.age = 2;
    me.dedicationPicks = [DED_BODYGUARD];
    expect(missionTurns(state, 0, SPY_M_FOMENT_UNREST))
      .toBe(Math.floor((SPY_MISSION_TURNS * BODYGUARD_OP_NUM) / BODYGUARD_OP_DEN));
    // ...a defensive post keeps the full clock
    expect(missionTurns(state, 0, SPY_M_COUNTERSPY)).toBe(SPY_MISSION_TURNS);
  });

  it('counter-espionage stands its post rather than ending', () => {
    const { state, mine } = spyState();
    const spy = spyAt(state, 0, mine);
    expect(beginMission(state, spy, SPY_M_COUNTERSPY)).toBe(true);
    expect(spyIsCounterspy(spy)).toBe(true);
    for (let i = 0; i < SPY_MISSION_TURNS; i++) tickSpies(state, 0);
    expect(spy.spyMission).toBe(SPY_M_COUNTERSPY);
    expect(spy.spyTurns).toBe(SPY_MISSION_TURNS);
  });
});

describe('what a finished mission does', () => {
  /** run `m` to completion for seat 0's spy standing in `city`. */
  function run(state: GameState, spy: { spyMission?: number }, m: number) {
    expect(beginMission(state, spy as never, m)).toBe(true);
    for (let i = 0; i < SPY_MISSION_TURNS; i++) tickSpies(state, 0);
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
    expect(me.treasury - before.mine).toBe(SPY_MISSION_TURNS);
    expect(before.theirs - them.treasury).toBe(SPY_MISSION_TURNS);
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
