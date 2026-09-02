import type { WorldFile } from '../../world/file';
import type { CityStateType, Elevation, FeatureId, GameMap, GameState, TerrainId, Tile } from '../core/types';
import { NO_SEAT } from '../core/types';
import { createGameFromMap } from '../core/game';
import { placeCityStateAt } from '../core/cityStates';
import { emptySeat } from '../core/seats';
import { spawnUnit } from '../core/units';
import { CIV_LEADERS } from '../data/seats';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { TERRAINS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { UNITS } from '../data/units';

function checkCatalog(kind: string, ids: string[], known: Record<string, unknown> | Set<string>): void {
  const has = known instanceof Set ? (id: string) => known.has(id) : (id: string) => id in known;
  for (const id of ids) {
    if (!has(id)) throw new Error(`world file names ${kind} '${id}' the engine does not know`);
  }
}

export function loadWorld(world: WorldFile): GameState {
  if (world.format !== 'world@1') {
    throw new Error(`unsupported world format ${String((world as { format?: string }).format)} — expected world@1`);
  }
  const c = world.catalogs;
  checkCatalog('terrain', c.terrains, TERRAINS);
  checkCatalog('feature', c.features, FEATURES);
  checkCatalog('resource', c.resources, RESOURCES);
  checkCatalog('elevation', c.elevations, new Set(['FLAT', 'HILLS', 'MOUNTAIN']));

  const m = world.map;
  const tiles: Tile[] = [];
  for (let i = 0; i < m.terrain.length; i++) {
    tiles.push({
      index: i,
      col: i % m.width,
      row: Math.floor(i / m.width),
      terrain: c.terrains[m.terrain[i]] as TerrainId,
      elevation: c.elevations[m.elevation[i]] as Elevation,
      feature: m.feature[i] < 0 ? null : (c.features[m.feature[i]] as FeatureId),
      resource: m.resource[i] < 0 ? null : c.resources[m.resource[i]],
      riverMask: m.riverMask[i],
      cliffMask: m.cliffMask[i],
      improvement: null,
      district: null,
      districtComplete: false,
      builtWonder: null,
      builtWonderComplete: false,
      pillaged: false,
      districtPillaged: false,
      goodyHut: m.goodyHut[i] !== 0,
      volcano: m.volcano[i] !== 0,
      fertility: 0,
      fertilityProd: 0,
      droughtTurns: 0,
      ownerSeat: NO_SEAT,
      ownerCity: -1,
    });
  }
  const map: GameMap = { width: m.width, height: m.height, seed: world.gen.seed, tiles };

  const state = createGameFromMap(map, false, true);
  state.disasters = true;
  state.rngState = world.rngInit >>> 0;

  // the exporter's MAX, not the placed count: placement drops a city-state it
  // cannot site, and the id space stays the width the GPU allocates.
  state.cityStateMax = world.gen.params.cityStateMax;
  world.cityStates.forEach((cityState, i) => {
    if (!CITY_STATE_TYPES.includes(cityState.type as CityStateType)) {
      throw new Error(`world file names city-state type '${cityState.type}' the engine does not know`);
    }
    placeCityStateAt(state, i, cityState.name, cityState.type as CityStateType, cityState.center);
  });

  world.civs.forEach((civ, i) => {
    const leader = CIV_LEADERS[civ.leader % CIV_LEADERS.length];
    const seat = state.seats[i] ?? (state.seats[i] = emptySeat(i));
    seat.name = leader.name;
    seat.color = leader.color;
    seat.aggression = civ.aggression;
    seat.civ = civ.leader % CIV_LEADERS.length;
    for (const u of civ.units) {
      if (!UNITS[u.type]) throw new Error(`world file names unit type '${u.type}' the engine does not know`);
      const spawned = spawnUnit(state, u.type, u.tile, i);
      if (!spawned || spawned.tileIndex !== u.tile) {
        throw new Error(`seed ${world.gen.seed}: ${u.type} for civ ${i} could not spawn exactly on tile ${u.tile}`);
      }
    }
  });

  return state;
}
