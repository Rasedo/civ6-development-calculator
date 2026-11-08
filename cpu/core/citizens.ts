/**
 * THE GAME'S CITIZEN MANAGER (City_Citizens.cpp, GameCore_XP2): `placeCitizens`
 * puts `n` unassigned citizens beside the ones already working, the way
 * 0x197230 does; `replaceAllCitizens` re-places them all (0x196320) beside
 * the ones the player forced (`Tile.forced`, `City.specialistForced`;
 * `toggleCitizen` is the player's click). The city-states place by it
 * (`minorPlaceCitizens`), the H-1 steps too.
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
 * The favored and disfavored yields (`YieldFlags`) are the city's as the
 * record carries them: one letter per yield in the Yields order, F favored,
 * D disfavored, . neither; none where the record holds no flags.
 */
import type { City, GameState, Tile, Yields } from './types';
import { citySpecialistSlots, cityPlotBonus, cityYieldCtx, computeCityStats, specialistYields } from './city';
import { tileYields } from './yields';
import { tileBelongsTo } from './seats';
import { PLACEABLE_DISTRICTS } from '../data/districts';

/** the DLL's hexspace order, axial (dq, dr) from the centre */
const HEXSPACE: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 2], [1, 1], [2, 0], [2, -1], [2, -2], [1, -2], [0, -2],
  [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 3], [1, 2], [2, 1], [3, 0], [3, -1], [3, -2], [3, -3], [2, -3],
  [1, -3], [0, -3], [-1, -2], [-2, -1], [-3, 0], [-3, 1], [-3, 2], [-3, 3], [-2, 3], [-1, 3],
];
export const YIELD_KEYS: readonly (keyof Yields)[] = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

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

/** a city's favored / disfavored yields: one letter per yield in the Yields
 *  order (food, production, gold, science, culture, faith) */
export type YieldFlags = string;

/** a city's yield flags: Food favored where its focus set it, else none */
export const cityFlags = (c: { favoredFood?: boolean }): YieldFlags => (c.favoredFood ? 'F.....' : '');

function score(y: Partial<Yields>, plot: number, flags: YieldFlags): Entry {
  let fav = 0;
  let other = 0;
  YIELD_KEYS.forEach((k, i) => {
    if (flags[i] === 'D') return;
    const v = (k === 'gold' ? 1 : 2) * Math.trunc(y[k] ?? 0);
    if (flags[i] === 'F') fav += v;
    else other += v;
  });
  return { plot, food: Math.trunc(y.food ?? 0), fav, other };
}

function better(cand: Cell, old: Cell, need: number): boolean {
  if (old.food < need && cand.food >= need) return true;
  if (cand.fav !== old.fav) return cand.fav > old.fav;
  return cand.other > old.other;
}

/** Place `n` citizens the city holds unassigned beside the ones working (its
 *  locked plots and its specialist pins); the plots taken are locked and the
 *  slots pinned. */
export function placeCitizens(state: GameState, city: City, n: number, flags: YieldFlags = ''): void {
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
      // the entries: the capacity less the workers, the forced ones among
      // them, and the forced ones again (0x197230 at 0x19749f..0x197523)
      const free = (slots.get(t.index) ?? 0) - (pi >= 0 ? pins[pi] + (city.specialistForced?.[pi] ?? 0) : 0);
      if (!y || pi < 0) continue;
      for (let k = 0; k < free; k++) entries.push(score(y, t.index, flags));
      continue;
    }
    if (t.district || t.builtWonder || t.locked) continue;
    const y = tileYields(ctx, t);
    bonus(t, false, y);
    if (!YIELD_KEYS.some((k) => y[k] > 0)) continue;
    entries.push(score(y, t.index, flags));
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

/** The city's hexspace plots in the DLL's order (the citizens object's plot
 *  vectors are indexed so: 0x5ce10). */
function hexspacePlots(state: GameState, city: City): Tile[] {
  const centre = state.map.tiles[city.centerIndex];
  const out: Tile[] = [];
  for (const [dq, dr] of HEXSPACE) {
    const t = hexPlot(state, centre, dq, dr);
    if (t) out.push(t);
  }
  return out;
}

/** The FORCED citizens of the city (the citizens object's forced counts,
 *  +0x20, a count per hexspace plot): a plot's `Tile.forced`, a district
 *  plot's the city's `specialistForced` for the district's type. Each plot's
 *  forced count and its capacity (0x195940: 0 on the centre and on a plot not
 *  the city's, a district's specialist slots, 0 on a wonder's plot or where
 *  no yield is above 0, else 1), in hexspace order. */
function forcedPlots(state: GameState, city: City): { t: Tile; pi: number; f: number; cap: number }[] {
  const ctx = cityYieldCtx(state, city);
  const bonus = cityPlotBonus(state, city);
  const slots = citySpecialistSlots(state, city);
  const out: { t: Tile; pi: number; f: number; cap: number }[] = [];
  for (const t of hexspacePlots(state, city)) {
    // another city's plot holds none of this city's citizens
    if (!tileBelongsTo(t, city)) continue;
    const di = t.district ? city.districts.find((d) => d.tileIndex === t.index) : undefined;
    const pi = di ? PLACEABLE_DISTRICTS.indexOf(di.type) : -1;
    const f = di ? (pi >= 0 ? city.specialistForced?.[pi] ?? 0 : 0) : !t.district && t.forced ? 1 : 0;
    let cap = 0;
    if (di) cap = slots.get(t.index) ?? 0;
    else if (t.index !== city.centerIndex && !t.district && !t.builtWonder) {
      const y = tileYields(ctx, t);
      bonus(t, false, y);
      cap = YIELD_KEYS.some((k) => y[k] > 0) ? 1 : 0;
    }
    out.push({ t, pi, f, cap });
  }
  return out;
}

function setForced(city: City, e: { t: Tile; pi: number }, f: number): void {
  if (e.pi >= 0) (city.specialistForced ??= PLACEABLE_DISTRICTS.map(() => 0))[e.pi] = f;
  if (e.pi < 0 && f > 0) e.t.forced = true;
  else delete e.t.forced;
}

/** Re-place every citizen of the city (0x196320; a citizen lost: 0x194fb0
 *  with a negative count). The unassign (0x196440) keeps the FORCED
 *  citizens: each plot's forced count is cut to its capacity (a district
 *  type's to its slots, none where the city has no such district), then,
 *  while more are forced than the city has citizens, cut in hexspace order;
 *  every other citizen is unassigned and placed again beside them
 *  (0x197230). */
export function replaceAllCitizens(state: GameState, city: City, flags: YieldFlags = ''): void {
  const held = city.specialistForced;
  if (held) {
    const slots = citySpecialistSlots(state, city);
    city.specialistForced = PLACEABLE_DISTRICTS.map((type, pi) => {
      const inst = city.districts.find((d) => d.type === type);
      return Math.min(held[pi], inst ? slots.get(inst.tileIndex) ?? 0 : 0);
    });
  }
  const plots = forcedPlots(state, city);
  let excess = -city.population;
  for (const e of plots) {
    e.f = Math.min(e.f, e.cap);
    excess += e.f;
  }
  for (const e of plots) {
    const cut = Math.min(e.f, Math.max(0, excess));
    e.f -= cut;
    excess -= cut;
  }
  for (const t of state.map.tiles) if (t.locked && tileBelongsTo(t, city)) t.locked = false;
  const pins = PLACEABLE_DISTRICTS.map(() => 0);
  let forced = 0;
  for (const e of plots) {
    setForced(city, e, e.f);
    forced += e.f;
    if (e.f <= 0) continue;
    if (e.pi >= 0) pins[e.pi] = e.f;
    else e.t.locked = true;
  }
  city.specialistPref = pins;
  city.idleCitizens = undefined;
  placeCitizens(state, city, city.population - forced, flags);
}

/** A plot's citizen TOGGLED by its city's player (0x1956b0, the city
 *  command's plot arm): with no citizen left beyond the ones forced on the
 *  city's other plots, nothing; else one more forced on the plot while it
 *  holds fewer than its capacity and a citizen is free, its forced ones
 *  released otherwise; then the full re-place. A plot outside the city's
 *  hexspace takes none. */
export function toggleCitizen(state: GameState, city: City, plot: Tile, flags: YieldFlags = ''): void {
  const plots = forcedPlots(state, city);
  const here = plots.find((e) => e.t === plot);
  if (!here) return;
  let budget = city.population;
  for (const e of plots) if (e !== here) budget -= e.f;
  if (budget <= 0) return;
  budget -= here.f;
  setForced(city, here, budget > 0 && here.f < here.cap ? here.f + 1 : 0);
  replaceAllCitizens(state, city, flags);
}
