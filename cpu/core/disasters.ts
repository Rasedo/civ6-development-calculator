
import type { GameState, Tile } from './types';
import { neighbors, tilesWithin } from '../../world/hex';
import { isWater } from '../../world/query';
import { nextRandom } from './rand';
import { seatWonderFlag } from './wonders';
import { isCiv, seatOf, tileSeat } from './seats';
import { cityAtIndex, outerPool } from './units';
import { unitsAt } from './units';
import { disbandUnit } from './units';
import { unitDomain } from './units';
import { FLOOD_SEVERITY_P, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn } from '../data/disasters';

export const FERTILITY_CAP = 3;
const FLOOD_CHANCE = 0.05;
const ERUPTION_CHANCE_PER_VOLCANO = 0.02;
const DROUGHT_CHANCE = 0.02;
const STORM_CHANCE = 0.04;
const DROUGHT_LENGTH = 8;

function log(state: GameState, text: string): void {
  state.eventLog.push(text);
  if (state.eventLog.length > 20) state.eventLog.shift();
}

function pick<T>(state: GameState, arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(nextRandom(state) * arr.length)];
}

function scorch(tile: Tile): void {
  if (tile.improvement && !tile.pillaged) tile.pillaged = true;
}

/** CIV6 (Gathering Storm): a flood damages the DISTRICT on the floodplain, not
 *  just the improvement — the buildings inside it go dark with it, which is
 *  what a Dam is built to prevent. A city CENTER is never pillaged. */
function floodDistrict(tile: Tile): void {
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete && !tile.districtPillaged) {
    tile.districtPillaged = true;
  }
}

function fertilize(tile: Tile): void {
  if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
    tile.fertility = Math.min(FERTILITY_CAP, tile.fertility + 1);
  }
}

/**
 * ONE river flood on one Floodplains tile.
 *
 * CIV6: a flood "damages or destroys Districts, improvements, and units on the
 * Floodplains tiles near the River. This may also include a City Center, in
 * which case it loses some HP and Defenses... May kill some Citizens in a
 * nearby city... Can fertilize affected tiles". The severity ladder decides
 * every magnitude, and the Great Bath cancels the damage half while halving the
 * fertility half.
 *
 * EIGHT draws, always, whatever the tile holds — a draw count that depended on
 * what stood there would have to be mirrored condition-for-condition on the
 * other engine.
 */
function floodTile(state: GameState, tile: Tile): void {
  const rSev = nextRandom(state);
  let sev = 0;
  for (let i = 0, acc = 0; i < FLOOD_SEVERITY_P.length; i++) {
    acc += FLOOD_SEVERITY_P[i];
    if (rSev < acc) { sev = i; break; }
    sev = i;
  }
  const rDestroy = nextRandom(state);
  const rDistrict = nextRandom(state);
  const rDamage = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rPop = nextRandom(state);
  const rFood = nextRandom(state);
  const rProd = nextRandom(state);

  const seat = tileSeat(tile);
  const mitigated = isCiv(seat) && seatWonderFlag(state, seat, 'floodMitigation');
  const col = floodTerrainColumn(tile.terrain);

  if (!mitigated) {
    scorch(tile);
    if (rDestroy < FLOOD_DESTROY_P[sev] && tile.improvement) {
      tile.improvement = null;
      tile.pillaged = false;
    }
    if (rDistrict < FLOOD_DISTRICT_P[sev]) floodDistrict(tile);
    const dmg = FLOOD_DAMAGE_LO[sev]
      + Math.floor(rDamage * (FLOOD_DAMAGE_HI[sev] - FLOOD_DAMAGE_LO[sev] + 1));
    if (dmg > 0) {
      // A CITY CENTER on the floodplain loses HP and, if it has one, perimeter.
      const held = cityAtIndex(state, tile.index);
      if (held) {
        held.city.hp = Math.max(1, held.city.hp - dmg);
        const outer = outerPool(held.city);
        if (outer > 0) held.city.outerHp = Math.max(0, outer - dmg);
      }
      for (const u of [...unitsAt(state, tile.index)]) {
        if (unitDomain(u.type) === 'civilian') {
          // "Civilians killed" is its own column — a chance, not damage.
          if (rCivilian < FLOOD_POP_P[sev]) disbandUnit(state, u.id);
        } else {
          u.hp -= dmg;
          if (u.hp <= 0) disbandUnit(state, u.id);
        }
      }
    }
    if (rPop < FLOOD_POP_P[sev]) {
      const owner = seatOf(state, seat);
      const home = owner?.cities.find((c) => c.id === tile.ownerCity);
      if (home && home.population > 1) home.population -= 1;
    }
  }
  // FERTILIZATION. Each yield is its own roll, so one flood may pay both.
  // A mitigated river still silts, at half the rate.
  const half = mitigated ? 0.5 : 1;
  if (rFood < FLOOD_FERT_FOOD[sev][col] * half) fertilize(tile);
  if (rProd < FLOOD_FERT_PROD[sev][col] * half) {
    if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
      tile.fertilityProd = Math.min(FERTILITY_CAP, tile.fertilityProd + 1);
    }
  }
}

export function disasterPhase(state: GameState): void {
  const map = state.map;

  for (const t of map.tiles) {
    if (t.droughtTurns > 0) t.droughtTurns -= 1;
  }

  if (nextRandom(state) < FLOOD_CHANCE) {
    const target = pick(state, map.tiles.filter((t) => t.feature === 'FLOODPLAINS'));
    if (target) {
      floodTile(state, target);
      log(state, `Flood at (${target.col}, ${target.row}) — silt enriches the floodplain.`);
    }
  }

  for (const volcano of map.tiles) {
    if (!volcano.volcano) continue;
    if (nextRandom(state) >= ERUPTION_CHANCE_PER_VOLCANO) continue;
    for (const n of neighbors(map, volcano)) {
      scorch(n);
      fertilize(n);
    }
    log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
  }

  if (nextRandom(state) < DROUGHT_CHANCE) {
    const center = pick(
      state,
      map.tiles.filter(
        (t) => (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT',
      ),
    );
    if (center) {
      for (const t of tilesWithin(map, center.col, center.row, 2)) {
        if (!isWater(t)) t.droughtTurns = Math.max(t.droughtTurns, DROUGHT_LENGTH);
      }
      log(state, `Drought around (${center.col}, ${center.row}) — food suffers for ${DROUGHT_LENGTH} turns.`);
    }
  }

  if (nextRandom(state) < STORM_CHANCE) {
    const center = pick(state, map.tiles.filter((t) => !isWater(t)));
    if (center) {
      const area = tilesWithin(map, center.col, center.row, 1);
      for (const t of area) {
        scorch(t);
        if (t.terrain === 'DESERT') fertilize(t); // sandstorms deposit silt
      }
      log(state, `Storm at (${center.col}, ${center.row}) — improvements damaged.`);
    }
  }
}
