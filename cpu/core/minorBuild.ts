/** THE MINOR'S TURN — its city's yields, the research they buy, the upgrades
 * and purchases its purse makes, its Builders' work, the item it produces and
 * where its army stands, in its own module so the legality bodies it borrows
 * (rules.ts, game.ts, effects.ts, city.ts, units.ts) stay upstream of
 * cityStates.ts with no import cycle.
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
  MINOR_MILITARY_BUY_BP, MINOR_MILITARY_BUY_FLOOR, MINOR_MILITARY_PROD_PCT, MINOR_PRODUCTION_PCT,
  MINOR_SMALL_MILITARY, MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_UPGRADE_GOLD, MINOR_WALK_STEPS_DAMAGED,
  MINOR_WALK_STEPS_PEACE, MINOR_WALK_STEPS_WAR, MINOR_WALK_WEIGHTS_PEACE, MINOR_WALK_WEIGHTS_WAR,
  MINOR_WALLS_PROD_PCT, type MinorBuildRow, FREE_CITY_BUILD_ROWS,
} from '../data/cityStates';
import { ENCAMPMENT_HP, UNIT_HP, UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN, type UnitDef } from '../data/units';
import { UNIT_PROMO_CLASS, type PromoClass } from '../data/promotions';
import { CIV_LEVELS } from '../data/civLevels';
import { FAITH_PURCHASE_MULT, GOLD_PURCHASE_MULT } from '../data/constants';
import { canPlaceDistrictIn, fitEncampOuter, outerPool, validImprovements, wallsMax } from './rules';
import { seatGrowth } from './seatTurn';
import { cityBorderGrowth, cityStrikes } from './phase';
import { applyTrainingGrants, minorCityCS } from './combat';
import { districtScaledBase, districtProgressAdd, goldAffordable, projectCost, repairAvailable } from './game';
import { computeCityStats } from './city';
import { minorCity } from './cityStates';
import { computeUnlocksIn, purchaseStep, type Unlocks } from './effects';
import { FREE_SEAT, civsAtWar, majorityReligionOf, seatOf, tileSeat } from './seats';
import { builderCost, disbandUnit, spawnUnit, tileFreeForUnit, unitIsMilitary } from './units';
import { irradiated } from './nuclear';
import { nextRandom } from './rand';
import { IMPROVEMENT_IDS } from './unitActions';
import { landWalker, walkUnit } from './walker';
import { worldEraIndex } from './eras';
import { hexDistance, tilesWithin } from '../../world/hex';
import { hasRiver, isWater } from '../../world/query';

/** The first legal plot in TILE-INDEX order — the GPU pick is the argmax of
 *  the eligibility plane, which is this same tile. -1 = no plot (also how a
 *  district the minor already holds reads, through the city's own list). An
 *  improved plot is no site, as on the site plane every seat's placement
 *  reads (`_district_elig_site`). */
function minorDistrictSite(state: GameState, cityState: CityState, district: DistrictId, unlocks: Unlocks): number {
  const centre = state.map.tiles[cityState.centerIndex];
  const city = minorCity(cityState);
  const owns = (t: Tile) => tileSeat(t) === cityState.seat;
  const plots = tilesWithin(state.map, centre.col, centre.row, 3).slice().sort((a, b) => a.index - b.index);
  for (const t of plots) {
    if (t.improvement) continue;
    if (canPlaceDistrictIn(state, city, district, t.index, { unlocks, ownsTile: owns }).ok) return t.index;
  }
  return -1;
}

/** One minor at a time — a district one minor lands may lend a neighbour's
 *  district adjacency across the border, so the next minor's yields read it.
 *  A research completion triggers its upgrades, then its purse buys; its
 *  Builders work before its production lands, so a Builder trained this turn
 *  waits for the next; then its city's ranged strikes (the majors' own body
 *  fired from the minor's centre strength), and last its army walks. */
export function minorPhase(state: GameState): void {
  for (const cityState of state.cityStates) {
    const military = minorMilitary(state, cityState).length;
    if (cityState.armySeen !== undefined && military < cityState.armySeen) cityState.lossTurn = state.turn;
    const production = minorAccrue(state, cityState);
    const gained = minorResearch(state, cityState);
    minorPlan(state, cityState);
    minorUpgrades(state, cityState, gained);
    minorPurchases(state, cityState);
    minorBuilders(state, cityState);
    minorBuild(state, cityState, production);
    cityStrikes(state, minorCity(cityState), minorCityCS(state, cityState));
    minorWalk(state, cityState);
    cityState.armySeen = minorMilitary(state, cityState).length;
  }
}

/** The minor's military units, in unit order. */
function minorMilitary(state: GameState, cityState: CityState): Unit[] {
  return state.units.filter((u) => u.seat === cityState.seat && unitIsMilitary(u.type));
}

/**
 * The city's yields, once a turn, through the walk every major's city rides —
 * and then the two rules that walk feeds.
 *
 * CIV6 (City-state): the install has ONE city rule, so the minor's city GROWS
 * on its food box and CLAIMS ground on its culture box exactly as a major's
 * does. Both rules are the majors' own composers, and the boxes live
 * on the `CityState` record because `minorCity` builds a fresh `City` view
 * every call — so the results are written back.
 *
 * Its Gold banks and pays its units' upkeep — each unit's own Maintenance, a
 * minor carrying no government or policy that cuts it. The census never read
 * a minor's treasury below 0 (35,081 minor-turns, balances held at 0 for fifty
 * turns with the army standing), so the balance stops at 0 and nothing is
 * disbanded. Its Faith banks. Its Production is returned for `minorBuild`,
 * which pays it into the pot under the rows of the item it goes toward.
 */
export function minorAccrue(state: GameState, cityState: CityState): number {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const y = stats.total;
  let upkeep = 0;
  for (const u of state.units) if (u.seat === cityState.seat) upkeep += UNITS[u.type]?.maintenance ?? 0;
  cityState.treasury += y.gold;
  cityState.treasury = Math.max(0, cityState.treasury - upkeep);
  cityState.research.techProgress += y.science;
  cityState.research.civicProgress += y.culture;
  cityState.faith += y.faith;
  seatGrowth(city, stats.effectiveFoodSurplus, stats.growthNeeded, state.turn);
  cityBorderGrowth(state, city, cityState.seat, y.culture);
  cityState.population = city.population;
  cityState.foodBox = city.foodBox;
  cityState.cultureBox = city.cultureBox;
  cityState.tilesAcquired = city.tilesAcquired;
  return y.production;
}

/** What the turn's Production puts toward an item: the city's yield under the
 *  minor's own percent (`MINOR_PRODUCTION_PCT`), then the item's toward-row. */
function minorProduction(production: number, towardPct: number): number {
  return production * ((100 + MINOR_PRODUCTION_PCT) / 100) * ((100 + towardPct) / 100);
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
 * A Builder, on a turn none stands and the treasury covers its price: one draw
 * at the episode's rate (`builderBuyRate`). Then a military unit, on a turn
 * the treasury holds `MINOR_MILITARY_BUY_FLOOR` — or a Warrior Monk is in
 * reach — one draw at the rate its military count sets (`MINOR_MILITARY_BUY_BP`,
 * tripled within `MINOR_LOSS_BUY_TURNS` of a loss). A drawn purchase buys a
 * Warrior Monk with Faith where the minor may (CIV6: "a city that has a
 * majority religion with the Warrior Monks Follower Belief and a Holy Site
 * with a Temple") and its faith covers one — the census's only faith spend —
 * else the army row's chassis (`minorArmyUnit`) with Gold where the treasury
 * covers it. A bought unit stands on or beside the centre and carries the
 * city's training grants, as a trained one does; with no free tile nothing is
 * bought.
 */
export function minorPurchases(state: GameState, cityState: CityState): void {
  const units = state.units.filter((u) => u.seat === cityState.seat);
  if (!units.some((u) => u.type === 'BUILDER')) {
    const price = purchaseStep(builderCost(state, cityState.seat) * GOLD_PURCHASE_MULT);
    if (goldAffordable(cityState.treasury, price)
      && Math.floor(nextRandom(state) * 1000) < (cityState.builderBuyRate ?? 0)) {
      const u = spawnUnit(state, 'BUILDER', cityState.centerIndex, cityState.seat);
      if (u) {
        applyTrainingGrants(state, minorCity(cityState), u);
        cityState.treasury -= price;
        cityState.buildersTrained += 1;
      }
    }
  }
  const military = units.filter((u) => unitIsMilitary(u.type)).length;
  const bp = military < MINOR_MILITARY_BUY_BP.length ? MINOR_MILITARY_BUY_BP[military] : 0;
  if (bp <= 0) return;
  const monkPrice = purchaseStep(Math.round(UNITS.WARRIOR_MONK.cost * FAITH_PURCHASE_MULT));
  const monk = minorMonkOk(state, cityState) && goldAffordable(cityState.faith, monkPrice);
  if (!monk && !goldAffordable(cityState.treasury, MINOR_MILITARY_BUY_FLOOR)) return;
  const recent = cityState.lossTurn !== undefined && state.turn - cityState.lossTurn <= MINOR_LOSS_BUY_TURNS;
  if (Math.floor(nextRandom(state) * 10000) >= (recent ? bp * MINOR_LOSS_BUY_MULT : bp)) return;
  if (monk) {
    const u = spawnUnit(state, 'WARRIOR_MONK', cityState.centerIndex, cityState.seat);
    if (u) cityState.faith -= monkPrice;
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
    if (Math.floor(nextRandom(state) * 1000) >= MINOR_BUILDER_RATE_PERMILLE) continue;
    const [ti, imp] = picks[Math.floor(nextRandom(state) * picks.length)];
    const tile = state.map.tiles[ti];
    u.tileIndex = ti;
    tile.improvement = imp;
    tile.pillaged = false;
    u.charges = (u.charges ?? 0) - 1;
    u.movesLeft = 0;
    if (u.charges <= 0) disbandUnit(state, u.id);
  }
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
    (row.from ? row.from[cityState.type][Math.floor(nextRandom(state) * MINOR_BUILD_SLOTS)] : 0));
  cityState.armyCap = MINOR_ARMY_CAP_SLOTS[Math.floor(nextRandom(state) * MINOR_BUILD_SLOTS)];
  cityState.builderBuyRate = MINOR_BUILDER_BUY_SLOTS[Math.floor(nextRandom(state) * MINOR_BUILDER_BUY_SLOTS.length)];
}

/** The land military chassis a research record may train: it unlocks it,
 *  it asks no strategic resource unless `anyResource` (the holder ignores
 *  the ask, or holds no stockpile to meet it), it is no civilization's
 *  unique, and MinorCivUnitBuilds does not bar its class. A minor's and a
 *  Free City's set alike. */
export function trainableIn(r: { techs: string[]; civics: string[] }, anyResource: boolean): UnitDef[] {
  return Object.values(UNITS).filter((d) =>
    unitIsMilitary(d.id) && !d.naval && !d.air && !d.faithOnly && !d.spawnOnly && !d.settler && !d.uniqueTo
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

/** May the minor raise building `id` now? Its own research unlocks it; it is
 *  not already held; its district stands complete and clean (the centre's
 *  own for a City Center row); the row it requires is held and the one it
 *  excludes is not; a Water Mill wants a river at the centre; and CIV6:
 *  "While city defenses are damaged, you cannot build higher levels of
 *  Walls." */
function minorBuildingOk(state: GameState, cityState: CityState, id: string, unlocks: Unlocks): boolean {
  const def = BUILDINGS[id];
  const held = cityState.buildings ?? [];
  if (!def || held.includes(id) || !unlocks.buildings.has(id)) return false;
  const centre = state.map.tiles[cityState.centerIndex];
  const home = def.district === 'CITY_CENTER' ? centre
    : (cityState.districts ?? []).map((d) => state.map.tiles[d.tileIndex])
      .find((t) => t.district === def.district && t.districtComplete);
  if (!home || irradiated(home)) return false;
  if (def.requiresAny?.length && !def.requiresAny.some((r) => held.includes(r))) return false;
  if (def.exclusiveWith?.some((x) => held.includes(x))) return false;
  if (def.special === 'WATER_MILL' && !hasRiver(centre)) return false;
  const shape = { buildings: held, seat: cityState.seat, outerHp: cityState.outerHp };
  if (def.walls && outerPool(state, shape) < wallsMax(state, shape)) return false;
  return true;
}

/** The item a row asks for now, or null: the unit it trains, the building it
 *  raises or the district it lays. */
type MinorWant = { unit: string } | { building: string } | { district: DistrictId; site: number } | null;

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
    case 'building': {
      const id = row.item![cityState.type];
      return id && minorBuildingOk(state, cityState, id, unlocks) ? { building: id } : null;
    }
    case 'district': {
      const id = row.item![cityState.type] as DistrictId | null;
      const site = id ? minorDistrictSite(state, cityState, id, unlocks) : -1;
      return id && site >= 0 ? { district: id, site } : null;
    }
  }
}

/** The first row that wants an item it can make now is the one the turn's
 *  Production goes toward — the pot takes it under that item's rows
 *  (`minorProduction`) — and the item completes when the pot covers it, at
 *  most one a turn; a unit also needs a free tile on or beside the centre.
 *  With no row wanting anything the pot takes it under the city's percent
 *  alone. */
function minorBuild(state: GameState, cityState: CityState, production: number): void {
  let pot = cityState.prodProgress ?? 0;
  const toward = (pct: number) => {
    pot += minorProduction(production, pct);
    cityState.prodProgress = pot;
  };
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
    if (!want) continue;
    if ('unit' in want) {
      const builder = want.unit === 'BUILDER';
      toward(builder ? MINOR_BUILDER_PROD_PCT : military < MINOR_SMALL_MILITARY ? MINOR_MILITARY_PROD_PCT : 0);
      const cost = builder ? builderCost(state, cityState.seat) : UNITS[want.unit].cost;
      if (pot < cost) return;
      const unit = spawnUnit(state, want.unit, cityState.centerIndex, cityState.seat);
      if (!unit) return;
      applyTrainingGrants(state, minorCity(cityState), unit);
      cityState.prodProgress = pot - cost;
      if (builder) cityState.buildersTrained += 1;
      return;
    }
    if ('building' in want) {
      const def = BUILDINGS[want.building];
      toward(def.walls ? MINOR_WALLS_PROD_PCT : 0);
      if (pot < def.cost) return;
      cityState.prodProgress = pot - def.cost;
      cityState.buildings = [...(cityState.buildings ?? []), want.building];
      if (def.walls) {
        cityState.outerHp = wallsMax(state, { buildings: cityState.buildings, seat: cityState.seat });
        // the Encampment's own pool refits at the walls tier (`fitEncampOuter`)
        for (const d of cityState.districts ?? []) {
          const t = state.map.tiles[d.tileIndex];
          if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = cityState.outerHp;
        }
      }
      return;
    }
    const district = want.district;
    // the row's OWN base, not the specialty one: a minor builds real
    // districts too and the install prices an Aqueduct at 36
    const cost = districtScaledBase(cityState.research, district) + districtProgressAdd(cityState.research, district);
    toward(district === 'HARBOR' ? MINOR_HARBOR_PROD_PCT
      : district === CITY_STATE_TYPE_DISTRICT[cityState.type] ? MINOR_TYPE_DISTRICT_PROD_PCT[cityState.type] : 0);
    // the MINOR's own price and the pool it is judged against. A minor's
    // district feeds its suzerain's yields, so a build one turn apart is a
    // small, permanent drift in a MAJOR's purse with no other symptom.
    const _dl = (globalThis as { __diffLog?: string[] }).__diffLog;
    if (_dl) _dl.push(`dm:${cityState.seat}:${state.turn}:${district}`
      + ` b${districtScaledBase(cityState.research, district)}`
      + ` g${districtProgressAdd(cityState.research, district)}`
      + ` t${cost} pot${Math.floor(pot)}`);
    if (pot < cost) return;
    cityState.prodProgress = pot - cost;
    const t = state.map.tiles[want.site];
    t.district = district;
    t.districtComplete = true;
    (cityState.districts ??= []).push({ type: district, tileIndex: want.site });
    if (district === 'ENCAMPMENT') {
      t.encampHp = ENCAMPMENT_HP;
      t.encampOuterHp = wallsMax(state, { buildings: cityState.buildings ?? [], seat: cityState.seat });
    }
    return;
  }
  toward(0);
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
    const d = hexDistance(at.col, at.row, t.col, t.row);
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
