
import type { City, GameState, Tile } from './types';
import type { GameMap, ImprovementId } from '../../world/types';
import { IMPROVEMENTS } from '../data/improvements';
import { neighborTile, neighbors, tilesWithin, offsetToAxial, axialToOffset, tileAt } from '../../world/hex';
import { isWater } from '../../world/query';
import { nextRandom } from './rand';
import { seatOf, tileSeat, civOf, leaderOf, civsAtWar } from './seats';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { UNITS } from '../data/units';
import { rowIsFor } from '../data/civilizations';
import { cityAtIndex, unitIsNoncombat } from './units';
import { outerPool } from './rules';
import { pillageBuilding } from './yields';
import { unitsAt } from './units';
import { disbandUnit } from './units';
import { unitDomain } from './units';
import { FLOOD_SEVERITY_P, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn, FLOOD_BLDG_P } from '../data/disasters';
import { FLOOD_CHANCE, ERUPTION_CHANCE_PER_VOLCANO, DROUGHT_CHANCE, DROUGHT_LENGTH } from '../data/disasters';
import { STORM_EVENTS, STORM_FAMILIES, STORM_DISC, STORM_UNIT_ROWS, stormFamilyAt, stormFamilyPair, type StormEvent } from '../data/disasters';
import { disasterRateMult, severitySplit } from '../data/climate';
import { defertilize, desertificationLive, fertilityLive } from './climate';
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
 *  just the improvement — the buildings inside it go dark with it, which is
 *  what a Dam is built to prevent. A city CENTER is never pillaged. */
function pillageDistrict(state: GameState, tile: Tile): void {
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete
      && !tile.districtPillaged && !envImmune(state, tile)) {
    tile.districtPillaged = true;
  }
}

/**
 * CIV6 (RandomEvent_Damages): BUILDING_PILLAGED is a column of its OWN, with
 * its own Percentage — a flood pillages the district at 50 and its buildings
 * at 100, so the two are independent and a building goes dark whether or not
 * the district around it does.
 *
 * READING: the table carries one Percentage per event per damage type and no
 * per-building granularity, so the roll is ONE PER TILE — the same shape this
 * engine already reads the unit and population columns at — and a hit darkens
 * every building of the district standing there.
 */
function pillageTileBuildings(state: GameState, tile: Tile): void {
  // A city CENTRE is never pillaged (`pillageDistrict`'s own rule, and no
  // storm row names CITY_GARRISON or CITY_WALLS), so its buildings stand.
  if (!tile.district || tile.district === 'CITY_CENTER'
      || !tile.districtComplete || envImmune(state, tile)) return;
  const held = cityAtIndex(state, tile.index);
  const city = held?.city ?? cityHoldingDistrict(state, tile);
  if (!city) return;
  for (const id of [...(city.buildings ?? [])]) {
    if (BUILDINGS[id]?.district === tile.district) pillageBuilding(city, id);
  }
}

/** the city whose registry holds the district standing on this tile. */
function cityHoldingDistrict(state: GameState, tile: Tile): City | undefined {
  for (const s of state.seats) {
    for (const c of s.cities) {
      if (c.districts.some((d) => d.tileIndex === tile.index)) return c;
    }
  }
  return undefined;
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

export function floodRiver(state: GameState, start: Tile): Tile[] {
  const rSev = nextRandom(state);
  // A warmed world reaches its worst severities more often.
  const sevP = severitySplit(FLOOD_SEVERITY_P, state.climateIdx ?? -1);
  let sev = 0;
  for (let i = 0, acc = 0; i < sevP.length; i++) {
    acc += sevP[i];
    if (rSev < acc) { sev = i; break; }
    sev = i;
  }
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
    if (rDestroy < FLOOD_DESTROY_P[sev] && tile.improvement && !envImmune(state, tile)) {
      tile.improvement = null;
      tile.pillaged = false;
    }
    if (rDistrict < FLOOD_DISTRICT_P[sev]) pillageDistrict(state, tile);
    if (rBldg < FLOOD_BLDG_P[sev]) pillageTileBuildings(state, tile);
    const dmg = FLOOD_DAMAGE_LO[sev]
      + Math.floor(rDamage * (FLOOD_DAMAGE_HI[sev] - FLOOD_DAMAGE_LO[sev] + 1));
    if (dmg > 0) {
      // A CITY CENTER on the floodplain loses HP and, if it has one, perimeter.
      const held = cityAtIndex(state, tile.index);
      if (held) {
        held.city.hp = Math.max(1, held.city.hp - dmg);
        const outer = outerPool(state, held.city);
        if (outer > 0) held.city.outerHp = Math.max(0, outer - dmg);
      }
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
    if (rPop < FLOOD_POP_P[sev]) {
      const owner = seatOf(state, seat);
      const home = owner?.cities.find((c) => c.id === tile.ownerCity);
      if (home && home.population > 1) home.population -= 1;
    }
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

export function disasterPhase(state: GameState): void {
  const map = state.map;
  // A warming world runs every one of these draws more often.
  const rate = disasterRateMult(state.climateIdx ?? -1);
  const strip = desertificationLive(state);

  for (const t of map.tiles) {
    if (t.droughtTurns > 0) t.droughtTurns -= 1;
    // CIV6: fallout lasts "for 10 turns" / "for 20 turns" from the blast, and
    // a tile is clean again when the timer expires.
    if ((t.falloutTurns ?? 0) > 0) t.falloutTurns = (t.falloutTurns ?? 0) - 1;
  }

  if (nextRandom(state) < FLOOD_CHANCE * rate) {
    const target = pick(state, map.tiles.filter((t) => t.feature === 'FLOODPLAINS'));
    if (target) {
      const reach = floodRiver(state, target);
      log(state, `Flood at (${target.col}, ${target.row}) — ${reach.length} floodplain tiles along the river.`);
    }
  }

  for (const volcano of map.tiles) {
    if (!volcano.volcano) continue;
    if (nextRandom(state) >= ERUPTION_CHANCE_PER_VOLCANO * rate) continue;
    for (const n of neighbors(map, volcano)) {
      scorch(state, n);
      fertilize(state, n);
    }
    log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
  }

  if (nextRandom(state) < DROUGHT_CHANCE * rate) {
    const center = pick(
      state,
      map.tiles.filter(
        (t) => (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT',
      ),
    );
    if (center) {
      for (const t of tilesWithin(map, center.col, center.row, 2)) {
        if (isWater(t)) continue;
        t.droughtTurns = Math.max(t.droughtTurns, DROUGHT_LENGTH);
        if (strip) defertilize(t);
      }
      log(state, `Drought around (${center.col}, ${center.row}) — food suffers for ${DROUGHT_LENGTH} turns.`);
    }
  }

  // THE EIGHT STORMS: one draw per event per turn, in table order. Each
  // family's two severities share the flood's climate ramp — the phase's melt
  // fraction moved from the milder row onto the worse, then every draw scaled.
  const chance = stormChances(state.climateIdx ?? -1, rate);
  for (let e = 0; e < STORM_EVENTS.length; e++) {
    if (nextRandom(state) >= chance[e]) continue;
    const ev = STORM_EVENTS[e];
    const center = pick(state, map.tiles.filter((t) => stormFamilyAt(t) === ev.family));
    // a centre already under a storm takes no second one
    if (!center || (center.stormTurns ?? 0) > 0) continue;
    center.stormEvent = e;
    center.stormTurns = ev.duration;
    log(state, `Storm: ${ev.id} at (${center.col}, ${center.row}) — ${ev.hexes} tiles for ${ev.duration} turns.`);
  }
  // CIV6 (`RandomEvents`, Duration 3): a storm PERSISTS, applying its
  // footprint's effects on the turn it forms and on each turn it lasts. Live
  // storms walk in ascending centre index; `Movement 8` (the storm's walk
  // across the map) is DLL logic nobody can read, and a storm stays put.
  for (const center of map.tiles) {
    if ((center.stormTurns ?? 0) <= 0) continue;
    stormTurn(state, center, STORM_EVENTS[center.stormEvent!], strip);
    center.stormTurns = (center.stormTurns ?? 0) - 1;
    if (center.stormTurns <= 0) center.stormEvent = -1;
  }
}

/** [8] per-turn chances at this climate phase: `severitySplit` over each
 *  family's (severity 1, severity 2) pair, then `disasterRateMult` on all. */
export function stormChances(phase: number, rate: number): number[] {
  const out = STORM_EVENTS.map((ev) => ev.chance);
  for (const fam of STORM_FAMILIES) {
    const [a, b] = stormFamilyPair(fam);
    const sp = severitySplit([STORM_EVENTS[a].chance, STORM_EVENTS[b].chance], phase);
    out[a] = sp[0] * rate;
    out[b] = sp[1] * rate;
  }
  return out;
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
  if (rDestroy < ev.impDest && tile.improvement && !envImmune(state, tile)) {
    tile.improvement = null;
    tile.pillaged = false;
  }
  if (rDistrict < distP) pillageDistrict(state, tile);
  if (rBldgS < ev.bldgPill) pillageTileBuildings(state, tile);
  if (rPop < ev.pop) {
    const home = seatOf(state, owner)?.cities.find((c) => c.id === tile.ownerCity);
    if (home && home.population > 1) home.population -= 1;
  }
  const landHit = rLand < ev.landP;
  const navalHit = rNaval < ev.navalP;
  const landDmg = ev.landLo + Math.floor(rHp * (ev.landHi - ev.landLo + 1));
  const navalDmg = ev.navalLo + Math.floor(rHp * (ev.navalHi - ev.navalLo + 1));
  for (const u of [...unitsAt(state, tile.index)]) {
    const dom = unitDomain(u.type);
    if (dom === 'air' || dom === 'spy') continue;
    if (stormSpares(state, u.seat, ev)) continue;
    if (dom === 'civilian') {
      if (rCivilian < ev.civKill) disbandUnit(state, u.id);
      continue;
    }
    const naval = !!UNITS[u.type]?.naval;
    if (!(naval ? navalHit : landHit)) continue;
    const base = naval ? navalDmg : landDmg;
    const dmg = base + Math.floor(base * stormExtraPct(state, u.seat, owner, ev) / 100);
    u.hp -= dmg;
    if (u.hp <= 0) disbandUnit(state, u.id);
  }
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
