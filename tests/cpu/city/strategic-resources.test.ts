import { describe, it, expect } from 'vitest';
import { UNITS } from '../../../cpu/data/units';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { trainableUnits, queueUnit, refreshUnits, spawnUnit } from '../../../cpu/core/units';
import { BARB_SEAT, NO_SEAT, civHasStrategic, seatOf, setTileOwner, tileCity } from '../../../cpu/core/seats';
import { accrueStockpiles, stockpileCap, unitResourceCost } from '../../../cpu/core/stockpile';
import { STRATEGIC_IDS, STRATEGIC_PER_TURN, STOCKPILE_CAP_BASE, STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING } from '../../../cpu/data/constants';

/** Units-mode game with the capital at (8,8), and a resource tile inside
 * borders that the caller can configure. Returns the state, city and the tile. */
function resState(resource: string, improvement: string | null, ...techs: string[]) {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index); // spawns the settler founding consumes
  grantTechs(state, ...techs);
  const tile = tileAtCoords(state.map, 8, 9);
  setTileOwner(tile, city.seat, city.id); // owned by the seat-0 capital
  tile.resource = resource;
  tile.elevation = resource === 'IRON' ? 'HILLS' : 'FLAT';
  tile.improvement = improvement;
  // ACCESS is what these cases are about; the STOCKPILE has its own block
  // below, so every seat here starts able to pay.
  seatOf(state, 0)!.stockpile = STRATEGIC_IDS.map(() => 99);
  return { state, city, tile };
}

const has = (state: ReturnType<typeof resState>['state'], r: string) =>
  civHasStrategic(state, 0, r);

const ids = (us: ReturnType<typeof trainableUnits>) => us.map((d) => d.id);

describe('civHasStrategic access', () => {
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
    setTileOwner(tile, 1, tileCity(tile)); // now owned by civ 0 (civ 1), not seat 0
    expect(civHasStrategic(state, 0, 'IRON')).toBe(false);
    expect(civHasStrategic(state, 1, 'IRON')).toBe(true); // the civ now has access
  });
});

describe('build/purchase gating', () => {

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

  it('a resource-free unit gates on tech alone (PIKEMAN)', () => {
    const { state, city } = resState('IRON', 'MINE', 'MILITARY_TACTICS');
    const avail = ids(trainableUnits(state, 0, city));
    expect(avail).toContain('PIKEMAN'); // MILITARY_TACTICS, no resource
    expect(avail).not.toContain('MUSKETMAN'); // GUNPOWDER not researched
  });

  it('the five resource units are exactly the ones real Civ 6 gates', () => {
    // CIV6 (GS, each unit's own page): Horseman 20 Horses, Swordsman 20 Iron,
    // Knight 20 Iron, Musketman 20 Niter, Bombard 20 Niter — and nothing else
    // in this roster asks for a resource.
    const gated = Object.values(UNITS).filter((u) => u.requiresResource).map((u) => u.id).sort();
    expect(gated).toEqual(['BOMBARD', 'HORSEMAN', 'KNIGHT', 'MUSKETMAN', 'SWORDSMAN']);
    for (const u of gated) expect(unitResourceCost(u)!.n).toBe(20);
  });

  it('sandbox bypasses the resource gate', () => {
    const { state, city } = resState('HORSES', null, 'HORSEBACK_RIDING');
    state.sandbox = true;
    expect(ids(trainableUnits(state, 0, city))).toContain('HORSEMAN');
  });
});

describe('stockpiles', () => {
  it('an improved source pays its published number every turn, up to the cap', () => {
    const { state, tile } = resState('IRON', 'MINE', 'IRON_WORKING');
    const seat = seatOf(state, 0)!;
    const k = STRATEGIC_IDS.indexOf('IRON');
    const bank = (seat.stockpile = STRATEGIC_IDS.map(() => 0));
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(STRATEGIC_PER_TURN.IRON);
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(2 * STRATEGIC_PER_TURN.IRON);
    // a pillaged or unimproved source pays nothing
    tile.pillaged = true;
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(2 * STRATEGIC_PER_TURN.IRON);
    tile.pillaged = false;
    tile.improvement = 'FARM';
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(2 * STRATEGIC_PER_TURN.IRON);
    // ...and the bank stops at the ceiling
    tile.improvement = 'MINE';
    seat.stockpile[k] = STOCKPILE_CAP_BASE;
    accrueStockpiles(state, 0);
    expect(seat.stockpile[k]).toBe(STOCKPILE_CAP_BASE);
  });

  it('every Encampment building raises the ceiling for all resources', () => {
    const { state, city } = resState('IRON', 'MINE', 'IRON_WORKING');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE);
    city.buildings.push('BARRACKS');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE + STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING);
    city.buildings.push('ARMORY');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE + 2 * STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING);
    // a LIBRARY is not an Encampment building
    city.buildings.push('LIBRARY');
    expect(stockpileCap(state, 0)).toBe(STOCKPILE_CAP_BASE + 2 * STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING);
  });

  it('a unit charges its 20 when it enters production, and is refused without it', () => {
    const { state, city } = resState('IRON', 'MINE', 'IRON_WORKING');
    const bank = seatOf(state, 0)!.stockpile!;
    const k = STRATEGIC_IDS.indexOf('IRON');
    bank[k] = 19;
    expect(ids(trainableUnits(state, 0, city))).not.toContain('SWORDSMAN');
    expect(queueUnit(state, city.id, 'SWORDSMAN', 0).ok).toBe(false);
    bank[k] = 20;
    expect(ids(trainableUnits(state, 0, city))).toContain('SWORDSMAN');
    expect(queueUnit(state, city.id, 'SWORDSMAN', 0).ok).toBe(true);
    expect(bank[k]).toBe(0);
    // and the next one cannot start until the mines have paid again
    city.queue.length = 0;
    expect(ids(trainableUnits(state, 0, city))).not.toContain('SWORDSMAN');
  });

  it('access without a stockpile is not enough, and a stockpile without access is not either', () => {
    const { state, city, tile } = resState('IRON', 'MINE', 'IRON_WORKING');
    const bank = seatOf(state, 0)!.stockpile!;
    expect(ids(trainableUnits(state, 0, city))).toContain('SWORDSMAN');
    tile.improvement = null; // the mine goes, the bank stays
    expect(bank[STRATEGIC_IDS.indexOf('IRON')]).toBe(99);
    expect(ids(trainableUnits(state, 0, city))).not.toContain('SWORDSMAN');
  });
});

describe('the heal a lost source denies', () => {
  // CIV6 (Resource, GS): "if you had acquired Iron to produce Swordsmen, but
  // have no continuous access to Iron Mines, those Swordsmen won't be able to
  // Heal."
  const hurt = (resource: string, improvement: string | null, type: string) => {
    const r = resState(resource, improvement, 'IRON_WORKING', 'HORSEBACK_RIDING');
    const u = spawnUnit(r.state, type, tileAtCoords(r.state.map, 8, 8).index, 0)!;
    u.hp = 40;
    return { ...r, unit: u };
  };

  it('a unit whose source is gone does not heal, and heals again when it returns', () => {
    const { state, tile, unit } = hurt('IRON', 'MINE', 'SWORDSMAN');
    refreshUnits(state);
    expect(unit.hp).toBeGreaterThan(40);
    unit.hp = 40;
    tile.pillaged = true;
    refreshUnits(state);
    expect(unit.hp).toBe(40);
    tile.pillaged = false;
    setTileOwner(tile, NO_SEAT);
    refreshUnits(state);
    expect(unit.hp).toBe(40);
    setTileOwner(tile, 0, tileCity(tile));
    refreshUnits(state);
    expect(unit.hp).toBeGreaterThan(40);
  });

  it('a type that asks for no resource heals with no source at all', () => {
    const { state, tile, unit } = hurt('IRON', null, 'WARRIOR');
    expect(civHasStrategic(state, 0, 'IRON')).toBe(false);
    expect(tile.improvement).toBe(null);
    refreshUnits(state);
    expect(unit.hp).toBeGreaterThan(40);
  });

  it('the BARBARIANS keep no bank and are not held to it', () => {
    const { state } = resState('HORSES', null, 'HORSEBACK_RIDING');
    const t = tileAtCoords(state.map, 2, 2);
    const u = spawnUnit(state, 'HORSEMAN', t.index, BARB_SEAT)!;
    u.hp = 40;
    expect(civHasStrategic(state, BARB_SEAT, 'HORSES')).toBe(false);
    refreshUnits(state);
    expect(u.hp).toBeGreaterThan(40);
  });
});

describe('new-unit build path', () => {
  it('a gated SWORDSMAN builds and updates city-defense best-melee', () => {
    const { state, city } = resState('IRON', 'MINE', 'IRON_WORKING');
    expect(queueUnit(state, city.id, 'SWORDSMAN', 0).ok).toBe(true);
    // force the queue to completion and run a turn
    city.queue[0].progress = 10_000;
    const before = seatOf(state, 0)!.bestMeleeCS;
    endTurn(state);
    const swords = state.units.filter((u) => u.type === 'SWORDSMAN' && (u.seat) === 0);
    expect(swords.length).toBe(1);
    // Strongest melee ever fielded now reflects the Swordsman (combat 36)
    expect(seatOf(state, 0)!.bestMeleeCS).toBeGreaterThanOrEqual(UNITS.SWORDSMAN.combat);
    expect(seatOf(state, 0)!.bestMeleeCS).toBeGreaterThan(before);
  });
});
