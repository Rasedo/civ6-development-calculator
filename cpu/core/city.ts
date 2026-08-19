
import { addYields, emptyYields, type City, type GameState, type Tile, type Yields, type YieldKey, type FocusId, type ImprovementId } from './types';
import { tilesWithin, hexDistance } from '../../world/hex';
import { hasFreshWater, isCoastalLand, isImpassable } from '../../world/query';
import { tileYields, cityDistrictYields, cityBuildingYields, regionalEffects, localBuildingAmenities, pillagedDistrictTypes, effectiveAdjacency, completedDistrictCount } from './yields';
import { getModifiers, makeYieldCtx, withFollowerBelief, followerReligionForCity, type Modifiers, type YieldCtx } from './effects';
import { tileAppeal, appealTier } from './appeal';
import { TECHS, ERAS } from '../data/techs'; // wonder/civ era scale
import { CIVICS } from '../data/civics';
/** base tourism every completed wonder pays (real Civ 6). */
export const WONDER_TOURISM_BASE = 2;
import { cityTradeYields } from './trade';
import { hasRiver } from '../../world/query';
import { revealAround } from './fog';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { goldenCulturePerDistrict, goldenDedication } from './eras';
import { SPECIALIST_YIELDS, greatWorkCulture, greatWorkTourism, relicFaith, relicTourism, artifactCulture, artifactTourism, GW_PRINTING_TECH } from '../data/greatPeople';
import { congressGrowthMult, congressGwMult } from './congress';
import { suzerainEffect } from './cityStates';
import { ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE } from '../data/cityStates';
import { warWearinessPenalty, DED_FREE_INQUIRY } from '../data/seats';
import { RESOURCES } from '../../world/resources';
import { CITY_WORK_RADIUS, BORDER_MAX_RADIUS, borderGrowthCost, FOOD_PER_CITIZEN, CITIZEN_SCIENCE, CITIZEN_CULTURE, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, LUXURY_AMENITY_CITIES, REGIONAL_RANGE, growthFoodNeeded, housingGrowthFactor, amenitiesNeeded, amenityTier, type AmenityTier } from '../data/constants';
import { tileSeat, setTileOwner, tileBelongsTo, tileOwnedByCiv, seatOf, citiesOf, tileClaimed } from './seats';
import { wwMax } from './weariness';
import { DED_STEAM } from '../data/seats';

export interface CityStats {
  city: City;
  housing: number;
  amenities: { have: number; needed: number; balance: number; tier: AmenityTier };
  workedTiles: number[];
  breakdown: {
    tiles: Yields;
    districts: Yields;
    buildings: Yields;
    citizens: Yields;
    bonuses: Yields;
    trade: Yields;
  };
  total: Yields;
  foodSurplus: number;
  effectiveFoodSurplus: number;
  growthNeeded: number;
  turnsToGrow: number | null;
  border: {
    cost: number;
    progress: number;
    turns: number | null;
    nextTile: number | null;
  };
  specialistTotal: number;
  maintenance: number;
}

export function buildingMaintenance(id: string): number {
  const def = BUILDINGS[id];
  if (!def || def.cost === 0) return 0;
  // Verified real values override the tier heuristic; worship
  // buildings are maintenance-free in real Civ 6.
  if (def.maintenance !== undefined) return def.maintenance;
  if (def.worship) return 0;
  if (def.district === 'COMMERCIAL_HUB') return 0;
  if (def.cost >= 500) return 3;
  if (def.cost >= 190) return 2;
  return 1;
}

export function districtMaintenance(type: string): number {
  // Real Civ 6 also exempts the Commercial Hub and Harbor.
  return type === 'CITY_CENTER' || type === 'NEIGHBORHOOD' || type === 'AQUEDUCT' ||
    type === 'COMMERCIAL_HUB' || type === 'HARBOR'
    ? 0
    : 1;
}

export function cityMaintenance(state: GameState, city: City): number {
  let total = 0;
  for (const d of city.districts) {
    if (state.map.tiles[d.tileIndex].districtComplete) total += districtMaintenance(d.type);
  }
  for (const b of city.buildings) total += buildingMaintenance(b);
  return total;
}

export function workableTiles(state: GameState, city: City): Tile[] {
  const center = state.map.tiles[city.centerIndex];
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS).filter(
    (t) =>
      tileBelongsTo(t, city) &&
      t.index !== city.centerIndex &&
      !t.district &&
      !t.builtWonder &&
      !isImpassable(t),
  );
}


export function citySpecialistSlots(state: GameState, city: City): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of city.districts) {
    if (!SPECIALIST_YIELDS[d.type]) continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // pillaged district has no working specialists
    const slots = city.buildings.filter((b) => BUILDINGS[b]?.district === d.type).length;
    if (slots > 0) out.set(d.tileIndex, slots);
  }
  return out;
}

export function effectiveSpecialists(state: GameState, city: City): Map<number, number> {
  const slots = citySpecialistSlots(state, city);
  const out = new Map<number, number>();
  let budget = city.population;
  for (const [tileIndex, max] of slots) {
    const wanted = city.specialists[String(tileIndex)] ?? 0;
    const n = Math.max(0, Math.min(wanted, max, budget));
    if (n > 0) {
      out.set(tileIndex, n);
      budget -= n;
    }
  }
  return out;
}

const FOCUS_BASE: Record<YieldKey, number> = {
  food: 2,
  production: 2,
  gold: 1,
  science: 1,
  culture: 1,
  faith: 1,
};

export function tileScore(y: Yields, focus: FocusId): number {
  let score = 0;
  for (const k of Object.keys(FOCUS_BASE) as YieldKey[]) {
    let w = FOCUS_BASE[k];
    if (focus !== 'balanced' && focus === k) w += 3;
    score += y[k] * w;
  }
  return score;
}

export function assignWorkedTiles(
  state: GameState,
  city: City,
  ctx?: YieldCtx,
  workers = city.population,
): number[] {
  const yctx = ctx ?? makeYieldCtx(state, city.seat);
  const candidates = workableTiles(state, city);
  const scored = candidates
    .map((t) => ({ index: t.index, score: tileScore(tileYields(yctx, t), city.focus) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const lockedValid = city.lockedTiles.filter((i) => candidates.some((c) => c.index === i));
  const worked: number[] = lockedValid.slice(0, workers);
  for (const s of scored) {
    if (worked.length >= workers) break;
    if (!worked.includes(s.index)) worked.push(s.index);
  }
  return worked;
}

/** City-center tile yields, floored per Civ 6. */
export function tileYieldsForCenter(ctx: YieldCtx, center: Tile): Yields {
  const y = tileYields(ctx, { ...center, district: null });
  y.food = Math.max(y.food, CITY_CENTER_MIN_FOOD);
  y.production = Math.max(y.production, CITY_CENTER_MIN_PRODUCTION);
  return y;
}

export function computeHousing(state: GameState, city: City, mods?: Modifiers): number {
  const m = mods ?? getModifiers(state, city.seat);
  const map = state.map;
  const center = map.tiles[city.centerIndex];

  const fresh = hasFreshWater(map, center);
  let water = fresh
    ? HOUSING_FRESH_WATER
    : isCoastalLand(map, center)
      ? HOUSING_COASTAL
      : HOUSING_NO_WATER;
  const hasAqueduct = city.districts.some(
    (d) =>
      d.type === 'AQUEDUCT' &&
      map.tiles[d.tileIndex].districtComplete &&
      !map.tiles[d.tileIndex].districtPillaged, // a pillaged Aqueduct gives no housing
  );
  if (hasAqueduct) {
    water = fresh ? water + AQUEDUCT_FRESH_BONUS : Math.max(water, AQUEDUCT_NO_FRESH_TOTAL);
  }

  const pillaged = pillagedDistrictTypes(map, city.districts);
  let total = water;
  for (const d of city.districts) {
    const dt = map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // a pillaged district's housing is dark
    if (d.type === 'NEIGHBORHOOD') {
      total += appealTier(tileAppeal(map, dt)).housing;
    } else {
      total += DISTRICTS[d.type].housing;
    }
  }
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def && pillaged.has(def.district)) continue; // buildings in a pillaged district are dark
    if (def?.housing) total += def.housing;
    const beliefHousing = m.buildingHousingAdd[id];
    if (beliefHousing) total += beliefHousing;
  }
  if (m.riverCity && hasRiver(center)) total += m.riverCity.housing;
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (!tileBelongsTo(t, city) || !t.improvement) continue;
    total += IMPROVEMENTS[t.improvement as ImprovementId].housing;
  }

  total += m.housingAll;
  /* CIV6 (Insulae / Medina Quarter): "+1/+2 Housing in all cities with at
   * least 2/3 specialty districts." */
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.housingIfDistricts) {
    if (specialtyCount >= rule.min) total += rule.housing;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) total += rule.housing;
  }
  return total;
}

export function luxuryAmenities(state: GameState, seat: number): Map<number, number> {
  const cities = citiesOf(state, seat);
  const result = new Map<number, number>();
  for (const c of cities) result.set(c.id, 0);
  if (cities.length === 0) return result;

  const luxuries = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || tileSeat(t) !== seat) continue;
    const def = RESOURCES[t.resource];
    if (def.category === 'luxury' && t.improvement === def.improvement) luxuries.add(t.resource);
  }

  const baseHave = new Map<number, number>();
  for (const c of cities) {
    baseHave.set(c.id, localBuildingAmenities(state, c) + regionalEffects(state, c).amenities);
  }

  for (let i = 0; i < luxuries.size; i++) {
    const ranked = [...cities].sort((a, b) => {
      const needA = amenitiesNeeded(a.population) - (baseHave.get(a.id)! + result.get(a.id)!);
      const needB = amenitiesNeeded(b.population) - (baseHave.get(b.id)! + result.get(b.id)!);
      return needB - needA || a.id - b.id;
    });
    for (const c of ranked.slice(0, LUXURY_AMENITY_CITIES)) {
      result.set(c.id, result.get(c.id)! + 1);
    }
  }
  return result;
}


export function borderCandidates(state: GameState, city: City): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of tilesWithin(state.map, center.col, center.row, BORDER_MAX_RADIUS)) {
    if (tileClaimed(t)) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && tileBelongsTo(n, city),
    );
    if (adjOwn) out.push(t.index);
  }
  return out;
}

export function resourcePriority(tile: Tile): number {
  if (!tile.resource) return 0;
  const cat = RESOURCES[tile.resource].category;
  return cat === 'luxury' ? 3 : cat === 'strategic' ? 2 : 1;
}

/** The tile culture growth would claim next (Civ 6-ish priorities). */
export function pickBorderTile(state: GameState, city: City, ctx?: YieldCtx): number | null {
  const yctx = ctx ?? makeYieldCtx(state, city.seat);
  const center = state.map.tiles[city.centerIndex];
  const candidates = borderCandidates(state, city);
  if (candidates.length === 0) return null;
  const score = (i: number) => {
    const t = state.map.tiles[i];
    const y = tileYields(yctx, t);
    const ySum = y.food + y.production + y.gold + y.science + y.culture + y.faith;
    return {
      dist: hexDistance(center.col, center.row, t.col, t.row),
      res: resourcePriority(t),
      ySum,
      i,
    };
  };
  return candidates
    .map(score)
    .sort((a, b) => a.dist - b.dist || b.res - a.res || b.ySum - a.ySum || a.i - b.i)[0].i;
}

export function acquireTile(state: GameState, city: City, tileIndex: number): void {
  setTileOwner(state.map.tiles[tileIndex], city.seat, city.id);
  city.tilesAcquired += 1;
  revealAround(state, city.seat, tileIndex, 1);
}


/** Catalog position per wonder id — the index the exported `wonders.rows`
 *  table is in, which is the order the GPU folds its per-wonder products in. */
const WONDER_CATALOG_ORDER = new Map(Object.keys(BUILT_WONDERS).map((id, i) => [id, i]));

function completedWonders(state: GameState, city: City) {
  // CATALOG order, not build order. Two callers fold a FLOAT product over this
  // list — `empireGrowthMult` over growthAllMult and `computeCityStats` over
  // cityYieldMult — and the GPU's registry is keyed by wonder index and can
  // only fold ascending, so two multipliers on one channel would otherwise
  // associate differently on the two engines. Build order is not a Civ 6 fact;
  // nothing in the game reads it.
  return city.wonders
    .filter((w) => state.map.tiles[w.tileIndex].builtWonderComplete)
    .map((w) => ({ def: BUILT_WONDERS[w.id], tileIndex: w.tileIndex, idx: WONDER_CATALOG_ORDER.get(w.id) ?? 0 }))
    .filter((w) => w.def)
    .sort((a, b) => a.idx - b.idx);
}

export function empireGrowthMult(state: GameState, seat: number): number {
  // Migration Treaty first, wonders after — the GPU folds in this order.
  let mult = congressGrowthMult(state, seat);
  for (const c of citiesOf(state, seat)) {
    for (const w of completedWonders(state, c)) {
      if (w.def.effects?.growthAllMult) mult *= w.def.effects.growthAllMult;
    }
  }
  return mult;
}

function wonderRegionalAmenities(state: GameState, city: City): number {
  const center = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const c of citiesOf(state, city.seat)) {
    for (const w of completedWonders(state, c)) {
      const amt = w.def.effects?.regionalAmenities;
      if (!amt) continue;
      const t = state.map.tiles[w.tileIndex];
      // Measured from the WONDER TILE, not from the city holding it, on the
      // BASE reach. A Mexico City suzerain extends the DISTRICT regional
      // effects its Civilopedia line names, which a wonder's aura is not.
      if (hexDistance(t.col, t.row, center.col, center.row) <= REGIONAL_RANGE) n += amt;
    }
  }
  return n;
}

/**
 * A civ's ERA INDEX — the highest era among its completed techs
 * and civics (real Civ 6 advances a civ's era with its research). Used only
 * by wonder tourism, which pays "1 for each era you have advanced PAST the
 * era in which that wonder was first available", so wonder era and civ era
 * must be measured on the SAME scale. 0 (Ancient) when nothing is done.
 */
export function civEraIndex(techIds: readonly string[], civicIds: readonly string[]): number {
  let e = 0;
  for (const id of techIds) {
    const i = ERAS.indexOf(TECHS[id]?.era);
    if (i > e) e = i;
  }
  for (const id of civicIds) {
    const i = ERAS.indexOf(CIVICS[id]?.era);
    if (i > e) e = i;
  }
  return e;
}

export function wonderEraIndex(id: string): number {
  const def = BUILT_WONDERS[id];
  if (!def) return 0;
  if (def.requiresTech) return Math.max(0, ERAS.indexOf(TECHS[def.requiresTech]?.era));
  if (def.requiresCivic) return Math.max(0, ERAS.indexOf(CIVICS[def.requiresCivic]?.era));
  return 0;
}

/**
 * The per-turn TOURISM a civ's COMPLETED wonders generate. Real
 * Civ 6: each wonder is worth 2 Tourism plus 1 for every era the owner has
 * advanced past the wonder's own era.
 */
function wonderTourism(state: GameState, era: number, owns: (t: Tile) => boolean): number {
  let t = 0;
  for (const tile of state.map.tiles) {
    if (!tile.builtWonder || !tile.builtWonderComplete || !owns(tile)) continue;
    t += WONDER_TOURISM_BASE + Math.max(0, era - wonderEraIndex(tile.builtWonder));
  }
  return t;
}

function resortTourism(state: GameState, owns: (t: Tile) => boolean): number {
  let t = 0;
  for (const tile of state.map.tiles) {
    if (tile.improvement !== 'SEASIDE_RESORT' || tile.pillaged || !owns(tile)) continue;
    t += Math.max(0, tileAppeal(state.map, tile));
  }
  return t;
}

export function seatTourism(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  let t = 0;
  const printing = s.research.techs.includes(GW_PRINTING_TECH);
  const km = congressGwMult(state);
  for (const c of citiesOf(state, seat)) t += greatWorkTourism(c, printing, km) + relicTourism(c) + artifactTourism(c);
  const owns = (tile: Tile) => tileOwnedByCiv(tile, seat);
  const era = civEraIndex(s.research.techs, s.research.civics);
  return t + resortTourism(state, owns) + wonderTourism(state, era, owns);
}

export function computeCityStats(
  state: GameState,
  city: City,
  luxMap?: Map<number, number>,
  mods?: Modifiers,
): CityStats {
  const base = mods ?? getModifiers(state, city.seat);
  const m = withFollowerBelief(state, base, followerReligionForCity(city.followedReligion, city.seat));
  const ctx: YieldCtx = { map: state.map, mods: m };
  const map = state.map;
  const center = map.tiles[city.centerIndex];
  const wonders = completedWonders(state, city);
  const hasPetra = wonders.some((w) => w.def.effects?.petraDesert);

  const specialists = effectiveSpecialists(state, city);
  let specialistTotal = 0;
  for (const n of specialists.values()) specialistTotal += n;

  const worked = assignWorkedTiles(state, city, ctx, city.population - specialistTotal);
  const tiles = emptyYields();
  addYields(tiles, tileYieldsForCenter(ctx, center));
  const petraBonus = (t: Tile) => {
    if (hasPetra && t.terrain === 'DESERT' && t.feature !== 'FLOODPLAINS' && !t.district) {
      addYields(tiles, { food: 2, gold: 2, production: 1 });
    }
  };
  const hasWaterMill = city.buildings.includes('WATER_MILL');
  const waterMillBonus = (t: Tile) => {
    if (!hasWaterMill || t.improvement !== 'FARM' || !t.resource) return;
    const r = RESOURCES[t.resource];
    if (r?.category === 'bonus' && r.improvement === 'FARM') tiles.food += 1;
  };
  petraBonus(center);
  waterMillBonus(center);
  for (const i of worked) {
    addYields(tiles, tileYields(ctx, map.tiles[i]));
    petraBonus(map.tiles[i]);
    waterMillBonus(map.tiles[i]);
  }

  const districts = cityDistrictYields(ctx, city);
  // CIV6 (GS Civilopedia, Free Inquiry, Golden face): "Commercial Hub and
  // Harbor district's Gold adjacency bonus provides Science as well."
  if (goldenDedication(state, city.seat, DED_FREE_INQUIRY)) {
    for (const d of city.districts) {
      if (d.type !== 'COMMERCIAL_HUB' && d.type !== 'HARBOR') continue;
      const t = map.tiles[d.tileIndex];
      if (!t.districtComplete || t.districtPillaged) continue;
      districts.science += effectiveAdjacency(ctx, t, d.type);
    }
  }
  // CIV6 (Heartbeat of Steam, Golden face): "Campus district's Science
  // adjacency bonus provides Production as well."
  if (goldenDedication(state, city.seat, DED_STEAM)) {
    for (const d of city.districts) {
      if (d.type !== 'CAMPUS') continue;
      const t = map.tiles[d.tileIndex];
      if (!t.districtComplete || t.districtPillaged) continue;
      districts.production += effectiveAdjacency(ctx, t, 'CAMPUS');
    }
  }
  for (const [tileIndex, n] of specialists) {
    const inst = city.districts.find((d) => d.tileIndex === tileIndex);
    const y = inst ? SPECIALIST_YIELDS[inst.type] : undefined;
    if (y) addYields(districts, y, n);
  }
  const buildings = cityBuildingYields(ctx, city);
  const regional = regionalEffects(state, city);
  addYields(buildings, regional.yields);
  for (const w of wonders) {
    if (w.def.cityYields) addYields(buildings, w.def.cityYields);
  }
  if (m.faithPerWonder > 0) buildings.faith += m.faithPerWonder * wonders.length;
  buildings.culture += greatWorkCulture(city);
  buildings.culture += artifactCulture(city); // +3 culture per artifact
  // Golden PEN_BRUSH_AND_VOICE — +1 Culture per SPECIALTY district, from
  // THIS CITY'S OWNER's dedication, which is the row the GPU reads.
  buildings.culture += goldenCulturePerDistrict(state, city.seat) * completedDistrictCount(state, city, true);
  buildings.faith += relicFaith(city);
  // CIV 6, Anshan's suzerain: "+2 Science from each Great Work of Writing.
  // +1 Science from each Relic and Artifact."
  if (suzerainEffect(state, city.seat, 'worksScience')) {
    buildings.science += ANSHAN_WRITING_SCIENCE * (city.greatWorksWriting ?? 0)
      + ANSHAN_RELIC_SCIENCE * ((city.relics ?? 0) + (city.artifacts ?? 0));
  }

  const trade = cityTradeYields(state, city);

  const citizens = emptyYields();
  citizens.science = city.population * CITIZEN_SCIENCE;
  citizens.culture = city.population * CITIZEN_CULTURE;

  const bonuses = emptyYields();
  addYields(bonuses, m.cityYields);
  if (city.isCapital) addYields(bonuses, m.capitalYields);

  const housing = computeHousing(state, city, m);
  let have =
    localBuildingAmenities(state, city) +
    regional.amenities +
    wonderRegionalAmenities(state, city) +
    m.amenitiesAll +
    (m.riverCity && hasRiver(center) ? m.riverCity.amenities : 0) +
    ((luxMap ?? luxuryAmenities(state, city.seat)).get(city.id) ?? 0);
  have -= warWearinessPenalty(wwMax(seatOf(state, city.seat)));
  const specialtyCount = completedDistrictCount(state, city, true);
  for (const rule of m.amenitiesIfSpecialty) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  for (const rule of m.newDeal) {
    if (specialtyCount >= rule.min) have += rule.amenities;
  }
  const needed = amenitiesNeeded(city.population);
  const balance = have - needed;
  const tier = amenityTier(balance);

  const total = emptyYields();
  addYields(total, tiles);
  addYields(total, districts);
  addYields(total, buildings);
  addYields(total, citizens);
  addYields(total, bonuses);
  addYields(total, trade);
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as YieldKey[]) {
    total[k] *= tier.yieldFactor;
  }
  for (const k of Object.keys(m.yieldMult) as YieldKey[]) {
    total[k] *= m.yieldMult[k] ?? 1;
  }
  for (const w of wonders) {
    const mult = w.def.effects?.cityYieldMult;
    if (!mult) continue;
    for (const k of Object.keys(mult) as YieldKey[]) {
      total[k] *= mult[k] ?? 1;
    }
  }
  const maintenance = cityMaintenance(state, city);
  total.gold -= maintenance;

  const foodSurplus = total.food - city.population * FOOD_PER_CITIZEN;
  let effective = foodSurplus;
  if (foodSurplus > 0) {
    effective =
      foodSurplus *
      housingGrowthFactor(housing - city.population) *
      tier.growthFactor *
      empireGrowthMult(state, city.seat) *
      m.growthMult;
  }
  const growthNeeded = growthFoodNeeded(city.population);
  const turnsToGrow = effective > 0 ? Math.ceil((growthNeeded - city.foodBox) / effective) : null;

  const borderCost = Math.round(borderGrowthCost(city.tilesAcquired) * m.borderCostMult);
  const nextTile = pickBorderTile(state, city, ctx);
  const borderTurns =
    nextTile !== null && total.culture > 0
      ? Math.max(0, Math.ceil((borderCost - city.cultureBox) / total.culture))
      : null;

  return {
    city,
    housing,
    amenities: { have, needed, balance, tier },
    workedTiles: worked,
    breakdown: { tiles, districts, buildings, citizens, bonuses, trade },
    total,
    foodSurplus,
    effectiveFoodSurplus: effective,
    growthNeeded,
    turnsToGrow,
    border: { cost: borderCost, progress: city.cultureBox, turns: borderTurns, nextTile },
    specialistTotal,
    maintenance,
  };
}
