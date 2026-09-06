import { describe, it, expect } from 'vitest';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity, endTurn } from '../../../cpu/core/game';
import { tilesWithin } from '../../../world/hex';
import { flipCity, freeCitiesPhase, freeCityLoyaltyDelta, loyaltyDelta, applyLoyalty, declareWar } from '../../../cpu/core/phase';
import { meleeAttack, attackTargets } from '../../../cpu/core/combat';
import { spawnUnit, unitsHostile } from '../../../cpu/core/units';
import { FREE_SEAT, atWarWithAny, emptySeat, isTerritorial, seatOf, setTileOwner, tileCity, tileSeat } from '../../../cpu/core/seats';
import { CIV_LEADERS, FREE_CITY_LOYALTY_PER_TURN, LOYALTY_MAX } from '../../../cpu/data/seats';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import type { GameState, City, Seat } from '../../../cpu/core/types';

const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

/** A second major with one city of `population` at (col, row). */
function addCiv(state: GameState, col: number, row: number, population: number, civ = -1): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const seat: Seat = { ...emptySeat(state.seats.length), name: 'Rival', color: '#8e3db8', aggression: 0.5, civ };
  const city: City = {
    id: seat.nextCityId++, name: 'Rival City', seat: seat.seat, centerIndex: tile.index, population,
    foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced', queue: [], isCapital: true,
    buildings: ['PALACE'], districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [],
    hp: CITY_MAX_HP, foundedTurn: 1, origCapitalSeat: seat.seat, founderSeat: seat.seat,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, seat.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) if (tileSeat(t) < 0) setTileOwner(t, seat.seat, city.id);
  seat.cities.push(city);
  seat.capitalTile = tile.index;
  state.seats.push(seat);
  return seat;
}

/** Seat 0's capital far west, its border city in the middle, a rival of
 *  `rivalPop` two tiles east of the border city. */
function scene(rivalPop = 30, rivalCiv = -1) {
  const state = makeState(makeMap(24, 14));
  const capital = foundCity(state, tileAtCoords(state.map, 2, 7).index, 0).city!;
  const border = foundCity(state, tileAtCoords(state.map, 12, 7).index, 0).city!;
  border.population = 3;
  const rival = addCiv(state, 14, 7, rivalPop, rivalCiv);
  return { state, capital, border, rival };
}

describe('the Free City step', () => {
  it('a revolt makes a Free City, not a transfer', () => {
    const { state, border, rival } = scene();
    border.loyalty = 0;
    const pop = border.population;
    const hp = border.hp;
    flipCity(state, border);
    const free = state.freeSeat!;
    expect(free).toBeDefined();
    expect(free.seat).toBe(FREE_SEAT);
    expect(free.cities.length).toBe(1);
    const city = free.cities[0];
    expect(city.name).toBe(border.name);
    expect(city.seat).toBe(FREE_SEAT);
    // CIV6: nothing about the revolt is a conquest — the people, the walls'
    // health and the buildings stay; loyalty restarts at 100
    expect(city.population).toBe(pop);
    expect(city.hp).toBe(hp);
    expect(city.loyalty).toBe(LOYALTY_MAX);
    expect(city.isCapital).toBe(false);
    expect(city.freePressure).toEqual(state.seats.map(() => 0));
    // neither the old owner nor the puller holds it
    expect(seatOf(state, 0)!.cities.some((c) => c.name === border.name)).toBe(false);
    expect(rival.cities.some((c) => c.name === border.name)).toBe(false);
    const centre = state.map.tiles[city.centerIndex];
    expect(tileSeat(centre)).toBe(FREE_SEAT);
    expect(tileCity(centre)).toBe(city.id);
    expect(isTerritorial(FREE_SEAT)).toBe(true);
    expect(state.eventLog.some((e) => e.includes('revolted'))).toBe(true);
  });

  it("Eleanor's pull skips the step: the city joins her at once", () => {
    const { state, border, rival } = scene(30, leaderRow('ELEANOR_ENGLAND'));
    border.loyalty = 0;
    flipCity(state, border);
    expect(state.freeSeat?.cities.length ?? 0).toBe(0);
    expect(rival.cities.some((c) => c.name === border.name)).toBe(true);
    expect(tileSeat(state.map.tiles[border.centerIndex])).toBe(rival.seat);
  });

  it('a Free City runs its own loyalty and joins the seat that pulled hardest', () => {
    const { state, border, rival } = scene(30);
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    // CIV6 (IDENTITY_PER_TURN_FROM_FREE_CITIES): +10 base, then the citizen
    // pressure — the rival's 30 citizens two tiles away outweigh its own 3
    const d = freeCityLoyaltyDelta(state, city);
    expect(d).toBeLessThan(FREE_CITY_LOYALTY_PER_TURN);
    expect(d).toBeLessThan(0);
    // ...and the race accrued the rival's share, nothing for the far capital
    expect(city.freePressure![rival.seat]).toBeGreaterThan(0);
    expect(city.freePressure![0]).toBe(0);
    city.loyalty = 1;
    freeCitiesPhase(state);
    expect(state.freeSeat!.cities.length).toBe(0);
    const joined = rival.cities.find((c) => c.name === border.name)!;
    expect(joined).toBeDefined();
    expect(joined.population).toBe(3);
    expect(joined.loyalty).toBe(LOYALTY_MAX);
    expect(joined.freePressure).toBeUndefined();
    expect(state.eventLog.some((e) => e.includes('joined'))).toBe(true);
  });

  it('a Free City that nobody pulls stays Free at 0', () => {
    const { state, border, rival } = scene(30);
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    city.loyalty = 1;
    city.freePressure = state.seats.map(() => 0);
    rival.cities[0].population = 1; // too weak to move it this turn
    freeCitiesPhase(state);
    expect(state.freeSeat!.cities.length).toBe(1);
  });

  it('a Free City exerts pressure on its neighbours and counts as another holder', () => {
    const { state, border } = scene(30);
    // seat 0's own city four tiles west of the border city
    const near = foundCity(state, tileAtCoords(state.map, 8, 7).index, 0).city!;
    border.population = 20;
    const before = loyaltyDelta(state, near, 'Content');
    border.loyalty = 0;
    flipCity(state, border);
    // the same 20 citizens now press AGAINST seat 0 instead of for it
    expect(loyaltyDelta(state, near, 'Content')).toBeLessThan(before);
    // a lone seat with only a Free City beside it still runs loyalty
    state.seats.splice(1, 1);
    expect(applyLoyalty(state, near, 'Content')).toBe(false);
    expect(near.loyalty).toBeDefined();
  });

  it('anyone may attack a Free City without a declaration, and none can be made', () => {
    const { state, border, rival } = scene(30);
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    expect(atWarWithAny(state, rival.seat)).toBe(false);
    expect(declareWar(state, rival.seat, FREE_SEAT).ok).toBe(false);
    expect(unitsHostile(state, { seat: rival.seat }, { seat: FREE_SEAT })).toBe(true);
    expect(unitsHostile(state, { seat: 0 }, { seat: FREE_SEAT })).toBe(true);
    const centre = state.map.tiles[city.centerIndex];
    const warrior = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, centre.col + 1, centre.row).index, rival.seat)!;
    expect(attackTargets(state, warrior)).toContain(city.centerIndex);
    const hp0 = city.hp;
    expect(meleeAttack(state, warrior.id, city.centerIndex, rival.seat).ok).toBe(true);
    expect(city.hp).toBeLessThan(hp0);
    expect(atWarWithAny(state, rival.seat)).toBe(false);
  });

  it('a Free City heals in its own phase and survives a full turn', () => {
    const { state, border } = scene(30);
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    city.hp = 100;
    city.loyalty = 90;
    endTurn(state);
    expect(city.hp).toBeGreaterThan(100);
    expect(state.freeSeat!.cities.length).toBe(1);
  });
});
