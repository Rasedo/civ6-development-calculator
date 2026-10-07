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
import { NO_SEAT } from '../core/types';
import { congressBorderFrozen } from '../core/congress';
import { spreadFromUnit } from '../core/unitOrders';
import { borderBestPlots, cityCentreYields, cityPlotBonus, cityTourism, cityYieldCtx, computeCityStats, buildingMaintenance, districtMaintenance, luxuryAmenities, refreshParkAmenities, seatTourism, seatTourismReligious } from '../core/city';
import { buildingPillaged, tileYields } from '../core/yields';
import { baseYieldCtx, computeUnlocks, getModifiers, goldPrice, makeYieldCtx, unitUpkeep } from '../core/effects';
import { centreStrength, cityDefenseStrength } from '../core/combat';
import { minorCity, resolveSuzerains, suzerainMinorSeats } from '../core/cityStates';
import { applyLoyalty, cityBorderGrowth, cultureAfterGrowth, districtSiteCost, loyaltyPerTurn } from '../core/phase';
import { seatGrowth, lumpFood, lumpGrowth } from '../core/seatTurn';
import { buildingFaithPrice, unitFaithPrice, buildingPurchaseCost, settlerCost, gpActivatedPressure, pressureFromCity, religiousUnitLost, spreadReligiousPressure, tilePurchaseCost, unitProdCost, unitGoldPrice, unitStepCost, unitsAcquired, wallsGoldBlocked } from '../core/game';
import { buildingCostIn, buildingFullCost } from '../core/rules';
import { builderCost, spawnUnit, traderCost, unitDomain, unitReligious } from '../core/units';
import { minorRouteOriginYields, routeDestYields, routeOriginYields, routeYieldCut } from '../core/trade';
import { monumentalityBuyMult } from '../core/eras';
import { FREE_SEAT, hiddenResourcesFor, isCityStateSeat, seatOf, setTileOwner, BARB_SEAT, tileBelongsTo, tileClaimed } from '../core/seats';
import { establishedGovernorCityIds, governorClocks, governorFlag } from '../core/governors';
import { chopGrant, harvestGrant, type LumpGrant } from '../core/economy';
import { growthFoodNeeded, amenityTierIndex, AMENITY_TIERS, BORDER_MAX_RADIUS, GOLD_PURCHASE_MULT, WONDER_FREE_TILES } from '../data/constants';
import { CITIZEN_NAMED_UNITS, PROMO_OFFER_UNITS, UNITS, UNIT_HP } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { gainPopulationPressure } from '../data/religion';
import type { DistrictId, FeatureId, YieldKey } from '../../world/types';
import { YIELD_KEYS } from '../../world/types';
import { RESOURCES, resourceImprovement } from '../../world/resources';
import { unitResourceCost } from '../core/stockpile';
import { hexDistance, neighbors, tilesWithin } from '../../world/hex';
import { P, bool, num, plotAt, revealedPlots, type Catalog, type DumpCity, type DumpPlayer, type Read, type TurnRecord } from './record';
import { Civ6Random, drawsBetween } from './civ6Random';
import { placeCitizens, replaceAllCitizens, standingFlags, type YieldFlags } from './citizens';
import { FIRE_BURNING_FEATURE, FIRE_BURNT_FEATURE, FIRE_START_FEATURE } from '../data/disasters';
import type { LoggedDraw } from './randLog';
import { DRAW_SITES, siteLabel } from './drawSites';
import {
  AGE_DARK, AGE_GOLDEN_ONLY, AGE_HEROIC, AGE_NORMAL, PURCHASE_PLOT_HASH, ageOf, congressOfRecord, engineFeature, engineRowOf, eraBegan, importTurn, leviesAcross, majorEras, notStarted, citiesNotStarted, recordMap, recordRoutes, routeChanges, routeKey, lapsedCards,
  type History, type Imported, type LuxCards, wearyAt,
} from './import';
import {
  ERA_BEGINS, buildingDedications, campMoment, canalMoment, diploVictoryMoment, levyMoment, metAllMajorsMoment, newContinent, enterEra, eraCountdownStep, foundingKeys,
  dedicationEvent, foundingMoments, goodyMoment, greatPersonMoment, pantheonMoment, religionMoment, transferMoments,
  wonderMoment,
} from '../core/eras';
import { LARGEST_KEY, districtMoment, improvementMoment, mitigatedFloodMoment, momentKeyId, momentKeysHeld, recordMoment, researchKeys } from '../core/moments';
import { citiesOf, isCiv, tileSeat } from '../core/seats';
import { riverReach, riverShield } from '../core/disasters';
import { AGE_GOLDEN, DED_COINAGE, DED_FREE_INQUIRY, DED_MONUMENTALITY, DED_PEN_BRUSH_AND_VOICE, goldShortfall } from '../data/seats';
import { SRC_REGISTRY } from '../data/provenance';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../data/builtWonders';
import { engineId, gameHash } from './aliases';
import { GOODY_SUBTYPES, type GoodySubType } from '../data/goodyHuts';
import { unitPromoRows } from '../core/promotions';
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
// H1_STRICT=1: every tolerance narrows to half the game's 1/256 step, so a
// pass is the game's own value, not one near it
const STRICT_TOL = process.env.H1_STRICT === '1' ? 1 / 512 : Infinity;
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= Math.min(tol, STRICT_TOL);
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

/** whether a Border Control Treaty froze the seat's borders on the session
 *  its last turn read (`Imported.congressOf`) */
function frozenAtLastTurn(state: GameState, imp: Imported, seat: number): boolean {
  const now = state.congress;
  state.congress = imp.congressOf(seat);
  const frozen = congressBorderFrozen(state, seat);
  state.congress = now;
  return frozen;
}

/** the checks a worked plot's yields feed — its Food the loyalty a starving
 *  city loses too: an unseen event draw on it is their gap alone */
const EVENT_DRAW_READERS = new Set(['city.yields', 'city.centreYields', 'city.foodSurplus', 'step.growth', 'city.loyaltyPerTurn', 'step.loyalty',
  'step.minorGrowth']);

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

/** the border pick's label in the game's log (0x1ab1c0) */
const PICKER = 'GetNextBuyablePlot picker';

/** One row of a record's event log (`actions`, `tools/civ6lab/h1/h1_actions.lua`):
 *  [sequence, turn, the `Events` name, ...the handler's arguments]. */
type ActionRow = (number | string | boolean | null)[];

/** The city's favored / disfavored yields as the record holds them
 *  (`YieldFlags`), '' where the record carries none. */
function recordFlags(c: DumpCity): YieldFlags {
  if (!c.favored && !c.disfavored) return '';
  return [0, 1, 2, 3, 4, 5].map((i) => (c.favored?.includes(i) ? 'F' : c.disfavored?.includes(i) ? 'D' : '.')).join('');
}


/** The rows of the record's event log that player `p`'s turn `t` fired
 *  before its PlayerTurnActivated: its start (the city turns in the player's
 *  city order, then what the AI does before the activation fires), from the
 *  last turn boundary before it. Undefined where the record carries no log
 *  or the log holds no activation of `p` at `t`. */
function startRows(rec: TurnRecord, p: number, t: number): ActionRow[] | undefined {
  const rows = (rec as TurnRecord & { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return undefined;
  const all = rows as ActionRow[];
  const end = all.findIndex((r) => r[1] === t && r[2] === 'PlayerTurnActivated' && r[3] === p);
  if (end < 0) return undefined;
  let from = end;
  while (from > 0 && all[from - 1][2] !== 'PlayerTurnDeactivated' && all[from - 1][2] !== 'PlayerTurnActivated') from--;
  return all.slice(from, end);
}

/** The plots unowned in the record before that the record's event log shows
 *  changing hands after player `p`'s PlayerTurnActivated of turn `t`. */
function takenAfterStart(rec: TurnRecord, before: TurnRecord, p: number, t: number): number[] {
  const rows = (rec as TurnRecord & { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return [];
  const all = rows as ActionRow[];
  const end = all.findIndex((r) => r[1] === t && r[2] === 'PlayerTurnActivated' && r[3] === p);
  if (end < 0) return [];
  const W = rec.head.W;
  const out: number[] = [];
  for (const r of all.slice(end + 1)) {
    if (r[2] !== 'CityTileOwnershipChanged') continue;
    const i = (r[6] as number) * W + (r[5] as number);
    if (num(plotAt(before, i)[P.owner] as Read<number>) < 0) out.push(i);
  }
  return out;
}

/** The barbarian camps the record before holds and the record does not that
 *  still stood at player `p`'s start of turn `t`: the event log removes each
 *  at or after the start's first row (runs/h1_duelw1123 t124: the camp on
 *  440 cleared in China's actions — at Beijing's closing pick it still
 *  priced 440 out, the pick fell on 616). */
function campsAtStart(rec: TurnRecord, before: TurnRecord, cat: Catalog, p: number, t: number): number[] {
  const rows = (rec as TurnRecord & { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return [];
  const all = rows as ActionRow[];
  const end = all.findIndex((r) => r[1] === t && r[2] === 'PlayerTurnActivated' && r[3] === p);
  if (end < 0) return [];
  let from = end;
  while (from > 0 && all[from - 1][2] !== 'PlayerTurnDeactivated' && all[from - 1][2] !== 'PlayerTurnActivated') from--;
  const W = rec.head.W;
  const camp = (r: TurnRecord, i: number) => cat.improvements[plotAt(r, i)[P.improvement] as number] === 'IMPROVEMENT_BARBARIAN_CAMP';
  const out: number[] = [];
  for (let i = 0; i < W * rec.map.length; i++) {
    if (!camp(before, i) || camp(rec, i)) continue;
    const k = all.findIndex((r) => r[2] === 'ImprovementRemovedFromMap' && (r[4] as number) * W + (r[3] as number) === i);
    if (k >= from) out.push(i);
  }
  return out;
}

/** the civics whose first completion in the game lays the dig sites */
const DIG_CIVICS = ['CIVIC_NATURAL_HISTORY', 'CIVIC_CULTURAL_HERITAGE'];

/** the fire's features, which the turn's climate step lays and lifts */
const FIRE_FEATURES = new Set(['BURNING_WOODS', 'BURNT_WOODS', 'BURNING_RAINFOREST', 'BURNT_RAINFOREST']);
/** the quest types' own pickers, each drawn after a city-state's quest pick
 *  of its type (`DRAW_SITES`) */
const QUEST_PICKERS = Object.keys(DRAW_SITES).filter((l) => /^Choosing random .* quest$/.test(l));

/** the plots holding an Antiquity Site or a Shipwreck in the record that
 *  held none in the record before */
function newDigSites(rec: TurnRecord, before: TurnRecord, cat: Catalog): number {
  const dig = (r: TurnRecord, i: number) => /^RESOURCE_(ANTIQUITY_SITE|SHIPWRECK)$/.test(cat.resources[plotAt(r, i)[P.resource] as number] ?? '');
  let n = 0;
  for (let i = 0; i < rec.head.W * rec.map.length; i++) if (dig(rec, i) && !dig(before, i)) n++;
  return n;
}

/** The Tribal Villages a city's culture claims take in a start's event rows:
 *  each GoodyHutReward row with no unit (player -1) whose next
 *  CityTileOwnershipChanged is the city's — the subtype it paid, by its
 *  type hash. */
function villageClaims(win: ActionRow[], p: number, city: number): GoodySubType[] {
  const out: GoodySubType[] = [];
  win.forEach((r, k) => {
    if (r[2] !== 'GoodyHutReward' || r[3] !== -1) return;
    const claim = win.slice(k + 1).find((x) => x[2] === 'CityTileOwnershipChanged');
    if (!claim || claim[3] !== p || claim[4] !== city) return;
    const sub = GOODY_SUBTYPES.find((s) => gameHash(`GOODYHUT_${s.id}`) === r[6]);
    if (sub) out.push(sub);
  });
  return out;
}

/** the draws a village's reward takes after its kind and subtype: a boost
 *  each (0x4ca470 / 0x39c330), a free technology each (0x4caeb0) */
function goodyRewardDraws(sub: GoodySubType): string[] {
  const p = sub.payload;
  const n = 'amount' in p ? p.amount : 0;
  if (p.kind === 'techBoost') return Array(n).fill('Choosing random tech boost to grant based on era');
  if (p.kind === 'civicBoost') return Array(n).fill('Choosing random civic boost to grant based on era');
  if (p.kind === 'tech') return Array(n).fill('Choosing random tech to grant based on era');
  if (p.kind === 'relic') return Array(n).fill('Choosing a Relic');
  return [];
}

/** the rows an annexed plot's change of hands fires beside its own: a unit
 *  pushed off it or put out of a camp it clears, its improvement's owner and yields */
const ANNEX_SIDE_ROWS = new Set(['UnitTeleported', 'UnitAddedToMap', 'ImprovementChanged', 'ImprovementRemovedFromMap', 'ImprovementAddedToMap', 'PlotYieldChanged']);
/** the log's rows that lay, lift or pillage a plot's improvement */
const IMPROVEMENT_ROWS = new Set(['ImprovementAddedToMap', 'ImprovementRemovedFromMap', 'ImprovementChanged']);

/** The wonders a start's event rows (`startRows`) complete, by city key, each
 *  with the plots its annex took: the city's CityTileOwnershipChanged rows
 *  right before the WonderCompleted row (0x17f870 annexes before it signals
 *  the wonder; a BuildingChanged of the city, a unit the annex pushed off
 *  between), each one "GetNextBuyablePlot picker" draw; a list emptied
 *  draws no more (runs/h1_duelw1117 t217: Meenakshi at Xi'an with no plot
 *  in reach, no draw; 1123 t112 two; 1118 t227 Kotoku-in two, a Roman unit
 *  teleported between). */
function wondersInStart(win: ActionRow[], p: number, W: number, barbs: ReadonlySet<number>): Map<string, StartWonder[]> {
  const out = new Map<string, StartWonder[]>();
  win.forEach((r, k) => {
    if (r[2] !== 'WonderCompleted' || r[6] !== p) return;
    const city = r[7] as number;
    const annexed: number[] = [];
    let camps = 0;
    for (let j = k - 1; j >= 0; j--) {
      const q = win[j];
      if (q[2] === 'ImprovementRemovedFromMap' && barbs.has(q[5] as number)) camps++;
      if ((q[2] === 'BuildingChanged' && q[7] === city) || ANNEX_SIDE_ROWS.has(q[2] as string)) continue;
      if (q[2] !== 'CityTileOwnershipChanged' || q[3] !== p || q[4] !== city) break;
      annexed.push((q[6] as number) * W + (q[5] as number));
    }
    const key = `${p}:${city}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push({ building: r[5] as number, annexed, camps });
  });
  return out;
}

/** A wonder a start completes (`wondersInStart`): its building row, the
 *  plots its annex took, and the barbarian camps among them (a camp's
 *  plot annexed clears the camp, its unit put out — one "Barb Tribe Roll":
 *  runs/h1_duelw1121 t190, the Colossus at Longxi annexing 12,14) */
interface StartWonder {
  building: number;
  annexed: number[];
  camps: number;
}

/** One draw of a player's start: the DLL's label (the game's log names it
 *  so), what drew it (`note`), and for a city's closing pick its `owner:id`
 *  and the ties it draws over. `choice` marks a draw the player's AI takes
 *  or not by a plan the records do not show. */
export interface StartDraw {
  label: string;
  note?: string;
  city?: string;
  ties?: number[];
  /** other tie lists the records allow (a purchase before the pick or after
   *  it); the game's log, where held, chooses by its range */
  alts?: number[][];
  choice?: boolean;
  /** a choice drawn at its place among the fixed draws when taken */
  inPlace?: boolean;
}

/** A player's start of turn as the records give it: the draws between its
 *  witnesses' seeds (`game`, undefined without both seeds) and the draws
 *  the replay names (`draws`); `why` where a city of it is not imported. */
export interface StartReplay {
  player: number;
  turn: number;
  pre?: number;
  post?: number;
  game?: number;
  /** its cities' `owner:id`, in the player's city order */
  cities: string[];
  draws: StartDraw[];
  why?: string;
}

/**
 * THE START OF EACH PLAYER'S TURN, replayed on the game's generator
 * (`tools/civ6lab/dll_readings.md` "H-1: every draw of a player's start").
 * Between a player's PlayerTurnStarted (`pre`) and PlayerTurnStartComplete
 * (`post`) the game draws, in order:
 *  - before its cities, the AI's choices the records cannot place (`choice`):
 *    a city-state whose research or civic completed picks the next one
 *    ("BT Research Choice", "Random Civic Choice": a draw only once its plan
 *    is spent), and a great person the player recruited this turn draws its
 *    replacement ("Generating a random new Great Person": in the start or
 *    in the player's actions);
 *  - each city in the player's city order: a wonder its production
 *    completes annexes WONDER_FREE_TILES_UPON_COMPLETION plots, one
 *    "GetNextBuyablePlot picker" draw each (0x17f870 -> 0x1a8a30; an annex
 *    clears the stored next plot); the border turn (0x1a9bc0) that takes a
 *    plot draws afresh when the stored plot is gone; then the city draws its
 *    next plot, every turn, while one is in reach.
 * Each player's start is the latest the record witnessed (the record's own
 * turn for the seat it was taken on, the turn before for the players after
 * it), between the record before and this one: a wonder completed between
 * the two whose city's queue held it at its head with the banked production
 * and a turn's yield covering its price completed in the start; a city whose
 * culture price rose took a plot with its culture; its stored plot was gone
 * when the record before held none or another city holds it now. The
 * closing picks draw over `borderBestPlots` on the record's state.
 */
export function startDraws(rec: TurnRecord, state: GameState, imp: Imported, cat: Catalog): StartReplay[] {
  const out: StartReplay[] = [];
  const before = imp.recordBefore;
  const latest = new Map<number, number>();
  for (const w of rec.witness ?? []) latest.set(w.player, Math.max(latest.get(w.player) ?? -1, w.turn));
  const wit = (rec.witness ?? []).filter((w) => w.turn === latest.get(w.player));
  const W = rec.head.W;
  const doneBefore = new Set<number>();
  if (before) {
    before.map.forEach((row, y) => row.forEach((p, x) => { if ((p[P.wonder] as number) >= 0 && p[P.wonderComplete] === 1) doneBefore.add(y * W + x); }));
  }
  for (const post of wit.filter((w) => w.point === 'post')) {
    const p = post.player;
    const pre = wit.find((w) => w.point === 'pre' && w.player === p);
    const a = typeof pre?.seed === 'number' ? pre.seed >>> 0 : undefined;
    const b = typeof post.seed === 'number' ? post.seed >>> 0 : undefined;
    const r: StartReplay = { player: p, turn: post.turn, pre: a, post: b, game: a !== undefined && b !== undefined ? drawsBetween(a, b, 4096) : undefined,
      cities: post.cities.map((c) => `${p}:${num(c.id)}`), draws: [] };
    out.push(r);
    // the start's own rows of the record's event log, where it carries one
    const win = startRows(rec, p, post.turn);
    // the units a wonder of the start granted, by type
    const granted = new Map<string, number>();
    // a start of the turn before the record's: the plots gained after it
    // stand unowned at its picks (`lateClaims`)
    const lc = post.turn < rec.turn && before ? lateClaims(rec, before, imp, p, latest)
      : { late: [], unsure: [], claims: new Map<string, number[]>() };
    const { claims } = lc;
    // and every plot the event log shows changing hands after the start —
    // unowned in the record before — stood unowned at it (runs/h1_duelw1120
    // t21: Muscat's 826 and 829, annexed for China's envoys in its start of
    // t22, open at Muscat's pick)
    const undo = [...new Set([...lc.late, ...(before ? takenAfterStart(rec, before, p, post.turn) : [])])]
      .filter((i) => state.map.tiles[i].ownerSeat !== NO_SEAT);
    // a wonder's annex in the start: its plots join the city before its
    // closing pick, after the picks of the cities before it
    const wonders = win ? wondersInStart(win, p, W, new Set(rec.players.filter((x) => bool(x.barb)).map((x) => x.id))) : undefined;
    const annexedAll = new Set<number>();
    for (const [key, ws] of wonders ?? []) {
      for (const w of ws) {
        for (const q of w.annexed) annexedAll.add(q);
        if (!claims.has(key)) claims.set(key, []);
        claims.get(key)!.push(...w.annexed);
      }
    }
    // every plot the event log shows a city of the player taking in the start
    // and no purchase paying for: its culture claim, before its closing pick
    // (runs/h1_duelw1117 t177: Xi'an's claim of 513 after the Colossus's
    // annex cleared its stored plot)
    const bought = new Set((win ?? []).filter((x) => x[2] === 'CityMadePurchase' && x[7] === PURCHASE_PLOT_HASH)
      .map((x) => (x[6] as number) * W + (x[5] as number)));
    const startTaken = new Set(annexedAll);
    for (const x of win ?? []) {
      if (x[2] !== 'CityTileOwnershipChanged' || x[3] !== p) continue;
      const q = (x[6] as number) * W + (x[5] as number);
      if (bought.has(q) || annexedAll.has(q)) continue;
      const key = `${p}:${x[4]}`;
      if (!claims.has(key)) claims.set(key, []);
      if (!claims.get(key)!.includes(q)) claims.get(key)!.push(q);
      startTaken.add(q);
    }
    const unsure = lc.unsure.filter((q) => !startTaken.has(q));
    const kept = undo.map((i) => [state.map.tiles[i].ownerSeat, state.map.tiles[i].ownerCity] as const);
    for (const i of undo) { state.map.tiles[i].ownerSeat = NO_SEAT; state.map.tiles[i].ownerCity = -1; }
    // the camps cleared after the start stood at its picks
    const standing = before && state.barbSeat ? campsAtStart(rec, before, cat, p, post.turn) : [];
    state.barbSeat?.camps.push(...standing);
    // a start of the turn before stood before the turn's climate step: a
    // fire's woods burning, burnt or grown back since read as the record
    // before left them (runs/h1_duelw1117 t187: Antananarivo's pick of 340
    // over 341, Burnt Woods then, Woods by the record)
    const refeat: [number, FeatureId | null][] = [];
    if (before && post.turn < rec.turn) {
      for (const t of state.map.tiles) {
        const was = engineFeature(cat, plotAt(before, t.index)[P.feature] as number);
        if (was === t.feature || !(FIRE_FEATURES.has(was ?? '') || FIRE_FEATURES.has(t.feature ?? ''))) continue;
        refeat.push([t.index, t.feature]);
        t.feature = was;
      }
    }
    const minor = imp.minorOfPlayer.get(p);
    if (minor && pre) {
      if (num(pre.researching) !== num(post.researching)) r.draws.push({ label: 'BT Research Choice', choice: true });
      if (num(pre.civic) !== num(post.civic)) r.draws.push({ label: 'Random Civic Choice', choice: true });
    }
    for (const g of rec.greatPeople ?? []) {
      if (g[1] === p && g[4] === post.turn) r.draws.push({ label: 'Generating a random new Great Person', choice: true });
    }
    // a city-state the player meets in its start picks it a quest
    // ("Selecting a random new quest": runs/h1_duelw1117 t249, China meeting
    // Valletta as Xi'an's project completed; 1122 t226) — which quest, and
    // so which type picker follows, the records do not show: each picker a
    // choice (runs/h1_duelw1127 t61: China meets a city-state, a Train Unit
    // quest's unit type drawn after the pick)
    for (const x of win ?? []) {
      if (x[2] !== 'DiplomacyMeet' || x[3] !== p || !imp.minorOfPlayer.has(x[4] as number)) continue;
      r.draws.push({ label: 'Selecting a random new quest', note: 'met', choice: true });
      for (const label of QUEST_PICKERS) r.draws.push({ label, note: 'met', choice: true });
    }
    // the dig sites a revealing civic completed in the start lays (Game
    // Archaeology 0x27f640, once a game per kind: Natural History's
    // Antiquity Sites, Cultural Heritage's Shipwrecks): a site the game's
    // history of battles and camps places takes that event's era, any other
    // draws one ("Random Era for Antiquity Site", 0x2805f0 -> 0x280140) —
    // which ones the records do not show, so each new site of the record is
    // a choice (runs/h1_duelw1117 t217: four Shipwrecks, three draws)
    if (before && win?.some((x) => x[2] === 'CivicCompleted' && x[3] === p && DIG_CIVICS.includes(cat.civics[x[4] as number] ?? ''))) {
      for (let k = newDigSites(rec, before, cat); k > 0; k--) r.draws.push({ label: 'Random Era for Antiquity Site', note: 'dig site', choice: true });
    }
    // the envoys the player sent between the records — the AI sends them
    // in its start, before its cities, or in its actions (a choice): a
    // city-state that holds fewer plots past its starting ones than envoys
    // received annexes the rest (0x1abf40 -> AnnexPlots), one border pick
    // each (runs/h1_duelw1118 t33: Armagh's two for its two envoys from
    // China; t148, Kumasi's two before China's seven cities)
    if (before && !minor) {
      for (const m of rec.players) {
        if (!bool(m.minor)) continue;
        const was = before.players.find((x) => x.id === m.id);
        const sent = (q: DumpPlayer | undefined) => num((q?.envoysReceived ?? []).find(([g]) => g === p)?.[1] ?? 0);
        if (!was || sent(m) <= sent(was)) continue;
        const d = rec.cities.find((c) => c.owner === m.id);
        if (!d) continue;
        let gained = 0;
        for (const q of d.plots) if (num(plotAt(before, q)[P.owner] as Read<number>) !== m.id) gained++;
        for (let k = 0; k < Math.min(gained, sent(m) - sent(was)); k++) r.draws.push({ label: PICKER, note: 'envoy annex', city: `${m.id}:${d.id}`, choice: true, inPlace: true });
      }
    }
    for (const wc of post.cities) {
      const key = `${p}:${num(wc.id)}`;
      let city: City | undefined;
      let dump: DumpCity | undefined;
      if (minor) {
        const d = imp.dumpOfMinor.get(minor);
        if (d && d.id === num(wc.id)) { city = minorCity(minor); dump = d; }
      } else {
        city = imp.cityByKey.get(key);
        dump = city ? imp.dumpOfCity.get(city) : undefined;
      }
      if (!city || !dump) { r.why = 'a city the import does not hold'; continue; }
      const was = imp.cityBefore.get(key);
      let annexed = false;
      let claimed = false;
      if (was && before) {
        const q0 = was.queue?.[0];
        const head = typeof q0 === 'object' ? q0 : undefined;
        for (const q of dump.plots) {
          const gp = plotAt(rec, q);
          const w = gp[P.wonder] as number;
          if (w < 0 || gp[P.wonderComplete] !== 1 || doneBefore.has(q)) continue;
          // the event log names the start's completion and its annex; a
          // record without one: the wonder at the queue's head with the
          // banked production and a turn's yield covering its price (a
          // wonder no Gold buys carries no price in the record: its
          // completion at the queue's head is the start's), annexing
          // WONDER_FREE_TILES_UPON_COMPLETION plots
          let take: number = WONDER_FREE_TILES;
          if (wonders) {
            const done = wonders.get(key)?.find((x) => x.building === w);
            if (!done) continue;
            take = done.annexed.length;
            for (let k = 0; k < done.camps; k++) r.draws.push({ label: 'Barb Tribe Roll', note: 'camp annexed', choice: true });
          } else {
            const price = was.buy.find((x) => x[0] === 'B' && x[1] === w)?.[2];
            const inStart = head?.BuildingType === w
              && (price === undefined || num(was.queueProgress?.[0] ?? 0) + num(was.productionYield ?? 0) >= num(price));
            if (!inStart) continue;
          }
          for (let k = 0; k < take; k++) r.draws.push({ label: PICKER, note: 'wonder', city: key });
          annexed ||= take > 0;
          // the wonder's grants: the Dynastic Cycle's boosts of its era, a
          // wonder's free techs and civics (each pool may hold none: a
          // choice); a granted unit with a level offer shuffles its class's
          // rows (runs/h1_duelw1118 t224: Mahabodhi's two Apostles, 9..1
          // twice after the annex)
          const fx = BUILT_WONDERS[(cat.buildings[w] ?? '').replace(/^BUILDING_/, '')]?.effects;
          for (const row of getModifiers(state, city.seat).wonderEraBoost) {
            for (let k = 0; k < row.techs; k++) r.draws.push({ label: 'Choosing random tech boost to grant based on era', note: 'wonder', choice: true });
            for (let k = 0; k < row.civics; k++) r.draws.push({ label: 'Choosing random civic boost to grant based on era', note: 'wonder', choice: true });
          }
          for (let k = 0; k < (fx?.freeTechs ?? 0); k++) r.draws.push({ label: 'Choosing random tech to grant based on era', note: 'wonder', choice: true });
          for (let k = 0; k < (fx?.freeCivics ?? 0); k++) r.draws.push({ label: 'Choosing random civic to grant based on era', note: 'wonder', choice: true });
          for (let k = 0; k < (fx?.civicBoostsByEra?.amount ?? 0); k++) r.draws.push({ label: 'Choosing random civic boost to grant based on era', note: 'wonder', choice: true });
          for (const g of fx?.grantUnits ?? []) {
            if (!PROMO_OFFER_UNITS.includes(g.unit)) continue;
            granted.set(g.unit, (granted.get(g.unit) ?? 0) + g.count);
            for (let u = 0; u < g.count; u++) {
              for (let k = unitPromoRows({ type: g.unit }).length; k > 0; k--) r.draws.push({ label: 'Random Promotion', note: 'wonder grant' });
            }
          }
        }
        if (num(dump.nextPlotCost) > num(was.nextPlotCost)) {
          const stored = storedPlot(imp, key, p);
          const sp = stored >= 0 ? plotAt(rec, stored) : undefined;
          // the claim the event log names: the stored plot taken, or another
          // after a fresh pick (the record may hold the plot elsewhere by
          // then: runs/h1_duelw1123 t202, Shanghai's 914 taken in the start
          // and lost in the actions)
          const took = win?.filter((x) => x[2] === 'CityTileOwnershipChanged' && x[3] === p && x[4] === num(wc.id))
            .map((x) => (x[6] as number) * W + (x[5] as number)).filter((q) => !annexedAll.has(q));
          const gone = annexed || (took?.length ? !took.includes(stored)
            : !sp || num(sp[P.owner] as Read<number>) !== p || num(sp[P.ownerCity] as Read<number>) !== num(wc.id));
          if (gone) r.draws.push({ label: PICKER, note: 'stored plot gone', city: key });
          claimed = !gone;
        }
      }
      // a Tribal Village the city's culture claim takes pays its owner (the
      // event log's GoodyHutReward with no unit, the claim's row after it):
      // the kind and the subtype drawn, then the reward's own draws
      // (runs/h1_duelw1118 t189 Military / Resources, 1119 t84 Science /
      // One Tech Boost, 1123 t104 Faith / Large Faith)
      for (const reward of win ? villageClaims(win, p, num(wc.id)) : []) {
        r.draws.push({ label: 'Choosing a Goody Hut Type', note: 'village' });
        r.draws.push({ label: 'Choosing a Sub Type', note: 'village' });
        for (const label of goodyRewardDraws(reward)) r.draws.push({ label, note: 'village', choice: true });
      }
      // the start reads the session standing at it (`congressOf`: runs/h1_duelw1128
      // China t181, the Border Control Treaty its target until the session
      // that closes after its turn; no pick)
      const congressNow = state.congress;
      state.congress = imp.congressOf(city.seat);
      const frozen = congressBorderFrozen(state, city.seat);
      state.congress = congressNow;
      const ties = frozen ? [] : borderBestPlots(state, city);
      // a major's start of the turn before, its cities in order: the plots it
      // bought stand unowned at the pick (bought in its actions after it),
      // so do the culture claims of its cities after this one
      const after = new Set(post.cities.slice(post.cities.indexOf(wc) + 1).flatMap((c) => claims.get(`${p}:${num(c.id)}`) ?? []));
      const hide = minor || frozen ? [] : [...unsure, ...after];
      const seq = hide.length ? withoutOwners(state, hide, () => borderBestPlots(state, city)) : ties;
      // the plots the player gained by purchase between the records: in its
      // start, before this pick, or in its actions after it — the records do
      // not say which, so each choice's ties stand beside the record's
      const alts: number[][] = [];
      if (!frozen && unsure.length && unsure.length <= 4) {
        for (let m = 1; m < 2 ** unsure.length; m++) {
          const off = unsure.filter((_, k) => Math.floor(m / 2 ** k) % 2 !== 1);
          alts.push(withoutOwners(state, [...off, ...after], () => borderBestPlots(state, city)));
        }
      }
      // a start of the turn before: the record before left the plots as the
      // start found them, but for its own culture claim (\`startTies\`); the
      // record's own ties stand beside them
      const prior = post.turn < rec.turn ? imp.startTies.get(`${post.turn}:${key}`) : undefined;
      // (a city-state, whose plots come by its envoys during the turns
      // before its own, takes the record's first)
      const before0 = prior ? [claimed ? prior.claimed : prior.open] : [];
      const lists = (minor ? [ties, ...before0, ...alts] : [seq, ...alts, ties, ...before0]).filter((t) => t.length);
      const uniq = lists.filter((t, k) => lists.findIndex((x) => x.join() === t.join()) === k);
      // a city whose wonder annexed in the start reads its reach after the
      // annex: nothing left there, it draws nothing (runs/h1_duelw1118 t224:
      // Mahabodhi's annex took Beijing's 658 and 614, and no pick followed)
      // A city-state with nothing in reach on the record, the plots gained
      // after its start given back, drew nothing (runs/h1_duelw1118 t216:
      // Armagh's last plot, 1003, Handan's by China's turn before)
      const emptied = (!seq.length && (wonders?.get(key) ?? []).some((x) => x.annexed.length)) || (!!minor && !ties.length);
      if (uniq.length && !emptied) r.draws.push({ label: PICKER, note: 'next plot', city: key, ties: uniq[0], ...(uniq.length > 1 ? { alts: uniq.slice(1) } : {}) });
    }
    undo.forEach((i, k) => { state.map.tiles[i].ownerSeat = kept[k][0]; state.map.tiles[i].ownerCity = kept[k][1]; });
    if (standing.length) state.barbSeat!.camps.splice(state.barbSeat!.camps.length - standing.length, standing.length);
    for (const [i, f] of refeat) state.map.tiles[i].feature = f;
    // a unit the player gained between the records past a wonder's grants,
    // trained in its start or bought in its actions: a Spy's or an
    // Archaeologist's name ("Choosing a Citizen Name", 0x4eeb70: Units.Spy
    // or ExtractsArtifacts; runs/h1_duelw1118 t231, 1122 t202 an
    // Archaeologist trained in China's start) and, with a level offer, the
    // shuffle of its class's rows ("Random Promotion")
    // — the records' new units, or the start's own trained ones the event
    // log names (CityProductionCompleted of a unit: a Spy sent off at once
    // stands in no record, runs/h1_duelw1122 t129), whichever counts more
    if (before) {
      const had = new Set(before.units.filter((u) => u.owner === p).map((u) => u.id));
      const gained = new Map<string, number>();
      for (const u of rec.units) {
        const type = (cat.units[u.type] ?? '').replace(/^UNIT_/, '');
        if (u.owner !== p || had.has(u.id)) continue;
        if ((granted.get(type) ?? 0) > 0) { granted.set(type, granted.get(type)! - 1); continue; }
        gained.set(type, (gained.get(type) ?? 0) + 1);
      }
      const trained = new Map<string, number>();
      for (const x of win ?? []) {
        if (x[2] !== 'CityProductionCompleted' || x[3] !== p) continue;
        // a unit trained, or the unit a building completed grants
        // (runs/h1_duelw1124 t248: the Intelligence Agency's Spy)
        const type = x[5] === 0 ? (cat.units[x[6] as number] ?? '').replace(/^UNIT_/, '')
          : x[5] === 1 ? BUILDINGS[engineId('building', cat.buildings[x[6] as number] ?? '', 'BUILDING_', BUILDINGS) ?? '']?.grantUnit : undefined;
        if (type) trained.set(type, (trained.get(type) ?? 0) + 1);
      }
      for (const type of new Set([...gained.keys(), ...trained.keys()])) {
        for (let n = Math.max(gained.get(type) ?? 0, trained.get(type) ?? 0); n > 0; n--) {
          if (CITIZEN_NAMED_UNITS.includes(type)) r.draws.push({ label: 'Choosing a Citizen Name', note: 'unit', choice: true });
          if (!PROMO_OFFER_UNITS.includes(type)) continue;
          for (let k = unitPromoRows({ type }).length; k > 0; k--) r.draws.push({ label: 'Random Promotion', note: 'unit', choice: true });
        }
      }
    }
  }
  // the ties of every city whose start of this turn the next record
  // witnesses (every player but the one whose start this record holds):
  // as this record left the plots, and with the city's stored plot claimed
  const own = [...latest].filter(([, t]) => t === rec.turn).map(([q]) => q);
  const holders: [City, DumpCity][] = [...imp.dumpOfCity];
  for (const [m, d] of imp.dumpOfMinor) holders.push([minorCity(m), d]);
  for (const [city, d] of holders) {
    const key = `${d.owner}:${d.id}`;
    if (own.includes(d.owner) || congressBorderFrozen(state, city.seat)) continue;
    const openTies = borderBestPlots(state, city);
    const stored = num(d.nextPlot);
    let claimedTies = openTies;
    const t = stored >= 0 ? state.map.tiles[stored] : undefined;
    if (t && t.ownerSeat === NO_SEAT) {
      t.ownerSeat = city.seat;
      t.ownerCity = city.id;
      claimedTies = borderBestPlots(state, city);
      t.ownerSeat = NO_SEAT;
      t.ownerCity = -1;
    }
    imp.startTies.set(`${rec.turn}:${key}`, { open: openTies, claimed: claimedTies });
  }
  return out;
}

/**
 * The plots the record holds that player `p`'s start of the turn before
 * had not seen taken (`late`): plots unowned in the record before, gained
 * since by a player after `p` (its start and actions follow `p`'s) or by a
 * player whose start the record's own turn witnessed through that start's
 * culture claim; and the plots `p` gained other than its cities' culture
 * claims (`unsure`: a purchase the AI makes before its cities' turn or in
 * its actions after it). A city's claim is its stored plot where its
 * culture price rose; where the stored plot went elsewhere, every plot the
 * city gained is its claim.
 */
function lateClaims(rec: TurnRecord, before: TurnRecord, imp: Imported, p: number, latest: Map<number, number>):
  { late: number[]; unsure: number[]; claims: Map<string, number[]> } {
  const claims = new Map<string, number>();
  for (const c of rec.cities) {
    const was = imp.cityBefore.get(`${c.owner}:${c.id}`);
    if (!was || num(c.nextPlotCost) <= num(was.nextPlotCost)) continue;
    const stored = num(was.nextPlot);
    const sp = stored >= 0 ? plotAt(rec, stored) : undefined;
    const took = sp && num(sp[P.owner] as Read<number>) === c.owner && num(sp[P.ownerCity] as Read<number>) === c.id;
    claims.set(`${c.owner}:${c.id}`, took ? stored : -1);
  }
  const out: number[] = [];
  const unsure: number[] = [];
  const byCity = new Map<string, number[]>();
  const n = rec.head.W * rec.map.length;
  for (let i = 0; i < n; i++) {
    const now = num(plotAt(rec, i)[P.owner] as Read<number>);
    if (now < 0 || num(plotAt(before, i)[P.owner] as Read<number>) >= 0) continue;
    const claim = claims.get(`${now}:${num(plotAt(rec, i)[P.ownerCity] as Read<number>)}`);
    if (now > p) out.push(i);
    else if (now < p && (latest.get(now) ?? -1) === rec.turn && claim === i) out.push(i);
    else if (now === p && (claim === undefined || (claim >= 0 && claim !== i))) unsure.push(i);
    else if (now === p) {
      const key = `${now}:${num(plotAt(rec, i)[P.ownerCity] as Read<number>)}`;
      if (!byCity.has(key)) byCity.set(key, []);
      byCity.get(key)!.push(i);
    }
  }
  return { late: out, unsure, claims: byCity };
}

/** `fn` on the state with the plots `hide` unowned, their owners restored after. */
function withoutOwners<T>(state: GameState, hide: readonly number[], fn: () => T): T {
  const kept = hide.map((i) => [state.map.tiles[i].ownerSeat, state.map.tiles[i].ownerCity] as const);
  for (const i of hide) { state.map.tiles[i].ownerSeat = NO_SEAT; state.map.tiles[i].ownerCity = -1; }
  try {
    return fn();
  } finally {
    hide.forEach((i, k) => { state.map.tiles[i].ownerSeat = kept[k][0]; state.map.tiles[i].ownerCity = kept[k][1]; });
  }
}
/** The draws of a start the seeds account for: its fixed draws with as many
 *  of its AI's choices (all before its cities) as the count leaves, or null
 *  where no number of them lands on the seeds. */
export function resolveStart(s: StartReplay): StartDraw[] | null {
  if (s.game === undefined) return null;
  const fixed = s.draws.filter((d) => !d.choice);
  // the choices before the cities (a city-state's research and civic, a
  // recruit's replacement); the ones placed among them (a Spy, a wonder's
  // grants) only the log places
  const first = s.draws.filter((d) => d.choice && !d.note);
  const k = s.game - fixed.length;
  if (k < 0 || k > first.length) return null;
  return [...first.slice(0, k), ...fixed];
}

/** A city's closing pick (`startBorderPicks`): the plot drawn, the record's
 *  next plot, the ties, and with the game's log the logged draw's range. */
interface StartPick {
  pick: number;
  game: number;
  ties: number[];
  range?: number;
  /** placed on the game's log */
  logged?: boolean;
  /** the pick's plot another owner holds by the record: the city's best
   *  plots on the record, the reader's answer */
  lostTo?: number[];
}

/** Does the start's pick stand for the record's next plot? The pick is the
 *  record's plot; or the record holds none where a plot the city gained
 *  after the start cleared it (`nextPlotUnheld`), and the log's draw fell
 *  over the city's ties — the pick the record could not keep; or the pick
 *  went to another owner and the record names one of the city's best plots
 *  now. */
function pickHolds(sp: StartPick, unheld: boolean): boolean {
  if (sp.pick === sp.game) return true;
  if (unheld && sp.game < 0 && !!sp.logged && sp.range === sp.ties.length) return true;
  return !!sp.lostTo && sp.range === sp.ties.length && sp.lostTo.includes(sp.game);
}

/** The best plots of the city `key` (`owner:id`) on the imported record. */
function recordTies(imp: Imported, key: string): number[] {
  const city = imp.cityByKey.get(key);
  if (city) return borderBestPlots(imp.state, city);
  for (const [m, d] of imp.dumpOfMinor) if (`${d.owner}:${d.id}` === key) return borderBestPlots(imp.state, minorCity(m));
  return [];
}

/** A start's draws laid on the game's log of them (`LoggedStart`). */
export interface LoggedStart {
  /** the log's draws between the start's seeds */
  logged: LoggedDraw[];
  /** per replayed draw, the index in `logged` it lands on, -1 for none */
  at: number[];
  /** the logged draws no replayed draw lands on */
  extra: number[];
  /** the replayed draws whose range the log contradicts (a closing pick's
   *  ties against the logged range), by index in `draws` */
  range: number[];
  /** the logged draws the game's AI took (its choices), by index */
  ai: number[];
  /** the tie list the logged range chose among a draw's `alts`, by index */
  swap: Map<number, number[]>;
}

/** A start's draws laid on the game's log (`RandLog.between` its seeds):
 * its fixed draws in order, each on the next logged draw of its label; then
 * each AI choice or draw the records cannot place (`choice`) on the first
 * logged draw of its label left; then every logged draw left that the
 * game's AI takes (`DRAW_SITES` owner `ai`: an agenda, a city-state's
 * research) is the AI's. Every other logged draw landed on, every fixed draw
 * landing and every known range agreeing is the start replayed draw for
 * draw. */
export function logStart(s: StartReplay, logged: LoggedDraw[]): LoggedStart {
  // a choice drawn in place (an envoy's annex: the AI sends its envoys
  // before its cities, between them or after them) is taken as a run of
  // fixed draws at any place among the others, or left out — whichever lays
  // the start best on the log (runs/h1_duelw1118 t66: Caguana's annex after
  // China's four closing picks)
  const base = s.draws.map((_, n) => n).filter((n) => !s.draws[n].choice);
  const blocks: number[][] = [];
  s.draws.forEach((d, n) => {
    if (!d.inPlace) return;
    const last = blocks[blocks.length - 1];
    if (last && s.draws[last[0]].city === d.city) last.push(n);
    else blocks.push([n]);
  });
  let best: LoggedStart | undefined;
  let bestCost = Infinity;
  const tryOrder = (order: number[]) => {
    const l = layStart(s, logged, order);
    const cost = l.extra.length + l.range.length + s.draws.filter((d, n) => !d.choice && l.at[n] < 0).length;
    if (cost < bestCost) { best = l; bestCost = cost; }
  };
  const place = (b: number, order: number[]) => {
    if (b === blocks.length) { tryOrder(order); return; }
    for (let k = 0; k <= order.length && bestCost > 0; k++) place(b + 1, [...order.slice(0, k), ...blocks[b], ...order.slice(k)]);
    if (bestCost > 0) place(b + 1, order);
  };
  place(0, base);
  for (const [n, t] of best!.swap) s.draws[n].ties = t;
  return best!;
}

/** The start's draws on the log: the draws of `order` (indices in `draws`)
 *  as fixed draws in that order, then the other choices where their labels
 *  fall. */
function layStart(s: StartReplay, logged: LoggedDraw[], order: readonly number[]): LoggedStart {
  const inOrder = new Set(order);
  const at: number[] = s.draws.map(() => -1);
  const range: number[] = [];
  const swap = new Map<number, number[]>();
  const used = new Set<number>();
  let i = 0;
  for (const n of order) {
    const d = s.draws[n];
    let j = i;
    while (j < logged.length && siteLabel(logged[j].label) !== d.label) j++;
    if (j >= logged.length) continue;
    at[n] = j;
    used.add(j);
    i = j + 1;
    // the tie list the records leave open (`alts`) the logged range picks
    const alt = d.ties && logged[j].range !== d.ties.length ? d.alts?.find((t) => t.length === logged[j].range) : undefined;
    if (alt) swap.set(n, alt);
    if (d.ties && logged[j].range !== (alt ?? d.ties).length) range.push(n);
  }
  s.draws.forEach((d, n) => {
    if (inOrder.has(n) || !d.choice || d.inPlace) return;
    const j = logged.findIndex((x, k) => !used.has(k) && siteLabel(x.label) === d.label);
    if (j < 0) return;
    at[n] = j;
    used.add(j);
  });
  const ai = logged.map((_, k) => k).filter((k) => !used.has(k) && DRAW_SITES[siteLabel(logged[k].label)]?.owner === 'ai');
  for (const k of ai) used.add(k);
  return { logged, at, extra: logged.map((_, k) => k).filter((k) => !used.has(k)), range, ai, swap };
}

/** Is the start replayed draw for draw on the log? */
export function startLogged(s: StartReplay, l: LoggedStart): boolean {
  return !l.extra.length && !l.range.length && s.draws.every((d, n) => d.choice || l.at[n] >= 0);
}

/** Was the record read before player `p`'s start of its turn finished (its
 *  event log holds rows of the turn but no PlayerTurnActivated of the player
 *  whose turn the recorder reads: runs/h1_duelw1120 t95, Rome's culture and
 *  next plot as the turn before left them)? Its cities show no start. */
export function readBeforeStart(rec: TurnRecord | null, p: number): boolean {
  const rows = (rec as (TurnRecord & { actions?: unknown }) | null)?.actions;
  if (!rec || !Array.isArray(rows) || p !== rec.head.localPlayer) return false;
  const turn = (rows as unknown[][]).filter((r) => r[1] === rec.turn);
  return turn.length > 0 && !turn.some((r) => r[2] === 'PlayerTurnActivated' && r[3] === p);
}

/** A city's stored next plot as its start of the record's turn found it:
 *  the record before's, or — that record read before the player's start of
 *  its turn — the plot that start drew (`History.startPicks`). */
function storedPlot(imp: Imported, key: string, p: number): number {
  const before = imp.recordBefore;
  const drawn = before && readBeforeStart(before, p) ? imp.startPicks.get(`${before.turn}:${key}`) : undefined;
  return drawn ?? num(imp.cityBefore.get(key)?.nextPlot ?? -1);
}

/** Each city's closing pick, by `owner:id`: the pick and the record's plot,
 *  or why it was not replayed. With the game's log the pick is the logged
 *  draw the city's pick lands on (`logStart`) over the city's ties, its range
 *  theirs; without it, drawn on the game's generator where the start's
 *  replay accounts for every draw between its seeds (`resolveStart`). */
function startBorderPicks(starts: StartReplay[], imp: Imported, rec: TurnRecord): Map<string, StartPick | string> {
  const out = new Map<string, StartPick | string>();
  const nextOf = new Map<string, number>();
  for (const [, c] of imp.dumpOfCity) nextOf.set(`${c.owner}:${c.id}`, num(c.nextPlot));
  for (const [, c] of imp.dumpOfMinor) nextOf.set(`${c.owner}:${c.id}`, num(c.nextPlot));
  for (const s of starts) {
    const keys = s.cities;
    const why = (reason: string) => { for (const k of keys) out.set(k, reason); };
    if (s.game === undefined || s.pre === undefined) { why('no witness seed'); continue; }
    // a city of the player its witnessed start did not hold — founded or
    // taken after it — drew nothing there and holds no next plot until its
    // own start (runs/h1_duelw1117: every founding past the start, Longxi
    // t45 to Yiyang t246, reads -1)
    for (const k of nextOf.keys()) {
      if (k.startsWith(`${s.player}:`) && !keys.includes(k)) out.set(k, { pick: -1, game: nextOf.get(k)!, ties: [], range: 0, logged: true });
    }
    if (s.why) { why(s.why); continue; }
    const logged = s.post !== undefined ? imp.randLog?.between(s.pre, s.post) : undefined;
    if (logged) {
      const l = logStart(s, logged);
      // a city with nothing in reach draws nothing and keeps the plot it
      // stored while it stands unowned (none after a founding or its claim)
      for (const k of keys) {
        const stored = storedPlot(imp, k, s.player);
        const keep = stored >= 0 && imp.state.map.tiles[stored]?.ownerSeat === NO_SEAT ? stored : -1;
        out.set(k, { pick: keep, game: nextOf.get(k) ?? -1, ties: [], range: 0, logged: true });
      }
      s.draws.forEach((d, n) => {
        if (!d.city || !d.ties || d.note !== 'next plot') return;
        const x = l.at[n] >= 0 ? logged[l.at[n]] : undefined;
        if (!x) { out.set(d.city, 'the log holds no pick for it'); return; }
        const pick = x.range === d.ties.length ? d.ties[x.value] : -1;
        if (pick >= 0) imp.startPicks.set(`${s.turn}:${d.city}`, pick);
        // the record read before this start shows the plot the start before
        // stored: the pick waits for the next start's claim (`storedPlot`)
        if (s.turn === rec.turn && readBeforeStart(rec, s.player)) { out.set(d.city, 'the record was read before the start'); return; }
        // a pick another owner took after the start (a city-state's envoy
        // annex in the actions): the city's reader answers the plot its
        // scorer names now (runs/h1_duelw1118 t144: Handan's 916, Armagh's
        // by China's envoys, read 919)
        const lostTo = pick >= 0 && imp.state.map.tiles[pick]?.ownerSeat !== NO_SEAT ? recordTies(imp, d.city) : undefined;
        out.set(d.city, { pick, game: nextOf.get(d.city) ?? -1, ties: d.ties, range: x.range, logged: true, ...(lostTo ? { lostTo } : {}) });
      });
      continue;
    }
    const draws = resolveStart(s);
    if (!draws) { why('the start drew besides the picks'); continue; }
    for (const k of keys) out.set(k, 'no plot in reach');
    const rng = new Civ6Random(s.pre);
    for (const d of draws) {
      const v = rng.get(d.ties?.length ?? 1, d.label);
      if (d.city && d.ties) out.set(d.city, { pick: d.ties[v], game: nextOf.get(d.city) ?? -1, ties: d.ties });
    }
  }
  return out;
}

function subjectOf(c: DumpCity): string {
  return `city ${c.owner}:${c.id} ${strip(c.name, 'LOC_CITY_NAME_')}`;
}

export function stateChecks(rec: TurnRecord, cat: Catalog, imp: Imported = importTurn(rec, cat), sink?: StartReplay[],
  next?: TurnRecord): CheckResult[] {
  const out: CheckResult[] = [];
  const state = imp.state;
  const starts = startDraws(rec, state, imp, cat);
  sink?.push(...starts);
  const startPicks = startBorderPicks(starts, imp, rec);
  const turn = rec.turn;
  // the player whose start the record precedes
  const ownerInTurn = rec.players.find((p) => bool(p.turnActive))?.id ?? num(rec.head.localPlayer);
  // each player's start: the replay's draws against the game's log of the
  // draws between its witnesses' seeds, label by label; without the log,
  // against their count, a start holding an AI choice that lands on it
  // consistent, not tested
  for (const s of starts) {
    const subject = `player ${s.player} start t${s.turn}`;
    const logged = s.pre !== undefined && s.post !== undefined ? imp.randLog?.between(s.pre, s.post) : undefined;
    if (s.game === undefined) out.push({ turn, check: 'start.draws', subject, ok: true, skip: 'no witness seed' });
    else if (s.why) out.push({ turn, check: 'start.draws', subject, ok: true, skip: s.why });
    else if (logged) {
      const l = logStart(s, logged);
      const ok = startLogged(s, l);
      out.push({ turn, check: 'start.draws', subject, ok, game: s.game, ours: l.at.filter((x) => x >= 0).length,
        ...(ok ? {} : { state: {
          unexplained: l.extra.map((k) => `${logged[k].label}/${logged[k].range}`),
          unlogged: s.draws.filter((d, n) => !d.choice && l.at[n] < 0).map((d) => `${d.label} (${d.note ?? ''})`),
          range: l.range.map((n) => `${s.draws[n].city} ties ${s.draws[n].ties?.length} logged ${logged[l.at[n]].range}`),
        } }) });
    } else if (s.draws.some((d) => d.choice) && resolveStart(s) && s.game !== s.draws.filter((d) => !d.choice).length) {
      // (a start whose count its fixed draws meet alone took none of its
      // choices: its count is checked below)
      out.push({ turn, check: 'start.draws', subject, ok: true, skip: 'an AI choice the records do not show' });
    } else {
      const fixedN = s.draws.filter((d) => !d.choice).length;
      const ok = s.game === fixedN || s.game === s.draws.length;
      out.push({ turn, check: 'start.draws', subject, ok, game: s.game, ours: s.game === fixedN ? fixedN : s.draws.length,
        ...(ok ? {} : { state: { draws: s.draws.map((d) => d.label + (d.ties ? `/${d.ties.length}` : '') + (d.choice ? '?' : '')) } }) });
    }
  }
  // a city-state's closing pick (a major's and a Free City's run with the
  // city checks below)
  for (const [cs, c] of imp.dumpOfMinor) {
    const subject = subjectOf(c);
    const sp = startPicks.get(`${c.owner}:${c.id}`);
    if (sp === undefined) out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: 'no witness' });
    else if (typeof sp === 'string') out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: sp });
    else if (sp.game < 0 && imp.nextPlotUnheld.has(cs.centerIndex) && !sp.logged) {
      out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: 'no next plot held' });
    } else {
      out.push({ turn, check: 'city.nextPlotDraw', subject, ok: pickHolds(sp, imp.nextPlotUnheld.has(cs.centerIndex)), game: sp.game, ours: sp.pick,
        state: { ties: sp.ties, range: sp.range } });
    }
  }
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
        improvement: t.improvement, pillaged: t.pillaged, river: t.riverMask, owner: t.ownerSeat, district: t.district, fertility: [t.fertility, t.fertilityProd, t.fertilitySci ?? 0, t.fertilityCul ?? 0], submerged: t.submerged ?? false } }),
    });
  }

  // a seat's luxury allocation as its last rebuild left it: the rebuild at
  // its turn's processing (Player DoTurn's resources step) reads its
  // districts and cards as they stood then (`luxCardsOf`: the cards before a
  // re-slot past the walk's start), and a district of its pillaged after its
  // turn closed rebuilds nothing (runs/h1_duelw1127 t156: barbarians pillage
  // Changsha's district after China's turn, Changsha keeps the luxury its
  // amenity ranked it for)
  const lux = new Map<number, Map<number, number>>();
  const luxAtRebuild = (seat: number): Map<number, number> => {
    const have = lux.get(seat);
    if (have) return have;
    const owner = imp.playerOfSeat.get(seat) ?? -1;
    const log = (rec as TurnRecord & { actions?: unknown[][] }).actions ?? [];
    const opened = log.map((r) => r[2] === 'PlayerTurnActivated' && r[3] === owner).lastIndexOf(true);
    const closed = opened < 0 ? -1 : log.findIndex((r, i) => i > opened && r[2] === 'PlayerTurnDeactivated' && r[3] === owner);
    const pillaged: Tile[] = [];
    for (const r of closed < 0 ? [] : log.slice(closed + 1)) {
      if (r[2] !== 'DistrictPillaged' || r[3] !== owner) continue;
      const t = state.map.tiles[(r[7] as number) * rec.head.W + (r[6] as number)];
      if (!t?.districtPillaged) continue;
      t.districtPillaged = false;
      pillaged.push(t);
    }
    // a city founded since the seat's last rebuild is not in the allocation
    // until something rebuilds it (`foundedUnallocated`): the allocation
    // stands as it was ranked without the city, which holds none
    const unallocated = foundedUnallocated(rec, cat, imp, seat, owner, log);
    const s = seatOf(state, seat);
    const all = s?.cities ?? [];
    if (s && unallocated.size) s.cities = all.filter((c) => !unallocated.has(c.id));
    let out: Map<number, number>;
    try {
      out = withCards(state, seat, imp.luxCardsOf(seat), () => luxuryAmenities(state, seat));
    } finally {
      if (s) s.cities = all;
    }
    for (const id of unallocated) out.set(id, 0);
    for (const t of pillaged) t.districtPillaged = true;
    lux.set(seat, out);
    return out;
  };
  for (const { city, dump: c } of citiesOfImport(imp)) {
    const subject = subjectOf(c);
    const gaps = cityGaps(imp, c);
    const push = (check: string, ok: boolean, game: unknown, ours: unknown, st?: Record<string, unknown>) =>
      out.push({ turn, check, subject, ok, game, ours, ...gapsFor(gaps, check), ...(ok || !st ? {} : { state: st }) });
    // the city reads the congress the game holds now, but its luxury
    // allocation stands as its seat's last rebuild left it, on the session
    // its last turn read (1112 China t182: the session shown that turn
    // reaches its cities' amenity tier at t183; 1117 Xi'an t62: Sovereignty
    // shown that turn already pays its route to Caguana)
    state.congress = imp.congressOf(city.seat);
    const luxStanding = luxAtRebuild(city.seat);
    state.congress = congressNow;
    const stats = computeCityStats(state, city, luxStanding);
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
    const standing = stats.amenities;
    const standingLux = luxStanding.get(city.id) ?? 0;
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
    if (imp.nextPlotUnheld.has(city.centerIndex) && Array.isArray((rec as TurnRecord & { actions?: unknown }).actions)) {
      push('city.nextPlot', num(c.nextPlot) === -1, num(c.nextPlot), -1);
    } else if (num(c.nextPlot) < 0 && imp.nextPlotUnheld.has(city.centerIndex)) {
      // with no log, a plot gained otherwise may have come before the city's
      // culture step or after it
      out.push({ turn, check: 'city.nextPlot', subject, ok: true, skip: 'no next plot held' });
    } else if (frozenAtLastTurn(state, imp, city.seat)) {
      // a Border Control Treaty's target draws no plot: it holds what it
      // held the turn before, or nothing once a plot was gained since — on
      // the session its seat's last turn read (runs/h1_duelw1128 t182:
      // China's treaty ended by the session shown that turn, Xi'an and
      // Jiaodong still holding none until their next turn)
      const was = imp.cityBefore.get(`${c.owner}:${c.id}`);
      if (!was) out.push({ turn, check: 'city.nextPlot', subject, ok: true, skip: 'no record before' });
      else {
        const held = c.plots.length > was.plots.length ? -1 : num(was.nextPlot);
        push('city.nextPlot', num(c.nextPlot) === held, num(c.nextPlot), held);
      }
    } else {
      // the stored plot stands until the city's next border turn though
      // another city has taken it since: the draw read it unowned (1121
      // t120: Taiyuan's 495, Shanghai's from China's actions; t159: Xi'an's
      // 358; runs/h1_duelw1127 t69: Xi'an holds 279, Changsha's since)
      const np = num(c.nextPlot);
      const stale = np >= 0 && state.map.tiles[np].ownerSeat !== NO_SEAT && !tileBelongsTo(state.map.tiles[np], city);
      const ties = stale ? withoutOwners(state, [np], () => borderBestPlots(state, city)) : borderBestPlots(state, city);
      // the pick was drawn at the city's start, on the plots as they stood
      // there: the start's replayed ties read it where the record's plots
      // moved since (1118 t140: Xi'an's 385, its neighbour 386 +1 Food after
      // the pick; t146: Handan's 1049, 1050's resource revealed after it)
      const sp0 = startPicks.get(`${c.owner}:${c.id}`);
      const atStart = !!sp0 && typeof sp0 !== 'string' && np >= 0 && sp0.game === np && sp0.ties.includes(np);
      const ok = np < 0 ? ties.length === 0 : ties.includes(np) || atStart;
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
    else if (sp.game < 0 && imp.nextPlotUnheld.has(city.centerIndex) && !sp.logged) {
      out.push({ turn, check: 'city.nextPlotDraw', subject, ok: true, skip: 'no next plot held' });
    } else push('city.nextPlotDraw', pickHolds(sp, imp.nextPlotUnheld.has(city.centerIndex)), sp.game, sp.pick, { ties: sp.ties, range: sp.range });
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
    // the centre's defense reads the plot's units live (0x24ae80 -> 0x24a180's
    // best defender 0x208b80) where the record's unit list stands before
    // the in-turn player's start: a military unit that start's production
    // completed in the city (the next record's start-window rows) already
    // garrisons it (runs/h1_duelw1127 Rome t96, 1117 t168, 1122 t108, 1123
    // t101: a Warrior completed, 26 with no unit on the centre)
    const fresh: Unit[] = [];
    if (c.owner === ownerInTurn) {
      for (const r of (next && startRows(next, c.owner, turn)) ?? []) {
        if (r[2] !== 'CityProductionCompleted' || r[4] !== c.id || r[5] !== 0) continue;
        const type = engineId('unit', cat.units[r[6] as number] ?? '', 'UNIT_', UNITS);
        if (!type || unitDomain(type) !== 'military') continue;
        const u: Unit = { id: -1 - fresh.length, type, seat: city.seat, tileIndex: city.centerIndex, movesLeft: 0, movesFull: 0,
          hp: UNIT_HP, charges: null, xp: 0, level: 1 };
        fresh.push(u);
        state.units.push(u);
      }
    }
    const defense = cityDefenseStrength(state, city);
    push('city.defense', defense === num((c.districts[0] ?? [])[5] as number),
      num((c.districts[0] ?? [])[5] as number), defense,
      { buildings: city.buildings, districts: city.districts.map((d) => d.type), bestMelee: seatOf(state, city.seat)?.bestMeleeCS,
        bare: centreStrength(state, city, false) });
    if (fresh.length) state.units = state.units.filter((u) => !fresh.includes(u));
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
          : unitProdCost(state, city.seat, id, id === 'BUILDER' ? builderCost(state, city.seat) : id === 'TRADER' ? traderCost(state, city.seat)
              : unitStepCost(id, unitsAcquired(state, city.seat, id)));
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
    const tour = seatTourism(state, seat, establishedGovernorCityIds(seatOf(state, seat)!)) + seatTourismReligious(state, seat);
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
  // the volcanoes erupting at the turn change: a resource gone beside one
  // went with the eruption, no harvest's (runs/h1_duelw1124_20261007T162102Z
  // t166: the Bananas beside Chengdu's volcano, its box standing)
  const erupted = (Array.isArray(b.events) ? b.events : [])
    .filter((e) => e[0] === b.turn && /^RANDOM_EVENT_(VOLCANO|VESUVIUS|KILIMANJARO|EYJAFJALLAJOKULL)_/.test(cat.randomEvents?.[e[1]] ?? ''))
    .map((e) => state.map.tiles[num(e[2])])
    .filter((t): t is Tile => !!t);
  for (const q of c.plots) {
    const pa = plotAt(a, q);
    const pb = plotAt(b, q);
    if (pb[P.owner] !== pa[P.owner] || pb[P.ownerCity] !== pa[P.ownerCity]) continue;
    if ((pb[P.district] as number) >= 0 || (pb[P.wonder] as number) >= 0) continue;
    const t = state.map.tiles[q];
    const grants: LumpGrant[] = [];
    if ((pa[P.feature] as number) >= 0 && (pb[P.feature] as number) < 0) grants.push(...chopGrant(state, t, city.seat));
    if ((pa[P.resource] as number) >= 0 && (pb[P.resource] as number) < 0
      && cat.features[pb[P.feature] as number] !== 'FEATURE_VOLCANIC_SOIL'
      && !erupted.some((v) => hexDistance(state.map, v.col, v.row, t.col, t.row) <= 1)) {
      const g = harvestGrant(state, t, city.seat);
      if (g) grants.push(g);
    }
    for (const g of grants) if (g.key === 'food') food += g.amount;
  }
  return food;
}

/** the buildings and districts (catalog rows) a city's owner completed after
 *  its city walk across a pair */
interface LateItems { buildings: Set<number>; districts: Set<number>; pillage: Set<number> }

function landProduction(state: GameState, cat: Catalog, city: City, next: DumpCity, W: number, actedFirst: boolean,
  late: LateItems = { buildings: new Set(), districts: new Set(), pillage: new Set() },
  pillagedAfter: (tileIndex: number) => boolean = () => false): (landed: boolean) => void {
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
      // a wonder or building its owner completed in its actions lands after
      // its turn start (1118 t60: Longxi's Hanging Gardens, 98% in China's
      // processing, finished in its actions; no city grows on its +15% then)
      if (!actedFirst && late.buildings.has(bi)) continue;
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
    if (!actedFirst && late.buildings.has(bi) && !start.buildings.includes(id)) continue;
    buildings.push(id);
    // a building pillaged by a unit whose player acts after the owner's
    // walk stands whole for the walk (1121 t101: a barbarian on Xi'an's Holy
    // Site pillages its Temple after China's growth, which banks the Temple's
    // Food and Housing)
    const was = start.pillaged?.includes(id) ?? false;
    const site = BUILDINGS[id]?.district === 'CITY_CENTER' ? city.centerIndex
      : city.districts.find((d) => d.type === BUILDINGS[id]?.district)?.tileIndex;
    if (pil && (was || actedFirst || site === undefined || !pillagedAfter(site))) pillaged.push(id);
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
    if (!actedFirst && (!complete || late.districts.has(ti)) && !city.districts.some((x) => x.tileIndex === t.index)) continue;
    // one placed before and finished after the walk stands unfinished for it
    if (!actedFirst && late.districts.has(ti) && !t.districtComplete) continue;
    t.district = id;
    t.districtComplete = complete === true;
    // a district pillaged or repaired after its owner's walk stands as the
    // walk read it (1118 t95: Xi'an's Theater Square pillaged by Preslav)
    if (actedFirst || !late.pillage.has(t.index)) t.districtPillaged = dpil === true;
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

/** The player's Gold, upkeep and bankruptcy come before its cities: its
 *  treasury short at the processing (the later record's Gold at 0) is the
 *  shortfall its cities' amenities read. */
function landShortfall(state: GameState, seat: number, pa?: DumpPlayer, pb?: DumpPlayer): void {
  const payer = seatOf(state, seat);
  if (!payer || !pa || !pb) return;
  const balance = num(pa.gold) + num(pa.goldYield) - num(pa.maintTotal);
  if (!Number.isNaN(balance) && !Number.isNaN(num(pb.gold))) payer.goldShortfall = num(pb.gold) > 0 ? 0 : goldShortfall(balance);
}

/** The research the later record holds lands before the cities grow: a
 *  player's turn completes its technologies and civics ahead of its cities'
 *  growth and culture steps, and a completed civic's new government and
 *  policies are slotted with it (runs/h1_duelw1112 t56: China's government
 *  changed with its civic, Xi'an's box growing at the new housing). Cards
 *  swapped with no civic completed came after the cities (1112 t201). A
 *  city-state's research lands the same way, its civics' improvement bonuses
 *  with it (1121 Antioch t93: Mercantilism's Camp Food). */
function landResearch(state: GameState, cat: Catalog, seat: number, b: TurnRecord, history: History | undefined,
  pa?: DumpPlayer, pb?: DumpPlayer): void {
  const s = seatOf(state, seat);
  if (!s || !pa || !pb) return;
  const ids = (bits: string, names: string[], kind: 'tech' | 'civic', prefix: string, known: object) =>
    [...(bits ?? '')].flatMap((ch, k) => (ch === '1' ? [engineId(kind, names[k], prefix, known)] : []))
      .filter((x): x is string => !!x);
  if (pa.techs !== pb.techs) s.research.techs = ids(pb.techs, cat.techs, 'tech', 'TECH_', TECHS) as typeof s.research.techs;
  if (pa.civics === pb.civics) return;
  s.research.civics = ids(pb.civics, cat.civics, 'civic', 'CIVIC_', CIVICS) as typeof s.research.civics;
  if (!isCiv(seat)) return;
  const gov = num(pb.government);
  const gid = gov >= 0 ? engineId('government', cat.governments[gov], 'GOVERNMENT_', GOVERNMENTS) : null;
  if (gid) s.government.chosen = gid as typeof s.government.chosen;
  landPolicies(state, cat, seat, b, history, pb);
}

/** The cards record t+1 slots, landed on the seat with the cards it holds
 *  lapsed by the import's rule (`lapsedCards`: a rebuild lays the old cards
 *  back unattached, a card re-slotted attaches; runs/h1_duelw1127 t225: Civil
 *  Prestige re-slotted before China's cities, its +2 Housing reaching
 *  Changsha's and Chengdu's growth; runs/h1_duelw1128 t99: a new
 *  government lays it back lapsed before Xi'an grows) — read for the step
 *  alone, record t+1's own import reading it afresh. */
function landPolicies(state: GameState, cat: Catalog, seat: number, b: TurnRecord, history: History | undefined,
  pb: DumpPlayer): void {
  const s = seatOf(state, seat)!;
  s.government.policies = (pb.policies ?? []).map((x) => num(x)).filter((i) => i >= 0)
    .map((i) => engineId('policy', cat.policies[i], 'POLICY_', POLICIES))
    .filter((x): x is string => !!x) as typeof s.government.policies;
  if (history) s.government.lapsed = [...lapsedCards(b, cat, state, seat, pb, history, false)];
}

/** how far a Settler the city trained can stand from it at the next record:
 *  its moves on the turn it appears */
const SETTLER_WALK = UNITS.SETTLER.moves;
/** a purchase's kind in the game's log: a unit */
const PURCHASE_UNIT_HASH = gameHash('UNIT');
const OP_SPREAD = gameHash('UNITOPERATION_SPREAD_RELIGION');
/** a village's reward of a citizen, GoodyHutReward's subtype cell */
const GOODY_ADD_POP = gameHash('GOODYHUT_ADD_POP');
/** a production the log completes by a purchase: `CityProductionCompleted`'s last cell */
const PURCHASED = 65535;

/** the fertility channels a random event lays, each with its column in a
 *  record's plot yields (YIELD_KEYS order) */
const EVENT_STEP_CHANNELS: readonly ['fertility' | 'fertilityProd' | 'fertilitySci' | 'fertilityCul', number][] = [
  ['fertility', 0], ['fertilityProd', 1], ['fertilitySci', 3], ['fertilityCul', 4],
];

/**
 * The engine ids of the cities `owner` (engine `seat`) founded in this
 * record's log that its luxury allocation does not hold yet. The allocation
 * (Player_Resources 0x4a6110) is rebuilt only by the player's turn processing
 * and by ChangeResourceAmount (0x4a7560); a founding calls neither, unless
 * its centre takes a bonus or luxury resource (the district handler's 0x4ab4d0).
 * After the founding the record holds the city's luxuries once one of these
 * runs before the record:
 * - the player's next processing (its PlayerTurnActivated row, `true`);
 * - its turn end with a strategic stockpile over the cap (`stockOverCap`);
 * - an improvement placed, changed or removed on a bonus or luxury resource
 *   of its own or of a city-state it is suzerain of (0x4ab4d0; a
 *   city-state's change re-hands its copies to its suzerain, 0x44eff0);
 * - the turn of a city-state it is suzerain of that accumulates a strategic
 *   resource (0x4ab6e0's income through 0x4a7560, re-handed by 0x44eff0);
 * - a unit with a strategic cost the player completes or upgrades.
 * Recorded (dll_readings "H-1: the luxury allocation's rebuilds"): the
 * LuxAllocArrived / LuxAllocNone rows and the per-city luxAlloc of the
 * 162102Z / 194856Z re-recordings of 1103 and 1117-1124.
 */
function foundedUnallocated(rec: TurnRecord, cat: Catalog, imp: Imported, seat: number, owner: number,
  log: unknown[][]): Set<number> {
  const out = new Set<number>();
  if (!log.length) return out;
  const state = imp.state;
  const W = rec.head.W;
  const suz = suzerainMinorSeats(state, seat);
  const suzPlayers = new Set([...suz].map((s) => imp.playerOfSeat.get(s)).filter((p): p is number => p !== undefined));
  // the suzerained city-states that accumulate a strategic resource each turn
  const accumulates = new Set<number>();
  for (const s of suz) {
    const hidden = hiddenResourcesFor(state, s);
    const p = imp.playerOfSeat.get(s);
    if (p === undefined) continue;
    for (const t of state.map.tiles) {
      if (t.ownerSeat !== s || !t.resource || RESOURCES[t.resource]?.category !== 'strategic' || hidden.has(t.resource)) continue;
      if (!t.pillaged && t.improvement === resourceImprovement(t)) { accumulates.add(p); break; }
    }
  }
  const valued = (x: number, y: number): boolean => {
    const t = state.map.tiles[y * W + x];
    return !!t?.resource && RESOURCES[t.resource]?.category !== 'strategic';
  };
  const ownedBy = (x: number, y: number): boolean => {
    const t = state.map.tiles[y * W + x];
    return !!t && (t.ownerSeat === seat || suz.has(t.ownerSeat));
  };
  for (let i = 0; i < log.length; i++) {
    const r = log[i];
    if (r[2] !== 'CityAddedToMap' || r[3] !== owner) continue;
    const city = imp.cityByKey.get(`${owner}:${r[4]}`);
    if (!city) continue;
    // the centre takes the resource beneath it at once
    if (valued(r[5] as number, r[6] as number)) continue;
    let rebuilt = false;
    for (let j = i + 1; j < log.length && !rebuilt; j++) {
      const q = log[j];
      const name = q[2];
      if (name === 'PlayerTurnActivated') {
        rebuilt = (q[3] === owner && q[4] === true) || (suzPlayers.has(q[3] as number) && accumulates.has(q[3] as number));
      } else if (name === 'PlayerTurnDeactivated') {
        rebuilt = q[3] === owner && imp.stockOverCap.has(seat);
      } else if (name === 'ImprovementAddedToMap' || name === 'ImprovementChanged' || name === 'ImprovementRemovedFromMap') {
        rebuilt = valued(q[3] as number, q[4] as number) && ownedBy(q[3] as number, q[4] as number);
      } else if (name === 'UnitUpgraded' || (name === 'CityProductionCompleted' && q[5] === 0)) {
        // a unit with a strategic cost upgraded or completed by the player
        // spends the resource (0x4a7560); a city-state's pays none
        // (runs/h1_duelw1123_20261007T162102Z t82: Brussels' Swordsman
        // upgrade leaves China's new Shanghai unallocated)
        const unit = engineRowOf(cat, 'unit', (name === 'UnitUpgraded' ? q[5] : q[6]) as number);
        rebuilt = q[3] === owner && !!unit && !!unitResourceCost(unit);
      }
    }
    if (!rebuilt) out.add(city.id);
  }
  return out;
}

/** `f` read with seat `seat` holding `cards` (its government, slotted and
 *  lapsed cards), the seat's own put back after */
function withCards<T>(state: GameState, seat: number, cards: LuxCards | undefined, f: () => T): T {
  const g = seatOf(state, seat)?.government;
  if (!cards || !g) return f();
  const was = { chosen: g.chosen, policies: g.policies, lapsed: g.lapsed };
  g.chosen = cards.chosen as typeof g.chosen;
  g.policies = cards.policies as typeof g.policies;
  g.lapsed = cards.lapsed;
  try {
    return f();
  } finally {
    g.chosen = was.chosen;
    g.policies = was.policies;
    g.lapsed = was.lapsed;
  }
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
  // the wonders, buildings and districts each city's owner completed after
  // its city walk, by `owner:city`: in its actions (the log's WonderCompleted and
  // finished BuildingChanged between its PlayerTurnActivated and
  // PlayerTurnDeactivated), and a building or district bought in its processing after
  // the walk closed (its `ResearchChanged` to none: 1118 t171 Chengdu's and
  // t199 Taiyuan's Monuments, banked on the old Culture; 1117 t13 Xi'an's,
  // bought before it, on the new)
  const lateBuilt = new Map<string, LateItems>();
  // the cities that bought a Settler after their walk, or completed one in
  // their actions (runs/h1_duelw1128 Shanghai t151: a harvest finishes it
  // after the turn start banked the five-citizen culture): its citizen
  // leaves after the turn's growth
  const lateSettlers = new Set<string>();
  {
    const acting = new Set<unknown>();
    const walked = new Set<unknown>();
    const late = (k: string, kind: keyof LateItems, i: number) => {
      const v = lateBuilt.get(k) ?? { buildings: new Set<number>(), districts: new Set<number>(), pillage: new Set<number>() };
      v[kind].add(i);
      lateBuilt.set(k, v);
    };
    for (const r of (b as TurnRecord & { actions?: unknown[][] }).actions ?? []) {
      if (r[2] === 'PlayerTurnActivated') acting.add(r[3]);
      else if (r[2] === 'PlayerTurnDeactivated') acting.delete(r[3]);
      else if (r[2] === 'ResearchChanged' && r[4] === -1) walked.add(r[3]);
      else if ((r[2] === 'WonderCompleted' || (r[2] === 'BuildingChanged' && r[8] === 100)) && acting.has(r[6])) late(`${r[6]}:${r[7]}`, 'buildings', r[5] as number);
      else if (r[2] === 'DistrictPillaged' && walked.has(r[3])) late(`${r[3]}:${r[5]}`, 'pillage', (r[7] as number) * b.head.W + (r[6] as number));
      else if (((r[2] === 'CityMadePurchase' && r[7] === PURCHASE_UNIT_HASH && r[8] === settlerIdx)
        || (r[2] === 'CityProductionCompleted' && r[5] === 0 && r[6] === settlerIdx && acting.has(r[3])))
        && (walked.has(r[3]) || acting.has(r[3]))) lateSettlers.add(`${r[3]}:${r[4]}`);
      else if (r[2] === 'CityProductionCompleted' && (r[5] === 1 || r[5] === 2) && r[8] === PURCHASED && walked.has(r[3]) && !acting.has(r[3])) {
        late(`${r[3]}:${r[4]}`, r[5] === 1 ? 'buildings' : 'districts', r[6] as number);
      } else if (r[2] === 'CityProductionCompleted' && r[5] === 2 && acting.has(r[3])) {
        // a district completed in its owner's actions (bought: runs/h1_duelw1127
        // Longxi t223, an Aqueduct, the city growing at its old housing)
        late(`${r[3]}:${r[4]}`, 'districts', r[6] as number);
      }
    }
  }
  const logged = (b as TurnRecord & { actions?: unknown[][] }).actions;
  // each player's turn start in the pair's log, by row: a player absent
  // acted first, before every other's start
  const activatedAt = new Map<number, number>();
  (logged ?? []).forEach((r, i) => {
    if (r[2] === 'PlayerTurnActivated' && !activatedAt.has(r[3] as number)) activatedAt.set(r[3] as number, i);
  });
  // the improvements laid, lifted or pillaged in the pair before a player's
  // turn start stand as record t+1 holds them for its processing (1121
  // t120-126: China's Builder lays a Farm by Hunza in its actions and lifts
  // it the next turn, and Hunza's Farm beside it reads the adjacency Food on
  // alternate turns); the returned call puts record t's back
  let mapAfter: ReturnType<typeof recordMap> | undefined;
  const relayImprovements = (owner: number): (() => void) => {
    // its processing opens where the player before it closed its turn: what
    // the processing itself lays or lifts (a district placed on a Farm)
    // comes after the walk
    const at = activatedAt.get(owner) ?? -1;
    let start = -1;
    (logged ?? []).forEach((r, i) => {
      if (i < at && r[2] === 'PlayerTurnDeactivated') start = i;
    });
    const relaid: [Tile, string | null, boolean][] = [];
    (logged ?? []).forEach((r, i) => {
      if (i >= start || !IMPROVEMENT_ROWS.has(r[2] as string)) return;
      const t = state.map.tiles[(r[4] as number) * a.head.W + (r[3] as number)];
      if (!t || relaid.some(([x]) => x === t)) return;
      const q = (mapAfter ??= recordMap(b, cat)).tiles[t.index];
      relaid.push([t, t.improvement, t.pillaged]);
      t.improvement = q.improvement;
      t.pillaged = q.pillaged;
    });
    return () => {
      for (const [t, improvement, pillaged] of relaid) {
        t.improvement = improvement;
        t.pillaged = pillaged;
      }
    };
  };

  // the turn's event step (after the last player closed turn t, before the
  // in-turn player's start: its PlotYieldChanged rows) moves each fire's plot
  // on to its next form, which the in-turn player's processing reads — the
  // engine's fire strike (`fireStrike`): burning, then burnt with +1 Food,
  // then the feature back with +1 Production (runs/h1_duelw1127 Rome t57: the
  // Rainforest it works regrows at t58, its growth on surplus 7); the
  // returned call puts record t's back
  const relayEventStep = (): (() => void) => {
    const log = logged ?? [];
    const at = log.map((r) => r[2] === 'PlayerTurnActivated' && r[3] === seatInTurn).lastIndexOf(true);
    const from = at < 0 ? -1 : log.slice(0, at).map((r) => r[2] === 'PlayerTurnDeactivated').lastIndexOf(true);
    const undo: (() => void)[] = [];
    if (from < 0) return () => {};
    // a flood struck at the turn change (record t+1's events: one of the
    // turn it reads)
    const flooding = (Array.isArray(b.events) ? b.events : [])
      .some((e) => e[0] === b.turn && (cat.randomEvents?.[e[1]] ?? '').startsWith('RANDOM_EVENT_FLOOD_'));
    // each plot once, however many rows name it
    const seen = new Set<number>();
    for (const r of log.slice(from + 1, at)) {
      if (r[2] !== 'PlotYieldChanged') continue;
      const t = state.map.tiles[(r[4] as number) * a.head.W + (r[3] as number)];
      const next = t && (mapAfter ??= recordMap(b, cat)).tiles[t.index];
      if (!t || !next || seen.has(t.index)) continue;
      seen.add(t.index);
      if (t.feature === next.feature) {
        // a flood's fertility the event step lays on Floodplains whose
        // ground stands (runs/h1_duelw1121 t210: the Moderate Flood's +1 Food
        // on Rome's worked Floodplains, its growth on surplus 6): the rise of
        // the plot's recorded yields from record t to t+1
        if (!flooding || !t.feature?.startsWith('FLOODPLAINS')) continue;
        const p0 = plotAt(a, t.index);
        const p1 = plotAt(b, t.index);
        const y0 = p0[P.yields];
        const y1 = p1[P.yields];
        if (!Array.isArray(y0) || !Array.isArray(y1) || p0[P.improvement] !== p1[P.improvement]
          || p0[P.district] !== p1[P.district] || p0[P.owner] !== p1[P.owner]) continue;
        const was = { fertility: t.fertility, fertilityProd: t.fertilityProd, fertilitySci: t.fertilitySci, fertilityCul: t.fertilityCul };
        let rose = false;
        EVENT_STEP_CHANNELS.forEach(([ch, col]) => {
          const d = num(y1[col]) - num(y0[col]);
          if (d > 0) {
            t[ch] = (t[ch] ?? 0) + d;
            rose = true;
          }
        });
        if (rose) undo.push(() => Object.assign(t, was));
        continue;
      }
      const f = t.feature ?? '';
      const nf = next.feature ?? '';
      const key = FIRE_BURNING_FEATURE.includes(f) && FIRE_BURNT_FEATURE.includes(nf) ? 'fertility'
        : FIRE_BURNT_FEATURE.includes(f) && FIRE_START_FEATURE.includes(nf) ? 'fertilityProd'
        : FIRE_START_FEATURE.includes(f) && FIRE_BURNING_FEATURE.includes(nf) ? null : undefined;
      if (key === undefined) continue;
      const was = { feature: t.feature, fertility: t.fertility, fertilityProd: t.fertilityProd };
      t.feature = next.feature;
      if (key) t[key] = (t[key] ?? 0) + 1;
      undo.push(() => Object.assign(t, was));
    }
    return () => { for (const u of undo.reverse()) u(); };
  };

  // a plot of `owner`'s that a unit of a player acting after it stands on at
  // the next record: what it pillaged there came after the owner's walk
  const pillagedAfter = (owner: number) => (q: number) => b.units.some((u) => u.y * b.head.W + u.x === q && u.owner !== owner
    && (u.owner === seatInTurn ? -1 : activatedAt.get(u.owner) ?? -1) > (activatedAt.get(owner) ?? Infinity));
  // the citizens a random event killed at the end of turn t (the log's
  // CityPopulationChanged rows after the turn's last PlayerTurnDeactivated,
  // each `losePopulation`'s one: runs/h1_duelw1117 Antananarivo t170, 10 ->
  // 8 with its box standing; 1118 Shanghai t103, grown in its start, one
  // lost to the storm)
  const turnClosed = (logged ?? []).reduce((m, r, j) => (r[1] === turn && r[2] === 'PlayerTurnDeactivated' ? j : m), -1);
  const turnEndKills = (owner: number, id: number) => (turnClosed < 0 ? 0
    : logged!.filter((r, j) => j > turnClosed && r[1] === turn && r[2] === 'CityPopulationChanged' && r[3] === owner && r[4] === id).length);
  // the record carries no route table while Traders stand (an older dumper)
  const traderIdx = cat.units.indexOf('UNIT_TRADER');
  const routesUnread = !a.cities.some((c) => Array.isArray((c as DumpCity & { routes?: unknown }).routes))
    && a.units.some((u) => u.type === traderIdx);
  // the city completed or bought a Settler in the pair's log
  const madeSettler = (c: DumpCity) => (logged ?? []).some((x) => x[3] === c.owner && x[4] === c.id
    && ((x[2] === 'CityProductionCompleted' && x[5] === 0 && x[6] === settlerIdx)
      || (x[2] === 'CityMadePurchase' && x[7] === PURCHASE_UNIT_HASH && x[8] === settlerIdx)));
  // the religious spread first, on the untouched turn-t state: each founder's
  // religion on its own turn, in the turn's order
  const pressBefore = new Map<City, number[]>();
  for (const { city } of citiesOfImport(imp)) pressBefore.set(city, [...(city.religionPressure ?? [])]);
  // — each player's cities adding the citizens the record says they grew on
  // its turn (`gainPopulationPressure`), a major's after its spread (1117
  // t148: Guangzhou, converted by China's spread, gives its new citizen's
  // 50 to China's religion, and presses its neighbours +2 that turn), the
  // city-states and the Free Cities after the last
  const spreadImp = importTurn(a, cat, history);
  const spreadState: GameState = spreadImp.state;
  // a city whose food box emptied while a Settler of its owner came out
  // beside it grew the citizen the Settler took
  const grownBy = (c: DumpCity, centre: number) => {
    const next = after.get(`${c.owner}:${c.id}`);
    if (!next || acts.cityChanged.has(`${c.owner}:${c.id}`)) return 0;
    // where the record logs its events, every citizen it grew is a
    // CityPopulationChanged row above the size before it (runs/h1_duelw1128
    // Shanghai t151: a Settler 5 -> 4, a harvest's Food back to 5, +50)
    const rows = (logged ?? []).filter((x) => x[2] === 'CityPopulationChanged' && x[3] === c.owner && x[4] === c.id);
    if (rows.length > 0) {
      let size = c.pop;
      let grown = 0;
      for (const x of rows) {
        grown += Math.max(0, (x[5] as number) - size);
        size = x[5] as number;
      }
      return grown;
    }
    // where the record logs its events, the Settler is the city's own
    // (1121 t210: Shanghai grows 11 -> 12 with another city's Settler beside it)
    const settled = num(next.food) < num(c.food) && (logged ? madeSettler(c)
      : acts.unitsNew.some((u) => u.owner === c.owner && u.type === settlerIdx && tileDistance(spreadState, u.plot, centre) <= 2));
    return next.pop - c.pop + (settled ? 1 : 0) + turnEndKills(c.owner, c.id);
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
  // where the record logs its events, each spread is its own row: the unit's
  // UnitOperationStarted (UNITOPERATION_SPREAD_RELIGION) and the charge it
  // spent (UnitChargesChanged), on the plot the unit's moves left it at and
  // with the promotions it held then (runs/h1_duelw1128 t112: a Missionary
  // spending its last charge two plots on from where record t stood it)
  const logSpreads: (Actions['spreads'][number] & { held: number[] })[] | undefined = logged ? [] : undefined;
  if (logged) {
    const at = new Map<string, number>();
    const held = new Map<string, number[]>();
    const kind = new Map<string, { type: number; religion: number; hp: number }>();
    for (const u of a.units) {
      const k = `${u.owner}:${u.id}`;
      at.set(k, u.y * a.head.W + u.x);
      held.set(k, [...(u.promotions ?? [])]);
      kind.set(k, { type: u.type, religion: num(u.religion), hp: 100 - num(u.damage) });
    }
    logged.forEach((r, i) => {
      const k = `${r[3]}:${r[4]}`;
      if (r[2] === 'UnitMoveComplete' || r[2] === 'UnitAddedToMap' || r[2] === 'UnitTeleported') {
        at.set(k, (r[6] as number) * a.head.W + (r[5] as number));
      } else if (r[2] === 'UnitPromoted') held.set(k, [...(held.get(k) ?? []), r[5] as number]);
      if (r[2] === 'UnitAddedToMap' && !kind.has(k)) {
        const src = logged.slice(Math.max(0, i - 3), i + 4).find((x) => x[3] === r[3]
          && ((x[2] === 'CityMadePurchase' && x[7] === PURCHASE_UNIT_HASH) || (x[2] === 'CityProductionCompleted' && x[5] === 0)));
        const owner = spreadImp.seatOfPlayer.get(r[3] as number);
        const rel = [...spreadImp.religionSeat].find(([, s]) => s === owner)?.[0] ?? -1;
        if (src) kind.set(k, { type: (src[2] === 'CityMadePurchase' ? src[8] : src[6]) as number, religion: rel, hp: 100 });
      }
      if (r[2] !== 'UnitOperationStarted' || r[5] !== OP_SPREAD) return;
      // the unit's charge row follows its operation, other rows between
      // (runs/h1_duelw1128 t180: an Apostle's five rows on)
      const mine = logged.slice(i + 1).filter((x) => x[3] === r[3] && x[4] === r[4]);
      const until = mine.findIndex((x) => x[2] === 'UnitOperationStarted' || x[2] === 'UnitRemovedFromMap');
      const spent = (until < 0 ? mine : mine.slice(0, until)).find((x) => x[2] === 'UnitChargesChanged');
      const u = kind.get(k);
      if (!spent || !u || at.get(k) === undefined) return;
      logSpreads!.push({ owner: r[3] as number, religion: u.religion, plot: at.get(k)!, type: u.type, hp: u.hp,
        promos: (held.get(k) ?? []).length, held: held.get(k) ?? [], n: (spent[6] as number) - (spent[5] as number) });
    });
  }
  const unitTurn = (seat: number) => {
    for (const sp of logSpreads ?? acts.spreads) {
      if (spreadImp.seatOfPlayer.get(sp.owner) !== seat) continue;
      const type = engineRowOf(cat, 'unit', sp.type);
      const actor = seatOf(spreadState, seat);
      const here = spreadState.map.tiles[sp.plot];
      const centres = spreadCentres(spreadState, here);
      const unit: Unit = { id: -1, type: type ?? '', seat, tileIndex: sp.plot, movesLeft: 1, movesFull: 1, hp: sp.hp,
        charges: (sp.n ?? 0) + 1, xp: 0, level: 1 };
      // the promotions the unit held, by the catalog's names, on the
      // engine's rows of its class
      const heldIds = (sp as { held?: number[] }).held;
      const names = (heldIds ?? []).map((p) => (cat.unitPromotions ?? [])[p]?.replace(/^PROMOTION_/, ''));
      const bits = names.map((n) => unitPromoRows(unit).findIndex((p) => p.id === n));
      unit.promos = bits.reduce((m, k) => (k >= 0 ? m | (1 << k) : m), 0);
      if (!actor || sp.n === null || bits.some((k) => k < 0) || (sp.promos > 0 && !heldIds) || (type !== 'MISSIONARY' && type !== 'APOSTLE')
        || centres.length !== 1 || spreadImp.religionSeat.get(sp.religion) !== seat) {
        unclear.push(sp.plot);
        continue;
      }
      for (let k = 0; k < sp.n; k++) spreadFromUnit(spreadState, unit, actor, centres[0]);
    }
  };
  // a religious unit another player's unit killed on its move (the log's
  // UnitRemovedFromMap right after the mover's UnitMoveComplete onto its plot):
  // the engine's `religiousUnitLost` on the mover's turn (1121 t110: a
  // barbarian on China's Missionary by Taiyuan, -125 in Xi'an and Taiyuan)
  const killsBy = new Map<number, [number, number][]>();
  {
    // each unit's plot and, for one the pair made, its type (the purchase or
    // completion beside its UnitAddedToMap row) and its owner's religion
    const placeOf = new Map<string, number>();
    const made = new Map<string, number>();
    for (const u of a.units) placeOf.set(`${u.owner}:${u.id}`, u.y * a.head.W + u.x);
    let activeNow = -1;
    (logged ?? []).forEach((r, i) => {
      if (r[2] === 'PlayerTurnActivated') activeNow = r[3] as number;
      else if (r[2] === 'PlayerTurnDeactivated') activeNow = -1;
      if (r[2] === 'UnitMoveComplete' || r[2] === 'UnitAddedToMap' || r[2] === 'UnitTeleported') {
        placeOf.set(`${r[3]}:${r[4]}`, (r[6] as number) * a.head.W + (r[5] as number));
      }
      if (r[2] === 'UnitAddedToMap') {
        const src = logged!.slice(Math.max(0, i - 3), i + 4).find((x) => x[3] === r[3]
          && ((x[2] === 'CityMadePurchase' && x[7] === PURCHASE_UNIT_HASH) || (x[2] === 'CityProductionCompleted' && x[5] === 0)));
        if (src) made.set(`${r[3]}:${r[4]}`, (src[2] === 'CityMadePurchase' ? src[8] : src[6]) as number);
      }
      if (r[2] !== 'UnitRemovedFromMap') return;
      const u = a.units.find((x) => x.owner === r[3] && x.id === r[4]);
      const type = u ? u.type : made.get(`${r[3]}:${r[4]}`);
      const at = placeOf.get(`${r[3]}:${r[4]}`);
      // the mover onto its plot, else the player whose turn removed it (a
      // barbarian's attack: runs/h1_duelw1120 t81, China's Missionary gone in
      // the barbarians' turn, -125 in Xi'an)
      const mover = logged![i - 1];
      const movedOnto = mover?.[2] === 'UnitMoveComplete' && mover[3] !== r[3] && (mover[6] as number) * a.head.W + (mover[5] as number) === at;
      const by = movedOnto ? mover[3] as number : activeNow >= 0 && activeNow !== r[3] ? activeNow : undefined;
      if (type === undefined || at === undefined || !unitReligious(engineRowOf(cat, 'unit', type) ?? '') || by === undefined) return;
      const owner = spreadImp.seatOfPlayer.get(r[3] as number);
      const rel = u ? spreadImp.religionSeat.get(num(u.religion))
        : owner !== undefined && [...spreadImp.religionSeat.values()].includes(owner) ? owner : undefined;
      if (rel === undefined) return;
      const killer = spreadImp.seatOfPlayer.get(by) ?? BARB_SEAT;
      killsBy.set(killer, [...(killsBy.get(killer) ?? []), [rel, at]]);
    });
  }
  const killTurn = (seat: number) => {
    for (const [rel, at] of killsBy.get(seat) ?? []) religiousUnitLost(spreadState, rel, at);
    killsBy.delete(seat);
  };
  // each Great Person the log activates, on its owner's turn, where the log
  // last placed its unit (Vatican City's suzerain, `gpActivatedPressure`)
  const activations: { seat: number; at: number }[] = [];
  {
    const placeOf = new Map<string, number>();
    for (const u of a.units) placeOf.set(`${u.owner}:${u.id}`, u.y * a.head.W + u.x);
    for (const r of logged ?? []) {
      if (r[2] === 'UnitMoveComplete' || r[2] === 'UnitAddedToMap' || r[2] === 'UnitTeleported') {
        placeOf.set(`${r[3]}:${r[4]}`, (r[6] as number) * a.head.W + (r[5] as number));
      } else if (r[2] === 'UnitGreatPersonActivated') {
        const seat = spreadImp.seatOfPlayer.get(r[3] as number);
        const at = placeOf.get(`${r[3]}:${r[4]}`);
        if (seat !== undefined && at !== undefined) activations.push({ seat, at });
      }
    }
  }
  const gpTurn = (seat: number) => {
    for (const x of activations) if (x.seat === seat) gpActivatedPressure(spreadState, seat, x.at);
  };
  for (const s of spreadState.seats) {
    spreadReligiousPressure(spreadState, s.seat);
    growAt(s.seat);
    unitTurn(s.seat);
    gpTurn(s.seat);
    killTurn(s.seat);
    routeTurn(s.seat);
  }
  for (const seat of [...killsBy.keys()]) killTurn(seat);
  for (const cs of spreadState.cityStates ?? []) growAt(cs.seat);
  growAt(FREE_SEAT);
  const spreadCities = new Map<string, City>();
  for (const s of spreadState.seats) for (const c of s.cities) spreadCities.set(`${s.seat}:${c.id}`, c);

  // the player whose turn the records were read in (the local seat, or in
  // an observer game the active player): its actions come between the
  // record and its next turn start; every other player starts, then acts
  const seatInTurn = a.players.find((p) => bool(p.turnActive))?.id ?? num(a.head.localPlayer);
  // the row the pair's congress session closed on (none: -1)
  const congressClosed = logged ? logged.findIndex((r) => r[2] === 'WorldCongressFinished') : -1;
  // that player's turn starts in the pair: one, but none where record t+1
  // was written before its turn start and two in the pair after (the log's
  // PlayerTurnActivated rows; 1118 Rome t100 -> t101 banks nothing, t101 ->
  // t102 twice, one such pair in each of 1117-1124)
  const inTurnStarts = logged ? logged.filter((r) => r[2] === 'PlayerTurnActivated' && r[3] === seatInTurn).length : 1;
  // the citizens the turn's random events took (a fire's POPULATION_LOSS, a
  // flood's, a storm's): a CityPopulationChanged row, one citizen each, in
  // the event step after the last player closed turn t — after every other
  // player's turn start, before the in-turn player's next (runs/h1_duelw1128
  // Xi'an t47: a Settler, the growth to 5, a fire's loss to 4; runs/h1_duelw1127
  // Rome t47: the fire's loss to 4, then the growth back to 5 at its start)
  const eventPopLoss = new Map<string, number>();
  if (logged) {
    let closed = -1;
    logged.forEach((r, i) => {
      if (r[1] === a.turn && r[2] === 'PlayerTurnDeactivated') closed = i;
    });
    logged.forEach((r, i) => {
      if (closed < 0 || i <= closed || r[1] !== a.turn || r[2] !== 'CityPopulationChanged') return;
      const k = `${r[3]}:${r[4]}`;
      eventPopLoss.set(k, (eventPopLoss.get(k) ?? 0) + 1);
    });
  }
  // the citizens a village gave (GOODYHUT_ADD_POP): the city's
  // CityPopulationChanged row just before its owner's GoodyHutReward
  // (runs/h1_duelw1128 Rome t5: a Warrior's village, 2 -> 3 in Rome's actions)
  const villageGifts = new Map<string, number>();
  (logged ?? []).forEach((r, i) => {
    if (r[2] !== 'CityPopulationChanged' || !logged!.slice(i + 1, i + 3).some((x) => x[2] === 'GoodyHutReward' && x[3] === r[3] && x[6] === GOODY_ADD_POP)) return;
    const k = `${r[3]}:${r[4]}`;
    villageGifts.set(k, (villageGifts.get(k) ?? 0) + 1);
  });
  // the per-city turn step, city by city in the game's order, stats first
  const perSeat = new Map<number, { city: City; dump: DumpCity }[]>();
  for (const { city, dump } of citiesOfImport(imp)) {
    const list = perSeat.get(city.seat) ?? [];
    list.push({ city, dump });
    perSeat.set(city.seat, list);
  }
  for (const [seat, list] of perSeat) {
    // its war weariness as the ledger stands at its processing: its own
    // decay in, its actions not (runs/h1_duelw1128 China t200: 474 less the
    // turn's 50, Xi'an a luxury short at its growth)
    const pidHere0 = imp.playerOfSeat.get(seat) ?? -1;
    const seatHere = seatOf(state, seat);
    if (history?.weary && seatHere && isCiv(seat)) {
      seatHere.ww = wearyAt(history.weary, imp.seatOfPlayer, pidHere0 === seatInTurn ? b.turn : a.turn, pidHere0, 1).get(seat) ?? {};
    }
    // the cities read the luxury allocation the player's resources rebuild
    // before its governors' clocks and its cities' turns (Player DoTurn
    // 0x4e4560: the resources 0x4e46c0 -> 0x4a6110, the governors 0x4e46df,
    // the city turns 0x1fa1d0 at 0x4e4813), so a governor established in
    // this processing moves no luxury before the next (1122 t200: Reyna
    // seated in Changsha, Civil Prestige's amenity re-ranks the luxuries
    // only at t201); a policy change at the processing's start rebuilds it
    // before the cities (the 9 recorded policy-change turns of 1117, 1118,
    // 1121, 1122 read the new ranking, the 6 others the standing one); the
    // same resources step then stores the seat's park amenities
    // (`refreshParkAmenities`, after the allocation 0x4a6110 in 0x4a8ed0:
    // 1121 t243, Chengdu's park pays its 3 at its growth beside the 4
    // luxuries ranked on the 1 it paid before, Happy)
    const standing = luxuryAmenities(state, seat);
    // each city's yield flags: the record's, else those its standing
    // citizens were placed under (`standingFlags`), read on the record's
    // own city before the turn moves it
    const flagsOf = new Map(list.map(({ city, dump: c }) => [city, recordFlags(c) || standingFlags(state, city)]));
    const parksBefore = list.map(({ city }) => city.parkAmenities);
    refreshParkAmenities(state, seat);
    const rankedOnOldParks = (): Map<number, number> => {
      const now = list.map(({ city }) => city.parkAmenities);
      list.forEach(({ city }, j) => { city.parkAmenities = parksBefore[j]; });
      try {
        return luxuryAmenities(state, seat);
      } finally {
        list.forEach(({ city }, j) => { city.parkAmenities = now[j]; });
      }
    };
    // the governors' clocks, before the cities (`governorClocks`)
    governorClocks(state, seat);
    // a citizen the record caught idle stays idle through the processing: the
    // citizen manager places it only on a reassign (a growth, an annex, the
    // AI's focus change; runs/h1_duelw1123 Xi'an t175-181: one idle, the
    // growth banking its surplus; runs/h1_duelw1128 Nazca t59: a Lighthouse
    // bought in the processing, its slot empty at the growth)
    // the loyalty step's stats, on the turn-start cities (`landProduction`)
    const startStats = new Map(list.map(({ city }) => [city, computeCityStats(state, city)]));
    const sides = new Map<City, (landed: boolean) => void>();
    // a Settler trained or bought beside the city across the pair: its
    // citizen leaves with the turn's production, before the city grows
    // (tools/civ6lab/turn_order_civ6.md, armS: pop 6 -> 5, then the pop-5
    // surplus), unless the city's governor spares it (Provision)
    const settled = new Set<City>();
    const leftLate = new Set<City>();
    for (const { city, dump: c } of list) {
      const next = after.get(`${c.owner}:${c.id}`);
      if (!next || acts.cityChanged.has(`${c.owner}:${c.id}`)) continue;
      sides.set(city, landProduction(state, cat, city, next, a.head.W, c.owner === seatInTurn, lateBuilt.get(`${c.owner}:${c.id}`),
        pillagedAfter(c.owner)));
      // the Settler stands beside the city, or the city trained it (its
      // queue's head) and it walked off within its first moves
      const trained = (c.queue?.[0] as { UnitType?: number } | undefined)?.UnitType === settlerIdx && next.pop === c.pop - 1;
      // where the record logs its events, the Settler is this city's: it
      // completed the Settler or bought one, seen at the next record or
      // settled before it (1117 Xi'an t34: a Settler the game handed China
      // beside it takes no citizen; Longxi t63: its Settler founded at once)
      if (logged ? madeSettler(c) : acts.unitsNew.some((u) => u.owner === c.owner && u.type === settlerIdx
        && tileDistance(state, u.plot, city.centerIndex) <= (trained ? SETTLER_WALK : 1))) {
        settled.add(city);
        if (c.owner !== seatInTurn && lateSettlers.has(`${c.owner}:${c.id}`)) leftLate.add(city);
        else if (!governorFlag(state, city, (e) => e.settlerFreePop)) {
          city.population = Math.max(1, city.population - 1);
          // the citizens re-placed on the loss, all of them (the citizen
          // manager, `replaceAllCitizens`: 1121 t21 Xi'an grows back on the
          // Spices, t231 Shanghai's five specialists back on plots)
          replaceAllCitizens(state, city, recordFlags(c));
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
    const pa = a.players.find((q) => q.id === imp.playerOfSeat.get(seat));
    const pb = b.players.find((q) => q.id === imp.playerOfSeat.get(seat));
    landResearch(state, cat, seat, b, history, pa, pb);
    // the envoys the player sent in its actions before its turn start stand
    // at its city turns (the InfluenceGiven rows of the actions opening the
    // pair's log; 1121 t33: Rome's first envoy to Ayutthaya on meeting it, +1
    // Culture in Rome at its start); those its start sends before its cities
    // reach them only the turn after (1121 t156: China's two to Ayutthaya,
    // 1122 t226, 1119 t74, 1123 t71: the cities bank no envoy bonus)
    const pidHere = imp.playerOfSeat.get(seat) ?? -1;
    if (logged && isCiv(seat) && pidHere === seatInTurn) {
      const to = logged.findIndex((r) => r[2] === 'PlayerTurnDeactivated' && r[3] === pidHere);
      let moved = false;
      for (const m of b.players) {
        const cs = imp.minorOfPlayer.get(m.id);
        if (!cs || !bool(m.minor)) continue;
        const n = logged.filter((r, j) => j < to && r[2] === 'InfluenceGiven' && r[3] === m.id).length;
        if (n > 0) {
          cs.envoys[seat] = (cs.envoys[seat] ?? 0) + n;
          moved = true;
        }
      }
      if (moved) resolveSuzerains(state);
    }
    // the player's Gold, upkeep and bankruptcy come before its cities: the
    // turn's growth reads the shortfall this processing leaves (1121 Rome
    // t133: the treasury short again, amenities 1 -> 0 before the box, which
    // stood at 37.70 where the record's standing loss grew the city)
    if (isCiv(seat)) landShortfall(state, seat, pa, pb);
    const relaidSeat = relayImprovements(imp.playerOfSeat.get(seat) ?? -1);
    const eventStep = (imp.playerOfSeat.get(seat) ?? -1) === seatInTurn ? relayEventStep() : () => {};
    // each city's turn reads the productions its own and the earlier cities'
    // turns completed, not a later city's (Player DoTurn walks the cities in
    // order, each its production, growth and border; 1121 t199: Jiaodong's
    // completion after Taiyuan's turn moves Taiyuan's trade route only for
    // the next); what the log shows no completion for, or with no log what
    // a player who spent Gold in the pair may have bought (1110 t238:
    // Handan's Audience Chamber lifts Xi'an's amenities before its border),
    // stands before every city
    const completedIn = (c: DumpCity) => (logged
      ? logged.some((x) => x[2] === 'CityProductionCompleted' && x[3] === c.owner && x[4] === c.id)
      : !((acts.goldSpent.get(c.owner) ?? 0) > 0));
    const landTo = (i: number) => list.forEach(({ city, dump }, j) => sides.get(city)?.(j <= i || !completedIn(dump)));
    // cards the player re-slots in its processing (a GovernmentPolicyChanged
    // row before its turn start) reach the cities whose turns come after
    // them: a completion in an earlier city that opens a slot re-slots the
    // cards mid-walk (1121 t206: Xi'an's Alhambra, then Taiyuan and Shanghai
    // bank their culture without Liberalism's and Civil Prestige's
    // amenities), and cards re-slotted before any city's turn reach them all
    const ownerId = imp.playerOfSeat.get(seat) ?? -1;
    const startRow = logged ? (activatedAt.get(ownerId) ?? -1) : -1;
    const policyRow = logged && startRow >= 0 && isCiv(seat)
      ? logged.findIndex((x, j) => j < startRow && x[2] === 'GovernmentPolicyChanged' && x[3] === ownerId) : -1;
    // the processing opens where the player before it closed its turn
    const opened = policyRow < 0 ? -1 : logged!.slice(0, policyRow).map((x) => x[2]).lastIndexOf('PlayerTurnDeactivated');
    // the last city whose turn shows a row before the re-slot: a completion
    // of its own production opened the slot, so its growth and border come
    // after the re-slot (1121 t206: Xi'an's Alhambra, its border banked on the
    // laid-back cards' Culture); any other row was a step of its turn that
    // came before
    const lastWalked = policyRow < 0 ? -1 : list.reduce((m, { dump }, j) => (logged!.some((x, r) => r > opened && r < policyRow
      && String(x[2]).startsWith('City') && x[3] === ownerId && x[4] === dump.id) ? j : m), -1);
    const lastRow = lastWalked < 0 ? undefined : logged!.slice(opened + 1, policyRow)
      .filter((x) => String(x[2]).startsWith('City') && x[3] === ownerId && x[4] === list[lastWalked].dump.id).pop();
    const policyFrom = policyRow < 0 ? Infinity
      : lastWalked + (lastRow?.[2] === 'CityProductionCompleted' ? 0 : 1);
    // the government the processing changed to, its cards, and the cards its
    // slot rebuild laid back unattached (1121 t168: Oligarchy to Monarchy,
    // Liberalism and Civil Prestige laid back pay Xi'an, Taiyuan and Shanghai
    // no amenity at their border turns)
    const slotCards = (): void => {
      if (!pb) return;
      const sp = seatOf(state, seat)!;
      const gov = engineId('government', cat.governments[num(pb.government)] ?? '', 'GOVERNMENT_', GOVERNMENTS);
      if (gov) sp.government.chosen = gov as typeof sp.government.chosen;
      landPolicies(state, cat, seat, b, history, pb);
    };
    // cards re-slotted before the city walk reach the luxury rebuild that
    // follows them (1128 t202: Monarchy, Civil Prestige laid back, Taiyuan's
    // three luxuries ranked on the new cards)
    if (policyFrom === 0) slotCards();
    const lux = JSON.stringify(pa?.policies) !== JSON.stringify(pb?.policies) ? rankedOnOldParks() : standing;
    // a wonder the processing completes annexes its plots with it, before
    // the city grows (the start's CityTileOwnershipChanged rows before its
    // WonderCompleted, `wondersInStart`); the annex clears the stored next
    // plot. It also re-places every citizen (0x1a8b70 -> 0x196320) under the
    // city's yield flags: the record's (runs/h1_duelw1129: one step.growth
    // more), else those its standing citizens were placed under
    // (`standingFlags`: runs/h1_duelw1128 Jiaodong t185, two plots with its
    // wonder, re-placed on surplus 7); a city whose standing citizens no flag
    // set reproduces keeps them where the record placed them (1128 Xi'an
    // t143: re-placed with no flags it banks 10 where the game banks 9)
    const startWin = logged ? startRows(b, ownerId, ownerId === seatInTurn ? turn + 1 : turn) : undefined;
    const startWonders = startWin ? wondersInStart(startWin, ownerId, a.head.W, new Set(a.players.filter((x) => bool(x.barb)).map((x) => x.id))) : undefined;
    for (const [i, { city, dump: c }] of list.entries()) {
      landTo(i);
      // a military unit its production completes stands on the centre from
      // its city turn on, garrisoning the city at its growth and border
      // (`cityGarrisons`; 1124 t157: Taiyuan's new unit pays Retainers'
      // amenity, Content, and the city grows)
      for (const r of startWin ?? []) {
        if (r[2] !== 'CityProductionCompleted' || r[3] !== c.owner || r[4] !== c.id || r[5] !== 0) continue;
        const type = engineId('unit', cat.units[r[6] as number] ?? '', 'UNIT_', UNITS);
        if (type && unitDomain(type) === 'military') spawnUnit(state, type, city.centerIndex, seat);
      }
      // a citizen the city lost outside its food box (no starvation: the box
      // stood) before its owner's turn start is gone at its turn, its citizens
      // placed afresh (1124 Rome t37: 6 -> 5 at the turn's end, its border
      // banking its five citizens' culture); a random event's loss lands on
      // its own (`eventPopLoss`)
      if (logged && startRow > 0 && acts.popOutsideBox.has(`${c.owner}:${c.id}`) && !settled.has(city) && !eventPopLoss.has(`${c.owner}:${c.id}`)
        && (c.owner !== seatInTurn || inTurnStarts === 1)) {
        const lost = logged.slice(0, startRow).filter((r) => r[2] === 'CityPopulationChanged' && r[3] === c.owner && r[4] === c.id).pop();
        if (lost && (lost[5] as number) < city.population && (lost[5] as number) >= 1) {
          city.population = lost[5] as number;
          replaceAllCitizens(state, city);
        }
      }
      const annexed = (startWonders?.get(`${c.owner}:${c.id}`) ?? []).flatMap((w) => w.annexed)
        .filter((q) => !tileBelongsTo(state.map.tiles[q], city));
      if (annexed.length > 0) {
        for (const q of annexed) setTileOwner(state.map.tiles[q], seat, city.id);
        city.nextPlot = -1;
        // the annex re-places before the wonder stands: its plots change
        // hands ahead of its BuildingChanged row, so the citizens are placed
        // on the plots as they read without it (1128 Xi'an t143: the Great
        // Bath's Floodplains Faith not yet paid, the re-place banks 9)
        const held = flagsOf.get(city);
        const side = sides.get(city);
        if (held !== undefined) {
          side?.(false);
          replaceAllCitizens(state, city, held);
          side?.(true);
        }
      }
      if (i === policyFrom) slotCards();
      const k = `${c.owner}:${c.id}`;
      const next = after.get(k);
      const subject = subjectOf(c);
      const gaps = cityGaps(imp, c);
      const skipAll = acts.cityChanged.has(k) || !next ? 'city changed hands or vanished'
        : late.has(c.owner) ? 'a turn start missing from a record' : null;
      // the boxes of a city whose own turn start the pair missed
      const boxSkip = skipAll ?? (lateCities.has(k) ? 'a turn start missing from a record' : null);
      const granted = grant > 0 && !!next && !acts.cityChanged.has(k);
      const evLoss = eventPopLoss.get(k) ?? 0;
      if (evLoss && c.owner === seatInTurn) {
        city.population = Math.max(1, city.population - evLoss);
        replaceAllCitizens(state, city, recordFlags(c));
      }
      // a village's citizen joins in its owner's actions, the box standing:
      // before the in-turn player's start, after every other's
      const gift = villageGifts.get(k) ?? 0;
      if (gift && c.owner === seatInTurn) {
        city.population += gift;
        placeCitizens(state, city, gift, recordFlags(c));
      }
      // the in-turn player grows at its next start, on the session the next
      // record shows (runs/h1_duelw1128 Rome t121 and t141: a session's growth
      // percent attached and detached the turn it is shown)
      const congressAtGrowth = state.congress;
      if (c.owner === seatInTurn) state.congress = congressNext;
      const st = computeCityStats(state, city, lux, getModifiers(state, seat));
      const res = (check: string, ok: boolean, game: unknown, ours: unknown, s?: Record<string, unknown>) =>
        out.push({ turn, check, subject, ok, game, ours, ...gapsFor(gaps, check), ...(ok || !s ? {} : { state: s }) });

      // growth
      const before = { pop: city.population, food: city.foodBox };
      // a record that logs its events names every citizen that came or went
      // outside the box (a harvest's or a cleared feature's lump, a Settler,
      // an event's loss, a village's gift): one with no log cannot tell them
      const outside = !logged && acts.popOutsideBox.has(k) && !settled.has(city) && !granted && !evLoss ? 'a citizen came or went outside the food box' : null;
      const growSkip = boxSkip ?? outside;
      // a feature cleared or a resource harvested off the city's plots across
      // the pair pays its Food into the box in the owner's actions: before
      // its turn start for the player the records were read in, after it for
      // every other, the city growing at once where the lump fills its box
      // (`lumpFood`; runs/h1_duelw1112 Xi'an: a Rainforest cleared t49 +11 grows it to 7
      // with 9.55 left, a Marsh t74 +31 to 11 with 3.02)
      const lump = actionFood(state, cat, a, b, city, c);
      let stLump = st;
      if (c.owner === seatInTurn && lump > 0) {
        const pop0 = city.population;
        lumpFood(city, lump, state.turn);
        if (city.population > pop0) {
          placeCitizens(state, city, 1, recordFlags(c));
          stLump = computeCityStats(state, city, lux, getModifiers(state, seat));
        }
      }
      const starts = c.owner === seatInTurn ? inTurnStarts : 1;
      // the size before the last start and the stats it grew on: its
      // citizen placed after the loop
      let popLast = city.population;
      let statsLast = stLump;
      // the culture each start but the last banks, on the city it grew to
      const earlierCulture: number[] = [];
      for (let k = 0; k < starts; k++) {
        // a second start grows the city the first left, the citizen that
        // start added at work, and banks on it (1121 t134: Rome grows to 8
        // at its first start and banks its Unhappy culture, then starves back
        // to 7, its box 37, at the second)
        if (k > 0) {
          if (city.population === popLast + 1) placeCitizens(state, city, 1);
          else if (city.population < popLast) replaceAllCitizens(state, city);
          statsLast = computeCityStats(state, city, lux, getModifiers(state, seat));
          earlierCulture.push(statsLast.total.culture);
        }
        popLast = city.population;
        seatGrowth(city, statsLast.effectiveFoodSurplus, statsLast.growthNeeded, state.turn);
      }
      state.congress = congressAtGrowth;
      // the actions after the turn start: the turn's border step stands on
      // the city its start left
      let popAfter = city.population;
      if (leftLate.has(city) && !governorFlag(state, city, (e) => e.settlerFreePop)) popAfter = Math.max(1, popAfter - 1);
      if (evLoss && c.owner !== seatInTurn) popAfter = Math.max(1, popAfter - evLoss);
      if (gift && c.owner !== seatInTurn) popAfter += gift;
      let boxAfter = city.foodBox;
      if (c.owner !== seatInTurn && lump > 0) ({ pop: popAfter, box: boxAfter } = lumpGrowth(popAfter, boxAfter, lump));
      if (growSkip || !next) out.push({ turn, check: 'step.growth', subject, ok: true, skip: growSkip ?? 'no t+1' });
      else {
        // a record with no congress table holds none of the growth percents a
        // session attaches and detaches (the Migration Treaty, its residue)
        const ok = popAfter + (granted ? grant : 0) === next.pop && near(boxAfter, num(next.food), 0.05);
        const g = gapsFor(gaps, 'step.growth');
        out.push({ turn, check: 'step.growth', subject, ok, game: [next.pop, num(next.food)],
          ours: [popAfter + (granted ? grant : 0), round3(boxAfter)],
          ...(!ok && a.congress === undefined ? { gaps: [...(g.gaps ?? []), 'congress unrecorded'] } : g),
          ...(ok ? {} : { state: { before, surplus: round3(st.foodSurplus), effective: round3(st.effectiveFoodSurplus),
            needed: st.growthNeeded, housing: st.housing, tier: st.amenities.tier.name } }) });
      }
      // border growth, the plots gained another way landed first; a record
      // with no event log reads them off the Gold: with gold spent, every
      // plot the city gained but the one its box paid for (the box fell and
      // the plot is the turn's next plot), and a box that fell on a gain
      // without its next plot is no telling which was bought
      const gainedGame = acts.plotsGained.get(k) ?? [];
      const boxPaid = !!next && num(next.culture) < num(c.culture) - 0.01;
      const spent = (acts.goldSpent.get(c.owner) ?? 0) > 0;
      // where the record logs its events, the culture claims are the plots
      // the city took in its start (its CityTileOwnershipChanged rows there,
      // no purchase's and no wonder's): every other plot it gained came
      // another way — a purchase, a wonder completed in its actions (1117
      // t26: Xi'an's Stonehenge, 518 and 650), a plot taken in its actions
      // with no purchase row (1124 t175: Beijing's 222)
      const startClaims = startWin?.filter((x) => x[2] === 'CityTileOwnershipChanged' && x[3] === c.owner && x[4] === c.id)
        .map((x) => (x[6] as number) * a.head.W + (x[5] as number))
        .filter((q) => !annexed.includes(q) && !logged!.some((x) => x[2] === 'CityMadePurchase' && x[7] === PURCHASE_PLOT_HASH
          && x[3] === c.owner && x[4] === c.id && (x[6] as number) * a.head.W + (x[5] as number) === q));
      const gotElse = startClaims ? gainedGame.filter((q) => !startClaims.includes(q) && !annexed.includes(q)) : undefined;
      const boughtPlots = gotElse ?? (spent ? gainedGame.filter((q) => !(boxPaid && q === num(c.nextPlot)) && !annexed.includes(q)) : []);
      const bought = !gotElse && spent && boxPaid && gainedGame.length > 0 && !gainedGame.includes(num(c.nextPlot));
      for (const q of boughtPlots) setTileOwner(state.map.tiles[q], seat, city.id);
      // a stored plot gone (an annex cleared it, another city took it) is
      // drawn afresh among the lowest-cost ties on the game's generator, which
      // the city.nextPlotDraw check replays: the claim stands on the game's plot where
      // it is one of the engine's ties
      const claim = gainedGame.filter((q) => !annexed.includes(q) && !boughtPlots.includes(q));
      const stored = city.nextPlot ?? -1;
      if (claim.length === 1 && (stored < 0 || tileClaimed(state.map.tiles[stored]))
        && borderBestPlots(state, city).includes(claim[0])) city.nextPlot = claim[0];
      const plotsBefore = new Set(state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id).map((t) => t.index));
      const boxBefore = city.cultureBox;
      // the citizen the growth added is placed beside the rest, and a city
      // that starved re-places them all (the citizen manager, `citizens.ts`),
      // under the yield flags the record holds. The flags the AI sets in its
      // start (the CityFocusChanged rows before its activation, each a full
      // re-place) come after the city turns: the border banks on the
      // citizens the growth left (runs/h1_duelw1129: re-placing at those rows
      // before the border step, 112 step.border passes fewer; before the
      // growth, 129 step.growth fewer)
      if (city.population === popLast + 1) placeCitizens(state, city, 1, flagsOf.get(city) ?? '');
      else if (city.population < popLast) replaceAllCitizens(state, city, flagsOf.get(city) ?? '');
      const culture = cultureAfterGrowth(state, city, popLast, statsLast, lux);
      // the culture turn reads the session standing at the owner's turn
      // start: the one the next record shows where the session closed (the
      // log's WorldCongressFinished row, at the turn change) before that
      // start, else record t's. A Border Control Treaty holds the target's
      // boxes from its first start after the session through the start
      // before its successor's (runs/h1_duelw1112 Ravenna: held 141 -> 142,
      // banked 181 -> 182; runs/h1_duelw1128 China, the target, banks 161 ->
      // 162 in its turn before the session and holds from 162)
      const congressWas = state.congress;
      if (!logged || c.owner === seatInTurn || (activatedAt.get(c.owner) ?? -1) > congressClosed) state.congress = congressNext;
      for (let k = 0; k < starts; k++) cityBorderGrowth(state, city, seat, k < starts - 1 ? earlierCulture[k] : culture);
      const frozen = congressBorderFrozen(state, seat);
      state.congress = congressWas;
      if (granted) city.population += grant;
      const gainedOurs = [...annexed, ...boughtPlots, ...state.map.tiles.filter((t) => t.ownerSeat === city.seat && t.ownerCity === city.id
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
      for (const side of sides.values()) side(false);
      for (let k = 0; k < starts; k++) applyLoyalty(state, city, st0.amenities.tier.name, hasGov, st0.foodSurplus < 0);
      landTo(i);
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
        else {
          const okP = keys.every((r) => near(gameD[r], oursD[r], 0.05));
          // a record with no route table holds none of the pressure a Trader's
          // route carries (runs/h1_duelw1103-1104: China's routes, +0.5 and +1
          // a turn on its cities)
          if (!okP && routesUnread) {
            out.push({ turn, check: 'step.pressure', subject, ok: false, game: gameD, ours: oursD, gaps: ['routes:not recorded'] });
          } else res('step.pressure', okP, gameD, oursD, { followersBefore: c.religions, majority: num(c.majorityReligion) });
        }
      }
    }
    landTo(list.length);
    relaidSeat();
    eventStep();
  }

  // A CITY-STATE'S GROWTH on its own turn (`minorGrowth`): its city as
  // record t holds it, the buildings and districts record t+1 shows landed
  // first, as a major's production lands before its growth
  for (const [cs, c] of imp.dumpOfMinor) {
    const k = `${c.owner}:${c.id}`;
    const next = after.get(k);
    const subject = subjectOf(c);
    const skip = !next || acts.cityChanged.has(k) ? 'city changed hands or vanished'
      : late.has(c.owner) || lateCities.has(k) ? 'a turn start missing from a record' : null;
    if (skip || !next) {
      out.push({ turn, check: 'step.minorGrowth', subject, ok: true, skip: skip ?? 'no t+1' });
      continue;
    }
    const city = minorCity(cs);
    // its research completes in its start, before its city (1121 Hunza t84:
    // Stirrups in its start, its Pastures +1 Food in the growth)
    const pa = a.players.find((q) => q.id === c.owner);
    const pb = b.players.find((q) => q.id === c.owner);
    landResearch(state, cat, cs.seat, b, history, pa, pb);
    // its Gold and upkeep come before its city, as a major's do (1121 Antioch
    // t170: 1.5 Gold, 13.5 a turn, 28 upkeep, its growth on the bankrupt tier)
    landShortfall(state, cs.seat, pa, pb);
    // the plots its envoys annexed in the majors' turns stand before its
    // growth, each annex re-placing every citizen (AnnexPlot 0x1a8b70 ->
    // 0x196320; 1121 Hunza t41: 229 annexed, a citizen moved onto it, the
    // growth on surplus 3 where the record's set read 4); with none, its
    // idle citizens stay idle (as a major's do)
    const annexed = acts.plotsGained.get(k) ?? [];
    for (const q of annexed) setTileOwner(state.map.tiles[q], cs.seat);
    if (annexed.length > 0) replaceAllCitizens(state, city, recordFlags(c));
    const undo = landProduction(state, cat, city, next, a.head.W, false, lateBuilt.get(k), pillagedAfter(c.owner));
    const relaid = relayImprovements(c.owner);
    const st = computeCityStats(state, city);
    relaid();
    const before = { pop: city.population, food: city.foodBox };
    seatGrowth(city, st.effectiveFoodSurplus, st.growthNeeded, state.turn);
    undo(false);
    // a feature cleared or a resource harvested in its actions, after its
    // turn start, pays its Food into the box (1117 Caguana t49: +12)
    const lump = actionFood(state, cat, a, b, city, c);
    if (lump > 0) ({ pop: city.population, box: city.foodBox } = lumpGrowth(city.population, city.foodBox, lump));
    // the citizens a random event killed after its turn (`turnEndKills`)
    city.population = Math.max(1, city.population - turnEndKills(c.owner, c.id));
    const ok = city.population === next.pop && near(city.foodBox, num(next.food), 0.05);
    out.push({ turn, check: 'step.minorGrowth', subject, ok, game: [next.pop, num(next.food)], ours: [city.population, round3(city.foodBox)],
      ...gapsFor(cityGaps(imp, c), 'step.minorGrowth'),
      ...(ok ? {} : { state: { before, surplus: round3(st.foodSurplus), effective: round3(st.effectiveFoodSurplus), needed: st.growthNeeded,
        housing: st.housing, tier: st.amenities.tier.name } }) });
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
          if (DISTRICTS[type]?.countsTowardLimit) dedicationEvent(st, seat, DED_MONUMENTALITY);
          if (city) districtMoment(st, seat, city, tile, type);
          if (type === 'CANAL') canalMoment(st, seat);
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
  // an improvement laid across the pair on a plot of its owner's: the first
  // on a plot a natural disaster enriched records its moment
  // (`improvementMoment`, on the turn-t plot's fertility)
  for (let i = 0; i < W * b.head.H; i++) {
    const imp1 = plotAt(b, i)[P.improvement] as number;
    if (typeof imp1 !== 'number' || imp1 < 0 || plotAt(a, i)[P.improvement] === imp1) continue;
    of(plotAt(b, i)[P.owner] as number).events.push([`improvement at ${i}`, (st, seat) => improvementMoment(st, seat, st.map.tiles[i])]);
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
  // one recruited by patronage whose purse paid more than half the price
  // records the PATRONAGE moment (`patronizeGreatPerson`): the purse's drop
  // across the pair, read as a patronage price (Faith 150 + 10 per point
  // lacked, Gold 200 + 15, `patronageCost`), lacks more points than the
  // class held (1117 t73/87/148, 1118 t70, 1121 t125 Faith; 1121 t148 Gold;
  // none of the points-earned persons beside a large purchase: 1117 t138,
  // 1121 t140, 1118 t83)
  const purses = new Map<number, { faith: number; gold: number }>();
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0) continue;
    purses.set(p1.id, { faith: num(p0.faith) + num(p0.faithYield) - num(p1.faith),
      gold: num(p0.gold) + num(p0.goldYield) - num(p0.maintTotal) - num(p1.gold) });
  }
  const patronOf = (pid: number, cls: string): 'faith' | 'gold' | null => {
    const p0 = a.players.find((q) => q.id === pid);
    const k = (cat.greatPersonClasses ?? []).indexOf(`GREAT_PERSON_CLASS_${cls}`);
    const purse = purses.get(pid);
    if (!p0 || k < 0 || !purse || !Array.isArray(p0.gpp)) return null;
    const held = num(p0.gpp[k]);
    // half exactly is no patronage moment (1121 t155: 430 Faith for 28 of 56)
    const over = (lacked: number) => lacked > held + 0.5;
    const by: 'faith' | 'gold' | null = over((purse.faith - 150) / 10) ? 'faith' : over((purse.gold - 200) / 15) ? 'gold' : null;
    if (by) purse[by] = 0;
    return by;
  };
  const gp = (patron: 'faith' | 'gold' | null) => (st: GameState, seat: number) => greatPersonMoment(st, seat, st.gameEra ?? 0, patron);
  const before = new Set(a.units.map((u) => `${u.owner}:${u.id}`));
  const gpUnits = new Map<number, number>();
  for (const u of b.units) {
    const name = cat.units[u.type] ?? '';
    if (!before.has(`${u.owner}:${u.id}`) && name.startsWith('UNIT_GREAT_')) {
      of(u.owner).events.push([`great person ${strip(name, 'UNIT_GREAT_')}`, gp(patronOf(u.owner, strip(name, 'UNIT_GREAT_')))]);
      gpUnits.set(u.owner, (gpUnits.get(u.owner) ?? 0) + 1);
    }
  }
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (!p0 || !bool(p1.major) || !Array.isArray(p0.gpp) || !Array.isArray(p1.gpp)) continue;
    const spent = p1.gpp.filter((v, k) => num(v) < num(p0.gpp[k])).length;
    for (let n = gpUnits.get(p1.id) ?? 0; n < spent; n++) of(p1.id).events.push(['great person (points spent)', gp(null)]);
  }
  // a city-state's military levied: a major's unit new at t+1 is a unit of
  // the same type a city-state lost within 3 plots of it (the importer's
  // levy reading), one moment per city-state levied
  {
    const live = new Set(b.units.map((u) => `${u.owner}:${u.id}`));
    const minors = new Set(b.players.filter((p) => bool(p.minor)).map((p) => p.id));
    const majors = new Set(b.players.filter((p) => bool(p.major)).map((p) => p.id));
    const lost = a.units.filter((u) => minors.has(u.owner) && !live.has(`${u.owner}:${u.id}`));
    const shape = { width: W, height: b.head.H, wrapX: bool(b.head.wrapX) };
    const levied = new Set<string>();
    for (const u of b.units) {
      if (before.has(`${u.owner}:${u.id}`) || !majors.has(u.owner)) continue;
      const from = lost.find((g) => g.type === u.type && hexDistance(shape, g.x, g.y, u.x, u.y) <= 3);
      if (from && !levied.has(`${u.owner}:${from.owner}`)) {
        levied.add(`${u.owner}:${from.owner}`);
        of(u.owner).events.push(['levy', levyMoment]);
      }
    }
  }
  // a route gone with its Trader alive ran to its end: Reform the Coinage's
  // era score per route completed (`tradeRouteExpiry`; 1124 China: three
  // pairs t124–146 at +1 with no moment)
  {
    const liveNow = new Set(recordRoutes(b).map(routeKey));
    const units = new Set(b.units.map((u) => `${u.owner}:${u.id}`));
    const done = new Map<number, number>();
    for (const r of recordRoutes(a)) {
      if (liveNow.has(routeKey(r)) || !units.has(`${r.TraderUnitPlayer}:${r.TraderUnitID}`)) continue;
      done.set(r.TraderUnitPlayer, (done.get(r.TraderUnitPlayer) ?? 0) + 1);
    }
    for (const [pid, n] of done) of(pid).events.push([`routes done ${n}`, (st, seat) => dedicationEvent(st, seat, DED_COINAGE, n)]);
  }
  // a barbarian camp gone from its plot: the major whose unit stands there
  // at t+1 destroyed it, or the one the log moves onto it as it goes
  // (runs/h1_duelw1127 t50: Rome's unit clears 33,22 and walks on)
  const campIdx = cat.improvements.indexOf('IMPROVEMENT_BARBARIAN_CAMP');
  const rowsB = ((b as TurnRecord & { actions?: unknown[][] }).actions ?? []) as unknown[][];
  const isMajor = (pid: unknown) => b.players.some((p) => p.id === pid && bool(p.major));
  for (let i = 0; campIdx >= 0 && i < W * b.head.H; i++) {
    if (plotAt(a, i)[P.improvement] !== campIdx || plotAt(b, i)[P.improvement] === campIdx) continue;
    let owner = b.units.find((u) => u.y * W + u.x === i && isMajor(u.owner))?.owner;
    if (owner === undefined) {
      const gone = rowsB.findIndex((r) => r[2] === 'ImprovementRemovedFromMap' && (r[4] as number) * W + (r[3] as number) === i);
      for (let j = gone - 1; gone > 0 && j >= 0; j--) {
        const r = rowsB[j];
        if (r[2] !== 'UnitMoved' || (r[6] as number) * W + (r[5] as number) !== i) continue;
        if (isMajor(r[3])) owner = r[3] as number;
        break;
      }
    }
    if (owner !== undefined) of(owner).events.push([`camp ${i}`, (st, seat) => campMoment(st, seat, i)]);
  }
  for (const [i, by] of villagesEntered(a, b, cat)) of(by).events.push([`village ${i}`, goodyMoment]);
  // a flood the step of t+1 began (the record's event row, its plot the
  // flood's start): its river's shield names the mitigating player
  // (`riverShield`, `mitigatedFloodMoment`; runs/h1_duelw1128 t160: China's
  // Dam on the Amur, +1)
  for (const e of (Array.isArray(b.events) ? b.events : []) as unknown[][]) {
    if (num(e[0] as number) !== b.turn || !String(cat.randomEvents?.[num(e[1] as number)] ?? '').startsWith('RANDOM_EVENT_FLOOD')) continue;
    const plot = num(e[3] as number);
    for (const p of b.players) {
      if (!bool(p.major)) continue;
      of(p.id).events.push([`flood at ${plot}`, (st, seat) => {
        const shield = riverShield(riverReach(st.map, st.map.tiles[plot]));
        if (shield && tileSeat(shield) === seat) mitigatedFloodMoment(st, seat);
      }]);
    }
  }
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
  // a major that has met every living major by t+1 and had not at t: the
  // first in the world while no major had at t
  const metAll = (r: TurnRecord, p: DumpPlayer) => {
    const met = new Set(Array.isArray(p.met) ? p.met : []);
    return r.players.every((q) => q.id === p.id || !bool(q.major) || met.has(q.id));
  };
  const firstMet = !a.players.some((p) => bool(p.major) && metAll(a, p));
  for (const p1 of b.players) {
    const p0 = a.players.find((q) => q.id === p1.id);
    if (p0 && bool(p1.major) && metAllAcross(a, b, p0, p1)) {
      of(p1.id).events.push(['met all majors', (st, seat) => metAllMajorsMoment(st, seat, firstMet)]);
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
export function seedMoments(state: GameState, imp: Imported, history?: History, rec?: TurnRecord, cat?: Catalog): void {
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
  // the barbarians' research is the world's too (runs/h1_duelw1128 t31:
  // Rome's Iron Working pays TECH_RESEARCHED_IN_ERA_FIRST, 1, the barbarians
  // holding Shipbuilding)
  for (const p of rec && cat ? rec.players : []) {
    if (!bool(p.barb)) continue;
    const ids = (bits: string, names: string[], kind: 'tech' | 'civic', prefix: string, known: object) =>
      [...(bits ?? '')].flatMap((ch, k) => (ch === '1' ? [engineId(kind, names[k], prefix, known)] : []))
        .filter((x): x is string => !!x);
    researchKeys(ids(p.techs, cat!.techs, 'tech', 'TECH_', TECHS), ids(p.civics, cat!.civics, 'civic', 'CIVIC_', CIVICS), world);
  }
  state.momentsWorld = [...world].sort((x, y) => x - y);
}

/** the Moments rows the engines record (each one's `eras.moment.*` source) */
const RECORDED_MOMENTS = new Set(SRC_REGISTRY.filter((r) => r.name.startsWith('eras.moment.') && 'xml' in r.src
  && r.src.col === 'EraScore').map((r) => (r.src as { where: string }).where.replace('MomentType=', '')));
/** what the record cannot show of a recorded moment: no Trading Post */
const RECORD_BLIND_MOMENTS = new Set([
  'MOMENT_TRADING_POST_CONSTRUCTED_IN_EVERY_CIV', 'MOMENT_TRADING_POST_CONSTRUCTED_IN_EVERY_CIV_FIRST_IN_WORLD',
]);
/** the moments a major's revealed plots decide, blind on a pair whose
 *  records do not both carry them (`TurnRecord.revealed`) */
const REVEAL_MOMENTS = new Set(['MOMENT_FIND_NATURAL_WONDER', 'MOMENT_FIND_NATURAL_WONDER_FIRST_IN_WORLD',
  'MOMENT_WORLD_CIRCUMNAVIGATED', 'MOMENT_WORLD_CIRCUMNAVIGATED_FIRST_IN_WORLD']);

/** the gaps a pair's own moments leave the comparison: a paying row the
 *  engines do not record, or one the record cannot show */
function momentGaps(moments: readonly [number, string, number, number][], revealed: boolean): string[] {
  return moments.filter((m) => m[2] !== 0 && (!RECORDED_MOMENTS.has(m[1]) || RECORD_BLIND_MOMENTS.has(m[1])
    || (!revealed && REVEAL_MOMENTS.has(m[1]))))
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
  // t+1 read with the pair's own levies held as levies (`leviesAcross`)
  const ib = importTurn(b, cat, history && { ...history, levied: new Map([...history.levied, ...leviesAcross(a, b)]) });
  seedMoments(state, imp, history, a, cat);
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
      // a record without dedications past the Ancient era (which offers none)
      ...(!Array.isArray(p0.commemorations) && (state.gameEra ?? 0) > 0 ? ['commemorations'] : []),
      ...[...imp.cityByKey].filter(([, c]) => c.seat === seat)
        .flatMap(([k]) => [...(imp.cityGaps.get(k) ?? [])].filter((g) => g.startsWith('building:'))),
      ...momentGaps(fresh, revealedPlots(a, p0.id, 0) !== null && revealedPlots(b, p0.id, 0) !== null),
      // a city founded across the pair on what the engine's landmasses call
      // a new continent, on a map whose continents neither the dump nor the
      // map script gave
      ...(!state.map.continents && b.cities.some((c) => c.owner === p0.id && !a.cities.some((q) => q.x === c.x && q.y === c.y)
        && newContinent(state, seat, c.y * a.head.W + c.x)) ? ['continent: not recorded'] : []),
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
      // the age reads the score as the era turned: the moments the player
      // earned after its era-started moment (a later id) count toward the new
      // era (runs/h1_duelw1127 Rome t150: 19 at the change, a Dark Age, the
      // new era's first technology's +1 after it; runs/h1_duelw1108 Rome
      // t180: a great person's +1 before it, 62, a Golden Age)
      const p1 = b.players.find((q) => q.id === p0.id);
      const seen = new Set((Array.isArray(p0.moments) ? p0.moments : []).map((m) => m[0]));
      const fresh = (Array.isArray(p1?.moments) ? p1!.moments : []).filter((m) => !seen.has(m[0]));
      const turned = fresh.find((m) => String(m[1]).startsWith('MOMENT_GAME_ERA_STARTED'));
      const after = turned ? fresh.filter((m) => num(m[0]) > num(turned[0])).reduce((n, m) => n + num(m[2]), 0) : 0;
      s.eraScore = (s.eraScore ?? 0) - after;
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
