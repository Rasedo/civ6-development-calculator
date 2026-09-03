import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { canPlaceDistrict } from '../../../cpu/core/rules';
import { buildingFaithCost, canFoundReligion } from '../../../cpu/core/game';
import { greatPersonPointsPerTurn, advanceGreatPeople } from '../../../cpu/core/greatPeople';
import { emptyGovernors } from '../../../cpu/core/governors';
import { builderHarvest, spawnUnit, waterEnterable } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import {
  GOVERNOR_TITLE_YIELD_ROWS, GPP_BUILDING_ROWS, GP_FAVOR_ROWS, START_TECH_ROWS,
  SEAT_BAN_ROWS, SEAT_BANS, WORSHIP_ROWS, DISTRICT_UNIT_ROWS, OCEAN_ACCESS_ROWS,
} from '../../../cpu/data/civilizations';
import type { City, GameState } from '../../../cpu/core/types';

/**
 * THE TITLE, THE PRIZE, THE START AND THE BAN (CIV6, the install's
 * TraitModifiers): Seondeok's Hwarang, Sweden's Nobel Prize, the Maori's
 * Mana, Saladin's Righteousness of the Faith and Mvemba's Religious Convert.
 *
 * The GPU twin is tests/gpu/title_rows_test.py.
 */
/** the baseline: a seat with NO roster row, so no other civilization's own
 *  yields sit under the row being measured (`emptySeat` starts here). */
const PLAIN = -1;
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

/** Establish governor 0 in `city`, holding `promos` bought promotions. */
function govern(state: GameState, city: City, promos: number): void {
  const seat = state.seats[city.seat];
  seat.governors = emptyGovernors();
  seat.governors[0] = { appointed: true, cityId: city.id, minorId: -1, establishTurns: 0, outTurns: 0, promotions: promos };
}

describe('the wire', () => {
  it('carries every batch-nine family, and every ban is addressable', () => {
    expect(GOVERNOR_TITLE_YIELD_ROWS.length).toBe(2);
    expect(GPP_BUILDING_ROWS.length).toBe(2);
    expect(GP_FAVOR_ROWS.length).toBe(1);
    expect(START_TECH_ROWS.length).toBe(2);
    expect(SEAT_BAN_ROWS.length).toBe(5);
    expect(WORSHIP_ROWS.length).toBe(1);
    expect(DISTRICT_UNIT_ROWS.length).toBe(1);
    expect(OCEAN_ACCESS_ROWS.length).toBe(2);
    for (const r of SEAT_BAN_ROWS) expect(SEAT_BANS.indexOf(r.ban)).toBeGreaterThanOrEqual(0);
  });
});

describe('Hwarang', () => {
  const culture = (row: number, promos: number, established = true): number => {
    const state = sceneAs(row);
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    govern(state, city, promos);
    if (!established) state.seats[0].governors![0].establishTurns = 2;
    return computeCityStats(state, city).total.culture;
  };

  it('pays 3% per promotion the governor has earned, its first included', () => {
    const plain = culture(PLAIN, 0);
    expect(plain).toBeGreaterThan(0);
    expect(culture(leaderRow('SEONDEOK'), 0)).toBeCloseTo(plain * 1.03, 9);
    expect(culture(leaderRow('SEONDEOK'), 0b11)).toBeCloseTo(plain * 1.09, 9);
  });

  it('pays nothing while the governor is still establishing, or to another row', () => {
    const plain = culture(PLAIN, 0);
    expect(culture(leaderRow('SEONDEOK'), 0b11, false)).toBeCloseTo(plain, 9);
    expect(culture(PLAIN, 0b11)).toBeCloseTo(plain, 9);
  });
});

describe('the Nobel Prize', () => {
  const points = (row: number, building: string, cls: 'ENGINEER' | 'SCIENTIST'): number => {
    const state = sceneAs(row);
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const dt = tileAtCoords(state.map, 7, 6);
    const type = cls === 'ENGINEER' ? 'INDUSTRIAL_ZONE' : 'CAMPUS';
    city.districts.push({ type, tileIndex: dt.index });
    dt.district = type;
    dt.districtComplete = true;
    if (building) city.buildings.push(building);
    return greatPersonPointsPerTurn(state, 0)[cls] ?? 0;
  };

  it('adds one point from the University and one from the Factory', () => {
    const romeU = points(PLAIN, 'UNIVERSITY', 'SCIENTIST');
    expect(points(seatRow('SWEDEN'), 'UNIVERSITY', 'SCIENTIST')).toBeCloseTo(romeU + 1, 9);
    const romeF = points(PLAIN, 'FACTORY', 'ENGINEER');
    expect(points(seatRow('SWEDEN'), 'FACTORY', 'ENGINEER')).toBeCloseTo(romeF + 1, 9);
  });

  it('adds nothing where the named building is absent', () => {
    const bare = points(PLAIN, '', 'SCIENTIST');
    expect(points(seatRow('SWEDEN'), '', 'SCIENTIST')).toBeCloseTo(bare, 9);
  });

  it('hands 50 Diplomatic Favor with every person earned', () => {
    const favor = (row: number): { favor: number; earned: number } => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      state.seats[0].gpp = { SCIENTIST: 5000 };
      advanceGreatPeople(state, 0);
      return { favor: state.seats[0].diplomaticFavor, earned: state.seats[0].gpEarned.length };
    };
    const swede = favor(seatRow('SWEDEN'));
    const rome = favor(PLAIN);
    expect(swede.earned).toBeGreaterThan(0);
    expect(rome.favor).toBe(0);
    expect(swede.favor).toBe(50 * swede.earned);
  });
});

describe('Mana', () => {
  const harvestOn = (row: number): { ok: boolean; reason?: string } => {
    const state = sceneAs(row);
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const t = tileAtCoords(state.map, 7, 6);
    t.resource = 'WHEAT';
    setTileOwner(t, 0, city.id);
    const b = spawnUnit(state, 'BUILDER', t.index, 0);
    expect(b).toBeTruthy();
    return builderHarvest(state, b!.id);
  };

  it('names Sailing and Shipbuilding as the Maori start', () => {
    expect(START_TECH_ROWS.map((r) => r.tech).slice().sort()).toEqual(['SAILING', 'SHIPBUILDING']);
  });

  it('refuses the Maori a harvest, and refuses nobody else on that ground', () => {
    const maori = harvestOn(seatRow('MAORI'));
    expect(maori.ok).toBe(false);
    expect(maori.reason).toContain('cannot harvest');
    expect(harvestOn(PLAIN).reason ?? '').not.toContain('cannot harvest');
  });

  it('earns the Maori no Great Writer points at all', () => {
    const state = sceneAs(seatRow('MAORI'));
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    state.seats[0].gpp = { WRITER: 500 };
    advanceGreatPeople(state, 0);
    expect(state.seats[0].gpp.WRITER ?? 0).toBe(0);
  });
});

describe('the ocean rows', () => {
  const openAt = (row: number, techs: string[]): boolean => {
    const state = sceneAs(row);
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    state.seats[0].research.techs = techs.slice();
    const t = tileAtCoords(state.map, 7, 6);
    t.terrain = 'OCEAN';
    return waterEnterable(state, t, { seat: 0 });
  };

  it('opens the ocean on Cartography, the Knarr at Shipbuilding and Mana at once', () => {
    expect(openAt(PLAIN, [])).toBe(false);
    expect(openAt(PLAIN, ['CARTOGRAPHY'])).toBe(true);
    expect(openAt(seatRow('NORWAY'), [])).toBe(false);
    expect(openAt(seatRow('NORWAY'), ['SHIPBUILDING'])).toBe(true);
    expect(openAt(seatRow('NORWAY'), ['SAILING'])).toBe(false);
    expect(openAt(seatRow('MAORI'), [])).toBe(true);
  });
});

describe('Righteousness of the Faith', () => {
  it('prices the worship building at a tenth for Saladin alone', () => {
    const plain = sceneAs(PLAIN);
    const saladin = sceneAs(leaderRow('SALADIN'));
    const full = buildingFaithCost(plain, 0, 'CATHEDRAL');
    expect(full).toBeGreaterThan(0);
    expect(buildingFaithCost(saladin, 0, 'CATHEDRAL')).toBe(Math.round(full / 10));
    expect(buildingFaithCost(saladin, 0, 'MONUMENT')).toBe(buildingFaithCost(plain, 0, 'MONUMENT'));
  });

  it('adds 10% Science and Culture in a city holding one, and none without it', () => {
    const yieldsOf = (row: number, hold: boolean) => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      city.buildings.push('MONUMENT');
      if (hold) city.buildings.push('CATHEDRAL');
      return computeCityStats(state, city).total;
    };
    const plainHeld = yieldsOf(PLAIN, true);
    const held = yieldsOf(leaderRow('SALADIN'), true);
    expect(held.culture).toBeCloseTo(plainHeld.culture * 1.1, 9);
    expect(held.science).toBeCloseTo(plainHeld.science * 1.1, 9);
    const plainBare = yieldsOf(PLAIN, false);
    expect(yieldsOf(leaderRow('SALADIN'), false).culture).toBeCloseTo(plainBare.culture, 9);
  });
});

describe('Religious Convert', () => {
  it('refuses Mvemba the Holy Site, and refuses nobody else on that ground', () => {
    const state = sceneAs(leaderRow('MVEMBA'));
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const r = canPlaceDistrict(state, city, 'HOLY_SITE', tileAtCoords(state.map, 7, 6).index);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('may not build Holy Sites');
    const plain = sceneAs(PLAIN);
    const pcity = settleAt(plain, tileAtCoords(plain.map, 7, 7).index, 0);
    expect(canPlaceDistrict(plain, pcity, 'HOLY_SITE', tileAtCoords(plain.map, 7, 6).index).reason ?? '')
      .not.toContain('may not build Holy Sites');
  });

  it('refuses him the founding, before any other reason is reached', () => {
    const state = sceneAs(leaderRow('MVEMBA'));
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const f = canFoundReligion(state, 0);
    expect(f.ok).toBe(false);
    expect(f.reason).toContain('may not found');
  });

  it('earns him no Great Prophet points at all', () => {
    const state = sceneAs(leaderRow('MVEMBA'));
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    state.seats[0].gpp = { PROPHET: 500 };
    advanceGreatPeople(state, 0);
    expect(state.seats[0].gpp.PROPHET ?? 0).toBe(0);
  });
});
