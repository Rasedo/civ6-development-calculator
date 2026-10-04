import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, emptySeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, setWar, tileSeat } from '../../../cpu/core/seats';
import { seededGame, makeMap, makeState, tileAtCoords } from '../helpers';
import { neighbors } from '../../../world/hex';
import { spawnUnit } from '../../../cpu/core/units';
import { hostileUnitAct } from '../../../cpu/core/combat';
import { BARB_SEAT } from '../../../cpu/core/seats';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { CITY_STATE_START_DIST } from '../../../seeder/place';
import { canFoundCity } from '../../../cpu/core/rules';
import { seatPhase } from '../../../cpu/core/phase';
import { borderCandidates, computeCityStats } from '../../../cpu/core/city';
import { tilesWithin, hexDistance } from '../../../world/hex';
import { assignEnvoy, cityStateEnvoyBonuses, cityStateItemProduction, envoysOf, isSuzerain, suzerainSciencePct } from '../../../cpu/core/cityStates';
import { tradeCapacity, addCsTradeRoute, cityTradeYields } from '../../../cpu/core/trade';
import { ENVOY_COST, GENEVA_SCIENCE_PCT } from '../../../cpu/data/cityStates';
import { type CityState, type CityStateType, type GameState } from '../../../cpu/core/types';

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
  it('a seeded world places spaced, deterministic city-states that claim territory', () => {
    const a = seededGame(5, 1, 3);
    const b = seededGame(5, 1, 3);
    expect(a.cityStates.length).toBe(3);
    expect(serialize(a)).toBe(serialize(b));
    for (const cityState of a.cityStates) {
      const center = a.map.tiles[cityState.centerIndex];
      expect((isCityStateSeat(tileSeat(center)) ? cityStateOfSeat(tileSeat(center)) : -1)).toBe(cityState.id);
      for (const other of a.cityStates) {
        if (other.id === cityState.id) continue;
        const oc = a.map.tiles[other.centerIndex];
        expect(hexDistance(a.map, center.col, center.row, oc.col, oc.row)).toBeGreaterThanOrEqual(CITY_STATE_START_DIST);
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
      (t) => hexDistance(state.map, t.col, t.row, 6, 6) === 2,
    )!;
    expect(canFoundCity(state, ring2.index, 0).ok).toBe(false); // min city distance 4
    const ring3 = tilesWithin(state.map, 6, 6, 3).find(
      (t) => hexDistance(state.map, t.col, t.row, 6, 6) === 3,
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
  it('1 envoy boosts the capital and the Library; 3 the University; 3+ is suzerain', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const cityState = addCs(state, 9, 9, { type: 'scientific' });

    // Bonuses ride the normal yield pipeline (amenity multipliers included),
    // so assert a band rather than an exact +1.
    const before = computeCityStats(state, city).total.science;
    cityState.envoys = { [0]: 1 };
    const withOne = computeCityStats(state, city).total.science;
    expect(withOne - before).toBeGreaterThanOrEqual(1);
    expect(withOne - before).toBeLessThan(1.5);

    const campusTile = tileAtCoords(state.map, 6, 5);
    campusTile.district = 'CAMPUS';
    campusTile.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: campusTile.index });
    city.buildings.push('LIBRARY');
    const libBase = computeCityStats(state, city).total.science;
    cityState.envoys = {};
    const libNone = computeCityStats(state, city).total.science;
    expect(libBase - libNone).toBeGreaterThanOrEqual(2); // capital 1 + Library 1
    expect(libBase - libNone).toBeLessThan(2.5);
    cityState.envoys = { [0]: 1 };
    city.buildings.push('UNIVERSITY');
    const campusBase = computeCityStats(state, city).total.science;
    cityState.envoys = { [0]: 3 };
    const withThree = computeCityStats(state, city).total.science;
    expect(withThree - campusBase).toBeGreaterThanOrEqual(2);
    expect(withThree - campusBase).toBeLessThan(2.5);
    expect(isSuzerain(state, cityState, 0)).toBe(true);
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
    foundCity(state, tileAtCoords(state.map, 4, 4).index, 0); // the seat loop skips cityless seats
    addCs(state, 9, 9);
    seatOf(state, 0)!.influencePoints = ENVOY_COST - 2;
    seatPhase(state); // influence accrues in the SEAT phase, per actor
    expect(seatOf(state, 0)!.envoysAvailable).toBe(1);
    expect(seatOf(state, 0)!.influencePoints).toBeLessThan(ENVOY_COST);
  });

  it('aggregates bonuses across several city-states', () => {
    const state = makeState();
    addCs(state, 3, 3, { type: 'scientific', envoys: { [0]: 1 } });
    addCs(state, 9, 9, { type: 'religious', envoys: { [0]: 3 } });
    const bonuses = cityStateEnvoyBonuses(state, 0);
    expect(bonuses.capital.science).toBe(1);
    expect(bonuses.buildingAdd.LIBRARY?.science).toBe(1);
    expect(bonuses.capital.faith).toBe(1);
    expect(bonuses.buildingAdd.SHRINE?.faith).toBe(1);
    expect(bonuses.buildingAdd.TEMPLE?.faith).toBe(2);
    expect(bonuses.buildingAdd.CONSULATE).toEqual({ faith: 2 });
    expect(bonuses.buildingAdd.CATHEDRAL).toBeUndefined();
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

  it('routes to city-states pay the international column of their districts', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    city.buildings.push('MARKET'); // capacity 1
    const cityState = addCs(state, 9, 9, { type: 'scientific' });
    const r = addCsTradeRoute(state, city.id, cityState.id, 0);
    expect(r.ok).toBe(true);
    // the centre alone: its Gold 3, and no specialty yield of the type
    let y = cityTradeYields(state, city);
    expect(y.gold).toBe(3);
    expect(y.science).toBe(0);
    // a completed Campus beside it pays its Science 1
    const campus = tileAtCoords(state.map, 9, 10);
    campus.district = 'CAMPUS';
    campus.districtComplete = true;
    cityState.districts = [{ type: 'CAMPUS', tileIndex: campus.index }];
    y = cityTradeYields(state, city);
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
    const a = seededGame(9, 1, 3);
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
    expect(isSuzerain(state, cityState, 0)).toBe(true); // uncontested
    cityState.envoys = { [0]: 3, [1]: 3 }; // ONE envoy map for every seat: a tie rules nobody
    expect(isSuzerain(state, cityState, 0)).toBe(false);
    expect(isSuzerain(state, cityState, 1)).toBe(false);
    cityState.envoys = { [1]: 3 };
    expect(isSuzerain(state, cityState, 0)).toBe(false);
    expect(isSuzerain(state, cityState, 1)).toBe(true); // any seat rules uncontested at the minimum
    cityState.envoys = { [0]: 3, [1]: 4 };
    expect(isSuzerain(state, cityState, 0)).toBe(false);
    expect(isSuzerain(state, cityState, 1)).toBe(true); // strictly more
    cityState.envoys = { [0]: 5 };
    expect(isSuzerain(state, cityState, 0)).toBe(true);
    expect(isSuzerain(state, cityState, 1)).toBe(false);
  });

  it('the envoy bonuses apply the 1/3/6 thresholds off that civ only', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific' });
    cityState.envoys = { [1]: 6, [2]: 1 };
    const b0 = cityStateEnvoyBonuses(state, 1);
    expect(b0.capital.science).toBe(1);
    expect(b0.buildingAdd.LIBRARY?.science).toBe(1);
    expect(b0.buildingAdd.UNIVERSITY?.science).toBe(2);
    expect(b0.buildingAdd.CONSULATE?.science).toBe(2);
    expect(b0.buildingAdd.RESEARCH_LAB?.science).toBe(3);
    expect(b0.buildingAdd.CHANCERY?.science).toBe(3);
    const b1 = cityStateEnvoyBonuses(state, 2);
    expect(b1.capital.science).toBe(1);
    expect(b1.buildingAdd.LIBRARY?.science).toBe(1);
    expect(b1.buildingAdd.UNIVERSITY).toBeUndefined(); // 1 envoy: the capital and the Library
  });

  // CIV6 (Leaders.xml / Expansion1_Leaders.xml): the Industrial and
  // Militaristic ladders are ADJUST_*_PRODUCTION toward items, never a yield.
  it('the production types pay no yield, on the capital or a building', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    city.buildings.push('BARRACKS', 'ARMORY');
    const before = computeCityStats(state, city).total.production;
    addCs(state, 8, 8, { type: 'militaristic', envoys: { [0]: 6 } });
    addCs(state, 2, 9, { type: 'industrial', envoys: { [0]: 1 } });
    const b = cityStateEnvoyBonuses(state, 0);
    expect(b.capital).toEqual({});
    expect(b.buildingAdd).toEqual({});
    expect(computeCityStats(state, city).total.production).toBe(before);
  });

  it('Industrial: production toward wonders, buildings and districts in the capital and the Workshop, Factory, Consulate cities', () => {
    const state = makeState();
    const capital = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const other = foundCity(state, tileAtCoords(state.map, 11, 5).index, 0).city!;
    const cs = addCs(state, 8, 10, { type: 'industrial', envoys: { [0]: 1 } });
    expect(capital.isCapital && !other.isCapital).toBe(true);
    for (const k of ['building', 'wonder', 'district'] as const) expect(cityStateItemProduction(state, capital, k)).toBe(1);
    for (const k of ['unit', 'settler', 'project'] as const) expect(cityStateItemProduction(state, capital, k)).toBe(0);
    expect(cityStateItemProduction(state, other, 'building')).toBe(0);
    other.buildings.push('WORKSHOP', 'FACTORY');
    expect(cityStateItemProduction(state, other, 'building')).toBe(1); // 1 envoy: the Workshop
    cs.envoys = { [0]: 3 };
    expect(cityStateItemProduction(state, other, 'district')).toBe(3); // Workshop 1 + Factory 2
    other.buildings.push('CONSULATE');
    expect(cityStateItemProduction(state, other, 'district')).toBe(5); // a Consulate beside the Factory pays again
    cs.envoys = { [0]: 6 };
    other.buildings.push('COAL_POWER_PLANT');
    expect(cityStateItemProduction(state, other, 'building')).toBe(8);
    expect(cityStateItemProduction(state, capital, 'district')).toBe(1); // none of the buildings there
    // two Industrial minors stack
    addCs(state, 2, 10, { type: 'industrial', envoys: { [0]: 1 } });
    expect(cityStateItemProduction(state, capital, 'wonder')).toBe(2);
  });

  it('Militaristic: production toward units (a Settler is one) in the capital, Barracks-or-Stable and Armory cities', () => {
    const state = makeState();
    const capital = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    const other = foundCity(state, tileAtCoords(state.map, 11, 5).index, 0).city!;
    addCs(state, 8, 10, { type: 'militaristic', envoys: { [0]: 6 } });
    expect(cityStateItemProduction(state, capital, 'unit')).toBe(1);
    expect(cityStateItemProduction(state, capital, 'settler')).toBe(1);
    expect(cityStateItemProduction(state, capital, 'building')).toBe(0);
    other.buildings.push('STABLE');
    expect(cityStateItemProduction(state, other, 'unit')).toBe(1);
    other.buildings.push('ARMORY');
    expect(cityStateItemProduction(state, other, 'unit')).toBe(3);
    other.pillagedBuildings = ['ARMORY'];
    expect(cityStateItemProduction(state, other, 'unit')).toBe(1); // a pillaged Armory does not count
  });

  it('the flat add joins the Production before the item percents', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    addCs(state, 9, 9, { type: 'militaristic', envoys: { [0]: 1 } });
    city.queue = [{ kind: 'unit', unit: 'WARRIOR', progress: 0, cost: 1000 }];
    const made = computeCityStats(state, city).total.production;
    seatPhase(state);
    expect(city.queue[0].progress).toBeCloseTo(made + 1, 9);
  });
});

describe("the suzerain's own rule (Geneva's science percent)", () => {
  it('pays a strict seat-0 suzerain', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 3 } });
    expect(isSuzerain(state, cityState, 0)).toBe(true);
    expect(suzerainSciencePct(state, 0)).toBe(GENEVA_SCIENCE_PCT);
  });

  it('pays nothing for another minor, or below the envoy bar', () => {
    const state = makeState();
    // Kumasi pays its OWN rule, never Geneva's.
    const other = addCs(state, 8, 8, { type: 'cultural', name: 'Kumasi', envoys: { [0]: 4 } });
    expect(isSuzerain(state, other, 0)).toBe(true);
    expect(suzerainSciencePct(state, 0)).toBe(0);
    const weak = addCs(state, 4, 4, { type: 'scientific', name: 'Geneva', envoys: { [0]: 2 } });
    expect(isSuzerain(state, weak, 0)).toBe(false);
    expect(suzerainSciencePct(state, 0)).toBe(0);
  });

  it('loses the rule when a civ wins the strict contest', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 3 } });
    cityState.envoys = { [1]: 4 }; // civ 1 out-envoys seat 0
    expect(isSuzerain(state, cityState, 0)).toBe(false);
    expect(suzerainSciencePct(state, 0)).toBe(0);
  });

  it('is a PEACE rule — a war with a major silences it', () => {
    // CIV6 (Geneva): "when you are not at war with any civilization".
    const state = makeState();
    state.seats.push(emptySeat(1));
    const geneva = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 3 } });
    expect(isSuzerain(state, geneva, 0)).toBe(true);
    expect(suzerainSciencePct(state, 0)).toBe(GENEVA_SCIENCE_PCT);
    setWar(state, 0, 1, true);
    expect(suzerainSciencePct(state, 0)).toBe(0);
    setWar(state, 0, 1, false);
    expect(suzerainSciencePct(state, 0)).toBe(GENEVA_SCIENCE_PCT);
  });

  it('pays a strict CIV suzerain the same way (the civ twin)', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, { type: 'scientific', name: 'Geneva', envoys: { [0]: 0 } });
    cityState.envoys = { [1]: 3 };
    expect(isSuzerain(state, cityState, 1)).toBe(true);
    expect(suzerainSciencePct(state, 1)).toBe(GENEVA_SCIENCE_PCT);
    expect(suzerainSciencePct(state, 2)).toBe(0);
  });
});

describe('a hostile walker marches on a minor', () => {
  function board(): { state: GameState; cs: CityState } {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const cs = addCs(state, 18, 12);
    return { state, cs };
  }

  it('pillages a city-state improvement it stands on', () => {
    const { state, cs } = board();
    const t = state.map.tiles[cs.centerIndex];
    // hand the minor a distance-2 tile: an ADJACENT raider attacks the city
    // first (the majors' own precedence), so the pillage needs open ground
    const ground = state.map.tiles.find((n) =>
      hexDistance(state.map, n.col, n.row, t.col, t.row) === 2)!;
    setTileOwner(ground, cs.seat);
    ground.improvement = 'FARM';
    const barb = spawnUnit(state, 'WARRIOR', ground.index, BARB_SEAT)!;
    hostileUnitAct(state, barb);
    expect(ground.pillaged).toBe(true);
  });

  it('walks toward a city-state IMPROVEMENT within reach', () => {
    const { state, cs } = board();
    const t = state.map.tiles[cs.centerIndex];
    const job = neighbors(state.map, t).find((n) => tileSeat(n) === cs.seat)!;
    job.improvement = 'FARM';
    const start = tileAtCoords(state.map, 12, 12);
    const barb = spawnUnit(state, 'WARRIOR', start.index, BARB_SEAT)!;
    const d = (a: { col: number; row: number }) => hexDistance(state.map, a.col, a.row, job.col, job.row);
    expect(d(start)).toBeLessThan(13);
    hostileUnitAct(state, barb);
    expect(d(state.map.tiles[barb.tileIndex])).toBeLessThan(d(start));
  });

  it('beelines to the minor CITY — barbarians raid anyone', () => {
    // Real Civ 6 barbarians raid whoever is near the camp: a city-state's
    // CITY is a march target like any major's, and the walker stops adjacent.
    const { state, cs } = board();
    const start = tileAtCoords(state.map, 6, 12);
    const barb = spawnUnit(state, 'WARRIOR', start.index, BARB_SEAT)!;
    const ct = state.map.tiles[cs.centerIndex];
    const d = (a: { col: number; row: number }) => hexDistance(state.map, a.col, a.row, ct.col, ct.row);
    const d0 = d(start);
    hostileUnitAct(state, barb);
    expect(d(state.map.tiles[barb.tileIndex])).toBeLessThan(d0);
  });

  it('assaults an adjacent minor and floors it at 1 HP — never a capture', () => {
    const { state, cs } = board();
    const ct = state.map.tiles[cs.centerIndex];
    const ring = neighbors(state.map, ct).find((n) => tileSeat(n) === cs.seat)!;
    const barb = spawnUnit(state, 'WARRIOR', ring.index, BARB_SEAT)!;
    cs.hp = 5;
    hostileUnitAct(state, barb);
    expect(cs.hp).toBe(1);
    expect(state.cityStates.some((c) => c.id === cs.id)).toBe(true);
  });
});
