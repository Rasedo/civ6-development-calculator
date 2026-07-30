/**
 * Game state lifecycle: creation, player actions (found city, improve,
 * place districts/buildings, buy tiles, pick research, run government),
 * the end-of-turn loop, and serialization.
 */

import type { City, DistrictId, GameState, GreatPersonClass, ImprovementId, MapGenOptions, QueueItem, ResearchState, Tile, RivalCity, Unit } from './types';
import { generateMap } from './mapgen';
import { tilesWithin, hexDistance } from './hex';
import { computeCityStats, luxuryAmenities, borderCandidates, pickBorderTile, acquireTile, citySpecialistSlots, playerTourism } from './city';
import { canFoundCity, canPlaceDistrict, canPlaceWonder, validImprovements, canRemoveFeature, availableBuildings, buildingCompletable, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, availableTechs, availableCivics, governmentSlots, computeAdoption } from './effects';
import { detectBoosts, effectiveResearchCostIn } from './boosts';
import { spawnUnit, refreshUnits, unitMaintenance, trainableUnits, disbandUnit, builderCost } from './units';
import { barbarianPhase, encampmentTrainXp } from './combat';
import { revealAround } from './fog';
import { disasterPhase } from './disasters';
import { placeCityStates, cityStatePhase } from './cityStates';
import { placeRivals, rivalPhase, applyLoyalty, flipCityToRival, diploFavorPerTurn, playerSuzerainCount, worldCongress } from './rivals';
import { expirePlayerRoutes } from './trade';
import { WAR_WEARINESS_PER_TURN, WAR_WEARINESS_DECAY, WAR_WEARINESS_CAP, ERA_SCORE_FOUND, ERA_SCORE_WONDER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, ERA_SCORE_GP, GOVERNOR_LOYALTY, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, DIPLO_VICTORY_POINTS, DED_MONUMENTALITY, DED_EXODUS } from '../data/rivals';
import { addEraScore, eraBoundary, applyDedications, dedicationEvent, governorPicks, governorTitles, goldenBoostBonus, goldenProphetPoints } from './eras';
import { UNITS, WALLS_HP, ENCAMPMENT_HP, CITY_MAX_HP } from '../data/units';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { GP_CLASSES, GP_CLASS_DISTRICT, GREAT_PEOPLE, gpCost, GW_WORK_CLASSES, GW_CLASS_KIND, placeGreatWorks, GW_WONDER_SLOTS } from '../data/greatPeople';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot, GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, WORSHIP_BUILDINGS, RELIGION_NAMES, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, RELIGION_PRESSURE_PER_TURN } from '../data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, gpClassesOf, gppFractionOf, type ProjectDef } from '../data/projects';
import { CITY_NAMES, borderGrowthCost, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, GAME_SPEED } from '../data/constants';
import { applyLumpYield } from './economy';
import { tileClaimed, civOfRival, allCities, playerSeat, isPlayerSeat, PLAYER_CIV, setTileOwner } from './seats';

/** GV-2: the game is over once this many turns are played (score victory at
 * the limit; domination can end it earlier). Config for the horizon. */
export const TURN_LIMIT = 250;

/** Eureka/inspiration discount applied to a research cost. */
export function effectiveResearchCost(state: GameState, id: string, baseCost: number): number {
  // B-24 (#79): a GOLDEN Free Inquiry / Pen-Brush-and-Voice deepens the boost.
  return effectiveResearchCostIn(playerSeat(state).research, id, baseCost, goldenBoostBonus(state, 0, !TECHS[id]));
}

/**
 * Districts get pricier as the game advances (Civ 6 scales with overall
 * research progress). Cost is locked in when the district is queued.
 */
export function districtCostIn(research: ResearchState): number {
  // P4/D-8: the real Civ 6 curve — floor(54·(1 + 9·max(tech%, civic%)))
  // (the tree you are FURTHER through drives the price, not the average;
  // the 25% under-represented-district discount stays unmodeled — AUDIT).
  // P4/D-15: the 54 base speed-scales like every other production cost.
  const tPct = research.techs.length / Object.keys(TECHS).length;
  const cPct = research.civics.length / Object.keys(CIVICS).length;
  return Math.floor(Math.round(54 * GAME_SPEED) * (1 + 9 * Math.max(tPct, cPct)));
}

/** P4/D-8: the GS district discount — 40% off a specialty type while the civ
 * has PLACED fewer of it than its per-unlocked-type average of COMPLETED
 * specialty districts: n < ceil(D/U), gated on D ≥ U (civfanatics 27783). */
export function districtDiscounted(state: GameState, type: DistrictId): boolean {
  if (!DISTRICTS[type]?.countsTowardLimit) return false;
  const unlocks = computeUnlocks(state);
  const U = [...unlocks.districts].filter((d) => DISTRICTS[d as DistrictId]?.countsTowardLimit).length;
  if (U === 0) return false;
  let D = 0;
  let n = 0;
  for (const c of state.cities) {
    for (const d of c.districts) {
      if (!DISTRICTS[d.type]?.countsTowardLimit) continue;
      if (state.map.tiles[d.tileIndex].districtComplete) D += 1;
      if (d.type === type) n += 1;
    }
  }
  return D >= U && n < Math.ceil(D / U);
}

export function districtCost(state: GameState, type?: DistrictId): number {
  const base = districtCostIn(playerSeat(state).research);
  return type !== undefined && districtDiscounted(state, type) ? Math.floor(base * 0.6) : base;
}

export function createGame(
  opts: MapGenOptions & {
    sandbox?: boolean;
    unitsMode?: boolean;
    cityStates?: boolean | number;
    rivals?: boolean | number;
  },
): GameState {
  const state = createGameFromMap(generateMap(opts), opts.sandbox ?? false, opts.unitsMode ?? false);
  if (opts.cityStates) {
    placeCityStates(state, typeof opts.cityStates === 'number' ? opts.cityStates : undefined);
  }
  if (opts.rivals) {
    placeRivals(state, typeof opts.rivals === 'number' ? opts.rivals : undefined);
  }
  return state;
}

/** Fresh game state around an existing map (e.g. one imported from Civ 6). */
export function createGameFromMap(map: GameState['map'], sandbox = false, unitsMode = false): GameState {
  return {
    map,
    cities: [],
    nextCityId: 0,
    turn: 1,
    sandbox,
    claimedGreatPeople: [],
    tradeRoutes: [],
    settlers: 0,
    buildersTrained: 0, // P4/D-10
    bestMeleeCS: 0, // P4/D-22
    tilesPurchased: 0, // P4/D-17
    plannedSettles: [],
    unitsMode,
    units: [],
    nextUnitId: 0,
    rngState: (map.seed ^ 0x9e3779b9) >>> 0,
    barbCamps: [],
    disasters: false,
    gameOver: false, // GV-2
    victoryType: 0, // GV-4/GV-3
    spaceProjects: [], // B-25
    capitalTiles: [], // GV-3
    fogOfWar: false,
    explored: [],
    eventLog: [],
    cityStates: [],
    // #51/S1.2: the player is seat 0 and holds the SAME shape a rival does.
    // Rival seats are appended by the rival factory (they are the same objects
    // as `rivals[]` while the field-by-field migration proceeds).
    seats: [{ seat: 0, warmonger: 0, warWeariness: 0, diploFavor: 0, diploPoints: 0, influencePoints: 0, envoysAvailable: 0, treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0, research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] }, government: { current: null, policies: [] }, religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, gpp: {}, gpEarned: [] }],
    rivals: [],
    claimedPantheons: [],
    claimedBeliefs: [],
    claimedEnhancers: [],
  };
}

/** Civ 6-ish settler cost, rising with every city, trained settler and queued
 * one. P4/D-15: the real 80 + 30·n, speed-scaled like unit costs → 48 + 18·n. */
export function settlerCost(state: GameState): number {
  const queued = state.cities.reduce(
    (n, c) => n + c.queue.filter((q) => q.kind === 'settler').length,
    0,
  );
  return (
    Math.round(80 * GAME_SPEED) +
    Math.round(30 * GAME_SPEED) * Math.max(0, state.cities.length - 1 + state.settlers + queued)
  );
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
    seat: PLAYER_CIV, // #51/S1.3d: a player city says so explicitly
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
    hp: CITY_MAX_HP,
  };

  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;

  // Civ 6: a new city starts with its center plus the first ring only;
  // everything beyond comes from culture growth or tile purchase.
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (!tileClaimed(t)) setTileOwner(t, PLAYER_CIV, id);
  }
  setTileOwner(tile, PLAYER_CIV, id);
  revealAround(state, tileIndex, 3);

  state.cities.push(city);
  addEraScore(state, 0, ERA_SCORE_FOUND); // B-24: founded a city (t0 capital included — exported with the fixture)
  // GV-3: the player's capital tile (civ 0), static once founded.
  if (city.isCapital) {
    if (!state.capitalTiles) state.capitalTiles = [];
    state.capitalTiles[0] = tileIndex;
  }
  return { ok: true, city };
}

/**
 * GV-3 domination: the civ that holds EVERY original capital (its own plus
 * every rival's, by capture), else -1. Capitals are loyalty-immune, so a
 * capital tile only changes hands by capture — `capitalTiles` is static and
 * we read who currently has a city centered on each. A razed capital (no
 * city there) makes domination impossible, so we return -1.
 */
export function dominationWinner(state: GameState): number {
  const nRivals = state.rivals?.length ?? 0;
  if (nRivals === 0) return -1; // nothing to conquer — a solo game never dominates
  const caps = state.capitalTiles;
  const expected = 1 + nRivals;
  if (!caps || caps.filter((t) => t !== undefined).length < expected) return -1;
  const ownerOf = (ct: number): number => {
    if (state.cities.some((c) => c.centerIndex === ct)) return 0;
    for (let r = 0; r < state.rivals.length; r++) {
      if (state.rivals[r].cities.some((rc) => rc.centerIndex === ct)) return r + 1;
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
  // B-17 (#71): sandbox completes instantly, so the garrison musters here too.
  if (state.sandbox && type === 'ENCAMPMENT') tile.encampHp = ENCAMPMENT_HP;
  tile.improvement = null;
  tile.feature = null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  // P4/D-8: price BEFORE registering the placement (the discount reads the
  // pre-placement counts — "value C changes the moment you place").
  const cost = districtCost(state, type);
  city.districts.push({ type, tileIndex });
  if (!state.sandbox) {
    city.queue.push({ kind: 'district', district: type, tileIndex, progress: 0, cost });
  }
  return { ok: true };
}

export function queueBuilding(state: GameState, cityId: number, buildingId: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  // P4/D-21 (real Civ 6): worship buildings are faith-purchase ONLY — they
  // never enter the production queue (purchaseBuilding faith-prices them).
  if (BUILDINGS[buildingId]?.worship) {
    return { ok: false, reason: 'Worship buildings are purchased with faith, not built.' };
  }
  if (state.sandbox) {
    city.buildings.push(buildingId);
    if (buildingId === 'ANCIENT_WALLS') city.outerHp = WALLS_HP; // AUDIT B-1
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

/** Project production cost, scaling with research progress like districts.
 * P4/D-15: the floor speed-scales with everything else (15 → 9). */
export function projectCost(state: GameState): number {
  return Math.max(Math.round(15 * GAME_SPEED), Math.round(districtCost(state) * 0.5));
}

/** Projects this city can run (needs the matching completed district). B-25:
 * space-race projects additionally require their gating tech, the previous
 * chain step already completed by this empire, and are one-time (not repeated). */
export function availableProjects(state: GameState, city: City): ProjectDef[] {
  const done = state.spaceProjects ?? [];
  return Object.values(PROJECTS).filter((p) => {
    if (!city.districts.some((d) => d.type === p.district && state.map.tiles[d.tileIndex].districtComplete)) {
      return false;
    }
    if (!p.space) return true;
    if (done.includes(p.id)) return false; // one-time
    if (p.requiresTech && !playerSeat(state).research.techs.includes(p.requiresTech)) return false;
    if (p.requiresProject && !done.includes(p.requiresProject)) return false;
    return true;
  });
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
  // B-25: space-race step — record chain progress; the final step wins.
  if (def.space) {
    if (!state.spaceProjects) state.spaceProjects = [];
    if (!state.spaceProjects.includes(projectId)) state.spaceProjects.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    if (def.victory) {
      state.victoryType = 3; // GV/B-25 science victory (player)
      state.gameOver = true;
      state.eventLog.push('Science Victory! The Exoplanet Expedition has launched.');
    }
    return;
  }
  if (def.yield) {
    const amount = Math.round(cost * PROJECT_YIELD_FRACTION);
    applyLumpYield(state, city.centerIndex, { key: def.yield, amount });
    state.eventLog.push(`${city.name} completed ${def.name}: +${amount} ${def.yield}.`);
  }
  // #79: pay EVERY class the project lists (the Festival pays three), each at
  // the project's own rate. Single-class projects are unchanged in shape.
  const classes = gpClassesOf(def);
  if (classes.length) {
    const pts = Math.round(cost * gppFractionOf(def));
    for (const gc of classes) {
      playerSeat(state).gpp[gc] = (playerSeat(state).gpp[gc] ?? 0) + pts;
    }
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

/** Gold price to buy a building outright (Civ 6's 4× production cost). */
export function buildingPurchaseCost(buildingId: string): number {
  return (BUILDINGS[buildingId]?.cost ?? 0) * GOLD_PURCHASE_MULT;
}

/** Faith price of a worship building. P4/D-21: real Civ 6 charges a FLAT
 * 190 faith for worship buildings (speed-scaled like every other cost);
 * anything else keeps the production×mult schedule. */
export function buildingFaithCost(buildingId: string): number {
  if (BUILDINGS[buildingId]?.worship) return Math.round(190 * GAME_SPEED);
  return (BUILDINGS[buildingId]?.cost ?? 0) * FAITH_PURCHASE_MULT;
}

/** GS: gold/faith thresholds compare at MILLI precision — the treasury
 * accumulates non-dyadic 0.05-unit gold whose sub-milli drift differs
 * between the engines (BLAS association), so a raw `treasury < cost` splits
 * at invisible knife-edges (P5-S7 hunt: seed 9261 t228 — a 72.000-milli
 * treasury vs a 72-gold scout purchase went opposite ways). */
export function goldAffordable(treasury: number, cost: number): boolean {
  return Math.round(treasury * 1000) >= Math.round(cost * 1000);
}

export function unitPurchaseCost(state: GameState, unitType: string): number {
  // P4/D-10: builders price off the live escalator, like the settler pair.
  const base = unitType === 'BUILDER' ? builderCost(state) : UNITS[unitType]?.cost ?? 0;
  return base * GOLD_PURCHASE_MULT;
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
      if (!goldAffordable(playerSeat(state).faith, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
      playerSeat(state).faith -= cost;
    } else {
      const cost = buildingPurchaseCost(buildingId);
      if (!goldAffordable(playerSeat(state).treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
      playerSeat(state).treasury -= cost;
    }
  }
  city.buildings.push(buildingId);
  if (buildingId === 'ANCIENT_WALLS') city.outerHp = WALLS_HP; // AUDIT B-1
  return { ok: true };
}

/** Buy a unit with gold; it appears at the city center immediately. */
export function purchaseUnit(state: GameState, cityId: number, unitType: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  // #45/B-6: trainableUnits(state, city) offers naval units ONLY when the city
  // is naval-capable (coastal center or completed Harbor) — the buy gate.
  if (!trainableUnits(state, city).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const cost = unitPurchaseCost(state, unitType);
  if (!state.sandbox) {
    if (!goldAffordable(playerSeat(state).treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    playerSeat(state).treasury -= cost;
  }
  const unit = spawnUnit(state, unitType, city.centerIndex);
  if (!unit) {
    if (!state.sandbox) playerSeat(state).treasury += cost; // refund: nowhere to stand
    return { ok: false, reason: 'No free tile near the city center.' };
  }
  // B-17 (ROUND B7): a purchased MILITARY unit starts with the city's
  // Encampment training XP (best military-building tier; civilians never fight).
  if ((UNITS[unitType]?.combat ?? 0) > 0) {
    const xp = encampmentTrainXp(city.buildings);
    if (xp > 0) unit.xp = xp;
  }
  if (unitType === 'BUILDER') state.buildersTrained += 1; // P4/D-10
  return { ok: true };
}

/** Buy a settler with gold (cost scales like trained settlers). */
export function purchaseSettler(state: GameState, cityId: number): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cost = settlerCost(state) * GOLD_PURCHASE_MULT;
  if (!state.sandbox) {
    if (!goldAffordable(playerSeat(state).treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    playerSeat(state).treasury -= cost;
  }
  state.settlers += 1;
  // P4/D-6: purchased settlers cost the pop too (real Civ 6).
  city.population = Math.max(1, city.population - 1);
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

/** Gold price of a tile. P4/D-17 (real Civ 6): ring-based base (50 for ring
 * ≤2, 75 for ring 3, +25/ring beyond as a scope extension), speed-scaled,
 * × (1 + 4·research progress), +5 (scaled) per tile EVER purchased
 * empire-wide — fully decoupled from the culture-growth counter. Without a
 * target tile (UI headline price) the ring-2 base is shown. */
export function tilePurchaseCost(state: GameState, city: City, tileIndex?: number): number {
  const mods = getModifiers(state);
  const center = state.map.tiles[city.centerIndex];
  let ring = 2;
  if (tileIndex !== undefined) {
    const t = state.map.tiles[tileIndex];
    ring = Math.max(2, hexDistance(center.col, center.row, t.col, t.row));
  }
  const tPct = playerSeat(state).research.techs.length / Object.keys(TECHS).length;
  const cPct = playerSeat(state).research.civics.length / Object.keys(CIVICS).length;
  const base = Math.round((50 + 25 * (ring - 2)) * GAME_SPEED);
  const step = Math.round(5 * GAME_SPEED);
  return Math.round(
    (base * (1 + 4 * Math.max(tPct, cPct)) + step * (state.tilesPurchased ?? 0)) *
      mods.tilePurchaseMult,
  );
}

export function buyTile(state: GameState, cityId: number, tileIndex: number): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!borderCandidates(state, city).includes(tileIndex)) {
    return { ok: false, reason: 'Tile must be unowned and adjacent to this city’s territory (within 5 rings).' };
  }
  const cost = tilePurchaseCost(state, city, tileIndex);
  if (!state.sandbox) {
    if (!goldAffordable(playerSeat(state).treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    playerSeat(state).treasury -= cost;
  }
  // P4/D-17: purchases claim the tile but do NOT advance the culture-growth
  // counter (real Civ 6 keeps the two schedules separate).
  setTileOwner(state.map.tiles[tileIndex], city.seat, city.id);
  revealAround(state, tileIndex, 1);
  state.tilesPurchased = (state.tilesPurchased ?? 0) + 1;
  return { ok: true };
}

export function setTechResearch(state: GameState, techId: string): RuleResult {
  if (!availableTechs(state).some((t) => t.id === techId)) {
    return { ok: false, reason: 'Tech not available (missing prerequisites or already researched).' };
  }
  playerSeat(state).research.tech = techId;
  return { ok: true };
}

export function setCivicResearch(state: GameState, civicId: string): RuleResult {
  if (!availableCivics(state).some((c) => c.id === civicId)) {
    return { ok: false, reason: 'Civic not available (missing prerequisites or already researched).' };
  }
  playerSeat(state).research.civic = civicId;
  return { ok: true };
}

export function setGovernment(state: GameState, governmentId: string): RuleResult {
  const unlocks = computeUnlocks(state);
  if (!state.sandbox && !unlocks.governments.has(governmentId)) {
    return { ok: false, reason: 'Government not unlocked yet.' };
  }
  const def = GOVERNMENTS[governmentId];
  if (!def) return { ok: false, reason: 'No such government.' };

  const oldCards = playerSeat(state).government.policies.filter((p): p is string => p !== null);
  playerSeat(state).government.current = governmentId;
  const slots = governmentSlots(state); // includes wonder-granted extras
  playerSeat(state).government.policies = slots.map(() => null);
  // Re-seat old cards into compatible slots where possible.
  for (const cardId of oldCards) {
    const card = POLICIES[cardId];
    if (!card) continue;
    const slot = slots.findIndex(
      (kind, i) => playerSeat(state).government.policies[i] === null && cardFitsSlot(card, kind),
    );
    if (slot >= 0) playerSeat(state).government.policies[slot] = cardId;
  }
  return { ok: true };
}

export function setPolicy(state: GameState, slotIndex: number, policyId: string | null): RuleResult {
  const govId = playerSeat(state).government.current;
  if (!govId) return { ok: false, reason: 'No government yet (research Code of Laws).' };
  const slots = governmentSlots(state);
  if (slotIndex < 0 || slotIndex >= slots.length) return { ok: false, reason: 'No such slot.' };
  while (playerSeat(state).government.policies.length < slots.length) playerSeat(state).government.policies.push(null);
  if (policyId === null) {
    playerSeat(state).government.policies[slotIndex] = null;
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
  if (playerSeat(state).government.policies.some((p, i) => p === policyId && i !== slotIndex)) {
    return { ok: false, reason: `${card.name} is already slotted.` };
  }
  playerSeat(state).government.policies[slotIndex] = policyId;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Turn loop
// ---------------------------------------------------------------------------

function autoPickResearch(state: GameState): void {
  if (state.autoResearch === false) return; // someone else drives research
  const eff = (id: string, cost: number) => effectiveResearchCost(state, id, cost);
  if (playerSeat(state).research.tech === null) {
    const next = availableTechs(state).sort((a, b) => eff(a.id, a.cost) - eff(b.id, b.cost))[0];
    if (next) playerSeat(state).research.tech = next.id;
  }
  if (playerSeat(state).research.civic === null) {
    const next = availableCivics(state).sort((a, b) => eff(a.id, a.cost) - eff(b.id, b.cost))[0];
    if (next) playerSeat(state).research.civic = next.id;
  }
}

function advanceResearch(state: GameState, science: number, culture: number): void {
  const r = playerSeat(state).research;
  autoPickResearch(state);

  r.techProgress += science;
  while (r.tech && r.techProgress >= effectiveResearchCost(state, r.tech, TECHS[r.tech].cost)) {
    r.techProgress -= effectiveResearchCost(state, r.tech, TECHS[r.tech].cost);
    r.techs.push(r.tech);
    r.tech = null;
    autoPickResearch(state);
  }
  // Progress banks while a manual picker deliberates; it only drains when
  // the tree is actually exhausted.
  if (!r.tech && availableTechs(state).length === 0) r.techProgress = Math.min(r.techProgress, 0);

  r.civicProgress += culture;
  while (r.civic && r.civicProgress >= effectiveResearchCost(state, r.civic, CIVICS[r.civic].cost)) {
    r.civicProgress -= effectiveResearchCost(state, r.civic, CIVICS[r.civic].cost);
    r.civics.push(r.civic);
    r.civic = null;
    autoPickResearch(state);
  }
  if (!r.civic && availableCivics(state).length === 0) r.civicProgress = Math.min(r.civicProgress, 0);

  // A-7r: the scripted player adopts the newest unlocked government and fills
  // its base slots greedily (the same deterministic rule the rivals use via
  // getRivalModifiers / computeAdoption). Recomputed each turn — a pure
  // function of research, so it re-seats on every civic unlock with zero RNG.
  // Gated INERT behind GOVERNMENTS_ADOPTION_LIVE (see the flag's note); until
  // flipped the player keeps the pre-A-7r free-Chiefdom-only behavior.
  if (GOVERNMENTS_ADOPTION_LIVE) {
    const adopted = computeAdoption(playerSeat(state).research);
    playerSeat(state).government.current = adopted.government;
    playerSeat(state).government.policies = adopted.policies;
  } else if (!playerSeat(state).government.current && computeUnlocks(state).governments.has('CHIEFDOM')) {
    setGovernment(state, 'CHIEFDOM');
  }
}

export function endTurn(state: GameState): void {
  detectBoosts(state);
  if (state.unitsMode) refreshUnits(state);
  const luxMap = luxuryAmenities(state);
  const mods = getModifiers(state);

  // B-15: war weariness accrues once per turn while at war with any live rival
  // (rival war-state as left by last turn's rivalPhase), decays 4× in peace.
  // Read here, before the city loop, so this turn's amenities reflect it — the
  // GPU updates at the same relative point (top of step, after the war block).
  // B-22 (task #55 S3): the player war accrues at the BASELINE rate (×1). The
  // casus-belli ww differential (SURPRISE ×2 / FORMAL ×1) is rival↔rival only —
  // the player has no denounce verb, and doubling the player path surfaced a
  // dormant −3/−4-tier economic divergence (seed 9092). Unchanged from S2.
  const atWarNow = state.rivals.some((rv) => rv.atWar && rv.cities.length > 0);
  playerSeat(state).warWeariness = atWarNow
    ? Math.min(WAR_WEARINESS_CAP, (playerSeat(state).warWeariness ?? 0) + WAR_WEARINESS_PER_TURN)
    : Math.max(0, (playerSeat(state).warWeariness ?? 0) - WAR_WEARINESS_DECAY);

  let turnScience = 0;
  let turnCulture = 0;
  const defectors: City[] = [];

  // B-24 S3: the player's governor seats for THIS turn — stateless greedy over
  // the pre-loop loyalty snapshot (quantized milli, ties by array position);
  // the GPU computes the same pick inside _apply_loyalty_and_flips.
  const govPicks = governorPicks(
    state.cities.map((c) => Math.round((c.loyalty ?? 100) * 1000)),
    governorTitles(playerSeat(state).research.civics.length),
  );
  const govIds = new Set([...govPicks].map((i) => state.cities[i].id));

  for (const city of state.cities) {
    const stats = computeCityStats(state, city, luxMap, mods);

    // --- loyalty (rival-pressure games only) ---------------------------------
    if (applyLoyalty(state, city, stats.amenities.tier.name, govIds.has(city.id) ? GOVERNOR_LOYALTY : 0)) {
      defectors.push(city);
    }

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
          const dt = state.map.tiles[item.tileIndex];
          dt.districtComplete = true;
          // B-24 (#77): MONUMENTALITY pays era score per SPECIALTY district
          // completed (the city centre is not one).
          if (dt.district !== 'CITY_CENTER') dedicationEvent(state, 0, DED_MONUMENTALITY);
          // B-17 (#71): a completed ENCAMPMENT musters its garrison.
          if (dt.district === 'ENCAMPMENT') dt.encampHp = ENCAMPMENT_HP;
        } else if (item.kind === 'wonder') {
          state.map.tiles[item.tileIndex].builtWonderComplete = true;
          // B-24: player wonder moment. GATE-UNREACHABLE (queueWonder is a
          // player verb no scripted/RL policy calls; the GPU has no player
          // wonder path) — TS-only, symmetric with the rival hook below.
          addEraScore(state, 0, ERA_SCORE_WONDER);
        } else if (item.kind === 'settler') {
          state.settlers += 1;
          // P4/D-6: real Civ 6 — a completed Settler costs the city 1 pop.
          city.population = Math.max(1, city.population - 1);
        } else if (item.kind === 'unit') {
          const trained = spawnUnit(state, item.unit, city.centerIndex);
          // B-17 (ROUND B7): a trained MILITARY unit inherits the city's
          // Encampment training XP (best military-building tier).
          if (trained && (UNITS[item.unit]?.combat ?? 0) > 0) {
            const xp = encampmentTrainXp(city.buildings);
            if (xp > 0) trained.xp = xp;
          }
          if (item.unit === 'BUILDER') state.buildersTrained += 1; // P4/D-10
        } else if (item.kind === 'project') {
          completeProject(state, city, item.project, itemCost(item));
        } else {
          city.buildings.push(item.building);
          // AUDIT B-1: completing the walls fills the outer-defense pool.
          if (item.building === 'ANCIENT_WALLS') city.outerHp = WALLS_HP;
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
    playerSeat(state).treasury += stats.total.gold;
    playerSeat(state).scienceTotal += stats.total.science;
    playerSeat(state).cultureTotal += stats.total.culture;
    playerSeat(state).faith += stats.total.faith;
    turnScience += stats.total.science;
    turnCulture += stats.total.culture;
  }

  // B-20 (#71): TOURISM — accumulated ONCE per turn at the civ level, right
  // after the city loop, so the GPU mirrors at the same position. Great Works
  // plus every owned Seaside Resort (worth its tile's appeal).
  playerSeat(state).tourism = (playerSeat(state).tourism ?? 0) + playerTourism(state);
  // B-22 (#75): DIPLOMATIC FAVOR — government tier + suzerainties, accumulated
  // once per turn at the civ level, the same position the rival seat uses.
  playerSeat(state).diploFavor =
    (playerSeat(state).diploFavor ?? 0) + diploFavorPerTurn(playerSeat(state).government.current, playerSuzerainCount(state));
  // B-22 (#74): the player's GRIEVANCES decay by 1 each turn they are at peace
  // with EVERY rival (floor 0) — the exact twin of the rival decay, at the same
  // per-turn accumulator position so both engines apply it together.
  if ((playerSeat(state).warmonger ?? 0) > 0 && !state.rivals.some((rv) => rv.atWar)) {
    playerSeat(state).warmonger = (playerSeat(state).warmonger ?? 0) - 1;
  }

  // Loyalty collapses resolve after the city loop (they mutate the list).
  for (const city of defectors) flipCityToRival(state, city);

  if (state.unitsMode) {
    playerSeat(state).treasury -= unitMaintenance(state);
    // GV-5 bankruptcy: an insolvent treasury disbands ONE unit per turn (Civ 6
    // rule) — the priciest player unit, tie -> lowest id (= oldest spawn; a
    // deterministic order the GPU shares slot-for-slot, both append-only). No
    // refund; the eased upkeep pulls the treasury back over the next turns.
    if (Math.round(playerSeat(state).treasury * 1000) < 0) {
      // GS: test at milli precision — the treasury accumulates non-dyadic 0.05-unit
      // gold, so a sub-milli float drift must not spuriously trip < 0 vs the GPU.
      let victim: Unit | undefined;
      for (const u of state.units) {
        if (!isPlayerSeat(u.seat)) continue;
        const m = UNITS[u.type]?.maintenance ?? 0;
        if (m <= 0) continue;
        const vm = victim ? UNITS[victim.type]?.maintenance ?? 0 : 0;
        if (!victim || m > vm || (m === vm && u.id < victim.id)) victim = u;
      }
      if (victim) disbandUnit(state, victim.id);
    }
    barbarianPhase(state);
  }
  if (state.disasters) disasterPhase(state);
  cityStatePhase(state);
  rivalPhase(state);

  // B-23 duration: expire the player's due trade routes after the turn's
  // phases — the freed capacity re-picks next turn (arithmetic, zero draws).
  expirePlayerRoutes(state);

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

  // B-18: religious pressure spread — after all foundings/settles/flips this
  // turn, so both engines scan the same final city + holy-tile set.
  spreadReligiousPressure(state);

  state.turn += 1;
  eraBoundary(state);
  // B-22 (#76): the WORLD CONGRESS convenes on the same post-increment turn
  // number the era boundary uses, so both engines fire it at one position.
  worldCongress(state); // B-24: era-score window reset at ERA_LENGTH multiples (GPU mirrors at its turn increment)
  // B-24 (#71): DEDICATION payouts — a Golden/Heroic age pays faith, a Dark or
  // Normal age pays era score (the climb-out dedication), both scaled by the
  // dedication COUNT so a Heroic age pays triple. Immediately after the
  // boundary so the GPU mirrors at the same position.
  applyDedications(state, (civ, amt) => {
    if (civ === 0) playerSeat(state).faith += amt;
    else {
      const rv = state.rivals[civ - 1];
      if (rv) rv.faith = (rv.faith ?? 0) + amt;
    }
  });
  // GV-3/GV-4: domination ends the game the instant a civ holds every capital;
  // otherwise the score victory fires at TURN_LIMIT. Detection only — no freeze
  // (GV-2 is indicator-only), so at the gate (dom == -1 by t100) this is inert.
  const dom = dominationWinner(state);
  // B-25: a science victory/defeat (3/4) set during this turn's project
  // completions takes precedence over the domination/score recompute.
  const spaceWon = state.victoryType === 3 || state.victoryType === 4;
  // B6-S3: religious victory — checked on the follow set the spread above just
  // flipped (real-time predominance, the domination pattern: live recompute,
  // no freeze). Precedence space > domination > religion > score; 5 = the
  // player's religion wins, 6 = a rival religion wins (defeat).
  const rel = religiousVictor(state);
  // B-25 (#72): CULTURE victory, checked LAST of the real conditions —
  // precedence space > domination > religion > culture > score. 7 = the
  // player wins on tourism, 8 = a rival does (defeat).
  const cul = rel >= 0 ? -1 : cultureVictor(state);
  // B-22/B-25 (#76): DIPLOMATIC victory — 20 Diplomatic Victory Points, real
  // Civ 6's threshold. Checked LAST of the real conditions: precedence is
  // space > domination > religion > culture > DIPLOMATIC > score. 9 = the
  // player wins, 10 = a rival does (defeat).
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
 * B-22/B-25 (#76): the DIPLOMATIC victory — the first civ to reach
 * DIPLO_VICTORY_POINTS (20, real Civ 6's threshold) Diplomatic Victory Points.
 * Points come from winning World Congress resolutions (see `worldCongress`).
 * A civ with no cities cannot win. Ascending scan, so ties go to the lowest
 * unified civ id. Returns the winner's unified id, or -1.
 */
function diplomaticVictor(state: GameState): number {
  const alive = [state.cities.length > 0, ...state.rivals.map((rv) => rv.cities.length > 0)];
  const pts = [playerSeat(state).diploPoints ?? 0, ...state.rivals.map((rv) => rv.diploPoints ?? 0)];
  for (let c = 0; c < pts.length; c++) {
    if (alive[c] && pts[c] >= DIPLO_VICTORY_POINTS) return c;
  }
  return -1;
}

/**
 * B-25 (#72): the CULTURE victory. Real Civ 6 (Gathering Storm) counts two
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
 * Returns the winning unified civ id (0 player, r+1 rival r), or -1. A civ
 * with NO cities cannot win (a dead civ attracts nobody); the ascending scan
 * breaks ties toward the lowest id, and the > comparison means two civs can
 * never both qualify against each other.
 */
function cultureVictor(state: GameState): number {
  const nCivs = 1 + state.rivals.length;
  const visitDiv = nCivs * TOURISM_PER_VISITOR_PER_CIV;
  const alive = [state.cities.length > 0, ...state.rivals.map((rv) => rv.cities.length > 0)];
  const tourism = [playerSeat(state).tourism ?? 0, ...state.rivals.map((rv) => rv.tourism ?? 0)];
  const culture = [playerSeat(state).cultureTotal, ...state.rivals.map((rv) => rv.cultureTotal ?? 0)];
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
 * B6-S3: religious victory (real Civ 6 predominance-in-every-civilization,
 * sized to modeled scope) — religion g wins when EVERY alive civ (the player
 * if they hold ≥1 city, each rival with ≥1 city) has MORE THAN HALF of its
 * cities following g. At most one g can predominate in a given civ, so no
 * tie-break is needed beyond the ascending scan (lowest id first). Requires
 * g founded and at least one alive civ (no vacuous win over a dead world).
 * The GPU mirror sits at the identical endTurn position.
 */
function religiousVictor(state: GameState): number {
  const civs: City[][] = [];
  if (state.cities.length > 0) civs.push(state.cities);
  for (const rv of state.rivals) if (rv.cities.length > 0) civs.push(rv.cities);
  if (civs.length === 0) return -1;
  const nRel = 1 + state.rivals.length;
  for (let g = 0; g < nRel; g++) {
    const founded = g === 0 ? !!playerSeat(state).religion?.founded : !!state.rivals[g - 1]?.religion.founded;
    if (!founded) continue;
    let all = true;
    for (const cs of civs) {
      const n = cs.filter((c) => c.followedReligion === g).length;
      if (n * 2 <= cs.length) {
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

/** Points each class gains per turn (districts + their buildings + beliefs).
 * P4/D-19 (real Civ 6): specialists give YIELDS only, no GPP — dropping the
 * old specialist term also closes a latent TS↔GPU divergence (the GPU never
 * counted them). */
export function greatPersonPointsPerTurn(state: GameState): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  const gppFlat = getModifiers(state).gppFlat;
  out.PROPHET += goldenProphetPoints(state, 0); // B-24 (#79): golden EXODUS
  for (const city of state.cities) {
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) =>
          d.type === district &&
          state.map.tiles[d.tileIndex].districtComplete &&
          !state.map.tiles[d.tileIndex].districtPillaged, // B-32: pillaged district earns no GPP
      );
      if (!inst) continue;
      let pts = 1 + (gppFlat[cls] ?? 0);
      pts += city.buildings.filter((b) => BUILDINGS[b]?.district === district).length;
      out[cls] += pts;
    }
  }
  return out;
}

/** Number of people of a class already earned. */
export function greatPeopleEarned(state: GameState, cls: GreatPersonClass): number {
  return state.claimedGreatPeople.filter((id) => GREAT_PEOPLE[cls].some((p) => p.id === id)).length;
}

function applyGreatPersonEffect(state: GameState, cls: GreatPersonClass): void {
  const n = greatPeopleEarned(state, cls);
  const person = GREAT_PEOPLE[cls][n];
  if (!person) return; // class exhausted
  const fx = person.effect;
  if (fx.science) playerSeat(state).research.techProgress += fx.science;
  // B-20: WRITER/MUSICIAN slot Great Works (+2 culture/turn each, deferred
  // yield); charges with no open slot fall back to the instant culture lump
  // (one lump per overflow charge). Other classes apply culture instantly.
  if (GW_WORK_CLASSES.has(cls)) {
    // AUDIT #78: wonder-granted slots (Great Library +2 writing). Resolved
    // HERE because completeness lives on the tile and greatPeople.ts is
    // map-free; same completeness test as completedWonders().
    const kind = GW_CLASS_KIND[cls]!;
    const wonderSlots = (c: { wonders?: { id: string; tileIndex: number }[] }) =>
      (c.wonders ?? []).reduce(
        (n, w) =>
          n + (state.map.tiles[w.tileIndex].builtWonderComplete ? (GW_WONDER_SLOTS[w.id]?.[kind] ?? 0) : 0),
        0,
      );
    const overflow = placeGreatWorks(state.cities, kind, wonderSlots); // #73: per-kind (writing/art/music)
    if (fx.culture) playerSeat(state).research.civicProgress += fx.culture * overflow;
  } else if (fx.culture) {
    playerSeat(state).research.civicProgress += fx.culture;
  }
  if (fx.faith) playerSeat(state).faith += fx.faith;
  if (fx.gold) playerSeat(state).treasury += fx.gold;
  if (fx.productionToCapital) {
    const capital = state.cities.find((c) => c.isCapital);
    if (capital && capital.queue.length > 0) {
      capital.queue[0].progress += fx.productionToCapital;
    }
  }
  // B7-G (B-8): a GENERAL/ADMIRAL claim ALSO spawns its support unit (civilian,
  // 4 MP) at the capital, on top of the roster's instant effect (which models
  // the retire ability). Spawn-at-claim is production-free — zero RNG draws.
  if (cls === 'GENERAL' || cls === 'ADMIRAL') {
    const capital = state.cities.find((c) => c.isCapital);
    if (capital) spawnUnit(state, cls, capital.centerIndex, PLAYER_CIV);
  }
  state.claimedGreatPeople.push(person.id); // gone from the global pool...
  playerSeat(state).gpEarned.push(person.id); // ...and recorded as the PLAYER's recruit (S1.2f)
  addEraScore(state, 0, ERA_SCORE_GP); // B-24: Great Person moment (per earn, the GPU claim-delta mirror)
}

/**
 * B-18 religious pressure spread (deterministic, zero-RNG). Religions are
 * indexed in the unified civ space: 0 = the player's, i+1 = rival i's. A
 * founded religion's HOLY tile (its capital center, frozen at founding) emits
 * pressure to every city (player + rival, symmetric) within
 * RELIGION_PRESSURE_RANGE tiles: +RELIGION_PRESSURE_PER_TURN integer pressure
 * to that city's accumulator for that religion, once per turn. A city then
 * FOLLOWS the religion with the most accumulated pressure (>0); ties resolve
 * to the lowest religion id — a founding-order proxy, since an earlier-founded
 * religion has spent more turns accumulating and so leads outright in the
 * common case, and the id tie-break only settles same-turn foundings.
 *
 * INERT this round: followedReligion/religionPressure are computed and
 * serialized but NOT yet read by the yield pipeline (the per-city follower-
 * belief coupling is the deferred follow-up — see gpu/ROUND_B2_LOG.md §T).
 * The GPU mirror is BatchSim._spread_religious_pressure. Integer pressure
 * keeps the argmax exact (no float association across the batch). Fresh City
 * objects (founded/flipped cities) carry no pressure — the reset-on-birth KILL
 * hygiene, mirrored on the GPU by zeroing dead/absent slots each turn.
 */
function spreadReligiousPressure(state: GameState): void {
  const R = state.rivals.length;
  const nRel = 1 + R;
  const holy: number[] = new Array(nRel).fill(-1);
  const rel_1214 = playerSeat(state).religion;
  if (rel_1214?.founded && rel_1214.holyTile != null && rel_1214.holyTile >= 0) {
    holy[0] = rel_1214.holyTile;
  }
  for (let i = 0; i < R; i++) {
    const rv = state.rivals[i];
    if (rv.religion.founded && rv.religion.holyTile != null && rv.religion.holyTile >= 0) holy[i + 1] = rv.religion.holyTile;
  }
  if (!holy.some((h) => h >= 0)) return; // no religion exists yet — nothing to spread
  // B6-S1 (Itinerant Preachers): per-religion range — the base radius plus the
  // religion's enhancer pressureRangeBonus (0 when unenhanced).
  const range: number[] = new Array(nRel).fill(RELIGION_PRESSURE_RANGE);
  const pEnh = playerSeat(state).religion.enhancer;
  if (pEnh) {
    range[0] += ENHANCER_BELIEFS[pEnh]?.effects.pressureRangeBonus ?? 0;
  }
  for (let i = 0; i < R; i++) {
    const eb = state.rivals[i].religion.enhancer;
    if (eb) range[i + 1] += ENHANCER_BELIEFS[eb]?.effects.pressureRangeBonus ?? 0;
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
    // B-24 (#77): EXODUS OF THE EVANGELISTS pays era score each time a city
    // CONVERTS to a civ's religion — the religion's OWNER earns it.
    const wasFollowed = city.followedReligion ?? -1;
    city.followedReligion = best >= 0 ? best : null;
    if (best >= 0 && best !== wasFollowed) dedicationEvent(state, best, DED_EXODUS);
  }
}

function advanceGreatPeople(state: GameState): void {
  const perTurn = greatPersonPointsPerTurn(state);
  for (const cls of GP_CLASSES) {
    if (perTurn[cls] === 0 && (playerSeat(state).gpp[cls] ?? 0) === 0) continue;
    let pts = (playerSeat(state).gpp[cls] ?? 0) + perTurn[cls];
    let earned = greatPeopleEarned(state, cls);
    while (earned < GREAT_PEOPLE[cls].length && pts >= gpCost(earned)) {
      pts -= gpCost(earned);
      applyGreatPersonEffect(state, cls);
      earned++;
    }
    playerSeat(state).gpp[cls] = pts;
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
  // #51/S1.2: `seats[r+1]` and `rivals[r]` are the SAME OBJECT in memory, and a
  // JSON round-trip cannot preserve that — JSON.parse hands back two
  // independent copies, after which a mutation through one view is invisible to
  // the other and the reloaded game silently diverges from the live one. Re-tie
  // them here. (Caught by the rival-determinism test, which is exactly what it
  // is for.) The redundancy disappears when `rivals` does, at the end of S1.2.
  state.seats = [
    state.seats?.[0] ?? { seat: 0, warmonger: 0, warWeariness: 0, diploFavor: 0, diploPoints: 0, influencePoints: 0, envoysAvailable: 0, treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0, research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] }, government: { current: null, policies: [] }, religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, gpp: {}, gpEarned: [] },
    ...(state.rivals ?? []),
  ];
  playerSeat(state).research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] };
  playerSeat(state).research.boosted ??= [];
  playerSeat(state).government ??= { current: null, policies: [] };
  state.claimedGreatPeople ??= [];
  for (const t of state.map.tiles as (Tile & { wonder?: string | null })[]) {
    t.wonder ??= null;
    t.builtWonder ??= null;
    t.builtWonderComplete ??= false;
  }
  playerSeat(state).religion ??= { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null };
  playerSeat(state).religion.enhancer ??= null; // B-18
  state.tradeRoutes ??= [];
  state.settlers ??= 0;
  state.buildersTrained ??= 0; // P4/D-10
  // P4/D-22: older saves seed the tracker from the standing army.
  state.bestMeleeCS ??= Math.max(
    0,
    ...state.units
      .filter((u) => isPlayerSeat(u.seat) && !UNITS[u.type]?.ranged)
      .map((u) => UNITS[u.type]?.combat ?? 0),
  );
  state.tilesPurchased ??= 0; // P4/D-17
  state.plannedSettles ??= [];
  state.unitsMode ??= false;
  state.units ??= [];
  state.nextUnitId ??= 0;
  state.rngState ??= (state.map.seed ^ 0x9e3779b9) >>> 0;
  state.barbCamps ??= [];
  state.disasters ??= false;
  // GV-2 gameOver is recomputed every endTurn (turn > TURN_LIMIT); no migration
  // needed, and adding ??= would break serialize round-trip idempotence for
  // states that never ran a turn (fresh makeState has it undefined).
  state.fogOfWar ??= false;
  state.explored ??= [];
  state.eventLog ??= [];
  state.cityStates ??= [];
  playerSeat(state).influencePoints ??= 0;
  playerSeat(state).envoysAvailable ??= 0;
  state.rivals ??= [];
  // C1-A2: rival cities became full City objects; older saves carry the
  // scalar shape (growthBox, no queue/districts/…). Fill ONLY the missing
  // fields in place — a current-shape save must round-trip byte-identically
  // (the rival determinism test serializes and compares).
  for (const r of state.rivals) {
    // C1-B3: older saves lack the rival research trees.
    r.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] };
    r.treasury ??= 0; // VP-G1
    for (const rc of r.cities as (RivalCity & { growthBox?: number })[]) {
      rc.seat ??= civOfRival(r.id);
      rc.foodBox ??= rc.growthBox ?? 0;
      delete rc.growthBox;
      rc.cultureBox ??= 0;
      rc.lockedTiles ??= [];
      rc.focus ??= 'balanced';
      rc.queue ??= [];
      rc.isCapital ??= false;
      rc.buildings ??= [];
      rc.districts ??= [{ type: 'CITY_CENTER', tileIndex: rc.centerIndex }];
      rc.wonders ??= [];
      rc.specialists ??= {};
    }
  }
  state.claimedPantheons ??= [];
  state.claimedBeliefs ??= [];
  state.claimedEnhancers ??= []; // B-18
  for (const u of state.units) {
    u.seat ??= PLAYER_CIV; // #51/S1.3b: old saves predate the seat field
    u.hp ??= 100;
    // B-5 FORTIFY: fill only MILITARY units in place (civilians never carry
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
  if (playerSeat(state).religion.pantheon) return { ok: false, reason: 'Pantheon already chosen.' };
  if (!state.sandbox && playerSeat(state).faith < PANTHEON_FAITH_COST) {
    return { ok: false, reason: `Needs ${PANTHEON_FAITH_COST} faith (${Math.floor(playerSeat(state).faith)} banked).` };
  }
  return { ok: true };
}

export function choosePantheon(state: GameState, beliefId: string): RuleResult {
  const check = canChoosePantheon(state);
  if (!check.ok) return check;
  if (!PANTHEONS[beliefId]) return { ok: false, reason: 'No such pantheon belief.' };
  if (state.claimedPantheons.includes(beliefId)) {
    return { ok: false, reason: 'A rival civilization already follows that pantheon.' };
  }
  if (!state.sandbox) playerSeat(state).faith -= PANTHEON_FAITH_COST;
  playerSeat(state).religion.pantheon = beliefId;
  addEraScore(state, 0, ERA_SCORE_PANTHEON); // B-24: player verb — gate-unreachable, TS-only (rival hook mirrors)
  return { ok: true };
}

export function canFoundReligion(state: GameState): RuleResult {
  if (playerSeat(state).religion.founded) return { ok: false, reason: 'Religion already founded.' };
  if (!playerSeat(state).religion.pantheon) return { ok: false, reason: 'Choose a pantheon first.' };
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
  if (state.claimedBeliefs.includes(choice.follower) || state.claimedBeliefs.includes(choice.founder)) {
    return { ok: false, reason: 'A rival religion already claimed that belief.' };
  }
  playerSeat(state).religion.founded = true;
  addEraScore(state, 0, ERA_SCORE_RELIGION); // B-24: player verb — gate-unreachable, TS-only (rival hook mirrors)
  playerSeat(state).religion.name = choice.name || RELIGION_NAMES[0];
  playerSeat(state).religion.follower = choice.follower;
  playerSeat(state).religion.founder = choice.founder;
  playerSeat(state).religion.worship = choice.worship;
  // B-18: freeze the holy tile (the capital's center) — the pressure source.
  playerSeat(state).religion.holyTile = (state.cities.find((c) => c.isCapital) ?? state.cities[0])?.centerIndex ?? null;
  return { ok: true };
}

/** B-18: can the player enhance its religion (add the Enhancer belief)? Real
 * Civ 6 spends a second Great Prophet — modeled here as a SECOND earned
 * Prophet-class great person (the first funds founding). */
export function canEnhanceReligion(state: GameState): RuleResult {
  if (!playerSeat(state).religion.founded) return { ok: false, reason: 'Found a religion first.' };
  if (playerSeat(state).religion.enhancer) return { ok: false, reason: 'Religion already enhanced.' };
  if (!state.sandbox && greatPeopleEarned(state, 'PROPHET') < 2) {
    return { ok: false, reason: 'Needs a second Great Prophet to enhance.' };
  }
  return { ok: true };
}

/** B-18: add an Enhancer belief to the player's founded religion. Effects are
 * inert this round (they need religious pressure / missionary / combat systems
 * that do not exist yet); the slot and claim are real and mirror the
 * follower/founder claimed-pool exclusion. */
export function enhanceReligion(state: GameState, beliefId: string): RuleResult {
  const check = canEnhanceReligion(state);
  if (!check.ok) return check;
  if (!ENHANCER_BELIEFS[beliefId]) return { ok: false, reason: 'No such enhancer belief.' };
  state.claimedEnhancers ??= [];
  if (state.claimedEnhancers.includes(beliefId)) {
    return { ok: false, reason: 'A rival religion already claimed that enhancer.' };
  }
  playerSeat(state).religion.enhancer = beliefId;
  state.claimedEnhancers.push(beliefId);
  return { ok: true };
}
