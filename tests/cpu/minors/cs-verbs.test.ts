import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, emptySeat, indexOfSeat, isCityStateSeat, seatOfCityState, seatOfIndex, setTileOwner, setWar, tileSeat, unitsOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { envoysOf, isSuzerain, setMet } from '../../../cpu/core/cityStates';
import { hexDistance, tilesWithin } from '../../../world/hex';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN, QUEST_ENVOYS, QUEST_COOLDOWN, CITY_STATE_TYPE_DISTRICT } from '../../../cpu/data/cityStates';
import type { CityState, CityStateType, GameState, Seat, City } from '../../../cpu/core/types';

// A civ with ONE city; opts out of the belief/settle draws by default so a
// levy/quest scenario perturbs no other RNG.
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(seatOfIndex(state.seats.length - 1)), // #51/S6.12
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    ww: {}, wwTurn: {},
    diplomaticFavor: 0,
    diplomaticPoints: 0,
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
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: City = {
    id: civ.nextCityId++,
    name: 'Roma',
    seat: civ.seat,
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
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> & { type?: CityStateType } = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)), // #51/S6.12
    id: state.cityStates.length,
    name: `CS${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 3,
    envoys: {},
    met: [],
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

// (#104: the old meetQuota guard is gone — every gold rung is record-driven
// now, so nothing can drain a levy-priced treasury without a record.)

function levyUnitsNear(state: GameState, civ: Seat, cityState: CityState): number {
  const ct = state.map.tiles[cityState.centerIndex];
  return unitsOf(state, civ.seat).filter((u) => {
    const t = state.map.tiles[u.tileIndex];
    return u.type === 'WARRIOR' && hexDistance(t.col, t.row, ct.col, ct.row) <= 1;
  }).length;
}

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): civ levy', () => {
  function scenario(): { state: GameState; civ: Seat; cityState: CityState } {
    const state = makeState(makeMap(24, 24));
    state.turn = 20; // > QUEST_COOLDOWN, ≤ 60 → WARRIOR ladder rung
    const civ = addCiv(state, 10, 10);
    const cityState = addCs(state, 16, 10, { type: 'militaristic' });
    cityState.met = [];
    setMet(cityState, civ.seat);
    cityState.envoys = {  };
    cityState.envoys[civ.seat] = 5; // strict suzerain (seat 0 at zero, no other civ)
    return { state, civ, cityState };
  }

  /** #104: the levy is a wire DECISION — store the kind-7 record the driver
   * would emit; seatPhase's arm re-validates the rule half (militaristic,
   * suzerain, cooldown, afford) through levyUnits itself. */
  function stashLevy(state: GameState, seat: number, cityStateIndex: number): void {
    (state.seatActions ??= {})[state.turn - 1] = {
      [seat]: { production: [], tech: null, civic: null, units: [], levy: cityStateIndex },
    };
  }

  it('a recorded levy on a militaristic CS spawns LEVY_UNITS at its center', () => {
    const { state, civ, cityState } = scenario();
    expect(isSuzerain(cityState, civ.seat)).toBe(true);
    setWar(state, civ.seat, 0, true);
    civ.treasury = LEVY_GOLD_COST; // exactly the price — nothing else spends gold without a record
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBe(state.turn);
    expect(levyUnitsNear(state, civ, cityState)).toBe(LEVY_UNITS);
  });

  it('does not levy without a record (the scripted scan is gone)', () => {
    const { state, civ, cityState } = scenario();
    setWar(state, civ.seat, 0, true);
    civ.treasury = LEVY_GOLD_COST;
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBeUndefined();
  });

  it('executes a recorded levy at peace — at-war is the driver policy, not a rule', () => {
    const { state, civ, cityState } = scenario();
    setWar(state, civ.seat, 0, false);
    civ.treasury = LEVY_GOLD_COST;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBe(state.turn);
  });

  it('refuses a recorded levy without suzerainty (2 envoys)', () => {
    const { state, civ, cityState } = scenario();
    cityState.envoys[civ.seat] = 2;
    setWar(state, civ.seat, 0, true);
    civ.treasury = LEVY_GOLD_COST;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBeUndefined();
  });

  it('respects the gold cost (one below → no levy)', () => {
    const { state, civ, cityState } = scenario();
    setWar(state, civ.seat, 0, true);
    civ.treasury = LEVY_GOLD_COST - 1;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBeUndefined();
  });

  it('shares one per-CS cooldown across seats (a recent levy blocks)', () => {
    const { state, civ, cityState } = scenario();
    setWar(state, civ.seat, 0, true);
    civ.treasury = LEVY_GOLD_COST;
    cityState.lastLevyTurn = state.turn - (LEVY_COOLDOWN - 1); // still cooling down
    const before = levyUnitsNear(state, civ, cityState);
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state, 0);
    expect(cityState.lastLevyTurn).toBe(state.turn - (LEVY_COOLDOWN - 1)); // unchanged
    expect(levyUnitsNear(state, civ, cityState)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): civ quests (deterministic, zero-draw)', () => {
  function scenario(cityStateType: CityStateType = 'scientific'): { state: GameState; civ: Seat; cityState: CityState } {
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const civ = addCiv(state, 10, 10);
    const cityState = addCs(state, 16, 10, { type: cityStateType });
    cityState.met = [];
    setMet(cityState, civ.seat);
    cityState.envoys = {  };
    cityState.envoys[civ.seat] = 3;
    return { state, civ, cityState };
  }

  it('issues buildDistrict when no camp is near and the district is unbuilt (zero-draw)', () => {
    const { state, civ, cityState } = scenario('scientific');
    const rng0 = state.rngState;
    seatPhase(state, 0);
    expect(cityState.seatQuest?.[indexOfSeat(civ.seat)]?.kind).toBe('buildDistrict');
    expect(cityState.seatQuest?.[indexOfSeat(civ.seat)]?.district).toBe(CITY_STATE_TYPE_DISTRICT['scientific']);
    expect(state.rngState).toBe(rng0); // NO nextRandom consumed by the civ-quest path
  });

  it('prefers clearCamp when a camp is within range (nearest, ties lowest tile)', () => {
    const { state, civ, cityState } = scenario('scientific');
    const ct = state.map.tiles[cityState.centerIndex];
    const near = tilesWithin(state.map, ct.col, ct.row, 2).filter((t) => t.index !== cityState.centerIndex);
    const far = near[near.length - 1].index;
    const close = near[0].index;
    state.barbSeat.camps = [far, close]; // out of array order — nearest must still win
    const rng0 = state.rngState;
    seatPhase(state, 0);
    const q = cityState.seatQuest?.[indexOfSeat(civ.seat)];
    expect(q?.kind).toBe('clearCamp');
    // nearest to the CS center
    const dc = hexDistance(state.map.tiles[close].col, state.map.tiles[close].row, ct.col, ct.row);
    const df = hexDistance(state.map.tiles[far].col, state.map.tiles[far].row, ct.col, ct.row);
    expect(q?.campIndex).toBe(dc <= df ? close : far);
    expect(state.rngState).toBe(rng0);
  });

  it('resolves a satisfied quest with +QUEST_ENVOYS to the civ, zero-draw', () => {
    const { state, civ, cityState } = scenario('scientific');
    // pre-seed a clearCamp quest whose camp is already gone → satisfied
    cityState.seatQuest = [];
    cityState.seatQuest[indexOfSeat(civ.seat)] = { kind: 'clearCamp', campIndex: 999 };
    cityState.seatQuestIssuedTurn = [];
    cityState.seatQuestIssuedTurn[indexOfSeat(civ.seat)] = state.turn;
    state.barbSeat.camps = []; // camp 999 gone
    const env0 = envoysOf(cityState, civ.seat);
    const rng0 = state.rngState;
    seatPhase(state, 0);
    expect(cityState.seatQuest?.[indexOfSeat(civ.seat)]).toBeNull();
    expect(envoysOf(cityState, civ.seat)).toBe(env0 + QUEST_ENVOYS);
    expect(state.rngState).toBe(rng0);
  });

  it('does not issue a quest for an UNMET city-state', () => {
    const { state, civ, cityState } = scenario('scientific');
    cityState.met = cityState.met.filter((x) => x !== civ.seat);
    seatPhase(state, 0);
    expect(cityState.seatQuest?.[indexOfSeat(civ.seat)] ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): SEAT-0 quest draw-count neutrality', () => {
  it('the civ-quest path consumes ZERO rng, so the shared PRNG (and the seat-0 path) is untouched', () => {
    // A civ that would issue AND resolve a quest, at peace (no combat/war
    // draws), belief-opted-out: seatPhase must leave rngState untouched by
    // the quest machinery — the explicit before/after neutrality proof.
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const civ = addCiv(state, 10, 10);
    const cityState = addCs(state, 16, 10, { type: 'scientific' });
    cityState.met = [];
    setMet(cityState, civ.seat);
    cityState.envoys = {  };
    cityState.envoys[civ.seat] = 3;
    // a satisfied quest to resolve + an issue on the same phase (second CS)
    cityState.seatQuest = [];
    cityState.seatQuest[indexOfSeat(civ.seat)] = { kind: 'clearCamp', campIndex: 999 };
    cityState.seatQuestIssuedTurn = [];
    cityState.seatQuestIssuedTurn[indexOfSeat(civ.seat)] = state.turn;
    const cs2 = addCs(state, 10, 16, { type: 'cultural' });
    cs2.met = [];
    setMet(cs2, civ.seat);
    cs2.envoys = {  };
    cs2.envoys[civ.seat] = 3;
    state.barbSeat.camps = [];
    const rng0 = state.rngState;
    seatPhase(state, 0);
    // both a resolve and an issue happened, drawing nothing
    expect(cityState.seatQuest?.[indexOfSeat(civ.seat)]).toBeNull();
    expect(cs2.seatQuest?.[indexOfSeat(civ.seat)]?.kind).toBe('buildDistrict');
    expect(state.rngState).toBe(rng0);
  });

  it('the seatPhase loop issues a seat-0 quest drawing ZERO — the seats share one issuer', () => {
    // ONE issuer, and it is deterministic: fixed order, with the district
    // keyed to the CS's OWN type. Every seat issues quests without touching
    // the shared PRNG, so quest issuance can never shift a draw count.
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const cityState = addCs(state, 16, 10, { type: 'scientific', met: [0] });
    cityState.seatQuestIssuedTurn = [state.turn - QUEST_COOLDOWN]; // due to issue
    state.barbSeat.camps = [];
    const rng0 = state.rngState;
    seatPhase(state, 0);
    expect(cityState.seatQuest?.[0]).not.toBeNull();
    // scientific -> the type's own district, not a draw from a flat list
    expect(cityState.seatQuest?.[0]?.kind).toBe('buildDistrict');
    expect(state.rngState).toBe(rng0); // ZERO draws
  });
});
