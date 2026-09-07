/**
 * THE THREE DECOMMISSION PROJECTS. CIV6 (Expansion2_Projects.xml): Cost 400
 * apiece, PrereqDistrict DISTRICT_INDUSTRIAL_ZONE, `UnlocksFromEffect` — the
 * CLIMATE ACCORDS competition is the effect that opens them — and each one's
 * `Project_BuildingCosts` row names the plant it CONSUMES.
 *
 * CIV6 (Expansion2_Emergencies.xml,
 * CLIMATE_ACCORDS_SCORE_DECOMMISSION_{COAL,OIL,NUCLEAR}): `ScoreAmount` 100
 * apiece, `FromProject` the decommission row.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { availableProjects } from '../../../cpu/core/game';
import { completeProject } from '../../../cpu/core/production';
import { startCompetition } from '../../../cpu/core/competition';
import { PROJECTS } from '../../../cpu/data/projects';
import { COMPETITION_CLIMATE, COMPETITION_DECOMMISSION_SCORE } from '../../../cpu/data/seats';
import { GAME_SPEED } from '../../../cpu/data/constants';
import type { City, GameState } from '../../../cpu/core/types';

const ROWS = [
  ['DECOMMISSION_COAL_POWER_PLANT', 'COAL_POWER_PLANT'],
  ['DECOMMISSION_OIL_POWER_PLANT', 'OIL_POWER_PLANT'],
  ['DECOMMISSION_NUCLEAR_POWER_PLANT', 'NUCLEAR_POWER_PLANT'],
] as const;

function scene(plant: string): { state: GameState; city: City } {
  const state = makeState(makeMap(16, 16));
  const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  grantTechs(state, 'INDUSTRIALIZATION');
  const iz = tileAtCoords(state.map, 7, 6);
  iz.district = 'INDUSTRIAL_ZONE';
  iz.districtComplete = true;
  city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: iz.index });
  city.buildings.push('FACTORY', plant);
  return { state, city };
}

describe('the decommission projects', () => {
  it('carry the install cost and the plant each one consumes', () => {
    for (const [id, plant] of ROWS) {
      const p = PROJECTS[id];
      expect(p).toBeTruthy();
      // the catalog scales every published cost by GAME_SPEED, as `P()` does
      expect(p.cost).toBe(Math.round(400 * GAME_SPEED));
      expect(p.district).toBe('INDUSTRIAL_ZONE');
      expect(p.consumesBuilding).toBe(plant);
      expect(p.accordsOnly).toBe(true);
    }
    expect(COMPETITION_DECOMMISSION_SCORE).toBe(100);
  });

  it('are offered only while a CLIMATE ACCORDS competition runs', () => {
    const { state, city } = scene('COAL_POWER_PLANT');
    const offered = () => availableProjects(state, city).map((p) => p.id);
    expect(offered()).not.toContain('DECOMMISSION_COAL_POWER_PLANT');

    startCompetition(state, COMPETITION_CLIMATE, [0]);
    expect(offered()).toContain('DECOMMISSION_COAL_POWER_PLANT');
    // ...and only the row whose plant is standing here
    expect(offered()).not.toContain('DECOMMISSION_OIL_POWER_PLANT');

    delete state.competition;
    expect(offered()).not.toContain('DECOMMISSION_COAL_POWER_PLANT');
  });

  it('removes the plant, its reactor age, and scores the Accords', () => {
    const { state, city } = scene('NUCLEAR_POWER_PLANT');
    city.reactorAge = 17;
    startCompetition(state, COMPETITION_CLIMATE, [0]);
    const before = state.competition!.score[0];

    completeProject(state, city, 'DECOMMISSION_NUCLEAR_POWER_PLANT', 0);
    expect(city.buildings).not.toContain('NUCLEAR_POWER_PLANT');
    expect(city.reactorAge).toBeUndefined();
    expect(state.competition!.score[0]).toBe(before + COMPETITION_DECOMMISSION_SCORE);
    expect(seatOf(state, 0)).toBeTruthy();
  });

  it('scores nobody outside the competition field', () => {
    const { state, city } = scene('COAL_POWER_PLANT');
    startCompetition(state, COMPETITION_CLIMATE, []); // nobody voted in
    const before = state.competition!.score[0];
    completeProject(state, city, 'DECOMMISSION_COAL_POWER_PLANT', 0);
    expect(city.buildings).not.toContain('COAL_POWER_PLANT');
    expect(state.competition!.score[0]).toBe(before);
  });
});
