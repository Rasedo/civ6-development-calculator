import { seatOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, emptySeat, FREE_SEAT } from '../../../cpu/core/seats';
import { dedicationEvent } from '../../../cpu/core/eras';
import { DED_MONUMENTALITY, DED_EXODUS, DED_EVENT_SCORE } from '../../../cpu/data/seats';
import { makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { addEraScore, enterEra, agePressure } from '../../../cpu/core/eras';
import { governorAt, governorPhase, governorsOf, governorTitlesAvailable, governorTitlesEarned, governorTitlesSpent, hasPromotion } from '../../../cpu/core/governors';
import { GOVERNORS, GOVERNOR_PROMOTIONS, GOVERNOR_PROMOTION_INDEX, GOVERNOR_TITLE_CIVICS, GOV_APPOINT, GOV_ASSIGN_CITY, GOV_PROMOTE, promotionBit, promotionBitValue } from '../../../cpu/data/governors';
import { tilesWithin } from '../../../world/hex';
import { AGE_PRESSURE, GOVERNOR_LOYALTY, LOYALTY_MAX } from '../../../cpu/data/seats';
import type { GameState, City, Governor, Seat } from '../../../cpu/core/types';

// -- local builders (the geopolitics.test.ts / the other civs.test.ts pattern) --------
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
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
    government: { chosen: null, policies: [], held: 0, civicTurn: 0, anarchyEnd: 0, lapsed: [] },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    projectsDone: [],
    religion: { pantheon: null, founded: false, type: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
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

  // ---- the phase: the record's verbs, each re-validated ------------------------
  it('governorPhase applies the record\'s appointments and seats in order, refusing what its verb refuses', () => {
    const state = makeState();
    const civ = addCiv(state, 5, 5, { research: titledResearch(2) });
    const a = addCity(state, civ, 3, 5, 30);
    const b = addCity(state, civ, 7, 5, 30);
    governorPhase(state, civ.seat, [
      [GOV_APPOINT, 0, 0], [GOV_ASSIGN_CITY, 0, a.centerIndex],
      [GOV_APPOINT, 1, 0], [GOV_ASSIGN_CITY, 1, a.centerIndex], // the city holds one governor
      [GOV_APPOINT, 2, 0],                                          // no title left
      [GOV_ASSIGN_CITY, 1, b.centerIndex],
    ]);
    const roster = governorsOf(civ);
    expect(roster.filter((g) => g.appointed).length).toBe(2);
    expect(roster[0].cityId).toBe(a.id);
    expect(roster[1].cityId).toBe(b.id);
    expect(governorAt(state, a)).toBe(0);
    // the establishment clock starts full: the phase's clocks run before the verbs
    expect(roster[0].establishTurns).toBe(GOVERNORS[0].establishTurns);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(0);
  });

  it('governorPhase promotes with a title, a promotion of the governor\'s own and its prerequisite held', () => {
    const state = makeState();
    const civ = addCiv(state, 5, 5, { research: titledResearch(3) });
    const own = GOVERNOR_PROMOTIONS.findIndex((p) => p.governor === GOVERNORS[0].id && p.tier === 1);
    const other = GOVERNOR_PROMOTIONS.findIndex((p) => p.governor === GOVERNORS[1].id && p.tier === 1);
    governorPhase(state, civ.seat, [[GOV_APPOINT, 0, 0], [GOV_PROMOTE, 0, other], [GOV_PROMOTE, 0, own]]);
    const roster = governorsOf(civ);
    expect(roster[0].promotions).toBe(1 << own);
    expect(governorTitlesAvailable(state, civ.seat)).toBe(1);
    // with no verb the phase runs the clocks alone
    governorPhase(state, civ.seat, []);
    expect(roster.filter((g) => g.appointed).length).toBe(1);
  });

  // ---- enterEra: the ages at the bars, the next bars ---------------------------
  it('enterEra judges each seat by the bars the era before fixed, then fixes the next', () => {
    const state = makeState();
    addCiv(state, 5, 5); // one civ → civs 0 (seat 0) and 1
    const bars = (i: number) => [seatOf(state, i)!.darkBar!, seatOf(state, i)!.goldenBar!];
    // seat 0 just below its Dark bar, seat 1 at its Golden bar
    seatOf(state, 0)!.eraScore = bars(0)[0] - 1;
    seatOf(state, 1)!.eraScore = bars(1)[1];
    enterEra(state);
    expect([0, 1].map((i) => seatOf(state, i)?.age)).toEqual([0, 2]); // Dark, Golden
    expect([0, 1].map((i) => seatOf(state, i)?.eraScore)).toEqual([7, 19]); // the score is the game's
    expect(seatOf(state, 0)?.darkAges).toBe(1);
    expect(seatOf(state, 1)?.goldenAges).toBe(1);
    // the next bars: the score + 11 / 22, one city past the first for seat 1's
    // two... none here (one city each), -5 for the Dark age, +5 for the Golden
    expect(bars(0)).toEqual([7 + 11 - 5, 7 + 22 - 5]);
    expect(bars(1)).toEqual([19 + 11 + 5, 19 + 22 + 5]);

    // the Normal band: at the Dark bar, one short of the Golden bar
    seatOf(state, 0)!.eraScore = bars(0)[0];
    seatOf(state, 1)!.eraScore = bars(1)[1] - 1;
    enterEra(state);
    expect([0, 1].map((i) => seatOf(state, i)?.age)).toEqual([1, 1]);
    expect(state.gameEra).toBe(2);
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

  // ---- agePressure: defaults + values ------------------------------------------
  it('agePressure reads Normal when the age is absent, else the per-citizen age term', () => {
    // CIV6 (the Loyalty pedia): "Golden and Heroic Ages add 0.5 for all
    // Citizens, while Dark Ages subtract 0.5"
    expect([...AGE_PRESSURE]).toEqual([-0.5, 0, 0.5]);
    const state = makeState();
    addCiv(state, 5, 5); // seat 1
    expect(agePressure(state, 0)).toBe(AGE_PRESSURE[1]); // no age set → Normal
    [0, 2].forEach((v, i) => { const s = seatOf(state, i); if (s) s.age = v; });
    expect(agePressure(state, 0)).toBe(AGE_PRESSURE[0]); // Dark
    expect(agePressure(state, 1)).toBe(AGE_PRESSURE[2]); // Golden (a Heroic age too)
    expect(agePressure(state, 5)).toBe(AGE_PRESSURE[1]); // absent seat → Normal
    expect(agePressure(state, FREE_SEAT)).toBe(0); // the Free Cities player has no age
  });

  // ---- seatPhase-driven: the weakest city gets +GOVERNOR_LOYALTY -------------
  it('seatPhase seats the record\'s governor (+GOVERNOR_LOYALTY) on its city when titles ≥ 1', () => {
    function scenario(nCivics: number): { weak: number; strong: number } {
      const state = makeState();
      const r0 = addCiv(state, 5, 5, { research: titledResearch(nCivics) });
      const weak = addCity(state, r0, 3, 5, 40); // weakest non-capital
      addCity(state, r0, 7, 5, 60); // stronger non-capital
      addCiv(state, 10, 10); // a second civ so r0's cities feel foreign pressure (loyalty runs)
      state.seatActions = { [state.turn - 1]: { [r0.seat]: { production: [], tech: null, civic: null, units: [],
        governors: [[GOV_APPOINT, 0, 0], [GOV_ASSIGN_CITY, 0, weak.centerIndex]] } } };
      // the phase seats her after its cities' loyalty is read: she pays
      // from the next turn
      seatPhase(state);
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

// The catalog is longer than 32 rows, which is exactly where JavaScript's
// bitwise operators stop: `1 << 36` is `1 << 4`. Every held-promotion mask
// therefore rides exact powers of two, and the GPU's int64 twin must read the
// same bits back.
describe('the promotion mask outlives 32 bits', () => {
  it('one held row reads as itself and as nothing else', () => {
    expect(GOVERNOR_PROMOTIONS.length).toBeGreaterThan(32);
    for (let i = 0; i < GOVERNOR_PROMOTIONS.length; i++) {
      const g: Governor = { appointed: true, cityId: 0, minorId: -1, establishTurns: 0, outTurns: 0, promotions: promotionBitValue(i) };
      for (let j = 0; j < GOVERNOR_PROMOTIONS.length; j++) {
        expect(hasPromotion(g, j), `bit ${i} read at ${j}`).toBe(i === j);
      }
    }
  });

  it('a full mask is exact, and counts every row', () => {
    let mask = 0;
    for (let i = 0; i < GOVERNOR_PROMOTIONS.length; i++) mask += promotionBitValue(i);
    expect(mask).toBe(2 ** GOVERNOR_PROMOTIONS.length - 1);
    expect(Number.isSafeInteger(mask)).toBe(true);
    const roster: Governor[] = GOVERNORS.map((_, i) => (
      { appointed: i === 0, cityId: -1, minorId: -1, establishTurns: 0, outTurns: 0, promotions: i === 0 ? mask : 0 }));
    // one title bought the appointment, one bought each promotion
    expect(governorTitlesSpent({ governors: roster } as unknown as Seat)).toBe(1 + GOVERNOR_PROMOTIONS.length);
  });

  it('a prerequisite mask names the rows it was built from', () => {
    for (const p of GOVERNOR_PROMOTIONS) {
      const want = (p.requires ?? []).map((r) => GOVERNOR_PROMOTION_INDEX[r]!);
      const mask = want.reduce((m, i) => m + promotionBitValue(i), 0);
      for (let j = 0; j < GOVERNOR_PROMOTIONS.length; j++) {
        expect(promotionBit(mask, j), `${p.id} requires ${j}?`).toBe(want.includes(j));
      }
    }
  });
});
