import { describe, it, expect } from 'vitest';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { flipCity, freeCitiesPhase } from '../../../cpu/core/phase';
import { emptySeat, setTileOwner, tileSeat, FREE_SEAT } from '../../../cpu/core/seats';
import { amenitiesNeeded, amenityTierIndex } from '../../../cpu/data/constants';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat } from '../../../cpu/core/types';

/** A rival major with one big city at (col, row) — the pull a revolt needs. */
function addRival(state: GameState, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const seat: Seat = { ...emptySeat(state.seats.length), name: 'Rival', color: '#8e3db8', aggression: 0.5, civ: -1 };
  const city: City = {
    id: seat.nextCityId++, name: 'Rival City', seat: seat.seat, centerIndex: tile.index, population: 30,
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

/** Seat 0's capital far west with a Cotton plantation beside it; its pop-9
 *  border city with a Wine plantation beside it; a rival east. */
function scene() {
  const state = makeState(makeMap(24, 14));
  foundCity(state, tileAtCoords(state.map, 2, 7).index, 0);
  const border = foundCity(state, tileAtCoords(state.map, 12, 7).index, 0).city!;
  border.population = 9;
  // a solvent owner: bankruptcy's amenity loss is its own test
  state.seats[0].treasury = 50;
  addRival(state, 16, 7);
  const cotton = tileAtCoords(state.map, 3, 7);
  cotton.resource = 'COTTON';
  cotton.improvement = 'PLANTATION';
  const wine = tileAtCoords(state.map, 11, 7);
  wine.resource = 'WINE';
  wine.improvement = 'PLANTATION';
  return { state, border, wine };
}

describe("the Free City's amenities", () => {
  it('keeps the full need of its population and only the supply its own seat holds', () => {
    const { state, border, wine } = scene();
    // the ordinary city: both of its owner's luxuries reach it
    const before = computeCityStats(state, border).amenities;
    expect(before.needed).toBe(amenitiesNeeded(9));
    const ownerLux = before.have;
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    expect(city.seat).toBe(FREE_SEAT);
    expect(city.amenityTier).toBeUndefined();
    state.freeSeat!.treasury = 50;
    freeCitiesPhase(state);
    const after = computeCityStats(state, city).amenities;
    // CIV6 (measured, a pop-9 Free City): the need is 5, as any city's
    expect(after.needed).toBe(5);
    expect(after.needed).toBe(before.needed);
    // the owner's Cotton stayed with the owner; the Wine inside the Free
    // City's own border is the Free Cities seat's, and still pays
    expect(tileSeat(wine)).toBe(FREE_SEAT);
    expect(after.have).toBe(ownerLux - 1);
    expect(after.have).toBe(1);
    expect(after.tier.name).toBe('Unhappy');
    expect(city.amenityTier).toBe(amenityTierIndex('Unhappy'));
  });

  it('with nothing of its own it sits at 0 against 5: Unrest, not Revolt', () => {
    const { state, border, wine } = scene();
    wine.improvement = null;
    border.loyalty = 0;
    flipCity(state, border);
    const city = state.freeSeat!.cities[0];
    state.freeSeat!.treasury = 50;
    freeCitiesPhase(state);
    const a = computeCityStats(state, city).amenities;
    expect(a.have).toBe(0);
    expect(a.needed).toBe(5);
    expect(a.balance).toBe(-5);
    expect(a.tier.name).toBe('Unrest');
    expect(city.amenityTier).toBe(amenityTierIndex('Unrest'));
  });
});
