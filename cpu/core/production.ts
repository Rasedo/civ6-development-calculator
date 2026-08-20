import type { City, GameState, Seat } from './types';
import type { QueueItem } from './types';
import { seatOf } from './seats';
import { availableCivicsIn, availableTechsIn } from './effects';
import { completedWonders, seatWonderFlag } from './wonders';
import { UNITS, ENCAMPMENT_HP, WALLS_HP } from '../data/units';
import { PROJECTS, PROJECT_YIELD_FRACTION, gpClassesOf, gppFractionOf } from '../data/projects';
import { DED_MONUMENTALITY, ERA_SCORE_WONDER } from '../data/seats';
import { addEraScore, buildingDedications, dedicationEvent } from './eras';
import { spawnUnit } from './units';
import { encampmentTrainXp } from './combat';
import { applyLumpYield } from './economy';
import { congressGppFactor } from './congress';
import { BUILT_WONDERS } from '../data/builtWonders';

/** Complete `n` techs or civics outright. Real Civ 6 draws them at random;
 *  this takes the first AVAILABLE rows in catalog order, the same order every
 *  other unresearched-row walk uses. */
function grantFreeResearch(owner: Seat, kind: 'tech' | 'civic', n: number): void {
  const rsr = owner.research;
  for (let i = 0; i < n; i++) {
    const next = kind === 'tech' ? availableTechsIn(rsr)[0] : availableCivicsIn(rsr)[0];
    if (!next) return; // the tree is exhausted
    if (kind === 'tech') {
      rsr.techs.push(next.id);
      delete rsr.techRetained[next.id];
      if (rsr.tech === next.id) rsr.tech = null;
    } else {
      rsr.civics.push(next.id);
      delete rsr.civicRetained[next.id];
      if (rsr.civic === next.id) rsr.civic = null;
    }
  }
}

export function completeProject(state: GameState, city: City, projectId: string, cost: number, sciPerTurn = 0): void {
  const def = PROJECTS[projectId];
  if (!def) return;
  const owner = seatOf(state, city.seat);
  if (!owner) return;

  if (def.laser) {
    // Repeatable: each station speeds the Exoplanet craft by +1 LY/turn.
    owner.spaceLasers = (owner.spaceLasers ?? 0) + 1;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.space) {
    if (!owner.spaceProjects.includes(projectId)) owner.spaceProjects.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    // The sourced side effects, per step (Launch Mars Colony has none — it
    // exists to open the expedition).
    if (projectId === 'LAUNCH_EARTH_SATELLITE' && state.fogOfWar) {
      // CIV6: reveals the entire map. Same fog gate as `revealAround` — a
      // fog-off world accrues no explored state on either engine.
      owner.explored = new Array(state.map.tiles.length).fill(1);
    }
    if (projectId === 'LAUNCH_MOON_LANDING') {
      // CIV6: a one-time Culture lump of 10x the seat's science per turn —
      // measured on the seat-phase-top city-stats snapshot the caller holds.
      applyLumpYield(state, city.centerIndex, { key: 'culture', amount: Math.round(10 * sciPerTurn) }, city.seat);
    }
    if (def.victory) {
      // CIV6: completing the Exoplanet Expedition LAUNCHES the craft; the
      // win fires when it arrives (the endTurn flight tick).
      owner.spaceLy = 0;
      state.eventLog.push('The Exoplanet Expedition has launched.');
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
      owner.gpp[gc] = (owner.gpp[gc] ?? 0) + pts * congressGppFactor(state, gc);
    }
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

export function completeQueueItem(
  state: GameState,
  city: City,
  item: QueueItem,
  cost: number,
  sciPerTurn = 0,
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
    case 'wonder': {
      state.map.tiles[item.tileIndex].builtWonderComplete = true;
      addEraScore(state, city.seat, ERA_SCORE_WONDER);
      const fx = BUILT_WONDERS[item.wonder]?.effects;
      // CIV6: Statue of Liberty pays +4 Diplomatic Victory points on
      // completion, Potala Palace +1.
      if (fx?.dvp) owner.diplomaticPoints = (owner.diplomaticPoints ?? 0) + fx.dvp;
      // CIV6 (Big Ben): the treasury is multiplied once, at completion.
      if (fx?.treasuryMult) owner.treasury *= fx.treasuryMult;
      // CIV6 (Apadana): +2 envoys each time ANY wonder completes in its city,
      // itself included — so the count is read AFTER this tile went complete.
      const envoys = completedWonders(state, city).reduce((n, w) => n + (w.def.effects?.envoysPerWonder ?? 0), 0);
      if (envoys) owner.envoysAvailable = (owner.envoysAvailable ?? 0) + envoys;
      // CIV6 (Oxford, Bolshoi): free technologies and civics, drawn at random
      // in the real game and taken here in the same available-order the
      // research chooser uses.
      if (fx?.freeTechs) grantFreeResearch(owner, 'tech', fx.freeTechs);
      if (fx?.freeCivics) grantFreeResearch(owner, 'civic', fx.freeCivics);
      break;
    }
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
      // CIV6 (Venetian Arsenal): a TRAINED naval unit arrives twice. Purchases
      // are excluded in the real game and take a different path here.
      if (UNITS[item.unit]?.naval && seatWonderFlag(state, city.seat, 'duplicateNavalTrain')) {
        const twin = spawnUnit(state, item.unit, city.centerIndex, city.seat);
        if (twin && (UNITS[item.unit]?.combat ?? 0) > 0) {
          const xp = encampmentTrainXp(city.buildings);
          if (xp > 0) twin.xp = xp;
        }
      }
      break;
    }
    case 'project':
      completeProject(state, city, item.project, cost, sciPerTurn);
      break;
    case 'building':
      city.buildings.push(item.building);
      buildingDedications(state, city.seat, item.building);
      if (item.building === 'ANCIENT_WALLS') city.outerHp = WALLS_HP;
      break;
  }
}
