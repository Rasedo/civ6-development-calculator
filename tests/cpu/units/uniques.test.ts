import { describe, it, expect } from 'vitest';
import { MP_SCALE } from '../../../cpu/data/constants';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { CIV_IDS, CIV_LEADERS } from '../../../cpu/data/seats';
import { UNITS, civUnitAllowed, civReplacement, civUpgradeTarget } from '../../../cpu/data/units';
import { civOf, emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { inEnemyZoc, spawnUnit, startTileMoves, trainableUnits, unitDomain, unitFullMoves } from '../../../cpu/core/units';
import { chassisAttackCS, chassisDefendCS, classMatchupCS, defenderCS } from '../../../cpu/core/combat';
import { upgradeResourceCost } from '../../../cpu/core/stockpile';
import { validImprovementsIn } from '../../../cpu/core/rules';

/**
 * THE UNIQUE UNITS (CIV6, Civilizations.xml / Units.xml of the owner's
 * install): each civilization's own chassis, what it stands in for, and the
 * terms only a unique carries. Gate reachability is thin — the fixtures seat
 * Rome, Egypt and Norway and never Sumeria — so the rules are pinned here.
 */
describe('the seat plays a civilization', () => {
  it('CIV_LEADERS and CIV_IDS agree, and civOf reads the seat', () => {
    // one row per civilization-LEADER pair: every row names a civilization
    // the list holds, every civilization has a row, and the first four rows
    // are the developed four in `CIV_IDS` order
    for (const l of CIV_LEADERS) expect(CIV_IDS).toContain(l.civ);
    for (const c of CIV_IDS) expect(CIV_LEADERS.some((l) => l.civ === c)).toBe(true);
    CIV_LEADERS.slice(0, 4).forEach((l, i) => expect(l.civ).toBe(CIV_IDS[i]));
    expect(new Set(CIV_LEADERS.map((l) => l.leader)).size).toBe(CIV_LEADERS.length);
    const state = makeState(makeMap(8, 8));
    expect(civOf(state, 0)).toBeNull(); // a bare seat plays none
    state.seats[0].civ = 0;
    expect(civOf(state, 0)).toBe('ROME');
    state.seats[0].civ = 2;
    expect(civOf(state, 0)).toBe('NORWAY');
  });

  it('a unique trains for its civilization alone and replaces its base chassis there', () => {
    expect(civUnitAllowed('ROME', 'LEGION')).toBe(true);
    expect(civUnitAllowed('ROME', 'SWORDSMAN')).toBe(false);
    expect(civUnitAllowed('EGYPT', 'SWORDSMAN')).toBe(true);
    expect(civUnitAllowed('EGYPT', 'LEGION')).toBe(false);
    expect(civUnitAllowed('EGYPT', 'MARYANNU_CHARIOT_ARCHER')).toBe(true);
    expect(civUnitAllowed('NORWAY', 'LONGSHIP')).toBe(true);
    expect(civUnitAllowed('NORWAY', 'GALLEY')).toBe(false);
    expect(civUnitAllowed('NORWAY', 'BERSERKER')).toBe(true);
    expect(civUnitAllowed('NORWAY', 'MAN_AT_ARMS')).toBe(false);
    expect(civUnitAllowed('SUMERIA', 'WAR_CART')).toBe(true);
    expect(civUnitAllowed('ROME', 'WAR_CART')).toBe(false);
    // a seat playing no civilization trains every base chassis and no unique
    expect(civUnitAllowed(null, 'SWORDSMAN')).toBe(true);
    expect(civUnitAllowed(null, 'LEGION')).toBe(false);
    expect(civReplacement('ROME', 'SWORDSMAN')).toBe('LEGION');
    expect(civReplacement('ROME', 'GALLEY')).toBeUndefined();
  });

  it('trainableUnits follows the civilization', () => {
    const state = makeState(makeMap(8, 8));
    state.unitsMode = true;
    const ids = () => trainableUnits(state, 0).map((d) => d.id);
    state.seats[0].civ = 3; // Sumeria: the War-Cart needs no tech
    expect(ids()).toContain('WAR_CART');
    state.seats[0].civ = 0;
    expect(ids()).not.toContain('WAR_CART');
    expect(ids()).not.toContain('SWORDSMAN');
    state.seats[0].civ = -1;
    expect(ids()).not.toContain('WAR_CART');
  });

  it('the upgrade lands on the civilization\'s replacement', () => {
    expect(civUpgradeTarget('NORWAY', 'SWORDSMAN')).toBe('BERSERKER');
    expect(civUpgradeTarget('ROME', 'SWORDSMAN')).toBe('MAN_AT_ARMS');
    expect(civUpgradeTarget(null, 'SWORDSMAN')).toBe('MAN_AT_ARMS');
    expect(civUpgradeTarget('ROME', 'WARRIOR')).toBe('LEGION');
    expect(civUpgradeTarget('NORWAY', 'LEGION')).toBe('BERSERKER');
    expect(civUpgradeTarget('NORWAY', 'QUADRIREME')).toBe(UNITS.QUADRIREME.upgradesTo);
    const state = makeState(makeMap(8, 8));
    state.seats[0].civ = 0; // Rome: Warrior -> Legion charges the Legion's Iron
    expect(upgradeResourceCost(state, 0, 'WARRIOR')).toEqual({ id: 'IRON', n: 20 });
    state.seats[0].civ = 2; // Norway: Swordsman (Iron) -> Berserker (Iron) is free
    expect(upgradeResourceCost(state, 0, 'SWORDSMAN')).toBeUndefined();
  });
});

describe('the chariot classes', () => {
  it('are cavalry, but not a target of the anti-cavalry bonus', () => {
    // CIV6 (ANTI_CAVALRY_OPPONENT_REQUIREMENTS): light, heavy and RANGED
    // cavalry — a chariot class is not on the list.
    expect(classMatchupCS('SPEARMAN', 'HORSEMAN')).toBe(10);
    expect(classMatchupCS('SPEARMAN', 'HEAVY_CHARIOT')).toBe(0);
    expect(classMatchupCS('SPEARMAN', 'WAR_CART')).toBe(0);
    expect(classMatchupCS('SPEARMAN', 'MARYANNU_CHARIOT_ARCHER')).toBe(10);
    expect(UNITS.HEAVY_CHARIOT.cavalry).toBe(true);
    expect(UNITS.WAR_CART.cavalry).toBe(true);
  });

  it('the Heavy Chariot halts in enemy ZOC; the War-Cart and the ranged chariot ignore it', () => {
    const state = makeState(makeMap(8, 8));
    state.unitsMode = true;
    state.seats.push({ ...emptySeat(1), name: 'foe' });
    setWar(state, 0, 1, true);
    const foe = tileAtCoords(state.map, 3, 3);
    spawnUnit(state, 'WARRIOR', foe.index, 1);
    const dest = tileAtCoords(state.map, 4, 3);
    expect(inEnemyZoc(state, dest.index, { seat: 0, type: 'HEAVY_CHARIOT' })).toBe(true);
    expect(inEnemyZoc(state, dest.index, { seat: 0, type: 'HORSEMAN' })).toBe(false);
    expect(inEnemyZoc(state, dest.index, { seat: 0, type: 'WAR_CART' })).toBe(false); // CLASS_WAR_CART
    expect(inEnemyZoc(state, dest.index, { seat: 0, type: 'MARYANNU_CHARIOT_ARCHER' })).toBe(false); // CLASS_RANGED_CAVALRY
    expect(inEnemyZoc(state, dest.index, { seat: 0, type: 'LONGSHIP' })).toBe(false); // CLASS_LONGSHIP
  });
});

describe('start-of-turn Movement from the tile', () => {
  it('open flat terrain pays the chariots, hills and forest ground do not', () => {
    const state = makeState(makeMap(8, 8, 'GRASSLAND'));
    const flat = tileAtCoords(state.map, 2, 2);
    const hills = tileAtCoords(state.map, 3, 2);
    hills.elevation = 'HILLS';
    const snow = tileAtCoords(state.map, 4, 2);
    snow.terrain = 'SNOW';
    const u = (type: string, t: { index: number }) => ({ type, seat: 0, tileIndex: t.index });
    expect(startTileMoves(state, u('HEAVY_CHARIOT', flat))).toBe(1);
    expect(startTileMoves(state, u('HEAVY_CHARIOT', hills))).toBe(0);
    expect(startTileMoves(state, u('HEAVY_CHARIOT', snow))).toBe(0);
    expect(startTileMoves(state, u('MARYANNU_CHARIOT_ARCHER', flat))).toBe(2);
    expect(startTileMoves(state, u('WAR_CART', flat))).toBe(1);
    expect(startTileMoves(state, u('WARRIOR', flat))).toBe(0);
    // it rides unitFullMoves and the spawn's first turn
    expect(unitFullMoves(state, u('HEAVY_CHARIOT', flat))).toBe(MP_SCALE * 3);
    expect(unitFullMoves(state, u('HEAVY_CHARIOT', hills))).toBe(MP_SCALE * 2);
    state.unitsMode = true;
    const w = spawnUnit(state, 'WAR_CART', flat.index, 0)!;
    expect(w.movesLeft).toBe(MP_SCALE * 4);
  });

  it('the Berserker draws +2 in enemy territory, the Longship +1 on coast', () => {
    const state = makeState(makeMap(8, 8, 'PLAINS'));
    state.seats.push({ ...emptySeat(1), name: 'foe' });
    const theirs = tileAtCoords(state.map, 2, 2);
    setTileOwner(theirs, 1, 1);
    const b = { type: 'BERSERKER', seat: 0, tileIndex: theirs.index };
    expect(startTileMoves(state, b)).toBe(0); // at peace: not "enemy" territory
    setWar(state, 0, 1, true);
    expect(startTileMoves(state, b)).toBe(2);
    const mine = tileAtCoords(state.map, 3, 2);
    setTileOwner(mine, 0, 1);
    expect(startTileMoves(state, { ...b, tileIndex: mine.index })).toBe(0);
    const coast = tileAtCoords(state.map, 5, 5);
    coast.terrain = 'COAST';
    const ocean = tileAtCoords(state.map, 6, 5);
    ocean.terrain = 'OCEAN';
    expect(startTileMoves(state, { type: 'LONGSHIP', seat: 0, tileIndex: coast.index })).toBe(1);
    expect(startTileMoves(state, { type: 'LONGSHIP', seat: 0, tileIndex: ocean.index })).toBe(0);
    expect(startTileMoves(state, { type: 'GALLEY', seat: 0, tileIndex: coast.index })).toBe(0);
  });
});

describe('Berserker Rage', () => {
  it('+10 attacking, -5 defending against melee only', () => {
    expect(chassisAttackCS({ type: 'BERSERKER' })).toBe(10);
    expect(chassisAttackCS({ type: 'MAN_AT_ARMS' })).toBe(0);
    expect(chassisDefendCS({ type: 'BERSERKER' }, { melee: true })).toBe(-5);
    expect(chassisDefendCS({ type: 'BERSERKER' }, { melee: false })).toBe(0);
    expect(chassisDefendCS({ type: 'BERSERKER' })).toBe(0);
    const state = makeState(makeMap(8, 8, 'PLAINS'));
    state.unitsMode = true;
    state.seats.push({ ...emptySeat(1), name: 'foe' });
    const here = tileAtCoords(state.map, 3, 3);
    const d = spawnUnit(state, 'BERSERKER', here.index, 0)!;
    const a = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 3).index, 1)!;
    const melee = defenderCS(state, d, here.index, { attacker: a, melee: true });
    const ranged = defenderCS(state, d, here.index, { attacker: a, melee: false });
    expect(melee - ranged).toBe(-5);
    d.type = 'MAN_AT_ARMS';
    expect(defenderCS(state, d, here.index, { attacker: a, melee: true })
      - defenderCS(state, d, here.index, { attacker: a, melee: false })).toBe(0);
  });
});

describe('the Legion', () => {
  it('is a military unit with a charge, and lays the Fort alone', () => {
    expect(unitDomain('LEGION')).toBe('military');
    expect(unitDomain('BUILDER')).toBe('civilian');
    expect(UNITS.LEGION.charges).toBe(1);
    const t = tileAtCoords(makeMap(8, 8, 'PLAINS'), 2, 2);
    const opts = { unlocks: null, ownsTile: () => true };
    expect(validImprovementsIn(t, { ...opts, builder: 'LEGION' })).toEqual(['FORT']);
    expect(validImprovementsIn(t, { ...opts, builder: 'SWORDSMAN' })).not.toContain('FORT');
    expect(validImprovementsIn(t, { ...opts, builder: 'BUILDER' })).not.toContain('FORT');
    // the engineer's ground, not the builder's: neutral tiles are fine
    expect(validImprovementsIn(t, { unlocks: null, ownsTile: () => false, builder: 'LEGION' })).toEqual(['FORT']);
  });
});
