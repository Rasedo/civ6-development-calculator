import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn, availableProjects } from '../../../cpu/core/game';
import { queueSeatProject } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { SPACE_PROJECTS } from '../../../cpu/data/projects';

// space race / science victory. Gated on Information/Future techs, so no gate
// lane reaches it and these pokes are the only proof of the semantics. The GPU
// twin is tests/gpu/space_race_test.py.

function newGameWithCampus(opponents = 0) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  const city = seatOf(state, 0)!.cities[0];
  // Give the city a completed Campus (the Spaceport proxy).
  const dtile = city.centerIndex + 1;
  city.districts.push({ type: 'CAMPUS', tileIndex: dtile });
  state.map.tiles[dtile].districtComplete = true;
  return { state, city };
}

const CHAIN = SPACE_PROJECTS.map((p) => p.id);
const GATING_TECHS = ['ROCKETRY', 'SATELLITES', 'NANOTECHNOLOGY', 'SMART_MATERIALS'];

describe('science victory', () => {
  it('space projects are catalog-complete and end in a victory step', () => {
    expect(CHAIN.length).toBe(4);
    expect(CHAIN[CHAIN.length - 1]).toBe('EXOPLANET_EXPEDITION');
    expect(SPACE_PROJECTS[SPACE_PROJECTS.length - 1].victory).toBe(true);
  });

  it('gates each step on its tech AND the previous step (sequence)', () => {
    const { state, city } = newGameWithCampus();
    // No gating techs yet: no space project is available.
    expect(availableProjects(state, city).some((p) => p.space)).toBe(false);

    // All techs, but nothing completed: only step 1 (no requiresProject) is open.
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    let avail = availableProjects(state, city).filter((p) => p.space).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_EARTH_SATELLITE']);

    // Complete step 1 by hand: step 2 opens, step 1 is now one-time-consumed.
    seatOf(state, 0)!.spaceProjects = ['LAUNCH_EARTH_SATELLITE'];
    avail = availableProjects(state, city).filter((p) => p.space).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_MOON_LANDING']);
  });

  it('the WIRE applier queues a space step — a recorded column must not be dropped', () => {
    const { state, city } = newGameWithCampus();
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    expect(queueSeatProject(state, city, 'LAUNCH_EARTH_SATELLITE')).toBe(true);
    expect(city.queue[0]).toMatchObject({ kind: 'project', project: 'LAUNCH_EARTH_SATELLITE' });
    // and the chain still gates it: step 2 is refused until step 1 is DONE.
    const later = newGameWithCampus();
    seatOf(later.state, 0)!.research.techs.push(...GATING_TECHS);
    expect(queueSeatProject(later.state, later.city, 'LAUNCH_MOON_LANDING')).toBe(false);
  });

  it('completing the whole chain sets victoryType 3, won by the launching seat', () => {
    const { state, city } = newGameWithCampus();
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    for (const id of CHAIN) {
      // Drive completion through the real endTurn queue path (progress pre-filled).
      city.queue = [{ kind: 'project', project: id, progress: 100000, cost: 1 }];
      endTurn(state);
      expect(seatOf(state, 0)!.spaceProjects).toContain(id);
    }
    expect(state.victoryType).toBe(3);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('a civ finishing the race first wins the SAME way — only the victor differs', () => {
    const { state } = newGameWithCampus(1);
    const civCity = (state.seats[(0) + 1] as Seat).cities[0];
    civCity.queue = [{ kind: 'project', project: 'EXOPLANET_EXPEDITION', progress: 100000, cost: 1 }];
    endTurn(state);
    expect(state.victoryType).toBe(3);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });
});
