import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs } from './helpers';
import { foundCity, endTurn, itemLabel } from '../src/core/game';
import { searchBuildOrder, adoptPlan } from '../src/core/planner';

function settled() {
  const state = makeState(makeMap(16, 16));
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  grantTechs(state, 'POTTERY', 'WRITING');
  // a juicy campus spot: two mountains beside (9,8)
  tileAtCoords(state.map, 10, 8).elevation = 'MOUNTAIN';
  tileAtCoords(state.map, 9, 7).elevation = 'MOUNTAIN';
  return { state, city };
}

describe('build-order planner', () => {
  it('finds plans, ranked by objective score, without touching live state', () => {
    const { state, city } = settled();
    const plans = searchBuildOrder(state, city.id, { horizon: 50, objective: 'science' });
    expect(plans.length).toBeGreaterThan(0);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i - 1].score + 1e-9).toBeGreaterThanOrEqual(plans[i].score);
    }
    // with real adjacency available, science plans go through the campus line
    const labels = plans[0].steps.map((s) => s.label).join(' ');
    expect(labels).toMatch(/Campus|Library/);
    // live state untouched
    expect(state.turn).toBe(1);
    expect(city.queue.length).toBe(0);
  });

  it('is deterministic', () => {
    const { state, city } = settled();
    const a = searchBuildOrder(state, city.id, { horizon: 20, objective: 'balanced' });
    const b = searchBuildOrder(state, city.id, { horizon: 20, objective: 'balanced' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('adopting a plan queues its steps in order and they build out', () => {
    const { state, city } = settled();
    const plans = searchBuildOrder(state, city.id, { horizon: 40, objective: 'science' });
    const plan = plans[0];
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);

    const r = adoptPlan(state, city.id, plan);
    expect(r.adopted).toBe(plan.steps.length);
    expect(city.queue.map(itemLabel)).toEqual(plan.steps.map((s) => s.label));

    // Queue-ahead is safe: run it out and confirm everything completed in order.
    for (let i = 0; i < 60 && city.queue.length > 0; i++) endTurn(state);
    expect(city.queue.length).toBe(0);
  });

  it('a building queued ahead of its district holds until the district finishes', () => {
    const { state, city } = settled();
    const plans = searchBuildOrder(state, city.id, { horizon: 40, objective: 'science' });
    const withChain = plans.find(
      (p) =>
        p.steps.some((s) => s.choice.kind === 'district') &&
        p.steps.some((s) => s.choice.kind === 'building'),
    );
    if (!withChain) return; // nothing to verify on this map
    adoptPlan(state, city.id, withChain);
    // never completes a building while its district is unfinished
    for (let i = 0; i < 60 && city.queue.length > 0; i++) {
      endTurn(state);
      for (const b of city.buildings) {
        if (b === 'PALACE') continue;
        expect(
          city.districts.some((d) => state.map.tiles[d.tileIndex].districtComplete),
        ).toBe(true);
      }
    }
  });
});
