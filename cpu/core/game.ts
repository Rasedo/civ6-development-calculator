
import type { City, DistrictId, GameState, QueueItem, ResearchState, Tile, Seat, Unit } from './types';
import { dropQueuedBuilding } from './production';
import { GP_CLASSES } from '../data/greatPeople';
import { placeGreatWorkIn } from './greatWorks';
import { GWO_RELIC } from '../data/greatWorks';
import { VALLETTA_FAITH_DISTRICTS, VALLETTA_WALLS_DISCOUNT_PCT } from '../data/cityStates';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { acquireTile, borderCandidates, newCityGrantUnit, seatBuildingSum } from './city';
import { canFoundCity, availableBuildings, buildingCompletable, type RuleResult } from './rules';
import { computeUnlocks, getModifiers, isCivicComplete, goldPrice, faithPrice } from './effects';
import type { Modifiers, Unlocks } from './effects';
import { effectiveResearchCostIn, rosterBoostPoints } from './boosts';
import { spawnUnit, refreshUnits, trainableUnits, disbandUnit, reseatUnit, tileFreeForUnit, builderCost, traderCost, settlerCount, unitsAt, unitDomain, bestTrainableOfClass, purchaseSpotBlocked } from './units';
import { drawPromoOffer, promoFlag, unitPromoRows } from './promotions';
import { logXpWrite, logPopWrite } from './difflog';
import { applyTrainingGrants, barbarianPhase, damageRoll, theoStrength, theoFlankCount, theoSupportCount, theoDefenseStrength, FLANKING_CS, SUPPORT_CS } from './combat';
import { revealAround } from './fog';
import { disasterPhase, deriveVolcanoActivity } from './disasters';
import { climateTurn, deriveLowlands, standingRemovable } from './climate';
import { cityStatePhase, suzerainEffect, suzerainLandPurchaseMult } from './cityStates';
import { minorPhase } from './minorBuild';
import { seatPhase, freeCitiesPhase, worldCongress, nextCityName } from './phase';
import { congressCondemnFavor, congressUdtBlockedDistrict, congressUnitBuyMult, CONGRESS_CUR_GOLD } from './congress';
import { grievanceSettledNear, promiseIncursion } from './grievance';
import { PROMISE_CONVERT } from '../data/promises';
import { commitProduction } from './seatTurn';
import { seatWonderFlag } from './wonders';
import { scoreLeader } from './score';
import { gpPermOf } from '../data/greatPeople';
import { ALLIANCE_RELIGIOUS, ALLIANCE_REL3_PRESSURE_PCT, ERA_SCORE_FOUND, ERA_SCORE_RELIGION, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, DIPLO_VICTORY_POINTS, DED_EXODUS, DED_MONUMENTALITY, DED_PEN_BRUSH_AND_VOICE, ERA_LENGTH, COMPETITIONS } from '../data/seats';
import { addEraScore, eraBoundary, buildingDedications, dedicationEvent, goldenBoostBonus, goldenDedication, monumentalityBuyMult } from './eras';
import { UNITS, CITY_MAX_HP, REPAIR_QUIET_TURNS, FORMATION_CIVIC, FORMATION_MAX, SETTLER_COST_STEP } from '../data/units';
import { buildingCostIn, outerPool, wallsMax, fitEncampOuter, encampOuterMissing } from './rules';
import { darkBuildings, laserSpeed, stampBuildingEra } from './yields';
import { competitionOf } from './competition';
import { canRunProject, chargeUnitResource } from './stockpile';
import { FEATURES } from '../../world/features';
import { isWater, deriveContinents, deriveMountainRanges } from '../../world/query';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS, effectiveBuilding } from '../data/buildings';
import { governorFlag, governorSum, governorTileMult } from './governors';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../data/builtWonders';
import { TECHS, ERAS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { nextRandom } from './rand';
import { ENHANCER_BELIEFS, BELIEF_CATALOGS, BELIEF_CLASS_FOLLOWER, BELIEF_SLOTS, RELIGION_INITIAL_BELIEFS, beliefIdAt, worshipBuildingOf, RELIGION_NAMES, RELIGION_PRESSURE_RANGE, RELIGION_PRESSURE_PER_TURN, HOLY_CITY_PRESSURE_MULT, HOLY_SITE_PRESSURE_MULT, followedReligionOf, ROUTE_PRESSURE_DESTINATION, ROUTE_PRESSURE_ORIGIN, routePressureShare, MISSIONARY_CAP, APOSTLE_CAP, INQUISITOR_CAP, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, LAUNCH_INQUISITION_CHARGES, REMOVE_HERESY_PCT, CONDEMN_PRESSURE_RANGE, CONDEMN_PRESSURE_SWING } from '../data/religion';
import { PROJECTS, SPACE_FLIGHT_LY, type ProjectDef } from '../data/projects';
import { CITY_NAMES, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, scaleByGameSpeed } from '../data/constants';
import { srcConst, xml } from '../data/provenance';
import { rowIsFor } from '../data/civilizations';
import type { CivId, LeaderId } from '../../world/roster';
import { BARB_SEAT, allCities, cityHolders, grantFoundingPressure, prophetsOf, citiesOf, civOf, civsAtWar, emptySeat, isBarbSeat, markCityCentre, seatOf, setTileOwner, tileClaimed, tileSeat, unitSeat, visibilityCS, allianceTheoCS, alliedAtLevel, civVariantOf , leaderOf, onHomeContinent, civLevelOf } from './seats';
import { irradiated } from './nuclear';
import { formationBanned } from './units';
import { allRoadsLeadToRome, routeDestCenter } from './trade';

/** CIV6 (GameSpeeds.xml, GameSpeed_Turns): the online game's eight calendar
 *  increments run 35 + 30 + 20 + 20 + 30 + 25 + 60 + 30 turns — 250, past
 *  which the Score decides. */
export const TURN_LIMIT = srcConst('scenario.turnLimit', 250, {
  derived: 'the sum of TurnsPerIncrement over the GAMESPEED_ONLINE GameSpeed_Turns rows',
  inputs: [960, 600, 480, 240, 120, 48, 24, 12].map((m) => xml('GameSpeed_Turns',
    `GameSpeedType=GAMESPEED_ONLINE&MonthIncrement=${m}`, 'TurnsPerIncrement')),
});

export function effectiveResearchCost(state: GameState, seat: number, id: string, baseCost: number): number {
  // A GOLDEN Free Inquiry / Pen-Brush-and-Voice deepens the boost — the
  // RESEARCHING seat's dedication, which is the `seat` this function already
  // takes; the GPU passes the row.
  return effectiveResearchCostIn(seatOf(state, seat)!.research, id, baseCost,
    goldenBoostBonus(state, seat, !TECHS[id]), rosterBoostPoints(state, seat, !TECHS[id]));
}

/** The SPECIALTY base: the price of a Campus and its kin, and the figure the
 *  observation renders where no district is named. */
export const DISTRICT_SPECIALTY_COST = 54;

/**
 * The real Civ 6 curve — floor(base·(1 + 9·max(tech%, civic%))), the tree you
 * are FURTHER through driving the price rather than the average. `base` is
 * REQUIRED: the install gives each row its own (`Districts.Cost` — Aqueduct
 * 36, Canal and Dam 81, Government Plaza and Diplomatic Quarter 30,
 * Neighborhood 54). It speed-scales like every other production cost, and
 * `districtDiscounted` carries the under-represented discount on top.
 */
export function districtCostIn(research: ResearchState, base: number): number {
  const tPct = research.techs.length / Object.keys(TECHS).length;
  const cPct = research.civics.length / Object.keys(CIVICS).length;
  return Math.floor(scaleByGameSpeed(base) * (1 + 9 * Math.max(tPct, cPct)));
}

/** CIV6 (`Districts.CostProgressionParam1`): what the under-represented
 *  discount takes off this row — 40 for every specialty district, 25 for the
 *  Government Plaza and the Diplomatic Quarter. ONE reader, so the price and
 *  the placement preview cannot disagree. */
export function districtDiscountMult(type: DistrictId): number {
  return 1 - (DISTRICTS[type]?.discountPct ?? 40) / 100;
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

/** CIV6 (`Districts.CostProgressionModel`): a district's base against its
 *  OWN model. The NUM_UNDER_AVG_PLUS_TECH rows take the research curve; the
 *  GAME_PROGRESS rows take none here, because their climb is a flat ADD made
 *  after the discount and the variant ratio (`districtProgressAdd`). */
export function districtScaledBase(research: ResearchState, type?: DistrictId): number {
  const base = type !== undefined
    ? (DISTRICTS[type]?.cost ?? DISTRICT_SPECIALTY_COST) : DISTRICT_SPECIALTY_COST;
  return type !== undefined && DISTRICTS[type]?.costProgressGame !== undefined
    ? scaleByGameSpeed(base)
    : districtCostIn(research, base);
}

/** The GAME_PROGRESS climb, added LAST. A civVariant carries its own base and
 *  the same parameter, so a Bath is `18 + term` rather than half of
 *  `36 + term`; folding the term into the base would halve it too. */
export function districtProgressAdd(research: ResearchState, type?: DistrictId): number {
  const p = type === undefined ? undefined : DISTRICTS[type]?.costProgressGame;
  if (p === undefined) return 0;
  const tPct = research.techs.length / Object.keys(TECHS).length;
  const cPct = research.civics.length / Object.keys(CIVICS).length;
  return Math.floor(scaleByGameSpeed(p) * Math.max(tPct, cPct));
}

export function districtCost(state: GameState, seat: number, type?: DistrictId): number {
  // CIV6: the Spaceport's cost is FLAT — it never scales and takes no discount.
  if (type !== undefined && DISTRICTS[type]?.fixedCost) return scaleByGameSpeed(DISTRICTS[type].cost);
  const research = seatOf(state, seat)!.research;
  const base = districtScaledBase(research, type);
  const cost = type !== undefined && districtDiscounted(state, seat, type)
    ? Math.floor(base * districtDiscountMult(type)) : base;
  return (type !== undefined ? districtVariantCost(state, seat, type, cost) : cost)
    + districtProgressAdd(research, type);
}

/** CIV6 (Bath): a civilization's unique district is "cheaper to build" —
 *  the replaced row's price, scaled by the two Districts rows' Cost. */
export function districtVariantCost(state: GameState, seat: number, type: DistrictId, cost: number): number {
  const v = civVariantOf(state, seat, DISTRICTS[type]?.civVariants);
  return v ? Math.floor(cost * v.cost / DISTRICTS[type].cost) : cost;
}

/** Fresh game state around a loaded world's map, before any seat is placed:
 *  `loadWorld` seats the roster the world file names. */
export function createGameFromMap(map: GameState['map'], rngInit: number): GameState {
  // The sea's reach, the two climate denominators and which volcanoes are
  // active are properties of the map as it was loaded, so they are stamped
  // once, here, and never re-derived from a map the game has already changed.
  deriveLowlands(map);
  deriveContinents(map);
  deriveMountainRanges(map);
  deriveVolcanoActivity(map, rngInit);
  return {
    map,
    climateIdx: -1,
    removableAtStart: standingRemovable(map),
    iceAtStart: map.tiles.filter((t) => t.feature === 'ICE').length,
    turn: 1,
    sandbox: false,
    claimedGreatPeople: [],
    gpOffer: GP_CLASSES.map(() => -1),
    gpPrice: GP_CLASSES.map(() => 0),
    unitsMode: true,
    units: [],
    nextUnitId: 0,
    rngState: rngInit >>> 0,
    barbSeat: emptySeat(BARB_SEAT), // the hostile class has a seat too
    disasters: true,
    gameOver: false,
    victoryType: 0,
    victoryRow: -1,
    fogOfWar: true,
    eventLog: [],
    cityStates: [],
    seats: [],
    claimedPantheons: [],
    claimedBeliefs: [],
  };
}

/** The settler's price, rising with every city, live SETTLER unit and
 * queued one: the Units row's Cost 80 + CostProgressionParam1 30 per copy,
 * each through `scaleByGameSpeed` as every unit cost is (40 + 15·n online). */
export function settlerCost(state: GameState, seat: number): number {
  const queued = seatOf(state, seat)!.cities.reduce(
    (n, c) => n + c.queue.filter((q) => q.kind === 'settler').length,
    0,
  );
  return (
    UNITS.SETTLER.cost +
    scaleByGameSpeed(SETTLER_COST_STEP) *
      Math.max(0, seatOf(state, seat)!.cities.length - 1 + settlerCount(state, seat) + queued)
  );
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

/**
 * CIV6 (Trajan's Column, EFFECT_GRANT_CHEAPEST_BUILDING_IN_CITY): "All cities
 * start with an additional City Center building" — the cheapest completable
 * one, ties by catalog order, built the way a purchase builds it.
 */
export function trajansColumn(state: GameState, seat: number, city: City): void {
  if (leaderOf(state, seat) !== 'TRAJAN') return;
  let best: string | null = null;
  let bestCost = Infinity;
  for (const def of availableBuildings(state, city)) {
    if (def.district !== 'CITY_CENTER' || !buildingCompletable(state, city, def.id)) continue;
    const cost = buildingCostIn(state, city, def.id);
    if (cost < bestCost) {
      best = def.id;
      bestCost = cost;
    }
  }
  if (!best) return;
  city.buildings.push(best);
  buildingDedications(state, seat, best);
  if (BUILDINGS[best]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
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
  markCityCentre(tile);
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;
  // CIV6 (CivilizationLevels.StartingTilesForCity, FULL_CIV 6): a new city
  // starts with its centre plus the first ring — the class's count of it,
  // in ascending tile index (the GPU's direction walk claims the same six).
  setTileOwner(tile, seat, id);
  let want = civLevelOf(seat).startingTilesForCity;
  const ring = tilesWithin(state.map, tile.col, tile.row, 1)
    .filter((t) => t.index !== tile.index)
    .sort((a, b) => a.index - b.index);
  for (const t of ring) {
    if (want <= 0) break;
    if (!tileClaimed(t)) {
      setTileOwner(t, seat, id);
      want -= 1;
    }
  }
  // CIV6 (Mother Russia): "Extra territory upon founding cities" — the
  // SECOND ring, `amount` of it, in ascending TILE INDEX so both engines
  // claim the same ground (`CITY_TILES_ROWS`)
  let extra = getModifiers(state, seat).cityTiles;
  if (extra > 0) {
    const second = tilesWithin(state.map, tile.col, tile.row, 2)
      .filter((t) => !tileClaimed(t) && hexDistance(tile.col, tile.row, t.col, t.row) === 2)
      .sort((a, b) => a.index - b.index);
    for (const t of second) {
      if (extra <= 0) break;
      setTileOwner(t, seat, id);
      extra -= 1;
    }
  }
  list.push(city);
  logPopWrite(state, city, 'fd');
  addEraScore(state, seat, ERA_SCORE_FOUND);
  if (city.isCapital) {
    const owner = seatOf(state, seat);
    if (owner) owner.capitalTile = tile.index;  // static once founded
  }
  allRoadsLeadToRome(state, seat, tile.index);
  trajansColumn(state, seat, city);
  revealAround(state, seat, tile.index, 3);
  // CIV6 (Ancestral Hall): "New cities receive a free Builder." The grant is
  // the SEAT's, so the first city — founded before any Plaza stands — never
  // sees it.
  const grant = newCityGrantUnit(state, seat);
  if (grant) spawnUnit(state, grant, tile.index, seat);
  // CIV6 (Kupe's Voyage): the FIRST city's Population and Builder
  const cmods = getModifiers(state, seat);
  if (list.length === 1) {
    for (const r of cmods.capital) city.population += r.firstCityPop ?? 0;
    logPopWrite(state, city, 'fc');
  }
  // CIV6 (Pax Britannica / Treasure Fleet): a city founded on a continent
  // other than the HOME one. The first city can never qualify — `capitalTile`
  // is stamped by then, so its own landmass IS the home one.
  const foreign = !onHomeContinent(state, seat, tile.index);
  for (const g of cmods.grantUnits) {
    if (!(g.firstCity && list.length === 1) && !(g.foreignContinent && foreign)) continue;
    // a row may name a chassis, or a promotion CLASS to take the best of
    const id = g.unit ?? (g.promoClass ? bestTrainableOfClass(state, seat, g.promoClass) : null);
    if (id) spawnUnit(state, id, tile.index, seat);
  }
  grievanceSettledNear(state, seat, tile);
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

/** A project's price: its own `Projects.Cost` row (already speed-scaled in
 *  the table), plus the GAME_PROGRESS climb where the row carries one — the
 *  six district projects, the Cothon's capital move. The repair alone is
 *  priced by the HP it restores. */
export function projectCost(state: GameState, seat: number, projectId: string, city?: City): number {
  const def = PROJECTS[projectId];
  // CIV6: "Walls gain HP equal to the Production invested into the project" —
  // so the whole repair costs exactly the perimeter HP it puts back.
  if (def?.repair && city) return Math.max(1, wallsMax(state, city) - outerPool(state, city) + encampOuterMissing(state, city));
  const fixed = def?.cost ?? 0;
  // CIV6 (the install cost model COST_PROGRESSION_GAME_PROGRESS): the price climbs with the game's
  // own progress, which this engine reads exactly where `districtCostIn`
  // reads it — the larger of the tech and civic shares researched.
  if (def?.costProgressGame !== undefined) {
    const r = seatOf(state, seat)?.research;
    const pct = r
      ? Math.max(r.techs.length / Object.keys(TECHS).length, r.civics.length / Object.keys(CIVICS).length)
      : 0;
    return fixed + Math.floor(scaleByGameSpeed(def.costProgressGame) * pct);
  }
  return fixed;
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

/** May this seat run a project at all? A civilization-UNIQUE row (`civ` /
 *  `leader`) is refused to every other seat — the same `rowIsFor` reading
 *  every roster row takes; a row naming neither is everyone's. The GPU twin
 *  is `_proj_seat_ok`, in the production mask and the applier alike. */
export function projectSeatOk(state: GameState, def: { civ?: string; leader?: string }, seat: number): boolean {
  if (def.civ === undefined && def.leader === undefined) return true;
  return rowIsFor(def as { civ?: CivId; leader?: LeaderId }, civOf(state, seat), leaderOf(state, seat));
}

export function availableProjects(state: GameState, city: City): ProjectDef[] {
  const owner = seatOf(state, city.seat);
  const done = owner?.projectsDone ?? [];
  return Object.values(PROJECTS).filter((p) => {
    if (!projectSeatOk(state, p, city.seat)) return false;
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
    if (p.competitionOnly) {
      // CIV6 (`UnlocksFromEffect`): a competition project is opened by its
      // own competition and closes with it. Where the row also CONSUMES a
      // building (the three decommission rows), that building must be
      // standing here.
      const live = competitionOf(state);
      if (!live || COMPETITIONS[live.kind]?.id !== p.competitionOnly) return false;
      return !p.consumesBuilding || city.buildings.includes(p.consumesBuilding);
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


/** Gold price to buy a building outright (Civ 6's 4× production cost) off
 *  the row's UNTRUNCATED scaled cost (`buyCost`), at the SEAT's own row: a
 *  unique building costs its own `Buildings.Cost` (`effectiveBuilding`; the
 *  GPU's `_b_cols`). Before the five-step floor. */
export function buildingPurchaseCost(state: GameState, seat: number, buildingId: string): number {
  return (effectiveBuilding(civOf(state, seat), buildingId)?.buyCost ?? 0) * GOLD_PURCHASE_MULT;
}

/** Faith price of a building: its own row's untruncated scaled cost
 * (`buyCost`) at the one faith rate (`FAITH_PURCHASE_MULT`, measured on every
 * priced building), before the five-step floor. A worship building (every one
 * Cost 190 in the install) prices the same way. */
export function buildingFaithCost(state: GameState, seat: number, buildingId: string): number {
  if (BUILDINGS[buildingId]?.worship) {
    // CIV6 (Righteousness of the Faith): the row pays `costPct` of the price
    let pct = 100;
    for (const r of getModifiers(state, seat).worship) pct = Math.min(pct, r.costPct);
    return Math.round((BUILDINGS[buildingId].buyCost * FAITH_PURCHASE_MULT * pct) / 100);
  }
  // CIV6 (Valletta's suzerain): the three walls are bought at
  // `VALLETTA_WALLS_DISCOUNT_PCT` off, and by that suzerain alone.
  const cut = (BUILDINGS[buildingId]?.walls ?? 0) > 0 && suzerainEffect(state, seat, 'faithBuildings')
    ? VALLETTA_WALLS_DISCOUNT_PCT : 0;
  // the SEAT's own row: a unique building costs its own Cost (the GPU's `_b_cols`)
  return Math.round((effectiveBuilding(civOf(state, seat), buildingId)?.buyCost ?? 0) * FAITH_PURCHASE_MULT * (100 - cut) / 100);
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
  // CIV6 (Songs of the Jeli): "May purchase Commercial Hub district
  // buildings with Faith" — the roster's own door, open with no suzerain
  // (`FAITH_PURCHASE_DISTRICT_ROWS`)
  if (getModifiers(state, seat).faithPurchaseDistricts.has(def.district)) return true;
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

/** the faith price of a unit — its Cost at the one published faith rate, the
 *  same `FAITH_PURCHASE_MULT` a building is bought at. CIV6: the faith-only
 *  chassis (Missionary, Apostle, Inquisitor, Warrior Monk) price the same
 *  way — Cost 75/200/75/100 buys at 150/400/150/200 on Standard speed. Holy
 *  Order's discount rides the Missionary's.
 *  CIV6 (COST_PROGRESSION_PREVIOUS_COPIES): a chassis carrying a `costStep`
 *  charges it once per copy the seat has already acquired, and the discount
 *  applies to that whole Cost — the install progresses the Cost and modifies
 *  the total. `copies` 0 is the catalog row the exporter ships. */
export function unitFaithCost(unitType: string, mult = 1, copies = 0): number {
  const def = UNITS[unitType];
  const base = (def?.cost ?? 0) + copies * (def?.costStep ?? 0);
  return Math.round(base * FAITH_PURCHASE_MULT * mult);
}

/** how many copies of a chassis this seat has ever acquired — what the price
 *  progression above counts. */
export function unitsAcquired(state: GameState, seat: number, unitType: string): number {
  return seatOf(state, seat)?.unitsAcquired?.[unitType] ?? 0;
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

/** CIV6 (Ngazargamu): the modifier's own gate is `UnitDomain DOMAIN_LAND` —
 *  a chassis that is neither naval nor air. */
function unitIsLandDomain(unitType: string): boolean {
  const d = UNITS[unitType];
  return !!d && !d.naval && d.air === undefined;
}

export function unitPurchaseCost(state: GameState, unitType: string, seat: number, city?: City): number {
  const base = unitType === 'BUILDER' ? builderCost(state, seat) : unitType === 'TRADER' ? traderCost(state, seat) : UNITS[unitType]?.cost ?? 0;
  const m = unitType === 'BUILDER' ? monumentalityBuyMult(state, seat) : 1;
  // Mercenary Companies names a CURRENCY and moves the price of a MILITARY
  // unit bought with it.
  const merc = (UNITS[unitType]?.combat ?? 0) > 0 ? congressUnitBuyMult(state, CONGRESS_CUR_GOLD) : 1;
  // CIV6 (Ngazargamu): 20% off per Encampment building in the BUYING city
  const suz = city && unitIsLandDomain(unitType) ? suzerainLandPurchaseMult(state, seat, city) : 1;
  return base * GOLD_PURCHASE_MULT * m * merc * suz * landUnitPriceMult(state, seat, unitType);
}

/** Buy a settler with gold (cost scales like trained settlers). The unit
 * spawns at the buying city, which also pays the pop (real Civ 6). */
export function purchaseSettler(state: GameState, cityId: number, seat: number): RuleResult {
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (getModifiers(state, seat).noSettlers) return { ok: false, reason: 'Isolationism forbids Settlers.' };
  if (!state.sandbox && city.population < 2) return { ok: false, reason: 'A city of 1 population cannot buy a settler.' };
  if (purchaseSpotBlocked(state, city, seat, 'SETTLER')) return { ok: false, reason: 'A unit of that class already stands on the city centre.' };
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  const cost = goldPrice(state, seat, settlerCost(state, seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, seat));
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
  logPopWrite(state, city, 'sb');
  return { ok: true };
}

export function buyWorshipBuilding(state: GameState, cityId: number, seat: number): RuleResult {
  const buyer = seatOf(state, seat);
  if (!buyer) return { ok: false, reason: 'No such seat.' };
  // the building the religion's Worship belief names
  const wid = buyer.religion.founded ? worshipBuildingOf(buyer.religion.worship) : undefined;
  if (!wid) return { ok: false, reason: 'The religion holds no Worship belief.' };
  // CIV6 (Urban Development Treaty, outcome B): a faith purchase still
  // CREATES a building in the district, so the ban covers it.
  if (congressUdtBlockedDistrict(state) === 'HOLY_SITE') return { ok: false, reason: 'The World Congress bans new Holy Site buildings.' };
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (city.buildings.includes(wid) || !city.buildings.includes('TEMPLE')) {
    return { ok: false, reason: 'Needs a Temple, and no worship building yet.' };
  }
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  if (!ht?.districtComplete || ht.districtPillaged) {
    return { ok: false, reason: 'Needs a complete, unpillaged Holy Site.' };
  }
  const cost = faithPrice(state, seat, buildingFaithCost(state, seat, wid));
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  buyer.faith = (buyer.faith ?? 0) - cost;
  city.buildings.push(wid);
  stampBuildingEra(state, city, wid);
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
  const cost = faithPrice(state, city.seat, buildingFaithCost(state, city.seat, buildingId));
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  buyer.faith = (buyer.faith ?? 0) - cost;
  city.buildings.push(buildingId);
  stampBuildingEra(state, city, buildingId);
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
  if (purchaseSpotBlocked(state, city, seat, unitType)) return { ok: false, reason: 'A unit of that class already stands on the city centre.' };
  const def = UNITS[unitType];
  if (!def || (def.combat ?? 0) <= 0 || def.naval || def.air !== undefined) {
    return { ok: false, reason: 'Not a land combat unit.' };
  }
  if (!trainableUnits(state, seat, city).some((d) => d.id === unitType)) {
    return { ok: false, reason: 'Unit not available (enable units mode / research).' };
  }
  const cost = faithPrice(state, seat, unitFaithCost(unitType, 1, unitsAcquired(state, seat, unitType)));
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'Nowhere to place it.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  applyTrainingGrants(state, city, u);
  chargeUnitResource(state, seat, unitType);
  return { ok: true };
}

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
  // CIV6 (EFFECT_ADJUST_CORPS_ARMY_PREREQ): the roster's own civic for this
  // TIER and domain — Shaka's land Corps, Spain's Fleets
  const naval = !!UNITS[unit.type]?.naval;
  const row = getModifiers(state, seat).formations.find((r) => r.tier === tier && r.naval === naval && r.civic !== undefined);
  const civic = row?.civic ?? FORMATION_CIVIC[tier];
  if (civic && !isCivicComplete(state, civic, seat)) return { ok: false, reason: `${civic} is not in.` };
  const vet = veteranOf(host, unit);
  host.formation = tier;
  host.level = vet.level;
  host.xp = vet.xp;
  logXpWrite(state, host, 'vt');
  host.xpPct = vet.xpPct;
  host.mpBonus = vet.mpBonus;
  host.promos = vet.promos;
  host.promoUsed = vet.promoUsed;
  host.hp = vet.hp;
  host.movesLeft = 0;
  host.fortifyTurns = 0;
  disbandUnit(state, unit.id);
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
/** CIV6 (Monastic Isolation, EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS): the
 *  pressure religion `rel` sheds to a lost theological combat, `swing` less
 *  the ReductionPercent its Enhancer belief keeps. The pedia's Theological
 *  Combat chapter counts a Condemn Heretic's halved drop as the same loss.
 *  `_theo_loss`' twin. */
function theoLoss(state: GameState, rel: number, swing: number): number {
  const r = seatOf(state, rel)?.religion;
  const keep = r?.founded && r.enhancer ? ENHANCER_BELIEFS[r.enhancer]?.effects.theoLossReductionPct ?? 0 : 0;
  return Math.floor((swing * (100 - Math.min(100, keep))) / 100);
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
  const loss = theoLoss(state, loser, CONDEMN_PRESSURE_SWING);
  for (const c of allCities(state)) {
    const ct = state.map.tiles[c.centerIndex];
    if (hexDistance(dt.col, dt.row, ct.col, ct.row) > CONDEMN_PRESSURE_RANGE) continue;
    let pres = c.religionPressure;
    if (!pres || pres.length !== nRel) {
      pres = new Array(nRel).fill(0);
      c.religionPressure = pres;
    }
    pres[loser] = Math.max(0, pres[loser] - loss);
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
  // CIV6 (El Escorial): "Inquisitors eliminate 100% of the presence of other
  // Religions" — the roster's points on top (`EVICT_PCT_ROWS`)
  const evict = Math.min(100, REMOVE_HERESY_PCT + getModifiers(state, mine).evictPoints);
  if (pres) {
    for (let g = 0; g < pres.length; g++) {
      if (g === mine) continue;
      pres[g] = Math.floor(pres[g] * (100 - evict) / 100);
    }
  }
  unit.charges = (unit.charges ?? 0) - 1;
  unit.movesLeft = 0;
  return { ok: true };
}

/** every barbarian unit in the ring around `here`, in NEIGHBOUR-RING order. */
export function adjacentBarbarians(state: GameState, here: Tile): Unit[] {
  const got: Unit[] = [];
  for (const t of neighbors(state.map, here)) {
    for (const u of unitsAt(state, t.index)) if (isBarbSeat(u.seat)) got.push(u);
  }
  return got;
}

/** the ring changes sides to `seat`, in that order — Heathen Conversion's
 *  body, which CIV6 (Boudica) shares. Returns how many turned. */
export function convertAdjacentBarbarians(state: GameState, here: Tile, seat: number): number {
  const got = adjacentBarbarians(state, here);
  for (const u of got) reseatUnit(state, u, seat);
  return got.length;
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
  if (convertAdjacentBarbarians(state, here, actor.seat) === 0) return { ok: false, reason: 'No Barbarians adjacent.' };
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
 * The draw is `drawPromoOffer`'s, taken before Yerevan widens it so the
 * stream reads the same either way.
 */
function offerApostlePromotions(state: GameState, unit: Unit, seat: number): void {
  drawPromoOffer(state, unit);
  const rows = unitPromoRows(unit);
  if (suzerainEffect(state, seat, 'apostlePromoChoice')) {
    unit.promoOffer = (1 << rows.length) - 1;
  }
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
  const cost = faithPrice(state, seat, unitFaithCost(
    unitType,
    unitType === 'MISSIONARY' ? (eb?.missionaryCostMult ?? 1) : 1,
    unitsAcquired(state, seat, unitType),
  ));
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
  // trained ones get +2 Charges" — Missionaries, Apostles and Inquisitors alike.
  if (goldenDedication(state, seat, DED_EXODUS)) u.charges = (u.charges ?? 0) + 2;
  // CIV6 (Mosque): the buying city's standing buildings add their spreads to
  // the three CLASS_RELIGIOUS_SPREAD units
  const dark = darkBuildings(state.map, city);
  for (const id of city.buildings) {
    if (!dark.has(id)) u.charges = (u.charges ?? 0) + (BUILDINGS[id]?.religiousSpreads ?? 0);
  }
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
  const cost = faithPrice(state, seat, unitFaithCost('WARRIOR_MONK', 1, unitsAcquired(state, seat, 'WARRIOR_MONK')));
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
  const cost = faithPrice(state, seat, base * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, seat));
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, unitType, city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  buyer.faith = (buyer.faith ?? 0) - cost;
  // Purchased settlers cost the pop too (real Civ 6); a purchased builder
  // escalates builderCost like a trained one.
  if (unitType === 'SETTLER') {
    city.population = Math.max(1, city.population - 1);
    logPopWrite(state, city, 'sf');
  }
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
  const cost = faithPrice(state, seat, naturalistCost(state, seat));
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
    return { ok: false, reason: 'Needs the Cold War civic.' };
  }
  const city = citiesOf(state, seat).find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const cost = faithPrice(state, seat, rockBandCost(state, seat));
  if (!goldAffordable(buyer.faith ?? 0, cost)) return { ok: false, reason: `Not enough faith (${cost} needed).` };
  const u = spawnUnit(state, 'ROCK_BAND', city.centerIndex, seat);
  if (!u) return { ok: false, reason: 'No free tile near the city center.' };
  u.bandLevel = 1;
  u.bandAlbum = 0;
  // CIV6 (Rock Band): InitialLevel 2, NumRandomChoices 3 — it is bought with
  // one promotion to pick from three.
  drawPromoOffer(state, u);
  buyer.faith = (buyer.faith ?? 0) - cost;
  return { ok: true };
}

/** the live faith price of a Rock Band — the catalog row at the copies this
 *  seat already holds to its name. */
export function rockBandCost(state: GameState, seat: number): number {
  return unitFaithCost('ROCK_BAND', 1, unitsAcquired(state, seat, 'ROCK_BAND'));
}

/** the live faith price of a Naturalist — the same progression shape. */
export function naturalistCost(state: GameState, seat: number): number {
  return unitFaithCost('NATURALIST', 1, unitsAcquired(state, seat, 'NATURALIST'));
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
const ENGINEER_FINISH_BUILDING = 'FLOOD_BARRIER';

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

/**
 * CIV6 (The First Emperor): the city whose queued WONDER a Builder standing
 * at `tileIndex` may pay a charge into. The charge goes into the wonder
 * itself, so the plot must be the wonder's own site and the item must be
 * that city's queue HEAD — the same reach `engineerFinishCity` has, since
 * only the head accrues on either engine.
 */
export function wonderChargeCity(state: GameState, seat: number, tileIndex: number): City | undefined {
  for (const city of citiesOf(state, seat)) {
    const q = city.queue[0];
    if (q?.kind === 'wonder' && q.tileIndex === tileIndex) return city;
  }
  return undefined;
}

/** The percentage a charge buys toward the wonder queued at `tileIndex`, or 0
 *  where no row of this seat covers that wonder's era. ONE named reader, so
 *  the mask and the applier cannot disagree about the era band. */
export function wonderChargePct(state: GameState, seat: number, wonder: string): number {
  const we = WONDER_ERA_INDEX[wonder] ?? 0;
  let pct = 0;
  for (const r of getModifiers(state, seat).wonderCharge) {
    if (we >= ERAS.indexOf(r.startEra) && we <= ERAS.indexOf(r.endEra)) pct += r.pct;
  }
  return pct;
}

/**
 * CIV6 (The First Emperor, EFFECT_ADJUST_PLAYER_UNIT_WONDER_PERCENT): "When
 * building Ancient and Classical wonders you may spend Builder charges to
 * complete 15% of the original wonder cost." ONE charge per helping, and
 * ORIGINAL means the wonder's whole cost rather than what is left to pay.
 */
export function wonderChargeBoost(state: GameState, unit: Unit, actor: Seat): RuleResult {
  if (unit.type !== 'BUILDER') return { ok: false, reason: 'Not a Builder.' };
  if ((unit.charges ?? 0) <= 0) return { ok: false, reason: 'No charges left.' };
  const city = wonderChargeCity(state, actor.seat, unit.tileIndex);
  if (!city) return { ok: false, reason: 'No wonder under construction here.' };
  const q = city.queue[0];
  if (q.kind !== 'wonder') return { ok: false, reason: 'No wonder under construction here.' };
  const pct = wonderChargePct(state, actor.seat, q.wonder);
  if (pct <= 0) return { ok: false, reason: "This wonder's era is outside the ability." };
  q.progress += Math.round(itemCost(q, state, city) * pct / 100);
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  if ((unit.charges ?? 0) <= 0) disbandUnit(state, unit.id);
  return { ok: true };
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
 * target tile (UI headline price) the ring-2 base is shown. The install
 * publishes no speed rule for a plot's price; this engine scales it as a
 * cost (`scaleByGameSpeed`). */
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
  // CIV6 (EFFECT_ADJUST_PLOT_PURCHASE_COST_TERRAIN): the roster's terrain rows
  let terrainPct = 0;
  if (tileIndex !== undefined) {
    const t = state.map.tiles[tileIndex];
    ring = Math.max(2, hexDistance(center.col, center.row, t.col, t.row));
    for (const r of src.mods.tileCost) if (r.terrain === t.terrain) terrainPct += r.pct;
  }
  const tPct = src.research.techs.length / Object.keys(TECHS).length;
  const cPct = src.research.civics.length / Object.keys(CIVICS).length;
  const base = scaleByGameSpeed(50 + 25 * (ring - 2));
  const step = scaleByGameSpeed(5);
  return Math.round(
    (base * (1 + 4 * Math.max(tPct, cPct)) + step * (src.tilesPurchased ?? 0)) * src.mods.tilePurchaseMult * (1 + terrainPct / 100),
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

export function endTurn(state: GameState): void {
  if (state.unitsMode) {
    refreshUnits(state);
    barbarianPhase(state);
  }
  if (state.disasters) disasterPhase(state);
  cityStatePhase(state);
  minorPhase(state);
  seatPhase(state);
  // CIV6's Free Cities player takes its turn after every major's; the GPU
  // twin runs `_free_cities_phase` at the same position.
  freeCitiesPhase(state);

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
    // ...plus CIV6 (ISS_FIRST_PLACE_SPACESHIP_SPEED) the Space Station winner's +3
    s.spaceLy = (s.spaceLy ?? 0) + 1 + laserSpeed(state, s.seat) + gpPermOf(s, 'exoSpeed');
    if (s.spaceLy >= SPACE_FLIGHT_LY && state.victoryType !== 3) {
      state.victoryType = 3;
      state.victoryRow = s.seat;
      state.eventLog.push('Science Victory! The Exoplanet Expedition has arrived.');
    }
  }
  // Domination ends the game the instant a civ holds every capital;
  // otherwise the score victory fires at TURN_LIMIT and names the seat with
  // the highest Civ 6 Score (`scoreLeader`).
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
            : state.gameOver
              ? scoreLeader(state)
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
 * sized to modeled scope) — religion g wins when EVERY seat holding at least
 * one city has MORE THAN HALF of its cities following g. At most one g can predominate in a given civ, so no
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
 * CIV6 (Dynastic Cycle): "a random Eureka and Inspiration from the era of the
 * wonder, IF AVAILABLE" — one draw per count from the unearned rows of that
 * era, and nothing at all where the era holds none. ONE body for both kinds,
 * so the tech and the civic pool cannot drift apart, and the draws are taken
 * in a fixed order (techs, then civics) because both engines replay the same
 * stream.
 */
export function grantEraBoosts(state: GameState, seat: number, era: string): void {
  const rows = getModifiers(state, seat).wonderEraBoost;
  if (!rows.length) return;                     // no row, no draw, no rng moved
  const rsr = seatOf(state, seat)?.research;
  if (!rsr) return;
  let techs = 0;
  let civics = 0;
  for (const r of rows) { techs += r.techs; civics += r.civics; }
  const draw = (n: number, pool: () => string[], onto: string[]): void => {
    for (let i = 0; i < n; i++) {
      const open = pool();
      if (open.length === 0) return;            // "if available" — no draw at all
      onto.push(open[Math.floor(nextRandom(state) * open.length)]);
    }
  };
  draw(techs, () => Object.values(TECHS)
    .filter((t) => t.era === era && !rsr.techs.includes(t.id) && !rsr.boosted.includes(t.id))
    .map((t) => t.id), rsr.boosted);
  draw(civics, () => Object.values(CIVICS)
    .filter((c) => c.era === era && !rsr.civics.includes(c.id) && !rsr.boosted.includes(c.id))
    .map((c) => c.id), rsr.boosted);
}

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
 * with slot order (capture moves a unit to the END of both). Never an id
 * tie-break: after a capture an id does not reflect array position.
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
      const loss = loserRel >= 0 ? theoLoss(state, loserRel, THEO_PRESSURE_SWING) : 0;
      for (const c of allCities(state)) {
        const ct = state.map.tiles[c.centerIndex];
        if (hexDistance(dt.col, dt.row, ct.col, ct.row) > THEO_PRESSURE_RANGE) continue;
        let pres = c.religionPressure;
        if (!pres || pres.length !== nRel) {
          pres = new Array(nRel).fill(0);
          c.religionPressure = pres;
        }
        pres[winnerRel] += THEO_PRESSURE_SWING;
        if (loserRel >= 0) pres[loserRel] = Math.max(0, pres[loserRel] - loss);
      }
    }
    // RELICS. CIV 6 creates one when the Apostle killed here HELD the MARTYR
    // promotion — one of the nine it chose from at purchase. A dead Missionary
    // or Inquisitor yields nothing; neither carries the promotion list.
    // Granted in the SAME order as the two disbands below (defender first,
    // then attacker) so the relic's slot is order-exact across engines.
    const martyrs = (u: Unit): boolean => promoFlag(u, 'MARTYR');
    // The Relic lands in the owner's first city with an open slot that takes
    // one. CIV6: a Relic that finds no open slot waits in reserve for one to
    // open; `drainRelicReserve` hands it out at the owner's next turn.
    const reserve = (sx: number) => {
      const owner = seatOf(state, sx);
      if (owner) owner.relicReserve = (owner.relicReserve ?? 0) + 1;
    };
    const relic = (sx: number) => ({ obj: GWO_RELIC, maker: -1, era: -1, seat: sx });
    if (def.hp <= 0 && martyrs(def)
        && !placeGreatWorkIn(state, citiesOf(state, unitSeat(def)), relic(unitSeat(def)))) reserve(unitSeat(def));
    if (att.hp <= 0 && martyrs(att)
        && !placeGreatWorkIn(state, citiesOf(state, g), relic(g))) reserve(g);
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

/**
 * Religious pressure spread (deterministic, zero-RNG). Religions are indexed
 * by seat: religion g is seat g's. Every city following a founded religion
 * presses the cities within range once per turn, and a city then FOLLOWS
 * what `followedReligionOf` picks from its accumulated pressure. The GPU
 * mirror is BatchSim._spread_religious_pressure. Fresh City objects
 * (founded/flipped cities) carry no pressure — the reset-on-birth KILL
 * hygiene, mirrored on the GPU by zeroing dead/absent slots each turn.
 */
export function spreadReligiousPressure(state: GameState): void {
  const nRel = state.seats.length;
  const founded = state.seats.map((sx) => sx.religion.founded && sx.religion.holyTile != null && sx.religion.holyTile >= 0);
  if (!founded.some(Boolean)) return; // no religion exists yet — nothing to spread
  const range: number[] = new Array(nRel).fill(RELIGION_PRESSURE_RANGE);
  for (const sx of state.seats) {
    const eb = sx.religion.enhancer;
    if (eb) range[sx.seat] += ENHANCER_BELIEFS[eb]?.effects.pressureRangeBonus ?? 0;
  }
  const tiles = state.map.tiles;
  // CIV6: the install has ONE city rule for religion, and nothing in it
  // excludes a Free City. `CivilizationLevels` withholds founding cities,
  // culture and gold claims, great people, influence and wonders from the
  // Free Cities player and names no religion column at all; the
  // spread-religion operation row carries no owner filter; and the
  // `RELIGION_SPREAD_*` parameters are written per CITY. So a Free City is a
  // city here — it takes pressure, it follows what holds the majority, and
  // once it follows it PRESSES like any other.
  //
  // `cityHolders` and not `allCities`: `allCities` answers a different
  // question at four other sites (combat, capture, the trade walk), and the
  // census already walks the majors then the free row in exactly this order.
  const cities = cityHolders(state).flatMap((sx) => sx.cities);
  // CIV6 (GlobalParameters): every city FOLLOWING a religion presses every
  // city within range each turn — the Holy City at x4, a city with a Holy
  // Site at x2, any other at x1 — times the Bishop's doubling at the source.
  // CIV6 (Jerusalem's suzerain): "Your cities with Holy Sites exert pressure
  // as if they were Holy Cities (4x Religion pressure on all cities within
  // 10 tiles)" — the founder's Holy-Site cities take the Holy City's step.
  const sources: { g: number; tile: Tile; w: number }[] = [];
  for (const city of cities) {
    const g = city.followedReligion ?? -1;
    if (g < 0 || !founded[g]) continue;
    const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
    const hsTile = hs ? tiles[hs.tileIndex] : undefined;
    const hasSite = !!hsTile && !!hsTile.districtComplete && !hsTile.districtPillaged;
    const asHoly = city.centerIndex === seatOf(state, g)!.religion.holyTile
      || (hasSite && city.seat === g && suzerainEffect(state, g, 'holySitePressure'));
    const mult = asHoly ? HOLY_CITY_PRESSURE_MULT : hasSite ? HOLY_SITE_PRESSURE_MULT : 1;
    const cc = tiles[city.centerIndex];
    // CIV6 (Bishop): "Religious pressure to adjacent cities is 100% stronger
    // from this city."
    sources.push({ g, tile: cc, w: RELIGION_PRESSURE_PER_TURN * mult * governorTileMult(state, cc, (e) => e.pressureMult) });
  }
  // CIV6 (RELIGION_SPREAD_TRADE_ROUTE_PRESSURE_FOR_DESTINATION 1.0 / _FOR_ORIGIN
  // 0.5): a live route carries its origin's religion to the destination and
  // the destination's back at half strength, Dharma's +100% on the OWNER's
  // routes; a city-state destination takes the pressure and follows nothing
  // (its follow set is not modelled). Keyed by the RECEIVER's centre.
  const routeTerms = new Map<number, { g: number; w: number }[]>();
  const byCentre = new Map(cities.map((c) => [c.centerIndex, c]));
  for (const sx of state.seats) {
    if (!sx.tradeRoutes?.length) continue;
    const rows = getModifiers(state, sx.seat).routePressure;
    const pctO = rows.filter((r) => r.origin).reduce((s, r) => s + r.pct, 0);
    const pctD = rows.filter((r) => r.destination).reduce((s, r) => s + r.pct, 0);
    const wD = routePressureShare(ROUTE_PRESSURE_DESTINATION * (100 + pctD) / 100, state.turn);
    const wO = routePressureShare(ROUTE_PRESSURE_ORIGIN * (100 + pctO) / 100, state.turn);
    for (const r of sx.tradeRoutes) {
      const origin = sx.cities.find((c) => c.id === r.from);
      const dCentre = routeDestCenter(state, sx, r);
      if (!origin || dCentre < 0) continue;
      const gO = origin.followedReligion ?? -1;
      if (gO >= 0 && founded[gO] && wD > 0) (routeTerms.get(dCentre) ?? routeTerms.set(dCentre, []).get(dCentre)!).push({ g: gO, w: wD });
      const gD = byCentre.get(dCentre)?.followedReligion ?? -1;
      if (gD >= 0 && founded[gD] && wO > 0) (routeTerms.get(origin.centerIndex) ?? routeTerms.set(origin.centerIndex, []).get(origin.centerIndex)!).push({ g: gD, w: wO });
    }
  }
  for (const cs of state.cityStates ?? []) {
    const terms = routeTerms.get(cs.centerIndex);
    if (!terms) continue;
    let pres = cs.religionPressure;
    if (!pres || pres.length !== nRel) {
      pres = new Array(nRel).fill(0);
      cs.religionPressure = pres;
    }
    for (const t of terms) pres[t.g] += t.w;
  }
  // CIV6 (Religious alliance 3, ALLIANCE_RELIGIOUS_PRESSURE): "Bonus
  // Religious Pressure in cities with no followers of your ally's Religion"
  // — per founder, the level-3 Religious allies whose own religion exists;
  // each one whose religion has NO pressure in the receiving city raises the
  // founder's whole per-turn add there by ALLIANCE_REL3_PRESSURE_PCT.
  const rel3Allies: number[][] = state.seats.map((sx) => founded[sx.seat]
    ? state.seats.filter((o) => o.seat !== sx.seat && founded[o.seat]
      && alliedAtLevel(state, sx.seat, o.seat, ALLIANCE_RELIGIOUS, 3)).map((o) => o.seat)
    : []);
  const converted = new Map<string, number>();
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
    // this turn's add per religion, summed BEFORE the alliance percent so
    // the GPU's one matmul column and this walk floor the same number
    const addG: number[] = new Array(nRel).fill(0);
    for (const src of sources) {
      const g = src.g;
      if (deaf && g !== city.seat) continue;
      // CIV6 (Religious alliance 1): allies' religions exert no pressure on
      // each other's cities.
      if (g !== city.seat && alliedAtLevel(state, city.seat, g, ALLIANCE_RELIGIOUS, 1)) continue;
      if (hexDistance(cc.col, cc.row, src.tile.col, src.tile.row) > range[g]) continue;
      addG[g] += src.w;
    }
    for (const t of routeTerms.get(city.centerIndex) ?? []) {
      if (deaf && t.g !== city.seat) continue;
      if (t.g !== city.seat && alliedAtLevel(state, city.seat, t.g, ALLIANCE_RELIGIOUS, 1)) continue;
      addG[t.g] += t.w;
    }
    for (let g = 0; g < nRel; g++) {
      if (addG[g] === 0) continue;
      let pct = 0;
      for (const a of rel3Allies[g] ?? []) if (pres[a] === 0) pct += ALLIANCE_REL3_PRESSURE_PCT;
      pres[g] += pct ? Math.floor((addG[g] * (100 + pct)) / 100) : addG[g];
    }
    const best = followedReligionOf(pres, city.population);
    const wasFollowed = city.followedReligion ?? -1;
    city.followedReligion = best >= 0 ? best : null;
    if (best >= 0 && best !== wasFollowed) {
      dedicationEvent(state, best, DED_EXODUS);
      converted.set(`${city.seat}>${best}`, (converted.get(`${city.seat}>${best}`) ?? 0) + 1);
    }
  }
  // CIV6 (DIPLOACTION_KEEP_PROMISE_DONT_CONVERT): each of a major's cities
  // that came to follow another major's religion this turn is one conversion
  for (const [key, n] of converted) {
    const [victim, actor] = key.split('>').map(Number);
    promiseIncursion(state, victim, actor, PROMISE_CONVERT, n);
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** A save is written by `serialize` and read here, by this engine alone:
 *  the state IS its JSON, so the parse is the whole load. */
export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}

/** can the seat found its religion now? No seat ban, no religion yet, a
 *  pantheon, a completed Holy Site (or Stonehenge) and an activated Great
 *  Prophet (`prophetsOf`) — the gates `_can_found` mirrors. */
export function canFoundReligion(state: GameState, seat: number): RuleResult {
  const sx = seatOf(state, seat);
  if (!sx) return { ok: false, reason: 'No such seat.' };
  // CIV6 (Religious Convert): "May not ... found Religions" (`SEAT_BAN_ROWS`)
  if (getModifiers(state, seat).seatBans.has('foundReligion')) {
    return { ok: false, reason: 'This leader may not found a religion.' };
  }
  if (sx.religion.founded) return { ok: false, reason: 'Religion already founded.' };
  if (!sx.religion.pantheon) return { ok: false, reason: 'Choose a pantheon first.' };
  const hasHolySite = sx.cities.some((c) =>
    c.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
  );
  // CIV6 (Stonehenge): "Prophets may found a religion on Stonehenge
  // instead of a Holy Site."
  if (!hasHolySite && !seatWonderFlag(state, seat, 'religionSite')) {
    return { ok: false, reason: 'Needs a completed Holy Site.' };
  }
  if (!state.sandbox && prophetsOf(sx) === 0) {
    return { ok: false, reason: 'Needs an activated Great Prophet.' };
  }
  return { ok: true };
}

/** can the seat enhance its religion now? A founded religion with a belief
 *  earned and not yet adopted (`beliefPicks`) — `_can_enhance`'s gates. */
export function canEnhanceReligion(state: GameState, seat: number): RuleResult {
  const sx = seatOf(state, seat);
  if (!sx) return { ok: false, reason: 'No such seat.' };
  if (!sx.religion.founded) return { ok: false, reason: 'Found a religion first.' };
  if (beliefPicks(state, seat) === 0) {
    return { ok: false, reason: 'No belief earned to adopt: an Apostle evangelizes one.' };
  }
  return { ok: true };
}

/** the beliefs the seat's religion holds, of its four classes */
function beliefsHeld(rel: Seat['religion']): number {
  return BELIEF_SLOTS.filter((slot) => (rel[slot] ?? null) !== null).length;
}

/** how many beliefs an enhancement of the seat's founded religion adopts
 *  now: the beliefs earned and not yet held, capped by the classes it still
 *  lacks that have a belief left (`enhanceableClasses`). The sandbox has
 *  earned every class. `_belief_picks`' twin. */
export function beliefPicks(state: GameState, seat: number): number {
  const rel = seatOf(state, seat)?.religion;
  if (!rel?.founded) return 0;
  const earned = state.sandbox ? BELIEF_SLOTS.length : (rel.beliefsEarned ?? 0);
  return Math.max(0, Math.min(earned - beliefsHeld(rel), enhanceableClasses(state, seat).length));
}

/**
 * CIV6 (UNITOPERATION_EVANGELIZE_BELIEF; the Apostle: "Once per game may
 * Evangelize Belief to add an additional Belief to their Religion. These uses
 * consume the Apostle"): the seat's founded religion earns one belief, which
 * the record's `beliefs` arm adopts. Open while an earned belief would still
 * find a class to fill; the install names no site. `_evangelize_ok`'s twin.
 */
export function evangelizeOk(state: GameState, unit: Unit, seat: number): boolean {
  if (unit.type !== 'APOSTLE' || unit.seat !== seat) return false;
  const rel = seatOf(state, seat)?.religion;
  if (!rel?.founded) return false;
  return (rel.beliefsEarned ?? 0) - beliefsHeld(rel) < enhanceableClasses(state, seat).length;
}

export function evangelizeBelief(state: GameState, unit: Unit, actor: Seat): RuleResult {
  if (!evangelizeOk(state, unit, actor.seat)) return { ok: false, reason: 'No belief left to evangelize.' };
  actor.religion.beliefsEarned = (actor.religion.beliefsEarned ?? 0) + 1;
  disbandUnit(state, unit.id);
  state.eventLog.push(`${actor.name} evangelized a belief of ${actor.religion.name}.`);
  return { ok: true };
}

/** the belief ids of one class no religion holds, in catalog order */
export function openBeliefs(state: GameState, cls: number): string[] {
  return Object.keys(BELIEF_CATALOGS[cls] ?? {}).filter((id) => !state.claimedBeliefs.includes(id));
}

/** the class codes the seat's religion still lacks that have a belief left,
 *  ascending — what an enhancement may add */
export function enhanceableClasses(state: GameState, seat: number): number[] {
  const rel = seatOf(state, seat)?.religion;
  if (!rel) return [];
  return BELIEF_SLOTS.map((_slot, c) => c)
    .filter((c) => (rel[BELIEF_SLOTS[c]] ?? null) === null && openBeliefs(state, c).length > 0);
}

/**
 * The seat's religion ADOPTS beliefs — the record's `beliefs` arm and the one
 * verb that founds or enhances, `_apply_beliefs`' twin. `picks` are
 * [class, index] pairs (`BELIEF_CLASSES`, the class catalog's row).
 *
 * FOUNDING (no religion yet, `canFoundReligion`): RELIGION_INITIAL_BELIEFS
 * picks, the Follower first, then a belief of another class. ENHANCING
 * (`canEnhanceReligion`): `beliefPicks` beliefs, each of a different class the
 * religion still lacks that has a belief left. Every pick names a belief no
 * religion holds. A set that does not fit is refused entire.
 */
export function adoptBeliefs(state: GameState, seat: number, picks: readonly (readonly [number, number])[]): RuleResult {
  const sx = seatOf(state, seat);
  if (!sx) return { ok: false, reason: 'No such seat.' };
  const rel = sx.religion;
  const ids = picks.map(([c, k]) => beliefIdAt(c, k));
  if (ids.some((id) => id === undefined || state.claimedBeliefs.includes(id))) {
    return { ok: false, reason: 'A belief is unknown or another religion holds it.' };
  }
  const cls = picks.map(([c]) => c);
  if (new Set(cls).size !== cls.length) return { ok: false, reason: 'One belief of each class.' };
  const founding = !rel.founded;
  if (founding) {
    const check = canFoundReligion(state, seat);
    if (!check.ok) return check;
    if (picks.length !== RELIGION_INITIAL_BELIEFS || cls[0] !== BELIEF_CLASS_FOLLOWER) {
      return { ok: false, reason: 'Founding takes the Follower belief, then one belief of another class.' };
    }
  } else {
    const check = canEnhanceReligion(state, seat);
    if (!check.ok) return check;
    const want = enhanceableClasses(state, seat);
    if (picks.length !== beliefPicks(state, seat) || cls.some((c) => !want.includes(c))) {
      return { ok: false, reason: 'Enhancing adopts each earned belief from a class the religion still lacks.' };
    }
  }
  ids.forEach((id, k) => {
    rel[BELIEF_SLOTS[cls[k]]] = id!;
    state.claimedBeliefs.push(id!);
  });
  if (founding) {
    rel.founded = true;
    rel.beliefsEarned = RELIGION_INITIAL_BELIEFS;
    rel.name = RELIGION_NAMES[seat % RELIGION_NAMES.length];
    addEraScore(state, seat, ERA_SCORE_RELIGION);
    rel.holyTile = (sx.cities.find((c) => c.isCapital) ?? sx.cities[0])?.centerIndex ?? null;
    grantFoundingPressure(state, seat);
    state.eventLog.push(`${sx.name} founded ${rel.name}.`);
  } else {
    state.eventLog.push(`${sx.name} enhanced ${rel.name}.`);
  }
  return { ok: true };
}
