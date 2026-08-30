import { describe, it, expect } from 'vitest';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs } from '../helpers';
import { cityAppealResolver, governorFlag, governorsOf } from '../../../cpu/core/governors';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { regionalEffects } from '../../../cpu/core/yields';
import { cityTradeYields } from '../../../cpu/core/trade';
import { disasterPhase } from '../../../cpu/core/disasters';
import { computeCityStats } from '../../../cpu/core/city';
import { tileAppeal } from '../../../cpu/core/appeal';
import { purchaseReligiousUnit } from '../../../cpu/core/game';
import { takePromotion, promoReady, promoAvailable, unitPromoRows, xpToNextLevel } from '../../../cpu/core/promotions';
import type { City, GameState, Unit } from '../../../cpu/core/types';

// THE FIVE PROMOTION CLAUSES THAT NEED NO NEW MECHANIC. CIV6, one sourced
// sentence each: (Surplus Logistics) "Your Trade Routes ending here provide +2
// Food to their starting city"; (Vertical Integration) "This city receives
// Production from any number of Industrial Zones within 6 tiles, not just the
// first"; (Reinforced Materials) "This city's improvements, buildings and
// Districts cannot be damaged by Environmental Effects"; (Forestry Management)
// "This city receives +2 Gold for each unimproved feature. Tiles adjacent to
// unimproved features receive +1 Appeal in this city"; (Patron Saint)
// "Apostles and Warrior Monks trained in the city receive 1 extra Promotion
// when receiving their first promotion."

const P_SURPLUS = GOVERNOR_PROMOTION_INDEX.SURPLUS_LOGISTICS!;
const P_VERTICAL = GOVERNOR_PROMOTION_INDEX.VERTICAL_INTEGRATION!;
const P_REINFORCED = GOVERNOR_PROMOTION_INDEX.REINFORCED_MATERIALS!;
const P_FORESTRY = GOVERNOR_PROMOTION_INDEX.FORESTRY_MANAGEMENT!;
const P_PATRON = GOVERNOR_PROMOTION_INDEX.PATRON_SAINT!;

/** Seat governor `gi` in `city`, established, holding exactly `promotion`. */
function seat(state: GameState, city: City, gi: number, promotion: number) {
  const g = governorsOf(seatOf(state, city.seat)!)[gi];
  g.appointed = true;
  g.cityId = city.id;
  g.establishTurns = 0;
  g.promotions = promotionBitValue(promotion);
  return g;
}

describe('Surplus Logistics', () => {
  it('the DESTINATION governor pays the route the ORIGIN sends', () => {
    const state = makeState(makeMap(20, 16));
    const from = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const to = settleAt(state, tileAtCoords(state.map, 9, 5).index, 0);
    seatOf(state, 0)!.tradeRoutes = [{ from: from.id, to: to.id }];
    const before = cityTradeYields(state, from, 0).food;
    seat(state, to, GOVERNOR_INDEX.MAGNUS, P_SURPLUS);
    expect(cityTradeYields(state, from, 0).food).toBe(before + 2);
    // ...and the DESTINATION's own walk is untouched: it sends nothing here
    expect(cityTradeYields(state, to, 0).food).toBe(0);
  });

  it('an unestablished governor pays nothing', () => {
    const state = makeState(makeMap(20, 16));
    const from = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const to = settleAt(state, tileAtCoords(state.map, 9, 5).index, 0);
    seatOf(state, 0)!.tradeRoutes = [{ from: from.id, to: to.id }];
    const g = seat(state, to, GOVERNOR_INDEX.MAGNUS, P_SURPLUS);
    const paid = cityTradeYields(state, from, 0).food;
    g.establishTurns = 3;
    expect(cityTradeYields(state, from, 0).food).toBe(paid - 2);
  });
});

describe('Vertical Integration', () => {
  /** Two source cities each holding a complete Industrial Zone with a Factory,
   *  both in range of a plain receiver. */
  function threeCities() {
    const state = makeState(makeMap(24, 16));
    const recv = settleAt(state, tileAtCoords(state.map, 10, 8).index, 0);
    const a = settleAt(state, tileAtCoords(state.map, 6, 8).index, 0);
    const b = settleAt(state, tileAtCoords(state.map, 14, 8).index, 0);
    for (const [c, col] of [[a, 7], [b, 13]] as const) {
      const t = tileAtCoords(state.map, col, 8);
      t.district = 'INDUSTRIAL_ZONE';
      t.districtComplete = true;
      c.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: t.index });
      c.buildings.push('FACTORY');
    }
    return { state, recv };
  }

  const every = (state: GameState, c: City) => governorFlag(state, c, (e) => e.industryAllSources);

  it('one Industrial Zone pays without it, every one with it', () => {
    const { state, recv } = threeCities();
    expect(regionalEffects(state, recv, every(state, recv)).yields.production).toBe(3);
    seat(state, recv, GOVERNOR_INDEX.MAGNUS, P_VERTICAL);
    expect(every(state, recv)).toBe(true);
    expect(regionalEffects(state, recv, every(state, recv)).yields.production).toBe(6);
  });

  it('the promotion names ONE district — an Entertainment Complex still pays once', () => {
    const { state, recv } = threeCities();
    for (const [c, col] of [[0, 6], [1, 14]] as const) {
      const home = seatOf(state, 0)!.cities.find((x) => x.centerIndex === tileAtCoords(state.map, col, 8).index)!;
      const t = tileAtCoords(state.map, col, 9);
      t.district = 'ENTERTAINMENT_COMPLEX';
      t.districtComplete = true;
      home.districts.push({ type: 'ENTERTAINMENT_COMPLEX', tileIndex: t.index });
      home.buildings.push('ZOO');
      expect(c).toBeLessThan(2);
    }
    expect(regionalEffects(state, recv, every(state, recv)).amenities).toBe(1);
    seat(state, recv, GOVERNOR_INDEX.MAGNUS, P_VERTICAL);
    expect(regionalEffects(state, recv, every(state, recv)).amenities).toBe(1);
  });
});

describe('Reinforced Materials', () => {
  function volcanoWorld(withGovernor: boolean) {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const city = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
    const volcano = tileAtCoords(state.map, 8, 8);
    volcano.elevation = 'MOUNTAIN';
    volcano.volcano = true;
    const slope = tileAtCoords(state.map, 9, 8);
    slope.improvement = 'FARM';
    setTileOwner(slope, 0, city.id);
    if (withGovernor) seat(state, city, GOVERNOR_INDEX.LIANG, P_REINFORCED);
    return { state, slope };
  }

  it('an eruption scorches an ordinary tile', () => {
    const { state, slope } = volcanoWorld(false);
    let guard = 0;
    while (!slope.pillaged && guard++ < 600) disasterPhase(state);
    expect(slope.pillaged).toBe(true);
  });

  it('...and leaves the governed city\'s improvement alone', () => {
    const { state, slope } = volcanoWorld(true);
    for (let i = 0; i < 600; i++) disasterPhase(state);
    expect(slope.pillaged).toBe(false);
    expect(state.eventLog.some((e) => e.includes('eruption'))).toBe(true);
  });

  it('a flood pillages no district the promotion covers', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const city = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
    const plain = tileAtCoords(state.map, 6, 6);
    plain.feature = 'FLOODPLAINS';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    setTileOwner(plain, 0, city.id);
    seat(state, city, GOVERNOR_INDEX.LIANG, P_REINFORCED);
    for (let i = 0; i < 600; i++) disasterPhase(state);
    expect(plain.districtPillaged).toBe(false);
    expect(plain.pillaged).toBe(false);
    expect(plain.floodCount ?? 0).toBeGreaterThan(0); // the floods DID land
  });
});

describe('Forestry Management', () => {
  function woodedCity() {
    const state = makeState(makeMap(16, 16));
    grantTechs(state, 'MINING');
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    expandBorders(state, city, 2);
    const woods = [tileAtCoords(state.map, 6, 8), tileAtCoords(state.map, 6, 9), tileAtCoords(state.map, 7, 10)];
    for (const t of woods) t.feature = 'WOODS';
    return { state, city, woods };
  }

  it('pays +2 Gold for each unimproved feature the city owns', () => {
    const { state, city, woods } = woodedCity();
    const before = computeCityStats(state, city).breakdown.bonuses.gold;
    seat(state, city, GOVERNOR_INDEX.REYNA, P_FORESTRY);
    expect(computeCityStats(state, city).breakdown.bonuses.gold).toBe(before + 2 * woods.length);
    // an IMPROVED feature stops counting
    woods[0].improvement = 'LUMBER_MILL';
    expect(computeCityStats(state, city).breakdown.bonuses.gold).toBe(before + 2 * (woods.length - 1));
  });

  it('a feature outside the borders pays nothing', () => {
    const { state, city } = woodedCity();
    seat(state, city, GOVERNOR_INDEX.REYNA, P_FORESTRY);
    const paid = computeCityStats(state, city).breakdown.bonuses.gold;
    tileAtCoords(state.map, 14, 2).feature = 'WOODS'; // unowned
    expect(computeCityStats(state, city).breakdown.bonuses.gold).toBe(paid);
  });

  it('lifts the Appeal of the city\'s tiles next to an unimproved feature', () => {
    const { state, city, woods } = woodedCity();
    const beside = tileAtCoords(state.map, 7, 8); // neighbours (6, 8)
    const away = tileAtCoords(state.map, 9, 8);
    const bare = tileAppeal(state.map, beside, undefined, cityAppealResolver(state));
    const bareAway = tileAppeal(state.map, away, undefined, cityAppealResolver(state));
    seat(state, city, GOVERNOR_INDEX.REYNA, P_FORESTRY);
    expect(tileAppeal(state.map, beside, undefined, cityAppealResolver(state))).toBe(bare + 1);
    expect(tileAppeal(state.map, away, undefined, cityAppealResolver(state))).toBe(bareAway);
    // improve the feature and the neighbour's lift goes with it
    woods[0].improvement = 'LUMBER_MILL';
    expect(tileAppeal(state.map, beside, undefined, cityAppealResolver(state))).toBe(bare + 1 - 1 + 1);
  });
});

describe('Patron Saint', () => {
  function holyCity() {
    const state = makeState(makeMap(16, 16));
    state.unitsMode = true;
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    expandBorders(state, city, 2);
    grantTechs(state, 'ASTROLOGY');
    const hs = tileAtCoords(state.map, 9, 8);
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    city.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
    city.buildings.push('SHRINE', 'TEMPLE');
    city.followedReligion = 0;
    const s = seatOf(state, 0)!;
    s.faith = 5000;
    s.religion = { ...s.religion, founded: true, follower: 'WARRIOR_MONKS' };
    return { state, city };
  }

  const last = (state: GameState): Unit => state.units[state.units.length - 1];

  it('banks one extra promotion on an Apostle bought here, and on nobody else\'s', () => {
    const { state, city } = holyCity();
    expect(purchaseReligiousUnit(state, city.id, 'APOSTLE', 0).ok).toBe(true);
    expect(last(state).promoBonus ?? 0).toBe(0);
    seat(state, city, GOVERNOR_INDEX.MOKSHA, P_PATRON);
    state.units = [];
    expect(purchaseReligiousUnit(state, city.id, 'APOSTLE', 0).ok).toBe(true);
    expect(last(state).promoBonus).toBe(1);
  });

  it('a Warrior Monk bought here banks it too', () => {
    const { state, city } = holyCity();
    seat(state, city, GOVERNOR_INDEX.MOKSHA, P_PATRON);
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).ok).toBe(true);
    expect(last(state).promoBonus).toBe(1);
  });

  it('the bank is spent by the FIRST promotion, and re-arms the unit exactly once', () => {
    const { state, city } = holyCity();
    seat(state, city, GOVERNOR_INDEX.MOKSHA, P_PATRON);
    expect(purchaseReligiousUnit(state, city.id, 'APOSTLE', 0).ok).toBe(true);
    const u = last(state);
    const cols = unitPromoRows(u).map((_p, k) => k).filter((k) => promoAvailable(u, k));
    expect(cols.length).toBe(3); // the Apostle's three drawn columns
    expect(promoReady(u)).toBe(true);
    expect(takePromotion(u, cols[0])).toBe(true);
    // the bank re-armed it: a second promotion is ready NOW
    expect(u.promoBonus).toBe(0);
    expect(u.xp).toBe(xpToNextLevel(u));
    expect(promoReady(u)).toBe(true);
    expect(takePromotion(u, cols[1])).toBe(true);
    // ...and the bank is empty, so the third stays out of reach
    expect(u.xp).toBe(0);
    expect(promoReady(u)).toBe(false);
    expect(u.level).toBe(3);
  });

  it('without the promotion an Apostle takes one and stops', () => {
    const { state, city } = holyCity();
    expect(purchaseReligiousUnit(state, city.id, 'APOSTLE', 0).ok).toBe(true);
    const u = last(state);
    const cols = unitPromoRows(u).map((_p, k) => k).filter((k) => promoAvailable(u, k));
    expect(takePromotion(u, cols[0])).toBe(true);
    expect(promoReady(u)).toBe(false);
    expect(u.level).toBe(2);
  });
});
