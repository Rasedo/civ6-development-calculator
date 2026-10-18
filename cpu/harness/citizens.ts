/**
 * THE YIELD FLAGS A CITY'S STANDING CITIZENS WERE PLACED UNDER, for the H-1
 * steps that re-place a city's citizens where the record holds no flags.
 */
import type { City, GameState } from '../core/types';
import { tileBelongsTo } from '../core/seats';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { replaceAllCitizens, YIELD_KEYS, type YieldFlags } from '../core/citizens';

/** The yield flags a city's standing citizens were last placed under, where
 *  the record holds none: the AI sets them with each full re-place (its
 *  CityFocusChanged rows), so the first flag set — none, then each yield
 *  favored, then each disfavored — whose full re-place reproduces the
 *  record's worked plots and specialists; undefined where none does
 *  (runs/h1_duelw1127 Changsha t125: Culture favored places its five
 *  citizens as the record shows, and its grown citizen on Culture). */
export function standingFlags(state: GameState, city: City): YieldFlags | undefined {
  const mine = state.map.tiles.filter((t) => tileBelongsTo(t, city));
  const locked = mine.filter((t) => t.locked).map((t) => t.index);
  const pins = city.specialistPref ? [...city.specialistPref] : undefined;
  const idle = city.idleCitizens;
  const placed = (): string => JSON.stringify([mine.filter((t) => t.locked).map((t) => t.index),
    PLACEABLE_DISTRICTS.map((_, i) => Math.max(0, city.specialistPref?.[i] ?? 0))]);
  const want = placed();
  const restore = () => {
    for (const t of mine) t.locked = false;
    for (const q of locked) state.map.tiles[q].locked = true;
    city.specialistPref = pins ? [...pins] : undefined;
    city.idleCitizens = idle;
  };
  const one = (ch: string) => YIELD_KEYS.map((_, i) => YIELD_KEYS.map((__, j) => (i === j ? ch : '.')).join(''));
  for (const flags of ['', ...one('F'), ...one('D')]) {
    replaceAllCitizens(state, city, flags);
    const same = placed() === want;
    restore();
    if (same) return flags;
  }
  return undefined;
}

