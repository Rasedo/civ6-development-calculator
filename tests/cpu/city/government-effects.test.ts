import { describe, it, expect } from 'vitest';
import { makeState, settleAt, tileAtCoords, grantCivics, settleFirstCity } from '../helpers';
import { createGame } from '../../../cpu/core/game';
import { defaultModifiers, getModifiers, governmentUnitCS, governmentXpPct, prodBoostPct } from '../../../cpu/core/effects';
import { computeHousing, computeCityStats } from '../../../cpu/core/city';
import { completedDistrictCount } from '../../../cpu/core/yields';
import { awardCityXp, awardDefenseXp } from '../../../cpu/core/combat';
import { cityXp } from '../../../cpu/core/promotions';
import { warWearinessBattle, wwGet } from '../../../cpu/core/weariness';
import { greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { GP_CLASSES } from '../../../cpu/data/greatPeople';
import { spawnUnit } from '../../../cpu/core/units';
import { seatOf, setTileOwner, BARB_SEAT } from '../../../cpu/core/seats';
import { GOVERNMENTS, type PolicyEffects } from '../../../cpu/data/policies';
import type { City, DistrictId, GameState } from '../../../cpu/core/types';

// The GS government rows, sourced from each page's own infobox. What a row
// cannot express is DELETED, not approximated — an invented magnitude is a
// divergence from real Civ 6, not a model.
//
// The applied government is DERIVED from civics (`computeAdoption`: newest
// tier, table order), so OLIGARCHY and CLASSICAL_REPUBLIC are adoptable in
// no game — their rows are proven by borrowing them onto AUTOCRACY, the
// tier-1 adoption winner, exactly the way the GPU poke borrows them onto an
// adopted row in-memory.

function adopt(state: GameState, ...extra: string[]): void {
  grantCivics(state, 'CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY', ...extra);
}

/** run `body` with AUTOCRACY's effects swapped for `fx`, restored after. */
function borrowingRow(fx: PolicyEffects, body: () => void): void {
  const saved = GOVERNMENTS.AUTOCRACY.effects;
  GOVERNMENTS.AUTOCRACY.effects = fx;
  try {
    body();
  } finally {
    GOVERNMENTS.AUTOCRACY.effects = saved;
  }
}

describe('the sourced government rows', () => {
  it('ships what each GS page states and nothing it does not', () => {
    expect(GOVERNMENTS.OLIGARCHY.effects).toEqual(
      { unitCombatCS: { classes: ['MELEE', 'ANTICAV', 'NAVAL_MELEE'], cs: 4 }, xpPct: 20 });
    expect(GOVERNMENTS.FASCISM.effects).toEqual(
      { unitCombatCS: { all: true, cs: 5 }, wwCutPct: 15,
        prodBoost: { target: 'anyUnit', classes: [], eraMax: -1, pct: 0.5 } });
    expect(GOVERNMENTS.AUTOCRACY.effects.prodBoost).toEqual(
      { target: 'wonder', classes: [], eraMax: -1, pct: 0.1 });
    expect(GOVERNMENTS.CLASSICAL_REPUBLIC.effects).toEqual(
      { cityWithDistrict: { housing: 1, amenities: 1 }, gppMult: 1.15 });
    // the unsourced magnitudes are GONE: Monarchy's flat housing, the three
    // ungated yield multipliers. What survives is what each page states —
    // including the three terms that name a GOVERNED city.
    expect(GOVERNMENTS.MONARCHY.effects).toEqual({});
    expect(GOVERNMENTS.DEMOCRACY.effects).toEqual({});
    expect(GOVERNMENTS.MERCHANT_REPUBLIC.effects).toEqual({ governorYieldMult: { gold: 1.1 } });
    expect(GOVERNMENTS.THEOCRACY.effects).toEqual(
      { faithBuyLandUnits: true, governorPerCitizen: { faith: 0.5 } });
    expect(GOVERNMENTS.COMMUNISM.effects).toEqual(
      { yieldMult: { science: 1.1 }, governorPerCitizen: { production: 0.6 } });
  });
});

describe('governmentUnitCS — the promotion-class axis', () => {
  it('OLIGARCHY pays +4 to MELEE, ANTICAV and NAVAL_MELEE and nothing else', () => {
    borrowingRow(GOVERNMENTS.OLIGARCHY.effects, () => {
      const state = makeState();
      adopt(state);
      for (const type of ['WARRIOR', 'SPEARMAN', 'GALLEY']) {
        expect(governmentUnitCS(state, { type, seat: 0 }), type).toBe(4);
      }
      for (const type of ['ARCHER', 'HORSEMAN', 'CATAPULT', 'SETTLER', 'BUILDER']) {
        expect(governmentUnitCS(state, { type, seat: 0 }), type).toBe(0);
      }
      // a seat that adopts no government pays nothing, and neither does a barb
      expect(governmentUnitCS(state, { type: 'WARRIOR', seat: 1 })).toBe(0);
      expect(governmentUnitCS(state, { type: 'WARRIOR', seat: BARB_SEAT })).toBe(0);
    });
  });

  it('FASCISM pays +5 to every combat unit and no civilian', () => {
    const state = makeState();
    adopt(state, 'TOTALITARIANISM'); // the only unlocked tier-3 => FASCISM
    for (const type of ['WARRIOR', 'ARCHER', 'GALLEY', 'CATAPULT']) {
      expect(governmentUnitCS(state, { type, seat: 0 }), type).toBe(5);
    }
    expect(governmentUnitCS(state, { type: 'SETTLER', seat: 0 })).toBe(0);
    expect(governmentUnitCS(state, { type: 'TRADER', seat: 0 })).toBe(0);
  });
});

describe('OLIGARCHY xpPct — "+20% Unit Experience"', () => {
  it('joins the building percentage of a CITY award, integer-exact', () => {
    borrowingRow(GOVERNMENTS.OLIGARCHY.effects, () => {
      const state = makeState();
      adopt(state);
      expect(governmentXpPct(state, 0)).toBe(20);
      const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
      awardCityXp(state, u, 3);
      // cityXp(3, 20, 1) = floor((3*120*2+100)/200) = 4, where 0% pays 3
      expect(cityXp(3, 20, 1)).toBe(4);
      expect(cityXp(3, 0, 1)).toBe(3);
      expect(u.xp).toBe(4);
      const d = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 5).index, 0)!;
      awardDefenseXp(state, d);
      expect(d.xp).toBe(cityXp(2, 20, 1));
    });
  });
});

describe('FASCISM wwCutPct — "War Weariness reduced by 15%"', () => {
  it("cuts the adopter's accrual and nobody else's", () => {
    // a same-seed twin with FASCISM's row stripped measures the uncut
    // amount — the adopter's base is its OWN era's, which the Modern civic
    // that unlocks Fascism has already raised
    const battleWw = (strip: boolean): [number, number] => {
      const saved = GOVERNMENTS.FASCISM.effects;
      if (strip) GOVERNMENTS.FASCISM.effects = {};
      try {
        const state = createGame({
          width: 44, height: 26, seed: 4210,
          withResources: true, withWonders: false, unitsMode: true,
          withVillages: false, cityStates: 1, opponents: 2,
        });
        settleFirstCity(state, 0);
        adopt(state, 'TOTALITARIANISM');
        const away = state.map.tiles.find((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST')!;
        setTileOwner(away, -1, -1);
        warWearinessBattle(state, 0, 1, away.index);
        return [wwGet(seatOf(state, 0)!, 1), wwGet(seatOf(state, 1)!, 0)];
      } finally {
        GOVERNMENTS.FASCISM.effects = saved;
      }
    };
    const [cut, foe] = battleWw(false);
    const [uncut, foeBare] = battleWw(true);
    expect(foe).toBe(foeBare); // the foe's accrual never moves
    expect(uncut).toBeGreaterThan(0);
    expect(cut).toBe(Math.floor((uncut * (100 - 15)) / 100));
  });
});

describe('CLASSICAL REPUBLIC — the ANY-district gate and the GPP factor', () => {
  function plant(state: GameState, city: City, type: DistrictId, col: number, row: number, complete = true) {
    const t = tileAtCoords(state.map, col, row);
    t.district = type;
    t.districtComplete = complete;
    setTileOwner(t, city.seat, city.id);
    city.districts.push({ type, tileIndex: t.index });
  }

  it('a NON-SPECIALTY district opens the housing and amenity grant', () => {
    borrowingRow(GOVERNMENTS.CLASSICAL_REPUBLIC.effects, () => {
      const state = makeState();
      adopt(state);
      const city = settleAt(state, tileAtCoords(state.map, 5, 5).index);
      const h0 = computeHousing(state, city);
      const a0 = computeCityStats(state, city).amenities.have;
      // CANAL counts toward no specialty limit — the old specialty-gated
      // row would have paid nothing here
      plant(state, city, 'CANAL', 6, 5);
      expect(completedDistrictCount(state, city, true)).toBe(0);
      expect(completedDistrictCount(state, city, false)).toBe(1);
      expect(computeHousing(state, city)).toBe(h0 + 1);
      expect(computeCityStats(state, city).amenities.have).toBe(a0 + 1);
    });
  });

  it('an INCOMPLETE district pays nothing', () => {
    borrowingRow(GOVERNMENTS.CLASSICAL_REPUBLIC.effects, () => {
      const state = makeState();
      adopt(state);
      const city = settleAt(state, tileAtCoords(state.map, 5, 5).index);
      const h0 = computeHousing(state, city);
      plant(state, city, 'CANAL', 6, 5, false);
      expect(computeHousing(state, city)).toBe(h0);
    });
  });

  it('multiplies every per-turn Great Person point source by 1.15', () => {
    const state = makeState();
    adopt(state);
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index);
    const t = tileAtCoords(state.map, 6, 6);
    t.district = 'CAMPUS';
    t.districtComplete = true;
    setTileOwner(t, city.seat, city.id);
    city.districts.push({ type: 'CAMPUS', tileIndex: t.index });
    const bare = { ...greatPersonPointsPerTurn(state, 0) };
    expect(bare.SCIENTIST).toBeGreaterThan(0);
    borrowingRow(GOVERNMENTS.CLASSICAL_REPUBLIC.effects, () => {
      const boosted = greatPersonPointsPerTurn(state, 0);
      for (const cls of GP_CLASSES) {
        expect(boosted[cls]).toBeCloseTo(bare[cls] * 1.15, 12);
      }
    });
  });
});

describe('the government production boosts', () => {
  it("FASCISM's anyUnit arm reaches class-carrying and class-free units alike", () => {
    const m = defaultModifiers();
    m.prodBoosts.push(GOVERNMENTS.FASCISM.effects.prodBoost!);
    expect(prodBoostPct(m, { kind: 'unit', unit: 'WARRIOR', progress: 0 })).toBeCloseTo(0.5);
    expect(prodBoostPct(m, { kind: 'unit', unit: 'TRADER', progress: 0 })).toBeCloseTo(0.5);
    expect(prodBoostPct(m, { kind: 'settler', progress: 0, cost: 80 })).toBeCloseTo(0.5);
    expect(prodBoostPct(m, { kind: 'wonder', wonder: 'PYRAMIDS', tileIndex: 0, progress: 0 })).toBe(0);
  });

  it('AUTOCRACY pays wonders only', () => {
    const m = defaultModifiers();
    m.prodBoosts.push(GOVERNMENTS.AUTOCRACY.effects.prodBoost!);
    expect(prodBoostPct(m, { kind: 'wonder', wonder: 'PYRAMIDS', tileIndex: 0, progress: 0 })).toBeCloseTo(0.1);
    expect(prodBoostPct(m, { kind: 'unit', unit: 'WARRIOR', progress: 0 })).toBe(0);
  });

  it('the government mods survive into getModifiers', () => {
    const state = makeState();
    adopt(state, 'TOTALITARIANISM');
    const mods = getModifiers(state, 0);
    expect(mods.wwCutPct).toBe(15);
    expect(mods.unitCombatCS).toEqual([{ classMask: 0, all: true, cs: 5 }]);
    expect(prodBoostPct(mods, { kind: 'unit', unit: 'TRADER', progress: 0 })).toBeCloseTo(0.5);
  });
});
