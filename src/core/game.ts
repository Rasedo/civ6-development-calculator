/**
 * Game state lifecycle: creation, player actions (found city, improve,
 * place districts/buildings, buy tiles, pick research, run government),
 * the end-of-turn loop, and serialization.
 */

import type { City, DistrictId, GameState, GreatPersonClass, ImprovementId, MapGenOptions, QueueItem, Tile } from './types';
import { generateMap } from './mapgen';
import { tilesWithin } from './hex';
import { computeCityStats, luxuryAmenities, borderCandidates, pickBorderTile, acquireTile, citySpecialistSlots } from './city';
import { canFoundCity, canPlaceDistrict, canPlaceWonder, validImprovements, canRemoveFeature, availableBuildings, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, availableTechs, availableCivics, governmentSlots } from './effects';
import { detectBoosts } from './boosts';
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
import { CITY_NAMES, borderGrowthCost, TILE_PURCHASE_GOLD_PER_CULTURE } from '../data/constants';

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

export function createGame(opts: MapGenOptions & { sandbox?: boolean }): GameState {
  return createGameFromMap(generateMap(opts), opts.sandbox ?? false);
}

/** Fresh game state around an existing map (e.g. one imported from Civ 6). */
export function createGameFromMap(map: GameState['map'], sandbox = false): GameState {
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
  };
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function foundCity(state: GameState, tileIndex: number): RuleResult & { city?: City } {
  const check = canFoundCity(state, tileIndex);
  if (!check.ok) return check;

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

  state.cities.push(city);
  return { ok: true, city };
}

export function placeImprovement(
  state: GameState,
  tileIndex: number,
  imp: ImprovementId,
): RuleResult {
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
  return BUILDINGS[item.building].cost;
}

export function itemLabel(item: QueueItem): string {
  if (item.kind === 'district') return DISTRICTS[item.district].name;
  if (item.kind === 'wonder') return BUILT_WONDERS[item.wonder].name;
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
  if (item.kind === 'wonder') return false;
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
      while (city.queue.length > 0 && city.queue[0].progress >= itemCost(city.queue[0])) {
        const item = city.queue.shift()!;
        const overflow = item.progress - itemCost(item);
        if (item.kind === 'district') {
          state.map.tiles[item.tileIndex].districtComplete = true;
        } else if (item.kind === 'wonder') {
          state.map.tiles[item.tileIndex].builtWonderComplete = true;
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
    city.cultureBox += stats.total.culture;
    while (city.cultureBox >= borderGrowthCost(city.tilesAcquired)) {
      const next = pickBorderTile(state, city);
      if (next === null) {
        // Nowhere to grow: cap the box at the current threshold.
        city.cultureBox = Math.min(city.cultureBox, borderGrowthCost(city.tilesAcquired));
        break;
      }
      city.cultureBox -= borderGrowthCost(city.tilesAcquired);
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

  advanceResearch(state, turnScience, turnCulture);
  advanceGreatPeople(state);
  state.turn += 1;
}

// ---------------------------------------------------------------------------
// Great people
// ---------------------------------------------------------------------------

/** Points each class gains per turn (districts + their buildings + specialists). */
export function greatPersonPointsPerTurn(state: GameState): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  for (const city of state.cities) {
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete,
      );
      if (!inst) continue;
      let pts = 1;
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
  for (const c of state.cities) {
    c.cultureBox ??= 0;
    c.tilesAcquired ??= 0;
    c.wonders ??= [];
    c.specialists ??= {};
  }
  return state;
}
