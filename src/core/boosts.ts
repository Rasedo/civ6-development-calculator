/** Evaluation of eureka/inspiration conditions against the game state. */

import type { GameState, ResearchState, RivalCiv } from './types';
import { neighbors } from './hex';
import { BOOSTS, BOOST_FRACTION, type BoostCheck } from '../data/boosts';
import { DISTRICTS } from '../data/districts';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { isCoastalLand } from './query';

export { BOOST_FRACTION };

/** AUDIT A-3: the eureka/inspiration discount, scoped to any civ's
 * research state (the player's effectiveResearchCost delegates here). */
export function effectiveResearchCostIn(rsr: ResearchState, id: string, baseCost: number): number {
  return rsr.boosted.includes(id) ? Math.round(baseCost * (1 - BOOST_FRACTION)) : baseCost;
}

function checkSatisfied(state: GameState, check: BoostCheck): boolean {
  switch (check.kind) {
    case 'building': {
      let n = 0;
      for (const c of state.cities) n += c.buildings.filter((b) => b === check.id).length;
      return n >= check.count;
    }
    case 'improvement': {
      let n = 0;
      for (const t of state.map.tiles) {
        if (t.improvement !== check.id) continue;
        if (check.onResource && !t.resource) continue;
        n++;
      }
      return n >= check.count;
    }
    case 'district': {
      const seen = new Set<string>();
      let n = 0;
      for (const c of state.cities) {
        for (const d of c.districts) {
          if (!state.map.tiles[d.tileIndex].districtComplete) continue;
          if (check.type ? d.type !== check.type : !DISTRICTS[d.type].countsTowardLimit) continue;
          n++;
          seen.add(d.type);
        }
      }
      return check.distinctTypes ? seen.size >= check.count : n >= check.count;
    }
    case 'cityPop':
      return state.cities.some((c) => c.population >= check.pop);
    case 'totalPop':
      return state.cities.reduce((s, c) => s + c.population, 0) >= check.pop;
    case 'coastalCity':
      return state.cities.some((c) => isCoastalLand(state.map, state.map.tiles[c.centerIndex]));
    case 'tech':
      return state.research.techs.includes(check.id);
    case 'greatPeople': {
      if (check.class) {
        const ids = new Set(GREAT_PEOPLE[check.class].map((p) => p.id));
        return state.greatPeople.earned.filter((id) => ids.has(id)).length >= check.count;
      }
      return state.greatPeople.earned.length >= check.count;
    }
    case 'anyWonderBuilt':
      return state.map.tiles.some((t) => t.builtWonderComplete);
    case 'nearNaturalWonder':
      return state.map.tiles.some(
        (t) =>
          t.cityId !== -1 &&
          (t.wonder !== null || neighbors(state.map, t).some((n) => n.wonder !== null)),
      );
    case 'policies':
      return state.government.policies.filter((p) => p !== null).length >= check.count;
    case 'cities':
      return state.cities.length >= check.count;
  }
}

export function isBoosted(state: GameState, id: string): boolean {
  return state.research.boosted.includes(id);
}

/** Auto-detect satisfied eureka/inspiration conditions (idempotent). */
export function detectBoosts(state: GameState): string[] {
  const newly: string[] = [];
  for (const [id, def] of Object.entries(BOOSTS)) {
    if (!def.check) continue;
    if (state.research.boosted.includes(id)) continue;
    if (state.research.techs.includes(id) || state.research.civics.includes(id)) continue;
    if (checkSatisfied(state, def.check)) {
      state.research.boosted.push(id);
      newly.push(id);
    }
  }
  return newly;
}

/** Manually toggle a boost (for conditions the calculator can't observe). */
export function toggleBoost(state: GameState, id: string): void {
  const i = state.research.boosted.indexOf(id);
  if (i >= 0) state.research.boosted.splice(i, 1);
  else state.research.boosted.push(id);
}

/** AUDIT A-3: checkSatisfied from a RIVAL's seat — its cities, research,
 * territory and centers; the map-global conditions (improvement counts,
 * the shared great-people pool, any-wonder) read the same global state
 * the player's check does, so every civ runs the same formula. Rivals
 * have no policy machinery — those conditions simply stay unsatisfied. */
function rivalCheckSatisfied(state: GameState, rival: RivalCiv, check: BoostCheck): boolean {
  switch (check.kind) {
    case 'building': {
      let n = 0;
      for (const c of rival.cities) n += c.buildings.filter((b) => b === check.id).length;
      return n >= check.count;
    }
    case 'improvement': {
      let n = 0;
      for (const t of state.map.tiles) {
        if (t.improvement !== check.id) continue;
        if (check.onResource && !t.resource) continue;
        n++;
      }
      return n >= check.count;
    }
    case 'district': {
      const seen = new Set<string>();
      let n = 0;
      for (const c of rival.cities) {
        for (const d of c.districts) {
          if (!state.map.tiles[d.tileIndex].districtComplete) continue;
          if (check.type ? d.type !== check.type : !DISTRICTS[d.type].countsTowardLimit) continue;
          n++;
          seen.add(d.type);
        }
      }
      return check.distinctTypes ? seen.size >= check.count : n >= check.count;
    }
    case 'cityPop':
      return rival.cities.some((c) => c.population >= check.pop);
    case 'totalPop':
      return rival.cities.reduce((s, c) => s + c.population, 0) >= check.pop;
    case 'coastalCity':
      return rival.cities.some((c) => isCoastalLand(state.map, state.map.tiles[c.centerIndex]));
    case 'tech':
      return rival.research.techs.includes(check.id);
    case 'greatPeople': {
      if (check.class) {
        const ids = new Set(GREAT_PEOPLE[check.class].map((p) => p.id));
        return state.greatPeople.earned.filter((id) => ids.has(id)).length >= check.count;
      }
      return state.greatPeople.earned.length >= check.count;
    }
    case 'anyWonderBuilt':
      return state.map.tiles.some((t) => t.builtWonderComplete);
    case 'nearNaturalWonder':
      return state.map.tiles.some(
        (t) =>
          (t.rivalId ?? -1) === rival.id &&
          (t.wonder !== null || neighbors(state.map, t).some((n) => n.wonder !== null)),
      );
    case 'policies':
      return false; // rivals run no government/policy machinery (AUDIT A-7 note)
    case 'cities':
      return rival.cities.length >= check.count;
  }
}

/** AUDIT A-3: detectBoosts from the rival's seat — flags satisfied,
 * unresearched, un-boosted conditions on rival.research.boosted (the
 * field always existed; it was never populated). Runs at the top of the
 * rival's phase block, the mirror of the player's endTurn-top call. */
export function detectRivalBoosts(state: GameState, rival: RivalCiv): void {
  const rsr = rival.research;
  for (const [id, def] of Object.entries(BOOSTS)) {
    if (!def.check) continue;
    if (rsr.boosted.includes(id)) continue;
    if (rsr.techs.includes(id) || rsr.civics.includes(id)) continue;
    if (rivalCheckSatisfied(state, rival, def.check)) rsr.boosted.push(id);
  }
}
