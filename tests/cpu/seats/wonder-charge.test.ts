import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { wonderChargeBoost, wonderChargeCity, wonderChargePct, itemCost } from '../../../cpu/core/game';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../../../cpu/data/builtWonders';
import { WONDER_CHARGE_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { ERAS } from '../../../cpu/data/techs';
import type { GameState, City, Tile } from '../../../cpu/core/types';

/**
 * THE BUILDER'S CHARGE INTO A WONDER (CIV6, The First Emperor,
 * EFFECT_ADJUST_PLAYER_UNIT_WONDER_PERCENT): "When building Ancient and
 * Classical wonders you may spend Builder charges to complete 15% of the
 * original wonder cost." The install's modifier carries Amount 15 and NO
 * requirement set, so the era band comes from the leader's own description
 * text in the same install (C-55).
 *
 * The GPU twin is tests/gpu/wonder_charge_test.py. No fixture seats China,
 * so no gate lane can reach this verb — these lanes are the only evidence.
 */
const QIN = CIV_LEADERS.findIndex((l) => l.leader === 'QIN');

/** A wonder whose era falls inside the row's band, and one outside it. */
function wondersInAndOut(): { inside: string; outside: string } {
  const r = WONDER_CHARGE_ROWS[0];
  const lo = ERAS.indexOf(r.startEra);
  const hi = ERAS.indexOf(r.endEra);
  const ids = Object.keys(BUILT_WONDERS);
  const inside = ids.find((w) => {
    const e = WONDER_ERA_INDEX[w] ?? 0;
    return e >= lo && e <= hi;
  });
  const outside = ids.find((w) => (WONDER_ERA_INDEX[w] ?? 0) > hi);
  expect(inside, 'no wonder sits inside the band').toBeTruthy();
  expect(outside, 'no wonder sits outside the band').toBeTruthy();
  return { inside: inside!, outside: outside! };
}

function scene(leaderRow: number, wonder: string): {
  state: GameState; city: City; at: Tile;
} {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 1);
  seatOf(state, 1)!.civ = leaderRow;
  // the wonder's own site, and the queue HEAD — only the head accrues on
  // either engine
  const at = tileAtCoords(state.map, 9, 8);
  city.queue.length = 0;
  city.queue.push({ kind: 'wonder', wonder, tileIndex: at.index, progress: 0 });
  return { state, city, at };
}

describe("the Builder's charge into a wonder", () => {
  it('reads the install: 15 percent, Ancient through Classical', () => {
    expect(WONDER_CHARGE_ROWS.length).toBe(1);
    const r = WONDER_CHARGE_ROWS[0];
    expect(r.leader).toBe('QIN');
    expect(r.pct).toBe(15);
    expect(r.startEra).toBe('Ancient');
    expect(r.endEra).toBe('Classical');
  });

  it('pays a percentage of the ORIGINAL cost and spends one charge', () => {
    const { inside } = wondersInAndOut();
    const { state, city, at } = scene(QIN, inside);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    const charges0 = u!.charges ?? 0;
    expect(charges0).toBeGreaterThan(1);   // Qin's own extra charge, so the
    //                                        unit survives to be inspected
    const cost = itemCost(city.queue[0], state, city);
    const res = wonderChargeBoost(state, u!, seatOf(state, 1)!);
    expect(res.ok).toBe(true);
    expect(city.queue[0].progress).toBe(Math.round(cost * 15 / 100));
    // ORIGINAL means the catalog's cost, not what is left to pay
    expect(cost).toBe(BUILT_WONDERS[inside].cost);
    expect(u!.charges).toBe(charges0 - 1);
  });

  it('a second charge stacks — the ability is per charge', () => {
    const { inside } = wondersInAndOut();
    const { state, city, at } = scene(QIN, inside);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    const cost = itemCost(city.queue[0], state, city);
    wonderChargeBoost(state, u!, seatOf(state, 1)!);
    const once = city.queue[0].progress;
    u!.movesLeft = 2;
    wonderChargeBoost(state, u!, seatOf(state, 1)!);
    expect(city.queue[0].progress).toBe(once + Math.round(cost * 15 / 100));
  });

  it("refuses a wonder outside the row's era band", () => {
    const { outside } = wondersInAndOut();
    const { state, city, at } = scene(QIN, outside);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    const res = wonderChargeBoost(state, u!, seatOf(state, 1)!);
    expect(res.ok).toBe(false);
    expect(city.queue[0].progress).toBe(0);
    expect(wonderChargePct(state, 1, outside)).toBe(0);
  });

  it('refuses a seat the roster does not name', () => {
    const { inside } = wondersInAndOut();
    // PLAIN = -1, a seat with no roster row at all
    const { state, city, at } = scene(-1, inside);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    const res = wonderChargeBoost(state, u!, seatOf(state, 1)!);
    expect(res.ok).toBe(false);
    expect(city.queue[0].progress).toBe(0);
  });

  it('refuses a tile that is not the wonder site', () => {
    const { inside } = wondersInAndOut();
    const { state, at } = scene(QIN, inside);
    const off = tileAtCoords(state.map, 7, 8);
    expect(off.index).not.toBe(at.index);
    expect(wonderChargeCity(state, 1, off.index)).toBeUndefined();
    const u = spawnUnit(state, 'BUILDER', off.index, 1);
    expect(wonderChargeBoost(state, u!, seatOf(state, 1)!).ok).toBe(false);
  });

  it('refuses a wonder that is not the queue HEAD', () => {
    const { inside } = wondersInAndOut();
    const { state, city, at } = scene(QIN, inside);
    // push something ahead of it: only the head accrues
    city.queue.unshift({ kind: 'project', project: 'RESEARCH_GRANTS',
                         cost: 100, progress: 0, tileIndex: -1 } as never);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    expect(wonderChargeBoost(state, u!, seatOf(state, 1)!).ok).toBe(false);
    expect(city.queue[1].progress).toBe(0);
  });
});
