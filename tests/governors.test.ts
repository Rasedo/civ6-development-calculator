import { describe, it, expect } from 'vitest';
import { dedicationEvent } from '../src/core/eras';
import { DED_MONUMENTALITY, DED_EXODUS, DED_EVENT_SCORE } from '../src/data/rivals';
import { makeState, tileAtCoords } from './helpers';
import { rivalPhase } from '../src/core/rivals';
import {
  addEraScore,
  eraBoundary,
  agePressureFactor,
  governorTitles,
  governorPicks,
} from '../src/core/eras';
import { tilesWithin } from '../src/core/hex';
import {
  ERA_LENGTH,
  ERA_DARK_T,
  ERA_GOLDEN_T,
  AGE_PRESSURE,
  GOV_CIVICS_PER_TITLE,
  GOV_MAX_TITLES,
  GOVERNOR_LOYALTY,
  LOYALTY_MAX,
} from '../src/data/rivals';
import type { GameState, RivalCity, RivalCiv } from '../src/core/types';

// -- local builders (the geopolitics.test.ts / rivals.test.ts pattern) --------
function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
    loyalty: LOYALTY_MAX,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id;
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (t.cityId === -1 && (t.csId ?? -1) === -1) {
      t.rivalId = rival.id;
      t.rivalCityId = city.id;
    }
  }
  rival.cities.push(city);
  state.rivals.push(rival);
  return rival;
}

function addCity(state: GameState, rival: RivalCiv, col: number, row: number, loyalty: number): RivalCity {
  const tile = tileAtCoords(state.map, col, row);
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Ostia',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
    loyalty,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id;
  rival.cities.push(city);
  return city;
}

describe('governors / era score (#68 B-24)', () => {
  // ---- governorTitles: floor division + cap -----------------------------------
  it('governorTitles floors civics / perTitle and caps at govMax', () => {
    expect(governorTitles(0)).toBe(0);
    expect(governorTitles(GOV_CIVICS_PER_TITLE - 1)).toBe(0); // floor
    expect(governorTitles(GOV_CIVICS_PER_TITLE)).toBe(1);
    expect(governorTitles(2 * GOV_CIVICS_PER_TITLE + GOV_CIVICS_PER_TITLE - 1)).toBe(2); // floor
    expect(governorTitles(GOV_MAX_TITLES * GOV_CIVICS_PER_TITLE)).toBe(GOV_MAX_TITLES);
    expect(governorTitles((GOV_MAX_TITLES + 3) * GOV_CIVICS_PER_TITLE)).toBe(GOV_MAX_TITLES); // cap
  });

  // ---- governorPicks: lowest loyalty, ties by index ---------------------------
  it('governorPicks seats the lowest-loyalty cities, ties broken by lower index', () => {
    expect([...governorPicks([50000, 30000, 70000], 1)]).toEqual([1]); // the 30 city
    expect([...governorPicks([50000, 30000, 70000], 2)].sort((a, b) => a - b)).toEqual([0, 1]);
    expect(governorPicks([50000, 30000, 70000], 0).size).toBe(0); // no titles → nobody
    // an exact tie resolves to the LOWER slot index (array/acquisition order)
    expect([...governorPicks([30000, 30000, 70000], 1)]).toEqual([0]);
    // titles beyond the city count just seats everyone
    expect(governorPicks([10000, 20000], 5).size).toBe(2);
  });

  // ---- eraBoundary: threshold ages + reset ------------------------------------
  it('eraBoundary assigns Dark/Normal/Golden at the exact thresholds then resets the window', () => {
    const state = makeState();
    addRival(state, 5, 5); // one rival → civs 0 (player) and 1
    state.turn = ERA_LENGTH; // a boundary turn
    state.eraScore = [ERA_DARK_T - 1, ERA_GOLDEN_T]; // player just-below-Dark, rival at Golden
    eraBoundary(state);
    expect(state.civAges).toEqual([0, 2]); // Dark, Golden
    expect(state.eraScore).toEqual([]); // window reset

    // the Normal band: darkT → Normal, goldenT-1 → Normal
    state.turn = 2 * ERA_LENGTH;
    state.eraScore = [ERA_DARK_T, ERA_GOLDEN_T - 1];
    eraBoundary(state);
    expect(state.civAges).toEqual([1, 1]);
  });

  it('eraBoundary is a no-op off a boundary turn', () => {
    const state = makeState();
    addRival(state, 5, 5);
    state.turn = ERA_LENGTH - 1;
    state.eraScore = [7, 7];
    eraBoundary(state);
    expect(state.civAges).toBeUndefined(); // no ages assigned
    expect(state.eraScore).toEqual([7, 7]); // window untouched
  });

  // ---- addEraScore: lazy accrual ----------------------------------------------
  it('addEraScore lazily accrues on unified civ ids (absent entries read 0)', () => {
    const state = makeState();
    expect(state.eraScore).toBeUndefined();
    addEraScore(state, 2, 3); // civ 2, no prior array
    expect(state.eraScore?.[2]).toBe(3);
    addEraScore(state, 2, 5);
    expect(state.eraScore?.[2]).toBe(8); // 3 + 5
    addEraScore(state, 0, 2); // a different civ starts fresh from 0
    expect(state.eraScore?.[0]).toBe(2);
  });

  // ---- agePressureFactor: defaults + values -----------------------------------
  it('agePressureFactor reads Normal when the age is absent, else the age factor', () => {
    const state = makeState();
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[1]); // no civAges → Normal
    state.civAges = [0, 2];
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[0]); // Dark
    expect(agePressureFactor(state, 1)).toBe(AGE_PRESSURE[2]); // Golden
    expect(agePressureFactor(state, 5)).toBe(AGE_PRESSURE[1]); // absent civ → Normal
  });

  // ---- rivalPhase-driven: the weakest city gets +GOVERNOR_LOYALTY -------------
  it('rivalPhase seats a governor (+GOVERNOR_LOYALTY) on the weakest city when titles ≥ 1', () => {
    function scenario(nCivics: number): { weak: number; strong: number } {
      const state = makeState();
      const r0 = addRival(state, 5, 5, {
        research: {
          tech: null,
          techProgress: 0,
          civic: null,
          civicProgress: 0,
          techs: [],
          civics: Array.from({ length: nCivics }, (_, i) => `CIVIC_${i}`),
          boosted: [],
        },
      });
      addCity(state, r0, 3, 5, 40); // weakest non-capital
      addCity(state, r0, 7, 5, 60); // stronger non-capital
      addRival(state, 10, 10); // a second rival so r0's cities feel foreign pressure (loyalty runs)
      rivalPhase(state);
      return { weak: r0.cities[1].loyalty!, strong: r0.cities[2].loyalty! };
    }
    const control = scenario(0); // titles 0
    const titled = scenario(GOV_CIVICS_PER_TITLE); // titles 1
    // the +8 lands on exactly the weakest city; the stronger one is unchanged
    expect(titled.weak - control.weak).toBeCloseTo(GOVERNOR_LOYALTY, 9);
    expect(titled.strong - control.strong).toBeCloseTo(0, 9);
  });
});

describe('B-24 named dedications (#77)', () => {
  // Real Civ 6: each civ commits to a NAMED dedication per era, and every
  // dedication has TWO faces — a DARK/NORMAL face paying ERA SCORE off a
  // specific EVENT, and a GOLDEN face paying a standing bonus instead. #71
  // modeled only a COUNT with a flat payout; #77 adds the catalog and the
  // event faces. MEASURED live: 199 payouts fire across the 24 scripted seeds
  // (123 Monumentality, 50 Exodus, 24 inspirations, 2 eurekas), and the Age
  // distribution is byte-identical to before, so no civ crossed a threshold.
  const base = () => ({
    civAges: [1, 1],
    dedicationPicks: [[DED_MONUMENTALITY], [DED_EXODUS]],
    eraScore: [0, 0],
    rivals: [{}],
  }) as unknown as GameState;

  it('pays the committed dedication on its own event only', () => {
    const st = base();
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(st.eraScore![0]).toBe(DED_EVENT_SCORE[DED_MONUMENTALITY]);
    dedicationEvent(st, 0, DED_EXODUS); // not committed by civ 0
    expect(st.eraScore![0]).toBe(DED_EVENT_SCORE[DED_MONUMENTALITY]);
  });

  it('EXODUS pays double, the sourced rate', () => {
    const st = base();
    dedicationEvent(st, 1, DED_EXODUS);
    expect(st.eraScore![1]).toBe(2);
    expect(DED_EVENT_SCORE[DED_EXODUS]).toBe(2);
  });

  it('a GOLDEN age takes bonuses, not era score', () => {
    const st = base();
    st.civAges = [2, 1];
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(st.eraScore![0] ?? 0).toBe(0);
  });

  it('a HEROIC age holding the same dedication twice pays twice', () => {
    const st = base();
    st.dedicationPicks = [[DED_MONUMENTALITY, DED_MONUMENTALITY, DED_EXODUS], [DED_EXODUS]];
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(st.eraScore![0]).toBe(2 * DED_EVENT_SCORE[DED_MONUMENTALITY]);
  });

  it('a civ with no commitments earns nothing', () => {
    const st = base();
    st.dedicationPicks = [];
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(st.eraScore![0] ?? 0).toBe(0);
  });
});
