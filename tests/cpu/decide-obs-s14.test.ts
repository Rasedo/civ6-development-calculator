/**
 * THE NEUTRAL OBSERVATION'S `cities` GROUP, TS side: one row per living city
 * of the seat with its production columns, the plots each open district
 * column may take, its specialist slots and pins, the plots it may work and
 * the plots a sibling holds that it may claim. The gate compares it with
 * `gpu/core/neutral.py`'s `cities` every turn.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, expandBorders, grantTechs, tileAtCoords } from './helpers';
import { SEAT_GROUPS, citiesObs, districtPlots, districtRankAdj } from '../../cpu/core/decideObsCities';
import { prodLayout } from '../../cpu/core/prodLayout';
import { PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS } from '../../cpu/data/districts';
import { spawnUnit } from '../../cpu/core/units';
import { setTileOwner } from '../../cpu/core/seats';
import type { GameState } from '../../cpu/core/types';

function scene(): GameState {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.sandbox = true;           // founding spends no settler
  const a = settleAt(state, tileAtCoords(state.map, 5, 10).index);
  settleAt(state, tileAtCoords(state.map, 10, 10).index);
  state.sandbox = false;
  expandBorders(state, a, 3);
  return state;
}

describe('the cities group', () => {
  it('registers cities', () => {
    expect(Object.keys(SEAT_GROUPS)).toEqual(['cities']);
  });

  it('one row per living city in array order, the scalars and the specialist lists', () => {
    const state = scene();
    const rows = citiesObs(state, 0);
    expect(rows.map((r) => r.centre)).toEqual([tileAtCoords(state.map, 5, 10).index, tileAtCoords(state.map, 10, 10).index]);
    expect(rows.map((r) => r.isCapital)).toEqual([true, false]);
    expect(rows[0].pop).toBe(1);
    expect(rows[0].settlerQueued).toBe(0);
    expect(rows[0].specSlots).toEqual(PLACEABLE_DISTRICTS.map(() => 0));
    expect(rows[0].specPin).toEqual(PLACEABLE_DISTRICTS.map(() => -1));
    expect(Object.keys(rows[0])).toEqual(
      ['centre', 'isCapital', 'pop', 'settlerQueued', 'prodOpen', 'distSites', 'specSlots', 'specPin', 'workTiles', 'swapFrom']);
  });

  it('prodOpen: the settler at population 2, idle always, a combat unit, the Builder while it has work and none stands', () => {
    const state = scene();
    const L = prodLayout();
    let open = citiesObs(state, 0)[0].prodOpen;
    expect(open).toEqual([...open].sort((a, b) => a - b));
    expect(open).toContain(L.idleCol);
    expect(open).not.toContain(L.settlerCol);
    expect(open).toContain(L.unitLo + L.units.indexOf('WARRIOR'));
    const builder = L.unitLo + L.units.indexOf('BUILDER');
    expect(open).toContain(builder);
    state.seats[0].cities[0].population = 2;
    spawnUnit(state, 'BUILDER', state.seats[0].cities[0].centerIndex, 0);
    open = citiesObs(state, 0)[0].prodOpen;
    expect(open).toContain(L.settlerCol);
    expect(open).not.toContain(builder);
  });

  it('a full queue opens nothing; a queued settler counts', () => {
    const state = scene();
    state.seats[0].cities[0].queue.push({ kind: 'settler', progress: 0, cost: 80 });
    const row = citiesObs(state, 0)[0];
    expect(row.settlerQueued).toBe(1);
    expect(row.prodOpen).toEqual([]);
    expect(row.distSites).toEqual([]);
  });

  it('distSites: every legal plot of an open district column with its adjacency', () => {
    const state = scene();
    const L = prodLayout();
    const col = L.districtLo + SCAFFOLD_DISTRICTS.findIndex((d) => d.id === 'CAMPUS');
    expect(citiesObs(state, 0)[0].prodOpen).not.toContain(col);
    grantTechs(state, 'POTTERY', 'WRITING');
    const city = state.seats[0].cities[0];
    const mtn = tileAtCoords(state.map, 5, 12);
    mtn.elevation = 'MOUNTAIN';
    const row = citiesObs(state, 0)[0];
    expect(row.prodOpen).toContain(col);
    const plots = districtPlots(state, city, 'CAMPUS');
    const mine = row.distSites.filter((s) => s[0] === col);
    expect(mine.map((s) => s[1])).toEqual(plots);
    expect(plots).not.toContain(mtn.index);
    expect(plots).not.toContain(city.centerIndex);
    // a plot beside the mountain earns its adjacency, a far one none
    const beside = tileAtCoords(state.map, 5, 11);
    expect(districtRankAdj(state, city, 'CAMPUS', beside)).toBe(1);
    expect(mine.find((s) => s[1] === beside.index)![2]).toBe(1);
    expect(mine.find((s) => s[1] === tileAtCoords(state.map, 5, 7).index)![2]).toBe(0);
    // sorted by column, then tile
    const keys = row.distSites.map((s) => s[0] * 1e6 + s[1]);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it('workTiles: the workable plots with resource priority and the pin', () => {
    const state = scene();
    const city = state.seats[0].cities[0];
    const wheat = tileAtCoords(state.map, 4, 10);
    wheat.resource = 'WHEAT';
    wheat.locked = true;
    const row = citiesObs(state, 0)[0];
    expect(row.workTiles.map((w) => w[0])).not.toContain(city.centerIndex);
    expect(row.workTiles.find((w) => w[0] === wheat.index)).toEqual([wheat.index, 1, 1]);
    expect(row.workTiles.find((w) => w[0] === tileAtCoords(state.map, 6, 10).index)).toEqual([tileAtCoords(state.map, 6, 10).index, 0, 0]);
    const idx = row.workTiles.map((w) => w[0]);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('swapFrom: a sibling plot within reach and touching the claimant\'s land, not next to its holder, with worked and locked', () => {
    const state = scene();
    const [a, b] = state.seats[0].cities;
    const t = tileAtCoords(state.map, 7, 10);   // held by a, two from a, three from b
    setTileOwner(t, 0, a.id);
    const touch = tileAtCoords(state.map, 8, 10);   // b's plot beside it
    setTileOwner(touch, 0, b.id);
    a.workedTiles = [t.index];
    t.locked = true;
    let rows = citiesObs(state, 0);
    expect(rows[1].swapFrom).toContainEqual([t.index, a.centerIndex, 1, 1]);
    // a plot next to its holder's centre never swaps
    expect(rows[1].swapFrom.map((s) => s[0])).not.toContain(tileAtCoords(state.map, 6, 10).index);
    // a may claim b's plot back: it touches a's land, three from a
    expect(rows[0].swapFrom).toEqual([[touch.index, b.centerIndex, 0, 0]]);
    // touching none of b's land, the plot is not offered
    setTileOwner(touch, 0, a.id);
    rows = citiesObs(state, 0);
    expect(rows[1].swapFrom.map((s) => s[0])).not.toContain(t.index);
  });
});
