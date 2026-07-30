import { describe, it, expect } from 'vitest';
import type { RivalCiv } from '../src/core/types';
import { playerSeat } from '../src/core/seats';
import { createGame, endTurn, foundCity, availableProjects } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { SPACE_PROJECTS } from '../src/data/projects';

// B-25 space race / science victory. Structurally unreachable in the 100-turn
// scripted parity gate (gated on Information/Future techs), so these focused
// pokes pin the semantics the rollout can't reach. The GPU space-race
// SIMULATION is deferred (see gpu/ROUND_B2_LOG.md) — the chain lives in TS.

function newGameWithCampus(rivals = 0) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, rivals,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  const city = state.cities[0];
  // Give the city a completed Campus (the Spaceport proxy).
  const dtile = city.centerIndex + 1;
  city.districts.push({ type: 'CAMPUS', tileIndex: dtile });
  state.map.tiles[dtile].districtComplete = true;
  return { state, city };
}

const CHAIN = SPACE_PROJECTS.map((p) => p.id);
const GATING_TECHS = ['ROCKETRY', 'SATELLITES', 'NANOTECHNOLOGY', 'NUCLEAR_FUSION', 'ROBOTICS', 'OFFWORLD_MISSION'];

describe('B-25 science victory', () => {
  it('space projects are catalog-complete and end in a victory step', () => {
    expect(CHAIN.length).toBe(6);
    expect(CHAIN[CHAIN.length - 1]).toBe('EXOPLANET_EXPEDITION');
    expect(SPACE_PROJECTS[SPACE_PROJECTS.length - 1].victory).toBe(true);
  });

  it('gates each step on its tech AND the previous step (sequence)', () => {
    const { state, city } = newGameWithCampus();
    // No gating techs yet: no space project is available.
    expect(availableProjects(state, city).some((p) => p.space)).toBe(false);

    // All techs, but nothing completed: only step 1 (no requiresProject) is open.
    playerSeat(state).research.techs.push(...GATING_TECHS);
    let avail = availableProjects(state, city).filter((p) => p.space).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_EARTH_SATELLITE']);

    // Complete step 1 by hand: step 2 opens, step 1 is now one-time-consumed.
    state.spaceProjects = ['LAUNCH_EARTH_SATELLITE'];
    avail = availableProjects(state, city).filter((p) => p.space).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_MOON_LANDING']);
  });

  it('completing the whole chain sets victoryType 3 (player science win)', () => {
    const { state, city } = newGameWithCampus();
    playerSeat(state).research.techs.push(...GATING_TECHS);
    for (const id of CHAIN) {
      // Drive completion through the real endTurn queue path (progress pre-filled).
      city.queue = [{ kind: 'project', project: id, progress: 100000, cost: 1 }];
      endTurn(state);
      expect(state.spaceProjects).toContain(id);
    }
    expect(state.victoryType).toBe(3);
    expect(state.gameOver).toBe(true);
  });

  it('a rival finishing the race first is a science DEFEAT (victoryType 4)', () => {
    const { state } = newGameWithCampus(1);
    const rc = (state.seats[(0) + 1] as RivalCiv).cities[0];
    rc.queue = [{ kind: 'project', project: 'EXOPLANET_EXPEDITION', progress: 100000, cost: 1 }];
    endTurn(state);
    expect(state.victoryType).toBe(4);
    expect(state.gameOver).toBe(true);
  });
});
