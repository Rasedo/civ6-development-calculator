import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders, settleAt } from '../helpers';
import { canPlaceDistrictIn, canalPassageOk, riverSideCount, buildingCompletable } from '../../../cpu/core/rules';
import { computeHousing, districtMaintenance, seatBuildingSum } from '../../../cpu/core/city';
import { cityDistrictSum, cityPower, localAmenities } from '../../../cpu/core/yields';
import { standingLoyalty, ungovernedLoyalty } from '../../../cpu/core/phase';
import { grantedGovernorTitles } from '../../../cpu/core/eras';
import { cityCounterLevels, spyCapacity } from '../../../cpu/core/espionage';
import { PRESERVE_APPEAL_HOUSING, appealBand, tileAppeal } from '../../../cpu/core/appeal';
import { completeQueueItem } from '../../../cpu/core/production';
import { preserveTileYields } from '../../../cpu/core/effects';
import { neighborTile, neighbors } from '../../../world/hex';
import { NO_SEAT, seatOf, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { DISTRICTS } from '../../../cpu/data/districts';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, DistrictId, GameMap, GameState, Tile } from '../../../cpu/core/types';

// The six districts that arrived together, and every system each one reaches:
// placement geometry, appeal, housing, amenities, loyalty, governor titles,
// envoys, power, and what a spy sees. Each assertion quotes the clause it
// enforces, because the number alone says nothing about where it came from.

function board(): { state: GameState; city: City; map: GameMap } {
  const state = makeState(makeMap(18, 18));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index);
  city.population = 12; // enough specialty slots that placement never runs out
  expandBorders(state, city, 3);
  return { state, city, map: state.map };
}

/** Placement with research and ownership out of the way, so what answers is
 *  the district's own geometry. */
function place(state: GameState, city: City, type: DistrictId, tile: Tile) {
  return canPlaceDistrictIn(state, city, type, tile.index, {
    unlocks: null,
    ownsTile: () => true,
  });
}

/** Run a river along `dirs` of `tile`, mirrored onto the far side of each
 *  neighbour — which is what makes the two tiles one river to `riverReach`. */
function river(map: GameMap, tile: Tile, dirs: number[]): void {
  for (const d of dirs) {
    tile.riverMask |= 1 << d;
    const n = neighborTile(map, tile, d);
    if (n) n.riverMask |= 1 << ((d + 3) % 6);
  }
}

function build(city: City, type: DistrictId, tile: Tile, complete = true): Tile {
  tile.district = type;
  tile.districtComplete = complete;
  city.districts.push({ type, tileIndex: tile.index });
  return tile;
}

/** the direction from `tile` to the city centre */
function towardCentre(map: GameMap, tile: Tile, city: City): number {
  const d = [0, 1, 2, 3, 4, 5].find((k) => neighborTile(map, tile, k)?.index === city.centerIndex);
  if (d === undefined) throw new Error('tile is not next to the centre');
  return d;
}

describe('the Dam', () => {
  it('needs a floodplain with the river along two of its sides', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 6, 8);
    expect(riverSideCount(t)).toBe(0);
    // CIV6 (Dam): "It must be built on a Floodplains tile and the River must
    // traverse at least 2 adjacent sides of the future Dam tile."
    river(map, t, [0, 1]);
    expect(riverSideCount(t)).toBe(2);
    expect(place(state, city, 'DAM', t).reason).toBe('Must be on a floodplain.');
    t.feature = 'FLOODPLAINS';
    expect(place(state, city, 'DAM', t).ok).toBe(true);

    const thin = tileAtCoords(map, 10, 8);
    thin.feature = 'FLOODPLAINS';
    river(map, thin, [2]);
    expect(place(state, city, 'DAM', thin).reason).toBe('The river must run along two of its sides.');
  });

  it('takes one per river, and a second river takes its own', () => {
    const { state, city, map } = board();
    const a = tileAtCoords(map, 6, 8);
    a.feature = 'FLOODPLAINS';
    river(map, a, [0, 1]);
    const up = neighborTile(map, a, 0)!;
    up.feature = 'FLOODPLAINS';
    build(city, 'DAM', up);
    // CIV6 (Dam): "Limit of one per River."
    expect(place(state, city, 'DAM', a).reason).toBe('This river already has a Dam.');

    const b = tileAtCoords(map, 10, 8);
    b.feature = 'FLOODPLAINS';
    river(map, b, [0, 1]);
    expect(place(state, city, 'DAM', b).ok).toBe(true);
  });

  it('pays 3 housing, costs nothing to keep, and carries the flood shield', () => {
    const { state, city, map } = board();
    const before = computeHousing(state, city);
    const t = tileAtCoords(map, 6, 8);
    t.feature = 'FLOODPLAINS';
    river(map, t, [0, 1]);
    build(city, 'DAM', t);
    // CIV6 (Dam): "+3 Housing", and no maintenance of its own.
    expect(computeHousing(state, city) - before).toBe(3);
    expect(districtMaintenance('DAM')).toBe(0);
    expect(DISTRICTS.DAM.floodShield).toBe(true);
  });
});

describe('the Canal', () => {
  it('wants water on one side and a City Center or more water on the other', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 7, 8);
    const toCentre = towardCentre(map, t, city);
    expect(place(state, city, 'CANAL', t).ok).toBe(false);

    // CIV6 (Canal): "a single canal passage may go either straight, or bend 60
    // degrees" — so the entry and the exit sit 2, 3 or 4 directions apart.
    const straight = neighborTile(map, t, (toCentre + 3) % 6)!;
    straight.terrain = 'LAKE';
    expect(canalPassageOk(map, t)).toBe(true);
    expect(place(state, city, 'CANAL', t).ok).toBe(true);

    straight.terrain = 'GRASSLAND';
    neighborTile(map, t, (toCentre + 1) % 6)!.terrain = 'LAKE';
    expect(canalPassageOk(map, t)).toBe(false); // a 120-degree turn is no passage
  });

  it('refuses hills', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 7, 8);
    neighborTile(map, t, (towardCentre(map, t, city) + 3) % 6)!.terrain = 'LAKE';
    t.elevation = 'HILLS';
    expect(place(state, city, 'CANAL', t).reason).toBe('Must be on flat land.');
  });
});

describe('the Water Park', () => {
  it('and the Entertainment Complex refuse each other, either way round', () => {
    const { state, city, map } = board();
    const water = tileAtCoords(map, 6, 8);
    water.terrain = 'COAST';
    const land = tileAtCoords(map, 10, 8);
    expect(place(state, city, 'WATER_PARK', water).ok).toBe(true);

    // CIV6 (Water Park): "cannot be built if an Entertainment Complex already
    // exists in this city", and the Entertainment Complex says the same of it.
    const ec = build(city, 'ENTERTAINMENT_COMPLEX', land);
    expect(place(state, city, 'WATER_PARK', water).reason)
      .toBe('Entertainment Complex already exists in this city.');

    city.districts.pop();
    ec.district = null;
    ec.districtComplete = false;
    build(city, 'WATER_PARK', water);
    expect(place(state, city, 'ENTERTAINMENT_COMPLEX', land).reason)
      .toBe('Water Park already exists in this city.');
  });

  it('pays an amenity and a point of maintenance, and goes dark when pillaged', () => {
    const { state, city, map } = board();
    const water = tileAtCoords(map, 6, 8);
    water.terrain = 'COAST';
    const before = localAmenities(state, city); // the Palace pays one of its own
    build(city, 'WATER_PARK', water);
    // CIV6 (Water Park): "+1 Amenity from entertainment."
    expect(cityDistrictSum(state, city, 'amenities')).toBe(1);
    expect(localAmenities(state, city)).toBe(before + 1);
    expect(districtMaintenance('WATER_PARK')).toBe(1);

    water.districtPillaged = true;
    expect(localAmenities(state, city)).toBe(before);
  });

  it('carries the Ferris Wheel, and its Aquarium reaches nine tiles', () => {
    // CIV6 (Aquarium, Aquatics Center): "+1 Amenity to this city and every
    // city within 9 tiles" — a reach of its own, not the regional default.
    expect(BUILDINGS.AQUARIUM.regionalRange).toBe(9);
    expect(BUILDINGS.AQUATICS_CENTER.regionalRange).toBe(9);
    expect(BUILDINGS.FERRIS_WHEEL.amenities).toBe(2);
  });
});

describe('the Preserve', () => {
  it('cannot stand next to the City Center', () => {
    const { state, city, map } = board();
    const near = neighbors(map, map.tiles[city.centerIndex])[0];
    // CIV6 (Preserve): "Cannot be built next to the City Center."
    expect(place(state, city, 'PRESERVE', near).reason).toBe('Cannot be adjacent to the City Center.');
    expect(place(state, city, 'PRESERVE', tileAtCoords(map, 6, 8)).ok).toBe(true);
  });

  it('pays housing off the appeal of its own tile', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 6, 8);
    build(city, 'PRESERVE', t);
    const plain = appealBand(tileAppeal(map, t));
    const base = computeHousing(state, city);

    for (const n of neighbors(map, t)) n.feature = 'WOODS';
    const rich = appealBand(tileAppeal(map, t));
    expect(rich).toBeLessThan(plain); // band 0 is Breathtaking
    // CIV6 (Preserve): "Grants up to 3 Housing based on tile's Appeal."
    expect(computeHousing(state, city) - base)
      .toBe(PRESERVE_APPEAL_HOUSING[rich] - PRESERVE_APPEAL_HOUSING[plain]);
  });

  it('bombs the unowned tiles it touches and leaves a rival his', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 6, 8);
    const around = neighbors(map, t);
    const free = around[0];
    const theirs = around[1];
    setTileOwner(free, NO_SEAT);
    setTileOwner(theirs, 1);
    build(city, 'PRESERVE', t, false);
    completeQueueItem(state, city,
      { kind: 'district', district: 'PRESERVE', tileIndex: t.index, progress: 0 }, 54);
    // CIV6 (Preserve): "Initiate a Culture Bomb on adjacent unowned tiles."
    expect(tileSeat(free)).toBe(0);
    expect(tileSeat(theirs)).toBe(1);
  });

  it('lets its Grove pay the unimproved tiles around it, by appeal band', () => {
    const { state, city, map } = board();
    const t = tileAtCoords(map, 6, 8);
    build(city, 'PRESERVE', t);
    city.buildings.push('GROVE');
    for (const n of neighbors(map, t)) n.feature = 'WOODS';
    const one = neighbors(map, t)[0];
    const band = appealBand(tileAppeal(map, one));
    // CIV6 (Grove): "+1 Food and Faith to adjacent unimproved Charming tiles.
    // Yields increased to +2 Food, Faith and Culture for adjacent unimproved
    // Breathtaking tiles."
    expect(band).toBeLessThanOrEqual(1);
    const paid = preserveTileYields(state, 0);
    expect(paid.get(one.index)?.food).toBe(band === 0 ? 2 : 1);
    expect(paid.get(one.index)?.culture).toBe(band === 0 ? 2 : 0);

    one.improvement = 'FARM';
    expect(preserveTileYields(state, 0).get(one.index)).toBeUndefined();
  });
});

describe('the Government Plaza and the Diplomatic Quarter', () => {
  it('are one per civilization, not one per city', () => {
    const { state, city, map } = board();
    const second = settleAt(state, tileAtCoords(map, 14, 14).index);
    second.population = 12;
    expandBorders(state, second, 3);
    build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    // CIV6 (Government Plaza, Diplomatic Quarter): "Limit of one per
    // civilization."
    expect(place(state, second, 'GOVERNMENT_PLAZA', tileAtCoords(map, 13, 14)).reason)
      .toBe('Government Plaza already exists in this civilization.');
    expect(place(state, second, 'DIPLOMATIC_QUARTER', tileAtCoords(map, 13, 14)).ok).toBe(true);
  });

  it('pay 8 loyalty and a governor title, and both go dark when pillaged', () => {
    const { state, city, map } = board();
    const gp = build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    // CIV6 (Government Plaza): "+8 Loyalty to this city", "Awards +1 Governor
    // Title", and every building in it awards one more.
    expect(standingLoyalty(state, city)).toBe(8);
    expect(grantedGovernorTitles(state, 0)).toBe(1);
    city.buildings.push('ANCESTRAL_HALL');
    expect(grantedGovernorTitles(state, 0)).toBe(2);

    gp.districtPillaged = true;
    expect(standingLoyalty(state, city)).toBe(0);
    expect(grantedGovernorTitles(state, 0)).toBe(0);
  });

  it('gate their buildings on the tier of the government running', () => {
    const { state, city, map } = board();
    const seat = seatOf(state, 0)!;
    build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    // CIV6 (Ancestral Hall): a tier-1 government building — a Chiefdom is
    // tier 0 and reaches none of them.
    expect(buildingCompletable(state, city, 'ANCESTRAL_HALL')).toBe(false);
    seat.research.civics.push('POLITICAL_PHILOSOPHY');
    expect(buildingCompletable(state, city, 'ANCESTRAL_HALL')).toBe(true);

    city.buildings.push('ANCESTRAL_HALL');
    expect(buildingCompletable(state, city, 'FOREIGN_MINISTRY')).toBe(false);
    seat.research.civics.push('DIVINE_RIGHT');
    expect(buildingCompletable(state, city, 'FOREIGN_MINISTRY')).toBe(true);
  });

  it('pay the Audience Chamber loyalty to the cities with no governor', () => {
    const { state, city, map } = board();
    build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    city.buildings.push('AUDIENCE_CHAMBER');
    // CIV6 (Audience Chamber): "-2 Loyalty in Cities without Governors."
    expect(ungovernedLoyalty(state, 0)).toBe(-2);
  });

  it('hand the Diplomatic Quarter an envoy when it touches the centre', () => {
    const { state, city, map } = board();
    const seat = seatOf(state, 0)!;
    const before = seat.envoysAvailable ?? 0;
    const far = build(city, 'DIPLOMATIC_QUARTER', tileAtCoords(map, 6, 8), false);
    completeQueueItem(state, city,
      { kind: 'district', district: 'DIPLOMATIC_QUARTER', tileIndex: far.index, progress: 0 }, 30);
    expect(seat.envoysAvailable ?? 0).toBe(before);

    const near = build(city, 'DIPLOMATIC_QUARTER', neighbors(map, map.tiles[city.centerIndex])[0], false);
    completeQueueItem(state, city,
      { kind: 'district', district: 'DIPLOMATIC_QUARTER', tileIndex: near.index, progress: 0 }, 30);
    // CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City Center."
    expect(seat.envoysAvailable ?? 0).toBe(before + 1);
  });

  it('take two levels off an enemy spy, three with a Consulate', () => {
    const { state, city, map } = board();
    const dq = build(city, 'DIPLOMATIC_QUARTER', tileAtCoords(map, 6, 8));
    // CIV6 (Diplomatic Quarter): "Enemy Spies operate at 2 levels below normal
    // when targeting this district or adjacent districts", and (Consulate)
    // "Spies operate at one level lower when targeting this city."
    expect(cityCounterLevels(state, city)).toBe(2);
    city.buildings.push('CONSULATE');
    expect(cityCounterLevels(state, city)).toBe(3);
    dq.districtPillaged = true;
    expect(cityCounterLevels(state, city)).toBe(0);
  });

  it('let the Intelligence Agency raise the spy capacity', () => {
    const { state, city, map } = board();
    const before = spyCapacity(state, 0);
    build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    city.buildings.push('INTELLIGENCE_AGENCY');
    // CIV6 (Intelligence Agency): "+1 Spy and Spy capacity."
    expect(spyCapacity(state, 0)).toBe(before + 1);
    expect(seatBuildingSum(state, 0, 'spyCapacity')).toBe(1);
  });

  it('pay favor and influence to the SEAT, from the one city that built them', () => {
    const { state, city, map } = board();
    build(city, 'GOVERNMENT_PLAZA', tileAtCoords(map, 6, 8));
    build(city, 'DIPLOMATIC_QUARTER', tileAtCoords(map, 10, 8));
    city.buildings.push('FOREIGN_MINISTRY', 'CONSULATE');
    // CIV6 (Foreign Ministry): "+3 Diplomatic Favor per turn"; (Consulate)
    // "+2 Influence Points per turn."
    expect(seatBuildingSum(state, 0, 'favorPerTurn')).toBe(3);
    expect(seatBuildingSum(state, 0, 'influencePerTurn')).toBe(2);
  });
});

describe('the terms every new district feeds', () => {
  it('reads its appeal out of the catalog, in both directions', () => {
    const { city, map } = board();
    const t = tileAtCoords(map, 6, 8);
    const n = neighbors(map, t)[0];
    const base = tileAppeal(map, n);
    build(city, 'DAM', t);
    // CIV6 (Appeal): a Dam is +1 to its neighbours, an Industrial Zone -1, and
    // a Government Plaza neither.
    expect(tileAppeal(map, n) - base).toBe(1);
    t.district = 'INDUSTRIAL_ZONE';
    expect(tileAppeal(map, n) - base).toBe(-1);
    t.district = 'GOVERNMENT_PLAZA';
    expect(tileAppeal(map, n) - base).toBe(0);
  });

  it('lets the Hydroelectric Dam supply the city from its river', () => {
    const { state, city, map } = board();
    const t = build(city, 'DAM', tileAtCoords(map, 6, 8));
    city.buildings.push('HYDROELECTRIC_DAM');
    // CIV6 (Hydroelectric Dam): "Provides 6 Power to the city from renewable
    // water sources."
    expect(cityPower(state, city).supply).toBe(6);
    t.districtPillaged = true;
    expect(cityPower(state, city).supply).toBe(0);
  });
});
