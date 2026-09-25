/**
 * A CITY-STATE'S STARTING ARMY. CIV6 (Eras.xml `BonusMinorStartingUnits`):
 * an Ancient-era start gives every minor two Warriors beside its city. They
 * walk from there (`walkUnit`) and heal, dig in and
 * defend like any unit; the minor's elimination takes them off the map.
 *
 * The GPU twin is tests/gpu/minor_record_test.py's army scenes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../../../cpu/world/load';
import { refreshUnits } from '../../../cpu/core/units';
import { captureCityState } from '../../../cpu/core/combat';
import { MINOR_STARTING_UNIT, MINOR_STARTING_UNITS } from '../../../cpu/data/cityStates';
import { neighbors } from '../../../world/hex';
import type { WorldFile } from '../../../world/file';
import type { GameState } from '../../../cpu/core/types';

const world = (): GameState =>
  loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9027.world.json', 'utf-8')) as WorldFile);

describe("a city-state's starting army", () => {
  it('spawns two Warriors per minor, on its centre and then its ring, after every civ unit', () => {
    const state = world();
    expect(MINOR_STARTING_UNIT).toBe('WARRIOR');
    expect(MINOR_STARTING_UNITS).toBe(2);
    expect(state.cityStates.length).toBeGreaterThan(0);
    const firstMinor = state.units.findIndex((u) => u.seat >= 100);
    expect(firstMinor).toBeGreaterThan(0);
    expect(state.units.slice(firstMinor).every((u) => u.seat >= 100)).toBe(true);
    for (const cs of state.cityStates) {
      const army = state.units.filter((u) => u.seat === cs.seat);
      expect(army.map((u) => u.type)).toEqual(['WARRIOR', 'WARRIOR']);
      expect(army[0].tileIndex).toBe(cs.centerIndex);
      const ring = neighbors(state.map, state.map.tiles[cs.centerIndex]).map((t) => t.index);
      expect(ring).toContain(army[1].tileIndex);
    }
  });

  it('heals as a unit in a city on its own centre', () => {
    const state = world();
    const cs = state.cityStates[0];
    const [onCentre, onRing] = state.units.filter((u) => u.seat === cs.seat);
    onCentre.hp = 50;
    onRing.hp = 50;
    refreshUnits(state);
    expect(onCentre.hp).toBe(70);
    expect(onRing.hp).toBe(65);
  });

  it('digs in where it stands', () => {
    const state = world();
    const cs = state.cityStates[0];
    refreshUnits(state);
    refreshUnits(state);
    for (const u of state.units.filter((x) => x.seat === cs.seat)) expect(u.fortifyTurns).toBe(2);
  });

  it("leaves the map with the minor's conquest", () => {
    const state = world();
    const cs = state.cityStates[0];
    const other = state.cityStates[1];
    captureCityState(state, cs, 0);
    expect(state.units.some((u) => u.seat === cs.seat)).toBe(false);
    expect(state.units.filter((u) => u.seat === other.seat).length).toBe(2);
  });
});
