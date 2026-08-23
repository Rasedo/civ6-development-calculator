import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, expandBorders, grantTechs } from '../helpers';
import {
  deriveLowlands, standingRemovable, deforestationLevel, worldCarbon, climatePoints,
  emitCarbon, plantCarbon, unitCarbon, climateTurn, floodLevel, floodBarrierCost,
  cityLowlands, repairBehindBarrier, fertilityLive, desertificationLive, defertilize,
  pollutionFavorPenalty, CARBON_PER_RESOURCE,
} from '../../../cpu/core/climate';
import {
  CLIMATE_PHASES, CO2_PER_POINT, CARBON_PER_POWER, climatePhase, deforestationModifier,
  disasterRateMult, severitySplit, pollutionPoints, FLOOD_BARRIER_PER_TILE,
} from '../../../cpu/data/climate';
import { FLOOD_SEVERITY_P } from '../../../cpu/data/disasters';
import { availableBuildings, buildingCostIn } from '../../../cpu/core/rules';
import { availableProjects } from '../../../cpu/core/game';
import { completeQueueItem } from '../../../cpu/core/production';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import { seatOf } from '../../../cpu/core/seats';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { GameState } from '../../../cpu/core/types';

// Gathering Storm's climate arc, clause by clause. Every magnitude below is
// the Climate (Civ6) page's own; the two places it publishes nothing are
// marked MODEL in cpu/data/climate.ts and are asserted for SHAPE, not value.

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
    // CIV6: "In Phase IV and beyond, Storms and Floods will no longer provide
    // fertility"; desertification starts "past Phase IV".
    expect(CLIMATE_PHASES.map((p) => p.fertility)).toEqual([true, true, true, false, false, false, false]);
    expect(CLIMATE_PHASES.map((p) => p.desertification)).toEqual([false, false, false, false, true, true, true]);
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
    state.climateIdx = 1; // Phase II has taken the 1m band
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
  it('the disaster rate and the severity split ride the published melt curve', () => {
    // MODEL, asserted for SHAPE: both escalate, monotonically, off the ONE
    // curve the page publishes, and phase 0 leaves each untouched.
    expect(disasterRateMult(-1)).toBe(1);
    expect(disasterRateMult(0)).toBeCloseTo(1.1, 9);
    expect(disasterRateMult(6)).toBeCloseTo(1.85, 9);
    for (let p = 1; p < CLIMATE_PHASES.length; p++) {
      expect(disasterRateMult(p)).toBeGreaterThan(disasterRateMult(p - 1));
    }
    expect(severitySplit(FLOOD_SEVERITY_P, -1)).toEqual([...FLOOD_SEVERITY_P]);
    const worst = severitySplit(FLOOD_SEVERITY_P, 6);
    expect(worst[0]).toBeLessThan(FLOOD_SEVERITY_P[0]);
    expect(worst[2]).toBeGreaterThan(FLOOD_SEVERITY_P[2]);
    expect(worst.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('fertility stops at Phase IV and reverses at Phase V', () => {
    const state = makeState();
    expect(fertilityLive(state)).toBe(true);
    expect(desertificationLive(state)).toBe(false);
    state.climateIdx = 3; // Phase IV
    expect(fertilityLive(state)).toBe(false);
    expect(desertificationLive(state)).toBe(false);
    state.climateIdx = 4; // Phase V
    expect(desertificationLive(state)).toBe(true);

    const t = state.map.tiles[0];
    t.fertility = 2;
    t.fertilityProd = 1;
    defertilize(t);
    expect(t.fertility).toBe(1);
    expect(t.fertilityProd).toBe(0);
    defertilize(t);
    expect(t.fertility).toBe(0);
    expect(t.fertilityProd).toBe(0); // floors, never negative
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
