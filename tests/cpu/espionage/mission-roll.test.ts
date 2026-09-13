/**
 * THE SPY MISSION ROLL — C-16, measured in the live game on 2026-09-13
 * (`tools/civ6lab/spy_probe.lua` over the tuner socket; the GPU twin is
 * tests/gpu/spy_roll_test.py).
 *
 * `UnitManager.GetResultProbability` returned, for every mission and every
 * level term, floor(p x 256)/256 of ONE 3d6 roll R against a threshold
 * T = BaseProbability - k, in six bands by margin. These scenes pin the band
 * function against the two tables the lab wrote down and the k the level
 * terms compose.
 */
import { describe, it, expect } from 'vitest';
import {
  missionOutcome, missionThreshold,
  MISSION_SUCCESS_UNDETECTED, MISSION_SUCCESS_MUST_ESCAPE, MISSION_FAIL_UNDETECTED,
  MISSION_FAIL_MUST_ESCAPE, MISSION_CAPTURED, MISSION_KILLED,
} from '../../../cpu/core/espionage';
import {
  SPY_MISSIONS, SPY_M_SIPHON_FUNDS, SPY_M_RECRUIT_PARTISANS, SPY_M_SABOTAGE_PRODUCTION,
  SPY_ROLL_DICE, SPY_ROLL_FACES, SPY_ROLL_LEVEL_BASE, SPY_SOURCES_LEVELS,
} from '../../../cpu/data/espionage';

/** the game's table for threshold T: each band's share of the 216 outcomes
 *  of 3d6, scaled the way the UI publishes it — floor(p x 256). */
function table(t: number): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) counts[missionOutcome(a + b + c, t)]++;
  expect(counts.reduce((x, y) => x + y, 0)).toBe(216);
  return counts.map((n) => Math.floor((n * 256) / 216));
}

describe('the spy mission roll', () => {
  it('is one 3d6 against BaseProbability - k, six bands by margin', () => {
    expect([SPY_ROLL_DICE, SPY_ROLL_FACES, SPY_ROLL_LEVEL_BASE]).toEqual([3, 6, 2]);
    const t = 11;
    // the margin ranks the six outcomes
    expect(missionOutcome(t + 2, t)).toBe(MISSION_SUCCESS_UNDETECTED);
    expect(missionOutcome(t + 1, t)).toBe(MISSION_SUCCESS_MUST_ESCAPE);
    expect(missionOutcome(t, t)).toBe(MISSION_SUCCESS_MUST_ESCAPE);
    expect(missionOutcome(t - 1, t)).toBe(MISSION_FAIL_UNDETECTED);
    expect(missionOutcome(t - 2, t)).toBe(MISSION_FAIL_MUST_ESCAPE);
    expect(missionOutcome(t - 3, t)).toBe(MISSION_FAIL_MUST_ESCAPE);
    expect(missionOutcome(t - 4, t)).toBe(MISSION_CAPTURED);
    expect(missionOutcome(t - 5, t)).toBe(MISSION_CAPTURED);
    expect(missionOutcome(t - 6, t)).toBe(MISSION_KILLED);
    expect(missionOutcome(3, t)).toBe(MISSION_KILLED);
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
});
