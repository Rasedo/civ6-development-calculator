/**
 * ONE WORLD, built from its seed under a preset: the map, the civ starts and
 * the city-states, as the `world@1` file the engines load. `seeder/world.ts`
 * writes a preset's family of these; a test builds one in memory.
 *
 * Imports only `world/`, this directory and node builtins.
 */
import { createHash } from 'node:crypto';

import { generateMap } from '../world/mapgen';
import { TERRAINS } from '../world/terrains';
import { FEATURES } from '../world/features';
import { RESOURCES } from '../world/resources';
import type { WorldFile } from '../world/file';
import { placeCivs, placeCityStates, PLACEMENT_VERSION } from './place';
import type { WorldPreset } from './presets';

const ELEVATIONS = ['FLAT', 'HILLS', 'MOUNTAIN'];

/** the generation parameters a world file records: the preset less its seed
 *  family (`nSeeds`, `firstSeed`). */
export function worldParams(p: WorldPreset) {
  return {
    width: p.width, height: p.height, cityStateMax: p.cityStateMax, civCount: p.civCount,
    layout: p.layout, landFraction: p.landFraction,
    resourceMult: p.resourceMult, resourceWeights: p.resourceWeights,
  };
}

/** The world for `seed` under preset `p`; `genStamp` is the family's source
 *  stamp the file carries. */
export function buildWorld(seed: number, p: WorldPreset, genStamp: string): WorldFile {
  const map = generateMap({
    width: p.width, height: p.height, seed, withResources: true, withWonders: true, withVillages: true,
    layout: p.layout, landFraction: p.landFraction, resourceMult: p.resourceMult,
    // the default triple keeps the picker's LITERAL 0.45/0.8 boundaries — the
    // normalised quotient of the same weights is a different float.
    resourceWeights: p.resourceWeights[0] === 0.45 && p.resourceWeights[1] === 0.35 && p.resourceWeights[2] === 0.2
      ? undefined : p.resourceWeights,
  });
  const catalogs = {
    terrains: Object.keys(TERRAINS),
    elevations: ELEVATIONS,
    features: Object.keys(FEATURES),
    resources: Object.keys(RESOURCES),
  };
  const idx = (list: string[], v: string | null): number => (v === null ? -1 : list.indexOf(v));
  const { starts, civs } = placeCivs(map, seed, p.civCount);
  const cityStates = placeCityStates(map, seed, p.cityStateMax, starts);
  const world: WorldFile = {
    format: 'world@1',
    gen: { seed, placement: PLACEMENT_VERSION, params: worldParams(p), genStamp },
    catalogs,
    map: {
      width: map.width,
      height: map.height,
      terrain: map.tiles.map((t) => idx(catalogs.terrains, t.terrain)),
      elevation: map.tiles.map((t) => idx(catalogs.elevations, t.elevation)),
      feature: map.tiles.map((t) => idx(catalogs.features, t.feature)),
      resource: map.tiles.map((t) => idx(catalogs.resources, t.resource)),
      riverMask: map.tiles.map((t) => t.riverMask),
      cliffMask: map.tiles.map((t) => t.cliffMask ?? 0),
      volcano: map.tiles.map((t) => (t.volcano ? 1 : 0)),
      goodyHut: map.tiles.map((t) => (t.goodyHut ? 1 : 0)),
    },
    civs,
    cityStates,
    rngInit: (seed ^ 0x9e3779b9) >>> 0,
  };
  world.worldHash = createHash('sha256').update(JSON.stringify(world)).digest('hex');
  return world;
}
