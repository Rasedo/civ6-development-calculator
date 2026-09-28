/**
 * THE CHECKS: the engine's own rule functions asked about an imported game
 * turn, against what the game itself reports.
 *
 * `stateChecks(t)` reads ONE record: the game's readers of its turn-t state
 * (a plot's yields, a city's yields, housing, amenities, growth threshold,
 * border cost and next plot, loyalty per turn, defence, production costs and
 * purchase prices, a seat's upkeep and tourism) against the engine's function
 * of the same imported state.
 *
 * `transitionChecks(t, t+1)` runs the engine's per-city turn step — growth
 * (`seatGrowth`), border growth (`cityBorderGrowth`), loyalty
 * (`applyLoyalty`) — and the religious spread (`spreadReligiousPressure`) on
 * the imported turn-t state, and compares the result with the game's turn
 * t+1. What happened between the two records is reconstructed from their
 * difference (`diffActions`); a check whose outcome an action could have
 * moved (a purchase, a unit trained from the city, a capture, a missionary)
 * is skipped with the action as its reason, never guessed around; so is a
 * player whose turn start one of the records was read before (its pools
 * stand still across a pair and move twice across the next).
 *
 * Every result names its subject and carries the state it was computed on;
 * `gaps` lists the importer's roster gaps that touch the subject, so the
 * report can separate a clean failure from one an unimported row explains.
 */
import type { City, GameState, Tile } from '../core/types';
import { computeCityStats, tileYieldsForCenter, buildingMaintenance, districtMaintenance, luxuryAmenities, seatTourism } from '../core/city';
import { buildingPillaged, tileYields } from '../core/yields';
import { baseYieldCtx, computeUnlocks, getModifiers, goldPrice, makeYieldCtx, unitUpkeep } from '../core/effects';
import { cityDefenseStrength } from '../core/combat';
import { applyLoyalty, cityBorderGrowth, cultureAfterGrowth, districtSiteCost } from '../core/phase';
import { seatGrowth } from '../core/seatTurn';
import { buildingPurchaseCost, settlerCost, spreadReligiousPressure, tilePurchaseCost, unitPurchaseCost } from '../core/game';
import { buildingCostIn } from '../core/rules';
import { builderCost, traderCost } from '../core/units';
import { monumentalityBuyMult } from '../core/eras';
import { civOf, hiddenResourcesFor, seatOf } from '../core/seats';
import { growthFoodNeeded, amenityTierIndex, AMENITY_TIERS, GOLD_PURCHASE_MULT } from '../data/constants';
import { LOYALTY_MAX, LOYALTY_RANGE } from '../data/seats';
import { RELIGION_PRESSURE_RANGE } from '../data/religion';
import { UNITS } from '../data/units';
import type { DistrictId, YieldKey } from '../../world/types';
import { YIELD_KEYS } from '../../world/types';
import { hexDistance, neighbors } from '../../world/hex';
import { P, bool, num, plotAt, type Catalog, type DumpCity, type TurnRecord } from './record';
import { engineRowOf, importTurn, wrapped, type History, type Imported } from './import';

export interface CheckResult {
  turn: number;
  check: string;
  subject: string;
  ok: boolean;
  game?: unknown;
  ours?: unknown;
  /** why the check did not run: an action in the diff, a wrap, a missing reader */
  skip?: string;
  gaps?: string[];
  state?: Record<string, unknown>;
}

const TOL = 0.02;
/** the checks that read a city's work radius, skipped together at the seam */
const CITY_AREA_CHECKS = ['city.yields', 'city.centreYields', 'city.housing', 'city.amenities', 'city.amenityTier',
  'city.growthThreshold', 'city.foodSurplus', 'city.borderCost', 'city.nextPlot'];
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const strip = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

/** the importer's gaps a city carries: its owner's leader and seat gaps, its
 *  own rows the importer mapped or dropped, its governor, its religion's
 *  beliefs, and every dropped row on its plots */
function cityGaps(imp: Imported, c: DumpCity): string[] {
  const out: string[] = [];
  const seat = imp.seatOfPlayer.get(c.owner) ?? -1;
  const s = seatOf(imp.state, seat);
  if (s && seat >= 0 && seat < imp.state.seats.length && s.civ < 0) out.push('leader');
  for (const g of imp.cityGaps.get(`${c.owner}:${c.id}`) ?? []) out.push(g);
  for (const g of imp.seatGaps.get(seat) ?? []) out.push(g);
  // the religion the city follows: its founder's belief gaps
  const city = imp.cityByKey.get(`${c.owner}:${c.id}`);
  const g = city?.followedReligion;
  if (g !== null && g !== undefined && g !== seat) {
    for (const x of imp.seatGaps.get(g) ?? []) if (x.startsWith('belief:')) out.push(x);
  }
  for (const q of c.plots) for (const x of imp.tileGaps.get(q) ?? []) out.push(`plot ${q} ${x}`);
  return [...new Set(out)];
}

/**
 * What the city's own walk pays for one plot: the city worked by one citizen
 * pinned to the plot, less the city worked by none (the centre alone), in
 * the walk's `tiles` column. Null where the walk will not work the plot.
 * The plots' pins are restored after.
 */
function cityPlotYields(state: GameState, city: City, t: Tile): number[] | null {
  const pins = state.map.tiles.filter((x) => x.ownerSeat === city.seat && x.ownerCity === city.id)
    .map((x) => [x, x.locked] as const);
  for (const [x] of pins) x.locked = undefined;
  t.locked = true;
  const solo = { ...city, population: 1, specialistPref: undefined };
  const one = computeCityStats(state, solo);
  const none = computeCityStats(state, { ...solo, population: 0 });
  for (const [x, l] of pins) x.locked = l;
  if (!one.workedTiles.includes(t.index)) return null;
  return YIELD_KEYS.map((k) => round3(one.breakdown.tiles[k] - none.breakdown.tiles[k]));
}

/** Has the World Congress a resolution in the record's table (a numbered
 *  entry beside its `Stage`)? */
function congressSat(rec: TurnRecord): boolean {
  const c = rec.congress;
  if (Array.isArray(c)) return c.length > 0;
  return !!c && typeof c === 'object' && Object.keys(c).some((k) => /^\d+$/.test(k));
}

/** the checks no plot of the city's feeds: a dropped row on one of its plots,
 *  or a dropped resource of its seat's, is no gap of theirs */
const PLOT_BLIND = new Set(['buy.buildingCost', 'buy.buildingGold', 'buy.unitCost', 'buy.unitGold',
  'buy.districtCost', 'buy.plotGold', 'city.defense', 'city.growthThreshold', 'step.pressure']);

function gapsFor(gaps: string[], check: string): { gaps?: string[] } {
  const g = PLOT_BLIND.has(check) ? gaps.filter((x) => !x.startsWith('plot ') && !x.startsWith('resource:')) : gaps;
  return g.length ? { gaps: g } : {};
}

/** the importer's gaps on a plot and its neighbours (a dropped natural
 *  wonder or resource next door moves a plot's yields) */
function plotGaps(imp: Imported, t: { index: number; col: number; row: number }): string[] {
  const out: string[] = [];
  for (const n of [t, ...neighbors(imp.state.map, imp.state.map.tiles[t.index])]) {
    for (const x of imp.tileGaps.get(n.index) ?? []) out.push(`plot ${n.index} ${x}`);
  }
  return out;
}

/** Does any plot within `radius` of `center` sit nearer across the x seam? */
function reachWraps(imp: Imported, center: number, radius: number): boolean {
  const W = imp.width;
  const t = imp.state.map.tiles[center];
  return t.col < radius || t.col >= W - radius;
}

/** The cities the imported state holds, each with the game city behind it. */
function citiesOfImport(imp: Imported): { city: City; dump: DumpCity; minor: boolean }[] {
  const out: { city: City; dump: DumpCity; minor: boolean }[] = [];
  for (const [city, dump] of imp.dumpOfCity) out.push({ city, dump, minor: false });
  return out;
}

function subjectOf(c: DumpCity): string {
  return `city ${c.owner}:${c.id} ${strip(c.name, 'LOC_CITY_NAME_')}`;
}

export function stateChecks(rec: TurnRecord, cat: Catalog, imp: Imported = importTurn(rec, cat)): CheckResult[] {
  const out: CheckResult[] = [];
  const state = imp.state;
  const turn = rec.turn;

  // every plot's yields: an owned plot on its owner's context, an unowned one
  // on the base context with the resources the LOCAL player cannot see hidden
  // (the game's plot reader answers for its viewer; an observer game has
  // none, and its unowned resource plots are skipped); a district or wonder
  // plot and the seam are left out
  const ctxBySeat = new Map<number, ReturnType<typeof makeYieldCtx>>();
  const localSeat = imp.seatOfPlayer.get(num(rec.head.localPlayer));
  const base = localSeat === undefined ? baseYieldCtx(state)
    : { ...baseYieldCtx(state), hiddenResources: hiddenResourcesFor(state, localSeat) };
  for (const t of state.map.tiles) {
    // a district or wonder plot, the engine's or one only the game has
    const gp = plotAt(rec, t.index);
    if (t.district || t.builtWonder || (gp[P.district] as number) >= 0 || (gp[P.wonder] as number) >= 0) continue;
    const gy = plotAt(rec, t.index)[P.yields] as number[];
    if (!Array.isArray(gy)) continue;
    let ctx = base;
    if (t.ownerSeat < 0 && localSeat === undefined && t.resource) {
      out.push({ turn, check: 'plot.yields', subject: `plot ${t.index}`, ok: true, skip: 'no viewer' });
      continue;
    }
    if (t.ownerSeat >= 0) {
      if (!ctxBySeat.has(t.ownerSeat)) ctxBySeat.set(t.ownerSeat, makeYieldCtx(state, t.ownerSeat));
      ctx = ctxBySeat.get(t.ownerSeat)!;
    }
    const subject = `plot ${t.index} (${t.col},${t.row})`;
    if (t.col === 0 || t.col === imp.width - 1) {
      out.push({ turn, check: 'plot.yields', subject, ok: true, skip: 'wrap' });
      continue;
    }
    let oy = YIELD_KEYS.map((k) => tileYields(ctx, t)[k]);
    let ok = oy.every((v, i) => near(v, gy[i]));
    // a building or wonder of the owning city may pay this plot (the
    // Lighthouse's Food, the Water Mill's): the engine pays those in the
    // city's walk, so the plot is read there, worked alone
    const owner = !ok && t.ownerCity >= 0 ? state.seats[t.ownerSeat]?.cities.find((c) => c.id === t.ownerCity) : undefined;
    const walked = owner ? cityPlotYields(state, owner, t) : null;
    if (walked) {
      oy = walked;
      ok = oy.every((v, i) => near(v, gy[i]));
    }
    const pg = ok ? [] : plotGaps(imp, t);
    out.push({
      turn, check: 'plot.yields', subject, ok, game: gy, ours: oy, ...(pg.length ? { gaps: pg } : {}),
      ...(ok ? {} : { state: { terrain: t.terrain, elevation: t.elevation, feature: t.feature, resource: t.resource,
        improvement: t.improvement, pillaged: t.pillaged, river: t.riverMask, owner: t.ownerSeat } }),
    });
  }

  for (const { city, dump: c } of citiesOfImport(imp)) {
    const subject = subjectOf(c);
    const gaps = cityGaps(imp, c);
    const push = (check: string, ok: boolean, game: unknown, ours: unknown, st?: Record<string, unknown>) =>
      out.push({ turn, check, subject, ok, game, ours, ...gapsFor(gaps, check), ...(ok || !st ? {} : { state: st }) });
    if (reachWraps(imp, city.centerIndex, 3)) {
      for (const check of CITY_AREA_CHECKS) out.push({ turn, check, subject, ok: true, skip: 'wrap' });
    } else {
      const stats = computeCityStats(state, city);
      const gy = c.yields.map(num);
      // the game's city Gold is before its buildings' and districts' upkeep
      const oy = YIELD_KEYS.map((k: YieldKey) => round3(k === 'gold' ? stats.total.gold + stats.maintenance : stats.total[k]));
      const cityState = {
        pop: city.population, worked: stats.workedTiles.length, specialists: stats.specialistTotal,
        gameWorked: c.worked.length - 1, buildings: city.buildings, districts: city.districts.map((d) => d.type),
        breakdown: Object.fromEntries(Object.entries(stats.breakdown).map(([k, y]) => [k, YIELD_KEYS.map((q) => round3(y[q]))])),
        tier: stats.amenities.tier.name,
      };
      push('city.yields', oy.every((v, i) => near(v, gy[i], 0.05)), gy, oy, cityState);
      const centre = plotAt(rec, city.centerIndex)[P.yields] as number[];
      const oc = tileYieldsForCenter(makeYieldCtx(state, city.seat), state.map.tiles[city.centerIndex]);
      const occ = YIELD_KEYS.map((k) => oc[k]);
      push('city.centreYields', occ.every((v, i) => near(v, centre[i])), centre, occ);
      push('city.housing', near(stats.housing, num(c.housing)), num(c.housing), stats.housing,
        { parts: c.housingParts, pop: city.population });
      push('city.amenities', stats.amenities.have === num(c.amenities) && stats.amenities.needed === num(c.amenitiesNeeded),
        [num(c.amenities), num(c.amenitiesNeeded)], [stats.amenities.have, stats.amenities.needed], { parts: c.amenityParts });
      const tierGame = 6 - num(c.happiness);
      push('city.amenityTier', amenityTierIndex(stats.amenities.tier.name) === tierGame,
        AMENITY_TIERS[tierGame]?.name, stats.amenities.tier.name);
      push('city.growthThreshold', near(growthFoodNeeded(city.population), num(c.growthThreshold)),
        num(c.growthThreshold), growthFoodNeeded(city.population), { pop: city.population });
      push('city.foodSurplus', near(stats.foodSurplus, num(c.foodSurplus), 0.05), num(c.foodSurplus),
        round3(stats.foodSurplus), { effective: round3(stats.effectiveFoodSurplus) });
      if (imp.tilesUnknown.has(city.centerIndex)) {
        out.push({ turn, check: 'city.borderCost', subject, ok: true, skip: 'expansions before the record' });
      } else {
        push('city.borderCost', near(stats.border.cost, num(c.nextPlotCost)), num(c.nextPlotCost), stats.border.cost,
          { tilesAcquired: city.tilesAcquired, plots: c.plots.length });
      }
      push('city.nextPlot', stats.border.nextTile === num(c.nextPlot), num(c.nextPlot), stats.border.nextTile);
    }
    // loyalty: every city within the loyalty range presses, so the seam is
    // any city pair nearer across it
    const gameLpt = num(c.loyaltyPerTurn);
    const wrapsL = rec.cities.some((o) => o !== c && wrapped(imp.width, city.centerIndex, o.y * imp.width + o.x)
      && hexDistanceWrapped(imp.width, city.centerIndex, o.y * imp.width + o.x) <= LOYALTY_RANGE);
    if (wrapsL) out.push({ turn, check: 'city.loyaltyPerTurn', subject, ok: true, skip: 'wrap' });
    else if (bool(c.capital)) out.push({ turn, check: 'city.loyaltyPerTurn', subject, ok: true, skip: 'capital' });
    else {
      // the whole per-turn change the turn step applies (the governor's term
      // and the seat's terms beside the city's own), read off a city held at
      // mid loyalty so no bound clips it
      const stats = computeCityStats(state, city);
      const was = city.loyalty;
      city.loyalty = LOYALTY_MAX / 2;
      applyLoyalty(state, city, stats.amenities.tier.name, num(c.governor) >= 0);
      const ours = city.loyalty - LOYALTY_MAX / 2;
      city.loyalty = was;
      push('city.loyaltyPerTurn', near(ours, gameLpt, 0.05), gameLpt, round3(ours),
        { breakdown: c.loyaltyBreakdown, tier: stats.amenities.tier.name });
    }
    push('city.defense', cityDefenseStrength(state, city) === num((c.districts[0] ?? [])[5] as number),
      num((c.districts[0] ?? [])[5] as number), cityDefenseStrength(state, city),
      { buildings: city.buildings, districts: city.districts.map((d) => d.type) });

    // production costs and purchase prices; a World Congress in session
    // may price them (its resolutions are in the record, not imported)
    const buyGaps = congressSat(rec) ? [...gaps, 'congress:not imported'] : gaps;
    const buyPush = (check: string, ok: boolean, game: unknown, ours: unknown, st?: Record<string, unknown>) =>
      out.push({ turn, check, subject, ok, game, ours, ...gapsFor(buyGaps, check), ...(ok || !st ? {} : { state: st }) });
    const unlocks = computeUnlocks(state, city.seat);
    const s = seatOf(state, city.seat)!;
    for (const [kind, idx, cost, gold] of c.buy) {
      if (kind === 'B') {
        if (cat.wonders.includes(cat.buildings[idx])) continue;
        const id = engineRowOf(cat, 'building', idx);
        if (!id) continue;
        // a pillaged building's row: the game's cost reader answers the full
        // price (runs/h1_duelw1104, Xian's Library t41-53: 45, gold 180), not
        // the repair the engine prices, so neither check has a reading
        if (buildingPillaged(city, id)) {
          for (const check of ['buy.buildingCost', 'buy.buildingGold']) {
            out.push({ turn, check, subject, ok: true, skip: 'pillaged: the reader answers the full price' });
          }
          continue;
        }
        buyPush(`buy.buildingCost`, near(buildingCostIn(state, city, id), num(cost), 0.5), num(cost), buildingCostIn(state, city, id), { building: id });
        const price = goldPrice(state, city.seat, buildingPurchaseCost(state, city.seat, id));
        buyPush(`buy.buildingGold`, price === num(gold), num(gold), price, { building: id });
      } else if (kind === 'U') {
        const id = engineRowOf(cat, 'unit', idx);
        if (!id) continue;
        const prod = id === 'SETTLER' ? settlerCost(state, city.seat) : id === 'BUILDER' ? builderCost(state, city.seat)
          : id === 'TRADER' ? traderCost(state, city.seat) : UNITS[id].cost;
        buyPush(`buy.unitCost`, near(prod, num(cost), 0.5), num(cost), prod, { unit: id });
        const price = id === 'SETTLER'
          ? goldPrice(state, city.seat, settlerCost(state, city.seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, city.seat))
          : goldPrice(state, city.seat, unitPurchaseCost(state, id, city.seat, city));
        buyPush(`buy.unitGold`, price === num(gold), num(gold), price, { unit: id });
      } else if (kind === 'D') {
        const id = engineRowOf(cat, 'district', idx) as DistrictId | null;
        if (!id) continue;
        const dc = districtSiteCost(state, s, id, unlocks);
        buyPush(`buy.districtCost`, near(dc, num(cost), 0.5), num(cost), dc, { district: id });
      }
    }
    for (const [plot, price] of c.plotBuy) {
      const ours = tilePurchaseCost(state, city, plot);
      buyPush('buy.plotGold', ours === price, price, ours, { plot, distance: hexDistanceWrapped(imp.width, city.centerIndex, plot) });
    }
  }

  // each major's upkeep: buildings, districts, units
  for (let seat = 0; seat < state.seats.length; seat++) {
    const pid = imp.playerOfSeat.get(seat)!;
    const p = rec.players.find((q) => q.id === pid)!;
    const civ = civOf(state, seat);
    let b = 0;
    let d = 0;
    for (const city of state.seats[seat].cities) {
      for (const id of city.buildings) b += buildingMaintenance(id, civ);
      for (const x of city.districts) if (state.map.tiles[x.tileIndex].districtComplete) d += districtMaintenance(x.type);
    }
    const mods = getModifiers(state, seat);
    const u = state.units.filter((x) => x.seat === seat).reduce((n, x) => n + unitUpkeep(mods, x.type), 0);
    const subject = `seat ${pid} ${String(p.civ)}`;
    const sg = [...(state.seats[seat].civ < 0 ? ['leader'] : []), ...(imp.seatGaps.get(seat) ?? [])];
    for (const [key, c] of imp.cityByKey) if (c.seat === seat) for (const g of imp.cityGaps.get(key) ?? []) sg.push(g);
    const gaps = sg.length ? { gaps: [...new Set(sg)] } : {};
    out.push({ turn, check: 'seat.maintBuildings', subject, ok: b === num(p.maintBuildings), game: num(p.maintBuildings), ours: b, ...gaps });
    out.push({ turn, check: 'seat.maintDistricts', subject, ok: d === num(p.maintDistricts), game: num(p.maintDistricts), ours: d, ...gaps });
    out.push({ turn, check: 'seat.maintUnits', subject, ok: u === num(p.maintUnits), game: num(p.maintUnits), ours: u, ...gaps,
      state: { units: state.units.filter((x) => x.seat === seat).map((x) => x.type) } });
    const tour = seatTourism(state, seat);
    out.push({ turn, check: 'seat.tourism', subject, ok: near(tour, num(p.tourism), 0.5), game: num(p.tourism), ours: round3(tour), ...gaps });
  }
  return out;
}

function hexDistanceWrapped(width: number, a: number, b: number): number {
  const ca = a % width, ra = Math.floor(a / width);
  const cb = b % width, rb = Math.floor(b / width);
  return Math.min(hexDistance(ca, ra, cb, rb), hexDistance(ca + width, ra, cb, rb), hexDistance(ca, ra, cb + width, rb));
}

/** What changed between two consecutive records, per city and per seat. */
export interface Actions {
  /** cities by `${owner}:${id}` whose owner, or existence, changed */
  cityChanged: Set<string>;
  /** units that appeared, by owner, with their plot */
  unitsNew: { owner: number; type: number; plot: number }[];
  /** religious units that spent a spread charge, with their t+1 plot */
  spreads: { owner: number; religion: number; plot: number }[];
  /** plots a city holds at t+1 and did not at t */
  plotsGained: Map<string, number[]>;
  /** buildings or districts a city holds at t+1 and did not at t */
  built: Map<string, number>;
  /** seats whose gold fell below what their income would leave */
  goldSpent: Map<number, number>;
  /** cities whose governor changed */
  governorChanged: Set<string>;
  /** players whose turn start had not run when the later record was read */
  notStarted: Set<number>;
}

export function diffActions(a: TurnRecord, b: TurnRecord): Actions {
  const key = (c: DumpCity) => `${c.owner}:${c.id}`;
  const before = new Map(a.cities.map((c) => [key(c), c]));
  const after = new Map(b.cities.map((c) => [key(c), c]));
  const cityChanged = new Set<string>();
  for (const k of before.keys()) if (!after.has(k)) cityChanged.add(k);
  for (const k of after.keys()) if (!before.has(k)) cityChanged.add(k);
  const unitsBefore = new Map(a.units.map((u) => [`${u.owner}:${u.id}`, u]));
  const unitsNew: Actions['unitsNew'] = [];
  const spreads: Actions['spreads'] = [];
  for (const u of b.units) {
    const was = unitsBefore.get(`${u.owner}:${u.id}`);
    if (!was) unitsNew.push({ owner: u.owner, type: u.type, plot: u.y * b.head.W + u.x });
    else if (num(was.spreadCharges) > num(u.spreadCharges)) {
      spreads.push({ owner: u.owner, religion: num(u.religion), plot: u.y * b.head.W + u.x });
    }
  }
  // a religious unit that spent its last charge is gone at t+1
  const unitsAfter = new Set(b.units.map((u) => `${u.owner}:${u.id}`));
  for (const u of a.units) {
    if (!unitsAfter.has(`${u.owner}:${u.id}`) && num(u.spreadCharges) > 0) {
      spreads.push({ owner: u.owner, religion: num(u.religion), plot: u.y * a.head.W + u.x });
    }
  }
  const plotsGained = new Map<string, number[]>();
  const built = new Map<string, number>();
  const governorChanged = new Set<string>();
  for (const [k, c1] of after) {
    const c0 = before.get(k);
    if (!c0) continue;
    const had = new Set(c0.plots);
    const gained = c1.plots.filter((q) => !had.has(q));
    if (gained.length) plotsGained.set(k, gained);
    const nb = c1.buildings.length - c0.buildings.length + c1.districts.length - c0.districts.length;
    if (nb !== 0) built.set(k, nb);
    if (num(c0.governor) !== num(c1.governor)) governorChanged.add(k);
  }
  const goldSpent = new Map<number, number>();
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0) continue;
    const expected = num(p0.gold) + num(p0.goldYield);
    if (num(p1.gold) < expected - 0.5) goldSpent.set(p1.id, expected - num(p1.gold));
  }
  return { cityChanged, unitsNew, spreads, plotsGained, built, goldSpent, governorChanged, notStarted: notStarted(a, b) };
}

/**
 * The players whose turn start had not run when `b` was read: every city of
 * theirs that `a` saw with food and culture coming in shows both boxes
 * exactly where `a` left them. The next record then carries two turn starts
 * at once, so neither pair is a one-turn step for that player.
 */
function notStarted(a: TurnRecord, b: TurnRecord): Set<number> {
  const before = new Map(a.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const moving = new Map<number, boolean>();
  for (const c1 of b.cities) {
    const c0 = before.get(`${c1.owner}:${c1.id}`);
    if (!c0 || c0.pop !== c1.pop || !(num(c0.foodSurplus) > 0) || !(num(c0.cultureYield) > 0)) continue;
    const still = num(c1.food) === num(c0.food) && num(c1.culture) === num(c0.culture);
    moving.set(c1.owner, (moving.get(c1.owner) ?? false) || !still);
  }
  return new Set([...moving].filter(([, m]) => !m).map(([o]) => o));
}

/**
 * The players whose every city with culture coming in holds its border box
 * exactly across the pair while its food moves: the game banked no border
 * culture for the whole seat that turn (runs/h1_duelw1103, the autoplayed
 * seat 0, every city t82-101), a state the record carries no reader for.
 */
function bordersHeld(a: TurnRecord, b: TurnRecord): Set<number> {
  const before = new Map(a.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const moving = new Map<number, boolean>();
  for (const c1 of b.cities) {
    const c0 = before.get(`${c1.owner}:${c1.id}`);
    if (!c0 || !(num(c0.cultureYield) > 0) || c0.plots.length !== c1.plots.length) continue;
    moving.set(c1.owner, (moving.get(c1.owner) ?? false) || num(c1.culture) !== num(c0.culture));
  }
  return new Set([...moving].filter(([, m]) => !m).map(([o]) => o));
}

export function transitionChecks(a: TurnRecord, b: TurnRecord, cat: Catalog, history?: History,
  prev?: TurnRecord): CheckResult[] {
  const out: CheckResult[] = [];
  const turn = a.turn;
  const acts = diffActions(a, b);
  const late = new Set([...acts.notStarted, ...(prev ? notStarted(prev, a) : [])]);
  const held = bordersHeld(a, b);
  const imp = importTurn(a, cat, history);
  const state = imp.state;
  const after = new Map(b.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const settlerIdx = cat.units.indexOf('UNIT_SETTLER');

  // the religious spread first, on the untouched turn-t state: every seat's
  // sources, as the engine's turn runs them
  const pressBefore = new Map<City, number[]>();
  for (const { city } of citiesOfImport(imp)) pressBefore.set(city, [...(city.religionPressure ?? [])]);
  const spreadState: GameState = importTurn(a, cat, history).state;
  for (const s of spreadState.seats) spreadReligiousPressure(spreadState, s.seat);
  const spreadCities = new Map<string, City>();
  for (const s of spreadState.seats) for (const c of s.cities) spreadCities.set(`${s.seat}:${c.id}`, c);

  // the per-city turn step, city by city in the game's order, stats first
  const perSeat = new Map<number, { city: City; dump: DumpCity }[]>();
  for (const { city, dump } of citiesOfImport(imp)) {
    const list = perSeat.get(city.seat) ?? [];
    list.push({ city, dump });
    perSeat.set(city.seat, list);
  }
  for (const [seat, list] of perSeat) {
    const lux = luxuryAmenities(state, seat);
    const mods = getModifiers(state, seat);
    const stats = new Map(list.map(({ city }) => [city, computeCityStats(state, city, lux, mods)]));
    for (const { city, dump: c } of list) {
      const k = `${c.owner}:${c.id}`;
      const next = after.get(k);
      const subject = subjectOf(c);
      const gaps = cityGaps(imp, c);
      const skipAll = acts.cityChanged.has(k) || !next ? 'city changed hands or vanished'
        : late.has(c.owner) ? 'a turn start missing from a record' : null;
      const st = stats.get(city)!;
      const wraps = reachWraps(imp, city.centerIndex, 3);
      const res = (check: string, ok: boolean, game: unknown, ours: unknown, s?: Record<string, unknown>) =>
        out.push({ turn, check, subject, ok, game, ours, ...gapsFor(gaps, check), ...(ok || !s ? {} : { state: s }) });

      // growth
      const before = { pop: city.population, food: city.foodBox };
      const settlerOut = acts.unitsNew.some((u) => u.owner === c.owner && u.type === settlerIdx
        && hexDistanceWrapped(imp.width, u.plot, city.centerIndex) <= 1);
      const growSkip = skipAll ?? (wraps ? 'wrap' : settlerOut ? 'a Settler left the city' : null);
      seatGrowth(city, st.effectiveFoodSurplus, st.growthNeeded, state.turn);
      if (growSkip || !next) out.push({ turn, check: 'step.growth', subject, ok: true, skip: growSkip ?? 'no t+1' });
      else {
        res('step.growth', city.population === next.pop && near(city.foodBox, num(next.food), 0.05),
          [next.pop, num(next.food)], [city.population, round3(city.foodBox)],
          { before, surplus: round3(st.foodSurplus), effective: round3(st.effectiveFoodSurplus), needed: st.growthNeeded,
            housing: st.housing, tier: st.amenities.tier.name });
      }
      // border growth
      const plotsBefore = new Set(state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id).map((t) => t.index));
      const boxBefore = city.cultureBox;
      const culture = cultureAfterGrowth(state, city, before.pop, st);
      cityBorderGrowth(state, city, seat, culture);
      const gainedOurs = state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id && !plotsBefore.has(t.index)).map((t) => t.index);
      const gainedGame = acts.plotsGained.get(k) ?? [];
      const bought = (acts.goldSpent.get(c.owner) ?? 0) > 0 && gainedGame.some((q) => !gainedOurs.includes(q));
      const borderSkip = skipAll ?? (wraps ? 'wrap' : bought ? 'a plot may have been bought'
        : imp.tilesUnknown.has(city.centerIndex) ? 'expansions before the record'
        : held.has(c.owner) ? 'the seat banked no border culture' : null);
      if (borderSkip || !next) out.push({ turn, check: 'step.border', subject, ok: true, skip: borderSkip ?? 'no t+1' });
      else {
        const same = gainedOurs.length === gainedGame.length && gainedOurs.every((q) => gainedGame.includes(q));
        res('step.border', same && near(city.cultureBox, num(next.culture), 0.05),
          { culture: num(next.culture), gained: gainedGame }, { culture: round3(city.cultureBox), gained: gainedOurs },
          { boxBefore: round3(boxBefore), culture: round3(culture), cost: st.border.cost });
      }
      // loyalty
      const loyBefore = city.loyalty;
      const hasGov = num(c.governor) >= 0;
      applyLoyalty(state, city, st.amenities.tier.name, hasGov);
      const wrapsL = a.cities.some((o) => o !== c && wrapped(imp.width, city.centerIndex, o.y * imp.width + o.x)
        && hexDistanceWrapped(imp.width, city.centerIndex, o.y * imp.width + o.x) <= LOYALTY_RANGE);
      const loySkip = skipAll ?? (wrapsL ? 'wrap' : acts.governorChanged.has(k) ? 'governor changed' : null);
      if (loySkip || !next) out.push({ turn, check: 'step.loyalty', subject, ok: true, skip: loySkip ?? 'no t+1' });
      else {
        res('step.loyalty', near(city.loyalty ?? 100, num(next.loyalty), 0.05), num(next.loyalty), round3(city.loyalty ?? 100),
          { before: loyBefore, gamePerTurn: num(c.loyaltyPerTurn), governor: hasGov });
      }
      // religious pressure
      const sc = spreadCities.get(`${seat}:${city.id}`);
      const spreadNear = acts.spreads.some((s) => hexDistanceWrapped(imp.width, s.plot, city.centerIndex) <= 3);
      const wrapsR = a.cities.some((o) => o !== c && wrapped(imp.width, city.centerIndex, o.y * imp.width + o.x)
        && hexDistanceWrapped(imp.width, city.centerIndex, o.y * imp.width + o.x) <= RELIGION_PRESSURE_RANGE);
      const relSkip = skipAll ?? (spreadNear ? 'a religious unit spread nearby' : wrapsR ? 'wrap' : null);
      if (!sc || relSkip || !next || !Array.isArray(next.religions) || !Array.isArray(c.religions)) {
        out.push({ turn, check: 'step.pressure', subject, ok: true, skip: relSkip ?? 'no reader' });
      } else {
        const pb = pressBefore.get(city) ?? [];
        const oursD: Record<number, number> = {};
        const gameD: Record<number, number> = {};
        for (const [relType, g] of imp.religionSeat) {
          const g0 = (c.religions.find((r) => r.Religion === relType)?.Pressure) ?? 0;
          const g1 = (next.religions.find((r) => r.Religion === relType)?.Pressure) ?? 0;
          gameD[relType] = round3(g1 - g0);
          oursD[relType] = round3((sc.religionPressure?.[g] ?? 0) - (pb[g] ?? 0));
        }
        const keys = Object.keys(gameD).map(Number);
        if (keys.length === 0) out.push({ turn, check: 'step.pressure', subject, ok: true, skip: 'no religion' });
        else res('step.pressure', keys.every((r) => near(gameD[r], oursD[r], 0.05)), gameD, oursD,
          { followersBefore: c.religions, majority: num(c.majorityReligion) });
      }
    }
  }

  // the game's own bookkeeping across the pair, which says where in its turn
  // the dump sits: a pool at t+1 is its turn-t value plus its turn-t rate
  for (const c of a.cities) {
    const k = `${c.owner}:${c.id}`;
    const next = after.get(k);
    if (!next || acts.cityChanged.has(k) || next.pop !== c.pop || late.has(c.owner)) continue;
    const ok = near(num(next.food), num(c.food) + num(c.foodSurplus) * num(c.overallGrowthMod), 0.1);
    out.push({ turn, check: 'calib.foodBox', subject: subjectOf(c), ok,
      game: num(next.food), ours: round3(num(c.food) + num(c.foodSurplus) * num(c.overallGrowthMod)),
      ...(ok ? {} : { state: { food: num(c.food), surplus: num(c.foodSurplus), mod: num(c.overallGrowthMod) } }) });
  }
  return out;
}
