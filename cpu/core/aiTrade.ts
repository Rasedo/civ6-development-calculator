/**
 * THE TRADE AI'S ROUTE KNOWLEDGE (GameCore_XP2 AI/CityTrade, the knowledge
 * base's trade record; `tools/civ6lab/dll_readings.md` "C-96: the trade AI's
 * route value" and "H-1: the trade record's player").
 *
 * THE CITY'S TRADE LIST (CityBuildAI +0x870, kept by 0x78f210 in the city's
 * City Analysis job 0x5ce3f0) of a city-state's city and of every major's:
 * per known city in the knowledge base's order not yet sorted (the city
 * itself passes) whose centre the owner has revealed (0x2d2220,
 * `CityState.revealed`, a major's explored plots; an unrevealed one is not
 * tried), a trade path from the city (the Trade_Movement pathfinder
 * 0x559140, `routeInRange`) lists it, else it goes on the rejected list.
 * Once the list holds a city, at most two new cities are tried a turn; a
 * turn that tries none clears the rejected list. A known city gone leaves
 * the list.
 *
 * THE ROUTE VALUE K (0x5e9b20, the knowledge base's +0x680; kept at +0x6d8,
 * logged as AI_Knowledge.csv "TRADE, TO -1, VAL") walks the cities of the
 * player the knowledge base last met (its trade record's +0x6e0, which the
 * meeting signal's 0x787f50 -> 0x5ecb50 writes; its owner before any:
 * `Seat.tradeSeat`), at that player's wars and weights: per city of that
 * player, per known city in the city's trade list, the most a route there
 * pays — an international one, its holder not at war with that player, the
 * route's origin yields with no path term (0x526330 with its last argument
 * 1: a route with no course, the destination's Trading Post Gold the path's:
 * runs/h1_duely1117 t59 China's post at the city-state on plot 614 leaves its K
 * 5.29, six Gold); a domestic one those and its destination's
 * (0x525b90) — each yield valued (`yieldValue`, 0x7a6690) and summed; never
 * below 0. A city-state's knowledge base updates it at its tactical turn,
 * after its city's update and before its City Analysis job: the city build
 * AI's Trader value reads the K of the turn before (`traderValue`).
 *
 * The known cities are the route scorer's (`minorRouteCandidate`): the
 * city-states in id order, then every major's cities in seat and array
 * order.
 */
import { fxOf, yieldValue, type AiValueView } from './aiValue';
import { aiView } from './aiView';
import { civsAtWar, freeSeatOf, isCiv, isCityStateSeat, seatOf } from './seats';
import { minorRouteOriginYields, routeDestYields, routeOriginYields, routePostGold } from './trade';
import { routeInRange } from './tradePath';
import type { CityState, GameState, Seat, TradeRoute, Yields } from './types';

/** a known city a trade AI reads: its centre, its holder and the route
 *  there from `from` (a major's city id, -1 for a city-state's one city) */
interface KnownTradeCity {
  centre: number;
  holder: number;
  route: TradeRoute;
}

function knownTradeCities(state: GameState, selfCentre: number, from: number, owner: number): KnownTradeCity[] {
  const out: KnownTradeCity[] = [];
  for (const d of [...state.cityStates].sort((a, b) => a.id - b.id)) {
    if (d.centerIndex < 0 || d.centerIndex === selfCentre) continue;
    out.push({ centre: d.centerIndex, holder: d.seat, route: { from, to: -1, toCs: d.id } });
  }
  for (const s of state.seats) {
    for (const c of s.cities) {
      if (c.centerIndex === selfCentre) continue;
      out.push({
        centre: c.centerIndex, holder: s.seat,
        route: s.seat === owner ? { from, to: c.id } : { from, to: -1, toSeat: s.seat, toSeatCity: c.id },
      });
    }
  }
  return out;
}

/** 0x78f210 over `known` from the centre `origin`: the list kept a turn on */
function keepTradeList(state: GameState, seat: number, origin: number, known: readonly KnownTradeCity[],
  revealed: (plot: number) => boolean, was: { tradeCities?: number[]; tradeRejected?: number[] }): void {
  const live = new Set(known.map((k) => k.centre));
  const listed = (was.tradeCities ?? []).filter((c) => live.has(c));
  const rejected = [...(was.tradeRejected ?? [])];
  const limited = listed.length > 0;
  let tried = 0;
  for (const k of known) {
    if (listed.includes(k.centre) || rejected.includes(k.centre)) continue;
    if (!revealed(k.centre)) continue;
    if (limited && ++tried > 2) continue;
    if (routeInRange(state, seat, origin, k.centre)) listed.push(k.centre);
    else rejected.push(k.centre);
  }
  was.tradeCities = listed;
  was.tradeRejected = tried === 0 ? [] : rejected;
}

/** 0x78f210: a city-state's city's trade list kept a turn on
 *  (`CityState.tradeCities`, `.tradeRejected`, destination centres) */
export function minorTradeList(state: GameState, cs: CityState): void {
  if (cs.centerIndex < 0) return;
  keepTradeList(state, cs.seat, cs.centerIndex, knownTradeCities(state, cs.centerIndex, -1, cs.seat),
    (p) => cs.revealed?.[p] === 1, cs);
}

/** 0x78f210: each city of a major its trade list kept a turn on, at its
 *  turn's start (`City.tradeCities`, `.tradeRejected`) — the plots it has
 *  explored revealed, every plot where its fog hides none */
export function majorTradeLists(state: GameState, seat: Seat): void {
  const seen = (p: number): boolean => seat.explored.length === 0 || seat.explored[p] === 1;
  for (const c of seat.cities) {
    keepTradeList(state, seat.seat, c.centerIndex, knownTradeCities(state, c.centerIndex, c.id, seat.seat), seen, c);
  }
}

const ROUTE_YIELDS: readonly [keyof Yields, string][] = [
  ['food', 'YIELD_FOOD'], ['production', 'YIELD_PRODUCTION'], ['gold', 'YIELD_GOLD'],
  ['science', 'YIELD_SCIENCE'], ['culture', 'YIELD_CULTURE'], ['faith', 'YIELD_FAITH'],
];

function yieldsValue(view: AiValueView, seat: number, y: Yields): number {
  let v = 0;
  for (const [key, type] of ROUTE_YIELDS) v += yieldValue(view, seat, fxOf(y[key]), type);
  return v;
}

/** 0x5e9b20's walk over the cities of `seat` (raw): a city-state's one
 *  city, a major's each, on their trade lists; 0 for any other */
export function routeValueOver(state: GameState, seat: number): number {
  const p = seatOf(state, seat);
  if (!p) return 0;
  const view = aiView(state);
  let best = 0;
  if (isCityStateSeat(seat)) {
    const cs = p as CityState;
    const listed = new Set(cs.tradeCities ?? []);
    for (const k of knownTradeCities(state, cs.centerIndex, -1, seat)) {
      if (!listed.has(k.centre) || civsAtWar(state, seat, k.holder)) continue;
      const y = minorRouteOriginYields(state, cs, k.route);
      if (!y) continue;
      y.gold -= routePostGold(state, seat, k.centre);
      const v = yieldsValue(view, seat, y);
      if (v > best) best = v;
    }
    return best;
  }
  if (!isCiv(seat)) return 0;
  for (const c of p.cities) {
    const listed = new Set(c.tradeCities ?? []);
    for (const k of knownTradeCities(state, c.centerIndex, c.id, seat)) {
      if (!listed.has(k.centre)) continue;
      const domestic = k.holder === seat;
      if (!domestic && civsAtWar(state, seat, k.holder)) continue;
      const y = routeOriginYields(state, c, k.route);
      if (!domestic) y.gold -= routePostGold(state, seat, k.centre);
      let v = yieldsValue(view, seat, y);
      if (domestic) v += yieldsValue(view, seat, routeDestYields(state, seat, k.route));
      if (v > best) best = v;
    }
  }
  return best;
}

/** 0x5e9b20: a city-state's route value K (raw, `Seat.tradeValue`) over the
 *  cities of the player its knowledge base last met (`CityState.tradeSeat`:
 *  runs/h1_duelw1121 Antioch's 1.80 from t7, Rome's route to it — met at t6 —
 *  Antioch's own to Rome 1.50) */
export function minorTradeValue(state: GameState, cs: CityState): void {
  cs.tradeValue = routeValueOver(state, cs.tradeSeat ?? cs.seat);
}

/** 0x5e9b20: the Free Cities' route value K (raw, `Seat.tradeValue`) at their
 *  knowledge base's ageing. They meet every major on the first turn in seat
 *  order (DiplomacySummary, every duel: 62 meets 0, then 1) and nobody
 *  after, so the walk is over the last major's cities, its lists as its turn
 *  left them (runs/h1_duely1127: K 2.10 from t3, China's route to city-state
 *  4, met at t2) */
export function freeTradeValue(state: GameState): void {
  const majors = state.seats.filter((s) => isCiv(s.seat));
  freeSeatOf(state).tradeValue = majors.length ? routeValueOver(state, majors[majors.length - 1].seat) : 0;
}
