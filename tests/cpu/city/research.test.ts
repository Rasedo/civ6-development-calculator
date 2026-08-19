import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, grantCivics } from '../helpers';
import { foundCity, endTurn, setTechResearch, setCivicResearch, setGovernment, setPolicy, removeFeature, queueDistrict, queueBuilding } from '../../../cpu/core/game';
import { validImprovements } from '../../../cpu/core/rules';
import { computeCityStats } from '../../../cpu/core/city';
import { tileYields, effectiveAdjacency } from '../../../cpu/core/yields';
import { availableTechs, computeAdoption, computeUnlocks, makeYieldCtx } from '../../../cpu/core/effects';

describe('research progression', () => {
  it('starts with only no-prereq techs available', () => {
    const state = makeState();
    const ids = availableTechs(state, 0).map((t) => t.id).sort();
    expect(ids).toEqual(['ANIMAL_HUSBANDRY', 'ASTROLOGY', 'MINING', 'POTTERY', 'SAILING']);
  });

  it('rejects picking a tech whose prereqs are missing', () => {
    const state = makeState();
    expect(setTechResearch(state, 'WRITING', 0).ok).toBe(false);
    grantTechs(state, 'POTTERY');
    expect(setTechResearch(state, 'WRITING', 0).ok).toBe(true);
  });

  it('a picked tech completes over turns; nothing is picked FOR a seat', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    // research is a wire ORDER: turns alone start nothing, science banks
    for (let i = 0; i < 5; i++) endTurn(state);
    expect(seatOf(state, 0)!.research.tech).toBeNull();
    expect(seatOf(state, 0)!.research.techs.length).toBe(0);
    expect(setTechResearch(state, 'POTTERY', 0).ok).toBe(true);
    let guard = 0;
    while (seatOf(state, 0)!.research.techs.length === 0 && guard++ < 30) endTurn(state);
    expect(seatOf(state, 0)!.research.techs).toEqual(['POTTERY']);
    // completion picks no successor either
    expect(seatOf(state, 0)!.research.tech).toBeNull();
  });

  it('completing Code of Laws adopts Chiefdom with both slots filled', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    expect(setCivicResearch(state, 'CODE_OF_LAWS', 0).ok).toBe(true);
    let guard = 0;
    while (seatOf(state, 0)!.research.civics.length === 0 && guard++ < 40) endTurn(state);
    expect(seatOf(state, 0)!.research.civics).toContain('CODE_OF_LAWS');
    expect(seatOf(state, 0)!.research.civic).toBeNull();
    // the LIVE government is computeAdoption's, a pure function of civics
    const adopted = computeAdoption(seatOf(state, 0)!.research);
    expect(adopted.government).toBe('CHIEFDOM');
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
    expect(removeFeature(state, woods.index, 0).ok).toBe(false);
    grantTechs(state, 'MINING');
    expect(removeFeature(state, woods.index, 0).ok).toBe(true);
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
  function withGovernment(govId: string) {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    grantCivics(state, 'CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY', 'DIVINE_RIGHT');
    expect(setGovernment(state, govId, 0).ok).toBe(true);
    return { state, city };
  }

  it('governments unlock via civics', () => {
    const state = makeState();
    expect(setGovernment(state, 'MONARCHY', 0).ok).toBe(false);
    grantCivics(state, 'DIVINE_RIGHT');
    expect(setGovernment(state, 'MONARCHY', 0).ok).toBe(true);
  });

  it('policy cards respect slot kinds and uniqueness', () => {
    const { state } = withGovernment('CHIEFDOM'); // slots: [military, economic]
    grantCivics(state, 'MILITARY_TRADITION'); // Veterancy
    expect(setPolicy(state, 0, 'URBAN_PLANNING', 0).ok).toBe(false); // economic into military slot
    expect(setPolicy(state, 1, 'URBAN_PLANNING', 0).ok).toBe(true);
    expect(setPolicy(state, 0, 'VETERANCY', 0).ok).toBe(true);
    // can't slot the same card twice (autocracy has 2 military... use chiefdom's single pair)
    expect(setPolicy(state, 0, 'URBAN_PLANNING', 0).ok).toBe(false);
  });

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
    expect(queueDistrict(state, city.id, 'CAMPUS', spot.index, 0).ok).toBe(true);

    grantCivics(state, 'CODE_OF_LAWS'); // a government, but no NATURAL_PHILOSOPHY yet
    expect(effectiveAdjacency(makeYieldCtx(state, 0), spot, 'CAMPUS')).toBe(2);
    // MONARCHY's second wildcard reaches NATURAL_PHILOSOPHY in the greedy fill
    grantCivics(state, 'DIVINE_RIGHT', 'RECORDED_HISTORY');
    expect(effectiveAdjacency(makeYieldCtx(state, 0), spot, 'CAMPUS')).toBe(4);
    expect(computeCityStats(state, city).breakdown.districts.science).toBe(4);
  });

  it('Rationalism doubles campus building yields', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    state.sandbox = true;
    expect(queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0).ok).toBe(true);
    expect(queueBuilding(state, city.id, 'LIBRARY', 0).ok).toBe(true);
    // DEMOCRACY carries three economic slots — enough for the greedy fill to
    // reach RATIONALISM once The Enlightenment unlocks it
    grantCivics(state, 'CODE_OF_LAWS', 'SUFFRAGE');
    expect(computeCityStats(state, city).breakdown.buildings.science).toBe(4); // palace 2 + library 2
    grantCivics(state, 'ENLIGHTENMENT');
    expect(computeCityStats(state, city).breakdown.buildings.science).toBe(6); // library 2 -> 4
  });

  it('the tier tie-break adopts AUTOCRACY, first tier-1 in table order', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    grantCivics(state, 'CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    // all three tier-1 governments unlock together; adoption is deterministic
    expect(computeUnlocks(state, 0).governments.has('CLASSICAL_REPUBLIC')).toBe(true);
    expect(computeAdoption(seatOf(state, 0)!.research).government).toBe('AUTOCRACY');
    // AUTOCRACY's +1-all-yields capital bonus joins URBAN_PLANNING's +1
    expect(computeCityStats(state, city).breakdown.bonuses.production).toBe(2);
  });

  it('switching governments re-seats compatible policies', () => {
    const { state } = withGovernment('CHIEFDOM');
    expect(setPolicy(state, 1, 'URBAN_PLANNING', 0).ok).toBe(true);
    expect(setGovernment(state, 'MONARCHY', 0).ok).toBe(true); // [M,M,M,E,D,W]
    expect(seatOf(state, 0)!.government.policies.filter((p) => p === 'URBAN_PLANNING').length).toBe(1);
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
