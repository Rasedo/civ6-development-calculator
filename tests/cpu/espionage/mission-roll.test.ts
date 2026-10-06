/**
 * THE SPY MISSION ROLL, measured in the live game
 * (`tools/civ6lab/spy_probe.lua` over the tuner socket) and read in the DLL
 * (GameCore_XP2_Release.dll "Rolling Espionage Result" 0x52b2a0 / 0x52aea0,
 * the bands 0x52b8f0 / 0x52b090); the GPU twin is tests/gpu/spy_roll_test.py.
 *
 * `UnitManager.GetResultProbability` returned, for every mission and every
 * level term, floor(p x 256)/256 of six bands of 3d6 by margin against a
 * threshold T = BaseProbability - k; the game draws ONE weighted pick over
 * the bands' 3d6 counts. These scenes pin the bands against the two tables
 * the lab wrote down, the k the level terms compose, and the one draw.
 */
import { describe, it, expect } from 'vitest';
import {
  missionDraw, missionThreshold, missionWeights, escapeWeights, DICE_COUNTS,
  MISSION_SUCCESS_UNDETECTED, MISSION_KILLED,
} from '../../../cpu/core/espionage';
import {
  SPY_MISSIONS, SPY_M_SIPHON_FUNDS, SPY_M_RECRUIT_PARTISANS, SPY_M_SABOTAGE_PRODUCTION,
  SPY_ROLL_DICE, SPY_ROLL_FACES, SPY_ROLL_LEVEL_BASE, SPY_SOURCES_LEVELS,
} from '../../../cpu/data/espionage';
import type { GameState } from '../../../cpu/core/types';

const lcg = (s: number) => (Math.imul(1103515245, s) + 12345) >>> 0;

/** the game's table for threshold t in outcome order (success undetected
 *  first), scaled the way the UI publishes it — floor(p x 256). */
function table(t: number): number[] {
  const w = missionWeights(t);
  expect(w.reduce((x, y) => x + y, 0)).toBe(216);
  return [...w].reverse().map((n) => Math.floor((n * 256) / 216));
}

describe('the spy mission roll', () => {
  it('weighs six bands of 3d6 by margin against BaseProbability - k', () => {
    expect([SPY_ROLL_DICE, SPY_ROLL_FACES, SPY_ROLL_LEVEL_BASE]).toEqual([3, 6, 2]);
    expect(DICE_COUNTS).toEqual([0, 0, 0, 1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1]);
    // t = 11: killed 3..5, captured 6..7, fail-escape 8..9, fail-undetected
    // 10, success-escape 11..12, success-undetected 13..18
    expect(missionWeights(11)).toEqual([10, 25, 46, 27, 52, 56]);
    // each band held to its window: no band certain or impossible
    expect(missionWeights(40)[5]).toBe(1);
    expect(missionWeights(-20)[0]).toBe(1);
  });

  it('reproduces the tables the live game published', () => {
    // a fresh Recruit — the install's level 1, this engine's level 0 — reads
    // k = 2: base 13 (Siphon Funds) is 66/61/32/54/29/11 of 256 ...
    expect(missionThreshold(SPY_MISSIONS[SPY_M_SIPHON_FUNDS], 0)).toBe(11);
    expect(table(11)).toEqual([66, 61, 32, 54, 29, 11]);
    // ... and base 16 (Recruit Partisans) is 11/29/24/61/61/66
    expect(missionThreshold(SPY_MISSIONS[SPY_M_RECRUIT_PARTISANS], 0)).toBe(14);
    expect(table(14)).toEqual([11, 29, 24, 61, 61, 66]);
    // Gain Sources active in the city read k = 4 — the +2 the mission promises
    expect(missionThreshold(SPY_MISSIONS[SPY_M_SIPHON_FUNDS], SPY_SOURCES_LEVELS)).toBe(9);
    // success (either band) for base 13/14/15/16 at k = 2: 49.6 / 37.1 / 25.4 / 15.6 %
    const success = (t: number) => { const c = table(t); return c[0] + c[1]; };
    expect(success(11)).toBe(127); // 127/256 = 49.6%
    expect(success(missionThreshold(SPY_MISSIONS[SPY_M_SABOTAGE_PRODUCTION], 0))).toBe(95); // 37.1%
    expect(success(14)).toBe(40); // 15.6%
  });

  it('draws ONE weighted pick over the bands, killed first', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    const N = 21600;
    for (let i = 0; i < N; i++) {
      const state = { rngState: 7 * i + 1 } as GameState;
      const s0 = state.rngState;
      counts[missionDraw(state, 11)]++;
      expect(state.rngState).toBe(lcg(s0));
    }
    const w = [...missionWeights(11)].reverse();
    for (let o = MISSION_SUCCESS_UNDETECTED; o <= MISSION_KILLED; o++) {
      expect(Math.abs(counts[o] / N - w[o] / 216)).toBeLessThan(0.012);
    }
    // the lowest draw lands the killed band
    const low = { rngState: 0 } as GameState;
    for (let s = 1; ; s++) {
      if ((lcg(s) >>> 16) * 216 >>> 16 === 0) { low.rngState = s; break; }
    }
    expect(missionDraw(low, 11)).toBe(MISSION_KILLED);
  });

  it('an escape weighs killed, caught and away by v', () => {
    // v = 10: killed 3..7, caught 8..9, away 10..18
    expect(escapeWeights(10)).toEqual([35, 46, 135]);
    expect(escapeWeights(21)).toEqual([216, 0, 0]);
  });
});
