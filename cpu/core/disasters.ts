
import type { City, CityState, GameState, Tile } from './types';
import { logPopWrite } from './difflog';
import type { GameMap, ImprovementId } from '../../world/types';
import { IMPROVEMENTS } from '../data/improvements';
import { neighborTile, neighbors, offsetToAxial, axialToOffset, tileAt, hexDistance, DIR_NE, DIR_E, DIR_SE, DIR_SW, DIR_W, DIR_NW } from '../../world/hex';
import { hasRiver, isCoastalLand, isImpassable, isWater } from '../../world/query';
import { isFloodplains } from '../../world/features';
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
import { cityAtIndex } from './units';
import { outerPool } from './rules';
import { buildingPillaged, pillageBuilding } from './yields';
import { centerBuildingIds } from './prodLayout';
import { unitsAt } from './units';
import { disbandUnit } from './units';
import { unitDomain } from './units';
import { FLOOD_WEIGHT, FLOOD_CIPD, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn, FLOOD_BLDG_P, warmedWeight, RANDOM_EVENT_START_TURN } from '../data/disasters';
import { ERUPTION_WEIGHT, DROUGHT_WEIGHT, DROUGHT_CIPD, DROUGHT_DURATION, DROUGHT_HEXES, DROUGHT_IMPROVEMENTS, DROUGHT_DESTROY_P, droughtGround, SOIL_REPLACES } from '../data/disasters';
import { ERUPTION_PAINT_P, ERUPTION_DESTROY_P, ERUPTION_DISTRICT_P, ERUPTION_BLDG_P, ERUPTION_POP_P, ERUPTION_CIV_KILL_P, ERUPTION_DMG_LO, ERUPTION_DMG_HI, ERUPTION_ROWS, ERUPTION_WONDER, ERUPTION_PROD_P, ERUPTION_SCI_P, ERUPTION_CUL_P } from '../data/disasters';
import { FIRST_TIME_OCCURRENCE_BOOST, EVENT_OCC_SCALE, STANDARD_MAP_AREA, PERCENT_VOLCANOES_ACTIVE, VOLCANO_ROLL_TURNS, DROUGHT_SPACING } from '../data/disasters';
import { TURN_LIMIT } from './game';
import { METEOR_WEIGHT, METEOR_TERRAINS, METEOR_FEATURES, METEOR_AVOIDS_TERRITORY } from '../data/disasters';
import { FIRE_WEIGHT, FIRE_CIPD, FIRE_START_FEATURE, FIRE_BURNING_FEATURE, FIRE_BURNT_FEATURE, FIRE_BURNT_TURN, FIRE_REGROW_TURN, FIRE_SPREAD_P, FIRE_SPREAD_TURNS, FIRE_SPREAD_CROSS, FIRE_DAMAGE_TURNS, FIRE_POP_TURN, FIRE_DMG } from '../data/disasters';
import { ACCIDENT_ROWS, ACCIDENT_WEIGHT, ACCIDENT_MIN_TURN, ACCIDENT_FALLOUT, ACCIDENT_DISTRICT_P, ACCIDENT_BLDG_P, ACCIDENT_POP_P, ACCIDENT_LAND_P, ACCIDENT_DMG_LO, ACCIDENT_DMG_HI, ACCIDENT_CIV_KILL_P } from '../data/disasters';
import { STORM_EVENTS, STORM_FAMILIES, STORM_DISC, STORM_UNIT_ROWS, stormFamilyAt, windWeights, STORM_MOVEMENT, STORM_STEP_COST_ON, STORM_STEP_COST_OFF, STORM_LAST_TURN_PCT, type StormEvent } from '../data/disasters';
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
 *  CENTER is never pillaged. DISTRICT_PILLAGED takes every building standing
 *  in the district too, a city-state's alike
 *  (runs/c74s3_bldg_pillage_20260926T133346Z.jsonl: 13 of 13). */
function pillageDistrict(state: GameState, tile: Tile): void {
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete
      && !tile.districtPillaged && !envImmune(state, tile)) {
    tile.districtPillaged = true;
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
 *  it has one, perimeter, by the row's one damage roll (`hitCityHp`,
 *  `hitCityWalls`). */
function hitCityCentre(state: GameState, tile: Tile, dmg: number): void {
  hitCityHp(state, tile, dmg);
  hitCityWalls(state, tile, dmg);
}

/** CITY_GARRISON: a CITY CENTRE on the tile loses `dmg` HP, never below 1. */
function hitCityHp(state: GameState, tile: Tile, dmg: number): void {
  const held = cityAtIndex(state, tile.index);
  if (held) held.city.hp = Math.max(1, held.city.hp - dmg);
}

/** CITY_WALLS: a CITY CENTRE on the tile with a perimeter loses `dmg` of it. */
function hitCityWalls(state: GameState, tile: Tile, dmg: number): void {
  const held = cityAtIndex(state, tile.index);
  if (!held) return;
  const outer = outerPool(state, held.city);
  if (outer > 0) held.city.outerHp = Math.max(0, outer - dmg);
}

/** What the tile's units take from one event: each unit's own damage draw
 *  where its domain's row fired (`unitDamageDraws`, null where it did not),
 *  and the civilians' kill roll. */
interface UnitStrike {
  land: ReadonlyMap<number, number> | null;
  naval: ReadonlyMap<number, number> | null;
  civ: boolean;
}

/**
 * UNIT_DAMAGE_LAND / UNIT_DAMAGE_NAVAL's applier (GameCore_XP2_Release.dll
 * 0x3366a0, tools/civ6lab/dll_readings.md, the eruption section): ONE "Random Event Unit
 * Damage Roll" per unit of the row's domain on the plot — no civilian; an
 * aircraft or a spy holds no tile — in unit order, each MinHP + rand(MaxHP −
 * MinHP). The plot's owner does not gate it. Unit id → damage;
 * `_unit_damage_draws` is the twin.
 */
function unitDamageDraws(state: GameState, tile: Tile, naval: boolean, lo: number, hi: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const u of unitsAt(state, tile.index)) {
    const dom = unitDomain(u.type);
    if (dom === 'air' || dom === 'spy' || dom === 'civilian' || !!UNITS[u.type]?.naval !== naval) continue;
    out.set(u.id, lo + Math.floor(nextRandom(state) * (hi - lo)));
  }
  return out;
}

/**
 * UNIT_DAMAGE_LAND / UNIT_DAMAGE_NAVAL / UNIT_KILLED_CIVILIAN on one tile's
 * units, every event alike. READINGS shared with the GPU twin: a domain's
 * share roll is one per tile, and each unit it strikes takes its own damage
 * draw; an embarked unit is its chassis' domain; an air unit or a spy holds
 * no tile and is neither domain. A storm's roster rows (`stormSpares`,
 * `stormExtraPct`) read `ev`; an event with none passes null.
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
    const base = (naval ? s.naval : s.land)?.get(u.id);
    if (base === undefined) continue;
    const pct = ev ? stormExtraPct(state, u.seat, owner, ev) : 0;
    const dmg = base + Math.floor(base * pct / 100);
    u.hp -= dmg;
    if (u.hp <= 0) disbandUnit(state, u.id);
  }
}

/** Does an eruption's row reach this neighbour at all? (the damage pass
 *  0xa1c1a0 and the soil pass 0xa219e0, `tools/civ6lab/dll_readings.md`
 *  "the eruption's soil"): not an impassable plot, and bare or under a Removable feature
 *  (Woods, Rainforest, Marsh — `SOIL_REPLACES`) or the Eruptable Volcanic
 *  Soil (`Features_XP2`). */
function eruptionReaches(t: Tile): boolean {
  if (isImpassable(t)) return false;
  return t.feature === null || SOIL_REPLACES.includes(t.feature) || t.feature === 'VOLCANIC_SOIL';
}

/** May an eruption's soil row draw on this neighbour? One the eruption
 *  reaches (`eruptionReaches`), above the sea. `_soil_paintable` is the twin. */
export function soilPaintable(t: Tile): boolean {
  return eruptionReaches(t) && !isWater(t) && !t.submerged;
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
  const out = map.tiles.filter((t: Tile) => seen.has(t.index) && isFloodplains(t.feature));
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

/** A row's `OccurrencesPerGame` in the draw's tenths, trunc(10·Occ). */
function occTenths(occ: number): number {
  return Math.floor(EVENT_OCC_SCALE * occ);
}

/** A once-per-map row's weight on a map of `area` plots: its tenths times
 *  the area over MAPSIZE_STANDARD's, in integers (GameCore_XP2 0x28d0f0). */
function mapScaled(occ: number, area: number): number {
  return Math.floor((occTenths(occ) * area) / STANDARD_MAP_AREA);
}

/** The three flood weights at `degrees` of warming, per river: each row's
 *  tenths warmed by its own `ChanceIncreasePerDegree` (`warmedWeight`). */
export function floodWeights(degrees: number): number[] {
  return FLOOD_WEIGHT.map((w, sev) => warmedWeight(occTenths(w), FLOOD_CIPD[sev], degrees));
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
    if (!isFloodplains(t.feature) || seen[t.index]) continue;
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
    if (!isFloodplains(u.feature)) continue;
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
    // the improvement, district, building and population rows need an OWNED
    // plot; the city and unit rows do not (the applier 0x336a50)
    const owned = seat >= 0;
    if (owned) {
      scorch(state, tile);
      if (rDestroy < FLOOD_DESTROY_P[sev]) destroyImprovement(state, tile);
      if (rDistrict < FLOOD_DISTRICT_P[sev]) pillageDistrict(state, tile);
      if (rBldg < FLOOD_BLDG_P[sev]) pillageTileBuildings(state, tile);
    }
    // CITY_GARRISON / CITY_WALLS: the plot's one band roll — a CITY CENTER on
    // the floodplain loses HP and, if it has one, perimeter
    const dmg = FLOOD_DAMAGE_LO[sev]
      + Math.floor(rDamage * (FLOOD_DAMAGE_HI[sev] - FLOOD_DAMAGE_LO[sev] + 1));
    if (dmg > 0) hitCityCentre(state, tile, dmg);
    // UNIT_DAMAGE_LAND, one draw per land unit on the plot, and "Civilians
    // killed", its own column — a chance, not damage — through the shared
    // applier
    const land = FLOOD_DAMAGE_HI[sev] > 0
      ? unitDamageDraws(state, tile, false, FLOOD_DAMAGE_LO[sev], FLOOD_DAMAGE_HI[sev]) : null;
    strikeUnits(state, tile, seat, { land, naval: null, civ: rCivilian < FLOOD_POP_P[sev] }, null);
    if (owned && rPop < FLOOD_POP_P[sev]) losePopulation(state, tile);
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
 * Jungle Fire and Forest Fire (31-33) — on a map of `area` plots at
 * `degrees` of warming. Every weight is an integer in the draw's tenths
 * (`occTenths`): a row counted once per map (storms, droughts, the meteor,
 * fires) scaled by the map's area (`mapScaled`), a row counted per site
 * (floods, eruptions, accidents) not. A flood, storm, drought or fire row's
 * weight grows by its own `ChanceIncreasePerDegree` (`warmedWeight`); the
 * eruptions, the accidents and the meteor carry no such column and hold
 * still.
 */
export function eventRows(degrees: number, area: number): EventRow[] {
  const rows: EventRow[] = [];
  const eruption = (from: number, to: number) => {
    for (let r = from; r < to; r++) rows.push({ family: 'eruption', sev: r, weight: occTenths(ERUPTION_WEIGHT[r]) });
  };
  eruption(0, 2);
  floodWeights(degrees).forEach((weight, sev) => rows.push({ family: 'flood', sev, weight }));
  eruption(2, ERUPTION_ROWS.length);
  stormWeights(degrees, area).forEach((weight, sev) => rows.push({ family: 'storm', sev, weight }));
  ACCIDENT_WEIGHT.forEach((w, sev) => rows.push({ family: 'accident', sev, weight: occTenths(w) }));
  DROUGHT_WEIGHT.forEach((w, sev) => rows.push({ family: 'drought', sev, weight: warmedWeight(mapScaled(w, area), DROUGHT_CIPD[sev], degrees) }));
  rows.push({ family: 'meteor', sev: 0, weight: mapScaled(METEOR_WEIGHT, area) });
  FIRE_WEIGHT.forEach((w, sev) => rows.push({ family: 'fire', sev, weight: warmedWeight(mapScaled(w, area), FIRE_CIPD[sev], degrees) }));
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

/** The plots of the live events a drought keeps its distance from: every
 *  storm's centre, every plot under a drought and every burning plot. */
export function liveEventPlots(state: GameState): Tile[] {
  return state.map.tiles.filter((t) => (t.stormTurns ?? 0) > 0 || t.droughtTurns > 0
    || (t.fireStart !== undefined && FIRE_BURNING_FEATURE.includes(t.feature ?? '')));
}

/**
 * May a drought start on this plot now? (Game_Climate "Pick Drought Start
 * Plot", GameCore_XP2 0x287e80 and its predicate 0x28eb60;
 * `tools/civ6lab/dll_drought.py`: 13 of 13 starts on a candidate, 34 of 34
 * empty draws with none.) The plot and all six of its neighbours are dry
 * ground (`droughtGround`: featureless Plains or Grassland, hills included,
 * a district's plot or a city centre counting as featureless), with no river,
 * beside no Coast or Ocean (`isCoastalLand`; a lake is no ocean-sized body)
 * and under no live event (`live`). A plot on the map's edge lacks a
 * neighbour and never qualifies. `centres` holds every live city centre.
 */
export function droughtCandidate(map: GameMap, t: Tile, centres: ReadonlySet<number>, live: ReadonlySet<number>): boolean {
  const dry = (u: Tile) => droughtGround(u, (u.district !== null && u.district !== 'CITY_CENTER') || centres.has(u.index))
    && !hasRiver(u) && !isCoastalLand(map, u) && !live.has(u.index);
  if (!dry(t)) return false;
  for (let d = 0; d < 6; d++) {
    const n = neighborTile(map, t, d);
    if (!n || !dry(n)) return false;
  }
  return true;
}

/**
 * A drought's start plot: ONE weighted draw over every candidate plot of the
 * map (`droughtCandidate`) in ascending order, each weighing 1 + min(its hex
 * distance to the nearest live event plot, `DROUGHT_SPACING`) — no city
 * anchor (GameCore_XP2 0x287e80). No candidate, no draw. `_drought_start` is
 * the twin.
 */
export function droughtStart(state: GameState): Tile | undefined {
  const map = state.map;
  const centres = new Set<number>();
  for (const s of cityHolders(state)) for (const c of s.cities) centres.add(c.centerIndex);
  for (const cs of state.cityStates) centres.add(cs.centerIndex);
  const events = liveEventPlots(state);
  const live = new Set(events.map((t) => t.index));
  const cands: Tile[] = [];
  const weights: number[] = [];
  let total = 0;
  for (const t of map.tiles) {
    if (!droughtCandidate(map, t, centres, live)) continue;
    let d: number = DROUGHT_SPACING;
    for (const e of events) d = Math.min(d, hexDistance(t.col, t.row, e.col, e.row));
    cands.push(t);
    weights.push(1 + d);
    total += 1 + d;
  }
  if (total === 0) return undefined;
  const at = Math.floor(nextRandom(state) * total);
  let cum = 0;
  for (let i = 0; i < cands.length; i++) {
    cum += weights[i];
    if (at < cum) return cands[i];
  }
  return cands[cands.length - 1];
}

/**
 * THE VOLCANO ROLL — ONE roll a turn for the whole map ("Active Volcano Roll",
 * GameCore_XP2 0x335040; `tools/civ6lab/dll_volcano.py`). V the volcanoes, A
 * the active ones, W the volcanic wonders standing (always active); the active
 * share pct = 100·(A + W) // (V + W) and D = `VOLCANO_ROLL_TURNS` // (2V).
 * Below `PERCENT_VOLCANOES_ACTIVE`: D //= (70 − pct)·V // 100 when that
 * product reaches 200, and rand(D) = 0 wakes ONE dormant volcano, drawn
 * uniformly in ascending tile order ("Choose Active Volcano Roll"); at or
 * above it, with an active volcano, rand(D) = 0 puts ONE active volcano to
 * sleep, drawn the same way. `_volcano_roll` is the twin.
 */
function volcanoRoll(state: GameState): void {
  const volcanoes = state.map.tiles.filter((t) => t.volcano);
  const v = volcanoes.length;
  if (v === 0) return;
  const w = new Set(ERUPTION_WONDER.filter((f): f is string => !!f && state.map.tiles.some((t) => t.feature === f))).size;
  const active = volcanoes.filter((t) => t.volcanoActive);
  const pct = Math.floor((100 * (active.length + w)) / (v + w));
  let d = Math.floor(VOLCANO_ROLL_TURNS / (2 * v));
  const wake = pct < PERCENT_VOLCANOES_ACTIVE;
  if (wake) {
    const x = (PERCENT_VOLCANOES_ACTIVE - pct) * v;
    if (x >= 200) d = Math.floor(d / Math.floor(x / 100));
  } else if (active.length === 0) {
    return;
  }
  if (Math.floor(nextRandom(state) * Math.max(d, 1)) !== 0) return;
  const from = wake ? volcanoes.filter((t) => !t.volcanoActive) : active;
  const t = from[Math.floor(nextRandom(state) * from.length)];
  t.volcanoActive = wake;
}

/** The sites every row can strike this turn. A storm, a drought, the meteor
 *  and a fire is counted once per map whether or not its start plot exists
 *  (the plot is drawn after, a drought's over the map, `droughtStart`); a
 *  flood has one site per river a major has revealed (`floodRivers`,
 *  `riverRevealed`), a volcano's eruption one per ACTIVE volcano, a natural
 *  wonder's one while the wonder stands (its plots together), an accident one
 *  per city whose reactor has reached the row's `MinTurnAtRisk` — whoever
 *  holds it, the Free Cities seat included — in ascending centre order. */
interface EventSites {
  flood: FloodRiver[];
  eruption: Tile[][][];  // per ERUPTION_ROWS row, its sites, each a site's plots
  storm: Tile[][];      // per family, the live start plots
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

/**
 * THE TURN'S ONE RANDOM EVENT (Game_RandomEvents "Random Event Roll",
 * GameCore_XP2 0x338710 / 0x335260; `tools/civ6lab/dll_readings.md`): at
 * most one event a turn. Each (row, site) pair weighs an integer: a row
 * counted once per map its row weight (`eventRows`), one site whether or not
 * its start plot exists; a per-site pair the row weight × (100 +
 * `FIRST_TIME_OCCURRENCE_BOOST` while that site has not had that row, 100
 * after) // 100 (`Tile.eventFired` on its key plot, `siteKeys`). ONE draw
 * rand(max(10·N, Σ)), N the game's turns (`EVENT_OCC_SCALE` × `TURN_LIMIT`),
 * walks the pairs in row order, sites in order: the pair whose running sum
 * first exceeds it fires; past them all the turn is empty. The draw is spent
 * every turn. A drawn row that finds no start plot is an empty turn. The
 * storm's, the meteor's and the fire's plot is a second draw over their start
 * plots, the drought's a weighted one over the map (`droughtStart`).
 */
function randomEvent(state: GameState, strip: boolean): void {
  const rows = eventRows(warmingDegrees(state), state.map.width * state.map.height);
  const sites = eventSites(state);
  const keys = rows.map((row) => siteKeys(state, sites, row));
  const pairs = keys.map((k, i) => (k === null
    ? [rows[i].weight]
    : k.map((t) => Math.floor((rows[i].weight
      * (((t.eventFired ?? 0) >> i) & 1 ? 100 : 100 + FIRST_TIME_OCCURRENCE_BOOST)) / 100))));
  let total = 0;
  for (const p of pairs) for (const x of p) total += x;
  const at = Math.floor(nextRandom(state) * Math.max(EVENT_OCC_SCALE * TURN_LIMIT, total));
  let cum = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let k = 0; k < pairs[i].length; k++) {
      cum += pairs[i][k];
      if (at >= cum) continue;
      const key = keys[i]?.[k];
      if (key) key.eventFired = (key.eventFired ?? 0) | (1 << i);
      fireEvent(state, rows[i], sites, k, strip);
      return;
    }
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
      state.stormSerial = (state.stormSerial ?? 0) + 1;
      center.stormId = state.stormSerial;
      log(state, `Storm: ${ev.id} at (${center.col}, ${center.row}) — ${ev.hexes} tiles for ${ev.duration} turns.`);
      return;
    }
    case 'drought': {
      const center = droughtStart(state);
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
 * BURNING plot takes the rows whose turns hold its age — its improvement and
 * district pillaged (an owned plot alone), its civilians killed and its land
 * units struck, each on its own UNIT_DAMAGE_LAND draw (`unitDamageDraws`),
 * and at `FIRE_POP_TURN` one citizen of the owning city — then at
 * `FIRE_BURNT_TURN` turns burnt, +1 Food; a
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
      if (age >= FIRE_DAMAGE_TURNS[0] && age <= FIRE_DAMAGE_TURNS[1]) {
        // the improvement and district rows need an owned plot, the unit
        // rows do not (the applier 0x336a50)
        if (tileSeat(t) >= 0) {
          scorch(state, t);
          pillageDistrict(state, t);
        }
        const land = unitDamageDraws(state, t, false, FIRE_DMG[0], FIRE_DMG[1]);
        strikeUnits(state, t, tileSeat(t), { land, naval: null, civ: true }, null);
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

/** The DLL's neighbour order an eruption walks: NE, E, SE, SW, W, NW. */
const ERUPTION_DIRS = [DIR_NE, DIR_E, DIR_SE, DIR_SW, DIR_W, DIR_NW] as const;

/**
 * The NEIGHBOURS an eruption strikes: each of `plots` (a volcano's one plot,
 * or a natural wonder's) in ascending order, its six on-map neighbours in
 * `ERUPTION_DIRS` order — a plot two wonder plots share taken twice, a
 * wonder plot beside another taken too (the natural-wonder eruption 0xa22150
 * walks each plot's six; the eruption itself skips what it does not reach).
 */
export function eruptionRing(map: GameMap, plots: readonly Tile[]): Tile[] {
  const out: Tile[] = [];
  for (const p of [...plots].sort((a, b) => a.index - b.index)) {
    for (const d of ERUPTION_DIRS) {
      const n = neighborTile(map, p, d);
      if (n) out.push(n);
    }
  }
  return out;
}

/** An eruption's `RandomEvent_Damages` kinds in the install's row order, each
 *  row present where its chance is above 0. */
const ERUPTION_DAMAGE_KINDS = ['IMPROVEMENT_DESTROYED', 'IMPROVEMENT_PILLAGED', 'DISTRICT_PILLAGED',
  'BUILDING_PILLAGED', 'POPULATION_LOSS', 'UNIT_KILLED_CIVILIAN', 'UNIT_DAMAGE_LAND', 'CITY_GARRISON',
  'CITY_WALLS'] as const;
type EruptionDamage = typeof ERUPTION_DAMAGE_KINDS[number];

/** The chance of eruption row `row`'s damage `kind`: IMPROVEMENT_PILLAGED is
 *  100 on every row; the unit and city rows stand where the row carries a
 *  band; 0 = the row carries none. */
function eruptionDamageP(kind: EruptionDamage, row: number): number {
  switch (kind) {
    case 'IMPROVEMENT_DESTROYED': return ERUPTION_DESTROY_P[row];
    case 'IMPROVEMENT_PILLAGED': return 1;
    case 'DISTRICT_PILLAGED': return ERUPTION_DISTRICT_P[row];
    case 'BUILDING_PILLAGED': return ERUPTION_BLDG_P[row];
    case 'POPULATION_LOSS': return ERUPTION_POP_P[row];
    case 'UNIT_KILLED_CIVILIAN': return ERUPTION_CIV_KILL_P[row];
    case 'UNIT_DAMAGE_LAND':
    case 'CITY_GARRISON':
    case 'CITY_WALLS':
      return ERUPTION_DMG_HI[row] > 0 ? 1 : 0;
  }
}

/** +1 of a silt channel on a land, non-mountain plot, capped — while the
 *  climate still lays fertility down. */
function silt(state: GameState, tile: Tile, key: 'fertility' | 'fertilityProd' | 'fertilitySci' | 'fertilityCul'): void {
  if (!fertilityLive(state) || isWater(tile) || tile.elevation === 'MOUNTAIN') return;
  tile[key] = Math.min(FERTILITY_CAP, (tile[key] ?? 0) + 1);
}

/**
 * AN ERUPTION of a volcano or of a natural wonder (`plots`, its plots), at
 * `ERUPTION_ROWS` row `row` (GameCore_XP2 0xa22000 / 0xa22150: the damage pass
 * 0xa1c1a0, then the soil pass 0xa219e0; `tools/civ6lab/dll_eruption.py`).
 * DAMAGE first: for each damage row in the install's order
 * (`ERUPTION_DAMAGE_KINDS`), for each neighbour (`eruptionRing`) the row
 * reaches (`eruptionReaches`), the plot's BONUS resource is lost — land or
 * water, whoever owns it — and ONE draw at the row's chance applies it
 * (`eruptionDamage`). Then the SOIL: for each `RandomEvent_Yields` row —
 * YIELD_FOOD (`ERUPTION_PAINT_P`), YIELD_PRODUCTION, YIELD_SCIENCE,
 * YIELD_CULTURE, where the row carries one — for each neighbour on land the
 * row reaches (`soilPaintable`), ONE draw at its chance paints Volcanic Soil
 * and adds +1 of the row's yield (every row paints). A plot holding a
 * district, a city centre or a wonder takes neither.
 */
export function erupt(state: GameState, plots: readonly Tile[], row: number): void {
  const ring = eruptionRing(state.map, plots);
  const volcano = plots[0];
  for (const kind of ERUPTION_DAMAGE_KINDS) {
    const p = eruptionDamageP(kind, row);
    if (p <= 0) continue;
    for (const n of ring) {
      if (!eruptionReaches(n)) continue;
      if (n.resource && RESOURCES[n.resource].category === 'bonus') n.resource = null;
      if (nextRandom(state) < p) eruptionDamage(state, n, kind, row);
    }
  }
  const soil: [number, 'fertility' | 'fertilityProd' | 'fertilitySci' | 'fertilityCul'][] = [
    [ERUPTION_PAINT_P[row], 'fertility'], [ERUPTION_PROD_P[row], 'fertilityProd'],
    [ERUPTION_SCI_P[row], 'fertilitySci'], [ERUPTION_CUL_P[row], 'fertilityCul']];
  for (const [p, key] of soil) {
    if (p <= 0) continue;
    for (const n of ring) {
      if (!soilPaintable(n)) continue;
      if (nextRandom(state) >= p || n.district || n.builtWonder) continue;
      if (n.feature !== 'VOLCANIC_SOIL') paintVolcanicSoil(n);
      silt(state, n, key);
    }
  }
  log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
}

/**
 * ONE landed eruption damage row `kind` on one neighbour, through the shared
 * applier (0x336a50): the improvement, district, building and population rows
 * need an OWNED plot, the unit and city rows do not. UNIT_DAMAGE_LAND draws
 * once per land unit on the plot (`unitDamageDraws`); no row names
 * UNIT_DAMAGE_NAVAL, so a hull is untouched. CITY_GARRISON and CITY_WALLS draw
 * their band, MinHP..MaxHP inclusive, where a city centre stands. The
 * improvement's pillage is IMPROVEMENT_PILLAGED's 100.
 */
function eruptionDamage(state: GameState, tile: Tile, kind: EruptionDamage, row: number): void {
  const owner = tileSeat(tile);
  const owned = owner >= 0;
  const lo = ERUPTION_DMG_LO[row];
  const hi = ERUPTION_DMG_HI[row];
  switch (kind) {
    case 'IMPROVEMENT_DESTROYED': if (owned) destroyImprovement(state, tile); return;
    case 'IMPROVEMENT_PILLAGED': if (owned) scorch(state, tile); return;
    case 'DISTRICT_PILLAGED': if (owned) pillageDistrict(state, tile); return;
    case 'BUILDING_PILLAGED': if (owned) pillageTileBuildings(state, tile); return;
    case 'POPULATION_LOSS': if (owned) losePopulation(state, tile); return;
    case 'UNIT_KILLED_CIVILIAN':
      strikeUnits(state, tile, owner, { land: null, naval: null, civ: true }, null);
      return;
    case 'UNIT_DAMAGE_LAND':
      strikeUnits(state, tile, owner, { land: unitDamageDraws(state, tile, false, lo, hi), naval: null, civ: false }, null);
      return;
    case 'CITY_GARRISON':
    case 'CITY_WALLS': {
      if (!cityAtIndex(state, tile.index)) return;
      const dmg = lo + Math.floor(nextRandom(state) * (hi - lo + 1));
      if (kind === 'CITY_GARRISON') hitCityHp(state, tile, dmg);
      else hitCityWalls(state, tile, dmg);
      return;
    }
  }
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
 * accidents. ONE draw per `RandomEvent_Damages` row of the severity, in the
 * install's order (`ACCIDENT_ROWS`), each row's draw deciding that row, and
 * right after UNIT_DAMAGE_LAND when it fires one more per land unit on the
 * plot: that unit's damage (`unitDamageDraws`). Every accident pillages the Power Plant
 * (105 of 105, runs/reactor_reactor_base_20260927T053410Z.jsonl,
 * runs/reactor_reactor_base_20260927T053613Z.jsonl,
 * runs/reactor_reactor_base_20260927T054059Z.jsonl); then the row's
 * BUILDING_PILLAGED chance takes the top of the Industrial Zone's chain still
 * standing (`pillageTileBuildings`) and its DISTRICT_PILLAGED chance the zone
 * and every building in it (`pillageDistrict`), as every event's rows do.
 * ONE citizen is lost at its population chance (never the last), and the
 * units on the reactor's own plot take their UNIT_DAMAGE_LAND draws and its
 * UNIT_KILLED_CIVILIAN chance (`strikeUnits`, as every event's). Fallout lies
 * on that plot, the Industrial Zone,
 * for the row's turns. No building is destroyed, no ring improvement
 * pillaged, no unit off the plot struck; the plant stays, ageing on.
 */
export function nuclearAccident(state: GameState, seat: number, city: City, sev: number): void {
  const iz = city.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
  const t = iz ? state.map.tiles[iz.tileIndex] : null;
  const roll = new Map<string, number>();
  let land: Map<number, number> | null = null;
  for (const kind of ACCIDENT_ROWS[sev]) {
    const r = nextRandom(state);
    roll.set(kind, r);
    // the row's applier draws right after it, one per land unit on the plot
    if (kind === 'UNIT_DAMAGE_LAND' && r < ACCIDENT_LAND_P[sev] && t) {
      land = unitDamageDraws(state, t, false, ACCIDENT_DMG_LO[sev], ACCIDENT_DMG_HI[sev]);
    }
  }
  // a row the severity does not carry never fires
  const fires = (kind: string, p: number) => (roll.get(kind) ?? 1) < p;
  if (t) {
    t.falloutTurns = Math.max(t.falloutTurns ?? 0, ACCIDENT_FALLOUT[sev]);
    if (!envImmune(state, t)) pillageHeld({ city }, 'NUCLEAR_POWER_PLANT');
    if (fires('BUILDING_PILLAGED', ACCIDENT_BLDG_P[sev])) pillageTileBuildings(state, t);
    if (fires('DISTRICT_PILLAGED', ACCIDENT_DISTRICT_P[sev])) pillageDistrict(state, t);
    strikeUnits(state, t, tileSeat(t), {
      land, naval: null, civ: fires('UNIT_KILLED_CIVILIAN', ACCIDENT_CIV_KILL_P[sev]),
    }, null);
  }
  if (fires('POPULATION_LOSS', ACCIDENT_POP_P[sev]) && city.population > 1) {
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

  // CIV6: the live storms walk and strike first, then the volcano roll, then
  // the turn's random event and its effects — a new storm's footprint at its
  // strike plot among them (tools/civ6lab/turn_order_civ6.md: `Storm
  // Direction` opens 67 of 76 turns, `Active Volcano Roll` after it 76 of 76,
  // `Random Event Roll` after that 190 of 190).
  stormsTurn(state, map.tiles.filter((t) => (t.stormTurns ?? 0) > 0), strip);
  volcanoRoll(state);
  // CIV6 (RANDOM_EVENT_START_TURN): no event fires before its first turn, and
  // no draw is spent
  if (state.turn >= RANDOM_EVENT_START_TURN) {
    randomEvent(state, strip);
    stormsTurn(state, map.tiles.filter((t) => (t.stormTurns ?? 0) > 0
      && STORM_EVENTS[t.stormEvent!].duration === t.stormTurns), strip);
  }
  fireTurn(state);
  // CIV6 (EMERGENCY_SEND_AID, Trigger PLAYER_LOSES_POP_TO_RANDOM_EVENT): the
  // phase's LOWEST victim civilization asks for aid — resolved once at the
  // end, so the order the two engines walk the turn's events cannot pick a
  // different victim; a city-state's or Free City's loss raises nothing
  const hits = (state.aidHit ?? []).filter((s) => isCiv(s));
  if (hits.length) raiseAidRequest(state, Math.min(...hits));
  state.aidHit = undefined;
}

/**
 * The turn of each storm in `live` (centres in ascending index, the list
 * taken BEFORE any of them moves, so none walks twice in one turn). CIV6
 * (`RandomEvents`, Duration 3 / Movement 8; Game_Climate 0x28ecd0): a storm
 * lives three turns. ENTRY: its footprint strikes the strike plot. Every
 * later turn the centre walks (`stormWalk`), its footprint striking at every
 * step; on the storm's LAST turn (turn − start + 1 ≥ Duration) at
 * `STORM_LAST_TURN_PCT` of the damage rows' chances. A storm strikes each
 * plot once (`Tile.stormStruck`). Each storm's clock ticks before the next
 * one walks, so a storm dissipating this turn frees its final tile for a
 * later storm's walk.
 */
function stormsTurn(state: GameState, live: Tile[], strip: boolean): void {
  for (let center of live) {
    const ev = STORM_EVENTS[center.stormEvent!];
    const age = ev.duration - (center.stormTurns ?? 0); // 0 entry, 1.. the walking turns
    const pct = age + 1 >= ev.duration ? STORM_LAST_TURN_PCT : 100;
    if (age === 0) stormTurn(state, center, ev, strip, pct);
    else center = stormWalk(state, center, ev, strip, pct);
    center.stormTurns = (center.stormTurns ?? 0) - 1;
    if (center.stormTurns <= 0) center.stormEvent = -1;
  }
}

/**
 * THE STORM'S WALK (Game_Climate 0x28ecd0, one step 0x28c500 "Storm
 * Direction", `tools/civ6lab/dll_readings.md` "the storm's walk"): `STORM_MOVEMENT`
 * points a turn. Each step is ONE weighted draw over the headings of the
 * `PrevailingWinds` bands at the centre's CURRENT latitude (`windWeights`)
 * whose neighbour exists — `pick` in [0, their sum) names the first heading
 * whose cumulative weight exceeds it, in the hex order E NE NW W SW SE — and
 * the storm moves there whatever the terrain: the step costs
 * `STORM_STEP_COST_ON` onto the storm's own terrain (`stormFamilyAt`,
 * hurricanes the Ocean alone), `STORM_STEP_COST_OFF` elsewhere, and the walk
 * ends for the turn when the drawn step costs more than is left. A plot
 * holding another storm's centre ends it too — one record per plot. Each
 * step strikes the footprint at the new centre (`stormTurn`, at `pct` of the
 * damage rows' chances). Returns the tile the record ends on.
 */
export function stormWalk(state: GameState, center: Tile, ev: StormEvent, strip: boolean, pct: number): Tile {
  const map = state.map;
  let left = STORM_MOVEMENT;
  for (;;) {
    const w = windWeights(center.row, map.height).map((x, d) => (neighborTile(map, center, d) ? x : 0));
    const total = w.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let pick = Math.floor(nextRandom(state) * total);
    let d = 0;
    while (d < 5 && pick >= w[d]) { pick -= w[d]; d++; }
    const dest = neighborTile(map, center, d)!;
    const cost = stormFamilyAt(dest) === ev.family ? STORM_STEP_COST_ON : STORM_STEP_COST_OFF;
    if (cost > left || (dest.stormTurns ?? 0) > 0) break;
    left -= cost;
    dest.stormEvent = center.stormEvent;
    dest.stormTurns = center.stormTurns;
    dest.stormId = center.stormId;
    center.stormEvent = -1;
    center.stormTurns = 0;
    center = dest;
    stormTurn(state, center, ev, strip, pct);
  }
  return center;
}

/** [8] the storm rows' weights on a map of `area` plots at `degrees` of
 *  warming: each row's tenths scaled by the map (`mapScaled`), warmed by its
 *  own `ChanceIncreasePerDegree` (`warmedWeight`). */
export function stormWeights(degrees: number, area: number): number[] {
  return STORM_EVENTS.map((ev) => warmedWeight(mapScaled(ev.weight, area), ev.cipd, degrees));
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

/** ONE strike of a storm's footprint around `center`: each plot the storm
 *  has not yet struck (`Tile.stormStruck` against the centre's `stormId`),
 *  in the footprint's order, at `pct` of the damage rows' chances. */
function stormTurn(state: GameState, center: Tile, ev: StormEvent, strip: boolean, pct: number): void {
  const id = center.stormId ?? -1;
  for (const t of stormFootprint(state.map, center, ev.hexes)) {
    if (t.stormStruck === id) continue;
    t.stormStruck = id;
    stormTile(state, t, ev, strip, pct);
  }
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
 * TEN draws per tile, always, whatever stands there — one per damage column
 * plus the two yields. Order: improvement pillaged, improvement destroyed,
 * district pillaged, buildings pillaged, population, civilian killed, land
 * share, naval share, food, production; then one per unit of each domain
 * whose share struck (`unitDamageDraws`). The improvement, district,
 * building and population rows need an owned plot, the unit rows do not.
 *
 * READINGS shared with the GPU twin: a domain's `Percentage` is one roll per
 * tile for ALL that domain's units on it; an embarked unit is its chassis'
 * domain; an air unit or a spy holds no tile and is neither domain; a city
 * centre on the footprint takes nothing (no storm row names CITY_GARRISON or
 * CITY_WALLS); BUILDING_PILLAGED is its own per-tile roll.
 */
export function stormTile(state: GameState, tile: Tile, ev: StormEvent, strip: boolean, pct = 100): void {
  const rPill = nextRandom(state);
  const rDestroy = nextRandom(state);
  const rDistrict = nextRandom(state);
  const rBldgS = nextRandom(state);
  const rPop = nextRandom(state);
  const rCivilian = nextRandom(state);
  const rLand = nextRandom(state);
  const rNaval = nextRandom(state);
  const rFood = nextRandom(state);
  const rProd = nextRandom(state);

  const owner = tileSeat(tile);
  // the improvement, district, building and population rows need an OWNED
  // plot; the unit rows do not (the applier 0x336a50); every damage row's
  // chance at `pct` of its Percentage (the storm's last turn halves them)
  const owned = owner >= 0;
  const lowland = (tile.lowland ?? 0) > 0;
  const k = pct / 100;
  const pillP = (lowland && ev.lowlandPill > 0 ? ev.lowlandPill : ev.impPill) * k;
  const distP = (lowland && ev.lowlandDist > 0 ? ev.lowlandDist : ev.distPill) * k;
  if (owned && rPill < pillP) scorch(state, tile);
  if (owned && rDestroy < ev.impDest * k) destroyImprovement(state, tile);
  if (owned && rDistrict < distP) pillageDistrict(state, tile);
  if (owned && rBldgS < ev.bldgPill * k) pillageTileBuildings(state, tile);
  if (owned && rPop < ev.pop * k) losePopulation(state, tile);
  // one draw per unit of each domain the share struck, the land row's first
  const land = rLand < ev.landP * k ? unitDamageDraws(state, tile, false, ev.landLo, ev.landHi) : null;
  const naval = rNaval < ev.navalP * k ? unitDamageDraws(state, tile, true, ev.navalLo, ev.navalHi) : null;
  strikeUnits(state, tile, owner, { land, naval, civ: rCivilian < ev.civKill * k }, ev);
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
