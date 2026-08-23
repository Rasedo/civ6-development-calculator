import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, expandBorders } from '../helpers';
import {
  foundCity, purchaseBuilding, purchaseBuildingWithFaith, purchaseUnitWithFaith,
  faithBuyableClass, faithBuysLandUnits, wallsGoldBlocked, buildingFaithCost, unitFaithCost,
} from '../../../cpu/core/game';
import { CITY_STATE_SUZERAIN_BONUS, SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { UNITS } from '../../../cpu/data/units';
import type { CityState, GameState } from '../../../cpu/core/types';

// FAITH BUYS A CLASS. CIV6 (Valletta's suzerain): "City Center buildings and
// Encampment district buildings can be bought with Faith. Cost of purchasing
// Ancient, Medieval, and Renaissance Walls is reduced, but they can only be
// bought with Faith." (Theocracy): "Can buy land combat units with Faith."
// (Grand Master's Chapel): "Grants the ability to buy land military units with
// Faith." No scripted seed carries a minor past one envoy or reaches a tier-2
// government, so every rule below is poked.

function oneCity() {
  const state = makeState(makeMap(16, 16));
  foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
  const city = seatOf(state, 0)!.cities[0];
  expandBorders(state, city, 2);
  grantTechs(state, 'MASONRY');
  return { state, city };
}

/** Make seat 0 the strict suzerain of a Valletta-shaped minor. */
function suzerainOfValletta(state: GameState): void {
  const cs: CityState = {
    id: 0, name: 'Valletta', type: 'militaristic', centerIndex: tileAtCoords(state.map, 2, 2).index,
    envoys: { 0: SUZERAIN_ENVOYS }, hp: 150, pop: 3, questTurn: -1, quest: null,
  } as unknown as CityState;
  state.cityStates = [cs];
}

describe("Valletta's class purchase", () => {
  it('the class is the building\'s own district, and only under the suzerain', () => {
    const { state } = oneCity();
    expect(CITY_STATE_SUZERAIN_BONUS.Valletta.suz).toBe('faithBuildings');
    expect(faithBuyableClass(state, 0, 'MONUMENT')).toBe(false);
    suzerainOfValletta(state);
    expect(faithBuyableClass(state, 0, 'MONUMENT')).toBe(true);       // City Center
    expect(faithBuyableClass(state, 0, 'ANCIENT_WALLS')).toBe(true);  // City Center
    expect(faithBuyableClass(state, 0, 'BARRACKS')).toBe(true);       // Encampment
    expect(faithBuyableClass(state, 0, 'LIBRARY')).toBe(false);       // Campus
    expect(faithBuyableClass(state, 0, 'CATHEDRAL')).toBe(false);     // worship, its own rung
  });

  it('pays FAITH at the building rate and leaves the treasury alone', () => {
    const { state, city } = oneCity();
    suzerainOfValletta(state);
    const seat = seatOf(state, 0)!;
    seat.faith = 5000;
    seat.treasury = 5000;
    const cost = buildingFaithCost('MONUMENT');
    expect(cost).toBe(BUILDINGS.MONUMENT.cost * 2);
    expect(purchaseBuildingWithFaith(state, city.id, 'MONUMENT', 0).ok).toBe(true);
    expect(city.buildings).toContain('MONUMENT');
    expect(seat.faith).toBe(5000 - cost);
    expect(seat.treasury).toBe(5000);
  });

  it('refuses a building outside the class, and refuses without the faith', () => {
    const { state, city } = oneCity();
    suzerainOfValletta(state);
    const seat = seatOf(state, 0)!;
    seat.faith = 5000;
    expect(purchaseBuildingWithFaith(state, city.id, 'LIBRARY', 0).ok).toBe(false);
    seat.faith = 1;
    expect(purchaseBuildingWithFaith(state, city.id, 'MONUMENT', 0).ok).toBe(false);
  });

  it('the three walls "can only be bought with Faith" while the suzerain holds', () => {
    const { state, city } = oneCity();
    const seat = seatOf(state, 0)!;
    seat.treasury = 5000;
    seat.faith = 5000;
    expect(wallsGoldBlocked(state, 0, 'ANCIENT_WALLS')).toBe(false);
    expect(purchaseBuilding(state, city.id, 'ANCIENT_WALLS', 0).ok).toBe(true);

    const b = oneCity();
    suzerainOfValletta(b.state);
    const s2 = seatOf(b.state, 0)!;
    s2.treasury = 5000;
    s2.faith = 5000;
    expect(wallsGoldBlocked(b.state, 0, 'ANCIENT_WALLS')).toBe(true);
    expect(purchaseBuilding(b.state, b.city.id, 'ANCIENT_WALLS', 0).ok).toBe(false);
    expect(purchaseBuildingWithFaith(b.state, b.city.id, 'ANCIENT_WALLS', 0).ok).toBe(true);
    expect(b.city.buildings).toContain('ANCIENT_WALLS');
  });
});

describe('the land combat unit faith buys', () => {
  it("is granted by the Grand Master's Chapel and by no ordinary building", () => {
    const { state, city } = oneCity();
    expect(faithBuysLandUnits(state, 0)).toBe(false);
    city.buildings.push('MONUMENT');
    expect(faithBuysLandUnits(state, 0)).toBe(false);
    expect(BUILDINGS.GRAND_MASTERS_CHAPEL.faithBuyUnits).toBe(true);
    city.buildings.push('GRAND_MASTERS_CHAPEL');
    expect(faithBuysLandUnits(state, 0)).toBe(true);
  });

  it('spawns the unit for faith, and refuses a hull and a civilian', () => {
    const { state, city } = oneCity();
    state.unitsMode = true;
    grantTechs(state, 'BRONZE_WORKING');
    city.buildings.push('GRAND_MASTERS_CHAPEL');
    const seat = seatOf(state, 0)!;
    seat.faith = 5000;
    seat.treasury = 0;
    const n0 = state.units.length;
    const cost = unitFaithCost('WARRIOR');
    expect(cost).toBe(UNITS.WARRIOR.cost * 2);
    expect(purchaseUnitWithFaith(state, city.id, 'WARRIOR', 0).ok).toBe(true);
    expect(state.units.length).toBe(n0 + 1);
    expect(seat.faith).toBe(5000 - cost);
    expect(seat.treasury).toBe(0);
    expect(purchaseUnitWithFaith(state, city.id, 'BUILDER', 0).ok).toBe(false);
    expect(purchaseUnitWithFaith(state, city.id, 'GALLEY', 0).ok).toBe(false);
  });

  it('refuses the whole rung without a grant', () => {
    const { state, city } = oneCity();
    state.unitsMode = true;
    const seat = seatOf(state, 0)!;
    seat.faith = 5000;
    expect(purchaseUnitWithFaith(state, city.id, 'WARRIOR', 0).ok).toBe(false);
  });
});
