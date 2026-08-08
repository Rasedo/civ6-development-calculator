/**
 * PRODUCTION PAYOUT — what a finished queue item does.
 *
 * One implementation for every seat: the city carries its owner in `city.seat`,
 * so nothing here asks which seat is building. Kept in its own module because
 * both the turn loop and the scripted phase complete items, and neither should
 * have to import the other.
 */
import type { City, GameState, QueueItem } from './types';
import { seatOf } from './seats';
import { UNITS, ENCAMPMENT_HP, WALLS_HP } from '../data/units';
import { PROJECTS, PROJECT_YIELD_FRACTION, gpClassesOf, gppFractionOf } from '../data/projects';
import { DED_MONUMENTALITY, ERA_SCORE_WONDER } from '../data/seats';
import { addEraScore, dedicationEvent } from './eras';
import { spawnUnit } from './units';
import { encampmentTrainXp } from './combat';
import { applyLumpYield } from './economy';

/**
 * A finished PROJECT pays out, for whichever seat owns the city.
 *
 * `victoryType` is reported from seat 0's point of view — 3 when seat 0
 * launches, 4 when anyone else does (seat 0 has lost the race) — because the
 * field is an observation of seat 0's outcome, not a property of the winner.
 */
export function completeProject(state: GameState, city: City, projectId: string, cost: number): void {
  const seat = city.seat;
  const def = PROJECTS[projectId];
  if (!def) return;
  const owner = seatOf(state, city.seat);
  if (!owner) return;

  // Space-race step: record chain progress; the final step ends the game.
  if (def.space) {
    if (!owner.spaceProjects.includes(projectId)) owner.spaceProjects.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    if (def.victory) {
      state.victoryType = city.seat === seat ? 3 : 4;
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
  // Pay EVERY class the project lists (the Festival pays three), each at the
  // project's own rate.
  const classes = gpClassesOf(def);
  if (classes.length) {
    const pts = Math.round(cost * gppFractionOf(def));
    for (const gc of classes) {
      owner.gpp[gc] = (owner.gpp[gc] ?? 0) + pts;
    }
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

/**
 * A finished queue item takes effect, for whichever seat owns the city.
 *
 * `cost` is the item's paid cost — projects scale their payout by it. Founding
 * is NOT done here: completion spawns the SETTLER unit, and a FOUND order
 * decides where it goes.
 */
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
      // MONUMENTALITY pays era score per SPECIALTY district (the centre is not one).
      if (dt.district !== 'CITY_CENTER') dedicationEvent(state, city.seat, DED_MONUMENTALITY);
      // A completed ENCAMPMENT musters its garrison.
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
      // A trained MILITARY unit inherits the city's Encampment training XP.
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
      // Completing the walls fills the outer-defense pool.
      if (item.building === 'ANCIENT_WALLS') city.outerHp = WALLS_HP;
      break;
  }
}
