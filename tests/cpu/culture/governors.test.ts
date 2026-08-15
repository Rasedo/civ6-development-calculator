import { seatOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, emptySeat } from '../../../cpu/core/seats';
import { dedicationEvent } from '../../../cpu/core/eras';
import { DED_MONUMENTALITY, DED_EXODUS, DED_EVENT_SCORE } from '../../../cpu/data/seats';
import { makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { addEraScore, eraBoundary, agePressureFactor, governorTitles, governorPicks } from '../../../cpu/core/eras';
import { tilesWithin } from '../../../world/hex';
import { ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, GOVERNOR_LOYALTY, LOYALTY_MAX } from '../../../cpu/data/seats';
import type { GameState, City, Seat } from '../../../cpu/core/types';

// -- local builders (the geopolitics.test.ts / the other civs.test.ts pattern) --------
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    ww: {}, wwTurn: {},
    diplomaticFavor: 0,
    diplomaticPoints: 0,
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
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: City = {
    id: civ.nextCityId++,
    name: 'Roma',
    seat: civ.seat,
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
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

function addCity(state: GameState, civ: Seat, col: number, row: number, loyalty: number): City {
  const tile = tileAtCoords(state.map, col, row);
  const city: City = {
    id: civ.nextCityId++,
    name: 'Ostia',
    seat: civ.seat,
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
  setTileOwner(tile, civ.seat, city.id);
  civ.cities.push(city);
  return city;
}

describe('governors / era score', () => {
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
    addCiv(state, 5, 5); // one civ → civs 0 (seat 0) and 1
    state.turn = ERA_LENGTH; // a boundary turn
    [ERA_DARK_T - 1, ERA_GOLDEN_T].forEach((v, i) => { const sx = seatOf(state, i); if (sx) sx.eraScore = v; }); // seat 0 just-below-Dark, civ at Golden
    eraBoundary(state);
    expect([0, 1].map((i) => seatOf(state, i)?.age)).toEqual([0, 2]); // Dark, Golden
    expect([0, 1].map((i) => seatOf(state, i)?.eraScore ?? 0)).toEqual([0, 0]); // window reset

    // the Normal band: darkT → Normal, goldenT-1 → Normal
    state.turn = 2 * ERA_LENGTH;
    [ERA_DARK_T, ERA_GOLDEN_T - 1].forEach((v, i) => { const sx = seatOf(state, i); if (sx) sx.eraScore = v; });
    eraBoundary(state);
    expect([0, 1].map((i) => seatOf(state, i)?.age)).toEqual([1, 1]);
  });

  it('eraBoundary is a no-op off a boundary turn', () => {
    const state = makeState();
    addCiv(state, 5, 5);
    state.turn = ERA_LENGTH - 1;
    [7, 7].forEach((v, i) => { const sx = seatOf(state, i); if (sx) sx.eraScore = v; });
    eraBoundary(state);
    expect(seatOf(state, 0)?.age).toBeUndefined(); // no ages assigned
    expect([0, 1].map((i) => seatOf(state, i)?.eraScore)).toEqual([7, 7]); // window untouched
  });

  // ---- addEraScore: lazy accrual ----------------------------------------------
  it('addEraScore lazily accrues on unified civ ids (absent entries read 0)', () => {
    const state = makeState();
    expect(seatOf(state, 0)?.eraScore).toBeUndefined();
    addEraScore(state, 2, 3); // civ 2, no prior array
    expect(seatOf(state, 2)?.eraScore).toBe(3);
    addEraScore(state, 2, 5);
    expect(seatOf(state, 2)?.eraScore).toBe(8); // 3 + 5
    addEraScore(state, 0, 2); // a different civ starts fresh from 0
    expect(seatOf(state, 0)?.eraScore).toBe(2);
  });

  // ---- agePressureFactor: defaults + values -----------------------------------
  it('agePressureFactor reads Normal when the age is absent, else the age factor', () => {
    const state = makeState();
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[1]); // no civAges → Normal
    [0, 2].forEach((v, i) => { const s = seatOf(state, i); if (s) s.age = v; });
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[0]); // Dark
    expect(agePressureFactor(state, 1)).toBe(AGE_PRESSURE[2]); // Golden
    expect(agePressureFactor(state, 5)).toBe(AGE_PRESSURE[1]); // absent civ → Normal
  });

  // ---- seatPhase-driven: the weakest city gets +GOVERNOR_LOYALTY -------------
  it('seatPhase seats a governor (+GOVERNOR_LOYALTY) on the weakest city when titles ≥ 1', () => {
    function scenario(nCivics: number): { weak: number; strong: number } {
      const state = makeState();
      const r0 = addCiv(state, 5, 5, {
        research: {
          tech: null,
          techProgress: 0,
          civic: null,
          civicProgress: 0,
          techs: [],
          civics: Array.from({ length: nCivics }, (_, i) => `CIVIC_${i}`),
          boosted: [],
          techRetained: {},
          civicRetained: {},
        },
      });
      addCity(state, r0, 3, 5, 40); // weakest non-capital
      addCity(state, r0, 7, 5, 60); // stronger non-capital
      addCiv(state, 10, 10); // a second civ so r0's cities feel foreign pressure (loyalty runs)
      seatPhase(state);
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
    opponents: [{}],
  }) as unknown as GameState;

  it('pays the committed dedication on its own event only', () => {
    const st = base();
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(seatOf(st, 0)?.eraScore).toBe(DED_EVENT_SCORE[DED_MONUMENTALITY]);
    dedicationEvent(st, 0, DED_EXODUS); // not committed by civ 0
    expect(seatOf(st, 0)?.eraScore).toBe(DED_EVENT_SCORE[DED_MONUMENTALITY]);
  });

  it('EXODUS pays double, the sourced rate', () => {
    const st = base();
    dedicationEvent(st, 1, DED_EXODUS);
    expect(seatOf(st, 1)?.eraScore).toBe(2);
    expect(DED_EVENT_SCORE[DED_EXODUS]).toBe(2);
  });

  it('a GOLDEN age takes bonuses, not era score', () => {
    const st = base();
    [2, 1].forEach((v, i) => { const s = seatOf(st, i); if (s) s.age = v; });
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(seatOf(st, 0)?.eraScore ?? 0).toBe(0);
  });

  it('a HEROIC age holding the same dedication twice pays twice', () => {
    const st = base();
    seatOf(st, 0)!.dedicationPicks = [DED_MONUMENTALITY, DED_MONUMENTALITY, DED_EXODUS];
    seatOf(st, 1)!.dedicationPicks = [DED_EXODUS];
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(seatOf(st, 0)?.eraScore).toBe(2 * DED_EVENT_SCORE[DED_MONUMENTALITY]);
  });

  it('a civ with no commitments earns nothing', () => {
    const st = base();
    seatOf(st, 0)!.dedicationPicks = [];
    dedicationEvent(st, 0, DED_MONUMENTALITY);
    expect(seatOf(st, 0)?.eraScore ?? 0).toBe(0);
  });
});
