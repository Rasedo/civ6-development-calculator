import type { City, GameState, QueueItem } from './types';
import { seatOf } from './seats';
import { UNITS, ENCAMPMENT_HP, WALLS_HP } from '../data/units';
import { PROJECTS, PROJECT_YIELD_FRACTION, gpClassesOf, gppFractionOf } from '../data/projects';
import { DED_MONUMENTALITY, ERA_SCORE_WONDER } from '../data/seats';
import { addEraScore, dedicationEvent } from './eras';
import { spawnUnit } from './units';
import { encampmentTrainXp } from './combat';
import { applyLumpYield } from './economy';

export function completeProject(state: GameState, city: City, projectId: string, cost: number): void {
  const def = PROJECTS[projectId];
  if (!def) return;
  const owner = seatOf(state, city.seat);
  if (!owner) return;

  if (def.space) {
    if (!owner.spaceProjects.includes(projectId)) owner.spaceProjects.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    if (def.victory) {
      state.victoryType = 3;
      state.victoryRow = city.seat;
      state.gameOver = true;
      state.eventLog.push('Science Victory! The Exoplanet Expedition has launched.');
    }
    return;
  }
  if (def.yield) {
    const amount = Math.round(cost * PROJECT_YIELD_FRACTION);
    applyLumpYield(state, city.centerIndex, { key: def.yield, amount }, city.seat);
    state.eventLog.push(`${city.name} completed ${def.name}: +${amount} ${def.yield}.`);
  }
  const classes = gpClassesOf(def);
  if (classes.length) {
    const pts = Math.round(cost * gppFractionOf(def));
    for (const gc of classes) {
      owner.gpp[gc] = (owner.gpp[gc] ?? 0) + pts;
    }
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

export function completeQueueItem(
  state: GameState,
  city: City,
  item: QueueItem,
  cost: number,
): void {
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  switch (item.kind) {
    case 'district': {
      const dt = state.map.tiles[item.tileIndex];
      dt.districtComplete = true;
      if (dt.district !== 'CITY_CENTER') dedicationEvent(state, city.seat, DED_MONUMENTALITY);
      if (dt.district === 'ENCAMPMENT') dt.encampHp = ENCAMPMENT_HP;
      break;
    }
    case 'wonder':
      state.map.tiles[item.tileIndex].builtWonderComplete = true;
      addEraScore(state, city.seat, ERA_SCORE_WONDER);
      break;
    case 'settler':
      // Real Civ 6: a completed Settler costs the city 1 pop and SPAWNS at
      // the city — a unit like any other, moved and founded by orders.
      spawnUnit(state, 'SETTLER', city.centerIndex, city.seat);
      city.population = Math.max(1, city.population - 1);
      break;
    case 'unit': {
      const trained = spawnUnit(state, item.unit, city.centerIndex, city.seat);
      if (trained && (UNITS[item.unit]?.combat ?? 0) > 0) {
        const xp = encampmentTrainXp(city.buildings);
        if (xp > 0) trained.xp = xp;
      }
      if (item.unit === 'BUILDER') owner.buildersTrained += 1;
      break;
    }
    case 'project':
      completeProject(state, city, item.project, cost);
      break;
    case 'building':
      city.buildings.push(item.building);
      if (item.building === 'ANCIENT_WALLS') city.outerHp = WALLS_HP;
      break;
  }
}
