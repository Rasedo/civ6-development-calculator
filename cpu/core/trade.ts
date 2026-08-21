/**
 * Trade routes. Domestic routes pay the origin food + production based on
 * the destination's development (Civ 6's domestic-route feel); routes to
 * met city-states pay gold plus the city-state's specialty yield.
 */

import { addYields, emptyYields, type City, type CityState, type GameState, type Seat, type TradeRoute, type Unit, type Yields } from './types';
import { NO_SEAT, seatOf, citiesOf, isBarbSeat, civsAtWar } from './seats';
import { hexDistance } from '../../world/hex';
import { isCoastalLand, isWater } from '../../world/query';
import { tradeWalkReachable, tradeWaterLevel, disbandUnit, spawnUnit, TRADE_ROAD_MAX_STEPS } from './units';
import { civEraIndex } from './city';
import { DISTRICTS } from '../data/districts';
import { cityStateTradeCapacityBonus, hasMet, suzerainEffect } from './cityStates';
import { completedDistrictCount } from './yields';
import { CITY_STATE_TYPE_YIELD, CITY_STATE_TYPES, KUMASI_ROUTE_CULTURE, KUMASI_ROUTE_GOLD } from '../data/cityStates';
import { emergencyCsRouteGold } from './emergency';
import { congressCsRouteMult, congressIntlBanned, congressRouteCapacity, congressTradeGold } from './congress';
import { ENHANCER_BELIEFS } from '../data/religion';
import type { RuleResult } from './rules';
import { goldenDedication } from './eras';
import { DED_COINAGE, COINAGE_INTL_GOLD_PER_SPEC } from '../data/seats';

/**
 * CIV6: "The base range for land trade routes is 15 tiles ... The base range
 * for sea trade routes is 30 tiles." A route counts as a sea route when BOTH
 * ends have maritime access and the seat can put a Trader on the water —
 * "both the origin city and the destination city require maritime access ...
 * in order to establish sea Trade Routes". Range is not extendable by
 * technology in Civ 6; only Trading Posts extend it, and there are none here.
 */
export const TRADE_ROUTE_RANGE_LAND = 15;
export const TRADE_ROUTE_RANGE_SEA = 30;

/**
 * CIV6: "Cities with maritime access are those that are adjacent to a body of
 * water connected to the sea, or that have a Harbor on such a body."
 */
export function cityMaritime(state: GameState, centerIndex: number, city?: City): boolean {
  const centre = state.map.tiles[centerIndex];
  if (centre && isCoastalLand(state.map, centre)) return true;
  return (city?.districts ?? []).some(
    (d) => d.type === 'HARBOR' && state.map.tiles[d.tileIndex]?.districtComplete,
  );
}

/** The range this origin/destination pair may span. */
export function tradeRouteRange(
  state: GameState,
  seat: number,
  originCenter: number,
  destCenter: number,
  origin?: City,
  dest?: City,
): number {
  if (tradeWaterLevel(state, seat) === 0) return TRADE_ROUTE_RANGE_LAND;
  return cityMaritime(state, originCenter, origin) && cityMaritime(state, destCenter, dest)
    ? TRADE_ROUTE_RANGE_SEA
    : TRADE_ROUTE_RANGE_LAND;
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

/** Gold paid to the seat whose unit plunders a route. The DESTRUCTION rule is
 * sourced (an enemy unit on the Trader's tile kills route and Trader and pays
 * its owner gold); this magnitude is a stylization — the real base value is
 * not documented anywhere public (AUDIT B-31r). */
export const PLUNDER_ROUTE_GOLD = 50;

/** A walker STUCK by terrain change (flood/volcano blocking its descent) can
 * never complete the round trip its expiry waits for — after this many turns
 * past the minimum the route ends anyway. A rail, not a rule. */
export const TRADE_WALK_EXPIRY_RAIL = 2 * TRADE_ROAD_MAX_STEPS;

/**
 * The seat that would PLUNDER a Trader standing on `tileIndex` — the LOWEST
 * hostile seat id with a unit there (barbarians always hostile, others by
 * the war matrix), or null. CIV6 (Reform the Coinage, Golden face): "your
 * Traders cannot be plundered."
 */
export function routePlunderer(state: GameState, tileIndex: number, seat: number): number | null {
  if (!state.unitsMode) return null;
  if (goldenDedication(state, seat, DED_COINAGE)) return null;
  let raider: number | null = null;
  for (const u of state.units) {
    if (u.tileIndex !== tileIndex) continue;
    const hostile = isBarbSeat(u.seat) || (u.seat !== seat && civsAtWar(state, u.seat, seat));
    if (!hostile) continue;
    if (raider === null || u.seat < raider) raider = u.seat;
  }
  return raider;
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

/** Cancel this seat's routes that `hit` names; each hands its Trader back at
 * the origin (a cancel is not a plunder — the unit survives). */
export function cancelRoutes(state: GameState, seat: number, hit: (r: TradeRoute) => boolean): void {
  const s = seatOf(state, seat);
  if (!s?.tradeRoutes?.length) return;
  const cut = s.tradeRoutes.filter(hit);
  if (!cut.length) return;
  if (state.unitsMode) {
    for (const r of cut) {
      const oc = s.cities.find((c) => c.id === r.from);
      if (oc) spawnUnit(state, 'TRADER', oc.centerIndex, seat);
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
  for (const c of citiesOf(state, seat)) {
    if (c.buildings.includes('MARKET') || c.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of c.wonders ?? []) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  return cap + cityStateTradeCapacityBonus(state, seat) + congressRouteCapacity(state, seat);
}

export function specialtyDistricts(state: GameState, city: City): number {
  return city.districts.filter(
    (d) => DISTRICTS[d.type].countsTowardLimit && state.map.tiles[d.tileIndex].districtComplete,
  ).length;
}

export function routeYields(state: GameState, dest: City): Yields {
  const out = emptyYields();
  addYields(out, { food: 1, production: 1 }); // city center
  const bonus = Math.floor(specialtyDistricts(state, dest) / 2);
  addYields(out, { food: bonus, production: bonus });
  return out;
}

/** cityStateRouteYields' flat gold / specialty amounts — exported for the GPU
 * rules dump (seat CS routes mirror these exactly). */
export const CITY_STATE_ROUTE_GOLD = 3;
export const CITY_STATE_ROUTE_SPEC = 1;

/** International routes are gold-heavy: +INTL_ROUTE_GOLD base +1 gold per
 * destination completed specialty district. No food/production (that is the
 * domestic-only channel). Exported for the GPU rules dump. */
export const INTL_ROUTE_GOLD = 3;

export function routeYieldsInternational(state: GameState, dest: City): Yields {
  const out = emptyYields();
  out.gold += INTL_ROUTE_GOLD + specialtyDistricts(state, dest);
  return out;
}

export function cityStateRouteYields(cityState: CityState, mult = 1): Yields {
  const out = emptyYields();
  out.gold += CITY_STATE_ROUTE_GOLD * mult;
  out[CITY_STATE_TYPE_YIELD[cityState.type]] += CITY_STATE_ROUTE_SPEC * mult;
  return out;
}

/** `routeGold` is CARAVANSARIES' "+2 Gold from all Trade Routes" — the
 *  seat's own modifier, passed in because the yield walk already holds it. */
export function cityTradeYields(state: GameState, city: City, routeGold: number): Yields {
  const seat = city.seat;
  const out = emptyYields();
  for (const route of seatOf(state, seat)?.tradeRoutes ?? []) {
    if (route.from !== city.id) continue;
    out.gold += routeGold;
    if (route.toCs !== undefined) {
      const cityState = state.cityStates.find((c) => c.id === route.toCs);
      if (cityState) {
        // SOVEREIGNTY outcome A doubles what a minor of the named TYPE pays
        // the route sent to it.
        addYields(out, cityStateRouteYields(
          cityState, congressCsRouteMult(state, CITY_STATE_TYPES.indexOf(cityState.type))));
        // a SURVIVED City-State Emergency pays its target +2 gold on every
        // minor leg, forever
        out.gold += emergencyCsRouteGold(state, seat);
        // CIV 6, Kumasi's suzerain: "Your Trade Routes to any city-state
        // provide +2 Culture and +1 Gold for every specialty district in the
        // ORIGIN city" — this city, whichever minor the route reaches.
        if (suzerainEffect(state, seat, 'csRouteYields')) {
          const n = completedDistrictCount(state, city, true);
          out.culture += KUMASI_ROUTE_CULTURE * n;
          out.gold += KUMASI_ROUTE_GOLD * n;
        }
      }
      continue;
    }
    if (route.toSeat !== undefined) {
      const civSeat = seatOf(state, route.toSeat);
      const civCity = civSeat?.cities.find((c) => c.id === route.toSeatCity);
      if (civSeat && civCity) {
        addYields(out, routeYieldsInternational(state, civCity));
        // TRADE POLICY outcome A pays the SENDER for every route that ends at
        // the named seat.
        out.gold += congressTradeGold(state, route.toSeat);
        // CIV6 (Reform the Coinage, Golden face): "International Trade Routes
        // provide +3 Gold per specialty district in the foreign city."
        if (goldenDedication(state, seat, DED_COINAGE)) {
          out.gold += COINAGE_INTL_GOLD_PER_SPEC * specialtyDistricts(state, civCity);
        }
      }
      continue;
    }
    const dest = seatOf(state, seat)!.cities.find((c) => c.id === route.to);
    if (dest) {
      addYields(out, routeYields(state, dest));
      const relT = seatOf(state, seat)!.religion;
      if (relT?.founded && relT.enhancer && dest.followedReligion === seat) {
        const tr = ENHANCER_BELIEFS[relT.enhancer]?.effects.tradeReligionYields;
        if (tr) addYields(out, tr);
      }
    }
  }
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
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[b.centerIndex];
  const rng = tradeRouteRange(state, seat, a.centerIndex, b.centerIndex, a, b);
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > rng) {
    return { ok: false, reason: `Beyond trade range (${rng} tiles).` };
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
  route.walkTile = originCenter;
  // The walk runs at the seat's own water level: a pure land descent when it
  // has no Celestial Navigation, sea legs when it has. Only a pair NO descent
  // reaches parks its Trader at the origin.
  const water = tradeWaterLevel(state, seat);
  const walks = tradeWalkReachable(state, originCenter, destCenter, water);
  route.walkLeg = walks ? 0 : -1;
  // the walker lays road on every LAND tile it stands on; the origin is turn 0
  if (walks && !isWater(state.map.tiles[originCenter])) state.map.tiles[originCenter].road = true;
  (seatOf(state, seat)!.tradeRoutes ??= []).push(route);
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
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[cityState.centerIndex];
  const rng = tradeRouteRange(state, seat, a.centerIndex, cityState.centerIndex, a);
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > rng) {
    return { ok: false, reason: `Beyond trade range (${rng} tiles).` };
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
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[civCity.centerIndex];
  const rng = tradeRouteRange(state, seat, a.centerIndex, civCity.centerIndex, a, civCity);
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > rng) {
    return { ok: false, reason: `Beyond trade range (${rng} tiles).` };
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
