/** THE MINOR'S TURN — its city's yields, the research they buy, its Builders'
 * work and the item it produces, in its own module so the legality bodies it
 * borrows (rules.ts, game.ts, effects.ts, city.ts, units.ts) stay upstream of
 * cityStates.ts with no import cycle.
 *
 * CIV6 (City-state): a city-state's city is an ordinary city — its Campus
 * yields Science, its Commercial Hub Gold — and the city's own yields drive
 * its turn: `computeCityStats` over `minorCity` pays Science and Culture into
 * the two research pots and Production into the build pot, under the minor's
 * production rows (half its yield, and the toward-rows of the item it goes
 * to), and banks Gold and Faith, which nothing spends. WHAT it produces is
 * the fitted build table (`MINOR_BUILD_ROWS`, C-38's census); what each item
 * needs — the minor's own researched unlock, a legal plot, an intact
 * perimeter below a higher wall, a free tile beside the centre for a unit —
 * is the same rule a major pays.
 */
import type { CityState, DistrictId, GameState, Tile, Unit } from './types';
import { BUILDINGS } from '../data/buildings';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  CITY_STATE_TYPE_DISTRICT, MINOR_ARMY_CAP_SLOTS, MINOR_ARMY_CLASSES, MINOR_BUILD_ROWS, MINOR_BUILD_SLOTS,
  MINOR_BUILDER_PROD_PCT, MINOR_BUILDER_RADIUS, MINOR_BUILDER_RATE_PERMILLE, MINOR_EXCLUDED_UNIT_CLASSES,
  MINOR_HARBOR_PROD_PCT, MINOR_MILITARY_PROD_PCT, MINOR_PRODUCTION_PCT, MINOR_SMALL_MILITARY,
  MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_WALLS_PROD_PCT, type MinorBuildRow,
} from '../data/cityStates';
import { ENCAMPMENT_HP, UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN, type UnitDef } from '../data/units';
import { UNIT_PROMO_CLASS, type PromoClass } from '../data/promotions';
import { canPlaceDistrictIn, outerPool, validImprovements, wallsMax } from './rules';
import { seatGrowth } from './seatTurn';
import { cityBorderGrowth, cityStrikes } from './phase';
import { applyTrainingGrants, minorCityCS } from './combat';
import { districtScaledBase, districtProgressAdd } from './game';
import { computeCityStats } from './city';
import { minorCity } from './cityStates';
import { computeUnlocksIn, type Unlocks } from './effects';
import { tileSeat } from './seats';
import { builderCost, disbandUnit, spawnUnit, tileFreeForUnit, unitIsMilitary } from './units';
import { irradiated } from './nuclear';
import { nextRandom } from './rand';
import { IMPROVEMENT_IDS } from './unitActions';
import { tilesWithin } from '../../world/hex';
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
 *  Its Builders work before its production lands, so a Builder trained this
 *  turn waits for the next; its turn ends with its city's ranged strikes, the
 *  majors' own body fired from the minor's centre strength. */
export function minorPhase(state: GameState): void {
  for (const cityState of state.cityStates) {
    const production = minorAccrue(state, cityState);
    minorResearch(state, cityState);
    minorBuilders(state, cityState);
    minorBuild(state, cityState, production);
    cityStrikes(state, minorCity(cityState), minorCityCS(state, cityState));
  }
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
 * Its Gold and Faith bank. Its Production is returned for `minorBuild`, which
 * pays it into the pot under the rows of the item it goes toward.
 */
function minorAccrue(state: GameState, cityState: CityState): number {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const y = stats.total;
  cityState.treasury += y.gold;
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
 *  as `urbanDefensesFit` fits a major's cities. */
function minorResearch(state: GameState, cityState: CityState): void {
  const r = cityState.research;
  const tech = cheapestAvailable(TECHS, r.techs);
  if (tech && r.techProgress >= TECHS[tech].cost) {
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
    r.civicProgress -= CIVICS[civic].cost;
    r.civics.push(civic);
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
 * THE EPISODE'S DRAWS, once, at the minor's first build: one slot of each
 * drawn row (`MINOR_BUILD_ROWS[r].from`, the minor's type) in table order,
 * then the army cap. A row without draws keeps 0.
 */
function minorPlan(state: GameState, cityState: CityState): void {
  if (cityState.armyCap !== undefined) return;
  cityState.buildFrom = MINOR_BUILD_ROWS.map((row) =>
    (row.from ? row.from[cityState.type][Math.floor(nextRandom(state) * MINOR_BUILD_SLOTS)] : 0));
  cityState.armyCap = MINOR_ARMY_CAP_SLOTS[Math.floor(nextRandom(state) * MINOR_BUILD_SLOTS)];
}

/** The land military chassis a minor may train: its own research unlocks it,
 *  it asks no strategic resource (a minor holds no stockpile here), it is no
 *  civilization's unique, and MinorCivUnitBuilds does not bar its class. */
function minorTrainable(cityState: CityState): UnitDef[] {
  const r = cityState.research;
  return Object.values(UNITS).filter((d) =>
    unitIsMilitary(d.id) && !d.naval && !d.air && !d.faithOnly && !d.spawnOnly && !d.settler && !d.uniqueTo
    && !d.requiresResource
    && (!d.requiresTech || r.techs.includes(d.requiresTech))
    && (!d.requiresCivic || r.civics.includes(d.requiresCivic))
    && !!UNIT_PROMO_CLASS[d.id] && !MINOR_EXCLUDED_UNIT_CLASSES.includes(UNIT_PROMO_CLASS[d.id]));
}

/** The strongest chassis of `cls` the minor may train, ties by catalog order
 *  — `bestTrainableOfClass`'s rule over the minor's set. */
function minorBestOfClass(trainable: UnitDef[], cls: PromoClass): string | null {
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
  minorPlan(state, cityState);
  let pot = cityState.prodProgress ?? 0;
  const toward = (pct: number) => {
    pot += minorProduction(production, pct);
    cityState.prodProgress = pot;
  };
  const unlocks = computeUnlocksIn(cityState.research, []); // a MINOR carries no roster row
  const units = state.units.filter((u) => u.seat === cityState.seat);
  const military = units.filter((u) => unitIsMilitary(u.type)).length;
  let trainable: UnitDef[] | undefined;
  const lazyTrainable = () => (trainable ??= minorTrainable(cityState));
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
