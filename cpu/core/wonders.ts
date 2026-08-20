import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { citiesOf } from './seats';
import type { City, GameState } from './types';

/** Catalog position per wonder id — the index the exported `wonders.rows`
 *  table is in, which is the order the GPU folds its per-wonder products in. */
const WONDER_CATALOG_ORDER = new Map(Object.keys(BUILT_WONDERS).map((id, i) => [id, i]));

export interface HeldWonder {
  def: BuiltWonderDef;
  tileIndex: number;
  idx: number;
}

export function completedWonders(state: GameState, city: City): HeldWonder[] {
  // CATALOG order, not build order. Callers fold a FLOAT product over this
  // list — growthAllMult, cityYieldMult, the tourism multipliers — and the
  // GPU's registry is keyed by wonder index and can only fold ascending, so
  // two multipliers on one channel would otherwise associate differently on
  // the two engines. Build order is not a Civ 6 fact; nothing reads it.
  return city.wonders
    .filter((w) => state.map.tiles[w.tileIndex].builtWonderComplete)
    .map((w) => ({ def: BUILT_WONDERS[w.id], tileIndex: w.tileIndex, idx: WONDER_CATALOG_ORDER.get(w.id) ?? 0 }))
    .filter((w) => w.def)
    .sort((a, b) => a.idx - b.idx);
}

/** Every COMPLETE wonder the seat holds, across its cities, in catalog order. */
export function seatWonders(state: GameState, seat: number): HeldWonder[] {
  const out: HeldWonder[] = [];
  for (const c of citiesOf(state, seat)) out.push(...completedWonders(state, c));
  return out.sort((a, b) => a.idx - b.idx);
}

type Effects = NonNullable<BuiltWonderDef['effects']>;
type NumKey = NonNullable<{ [K in keyof Effects]: Effects[K] extends number | undefined ? K : never }[keyof Effects]>;
type FlagKey = NonNullable<{ [K in keyof Effects]: Effects[K] extends boolean | undefined ? K : never }[keyof Effects]>;

/** Sum one numeric effect over every COMPLETE wonder the seat holds. */
export function seatWonderSum(state: GameState, seat: number, key: NumKey): number {
  let n = 0;
  for (const w of seatWonders(state, seat)) n += w.def.effects?.[key] ?? 0;
  return n;
}

/** True when any COMPLETE wonder the seat holds carries the flag. */
export function seatWonderFlag(state: GameState, seat: number, key: FlagKey): boolean {
  return seatWonders(state, seat).some((w) => w.def.effects?.[key]);
}
