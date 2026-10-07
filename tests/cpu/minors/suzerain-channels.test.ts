/**
 * THE NINE SUZERAIN ROWS THAT USED TO RIDE A FLAT CAPITAL CHANNEL. The seven
 * that were always rules are pinned in `suzerain-rules.test.ts` beside this
 * one. Every magnitude below is the install's own, quoted at its catalog row in
 * cpu/data/cityStates.ts; the flat channel is retired, so a suzerain row that
 * pays nothing here pays nothing at all.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { getModifiers, goldPrice } from '../../../cpu/core/effects';
import { cityDistrictYields, onOrNextToShallowWater } from '../../../cpu/core/yields';
import { luxuryAmenities } from '../../../cpu/core/city';
import { greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { gpActivatedPressure, unitGoldPrice, unitPurchaseCost } from '../../../cpu/core/game';
import { suzerainProjectMult, suzerainLandPurchaseOffPct } from '../../../cpu/core/cityStates';
import { routeChainGold, routeLengthGold, routeDestLuxuryGold } from '../../../cpu/core/trade';
import {
  CITY_STATE_SUZERAIN_BONUS, SUZ_EFFECTS, BOLOGNA_DISTRICT_GPP, BOLOGNA_GPP_BUILDING,
  NAN_MADOL_WATER_CULTURE, AMSTERDAM_DEST_LUXURY_GOLD, ZANZIBAR_LUXURIES,
  ZANZIBAR_LUXURY_AMENITIES, HUNZA_PATH_TILE_GOLD_FX,
  HONG_KONG_PROJECT_PCT, NGAZARGAMU_PURCHASE_PCT, BUENOS_AIRES_AMENITIES, VATICAN_GP_PRESSURE,
  type SuzEffect,
} from '../../../cpu/data/cityStates';
import { GP_CLASSES, GP_CLASS_DISTRICT } from '../../../cpu/data/greatPeople';
import { THEO_PRESSURE_RANGE } from '../../../cpu/data/religion';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState, TradeRoute } from '../../../cpu/core/types';

/** Seat 0 becomes the strict suzerain of one minor carrying `effect`. */
function suzerainOf(state: GameState, effect: SuzEffect): void {
  const center = tileAtCoords(state.map, 12, 12);
  const id = state.cityStates.length;
  const name = Object.keys(CITY_STATE_SUZERAIN_BONUS)
    .find((n) => CITY_STATE_SUZERAIN_BONUS[n].suz === effect);
  expect(name, `no catalog row carries ${effect}`).toBeTruthy();
  state.cityStates.push({
    ...emptySeat(seatOfCityState(id)),
    id,
    name: name!,
    type: 'trade',
    centerIndex: center.index,
    population: 3,
    envoys: { 0: 3 },
    met: [0],
  });
  setTileOwner(center, seatOfCityState(id));
}

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 24));
  const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  return { state, city };
}

describe('every catalog row names a rule the wire carries', () => {
  it('leaves no row on a flat channel', () => {
    for (const [name, row] of Object.entries(CITY_STATE_SUZERAIN_BONUS)) {
      expect(SUZ_EFFECTS, `${name} names an unknown perk`).toContain(row.suz);
    }
  });
});

describe("Bologna's per-building Great Person point", () => {
  it("names the tier-1 building of each class's own district", () => {
    // the install keys each of its nine rows on a BUILDING requirement, and
    // every one of them is that class's district's first building
    for (const cls of GP_CLASSES) {
      const blds = BOLOGNA_GPP_BUILDING[cls];
      expect(blds, `${cls} has no Bologna building`).toBeTruthy();
      for (const b of blds) {
        expect(BUILDINGS[b]?.district, `${b} is not in ${GP_CLASS_DISTRICT[cls]}`)
          .toBe(GP_CLASS_DISTRICT[cls]);
      }
    }
  });

  it('pays exactly one point per class, and only with the building', () => {
    const { state, city } = scene();
    const tile = tileAtCoords(state.map, 6, 5);
    tile.district = 'CAMPUS';
    tile.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: tile.index });
    suzerainOf(state, 'districtGpp');
    const noBuilding = greatPersonPointsPerTurn(state, 0).SCIENTIST;
    state.cityStates[0].envoys = {};
    expect(greatPersonPointsPerTurn(state, 0).SCIENTIST)
      .toBeCloseTo(noBuilding, 9); // the rule names the BUILDING, not the district
    city.buildings.push('LIBRARY');
    const noSuz = greatPersonPointsPerTurn(state, 0).SCIENTIST;
    state.cityStates[0].envoys = { 0: 3 };
    const withSuz = greatPersonPointsPerTurn(state, 0).SCIENTIST;
    expect(withSuz - noSuz).toBeCloseTo(BOLOGNA_DISTRICT_GPP, 9);
  });
});

describe("Nan Madol's water-adjacent districts", () => {
  it('reads shallow water on the tile or next to it, and a lake is coast', () => {
    const state = makeState(makeMap(16, 16));
    const t = tileAtCoords(state.map, 5, 5);
    const n = tileAtCoords(state.map, 6, 5);
    t.terrain = 'PLAINS';
    n.terrain = 'PLAINS';
    expect(onOrNextToShallowWater(state.map, t)).toBe(false);
    n.terrain = 'LAKE';
    expect(onOrNextToShallowWater(state.map, t)).toBe(true);
    n.terrain = 'COAST';
    expect(onOrNextToShallowWater(state.map, t)).toBe(true);
    n.terrain = 'OCEAN';
    expect(onOrNextToShallowWater(state.map, t)).toBe(false);
    t.terrain = 'COAST';
    expect(onOrNextToShallowWater(state.map, t)).toBe(true);
  });

  it('pays the CITY CENTER too, and only next to shallow water', () => {
    const { state, city } = scene();
    const ctr = state.map.tiles[city.centerIndex];
    ctr.terrain = 'PLAINS';
    for (const nb of [tileAtCoords(state.map, 6, 5), tileAtCoords(state.map, 5, 6)]) nb.terrain = 'PLAINS';
    suzerainOf(state, 'waterDistrictCulture');
    const dry = cityDistrictYields({ map: state.map, mods: getModifiers(state, 0) }, city).culture;
    tileAtCoords(state.map, 6, 5).terrain = 'LAKE';
    const wet = cityDistrictYields({ map: state.map, mods: getModifiers(state, 0) }, city).culture;
    expect(wet - dry).toBeCloseTo(NAN_MADOL_WATER_CULTURE, 9);
  });
});

describe("Amsterdam's destination luxuries and Hunza's road", () => {
  it('counts every luxury plot of the destination city, copies included', () => {
    const { state } = scene();
    const other = settleAt(state, tileAtCoords(state.map, 15, 15).index, 0);
    const owned = state.map.tiles.filter((t) => t.ownerCity === other.id && t.ownerSeat === 0);
    expect(owned.length).toBeGreaterThanOrEqual(3);
    owned[0].resource = 'WINE';
    owned[1].resource = 'SILK';
    owned[2].resource = 'WINE'; // a second copy is a second plot
    expect(routeDestLuxuryGold(state, 0, other.seat, other.id, other.centerIndex)).toBe(0); // no suzerain yet
    suzerainOf(state, 'routeLuxuryGold');
    expect(routeDestLuxuryGold(state, 0, other.seat, other.id, other.centerIndex)).toBe(3 * AMSTERDAM_DEST_LUXURY_GOLD);
  });

  it('pays a fifth of a gold per plot of the path, in fixed point', () => {
    const { state } = scene();
    const course = Array.from({ length: 14 }, (_, k) => tileAtCoords(state.map, 5 + k, 5).index);
    const route: TradeRoute = { from: 0, course };
    expect(routeLengthGold(state, 0, route)).toBe(0);
    suzerainOf(state, 'routeLengthGold');
    // floor((14 x 51 + 25) / 256): fourteen plots pay 2, fifteen 3
    expect(HUNZA_PATH_TILE_GOLD_FX).toBe(51);
    expect(routeLengthGold(state, 0, route)).toBe(2);
    route.course = [...course, tileAtCoords(state.map, 19, 5).index];
    expect(routeLengthGold(state, 0, route)).toBe(3);
  });
});

describe("Jakarta's passing-through half", () => {
  it('pays again for a post in a FOREIGN city the course passes, never for its own', () => {
    const { state } = scene();
    state.seats.push(emptySeat(1));
    const mine = settleAt(state, tileAtCoords(state.map, 10, 10).index, 0);
    const theirs = settleAt(state, tileAtCoords(state.map, 16, 16).index, 1);
    seatOf(state, 0)!.tradingPosts = [mine.centerIndex, theirs.centerIndex];
    const ends = [tileAtCoords(state.map, 4, 4).index, tileAtCoords(state.map, 20, 20).index];
    const route: TradeRoute = { from: 0, course: [ends[0], mine.centerIndex, theirs.centerIndex, ends[1]] };
    const base = routeChainGold(state, 0, route);
    suzerainOf(state, 'routePostGold');
    // one extra gold, for the FOREIGN city passed alone
    expect(routeChainGold(state, 0, route) - base).toBe(1);
  });
});

describe("Zanzibar's spices and Buenos Aires' bonuses", () => {
  it('serve six cities each, and stand on no tile', () => {
    const { state } = scene();
    // six cities in all, spaced past the founding minimum
    for (const [c, r] of [[5, 15], [11, 15], [17, 15], [5, 21], [11, 21]] as const) {
      settleAt(state, tileAtCoords(state.map, c, r).index, 0);
    }
    const sum = (): number => [...luxuryAmenities(state, 0).values()].reduce((a, b) => a + b, 0);
    const before = sum();
    suzerainOf(state, 'spiceLuxuries');
    const cities = seatOf(state, 0)!.cities.length;
    expect(sum() - before).toBe(ZANZIBAR_LUXURIES * Math.min(ZANZIBAR_LUXURY_AMENITIES, cities));
  });

  it('turns each DISTINCT owned bonus resource into a one-city luxury', () => {
    const { state, city } = scene();
    const owned = state.map.tiles.filter((t) => t.ownerCity === city.id && t.ownerSeat === 0);
    owned[0].resource = 'WHEAT';
    owned[1].resource = 'WHEAT'; // a second copy is not a second head
    const sum = (): number => [...luxuryAmenities(state, 0).values()].reduce((a, b) => a + b, 0);
    const before = sum();
    suzerainOf(state, 'bonusAmenities');
    expect(sum() - before).toBe(BUENOS_AIRES_AMENITIES);
  });
});

describe("Vatican City's great people", () => {
  it('spread the founded religion around the activation plot, to 6 tiles', () => {
    const { state, city } = scene();
    const far = settleAt(state, tileAtCoords(state.map, 12, 5).index, 0); // 7 from the plot
    seatOf(state, 0)!.religion.founded = true;
    gpActivatedPressure(state, 0, city.centerIndex);
    expect(city.religionPressure?.[0] ?? 0).toBe(0); // no suzerain, no spread
    suzerainOf(state, 'gpActivatedPressure');
    gpActivatedPressure(state, 0, city.centerIndex);
    expect(city.religionPressure?.[0]).toBe(VATICAN_GP_PRESSURE);
    expect(far.religionPressure?.[0] ?? 0).toBe(0);
    gpActivatedPressure(state, 0, tileAtCoords(state.map, 6, 5).index); // 6 from far
    expect(far.religionPressure?.[0]).toBe(VATICAN_GP_PRESSURE);
    expect(THEO_PRESSURE_RANGE).toBe(6);
  });
});

describe("Hong Kong's projects and Ngazargamu's barracks", () => {
  it('multiplies project production and nothing else', () => {
    const { state } = scene();
    expect(suzerainProjectMult(state, 0)).toBe(1);
    suzerainOf(state, 'projectProduction');
    expect(suzerainProjectMult(state, 0)).toBeCloseTo(1 + HONG_KONG_PROJECT_PCT / 100, 9);
  });

  it('takes 20% off a land unit per Encampment building in the buying city', () => {
    const { state, city } = scene();
    const full = unitPurchaseCost(state, 'WARRIOR', 0);
    suzerainOf(state, 'landPurchaseDiscount');
    expect(suzerainLandPurchaseOffPct(state, 0, city)).toBe(0);
    city.buildings.push('BARRACKS');
    expect(suzerainLandPurchaseOffPct(state, 0, city)).toBe(NGAZARGAMU_PURCHASE_PCT);
    city.buildings.push('ARMORY', 'MILITARY_ACADEMY');
    // three rows, 60% off — Barracks and Stable answer ONE row between them
    expect(suzerainLandPurchaseOffPct(state, 0, city)).toBe(3 * NGAZARGAMU_PURCHASE_PCT);
    city.buildings.push('STABLE');
    expect(suzerainLandPurchaseOffPct(state, 0, city)).toBe(3 * NGAZARGAMU_PURCHASE_PCT);
    expect(unitGoldPrice(state, 'WARRIOR', 0, city)).toBe(goldPrice(state, 0, full, 3 * NGAZARGAMU_PURCHASE_PCT));
    // a NAVAL chassis is outside the modifier's DOMAIN_LAND gate, a civilian
    // outside its military formations
    expect(unitGoldPrice(state, 'GALLEY', 0, city)).toBe(goldPrice(state, 0, unitPurchaseCost(state, 'GALLEY', 0)));
    expect(unitGoldPrice(state, 'BUILDER', 0, city)).toBe(goldPrice(state, 0, unitPurchaseCost(state, 'BUILDER', 0)));
  });
});
