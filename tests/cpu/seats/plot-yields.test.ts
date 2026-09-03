import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, bareCtx, grantCivics } from '../helpers';
import { tileYields } from '../../../cpu/core/yields';
import { plotYieldRowsFor, getModifiers } from '../../../cpu/core/effects';
import { PLOT_YIELD_ROWS } from '../../../cpu/data/civilizations';
import { CIV_IDS, CIV_LEADERS } from '../../../cpu/data/seats';
import type { PlotYieldRow } from '../../../cpu/data/civilizations';

/**
 * CIV6 (EFFECT_ADJUST_PLOT_YIELD): the roster's plot rows off the install's
 * TraitModifiers — Laurier's Last Best West, Mit'a's mountains, Mali's mines,
 * Mana's improved Woods and Rainforest, Mother Russia's tundra. One clause
 * per assertion, on the tile walk that pays it.
 */
/** the roster ROW a civilization's first leader sits at — what `Seat.civ` indexes */
const civ = (id: string) => CIV_LEADERS.findIndex((l) => l.civ === id);
const rowsOf = (who: { civ?: string; leader?: string }): readonly PlotYieldRow[] =>
  PLOT_YIELD_ROWS.filter((r) => (who.civ !== undefined ? r.civ === who.civ : r.leader === who.leader));

describe('the plot rows', () => {
  it('are the census: 31 rows over five traits, each naming a civilization or a leader the roster holds', () => {
    expect(PLOT_YIELD_ROWS.length).toBe(31);
    for (const r of PLOT_YIELD_ROWS) {
      if (r.civ !== undefined) expect(CIV_IDS).toContain(r.civ);
      else expect(CIV_LEADERS.some((l) => l.leader === r.leader)).toBe(true);
      expect(r.civ !== undefined || r.leader !== undefined).toBe(true);
    }
  });

  it("Mother Russia: +1 Faith and +1 Production on Tundra, flat and hills alike", () => {
    const map = makeMap(8, 8, 'GRASSLAND');
    const ctx = bareCtx(map);
    ctx.mods.plotYields = rowsOf({ civ: 'RUSSIA' });
    const t = tileAtCoords(map, 2, 2);
    const base = tileYields(ctx, t);
    t.terrain = 'TUNDRA';
    const flatBase = { ...tileYields(bareCtx(map), t) };
    const flat = tileYields(ctx, t);
    expect(flat.faith - flatBase.faith).toBe(1);
    expect(flat.production - flatBase.production).toBe(1);
    t.elevation = 'HILLS';
    const hillBase = { ...tileYields(bareCtx(map), t) };
    const hill = tileYields(ctx, t);
    expect(hill.faith - hillBase.faith).toBe(1);
    expect(hill.production - hillBase.production).toBe(1);
    expect(tileYields(ctx, tileAtCoords(map, 3, 3)).faith).toBe(base.faith); // grassland pays nothing
  });

  it("Laurier's Last Best West: +2 to a Mine, Camp, Farm or Lumber Mill on Tundra or Snow", () => {
    const map = makeMap(8, 8, 'TUNDRA');
    const ctx = bareCtx(map);
    ctx.mods.plotYields = rowsOf({ leader: 'LAURIER' });
    const t = tileAtCoords(map, 2, 2);
    t.improvement = 'MINE';
    const plain = { ...tileYields(bareCtx(map), t) };
    expect(tileYields(ctx, t).production - plain.production).toBe(2);
    t.improvement = 'FARM';
    const plainF = { ...tileYields(bareCtx(map), t) };
    expect(tileYields(ctx, t).food - plainF.food).toBe(2);
    t.pillaged = true;
    expect(tileYields(ctx, t).food).toBe(tileYields(bareCtx(map), t).food); // a pillaged Farm pays nothing extra
    t.pillaged = false;
    t.terrain = 'GRASSLAND';
    expect(tileYields(ctx, t).food).toBe(tileYields(bareCtx(map), t).food); // off the tundra, nothing
    t.terrain = 'SNOW';
    t.elevation = 'HILLS';
    t.improvement = 'LUMBER_MILL';
    expect(tileYields(ctx, t).production - tileYields(bareCtx(map), t).production).toBe(2);
  });

  it("Mali's Songs of the Jeli: a Mine pays -1 Production and +4 Gold", () => {
    const map = makeMap(8, 8, 'DESERT');
    const ctx = bareCtx(map);
    ctx.mods.plotYields = rowsOf({ civ: 'MALI' });
    const t = tileAtCoords(map, 2, 2);
    t.elevation = 'HILLS';
    t.improvement = 'MINE';
    const plain = { ...tileYields(bareCtx(map), t) };
    const mali = tileYields(ctx, t);
    expect(mali.production - plain.production).toBe(-1);
    expect(mali.gold - plain.gold).toBe(4);
  });

  it("Mana: +1 Production on an improved Woods or Rainforest, +1 more at Mercantilism, +2 more at Conservation; Fishing Boats +1 Food", () => {
    const state = makeState(makeMap(8, 8, 'GRASSLAND'));
    state.seats[0].civ = civ('MAORI');
    const base = plotYieldRowsFor(state, 0, 'MAORI', 'KUPE');
    expect(base.filter((r) => r.feature === 'WOODS').length).toBe(1);
    grantCivics(state, 'MERCANTILISM');
    const merc = plotYieldRowsFor(state, 0, 'MAORI', 'KUPE');
    expect(merc.filter((r) => r.feature === 'WOODS').length).toBe(2);
    grantCivics(state, 'CONSERVATION');
    const cons = plotYieldRowsFor(state, 0, 'MAORI', 'KUPE');
    expect(cons.filter((r) => r.feature === 'WOODS').reduce((s, r) => s + r.amount, 0)).toBe(4);
    const ctx = bareCtx(state.map);
    ctx.mods.plotYields = cons;
    const t = tileAtCoords(state.map, 2, 2);
    t.feature = 'WOODS';
    const bare = { ...tileYields(bareCtx(state.map), t) };
    expect(tileYields(ctx, t).production).toBe(bare.production); // unimproved: nothing
    t.improvement = 'LUMBER_MILL';
    const plain = { ...tileYields(bareCtx(state.map), t) };
    expect(tileYields(ctx, t).production - plain.production).toBe(4);
    const sea = tileAtCoords(state.map, 4, 4);
    sea.terrain = 'COAST';
    sea.resource = 'FISH';
    sea.improvement = 'FISHING_BOATS';
    expect(tileYields(ctx, sea).food - tileYields(bareCtx(state.map), sea).food).toBe(1);
  });

  it("Mit'a: the mountain rows exist, and a mountain pays nothing until the seat can work it", () => {
    const rows = rowsOf({ civ: 'INCA' });
    expect(rows.every((r) => r.mountain)).toBe(true);
    expect(rows.some((r) => r.eraAtLeast === 'Industrial')).toBe(true);
    const map = makeMap(8, 8, 'GRASSLAND');
    const ctx = bareCtx(map);
    ctx.mods.plotYields = rows;
    const t = tileAtCoords(map, 2, 2);
    t.elevation = 'MOUNTAIN';
    // CIV6 (Mit'a): a MOUNTAIN pays the rows that NAME it — the seat still
    // needs EFFECT_ADJUST_PLAYER_TERRAIN_WORK_IMPASSABLE_MODIFIER before a
    // citizen may stand there and collect it (`workableTiles`)
    // every row assigned here pays: the ERA gate lives in `plotYieldRowsFor`,
    // which the caller runs before it hands the rows over
    expect(tileYields(ctx, t).production).toBe(
      rows.filter((r) => r.yield === 'production').reduce((n, r) => n + r.amount, 0),
    );
    // a seat with no mountain row takes nothing off the same tile
    const bare = bareCtx(map);
    expect(tileYields(bare, t).production).toBe(0);
  });

  it('getModifiers carries the rows of the seat it reads', () => {
    const state = makeState(makeMap(8, 8, 'GRASSLAND'));
    expect(getModifiers(state, 0).plotYields).toEqual([]);
    state.seats[0].civ = civ('RUSSIA');
    const m = getModifiers(state, 0);
    expect(m.leader).toBe('PETER_GREAT');
    expect(m.plotYields.length).toBe(4);
    state.seats[0].civ = civ('CANADA');
    expect(getModifiers(state, 0).plotYields.length).toBe(16);
  });
});
