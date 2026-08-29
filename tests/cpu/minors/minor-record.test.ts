import { describe, it, expect } from 'vitest';
import { emptySeat, seatOfCityState, setTileOwner, setWar } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { borderClosedTo } from '../../../cpu/core/units';
import { spreadFromUnit } from '../../../cpu/core/unitOrders';
import { addEnvoys, cityStatePhase, isSuzerain, resolveSuzerain, suzerainOf } from '../../../cpu/core/cityStates';
import { containmentBonus } from '../../../cpu/core/effects';
import { SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import { OPEN_BORDERS_CIVIC } from '../../../cpu/data/seats';
import { SPREAD_PRESSURE } from '../../../cpu/data/religion';
import { TECHS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import { tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, GameState, Seat } from '../../../cpu/core/types';

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
    met: [0],
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  resolveSuzerain(cityState);
  return cityState;
}

function addSeat(state: GameState, seat: number): Seat {
  const s = emptySeat(seat);
  state.seats.push(s);
  return s;
}

// ---------------------------------------------------------------------------
describe('the RESOLVED suzerain', () => {
  it('stores the contest answer and agrees with isSuzerain at every write', () => {
    const state = makeState(makeMap(24, 24));
    addSeat(state, 1);
    const cs = addCs(state, 12, 12);
    expect(suzerainOf(cs)).toBe(-1);            // nobody yet

    addEnvoys(cs, 0, SUZERAIN_ENVOYS - 1);      // one short of the bar
    expect(suzerainOf(cs)).toBe(-1);
    expect(isSuzerain(cs, 0)).toBe(false);

    addEnvoys(cs, 0, 1);                        // exactly the bar, uncontested
    expect(suzerainOf(cs)).toBe(0);
    expect(isSuzerain(cs, 0)).toBe(true);

    addEnvoys(cs, 1, SUZERAIN_ENVOYS);          // a TIE leaves nobody
    expect(suzerainOf(cs)).toBe(-1);
    expect(isSuzerain(cs, 0)).toBe(false);
    expect(isSuzerain(cs, 1)).toBe(false);

    addEnvoys(cs, 1, 1);                        // seat 1 pulls ahead
    expect(suzerainOf(cs)).toBe(1);
    expect(isSuzerain(cs, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Containment', () => {
  function scenario(): { state: GameState; cs: CityState; sender: Seat; suz: Seat } {
    const state = makeState(makeMap(24, 24));
    const sender = state.seats[0];
    const suz = addSeat(state, 1);
    const cs = addCs(state, 12, 12);
    addEnvoys(cs, suz.seat, SUZERAIN_ENVOYS);   // seat 1 holds it
    return { state, cs, sender, suz };
  }

  it('pays nothing without the card', () => {
    const { state, cs, sender } = scenario();
    expect(containmentBonus(state, cs, sender)).toBe(0);
  });

  it('pays 1 when the suzerain runs a DIFFERENT government', () => {
    const { state, cs, sender, suz } = scenario();
    // the card is slotted off the seat's own research; give the sender the
    // civic that unlocks CONTAINMENT and a government the suzerain lacks
    sender.research.civics = Object.keys(CIVICS);
    expect(containmentBonus(state, cs, sender)).toBe(1);
    // ... and nothing once the suzerain runs the same one
    suz.research.civics = [...sender.research.civics];
    expect(containmentBonus(state, cs, sender)).toBe(0);
  });

  it('pays nothing against a city-state with no suzerain, or one that is ME', () => {
    const { state, cs, sender } = scenario();
    sender.research.civics = Object.keys(CIVICS);
    cs.envoys = {};
    resolveSuzerain(cs);
    expect(containmentBonus(state, cs, sender)).toBe(0);
    addEnvoys(cs, sender.seat, SUZERAIN_ENVOYS);
    expect(suzerainOf(cs)).toBe(sender.seat);
    expect(containmentBonus(state, cs, sender)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's research record", () => {
  it('banks POPULATION a turn and completes the cheapest available row', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { population: 5 });
    const cheapestTech = Object.entries(TECHS)
      .filter(([, d]) => d.prereqs.length === 0)
      .sort((a, b) => a[1].cost - b[1].cost)[0];
    state.turn = 1;
    cityStatePhase(state);
    expect(cs.research.techProgress).toBe(5);   // pop into the pot, nothing done
    expect(cs.research.techs).toEqual([]);
    for (let i = 0; i < Math.ceil(cheapestTech[1].cost / 5); i++) cityStatePhase(state);
    expect(cs.research.techs).toContain(cheapestTech[0]);
    expect(cs.research.techProgress).toBeGreaterThanOrEqual(0);
  });

  it('reaches Early Empire and closes its border to everyone but the suzerain', () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    addSeat(state, 1);
    const cs = addCs(state, 12, 12);
    const tile = state.map.tiles[tilesWithin(state.map, 12, 12, 1).find((t) => t.index !== cs.centerIndex)!.index];
    expect(borderClosedTo(state, 0, tile, 'WARRIOR')).toBe(false); // open before the civic

    cs.research.civics = [OPEN_BORDERS_CIVIC];
    expect(borderClosedTo(state, 0, tile, 'WARRIOR')).toBe(true);

    // CIV6 (Borders): "For city-states, Open Borders is granted to players
    // that have reached Suzerain status."
    addEnvoys(cs, 0, SUZERAIN_ENVOYS);
    expect(borderClosedTo(state, 0, tile, 'WARRIOR')).toBe(false);

    // a rival without the suzerainty still refuses — and a war opens it
    expect(borderClosedTo(state, 1, tile, 'WARRIOR')).toBe(true);
    setWar(state, 1, cs.seat, true);
    expect(borderClosedTo(state, 1, tile, 'WARRIOR')).toBe(false);
  });

  it('lets a Trader and a religious unit through a closed minor border', () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const cs = addCs(state, 12, 12);
    cs.research.civics = [OPEN_BORDERS_CIVIC];
    const tile = state.map.tiles[tilesWithin(state.map, 12, 12, 1).find((t) => t.index !== cs.centerIndex)!.index];
    expect(borderClosedTo(state, 0, tile, 'WARRIOR')).toBe(true);
    expect(borderClosedTo(state, 0, tile, 'TRADER')).toBe(false);
    expect(borderClosedTo(state, 0, tile, 'MISSIONARY')).toBe(false);
    expect(borderClosedTo(state, 0, tile, 'INQUISITOR')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('a city-state can be converted', () => {
  it('takes the spread lump on its own centre, at Translator strength', () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    state.seats[0].religion.founded = true;
    const cs = addCs(state, 12, 12);
    const home = tileAtCoords(state.map, 11, 12);
    const ap = spawnUnit(state, 'APOSTLE', home.index, 0)!;
    ap.charges = 3;
    spreadFromUnit(state, ap, state.seats[0], state.map.tiles[cs.centerIndex]);
    // CIV6 (Translator): the promotion's note extends the triple to
    // city-states; unpromoted the lump is the plain one.
    expect(cs.religionPressure?.[0]).toBe(SPREAD_PRESSURE);
    expect(ap.charges).toBe(2);
  });
});
