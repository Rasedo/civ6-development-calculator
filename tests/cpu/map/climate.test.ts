import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, expandBorders, grantTechs, bareCtx } from '../helpers';
import {
  deriveLowlands, standingRemovable, deforestationLevel, worldCarbon, climatePoints,
  emitCarbon, plantCarbon, unitCarbon, climateTurn, floodLevel, floodBarrierCost,
  cityLowlands, repairBehindBarrier, floodFertilityHalted, stormFertilityHalted, fertilityRemoval, removeFertility,
  pollutionFavorPenalty, CARBON_PER_RESOURCE, warmingDegrees,
} from '../../../cpu/core/climate';
import {
  CLIMATE_PHASES, CO2_PER_POINT, CO2_PER_DEGREE, CARBON_PER_POWER, climatePhase, deforestationModifier,
  pollutionPoints, FLOOD_BARRIER_PER_TILE,
} from '../../../cpu/data/climate';
import { FLOOD_WEIGHT, FLOOD_CIPD, DROUGHT_WEIGHT, RANDOM_EVENT_START_TURN, STORM_EVENTS, STANDARD_MAP_AREA } from '../../../cpu/data/disasters';
import { disasterPhase, eventRows, floodWeights, stormWeights } from '../../../cpu/core/disasters';
import { availableBuildings, buildingCostIn } from '../../../cpu/core/rules';
import { availableProjects } from '../../../cpu/core/game';
import { completeQueueItem } from '../../../cpu/core/production';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import { seatOf } from '../../../cpu/core/seats';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { spawnUnit, unitPassable } from '../../../cpu/core/units';
import { tileYields } from '../../../cpu/core/yields';
import { isWater } from '../../../world/query';
import type { GameState } from '../../../cpu/core/types';

// Gathering Storm's climate arc, clause by clause. Every magnitude below is
// the Climate (Civ6) page's own or the install's; the place it publishes
// nothing is marked MODEL in cpu/data/climate.ts and is asserted for SHAPE,
// not value.

/** Emit exactly what `points` Climate Change points cost RIGHT NOW — the
 *  deforestation band scales every raw unit before it becomes a point, and a
 *  map with nothing to clear sits in the cleanest band at -20%. */
function emitPoints(state: GameState, points: number): void {
  emitCarbon(state, 0, (CO2_PER_POINT * points) / (1 + deforestationModifier(deforestationLevel(state))));
}

/** A map with a sea along the left edge, so the lowland bands run inland. */
function coast(width = 10, height = 8) {
  const map = makeMap(width, height);
  for (const t of map.tiles) if (t.col === 0) t.terrain = 'COAST';
  deriveLowlands(map);
  return map;
}

describe('coastal lowlands', () => {
  it('bands run inland from the water, and only over FLAT land', () => {
    const map = coast();
    // CIV6: "Each coastal tile has a rating of 1-3, which shows how soon it
    // will get affected: tiles with a rating of 1 are the lowest ones and
    // will get hit first."
    expect(tileAtCoords(map, 1, 3).lowland).toBe(1);
    expect(tileAtCoords(map, 2, 3).lowland).toBe(2);
    expect(tileAtCoords(map, 3, 3).lowland).toBe(3);
    expect(tileAtCoords(map, 4, 3).lowland).toBeUndefined();
    expect(tileAtCoords(map, 0, 3).lowland).toBeUndefined(); // the sea itself
  });

  it('a hill on the shoreline is no lowland, and it does not pass the band on', () => {
    const map = makeMap(10, 8);
    for (const t of map.tiles) if (t.col === 0) t.terrain = 'COAST';
    tileAtCoords(map, 1, 3).elevation = 'HILLS';
    deriveLowlands(map);
    expect(tileAtCoords(map, 1, 3).lowland).toBeUndefined();
    // and the band does not pass THROUGH it: the tile behind is reached only
    // by whatever path goes around, which is what a BFS from the water means
    // and a per-column walk would not.
    expect(tileAtCoords(map, 2, 3).lowland).toBeGreaterThan(2);
  });
});

describe('carbon accounting', () => {
  it('a plant discharges its fuel rate times the published carbon per Power', () => {
    // CIV6: "820, 490, and 48 for Coal, Oil, and Uranium" per unit of Power,
    // over a plant's own Power-per-resource (4, 4, 16).
    expect(plantCarbon('COAL', 4, 1)).toBe(3280);
    expect(plantCarbon('OIL', 4, 1)).toBe(1960);
    expect(plantCarbon('URANIUM', 16, 1)).toBe(768);
    // and that IS the page's own per-resource display, after /1000
    expect(pollutionPoints(plantCarbon('COAL', 4, 1))).toBe(3);
    expect(CARBON_PER_POWER.COAL).toBe(820);
  });

  it('the per-resource table is built from the plants that burn each slot', () => {
    const coalSlot = STRATEGIC_IDS.indexOf('COAL');
    const horseSlot = STRATEGIC_IDS.indexOf('HORSES');
    expect(CARBON_PER_RESOURCE[coalSlot]).toBe(3280);
    expect(CARBON_PER_RESOURCE[horseSlot]).toBe(0); // no plant burns it
  });

  it('a unit discharges a quarter of a plant: half the rate over half a unit', () => {
    // CIV6: "their emissions are equal to only half of Power Plants per unit
    // of resource", and "each military unit only takes 0.5 resource units".
    const coalSlot = STRATEGIC_IDS.indexOf('COAL');
    expect(unitCarbon(coalSlot, 1, false)).toBe(3280 * 0.5 * 0.5);
    expect(unitCarbon(STRATEGIC_IDS.indexOf('IRON'), 1, false)).toBe(0);
    // CIV6: Advanced Power Cells "halves the CO2 emitted by units"
    expect(unitCarbon(coalSlot, 1, true)).toBe(3280 * 0.5 * 0.5 * 0.5);
  });

  it('Carbon Recapture may take a seat below zero', () => {
    const state = makeState();
    emitCarbon(state, 0, 1000);
    emitCarbon(state, 0, -50_000);
    expect(seatOf(state, 0)!.co2).toBe(-49_000);
  });
});

describe('deforestation', () => {
  function wooded(n: number): GameState {
    const map = makeMap(8, 8);
    for (let i = 0; i < n; i++) map.tiles[i].feature = 'WOODS';
    return makeState(map);
  }

  it('the level is what has gone, over what the map started with', () => {
    const state = wooded(20);
    expect(state.removableAtStart).toBe(20);
    expect(deforestationLevel(state)).toBe(0);
    for (let i = 0; i < 5; i++) state.map.tiles[i].feature = null;
    expect(deforestationLevel(state)).toBeCloseTo(0.25, 9);
    expect(standingRemovable(state.map)).toBe(15);
  });

  it('the bands are the published five, and they scale the world total', () => {
    // CIV6: 0-9% -20%, 10-24% 0%, 25-39% +10%, 40-49% +30%, 50%+ +50%.
    expect(deforestationModifier(0.00)).toBe(-0.2);
    expect(deforestationModifier(0.09)).toBe(-0.2);
    expect(deforestationModifier(0.10)).toBe(0);
    expect(deforestationModifier(0.24)).toBe(0);
    expect(deforestationModifier(0.25)).toBeCloseTo(0.1, 9);
    expect(deforestationModifier(0.40)).toBeCloseTo(0.3, 9);
    expect(deforestationModifier(0.50)).toBeCloseTo(0.5, 9);

    const state = wooded(20);
    emitCarbon(state, 0, 1_000_000);
    // nothing cleared yet: the cleanest band takes 20% back off
    expect(worldCarbon(state)).toBeCloseTo(800_000, 6);
    for (let i = 0; i < 10; i++) state.map.tiles[i].feature = null; // 50%
    expect(worldCarbon(state)).toBeCloseTo(1_500_000, 6);
  });
});

describe('the seven phases', () => {
  it('the point thresholds and their effects are the published table', () => {
    expect(CLIMATE_PHASES.map((p) => p.points)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(CLIMATE_PHASES.map((p) => p.iceMelt)).toEqual([0.1, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85]);
    // Phase II floods the 1m band, III the 2m, V the 3m; IV/VI/VII submerge.
    expect(CLIMATE_PHASES.map((p) => p.flood)).toEqual([0, 1, 2, 0, 3, 0, 0]);
    expect(CLIMATE_PHASES.map((p) => p.submerge)).toEqual([0, 0, 0, 1, 0, 2, 3]);
    // RandomEvents' RANDOM_EVENT_SEA_LEVEL_RISE rows: RISE4 on halts the
    // floods' and storms' fertility, RISE5 on takes it back
    expect(CLIMATE_PHASES.map((p) => p.haltsFlood)).toEqual([false, false, false, true, true, true, true]);
    expect(CLIMATE_PHASES.map((p) => p.haltsStorm)).toEqual([false, false, false, true, true, true, true]);
    expect(CLIMATE_PHASES.map((p) => p.fertilityRemoval)).toEqual([0, 0, 0, 0, 15, 30, 45]);
  });

  it('points come from the world total over the Duel threshold', () => {
    const state = makeState();
    emitPoints(state, 3);
    expect(climatePoints(state)).toBe(3);
    expect(climatePhase(3)).toBe(1); // Phase II starts at 3 points
    expect(climatePhase(1)).toBe(-1);
    expect(climatePhase(8)).toBe(6);
  });

  it('the phase never steps back, however the carbon moves', () => {
    const state = makeState(coast());
    emitPoints(state, 4);
    climateTurn(state);
    expect(state.climateIdx).toBe(2);
    // CIV6: "It is not possible to revert climate change to an earlier phase."
    emitCarbon(state, 0, -seatOf(state, 0)!.co2!);
    climateTurn(state);
    expect(state.climateIdx).toBe(2);
  });

  it('with random events on, the crossing\'s sea waits for the next event step, the turn\'s event by force', () => {
    const state = makeState(coast());
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    emitPoints(state, 3);
    climateTurn(state);
    const front = tileAtCoords(state.map, 1, 3);
    expect(state.climateIdx).toBe(1);
    expect(state.seaRiseFrom).toBe(-1);
    expect(front.flooded).toBeUndefined();
    disasterPhase(state);
    expect(state.seaRiseFrom).toBeUndefined();
    expect(front.flooded).toBe(true);
  });

  it('Phase II floods the shoreline band and leaves the ones behind it dry', () => {
    const state = makeState(coast());
    emitPoints(state, 3);
    climateTurn(state);
    expect(state.climateIdx).toBe(1);
    const front = tileAtCoords(state.map, 1, 3);
    const behind = tileAtCoords(state.map, 2, 3);
    expect(front.flooded).toBe(true);
    // CIV6: flooded tiles "get pillaged ... These tiles can still be worked,
    // but they won't enjoy any improvement bonuses", which IS `pillaged`.
    expect(front.pillaged).toBe(true);
    expect(behind.flooded).toBeUndefined();
    // and band 2 goes under at Phase III
    emitPoints(state, 1);
    climateTurn(state);
    expect(state.climateIdx).toBe(2);
    expect(behind.flooded).toBe(true);
  });

  it('Phase IV takes band 1 forever, and the sea keeps what it takes', () => {
    const state = makeState(coast());
    state.unitsMode = true;
    const front = tileAtCoords(state.map, 1, 3);
    front.improvement = 'FARM';
    front.road = true;
    const foot = spawnUnit(state, 'WARRIOR', front.index, 0)!;
    const hull = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 0, 3).index, 0)!;
    emitPoints(state, 5);
    climateTurn(state);
    expect(state.climateIdx).toBe(3);
    // CIV6 (Coastal Lowlands): the band is "lost forever" — a Coast now
    expect(front.submerged).toBe(true);
    expect(front.terrain).toBe('COAST');
    expect(isWater(front)).toBe(true);
    expect(front.improvement).toBe(null);
    expect(front.road).toBe(false);
    expect(front.lowland).toBeUndefined();
    expect(unitPassable(front, hull)).toBe(true);
    expect(unitPassable(front, foot)).toBe(false);
    // it yields a Coast's Food and Gold
    const ctx = bareCtx(state.map);
    const y = tileYields(ctx, front);
    expect([y.food, y.production, y.gold]).toEqual([1, 0, 1]);
    // ...and the land unit caught on it went down with the ground, while the
    // hull beside it is simply afloat
    expect(state.units.includes(foot)).toBe(false);
    expect(state.units.includes(hull)).toBe(true);
    // band 2 is still dry: it goes at Phase VI
    const behind = tileAtCoords(state.map, 2, 3);
    expect(behind.submerged).toBeUndefined();
    emitPoints(state, 2);
    climateTurn(state);
    expect(state.climateIdx).toBe(5);
    expect(behind.submerged).toBe(true);
  });

  it('a Flood Barrier keeps its own city dry, and no centre is ever taken', () => {
    const state = makeState(coast(12, 10));
    const city = settleAt(state, tileAtCoords(state.map, 1, 4).index, 0);
    expandBorders(state, city, 2);
    const centre = state.map.tiles[city.centerIndex];
    expect(centre.lowland).toBe(1);
    const mine = state.map.tiles.find(
      (x) => x.lowland === 1 && x.ownerCity === city.id && x.index !== centre.index,
    )!;
    const far = state.map.tiles.find((x) => x.lowland === 1 && x.ownerSeat < 0)!;
    city.buildings.push('FLOOD_BARRIER');
    emitPoints(state, 5);
    climateTurn(state);
    expect(state.climateIdx).toBe(3);
    expect(mine.submerged).toBeUndefined();   // behind the barrier
    expect(far.submerged).toBe(true);         // and outside it
    // a city is never destroyed by the sea, barrier or no
    city.buildings.length = 0;
    expect(centre.submerged).toBeUndefined();
    emitPoints(state, 2);
    climateTurn(state);
    expect(centre.submerged).toBeUndefined();
  });

  it('the polar ice melts by the phase fraction, from the front of the map', () => {
    const map = coast();
    for (let i = 0; i < 20; i++) map.tiles[i].feature = 'ICE';
    const state = makeState(map);
    expect(state.iceAtStart).toBe(20);
    emitPoints(state, 2); // Phase I: 10%
    climateTurn(state);
    expect(state.map.tiles.filter((t) => t.feature === 'ICE').length).toBe(18);
    emitPoints(state, 2); // through Phase III: 30%
    climateTurn(state);
    expect(state.map.tiles.filter((t) => t.feature === 'ICE').length).toBe(14);
  });
});

describe('the Flood Barrier', () => {
  function shore() {
    const state = makeState(coast(12, 10));
    const city = settleAt(state, tileAtCoords(state.map, 2, 4).index);
    expandBorders(state, city, 3);
    return { state, city };
  }

  it('prices itself off the lowland tiles it covers and the sea level', () => {
    const { state, city } = shore();
    const n = cityLowlands(state, city).length;
    expect(n).toBeGreaterThan(0);
    // CIV6: "(80 x coastal lowland tiles) + (80 x coastal lowland tiles x
    // flood level)" — at flood level 0 that is the first term alone.
    expect(floodLevel(state)).toBe(0);
    expect(floodBarrierCost(state, city)).toBe(FLOOD_BARRIER_PER_TILE * n);
    state.climateIdx = 0; // Phase I: the first sea level rise
    expect(floodLevel(state)).toBe(1);
    expect(floodBarrierCost(state, city)).toBe(FLOOD_BARRIER_PER_TILE * n * 2);
    expect(buildingCostIn(state, city, 'FLOOD_BARRIER')).toBe(FLOOD_BARRIER_PER_TILE * n * 2);
  });

  it('is offered only to a city that has a lowland tile, and never for gold', () => {
    const { state, city } = shore();
    grantTechs(state, 'COMPUTERS');
    expect(availableBuildings(state, city).some((b) => b.id === 'FLOOD_BARRIER')).toBe(true);
    // CIV6: "Cannot be Purchased with Gold."
    expect(BUILDINGS.FLOOD_BARRIER.noPurchase).toBe(true);
    // strip the city of its lowlands and the row goes off the list
    for (const t of cityLowlands(state, city)) t.lowland = undefined;
    expect(availableBuildings(state, city).some((b) => b.id === 'FLOOD_BARRIER')).toBe(false);
  });

  it('protects its city from the rising sea, and repairs what already went under', () => {
    const { state, city } = shore();
    const mine = cityLowlands(state, city).filter((t) => t.lowland === 1);
    expect(mine.length).toBeGreaterThan(0);

    // without a barrier the band floods
    emitPoints(state, 3);
    climateTurn(state);
    expect(mine.every((t) => t.flooded)).toBe(true);

    // CIV6: "If constructed after some of the city's tiles have been flooded,
    // those tiles can be repaired in full and used again."
    completeQueueItem(state, city, { kind: 'building', building: 'FLOOD_BARRIER', progress: 0 }, 0);
    expect(mine.every((t) => !t.flooded)).toBe(true);
    expect(mine.every((t) => !t.pillaged)).toBe(true);

    // and the next band never goes under at all
    const band2 = cityLowlands(state, city).filter((t) => t.lowland === 2);
    emitPoints(state, 1);
    climateTurn(state);
    expect(state.climateIdx).toBe(2);
    expect(band2.some((t) => t.flooded)).toBe(false);
  });

  it('repairBehindBarrier leaves another city\'s flooded ground alone', () => {
    const { state, city } = shore();
    const far = tileAtCoords(state.map, 1, 9);
    far.flooded = true;
    far.pillaged = true;
    repairBehindBarrier(state, city);
    expect(far.flooded).toBe(true);
  });
});

describe('what a warmed world does to its weather', () => {
  it('a row grows by its own ChanceIncreasePerDegree, per degree of warming', () => {
    // CIV6 (Maps_XP2.CO2For1DegreeTempRise, MAPSIZE_DUEL): 500,000 CO2 a
    // degree, two Climate Change points
    expect(CO2_PER_DEGREE).toBe(500_000);
    expect(CO2_PER_POINT * 2).toBe(CO2_PER_DEGREE);
    const state = makeState();
    expect(warmingDegrees(state)).toBe(0);
    emitPoints(state, 3);
    expect(warmingDegrees(state)).toBeCloseTo(1.5, 9);
    // the floods 20 / 20 / 20: the mix holds, the family grows — integer
    // tenths plus trunc(CIPD x w x T) // 100
    expect([...FLOOD_CIPD]).toEqual([20, 20, 20]);
    expect(floodWeights(0)).toEqual(FLOOD_WEIGHT.map((w) => w * 10));
    expect(floodWeights(2)).toEqual([28, 21, 14]);
    // nothing is added until the product reaches 100: 20 x 20 x 0.24 = 96
    expect(floodWeights(0.24)).toEqual([20, 15, 10]);
    expect(floodWeights(0.25)).toEqual([21, 15, 10]);
    // the storms 0 on the milder row, 50 on the worse, on a Standard map
    expect(STORM_EVENTS.map((e) => e.cipd)).toEqual([0, 50, 0, 50, 0, 50, 0, 50]);
    const std = STANDARD_MAP_AREA;
    const st = stormWeights(2, std);
    STORM_EVENTS.forEach((e, i) => expect(st[i]).toBe(Math.floor(e.weight * 10) * (e.cipd ? 2 : 1)));
    // the droughts MAJOR 0, EXTREME 50; the pack's fires 50 each; the
    // eruptions, the accidents and the meteor hold
    const rows = eventRows(2, std);
    const drought = rows.filter((r) => r.family === 'drought').map((r) => r.weight);
    expect(drought).toEqual([DROUGHT_WEIGHT[0] * 10, DROUGHT_WEIGHT[1] * 20]);
    const fires = rows.filter((r) => r.family === 'fire').map((r) => r.weight);
    expect(fires).toEqual([120, 120]);
    // a once-per-map row scales with the map's area, a per-site row does not
    const duel = eventRows(0, 44 * 26);
    const stdRows = eventRows(0, std);
    duel.forEach((r, i) => expect(r.weight).toBe(['storm', 'drought', 'meteor', 'fire'].includes(r.family)
      ? Math.floor(stdRows[i].weight * 44 * 26 / std) : stdRows[i].weight));
    const base = eventRows(0, std);
    rows.forEach((r, i) => {
      if (r.family === 'eruption' || r.family === 'accident' || r.family === 'meteor') {
        expect(r.weight).toBe(base[i].weight);
      }
    });
  });

  it('the sea risen to Phase IV halts fertility, Phase V takes it back', () => {
    const state = makeState();
    expect(floodFertilityHalted(state)).toBe(false);
    expect(stormFertilityHalted(state)).toBe(false);
    state.climateIdx = 3; // Phase IV, its rise still waiting for its step
    state.seaRiseFrom = 2;
    expect(floodFertilityHalted(state)).toBe(false);
    state.seaRiseFrom = undefined;
    expect(floodFertilityHalted(state)).toBe(true);
    expect(stormFertilityHalted(state)).toBe(true);
    expect(fertilityRemoval(state)).toBe(0);
    state.climateIdx = 6; // Phase VII: 45%
    expect(fertilityRemoval(state)).toBe(45);

    // x = 45 * 3 = 135: one rand(100) under 35 takes 2, else 1
    const t = state.map.tiles[0];
    t.fertility = 3;
    t.fertilityProd = 0;
    const s0 = state.rngState;
    removeFertility(state, t);
    const v = Math.floor(((Math.imul(1103515245, s0) + 12345) >>> 16 & 0xffff) * 100 / 65536);
    expect(t.fertility).toBe(v < 35 ? 1 : 2);
    expect(t.fertilityProd).toBe(0); // no fertility, no draw
    expect(state.rngState).toBe((Math.imul(1103515245, s0) + 12345) >>> 0);
  });
});

describe('what pollution costs in the Congress', () => {
  it('-1 favor per 3 points over the average, capped at 20', () => {
    const state = makeState();
    state.seats.push(seatOf(state, 0)!.seat === 0 ? { ...seatOf(state, 0)!, seat: 1, co2: 0 } : seatOf(state, 0)!);
    // one seat at 12 points, one at 0 -> average 6, so 6 over -> -2
    seatOf(state, 0)!.co2 = 12_000;
    seatOf(state, 1)!.co2 = 0;
    expect(pollutionPoints(12_000)).toBe(12);
    expect(pollutionFavorPenalty(state, 0)).toBe(2);
    expect(pollutionFavorPenalty(state, 1)).toBe(0); // below average pays nothing

    // CIV6: "This penalty caps at 20."
    seatOf(state, 0)!.co2 = 10_000_000;
    expect(pollutionFavorPenalty(state, 0)).toBe(20);
  });
});

describe('Carbon Recapture', () => {
  it('waits on its civic, then pays favor and takes carbon back out', () => {
    const state = makeState(coast(12, 10));
    const city = settleAt(state, tileAtCoords(state.map, 4, 4).index);
    expandBorders(state, city, 3);
    const before = seatOf(state, 0)!.diplomaticFavor;

    // CIV6: the project "becomes available after building an Industrial Zone
    // ... and discovering Global Warming Mitigation" — the civic gates it.
    expect(availableProjects(state, city).some((p) => p.id === 'CARBON_RECAPTURE')).toBe(false);

    completeQueueItem(state, city,
      { kind: 'project', project: 'CARBON_RECAPTURE', progress: 0, cost: 0 }, 0);
    // CIV6: "awards 30 Diplomatic Favor and reduces the civilization's
    // lifetime carbon emissions by 50 CO2 points."
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(before + 30);
    expect(seatOf(state, 0)!.co2).toBe(-50_000);
    expect(pollutionPoints(seatOf(state, 0)!.co2!)).toBe(-50);
  });
});
