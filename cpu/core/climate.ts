/**
 * THE CLIMATE ARC — what a seat emits, what the world does about it.
 *
 * The accounting runs in RAW carbon units, which is what
 * `cpu/data/climate.ts` sources; Civ 6's own screens divide by 1000 before
 * showing a number, and nothing here does.
 */

import type { GameState, City } from './types';
import type { GameMap, Tile } from '../../world/types';
import { clearableFeatures } from '../../world/features';
import { isWater } from '../../world/query';
import { neighbors } from '../../world/hex';
import { BUILDINGS, POWER_PLANT_IDS } from '../data/buildings';
import { STRATEGIC_IDS } from '../data/constants';
import {
  CARBON_PER_POWER, UNIT_CARBON_SHARE, UNIT_CARBON_RESOURCE_SHARE,
  ADVANCED_POWER_CELLS_SHARE, ADVANCED_POWER_CELLS_TECH,
  CLIMATE_PHASES, CO2_PER_POINT, LOWLAND_MAX_BAND, FLOOD_BARRIER_PER_TILE,
  climatePhase, deforestationModifier, pollutionPoints,
  FAVOR_PER_POLLUTION_OVER, FAVOR_POLLUTION_CAP,
} from '../data/climate';
import { citiesOf, seatOf } from './seats';

/** Whether this seat's units emit at the reduced rate. */
export function powerCells(state: GameState, seat: number): boolean {
  return !!seatOf(state, seat)?.research.techs.includes(ADVANCED_POWER_CELLS_TECH);
}

const CLEARABLE = clearableFeatures();

/**
 * The raw carbon a single unit of each strategic resource carries, by
 * stockpile slot. A power plant's `fuelRate` is its Power-per-resource, so
 * this is the page's own "(Amount of Power generated per unit of resource)
 * times (Amount of carbon emitted per unit of Power)". A slot no plant burns
 * emits nothing.
 */
export const CARBON_PER_RESOURCE: number[] = STRATEGIC_IDS.map((id) => {
  for (const b of POWER_PLANT_IDS) {
    const def = BUILDINGS[b];
    if (def?.fuel === id && def.fuelRate) return def.fuelRate * (CARBON_PER_POWER[id] ?? 0);
  }
  return 0;
});

/**
 * A tile's COASTAL LOWLAND band, or 0. Multi-source BFS out from the water,
 * over FLAT land only: the shoreline is band 1 and drowns first, the ring
 * behind it band 2, then 3. See `LOWLAND_MAX_BAND` for why the runtime map
 * cannot use elevation for this.
 */
export function deriveLowlands(map: GameMap): void {
  const band = new Int8Array(map.tiles.length);
  let front: Tile[] = map.tiles.filter((t) => isWater(t));
  for (let d = 1; d <= LOWLAND_MAX_BAND && front.length; d++) {
    const next: Tile[] = [];
    for (const t of front) {
      for (const n of neighbors(map, t)) {
        if (band[n.index] || isWater(n) || n.elevation !== 'FLAT') continue;
        band[n.index] = d;
        next.push(n);
      }
    }
    front = next;
  }
  for (const t of map.tiles) t.lowland = band[t.index] || undefined;
}

/** Every removable feature standing on the map right now. */
export function standingRemovable(map: GameMap): number {
  let n = 0;
  for (const t of map.tiles) if (t.feature && CLEARABLE.includes(t.feature)) n += 1;
  return n;
}

/**
 * CIV6: "the deforestation level is a percentage of number of features
 * cleared ... versus the total number of removable features on the entire
 * map". The start count is stamped at creation, so every removal path counts
 * — a chop, a volcano, a storm — without a counter to keep.
 */
export function deforestationLevel(state: GameState): number {
  const total = state.removableAtStart ?? 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (total - standingRemovable(state.map)) / total));
}

/** Add raw carbon to a seat's lifetime total. CIV6 (Carbon Recapture) lets
 *  the total go BELOW zero, so nothing clamps here. */
export function emitCarbon(state: GameState, seat: number, raw: number): void {
  const s = seatOf(state, seat);
  if (!s || raw === 0) return;
  s.co2 = (s.co2 ?? 0) + raw;
}

/** What a plant discharges for burning `units` of its fuel to make Power. */
export function plantCarbon(fuel: string, rate: number, units: number): number {
  return units * rate * (CARBON_PER_POWER[fuel] ?? 0);
}

/** What one unit's per-turn resource draw discharges: half a plant's rate per
 *  resource, over half a resource unit, halved again once the seat holds
 *  Advanced Power Cells. */
export function unitCarbon(slot: number, upkeep: number, cells: boolean): number {
  const share = cells ? ADVANCED_POWER_CELLS_SHARE : 1;
  return upkeep * UNIT_CARBON_RESOURCE_SHARE * (CARBON_PER_RESOURCE[slot] ?? 0)
    * UNIT_CARBON_SHARE * share;
}

/** The world's lifetime carbon, every seat together, adjusted by how much of
 *  the map has been cleared. CIV6: "the current global level of CO2, adjusted
 *  by deforestation level". */
export function worldCarbon(state: GameState): number {
  let raw = 0;
  for (const s of state.seats) raw += s.co2 ?? 0;
  return raw * (1 + deforestationModifier(deforestationLevel(state)));
}

/** Climate Change points for a carbon total. */
export function climatePoints(state: GameState): number {
  return Math.floor(Math.max(0, worldCarbon(state)) / CO2_PER_POINT);
}

/** The lowland bands the sea has already taken, 0..LOWLAND_MAX_BAND — the
 *  "flood level" the Flood Barrier prices itself against. */
export function floodLevel(state: GameState): number {
  let lvl = 0;
  for (let p = 0; p <= (state.climateIdx ?? -1); p++) {
    lvl = Math.max(lvl, CLIMATE_PHASES[p].flood, CLIMATE_PHASES[p].submerge);
  }
  return lvl;
}

/** The lowland tiles a city holds — what a Flood Barrier costs and covers. */
export function cityLowlands(state: GameState, city: City): Tile[] {
  return state.map.tiles.filter((t) => t.ownerCity === city.id && t.ownerSeat === city.seat && t.lowland);
}

/** CIV6 (Flood Barrier): "(80 x coastal lowland tiles) + (80 x coastal
 *  lowland tiles x flood level)". */
export function floodBarrierCost(state: GameState, city: City): number {
  const n = cityLowlands(state, city).length;
  return FLOOD_BARRIER_PER_TILE * n * (1 + floodLevel(state));
}

function barrierAt(state: GameState, tile: Tile): boolean {
  if (tile.ownerSeat < 0 || tile.ownerCity < 0) return false;
  const city = citiesOf(state, tile.ownerSeat).find((c) => c.id === tile.ownerCity);
  return !!city?.buildings.includes('FLOOD_BARRIER');
}

function floodLowland(tile: Tile): void {
  if (tile.flooded) return;
  tile.flooded = true;
  tile.pillaged = true;
  if (tile.district) tile.districtPillaged = true;
}

/** CIV6: a Flood Barrier built late "can be repaired in full and used again,
 *  along with anything that's on them. Does not affect submerged tiles". */
export function repairBehindBarrier(state: GameState, city: City): void {
  for (const t of cityLowlands(state, city)) {
    if (!t.flooded) continue;
    t.flooded = false;
    t.pillaged = false;
    t.districtPillaged = false;
  }
}

function meltIce(state: GameState, fraction: number): void {
  const total = state.iceAtStart ?? 0;
  const target = Math.floor(total * fraction);
  let gone = total - state.map.tiles.filter((t) => t.feature === 'ICE').length;
  if (gone >= target) return;
  // ascending tile index, so both engines melt the SAME floes
  for (const t of state.map.tiles) {
    if (gone >= target) break;
    if (t.feature !== 'ICE') continue;
    t.feature = null;
    gone += 1;
  }
}

/**
 * The world's climate turn: bank the emissions into points, and if that moved
 * the phase, apply every phase crossed. CIV6: "It is not possible to revert
 * climate change to an earlier phase."
 */
export function climateTurn(state: GameState): void {
  const now = climatePhase(climatePoints(state));
  const was = state.climateIdx ?? -1;
  if (now <= was) return;
  for (let p = was + 1; p <= now; p++) {
    const ph = CLIMATE_PHASES[p];
    state.climateIdx = p;
    meltIce(state, ph.iceMelt);
    if (ph.flood > 0) {
      for (const t of state.map.tiles) {
        if (t.lowland === ph.flood && !barrierAt(state, t)) floodLowland(t);
      }
    }
    state.eventLog.push(
      `Climate phase ${p + 1}: sea level +${ph.seaLevel.toFixed(1)}m, ${Math.round(ph.iceMelt * 100)}% of the polar ice gone.`,
    );
  }
}

/**
 * CIV6 (Losing Favor): "-1/turn for every 3 pollution points higher than
 * average. This penalty caps at 20." The average is over the MAJORS whose
 * emissions the world can see — every live seat, itself included, which is
 * what makes a lone polluter's own figure drag its own average up.
 */
export function pollutionFavorPenalty(state: GameState, seat: number): number {
  const live = state.seats;
  if (!live.length) return 0;
  const mine = pollutionPoints(seatOf(state, seat)?.co2 ?? 0);
  let sum = 0;
  for (const s of live) sum += pollutionPoints(s.co2 ?? 0);
  const avg = sum / live.length;
  const over = mine - avg;
  if (over <= 0) return 0;
  return Math.min(FAVOR_POLLUTION_CAP, Math.floor(over / FAVOR_PER_POLLUTION_OVER));
}

/** Whether the world still fertilizes after a storm or a flood. */
export function fertilityLive(state: GameState): boolean {
  const p = state.climateIdx ?? -1;
  return p < 0 || CLIMATE_PHASES[p].fertility;
}

/** Whether storms and droughts now strip the ground to desert. */
export function desertificationLive(state: GameState): boolean {
  const p = state.climateIdx ?? -1;
  return p >= 0 && CLIMATE_PHASES[p].desertification;
}

/** CIV6 (Phase V+): "all Storms and Droughts now start removing fertility
 *  from tiles instead of adding it" — the same silt the earlier phases laid
 *  down, taken back off the same tiles. */
export function defertilize(tile: Tile): void {
  if (isWater(tile) || tile.elevation === 'MOUNTAIN') return;
  tile.fertility = Math.max(0, tile.fertility - 1);
  tile.fertilityProd = Math.max(0, tile.fertilityProd - 1);
}
