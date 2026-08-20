

import { BUILT_WONDERS } from '../data/builtWonders';
import { neighbors } from '../../world/hex';
import { hasRiver, isCoastalWater, isImpassable, isWater } from '../../world/query';
import { type DistrictId, type GameState, type Tile } from '../core/types';
import { BUILDINGS } from '../data/buildings';
import { centerBuildingIds } from '../core/prodLayout';
import { DISTRICTS, type AdjacencySource } from '../data/districts';
import { FEATURES } from '../../world/features';
import { TERRAINS } from '../../world/terrains';
import { TECHS } from '../data/techs'; // era scale
import { CIVICS } from '../data/civics';
import { RESOURCES } from '../../world/resources';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
// SEASIDE_RESORT appended LAST — this array's order IS the GPU's
// improvement index, so anything but an append renumbers every other row.

 
const LUXURY_IDS = Object.values(RESOURCES)
  .filter((r) => r.category === 'luxury')
  .map((r) => r.id);


function chopKeyCode(t: any): number {
  if (!t.feature) return 0;
  const def = (FEATURES as any)[t.feature];
  if (!def?.removable || !def?.chopYield) return 0;
  if (t.resource) {
    const res = (RESOURCES as any)[t.resource];
    if (res?.requiresFeature?.includes(t.feature)) return 0;
  }
  return def.chopYield === 'food' ? 1 : def.chopYield === 'production' ? 2 : 0;
}
function chopUnlockTech(t: any): number {
  if (!t.feature) return -1;
  return Object.values(TECHS).findIndex((tech: any) =>
    (tech.effects ?? []).some((fx: any) => fx.kind === 'unlockFeatureRemoval' && fx.feature === t.feature));
}


const techList = Object.values(TECHS);
const civicList = Object.values(CIVICS);
const techIdx = new Map(techList.map((t, i) => [t.id, i]));
const civicIdx = new Map(civicList.map((c, i) => [c.id, i]));


const centerBuildings = centerBuildingIds().map((id) => BUILDINGS[id]);
const buildingIdx = new Map(centerBuildings.map((b, i) => [b.id, i]));
const buildingUnlockTech = new Map<string, number>();
techList.forEach((t, i) => {
  for (const fx of t.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockTech.set(fx.building, i);
  }
});
const buildingUnlockCivic = new Map<string, number>();
civicList.forEach((c, i) => {
  for (const fx of c.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockCivic.set(fx.building, i);
  }
});

const FEAT_IDS = Object.keys(FEATURES);
const TERRAIN_IDS = Object.keys(TERRAINS);
const featIdx = new Map(FEAT_IDS.map((f, i) => [f, i]));
const RESOURCE_IDS = Object.keys(RESOURCES);
const BUILT_WONDER_LIST = Object.values(BUILT_WONDERS);
const wonderStaticOk = (w: (typeof BUILT_WONDER_LIST)[number], t: Tile, m: GameState['map']): boolean => {
  if (t.wonder) return false;
  if (isImpassable(t)) return false;
  const p = w.placement;
  if (p.onCoastalWater) {
    if (!isCoastalWater(m, t)) return false;
  } else {
    if (isWater(t)) return false;
    if (t.feature === 'FLOODPLAINS' && !p.allowFloodplains) return false;
    if (t.feature === 'OASIS') return false;
    if (p.terrains && !p.terrains.includes(t.terrain)) return false;
    if (p.flatOnly && t.elevation !== 'FLAT') return false;
    if (p.hillsOnly && t.elevation !== 'HILLS') return false;
  }
  if (p.requiresRiver && !hasRiver(t)) return false;
  return true;
};
const STATIC_ADJ_SRC = new Set<AdjacencySource>([
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'RIVER', 'SEA_RESOURCE',
]);


function staticAdjRaw(map: GameState['map'], tile: Tile, id: DistrictId): number {
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (!STATIC_ADJ_SRC.has(rule.source)) continue;
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    for (const n of around) {
      const m =
        rule.source === 'MOUNTAIN' ? n.elevation === 'MOUNTAIN' && !n.wonder
        : rule.source === 'RAINFOREST' ? n.feature === 'RAINFOREST'
        : rule.source === 'WOODS' ? n.feature === 'WOODS'
        : rule.source === 'REEF' ? n.feature === 'REEF'
        : rule.source === 'NATURAL_WONDER' ? n.wonder !== null
        : rule.source === 'SEA_RESOURCE' ? isWater(n) && n.resource !== null
        : false;
      if (m) sum += rule.amount;
    }
  }
  return sum;
}

function featureAdjContribution(tile: Tile, id: DistrictId, removable = true): number {
  const f = tile.feature;
  if (!f || FEATURES[f].removable !== removable) return 0;
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  for (const rule of def.adjacency) {
    const m =
      rule.source === 'RAINFOREST' ? f === 'RAINFOREST'
      : rule.source === 'WOODS' ? f === 'WOODS'
      : rule.source === 'REEF' ? f === 'REEF'
      : false;
    if (m) sum += rule.amount;
  }
  return sum;
}


export { LUXURY_IDS, chopKeyCode, chopUnlockTech, techList, civicList, techIdx, civicIdx, centerBuildings, buildingIdx, buildingUnlockTech, buildingUnlockCivic, FEAT_IDS, featIdx, TERRAIN_IDS, RESOURCE_IDS, BUILT_WONDER_LIST, wonderStaticOk, staticAdjRaw, featureAdjContribution };
