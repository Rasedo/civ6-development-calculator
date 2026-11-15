/**
 * A CITY-STATE'S STRATEGIES (GameCore_XP2 AI/VictoryStrategy.cpp,
 * GrandStrategic +0x508; `tools/civ6lab/dll_readings.md` "H-1 / C-96: at
 * war with a living major, a unit's strategic resource in the City
 * Analysis, a city-state's naval strategy"). Every strategy but STRATEGY_NAVAL carries
 * an "Is Not Major" disqualifier (STRATEGY_WONDER_OBSESSED an agenda no
 * city-state holds), so a city-state follows that one alone, on its one
 * condition, "Is On Island".
 *
 * THE EVALUATION (0x7bc580, at the player's activation) reads the island
 * flag its last turn left (GrandStrategic +0x4a0): one condition met of
 * the one needed starts the strategy; the flag, once set, stands while the
 * area keeps its coast, so the strategy is not left. The apply (0x7bb3e0,
 * in GrandStrategic's turn) follows the turn's City Analysis and precedes
 * its research AI: the starting turn's research favors the strategy's
 * technologies (`CityState.naval` 1), the City Analysis reads its
 * pseudo-yield weights from the turn after (2).
 *
 * THE ISLAND TEST (GrandStrategic's turn 0x6fafc0 at 0x6fc771..0x6fc873,
 * after the apply; skipped once an area was found half known and short of
 * coast): the city's area (the plot's +8) is half known where the
 * knowledge base's count for it (+0x2e0 map, 0x786080) is above half its
 * plots, and an island where its coastal land plots (the area's +8) are
 * at least AI_ISLAND_COAST_PERCENTAGE of them. The count is the target
 * list's (0x783980): every plot the player sees now adds one to its area's
 * entry (0x783d77..0x783d93), and every plot revealed and out of sight
 * that lies in a region adds one to the entry keyed by its REGION's id
 * (0x7852aa..0x7852df: the region map's key handed to the area map) — an
 * area gains the unseen revealed plots of the region numbered as it is.
 */
import type { CityState, GameState } from './types';
import { AI_ISLAND_COAST_PERCENTAGE } from '../data/aiResearch';
import { isCoastalLand } from '../../world/query';
import { cityStateSight } from './fog';

/** the city-state follows STRATEGY_NAVAL as the jobs after its turn's
 *  apply read it (the research AI's favored rows): from the turn the
 *  strategy starts */
export function minorNavalApplied(cs: CityState | undefined): boolean {
  return (cs?.naval ?? 0) > 0;
}

/** the city-state follows STRATEGY_NAVAL as its turn's City Analysis
 *  reads it, before the apply (the strategy's pseudo-yield weights): from
 *  the turn after the strategy starts */
export function minorNavalWeighted(cs: CityState | undefined): boolean {
  return cs?.naval === 2;
}

/** the plots the knowledge base counts for area `area` (0x783980): those
 *  the city-state sees now in it, and those revealed and out of sight
 *  whose region's id is the area's */
export function minorAreaKnown(state: GameState, cs: CityState, area: number): number {
  const sight = cityStateSight(state, cs.seat);
  let n = 0;
  for (const t of state.map.tiles) {
    if (sight[t.index]) {
      if (t.area === area) n += 1;
    } else if (cs.revealed?.[t.index] === 1 && (t.region ?? -1) === area) {
      n += 1;
    }
  }
  return n;
}

/** the city-state's strategies' turn: the evaluation on the island flag
 *  its last turn left, then the island test on the plots it knows now */
export function minorStrategyTurn(state: GameState, cs: CityState): void {
  if (cs.naval === 1) cs.naval = 2;
  else if (cs.island === 2 && !cs.naval) cs.naval = 1;
  if (cs.island === 1 || cs.centerIndex < 0) return;
  const area = state.map.tiles[cs.centerIndex].area ?? -1;
  if (area < 0) return;
  const plots = state.map.tiles.filter((t) => t.area === area);
  if (minorAreaKnown(state, cs, area) * 2 <= plots.length) return;
  const coastal = plots.filter((t) => isCoastalLand(state.map, t)).length;
  cs.island = coastal < Math.trunc((plots.length * AI_ISLAND_COAST_PERCENTAGE) / 100) ? 1 : 2;
}
