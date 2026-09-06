/**
 * THE CASUS BELLI — which war KINDS a seat may declare on a target, and what
 * a declared war of a kind pays its declarer afterwards.
 *
 * CIV6 (DiplomaticActions.xml): every `DIPLOACTION_DECLARE_*_WAR` row carries
 * a civic prerequisite, a denouncement age and a requirement column; the
 * table is `WAR_KINDS` (data/warKinds.ts) and this module is its ONE reader.
 * The record's validator, the observation's default and the driver's pick
 * all call `warKindAllowed`; the GPU twin is `_war_kinds_allowed`.
 */
import type { GameState } from './types';
import {
  citiesOf, civOf, civsAtWar, friendTurnsWith, isCiv, leaderOf, seatOf, seatsAllied,
  warDenounceHeld, warTurnsWith,
} from './seats';
import { goldenDedication } from './eras';
import { isSuzerain } from './cityStates';
import { civEraIndex } from './city';
import { seatGovernmentId } from './seatTurn';
import { hexDistance } from '../../world/hex';
import { GOVERNMENTS } from '../data/policies';
import { DED_TO_ARMS } from '../data/seats';
import { WAR_BUFF_ROWS, rowIsFor, type WarBuffRow } from '../data/civilizations';
import {
  COLONIAL_WAR_ERA_LEAD, LATE_GOVERNMENT_TIER, TERRITORIAL_WAR_CITIES, TERRITORIAL_WAR_RANGE,
  WAR_BUFF_TURNS, WAR_KINDS, warKindCode, type WarCondition,
} from '../data/warKinds';

/** the roster's declared-war rows this seat holds (`WAR_BUFF_ROWS`) */
export function warBuffRowsOf(state: GameState, seat: number): WarBuffRow[] {
  if (!isCiv(seat)) return [];
  const civ = civOf(state, seat);
  const leader = leaderOf(state, seat);
  return WAR_BUFF_ROWS.filter((r) => rowIsFor(r, civ, leader));
}

/** CIV6 (InitiatorPrereqCivic, EFFECT_ADD_DIPLOMATIC_ACTION_OVERRIDE): the
 *  kind's own civic, or the civic a roster row overrides it to. */
export function warKindCivicOk(state: GameState, seat: number, kind: number): boolean {
  const def = WAR_KINDS[kind];
  const civics = seatOf(state, seat)?.research?.civics ?? [];
  if (def.civic === null || civics.includes(def.civic)) return true;
  return warBuffRowsOf(state, seat).some((r) => r.kind === def.id && civics.includes(r.civicOverride));
}

/** CIV6 (Territorial War): "Must have 2 of your cities within 10 tiles of 2
 *  opponents' cities" — read as two of the declarer's cities each within
 *  reach of some target city, AND two of the target's each within reach of
 *  some declarer city (a READING of the sentence's two counts). */
function empiresAdjacent(state: GameState, seat: number, target: number): boolean {
  const tiles = state.map.tiles;
  const mine = citiesOf(state, seat).map((c) => tiles[c.centerIndex]);
  const theirs = citiesOf(state, target).map((c) => tiles[c.centerIndex]);
  const near = (a: { col: number; row: number }, b: { col: number; row: number }) =>
    hexDistance(a.col, a.row, b.col, b.row) <= TERRITORIAL_WAR_RANGE;
  let a = 0;
  for (const c of mine) if (theirs.some((o) => near(c, o))) a++;
  let b = 0;
  for (const o of theirs) if (mine.some((c) => near(c, o))) b++;
  return a >= TERRITORIAL_WAR_CITIES && b >= TERRITORIAL_WAR_CITIES;
}

/** The kind's own requirement column, for `seat` declaring on `target`. */
export function warConditionHolds(state: GameState, seat: number, target: number, cond: WarCondition): boolean {
  switch (cond) {
    case 'none':
      return true;
    case 'convertedCity': {
      // CIV6 (Holy War): "a power that has religiously converted one of your
      // cities" — a religion is keyed by its founder's seat
      const rel = seatOf(state, target)?.religion;
      if (!rel?.founded || rel.holyTile == null || rel.holyTile < 0) return false;
      return citiesOf(state, seat).some((c) => c.followedReligion === target);
    }
    case 'occupiedFriendlyCity':
      // CIV6 (Liberation War): "a power that has captured a city from one of
      // your friends or allies" — the city's FOUNDER is the seat it was taken
      // from (`founderSeat`, the engines' one record of a city's origin)
      return citiesOf(state, target).some((c) => {
        const f = c.founderSeat ?? c.seat;
        return f !== target && f !== seat && isCiv(f)
          && (friendTurnsWith(state, seat, f) > 0 || seatsAllied(state, seat, f));
      });
    case 'occupiedCity':
      // CIV6 (Reconquest War): "a power that has captured one of your cities"
      return citiesOf(state, target).some((c) => (c.founderSeat ?? c.seat) === seat);
    case 'warOnMyCityState':
      // CIV6 (Protectorate War): "a power that has attacked one of your
      // allied city-states" — a city-state this seat is Suzerain of
      return (state.cityStates ?? []).some((cs) => isSuzerain(state, cs, seat) && civsAtWar(state, target, cs.seat));
    case 'leadTwoEras': {
      // CIV6 (Colonial War): "a power that is two technology eras behind you"
      // — each seat's own era, the highest among its techs and civics
      const me = seatOf(state, seat)?.research;
      const them = seatOf(state, target)?.research;
      return civEraIndex(me?.techs ?? [], me?.civics ?? [])
        - civEraIndex(them?.techs ?? [], them?.civics ?? []) >= COLONIAL_WAR_ERA_LEAD;
    }
    case 'adjacentEmpires':
      return empiresAdjacent(state, seat, target);
    case 'toArms':
      // CIV6 (Golden Age War): "while you are in a Golden Age with a 'To
      // Arms!' Dedication"
      return goldenDedication(state, seat, DED_TO_ARMS);
    case 'brokenPromise':
      // neither engine holds a promise (docs/AUDIT.md C-76)
      return false;
    case 'differentLateGovernment': {
      // CIV6 (Ideological War): "a player who is in a different Tier 3
      // government" — both LATE, and not the same one
      const g1 = seatGovernmentId(state, seat);
      const g2 = seatGovernmentId(state, target);
      if (!g1 || !g2 || g1 === g2) return false;
      return (GOVERNMENTS[g1]?.tier ?? 0) >= LATE_GOVERNMENT_TIER && (GOVERNMENTS[g2]?.tier ?? 0) >= LATE_GOVERNMENT_TIER;
    }
    default:
      return false;
  }
}

/** May `seat` declare a war of `kind` on `target` right now? The civic (or
 *  its roster override), the denouncement age, then the requirement column.
 *  A minor takes no kind. */
export function warKindAllowed(state: GameState, seat: number, target: number, kind: number): boolean {
  if (kind < 0 || kind >= WAR_KINDS.length || !isCiv(seat) || !isCiv(target) || seat === target) return false;
  const def = WAR_KINDS[kind];
  if (!warKindCivicOk(state, seat, kind)) return false;
  if (def.denounceTurns >= 0 && !warDenounceHeld(state, seat, target, def.denounceTurns)) return false;
  return warConditionHolds(state, seat, target, def.condition);
}

/** The kind a declaration takes when the record names none: the CHEAPEST
 *  casus belli the seat holds by the declaration percent, the first in table
 *  order on a tie — a READING; the driver records the same pick. A Surprise
 *  war asks for nothing, so a major always has one. */
export function defaultWarKind(state: GameState, seat: number, target: number): number {
  let best = -1;
  for (let k = 0; k < WAR_KINDS.length; k++) {
    if (!warKindAllowed(state, seat, target, k)) continue;
    if (best < 0 || WAR_KINDS[k].pct[0] < WAR_KINDS[best].pct[0]) best = k;
  }
  return best;
}

/** Is `seat` inside the `WAR_BUFF_TURNS` window of a war of `kind` it
 *  DECLARED? The pair's own clock is the age. */
export function warBuffLive(state: GameState, seat: number, kind: number): boolean {
  const s = seatOf(state, seat);
  if (!s?.warKinds) return false;
  for (const foe of Object.keys(s.warKinds)) {
    const f = Number(foe);
    if (s.warKinds[f] === kind + 1 && warTurnsWith(state, seat, f) < WAR_BUFF_TURNS) return true;
  }
  return false;
}

function warBuffSum(state: GameState, seat: number, pick: (r: WarBuffRow) => number): number {
  let n = 0;
  for (const r of warBuffRowsOf(state, seat)) {
    if (r && pick(r) && warBuffLive(state, seat, warKindCode(r.kind))) n += pick(r);
  }
  return n;
}

/** CIV6 (TRAIT_TERRITORIAL_WAR_COMBAT): flat Combat Strength on the seat's units. */
export function warBuffCS(state: GameState, seat: number): number {
  return warBuffSum(state, seat, (r) => r.combat);
}

/** CIV6 (TRAIT_*_WAR_MOVEMENT): flat Movement on the seat's units. */
export function warBuffMoves(state: GameState, seat: number): number {
  return warBuffSum(state, seat, (r) => r.moves);
}

/** CIV6 (TRAIT_LIBERATION_WAR_PRODUCTION): percent Production in the seat's cities. */
export function warBuffProdPct(state: GameState, seat: number): number {
  return warBuffSum(state, seat, (r) => r.prodPct);
}
