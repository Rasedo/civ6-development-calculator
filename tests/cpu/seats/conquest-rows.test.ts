import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setWar, tileCity } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { canPlaceDistrict } from '../../../cpu/core/rules';
import { computeUnlocks, getModifiers } from '../../../cpu/core/effects';
import { effectiveResearchCostIn, rosterBoostPoints } from '../../../cpu/core/boosts';
import { standingLoyalty } from '../../../cpu/core/phase';
import { governorTitlesEarned } from '../../../cpu/core/governors';
import { spawnUnit, extraCharges } from '../../../cpu/core/units';
import { warWearinessBattle } from '../../../cpu/core/weariness';
import { peacefulFounderFaith } from '../../../cpu/core/effects';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { TECHS } from '../../../cpu/data/techs';
import {
  EXTRA_UNIT_COPY_ROWS, CONQUEST_POP_ROWS, NOT_FOUNDED_ROWS, NOT_FOUNDED_CHANNELS,
  EXTRA_DISTRICT_ROWS, CITY_TILES_ROWS, BOOST_PCT_ROWS, DISTRICT_PREREQ_ROWS,
  WAR_WEARINESS_ROWS, PEACEFUL_FOUNDER_ROWS, YIELD_PER_SUZERAIN_ROWS,
  GOVERNOR_TITLE_GRANT_ROWS, GP_REFUND_ROWS, EVICT_PCT_ROWS, COPY_CLASSES,
} from '../../../cpu/data/civilizations';
import { isLightCavalry } from '../../../cpu/data/units';
import { UNITS } from '../../../cpu/data/units';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE CONQUERED CITY, THE SECOND HORSE AND THE BOOST (CIV6, the install's
 * TraitModifiers): People of the Steppe, the Great Turkish Bombard, Free
 * Imperial Cities, Mother Russia, Dynastic Cycle, The First Emperor,
 * Satyagraha, Surrounded by Glory, Grand Vizier, Magnanimous and El Escorial.
 *
 * The GPU twin is tests/gpu/conquest_rows_test.py.
 */
const PLAIN = -1;
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

describe('the wire', () => {
  it('carries every batch-ten family, and every code is addressable', () => {
    expect(EXTRA_UNIT_COPY_ROWS.length).toBe(1);
    expect(CONQUEST_POP_ROWS.length).toBe(1);
    expect(NOT_FOUNDED_ROWS.length).toBe(2);
    expect(EXTRA_DISTRICT_ROWS.length).toBe(1);
    expect(CITY_TILES_ROWS.length).toBe(1);
    expect(BOOST_PCT_ROWS.length).toBe(2);
    expect(DISTRICT_PREREQ_ROWS.length).toBe(1);
    expect(WAR_WEARINESS_ROWS.length).toBe(1);
    expect(PEACEFUL_FOUNDER_ROWS.length).toBe(1);
    expect(YIELD_PER_SUZERAIN_ROWS.length).toBe(1);
    expect(GOVERNOR_TITLE_GRANT_ROWS.length).toBe(1);
    expect(GP_REFUND_ROWS.length).toBe(1);
    expect(EVICT_PCT_ROWS.length).toBe(1);
    for (const r of EXTRA_UNIT_COPY_ROWS) expect(COPY_CLASSES.indexOf(r.cls as never)).toBeGreaterThanOrEqual(0);
    for (const r of NOT_FOUNDED_ROWS) expect(NOT_FOUNDED_CHANNELS.indexOf(r.channel)).toBeGreaterThanOrEqual(0);
  });

  it("tags every cavalry chassis with the install's own promotion class", () => {
    // the LIGHT half is what People of the Steppe copies; a chariot archer is
    // PROMOTION_CLASS_RANGED in the install and carries no tag
    const light = Object.values(UNITS).filter((u) => isLightCavalry(u)).map((u) => u.id).sort();
    expect(light).toEqual(['CAVALRY', 'COURSER', 'HELICOPTER', 'HORSEMAN']);
    expect(isLightCavalry(UNITS.KNIGHT)).toBe(false);
    expect(isLightCavalry(UNITS.WAR_CART)).toBe(false);
    expect(isLightCavalry(UNITS.MARYANNU_CHARIOT_ARCHER)).toBe(false);
  });
});

describe('Free Imperial Cities', () => {
  it('lets a German city hold one district past the population limit', () => {
    const cap = (row: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      city.population = 1; // one specialty slot for everyone else
      state.seats[0].research.techs = Object.keys(TECHS);
      let n = 0;
      // three DIFFERENT types: a Campus is one per city, so repeating one
      // would be refused for its own reason and never reach the cap
      const spots = [[8, 7, 'CAMPUS'], [7, 8, 'HOLY_SITE'], [9, 8, 'THEATER_SQUARE']] as const;
      for (const [c, r, type] of spots) {
        const t = tileAtCoords(state.map, c, r);
        if (canPlaceDistrict(state, city, type, t.index).ok) n += 1;
        // stand it so the next asks against a fuller city
        t.district = type;
        city.districts.push({ type, tileIndex: t.index });
      }
      return n;
    };
    expect(cap(PLAIN)).toBe(1);
    expect(cap(seatRow('GERMANY'))).toBe(2);
  });
});

describe('Mother Russia', () => {
  it('claims five more tiles at founding, and nobody else does', () => {
    const owned = (row: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      return state.map.tiles.filter((t) => tileCity(t) === city.id).length;
    };
    const plain = owned(PLAIN);
    expect(plain).toBe(7); // the centre plus its first ring
    expect(owned(seatRow('RUSSIA'))).toBe(plain + 5);
  });
});

describe('Dynastic Cycle', () => {
  it('deepens a boost by ten points, on techs and on civics alike', () => {
    const state = sceneAs(seatRow('CHINA'));
    const plain = sceneAs(PLAIN);
    expect(rosterBoostPoints(state, 0, false)).toBe(10);
    expect(rosterBoostPoints(state, 0, true)).toBe(10);
    expect(rosterBoostPoints(plain, 0, false)).toBe(0);
    const id = Object.keys(TECHS)[0];
    const rs = state.seats[0].research;
    rs.boosted.push(id);
    const base = TECHS[id].cost;
    const chinese = effectiveResearchCostIn(rs, id, base, 0, 10);
    const other = effectiveResearchCostIn(rs, id, base, 0, 0);
    expect(chinese).toBe(Math.round(base * 0.5));
    expect(other).toBe(Math.round(base * 0.6));
  });
});

describe('The First Emperor', () => {
  it('unlocks the Canal with Masonry, and only for Qin', () => {
    const canalOpen = (row: number, techs: string[]): boolean => {
      const state = sceneAs(row);
      state.seats[0].research.techs = techs.slice();
      return computeUnlocks(state, 0).districts.has('CANAL');
    };
    expect(canalOpen(leaderRow('QIN'), ['MASONRY'])).toBe(true);
    expect(canalOpen(PLAIN, ['MASONRY'])).toBe(false);
    // the override REPLACES the usual edge, so Qin without Masonry has none
    const usual = Object.entries(TECHS).find(([, t]) =>
      (t.effects ?? []).some((e) => e.kind === 'unlockDistrict' && e.district === 'CANAL'))?.[0];
    expect(usual).toBeTruthy();
    expect(canalOpen(PLAIN, [usual!])).toBe(true);
    expect(canalOpen(leaderRow('QIN'), [usual!])).toBe(false);
  });

  it('hands the Builder an extra charge', () => {
    const state = sceneAs(leaderRow('QIN'));
    const plain = sceneAs(PLAIN);
    const at = tileAtCoords(state.map, 8, 8);
    expect(extraCharges(state, 0, 'BUILDER', at)).toBe(
      extraCharges(plain, 0, 'BUILDER', tileAtCoords(plain.map, 8, 8)) + 1);
  });
});

describe('El Escorial', () => {
  it('hands the Inquisitor an extra charge and twenty-five more eviction points', () => {
    const state = sceneAs(leaderRow('PHILIP_II'));
    const plain = sceneAs(PLAIN);
    const at = tileAtCoords(state.map, 8, 8);
    expect(extraCharges(state, 0, 'INQUISITOR', at)).toBe(
      extraCharges(plain, 0, 'INQUISITOR', tileAtCoords(plain.map, 8, 8)) + 1);
    expect(getModifiers(state, 0).evictPoints).toBe(25);
    expect(getModifiers(plain, 0).evictPoints).toBe(0);
  });
});

describe('Satyagraha', () => {
  it('doubles what a seat at war with Gandhi accrues', () => {
    const ww = (gandhiRow: number): number => {
      const state = sceneAs(seatRow('AMERICA'));
      state.seats[1].civ = gandhiRow;
      settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
      setWar(state, 0, 1, true);
      warWearinessBattle(state, 0, 1, tileAtCoords(state.map, 8, 8).index, {});
      return state.seats[0].ww?.[1] ?? 0;
    };
    const plain = ww(seatRow('ROME'));
    expect(plain).toBeGreaterThan(0);
    expect(ww(leaderRow('GANDHI'))).toBe(plain * 2);
  });

  it('pays five Faith per religion-founding seat not at war with him', () => {
    const state = sceneAs(leaderRow('GANDHI'));
    expect(peacefulFounderFaith(state, 0)).toBe(0);
    state.seats[0].religion.founded = true;
    expect(peacefulFounderFaith(state, 0)).toBe(5); // "including India"
    state.seats[1].religion.founded = true;
    expect(peacefulFounderFaith(state, 0)).toBe(10);
    setWar(state, 0, 1, true);
    expect(peacefulFounderFaith(state, 0)).toBe(5);
    // and nobody else takes it
    const plain = sceneAs(PLAIN);
    plain.seats[0].religion.founded = true;
    expect(peacefulFounderFaith(plain, 0)).toBe(0);
  });
});

describe('Grand Vizier', () => {
  it('earns Suleiman a title at Gunpowder and nowhere else', () => {
    const titles = (row: number, techs: string[]): number => {
      const state = sceneAs(row);
      state.seats[0].research.techs = techs.slice();
      return governorTitlesEarned(state, 0);
    };
    expect(titles(leaderRow('SULEIMAN'), [])).toBe(titles(PLAIN, []));
    expect(titles(leaderRow('SULEIMAN'), ['GUNPOWDER'])).toBe(titles(PLAIN, ['GUNPOWDER']) + 1);
  });
});

describe('the Great Turkish Bombard', () => {
  it('pays an Amenity and four Loyalty in a city it did not found', () => {
    const scene = (row: number, founded: boolean) => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      city.founderSeat = founded ? 0 : 1;
      return { state, city };
    };
    const a = scene(seatRow('OTTOMAN'), false);
    const b = scene(PLAIN, false);
    expect(computeCityStats(a.state, a.city).amenities.have)
      .toBe(computeCityStats(b.state, b.city).amenities.have + 1);
    expect(standingLoyalty(a.state, a.city)).toBe(standingLoyalty(b.state, b.city) + 4);
    // a city the Ottomans DID found takes neither
    const c = scene(seatRow('OTTOMAN'), true);
    const d = scene(PLAIN, true);
    expect(computeCityStats(c.state, c.city).amenities.have)
      .toBe(computeCityStats(d.state, d.city).amenities.have);
    expect(standingLoyalty(c.state, c.city)).toBe(standingLoyalty(d.state, d.city));
  });
});

describe('People of the Steppe', () => {
  it('names the light cavalry class and nothing else', () => {
    expect(EXTRA_UNIT_COPY_ROWS[0].cls).toBe('LIGHT_CAVALRY');
    expect(EXTRA_UNIT_COPY_ROWS[0].amount).toBe(1);
    const state = sceneAs(seatRow('SCYTHIA'));
    expect(getModifiers(state, 0).extraUnitCopies.length).toBe(1);
    expect(getModifiers(sceneAs(PLAIN), 0).extraUnitCopies.length).toBe(0);
    // the spawn itself is the production path's; here we pin that a HORSEMAN
    // is the class the row reaches and a KNIGHT is not
    const at = tileAtCoords(state.map, 8, 8);
    const u = spawnUnit(state, 'HORSEMAN', at.index, 0);
    expect(u).toBeTruthy();
    expect(isLightCavalry(UNITS.HORSEMAN)).toBe(true);
    expect(isLightCavalry(UNITS.KNIGHT)).toBe(false);
  });
});
