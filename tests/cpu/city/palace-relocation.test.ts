import { describe, it, expect } from 'vitest';
import { relocatePalace } from '../../../cpu/core/phase';

// PALACE RELOCATION. Real Civ 6 does not leave a civ
// capital-less when its capital falls: the Palace is rebuilt in the surviving
// city with the HIGHEST POPULATION (ties -> acquisition order). The GPU twins
// live at the three loser-side capture/transfer sites; these pin the algorithm
// itself, which both engines share.
//
// The invariant these MUST protect: `state.capitalTiles` is the STATIC
// domination record and never moves. Real Civ 6 agrees — the ORIGINAL
// capital stays the domination target while the relocated Palace carries the
// capital BONUSES, which is why recapturing yields an "Original Capital" and a
// "New Capital". Only the building and the isCapital FLAG relocate.

type TestCity = { isCapital: boolean; population: number; buildings: string[]; name?: string };

const city = (name: string, population: number, isCapital = false, buildings: string[] = []): TestCity => ({
  name, population, isCapital, buildings: [...buildings],
});

describe('relocatePalace', () => {
  it('crowns the highest-population survivor and grants it the Palace', () => {
    const cities = [city('small', 3), city('biggest', 9), city('mid', 6)];
    relocatePalace(cities);
    expect(cities[1].isCapital).toBe(true);
    expect(cities[1].buildings).toContain('PALACE');
    // exactly one capital, and the others are untouched
    expect(cities.filter((c) => c.isCapital)).toHaveLength(1);
    expect(cities[0].buildings).not.toContain('PALACE');
    expect(cities[2].buildings).not.toContain('PALACE');
  });

  it('is a NO-OP while a capital is still held (a non-capital city was lost)', () => {
    const cities = [city('cap', 4, true, ['PALACE']), city('bigger', 12)];
    relocatePalace(cities);
    expect(cities[0].isCapital).toBe(true); // the smaller city keeps the crown
    expect(cities[1].isCapital).toBe(false); // population does NOT re-seat a capital that still stands
    expect(cities[1].buildings).not.toContain('PALACE');
  });

  it('breaks population ties by ACQUISITION ORDER (array order, strict >)', () => {
    const cities = [city('older', 7), city('newer', 7)];
    relocatePalace(cities);
    expect(cities[0].isCapital).toBe(true);
    expect(cities[1].isCapital).toBe(false);
  });

  it('is a clean no-op for an ELIMINATED civ (no cities left)', () => {
    const cities: TestCity[] = [];
    expect(() => relocatePalace(cities)).not.toThrow();
    expect(cities).toHaveLength(0);
  });

  it('does not duplicate a PALACE the chosen city somehow already has', () => {
    const cities = [city('has-palace-not-capital', 8, false, ['PALACE', 'MONUMENT'])];
    relocatePalace(cities);
    expect(cities[0].isCapital).toBe(true);
    expect(cities[0].buildings.filter((b) => b === 'PALACE')).toHaveLength(1);
    expect(cities[0].buildings).toContain('MONUMENT'); // existing buildings survive
  });

  it('relocates to a single survivor even at population 1', () => {
    const cities = [city('last one', 1)];
    relocatePalace(cities);
    expect(cities[0].isCapital).toBe(true);
    expect(cities[0].buildings).toContain('PALACE');
  });
});
