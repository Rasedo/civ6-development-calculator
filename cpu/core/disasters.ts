
import type { City, CityState, GameState, Tile } from './types';
import { logPopWrite } from './difflog';
import type { GameMap, ImprovementId } from '../../world/types';
import { IMPROVEMENTS } from '../data/improvements';
import { neighborTile, neighbors, offsetToAxial, axialToOffset, tileAt, tilesWithin, hexDistance } from '../../world/hex';
import { isWater } from '../../world/query';
import { TERRAINS } from '../../world/terrains';
import { RESOURCES } from '../../world/resources';
import { nextRandom } from './rand';
import { fogActive, isExplored } from './fog';
import { seatOf, tileSeat, civOf, leaderOf, civsAtWar, isCiv, cityHolders, campTiles } from './seats';
import { raiseAidRequest } from './competition';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { UNITS } from '../data/units';
import { rowIsFor } from '../data/civilizations';
import { cityAtIndex, unitIsNoncombat } from './units';
import { outerPool } from './rules';
import { buildingPillaged, pillageBuilding } from './yields';
import { centerBuildingIds } from './prodLayout';
import { unitsAt } from './units';
import { disbandUnit } from './units';
import { unitDomain } from './units';
import { FLOOD_WEIGHT, FLOOD_CIPD, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn, FLOOD_BLDG_P, warmedWeight, RANDOM_EVENT_START_TURN } from '../data/disasters';
import { ERUPTION_WEIGHT, DROUGHT_WEIGHT, DROUGHT_CIPD, DROUGHT_DURATION, DROUGHT_HEXES, DROUGHT_IMPROVEMENTS, DROUGHT_DESTROY_P, droughtGround, SOIL_REPLACES } from '../data/disasters';
import { ERUPTION_PAINT_P, ERUPTION_DESTROY_P, ERUPTION_DISTRICT_P, ERUPTION_BLDG_P, ERUPTION_POP_P, ERUPTION_CIV_KILL_P, ERUPTION_DMG_LO, ERUPTION_DMG_HI, ERUPTION_ROWS, ERUPTION_WONDER, ERUPTION_PROD_P, ERUPTION_SCI_P, ERUPTION_CUL_P } from '../data/disasters';
import { EVENT_NORM_PER_MAP, EVENT_NORM_PER_SITE, FIRST_TIME_OCCURRENCE_BOOST, VOLCANO_WAKE_P, DROUGHT_DISTANCE_WEIGHTS } from '../data/disasters';
import { METEOR_WEIGHT, METEOR_TERRAINS, METEOR_FEATURES, METEOR_AVOIDS_TERRITORY } from '../data/disasters';
import { FIRE_WEIGHT, FIRE_CIPD, FIRE_START_FEATURE, FIRE_BURNING_FEATURE, FIRE_BURNT_FEATURE, FIRE_BURNT_TURN, FIRE_REGROW_TURN, FIRE_SPREAD_P, FIRE_SPREAD_TURNS, FIRE_SPREAD_CROSS, FIRE_DAMAGE_TURNS, FIRE_POP_TURN, FIRE_DMG } from '../data/disasters';
import { ACCIDENT_WEIGHT, ACCIDENT_MIN_TURN, ACCIDENT_FALLOUT, ACCIDENT_DISTRICT_P, ACCIDENT_POP_P, ACCIDENT_LAND_P, ACCIDENT_DMG_LO, ACCIDENT_DMG_HI, ACCIDENT_CIV_KILL_P } from '../data/disasters';
import { STORM_EVENTS, STORM_FAMILIES, STORM_DISC, STORM_UNIT_ROWS, stormFamilyAt, PREVAILING_WINDS, windBand, STORM_MOVEMENT, type StormEvent } from '../data/disasters';
import { defertilize, desertificationLive, fertilityLive, warmingDegrees } from './climate';
import { governorTileFlag } from './governors';

export const FERTILITY_CAP = 3;

function log(state: GameState, text: string): void {
  state.eventLog.push(text);
  if (state.eventLog.length > 20) state.eventLog.shift();
}

function pick<T>(state: GameState, arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(nextRandom(state) * arr.length)];
}

/** CIV6 (Reinforced Materials): "This city's improvements, buildings and
 *  Districts cannot be damaged by Environmental Effects." */
function envImmune(state: GameState, tile: Tile): boolean {
  // CIV6 (`Improvements.DisasterResistant`): the Great Wall stands through a
  // storm or a flood on its own row, wherever it is.
  if (tile.improvement && IMPROVEMENTS[tile.improvement as ImprovementId]?.disasterResistant) return true;
  return governorTileFlag(state, tile, (e) => e.envDamageImmune);
}

function scorch(state: GameState, tile: Tile): void {
  if (tile.improvement && !tile.pillaged && !envImmune(state, tile)) tile.pillaged = true;
}

/** CIV6 (Gathering Storm): a disaster damages the DISTRICT on the tile, not
 *  just the improvement, which is what a Dam is built to prevent. A city
 *  CENTER is never pillaged. With `buildings`, DISTRICT_PILLAGED takes every
 *  building standing in the district too, a city-state's alike
 *  (runs/c74s3_bldg_pillage_20260926T133346Z.jsonl: 13 of 13); the nuclear
 *  accident takes the district alone (its Power Plant was never pillaged,
 *  runs/reactor_reactor_base_20260926T071712Z.jsonl). */
function pillageDistrict(state: GameState, tile: Tile, buildings: boolean): void {
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete
      && !tile.districtPillaged && !envImmune(state, tile)) {
    tile.districtPillaged = true;
    if (!buildings) return;
    const h = districtHolder(state, tile);
    if (!h) return;
    for (const id of centerBuildingIds()) {
      // CIV6 (Dar-e Mehr): "Cannot be pillaged by natural disasters"
      if (BUILDINGS[id].district === tile.district && !BUILDINGS[id].disasterProof) pillageHeld(h, id);
    }
  }
}

/**
 * CIV6 (RandomEvent_Damages): BUILDING_PILLAGED is a column of its OWN, with
 * its own Percentage, rolled ONE PER TILE. A hit on a district not itself
 * pillaged takes ONE building, the top of the district's chain (University
 * over Library, Meeting House over Temple:
 * runs/c74s3_bldg_pillage_20260926T133346Z.jsonl, 6 of 6), a city-state's
 * alike. READING: the top is the dearest building standing unpillaged there
 * (`BuildingDef.cost`, ties to the first in the production layout); a
 * Dar-e Mehr, which "Cannot be pillaged by natural disasters", is passed
 * over. A pillaged district's buildings went with it.
 */
function pillageTileBuildings(state: GameState, tile: Tile): void {
  // A city CENTRE is never pillaged (`pillageDistrict`'s own rule, and no
  // storm row names CITY_GARRISON or CITY_WALLS), so its buildings stand.
  if (!tile.district || tile.district === 'CITY_CENTER' || !tile.districtComplete
      || tile.districtPillaged || envImmune(state, tile)) return;
  const h = districtHolder(state, tile);
  if (!h) return;
  let top: string | undefined;
  for (const id of centerBuildingIds()) {
    const def = BUILDINGS[id];
    if (def.district !== tile.district || def.disasterProof || !h.city.buildings?.includes(id)
      || buildingPillaged(h.city, id)) continue;
    if (top === undefined || def.cost > BUILDINGS[top].cost) top = id;
  }
  if (top) pillageHeld(h, top);
}

/** The city — a major's, the Free Cities', a city-state's — whose registry
 *  holds the district standing on this tile; `minor` names a city-state's. */
function districtHolder(state: GameState, tile: Tile):
  { city: { buildings?: string[]; pillagedBuildings?: string[] }; minor?: CityState } | undefined {
  const city = cityHoldingDistrict(state, tile);
  if (city) return { city };
  const cs = (state.cityStates ?? []).find((m) => (m.districts ?? []).some((d) => d.tileIndex === tile.index));
  return cs ? { city: cs, minor: cs } : undefined;
}

/** A standing building of the holder goes pillaged; a city-state's repair
 *  of it waits for the item it is working on (`CityState.repairWait`). */
function pillageHeld(h: NonNullable<ReturnType<typeof districtHolder>>, id: string): void {
  if (!h.city.buildings?.includes(id) || buildingPillaged(h.city, id)) return;
  pillageBuilding(h.city, id);
  if (h.minor) h.minor.repairWait = true;
}

/** the city whose registry holds the district standing on this tile. */
function cityHoldingDistrict(state: GameState, tile: Tile): City | undefined {
  for (const s of cityHolders(state)) {
    for (const c of s.cities) {
      if (c.districts.some((d) => d.tileIndex === tile.index)) return c;
    }
  }
  return undefined;
}

/** IMPROVEMENT_DESTROYED: the improvement is taken away, not pillaged. */
function destroyImprovement(state: GameState, tile: Tile): void {
  if (tile.improvement && !envImmune(state, tile)) {
    tile.improvement = null;
    tile.pillaged = false;
  }
}

/** POPULATION_LOSS: one citizen of the city owning the tile, never its last —
 *  every holder that keeps a city list, the Free Cities seat included. */
function losePopulation(state: GameState, tile: Tile): void {
  const seat = tileSeat(tile);
  const home = seatOf(state, seat)?.cities.find((c) => c.id === tile.ownerCity);
  if (home && home.population > 1) {
    home.population -= 1;
    logPopWrite(state, home, 'ds');
    (state.aidHit ??= []).push(seat);  // CIV6 (Aid Request trigger)
  }
}

/** CITY_GARRISON and CITY_WALLS: a CITY CENTRE on the tile loses HP and, if
 *  it has one, perimeter, by the row's one damage roll. */
function hitCityCentre(state: GameState, tile: Tile, dmg: number): void {
  const held = cityAtIndex(state, tile.index);
  if (!held) return;
  held.city.hp = Math.max(1, held.city.hp - dmg);
  const outer = outerPool(state, held.city);
  if (outer > 0) held.city.outerHp = Math.max(0, outer - dmg);
}

/** What the tile's units take from one event: whether each domain's share
 *  roll hit, the civilians' kill roll, and the two HP rolls. */
interface UnitStrike {
  land: boolean;
  naval: boolean;
  civ: boolean;
  landDmg: number;
  navalDmg: number;
}

/**
 * UNIT_DAMAGE_LAND / UNIT_DAMAGE_NAVAL / UNIT_KILLED_CIVILIAN on one tile's
 * units. READINGS shared with the GPU twin: a domain's roll is one per tile
 * for ALL that domain's units on it; an embarked unit is its chassis' domain;
 * an air unit or a spy holds no tile and is neither domain. A storm's roster
 * rows (`stormSpares`, `stormExtraPct`) read `ev`; an event with none passes
 * null.
 */
function strikeUnits(state: GameState, tile: Tile, owner: number, s: UnitStrike, ev: StormEvent | null): void {
  for (const u of [...unitsAt(state, tile.index)]) {
    const dom = unitDomain(u.type);
    if (dom === 'air' || dom === 'spy') continue;
    if (ev && stormSpares(state, u.seat, ev)) continue;
    if (dom === 'civilian') {
      if (s.civ) disbandUnit(state, u.id);
      continue;
    }
    const naval = !!UNITS[u.type]?.naval;
    if (!(naval ? s.naval : s.land)) continue;
    const base = naval ? s.navalDmg : s.landDmg;
    const pct = ev ? stormExtraPct(state, u.seat, owner, ev) : 0;
    const dmg = base + Math.floor(base * pct / 100);
    u.hp -= dmg;
    if (u.hp <= 0) disbandUnit(state, u.id);
  }
}

/** May an eruption paint Volcanic Soil on this ring plot? Land that is not a
 *  Mountain and not drowned, carrying no district (a city centre is one) and
 *  no wonder, and either bare or under a feature the soil replaces (Woods,
 *  Rainforest, Marsh). Floodplains, a Geothermal Fissure, an Oasis, a natural
 *  wonder and soil already there are not candidates. `_soil_paintable` is the
 *  twin. */
export function soilPaintable(t: Tile): boolean {
  if (isWater(t) || t.submerged || t.elevation === 'MOUNTAIN') return false;
  if (t.district || t.builtWonder) return false;
  return t.feature === null || SOIL_REPLACES.includes(t.feature);
}

/** The plot becomes Volcanic Soil; a Lumber Mill goes with the Woods or
 *  Rainforest it stood on, any other improvement stays. */
export function paintVolcanicSoil(t: Tile): void {
  if (t.improvement === 'LUMBER_MILL') t.improvement = null;
  t.feature = 'VOLCANIC_SOIL';
}

function fertilize(state: GameState, tile: Tile): void {
  if (!fertilityLive(state)) return;
  if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
    tile.fertility = Math.min(FERTILITY_CAP, tile.fertility + 1);
  }
}

/**
 * Every Floodplains tile ALONG one river.
 *
 * CIV6 (Flood): "The level of the water rises, flooding all Floodplains tiles
 * found along the River, and then recedes on the next turn." One severity for
 * the whole flood, then each reached tile takes the effects at that severity.
 */
export function riverReach(map: GameMap, start: Tile): Tile[] {
  // Two tiles are on the same river when a river EDGE separates them. A
  // river's edges are a vertex-connected chain, and any two edges meeting at a
  // vertex are consecutive edges of one common tile — so this tile walk covers
  // exactly the one river and never leaks into another.
  const seen = new Set<number>([start.index]);
  const stack = [start];
  while (stack.length) {
    const t = stack.pop()!;
    for (let d = 0; d < 6; d++) {
      if (!(t.riverMask & (1 << d))) continue;
      const n = neighborTile(map, t, d);
      if (!n || seen.has(n.index)) continue;
      seen.add(n.index);
      stack.push(n);
    }
  }
  const out = map.tiles.filter((t: Tile) => seen.has(t.index) && t.feature === 'FLOODPLAINS');
  return out.length ? out : [start];
}

/**
 * CIV6 (Dam): "Prevents damage from Floods on this River", and "Reduces yields
 * from Floods (Food and Production bonuses) by 50%" — the same two halves the
 * GREAT BATH pays, and the source's own words for both are that "a Dam or
 * Great Bath along a River will mitigate floods THERE". So the shield is a
 * property of the RIVER, not of the seat: one complete, unpillaged Dam or
 * Great Bath standing anywhere along it covers every tile it floods, whoever
 * owns them.
 */
export function riverShielded(reach: Tile[]): boolean {
  for (const t of reach) {
    if (t.district && t.districtComplete && !t.districtPillaged
        && DISTRICTS[t.district].floodShield) return true;
    if (t.builtWonder && t.builtWonderComplete
        && BUILT_WONDERS[t.builtWonder]?.effects?.floodMitigation) return true;
  }
  return false;
}

/** The three flood weights at `degrees` of warming: each row's own
 *  `ChanceIncreasePerDegree` on its weight (`warmedWeight`). */
export function floodWeights(degrees: number): number[] {
  return FLOOD_WEIGHT.map((w, sev) => warmedWeight(w, FLOOD_CIPD[sev], degrees));
}

/** A flood that no draw chose — the spy's breached Dam: ONE draw names the
 *  severity by the flood rows' weights at the world's warming. */
export function floodSeverity(state: GameState): number {
  const w = floodWeights(warmingDegrees(state));
  let total = 0;
  for (const x of w) total += x;
  const at = nextRandom(state) * total;
  let cum = 0;
  for (let i = 0; i < w.length; i++) {
    cum += w[i];
    if (at < cum) return i;
  }
  return w.length - 1;
}

/** A river a flood may strike: the plot its flood STARTS on and every plot
 *  of the river (a lone Floodplains plot is its own). */
export interface FloodRiver {
  start: Tile;
  plots: Tile[];
}

/**
 * The FLOOD RIVERS: one per river carrying Floodplains and one per
 * Floodplains plot no river touches, in the order of each one's lowest-index
 * Floodplains plot (the river walk is `riverReach`'s); a river's site is the
 * plot its flood starts on (`floodStart`). Static: rivers, Floodplains and
 * the map's water as made never move, so the exporter ships the starts
 * (`floodStarts`).
 */
export function floodRivers(map: GameMap): FloodRiver[] {
  const seen = new Uint8Array(map.tiles.length);
  const out: FloodRiver[] = [];
  for (const t of map.tiles) {
    if (t.feature !== 'FLOODPLAINS' || seen[t.index]) continue;
    seen[t.index] = 1;
    const river = [t];
    for (let i = 0; i < river.length; i++) {
      const u = river[i];
      for (let d = 0; d < 6; d++) {
        if (!(u.riverMask & (1 << d))) continue;
        const n = neighborTile(map, u, d);
        if (!n || seen[n.index]) continue;
        seen[n.index] = 1;
        river.push(n);
      }
    }
    out.push({ start: floodStart(map, river), plots: river });
  }
  return out;
}

/**
 * May this river flood yet? MEASURED (`runs/c74s2_turn_c74s2_duel*`: 1,806
 * of 1,806 river-turns one state per river, never falling back; 11 of 13
 * rivers turned floodable on the first turn a major revealed one of their
 * plots): a river floods once any major has revealed a plot of it. With no
 * fog every river is revealed.
 */
function riverRevealed(state: GameState, river: FloodRiver): boolean {
  if (!fogActive(state)) return true;
  return state.seats.some((s) => isCiv(s.seat) && river.plots.some((t) => isExplored(state, s.seat, t.index)));
}

/**
 * The plot a river's flood starts on — MEASURED (`runs/event_history_*`, 447 of 447 floods):
 * the FIRST plot of the river's floodplain list. This map's river model keeps
 * no flow direction, so the first plot is read as the river's UPSTREAM-MOST
 * Floodplains plot: the one farthest, in steps across river edges, from the
 * river's plots that touch the map's water as made (its mouth), ties to the
 * lowest index. A river touching no water, and a lone Floodplains plot, start
 * on their lowest-index Floodplains plot.
 */
function floodStart(map: GameMap, river: readonly Tile[]): Tile {
  const dist = new Map<number, number>();
  const queue = river.filter((u) => neighbors(map, u).some((n) => TERRAINS[n.terrain].water))
    .sort((a, b) => a.index - b.index);
  for (const u of queue) dist.set(u.index, 0);
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    for (let d = 0; d < 6; d++) {
      if (!(u.riverMask & (1 << d))) continue;
      const n = neighborTile(map, u, d);
      if (!n || dist.has(n.index)) continue;
      dist.set(n.index, dist.get(u.index)! + 1);
      queue.push(n);
    }
  }
  let best: Tile | null = null;
  let far = -1;
  for (const u of [...river].sort((a, b) => a.index - b.index)) {
    if (u.feature !== 'FLOODPLAINS') continue;
    const du = dist.get(u.index) ?? 0;
    if (du > far) {
      best = u;
      far = du;
    }
  }
  return best!;
}

export function floodRiver(state: GameState, start: Tile, sev: number): Tile[] {
  const reach = riverReach(state.map, start);
  const shielded = riverShielded(reach);
  for (const t of reach) floodTile(state, t, sev, shielded);
  return reach;
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
 * SEVEN draws per tile, always, whatever the tile holds — a draw count that
 * depended on what stood there would have to be mirrored
 * condition-for-condition on the other engine.
 */
export function floodTile(state: GameState, tile: Tile, sev: number, mitigated: boolean): void {
  // the tile REMEMBERS each flood episode — the Great Bath's faith counts
  // them (`Tile.floodCount`), mitigated floods included
  tile.floodCount = (tile.floodCount ?? 0) + 1;
  const rDestroy = nextRandom(state);
  const rDistrict = nextRandom(state);
  const rBldg = nextRandom(state);
  const rDamage = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rPop = nextRandom(state);
  const rFood = nextRandom(state);
  const rProd = nextRandom(state);

  const seat = tileSeat(tile);
  const col = floodTerrainColumn(tile.terrain);

  // CIV6 (Iteru, TRAIT_AVOID_*_FLOOD): Egypt's ground takes no flood damage;
  // the fertility half still lands.
  const immune = civOf(state, seat) === 'EGYPT';
  if (!mitigated && !immune) {
    scorch(state, tile);
    if (rDestroy < FLOOD_DESTROY_P[sev]) destroyImprovement(state, tile);
    if (rDistrict < FLOOD_DISTRICT_P[sev]) pillageDistrict(state, tile, true);
    if (rBldg < FLOOD_BLDG_P[sev]) pillageTileBuildings(state, tile);
    const dmg = FLOOD_DAMAGE_LO[sev]
      + Math.floor(rDamage * (FLOOD_DAMAGE_HI[sev] - FLOOD_DAMAGE_LO[sev] + 1));
    if (dmg > 0) {
      // A CITY CENTER on the floodplain loses HP and, if it has one, perimeter.
      hitCityCentre(state, tile, dmg);
      for (const u of [...unitsAt(state, tile.index)]) {
        if (unitIsNoncombat(u.type)) {
          // "Civilians killed" is its own column — a chance, not damage.
          if (rCivilian < FLOOD_POP_P[sev]) disbandUnit(state, u.id);
        } else {
          u.hp -= dmg;
          if (u.hp <= 0) disbandUnit(state, u.id);
        }
      }
    }
    if (rPop < FLOOD_POP_P[sev]) losePopulation(state, tile);
  }
  // FERTILIZATION. Each yield is its own roll, so one flood may pay both.
  // A mitigated river still silts, at half the rate.
  const half = mitigated ? 0.5 : 1;
  if (rFood < FLOOD_FERT_FOOD[sev][col] * half) fertilize(state, tile);
  if (rProd < FLOOD_FERT_PROD[sev][col] * half && fertilityLive(state)) {
    if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
      tile.fertilityProd = Math.min(FERTILITY_CAP, tile.fertilityProd + 1);
    }
  }
}

/** The families of the turn's one draw. */
export type EventFamily = 'eruption' | 'flood' | 'storm' | 'accident' | 'drought' | 'meteor' | 'fire';

/** One row of the turn's draw: its family, the row within it (an eruption's
 *  `ERUPTION_ROWS` index, a storm's `STORM_EVENTS` index, a fire's
 *  `FIRE_START_FEATURE` index, else the severity) and the weight each of its
 *  sites carries. */
export interface EventRow {
  family: EventFamily;
  sev: number;
  weight: number;
}

/**
 * THE DRAW'S ROWS, in the live game's `RandomEvents` order (MEASURED, the
 * `index` column of every event history, `tools/civ6lab/runs/
 * event_history_*`): Eyjafjallajokull's two eruptions (index 0-1), the three
 * floods (2-4), Kilimanjaro's two eruptions and Vesuvius's (5-7), the
 * volcano's three (8-10), the eight storms (11-18), the three nuclear
 * accidents (19-21), the two droughts (22-23), then the pack's Meteor Shower,
 * Jungle Fire and Forest Fire (31-33) — at `degrees` of warming. A flood,
 * storm, drought or fire row's weight grows by its own
 * `ChanceIncreasePerDegree` (`warmedWeight`); the eruptions, the accidents
 * and the meteor carry no such column and hold still.
 */
export function eventRows(degrees: number): EventRow[] {
  const rows: EventRow[] = [];
  const eruption = (from: number, to: number) => {
    for (let r = from; r < to; r++) rows.push({ family: 'eruption', sev: r, weight: ERUPTION_WEIGHT[r] });
  };
  eruption(0, 2);
  floodWeights(degrees).forEach((weight, sev) => rows.push({ family: 'flood', sev, weight }));
  eruption(2, ERUPTION_ROWS.length);
  stormWeights(degrees).forEach((weight, sev) => rows.push({ family: 'storm', sev, weight }));
  ACCIDENT_WEIGHT.forEach((weight, sev) => rows.push({ family: 'accident', sev, weight }));
  DROUGHT_WEIGHT.forEach((w, sev) => rows.push({ family: 'drought', sev, weight: warmedWeight(w, DROUGHT_CIPD[sev], degrees) }));
  rows.push({ family: 'meteor', sev: 0, weight: METEOR_WEIGHT });
  FIRE_WEIGHT.forEach((w, sev) => rows.push({ family: 'fire', sev, weight: warmedWeight(w, FIRE_CIPD[sev], degrees) }));
  return rows;
}

/** A city whose reactor can melt down, and its seat. */
interface ReactorSite {
  seat: number;
  city: City;
}

/**
 * May a Meteor Shower strike this plot? CIV6 (`RandomEvent_Terrains`) its
 * Plains, Grassland, Snow or Desert, flat or hills and above the sea;
 * (`AvoidTerritory`) nobody's plot; and room for the Meteor Site it leaves —
 * bare or under a feature the site stands on (`Improvement_ValidFeatures`),
 * no improvement, Tribal Village, Meteor Site or barbarian outpost there
 * already. `_meteor_cands` is the twin.
 */
export function meteorCandidate(t: Tile, camps: ReadonlySet<number>): boolean {
  if (isWater(t) || t.submerged || t.elevation === 'MOUNTAIN') return false;
  if (!METEOR_TERRAINS.includes(t.terrain)) return false;
  if (t.feature !== null && !METEOR_FEATURES.includes(t.feature)) return false;
  if (METEOR_AVOIDS_TERRITORY && tileSeat(t) >= 0) return false;
  return !t.improvement && !t.goodyHut && !t.meteor && !t.district && !t.builtWonder && !camps.has(t.index);
}

/** May fire row `row` start on this plot — a live plot of its feature above
 *  the sea? The same test is the spread's (`fireTurn`). */
function fireCandidate(t: Tile, row: number): boolean {
  return t.feature === FIRE_START_FEATURE[row] && !t.submerged;
}

/** A city a drought may anchor on: its centre and, by distance from it (the
 *  `DROUGHT_DISTANCE_WEIGHTS` index), the plots within reach a drought may
 *  start on, each list in ascending tile order. */
interface DroughtSite {
  centre: Tile;
  byDist: Tile[][];
}

/**
 * May a drought start on this plot now? MEASURED (`runs/c74s2_turn_c74s2_duel*`,
 * the whole-map read on each drought's turn, 13 of 13 starts): the plot and
 * all six of its neighbours are dry ground (`droughtGround`) — featureless
 * Plains or Grassland, a district's plot counting as featureless. A plot on
 * the map's edge lacks a neighbour and never qualifies. `centres` holds every
 * live city centre.
 */
export function droughtCandidate(map: GameMap, t: Tile, centres: ReadonlySet<number>): boolean {
  const dry = (u: Tile) => droughtGround(u, (u.district !== null && u.district !== 'CITY_CENTER') || centres.has(u.index));
  if (!dry(t)) return false;
  for (let d = 0; d < 6; d++) {
    const n = neighborTile(map, t, d);
    if (!n || !dry(n)) return false;
  }
  return true;
}

/** Every city — a major's, a Free City's, a city-state's — holding a plot a
 *  drought may start on (`droughtCandidate`) within reach of its centre, in
 *  ascending centre order. `_drought_sites` is the twin. */
function droughtSites(state: GameState): DroughtSite[] {
  const map = state.map;
  const reach = DROUGHT_DISTANCE_WEIGHTS.length - 1;
  const centres: number[] = [];
  for (const s of cityHolders(state)) for (const c of s.cities) centres.push(c.centerIndex);
  for (const cs of state.cityStates) centres.push(cs.centerIndex);
  centres.sort((a, b) => a - b);
  const live = new Set(centres);
  const out: DroughtSite[] = [];
  for (const i of centres) {
    const c = map.tiles[i];
    const byDist: Tile[][] = DROUGHT_DISTANCE_WEIGHTS.map(() => []);
    for (const t of tilesWithin(map, c.col, c.row, reach).sort((a, b) => a.index - b.index)) {
      if (droughtCandidate(map, t, live)) byDist[hexDistance(c.col, c.row, t.col, t.row)].push(t);
    }
    if (byDist.some((l) => l.length > 0)) out.push({ centre: c, byDist });
  }
  return out;
}

/**
 * A drought's start plot — MEASURED (`runs/event_history_*`): within reach of a city centre.
 * THREE draws: the city, uniformly over `sites`; the distance, by
 * `DROUGHT_DISTANCE_WEIGHTS` over the distances where that city holds a
 * start plot; the plot, uniformly over its plots at that distance.
 */
function droughtStart(state: GameState, sites: DroughtSite[]): Tile | undefined {
  const site = pick(state, sites);
  if (!site) return undefined;
  let total = 0;
  for (let d = 0; d < site.byDist.length; d++) if (site.byDist[d].length) total += DROUGHT_DISTANCE_WEIGHTS[d];
  const at = nextRandom(state) * total;
  let cum = 0;
  let dist = 0;
  for (let d = 0; d < site.byDist.length; d++) {
    if (!site.byDist[d].length) continue;
    dist = d;
    cum += DROUGHT_DISTANCE_WEIGHTS[d];
    if (at < cum) break;
  }
  return pick(state, site.byDist[dist]);
}

/** Every volcano starts DORMANT, and each dormant one WAKES at
 *  `VOLCANO_WAKE_P` a turn: ONE draw per dormant volcano, in ascending tile
 *  order, every turn. An active volcano stays active. */
function wakeVolcanoes(state: GameState): void {
  for (const t of state.map.tiles) {
    if (!t.volcano || t.volcanoActive) continue;
    if (nextRandom(state) < VOLCANO_WAKE_P) t.volcanoActive = true;
  }
}

/** The sites every row can strike this turn. A storm, a drought, the meteor
 *  and a fire is counted once per map whether or not its start plot exists
 *  (the plot is drawn after; a drought's needs a city, `droughtSites`); a
 *  flood has one site per river a major has revealed (`floodRivers`,
 *  `riverRevealed`), a volcano's eruption one per ACTIVE volcano, a natural
 *  wonder's one while the wonder stands (its plots together), an accident one
 *  per city whose reactor has reached the row's `MinTurnAtRisk` — whoever
 *  holds it, the Free Cities seat included — in ascending centre order. */
interface EventSites {
  flood: FloodRiver[];
  eruption: Tile[][][];  // per ERUPTION_ROWS row, its sites, each a site's plots
  storm: Tile[][];      // per family, the live start plots
  drought: DroughtSite[];
  accident: ReactorSite[][];  // per severity
  meteor: Tile[];
  fire: Tile[][];       // per fire row, its live start plots
}

function eventSites(state: GameState): EventSites {
  const map = state.map;
  const reactors: ReactorSite[] = [];
  for (const s of cityHolders(state)) {
    for (const city of s.cities) {
      if (city.reactorAge !== undefined) reactors.push({ seat: s.seat, city });
    }
  }
  reactors.sort((a, b) => a.city.centerIndex - b.city.centerIndex);
  const volcanoes = map.tiles.filter((t) => t.volcano && t.volcanoActive).map((t) => [t]);
  const camps = campTiles(state);
  return {
    flood: floodRivers(map).filter((r) => riverRevealed(state, r)),
    eruption: ERUPTION_WONDER.map((w) => {
      if (!w) return volcanoes;
      const plots = map.tiles.filter((t) => t.feature === w);
      return plots.length ? [plots] : [];
    }),
    storm: STORM_FAMILIES.map((f) => map.tiles.filter((t) => stormFamilyAt(t) === f)),
    drought: droughtSites(state),
    accident: ACCIDENT_MIN_TURN.map((gate) => reactors.filter((r) => (r.city.reactorAge ?? 0) >= gate)),
    meteor: map.tiles.filter((t) => meteorCandidate(t, camps)),
    fire: FIRE_START_FEATURE.map((_f, row) => map.tiles.filter((t) => fireCandidate(t, row))),
  };
}

/** A per-site row's sites, each by the plot its first-occurrence record
 *  lives on — a river's start plot, the volcano, a wonder's lowest-index
 *  plot, the reactor city's centre — in site order; null for a row counted
 *  once per map. */
function siteKeys(state: GameState, sites: EventSites, row: EventRow): Tile[] | null {
  switch (row.family) {
    case 'flood': return sites.flood.map((r) => r.start);
    case 'eruption': return sites.eruption[row.sev].map((plots) => plots[0]);
    case 'accident': return sites.accident[row.sev].map((r) => state.map.tiles[r.city.centerIndex]);
    case 'storm':
    case 'drought':
    case 'meteor':
    case 'fire':
      return null;
  }
}

/** A row's normaliser (`EVENT_NORM_*`): a row counted per site divides by
 *  the per-site reading, a row counted once per map by the per-map one. */
function eventNorm(family: EventFamily): number {
  switch (family) {
    case 'flood':
    case 'eruption':
    case 'accident':
      return EVENT_NORM_PER_SITE;
    case 'storm':
    case 'drought':
    case 'meteor':
    case 'fire':
      return EVENT_NORM_PER_MAP;
  }
}

/**
 * THE TURN'S ONE RANDOM EVENT — MEASURED (`runs/event_history_*`,
 * `runs/c74s2_turn_c74s2_duel*`): the game fires at most one event a turn.
 * Each (row, site) pair fires with the absolute chance p·b, p = weight / N
 * (`eventNorm`) and b the site's share in hundredths: a per-site pair that
 * has not yet fired this game carries 100 + `FIRST_TIME_OCCURRENCE_BOOST`,
 * one that has 100 (`Tile.eventFired` on its key plot, `siteKeys`); a row
 * counted once per map is one share of 100 whether or not its start plot
 * exists. The turn is EMPTY with what is left, and when the chances sum past
 * 1 they are scaled to sum to 1. ONE draw `x = r * max(1, total)` walks the
 * rows in table order: the row whose cumulative chance first exceeds `x`
 * fires, at the first site whose running share passes `(x - chance before
 * it) / p * 100` (the last site past them all); past the last row, nothing
 * fires. The draw is spent every turn. A drawn row that finds no start plot
 * is an empty turn. The storm's, the meteor's and the fire's plot is a
 * second draw over their start plots, the drought's three more
 * (`droughtStart`).
 */
function randomEvent(state: GameState, strip: boolean): void {
  const rows = eventRows(warmingDegrees(state));
  const sites = eventSites(state);
  const keys = rows.map((row) => siteKeys(state, sites, row));
  const shares = keys.map((k, i) => (k === null
    ? [100]
    : k.map((t) => (((t.eventFired ?? 0) >> i) & 1 ? 100 : 100 + FIRST_TIME_OCCURRENCE_BOOST))));
  const per = rows.map((row) => row.weight / eventNorm(row.family));
  const cum: number[] = [];
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    let s = 0;
    for (const b of shares[i]) s += b;
    total += per[i] * s / 100;
    cum.push(total);
  }
  const at = nextRandom(state) * Math.max(1, total);
  for (let i = 0; i < rows.length; i++) {
    if (shares[i].length === 0 || per[i] <= 0 || at >= cum[i]) continue;
    const before = i > 0 ? cum[i - 1] : 0;
    const u = (at - before) / per[i] * 100;
    let k = 0;
    let run = shares[i][0];
    while (k < shares[i].length - 1 && u >= run) {
      k += 1;
      run += shares[i][k];
    }
    const key = keys[i]?.[k];
    if (key) key.eventFired = (key.eventFired ?? 0) | (1 << i);
    fireEvent(state, rows[i], sites, k, strip);
    return;
  }
}

function fireEvent(state: GameState, row: EventRow, sites: EventSites, k: number, strip: boolean): void {
  switch (row.family) {
    case 'flood': {
      const start = sites.flood[k].start;
      const reach = floodRiver(state, start, row.sev);
      log(state, `Flood at (${start.col}, ${start.row}) — ${reach.length} floodplain tiles along the river.`);
      return;
    }
    case 'eruption': {
      erupt(state, sites.eruption[row.sev][k], row.sev);
      return;
    }
    case 'storm': {
      const ev = STORM_EVENTS[row.sev];
      const center = pick(state, sites.storm[STORM_FAMILIES.indexOf(ev.family)]);
      // a centre already under a storm takes no second one
      if (!center || (center.stormTurns ?? 0) > 0) return;
      center.stormEvent = row.sev;
      center.stormTurns = ev.duration;
      log(state, `Storm: ${ev.id} at (${center.col}, ${center.row}) — ${ev.hexes} tiles for ${ev.duration} turns.`);
      return;
    }
    case 'drought': {
      const center = droughtStart(state, sites.drought);
      if (!center) return;
      drought(state, center, row.sev, strip);
      return;
    }
    case 'accident': {
      const site = sites.accident[row.sev][k];
      nuclearAccident(state, site.seat, site.city, row.sev);
      return;
    }
    case 'meteor': {
      const at = pick(state, sites.meteor);
      if (!at) return;
      at.meteor = true;
      log(state, `Meteor shower at (${at.col}, ${at.row}) — a Meteor Site lies there.`);
      return;
    }
    case 'fire': {
      const at = pick(state, sites.fire[row.sev]);
      if (!at) return;
      ignite(at, state.turn);
      log(state, `Fire at (${at.col}, ${at.row}).`);
      return;
    }
  }
}

/** A plot catches fire on turn `start`, its own clock: its Woods or
 *  Rainforest becomes the burning form (`RandomEvent_Yields` Turn 0, Amount
 *  0 — burning pays nothing). */
function ignite(t: Tile, start: number): void {
  const row = FIRE_START_FEATURE.indexOf(t.feature ?? '');
  t.feature = FIRE_BURNING_FEATURE[row] as Tile['feature'];
  t.fireStart = start;
}

/**
 * THE FIRES' TURN, after the draw: every plot on fire, on its own clock
 * (`age` = turns since the plot caught). SPREAD first: each plot burning at
 * an age in `FIRE_SPREAD_TURNS` — the list taken before any spreads, so a
 * plot caught this turn does not spread this turn — draws once per adjacent
 * live plot of its own fire's feature (and of the other fire's where
 * `FIRE_SPREAD_CROSS` says so), in direction order, and at `FIRE_SPREAD_P`
 * sets it burning from this turn. Then each plot on fire, in ascending order: a
 * BURNING plot draws once for the UNIT_DAMAGE_LAND band and takes the rows
 * whose turns hold its age — its improvement and district pillaged, its
 * civilians killed and land units struck, and at `FIRE_POP_TURN` one citizen
 * of the owning city — then at `FIRE_BURNT_TURN` turns burnt, +1 Food; a
 * BURNT plot at `FIRE_REGROW_TURN` regrows its feature, +1 Production, and
 * the record goes. A plot whose fire's feature is gone keeps no record.
 */
function fireTurn(state: GameState): void {
  const map = state.map;
  const spreading = map.tiles.filter((t) => {
    if (t.fireStart === undefined || !FIRE_BURNING_FEATURE.includes(t.feature ?? '')) return false;
    const age = state.turn - t.fireStart;
    return age >= FIRE_SPREAD_TURNS[0] && age <= FIRE_SPREAD_TURNS[1];
  });
  for (const t of spreading) {
    const own = FIRE_BURNING_FEATURE.indexOf(t.feature ?? '');
    for (const n of neighbors(map, t)) {
      const row = FIRE_START_FEATURE.indexOf(n.feature ?? '');
      if (row < 0 || !fireCandidate(n, row) || (row !== own && !FIRE_SPREAD_CROSS[own])) continue;
      if (nextRandom(state) < FIRE_SPREAD_P) ignite(n, state.turn);
    }
  }
  for (const t of map.tiles) {
    if (t.fireStart === undefined) continue;
    const age = state.turn - t.fireStart;
    const burning = FIRE_BURNING_FEATURE.indexOf(t.feature ?? '');
    const burnt = FIRE_BURNT_FEATURE.indexOf(t.feature ?? '');
    if (burning >= 0) {
      const rDamage = nextRandom(state);
      if (age >= FIRE_DAMAGE_TURNS[0] && age <= FIRE_DAMAGE_TURNS[1]) {
        scorch(state, t);
        pillageDistrict(state, t, true);
        const dmg = FIRE_DMG[0] + Math.floor(rDamage * (FIRE_DMG[1] - FIRE_DMG[0] + 1));
        strikeUnits(state, t, tileSeat(t), { land: true, naval: false, civ: true, landDmg: dmg, navalDmg: 0 }, null);
      }
      if (age === FIRE_POP_TURN) losePopulation(state, t);
      if (age >= FIRE_BURNT_TURN) {
        t.feature = FIRE_BURNT_FEATURE[burning] as Tile['feature'];
        fertilize(state, t);
      }
    } else if (burnt >= 0) {
      if (age >= FIRE_REGROW_TURN) {
        t.feature = FIRE_START_FEATURE[burnt] as Tile['feature'];
        t.fireStart = undefined;
        if (fertilityLive(state) && !isWater(t) && t.elevation !== 'MOUNTAIN') {
          t.fertilityProd = Math.min(FERTILITY_CAP, t.fertilityProd + 1);
        }
      }
    } else {
      t.fireStart = undefined;
    }
  }
}

/**
 * A DROUGHT of severity `sev` centred on `center`: its footprint is the first
 * `DROUGHT_HEXES` slots of `STORM_DISC`, water skipped, each plot in the
 * disc's order (`droughtTile`).
 */
export function drought(state: GameState, center: Tile, sev: number, strip: boolean): void {
  const turns = DROUGHT_DURATION[sev];
  for (const t of stormFootprint(state.map, center, DROUGHT_HEXES)) {
    if (isWater(t)) continue;
    droughtTile(state, t, sev, turns, strip);
  }
  log(state, `Drought around (${center.col}, ${center.row}) — food suffers for ${turns} turns.`);
}

/**
 * ONE drought plot at severity `sev`. ONE draw, always, whatever stands there.
 * The plot dries for the row's turns; a listed improvement is pillaged
 * (SPECIFIC_IMPROVEMENT_PILLAGED 100) and, at the row's
 * SPECIFIC_IMPROVEMENT_DESTROYED chance, taken away instead; a warmed world
 * strips the plot's silt.
 */
function droughtTile(state: GameState, t: Tile, sev: number, turns: number, strip: boolean): void {
  const rDestroy = nextRandom(state);
  t.droughtTurns = Math.max(t.droughtTurns, turns);
  if (t.improvement && DROUGHT_IMPROVEMENTS.includes(t.improvement) && !envImmune(state, t)) {
    t.pillaged = true;
    if (rDestroy < DROUGHT_DESTROY_P[sev]) destroyImprovement(state, t);
  }
  if (strip) defertilize(t);
}

/**
 * The RING an eruption strikes: every plot touching one of `plots` (a
 * volcano's one plot, or a natural wonder's), none of them itself — each plot
 * in ascending order, its neighbours in direction order, a plot met twice
 * taken once.
 */
export function eruptionRing(map: GameMap, plots: readonly Tile[]): Tile[] {
  const skip = new Set(plots.map((p) => p.index));
  const out: Tile[] = [];
  for (const p of [...plots].sort((a, b) => a.index - b.index)) {
    for (const n of neighbors(map, p)) {
      if (skip.has(n.index)) continue;
      skip.add(n.index);
      out.push(n);
    }
  }
  return out;
}

/** +1 of a silt channel on a land, non-mountain plot, capped — while the
 *  climate still lays fertility down. */
function silt(state: GameState, tile: Tile, key: 'fertilityProd' | 'fertilitySci' | 'fertilityCul'): void {
  if (!fertilityLive(state) || isWater(tile) || tile.elevation === 'MOUNTAIN') return;
  tile[key] = Math.min(FERTILITY_CAP, (tile[key] ?? 0) + 1);
}

/**
 * AN ERUPTION of a volcano or of a natural wonder (`plots`, its plots), at
 * `ERUPTION_ROWS` row `row`. CIV6 (`RandomEvent_Yields` FEATURE_VOLCANIC_SOIL,
 * `ReplaceFeature`): FOUR draws per eligible ring plot, in ring order — the
 * paint at the row's YIELD_FOOD chance, then its YIELD_PRODUCTION,
 * YIELD_SCIENCE and YIELD_CULTURE chances, each +1 of that yield on a plot
 * the draw painted; then each ring plot, in ring order, takes the row's
 * damage (`eruptTile`) and is fertilized.
 */
export function erupt(state: GameState, plots: readonly Tile[], row: number): void {
  const ring = eruptionRing(state.map, plots);
  const volcano = plots[0];
  for (const n of ring) {
    if (!soilPaintable(n)) continue;
    const rPaint = nextRandom(state);
    const rProd = nextRandom(state);
    const rSci = nextRandom(state);
    const rCul = nextRandom(state);
    if (rPaint >= ERUPTION_PAINT_P[row]) continue;
    paintVolcanicSoil(n);
    if (rProd < ERUPTION_PROD_P[row]) silt(state, n, 'fertilityProd');
    if (rSci < ERUPTION_SCI_P[row]) silt(state, n, 'fertilitySci');
    if (rCul < ERUPTION_CUL_P[row]) silt(state, n, 'fertilityCul');
  }
  for (const n of ring) {
    eruptTile(state, n, row);
    fertilize(state, n);
  }
  log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
}

/**
 * ONE eruption's damage on one ring plot — MEASURED (`runs/volcano_own_*`): the row's
 * `RandomEvent_Damages` land on an OWNED plot only, applied as the flood's
 * are; every BONUS resource on a land plot of the ring is lost whoever owns
 * it (strategic and luxury stay). SIX draws per plot, always, whatever
 * stands there or whoever owns it: improvement destroyed, district pillaged,
 * buildings pillaged, the HP band, civilian killed, population. The
 * improvement is pillaged outright (IMPROVEMENT_PILLAGED 100 on every row);
 * the land units and a city centre take the band (UNIT_DAMAGE_LAND,
 * CITY_GARRISON, CITY_WALLS, Percentage 100); no row names UNIT_DAMAGE_NAVAL,
 * so a hull on a water plot is untouched.
 */
function eruptTile(state: GameState, tile: Tile, row: number): void {
  const rDestroy = nextRandom(state);
  const rDistrict = nextRandom(state);
  const rBldg = nextRandom(state);
  const rDamage = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rPop = nextRandom(state);
  if (tile.resource && !isWater(tile) && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
  if (tileSeat(tile) < 0) return;
  scorch(state, tile);
  if (rDestroy < ERUPTION_DESTROY_P[row]) destroyImprovement(state, tile);
  if (rDistrict < ERUPTION_DISTRICT_P[row]) pillageDistrict(state, tile, true);
  if (rBldg < ERUPTION_BLDG_P[row]) pillageTileBuildings(state, tile);
  const dmg = ERUPTION_DMG_LO[row]
    + Math.floor(rDamage * (ERUPTION_DMG_HI[row] - ERUPTION_DMG_LO[row] + 1));
  if (dmg > 0) hitCityCentre(state, tile, dmg);
  strikeUnits(state, tile, tileSeat(tile), {
    land: dmg > 0, naval: false, civ: rCivilian < ERUPTION_CIV_KILL_P[row], landDmg: dmg, navalDmg: 0,
  }, null);
  if (rPop < ERUPTION_POP_P[row]) losePopulation(state, tile);
}

/** CIV6 (Nuclear accident): each city's reactor ages one turn for every turn
 *  since its plant was built, converted to, or last recommissioned. A city
 *  with no plant has no reactor, and a plant lost with the building takes its
 *  clock with it. Every holder's cities age, the Free Cities' included. */
export function ageReactors(cities: readonly City[]): void {
  for (const city of cities) {
    if (city.buildings.includes('NUCLEAR_POWER_PLANT')) {
      city.reactorAge = (city.reactorAge ?? 0) + 1;
    } else if (city.reactorAge !== undefined) {
      city.reactorAge = undefined;
    }
  }
}

/**
 * A NUCLEAR ACCIDENT at one severity, in one city — MEASURED over 225 forced
 * accidents. FIVE draws, always: the Industrial Zone is pillaged at the
 * row's district chance, ONE citizen is lost at its population chance (never
 * the last), and the units on the reactor's own plot take the row's
 * UNIT_DAMAGE_LAND share and band and its UNIT_KILLED_CIVILIAN chance
 * (`strikeUnits`, one roll per plot as every event reads them). Fallout lies
 * on that plot, the Industrial Zone, for the row's turns. No building is
 * destroyed, no ring improvement pillaged, no unit off the plot struck, and
 * the plant is never pillaged: it stays, ageing on.
 */
export function nuclearAccident(state: GameState, seat: number, city: City, sev: number): void {
  const rDistrict = nextRandom(state);
  const rPop = nextRandom(state);
  const rLand = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rHp = nextRandom(state);
  const iz = city.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
  if (iz) {
    const t = state.map.tiles[iz.tileIndex];
    t.falloutTurns = Math.max(t.falloutTurns ?? 0, ACCIDENT_FALLOUT[sev]);
    if (rDistrict < ACCIDENT_DISTRICT_P[sev]) pillageDistrict(state, t, false);
    strikeUnits(state, t, tileSeat(t), {
      land: rLand < ACCIDENT_LAND_P[sev],
      naval: false,
      civ: rCivilian < ACCIDENT_CIV_KILL_P[sev],
      landDmg: ACCIDENT_DMG_LO[sev] + Math.floor(rHp * (ACCIDENT_DMG_HI[sev] - ACCIDENT_DMG_LO[sev] + 1)),
      navalDmg: 0,
    }, null);
  }
  if (rPop < ACCIDENT_POP_P[sev] && city.population > 1) {
    city.population -= 1;
    logPopWrite(state, city, 'ds');
    (state.aidHit ??= []).push(seat);  // CIV6 (Aid Request trigger)
  }
  log(state, `Nuclear accident in ${city.name} — severity ${sev}.`);
}

export function disasterPhase(state: GameState): void {
  const map = state.map;
  const strip = desertificationLive(state);

  for (const t of map.tiles) {
    if (t.droughtTurns > 0) t.droughtTurns -= 1;
    // CIV6: fallout lasts "for 10 turns" / "for 20 turns" from the blast, and
    // a tile is clean again when the timer expires.
    if ((t.falloutTurns ?? 0) > 0) t.falloutTurns = (t.falloutTurns ?? 0) - 1;
  }

  wakeVolcanoes(state);
  // CIV6 (RANDOM_EVENT_START_TURN): no event fires before its first turn, and
  // no draw is spent
  if (state.turn >= RANDOM_EVENT_START_TURN) randomEvent(state, strip);
  fireTurn(state);
  // CIV6 (`RandomEvents`, Duration 3 / Movement 8 — MEASURED, ask 16): a
  // storm lives three turns. ENTRY: the footprint at the strike plot.
  // MOVEMENT: the centre walks `STORM_MOVEMENT` unit steps, then the
  // footprint lands where it stopped. DISSIPATION: the centre walks once
  // more and does no damage. Live storms go in ascending centre index, the
  // list taken BEFORE any of them moves, so none walks twice in one turn.
  const live = map.tiles.filter((t) => (t.stormTurns ?? 0) > 0);
  for (let center of live) {
    const ev = STORM_EVENTS[center.stormEvent!];
    const age = ev.duration - (center.stormTurns ?? 0); // 0 entry, 1 movement, 2 dissipation
    if (age >= 1) center = stormWalk(state, center, ev);
    if (age <= 1) stormTurn(state, center, ev, strip);
    center.stormTurns = (center.stormTurns ?? 0) - 1;
    if (center.stormTurns <= 0) center.stormEvent = -1;
  }
  // CIV6 (EMERGENCY_SEND_AID, Trigger PLAYER_LOSES_POP_TO_RANDOM_EVENT): the
  // phase's LOWEST victim civilization asks for aid — resolved once at the
  // end, so the order the two engines walk the turn's events cannot pick a
  // different victim; a city-state's or Free City's loss raises nothing
  const hits = (state.aidHit ?? []).filter((s) => isCiv(s));
  if (hits.length) raiseAidRequest(state, Math.min(...hits));
  state.aidHit = undefined;
}

/**
 * THE STORM'S WALK — CIV6 (`Movement 8`, measured over 31 storms):
 * eight UNIT STEPS in the one turn, each step's heading drawn from the
 * `PrevailingWinds` band of the centre's CURRENT latitude, and the step
 * DROPPED where the storm's own terrain rule fails at the destination (a
 * hurricane stays on `TERRAIN_OCEAN`), where the map ends, or where another
 * storm's centre stands — the record has one tile. The resultant lands 4-8
 * hexes away in open water, 1-5 against an obstacle. ONE draw per step,
 * taken or dropped, so both engines' streams move alike: `pick` in
 * [0, sum of the band's weights) names the first heading whose cumulative
 * weight exceeds it, in the hex order E NE NW W SW SE. Returns the tile the
 * record ends on.
 */
export function stormWalk(state: GameState, center: Tile, ev: StormEvent): Tile {
  const map = state.map;
  for (let step = 0; step < STORM_MOVEMENT; step++) {
    const w = PREVAILING_WINDS[windBand(center.row, map.height)];
    const total = w.reduce((a, b) => a + b, 0);
    let pick = Math.floor(nextRandom(state) * total);
    let d = 0;
    while (d < 5 && pick >= w[d]) { pick -= w[d]; d++; }
    const dest = neighborTile(map, center, d);
    if (!dest || stormFamilyAt(dest) !== ev.family || (dest.stormTurns ?? 0) > 0) continue;
    dest.stormEvent = center.stormEvent;
    dest.stormTurns = center.stormTurns;
    center.stormEvent = -1;
    center.stormTurns = 0;
    center = dest;
  }
  return center;
}

/** [8] the storm rows' weights at `degrees` of warming: each row's own
 *  `ChanceIncreasePerDegree` on its weight (`warmedWeight`). */
export function stormWeights(degrees: number): number[] {
  return STORM_EVENTS.map((ev) => warmedWeight(ev.weight, ev.cipd, degrees));
}

/** The first `hexes` slots of `STORM_DISC` around a centre, on-map ones only,
 *  in the disc's canonical order. */
export function stormFootprint(map: GameMap, center: Tile, hexes: number): Tile[] {
  const [cq, cr] = offsetToAxial(center.col, center.row);
  const out: Tile[] = [];
  for (let k = 0; k < hexes && k < STORM_DISC.length; k++) {
    const [dq, dr] = STORM_DISC[k];
    const [c, r] = axialToOffset(cq + dq, cr + dr);
    const t = tileAt(map, c, r);
    if (t) out.push(t);
  }
  return out;
}

function stormTurn(state: GameState, center: Tile, ev: StormEvent, strip: boolean): void {
  for (const t of stormFootprint(state.map, center, ev.hexes)) stormTile(state, t, ev, strip);
}

/** CIV6 (NO_UNIT_DAMAGE, COLLECTION_OWNER): the unit's owner plays a row
 *  naming this event. */
function stormSpares(state: GameState, unitSeat: number, ev: StormEvent): boolean {
  const civ = civOf(state, unitSeat);
  const leader = leaderOf(state, unitSeat);
  return STORM_UNIT_ROWS.some((r) => r.effect === 'noDamage' && r.event === ev.id && rowIsFor(r, civ, leader));
}

/** CIV6 (MODIFIED_DAMAGE_OPPOSING_PLAYER, Amount): the +percent a unit takes
 *  standing on ground owned by a carrier it is at war with; 0 otherwise. */
function stormExtraPct(state: GameState, unitSeat: number, owner: number, ev: StormEvent): number {
  if (owner < 0 || owner === unitSeat || !civsAtWar(state, unitSeat, owner)) return 0;
  const civ = civOf(state, owner);
  const leader = leaderOf(state, owner);
  let pct = 0;
  for (const r of STORM_UNIT_ROWS) {
    if (r.effect === 'doubleOpposing' && r.event === ev.id && rowIsFor(r, civ, leader)) pct += r.amount;
  }
  return pct;
}

/**
 * ONE storm turn on one footprint tile.
 *
 * ELEVEN draws per tile, always, whatever stands there — one per damage column
 * plus the HP band and the two yields — so the stream never depends on the
 * tile's contents. Order: improvement pillaged, improvement destroyed,
 * district pillaged, population, civilian killed, land share, naval share,
 * HP band, food, production.
 *
 * READINGS shared with the GPU twin: a domain's `Percentage` is one roll per
 * tile for ALL that domain's units on it; an embarked unit is its chassis'
 * domain; an air unit or a spy holds no tile and is neither domain; a city
 * centre on the footprint takes nothing (no storm row names CITY_GARRISON or
 * CITY_WALLS); BUILDING_PILLAGED is its own per-tile roll.
 */
export function stormTile(state: GameState, tile: Tile, ev: StormEvent, strip: boolean): void {
  const rPill = nextRandom(state);
  const rDestroy = nextRandom(state);
  const rDistrict = nextRandom(state);
  const rBldgS = nextRandom(state);
  const rPop = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rLand = nextRandom(state);
  const rNaval = nextRandom(state);
  const rHp = nextRandom(state);
  const rFood = nextRandom(state);
  const rProd = nextRandom(state);

  const owner = tileSeat(tile);
  const lowland = (tile.lowland ?? 0) > 0;
  const pillP = lowland && ev.lowlandPill > 0 ? ev.lowlandPill : ev.impPill;
  const distP = lowland && ev.lowlandDist > 0 ? ev.lowlandDist : ev.distPill;
  if (rPill < pillP) scorch(state, tile);
  if (rDestroy < ev.impDest) destroyImprovement(state, tile);
  if (rDistrict < distP) pillageDistrict(state, tile, true);
  if (rBldgS < ev.bldgPill) pillageTileBuildings(state, tile);
  if (rPop < ev.pop) losePopulation(state, tile);
  strikeUnits(state, tile, owner, {
    land: rLand < ev.landP,
    naval: rNaval < ev.navalP,
    civ: rCivilian < ev.civKill,
    landDmg: ev.landLo + Math.floor(rHp * (ev.landHi - ev.landLo + 1)),
    navalDmg: ev.navalLo + Math.floor(rHp * (ev.navalHi - ev.navalLo + 1)),
  }, ev);
  // FERTILITY, each yield its own roll — or, past Phase IV, the reverse:
  // CIV6 "all Storms and Droughts now start removing fertility from tiles
  // instead of adding it".
  if (strip) {
    defertilize(tile);
    return;
  }
  if (rFood < ev.fertFood) fertilize(state, tile);
  if (rProd < ev.fertProd && fertilityLive(state) && !isWater(tile) && tile.elevation !== 'MOUNTAIN') {
    tile.fertilityProd = Math.min(FERTILITY_CAP, tile.fertilityProd + 1);
  }
}
