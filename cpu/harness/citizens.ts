/**
 * THE GAME'S CITIZEN MANAGER (City_Citizens.cpp, GameCore_XP2), for the H-1
 * steps that re-place a city's citizens inside a turn: `placeCitizens` puts
 * `n` unassigned citizens beside the ones already working, the way 0x197230
 * does.
 *
 * - The Food NEED: the city's Food surplus with only the assigned citizens
 *   working, floored in its 1/256 fixed point, negated, at least 0.
 * - The ENTRIES: the city's 37-plot hexspace in the DLL's own order (the axial
 *   (dq, dr) tables at 0xefedf0 / 0xefeef0: the centre, then rings 1, 2, 3),
 *   each plot as many times as its free capacity (0x195940: none on the
 *   centre or where no yield is above 0, a district's specialist slots, else
 *   one) less the citizens on it.
 * - An entry's SCORE (0x195f90): its Food; and every yield not disfavored
 *   counted twice, Gold once, into favored or other.
 * - The PICK (0x193dc0): a table over entries x count; a cell takes the entry
 *   where better(cand, old) — old below the need and the candidate at or above
 *   it, else favored greater, else other greater, strict — so an earlier entry
 *   keeps a tie; the last row's cell for `n` is placed (0x194d90).
 *
 * The AI's favored and disfavored yields are not recorded: none here.
 */
import type { City, GameState, Tile, Yields } from '../core/types';
import { citySpecialistSlots, cityPlotBonus, cityYieldCtx, computeCityStats, specialistYields } from '../core/city';
import { tileYields } from '../core/yields';
import { tileBelongsTo } from '../core/seats';
import { PLACEABLE_DISTRICTS } from '../data/districts';

/** the DLL's hexspace order, axial (dq, dr) from the centre */
const HEXSPACE: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 2], [1, 1], [2, 0], [2, -1], [2, -2], [1, -2], [0, -2],
  [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 3], [1, 2], [2, 1], [3, 0], [3, -1], [3, -2], [3, -3], [2, -3],
  [1, -3], [0, -3], [-1, -2], [-2, -1], [-3, 0], [-3, 1], [-3, 2], [-3, 3], [-2, 3], [-1, 3],
];
const KEYS: readonly (keyof Yields)[] = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

interface Entry { plot: number; food: number; fav: number; other: number }
interface Cell { food: number; fav: number; other: number; picks: number[] }

/** the plot (dq, dr) from the centre, by the DLL's coordinate step (0x5cc00):
 *  q = x - floor(y / 2) + dq, y' = y + dr, x' = q + floor(y' / 2) */
function hexPlot(state: GameState, centre: Tile, dq: number, dr: number): Tile | undefined {
  const { width, height } = state.map;
  const y = centre.row + dr;
  if (y < 0 || y >= height) return undefined;
  let x = centre.col - Math.floor(centre.row / 2) + dq + Math.floor(y / 2);
  if (state.map.wrapX) x = ((x % width) + width) % width;
  else if (x < 0 || x >= width) return undefined;
  return state.map.tiles[y * width + x];
}

function score(y: Partial<Yields>, plot: number): Entry {
  let other = 0;
  for (const k of KEYS) other += (k === 'gold' ? 1 : 2) * Math.trunc(y[k] ?? 0);
  return { plot, food: Math.trunc(y.food ?? 0), fav: 0, other };
}

function better(cand: Cell, old: Cell, need: number): boolean {
  if (old.food < need && cand.food >= need) return true;
  if (cand.fav !== old.fav) return cand.fav > old.fav;
  return cand.other > old.other;
}

/** Place `n` citizens the city holds unassigned beside the ones working (its
 *  locked plots and its specialist pins); the plots taken are locked and the
 *  slots pinned. */
export function placeCitizens(state: GameState, city: City, n: number): void {
  if (n <= 0) return;
  const centre = state.map.tiles[city.centerIndex];
  const pins = PLACEABLE_DISTRICTS.map((_, i) => Math.max(0, city.specialistPref?.[i] ?? 0));
  city.specialistPref = pins;
  city.idleCitizens = n;
  const need = Math.max(0, -Math.floor(computeCityStats(state, city).foodSurplus));
  const ctx = cityYieldCtx(state, city);
  const bonus = cityPlotBonus(state, city);
  const slots = citySpecialistSlots(state, city);
  const entries: Entry[] = [];
  for (const [dq, dr] of HEXSPACE) {
    const t = hexPlot(state, centre, dq, dr);
    if (!t || t.index === city.centerIndex || !tileBelongsTo(t, city)) continue;
    const di = t.district ? city.districts.find((d) => d.tileIndex === t.index) : undefined;
    if (di) {
      const pi = PLACEABLE_DISTRICTS.indexOf(di.type);
      const y = specialistYields(di.type, city.buildings);
      const free = (slots.get(t.index) ?? 0) - (pi >= 0 ? pins[pi] : 0);
      if (!y || pi < 0) continue;
      for (let k = 0; k < free; k++) entries.push(score(y, t.index));
      continue;
    }
    if (t.district || t.builtWonder || t.locked) continue;
    const y = tileYields(ctx, t);
    bonus(t, false, y);
    if (!KEYS.some((k) => y[k] > 0)) continue;
    entries.push(score(y, t.index));
  }
  let row: Cell[] = Array.from({ length: n + 1 }, () => ({ food: 0, fav: 0, other: 0, picks: [] }));
  for (const e of entries) {
    const next: Cell[] = [row[0]];
    for (let k = 1; k <= n; k++) {
      const p = row[k - 1];
      const cand: Cell = { food: p.food + e.food, fav: p.fav + e.fav, other: p.other + e.other, picks: [...p.picks, e.plot] };
      next.push(better(cand, row[k], need) ? cand : row[k]);
    }
    row = next;
  }
  let placed = 0;
  for (const q of row[n].picks) {
    const t = state.map.tiles[q];
    const di = t.district ? city.districts.find((d) => d.tileIndex === q) : undefined;
    if (di) pins[PLACEABLE_DISTRICTS.indexOf(di.type)] += 1;
    else t.locked = true;
    placed += 1;
  }
  city.idleCitizens = n - placed > 0 ? n - placed : undefined;
}

/** Re-place every citizen of the city (a citizen lost: 0x194fb0 with a
 *  negative count unassigns all, then places them all). */
export function replaceAllCitizens(state: GameState, city: City): void {
  for (const t of state.map.tiles) if (t.locked && tileBelongsTo(t, city)) t.locked = false;
  city.specialistPref = PLACEABLE_DISTRICTS.map(() => 0);
  city.idleCitizens = undefined;
  placeCitizens(state, city, city.population);
}
