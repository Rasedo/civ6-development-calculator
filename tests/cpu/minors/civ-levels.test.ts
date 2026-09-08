/**
 * THE INSTALL'S `CivilizationLevels` TABLE.
 *
 * Ten permissions per class of player, transcribed in `cpu/data/civLevels.ts`
 * from `Civilizations.xml` (TRIBE, CITY_STATE, FULL_CIV) and Expansion1's
 * layer (FREE_CITIES). The row below IS the XML row: a future edit that
 * "corrects" a column has to face the install first.
 *
 * `canAnnexTilesWithCulture` is the one column that forks a live rule, and it
 * is the one an engine is most likely to get wrong — "a minor's city works
 * like any other" reads as if its culture box bought ground. It does not.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { CIV_LEVELS, CIV_LEVEL_ORDER, type CivLevelId } from '../../../cpu/data/civLevels';
import { civLevelIdOf, civLevelOf, BARB_SEAT, FREE_SEAT, seatOfCityState } from '../../../cpu/core/seats';
import { cityBorderGrowth } from '../../../cpu/core/phase';

/** the XML rows, column for column, in the file's own order. */
const XML: Readonly<Record<CivLevelId, readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, number, boolean]>> = {
  //             found  cultr  gold   infl   GP     give   recv   wondr tiles ignoreRes
  TRIBE: [false, false, false, false, false, false, false, false, 0, true],
  CITY_STATE: [false, false, false, true, false, false, true, false, 5, true],
  FULL_CIV: [true, true, true, false, true, true, false, true, 6, false],
  FREE_CITIES: [false, false, false, false, false, false, false, false, 0, false],
};

describe('the table is the XML', () => {
  it('carries every class the wire order names, and no more', () => {
    expect([...CIV_LEVEL_ORDER].sort()).toEqual(Object.keys(CIV_LEVELS).sort());
    expect(CIV_LEVEL_ORDER.length).toBe(4);
  });

  for (const id of Object.keys(XML) as CivLevelId[]) {
    it(`${id} matches its row column for column`, () => {
      const d = CIV_LEVELS[id];
      expect([
        d.canFoundCities, d.canAnnexTilesWithCulture, d.canAnnexTilesWithGold,
        d.canAnnexTilesWithReceivedInfluence, d.canEarnGreatPeople,
        d.canGiveInfluence, d.canReceiveInfluence, d.canBuildWonders,
        d.startingTilesForCity, d.ignoresUnitStrategicResourceRequirements,
      ]).toEqual([...XML[id]]);
    });
  }
});

describe('a seat plays exactly one row', () => {
  it('maps the four id spaces', () => {
    expect(civLevelIdOf(0)).toBe('FULL_CIV');
    expect(civLevelIdOf(5)).toBe('FULL_CIV');
    expect(civLevelIdOf(seatOfCityState(3))).toBe('CITY_STATE');
    expect(civLevelIdOf(BARB_SEAT)).toBe('TRIBE');
    expect(civLevelIdOf(FREE_SEAT)).toBe('FREE_CITIES');
  });

  it('answers with the row itself', () => {
    expect(civLevelOf(FREE_SEAT).canBuildWonders).toBe(false);
    expect(civLevelOf(0).canBuildWonders).toBe(true);
  });
});

describe('the culture box buys ground for a full civ alone', () => {
  it('claims for a major', () => {
    const state = makeState(makeMap(24, 24));
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    cityBorderGrowth(state, city, 0, 10_000);
    expect(city.tilesAcquired).toBeGreaterThan(0);
    expect(city.cultureBox).toBeLessThan(10_000);
  });

  it('banks and buys nothing for the Free Cities player', () => {
    const state = makeState(makeMap(24, 24));
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    cityBorderGrowth(state, city, FREE_SEAT, 10_000);
    expect(city.tilesAcquired).toBe(0);
    expect(city.cultureBox).toBe(10_000);
  });

  it('banks and buys nothing for a city-state either', () => {
    const state = makeState(makeMap(24, 24));
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    cityBorderGrowth(state, city, seatOfCityState(0), 10_000);
    expect(city.tilesAcquired).toBe(0);
    expect(city.cultureBox).toBe(10_000);
  });
});
