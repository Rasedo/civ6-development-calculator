/**
 * Game state lifecycle: creation, seat 0 actions (found city, improve,
 * place districts/buildings, buy tiles, pick research, run government),
 * the end-of-turn loop, and serialization.
 */

import type { City, DistrictId, GameState, ImprovementId, MapGenOptions, QueueItem, ResearchState, Tile, Seat, Unit } from './types';
import { greatPeopleEarned } from './greatPeople';
import { placeRelic } from '../data/greatPeople';
import { generateMap } from '../../world/mapgen';
import { tilesWithin, hexDistance } from '../../world/hex';
import { acquireTile, borderCandidates, citySpecialistSlots } from './city';
import { canFoundCity, canPlaceDistrict, canPlaceWonder, validImprovements, canRemoveFeature, availableBuildings, buildingCompletable, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, availableTechs, availableCivics, governmentSlots } from './effects';
import type { Modifiers, Unlocks } from './effects';
import { effectiveResearchCostIn } from './boosts';
import { spawnUnit, refreshUnits, trainableUnits, disbandUnit, builderCost, settlerCount } from './units';
import { barbarianPhase, encampmentTrainXp } from './combat';
import { revealAround } from './fog';
import { disasterPhase } from './disasters';
import { placeCityStates, cityStatePhase } from './cityStates';
import { placeSeats, seatPhase, worldCongress, nextCityName } from './phase';
import { commitProduction, commitResearch } from './seatTurn';
import { ERA_SCORE_FOUND, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, DIPLO_VICTORY_POINTS, DED_EXODUS } from '../data/seats';
import { addEraScore, eraBoundary, applyDedications, dedicationEvent, goldenBoostBonus } from './eras';
import { UNITS, WALLS_HP, ENCAMPMENT_HP, CITY_MAX_HP } from '../data/units';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, WORSHIP_BUILDINGS, RELIGION_NAMES, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, RELIGION_PRESSURE_PER_TURN, MISSIONARY_CAP, APOSTLE_CAP, THEO_DAMAGE, THEO_BASE_DAMAGE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE } from '../data/religion';
import { PROJECTS, type ProjectDef } from '../data/projects';
import { CITY_NAMES, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, GAME_SPEED } from '../data/constants';
import { BARB_SEAT, allCities, allSeats, citiesOf, emptySeat, seatOf, seatOfCityState, setTileOwner, tileClaimed, unitSeat } from './seats';

/** the game is over once this many turns are played (score victory at
 * the limit; domination can end it earlier). Config for the horizon. */
export const TURN_LIMIT = 250;

/** Eureka/inspiration discount applied to a research cost. */
export function effectiveResearchCost(state: GameState, seat: number, id: string, baseCost: number): number {
  // A GOLDEN Free Inquiry / Pen-Brush-and-Voice deepens the boost.
  return effectiveResearchCostIn(seatOf(state, seat)!.research, id, baseCost, goldenBoostBonus(state, 0, !TECHS[id]));
}

/**
 * Districts get pricier as the game advances (Civ 6 scales with overall
 * research progress). Cost is locked in when the district is queued.
 */
export function districtCostIn(research: ResearchState): number {
  // The real Civ 6 curve — floor(54·(1 + 9·max(tech%, civic%)))
  // (the tree you are FURTHER through drives the price, not the average;
  // the 25% under-represented-district discount stays unmodeled — AUDIT).
  // The 54 base speed-scales like every other production cost.
  const tPct = research.techs.length / Object.keys(TECHS).length;
  const cPct = research.civics.length / Object.keys(CIVICS).length;
  return Math.floor(Math.round(54 * GAME_SPEED) * (1 + 9 * Math.max(tPct, cPct)));
}

/** the GS district discount — 40% off a specialty type while the civ
 * has PLACED fewer of it than its per-unlocked-type average of COMPLETED
 * specialty districts: n < ceil(D/U), gated on D ≥ U (civfanatics 27783). */
/**
 * ONE discount rule for every seat — n < ceil(D/U) with D >= U, over the
 * seat's OWN unlocked-district set and its OWN cities. `owner` supplies both;
 * omitted means seat 0, which is what every seat 0 call site meant.
 */
export function districtDiscounted(
  state: GameState,
  seat: number,
  type: DistrictId,
  owner?: { unlocks: Unlocks; cities: (City | City)[] },
): boolean {
  if (!DISTRICTS[type]?.countsTowardLimit) return false;
  const unlocks = owner?.unlocks ?? computeUnlocks(state, seat);
  const U = [...unlocks.districts].filter((d) => DISTRICTS[d as DistrictId]?.countsTowardLimit).length;
  if (U === 0) return false;
  let D = 0;
  let n = 0;
  for (const c of owner?.cities ?? citiesOf(state, seat)) {
    for (const d of c.districts) {
      if (!DISTRICTS[d.type]?.countsTowardLimit) continue;
      if (state.map.tiles[d.tileIndex].districtComplete) D += 1;
      if (d.type === type) n += 1;
    }
  }
  return D >= U && n < Math.ceil(D / U);
}

export function districtCost(state: GameState, seat: number, type?: DistrictId): number {
  const base = districtCostIn(seatOf(state, seat)!.research);
  return type !== undefined && districtDiscounted(state, seat, type) ? Math.floor(base * 0.6) : base;
}

export function createGame(
  opts: MapGenOptions & {
    sandbox?: boolean;
    unitsMode?: boolean;
    cityStates?: boolean | number;
    opponents?: boolean | number;
  },
): GameState {
  const state = createGameFromMap(generateMap(opts), opts.sandbox ?? false, opts.unitsMode ?? false);
  if (opts.cityStates) {
    placeCityStates(state, typeof opts.cityStates === 'number' ? opts.cityStates : undefined);
  }
  if (opts.opponents) {
    placeSeats(state, typeof opts.opponents === 'number' ? opts.opponents : undefined);
  }
  return state;
}

/** Fresh game state around an existing map (e.g. one imported from Civ 6). */
export function createGameFromMap(map: GameState['map'], sandbox = false, unitsMode = false): GameState {
  return {
    map,
    turn: 1,
    sandbox,
    claimedGreatPeople: [],
    unitsMode,
    units: [],
    nextUnitId: 0,
    rngState: (map.seed ^ 0x9e3779b9) >>> 0,
    barbSeat: emptySeat(BARB_SEAT), // #51/S6.12: the hostile class has a seat too
    disasters: false,
    gameOver: false, // GV-2
    victoryType: 0, // GV-4/GV-3
    // FOG IS LIVE in units mode, for every seat: reveals accrue from the
    // first spawn (placement happens after creation, so starts are seen),
    // meets/settling/camp-rise all gate on the explored planes. The classic
    // calculator (no units) has nothing to scout with — fog stays off.
    fogOfWar: unitsMode,
    eventLog: [],
    cityStates: [],
    // The seat 0 is seat 0 and holds the SAME shape a seat does.
    // Seat seats are appended by the seat factory (they are the same objects
    // as `the other seats[]` while the field-by-field migration proceeds).
    seats: [emptySeat(0)],
    claimedPantheons: [],
    claimedBeliefs: [],
    claimedEnhancers: [],
  };
}

/** Civ 6-ish settler cost, rising with every city, live SETTLER unit and
 * queued one. The real 80 + 30·n, speed-scaled like unit costs → 48 + 18·n. */
export function settlerCost(state: GameState, seat: number): number {
  const queued = seatOf(state, seat)!.cities.reduce(
    (n, c) => n + c.queue.filter((q) => q.kind === 'settler').length,
    0,
  );
  return (
    Math.round(80 * GAME_SPEED) +
    Math.round(30 * GAME_SPEED) *
      Math.max(0, seatOf(state, seat)!.cities.length - 1 + settlerCount(state, seat) + queued)
  );
}

/** Train a settler in a city (no district requirement). Real Civ 6: a city of
 * 1 population may not train one — completion costs the city a pop. */
export function queueSettler(state: GameState, cityId: number, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!state.sandbox && city.population < 2) return { ok: false, reason: 'A city of 1 population cannot train a settler.' };
  commitProduction(state, city.seat, city, { kind: 'settler', progress: 0, cost: settlerCost(state, seat) });
  return { ok: true };
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

/**
 * THE founding mutation, for every seat.
 *
 * `revealAround` lifts the FOUNDER's fog only — fog is per-seat, and one
 * seat's founding never scouts for another.
 *
 * The OWNER is PASSED, never re-derived from the seat. An earlier attempt
 * resolved it via `citiesOf(state, seat)`, whose `seatOf(...)?.cities ??
 * []` returns a FRESH ARRAY when the lookup misses — the push then succeeds
 * silently and the city is lost. 16 tests caught it. Passing the owner makes
 * that unrepresentable.
 */
export function foundCityAt(state: GameState, seat: number, tile: Tile, owner: Seat | null): City {
  const list: City[] = owner ? owner.cities : seatOf(state, seat)!.cities;
  const id = owner ? owner.nextCityId++ : seatOf(state, seat)!.nextCityId++;
  const city: City = {
    id,
    seat,
    name: owner ? nextCityName(owner) : cityName(id),
    centerIndex: tile.index,
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: list.length === 0,
    buildings: list.length === 0 ? ['PALACE'] : [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: CITY_MAX_HP,
    foundedTurn: state.turn,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;
  // Civ 6: a new city starts with its center plus the first ring only.
  setTileOwner(tile, seat, id);
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (!tileClaimed(t)) setTileOwner(t, seat, id);
  }
  list.push(city);
  addEraScore(state, seat, ERA_SCORE_FOUND); // B-24
  if (city.isCapital) {
    const owner = seatOf(state, seat);
    if (owner) owner.capitalTile = tile.index;  // GV-3: static once founded
  }
  revealAround(state, seat, tile.index, 3);
  return city;
}

/**
 * FOUND a city for `seat`: legality, the settler spend, then the mutation.
 * One founding for every seat, first city included: in units mode the spend
 * is a SETTLER unit STANDING ON the tile, consumed by the founding — the
 * real Civ 6 shape. Outside units mode (the classic calculator) and in
 * sandbox there are no units to spend, so founding is free.
 */
export function foundCity(
  state: GameState,
  tileIndex: number,
  seat: number,
): RuleResult & { city?: City } {
  const check = canFoundCity(state, tileIndex, seat);
  if (!check.ok) return check;
  const owner = seatOf(state, seat);
  if (!owner) return { ok: false, reason: 'No such seat.' };

  if (!state.sandbox && state.unitsMode) {
    const settler = state.units.find(
      (u) => u.seat === seat && u.type === 'SETTLER' && u.tileIndex === tileIndex,
    );
    if (!settler) return { ok: false, reason: 'No settler on that tile.' };
    disbandUnit(state, settler.id); // consumed by the founding, not killed
  }

  const city = foundCityAt(state, seat, state.map.tiles[tileIndex], owner);
  return { ok: true, city };
}

/**
 * domination: the civ that holds EVERY original capital (its own plus
 * every seat's, by capture), else -1. Capitals are loyalty-immune, so a
 * capital tile only changes hands by capture — each seat's `capitalTile` is
 * static and we read who currently has a city centered on each. A razed
 * capital (no city there) makes domination impossible, so we return -1.
 */
export function dominationWinner(state: GameState): number {
  const expected = state.seats.length;
  if (expected <= 1) return -1; // nothing to conquer — a solo game never dominates
  const caps = Array.from({ length: expected }, (_, i) => seatOf(state, i)?.capitalTile).filter(
    (t): t is number => t !== undefined,
  );
  if (caps.filter((t) => t !== undefined).length < expected) return -1;
  const ownerOf = (ct: number): number => {
    for (const s of state.seats) {
      if (s.cities.some((c) => c.centerIndex === ct)) return s.seat;
    }
    return -1;
  };
  let holder = -1;
  for (const ct of caps) {
    const o = ownerOf(ct);
    if (o < 0) return -1; // a capital with no city (razed) — no domination
    if (holder === -1) holder = o;
    else if (holder !== o) return -1;
  }
  return holder;
}

export function placeImprovement(
  state: GameState,
  tileIndex: number,
  imp: ImprovementId, seat: number): RuleResult {
  if (state.unitsMode && !state.sandbox) {
    return { ok: false, reason: 'Units mode: move a Builder onto the tile and use its Build action.' };
  }
  const tile = state.map.tiles[tileIndex];
  if (!validImprovements(state, tile, seat).includes(imp)) {
    return { ok: false, reason: 'Not a valid improvement for this tile.' };
  }
  tile.improvement = imp;
  return { ok: true };
}

export function removeImprovement(state: GameState, tileIndex: number): void {
  state.map.tiles[tileIndex].improvement = null;
}

export function removeFeature(state: GameState, tileIndex: number, seat: number): RuleResult {
  if (state.unitsMode && !state.sandbox) {
    return { ok: false, reason: 'Units mode: move a Builder onto the tile and use its Remove action.' };
  }
  const tile = state.map.tiles[tileIndex];
  const check = canRemoveFeature(state, tile, seat);
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
  seat: number,
): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const check = canPlaceDistrict(state, city, type, tileIndex);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  tile.district = type;
  tile.districtComplete = state.sandbox;
  // Sandbox completes instantly, so the garrison musters here too.
  if (state.sandbox && type === 'ENCAMPMENT') tile.encampHp = ENCAMPMENT_HP;
  tile.improvement = null;
  tile.feature = null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  // Price BEFORE registering the placement (the discount reads the
  // pre-placement counts — "value C changes the moment you place").
  const cost = districtCost(state, seat, type);
  city.districts.push({ type, tileIndex });
  if (!state.sandbox) {
    commitProduction(state, city.seat, city, { kind: 'district', district: type, tileIndex, progress: 0, cost });
  }
  return { ok: true };
}

export function queueBuilding(state: GameState, cityId: number, buildingId: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  // Worship buildings are faith-purchase ONLY — they
  // never enter the production queue (purchaseBuilding faith-prices them).
  if (BUILDINGS[buildingId]?.worship) {
    return { ok: false, reason: 'Worship buildings are purchased with faith, not built.' };
  }
  if (state.sandbox) {
    city.buildings.push(buildingId);
    if (buildingId === 'ANCIENT_WALLS') city.outerHp = WALLS_HP; // AUDIT B-1
  } else {
    commitProduction(state, city.seat, city, { kind: 'building', building: buildingId, progress: 0 });
  }
  return { ok: true };
}

/** Queue a world wonder on a tile. */
export function queueWonder(
  state: GameState,
  cityId: number,
  wonderId: string,
  tileIndex: number,
  seat: number,
): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const check = canPlaceWonder(state, city, wonderId, tileIndex, seat);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  tile.builtWonder = wonderId;
  tile.builtWonderComplete = state.sandbox;
  tile.improvement = null;
  tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  city.wonders.push({ id: wonderId, tileIndex });
  if (!state.sandbox) {
    commitProduction(state, city.seat, city, { kind: 'wonder', wonder: wonderId, tileIndex, progress: 0 });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Projects & purchases
// ---------------------------------------------------------------------------

/** Project production cost, scaling with research progress like districts.
 * The floor speed-scales with everything else (15 → 9). */
export function projectCost(state: GameState, seat: number): number {
  return Math.max(Math.round(15 * GAME_SPEED), Math.round(districtCost(state, seat) * 0.5));
}

/** Projects this city can run (needs the matching completed district).
 * space-race projects additionally require their gating tech, the previous
 * chain step already completed by this empire, and are one-time (not repeated). */
export function availableProjects(state: GameState, city: City): ProjectDef[] {
  const owner = seatOf(state, city.seat);
  const done = owner?.spaceProjects ?? [];
  return Object.values(PROJECTS).filter((p) => {
    if (!city.districts.some((d) => d.type === p.district && state.map.tiles[d.tileIndex].districtComplete)) {
      return false;
    }
    if (!p.space) return true;
    if (done.includes(p.id)) return false; // one-time
    if (p.requiresTech && !owner?.research.techs.includes(p.requiresTech)) return false;
    if (p.requiresProject && !done.includes(p.requiresProject)) return false;
    return true;
  });
}

export function queueProject(state: GameState, cityId: number, projectId: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (state.sandbox) return { ok: false, reason: 'Projects have no effect in sandbox mode.' };
  if (!availableProjects(state, city).some((p) => p.id === projectId)) {
    return { ok: false, reason: 'Project needs its completed district in this city.' };
  }
  commitProduction(state, city.seat, city, { kind: 'project', project: projectId, progress: 0, cost: projectCost(state, seat) });
  return { ok: true };
}


/** Gold price to buy a building outright (Civ 6's 4× production cost). */
export function buildingPurchaseCost(buildingId: string): number {
  return (BUILDINGS[buildingId]?.cost ?? 0) * GOLD_PURCHASE_MULT;
}

/** Faith price of a worship building. Real Civ 6 charges a FLAT
 * 190 faith for worship buildings (speed-scaled like every other cost);
 * anything else keeps the production×mult schedule. */
export function buildingFaithCost(buildingId: string): number {
  if (BUILDINGS[buildingId]?.worship) return Math.round(190 * GAME_SPEED);
  return (BUILDINGS[buildingId]?.cost ?? 0) * FAITH_PURCHASE_MULT;
}

/** GS: gold/faith thresholds compare at MILLI precision — the treasury
 * accumulates non-dyadic 0.05-unit gold whose sub-milli drift differs
 * between the engines (BLAS association), so a raw `treasury < cost` splits
 * at invisible knife-edges (P5-S7 hunt: t228 — a 72.000-milli
 * treasury vs a 72-gold scout purchase went opposite ways). */
export function goldAffordable(treasury: number, cost: number): boolean {
  return Math.round(treasury * 1000) >= Math.round(cost * 1000);
}

export function unitPurchaseCost(state: GameState, unitType: string, seat: number): number {
  // Builders price off the live escalator, like the settler pair.
  const base = unitType === 'BUILDER' ? builderCost(state, seat) : UNITS[unitType]?.cost ?? 0;
  return base * GOLD_PURCHASE_MULT;
}

/**
 * Buy a building with gold (worship buildings with faith instead, as in
 * Civ 6). Unlike queueing, purchasing needs the district finished now.
 */
export function purchaseBuilding(state: GameState, cityId: number, buildingId: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
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
      if (!goldAffordable(buyer.faith, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
      buyer.faith -= cost;
    } else {
      const cost = buildingPurchaseCost(buildingId);
      if (!goldAffordable(buyer.treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
      buyer.treasury -= cost;
    }
  }
  city.buildings.push(buildingId);
  if (buildingId === 'ANCIENT_WALLS') city.outerHp = WALLS_HP; // AUDIT B-1
  return { ok: true };
}

/** Buy a unit with gold; it appears at the city center immediately. */
export function purchaseUnit(state: GameState, cityId: number, unitType: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  // TrainableUnits(state, seat, city) offers naval units ONLY when the city
  // is naval-capable (coastal center or completed Harbor) — the buy gate.
  if (!trainableUnits(state, seat, city).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const cost = unitPurchaseCost(state, unitType, seat);
  if (!state.sandbox) {
    if (!goldAffordable(buyer.treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    buyer.treasury -= cost;
  }
  const unit = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!unit) {
    if (!state.sandbox) buyer.treasury += cost; // refund: nowhere to stand
    return { ok: false, reason: 'No free tile near the city center.' };
  }
  // A purchased MILITARY unit starts with the city's
  // Encampment training XP (best military-building tier; civilians never fight).
  if ((UNITS[unitType]?.combat ?? 0) > 0) {
    const xp = encampmentTrainXp(city.buildings);
    if (xp > 0) unit.xp = xp;
  }
  if (unitType === 'BUILDER') buyer.buildersTrained += 1;
  return { ok: true };
}

/** Buy a settler with gold (cost scales like trained settlers). The unit
 * spawns at the buying city, which also pays the pop (real Civ 6). */
export function purchaseSettler(state: GameState, cityId: number, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!state.sandbox && city.population < 2) return { ok: false, reason: 'A city of 1 population cannot buy a settler.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const cost = settlerCost(state, seat) * GOLD_PURCHASE_MULT;
  if (!state.sandbox) {
    if (!goldAffordable(buyer.treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    buyer.treasury -= cost;
  }
  const unit = spawnUnit(state, 'SETTLER', city.centerIndex, seat);
  if (!unit) {
    if (!state.sandbox) buyer.treasury += cost; // refund: nowhere to stand
    return { ok: false, reason: 'No free tile near the city center.' };
  }
  // Purchased settlers cost the pop too (real Civ 6).
  city.population = Math.max(1, city.population - 1);
  return { ok: true };
}

/** Faith-buy this seat's WORSHIP building in the named city (#104 kind 4).
 * The building's identity is a RULE, not a choice: religion id == seat (the
 * B-18 convention), and each religion's worship building is fixed. City
 * gates: TEMPLE built, HOLY_SITE complete and unpillaged, building not
 * already present. Flat faith price (buildingFaithCost). */
export function buyWorshipBuilding(state: GameState, cityId: number, seat: number): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!buyer.religion.founded) return { ok: false, reason: 'No founded religion.' };
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const wid = WORSHIP_BUILDINGS[seat % WORSHIP_BUILDINGS.length];
  if (city.buildings.includes(wid) || !city.buildings.includes('TEMPLE')) {
    return { ok: false, reason: 'Needs a Temple, and no worship building yet.' };
  }
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  if (!ht?.districtComplete || ht.districtPillaged) {
    return { ok: false, reason: 'Needs a complete, unpillaged Holy Site.' };
  }
  const cost = buildingFaithCost(wid);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  buyer.faith = (buyer.faith ?? 0) - cost;
  city.buildings.push(wid);
  return { ok: true };
}

/** Faith-buy a MISSIONARY or APOSTLE at the named city (#104 kinds 5/6).
 * Gates: founded religion; live count under the unit's own cap; SHRINE
 * built and HOLY_SITE complete + unpillaged in that city. Missionaries
 * price at cost × the enhancer's missionaryCostMult (HOLY_ORDER ×0.7 → 42)
 * and SCRIPTURE ships +1 charge; apostles are flat (the mult is a
 * missionary discount — both engines agree, so a belief can never desync
 * the two prices). Spawn-refund: no free spot near the centre = no pay.
 * ONE religious unit per seat per turn is the CALLER's short-circuit. */
export function purchaseReligiousUnit(
  state: GameState,
  cityId: number,
  unitType: 'MISSIONARY' | 'APOSTLE',
  seat: number,
): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!buyer.religion.founded) return { ok: false, reason: 'No founded religion.' };
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cap = unitType === 'MISSIONARY' ? MISSIONARY_CAP : APOSTLE_CAP;
  const live = state.units.filter((u) => u.seat === seat && u.type === unitType).length;
  if (live >= cap) return { ok: false, reason: `${unitType} cap reached.` };
  const eb = buyer.religion.enhancer ? ENHANCER_BELIEFS[buyer.religion.enhancer]?.effects : undefined;
  const cost = unitType === 'MISSIONARY'
    ? Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1))
    : Math.round(UNITS.APOSTLE.cost);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  if (!city.buildings.includes('SHRINE')) return { ok: false, reason: 'Needs a Shrine.' };
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  if (!ht?.districtComplete || ht.districtPillaged) {
    return { ok: false, reason: 'Needs a complete, unpillaged Holy Site.' };
  }
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  if (unitType === 'MISSIONARY' && eb?.missionaryChargeBonus) u.charges = (u.charges ?? 0) + eb.missionaryChargeBonus;
  return { ok: true };
}

export function cancelQueueItem(state: GameState, cityId: number, index: number, seat: number): void {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
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
  if (item.kind === 'unit') return item.cost ?? UNITS[item.unit]?.cost ?? 54; // P4/D-10: builders lock at queue
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
  seat: number,
): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const slots = citySpecialistSlots(state, city);
  const max = slots.get(tileIndex) ?? 0;
  if (max === 0) return { ok: false, reason: 'That district has no specialist slots.' };
  const clamped = Math.max(0, Math.min(count, max));
  if (clamped === 0) delete city.specialists[String(tileIndex)];
  else city.specialists[String(tileIndex)] = clamped;
  return { ok: true };
}

// Exported — the CIV SEAT production add needs the same test, and a
// second copy of it in phase.ts is exactly how the two drift apart.
export function isEncampmentItem(item: QueueItem): boolean {
  if (item.kind === 'district') return item.district === 'ENCAMPMENT';
  if (item.kind !== 'building') return false;
  return BUILDINGS[item.building]?.district === 'ENCAMPMENT';
}

// ---------------------------------------------------------------------------
// Tiles, research, government actions
// ---------------------------------------------------------------------------

/** Gold price of a tile. Real Civ 6: ring-based base (50 for ring
 * ≤2, 75 for ring 3, +25/ring beyond as a scope extension), speed-scaled,
 * × (1 + 4·research progress), +5 (scaled) per tile EVER purchased
 * empire-wide — fully decoupled from the culture-growth counter. Without a
 * target tile (UI headline price) the ring-2 base is shown. */
/**
 * ONE tile-price text for every seat. The seat 0's and that seat's were
 * character-identical formulas over different planes — the seat's own
 * research fraction, its own purchase count, its own tilePurchaseMult
 * (LAND_SURVEYORS is a policy card, not the seat 0's alone). `owner` supplies
 * those three; callers that pass nothing get seat 0, which is what every
 * existing seat 0 call site meant.
 */
export function tilePurchaseCost(
  state: GameState,
  city: City | City,
  tileIndex?: number,
  owner?: { research: ResearchState; tilesPurchased?: number; mods: Modifiers },
): number {
  // The city's OWNER sets the price: its research, its purchase escalator,
  // its modifiers. `owner` is an override for callers that already have it.
  const os = seatOf(state, city.seat);
  const src = owner ?? {
    research: os!.research,
    tilesPurchased: os?.tilesPurchased,
    mods: getModifiers(state, city.seat),
  };
  const center = state.map.tiles[city.centerIndex];
  let ring = 2;
  if (tileIndex !== undefined) {
    const t = state.map.tiles[tileIndex];
    ring = Math.max(2, hexDistance(center.col, center.row, t.col, t.row));
  }
  const tPct = src.research.techs.length / Object.keys(TECHS).length;
  const cPct = src.research.civics.length / Object.keys(CIVICS).length;
  const base = Math.round((50 + 25 * (ring - 2)) * GAME_SPEED);
  const step = Math.round(5 * GAME_SPEED);
  return Math.round(
    (base * (1 + 4 * Math.max(tPct, cPct)) + step * (src.tilesPurchased ?? 0)) * src.mods.tilePurchaseMult,
  );
}

export function buyTile(state: GameState, cityId: number, tileIndex: number, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!borderCandidates(state, city).includes(tileIndex)) {
    return { ok: false, reason: 'Tile must be unowned and adjacent to this city’s territory (within 5 rings).' };
  }
  const cost = tilePurchaseCost(state, city, tileIndex);
  if (!state.sandbox) {
    if (!goldAffordable(buyer.treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    buyer.treasury -= cost;
  }
  // Purchases claim the tile but do NOT advance the culture-growth BOX
  // (real Civ 6 keeps the two schedules separate). They DO advance the
  // acquired COUNT — the next border tile costs more however this one was
  // gained — which is why the claim goes through acquireTile (#104: this
  // body used to hand-copy setTileOwner and silently skip tilesAcquired,
  // the exact drift acquireTile exists to prevent).
  acquireTile(state, city, tileIndex);
  buyer.tilesPurchased = (buyer.tilesPurchased ?? 0) + 1;
  return { ok: true };
}

export function setTechResearch(state: GameState, techId: string, seat: number): RuleResult {
  if (!availableTechs(state, seat).some((t) => t.id === techId)) {
    return { ok: false, reason: 'Tech not available (missing prerequisites or already researched).' };
  }
  commitResearch(state, seat, 'tech', techId);
  return { ok: true };
}

export function setCivicResearch(state: GameState, civicId: string, seat: number): RuleResult {
  if (!availableCivics(state, seat).some((c) => c.id === civicId)) {
    return { ok: false, reason: 'Civic not available (missing prerequisites or already researched).' };
  }
  commitResearch(state, seat, 'civic', civicId);
  return { ok: true };
}

export function setGovernment(state: GameState, governmentId: string, seat: number): RuleResult {
  const unlocks = computeUnlocks(state, seat);
  if (!state.sandbox && !unlocks.governments.has(governmentId)) {
    return { ok: false, reason: 'Government not unlocked yet.' };
  }
  const def = GOVERNMENTS[governmentId];
  if (!def) return { ok: false, reason: 'No such government.' };

  const oldCards = seatOf(state, seat)!.government.policies.filter((p): p is string => p !== null);
  seatOf(state, seat)!.government.current = governmentId;
  const slots = governmentSlots(state, seat); // includes wonder-granted extras
  seatOf(state, seat)!.government.policies = slots.map(() => null);
  // Re-seat old cards into compatible slots where possible.
  for (const cardId of oldCards) {
    const card = POLICIES[cardId];
    if (!card) continue;
    const slot = slots.findIndex(
      (kind, i) => seatOf(state, seat)!.government.policies[i] === null && cardFitsSlot(card, kind),
    );
    if (slot >= 0) seatOf(state, seat)!.government.policies[slot] = cardId;
  }
  return { ok: true };
}

export function setPolicy(state: GameState, slotIndex: number, policyId: string | null, seat: number): RuleResult {
  const govId = seatOf(state, seat)!.government.current;
  if (!govId) return { ok: false, reason: 'No government yet (research Code of Laws).' };
  const slots = governmentSlots(state, seat);
  if (slotIndex < 0 || slotIndex >= slots.length) return { ok: false, reason: 'No such slot.' };
  while (seatOf(state, seat)!.government.policies.length < slots.length) seatOf(state, seat)!.government.policies.push(null);
  if (policyId === null) {
    seatOf(state, seat)!.government.policies[slotIndex] = null;
    return { ok: true };
  }
  const card = POLICIES[policyId];
  if (!card) return { ok: false, reason: 'No such policy.' };
  const unlocks = computeUnlocks(state, seat);
  if (!state.sandbox && !unlocks.policies.has(policyId)) {
    return { ok: false, reason: 'Policy not unlocked yet.' };
  }
  if (!cardFitsSlot(card, slots[slotIndex])) {
    return { ok: false, reason: `${card.name} does not fit a ${slots[slotIndex]} slot.` };
  }
  if (seatOf(state, seat)!.government.policies.some((p, i) => p === policyId && i !== slotIndex)) {
    return { ok: false, reason: `${card.name} is already slotted.` };
  }
  seatOf(state, seat)!.government.policies[slotIndex] = policyId;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Turn loop
// ---------------------------------------------------------------------------



export function endTurn(state: GameState, seat: number): void {
  // Every seat's turn — boosts, upkeep, bankruptcy, economy, verbs — runs
  // through ONE body: `phase.ts:seatPhase` loops the seat roster, seat 0
  // included. Nothing here belongs to one seat; this function only holds
  // the GLOBAL schedule around that loop.
  if (state.unitsMode) {
    refreshUnits(state);
    barbarianPhase(state, seat);
  }
  if (state.disasters) disasterPhase(state);
  cityStatePhase(state, seat);
  seatPhase(state, seat);


  // THEOLOGICAL COMBAT, then the religious pressure spread — the fight first,
  // so the turn's spread reads the swing the fallen unit caused. Both run
  // after all foundings/settles/flips, so both engines scan the same final
  // city + holy-tile set.
  theologicalCombatPhase(state);
  spreadReligiousPressure(state);

  state.turn += 1;
  eraBoundary(state);
  // The WORLD CONGRESS convenes on the same post-increment turn
  // number the era boundary uses, so both engines fire it at one position.
  worldCongress(state); // B-24: era-score window reset at ERA_LENGTH multiples (GPU mirrors at its turn increment)
  // DEDICATION payouts — a Golden/Heroic age pays faith, a Dark or
  // Normal age pays era score (the climb-out dedication), both scaled by the
  // dedication COUNT so a Heroic age pays triple. Immediately after the
  // boundary so the GPU mirrors at the same position.
  applyDedications(state, (civ, amt) => {
    const sx = state.seats[civ];
    if (sx) sx.faith = (sx.faith ?? 0) + amt;
  });
  // Domination ends the game the instant a civ holds every capital;
  // otherwise the score victory fires at TURN_LIMIT. Detection only — no freeze
  // Detection is indicator-only, so with no domination this stays inert.
  const dom = dominationWinner(state);
  // A science victory/defeat (3/4) set during this turn's project
  // completions takes precedence over the domination/score recompute.
  const spaceWon = state.victoryType === 3 || state.victoryType === 4;
  // Religious victory — checked on the follow set the spread above just
  // flipped (real-time predominance, the domination pattern: live recompute,
  // no freeze). Precedence space > domination > religion > score; 5 = the
  // seat 0's religion wins, 6 = a seat religion wins (defeat).
  const rel = religiousVictor(state);
  // CULTURE victory, checked LAST of the real conditions —
  // precedence space > domination > religion > culture > score. 7 = the
  // seat 0 wins on tourism, 8 = a seat does (defeat).
  const cul = rel >= 0 ? -1 : cultureVictor(state);
  // DIPLOMATIC victory — 20 Diplomatic Victory Points, real
  // Civ 6's threshold. Checked LAST of the real conditions: precedence is
  // space > domination > religion > culture > DIPLOMATIC > score. 9 = the
  // seat 0 wins, 10 = a seat does (defeat).
  const dip = rel >= 0 || cul >= 0 ? -1 : diplomaticVictor(state);
  state.gameOver = spaceWon || dom >= 0 || rel >= 0 || cul >= 0 || dip >= 0 || state.turn > TURN_LIMIT;
  state.victoryType = spaceWon
    ? state.victoryType
    : dom >= 0
      ? 2
      : rel >= 0
        ? rel === 0
          ? 5
          : 6
        : cul >= 0
          ? cul === 0
            ? 7
            : 8
          : dip >= 0
            ? dip === 0
              ? 9
              : 10
            : state.gameOver
              ? 1
              : 0;
}

/**
 * The DIPLOMATIC victory — the first civ to reach
 * DIPLO_VICTORY_POINTS (20, real Civ 6's threshold) Diplomatic Victory Points.
 * Points come from winning World Congress resolutions (see `worldCongress`).
 * A civ with no cities cannot win. Ascending scan, so ties go to the lowest
 * unified civ id. Returns the winner's unified id, or -1.
 */
function diplomaticVictor(state: GameState): number {
  const alive = state.seats.map((sx) => sx.cities.length > 0);
  const pts = state.seats.map((sx) => sx.diplomaticPoints ?? 0);
  for (let c = 0; c < pts.length; c++) {
    if (alive[c] && pts[c] >= DIPLO_VICTORY_POINTS) return c;
  }
  return -1;
}

/**
 * The CULTURE victory. Real Civ 6 (Gathering Storm) counts two
 * populations — DOMESTIC tourists, which a civ attracts from its own lifetime
 * CULTURE, and VISITING tourists, which it attracts from other civs with its
 * lifetime TOURISM — and a civ wins the moment its visiting tourists exceed
 * EVERY other civ's domestic tourists.
 *
 * Both counts floor to whole tourists, so this is integer-exact and zero-draw.
 * The divisor carries the number of civs because tourism in real Civ 6 is
 * accrued per foreign civ; this engine banks ONE lifetime tourism figure per
 * civ, so the per-civ divisor is applied to the total instead — the same
 * threshold, without per-pair bookkeeping the engines do not have.
 *
 * Returns the winning unified civ id (0 seat 0, r+1 seat r), or -1. A civ
 * with NO cities cannot win (a dead civ attracts nobody); the ascending scan
 * breaks ties toward the lowest id, and the > comparison means two civs can
 * never both qualify against each other.
 */
function cultureVictor(state: GameState): number {
  const nCivs = 1 + state.seats.length - 1;
  const visitDiv = nCivs * TOURISM_PER_VISITOR_PER_CIV;
  const alive = state.seats.map((sx) => sx.cities.length > 0);
  const tourism = state.seats.map((sx) => sx.tourism ?? 0);
  const culture = state.seats.map((sx) => sx.cultureTotal ?? 0);
  // Milli-rounded before the floor: culture is a non-dyadic float accumulator,
  // so a sub-milli drift must not move a tourist count across engines (the
  // GS bankruptcy-test convention).
  const domestic = culture.map((c) => Math.floor(Math.round(c * 1000) / 1000 / CULTURE_PER_DOMESTIC_TOURIST));
  const visiting = tourism.map((t) => Math.floor(t / visitDiv));
  for (let c = 0; c < nCivs; c++) {
    if (!alive[c]) continue;
    let all = true;
    for (let o = 0; o < nCivs; o++) {
      if (o === c) continue;
      if (visiting[c] <= domestic[o]) {
        all = false;
        break;
      }
    }
    if (all) return c;
  }
  return -1;
}

/**
 * Religious victory (real Civ 6 predominance-in-every-civilization,
 * sized to modeled scope) — religion g wins when EVERY alive civ (the seat 0
 * if they hold ≥1 city, each seat with ≥1 city) has MORE THAN HALF of its
 * cities following g. At most one g can predominate in a given civ, so no
 * tie-break is needed beyond the ascending scan (lowest id first). Requires
 * g founded and at least one alive civ (no vacuous win over a dead world).
 * The GPU mirror sits at the identical endTurn position.
 */
function religiousVictor(state: GameState): number {
  const civs: City[][] = [];
  for (const sx of state.seats) if (sx.cities.length > 0) civs.push(sx.cities);
  if (civs.length === 0) return -1;
  const nRel = state.seats.length;
  for (let g = 0; g < nRel; g++) {
    const founded = !!state.seats[g]?.religion.founded;
    if (!founded) continue;
    let all = true;
    for (const cityState of civs) {
      const n = cityState.filter((c) => c.followedReligion === g).length;
      if (n * 2 <= cityState.length) {
        all = false;
        break;
      }
    }
    if (all) return g;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Great people
// ---------------------------------------------------------------------------




/**
 * religious pressure spread (deterministic, zero-RNG). Religions are
 * indexed in the unified civ space: 0 = the seat 0's, i+1 = seat i's. A
 * founded religion's HOLY tile (its capital center, frozen at founding) emits
 * pressure to every city (seat 0 + seat, symmetric) within
 * RELIGION_PRESSURE_RANGE tiles: +RELIGION_PRESSURE_PER_TURN integer pressure
 * to that city's accumulator for that religion, once per turn. A city then
 * FOLLOWS the religion with the most accumulated pressure (>0); ties resolve
 * to the lowest religion id — a founding-order proxy, since an earlier-founded
 * religion has spent more turns accumulating and so leads outright in the
 * common case, and the id tie-break only settles same-turn foundings.
 *
 * INERT this round: followedReligion/religionPressure are computed and
 * serialized but NOT yet read by the yield pipeline (the per-city follower-
 * belief coupling is the deferred follow-up — a deferred follow-up).
 * The GPU mirror is BatchSim._spread_religious_pressure. Integer pressure
 * keeps the argmax exact (no float association across the batch). Fresh City
 * objects (founded/flipped cities) carry no pressure — the reset-on-birth KILL
 * hygiene, mirrored on the GPU by zeroing dead/absent slots each turn.
 */
/**
 * THEOLOGICAL COMBAT — ONE pass, every seat, at one point in the schedule.
 *
 * Only an APOSTLE initiates (real Civ 6 also allows Inquisitors — out of
 * scope), and only against an ADJACENT religious unit of a DIFFERENT religion.
 * Both sides take THEO_BASE_DAMAGE plus the RELIGIOUS-STRENGTH difference
 * scaled by THEO_DAMAGE; a unit at 0 HP dies; the loser's religion sheds
 * THEO_PRESSURE_SWING in every city within THEO_PRESSURE_RANGE of the fallen
 * unit while the winner's gains it. DELIBERATELY ZERO-DRAW (see THEO_DAMAGE):
 * a conditional RNG draw here would have to be mirrored draw-for-draw on both
 * engines.
 *
 * ORDER is `state.units` ARRAY order for both the attacker walk and the
 * defender pick — this codebase's shared convention, which the GPU mirrors
 * with slot order (capture moves a unit to the END of both). An id tie-break
 * was the B-18 parity bug: after a capture an id no longer reflects array
 * position.
 *
 * WHY IT IS A PHASE AND NOT A VERB: the fight was never a choice — an apostle
 * standing next to an enemy apostle fought, before it could spread. It used to
 * live inside the SCRIPTED missionary walk, so it ran only for civ seats and
 * only while that seat was undriven (`if (!recU)`); when the wire took every
 * decision both engines' copies went inert together and the body was deleted
 * with the walker. Restored here as an eager RULE at ONE schedule position —
 * after every seat's turn, before the pressure spread reads the swing — so it
 * belongs to no seat and inherits no replay-position fork.
 */
function theologicalCombatPhase(state: GameState): void {
  const nRel = state.seats.length;
  const relStr = (u: Unit): number => UNITS[u.type]?.religiousStrength ?? 0;
  // The attacker walk snapshots the array: a death splices `state.units`, and
  // a live iteration would skip the unit that slid into the gap.
  for (const att of [...state.units]) {
    if (att.type !== 'APOSTLE' || att.hp <= 0) continue;
    if (!state.units.includes(att)) continue; // already fell this pass
    const at = state.map.tiles[att.tileIndex];
    const g = unitSeat(att);
    let def: Unit | null = null;
    for (const u of state.units) {
      if (relStr(u) <= 0) continue;
      if (unitSeat(u) === g) continue; // same religion — no contest
      const ut = state.map.tiles[u.tileIndex];
      if (hexDistance(at.col, at.row, ut.col, ut.row) !== 1) continue;
      def = u;
      break;
    }
    if (!def) continue;
    const atkStr = relStr(att);
    const defStr = relStr(def);
    def.hp -= Math.max(1, THEO_BASE_DAMAGE + THEO_DAMAGE * (atkStr - defStr));
    att.hp -= Math.max(1, THEO_BASE_DAMAGE + THEO_DAMAGE * (defStr - atkStr));
    att.movesLeft = 0;
    const loserRel = def.hp <= 0 ? unitSeat(def) : att.hp <= 0 ? g : -1;
    const winnerRel = def.hp <= 0 ? g : att.hp <= 0 ? unitSeat(def) : -1;
    if (winnerRel >= 0) {
      const dt = state.map.tiles[def.hp <= 0 ? def.tileIndex : att.tileIndex];
      for (const c of allCities(state)) {
        const ct = state.map.tiles[c.centerIndex];
        if (hexDistance(dt.col, dt.row, ct.col, ct.row) > THEO_PRESSURE_RANGE) continue;
        let pres = c.religionPressure;
        if (!pres || pres.length !== nRel) {
          pres = new Array(nRel).fill(0);
          c.religionPressure = pres;
        }
        pres[winnerRel] += THEO_PRESSURE_SWING;
        if (loserRel >= 0) pres[loserRel] = Math.max(0, pres[loserRel] - THEO_PRESSURE_SWING);
      }
    }
    // RELICS. Real Civ 6 creates one when an Apostle killed here carried the
    // MARTYR promotion; promotions are unmodeled and this routine is
    // zero-draw, so every dead APOSTLE martyrs — a recorded overstatement (see
    // the RELIC_* comment in data/greatPeople). A dead MISSIONARY yields
    // nothing. Granted in the SAME order as the two disbands below (defender
    // first, then attacker) so slot placement is order-exact across engines.
    if (def.hp <= 0 && def.type === 'APOSTLE') placeRelic(citiesOf(state, unitSeat(def)));
    if (att.hp <= 0) placeRelic(citiesOf(state, g)); // the attacker is always an APOSTLE
    if (def.hp <= 0) disbandUnit(state, def.id);
    if (att.hp <= 0) disbandUnit(state, att.id);
  }
}

function spreadReligiousPressure(state: GameState): void {
  const R = state.seats.length - 1;
  const nRel = 1 + R;
  const holy: number[] = new Array(nRel).fill(-1);
  // A religion is keyed by the seat that founded it, so its holy tile sits at
  // that seat's own index.
  for (const sx of state.seats) {
    const r = sx.religion;
    if (r.founded && r.holyTile != null && r.holyTile >= 0) holy[sx.seat] = r.holyTile;
  }
  if (!holy.some((h) => h >= 0)) return; // no religion exists yet — nothing to spread
  // Per-religion range — the base radius plus the
  // religion's enhancer pressureRangeBonus (0 when unenhanced).
  const range: number[] = new Array(nRel).fill(RELIGION_PRESSURE_RANGE);
  for (const sx of state.seats) {
    const eb = sx.religion.enhancer;
    if (eb) range[sx.seat] += ENHANCER_BELIEFS[eb]?.effects.pressureRangeBonus ?? 0;
  }

  const tiles = state.map.tiles;
  const cities = allCities(state) as City[];
  for (const city of cities) {
    let pres = city.religionPressure;
    if (!pres || pres.length !== nRel) {
      pres = new Array(nRel).fill(0);
      city.religionPressure = pres;
    }
    const cc = tiles[city.centerIndex];
    for (let g = 0; g < nRel; g++) {
      if (holy[g] < 0) continue;
      const h = tiles[holy[g]];
      if (hexDistance(cc.col, cc.row, h.col, h.row) <= range[g]) {
        pres[g] += RELIGION_PRESSURE_PER_TURN;
      }
    }
    // Flip: the religion with the most pressure (>0); strict `>` iterating g
    // ascending keeps the LOWEST id on a tie.
    let best = -1;
    let bestP = 0;
    for (let g = 0; g < nRel; g++) {
      if (pres[g] > bestP) {
        bestP = pres[g];
        best = g;
      }
    }
    // EXODUS OF THE EVANGELISTS pays era score each time a city
    // CONVERTS to a civ's religion — the religion's OWNER earns it.
    const wasFollowed = city.followedReligion ?? -1;
    city.followedReligion = best >= 0 ? best : null;
    if (best >= 0 && best !== wasFollowed) dedicationEvent(state, best, DED_EXODUS);
  }
}


export function toggleLockedTile(state: GameState, cityId: number, tileIndex: number, seat: number): void {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
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
  state.seats ??= [];
  if (state.seats.length === 0) state.seats.push(emptySeat(0));
  // Every seat gets its defaults; an older save is missing them everywhere,
  // not just on the seat that happened to be the seat 0.
  for (const sx of state.seats) {
    sx.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] };
    sx.research.boosted ??= [];
    sx.government ??= { current: null, policies: [] };
    sx.religion ??= { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null };
    sx.religion.enhancer ??= null;
    sx.buildersTrained ??= 0;
    sx.tilesPurchased ??= 0;
    // Seed the melee tracker from the standing army an older save carries.
    sx.bestMeleeCS ??= Math.max(
      0,
      ...state.units
        .filter((u) => u.seat === sx.seat && !UNITS[u.type]?.ranged)
        .map((u) => UNITS[u.type]?.combat ?? 0),
    );
  }
  state.claimedGreatPeople ??= [];
  for (const t of state.map.tiles as (Tile & { wonder?: string | null })[]) {
    t.wonder ??= null;
    t.builtWonder ??= null;
    t.builtWonderComplete ??= false;
  }
  // Routes live on the owning seat now; a legacy save kept seat 0's on the
  // GameState — fold them in (and drop the dead key so serialize round-trips).
  const legacyRoutes = (state as unknown as { tradeRoutes?: Seat['tradeRoutes'] }).tradeRoutes;
  if (legacyRoutes?.length && !state.seats[0]?.tradeRoutes?.length && state.seats[0]) {
    state.seats[0].tradeRoutes = legacyRoutes;
  }
  delete (state as unknown as { tradeRoutes?: unknown }).tradeRoutes;
  state.unitsMode ??= false;
  state.units ??= [];
  state.nextUnitId ??= 0;
  state.rngState ??= (state.map.seed ^ 0x9e3779b9) >>> 0;
  // Saves written before the minor/hostile seats existed carry
  // neither, and `seatOf` is TOTAL now — an older save must not make it lie.
  // Such a save keeps its camps too — they were `state.barbCamps`,
  // which is the barbarian seat's `camps` now. Read the legacy field BEFORE
  // building the seat: `emptySeat` already puts an EMPTY ARRAY there, and `[]`
  // is not nullish, so a `??=` afterwards would silently drop every camp.
  const legacyCamps = (state as unknown as { barbCamps?: number[] }).barbCamps;
  state.barbSeat ??= { ...emptySeat(BARB_SEAT), camps: legacyCamps ?? [] };
  state.barbSeat.camps ??= legacyCamps ?? [];
  for (const cityState of state.cityStates ?? []) Object.assign(cityState, { ...emptySeat(seatOfCityState(cityState.id)), ...cityState });
  // Per-pair diplomacy is ONE store per seat; every reader indexes these
  // without a guard, so a hand-built state gets empty defaults. (The
  // pre-seat legacy translation is gone — nothing can write that format.)
  for (const s of allSeats(state)) {
    s.wars ??= [];
    s.formalWars ??= [];
    s.allies ??= [];
    s.denounced ??= {};
  }
  // The war store is symmetric; repair one-sided entries.
  for (const s of allSeats(state)) {
    for (const other of s.wars) {
      const os = seatOf(state, other);
      if (os && !os.wars.includes(s.seat)) os.wars.push(s.seat);
    }
  }
  state.disasters ??= false;
  // gameOver is recomputed every endTurn (turn > TURN_LIMIT); no migration
  // needed, and adding ??= would break serialize round-trip idempotence for
  // states that never ran a turn (fresh makeState has it undefined).
  state.fogOfWar ??= false;
  for (const s of allSeats(state)) s.explored ??= [];
  state.eventLog ??= [];
  state.cityStates ??= [];
  for (const sx of state.seats) {
    sx.influencePoints ??= 0;
    sx.envoysAvailable ??= 0;
  }
  state.seats ??= []; // #51/S1.3j: seats IS the actor storage now
  // Foreign cities became full City objects; older saves carry the
  // scalar shape (growthBox, no queue/districts/…). Fill ONLY the missing
  // fields in place — a current-shape save must round-trip byte-identically
  // (the seat determinism test serializes and compares).
  for (const r of state.seats) {
    r.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] };
    r.treasury ??= 0; // VP-G1
    for (const civCity of r.cities as (City & { growthBox?: number })[]) {
      civCity.seat ??= r.seat;
      civCity.foodBox ??= civCity.growthBox ?? 0;
      delete civCity.growthBox;
      civCity.cultureBox ??= 0;
      civCity.lockedTiles ??= [];
      civCity.focus ??= 'balanced';
      civCity.queue ??= [];
      civCity.isCapital ??= false;
      civCity.buildings ??= [];
      civCity.districts ??= [{ type: 'CITY_CENTER', tileIndex: civCity.centerIndex }];
      civCity.wonders ??= [];
      civCity.specialists ??= {};
    }
  }
  state.claimedPantheons ??= [];
  state.claimedBeliefs ??= [];
  state.claimedEnhancers ??= []; // B-18
  for (const u of state.units) {
    u.seat ??= 0; // old saves predate the seat field
    u.hp ??= 100;
    // FORTIFY: fill only MILITARY units in place (civilians never carry
    // the field) so a current-shape save round-trips byte-identically.
    if (UNITS[u.type]?.charges === undefined) u.fortifyTurns ??= 0;
  }
  for (const t of state.map.tiles) {
    (t as Tile).pillaged ??= false;
    (t as Tile).districtPillaged ??= false;
    (t as Tile).goodyHut ??= false;
    (t as Tile).volcano ??= false;
    (t as Tile).fertility ??= 0;
    (t as Tile).droughtTurns ??= 0;
  }
  for (const c of allCities(state)) {
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

export function canChoosePantheon(state: GameState, seat: number): RuleResult {
  if (seatOf(state, seat)!.religion.pantheon) return { ok: false, reason: 'Pantheon already chosen.' };
  if (!state.sandbox && seatOf(state, seat)!.faith < PANTHEON_FAITH_COST) {
    return { ok: false, reason: `Needs ${PANTHEON_FAITH_COST} faith (${Math.floor(seatOf(state, seat)!.faith)} banked).` };
  }
  return { ok: true };
}

export function choosePantheon(state: GameState, beliefId: string, seat: number): RuleResult {
  const check = canChoosePantheon(state, seat);
  if (!check.ok) return check;
  if (!PANTHEONS[beliefId]) return { ok: false, reason: 'No such pantheon belief.' };
  if (state.claimedPantheons.includes(beliefId)) {
    return { ok: false, reason: 'Another civilization already follows that pantheon.' };
  }
  if (!state.sandbox) seatOf(state, seat)!.faith -= PANTHEON_FAITH_COST;
  seatOf(state, seat)!.religion.pantheon = beliefId;
  state.claimedPantheons.push(beliefId); // every claim path pushes what it takes — the pool IS the exclusion
  addEraScore(state, seat, ERA_SCORE_PANTHEON); // B-24: seat 0 verb — gate-unreachable, TS-only (actor hook mirrors)
  return { ok: true };
}

export function canFoundReligion(state: GameState, seat: number): RuleResult {
  if (seatOf(state, seat)!.religion.founded) return { ok: false, reason: 'Religion already founded.' };
  if (!seatOf(state, seat)!.religion.pantheon) return { ok: false, reason: 'Choose a pantheon first.' };
  const hasHolySite = seatOf(state, seat)!.cities.some((c) =>
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
  seat: number,
): RuleResult {
  const check = canFoundReligion(state, seat);
  if (!check.ok) return check;
  if (!FOLLOWER_BELIEFS[choice.follower]) return { ok: false, reason: 'No such follower belief.' };
  if (!FOUNDER_BELIEFS[choice.founder]) return { ok: false, reason: 'No such founder belief.' };
  if (!WORSHIP_BUILDINGS.includes(choice.worship)) return { ok: false, reason: 'No such worship building.' };
  if (state.claimedBeliefs.includes(choice.follower) || state.claimedBeliefs.includes(choice.founder)) {
    return { ok: false, reason: 'Another religion already claimed that belief.' };
  }
  seatOf(state, seat)!.religion.founded = true;
  addEraScore(state, seat, ERA_SCORE_RELIGION);
  seatOf(state, seat)!.religion.name = choice.name || RELIGION_NAMES[0];
  seatOf(state, seat)!.religion.follower = choice.follower;
  seatOf(state, seat)!.religion.founder = choice.founder;
  state.claimedBeliefs.push(choice.follower, choice.founder); // pushed like the eager race's picks
  seatOf(state, seat)!.religion.worship = choice.worship;
  // Freeze the holy tile (the capital's center) — the pressure source.
  seatOf(state, seat)!.religion.holyTile = (seatOf(state, seat)!.cities.find((c) => c.isCapital) ?? seatOf(state, seat)!.cities[0])?.centerIndex ?? null;
  return { ok: true };
}

/** can the seat 0 enhance its religion (add the Enhancer belief)? Real
 * Civ 6 spends a second Great Prophet — modeled here as a SECOND earned
 * Prophet-class great person (the first funds founding). */
export function canEnhanceReligion(state: GameState, seat: number): RuleResult {
  if (!seatOf(state, seat)!.religion.founded) return { ok: false, reason: 'Found a religion first.' };
  if (seatOf(state, seat)!.religion.enhancer) return { ok: false, reason: 'Religion already enhanced.' };
  if (!state.sandbox && greatPeopleEarned(state, 'PROPHET') < 2) {
    return { ok: false, reason: 'Needs a second Great Prophet to enhance.' };
  }
  return { ok: true };
}

/** add an Enhancer belief to the seat 0's founded religion. Effects are
 * inert this round (they need religious pressure / missionary / combat systems
 * that do not exist yet); the slot and claim are real and mirror the
 * follower/founder claimed-pool exclusion. */
export function enhanceReligion(state: GameState, beliefId: string, seat: number): RuleResult {
  const check = canEnhanceReligion(state, seat);
  if (!check.ok) return check;
  if (!ENHANCER_BELIEFS[beliefId]) return { ok: false, reason: 'No such enhancer belief.' };
  state.claimedEnhancers ??= [];
  if (state.claimedEnhancers.includes(beliefId)) {
    return { ok: false, reason: 'Another religion already claimed that enhancer.' };
  }
  seatOf(state, seat)!.religion.enhancer = beliefId;
  state.claimedEnhancers.push(beliefId);
  return { ok: true };
}
