/** Evaluation of eureka/inspiration conditions against the game state. */

import { dedicationEvent } from './eras';
import { playerSeat, seatOf, citiesOf, tileOwnedByCiv, PLAYER_CIV } from './seats';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE } from '../data/rivals';
import type { GameState, ResearchState } from './types';
import { neighbors } from './hex';
import { BOOSTS, BOOST_FRACTION, type BoostCheck } from '../data/boosts';
import { DISTRICTS } from '../data/districts';
import { TECHS } from '../data/techs';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { isCoastalLand } from './query';

export { BOOST_FRACTION };

/** AUDIT A-3: the eureka/inspiration discount, scoped to any civ's
 * research state (the player's effectiveResearchCost delegates here). */
export function effectiveResearchCostIn(
  rsr: ResearchState,
  id: string,
  baseCost: number,
  goldenExtra = 0, // B-24 (#79): FREE_INQUIRY (techs) / PEN_BRUSH_AND_VOICE (civics)
): number {
  return rsr.boosted.includes(id)
    ? Math.round(baseCost * (1 - BOOST_FRACTION - goldenExtra))
    : baseCost;
}

function checkSatisfied(state: GameState, seat: number, check: BoostCheck): boolean {
  switch (check.kind) {
    case 'building': {
      let n = 0;
      for (const c of citiesOf(state, seat)) n += c.buildings.filter((b) => b === check.id).length;
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
      for (const c of citiesOf(state, seat)) {
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
      return citiesOf(state, seat).some((c) => c.population >= check.pop);
    case 'totalPop':
      return citiesOf(state, seat).reduce((s, c) => s + c.population, 0) >= check.pop;
    case 'coastalCity':
      return citiesOf(state, seat).some((c) => isCoastalLand(state.map, state.map.tiles[c.centerIndex]));
    case 'tech':
      return seatOf(state, seat)?.research.techs.includes(check.id) ?? false;
    case 'greatPeople': {
      if (check.class) {
        const ids = new Set(GREAT_PEOPLE[check.class].map((p) => p.id));
        return state.claimedGreatPeople.filter((id) => ids.has(id)).length >= check.count;
      }
      return state.claimedGreatPeople.length >= check.count;
    }
    case 'anyWonderBuilt':
      return state.map.tiles.some((t) => t.builtWonderComplete);
    case 'nearNaturalWonder':
      return state.map.tiles.some(
        (t) =>
          tileOwnedByCiv(t, seat) &&
          (t.wonder !== null || neighbors(state.map, t).some((n) => n.wonder !== null)),
      );
    case 'policies':
      // Rivals run no policy machinery, so their slot list stays empty and
      // this reads 0 — the same answer the old rival-side hardcoded `false`
      // gave, but now as a cap read that goes live the day they get cards.
      return (
        (seatOf(state, seat)?.government.policies.filter((p) => p !== null).length ?? 0) >=
        check.count
      );
    case 'cities':
      return citiesOf(state, seat).length >= check.count;
  }
}

export function isBoosted(state: GameState, id: string): boolean {
  return playerSeat(state).research.boosted.includes(id);
}

/** Auto-detect one seat's satisfied eureka/inspiration conditions (idempotent).
 *  Returns the ids newly flagged by this call. */
export function detectBoosts(state: GameState, seat: number = PLAYER_CIV): string[] {
  const research = seatOf(state, seat)?.research;
  if (!research) return [];
  const newly: string[] = [];
  for (const [id, def] of Object.entries(BOOSTS)) {
    if (!def.check) continue;
    if (research.boosted.includes(id)) continue;
    if (research.techs.includes(id) || research.civics.includes(id)) continue;
    if (checkSatisfied(state, seat, def.check)) {
      research.boosted.push(id);
      // B-24 (#77): FREE INQUIRY pays era score per EUREKA, PEN BRUSH AND
      // VOICE per INSPIRATION — a tech boost is a eureka, a civic boost an
      // inspiration.
      dedicationEvent(state, seat, TECHS[id] ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE);
      newly.push(id);
    }
  }
  return newly;
}

/** Manually toggle a boost (for conditions the calculator can't observe). */
export function toggleBoost(state: GameState, id: string): void {
  const i = playerSeat(state).research.boosted.indexOf(id);
  if (i >= 0) playerSeat(state).research.boosted.splice(i, 1);
  else playerSeat(state).research.boosted.push(id);
}
