/**
 * PLACEMENT — where the civs and city-states START. Policy "spaced-balanced@1".
 *
 * Civ 6 shape (#71): a major civ starts with a SETTLER and a WARRIOR on its
 * start tile, NOT a pre-founded capital. City-states stay founded cities.
 *
 * The rules, and nothing else:
 *   - candidacy is LEGALITY ONLY — land, passable, no natural wonder, no
 *     OASIS, no goody hut, and not a sliver (>= MIN_LAND_NEARBY land within
 *     2). Scoring is planning and planning is the policy's job, not ours.
 *   - a civ start needs >= START_RESOURCE_MIN resource tiles within
 *     START_RESOURCE_RADIUS, and every civ's count stays within
 *     START_RESOURCE_SPREAD of the first civ's — "somewhat balanced".
 *   - civ starts sit >= MAJOR_START_DIST apart; city-states sit
 *     >= CITY_STATE_START_DIST from every start and each other.
 *   - one labelled stream per decision (`place/civ/{i}`, `place/cs/{s}`),
 *     never the in-state RNG; candidates in ascending tile order (the
 *     determinism anchor); draw floor(r*n). A cramped map relaxes the
 *     distance/spread ladder DETERMINISTICALLY before it gives up.
 *
 * `seeder/` imports only `world/` and node builtins. The city-state type and
 * name pools are declared here as plain strings; the LOADER validates them
 * against the engine's catalogs, so a typo is a load failure, not a rule.
 */
import type { GameMap, Tile } from '../world/types';
import { hexDistance, tilesWithin } from '../world/hex';
import { isWater, isImpassable } from '../world/query';
import { mulberry32, deriveSeed, randInt, type Rng } from '../world/rng';
import type { WorldCiv, WorldCityState } from '../world/file';

export const PLACEMENT_VERSION = 'spaced-balanced@1';

export const MAJOR_START_DIST = 10;
export const CITY_STATE_START_DIST = 6;
export const START_RESOURCE_RADIUS = 3;
export const START_RESOURCE_MIN = 2;
export const START_RESOURCE_SPREAD = 3;
const MIN_LAND_NEARBY = 8;

const RELAX: [number, number][] = [
  [MAJOR_START_DIST, START_RESOURCE_SPREAD],
  [MAJOR_START_DIST, 99],
  [8, 99],
  [6, 99],
];

const CITY_STATE_TYPES = ['scientific', 'cultural', 'trade', 'industrial', 'militaristic', 'religious'] as const;
const CITY_STATE_NAMES: Record<(typeof CITY_STATE_TYPES)[number], string[]> = {
  scientific: ['Geneva', 'Stockholm', 'Bologna'],
  cultural: ['Nan Madol', 'Kumasi', 'Vilnius'],
  trade: ['Amsterdam', 'Antioch', 'Hunza'],
  industrial: ['Hong Kong', 'Buenos Aires', 'Toronto'],
  militaristic: ['Kabul', 'Valletta', 'Preslav'],
  religious: ['Jerusalem', 'La Venta', 'Yerevan'],
};

function startLegal(t: Tile): boolean {
  return !isWater(t) && !isImpassable(t) && !t.wonder && t.feature !== 'OASIS' && !t.goodyHut;
}

function resourcesNear(map: GameMap, t: Tile): number {
  let n = 0;
  for (const x of tilesWithin(map, t.col, t.row, START_RESOURCE_RADIUS)) {
    if (x.resource !== null) n += 1;
  }
  return n;
}

function landNear(map: GameMap, t: Tile): number {
  let n = 0;
  for (const x of tilesWithin(map, t.col, t.row, 2)) {
    if (!isWater(x) && !isImpassable(x)) n += 1;
  }
  return n;
}

const far = (a: Tile, b: Tile, d: number): boolean => hexDistance(a.col, a.row, b.col, b.row) >= d;

export function placeCivs(map: GameMap, seed: number, nCivs: number): { starts: Tile[]; civs: WorldCiv[] } {
  const legal = map.tiles.filter((t) => startLegal(t) && landNear(map, t) >= MIN_LAND_NEARBY);
  const res = new Map(legal.map((t) => [t.index, resourcesNear(map, t)]));
  const starts: Tile[] = [];
  const civs: WorldCiv[] = [];
  for (let i = 0; i < nCivs; i++) {
    const rng: Rng = mulberry32(deriveSeed(seed, `place/civ/${i}`));
    let pick: Tile | null = null;
    for (const [dist, spread] of RELAX) {
      const cands = legal.filter(
        (t) =>
          (res.get(t.index) ?? 0) >= START_RESOURCE_MIN &&
          starts.every((s) => far(s, t, dist)) &&
          (starts.length === 0 || Math.abs((res.get(t.index) ?? 0) - (res.get(starts[0].index) ?? 0)) <= spread),
      );
      if (cands.length > 0) {
        pick = cands[randInt(rng, cands.length)];
        break;
      }
    }
    if (!pick) throw new Error(`seed ${seed}: no legal start for civ ${i} even after relaxation`);
    starts.push(pick);
    civs.push({
      leader: i,
      aggression: 0.3 + rng() * 0.6,
      units: [
        { type: 'SETTLER', tile: pick.index },
        { type: 'WARRIOR', tile: pick.index },
      ],
    });
  }
  return { starts, civs };
}

export function placeCityStates(map: GameMap, seed: number, nCs: number, civStarts: Tile[]): WorldCityState[] {
  const legal = map.tiles.filter((t) => startLegal(t) && landNear(map, t) >= MIN_LAND_NEARBY);
  const placed: Tile[] = [];
  const out: WorldCityState[] = [];
  const used = new Set<string>();
  for (let s = 0; s < nCs; s++) {
    const rng: Rng = mulberry32(deriveSeed(seed, `place/cs/${s}`));
    for (const dist of [CITY_STATE_START_DIST, 4]) {
      const cands = legal.filter(
        (t) => civStarts.every((c) => far(c, t, dist)) && placed.every((p) => far(p, t, dist)),
      );
      if (cands.length === 0) continue;
      const tile = cands[randInt(rng, cands.length)];
      const type = CITY_STATE_TYPES[randInt(rng, CITY_STATE_TYPES.length)];
      const name = CITY_STATE_NAMES[type].find((n) => !used.has(n)) ?? `${CITY_STATE_NAMES[type][0]} ${s}`;
      used.add(name);
      placed.push(tile);
      out.push({ name, type, center: tile.index });
      break;
    }
  }
  if (out.length < nCs) throw new Error(`seed ${seed}: placed only ${out.length}/${nCs} city-states`);
  return out;
}
