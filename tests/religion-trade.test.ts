import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import { makeMap, makeState, tileAtCoords, expandBorders, grantCivics } from './helpers';
import { foundCity, queueDistrict, queueBuilding, choosePantheon, canFoundReligion, foundReligion, canEnhanceReligion, enhanceReligion, endTurn } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { tileYields } from '../src/core/yields';
import { makeYieldCtx } from '../src/core/effects';
import { availableBuildings } from '../src/core/rules';
import { tradeCapacity, addTradeRoute, routeYields, canAddTradeRoute } from '../src/core/trade';

function sandboxCity() {
  const state = makeState(makeMap(20, 20));
  state.sandbox = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index).city!;
  expandBorders(state, city, 2);
  return { state, city };
}

describe('pantheons', () => {
  it('cost 25 faith and apply their effects', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index);
    expect(choosePantheon(state, 'GOD_OF_THE_OPEN_SKY').ok).toBe(false); // no faith yet
    playerSeat(state).faith = 30;
    expect(choosePantheon(state, 'GOD_OF_THE_OPEN_SKY').ok).toBe(true);
    expect(playerSeat(state).faith).toBe(5);

    const pasture = tileAtCoords(state.map, 9, 8);
    pasture.resource = 'CATTLE';
    pasture.improvement = 'PASTURE';
    expect(tileYields(makeYieldCtx(state), pasture).culture).toBe(1);
  });

  it('Fertility Rites boosts growth; Religious Settlements cheapens borders', () => {
    const { state, city } = sandboxCity();
    const before = computeCityStats(state, city);
    state.religion.pantheon = 'FERTILITY_RITES';
    const after = computeCityStats(state, city);
    expect(after.effectiveFoodSurplus).toBeCloseTo(before.effectiveFoodSurplus * 1.1, 5);

    state.religion.pantheon = 'RELIGIOUS_SETTLEMENTS';
    const cheap = computeCityStats(state, city);
    expect(cheap.border.cost).toBe(Math.round(before.border.cost * 0.85));
  });
});

describe('founding a religion', () => {
  function ready() {
    const { state, city } = sandboxCity();
    state.religion.pantheon = 'FERTILITY_RITES';
    queueDistrict(state, city.id, 'HOLY_SITE', tileAtCoords(state.map, 10, 9).index);
    queueBuilding(state, city.id, 'SHRINE');
    queueBuilding(state, city.id, 'TEMPLE');
    return { state, city };
  }

  it('requires pantheon, holy site and (outside sandbox) a prophet', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index);
    expect(canFoundReligion(state).ok).toBe(false);

    const { state: s2 } = ready();
    expect(canFoundReligion(s2).ok).toBe(true); // sandbox waives the prophet
    s2.sandbox = false;
    expect(canFoundReligion(s2).ok).toBe(false);
    s2.greatPeople.earned.push('GP_CONFUCIUS');
    expect(canFoundReligion(s2).ok).toBe(true);
  });

  it('beliefs and the worship building take effect', () => {
    const { state, city } = ready();
    const before = computeCityStats(state, city);
    expect(
      foundReligion(state, {
        name: 'Taoism',
        follower: 'CHORAL_MUSIC',
        founder: 'TITHE',
        worship: 'GURDWARA',
      }).ok,
    ).toBe(true);

    // B-18: FOLLOWER beliefs act per-city on the religion the CITY follows. The
    // holy city follows the player's religion (id 0) once pressure spreads from
    // its own holy tile; assert on a following city.
    city.followedReligion = 0;
    const after = computeCityStats(state, city);
    // Choral Music: shrine +2c, temple +4c
    expect(after.breakdown.buildings.culture - before.breakdown.buildings.culture).toBe(6);
    // Tithe: pop 1 -> 0 gold yet; grow the city artificially to 4 -> +1 gold in capital
    city.population = 4;
    const withFollowers = computeCityStats(state, city);
    expect(withFollowers.breakdown.bonuses.gold).toBeGreaterThanOrEqual(1);
    // Gurdwara buildable now (and only that worship building)
    const buildable = availableBuildings(state, city).map((b) => b.id);
    expect(buildable).toContain('GURDWARA');
    expect(buildable).not.toContain('STUPA');
  });

  it('Work Ethic converts holy site adjacency into production', () => {
    const { state, city } = ready();
    tileAtCoords(state.map, 11, 9).elevation = 'MOUNTAIN'; // next to the holy site
    foundReligion(state, {
      name: 'Shinto',
      follower: 'WORK_ETHIC',
      founder: 'CHURCH_PROPERTY',
      worship: 'MEETING_HOUSE',
    });
    // B-18: Work Ethic is a FOLLOWER belief — it applies to the city that
    // follows the religion (the holy city, id 0, once pressure spreads).
    city.followedReligion = 0;
    const stats = computeCityStats(state, city);
    expect(stats.breakdown.districts.production).toBeGreaterThanOrEqual(1);
    expect(stats.breakdown.districts.production).toBe(stats.breakdown.districts.faith);
  });

  // B-18: the Enhancer belief slot — a founded religion, a SECOND prophet,
  // and the claimed-pool exclusion (mirrors the follower/founder gate). The
  // rollout never founds a player religion, so this path is poke-only.
  it('enhancing needs a founded religion and a second prophet; slot fills, pool excludes', () => {
    const { state } = ready();
    foundReligion(state, {
      name: 'Zen', follower: 'CHORAL_MUSIC', founder: 'TITHE', worship: 'GURDWARA',
    });
    state.sandbox = false;
    expect(canEnhanceReligion(state).ok).toBe(false); // no prophet yet
    state.greatPeople.earned.push('GP_CONFUCIUS');
    expect(canEnhanceReligion(state).ok).toBe(false); // only one
    state.greatPeople.earned.push('GP_SIDDHARTHA');
    expect(canEnhanceReligion(state).ok).toBe(true); // second prophet

    // a rival already holding an enhancer excludes it from the pool
    state.claimedEnhancers = ['CRUSADE'];
    expect(enhanceReligion(state, 'CRUSADE').ok).toBe(false);
    expect(enhanceReligion(state, 'ITINERANT_PREACHERS').ok).toBe(true);
    expect(state.religion.enhancer).toBe('ITINERANT_PREACHERS');
    expect(state.claimedEnhancers).toContain('ITINERANT_PREACHERS');
    // no double-enhance
    expect(enhanceReligion(state, 'HOLY_ORDER').ok).toBe(false);
  });
});

describe('trade routes', () => {
  function twoCities() {
    const state = makeState(makeMap(24, 20));
    state.sandbox = true;
    const a = foundCity(state, tileAtCoords(state.map, 8, 9).index).city!;
    const b = foundCity(state, tileAtCoords(state.map, 14, 9).index).city!;
    expandBorders(state, a, 2);
    expandBorders(state, b, 2);
    return { state, a, b };
  }

  it('capacity comes from the civic, buildings and wonders', () => {
    const { state, a, b } = twoCities();
    expect(tradeCapacity(state)).toBe(0);
    grantCivics(state, 'FOREIGN_TRADE');
    expect(tradeCapacity(state)).toBe(1);
    queueDistrict(state, a.id, 'COMMERCIAL_HUB', tileAtCoords(state.map, 9, 9).index);
    queueBuilding(state, a.id, 'MARKET');
    expect(tradeCapacity(state)).toBe(2);
    void b;
  });

  it('validates routes and pays the origin', () => {
    const { state, a, b } = twoCities();
    expect(addTradeRoute(state, a.id, b.id).ok).toBe(false); // no capacity
    grantCivics(state, 'FOREIGN_TRADE');
    expect(addTradeRoute(state, a.id, a.id).ok).toBe(false); // self
    expect(addTradeRoute(state, a.id, b.id).ok).toBe(true);
    expect(addTradeRoute(state, a.id, b.id).ok).toBe(false); // duplicate + capacity

    // base domestic yields: +1 food +1 production
    expect(routeYields(state, b)).toMatchObject({ food: 1, production: 1 });
    const stats = computeCityStats(state, a);
    expect(stats.breakdown.trade.food).toBe(1);
    expect(stats.breakdown.trade.production).toBe(1);

    // destination development raises it: 2 specialty districts -> +1/+1
    b.population = 7; // allow the district count
    expect(queueDistrict(state, b.id, 'CAMPUS', tileAtCoords(state.map, 15, 9).index).ok).toBe(true);
    expect(queueDistrict(state, b.id, 'HOLY_SITE', tileAtCoords(state.map, 13, 9).index).ok).toBe(true);
    expect(routeYields(state, b)).toMatchObject({ food: 2, production: 2 });
  });

  it('enforces range', () => {
    const state = makeState(makeMap(40, 12));
    state.sandbox = true;
    const a = foundCity(state, tileAtCoords(state.map, 2, 6).index).city!;
    const b = foundCity(state, tileAtCoords(state.map, 36, 6).index).city!;
    grantCivics(state, 'FOREIGN_TRADE');
    expect(canAddTradeRoute(state, a.id, b.id).ok).toBe(false);
  });
});

describe('religious pressure spread (B-18)', () => {
  it("a holy city converts cities within range each turn; distant cities stay unconverted", () => {
    const state = makeState(makeMap(40, 20));
    state.sandbox = true;
    const cap = foundCity(state, tileAtCoords(state.map, 5, 10).index).city!;
    const near = foundCity(state, tileAtCoords(state.map, 9, 10).index).city!; // 4 tiles
    const far = foundCity(state, tileAtCoords(state.map, 32, 10).index).city!; // 27 tiles
    // Player founds a religion; the capital's center is the holy tile (id 0).
    state.religion.founded = true;
    state.religion.holyTile = cap.centerIndex;

    endTurn(state);
    expect(cap.followedReligion).toBe(0);
    expect(near.followedReligion).toBe(0); // within RELIGION_PRESSURE_RANGE
    expect(far.followedReligion ?? null).toBeNull(); // out of range — no pressure

    // Integer pressure accrues +1 per in-range turn.
    const p = cap.religionPressure![0];
    endTurn(state);
    expect(cap.religionPressure![0]).toBe(p + 1);
    expect(far.religionPressure?.[0] ?? 0).toBe(0);
    // The majority-pressure flip and the cross-civ tie -> lowest-id case are
    // covered by the GPU poke (gpu/religion_gp_test.py) and the parity gate,
    // where 24 player cities flip to the two rival religions turn-exact.
  });
});
