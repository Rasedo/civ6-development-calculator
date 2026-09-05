import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { cityTradeYields, incomingIntlRoutes } from '../../../cpu/core/trade';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * A ROUTE COMING IN IS PAID WITH NO ROUTE GOING OUT (A-4r).
 *
 * CIV6 (Radio Oranje): "+2 Culture from each Trade Route another civilization
 * sends to this one." TS always paid it — this side is the oracle A-4r was
 * measured against. The GPU's route walk returned early for a seat with no
 * outgoing route, holding the exit open for Cleopatra's incoming gold alone,
 * so Wilhelmina's +2 stopped the turn her last outgoing route expired.
 *
 * The GPU twin is tests/gpu/incoming_route_test.py. This side pins the oracle
 * so the two can never drift apart quietly again.
 */
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function scene(hostLeader?: string): { state: GameState; host: ReturnType<typeof settleAt>; sender: ReturnType<typeof settleAt> } {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  if (hostLeader !== undefined) state.seats[0].civ = leaderRow(hostLeader);
  const host = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  const sender = settleAt(state, tileAtCoords(state.map, 14, 14).index, 1);
  return { state, host, sender };
}

function routeIn(state: GameState, from: number, to: number, fromCity: number, toCity: number): void {
  const s = seatOf(state, from)!;
  s.tradeRoutes = [...(s.tradeRoutes ?? []),
    { from: fromCity, to: -1, toSeat: to, toSeatCity: toCity, createdTurn: state.turn, expiresTurn: state.turn + 50 }];
}

describe('a route coming in is paid with no route going out', () => {
  it('pays Wilhelmina +2 Culture for one foreign route in and none out', () => {
    const { state, host, sender } = scene('WILHELMINA');
    expect(seatOf(state, 0)!.tradeRoutes ?? []).toEqual([]);
    routeIn(state, 1, 0, sender.id, host.id);
    expect(incomingIntlRoutes(state, host)).toBe(1);
    expect(cityTradeYields(state, host, 0).culture).toBe(2);
  });

  it('counts each foreign route once', () => {
    const { state, host, sender } = scene('WILHELMINA');
    routeIn(state, 1, 0, sender.id, host.id);
    routeIn(state, 1, 0, sender.id, host.id);
    expect(cityTradeYields(state, host, 0).culture).toBe(4);
  });

  it('pays a seat without the row nothing for the same route', () => {
    const { state, host, sender } = scene();
    routeIn(state, 1, 0, sender.id, host.id);
    expect(incomingIntlRoutes(state, host)).toBe(1);
    expect(cityTradeYields(state, host, 0).culture).toBe(0);
  });

  it('does not count her OWN route as incoming', () => {
    // an outgoing international route pays culture through its own terms on
    // every seat, so the oracle is "Oranje adds nothing", not "nothing at all"
    const w = scene('WILHELMINA');
    routeIn(w.state, 0, 1, w.host.id, w.sender.id);
    const plain = scene();
    routeIn(plain.state, 0, 1, plain.host.id, plain.sender.id);
    expect(incomingIntlRoutes(w.state, w.host)).toBe(0);
    // her own route DOES pay +2 — but through INTL_ROUTE_YIELD_ROWS, the
    // SENDING half of Radio Oranje, which is a different row from the one
    // under test here. The incoming row contributes nothing to an own route.
    expect(cityTradeYields(w.state, w.host, 0).culture
      - cityTradeYields(plain.state, plain.host, 0).culture).toBe(2);
  });
});
