/**
 * THE TWO GOVERNOR IMPROVEMENTS: the Fishery and the City Park.
 *
 * Every column off DLC/Expansion2/Data/Expansion1_Improvements.xml, which is
 * the LAST layer and the one that gives the Fishery its Housing and
 * TilesRequired. Neither is a civilization's unique: each is opened by a
 * GOVERNOR PROMOTION held in the city that owns the plot, which is why
 * AQUACULTURE and PARKS_AND_RECREATION have sat in the catalog with empty
 * effects since governors landed.
 *
 * The install writes the promotion's yield as a SEPARATE modifier from the
 * build gate, and that separation is the rule: the improvement stands after
 * the governor leaves, and the extra payment stops.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs, grantCivics } from '../helpers';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { seatOf } from '../../../cpu/core/seats';
import { cityGovernorPromos, governorsOf } from '../../../cpu/core/governors';
import { validImprovements } from '../../../cpu/core/rules';
import { tileYields } from '../../../cpu/core/yields';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { computeCityStats } from '../../../cpu/core/city';
import { IMPROVEMENT_IDS } from '../../../cpu/core/unitActions';
import type { City, GameState } from '../../../cpu/core/types';

const P_AQUA = GOVERNOR_PROMOTION_INDEX.AQUACULTURE!;
const P_PARKS = GOVERNOR_PROMOTION_INDEX.PARKS_AND_RECREATION!;

function seatGov(state: GameState, city: City, gi: number, promotion: number) {
  const g = governorsOf(seatOf(state, city.seat)!)[gi];
  g.appointed = true;
  g.cityId = city.id;
  g.establishTurns = 0;
  g.promotions = promotionBitValue(promotion);
  return g;
}

/** a coastal city with its ring claimed, holding both prereqs. */
function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(20, 16));
  for (const t of state.map.tiles) if (t.col >= 12) { t.terrain = 'COAST'; t.elevation = 'FLAT'; }
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 4); // the coast at col 12 is four out
  grantTechs(state, 'SAILING');
  grantCivics(state, 'GAMES_AND_RECREATION');
  return { state, city };
}

describe('the catalog rows are the install rows', () => {
  it('carries the Fishery column for column', () => {
    const d = IMPROVEMENTS.FISHERY;
    expect(d.yields.food).toBe(1);
    expect(d.housing).toBe(0.5);            // Housing 1 / TilesRequired 2
    expect(d.waterOnly).toBe(true);
    expect(d.terrains).toEqual(['COAST']);
    expect(d.governorPromo).toBe('AQUACULTURE');
    expect(d.governorYields).toEqual({ promo: 'AQUACULTURE', yields: { production: 1 } });
    expect(d.adjacency).toEqual([{ seaResource: true, per: 1, yields: { food: 1 } }]);
  });

  it('carries the City Park column for column', () => {
    const d = IMPROVEMENTS.CITY_PARK;
    expect(d.yields.culture).toBe(1);
    expect(d.appealAdjacent).toBe(2);       // Appeal 2
    expect(d.noAdjacentSame).toBe(true);    // SameAdjacentValid false
    expect(d.governorPromo).toBe('PARKS_AND_RECREATION');
    expect(d.governorYields).toEqual({ promo: 'PARKS_AND_RECREATION', yields: { culture: 3 } });
    expect(d.amenityAdjacentWater).toBe(1);
    expect(d.tourismFrom).toBe('culture');
    expect(d.tourismTech).toBe('FLIGHT');
  });

  it('appends both to the Builder wire LAST', () => {
    expect(IMPROVEMENT_IDS[IMPROVEMENT_IDS.length - 2]).toBe('FISHERY');
    expect(IMPROVEMENT_IDS[IMPROVEMENT_IDS.length - 1]).toBe('CITY_PARK');
  });
});

describe('the governor opens the row', () => {
  it('refuses both while the city has no governor', () => {
    const { state, city } = scene();
    expect(cityGovernorPromos(state, city).size).toBe(0);
    const land = tileAtCoords(state.map, 9, 8);
    const sea = tileAtCoords(state.map, 12, 8);
    expect(validImprovements(state, land, 0)).not.toContain('CITY_PARK');
    expect(validImprovements(state, sea, 0)).not.toContain('FISHERY');
  });

  it('opens the City Park for Parks and Recreation, and only it', () => {
    const { state, city } = scene();
    seatGov(state, city, GOVERNOR_INDEX.LIANG, P_PARKS);
    const land = tileAtCoords(state.map, 9, 8);
    expect(validImprovements(state, land, 0)).toContain('CITY_PARK');
    const sea = tileAtCoords(state.map, 12, 8);
    expect(validImprovements(state, sea, 0)).not.toContain('FISHERY');
  });

  it('opens the Fishery for Aquaculture, on COAST alone', () => {
    const { state, city } = scene();
    seatGov(state, city, GOVERNOR_INDEX.LIANG, P_AQUA);
    expect(validImprovements(state, tileAtCoords(state.map, 12, 8), 0)).toContain('FISHERY');
    expect(validImprovements(state, tileAtCoords(state.map, 9, 8), 0)).not.toContain('FISHERY');
  });

  it('never stands beside its own kind', () => {
    const { state, city } = scene();
    seatGov(state, city, GOVERNOR_INDEX.LIANG, P_PARKS);
    const a = tileAtCoords(state.map, 9, 8);
    const b = tileAtCoords(state.map, 10, 8);
    expect(validImprovements(state, a, 0)).toContain('CITY_PARK');
    b.improvement = 'CITY_PARK';
    expect(validImprovements(state, a, 0)).not.toContain('CITY_PARK');
  });
});

describe('what the plot is paid', () => {
  it('pays the governor yield only while the governor holds it', () => {
    const { state, city } = scene();
    const land = tileAtCoords(state.map, 9, 8);
    land.improvement = 'CITY_PARK';
    const plain = tileYields(makeYieldCtx(state, 0), land).culture;
    seatGov(state, city, GOVERNOR_INDEX.LIANG, P_PARKS);
    expect(tileYields(makeYieldCtx(state, 0), land).culture).toBe(plain + 3);
    // the governor leaves; the park stands and the extra stops
    governorsOf(seatOf(state, 0)!)[GOVERNOR_INDEX.LIANG].appointed = false;
    expect(tileYields(makeYieldCtx(state, 0), land).culture).toBe(plain);
  });

  it('pays the Fishery a food per adjacent SEA resource', () => {
    const { state, city } = scene();
    const sea = tileAtCoords(state.map, 12, 8);
    sea.improvement = 'FISHERY';
    const plain = tileYields(makeYieldCtx(state, 0), sea).food;
    const nb = tileAtCoords(state.map, 13, 8);
    nb.terrain = 'COAST';
    nb.resource = 'FISH';
    expect(tileYields(makeYieldCtx(state, 0), sea).food).toBe(plain + 1);
    void city;
  });

  it('pays the city an amenity for a City Park beside water', () => {
    const { state, city } = scene();
    const dry = tileAtCoords(state.map, 6, 8);
    dry.improvement = 'CITY_PARK';
    const before = computeCityStats(state, city).amenities.have;
    const wet = tileAtCoords(state.map, 11, 8);
    wet.improvement = 'CITY_PARK';
    expect(computeCityStats(state, city).amenities.have).toBe(before + 1);
  });
});
