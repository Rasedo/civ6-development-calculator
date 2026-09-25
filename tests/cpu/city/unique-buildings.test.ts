/**
 * THE EIGHT UNIQUE BUILDINGS. Every one is a `civVariants` entry on the row it
 * replaces — the same building in storage — whose columns OVERRIDE the base
 * row's through one composer, `effectiveBuilding`. Every number is the
 * install's own Buildings.xml row or its named modifier's argument.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs, grantCivics } from '../helpers';
import { BUILDINGS, buildingVariantFor, effectiveBuilding } from '../../../cpu/data/buildings';
import { BUILDING_PREREQ_ROWS } from '../../../cpu/data/civilizations';
import { buildingMaintenance, buildingTourism } from '../../../cpu/core/city';
import { regionalEffects } from '../../../cpu/core/yields';
import { buildingCostIn, wallsMax } from '../../../cpu/core/rules';
import { computeUnlocksIn } from '../../../cpu/core/effects';
import { workContext } from '../../../cpu/core/greatWorks';
import { CIV_LEADERS } from '../../../world/roster';
import { scaleByGameSpeed } from '../../../cpu/data/constants';

/** the catalog scales every cost, a variant's own included. */
const sp = (n: number): number => scaleByGameSpeed(n);
import type { City, GameState } from '../../../cpu/core/types';

/** replaces -> [civ, name] straight off `Buildings_BuildingReplaces`. */
const ROWS: readonly (readonly [string, string, string])[] = [
  ['BROADCAST_CENTER', 'AMERICA', 'Film Studio'],
  ['UNIVERSITY', 'ARABIA', 'Madrasa'],
  ['FACTORY', 'JAPAN', 'Electronics Factory'],
  ['STABLE', 'MONGOLIA', 'Ordu'],
  ['RENAISSANCE_WALLS', 'GEORGIA', 'Tsikhe'],
  ['BANK', 'OTTOMAN', 'Grand Bazaar'],
  ['AMPHITHEATER', 'MAORI', 'Marae'],
  ['ZOO', 'HUNGARY', 'Thermal Bath'],
  ['TEMPLE', 'NORWAY', 'Stave Church'],
] as const;

/** SEAT the civilization: `Seat.civ` is the ROSTER ROW, not the id. */
function scene(civ: string | null): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 24));
  if (civ) {
    const row = CIV_LEADERS.findIndex((r) => r.civ === civ);
    expect(row, `no roster row plays ${civ}`).toBeGreaterThanOrEqual(0);
    state.seats[0]!.civ = row;
  }
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  return { state, city };
}

describe('the unique building catalog', () => {
  it('carries every row the install gives a seated civilization', () => {
    const all = Object.values(BUILDINGS).flatMap((b) => (b.civVariants ?? []).map((v) => v.name));
    expect(all.length).toBe(ROWS.length);
    expect(new Set(all).size).toBe(ROWS.length);
    for (const [base, civ, name] of ROWS) {
      const v = BUILDINGS[base]?.civVariants?.find((x) => x.civ === civ);
      expect(v, `${name} has no variant on ${base}`).toBeTruthy();
      expect(v!.name).toBe(name);
    }
  });

  it('gives one civilization at most one variant of a building', () => {
    for (const b of Object.values(BUILDINGS)) {
      const civs = (b.civVariants ?? []).map((v) => v.civ);
      expect(new Set(civs).size, `${b.id} names a civilization twice`).toBe(civs.length);
    }
  });
});

describe('effectiveBuilding merges a variant over the row it replaces', () => {
  it('leaves every column alone for a seat that plays no variant', () => {
    for (const [base] of ROWS) expect(effectiveBuilding(null, base)).toBe(BUILDINGS[base]);
    expect(effectiveBuilding('ROME', 'UNIVERSITY')).toBe(BUILDINGS.UNIVERSITY);
  });

  it('takes the Madrasa its Science and leaves the University its own', () => {
    expect(effectiveBuilding('ARABIA', 'UNIVERSITY')!.yields).toEqual({ science: 5 });
    expect(BUILDINGS.UNIVERSITY.yields).toEqual({ science: 4 });
    // the columns it does NOT name stay the base row's
    expect(effectiveBuilding('ARABIA', 'UNIVERSITY')!.housing).toBe(BUILDINGS.UNIVERSITY.housing);
    expect(effectiveBuilding('ARABIA', 'UNIVERSITY')!.cost).toBe(BUILDINGS.UNIVERSITY.cost);
  });

  it("prices a variant off its OWN install row's Cost", () => {
    expect(effectiveBuilding('OTTOMAN', 'BANK')!.cost).toBe(sp(220));      // BUILDING_GRAND_BAZAAR
    expect(effectiveBuilding('HUNGARY', 'ZOO')!.cost).toBe(sp(360));       // BUILDING_THERMAL_BATH
    expect(effectiveBuilding('GEORGIA', 'RENAISSANCE_WALLS')!.cost).toBe(sp(260)); // BUILDING_TSIKHE
    // and leaves the five that cost what they replace alone
    expect(effectiveBuilding('AMERICA', 'BROADCAST_CENTER')!.cost).toBe(BUILDINGS.BROADCAST_CENTER.cost);
    expect(effectiveBuilding('MONGOLIA', 'STABLE')!.cost).toBe(BUILDINGS.STABLE.cost);
  });

  it('charges the seat the variant price through buildingCostIn', () => {
    const a = scene('OTTOMAN');
    const b = scene('ROME');
    expect(buildingCostIn(a.state, a.city, 'BANK')).toBe(sp(220));
    expect(buildingCostIn(b.state, b.city, 'BANK')).toBe(BUILDINGS.BANK.cost);
    // ...and the Bazaar really is the cheaper of the two
    expect(buildingCostIn(a.state, a.city, 'BANK')).toBeLessThan(BUILDINGS.BANK.cost);
  });

  it('gives the Marae no upkeep where the Amphitheater pays one', () => {
    expect(buildingMaintenance('AMPHITHEATER', 'MAORI')).toBe(0);
    expect(buildingMaintenance('AMPHITHEATER', 'ROME')).toBe(1);
  });

  it('pays the Electronics Factory a fifth Production when POWERED, regionally', () => {
    // Building_YieldChanges pays it the Factory's own 3;
    // Building_YieldChangesBonusWithPower pays 5 where the Factory's pays 3.
    const v = effectiveBuilding('JAPAN', 'FACTORY')!;
    expect(v.yields).toEqual({ production: 3 });
    expect(v.yields).toEqual(BUILDINGS.FACTORY.yields);
    expect(v.poweredYields).toEqual({ production: 5 });
    expect(BUILDINGS.FACTORY.poweredYields).toEqual({ production: 3 });
    expect(v.regional).toBe(true);
    expect(v.power).toBe(BUILDINGS.FACTORY.power);
  });

  it('gives the Thermal Bath twice the Zoo’s Amenity and a Production of its own', () => {
    const v = effectiveBuilding('HUNGARY', 'ZOO')!;
    expect(v.amenities).toBe(2);
    expect(BUILDINGS.ZOO.amenities).toBe(1);
    expect(v.yields).toEqual({ production: 2 });
    expect(buildingVariantFor('HUNGARY', 'ZOO')!.amenitiesWithFeature)
      .toEqual({ feature: 'GEOTHERMAL_FISSURE', amount: 2 });
  });
});

describe('the clauses a variant carries that are not columns', () => {
  it('raises a Georgian perimeter by one tier and no Combat Strength', () => {
    const g = scene('GEORGIA');
    const r = scene('ROME');
    grantTechs(g.state, 'MASONRY', 'CASTLES', 'SIEGE_TACTICS');
    grantTechs(r.state, 'MASONRY', 'CASTLES', 'SIEGE_TACTICS');
    for (const s of [g, r]) s.city.buildings.push('ANCIENT_WALLS', 'MEDIEVAL_WALLS', 'RENAISSANCE_WALLS');
    expect(wallsMax(r.state, r.city)).toBe(300);
    // the Tsikhe's OuterDefenseHitPoints 200 against the Star Fort's 100
    expect(wallsMax(g.state, g.city)).toBe(400);
  });

  it('pays the Tsikhe again in a Golden Age and nothing in a Normal one', () => {
    const v = buildingVariantFor('GEORGIA', 'RENAISSANCE_WALLS')!;
    expect(v.goldenAgeYields).toEqual({ faith: 4 });
    expect(effectiveBuilding('GEORGIA', 'RENAISSANCE_WALLS')!.yields).toEqual({ faith: 4 });
  });

  it('pays the Electronics Factory +4 Culture after Electricity, on the same reach as its Production', () => {
    // CIV6 (ELECTRONICSFACTORY_CULTURE): EFFECT_ADJUST_BUILDING_YIELD_CHANGE
    // +4 YIELD_CULTURE behind REQUIREMENT_PLAYER_HAS_TECHNOLOGY TECH_ELECTRICITY
    // — a building yield, so the REGIONAL row carries it to every centre it reaches
    expect(buildingVariantFor('JAPAN', 'FACTORY')!.techYields).toEqual({ tech: 'ELECTRICITY', yields: { culture: 4 } });
    const factory = (s: { state: GameState; city: City }) => {
      const iz = tileAtCoords(s.state.map, 9, 8);
      expect(iz.ownerCity).toBe(s.city.id);
      iz.district = 'INDUSTRIAL_ZONE';
      iz.districtComplete = true;
      s.city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: iz.index });
      s.city.buildings.push('FACTORY');
    };
    const j = scene('JAPAN');
    factory(j);
    expect(regionalEffects(j.state, j.city).yields.culture).toBe(0);
    expect(regionalEffects(j.state, j.city).yields.production).toBe(3);
    grantTechs(j.state, 'ELECTRICITY');
    expect(regionalEffects(j.state, j.city).yields.culture).toBe(4);
    expect(regionalEffects(j.state, j.city).yields.production).toBe(3);
    const r = scene('ROME');
    factory(r);
    grantTechs(r.state, 'ELECTRICITY');
    expect(regionalEffects(r.state, r.city).yields.culture).toBe(0);
  });

  it('pays the Marae one Tourism per feature tile of its city once Flight is held', () => {
    // CIV6 (MARAE_TOURISM_FEATURES): EFFECT_ADJUST_CITY_TOURISM_PER_FEATURE
    // Amount 1 behind REQUIREMENT_PLAYER_HAS_TECHNOLOGY TECH_FLIGHT
    expect(buildingVariantFor('MAORI', 'AMPHITHEATER')!.tourismPerFeature).toEqual({ amount: 1, tech: 'FLIGHT' });
    const plant = (s: { state: GameState; city: City }) => {
      s.city.buildings.push('AMPHITHEATER');
      const own = s.state.map.tiles.filter((t) => t.ownerCity === s.city.id && t.index !== s.city.centerIndex);
      expect(own.length).toBeGreaterThanOrEqual(3);
      own[0]!.feature = 'WOODS';
      own[1]!.feature = 'MARSH';
      own[2]!.feature = 'ICE'; // a feature is a feature: the clause names no passability
    };
    const m = scene('MAORI');
    plant(m);
    expect(buildingTourism(m.state, 0, [m.city])).toBe(0);
    grantTechs(m.state, 'FLIGHT');
    expect(buildingTourism(m.state, 0, [m.city])).toBe(3);
    const r = scene('ROME');
    plant(r);
    grantTechs(r.state, 'FLIGHT');
    expect(buildingTourism(r.state, 0, [r.city])).toBe(0);
  });

  it('pays the Thermal Bath 3 Tourism while its city holds a Geothermal Fissure', () => {
    // CIV6 (THERMALBATH_ADDTOURISM): EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE
    // Amount 3 behind REQUIREMENT_CITY_HAS_X_FEATURE_TYPE FEATURE_GEOTHERMAL_FISSURE 1
    expect(buildingVariantFor('HUNGARY', 'ZOO')!.tourismWithFeature).toEqual({ feature: 'GEOTHERMAL_FISSURE', amount: 3 });
    const h = scene('HUNGARY');
    h.city.buildings.push('ZOO');
    expect(buildingTourism(h.state, 0, [h.city])).toBe(0);
    const own = h.state.map.tiles.filter((t) => t.ownerCity === h.city.id && t.index !== h.city.centerIndex);
    own[0]!.feature = 'GEOTHERMAL_FISSURE';
    expect(buildingTourism(h.state, 0, [h.city])).toBe(3);
    own[1]!.feature = 'GEOTHERMAL_FISSURE'; // "1 or more": a second fissure pays nothing more
    expect(buildingTourism(h.state, 0, [h.city])).toBe(3);
    const r = scene('ROME');
    r.city.buildings.push('ZOO');
    r.state.map.tiles.find((t) => t.ownerCity === r.city.id && t.index !== r.city.centerIndex)!.feature = 'GEOTHERMAL_FISSURE';
    expect(buildingTourism(r.state, 0, [r.city])).toBe(0);
  });

  it('takes the Marae off the Amphitheater’s Great Work slots', () => {
    const m = scene('MAORI');
    const r = scene('ROME');
    for (const s of [m, r]) s.city.buildings.push('AMPHITHEATER');
    const hi = 2; // GW_HOLDERS: PALACE, TEMPLE, AMPHITHEATER
    expect(workContext(r.state, r.city).present[hi]).toBe(true);
    expect(workContext(m.state, m.city).present[hi]).toBe(false);
  });

  it('gives the Ordu its Movement grant and its class list', () => {
    const v = buildingVariantFor('MONGOLIA', 'STABLE')!;
    expect(v.trainMovement).toBe(1);
    expect(v.trainMovementClasses).toEqual(['LIGHT_CAV', 'HEAVY_CAV']);
    // its XP line is the Stable's own, not a second one
    expect(v.trainXpPct).toBeUndefined();
    expect(effectiveBuilding('MONGOLIA', 'STABLE')!.trainXpPct).toBe(25);
  });

  it('gives the Grand Bazaar its two per-kind clauses', () => {
    const v = buildingVariantFor('OTTOMAN', 'BANK')!;
    expect(v.amenityPerLuxuryType).toBe(1);
    expect(v.strategicPerType).toBe(1);
  });

  it('reads the Madrasa’s Faith off its own district', () => {
    expect(buildingVariantFor('ARABIA', 'UNIVERSITY')!.districtAdjacencyAsFaith).toBe(true);
  });
});

describe('the Madrasa arrives on a civic where the University waits for a tech', () => {
  const row = BUILDING_PREREQ_ROWS.find((r) => r.building === 'UNIVERSITY');

  it('has an override row of its own', () => {
    expect(row, 'no unlock override for the University').toBeTruthy();
    expect(row!.civ).toBe('ARABIA');
    expect(row!.civic).toBe('THEOLOGY');
    expect(row!.tech).toBeUndefined();
  });

  it('REPLACES the base unlock: the tech alone no longer opens it', () => {
    const research = {
      tech: null, techProgress: 0, civic: null, civicProgress: 0,
      techs: ['EDUCATION'], civics: [], boosted: [],
      techRetained: {}, civicRetained: {},
    };
    expect(computeUnlocksIn(research, [], []).buildings.has('UNIVERSITY')).toBe(true);
    expect(computeUnlocksIn(research, [], [row!]).buildings.has('UNIVERSITY')).toBe(false);
    const withCivic = { ...research, civics: ['THEOLOGY'] };
    expect(computeUnlocksIn(withCivic, [], [row!]).buildings.has('UNIVERSITY')).toBe(true);
  });
});

describe('a seat that plays the civilization actually gets the numbers', () => {
  it('gives Arabia the Madrasa’s Housing and Science in its own city', () => {
    const a = scene('ARABIA');
    grantCivics(a.state, 'THEOLOGY');
    const def = effectiveBuilding('ARABIA', 'UNIVERSITY')!;
    expect(def.name).toBe('Madrasa');
    expect(def.district).toBe('CAMPUS'); // a variant never moves its district
  });
});
