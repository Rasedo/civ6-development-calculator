/**
 * Empire-wide build & settle planning: event-driven beam search. Whenever a
 * city's queue runs dry the search branches on that city's options — which
 * include training a settler aimed at the best settle site (auto-founded by
 * the turn loop when it completes). New cities join the decision process
 * automatically.
 */

import type { GameState, Yields, YieldKey } from './types';
import { serialize, deserialize, endTurn, queueDistrict, queueBuilding, queueWonder, queueSettler, cancelQueueItem } from './game';
import { computeCityStats } from './city';
import { compareCandidates, choiceLabel, scoreSettleSites, type BuildChoice } from './advisor';
import type { Objective } from './planner';

export type EmpireChoice = BuildChoice | { kind: 'settler'; tileIndex: number };

export interface EmpirePlanStep {
  cityId: number;
  cityName: string;
  choice: EmpireChoice;
  label: string;
  /** Turn (relative to now) on which the decision was taken. */
  decidedOnTurn: number;
}

export interface EmpirePlan {
  steps: EmpirePlanStep[];
  score: number;
  cities: number;
  totalPop: number;
  empireYields: Yields;
}

export interface EmpirePlannerOptions {
  horizon: number;
  objective: Objective;
  beamWidth?: number;
  branch?: number;
  maxDecisions?: number;
}

const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};

export function empireScore(state: GameState, objective: Objective): number {
  let score = 0;
  for (const city of state.cities) {
    const stats = computeCityStats(state, city);
    if (objective === 'food') {
      score += city.population * 10 + stats.total.food;
    } else if (objective === 'balanced') {
      score += city.population * 3;
      for (const [k, w] of Object.entries(BALANCED_WEIGHTS)) {
        score += stats.total[k as YieldKey] * (w ?? 0);
      }
    } else {
      score += stats.total[objective] + city.population; // pop tiebreak keeps expansion honest
    }
  }
  return score;
}

function empireYields(state: GameState): Yields {
  const out: Yields = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
  for (const city of state.cities) {
    const stats = computeCityStats(state, city);
    for (const k of Object.keys(out) as YieldKey[]) out[k] += stats.total[k];
  }
  return out;
}

function clone(state: GameState): GameState {
  return deserialize(serialize(state));
}

function stepLabel(state: GameState, choice: EmpireChoice): string {
  if (choice.kind === 'settler') {
    const t = state.map.tiles[choice.tileIndex];
    return `Settler → (${t.col}, ${t.row})`;
  }
  return choiceLabel(choice);
}

function applyEmpireChoice(state: GameState, cityId: number, choice: EmpireChoice): boolean {
  switch (choice.kind) {
    case 'settler': {
      const r = queueSettler(state, cityId);
      if (r.ok) state.plannedSettles.push(choice.tileIndex);
      return r.ok;
    }
    case 'building':
      return queueBuilding(state, cityId, choice.id).ok;
    case 'district':
      return queueDistrict(state, cityId, choice.type, choice.tileIndex).ok;
    case 'wonder':
      return queueWonder(state, cityId, choice.wonder, choice.tileIndex).ok;
    case 'none':
      return true;
  }
}

/** First city (lowest id) with an empty queue, or null. */
function idleCity(state: GameState): number | null {
  for (const c of [...state.cities].sort((a, b) => a.id - b.id)) {
    if (c.queue.length === 0) return c.id;
  }
  return null;
}

interface Node {
  state: GameState;
  turnsUsed: number;
  steps: EmpirePlanStep[];
}

export function searchEmpirePlan(state: GameState, opts: EmpirePlannerOptions): EmpirePlan[] {
  const beamWidth = opts.beamWidth ?? 4;
  const branch = opts.branch ?? 5;
  const maxDecisions = opts.maxDecisions ?? 8;

  const root = clone(state);
  root.sandbox = false;
  root.plannedSettles = [];
  for (const c of root.cities) {
    while (c.queue.length > 0) cancelQueueItem(root, c.id, 0);
  }
  if (root.cities.length === 0) return [];

  let beam: Node[] = [{ state: root, turnsUsed: 0, steps: [] }];
  const finished: Node[] = [];

  for (let depth = 0; depth < maxDecisions && beam.length > 0; depth++) {
    const nextBeam: Node[] = [];
    for (const node of beam) {
      // Run time forward until some city needs a decision (or horizon).
      let cityId = idleCity(node.state);
      while (cityId === null && node.turnsUsed < opts.horizon) {
        endTurn(node.state);
        node.turnsUsed++;
        cityId = idleCity(node.state);
      }
      if (cityId === null || node.turnsUsed >= opts.horizon) {
        finished.push(node);
        continue;
      }

      const options: EmpireChoice[] = compareCandidates(node.state, cityId)
        .filter((c) => c.kind !== 'none')
        .slice(0, branch);
      // Settling is always on the table while good sites exist.
      const sites = scoreSettleSites(node.state, 1);
      if (sites.length > 0) {
        options.push({ kind: 'settler', tileIndex: sites[0].tileIndex });
      }
      if (options.length === 0) {
        // Nothing to do in this city: idle it one turn and requeue the node.
        endTurn(node.state);
        node.turnsUsed++;
        nextBeam.push(node);
        continue;
      }

      for (const choice of options) {
        const child: Node = {
          state: clone(node.state),
          turnsUsed: node.turnsUsed,
          steps: [...node.steps],
        };
        if (!applyEmpireChoice(child.state, cityId, choice)) continue;
        const city = child.state.cities.find((c) => c.id === cityId)!;
        child.steps.push({
          cityId,
          cityName: city.name,
          choice,
          label: stepLabel(child.state, choice),
          decidedOnTurn: child.turnsUsed,
        });
        nextBeam.push(child);
      }
    }
    nextBeam.sort((a, b) => empireScore(b.state, opts.objective) - empireScore(a.state, opts.objective));
    beam = nextBeam.slice(0, beamWidth);
  }
  finished.push(...beam);

  const plans: EmpirePlan[] = [];
  const seen = new Set<string>();
  for (const node of finished) {
    while (node.turnsUsed < opts.horizon) {
      endTurn(node.state);
      node.turnsUsed++;
    }
    const key = node.steps.map((s) => `${s.cityId}:${s.label}`).join('→');
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({
      steps: node.steps,
      score: empireScore(node.state, opts.objective),
      cities: node.state.cities.length,
      totalPop: node.state.cities.reduce((s, c) => s + c.population, 0),
      empireYields: empireYields(node.state),
    });
  }
  return plans.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Queue an empire plan on the live state: clears every queue and planned
 * settle, then queues each step to its city in order.
 */
export function adoptEmpirePlan(
  state: GameState,
  plan: EmpirePlan,
): { adopted: number; reason?: string } {
  for (const c of state.cities) {
    while (c.queue.length > 0) cancelQueueItem(state, c.id, 0);
  }
  state.plannedSettles = [];
  let adopted = 0;
  for (const step of plan.steps) {
    if (!state.cities.some((c) => c.id === step.cityId)) {
      // City founded mid-plan: its build steps happen after the settle fires;
      // we can't pre-queue them, so adoption stops here.
      return { adopted, reason: `${step.cityName} doesn't exist yet — re-plan after it's founded.` };
    }
    if (!applyEmpireChoice(state, step.cityId, step.choice)) {
      return { adopted, reason: `Could not queue ${step.label} (conditions changed).` };
    }
    adopted++;
  }
  return { adopted };
}
