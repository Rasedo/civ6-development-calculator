/**
 * ENKIDU'S ALLIED-WAR DISCOUNT (B-63r).
 *
 * CIV6 (Adventures of Enkidu, `TRAIT_ADJUST_ALLIED_WAR_DISCOUNT` /
 * `MODIFIER_PLAYER_ADJUST_ALLIED_WAR_DISCOUNT`, `Discount` 150): "May declare
 * war on anyone at war with their allies without warmonger penalties."
 *
 * The AUDIT had this waiting on the gang-up bar and called the magnitude
 * unpublished. Neither was true: the number is 150 and it hangs off nothing.
 * 150 against `GRIEVANCE_WAR_BASE` 100 covers a Surprise war's whole 150 and
 * more than a Formal war's 100, which is what "without" means.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { grievanceWarDeclared, grievancesAgainst } from '../../../cpu/core/grievance';
import { alliedWarDiscount, emptySeat, setAllyTurnsWith, setWar, seatOf } from '../../../cpu/core/seats';
import { CIV_LEADERS, GRIEVANCE_WAR_BASE } from '../../../cpu/data/seats';
import { ENKIDU_ALLIED_WAR_DISCOUNT } from '../../../cpu/data/civilizations';
import { WAR_KIND_FORMAL, WAR_KIND_SURPRISE } from '../../../cpu/data/warKinds';
import type { GameState } from '../../../cpu/core/types';

const GILGAMESH = CIV_LEADERS.findIndex((l) => l.leader === 'GILGAMESH');

/** four majors: 0 the declarer, 1 the target, 2 the declarer's ally. */
function scene(declarerIsGilgamesh: boolean): GameState {
  const state = makeState(makeMap(24, 16));
  for (let i = 1; i < 4; i++) state.seats.push(emptySeat(i));
  for (let i = 0; i < 4; i++) {
    foundCity(state, tileAtCoords(state.map, 3 + i * 5, 8).index, i);
    seatOf(state, i)!.civ = declarerIsGilgamesh && i === 0 ? GILGAMESH : -1;
  }
  return state;
}

describe('the discount fires only on its own clause', () => {
  it('is 150 when an ALLY of the declarer is already at war with the target', () => {
    const state = scene(true);
    expect(alliedWarDiscount(state, 0, 1)).toBe(0); // no alliance yet
    setAllyTurnsWith(state, 0, 2, 20);
    expect(alliedWarDiscount(state, 0, 1)).toBe(0); // the ally is at peace
    setWar(state, 2, 1, true);
    expect(alliedWarDiscount(state, 0, 1)).toBe(ENKIDU_ALLIED_WAR_DISCOUNT);
    expect(ENKIDU_ALLIED_WAR_DISCOUNT).toBe(150);
  });

  it('belongs to the DECLARER, not to either side of the alliance', () => {
    const state = scene(false); // nobody plays Gilgamesh
    setAllyTurnsWith(state, 0, 2, 20);
    setWar(state, 2, 1, true);
    expect(alliedWarDiscount(state, 0, 1)).toBe(0);
    // ...and an allied Gilgamesh does not lend it: seat 2 plays him, seat 0 declares
    seatOf(state, 2)!.civ = GILGAMESH;
    expect(alliedWarDiscount(state, 0, 1)).toBe(0);
    seatOf(state, 0)!.civ = GILGAMESH;
    expect(alliedWarDiscount(state, 0, 1)).toBe(ENKIDU_ALLIED_WAR_DISCOUNT);
  });
});

describe('what the target is owed', () => {
  it('takes the full base without the clause and nothing with it', () => {
    const plain = scene(false);
    grievanceWarDeclared(plain, 0, 1, WAR_KIND_FORMAL);
    const owedPlain = grievancesAgainst(plain, 0);
    expect(owedPlain).toBeGreaterThanOrEqual(GRIEVANCE_WAR_BASE);

    const enkidu = scene(true);
    setAllyTurnsWith(enkidu, 0, 2, 20);
    setWar(enkidu, 2, 1, true);
    const before = grievancesAgainst(enkidu, 0);
    grievanceWarDeclared(enkidu, 0, 1, WAR_KIND_FORMAL);
    // 100 - 150 floors at 0, so the target and its friends take nothing from
    // THIS payment. The flat friend row is a separate published amount.
    expect(grievancesAgainst(enkidu, 0) - before).toBe(0);
  });

  it('covers a SURPRISE war exactly — 150 of 150', () => {
    const state = scene(true);
    setAllyTurnsWith(state, 0, 2, 20);
    setWar(state, 2, 1, true);
    grievanceWarDeclared(state, 0, 1, WAR_KIND_SURPRISE);
    expect(grievancesAgainst(state, 0)).toBe(0);
  });
});
