import { describe, it, expect } from 'vitest';
import { UNITS } from '../src/data/units';
import { makeMap, makeState, tileAtCoords, grantTechs } from './helpers';
import { foundCity, endTurn } from '../src/core/game';
import { trainableUnits, queueUnit } from '../src/core/units';
import { civHasStrategic, PLAYER_CIV, isPlayerSeat, civOfRival, tileCity, NO_SEAT, setTileOwner, playerSeat } from '../src/core/seats';

/** Units-mode game with the capital at (8,8), and a resource tile inside
 * borders that the caller can configure. Returns the state, city and the tile. */
function resState(resource: string, improvement: string | null, ...techs: string[]) {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  grantTechs(state, ...techs);
  const tile = tileAtCoords(state.map, 8, 9);
  setTileOwner(tile, city.seat, city.id); // owned by the player capital
  tile.resource = resource;
  tile.elevation = resource === 'IRON' ? 'HILLS' : 'FLAT';
  tile.improvement = improvement;
  return { state, city, tile };
}

const has = (state: ReturnType<typeof resState>['state'], r: string) =>
  civHasStrategic(state, PLAYER_CIV, r);

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

  it('access is lost when the tile leaves player territory (capture/loss)', () => {
    const { state, tile } = resState('IRON', 'MINE');
    expect(has(state, 'IRON')).toBe(true);
    // ownership loss (capture / border loss): cityId cleared, rival takes it
    setTileOwner(tile, NO_SEAT);
    expect(has(state, 'IRON')).toBe(false);
    setTileOwner(tile, civOfRival(0), tileCity(tile)); // now owned by rival 0 (civ 1), not the player
    expect(civHasStrategic(state, PLAYER_CIV, 'IRON')).toBe(false);
    expect(civHasStrategic(state, 1, 'IRON')).toBe(true); // the rival now has access
  });
});

describe('B-9 build/purchase gating', () => {
  const ids = (tiles: ReturnType<typeof trainableUnits>) => tiles.map((d) => d.id);

  it('HORSEMAN retro-gate: tech alone is not enough without HORSES access', () => {
    // HORSEBACK_RIDING but no improved horses tile → HORSEMAN unavailable
    const { state, city, tile } = resState('HORSES', null, 'HORSEBACK_RIDING');
    expect(ids(trainableUnits(state, city))).not.toContain('HORSEMAN');
    expect(queueUnit(state, city.id, 'HORSEMAN').ok).toBe(false);

    // improve the horses tile → HORSEMAN becomes available
    tile.improvement = 'PASTURE';
    expect(ids(trainableUnits(state, city))).toContain('HORSEMAN');
    expect(queueUnit(state, city.id, 'HORSEMAN').ok).toBe(true);
  });

  it('SWORDSMAN needs IRON access on top of IRON_WORKING', () => {
    const { state, city, tile } = resState('IRON', null, 'IRON_WORKING');
    expect(ids(trainableUnits(state, city))).not.toContain('SWORDSMAN');
    tile.improvement = 'MINE';
    expect(ids(trainableUnits(state, city))).toContain('SWORDSMAN');
  });

  it('resource-free new units gate on tech only (PIKEMAN/MUSKETMAN)', () => {
    const { state, city } = resState('IRON', 'MINE', 'MILITARY_TACTICS');
    const avail = ids(trainableUnits(state, city));
    expect(avail).toContain('PIKEMAN'); // MILITARY_TACTICS, no resource
    expect(avail).not.toContain('MUSKETMAN'); // GUNPOWDER not researched
  });

  it('sandbox bypasses the resource gate', () => {
    const { state, city } = resState('HORSES', null, 'HORSEBACK_RIDING');
    state.sandbox = true;
    expect(ids(trainableUnits(state, city))).toContain('HORSEMAN');
  });
});

describe('B-9/B-10 new-unit build path', () => {
  it('a gated SWORDSMAN builds and updates city-defense best-melee', () => {
    const { state, city } = resState('IRON', 'MINE', 'IRON_WORKING');
    expect(queueUnit(state, city.id, 'SWORDSMAN').ok).toBe(true);
    // force the queue to completion and run a turn
    city.queue[0].progress = 10_000;
    const before = playerSeat(state).bestMeleeCS;
    endTurn(state);
    const swords = state.units.filter((u) => u.type === 'SWORDSMAN' && isPlayerSeat(u.seat));
    expect(swords.length).toBe(1);
    // P4/D-22: strongest melee ever fielded now reflects the Swordsman (combat 36)
    expect(playerSeat(state).bestMeleeCS).toBeGreaterThanOrEqual(UNITS.SWORDSMAN.combat);
    expect(playerSeat(state).bestMeleeCS).toBeGreaterThan(before);
  });
});
