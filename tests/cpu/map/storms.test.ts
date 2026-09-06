import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { disasterPhase, stormChances, stormFootprint, stormTile } from '../../../cpu/core/disasters';
import { STORM_DISC, STORM_EVENTS, STORM_FAMILIES, STORM_UNIT_ROWS, stormFamilyAt, stormFamilyPair } from '../../../cpu/data/disasters';
import { disasterRateMult } from '../../../cpu/data/climate';
import type { GameState, Tile } from '../../../cpu/core/types';

/**
 * THE EIGHT NAMED STORMS (C-49) — the TS half; the GPU twin is
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

function draws(s0: number, s1: number): number {
  for (let k = 0; k <= 12; k++) if (((s0 + k * STEP) >>> 0) === (s1 >>> 0)) return k;
  throw new Error(`the stream moved by a non-draw amount: ${s0} -> ${s1}`);
}

/** a two-seat board; seat 0 may play a leader, seat 1 is at war with it */
function board(leader: string | null, terrain: 'GRASSLAND' | 'COAST' | 'SNOW' = 'GRASSLAND') {
  const state: GameState = makeState(makeMap(16, 16, terrain));
  state.unitsMode = true;
  state.disasters = true;
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
    // OccurrencesPerGame at MODERATE over the 500-turn standard game
    expect(STORM_EVENTS.map((e) => Math.round(e.chance * 500))).toEqual([8, 2, 8, 2, 15, 3, 15, 3]);
    for (const f of STORM_FAMILIES) {
      const [a, b] = stormFamilyPair(f);
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
    // the storm was applied once already (its spawn turn) and counts down
    expect(first!.stormTurns).toBe(2);
    disasterPhase(state);
    expect(first!.stormTurns).toBe(1);
    disasterPhase(state);
    expect(first!.stormTurns).toBe(0);
    expect(first!.stormEvent).toBe(-1);
    expect(state.eventLog.every((e) => !e.startsWith('Storm') || e.startsWith('Storm: BLIZZARD'))).toBe(true);
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

  it('a storm tile draws ten times whatever stands there', () => {
    const state = board(null);
    const tile = tileAtCoords(state.map, 5, 5);
    for (const [ev, unit] of [['TORNADO_FAMILY', null], ['HURRICANE_CAT_5', 'WARRIOR']] as const) {
      if (unit) spawnUnit(state, unit, tile.index, 0);
      const s0 = state.rngState;
      stormTile(state, tile, EV(ev), false);
      expect(draws(s0, state.rngState)).toBe(10);
    }
  });

  it('the climate ramp is the flood\'s: mass moves to the worse severity, then every draw scales', () => {
    const base = stormChances(-1, 1);
    expect(base).toEqual(STORM_EVENTS.map((e) => e.chance));
    const rate = disasterRateMult(2);
    const warm = stormChances(2, rate);
    for (const f of STORM_FAMILIES) {
      const [a, b] = stormFamilyPair(f);
      expect(warm[a]).toBeLessThan(base[a] * rate);
      expect(warm[b]).toBeGreaterThan(base[b] * rate);
      expect(warm[a] + warm[b]).toBeCloseTo((base[a] + base[b]) * rate, 12);
    }
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
