import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, grantCivics, standBuilding, standDistrict } from '../helpers';
import { foundCity, endTurn } from '../../../cpu/core/game';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { canRemoveFeature, validImprovements } from '../../../cpu/core/rules';
import { TECHS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState } from '../../../cpu/core/types';
import { computeCityStats } from '../../../cpu/core/city';
import { tileYields, effectiveAdjacency } from '../../../cpu/core/yields';
import { availableTechs, computeAdoption, computeUnlocks, makeYieldCtx, seatGovernment } from '../../../cpu/core/effects';

/** the record's research pick, applied as the applier re-validates it */
function pick(state: GameState, kind: 'tech' | 'civic', id: string): void {
  const col = Object.keys(kind === 'tech' ? TECHS : CIVICS).indexOf(id);
  applySeatActionRecord(state, seatOf(state, 0)!, {
    production: [], units: [], tech: kind === 'tech' ? col : null, civic: kind === 'civic' ? col : null,
  });
}

describe('research progression', () => {
  it('starts with only no-prereq techs available', () => {
    const state = makeState();
    const ids = availableTechs(state, 0).map((t) => t.id).sort();
    expect(ids).toEqual(['ANIMAL_HUSBANDRY', 'ASTROLOGY', 'MINING', 'POTTERY', 'SAILING']);
  });

  it('rejects picking a tech whose prereqs are missing', () => {
    const state = makeState();
    pick(state, 'tech', 'WRITING');
    expect(seatOf(state, 0)!.research.tech).toBeNull();
    grantTechs(state, 'POTTERY');
    pick(state, 'tech', 'WRITING');
    expect(seatOf(state, 0)!.research.tech).toBe('WRITING');
  });

  it('a picked tech completes over turns; nothing is picked FOR a seat', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    // research is a wire ORDER: turns alone start nothing, science banks
    for (let i = 0; i < 5; i++) endTurn(state);
    expect(seatOf(state, 0)!.research.tech).toBeNull();
    expect(seatOf(state, 0)!.research.techs.length).toBe(0);
    pick(state, 'tech', 'POTTERY');
    expect(seatOf(state, 0)!.research.tech).toBe('POTTERY');
    let guard = 0;
    while (seatOf(state, 0)!.research.techs.length === 0 && guard++ < 30) endTurn(state);
    expect(seatOf(state, 0)!.research.techs).toEqual(['POTTERY']);
    // completion picks no successor either
    expect(seatOf(state, 0)!.research.tech).toBeNull();
  });

  it('completing Code of Laws adopts Chiefdom with both slots filled', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    pick(state, 'civic', 'CODE_OF_LAWS');
    expect(seatOf(state, 0)!.research.civic).toBe('CODE_OF_LAWS');
    let guard = 0;
    while (seatOf(state, 0)!.research.civics.length === 0 && guard++ < 40) endTurn(state);
    expect(seatOf(state, 0)!.research.civics).toContain('CODE_OF_LAWS');
    expect(seatOf(state, 0)!.research.civic).toBeNull();
    // no record chose one: the seat is in the newest its civics unlock, and
    // the greedy reference fills both of its slots
    expect(seatGovernment(state, 0)).toBe('CHIEFDOM');
    const adopted = computeAdoption(seatOf(state, 0)!.research);
    expect(adopted.policies.filter((p) => p !== null).length).toBe(2); // 1 military + 1 economic
  });
});

describe('tech gating and boosts', () => {
  it('gates improvements until researched', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const hills = tileAtCoords(state.map, 9, 8);
    hills.elevation = 'HILLS';
    expect(validImprovements(state, hills, 0)).toEqual([]); // mine needs Mining
    grantTechs(state, 'MINING');
    expect(validImprovements(state, hills, 0)).toEqual(['MINE']);
  });

  it('gates feature removal until researched', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const woods = tileAtCoords(state.map, 9, 8);
    woods.feature = 'WOODS';
    expect(canRemoveFeature(state, woods, 0).ok).toBe(false);
    grantTechs(state, 'MINING');
    expect(canRemoveFeature(state, woods, 0).ok).toBe(true);
  });

  it('hill farms need Civil Engineering', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const hills = tileAtCoords(state.map, 7, 8);
    hills.elevation = 'HILLS';
    expect(validImprovements(state, hills, 0)).toEqual([]);
    grantCivics(state, 'CIVIL_ENGINEERING');
    expect(validImprovements(state, hills, 0)).toContain('FARM');
  });

  it('Apprenticeship adds +1 production to mines', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const hills = tileAtCoords(state.map, 9, 8);
    hills.elevation = 'HILLS';
    hills.improvement = 'MINE';
    expect(tileYields(makeYieldCtx(state, 0), hills).production).toBe(2); // hills 1 + mine 1
    grantTechs(state, 'APPRENTICESHIP');
    expect(tileYields(makeYieldCtx(state, 0), hills).production).toBe(3);
  });

  it('Feudalism farm adjacency: +1 food with 2+ adjacent farms', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const a = tileAtCoords(state.map, 9, 8);
    const b = tileAtCoords(state.map, 9, 7); // NE of (9,8) on even row? both adjacent to a
    const c = tileAtCoords(state.map, 8, 7);
    for (const t of [a, b, c]) t.improvement = 'FARM';
    const before = tileYields(makeYieldCtx(state, 0), a).food; // grass 2 + farm 1
    expect(before).toBe(3);
    grantCivics(state, 'FEUDALISM');
    // b and c are both adjacent to a (and to each other)
    expect(tileYields(makeYieldCtx(state, 0), a).food).toBe(4);
  });

  it('sandbox ignores research gating', () => {
    const state = makeState(makeMap(16, 16));
    state.sandbox = true;
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const hills = tileAtCoords(state.map, 9, 8);
    hills.elevation = 'HILLS';
    expect(validImprovements(state, hills, 0)).toContain('MINE');
  });
});

describe('governments and policies', () => {
  it('Urban Planning adds +1 production through the adopted government', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const before = computeCityStats(state, city).breakdown.bonuses.production;
    grantCivics(state, 'CODE_OF_LAWS'); // CHIEFDOM's economic slot takes URBAN_PLANNING
    const after = computeCityStats(state, city).breakdown.bonuses.production;
    expect(after - before).toBe(1);
  });

  it('Natural Philosophy doubles campus adjacency', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    state.sandbox = true;
    const spot = tileAtCoords(state.map, 9, 8);
    tileAtCoords(state.map, 10, 8).elevation = 'MOUNTAIN';
    tileAtCoords(state.map, 9, 7).elevation = 'MOUNTAIN';
    standDistrict(state, city, 'CAMPUS', spot.index);

    grantCivics(state, 'CODE_OF_LAWS'); // a government, but no NATURAL_PHILOSOPHY yet
    expect(effectiveAdjacency(makeYieldCtx(state, 0), spot, 'CAMPUS')).toBe(2);
    // MONARCHY's second wildcard reaches NATURAL_PHILOSOPHY in the greedy fill
    grantCivics(state, 'DIVINE_RIGHT', 'RECORDED_HISTORY');
    expect(effectiveAdjacency(makeYieldCtx(state, 0), spot, 'CAMPUS')).toBe(4);
    expect(computeCityStats(state, city).breakdown.districts.science).toBe(4);
  });

  it('Rationalism pays nothing in a small city beside a weak Campus', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    state.sandbox = true;
    standDistrict(state, city, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    standBuilding(state, city, 'LIBRARY');
    // DEMOCRACY carries three economic slots — enough for the greedy fill to
    // reach RATIONALISM once The Enlightenment unlocks it
    grantCivics(state, 'CODE_OF_LAWS', 'SUFFRAGE');
    expect(computeCityStats(state, city).breakdown.buildings.science).toBe(4); // palace 2 + library 2
    grantCivics(state, 'ENLIGHTENMENT');
    expect(seatOf(state, 0)!.government.policies).toContain('RATIONALISM');
    // GS: +50% at population 15, +50% at +4 adjacency, and no flat half
    expect(computeCityStats(state, city).breakdown.buildings.science).toBe(4);
  });

  it('a seat no record has chosen for adopts AUTOCRACY, the first tier-1 in table order', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    grantCivics(state, 'CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    // all three tier-1 governments unlock together; the default is deterministic
    expect(computeUnlocks(state, 0).governments.has('CLASSICAL_REPUBLIC')).toBe(true);
    expect(seatGovernment(state, 0)).toBe('AUTOCRACY');
    // AUTOCRACY's +1-all-yields capital bonus joins URBAN_PLANNING's +1
    expect(computeCityStats(state, city).breakdown.bonuses.production).toBe(2);
  });

  it('unlocked governments and policies are reported by computeUnlocks', () => {
    const state = makeState();
    grantCivics(state, 'CODE_OF_LAWS');
    const u = computeUnlocks(state, 0);
    expect(u.governments.has('CHIEFDOM')).toBe(true);
    expect(u.policies.has('URBAN_PLANNING')).toBe(true);
    expect(u.policies.has('RATIONALISM')).toBe(false);
  });
});
