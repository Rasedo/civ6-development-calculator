import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { disasterPhase, stormWeights, eventRows, stormFootprint, stormTile, stormWalk } from '../../../cpu/core/disasters';
import { hexDistance } from '../../../world/hex';
import { STORM_DISC, STORM_EVENTS, STORM_FAMILIES, STORM_UNIT_ROWS, stormFamilyAt, PREVAILING_WINDS, WIND_BAND_LO, windBand, RANDOM_EVENT_START_TURN } from '../../../cpu/data/disasters';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { tileYields } from '../../../cpu/core/yields';
import type { GameState, Tile } from '../../../cpu/core/types';

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
const STEP = 0x6d2b79f5; // mulberry32's per-draw increment, on both engines
const seatRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);
const EV = (id: string) => STORM_EVENTS[STORM_EVENTS.findIndex((e) => e.id === id)];
/** a family's two rows, in table order */
const familyPair = (f: string) => STORM_EVENTS.flatMap((e, i) => (e.family === f ? [i] : []));

function draws(s0: number, s1: number): number {
  for (let k = 0; k <= 12; k++) if (((s0 + k * STEP) >>> 0) === (s1 >>> 0)) return k;
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
    // a 26-row map: row 0 is the north pole's band, the equator sits between rows 12 and 13
    expect([0, 5, 9, 12, 13, 16, 20, 25].map((r) => windBand(r, 26))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // the boundaries are lower-inclusive: on a 181-row map row 30 is exactly lat 60
    expect(windBand(30, 181)).toBe(0);
    expect(windBand(31, 181)).toBe(1);
    expect(windBand(90, 181)).toBe(3); // lat 0
    expect(windBand(91, 181)).toBe(4); // just south
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
    let first: Tile | undefined;
    for (let i = 0; i < 2000 && !first; i++) {
      disasterPhase(state);
      first = state.map.tiles.find((t) => (t.stormTurns ?? 0) > 0);
    }
    expect(first).toBeDefined();
    expect(STORM_EVENTS[first!.stormEvent!].family).toBe('BLIZZARD');
    expect(state.eventLog.some((e) => e.startsWith('Storm: BLIZZARD'))).toBe(true);
    // A blizzard is drawn every turn the board has snow; make the struck
    // plot the ONLY snow left, so every later draw lands on it, finds it
    // busy and forms nothing, and the one storm cannot walk off it.
    for (const t of state.map.tiles) if (t !== first) t.terrain = 'COAST';
    // the storm was applied once already (its spawn turn) and counts down
    const live = () => state.map.tiles.filter((t) => (t.stormTurns ?? 0) > 0);
    const ev0 = first!.stormEvent;
    expect(first!.stormTurns).toBe(2);
    disasterPhase(state);
    expect(live()).toHaveLength(1);
    expect(live()[0].stormTurns).toBe(1);
    expect(live()[0].stormEvent).toBe(ev0);
    disasterPhase(state);
    expect(live()).toHaveLength(0);
    expect(state.map.tiles.every((t) => (t.stormEvent ?? -1) === -1)).toBe(true);
    expect(state.eventLog.every((e) => !e.startsWith('Storm') || e.startsWith('Storm: BLIZZARD'))).toBe(true);
  });

  it('the walk is eight band-drawn steps, one draw each, dropped where the family cannot go', () => {
    // CIV6 (`Movement 8`, measured): on an all-snow board a blizzard walks
    // freely. Row 8 of 16 reads band 5 (-30..-5: NW 1 W 2 SW 2), so every
    // step heads west-ish and the resultant is 4-8 hexes, never eastward.
    const state = board(null, 'SNOW');
    const idx = STORM_EVENTS.findIndex((e) => e.id === 'BLIZZARD_SIGNIFICANT');
    const start = tileAtCoords(state.map, 8, 8);
    start.stormEvent = idx;
    start.stormTurns = 2;
    expect(windBand(8, 16)).toBe(5);
    const s0 = state.rngState;
    const end = stormWalk(state, start, STORM_EVENTS[idx]);
    expect(draws(s0, state.rngState)).toBe(8);
    expect(end.stormEvent).toBe(idx);
    expect(end.stormTurns).toBe(2);
    expect(start.stormEvent).toBe(-1);
    expect(start.stormTurns).toBe(0);
    const dist = hexDistance(start.col, start.row, end.col, end.row);
    expect(dist).toBeGreaterThanOrEqual(4);
    expect(dist).toBeLessThanOrEqual(8);
    expect(end.col).toBeLessThanOrEqual(start.col);
    expect(state.map.tiles.filter((t) => (t.stormTurns ?? 0) > 0)).toHaveLength(1);
    // a hurricane on the one OCEAN tile of a grassland board has nowhere to
    // go: eight draws, eight dropped steps, the record where it was
    const land = board(null, 'GRASSLAND');
    const sea = tileAtCoords(land.map, 8, 8);
    sea.terrain = 'OCEAN';
    sea.elevation = 'FLAT';
    const cat4 = STORM_EVENTS.findIndex((e) => e.id === 'HURRICANE_CAT_4');
    sea.stormEvent = cat4;
    sea.stormTurns = 2;
    const s1 = land.rngState;
    expect(stormWalk(land, sea, STORM_EVENTS[cat4])).toBe(sea);
    expect(draws(s1, land.rngState)).toBe(8);
    expect(sea.stormEvent).toBe(cat4);
    // another storm's centre blocks a step the same way
    const snow = board(null, 'SNOW');
    const c = tileAtCoords(snow.map, 8, 8);
    c.stormEvent = idx;
    c.stormTurns = 2;
    for (let d = 0; d < 6; d++) {
      const n = tileAtCoords(snow.map, c.col + [1, 0, -1, -1, -1, 0][d], c.row + [0, -1, -1, 0, 1, 1][d]);
      n.stormEvent = idx;
      n.stormTurns = 1;
    }
    expect(stormWalk(snow, c, STORM_EVENTS[idx])).toBe(c);
  });

  it('a storm damages on its first two turns and walks on its last two', () => {
    // ENTRY: the footprint at the strike plot, no walk. MOVEMENT: walk, then
    // the footprint. DISSIPATION: walk, no footprint. Read off the draws a
    // phase makes: a tornado on the board's one PLAINS HILL in a sea can
    // never leave its tile, so every step is a dropped draw and the
    // footprint is one tile's eleven. That hill is the board's only
    // tornado plot, and its Woods keep any drought off it, so the turn's
    // event draw names a tornado, whose centre pick lands on the busy hill:
    // two draws a turn.
    const state = board(null, 'COAST');
    const c = tileAtCoords(state.map, 8, 8);
    c.terrain = 'PLAINS';
    c.elevation = 'HILLS';
    c.feature = 'WOODS';
    c.stormEvent = STORM_EVENTS.findIndex((e) => e.id === 'TORNADO_FAMILY');
    c.stormTurns = 3;
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const s0 = state.rngState;
      disasterPhase(state);
      let k = 0;
      for (; k < 80; k++) if (((s0 + k * STEP) >>> 0) === (state.rngState >>> 0)) break;
      counts.push(k);
    }
    expect(state.eventLog.some((e) => e.startsWith('Storm:'))).toBe(false);
    expect(counts).toEqual([2 + 11, 2 + 8 + 11, 2 + 8]);
    expect(c.stormTurns).toBe(0);
    expect(c.stormEvent).toBe(-1);
  });

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

  it('silt on a natural wonder pays nothing: the wonder keeps its own row', () => {
    const state = board(null);
    const t = tileAtCoords(state.map, 5, 5);
    t.feature = 'EYE_OF_THE_SAHARA';
    t.terrain = 'DESERT';
    t.elevation = 'HILLS';
    const before = tileYields(makeYieldCtx(state, 0), t);
    t.fertility = 2;
    t.fertilityProd = 1;
    expect(tileYields(makeYieldCtx(state, 0), t)).toEqual(before);
  });
  it('a storm tile draws eleven times whatever stands there', () => {
    const state = board(null);
    const tile = tileAtCoords(state.map, 5, 5);
    for (const [ev, unit] of [['TORNADO_FAMILY', null], ['HURRICANE_CAT_5', 'WARRIOR']] as const) {
      if (unit) spawnUnit(state, unit, tile.index, 0);
      const s0 = state.rngState;
      stormTile(state, tile, EV(ev), false);
      // improvement, destroy, district, BUILDING, population, civilian, land,
      // naval, one HP band, and the two fertility yields
      expect(draws(s0, state.rngState)).toBe(11);
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

  it('a warmed world grows each row by its own ChanceIncreasePerDegree', () => {
    // CIV6 (`RandomEvents.ChanceIncreasePerDegree`): 0 on each family's milder
    // row, 50 on its worse — weight x (1 + 50/100 x 2) at two degrees
    const base = stormWeights(0);
    expect(base).toEqual(STORM_EVENTS.map((e) => e.weight));
    const warm = stormWeights(2);
    for (const f of STORM_FAMILIES) {
      const [a, b] = familyPair(f);
      expect(warm[a]).toBe(base[a]);
      expect(warm[b]).toBeCloseTo(base[b] * 2, 12);
    }
    // ...and the draw reads exactly these rows, in the install's table order
    const rows = eventRows(2);
    expect(rows.filter((r) => r.family === 'storm').map((r) => r.weight)).toEqual(warm);
    expect(rows.map((r) => r.family)).toEqual([
      'flood', 'flood', 'flood', 'kilimanjaro', 'kilimanjaro', 'volcano', 'volcano', 'volcano',
      ...STORM_EVENTS.map(() => 'storm'), 'accident', 'accident', 'accident', 'drought', 'drought',
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
