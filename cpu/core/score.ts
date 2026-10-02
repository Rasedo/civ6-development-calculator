/**
 * TWO SCORES.
 *
 * THE EMPIRE SCORE weights: `rules.score` ships them to the GPU, which scores
 * a seat from them (`seat_score`) as the environment's reward.
 *
 * CIV 6'S SCORE (`SCORING_LINE_ITEMS`, cpu/data/scoring.ts): what the game's
 * scores panel shows and what the turn-limit victory ranks. The GPU twin is
 * `score_lines` / `leader` (gpu/core/sim_economy.py).
 */
import type { GameState, Seat } from './types';
import type { YieldKey } from './types';
import { SCORING_LINE_ITEMS, type ScoreCount } from '../data/scoring';
import { completedDistrictCount } from './yields';
import { seatWonders } from './wonders';
import { majorityReligionOf } from './seats';

export const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};

/** The FOREIGN cities whose majority follows `seat`'s religion (religion ids
 *  are founder seat ids): every other major's and the Free Cities' cities by
 *  their followed religion, and every city-state by its majority
 *  (`majorityReligionOf`). */
function convertedCities(state: GameState, seat: number): number {
  let n = 0;
  for (const o of state.seats) {
    if (o.seat === seat) continue;
    for (const c of o.cities) if (c.followedReligion === seat) n += 1;
  }
  for (const c of state.freeSeat?.cities ?? []) if (c.followedReligion === seat) n += 1;
  for (const cs of state.cityStates ?? []) if (majorityReligionOf(state, cs.seat) === seat) n += 1;
  return n;
}

/** What each line item counts for one major seat. */
function scoreCounts(state: GameState, s: Seat): Record<ScoreCount, number> {
  const wonders = seatWonders(state, s.seat).length;
  let districts = 0;
  let population = 0;
  let buildings = wonders; // a wonder counts once among the buildings
  for (const c of s.cities) {
    districts += completedDistrictCount(state, c, false);
    population += c.population;
    buildings += c.buildings.length;
  }
  const r = s.religion;
  return {
    eraScore: s.eraScore ?? 0,
    civics: s.research.civics.length,
    cities: s.cities.length,
    districts,
    population,
    greatPeople: s.gpEarned.length,
    religion: [r.follower, r.founder, r.worship, r.enhancer].filter((b) => b != null).length,
    converted: convertedCities(state, s.seat),
    techs: s.research.techs.length,
    wonders,
    buildings,
  };
}

/** A major seat's Score, line by line in `SCORING_LINE_ITEMS` order. */
export function scoreLines(state: GameState, s: Seat): number[] {
  const n = scoreCounts(state, s);
  return SCORING_LINE_ITEMS.map((l) => n[l.count] * l.multiplier * l.categoryMultiplier);
}

/** THE SCORE VICTORY's seat: the living major (one that holds a city) with
 *  the highest Score, a tie to the lower seat. -1 when no major holds a
 *  city. */
export function scoreLeader(state: GameState): number {
  let best = -1;
  let bestTotal = 0;
  for (const s of state.seats) {
    if (s.cities.length === 0) continue;
    const total = scoreLines(state, s).reduce((a, b) => a + b, 0);
    if (best < 0 || total > bestTotal) {
      best = s.seat;
      bestTotal = total;
    }
  }
  return best;
}
