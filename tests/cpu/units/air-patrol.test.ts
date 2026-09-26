/**
 * AIR COMBAT'S SECOND HALF: the patrol, the interception, Priority Target and
 * the order a sortie resolves in. The Civilopedia's Air Combat chapters
 * (`LOC_PEDIA_CONCEPTS_PAGE_AIRCOMBAT_3..5`) are the source every check
 * quotes. No seed trains an aircraft, so this lane and its GPU twin
 * (`tests/gpu/air_patrol_test.py`) are what reach the rules.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { UNITS } from '../../../cpu/data/units';
import { spawnUnit, refreshUnits } from '../../../cpu/core/units';
import { emptySeat, seatOf, setAllianceTypeWith, setAllyTurnsWith, setTileOwner, setWar } from '../../../cpu/core/seats';
import { ALLIANCE_M1_CS, ALLIANCE_MILITARY } from '../../../cpu/data/seats';
import { RESOURCES } from '../../../world/resources';
import {
  INTERCEPT_RANGE, INTERCEPT_SUPPORT_CS, PRIORITY_TARGET_DAMAGE, canDeployTo, deployAir, deployRange, deployTargets,
  interceptorAgainst, priorityDefender, priorityTargets, rebaseAir, returnToBase,
} from '../../../cpu/core/air';
import { airPillage, airStrike, damageRoll } from '../../../cpu/core/combat';
import { promoRows } from '../../../cpu/data/promotions';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { AIR_DEPLOY_COLS, AIR_STRIKE_COLS, IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

const FIGHTER = 'BIPLANE';
const JET = 'JET_FIGHTER';
const BOMBER = 'BOMBER';
const GUNNER = 'ANTI_AIR_GUN';
const HULL = 'BATTLESHIP';
const ACT = unitActionIndex(IMPROVEMENT_IDS);

function bit(cls: string, id: string): number {
  const k = promoRows(cls as never).findIndex((p) => p.id === id);
  expect(k).toBeGreaterThanOrEqual(0);
  return 1 << k;
}

/** A units-mode game with seat 0's capital at (8,8), an Aerodrome at (8,9),
 *  a sea tile at (2,2) and seat 1 at war with it. */
function airState() {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index);
  grantTechs(state, 'FLIGHT', 'ADVANCED_FLIGHT');
  const seat = seatOf(state, 0)!;
  seat.treasury = 10_000;
  seat.stockpile = STRATEGIC_IDS.map(() => 99);
  const pad = tileAtCoords(state.map, 8, 9);
  setTileOwner(pad, city.seat, city.id);
  pad.district = 'AERODROME';
  pad.districtComplete = true;
  city.districts.push({ type: 'AERODROME', tileIndex: pad.index });
  state.seats.push(emptySeat(1));
  setWar(state, 0, 1, true);
  const sea = tileAtCoords(state.map, 2, 2);
  sea.terrain = 'COAST';
  return { state, city, seat, pad, sea };
}

/** a seat-1 fighter patrolling `at` (its base is wherever it was spawned). */
function patrolOf(state: GameState, type: string, at: number) {
  const u = spawnUnit(state, type, tileAtCoords(state.map, 20, 20).index, 1)!;
  u.patrol = at;
  return u;
}

describe('the patrol', () => {
  it('a fighter deploys within its Moves of its base; a bomber never does', () => {
    // CIV6 (Patrols): "Fighter aircraft can be deployed to a valid hex within
    // their Movement range from a friendly air base"; (Air Strikes) "Heavy
    // Bomber aircraft cannot deploy on Patrols".
    const { state, city, pad } = airState();
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    expect(deployRange(FIGHTER)).toBe(UNITS[FIGHTER].moves);
    const far = tileAtCoords(state.map, 8, 9 + UNITS[FIGHTER].moves + 1);
    expect(canDeployTo(state, fighter, far.index)).toBe(false);
    expect(canDeployTo(state, fighter, tileAtCoords(state.map, 8, 12).index)).toBe(true);
    expect(canDeployTo(state, bomber, city.centerIndex)).toBe(false);
    // the head offers the seat's own district tiles, tile index ascending
    const head = deployTargets(state, fighter, AIR_DEPLOY_COLS);
    expect(head).toEqual([city.centerIndex, pad.index].sort((a, b) => a - b));
    expect(deployTargets(state, bomber, AIR_DEPLOY_COLS)).toEqual([]);

    expect(deployAir(state, fighter, city.centerIndex)).toBe(true);
    expect(fighter.patrol).toBe(city.centerIndex);
    expect(fighter.tileIndex).toBe(pad.index);   // the base keeps its slot
    expect(fighter.movesLeft).toBe(0);           // and the turn goes with it
  });

  it('returns to base when ordered, for no movement', () => {
    // CIV6 (Patrols): "At any time during the player's turn, Fighter aircraft
    // can 'Return to Base'".
    const { state, city, pad } = airState();
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    fighter.patrol = city.centerIndex;
    const mp = fighter.movesLeft;
    expect(returnToBase(fighter)).toBe(true);
    expect(fighter.patrol).toBeUndefined();
    expect(fighter.movesLeft).toBe(mp);
    expect(returnToBase(fighter)).toBe(false);
  });

  it('holds until it is ordered otherwise: a strike or a rebase ends it', () => {
    // CIV6 (Patrols): "it will do so until it is ordered otherwise or it is
    // destroyed".
    const { state, city, pad } = airState();
    const a = spawnUnit(state, FIGHTER, pad.index, 0)!;
    a.patrol = pad.index;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 11).index, 1);
    expect(airStrike(state, a.id, tileAtCoords(state.map, 8, 11).index, 0).ok).toBe(true);
    expect(a.patrol).toBeUndefined();
    const b = spawnUnit(state, FIGHTER, pad.index, 0)!;
    b.patrol = pad.index;
    expect(rebaseAir(state, b, city.centerIndex)).toBe(true);
    expect(b.patrol).toBeUndefined();
  });

  it('the mask offers the heads, and the applier replays them', () => {
    const { state, city, pad, seat } = airState();
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    const ctx = maskCtx(state, 0);
    const fm = unitMask(ctx, fighter);
    expect(fm).toContain(ACT.DEPLOY_0);
    expect(fm).not.toContain(ACT.RETURN_TO_BASE);
    expect(unitMask(ctx, bomber).filter((c) => c >= ACT.DEPLOY_0 && c < ACT.DEPLOY_0 + AIR_DEPLOY_COLS))
      .toEqual([]);
    const k = deployTargets(state, fighter, AIR_DEPLOY_COLS).indexOf(city.centerIndex);
    const units = state.units.filter((x) => x.seat === 0);
    applySeatUnitOrders(state, seat, [units.map((x) => (x === fighter ? ACT.DEPLOY_0 + k : -1))]);
    expect(fighter.patrol).toBe(city.centerIndex);
    refreshUnits(state);
    expect(unitMask(maskCtx(state, 0), fighter)).toContain(ACT.RETURN_TO_BASE);
    applySeatUnitOrders(state, seat, [units.map((x) => (x === fighter ? ACT.RETURN_TO_BASE : -1))]);
    expect(fighter.patrol).toBeUndefined();
  });

  it('a patrol heals only by Ground Crews; back at base it heals', () => {
    // CIV6 (Patrols): "Aircraft can heal at the end of the game turn when
    // stationed on a City Center, Aerodrome, Airstrip, or Aircraft Carrier";
    // (Ground Crews) "Heal while patrolling or deployed".
    function heal(promos: number, patrolling: boolean): number {
      const { state, city, pad } = airState();
      const need = UNITS[FIGHTER].requiresResource!;
      const t = tileAtCoords(state.map, 7, 8);
      setTileOwner(t, city.seat, city.id);
      t.resource = need;
      t.improvement = RESOURCES[need]!.improvement!;
      grantTechs(state, RESOURCES[need]!.revealTech!);
      const plane = spawnUnit(state, FIGHTER, pad.index, 0)!;
      plane.promos = promos;
      plane.hp = 40;
      refreshUnits(state);   // a fresh turn: nothing spent since
      plane.hp = 40;
      if (patrolling) plane.patrol = city.centerIndex;
      refreshUnits(state);
      return plane.hp - 40;
    }
    expect(heal(0, false)).toBeGreaterThan(0);
    expect(heal(0, true)).toBe(0);
    expect(heal(bit('AIR_FIGHTER', 'GROUND_CREWS'), true)).toBeGreaterThan(0);
  });
});

describe('the interception', () => {
  it('a patrol within its intercept range answers; a stationed fighter does not', () => {
    // CIV6 (Patrols): "its effective intercept range (currently 1 hex
    // radius)"; "Aircraft stationed at an air base do not intercept".
    expect(INTERCEPT_RANGE).toBe(1);
    const { state, pad } = airState();
    const striker = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const target = tileAtCoords(state.map, 8, 11);
    const stationed = spawnUnit(state, FIGHTER, tileAtCoords(state.map, 8, 12).index, 1)!;
    expect(stationed.patrol).toBeUndefined();
    expect(interceptorAgainst(state, striker, target.index)).toBeUndefined();
    const far = patrolOf(state, FIGHTER, tileAtCoords(state.map, 8, 14).index);
    expect(interceptorAgainst(state, striker, target.index)).toBeUndefined();
    far.patrol = tileAtCoords(state.map, 8, 12).index;
    expect(interceptorAgainst(state, striker, target.index)?.unit).toBe(far);
    // an own patrol is no answer
    const mine = spawnUnit(state, FIGHTER, pad.index, 0)!;
    mine.patrol = target.index;
    expect(interceptorAgainst(state, striker, target.index)?.support).toBe(0);
  });

  // runs/air_patrol_20260926T.jsonl: the patrol ON the struck tile answers
  // even when wounded or weaker; among equidistant patrols the stronger; each
  // other covering patrol adds +5 x hp / 100
  it('the patrol on the struck tile answers first; among the nearest the strongest', () => {
    expect(INTERCEPT_SUPPORT_CS).toBe(5);
    const { state, pad } = airState();
    const striker = spawnUnit(state, BOMBER, pad.index, 0)!;
    const target = tileAtCoords(state.map, 8, 11);
    const weak = patrolOf(state, FIGHTER, target.index);
    weak.hp = 40;
    const strong = patrolOf(state, JET, tileAtCoords(state.map, 8, 12).index);
    let got = interceptorAgainst(state, striker, target.index)!;
    expect(got.unit).toBe(weak);
    expect(got.support).toBe(5);
    weak.patrol = tileAtCoords(state.map, 8, 10).index;
    got = interceptorAgainst(state, striker, target.index)!;
    expect(got.unit).toBe(strong);
    expect(got.support).toBe(2);   // one backer at 40 HP
    const half = patrolOf(state, FIGHTER, tileAtCoords(state.map, 9, 11).index);
    half.hp = 50;
    weak.hp = 100;
    expect(interceptorAgainst(state, striker, target.index)!.support).toBe(7.5);
  });

  it('the interception is a two-sided fight at Combat: the interceptor draws first', () => {
    /** a bomber strikes a ship under `n` patrols; the damage both sides take */
    function fight(n: number): { toBomber: number; toFighter: number } {
      const s = airState();
      const b = spawnUnit(s.state, BOMBER, s.pad.index, 0)!;
      const water = tileAtCoords(s.state.map, 8, 12);
      water.terrain = 'COAST';
      const ship = spawnUnit(s.state, 'IRONCLAD', water.index, 1)!;
      ship.tileIndex = water.index;
      const pats = Array.from({ length: n }, () => patrolOf(s.state, FIGHTER, ship.tileIndex));
      const r0 = s.state.rngState;
      expect(airStrike(s.state, b.id, ship.tileIndex, 0).ok).toBe(true);
      // the interceptor at its Combat (a Biplane 80, not its Ranged 75) plus
      // +5 per full-health backer, the bomber at its Combat (85)
      const iE = UNITS[FIGHTER].combat + INTERCEPT_SUPPORT_CS * (n - 1);
      const aE = UNITS[BOMBER].combat;
      const replay = { ...s.state, rngState: r0 } as GameState;
      const toFighter = damageRoll(replay, aE - iE);
      const toBomber = damageRoll(replay, iE - aE);
      expect(100 - pats[0].hp).toBe(toFighter);
      expect(100 - b.hp).toBe(toBomber);
      return { toBomber, toFighter };
    }
    const one = fight(1);
    const three = fight(3);
    expect(one.toFighter).toBeGreaterThan(0);
    expect(three.toBomber).toBeGreaterThan(one.toBomber);   // +10 behind the interceptor
  });

  it('an interceptor brought to 0 HP is gone', () => {
    const { state, pad, sea } = airState();
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    spawnUnit(state, 'IRONCLAD', sea.index, 1);
    const p = patrolOf(state, FIGHTER, sea.index);
    p.hp = 1;
    expect(airStrike(state, bomber.id, sea.index, 0).ok).toBe(true);
    expect(state.units).not.toContain(p);
  });

  it('an intercepted fighter aborts, an intercepted bomber flies on', () => {
    // CIV6 (Interceptions): "If a fighter is intercepted by another fighter on
    // its way to a ground target, it is forced to only engage the enemy
    // fighter and will not attack the ground target. Bombers do not have this
    // restriction."
    const { state, pad, sea } = airState();
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const land = tileAtCoords(state.map, 8, 11);
    const foe = spawnUnit(state, 'WARRIOR', land.index, 1)!;
    patrolOf(state, FIGHTER, land.index);
    expect(airStrike(state, fighter.id, land.index, 0).ok).toBe(true);
    expect(state.units).toContain(fighter);
    expect(fighter.hp).toBeLessThan(100);
    expect(foe.hp).toBe(100);
    expect(fighter.movesLeft).toBe(0);
    expect(fighter.attacksLeft).toBe(0);

    const s2 = airState();
    const bomber = spawnUnit(s2.state, BOMBER, s2.pad.index, 0)!;
    const ship = spawnUnit(s2.state, 'IRONCLAD', s2.sea.index, 1)!;
    patrolOf(s2.state, FIGHTER, s2.sea.index);
    expect(airStrike(s2.state, bomber.id, s2.sea.index, 0).ok).toBe(true);
    expect(bomber.hp).toBeLessThan(100);
    expect(ship.hp).toBeLessThan(100);
    expect(sea).toBeTruthy();
  });
});

describe('the order of a sortie', () => {
  it('the answers come first: a plane shot down never strikes', () => {
    // CIV6 (Interceptions): "Once combat is resolved with any anti-air ground
    // units and intercepting air units, if the attacking bomber survives,
    // combat is then resolved with the original target."
    const { state, pad, sea } = airState();
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    bomber.hp = 1;
    const ship = spawnUnit(state, HULL, sea.index, 1)!;
    expect(airStrike(state, bomber.id, sea.index, 0).ok).toBe(true);
    expect(state.units).not.toContain(bomber);
    expect(ship.hp).toBe(100);
  });

  it('a bomber striking a city meets the anti-air cover', () => {
    const { state, pad } = airState();
    const foeCity = settleAt(state, tileAtCoords(state.map, 8, 14).index, 1);
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    spawnUnit(state, GUNNER, tileAtCoords(state.map, 8, 15).index, 1);
    const hp0 = foeCity.hp;
    expect(airStrike(state, bomber.id, foeCity.centerIndex, 0).ok).toBe(true);
    expect(bomber.hp).toBeLessThan(100);
    expect(foeCity.hp).toBeLessThan(hp0);
  });

  it('the bomb asks its 50% after the answers', () => {
    // CIV6 (Air Strikes): "the attacking air unit must be at 50% health or
    // higher after resolving any damage taken from defending fighter aircraft
    // and anti-air support units."
    function bomb(gun: boolean) {
      const { state, pad } = airState();
      const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
      plane.hp = 60;
      const t = tileAtCoords(state.map, 8, 12);
      setTileOwner(t, 1, 1);
      t.improvement = 'FARM';
      t.pillaged = false;
      if (gun) spawnUnit(state, GUNNER, tileAtCoords(state.map, 8, 13).index, 1);
      expect(airPillage(state, plane.id, t.index, 0).ok).toBe(true);
      return { plane, t };
    }
    expect(bomb(false).t.pillaged).toBe(true);
    const hit = bomb(true);
    expect(hit.plane.hp).toBeLessThan(50);
    expect(hit.t.pillaged).toBe(false);
    expect(hit.plane.movesLeft).toBe(0);   // the sortie is spent all the same
  });

  it('the bomb pillages at 50 HP or more, not at 49', () => {
    // runs/air_bomb50_20260926T.jsonl: pillaged at 51 and 50 HP left, not at
    // 49, 48, 46
    function at(hp: number) {
      const { state, pad } = airState();
      const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
      plane.hp = hp;
      const t = tileAtCoords(state.map, 8, 12);
      setTileOwner(t, 1, 1);
      t.improvement = 'FARM';
      t.pillaged = false;
      return { ok: airPillage(state, plane.id, t.index, 0).ok, pillaged: t.pillaged };
    }
    expect(at(50)).toEqual({ ok: true, pillaged: true });
    expect(at(49)).toEqual({ ok: false, pillaged: false });
  });
});

describe("the seat-pair terms in a sortie's answers", () => {
  it("the Military alliance's +5 rides the plane in the anti-air burst", () => {
    // lab4_t225: a level-1 Military alliance's "+5" once per
    // sub-combat — the burst a bomber took fell from 80 to 66
    function burst(allied: boolean): { got: number; want: number } {
      const { state, pad } = airState();
      state.seats.push(emptySeat(2));
      if (allied) {
        setAllyTurnsWith(state, 0, 2, 10);
        setAllianceTypeWith(state, 0, 2, ALLIANCE_MILITARY);
        setWar(state, 2, 1, true);
      }
      const foeCity = settleAt(state, tileAtCoords(state.map, 8, 14).index, 1);
      const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
      spawnUnit(state, GUNNER, tileAtCoords(state.map, 8, 15).index, 1);
      const r0 = state.rngState;
      expect(airStrike(state, bomber.id, foeCity.centerIndex, 0).ok).toBe(true);
      const plane = UNITS[BOMBER].ranged!.strength + (allied ? ALLIANCE_M1_CS : 0);
      const want = damageRoll({ ...state, rngState: r0 } as GameState, UNITS[GUNNER].antiAir! - plane);
      return { got: 100 - bomber.hp, want };
    }
    const plain = burst(false);
    const ally = burst(true);
    expect(plain.got).toBe(plain.want);
    expect(ally.got).toBe(ally.want);
    expect(ally.got).toBeLessThan(plain.got);
  });
});

describe('priority target', () => {
  it('strikes the Support unit on the tile, past the combat unit beside it', () => {
    // CIV6 (Air Strikes): "Priority Target ... allows them to attack Support
    // class units directly, without first having to eliminate the enemy
    // combat unit placed in the same location."
    const { state, pad } = airState();
    const plane = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const t = tileAtCoords(state.map, 8, 11);
    const guard = spawnUnit(state, 'WARRIOR', t.index, 1)!;
    const medic = spawnUnit(state, 'MEDIC', t.index, 1)!;
    expect(priorityDefender(state, plane, t.index)).toBe(medic);
    expect(priorityTargets(state, plane, AIR_STRIKE_COLS)).toContain(t.index);
    expect(unitMask(maskCtx(state, 0), plane)).toContain(
      ACT.PRIORITY_TARGET_0 + priorityTargets(state, plane, AIR_STRIKE_COLS).indexOf(t.index));
    // fired, it deals a flat 65 with no draw and nothing back, and the gun
    // covering the tile never answers (runs/air_strike_20260926T.jsonl)
    spawnUnit(state, GUNNER, tileAtCoords(state.map, 8, 12).index, 1);
    const r0 = state.rngState;
    expect(PRIORITY_TARGET_DAMAGE).toBe(65);
    expect(airStrike(state, plane.id, t.index, 0, true).ok).toBe(true);
    expect(medic.hp).toBe(100 - PRIORITY_TARGET_DAMAGE);
    expect(guard.hp).toBe(100);
    expect(plane.hp).toBe(100);
    expect(state.rngState).toBe(r0);

    // the plain strike takes the combat unit
    const s2 = airState();
    const p2 = spawnUnit(s2.state, FIGHTER, s2.pad.index, 0)!;
    const t2 = tileAtCoords(s2.state.map, 8, 11);
    const g2 = spawnUnit(s2.state, 'WARRIOR', t2.index, 1)!;
    const m2 = spawnUnit(s2.state, 'MEDIC', t2.index, 1)!;
    expect(airStrike(s2.state, p2.id, t2.index, 0).ok).toBe(true);
    expect(g2.hp).toBeLessThan(100);
    expect(m2.hp).toBe(100);
  });

  it('a tile with no Support unit, or a hostile centre, is no priority target', () => {
    const { state, pad } = airState();
    const plane = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const t = tileAtCoords(state.map, 8, 11);
    spawnUnit(state, 'WARRIOR', t.index, 1);
    expect(priorityDefender(state, plane, t.index)).toBeUndefined();
    const foeCity = settleAt(state, tileAtCoords(state.map, 14, 11).index, 1);
    spawnUnit(state, 'MEDIC', foeCity.centerIndex, 1);
    expect(priorityDefender(state, plane, foeCity.centerIndex)).toBeUndefined();
    expect(airStrike(state, plane.id, t.index, 0, true).ok).toBe(false);
  });
});
