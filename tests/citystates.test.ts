import { describe, it, expect } from 'vitest';
import { playerSeat, tileSeat, isCityStateSeat, setTileOwner, seatOfCityState, cityStateOfSeat, civOfRival , emptySeat } from '../src/core/seats';
import { makeState, tileAtCoords } from './helpers';
import { createGame, foundCity, endTurn, serialize, deserialize } from '../src/core/game';
import { canFoundCity } from '../src/core/rules';
import { borderCandidates, computeCityStats } from '../src/core/city';
import { tilesWithin, hexDistance } from '../src/core/hex';
import { cityStatePhase, assignEnvoy, envoyBonusDelta, csEnvoyBonuses, isSuzerain, csSuzerainCapitalBonus } from '../src/core/cityStates';
import { tradeCapacity, addCsTradeRoute, cityTradeYields } from '../src/core/trade';
import { ENVOY_COST, CS_SUZERAIN_YIELD } from '../src/data/cityStates';
import type { CityState, CityStateType, GameState } from '../src/core/types';

function addCs(
  state: GameState,
  col: number,
  row: number,
  opts: Partial<CityState> & { type?: CityStateType } = {},
): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)), // #51/S6.12
    id: state.cityStates.length,
    name: `Testopolis ${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 3,
    envoys: 0,
    met: true,
    quest: null,
    questIssuedTurn: 0,
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cs.id));
  state.cityStates.push(cs);
  return cs;
}

describe('city-state placement', () => {
  it('places spaced, deterministic city-states that claim territory', () => {
    const a = createGame({ width: 44, height: 26, seed: 5, withResources: true, withWonders: true, cityStates: true });
    const b = createGame({ width: 44, height: 26, seed: 5, withResources: true, withWonders: true, cityStates: true });
    expect(a.cityStates.length).toBeGreaterThanOrEqual(2);
    expect(serialize(a)).toBe(serialize(b));
    for (const cs of a.cityStates) {
      const center = a.map.tiles[cs.centerIndex];
      expect((isCityStateSeat(tileSeat(center)) ? cityStateOfSeat(tileSeat(center)) : -1)).toBe(cs.id);
      for (const other of a.cityStates) {
        if (other.id === cs.id) continue;
        const oc = a.map.tiles[other.centerIndex];
        expect(hexDistance(center.col, center.row, oc.col, oc.row)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('blocks settling on and next to city-states', () => {
    const state = makeState();
    const cs = addCs(state, 6, 6);
    expect(canFoundCity(state, cs.centerIndex).ok).toBe(false);
    const ring1 = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== cs.centerIndex)!;
    expect(canFoundCity(state, ring1.index).ok).toBe(false);
    const ring2 = tilesWithin(state.map, 6, 6, 2).find(
      (t) => hexDistance(t.col, t.row, 6, 6) === 2,
    )!;
    expect(canFoundCity(state, ring2.index).ok).toBe(false); // min city distance 4 (P4/D-5)
    const ring3 = tilesWithin(state.map, 6, 6, 3).find(
      (t) => hexDistance(t.col, t.row, 6, 6) === 3,
    )!;
    expect(canFoundCity(state, ring3.index).ok).toBe(false); // dist 3 blocked too
    const far = tileAtCoords(state.map, 10, 10);
    expect(canFoundCity(state, far.index).ok).toBe(true);
  });

  it('border growth never claims city-state territory', () => {
    const state = makeState();
    addCs(state, 8, 5);
    const city = foundCity(state, tileAtCoords(state.map, 4, 5).index).city!; // dist 4 from the CS (P4/D-5)
    const candidates = borderCandidates(state, city);
    for (const i of candidates) {
      expect((isCityStateSeat(tileSeat(state.map.tiles[i])) ? cityStateOfSeat(tileSeat(state.map.tiles[i])) : -1)).toBe(-1);
    }
  });
});

describe('envoys', () => {
  it('1 envoy boosts the capital; 3 boost matching districts; 3+ is suzerain', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    const cs = addCs(state, 9, 9, { type: 'scientific' });

    // Bonuses ride the normal yield pipeline (amenity multipliers included),
    // so assert a band rather than an exact +2.
    const before = computeCityStats(state, city).total.science;
    cs.envoys = 1;
    const withOne = computeCityStats(state, city).total.science;
    expect(withOne - before).toBeGreaterThanOrEqual(2);
    expect(withOne - before).toBeLessThan(2.5);

    // B-21: the 3/6 tiers now land on the CAMPUS BUILDINGS — a completed
    // Campus holding a Library (tier-1) collects the 3-envoy bonus, a
    // University (tier-2) the 6-envoy bonus.
    const campusTile = tileAtCoords(state.map, 6, 5);
    campusTile.district = 'CAMPUS';
    campusTile.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: campusTile.index });
    city.buildings.push('LIBRARY', 'UNIVERSITY');
    const campusBase = computeCityStats(state, city).total.science;
    cs.envoys = 3;
    const withThree = computeCityStats(state, city).total.science;
    expect(withThree - campusBase).toBeGreaterThanOrEqual(2);
    expect(withThree - campusBase).toBeLessThan(2.5);
    expect(isSuzerain(cs)).toBe(true);
    cs.envoys = 6;
    const withSix = computeCityStats(state, city).total.science;
    expect(withSix - campusBase).toBeGreaterThanOrEqual(4);
    expect(withSix - campusBase).toBeLessThan(5);
  });

  it('predicts the gain of the next envoy', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    const cs = addCs(state, 9, 9, { type: 'cultural' });
    expect(envoyBonusDelta(state, cs).culture).toBe(2); // crossing 1
    cs.envoys = 1;
    expect(envoyBonusDelta(state, cs).culture).toBe(0); // 2 crosses nothing
    cs.envoys = 2;
    const theater = tileAtCoords(state.map, 6, 5);
    theater.district = 'THEATER_SQUARE';
    theater.districtComplete = true;
    city.districts.push({ type: 'THEATER_SQUARE', tileIndex: theater.index });
    // B-21: the 3-envoy tier keys to the cultural tier-1 building (AMPHITHEATER).
    city.buildings.push('AMPHITHEATER');
    expect(envoyBonusDelta(state, cs).culture).toBe(2); // crossing 3 with one Amphitheater
  });

  it('suzerainty of a trade city-state adds route capacity', () => {
    const state = makeState();
    foundCity(state, tileAtCoords(state.map, 5, 5).index);
    const cs = addCs(state, 9, 9, { type: 'trade' });
    const base = tradeCapacity(state);
    cs.envoys = 3;
    expect(tradeCapacity(state)).toBe(base + 1);
  });

  it('assignEnvoy consumes the pool and needs contact', () => {
    const state = makeState();
    const met = addCs(state, 9, 9);
    const unmet = addCs(state, 3, 9, { met: false });
    playerSeat(state).envoysAvailable = 1;
    expect(assignEnvoy(state, unmet.id).ok).toBe(false);
    expect(assignEnvoy(state, met.id).ok).toBe(true);
    expect(met.envoys).toBe(1);
    expect(playerSeat(state).envoysAvailable).toBe(0);
    expect(assignEnvoy(state, met.id).ok).toBe(false); // pool empty
  });

  it('influence accrues into envoys once someone is met', () => {
    const state = makeState();
    addCs(state, 9, 9);
    playerSeat(state).influencePoints = ENVOY_COST - 2;
    cityStatePhase(state);
    expect(playerSeat(state).envoysAvailable).toBe(1);
    expect(playerSeat(state).influencePoints).toBeLessThan(ENVOY_COST);
  });

  it('aggregates bonuses across several city-states', () => {
    const state = makeState();
    addCs(state, 3, 3, { type: 'scientific', envoys: 1 });
    addCs(state, 9, 9, { type: 'religious', envoys: 3 });
    const bonuses = csEnvoyBonuses(state);
    expect(bonuses.capital.science).toBe(2);
    expect(bonuses.capital.faith).toBe(2);
    // B-21: the 3-envoy tier lands on the religious tier-1 building (SHRINE).
    expect(bonuses.buildingAdd.SHRINE?.faith).toBe(2);
  });
});

describe('quests and trade', () => {
  it('completing a quest earns an envoy', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    const cs = addCs(state, 9, 9);
    cs.quest = { kind: 'buildDistrict', district: 'CAMPUS' };
    cityStatePhase(state);
    expect(cs.envoys).toBe(0); // not built yet
    const campus = tileAtCoords(state.map, 6, 5);
    campus.district = 'CAMPUS';
    campus.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: campus.index });
    cityStatePhase(state);
    expect(cs.envoys).toBe(1);
    expect(cs.quest).toBeNull();
  });

  it('routes to city-states pay gold plus their specialty', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    city.buildings.push('MARKET'); // capacity 1
    const cs = addCs(state, 9, 9, { type: 'scientific' });
    const r = addCsTradeRoute(state, city.id, cs.id);
    expect(r.ok).toBe(true);
    const y = cityTradeYields(state, city);
    expect(y.gold).toBe(3);
    expect(y.science).toBe(1);
    expect(addCsTradeRoute(state, city.id, cs.id).ok).toBe(false); // duplicate
  });

  it('unmet city-states cannot receive routes', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    city.buildings.push('MARKET');
    const cs = addCs(state, 9, 9, { met: false });
    expect(addCsTradeRoute(state, city.id, cs.id).ok).toBe(false);
  });
});

describe('determinism', () => {
  it('city-state games replay identically from a save', () => {
    const a = createGame({ width: 30, height: 20, seed: 9, withResources: true, withWonders: true, cityStates: true });
    const sites = a.map.tiles.filter((t) => canFoundCity(a, t.index).ok);
    foundCity(a, sites[Math.floor(sites.length / 2)].index);
    for (let i = 0; i < 5; i++) endTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 10; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('rival envoys and the suzerain contest (A-12)', () => {
  it('suzerainty needs strictly more envoys than every rival', () => {
    const state = makeState();
    const cs = addCs(state, 8, 8, { type: 'trade', envoys: 3 });
    expect(isSuzerain(cs)).toBe(true); // uncontested
    cs.rivalEnvoys = [3];
    expect(isSuzerain(cs)).toBe(false); // tied: nobody rules
    expect(isSuzerain(cs, civOfRival(0))).toBe(false);
    cs.rivalEnvoys = [4];
    expect(isSuzerain(cs)).toBe(false);
    expect(isSuzerain(cs, civOfRival(0))).toBe(true);
    cs.envoys = 5;
    expect(isSuzerain(cs)).toBe(true);
    expect(isSuzerain(cs, civOfRival(0))).toBe(false);
  });

  it('csRivalEnvoyBonuses applies the 1/3/6 thresholds off that rival only', () => {
    const state = makeState();
    const cs = addCs(state, 8, 8, { type: 'scientific' });
    cs.rivalEnvoys = [6, 1];
    const b0 = csEnvoyBonuses(state, civOfRival(0));
    expect(b0.capital.science).toBe(2);
    // B-21: at 6 envoys the 3-tier lands on the tier-1 building (LIBRARY) and
    // the 6-tier on the tier-2 building (UNIVERSITY) — +2 each, separate keys.
    expect(b0.buildingAdd.LIBRARY?.science).toBe(2);
    expect(b0.buildingAdd.UNIVERSITY?.science).toBe(2);
    const b1 = csEnvoyBonuses(state, civOfRival(1));
    expect(b1.capital.science).toBe(2);
    expect(b1.buildingAdd.LIBRARY).toBeUndefined(); // 1 envoy: capital only
  });
});

describe('B-21 suzerain unique perk (CS_SUZERAIN_LIVE)', () => {
  it('grants the shipped channel yield to a strict player suzerain', () => {
    const state = makeState();
    // Geneva (scientific) is a SHIPPED row -> science channel.
    const cs = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: 3 });
    expect(isSuzerain(cs)).toBe(true);
    expect(csSuzerainCapitalBonus(state).science).toBe(CS_SUZERAIN_YIELD);
  });

  it('pays nothing for a descoped row or a non-suzerain', () => {
    const state = makeState();
    // Antioch (cultural) is DESCOPED (trade-route bonus) -> no live channel.
    const desc = addCs(state, 8, 8, { type: 'cultural', name: 'Antioch', envoys: 4 });
    expect(isSuzerain(desc)).toBe(true);
    expect(csSuzerainCapitalBonus(state)).toEqual({});
    // A shipped row but only 2 envoys -> not suzerain -> no perk.
    const weak = addCs(state, 4, 4, { type: 'scientific', name: 'Geneva', envoys: 2 });
    expect(isSuzerain(weak)).toBe(false);
    expect(csSuzerainCapitalBonus(state)).toEqual({});
  });

  it('loses the perk when a rival wins the strict contest', () => {
    const state = makeState();
    const cs = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: 3 });
    cs.rivalEnvoys = [4]; // rival 0 out-envoys the player
    expect(isSuzerain(cs)).toBe(false);
    expect(csSuzerainCapitalBonus(state)).toEqual({});
  });

  it('grants the perk to a strict rival suzerain (the rival twin)', () => {
    const state = makeState();
    // Vilnius (cultural) is SHIPPED -> culture channel.
    const cs = addCs(state, 8, 8, { type: 'cultural', name: 'Vilnius', envoys: 0 });
    cs.rivalEnvoys = [3];
    expect(isSuzerain(cs, civOfRival(0))).toBe(true);
    expect(csSuzerainCapitalBonus(state, civOfRival(0)).culture).toBe(CS_SUZERAIN_YIELD);
    // no perk for a rival that is not the suzerain
    expect(csSuzerainCapitalBonus(state, civOfRival(1))).toEqual({});
  });
});
