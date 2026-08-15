import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, emptySeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { makeState, tileAtCoords } from '../helpers';
import { createGame, foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { canFoundCity } from '../../../cpu/core/rules';
import { seatPhase } from '../../../cpu/core/phase';
import { borderCandidates, computeCityStats } from '../../../cpu/core/city';
import { tilesWithin, hexDistance } from '../../../world/hex';
import { assignEnvoy, cityStatePhase, cityStateEnvoyBonuses, cityStateSuzerainCapitalBonus, envoyBonusDelta, envoysOf, isSuzerain } from '../../../cpu/core/cityStates';
import { tradeCapacity, addCsTradeRoute, cityTradeYields } from '../../../cpu/core/trade';
import { ENVOY_COST, CITY_STATE_SUZERAIN_YIELD } from '../../../cpu/data/cityStates';
import type { CityState, CityStateType, GameState } from '../../../cpu/core/types';

function addCs(
  state: GameState,
  col: number,
  row: number,
  opts: Partial<CityState> & { type?: CityStateType } = {},
): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: `Testopolis ${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 3,
    envoys: {},
    met: [0],
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

describe('city-state placement', () => {
  it('places spaced, deterministic city-states that claim territory', () => {
    const a = createGame({ width: 44, height: 26, seed: 5, withResources: true, withWonders: true, cityStates: true });
    const b = createGame({ width: 44, height: 26, seed: 5, withResources: true, withWonders: true, cityStates: true });
    expect(a.cityStates.length).toBeGreaterThanOrEqual(2);
    expect(serialize(a)).toBe(serialize(b));
    for (const cityState of a.cityStates) {
      const center = a.map.tiles[cityState.centerIndex];
      expect((isCityStateSeat(tileSeat(center)) ? cityStateOfSeat(tileSeat(center)) : -1)).toBe(cityState.id);
      for (const other of a.cityStates) {
        if (other.id === cityState.id) continue;
        const oc = a.map.tiles[other.centerIndex];
        expect(hexDistance(center.col, center.row, oc.col, oc.row)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('blocks settling on and next to city-states', () => {
    const state = makeState();
    const cityState = addCs(state, 6, 6);
    expect(canFoundCity(state, cityState.centerIndex, 0).ok).toBe(false);
    const ring1 = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== cityState.centerIndex)!;
    expect(canFoundCity(state, ring1.index, 0).ok).toBe(false);
    const ring2 = tilesWithin(state.map, 6, 6, 2).find(
      (t) => hexDistance(t.col, t.row, 6, 6) === 2,
    )!;
    expect(canFoundCity(state, ring2.index, 0).ok).toBe(false); // min city distance 4
    const ring3 = tilesWithin(state.map, 6, 6, 3).find(
      (t) => hexDistance(t.col, t.row, 6, 6) === 3,
    )!;
    expect(canFoundCity(state, ring3.index, 0).ok).toBe(false); // dist 3 blocked too
    const far = tileAtCoords(state.map, 10, 10);
    expect(canFoundCity(state, far.index, 0).ok).toBe(true);
  });

  it('border growth never claims city-state territory', () => {
    const state = makeState();
    addCs(state, 8, 5);
    const city = foundCity(state, tileAtCoords(state.map, 4, 5).index, 0).city!; // dist 4 from the CS
    const candidates = borderCandidates(state, city);
    for (const i of candidates) {
      expect((isCityStateSeat(tileSeat(state.map.tiles[i])) ? cityStateOfSeat(tileSeat(state.map.tiles[i])) : -1)).toBe(-1);
    }
  });
});

describe('envoys', () => {
  it('1 envoy boosts the capital; 3 boost matching districts; 3+ is suzerain', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const cityState = addCs(state, 9, 9, { type: 'scientific' });

    // Bonuses ride the normal yield pipeline (amenity multipliers included),
    // so assert a band rather than an exact +2.
    const before = computeCityStats(state, city).total.science;
    cityState.envoys = { [0]: 1 };
    const withOne = computeCityStats(state, city).total.science;
    expect(withOne - before).toBeGreaterThanOrEqual(2);
    expect(withOne - before).toBeLessThan(2.5);

    // The 3/6 tiers now land on the CAMPUS BUILDINGS — a completed
    // Campus holding a Library (tier-1) collects the 3-envoy bonus, a
    // University (tier-2) the 6-envoy bonus.
    const campusTile = tileAtCoords(state.map, 6, 5);
    campusTile.district = 'CAMPUS';
    campusTile.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: campusTile.index });
    city.buildings.push('LIBRARY', 'UNIVERSITY');
    const campusBase = computeCityStats(state, city).total.science;
    cityState.envoys = { [0]: 3 };
    const withThree = computeCityStats(state, city).total.science;
    expect(withThree - campusBase).toBeGreaterThanOrEqual(2);
    expect(withThree - campusBase).toBeLessThan(2.5);
    expect(isSuzerain(cityState, 0)).toBe(true);
    cityState.envoys = { [0]: 6 };
    const withSix = computeCityStats(state, city).total.science;
    expect(withSix - campusBase).toBeGreaterThanOrEqual(4);
    expect(withSix - campusBase).toBeLessThan(5);
  });

  it('predicts the gain of the next envoy', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const cityState = addCs(state, 9, 9, { type: 'cultural' });
    expect(envoyBonusDelta(state, cityState, 0).culture).toBe(2); // crossing 1
    cityState.envoys = { [0]: 1 };
    expect(envoyBonusDelta(state, cityState, 0).culture).toBe(0); // 2 crosses nothing
    cityState.envoys = { [0]: 2 };
    const theater = tileAtCoords(state.map, 6, 5);
    theater.district = 'THEATER_SQUARE';
    theater.districtComplete = true;
    city.districts.push({ type: 'THEATER_SQUARE', tileIndex: theater.index });
    // The 3-envoy tier keys to the cultural tier-1 building (AMPHITHEATER).
    city.buildings.push('AMPHITHEATER');
    expect(envoyBonusDelta(state, cityState, 0).culture).toBe(2); // crossing 3 with one Amphitheater
  });

  it('suzerainty of a trade city-state adds route capacity', () => {
    const state = makeState();
    foundCity(state, tileAtCoords(state.map, 5, 5).index, 0);
    const cityState = addCs(state, 9, 9, { type: 'trade' });
    const base = tradeCapacity(state, 0);
    cityState.envoys = { [0]: 3 };
    expect(tradeCapacity(state, 0)).toBe(base + 1);
  });

  it('assignEnvoy consumes the pool and needs contact', () => {
    const state = makeState();
    const met = addCs(state, 9, 9);
    const unmet = addCs(state, 3, 9, { met: [] });
    seatOf(state, 0)!.envoysAvailable = 1;
    expect(assignEnvoy(state, unmet.id, 0).ok).toBe(false);
    expect(assignEnvoy(state, met.id, 0).ok).toBe(true);
    expect(envoysOf(met, 0)).toBe(1);
    expect(seatOf(state, 0)!.envoysAvailable).toBe(0);
    expect(assignEnvoy(state, met.id, 0).ok).toBe(false); // pool empty
  });

  it('influence accrues into envoys once someone is met', () => {
    const state = makeState();
    addCs(state, 9, 9);
    seatOf(state, 0)!.influencePoints = ENVOY_COST - 2;
    cityStatePhase(state);
    expect(seatOf(state, 0)!.envoysAvailable).toBe(1);
    expect(seatOf(state, 0)!.influencePoints).toBeLessThan(ENVOY_COST);
  });

  it('aggregates bonuses across several city-states', () => {
    const state = makeState();
    addCs(state, 3, 3, { type: 'scientific', envoys: { [0]: 1 } });
    addCs(state, 9, 9, { type: 'religious', envoys: { [0]: 3 } });
    const bonuses = cityStateEnvoyBonuses(state, 0);
    expect(bonuses.capital.science).toBe(2);
    expect(bonuses.capital.faith).toBe(2);
    // The 3-envoy tier lands on the religious tier-1 building (SHRINE).
    expect(bonuses.buildingAdd.SHRINE?.faith).toBe(2);
  });
});

describe('quests and trade', () => {
  it('completing a quest earns an envoy', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const cityState = addCs(state, 9, 9);
    cityState.seatQuest = [{ kind: 'buildDistrict', district: 'CAMPUS' }];
    seatPhase(state);
    expect(envoysOf(cityState, 0)).toBe(0); // not built yet
    const campus = tileAtCoords(state.map, 6, 5);
    campus.district = 'CAMPUS';
    campus.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: campus.index });
    seatPhase(state);
    expect(envoysOf(cityState, 0)).toBe(1);
    expect(cityState.seatQuest[0]).toBeNull();
  });

  it('routes to city-states pay gold plus their specialty', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    city.buildings.push('MARKET'); // capacity 1
    const cityState = addCs(state, 9, 9, { type: 'scientific' });
    const r = addCsTradeRoute(state, city.id, cityState.id, 0);
    expect(r.ok).toBe(true);
    const y = cityTradeYields(state, city);
    expect(y.gold).toBe(3);
    expect(y.science).toBe(1);
    expect(addCsTradeRoute(state, city.id, cityState.id, 0).ok).toBe(false); // duplicate
  });

  it('unmet city-states cannot receive routes', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    city.buildings.push('MARKET');
    const cityState = addCs(state, 9, 9, { met: [] });
    expect(addCsTradeRoute(state, city.id, cityState.id, 0).ok).toBe(false);
  });
});

describe('determinism', () => {
  it('city-state games replay identically from a save', () => {
    const a = createGame({ width: 30, height: 20, seed: 9, withResources: true, withWonders: true, cityStates: true });
    const sites = a.map.tiles.filter((t) => canFoundCity(a, t.index, 0).ok);
    foundCity(a, sites[Math.floor(sites.length / 2)].index, 0);
    for (let i = 0; i < 5; i++) endTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 10; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('civ envoys and the suzerain contest', () => {
  it('suzerainty needs strictly more envoys than every civ', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'trade', envoys: { [0]: 3 } });
    expect(isSuzerain(cityState, 0)).toBe(true); // uncontested
    cityState.envoys = { [1]: 3 };
    expect(isSuzerain(cityState, 0)).toBe(false); // tied: nobody rules
    expect(isSuzerain(cityState, 1)).toBe(false);
    cityState.envoys = { [1]: 4 };
    expect(isSuzerain(cityState, 0)).toBe(false);
    expect(isSuzerain(cityState, 1)).toBe(true);
    cityState.envoys = { [0]: 5 };
    expect(isSuzerain(cityState, 0)).toBe(true);
    expect(isSuzerain(cityState, 1)).toBe(false);
  });

  it('the envoy bonuses apply the 1/3/6 thresholds off that civ only', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific' });
    cityState.envoys = { [1]: 6, [2]: 1 };
    const b0 = cityStateEnvoyBonuses(state, 1);
    expect(b0.capital.science).toBe(2);
    // At 6 envoys the 3-tier lands on the tier-1 building (LIBRARY) and
    // the 6-tier on the tier-2 building (UNIVERSITY) — +2 each, separate keys.
    expect(b0.buildingAdd.LIBRARY?.science).toBe(2);
    expect(b0.buildingAdd.UNIVERSITY?.science).toBe(2);
    const b1 = cityStateEnvoyBonuses(state, 2);
    expect(b1.capital.science).toBe(2);
    expect(b1.buildingAdd.LIBRARY).toBeUndefined(); // 1 envoy: capital only
  });
});

describe('suzerain unique perk (CITY_STATE_SUZERAIN_LIVE)', () => {
  it('grants the shipped channel yield to a strict seat-0 suzerain', () => {
    const state = makeState();
    // Geneva (scientific) is a SHIPPED row -> science channel.
    const cityState = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 3 } });
    expect(isSuzerain(cityState, 0)).toBe(true);
    expect(cityStateSuzerainCapitalBonus(state, 0).science).toBe(CITY_STATE_SUZERAIN_YIELD);
  });

  it('pays nothing for a descoped row or a non-suzerain', () => {
    const state = makeState();
    // Antioch (cultural) is DESCOPED (trade-route bonus) -> no live channel.
    const desc = addCs(state, 8, 8, { type: 'cultural', name: 'Antioch', envoys: { [0]: 4 } });
    expect(isSuzerain(desc, 0)).toBe(true);
    expect(cityStateSuzerainCapitalBonus(state, 0)).toEqual({});
    // A shipped row but only 2 envoys -> not suzerain -> no perk.
    const weak = addCs(state, 4, 4, { type: 'scientific', name: 'Geneva', envoys: { [0]: 2 } });
    expect(isSuzerain(weak, 0)).toBe(false);
    expect(cityStateSuzerainCapitalBonus(state, 0)).toEqual({});
  });

  it('loses the perk when a civ wins the strict contest', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 3 } });
    cityState.envoys = { [1]: 4 }; // civ 0 out-envoys seat 0
    expect(isSuzerain(cityState, 0)).toBe(false);
    expect(cityStateSuzerainCapitalBonus(state, 0)).toEqual({});
  });

  it('grants the perk to a strict civ suzerain (the civ twin)', () => {
    const state = makeState();
    // Vilnius (cultural) is SHIPPED -> culture channel.
    const cityState = addCs(state, 8, 8, { type: 'cultural', name: 'Vilnius', envoys: { [0]: 0 } });
    cityState.envoys = { [1]: 3 };
    expect(isSuzerain(cityState, 1)).toBe(true);
    expect(cityStateSuzerainCapitalBonus(state, 1).culture).toBe(CITY_STATE_SUZERAIN_YIELD);
    // no perk for a civ that is not the suzerain
    expect(cityStateSuzerainCapitalBonus(state, 2)).toEqual({});
  });
});
