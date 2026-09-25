/**
 * THE MINOR'S BUILD TABLE — what a city-state's city produces (C-38's
 * census, `MINOR_BUILD_ROWS`), the production rows it pays under
 * (MINOR_CIV_PRODUCTION_*), the units it trains into the pool under its own
 * seat, and its Builders' improvement pick. The GPU twin is
 * tests/gpu/minor_builds_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { minorImprovementPicks, minorPhase } from '../../../cpu/core/minorBuild';
import { computeCityStats } from '../../../cpu/core/city';
import { builderCost, spawnUnit } from '../../../cpu/core/units';
import { wallsTier } from '../../../cpu/core/rules';
import {
  CITY_STATE_TYPE_DISTRICT, CITY_STATE_TYPES, MINOR_ARMY_CAP_SLOTS, MINOR_BUILD_ROWS, MINOR_BUILD_SLOTS,
  MINOR_BUILDER_PROD_PCT, MINOR_BUILDER_RADIUS, MINOR_DISFAVORED_DISTRICTS, MINOR_EXCLUDED_UNIT_CLASSES,
  MINOR_HARBOR_PROD_PCT, MINOR_MILITARY_PROD_PCT, MINOR_PRODUCTION_PCT, MINOR_SMALL_MILITARY,
  MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_WALLS_PROD_PCT, type MinorBuildRow,
} from '../../../cpu/data/cityStates';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { TECHS } from '../../../cpu/data/techs';
import { UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN } from '../../../cpu/data/units';
import { UNIT_PROMO_CLASS } from '../../../cpu/data/promotions';
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

const rowOf = (pred: (r: MinorBuildRow) => boolean): number => {
  const r = MINOR_BUILD_ROWS.findIndex(pred);
  expect(r).toBeGreaterThanOrEqual(0);
  return r;
};
const buildingRow = (id: string) => rowOf((r) => r.kind === 'building' && r.item?.scientific === id);
const TYPE_DISTRICT_ROW = () => rowOf((r) => r.kind === 'district' && r.item === CITY_STATE_TYPE_DISTRICT);
const HARBOR_ROW = () => rowOf((r) => r.kind === 'district' && r.item?.scientific === 'HARBOR');
const TIER1_ROW = () => rowOf((r) => r.kind === 'building' && r.item?.scientific === 'LIBRARY');
const MELEE_ROW = () => rowOf((r) => r.kind === 'unit' && r.cls === 'MELEE');
const RANGED_ROW = () => rowOf((r) => r.kind === 'unit' && r.cls === 'RANGED');

/** the episode's draws, set by hand: the listed drawn rows are due now, every
 *  other drawn row never, and the army cap is `cap` */
function plan(cs: CityState, due: number[], cap = 0): void {
  cs.buildFrom = MINOR_BUILD_ROWS.map((row, r) => (row.from ? (due.includes(r) ? 0 : -1) : 0));
  cs.armyCap = cap;
}

/** a spent Builder on the centre: the Builder row sees one standing and it
 *  lays nothing */
function idleBuilder(state: GameState, cs: CityState): void {
  const u = spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat)!;
  u.charges = 0;
}

const half = (100 + MINOR_PRODUCTION_PCT) / 100;
function turnOf(state: GameState, cs: CityState): number {
  state.turn = 1;
  cs.prodProgress = 0;
  const p = computeCityStats(state, minorCity(cs)).total.production;
  expect(p).toBeGreaterThan(0);
  minorPhase(state);
  return p;
}
function hold(cs: CityState, district: 'CAMPUS', t: Tile): void {
  setTileOwner(t, cs.seat);
  t.district = district;
  t.districtComplete = true;
  (cs.districts ??= []).push({ type: district, tileIndex: t.index });
}

// ---------------------------------------------------------------------------
describe('the build table', () => {
  it('holds only what the install lets a minor build and the engine hosts', () => {
    for (const row of MINOR_BUILD_ROWS) {
      for (const t of CITY_STATE_TYPES) {
        if (row.from) expect(row.from[t].length).toBe(MINOR_BUILD_SLOTS);
        const id = row.item?.[t];
        if (!id) continue;
        if (row.kind === 'district') {
          // MinorCivDistricts: the type's own district, or one it does not disfavour
          expect(id === CITY_STATE_TYPE_DISTRICT[t] || !MINOR_DISFAVORED_DISTRICTS.includes(id as never), id).toBe(true);
        } else {
          const def = BUILDINGS[id];
          expect(def, id).toBeTruthy();
          // a minor's grid is C-1's: nothing it builds draws or supplies Power
          expect(def.power ?? 0, id).toBe(0);
          expect(def.powerSupply ?? 0, id).toBe(0);
          expect(def.worship, id).toBeFalsy();
        }
      }
      if (row.cls) expect(MINOR_EXCLUDED_UNIT_CLASSES).not.toContain(row.cls);
    }
    expect(MINOR_DISFAVORED_DISTRICTS.length).toBe(16);
    expect(MINOR_ARMY_CAP_SLOTS.length).toBe(MINOR_BUILD_SLOTS);
    expect(MINOR_BUILD_ROWS[0].kind).toBe('builder');
    expect(MINOR_BUILD_ROWS[MINOR_BUILD_ROWS.length - 1].kind).toBe('army');
  });

  it('draws the episode once, at the first build: a slot per drawn row, then the cap', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { type: 'religious' });
    state.rngState = 12345;
    minorPhase(state);
    expect(cs.buildFrom).toHaveLength(MINOR_BUILD_ROWS.length);
    expect(cs.armyCap).toBeDefined();
    MINOR_BUILD_ROWS.forEach((row, r) => {
      if (row.from) expect(row.from.religious).toContain(cs.buildFrom![r]);
      else expect(cs.buildFrom![r]).toBe(0);
    });
    expect(MINOR_ARMY_CAP_SLOTS).toContain(cs.armyCap);
    const drawn = [...cs.buildFrom!];
    const cap = cs.armyCap;
    minorPhase(state);
    expect(cs.buildFrom).toEqual(drawn);
    expect(cs.armyCap).toBe(cap);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's production rows (MINOR_CIV_PRODUCTION_*)", () => {
  it('with nothing wanted the pot takes half the yield', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, []);
    const p = turnOf(state, cs);
    expect(cs.prodProgress).toBe(p * half);
  });

  it('toward the walls: +200%, and the walls complete off that pot', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, [buildingRow('ANCIENT_WALLS')]);
    cs.research.techs = ['MINING', 'MASONRY'];
    const p = turnOf(state, cs);
    expect(MINOR_WALLS_PROD_PCT).toBe(200);
    expect(cs.prodProgress).toBe(p * half * ((100 + MINOR_WALLS_PROD_PCT) / 100));
    expect(cs.buildings ?? []).not.toContain('ANCIENT_WALLS');
    cs.prodProgress = BUILDINGS.ANCIENT_WALLS.cost - p * half * 3 + 1;
    minorPhase(state);
    expect(cs.buildings).toContain('ANCIENT_WALLS');
    expect(cs.outerHp).toBe(WALLS_TIER_HP[1]);
  });

  it('a drawn row wants nothing before its turn', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, []);
    cs.buildFrom![buildingRow('ANCIENT_WALLS')] = 50;
    cs.research.techs = ['MINING', 'MASONRY'];
    const p = turnOf(state, cs);
    expect(cs.prodProgress).toBe(p * half);
    state.turn = 50;
    cs.prodProgress = 0;
    minorPhase(state);
    expect(cs.prodProgress).toBe(p * half * 3);
  });

  it("toward the type's district: +500%; toward its tier-1 building: no row", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, { buildings: ['ANCIENT_WALLS'] });
    idleBuilder(state, cs);
    plan(cs, [TYPE_DISTRICT_ROW(), TIER1_ROW()]);
    cs.research.techs = ['POTTERY', 'WRITING'];
    const p = turnOf(state, cs);
    expect(MINOR_TYPE_DISTRICT_PROD_PCT.scientific).toBe(500);
    expect(cs.prodProgress).toBe(p * half * ((100 + MINOR_TYPE_DISTRICT_PROD_PCT.scientific) / 100));
    expect(cs.districts ?? []).toEqual([]);

    const b = makeState(makeMap(24, 24));
    const cs2 = addCs(b, 12, 12, { buildings: ['ANCIENT_WALLS'] });
    idleBuilder(b, cs2);
    plan(cs2, [TYPE_DISTRICT_ROW(), TIER1_ROW()]);
    cs2.research.techs = ['POTTERY', 'WRITING'];
    hold(cs2, 'CAMPUS', tileAtCoords(b.map, 13, 12));
    const p2 = turnOf(b, cs2);
    expect(cs2.prodProgress).toBe(p2 * half * 1);
  });

  it('toward the Harbor: +500%', () => {
    const state = makeState(makeMap(24, 24));
    for (let c = 14; c < 24; c++) for (let r = 0; r < 24; r++) tileAtCoords(state.map, c, r).terrain = 'COAST';
    const cs = addCs(state, 12, 12);
    for (const t of tilesWithin(state.map, 12, 12, 2)) setTileOwner(t, cs.seat);
    idleBuilder(state, cs);
    plan(cs, [HARBOR_ROW()]);
    cs.research.techs = ['SAILING', 'ASTROLOGY', 'CELESTIAL_NAVIGATION'];
    const p = turnOf(state, cs);
    expect(MINOR_HARBOR_PROD_PCT).toBe(500);
    expect(cs.prodProgress).toBe(p * half * ((100 + MINOR_HARBOR_PROD_PCT) / 100));
  });

  it('toward a Builder: +200% while none stands, and the next one costs more', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    plan(cs, []);
    const p = turnOf(state, cs);
    expect(MINOR_BUILDER_PROD_PCT).toBe(200);
    expect(cs.prodProgress).toBe(p * half * 3);
    const cost0 = builderCost(state, cs.seat);
    cs.prodProgress = cost0;
    minorPhase(state);
    const builders = state.units.filter((u) => u.seat === cs.seat && u.type === 'BUILDER');
    expect(builders).toHaveLength(1);
    expect(builders[0].charges).toBe(UNITS.BUILDER.charges);
    expect(cs.buildersTrained).toBe(1);
    expect(builderCost(state, cs.seat)).toBeGreaterThan(cost0);
  });

  it('toward a military unit: +200% below ten military units, none at ten', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, [], 20); // the army row wants one while fewer than 20 stand
    const p = turnOf(state, cs);
    expect(MINOR_MILITARY_PROD_PCT).toBe(200);
    expect(cs.prodProgress).toBe(p * half * 3);
    const b = makeState(makeMap(40, 40));
    const cs2 = addCs(b, 20, 20);
    idleBuilder(b, cs2);
    plan(cs2, [], 20);
    const far = tilesWithin(b.map, 20, 20, 3).filter((t) => hexDistance(t.col, t.row, 20, 20) >= 2);
    for (let k = 0; k < MINOR_SMALL_MILITARY; k++) spawnUnit(b, 'WARRIOR', far[k].index, cs2.seat);
    const p2 = turnOf(b, cs2);
    expect(cs2.prodProgress).toBe(p2 * half);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's training", () => {
  it('the melee row trains its strongest melee while fewer than three military stand', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, [MELEE_ROW()]);
    spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat);
    spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat);
    state.turn = 1;
    cs.prodProgress = UNITS.WARRIOR.cost;
    minorPhase(state);
    const army = state.units.filter((u) => u.seat === cs.seat && u.type === 'WARRIOR');
    expect(army).toHaveLength(3);
    // the new unit lands beside the centre, under the minor's seat
    expect(hexDistance(state.map.tiles[army[2].tileIndex].col, state.map.tiles[army[2].tileIndex].row, 12, 12))
      .toBeLessThanOrEqual(1);
    // three stand: the row wants no fourth
    const pot = cs.prodProgress!;
    minorPhase(state);
    expect(state.units.filter((u) => u.seat === cs.seat && u.type === 'WARRIOR')).toHaveLength(3);
    expect(cs.prodProgress).toBeGreaterThan(pot);
  });

  it("the ranged row trains the minor's strongest ranged chassis while none stands", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, [RANGED_ROW()]);
    state.turn = 1;
    cs.prodProgress = 500;
    minorPhase(state);
    expect(state.units.filter((u) => u.seat === cs.seat && u.type === 'SLINGER')).toHaveLength(1);
    cs.research.techs = ['ANIMAL_HUSBANDRY', 'ARCHERY'];
    cs.prodProgress = 500;
    minorPhase(state);
    expect(state.units.some((u) => u.seat === cs.seat && u.type === 'ARCHER')).toBe(false); // a ranged unit stands
  });

  it('the army row takes the class its army holds fewest of against the census weights', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    idleBuilder(state, cs);
    plan(cs, [], 6);
    // Bronze Working opens the Spearman; the Slinger needs nothing
    cs.research.techs = ['MINING', 'BRONZE_WORKING'];
    spawnUnit(state, 'SLINGER', cs.centerIndex, cs.seat);
    state.turn = 1;
    cs.prodProgress = 500;
    minorPhase(state);
    // RANGED 140 (one held: 2/140) against ANTICAV 92 (none: 1/92): the Spearman
    const trained = state.units.filter((u) => u.seat === cs.seat && u.type !== 'BUILDER' && u.type !== 'SLINGER');
    expect(trained.map((u) => u.type)).toEqual(['SPEARMAN']);
    expect(UNIT_PROMO_CLASS.SPEARMAN).toBe('ANTICAV');
  });

  it('a unit with no free tile on or beside the centre is not paid for', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    plan(cs, []);
    // a foreign unit on the centre and on every ring tile
    for (const t of tilesWithin(state.map, 12, 12, 1)) {
      expect(spawnUnit(state, 'WARRIOR', t.index, 0)?.tileIndex).toBe(t.index);
    }
    state.turn = 1;
    const cost = builderCost(state, cs.seat);
    cs.prodProgress = cost;
    minorPhase(state);
    expect(state.units.filter((u) => u.seat === cs.seat)).toHaveLength(0);
    expect(cs.prodProgress).toBeGreaterThan(cost);
    expect(cs.buildersTrained).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("the minor's Builders", () => {
  it("offer every valid improvement on the minor's land plots within reach", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    for (const t of tilesWithin(state.map, 12, 12, 3)) setTileOwner(t, cs.seat);
    const hill = tileAtCoords(state.map, 13, 12);
    hill.elevation = 'HILLS';
    const lake = tileAtCoords(state.map, 11, 12);
    lake.terrain = 'LAKE';
    const b = spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat)!;
    const picks = minorImprovementPicks(state, cs, b);
    for (const [ti] of picks) {
      const t = state.map.tiles[ti];
      expect(hexDistance(t.col, t.row, 12, 12)).toBeGreaterThanOrEqual(1);
      expect(hexDistance(t.col, t.row, 12, 12)).toBeLessThanOrEqual(MINOR_BUILDER_RADIUS);
      expect(t.index).not.toBe(lake.index);
    }
    // bare flat grassland takes a Farm; the hill takes no Mine without Mining
    expect(picks.filter(([ti]) => ti === hill.index)).toEqual([]);
    expect(picks.some(([, imp]) => imp === 'FARM')).toBe(true);
    cs.research.techs = ['MINING'];
    expect(minorImprovementPicks(state, cs, b)).toContainEqual([hill.index, 'MINE']);
    // pairs ascend by plot
    const plots = picks.map(([ti]) => ti);
    expect(plots).toEqual([...plots].sort((x, y) => x - y));
  });

  it('lay an improvement, stand on it, spend a charge, and are gone with the last', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12);
    for (const t of tilesWithin(state.map, 12, 12, 2)) setTileOwner(t, cs.seat);
    plan(cs, []);
    const b = spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat)!;
    state.rngState = 7;
    let laid = 0;
    for (let turn = 1; turn < 200 && state.units.includes(b); turn++) {
      state.turn = turn;
      const before = state.map.tiles.filter((t) => t.improvement).length;
      const charges = b.charges;
      minorPhase(state);
      const after = state.map.tiles.filter((t) => t.improvement).length;
      if (after > before) {
        laid += 1;
        expect(state.map.tiles[b.tileIndex].improvement).toBe('FARM');
        expect(b.charges).toBe((charges ?? 0) - 1);
      }
    }
    expect(laid).toBe(UNITS.BUILDER.charges);
    expect(state.units.includes(b)).toBe(false);
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
    idleBuilder(state, cs);
    plan(cs, []);
    // every tech but Urban Defenses held, so it is the only one available
    cs.research.techs = Object.keys(TECHS).filter((t) => t !== URBAN_DEFENSES_TECH);
    cs.research.techProgress = 1e9;
    state.turn = 1;
    minorPhase(state);
    expect(cs.research.techs).toContain(URBAN_DEFENSES_TECH);
    expect(cs.outerHp).toBe(WALLS_TIER_HP[WALLS_TIER_URBAN]);
  });
});
