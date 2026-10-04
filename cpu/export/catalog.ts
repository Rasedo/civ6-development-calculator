
import { BUILT_WONDERS } from '../data/builtWonders';
import { wonderTerrainOk } from '../core/rules';
import { neighbors } from '../../world/hex';
import { hasRiver, isWater, naturalWonderAt } from '../../world/query';
import { type DistrictId, type GameState, type Tile } from '../core/types';
import { BUILDINGS } from '../data/buildings';
import { centerBuildingIds } from '../core/prodLayout';
import { DISTRICTS, type AdjacencyRule, type AdjacencySource } from '../data/districts';
import { FEATURES } from '../../world/features';
import { TERRAINS } from '../../world/terrains';
import { TECHS } from '../data/techs'; // era scale
import { CIVICS } from '../data/civics';
import { LUXURY_IDS, RESOURCES } from '../../world/resources';

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
const wonderStaticOk = (w: (typeof BUILT_WONDER_LIST)[number], t: Tile, m: GameState['map']): boolean =>
  wonderTerrainOk(w, t, m);
/** The `wok` bit of wonder row i, as arithmetic: JS `<<` is 32-bit, and the
 *  mask is a JSON double, exact through bit 52 — 53 rows at most. */
const wonderBit = (i: number): number => {
  if (i > 52) throw new Error(`wonder row ${i} does not fit the 53-bit wok mask`);
  return 2 ** i;
};
// the SELF source reads no neighbour at all, so it is never a per-tile
// static count — the district's own row carries it.
const STATIC_ADJ_SRC = new Set<AdjacencySource>([
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'RIVER', 'SEA_RESOURCE',
  'GEOTHERMAL_FISSURE', 'TUNDRA', 'DESERT', 'PAMUKKALE',
]);

/** does neighbour `n` answer static source `src` */
function staticMatch(src: AdjacencySource, n: Tile): boolean {
  return src === 'MOUNTAIN' ? n.elevation === 'MOUNTAIN' && !naturalWonderAt(n)
    : src === 'RAINFOREST' ? n.feature === 'RAINFOREST'
    : src === 'WOODS' ? n.feature === 'WOODS'
    : src === 'REEF' ? n.feature === 'REEF'
    : src === 'NATURAL_WONDER' ? naturalWonderAt(n) !== null
    : src === 'SEA_RESOURCE' ? isWater(n) && n.resource !== null
    : src === 'GEOTHERMAL_FISSURE' ? n.feature === 'GEOTHERMAL_FISSURE'
    : src === 'TUNDRA' ? n.terrain === 'TUNDRA'
    : src === 'DESERT' ? n.terrain === 'DESERT'
    : src === 'PAMUKKALE' ? n.feature === 'PAMUKKALE'
    : false;
}

/** a rule whose share per neighbour is a fraction (TilesRequired over 1):
 *  each engine floors its own count live (`districtAdjacency`), so no static
 *  plane carries it — only a feature's or a terrain's, which the GPU counts */
function liveFloored(rule: AdjacencyRule): boolean {
  if (Number.isInteger(rule.amount)) return false;
  if (STATIC_ADJ_SRC.has(rule.source) && !FEAT_IDS.includes(rule.source as never) && !TERRAIN_IDS.includes(rule.source)) {
    throw new Error(`a fractional ${rule.source} adjacency the GPU cannot count live`);
  }
  return true;
}

/** the static rules' whole pay at a plot (`live`: the live-floored rules'
 *  instead, each floored on its own) */
function staticAdjRaw(map: GameState['map'], tile: Tile, id: DistrictId, live = false): number {
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (!STATIC_ADJ_SRC.has(rule.source) || liveFloored(rule) !== live) continue;
    const n = rule.source === 'RIVER' ? (hasRiver(tile) ? 1 : 0) : around.filter((nb) => staticMatch(rule.source, nb)).length;
    sum += Math.floor(n * rule.amount);
  }
  return sum;
}

/** what a plot's feature lends a neighbouring district of `id` through the
 *  static rules (`removable`: the removable feature's, else the one a pave
 *  alone takes) */
function featureAdjContribution(tile: Tile, id: DistrictId, removable = true): number {
  const f = tile.feature;
  if (!f || FEATURES[f].removable !== removable) return 0;
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  for (const rule of def.adjacency) {
    if (liveFloored(rule)) continue;
    const m = (rule.source === 'RAINFOREST' || rule.source === 'WOODS' || rule.source === 'REEF'
      || rule.source === 'GEOTHERMAL_FISSURE') && f === rule.source;
    if (m) sum += rule.amount;
  }
  return sum;
}

export { LUXURY_IDS, chopKeyCode, chopUnlockTech, techList, civicList, techIdx, civicIdx, centerBuildings, buildingIdx, buildingUnlockTech, buildingUnlockCivic, FEAT_IDS, featIdx, TERRAIN_IDS, RESOURCE_IDS, BUILT_WONDER_LIST, wonderStaticOk, wonderBit, staticAdjRaw, featureAdjContribution };
