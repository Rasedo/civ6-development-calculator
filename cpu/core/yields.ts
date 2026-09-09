
import { addYields, emptyYields, type GameState, type City, type Tile, type Yields, type DistrictId, type ImprovementId } from './types';
import { citiesOf, civOf, seatOf, tileBelongsTo , civVariantOf } from './seats';
import { neighbors, hexDistance } from '../../world/hex';
import type { FeatureId, GameMap } from '../../world/types';
import { isWater, isMountain, hasRiver, naturalWonderAt, ringFeature, ringTerrain } from '../../world/query';
import { getModifiers, type YieldCtx, type Modifiers } from './effects';
import { TERRAINS, HILLS_YIELDS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { BIOSPHERE_POWER_MULT, IMPROVEMENTS } from '../data/improvements';
import { tileAppeal } from './appeal'; // the Seaside Resort's dynamic gold
import { seatWonderFlag } from './wonders';
import { DISTRICTS, type AdjacencyRule } from '../data/districts';
import { BUILDINGS, POWER_PLANT_IDS, buildingVariantFor, effectiveBuilding } from '../data/buildings';
import { regionalReach, suzerainEffect } from './cityStates';
import { CARDIFF_HARBOR_POWER } from '../data/cityStates';
import { LASER_POWER_LOAD } from '../data/projects';

function terrainYields(tile: Tile): Yields {
  const out = emptyYields();
  addYields(out, TERRAINS[tile.terrain].yields);
  if (tile.elevation === 'HILLS') addYields(out, HILLS_YIELDS);
  return out;
}

/**
 * What a SUZERAIN improvement's neighbours pay it. Each rule counts the
 * neighbours matching any of its sources, divides by `per`, and pays its
 * yields once per whole group; a civic in `ctx.mods.impUpgrades` swaps in the
 * improved rate and payout (`_imp_adjacency`).
 */
export function improvementAdjacency(ctx: YieldCtx, tile: Tile, imp: ImprovementId): Yields {
  const rules = IMPROVEMENTS[imp].adjacency;
  const out = emptyYields();
  if (!rules) return out;
  for (const r of rules) {
    // CIV6 (Terrace_MedievalAdjacency): a rule may WAIT on a civic of its own
    if (r.requiresCivic && !ctx.mods.impUpgrades.has(r.requiresCivic)) continue;
    const up = (!!r.upgradeCivic && ctx.mods.impUpgrades.has(r.upgradeCivic))
      || (!!r.upgradeTech && ctx.mods.impUpgradeTechs.has(r.upgradeTech));
    const per = (up && r.upgradePer) || r.per;
    const pay = (up && r.upgradeYields) || r.yields;
    let n = 0;
    for (const nb of neighbors(ctx.map, tile)) {
      const hit =
        (r.bonusResource && nb.resource !== null && RESOURCES[nb.resource].category === 'bonus') ||
        (r.anyDistrict && nb.district !== null && nb.districtComplete) ||
        (!!r.district && nb.district === r.district && nb.districtComplete) ||
        (!!r.builtWonder && nb.builtWonder !== null && nb.builtWonderComplete) ||
        (!!r.mountain && isMountain(nb)) ||
        (!!r.sameImprovement && nb.improvement === imp && !nb.pillaged) ||
        // a row that names SOMEBODY ELSE's improvement (the Kurgan's Pasture,
        // the Great Wall's own segments)
        (!!r.improvement && nb.improvement === r.improvement && !nb.pillaged) ||
        (!!r.luxuryResource && nb.resource !== null && RESOURCES[nb.resource].category === 'luxury') ||
        (!!r.terrains && r.terrains.includes(nb.terrain)) ||
        (!!r.features && nb.feature !== null && r.features.includes(nb.feature)) ||
        // CIV6 (Fishery_SeaResourceAdjacency, AdjacentSeaResource): a
        // neighbour that is WATER and carries a resource. `ringTerrain`
        // rather than the ground beneath, so a drowned tile counts as the
        // sea it now is.
        (!!r.seaResource && nb.resource !== null && isWater(nb));
      if (hit) n += 1;
    }
    const groups = Math.floor(n / Math.max(1, per));
    if (groups > 0) addYields(out, pay, groups);
  }
  return out;
}

export function tileYields(ctx: YieldCtx, tile: Tile): Yields {
  const out = emptyYields();

  // a tile the sea has taken yields nothing, whatever is recorded under it
  if (tile.submerged) return out;
  const nw = naturalWonderAt(tile);
  if (nw) {
    addYields(out, FEATURES[nw]?.yields ?? {});
    // CIV6 (Grove): "+1 Food and Faith to adjacent unimproved tiles with
    // Charming Appeal. Yields increased ... for adjacent unimproved tiles
    // with Breathtaking Appeal." A natural wonder is unimproved and
    // Breathtaking by construction, so a Preserve's bands pay it on top of
    // its roster row — the one runtime add that reaches this arm.
    const near = ctx.preserve?.get(tile.index);
    if (near) addYields(out, near);
    return out;
  }
  if (isMountain(tile)) {
    // CIV6 (Mit'a): a MOUNTAIN yields nothing to anyone but the roster rows
    // that name it — the plot rows keyed `mountain`, and the Food a Terrace
    // Farm beside it pays (EFFECT_ADJUST_TERRAIN_YIELD_FROM_ADJACENT_IMPROVEMENTS).
    for (const r of ctx.mods.plotYields) {
      if (!r.mountain) continue;
      if (r.improvement !== undefined && (tile.improvement !== r.improvement || tile.pillaged)) continue;
      if (r.anyImprovement && (!tile.improvement || tile.pillaged)) continue;
      out[r.yield] += r.amount;
    }
    for (const r of ctx.mods.terrainAdjYields) {
      if (!r.mountain) continue;
      let n = 0;
      for (const nb of neighbors(ctx.map, tile)) if (nb.improvement === r.improvement && !nb.pillaged) n += 1;
      out[r.yield] += r.amount * n;
    }
    return out;
  }
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

  // CIV6 (EFFECT_ADJUST_PLOT_YIELD): the roster's plot rows — the seat's
  // civilization or leader pays a flat yield where the plot matches.
  for (const r of ctx.mods.plotYields) {
    if (r.terrain !== undefined && tile.terrain !== r.terrain) continue;
    if (r.hills !== undefined && (tile.elevation === 'HILLS') !== r.hills) continue;
    if (r.mountain && tile.elevation !== 'MOUNTAIN') continue;
    if (r.feature !== undefined && tile.feature !== r.feature) continue;
    if (r.improvement !== undefined && (tile.improvement !== r.improvement || tile.pillaged)) continue;
    if (r.anyImprovement && (!tile.improvement || tile.pillaged)) continue;
    out[r.yield] += r.amount;
  }
  // CIV6 (Mit'a, EFFECT_ADJUST_TERRAIN_YIELD_FROM_ADJACENT_IMPROVEMENTS): a
  // MOUNTAIN pays this seat per adjacent Terrace Farm (`TERRAIN_ADJ_YIELD_ROWS`)
  for (const r of ctx.mods.terrainAdjYields) {
    if (r.mountain && !isMountain(tile)) continue;
    let n = 0;
    for (const nb of neighbors(ctx.map, tile)) if (nb.improvement === r.improvement && !nb.pillaged) n += 1;
    out[r.yield] += r.amount * n;
  }
  if (tile.improvement && !tile.pillaged) {
    const imp = tile.improvement as ImprovementId;
    addYields(out, IMPROVEMENTS[imp].yields);
    if (IMPROVEMENTS[imp].riverYields && hasRiver(tile)) addYields(out, IMPROVEMENTS[imp].riverYields!);
    const fy = IMPROVEMENTS[imp].featureYields;
    if (fy && tile.feature !== null && fy.features.includes(tile.feature)) addYields(out, fy.yields);
    // The Seaside Resort's gold IS the tile's appeal (real Civ 6),
    // so it cannot live in the static roster row. Negative appeal pays nothing.
    if (imp === 'SEASIDE_RESORT') out.gold += Math.max(0, tileAppeal(ctx.map, tile, ctx.camps, ctx.gpAppeal));
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
    addYields(out, improvementAdjacency(ctx, tile, imp));
    const idef = IMPROVEMENTS[imp];
    // CIV6 (`YieldFromAppeal` / `YieldFromAppealPercent`): the Chemamull pays
    // 75% of its tile's APPEAL as Culture. Floored, and never negative.
    if (idef.appealYield) {
      const ap = tileAppeal(ctx.map, tile, ctx.camps, ctx.gpAppeal);
      out[idef.appealYield.yield] += Math.floor(Math.max(0, ap) * idef.appealYield.pct / 100);
    }
    // CIV6 (`Improvement_BonusYieldChanges`): "additional yields as you
    // advance through the Technology and Civics Tree".
    for (const r of idef.researchYields ?? []) {
      const has = r.tech !== undefined ? ctx.mods.impUpgradeTechs.has(r.tech)
        : r.civic !== undefined ? ctx.mods.impUpgrades.has(r.civic) : false;
      if (has) addYields(out, r.yields);
    }
    // CIV6 (Mission): what the row pays on a tile whose continent is NOT the
    // seat's capital's.
    // CIV6 (FISHERY_GOVERNOR_PRODUCTION, CITY_PARK_GOVERNOR_CULTURE):
    // what the plot pays while the OWNING CITY's governor still holds the
    // promotion — separate from the build gate, so the improvement stands
    // and this payment stops when the governor leaves.
    if (idef.governorYields && ctx.govPromosAt?.(tile).has(idef.governorYields.promo)) {
      addYields(out, idef.governorYields.yields);
    }
    if (idef.offCapitalContinentYields && ctx.offHomeContinent?.(tile)) {
      addYields(out, idef.offCapitalContinentYields);
    }
    // CIV6 (Open-Air Museum): yields per TERRAIN KIND the seat has founded a
    // city on, counted once each.
    const tk = idef.terrainKindYields;
    if (tk && ctx.foundedTerrains) {
      let kinds = 0;
      for (const t of tk.terrains) if (ctx.foundedTerrains.has(t)) kinds += 1;
      if (kinds) addYields(out, tk.yields, kinds);
    }
  }

  for (const n of neighbors(ctx.map, tile)) {
    const wf = naturalWonderAt(n);
    if (!wf) continue;
    const w = FEATURES[wf];
    if (!w) continue;
    if (w.adjacentYields) addYields(out, w.adjacentYields);
    if (w.doublesAdjacentTerrain) addYields(out, terrainYields(tile));
  }

  if (tile.fertility > 0) out.food += tile.fertility;
  if (tile.fertilityProd > 0) out.production += tile.fertilityProd;
  if (tile.droughtTurns > 0) out.food = Math.max(0, out.food - 1);
  // CIV6 (Grove, Sanctuary): what a PRESERVE's buildings pay the unimproved
  // tiles around them, resolved per tile when the context was built. Past the
  // drought floor, so a drought never eats the Grove's food.
  const near = ctx.preserve?.get(tile.index);
  if (near) addYields(out, near);
  return out;
}

function matchesAdjacency(rule: AdjacencyRule, neighbor: Tile): boolean {
  // CIV6 (Sea Level Rise): a submerged tile "becomes a coastal water tile",
  // so it lends the SEA's sources and none of the ground's — the same reason
  // `submergeTile` drops the resource rather than leaving a drowned Iron seam
  // lending a neighbouring district an adjacency the ground never had.
  const terrain = ringTerrain(neighbor);
  const feature = ringFeature(neighbor);
  switch (rule.source) {
    case 'MOUNTAIN':
      return isMountain(neighbor) && !naturalWonderAt(neighbor);
    case 'RAINFOREST':
      return feature === 'RAINFOREST';
    case 'WOODS':
      return feature === 'WOODS';
    case 'REEF':
      return feature === 'REEF';
    case 'GEOTHERMAL_FISSURE':
      return feature === 'GEOTHERMAL_FISSURE';
    case 'TUNDRA':
      return terrain === 'TUNDRA';
    case 'DESERT':
      return terrain === 'DESERT';
    case 'NATURAL_WONDER':
      return naturalWonderAt(neighbor) !== null;
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
    case 'DAM':
      return neighbor.district === 'DAM' && neighbor.districtComplete;
    case 'CANAL':
      return neighbor.district === 'CANAL' && neighbor.districtComplete;
    case 'GOV_PLAZA':
      return neighbor.district === 'GOVERNMENT_PLAZA' && neighbor.districtComplete;
    // the three district neighbours a UNIQUE district's own row names
    case 'COMMERCIAL_HUB':
      return neighbor.district === 'COMMERCIAL_HUB' && neighbor.districtComplete;
    case 'ENTERTAINMENT_COMPLEX':
      return neighbor.district === 'ENTERTAINMENT_COMPLEX' && neighbor.districtComplete;
    case 'HOLY_SITE_DISTRICT':
      return neighbor.district === 'HOLY_SITE' && neighbor.districtComplete;
    // CIV6 (Hansa): "for each adjacent Resource" — any resource on land
    case 'RESOURCE':
      return !isWater(neighbor) && neighbor.resource !== null;
    case 'SELF':
      return false; // handled separately (it reads no neighbour at all)
    case 'RIVER':
      return false; // handled separately (it's about the tile itself)
  }
}

/**
 * Base adjacency bonus a district of `type` gets (or would get) on `tile`,
 * in the district's adjacency yield. Result floored like Civ 6 (policy
 * multipliers are applied on top of this by the city computation).
 */
export function districtAdjacency(
  map: GameState['map'], tile: Tile, type: DistrictId, extra: readonly AdjacencyRule[] = [],
  own?: readonly AdjacencyRule[],
): number {
  const def = DISTRICTS[type];
  // a UNIQUE district ships its OWN adjacency rows rather than adding to the
  // base row's, so `own` REPLACES the list when the seat carries a variant.
  const rows = own ?? def.adjacency;
  if (!def.adjacencyYield || (rows.length === 0 && extra.length === 0)) return 0;
  let sum = 0;
  const _parts: string[] = [];
  const around = neighbors(map, tile);
  for (const rule of [...rows, ...extra]) {
    let _n = 0;
    if (rule.source === 'RIVER') _n = hasRiver(tile) ? 1 : 0;
    else if (rule.source === 'SELF') _n = 1;
    else for (const n of around) if (matchesAdjacency(rule, n)) _n += 1;
    if (_n) _parts.push(`${rule.source}x${_n}@${rule.amount}`);
  }
  for (const rule of [...rows, ...extra]) {
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    // CIV6 (Seowon): a FLAT bonus that reads no neighbour at all.
    if (rule.source === 'SELF') { sum += rule.amount; continue; }
    for (const n of around) {
      if (matchesAdjacency(rule, n)) sum += rule.amount;
    }
  }
  // the PRE-FLOOR sum, keyed on the tile and the type — the two names both
  // engines share. A floor hides which source differs: 1.5 and 2.0 both look
  // like "one apart" once floored.
  const _dlr = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (_dlr) _dlr.push(`ds:${tile.index}:${type} raw${sum.toFixed(3)}`
    + ` [${_parts.join(',')}]`);
  return Math.floor(sum);
}

export function effectiveAdjacency(ctx: YieldCtx, tile: Tile, type: DistrictId, extra: readonly AdjacencyRule[] = []): number {
  const own = DISTRICTS[type].civVariants?.find((v) => v.civ === ctx.mods.civ)?.adjacency;
  const _base = districtAdjacency(ctx.map, tile, type, [...(ctx.mods.districtAdjacencyAdd?.[type] ?? []), ...extra], own);
  const _mult = ctx.mods.adjacencyMult[type] ?? 1;
  // the FLOORED base and the multiplier apart: TS floors then multiplies, so
  // a disagreement is in one half or the other and never both.
  const _dlb = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (_dlb) _dlb.push(`db:${tile.index}:${type} base${_base} mult${_mult}`
    + ` add${(ctx.mods.districtAdjacencyAdd?.[type] ?? []).length}`
    + ` #civ${ctx.mods.civ} own${own ? own.length : -1}`);
  return _base * _mult;
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

/** the shape every building-holding city answers with — a City, the minor's
 *  city, or a capture's stub */
export type BuildingHolder = {
  buildings: string[];
  districts?: { type: DistrictId; tileIndex: number }[];
  pillagedBuildings?: string[];
};

/** THE one reader of the per-building pillage flag. */
export function buildingPillaged(city: { pillagedBuildings?: string[] }, id: string): boolean {
  return city.pillagedBuildings?.includes(id) ?? false;
}

/** CIV6 (Sabotage Production): "Pillage all buildings in the industrial
 *  zone" — mark a standing building pillaged; nothing happens to one the city
 *  does not hold. */
export function pillageBuilding(city: { buildings?: string[]; pillagedBuildings?: string[] }, id: string): void {
  if (!city.buildings?.includes(id) || buildingPillaged(city, id)) return;
  (city.pillagedBuildings ??= []).push(id);
}

/** the repair — the building's own queue column completing at
 *  PILLAGE_BUILDING_REPAIR_PERCENT of its price clears the mark. */
export function repairBuilding(city: { pillagedBuildings?: string[] }, id: string): void {
  if (!city.pillagedBuildings) return;
  city.pillagedBuildings = city.pillagedBuildings.filter((b) => b !== id);
  if (city.pillagedBuildings.length === 0) delete city.pillagedBuildings;
}

/**
 * The buildings of a city that pay NOTHING: those standing in a COMPLETE-but-
 * PILLAGED district, and those pillaged themselves — the finer read the
 * district flag implies. ONE composer: every "does this building pay"
 * question (yields, housing, amenities, power, loyalty, spy levels,
 * training experience, specialist slots) asks here.
 */
export function darkBuildings(map: GameState['map'], city: BuildingHolder): Set<string> {
  const pillaged = pillagedDistrictTypes(map, city.districts ?? []);
  const out = new Set<string>();
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if ((def && pillaged.has(def.district)) || buildingPillaged(city, id)) out.add(id);
  }
  return out;
}

/** CIV6 (Stave Church): the adjacency rule a civilization's unique building
 *  adds to one district type of its city (EFFECT_FEATURE_ADJACENCY). */
export function buildingVariantAdjacency(civ: string | null, city: City, type: DistrictId): AdjacencyRule[] {
  if (!civ) return [];
  const out: AdjacencyRule[] = [];
  for (const id of city.buildings) {
    const r = BUILDINGS[id]?.civVariants?.find((v) => v.civ === civ)?.districtAdjacency;
    if (r && r.district === type) out.push({ source: r.source, amount: r.amount });
  }
  return out;
}

/** CIV6 (Nan Madol, requirement set PLOT_IS_OR_ADJACENT_TO_COAST): TEST_ANY of "the plot IS
 *  coast" and "the plot is ADJACENT to coast". This engine's LAKE is the
 *  install's COAST, so both arms read SHALLOW water. */
export function onOrNextToShallowWater(map: GameMap, tile: Tile): boolean {
  const shallow = (t: Tile): boolean => t.terrain === 'COAST' || t.terrain === 'LAKE';
  return shallow(tile) || neighbors(map, tile).some(shallow);
}

export function cityDistrictYields(ctx: YieldCtx, city: City): Yields {
  const out = emptyYields();
  const nanMadol = ctx.mods.waterDistrictCulture;
  for (const d of city.districts) {
    const tile = ctx.map.tiles[d.tileIndex];
    if (!tile.districtComplete || tile.districtPillaged) continue; // pillaged = dark
    const def = DISTRICTS[d.type];
    const cityStateAdd = ctx.mods.districtYieldAdd[d.type];
    if (cityStateAdd) addYields(out, cityStateAdd);
    // CIV6 (M'banza, `MODIFIER_PLAYER_DISTRICT_ADJUST_BASE_YIELD_CHANGE`): a
    // unique district's own flat yields, on top of whatever it takes from its
    // neighbours.
    const flat = DISTRICTS[d.type].civVariants?.find((v) => v.civ === ctx.mods.civ)?.flatYield;
    if (flat) addYields(out, { ...emptyYields(), ...flat });
    // CIV6 (Nan Madol): "+2 Culture" from every district on or next to water
    if (nanMadol && onOrNextToShallowWater(ctx.map, tile)) out.culture += nanMadol;
    if (def.adjacencyYield) {
      const adj = effectiveAdjacency(ctx, tile, d.type, buildingVariantAdjacency(ctx.mods.civ, city, d.type));
      out[def.adjacencyYield] += adj;
      // the district's OWN adjacency yield, per CITY and per district —
      // city, catalog row and tile all named at once, which is what the
      // type-only helper could not do.
      const _dlj = (globalThis as { __diffLog?: string[] }).__diffLog;
      if (_dlj) _dlj.push(`dj:${city.seat}:${city.centerIndex}:${d.type}`
        + ` tile${d.tileIndex} adj${adj} y${def.adjacencyYield}`);
      if (d.type === 'HOLY_SITE' && ctx.mods.workEthic) out.production += adj;
    }
  }
  return out;
}

/** CIV6 (EFFECT_ADJUST_CITY_YIELD_FROM_POWERED_BUILDING): "Buildings that
 *  provide additional yields when Powered receive +4 of that yield" — the
 *  roster's rows, on each yield the building's powered half pays. */
export function poweredExtra(mods: Modifiers, poweredYields: Partial<Yields>): Partial<Yields> {
  const out: Partial<Yields> = {};
  for (const k of Object.keys(poweredYields) as (keyof Yields)[]) {
    if ((poweredYields[k] ?? 0) !== 0 && mods.poweredYieldAdd[k]) out[k] = mods.poweredYieldAdd[k];
  }
  return out;
}

export function cityBuildingYields(ctx: YieldCtx, city: City, powered = false): Yields {
  const out = emptyYields();
  const pillaged = pillagedDistrictTypes(ctx.map, city.districts);
  const dark = darkBuildings(ctx.map, city);
  for (const id of city.buildings) {
    // the row this SEAT builds — a unique building's own yields, Power and
    // regional reach all arrive through `effectiveBuilding`
    const def = effectiveBuilding(ctx.mods.civ, id);
    if (!def) continue;
    if (def.regional) continue; // handled by regional scan (affects own city too)
    if (dark.has(id)) continue; // in a pillaged district, or pillaged itself
    if (def.yields) addYields(out, def.yields);
    if (powered && def.poweredYields) {
      addYields(out, def.poweredYields);
      addYields(out, poweredExtra(ctx.mods, def.poweredYields));
    }
    if (def.special === 'COAL_PLANT') {
      const iz = city.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
      if (iz && ctx.map.tiles[iz.tileIndex].districtComplete) {
        out.production += effectiveAdjacency(ctx, ctx.map.tiles[iz.tileIndex], 'INDUSTRIAL_ZONE');
      }
    }
    const beliefAdd = ctx.mods.buildingYieldAdd[id];
    if (beliefAdd) addYields(out, beliefAdd);
    const bv = buildingVariantFor(ctx.mods.civ, id);
    // CIV6 (Tsikhe, TSIKHE_FAITH_GOLDEN_AGE): a unique row may pay again
    // while its seat stands in a Golden (or Heroic) Age.
    if (bv?.goldenAgeYields && ctx.mods.goldenAge) addYields(out, bv.goldenAgeYields);
    // CIV6 (Madrasa, OldYieldType SCIENCE -> NewYieldType FAITH): the row
    // pays FAITH equal to its own district's adjacency, the same shape the
    // Coal Plant and the Shipyard read Production off theirs.
    if (bv?.districtAdjacencyAsFaith) {
      const d = city.districts.find((x) => x.type === def.district);
      if (d && ctx.map.tiles[d.tileIndex].districtComplete) {
        out.faith += effectiveAdjacency(ctx, ctx.map.tiles[d.tileIndex], def.district);
      }
    }
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
      const def = effectiveBuilding(ctx.mods.civ, id);
      if (!def || def.regional || def.district !== b.district || dark.has(id)) continue;
      base += def.yields?.[b.yield] ?? 0;
    }
    out[b.yield] += base * pct;
  }
  return out;
}

/** The DISTINCT resources of one category this city has IMPROVED — the tile
 *  is inside its borders, unpillaged, and carries the resource's own
 *  improvement. What the Grand Bazaar's two clauses count. */
export function cityImprovedResourceKinds(
  state: GameState, city: City, category: 'luxury' | 'strategic',
): Set<string> {
  const out = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || t.pillaged || !tileBelongsTo(t, city)) continue;
    const def = RESOURCES[t.resource];
    if (def?.category === category && t.improvement === def.improvement) out.add(t.resource);
  }
  return out;
}

/** CIV6 (REQUIREMENT_CITY_HAS_X_FEATURE_TYPE): does this city's BORDER hold
 *  at least one tile carrying the feature? */
export function cityHasFeature(state: GameState, city: City, feature: FeatureId): boolean {
  return state.map.tiles.some((t) => tileBelongsTo(t, city) && t.feature === feature);
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
  const dark = darkBuildings(state.map, city);
  let demand = LASER_POWER_LOAD * (city.laserStations ?? 0);
  const _civ = civOf(state, city.seat);
  for (const id of city.buildings) {
    const def = effectiveBuilding(_civ, id);
    if (!def?.power || dark.has(id)) continue;
    demand += def.power;
  }
  let supply = 0;
  // CIV6 (Hydroelectric Dam): "Provides 6 Power to the city from renewable
  // water sources" — a supply with no stockpile behind it, which is why
  // `resolveSeatPower` asks a plant only for the shortfall.
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def?.powerSupply && !dark.has(id)) supply += def.powerSupply;
  }
  // CIV6 (Solar Farm, Wind Farm): a renewable generator "provides Power to
  // its city" — the one that owns its plot — from a source no stockpile
  // stands behind, so it counts here beside the Dam and not with the plants.
  for (const tile of state.map.tiles) {
    if (!tileBelongsTo(tile, city) || tile.pillaged || !tile.improvement) continue;
    supply += IMPROVEMENTS[tile.improvement as ImprovementId]?.power ?? 0;
  }
  // CIV6 (Biosphere): the wonder names no city, so every renewable this seat
  // holds pays triple — Cardiff's Harbor power is not on its list and is
  // added after.
  if (seatWonderFlag(state, city.seat, 'renewablePowerBoost')) supply *= BIOSPHERE_POWER_MULT;
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

/** `allIndustry` is Vertical Integration, passed in because the governor read
 *  lives a module above this one. */
export function regionalEffects(
  state: GameState, city: City, allIndustry = false,
): RegionalEffects {
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
        const def = effectiveBuilding(civOf(state, city.seat), id);
        if (!def || !def.regional || def.district !== inst.type) continue;
        if (hexDistance(tile.col, tile.row, center.col, center.row) > (def.regionalRange ?? reach)) continue;
        // CIV6 (Vertical Integration): "This city receives Production from any
        // number of Industrial Zones within 6 tiles, not just the first." The
        // promotion names ONE district, so no other regional line stacks.
        const every = allIndustry && def.district === 'INDUSTRIAL_ZONE';
        if (every || !seen.has(id)) {
          seen.add(id);
          if (def.yields) addYields(out.yields, def.yields);
          if (def.amenities) out.amenities += def.amenities;
        }
        if ((!def.poweredYields && !def.poweredAmenities) || (!every && seenPowered.has(id))) continue;
        if (!other.powered) continue;
        seenPowered.add(id);
        if (def.poweredYields) {
          addYields(out.yields, def.poweredYields);
          addYields(out.yields, poweredExtra(getModifiers(state, city.seat), def.poweredYields));
        }
        out.amenities += def.poweredAmenities ?? 0;
      }
    }
  }
  return out;
}

/** The amenities a city earns AT HOME: its own complete districts, then its
 *  own non-regional buildings. A pillaged district darkens both. */
/** Sum one numeric DistrictDef field over a city's complete, unpillaged
 *  districts — the district-side twin of `seatBuildingSum`. */
export function cityDistrictSum(
  state: GameState,
  city: City,
  key: 'loyalty' | 'governorTitle' | 'amenities',
): number {
  let n = 0;
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (!t.districtComplete || t.districtPillaged) continue;
    n += DISTRICTS[d.type][key] ?? 0;
    // The Aqueduct's Geothermal Fissure — an AMENITY the district pays per
    // adjacent tile, which no yield channel carries.
    const near = key === 'amenities' ? DISTRICTS[d.type].amenityAdjacent : undefined;
    if (near) {
      for (const nb of neighbors(state.map, t)) if (matchesAdjacency(near, nb)) n += near.amount;
    }
  }
  return n;
}

export function localAmenities(state: GameState, city: City): number {
  const dark = darkBuildings(state.map, city);
  let n = cityDistrictSum(state, city, 'amenities');
  // CIV6 (Bath): the unique district's own flat Amenity, in the base the
  // luxury ranking sorts on — where the Aqueduct's own would sit.
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (!t.districtComplete || t.districtPillaged) continue;
    n += civVariantOf(state, city.seat, DISTRICTS[d.type].civVariants)?.amenities ?? 0;
  }
  const civA = civOf(state, city.seat);
  // THE VARIANT AMENITY CLAUSES pay the city that HOLDS the row, whether or
  // not that row is regional: the Thermal Bath's "+2 additional Amenities if
  // there is at least one Geothermal Fissure in this city's borders" names
  // THIS city, and the Zoo it replaces is regional — reading them inside the
  // non-regional walk below meant neither ever paid anybody.
  for (const id of city.buildings) {
    if (dark.has(id)) continue;
    const bv = buildingVariantFor(civA, id);
    if (!bv) continue;
    // CIV6 (Thermal Bath, THERMALBATH_ADDAMENITIES): more while its city's
    // border holds a tile of one feature.
    const awf = bv.amenitiesWithFeature;
    if (awf && cityHasFeature(state, city, awf.feature)) n += awf.amount;
    // CIV6 (Grand Bazaar, GRANDBAZAAR_AMENITIES_LUXURIES Amount 1): "Receive
    // 1 Amenity for every Luxury resource this city has improved" — the
    // DISTINCT kinds inside its own borders, so a second copy pays nothing.
    if (bv.amenityPerLuxuryType) {
      n += bv.amenityPerLuxuryType * cityImprovedResourceKinds(state, city, 'luxury').size;
    }
  }
  for (const id of city.buildings) {
    const def = effectiveBuilding(civA, id);
    if (!def || def.regional) continue;
    if (dark.has(id)) continue; // a pillaged district's amenities go dark, and a pillaged building's
    n += def.amenities ?? 0;
    // CIV6 (Thermal Bath, THERMALBATH_ADDAMENITIES): a unique building may
    // pay MORE while its city holds a tile of one feature.
    // CIV6 (Kupe's Voyage): "The Palace receives ... +1 Amenity"
    if (def.autoCapital) for (const r of getModifiers(state, city.seat).capital) n += r.palaceAmenities ?? 0;
    if (def.poweredAmenities && city.powered) n += def.poweredAmenities;
  }
  return n;
}
