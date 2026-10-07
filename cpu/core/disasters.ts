
import type { City, CityState, GameState, StormRecord, Tile } from './types';
import { logPopWrite } from './difflog';
import type { GameMap, ImprovementId } from '../../world/types';
import { IMPROVEMENTS } from '../data/improvements';
import { neighborTile, neighbors, tilesAtOffsets, hexDistance, DIRECTION_TYPES, RING_DIRS } from '../../world/hex';
import { hasRiver, isCoastalLand, isImpassable, isWater } from '../../world/query';
import { isFloodplains } from '../../world/features';
import { TERRAINS } from '../../world/terrains';
import { RESOURCES } from '../../world/resources';
import { atRngPoint, randRange, randWeighted, type DrawLabel } from './rand';
import { fogActive, isExplored } from './fog';
import { seatOf, tileSeat, civOf, leaderOf, civsAtWar, isCiv, cityHolders, drawCitizenName } from './seats';
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
import { FLOOD_WEIGHT, FLOOD_CIPD, FLOOD_DAMAGE_ROWS, FLOOD_YIELD_ROWS, FLOOD_MITIGATED_YIELD_REDUCTION, type FloodDamageRow, warmedWeight, RANDOM_EVENT_START_TURN } from '../data/disasters';
import { ERUPTION_WEIGHT, DROUGHT_WEIGHT, DROUGHT_CIPD, DROUGHT_TURNS, DROUGHT_HEXES, DROUGHT_IMPROVEMENTS, DROUGHT_DESTROY_P, droughtGround, SOIL_REPLACES } from '../data/disasters';
import { ERUPTION_PAINT_P, ERUPTION_DESTROY_P, ERUPTION_DISTRICT_P, ERUPTION_BLDG_P, ERUPTION_POP_P, ERUPTION_CIV_KILL_P, ERUPTION_DMG_LO, ERUPTION_DMG_HI, ERUPTION_ROWS, ERUPTION_WONDER, ERUPTION_PROD_P, ERUPTION_SCI_P, ERUPTION_CUL_P } from '../data/disasters';
import { FIRST_TIME_OCCURRENCE_BOOST, EVENT_OCC_SCALE, STANDARD_MAP_AREA, PERCENT_VOLCANOES_ACTIVE } from '../data/disasters';
import { TURN_LIMIT } from './game';
import { METEOR_WEIGHT, METEOR_TERRAINS, METEOR_AVOIDS_TERRITORY } from '../data/disasters';
import { FIRE_WEIGHT, FIRE_CIPD, FIRE_START_FEATURE, FIRE_BURNING_FEATURE, FIRE_BURNT_FEATURE, FIRE_BURNT_TURN, FIRE_REGROW_TURN, FIRE_SPREAD_P, FIRE_SPREAD_TURNS, FIRE_DAMAGE_TURNS, FIRE_POP_TURN, FIRE_DMG } from '../data/disasters';
import { ACCIDENT_ROWS, ACCIDENT_WEIGHT, ACCIDENT_MIN_TURN, ACCIDENT_FALLOUT, ACCIDENT_DISTRICT_P, ACCIDENT_BLDG_P, ACCIDENT_POP_P, ACCIDENT_LAND_P, ACCIDENT_DMG_LO, ACCIDENT_DMG_HI, ACCIDENT_CIV_KILL_P } from '../data/disasters';
import { STORM_EVENTS, STORM_ROWS, WIND_ROWS, STORM_UNIT_ROWS, stormFamilyAt, gameLatitude, stormFootprintOffsets, STORM_MOVEMENT, STORM_STEP_COST_ON, STORM_STEP_COST_OFF, STORM_LAST_TURN_PCT, type StormEvent } from '../data/disasters';
import { floodFertilityHalted, removeFertility, seaRise, stormFertilityHalted, warmingDegrees } from './climate';
import { governorTileFlag } from './governors';

function log(state: GameState, text: string): void {
  state.eventLog.push(text);
  if (state.eventLog.length > 20) state.eventLog.shift();
}

function pick<T>(state: GameState, arr: T[], label: DrawLabel): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[randRange(state, arr.length, label)];
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
 * alike. The top is the dearest building standing unpillaged there
 * (`BuildingDef.cost`, ties to the first in the production layout; the
 * district's chooser 0x24af90 keeps the first strictly greater Cost); when
 * that top is a Dar-e Mehr (Buildings_XP2 Pillage="false", "Cannot be
 * pillaged by natural disasters") nothing falls (the applier 0x33a780 tests
 * the chosen one). A pillaged district's buildings went with it.
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
    if (def.district !== tile.district || !h.city.buildings?.includes(id)
      || buildingPillaged(h.city, id)) continue;
    if (top === undefined || def.cost > BUILDINGS[top].cost) top = id;
  }
  if (top && !BUILDINGS[top].disasterProof) pillageHeld(h, top);
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
    out.set(u.id, lo + randRange(state, hi - lo, 'Random Event Unit Damage Roll'));
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
  return eruptionReaches(t) && !isWater(t);
}

/** The plot becomes Volcanic Soil; a Lumber Mill goes with the Woods or
 *  Rainforest it stood on, any other improvement stays. */
export function paintVolcanicSoil(t: Tile): void {
  if (t.improvement === 'LUMBER_MILL') t.improvement = null;
  t.feature = 'VOLCANIC_SOIL';
}

function fertilize(tile: Tile): void {
  if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
    tile.fertility += 1;
  }
}

/**
 * Each plot's RIVER, -1 beside none. A river is a chain of EDGES, two edges
 * of it meeting at a vertex: of the three edges at a vertex, edge d of plot
 * t meets t's edges d-1 and d+1 and the edge between t's neighbours
 * n_{d-1} / n_d (n_d's edge d+4) and n_d / n_{d+1} (n_d's edge d+2). The
 * plots beside a river are the plots on either side of its edges; a plot
 * beside several belongs to ONE of them (the game's floodplain-to-river
 * map), the river whose lowest-indexed plot is the highest — fitted on the
 * two recorded cases: runs/h1_duelw1110 plot 609, beside the river of 567
 * (lowest plot 434) and the river of 653 (609): its five floods silted 697
 * and 742 and its Great Bath count took the second river's floods alone;
 * runs/h1_duelw1109 plot 936, beside a river from 491 and one from 755: its
 * floods silted 934 and 935. Static: rivers never move, so the answer is
 * kept per map.
 */
const riverCache = new WeakMap<readonly Tile[], Int32Array>();
export function riverOfPlots(map: GameMap): Int32Array {
  const hit = riverCache.get(map.tiles);
  if (hit) return hit;
  const key = (t: Tile, d: number, n: Tile | null) => (n && n.index < t.index ? n.index * 6 + (d + 3) % 6 : t.index * 6 + d);
  const edgeChain = new Map<number, number>();
  const lowest: number[] = [];
  for (const t0 of map.tiles) {
    for (let d0 = 0; d0 < 6; d0++) {
      if (!(t0.riverMask & (1 << d0)) || edgeChain.has(key(t0, d0, neighborTile(map, t0, d0)))) continue;
      const chain = lowest.length;
      lowest.push(t0.index);
      const stack: [Tile, number][] = [[t0, d0]];
      while (stack.length) {
        const [t, d] = stack.pop()!;
        const n = neighborTile(map, t, d);
        const k = key(t, d, n);
        if (edgeChain.has(k)) continue;
        edgeChain.set(k, chain);
        lowest[chain] = Math.min(lowest[chain], t.index, n?.index ?? t.index);
        const push = (u: Tile | null, e: number) => { if (u && u.riverMask & (1 << e)) stack.push([u, e]); };
        push(t, (d + 1) % 6);
        push(t, (d + 5) % 6);
        push(n, (d + 2) % 6);
        push(n, (d + 4) % 6);
      }
    }
  }
  const out = new Int32Array(map.tiles.length).fill(-1);
  for (const t of map.tiles) {
    for (let d = 0; d < 6; d++) {
      if (!(t.riverMask & (1 << d))) continue;
      const c = edgeChain.get(key(t, d, neighborTile(map, t, d)))!;
      const cur = out[t.index];
      if (cur < 0 || lowest[c] > lowest[cur] || (lowest[c] === lowest[cur] && c > cur)) out[t.index] = c;
    }
  }
  riverCache.set(map.tiles, out);
  return out;
}

/**
 * Every Floodplains tile ALONG one river — the river `start` belongs to
 * (`riverOfPlots`) — in the order a flood from `start` walks them: the
 * river's Floodplains list (0xa2aa30 → 0xa2aca0) is read from the river's
 * mouth up, its first plot the flood's start (`tools/civ6lab/dll_readings.md`
 * "H-1: the random events' draws": 39 of 39 floods on runs/h1_duelw1116, 25
 * of 25 on 1115); this map's rivers keep no laying order, so the plots go
 * in the river's flood order (`floodRanks`).
 *
 * CIV6 (Flood): "The level of the water rises, flooding all Floodplains tiles
 * found along the River, and then recedes on the next turn." One severity for
 * the whole flood, then each reached tile takes the effects at that severity.
 */
export function riverReach(map: GameMap, start: Tile): Tile[] {
  const river = riverOfPlots(map);
  const r = river[start.index];
  if (r < 0) return [start];
  const rank = floodRanks(map);
  const far = map.tiles.length;
  const at = (t: Tile) => (rank[t.index] >= 0 ? rank[t.index] : far);
  const out = map.tiles.filter((t: Tile) => river[t.index] === r && isFloodplains(t.feature))
    .sort((a, b) => at(a) - at(b) || a.index - b.index);
  return out.length ? out : [start];
}

/**
 * Each plot's place in its river's flood order, -1 on a plot no flood list
 * holds: from the river's flood start (`floodRivers`) outward over the
 * river's own plots (`riverOfPlots`), step by step, its Floodplains plots
 * ranked by steps, ties to the lower index, any the walk misses last; a lone
 * Floodplains plot 0.
 * Static; the exporter ships it as the `fo` plane.
 */
const rankCache = new WeakMap<readonly Tile[], number[]>();
export function floodRanks(map: GameMap): number[] {
  const hit = rankCache.get(map.tiles);
  if (hit) return hit;
  const river = riverOfPlots(map);
  const out = new Array<number>(map.tiles.length).fill(-1);
  for (const fr of floodRivers(map)) {
    const r = river[fr.start.index];
    if (r < 0) {
      out[fr.start.index] = 0;
      continue;
    }
    const dist = new Map<number, number>([[fr.start.index, 0]]);
    const queue = [fr.start];
    for (let i = 0; i < queue.length; i++) {
      for (const n of neighbors(map, queue[i])) {
        if (river[n.index] !== r || dist.has(n.index)) continue;
        dist.set(n.index, dist.get(queue[i].index)! + 1);
        queue.push(n);
      }
    }
    const far = map.tiles.length;
    map.tiles.filter((t) => river[t.index] === r && isFloodplains(t.feature))
      .sort((a, b) => (dist.get(a.index) ?? far) - (dist.get(b.index) ?? far) || a.index - b.index)
      .forEach((t, i) => { out[t.index] = i; });
  }
  rankCache.set(map.tiles, out);
  return out;
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

/** A flood that no draw chose — the spy's breached Dam: ONE weighted draw
 *  (`randWeighted`) names the severity by the flood rows' integer weights at
 *  the world's warming. */
export function floodSeverity(state: GameState): number {
  return randWeighted(state, floodWeights(warmingDegrees(state)), 'Engine: breached dam');
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
 * Floodplains plot; a river's plots are the plots that belong to it
 * (`riverOfPlots`), and its site is the
 * plot its flood starts on (`floodStart`). Static: rivers, Floodplains and
 * the map's water as made never move, so the exporter ships the starts
 * (`floodStarts`).
 */
export function floodRivers(map: GameMap): FloodRiver[] {
  const riverOf = riverOfPlots(map);
  const seen = new Set<number>();
  const out: FloodRiver[] = [];
  for (const t of map.tiles) {
    if (!isFloodplains(t.feature)) continue;
    const r = riverOf[t.index];
    if (r < 0) {
      out.push({ start: t, plots: [t] });
      continue;
    }
    if (seen.has(r)) continue;
    seen.add(r);
    const river = map.tiles.filter((u) => riverOf[u.index] === r);
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
 * The plot a river's flood starts on — the FIRST plot of the river's
 * Floodplains list (MEASURED, `runs/event_history_*`, 447 of 447 floods),
 * which the game reads from the river's mouth up (0xa2aa30 → 0xa2aca0;
 * `tools/civ6lab/dll_readings.md` "H-1: the random events' draws"): this
 * map's river model keeps no flow, so the first plot is the river's
 * MOUTH-MOST Floodplains plot — the one nearest, in steps across river edges,
 * to the river's plots that touch the map's water as made, ties to the
 * lowest index. A river touching no water, and a lone Floodplains plot, start
 * on their lowest-index Floodplains plot.
 */
function floodStart(map: GameMap, river: readonly Tile[]): Tile {
  const dist = new Map<number, number>();
  const queue = river.filter((u) => neighbors(map, u).some((n) => TERRAINS[n.terrain].water))
    .sort((a, b) => a.index - b.index);
  for (const u of queue) dist.set(u.index, 0);
  const on = new Set(river.map((u) => u.index));
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    for (let d = 0; d < 6; d++) {
      if (!(u.riverMask & (1 << d))) continue;
      const n = neighborTile(map, u, d);
      if (!n || !on.has(n.index) || dist.has(n.index)) continue;
      dist.set(n.index, dist.get(u.index)! + 1);
      queue.push(n);
    }
  }
  let best: Tile | null = null;
  let near = Infinity;
  for (const u of [...river].sort((a, b) => a.index - b.index)) {
    if (!isFloodplains(u.feature)) continue;
    const du = dist.get(u.index) ?? Infinity;
    if (best === null || du < near) {
      best = u;
      near = du;
    }
  }
  return best!;
}

/**
 * A FLOOD of severity `sev` on the river through `start` (GameCore_XP2
 * 0xa2f200: the damage pass 0xa2a4d0, then the yields pass 0xa2ed80). Every
 * plot of the river (`riverReach`, in its order) remembers the episode
 * (`Tile.floodCount`, the Great Bath's faith). A river carrying its shield
 * (`riverShielded`) skips the damage pass whole; otherwise, for each
 * `RandomEvent_Damages` row of the severity in the install's order
 * (`FLOOD_DAMAGE_ROWS`), for each plot: a plot whose owner is immune to the
 * flood (`floodImmune`) takes no draw, any other ONE draw rand(100) <
 * Percentage applies the row through the shared applier (`eventDamage`).
 * Then, unless the sea's rise halts a flood's fertility (`floodFertilityHalted`: no draw), for each
 * `RandomEvent_Yields` row of the severity in order (`FLOOD_YIELD_ROWS`),
 * EVERY plot draws once rand(100) < Percentage — on a shielded river
 * (100 − `FLOOD_MITIGATED_YIELD_REDUCTION`) × Percentage // 100 — and +1 of
 * the row's yield lands where the plot's feature is the row's Floodplains
 * kind (`silt`).
 */
export function floodRiver(state: GameState, start: Tile, sev: number): Tile[] {
  const reach = riverReach(state.map, start);
  const mitigated = riverShielded(reach);
  for (const t of reach) t.floodCount = (t.floodCount ?? 0) + 1;
  if (!mitigated) {
    for (const row of FLOOD_DAMAGE_ROWS[sev]) {
      for (const t of reach) {
        if (floodImmune(state, t)) continue;
        if (randRange(state, 100, 'Pillage Improvement Chance') < row.pct) eventDamage(state, t, row.kind, row.lo, row.hi);
      }
    }
  }
  if (floodFertilityHalted(state)) return reach;
  for (const row of FLOOD_YIELD_ROWS[sev]) {
    const pct = mitigated ? Math.floor(((100 - FLOOD_MITIGATED_YIELD_REDUCTION) * row.pct) / 100) : row.pct;
    for (const t of reach) {
      if (randRange(state, 100, 'Boosted Yield Chance') >= pct || t.feature !== row.feature) continue;
      silt(t, row.yield === 'YIELD_FOOD' ? 'fertility' : 'fertilityProd');
    }
  }
  return reach;
}

/** CIV6 (Iteru, TRAIT_AVOID_*_FLOOD on every flood row): Egypt's plots take
 *  no flood damage and spend no draw on it. */
function floodImmune(state: GameState, t: Tile): boolean {
  return civOf(state, tileSeat(t)) === 'EGYPT';
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

/** The radius of the disc a storm row's start plot must hold on its own
 *  terrain: `Hexes` 19 → 2, 3 or 7 → 1, 1 → 0 (0x288250). */
export function stormStartRadius(ev: StormEvent): number {
  return ev.hexes >= 19 ? 2 : ev.hexes >= 3 ? 1 : 0;
}

/**
 * A storm's start plot ("Pick Storm Start Plot", GameCore_XP2 0x288250 →
 * 0x2900c0 → 0x28aa00): ONE uniform draw over every map plot in ascending
 * order that qualifies — Hexes ≥ 19 asks the plot and one of its six
 * neighbours (all six on the map) to stand on the storm's terrain
 * (`stormFamilyAt`, the row's RandomEvent_Terrains; 0x28eab0), Hexes ≥ 3 the
 * plot alone, a smaller row no plot. The spacing weight 0x2900c0 computes
 * never reaches the draw. No candidate, no draw. `_storm_start` is the twin.
 */
export function stormStart(state: GameState, ev: StormEvent): Tile | undefined {
  const map = state.map;
  const need = ev.hexes >= 19 ? 2 : ev.hexes >= 3 ? 1 : 0;
  if (need === 0) return undefined;
  const cands = map.tiles.filter((t) => {
    if (stormFamilyAt(t) !== ev.family) return false;
    if (need === 1) return true;
    const ring = neighbors(map, t);
    return ring.length === 6 && ring.some((n) => stormFamilyAt(n) === ev.family);
  });
  if (!cands.length) return undefined;
  return cands[randRange(state, cands.length, 'Pick Storm Start Plot')];
}

/** A city whose reactor can melt down, and its seat. */
interface ReactorSite {
  seat: number;
  city: City;
}

/**
 * The ground a Meteor Shower's start test admits (the one-off predicate
 * 0x28ec10, `tools/civ6lab/dll_readings.md` "C-74: the one-off start"): its
 * `RandomEvent_Terrains` — Plains, Grassland, Snow or Desert, flat or hills —
 * above the sea and not impassable; the event lists no feature, so any
 * feature passes (runs/h1_duelw1116 t243: a Floodplains plot).
 */
export function meteorGround(t: Tile): boolean {
  return !isWater(t) && !isImpassable(t) && METEOR_TERRAINS.includes(t.terrain);
}

/** May a Meteor Shower strike this plot? Its ground (`meteorGround`) and,
 *  by `AvoidTerritory`, nobody's plot (0x28ec10's owner test). `_meteor_cands`
 *  is the twin. */
export function meteorCandidate(t: Tile): boolean {
  return meteorGround(t) && (!METEOR_AVOIDS_TERRITORY || tileSeat(t) < 0);
}

/** May fire row `row` start on this plot — a live plot of its feature above
 *  the sea? The same test is the spread's (`fireTurn`). */
export function fireCandidate(t: Tile, row: number): boolean {
  return t.feature === FIRE_START_FEATURE[row];
}

/** The plots under a live event, where no drought may start: every plot a
 *  live storm has struck (GameCore_XP2 0x28de40 reads m_aStorms' struck
 *  lists alone — a drought's or a fire's plot is no bar). */
/**
 * May a drought start on this plot now? (Game_Climate "Pick Drought Start
 * Plot", GameCore_XP2 0x287e80 and its predicate 0x28eb60;
 * `tools/civ6lab/dll_drought.py`: 13 of 13 starts on a candidate, 34 of 34
 * empty draws with none.) The plot and all six of its neighbours are dry
 * ground (`droughtGround`: featureless Plains or Grassland, hills included,
 * a district's plot or a city centre counting as featureless), with no river,
 * beside no Coast or Ocean (`isCoastalLand`; a lake is no ocean-sized body)
 * and where no storm has struck (`struck`: 0x28de40 reads every storm
 * record the game keeps, live or ended — runs/h1_duelw1124 t112, t115, t162,
 * t194, t234 leave out 277, 278 and 319, the t49 blizzard's walk). A plot on
 * the map's edge lacks a neighbour and never qualifies. `centres` holds every
 * live city centre.
 */
export function droughtCandidate(map: GameMap, t: Tile, centres: ReadonlySet<number>, struck: (u: Tile) => boolean): boolean {
  const dry = (u: Tile) => droughtGround(u, (u.district !== null && u.district !== 'CITY_CENTER') || centres.has(u.index))
    && !hasRiver(u) && !isCoastalLand(map, u) && !struck(u);
  if (!dry(t)) return false;
  for (let d = 0; d < 6; d++) {
    const n = neighborTile(map, t, d);
    if (!n || !dry(n)) return false;
  }
  return true;
}

/**
 * A drought's start plot: ONE uniform draw over every candidate plot of the
 * map (`droughtCandidate`) in ascending order — no city anchor
 * (GameCore_XP2 0x287e80: each candidate's score 0x28ff20, 1 + min(distance
 * to a live drought, Spacing), keeps it in the list, and the draw is over the
 * list's count, the scores unread; runs/h1_duelw1118 t92 and t102 draw over
 * 1, t138 and t151 over 3). No candidate, no draw. `_drought_start` is the
 * twin.
 */
export function droughtStart(state: GameState): Tile | undefined {
  const map = state.map;
  const centres = new Set<number>();
  for (const s of cityHolders(state)) for (const c of s.cities) centres.add(c.centerIndex);
  for (const cs of state.cityStates) centres.add(cs.centerIndex);
  const cands = map.tiles.filter((t) => droughtCandidate(map, t, centres, (u) => !!u.stormStruck));
  if (!cands.length) return undefined;
  return cands[randRange(state, cands.length, 'Pick Drought Start Plot')];
}

/**
 * THE VOLCANO ROLL — ONE roll a turn for the whole map ("Active Volcano Roll",
 * GameCore_XP2 0x335040; `tools/civ6lab/dll_readings.md` "C-74: the volcano
 * roll's gate"). V the volcanoes, N the NAMED ones (`volcanoNamed`; the
 * count 0xa1d2b0(true), entries whose name is set), A the active ones, W the
 * volcanic wonders standing (always active); the active share pct =
 * 100·(A + W) // (V + W) and D = `TURN_LIMIT` // (2V), the game's turns as the
 * event roll reads them (0x339020; runs/h1_duelw1117 / 1118: 62 on every roll
 * with V = 2, and 1118 t152's sleep over two active volcanoes). No named
 * volcano, no draw. Below `PERCENT_VOLCANOES_ACTIVE`, while a named volcano
 * sleeps: D //= (70 − pct)·N // 100 when that product reaches 200, and
 * rand(D) = 0 wakes ONE sleeping named volcano, drawn uniformly in ascending
 * tile order ("Choose Active Volcano Roll"); at or above it, with an active
 * volcano, rand(D) = 0 puts ONE active volcano to sleep, drawn the same way.
 * `_volcano_roll` is the twin.
 */
export function volcanoRoll(state: GameState): void {
  const volcanoes = state.map.tiles.filter((t) => t.volcano);
  const v = volcanoes.length;
  const named = volcanoes.filter((t) => volcanoNamed(state, t));
  if (v === 0 || named.length === 0) return;
  const w = new Set(ERUPTION_WONDER.filter((f): f is string => !!f && state.map.tiles.some((t) => t.feature === f))).size;
  const active = volcanoes.filter((t) => t.volcanoActive);
  const pct = Math.floor((100 * (active.length + w)) / (v + w));
  let d = Math.floor(TURN_LIMIT / (2 * v));
  const wake = pct < PERCENT_VOLCANOES_ACTIVE;
  if (wake) {
    if (named.length - active.length <= 0) return;
    const x = (PERCENT_VOLCANOES_ACTIVE - pct) * named.length;
    if (x >= 200) d = Math.floor(d / Math.floor(x / 100));
  } else if (active.length === 0) {
    return;
  }
  if (randRange(state, d, 'Active Volcano Roll') !== 0) return;
  const from = wake ? named.filter((t) => !t.volcanoActive) : active;
  const t = from[randRange(state, from.length, wake ? 'Choose Inactive Volcano Roll' : 'Choose Active Volcano Roll')];
  t.volcanoActive = wake;
}

/** Has this volcano a name — has a major revealed its plot? (LAB: the
 *  volcano entry's name field +8, which the roll's counts and its choice
 *  read, read as set on a major's first sight.) With no fog every volcano
 *  is named. `_volcano_named` is the twin. */
function volcanoNamed(state: GameState, t: Tile): boolean {
  if (!fogActive(state)) return true;
  return state.seats.some((s) => isCiv(s.seat) && isExplored(state, s.seat, t.index));
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
  return {
    flood: floodRivers(map).filter((r) => riverRevealed(state, r)),
    eruption: ERUPTION_WONDER.map((w) => {
      if (!w) return volcanoes;
      const plots = map.tiles.filter((t) => t.feature === w);
      return plots.length ? [plots] : [];
    }),
    accident: ACCIDENT_MIN_TURN.map((gate) => reactors.filter((r) => (r.city.reactorAge ?? 0) >= gate)),
    meteor: map.tiles.filter((t) => meteorCandidate(t)),
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

/** A per-site (row, site) pair's integer weight at `pct` (100, or 100 + the
 *  first-occurrence boost): the row's tenths × pct // 100; a flood's boosted
 *  tenths then warmed by its `ChanceIncreasePerDegree` (0xa2cfc0 boosts
 *  before it warms). */
export function sitePairWeight(row: EventRow, pct: number, degrees: number): number {
  if (row.family !== 'flood') return Math.floor((row.weight * pct) / 100);
  return warmedWeight(Math.floor((occTenths(FLOOD_WEIGHT[row.sev]) * pct) / 100), FLOOD_CIPD[row.sev], degrees);
}

/**
 * THE TURN'S ONE RANDOM EVENT (Game_RandomEvents "Random Event Roll",
 * GameCore_XP2 0x338710 / 0x335260; `tools/civ6lab/dll_readings.md`): at
 * most one event a turn. Each (row, site) pair weighs an integer: a row
 * counted once per map its row weight (`eventRows`), one site whether or not
 * its start plot exists; a per-site pair the row's tenths × (100 +
 * `FIRST_TIME_OCCURRENCE_BOOST` while that site has not had that row, 100
 * after) // 100 (`Tile.eventFired` on its key plot, `siteKeys`), a flood's
 * boosted weight then warmed (`warmedWeight`; the flood weight 0xa2cfc0
 * boosts before it warms). ONE draw
 * rand(max(10·N, Σ)), N the game's turns (`EVENT_OCC_SCALE` × `TURN_LIMIT`),
 * walks the pairs in row order, sites in order: the pair whose running sum
 * first exceeds it fires; past them all the turn is empty. The draw is spent
 * every turn. A drawn row that finds no start plot is an empty turn. The
 * storm's, the meteor's and the fire's plot is a second draw over their start
 * plots, the drought's a weighted one over the map (`droughtStart`).
 */
function randomEvent(state: GameState): void {
  // a sea level rise the climate step left waiting is the turn's event by
  // force: the roll is a draw over its one row (`seaRise`)
  if (state.seaRiseFrom !== undefined) {
    randRange(state, 1, 'Random Event Roll');
    seaRise(state);
    return;
  }
  const degrees = warmingDegrees(state);
  const rows = eventRows(degrees, state.map.width * state.map.height);
  const sites = eventSites(state);
  const keys = rows.map((row) => siteKeys(state, sites, row));
  const pairs = keys.map((k, i) => (k === null
    ? [rows[i].weight]
    : k.map((t) => sitePairWeight(rows[i], ((t.eventFired ?? 0) >> i) & 1 ? 100 : 100 + FIRST_TIME_OCCURRENCE_BOOST, degrees))));
  let total = 0;
  for (const p of pairs) for (const x of p) total += x;
  const at = randRange(state, Math.max(EVENT_OCC_SCALE * TURN_LIMIT, total), 'Random Event Roll');
  let cum = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let k = 0; k < pairs[i].length; k++) {
      cum += pairs[i][k];
      if (at >= cum) continue;
      const site = rows[i].family === 'flood' ? heldFloodSite(state, sites, rows[i].sev, k) : k;
      const key = keys[i]?.[site];
      if (key) key.eventFired = (key.eventFired ?? 0) | (1 << i);
      fireEvent(state, rows[i], sites, site);
      return;
    }
  }
}

let floodHold: ((state: GameState, sev: number) => number | undefined) | null = null;
let floodHeld: (() => void) | null = null;

/** The action replay's hold on a flood's river (`cpu/harness/replay.ts`):
 *  the game walks its rivers in the map generator's list order, which no
 *  record carries, so a replayed flood row strikes the river the record's
 *  flood of that row names — a plot of it, as `fn` returns it for the step
 *  the engine's `state.turn` is; `held` hears each flood the hold moved
 *  off the draw's own river. Null outside a replay. */
export function holdFloodRiver(fn: ((state: GameState, sev: number) => number | undefined) | null,
  held: (() => void) | null = null): void {
  floodHold = fn;
  floodHeld = held;
}

/** The flood site a drawn flood row strikes: the held river's where a replay
 *  holds one among the revealed rivers, else the draw's own. */
function heldFloodSite(state: GameState, sites: EventSites, sev: number, k: number): number {
  const plot = floodHold?.(state, sev);
  if (plot === undefined) return k;
  const j = sites.flood.findIndex((r) => r.plots.some((t) => t.index === plot));
  if (j < 0 || j === k) return k;
  floodHeld?.();
  return j;
}

function fireEvent(state: GameState, row: EventRow, sites: EventSites, k: number): void {
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
      stormBirth(state, row.sev);
      return;
    }
    case 'drought': {
      const center = droughtStart(state);
      if (!center) return;
      drought(state, center, row.sev);
      return;
    }
    case 'accident': {
      const site = sites.accident[row.sev][k];
      nuclearAccident(state, site.seat, site.city, row.sev);
      return;
    }
    case 'meteor': {
      // the one-off birth (0x291a20): its plot, then its strike at age 0
      // (0x2867f0) — no yield row; its two damage rows (IMPROVEMENT_PILLAGED,
      // DISTRICT_PILLAGED at 101) draw once each on a plot that holds
      // neither
      const at = pick(state, sites.meteor, 'Pick One Off Start Plot');
      if (!at) return;
      randRange(state, 100, 'Pillage Improvement Chance');
      randRange(state, 100, 'Pillage Improvement Chance');
      at.meteor = true;
      log(state, `Meteor shower at (${at.col}, ${at.row}) — a Meteor Site lies there.`);
      return;
    }
    case 'fire': {
      const at = pick(state, sites.fire[row.sev], 'Pick One Off Start Plot');
      if (!at) return;
      fireBirth(state, at, row.sev);
      log(state, `Fire at (${at.col}, ${at.row}).`);
      return;
    }
  }
}

/**
 * A NEW FIRE of row `row` on `t` (the event's start 0x334d30 → 0x291a20):
 * its record — the plot's own clock (`Tile.fireStart`) and its place among
 * the live fires (`Tile.fireSeq`) — then its first strike at age 0
 * (`fireStrike`). A fire the draw starts and one a fire spreads to alike.
 */
export function fireBirth(state: GameState, t: Tile, row: number): void {
  state.fireSerial = (state.fireSerial ?? 0) + 1;
  t.fireStart = state.turn;
  t.fireSeq = state.fireSerial;
  fireStrike(state, t, row, 0);
}

/**
 * ONE FIRE STRIKE (the one-off strike 0x2867f0) on the fire's plot at its
 * age (turn − start), `tools/civ6lab/dll_readings.md` "C-74: the fire":
 * unless the plot is water or impassable, each `RandomEvent_Yields` row whose
 * Turn is the age draws ONE "Boosted Yield Chance" rand(100), landing at or
 * under its Percentage (100: always) — Turn 0 the burning form, Turn 2
 * (`FIRE_BURNT_TURN`) the burnt form and +1 Food, Turn 6 (`FIRE_REGROW_TURN`)
 * the feature back, +1 Production, and the record goes; then each
 * `RandomEvent_Damages` row (XML order) whose turns hold the age draws ONE
 * "Pillage Improvement Chance" rand(100) under its Percentage — the 101 rows
 * always land: IMPROVEMENT_PILLAGED and DISTRICT_PILLAGED (an owned plot),
 * POPULATION_LOSS (age `FIRE_POP_TURN`), UNIT_KILLED_CIVILIAN and
 * UNIT_DAMAGE_LAND (`FIRE_DAMAGE_TURNS`, each land unit its own draw), and
 * SPREAD at `FIRE_SPREAD_P` on `FIRE_SPREAD_TURNS`: every neighbour, in
 * the ring walk's order (`RING_DIRS`), standing on the row's own live feature starts a fire
 * of its own (`fireBirth`). `_fire_strike` is the twin.
 */
function fireStrike(state: GameState, t: Tile, row: number, age: number): void {
  const map = state.map;
  if (!barren(t)) {
    if (age === 0) {
      randRange(state, 100, 'Boosted Yield Chance');
      t.feature = FIRE_BURNING_FEATURE[row] as Tile['feature'];
    } else if (age === FIRE_BURNT_TURN) {
      randRange(state, 100, 'Boosted Yield Chance');
      t.feature = FIRE_BURNT_FEATURE[row] as Tile['feature'];
      fertilize(t);
    } else if (age === FIRE_REGROW_TURN) {
      randRange(state, 100, 'Boosted Yield Chance');
      t.feature = FIRE_START_FEATURE[row] as Tile['feature'];
      t.fireStart = undefined;
      t.fireSeq = undefined;
      silt(t, 'fertilityProd');
    }
  }
  const owner = tileSeat(t);
  if (age >= FIRE_DAMAGE_TURNS[0] && age <= FIRE_DAMAGE_TURNS[1]) {
    randRange(state, 100, 'Pillage Improvement Chance');
    if (owner >= 0) scorch(state, t);
    randRange(state, 100, 'Pillage Improvement Chance');
    if (owner >= 0) pillageDistrict(state, t);
  }
  if (age === FIRE_POP_TURN) {
    randRange(state, 100, 'Pillage Improvement Chance');
    if (owner >= 0) losePopulation(state, t);
  }
  if (age >= FIRE_DAMAGE_TURNS[0] && age <= FIRE_DAMAGE_TURNS[1]) {
    randRange(state, 100, 'Pillage Improvement Chance');
    strikeUnits(state, t, owner, { land: null, naval: null, civ: true }, null);
    randRange(state, 100, 'Pillage Improvement Chance');
    strikeUnits(state, t, owner, { land: unitDamageDraws(state, t, false, FIRE_DMG[0], FIRE_DMG[1]), naval: null, civ: false }, null);
  }
  if (age >= FIRE_SPREAD_TURNS[0] && age <= FIRE_SPREAD_TURNS[1]
      && randRange(state, 100, 'Pillage Improvement Chance') < Math.round(FIRE_SPREAD_P * 100)) {
    for (const d of RING_DIRS) {
      const n = neighborTile(map, t, d);
      if (n && n.fireStart === undefined && fireCandidate(n, row)) fireBirth(state, n, row);
    }
  }
}

/** Which fire row a plot's fire is, by the feature it burns as or was
 *  burnt as; -1 when its feature is neither. */
function fireRowOf(t: Tile): number {
  const f = t.feature ?? '';
  const burning = FIRE_BURNING_FEATURE.indexOf(f);
  return burning >= 0 ? burning : FIRE_BURNT_FEATURE.indexOf(f);
}

/**
 * THE FIRES' TURN (the one-off tick 0x289430), after the storms' walks: each
 * live fire, in the order they began (`Tile.fireSeq`; the list taken before
 * any strikes, so a fire started this turn waits for the next), strikes at
 * its age (`fireStrike`). A plot whose fire's feature is gone keeps no record.
 */
export function fireTurn(state: GameState): void {
  const live = state.map.tiles.filter((t) => t.fireStart !== undefined)
    .sort((a, b) => (a.fireSeq ?? 0) - (b.fireSeq ?? 0));
  for (const t of live) {
    const row = fireRowOf(t);
    if (row < 0) {
      t.fireStart = undefined;
      t.fireSeq = undefined;
      continue;
    }
    fireStrike(state, t, row, state.turn - t.fireStart!);
  }
}

/**
 * A DROUGHT of severity `sev` centred on `center`: its footprint
 * (`stormFootprint`, `DROUGHT_HEXES`), water skipped, each plot in the
 * footprint's order (`droughtTile`; the drought's strike 0x286530). Its
 * record (`GameState.droughts`) keeps the footprint and its turns
 * (`DROUGHT_TURNS`).
 */
export function drought(state: GameState, center: Tile, sev: number): void {
  const turns = DROUGHT_TURNS[sev];
  const plots: number[] = [];
  for (const t of stormFootprint(state.map, center, DROUGHT_HEXES)) {
    if (isWater(t)) continue;
    plots.push(t.index);
    droughtTile(state, t, sev, turns);
  }
  (state.droughts ??= []).push({ plots, left: turns });
  log(state, `Drought around (${center.col}, ${center.row}) — food suffers for ${turns} turns.`);
}

/**
 * ONE drought plot at severity `sev` (0x286530): each `RandomEvent_Damages`
 * row of the severity in XML order draws ONE "Pillage Improvement Chance"
 * rand(100), whatever stands there — EXTREME's SPECIFIC_IMPROVEMENT_DESTROYED
 * (`DROUGHT_DESTROY_P`) takes a listed improvement away, then both rows'
 * SPECIFIC_IMPROVEMENT_PILLAGED 100 pillages it. The plot dries for the
 * row's turns; then the climate takes its event fertility back
 * (`removeFertility`).
 */
function droughtTile(state: GameState, t: Tile, sev: number, turns: number): void {
  const listed = () => !!t.improvement && DROUGHT_IMPROVEMENTS.includes(t.improvement) && !envImmune(state, t);
  if (DROUGHT_DESTROY_P[sev] > 0 && randRange(state, 100, 'Pillage Improvement Chance') < Math.round(DROUGHT_DESTROY_P[sev] * 100) && listed()) {
    destroyImprovement(state, t);
  }
  randRange(state, 100, 'Pillage Improvement Chance');
  if (listed()) t.pillaged = true;
  t.droughtTurns = Math.max(t.droughtTurns, turns);
  removeFertility(state, t);
}

/**
 * The NEIGHBOURS an eruption strikes, plot by plot: each of `plots` (a
 * volcano's one plot, or a natural wonder's) in ascending order, its six
 * on-map neighbours in DirectionTypes order (`DIRECTION_TYPES`) — a plot two
 * wonder plots share taken twice, a wonder plot beside another taken too (the
 * natural-wonder eruption 0xa22150 walks each plot's six; the eruption itself
 * skips what it does not reach).
 */
export function eruptionRings(map: GameMap, plots: readonly Tile[]): Tile[][] {
  return [...plots].sort((a, b) => a.index - b.index)
    .map((p) => DIRECTION_TYPES.map((d) => neighborTile(map, p, d)).filter((n): n is Tile => !!n));
}

/** An eruption's `RandomEvent_Damages` kinds in the install's row order, each
 *  row present where its chance is above 0. */
const ERUPTION_DAMAGE_KINDS = ['IMPROVEMENT_DESTROYED', 'IMPROVEMENT_PILLAGED', 'DISTRICT_PILLAGED',
  'BUILDING_PILLAGED', 'POPULATION_LOSS', 'UNIT_KILLED_CIVILIAN', 'UNIT_DAMAGE_LAND', 'CITY_GARRISON',
  'CITY_WALLS'] as const satisfies readonly FloodDamageRow['kind'][];
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

/** +1 of a silt channel on a land, non-mountain plot. */
function silt(tile: Tile, key: 'fertility' | 'fertilityProd' | 'fertilitySci' | 'fertilityCul'): void {
  if (isWater(tile) || tile.elevation === 'MOUNTAIN') return;
  tile[key] = (tile[key] ?? 0) + 1;
}

/**
 * AN ERUPTION of a volcano or of a natural wonder (`plots`, its plots), at
 * `ERUPTION_ROWS` row `row` (GameCore_XP2 0xa22000 / 0xa22150: the damage pass
 * 0xa1c1a0, then the soil pass 0xa219e0; `tools/civ6lab/dll_eruption.py`).
 * DAMAGE first, plot by plot (`eruptionRings`: a natural wonder's passes
 * 0xa1c760 / 0xa21680 walk each of its plots in turn, every row over the
 * plot's six before the next plot's — runs/h1_duelw1119 t120,
 * Eyjafjallajokull's three land-unit rolls after its first plot's 31st and
 * its second plot's 32nd and 34th draws): for each damage row in the
 * install's order (`ERUPTION_DAMAGE_KINDS`), for each neighbour the row
 * reaches (`eruptionReaches`), the plot's BONUS resource is lost — land or
 * water, whoever owns it — and ONE draw at the row's chance applies it
 * (`eventDamage`). Then the SOIL, plot by plot: for each `RandomEvent_Yields`
 * row — YIELD_FOOD (`ERUPTION_PAINT_P`), YIELD_PRODUCTION, YIELD_SCIENCE,
 * YIELD_CULTURE, where the row carries one — for each neighbour on land the
 * row reaches (`soilPaintable`), ONE draw at its chance paints Volcanic Soil
 * and adds +1 of the row's yield (every row paints) — a district's, a city
 * centre's or a wonder's plot alike (the soil pass gates on impassable, water
 * and feature alone; the lab's centres gained the rows' yields, its 105
 * district plots all stood on Volcanic Soil, runs/volcano_own_*.jsonl).
 */
export function erupt(state: GameState, plots: readonly Tile[], row: number): void {
  const rings = eruptionRings(state.map, plots);
  const volcano = plots[0];
  for (const ring of rings) {
    for (const kind of ERUPTION_DAMAGE_KINDS) {
      const p = eruptionDamageP(kind, row);
      if (p <= 0) continue;
      for (const n of ring) {
        if (!eruptionReaches(n)) continue;
        if (n.resource && RESOURCES[n.resource].category === 'bonus') n.resource = null;
        if (randRange(state, 100, 'Pillage Improvement Chance') < Math.round(p * 100)) eventDamage(state, n, kind, ERUPTION_DMG_LO[row], ERUPTION_DMG_HI[row]);
      }
    }
  }
  const soil: [number, 'fertility' | 'fertilityProd' | 'fertilitySci' | 'fertilityCul'][] = [
    [ERUPTION_PAINT_P[row], 'fertility'], [ERUPTION_PROD_P[row], 'fertilityProd'],
    [ERUPTION_SCI_P[row], 'fertilitySci'], [ERUPTION_CUL_P[row], 'fertilityCul']];
  for (const ring of rings) {
    for (const [p, key] of soil) {
      if (p <= 0) continue;
      for (const n of ring) {
        if (!soilPaintable(n)) continue;
        if (randRange(state, 100, 'Fertility Gain Chance') >= Math.round(p * 100)) continue;
        if (n.feature !== 'VOLCANIC_SOIL') paintVolcanicSoil(n);
        silt(n, key);
      }
    }
  }
  log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
}

/** a `RandomEvent_Damages` DamageType the shared applier (0x336a50) takes */
type DamageKind = FloodDamageRow['kind'] | 'UNIT_DAMAGE_NAVAL';

/**
 * ONE landed damage row `kind` of an event on one plot, through the shared
 * applier (0x336a50): the improvement, district, building and population
 * rows need an OWNED plot, the unit and city rows do not. UNIT_DAMAGE_LAND
 * (NAVAL) draws once per land (naval) unit on the plot (`unitDamageDraws`);
 * CITY_GARRISON and CITY_WALLS draw the row's band `lo` + rand(`hi` − `lo`)
 * where a city centre stands. A storm passes its row `ev` for its roster's
 * unit terms (`stormSpares`, `stormExtraPct`).
 */
function eventDamage(state: GameState, tile: Tile, kind: DamageKind, lo: number, hi: number, ev: StormEvent | null = null): void {
  const owner = tileSeat(tile);
  const owned = owner >= 0;
  switch (kind) {
    case 'IMPROVEMENT_DESTROYED': if (owned) destroyImprovement(state, tile); return;
    case 'IMPROVEMENT_PILLAGED': if (owned) scorch(state, tile); return;
    case 'DISTRICT_PILLAGED': if (owned) pillageDistrict(state, tile); return;
    case 'BUILDING_PILLAGED': if (owned) pillageTileBuildings(state, tile); return;
    case 'POPULATION_LOSS': if (owned) losePopulation(state, tile); return;
    case 'UNIT_KILLED_CIVILIAN':
      strikeUnits(state, tile, owner, { land: null, naval: null, civ: true }, ev);
      return;
    case 'UNIT_DAMAGE_LAND':
      strikeUnits(state, tile, owner, { land: unitDamageDraws(state, tile, false, lo, hi), naval: null, civ: false }, ev);
      return;
    case 'UNIT_DAMAGE_NAVAL':
      strikeUnits(state, tile, owner, { land: null, naval: unitDamageDraws(state, tile, true, lo, hi), civ: false }, ev);
      return;
    case 'CITY_GARRISON':
    case 'CITY_WALLS': {
      // the band MinHP + rand(MaxHP − MinHP) where a centre stands; the walls'
      // only while they stand unbroken (GameCore_XP2 0x336000 / 0x336170)
      const held = cityAtIndex(state, tile.index);
      if (!held) return;
      if (kind === 'CITY_WALLS' && outerPool(state, held.city) <= 0) return;
      const dmg = lo + randRange(state, hi - lo, 'Random Event Unit Damage Roll');
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
 * accidents. ONE "Pillage Improvement Chance" rand(100) per
 * `RandomEvent_Damages` row of the severity, in the install's order
 * (`ACCIDENT_ROWS`; 0x2d33a0), landing under the row's Percentage, and
 * right after UNIT_DAMAGE_LAND when it fires one more per land unit on the
 * plot: that unit's damage (`unitDamageDraws`). Every accident pillages the
 * Power Plant with no draw, Reinforced Materials or not: the accident
 * pillages every NuclearReactor building itself, outside the damage rows
 * (GameCore_XP2 0x2d33a0; 9 of 9 under Reinforced Materials in
 * runs/c1d_draws.jsonl; 105 of 105 in
 * runs/reactor_reactor_base_20260927T053410Z.jsonl,
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
    const r = randRange(state, 100, 'Pillage Improvement Chance');
    roll.set(kind, r);
    // the row's applier draws right after it, one per land unit on the plot
    if (kind === 'UNIT_DAMAGE_LAND' && r < Math.round(ACCIDENT_LAND_P[sev] * 100) && t) {
      land = unitDamageDraws(state, t, false, ACCIDENT_DMG_LO[sev], ACCIDENT_DMG_HI[sev]);
    }
  }
  // a row the severity does not carry never fires
  const fires = (kind: string, p: number) => (roll.get(kind) ?? 100) < Math.round(p * 100);
  if (t) {
    t.falloutTurns = Math.max(t.falloutTurns ?? 0, ACCIDENT_FALLOUT[sev]);
    pillageHeld({ city }, 'NUCLEAR_POWER_PLANT');
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

/**
 * THE TURN'S RANDOM-EVENT STEP (Game_RandomEvents 0x338710, `tools/civ6lab/
 * dll_readings.md` "C-74", "C-93"), from `RANDOM_EVENT_START_TURN` on: the
 * live droughts' tick, every live storm's walk (`stormsTurn`), every live
 * fire's turn (`fireTurn`; 0x288f40: 0x2876c0, 0x28ecd0, then 0x289430),
 * the volcano roll, then the turn's one random event with its own draws —
 * the last draws before the first player's turn.
 */
export function disasterPhase(state: GameState): void {
  atRngPoint(state, { kind: 'step', seat: -1, turn: state.turn });
  const map = state.map;

  for (const t of map.tiles) {
    if (t.droughtTurns > 0) t.droughtTurns -= 1;
    // CIV6: fallout lasts "for 10 turns" / "for 20 turns" from the blast, and
    // a tile is clean again when the timer expires.
    if ((t.falloutTurns ?? 0) > 0) t.falloutTurns = (t.falloutTurns ?? 0) - 1;
  }
  if (state.droughts) {
    for (const d of state.droughts) d.left -= 1;
    state.droughts = state.droughts.filter((d) => d.left > 0);
  }

  // CIV6 (RANDOM_EVENT_START_TURN): before its first turn the step takes no
  // draw at all
  if (state.turn >= RANDOM_EVENT_START_TURN) {
    stormsTurn(state);
    fireTurn(state);
    volcanoRoll(state);
    randomEvent(state);
  } else seaRise(state);
  // CIV6 (EMERGENCY_SEND_AID, Trigger PLAYER_LOSES_POP_TO_RANDOM_EVENT): the
  // phase's LOWEST victim civilization asks for aid — resolved once at the
  // end, so the order the two engines walk the turn's events cannot pick a
  // different victim; a city-state's or Free City's loss raises nothing
  const hits = (state.aidHit ?? []).filter((s) => isCiv(s));
  if (hits.length) raiseAidRequest(state, Math.min(...hits));
  state.aidHit = undefined;
}

/**
 * The walk of each live storm (records in the order they began; Game_Climate
 * 0x28ecd0 over m_aStorms): a storm walks on the two turns after its birth,
 * the second — its last, turn − start + 1 ≥ Duration — at
 * `STORM_LAST_TURN_PCT` of its rows' chances (`stormWalk`). A record whose
 * turns run out leaves the list.
 */
function stormsTurn(state: GameState): void {
  for (const s of state.storms ?? []) {
    const ev = STORM_EVENTS[s.event];
    const age = ev.duration - s.left;
    stormWalk(state, s, age + 1 >= ev.duration ? STORM_LAST_TURN_PCT : 100);
    s.left -= 1;
  }
  if (state.storms) state.storms = state.storms.filter((s) => s.left > 0);
}

/** The `PrevailingWinds` rows (XML order, `WIND_ROWS`) whose latitude band
 *  holds this row's game latitude (`gameLatitude`; both ends inclusive, so
 *  at 60, 30, 5, 0, −5, −30, −60 two bands pool). */
function windRowsAt(row: number, height: number): typeof WIND_ROWS {
  const lat = gameLatitude(row, height);
  return WIND_ROWS.filter((w) => w.lo <= lat && lat <= w.hi);
}

/**
 * THE STORM'S WALK (Game_Climate 0x28ecd0, one step 0x28c500 "Storm
 * Direction"): `STORM_MOVEMENT` points a turn. Each step is ONE weighted draw
 * (`randWeighted`) over the `PrevailingWinds` rows at the centre's current
 * latitude (`windRowsAt`) whose neighbour that way exists (`DIRECTION_TYPES`)
 * — none, no draw — and the storm moves there whatever the terrain, another
 * storm's centre included: the step costs `STORM_STEP_COST_ON` onto the
 * storm's own terrain (`stormFamilyAt`), `STORM_STEP_COST_OFF` elsewhere, and
 * a drawn step costing more than is left ends the walk, its draw spent. Each
 * step strikes the footprint at the new centre (`stormStrike` at `pct`).
 * Then a "Storm Direction Preview" (`stormPreview`). `_storm_walk` is the twin.
 */
export function stormWalk(state: GameState, s: StormRecord, pct: number): void {
  const map = state.map;
  const ev = STORM_EVENTS[s.event];
  let left = STORM_MOVEMENT;
  for (;;) {
    const c = map.tiles[s.at];
    const rows = windRowsAt(c.row, map.height)
      .map((w) => ({ to: neighborTile(map, c, DIRECTION_TYPES[w.dir]), weight: w.weight }))
      .filter((r) => r.to);
    if (!rows.length) break;
    const to = rows[randWeighted(state, rows.map((r) => r.weight), 'Storm Direction')].to!;
    const cost = stormFamilyAt(to) === ev.family ? STORM_STEP_COST_ON : STORM_STEP_COST_OFF;
    if (cost > left) break;
    left -= cost;
    s.at = to.index;
    stormStrike(state, s, pct);
    for (const i of s.struck) map.tiles[i].stormStruck = true;
  }
  stormPreview(state, s.at);
}

/** "Storm Direction Preview" (0x28d1f0): one weighted draw over the
 *  `PrevailingWinds` rows at the plot's latitude, whatever lies that way —
 *  the heading the game shows; the engine keeps none of it. */
function stormPreview(state: GameState, at: number): void {
  const rows = windRowsAt(state.map.tiles[at].row, state.map.height);
  if (rows.length) randWeighted(state, rows.map((r) => r.weight), 'Storm Direction Preview');
}

/**
 * A NEW STORM of row `e` (0x291a20): its start plot (`stormStart`), the
 * "Storm Direction Preview", its name (ONE draw over the naming player's
 * citizen names, 0x28d400 — the engine keeps no name), then its first strike
 * at full strength on a COPY of the record: the record keeps an empty struck
 * list, so its first walk strikes its birth plots again. It walks the next
 * `duration` − 1 turns.
 */
/**
 * The seat a new storm is named for (Game_Climate 0x28d4f0): the major whose
 * plot it starts on, else the major whose city stands nearest it (the first
 * in seat order at the least distance); -1 with no major city, and the storm
 * goes unnamed with no draw. `_storm_namer` is the twin.
 */
export function stormNamer(state: GameState, t: Tile): number {
  const own = tileSeat(t);
  if (own >= 0 && own < state.seats.length) return own;
  let best = -1;
  let bd = Infinity;
  for (const s of state.seats) {
    for (const c of s.cities) {
      const ct = state.map.tiles[c.centerIndex];
      const d = hexDistance(state.map, t.col, t.row, ct.col, ct.row);
      if (d < bd) { bd = d; best = s.seat; }
    }
  }
  return best;
}

export function stormBirth(state: GameState, e: number): void {
  const ev = STORM_EVENTS[e];
  const center = stormStart(state, ev);
  if (!center) return;
  stormPreview(state, center.index);
  const namer = stormNamer(state, center);
  if (namer >= 0) drawCitizenName(state, namer);
  state.stormSerial = (state.stormSerial ?? 0) + 1;
  (state.storms ??= []).push({ id: state.stormSerial, event: e, at: center.index, left: ev.duration - 1, struck: [] });
  stormStrike(state, { id: 0, event: e, at: center.index, left: 0, struck: [] }, 100);
  log(state, `Storm: ${ev.id} at (${center.col}, ${center.row}) — ${ev.hexes} tiles for ${ev.duration} turns.`);
}

/** [8] the storm rows' weights on a map of `area` plots at `degrees` of
 *  warming: each row's tenths scaled by the map (`mapScaled`), warmed by its
 *  own `ChanceIncreasePerDegree` (`warmedWeight`). */
export function stormWeights(degrees: number, area: number): number[] {
  return STORM_EVENTS.map((ev) => warmedWeight(mapScaled(ev.weight, area), ev.cipd, degrees));
}

/** A storm's (or a drought's) footprint around `center`, on-map plots in the
 *  strike's order (`stormFootprintOffsets`). */
export function stormFootprint(map: GameMap, center: Tile, hexes: number): Tile[] {
  return tilesAtOffsets(map, center.col, center.row, stormFootprintOffsets(hexes));
}

/** a plot no event yield lands on: water, or impassable (a mountain, an
 *  impassable natural wonder) */
function barren(t: Tile): boolean {
  return isWater(t) || isImpassable(t);
}

/**
 * ONE STORM STRIKE (0x286f80) at the storm's centre, at `pct` of its rows:
 * every footprint plot the storm has not yet struck (`StormRecord.struck`)
 * is struck (`stormPlot`) and joins the struck list. `_storm_strike` is the
 * twin.
 */
export function stormStrike(state: GameState, s: StormRecord, pct: number): void {
  const ev = STORM_EVENTS[s.event];
  for (const t of stormFootprint(state.map, state.map.tiles[s.at], ev.hexes)) {
    if (s.struck.includes(t.index)) continue;
    stormPlot(state, t, s.event, pct);
    s.struck.push(t.index);
  }
}

/**
 * ONE plot of a strike by storm row `e` at `pct` of its rows (0x286f80): each
 * `RandomEvent_Damages` row (XML order, `STORM_ROWS`) draws ONE rand(100)
 * against Percentage × pct // 100 — the row's CoastalLowlandPercentage on a
 * coastal-lowland plot — a landed row applied at once through the shared
 * applier (`eventDamage`, its unit rolls straight after); then, off water
 * and impassable plots, each `RandomEvent_Yields` row draws one rand(100)
 * against Percentage × pct // 100, +1 of its yield where it falls under —
 * where the sea's rise halts a storm's fertility (`stormFertilityHalted`),
 * the plot's event fertility is taken back instead (`removeFertility`).
 * `_storm_plot` is the twin.
 */
export function stormPlot(state: GameState, t: Tile, e: number, pct: number): void {
  const ev = STORM_EVENTS[e];
  const rows = STORM_ROWS[e];
  const lowland = (t.lowland ?? 0) > 0;
  for (const row of rows.dmg) {
    const chance = row.lowland >= 0 && lowland ? row.lowland : Math.floor((row.pct * pct) / 100);
    if (randRange(state, 100, 'Pillage Improvement Chance') < chance) eventDamage(state, t, row.kind as DamageKind, row.lo, row.hi, ev);
  }
  if (stormFertilityHalted(state)) {
    if (!barren(t)) removeFertility(state, t);
  } else if (!barren(t)) {
    for (const row of rows.yields) {
      if (randRange(state, 100, 'Boosted Yield Chance') >= Math.floor((row.pct * pct) / 100)) continue;
      silt(t, row.yield === 'YIELD_FOOD' ? 'fertility' : 'fertilityProd');
    }
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
