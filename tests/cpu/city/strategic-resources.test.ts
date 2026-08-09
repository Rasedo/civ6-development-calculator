import { describe, it, expect } from 'vitest';
import { UNITS } from '../../../cpu/data/units';
import { makeMap, makeState, tileAtCoords, grantTechs } from '../helpers';
import { foundCity, endTurn } from '../../../cpu/core/game';
import { trainableUnits, queueUnit } from '../../../cpu/core/units';
import { NO_SEAT, civHasStrategic, seatOf, seatOfIndex, setTileOwner, tileCity } from '../../../cpu/core/seats';

/** Units-mode game with the capital at (8,8), and a resource tile inside
 * borders that the caller can configure. Returns the state, city and the tile. */
function resState(resource: string, improvement: string | null, ...techs: string[]) {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  grantTechs(state, ...techs);
  const tile = tileAtCoords(state.map, 8, 9);
  setTileOwner(tile, city.seat, city.id); // owned by the seat-0 capital
  tile.resource = resource;
  tile.elevation = resource === 'IRON' ? 'HILLS' : 'FLAT';
  tile.improvement = improvement;
  return { state, city, tile };
}

const has = (state: ReturnType<typeof resState>['state'], r: string) =>
  civHasStrategic(state, 0, r);

describe('B-9 civHasStrategic access', () => {
  it('needs owned + resource + matching improvement + unpillaged', () => {
    const { state, tile } = resState('HORSES', 'PASTURE');
    expect(has(state, 'HORSES')).toBe(true);

    // wrong improvement → no access
    tile.improvement = 'FARM';
    expect(has(state, 'HORSES')).toBe(false);
    tile.improvement = 'PASTURE';
    expect(has(state, 'HORSES')).toBe(true);

    // pillaged → access lost
    tile.pillaged = true;
    expect(has(state, 'HORSES')).toBe(false);
    tile.pillaged = false;
    expect(has(state, 'HORSES')).toBe(true);

    // unimproved → no access
    tile.improvement = null;
    expect(has(state, 'HORSES')).toBe(false);
  });

  it('access is lost when the tile leaves seat-0 territory (capture/loss)', () => {
    const { state, tile } = resState('IRON', 'MINE');
    expect(has(state, 'IRON')).toBe(true);
    // ownership loss (capture / border loss): cityId cleared, civ takes it
    setTileOwner(tile, NO_SEAT);
    expect(has(state, 'IRON')).toBe(false);
    setTileOwner(tile, seatOfIndex(0), tileCity(tile)); // now owned by civ 0 (civ 1), not seat 0
    expect(civHasStrategic(state, 0, 'IRON')).toBe(false);
    expect(civHasStrategic(state, 1, 'IRON')).toBe(true); // the civ now has access
  });
});

describe('B-9 build/purchase gating', () => {
  const ids = (tiles: ReturnType<typeof trainableUnits>) => tiles.map((d) => d.id);

  it('HORSEMAN retro-gate: tech alone is not enough without HORSES access', () => {
    // HORSEBACK_RIDING but no improved horses tile → HORSEMAN unavailable
    const { state, city, tile } = resState('HORSES', null, 'HORSEBACK_RIDING');
    expect(ids(trainableUnits(state, 0, city))).not.toContain('HORSEMAN');
    expect(queueUnit(state, city.id, 'HORSEMAN', 0).ok).toBe(false);

    // improve the horses tile → HORSEMAN becomes available
    tile.improvement = 'PASTURE';
    expect(ids(trainableUnits(state, 0, city))).toContain('HORSEMAN');
    expect(queueUnit(state, city.id, 'HORSEMAN', 0).ok).toBe(true);
  });

  it('SWORDSMAN needs IRON access on top of IRON_WORKING', () => {
    const { state, city, tile } = resState('IRON', null, 'IRON_WORKING');
    expect(ids(trainableUnits(state, 0, city))).not.toContain('SWORDSMAN');
    tile.improvement = 'MINE';
    expect(ids(trainableUnits(state, 0, city))).toContain('SWORDSMAN');
  });

  it('resource-free new units gate on tech only (PIKEMAN/MUSKETMAN)', () => {
    const { state, city } = resState('IRON', 'MINE', 'MILITARY_TACTICS');
    const avail = ids(trainableUnits(state, 0, city));
    expect(avail).toContain('PIKEMAN'); // MILITARY_TACTICS, no resource
    expect(avail).not.toContain('MUSKETMAN'); // GUNPOWDER not researched
  });

  it('sandbox bypasses the resource gate', () => {
    const { state, city } = resState('HORSES', null, 'HORSEBACK_RIDING');
    state.sandbox = true;
    expect(ids(trainableUnits(state, 0, city))).toContain('HORSEMAN');
  });
});

describe('B-9/B-10 new-unit build path', () => {
  it('a gated SWORDSMAN builds and updates city-defense best-melee', () => {
    const { state, city } = resState('IRON', 'MINE', 'IRON_WORKING');
    expect(queueUnit(state, city.id, 'SWORDSMAN', 0).ok).toBe(true);
    // force the queue to completion and run a turn
    city.queue[0].progress = 10_000;
    const before = seatOf(state, 0)!.bestMeleeCS;
    endTurn(state, 0);
    const swords = state.units.filter((u) => u.type === 'SWORDSMAN' && (u.seat) === 0);
    expect(swords.length).toBe(1);
    // Strongest melee ever fielded now reflects the Swordsman (combat 36)
    expect(seatOf(state, 0)!.bestMeleeCS).toBeGreaterThanOrEqual(UNITS.SWORDSMAN.combat);
    expect(seatOf(state, 0)!.bestMeleeCS).toBeGreaterThan(before);
  });
});
