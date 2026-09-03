import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs, grantCivics } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { getModifiers, prodMultFor } from '../../../cpu/core/effects';
import { greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { poweredExtra } from '../../../cpu/core/yields';
import { accrueStockpiles, stockpileCap } from '../../../cpu/core/stockpile';
import { extraCharges, spawnUnit } from '../../../cpu/core/units';
import { tilePurchaseCost, foundCityAt } from '../../../cpu/core/game';
import { validImprovements } from '../../../cpu/core/rules';
import { cityTradeYields } from '../../../cpu/core/trade';
import { spyCapacity } from '../../../cpu/core/espionage';
import { seatPhase } from '../../../cpu/core/phase';
import { neighbors } from '../../../world/hex';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { PROD_MULT_ROWS, CENTER_ADJ_ROWS, GREAT_WORK_YIELD_ROWS, POWERED_YIELD_ROWS, STOCKPILE_RATE_ROWS, GRANT_UNIT_ROWS, CAPITAL_ROWS } from '../../../cpu/data/civilizations';
import { STRATEGIC_IDS, STOCKPILE_CAP_BASE } from '../../../cpu/data/constants';
import { TECHS } from '../../../cpu/data/techs';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE CITY'S ROSTER ROWS (CIV6, the install's TraitModifiers): the centre's
 * terrain adjacency, the per-work yields, the Great Person factor, the
 * powered building's extra yield, strategic accumulation and its ceiling,
 * build charges, the tile price, the Farm's ground, the route's per-
 * improvement yields, the granted units, spy capacity and the first city.
 */
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number, terrain: 'GRASSLAND' | 'DESERT' | 'TUNDRA' = 'GRASSLAND'): GameState {
  const state = makeState(makeMap(14, 14, terrain));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

describe('the production rows widen', () => {
  it('name a district item, one unit type, or every item of a kind', () => {
    expect(PROD_MULT_ROWS.length).toBe(13);
    const hojo = PROD_MULT_ROWS.filter((r) => r.leader === 'HOJO');
    expect(prodMultFor(hojo, { kind: 'district', districtItem: 'ENCAMPMENT' })).toBe(2);
    expect(prodMultFor(hojo, { kind: 'district', districtItem: 'CAMPUS' })).toBe(1);
    const dutch = PROD_MULT_ROWS.filter((r) => r.civ === 'NETHERLANDS');
    expect(prodMultFor(dutch, { kind: 'district', districtItem: 'DAM' })).toBe(1.5);
    const mali = PROD_MULT_ROWS.filter((r) => r.civ === 'MALI');
    expect(prodMultFor(mali, { kind: 'building', building: 'MONUMENT' })).toBe(0.7);
    expect(prodMultFor(mali, { kind: 'unit', unit: 'WARRIOR', promoClass: 'MELEE' })).toBe(0.7);
    expect(prodMultFor(mali, { kind: 'district', districtItem: 'CAMPUS' })).toBe(1);
    const eng = PROD_MULT_ROWS.filter((r) => r.civ === 'ENGLAND');
    expect(prodMultFor(eng, { kind: 'unit', unit: 'MILITARY_ENGINEER', promoClass: 'SUPPORT' })).toBe(2 * 1);
    expect(prodMultFor(eng, { kind: 'unit', unit: 'WARRIOR', promoClass: 'MELEE' })).toBe(1);
  });

  it("Grote Rivieren: the Netherlands' three districts read the river as a major adjacency", () => {
    const state = sceneAs(seatRow('NETHERLANDS'));
    const add = getModifiers(state, 0).districtAdjacencyAdd;
    expect(add.CAMPUS?.[0]).toEqual({ source: 'RIVER', amount: 2 });
    expect(add.INDUSTRIAL_ZONE?.[0].source).toBe('RIVER');
    expect(getModifiers(state, 1).districtAdjacencyAdd.CAMPUS ?? []).toEqual([]);
  });
});

describe("Songs of the Jeli", () => {
  it("pays Mali's centre per adjacent Desert tile, and nobody else's", () => {
    expect(CENTER_ADJ_ROWS.length).toBe(2);
    const faithOf = (row: number): number => {
      const state = sceneAs(row, 'DESERT');
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      return computeCityStats(state, city).breakdown.tiles.faith;
    };
    const centre = tileAtCoords(makeMap(14, 14, 'DESERT'), 7, 7);
    const n = neighbors(makeMap(14, 14, 'DESERT'), centre).length;
    expect(faithOf(seatRow('MALI'))).toBe(faithOf(seatRow('AMERICA')) + n);
  });
});

describe('Nkisi', () => {
  it("pays Kongo per Relic and Artifact, and 50% more points for three classes", () => {
    expect(GREAT_WORK_YIELD_ROWS.length).toBe(8);
    const state = sceneAs(seatRow('KONGO'));
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    city.relics = 2;
    city.artifacts = 1;
    const kongo = computeCityStats(state, city).breakdown.buildings;
    const plain = sceneAs(seatRow('AMERICA'));
    const pc = settleAt(plain, tileAtCoords(plain.map, 7, 7).index, 0);
    pc.relics = 2;
    pc.artifacts = 1;
    const none = computeCityStats(plain, pc).breakdown.buildings;
    expect(kongo.gold - none.gold).toBe(4 * 3);
    expect(kongo.food - none.food).toBe(2 * 3);
    expect(kongo.production - none.production).toBe(2 * 3);
    expect(kongo.faith - none.faith).toBe(1 * 3);
    expect(getModifiers(state, 0).gppClassMult.ARTIST).toBe(1.5);
    expect(getModifiers(state, 0).gppClassMult.SCIENTIST).toBeUndefined();
    // the factor rides every per-turn source
    const pts = greatPersonPointsPerTurn(state, 0);
    expect(pts.ARTIST).toBe(0); // no Theater Square yet — the factor over zero
  });
});

describe('Workshop of the World', () => {
  it("adds +4 to each yield a POWERED building pays, England alone", () => {
    expect(POWERED_YIELD_ROWS.length).toBe(5);
    const state = sceneAs(seatRow('ENGLAND'));
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    expect(poweredExtra(getModifiers(state, 0), { science: 5 })).toEqual({ science: 4 });
    expect(poweredExtra(getModifiers(state, 0), { culture: 2, science: 0 })).toEqual({ culture: 4 });
    expect(poweredExtra(getModifiers(state, 1), { science: 5 })).toEqual({});
  });

  it('accumulates 2 more Iron and Coal per mine, and 10 more capacity per harbour building', () => {
    expect(STOCKPILE_RATE_ROWS.length).toBe(4);
    const bankOf = (row: number, resource: 'IRON' | 'COAL'): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      const t = tileAtCoords(state.map, 7, 8);
      setTileOwner(t, 0, city.id);
      t.resource = resource;
      t.improvement = 'MINE';
      accrueStockpiles(state, 0);
      return state.seats[0].stockpile![STRATEGIC_IDS.indexOf(resource)];
    };
    expect(bankOf(seatRow('ENGLAND'), 'IRON')).toBe(bankOf(seatRow('AMERICA'), 'IRON') + 2);
    expect(bankOf(seatRow('ENGLAND'), 'COAL')).toBe(bankOf(seatRow('AMERICA'), 'COAL') + 2);
    const state = sceneAs(seatRow('ENGLAND'));
    const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE);
    city.buildings.push('LIGHTHOUSE');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE + 10);
    city.buildings.push('SEAPORT');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE + 20);
  });

  it('gives a Military Engineer two more charges', () => {
    const eng = sceneAs(seatRow('ENGLAND'));
    const at = tileAtCoords(eng.map, 7, 7);
    expect(extraCharges(eng, 0, 'MILITARY_ENGINEER', at)).toBe(2);
    expect(extraCharges(eng, 0, 'BUILDER', at)).toBe(0);
    expect(extraCharges(eng, 1, 'MILITARY_ENGINEER', at)).toBe(0);
  });
});

describe('The Last Best West', () => {
  it("halves Canada's tundra tile price and farms the tundra, hills at Civil Engineering", () => {
    const price = (row: number): number => {
      const state = sceneAs(row, 'TUNDRA');
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      return tilePurchaseCost(state, city, tileAtCoords(state.map, 7, 9).index);
    };
    expect(price(leaderRow('LAURIER'))).toBe(Math.round(price(seatRow('AMERICA')) * 0.5));
    const state = sceneAs(leaderRow('LAURIER'), 'TUNDRA');
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    grantTechs(state, 'POTTERY', 'IRRIGATION');
    const flat = tileAtCoords(state.map, 7, 8);
    setTileOwner(flat, 0, state.seats[0].cities[0].id);
    expect(validImprovements(state, flat, 0)).toContain('FARM');
    const hill = tileAtCoords(state.map, 7, 9);
    hill.elevation = 'HILLS';
    setTileOwner(hill, 0, state.seats[0].cities[0].id);
    expect(validImprovements(state, hill, 0)).not.toContain('FARM');
    grantCivics(state, 'CIVIL_ENGINEERING');
    expect(validImprovements(state, hill, 0)).toContain('FARM');
    // a plain seat farms neither
    const plain = sceneAs(seatRow('AMERICA'), 'TUNDRA');
    settleAt(plain, tileAtCoords(plain.map, 7, 7).index, 0);
    grantTechs(plain, 'POTTERY', 'IRRIGATION');
    const pf = tileAtCoords(plain.map, 7, 8);
    setTileOwner(pf, 0, plain.seats[0].cities[0].id);
    expect(validImprovements(plain, pf, 0)).not.toContain('FARM');
  });
});

describe('Favorable Terms', () => {
  it("pays Poundmaker per Camp at the route's destination, and per Camp here on a route in", () => {
    const state = sceneAs(leaderRow('POUNDMAKER'));
    const from = settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    const to = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const camp = tileAtCoords(state.map, 9, 8);
    setTileOwner(camp, 0, to.id);
    camp.resource = 'DEER';
    camp.improvement = 'CAMP';
    state.seats[0].tradeRoutes = [{ from: from.id, to: to.id, turnsLeft: 20 } as never];
    const out = cityTradeYields(state, from, 0);
    expect(out.food).toBe(1 + 1); // routeYields' own food, plus the Camp
    // the destination side: another seat's route in pays this seat gold per Camp here
    const homeCamp = tileAtCoords(state.map, 3, 4);
    setTileOwner(homeCamp, 0, from.id);
    homeCamp.resource = 'DEER';
    homeCamp.improvement = 'CAMP';
    state.seats[1].tradeRoutes = [{ from: 1, toSeat: 0, toSeatCity: from.id, turnsLeft: 20 } as never];
    // one foreign route in pays the origin per Camp HERE; the domestic route
    // this seat sent pays its own destination the same way
    expect(cityTradeYields(state, from, 0).gold).toBe(1);
    expect(cityTradeYields(state, to, 0).gold).toBe(1);
    const plain = sceneAs(seatRow('AMERICA'));
    const pf = settleAt(plain, tileAtCoords(plain.map, 3, 3).index, 0);
    const pt = settleAt(plain, tileAtCoords(plain.map, 9, 9).index, 0);
    const pc = tileAtCoords(plain.map, 9, 8);
    setTileOwner(pc, 0, pt.id);
    pc.resource = 'DEER';
    pc.improvement = 'CAMP';
    plain.seats[0].tradeRoutes = [{ from: pf.id, to: pt.id, turnsLeft: 20 } as never];
    expect(cityTradeYields(plain, pf, 0).food).toBe(1);
    expect(cityTradeYields(plain, pt, 0).gold).toBe(0);
  });
});

describe('the granted units', () => {
  it('the Cree Trader at Pottery, and nobody else at that technology', () => {
    // the TECH-keyed rows, not the list's length: the family also carries
    // founding grants now, and a bare count moves with every one of them
    expect(GRANT_UNIT_ROWS.filter((r) => r.tech !== undefined).length).toBe(2);
    expect(GRANT_UNIT_ROWS.filter((r) => r.tech === 'POTTERY').length).toBe(1);
    const born = (row: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      state.seats[0].capitalTile = city.centerIndex;
      state.seats[0].research.tech = 'POTTERY';
      state.seats[0].research.techProgress = TECHS.POTTERY.cost * 10;
      state.unitsMode = true;
      seatPhase(state);
      return state.units.filter((u: { type: string; seat: number }) => u.type === 'TRADER' && u.seat === 0).length;
    };
    expect(born(seatRow('CREE'))).toBe(1);
    expect(born(seatRow('AMERICA'))).toBe(0);
  });

  it("Catherine's Spy and her capacity at Castles", () => {
    const state = sceneAs(leaderRow('CATHERINE_DE_MEDICI'));
    settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
    const base = spyCapacity(state, 0);
    grantTechs(state, 'CASTLES');
    expect(spyCapacity(state, 0)).toBe(base + 1);
    const plain = sceneAs(seatRow('AMERICA'));
    settleAt(plain, tileAtCoords(plain.map, 7, 7).index, 0);
    const pb = spyCapacity(plain, 0);
    grantTechs(plain, 'CASTLES');
    expect(spyCapacity(plain, 0)).toBe(pb);
  });

  it("Kupe's Voyage: the first city starts at 2 Population with a Builder, and the Palace pays more", () => {
    expect(CAPITAL_ROWS.length).toBe(1);
    const state = sceneAs(leaderRow('KUPE'));
    state.unitsMode = true;
    const city = foundCityAt(state, 0, tileAtCoords(state.map, 7, 7), state.seats[0]);
    expect(city.population).toBe(2);
    expect(state.units.filter((u) => u.type === 'BUILDER').length).toBe(1);
    const second = foundCityAt(state, 0, tileAtCoords(state.map, 3, 3), state.seats[0]);
    expect(second.population).toBe(1);
    expect(state.units.filter((u) => u.type === 'BUILDER').length).toBe(1);
    const plain = sceneAs(seatRow('AMERICA'));
    const pc = foundCityAt(plain, 0, tileAtCoords(plain.map, 7, 7), plain.seats[0]);
    expect(pc.population).toBe(1);
    // the Palace's housing and amenity, over the plain seat's
    const kupeH = computeCityStats(state, city).housing;
    const plainH = computeCityStats(plain, pc).housing;
    expect(kupeH).toBe(plainH + 3);
  });

  it('+2 Science and +2 Culture per turn before the first city', () => {
    const state = sceneAs(leaderRow('KUPE'));
    const sci = state.seats[0].research.techProgress;
    spawnUnit(state, 'SETTLER', tileAtCoords(state.map, 7, 7).index, 0);
    seatPhase(state);
    expect(state.seats[0].research.techProgress).toBe(sci + 2);
    expect(state.seats[0].research.civicProgress).toBe(2);
  });
});
