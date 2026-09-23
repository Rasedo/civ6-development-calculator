/**
 * THE NEUTRAL OBSERVATION'S `targets` GROUP, TS side: the tile lists the unit
 * planner walks toward (cpu/core/decideObsTargets.ts over
 * cpu/core/targetSites.ts), each filled only where the seat holds a unit that
 * walks toward it. The gate compares it with `gpu/core/neutral.py`'s
 * `targets` every turn.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, expandBorders, holdWorks, tileAtCoords } from './helpers';
import { SEAT_GROUPS, targetsObs } from '../../cpu/core/decideObsTargets';
import { artifactHome, parkCluster, spawnUnit } from '../../cpu/core/units';
import { emptySeat, setTileOwner, setWar, tileSeat } from '../../cpu/core/seats';
import { GP_SITES } from '../../cpu/data/greatPeople';
import { GWO_ARTIFACT } from '../../cpu/data/greatWorks';
import { PLACEABLE_DISTRICTS } from '../../cpu/data/districts';
import { CITY_MIN_DIST } from '../../world/types';
import { hexDistance } from '../../world/hex';
import type { City, GameState, Unit } from '../../cpu/core/types';

const SCHEMA = JSON.parse(readFileSync('shared/decide.schema.json', 'utf-8')) as {
  targets: [string, string, string][];
};

function scene(): { state: GameState; a: City; b: City } {
  const state = makeState(makeMap(24, 20));
  state.seats.push(emptySeat(1));
  state.unitsMode = true;
  state.sandbox = true;           // founding spends no settler
  const a = settleAt(state, tileAtCoords(state.map, 5, 10).index, 0);
  const b = settleAt(state, tileAtCoords(state.map, 16, 10).index, 1);
  state.sandbox = false;
  expandBorders(state, a, 2);
  return { state, a, b };
}

function unit(state: GameState, type: string, tile: number, seat = 0): Unit {
  const u = spawnUnit(state, type, tile, seat);
  if (!u) throw new Error(`no ${type}`);
  return u;
}

const ascending = (xs: number[]) => expect(xs).toEqual([...xs].sort((x, y) => x - y));

describe('the targets group', () => {
  it('registers targets, every field in schema order', () => {
    expect(Object.keys(SEAT_GROUPS)).toEqual(['targets']);
    const { state } = scene();
    expect(Object.keys(targetsObs(state, 0))).toEqual(SCHEMA.targets.map((f) => f[0]));
  });

  it('no walker, no list: only the Tribal Villages', () => {
    const { state } = scene();
    state.map.tiles[3].goodyHut = true;
    state.map.tiles[40].goodyHut = true;
    const t = targetsObs(state, 0);
    expect(t.goody).toEqual([3, 40]);
    for (const k of ['jobs', 'engJobs', 'spread', 'foundOk', 'digs', 'parks', 'gpSites', 'warImps', 'warCities'] as const) {
      expect(t[k]).toEqual([]);
    }
  });

  it('jobs: a charged Builder lists its owned work tiles, a spent one nothing', () => {
    const { state, a } = scene();
    const bu = unit(state, 'BUILDER', a.centerIndex);
    const jobs = targetsObs(state, 0).jobs;
    expect(jobs.length).toBeGreaterThan(0);
    ascending(jobs);
    for (const i of jobs) expect(tileSeat(state.map.tiles[i])).toBe(0);
    bu.charges = 0;
    expect(targetsObs(state, 0).jobs).toEqual([]);
  });

  it('spread: a charged Missionary of a founding seat lists every major centre not following it', () => {
    const { state, a, b } = scene();
    unit(state, 'MISSIONARY', a.centerIndex);
    expect(targetsObs(state, 0).spread).toEqual([]);
    state.seats[0].religion.founded = true;
    a.followedReligion = 0;
    expect(targetsObs(state, 0).spread).toEqual([b.centerIndex]);
  });

  it('foundOk: a Settler lists unowned ground at least CITY_MIN_DIST from every centre', () => {
    const { state, a, b } = scene();
    unit(state, 'SETTLER', a.centerIndex);
    const found = targetsObs(state, 0).foundOk;
    expect(found.length).toBeGreaterThan(0);
    ascending(found);
    for (const i of found) {
      const t = state.map.tiles[i];
      expect(tileSeat(t)).toBeLessThan(0);
      for (const c of [a, b]) {
        const ct = state.map.tiles[c.centerIndex];
        expect(hexDistance(ct.col, ct.row, t.col, t.row)).toBeGreaterThanOrEqual(CITY_MIN_DIST);
      }
    }
  });

  it('digs: a charged Archaeologist lists digs on own or unowned ground while an Artifact slot is open', () => {
    const { state, a, b } = scene();
    const own = tileAtCoords(state.map, 6, 11);
    const free = tileAtCoords(state.map, 10, 3);
    const foreign = tileAtCoords(state.map, 17, 10);
    setTileOwner(foreign, 1, b.id);
    for (const t of [own, free, foreign]) t.antiquity = true;
    unit(state, 'ARCHAEOLOGIST', a.centerIndex);
    expect(artifactHome(state, 0)).toBe(a);          // the Palace takes an Artifact
    expect(targetsObs(state, 0).digs).toEqual([own.index, free.index].sort((x, y) => x - y));
    while (artifactHome(state, 0)) holdWorks(a, GWO_ARTIFACT, 1);
    expect(targetsObs(state, 0).digs).toEqual([]);
  });

  it('parks: a charged Naturalist lists the anchors of a legal rhombus', () => {
    const { state, a } = scene();
    const anchor = tileAtCoords(state.map, 6, 9);
    const east = tileAtCoords(state.map, 7, 9);
    const quad = parkCluster(state, anchor.index, east.index);
    expect(quad.length).toBe(4);
    for (const i of quad) {
      state.map.tiles[i].elevation = 'MOUNTAIN';
      setTileOwner(state.map.tiles[i], 0, a.id);
    }
    unit(state, 'NATURALIST', a.centerIndex);
    const parks = targetsObs(state, 0).parks;
    expect(parks).toContain(anchor.index);
    expect(parks).toContain(east.index);
    ascending(parks);
  });

  it('gpSites: a charged Great Scientist lists its complete own Campus as [site, arg, tile]', () => {
    const { state, a } = scene();
    const campus = tileAtCoords(state.map, 6, 10);
    campus.district = 'CAMPUS';
    campus.districtComplete = true;
    const gp = unit(state, 'SCIENTIST', a.centerIndex);
    gp.gpAt = 0;
    gp.charges = 1;
    const row = [GP_SITES.indexOf('district'), PLACEABLE_DISTRICTS.indexOf('CAMPUS'), campus.index];
    expect(targetsObs(state, 0).gpSites).toEqual([row]);
    campus.districtPillaged = true;
    expect(targetsObs(state, 0).gpSites).toEqual([]);
  });

  it('warImps and warCities: the foe\'s standing improvements and its cities, while at war', () => {
    const { state, b } = scene();
    const farm = tileAtCoords(state.map, 17, 11);
    setTileOwner(farm, 1, b.id);
    farm.improvement = 'FARM';
    expect(targetsObs(state, 0).warImps).toEqual([]);
    setWar(state, 0, 1, true);
    const t = targetsObs(state, 0);
    expect(t.warImps).toEqual([farm.index]);
    expect(t.warCities).toEqual([[1, b.centerIndex]]);
    farm.pillaged = true;
    expect(targetsObs(state, 0).warImps).toEqual([]);
  });
});
