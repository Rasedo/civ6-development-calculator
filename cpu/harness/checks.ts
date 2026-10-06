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
 * stand still across a pair and move twice across the next). The era checks
 * (`eraChecks`) pay the pair's era-score events through the engine's own
 * moment functions, and run its countdown and `enterEra` where an era begins.
 *
 * Every result names its subject and carries the state it was computed on;
 * `gaps` lists the importer's roster gaps that touch the subject, so the
 * report can separate a clean failure from one an unimported row explains.
 */
import type { City, CityState, GameState, Tile, Unit } from '../core/types';
import { congressBorderFrozen } from '../core/congress';
import { spreadFromUnit } from '../core/unitOrders';
import { borderBestPlots, cityCentreYields, cityPlotBonus, cityTourism, cityYieldCtx, computeCityStats, buildingMaintenance, districtMaintenance, luxuryAmenities, seatTourism, seatTourismReligious } from '../core/city';
import { buildingPillaged, tileYields } from '../core/yields';
import { baseYieldCtx, computeUnlocks, getModifiers, goldPrice, makeYieldCtx, unitUpkeep } from '../core/effects';
import { centreStrength, cityDefenseStrength } from '../core/combat';
import { minorCity } from '../core/cityStates';
import { applyLoyalty, cityBorderGrowth, cultureAfterGrowth, districtSiteCost, loyaltyPerTurn } from '../core/phase';
import { seatGrowth } from '../core/seatTurn';
import { buildingFaithPrice, unitFaithPrice, buildingPurchaseCost, settlerCost, pressureFromCity, spreadReligiousPressure, tilePurchaseCost, unitProdCostMult, unitGoldPrice, unitStepCost, unitsAcquired, wallsGoldBlocked } from '../core/game';
import { buildingCostIn, buildingFullCost } from '../core/rules';
import { builderCost, traderCost } from '../core/units';
import { minorRouteOriginYields, routeDestYields, routeOriginYields, routeYieldCut } from '../core/trade';
import { monumentalityBuyMult } from '../core/eras';
import { FREE_SEAT, hiddenResourcesFor, isCityStateSeat, seatOf, setTileOwner } from '../core/seats';
import { governedCityIds, governorFlag } from '../core/governors';
import { chopGrant, harvestGrant, type LumpGrant } from '../core/economy';
import { growthFoodNeeded, amenityTierIndex, AMENITY_TIERS, BORDER_MAX_RADIUS, GOLD_PURCHASE_MULT } from '../data/constants';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { gainPopulationPressure } from '../data/religion';
import type { DistrictId, YieldKey } from '../../world/types';
import { YIELD_KEYS } from '../../world/types';
import { hexDistance, neighbors, tilesWithin } from '../../world/hex';
import { P, bool, num, plotAt, type Catalog, type DumpCity, type DumpPlayer, type Read, type TurnRecord } from './record';
import { Civ6Random, drawsBetween } from './civ6Random';
import {
  AGE_DARK, AGE_GOLDEN_ONLY, AGE_HEROIC, AGE_NORMAL, ageOf, congressOfRecord, engineRowOf, eraBegan, importTurn, majorEras, notStarted, citiesNotStarted, routeChanges,
  type History, type Imported,
} from './import';
import {
  ERA_BEGINS, buildingDedications, campMoment, diploVictoryMoment, enterEra, eraCountdownStep, foundingKeys,
  dedicationEvent, foundingMoments, goodyMoment, greatPersonMoment, pantheonMoment, religionMoment, transferMoments,
  wonderMoment,
} from '../core/eras';
import { LARGEST_KEY, districtMoment, momentKeyId, momentKeysHeld, recordMoment, researchKeys } from '../core/moments';
import { citiesOf, isCiv } from '../core/seats';
import { AGE_GOLDEN, DED_FREE_INQUIRY, DED_MONUMENTALITY, DED_PEN_BRUSH_AND_VOICE } from '../data/seats';
import { SRC_REGISTRY } from '../data/provenance';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../data/builtWonders';
import { engineId } from './aliases';
import { GOVERNMENTS, POLICIES } from '../data/policies';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';

export interface CheckResult {
  turn: number;
  check: string;
  subject: string;
  ok: boolean;
  game?: unknown;
  ours?: unknown;
  /** why the check did not run: an action in the diff, a missing reader */
  skip?: string;
  gaps?: string[];
  state?: Record<string, unknown>;
}

const TOL = 0.02;
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
  // an unseen event draw moves only the plot's own yields: a gap of the city
  // that works it
  const worked = new Set(c.worked);
  for (const q of c.plots) {
    for (const x of imp.tileGaps.get(q) ?? []) if (worked.has(q) || !x.startsWith('event-draw:')) out.push(`plot ${q} ${x}`);
  }
  return [...new Set(out)];
}

/** the checks a worked plot's yields feed — its Food the loyalty a starving
 *  city loses too: an unseen event draw on it is their gap alone */
const EVENT_DRAW_READERS = new Set(['city.yields', 'city.centreYields', 'city.foodSurplus', 'step.growth', 'city.loyaltyPerTurn', 'step.loyalty']);

/** the checks no plot of the city's feeds: a dropped row on one of its plots,
 *  or a dropped resource of its seat's, is no gap of theirs */
const PLOT_BLIND = new Set(['buy.buildingCost', 'buy.buildingGold', 'buy.buildingFaith', 'buy.unitCost', 'buy.unitGold', 'buy.unitFaith',
  'buy.districtCost', 'buy.plotGold', 'city.defense', 'city.growthThreshold', 'step.pressure']);

/** the checks an unrecorded National Park moves: its amenities and the tier
 *  and loyalty they set, its tourism */
const PARK_READERS = new Set(['city.amenities', 'city.amenityTier', 'city.loyaltyPerTurn', 'city.tourism', 'seat.tourism']);

/** the checks a seat's luxury holdings move: the copies it holds pay its
 *  cities' amenities, whose tier moves their yields, growth and loyalty */
const LUXURY_READERS = new Set(['city.amenities', 'city.amenityTier', 'city.loyaltyPerTurn', 'city.yields',
  'city.foodSurplus', 'step.growth', 'step.border', 'step.loyalty']);

function gapsFor(gaps: string[], check: string): { gaps?: string[] } {
  let g = PLOT_BLIND.has(check) ? gaps.filter((x) => !x.startsWith('plot ') && !x.startsWith('resource:')) : gaps;
  if (!PARK_READERS.has(check)) g = g.filter((x) => !x.startsWith('national-park:'));
  if (!LUXURY_READERS.has(check)) g = g.filter((x) => !x.startsWith('luxury-') && !x.startsWith('luxuries:'));
  if (!EVENT_DRAW_READERS.has(check)) g = g.filter((x) => !/^plot \d+ event-draw:/.test(x));
  // an unknown spent person's building row moves its yield's readers only
  g = g.filter((x) => !x.startsWith('gp-unknown:') || check === 'city.yields'
    || (check === 'step.border' && x.endsWith(' culture')));
  return g.length ? { gaps: g } : {};
}

/** the importer's gaps on a plot and its neighbours (a dropped natural
 *  wonder or resource next door moves a plot's yields) */
function plotGaps(imp: Imported, t: { index: number; col: number; row: number }): string[] {
  const out: string[] = [];
  for (const n of [t, ...neighbors(imp.state.map, imp.state.map.tiles[t.index])]) {
    for (const x of imp.tileGaps.get(n.index) ?? []) {
      if (n.index === t.index || !x.startsWith('event-draw:')) out.push(`plot ${n.index} ${x}`);
    }
  }
  return out;
}

/** The cities the imported state holds, each with the game city behind it. */
function citiesOfImport(imp: Imported): { city: City; dump: DumpCity; minor: boolean }[] {
  const out: { city: City; dump: DumpCity; minor: boolean }[] = [];
  for (const [city, dump] of imp.dumpOfCity) out.push({ city, dump, minor: false });
  return out;
}

/**
 * THE START'S BORDER PICKS, replayed from the witnesses' generator states
 * (`tools/civ6lab/dll_readings.md` "H-1: the start of a player's turn"):
 * between a player's PlayerTurnStarted (`pre`) and PlayerTurnStartComplete
 * (`post`) the game draws once per city whose next-plot tie list is not
 * empty, in the player's city order ("GetNextBuyablePlot picker",
 * `drawBorderPlot`). Where the draws between the two seeds are exactly those
 * picks, each city's pick is the generator's draw over its ties
 * (`borderBestPlots` on the record's state), held as the record's next plot.
 * Each player's start is the latest the record witnessed: the record's own
 * turn for the seat it was taken on, the turn before for the players after
 * it. By the city's `owner:id`: the pick and the record's plot, or why the
 * start was not replayed.
 */
function startBorderPicks(rec: TurnRecord, state: GameState, imp: Imported): Map<string, { pick: number; game: number; ties: number[] } | string> {
  const out = new Map<string, { pick: number; game: number; ties: number[] } | string>();
  const byKey = new Map<string, City>();
  const dumpOf = new Map<string, DumpCity>();
  for (const [city, c] of imp.dumpOfCity) {
    byKey.set(`${c.owner}:${c.id}`, city);
    dumpOf.set(`${c.owner}:${c.id}`, c);
  }
  const latest = new Map<number, number>();
  for (const w of rec.witness ?? []) latest.set(w.player, Math.max(latest.get(w.player) ?? -1, w.turn));
  const wit = (rec.witness ?? []).filter((w) => w.turn === latest.get(w.player));
  for (const post of wit.filter((w) => w.point === 'post')) {
    const pre = wit.find((w) => w.point === 'pre' && w.player === post.player);
    const a = typeof pre?.seed === 'number' ? pre.seed : undefined;
    const b = typeof post.seed === 'number' ? post.seed : undefined;
    const keys = post.cities.map((c) => `${post.player}:${num(c.id)}`);
    const why = (reason: string) => { for (const k of keys) out.set(k, reason); };
    if (a === undefined || b === undefined) { why('no witness seed'); continue; }
    const cities = keys.map((k) => byKey.get(k));
    if (cities.some((c) => !c)) { why('a city the import does not hold'); continue; }
    const ties = cities.map((c) => (congressBorderFrozen(state, c!.seat) ? [] : borderBestPlots(state, c!)));
    const picks = ties.filter((t) => t.length > 0).length;
    if (drawsBetween(a, b, 4096) !== picks) { why('the start drew besides the picks'); continue; }
    const rng = new Civ6Random(a);
    post.cities.forEach((_c, i) => {
      if (!ties[i].length) { out.set(keys[i], 'no plot in reach'); return; }
      const pick = ties[i][rng.get(ties[i].length, 'GetNextBuyablePlot picker')];
      out.set(keys[i], { pick, game: num(dumpOf.get(keys[i])!.nextPlot), ties: ties[i] });
    });
  }
  return out;
}

function subjectOf(c: DumpCity): string {
  return `city ${c.owner}:${c.id} ${strip(c.name, 'LOC_CITY_NAME_')}`;
}

export function stateChecks(rec: TurnRecord, cat: Catalog, imp: Imported = importTurn(rec, cat)): CheckResult[] {
  const out: CheckResult[] = [];
  const state = imp.state;
  const startPicks = startBorderPicks(rec, state, imp);
  const turn = rec.turn;
  // every reader takes the congress the game holds now, but a city's
  // amenities stand as its seat's last turn left them (`congressOf`)
  const congressNow = state.congress;

  // every plot's yields: an owned plot on its owner's context, an unowned one
  // on the base context with the resources the LOCAL player cannot see hidden
  // (the game's plot reader answers for its viewer); a local player out of
  // the game sees every resource (runs/h1_duelw1110: its viewer eliminated at
  // t209, 3,217 of the 3,218 unowned resource plot-turns after it read with
  // nothing hidden, none with every tech-revealed resource hidden); a district
  // or wonder plot and the seam are left out
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
    if (t.ownerSeat >= 0) {
      if (!ctxBySeat.has(t.ownerSeat)) ctxBySeat.set(t.ownerSeat, makeYieldCtx(state, t.ownerSeat));
      ctx = ctxBySeat.get(t.ownerSeat)!;
    }
    const subject = `plot ${t.index} (${t.col},${t.row})`;
    // a plot of a city reads on the city's own context, with what the city's
    // buildings and wonders pay it (the Lighthouse's Food, the Water Mill's);
    // a city-state's ground is its one city's
    const minor = isCityStateSeat(t.ownerSeat) ? seatOf(state, t.ownerSeat) as CityState | undefined : undefined;
    const owner = minor ? minorCity(minor)
      : t.ownerCity >= 0 ? state.seats[t.ownerSeat]?.cities.find((c) => c.id === t.ownerCity) : undefined;
    let y = tileYields(ctx, t);
    if (owner) {
      y = tileYields(cityYieldCtx(state, owner), t);
      cityPlotBonus(state, owner)(t, false, y);
    }
    const oy = YIELD_KEYS.map((k) => round3(y[k]));
    // a column the importer read back from this very record is no test
    const back = imp.readBack.get(t.index);
    const ok = oy.every((v, i) => back?.has(i) || near(v, gy[i]));
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
    // the city's yields and boxes stand as its seat's last turn left them,
    // the congress then standing with them (1112 China t182: the session
    // shown that turn reaches its cities' amenity tier at t183)
    state.congress = imp.congressOf(city.seat);
    const stats = computeCityStats(state, city);
    state.congress = congressNow;
    const gy = c.yields.map(num);
    // the game's city Gold is before its buildings' and districts' upkeep
    const oy = YIELD_KEYS.map((k: YieldKey) => round3(k === 'gold' ? stats.total.gold + stats.maintenance : stats.total[k]));
    const cityState = {
      pop: city.population, worked: stats.workedTiles.length, specialists: stats.specialistTotal,
      gameWorked: c.worked.length - 1, buildings: city.buildings, districts: city.districts.map((d) => d.type),
      breakdown: Object.fromEntries(Object.entries(stats.breakdown).map(([k, y]) => [k, YIELD_KEYS.map((q) => round3(y[q]))])),
      tier: stats.amenities.tier.name,
    };
    // a district project's first conversion took a bank no record holds
    const unread = imp.projectYieldUnread.get(`${c.owner}:${c.id}`) ?? -1;
    const yieldsOk = oy.every((v, i) => i === unread || near(v, gy[i], 0.05));
    // an unknown spent person's row is the gap only where the game pays more
    // of the row's yield than the engine
    const yieldGaps = gaps.filter((x) => !x.startsWith('gp-unknown:')
      || YIELD_KEYS.some((k, i) => x.endsWith(` ${k}`) && gy[i] > oy[i] + 0.05));
    out.push({ turn, check: 'city.yields', subject, ok: yieldsOk, game: gy, ours: oy, ...gapsFor(yieldGaps, 'city.yields'),
      ...(yieldsOk ? {} : { state: cityState }) });
    const centre = plotAt(rec, city.centerIndex)[P.yields] as number[];
    const oc = cityCentreYields(state, city);
    const occ = YIELD_KEYS.map((k) => oc[k]);
    const back = imp.readBack.get(city.centerIndex);
    push('city.centreYields', occ.every((v, i) => back?.has(i) || near(v, centre[i])), centre, occ);
    if (c.tourism !== undefined) {
      const tour = cityTourism(state, city);
      push('city.tourism', near(tour, num(c.tourism), 0.5), num(c.tourism), round3(tour),
        { buildings: city.buildings, wonders: city.wonders.map((w) => w.id), works: (city.greatWorks ?? []).length });
    }
    push('city.housing', near(stats.housing, num(c.housing)), num(c.housing), stats.housing,
      { parts: c.housingParts, ourParts: stats.housingParts, pop: city.population });
    state.congress = imp.congressOf(city.seat);
    const standing = computeCityStats(state, city).amenities;
    const standingLux = luxuryAmenities(state, city.seat).get(city.id) ?? 0;
    state.congress = congressNow;
    push('city.amenities', standing.have === num(c.amenities) && standing.needed === num(c.amenitiesNeeded),
      [num(c.amenities), num(c.amenitiesNeeded)], [standing.have, standing.needed], { parts: c.amenityParts, ourLux: standingLux });
    const tierGame = 6 - num(c.happiness);
    push('city.amenityTier', amenityTierIndex(standing.tier.name) === tierGame,
      AMENITY_TIERS[tierGame]?.name, standing.tier.name);
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
    // the game draws its next plot among the lowest-cost ties at its culture
    // step, and holds none (-1) from a founding or a plot gained otherwise
    // (bought) until that step; else -1 is no plot left to claim
    if (num(c.nextPlot) < 0 && imp.nextPlotUnheld.has(city.centerIndex)) {
      out.push({ turn, check: 'city.nextPlot', subject, ok: true, skip: 'no next plot held' });
    } else if (congressBorderFrozen(state, city.seat)) {
      // a Border Control Treaty's target draws no plot: it holds what it
      // held the turn before, or nothing once a plot was gained since
      const was = imp.cityBefore.get(`${c.owner}:${c.id}`);
      if (!was) out.push({ turn, check: 'city.nextPlot', subject, ok: true, skip: 'no record before' });
      else {
        const held = c.plots.length > was.plots.length ? -1 : num(was.nextPlot);
        push('city.nextPlot', num(c.nextPlot) === held, num(c.nextPlot), held);
      }
    } else {
      const ties = borderBestPlots(state, city);
      const ok = num(c.nextPlot) < 0 ? ties.length === 0 : ties.includes(num(c.nextPlot));
      // the plot a city claims next is scored by its yields: an unseen event
      // draw on an unowned plot in reach is the pick's gap
      const centre = state.map.tiles[city.centerIndex];
      const draws = ok ? [] : tilesWithin(state.map, centre.col, centre.row, BORDER_MAX_RADIUS).filter((t) => t.ownerSeat < 0)
        .flatMap((t) => [...imp.tileGaps.get(t.index) ?? []].filter((x) => x.startsWith('event-draw:')).map((x) => `plot ${t.index} ${x}`));
      const g = [...(gapsFor(gaps, 'city.nextPlot').gaps ?? []), ...draws];
      out.push({ turn, check: 'city.nextPlot', subject, ok, game: num(c.nextPlot), ours: ties, ...(g.length ? { gaps: g } : {}) });
    }
    // the start's pick, drawn on the game's generator from the witness seed
    const sp = startPicks.get(`${c.owner}:${c.id}`);
    if (sp === undefined) out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: 'no witness' });
    else if (typeof sp === 'string') out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: sp });
    else if (sp.game < 0 && imp.nextPlotUnheld.has(city.centerIndex)) {
      out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: 'no next plot held' });
    } else push('city.nextPlotDraw', sp.pick === sp.game, sp.game, sp.pick, { ties: sp.ties });
    // loyalty
    const gameLpt = num(c.loyaltyPerTurn);
    {
      // the whole per-turn change the turn step applies (the governor's term
      // and the seat's terms beside the city's own), a capital's too; the
      // city's standing amenity tier beside the congress the game holds now
      // (1107 t242: China's cities read the new session's loyalty terms
      // beside their old amenities)
      const ours = loyaltyPerTurn(state, city, standing.tier.name, num(c.governor) >= 0, stats.foodSurplus < 0);
      push('city.loyaltyPerTurn', near(ours, gameLpt, 0.05), gameLpt, round3(ours),
        { breakdown: c.loyaltyBreakdown, tier: standing.tier.name });
    }
    push('city.defense', cityDefenseStrength(state, city) === num((c.districts[0] ?? [])[5] as number),
      num((c.districts[0] ?? [])[5] as number), cityDefenseStrength(state, city),
      { buildings: city.buildings, districts: city.districts.map((d) => d.type), bestMelee: seatOf(state, city.seat)?.bestMeleeCS,
        bare: centreStrength(state, city, false) });
    // what a following city presses on each city in range a turn
    if (c.pressureOut !== undefined && (city.followedReligion ?? -1) >= 0) {
      const ours = pressureFromCity(state, city, city.followedReligion!);
      push('city.pressureOut', near(ours, num(c.pressureOut)), num(c.pressureOut), ours,
        { districts: city.districts.map((d) => d.type), wonders: city.wonders.map((w) => w.id), governor: num(c.governor) });
    }

    // production costs and purchase prices; a standing World Congress
    // resolution the importer could not carry may price them
    const buyGaps = [...gaps, ...imp.congressGaps];
    const buyPush = (check: string, ok: boolean, game: unknown, ours: unknown, st?: Record<string, unknown>) =>
      out.push({ turn, check, subject, ok, game, ours, ...gapsFor(buyGaps, check), ...(ok || !st ? {} : { state: st }) });
    const unlocks = computeUnlocks(state, city.seat);
    const s = seatOf(state, city.seat)!;
    // the faith price the record quotes beside the gold one: checked where an
    // engine arm buys the row with Faith; the game's reader quotes a faith
    // price for every row, so a row no arm buys has nothing to check
    const faithPush = (check: string, ours: number | null, game: Read<number>, st: Record<string, unknown>) => {
      if (ours === null || !num(game)) out.push({ turn, check, subject, ok: true, skip: 'no faith purchase' });
      else buyPush(check, ours === num(game), num(game), ours, st);
    };
    for (const [kind, idx, cost, gold, faith] of c.buy) {
      if (kind === 'B') {
        if (cat.wonders.includes(cat.buildings[idx])) continue;
        const id = engineRowOf(cat, 'building', idx);
        if (!id) continue;
        // a pillaged building's row: the game's cost reader answers the full
        // price (runs/h1_duelw1104, Xian's Library t41-53: 45, gold 180), not
        // the repair the engine prices
        const ours = buildingPillaged(city, id) ? buildingFullCost(state, city, id) : buildingCostIn(state, city, id);
        // a Flood Barrier is priced off the city's Coastal Lowland plots, which
        // a record without the lowland columns does not carry (the importer's
        // map has only the engine's own derivation of them)
        if (BUILDINGS[id]?.floodBarrier && !imp.lowlandsRead) {
          const ok = near(ours, num(cost), 0.5);
          out.push({ turn, check: 'buy.buildingCost', subject, ok, game: num(cost), ours,
            ...(ok ? {} : { gaps: [...(gapsFor(buyGaps, 'buy.buildingCost').gaps ?? []), 'coastal lowland'], state: { building: id } }) });
        } else {
          buyPush(`buy.buildingCost`, near(ours, num(cost), 0.5), num(cost), ours, { building: id });
        }
        faithPush('buy.buildingFaith', buildingFaithPrice(state, city.seat, id), faith, { building: id });
        // a building the seat cannot buy with Gold has no gold price to check:
        // a row with no PurchaseYield, and the walls a Valletta suzerain buys
        // with Faith alone (the reader still quotes them, at the suzerain's
        // discount: runs/h1_duelw1104 China t74+, 80 for 160)
        if (BUILDINGS[id]?.noPurchase || wallsGoldBlocked(state, city.seat, id)) {
          out.push({ turn, check: 'buy.buildingGold', subject, ok: true, skip: 'no gold purchase' });
          continue;
        }
        const price = goldPrice(state, city.seat, buildingPurchaseCost(state, city.seat, id));
        buyPush(`buy.buildingGold`, price === num(gold), num(gold), price, { building: id });
      } else if (kind === 'U') {
        const id = engineRowOf(cat, 'unit', idx);
        if (!id) continue;
        // a trained unit's cost moves with the seat's unit cost multipliers
        // (Flower Power, Mercenary Companies on Production); a Settler is no
        // unit item
        const prod = id === 'SETTLER' ? settlerCost(state, city.seat)
          : (id === 'BUILDER' ? builderCost(state, city.seat) : id === 'TRADER' ? traderCost(state, city.seat)
            : unitStepCost(id, unitsAcquired(state, city.seat, id))) * unitProdCostMult(state, city.seat, id);
        buyPush(`buy.unitCost`, near(prod, num(cost), 0.5), num(cost), prod, { unit: id });
        faithPush('buy.unitFaith', unitFaithPrice(state, city.seat, id, city), faith, { unit: id });
        // a chassis bought with Faith alone has no gold purchase to price: the
        // faith-only rows and every progressive one (PurchaseYield YIELD_FAITH,
        // MustPurchase)
        if (UNITS[id].faithOnly || UNITS[id].noGold || UNITS[id].costStep !== undefined) {
          out.push({ turn, check: 'buy.unitGold', subject, ok: true, skip: 'faith-only: no gold purchase' });
          continue;
        }
        const price = id === 'SETTLER'
          ? goldPrice(state, city.seat, settlerCost(state, city.seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, city.seat))
          : unitGoldPrice(state, id, city.seat, city);
        buyPush(`buy.unitGold`, price === num(gold), num(gold), price, { unit: id });
      } else if (kind === 'D') {
        const id = engineRowOf(cat, 'district', idx) as DistrictId | null;
        if (!id) continue;
        // a district of this type already standing in the city: the game's
        // cost reader answers the price it locked at placement (runs/h1_duelw1105:
        // Xian's Holy Site t30-33 at 39 while the fresh price climbed to 41, and
        // pillaged t44-63 at the same 39; Mediolanum's finished Dam t153-161 at
        // 157): the engine's price at the first record it stood, itself left
        // out (`History.districtLocked`)
        if (city.districts.some((d) => d.type === id)) {
          const locked = imp.districtLocked.get(`${c.owner}:${c.id}:${idx}`);
          if (locked === undefined) {
            out.push({ turn, check: 'buy.districtCost', subject, ok: true, skip: 'standing in the city: placed before the records priced it' });
          } else {
            buyPush('buy.districtCost', near(locked, num(cost), 0.5), num(cost), locked, { district: id, locked: true });
          }
          continue;
        }
        const dc = districtSiteCost(state, s, id, unlocks);
        buyPush(`buy.districtCost`, near(dc, num(cost), 0.5), num(cost), dc, { district: id });
      }
    }
    for (const [plot, price] of c.plotBuy) {
      const ours = tilePurchaseCost(state, city, plot);
      buyPush('buy.plotGold', ours === price, price, ours, { plot, distance: tileDistance(state, city.centerIndex, plot) });
    }
  }

  // each major's upkeep: buildings, districts, units
  for (let seat = 0; seat < state.seats.length; seat++) {
    const pid = imp.playerOfSeat.get(seat)!;
    const p = rec.players.find((q) => q.id === pid)!;
    let b = 0;
    let d = 0;
    for (const city of state.seats[seat].cities) {
      for (const id of city.buildings) b += buildingMaintenance(state, city, id);
      for (const x of city.districts) {
        const t = state.map.tiles[x.tileIndex];
        if (t.districtComplete && !t.districtPillaged) d += districtMaintenance(x.type);
      }
    }
    const mods = getModifiers(state, seat);
    const u = state.units.filter((x) => x.seat === seat).reduce((n, x) => n + unitUpkeep(mods, x), 0);
    const subject = `seat ${pid} ${String(p.civ)}`;
    const sg = [...(state.seats[seat].civ < 0 ? ['leader'] : []), ...(imp.seatGaps.get(seat) ?? [])];
    for (const [key, c] of imp.cityByKey) if (c.seat === seat) for (const g of imp.cityGaps.get(key) ?? []) sg.push(g);
    const gaps = gapsFor([...new Set(sg)], 'seat.maint');
    // a Flood Barrier's upkeep is priced off its city's Coastal Lowland plots,
    // which a record without the lowland columns does not carry
    const barrier = !imp.lowlandsRead && state.seats[seat].cities.some((c) => c.buildings.some((id) => BUILDINGS[id]?.floodBarrier));
    const bok = b === num(p.maintBuildings);
    const bgaps = !bok && barrier ? { gaps: [...(gaps.gaps ?? []), 'coastal lowland'] } : gaps;
    out.push({ turn, check: 'seat.maintBuildings', subject, ok: bok, game: num(p.maintBuildings), ours: b, ...bgaps });
    out.push({ turn, check: 'seat.maintDistricts', subject, ok: d === num(p.maintDistricts), game: num(p.maintDistricts), ours: d, ...gaps });
    out.push({ turn, check: 'seat.maintUnits', subject, ok: u === num(p.maintUnits), game: num(p.maintUnits), ours: u, ...gaps,
      state: { units: state.units.filter((x) => x.seat === seat).map((x) => x.type) } });
    // the game's reader answers the whole output, the religious half with it
    // (runs/h1_duelw1103 t150: Rome's 8 is its Holy City's)
    // The game's seat figure is its cities' sum as its last turn processing
    // left them; a record whose cities moved since (a wonder completed in
    // the turn: 1108 Rome t102, the Pyramids' 3 in Rome's figure, 0 in the
    // seat's) holds no reading of the seat's
    const tour = seatTourism(state, seat, governedCityIds(seatOf(state, seat)!)) + seatTourismReligious(state, seat);
    const citySum = rec.cities.filter((c) => c.owner === pid).reduce((n, c) => n + num(c.tourism), 0);
    if (rec.cities.some((c) => c.owner === pid && c.tourism !== undefined) && citySum !== num(p.tourism)) {
      out.push({ turn, check: 'seat.tourism', subject, ok: true, skip: 'the seat figure predates its cities\'' });
    } else {
      out.push({ turn, check: 'seat.tourism', subject, ok: near(tour, num(p.tourism), 0.5), game: num(p.tourism), ours: round3(tour),
        ...gapsFor([...new Set(sg)], 'seat.tourism') });
    }
  }

  // each live trade route: what it pays its origin and its destination, each
  // after its seat's Letters of Marque cut
  const cityName = (pid: unknown, id: unknown) =>
    strip(rec.cities.find((c) => c.owner === pid && c.id === id)?.name ?? '?', 'LOC_CITY_NAME_');
  const amounts = (rows: unknown) => YIELD_KEYS.map((_, i) =>
    num((rows as { Amount: number; YieldIndex: number }[] | undefined)?.find((x) => x.YieldIndex === i)?.Amount));
  for (const { owner, route, game } of imp.routes) {
    const subject = `route ${cityName(game.OriginCityPlayer, game.OriginCityID)} -> ${cityName(game.DestinationCityPlayer, game.DestinationCityID)}`;
    const s = seatOf(state, owner)!;
    const origin = isCityStateSeat(owner) ? minorRouteOriginYields(state, s, route)
      : (() => {
        const c = s.cities.find((x) => x.id === route.from);
        return c ? routeOriginYields(state, c, route) : null;
      })();
    const go = amounts(game.OriginYields);
    const cut = origin ? routeYieldCut(state, owner, origin) : null;
    const oo = cut ? YIELD_KEYS.map((k) => round3(cut[k])) : null;
    const st = { course: route.course ?? [], posts: s.tradingPosts ?? [] };
    out.push({ turn, check: 'route.originYields', subject, ok: !!oo && oo.every((v, i) => near(v, go[i], 0.05)), game: go, ours: oo, state: st });
    const dSeat = route.toCs !== undefined ? -1 : (route.toSeat ?? owner);
    const dy = routeDestYields(state, owner, route);
    const dcut = dSeat >= 0 ? routeYieldCut(state, dSeat, dy) : dy;
    const od = YIELD_KEYS.map((k) => round3(dcut[k]));
    const gd = amounts(game.DestinationYields);
    out.push({ turn, check: 'route.destYields', subject, ok: od.every((v, i) => near(v, gd[i], 0.05)), game: gd, ours: od });
  }
  return out;
}

/** the hex distance between two plots, by index */
function tileDistance(state: GameState, a: number, b: number): number {
  const ta = state.map.tiles[a], tb = state.map.tiles[b];
  return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
}

/** What changed between two consecutive records, per city and per seat. */
export interface Actions {
  /** cities by `${owner}:${id}` whose owner, or existence, changed */
  cityChanged: Set<string>;
  /** units that appeared, by owner, with their plot */
  unitsNew: { owner: number; type: number; plot: number }[];
  /** religious units that spent a spread charge, with their t+1 plot (their
   *  t plot when gone), their type, health and promotions at t and the
   *  charges spent (null: gone, where and how often it spread before unknown) */
  spreads: { owner: number; religion: number; plot: number; type: number; hp: number; promos: number;
    n: number | null }[];
  /** plots a city holds at t+1 and did not at t */
  plotsGained: Map<string, number[]>;
  /** seats whose gold fell below what their income would leave */
  goldSpent: Map<number, number>;
  /** cities whose population moved across the pair while the food box ran
   *  on (a village's citizen; a citizen lost with no Settler and no famine) */
  popOutsideBox: Set<string>;
  /** players whose turn start had not run when the later record was read */
  notStarted: Set<number>;
}

/** the living city centres at `here` or beside it — where a religious unit
 *  standing on `here` may spread */
function spreadCentres(state: GameState, here: Tile): Tile[] {
  const at = [here, ...neighbors(state.map, here).filter((t): t is Tile => !!t)];
  const centres = new Set([...state.seats.flatMap((x) => x.cities.map((c) => c.centerIndex)),
    ...state.cityStates.map((c) => c.centerIndex), ...(state.freeSeat?.cities ?? []).map((c) => c.centerIndex)]);
  return at.filter((t) => centres.has(t.index));
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
      spreads.push({ owner: u.owner, religion: num(u.religion), plot: u.y * b.head.W + u.x, type: u.type,
        hp: 100 - num(was.damage), promos: (was.promotions ?? []).length, n: num(was.spreadCharges) - num(u.spreadCharges) });
    }
  }
  // a religious unit that spent its last charge is gone at t+1
  const unitsAfter = new Set(b.units.map((u) => `${u.owner}:${u.id}`));
  for (const u of a.units) {
    if (!unitsAfter.has(`${u.owner}:${u.id}`) && num(u.spreadCharges) > 0) {
      spreads.push({ owner: u.owner, religion: num(u.religion), plot: u.y * a.head.W + u.x, type: u.type,
        hp: 100 - num(u.damage), promos: (u.promotions ?? []).length, n: null });
    }
  }
  const plotsGained = new Map<string, number[]>();
  const popOutsideBox = new Set<string>();
  for (const [k, c1] of after) {
    const c0 = before.get(k);
    if (!c0) continue;
    const had = new Set(c0.plots);
    const gained = c1.plots.filter((q) => !had.has(q));
    if (gained.length) plotsGained.set(k, gained);
    // a starving city's refilled box is the growth step's own (`seatGrowth`)
    const starved = c1.pop === c0.pop - 1 && num(c0.foodSurplus) < 0;
    if (c1.pop !== c0.pop && num(c1.food) >= num(c0.food) && !starved) popOutsideBox.add(k);
  }
  const goldSpent = new Map<number, number>();
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0) continue;
    const expected = num(p0.gold) + num(p0.goldYield);
    if (num(p1.gold) < expected - 0.5) goldSpent.set(p1.id, expected - num(p1.gold));
  }
  return { cityChanged, unitsNew, spreads, plotsGained, goldSpent, popOutsideBox,
    notStarted: notStarted(a, b) };
}

/**
 * The players whose every city with culture coming in holds its border box
 * exactly across the pair while its food moves: the game banked no border
 * culture for the whole seat that turn. A Border Control Treaty the next
 * record shows is that state, and the step runs it (`cityBorderGrowth`);
 * what stays a skip is a hold no record reads: runs/h1_duelw1103's seat 0
 * t82-101, recorded before the records carried the World Congress.
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

/**
 * The turn's production, landed: the buildings and districts the city stands
 * with in record `b` — what it completed, bought or repaired across the pair
 * — laid on the imported turn-t city, as the game's turn lands them before
 * its cities grow and claim (runs/h1_duelw1108, Rome t17: the Granary it
 * completed fed the food box 4 where the turn-t surplus read 3). Returns the
 * switch between the turn-start city (`false`) and the landed one (`true`):
 * the turn's loyalty change is the turn start's rate (tools/civ6lab/
 * turn_order_civ6.md, "Loyalty's place"; runs/h1_duelw1103, Beijing t209:
 * the Monument it completed paid none of its +1 that turn).
 */
/** The Food a city's owner took off its plots between two records: a feature
 *  gone with nothing set in its place (`chopGrant`) and a bonus resource
 *  harvested (`harvestGrant`), each priced on the plot as `a` showed it. A
 *  plot a district, a wonder or an eruption's soil took is no clearing. */
function actionFood(state: GameState, cat: Catalog, a: TurnRecord, b: TurnRecord, city: City, c: DumpCity): number {
  let food = 0;
  for (const q of c.plots) {
    const pa = plotAt(a, q);
    const pb = plotAt(b, q);
    if (pb[P.owner] !== pa[P.owner] || pb[P.ownerCity] !== pa[P.ownerCity]) continue;
    if ((pb[P.district] as number) >= 0 || (pb[P.wonder] as number) >= 0) continue;
    const t = state.map.tiles[q];
    const grants: LumpGrant[] = [];
    if ((pa[P.feature] as number) >= 0 && (pb[P.feature] as number) < 0) grants.push(...chopGrant(state, t, city.seat));
    if ((pa[P.resource] as number) >= 0 && (pb[P.resource] as number) < 0
      && cat.features[pb[P.feature] as number] !== 'FEATURE_VOLCANIC_SOIL') {
      const g = harvestGrant(state, t, city.seat);
      if (g) grants.push(g);
    }
    for (const g of grants) if (g.key === 'food') food += g.amount;
  }
  return food;
}

function landProduction(state: GameState, cat: Catalog, city: City, next: DumpCity, W: number, actedFirst: boolean): (landed: boolean) => void {
  type Side = { buildings: string[]; pillaged: string[] | undefined; wonders: City['wonders']; districts: City['districts'];
    tiles: [number, Tile['district'], boolean, boolean, boolean][] };
  const touched = new Set<number>();
  for (const d of next.districts) touched.add((d[2] as number) * W + (d[1] as number));
  for (const t of state.map.tiles) if (t.builtWonder && t.ownerSeat === city.seat && t.ownerCity === city.id) touched.add(t.index);
  const read = (): Side => ({ buildings: city.buildings, pillaged: city.pillagedBuildings, wonders: [...city.wonders],
    districts: [...city.districts], tiles: [...touched].map((i) => {
      const t = state.map.tiles[i];
      return [i, t.district, t.districtComplete, t.districtPillaged ?? false, t.builtWonderComplete];
    }) });
  const write = (side: Side) => {
    city.buildings = side.buildings;
    city.pillagedBuildings = side.pillaged;
    city.wonders = [...side.wonders];
    city.districts = [...side.districts];
    for (const [i, d, c, pl, wc] of side.tiles) {
      const t = state.map.tiles[i];
      t.district = d;
      t.districtComplete = c;
      t.districtPillaged = pl;
      t.builtWonderComplete = wc;
    }
  };
  const start = read();
  const buildings: string[] = [];
  const pillaged: string[] = [];
  for (const [bi, pil] of next.buildings) {
    const name = cat.buildings[bi];
    if (cat.wonders.includes(name)) {
      const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
      if (!id || city.wonders.some((w) => w.id === id)) continue;
      // a wonder granting every city a citizen lands after the cities have
      // grown, its Housing with it (runs/h1_duelw1108 t183, Angkor Wat:
      // Chengdu grows at its old quarter-growth housing band)
      if (BUILT_WONDERS[id]?.effects?.popAllCities) continue;
      const t = state.map.tiles.find((x) => x.builtWonder === id && x.ownerSeat === city.seat && x.ownerCity === city.id);
      if (!t) continue;
      t.builtWonderComplete = true;
      city.wonders.push({ id, tileIndex: t.index });
      continue;
    }
    const id = engineRowOf(cat, 'building', bi);
    if (!id) continue;
    buildings.push(id);
    if (pil) pillaged.push(id);
  }
  city.buildings = buildings;
  city.pillagedBuildings = pillaged.length ? pillaged : undefined;
  for (const d of next.districts) {
    const [ti, dx, dy, complete, dpil] = d as [number, number, number, boolean, boolean];
    const id = engineRowOf(cat, 'district', ti) as DistrictId | null;
    if (!id || id === 'CITY_CENTER' || cat.districts[ti] === 'DISTRICT_WONDER') continue;
    const t = state.map.tiles[dy * W + dx];
    // a district placed across the pair and not finished was placed in the
    // owner's actions: after its turn start banked, unless the owner is the
    // player the records were read in (`actedFirst`; runs/h1_duelw1112
    // Taiyuan t71: its Granary completes and the city banks +7 on the plot
    // an Industrial Zone was placed on afterwards)
    if (!actedFirst && !complete && !city.districts.some((x) => x.tileIndex === t.index)) continue;
    t.district = id;
    t.districtComplete = complete === true;
    t.districtPillaged = dpil === true;
    if (!city.districts.some((x) => x.tileIndex === t.index)) city.districts.push({ type: id, tileIndex: t.index });
  }
  const landed = read();
  return (side) => write(side ? landed : start);
}

/** the citizens a wonder completed in this city across the pair grants every
 *  city of its owner (Angkor Wat's `popAllCities`), 0 where none */
function popGrant(cat: Catalog, c: DumpCity, next: DumpCity): number {
  const had = new Set(c.buildings.map((x) => x[0]));
  let n = 0;
  for (const [b] of next.buildings) {
    if (had.has(b)) continue;
    n += BUILT_WONDERS[(cat.buildings[b] ?? '').replace(/^BUILDING_/, '')]?.effects?.popAllCities ?? 0;
  }
  return n;
}

/** The research the later record holds lands before the cities grow: a
 *  player's turn completes its technologies and civics ahead of its cities'
 *  growth and culture steps, and a completed civic's new government and
 *  policies are slotted with it (runs/h1_duelw1112 t56: China's government
 *  changed with its civic, Xi'an's box growing at the new housing). Cards
 *  swapped with no civic completed came after the cities (1112 t201). */
function landResearch(state: GameState, cat: Catalog, seat: number, pa?: DumpPlayer, pb?: DumpPlayer): void {
  const s = seatOf(state, seat);
  if (!s || !pa || !pb || !isCiv(seat)) return;
  const ids = (bits: string, names: string[], kind: 'tech' | 'civic', prefix: string, known: object) =>
    [...(bits ?? '')].flatMap((ch, k) => (ch === '1' ? [engineId(kind, names[k], prefix, known)] : []))
      .filter((x): x is string => !!x);
  if (pa.techs !== pb.techs) s.research.techs = ids(pb.techs, cat.techs, 'tech', 'TECH_', TECHS) as typeof s.research.techs;
  if (pa.civics === pb.civics) return;
  s.research.civics = ids(pb.civics, cat.civics, 'civic', 'CIVIC_', CIVICS) as typeof s.research.civics;
  const gov = num(pb.government);
  const gid = gov >= 0 ? engineId('government', cat.governments[gov], 'GOVERNMENT_', GOVERNMENTS) : null;
  if (gid) s.government.chosen = gid as typeof s.government.chosen;
  s.government.policies = (pb.policies ?? []).map((x) => num(x)).filter((i) => i >= 0)
    .map((i) => engineId('policy', cat.policies[i], 'POLICY_', POLICIES))
    .filter((x): x is string => !!x) as typeof s.government.policies;
}

/** how far a Settler the city trained can stand from it at the next record:
 *  its moves on the turn it appears */
const SETTLER_WALK = UNITS.SETTLER.moves;

/** pin the city's citizens to the plots the later record works — the step
 *  after a citizen left with a Settler grows the city the game kept */
function relockWorked(state: GameState, city: City, was: DumpCity, next: DumpCity): void {
  for (const q of was.worked) state.map.tiles[q].locked = false;
  for (const q of next.worked) if (q !== city.centerIndex && !state.map.tiles[q].district) state.map.tiles[q].locked = true;
}

export function transitionChecks(a: TurnRecord, b: TurnRecord, cat: Catalog, history?: History,
  prev?: TurnRecord): CheckResult[] {
  const out: CheckResult[] = [];
  const turn = a.turn;
  const acts = diffActions(a, b);
  const villagers = new Set(villagesEntered(a, b, cat).values());
  const late = new Set([...acts.notStarted, ...(prev ? notStarted(prev, a) : [])]);
  const lateCities = new Set([...citiesNotStarted(a, b), ...(prev ? citiesNotStarted(prev, a) : [])]);
  const held = bordersHeld(a, b);
  const imp = importTurn(a, cat, history);
  const congressNext = congressOfRecord(b, cat, imp);
  const state = imp.state;
  const after = new Map(b.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const settlerIdx = cat.units.indexOf('UNIT_SETTLER');

  // the religious spread first, on the untouched turn-t state: each founder's
  // religion on its own turn, in the turn's order
  const pressBefore = new Map<City, number[]>();
  for (const { city } of citiesOfImport(imp)) pressBefore.set(city, [...(city.religionPressure ?? [])]);
  // — each player's cities first adding the citizens the record says they
  // grew on its turn (`gainPopulationPressure`), the majors before their
  // spread, the city-states and the Free Cities after the last
  const spreadImp = importTurn(a, cat, history);
  const spreadState: GameState = spreadImp.state;
  // a city whose food box emptied while a Settler of its owner came out
  // beside it grew the citizen the Settler took
  const grownBy = (c: DumpCity, centre: number) => {
    const next = after.get(`${c.owner}:${c.id}`);
    if (!next || acts.cityChanged.has(`${c.owner}:${c.id}`)) return 0;
    const settled = num(next.food) < num(c.food) && acts.unitsNew.some((u) => u.owner === c.owner
      && u.type === settlerIdx && tileDistance(spreadState, u.plot, centre) <= 2);
    return next.pop - c.pop + (settled ? 1 : 0);
  };
  const growAt = (seat: number) => {
    for (const [city, c] of spreadImp.dumpOfCity) if (city.seat === seat) gainPopulationPressure(city, grownBy(c, city.centerIndex));
    for (const [cs, c] of spreadImp.dumpOfMinor) if (cs.seat === seat) gainPopulationPressure(cs, grownBy(c, cs.centerIndex));
  };
  // a route ends and begins on its owner's turn: an earlier major's changes
  // stand by the time a later founder spreads
  const routesMoved = routeChanges(spreadImp, b);
  const routeTurn = (owner: number) => {
    for (const r of routesMoved.ended) {
      const sx = seatOf(spreadState, r.owner);
      if (r.owner === owner && sx?.tradeRoutes) sx.tradeRoutes = sx.tradeRoutes.filter((x) => x !== r.route);
    }
    for (const r of routesMoved.begun) {
      const sx = seatOf(spreadState, r.owner);
      if (r.owner === owner && sx) (sx.tradeRoutes ??= []).push(r.route);
    }
  };
  // a Missionary's or Apostle's spread on its owner's turn, after the
  // owner's religion spread: the engine's own `spreadFromUnit` on the one
  // city centre at or beside the unit (runs/h1_duelw1108: Rome +202 a
  // charge t108-110, 200 of it the spread); a spread the record leaves
  // unclear (a promoted unit, a unit gone — it may have moved before its
  // last spread —, no single centre in reach, a religion not its owner's)
  // stays a skip
  const unclear: number[] = [];
  const unitTurn = (seat: number) => {
    for (const sp of acts.spreads) {
      if (spreadImp.seatOfPlayer.get(sp.owner) !== seat) continue;
      const type = engineRowOf(cat, 'unit', sp.type);
      const actor = seatOf(spreadState, seat);
      const here = spreadState.map.tiles[sp.plot];
      const centres = spreadCentres(spreadState, here);
      if (!actor || sp.n === null || sp.promos > 0 || (type !== 'MISSIONARY' && type !== 'APOSTLE')
        || centres.length !== 1 || spreadImp.religionSeat.get(sp.religion) !== seat) {
        unclear.push(sp.plot);
        continue;
      }
      const unit: Unit = { id: -1, type, seat, tileIndex: sp.plot, movesLeft: 1, movesFull: 1, hp: sp.hp,
        charges: sp.n + 1, xp: 0, level: 1 };
      for (let k = 0; k < sp.n; k++) spreadFromUnit(spreadState, unit, actor, centres[0]);
    }
  };
  for (const s of spreadState.seats) {
    growAt(s.seat);
    spreadReligiousPressure(spreadState, s.seat);
    unitTurn(s.seat);
    routeTurn(s.seat);
  }
  for (const cs of spreadState.cityStates ?? []) growAt(cs.seat);
  growAt(FREE_SEAT);
  const spreadCities = new Map<string, City>();
  for (const s of spreadState.seats) for (const c of s.cities) spreadCities.set(`${s.seat}:${c.id}`, c);

  // the player whose turn the records were read in (the local seat, or in
  // an observer game the active player): its actions come between the
  // record and its next turn start; every other player starts, then acts
  const seatInTurn = a.players.find((p) => bool(p.turnActive))?.id ?? num(a.head.localPlayer);
  // the per-city turn step, city by city in the game's order, stats first
  const perSeat = new Map<number, { city: City; dump: DumpCity }[]>();
  for (const { city, dump } of citiesOfImport(imp)) {
    const list = perSeat.get(city.seat) ?? [];
    list.push({ city, dump });
    perSeat.set(city.seat, list);
  }
  for (const [seat, list] of perSeat) {
    // the loyalty step's stats, on the turn-start cities (`landProduction`)
    const startStats = new Map(list.map(({ city }) => [city, computeCityStats(state, city)]));
    const sides: ((landed: boolean) => void)[] = [];
    // a Settler trained or bought beside the city across the pair: its
    // citizen leaves with the turn's production, before the city grows
    // (tools/civ6lab/turn_order_civ6.md, armS: pop 6 -> 5, then the pop-5
    // surplus), unless the city's governor spares it (Provision)
    const settled = new Set<City>();
    for (const { city, dump: c } of list) {
      const next = after.get(`${c.owner}:${c.id}`);
      if (!next || acts.cityChanged.has(`${c.owner}:${c.id}`)) continue;
      sides.push(landProduction(state, cat, city, next, a.head.W, c.owner === seatInTurn));
      // the Settler stands beside the city, or the city trained it (its
      // queue's head) and it walked off within its first moves
      const trained = (c.queue?.[0] as { UnitType?: number } | undefined)?.UnitType === settlerIdx && next.pop === c.pop - 1;
      if (acts.unitsNew.some((u) => u.owner === c.owner && u.type === settlerIdx
        && tileDistance(state, u.plot, city.centerIndex) <= (trained ? SETTLER_WALK : 1))) {
        settled.add(city);
        if (!governorFlag(state, city, (e) => e.settlerFreePop)) {
          city.population = Math.max(1, city.population - 1);
          // the citizen that left is the one the later record no longer works
          if (next.pop === city.population) relockWorked(state, city, c, next);
        }
      }
    }
    // a wonder granting every city a citizen (Angkor Wat) completed across
    // the pair: every city grows and banks its culture on the citizens it
    // had, then takes the grant (runs/h1_duelw1108 t183: Taiyuan completes
    // it, and Xi'an, Handan, Taiyuan, Chengdu and Shenyang each bank their
    // old size's surplus and culture, one citizen larger at t184)
    const grant = list.reduce((n, { dump: c }) => {
      const next = after.get(`${c.owner}:${c.id}`);
      return n + (next ? popGrant(cat, c, next) : 0);
    }, 0);
    landResearch(state, cat, seat, a.players.find((q) => q.id === imp.playerOfSeat.get(seat)),
      b.players.find((q) => q.id === imp.playerOfSeat.get(seat)));
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
      // the boxes of a city whose own turn start the pair missed
      const boxSkip = skipAll ?? (lateCities.has(k) ? 'a turn start missing from a record' : null);
      const granted = grant > 0 && !!next && !acts.cityChanged.has(k);
      const st = stats.get(city)!;
      const res = (check: string, ok: boolean, game: unknown, ours: unknown, s?: Record<string, unknown>) =>
        out.push({ turn, check, subject, ok, game, ours, ...gapsFor(gaps, check), ...(ok || !s ? {} : { state: s }) });

      // growth
      const before = { pop: city.population, food: city.foodBox };
      const outside = acts.popOutsideBox.has(k) && !settled.has(city) && !granted ? 'a citizen came or went outside the food box' : null;
      const growSkip = boxSkip ?? outside;
      // a feature cleared or a resource harvested off the city's plots across
      // the pair pays its Food into the box in the owner's actions: before
      // its turn start for the player the records were read in, after it for
      // every other, the city growing at once where the lump fills its box
      // (runs/h1_duelw1112 Xi'an: a Rainforest cleared t49 +11 grows it to 7
      // with 9.55 left, a Marsh t74 +31 to 11 with 3.02)
      const lump = actionFood(state, cat, a, b, city, c);
      if (c.owner === seatInTurn) city.foodBox += lump;
      seatGrowth(city, st.effectiveFoodSurplus, st.growthNeeded, state.turn);
      // the actions after the turn start: the turn's border step stands on
      // the city its start left
      let popAfter = city.population;
      let boxAfter = city.foodBox;
      if (c.owner !== seatInTurn && lump > 0) {
        boxAfter += lump;
        const need = growthFoodNeeded(popAfter);
        if (boxAfter >= need) {
          boxAfter -= need;
          popAfter += 1;
        }
      }
      if (growSkip || !next) out.push({ turn, check: 'step.growth', subject, ok: true, skip: growSkip ?? 'no t+1' });
      else {
        res('step.growth', popAfter + (granted ? grant : 0) === next.pop && near(boxAfter, num(next.food), 0.05),
          [next.pop, num(next.food)], [popAfter + (granted ? grant : 0), round3(boxAfter)],
          { before, surplus: round3(st.foodSurplus), effective: round3(st.effectiveFoodSurplus), needed: st.growthNeeded,
            housing: st.housing, tier: st.amenities.tier.name });
      }
      // border growth, the plots bought in the turn landed first: with gold
      // spent, every plot the city gained but the one its box paid for (the
      // box fell and the plot is the turn's next plot); a box that fell on a
      // gain without its next plot is no telling which was bought
      const gainedGame = acts.plotsGained.get(k) ?? [];
      const boxPaid = !!next && num(next.culture) < num(c.culture) - 0.01;
      const spent = (acts.goldSpent.get(c.owner) ?? 0) > 0;
      const boughtPlots = spent ? gainedGame.filter((q) => !(boxPaid && q === num(c.nextPlot))) : [];
      const bought = spent && boxPaid && gainedGame.length > 0 && !gainedGame.includes(num(c.nextPlot));
      for (const q of boughtPlots) setTileOwner(state.map.tiles[q], seat, city.id);
      const plotsBefore = new Set(state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id).map((t) => t.index));
      const boxBefore = city.cultureBox;
      const culture = cultureAfterGrowth(state, city, before.pop, st);
      // the culture turn reads the session the next record shows: a Border
      // Control Treaty holds the target's boxes from the pair it opens on
      // through the pair before its successor (runs/h1_duelw1112 Ravenna:
      // held 141 -> 142, banked 181 -> 182)
      const congressWas = state.congress;
      state.congress = congressNext;
      cityBorderGrowth(state, city, seat, culture);
      const frozen = congressBorderFrozen(state, seat);
      state.congress = congressWas;
      if (granted) city.population += grant;
      const gainedOurs = [...boughtPlots, ...state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id
        && !plotsBefore.has(t.index)).map((t) => t.index)];
      const borderSkip = boxSkip ?? (bought ? 'a plot may have been bought'
        // the culture reads a village's citizen given in the turn
        : outside && !!next && next.pop > c.pop && villagers.has(c.owner) ? 'a village gave the city a citizen'
        : imp.tilesUnknown.has(city.centerIndex) ? 'expansions before the record'
        : held.has(c.owner) && !frozen ? 'the seat banked no border culture' : null);
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
      const st0 = startStats.get(city)!;
      for (const side of sides) side(false);
      applyLoyalty(state, city, st0.amenities.tier.name, hasGov, st0.foodSurplus < 0);
      for (const side of sides) side(true);
      const loySkip = skipAll;
      if (loySkip || !next) out.push({ turn, check: 'step.loyalty', subject, ok: true, skip: loySkip ?? 'no t+1' });
      else {
        res('step.loyalty', near(city.loyalty ?? 100, num(next.loyalty), 0.05), num(next.loyalty), round3(city.loyalty ?? 100),
          { before: loyBefore, gamePerTurn: num(c.loyaltyPerTurn), governor: hasGov });
      }
      // religious pressure
      const sc = spreadCities.get(`${seat}:${city.id}`);
      const spreadNear = unclear.some((at) => tileDistance(state, at, city.centerIndex) <= 3);
      const relSkip = skipAll ?? (spreadNear ? 'a religious unit spread nearby' : null);
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

  out.push(...eraChecks(a, b, cat, late, history, prev));
  return out;
}

/** an era event: its label and what it pays, through the engine's own
 *  moment function, to a seat of the imported turn-t state */
export type EraPay = (state: GameState, seat: number) => void;

export interface EraEvents {
  events: [string, EraPay][];
  buildings: string[];
}

/**
 * The tribal villages gone from their plots across the pair, each with the
 * major that entered it: the one whose unit stands nearest the plot, within
 * the moves that unit has (it may have moved on with the moves it had left)
 * — a unit at t+1, or one lost across the pair where t saw it. A village no
 * major's unit could have reached went to someone else.
 */
function villagesEntered(a: TurnRecord, b: TurnRecord, cat: Catalog): Map<number, number> {
  const out = new Map<number, number>();
  const hutIdx = cat.improvements.indexOf('IMPROVEMENT_GOODY_HUT');
  if (hutIdx < 0) return out;
  const W = b.head.W;
  const shape = { width: W, height: b.head.H, wrapX: bool(b.head.wrapX) };
  const isMajor = (owner: number) => b.players.some((p) => p.id === owner && bool(p.major));
  const living = new Set(b.units.map((u) => `${u.owner}:${u.id}`));
  const majorUnits = [...b.units, ...a.units.filter((u) => !living.has(`${u.owner}:${u.id}`))]
    .filter((u) => isMajor(u.owner));
  for (let i = 0; i < W * b.head.H; i++) {
    if (plotAt(a, i)[P.improvement] !== hutIdx || plotAt(b, i)[P.improvement] === hutIdx) continue;
    let by: number | undefined;
    let best = Infinity;
    for (const u of majorUnits) {
      const d = hexDistance(shape, i % W, Math.floor(i / W), u.x, u.y);
      if (d < best && d <= num(u.maxMoves)) [best, by] = [d, u.owner];
    }
    if (by !== undefined) out.set(i, by);
  }
  return out;
}

/** has the player met every other major of t+1 there, and not every other
 *  major of t at t */
function metAllAcross(a: TurnRecord, b: TurnRecord, p0: DumpPlayer, p1: DumpPlayer): boolean {
  const all = (r: TurnRecord, p: DumpPlayer) => {
    const met = new Set(Array.isArray(p.met) ? p.met : []);
    return r.players.every((q) => q.id === p.id || !bool(q.major) || met.has(q.id));
  };
  return all(b, p1) && !all(a, p0);
}

/** does the player hold boost `k` (a catalog index) at t+1 and not at t */
function boostedAcross(p0: DumpPlayer, p1: DumpPlayer, field: 'techBoosts' | 'civicBoosts', k: number): boolean {
  return k >= 0 && String(p1[field] ?? '')[k] === '1' && String(p0[field] ?? '')[k] !== '1';
}

/**
 * The era-score events the difference of two records shows, by game player:
 * a city on a plot that held none (founded), a city whose owner changed
 * (gained), a world wonder newly complete on the player's plot (the local
 * player's over the pair after the one that shows it), a pantheon or
 * religion newly held, a Great Person unit newly the player's, a barbarian
 * camp or tribal village gone from its plot, each Eureka and Inspiration
 * newly triggered (the dedications they pay), each district newly complete,
 * and every building a city of
 * theirs holds at t+1 and did not at t.
 */
export function eraEvents(a: TurnRecord, b: TurnRecord, cat: Catalog, prev?: TurnRecord): Map<number, EraEvents> {
  const out = new Map<number, EraEvents>();
  const of = (pid: number) => {
    if (!out.has(pid)) out.set(pid, { events: [], buildings: [] });
    return out.get(pid)!;
  };
  const W = b.head.W;
  const centres = new Map(a.cities.map((c) => [c.y * W + c.x, c]));
  for (const c of b.cities) {
    const was = centres.get(c.y * W + c.x);
    const k = c.y * W + c.x;
    if (!was) of(c.owner).events.push([`found ${strip(c.name, 'LOC_CITY_NAME_')}`, (st, seat) => foundingMoments(st, seat, k)]);
    else if (was.owner !== c.owner) {
      // the dump names no reason: a transfer is read as a capture
      const last = a.cities.filter((q) => q.owner === was.owner).length <= 1;
      of(c.owner).events.push([`gain ${strip(c.name, 'LOC_CITY_NAME_')}`, (st, seat) => {
        const from = st.seats.find((s) => s.cities.some((q) => q.centerIndex === k));
        const city = from?.cities.find((q) => q.centerIndex === k);
        if (from && city && isCiv(from.seat)) transferMoments(st, from.seat, seat, city, false, last);
      }]);
    } else {
      // a district complete at t+1 that t saw incomplete or not at all
      const done = new Set(was.districts.filter((d) => d[3] === true).map((d) => `${d[1]},${d[2]}`));
      for (const d of c.districts) {
        if (d[3] !== true || done.has(`${d[1]},${d[2]}`)) continue;
        const type = engineRowOf(cat, 'district', d[0] as number) as DistrictId | null;
        const tile = (d[2] as number) * W + (d[1] as number);
        if (!type) continue;
        of(c.owner).events.push([`district ${type}`, (st, seat) => {
          const city = st.seats[seat]?.cities.find((q) => q.centerIndex === k);
          // the completion site's two payouts (`completeQueueItem`): the
          // Monumentality dedication's, then the district's moment
          if (type !== 'CITY_CENTER') dedicationEvent(st, seat, DED_MONUMENTALITY);
          if (city) districtMoment(st, seat, city, tile, type);
        }]);
      }
      const had = new Set(was.buildings.map(([bi]) => bi));
      for (const [bi] of c.buildings) {
        if (had.has(bi) || cat.wonders.includes(cat.buildings[bi])) continue;
        const id = engineRowOf(cat, 'building', bi);
        if (id) of(c.owner).buildings.push(id);
      }
    }
  }
  // a world wonder newly complete on a plot; the local player's moment lands
  // in the record after the one its plot shows complete in, so its wonder
  // pays over the pair after (the record before's)
  const local = num(b.head.localPlayer);
  const completed = (x: TurnRecord, y: TurnRecord, i: number): number => {
    const p1 = plotAt(y, i);
    const w = p1[P.wonder] as number;
    if (typeof w !== 'number' || w < 0 || p1[P.wonderComplete] !== 1) return -1;
    const p0 = plotAt(x, i);
    return p0[P.wonder] === w && p0[P.wonderComplete] === 1 ? -1 : w;
  };
  for (let i = 0; i < W * b.head.H; i++) {
    const p1 = plotAt(b, i);
    const now = (p1[P.owner] as number) === local ? -1 : completed(a, b, i);
    const was = prev && (plotAt(a, i)[P.owner] as number) === local ? completed(prev, a, i) : -1;
    const w = now >= 0 ? now : was;
    if (w < 0) continue;
    const wid = engineId('wonder', cat.buildings[w], 'BUILDING_', BUILT_WONDERS);
    of(p1[P.owner] as number).events.push([`wonder ${strip(cat.buildings[w], 'BUILDING_')}`,
      (st, seat) => wonderMoment(st, seat, wid ? WONDER_ERA_INDEX[wid] ?? 0 : 0)]);
  }
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0) continue;
    if (!(num(p0.pantheon) >= 0) && num(p1.pantheon) >= 0) of(p1.id).events.push(['pantheon', pantheonMoment]);
    if (!(num(p0.religionCreated) >= 0) && num(p1.religionCreated) >= 0) of(p1.id).events.push(['religion', religionMoment]);
  }
  // a Great Person newly the player's: a Great Person unit new at t+1, or a
  // class's points spent across the pair (one claimed and activated before
  // t+1 shows its unit); the record names no individual, so the person is
  // read as of the game era
  const gp = (st: GameState, seat: number) => greatPersonMoment(st, seat, st.gameEra ?? 0, null);
  const before = new Set(a.units.map((u) => `${u.owner}:${u.id}`));
  const gpUnits = new Map<number, number>();
  for (const u of b.units) {
    const name = cat.units[u.type] ?? '';
    if (!before.has(`${u.owner}:${u.id}`) && name.startsWith('UNIT_GREAT_')) {
      of(u.owner).events.push([`great person ${strip(name, 'UNIT_GREAT_')}`, gp]);
      gpUnits.set(u.owner, (gpUnits.get(u.owner) ?? 0) + 1);
    }
  }
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0 || !bool(p1.major) || !Array.isArray(p0.gpp) || !Array.isArray(p1.gpp)) continue;
    const spent = p1.gpp.filter((v, k) => num(v) < num(p0.gpp[k])).length;
    for (let n = gpUnits.get(p1.id) ?? 0; n < spent; n++) of(p1.id).events.push(['great person (points spent)', gp]);
  }
  // a barbarian camp gone from its plot: the major whose unit stands there
  // at t+1 destroyed it
  const campIdx = cat.improvements.indexOf('IMPROVEMENT_BARBARIAN_CAMP');
  for (let i = 0; campIdx >= 0 && i < W * b.head.H; i++) {
    if (plotAt(a, i)[P.improvement] !== campIdx || plotAt(b, i)[P.improvement] === campIdx) continue;
    const by = b.units.find((u) => u.y * W + u.x === i && b.players.some((p) => p.id === u.owner && bool(p.major)));
    if (by) of(by.owner).events.push([`camp ${i}`, (st, seat) => campMoment(st, seat, i)]);
  }
  for (const [i, by] of villagesEntered(a, b, cat)) of(by).events.push([`village ${i}`, goodyMoment]);
  // each Eureka and Inspiration the player newly holds
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0 || !bool(p1.major)) continue;
    for (const [field, names, kind] of [['techBoosts', cat.techs, DED_FREE_INQUIRY],
      ['civicBoosts', cat.civics, DED_PEN_BRUSH_AND_VOICE]] as const) {
      for (let k = 0; k < String(p1[field] ?? '').length; k++) {
        if (!boostedAcross(p0, p1, field, k)) continue;
        of(p1.id).events.push([`boost ${strip(names[k] ?? String(k), field === 'techBoosts' ? 'TECH_' : 'CIVIC_')}`,
          (st, seat) => dedicationEvent(st, seat, kind)]);
      }
    }
  }
  // the Diplomatic Victory resolution a new session passed for its target
  for (const r of Object.values(b.congress ?? {})) {
    if (typeof r !== 'object' || !r || !r.IsNew) continue;
    if (r.ChosenOption !== 'LOC_WORLD_CONGRESS_ADD_DIPLOVICTORY_DESC') continue;
    const pid = Number(r.ChosenThing);
    if (Number.isFinite(pid)) of(pid).events.push(['diplomatic victory points', diploVictoryMoment]);
  }
  return out;
}

/**
 * The once moments of an imported state: each major records, unpaid, the
 * keys the history carries for its player, every key it holds now, and the
 * near-a-feature founding keys of each city it founded; the city-states'
 * research eras join the world's (`recordMoments`).
 */
export function seedMoments(state: GameState, imp: Imported, history?: History): void {
  const world = new Set<number>(history?.momentsWorld ?? []);
  for (const [pid, seat] of imp.seatOfPlayer) {
    const s = seatOf(state, seat);
    if (!s || !isCiv(seat) || !('cities' in s)) continue;
    const ks = new Set([...(history?.moments.get(pid) ?? []), ...momentKeysHeld(state, seat)]);
    for (const c of s.cities) {
      if ((c.founderSeat ?? seat) !== seat) continue;
      for (const k of foundingKeys(state, seat, c.centerIndex)) if (k !== LARGEST_KEY) ks.add(k);
    }
    s.moments = [...ks].sort((x, y) => x - y);
    for (const k of ks) world.add(k);
  }
  for (const c of state.cityStates) researchKeys(c.research.techs, c.research.civics, world);
  state.momentsWorld = [...world].sort((x, y) => x - y);
}

/** the Moments rows the engines record (each one's `eras.moment.*` source) */
const RECORDED_MOMENTS = new Set(SRC_REGISTRY.filter((r) => r.name.startsWith('eras.moment.') && 'xml' in r.src
  && r.src.col === 'EraScore').map((r) => (r.src as { where: string }).where.replace('MomentType=', '')));
/** what the record cannot show of a recorded moment: no plot's revealed
 *  state, no Trading Post, no patronage's purse */
const RECORD_BLIND_MOMENTS = new Set([
  'MOMENT_FIND_NATURAL_WONDER', 'MOMENT_FIND_NATURAL_WONDER_FIRST_IN_WORLD',
  'MOMENT_TRADING_POST_CONSTRUCTED_IN_EVERY_CIV', 'MOMENT_TRADING_POST_CONSTRUCTED_IN_EVERY_CIV_FIRST_IN_WORLD',
  'MOMENT_GREAT_PERSON_CREATED_PATRONAGE_FAITH_OVER_HALF', 'MOMENT_GREAT_PERSON_CREATED_PATRONAGE_GOLD_OVER_HALF',
]);

/** the gaps a pair's own moments leave the comparison: a paying row the
 *  engines do not record, or one the record cannot show */
function momentGaps(moments: readonly [number, string, number, number][]): string[] {
  return moments.filter((m) => m[2] !== 0 && (!RECORDED_MOMENTS.has(m[1]) || RECORD_BLIND_MOMENTS.has(m[1])))
    .map((m) => `moment:${strip(m[1], 'MOMENT_')}`);
}

/**
 * THE ERA CHECKS. `step.eraScore`: each major's era-score change across the
 * pair against what the engine's own era-score functions pay on the imported
 * turn-t state for the events the difference shows (`addEraScore` per moment,
 * `buildingDedications` per completed building). `era.begin`: on a pair where
 * the game or the engine's countdown (`eraCountdownStep` over the history's
 * countdown and t+1's player eras) begins a new era, whether both do.
 * `era.age` / `era.bars`: on the pair a new era begins across, the engine's
 * `enterEra` run on the imported turn-t+1 state carrying turn t's ages and
 * bars (the game judges the score and counts the cities its turn ended
 * with) against the age the game gave each major and the bars it fixed.
 */
function eraChecks(a: TurnRecord, b: TurnRecord, cat: Catalog, late: Set<number>, history?: History,
  prev?: TurnRecord): CheckResult[] {
  const out: CheckResult[] = [];
  const turn = a.turn;
  const imp = importTurn(a, cat, history);
  const state = imp.state;
  const events = eraEvents(a, b, cat, prev);
  const ib = importTurn(b, cat, history);
  seedMoments(state, imp, history);
  for (const p0 of a.players) {
    if (!bool(p0.major)) continue;
    const p1 = b.players.find((q) => q.id === p0.id);
    const seat = imp.seatOfPlayer.get(p0.id)!;
    const subject = `seat ${p0.id} ${String(p0.civ)}`;
    if (!p1 || late.has(p0.id)) {
      out.push({ turn, check: 'step.eraScore', subject, ok: true, skip: !p1 ? 'no t+1' : 'a turn start missing from a record' });
      continue;
    }
    const s = state.seats[seat];
    const seatB = ib.seatOfPlayer.get(p0.id);
    // dedications first held at t+1 were chosen across the pair (an era
    // begun) and pay for its events
    const picksB = seatB === undefined ? [] : ib.state.seats[seatB].dedicationPicks ?? [];
    if (!(s.dedicationPicks ?? []).length && picksB.length) {
      s.dedicationPicks = [...picksB];
      s.dedications = picksB.length;
    }
    const was = s.eraScore ?? 0;
    const ev = events.get(p0.id) ?? { events: [], buildings: [] };
    for (const [, pay] of ev.events) pay(state, seat);
    for (const id of ev.buildings) buildingDedications(state, seat, id);
    // the once moments: every key the seat holds at t+1 and had not
    // recorded, and the founding keys of each city it founded across the pair
    // as t+1 counts its cities
    const held = new Set(seatB === undefined ? [] : momentKeysHeld(ib.state, seatB));
    for (const c of seatB === undefined ? [] : citiesOf(ib.state, seatB)) {
      if (!state.seats.some((x) => x.cities.some((q) => q.centerIndex === c.centerIndex))
        && !state.cityStates.some((x) => x.centerIndex === c.centerIndex)) {
        for (const k of foundingKeys(ib.state, seatB!, c.centerIndex)) held.add(k);
      }
    }
    const once = [...held].sort((x, y) => x - y).filter((k) => !(s.moments ?? []).includes(k));
    for (const k of once) recordMoment(state, seat, k);
    const ours = (s.eraScore ?? 0) - was;
    const game = num(p1.eraScore) - num(p0.eraScore);
    // the game's own moments across the pair, where the record carries them:
    // [id, MomentType, era score, turn] rows t+1 holds and t does not
    const seen = new Set((Array.isArray(p0.moments) ? p0.moments : []).map((m) => m[0]));
    const fresh = (Array.isArray(p1.moments) ? p1.moments : []).filter((m) => !seen.has(m[0]));
    const moments = fresh.map((m) => `${strip(m[1], 'MOMENT_')} ${m[2]}`);
    // what era score reads of the imported seat: its leader (a civilization's
    // own moments), the dedications it holds, the buildings its cities hold,
    // and the pair's moments the engines do not record or the record cannot show
    const gaps = [...new Set([...(s.civ < 0 ? ['leader'] : []),
      ...[...(imp.seatGaps.get(seat) ?? []), ...(seatB === undefined ? [] : ib.seatGaps.get(seatB) ?? [])]
        .filter((g) => g.startsWith('commemoration:')),
      // the player has met every living major by t+1 and had not at t: the
      // engines hold no contact between majors (PLAYER_MET_ALL_MAJORS)
      ...(metAllAcross(a, b, p0, p1) ? ['moment:PLAYER_MET_ALL_MAJORS'] : []),
      // a record without dedications past the Ancient era (which offers none)
      ...(!Array.isArray(p0.commemorations) && (state.gameEra ?? 0) > 0 ? ['commemorations'] : []),
      ...[...imp.cityByKey].filter(([, c]) => c.seat === seat)
        .flatMap(([k]) => [...(imp.cityGaps.get(k) ?? [])].filter((g) => g.startsWith('building:'))),
      ...momentGaps(fresh),
      // a natural wonder's moment over a map whose wonder the importer dropped
      ...(fresh.some((m) => m[1].includes('NATURAL_WONDER'))
        ? [...imp.gaps.keys()].filter((g) => g.startsWith('feature:')) : []),
      // a record without moments: the Astrology Eureka (BOOST_TRIGGER_FIND_NATURAL_WONDER)
      // says a natural wonder was found, the record not which
      ...(!Array.isArray(p1.moments) && boostedAcross(p0, p1, 'techBoosts', cat.techs.indexOf('TECH_ASTROLOGY'))
        ? ['moment:FIND_NATURAL_WONDER'] : [])])];
    out.push({ turn, check: 'step.eraScore', subject, ok: ours === game, game, ours,
      ...(gaps.length ? { gaps } : {}),
      ...(ours === game ? {} : { state: { events: ev.events.map(([w]) => w), once: once.map((k) => momentKeyId(k)),
        buildings: ev.buildings, ...(Array.isArray(p1.moments) ? { moments } : {}) } }) });
  }
  // what the next pair starts from: each major's recorded keys, and those
  // it holds at t+1 (a pair skipped records them unpaid)
  if (history) {
    const world = new Set(state.momentsWorld ?? []);
    for (const p0 of a.players) {
      const seat = imp.seatOfPlayer.get(p0.id);
      const seatB = ib.seatOfPlayer.get(p0.id);
      if (!bool(p0.major) || seat === undefined || seatB === undefined) continue;
      const ks = new Set([...(state.seats[seat]?.moments ?? []), ...momentKeysHeld(ib.state, seatB)]);
      history.moments.set(p0.id, [...ks].sort((x, y) => x - y));
      for (const k of ks) world.add(k);
    }
    history.momentsWorld = [...world].sort((x, y) => x - y);
  }
  const began = eraBegan(a, b);
  if (history) {
    const ours = eraCountdownStep(history.gameEra, history.eraStartTurn, history.eraCountdown, b.turn, majorEras(b))
      === ERA_BEGINS;
    if (ours || began) {
      out.push({ turn, check: 'era.begin', subject: 'game', ok: ours === began, game: began, ours,
        ...(ours === began ? {} : { state: { era: history.gameEra, start: history.eraStartTurn,
          countdown: history.eraCountdown, eras: majorEras(b) } }) });
    }
  }
  if (began) {
    const st = ib.state;
    for (const p0 of a.players) {
      if (!bool(p0.major)) continue;
      const seat = ib.seatOfPlayer.get(p0.id);
      if (seat === undefined) continue;
      const s = st.seats[seat];
      const was = ageOf(p0);
      s.age = was >= AGE_GOLDEN_ONLY ? AGE_GOLDEN : was === AGE_DARK ? 0 : 1;
      s.darkBar = num(p0.darkThreshold);
      s.goldenBar = num(p0.goldenThreshold);
    }
    enterEra(st);
    for (const p1 of b.players) {
      if (!bool(p1.major)) continue;
      const seat = ib.seatOfPlayer.get(p1.id);
      if (seat === undefined) continue;
      const s = st.seats[seat];
      const subject = `seat ${p1.id} ${String(p1.civ)}`;
      const ours = s.age === AGE_GOLDEN ? (s.prevAge === 0 ? AGE_HEROIC : AGE_GOLDEN_ONLY) : s.age === 0 ? AGE_DARK : AGE_NORMAL;
      const game = ageOf(p1);
      const p0 = a.players.find((q) => q.id === p1.id);
      const why = { score: s.eraScore ?? 0, cities: citiesOf(st, seat).length, dark: s.darkAges ?? 0,
        golden: s.goldenAges ?? 0, wasDark: num(p0?.darkThreshold), wasGolden: num(p0?.goldenThreshold) };
      out.push({ turn, check: 'era.age', subject, ok: ours === game,
        game: AGE_NAMES[game], ours: AGE_NAMES[ours], ...(ours === game ? {} : { state: why }) });
      const gameBars = [num(p1.darkThreshold), num(p1.goldenThreshold)];
      const ourBars = [s.darkBar ?? 0, s.goldenBar ?? 0];
      const same = gameBars[0] === ourBars[0] && gameBars[1] === ourBars[1];
      out.push({ turn, check: 'era.bars', subject, ok: same, game: gameBars, ours: ourBars,
        ...(same ? {} : { state: why }) });
    }
  }
  return out;
}

const AGE_NAMES = ['dark', 'normal', 'golden', 'heroic'];
