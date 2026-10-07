import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { randRange } from '../../../cpu/core/rand';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { disasterPhase, stormWeights, eventRows, stormFootprint, stormPlot, stormWalk, stormStart, stormBirth, stormStrike } from '../../../cpu/core/disasters';
import { hexDistance, neighborTile, DIRECTION_TYPES } from '../../../world/hex';
import { STORM_EVENTS, STORM_ROWS, STORM_FAMILIES, STORM_UNIT_ROWS, WIND_ROWS, stormFamilyAt, gameLatitude, STORM_MOVEMENT, STORM_LAST_TURN_PCT, RANDOM_EVENT_START_TURN, STANDARD_MAP_AREA } from '../../../cpu/data/disasters';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { tileYields } from '../../../cpu/core/yields';
import type { GameState, StormRecord, Tile } from '../../../cpu/core/types';
import { placeCityStateAt } from '../../../cpu/core/cityStates';

/**
 * THE EIGHT NAMED STORMS — the TS half; the GPU twin is
 * tests/gpu/storms_test.py.
 *
 * CIV6 (`Expansion2_RandomEvents.xml`): a storm's FAMILY is the terrain it
 * starts on, each family has two severities, each severity its own footprint,
 * frequency, damage rows and unit band; a storm lives three turns, its birth
 * and two walks (GameCore_XP2 0x291a20, 0x28ecd0, 0x286f80). The roster's
 * eight rows on them: Divine Wind (Hojo) waives hurricane damage to Japan's
 * units and doubles it for enemies on Japanese ground; Mother Russia the same
 * over blizzards.
 */
const lcg = (s: number) => (Math.imul(1103515245, s) + 12345) >>> 0; // the generator's step, on both engines
const seatRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);
const EVI = (id: string) => STORM_EVENTS.findIndex((e) => e.id === id);
/** a family's two rows, in table order */
const familyPair = (f: string) => STORM_EVENTS.flatMap((e, i) => (e.family === f ? [i] : []));
/** a row's damage row of `kind` */
const ROW = (id: string, kind: string) => STORM_ROWS[EVI(id)].dmg.find((r) => r.kind === kind);

function draws(s0: number, s1: number, most = 12): number {
  let s = s0 >>> 0;
  for (let k = 0; k <= most; k++, s = lcg(s)) if (s === (s1 >>> 0)) return k;
  throw new Error(`the stream moved by a non-draw amount: ${s0} -> ${s1}`);
}

/** the k-th draw (from 1) of rand(100) from state `s` */
function drawAt(s: number, k: number): number {
  const probe = { rngState: s } as GameState;
  let v = 0;
  for (let i = 0; i < k; i++) v = randRange(probe, 100);
  return v;
}

/** a stream whose k-th rand(100) passes `test` */
function streamWhere(k: number, test: (v: number) => boolean): number {
  for (let s = 1; ; s++) if (test(drawAt(s, k))) return s;
}

/** a two-seat board; seat 0 may play a leader, seat 1 is at war with it */
function board(leader: string | null, terrain: 'GRASSLAND' | 'COAST' | 'SNOW' = 'GRASSLAND') {
  const state: GameState = makeState(makeMap(16, 16, terrain));
  state.unitsMode = true;
  state.disasters = true;
  state.turn = RANDOM_EVENT_START_TURN;
  state.seats.push(emptySeat(1));
  state.seats[0].civ = leader ? seatRow(leader) : -1;
  setWar(state, 0, 1, true);
  return state;
}

/** run `stormPlot` on `tile` with a fresh unit of `seat` each time and return
 *  the set of damages seen (100 = died) */
function bandOf(state: GameState, tile: Tile, ev: string, type: string, seat: number, n = 400): Set<number> {
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const u = spawnUnit(state, type, tile.index, seat)!;
    expect(u.tileIndex).toBe(tile.index);
    stormPlot(state, tile, EVI(ev), 100, false);
    const alive = state.units.find((x) => x.id === u.id);
    seen.add(alive ? 100 - alive.hp : 100);
    state.units = state.units.filter((x) => x.id !== u.id);
  }
  return seen;
}

/** the draws one land plot of row `e` spends with nothing on it */
const plotDraws = (e: number) => STORM_ROWS[e].dmg.length + STORM_ROWS[e].yields.length;

describe('the eight storms are the install\'s table', () => {
  it('names eight events in table order, two severities per family', () => {
    expect(STORM_EVENTS.map((e) => e.id)).toEqual([
      'BLIZZARD_SIGNIFICANT', 'BLIZZARD_CRIPPLING', 'DUST_STORM_GRADIENT', 'DUST_STORM_HABOOB',
      'TORNADO_FAMILY', 'TORNADO_OUTBREAK', 'HURRICANE_CAT_4', 'HURRICANE_CAT_5',
    ]);
    expect(STORM_EVENTS.map((e) => e.hexes)).toEqual([7, 19, 3, 7, 1, 3, 7, 19]);
    expect(STORM_EVENTS.every((e) => e.duration === 3)).toBe(true);
    // OccurrencesPerGame at MODERATE, each row's weight in the turn's one draw
    expect(STORM_EVENTS.map((e) => e.weight)).toEqual([8, 2, 8, 2, 15, 3, 15, 3]);
    for (const f of STORM_FAMILIES) {
      const [a, b] = familyPair(f);
      expect(STORM_EVENTS[a].severity).toBe(1);
      expect(STORM_EVENTS[b].severity).toBe(2);
    }
    // the bands: 40-60 everywhere a row exists, CAT_5's naval 60-80; the
    // milder severities damage no unit at all
    expect([ROW('HURRICANE_CAT_5', 'UNIT_DAMAGE_NAVAL')!.lo, ROW('HURRICANE_CAT_5', 'UNIT_DAMAGE_NAVAL')!.hi]).toEqual([60, 80]);
    expect(ROW('HURRICANE_CAT_4', 'UNIT_DAMAGE_LAND')).toBeUndefined();
    expect(ROW('HURRICANE_CAT_4', 'UNIT_DAMAGE_NAVAL')!.pct).toBe(60);
    for (const id of ['BLIZZARD_SIGNIFICANT', 'DUST_STORM_GRADIENT', 'TORNADO_FAMILY']) {
      expect(STORM_ROWS[EVI(id)].dmg.map((r) => r.kind)).toEqual(
        ['IMPROVEMENT_DESTROYED', 'IMPROVEMENT_PILLAGED', 'DISTRICT_PILLAGED', 'BUILDING_PILLAGED']);
    }
    // fertility: the yields table's rows — tornadoes have none
    expect(STORM_ROWS[EVI('TORNADO_FAMILY')].yields).toEqual([]);
    expect(STORM_ROWS[EVI('TORNADO_OUTBREAK')].yields).toEqual([]);
    expect(STORM_ROWS[EVI('HURRICANE_CAT_5')].yields.map((r) => r.pct)).toEqual([45, 15]);
  });

  it('the prevailing winds are the install\'s 22 rows in XML order, by the game\'s latitude', () => {
    expect(WIND_ROWS).toHaveLength(22);
    // the mid-latitudes blow EAST (NE 2 E 2 SE 1), the tropics and the poles WEST
    expect(WIND_ROWS.filter((w) => w.lo === 30).map((w) => [w.dir, w.weight])).toEqual([[0, 2], [1, 2], [2, 1]]);
    expect(WIND_ROWS.filter((w) => w.lo === 5).map((w) => [w.dir, w.weight])).toEqual([[5, 2], [4, 2], [3, 1]]);
    // the DLL's latitude, -90 + 180 x (100 row // H) // 100 in the game's
    // rows, which are this grid's
    expect([0, 17, 33, 50, 51, 99].map((r) => gameLatitude(r, 100))).toEqual([-90, -60, -31, 0, 1, 88]);
    expect(gameLatitude(8, 16)).toBe(0);
  });

  it('a family starts on its own terrains, flat or hills, never a mountain', () => {
    const t = (terrain: string, elevation = 'FLAT') => stormFamilyAt({ terrain, elevation });
    expect(t('SNOW')).toBe('BLIZZARD');
    expect(t('TUNDRA', 'HILLS')).toBe('BLIZZARD');
    expect(t('DESERT')).toBe('DUST_STORM');
    expect(t('GRASSLAND', 'HILLS')).toBe('TORNADO');
    expect(t('PLAINS')).toBe('TORNADO');
    expect(t('OCEAN')).toBe('HURRICANE');
    // this engine's LAKE is the install's COAST; neither hosts a hurricane
    expect(t('COAST')).toBeNull();
    expect(t('LAKE')).toBeNull();
    expect(t('GRASSLAND', 'MOUNTAIN')).toBeNull();
    expect(stormFamilyAt({ terrain: 'GRASSLAND', elevation: 'FLAT', submerged: true })).toBeNull();
  });

  it('the disaster phase spawns only the board\'s family; it walks the two turns after its birth', () => {
    const state = board(null, 'SNOW');
    let first: StormRecord | undefined;
    for (let i = 0; i < 2000 && !first; i++) {
      disasterPhase(state);
      first = state.storms?.[0];
    }
    expect(first).toBeDefined();
    const rec = first!;
    expect(STORM_EVENTS[rec.event].family).toBe('BLIZZARD');
    expect(state.eventLog.some((e) => e.startsWith('Storm: BLIZZARD'))).toBe(true);
    // the birth strike marked a COPY: the record's struck list starts empty
    expect(rec.left).toBe(2);
    expect(rec.struck).toEqual([]);
    disasterPhase(state);
    expect(state.storms!.find((s) => s.id === rec.id)?.left).toBe(1);
    expect(rec.struck.length).toBeGreaterThan(0);
    disasterPhase(state);
    expect(state.storms!.some((s) => s.id === rec.id)).toBe(false);
    expect(state.eventLog.every((e) => !e.startsWith('Storm') || e.startsWith('Storm: BLIZZARD'))).toBe(true);
  });

  it('a birth draws its plot, the preview, the name, then strikes a copy at full strength', () => {
    // a seat playing a civilization with a city names the storm
    const state = board('QIN', 'SNOW');
    settleAt(state, tileAtCoords(state.map, 15, 15).index, 0);
    const e = EVI('BLIZZARD_SIGNIFICANT');
    const s0 = state.rngState;
    stormBirth(state, e, false);
    const rec = state.storms![0];
    expect(rec.struck).toEqual([]);
    const fp = stormFootprint(state.map, state.map.tiles[rec.at], 7);
    expect(draws(s0, state.rngState, 200)).toBe(3 + plotDraws(e) * fp.length);
  });

  it('the walk spends 8 points, 1 a step on the storm\'s own terrain and 2 elsewhere, striking at every step', () => {
    // on an all-snow board a blizzard takes eight 1-point steps, then draws a
    // ninth it cannot pay, then the preview. Row 8 of 16 is the equator (the
    // 0..5 and -5..0 bands pool: NW, W, W, SW): every step heads west-ish.
    expect(STORM_MOVEMENT).toBe(8);
    const state = board(null, 'SNOW');
    const idx = EVI('BLIZZARD_SIGNIFICANT');
    const start = tileAtCoords(state.map, 8, 8);
    const rec: StormRecord = { id: 7, event: idx, at: start.index, left: 2, struck: [] };
    state.storms = [rec];
    const s0 = state.rngState;
    stormWalk(state, rec, 100, false);
    const struck = rec.struck.length;
    expect(struck).toBeGreaterThan(0);
    expect(new Set(rec.struck).size).toBe(struck);
    expect(draws(s0, state.rngState, 1000)).toBe(9 + 1 + plotDraws(idx) * struck);
    expect([rec.event, rec.left, rec.id]).toEqual([idx, 2, 7]);
    const end = state.map.tiles[rec.at];
    const dist = hexDistance(state.map, start.col, start.row, end.col, end.row);
    expect(dist).toBeGreaterThanOrEqual(1);
    expect(dist).toBeLessThanOrEqual(8);
    expect(end.col).toBeLessThanOrEqual(start.col);
    // a hurricane on the one OCEAN tile of a grassland board steps onto the
    // land at 2 points a step: four steps, then a fifth draw it cannot pay
    const land = board(null, 'GRASSLAND');
    const sea = tileAtCoords(land.map, 8, 8);
    sea.terrain = 'OCEAN';
    sea.elevation = 'FLAT';
    const cat4 = EVI('HURRICANE_CAT_4');
    const hur: StormRecord = { id: 3, event: cat4, at: sea.index, left: 2, struck: [] };
    land.storms = [hur];
    const s1 = land.rngState;
    stormWalk(land, hur, 100, false);
    expect(hur.at).not.toBe(sea.index);
    // the sea plot takes no yield draw
    const yieldRows = STORM_ROWS[cat4].yields.length;
    expect(draws(s1, land.rngState, 1000)).toBe(5 + 1 + plotDraws(cat4) * hur.struck.length - (hur.struck.includes(sea.index) ? yieldRows : 0));
    // another storm's centre on every neighbour blocks nothing
    const snow = board(null, 'SNOW');
    const c = tileAtCoords(snow.map, 8, 8);
    const walker: StormRecord = { id: 1, event: idx, at: c.index, left: 2, struck: [] };
    snow.storms = [walker];
    for (let d = 0; d < 6; d++) snow.storms.push({ id: 2 + d, event: idx, at: neighborTile(snow.map, c, d)!.index, left: 1, struck: [] });
    const s2 = snow.rngState;
    stormWalk(snow, walker, 100, false);
    expect(walker.at).not.toBe(c.index);
    expect(draws(s2, snow.rngState, 1000)).toBe(9 + 1 + plotDraws(idx) * walker.struck.length);
  });

  it('a strike takes each plot once a storm; its last turn halves every row', () => {
    const state = board(null, 'SNOW');
    const idx = EVI('BLIZZARD_SIGNIFICANT');
    const c = tileAtCoords(state.map, 8, 8);
    const rec: StormRecord = { id: 1, event: idx, at: c.index, left: 2, struck: [] };
    const s0 = state.rngState;
    stormStrike(state, rec, 100, false);
    expect(rec.struck).toHaveLength(7);
    expect(draws(s0, state.rngState, 200)).toBe(7 * plotDraws(idx));
    // a second strike on the same plots draws nothing
    const s1 = state.rngState;
    stormStrike(state, rec, 100, false);
    expect(state.rngState).toBe(s1);
    // the last turn halves every damage row's chance: a certain pillage row
    // lands half the time
    expect(STORM_LAST_TURN_PCT).toBe(50);
    const g = board(null);
    const t = tileAtCoords(g.map, 5, 5);
    setTileOwner(t, 0);
    const e = EVI('BLIZZARD_CRIPPLING');
    const dest = ROW('BLIZZARD_CRIPPLING', 'IMPROVEMENT_DESTROYED')!.pct;
    let hit = 0;
    for (let i = 0; i < 2000; i++) {
      t.improvement = 'FARM';
      t.pillaged = false;
      stormPlot(g, t, e, STORM_LAST_TURN_PCT, false);
      if (t.pillaged || !t.improvement) hit++;
    }
    // destroyed at half its row, else pillaged at half its certain row
    const pDest = Math.floor(dest / 2) / 100;
    expect(Math.abs(hit / 2000 - (pDest + (1 - pDest) * 0.5))).toBeLessThan(0.04);
    // ...and the fertility rows too, each truncated to a whole percent
    const cat5 = EVI('HURRICANE_CAT_5');
    const food = STORM_ROWS[cat5].yields[0].pct;
    const draw = (pct: number) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const u = tileAtCoords(g.map, 9, 9);
        u.fertility = 0;
        stormPlot(g, u, cat5, pct, false);
        if (u.fertility > 0) n++;
      }
      return n / 3000;
    };
    expect(Math.abs(draw(100) - food / 100)).toBeLessThan(0.035);
    expect(Math.abs(draw(STORM_LAST_TURN_PCT) - Math.floor(food / 2) / 100)).toBeLessThan(0.035);
  });

  it('a storm starts by one uniform draw over the plots its count rule takes (0x288250)', () => {
    // a Tornado Family (Hexes 1) finds no plot; an Outbreak (Hexes 3) any plot
    // of its terrain, a live centre no bar and no weight
    const state = board(null);
    const fam = STORM_EVENTS.find((e) => e.id === 'TORNADO_FAMILY')!;
    const out = STORM_EVENTS.find((e) => e.id === 'TORNADO_OUTBREAK')!;
    expect(stormStart(state, fam)).toBeUndefined();
    const c = tileAtCoords(state.map, 8, 8);
    const n = tileAtCoords(state.map, 9, 8);
    state.storms = [{ id: 1, event: STORM_EVENTS.indexOf(out), at: c.index, left: 2, struck: [] }];
    const hits = new Map<number, number>();
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const t = stormStart(state, out)!;
      hits.set(t.index, (hits.get(t.index) ?? 0) + 1);
    }
    expect(hits.get(c.index) ?? 0).toBeGreaterThan(0);
    expect(Math.abs((hits.get(n.index) ?? 0) / (hits.get(c.index) ?? 1) - 1)).toBeLessThan(0.4);
    // a Category 5 hurricane (Hexes 19) asks its plot and one of its six
    // neighbours, all six on the map: none on Grassland, every plot off the
    // edge rows on an ocean
    const cat5 = STORM_EVENTS.find((e) => e.id === 'HURRICANE_CAT_5')!;
    expect(stormStart(state, cat5)).toBeUndefined();
    const sea = makeState(makeMap(16, 16, 'OCEAN'));
    const rows = new Set<number>();
    for (let i = 0; i < 400; i++) rows.add(stormStart(sea, cat5)!.row);
    expect(rows.has(0) || rows.has(15)).toBe(false);
    expect(rows.has(1) && rows.has(14)).toBe(true);
  }, 30_000); // 40,000 whole-map draws: past the default 5 s on a loaded box

  it('the footprint walks the centre then DirectionTypes (0x28d6b0)', () => {
    const map = makeMap(16, 16);
    const centre = tileAtCoords(map, 8, 8);
    const ring = DIRECTION_TYPES.map((d) => neighborTile(map, centre, d)!);
    expect(stormFootprint(map, centre, 1)).toEqual([centre]);
    expect(stormFootprint(map, centre, 3)).toEqual([centre, ring[0], ring[5]]);
    expect(stormFootprint(map, centre, 7)).toEqual([centre, ...ring]);
    // 19: the centre, then every offset within two, dq outer — the centre again
    const big = stormFootprint(map, centre, 19);
    expect(big).toHaveLength(20);
    expect(big[0]).toBe(centre);
    expect(big.filter((t) => t === centre)).toHaveLength(2);
    expect(new Set(big.map((t) => t.index)).size).toBe(19);
    // an off-map slot is simply absent
    expect(stormFootprint(map, tileAtCoords(map, 0, 0), 19).length).toBeLessThan(19);
  });

  it('silt on a natural wonder pays on top of its own row (runs/h1_duelw1111 plot 184)', () => {
    const state = board(null);
    const t = tileAtCoords(state.map, 5, 5);
    t.feature = 'EYE_OF_THE_SAHARA';
    t.terrain = 'DESERT';
    t.elevation = 'HILLS';
    const before = tileYields(makeYieldCtx(state, 0), t);
    t.fertility = 2;
    t.fertilityProd = 1;
    expect(tileYields(makeYieldCtx(state, 0), t)).toEqual({ ...before, food: before.food + 2, production: before.production + 1 });
  });

  it('a struck plot draws once per damage row and yield row, then once per unit a landed unit row strikes', () => {
    const state = board(null);
    const tile = tileAtCoords(state.map, 5, 5);
    const s0 = state.rngState;
    stormPlot(state, tile, EVI('TORNADO_FAMILY'), 100, false);
    expect(draws(s0, state.rngState)).toBe(4);
    // CAT_5: eight damage rows (UNIT_DAMAGE_LAND 100 always lands: the
    // warrior's own roll straight after it, 0x3366a0), two yield rows
    spawnUnit(state, 'WARRIOR', tile.index, 0);
    const s1 = state.rngState;
    stormPlot(state, tile, EVI('HURRICANE_CAT_5'), 100, false);
    expect(draws(s1, state.rngState, 20)).toBe(8 + 1 + 2);
    // water takes no yield draw
    const sea = board(null, 'COAST');
    const w = tileAtCoords(sea.map, 5, 5);
    const s2 = sea.rngState;
    stormPlot(sea, w, EVI('HURRICANE_CAT_4'), 100, false);
    expect(draws(s2, sea.rngState)).toBe(5);
  });

  it('darkens a district BUILDINGS on its own row, not the district one', () => {
    const state = board(null);
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const dt = tileAtCoords(state.map, 6, 5);
    setTileOwner(dt, 0, city.id);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    city.buildings.push('LIBRARY', 'MONUMENT');
    // BLIZZARD_CRIPPLING: DESTROYED, PILLAGED, DISTRICT 50, BUILDING 100 — a
    // stream whose district draw misses
    const e = EVI('BLIZZARD_CRIPPLING');
    state.rngState = streamWhere(3, (v) => v >= 50);
    stormPlot(state, dt, e, 100, false);
    expect(dt.districtPillaged).toBeFalsy();
    expect(city.pillagedBuildings ?? []).toContain('LIBRARY');
    expect(city.pillagedBuildings ?? []).not.toContain('MONUMENT');
    // ...and a storm ON THE CENTRE darkens nothing: a city CENTRE is never
    // pillaged
    const centre = state.map.tiles[city.centerIndex];
    expect(centre.district).toBe('CITY_CENTER');
    const before = [...(city.pillagedBuildings ?? [])];
    stormPlot(state, centre, e, 100, false);
    expect(city.pillagedBuildings ?? []).toEqual(before);
  });

  it('BUILDING_PILLAGED takes the top of an unpillaged district\'s chain; DISTRICT_PILLAGED takes them all; a city-state\'s alike', () => {
    const e = EVI('BLIZZARD_CRIPPLING');
    const bldgOnly = streamWhere(3, (v) => v >= 50);
    const both = streamWhere(3, (v) => v < 50);
    const state = board(null);
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const dt = tileAtCoords(state.map, 6, 5);
    setTileOwner(dt, 0, city.id);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    city.buildings.push('LIBRARY', 'UNIVERSITY');
    state.rngState = bldgOnly;
    stormPlot(state, dt, e, 100, false);
    expect(city.pillagedBuildings).toEqual(['UNIVERSITY']);
    // the next hit takes the next standing one
    state.rngState = bldgOnly;
    stormPlot(state, dt, e, 100, false);
    expect(city.pillagedBuildings).toEqual(['UNIVERSITY', 'LIBRARY']);
    // a pillaged district takes every building with it, and a building hit on
    // it takes nothing more
    city.pillagedBuildings = [];
    state.rngState = both;
    stormPlot(state, dt, e, 100, false);
    expect(dt.districtPillaged).toBe(true);
    expect([...(city.pillagedBuildings ?? [])].sort()).toEqual(['LIBRARY', 'UNIVERSITY']);
    // a city-state's district: the top alone, and its repair waits
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'scientific', tileAtCoords(state.map, 12, 12).index);
    const ct = tileAtCoords(state.map, 13, 12);
    setTileOwner(ct, cs.seat);
    ct.district = 'CAMPUS';
    ct.districtComplete = true;
    cs.districts = [{ type: 'CAMPUS', tileIndex: ct.index }];
    cs.buildings = [...(cs.buildings ?? []), 'LIBRARY', 'UNIVERSITY'];
    state.rngState = bldgOnly;
    stormPlot(state, ct, e, 100, false);
    expect(cs.pillagedBuildings).toEqual(['UNIVERSITY']);
    expect(cs.repairWait).toBe(true);
    // a Dar-e Mehr on top of the chain: nothing falls (it cannot be pillaged),
    // the Temple under it included
    const hs = tileAtCoords(state.map, 4, 5);
    setTileOwner(hs, 0, city.id);
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    city.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
    city.buildings.push('TEMPLE', 'DAR_E_MEHR');
    city.pillagedBuildings = [];
    state.rngState = bldgOnly;
    stormPlot(state, hs, e, 100, false);
    expect(city.pillagedBuildings).toEqual([]);
    city.buildings = city.buildings.filter((b) => b !== 'DAR_E_MEHR');
    state.rngState = bldgOnly;
    stormPlot(state, hs, e, 100, false);
    expect(city.pillagedBuildings).toEqual(['TEMPLE']);
  });

  it('a warmed world grows each row by its own ChanceIncreasePerDegree', () => {
    const std = STANDARD_MAP_AREA;
    const base = stormWeights(0, std);
    expect(base).toEqual(STORM_EVENTS.map((e) => Math.floor(e.weight * 10)));
    const warm = stormWeights(2, std);
    for (const f of STORM_FAMILIES) {
      const [a, b] = familyPair(f);
      expect(warm[a]).toBe(base[a]);
      expect(warm[b]).toBe(base[b] * 2);
    }
    // ...and the draw reads exactly these rows, in the live table's order
    const rows = eventRows(2, std);
    expect(rows.filter((r) => r.family === 'storm').map((r) => r.weight)).toEqual(warm);
    expect(rows.map((r) => r.family)).toEqual([
      'eruption', 'eruption', 'flood', 'flood', 'flood',
      'eruption', 'eruption', 'eruption', 'eruption', 'eruption', 'eruption',
      ...STORM_EVENTS.map(() => 'storm'), 'accident', 'accident', 'accident', 'drought', 'drought',
      'meteor', 'fire', 'fire',
    ]);
  });
});

describe('the storm\'s unit damage and the eight roster rows', () => {
  it('is eight rows: Hojo\'s hurricanes and Russia\'s blizzards, a waiver and a doubling each', () => {
    expect(STORM_UNIT_ROWS).toHaveLength(8);
    expect(STORM_UNIT_ROWS.filter((r) => r.leader === 'HOJO').map((r) => r.event + ':' + r.effect).sort()).toEqual([
      'HURRICANE_CAT_4:doubleOpposing', 'HURRICANE_CAT_4:noDamage', 'HURRICANE_CAT_5:doubleOpposing', 'HURRICANE_CAT_5:noDamage',
    ]);
    expect(STORM_UNIT_ROWS.filter((r) => r.civ === 'RUSSIA').every((r) => r.event.startsWith('BLIZZARD'))).toBe(true);
    expect(STORM_UNIT_ROWS.filter((r) => r.effect === 'doubleOpposing').every((r) => r.amount === 100)).toBe(true);
  });

  it('a CAT_5 hurricane hits a hull for 60-80 and a land unit for 40-60; CAT_4 spares land', () => {
    const state = board(null, 'COAST');
    const sea = tileAtCoords(state.map, 5, 5);
    const naval = bandOf(state, sea, 'HURRICANE_CAT_5', 'GALLEY', 1);
    expect(naval.size).toBeGreaterThan(3);
    for (const d of naval) expect(d >= 60 && d <= 80).toBe(true);

    const land = board(null);
    const ground = tileAtCoords(land.map, 5, 5);
    const foot = bandOf(land, ground, 'HURRICANE_CAT_5', 'WARRIOR', 1);
    expect(foot.size).toBeGreaterThan(3);
    for (const d of foot) expect(d >= 40 && d <= 60).toBe(true);
    expect(bandOf(land, ground, 'HURRICANE_CAT_4', 'WARRIOR', 1)).toEqual(new Set([0]));
  });

  it('the milder severities damage no unit at all', () => {
    const state = board(null, 'SNOW');
    const tile = tileAtCoords(state.map, 5, 5);
    expect(bandOf(state, tile, 'BLIZZARD_SIGNIFICANT', 'WARRIOR', 1, 200)).toEqual(new Set([0]));
    expect(bandOf(state, tile, 'TORNADO_FAMILY', 'WARRIOR', 1, 200)).toEqual(new Set([0]));
    expect(bandOf(state, tile, 'DUST_STORM_GRADIENT', 'WARRIOR', 1, 200)).toEqual(new Set([0]));
    const band = bandOf(state, tile, 'BLIZZARD_CRIPPLING', 'WARRIOR', 1);
    for (const d of band) expect(d >= 40 && d <= 60).toBe(true);
  });

  it('PREVENTION: the carrier\'s own units take nothing from its event, and only from it', () => {
    const japan = board('HOJO');
    const t = tileAtCoords(japan.map, 5, 5);
    expect(bandOf(japan, t, 'HURRICANE_CAT_5', 'WARRIOR', 0)).toEqual(new Set([0]));
    expect(bandOf(japan, t, 'HURRICANE_CAT_4', 'WARRIOR', 0)).toEqual(new Set([0]));
    const bliz = bandOf(japan, t, 'BLIZZARD_CRIPPLING', 'WARRIOR', 0);
    for (const d of bliz) expect(d >= 40 && d <= 60).toBe(true);
    const russia = board('PETER_GREAT', 'SNOW');
    const s = tileAtCoords(russia.map, 5, 5);
    expect(bandOf(russia, s, 'BLIZZARD_CRIPPLING', 'WARRIOR', 0)).toEqual(new Set([0]));
    expect(bandOf(russia, s, 'BLIZZARD_CRIPPLING', 'SETTLER', 0)).toEqual(new Set([0]));
    const hur = bandOf(russia, s, 'HURRICANE_CAT_5', 'WARRIOR', 0);
    for (const d of hur) expect(d >= 40 && d <= 60).toBe(true);
  });

  it('DOUBLE: an enemy on the carrier\'s ground takes +100%; off it, or at peace, the plain band', () => {
    const japan = board('HOJO');
    const owned = tileAtCoords(japan.map, 5, 5);
    setTileOwner(owned, 0);
    const doubled = bandOf(japan, owned, 'HURRICANE_CAT_5', 'WARRIOR', 1);
    for (const d of doubled) expect(d >= 80).toBe(true);
    expect(doubled.has(100)).toBe(true);
    const unowned = tileAtCoords(japan.map, 9, 9);
    for (const d of bandOf(japan, unowned, 'HURRICANE_CAT_5', 'WARRIOR', 1)) expect(d >= 40 && d <= 60).toBe(true);
    setWar(japan, 0, 1, false);
    for (const d of bandOf(japan, owned, 'HURRICANE_CAT_5', 'WARRIOR', 1)) expect(d >= 40 && d <= 60).toBe(true);
    const plain = board(null);
    const ground = tileAtCoords(plain.map, 5, 5);
    setTileOwner(ground, 0);
    for (const d of bandOf(plain, ground, 'HURRICANE_CAT_5', 'WARRIOR', 1)) expect(d >= 40 && d <= 60).toBe(true);
  });

  it('a hurricane on a coastal lowland pillages every improvement it touches', () => {
    const state = board(null);
    const low = tileAtCoords(state.map, 5, 5);
    low.lowland = 1;
    low.improvement = 'FARM';
    setTileOwner(low, 0);
    let pillaged = 0;
    for (let i = 0; i < 300; i++) {
      low.improvement = 'FARM';
      low.pillaged = false;
      stormPlot(state, low, EVI('HURRICANE_CAT_4'), 100, false);
      if (low.pillaged || low.improvement === null) pillaged++;
    }
    expect(pillaged).toBe(300);
  });
});
