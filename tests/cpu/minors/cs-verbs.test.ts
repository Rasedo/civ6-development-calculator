import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, emptySeat, isCityStateSeat, seatOfCityState, setTileOwner, setWar, tileSeat, unitsOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { levyGoldCost, seatPhase } from '../../../cpu/core/phase';
import { spawnUnit } from '../../../cpu/core/units';
import { envoysOf, isSuzerain, meetCityState, setMet } from '../../../cpu/core/cityStates';
import { giveEraQuests, giveQuest } from '../../../cpu/core/quests';
import { markBoost } from '../../../cpu/core/boosts';
import { holdRng } from '../../../cpu/core/rand';
import { QUEST_ENVOYS } from '../../../cpu/data/quests';
import { tilesWithin } from '../../../world/hex';
import { LEVY_TURNS } from '../../../cpu/data/cityStates';
import type { CityState, CityStateType, GameState, Seat, City } from '../../../cpu/core/types';

// A civ with ONE city; opts out of the belief/settle draws by default so a
// levy/quest scenario perturbs no other RNG.
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    seat: 1,
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
    government: { chosen: null, policies: [], held: 0, civicTurn: 0, anarchyEnd: 0, lapsed: [] },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    projectsDone: [],
    religion: { pantheon: null, founded: false, type: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
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
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
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
    ...emptySeat(seatOfCityState(state.cityStates.length)),
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

// ---------------------------------------------------------------------------
describe('civ levy', () => {
  function scenario(): { state: GameState; civ: Seat; cityState: CityState; price: number } {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    state.turn = 20;
    const civ = addCiv(state, 10, 10);
    const cityState = addCs(state, 16, 10, { type: 'militaristic' });
    cityState.met = [];
    setMet(cityState, civ.seat);
    cityState.envoys = {  };
    cityState.envoys[civ.seat] = 5; // strict suzerain (seat 0 at zero, no other civ)
    cityState.suzerain = civ.seat;
    spawnUnit(state, 'WARRIOR', cityState.centerIndex, cityState.seat);
    spawnUnit(state, 'WARRIOR', cityState.centerIndex, cityState.seat);
    return { state, civ, cityState, price: levyGoldCost(state, civ.seat, cityState) };
  }

  /** The levy is a wire DECISION — store the kind-7 record the driver
   * would emit; seatPhase's arm re-validates the rule half (suzerain, not
   * already levied, an army to take, the price) through levyUnits itself. */
  function stashLevy(state: GameState, seat: number, cityStateIndex: number): void {
    (state.seatActions ??= {})[state.turn - 1] = {
      [seat]: { production: [], tech: null, civic: null, units: [], levy: cityStateIndex },
    };
  }

  const armyOf = (state: GameState, seat: number) => unitsOf(state, seat).filter((u) => u.type === 'WARRIOR');

  it("a recorded levy takes the minor's own army for the price", () => {
    const { state, civ, cityState, price } = scenario();
    expect(isSuzerain(state, cityState, civ.seat)).toBe(true);
    expect(price).toBeGreaterThan(0);
    setWar(state, civ.seat, 0, true);
    civ.treasury = price; // exactly the price — nothing else spends gold without a record
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state);
    expect(cityState.levySeat).toBe(civ.seat);
    expect(cityState.levyEnds).toBe(state.turn + LEVY_TURNS - 1);
    expect(armyOf(state, civ.seat)).toHaveLength(2);
    expect(armyOf(state, cityState.seat)).toHaveLength(0);
    expect(civ.treasury).toBe(0);
  });

  it('does not levy without a record (the scripted scan is gone)', () => {
    const { state, civ, cityState, price } = scenario();
    setWar(state, civ.seat, 0, true);
    civ.treasury = price;
    seatPhase(state);
    expect(cityState.levySeat).toBeUndefined();
  });

  it('executes a recorded levy at peace — at-war is the driver policy, not a rule', () => {
    const { state, civ, cityState, price } = scenario();
    setWar(state, civ.seat, 0, false);
    civ.treasury = price;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state);
    expect(cityState.levySeat).toBe(civ.seat);
  });

  it('refuses a recorded levy without suzerainty (2 envoys)', () => {
    const { state, civ, cityState, price } = scenario();
    cityState.envoys[civ.seat] = 2;
    setWar(state, civ.seat, 0, true);
    civ.treasury = price;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state);
    expect(cityState.levySeat).toBeUndefined();
  });

  it('respects the gold cost (one below → no levy)', () => {
    const { state, civ, cityState, price } = scenario();
    setWar(state, civ.seat, 0, true);
    civ.treasury = price - 1;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state);
    expect(cityState.levySeat).toBeUndefined();
    expect(armyOf(state, cityState.seat)).toHaveLength(2);
  });

  it('refuses an army already levied', () => {
    const { state, civ, cityState, price } = scenario();
    setWar(state, civ.seat, 0, true);
    cityState.levySeat = civ.seat;
    cityState.levyEnds = state.turn + 5;
    civ.treasury = price;
    stashLevy(state, civ.seat, state.cityStates.indexOf(cityState));
    seatPhase(state);
    expect(civ.treasury).toBe(price);
    expect(armyOf(state, cityState.seat)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('the city-states\' quests (Game_Quests)', () => {
  function scenario(): { state: GameState; civ: Seat; cityState: CityState; draws: [string, number][] } {
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const civ = addCiv(state, 10, 10);
    const cityState = addCs(state, 16, 10, { type: 'scientific' });
    const draws: [string, number][] = [];
    holdRng({ point: () => undefined, draw: (_s, max, label) => { draws.push([label, max]); } });
    return { state, civ, cityState, draws };
  }
  const release = () => holdRng(null);

  it('a meeting gives the pair one quest: one draw over the valid types, then the type\'s picker', () => {
    const { state, civ, cityState, draws } = scenario();
    meetCityState(state, cityState, civ.seat);
    release();
    const q = cityState.seatQuest?.[civ.seat];
    expect(q).toBeTruthy();
    // no religion, no camp near, no Great Person on offer: Trade, Train,
    // Zone, Tech, Civic
    expect(draws[0]).toEqual(['Selecting a random new quest', 5]);
    if (q!.type !== 'TRADE') expect(draws[1][0]).toMatch(/^Choosing random .* quest$/);
  });

  it('a standing quest gives the pair no other; the last completed type is skipped', () => {
    const { state, civ, cityState, draws } = scenario();
    setMet(cityState, civ.seat);
    cityState.seatQuest = [];
    cityState.seatQuest[civ.seat] = { type: 'TRADE', target: null };
    giveQuest(state, cityState, civ.seat);
    expect(draws).toHaveLength(0);
    cityState.seatQuest[civ.seat] = null;
    cityState.seatQuestLast = [];
    cityState.seatQuestLast[civ.seat] = 'TRADE';
    giveQuest(state, cityState, civ.seat);
    release();
    expect(draws[0]).toEqual(['Selecting a random new quest', 4]);
    expect(cityState.seatQuest[civ.seat]?.type).not.toBe('TRADE');
  });

  it('a Train Unit quest completes when its unit is added: the envoy is the actor\'s', () => {
    const { state, civ, cityState } = scenario();
    release();
    setMet(cityState, civ.seat);
    cityState.seatQuest = [];
    cityState.seatQuest[civ.seat] = { type: 'TRAIN', target: 'ARCHER' };
    const env0 = envoysOf(cityState, civ.seat);
    spawnUnit(state, 'SLINGER', civ.cities[0].centerIndex, civ.seat);
    expect(cityState.seatQuest[civ.seat]?.type).toBe('TRAIN');
    spawnUnit(state, 'ARCHER', civ.cities[0].centerIndex, civ.seat);
    expect(cityState.seatQuest[civ.seat]).toBeNull();
    expect(cityState.seatQuestLast?.[civ.seat]).toBe('TRAIN');
    expect(envoysOf(cityState, civ.seat)).toBe(env0 + QUEST_ENVOYS);
  });

  it('a Tech Boost quest completes on the boost, and ends with the tech researched', () => {
    const { state, civ, cityState } = scenario();
    release();
    setMet(cityState, civ.seat);
    cityState.seatQuest = [];
    cityState.seatQuest[civ.seat] = { type: 'TECH', target: 'WRITING' };
    markBoost(state, civ.seat, 'WRITING');
    expect(cityState.seatQuest[civ.seat]).toBeNull();
    expect(envoysOf(cityState, civ.seat)).toBe(QUEST_ENVOYS);
    cityState.seatQuest[civ.seat] = { type: 'TECH', target: 'ARCHERY' };
    civ.research.techs.push('ARCHERY');
    const draws: string[] = [];
    holdRng({ point: () => undefined, draw: (_s, _m, label) => { draws.push(label); } });
    giveQuest(state, cityState, civ.seat);
    release();
    expect(draws[0]).toBe('Selecting a random new quest');
  });

  it('war between the pair ends its quest', () => {
    const { state, civ, cityState } = scenario();
    release();
    setMet(cityState, civ.seat);
    cityState.seatQuest = [];
    cityState.seatQuest[civ.seat] = { type: 'TRADE', target: null };
    setWar(state, civ.seat, cityState.seat, true);
    expect(cityState.seatQuest[civ.seat]).toBeNull();
  });

  it('a new game era gives every pair met its quest, the city-states in player order', () => {
    const { state, civ, cityState, draws } = scenario();
    const cs2 = addCs(state, 4, 18, { type: 'cultural' });
    setMet(cityState, civ.seat);
    setMet(cs2, civ.seat);
    giveEraQuests(state);
    release();
    expect(draws.filter(([l]) => l === 'Selecting a random new quest')).toHaveLength(2);
    expect(cityState.seatQuest?.[civ.seat]).toBeTruthy();
    expect(cs2.seatQuest?.[civ.seat]).toBeTruthy();
  });
});
