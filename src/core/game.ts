/**
 * Game state lifecycle: creation, player actions (found city, improve,
 * place districts/buildings, buy tiles, pick research, run government),
 * the end-of-turn loop, and serialization.
 */

import type { City, DistrictId, GameState, GreatPersonClass, ImprovementId, MapGenOptions, QueueItem, Tile } from './types';
import { generateMap } from './mapgen';
import { tilesWithin } from './hex';
import { computeCityStats, luxuryAmenities, borderCandidates, pickBorderTile, acquireTile, citySpecialistSlots } from './city';
import { canFoundCity, canPlaceDistrict, canPlaceWonder, validImprovements, canRemoveFeature, availableBuildings, buildingCompletable, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, availableTechs, availableCivics, governmentSlots } from './effects';
import { detectBoosts } from './boosts';
import { spawnUnit, refreshUnits, unitMaintenance, trainableUnits } from './units';
import { barbarianPhase } from './combat';
import { revealAround } from './fog';
import { disasterPhase } from './disasters';
import { UNITS } from '../data/units';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { GP_CLASSES, GP_CLASS_DISTRICT, GREAT_PEOPLE, gpCost } from '../data/greatPeople';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { BOOST_FRACTION } from '../data/boosts';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, WORSHIP_BUILDINGS, RELIGION_NAMES, PANTHEON_FAITH_COST } from '../data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION, type ProjectDef } from '../data/projects';
import { CITY_NAMES, borderGrowthCost, TILE_PURCHASE_GOLD_PER_CULTURE, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT } from '../data/constants';
import { applyLumpYield } from './economy';

/** Eureka/inspiration discount applied to a research cost. */
export function effectiveResearchCost(state: GameState, id: string, baseCost: number): number {
  return state.research.boosted.includes(id)
    ? Math.round(baseCost * (1 - BOOST_FRACTION))
    : baseCost;
}

/**
 * Districts get pricier as the game advances (Civ 6 scales with overall
 * research progress). Cost is locked in when the district is queued.
 */
export function districtCost(state: GameState): number {
  const total = Object.keys(TECHS).length + Object.keys(CIVICS).length;
  const done = state.research.techs.length + state.research.civics.length;
  return Math.round(54 * (1 + 8 * (done / total)));
}

export function createGame(
  opts: MapGenOptions & { sandbox?: boolean; unitsMode?: boolean },
): GameState {
  return createGameFromMap(generateMap(opts), opts.sandbox ?? false, opts.unitsMode ?? false);
}

/** Fresh game state around an existing map (e.g. one imported from Civ 6). */
export function createGameFromMap(map: GameState['map'], sandbox = false, unitsMode = false): GameState {
  return {
    map,
    cities: [],
    nextCityId: 0,
    turn: 1,
    sandbox,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faithTotal: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    government: { current: null, policies: [] },
    greatPeople: { points: {}, earned: [] },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null },
    tradeRoutes: [],
    settlers: 0,
    plannedSettles: [],
    unitsMode,
    units: [],
    nextUnitId: 0,
    rngState: (map.seed ^ 0x9e3779b9) >>> 0,
    barbCamps: [],
    cityHp: {},
    disasters: false,
    fogOfWar: false,
    explored: [],
    eventLog: [],
  };
}

/** Civ 6-ish settler cost, rising with every city, trained settler and queued one. */
export function settlerCost(state: GameState): number {
  const queued = state.cities.reduce(
    (n, c) => n + c.queue.filter((q) => q.kind === 'settler').length,
    0,
  );
  return 80 + 30 * Math.max(0, state.cities.length - 1 + state.settlers + queued);
}

/** Train a settler in a city (no district requirement). Sandbox founds free anyway. */
export function queueSettler(state: GameState, cityId: number): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  city.queue.push({ kind: 'settler', progress: 0, cost: settlerCost(state) });
  return { ok: true };
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function foundCity(state: GameState, tileIndex: number): RuleResult & { city?: City } {
  const check = canFoundCity(state, tileIndex);
  if (!check.ok) return check;

  // The first city uses your starting settler; later ones must be trained
  // (unless sandbox). canFoundCity stays tile-only so advisors keep working.
  if (!state.sandbox && state.cities.length > 0) {
    if (state.settlers <= 0) {
      return { ok: false, reason: 'No settler available — train one in a city.' };
    }
    state.settlers -= 1;
  }

  const tile = state.map.tiles[tileIndex];
  const id = state.nextCityId++;
  const city: City = {
    id,
    name: cityName(id),
    centerIndex: tileIndex,
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: state.cities.length === 0,
    buildings: state.cities.length === 0 ? ['PALACE'] : [],
    districts: [{ type: 'CITY_CENTER', tileIndex }],
    wonders: [],
    specialists: {},
  };

  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;

  // Civ 6: a new city starts with its center plus the first ring only;
  // everything beyond comes from culture growth or tile purchase.
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (t.cityId === -1) t.cityId = id;
  }
  tile.cityId = id;
  revealAround(state, tileIndex, 3);

  state.cities.push(city);
  return { ok: true, city };
}

export function placeImprovement(
  state: GameState,
  tileIndex: number,
  imp: ImprovementId,
): RuleResult {
  if (state.unitsMode && !state.sandbox) {
    return { ok: false, reason: 'Units mode: move a Builder onto the tile and use its Build action.' };
  }
  const tile = state.map.tiles[tileIndex];
  if (!validImprovements(state, tile).includes(imp)) {
    return { ok: false, reason: 'Not a valid improvement for this tile.' };
  }
  tile.improvement = imp;
  return { ok: true };
}

export function removeImprovement(state: GameState, tileIndex: number): void {
  state.map.tiles[tileIndex].improvement = null;
}

export function removeFeature(state: GameState, tileIndex: number): RuleResult {
  if (state.unitsMode && !state.sandbox) {
    return { ok: false, reason: 'Units mode: move a Builder onto the tile and use its Remove action.' };
  }
  const tile = state.map.tiles[tileIndex];
  const check = canRemoveFeature(state, tile);
  if (!check.ok) return check;
  // Improvements that depended on the feature disappear with it.
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  return { ok: true };
}

export function queueDistrict(
  state: GameState,
  cityId: number,
  type: DistrictId,
  tileIndex: number,
): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const check = canPlaceDistrict(state, city, type, tileIndex);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  tile.district = type;
  tile.districtComplete = state.sandbox;
  tile.improvement = null;
  tile.feature = null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  city.districts.push({ type, tileIndex });
  if (!state.sandbox) {
    city.queue.push({ kind: 'district', district: type, tileIndex, progress: 0, cost: districtCost(state) });
  }
  return { ok: true };
}

export function queueBuilding(state: GameState, cityId: number, buildingId: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  if (state.sandbox) {
    city.buildings.push(buildingId);
  } else {
    city.queue.push({ kind: 'building', building: buildingId, progress: 0 });
  }
  return { ok: true };
}

/** Queue a world wonder on a tile. */
export function queueWonder(
  state: GameState,
  cityId: number,
  wonderId: string,
  tileIndex: number,
): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const check = canPlaceWonder(state, city, wonderId, tileIndex);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  tile.builtWonder = wonderId;
  tile.builtWonderComplete = state.sandbox;
  tile.improvement = null;
  tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  city.wonders.push({ id: wonderId, tileIndex });
  if (!state.sandbox) {
    city.queue.push({ kind: 'wonder', wonder: wonderId, tileIndex, progress: 0 });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Projects & purchases
// ---------------------------------------------------------------------------

/** Project production cost, scaling with research progress like districts. */
export function projectCost(state: GameState): number {
  return Math.max(15, Math.round(districtCost(state) * 0.5));
}

/** Projects this city can run (needs the matching completed district). */
export function availableProjects(state: GameState, city: City): ProjectDef[] {
  return Object.values(PROJECTS).filter((p) =>
    city.districts.some(
      (d) => d.type === p.district && state.map.tiles[d.tileIndex].districtComplete,
    ),
  );
}

export function queueProject(state: GameState, cityId: number, projectId: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (state.sandbox) return { ok: false, reason: 'Projects have no effect in sandbox mode.' };
  if (!availableProjects(state, city).some((p) => p.id === projectId)) {
    return { ok: false, reason: 'Project needs its completed district in this city.' };
  }
  city.queue.push({ kind: 'project', project: projectId, progress: 0, cost: projectCost(state) });
  return { ok: true };
}

function completeProject(state: GameState, city: City, projectId: string, cost: number): void {
  const def = PROJECTS[projectId];
  if (!def) return;
  if (def.yield) {
    const amount = Math.round(cost * PROJECT_YIELD_FRACTION);
    applyLumpYield(state, city.centerIndex, { key: def.yield, amount });
    state.eventLog.push(`${city.name} completed ${def.name}: +${amount} ${def.yield}.`);
  }
  if (def.gpClass) {
    const pts = Math.round(cost * PROJECT_GPP_FRACTION);
    state.greatPeople.points[def.gpClass] = (state.greatPeople.points[def.gpClass] ?? 0) + pts;
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${def.gpClass} points.`);
  }
}

/** Gold price to buy a building outright (Civ 6's 4× production cost). */
export function buildingPurchaseCost(buildingId: string): number {
  return (BUILDINGS[buildingId]?.cost ?? 0) * GOLD_PURCHASE_MULT;
}

/** Faith price of a worship building. */
export function buildingFaithCost(buildingId: string): number {
  return (BUILDINGS[buildingId]?.cost ?? 0) * FAITH_PURCHASE_MULT;
}

export function unitPurchaseCost(unitType: string): number {
  return (UNITS[unitType]?.cost ?? 0) * GOLD_PURCHASE_MULT;
}

/**
 * Buy a building with gold (worship buildings with faith instead, as in
 * Civ 6). Unlike queueing, purchasing needs the district finished now.
 */
export function purchaseBuilding(state: GameState, cityId: number, buildingId: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  if (!buildingCompletable(state, city, buildingId)) {
    return { ok: false, reason: 'Its district (or prerequisite building) must be finished first.' };
  }
  const worship = BUILDINGS[buildingId]?.worship === true;
  if (!state.sandbox) {
    if (worship) {
      const cost = buildingFaithCost(buildingId);
      if (state.faithTotal < cost) return { ok: false, reason: `Not enough faith (${cost} needed).` };
      state.faithTotal -= cost;
    } else {
      const cost = buildingPurchaseCost(buildingId);
      if (state.treasury < cost) return { ok: false, reason: `Not enough gold (${cost} needed).` };
      state.treasury -= cost;
    }
  }
  city.buildings.push(buildingId);
  return { ok: true };
}

/** Buy a unit with gold; it appears at the city center immediately. */
export function purchaseUnit(state: GameState, cityId: number, unitType: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!trainableUnits(state).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const cost = unitPurchaseCost(unitType);
  if (!state.sandbox) {
    if (state.treasury < cost) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    state.treasury -= cost;
  }
  const unit = spawnUnit(state, unitType, city.centerIndex);
  if (!unit) {
    if (!state.sandbox) state.treasury += cost; // refund: nowhere to stand
    return { ok: false, reason: 'No free tile near the city center.' };
  }
  return { ok: true };
}

/** Buy a settler with gold (cost scales like trained settlers). */
export function purchaseSettler(state: GameState, cityId: number): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cost = settlerCost(state) * GOLD_PURCHASE_MULT;
  if (!state.sandbox) {
    if (state.treasury < cost) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    state.treasury -= cost;
  }
  state.settlers += 1;
  return { ok: true };
}

export function cancelQueueItem(state: GameState, cityId: number, index: number): void {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || index < 0 || index >= city.queue.length) return;
  const item = city.queue[index];
  if (item.kind === 'district') {
    const tile = state.map.tiles[item.tileIndex];
    tile.district = null;
    tile.districtComplete = false;
    city.districts = city.districts.filter((d) => d.tileIndex !== item.tileIndex);
  } else if (item.kind === 'wonder') {
    const tile = state.map.tiles[item.tileIndex];
    tile.builtWonder = null;
    tile.builtWonderComplete = false;
    city.wonders = city.wonders.filter((w) => w.tileIndex !== item.tileIndex);
  }
  city.queue.splice(index, 1);
}

export function itemCost(item: QueueItem): number {
  if (item.kind === 'district') return item.cost ?? DISTRICTS[item.district].cost;
  if (item.kind === 'wonder') return BUILT_WONDERS[item.wonder].cost;
  if (item.kind === 'settler') return item.cost;
  if (item.kind === 'unit') return UNITS[item.unit]?.cost ?? 54;
  if (item.kind === 'project') return item.cost;
  return BUILDINGS[item.building].cost;
}

export function itemLabel(item: QueueItem): string {
  if (item.kind === 'district') return DISTRICTS[item.district].name;
  if (item.kind === 'wonder') return BUILT_WONDERS[item.wonder].name;
  if (item.kind === 'settler') return 'Settler';
  if (item.kind === 'unit') return UNITS[item.unit]?.name ?? item.unit;
  if (item.kind === 'project') return PROJECTS[item.project]?.name ?? item.project;
  return BUILDINGS[item.building].name;
}

/** Manually assign specialists to a district tile (clamped to slots & population). */
export function setSpecialists(
  state: GameState,
  cityId: number,
  tileIndex: number,
  count: number,
): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const slots = citySpecialistSlots(state, city);
  const max = slots.get(tileIndex) ?? 0;
  if (max === 0) return { ok: false, reason: 'That district has no specialist slots.' };
  const clamped = Math.max(0, Math.min(count, max));
  if (clamped === 0) delete city.specialists[String(tileIndex)];
  else city.specialists[String(tileIndex)] = clamped;
  return { ok: true };
}

function isEncampmentItem(item: QueueItem): boolean {
  if (item.kind === 'district') return item.district === 'ENCAMPMENT';
  if (item.kind !== 'building') return false;
  return BUILDINGS[item.building]?.district === 'ENCAMPMENT';
}

// ---------------------------------------------------------------------------
// Tiles, research, government actions
// ---------------------------------------------------------------------------

/** Gold price for this city's next tile (shared counter with culture growth). */
export function tilePurchaseCost(state: GameState, city: City): number {
  const mods = getModifiers(state);
  return Math.round(
    borderGrowthCost(city.tilesAcquired) * TILE_PURCHASE_GOLD_PER_CULTURE * mods.tilePurchaseMult,
  );
}

export function buyTile(state: GameState, cityId: number, tileIndex: number): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!borderCandidates(state, city).includes(tileIndex)) {
    return { ok: false, reason: 'Tile must be unowned and adjacent to this city’s territory (within 5 rings).' };
  }
  const cost = tilePurchaseCost(state, city);
  if (!state.sandbox) {
    if (state.treasury < cost) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    state.treasury -= cost;
  }
  acquireTile(state, city, tileIndex);
  return { ok: true };
}

export function setTechResearch(state: GameState, techId: string): RuleResult {
  if (!availableTechs(state).some((t) => t.id === techId)) {
    return { ok: false, reason: 'Tech not available (missing prerequisites or already researched).' };
  }
  state.research.tech = techId;
  return { ok: true };
}

export function setCivicResearch(state: GameState, civicId: string): RuleResult {
  if (!availableCivics(state).some((c) => c.id === civicId)) {
    return { ok: false, reason: 'Civic not available (missing prerequisites or already researched).' };
  }
  state.research.civic = civicId;
  return { ok: true };
}

export function setGovernment(state: GameState, governmentId: string): RuleResult {
  const unlocks = computeUnlocks(state);
  if (!state.sandbox && !unlocks.governments.has(governmentId)) {
    return { ok: false, reason: 'Government not unlocked yet.' };
  }
  const def = GOVERNMENTS[governmentId];
  if (!def) return { ok: false, reason: 'No such government.' };

  const oldCards = state.government.policies.filter((p): p is string => p !== null);
  state.government.current = governmentId;
  const slots = governmentSlots(state); // includes wonder-granted extras
  state.government.policies = slots.map(() => null);
  // Re-seat old cards into compatible slots where possible.
  for (const cardId of oldCards) {
    const card = POLICIES[cardId];
    if (!card) continue;
    const slot = slots.findIndex(
      (kind, i) => state.government.policies[i] === null && cardFitsSlot(card, kind),
    );
    if (slot >= 0) state.government.policies[slot] = cardId;
  }
  return { ok: true };
}

export function setPolicy(state: GameState, slotIndex: number, policyId: string | null): RuleResult {
  const govId = state.government.current;
  if (!govId) return { ok: false, reason: 'No government yet (research Code of Laws).' };
  const slots = governmentSlots(state);
  if (slotIndex < 0 || slotIndex >= slots.length) return { ok: false, reason: 'No such slot.' };
  while (state.government.policies.length < slots.length) state.government.policies.push(null);
  if (policyId === null) {
    state.government.policies[slotIndex] = null;
    return { ok: true };
  }
  const card = POLICIES[policyId];
  if (!card) return { ok: false, reason: 'No such policy.' };
  const unlocks = computeUnlocks(state);
  if (!state.sandbox && !unlocks.policies.has(policyId)) {
    return { ok: false, reason: 'Policy not unlocked yet.' };
  }
  if (!cardFitsSlot(card, slots[slotIndex])) {
    return { ok: false, reason: `${card.name} does not fit a ${slots[slotIndex]} slot.` };
  }
  if (state.government.policies.some((p, i) => p === policyId && i !== slotIndex)) {
    return { ok: false, reason: `${card.name} is already slotted.` };
  }
  state.government.policies[slotIndex] = policyId;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Turn loop
// ---------------------------------------------------------------------------

function autoPickResearch(state: GameState): void {
  const eff = (id: string, cost: number) => effectiveResearchCost(state, id, cost);
  if (state.research.tech === null) {
    const next = availableTechs(state).sort((a, b) => eff(a.id, a.cost) - eff(b.id, b.cost))[0];
    if (next) state.research.tech = next.id;
  }
  if (state.research.civic === null) {
    const next = availableCivics(state).sort((a, b) => eff(a.id, a.cost) - eff(b.id, b.cost))[0];
    if (next) state.research.civic = next.id;
  }
}

function advanceResearch(state: GameState, science: number, culture: number): void {
  const r = state.research;
  autoPickResearch(state);

  r.techProgress += science;
  while (r.tech && r.techProgress >= effectiveResearchCost(state, r.tech, TECHS[r.tech].cost)) {
    r.techProgress -= effectiveResearchCost(state, r.tech, TECHS[r.tech].cost);
    r.techs.push(r.tech);
    r.tech = null;
    autoPickResearch(state);
  }
  if (!r.tech) r.techProgress = Math.min(r.techProgress, 0); // nothing left to research

  r.civicProgress += culture;
  while (r.civic && r.civicProgress >= effectiveResearchCost(state, r.civic, CIVICS[r.civic].cost)) {
    r.civicProgress -= effectiveResearchCost(state, r.civic, CIVICS[r.civic].cost);
    r.civics.push(r.civic);
    r.civic = null;
    autoPickResearch(state);
  }
  if (!r.civic) r.civicProgress = Math.min(r.civicProgress, 0);

  // First government comes free with Code of Laws.
  if (!state.government.current && computeUnlocks(state).governments.has('CHIEFDOM')) {
    setGovernment(state, 'CHIEFDOM');
  }
}

export function endTurn(state: GameState): void {
  detectBoosts(state);
  if (state.unitsMode) refreshUnits(state);
  const luxMap = luxuryAmenities(state);
  const mods = getModifiers(state);
  let turnScience = 0;
  let turnCulture = 0;

  for (const city of state.cities) {
    const stats = computeCityStats(state, city, luxMap, mods);

    // --- production ---------------------------------------------------------
    if (city.queue.length > 0) {
      const head = city.queue[0];
      const mult = isEncampmentItem(head) ? mods.encampmentProdMult : 1;
      head.progress += stats.total.production * mult;
      if (city.productionBank) {
        head.progress += city.productionBank;
        city.productionBank = 0;
      }
      while (city.queue.length > 0 && city.queue[0].progress >= itemCost(city.queue[0])) {
        const head = city.queue[0];
        if (head.kind === 'building' && !buildingCompletable(state, city, head.building)) {
          // Queued ahead of its district/prereqs — hold at full progress.
          head.progress = itemCost(head);
          break;
        }
        const item = city.queue.shift()!;
        const overflow = item.progress - itemCost(item);
        if (item.kind === 'district') {
          state.map.tiles[item.tileIndex].districtComplete = true;
        } else if (item.kind === 'wonder') {
          state.map.tiles[item.tileIndex].builtWonderComplete = true;
        } else if (item.kind === 'settler') {
          state.settlers += 1;
        } else if (item.kind === 'unit') {
          spawnUnit(state, item.unit, city.centerIndex);
        } else if (item.kind === 'project') {
          completeProject(state, city, item.project, itemCost(item));
        } else {
          city.buildings.push(item.building);
        }
        if (city.queue.length > 0) city.queue[0].progress += overflow;
      }
    }

    // --- growth -------------------------------------------------------------
    city.foodBox += stats.effectiveFoodSurplus;
    if (city.foodBox >= stats.growthNeeded) {
      city.population += 1;
      city.foodBox -= stats.growthNeeded;
    } else if (city.foodBox < 0) {
      city.population = Math.max(1, city.population - 1);
      city.foodBox = 0;
    }

    // --- cultural border expansion -------------------------------------------
    const borderCost = () => Math.round(borderGrowthCost(city.tilesAcquired) * mods.borderCostMult);
    city.cultureBox += stats.total.culture;
    while (city.cultureBox >= borderCost()) {
      const next = pickBorderTile(state, city);
      if (next === null) {
        // Nowhere to grow: cap the box at the current threshold.
        city.cultureBox = Math.min(city.cultureBox, borderCost());
        break;
      }
      city.cultureBox -= borderCost();
      acquireTile(state, city, next);
    }

    // --- empire accumulators ---------------------------------------------------
    state.treasury += stats.total.gold;
    state.scienceTotal += stats.total.science;
    state.cultureTotal += stats.total.culture;
    state.faithTotal += stats.total.faith;
    turnScience += stats.total.science;
    turnCulture += stats.total.culture;
  }

  if (state.unitsMode) {
    state.treasury -= unitMaintenance(state);
    barbarianPhase(state);
  }
  if (state.disasters) disasterPhase(state);

  advanceResearch(state, turnScience, turnCulture);
  advanceGreatPeople(state);

  // Auto-found sites queued by the empire planner as settlers become available.
  while (state.settlers > 0 && state.plannedSettles.length > 0) {
    const target = state.plannedSettles.shift()!;
    if (canFoundCity(state, target).ok) {
      foundCity(state, target);
    }
    // Invalid targets (map changed since planning) are simply dropped.
  }

  state.turn += 1;
}

// ---------------------------------------------------------------------------
// Great people
// ---------------------------------------------------------------------------

/** Points each class gains per turn (districts + their buildings + specialists + beliefs). */
export function greatPersonPointsPerTurn(state: GameState): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  const gppFlat = getModifiers(state).gppFlat;
  for (const city of state.cities) {
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete,
      );
      if (!inst) continue;
      let pts = 1 + (gppFlat[cls] ?? 0);
      pts += city.buildings.filter((b) => BUILDINGS[b]?.district === district).length;
      pts += city.specialists[String(inst.tileIndex)] ?? 0;
      out[cls] += pts;
    }
  }
  return out;
}

/** Number of people of a class already earned. */
export function greatPeopleEarned(state: GameState, cls: GreatPersonClass): number {
  return state.greatPeople.earned.filter((id) => GREAT_PEOPLE[cls].some((p) => p.id === id)).length;
}

function applyGreatPersonEffect(state: GameState, cls: GreatPersonClass): void {
  const n = greatPeopleEarned(state, cls);
  const person = GREAT_PEOPLE[cls][n];
  if (!person) return; // class exhausted
  const fx = person.effect;
  if (fx.science) state.research.techProgress += fx.science;
  if (fx.culture) state.research.civicProgress += fx.culture;
  if (fx.faith) state.faithTotal += fx.faith;
  if (fx.gold) state.treasury += fx.gold;
  if (fx.productionToCapital) {
    const capital = state.cities.find((c) => c.isCapital);
    if (capital && capital.queue.length > 0) {
      capital.queue[0].progress += fx.productionToCapital;
    }
  }
  state.greatPeople.earned.push(person.id);
}

function advanceGreatPeople(state: GameState): void {
  const perTurn = greatPersonPointsPerTurn(state);
  for (const cls of GP_CLASSES) {
    if (perTurn[cls] === 0 && (state.greatPeople.points[cls] ?? 0) === 0) continue;
    let pts = (state.greatPeople.points[cls] ?? 0) + perTurn[cls];
    let earned = greatPeopleEarned(state, cls);
    while (earned < GREAT_PEOPLE[cls].length && pts >= gpCost(earned)) {
      pts -= gpCost(earned);
      applyGreatPersonEffect(state, cls);
      earned++;
    }
    state.greatPeople.points[cls] = pts;
  }
}

export function toggleLockedTile(state: GameState, cityId: number, tileIndex: number): void {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return;
  const i = city.lockedTiles.indexOf(tileIndex);
  if (i >= 0) city.lockedTiles.splice(i, 1);
  else city.lockedTiles.push(tileIndex);
}

// ---------------------------------------------------------------------------

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse a save, filling in fields that older saves lack. */
export function deserialize(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  state.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] };
  state.research.boosted ??= [];
  state.government ??= { current: null, policies: [] };
  state.greatPeople ??= { points: {}, earned: [] };
  for (const t of state.map.tiles as (Tile & { wonder?: string | null })[]) {
    t.wonder ??= null;
    t.builtWonder ??= null;
    t.builtWonderComplete ??= false;
  }
  state.religion ??= { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null };
  state.tradeRoutes ??= [];
  state.settlers ??= 0;
  state.plannedSettles ??= [];
  state.unitsMode ??= false;
  state.units ??= [];
  state.nextUnitId ??= 0;
  state.rngState ??= (state.map.seed ^ 0x9e3779b9) >>> 0;
  state.barbCamps ??= [];
  state.cityHp ??= {};
  state.disasters ??= false;
  state.fogOfWar ??= false;
  state.explored ??= [];
  state.eventLog ??= [];
  for (const u of state.units) {
    u.owner ??= 'player';
    u.hp ??= 100;
  }
  for (const t of state.map.tiles) {
    (t as Tile).pillaged ??= false;
    (t as Tile).goodyHut ??= false;
    (t as Tile).volcano ??= false;
    (t as Tile).fertility ??= 0;
    (t as Tile).droughtTurns ??= 0;
  }
  for (const c of state.cities) {
    c.cultureBox ??= 0;
    c.tilesAcquired ??= 0;
    c.wonders ??= [];
    c.specialists ??= {};
    // productionBank stays optional (readers use ?? 0) so that adding it
    // here cannot desync serialize(live) vs serialize(roundtripped).
  }
  return state;
}

// ---------------------------------------------------------------------------
// Religion
// ---------------------------------------------------------------------------

export function canChoosePantheon(state: GameState): RuleResult {
  if (state.religion.pantheon) return { ok: false, reason: 'Pantheon already chosen.' };
  if (!state.sandbox && state.faithTotal < PANTHEON_FAITH_COST) {
    return { ok: false, reason: `Needs ${PANTHEON_FAITH_COST} faith (${Math.floor(state.faithTotal)} banked).` };
  }
  return { ok: true };
}

export function choosePantheon(state: GameState, beliefId: string): RuleResult {
  const check = canChoosePantheon(state);
  if (!check.ok) return check;
  if (!PANTHEONS[beliefId]) return { ok: false, reason: 'No such pantheon belief.' };
  if (!state.sandbox) state.faithTotal -= PANTHEON_FAITH_COST;
  state.religion.pantheon = beliefId;
  return { ok: true };
}

export function canFoundReligion(state: GameState): RuleResult {
  if (state.religion.founded) return { ok: false, reason: 'Religion already founded.' };
  if (!state.religion.pantheon) return { ok: false, reason: 'Choose a pantheon first.' };
  const hasHolySite = state.cities.some((c) =>
    c.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
  );
  if (!hasHolySite) return { ok: false, reason: 'Needs a completed Holy Site.' };
  if (!state.sandbox && greatPeopleEarned(state, 'PROPHET') === 0) {
    return { ok: false, reason: 'Needs a Great Prophet (earn Prophet great-person points).' };
  }
  return { ok: true };
}

export function foundReligion(
  state: GameState,
  choice: { name: string; follower: string; founder: string; worship: string },
): RuleResult {
  const check = canFoundReligion(state);
  if (!check.ok) return check;
  if (!FOLLOWER_BELIEFS[choice.follower]) return { ok: false, reason: 'No such follower belief.' };
  if (!FOUNDER_BELIEFS[choice.founder]) return { ok: false, reason: 'No such founder belief.' };
  if (!WORSHIP_BUILDINGS.includes(choice.worship)) return { ok: false, reason: 'No such worship building.' };
  state.religion.founded = true;
  state.religion.name = choice.name || RELIGION_NAMES[0];
  state.religion.follower = choice.follower;
  state.religion.founder = choice.founder;
  state.religion.worship = choice.worship;
  return { ok: true };
}
