
import type { City, DistrictId, GameMap, GameState, ImprovementId, Tile } from './types';
import { hexDistance, neighbors } from '../../world/hex';
import { isWater, isImpassable, isMountain, isCoastalWater, hasRiver } from '../../world/query';
import { computeUnlocks, isTechComplete, isCivicComplete, type Unlocks } from './effects';
import { isExplored } from './fog';
import { tileAppeal } from './appeal'; // B-27 (#71): SEASIDE_RESORT gates on appeal
import { SEASIDE_RESORT_MIN_APPEAL } from '../data/improvements';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS, type BuildingDef, buildingsForDistrict } from '../data/buildings';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { CITY_MIN_DIST } from '../../world/types';
import { CITY_WORK_RADIUS, maxSpecialtyDistricts } from '../data/constants';
import { allCities, citiesOf, seatOf, tileBelongsTo, tileClaimed, tileSeat } from './seats';

export interface RuleResult {
  ok: boolean;
  reason?: string;
}

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

function gates(state: GameState, seat: number): Unlocks | null {
  return state.sandbox ? null : computeUnlocks(state, seat);
}


/**
 * May `seat` found a city on this tile? ONE rule, asked per seat.
 *
 * The city cap is SIX for every seat (fixed GPU slots), spacing is a flat
 * CITY_MIN_DIST from EVERY existing centre — own, foreign or city-state — and
 * foreign territory is closed. A refused planned site drops while the settler
 * stays banked, mirroring the GPU's site consumption.
 */
export function canFoundCity(state: GameState, tileIndex: number, seat: number): RuleResult {
  const tile = state.map.tiles[tileIndex];
  if (citiesOf(state, seat).length >= 6) return no('Cannot govern more cities (6 max).');
  if (!isExplored(state, seat, tileIndex)) return no('Unexplored — send a unit to scout it first.');
  if (isWater(tile)) return no('Cities must be founded on land.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.wonder) return no('Cannot settle on a natural wonder.');
  if (tile.feature === 'OASIS') return no('Cannot settle on an oasis.');
  if (tile.district) return no('Tile already occupied.');
  if (tileClaimed(tile) && tileSeat(tile) !== seat) return no('Foreign territory.');
  for (const c of allCities(state)) {
    const centre = state.map.tiles[c.centerIndex];
    if (hexDistance(centre.col, centre.row, tile.col, tile.row) < CITY_MIN_DIST) {
      return no(`Too close to ${c.name} (min ${CITY_MIN_DIST} tiles).`);
    }
  }
  for (const cityState of state.cityStates ?? []) {
    const centre = state.map.tiles[cityState.centerIndex];
    if (hexDistance(centre.col, centre.row, tile.col, tile.row) < CITY_MIN_DIST) {
      return no(`Too close to the city-state of ${cityState.name}.`);
    }
  }
  return ok;
}


export function validImprovementsIn(
  tile: Tile,
  opts: {
    unlocks: Unlocks | null;
    ownsTile: (t: Tile) => boolean;
    map?: GameMap;
    builder?: string;
  },
): ImprovementId[] {
  if (!opts.ownsTile(tile)) return []; // must be inside the owner's borders
  // gate-catch (rng 2026006080 t246): builtWonder tiles are PAVED — an
  // in-flight wonder pave refuses improvements exactly like a district pave
  // (real Civ 6).
  if (tile.district || tile.wonder || tile.builtWonder || isImpassable(tile)) return [];

  const unlocks = opts.unlocks;
  const unlocked = (imp: ImprovementId) => !unlocks || unlocks.improvements.has(imp);

  // A MILITARY ENGINEER builds ONLY military improvements. Its
  // sourced Civ 6 build list is Fort / Airstrip / Missile Silo / Mountain
  // Tunnel / Reinforced Barricade / Modernized Trap (plus spending a charge on
  // a Canal/Dam/Aqueduct/Flood Barrier) — no Farm, Mine, Camp or Plantation.
  // Only the FORT of that list exists in this model. Without the guard an
  // engineer would be offered a Farm, and — because FORT carries `yields: {}`
  // and therefore
  // scores a flat 0 delta — the best-delta chooser would have picked the Farm
  // every time, so an engineer could never have built the one thing it exists
  // to build. Resource tiles return their own improvement below, which an
  // engineer must not get either, so this sits ABOVE that early return.
  if (opts.builder === 'MILITARY_ENGINEER') {
    if (isWater(tile) || !unlocked('FORT')) return [];
    return tile.improvement ? [] : ['FORT'];
  }
  if (tile.resource) {
    const imp = RESOURCES[tile.resource].improvement;
    return unlocked(imp) ? [imp] : [];
  }
  if (isWater(tile)) return [];

  const out: ImprovementId[] = [];
  const flat = tile.elevation === 'FLAT';
  const hills = tile.elevation === 'HILLS';
  const hillFarmsOk = !unlocks || unlocks.hillFarms;

  if (
    unlocked('FARM') &&
    ((tile.feature === null &&
      (tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS') &&
      (flat || (hills && hillFarmsOk))) ||
      tile.feature === 'FLOODPLAINS')
  ) {
    out.push('FARM');
  }
  if (unlocked('MINE') && hills && tile.feature === null) out.push('MINE');
  // FORT — Military Engineer only, and only on open ground. Real
  // Civ 6 allows it on any passable land tile the owner holds; the district /
  // wonder / impassable paves are already refused above, and a resource tile
  // returns early with its own improvement, so nothing more is needed here.
  if (unlocked('LUMBER_MILL') && tile.feature === 'WOODS') out.push('LUMBER_MILL');
  // SEASIDE RESORT — real Civ 6: a FLAT COASTAL Grassland/Plains/
  // Desert tile with BREATHTAKING appeal (>= 4). Needs the map (coast
  // adjacency + appeal), so callers that pass none simply never offer it —
  // a safe default, not a silent rule change.
  if (
    unlocked('SEASIDE_RESORT') &&
    opts.map &&
    flat &&
    tile.feature === null &&
    (tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS' || tile.terrain === 'DESERT') &&
    neighbors(opts.map, tile).some((n) => n.terrain === 'COAST') &&
    tileAppeal(opts.map, tile) >= SEASIDE_RESORT_MIN_APPEAL
  ) {
    out.push('SEASIDE_RESORT');
  }
  return out;
}

export function validImprovements(state: GameState, tile: Tile, seat: number): ImprovementId[] {
  return validImprovementsIn(tile, {
    unlocks: gates(state, seat),
    ownsTile: (t) => tileSeat(t) === seat,
    map: state.map, // B-27 (#71): SEASIDE_RESORT needs coast adjacency + appeal
  });
}

export function canRemoveFeature(state: GameState, tile: Tile, seat: number): RuleResult {
  if (!tile.feature) return no('No feature here.');
  const def = FEATURES[tile.feature];
  if (!def.removable) return no(`${def.name} cannot be removed.`);
  if (tile.resource) {
    const res = RESOURCES[tile.resource];
    if (res.requiresFeature?.includes(tile.feature)) {
      return no(`${res.name} depends on the ${def.name}.`);
    }
  }
  const unlocks = gates(state, seat);
  if (unlocks && !unlocks.featureRemovals.has(tile.feature)) {
    return no(`Removing ${def.name} requires further research.`);
  }
  return ok;
}


export function canPlaceDistrictIn(
  state: GameState,
  city: City,
  type: DistrictId,
  tileIndex: number,
  opts: { unlocks: Unlocks | null; ownsTile: (t: Tile) => boolean },
): RuleResult {
  const map = state.map;
  const def = DISTRICTS[type];
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  const unlocks = opts.unlocks;
  if (unlocks && type !== 'CITY_CENTER' && !unlocks.districts.has(type)) {
    return no(`${def.name} requires research.`);
  }

  if (!opts.ownsTile(tile)) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0) return no('City center occupies this tile.');
  if (dist > CITY_WORK_RADIUS) return no('Too far from the city center.');
  if (tile.district) return no('Another district is here.');
  if (tile.builtWonder) return no('A wonder occupies this tile.');
  if (tile.wonder) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.feature === 'FLOODPLAINS') return no('Districts cannot be built on floodplains.');
  if (tile.feature === 'OASIS') return no('Districts cannot be built on an oasis.');

  if (def.placement.onCoastalWater) {
    if (!isCoastalWater(map, tile)) return no('Must be on coast/lake water adjacent to land.');
  } else if (isWater(tile)) {
    return no('Must be on land.');
  }

  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  if (!def.allowMultiple && city.districts.some((d) => d.type === type)) {
    return no(`${def.name} already exists in this city.`);
  }
  if (def.countsTowardLimit) {
    const specialty = city.districts.filter((d) => DISTRICTS[d.type].countsTowardLimit).length;
    if (specialty >= maxSpecialtyDistricts(city.population)) {
      return no(`Needs more population (${specialty}/${maxSpecialtyDistricts(city.population)} district slots used).`);
    }
  }

  const around = neighbors(map, tile);
  if (def.placement.requiresAdjacentCityCenter) {
    if (!around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Must be adjacent to the City Center.');
    }
  }
  if (def.placement.requiresWaterSourceOrMountain) {
    const sourced =
      hasRiver(tile) ||
      around.some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n));
    if (!sourced) return no('Needs an adjacent river, lake, oasis or mountain.');
  }
  if (def.placement.notAdjacentToCityCenter) {
    if (around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Cannot be adjacent to the City Center.');
    }
  }
  return ok;
}

export function canPlaceDistrict(
  state: GameState,
  city: City,
  type: DistrictId,
  tileIndex: number,
): RuleResult {
  return canPlaceDistrictIn(state, city, type, tileIndex, {
    unlocks: gates(state, city.seat),
    ownsTile: (t) => tileBelongsTo(t, city),
  });
}

export function districtPlacementTiles(state: GameState, city: City, type: DistrictId): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (!tileBelongsTo(t, city)) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceDistrict(state, city, type, t.index).ok) out.push(t.index);
  }
  return out;
}


/**
 * Buildings the city could queue right now (research-gated). Districts under
 * construction count (queue-ahead, like Civ 6) — a chain prerequisite is
 * satisfied by an owned OR already-queued building; the turn loop refuses to
 * finish a building before its district/prereqs exist.
 */
export function availableBuildings(state: GameState, city: City): BuildingDef[] {
  const map = state.map;
  const unlocks = gates(state, city.seat);
  const placed = new Set(city.districts.map((d) => d.type));
  const queued = new Set(
    city.queue.filter((q) => q.kind === 'building').map((q) => (q.kind === 'building' ? q.building : '')),
  );
  const have = new Set(city.buildings);
  const center = map.tiles[city.centerIndex];

  const out: BuildingDef[] = [];
  for (const type of placed) {
    for (const def of buildingsForDistrict(type)) {
      if (have.has(def.id) || queued.has(def.id)) continue;
      if (def.worship) {
        if (seatOf(state, city.seat)?.religion.worship !== def.id) continue;
      } else if (unlocks && !unlocks.buildings.has(def.id)) {
        continue;
      }
      if (def.requiresAny && !def.requiresAny.some((r) => have.has(r) || queued.has(r))) continue;
      if (def.exclusiveWith?.some((x) => have.has(x) || queued.has(x))) continue;
      if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
      out.push(def);
    }
  }
  return out;
}

export function buildingCompletable(state: GameState, city: City, buildingId: string): boolean {
  const def = BUILDINGS[buildingId];
  if (!def) return false;
  const districtDone = city.districts.some(
    (d) => d.type === def.district && state.map.tiles[d.tileIndex].districtComplete,
  );
  if (!districtDone) return false;
  if (def.requiresAny && !def.requiresAny.some((r) => city.buildings.includes(r))) return false;
  return true;
}

export function buildingDef(id: string): BuildingDef {
  return BUILDINGS[id];
}


export function wonderExists(state: GameState, wonderId: string): boolean {
  return state.map.tiles.some((t) => t.builtWonder === wonderId);
}

export function canPlaceWonder(
  state: GameState,
  city: City,
  wonderId: string,
  tileIndex: number, seat: number): RuleResult {
  const def = BUILT_WONDERS[wonderId];
  if (!def) return no('No such wonder.');
  const map = state.map;
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  if (!state.sandbox) {
    if (def.requiresTech && !isTechComplete(state, def.requiresTech, seat)) {
      return no(`${def.name} requires research.`);
    }
    if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) {
      return no(`${def.name} requires a civic.`);
    }
  }
  if (wonderExists(state, wonderId)) return no(`${def.name} already exists in the world.`);

  if (!tileBelongsTo(tile, city)) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0 || dist > CITY_WORK_RADIUS) return no('Must be within 3 tiles of the city center.');
  if (tile.district || tile.builtWonder) return no('Tile already occupied.');
  if (tile.wonder) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  const p = def.placement;
  if (p.onCoastalWater) {
    if (!isCoastalWater(map, tile)) return no('Must be on coast/lake water adjacent to land.');
  } else {
    if (isWater(tile)) return no('Must be on land.');
    if (tile.feature === 'FLOODPLAINS' && !p.allowFloodplains) {
      return no('Cannot be built on floodplains.');
    }
    if (tile.feature === 'OASIS') return no('Cannot be built on an oasis.');
    if (p.terrains && !p.terrains.includes(tile.terrain)) {
      return no(`Requires ${p.terrains.join('/')} terrain.`);
    }
    if (p.flatOnly && tile.elevation !== 'FLAT') return no('Requires flat land.');
    if (p.hillsOnly && tile.elevation !== 'HILLS') return no('Requires hills.');
  }
  if (p.requiresRiver && !hasRiver(tile)) return no('Must be adjacent to a river.');

  const around = neighbors(map, tile);
  if (p.adjacentDistrict) {
    const okAdj = around.some((n) => n.district === p.adjacentDistrict && n.districtComplete);
    if (!okAdj) return no(`Must be adjacent to a completed ${DISTRICTS[p.adjacentDistrict].name}.`);
  }
  if (p.adjacentResource) {
    if (!around.some((n) => n.resource === p.adjacentResource)) {
      return no(`Must be adjacent to ${p.adjacentResource.toLowerCase()}.`);
    }
  }
  return ok;
}

export function wonderPlacementTiles(state: GameState, city: City, wonderId: string): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (!tileBelongsTo(t, city)) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceWonder(state, city, wonderId, t.index, 0).ok) out.push(t.index);
  }
  return out;
}

export function availableWonders(state: GameState, city: City, seat: number): BuiltWonderDef[] {
  return Object.values(BUILT_WONDERS).filter((def) => {
    if (wonderExists(state, def.id)) return false;
    if (!state.sandbox) {
      if (def.requiresTech && !isTechComplete(state, def.requiresTech, seat)) return false;
      if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) return false;
    }
    return wonderPlacementTiles(state, city, def.id).length > 0;
  });
}
