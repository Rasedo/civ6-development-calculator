
import type { City, DistrictId, GameMap, GameState, ImprovementId, Tile } from './types';
import { hexDistance, neighbors, neighborTile } from '../../world/hex';
import { isWater, isImpassable, isMountain, isCoastalWater, hasRiver, naturalWonderAt } from '../../world/query';
import { computeUnlocks, isTechComplete, isCivicComplete, type Unlocks } from './effects';
import { isExplored } from './fog';
import { riverReach } from './disasters';
import { congressChopBanned, congressEnergyBlocked, congressEnergyDiscount, congressUdtBlockedDistrict } from './congress';
import { tileAppeal, type GpAppeal } from './appeal'; // SEASIDE_RESORT gates on appeal
import { cityAppealResolver } from './governors';
import { IMPROVEMENTS, SEASIDE_RESORT_MIN_APPEAL } from '../data/improvements';
import { isSuzerain } from './cityStates';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { DISTRICTS } from '../data/districts';
import { GOVERNMENTS } from '../data/policies';
import { seatGovernmentId } from './seatTurn';
import { cityLowlands, floodBarrierCost } from './climate';
import { BUILDINGS, type BuildingDef, buildingsForDistrict } from '../data/buildings';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { CITY_MIN_DIST } from '../../world/types';
import { UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN } from '../data/units';
import { PROJECTS } from '../data/projects';
import { CITY_WORK_RADIUS, maxSpecialtyDistricts } from '../data/constants';
import { gpCityPermOf } from '../data/greatPeople';
import { allCities, campTiles, citiesOf, civOf, seatOf, tileBelongsTo, tileClaimed, tileSeat } from './seats';
import { getModifiers } from './effects';
import { irradiated } from './nuclear';

export interface RuleResult {
  ok: boolean;
  reason?: string;
}

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

function gates(state: GameState, seat: number): Unlocks | null {
  return state.sandbox ? null : computeUnlocks(state, seat);
}


/**
 * May `seat` found a city on this tile? ONE rule, asked per seat.
 *
 * The city cap is SIX for every seat (fixed GPU slots), spacing is a flat
 * CITY_MIN_DIST from EVERY existing centre — own, foreign or city-state — and
 * foreign territory is closed. A refused planned site drops while the settler
 * stays banked, mirroring the GPU's site consumption.
 */
export function canFoundCity(state: GameState, tileIndex: number, seat: number): RuleResult {
  const tile = state.map.tiles[tileIndex];
  // CIV6 (Isolationism): "Can't train or buy Settlers nor settle new cities."
  if (getModifiers(state, seat).noSettlers) return no('Isolationism forbids new cities.');
  if (citiesOf(state, seat).length >= 6) return no('Cannot govern more cities (6 max).');
  if (!isExplored(state, seat, tileIndex)) return no('Unexplored — send a unit to scout it first.');
  if (isWater(tile)) return no('Cities must be founded on land.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (naturalWonderAt(tile)) return no('Cannot settle on a natural wonder.');
  if (tile.feature === 'OASIS') return no('Cannot settle on an oasis.');
  if (tile.district) return no('Tile already occupied.');
  if (tileClaimed(tile) && tileSeat(tile) !== seat) return no('Foreign territory.');
  for (const c of allCities(state)) {
    const centre = state.map.tiles[c.centerIndex];
    if (hexDistance(centre.col, centre.row, tile.col, tile.row) < CITY_MIN_DIST) {
      return no(`Too close to ${c.name} (min ${CITY_MIN_DIST} tiles).`);
    }
  }
  for (const cityState of state.cityStates ?? []) {
    const centre = state.map.tiles[cityState.centerIndex];
    if (hexDistance(centre.col, centre.row, tile.col, tile.row) < CITY_MIN_DIST) {
      return no(`Too close to the city-state of ${cityState.name}.`);
    }
  }
  return ok;
}


/**
 * CIV6 (Fort, Airstrip): each may be built "in your own or neutral territory",
 * on land. The one predicate the engineer's improvements, its road and the
 * GPU's `_eng_tile_ok` twin all answer to.
 */
export function engineerTileOk(tile: Tile, ownsTile: (t: Tile) => boolean): boolean {
  if (isWater(tile) || isImpassable(tile)) return false;
  // CIV6 (Natural Wonder): a wonder tile cannot be improved — the engineer's
  // roads and railroads included, and a PASSABLE wonder is ground to stand
  // on, not to build on. `canFoundCity`, `validImprovementsIn`,
  // `canPlaceDistrictIn` and `wonderTerrainOk` carry the same refusal.
  if (naturalWonderAt(tile)) return false;
  return ownsTile(tile) || tileSeat(tile) < 0;
}

/**
 * CIV6 (Military Engineer): "Can construct Roads ... (uses 1 charge)". A road
 * already laid — by a trade route or by another engineer — is nothing to lay
 * again.
 */
export function canBuildRoad(tile: Tile, ownsTile: (t: Tile) => boolean): boolean {
  return !tile.road && engineerTileOk(tile, ownsTile);
}

/** CIV6 (Railroad): "Can only be constructed by Military Engineers. Does not
 *  cost a charge, but does cost 1 Iron and 1 Coal." Its page names no terrain
 *  clause of its own, so the Engineer's own ground rule is the whole gate. */
export function canBuildRailroad(tile: Tile, ownsTile: (t: Tile) => boolean): boolean {
  return !tile.railroad && engineerTileOk(tile, ownsTile);
}

export function validImprovementsIn(
  tile: Tile,
  opts: {
    unlocks: Unlocks | null;
    ownsTile: (t: Tile) => boolean;
    map?: GameMap;
    camps?: ReadonlySet<number>;
    gpAppeal?: GpAppeal;
    builder?: string;
    /** the city-states this seat is SUZERAIN of, by name. */
    suzerain?: ReadonlySet<string>;
    /** the civilization the seat plays (`civOf`), for the UNIQUE rows */
    civ?: string | null;
  },
): ImprovementId[] {
  // gate-catch (rng 2026006080 t246): builtWonder tiles are PAVED — an
  // in-flight wonder pave refuses improvements exactly like a district pave
  // (real Civ 6).
  if (tile.district || naturalWonderAt(tile) || tile.builtWonder || isImpassable(tile)) return [];

  const unlocks = opts.unlocks;
  const unlocked = (imp: ImprovementId) => !unlocks || unlocks.improvements.has(imp);

  // A MILITARY ENGINEER builds ONLY the rows the catalog marks `engineer`, and
  // never a Farm, Mine, Camp or Plantation — without the guard the best-delta
  // chooser would take the Farm every time, since a Fort yields nothing. Its
  // rows sit ABOVE the ownership gate and the resource early return, because
  // both of the Civ 6 pages read "in your own or neutral territory".
  const fortBuilder = opts.builder !== undefined && opts.builder !== 'MILITARY_ENGINEER' && !!UNITS[opts.builder]?.fortBuilder;
  if (opts.builder === 'MILITARY_ENGINEER' || fortBuilder) {
    if (!engineerTileOk(tile, opts.ownsTile) || tile.improvement) return [];
    const out: ImprovementId[] = [];
    for (const def of Object.values(IMPROVEMENTS)) {
      // CIV6 (Legion): the Roman Fort is the FORT row, laid without its tech.
      if (fortBuilder ? def.id !== 'FORT' : (!def.engineer || !unlocked(def.id))) continue;
      if (def.noFeature && tile.feature) continue;
      if (def.terrains && !def.terrains.includes(tile.terrain)) continue;
      if (def.excludeTerrains?.includes(tile.terrain)) continue;
      if (def.elevations && !def.elevations.includes(tile.elevation)) continue;
      out.push(def.id);
    }
    return out;
  }
  if (!opts.ownsTile(tile)) return []; // must be inside the owner's borders
  // CIV6: every other improvement is the BUILDER's alone. A charge-carrying
  // Missionary/Apostle must refuse here exactly as the GPU improvement arm
  // does with its builder-type gate — a wire order for any other unit no-ops.
  if (opts.builder !== undefined && opts.builder !== 'BUILDER') return [];
  if (tile.resource) {
    const imp = RESOURCES[tile.resource].improvement;
    return unlocked(imp) ? [imp] : [];
  }
  if (isWater(tile)) {
    // the WATER-ONLY rows (the Offshore Wind Farm): a water plot with no
    // resource under it to insist on a different improvement; each row's own
    // `terrains` list is the whole ground rule.
    const out: ImprovementId[] = [];
    if (tile.submerged) return out;
    for (const def of Object.values(IMPROVEMENTS)) {
      if (!def.waterOnly || !unlocked(def.id)) continue;
      if (def.terrains && !def.terrains.includes(tile.terrain)) continue;
      if (def.noFeature && tile.feature) continue;
      out.push(def.id);
    }
    return out;
  }

  const out: ImprovementId[] = [];
  // THE SUZERAIN IMPROVEMENTS. Each is offered only while this seat holds the
  // named city-state's suzerainty, and each carries its own ground rules —
  // terrain, elevation, and the ban on standing beside its own kind.
  for (const def of Object.values(IMPROVEMENTS)) {
    if (!def.suzerainOf && !def.uniqueTo) continue;
    if (def.suzerainOf && !opts.suzerain?.has(def.suzerainOf)) continue;
    if (def.uniqueTo && (def.uniqueTo !== opts.civ || !unlocked(def.id))) continue;
    if (def.features && tile.feature !== null && !def.features.includes(tile.feature)) continue;
    if (def.terrains && !def.terrains.includes(tile.terrain)) continue;
    if (def.excludeTerrains?.includes(tile.terrain)) continue;
    if (def.elevations && !def.elevations.includes(tile.elevation)) continue;
    if (def.noAdjacentSame && opts.map
        && neighbors(opts.map, tile).some((n) => n.improvement === def.id)) continue;
    out.push(def.id);
  }
  const flat = tile.elevation === 'FLAT';
  const hills = tile.elevation === 'HILLS';
  const hillFarmsOk = !unlocks || unlocks.hillFarms;

  if (
    unlocked('FARM') &&
    ((tile.feature === null &&
      (tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS') &&
      (flat || (hills && hillFarmsOk))) ||
      tile.feature === 'FLOODPLAINS')
  ) {
    out.push('FARM');
  }
  if (unlocked('MINE') && hills && tile.feature === null) out.push('MINE');
  // FORT — Military Engineer only, and only on open ground. Real
  // Civ 6 allows it on any passable land tile the owner holds; the district /
  // wonder / impassable paves are already refused above, and a resource tile
  // returns early with its own improvement, so nothing more is needed here.
  if (unlocked('LUMBER_MILL') && tile.feature === 'WOODS') out.push('LUMBER_MILL');
  // SEASIDE RESORT — real Civ 6: a FLAT COASTAL Grassland/Plains/
  // Desert tile with BREATHTAKING appeal (>= 4). Needs the map (coast
  // adjacency + appeal), so callers that pass none simply never offer it —
  // a safe default, not a silent rule change.
  if (
    unlocked('SEASIDE_RESORT') &&
    opts.map &&
    flat &&
    tile.feature === null &&
    (tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS' || tile.terrain === 'DESERT') &&
    neighbors(opts.map, tile).some((n) => n.terrain === 'COAST') &&
    tileAppeal(opts.map, tile, opts.camps, opts.gpAppeal) >= SEASIDE_RESORT_MIN_APPEAL
  ) {
    out.push('SEASIDE_RESORT');
  }
  // THE GROUND-ONLY ROWS. Nothing gates them but their own catalog clause:
  // the resource branch and the water/pave refusals above have already
  // answered for every tile that has an opinion of its own.
  for (const def of Object.values(IMPROVEMENTS)) {
    if (!def.groundOnly || !unlocked(def.id)) continue;
    if (def.requiresFeature && tile.feature !== def.requiresFeature) continue;
    if (def.noFeature && tile.feature) continue;
    if (def.terrains && !def.terrains.includes(tile.terrain)) continue;
    if (def.excludeTerrains?.includes(tile.terrain)) continue;
    if (def.elevations && !def.elevations.includes(tile.elevation)) continue;
    out.push(def.id);
  }
  return out;
}

/** The city-states this seat is suzerain of, by name — what gates a
 *  suzerain improvement's row in `validImprovementsIn`. */
export function suzerainNames(state: GameState, seat: number): ReadonlySet<string> {
  const out = new Set<string>();
  for (const cs of state.cityStates) if (isSuzerain(state, cs, seat)) out.add(cs.name);
  return out;
}

export function validImprovements(state: GameState, tile: Tile, seat: number): ImprovementId[] {
  return validImprovementsIn(tile, {
    unlocks: gates(state, seat),
    ownsTile: (t) => tileSeat(t) === seat,
    map: state.map, // SEASIDE_RESORT needs coast adjacency + appeal
    camps: campTiles(state),
    gpAppeal: cityAppealResolver(state),
    suzerain: suzerainNames(state, seat),
    civ: civOf(state, seat),
  });
}

export function canRemoveFeature(state: GameState, tile: Tile, seat: number): RuleResult {
  if (!tile.feature) return no('No feature here.');
  const def = FEATURES[tile.feature];
  if (!def.removable) return no(`${def.name} cannot be removed.`);
  if (congressChopBanned(state, tile.feature)) return no(`The Congress protects ${def.name}.`);
  if (tile.resource) {
    const res = RESOURCES[tile.resource];
    if (res.requiresFeature?.includes(tile.feature)) {
      return no(`${res.name} depends on the ${def.name}.`);
    }
  }
  const unlocks = gates(state, seat);
  if (unlocks && !unlocks.featureRemovals.has(tile.feature)) {
    return no(`Removing ${def.name} requires further research.`);
  }
  return ok;
}


export function canPlaceDistrictIn(
  state: GameState,
  city: City,
  type: DistrictId,
  tileIndex: number,
  opts: { unlocks: Unlocks | null; ownsTile: (t: Tile) => boolean },
): RuleResult {
  const map = state.map;
  const def = DISTRICTS[type];
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  const unlocks = opts.unlocks;
  if (unlocks && type !== 'CITY_CENTER' && !unlocks.districts.has(type)) {
    return no(`${def.name} requires research.`);
  }

  if (!opts.ownsTile(tile)) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0) return no('City center occupies this tile.');
  if (dist > CITY_WORK_RADIUS) return no('Too far from the city center.');
  if (tile.district) return no('Another district is here.');
  if (irradiated(tile)) return no('Radioactive fallout covers this tile.');
  if (tile.builtWonder) return no('A wonder occupies this tile.');
  if (naturalWonderAt(tile)) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.feature === 'OASIS') return no('Districts cannot be built on an oasis.');
  // GS lets districts be built on every kind of Floodplains (they flood
  // instead of being refused), so there is no floodplain test here.
  //
  // A district PAVES the tile, so a removable feature standing on it must be
  // one this seat could clear — real Civ 6 refuses the plot until the removal
  // tech is in. `unlocks === null` is the sandbox, which gates nothing.
  if (tile.feature && FEATURES[tile.feature].removable && unlocks && !unlocks.featureRemovals.has(tile.feature)) {
    return no(`Clearing ${FEATURES[tile.feature].name} requires further research.`);
  }

  if (def.placement.onCoastalWater) {
    if (!isCoastalWater(map, tile)) return no('Must be on coast/lake water adjacent to land.');
  } else if (isWater(tile)) {
    return no('Must be on land.');
  }
  if ((def.placement.flatLand || def.placement.canalPassage) && tile.elevation === 'HILLS') {
    return no('Must be on flat land.');
  }
  // CIV6 (Dam): "It must be built on a Floodplains tile and the River must
  // traverse at least 2 adjacent sides of the future Dam tile", with a
  // "Limit of one per River".
  if (def.placement.floodplainRiver) {
    if (tile.feature !== 'FLOODPLAINS') return no('Must be on a floodplain.');
    if (riverSideCount(tile) < 2) return no('The river must run along two of its sides.');
    for (const t of riverReach(map, tile)) {
      if (t.index !== tile.index && t.district === type) return no(`This river already has a ${def.name}.`);
    }
  }
  // CIV6 (Canal): "must be built on flat land with a Coast or Lake tile on one
  // side, and either a City Center or another body of water on the other. A
  // single canal passage may go either straight, or bend 60 degrees" — so the
  // two sides sit 2, 3 or 4 directions apart; 1 or 5 is the 120-degree turn
  // the source refuses.
  if (def.placement.canalPassage && !canalPassageOk(map, tile)) {
    return no('Needs water on one side and a City Center or a second body of water on the other.');
  }

  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  if (!def.allowMultiple && city.districts.some((d) => d.type === type)) {
    return no(`${def.name} already exists in this city.`);
  }
  // CIV6 (Water Park): "cannot be built if an Entertainment Complex already
  // exists in this city."
  for (const x of def.exclusiveDistricts ?? []) {
    if (city.districts.some((d) => d.type === x)) {
      return no(`${DISTRICTS[x].name} already exists in this city.`);
    }
  }
  // CIV6 (Government Plaza, Diplomatic Quarter): "Limit of one per
  // civilization" — every city this seat holds, not just this one.
  if (def.oneCivWide) {
    for (const other of citiesOf(state, city.seat)) {
      if (other.districts.some((d) => d.type === type)) {
        return no(`${def.name} already exists in this civilization.`);
      }
    }
  }
  if (def.countsTowardLimit) {
    const specialty = city.districts.filter((d) => DISTRICTS[d.type].countsTowardLimit).length;
    // CIV6 (Bi Sheng, Ada Lovelace): "Lets this city build one more district
    // than the Population limit allows" — a permanent per-city raise.
    const cap = maxSpecialtyDistricts(city.population) + gpCityPermOf(city, 'districtLimit');
    if (specialty >= cap) {
      return no(`Needs more population (${specialty}/${cap} district slots used).`);
    }
  }

  const around = neighbors(map, tile);
  if (def.placement.requiresAdjacentCityCenter) {
    if (!around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Must be adjacent to the City Center.');
    }
  }
  if (def.placement.requiresWaterSourceOrMountain) {
    const sourced =
      hasRiver(tile) ||
      around.some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n));
    if (!sourced) return no('Needs an adjacent river, lake, oasis or mountain.');
  }
  if (def.placement.notAdjacentToCityCenter) {
    if (around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Cannot be adjacent to the City Center.');
    }
  }
  return ok;
}

/** CIV6 (Dam): "the River must traverse at least 2 adjacent sides". */
export function riverSideCount(tile: Tile): number {
  let n = 0;
  for (let d = 0; d < 6; d++) if (tile.riverMask & (1 << d)) n += 1;
  return n;
}

/** The Canal's two-sided passage test — a lake/coast entry and an exit that is
 *  a City Center or any water, no sharper than a 60-degree bend. */
export function canalPassageOk(map: GameMap, tile: Tile): boolean {
  const around: (Tile | null)[] = [];
  for (let d = 0; d < 6; d++) around.push(neighborTile(map, tile, d));
  for (let a = 0; a < 6; a++) {
    const na = around[a];
    if (!na || (na.terrain !== 'COAST' && na.terrain !== 'LAKE')) continue;
    for (let b = 0; b < 6; b++) {
      const turn = (b - a + 6) % 6;
      if (turn < 2 || turn > 4) continue;
      const nb = around[b];
      if (!nb) continue;
      if (isWater(nb) || nb.district === 'CITY_CENTER') return true;
    }
  }
  return false;
}

export function canPlaceDistrict(
  state: GameState,
  city: City,
  type: DistrictId,
  tileIndex: number,
): RuleResult {
  return canPlaceDistrictIn(state, city, type, tileIndex, {
    unlocks: gates(state, city.seat),
    ownsTile: (t) => tileBelongsTo(t, city),
  });
}

export function districtPlacementTiles(state: GameState, city: City, type: DistrictId): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (!tileBelongsTo(t, city)) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceDistrict(state, city, type, t.index).ok) out.push(t.index);
  }
  return out;
}


/**
 * Buildings the city could queue right now (research-gated). Districts under
 * construction count (queue-ahead, like Civ 6) — a chain prerequisite is
 * satisfied by an owned OR already-queued building; the turn loop refuses to
 * finish a building before its district/prereqs exist.
 */
/**
 * The WALLS TIER a city stands behind: 4 once its owner holds Steel, which
 * "builds modern fortifications around the City Centers of all current and
 * future cities" with no production at all, otherwise the highest tier among
 * the walls buildings it has finished.
 */
/** The walls LEVEL this city has BUILT — Ancient 1, Medieval 2, Renaissance
 *  3, and 0 with none. `wallsTier` is the DEFENCE tier, which Urban Defenses
 *  raises without a wall standing; a housing or yield term wants this one. */
export function wallsLevel(city: { buildings: string[] }): number {
  let level = 0;
  for (const b of city.buildings) level = Math.max(level, BUILDINGS[b]?.walls ?? 0);
  return level;
}

export function wallsTier(state: GameState, city: { buildings: string[]; seat: number }): number {
  // a city-state's centre arrives here as a stand-in City whose seat has no
  // Seat record at all, so the tech read has to tolerate one
  if (seatOf(state, city.seat)?.research.techs.includes(URBAN_DEFENSES_TECH)) return WALLS_TIER_URBAN;
  return wallsLevel(city);
}

/**
 * CIV6 (Repair Outer Defenses): "Walls gain HP equal to the Production
 * invested into the project (on Standard speed) each turn the project runs."
 * `before` is the head's progress as it stood before whatever just paid into
 * it, so a chop and a Great Engineer's lump raise the perimeter exactly as
 * the turn's own production does — and damage taken mid-repair stays taken,
 * which reading the pool off total progress would silently undo.
 */
export function repairDrip(state: GameState, city: City, before: number): void {
  const q = city.queue[0];
  if (q?.kind !== 'project' || !PROJECTS[q.project]?.repair) return;
  const max = wallsMax(state, city);
  let gain = Math.round(q.progress) - Math.round(before);
  const cur = outerPool(state, city);
  const add = Math.min(gain, Math.max(0, max - cur));
  city.outerHp = cur + add;
  gain -= add;
  // what the centre's pool cannot hold falls on the Encampment's own
  if (gain > 0) {
    for (const d of city.districts) {
      const t = state.map.tiles[d.tileIndex];
      if (t.district !== 'ENCAMPMENT' || !t.districtComplete) continue;
      const ecur = encampOuterPool(state, city, t);
      const eadd = Math.min(gain, Math.max(0, max - ecur));
      t.encampOuterHp = ecur + eadd;
      gain -= eadd;
    }
  }
}

/** The size of that tier's perimeter pool — what a fresh set of walls is
 *  worth and what a repair restores. */
export function wallsMax(state: GameState, city: { buildings: string[]; seat: number }): number {
  return WALLS_TIER_HP[wallsTier(state, city)] ?? 0;
}

/** The outer-defense pool a city has right now. Absent = FULL where the walls
 * stand and 0 where they do not, the convention `encampmentIntact` uses for the
 * Encampment garrison: the completion sites write the value explicitly, so an
 * absent one means an imported or directly-constructed state, never a breach. */
export function outerPool(state: GameState, city: { buildings: string[]; seat: number; outerHp?: number }): number {
  const max = wallsMax(state, city);
  return Math.min(city.outerHp ?? max, max);
}

/**
 * CIV6: unlocking Urban Defenses "builds modern fortifications around the City
 * Centers of all current and future cities and their Encampment districts" —
 * no production, no building row, so the perimeter simply arrives at the new
 * tier's full pool. Cities founded afterwards read the same tier through
 * `wallsMax` and need no write; only the standing ones do, because a breach
 * they are already carrying is what the fortifications replace.
 */
export function urbanDefensesFit(state: GameState, seat: number): void {
  for (const c of seatOf(state, seat)?.cities ?? []) {
    c.outerHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
    // every completion hook fires BEFORE the tech lands in `research.techs`,
    // so the encampment write uses the same constant the centre does —
    // `fitEncampOuter`'s `wallsMax` recompute would still answer the old tier
    for (const d of c.districts) {
      const t = state.map.tiles[d.tileIndex];
      if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
    }
  }
}

/** CIV6 (Encampment): the district's Defenses are their OWN pool — "building
 *  any level of Walls in the city will supply both", yet destroying one does
 *  not destroy the other. Absent = FULL at the tier the owning city's walls
 *  supply, `outerPool`'s own convention. */
export function encampOuterPool(
  state: GameState,
  city: { buildings: string[]; seat: number },
  tile: { encampOuterHp?: number },
): number {
  const max = wallsMax(state, city);
  return Math.min(tile.encampOuterHp ?? max, max);
}

/** the Encampment perimeter HP this city's district is missing — what the
 *  repair project must put back beyond the centre's own breach. */
export function encampOuterMissing(state: GameState, city: City): number {
  const max = wallsMax(state, city);
  let missing = 0;
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.district === 'ENCAMPMENT' && t.districtComplete) missing += max - encampOuterPool(state, city, t);
  }
  return missing;
}

/** the write half: every walls site that refits the centre's perimeter refits
 *  the Encampment's own pool too, at the same tier's full value. */
export function fitEncampOuter(state: GameState, city: City): void {
  const max = wallsMax(state, city);
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = max;
  }
}

/**
 * What a building actually costs THIS city right now.
 *
 * Every row but one is its catalog constant. CIV6 (Flood Barrier): "Initial
 * Production cost ... [is] variable based on the number of Coastal Lowland
 * tiles in this city and the current sea level. The formula is (80 x coastal
 * lowland tiles) + (80 x coastal lowland tiles x flood level)" — so its price
 * climbs while it is being built, which is the whole reason a barrier can
 * become the queue item that never finishes.
 *
 * The production MASK's column order still reads the catalog constant, so a
 * live price never reshuffles the wire.
 */
export function buildingCostIn(state: GameState, city: City, id: string): number {
  const def = BUILDINGS[id];
  if (!def) return 0;
  const base = def.floodBarrier ? floodBarrierCost(state, city) : def.cost;
  return Math.round(base * congressEnergyDiscount(state, id));
}

/** building ids some tech or civic unlocks — the rows `computeUnlocks` can ever grant */
export const RESEARCH_GATED_BUILDINGS: ReadonlySet<string> = new Set(
  [...Object.values(TECHS), ...Object.values(CIVICS)]
    .flatMap((d) => d.effects)
    .flatMap((fx) => (fx.kind === 'unlockBuilding' ? [fx.building] : [])),
);

export function availableBuildings(state: GameState, city: City): BuildingDef[] {
  return buildableBuildings(state, city, false);
}

/** The GOLD-purchase list — `availableBuildings` with the queue term relaxed
 * to the item being WORKED (real Civ 6 sells a queued building: the entry is
 * invalidated and its progress banks) and an exclusion firing off built rows
 * alone; worship rows never sell for Gold. Buying out the item under
 * production stays refused on both engines — an open fidelity question. Pair
 * with `buildingCompletable`, exactly as the purchase appliers do. */
export function goldPurchasableBuildings(state: GameState, city: City): BuildingDef[] {
  return buildableBuildings(state, city, true);
}

function buildableBuildings(state: GameState, city: City, gold: boolean): BuildingDef[] {
  const map = state.map;
  const unlocks = gates(state, city.seat);
  // CIV6: "Production cannot be applied to anything in tiles containing
  // contamination" — an irradiated district takes no new picks, and like the
  // Urban Development Treaty's block, whatever is in flight still finishes.
  const placed = new Set(
    city.districts.filter((d) => !irradiated(map.tiles[d.tileIndex])).map((d) => d.type),
  );
  const queuedSrc = gold ? city.queue.slice(0, 1) : city.queue;
  const queued = new Set(
    queuedSrc.filter((q) => q.kind === 'building').map((q) => (q.kind === 'building' ? q.building : '')),
  );
  const have = new Set(city.buildings);
  const center = map.tiles[city.centerIndex];

  const out: BuildingDef[] = [];
  // CIV6 (Urban Development Treaty, outcome B): "No buildings can be created
  // in this district." New picks only — in-flight items finish.
  const blockedD = congressUdtBlockedDistrict(state);
  const blockedB = congressEnergyBlocked(state);
  for (const type of placed) {
    if (type === blockedD) continue;
    for (const def of buildingsForDistrict(type)) {
      if (have.has(def.id) || queued.has(def.id)) continue;
      if (def.worship) {
        if (gold) continue;
        if (seatOf(state, city.seat)?.religion.worship !== def.id) continue;
      } else if (unlocks && RESEARCH_GATED_BUILDINGS.has(def.id) && !unlocks.buildings.has(def.id)) {
        // the research gate holds only rows some tech or civic GRANTS: a
        // Government Plaza tier building (or Hangar/Airport) is unlocked by
        // no research, so its own clauses below are its whole gate — the
        // GPU's `b_unlock` reads -1 there and admits the row the same way.
        continue;
      }
      if (def.requiresAny && !def.requiresAny.some((r) => have.has(r) || queued.has(r))) continue;
      if (def.exclusiveWith?.some((x) => have.has(x) || (!gold && queued.has(x)))) continue;
      // CIV6: a government building "requires a Tier 2 government (Merchant
      // Republic, Monarchy, or Theocracy)" — the tier of what the seat is
      // running NOW, so a revolution can take an unbuilt row back off the list.
      if (def.govTier && governmentTier(state, city.seat) < def.govTier) continue;
      if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
      // CIV6 (Flood Barrier): "Must be built in a city with one or more
      // Coastal Lowland tiles."
      if (def.floodBarrier && cityLowlands(state, city).length === 0) continue;
      // CIV6 (Global Energy Treaty, outcome B): "Buildings of this type
      // cannot be created by any player." New picks only.
      if (def.id === blockedB) continue;
      // CIV6: "While city defenses are damaged, you cannot build higher
      // levels of Walls."
      if (def.walls && outerPool(state, city) < wallsMax(state, city)) continue;
      out.push(def);
    }
  }
  return out;
}

/** The tier of the government this seat is running, 0 for Chiefdom or none.
 *   is the one derivation both engines share. */
export function governmentTier(state: GameState, seat: number): number {
  const id = seatGovernmentId(state, seat);
  return id ? GOVERNMENTS[id]?.tier ?? 0 : 0;
}

export function buildingCompletable(state: GameState, city: City, buildingId: string): boolean {
  const def = BUILDINGS[buildingId];
  if (!def) return false;
  if (def.govTier && governmentTier(state, city.seat) < def.govTier) return false;
  const districtDone = city.districts.some(
    (d) => d.type === def.district && state.map.tiles[d.tileIndex].districtComplete,
  );
  if (!districtDone) return false;
  // CIV6: "Production cannot be applied to anything in tiles containing
  // contamination", and no Gold or Faith buys it either. A building lives in
  // its district, so the district's TILE is what has to be clean.
  const seat = city.districts.find(
    (d) => d.type === def.district && state.map.tiles[d.tileIndex].districtComplete
      && !irradiated(state.map.tiles[d.tileIndex]),
  );
  if (!seat) return false;
  if (def.requiresAny && !def.requiresAny.some((r) => city.buildings.includes(r))) return false;
  return true;
}

export function buildingDef(id: string): BuildingDef {
  return BUILDINGS[id];
}


export function wonderExists(state: GameState, wonderId: string): boolean {
  return state.map.tiles.some((t) => t.builtWonder === wonderId);
}

/**
 * The half of a wonder's placement the MAP alone decides — terrain,
 * elevation, feature, river, coast and the mountain next door. The exporter
 * bakes it into the `wok` tile bitmask the GPU reads, so both engines answer
 * it out of this one body and neither re-derives it.
 */
export function wonderTerrainOk(def: BuiltWonderDef, tile: Tile, map: GameMap): boolean {
  if (naturalWonderAt(tile) || isImpassable(tile)) return false;
  const p = def.placement;
  if (p.onCoastalWater) {
    // CIV6: "on Coast adjacent to land", and every wonder that asks for it
    // states "It cannot be built on a Lake" in the same breath.
    if (tile.terrain !== 'COAST' || !isCoastalWater(map, tile)) return false;
  } else {
    if (isWater(tile)) return false;
    if (p.onFeature) {
      if (!tile.feature || !p.onFeature.includes(tile.feature)) return false;
    } else {
      if (tile.feature === 'FLOODPLAINS' && !p.allowFloodplains) return false;
      if (tile.feature === 'OASIS') return false;
    }
    if (p.terrains && !p.terrains.includes(tile.terrain)) return false;
    if (p.excludeTerrains?.includes(tile.terrain)) return false;
    if (p.flatOnly && tile.elevation !== 'FLAT') return false;
    if (p.hillsOnly && tile.elevation !== 'HILLS') return false;
  }
  if (p.requiresRiver && !hasRiver(tile)) return false;
  if (p.adjacentMountain && !neighbors(map, tile).some((n) => isMountain(n))) return false;
  return true;
}

/** The city holding this district tile, if any. */
function cityAtTile(state: GameState, tile: Tile): City | undefined {
  if (tile.ownerSeat < 0 || tile.ownerCity < 0) return undefined;
  return citiesOf(state, tile.ownerSeat).find((c) => c.id === tile.ownerCity);
}

export function canPlaceWonder(
  state: GameState,
  city: City,
  wonderId: string,
  tileIndex: number, seat: number): RuleResult {
  const def = BUILT_WONDERS[wonderId];
  if (!def) return no('No such wonder.');
  const map = state.map;
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  if (!state.sandbox) {
    if (def.requiresTech && !isTechComplete(state, def.requiresTech, seat)) {
      return no(`${def.name} requires research.`);
    }
    if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) {
      return no(`${def.name} requires a civic.`);
    }
  }
  if (wonderExists(state, wonderId)) return no(`${def.name} already exists in the world.`);

  if (!tileBelongsTo(tile, city)) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0 || dist > CITY_WORK_RADIUS) return no('Must be within 3 tiles of the city center.');
  if (tile.district || tile.builtWonder) return no('Tile already occupied.');
  if (naturalWonderAt(tile)) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  const p = def.placement;
  if (!wonderTerrainOk(def, tile, map)) return no(`${def.name} cannot stand on this ground.`);

  const around = neighbors(map, tile);
  if (p.adjacentDistrict) {
    const okAdj = around.some(
      (n) =>
        n.district === p.adjacentDistrict &&
        n.districtComplete &&
        (!p.adjacentDistrictBuilding ||
          !!cityAtTile(state, n)?.buildings.includes(p.adjacentDistrictBuilding)),
    );
    if (!okAdj) return no(`Must be adjacent to a completed ${DISTRICTS[p.adjacentDistrict].name}.`);
  }
  if (p.adjacentResource) {
    if (!around.some((n) => n.resource === p.adjacentResource)) {
      return no(`Must be adjacent to ${p.adjacentResource.toLowerCase()}.`);
    }
  }
  if (p.adjacentImprovement) {
    if (!around.some((n) => n.improvement === p.adjacentImprovement)) {
      return no(`Must be adjacent to a ${p.adjacentImprovement.toLowerCase()}.`);
    }
  }
  if (p.adjacentCapital) {
    const cap = citiesOf(state, seat).find((c) => c.isCapital);
    if (!cap || !around.some((n) => n.index === cap.centerIndex)) {
      return no('Must be adjacent to the capital.');
    }
  }
  if (p.requiresReligion && !seatOf(state, seat)?.religion.founded) {
    return no('Must have founded a religion.');
  }
  return ok;
}

export function wonderPlacementTiles(state: GameState, city: City, wonderId: string, seat = city.seat): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (!tileBelongsTo(t, city)) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceWonder(state, city, wonderId, t.index, seat).ok) out.push(t.index);
  }
  return out;
}

export function availableWonders(state: GameState, city: City, seat: number): BuiltWonderDef[] {
  return Object.values(BUILT_WONDERS).filter((def) => {
    if (wonderExists(state, def.id)) return false;
    if (!state.sandbox) {
      if (def.requiresTech && !isTechComplete(state, def.requiresTech, seat)) return false;
      if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) return false;
    }
    return wonderPlacementTiles(state, city, def.id, seat).length > 0;
  });
}
