import { describe, it, expect } from 'vitest';
import { emptySeat, seatOf, setTileOwner } from '../../../cpu/core/seats';
import { makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import {
  spawnUnit, archaeologistExcavate, naturalistPark, parkCluster, parkClusterLegal,
  trainableUnits, digUnderfoot, SHIPWRECK_CIVIC,
} from '../../../cpu/core/units';
import { markAntiquitySite, markShipwreck } from '../../../cpu/core/combat';
import { purchaseNaturalist, naturalistCost } from '../../../cpu/core/game';
import { FAITH_PURCHASE_MULT } from '../../../cpu/data/constants';
import { seatTourism, parkAmenities } from '../../../cpu/core/city';
import { tileAppeal } from '../../../cpu/core/appeal';
import { museumThemed, THEMING_MULT, ARTIFACT_BUILDING, ARTIFACT_SLOTS, ARTIFACT_TOURISM, artifactTourism } from '../../../cpu/data/greatPeople';
import { PARK_MIN_APPEAL, PARK_AMENITIES_OWNER, PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../../../cpu/data/improvements';
import { UNITS, NATURALIST_COST_STEP } from '../../../cpu/data/units';
import type { City, GameState } from '../../../cpu/core/types';

// NATIONAL PARKS, SHIPWRECKS and THEMING. Sourced from the Civ 6 wiki:
// a park is four contiguous Charming-or-better tiles of ONE city with nothing
// built on them, pays Tourism equal to their total Appeal and 2 amenities to
// its owner plus 1 to the four closest cities; an Archaeologist works
// Shipwrecks as well as Antiquity Sites; a themed Archaeological Museum (one
// era, three civilizations) doubles what it holds.

function found(state: GameState, col: number, row: number): City {
  return settleAt(state, tileAtCoords(state.map, col, row).index);
}

/** make `t` and its cluster-mates appealing enough for a park, owned by `city`. */
function prepPark(state: GameState, city: City, tiles: number[]): void {
  for (const i of tiles) {
    const t = state.map.tiles[i];
    setTileOwner(t, city.seat, city.id);
    t.improvement = null;
    t.district = null;
    t.builtWonder = null;
    // WOODS on every neighbour lifts appeal past Charming without touching
    // the tile itself (the appeal body is pure adjacency plus own terrain).
    for (const n of state.map.tiles) {
      if (n.index === i) continue;
      const d = Math.abs(n.col - t.col) + Math.abs(n.row - t.row);
      if (d <= 2 && !n.district && !n.builtWonder) n.feature = 'WOODS';
    }
  }
}

describe('the Naturalist and the National Park', () => {
  it('the sourced constants', () => {
    // GlobalParameters: NATIONAL_PARK_AMENITIES_OWNING_CITY 2,
    // NATIONAL_PARK_NUM_OTHER_AMENITY_CITIES 4; Charming is appeal 2.
    expect(PARK_AMENITIES_OWNER).toBe(2);
    expect(PARK_AMENITIES_NEAR).toBe(1);
    expect(PARK_AMENITY_CITIES).toBe(4);
    expect(PARK_MIN_APPEAL).toBe(2);
    // the unit itself: a Modern civilian behind CONSERVATION, faith-only
    expect(UNITS.NATURALIST.combat).toBe(0);
    expect(UNITS.NATURALIST.naturalist).toBe(true);
    expect(UNITS.NATURALIST.requiresCivic).toBe('CONSERVATION');
  });

  it('a NATURALIST is bought with faith alone and never joins a production column', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    const seat = seatOf(state, 0)!;
    // no civic yet -> refused whatever the treasury says
    seat.faith = 10_000;
    expect(purchaseNaturalist(state, city.id, 0).ok).toBe(false);
    grantCivics(state, 'CONSERVATION');
    // ...and it is never a production option, at any tech level
    expect(trainableUnits(state, 0, city).some((u) => u.id === 'NATURALIST')).toBe(false);
    const before = seat.faith;
    const price = naturalistCost(state, 0);
    expect(purchaseNaturalist(state, city.id, 0).ok).toBe(true);
    expect(seat.faith).toBe(before - price);
    // CIV6 (Naturalist): the faith cost is progressive — each one bought
    // raises the next price by the game table's 50.
    expect(naturalistCost(state, 0)).toBe(price + NATURALIST_COST_STEP * FAITH_PURCHASE_MULT);
    expect(state.units.some((u) => u.type === 'NATURALIST' && u.seat === 0)).toBe(true);
  });

  it('the cluster is the hex rhombus: a pair plus the two tiles adjacent to both', () => {
    const state = makeState();
    const a = tileAtCoords(state.map, 5, 5).index;
    const b = state.map.tiles[a].index;
    void b;
    const nb = tileAtCoords(state.map, 6, 5).index;
    const cluster = parkCluster(state, a, nb);
    expect(cluster.length).toBe(4);
    expect(cluster).toContain(a);
    expect(cluster).toContain(nb);
    // sorted, so both engines name the same anchor
    expect([...cluster].sort((x, y) => x - y)).toEqual(cluster);
    // a non-adjacent pair is no cluster at all
    expect(parkCluster(state, a, tileAtCoords(state.map, 9, 9).index)).toEqual([]);
  });

  it('designating a park needs appeal, one city and empty ground — then pays tourism and amenities', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    grantCivics(state, 'CONSERVATION');
    const anchor = tileAtCoords(state.map, 7, 6).index;
    const partner = tileAtCoords(state.map, 8, 6).index;
    const cluster = parkCluster(state, anchor, partner);
    expect(cluster.length).toBe(4);
    prepPark(state, city, cluster);
    for (const i of cluster) expect(tileAppeal(state.map, state.map.tiles[i])).toBeGreaterThanOrEqual(PARK_MIN_APPEAL);
    expect(parkClusterLegal(state, cluster, 0)).toBe(true);

    // an improvement on one tile refuses the whole cluster
    state.map.tiles[cluster[1]].improvement = 'FARM';
    expect(parkClusterLegal(state, cluster, 0)).toBe(false);
    state.map.tiles[cluster[1]].improvement = null;
    // ...so does a tile another city owns
    const other = found(state, 10, 10);
    const keep = state.map.tiles[cluster[2]].ownerCity;
    setTileOwner(state.map.tiles[cluster[2]], 0, other.id);
    expect(parkClusterLegal(state, cluster, 0)).toBe(false);
    setTileOwner(state.map.tiles[cluster[2]], 0, keep);
    expect(parkClusterLegal(state, cluster, 0)).toBe(true);

    const tourBefore = seatTourism(state, 0);
    const nat = spawnUnit(state, 'NATURALIST', anchor, 0)!;
    nat.tileIndex = anchor;
    expect(naturalistPark(state, nat.id, 0).ok).toBe(true);
    // the Naturalist is CONSUMED
    expect(state.units.some((u) => u.id === nat.id)).toBe(false);
    // every tile carries the cluster's ANCHOR — its lowest index
    const parked = state.map.tiles.filter((t) => (t.park ?? -1) >= 0);
    expect(parked.length).toBe(4);
    for (const t of parked) expect(t.park).toBe(Math.min(...parked.map((p) => p.index)));
    // TOURISM = the total appeal of the four tiles
    const appealSum = parked.reduce((n, t) => n + tileAppeal(state.map, t), 0);
    expect(seatTourism(state, 0) - tourBefore).toBe(appealSum);
    // AMENITIES: 2 to the owner, 1 to the four nearest others
    const ownerCity = state.map.tiles[parked[0].index].ownerCity === city.id ? city : other;
    expect(parkAmenities(state, ownerCity)).toBeGreaterThanOrEqual(PARK_AMENITIES_OWNER);
    const nearCity = ownerCity.id === city.id ? other : city;
    expect(parkAmenities(state, nearCity)).toBe(PARK_AMENITIES_NEAR);
  });

  it('a second park on the same tiles is refused', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    const anchor = tileAtCoords(state.map, 7, 6).index;
    const cluster = parkCluster(state, anchor, tileAtCoords(state.map, 8, 6).index);
    prepPark(state, city, cluster);
    const nat = spawnUnit(state, 'NATURALIST', anchor, 0)!;
    nat.tileIndex = anchor;
    expect(naturalistPark(state, nat.id, 0).ok).toBe(true);
    const nat2 = spawnUnit(state, 'NATURALIST', anchor, 0)!;
    nat2.tileIndex = anchor;
    // every rhombus through the anchor now contains a park tile
    expect(naturalistPark(state, nat2.id, 0).ok).toBe(false);
  });
});

describe('shipwrecks', () => {
  it('a hull going down leaves a wreck, and only Cultural Heritage lets one be worked', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    // the synthetic map is all grassland; make one tile water for the wreck
    const water = tileAtCoords(state.map, 8, 8);
    water.terrain = 'COAST';
    markShipwreck(state, water.index, 0);
    expect(water.shipwreck).toBe(true);
    // no stacking, exactly like the land dig
    markShipwreck(state, water.index, 0);
    expect(water.shipwreck).toBe(true);
    // a LAND tile never takes one
    const land = tileAtCoords(state.map, 6, 5);
    markShipwreck(state, land.index, 0);
    expect(land.shipwreck).toBeFalsy();

    // the wreck is invisible work until CULTURAL_HERITAGE
    expect(digUnderfoot(state, water, 0)).toBe(null);
    grantCivics(state, SHIPWRECK_CIVIC);
    expect(digUnderfoot(state, water, 0)).toBe('shipwreck');

    const arch = spawnUnit(state, 'ARCHAEOLOGIST', water.index, 0)!;
    arch.tileIndex = water.index;
    expect(archaeologistExcavate(state, arch.id, 0).ok).toBe(true);
    expect(city.artifacts).toBe(1);
    expect(water.shipwreck).toBe(false); // removed from the map
  });
});

describe('theming', () => {
  it('one era and three civilizations doubles the museum, and any repeat breaks it', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    city.artifacts = ARTIFACT_SLOTS;
    city.artifactEras = [1, 1, 1];
    city.artifactSeats = [0, 1, 2];
    expect(museumThemed(city)).toBe(true);
    expect(artifactTourism(city)).toBe(ARTIFACT_SLOTS * ARTIFACT_TOURISM * THEMING_MULT);
    // a repeated civilization breaks it
    city.artifactSeats = [0, 1, 1];
    expect(museumThemed(city)).toBe(false);
    expect(artifactTourism(city)).toBe(ARTIFACT_SLOTS * ARTIFACT_TOURISM);
    // ...so does a mixed era
    city.artifactSeats = [0, 1, 2];
    city.artifactEras = [1, 2, 1];
    expect(museumThemed(city)).toBe(false);
    // ...and so does an empty slot
    city.artifactEras = [1, 1, 1];
    city.artifacts = ARTIFACT_SLOTS - 1;
    expect(museumThemed(city)).toBe(false);
  });

  it('a dug artifact carries the era and the seat that buried it', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    state.seats.push(emptySeat(1)); // a second civilization to bury the find
    const dig = tileAtCoords(state.map, 6, 5);
    setTileOwner(dig, 0, city.id);
    markAntiquitySite(state, dig.index, 1);
    expect(dig.antiquitySeat).toBe(1);
    expect(dig.antiquityEra).toBe(0); // nothing researched yet: Ancient
    const arch = spawnUnit(state, 'ARCHAEOLOGIST', dig.index, 0)!;
    arch.tileIndex = dig.index;
    expect(archaeologistExcavate(state, arch.id, 0).ok).toBe(true);
    expect(city.artifactEras).toEqual([0]);
    expect(city.artifactSeats).toEqual([1]);
    // the dig's provenance is cleared with the dig
    expect(dig.antiquityEra).toBeUndefined();
  });
});
