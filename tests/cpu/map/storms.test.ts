import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { nextRandom } from '../../../cpu/core/rand';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { disasterPhase, stormWeights, eventRows, stormFootprint, stormTile, stormWalk, stormStart } from '../../../cpu/core/disasters';
import { hexDistance } from '../../../world/hex';
import { STORM_DISC, STORM_EVENTS, STORM_FAMILIES, STORM_UNIT_ROWS, stormFamilyAt, PREVAILING_WINDS, WIND_BAND_LO, WIND_BAND_HI, windLatitude, windWeights, STORM_MOVEMENT, STORM_LAST_TURN_PCT, RANDOM_EVENT_START_TURN, STANDARD_MAP_AREA } from '../../../cpu/data/disasters';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { tileYields } from '../../../cpu/core/yields';
import type { GameState, StormRecord, Tile } from '../../../cpu/core/types';
import type { StormEvent } from '../../../cpu/data/disasters';
import { placeCityStateAt } from '../../../cpu/core/cityStates';

/**
 * THE EIGHT NAMED STORMS — the TS half; the GPU twin is
 * tests/gpu/storms_test.py.
 *
 * CIV6 (`Expansion2_RandomEvents.xml`): a storm's FAMILY is the terrain it
 * starts on, each family has two severities, each severity its own footprint,
 * frequency, damage columns and unit band; a storm PERSISTS three turns. The
 * roster's eight rows on them: Divine Wind (Hojo) waives hurricane damage to
 * Japan's units and doubles it for enemies on Japanese ground; Mother Russia
 * the same over blizzards.
 */
const lcg = (s: number) => (Math.imul(1103515245, s) + 12345) >>> 0; // the generator's step, on both engines
const seatRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);
const EV = (id: string) => STORM_EVENTS[STORM_EVENTS.findIndex((e) => e.id === id)];
/** a family's two rows, in table order */
const familyPair = (f: string) => STORM_EVENTS.flatMap((e, i) => (e.family === f ? [i] : []));

function draws(s0: number, s1: number, most = 12): number {
  let s = s0 >>> 0;
  for (let k = 0; k <= most; k++, s = lcg(s)) if (s === (s1 >>> 0)) return k;
  throw new Error(`the stream moved by a non-draw amount: ${s0} -> ${s1}`);
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

/** run `stormTile` on `tile` with a fresh unit of `seat` each time and return
 *  the set of damages seen (100 = died) */
function bandOf(state: GameState, tile: Tile, ev: string, type: string, seat: number, n = 400): Set<number> {
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const u = spawnUnit(state, type, tile.index, seat)!;
    expect(u.tileIndex).toBe(tile.index);
    stormTile(state, tile, EV(ev), false);
    const alive = state.units.find((x) => x.id === u.id);
    seen.add(alive ? 100 - alive.hp : 100);
    state.units = state.units.filter((x) => x.id !== u.id);
  }
  return seen;
}

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
    expect(EV('HURRICANE_CAT_5').navalLo).toBe(60);
    expect(EV('HURRICANE_CAT_5').navalHi).toBe(80);
    expect(EV('HURRICANE_CAT_4').landP).toBe(0);
    expect(EV('HURRICANE_CAT_4').navalP).toBe(0.6);
    for (const id of ['BLIZZARD_SIGNIFICANT', 'DUST_STORM_GRADIENT', 'TORNADO_FAMILY']) {
      expect(EV(id).landP + EV(id).navalP + EV(id).civKill + EV(id).pop).toBe(0);
    }
    // fertility: the yields table's rows — tornadoes have none
    expect(STORM_EVENTS.filter((e) => e.fertFood + e.fertProd > 0).map((e) => e.family)).not.toContain('TORNADO');
    expect(EV('HURRICANE_CAT_5').fertFood).toBe(0.45);
  });

  it('the prevailing winds are the install\'s 22 rows, banded by signed latitude', () => {
    // CIV6 (`PrevailingWinds`): 22 weighted rows over eight bands, six hex headings
    expect(PREVAILING_WINDS).toHaveLength(8);
    expect(WIND_BAND_LO).toEqual([60, 30, 5, 0, -5, -30, -60, -90]);
    expect(PREVAILING_WINDS.flat().filter((w) => w > 0)).toHaveLength(22);
    // the mid-latitudes blow EAST (NE 2 E 2 SE 1), the tropics and the poles WEST
    expect(PREVAILING_WINDS[1]).toEqual([2, 2, 0, 0, 0, 1]);
    expect(PREVAILING_WINDS[2]).toEqual([0, 0, 2, 2, 1, 0]);
    expect(PREVAILING_WINDS[6]).toEqual([2, 1, 0, 0, 0, 2]);
    expect(WIND_BAND_HI).toEqual([90, 60, 30, 5, 0, -5, -30, -60]);
    // the DLL's latitude, 90 - 180 x (100 row // H) // 100 in the engine's rows
    expect([0, 17, 33, 50, 51, 99].map((r) => windLatitude(r, 100))).toEqual([90, 60, 31, 0, -1, -88]);
    expect(windWeights(0, 100)).toEqual(PREVAILING_WINDS[0]);
    // both ends inclusive: lat 60 pools the polar and the mid-latitude band,
    // the equator its two
    expect(windWeights(17, 100)).toEqual([2, 2, 1, 2, 2, 1]);
    expect(windWeights(50, 100)).toEqual([0, 0, 1, 2, 1, 0]);
    expect(windWeights(51, 100)).toEqual(PREVAILING_WINDS[4]);
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

  it('the disaster phase spawns only the board\'s family, and it persists three turns', () => {
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
    // the storm was applied once already (its spawn turn) and counts down;
    // its record leaves the list when its turns run out
    const ev0 = rec.event;
    expect(rec.left).toBe(2);
    expect(rec.struck.length).toBeGreaterThan(0);
    expect(rec.struck.length).toBeLessThanOrEqual(STORM_EVENTS[ev0].hexes);
    disasterPhase(state);
    expect(state.storms!.find((s) => s.id === rec.id)?.left).toBe(1);
    expect(rec.event).toBe(ev0);
    disasterPhase(state);
    expect(state.storms!.some((s) => s.id === rec.id)).toBe(false);
    expect(state.eventLog.every((e) => !e.startsWith('Storm') || e.startsWith('Storm: BLIZZARD'))).toBe(true);
  });

  it('the walk spends 8 points, 1 a step on the storm\'s own terrain and 2 elsewhere, striking at every step', () => {
    // on an all-snow board a blizzard takes eight 1-point steps, then draws a
    // ninth it cannot pay. Row 8 of 16 is the equator (NW 1 W 2 SW 1): every
    // step heads west-ish. Every step strikes the footprint at the new
    // centre, each plot once: ten draws a newly struck plot.
    expect(STORM_MOVEMENT).toBe(8);
    const state = board(null, 'SNOW');
    const idx = STORM_EVENTS.findIndex((e) => e.id === 'BLIZZARD_SIGNIFICANT');
    const start = tileAtCoords(state.map, 8, 8);
    const rec: StormRecord = { id: 7, event: idx, at: start.index, left: 2, struck: [] };
    state.storms = [rec];
    expect(windLatitude(8, 16)).toBe(0);
    const s0 = state.rngState;
    stormWalk(state, rec, STORM_EVENTS[idx], false, 100);
    const struck = rec.struck.length;
    expect(struck).toBeGreaterThan(0);
    expect(new Set(rec.struck).size).toBe(struck);
    expect(draws(s0, state.rngState, 1000)).toBe(9 + 10 * struck);
    expect([rec.event, rec.left, rec.id]).toEqual([idx, 2, 7]);
    const end = state.map.tiles[rec.at];
    const dist = hexDistance(state.map, start.col, start.row, end.col, end.row);
    expect(dist).toBeGreaterThanOrEqual(1);
    expect(dist).toBeLessThanOrEqual(8);
    expect(end.col).toBeLessThanOrEqual(start.col);
    expect(state.storms).toHaveLength(1);
    // a hurricane on the one OCEAN tile of a grassland board steps onto the
    // land at 2 points a step: four steps, then a fifth draw it cannot pay
    const land = board(null, 'GRASSLAND');
    const sea = tileAtCoords(land.map, 8, 8);
    sea.terrain = 'OCEAN';
    sea.elevation = 'FLAT';
    const cat4 = STORM_EVENTS.findIndex((e) => e.id === 'HURRICANE_CAT_4');
    const hur: StormRecord = { id: 3, event: cat4, at: sea.index, left: 2, struck: [] };
    land.storms = [hur];
    const s1 = land.rngState;
    stormWalk(land, hur, STORM_EVENTS[cat4], false, 100);
    expect(hur.at).not.toBe(sea.index);
    expect(draws(s1, land.rngState, 1000)).toBe(5 + 10 * hur.struck.length);
    expect(hur.event).toBe(cat4);
    // another storm's centre on every neighbour blocks nothing: the walk
    // steps onto them as onto any plot (Game_Climate's walk does not block)
    const snow = board(null, 'SNOW');
    const c = tileAtCoords(snow.map, 8, 8);
    const walker: StormRecord = { id: 1, event: idx, at: c.index, left: 2, struck: [] };
    snow.storms = [walker];
    for (let d = 0; d < 6; d++) {
      const n = tileAtCoords(snow.map, c.col + [1, 0, -1, -1, -1, 0][d], c.row + [0, -1, -1, 0, 1, 1][d]);
      snow.storms.push({ id: 2 + d, event: idx, at: n.index, left: 1, struck: [] });
    }
    const s2 = snow.rngState;
    stormWalk(snow, walker, STORM_EVENTS[idx], false, 100);
    expect(walker.at).not.toBe(c.index);
    expect(draws(s2, snow.rngState, 1000)).toBe(9 + 10 * walker.struck.length);
  });

  it('a storm strikes its strike plot on entry and every step after, each plot once, its last turn at half', () => {
    // the entry turn: the footprint at the strike plot, ten draws a plot
    const state = board(null, 'SNOW');
    const idx = STORM_EVENTS.findIndex((e) => e.id === 'BLIZZARD_SIGNIFICANT');
    const c = tileAtCoords(state.map, 8, 8);
    const rec: StormRecord = { id: 1, event: idx, at: c.index, left: 3, struck: [] };
    state.storms = [rec];
    state.turn = 1;   // no event draw before the start turn
    const s0 = state.rngState;
    disasterPhase(state);
    const first = rec.struck.length;
    expect(first).toBe(STORM_EVENTS[idx].hexes);
    expect(draws(s0, state.rngState, 200)).toBe(10 * first);
    // a plot struck once is never struck again by the same storm
    disasterPhase(state);
    disasterPhase(state);
    expect(state.storms).toHaveLength(0);
    expect(new Set(rec.struck).size).toBe(rec.struck.length);
    // the last turn halves every damage row's chance: a certain pillage row
    // lands half the time
    expect(STORM_LAST_TURN_PCT).toBe(50);
    const g = board(null);
    const t = tileAtCoords(g.map, 5, 5);
    setTileOwner(t, 0);
    const ev = STORM_EVENTS.find((e) => e.impPill >= 1)!;
    let hit = 0;
    for (let i = 0; i < 2000; i++) {
      t.improvement = 'FARM';
      t.pillaged = false;
      stormTile(g, t, ev, false, STORM_LAST_TURN_PCT);
      if (t.pillaged || !t.improvement) hit++;
    }
    // pillaged at half its certain row, or destroyed at half its own
    const half = (p: number) => Math.floor(Math.round(p * 100) / 2) / 100;
    expect(Math.abs(hit / 2000 - (1 - 0.5 * (1 - half(ev.impDest))))).toBeLessThan(0.04);
    // ...and the fertility rows too, each truncated to a whole percent
    const fe = STORM_EVENTS.reduce((a, e) => (e.fertFood > a.fertFood ? e : a));
    expect(fe.fertFood).toBeGreaterThan(0.2);
    const draw = (pct: number) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const u = tileAtCoords(g.map, 9, 9);
        u.fertility = 0;
        stormTile(g, u, fe, false, pct);
        if (u.fertility > 0) n++;
      }
      return n / 3000;
    };
    expect(Math.abs(draw(100) - fe.fertFood)).toBeLessThan(0.035);
    expect(Math.abs(draw(STORM_LAST_TURN_PCT) - half(fe.fertFood))).toBeLessThan(0.035);
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

  it('the canonical disc is centre, ring 1, ring 2, each ring by tile index', () => {
    expect(STORM_DISC).toHaveLength(19);
    expect(STORM_DISC[0]).toEqual([0, 0]);
    const ring = ([q, r]: readonly [number, number]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    expect(STORM_DISC.slice(1, 7).every((o) => ring(o) === 1)).toBe(true);
    expect(STORM_DISC.slice(7).every((o) => ring(o) === 2)).toBe(true);
    const map = makeMap(16, 16);
    const centre = tileAtCoords(map, 8, 8);
    for (const n of [1, 3, 7, 19]) {
      const fp = stormFootprint(map, centre, n);
      expect(fp).toHaveLength(n);
      expect(fp[0]).toBe(centre);
      // each ring in ascending tile index
      const idx = fp.map((t) => t.index);
      expect(idx.slice(1, 7)).toEqual([...idx.slice(1, 7)].sort((a, b) => a - b));
      expect(idx.slice(7)).toEqual([...idx.slice(7)].sort((a, b) => a - b));
    }
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
  it('a storm tile draws ten times whatever stands there, then once per unit its share strikes', () => {
    const state = board(null);
    const tile = tileAtCoords(state.map, 5, 5);
    for (const [ev, unit] of [['TORNADO_FAMILY', null], ['HURRICANE_CAT_5', 'WARRIOR']] as const) {
      if (unit) spawnUnit(state, unit, tile.index, 0);
      const s0 = state.rngState;
      stormTile(state, tile, EV(ev), false);
      // improvement, destroy, district, BUILDING, population, civilian, land,
      // naval, and the two fertility yields; then the struck unit's own
      // damage draw (GameCore_XP2_Release.dll 0x3366a0) when the land share hit
      const probe = { rngState: s0 } as GameState;
      for (let i = 0; i < 6; i++) nextRandom(probe);
      const landHit = nextRandom(probe) < EV(ev).landP;
      expect(draws(s0, state.rngState)).toBe(10 + (unit && landHit ? 1 : 0));
    }
  });

  it('darkens a district BUILDINGS on its own column, not the district one', () => {
    // CIV6 (RandomEvent_Damages): BUILDING_PILLAGED carries its own
    // Percentage — a flood pillages the district at 50 and its buildings at
    // 100, and the MODERATE row has no district column at all — so a building
    // goes dark whether or not the district around it does.
    const state = board(null);
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const dt = tileAtCoords(state.map, 6, 5);
    setTileOwner(dt, 0, city.id);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    city.buildings.push('LIBRARY', 'MONUMENT');

    // an event whose building column is CERTAIN darkens the district's own
    // rows and leaves the City Center's alone
    const ev = STORM_EVENTS.find((e) => e.bldgPill >= 1)!;
    expect(ev).toBeTruthy();
    stormTile(state, dt, ev, false);
    expect(city.pillagedBuildings ?? []).toContain('LIBRARY');
    expect(city.pillagedBuildings ?? []).not.toContain('MONUMENT');

    // ...and a storm ON THE CENTRE darkens nothing: a city CENTRE is never
    // pillaged, which is `pillageDistrict`'s own rule and the GPU's by
    // construction — its district plane never encodes a centre.
    const centre = state.map.tiles[city.centerIndex];
    expect(centre.district).toBe('CITY_CENTER');
    const before = [...(city.pillagedBuildings ?? [])];
    stormTile(state, centre, ev, false);
    expect(city.pillagedBuildings ?? []).toEqual(before);
  });

  it('BUILDING_PILLAGED takes the top of an unpillaged district\'s chain; DISTRICT_PILLAGED takes them all; a city-state\'s alike', () => {
    const base = STORM_EVENTS.find((e) => e.bldgPill >= 1)!;
    const bldgOnly: StormEvent = { ...base, distPill: 0, lowlandDist: 0 };
    const both: StormEvent = { ...base, distPill: 1, lowlandDist: 1 };
    const state = board(null);
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
    const dt = tileAtCoords(state.map, 6, 5);
    setTileOwner(dt, 0, city.id);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    city.buildings.push('LIBRARY', 'UNIVERSITY');
    stormTile(state, dt, bldgOnly, false);
    expect(city.pillagedBuildings).toEqual(['UNIVERSITY']);
    // the next hit takes the next standing one
    stormTile(state, dt, bldgOnly, false);
    expect(city.pillagedBuildings).toEqual(['UNIVERSITY', 'LIBRARY']);
    // a pillaged district takes every building with it, and a building hit on
    // it takes nothing more
    city.pillagedBuildings = [];
    stormTile(state, dt, both, false);
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
    stormTile(state, ct, bldgOnly, false);
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
    stormTile(state, hs, bldgOnly, false);
    expect(city.pillagedBuildings).toEqual([]);
    city.buildings = city.buildings.filter((b) => b !== 'DAR_E_MEHR');
    stormTile(state, hs, bldgOnly, false);
    expect(city.pillagedBuildings).toEqual(['TEMPLE']);
  });

  it('a warmed world grows each row by its own ChanceIncreasePerDegree', () => {
    // CIV6 (`RandomEvents.ChanceIncreasePerDegree`): 0 on each family's milder
    // row, 50 on its worse — w + trunc(50 x w x 2) // 100 at two degrees, the
    // weights in tenths on a Standard map
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
    // a hull cannot yet sail the OCEAN (Cartography); the band is the row's, not the tile's
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
    // a crippling blizzard's land band is the common 40-60
    const band = bandOf(state, tile, 'BLIZZARD_CRIPPLING', 'WARRIOR', 1);
    for (const d of band) expect(d >= 40 && d <= 60).toBe(true);
  });

  it('PREVENTION: the carrier\'s own units take nothing from its event, and only from it', () => {
    const japan = board('HOJO');
    const t = tileAtCoords(japan.map, 5, 5);
    expect(bandOf(japan, t, 'HURRICANE_CAT_5', 'WARRIOR', 0)).toEqual(new Set([0]));
    expect(bandOf(japan, t, 'HURRICANE_CAT_4', 'WARRIOR', 0)).toEqual(new Set([0]));
    // a blizzard is not Hojo's row
    const bliz = bandOf(japan, t, 'BLIZZARD_CRIPPLING', 'WARRIOR', 0);
    for (const d of bliz) expect(d >= 40 && d <= 60).toBe(true);
    // Russia's civilization row, over the blizzards
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
    // 80-120 on a 100 HP unit: dead, or 80+ down
    for (const d of doubled) expect(d >= 80).toBe(true);
    expect(doubled.has(100)).toBe(true);
    const unowned = tileAtCoords(japan.map, 9, 9);
    for (const d of bandOf(japan, unowned, 'HURRICANE_CAT_5', 'WARRIOR', 1)) expect(d >= 40 && d <= 60).toBe(true);
    // the same ground, no war: the plain band
    setWar(japan, 0, 1, false);
    for (const d of bandOf(japan, owned, 'HURRICANE_CAT_5', 'WARRIOR', 1)) expect(d >= 40 && d <= 60).toBe(true);
    // a non-carrier's ground doubles nothing
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
      stormTile(state, low, EV('HURRICANE_CAT_4'), false);
      if (low.pillaged || low.improvement === null) pillaged++;
    }
    expect(pillaged).toBe(300);
  });
});
