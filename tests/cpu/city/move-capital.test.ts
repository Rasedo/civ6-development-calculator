import { describe, it, expect } from 'vitest';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity, dominationWinner, projectSeatOk } from '../../../cpu/core/game';
import { transferCity } from '../../../cpu/core/phase';
import { occupiedCapitals } from '../../../cpu/core/seatTurn';
import { emptySeat, homeContinent, moveCapital, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { tilesWithin } from '../../../world/hex';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { PROJECTS } from '../../../cpu/data/projects';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import type { GameState, City, Seat } from '../../../cpu/core/types';

const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

/** A second major with one capital of `population` at (col, row). */
function addCiv(state: GameState, col: number, row: number, civ = -1): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const seat: Seat = { ...emptySeat(state.seats.length), name: 'Rival', color: '#8e3db8', aggression: 0.5, civ };
  const city: City = {
    id: seat.nextCityId++, name: 'Rival City', seat: seat.seat, centerIndex: tile.index, population: 5,
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

/** Seat 0 with its capital A and a second city B; a rival with capital C. */
function scene() {
  const state = makeState(makeMap(24, 14));
  state.seats[0].civ = civRow('PHOENICIA');
  const a = foundCity(state, tileAtCoords(state.map, 4, 7).index, 0).city!;
  const b = foundCity(state, tileAtCoords(state.map, 10, 7).index, 0).city!;
  const rival = addCiv(state, 18, 7);
  return { state, a, b, rival };
}

describe('a civilization-unique project', () => {
  it('is offered to its civilization (or leader) alone; a plain row is everyone\'s', () => {
    const { state, rival } = scene();
    expect(projectSeatOk(state, { civ: 'PHOENICIA' }, 0)).toBe(true);
    expect(projectSeatOk(state, { civ: 'PHOENICIA' }, rival.seat)).toBe(false);
    expect(projectSeatOk(state, { leader: 'DIDO' }, 0)).toBe(true);
    expect(projectSeatOk(state, { leader: 'DIDO' }, rival.seat)).toBe(false);
    expect(projectSeatOk(state, {}, rival.seat)).toBe(true);
    rival.civ = leaderRow('DIDO');
    expect(projectSeatOk(state, { civ: 'PHOENICIA' }, rival.seat)).toBe(true);
    // the Cothon's project cannot be in the catalog until the Cothon is a
    // district (docs/AUDIT.md C-61 / C-69): no shipped row is gated yet
    expect(Object.values(PROJECTS).every((p) => p.civ === undefined && p.leader === undefined && !p.movesCapital)).toBe(true);
  });
});

describe('moving the original capital', () => {
  it('moves the Palace, the capital tile and the original-capital mark together', () => {
    const { state, a, b } = scene();
    expect(a.isCapital).toBe(true);
    expect(a.origCapitalSeat).toBe(0);
    const home = homeContinent(state, 0);
    moveCapital(state, state.seats[0], b);
    expect(a.isCapital).toBe(false);
    expect(a.buildings).not.toContain('PALACE');
    expect(a.origCapitalSeat).toBe(-1);
    expect(b.isCapital).toBe(true);
    expect(b.buildings).toContain('PALACE');
    expect(b.origCapitalSeat).toBe(0);
    expect(state.seats[0].capitalTile).toBe(b.centerIndex);
    // the same landmass, so the home continent stays what it was
    expect(homeContinent(state, 0)).toBe(home);
  });

  it('the domination check and the occupied-capital reading follow the move', () => {
    // WITHOUT the move: the rival holding A (seat 0's original capital) and
    // its own C holds every capital
    const s1 = scene();
    transferCity(s1.state, 0, s1.rival, s1.a, 'conquered');
    expect(dominationWinner(s1.state)).toBe(s1.rival.seat);
    expect(occupiedCapitals(s1.state, s1.rival.seat)).toBe(1);
    // WITH the move to B first: A is no longer a capital of anyone's, so the
    // rival holds one capital of two and sits in no original capital
    const s2 = scene();
    moveCapital(s2.state, s2.state.seats[0], s2.b);
    transferCity(s2.state, 0, s2.rival, s2.a, 'conquered');
    expect(dominationWinner(s2.state)).toBe(-1);
    expect(occupiedCapitals(s2.state, s2.rival.seat)).toBe(0);
    // ...and taking B as well wins it
    transferCity(s2.state, 0, s2.rival, s2.b, 'conquered');
    expect(dominationWinner(s2.state)).toBe(s2.rival.seat);
  });
});
