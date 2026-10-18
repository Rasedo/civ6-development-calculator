/**
 * THE TRADE AI'S ROUTE KNOWLEDGE OF A CITY-STATE (GameCore_XP2 AI/CityTrade,
 * the knowledge base's trade record; `tools/civ6lab/dll_readings.md` "C-96:
 * the trade AI's route value").
 *
 * THE CITY'S TRADE LIST (CityBuildAI +0x870, kept by 0x78f210 at the city's
 * analysis): per known city in the knowledge base's order not yet sorted
 * whose centre the minor has revealed (0x2d2220, `CityState.revealed`; an
 * unrevealed one is not tried), a trade path from the city (the
 * Trade_Movement pathfinder 0x559140, `routeInRange`) lists it, else it goes
 * on the rejected list. Once the list
 * holds a city, at most two new cities are tried a turn; a turn that tries
 * none clears the rejected list. A known city gone leaves the list.
 *
 * THE ROUTE VALUE K (0x5e9b20, the knowledge base's +0x680; kept at +0x6d8,
 * logged as AI_Knowledge.csv "TRADE, TO -1, VAL"): over the listed cities
 * whose holder the minor is not at war with, the most a route there pays the
 * minor — each yield of the route's origin yields with no path term
 * (0x526330 with its last argument 1: `minorRouteOriginYields` on a route
 * with no course) valued (`yieldValue`, 0x7a6690) and summed — never below
 * 0. The knowledge base updates it at its tactical turn, after the city's
 * update: the city build AI's Trader value reads the one of the turn before
 * (`traderValue`).
 *
 * The known cities are the route scorer's (`minorRouteCandidate`): the other
 * city-states in id order, then every major's cities in seat and array
 * order.
 */
import { fxOf, yieldValue } from './aiValue';
import { majorView } from './majorView';
import { civsAtWar } from './seats';
import { minorRouteOriginYields } from './trade';
import { routeInRange } from './tradePath';
import type { CityState, GameState, TradeRoute, Yields } from './types';

/** a known city the minor's trade AI reads: its centre and its route */
interface KnownTradeCity {
  centre: number;
  holder: number;
  route: TradeRoute;
}

function knownTradeCities(state: GameState, cs: CityState): KnownTradeCity[] {
  const out: KnownTradeCity[] = [];
  for (const d of [...state.cityStates].sort((a, b) => a.id - b.id)) {
    if (d.id === cs.id || d.centerIndex < 0) continue;
    out.push({ centre: d.centerIndex, holder: d.seat, route: { from: -1, to: -1, toCs: d.id } });
  }
  for (const s of state.seats) {
    for (const c of s.cities) out.push({ centre: c.centerIndex, holder: s.seat, route: { from: -1, to: -1, toSeat: s.seat, toSeatCity: c.id } });
  }
  return out;
}

/** 0x78f210: the city's trade list kept a turn on (`CityState.tradeCities`,
 *  `.tradeRejected`, destination centres) */
export function minorTradeList(state: GameState, cs: CityState): void {
  if (cs.centerIndex < 0) return;
  const known = knownTradeCities(state, cs);
  const live = new Set(known.map((k) => k.centre));
  const listed = (cs.tradeCities ?? []).filter((c) => live.has(c));
  const rejected = [...(cs.tradeRejected ?? [])];
  const limited = listed.length > 0;
  let tried = 0;
  for (const k of known) {
    if (listed.includes(k.centre) || rejected.includes(k.centre)) continue;
    if (cs.revealed?.[k.centre] !== 1) continue;
    if (limited && ++tried > 2) continue;
    if (routeInRange(state, cs.seat, cs.centerIndex, k.centre)) listed.push(k.centre);
    else rejected.push(k.centre);
  }
  cs.tradeCities = listed;
  cs.tradeRejected = tried === 0 ? [] : rejected;
}

const ROUTE_YIELDS: readonly [keyof Yields, string][] = [
  ['food', 'YIELD_FOOD'], ['production', 'YIELD_PRODUCTION'], ['gold', 'YIELD_GOLD'],
  ['science', 'YIELD_SCIENCE'], ['culture', 'YIELD_CULTURE'], ['faith', 'YIELD_FAITH'],
];

/** 0x5e9b20: the minor's route value K (raw, `CityState.tradeValue`) */
export function minorTradeValue(state: GameState, cs: CityState): void {
  const listed = new Set(cs.tradeCities ?? []);
  const view = majorView(state);
  let best = 0;
  for (const k of knownTradeCities(state, cs)) {
    if (!listed.has(k.centre) || civsAtWar(state, cs.seat, k.holder)) continue;
    const y = minorRouteOriginYields(state, cs, k.route);
    if (!y) continue;
    let v = 0;
    for (const [key, type] of ROUTE_YIELDS) v += yieldValue(view, cs.seat, fxOf(y[key]), type);
    if (v > best) best = v;
  }
  cs.tradeValue = best;
}
