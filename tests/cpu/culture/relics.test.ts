import { describe, it, expect } from 'vitest';
import { placeRelic, drainRelicReserve, relicFaith, relicTourism, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_FAITH, RELIC_TOURISM, RELIC_WONDER_SLOTS } from '../../../cpu/data/greatPeople';

// RELICS. Real Civ 6 counts a Relic as a Great Work held in a
// TEMPLE's single slot, paying +4 Faith and +8 Tourism — the densest tourism
// source in the game. Created when an Apostle carrying the MARTYR promotion is
// killed in theological combat; MARTYR is one of nine apostle promotions and
// `theologicalCombatPhase` reads the promotion bit at the death.
//
// rFaith/rTourism are both compared trace columns, so the gate exercises the
// grant — these pokes pin the PLACEMENT rules the gate cannot isolate.

const city = (buildings: string[], relics?: number) => ({ buildings, relics });

describe('relics', () => {
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

  it("sourced: St. Basil's holds 3 relics and Mont St. Michel 2", () => {
    expect(RELIC_WONDER_SLOTS.ST_BASILS_CATHEDRAL).toBe(3);
    expect(RELIC_WONDER_SLOTS.MONT_ST_MICHEL).toBe(2);
  });

  it('a wonder holds relics in a city with NO temple, and adds to one that has', () => {
    const extra = (c: { buildings: string[] }) => (c.buildings.includes('_SB') ? 3 : 0);
    const cities = [city(['_SB']), city(['TEMPLE'])];
    expect(placeRelic(cities, extra)).toBe(true);
    expect(cities[0].relics).toBe(1); // cathedral slot, no temple needed

    const both = [city(['TEMPLE', '_SB'], 1)];
    expect(placeRelic(both, extra)).toBe(true);
    expect(both[0].relics).toBe(2); // temple 1 + wonder 3 = capacity 4
  });

  it('a held relic goes out as soon as a slot opens, lowest city first', () => {
    // CIV6: a Relic with no open slot waits in reserve.
    const cities = [city(['SHRINE']), city(['SHRINE'])];
    expect(placeRelic(cities)).toBe(false); // nothing to hold it -> held
    let held = 3;
    expect(drainRelicReserve(held, cities)).toBe(3); // still no capacity
    cities[0].buildings.push('TEMPLE');
    cities[1].buildings.push('TEMPLE');
    held = drainRelicReserve(held, cities);
    expect(cities[0].relics).toBe(1);
    expect(cities[1].relics).toBe(1);
    expect(held).toBe(1); // two slots opened, one relic still waiting
  });

  it('the drain never places more than it holds', () => {
    const cities = [city(['TEMPLE']), city(['TEMPLE'])];
    expect(drainRelicReserve(1, cities)).toBe(0);
    expect(cities[0].relics).toBe(1);
    expect(cities[1].relics ?? 0).toBe(0); // the second slot stays open
  });

  it('the wonder capacity still runs out', () => {
    const extra = () => 2;
    const cities = [city(['TEMPLE'], 3)];
    expect(placeRelic(cities, extra)).toBe(false); // capacity 1 + 2 = 3, full
    expect(cities[0].relics).toBe(3);
  });
});
