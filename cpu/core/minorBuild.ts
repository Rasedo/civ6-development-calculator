/** THE MINOR'S TURN — its city's yields, the research they buy, the upgrades
 * and purchases its purse makes, its Builders' work, its trade routes, the
 * item it produces and where its army stands, in its own module so the
 * legality bodies it borrows (rules.ts, game.ts, effects.ts, city.ts,
 * units.ts) stay upstream of cityStates.ts with no import cycle.
 *
 * CIV6 (City-state): a city-state's city is an ordinary city — its Campus
 * yields Science, its Commercial Hub Gold — and the city's own yields drive
 * its turn: `computeCityStats` over `minorCity` pays Science and Culture into
 * the two research pots and Production into the build pot, under the minor's
 * production rows (half its yield, and the toward-rows of the item it goes
 * to), and Gold and Faith into its purse, which pays its units' upkeep and
 * buys what the census saw a minor buy. WHAT it produces is the fitted build
 * table (`MINOR_BUILD_ROWS`, C-38's census); what each item needs — the
 * minor's own researched unlock, a legal plot, an intact perimeter below a
 * higher wall, a free tile beside the centre for a unit — is the same rule a
 * major pays.
 */
import type { City, CityState, DistrictId, GameState, ResearchState, Tile, Unit } from './types';
import { BUILDINGS } from '../data/buildings';
import { ERAS, TECHS, type Era } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  CITY_STATE_TYPE_DISTRICT, MINOR_ARMY_CAP_SLOTS, MINOR_ARMY_CLASSES, MINOR_BUILD_ROWS, MINOR_BUILD_SLOTS,
  MINOR_BUILDER_BUY_SLOTS, MINOR_BUILDER_PROD_PCT, MINOR_BUILDER_RADIUS, MINOR_BUILDER_RATE_PERMILLE,
  MINOR_EXCLUDED_UNIT_CLASSES, MINOR_HARBOR_PROD_PCT, MINOR_LOSS_BUY_MULT, MINOR_LOSS_BUY_TURNS,
  MINOR_MILITARY_BUY_BP, MINOR_MILITARY_BUY_FLOOR, MINOR_MILITARY_PROD_PCT, MINOR_NAVAL_BUY_BP, MINOR_NAVAL_CLASS,
  MINOR_SMALL_MILITARY, MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_UPGRADE_GOLD,
  MINOR_WALK_STEPS_DAMAGED, MINOR_WALK_STEPS_PEACE, MINOR_WALK_STEPS_WAR, MINOR_WALK_WEIGHTS_PEACE,
  MINOR_WALK_WEIGHTS_WAR, MINOR_WALLS_PROD_PCT, type MinorBuildRow, FREE_CITY_BUILD_ROWS,
  MINOR_REPAIR_RESUME_PCT,
} from '../data/cityStates';
import { ENCAMPMENT_HP, UNIT_HP, UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN, type UnitDef } from '../data/units';
import { UNIT_PROMO_CLASS, type PromoClass } from '../data/promotions';
import { PROJECTS, projectConversionRate } from '../data/projects';
import { worshipBuildingOf } from '../data/religion';
import { CIV_LEVELS } from '../data/civLevels';
import { FAITH_PURCHASE_MULT, GOLD_PURCHASE_MULT } from '../data/constants';
import { canPlaceDistrictIn, fitEncampOuter, outerPool, validImprovements, wallsMax } from './rules';
import { seatGrowth } from './seatTurn';
import { bankruptcy, cityBorderGrowth, cityStrikes, cultureAfterGrowth, paveGround } from './phase';
import { applyTrainingGrants, centreStrength } from './combat';
import { districtScaledBase, goldAffordable, projectCost, repairAvailable } from './game';
import { computeCityStats } from './city';
import { minorCity, suzerainOf } from './cityStates';
import { computeUnlocksIn, purchaseStep, unitMaintenance, type Unlocks } from './effects';
import { buildingPillaged, cityPower, repairBuilding } from './yields';
import { centerBuildingIds } from './prodLayout';
import { cityLowlands, floodBarrierCost, repairBehindBarrier } from './climate';
import { minorRouteCandidate, minorTrade, tradeCapacity } from './trade';
import { FREE_SEAT, civsAtWar, hiddenResourcesFor, majorityReligionOf, seatOf, tileSeat } from './seats';
import { builderCost, cityNavalCapable, disbandUnit, raiseBestMelee, spawnUnit, tileFreeForUnit, traderCost, unitIsMilitary } from './units';
import { irradiated } from './nuclear';
import { atRngPoint, randRange } from './rand';
import { IMPROVEMENT_IDS } from './unitActions';
import { landWalker, walkUnit } from './walker';
import { worldEraIndex } from './eras';
import { hexDistance, tilesWithin } from '../../world/hex';
import { hasRiver, isWater } from '../../world/query';

/** The first legal plot in TILE-INDEX order — the GPU pick is the argmax of
 *  the eligibility plane, which is this same tile. -1 = no plot (also how a
 *  district the minor already holds reads, through the city's own list). An
 *  improved plot is a site like any other: the district removes the
 *  improvement (`paveGround`). */
function minorDistrictSite(state: GameState, cityState: CityState, district: DistrictId, unlocks: Unlocks): number {
  const centre = state.map.tiles[cityState.centerIndex];
  const city = minorCity(cityState);
  const owns = (t: Tile) => tileSeat(t) === cityState.seat;
  const plots = tilesWithin(state.map, centre.col, centre.row, 3).slice().sort((a, b) => a.index - b.index);
  for (const t of plots) {
    if (canPlaceDistrictIn(state, city, district, t.index, { unlocks, ownsTile: owns }).ok) return t.index;
  }
  return -1;
}

/** One minor at a time — a district one minor lands may lend a neighbour's
 *  district adjacency across the border, so the next minor's yields read it.
 *  A levied army due home comes home first; the city's grid is resolved
 *  before its yields read it. Then, as every player's turn runs
 *  (tools/civ6lab/turn_order_civ6.md): its economy (`minorEconomy`) and the
 *  research that completes on it, then its city — the plan, the Production
 *  its city makes now, then growth and borders on the city as it stands
 *  after that (`minorGrowth`) — its city presses a religion it follows on
 *  that religion's founder's turn (`spreadReligiousPressure`) — then its
 *  actions: a research completion's
 *  upgrades, its purchases, its Builders' work, its routes' walk and a free
 *  Trader's route, its city's ranged strikes (the majors' own body fired
 *  from the minor's centre strength), and last its army's walk. */
export function minorPhase(state: GameState): void {
  for (const cityState of state.cityStates) {
    atRngPoint(state, { kind: 'seat', seat: cityState.seat, turn: state.turn });
    minorLevyReturn(state, cityState);
    const military = minorMilitary(state, cityState).length;
    if (cityState.armySeen !== undefined && military < cityState.armySeen) cityState.lossTurn = state.turn;
    minorPower(state, cityState);
    const gained = minorEconomy(state, cityState);
    minorPlan(state, cityState);
    minorBuild(state, cityState, computeCityStats(state, minorCity(cityState)).total.production);
    minorGrowth(state, cityState);
    minorUpgrades(state, cityState, gained);
    minorPurchases(state, cityState);
    minorBuilders(state, cityState);
    minorTrade(state, cityState);
    const city = minorCity(cityState);
    cityStrikes(state, city, centreStrength(state, city));
    if (!walkHeld) minorWalk(state, cityState);
    cityState.armySeen = minorMilitary(state, cityState).length;
  }
}

/**
 * THE LEVIED ARMY COMES HOME. CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS):
 * "They will return to the city-state after {2_TurnLimit} Turns, or if the
 * Suzerain changes." Every unit still standing that the levy took from this
 * minor (`Unit.leviedFrom`) is the minor's again where it stands.
 */
export function minorLevyReturn(state: GameState, cityState: CityState): void {
  if (cityState.levySeat === undefined) return;
  if (state.turn < (cityState.levyEnds ?? 0) && suzerainOf(cityState) === cityState.levySeat) return;
  for (const u of state.units) {
    if (u.leviedFrom !== cityState.seat) continue;
    u.seat = cityState.seat;
    delete u.leviedFrom;
  }
  delete cityState.levySeat;
  delete cityState.levyEnds;
}

/**
 * THE MINOR'S GRID (`cityPower` over its one city). CIV6 (Power): the load is
 * met all at once or not at all. A city-state holds no stockpile, so no power
 * plant can run for it; its renewables (a Dam, the Solar and Wind Farms on its
 * plots) must carry the whole load — or a running `fullyPowered` project
 * (Industrial Zone Logistics) meets it, as a major's does.
 */
export function minorPower(state: GameState, cityState: CityState): void {
  const p = cityPower(state, minorCity(cityState));
  cityState.powered = p.demand > 0 && (p.supply >= p.demand || !!cityState.fullyPowered);
}

/** The minor's military units, in unit order. */
function minorMilitary(state: GameState, cityState: CityState): Unit[] {
  return state.units.filter((u) => u.seat === cityState.seat && unitIsMilitary(u.type));
}

/**
 * THE MINOR'S ECONOMY, in the order every player's start of turn runs
 * (tools/civ6lab/turn_order_civ6.md): its city's Science and Culture as the
 * turn opens feed the two research pots, and the research completes on them
 * (`minorResearch`); then, off the city as that research left it, its Gold
 * banks and pays its units' upkeep — each unit's own Maintenance, a minor
 * carrying no government or policy that cuts it — and meets the
 * `bankruptcy` every seat meets, and its Faith banks. Returns how many trees
 * completed a row, the upgrade trigger's count.
 */
export function minorEconomy(state: GameState, cityState: CityState): number {
  let y = computeCityStats(state, minorCity(cityState)).total;
  cityState.research.techProgress += y.science;
  cityState.research.civicProgress += y.culture;
  const gained = minorResearch(state, cityState);
  if (gained > 0) y = computeCityStats(state, minorCity(cityState)).total;
  let upkeep = 0;
  for (const u of state.units) if (u.seat === cityState.seat) upkeep += unitMaintenance(u);
  cityState.treasury += y.gold;
  cityState.treasury -= upkeep;
  bankruptcy(state, cityState, (u) => unitMaintenance(u));
  cityState.faith += y.faith;
  return gained;
}

/**
 * THE MINOR'S CITY GROWS AND CLAIMS, on the city as it stands after its
 * production. CIV6 (City-state): the install has ONE city rule, so the
 * minor's city GROWS on its food box and CLAIMS ground on its culture box
 * exactly as a major's does. Both rules are the majors' own composers, and
 * the boxes live on the `CityState` record because `minorCity` builds a fresh
 * `City` view every call — so the results are written back.
 */
export function minorGrowth(state: GameState, cityState: CityState): void {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const popBefore = city.population;
  seatGrowth(city, stats.effectiveFoodSurplus, stats.growthNeeded, state.turn);
  cityBorderGrowth(state, city, cityState.seat, cultureAfterGrowth(state, city, popBefore, stats));
  cityState.population = city.population;
  cityState.unconvertedPressure = city.unconvertedPressure;
  cityState.foodBox = city.foodBox;
  cityState.cultureBox = city.cultureBox;
  cityState.nextPlot = city.nextPlot;
  cityState.tilesAcquired = city.tilesAcquired;
}

/** The cheapest available row completes (table order on a price tie), at most
 *  one per pot per turn. Early Empire is the row `borderClosedTo` reads.
 *  CIV6 (Urban Defenses): the tech "builds modern fortifications around the
 *  City Centers of all current and future cities and their Encampment
 *  districts" — a minor's perimeter arrives at the urban tier's full pool,
 *  as `urbanDefensesFit` fits a major's cities. Returns how many trees
 *  completed a row this turn — the upgrade trigger's count. */
function minorResearch(state: GameState, cityState: CityState): number {
  const r = cityState.research;
  let gained = 0;
  const tech = cheapestAvailable(TECHS, r.techs);
  if (tech && r.techProgress >= TECHS[tech].cost) {
    gained += 1;
    r.techProgress -= TECHS[tech].cost;
    r.techs.push(tech);
    if (tech === URBAN_DEFENSES_TECH) {
      cityState.outerHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
      for (const d of cityState.districts ?? []) {
        const t = state.map.tiles[d.tileIndex];
        if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
      }
    }
  }
  const civic = cheapestAvailable(CIVICS, r.civics);
  if (civic && r.civicProgress >= CIVICS[civic].cost) {
    gained += 1;
    r.civicProgress -= CIVICS[civic].cost;
    r.civics.push(civic);
  }
  return gained;
}

/**
 * THE UPGRADE TRIGGER. CIV6 (Leaders.xml, MinorCivTriggeredTrees): a minor's
 * "Upgrade Units" tree runs on TRIGGER_TECH_UPGRADE and TRIGGER_CIVIC_UPGRADE
 * — a technology or a civic gained. The census reads ONE upgrade per such turn
 * (1,356 of the 1,608 upgrade turns upgrade one unit, 222 two: a tech and a
 * civic together), the same chassis' remaining units following on later
 * triggers, at `MINOR_UPGRADE_GOLD` each. So each completion upgrades the
 * first unit in unit order that may: the chassis' upgrade unlocked by the
 * minor's own research, standing on the minor's ground with Movement left
 * (CIV6, Unit: "in friendly territory", "more than 0 Movement"), the treasury
 * covering the price. A minor ignores the strategic resource the new chassis
 * asks (`CivilizationLevels.IgnoresUnitStrategicResourceRequirements`,
 * CITY_STATE true). Which unit goes first is unmeasured. The upgrade spends
 * the unit's turn, as every upgrade here does.
 */
export function minorUpgrades(state: GameState, cityState: CityState, gained: number): void {
  for (let n = 0; n < gained; n++) {
    if (!goldAffordable(cityState.treasury, MINOR_UPGRADE_GOLD)) return;
    const u = state.units.find((x) => x.seat === cityState.seat && minorCanUpgrade(state, cityState, x));
    if (!u) return;
    cityState.treasury -= MINOR_UPGRADE_GOLD;
    u.type = UNITS[u.type].upgradesTo!;
    u.movesLeft = 0;
    raiseBestMelee(state, cityState.seat, u.type, u.formation ?? 0);
  }
}

function minorCanUpgrade(state: GameState, cityState: CityState, u: Unit): boolean {
  const next = UNITS[u.type]?.upgradesTo;
  const def = next ? UNITS[next] : undefined;
  if (!def || u.movesLeft <= 0) return false;
  const r = cityState.research;
  if (def.requiresTech && !r.techs.includes(def.requiresTech)) return false;
  if (def.requiresCivic && !r.civics.includes(def.requiresCivic)) return false;
  return tileSeat(state.map.tiles[u.tileIndex]) === cityState.seat;
}

/**
 * THE MINOR'S PURCHASES (C-38's census; the rates in cpu/data/cityStates.ts).
 * A Builder, on a turn the minor has Builder work (`minorBuilderWork`), none
 * stands or is in production (`minorTrainsBuilder`) and the treasury covers
 * its price: one draw at the episode's rate (`builderBuyRate`). Then a military unit, on a turn
 * the treasury holds `MINOR_MILITARY_BUY_FLOOR` — or a Warrior Monk is in
 * reach — one draw at the rate its military count sets (`MINOR_MILITARY_BUY_BP`,
 * tripled within `MINOR_LOSS_BUY_TURNS` of a loss). A drawn purchase buys a
 * Warrior Monk with Faith where the minor may (CIV6: "a city that has a
 * majority religion with the Warrior Monks Follower Belief and a Holy Site
 * with a Temple") and its faith covers one — the census's only faith spend —
 * else the army row's chassis (`minorArmyUnit`) with Gold where the treasury
 * covers it. Then a ship (`minorBuyNaval`). A bought unit stands on or beside
 * the centre and carries the city's training grants, as a trained one does;
 * with no free tile nothing is bought.
 */
export function minorPurchases(state: GameState, cityState: CityState): void {
  const units = state.units.filter((u) => u.seat === cityState.seat);
  if (!units.some((u) => u.type === 'BUILDER') && !minorTrainsBuilder(state, cityState)
      && minorBuilderWork(state, cityState)) {
    const price = purchaseStep(builderCost(state, cityState.seat) * GOLD_PURCHASE_MULT);
    if (goldAffordable(cityState.treasury, price)
      && randRange(state, 1000, 'Engine: minor buy') < (cityState.builderBuyRate ?? 0)) {
      const u = spawnUnit(state, 'BUILDER', cityState.centerIndex, cityState.seat);
      if (u) {
        applyTrainingGrants(state, minorCity(cityState), u);
        cityState.treasury -= price;
        cityState.buildersTrained += 1;
      }
    }
  }
  minorBuyMilitary(state, cityState, units);
  minorBuyNaval(state, cityState);
}

/** Is the minor's production on a Builder this turn? The Builder row is the
 *  table's first and wants one whenever none stands, so its Builder is in
 *  production unless a pillaged building's repair takes the turn first
 *  (`minorBuild`); asked with none standing. */
function minorTrainsBuilder(state: GameState, cityState: CityState): boolean {
  if (MINOR_BUILD_ROWS[0].kind !== 'builder') throw new Error('minorTrainsBuilder: the Builder row is not first');
  return !(minorRepairTarget(state, cityState) && !cityState.repairWait);
}

/** Has the minor BUILDER WORK — an owned plot (its centre aside) holding a
 *  pillaged improvement, or none and a valid improvement for it
 *  (`validImprovements`, the minor's research): any land plot, a water plot
 *  only under a resource it sees (lab 5d, runs/c38s3_builder_g300_k0_b0_20260928T024946Z.jsonl
 *  and runs/c38h1_work.jsonl: 0 buys in 35 minor-turns without work, 6 of 6
 *  with work bought within 1–3 turns). `_minor_builder_work` is the twin. */
export function minorBuilderWork(state: GameState, cityState: CityState): boolean {
  const hidden = hiddenResourcesFor(state, cityState.seat);
  for (const t of state.map.tiles) {
    if (tileSeat(t) !== cityState.seat || t.index === cityState.centerIndex) continue;
    if (t.improvement) {
      if (t.pillaged) return true;
      continue;
    }
    if (isWater(t) && (!t.resource || hidden.has(t.resource))) continue;
    if (validImprovements(state, t, cityState.seat).length > 0) return true;
  }
  return false;
}

function minorBuyMilitary(state: GameState, cityState: CityState, units: Unit[]): void {
  const military = units.filter((u) => unitIsMilitary(u.type)).length;
  const bp = military < MINOR_MILITARY_BUY_BP.length ? MINOR_MILITARY_BUY_BP[military] : 0;
  if (bp <= 0) return;
  const monkPrice = purchaseStep(Math.round(UNITS.WARRIOR_MONK.cost * FAITH_PURCHASE_MULT));
  const monk = minorMonkOk(state, cityState) && goldAffordable(cityState.faith, monkPrice);
  if (!monk && !goldAffordable(cityState.treasury, MINOR_MILITARY_BUY_FLOOR)) return;
  const recent = cityState.lossTurn !== undefined && state.turn - cityState.lossTurn <= MINOR_LOSS_BUY_TURNS;
  if (randRange(state, 10000, 'Engine: minor buy') >= (recent ? bp * MINOR_LOSS_BUY_MULT : bp)) return;
  if (monk) {
    const u = spawnUnit(state, 'WARRIOR_MONK', cityState.centerIndex, cityState.seat);
    if (u) {
      cityState.faith -= monkPrice;
      raiseBestMelee(state, cityState.seat, 'WARRIOR_MONK');
    }
    return;
  }
  const id = minorArmyUnit(trainableIn(cityState.research, minorAnyResource()), units);
  if (!id) return;
  const price = purchaseStep(UNITS[id].cost * GOLD_PURCHASE_MULT);
  if (!goldAffordable(cityState.treasury, price)) return;
  const u = spawnUnit(state, id, cityState.centerIndex, cityState.seat);
  if (!u) return;
  applyTrainingGrants(state, minorCity(cityState), u);
  cityState.treasury -= price;
}

/**
 * A SHIP (C-38's census: a minor buys its naval units, the naval melee line,
 * and never builds one). On a turn the minor holds no ship, its city may field
 * one (`cityNavalCapable`: water beside the centre, or a Harbor), it may train
 * a naval melee chassis and the treasury covers that chassis' Gold price: one
 * draw at `MINOR_NAVAL_BUY_BP`, and the strongest such chassis lands.
 */
function minorBuyNaval(state: GameState, cityState: CityState): void {
  if (state.units.some((u) => u.seat === cityState.seat && UNITS[u.type]?.naval)) return;
  if (!cityNavalCapable(state, minorCity(cityState))) return;
  const id = minorBestOfClass(trainableIn(cityState.research, minorAnyResource(), true), MINOR_NAVAL_CLASS);
  if (!id) return;
  const price = purchaseStep(UNITS[id].cost * GOLD_PURCHASE_MULT);
  if (!goldAffordable(cityState.treasury, price)) return;
  if (randRange(state, 10000, 'Engine: minor buy') >= MINOR_NAVAL_BUY_BP) return;
  const u = spawnUnit(state, id, cityState.centerIndex, cityState.seat);
  if (!u) return;
  applyTrainingGrants(state, minorCity(cityState), u);
  cityState.treasury -= price;
}

/** May the minor's city sell a Warrior Monk — its majority religion's
 *  follower belief is Warrior Monks, it holds a Temple and a complete,
 *  unpillaged Holy Site? */
function minorMonkOk(state: GameState, cityState: CityState): boolean {
  if (!UNITS.WARRIOR_MONK) return false;
  const rel = majorityReligionOf(state, cityState.seat);
  if (rel < 0 || seatOf(state, rel)?.religion.follower !== 'WARRIOR_MONKS') return false;
  if (!(cityState.buildings ?? []).includes('TEMPLE')) return false;
  const hs = (cityState.districts ?? []).find((d) => d.type === 'HOLY_SITE');
  const t = hs ? state.map.tiles[hs.tileIndex] : undefined;
  return !!t?.districtComplete && !t.districtPillaged;
}

/** CIV6 (`CivilizationLevels.IgnoresUnitStrategicResourceRequirements`): a
 *  city-state trains and upgrades into a chassis whatever strategic resource
 *  it asks. */
function minorAnyResource(): boolean {
  return CIV_LEVELS.CITY_STATE.ignoresUnitStrategicResourceRequirements;
}

/** THE ACTION REPLAY'S HOLD on the minors' armies: a city-state's moves and
 *  battles are its AI's, which the record carries, so its walk sits out.
 *  False outside a replay. */
let walkHeld = false;
export function holdMinorWalk(on: boolean): void {
  walkHeld = on;
}

/**
 * THE MINOR'S WALKER (`walkUnit`, C-38's census): each land military unit, in
 * unit order, walks around the minor's centre on the peace or the war tables
 * — at war while any major is at war with it — a damaged unit on the damaged
 * step table. The list is taken before anyone moves.
 */
function minorWalk(state: GameState, cityState: CityState): void {
  const atWar = state.seats.some((s) => civsAtWar(state, cityState.seat, s.seat));
  const weights = atWar ? MINOR_WALK_WEIGHTS_WAR : MINOR_WALK_WEIGHTS_PEACE;
  const walkers = state.units.filter((u) => u.seat === cityState.seat && landWalker(u));
  for (const u of walkers) {
    const steps = u.hp < UNIT_HP ? MINOR_WALK_STEPS_DAMAGED : atWar ? MINOR_WALK_STEPS_WAR : MINOR_WALK_STEPS_PEACE;
    walkUnit(state, u, [cityState.centerIndex], steps, weights);
  }
}

function cheapestAvailable(
  catalog: Record<string, { cost: number; prereqs: string[] }>,
  have: string[],
): string | null {
  let best: string | null = null;
  for (const [id, def] of Object.entries(catalog)) {
    if (have.includes(id)) continue;
    if (!def.prereqs.every((p) => have.includes(p))) continue;
    if (!best || def.cost < catalog[best].cost) best = id;
  }
  return best;
}

/**
 * THE MINOR'S BUILDERS. Each of its Builders holding a charge, in unit
 * order, may lay one improvement a turn: a turn's draw at
 * `MINOR_BUILDER_RATE_PERMILLE`, then ONE draw over every (plot, improvement)
 * pair the engine's own rule (`validImprovements`, the minor's seat) offers
 * on the minor's land plots within `MINOR_BUILDER_RADIUS` of its centre that
 * the Builder may stand on — plots ascending, improvements in catalog order.
 * Which plot and which improvement a minor picks is unmeasured (LAB
 * C-38-S1), so the pick is uniform (OWNER: randomised where neither the
 * install nor the lab settles it). The Builder stands on the plot it
 * improves, spends a charge and its turn, and is gone with its last charge —
 * the majors' own tail. No pair, no draw.
 */
function minorBuilders(state: GameState, cityState: CityState): void {
  const builders = state.units.filter((u) => u.seat === cityState.seat && u.type === 'BUILDER' && (u.charges ?? 0) > 0);
  for (const u of builders) {
    const picks = minorImprovementPicks(state, cityState, u);
    if (picks.length === 0) continue;
    if (randRange(state, 1000, 'Engine: minor builders') >= MINOR_BUILDER_RATE_PERMILLE) continue;
    const [ti, imp] = picks[randRange(state, picks.length, 'Engine: minor builders')];
    minorBuilderLays(state, u, ti, imp);
  }
}

/** A MINOR'S BUILDER LAYS AN IMPROVEMENT: it stands on the plot, spends a
 *  charge and its turn, and is gone with its last charge. */
export function minorBuilderLays(state: GameState, u: Unit, plot: number, imp: string): void {
  const tile = state.map.tiles[plot];
  u.tileIndex = plot;
  tile.improvement = imp;
  tile.pillaged = false;
  u.charges = (u.charges ?? 0) - 1;
  u.movesLeft = 0;
  if (u.charges <= 0) disbandUnit(state, u.id);
}

/** The (plot, improvement) pairs a minor's Builder may lay this turn. */
export function minorImprovementPicks(state: GameState, cityState: CityState, builder: Unit): [number, string][] {
  const centre = state.map.tiles[cityState.centerIndex];
  const plots = tilesWithin(state.map, centre.col, centre.row, MINOR_BUILDER_RADIUS).slice().sort((a, b) => a.index - b.index);
  const out: [number, string][] = [];
  for (const t of plots) {
    if (t.index === cityState.centerIndex || tileSeat(t) !== cityState.seat || t.improvement || isWater(t)) continue;
    if (t.index !== builder.tileIndex && !tileFreeForUnit(state, t.index, cityState.seat, builder)) continue;
    const ks = validImprovements(state, t, cityState.seat).map((id) => IMPROVEMENT_IDS.indexOf(id)).sort((a, b) => a - b);
    for (const k of ks) out.push([t.index, IMPROVEMENT_IDS[k]]);
  }
  return out;
}

/**
 * THE EPISODE'S DRAWS, once, at the minor's first turn with its city: one
 * slot of each drawn row (`MINOR_BUILD_ROWS[r].from`, the minor's type) in
 * table order, then the army cap, then the Builder purchase rate. A row
 * without draws keeps 0.
 */
export function minorPlan(state: GameState, cityState: CityState): void {
  if (cityState.armyCap !== undefined) return;
  cityState.buildFrom = MINOR_BUILD_ROWS.map((row) =>
    (row.from ? row.from[cityState.type][randRange(state, MINOR_BUILD_SLOTS, 'Engine: minor plan')] : 0));
  cityState.armyCap = MINOR_ARMY_CAP_SLOTS[randRange(state, MINOR_BUILD_SLOTS, 'Engine: minor plan')];
  cityState.builderBuyRate = MINOR_BUILDER_BUY_SLOTS[randRange(state, MINOR_BUILDER_BUY_SLOTS.length, 'Engine: minor plan')];
}

/** The land (or, with `naval`, the naval) military chassis a research
 *  record may train: it unlocks it, it asks no strategic resource unless
 *  `anyResource` (the holder ignores the ask, or holds no stockpile to meet
 *  it), it is no civilization's unique, and MinorCivUnitBuilds does not bar
 *  its class. A minor's and a Free City's set alike. */
export function trainableIn(r: { techs: string[]; civics: string[] }, anyResource: boolean, naval = false): UnitDef[] {
  return Object.values(UNITS).filter((d) =>
    unitIsMilitary(d.id) && !!d.naval === naval && !d.air && !d.faithOnly && !d.spawnOnly && !d.settler && !d.uniqueTo
    && (anyResource || !d.requiresResource)
    && (!d.requiresTech || r.techs.includes(d.requiresTech))
    && (!d.requiresCivic || r.civics.includes(d.requiresCivic))
    && !!UNIT_PROMO_CLASS[d.id] && !MINOR_EXCLUDED_UNIT_CLASSES.includes(UNIT_PROMO_CLASS[d.id]));
}

/** The strongest chassis of `cls` in a trainable set, ties by catalog order
 *  — `bestTrainableOfClass`'s rule over the minor's (or Free City's) set. */
export function minorBestOfClass(trainable: UnitDef[], cls: PromoClass): string | null {
  let best: UnitDef | undefined;
  for (const d of trainable) {
    if (UNIT_PROMO_CLASS[d.id] !== cls) continue;
    if (!best || (d.combat ?? 0) > (best.combat ?? 0)) best = d;
  }
  return best?.id ?? null;
}

/** The army row's chassis: the class, among those the minor can field, its
 *  army holds fewest of against `MINOR_ARMY_CLASSES`' weights — (held + 1) /
 *  weight, compared crosswise in integers, the table order on a tie — and
 *  that class's strongest chassis. */
function minorArmyUnit(trainable: UnitDef[], units: Unit[]): string | null {
  let pick: string | null = null;
  let held = 0;
  let weight = 1;
  for (const [cls, w] of MINOR_ARMY_CLASSES) {
    const id = minorBestOfClass(trainable, cls);
    if (!id) continue;
    const n = units.filter((u) => UNIT_PROMO_CLASS[u.type] === cls).length;
    if (pick === null || (n + 1) * weight < (held + 1) * w) {
      pick = id;
      held = n;
      weight = w;
    }
  }
  return pick;
}

/** May the minor raise building `id` now? Its own research unlocks it (a
 *  worship building answers to its religion instead, `minorWorship`); it is
 *  not already held; its district stands complete and clean (the centre's
 *  own for a City Center row); the row it requires is held and the one it
 *  excludes is not; a Water Mill wants a river at the centre; a Flood
 *  Barrier "must be built in a city with one or more Coastal Lowland tiles";
 *  and CIV6: "While city defenses are damaged, you cannot build higher levels
 *  of Walls." */
function minorBuildingOk(state: GameState, cityState: CityState, id: string, unlocks: Unlocks): boolean {
  const def = BUILDINGS[id];
  const held = cityState.buildings ?? [];
  if (!def || held.includes(id) || (!def.worship && !unlocks.buildings.has(id))) return false;
  const centre = state.map.tiles[cityState.centerIndex];
  const home = def.district === 'CITY_CENTER' ? centre
    : (cityState.districts ?? []).map((d) => state.map.tiles[d.tileIndex])
      .find((t) => t.district === def.district && t.districtComplete);
  if (!home || irradiated(home)) return false;
  if (def.requiresAny?.length && !def.requiresAny.some((r) => held.includes(r))) return false;
  if (def.exclusiveWith?.some((x) => held.includes(x))) return false;
  if (def.special === 'WATER_MILL' && !hasRiver(centre)) return false;
  if (def.floodBarrier && cityLowlands(state, minorCity(cityState)).length === 0) return false;
  const shape = { buildings: held, seat: cityState.seat, outerHp: cityState.outerHp };
  if (def.walls && outerPool(state, shape) < wallsMax(state, shape)) return false;
  return true;
}

/** A building's price for the minor: its catalog Cost, the Flood Barrier's
 *  priced off the lowland it covers (`floodBarrierCost`). */
function minorBuildingCost(state: GameState, cityState: CityState, id: string): number {
  const def = BUILDINGS[id];
  return def.floodBarrier ? floodBarrierCost(state, minorCity(cityState)) : def.cost;
}

/** The worship building the minor's city is offered (`worshipOffered`): the
 *  one its majority religion's Worship belief names, none while it holds a
 *  worship building. */
function minorWorship(state: GameState, cityState: CityState): string | undefined {
  if ((cityState.buildings ?? []).some((b) => BUILDINGS[b]?.worship)) return undefined;
  const rel = majorityReligionOf(state, cityState.seat);
  return rel < 0 ? undefined : worshipBuildingOf(seatOf(state, rel)?.religion.worship);
}

/** May the minor run district project `id` now? Its district stands complete
 *  and clean in its city (`availableProjects`' district clause). */
function minorProjectOk(state: GameState, cityState: CityState, id: string): boolean {
  const def = PROJECTS[id];
  if (!def) return false;
  const home = (cityState.districts ?? []).map((d) => state.map.tiles[d.tileIndex])
    .find((t) => t.district === def.district && t.districtComplete);
  return !!home && !irradiated(home);
}

/** How many Traders the minor has out or standing — what its trade capacity
 *  bounds. */
function minorTraders(state: GameState, cityState: CityState): number {
  let n = (cityState.tradeRoutes ?? []).length;
  for (const u of state.units) if (u.seat === cityState.seat && u.type === 'TRADER') n += 1;
  return n;
}

/** The item a row asks for now, or null: the unit it trains, the building it
 *  raises, the district it lays or the project it runs. */
type MinorWant = { unit: string } | { building: string } | { district: DistrictId; site: number }
  | { project: string } | null;

function minorWant(
  state: GameState, cityState: CityState, row: MinorBuildRow, units: Unit[], military: number,
  trainable: () => UnitDef[], unlocks: Unlocks,
): MinorWant {
  switch (row.kind) {
    case 'builder':
      return units.some((u) => u.type === 'BUILDER') ? null : { unit: 'BUILDER' };
    case 'unit': {
      const want = row.below !== undefined ? military < row.below
        : !units.some((u) => UNIT_PROMO_CLASS[u.type] === row.cls);
      const id = want ? minorBestOfClass(trainable(), row.cls!) : null;
      return id ? { unit: id } : null;
    }
    case 'army': {
      const id = military < cityState.armyCap! ? minorArmyUnit(trainable(), units) : null;
      return id ? { unit: id } : null;
    }
    case 'trader': {
      const def = UNITS.TRADER;
      const r = cityState.research;
      if ((def.requiresTech && !r.techs.includes(def.requiresTech))
        || (def.requiresCivic && !r.civics.includes(def.requiresCivic))) return null;
      return minorTraders(state, cityState) < tradeCapacity(state, cityState.seat)
        && minorRouteCandidate(state, cityState) !== null ? { unit: 'TRADER' } : null;
    }
    case 'building': {
      const id = row.item![cityState.type];
      return id && minorBuildingOk(state, cityState, id, unlocks) ? { building: id } : null;
    }
    case 'worship': {
      const id = minorWorship(state, cityState);
      return id && minorBuildingOk(state, cityState, id, unlocks) ? { building: id } : null;
    }
    case 'district': {
      const id = row.item![cityState.type] as DistrictId | null;
      const site = id ? minorDistrictSite(state, cityState, id, unlocks) : -1;
      return id && site >= 0 ? { district: id, site } : null;
    }
    case 'repair':
      return repairAvailable(state, minorCity(cityState)) ? { project: 'REPAIR_DEFENSES' } : null;
    case 'project': {
      const id = row.item![cityState.type];
      return id && minorProjectOk(state, cityState, id) ? { project: id } : null;
    }
  }
}

/** The pillaged building the minor repairs next: the first in the
 *  production layout whose district stands complete and unpillaged (a City
 *  Center row always). */
function minorRepairTarget(state: GameState, cityState: CityState): string | undefined {
  if (!cityState.pillagedBuildings?.length) return undefined;
  return centerBuildingIds().find((id) => {
    if (!buildingPillaged(cityState, id)) return false;
    const def = BUILDINGS[id];
    if (def.district === 'CITY_CENTER') return true;
    return (cityState.districts ?? []).some((d) => {
      const t = state.map.tiles[d.tileIndex];
      return t.district === def.district && t.districtComplete && !t.districtPillaged;
    });
  });
}

/** What a minor's step may hold: a unit it trains, a building it raises, a
 *  district it lays on its plot, a project it runs, a pillaged building it
 *  repairs, or nothing. */
export type MinorItem = { unit: string } | { building: string } | { district: DistrictId; site: number }
  | { project: string } | { repair: string } | { none: true };

/** The item's key: the progress it keeps (`CityState.prodRetained`) and the
 *  item in hand (`CityState.prodItem`) are filed under it. */
export function minorItemKey(item: MinorItem): string {
  if ('unit' in item) return `unit:${item.unit}`;
  if ('building' in item) return `building:${item.building}`;
  if ('district' in item) return `district:${item.district}`;
  if ('project' in item) return `project:${item.project}`;
  if ('repair' in item) return `repair:${item.repair}`;
  return '';
}

let minorHold: ((state: GameState, cityState: CityState) => MinorItem | undefined) | null = null;

/** The action replay's hold on a minor's item (`cpu/harness/replay.ts`): the
 *  city-state's AI picks what its city builds, which the game's record
 *  carries; where `fn` answers, the step works the record's item in place of
 *  the build table's pick. Null outside a replay. */
export function holdMinorItem(fn: ((state: GameState, cityState: CityState) => MinorItem | undefined) | null): void {
  minorHold = fn;
}

/** The first row that wants an item it can make now — a pillaged building
 *  queued behind the item in hand first once that item is done
 *  (`CityState.repairWait`), and with no row wanting anything the pillaged
 *  building — or nothing. */
function minorPick(state: GameState, cityState: CityState): MinorItem {
  const repair = minorRepairTarget(state, cityState);
  if (repair && !cityState.repairWait) return { repair };
  const unlocks = computeUnlocksIn(cityState.research, []); // a MINOR carries no roster row
  const units = state.units.filter((u) => u.seat === cityState.seat);
  const military = units.filter((u) => unitIsMilitary(u.type)).length;
  let trainable: UnitDef[] | undefined;
  const lazyTrainable = () => (trainable ??= trainableIn(cityState.research, minorAnyResource()));
  for (let r = 0; r < MINOR_BUILD_ROWS.length; r++) {
    const row = MINOR_BUILD_ROWS[r];
    const from = cityState.buildFrom![r];
    if (row.from && (from < 0 || state.turn < from)) continue;
    const want = minorWant(state, cityState, row, units, military, lazyTrainable, unlocks);
    if (want) return want;
  }
  // no item in hand: a pillaged building is the item now
  cityState.repairWait = false;
  return repair ? { repair } : { none: true };
}

/**
 * THE MINOR'S BUILD STEP (City_BuildQueue 0x16f050, the step every city
 * takes; `tools/civ6lab/dll_readings.md` "H-1: the build queue's overflow").
 * What it works is the city-state AI's pick (`minorPick`, the fitted build
 * table, C-38's census; the record's item under a replay, `holdMinorItem`).
 * The city keeps each item's progress apart: an item it turns from keeps
 * what it holds, and one it turns back to resumes there
 * (`CityState.prodRetained`; runs/h1_duelw1117 Caguana's Monument, 2.5 at
 * t2, resumed at 2 after its Builder). The step pays the city's Production
 * (A, its yield, the minor's -50% among its percents) plus the overflow
 * store, the sum under the item's own row (a Builder or a military
 * unit +200%, walls +200%, the Harbor and the type's district +500%:
 * 0x1856ed multiplies the sum; 1117 Caguana's Builder 0 → 15 on 2.5 with an
 * idle step's 2.5 stored, its Warrior 0 → 16 on 3.5 with the Monument's 2).
 * An item completes when its progress covers its cost, one a turn — a unit
 * also needs a free tile on or beside the centre — and leaves the store A
 * less what it lacked before the step, never below 0 (A is the city's plain
 * Production: a minor holds no flat toward its head). With nothing in hand
 * the step adds A to the store. A district paves its plot (`paveGround`).
 * The walls' repair restores the walls, the city's and its Encampment's, at
 * the HP it puts back (`projectCost`); a district project converts the row's
 * `yieldPct` of what the step paid in (never above its cost) into its yield,
 * which the city's yields read until the next step (`CityState.projectYield`;
 * a city-state earns no Great People, so its points go nowhere). The step
 * clears the last conversion first. A PILLAGED building is queued after the
 * item the minor was working on when it fell (`CityState.repairWait`) and
 * then comes first: it resumes at `MINOR_REPAIR_RESUME_PCT` of its cost and
 * the rest is built (`minorRepairTarget`).
 */
function minorBuild(state: GameState, cityState: CityState, production: number): void {
  cityState.fullyPowered = false;
  delete cityState.buildProject;
  delete cityState.projectYield;
  // A, which is the city's plain Production too: a minor holds no flat
  // toward its head
  const made = production;
  const item = minorHold?.(state, cityState) ?? minorPick(state, cityState);
  const key = minorItemKey(item);
  // the item in hand changes: the one left keeps its progress
  if (key !== (cityState.prodItem ?? '')) {
    const kept = { ...cityState.prodRetained };
    if (cityState.prodItem && (cityState.prodProgress ?? 0) > 0) kept[cityState.prodItem] = cityState.prodProgress!;
    cityState.prodProgress = kept[key] ?? 0;
    delete kept[key];
    if (Object.keys(kept).length) cityState.prodRetained = kept;
    else delete cityState.prodRetained;
    if (key) cityState.prodItem = key;
    else delete cityState.prodItem;
  }
  if ('none' in item) {
    cityState.prodOverflow = (cityState.prodOverflow ?? 0) + made;
    return;
  }
  const military = state.units.filter((u) => u.seat === cityState.seat && unitIsMilitary(u.type)).length;
  const city = minorCity(cityState);
  const pct = 'unit' in item
    ? (item.unit === 'BUILDER' ? MINOR_BUILDER_PROD_PCT
      : unitIsMilitary(item.unit) && military < MINOR_SMALL_MILITARY ? MINOR_MILITARY_PROD_PCT : 0)
    : 'building' in item ? (BUILDINGS[item.building].walls ? MINOR_WALLS_PROD_PCT : 0)
      : 'district' in item ? (item.district === 'HARBOR' ? MINOR_HARBOR_PROD_PCT
        : item.district === CITY_STATE_TYPE_DISTRICT[cityState.type] ? MINOR_TYPE_DISTRICT_PROD_PCT[cityState.type] : 0)
        : 0;
  const cost = 'unit' in item
    ? (item.unit === 'BUILDER' ? builderCost(state, cityState.seat)
      : item.unit === 'TRADER' ? traderCost(state, cityState.seat) : UNITS[item.unit].cost)
    : 'building' in item ? minorBuildingCost(state, cityState, item.building)
      // the row's OWN base, not the specialty one: a minor builds real
      // districts too and the install prices an Aqueduct at 36
      : 'district' in item ? districtScaledBase(cityState.research, item.district)
        : 'project' in item ? projectCost(state, cityState.seat, item.project, city)
          : minorBuildingCost(state, cityState, item.repair)
            - Math.floor((minorBuildingCost(state, cityState, item.repair) * MINOR_REPAIR_RESUME_PCT) / 100);
  const before = cityState.prodProgress ?? 0;
  const paid = made + (cityState.prodOverflow ?? 0);
  cityState.prodProgress = before + paid * ((100 + pct) / 100);
  cityState.prodOverflow = 0;
  const def = 'project' in item ? PROJECTS[item.project] : undefined;
  if (def?.yield) cityState.projectYield = { key: def.yield, amount: Math.min(paid, cost) * projectConversionRate(def) };
  if ('district' in item) {
    // the MINOR's own price and the progress it is judged against. A
    // minor's district feeds its suzerain's yields, so a build one turn
    // apart is a small, permanent drift in a MAJOR's purse with no other
    // symptom.
    const _dl = (globalThis as { __diffLog?: string[] }).__diffLog;
    if (_dl) _dl.push(`dm:${cityState.seat}:${state.turn}:${item.district}`
      + ` t${cost} pot${Math.floor(cityState.prodProgress)}`);
  }
  if (cityState.prodProgress < cost) {
    if (def && 'project' in item) {
      cityState.fullyPowered = !!def.fullyPowered;
      cityState.buildProject = item.project;
    }
    return;
  }
  if ('unit' in item) {
    const unit = spawnUnit(state, item.unit, cityState.centerIndex, cityState.seat);
    if (!unit) return;
    applyTrainingGrants(state, minorCity(cityState), unit);
    if (item.unit === 'BUILDER') cityState.buildersTrained += 1;
  } else if ('building' in item) {
    const b = BUILDINGS[item.building];
    cityState.buildings = [...(cityState.buildings ?? []), item.building];
    if (b.floodBarrier) repairBehindBarrier(state, minorCity(cityState));
    if (b.walls) {
      cityState.outerHp = wallsMax(state, { buildings: cityState.buildings, seat: cityState.seat });
      // the Encampment's own pool refits at the walls tier (`fitEncampOuter`)
      for (const d of cityState.districts ?? []) {
        const t = state.map.tiles[d.tileIndex];
        if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = cityState.outerHp;
      }
    }
  } else if ('district' in item) {
    const t = state.map.tiles[item.site];
    t.district = item.district;
    t.districtComplete = true;
    paveGround(t);
    (cityState.districts ??= []).push({ type: item.district, tileIndex: item.site });
    if (item.district === 'ENCAMPMENT') {
      t.encampHp = ENCAMPMENT_HP;
      t.encampOuterHp = wallsMax(state, { buildings: cityState.buildings ?? [], seat: cityState.seat });
    }
  } else if ('project' in item) {
    if (def!.repair) {
      cityState.outerHp = wallsMax(state, city);
      fitEncampOuter(state, city);
    }
  } else {
    repairBuilding(cityState, item.repair);
  }
  if (!('repair' in item)) cityState.repairWait = false;
  cityState.prodOverflow = Math.max(0, made - Math.max(0, cost - before));
  cityState.prodProgress = 0;
  delete cityState.prodItem;
}

/**
 * THE FREE CITIES' RESEARCH — what a Free City may raise and train. The Free
 * Cities player researches nothing of its own (`seatOf(FREE_SEAT).research`
 * stays empty, which is what its walls tier reads), so its build table reads
 * the world era, the reading its grants already take (`eraUnitOfClass`):
 * every technology and civic of an era at or below the world's.
 */
export function freeCityResearch(state: GameState): ResearchState {
  const era = Math.max(0, worldEraIndex(state));
  const within = (e: Era) => Math.max(0, ERAS.indexOf(e)) <= era;
  return {
    tech: null, techProgress: 0, civic: null, civicProgress: 0, boosted: [], techRetained: {}, civicRetained: {},
    techs: Object.keys(TECHS).filter((id) => within(TECHS[id].era)),
    civics: Object.keys(CIVICS).filter((id) => within(CIVICS[id].era)),
  };
}

/** The Free City nearest `u` — ties to the first in the Free Cities' list. */
function nearestFreeCity(state: GameState, u: Unit): City | undefined {
  const at = state.map.tiles[u.tileIndex];
  let best: City | undefined;
  let bestD = Infinity;
  for (const c of state.freeSeat?.cities ?? []) {
    const t = state.map.tiles[c.centerIndex];
    const d = hexDistance(state.map, at.col, at.row, t.col, t.row);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** May the Free City raise building `id` now? The Free Cities' research
 *  unlocks it; the city does not hold it; its district stands complete and
 *  clean (the centre for a City Center row); the row it requires is held and
 *  the one it excludes is not; a Water Mill wants a river at the centre; and
 *  CIV6: "While city defenses are damaged, you cannot build higher levels of
 *  Walls." `minorBuildingOk`'s rule over a real city. */
function freeCityBuildingOk(state: GameState, city: City, id: string, unlocks: Unlocks): boolean {
  const def = BUILDINGS[id];
  if (!def || city.buildings.includes(id) || !unlocks.buildings.has(id)) return false;
  const centre = state.map.tiles[city.centerIndex];
  const home = def.district === 'CITY_CENTER' ? centre
    : city.districts.map((d) => state.map.tiles[d.tileIndex])
      .find((t) => t.district === def.district && t.districtComplete);
  if (!home || irradiated(home)) return false;
  if (def.requiresAny?.length && !def.requiresAny.some((r) => city.buildings.includes(r))) return false;
  if (def.exclusiveWith?.some((x) => city.buildings.includes(x))) return false;
  if (def.special === 'WATER_MILL' && !hasRiver(centre)) return false;
  if (def.walls && outerPool(state, city) < wallsMax(state, city)) return false;
  return true;
}

/**
 * A FREE CITY'S PRODUCTION (`FREE_CITY_BUILD_ROWS`, C-60's census) — the
 * city-state model over a real city: the turn's Production banks into the
 * city's pot (`City.freePot`; the Free Cities player carries no production
 * row of its own), and the first row that wants an item the city can make now
 * completes it when the pot covers it, one item a turn. A unit row wants its
 * class's strongest chassis the Free Cities may train (`trainableIn` over
 * `freeCityResearch`; CIV6 `CivilizationLevels.IgnoresUnitStrategicResource
 * Requirements` is false for FREE_CITIES and the seat holds no stockpile, so
 * no chassis that asks a resource) while no Free Cities unit of the class
 * calls the city its nearest Free City (`nearestFreeCity`) — the one
 * reading that keeps a walking guard counted; it lands on or beside the centre,
 * and with no free tile nothing is paid. A building row raises the first of
 * its items the city may; the repair row restores the walls (the city's and
 * its Encampment's) when `repairAvailable` allows, at the HP it puts back
 * (`projectCost`).
 */
export function freeCityBuild(state: GameState, city: City, production: number, research: ResearchState): void {
  const pot = (city.freePot ?? 0) + production;
  city.freePot = pot;
  const unlocks = computeUnlocksIn(research, []); // the Free Cities carry no roster row
  const guards = state.units.filter((u) => u.seat === FREE_SEAT && unitIsMilitary(u.type)
    && nearestFreeCity(state, u) === city);
  let trainable: UnitDef[] | undefined;
  for (const row of FREE_CITY_BUILD_ROWS) {
    if (row.kind === 'unit') {
      if (guards.some((u) => UNIT_PROMO_CLASS[u.type] === row.cls)) continue;
      trainable ??= trainableIn(research, CIV_LEVELS.FREE_CITIES.ignoresUnitStrategicResourceRequirements);
      const id = minorBestOfClass(trainable, row.cls!);
      if (!id) continue;
      const cost = UNITS[id].cost;
      if (pot < cost) return;
      if (!spawnUnit(state, id, city.centerIndex, FREE_SEAT)) return;
      city.freePot = pot - cost;
      return;
    }
    if (row.kind === 'repair') {
      if (!repairAvailable(state, city)) continue;
      const cost = projectCost(state, FREE_SEAT, 'REPAIR_DEFENSES', city);
      if (pot < cost) return;
      city.freePot = pot - cost;
      city.outerHp = wallsMax(state, city);
      fitEncampOuter(state, city);
      return;
    }
    const id = row.items!.find((b) => freeCityBuildingOk(state, city, b, unlocks));
    if (!id) continue;
    const cost = BUILDINGS[id].cost;
    if (pot < cost) return;
    city.freePot = pot - cost;
    city.buildings.push(id);
    if (BUILDINGS[id].walls) {
      city.outerHp = wallsMax(state, city);
      fitEncampOuter(state, city);
    }
    return;
  }
}
