/**
 * Trade routes. A route pays its origin what `District_TradeRouteYields`
 * names for the destination city's districts: the domestic column at home,
 * the international column at a foreign major's or a city-state's city. A
 * city-state runs routes too, from its one city (`minorTrade`).
 */

import { FEATURES } from '../../world/features';
import { addYields, emptyYields, type City, type CityState, type GameState, type Seat, type TradeRoute, type Unit, type YieldKey, type Yields } from './types';
import { BUILDINGS } from '../data/buildings';
import { NO_SEAT, seatOf, citiesOf, isBarbSeat, civsAtWar, allianceTypeWith, isCityStateSeat, seatsAllied, setTileOwner, tileBelongsTo, civOf, tileSeat , leaderOf, routeIntercontinental, onHomeContinent, hiddenResourcesFor } from './seats';
import { ROME_OWN_POST_GOLD, CLEOPATRA_INTL_ROUTE_GOLD, CLEOPATRA_INCOMING_ROUTE_FOOD, CLEOPATRA_INCOMING_ROUTE_GOLD, ROUTE_CAPACITY_ROWS, rowIsFor, type RouteYieldRow } from '../data/civilizations';
import { ALLIANCE_ROUTE_TO, ALLIANCE_ROUTE_YKEY } from '../data/seats';
import { hexDistance, tilesWithin } from '../../world/hex';
import { isImpassable, isWater, isMountain, multiDomainPlot } from '../../world/query';
import { RESOURCES } from '../../world/resources';
import { BUILT_WONDERS } from '../data/builtWonders';
import { disbandUnit, spawnUnit } from './units';
import { routeInRange, tradeCourse, tradeReach } from './tradePath';
import { TRADE_COURSE_MAX, scaleByGameSpeed } from '../data/constants';
import { civEraIndex } from './city';
import { DISTRICTS, DISTRICT_ROUTE_YIELDS } from '../data/districts';
import { UNITS } from '../data/units';
import { cityStateTradeCapacityBonus, hasMet, isSuzerain, minorCity, suzerainEffect, suzerainEffectCount } from './cityStates';
import { completedDistrictCount } from './yields';
import { CITY_STATE_TYPES, CITY_STATE_TYPE_YIELD, CITY_STATE_ROUTE_TO_OTHERS, KUMASI_ROUTE_CULTURE, KUMASI_ROUTE_GOLD, HUNZA_PATH_TILE_GOLD_FX, AMSTERDAM_DEST_LUXURY_GOLD } from '../data/cityStates';
import { emergencyCsRouteGold } from './emergency';
import { congressCsRouteFactor, congressIntlBanned, congressRouteCapacity, congressTradeGold } from './congress';
import { ENHANCER_BELIEFS } from '../data/religion';
import type { RuleResult } from './rules';
import { dedicationEvent, goldenDedication } from './eras';
import { DED_COINAGE, COINAGE_INTL_GOLD_PER_SPEC, TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE } from '../data/seats';

import { gpCityPermOf, gpPermOf } from '../data/greatPeople';
import { srcConst, xml } from '../data/provenance';
import { getModifiers, progressAhead, followerReligionsForCity, followerBeliefForReligion } from './effects';
import { governorSum } from './governors';

/** a living city — any major's, or a city-state — standing at this centre. */
export function centreHasCity(state: GameState, centerIndex: number): boolean {
  return state.seats.some((s) => s.cities.some((c) => c.centerIndex === centerIndex))
    || state.cityStates.some((c) => c.centerIndex === centerIndex);
}

/** The cities a route's stored course passes THROUGH that hold this seat's
 *  Trading Post — the course's plots short of both ends, each a living
 *  city's centre carrying the post. */
export function routeCoursePosts(state: GameState, seat: number, r: TradeRoute): number[] {
  const course = r.course ?? [];
  const posts = seatOf(state, seat)?.tradingPosts ?? [];
  const out: number[] = [];
  for (let i = 1; i < course.length - 1; i++) {
    if (posts.includes(course[i]) && centreHasCity(state, course[i])) out.push(course[i]);
  }
  return out;
}

/** stamp one civ's Trading Post at a centre — sorted, append-once. */
export function stampTradingPost(owner: Seat, centerIndex: number): void {
  const posts = (owner.tradingPosts ??= []);
  if (centerIndex < 0 || posts.includes(centerIndex)) return;
  posts.push(centerIndex);
  posts.sort((a, b) => a - b);
}

/**
 * CIV6 (All Roads Lead to Rome): "All cities you found or conquer start with
 * a Trading Post and, if within Trade Route range of your Capital, a road to
 * it." The road is a route's course from the city to the capital
 * (`tradeCourse`), laid on every passable land plot of it, both ends
 * included.
 */
export function allRoadsLeadToRome(state: GameState, seat: number, centerIndex: number): void {
  const owner = seatOf(state, seat);
  if (!owner || civOf(state, seat) !== 'ROME') return;
  stampTradingPost(owner, centerIndex);
  const cap = owner.cities.find((c) => c.isCapital && c.centerIndex !== centerIndex);
  if (!cap) return;
  const course = tradeCourse(tradeReach(state, seat, centerIndex), cap.centerIndex);
  if (!course) return;
  const tiles = state.map.tiles;
  // passable land only: a portal's mountain carries no road
  for (const at of course) if (!isWater(tiles[at]) && !isImpassable(tiles[at])) tiles[at].road = true;
}

/** The Trading Post this seat holds at a route's foreign DESTINATION: +1
 *  Gold, the destination's share of the path term's T (`routePathGold`
 *  counts the cities the path crosses). Jakarta's suzerain pays the same
 *  city again. */
export function routePostGold(state: GameState, seat: number, destCenter: number): number {
  if (!(seatOf(state, seat)?.tradingPosts ?? []).includes(destCenter)) return 0;
  return 1 + (suzerainEffect(state, seat, 'routePostGold') ? 1 : 0);
}

/** CIV6 (Hunza): "+1 Gold for every 5 tiles a Trade Route travels"
 *  (`MODIFIER_PLAYER_ADJUST_TRADE_ROUTE_YIELD_PER_PATH_TILE`, Amount 0.2).
 *  Trade_Manager 0x54bdb0: n the plots of the route's path, both ends
 *  included; the yield is floor(n x a + a / 2) in 24.8 fixed point. */
export function routeLengthGold(state: GameState, seat: number, r: TradeRoute): number {
  if (!suzerainEffect(state, seat, 'routeLengthGold')) return 0;
  const n = (r.course ?? []).length;
  return Math.floor((n * HUNZA_PATH_TILE_GOLD_FX + (HUNZA_PATH_TILE_GOLD_FX >> 1)) / 256);
}

/** CIV6 (Amsterdam, Antioch): "+1 Gold for each Luxury resource at the
 *  destination" of a route to a foreign city, a city-state's included, once
 *  per such suzerainty. Trade_Manager 0x54c6c0 multiplies the origin city's
 *  amount by City_Resources 0x1f71b0 on the DESTINATION: every luxury PLOT
 *  (a second copy counts again) within 3 rings of its centre that the city
 *  owns. `destCity` null is a city-state's one city: every tile its seat
 *  owns. A luxury has no reveal tech, so the count's visibility test passes. */
export function routeDestLuxuryGold(state: GameState, seat: number, destSeat: number, destCity: number | null,
  centre: number): number {
  const n = suzerainEffectCount(state, seat, 'routeLuxuryGold');
  if (!n) return 0;
  const c = state.map.tiles[centre];
  let lux = 0;
  for (const t of tilesWithin(state.map, c.col, c.row, DEST_LUXURY_RINGS)) {
    if (t.ownerSeat !== destSeat || (destCity !== null && t.ownerCity !== destCity) || !t.resource) continue;
    if (RESOURCES[t.resource]?.category === 'luxury') lux += 1;
  }
  return AMSTERDAM_DEST_LUXURY_GOLD * n * lux;
}
/** the rings City_Resources 0x1f71b0 walks: 1 + 6 + 12 plots and 18 more */
const DEST_LUXURY_RINGS = 3;

/** CIV6 (John Rockefeller, MODIFIER_PLAYER_CITIES_ADJUST_TRADE_ROUTE_YIELD_PER_
 *  DESTINATION_STRATEGIC_FOR_DOMESTIC / _FOR_INTERNATIONAL): the strategic
 *  plots City_Resources 0x1f71b0 counts at the destination — every plot
 *  within 3 rings of its centre that the city owns carrying a strategic
 *  resource the route's owner sees, improved or not, a copy counting again
 *  (runs/h1_duelw1112 Xi'an -> Longxi: +2 Gold at t214 for the unimproved
 *  Oil, +4 from t216 when Combined Arms shows the Uranium). */
export function routeDestStrategicPlots(state: GameState, seat: number, dest: City): number {
  const hidden = hiddenResourcesFor(state, seat);
  const c = state.map.tiles[dest.centerIndex];
  let n = 0;
  for (const t of tilesWithin(state.map, c.col, c.row, DEST_LUXURY_RINGS)) {
    if (!t.resource || hidden.has(t.resource) || !tileBelongsTo(t, dest)) continue;
    if (RESOURCES[t.resource]?.category === 'strategic') n += 1;
  }
  return n;
}

/** The Gold of the Trading Posts a route's course passes through, and for
 *  Rome its own post at the destination — the modifiers that name them; the
 *  post's own +1 is the path's (`routePathGold`), which the lab read on
 *  foreign cities alone and never for another civilization's post. */
export function routeChainGold(state: GameState, seat: number, r: TradeRoute): number {
  // CIV6 (Jakarta): "Your Trading Posts in FOREIGN cities provide +1
  // Gold to your Trade Routes PASSING THROUGH or going to the city" — the
  // passing-through half.
  const jakarta = suzerainEffect(state, seat, 'routePostGold');
  // CIV6 (All Roads Lead to Rome): "+1 Gold for passing through Trading
  // Posts in your own cities".
  const rome = civOf(state, seat) === 'ROME';
  if (!jakarta && !rome) return 0;
  let g = 0;
  for (const c of routeCoursePosts(state, seat, r)) {
    const own = tileSeat(state.map.tiles[c]) === seat;
    if (jakarta && !own) g += 1;
    if (rome && own) g += ROME_OWN_POST_GOLD;
  }
  // the posts are counted from the plot past the origin through the
  // DESTINATION (Trade_Manager 0x5500b0): an own city at the end of the
  // course pays Rome too (1108 Aquileia→Antium, +1)
  const course = r.course ?? [];
  const dest = course[course.length - 1];
  if (rome && course.length > 1 && tileSeat(state.map.tiles[dest]) === seat
      && (seatOf(state, seat)?.tradingPosts ?? []).includes(dest) && centreHasCity(state, dest)) g += ROME_OWN_POST_GOLD;
  return g;
}

/**
 * THE ROUTE'S PATH TERM (Gathering Storm's transportation efficiency): the
 * Gold a route earns from its path, D × min(MAX_RATIO, floor(DENOM × S / n)
 * / DENOM) + T. D is the Gold the destination's own rows pay the leg
 * (`District_TradeRouteYields`); n every plot of
 * the Trader's path, both ends included; S the path's score — WATER per
 * water plot, RAIL per railroad plot and MULTI_DOMAIN per Canal plot past the
 * origin, PORTAL per portal the Trader takes; T one per foreign city the
 * path crosses that holds this
 * seat's Trading Post (the destination's own post is `routePostGold`). The
 * path is the route's stored course (`tradeCourse`).
 */
export const ROUTE_PATH_WATER = srcConst('trade.pathWater', 2,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_SCORE_WATER_TILE', 'Value'));
export const ROUTE_PATH_RAIL = srcConst('trade.pathRail', 2, {
  ...xml('GlobalParameters', 'Name=TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_SCORE_BEST_ROUTE_TILE', 'Value'),
  note: 'the best route is the Railroad; the lab laid them one plot at a time',
});
/** a Canal's plot on the path (`multiDomainPlot`; Trade_Manager 0x5500b0
 *  counts the non-centre plots whose district answers land and water, and
 *  0x54eeb0 weighs that count by this) */
export const ROUTE_PATH_MULTI_DOMAIN = srcConst('trade.pathMultiDomain', 15,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_SCORE_MULTIPLE_DOMAINS', 'Value'));
export const ROUTE_PATH_PORTAL = srcConst('trade.pathPortal', 15,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_SCORE_PORTAL_USE', 'Value'));
export const ROUTE_PATH_MAX_RATIO = srcConst('trade.pathMaxRatio', 1,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_MAX_RATIO', 'Value'));
export const ROUTE_PATH_DENOM = srcConst('trade.pathDenom', 256, {
  lab: 'runs/trade_path_20260926T_c20.jsonl (railroads one plot at a time: D x floor(512/n)/256 per plot)'
    + ' and runs/trade_sweep_20260926T.jsonl (1,948 of 1,948 gold rows)',
  note: 'the ratio is floored to 256ths',
});

export function routePathGold(state: GameState, seat: number, r: TradeRoute, d: number): number {
  const path = r.course ?? [];
  if (path.length < 2) return 0;
  const tiles = state.map.tiles;
  let score = 0;
  for (let i = 1; i < path.length; i++) {
    const at = tiles[path[i]];
    const prev = tiles[path[i - 1]];
    if (isWater(at)) score += ROUTE_PATH_WATER;
    if (at.railroad) score += ROUTE_PATH_RAIL;
    if (multiDomainPlot(at)) score += ROUTE_PATH_MULTI_DOMAIN;
    if (hexDistance(state.map, prev.col, prev.row, at.col, at.row) > 1) score += ROUTE_PATH_PORTAL;
  }
  const t = routeCoursePosts(state, seat, r).filter((c) => tileSeat(tiles[c]) !== seat).length;
  const eff = Math.min(ROUTE_PATH_MAX_RATIO * ROUTE_PATH_DENOM, Math.floor((ROUTE_PATH_DENOM * score) / path.length));
  return (d * eff) / ROUTE_PATH_DENOM + t;
}

/** CIV6 (Great Zimbabwe): "Your Trade Routes from this city get +2 Gold for
 *  every Bonus resource within 3 tiles of the city and in this city's
 *  territory" — a flat Gold add on every OUTGOING route, counted over the
 *  standing bonus resources the city owns within 3 of its centre. */
export function wonderRouteOriginGold(state: GameState, city: City): number {
  let per = 0;
  for (const w of city.wonders ?? []) {
    if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
    per += BUILT_WONDERS[w.id]?.effects?.bonusResRouteGold ?? 0;
  }
  if (!per) return 0;
  const centre = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const t of tilesWithin(state.map, centre.col, centre.row, 3)) {
    if (t.resource && RESOURCES[t.resource]?.category === 'bonus' && tileBelongsTo(t, city)) n += 1;
  }
  return per * n;
}

/** CIV6 (University of Sankore): the Science a foreign route pays the
 *  city holding the wonder (`routesToCityScience`). */
function wonderRouteGainScience(state: GameState, dest: City): number {
  let science = 0;
  for (const w of dest.wonders ?? []) {
    if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
    science += BUILT_WONDERS[w.id]?.effects?.routesToCityScience ?? 0;
  }
  return science;
}

/** CIV6 (University of Sankore): "Other Civilizations' Trade Routes to this
 *  city provide +1 Science and +1 Gold for them" — the DESTINATION's wonder
 *  pays the foreign SENDER. */
function wonderRouteSenderYields(state: GameState, dest: City): { science: number; gold: number } {
  let science = 0;
  let gold = 0;
  for (const w of dest.wonders ?? []) {
    if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
    const fx = BUILT_WONDERS[w.id]?.effects?.foreignRoutesToCitySender;
    if (fx) {
      science += fx.science;
      gold += fx.gold;
    }
  }
  return { science, gold };
}

export const TRADE_ROUTE_DURATION = 20;

/**
 * CIV6 (GS): a route runs a MINIMUM of the base 20 turns
 * (TRADE_ROUTE_TURN_DURATION_BASE) plus the WORLD-era bump
 * (TradeRouteMinimumEndTurnChange: +10 from Medieval, +20 from Industrial,
 * +30 from Information) — and ends only when its Trader completes a round
 * trip after that minimum.
 */
export function tradeRouteMinDuration(state: GameState): number {
  let era = 0;
  for (const s of state.seats) {
    const e = civEraIndex(s.research.techs, s.research.civics);
    if (e > era) era = e;
  }
  const bump = era >= 7 ? 30 : era >= 4 ? 20 : era >= 2 ? 10 : 0;
  return TRADE_ROUTE_DURATION + bump;
}

/** THE PLUNDER PAYOUT (Trade_Manager plunder, GameCore_XP2 0x5545e0;
 *  `tools/civ6lab/dll_plunder.py` 16 of 16 plunders): max(PLUNDER_ROUTE_GOLD,
 *  V × PLUNDER_ROUTE_TURNS), V the route's yield value (`routeYieldValue`),
 *  the turns TRADE_ROUTE_TURN_DURATION_BASE at the game speed halved (online
 *  20 × 50% // 2 = 5), the 50 a literal of the DLL, unscaled. */
export const PLUNDER_ROUTE_GOLD = srcConst('trade.plunderGold', 50, {
  lab: 'runs/plunder_sweep_a0_20260927T004045Z.jsonl and the other plunder records (dll_plunder.py 16 of 16: the two 50s the route term could not reach, Quebec→Halifax V 6 and Quebec→Ngaruawahia V 8)',
  note: 'a literal in the DLL (0x5545e0), not a GlobalParameters row',
});
export const PLUNDER_ROUTE_TURNS = srcConst('trade.plunderTurns',
  Math.floor(scaleByGameSpeed(20) / 2), {
    derived: 'TRADE_ROUTE_TURN_DURATION_BASE through the speed\'s CostMultiplier, halved (GameCore_XP2 0x5545e0 via 0x5254d0)',
    inputs: [xml('GlobalParameters', 'Name=TRADE_ROUTE_TURN_DURATION_BASE', 'Value', { expect: 20 })],
  });
export const GOLD_EQUIVALENT_OTHER_YIELDS = srcConst('trade.goldEquivalentOther', 2,
  xml('GlobalParameters', 'Name=GOLD_EQUIVALENT_OTHER_YIELDS', 'Value'));

/** A walker that cannot come home (its origin city gone) never completes the
 * round trip its expiry waits for — after this many turns past the minimum
 * the route ends anyway: longer than any round trip of a stored course. A
 * rail, not a rule. */
export const TRADE_WALK_EXPIRY_RAIL = 2 * TRADE_COURSE_MAX;

/**
 * CIV6 (TRADER_IS_WITHIN_FOUR_REQUIREMENT, REQUIREMENT_PLOT_NEARBY_UNIT_TAG_MATCHES
 * MinDistance 0 / MaxDistance 4, Tag CLASS_TRADER): how far an escort's
 * protection reaches — "Trader units are immune to being plundered if they are
 * within 4 tiles of a Mandekalu Cavalry and on a land tile", and of a Bireme
 * "and on a water tile". Distance 0 is the escort's own tile.
 */
export const TRADER_GUARD_RADIUS = srcConst('trade.guardRadius', 4,
  xml('RequirementArguments', 'RequirementId=TRADER_IS_WITHIN_FOUR_REQUIREMENT&Name=MaxDistance', 'Value'));

/**
 * The seat that would PLUNDER a Trader standing on `tileIndex` — the LOWEST
 * hostile seat id with a unit there (barbarians always hostile, others by
 * the war matrix), or null. CIV6 (Reform the Coinage, Golden face): "your
 * Traders cannot be plundered."
 */
export function routePlunderer(state: GameState, tileIndex: number, seat: number): number | null {
  if (!state.unitsMode) return null;
  if (goldenDedication(state, seat, DED_COINAGE)) return null;
  // CIV6 (ABILITY_MANDEKALU / ABILITY_BIREME_PROTECT_TRADER,
  // MODIFIER_PLAYER_UNITS_GRANT_ABILITY): the escort grants its OWN seat's
  // Traders within TRADER_GUARD_RADIUS immunity, on the escort's ground alone
  // (DomainType DOMAIN_LAND for the Mandekalu, DOMAIN_SEA for the Bireme).
  const here = state.map.tiles[tileIndex];
  if (here) {
    const ground = isWater(here) ? 'water' : 'land';
    if (state.units.some((g) => {
      if (g.seat !== seat || g.hp <= 0 || UNITS[g.type]?.guardsTraders !== ground) return false;
      const gt = state.map.tiles[g.tileIndex];
      return !!gt && hexDistance(state.map, gt.col, gt.row, here.col, here.row) <= TRADER_GUARD_RADIUS;
    })) return null;
  }
  let raider: number | null = null;
  for (const u of state.units) {
    if (u.tileIndex !== tileIndex) continue;
    const hostile = isBarbSeat(u.seat) || (u.seat !== seat && civsAtWar(state, u.seat, seat));
    if (!hostile) continue;
    if (raider === null || u.seat < raider) raider = u.seat;
  }
  return raider;
}

/**
 * Does the plundering seat stand a HULL on the Trader's tile? CIV6
 * (ABILITY_FRANCIS_DRAKE_PLUNDER_BONUS, ABILITY_CHING_SHIH_PLUNDER_BONUS,
 * MODIFIER_PLAYER_UNIT_ADJUST_PLUNDER_YIELDS): the admirals' "+X% rewards for
 * plundering sea Trade Routes" is an ability tagged CLASS_NAVAL_MELEE /
 * _RANGED / _RAIDER / _CARRIER — every sea-domain chassis this catalog
 * carries — and no requirement set tests the route itself, so it is the
 * plundering unit's class that decides. An embarked passenger is a land unit.
 */
export function plunderedByHull(state: GameState, tileIndex: number, raider: number): boolean {
  return state.units.some((u) => u.seat === raider && u.tileIndex === tileIndex && !!UNITS[u.type]?.naval);
}

/** The Gold the `raider` seat banks for plundering `owner`'s route `r`, whose
 *  Trader stands on `tileIndex`: base = max(PLUNDER_ROUTE_GOLD,
 *  floor(V × PLUNDER_ROUTE_TURNS)), then base + base × pct // 100, pct the
 *  plundering unit's one plunder percent (GameCore_XP2 0x5545e0 reads unit
 *  +0x1858): the raider's policies' (Total War, Letter of Marque, every unit)
 *  plus the admirals' permanent percentage when its hull plunders
 *  (`plunderedByHull`) — each an EFFECT_ADJUST_UNIT_PLUNDER_YIELDS on the
 *  unit, so they add. A city-state raider carries no percent. */
export function routePlunderGold(state: GameState, raider: number, owner: Seat, r: TradeRoute, tileIndex: number): number {
  const rs = seatOf(state, raider);
  if (!rs) return 0;
  const base = Math.max(PLUNDER_ROUTE_GOLD, Math.floor(routeYieldValue(state, owner, r) * PLUNDER_ROUTE_TURNS));
  if (isCityStateSeat(raider)) return base;
  const hull = plunderedByHull(state, tileIndex, raider) ? gpPermOf(rs, 'routePlunderPct') : 0;
  const pct = getModifiers(state, raider).routePlunderPct + hull;
  return base + Math.floor((base * pct) / 100);
}

/** The FREE Trader this seat owns on the LOWEST tile index — the unit the
 * route verb spends. The tile is the cross-engine key (the GPU pool tracks
 * no unit ids, and one civilian per tile makes it unique). */
export function freeTrader(state: GameState, seat: number): Unit | undefined {
  let best: Unit | undefined;
  for (const u of state.units) {
    if (u.seat !== seat || u.type !== 'TRADER') continue;
    if (!best || u.tileIndex < best.tileIndex) best = u;
  }
  return best;
}

/** The CURRENT centre tile of a route's destination — -1 when it no longer
 * resolves (a dead or captured city). */
export function routeDestCenter(state: GameState, owner: Seat, r: TradeRoute): number {
  if (r.toCs !== undefined) return state.cityStates.find((c) => c.id === r.toCs)?.centerIndex ?? -1;
  if (r.toSeatCity !== undefined)
    return seatOf(state, r.toSeat ?? NO_SEAT)?.cities.find((c) => c.id === r.toSeatCity)?.centerIndex ?? -1;
  return owner.cities.find((c) => c.id === r.to)?.centerIndex ?? -1;
}

/** The cities a seat's routes leave from: a major's own, or a city-state's
 *  one city (`minorCity`, id -1 — the `from` its routes carry). */
export function routeCities(state: GameState, seat: number): City[] {
  if (isCityStateSeat(seat)) {
    const cs = seatOf(state, seat) as CityState | undefined;
    return cs ? [minorCity(cs)] : [];
  }
  return citiesOf(state, seat);
}

/** The CURRENT centre tile a route leaves from — -1 once its origin city is
 *  gone. */
export function routeOriginCenter(state: GameState, owner: Seat, r: TradeRoute): number {
  return routeCities(state, owner.seat).find((c) => c.id === r.from)?.centerIndex ?? -1;
}

/** Cancel this seat's routes that `hit` names; each hands its Trader back at
 * the origin (a cancel is not a plunder — the unit survives). */
export function cancelRoutes(state: GameState, seat: number, hit: (r: TradeRoute) => boolean): void {
  const s = seatOf(state, seat);
  if (!s?.tradeRoutes?.length) return;
  const cut = s.tradeRoutes.filter(hit);
  if (!cut.length) return;
  if (state.unitsMode) {
    for (const r of cut) {
      const oc = routeOriginCenter(state, s, r);
      if (oc >= 0) spawnUnit(state, 'TRADER', oc, seat);
    }
  }
  s.tradeRoutes = s.tradeRoutes.filter((r) => !cut.includes(r));
}

/** CIV6: "when you go to war with a civilization, all Trade Routes with them
 * are cancelled, but you do not lose the Traders - instead, you get to
 * reassign them." Both directions of the new war. */
export function cancelRoutesBetween(state: GameState, a: number, b: number): void {
  cancelRoutes(state, a, (r) => r.toSeat === b);
  cancelRoutes(state, b, (r) => r.toSeat === a);
}

export function tradeCapacity(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  let cap = 0;
  if (s?.research.civics.includes('FOREIGN_TRADE')) cap += 1;
  for (const c of routeCities(state, seat)) {
    if (c.buildings.includes('MARKET') || c.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of c.wonders ?? []) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  // CIV6 (Sahel Merchants): "+1 Trade Capacity every time you enter a Golden
  // Age" — cumulative, so it reads the seat's own count of them
  const golden = getModifiers(state, seat).goldenRouteCapacity * (s?.goldenAges ?? 0);
  return cap + cityStateTradeCapacityBonus(state, seat) + congressRouteCapacity(state, seat)
    + gpPermOf(s, 'tradeCapacity') + rosterRouteCapacity(state, seat) + golden;
}

/** CIV6 (EFFECT_ADJUST_TRADE_ROUTE_CAPACITY): the roster's capacity rows. */
export function rosterRouteCapacity(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  const civ = civOf(state, seat);
  const leader = leaderOf(state, seat);
  const cities = citiesOf(state, seat);
  let cap = 0;
  for (const r of ROUTE_CAPACITY_ROWS) {
    if (!rowIsFor(r, civ, leader)) continue;
    if (r.tech !== undefined && !s.research.techs.includes(r.tech)) continue;
    if (r.needsCapital && !cities.some((c) => c.isCapital)) continue;
    if (r.govPlaza && !cities.some((c) => c.districts.some((d) => d.type === 'GOVERNMENT_PLAZA' && state.map.tiles[d.tileIndex].districtComplete))) continue;
    if (r.govTier !== undefined && !cities.some((c) => c.buildings.some((b) => BUILDINGS[b]?.govTier === r.govTier))) continue;
    if (r.perForeignCity) {
      // CIV6 (Pax Britannica): once per city this seat holds off its home
      // continent — the ORIGINAL capital's landmass
      cap += r.amount * cities.filter((c) => !onHomeContinent(state, seat, c.centerIndex)).length;
      continue;
    }
    cap += r.amount;
  }
  return cap;
}

/** The completed specialty districts of a city, a city-state's among them. */
export function specialtyDistricts(state: GameState, city: Pick<City, 'districts'> | CityState): number {
  return (city.districts ?? []).filter(
    (d) => DISTRICTS[d.type].countsTowardLimit && state.map.tiles[d.tileIndex].districtComplete,
  ).length;
}

/**
 * CIV6 (Cree, TRAIT_CIVILIZATION_CREE_TRADE_GAIN_TILES): "Unclaimed tiles
 * within 3 tiles of a Cree City come under Cree control when a Trader first
 * moves into them." The radius (`tradeGainTileRadius`,
 * EFFECT_ADJUST_PLAYER_TRADE_GAIN_TILES_EN_ROUTE GainTileRadius 3) is measured
 * from the CITY, so a long course claims nothing far from home. An owned tile
 * never changes hands — only unclaimed ground does.
 */
export function claimTileEnRoute(state: GameState, seat: number, tileIndex: number): boolean {
  const radius = getModifiers(state, seat).tradeGainTileRadius;
  if (radius <= 0) return false;
  const t = state.map.tiles[tileIndex];
  if (!t || tileSeat(t) !== NO_SEAT) return false;
  const near = citiesOf(state, seat).some((c) => {
    const ctr = state.map.tiles[c.centerIndex];
    return ctr !== undefined && hexDistance(state.map, ctr.col, ctr.row, t.col, t.row) <= radius;
  });
  if (!near) return false;
  setTileOwner(t, seat);
  return true;
}

/** CIV6 (`District_TradeRouteYields`): what a route pays for each COMPLETED
 *  district standing at its DESTINATION — `side` picks the domestic or the
 *  international column of the table. The city centre is an entry of
 *  `city.districts`, so the flat head every route pays (food 1 /
 *  production 1 at home, gold 3 abroad) is simply its row. The origin's
 *  own districts pay nothing: `YieldChangeAsOrigin` is 0 on every row, and
 *  the live game agrees (ask 15). */
function districtRouteYields(state: GameState, dest: City, side: 'domestic' | 'international'): Yields {
  const out = emptyYields();
  for (const d of dest.districts) {
    if (!state.map.tiles[d.tileIndex].districtComplete) continue;
    const row = DISTRICT_ROUTE_YIELDS[d.type]?.[side];
    if (row) addYields(out, row);
  }
  return out;
}

export function routeYields(state: GameState, dest: City): Yields {
  const out = districtRouteYields(state, dest, 'domestic');
  // CIV6 (Isolationism): "Domestic routes provide +2 Food, +2 Production."
  addYields(out, getModifiers(state, dest.seat).domesticRouteYield);
  return out;
}

/** the largest `cityIntlRouteGold` among the features on the city's plots */
function cityFeatureIntlGold(state: GameState, city: City): number {
  let g = 0;
  for (const t of state.map.tiles) {
    if (!t.feature || t.ownerSeat !== city.seat || t.ownerCity !== city.id) continue;
    g = Math.max(g, FEATURES[t.feature]?.cityIntlRouteGold ?? 0);
  }
  return g;
}

/**
 * CIV6 (EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL): `origin` is
 * REQUIRED because a row may be intercontinental, and that is a fact about
 * the route's two ENDPOINTS — a defaulted origin would let a caller pay the
 * plain amount on a leg that earns triple.
 */
export function routeYieldsInternational(state: GameState, origin: City, dest: City, seat: number): Yields {
  // the table's INTERNATIONAL column over the destination's districts —
  // gold 3 from the centre, gold 3 more from a Harbor or Commercial Hub, a
  // point of each specialty district's own yield
  const out = districtRouteYields(state, dest, 'international');
  // CIV6 (Mediterranean's Bride): "+4 Gold for Egypt" on its own routes out;
  // "+2 Food for them" on anyone's route in.
  if (leaderOf(state, seat) === 'CLEOPATRA') out.gold += CLEOPATRA_INTL_ROUTE_GOLD;
  if (leaderOf(state, dest.seat) === 'CLEOPATRA') out.food += CLEOPATRA_INCOMING_ROUTE_FOOD;
  // CIV6 (Paititi): +4 Gold on an international route out of a city holding it
  out.gold += cityFeatureIntlGold(state, origin);
  // CIV6 (EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL): the roster's rows
  addRouteRows(state, out, getModifiers(state, seat).intlRouteYields, origin, dest);
  return out;
}

/** The roster's route rows, plain and intercontinental, onto `out`. ONE reader
 *  for both the domestic and the international list so the two cannot spell
 *  the continent test differently (`routeIntercontinental`). */
function addRouteRows(
  state: GameState, out: Yields, rows: readonly RouteYieldRow[], origin: City, dest: City,
): void {
  if (!rows.length) return;
  const across = routeIntercontinental(state, origin.centerIndex, dest.centerIndex);
  for (const r of rows) {
    if (r.intercontinental && !across) continue;
    out[r.yield] += r.amount;
  }
}

/**
 * CIV6 (Religious Community, GS): "+2 Gold on international Trade Routes"
 * from a city following the religion, once per Holy Site / Shrine / Temple /
 * worship building the ORIGIN holds
 * (`RELIGIOUS_COMMUNITY_{HOLY_SITE,SHRINE,TEMPLE,TIER3}_TRADING_MODIFIER`,
 * MODIFIER_SINGLE_CITY_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL Amount 2).
 * The belief is the origin CITY's follower table (`followerReligionsForCity`
 * — Dharma pays every present religion); the Holy Site counts COMPLETE, a
 * building counts HELD (pillage aside, as the install's CITY_HAS_BUILDING
 * requirements read). "International" is what every `_FOR_INTERNATIONAL`
 * row is on this engine — a route to another MAJOR's city; the city-state
 * leg pays none of them. The GPU twin sits in `_seat_route_income`.
 */
export function religiousCommunityGold(state: GameState, seat: number, origin: City): number {
  let per = 0;
  for (const g of followerReligionsForCity(getModifiers(state, seat), origin)) {
    per += followerBeliefForReligion(state, g)?.effects.intlRouteGoldPerWorship ?? 0;
  }
  if (!per) return 0;
  let n = 0;
  if (origin.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete)) n += 1;
  if (origin.buildings.includes('SHRINE')) n += 1;
  if (origin.buildings.includes('TEMPLE')) n += 1;
  if (origin.buildings.some((b) => BUILDINGS[b]?.worship)) n += 1;
  return per * n;
}

/** CIV6 (Sahel Merchants): "International Trade Routes gain +1 Gold for every
 *  flat Desert tile in the ORIGIN city" — the international twin of the
 *  domestic per-terrain rows, counted on the origin the way
 *  `cityMountainCount` counts for those (`INTL_ROUTE_TERRAIN_ROWS`). */
export function intlRouteTerrainYields(state: GameState, origin: City, seat: number): Yields {
  const out = emptyYields();
  const rows = getModifiers(state, seat).intlRouteTerrain;
  if (!rows.length) return out;
  for (const r of rows) {
    let n = 0;
    for (const t of state.map.tiles) {
      if (t.ownerSeat !== origin.seat || t.ownerCity !== origin.id) continue;
      if (t.terrain !== r.terrain) continue;
      if (r.flatOnly && t.elevation !== 'FLAT') continue;
      n += 1;
    }
    out[r.yield] += r.amount * n;
  }
  return out;
}

/** How many MOUNTAIN tiles this city owns — Qhapaq Ñan's per-terrain count. */
export function cityMountainCount(state: GameState, city: City): number {
  let n = 0;
  for (const t of state.map.tiles) {
    if (t.ownerSeat === city.seat && t.ownerCity === city.id && isMountain(t)) n += 1;
  }
  return n;
}

/** Every route, any seat's, that ends in this city. */
export function incomingRoutes(state: GameState, city: City): number {
  let n = 0;
  for (const s of state.seats) {
    for (const r of s.tradeRoutes ?? []) {
      if (s.seat === city.seat ? r.to === city.id && r.toSeat === undefined : r.toSeat === city.seat && r.toSeatCity === city.id) n += 1;
    }
  }
  return n;
}

/** How many tiles of this city carry the named improvement. */
export function cityImprovementCount(state: GameState, city: City, improvement: string): number {
  let n = 0;
  for (const t of state.map.tiles) if (t.ownerSeat === city.seat && t.ownerCity === city.id && t.improvement === improvement) n += 1;
  return n;
}

/** The routes every OTHER player runs into this city — the majors' and the
 *  city-states'. */
export function incomingForeignRoutes(state: GameState, city: City): number {
  let n = 0;
  for (const s of [...state.seats, ...state.cityStates]) {
    if (s.seat === city.seat) continue;
    for (const r of s.tradeRoutes ?? []) {
      if (r.toSeat === city.seat && r.toSeatCity === city.id) n += 1;
    }
  }
  return n;
}

/** The international routes OTHER seats run into this city. */
export function incomingIntlRoutes(state: GameState, city: City): number {
  let n = 0;
  for (const s of state.seats) {
    if (s.seat === city.seat) continue;
    for (const r of s.tradeRoutes ?? []) {
      if (r.toSeat === city.seat && r.toSeatCity === city.id) n += 1;
    }
  }
  return n;
}

/** What a city-state's city pays a route sent to it: the international
 *  column of `District_TradeRouteYields` over its completed districts, the
 *  centre's Gold 3 among them — the rows a foreign major's city pays
 *  (runs/h1_duelw1105: Rome's route to Bandar Brunei, centre, Harbor and
 *  Commercial Hub, paid 9 Gold before its path term; Antananarivo's centre,
 *  Harbor and Theater 6 Gold and 1 Culture). Sovereignty leaves these rows
 *  alone (`sovereigntyRouteYields`). */
export function cityStateRouteYields(state: GameState, cityState: CityState): Yields {
  // the centre's row stands for every minor (its plot carries no district
  // mark on a generated map); the rest are the completed districts it built
  const out = emptyYields();
  const centre = DISTRICT_ROUTE_YIELDS.CITY_CENTER?.international;
  if (centre) addYields(out, centre);
  for (const d of cityState.districts ?? []) {
    if (!state.map.tiles[d.tileIndex].districtComplete) continue;
    const row = DISTRICT_ROUTE_YIELDS[d.type]?.international;
    if (row) addYields(out, row);
  }
  return out;
}

/** What a MAJOR's route to a minor gains under Sovereignty outcome A naming
 *  the minor's type: the minor's own row to routes sent to it
 *  (`CITY_STATE_ROUTE_TO_OTHERS`, of its type's yield) times the
 *  resolution's factor, nothing without it (Trade_Manager 0x54c6c0; dll_readings
 *  "C-94: Sovereignty's route yield": 1117 Xi'an to Caguana Culture 1 -> 3
 *  and to Antananarivo 0 -> 2, 1122 Xi'an to Babylon Science 1 -> 3,
 *  1114 Xi'an to Vilnius Culture 8 -> 10, Gold untouched). */
export function sovereigntyRouteYields(state: GameState, cityState: CityState): Yields {
  const out = emptyYields();
  const f = congressCsRouteFactor(state, CITY_STATE_TYPES.indexOf(cityState.type));
  if (f > 0) out[CITY_STATE_TYPE_YIELD[cityState.type]] += CITY_STATE_ROUTE_TO_OTHERS[cityState.type] * f;
  return out;
}

/**
 * CIV6 (Democracy): "Your Trade Routes to an Ally or Suzerain's city provide
 * +4 Food and +4 Production for BOTH CITIES" — the DESTINATION's half. Every
 * route INTO this city from a seat holding the government's row pays the
 * sender's flat yields here too, on the sender's own qualifier: allied with
 * this city's seat, or — this city a minor's — suzerain of it. The origin
 * half sits in `cityTradeYields`' routes loop; the GPU twin is
 * `_incoming_ally_route`, read for a major row inside `_seat_route_income`
 * and for a minor row as its whole route income.
 */
export function incomingAllyRouteYields(state: GameState, city: City): Yields {
  const out = emptyYields();
  const cs = isCityStateSeat(city.seat) ? (seatOf(state, city.seat) as CityState | undefined) : undefined;
  for (const s of state.seats) {
    if (s.seat === city.seat || isCityStateSeat(s.seat) || isBarbSeat(s.seat)) continue;
    const y = getModifiers(state, s.seat).allyRouteYield;
    if (!y || !Object.values(y).some((v) => v)) continue;
    if (cs ? !isSuzerain(state, cs, s.seat) : !seatsAllied(state, s.seat, city.seat)) continue;
    for (const r of s.tradeRoutes ?? []) {
      if (cs ? r.toCs === cs.id : (r.toSeat === city.seat && r.toSeatCity === city.id)) addYields(out, y);
    }
  }
  return out;
}

/**
 * What ONE city-state route pays its sender: the destination's own rows —
 * the international column of `District_TradeRouteYields` over the
 * destination city's completed districts (`cityStateRouteYields`); a
 * minor sender holds no Sovereignty factor. Every other route
 * adder is a civilization's own (a leader's, a government's, a suzerain's, a
 * Great Person's, a Trading Post's), and a city-state holds none; the rows a
 * destination pays its senders (University of Sankore, a Great Merchant's
 * foreign-route Gold, Trade Policy) name other civilizations' routes, and so
 * do the rows that pay a city for the routes it receives (`incomingRoutes`) —
 * this engine reads a city-state as no civilization there. Null where the
 * destination is gone.
 */
export function minorRouteYields(state: GameState, r: TradeRoute): Yields | null {
  if (r.toCs !== undefined) {
    const dest = state.cityStates.find((c) => c.id === r.toCs);
    return dest ? cityStateRouteYields(state, dest) : null;
  }
  const civCity = seatOf(state, r.toSeat ?? NO_SEAT)?.cities.find((c) => c.id === r.toSeatCity);
  return civCity ? districtRouteYields(state, civCity, 'international') : null;
}

/** What ONE of a city-state's routes pays its city: the
 *  destination's rows (`minorRouteYields`) plus the path term and the
 *  city-state's own Trading Post at the destination (`routePostGold`;
 *  1105 Bandar Brunei→Shenyang, 1108 Hunza→Mediolanum: +1 Gold from the
 *  route after the first one there ran its term); null where the
 *  destination is gone. */
export function minorRouteOriginYields(state: GameState, minor: Seat, r: TradeRoute): Yields | null {
  const y = minorRouteYields(state, r);
  if (!y) return null;
  y.gold += routePathGold(state, minor.seat, r, y.gold) + routePostGold(state, minor.seat, routeDestCenter(state, minor, r));
  // a major's city paying OTHER players' routes into it
  // (MODIFIER_SINGLE_CITY_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS — Zhang Qian,
  // Marco Polo, Zheng He, Sankore): a city-state's route is another player's
  // (runs/h1_duelw1123 Johannesburg and Akkad -> Beijing, +2 Gold each)
  const civCity = r.toSeatCity !== undefined
    ? seatOf(state, r.toSeat ?? NO_SEAT)?.cities.find((c) => c.id === r.toSeatCity) : undefined;
  if (civCity) {
    y.gold += gpCityPermOf(civCity, 'foreignRouteGold');
    const snd = wonderRouteSenderYields(state, civCity);
    y.science += snd.science;
    y.gold += snd.gold;
  }
  return y;
}

/** What ONE route of seat `owner` pays its DESTINATION city — the per-route
 *  share of the destination's incoming terms in `cityTradeYields`: a
 *  city-state destination Democracy's half on its suzerain's route; a major's
 *  city Democracy's half, from any other player Trade Policy's Gold, the
 *  wonders' Science and the city's Great Person Gold, and from a foreign major
 *  Cleopatra's Gold and the destination seat's incoming-route rows; every
 *  route in the destination
 *  seat's improvement rows. Before the
 *  destination seat's Letters of Marque cut. */
export function routeDestYields(state: GameState, owner: number, r: TradeRoute): Yields {
  const out = emptyYields();
  const allyHalf = (dest: City, cs: CityState | undefined): void => {
    if (isCityStateSeat(owner) || isBarbSeat(owner) || owner === dest.seat) return;
    const y = getModifiers(state, owner).allyRouteYield;
    if (!y || !Object.values(y).some((v) => v)) return;
    if (cs ? isSuzerain(state, cs, owner) : seatsAllied(state, owner, dest.seat)) addYields(out, y);
  };
  if (r.toCs !== undefined) {
    const cs = state.cityStates.find((c) => c.id === r.toCs);
    if (cs) allyHalf(minorCity(cs), cs);
    return out;
  }
  const dSeat = r.toSeat ?? owner;
  const dest = seatOf(state, dSeat)?.cities.find((c) => c.id === (r.toSeat !== undefined ? r.toSeatCity : r.to));
  if (!dest || isCityStateSeat(dSeat)) return out;
  allyHalf(dest, undefined);
  // TRADE POLICY outcome A, on any other player's route in
  if (owner !== dSeat && r.toSeat === dSeat) {
    out.gold += congressTradeGold(state, dSeat);
    // CIV6 (University of Sankore, SANKORE_TRADE_GAIN_SCIENCE,
    // MODIFIER_SINGLE_CITY_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS, Domestic
    // false): any other player's route in pays its destination +2 Science
    // (runs/h1_duelw1110, the city-state Lisbon's route to Antium: 2 Science
    // at Antium)
    out.science += wonderRouteGainScience(state, dest);
    // CIV6 (Zhang Qian, Marco Polo, Zheng He; ..._YIELD_FROM_OTHERS): the
    // city's +2 Gold on any other player's route in, a city-state's included
    // (runs/h1_duelw1123 Johannesburg and Akkad -> Beijing)
    out.gold += gpCityPermOf(dest, 'foreignRouteGold');
  }
  const major = state.seats.some((s) => s.seat === owner);
  const foreign = major && owner !== dSeat && r.toSeat === dSeat;
  if (foreign) {
    if (leaderOf(state, dSeat) === 'CLEOPATRA') out.gold += CLEOPATRA_INCOMING_ROUTE_GOLD;
    for (const row of getModifiers(state, dSeat).incomingRouteYields) out[row.yield] += row.amount;
  }
  if (major && (foreign || (owner === dSeat && r.toSeat === undefined))) {
    for (const row of getModifiers(state, dSeat).routeImprovement) {
      if (row.side === 'destination') out[row.yield] += row.amount * cityImprovementCount(state, dest, row.improvement);
    }
  }
  return out;
}

/** A seat's Letters of Marque cut on a route's yields, each floored
 *  (`cityTradeYields`' own); a city-state holds none. */
export function routeYieldCut(state: GameState, seat: number, y: Yields): Yields {
  if (isCityStateSeat(seat)) return y;
  const cut = getModifiers(state, seat).routeYieldMult;
  if (cut !== 1) for (const k of Object.keys(y) as (keyof Yields)[]) y[k] = Math.floor(y[k] * cut);
  return y;
}

/** THE ROUTE'S VALUE V the plunder pays on: the route's yields at its origin
 *  and at its destination summed, Gold at 1 and every other yield at
 *  `GOLD_EQUIVALENT_OTHER_YIELDS` (Trade_Manager plunder, GameCore_XP2
 *  0x5545e0, the route yields 0x559b30 / 0x559bc0). */
export function routeYieldValue(state: GameState, owner: Seat, r: TradeRoute): number {
  let o: Yields | null;
  if (isCityStateSeat(owner.seat)) {
    o = minorRouteOriginYields(state, owner, r);
  } else {
    const city = owner.cities.find((c) => c.id === r.from);
    o = city ? routeOriginYields(state, city, r) : null;
  }
  const d = routeDestYields(state, owner.seat, r);
  const dSeat = r.toCs !== undefined ? NO_SEAT : (r.toSeat ?? owner.seat);
  const y = emptyYields();
  if (o) addYields(y, routeYieldCut(state, owner.seat, o));
  if (dSeat !== NO_SEAT) addYields(y, routeYieldCut(state, dSeat, d));
  else addYields(y, d);
  let v = 0;
  for (const k of Object.keys(y) as YieldKey[]) v += y[k] * (k === 'gold' ? 1 : GOLD_EQUIVALENT_OTHER_YIELDS);
  return v;
}

/** What ONE of a major's routes pays its ORIGIN city `city` (the route's
 *  `from`), before the seat's Letters of Marque cut: the seat's cards'
 *  `routeYield` (Caravansaries, Triangular Trade, Ecommerce) and every
 *  per-route adder of the leg's kind.
 *  `cityTradeYields` sums it over the city's routes; the plunder payout
 *  reads it for one route (`routeYieldValue`). */
export function routeOriginYields(state: GameState, city: City, route: TradeRoute): Yields {
  const seat = city.seat;
  const out = emptyYields();
  const gpOwner = seatOf(state, seat);
  const gpStratGold = gpPermOf(gpOwner, 'strategicRouteGold');
  const seatMods = getModifiers(state, seat);
  const rowsHere = seatMods.routeImprovement;
  const originWonderGold = wonderRouteOriginGold(state, city);
  addYields(out, seatMods.routeYield);
  // the ORIGIN side of the same rows: this seat's route out, per named
  // improvement at its destination city
  if (rowsHere.length) {
    const destCity = route.toSeat !== undefined
      ? seatOf(state, route.toSeat)?.cities.find((c) => c.id === route.toSeatCity)
      : route.to !== undefined ? seatOf(state, seat)?.cities.find((c) => c.id === route.to) : undefined;
    if (destCity) for (const r of rowsHere) if (r.side === 'origin') out[r.yield] += r.amount * cityImprovementCount(state, destCity, r.improvement);
  }
  out.gold += routeChainGold(state, seat, route);
  out.gold += originWonderGold;
  if (route.toCs !== undefined) {
    const cityState = state.cityStates.find((c) => c.id === route.toCs);
    if (cityState) {
      const csPay = cityStateRouteYields(state, cityState);
      addYields(out, csPay);
      addYields(out, sovereigntyRouteYields(state, cityState));
      out.gold += routePathGold(state, seat, route, csPay.gold);
      // a SURVIVED City-State Emergency pays its target +2 gold on every
      // minor leg, forever
      out.gold += emergencyCsRouteGold(state, seat);
      // CIV6 (Reform the Coinage, Golden face,
      // MODIFIER_PLAYER_ADJUST_TRADE_ROUTE_YIELD_PER_SPECIALTY_DISTRICT_FOR_INTERNATIONAL):
      // a route to a minor is international (1117 Xi'an to Caguana, Harbor
      // and Theater Square, +6 Gold t108-120)
      if (goldenDedication(state, seat, DED_COINAGE)) {
        out.gold += COINAGE_INTL_GOLD_PER_SPEC * specialtyDistricts(state, cityState);
      }
      out.gold += routePostGold(state, seat, cityState.centerIndex);
      out.gold += routeLengthGold(state, seat, route);
      // CIV6 (Amsterdam): a city-state's city is a foreign city too
      out.gold += routeDestLuxuryGold(state, seat, cityState.seat, null, cityState.centerIndex);
      // CIV6 (Ibn Fadlan, MODIFIER_PLAYER_ADJUST_TRADE_ROUTES_CITY_STATE_YIELD)
      out.faith += gpPermOf(gpOwner, 'csRouteFaith');
      // CIV6 (Raj): the same modifier on a policy card
      addYields(out, seatMods.csRouteYield);
      // CIV 6, Kumasi's suzerain: "Your Trade Routes to any city-state
      // provide +2 Culture and +1 Gold for every specialty district in the
      // ORIGIN city" — this city, whichever minor the route reaches.
      if (suzerainEffect(state, seat, 'csRouteYields')) {
        const n = completedDistrictCount(state, city, true);
        out.culture += KUMASI_ROUTE_CULTURE * n;
        out.gold += KUMASI_ROUTE_GOLD * n;
      }
    }
    return out;
  }
  if (route.toSeat !== undefined) {
    const civSeat = seatOf(state, route.toSeat);
    const civCity = civSeat?.cities.find((c) => c.id === route.toSeatCity);
    if (civSeat && civCity) {
      addYields(out, routeYieldsInternational(state, city, civCity, seat));
      // CIV6 (Trade Confederation, EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL)
      addYields(out, seatMods.intlRouteYield);
      out.gold += routePathGold(state, seat, route, districtRouteYields(state, civCity, 'international').gold);
      // CIV6 (Religious Community): the ORIGIN's worship buildings, on this leg
      out.gold += religiousCommunityGold(state, seat, city);
      // CIV6 (Sahel Merchants): the ORIGIN's own flat Desert, on this leg
      addYields(out, intlRouteTerrainYields(state, city, seat));
      // CIV6 (The Grand Embassy): "Receives Science or Culture from Trade
      // Routes to civilizations that are MORE ADVANCED than Russia. +1 per
      // 3 technologies or civics ahead" (`PROGRESS_TRADE_ROWS`)
      const per = getModifiers(state, seat).progressTradePer;
      if (per > 0) {
        out.science += Math.floor(progressAhead(state, seat, route.toSeat, false) / per);
        out.culture += Math.floor(progressAhead(state, seat, route.toSeat, true) / per);
      }
      // CIV6 (Alliance, level 1): the typed alliance pays its route bonus
      // on every paying leg - the sender half.
      const aty = allianceTypeWith(state, seat, route.toSeat);
      if (aty >= 0 && ALLIANCE_ROUTE_TO[aty] > 0) {
        out[ALLIANCE_ROUTE_YKEY[aty] as YieldKey] += ALLIANCE_ROUTE_TO[aty];
      }
      // CIV6 (Democracy): a route to an ALLY's city, or to a minor this seat
      // is SUZERAIN of, pays the government's own flat yields.
      const csDest = isCityStateSeat(route.toSeat)
        ? (state.cityStates ?? []).find((c) => c.seat === route.toSeat)
        : undefined;
      if (seatsAllied(state, seat, route.toSeat)
          || (csDest && isSuzerain(state, csDest, seat))) {
        addYields(out, getModifiers(state, seat).allyRouteYield);
      }
      out.gold += routePostGold(state, seat, civCity.centerIndex);
      out.gold += routeLengthGold(state, seat, route);
      // a route from a seat culturally dominant over the destination's
      // (Trade_Manager 0x54c6c0)
      if (gpOwner?.culturallyDominant?.[route.toSeat]) out.gold += TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE;
      // CIV6 (Amsterdam): the destination's own luxuries pay this seat's route
      out.gold += routeDestLuxuryGold(state, seat, civCity.seat, civCity.id, civCity.centerIndex);
      // CIV6 (Zhang Qian, Marco Polo, Zheng He; ..._YIELD_TO_OTHERS): "This
      // city provides +2 Gold to foreign Trade Routes" — the destination's
      out.gold += gpCityPermOf(civCity, 'foreignRouteGold');
      // CIV6 (John Rockefeller): Gold per strategic plot at the destination
      if (gpStratGold) out.gold += gpStratGold * routeDestStrategicPlots(state, seat, civCity);
      // CIV6 (University of Sankore): "Other Civilizations' Trade Routes
      // to this city provide +1 Science and +1 Gold for them."
      const snd = wonderRouteSenderYields(state, civCity);
      out.science += snd.science;
      out.gold += snd.gold;
      // CIV6 (Reform the Coinage, Golden face): "International Trade Routes
      // provide +3 Gold per specialty district in the foreign city."
      if (goldenDedication(state, seat, DED_COINAGE)) {
        out.gold += COINAGE_INTL_GOLD_PER_SPEC * specialtyDistricts(state, civCity);
      }
    }
    return out;
  }
  const dest = seatOf(state, seat)!.cities.find((c) => c.id === route.to);
  if (dest) {
    addYields(out, routeYields(state, dest));
    out.gold += routePathGold(state, seat, route, districtRouteYields(state, dest, 'domestic').gold);
    out.gold += routeLengthGold(state, seat, route);
    // CIV6 (Raja Todar Mal): "+0.5 Gold for each specialty district at the
    // destination" of a route to your own city
    out.gold += gpPermOf(gpOwner, 'domesticRouteGoldPerSpecialty') * specialtyDistricts(state, dest);
    if (gpStratGold) out.gold += gpStratGold * routeDestStrategicPlots(state, seat, dest);
    // CIV6 (EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC): the roster's rows,
    // the same reader the international leg uses
    addRouteRows(state, out, getModifiers(state, seat).domesticRouteYields, city, dest);
    // CIV6 (Qhapaq Ñan,
    // EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_TERRAIN_FOR_DOMESTIC): the
    // ORIGIN city's own mountains pay this seat on every domestic leg
    for (const r of getModifiers(state, seat).routeTerrain) {
      out[r.yield] += r.amount * cityMountainCount(state, city);
    }
    // CIV6 (Surplus Logistics): "Your Trade Routes ending here provide +2
    // Food to their starting city" — the DESTINATION's governor pays the
    // ORIGIN, which is the city this walk is computing.
    out.food += governorSum(state, dest, (e) => e.routeStartFood);
    const relT = seatOf(state, seat)!.religion;
    if (relT?.founded && relT.enhancer && dest.followedReligion === seat) {
      const tr = ENHANCER_BELIEFS[relT.enhancer]?.effects.tradeReligionYields;
      if (tr) addYields(out, tr);
    }
  }
  return out;
}

export function cityTradeYields(state: GameState, city: City): Yields {
  const seat = city.seat;
  const out = emptyYields();
  if (isCityStateSeat(seat)) {
    // a city-state's one city: Democracy's destination half of a suzerain's
    // route in, then its own routes out
    addYields(out, incomingAllyRouteYields(state, city));
    const minor = seatOf(state, seat);
    for (const r of minor?.tradeRoutes ?? []) {
      const y = minorRouteOriginYields(state, minor!, r);
      if (y) addYields(out, y);
    }
    return out;
  }
  // CIV6 (Mediterranean's Bride): "+2 Gold for Egypt" on every other
  // civilization's route INTO this city.
  if (leaderOf(state, seat) === 'CLEOPATRA') out.gold += CLEOPATRA_INCOMING_ROUTE_GOLD * incomingIntlRoutes(state, city);
  // CIV6 (Democracy): the destination's half of an ally's or suzerain's route in
  addYields(out, incomingAllyRouteYields(state, city));
  // CIV6 (Radio Oranje, EFFECT_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS): "+2
  // Culture from each Trade Route another civilization sends to this one" —
  // the same FOREIGN count Cleopatra's gold reads (`INCOMING_ROUTE_YIELD_ROWS`)
  const inRows = getModifiers(state, seat).incomingRouteYields;
  if (inRows.length) {
    const foreignIn = incomingIntlRoutes(state, city);
    if (foreignIn) for (const r of inRows) out[r.yield] += r.amount * foreignIn;
  }
  // CIV6 (Zhang Qian, Marco Polo, Zheng He; ..._YIELD_FROM_OTHERS): "This
  // city receives +2 Gold from foreign Trade Routes" — every other player's,
  // a city-state's included
  const gpForeign = gpCityPermOf(city, 'foreignRouteGold');
  if (gpForeign) out.gold += gpForeign * incomingForeignRoutes(state, city);
  // TRADE POLICY outcome A: every route another player sends into a city of
  // the named seat pays that city
  const policyGold = congressTradeGold(state, seat);
  if (policyGold) out.gold += policyGold * incomingForeignRoutes(state, city);
  // CIV6 (EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_IMPROVEMENT_IN_TARGET_CITY,
  // the DESTINATION side): every route ending here pays this seat per
  // named improvement of this city (`ROUTE_IMPROVEMENT_ROWS`)
  const rowsHere = getModifiers(state, seat).routeImprovement;
  if (rowsHere.length) {
    const incoming = incomingRoutes(state, city);
    for (const r of rowsHere) if (r.side === 'destination') out[r.yield] += r.amount * incoming * cityImprovementCount(state, city, r.improvement);
  }
  for (const route of seatOf(state, seat)?.tradeRoutes ?? []) {
    if (route.from !== city.id) continue;
    addYields(out, routeOriginYields(state, city, route));
  }
  // CIV6 (Letters of Marque): "Trade Route yields -50%."
  const cut = getModifiers(state, seat).routeYieldMult;
  if (cut !== 1) for (const k of Object.keys(out) as (keyof Yields)[]) out[k] = Math.floor(out[k] * cut);
  return out;
}

export function canAddTradeRoute(state: GameState, from: number, to: number, seat: number): RuleResult {
  if (from === to) return { ok: false, reason: 'Origin and destination must differ.' };
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const b = seatOf(state, seat)!.cities.find((c) => c.id === to);
  if (!a || !b) return { ok: false, reason: 'No such city.' };
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (state.unitsMode && !freeTrader(state, seat)) {
    return { ok: false, reason: 'No free Trader to spend.' };
  }
  if (routes.some((r) => r.from === from && r.to === to)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  if (!routeInRange(state, seat, a.centerIndex, b.centerIndex)) {
    return { ok: false, reason: 'Beyond trade range.' };
  }
  return { ok: true };
}

export function addTradeRoute(state: GameState, from: number, to: number, seat: number): RuleResult {
  const check = canAddTradeRoute(state, from, to, seat);
  if (!check.ok) return check;
  const s = seatOf(state, seat)!;
  commitRoute(
    state, seat,
    s.cities.find((c) => c.id === from)!.centerIndex,
    s.cities.find((c) => c.id === to)!.centerIndex,
    { from, to },
  );
  return { ok: true };
}

/** Spend the Trader, stamp the walk fields and push the route — the one
 * committer all three route kinds share. */
function commitRoute(state: GameState, seat: number, originCenter: number, destCenter: number, route: TradeRoute): void {
  if (state.unitsMode) {
    const t = freeTrader(state, seat);
    if (t) disbandUnit(state, t.id);
  }
  route.expiresTurn = state.turn + tradeRouteMinDuration(state);
  route.createdTurn = state.turn;
  // the COURSE, computed once here and walked for the route's life (the
  // trade manager's path cache); every caller has checked the range, so the
  // destination is on it
  route.course = tradeCourse(tradeReach(state, seat, originCenter), destCenter) ?? [];
  route.walkTile = originCenter;
  route.walkLeg = 0;
  // the walker lays road on every LAND tile it stands on; the origin is turn 0
  if (!isWater(state.map.tiles[originCenter])) state.map.tiles[originCenter].road = true;
  (seatOf(state, seat)!.tradeRoutes ??= []).push(route);
  // CIV6 (Ortoo): "Starting a Trade Route immediately creates a Trading Post
  // in the destination city" — the post the ordinary route only plants when
  // it COMPLETES (`IMMEDIATE_POST_ROWS`)
  if (getModifiers(state, seat).immediatePost) stampTradingPost(seatOf(state, seat)!, destCenter);
}

export function canAddCsTradeRoute(state: GameState, from: number, cityStateId: number, seat: number): RuleResult {
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!a || !cityState) return { ok: false, reason: 'No such city / city-state.' };
  if (!hasMet(cityState, seat)) return { ok: false, reason: 'You have not met this city-state yet.' };
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (state.unitsMode && !freeTrader(state, seat)) {
    return { ok: false, reason: 'No free Trader to spend.' };
  }
  if (routes.some((r) => r.from === from && r.toCs === cityStateId)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  if (!routeInRange(state, seat, a.centerIndex, cityState.centerIndex)) {
    return { ok: false, reason: 'Beyond trade range.' };
  }
  return { ok: true };
}

export function addCsTradeRoute(state: GameState, from: number, cityStateId: number, seat: number): RuleResult {
  const check = canAddCsTradeRoute(state, from, cityStateId, seat);
  if (!check.ok) return check;
  commitRoute(
    state, seat,
    seatOf(state, seat)!.cities.find((c) => c.id === from)!.centerIndex,
    state.cityStates.find((c) => c.id === cityStateId)!.centerIndex,
    { from, to: -1, toCs: cityStateId },
  );
  return { ok: true };
}

export function canAddIntlTradeRoute(state: GameState, from: number, toSeat: number, seatCity: number, seat: number): RuleResult {
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const civSeat = seatOf(state, toSeat);
  const civCity = civSeat?.cities.find((c) => c.id === seatCity);
  if (!a || !civSeat || !civCity) return { ok: false, reason: 'No such city / actor city.' };
  // TRADE POLICY outcome B: no international route may touch the named seat,
  // as sender or as destination.
  if (congressIntlBanned(state, seat) || congressIntlBanned(state, toSeat)) {
    return { ok: false, reason: 'The World Congress has ended international routes with this player.' };
  }
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (state.unitsMode && !freeTrader(state, seat)) {
    return { ok: false, reason: 'No free Trader to spend.' };
  }
  if (routes.some((r) => r.from === from && r.toSeat === toSeat && r.toSeatCity === seatCity)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  if (!routeInRange(state, seat, a.centerIndex, civCity.centerIndex)) {
    return { ok: false, reason: 'Beyond trade range.' };
  }
  return { ok: true };
}

export function addIntlTradeRoute(state: GameState, from: number, toSeat: number, seatCity: number, seat: number): RuleResult {
  const check = canAddIntlTradeRoute(state, from, toSeat, seatCity, seat);
  if (!check.ok) return check;
  commitRoute(
    state, seat,
    seatOf(state, seat)!.cities.find((c) => c.id === from)!.centerIndex,
    seatOf(state, toSeat)!.cities.find((c) => c.id === seatCity)!.centerIndex,
    { from, to: -1, toSeat, toSeatCity: seatCity },
  );
  return { ok: true };
}

/**
 * THE WALK and PLUNDER of one holder's routes — a major's or a city-state's.
 *
 * THE WALK: each route's Trader advances one plot along the route's stored
 * course (`TradeRoute.course`) toward its leg's end, laying road as it goes;
 * it turns around at the destination and starts a fresh round trip at home.
 * Both legs walk the one course. A route whose origin or destination city is
 * gone does not walk.
 *
 * PLUNDER, real Civ 6: a unit hostile to the route's owner standing on the
 * Trader's tile destroys the route AND its Trader, and the raider's seat
 * banks the gold — a major, or a city-state into its own treasury.
 */
export function tradeRouteWalk(state: GameState, actor: Seat): void {
  const routes = (actor.tradeRoutes ??= []);
  for (const r of routes) {
    const course = r.course ?? [];
    if ((r.walkLeg ?? -1) < 0 || r.walkTile === undefined || course.length < 2) continue;
    if (routeOriginCenter(state, actor, r) < 0 || routeDestCenter(state, actor, r) < 0) continue;
    const at = course.indexOf(r.walkTile);
    if (at < 0) continue;
    const i = r.walkLeg === 0 ? at + 1 : at - 1;
    const next = course[i];
    r.walkTile = next;
    // roads go on passable LAND only — a sea leg lays nothing, and
    // neither does a portal's mountain
    if (!isWater(state.map.tiles[next]) && !isImpassable(state.map.tiles[next])) state.map.tiles[next].road = true;
    claimTileEnRoute(state, actor.seat, next);
    if (r.walkLeg === 0 && i === course.length - 1) r.walkLeg = 1;
    else if (r.walkLeg === 1 && i === 0) r.walkLeg = 0;
  }
  const plundered = new Set<TradeRoute>();
  for (const r of routes) {
    const raider = r.walkTile === undefined ? null : routePlunderer(state, r.walkTile, actor.seat);
    if (raider === null) continue;
    plundered.add(r);
    const rs = seatOf(state, raider);
    if (rs) rs.treasury += routePlunderGold(state, raider, actor, r, r.walkTile!);
  }
  if (plundered.size > 0) actor.tradeRoutes = routes.filter((r) => !plundered.has(r));
}

/**
 * THE ROUND-TRIP EXPIRY of one holder's routes. Completion is the minimum
 * term running out WITH the Trader home (one that cannot come home ends at
 * the rail); a route whose destination city is gone ends too. A route that ENDS hands its Trader back at the origin; only plunder
 * destroys the unit.
 *
 * CIV6 (Reform the Coinage, dark face): "+1 Era Score each time you
 * successfully complete a Trade Route" — a route cut short (plunder, war, a
 * dead destination) never scores. CIV6 (Trading Post): "created in a city
 * when a civilization finishes a Trade Route to that city for the first
 * time" — and one at home, "in the origin and destination cities". Only a
 * FULL term stamps. Both are a civilization's: a city-state holds no
 * dedication and plants no post.
 */
export function tradeRouteExpiry(state: GameState, actor: Seat): void {
  const cur = actor.tradeRoutes ?? [];
  const isDone = (x: TradeRoute): boolean => {
    if (x.expiresTurn === undefined || state.turn < x.expiresTurn) return false;
    if (state.turn >= x.expiresTurn + TRADE_WALK_EXPIRY_RAIL) return true;
    return x.walkTile === routeOriginCenter(state, actor, x);
  };
  const destGone = (x: TradeRoute): boolean =>
    x.toSeatCity !== undefined && !(seatOf(state, x.toSeat ?? NO_SEAT)?.cities ?? []).some((c) => c.id === x.toSeatCity);
  const done = cur.filter((x) => isDone(x));
  if (done.length > 0 && !isCityStateSeat(actor.seat)) dedicationEvent(state, actor.seat, DED_COINAGE, done.length);
  // a completed route plants its owner's Trading Post at both of its cities —
  // a city-state's too
  for (const r of done) {
    stampTradingPost(actor, routeOriginCenter(state, actor, r));
    stampTradingPost(actor, routeDestCenter(state, actor, r));
  }
  const ended = cur.filter((x) => isDone(x) || destGone(x));
  if (ended.length > 0) {
    if (state.unitsMode) {
      for (const r of ended) {
        const oc = routeOriginCenter(state, actor, r);
        if (oc >= 0) spawnUnit(state, 'TRADER', oc, actor.seat);
      }
    }
    actor.tradeRoutes = cur.filter((x) => !ended.includes(x));
  }
}

/**
 * THE CITY-STATE'S ROUTE: where its free Trader goes. The census records
 * no destination, so the engine's own route scorer picks (`routeCandidateRow`'s
 * key): the new in-range destination whose route pays the most, its yields
 * summed (`minorRouteYields`) — the other city-states in id order, then every
 * major's cities in seat and array order, strictly-greater beats, so ties
 * keep the first. A minor has no fog and meets no one, so the gates are the
 * range (`tradeReach` from its city, its Trading Posts refuelling), a route
 * not already running, no war with the destination's holder, and Trade
 * Policy's ban on a banned major. Null = none.
 */
export function minorRouteCandidate(state: GameState, cityState: CityState): TradeRoute | null {
  const routes = cityState.tradeRoutes ?? [];
  const reach = tradeReach(state, cityState.seat, cityState.centerIndex);
  const cands: TradeRoute[] = [];
  for (const dest of [...state.cityStates].sort((a, b) => a.id - b.id)) {
    if (dest.id === cityState.id || routes.some((x) => x.toCs === dest.id)) continue;
    if (!tradeCourse(reach, dest.centerIndex)) continue;
    cands.push({ from: -1, to: -1, toCs: dest.id });
  }
  for (const other of state.seats) {
    if (civsAtWar(state, cityState.seat, other.seat) || congressIntlBanned(state, other.seat)) continue;
    for (const pc of other.cities) {
      if (routes.some((x) => x.toSeat === other.seat && x.toSeatCity === pc.id)) continue;
      if (!tradeCourse(reach, pc.centerIndex)) continue;
      cands.push({ from: -1, to: -1, toSeat: other.seat, toSeatCity: pc.id });
    }
  }
  let best: TradeRoute | null = null;
  let bestSum = -1;
  for (const r of cands) {
    const y = minorRouteYields(state, r)!;
    const ySum = y.food + y.production + y.gold + y.science + y.culture + y.faith;
    if (best === null || ySum > bestSum) {
      best = r;
      bestSum = ySum;
    }
  }
  return best;
}

/**
 * THE CITY-STATE'S TRADE TURN (`minorPhase`): its routes walk and meet their
 * raiders; a free Trader under its trade capacity takes the scorer's
 * destination (`minorRouteCandidate`) and is spent on it; then the round
 * trips that are done end.
 */
export function minorTrade(state: GameState, cityState: CityState): void {
  tradeRouteWalk(state, cityState);
  const routes = cityState.tradeRoutes ?? [];
  if (routes.length < tradeCapacity(state, cityState.seat) && freeTrader(state, cityState.seat)) {
    const r = minorRouteCandidate(state, cityState);
    if (r) {
      const dest = routeDestCenter(state, cityState, r);
      commitRoute(state, cityState.seat, cityState.centerIndex, dest, r);
    }
  }
  tradeRouteExpiry(state, cityState);
}

/** TRADE POLICY outcome B ends the routes it forbids the moment it passes —
 *  both the banned seat's own international legs and everyone else's to it. */
export function congressCancelBannedIntl(state: GameState): void {
  for (const sx of state.seats) {
    if (!congressIntlBanned(state, sx.seat)) continue;
    cancelRoutes(state, sx.seat, (r) => r.toSeat !== undefined && r.toSeat >= 0);
    for (const other of state.seats) {
      if (other.seat !== sx.seat) cancelRoutes(state, other.seat, (r) => r.toSeat === sx.seat);
    }
  }
}
