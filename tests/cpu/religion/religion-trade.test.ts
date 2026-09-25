import { grantFoundingPressure, emptySeat } from '../../../cpu/core/seats';
import { spreadReligiousPressure } from '../../../cpu/core/game';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { City } from '../../../cpu/core/types';
import { RELIGION_PRESSURE_PER_TURN, HOLY_CITY_PRESSURE_MULT, ATHEISM_PRESSURE_PER_POP, BELIEF_CATALOGS, WORSHIP_BELIEFS, RELIGION_INITIAL_BELIEFS, beliefClassOf } from '../../../cpu/data/religion';
import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, expandBorders, grantCivics, standBuilding, standDistrict } from '../helpers';
import { foundCity, canFoundReligion, adoptBeliefs, canEnhanceReligion, enhanceableClasses, buyWorshipBuilding, purchaseReligiousUnit, endTurn, beliefPicks, evangelizeOk, evangelizeBelief } from '../../../cpu/core/game';
import { applySeatActionRecord, applySeatUnitOrders } from '../../../cpu/core/phase';
import { spawnUnit } from '../../../cpu/core/units';
import { IMPROVEMENT_IDS, unitActionIndex, unitActionNames } from '../../../cpu/core/unitActions';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { seatBuildingSum } from '../../../cpu/core/city';
import { scoreLines } from '../../../cpu/core/score';
import { SCORING_LINE_ITEMS } from '../../../cpu/data/scoring';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { computeCityStats } from '../../../cpu/core/city';
import { tileYields } from '../../../cpu/core/yields';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { availableBuildings } from '../../../cpu/core/rules';
import { tradeCapacity, addTradeRoute, routeYields, canAddTradeRoute, religiousCommunityGold } from '../../../cpu/core/trade';
import { GREAT_PEOPLE } from '../../../cpu/data/greatPeople';

function sandboxCity() {
  const state = makeState(makeMap(20, 20));
  state.sandbox = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
  expandBorders(state, city, 2);
  return { state, city };
}

describe('pantheons', () => {
  it('God of the Open Sky pays Culture on a Pasture', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    seatOf(state, 0)!.religion.pantheon = 'GOD_OF_THE_OPEN_SKY';

    const pasture = tileAtCoords(state.map, 9, 8);
    pasture.resource = 'CATTLE';
    pasture.improvement = 'PASTURE';
    expect(tileYields(makeYieldCtx(state, 0), pasture).culture).toBe(1);
  });

  it('Fertility Rites boosts growth; Religious Settlements cheapens borders', () => {
    const { state, city } = sandboxCity();
    const before = computeCityStats(state, city);
    seatOf(state, 0)!.religion.pantheon = 'FERTILITY_RITES';
    const after = computeCityStats(state, city);
    expect(after.effectiveFoodSurplus).toBeCloseTo(before.effectiveFoodSurplus * 1.1, 5);

    seatOf(state, 0)!.religion.pantheon = 'RELIGIOUS_SETTLEMENTS';
    const cheap = computeCityStats(state, city);
    expect(cheap.border.cost).toBe(Math.round(before.border.cost * 0.85));
  });
});

describe('founding a religion', () => {
  function ready() {
    const { state, city } = sandboxCity();
    seatOf(state, 0)!.religion.pantheon = 'FERTILITY_RITES';
    standDistrict(state, city, 'HOLY_SITE', tileAtCoords(state.map, 10, 9).index);
    standBuilding(state, city, 'SHRINE');
    standBuilding(state, city, 'TEMPLE');
    return { state, city };
  }
  /** a belief id as the wire names it: [class code, class catalog row] */
  const pick = (id: string): [number, number] => {
    const c = beliefClassOf(id);
    return [c, Object.keys(BELIEF_CATALOGS[c]).indexOf(id)];
  };

  it('requires pantheon, holy site and (outside sandbox) an activated prophet', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    expect(canFoundReligion(state, 0).ok).toBe(false);

    const { state: s2 } = ready();
    expect(canFoundReligion(s2, 0).ok).toBe(true); // sandbox waives the prophet
    s2.sandbox = false;
    expect(canFoundReligion(s2, 0).ok).toBe(false);
    // a prophet EARNED by anyone is not this seat's: the activation is
    s2.claimedGreatPeople.push(GREAT_PEOPLE.PROPHET[0].id);
    expect(canFoundReligion(s2, 0).ok).toBe(false);
    seatOf(s2, 0)!.gpActivated = [GREAT_PEOPLE.PROPHET[0].id];
    expect(canFoundReligion(s2, 0).ok).toBe(true);
  });

  it('founding takes the Follower, then one belief of another class', () => {
    const { state } = ready();
    const rel = seatOf(state, 0)!.religion;
    // the order, the count and the classes are the rule
    expect(adoptBeliefs(state, 0, [pick('TITHE'), pick('CHORAL_MUSIC')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('FEED_THE_WORLD')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('TITHE'), pick('MOSQUE')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [[0, 99], pick('TITHE')]).ok).toBe(false);
    // a belief another religion holds is out of the pool
    state.claimedBeliefs.push('JUST_WAR');
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('JUST_WAR')]).ok).toBe(false);
    expect(rel.founded).toBe(false);
    expect(state.claimedBeliefs).toEqual(['JUST_WAR']);
    // an Enhancer is as good a second belief as a Founder or a Worship one
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('SCRIPTURE')]).ok).toBe(true);
    expect(rel.founded).toBe(true);
    expect(rel.follower).toBe('CHORAL_MUSIC');
    expect(rel.enhancer).toBe('SCRIPTURE');
    expect(rel.founder).toBeNull();
    expect(rel.worship).toBeNull();
    expect(rel.beliefsEarned).toBe(RELIGION_INITIAL_BELIEFS);
    expect(state.claimedBeliefs).toEqual(['JUST_WAR', 'CHORAL_MUSIC', 'SCRIPTURE']);
  });

  /** an Apostle of seat 0 on the city centre */
  const apostle = (state: ReturnType<typeof ready>['state'], city: City) =>
    spawnUnit(state, 'APOSTLE', city.centerIndex, 0)!;

  it('an Apostle evangelizes a belief, and the religion adopts one class a time to four', () => {
    const { state, city } = ready();
    const s = seatOf(state, 0)!;
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('TITHE')]).ok).toBe(true);
    state.sandbox = false;
    // the founding earned two and the religion holds two: nothing to adopt
    expect(beliefPicks(state, 0)).toBe(0);
    expect(canEnhanceReligion(state, 0).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('PAGODA')]).ok).toBe(false);
    // a second activated Great Prophet earns nothing
    s.gpActivated = [GREAT_PEOPLE.PROPHET[0].id, GREAT_PEOPLE.PROPHET[1].id];
    expect(canEnhanceReligion(state, 0).ok).toBe(false);
    // EVANGELIZE BELIEF spends the Apostle and earns one belief
    const a1 = apostle(state, city);
    expect(evangelizeOk(state, a1, 0)).toBe(true);
    expect(evangelizeBelief(state, a1, s).ok).toBe(true);
    expect(state.units.includes(a1)).toBe(false);
    expect(s.religion.beliefsEarned).toBe(3);
    expect(beliefPicks(state, 0)).toBe(1);
    expect(enhanceableClasses(state, 0)).toEqual([1, 3]);
    // one belief, of a class the religion lacks: not two, not a held class
    expect(adoptBeliefs(state, 0, [pick('HOLY_ORDER'), pick('PAGODA')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('PILGRIMAGE')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('FEED_THE_WORLD')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('PAGODA')]).ok).toBe(true);
    expect(beliefPicks(state, 0)).toBe(0);
    // the second Apostle earns the fourth
    const a2 = apostle(state, city);
    expect(evangelizeBelief(state, a2, s).ok).toBe(true);
    expect(adoptBeliefs(state, 0, [pick('HOLY_ORDER')]).ok).toBe(true);
    expect([s.religion.follower, s.religion.worship, s.religion.founder, s.religion.enhancer])
      .toEqual(['CHORAL_MUSIC', 'PAGODA', 'TITHE', 'HOLY_ORDER']);
    // a full religion has nothing left to evangelize
    const a3 = apostle(state, city);
    expect(evangelizeOk(state, a3, 0)).toBe(false);
    expect(evangelizeBelief(state, a3, s).ok).toBe(false);
    expect(state.units.includes(a3)).toBe(true);
    // B-82's Religion line: 5 per belief, four beliefs
    const line = SCORING_LINE_ITEMS.findIndex((l) => l.count === 'religion');
    expect(scoreLines(state, s)[line]).toBe(4 * 5);
  });

  it('the evangelize column is the Apostle\'s, and the record adopts through the same verb', () => {
    const { state, city } = ready();
    const s = seatOf(state, 0)!;
    adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('TITHE')]);
    state.sandbox = false;
    const a = apostle(state, city);
    const col = unitActionIndex(IMPROVEMENT_IDS).EVANGELIZE_BELIEF;
    expect(unitActionNames(IMPROVEMENT_IDS).at(-1)).toBe('EVANGELIZE_BELIEF');
    expect(unitMask(maskCtx(state, 0), a)).toContain(col);
    const units = state.units.filter((u) => u.seat === 0);
    applySeatUnitOrders(state, s, [units.map((u) => (u === a ? col : -1))]);
    expect(s.religion.beliefsEarned).toBe(3);
    applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [], beliefs: [pick('STUPA')] });
    expect(s.religion.worship).toBe('STUPA');
  });

  it('a class whose pool ran dry caps what an Apostle may earn', () => {
    const { state, city } = ready();
    const s = seatOf(state, 0)!;
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('TITHE')]).ok).toBe(true);
    state.sandbox = false;
    // every Worship belief is another religion's
    state.claimedBeliefs.push(...Object.keys(WORSHIP_BELIEFS));
    expect(enhanceableClasses(state, 0)).toEqual([3]);
    expect(evangelizeBelief(state, apostle(state, city), s).ok).toBe(true);
    expect(adoptBeliefs(state, 0, [pick('PAGODA')]).ok).toBe(false);
    expect(adoptBeliefs(state, 0, [pick('HOLY_ORDER')]).ok).toBe(true);
    expect(s.religion.worship).toBeNull();
    // nothing left to earn a second time
    expect(evangelizeOk(state, apostle(state, city), 0)).toBe(false);
  });

  it('the record founds through the same verb', () => {
    const { state } = ready();
    const s = seatOf(state, 0)!;
    applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [],
      beliefs: [pick('CHORAL_MUSIC'), pick('GURDWARA')] });
    expect(s.religion.founded).toBe(true);
    expect(s.religion.worship).toBe('GURDWARA');
  });

  it('beliefs and the worship building take effect', () => {
    const { state, city } = ready();
    const before = computeCityStats(state, city);
    expect(adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('GURDWARA')]).ok).toBe(true);

    // FOLLOWER beliefs act per-city on the religion the CITY follows. The
    // holy city follows seat 0's religion (id 0) once pressure spreads from
    // its own holy tile; assert on a following city.
    city.followedReligion = 0;
    const after = computeCityStats(state, city);
    // Choral Music: shrine +2c, temple +4c
    expect(after.breakdown.buildings.culture - before.breakdown.buildings.culture).toBe(6);
    // the Gurdwara is buildable now (and only that worship building) — built
    // with Production like any other row
    const buildable = availableBuildings(state, city).map((b) => b.id);
    expect(buildable).toContain('GURDWARA');
    expect(buildable).not.toContain('STUPA');
    standBuilding(state, city, 'GURDWARA');
    expect(city.buildings).toContain('GURDWARA');
    // Tithe (GS, TITHE_GOLD_CITY_MODIFIER): +3 gold per CITY following the
    // religion — the Founder belief, added by the enhancement
    expect(adoptBeliefs(state, 0, [pick('TITHE'), pick('ITINERANT_PREACHERS')]).ok).toBe(true);
    expect(computeCityStats(state, city).breakdown.bonuses.gold).toBeGreaterThanOrEqual(3);
  });

  it('the worship rows the install gives: the Gurdwara\'s housing, the Pagoda\'s favor, the Wat and the Synagogue', () => {
    expect(BUILDINGS.GURDWARA.housing).toBe(1);
    expect(BUILDINGS.PAGODA.favorPerTurn).toBe(1);
    expect(BUILDINGS.WAT.yields).toEqual({ faith: 3, science: 2 });
    expect(BUILDINGS.SYNAGOGUE.yields).toEqual({ faith: 5 });
    expect(BUILDINGS.DAR_E_MEHR.disasterProof).toBe(true);
    // one building per Worship belief, every one a worship row
    for (const b of Object.values(WORSHIP_BELIEFS)) expect(BUILDINGS[b.effects.worshipBuilding!]?.worship).toBe(true);
    expect(Object.values(BUILDINGS).filter((b) => b.worship).length).toBe(Object.keys(WORSHIP_BELIEFS).length);
    const { state, city } = ready();
    adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('PAGODA')]);
    const favor0 = seatBuildingSum(state, 0, 'favorPerTurn');
    city.buildings.push('PAGODA');
    expect(seatBuildingSum(state, 0, 'favorPerTurn') - favor0).toBe(1);
  });

  it('the worship faith-buy takes the Worship belief\'s building off the queue', () => {
    const { state, city } = ready();
    expect(buyWorshipBuilding(state, city.id, 0).ok).toBe(false); // no religion
    adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('TITHE')]);
    expect(buyWorshipBuilding(state, city.id, 0).ok).toBe(false); // no Worship belief
    state.sandbox = true;
    adoptBeliefs(state, 0, [pick('WAT'), pick('HOLY_ORDER')]);
    state.sandbox = false;
    city.queue.push({ kind: 'building', building: 'WAT', progress: 30 });
    seatOf(state, 0)!.faith = 1000;
    const bank0 = city.productionBank ?? 0;
    expect(buyWorshipBuilding(state, city.id, 0).ok).toBe(true);
    expect(city.buildings).toContain('WAT');
    expect(city.queue.some((q) => q.kind === 'building' && q.building === 'WAT')).toBe(false);
    expect((city.productionBank ?? 0) - bank0).toBe(30);
  });

  it('a Mosque adds a spread charge to the Missionaries bought in its city', () => {
    const { state, city } = ready();
    adoptBeliefs(state, 0, [pick('CHORAL_MUSIC'), pick('MOSQUE')]);
    city.followedReligion = 0;
    seatOf(state, 0)!.faith = 10000;
    expect(purchaseReligiousUnit(state, city.id, 'MISSIONARY', 0).ok).toBe(true);
    const base = state.units.filter((u) => u.type === 'MISSIONARY')[0].charges ?? 0;
    city.buildings.push('MOSQUE');
    expect(purchaseReligiousUnit(state, city.id, 'MISSIONARY', 0).ok).toBe(true);
    expect(state.units.filter((u) => u.type === 'MISSIONARY')[1].charges).toBe(base + 1);
  });

  it('Religious Community pays international routes per worship building of the ORIGIN', () => {
    const { state, city } = ready();  // a complete Holy Site, a Shrine, a Temple
    expect(adoptBeliefs(state, 0, [pick('RELIGIOUS_COMMUNITY'), pick('GURDWARA')]).ok).toBe(true);
    // a city NOT following the religion pays nothing
    city.followedReligion = null;
    expect(religiousCommunityGold(state, 0, city)).toBe(0);
    // the following city: 2 per Holy Site + Shrine + Temple
    city.followedReligion = 0;
    expect(religiousCommunityGold(state, 0, city)).toBe(6);
    // ...and the worship building makes four
    city.buildings.push('GURDWARA');
    expect(religiousCommunityGold(state, 0, city)).toBe(8);
    // a follower belief without the clause pays nothing
    seatOf(state, 0)!.religion.follower = 'CHORAL_MUSIC';
    expect(religiousCommunityGold(state, 0, city)).toBe(0);
  });

  it('Work Ethic converts holy site adjacency into production', () => {
    const { state, city } = ready();
    tileAtCoords(state.map, 11, 9).elevation = 'MOUNTAIN'; // next to the holy site
    // PILGRIMAGE stands in for the deleted CHURCH_PROPERTY: the same
    // `perCity` effect shape, and this lane asserts on Work Ethic alone.
    adoptBeliefs(state, 0, [pick('WORK_ETHIC'), pick('PILGRIMAGE')]);
    // Work Ethic is a FOLLOWER belief — it applies to the city that
    // follows the religion (the holy city, id 0, once pressure spreads).
    city.followedReligion = 0;
    const stats = computeCityStats(state, city);
    expect(stats.breakdown.districts.production).toBeGreaterThanOrEqual(1);
    expect(stats.breakdown.districts.production).toBe(stats.breakdown.districts.faith);
  });
});

describe('trade routes', () => {
  function twoCities() {
    const state = makeState(makeMap(24, 20));
    state.sandbox = true;
    const a = foundCity(state, tileAtCoords(state.map, 8, 9).index, 0).city!;
    const b = foundCity(state, tileAtCoords(state.map, 14, 9).index, 0).city!;
    expandBorders(state, a, 2);
    expandBorders(state, b, 2);
    return { state, a, b };
  }

  it('capacity comes from the civic, buildings and wonders', () => {
    const { state, a, b } = twoCities();
    expect(tradeCapacity(state, 0)).toBe(0);
    grantCivics(state, 'FOREIGN_TRADE');
    expect(tradeCapacity(state, 0)).toBe(1);
    standDistrict(state, a, 'COMMERCIAL_HUB', tileAtCoords(state.map, 9, 9).index);
    standBuilding(state, a, 'MARKET');
    expect(tradeCapacity(state, 0)).toBe(2);
    void b;
  });

  it('validates routes and pays the origin', () => {
    const { state, a, b } = twoCities();
    expect(addTradeRoute(state, a.id, b.id, 0).ok).toBe(false); // no capacity
    grantCivics(state, 'FOREIGN_TRADE');
    expect(addTradeRoute(state, a.id, a.id, 0).ok).toBe(false); // self
    expect(addTradeRoute(state, a.id, b.id, 0).ok).toBe(true);
    expect(addTradeRoute(state, a.id, b.id, 0).ok).toBe(false); // duplicate + capacity

    // base domestic yields: +1 food +1 production
    expect(routeYields(state, b)).toMatchObject({ food: 1, production: 1 });
    const stats = computeCityStats(state, a);
    expect(stats.breakdown.trade.food).toBe(1);
    expect(stats.breakdown.trade.production).toBe(1);

    // each completed district adds its District_TradeRouteYields row: a
    // Campus +1 food, a Holy Site +1 food (domestic column)
    b.population = 7; // allow the district count
    standDistrict(state, b, 'CAMPUS', tileAtCoords(state.map, 15, 9).index);
    standDistrict(state, b, 'HOLY_SITE', tileAtCoords(state.map, 13, 9).index);
    expect(routeYields(state, b)).toMatchObject({ food: 3, production: 1 });
  });

  it('enforces range', () => {
    const state = makeState(makeMap(40, 12));
    state.sandbox = true;
    const a = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const b = foundCity(state, tileAtCoords(state.map, 36, 6).index, 0).city!;
    grantCivics(state, 'FOREIGN_TRADE');
    expect(canAddTradeRoute(state, a.id, b.id, 0).ok).toBe(false);
  });
});

describe('religious pressure spread', () => {
  it("a trade route carries the origin's religion to a far destination, and the destination's back at half strength", () => {
    // CIV6 (RELIGION_SPREAD_TRADE_ROUTE_PRESSURE_FOR_DESTINATION 1.0 / _FOR_ORIGIN
    // 0.5); the half-point lands on EVEN turns. The GPU twin is
    // tests/gpu/route_pressure_test.py.
    const state = makeState(makeMap(40, 20));
    state.sandbox = true;
    state.seats.push(emptySeat(1));
    const a = foundCity(state, tileAtCoords(state.map, 5, 10).index, 0).city!;
    const b = foundCity(state, tileAtCoords(state.map, 32, 10).index, 1).city!; // 27 tiles: no ambient reach
    for (const [seat, city] of [[0, a], [1, b]] as const) {
      const r = seatOf(state, seat)!.religion;
      r.founded = true;
      r.holyTile = city.centerIndex;
      grantFoundingPressure(state, seat);
      city.followedReligion = seat;
    }
    seatOf(state, 0)!.tradeRoutes = [{ from: a.id, toSeat: 1, toSeatCity: b.id, expiresTurn: state.turn + 100 }];
    const step = HOLY_CITY_PRESSURE_MULT * RELIGION_PRESSURE_PER_TURN; // each Holy City presses ITSELF
    const delta = (city: City, g: number, run: () => void) => {
      const before = city.religionPressure?.[g] ?? 0;
      run();
      return (city.religionPressure?.[g] ?? 0) - before;
    };
    // an EVEN turn: 1 down the route, the half-point back
    state.turn = 10;
    expect(delta(b, 0, () => spreadReligiousPressure(state))).toBe(1);
    expect(delta(a, 1, () => spreadReligiousPressure(state))).toBe(1);
    // an ODD turn: 1 down the route, nothing back
    state.turn = 11;
    expect(delta(b, 0, () => spreadReligiousPressure(state))).toBe(1);
    expect(delta(a, 1, () => spreadReligiousPressure(state))).toBe(0);
    // each Holy City's own step rides beside it
    expect(delta(a, 0, () => spreadReligiousPressure(state))).toBe(step);
    // India: +100% on the OWNER's routes — 2 down, 1 back, on an odd turn too
    state.seats[0].civ = CIV_LEADERS.findIndex((l) => l.civ === 'INDIA');
    expect(delta(b, 0, () => spreadReligiousPressure(state))).toBe(2);
    expect(delta(a, 1, () => spreadReligiousPressure(state))).toBe(1);
  });

  it("a holy city converts cities within range each turn; distant cities stay unconverted", () => {
    const state = makeState(makeMap(40, 20));
    state.sandbox = true;
    const cap = foundCity(state, tileAtCoords(state.map, 5, 10).index, 0).city!;
    const near = foundCity(state, tileAtCoords(state.map, 9, 10).index, 0).city!; // 4 tiles
    const far = foundCity(state, tileAtCoords(state.map, 32, 10).index, 0).city!; // 27 tiles
    // Seat 0 founds a religion; the capital's center is the holy tile (id 0),
    // and the founding grant (200 per citizen) is what makes it FOLLOW.
    seatOf(state, 0)!.religion.founded = true;
    seatOf(state, 0)!.religion.holyTile = cap.centerIndex;
    grantFoundingPressure(state, 0);

    endTurn(state);
    expect(cap.followedReligion).toBe(0);
    expect(near.followedReligion ?? null).toBeNull(); // nothing pressed it yet: the Holy City presses from the turn AFTER it follows
    expect(far.followedReligion ?? null).toBeNull(); // out of range — no pressure

    // The Holy City presses x4 a turn, itself included; the near city converts
    // once that holds more than half of its total against its atheism
    // baseline (50 per citizen), and the far city never hears of it.
    const p = cap.religionPressure![0];
    endTurn(state);
    expect(cap.religionPressure![0]).toBe(p + HOLY_CITY_PRESSURE_MULT * RELIGION_PRESSURE_PER_TURN);
    expect(near.religionPressure![0]).toBe(HOLY_CITY_PRESSURE_MULT * RELIGION_PRESSURE_PER_TURN);
    const need = Math.floor((ATHEISM_PRESSURE_PER_POP * near.population) / (HOLY_CITY_PRESSURE_MULT * RELIGION_PRESSURE_PER_TURN)) + 1;
    for (let t = 1; t < need; t++) endTurn(state);
    expect(near.followedReligion).toBe(0); // within RELIGION_PRESSURE_RANGE
    expect(far.religionPressure?.[0] ?? 0).toBe(0);
    expect(far.followedReligion ?? null).toBeNull();
    // The majority-pressure flip and the cross-civ tie -> lowest-id case are
    // covered by the GPU poke (gpu/religion_gp_test.py) and the parity gate,
    // where 24 seat-0 cities flip to the two civ religions turn-exact.
  });
});
