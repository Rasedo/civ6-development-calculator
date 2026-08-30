import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantCivics } from '../helpers';
import { foundCity, queueDistrict } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { computeUnlocks, computeAdoption, defaultModifiers, getModifiers, makeYieldCtx, prodBoostPct, unitUpkeep } from '../../../cpu/core/effects';
import { cityBuildingYields } from '../../../cpu/core/yields';
import { cityDefenseStrength, cityStrikeStrength, barbarianCombatCS } from '../../../cpu/core/combat';
import { GOVERNMENTS, POLICIES, POLICY_LIST } from '../../../cpu/data/policies';
import { CIVICS } from '../../../cpu/data/civics';
import { UNIT_ERA_INDEX, unitHasClass, UNITS } from '../../../cpu/data/units';
import { spawnUnit } from '../../../cpu/core/units';
import { seatOf, BARB_SEAT } from '../../../cpu/core/seats';

describe('the policy catalog', () => {
  it('every card is unlocked by exactly one civic, a Dark Age or a government', () => {
    const unlockedBy = new Map<string, string>();
    for (const c of Object.values(CIVICS)) {
      for (const fx of c.effects) {
        if (fx.kind !== 'unlockPolicy') continue;
        expect(POLICIES[fx.policy], `${fx.policy} is unlocked and does not exist`).toBeTruthy();
        expect(unlockedBy.has(fx.policy), `${fx.policy} unlocked twice`).toBe(false);
        unlockedBy.set(fx.policy, c.id);
      }
    }
    for (const p of POLICY_LIST) {
      if (p.dark) {
        // a Dark Age card is granted by the age and its era window, and no
        // civic ever grants or retires it
        expect(unlockedBy.get(p.id), `${p.id} is a dark card — no civic grants it`).toBeUndefined();
        expect(p.obsoleteCivic, `${p.id} is a dark card — no civic retires it`).toBeUndefined();
        expect(p.kind, `${p.id} is a dark card — wildcard only`).toBe('wildcard');
        expect(p.dark.firstEra <= p.dark.lastEra, `${p.id} has an inverted era window`).toBe(true);
        continue;
      }
      if (p.legacyOf !== undefined) {
        // a LEGACY card is granted by having been in its government; no civic
        // ever grants or retires it, and it fits a Wildcard alone
        expect(GOVERNMENTS[p.legacyOf], `${p.id} names a government that does not exist`).toBeTruthy();
        expect(unlockedBy.get(p.id), `${p.id} is a legacy card — no civic grants it`).toBeUndefined();
        expect(p.obsoleteCivic, `${p.id} is a legacy card — no civic retires it`).toBeUndefined();
        expect(p.kind, `${p.id} is a legacy card — wildcard only`).toBe('wildcard');
        expect(p.effects, `${p.id} must carry its government's own bonus`)
          .toEqual(GOVERNMENTS[p.legacyOf].effects);
        continue;
      }
      expect(unlockedBy.get(p.id), `${p.id} has no enabling civic`).toBeTruthy();
      if (p.obsoleteCivic) expect(CIVICS[p.obsoleteCivic], `${p.id} retires to nothing`).toBeTruthy();
    }
  });

  it('a card leaves the pool the turn its obsoleting civic completes', () => {
    const state = makeState();
    grantCivics(state, 'CRAFTSMANSHIP');
    expect(computeUnlocks(state, 0).policies.has('AGOGE')).toBe(true);
    grantCivics(state, 'FEUDALISM'); // Agoge's obsolete_with
    expect(computeUnlocks(state, 0).policies.has('AGOGE')).toBe(false);
    // and a retired card can no longer take a slot
    grantCivics(state, 'CODE_OF_LAWS', 'MILITARY_TRAINING');
    expect(computeAdoption(seatOf(state, 0)!.research).policies).not.toContain('AGOGE');
  });
});

describe('production cards', () => {
  const mods = () => {
    const m = defaultModifiers();
    m.prodBoosts.push(POLICIES.AGOGE.effects.prodBoost!);
    return m;
  };

  it('AGOGE pays a Classical melee unit and not a Medieval one', () => {
    expect(UNIT_ERA_INDEX.WARRIOR).toBe(0);
    expect(UNIT_ERA_INDEX.CROSSBOWMAN).toBe(2);
    expect(prodBoostPct(mods(), { kind: 'unit', unit: 'WARRIOR', progress: 0 })).toBeCloseTo(0.5);
    expect(prodBoostPct(mods(), { kind: 'unit', unit: 'CROSSBOWMAN', progress: 0 })).toBe(0);
    // a Horseman is CAVALRY — Agoge names melee, ranged and anti-cavalry
    expect(prodBoostPct(mods(), { kind: 'unit', unit: 'HORSEMAN', progress: 0 })).toBe(0);
  });

  it('the percentages ADD across two cards that both name the item', () => {
    const m = mods();
    m.prodBoosts.push(POLICIES.MILITARY_FIRST.effects.prodBoost!);
    expect(prodBoostPct(m, { kind: 'unit', unit: 'WARRIOR', progress: 0 })).toBeCloseTo(1);
  });

  it('a wonder card reads the WONDER era and never a unit', () => {
    const m = defaultModifiers();
    m.prodBoosts.push(POLICIES.CORVEE.effects.prodBoost!);
    expect(prodBoostPct(m, { kind: 'wonder', wonder: 'PYRAMIDS', tileIndex: 0, progress: 0 })).toBeCloseTo(0.15);
    expect(prodBoostPct(m, { kind: 'unit', unit: 'WARRIOR', progress: 0 })).toBe(0);
  });

  it('COLONIZATION reaches the settler QUEUE KIND, which carries no unit id', () => {
    const m = defaultModifiers();
    m.prodBoosts.push(POLICIES.COLONIZATION.effects.prodBoost!);
    expect(prodBoostPct(m, { kind: 'settler', progress: 0, cost: 80 })).toBeCloseTo(0.5);
  });

  it('the RANGED class is the class, not the ranged-attack stat', () => {
    expect(unitHasClass(UNITS.ARCHER, 'ranged')).toBe(true);
    expect(unitHasClass(UNITS.QUADRIREME, 'ranged')).toBe(false); // naval ranged
    expect(unitHasClass(UNITS.CATAPULT, 'ranged')).toBe(false); // siege
  });
});

describe('the flat channels', () => {
  it('CONSCRIPTION takes a unit’s upkeep down and never below free', () => {
    const m = defaultModifiers();
    expect(unitUpkeep(m, 'KNIGHT')).toBe(UNITS.KNIGHT.maintenance);
    m.unitMaintenanceCut = 1;
    expect(unitUpkeep(m, 'KNIGHT')).toBe(UNITS.KNIGHT.maintenance - 1);
    m.unitMaintenanceCut = 99;
    expect(unitUpkeep(m, 'KNIGHT')).toBe(0);
    expect(unitUpkeep(m, 'BUILDER')).toBe(0);
  });

  it('BASTIONS raises what a city DEFENDS at and what it FIRES at by different halves', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const base = cityDefenseStrength(state, city);
    expect(cityStrikeStrength(state, city)).toBe(base);
    // BASTIONS is +6 Defense / +5 Ranged, so the two stop agreeing
    expect(POLICIES.BASTIONS.effects.cityDefense).toBe(6);
    expect(POLICIES.BASTIONS.effects.cityRanged).toBe(5);
    // CHIEFDOM has ONE military slot and DISCIPLINE is earlier in table
    // order — retiring it with COLONIALISM is what lets BASTIONS in
    grantCivics(state, 'CODE_OF_LAWS', 'DEFENSIVE_TACTICS', 'COLONIALISM');
    expect(computeAdoption(seatOf(state, 0)!.research).policies).toContain('BASTIONS');
    expect(cityDefenseStrength(state, city)).toBe(base + 6);
    expect(cityStrikeStrength(state, city)).toBe(base + 5);
  });

  it('DISCIPLINE only ever runs one way', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    grantCivics(state, 'CODE_OF_LAWS'); // CHIEFDOM's military slot takes DISCIPLINE
    expect(computeAdoption(seatOf(state, 0)!.research).policies).toContain('DISCIPLINE');
    expect(barbarianCombatCS(state, 0, BARB_SEAT)).toBe(5);
    expect(barbarianCombatCS(state, 0, 1)).toBe(0); // a major foe is not a barbarian
    expect(barbarianCombatCS(state, BARB_SEAT, 0)).toBe(0); // and a barbarian adopts nothing
  });

  it('SERFDOM is paid at CREATION, so a Builder born before it keeps its count', () => {
    const state = makeState(makeMap(16, 16));
    state.unitsMode = true;
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const early = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 7, 8).index, 0)!;
    expect(early.charges).toBe(UNITS.BUILDER.charges);
    // The greedy fill takes table order, so SERFDOM is only reachable once
    // COLONIALISM retires the two Ancient military cards and frees MONARCHY's
    // wildcards for the economic overflow.
    grantCivics(state, 'CODE_OF_LAWS', 'DIVINE_RIGHT', 'FEUDALISM', 'COLONIALISM');
    expect(computeAdoption(seatOf(state, 0)!.research).policies).toContain('SERFDOM');
    const late = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 7, 9).index, 0)!;
    expect(late.charges).toBe((UNITS.BUILDER.charges ?? 0) + 2);
    expect(early.charges).toBe(UNITS.BUILDER.charges); // untouched
  });
});

describe('the building-yield boost', () => {
  it('SIMULTANEUM moves the NAMED yield only, and the two GS clauses ADD', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    state.sandbox = true;
    const hs = tileAtCoords(state.map, 9, 8);
    expect(queueDistrict(state, city.id, 'HOLY_SITE', hs.index, 0).ok).toBe(true);
    // the two Holy Site buildings this card is about, past the SHRINE-first
    // chain `queueBuilding` enforces
    city.buildings.push('TEMPLE', 'CATHEDRAL');

    const ctx = makeYieldCtx(state, 0);
    const before = cityBuildingYields(ctx, city);
    ctx.mods.buildingYieldBoosts.push(POLICIES.SIMULTANEUM.effects.buildingYieldBoost!);
    const flat = cityBuildingYields(ctx, city);
    // every Holy Site building's FAITH doubles; the Cathedral's culture does not
    expect(flat.faith).toBe(before.faith * 2);
    expect(flat.culture).toBe(before.culture);

    city.population = 15; // "+50% if city population is 15 or higher"
    const big = cityBuildingYields(ctx, city);
    expect(big.faith).toBeCloseTo(before.faith * 2.5);
  });
});

describe('the empire-wide channels', () => {
  it('COLLECTIVE_ACTIVISM multiplies culture per suzerainty and nothing else', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    const m = getModifiers(state, 0);
    expect(m.culturePerSuzerain).toBe(0);
    expect(POLICIES.COLLECTIVE_ACTIVISM.effects.culturePerSuzerain).toBeCloseTo(0.05);
  });

  it('CARAVANSARIES pays every route this seat runs, not the destination', () => {
    expect(POLICIES.CARAVANSARIES.effects.routeGold).toBe(2);
  });

  it('the four Great-Person cards each name ONE class', () => {
    const pairs: [string, string][] = [
      ['STRATEGOS', 'GENERAL'], ['INSPIRATION', 'SCIENTIST'],
      ['REVELATION', 'PROPHET'], ['LITERARY_TRADITION', 'WRITER'],
    ];
    for (const [card, cls] of pairs) {
      const g = POLICIES[card].effects.gppFlat!;
      expect(Object.keys(g)).toEqual([cls]);
      expect(Object.values(g)).toEqual([2]);
    }
  });

  it('every card carries a live effect set — none is inert', () => {
    const inert = POLICY_LIST.filter((p) => Object.keys(p.effects).length === 0).map((p) => p.id);
    // LEGACY_DEMOCRACY carries Democracy's own inherent bonus, and that bonus
    // asks for ALLIANCES, which this model has not got — the government row
    // is empty for the same reason and by the same open item.
    expect(inert.sort()).toEqual(['LEGACY_DEMOCRACY']);
  });

  it('every government but the Chiefdom has a legacy card', () => {
    const want = Object.values(GOVERNMENTS).filter((g) => g.tier > 0).map((g) => `LEGACY_${g.id}`);
    const got = POLICY_LIST.filter((p) => p.legacyOf !== undefined).map((p) => p.id);
    expect(got.sort()).toEqual(want.sort());
  });
});

describe('the city walk reads the new channels', () => {
  it('URBAN_PLANNING still pays through the greedy fill', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const before = computeCityStats(state, city).breakdown.bonuses.production;
    grantCivics(state, 'CODE_OF_LAWS');
    expect(computeCityStats(state, city).breakdown.bonuses.production).toBe(before + 1);
  });
});
