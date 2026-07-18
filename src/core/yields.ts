/**
 * Yield computations: per-tile yields (terrain/feature/resource/improvement,
 * natural-wonder effects, tech boosts), district adjacency bonuses (with
 * policy multipliers) and building yields (regional + special cases).
 */

import { addYields, emptyYields, type GameState, type City, type Tile, type Yields, type DistrictId, type ImprovementId } from './types';
import { neighbors, hexDistance } from './hex';
import { isWater, isMountain, hasRiver } from './query';
import type { YieldCtx } from './effects';
import { TERRAINS, HILLS_YIELDS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { WONDERS } from '../data/wonders';
import { DISTRICTS, type AdjacencyRule } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { REGIONAL_RANGE } from '../data/constants';

/** Base terrain yields incl. hills (used for Torres del Paine doubling). */
function terrainYields(tile: Tile): Yields {
  const out = emptyYields();
  addYields(out, TERRAINS[tile.terrain].yields);
  if (tile.elevation === 'HILLS') addYields(out, HILLS_YIELDS);
  return out;
}

/** Raw yields of a tile in context (terrain + feature + resource + improvement + wonders + boosts). */
export function tileYields(ctx: YieldCtx, tile: Tile): Yields {
  const out = emptyYields();

  if (tile.wonder) {
    addYields(out, WONDERS[tile.wonder]?.tileYields ?? {});
    return out;
  }
  if (isMountain(tile)) return out;
  if (tile.district || tile.builtWonder) return out; // paved tiles don't produce tile yields

  addYields(out, terrainYields(tile));
  if (tile.feature) {
    const f = FEATURES[tile.feature];
    if (f.impassable) return emptyYields();
    addYields(out, f.yields);
    const beliefBonus = ctx.mods.featureYields[tile.feature];
    if (beliefBonus) addYields(out, beliefBonus);
  }
  if (tile.resource) addYields(out, RESOURCES[tile.resource].yields);

  if (tile.improvement && !tile.pillaged) {
    const imp = tile.improvement as ImprovementId;
    addYields(out, IMPROVEMENTS[imp].yields);
    const boost = ctx.mods.improvementYields[imp];
    if (boost) addYields(out, boost);
    if (tile.resource) {
      const cat = RESOURCES[tile.resource].category;
      for (const rule of ctx.mods.improvementOnResource) {
        if (rule.category === cat) addYields(out, rule.yields);
      }
    }
    if (imp === 'FARM' && ctx.mods.farmAdjTier > 0) {
      const adjFarms = neighbors(ctx.map, tile).filter((n) => n.improvement === 'FARM').length;
      if (adjFarms >= 2) out.food += ctx.mods.farmAdjTier;
    }
  }

  // Natural wonder adjacency bonuses
  for (const n of neighbors(ctx.map, tile)) {
    if (!n.wonder) continue;
    const w = WONDERS[n.wonder];
    if (!w) continue;
    if (w.adjacentYields) addYields(out, w.adjacentYields);
    if (w.doublesAdjacentTerrain) addYields(out, terrainYields(tile));
  }

  // Disaster legacy: fertility feeds, drought starves.
  if (tile.fertility > 0) out.food += tile.fertility;
  if (tile.droughtTurns > 0) out.food = Math.max(0, out.food - 1);
  return out;
}

function matchesAdjacency(rule: AdjacencyRule, neighbor: Tile): boolean {
  switch (rule.source) {
    case 'MOUNTAIN':
      return isMountain(neighbor) && !neighbor.wonder;
    case 'RAINFOREST':
      return neighbor.feature === 'RAINFOREST';
    case 'WOODS':
      return neighbor.feature === 'WOODS';
    case 'REEF':
      return neighbor.feature === 'REEF';
    case 'NATURAL_WONDER':
      return neighbor.wonder !== null;
    case 'BUILT_WONDER':
      return neighbor.builtWonder !== null && neighbor.builtWonderComplete;
    case 'DISTRICT':
      return neighbor.district !== null && neighbor.districtComplete;
    case 'CITY_CENTER':
      return neighbor.district === 'CITY_CENTER' && neighbor.districtComplete;
    case 'HARBOR_DISTRICT':
      return neighbor.district === 'HARBOR' && neighbor.districtComplete;
    case 'SEA_RESOURCE':
      return isWater(neighbor) && neighbor.resource !== null;
    case 'MINE':
      return neighbor.improvement === 'MINE';
    case 'QUARRY':
      return neighbor.improvement === 'QUARRY';
    case 'AQUEDUCT':
      return neighbor.district === 'AQUEDUCT' && neighbor.districtComplete;
    case 'RIVER':
      return false; // handled separately (it's about the tile itself)
  }
}

/**
 * Base adjacency bonus a district of `type` gets (or would get) on `tile`,
 * in the district's adjacency yield. Result floored like Civ 6 (policy
 * multipliers are applied on top of this by the city computation).
 */
export function districtAdjacency(map: GameState['map'], tile: Tile, type: DistrictId): number {
  const def = DISTRICTS[type];
  if (!def.adjacencyYield || def.adjacency.length === 0) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    for (const n of around) {
      if (matchesAdjacency(rule, n)) sum += rule.amount;
    }
  }
  return Math.floor(sum);
}

/** Adjacency bonus including policy multipliers (Natural Philosophy etc.). */
export function effectiveAdjacency(ctx: YieldCtx, tile: Tile, type: DistrictId): number {
  return districtAdjacency(ctx.map, tile, type) * (ctx.mods.adjacencyMult[type] ?? 1);
}

/**
 * AUDIT B-32: district types this city holds COMPLETE-but-PILLAGED. Their
 * adjacency yields and their buildings' yields/housing/amenities/GPP go dark
 * until repaired (real Civ 6). One-per-type, so a type→pillaged set suffices.
 */
export function pillagedDistrictTypes(
  map: GameState['map'],
  districts: { type: DistrictId; tileIndex: number }[],
): Set<DistrictId> {
  const out = new Set<DistrictId>();
  for (const d of districts) {
    const t = map.tiles[d.tileIndex];
    if (t.districtComplete && t.districtPillaged) out.add(d.type);
  }
  return out;
}

/** Sum of adjacency yields over a city's completed districts. */
export function cityDistrictYields(ctx: YieldCtx, city: City): Yields {
  const out = emptyYields();
  for (const d of city.districts) {
    const tile = ctx.map.tiles[d.tileIndex];
    if (!tile.districtComplete || tile.districtPillaged) continue; // B-32: pillaged = dark
    const def = DISTRICTS[d.type];
    const csAdd = ctx.mods.districtYieldAdd[d.type];
    if (csAdd) addYields(out, csAdd);
    if (def.adjacencyYield) {
      const adj = effectiveAdjacency(ctx, tile, d.type);
      out[def.adjacencyYield] += adj;
      // Work Ethic: Holy Site adjacency also provides production.
      if (d.type === 'HOLY_SITE' && ctx.mods.workEthic) out.production += adj;
    }
  }
  return out;
}

/**
 * Yields from the city's own (non-regional) buildings, including the
 * Shipyard special (production = Harbor gold adjacency) and policy
 * building-yield multipliers (Rationalism etc.).
 */
export function cityBuildingYields(ctx: YieldCtx, city: City): Yields {
  const out = emptyYields();
  const pillaged = pillagedDistrictTypes(ctx.map, city.districts); // B-32
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def) continue;
    if (def.regional) continue; // handled by regional scan (affects own city too)
    if (pillaged.has(def.district)) continue; // B-32: buildings in a pillaged district are dark
    const mult = ctx.mods.buildingYieldMult[def.district] ?? 1;
    if (def.yields) addYields(out, def.yields, mult);
    const beliefAdd = ctx.mods.buildingYieldAdd[id];
    if (beliefAdd) addYields(out, beliefAdd);
    if (def.special === 'SHIPYARD') {
      const harbor = city.districts.find((d) => d.type === 'HARBOR');
      if (harbor && ctx.map.tiles[harbor.tileIndex].districtComplete) {
        out.production += effectiveAdjacency(ctx, ctx.map.tiles[harbor.tileIndex], 'HARBOR');
      }
    }
  }
  return out;
}

export interface RegionalEffects {
  yields: Yields;
  amenities: number;
}

/**
 * Regional building effects reaching `city` from every city's districts
 * within REGIONAL_RANGE of the city center (including its own). The same
 * building type never stacks. (Policy building multipliers deliberately not
 * applied here — no card in the current catalogue targets regional buildings.)
 */
export function regionalEffects(state: GameState, city: City): RegionalEffects {
  const center = state.map.tiles[city.centerIndex];
  const seen = new Set<string>();
  const out: RegionalEffects = { yields: emptyYields(), amenities: 0 };
  for (const other of state.cities) {
    for (const inst of other.districts) {
      const tile = state.map.tiles[inst.tileIndex];
      if (!tile.districtComplete || tile.districtPillaged) continue; // B-32: pillaged source is dark
      for (const id of other.buildings) {
        const def = BUILDINGS[id];
        if (!def || !def.regional || def.district !== inst.type) continue;
        if (seen.has(id)) continue;
        if (hexDistance(tile.col, tile.row, center.col, center.row) > REGIONAL_RANGE) continue;
        seen.add(id);
        if (def.yields) addYields(out.yields, def.yields);
        if (def.amenities) out.amenities += def.amenities;
      }
    }
  }
  return out;
}

/** Local (non-regional) building amenities, e.g. Arena, Palace. */
export function localBuildingAmenities(state: GameState, city: City): number {
  const pillaged = pillagedDistrictTypes(state.map, city.districts); // B-32
  let n = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || def.regional || !def.amenities) continue;
    if (pillaged.has(def.district)) continue; // B-32: pillaged district's amenities go dark
    n += def.amenities;
  }
  return n;
}
