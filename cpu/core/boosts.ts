
import { dedicationEvent } from './eras';
import { seatOf, citiesOf, tileOwnedByCiv } from './seats';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE } from '../data/seats';
import type { GameState, ResearchState } from './types';
import { neighbors } from '../../world/hex';
import { BOOSTS, BOOST_FRACTION, type BoostCheck } from '../data/boosts';
import { getModifiers } from './effects';
import { GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import { computeAdoption, inDarkAge, wonderExtraSlots } from './effects';
import { congressPolicyBlocked } from './congress';
import { DISTRICTS } from '../data/districts';
import { TECHS } from '../data/techs';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { isCoastalLand, naturalWonderAt } from '../../world/query';

export { BOOST_FRACTION };

export function effectiveResearchCostIn(
  rsr: ResearchState,
  id: string,
  baseCost: number,
  goldenExtra: number, // FREE_INQUIRY (techs) / PEN_BRUSH_AND_VOICE (civics)
  // CIV6 (Dynastic Cycle): "Eurekas and Inspirations provide 50% ... instead
  // of 40%" — PERCENTAGE POINTS on top of the base share (`BOOST_PCT_ROWS`).
  // Required, not defaulted: every caller knows the researching seat, and a
  // forgotten one would quietly pay the plain fraction.
  rosterPoints: number,
): number {
  return rsr.boosted.includes(id)
    ? Math.round(baseCost * (1 - BOOST_FRACTION - rosterPoints / 100 - goldenExtra))
    : baseCost;
}

/** CIV6 (Dynastic Cycle): the PERCENTAGE POINTS this seat's roster adds to a
 *  boost — the ONE reader of `mods.boostPct`. */
export function rosterBoostPoints(state: GameState, seat: number, isCivic: boolean): number {
  let n = 0;
  for (const r of getModifiers(state, seat).boostPct) if (r.tech !== isCivic) n += r.points;
  return n;
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
          (naturalWonderAt(t) !== null || neighbors(state.map, t).some((n) => naturalWonderAt(n) !== null)),
      );
    case 'policies': {
      // ORACLE: the GPU counts the scripted adoption's slotted cards
      // (`_gov_policy_mods`' slotted mask) and answers False with adoption
      // off; the stored government is a TS-only vestige nothing writes in a
      // driven game, so counting it would make this boost unreachable.
      const rsr = seatOf(state, seat)?.research;
      if (!GOVERNMENTS_ADOPTION_LIVE || !rsr) return false;
      return computeAdoption(rsr, wonderExtraSlots(state, seat), congressPolicyBlocked(state), inDarkAge(state, seat), seatOf(state, seat)?.government.held ?? 0)
        .policies.filter((p) => p !== null).length >= check.count;
    }
    case 'cities':
      return citiesOf(state, seat).length >= check.count;
  }
}

export function isBoosted(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.boosted.includes(id);
}

export function detectBoosts(state: GameState, seat: number): string[] {
  const research = seatOf(state, seat)?.research;
  if (!research) return [];
  const newly: string[] = [];
  for (const [id, def] of Object.entries(BOOSTS)) {
    if (!def.check) continue;
    if (research.boosted.includes(id)) continue;
    if (research.techs.includes(id) || research.civics.includes(id)) continue;
    if (checkSatisfied(state, seat, def.check)) {
      research.boosted.push(id);
      dedicationEvent(state, seat, TECHS[id] ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE);
      newly.push(id);
    }
  }
  return newly;
}

export function toggleBoost(state: GameState, id: string, seat: number): void {
  const i = seatOf(state, seat)!.research.boosted.indexOf(id);
  if (i >= 0) seatOf(state, seat)!.research.boosted.splice(i, 1);
  else seatOf(state, seat)!.research.boosted.push(id);
}
