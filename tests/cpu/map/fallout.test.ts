import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { NUCLEAR_DEVICES, FALLOUT_DAMAGE } from '../../../cpu/data/nuclear';
import { wmdHeld, addWmd, wmdUpkeep, irradiated } from '../../../cpu/core/nuclear';
import { PROJECTS } from '../../../cpu/data/projects';
import { availableProjects } from '../../../cpu/core/game';
import { availableBuildings, canPlaceDistrict } from '../../../cpu/core/rules';
import { completeProject } from '../../../cpu/core/production';
import { workableTiles } from '../../../cpu/core/city';
import { spawnUnit, refreshUnits, cleanFallout, canCleanFallout, trainableUnits } from '../../../cpu/core/units';
import { disasterPhase } from '../../../cpu/core/disasters';
import { seatOf } from '../../../cpu/core/seats';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';

// CIV6 (Nuclear weapons), Gathering Storm. Nothing here is gate-reachable —
// a device needs the Manhattan Project, which needs Nuclear Fission — so
// every clause is pinned directly.

function world() {
  const map = makeMap(12, 10);
  const state = makeState(map);
  state.unitsMode = true;
  settleAt(state, tileAtCoords(map, 5, 5).index, 0);
  return state;
}

describe('the seat arsenal', () => {
  it('the catalog carries both devices, radius/fallout/range/upkeep/uranium', () => {
    expect(NUCLEAR_DEVICES.map((d) => [d.radius, d.fallout, d.range, d.upkeep, d.uranium]))
      .toEqual([[1, 10, 12, 14, 10], [2, 20, 15, 16, 20]]);
    expect(FALLOUT_DAMAGE).toBe(50);
  });

  it('a device is built by a repeatable CITY CENTER project and joins the inventory', () => {
    const state = world();
    const city = seatOf(state, 0)!.cities[0];
    const seat = seatOf(state, 0)!;
    const dev = PROJECTS.BUILD_NUCLEAR_DEVICE;
    expect(dev.district).toBe('CITY_CENTER');
    expect(dev.wmd).toBe(1);
    // the gates, one at a time: tech, then the unlock project, then Uranium
    expect(availableProjects(state, city).some((p) => p.id === 'BUILD_NUCLEAR_DEVICE')).toBe(false);
    grantTechs(state, 'NUCLEAR_FISSION');
    expect(availableProjects(state, city).some((p) => p.id === 'MANHATTAN_PROJECT')).toBe(true);
    expect(availableProjects(state, city).some((p) => p.id === 'BUILD_NUCLEAR_DEVICE')).toBe(false);
    seat.projectsDone.push('MANHATTAN_PROJECT');
    expect(availableProjects(state, city).some((p) => p.id === 'BUILD_NUCLEAR_DEVICE')).toBe(false);
    seat.stockpile![STRATEGIC_IDS.indexOf('URANIUM')] = 10;
    expect(availableProjects(state, city).some((p) => p.id === 'BUILD_NUCLEAR_DEVICE')).toBe(true);
    // and it is REPEATABLE — the ledger never takes it
    completeProject(state, city, 'BUILD_NUCLEAR_DEVICE', dev.cost ?? 0);
    expect(wmdHeld(state, 0, 0)).toBe(1);
    expect(seat.projectsDone).not.toContain('BUILD_NUCLEAR_DEVICE');
    completeProject(state, city, 'BUILD_NUCLEAR_DEVICE', dev.cost ?? 0);
    expect(wmdHeld(state, 0, 0)).toBe(2);
  });

  it('the arsenal bills 14 and 16 Gold a turn', () => {
    const state = world();
    expect(wmdUpkeep(state, 0)).toBe(0);
    addWmd(state, 0, 0, 2);
    addWmd(state, 0, 1, 1);
    expect(wmdUpkeep(state, 0)).toBe(2 * 14 + 16);
  });
});

describe('radioactive fallout', () => {
  it('counts down a turn a turn, and the tile is unusable while it lasts', () => {
    const state = world();
    const city = seatOf(state, 0)!.cities[0];
    const t = workableTiles(state, city)[0];
    const before = workableTiles(state, city).length;
    t.falloutTurns = 3;
    expect(irradiated(t)).toBe(true);
    // CIV6: "cannot be worked by the city until the contamination timer
    // expires or until the tile is cleaned"
    expect(workableTiles(state, city).length).toBe(before - 1);
    // and no district may be placed on it
    grantTechs(state, 'WRITING');
    expect(canPlaceDistrict(state, city, 'CAMPUS', t.index).ok).toBe(false);
    disasterPhase(state);
    expect(t.falloutTurns).toBe(2);
  });

  it('takes 50 HP a turn off whoever stands in it, and leaves the robot alone', () => {
    const state = world();
    const here = tileAtCoords(state.map, 7, 5);
    const there = tileAtCoords(state.map, 8, 5);
    here.falloutTurns = 5;
    there.falloutTurns = 5;
    const man = spawnUnit(state, 'WARRIOR', here.index, 0)!;
    const bot = spawnUnit(state, 'GIANT_DEATH_ROBOT', there.index, 0)!;
    man.hp = 100;
    bot.hp = 100;
    refreshUnits(state);
    expect(bot.hp).toBe(100);
    expect(man.hp).toBe(50);
    // the tile heals what it can before the toll, so a wounded unit is what
    // the fallout actually finishes
    man.hp = 20;
    refreshUnits(state);
    // CIV6: the toll finishes it, and the unit is gone
    expect(state.units.some((u) => u.id === man.id)).toBe(false);
    expect(state.units.some((u) => u.id === bot.id)).toBe(true);
  });

  it('any chassis with a build charge may clean it, and it costs exactly one', () => {
    const state = world();
    const t = tileAtCoords(state.map, 7, 6);
    t.falloutTurns = 9;
    const b = spawnUnit(state, 'BUILDER', t.index, 0)!;
    const charges = b.charges ?? 0;
    expect(charges).toBeGreaterThan(1);
    expect(canCleanFallout(state, b)).toBe(true);
    expect(cleanFallout(state, b).ok).toBe(true);
    expect(t.falloutTurns).toBe(0);
    expect(b.charges).toBe(charges - 1);
    expect(b.movesLeft).toBe(0);
    expect(canCleanFallout(state, b)).toBe(false);
  });

  it('an irradiated centre raises no unit, and an irradiated district takes no building', () => {
    const state = world();
    const city = seatOf(state, 0)!.cities[0];
    const centre = state.map.tiles[city.centerIndex];
    expect(trainableUnits(state, 0, city).length).toBeGreaterThan(0);
    centre.falloutTurns = 4;
    expect(trainableUnits(state, 0, city)).toEqual([]);
    // the City Center's own buildings go with it — the district is the tile
    expect(availableBuildings(state, city).some((d) => d.district === 'CITY_CENTER')).toBe(false);
  });
});
