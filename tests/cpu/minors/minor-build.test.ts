/**
 * THE MINOR'S BUILD STEP — the item in hand its city AI picked (`minorBuild`):
 * the progress it keeps per item, the overflow store, the production rows it
 * pays under (MINOR_CIV_PRODUCTION_*), the units it trains into the pool
 * under its own seat, its repair and district projects, its worship
 * building, its Flood Barrier, the plot its district paves; and the AI's turn
 * (`minorAiTurn`) that picks the item on an empty queue. The GPU twin is
 * tests/gpu/minor_builds_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { minorBuild, minorPhase } from '../../../cpu/core/minorBuild';
import { cityPlots, minorPlotEvals } from '../../../cpu/core/minorCityAi';
import { minorBuildFacts } from '../../../cpu/core/minorBuild';
import { buildingTable } from '../../../cpu/core/aiCityBuild';
import { computeCityStats } from '../../../cpu/core/city';
import { builderCost, spawnUnit } from '../../../cpu/core/units';
import { projectCost } from '../../../cpu/core/game';
import { floodBarrierCost } from '../../../cpu/core/climate';
import { wallsTier } from '../../../cpu/core/rules';
import {
  MINOR_BUILDER_PROD_PCT, MINOR_HARBOR_PROD_PCT, MINOR_MILITARY_PROD_PCT, MINOR_PRODUCTION_PCT, MINOR_SMALL_MILITARY,
  MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_WALLS_PROD_PCT, MINOR_REPAIR_RESUME_PCT,
} from '../../../cpu/data/cityStates';
import { PROJECTS, projectConversionRate } from '../../../cpu/data/projects';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { TECHS } from '../../../cpu/data/techs';
import { UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN } from '../../../cpu/data/units';
import { hexDistance, tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, GameState, Tile } from '../../../cpu/core/types';

function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> & { type?: CityStateType } = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: `CS${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 5,
    envoys: {},
    met: [0],
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

/** the city's Production (the minor's -50% among its percents) */
const prodOf = (state: GameState, cs: CityState): number => computeCityStats(state, minorCity(cs)).total.production;

/** the item in hand set by hand, with its progress and an empty store */
function inHand(cs: CityState, key: string, progress: number, site?: number): void {
  cs.prodItem = key;
  cs.prodProgress = progress;
  cs.prodOverflow = 0;
  if (site !== undefined) cs.prodSite = site;
}
/** one step on the city's Production */
function step(state: GameState, cs: CityState): number {
  const p = prodOf(state, cs);
  expect(p).toBeGreaterThan(0);
  minorBuild(state, cs, p);
  return p;
}
function hold(cs: CityState, district: 'CAMPUS' | 'INDUSTRIAL_ZONE', t: Tile): void {
  setTileOwner(t, cs.seat);
  t.district = district;
  t.districtComplete = true;
  (cs.districts ??= []).push({ type: district, tileIndex: t.index });
}

// ---------------------------------------------------------------------------
describe("the minor's item in hand", () => {
  it('works the item in hand and keeps nothing else; with none the step stores its Production', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    state.turn = 1;
    expect(MINOR_PRODUCTION_PCT).toBe(-50);
    const p = step(state, cs);
    expect(cs.prodItem).toBeUndefined();
    expect(cs.prodOverflow).toBe(p);
    cs.research.techs = ['MINING', 'MASONRY'];
    inHand(cs, 'building:ANCIENT_WALLS', 0);
    step(state, cs);
    expect(cs.prodProgress).toBe(p * ((100 + MINOR_WALLS_PROD_PCT) / 100));
  });

  it('a completion leaves the store the Production less what the item lacked, and the queue empty', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    cs.research.techs = ['MINING', 'MASONRY'];
    state.turn = 1;
    const p = prodOf(state, cs);
    const cost = BUILDINGS.ANCIENT_WALLS.cost;
    // one point short: the step's 3p covers it, the store keeps p - 1
    inHand(cs, 'building:ANCIENT_WALLS', cost - 1);
    step(state, cs);
    expect(cs.buildings).toContain('ANCIENT_WALLS');
    expect(cs.outerHp).toBe(WALLS_TIER_HP[1]);
    expect(cs.prodItem).toBeUndefined();
    expect(cs.prodProgress).toBe(0);
    expect(cs.prodOverflow).toBe(p - 1);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's repair of a pillaged building", () => {
  it('waits for the item in hand, then comes first and resumes at 75% of its cost', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    hold(cs, 'CAMPUS', tileAtCoords(state.map, 13, 12));
    cs.buildings = [...(cs.buildings ?? []), 'LIBRARY'];
    cs.pillagedBuildings = ['LIBRARY'];
    cs.repairWait = true;
    cs.research.techs = ['MINING', 'MASONRY'];
    state.turn = 1;
    inHand(cs, 'building:ANCIENT_WALLS', 0);
    const p = step(state, cs);
    expect(cs.prodProgress).toBe(p * ((100 + MINOR_WALLS_PROD_PCT) / 100));
    expect(cs.pillagedBuildings).toEqual(['LIBRARY']);
    // the walls complete: the wait ends
    inHand(cs, 'building:ANCIENT_WALLS', BUILDINGS.ANCIENT_WALLS.cost);
    step(state, cs);
    expect(cs.buildings).toContain('ANCIENT_WALLS');
    expect(cs.repairWait).toBe(false);
    // the repair is the item now, ahead of the item in hand, under no row
    cs.prodOverflow = 0;
    inHand(cs, 'unit:WARRIOR', 0);
    const p2 = step(state, cs);
    expect(cs.prodItem).toBe('repair:LIBRARY');
    expect(cs.prodProgress).toBe(p2);
    expect(cs.prodRetained ?? {}).toEqual({});
    expect(MINOR_REPAIR_RESUME_PCT).toBe(75);
    const full = BUILDINGS.LIBRARY.cost;
    const left = full - Math.floor((full * MINOR_REPAIR_RESUME_PCT) / 100);
    inHand(cs, 'repair:LIBRARY', left - p2);
    step(state, cs);
    expect(cs.pillagedBuildings ?? []).toEqual([]);
    expect(cs.prodProgress).toBe(0);
  });

  it('a building in a pillaged district waits for the district', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    const t = tileAtCoords(state.map, 13, 12);
    hold(cs, 'CAMPUS', t);
    t.districtPillaged = true;
    cs.buildings = [...(cs.buildings ?? []), 'LIBRARY'];
    cs.pillagedBuildings = ['LIBRARY'];
    inHand(cs, 'repair:LIBRARY', 1000);
    state.turn = 1;
    step(state, cs);
    expect(cs.pillagedBuildings).toEqual(['LIBRARY']);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's production rows (MINOR_CIV_PRODUCTION_*)", () => {
  it("toward the type's district: +500%; the Harbor: +500%; a Builder: +200%", () => {
    const state = makeState(makeMap(24, 24));
    for (let c = 14; c < 24; c++) for (let r = 0; r < 24; r++) tileAtCoords(state.map, c, r).terrain = 'COAST';
    const cs = addCs(state, 12, 12);
    for (const t of tilesWithin(state.map, 12, 12, 2)) setTileOwner(t, cs.seat);
    state.turn = 1;
    inHand(cs, 'district:CAMPUS', 0, tileAtCoords(state.map, 11, 12).index);
    const p = step(state, cs);
    expect(MINOR_TYPE_DISTRICT_PROD_PCT.scientific).toBe(500);
    expect(cs.prodProgress).toBe(p * ((100 + MINOR_TYPE_DISTRICT_PROD_PCT.scientific) / 100));
    inHand(cs, 'district:HARBOR', 0, tileAtCoords(state.map, 14, 12).index);
    step(state, cs);
    expect(MINOR_HARBOR_PROD_PCT).toBe(500);
    expect(cs.prodProgress).toBe(p * 6);
    inHand(cs, 'unit:BUILDER', 0);
    step(state, cs);
    expect(MINOR_BUILDER_PROD_PCT).toBe(200);
    expect(cs.prodProgress).toBe(p * 3);
  });

  it('a Builder completes with its charges and the next one costs more', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    state.turn = 1;
    const cost0 = builderCost(state, cs.seat);
    inHand(cs, 'unit:BUILDER', cost0);
    step(state, cs);
    const builders = state.units.filter((u) => u.seat === cs.seat && u.type === 'BUILDER');
    expect(builders).toHaveLength(1);
    expect(builders[0].charges).toBe(UNITS.BUILDER.charges);
    expect(cs.buildersTrained).toBe(1);
    expect(builderCost(state, cs.seat)).toBeGreaterThan(cost0);
  });

  it('toward a military unit: +200% below ten military units, none at ten', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    state.turn = 1;
    inHand(cs, 'unit:WARRIOR', 0);
    const p = step(state, cs);
    expect(MINOR_MILITARY_PROD_PCT).toBe(200);
    expect(cs.prodProgress).toBe(p * 3);
    const b = makeState(makeMap(40, 40));
    const cs2 = addCs(b, 20, 20);
    const far = tilesWithin(b.map, 20, 20, 3).filter((t) => hexDistance(b.map, t.col, t.row, 20, 20) >= 2);
    for (let k = 0; k < MINOR_SMALL_MILITARY; k++) spawnUnit(b, 'WARRIOR', far[k].index, cs2.seat);
    b.turn = 1;
    inHand(cs2, 'unit:WARRIOR', 0);
    const p2 = step(b, cs2);
    expect(cs2.prodProgress).toBe(p2);
  });

  it('a unit with no free tile on or beside the centre is not paid for', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    for (const t of tilesWithin(state.map, 12, 12, 1)) {
      expect(spawnUnit(state, 'WARRIOR', t.index, 0)?.tileIndex).toBe(t.index);
    }
    state.turn = 1;
    const cost = builderCost(state, cs.seat);
    inHand(cs, 'unit:BUILDER', cost);
    step(state, cs);
    expect(state.units.filter((u) => u.seat === cs.seat)).toHaveLength(0);
    expect(cs.prodItem).toBe('unit:BUILDER');
    expect(cs.prodProgress).toBeGreaterThan(cost);
    expect(cs.buildersTrained).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's Urban Defenses", () => {
  it('raises its walls tier and fills its perimeter', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'], outerHp: 30 });
    expect(wallsTier(state, minorCity(cs))).toBe(1);
    cs.research.techs.push(URBAN_DEFENSES_TECH);
    expect(wallsTier(state, minorCity(cs))).toBe(WALLS_TIER_URBAN);
  });

  it("its research landing on the tech fits the perimeter at the urban tier's pool", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'], outerHp: 30 });
    cs.research.techs = Object.keys(TECHS).filter((t) => t !== URBAN_DEFENSES_TECH);
    cs.research.tech = URBAN_DEFENSES_TECH;
    cs.research.techProgress = 1e9;
    state.turn = 1;
    minorPhase(state);
    expect(cs.research.techs).toContain(URBAN_DEFENSES_TECH);
    expect(cs.outerHp).toBe(WALLS_TIER_HP[WALLS_TIER_URBAN]);
  });
});

// ---------------------------------------------------------------------------
describe('the items the step completes', () => {
  it('the repair restores the breached walls at the HP it puts back', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'], outerHp: 20 });
    state.turn = 20;
    cs.lastHitTurn = 9;
    const cost = projectCost(state, cs.seat, 'REPAIR_DEFENSES', minorCity(cs));
    expect(cost).toBe(WALLS_TIER_HP[1] - 20);
    inHand(cs, 'project:REPAIR_DEFENSES', cost);
    step(state, cs);
    expect(cs.outerHp).toBe(WALLS_TIER_HP[1]);
  });

  it("a district project converts its row's percent of the turn's Production, read by the city's yields next turn", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'] });
    hold(cs, 'CAMPUS', tileAtCoords(state.map, 13, 12));
    state.turn = 1;
    const cost = projectCost(state, cs.seat, 'RESEARCH_GRANTS');
    inHand(cs, 'project:RESEARCH_GRANTS', 0);
    const stats = computeCityStats(state, minorCity(cs)).total;
    step(state, cs);
    const conv = Math.min(stats.production, cost) * projectConversionRate(PROJECTS.RESEARCH_GRANTS);
    expect(cs.projectYield).toEqual({ key: 'science', amount: conv });
    expect(conv).toBeGreaterThan(0);
    const withConv = computeCityStats(state, minorCity(cs)).total.science;
    delete cs.projectYield;
    expect(withConv).toBeGreaterThan(computeCityStats(state, minorCity(cs)).total.science);
  });

  it('a running Logistics project lights the grid; a finished one does not', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { type: 'industrial', buildings: ['ANCIENT_WALLS', 'WORKSHOP', 'FACTORY'] });
    hold(cs, 'INDUSTRIAL_ZONE', tileAtCoords(state.map, 13, 12));
    state.turn = 1;
    inHand(cs, 'project:LOGISTICS', 0);
    step(state, cs);
    expect(cs.fullyPowered).toBe(true);
    const pot = projectCost(state, cs.seat, 'LOGISTICS') + 100;
    inHand(cs, 'project:LOGISTICS', pot);
    step(state, cs);
    expect(cs.prodProgress).toBe(0);
    expect(cs.fullyPowered).toBe(false);
  });

  it('the worship building its majority religion names', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { type: 'religious', buildings: ['SHRINE', 'TEMPLE'] });
    const hs = tileAtCoords(state.map, 13, 12);
    setTileOwner(hs, cs.seat);
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    cs.districts = [{ type: 'HOLY_SITE', tileIndex: hs.index }];
    state.seats[0].religion = { ...state.seats[0].religion, founded: true, worship: 'CATHEDRAL' };
    cs.religionPressure = [1000];
    state.turn = 1;
    inHand(cs, 'building:CATHEDRAL', BUILDINGS.CATHEDRAL.cost);
    step(state, cs);
    expect(cs.buildings).toContain('CATHEDRAL');
  });

  it('the Flood Barrier costs by the lowland it covers', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    cs.research.techs = Object.keys(TECHS);
    const low = tileAtCoords(state.map, 13, 12);
    low.lowland = 1;
    const cost = floodBarrierCost(state, minorCity(cs));
    expect(cost).toBeGreaterThan(0);
    state.turn = 1;
    inHand(cs, 'building:FLOOD_BARRIER', cost);
    step(state, cs);
    expect(cs.buildings).toContain('FLOOD_BARRIER');
  });

  it('a district paves its plot: the improvement, the feature and a bonus resource go', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'] });
    cs.research.techs = ['POTTERY', 'WRITING'];
    const site = tileAtCoords(state.map, 13, 12);
    site.improvement = 'FARM';
    site.resource = 'WHEAT';
    state.turn = 1;
    inHand(cs, 'district:CAMPUS', 1000, site.index);
    step(state, cs);
    expect(cs.districts?.[0]).toMatchObject({ type: 'CAMPUS', tileIndex: site.index });
    expect(site.district).toBe('CAMPUS');
    expect(site.improvement).toBeNull();
    expect(site.resource).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("the minor's city AI", () => {
  it('analyses the 37 plots within three of its centre in its plot order, the centre first', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    const plots = cityPlots(state, cs.centerIndex);
    expect(plots).toHaveLength(37);
    expect(plots[0]).toBe(cs.centerIndex);
    expect(new Set(plots).size).toBe(37);
    for (const p of plots) {
      const t = state.map.tiles[p];
      expect(hexDistance(state.map, t.col, t.row, 12, 12)).toBeLessThanOrEqual(3);
    }
    const facts = minorBuildFacts(state, cs, () => 0);
    const evals = minorPlotEvals(state, cs, facts, buildingTable(facts));
    expect(evals.map((e) => e.plot)).toEqual(plots);
    expect(evals[0].improvable).toBe(false);
    // its own plots beside the centre take a Farm; the unowned ones none
    expect(evals.slice(1, 7).every((e) => e.owned && e.improvable)).toBe(true);
    expect(evals.slice(7).some((e) => e.owned)).toBe(false);
  });

  it('queues its pick on an empty queue, and works it the next turn', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    state.turn = 1;
    minorPhase(state);
    expect(cs.cityAi).toBeDefined();
    expect(cs.prodItem).toBeDefined();
    const item = cs.prodItem;
    minorPhase(state);
    expect(cs.prodItem === item || cs.prodProgress === 0).toBe(true);
  });
});
