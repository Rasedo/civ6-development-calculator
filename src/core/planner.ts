/**
 * Build-order search: beam search over sequences of build choices for one
 * city, using the turn simulation as the evaluation function. Deterministic;
 * runs entirely on cloned states.
 */

import type { GameState, Yields, YieldKey } from './types';
import { serialize, deserialize, endTurn, queueDistrict, queueBuilding, queueWonder, cancelQueueItem } from './game';
import { computeCityStats } from './city';
import { compareCandidates, choiceLabel, type BuildChoice } from './advisor';

export type Objective = 'science' | 'culture' | 'gold' | 'production' | 'food' | 'balanced';

export const OBJECTIVES: Objective[] = ['balanced', 'science', 'culture', 'gold', 'production', 'food'];

export interface PlannerOptions {
  horizon: number; // turns to plan across
  beamWidth?: number; // nodes kept per depth (default 4)
  branch?: number; // choices tried per expansion (default 5)
  maxDepth?: number; // decisions per plan (default 4)
  objective: Objective;
}

export interface PlanStep {
  choice: BuildChoice;
  label: string;
  /** Turn (relative to now) on which the item finished, if it did. */
  completedOnTurn: number | null;
}

export interface Plan {
  steps: PlanStep[];
  score: number;
  finalYields: Yields;
  pop: number;
}

const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};

function objectiveScore(state: GameState, cityId: number, objective: Objective): number {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return -Infinity;
  const stats = computeCityStats(state, city);
  if (objective === 'food') return city.population * 10 + stats.total.food;
  if (objective === 'balanced') {
    let s = city.population * 3;
    for (const [k, w] of Object.entries(BALANCED_WEIGHTS)) {
      s += stats.total[k as YieldKey] * (w ?? 0);
    }
    return s;
  }
  return stats.total[objective];
}

interface Node {
  state: GameState;
  turnsUsed: number;
  steps: PlanStep[];
  terminal: boolean;
}

function clone(state: GameState): GameState {
  return deserialize(serialize(state));
}

function applyChoice(state: GameState, cityId: number, choice: BuildChoice): boolean {
  if (choice.kind === 'building') return queueBuilding(state, cityId, choice.id).ok;
  if (choice.kind === 'district') return queueDistrict(state, cityId, choice.type, choice.tileIndex).ok;
  if (choice.kind === 'wonder') return queueWonder(state, cityId, choice.wonder, choice.tileIndex).ok;
  return true;
}

/** Run turns until the city's queue empties or the budget runs out. */
function simulateUntilQueueDone(node: Node, cityId: number, horizon: number): number | null {
  const city = () => node.state.cities.find((c) => c.id === cityId)!;
  let completedOn: number | null = null;
  while (node.turnsUsed < horizon) {
    endTurn(node.state);
    node.turnsUsed++;
    if (city().queue.length === 0) {
      completedOn = node.turnsUsed;
      break;
    }
  }
  return completedOn;
}

export function searchBuildOrder(
  state: GameState,
  cityId: number,
  opts: PlannerOptions,
): Plan[] {
  const beamWidth = opts.beamWidth ?? 4;
  const branch = opts.branch ?? 5;
  const maxDepth = opts.maxDepth ?? 4;

  // Root: real rules, empty queue.
  const rootState = clone(state);
  rootState.sandbox = false;
  {
    const city = rootState.cities.find((c) => c.id === cityId);
    if (!city) return [];
    while (city.queue.length > 0) cancelQueueItem(rootState, cityId, 0);
  }

  let beam: Node[] = [{ state: rootState, turnsUsed: 0, steps: [], terminal: false }];
  const finished: Node[] = [];

  for (let depth = 0; depth < maxDepth && beam.length > 0; depth++) {
    const nextBeam: Node[] = [];
    for (const node of beam) {
      if (node.terminal) {
        finished.push(node);
        continue;
      }
      const candidates = compareCandidates(node.state, cityId)
        .filter((c) => c.kind !== 'none')
        .slice(0, branch);
      if (candidates.length === 0) {
        finished.push({ ...node, terminal: true });
        continue;
      }
      for (const choice of candidates) {
        const child: Node = {
          state: clone(node.state),
          turnsUsed: node.turnsUsed,
          steps: [...node.steps],
          terminal: false,
        };
        if (!applyChoice(child.state, cityId, choice)) continue;
        const completedOn = simulateUntilQueueDone(child, cityId, opts.horizon);
        child.steps.push({ choice, label: choiceLabel(choice), completedOnTurn: completedOn });
        child.terminal = child.turnsUsed >= opts.horizon;
        nextBeam.push(child);
      }
    }
    nextBeam.sort(
      (a, b) => objectiveScore(b.state, cityId, opts.objective) - objectiveScore(a.state, cityId, opts.objective),
    );
    beam = nextBeam.slice(0, beamWidth);
  }
  finished.push(...beam);

  // Idle out the remaining turns so every plan is scored at the same horizon.
  const plans: Plan[] = [];
  const seen = new Set<string>();
  for (const node of finished) {
    while (node.turnsUsed < opts.horizon) {
      endTurn(node.state);
      node.turnsUsed++;
    }
    const key = node.steps.map((s) => s.label).join('→');
    if (seen.has(key)) continue;
    seen.add(key);
    const city = node.state.cities.find((c) => c.id === cityId)!;
    plans.push({
      steps: node.steps,
      score: objectiveScore(node.state, cityId, opts.objective),
      finalYields: computeCityStats(node.state, city).total,
      pop: city.population,
    });
  }
  return plans.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** Queue a plan's steps in order on the live state. Returns how many were queued. */
export function adoptPlan(
  state: GameState,
  cityId: number,
  plan: Plan,
): { adopted: number; reason?: string } {
  let adopted = 0;
  for (const step of plan.steps) {
    if (!applyChoice(state, cityId, step.choice)) {
      return { adopted, reason: `Could not queue ${step.label} (conditions changed).` };
    }
    adopted++;
  }
  return { adopted };
}
