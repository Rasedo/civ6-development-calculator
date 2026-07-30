import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import { rivalPhase, isFormalWar, rivalStrength } from '../src/core/rivals';
import { civsAtWar, setRivalWar, civOfRival, isPlayerSeat, tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, rivalCount } from '../src/core/seats';
import { hostileRangedStrike, attackTargets } from '../src/core/combat';
import { unitsHostile, spawnUnit } from '../src/core/units';
import { tilesWithin } from '../src/core/hex';
import {
  RR_DOW_WW_MAX,
  RR_FORMAL_MIN_TURNS,
  RR_PEACE_WW,
  WW_FORMAL_MULT,
  WW_SURPRISE_MULT,
} from '../src/data/rivals';
import type { GameState, RivalCity, RivalCiv } from '../src/core/types';

// -- local builders (the rivals.test.ts pattern) ------------------------------
function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: rivalCount(state),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    gpEarned: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    seat: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civOfRival(rival.id), city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (!isPlayerSeat(tileSeat(t)) && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civOfRival(rival.id), city.id);
    }
  }
  rival.cities.push(city);
  state.seats.push(rival);
  return rival;
}

/** A bare extra city so a rival's strength (cities*8 + unit combat) is controllable. */
function addCity(state: GameState, rival: RivalCiv, col: number, row: number): RivalCity {
  const tile = tileAtCoords(state.map, col, row);
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Ostia',
    seat: rival.id + 1,
    centerIndex: tile.index,
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civOfRival(rival.id), city.id);
  rival.cities.push(city);
  return city;
}

/** Two adjacent unit-less rivals; r0 carries `extraCities` more (strength edge). */
function pairState(extraCities = 1): { state: GameState; r0: RivalCiv; r1: RivalCiv } {
  const state = makeState();
  state.turn = 40;
  const r0 = addRival(state, 6, 6);
  const r1 = addRival(state, 8, 6); // within RR_DOW_PROXIMITY of r0
  for (let i = 0; i < extraCities; i++) addCity(state, r0, 4 + i * 2, 8);
  return { state, r0, r1 };
}

describe('geopolitics (#55 A-19/B-33/B-22)', () => {
  it('per-pair war state is symmetric; the player pair rides atWar', () => {
    const { state, r0, r1 } = pairState();
    expect(civsAtWar(state, 1, 2)).toBe(false);
    setRivalWar(state, 1, 2, true);
    expect(civsAtWar(state, 1, 2)).toBe(true);
    expect(civsAtWar(state, 2, 1)).toBe(true);
    expect(r0.atWarRivals).toContain(1);
    expect(r1.atWarRivals).toContain(0);
    setRivalWar(state, 2, 1, false); // either orientation clears both sides
    expect(civsAtWar(state, 1, 2)).toBe(false);
    expect(r0.atWarRivals).not.toContain(1);

    setRivalWar(state, 0, 1, true); // the (0, r+1) pair is the atWar boolean
    expect(r0.atWar).toBe(true);
    expect(civsAtWar(state, 1, 0)).toBe(true);
    expect(civsAtWar(state, 1, 1)).toBe(false); // self never at war
  });

  it('unitsHostile keys rival-vs-rival on the pair state', () => {
    const { state } = pairState();
    const a = { seat: civOfRival(0) };
    const b = { seat: civOfRival(1) };
    expect(unitsHostile(state, a, b)).toBe(false);
    setRivalWar(state, 1, 2, true);
    expect(unitsHostile(state, a, b)).toBe(true);
    expect(unitsHostile(state, b, a)).toBe(true);
    expect(unitsHostile(state, a, { seat: civOfRival(0) })).toBe(false); // same civ
  });

  it('rivalPhase denounces (stronger, near, directed) then declares SURPRISE without an old grudge', () => {
    const { state, r0, r1 } = pairState();
    expect(rivalStrength(state, r0)).toBeGreaterThan(rivalStrength(state, r1) * 1.3);
    rivalPhase(state);
    expect(r0.denouncedTurn?.[r1.id]).toBe(state.turn); // stamped this turn
    expect(r1.denouncedTurn?.[r0.id]).toBeUndefined(); // the weaker side never stamps
    // the DoW fired the same turn — the grudge is 0 turns old, so SURPRISE
    expect(civsAtWar(state, 1, 2)).toBe(true);
    expect(isFormalWar(r0, r1.id)).toBe(false);
    // same-turn accrual at the surprise rate, both participants
    expect(r0.warWeariness).toBe(WW_SURPRISE_MULT);
    expect(r1.warWeariness).toBe(WW_SURPRISE_MULT);
  });

  it('an old denouncement makes the war FORMAL at the x1 accrual', () => {
    const { state, r0, r1 } = pairState();
    r0.denouncedTurn = { [r1.id]: state.turn - RR_FORMAL_MIN_TURNS };
    rivalPhase(state);
    expect(civsAtWar(state, 1, 2)).toBe(true);
    expect(isFormalWar(r0, r1.id)).toBe(true);
    expect(isFormalWar(r1, r0.id)).toBe(true); // symmetric mark
    expect(r0.warWeariness).toBe(WW_FORMAL_MULT);
  });

  it('anti-thrash: weary targets and weary aggressors block the DoW', () => {
    const weary = pairState();
    (weary.state.seats[1 + 1] as RivalCiv).warWeariness = RR_PEACE_WW + 1; // would sue out the same turn
    rivalPhase(weary.state);
    expect(civsAtWar(weary.state, 1, 2)).toBe(false);

    const aggr = pairState();
    (aggr.state.seats[0 + 1] as RivalCiv).warWeariness = RR_DOW_WW_MAX; // war-weary aggressor
    rivalPhase(aggr.state);
    expect(civsAtWar(aggr.state, 1, 2)).toBe(false);
  });

  it('peace clears the war and the FORMAL flag but keeps the grudge', () => {
    const { state, r0, r1 } = pairState();
    setRivalWar(state, 1, 2, true);
    r0.warKindFormal = [r1.id];
    r1.warKindFormal = [r0.id];
    r0.denouncedTurn = { [r1.id]: 7 };
    r0.warWeariness = RR_PEACE_WW + 1; // either side past the bar ends it
    rivalPhase(state);
    expect(civsAtWar(state, 1, 2)).toBe(false);
    expect(isFormalWar(r0, r1.id)).toBe(false);
    expect(isFormalWar(r1, r0.id)).toBe(false);
    expect(r0.denouncedTurn?.[r1.id]).toBe(7); // the grudge survives the peace
  });

  it('a rival RANGED unit never strikes an enemy rival unit (the scope-out)', () => {
    const { state } = pairState();
    setRivalWar(state, 1, 2, true);
    const atkTile = tileAtCoords(state.map, 10, 10);
    const defTile = tileAtCoords(state.map, 11, 10);
    const atk = spawnUnit(state, 'ARCHER', atkTile.index, civOfRival(0))!;
    const def = spawnUnit(state, 'WARRIOR', defTile.index, civOfRival(1))!;
    expect(unitsHostile(state, atk, def)).toBe(true); // they ARE at war...
    const hp0 = def.hp;
    const mp0 = atk.movesLeft;
    hostileRangedStrike(state, atk, def.tileIndex);
    expect(def.hp).toBe(hp0); // ...but ranged-vs-rival is a no-op (GPU mirror)
    expect(atk.movesLeft).toBe(mp0); // no MP spent on the no-op quirk
    expect(attackTargets(state, atk)).not.toContain(def.tileIndex);
    // the MELEE arm stays live: a melee unit lists the enemy rival's tile
    const melee = spawnUnit(state, 'WARRIOR', atkTile.index, civOfRival(0))!;
    expect(attackTargets(state, melee)).toContain(def.tileIndex);
  });
});
