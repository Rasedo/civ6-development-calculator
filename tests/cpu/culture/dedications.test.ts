import { describe, it, expect } from 'vitest';
import { BARB_SEAT, emptySeat, seatOf, setTileOwner, setWar } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { archaeologistExcavate, spawnUnit } from '../../../cpu/core/units';
import { meleeAttack } from '../../../cpu/core/combat';
import { revealAround } from '../../../cpu/core/fog';
import { completeQueueItem } from '../../../cpu/core/production';
import { routePlunderer, cityTradeYields } from '../../../cpu/core/trade';
import { computeCityStats, seatTourism } from '../../../cpu/core/city';
import { effectiveAdjacency } from '../../../cpu/core/yields';
import { eraBoundary, goldenMoveBonus } from '../../../cpu/core/eras';
import {
  DEDICATIONS,
  DED_EVENT_SCORE,
  DED_DRACONES,
  DED_COINAGE,
  DED_STEAM,
  DED_TO_ARMS,
  DED_MONUMENTALITY,
  DED_EXODUS,
  DED_WISH,
  DED_SKY,
  DED_AUTOMATON,
  SKY_EUREKAS,
  SKY_ALUMINUM_PER_TURN,
  AUTOMATON_URANIUM_PER_TURN,
  AUTOMATON_URANIUM_PER_MINE,
  ERA_SCORE_GP,
  DEDICATION_ERAS,
  ERA_LENGTH,
  DRACONES_DISCOVERY_SCORE,
  COINAGE_INTL_GOLD_PER_SPEC,
  GOLDEN_MOVE_BONUS,
} from '../../../cpu/data/seats';
import { BUILDING_ERA_INDEX } from '../../../cpu/data/buildings';
import { UNITS } from '../../../cpu/data/units';
import { RESOURCES } from '../../../world/resources';
import { emptyStockpile } from '../../../cpu/data/constants';
import { accrueStockpiles, strategicSlot } from '../../../cpu/core/stockpile';
import { advanceGreatPeople, ensureGpOffer, gpOfferCost } from '../../../cpu/core/greatPeople';
import { INDUSTRIAL_ERA_INDEX } from '../../../cpu/data/techs';
import type { GameState } from '../../../cpu/core/types';

function commit(state: GameState, seat: number, kind: number, golden = false): void {
  const s = seatOf(state, seat)!;
  s.age = golden ? 2 : 1;
  s.dedicationPicks = [kind];
  s.eraScore = 0;
}

describe('the four new dedications', () => {
  it('the catalog holds twelve, with per-event scores', () => {
    expect(DEDICATIONS.length).toBe(12);
    expect(DED_EVENT_SCORE.length).toBe(12);
    expect(BUILDING_ERA_INDEX.FACTORY).toBeGreaterThanOrEqual(INDUSTRIAL_ERA_INDEX);
    expect(BUILDING_ERA_INDEX.GRANARY ?? 0).toBeLessThan(INDUSTRIAL_ERA_INDEX);
  });

  it('Hic Sunt Dracones: a non-barbarian naval kill pays +1 era score', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 9).index);
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    commit(state, 0, DED_DRACONES);
    const sea = tileAtCoords(state.map, 12, 9);
    sea.terrain = 'COAST';
    const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index, 0)!;
    const galley = spawnUnit(state, 'GALLEY', sea.index, 1)!;
    galley.hp = 1;
    expect(meleeAttack(state, atk.id, sea.index, 0).ok).toBe(true);
    expect(galley.hp).toBeLessThanOrEqual(0);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_DRACONES]);
    // a barbarian galley pays nothing
    commit(state, 0, DED_DRACONES);
    const barb = spawnUnit(state, 'GALLEY', sea.index, BARB_SEAT)!;
    barb.hp = 1;
    atk.movesLeft = 2;
    atk.attacksLeft = 1;
    expect(meleeAttack(state, atk.id, sea.index, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.eraScore).toBe(0);
  });

  it('Hic Sunt Dracones: a natural wonder discovered pays +3, once', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.fogOfWar = true;
    settleAt(state, tileAtCoords(state.map, 3, 9).index);
    commit(state, 0, DED_DRACONES);
    seatOf(state, 0)!.explored = [];
    tileAtCoords(state.map, 12, 9).wonder = 'CLIFFS';
    revealAround(state, 0, tileAtCoords(state.map, 12, 10).index, 2);
    expect(seatOf(state, 0)!.eraScore).toBe(DRACONES_DISCOVERY_SCORE * DED_EVENT_SCORE[DED_DRACONES]);
    revealAround(state, 0, tileAtCoords(state.map, 12, 8).index, 2); // already explored
    expect(seatOf(state, 0)!.eraScore).toBe(DRACONES_DISCOVERY_SCORE);
  });

  it('Hic Sunt Dracones, Golden face: naval and embarked units move +2', () => {
    const state = makeState(makeMap(20, 20));
    settleAt(state, tileAtCoords(state.map, 3, 9).index);
    commit(state, 0, DED_DRACONES, true);
    expect(goldenMoveBonus(state, { type: 'GALLEY', seat: 0 })).toBe(GOLDEN_MOVE_BONUS);
    expect(goldenMoveBonus(state, { type: 'WARRIOR', seat: 0, embarked: true })).toBe(GOLDEN_MOVE_BONUS);
    expect(goldenMoveBonus(state, { type: 'WARRIOR', seat: 0 })).toBe(0);
  });

  it('Reform the Coinage: a route that runs its term pays +1 era score', () => {
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    commit(state, 0, DED_COINAGE);
    seatOf(state, 0)!.tradeRoutes = [
      { from: city.id, to: city.id, expiresTurn: state.turn }, // the term is up this very turn
    ];
    endTurn(state);
    const gained = seatOf(state, 0)!.eraScore ?? 0;
    expect(gained).toBeGreaterThanOrEqual(DED_EVENT_SCORE[DED_COINAGE]);
  });

  it('Reform the Coinage, Golden face: no plunder, +3 gold per foreign specialty', () => {
    const state = makeState(makeMap(24, 20));
    state.unitsMode = true;
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    state.seats.push(emptySeat(1));
    const dest = settleAt(state, tileAtCoords(state.map, 15, 9).index, 1);
    const dt = tileAtCoords(state.map, 16, 9);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    dest.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    // a hostile barb standing ON the Trader's tile plunders the route...
    const bt = tileAtCoords(state.map, 10, 9).index;
    spawnUnit(state, 'WARRIOR', bt, BARB_SEAT);
    expect(routePlunderer(state, bt, 0)).toBe(BARB_SEAT);
    // ...until the Golden face
    commit(state, 0, DED_COINAGE, true);
    expect(routePlunderer(state, bt, 0)).toBe(null);
    state.units = state.units.filter((u) => u.seat !== BARB_SEAT); // the raider leaves before the yield reads
    seatOf(state, 0)!.tradeRoutes = [
      { from: city.id, to: -1, toSeat: 1, toSeatCity: dest.id, expiresTurn: state.turn + 100 },
    ];
    const withG = cityTradeYields(state, city, 0).gold;
    commit(state, 0, DED_MONUMENTALITY, true); // golden, different pick
    const without = cityTradeYields(state, city, 0).gold;
    expect(withG - without).toBe(COINAGE_INTL_GOLD_PER_SPEC * 1);
  });

  it('Heartbeat of Steam: an Industrial-or-later building constructed pays +2', () => {
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    commit(state, 0, DED_STEAM);
    completeQueueItem(state, city, { kind: 'building', building: 'FACTORY', progress: 0 }, 355, 0);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_STEAM]);
    completeQueueItem(state, city, { kind: 'building', building: 'GRANARY', progress: 0 }, 65, 0);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_STEAM]); // ancient pays nothing
  });

  it('Heartbeat of Steam, Golden face: campus science adjacency pays production too', () => {
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const ct = tileAtCoords(state.map, 11, 9);
    ct.district = 'CAMPUS';
    ct.districtComplete = true;
    tileAtCoords(state.map, 12, 9).elevation = 'MOUNTAIN';
    tileAtCoords(state.map, 12, 8).elevation = 'MOUNTAIN';
    city.districts.push({ type: 'CAMPUS', tileIndex: ct.index });
    commit(state, 0, DED_STEAM, true);
    const withG = computeCityStats(state, city).breakdown.districts.production;
    commit(state, 0, DED_MONUMENTALITY, true);
    const without = computeCityStats(state, city).breakdown.districts.production;
    const adj = effectiveAdjacency(
      { map: state.map, mods: { adjacencyMult: {} } } as never,
      ct,
      'CAMPUS',
    );
    expect(adj).toBeGreaterThan(0);
    expect(withG - without).toBe(adj);
  });

  it('To Arms!, Golden face: +15% production toward military units', () => {
    const run = (golden: boolean): number => {
      const state = makeState(makeMap(20, 20));
      const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
      commit(state, 0, DED_TO_ARMS, golden);
      city.queue = [{ kind: 'unit', unit: 'WARRIOR', progress: 0, cost: 100000 }];
      endTurn(state);
      return city.queue[0]?.kind === 'unit' ? city.queue[0].progress : -1;
    };
    const normal = run(false);
    const golden = run(true);
    expect(normal).toBeGreaterThan(0);
    expect(golden).toBeCloseTo(normal * 1.15, 9);
  });

  it('a world era offers a WINDOW, and every pick comes out of it', () => {
    // Ancient offers none — no civ has earned an era score when the game opens.
    expect(DEDICATION_ERAS[0]).toEqual([]);
    for (let era = 1; era < DEDICATION_ERAS.length; era++) {
      expect(DEDICATION_ERAS[era].length).toBeGreaterThan(0);
      for (const d of DEDICATION_ERAS[era]) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(DEDICATIONS.length);
      }
    }
    // CIV6: "Exodus of the Evangelists is available only through the first 3
    // eras (Classical through Renaissance), while Wish You Were Here is
    // available only in the last 2 eras."
    const has = (d: number) => DEDICATION_ERAS.map((w) => w.includes(d));
    expect(has(DED_EXODUS)).toEqual([false, true, true, true, false, false, false, false, false]);
    expect(has(DED_WISH)).toEqual([false, false, false, false, false, false, true, true, true]);

    // and the commit at an era boundary draws from the window, never outside it
    const state = makeState(makeMap(16, 16));
    state.seats.push(emptySeat(1));
    for (let era = 1; era <= 8; era++) {
      state.turn = era * ERA_LENGTH;
      eraBoundary(state);
      const window = DEDICATION_ERAS[era];
      for (const seat of state.seats) {
        const picks = seat.dedicationPicks ?? [];
        expect(picks.length).toBe(seat.dedications);
        for (const d of picks) expect(window).toContain(d);
      }
    }
  });

  it('Wish You Were Here: +1 era score per artifact, golden parks and governor wonders', () => {
    const state = makeState(makeMap(24, 24));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    city.buildings.push('ARCHAEOLOGICAL_MUSEUM');
    const dig = tileAtCoords(state.map, 10, 9);
    setTileOwner(dig, 0);
    dig.antiquity = true;
    const digger = spawnUnit(state, 'ARCHAEOLOGIST', dig.index, 0)!;
    digger.charges = 1;
    commit(state, 0, DED_WISH);
    expect(archaeologistExcavate(state, digger.id, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_WISH]);

    // GOLDEN: a governor city's WORLD WONDER pays 50% more tourism, and a
    // National Park doubles. The city holds the only governor title going.
    const wt = tileAtCoords(state.map, 8, 9);
    setTileOwner(wt, 0);
    wt.ownerCity = city.id;
    wt.builtWonder = 'PYRAMIDS';
    wt.builtWonderComplete = true;
    const govIds = new Set([city.id]);
    commit(state, 0, DED_MONUMENTALITY, true);
    const plain = seatTourism(state, 0, govIds);
    wt.builtWonderComplete = false;
    const noWonder = seatTourism(state, 0, govIds);
    wt.builtWonderComplete = true;
    const base = plain - noWonder;
    expect(base).toBeGreaterThan(0);

    commit(state, 0, DED_WISH, true);
    expect(seatTourism(state, 0, new Set<number>())).toBe(plain); // no governor, no bonus
    expect(seatTourism(state, 0, govIds) - noWonder).toBe(Math.floor((base * 3) / 2));

    // ...and the National Park half of the same face doubles a park's payout
    const park = tileAtCoords(state.map, 5, 5);
    setTileOwner(park, 0);
    park.park = 0;
    tileAtCoords(state.map, 6, 5).feature = 'WOODS';
    tileAtCoords(state.map, 4, 5).feature = 'WOODS';
    const parked = seatTourism(state, 0, new Set<number>());
    commit(state, 0, DED_MONUMENTALITY, true);
    const parkedPlain = seatTourism(state, 0, new Set<number>());
    expect(parkedPlain).toBeGreaterThan(plain);
    expect(parked - plain).toBe(2 * (parkedPlain - plain));
  });
});

describe('the three late-era dedications', () => {
  it('Sky and Stars: an Aerodrome building and a Great Person each pay +1', () => {
    // CIV6: "+1 Era Score for each Aerodrome building constructed. +1 Era Score
    // each time a Great Person is Earned."
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    commit(state, 0, DED_SKY);
    completeQueueItem(state, city, { kind: 'building', building: 'HANGAR', progress: 0 }, 380, 0);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_SKY]);
    completeQueueItem(state, city, { kind: 'building', building: 'GRANARY', progress: 0 }, 65, 0);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_SKY]); // not an Aerodrome building

    commit(state, 0, DED_SKY);
    ensureGpOffer(state, 'SCIENTIST'); // the offer is drawn state, not a formula
    seatOf(state, 0)!.gpp.SCIENTIST = gpOfferCost(state, 'SCIENTIST');
    advanceGreatPeople(state, 0);
    expect(seatOf(state, 0)!.gpEarned.length).toBe(1);
    expect(seatOf(state, 0)!.eraScore).toBe(ERA_SCORE_GP + DED_EVENT_SCORE[DED_SKY]);
  });

  it('Sky and Stars, Golden face: the era\'s Eurekas land, and Aluminum mines pay +2', () => {
    // CIV6: "Unlocks the Eurekas for Advanced Flight, Nuclear Fission, and
    // Rocketry if in the Atomic Era", and (GS) "Aluminum mines accumulate +2
    // more resources per turn."
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const atomic = 6;
    state.turn = atomic * ERA_LENGTH;
    seatOf(state, 0)!.eraScore = 100; // straight into a Golden age
    eraBoundary(state);
    const picks = seatOf(state, 0)!.dedicationPicks ?? [];
    const boosted = seatOf(state, 0)!.research.boosted;
    for (const id of SKY_EUREKAS[atomic]) {
      expect(boosted.includes(id)).toBe(picks.includes(DED_SKY));
    }

    const mine = tileAtCoords(state.map, 10, 9);
    setTileOwner(mine, 0, city.id);
    mine.resource = 'ALUMINUM';
    mine.improvement = RESOURCES.ALUMINUM.improvement;
    const k = strategicSlot('ALUMINUM');
    commit(state, 0, DED_MONUMENTALITY, true);
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    const plain = seatOf(state, 0)!.stockpile![k];
    commit(state, 0, DED_SKY, true);
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    expect(seatOf(state, 0)!.stockpile![k] - plain).toBe(SKY_ALUMINUM_PER_TURN);
  });

  it('Automaton Warfare: only a Giant Death Robot kill pays, and never on a barbarian', () => {
    // CIV6: "+1 Era Score each time you kill a non-Barbarian unit with a Giant
    // Death Robot."
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 9).index);
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    const gdr = Object.keys(UNITS).find((u) => UNITS[u].gdr)!;

    commit(state, 0, DED_AUTOMATON);
    const robot = spawnUnit(state, gdr, tileAtCoords(state.map, 11, 9).index, 0)!;
    const prey = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 9).index, 1)!;
    prey.hp = 1;
    expect(meleeAttack(state, robot.id, prey.tileIndex, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.eraScore).toBe(DED_EVENT_SCORE[DED_AUTOMATON]);

    // an ordinary chassis pays nothing
    commit(state, 0, DED_AUTOMATON);
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    const prey2 = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 5).index, 1)!;
    prey2.hp = 1;
    expect(meleeAttack(state, foot.id, prey2.tileIndex, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.eraScore).toBe(0);

    // and a barbarian victim pays nothing either
    commit(state, 0, DED_AUTOMATON);
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 9).index, BARB_SEAT)!;
    barb.hp = 1;
    robot.movesLeft = 4;
    robot.attacksLeft = 1;
    expect(meleeAttack(state, robot.id, barb.tileIndex, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.eraScore).toBe(0);
  });

  it('Automaton Warfare, Golden face: a robot in the capital, and the Uranium', () => {
    // CIV6: "Gain a Giant Death Robot in your capital. Receive 3 Uranium per
    // turn. Uranium mines accumulate +1 more resource per turn."
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const gdr = Object.keys(UNITS).find((u) => UNITS[u].gdr)!;
    state.turn = 7 * ERA_LENGTH;
    seatOf(state, 0)!.eraScore = 100;
    eraBoundary(state);
    const picks = seatOf(state, 0)!.dedicationPicks ?? [];
    expect(state.units.some((u) => u.type === gdr && u.seat === 0)).toBe(picks.includes(DED_AUTOMATON));

    const k = strategicSlot('URANIUM');
    commit(state, 0, DED_MONUMENTALITY, true);
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    const plain = seatOf(state, 0)!.stockpile![k];
    commit(state, 0, DED_AUTOMATON, true);
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    expect(seatOf(state, 0)!.stockpile![k] - plain).toBe(AUTOMATON_URANIUM_PER_TURN);

    // ...and a mine of its own pays one more on top
    const mine = tileAtCoords(state.map, 10, 9);
    setTileOwner(mine, 0, city.id);
    mine.resource = 'URANIUM';
    mine.improvement = RESOURCES.URANIUM.improvement;
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    const mined = seatOf(state, 0)!.stockpile![k];
    commit(state, 0, DED_MONUMENTALITY, true);
    seatOf(state, 0)!.stockpile = emptyStockpile();
    accrueStockpiles(state, 0);
    const minedPlain = seatOf(state, 0)!.stockpile![k];
    expect(mined - minedPlain).toBe(AUTOMATON_URANIUM_PER_TURN + AUTOMATON_URANIUM_PER_MINE);
  });
});
