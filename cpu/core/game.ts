
import type { City, DistrictId, GameState, ImprovementId, MapGenOptions, QueueItem, ResearchState, Tile, Seat, Unit } from './types';
import { dropQueuedBuilding } from './production';
import { greatPeopleEarned, relicSlotsIn } from './greatPeople';
import { airTrainTile } from './air';
import { placeRelic, GP_CLASSES } from '../data/greatPeople';
import { VALLETTA_FAITH_DISTRICTS } from '../data/cityStates';
import { generateMap } from '../../world/mapgen';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { acquireTile, borderCandidates, newCityGrantUnit, seatBuildingSum } from './city';
import { canFoundCity, canPlaceDistrict, canPlaceWonder, validImprovements, canRemoveFeature, availableBuildings, buildingCompletable, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, availableTechs, availableCivics, governmentSlots, isCivicComplete } from './effects';
import type { Modifiers, Unlocks } from './effects';
import { effectiveResearchCostIn } from './boosts';
import { spawnUnit, refreshUnits, trainableUnits, disbandUnit, reseatUnit, tileFreeForUnit, builderCost, traderCost, settlerCount, unitsAt, unitDomain } from './units';
import { promoClassOf, promoFlag, unitPromoRows, XP_PER_LEVEL } from './promotions';
import { barbarianPhase, damageRoll, trainXpPct, theoStrength, theoFlankCount, theoSupportCount, theoDefenseStrength, FLANKING_CS, SUPPORT_CS } from './combat';
import { revealAround } from './fog';
import { disasterPhase } from './disasters';
import { climateTurn, deriveLowlands, standingRemovable } from './climate';
import { placeCityStates, cityStatePhase, resolveSuzerains, suzerainEffect } from './cityStates';
import { minorBuildPhase } from './minorBuild';
import { placeSeats, seatPhase, worldCongress, nextCityName } from './phase';
import { congressCondemnFavor, congressUdtBlockedDistrict, congressUnitBuyMult, CONGRESS_CUR_GOLD } from './congress';
import { commitProduction, commitResearch } from './seatTurn';
import { seatWonderFlag } from './wonders';
import { ALLIANCE_RELIGIOUS, ERA_SCORE_FOUND, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, DIPLO_VICTORY_POINTS, DED_EXODUS, DED_MONUMENTALITY, DED_PEN_BRUSH_AND_VOICE, ERA_LENGTH } from '../data/seats';
import { addEraScore, eraBoundary, buildingDedications, dedicationEvent, goldenBoostBonus, goldenDedication, monumentalityBuyMult } from './eras';
import { UNITS, ENCAMPMENT_HP, CITY_MAX_HP, REPAIR_QUIET_TURNS, ROCK_BAND_COST_STEP, FORMATION_CIVIC, FORMATION_MAX } from '../data/units';
import { buildingCostIn, outerPool, wallsMax, fitEncampOuter, encampOuterMissing } from './rules';
import { laserSpeed } from './yields';
import { canRunProject, chargeUnitResource } from './stockpile';
import { FEATURES } from '../../world/features';
import { isWater } from '../../world/query';
import { RESOURCES } from '../../world/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { governorFlag, governorSum, governorTileMult } from './governors';
import { BUILT_WONDERS } from '../data/builtWonders';
import { TECHS, ERAS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { nextRandom } from './rand';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, WORSHIP_BUILDINGS, RELIGION_NAMES, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, RELIGION_PRESSURE_PER_TURN, MISSIONARY_CAP, APOSTLE_CAP, INQUISITOR_CAP, APOSTLE_PROMO_OFFER, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, LAUNCH_INQUISITION_CHARGES, REMOVE_HERESY_PCT, CONDEMN_PRESSURE_RANGE, CONDEMN_PRESSURE_SWING } from '../data/religion';
import { PROJECTS, SPACE_FLIGHT_LY, type ProjectDef } from '../data/projects';
import { CITY_NAMES, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, GAME_SPEED } from '../data/constants';
import { BARB_SEAT, allCities, allSeats, citiesOf, civsAtWar, emptySeat, isBarbSeat, seatOf, seatOfCityState, setTileOwner, tileCity, tileClaimed, tileSeat, unitSeat, visibilityCS, allianceTheoCS, alliedAtLevel } from './seats';
import { irradiated } from './nuclear';
import { formationBanned } from './units';

export const TURN_LIMIT = 250;

export function effectiveResearchCost(state: GameState, seat: number, id: string, baseCost: number): number {
  // A GOLDEN Free Inquiry / Pen-Brush-and-Voice deepens the boost — the
  // RESEARCHING seat's dedication, which is the `seat` this function already
  // takes; the GPU passes the row.
  return effectiveResearchCostIn(seatOf(state, seat)!.research, id, baseCost, goldenBoostBonus(state, seat, !TECHS[id]));
}

/**
 * Districts get pricier as the game advances (Civ 6 scales with overall
 * research progress). Cost is locked in when the district is queued.
 */
export function districtCostIn(research: ResearchState): number {
  // The real Civ 6 curve — floor(54·(1 + 9·max(tech%, civic%)))
  // (the tree you are FURTHER through drives the price, not the average).
  // The 54 base speed-scales like every other production cost.
  // `districtDiscounted` carries the under-represented discount on top.
  const tPct = research.techs.length / Object.keys(TECHS).length;
  const cPct = research.civics.length / Object.keys(CIVICS).length;
  return Math.floor(Math.round(54 * GAME_SPEED) * (1 + 9 * Math.max(tPct, cPct)));
}

/** CIV6 ("District", District discount mechanics): a specialty district is
 *  40% off when BOTH hold — A = specialty types unlocked, B = specialty
 *  districts COMPLETED, C(T) = districts of type T completed or placed:
 *  B >= A, and C(T) < B/A. `n < ceil(D/U)` is that inequality over integers.
 *  Government Plaza and Diplomatic Quarter take 25% instead; neither is in
 *  this roster. A district's cost locks in when it is placed. */
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
  // CIV6: the Spaceport's cost is FLAT — it never scales and takes no discount.
  if (type !== undefined && DISTRICTS[type]?.fixedCost) return Math.round(DISTRICTS[type].cost * GAME_SPEED);
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
  // The sea's reach and the two climate denominators are properties of the
  // map as it was made, so they are stamped once, here, and never re-derived
  // from a map the game has already changed.
  deriveLowlands(map);
  return {
    map,
    climateIdx: -1,
    removableAtStart: standingRemovable(map),
    iceAtStart: map.tiles.filter((t) => t.feature === 'ICE').length,
    turn: 1,
    sandbox,
    claimedGreatPeople: [],
    gpOffer: GP_CLASSES.map(() => -1),
    gpPrice: GP_CLASSES.map(() => 0),
    unitsMode,
    units: [],
    nextUnitId: 0,
    rngState: (map.seed ^ 0x9e3779b9) >>> 0,
    barbSeat: emptySeat(BARB_SEAT), // the hostile class has a seat too
    disasters: false,
    gameOver: false,
    victoryType: 0,
    victoryRow: -1,
    fogOfWar: unitsMode,
    eventLog: [],
    cityStates: [],
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
  if (getModifiers(state, seat).noSettlers) return { ok: false, reason: 'Isolationism forbids Settlers.' };
  if (!state.sandbox && city.population < 2) return { ok: false, reason: 'A city of 1 population cannot train a settler.' };
  commitProduction(state, city.seat, city, { kind: 'settler', progress: 0, cost: settlerCost(state, seat) });
  return { ok: true };
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

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
    focus: 'balanced',
    queue: [],
    isCapital: list.length === 0,
    origCapitalSeat: list.length === 0 ? seat : -1,
    founderSeat: seat,
    buildings: list.length === 0 ? ['PALACE'] : [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
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
  addEraScore(state, seat, ERA_SCORE_FOUND);
  if (city.isCapital) {
    const owner = seatOf(state, seat);
    if (owner) owner.capitalTile = tile.index;  // static once founded
  }
  revealAround(state, seat, tile.index, 3);
  // CIV6 (Ancestral Hall): "New cities receive a free Builder." The grant is
  // the SEAT's, so the first city — founded before any Plaza stands — never
  // sees it.
  const grant = newCityGrantUnit(state, seat);
  if (grant) spawnUnit(state, grant, tile.index, seat);
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
  if (state.sandbox && type === 'ENCAMPMENT') tile.encampHp = ENCAMPMENT_HP;
  tile.improvement = null;
  // CIV6: a district paves every feature EXCEPT floodplains — the feature
  // stays under the district (GS floods damage districts built on them).
  tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

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
    if (BUILDINGS[buildingId]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
  } else {
    commitProduction(state, city.seat, city, { kind: 'building', building: buildingId, progress: 0 });
  }
  return { ok: true };
}

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


export function projectCost(state: GameState, seat: number, projectId?: string, city?: City): number {
  // Space steps and laser stations carry their REAL fixed price (already
  // speed-scaled in the table); everything else takes the generic curve.
  const def = projectId !== undefined ? PROJECTS[projectId] : undefined;
  // CIV6: "Walls gain HP equal to the Production invested into the project" —
  // so the whole repair costs exactly the perimeter HP it puts back.
  if (def?.repair && city) return Math.max(1, wallsMax(state, city) - outerPool(state, city) + encampOuterMissing(state, city));
  const fixed = def?.cost;
  if (fixed !== undefined) return fixed;
  return Math.max(Math.round(15 * GAME_SPEED), Math.round(districtCost(state, seat) * 0.5));
}

/** CIV6: the repair "becomes available after building Walls. A city can
 *  undertake this project if it and/or its Encampment district have damaged
 *  Walls and have not been attacked in the last three turns." One perimeter
 *  serves the centre and its Encampment here, so one pool answers both. */
export function repairAvailable(state: GameState, city: City): boolean {
  const max = wallsMax(state, city);
  if (max <= 0 || (outerPool(state, city) >= max && encampOuterMissing(state, city) <= 0)) return false;
  // CIV6 (a City Center or Encampment caught in a blast): "Healing is
  // impossible and Repair Outer Defenses is unusable while the fallout lasts."
  if (irradiated(state.map.tiles[city.centerIndex])) return false;
  return state.turn - (city.lastHitTurn ?? 0) >= REPAIR_QUIET_TURNS;
}

export function availableProjects(state: GameState, city: City): ProjectDef[] {
  const owner = seatOf(state, city.seat);
  const done = owner?.projectsDone ?? [];
  return Object.values(PROJECTS).filter((p) => {
    // CIV6: "Production cannot be applied to anything in tiles containing
    // contamination" — a project runs in a district, so that district's tile
    // has to be clean as well as complete.
    if (!city.districts.some((d) => d.type === p.district
      && state.map.tiles[d.tileIndex].districtComplete
      && !irradiated(state.map.tiles[d.tileIndex]))) {
      return false;
    }
    if (p.requiresCivic && !owner?.research.civics.includes(p.requiresCivic)) return false;
    if (p.repair) return repairAvailable(state, city);
    if (p.laser) {
      // Repeatable, so never in the one-time ledger — but it still asks for
      // its tech, for the craft it speeds to be in flight, and for whatever
      // strategic resource it charges.
      if (p.requiresTech && !owner?.research.techs.includes(p.requiresTech)) return false;
      if (p.requiresProject && !done.includes(p.requiresProject)) return false;
      return canRunProject(state, city.seat, p.id);
    }
    if (p.wmd) {
      // CIV6: repeatable, so no ledger — but it wants its tech, the unlock
      // project that opened it, and its device's Uranium in the stockpile.
      if (p.requiresTech && !owner?.research.techs.includes(p.requiresTech)) return false;
      if (p.requiresProject && !done.includes(p.requiresProject)) return false;
      return canRunProject(state, city.seat, p.id);
    }
    if (p.recommission) {
      // CIV6: offered to a city whose Industrial Zone holds a Nuclear Power
      // Plant, once Nuclear Fission is in. Repeatable, so no ledger.
      if (p.requiresTech && !owner?.research.techs.includes(p.requiresTech)) return false;
      return city.buildings.includes('NUCLEAR_POWER_PLANT');
    }
    if (!p.once) return true;
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
  commitProduction(state, city.seat, city, { kind: 'project', project: projectId, progress: 0, cost: projectCost(state, seat, projectId, city) });
  return { ok: true };
}


/** Gold price to buy a building outright (Civ 6's 4× production cost). */
export function buildingPurchaseCost(buildingId: string): number {
  return (BUILDINGS[buildingId]?.cost ?? 0) * GOLD_PURCHASE_MULT;
}

/** Faith price of a worship building. CIV6 (GS Civilopedia, Cathedral):
 * a FLAT 380 faith at standard speed (speed-scaled like every other cost);
 * anything else keeps the production×mult schedule. */
export function buildingFaithCost(buildingId: string): number {
  if (BUILDINGS[buildingId]?.worship) return Math.round(380 * GAME_SPEED);
  return (BUILDINGS[buildingId]?.cost ?? 0) * FAITH_PURCHASE_MULT;
}

/**
 * CIV6 (Valletta's suzerain): "City Center buildings and Encampment district
 * buildings can be bought with Faith. Cost of purchasing Ancient, Medieval,
 * and Renaissance Walls is reduced, but they can only be bought with Faith."
 * The class is the building's own district; the walls DISCOUNT has no
 * published magnitude and is not modelled, so they price like any other row.
 */
export function faithBuyableClass(state: GameState, seat: number, buildingId: string): boolean {
  const def = BUILDINGS[buildingId];
  if (!def || def.worship) return false;
  if (!VALLETTA_FAITH_DISTRICTS.includes(def.district)) return false;
  return suzerainEffect(state, seat, 'faithBuildings');
}

/** The three walls are gold-buyable until a Valletta suzerain makes them
 *  faith-only. `noPurchase` already refuses the upgraded two outright. */
export function wallsGoldBlocked(state: GameState, seat: number, buildingId: string): boolean {
  return (BUILDINGS[buildingId]?.walls ?? 0) > 0 && suzerainEffect(state, seat, 'faithBuildings');
}

/**
 * CIV6 (Theocracy): "Can buy land combat units with Faith"; (Grand Master's
 * Chapel): "Grants the ability to buy land military units with Faith." Either
 * grant is empire-wide, so the question is the SEAT's.
 */
export function faithBuysLandUnits(state: GameState, seat: number): boolean {
  const s = seatOf(state, seat);
  if (!s) return false;
  if (getModifiers(state, seat).faithBuyLandUnits) return true;
  return citiesOf(state, seat).some((c) => c.buildings.some((b) => BUILDINGS[b]?.faithBuyUnits));
}

/** the faith price of a land combat unit — the one published faith rate, the
 *  same `FAITH_PURCHASE_MULT` a building is bought at. */
export function unitFaithCost(unitType: string): number {
  return (UNITS[unitType]?.cost ?? 0) * FAITH_PURCHASE_MULT;
}

/** CIV6 (Flower Power): "The cost of producing and purchasing land units
 *  other than Rock Bands is increased by +100%." */
export function landUnitPriceMult(state: GameState, seat: number, unitType: string): number {
  const def = UNITS[unitType];
  if (!def || def.naval || def.air || unitType === 'ROCK_BAND') return 1;
  return getModifiers(state, seat).landUnitCostMult;
}

export function goldAffordable(treasury: number, cost: number): boolean {
  return Math.round(treasury * 1000) >= Math.round(cost * 1000);
}

export function unitPurchaseCost(state: GameState, unitType: string, seat: number): number {
  const base = unitType === 'BUILDER' ? builderCost(state, seat) : unitType === 'TRADER' ? traderCost(state, seat) : UNITS[unitType]?.cost ?? 0;
  const m = unitType === 'BUILDER' ? monumentalityBuyMult(state, seat) : 1;
  // Mercenary Companies names a CURRENCY and moves the price of a MILITARY
  // unit bought with it.
  const merc = (UNITS[unitType]?.combat ?? 0) > 0 ? congressUnitBuyMult(state, CONGRESS_CUR_GOLD) : 1;
  return base * GOLD_PURCHASE_MULT * m * merc * landUnitPriceMult(state, seat, unitType);
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
  // CIV6 (Medieval and Renaissance Walls): "Cannot be purchased with Gold."
  if (BUILDINGS[buildingId]?.noPurchase || wallsGoldBlocked(state, seat, buildingId)) {
    return { ok: false, reason: 'These walls cannot be purchased with gold.' };
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
  dropQueuedBuilding(city, buildingId);
  buildingDedications(state, city.seat, buildingId);
  if (BUILDINGS[buildingId]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
  return { ok: true };
}

export function purchaseUnit(state: GameState, cityId: number, unitType: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!trainableUnits(state, seat, city).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  // CIV6 (Spy): "Cannot be purchased with Gold."
  if (UNITS[unitType]?.noGold) return { ok: false, reason: 'This unit cannot be purchased with Gold.' };
  const cost = unitPurchaseCost(state, unitType, seat);
  if (!state.sandbox) {
    if (!goldAffordable(buyer.treasury, cost)) return { ok: false, reason: `Not enough gold (${cost} needed).` };
    buyer.treasury -= cost;
  }
  const where = UNITS[unitType]?.air
    ? airTrainTile(state, seat, city) ?? city.centerIndex
    : city.centerIndex;
  const unit = spawnUnit(state, unitType, where, seat);
  if (!unit) {
    if (!state.sandbox) buyer.treasury += cost; // refund: nowhere to stand
    return { ok: false, reason: 'No free tile near the city center.' };
  }
  if (!state.sandbox) chargeUnitResource(state, seat, unitType);
  unit.xpPct = trainXpPct(city.buildings, promoClassOf(unitType));
  if (unitType === 'BUILDER') buyer.buildersTrained += 1;
  return { ok: true };
}

/** Buy a settler with gold (cost scales like trained settlers). The unit
 * spawns at the buying city, which also pays the pop (real Civ 6). */
export function purchaseSettler(state: GameState, cityId: number, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (getModifiers(state, seat).noSettlers) return { ok: false, reason: 'Isolationism forbids Settlers.' };
  if (!state.sandbox && city.population < 2) return { ok: false, reason: 'A city of 1 population cannot buy a settler.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const cost = settlerCost(state, seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, seat);
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

export function buyWorshipBuilding(state: GameState, cityId: number, seat: number): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!buyer.religion.founded) return { ok: false, reason: 'No founded religion.' };
  // CIV6 (Urban Development Treaty, outcome B): a faith purchase still
  // CREATES a building in the district, so the ban covers it.
  if (congressUdtBlockedDistrict(state) === 'HOLY_SITE') return { ok: false, reason: 'The World Congress bans new Holy Site buildings.' };
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
  dropQueuedBuilding(city, wid);
  return { ok: true };
}

/**
 * Buy a City Center or Encampment building with FAITH — Valletta's suzerain
 * class purchase. Same legality as the gold buy, a different currency, and
 * its own once-per-turn slot: faith and gold are independent purses.
 */
export function purchaseBuildingWithFaith(state: GameState, cityId: number, buildingId: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!faithBuyableClass(state, seat, buildingId)) return { ok: false, reason: 'Not a faith-buyable building.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  if (!buildingCompletable(state, city, buildingId)) {
    return { ok: false, reason: 'Its district (or prerequisite building) must be finished first.' };
  }
  const cost = buildingFaithCost(buildingId);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  buyer.faith = (buyer.faith ?? 0) - cost;
  city.buildings.push(buildingId);
  dropQueuedBuilding(city, buildingId);
  buildingDedications(state, city.seat, buildingId);
  if (BUILDINGS[buildingId]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
  return { ok: true };
}

/**
 * Buy a LAND COMBAT unit with FAITH — Theocracy's and the Grand Master's
 * Chapel's grant. The unit spawns at the named city like the gold rung's, and
 * faith is its own purse, so this rides beside the one gold purchase.
 */
export function purchaseUnitWithFaith(state: GameState, cityId: number, unitType: string, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!faithBuysLandUnits(state, seat)) return { ok: false, reason: 'Faith buys no land units here.' };
  const def = UNITS[unitType];
  if (!def || (def.combat ?? 0) <= 0 || def.naval || def.air !== undefined) {
    return { ok: false, reason: 'Not a land combat unit.' };
  }
  if (!trainableUnits(state, seat, city).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const cost = unitFaithCost(unitType);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'Nowhere to place it.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  u.xpPct = trainXpPct(city.buildings, promoClassOf(unitType));
  chargeUnitResource(state, seat, unitType);
  return { ok: true };
}

/**
 * CIV6 (Theological combat): "When a hostile military unit uses the Condemn
 * Heretic action on a religious unit, the same effect is observed; however,
 * only the losing side loses religious influence, the Religious Pressure lost
 * is halved ... and it only affects cities within 6 tiles. The religion of the
 * military unit does not gain influence." The action's own condition is "Must
 * be at war with the owner of the religious unit."
 */
/** which of two units real Civ 6 keeps when they merge: "the experience and
 *  promotions of the highest experience unit is preserved". XP banks toward
 *  the NEXT level rather than accumulating, so the LEVEL leads and the banked
 *  remainder breaks the tie. */
function veteranOf(a: Unit, b: Unit): Unit {
  const la = a.level ?? 1;
  const lb = b.level ?? 1;
  if (la !== lb) return la > lb ? a : b;
  return (a.xp ?? 0) >= (b.xp ?? 0) ? a : b;
}

/**
 * FORM UP — the acting unit merges into a unit of its OWN type one step away.
 *
 * CIV6 (Formations): two military units of the same type combine into a Corps
 * once Nationalism is in, three into an Army once Mobilization is; at sea the
 * pair is a Fleet and the trio an Armada, under those same two civics. A tier
 * holds `tier + 1` units, so merging an a-tier into a b-tier makes tier
 * `a + b + 1` and anything past an Army has no formation to be.
 *
 * "Once a Corps or Army has been formed, the units may not be broken apart
 * into individual units again" — there is no inverse verb, by the rule.
 *
 * The ACTOR is the one spent: the survivor holds the target's tile, which is
 * where the merged unit stands in Civ 6 too, and this engine seats one
 * military unit to a tile either way. What the survivor keeps beyond the
 * veteran's promotions — its hit points, and that it ends the turn — is this
 * model's, recorded: no source publishes either.
 */
export function formUp(state: GameState, unit: Unit, tileIndex: number): RuleResult {
  const seat = unitSeat(unit);
  if (unitDomain(unit.type) !== 'military') return { ok: false, reason: 'Not a military unit.' };
  // CIV6 (Giant Death Robot): "Cannot form Corps or Armies by any means."
  if (formationBanned(unit.type)) return { ok: false, reason: 'This chassis forms nothing.' };
  if (unit.movesLeft <= 0) return { ok: false, reason: 'No movement left.' };
  const host = state.units.find(
    (u) => u.tileIndex === tileIndex && u.id !== unit.id && u.type === unit.type
      && unitSeat(u) === seat,
  );
  if (!host) return { ok: false, reason: 'No unit of this type to join.' };
  const tier = (host.formation ?? 0) + (unit.formation ?? 0) + 1;
  if (tier > FORMATION_MAX) return { ok: false, reason: 'Nothing larger than an Army.' };
  const civic = FORMATION_CIVIC[tier];
  if (civic && !isCivicComplete(state, civic, seat)) return { ok: false, reason: `${civic} is not in.` };
  const vet = veteranOf(host, unit);
  host.formation = tier;
  host.level = vet.level;
  host.xp = vet.xp;
  host.xpPct = vet.xpPct;
  host.promos = vet.promos;
  host.promoUsed = vet.promoUsed;
  host.hp = vet.hp;
  host.movesLeft = 0;
  host.fortifyTurns = 0;
  disbandUnit(state, unit.id);
  return { ok: true };
}

export function condemnHeretic(state: GameState, unit: Unit, tileIndex: number): RuleResult {
  if ((UNITS[unit.type]?.combat ?? 0) <= 0) return { ok: false, reason: 'Not a military unit.' };
  const target = state.units.find(
    (u) => u.tileIndex === tileIndex && (UNITS[u.type]?.religiousStrength ?? 0) > 0
      && unitSeat(u) !== unitSeat(unit),
  );
  if (!target) return { ok: false, reason: 'No enemy religious unit there.' };
  if (!civsAtWar(state, unitSeat(unit), unitSeat(target))) {
    return { ok: false, reason: 'Not at war with its owner.' };
  }
  const loser = unitSeat(target);
  // WORLD RELIGION outcome B pays the CONDEMNER for the act.
  const condemner = seatOf(state, unitSeat(unit));
  if (condemner) condemner.diplomaticFavor += congressCondemnFavor(state, loser);
  const nRel = state.seats.length;
  const dt = state.map.tiles[tileIndex];
  for (const c of allCities(state)) {
    const ct = state.map.tiles[c.centerIndex];
    if (hexDistance(dt.col, dt.row, ct.col, ct.row) > CONDEMN_PRESSURE_RANGE) continue;
    let pres = c.religionPressure;
    if (!pres || pres.length !== nRel) {
      pres = new Array(nRel).fill(0);
      c.religionPressure = pres;
    }
    pres[loser] = Math.max(0, pres[loser] - CONDEMN_PRESSURE_SWING);
  }
  disbandUnit(state, target.id);
  unit.movesLeft = 0;
  return { ok: true };
}

/**
 * CIV6 (Inquisitor): "Using one charge in a City Center tile removes all
 * religions ... from that city, besides your own", and Gathering Storm leaves
 * a quarter of each standing: "Only remove 75% presence of other Religions
 * instead of 100%."
 */
export function removeHeresy(state: GameState, unit: Unit): RuleResult {
  if (unit.type !== 'INQUISITOR') return { ok: false, reason: 'Not an Inquisitor.' };
  if ((unit.charges ?? 0) <= 0) return { ok: false, reason: 'No charges left.' };
  const here = state.map.tiles[unit.tileIndex];
  const city = citiesOf(state, unitSeat(unit)).find((c) => c.centerIndex === unit.tileIndex);
  if (!city || here.district !== 'CITY_CENTER') return { ok: false, reason: 'Not in one of your City Centers.' };
  const mine = unitSeat(unit);
  const pres = city.religionPressure;
  if (pres) {
    for (let g = 0; g < pres.length; g++) {
      if (g === mine) continue;
      pres[g] = Math.floor(pres[g] * (100 - REMOVE_HERESY_PCT) / 100);
    }
  }
  unit.charges = (unit.charges ?? 0) - 1;
  unit.movesLeft = 0;
  return { ok: true };
}

/**
 * CIV6 (Heathen Conversion): "Can convert all adjacent Barbarians to your side
 * by using a religious charge."
 *
 * The converts join their new owner in NEIGHBOUR-RING order on both engines —
 * the pooled twin appends them in that order, and an array-order walk that
 * disagreed would hand the next turn's orders to the wrong units.
 */
export function convertHeathens(state: GameState, unit: Unit, actor: Seat): RuleResult {
  if (!promoFlag(unit, 'HEATHEN')) return { ok: false, reason: 'No such promotion.' };
  if ((unit.charges ?? 0) <= 0) return { ok: false, reason: 'No charges left.' };
  const here = state.map.tiles[unit.tileIndex];
  const got: Unit[] = [];
  for (const t of neighbors(state.map, here)) {
    for (const u of unitsAt(state, t.index)) if (isBarbSeat(u.seat)) got.push(u);
  }
  if (got.length === 0) return { ok: false, reason: 'No Barbarians adjacent.' };
  for (const u of got) reseatUnit(state, u, actor.seat);
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  if ((unit.charges ?? 0) <= 0) disbandUnit(state, unit.id);
  return { ok: true };
}

/**
 * CIV6 (Apostle): "Launch Inquisition (only possible if your Religion hasn't
 * unlocked Inquisitors), consumes Apostle, must have at least 3 charges" — and
 * the Inquisitor page adds that the Apostle must use it "within your
 * territory".
 */
export function launchInquisition(state: GameState, unit: Unit, actor: Seat): RuleResult {
  if (unit.type !== 'APOSTLE') return { ok: false, reason: 'Not an Apostle.' };
  if (actor.religion.inquisition) return { ok: false, reason: 'Already launched.' };
  if ((unit.charges ?? 0) < LAUNCH_INQUISITION_CHARGES) return { ok: false, reason: 'Needs 3 charges.' };
  const here = state.map.tiles[unit.tileIndex];
  if (tileSeat(here) !== actor.seat) return { ok: false, reason: 'Must stand in your own territory.' };
  actor.religion.inquisition = true;
  disbandUnit(state, unit.id);
  return { ok: true };
}

/**
 * CIV6 (Apostle): "Acquire 1 Religious Promotion at the time of purchase...
 * The player may choose between three promotions randomly chosen from the
 * pool. If the player is the Suzerain of Yerevan, they are free to choose from
 * the entire pool... if the player owns Mont St. Michel, all Apostles
 * automatically receive the Martyr promotion in addition to another one they
 * choose normally."
 *
 * The draw takes three DISTINCT columns without replacement, so the stream is
 * exactly three numbers however the offer lands.
 */
function offerApostlePromotions(state: GameState, unit: Unit, seat: number): void {
  const rows = unitPromoRows(unit);
  const all = (1 << rows.length) - 1;
  const free = suzerainEffect(state, seat, 'apostlePromoChoice');
  let offer = 0;
  for (let j = 0; j < APOSTLE_PROMO_OFFER; j++) {
    let pick = Math.floor(nextRandom(state) * (rows.length - j));
    for (let k = 0; k < rows.length; k++) {
      if (offer & (1 << k)) continue;
      if (pick === 0) { offer |= 1 << k; break; }
      pick -= 1;
    }
  }
  unit.promoOffer = free ? all : offer;
  // An Apostle never levels, so the one promotion it may take is its level-2
  // rung and nothing more.
  unit.xp = XP_PER_LEVEL;
  if (seatWonderFlag(state, seat, 'apostleMartyr')) {
    const k = rows.findIndex((p) => p.id === 'MARTYR');
    if (k >= 0) unit.promos = (unit.promos ?? 0) | (1 << k);
  }
}

export function purchaseReligiousUnit(
  state: GameState,
  cityId: number,
  unitType: 'MISSIONARY' | 'APOSTLE' | 'INQUISITOR' | 'WARRIOR_MONK',
  seat: number,
): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  // CIV6 (Warrior Monk): "It can only be purchased with Faith in a city that
  // has a majority religion with the Warrior Monks Follower Belief and a Holy
  // Site with a Temple." The belief is the CITY's majority religion's, which
  // need not be the buyer's own, so this arm asks nothing of `buyer.religion`.
  if (unitType === 'WARRIOR_MONK') return purchaseWarriorMonk(state, city, buyer, seat);
  if (!buyer.religion.founded) return { ok: false, reason: 'No founded religion.' };
  // CIV6: "You can only create Inquisitors if you have founded a religion and
  // had an Apostle use the Launch Inquisition ability within your territory."
  if (unitType === 'INQUISITOR' && !buyer.religion.inquisition) {
    return { ok: false, reason: 'No Inquisition has been launched.' };
  }
  const cap = unitType === 'MISSIONARY' ? MISSIONARY_CAP
    : unitType === 'APOSTLE' ? APOSTLE_CAP : INQUISITOR_CAP;
  const live = state.units.filter((u) => u.seat === seat && u.type === unitType).length;
  if (live >= cap) return { ok: false, reason: `${unitType} cap reached.` };
  const eb = buyer.religion.enhancer ? ENHANCER_BELIEFS[buyer.religion.enhancer]?.effects : undefined;
  const cost = unitType === 'MISSIONARY'
    ? Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1))
    : Math.round(UNITS[unitType].cost);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  // CIV6 (Missionary / Apostle / Inquisitor): purchased "in a city that has a
  // majority religion and a Holy Site" with the tier's building — the
  // majority is its own gate, whichever religion it is, exactly as the
  // Warrior Monk arm reads it.
  if ((city.followedReligion ?? -1) < 0) return { ok: false, reason: 'The city follows no religion.' };
  if (!city.buildings.includes('SHRINE')) return { ok: false, reason: 'Needs a Shrine.' };
  // CIV6: "the Apostle and the Guru require a Temple, and the Inquisitor
  // requires both a Temple and an Apostle ... to have previously Launched an
  // Inquisition."
  if (unitType !== 'MISSIONARY' && !city.buildings.includes('TEMPLE')) {
    return { ok: false, reason: 'Needs a Temple.' };
  }
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  if (!ht?.districtComplete || ht.districtPillaged) {
    return { ok: false, reason: 'Needs a complete, unpillaged Holy Site.' };
  }
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  if (unitType === 'MISSIONARY' && eb?.missionaryChargeBonus) u.charges = (u.charges ?? 0) + eb.missionaryChargeBonus;
  if (unitType === 'APOSTLE') {
    offerApostlePromotions(state, u, seat);
    patronSaint(state, city, u);
  }
  // CIV6 (GS Civilopedia, Exodus of the Evangelists, Golden face): "newly
  // trained ones get +2 Charges" — Missionaries and Apostles alike.
  if (goldenDedication(state, seat, DED_EXODUS)) u.charges = (u.charges ?? 0) + 2;
  return { ok: true };
}

function purchaseWarriorMonk(state: GameState, city: City, buyer: Seat, seat: number): RuleResult {
  const rel = city.followedReligion ?? -1;
  if (rel < 0) return { ok: false, reason: 'The city follows no religion.' };
  if (seatOf(state, rel)?.religion.follower !== 'WARRIOR_MONKS') {
    return { ok: false, reason: 'The majority religion has no Warrior Monks belief.' };
  }
  if (!city.buildings.includes('TEMPLE')) return { ok: false, reason: 'Needs a Temple.' };
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  if (!ht?.districtComplete || ht.districtPillaged) {
    return { ok: false, reason: 'Needs a complete, unpillaged Holy Site.' };
  }
  const cost = Math.round(UNITS.WARRIOR_MONK.cost);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, 'WARRIOR_MONK', city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  patronSaint(state, city, u);
  return { ok: true };
}

/** CIV6 (Patron Saint): "Apostles and Warrior Monks trained in the city
 *  receive 1 extra Promotion when receiving their first promotion." Both are
 *  faith purchases, so this is every site that can train one. */
function patronSaint(state: GameState, city: City, unit: Unit): void {
  const n = governorSum(state, city, (e) => e.firstPromoBonus);
  if (n > 0) unit.promoBonus = n;
}

/** CIV6 (GS Civilopedia, Monumentality, Golden face): "May purchase civilian
 *  units with Faith. Builders and Settlers are 30% cheaper to purchase with
 *  Faith and Gold." Faith prices at FAITH_PURCHASE_MULT (1 faith = 0.5
 *  production = 2 gold), and the 30% multiplies LAST so both engines share
 *  one association. */
export function purchaseCivilianWithFaith(
  state: GameState,
  cityId: number,
  unitType: 'BUILDER' | 'SETTLER',
  seat: number,
): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  if (!goldenDedication(state, seat, DED_MONUMENTALITY)) {
    return { ok: false, reason: 'Needs the Monumentality dedication in a Golden Age.' };
  }
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (unitType === 'SETTLER' && getModifiers(state, seat).noSettlers) {
    return { ok: false, reason: 'Isolationism forbids Settlers.' };
  }
  if (unitType === 'SETTLER' && city.population < 2) {
    return { ok: false, reason: 'A city of 1 population cannot buy a settler.' };
  }
  const base = unitType === 'SETTLER' ? settlerCost(state, seat) : builderCost(state, seat);
  const cost = base * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, seat);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  // Purchased settlers cost the pop too (real Civ 6); a purchased builder
  // escalates builderCost like a trained one.
  if (unitType === 'SETTLER') city.population = Math.max(1, city.population - 1);
  else buyer.buildersTrained += 1;
  return { ok: true };
}

/**
 * BUY a NATURALIST with faith. CIV6: "It can only be purchased with
 * Faith in any city" — no Holy Site, no Monumentality, no production column
 * anywhere; the unit's own `cost` IS its faith price, like the religious
 * units'. The CONSERVATION civic is the unlock, and the buyer needs a city to
 * spawn beside.
 */
export function purchaseNaturalist(state: GameState, cityId: number, seat: number): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const def = UNITS.NATURALIST;
  if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) {
    return { ok: false, reason: 'Needs the Conservation civic.' };
  }
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cost = naturalistCost(state, seat);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, 'NATURALIST', city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  return { ok: true };
}

/**
 * BUY a ROCK BAND with faith. CIV6: it "can only be purchased with Faith"
 * and its "Faith cost is progressive" — each band this seat has already
 * bought raises the next one's price by the base.
 */
export function purchaseRockBand(state: GameState, cityId: number, seat: number): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const def = UNITS.ROCK_BAND;
  if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) {
    return { ok: false, reason: 'Needs the Professional Sports civic.' };
  }
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cost = rockBandCost(state, seat);
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, 'ROCK_BAND', city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  u.bandLevel = 1;
  u.bandAlbum = 0;
  buyer.faith = (buyer.faith ?? 0) - cost;
  buyer.rockBandsBought = (buyer.rockBandsBought ?? 0) + 1;
  return { ok: true };
}

/** the live faith price: base x (1 + bands already bought). */
export function rockBandCost(state: GameState, seat: number): number {
  const bought = seatOf(state, seat)?.rockBandsBought ?? 0;
  return UNITS.ROCK_BAND.cost * (1 + bought * ROCK_BAND_COST_STEP);
}

/** the live faith price of a Naturalist. Real Civ 6 makes it
 *  PROGRESSIVE; the progression's own magnitude is unsourced, so the flat GS
 *  price stands and the progression is an open AUDIT residual. */
export function naturalistCost(state: GameState, seat: number): number {
  void state;
  void seat;
  return UNITS.NATURALIST.cost;
}

/**
 * CIV6: production is never lost. Taking an item off the queue sends the
 * hammers already spent on it to the city's buffer, which is where this model
 * puts every carried-over hammer — real Civ 6 holds them against the ITEM, so
 * resuming it later resumes where it stopped, and that needs a queue deeper
 * than the one head both engines run.
 */
export function cancelQueueItem(state: GameState, cityId: number, index: number, seat: number): void {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city || index < 0 || index >= city.queue.length) return;
  const item = city.queue[index];
  city.productionBank = (city.productionBank ?? 0) + item.progress;
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

export function itemCost(item: QueueItem, state?: GameState, city?: City): number {
  if (item.kind === 'district') return item.cost ?? DISTRICTS[item.district].cost;
  if (item.kind === 'wonder') return BUILT_WONDERS[item.wonder].cost;
  if (item.kind === 'settler') return item.cost;
  if (item.kind === 'unit') return item.cost ?? UNITS[item.unit]?.cost ?? 54; // builders lock at queue
  if (item.kind === 'project') return item.cost;
  return state && city ? buildingCostIn(state, city, item.building) : BUILDINGS[item.building].cost;
}

/**
 * CIV6 (Military Engineer): "Can spend a charge to complete 20% of an
 * engineering type of district (Aqueduct, Bath, Canal, Dam) and Flood Barrier
 * building." The Bath is Rome's unique Aqueduct, which this model has no
 * carrier for.
 */
export const ENGINEER_FINISH_FRACTION = 0.2;
export const ENGINEER_FINISH_DISTRICTS: readonly DistrictId[] = ['AQUEDUCT', 'CANAL', 'DAM'];
export const ENGINEER_FINISH_BUILDING = 'FLOOD_BARRIER';

/**
 * The city whose head a charge spent at `tileIndex` would advance, or
 * undefined. A district's charge is spent ON the site it is being dug at; the
 * Flood Barrier is a building, so its charge is spent at the city centre.
 */
export function engineerFinishCity(state: GameState, seat: number, tileIndex: number): City | undefined {
  for (const city of citiesOf(state, seat)) {
    const q = city.queue[0];
    if (!q) continue;
    if (q.kind === 'district' && q.tileIndex === tileIndex
        && ENGINEER_FINISH_DISTRICTS.includes(q.district)) return city;
    if (q.kind === 'building' && q.building === ENGINEER_FINISH_BUILDING
        && city.centerIndex === tileIndex) return city;
  }
  return undefined;
}

export function engineerFinish(state: GameState, seat: number, tileIndex: number): boolean {
  const city = engineerFinishCity(state, seat, tileIndex);
  if (!city) return false;
  const q = city.queue[0];
  q.progress += Math.round(itemCost(q, state, city) * ENGINEER_FINISH_FRACTION);
  return true;
}

/**
 * CIV6 (Royal Society): the city whose DISTRICT PROJECT a Builder standing at
 * `tileIndex` would pay into. The charge is spent ON the district running the
 * project, so the plot must carry that project's own district and belong to
 * the city whose queue head it is. The City Center project answers for
 * nobody — a repair is not a district project.
 */
export function projectBoostCity(state: GameState, seat: number, tileIndex: number): City | undefined {
  const t = state.map.tiles[tileIndex];
  if (!t?.district || !t.districtComplete || t.districtPillaged) return undefined;
  if (tileSeat(t) !== seat) return undefined;
  for (const city of citiesOf(state, seat)) {
    const q = city.queue[0];
    if (q?.kind !== 'project') continue;
    if (PROJECTS[q.project]?.district !== t.district) continue;
    if (city.districts.some((d) => d.tileIndex === tileIndex)) return city;
  }
  return undefined;
}

/**
 * CIV6 (Royal Society): "Builders gain the ability to use ALL of their charges
 * to provide bonus Production to a District Project. Once per city per turn"
 * — 2% of the project's Production cost per charge spent. The whole bank goes
 * in one blow, so the Builder is spent with it.
 */
export function boostProject(state: GameState, unit: Unit, actor: Seat): RuleResult {
  if (unit.type !== 'BUILDER') return { ok: false, reason: 'Not a Builder.' };
  const charges = unit.charges ?? 0;
  if (charges <= 0) return { ok: false, reason: 'No charges left.' };
  const pct = seatBuildingSum(state, actor.seat, 'projectChargePct');
  if (pct <= 0) return { ok: false, reason: 'No Royal Society.' };
  const city = projectBoostCity(state, actor.seat, unit.tileIndex);
  if (!city) return { ok: false, reason: 'No district project here.' };
  if ((city.projectBoostTurn ?? 0) === state.turn) return { ok: false, reason: 'Already paid this turn.' };
  const q = city.queue[0];
  if (q.kind !== 'project') return { ok: false, reason: 'No district project here.' };
  q.progress += Math.round(q.cost * pct * charges / 100);
  city.projectBoostTurn = state.turn;
  unit.charges = 0;
  unit.movesLeft = 0;
  disbandUnit(state, unit.id);
  return { ok: true };
}

export function itemLabel(item: QueueItem): string {
  if (item.kind === 'district') return DISTRICTS[item.district].name;
  if (item.kind === 'wonder') return BUILT_WONDERS[item.wonder].name;
  if (item.kind === 'settler') return 'Settler';
  if (item.kind === 'unit') return UNITS[item.unit]?.name ?? item.unit;
  if (item.kind === 'project') return PROJECTS[item.project]?.name ?? item.project;
  return BUILDINGS[item.building].name;
}

/** CIV6 (Veterancy): "+30% Production toward Encampment districts, Harbor
 * districts, and buildings for these districts." */
export function isEncampHarborItem(item: QueueItem): boolean {
  if (item.kind === 'district') return item.district === 'ENCAMPMENT' || item.district === 'HARBOR';
  if (item.kind !== 'building') return false;
  const d = BUILDINGS[item.building]?.district;
  return d === 'ENCAMPMENT' || d === 'HARBOR';
}


/** Gold price of a tile. Real Civ 6: ring-based base (50 for ring
 * ≤2, 75 for ring 3, +25/ring beyond as a scope extension), speed-scaled,
 * × (1 + 4·research progress), +5 (scaled) per tile EVER purchased
 * empire-wide — fully decoupled from the culture-growth counter. Without a
 * target tile (UI headline price) the ring-2 base is shown. */
export function tilePurchaseCost(
  state: GameState,
  city: City | City,
  tileIndex?: number,
  owner?: { research: ResearchState; tilesPurchased?: number; mods: Modifiers },
): number {
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
  // gained — which is why the claim goes through `acquireTile`: a
  // hand-copied `setTileOwner` here would leave `tilesAcquired` behind.
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




export function endTurn(state: GameState): void {
  if (state.unitsMode) {
    refreshUnits(state);
    barbarianPhase(state);
  }
  if (state.disasters) disasterPhase(state);
  cityStatePhase(state);
  minorBuildPhase(state);
  seatPhase(state);


  theologicalCombatPhase(state);
  spreadReligiousPressure(state);
  climateTurn(state);

  state.turn += 1;
  eraBoundary(state);
  eraInspirations(state);
  worldCongress(state); // era-score window reset at ERA_LENGTH multiples (GPU mirrors at its turn increment)
  // THE EXOPLANET FLIGHT — CIV6: the craft covers 1 light-year/turn plus one
  // per completed laser station, and the win fires on ARRIVAL, not launch.
  // Ascending seat order + the victoryType guard: a same-turn tie goes to the
  // lowest row, and an already-won space game keeps its victor.
  for (const s of state.seats) {
    if ((s.spaceLy ?? -1) < 0) continue;
    s.spaceLy = (s.spaceLy ?? 0) + 1 + laserSpeed(state, s.seat);
    if (s.spaceLy >= SPACE_FLIGHT_LY && state.victoryType !== 3) {
      state.victoryType = 3;
      state.victoryRow = s.seat;
      state.eventLog.push('Science Victory! The Exoplanet Expedition has arrived.');
    }
  }
  // Domination ends the game the instant a civ holds every capital;
  // otherwise the score victory fires at TURN_LIMIT. Detection only — no freeze
  // Detection is indicator-only, so with no domination this stays inert.
  const dom = dominationWinner(state);
  const spaceWon = state.victoryType === 3;
  const rel = religiousVictor(state);
  const cul = rel >= 0 ? -1 : cultureVictor(state);
  // DIPLOMATIC victory — 20 Diplomatic Victory Points, real
  // Civ 6's threshold. Checked LAST of the real conditions: precedence is
  // space > domination > religion > culture > DIPLOMATIC > score.
  const dip = rel >= 0 || cul >= 0 ? -1 : diplomaticVictor(state);
  state.gameOver = spaceWon || dom >= 0 || rel >= 0 || cul >= 0 || dip >= 0 || state.turn > TURN_LIMIT;
  state.victoryType = spaceWon
    ? state.victoryType
    : dom >= 0
      ? 2
      : rel >= 0
        ? 4
        : cul >= 0
          ? 5
          : dip >= 0
            ? 6
            : state.gameOver
              ? 1
              : 0;
  state.victoryRow = spaceWon
    ? (state.victoryRow ?? -1)
    : dom >= 0
      ? dom
      : rel >= 0
        ? rel
        : cul >= 0
          ? cul
          : dip >= 0
            ? dip
            : -1;
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
 * CIV6 (Victory): "The visiting tourists from each opponent are calculated
 * as the total amount of Tourism you've sent to them over the entire game,
 * divided by (200 * number of civs)", and a civ is culturally dominant over
 * an opponent when its COMBINED visiting total beats that opponent's
 * domestic count. Both halves of the per-rival bank already carry their
 * international modifiers from the accrual (`bankTourismPerRival`).
 *
 * Both counts floor to whole tourists, so this is integer-exact and zero-draw.
 *
 * Returns the winning SEAT id, or -1. A civ
 * with NO cities cannot win (a dead civ attracts nobody); the ascending scan
 * breaks ties toward the lowest id, and the > comparison means two civs can
 * never both qualify against each other.
 */
function cultureVictor(state: GameState): number {
  const nCivs = state.seats.length;
  const visitDiv = nCivs * TOURISM_PER_VISITOR_PER_CIV;
  const alive = state.seats.map((sx) => sx.cities.length > 0);
  const culture = state.seats.map((sx) => sx.cultureTotal ?? 0);
  // Milli-rounded before the floor: culture is a non-dyadic float accumulator,
  // so a sub-milli drift must not move a tourist count across engines (the
  // GS bankruptcy-test convention).
  const domestic = culture.map((c) => Math.floor(Math.round(c * 1000) / 1000 / CULTURE_PER_DOMESTIC_TOURIST));
  for (let c = 0; c < nCivs; c++) {
    if (!alive[c]) continue;
    const sx = state.seats[c];
    let visiting = 0;
    for (let o = 0; o < nCivs; o++) {
      if (o === c) continue;
      visiting += Math.floor(((sx.tourismTo?.[o] ?? 0) + (sx.tourismReligiousTo?.[o] ?? 0)) / visitDiv);
    }
    let all = true;
    for (let o = 0; o < nCivs; o++) {
      if (o === c) continue;
      if (visiting <= domestic[o]) {
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
 * CIV6 (Vilnius's suzerain): "When you enter a new era, earn 1 random
 * Inspiration from that era." Runs at the era boundary, right after
 * `eraBoundary` commits the new age, in ascending seat order. A seat draws
 * only when the new era still holds a civic it has neither unlocked nor
 * triggered — an unpayable seat must not advance the shared stream. The
 * granted Inspiration is an Inspiration like any other, so it pays the Pen,
 * Brush and Voice dedication the same way a detected one does.
 */
function eraInspirations(state: GameState): void {
  if (state.turn % ERA_LENGTH !== 0) return;
  const era = ERAS[Math.min(Math.floor(state.turn / ERA_LENGTH), ERAS.length - 1)];
  for (let seat = 0; seat < state.seats.length; seat++) {
    const sx = seatOf(state, seat);
    if (!sx || !suzerainEffect(state, seat, 'eraInspiration')) continue;
    const rsr = sx.research;
    const open = Object.values(CIVICS).filter(
      (c) => c.era === era && !rsr.civics.includes(c.id) && !rsr.boosted.includes(c.id),
    );
    if (open.length === 0) continue;
    rsr.boosted.push(open[Math.floor(nextRandom(state) * open.length)].id);
    dedicationEvent(state, seat, DED_PEN_BRUSH_AND_VOICE);
  }
}

/**
 * THEOLOGICAL COMBAT — ONE pass, every seat, at one point in the schedule.
 *
 * Only an APOSTLE initiates (real Civ 6 also allows Inquisitors — out of
 * scope), and only against an ADJACENT religious unit of a DIFFERENT religion.
 * Both sides roll `damageRoll` on the wounded RELIGIOUS-STRENGTH difference; a
 * unit at 0 HP dies; the loser's religion sheds THEO_PRESSURE_SWING in every
 * city within THEO_PRESSURE_RANGE of the fallen unit while the winner's gains
 * it. Two damage draws per fight — the defender's wound, then the attacker's —
 * ahead of the martyr rolls.
 *
 * ORDER is `state.units` ARRAY order for both the attacker walk and the
 * defender pick — this codebase's shared convention, which the GPU mirrors
 * with slot order (capture moves a unit to the END of both). An id tie-break
 * was a parity bug: after a capture an id no longer reflects array
 * position.
 *
 * WHY IT IS A PHASE AND NOT A VERB: the fight was never a choice — an apostle
 * standing next to an enemy apostle fights, before it can spread. Inside a
 * scripted walk it would run only for undriven seats and go inert the moment
 * the wire took that seat's decisions. It is an eager RULE at ONE schedule
 * position — after every seat's turn, before the pressure spread reads the
 * swing — so it
 * belongs to no seat and inherits no replay-position fork.
 */
function theologicalCombatPhase(state: GameState): void {
  const nRel = state.seats.length;
  const relStr = (u: Unit): number => UNITS[u.type]?.religiousStrength ?? 0;
  for (const att of [...state.units]) {
    // CIV6: "only Apostles and Inquisitors can initiate theological combat...
    // Missionaries and Gurus may become the target of such an attack, but they
    // may not initiate it themselves."
    if ((att.type !== 'APOSTLE' && att.type !== 'INQUISITOR') || att.hp <= 0) continue;
    if (!state.units.includes(att)) continue; // already fell this pass
    const at = state.map.tiles[att.tileIndex];
    const g = unitSeat(att);
    let def: Unit | null = null;
    for (const u of state.units) {
      if (relStr(u) <= 0) continue;
      if (unitSeat(u) === g) continue; // same religion — no contest
      // CIV6: "Theological combat cannot happen between two Embarked units;
      // however, it can happen between an Embarked unit and another one on the
      // shore." No amphibious penalty either — "this isn't physical combat".
      if (att.embarked && u.embarked) continue;
      const ut = state.map.tiles[u.tileIndex];
      if (hexDistance(at.col, at.row, ut.col, ut.row) !== 1) continue;
      def = u;
      break;
    }
    if (!def) continue;
    // CIV6: "Since the Fall 2017 Update, Flanking and Support bonuses apply in
    // theological combat" — the same two counts a melee exchange uses, since
    // theological combat "follows the same rules of engagement as melee
    // combat". The location bonuses are the DEFENDER's alone.
    const atkStr = theoStrength(state, att)
      + FLANKING_CS * theoFlankCount(state, def.tileIndex, att)
      + visibilityCS(state, g, unitSeat(def))
      + allianceTheoCS(state, g, unitSeat(def));
    const defStr = theoStrength(state, def)
      + theoDefenseStrength(state, def, state.map.tiles[def.tileIndex])
      + SUPPORT_CS * theoSupportCount(state, def.tileIndex, def)
      + visibilityCS(state, unitSeat(def), g)
      + allianceTheoCS(state, unitSeat(def), g);
    def.hp -= damageRoll(state, atkStr - defStr, 'theo', def.tileIndex);
    att.hp -= damageRoll(state, defStr - atkStr, 'theoc', att.tileIndex);
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
    // RELICS. CIV 6 creates one when the Apostle killed here HELD the MARTYR
    // promotion — one of the nine it chose from at purchase. A dead Missionary
    // or Inquisitor yields nothing; neither carries the promotion list.
    // Granted in the SAME order as the two disbands below (defender first,
    // then attacker) so the relic's slot is order-exact across engines.
    const martyrs = (u: Unit): boolean => promoFlag(u, 'MARTYR');
    // Capacity is the TEMPLE's slot plus any wonder's and the any-work pool's,
    // so the closure resolves completeness off the tile the way the
    // Great-Works path does.
    const relicSlots = relicSlotsIn(state);
    // CIV6: a Relic that finds no open slot waits in reserve for one to open;
    // `drainRelicReserve` hands it out at the owner's next turn.
    const reserve = (sx: number) => {
      const owner = seatOf(state, sx);
      if (owner) owner.relicReserve = (owner.relicReserve ?? 0) + 1;
    };
    if (def.hp <= 0 && martyrs(def)
        && !placeRelic(citiesOf(state, unitSeat(def)), relicSlots)) reserve(unitSeat(def));
    if (att.hp <= 0 && martyrs(att)
        && !placeRelic(citiesOf(state, g), relicSlots)) reserve(g);
    if (def.hp <= 0) disbandUnit(state, def.id);
    if (att.hp <= 0) disbandUnit(state, att.id);
    // CIV6: "If the defender is killed, the attacker enters its tile, just like
    // in melee combat" — the ATTACKER's advance only, and only if it survived.
    if (def.hp <= 0 && att.hp > 0 && tileFreeForUnit(state, def.tileIndex, 0, att)) {
      att.tileIndex = def.tileIndex;
      // a victor that comes ashore stops being embarked: `stepUnit`'s own
      // transition rule, which a direct tile write does not reach.
      att.embarked = isWater(state.map.tiles[def.tileIndex]);
    }
  }
}

function spreadReligiousPressure(state: GameState): void {
  const nRel = state.seats.length;
  const sources: number[][] = state.seats.map(() => []);
  for (const sx of state.seats) {
    const r = sx.religion;
    if (r.founded && r.holyTile != null && r.holyTile >= 0) sources[sx.seat].push(r.holyTile);
  }
  if (!sources.some((src) => src.length > 0)) return; // no religion exists yet — nothing to spread
  /* CIV6 (Jerusalem's suzerain): "Your cities with Holy Sites exert pressure
   * as if they were Holy Cities (4x Religion pressure on all cities within 10
   * tiles)." Only Holy Cities exert pressure in this engine, so each
   * completed-Holy-Site city becomes one more source at the holy city's own
   * rate and range. */
  for (const sx of state.seats) {
    if (sources[sx.seat].length === 0) continue; // the perk spreads a religion, so it needs one
    if (!suzerainEffect(state, sx.seat, 'holySitePressure')) continue;
    for (const city of sx.cities) {
      if (city.centerIndex === sources[sx.seat][0]) continue; // the Holy City already exerts
      const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
      if (!hs) continue;
      const ht = state.map.tiles[hs.tileIndex];
      if (ht.districtComplete && !ht.districtPillaged) sources[sx.seat].push(city.centerIndex);
    }
  }
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
    // CIV6 (Citadel of God): "City ignores pressure ... from Religions not
    // founded by the Governor's player."
    const deaf = governorFlag(state, city as City, (e) => e.ignoreForeignPressure);
    for (let g = 0; g < nRel; g++) {
      if (deaf && g !== city.seat) continue;
      // CIV6 (Religious alliance 1): allies' religions exert no pressure on
      // each other's cities.
      if (g !== city.seat && alliedAtLevel(state, city.seat, g, ALLIANCE_RELIGIOUS, 1)) continue;
      for (const src of sources[g]) {
        const h = tiles[src];
        if (hexDistance(cc.col, cc.row, h.col, h.row) > range[g]) continue;
        // CIV6 (Bishop): "Religious pressure to adjacent cities is 100%
        // stronger from this city."
        pres[g] += RELIGION_PRESSURE_PER_TURN * governorTileMult(state, h, (e) => e.pressureMult);
      }
    }
    let best = -1;
    let bestP = 0;
    for (let g = 0; g < nRel; g++) {
      if (pres[g] > bestP) {
        bestP = pres[g];
        best = g;
      }
    }
    const wasFollowed = city.followedReligion ?? -1;
    city.followedReligion = best >= 0 ? best : null;
    if (best >= 0 && best !== wasFollowed) dedicationEvent(state, best, DED_EXODUS);
  }
}


export function toggleLockedTile(state: GameState, cityId: number, tileIndex: number, seat: number): void {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  const tile = state.map.tiles[tileIndex];
  if (!city || !tile || tileCity(tile) !== city.id) return;
  tile.locked = !tile.locked;
}


export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  state.seats ??= [];
  if (state.seats.length === 0) state.seats.push(emptySeat(0));
  for (const sx of state.seats) {
    sx.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} };
    sx.research.boosted ??= [];
    sx.government ??= { current: null, policies: [], held: 0 };
    sx.government.held ??= 0;
    sx.religion ??= { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null };
    sx.religion.enhancer ??= null;
    sx.buildersTrained ??= 0;
    sx.relicReserve ??= 0;
    sx.tilesPurchased ??= 0;
    sx.bestMeleeCS ??= Math.max(
      0,
      ...state.units
        .filter((u) => u.seat === sx.seat && !UNITS[u.type]?.ranged)
        .map((u) => UNITS[u.type]?.combat ?? 0),
    );
  }
  state.claimedGreatPeople ??= [];
  if (!state.gpOffer || state.gpOffer.length !== GP_CLASSES.length) state.gpOffer = GP_CLASSES.map((_, i) => state.gpOffer?.[i] ?? -1);
  if (!state.gpPrice || state.gpPrice.length !== GP_CLASSES.length) state.gpPrice = GP_CLASSES.map((_, i) => state.gpPrice?.[i] ?? 0);
  for (const t of state.map.tiles) {
    t.builtWonder ??= null;
    t.builtWonderComplete ??= false;
  }
  state.unitsMode ??= false;
  state.units ??= [];
  state.nextUnitId ??= 0;
  state.rngState ??= (state.map.seed ^ 0x9e3779b9) >>> 0;
  const legacyCamps = (state as unknown as { barbCamps?: number[] }).barbCamps;
  state.barbSeat ??= { ...emptySeat(BARB_SEAT), camps: legacyCamps ?? [] };
  state.barbSeat.camps ??= legacyCamps ?? [];
  for (const cityState of state.cityStates ?? []) {
    Object.assign(cityState, { ...emptySeat(seatOfCityState(cityState.id)), ...cityState });
  }
  resolveSuzerains(state);
  for (const s of allSeats(state)) {
    s.wars ??= [];
    s.formalWars ??= [];
    s.denounced ??= {};
  }
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
  state.seats ??= []; // seats IS the actor storage now
  // Foreign cities became full City objects; older saves carry the
  // scalar shape (growthBox, no queue/districts/…). Fill ONLY the missing
  // fields in place — a current-shape save must round-trip byte-identically
  // (the seat determinism test serializes and compares).
  for (const r of state.seats) {
    r.research ??= { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} };
    r.treasury ??= 0;
    for (const civCity of r.cities as (City & { growthBox?: number })[]) {
      civCity.seat ??= r.seat;
      civCity.foodBox ??= civCity.growthBox ?? 0;
      delete civCity.growthBox;
      civCity.cultureBox ??= 0;
      civCity.focus ??= 'balanced';
      civCity.queue ??= [];
      civCity.isCapital ??= false;
      civCity.origCapitalSeat ??= -1;
      civCity.founderSeat ??= civCity.seat;
      civCity.buildings ??= [];
      civCity.districts ??= [{ type: 'CITY_CENTER', tileIndex: civCity.centerIndex }];
      civCity.wonders ??= [];
    }
  }
  state.claimedPantheons ??= [];
  state.claimedBeliefs ??= [];
  state.claimedEnhancers ??= [];
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
    (t as Tile).fertilityProd ??= 0;
    (t as Tile).droughtTurns ??= 0;
  }
  for (const c of allCities(state)) {
    c.cultureBox ??= 0;
    c.tilesAcquired ??= 0;
    c.wonders ??= [];
    // productionBank stays optional (readers use ?? 0) so that adding it
    // here cannot desync serialize(live) vs serialize(roundtripped).
  }
  return state;
}


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
  addEraScore(state, seat, ERA_SCORE_PANTHEON); // seat 0 verb — gate-unreachable, TS-only (actor hook mirrors)
  return { ok: true };
}

export function canFoundReligion(state: GameState, seat: number): RuleResult {
  if (seatOf(state, seat)!.religion.founded) return { ok: false, reason: 'Religion already founded.' };
  if (!seatOf(state, seat)!.religion.pantheon) return { ok: false, reason: 'Choose a pantheon first.' };
  const hasHolySite = seatOf(state, seat)!.cities.some((c) =>
    c.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
  );
  // CIV6 (Stonehenge): "Prophets may found a religion on Stonehenge
  // instead of a Holy Site."
  if (!hasHolySite && !seatWonderFlag(state, seat, 'religionSite')) {
    return { ok: false, reason: 'Needs a completed Holy Site.' };
  }
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
