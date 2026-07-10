import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, grantCivics } from './helpers';
import { foundCity, queueSettler, settlerCost, endTurn, itemLabel } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { searchEmpirePlan, adoptEmpirePlan } from '../src/core/empirePlanner';

describe('settlers', () => {
  it('cost rises with empire size; completion adds stock; founding consumes it', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 6, 9).index).city!;
    expect(settlerCost(state)).toBe(48); // D-15: 80 × GAME_SPEED

    // second city needs a settler outside sandbox
    expect(foundCity(state, tileAtCoords(state.map, 12, 9).index).ok).toBe(false);

    expect(queueSettler(state, a.id).ok).toBe(true);
    expect(settlerCost(state)).toBe(66); // queued settler raises the next price (+18)
    const prod = computeCityStats(state, a).total.production;
    const turns = Math.ceil(48 / prod);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(state.settlers).toBe(1);

    expect(foundCity(state, tileAtCoords(state.map, 12, 9).index).ok).toBe(true);
    expect(state.settlers).toBe(0);
    expect(state.cities.length).toBe(2);
  });

  it('planned settles auto-found when a settler completes', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 6, 9).index).city!;
    const target = tileAtCoords(state.map, 12, 9).index;
    queueSettler(state, a.id);
    state.plannedSettles.push(target);
    for (let i = 0; i < 40 && state.cities.length < 2; i++) endTurn(state);
    expect(state.cities.length).toBe(2);
    expect(state.cities[1].centerIndex).toBe(target);
    expect(state.plannedSettles.length).toBe(0);
  });
});

describe('empire planner', () => {
  it('plans across cities and can include settling; adoption queues everything', () => {
    const state = makeState(makeMap(24, 20));
    foundCity(state, tileAtCoords(state.map, 7, 9).index);
    grantTechs(state, 'POTTERY', 'WRITING');
    grantCivics(state, 'CODE_OF_LAWS');

    const plans = searchEmpirePlan(state, { horizon: 40, objective: 'balanced' });
    expect(plans.length).toBeGreaterThan(0);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i - 1].score + 1e-9).toBeGreaterThanOrEqual(plans[i].score);
    }
    expect(plans[0].steps.length).toBeGreaterThan(0);
    // live state untouched by the search
    expect(state.turn).toBe(1);
    expect(state.cities.length).toBe(1);

    const adoptable = plans.find((p) =>
      p.steps.every((s) => state.cities.some((c) => c.id === s.cityId)),
    );
    if (adoptable) {
      const r = adoptEmpirePlan(state, adoptable);
      expect(r.adopted).toBeGreaterThan(0);
      const queued = state.cities.flatMap((c) => c.queue.map(itemLabel));
      const settlerSteps = adoptable.steps.filter((s) => s.choice.kind === 'settler').length;
      expect(queued.length + 0).toBe(adoptable.steps.length);
      expect(state.plannedSettles.length).toBe(settlerSteps);
    }
  });

  it('is deterministic', () => {
    const state = makeState(makeMap(20, 20));
    foundCity(state, tileAtCoords(state.map, 9, 9).index);
    grantTechs(state, 'POTTERY');
    const a = searchEmpirePlan(state, { horizon: 25, objective: 'science' });
    const b = searchEmpirePlan(state, { horizon: 25, objective: 'science' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('food objective on an open map favors expansion (settler steps appear)', () => {
    const state = makeState(makeMap(26, 22));
    foundCity(state, tileAtCoords(state.map, 8, 10).index);
    const plans = searchEmpirePlan(state, { horizon: 50, objective: 'food', maxDecisions: 4 });
    const anySettler = plans.some((p) => p.steps.some((s) => s.choice.kind === 'settler'));
    expect(anySettler).toBe(true);
  });
});
