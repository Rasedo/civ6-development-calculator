
import { addYields, emptyYields, type GameState, type City, type Tile, type Yields, type DistrictId, type ImprovementId } from './types';
import { citiesOf, seatOf } from './seats';
import { neighbors, hexDistance } from '../../world/hex';
import { isWater, isMountain, hasRiver } from '../../world/query';
import type { YieldCtx } from './effects';
import { TERRAINS, HILLS_YIELDS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { tileAppeal } from './appeal'; // the Seaside Resort's dynamic gold
import { WONDERS } from '../../world/wonders';
import { DISTRICTS, type AdjacencyRule } from '../data/districts';
import { BUILDINGS, POWER_PLANT_IDS } from '../data/buildings';
import { regionalReach, suzerainEffect } from './cityStates';
import { CARDIFF_HARBOR_POWER } from '../data/cityStates';
import { LASER_POWER_LOAD } from '../data/projects';

function terrainYields(tile: Tile): Yields {
  const out = emptyYields();
  addYields(out, TERRAINS[tile.terrain].yields);
  if (tile.elevation === 'HILLS') addYields(out, HILLS_YIELDS);
  return out;
}

export function tileYields(ctx: YieldCtx, tile: Tile): Yields {
  const out = emptyYields();

  if (tile.wonder) {
    addYields(out, WONDERS[tile.wonder]?.tileYields ?? {});
    return out;
  }
  if (isMountain(tile)) return out;
  if (tile.district || tile.builtWonder) return out; // paved tiles don't produce tile yields

  addYields(out, terrainYields(tile));
  if (tile.feature) {
    const f = FEATURES[tile.feature];
    if (f.impassable) return emptyYields();
    addYields(out, f.yields);
    const beliefBonus = ctx.mods.featureYields[tile.feature];
    if (beliefBonus) addYields(out, beliefBonus);
  }
  if (tile.resource) addYields(out, RESOURCES[tile.resource].yields);

  if (tile.improvement && !tile.pillaged) {
    const imp = tile.improvement as ImprovementId;
    addYields(out, IMPROVEMENTS[imp].yields);
    // The Seaside Resort's gold IS the tile's appeal (real Civ 6),
    // so it cannot live in the static roster row. Negative appeal pays nothing.
    if (imp === 'SEASIDE_RESORT') out.gold += Math.max(0, tileAppeal(ctx.map, tile, ctx.camps));
    const boost = ctx.mods.improvementYields[imp];
    if (boost) addYields(out, boost);
    if (tile.resource) {
      const cat = RESOURCES[tile.resource].category;
      for (const rule of ctx.mods.improvementOnResource) {
        if (rule.category === cat) addYields(out, rule.yields);
      }
    }
    if (imp === 'FARM' && ctx.mods.farmAdjTier > 0) {
      const adjFarms = neighbors(ctx.map, tile).filter((n) => n.improvement === 'FARM').length;
      if (adjFarms >= 2) out.food += ctx.mods.farmAdjTier;
    }
  }

  for (const n of neighbors(ctx.map, tile)) {
    if (!n.wonder) continue;
    const w = WONDERS[n.wonder];
    if (!w) continue;
    if (w.adjacentYields) addYields(out, w.adjacentYields);
    if (w.doublesAdjacentTerrain) addYields(out, terrainYields(tile));
  }

  if (tile.fertility > 0) out.food += tile.fertility;
  if (tile.fertilityProd > 0) out.production += tile.fertilityProd;
  if (tile.droughtTurns > 0) out.food = Math.max(0, out.food - 1);
  return out;
}

function matchesAdjacency(rule: AdjacencyRule, neighbor: Tile): boolean {
  switch (rule.source) {
    case 'MOUNTAIN':
      return isMountain(neighbor) && !neighbor.wonder;
    case 'RAINFOREST':
      return neighbor.feature === 'RAINFOREST';
    case 'WOODS':
      return neighbor.feature === 'WOODS';
    case 'REEF':
      return neighbor.feature === 'REEF';
    case 'NATURAL_WONDER':
      return neighbor.wonder !== null;
    case 'BUILT_WONDER':
      return neighbor.builtWonder !== null && neighbor.builtWonderComplete;
    case 'DISTRICT':
      return neighbor.district !== null && neighbor.districtComplete;
    case 'CITY_CENTER':
      return neighbor.district === 'CITY_CENTER' && neighbor.districtComplete;
    case 'HARBOR_DISTRICT':
      return neighbor.district === 'HARBOR' && neighbor.districtComplete;
    case 'SEA_RESOURCE':
      return isWater(neighbor) && neighbor.resource !== null;
    case 'MINE':
      return neighbor.improvement === 'MINE';
    case 'QUARRY':
      return neighbor.improvement === 'QUARRY';
    case 'AQUEDUCT':
      return neighbor.district === 'AQUEDUCT' && neighbor.districtComplete;
    case 'RIVER':
      return false; // handled separately (it's about the tile itself)
  }
}

/**
 * Base adjacency bonus a district of `type` gets (or would get) on `tile`,
 * in the district's adjacency yield. Result floored like Civ 6 (policy
 * multipliers are applied on top of this by the city computation).
 */
export function districtAdjacency(map: GameState['map'], tile: Tile, type: DistrictId): number {
  const def = DISTRICTS[type];
  if (!def.adjacencyYield || def.adjacency.length === 0) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    for (const n of around) {
      if (matchesAdjacency(rule, n)) sum += rule.amount;
    }
  }
  return Math.floor(sum);
}

export function effectiveAdjacency(ctx: YieldCtx, tile: Tile, type: DistrictId): number {
  return districtAdjacency(ctx.map, tile, type) * (ctx.mods.adjacencyMult[type] ?? 1);
}

/**
 * District types this city holds COMPLETE-but-PILLAGED. Their
 * adjacency yields and their buildings' yields/housing/amenities/GPP go dark
 * until repaired (real Civ 6). One-per-type, so a type→pillaged set suffices.
 */
export function pillagedDistrictTypes(
  map: GameState['map'],
  districts: { type: DistrictId; tileIndex: number }[],
): Set<DistrictId> {
  const out = new Set<DistrictId>();
  for (const d of districts) {
    const t = map.tiles[d.tileIndex];
    if (t.districtComplete && t.districtPillaged) out.add(d.type);
  }
  return out;
}

export function cityDistrictYields(ctx: YieldCtx, city: City): Yields {
  const out = emptyYields();
  for (const d of city.districts) {
    const tile = ctx.map.tiles[d.tileIndex];
    if (!tile.districtComplete || tile.districtPillaged) continue; // pillaged = dark
    const def = DISTRICTS[d.type];
    const cityStateAdd = ctx.mods.districtYieldAdd[d.type];
    if (cityStateAdd) addYields(out, cityStateAdd);
    if (def.adjacencyYield) {
      const adj = effectiveAdjacency(ctx, tile, d.type);
      out[def.adjacencyYield] += adj;
      if (d.type === 'HOLY_SITE' && ctx.mods.workEthic) out.production += adj;
    }
  }
  return out;
}

export function cityBuildingYields(ctx: YieldCtx, city: City, powered = false): Yields {
  const out = emptyYields();
  const pillaged = pillagedDistrictTypes(ctx.map, city.districts);
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def) continue;
    if (def.regional) continue; // handled by regional scan (affects own city too)
    if (pillaged.has(def.district)) continue; // buildings in a pillaged district are dark
    if (def.yields) addYields(out, def.yields);
    if (powered && def.poweredYields) addYields(out, def.poweredYields);
    if (def.special === 'COAL_PLANT') {
      const iz = city.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
      if (iz && ctx.map.tiles[iz.tileIndex].districtComplete) {
        out.production += effectiveAdjacency(ctx, ctx.map.tiles[iz.tileIndex], 'INDUSTRIAL_ZONE');
      }
    }
    const beliefAdd = ctx.mods.buildingYieldAdd[id];
    if (beliefAdd) addYields(out, beliefAdd);
    if (def.special === 'SHIPYARD') {
      const harbor = city.districts.find((d) => d.type === 'HARBOR');
      if (harbor && ctx.map.tiles[harbor.tileIndex].districtComplete) {
        out.production += effectiveAdjacency(ctx, ctx.map.tiles[harbor.tileIndex], 'HARBOR');
      }
    }
  }
  for (const b of ctx.mods.buildingYieldBoosts) {
    if (pillaged.has(b.district)) continue;
    const d = city.districts.find((x) => x.type === b.district);
    if (!d || !ctx.map.tiles[d.tileIndex].districtComplete) continue;
    let pct = b.pct;
    if (city.population >= b.popMin) pct += b.popPct;
    // The adjacency the district ACTUALLY pays — a card that doubles it can
    // push the district over this card's own threshold, which is what the
    // player sees on the district.
    if (effectiveAdjacency(ctx, ctx.map.tiles[d.tileIndex], b.district) >= b.adjMin) pct += b.adjPct;
    let base = 0;
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (!def || def.regional || def.district !== b.district) continue;
      base += def.yields?.[b.yield] ?? 0;
    }
    out[b.yield] += base * pct;
  }
  return out;
}

export interface CityPower {
  demand: number;
  supply: number;
  /** The power-plant building ids whose Industrial Zone reaches this centre,
   *  in catalog order — what `resolveSeatPower` picks a fuel from. */
  plants: string[];
}

/**
 * CIV6 (Power): a city's BASE LOAD is what its standing buildings demand, and
 * it is met all at once or not at all — "a city cannot supply Power to some
 * buildings and not to others - if its total Power requirement is not met,
 * then no buildings in it will be powered".
 *
 * Two supplies. A POWER PLANT "will attempt to provide required Power to all
 * cities within range ... The Power range always counts from the District
 * that generates Power to the City Center", which is the same reach a
 * regional building has (a Mexico City suzerain widens both). The RENEWABLE
 * half "provide[s] Power only for their respective city"; the one this engine
 * carries is Cardiff's, "+2 Power for every Harbor building".
 *
 * This is the fuel-free half: what the city ASKS and what its own renewables
 * answer, plus which plants could cover the rest. `resolveSeatPower` decides,
 * once a turn, which of those the stockpile can actually run.
 */
export function cityPower(state: GameState, city: City): CityPower {
  const pillaged = pillagedDistrictTypes(state.map, city.districts);
  let demand = LASER_POWER_LOAD * (city.laserStations ?? 0);
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def?.power || pillaged.has(def.district)) continue;
    demand += def.power;
  }
  let supply = 0;
  if (!pillaged.has('HARBOR') && suzerainEffect(state, city.seat, 'harborPower')) {
    for (const id of city.buildings) {
      if (BUILDINGS[id]?.district === 'HARBOR') supply += CARDIFF_HARBOR_POWER;
    }
  }
  const center = state.map.tiles[city.centerIndex];
  const reach = regionalReach(state, city.seat);
  // CATALOG order, so `resolveSeatPower`'s "largest stockpile wins" tie-break
  // reads the same list the GPU builds.
  const plants: string[] = [];
  for (const id of POWER_PLANT_IDS) {
    for (const other of citiesOf(state, city.seat)) {
      if (!other.buildings.includes(id)) continue;
      const inst = other.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
      if (!inst) continue;
      const tile = state.map.tiles[inst.tileIndex];
      if (!tile.districtComplete || tile.districtPillaged) continue;
      if (hexDistance(tile.col, tile.row, center.col, center.row) > reach) continue;
      plants.push(id);
      break;
    }
  }
  return { demand, supply, plants };
}

/** The craft's speed above its base 1 LY/turn: every orbital station this
 *  seat has launched, plus the terrestrial ones standing in POWERED cities. */
export function laserSpeed(state: GameState, seat: number): number {
  let n = seatOf(state, seat)?.orbitalLasers ?? 0;
  for (const city of citiesOf(state, seat)) {
    if (city.laserStations && city.powered) n += city.laserStations;
  }
  return n;
}

export interface RegionalEffects {
  yields: Yields;
  amenities: number;
}

/** Districts this city has FINISHED — `specialtyOnly` drops the centre and
 *  anything outside the specialty cap. */
export function completedDistrictCount(state: GameState, city: City, specialtyOnly: boolean): number {
  return city.districts.filter((d) => {
    if (d.type === 'CITY_CENTER') return false;
    if (!state.map.tiles[d.tileIndex].districtComplete) return false;
    return specialtyOnly ? DISTRICTS[d.type].countsTowardLimit : true;
  }).length;
}

export function regionalEffects(state: GameState, city: City): RegionalEffects {
  const center = state.map.tiles[city.centerIndex];
  const reach = regionalReach(state, city.seat); // a Mexico City suzerain reaches 3 farther
  const seen = new Set<string>();
  // CIV6: "multiple Factories within the 6-tile range will all draw Power
  // without providing extra Production bonus" — the id pays once. Its POWERED
  // half is a second, independent once: any in-range source city that is
  // POWERED pays it, whether or not the source that paid the base was.
  const seenPowered = new Set<string>();
  const out: RegionalEffects = { yields: emptyYields(), amenities: 0 };
  for (const other of citiesOf(state, city.seat)) {
    for (const inst of other.districts) {
      const tile = state.map.tiles[inst.tileIndex];
      if (!tile.districtComplete || tile.districtPillaged) continue; // pillaged source is dark
      for (const id of other.buildings) {
        const def = BUILDINGS[id];
        if (!def || !def.regional || def.district !== inst.type) continue;
        if (hexDistance(tile.col, tile.row, center.col, center.row) > reach) continue;
        if (!seen.has(id)) {
          seen.add(id);
          if (def.yields) addYields(out.yields, def.yields);
          if (def.amenities) out.amenities += def.amenities;
        }
        if ((!def.poweredYields && !def.poweredAmenities) || seenPowered.has(id)) continue;
        if (!other.powered) continue;
        seenPowered.add(id);
        if (def.poweredYields) addYields(out.yields, def.poweredYields);
        out.amenities += def.poweredAmenities ?? 0;
      }
    }
  }
  return out;
}

export function localBuildingAmenities(state: GameState, city: City): number {
  const pillaged = pillagedDistrictTypes(state.map, city.districts);
  let n = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || def.regional) continue;
    if (pillaged.has(def.district)) continue; // pillaged district's amenities go dark
    n += def.amenities ?? 0;
    if (def.poweredAmenities && city.powered) n += def.poweredAmenities;
  }
  return n;
}
