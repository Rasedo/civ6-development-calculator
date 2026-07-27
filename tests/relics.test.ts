import { describe, it, expect } from 'vitest';
import {
  placeRelic,
  relicFaith,
  relicTourism,
  RELIC_BUILDING,
  RELIC_SLOTS_PER_BUILDING,
  RELIC_FAITH,
  RELIC_TOURISM,
} from '../src/data/greatPeople';

// B-20 (#73) RELICS. Real Civ 6 counts a Relic as a Great Work held in a
// TEMPLE's single slot, paying +4 Faith and +8 Tourism — the densest tourism
// source in the game. Created when an Apostle carrying the MARTYR promotion is
// killed in theological combat; promotions are unmodeled and that routine is
// deliberately zero-draw, so EVERY apostle killed there martyrs (a recorded
// overstatement, see the RELIC_* comment in src/data/greatPeople.ts).
//
// MEASURED reachable: 26 relics are held at t250 across 4 of the 24 scripted
// seeds, which lifted the tourism ceiling from 7 visiting tourists to 12. The
// scripted gate therefore exercises the grant, and rFaith/rTourism are both
// compared trace columns — these pokes pin the PLACEMENT rules the gate can't
// isolate.

const city = (buildings: string[], relics?: number) => ({ buildings, relics });

describe('B-20 relics', () => {
  it('sourced constants: a TEMPLE holds ONE relic worth 4 faith and 8 tourism', () => {
    expect(RELIC_BUILDING).toBe('TEMPLE');
    expect(RELIC_SLOTS_PER_BUILDING).toBe(1);
    expect(RELIC_FAITH).toBe(4);
    expect(RELIC_TOURISM).toBe(8);
  });

  it('yields scale with the count', () => {
    expect(relicFaith({ relics: 3 })).toBe(12);
    expect(relicTourism({ relics: 3 })).toBe(24);
    expect(relicFaith({})).toBe(0);
    expect(relicTourism({})).toBe(0);
  });

  it('fills the LOWEST city with an open temple slot (array order)', () => {
    const cities = [city(['SHRINE']), city(['TEMPLE']), city(['TEMPLE'])];
    expect(placeRelic(cities)).toBe(true);
    expect(cities[0].relics).toBeUndefined(); // no temple — skipped
    expect(cities[1].relics).toBe(1); // lowest temple takes it
    expect(cities[2].relics).toBeUndefined();
  });

  it('a full slot is skipped for the next city', () => {
    const cities = [city(['TEMPLE'], 1), city(['TEMPLE'])];
    expect(placeRelic(cities)).toBe(true);
    expect(cities[0].relics).toBe(1); // already full, untouched
    expect(cities[1].relics).toBe(1);
  });

  it('a relic with no open slot anywhere is LOST', () => {
    const cities = [city(['TEMPLE'], 1), city(['SHRINE'])];
    expect(placeRelic(cities)).toBe(false);
    expect(cities[0].relics).toBe(1);
    expect(cities[1].relics).toBeUndefined();
  });

  it('an empty civ (no cities) simply loses the relic', () => {
    expect(placeRelic([])).toBe(false);
  });
});
