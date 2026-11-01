/**
 * THE RIVERS' NAMES OVER THE RECORDS (`nameRiversInLook`, read off the
 * records): a record's flood rivers are those the record before named, and
 * those its turn's unit events name — each major's sight as the record
 * before stood (`RiverLook`: its plots and centres' rings and its units'
 * looks, with the city-states it is suzerain of), the events of the record's
 * log (UnitMoved, UnitTeleported, UnitAddedToMap: the new look added before
 * the old is dropped; UnitRemovedFromMap) replayed in order, a river named
 * where a major's own unit's look takes one of its own plots from no sight.
 * The first record's are the start's: the rivers its majors' own sight takes
 * in (the placements' looks). Ownership changes inside the turn are not
 * replayed (the record before's plots stand).
 */
import { floodRivers, floodRiversAt } from '../core/disasters';
import { plotsSeenNow } from '../core/barbarians';
import { fogActive, losDisk, unitSeesThrough, unitSight } from '../core/fog';
import { isCiv, isCityStateSeat } from '../core/seats';
import { suzerainOf } from '../core/cityStates';
import type { GameState, Unit } from '../core/types';

/** each major's sight as a record stands, for the next record's events */
export interface RiverLook {
  turn: number;
  state: GameState;
  /** per major its count of looks per plot */
  counts: Map<number, Int16Array>;
  /** the record's units by `${owner}:${id}`, with the plot each looks from */
  units: Map<string, { u: Unit; tile: number }>;
}

/** the majors a seat's sight counts for: a major itself, a city-state's
 *  suzerain */
function receivers(state: GameState, seat: number): number[] {
  if (isCiv(seat)) return [seat];
  if (!isCityStateSeat(seat)) return [];
  const cs = state.cityStates.find((c) => c.seat === seat);
  if (!cs || cs.centerIndex < 0) return [];
  const suz = suzerainOf(cs);
  return isCiv(suz) ? [suz] : [];
}

const disk = (state: GameState, u: Unit, tile: number): Set<number> =>
  losDisk(state.map, state.map.tiles[tile], unitSight(u, state), unitSeesThrough(u));

/** the majors' sight of an imported record (`unitByKey` its units by key) */
export function riverLookOf(state: GameState, turn: number, unitByKey: ReadonlyMap<string, Unit>): RiverLook {
  const counts = new Map<number, Int16Array>();
  for (const s of state.seats) {
    if (!isCiv(s.seat)) continue;
    const st = plotsSeenNow({ ...state, units: [] }, new Set([s.seat]), true);
    counts.set(s.seat, Int16Array.from(st));
  }
  const units = new Map<string, { u: Unit; tile: number }>();
  for (const [key, u] of unitByKey) {
    units.set(key, { u, tile: u.tileIndex });
    for (const m of receivers(state, u.seat)) {
      const c = counts.get(m);
      if (c) for (const p of disk(state, u, u.tileIndex)) c[p]++;
    }
  }
  return { turn, state, counts, units };
}

/** the start's names: the rivers the majors' own sight takes in */
export function startRiverNames(state: GameState): boolean[] | undefined {
  if (!fogActive(state)) return undefined;
  const seen = plotsSeenNow(state, new Set(state.seats.filter((s) => isCiv(s.seat)).map((s) => s.seat)), false);
  return floodRivers(state.map).map((r) => r.own.some((t) => seen[t.index] === 1));
}

/** names the rivers the record's events name over `look` (the record
 *  before's sight, read and left as it stands: a record imported again
 *  replays its events on the same look; `named` written in place);
 *  `unitByKey` the record's own units, for one its turn made */
export function recordRiverNames(look: RiverLook, actions: readonly unknown[][], named: boolean[],
  seatOfPlayer: ReadonlyMap<number, number>, unitByKey: ReadonlyMap<string, Unit>): void {
  const { state } = look;
  const counts = new Map([...look.counts].map(([m, c]) => [m, c.slice()] as const));
  const units = new Map(look.units);
  const at = floodRiversAt(state.map);
  const W = state.map.width;
  const add = (key: string, owner: number, tile: number) => {
    const was = units.get(key);
    const u = was?.u ?? unitByKey.get(key);
    const seat = seatOfPlayer.get(owner);
    if (!u || seat === undefined) return;
    for (const m of receivers(state, seat)) {
      const c = counts.get(m);
      if (!c) continue;
      for (const p of disk(state, u, tile)) {
        if (c[p] === 0 && m === seat) for (const r of at.get(p) ?? []) named[r] = true;
        c[p]++;
      }
      if (was) for (const p of disk(state, u, was.tile)) c[p]--;
    }
    units.set(key, { u, tile });
  };
  const remove = (key: string, owner: number) => {
    const was = units.get(key);
    const seat = seatOfPlayer.get(owner);
    if (!was || seat === undefined) return;
    for (const m of receivers(state, seat)) {
      const c = counts.get(m);
      if (c) for (const p of disk(state, was.u, was.tile)) c[p]--;
    }
    units.delete(key);
  };
  for (const a of actions) {
    const kind = a[2];
    const owner = a[3] as number;
    const key = `${owner}:${a[4]}`;
    if (kind === 'UnitMoved' || kind === 'UnitTeleported' || kind === 'UnitAddedToMap') add(key, owner, (a[6] as number) * W + (a[5] as number));
    else if (kind === 'UnitRemovedFromMap') remove(key, owner);
  }
}
