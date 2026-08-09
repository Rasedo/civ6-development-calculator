/**
 * LOAD A WORLD FILE (Layer A) into a live `GameState` — the TS engine's side
 * of the seeder cut: the seeder no longer imports the engine, and the engine
 * no longer re-runs placement; both meet at the file.
 *
 * The loader must reproduce INCIDENTAL ordering exactly (unit array order,
 * unit ids, first-ring city-state ownership): the serve gate compares
 * per-unit rows in array order, so a "semantically correct" loader that
 * reorders units fails the gate for a non-engine reason. Everything here is
 * therefore a straight walk of the file, in file order, through the same
 * engine constructors the old in-engine placement used.
 *
 * Validation is loud and total: every catalog string must exist in the
 * engine's own tables (a renumbered or renamed catalog is a startup failure,
 * not a silent permutation), every unit type must be in the roster, and every
 * spawn must land exactly on its file tile.
 */
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
import { WONDERS } from '../../world/wonders';
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
  checkCatalog('natural wonder', c.wonders, WONDERS);
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
      wonder: m.wonder[i] < 0 ? null : c.wonders[m.wonder[i]],
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
      droughtTurns: 0,
      ownerSeat: NO_SEAT,
      ownerCity: -1,
    });
  }
  const map: GameMap = { width: m.width, height: m.height, seed: world.gen.seed, tiles };

  const state = createGameFromMap(map, false, true);
  state.disasters = true;
  state.rngState = world.rngInit >>> 0;

  // City-states first (file order = id order), through the one constructor.
  world.cityStates.forEach((cityState, i) => {
    if (!CITY_STATE_TYPES.includes(cityState.type as CityStateType)) {
      throw new Error(`world file names city-state type '${cityState.type}' the engine does not know`);
    }
    placeCityStateAt(state, i, cityState.name, cityState.type as CityStateType, cityState.center);
  });

  // The civs, in seat order — civ 0 included, one constructor for all. NO
  // capitals: each civ's file units (settler + warrior) ARE its start.
  world.civs.forEach((civ, i) => {
    const leader = CIV_LEADERS[civ.leader % CIV_LEADERS.length];
    const seat = i === 0
      ? state.seats[0]
      : (() => {
          const s = emptySeat(i);
          state.seats.push(s);
          return s;
        })();
    seat.name = leader.name;
    seat.color = leader.color;
    seat.aggression = civ.aggression;
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
