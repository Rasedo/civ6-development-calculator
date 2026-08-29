import { seatOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, emptySeat } from '../../../cpu/core/seats';
import { dedicationEvent } from '../../../cpu/core/eras';
import { DED_MONUMENTALITY, DED_EXODUS, DED_EVENT_SCORE } from '../../../cpu/data/seats';
import { makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { addEraScore, eraBoundary, agePressureFactor } from '../../../cpu/core/eras';
import { governorAt, governorPhase, governorsOf, governorTitlesAvailable, governorTitlesEarned, governorTitlesSpent } from '../../../cpu/core/governors';
import { GOVERNORS, GOVERNOR_PROMOTIONS, GOVERNOR_TITLE_CIVICS } from '../../../cpu/data/governors';
import { tilesWithin } from '../../../world/hex';
import { ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOVERNOR_LOYALTY, LOYALTY_MAX } from '../../../cpu/data/seats';
import type { GameState, City, Seat } from '../../../cpu/core/types';

// -- local builders (the geopolitics.test.ts / the other civs.test.ts pattern) --------
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
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
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
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
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
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

/** a research block holding exactly the first `n` title-granting civics. */
function titledResearch(n: number) {
  return {
    tech: null,
    techProgress: 0,
    civic: null,
    civicProgress: 0,
    techs: [] as string[],
    civics: GOVERNOR_TITLE_CIVICS.slice(0, n),
    boosted: [] as string[],
    techRetained: {},
    civicRetained: {},
  };
}

describe('governors / era score', () => {
  // ---- titles: earned per named civic, spent per appointment + promotion ------
  it('a title is earned by each named civic and spent on an appointment or a promotion', () => {
    const state = makeState();
    const civ = addCiv(state, 5, 5, { research: titledResearch(3) });
    expect(governorTitlesEarned(state, civ.seat)).toBe(3);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(3);

    const roster = governorsOf(civ);
    roster[0].appointed = true; // the appointment costs one, its default ability nothing
    expect(governorTitlesSpent(civ)).toBe(1);
    const promo = GOVERNOR_PROMOTIONS.findIndex((p) => p.governor === GOVERNORS[0].id && p.tier > 0);
    roster[0].promotions |= 1 << promo;
    expect(governorTitlesSpent(civ)).toBe(2);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(1);

    // an UNAPPOINTED governor's promotion bits are not a spend
    roster[1].promotions |= 1 << promo;
    expect(governorTitlesSpent(civ)).toBe(2);
  });

  // ---- the phase: appoint in catalog order, seat the lowest loyalty -----------
  it('governorPhase appoints in catalog order and seats the lowest-loyalty cities, ties by array position', () => {
    const state = makeState();
    const civ = addCiv(state, 5, 5, { research: titledResearch(2) });
    addCity(state, civ, 3, 5, 30);   // index 1 — the tie's WINNER (lower position)
    addCity(state, civ, 7, 5, 30);   // index 2 — the tie's loser
    addCity(state, civ, 10, 10, 20); // index 3 — outright lowest
    governorPhase(state, civ.seat);

    const roster = governorsOf(civ);
    expect(roster.filter((g) => g.appointed).length).toBe(2);
    expect(roster[0].cityId).toBe(civ.cities[3].id);
    expect(roster[1].cityId).toBe(civ.cities[1].id);
    expect(governorAt(state, civ.cities[2])).toBe(-1);
    expect(governorAt(state, civ.cities[0])).toBe(-1); // the capital pins at LOYALTY_MAX and ranks last
    // the establishment clock has already ticked one turn of its own phase
    expect(roster[0].establishTurns).toBe(GOVERNORS[0].establishTurns - 1);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(0);
  });

  it('governorPhase promotes once the whole roster is appointed', () => {
    const state = makeState();
    const civ = addCiv(state, 5, 5, { research: titledResearch(GOVERNORS.length + 1) });
    governorPhase(state, civ.seat);
    const roster = governorsOf(civ);
    expect(roster.every((g) => g.appointed)).toBe(true);
    expect(roster.reduce((n, g) => n + (g.promotions ? 1 : 0), 0)).toBe(1);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(0);
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

  // ---- addEraScore: accrues on the SEAT ----------------------------------------
  it('addEraScore accrues on the seat from 0; a missing seat takes nothing', () => {
    const state = makeState();
    addCiv(state, 5, 5);   // seat 1
    addCiv(state, 10, 10); // seat 2
    expect(seatOf(state, 2)?.eraScore).toBeUndefined();
    addEraScore(state, 2, 3);
    expect(seatOf(state, 2)?.eraScore).toBe(3);
    addEraScore(state, 2, 5);
    expect(seatOf(state, 2)?.eraScore).toBe(8); // 3 + 5
    addEraScore(state, 0, 2); // a different seat starts fresh from 0
    expect(seatOf(state, 0)?.eraScore).toBe(2);
    addEraScore(state, 7, 4); // no seat 7 — the write lands nowhere
    expect(seatOf(state, 7)?.eraScore).toBeUndefined();
  });

  // ---- agePressureFactor: defaults + values -----------------------------------
  it('agePressureFactor reads Normal when the age is absent, else the age factor', () => {
    const state = makeState();
    addCiv(state, 5, 5); // seat 1
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[1]); // no age set → Normal
    [0, 2].forEach((v, i) => { const s = seatOf(state, i); if (s) s.age = v; });
    expect(agePressureFactor(state, 0)).toBe(AGE_PRESSURE[0]); // Dark
    expect(agePressureFactor(state, 1)).toBe(AGE_PRESSURE[2]); // Golden
    expect(agePressureFactor(state, 5)).toBe(AGE_PRESSURE[1]); // absent seat → Normal
  });

  // ---- seatPhase-driven: the weakest city gets +GOVERNOR_LOYALTY -------------
  it('seatPhase seats a governor (+GOVERNOR_LOYALTY) on the weakest city when titles ≥ 1', () => {
    function scenario(nCivics: number): { weak: number; strong: number } {
      const state = makeState();
      const r0 = addCiv(state, 5, 5, { research: titledResearch(nCivics) });
      addCity(state, r0, 3, 5, 40); // weakest non-capital
      addCity(state, r0, 7, 5, 60); // stronger non-capital
      addCiv(state, 10, 10); // a second civ so r0's cities feel foreign pressure (loyalty runs)
      seatPhase(state);
      return { weak: r0.cities[1].loyalty!, strong: r0.cities[2].loyalty! };
    }
    const control = scenario(0); // titles 0
    const titled = scenario(1); // titles 1
    // the +8 lands on exactly the weakest city; the stronger one is unchanged
    expect(titled.weak - control.weak).toBeCloseTo(GOVERNOR_LOYALTY, 9);
    expect(titled.strong - control.strong).toBeCloseTo(0, 9);
  });
});

describe('named dedications', () => {
  // Real Civ 6: each civ commits to a NAMED dedication per era, and every
  // dedication has TWO faces — a DARK/NORMAL face paying ERA SCORE off a
  // specific EVENT, and a GOLDEN face paying a standing bonus instead.
  // MEASURED live: 199 payouts fire across the 24 scripted seeds
  // (123 Monumentality, 50 Exodus, 24 inspirations, 2 eurekas), and the Age
  // distribution is byte-identical to before, so no civ crossed a threshold.
  const base = () => {
    const st = makeState();
    addCiv(st, 5, 5); // seat 1
    for (const i of [0, 1]) seatOf(st, i)!.age = 1;
    seatOf(st, 0)!.dedicationPicks = [DED_MONUMENTALITY];
    seatOf(st, 1)!.dedicationPicks = [DED_EXODUS];
    return st;
  };

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
