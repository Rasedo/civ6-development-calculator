
import { dedicationEvent } from './eras';
import { seatOf, citiesOf, tileSeat, allianceLevelWith } from './seats';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE } from '../data/seats';
import type { GameState, ResearchState, Seat } from './types';
import { isExplored } from './fog';
import { BOOSTS, BOOST_FRACTION, type BoostCheck } from '../data/boosts';
import { getModifiers, slottedPolicyIndices } from './effects';
import { DISTRICTS } from '../data/districts';
import { TECHS } from '../data/techs';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { isCoastalLand, naturalWonderAt } from '../../world/query';

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
      // the seat's OWN plots (runs/h1_duelw1115: China holds one improvement
      // through t17 and reads no Craftsmanship inspiration while the map
      // holds three Farms by t7)
      let n = 0;
      for (const t of state.map.tiles) {
        if (tileSeat(t) !== seat || !t.improvement) continue;
        if (check.id && t.improvement !== check.id) continue;
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
    case 'naturalWonderFound':
      // a natural wonder plot the seat has revealed (runs/h1_duelw1115 Rome's
      // inspiration at t4, owning no plot beside one)
      return state.map.tiles.some((t) => naturalWonderAt(t) !== null && isExplored(state, seat, t.index));
    case 'policies': {
      // the cards the seat CHOSE (a driver decision, the stored set) — the
      // GPU's `_seat_slotted` count
      if (!seatOf(state, seat)) return false;
      return slottedPolicyIndices(state, seat).length >= check.count;
    }
    case 'cities':
      return citiesOf(state, seat).length >= check.count;
    case 'alliance':
      return state.seats.some((o) => o.seat !== seat && allianceLevelWith(state, seat, o.seat) >= check.level);
    case 'pantheon':
      return !!seatOf(state, seat)?.religion.pantheon;
    case 'religion':
      return !!seatOf(state, seat)?.religion.founded;
    case 'metCityStates':
      return (state.cityStates ?? []).filter((cs) => cs.met.includes(seat)).length >= check.count;
    case 'tradeRoutes':
      return ((seatOf(state, seat) as Seat | undefined)?.tradeRoutes?.length ?? 0) >= check.count;
  }
}

/** A boost an EVENT lands at once (Military Tradition's camp clear,
 *  BOOST_TRIGGER_CLEAR_CAMP): marked unless researched or marked already,
 *  the dedication's era score with it, as `detectBoosts` lands one. */
export function grantBoost(state: GameState, seat: number, id: string): void {
  const research = seatOf(state, seat)?.research;
  if (!research || research.boosted.includes(id) || research.techs.includes(id) || research.civics.includes(id)) return;
  research.boosted.push(id);
  dedicationEvent(state, seat, TECHS[id] ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE);
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
