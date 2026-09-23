import type { SeatEmitter } from './decideObs';
import type { City, DistrictId, GameState, Seat, Tile } from './types';
import { tilesWithin } from '../../world/hex';
import { CITY_WORK_RADIUS } from '../data/constants';
import { PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencyRule } from '../data/districts';
import { BUILT_WONDERS } from '../data/builtWonders';
import { UNITS } from '../data/units';
import { ENGINEER_LIVE, PRODUCTION_QUEUE_MAX } from '../data/seats';
import { DISTRICT_ADJ_ROWS, rowIsFor } from '../data/civilizations';
import { campTiles, citiesOf, hiddenResourcesFor, seatOf, tileCity, tileOwnedByCiv } from './seats';
import { computeUnlocks, getModifiers } from './effects';
import { availableBuildings, canBuildRoad, validImprovementsIn } from './rules';
import { trainableUnits } from './units';
import { availableProjects, engineerFinishCity } from './game';
import { citySpecialistSlots, resourcePriority, swapTileOk, workableTiles } from './city';
import { buildingVariantAdjacency, districtAdjacency } from './yields';
import { prodLayout } from './prodLayout';
import { districtSiteLegal, formationOrderOk, wonderSite } from './phase';

/**
 * THE CITY ROWS (production, district sites, citizens, swaps).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */

export interface CityObs {
  centre: number;
  isCapital: boolean;
  pop: number;
  settlerQueued: number;
  prodOpen: number[];
  distSites: number[][];
  specSlots: number[];
  specPin: number[];
  workTiles: number[][];
  swapFrom: number[][];
}

/** The seat holds a living unit of roster type `id`, or a city of its has
 *  one on order (a plain unit entry, at any depth). */
function heldOrQueued(state: GameState, seat: number, id: string): boolean {
  return state.units.some((u) => u.seat === seat && u.type === id)
    || citiesOf(state, seat).some((c) => c.queue.some((q) => q.kind === 'unit' && q.unit === id && !q.formation));
}

/** A Builder would find work somewhere: an owned tile that is pillaged,
 *  holds a pillaged district, or is bare and takes an improvement the seat
 *  has unlocked (the job plane the unit planner walks toward). */
function builderHasJob(state: GameState, seat: number): boolean {
  const owns = (t: Tile) => tileOwnedByCiv(t, seat);
  const unlocks = computeUnlocks(state, seat);
  const camps = campTiles(state);
  const hidden = hiddenResourcesFor(state, seat);
  return state.map.tiles.some((t) => owns(t)
    && (t.pillaged || t.districtPillaged
      || (!t.improvement && validImprovementsIn(t, { unlocks, ownsTile: owns, map: state.map, camps, hidden }).length > 0)));
}

/** A Military Engineer would find work somewhere: a road it may lay, an
 *  engineer improvement site, or a 20%-charge site. */
function engineerHasJob(state: GameState, seat: number): boolean {
  const owns = (t: Tile) => tileOwnedByCiv(t, seat);
  const unlocks = computeUnlocks(state, seat);
  const camps = campTiles(state);
  const hidden = hiddenResourcesFor(state, seat);
  return state.map.tiles.some((t) => canBuildRoad(t, owns)
    || validImprovementsIn(t, { unlocks, ownsTile: owns, map: state.map, camps, hidden, builder: 'MILITARY_ENGINEER' }).length > 0
    || engineerFinishCity(state, seat, t.index) !== undefined);
}

/** The seat-wide half of the unit columns: per roster unit that the combat
 *  rule does not decide, whether the seat may put one on order at all —
 *  a Builder while it holds none, none is on order and a job waits; the
 *  Military Engineer likewise; an Archaeologist while it holds none and none
 *  is on order; a Trader while none is on order; the siege support chassis
 *  whenever trainable. Undefined for every other unit: the combat rule. */
function unitGates(state: GameState, seat: number): Map<string, () => boolean> {
  const out = new Map<string, () => boolean>();
  let builder: boolean | undefined;
  let engineer: boolean | undefined;
  out.set('BUILDER', () => (builder ??= !heldOrQueued(state, seat, 'BUILDER') && builderHasJob(state, seat)));
  if (ENGINEER_LIVE) {
    out.set('MILITARY_ENGINEER', () => (engineer ??= !heldOrQueued(state, seat, 'MILITARY_ENGINEER') && engineerHasJob(state, seat)));
  }
  if (UNITS.ARCHAEOLOGIST) out.set('ARCHAEOLOGIST', () => !heldOrQueued(state, seat, 'ARCHAEOLOGIST'));
  for (const u of Object.values(UNITS)) {
    if (u.siegeSupport) out.set(u.id, () => true);
    if (u.trader) {
      const id = u.id;
      out.set(id, () => !citiesOf(state, seat).some((c) => c.queue.some((q) => q.kind === 'unit' && q.unit === id)));
    }
  }
  return out;
}

/** The plots district `id` may take in this city now, ascending — the
 *  record's district arm re-validates exactly these (`districtSiteLegal`). */
export function districtPlots(state: GameState, city: City, id: DistrictId): number[] {
  const unlocks = computeUnlocks(state, city.seat);
  const ctr = state.map.tiles[city.centerIndex];
  return tilesWithin(state.map, ctr.col, ctr.row, CITY_WORK_RADIUS)
    .map((t) => t.index)
    .filter((i) => districtSiteLegal(state, city, id, unlocks, i))
    .sort((a, b) => a - b);
}

/** The adjacency district `id` would earn on `tile` in this city, floored:
 *  its catalog rows, the roster's district rows of the seat and the city's
 *  unique-building rows — never a belief's or a card's, which pay the
 *  district and not the plot. 0 for a type with no adjacency yield. */
export function districtRankAdj(state: GameState, city: City, id: DistrictId, tile: Tile): number {
  const mods = getModifiers(state, city.seat);
  const extra: AdjacencyRule[] = [
    ...DISTRICT_ADJ_ROWS.filter((r) => r.district === id && rowIsFor(r, mods.civ, mods.leader))
      .map((r): AdjacencyRule => ({ source: r.source ?? 'DISTRICT', amount: r.amount })),
    ...buildingVariantAdjacency(mods.civ, city, id),
  ];
  return districtAdjacency(state.map, tile, id, extra);
}

/** The production columns this city may queue now (the production layout,
 *  `prodLayout`), ascending, with the plots of every open district column as
 *  [column, tile, adjacency]. Nothing while the queue has no room. Each
 *  column asks the body the record's arm re-validates against — buildings
 *  `availableBuildings`, a settler population 2, units `trainableUnits`
 *  (a combat chassis, or a civilian through `unitGates`), districts
 *  `districtSiteLegal`, wonders `wonderSite`, projects `availableProjects`,
 *  formations `formationOrderOk`. */
export function productionObs(
  state: GameState, actor: Seat, city: City, gates: Map<string, () => boolean>,
): { prodOpen: number[]; distSites: number[][] } {
  const open: number[] = [];
  const sites: number[][] = [];
  if (city.queue.length >= PRODUCTION_QUEUE_MAX) return { prodOpen: open, distSites: sites };
  const L = prodLayout();
  const bset = new Set(availableBuildings(state, city).map((b) => b.id));
  L.buildings.forEach((id, i) => { if (bset.has(id)) open.push(i); });
  if (city.population >= 2) open.push(L.settlerCol);
  open.push(L.idleCol);
  const trainable = new Set(trainableUnits(state, actor.seat, city).map((d) => d.id));
  L.units.forEach((id, i) => {
    if (!trainable.has(id)) return;
    const gate = gates.get(id);
    if (gate ? gate() : (UNITS[id]?.combat ?? 0) > 0) open.push(L.unitLo + i);
  });
  SCAFFOLD_DISTRICTS.forEach((d, si) => {
    const plots = districtPlots(state, city, d.id);
    if (plots.length === 0) return;
    const col = L.districtLo + si;
    open.push(col);
    for (const t of plots) sites.push([col, t, districtRankAdj(state, city, d.id, state.map.tiles[t])]);
  });
  L.wonders.forEach((id, i) => {
    const def = BUILT_WONDERS[id];
    if (def && wonderSite(state, actor, city, def)) open.push(L.wonderLo + i);
  });
  const pset = new Set(availableProjects(state, city).map((p) => p.id));
  L.projects.forEach((id, i) => { if (pset.has(id)) open.push(L.projectLo + i); });
  for (const tier of [1, 2] as const) {
    L.units.forEach((id, i) => {
      if (formationOrderOk(state, actor, city, id, tier)) open.push(L.formLo + (tier - 1) * L.NU + i);
    });
  }
  return { prodOpen: open, distSites: sites };
}

/** Per PLACEABLE_DISTRICTS index: the specialist slots the city's district
 *  of that type offers (`citySpecialistSlots`), and the citizens pinned
 *  into them, -1 where the automatic rule fills it. */
function specialistObs(state: GameState, city: City): { specSlots: number[]; specPin: number[] } {
  const slots = citySpecialistSlots(state, city);
  return {
    specSlots: PLACEABLE_DISTRICTS.map((type) => {
      const inst = city.districts.find((d) => d.type === type);
      return inst ? (slots.get(inst.tileIndex) ?? 0) : 0;
    }),
    specPin: PLACEABLE_DISTRICTS.map((_t, di) => city.specialistPref?.[di] ?? -1),
  };
}

/** Every plot the city may work as [tile, resource priority, locked], and
 *  every plot a sibling holds that it may claim (`swapTileOk`) as [tile,
 *  holder's centre, worked by any of the seat's cities, locked]; both
 *  ascending by tile. */
function citizenObs(state: GameState, city: City, worked: ReadonlySet<number>): { workTiles: number[][]; swapFrom: number[][] } {
  const workTiles = workableTiles(state, city)
    .map((t) => [t.index, resourcePriority(t), t.locked ? 1 : 0])
    .sort((a, b) => a[0] - b[0]);
  const siblings = citiesOf(state, city.seat);
  const ctr = state.map.tiles[city.centerIndex];
  const swapFrom: number[][] = [];
  for (const t of tilesWithin(state.map, ctr.col, ctr.row, CITY_WORK_RADIUS)) {
    if (!swapTileOk(state, city, t.index)) continue;
    const holder = siblings.find((c) => c.id === tileCity(t))!;
    swapFrom.push([t.index, holder.centerIndex, worked.has(t.index) ? 1 : 0, t.locked ? 1 : 0]);
  }
  swapFrom.sort((a, b) => a[0] - b[0]);
  return { workTiles, swapFrom };
}

/** The `cities` group: one row per living city of the seat, in array order. */
export function citiesObs(state: GameState, seat: number): CityObs[] {
  const actor = seatOf(state, seat);
  if (!actor) return [];
  const gates = unitGates(state, seat);
  const worked = new Set<number>();
  for (const c of actor.cities) for (const t of c.workedTiles ?? []) worked.add(t);
  return actor.cities.map((city) => ({
    centre: city.centerIndex,
    isCapital: city.isCapital,
    pop: city.population,
    settlerQueued: city.queue.filter((q) => q.kind === 'settler').length,
    ...productionObs(state, actor, city, gates),
    ...specialistObs(state, city),
    ...citizenObs(state, city, worked),
  }));
}

/** Registered once `cities` matches the GPU's field by field. */
export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  cities: citiesObs,
};

