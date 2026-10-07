/**
 * THE ESPIONAGE SYSTEM. A Spy is a civilian that never walks: it JUMPS to the
 * district tile of a revealed city it will work out of, establishes, and runs
 * one mission at a time from that district.
 *
 * CIV6 (Espionage): "Spies act in cities. Spy missions may be performed in
 * enemy cities and your own, and what exactly they will do depends on the city
 * you send them to."
 */
import { markBoost } from './boosts';
import { gwHasRoom, gwLastOfKind, moveGreatWork } from './greatWorks';
import { GW_KIND_ART, GW_KIND_MUSIC, GW_KIND_WRITING, type GreatWork } from '../data/greatWorks';
import { hexDistance } from '../../world/hex';
import { darkBuildings, pillageBuilding } from './yields';
import { UNITS, UNIT_ERA_INDEX } from '../data/units';
import { holdSpy, spiesHeldOf } from './deals';
import { TECHS } from '../data/techs';
import {
  SPY_UNIT, SPY_CAPACITY_CIVICS, SPY_CAPACITY_TECHS, SPY_CAPACITY_MAX,
  SPY_MAX_LEVEL, SPY_IDLE, SPY_TRAVELLING, SPY_MISSIONS, SPY_TRAVEL_COLS,
  SPY_TRAVEL_TURNS_MIN, SPY_TRAVEL_TILES_PER_TURN,
  SPY_TRAVEL_TURNS_MAX, SPY_ROLL_DICE, SPY_ROLL_FACES, SPY_ROLL_LEVEL_BASE, SPY_COUNTERSPY_ROLL,
  SPY_COUNTERSPY_LEVEL_ROLL, SPY_ESCAPE_BASE, SPY_ESCAPE_LEVEL, SPY_ESCAPE_POLICE, SPY_ESCAPE_CAPTURE_BAND,
  BODYGUARD_OP_NUM, BODYGUARD_OP_DEN,
  SPY_UNREST_LOYALTY, SPY_UNREST_PER_LEVEL, SPY_GOVERNOR_TURNS,
  SPY_SOURCES_LEVELS, SPY_SOURCES_TURNS,
  SPY_PARTISANS_MIN, SPY_PARTISANS_MAX,
  SPY_M_GAIN_SOURCES, SPY_M_SIPHON_FUNDS, SPY_M_GREAT_WORK_HEIST,
  SPY_M_SABOTAGE_PRODUCTION, SPY_M_STEAL_TECH_BOOST, SPY_M_RECRUIT_PARTISANS,
  SPY_M_DISRUPT_ROCKETRY, SPY_M_FOMENT_UNREST, SPY_M_NEUTRALIZE_GOVERNOR, SPY_M_BREACH_DAM,
  SPY_M_COUNTERSPY, SPY_M_LISTENING_POST, SPY_M_FABRICATE_SCANDAL,
  SPY_ESCAPE_ROUTES, SPY_SCANDAL_ENVOYS_BASE, SPY_SCANDAL_PER_LEVEL, SPY_SURVEILLANCE_REACH,
  type SpyMissionDef,
} from '../data/espionage';
import { envoysOf, resolveSuzerain, suzerainOf } from './cityStates';
import { BARB_SEAT, citiesOf, seatOf, seatsAllied, tileSeat } from './seats';
import { DED_BODYGUARD } from '../data/seats';
import { getModifiers } from './effects';
import { goldenDedication, dedicationEvent, worldEraIndex } from './eras';
import { cityHasGovernor, governorAt, governorsOf, neutralizeGovernor } from './governors';
import { seatBuildingSum } from './city';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { governorSum } from './governors';
import { floodRiver, floodSeverity } from './disasters';
import { randRange, randWeighted } from './rand';
import { drawPromoOffer, promoFlag, promoValue, promoValueFor } from './promotions';
import { disbandUnit, spawnUnit } from './units';
import { congressPactBanned, congressPactLevels } from './congress';
import { promiseIncursion } from './grievance';
import { PROMISE_SPY } from '../data/promises';
import type { City, CityState, GameState, Seat, Unit } from './types';

export function isSpy(type: string): boolean {
  return type === SPY_UNIT;
}

/** CIV6 (Spy): one more Spy per capacity source, and never more than the cap. */
export function spyCapacity(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  let n = 0;
  for (const id of SPY_CAPACITY_CIVICS) if (s.research.civics.includes(id)) n++;
  for (const id of SPY_CAPACITY_TECHS) if (s.research.techs.includes(id)) n++;
  // CIV6 (Intelligence Agency): "+1 Spy and Spy capacity."
  n += seatBuildingSum(state, seat, 'spyCapacity');
  // CIV6 (EFFECT_GRANT_SPY): the roster's capacity at a technology (`SPY_CAPACITY_ROWS`)
  for (const r of getModifiers(state, seat).spyCapacityRows) if (s.research.techs.includes(r.tech)) n += r.amount;
  return Math.min(n, SPY_CAPACITY_MAX);
}

export function spiesOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => u.seat === seat && isSpy(u.type));
}

/** CIV6: "you can never have more Spies than your current empire's development
 *  allows" — the training gate, the Trader capacity's twin. A spy sitting in
 *  someone's cell still counts: "if you've trained the maximum number of Spies
 *  possible, you cannot train a new Spy to replace one that gets captured." */
export function canTrainSpy(state: GameState, seat: number): boolean {
  return spiesOf(state, seat).length + spiesHeldOf(state, seat) < spyCapacity(state, seat);
}

/** does this city's registry hold the tile — its centre or one of its districts? */
function cityHoldsTile(city: City, tileIndex: number): boolean {
  return city.centerIndex === tileIndex || city.districts.some((d) => d.tileIndex === tileIndex);
}

/** the MAJOR city on whose centre or district tile this spy stands, whoever
 *  holds it. A spy occupies the district it works out of — CIV6 (Espionage):
 *  every operation names its Location, "the district in which the mission
 *  takes place". */
export function spyCity(state: GameState, unit: Unit): { seat: Seat; city: City } | undefined {
  return spyCityAt(state, unit.tileIndex);
}

function spyCityAt(state: GameState, tileIndex: number): { seat: Seat; city: City } | undefined {
  for (const actor of state.seats) {
    const city = actor.cities.find((c) => cityHoldsTile(c, tileIndex));
    if (city) return { seat: actor, city };
  }
  return undefined;
}

/**
 * CIV6: "You may send a Spy to any city you have revealed (provided you don't
 * have an alliance with that civilization)" — to the DISTRICT it will work
 * out of: every centre and district tile of every such major city, and a
 * city-state's centre (the scandal's ground). NEAREST first, ties to the
 * lowest tile index, cut to the head's width — so both engines agree on
 * column k without shipping a list, and the head reaches the cities a spy
 * could actually get to soonest.
 */
export function spyDestinations(state: GameState, unit: Unit, width = SPY_TRAVEL_COLS): number[] {
  const s = seatOf(state, unit.seat);
  if (!s || !isSpy(unit.type)) return [];
  const here = state.map.tiles[unit.tileIndex];
  const seen = new Set<number>();
  const out: { t: number; d: number }[] = [];
  const offer = (t: number): void => {
    if (t === unit.tileIndex || seen.has(t)) return;
    if (s.explored.length > 0 && s.explored[t] !== 1) return;
    seen.add(t);
    const tile = state.map.tiles[t];
    out.push({ t, d: hexDistance(state.map, here.col, here.row, tile.col, tile.row) });
  };
  for (const actor of state.seats) {
    if (seatsAllied(state, unit.seat, actor.seat)) continue;
    for (const city of actor.cities) {
      offer(city.centerIndex);
      for (const d of city.districts) offer(d.tileIndex);
    }
  }
  for (const minor of state.cityStates ?? []) offer(minor.centerIndex);
  out.sort((a, b) => a.d - b.d || a.t - b.t);
  return out.slice(0, width).map((x) => x.t);
}

/** the CITY-STATE whose centre this tile is — the minor's record IS its city
 *  block, and capture removes the entry, so a match is a living minor. */
function spyMinorAt(state: GameState, tileIndex: number): CityState | undefined {
  return (state.cityStates ?? []).find((c) => c.centerIndex === tileIndex);
}

/** MODEL: the source names four travel modes with "their own travel time" and
 *  publishes none of them; distance is what this model reads. */
export function spyTravelTurns(state: GameState, from: number, to: number): number {
  const a = state.map.tiles[from];
  const b = state.map.tiles[to];
  if (!a || !b) return SPY_TRAVEL_TURNS_MIN;
  const d = hexDistance(state.map, a.col, a.row, b.col, b.row);
  return Math.min(SPY_TRAVEL_TURNS_MAX,
    SPY_TRAVEL_TURNS_MIN + Math.floor(d / SPY_TRAVEL_TILES_PER_TURN));
}

export function spyIdle(unit: Unit): boolean {
  return (unit.spyMission ?? SPY_IDLE) === SPY_IDLE;
}

function canTravelTo(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!isSpy(unit.type) || !spyIdle(unit)) return false;
  return spyDestinations(state, unit).includes(tileIndex);
}

export function beginTravel(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!canTravelTo(state, unit, tileIndex)) return false;
  unit.movesLeft = 0;
  if (spyNoEstablish(state, unit)) {
    unit.tileIndex = tileIndex;
    unit.spyMission = SPY_IDLE;
    unit.spyTarget = undefined;
    unit.spyTurns = 0;
    return true;
  }
  unit.spyMission = SPY_TRAVELLING;
  unit.spyTarget = tileIndex;
  unit.spyTurns = spyTravelTurns(state, unit.tileIndex, tileIndex);
  return true;
}

/** what this spy could start where it stands, one flag per mission index. */
export function missionOffered(state: GameState, unit: Unit, m: number): boolean {
  const def = SPY_MISSIONS[m];
  if (!def || !isSpy(unit.type) || !spyIdle(unit)) return false;
  // CIV6 (Espionage): "a single city may contain more than one Spy, but no
  // two Spies may perform the same Mission in the same city" — read per
  // OWNER, the one scope a player's own mission list can see.
  if (spiesOf(state, unit.seat).some(
    (o) => o !== unit && o.tileIndex === unit.tileIndex && o.spyMission === m,
  )) return false;
  if (def.citystate) {
    const minor = spyMinorAt(state, unit.tileIndex);
    // CIV6 (Fabricate Scandal): performed "in a City-State that you are not
    // Suzerain over".
    if (!minor || suzerainOf(minor) === unit.seat) return false;
    return m !== congressPactBanned(state);
  }
  const here = spyCity(state, unit);
  if (!here) return false;
  const mine = here.seat.seat === unit.seat;
  if (!!def.athome !== mine) return false;
  // THE GEOMETRY: a mission is offered where its district stands — on the
  // tile the spy occupies. A centre mission wants the centre, a district
  // mission a LIVE district of its type underfoot, and the counterspy post
  // any district of the city it guards.
  const tile = state.map.tiles[unit.tileIndex];
  if (def.anyDistrict) {
    // any tile of the city — `spyCity` already answered that
  } else if (def.district === 'CITY_CENTER') {
    if (tile.index !== here.city.centerIndex) return false;
  } else if (tile.district !== def.district || !tile.districtComplete || tile.districtPillaged) {
    return false;
  }
  if (m === SPY_M_GREAT_WORK_HEIST && heistTarget(state, unit.seat, here.city) === null) return false;
  if (m === SPY_M_STEAL_TECH_BOOST && stealableTech(state, unit.seat, here.seat.seat) === null) return false;
  if (m === SPY_M_NEUTRALIZE_GOVERNOR && !hasGovernor(state, here.seat, here.city)) return false;
  // CIV6 (Espionage Pact, outcome B): "Target Operation is unavailable."
  return m !== congressPactBanned(state);
}

export function spyMissionMask(state: GameState, unit: Unit): boolean[] {
  return SPY_MISSIONS.map((_, m) => missionOffered(state, unit, m));
}

/** CIV6 (Bodyguard of Lies, Golden face): "Time to complete all offensive spy
 *  operations reduced by 25%." */
export function missionTurns(state: GameState, unit: Unit, m: number): number {
  let n = SPY_MISSIONS[m]?.turns ?? 0;
  if (SPY_MISSIONS[m]?.offensive && goldenDedication(state, unit.seat, DED_BODYGUARD)) {
    n = Math.max(1, Math.floor((n * BODYGUARD_OP_NUM) / BODYGUARD_OP_DEN));
  }
  // CIV6 (Machiavellianism, EFFECT_ADJUST_UNIT_SPY_OFFENSIVE_OPERATION_TIME):
  // "Spy operations take 25% less time" — the offensive ones, after the
  // dedication's own cut
  const policyCut = SPY_MISSIONS[m]?.offensive ? Math.min(100, getModifiers(state, unit.seat).spyOffenseTimeCutPct) : 0;
  if (policyCut > 0) n = Math.max(1, Math.floor((n * (100 - policyCut)) / 100));
  // CIV6 (Linguist): "Time to complete all missions reduced by 25%" — every
  // mission, the defensive post included, and after the dedication's own cut.
  const cut = promoValue(unit, 'SPY_OP_SPEED');
  if (cut > 0) n = Math.max(1, Math.floor((n * (100 - cut)) / 100));
  return n;
}

/** CIV6 (Disguise; Bodyguard of Lies): "Takes no time to establish presence in
 *  an enemy city." The establish clock is the TRAVEL clock here — the only
 *  thing between being sent and being able to work. */
export function spyNoEstablish(state: GameState, unit: Unit): boolean {
  return promoFlag(unit, 'SPY_NO_ESTABLISH')
    || goldenDedication(state, unit.seat, DED_BODYGUARD);
}

/** CIV6 (Quartermaster): "If this Spy is in home territory, all your Spies
 *  operate at +1 level." */
export function quartermasterLevels(state: GameState, seat: number): number {
  let n = 0;
  for (const u of spiesOf(state, seat)) {
    if (tileSeat(state.map.tiles[u.tileIndex]) === seat) {
      n += promoValue(u, 'SPY_HOME_ALLY_LEVEL');
    }
  }
  return n;
}

export function beginMission(state: GameState, unit: Unit, m: number): boolean {
  if (!missionOffered(state, unit, m)) return false;
  unit.spyMission = m;
  unit.spyTurns = missionTurns(state, unit, m);
  unit.movesLeft = 0;
  return true;
}

/** CIV6 (Spy): a spy "may gain levels from successful offensive operations, or
 *  capturing an enemy Spy", and on each level is "able to choose one of three
 *  promotions ... chosen at random from the pool" — `drawPromoOffer`. */
export function levelUpSpy(state: GameState, unit: Unit): void {
  const before = spyLevel(unit);
  unit.spyLevel = Math.min(SPY_MAX_LEVEL, before + 1);
  if (unit.spyLevel === before) return;
  drawPromoOffer(state, unit);
}

export function spyLevel(unit: Unit): number {
  return Math.min(SPY_MAX_LEVEL, unit.spyLevel ?? 0);
}

/**
 * CIV6 (Gain Sources): "Spies in this city operate at 2 levels higher for 24
 * turns" — the seat's own clock on that city; and, the other way,
 * (Diplomatic Quarter) "Enemy Spies operate at 2 levels below normal when
 * targeting this district or adjacent districts" and (Consulate) "Spies
 * operate at one level lower when targeting this city".
 */
export function effectiveLevel(
  state: GameState, unit: Unit, city: City | undefined, m: number,
): number {
  const boost = (city?.spySources ?? [])[unit.seat] ?? 0;
  // CIV6 (nine Espionage promotions): "<mission> as if 2 levels more
  // experienced" — the row names the one operation it lifts.
  const lvl = spyLevel(unit) + (boost > 0 ? SPY_SOURCES_LEVELS : 0)
    + promoValueFor(unit, 'SPY_OP_LEVEL', 1 << m)
    + quartermasterLevels(state, unit.seat)
    + congressPactLevels(state, m);
  return Math.max(0, lvl - (city ? cityCounterLevels(state, city, unit.tileIndex) : 0));
}

/** the district types of a city that are built and unpillaged — what a
 *  building standing in one needs before it pays anything. */
function liveDistrictTypes(state: GameState, city: City): Set<string> {
  const live = new Set<string>();
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.districtComplete && !t.districtPillaged) live.add(d.type);
  }
  return live;
}

/** the levels a city's own defences take off a spy working there — at
 *  `atTile`, the district it stands on, where the geometry matters. */
export function cityCounterLevels(state: GameState, city: City, atTile?: number): number {
  let n = 0;
  const live = liveDistrictTypes(state, city);
  // per INSTANCE — a repeatable district may stand more than once
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.districtComplete && !t.districtPillaged) n += DISTRICTS[d.type].spyLevelPenalty ?? 0;
  }
  const dark = darkBuildings(state.map, city);
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || !live.has(def.district) || dark.has(id)) continue;
    n += def.spyLevelPenalty ?? 0;
  }
  // CIV6 (Consulate): the penalty reaches "this city OR CITIES WITH
  // ENCAMPMENTS" — the second half is empire-wide, so a Consulate standing
  // anywhere covers every city of the seat holding a live Encampment. This
  // city's own Consulate counted just above, so only the others add here.
  if (live.has('ENCAMPMENT')) {
    for (const other of citiesOf(state, city.seat)) {
      if (other === city) continue;
      const lv = liveDistrictTypes(state, other);
      for (const id of other.buildings) {
        const def = BUILDINGS[id];
        if (def && lv.has(def.district)) n += def.spyLevelPenaltyEncampment ?? 0;
      }
    }
  }
  // CIV6 (Polygraph): "If this Spy is in home territory, enemy Spies in your
  // lands operate at 1 level below usual" — the posts standing in this city,
  // on whichever of its districts.
  for (const u of spiesOf(state, city.seat)) {
    if (!cityHoldsTile(city, u.tileIndex)) continue;
    n += promoValue(u, 'SPY_HOME_ENEMY_LEVEL');
    // CIV6 (Surveillance): "When Counterspying all city districts are defended
    // (and +1 level at districts within 1 hex)" — READING: the post operates a
    // level higher against a spy working within that reach of it, which is
    // one level off the intruder.
    const surv = promoValue(u, 'SPY_SURVEIL');
    if (surv > 0 && u.spyMission === SPY_M_COUNTERSPY && atTile !== undefined) {
      const a = state.map.tiles[u.tileIndex];
      const b = state.map.tiles[atTile];
      if (hexDistance(state.map, a.col, a.row, b.col, b.row) <= SPY_SURVEILLANCE_REACH) n += surv;
    }
  }
  // CIV6 (Local Informants): "Enemy Spies operate at 3 levels below normal in
  // this city."
  return n + governorSum(state, city, (e) => e.spyLevelPenalty);
}

/** CIV6 (Neutralize Governor): "can only be performed in a city with a
 *  Governor" — the holder's roster answers directly. */
function hasGovernor(state: GameState, holder: Seat, city: City): boolean {
  return holder.cities.includes(city) && cityHasGovernor(state, city);
}

/** the holder's counterspy that PURSUES a spy working at `tileIndex` — the
 *  FIRST in the holder's unit list (GameCore_XP2_Release.dll finder 0x52ac80,
 *  tools/civ6lab/dll_readings.md "C-16"), whatever its level: a post within
 *  hex distance 1 of the plot, any district of any city — CIV6
 *  (LOC_ESPIONAGECHOOSER_COUNTERSPY) a post will "Protect {1_District} (and
 *  all adjacent districts) from enemy spies" — or anywhere in the plot's city
 *  with (Surveillance) "When Counterspying all city districts are defended". */
function counterspyPursuing(state: GameState, holder: number, city: City, tileIndex: number): Unit | undefined {
  const at = state.map.tiles[tileIndex];
  return state.units.find((u) => {
    if (u.seat !== holder || !isSpy(u.type) || u.spyMission !== SPY_M_COUNTERSPY) return false;
    const p = state.map.tiles[u.tileIndex];
    return hexDistance(state.map, p.col, p.row, at.col, at.row) <= 1
      || (cityHoldsTile(city, u.tileIndex) && promoValue(u, 'SPY_SURVEIL') > 0);
  });
}

/** CIV6 (Great Work Heist): "Great Works of Writing will be displayed first,
 *  Great Works of Art and Artifacts second, and Great Works of Music last."
 *  The work taken is the LAST placed of the first kind present, and the
 *  thief needs a city with an open slot that takes it. */
function heistTarget(state: GameState, thief: number, city: City): GreatWork | null {
  for (const kind of [GW_KIND_WRITING, GW_KIND_ART, GW_KIND_MUSIC]) {
    const w = gwLastOfKind(city, kind);
    if (w) return citiesOf(state, thief).some((c) => gwHasRoom(state, c, w.obj)) ? w : null;
  }
  return null;
}

/** CIV6 (Steal Tech Boost): "cannot be executed if this civilization hasn't
 *  discovered any of the techs you don't have." */
function stealableTech(state: GameState, thief: number, victim: number): string | null {
  const a = seatOf(state, thief);
  const b = seatOf(state, victim);
  if (!a || !b) return null;
  for (const id of Object.keys(TECHS)) {
    if (!b.research.techs.includes(id)) continue;
    if (a.research.techs.includes(id) || a.research.boosted.includes(id)) continue;
    return id;
  }
  return null;
}

/**
 * One turn of every spy this seat owns: arrivals first, then the missions that
 * ran out their clock. Called once per seat phase, on both engines.
 */
export function tickSpies(state: GameState, seat: number): void {
  for (const unit of spiesOf(state, seat)) {
    const kind = unit.spyMission ?? SPY_IDLE;
    if (kind === SPY_IDLE) continue;
    unit.spyTurns = (unit.spyTurns ?? 0) - 1;
    if ((unit.spyTurns ?? 0) > 0) continue;
    unit.spyTurns = 0;
    if (kind === SPY_TRAVELLING) {
      if (unit.spyTarget !== undefined) unit.tileIndex = unit.spyTarget;
      unit.spyTarget = undefined;
      unit.spyMission = SPY_IDLE;
      continue;
    }
    resolveMission(state, unit, kind);
  }
}

/** the per-turn decay of the clock a mission leaves behind. The governor's
 *  own neutralize clock ticks with the roster, in `governorPhase`. */
export function tickSpyEffects(state: GameState, seat: number): void {
  for (const city of citiesOf(state, seat)) {
    const src = city.spySources;
    if (src) for (let i = 0; i < src.length; i++) if (src[i] > 0) src[i] -= 1;
  }
}

/** The six outcomes of a spy mission's roll, ranked by MARGIN — the two
 *  successes first, so `out <= MISSION_SUCCESS_MUST_ESCAPE` is "it worked". */
export const MISSION_SUCCESS_UNDETECTED = 0;
export const MISSION_SUCCESS_MUST_ESCAPE = 1;
export const MISSION_FAIL_UNDETECTED = 2;
export const MISSION_FAIL_MUST_ESCAPE = 3;
export const MISSION_CAPTURED = 4;
export const MISSION_KILLED = 5;

/** the 3d6's count of each sum (`SPY_ROLL_DICE` dice of `SPY_ROLL_FACES`):
 *  the table both espionage rolls weigh their bands by (GameCore_XP2
 *  0xf02c70: 0, 0, 0, 1, 3, 6, ... of 216) */
export const DICE_COUNTS: readonly number[] = (() => {
  let c = [1];
  for (let d = 0; d < SPY_ROLL_DICE; d++) {
    const n = new Array<number>(c.length + SPY_ROLL_FACES).fill(0);
    c.forEach((x, s) => { for (let f = 1; f <= SPY_ROLL_FACES; f++) n[s + f] += x; });
    c = n;
  }
  return c;
})();

/** the dice's count over sums lo..hi (0x52b5c0) */
function diceBand(lo: number, hi: number): number {
  let n = 0;
  for (let r = Math.max(0, lo); r <= Math.min(DICE_COUNTS.length - 1, hi); r++) n += DICE_COUNTS[r];
  return n;
}

const clampTo = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * A MISSION's six bands as the game weighs them (GameCore_XP2_Release.dll
 * 0x52b8f0, `tools/civ6lab/dll_readings.md` "C-16"): the needed roll is
 * T = t + 2, t the threshold (`missionThreshold`, the pursuing counterspy's
 * term added), and each band the 3d6 count over its sums, ascending — killed
 * 3 .. a1 − 1, captured a1 .. a2 − 1, fail-must-escape a2 .. a3 − 1,
 * fail-undetected a3 .. a4 − 1, success-must-escape a4 .. a5 − 1,
 * success-undetected a5 .. 18 — with a5 = T, a4 = T − 2, a3 = T − 3,
 * a2 = T − 5, a1 = T − 7, each held to its window (8..18, 7..17, 6..16,
 * 5..15, 4..14), so no band is ever certain or impossible. Measured
 * (`tools/civ6lab/spy_probe.lua`): base 13, k = 2 reads 66/61/32/54/29/11 of
 * 256 — 56/52/27/46/25/10 of 216 here. The weights in the draw's order
 * (killed first); the band at weight index i is outcome 5 − i.
 */
export function missionWeights(t: number): number[] {
  const T = t + 2;
  const a5 = clampTo(T, 8, 18);
  const a4 = clampTo(T - 2, 7, 17);
  const a3 = clampTo(T - 3, 6, 16);
  const a2 = clampTo(T - 5, 5, 15);
  const a1 = clampTo(T - 7, 4, 14);
  return [diceBand(3, a1 - 1), diceBand(a1, a2 - 1), diceBand(a2, a3 - 1), diceBand(a3, a4 - 1),
    diceBand(a4, a5 - 1), diceBand(a5, 18)];
}

/** "Rolling Espionage Result" for a mission (0x52b2a0): ONE weighted draw
 *  over `missionWeights`, the outcome (`MISSION_*`). `_mission_draw` is the
 *  twin. */
export function missionDraw(state: GameState, t: number): number {
  return 5 - randWeighted(state, missionWeights(t), 'Rolling Espionage Result');
}

/** An ESCAPE's three bands (0x52b090): killed 3 .. v − 3, caught v − 2 ..
 *  v − 1, away v .. 18, the 3d6 count over each, in that order. */
export function escapeWeights(v: number): number[] {
  const c = SPY_ESCAPE_CAPTURE_BAND;
  return [diceBand(3, v - c - 1), diceBand(v - c, v - 1), diceBand(v, 18)];
}

/** T = BaseProbability - k, k = SPY_ROLL_LEVEL_BASE + the level the mission
 *  rolls with (`effectiveLevel` in a city, `minorMissionLevel` at a minor):
 *  a fresh Recruit reads k = 2, Gain Sources' +2 levels reads k = 4, a
 *  promotion's +2 on its own operation likewise. */
export function missionThreshold(def: SpyMissionDef, lvl: number): number {
  return (def.baseProbability ?? 0) - (SPY_ROLL_LEVEL_BASE + lvl);
}

/** The level a mission at a MINOR rolls with: no city, so no Gain Sources
 *  clock and no counter levels. */
export function minorMissionLevel(state: GameState, unit: Unit, m: number): number {
  return Math.max(0, spyLevel(unit) + promoValueFor(unit, 'SPY_OP_LEVEL', 1 << m)
    + quartermasterLevels(state, unit.seat) + congressPactLevels(state, m));
}

function resolveMission(state: GameState, unit: Unit, m: number): void {
  const def = SPY_MISSIONS[m];
  const here = spyCity(state, unit);
  unit.spyMission = SPY_IDLE;
  if (!def) return;
  if (def.citystate) {
    resolveMinorMission(state, unit, m, def);
    return;
  }
  if (!here) return;
  if (m === SPY_M_COUNTERSPY || m === SPY_M_LISTENING_POST) {
    // Both stand their posts rather than ending: counter-espionage runs until
    // the spy is sent elsewhere, and CIV6 (Diplomatic Visibility) has the
    // Listening Post's level live only while the mission is being performed.
    unit.spyMission = m;
    unit.spyTurns = missionTurns(state, unit, m);
    return;
  }
  const lvl = effectiveLevel(state, unit, here.city, m);
  // the pursuing counterspy lowers the realised roll by 3 plus 1 per level
  // above the first (`ComputeNeededDieRoll` 0x529b60)
  const post = counterspyPursuing(state, here.seat.seat, here.city, unit.tileIndex);
  const guard = post ? SPY_COUNTERSPY_ROLL + SPY_COUNTERSPY_LEVEL_ROLL * spyLevel(post) : 0;
  const out = def.certain ? MISSION_SUCCESS_UNDETECTED
    : missionDraw(state, missionThreshold(def, lvl) + guard);
  // CIV6 (DIPLOACTION_KEEP_PROMISE_DONT_SPY): an offensive operation run in
  // the city is the spying the promise forbids, whatever its outcome
  if (def.offensive) promiseIncursion(state, here.seat.seat, unit.seat, PROMISE_SPY, 1);
  if (out <= MISSION_SUCCESS_MUST_ESCAPE) {
    applyMission(state, unit, m, here.city, here.seat.seat, lvl);
    if (def.offensive) {
      // CIV6: "Spies ... gain levels by successfully completing offensive
      // missions", and Bodyguard of Lies pays "+1 Era Score for each
      // successful offensive operation."
      levelUpSpy(state, unit);
      dedicationEvent(state, unit.seat, DED_BODYGUARD);
    }
  }
  if (def.certain) return;
  spyAftermath(state, unit, out, here.city.districts, here.seat.seat);
  if (post && out >= MISSION_CAPTURED) rewardCounterspy(state, post);
}

/** CIV6 (RewardCounterSpy, GameCore_XP2_Release.dll 0x52d420, called by every
 *  mission's result handler once the intruder is captured or killed, never by
 *  the escape): the pursuing counterspy is teleported to the centre of the
 *  city whose plot it stands on (0x52bf50), which ends its operation, and
 *  below `ESPIONAGE_MAX_LEVEL` it gains the experience to its next level
 *  (0x55e460 / 0x55d990). A plot no city holds has no centre to land on, and
 *  the teleport kills the spy instead. */
function rewardCounterspy(state: GameState, post: Unit): void {
  const at = spyCityAt(state, post.tileIndex);
  if (!at) {
    disbandUnit(state, post.id);
    return;
  }
  post.tileIndex = at.city.centerIndex;
  post.spyMission = SPY_IDLE;
  post.spyTarget = undefined;
  post.spyTurns = 0;
  levelUpSpy(state, post);
}

/**
 * CIV6 (Fabricate Scandal): the one CITY-STATE mission. On success "all other
 * players lose a number of Envoys determined by the Spy's level" — every
 * rival's stake at this minor, MODEL-mapped as base + 1 per effective level.
 * A failure runs the same escape sequence off the minor's own registry.
 */
function resolveMinorMission(state: GameState, unit: Unit, m: number, def: SpyMissionDef): void {
  const minor = spyMinorAt(state, unit.tileIndex);
  if (!minor) return;
  const lvl = minorMissionLevel(state, unit, m);
  const out = missionDraw(state, missionThreshold(def, lvl));
  if (out <= MISSION_SUCCESS_MUST_ESCAPE) {
    if (m === SPY_M_FABRICATE_SCANDAL) {
      const k = SPY_SCANDAL_ENVOYS_BASE + SPY_SCANDAL_PER_LEVEL * lvl;
      for (const s of state.seats) {
        if (s.seat === unit.seat) continue;
        const have = envoysOf(minor, s.seat);
        if (have > 0) minor.envoys[s.seat] = Math.max(0, have - k);
      }
      resolveSuzerain(state, minor);
    }
    levelUpSpy(state, unit);
    dedicationEvent(state, unit.seat, DED_BODYGUARD);
  }
  // a minor keeps no cell, so a catch there ends the career
  spyAftermath(state, unit, out, minor.districts ?? [], -1);
}

/**
 * CIV6 (Espionage): a discovered spy "will need to escape from the target
 * city" — by Airplane, Boat, Vehicle or on Foot, gated on the city's own
 * districts, and a survivor reappears in the CAPITAL after the route's ride
 * home. The spy takes the FASTEST route whose district stands (the driver's
 * choice where the real game asks the player). The police cover one offered
 * route, drawn with weight (longest TravelTime − the route's own + 1)
 * (`policeCover`); the target v is the install's base less a level term per
 * level above the first (Ace Driver "+4 levels" among them), +4 when the
 * police cover the route taken, and no counterspy term — ResolveEscape
 * passes none (GameCore_XP2_Release.dll 0x52ce40). One "Rolling Espionage
 * Result" (0x52aea0): ONE weighted draw over the escape's bands
 * (`escapeWeights`) — away at v or over; on v − 2 .. v − 1 caught,
 * "imprisoned, but not killed" where a MAJOR runs the prison — a minor keeps
 * no cell, so its catch ends the career — and below that killed.
 */
function spyEscape(state: GameState, unit: Unit,
                   districts: { type: string; tileIndex: number }[], jailer: number): void {
  const live = new Set<string>();
  for (const d of districts) {
    const dt = state.map.tiles[d.tileIndex];
    if (dt?.districtComplete && !dt.districtPillaged) live.add(d.type);
  }
  const offered = SPY_ESCAPE_ROUTES.filter((r) => r.district === null || live.has(r.district));
  const route = offered[0];
  const guessed = policeCover(state, offered) === route;
  const v = SPY_ESCAPE_BASE
    - SPY_ESCAPE_LEVEL * (spyLevel(unit) + promoValue(unit, 'SPY_ESCAPE_LEVEL'))
    - (guessed ? SPY_ESCAPE_POLICE : 0);
  const band = randWeighted(state, escapeWeights(v), 'Rolling Espionage Result');
  if (band === 2) {
    const home = citiesOf(state, unit.seat).find((c) => c.isCapital)
      ?? citiesOf(state, unit.seat)[0];
    if (!home) {
      disbandUnit(state, unit.id);
      return;
    }
    unit.spyMission = SPY_TRAVELLING;
    unit.spyTarget = home.centerIndex;
    unit.spyTurns = route.turns;
    return;
  }
  if (jailer >= 0 && band === 1) {
    spyCaptured(state, unit, jailer);
    return;
  }
  disbandUnit(state, unit.id);
}

/** The police's cover — ONE draw over the offered routes, each weighted by
 *  the longest route's TravelTime − its own + 1 (GameCore_XP2_Release.dll
 *  "Police Exit Covered" 0x528560): on foot 1, by vehicle 2, by boat 3, by
 *  air 4. */
function policeCover(state: GameState, offered: readonly (typeof SPY_ESCAPE_ROUTES)[number][]): (typeof SPY_ESCAPE_ROUTES)[number] {
  const longest = Math.max(...SPY_ESCAPE_ROUTES.map((r) => r.turns));
  return offered[randWeighted(state, offered.map((r) => longest - r.turns + 1), 'Police Exit Covered')];
}

/** The catch — from the roll's own CAPTURED band or an escape's. The capture
 *  itself (GameCore_XP2_Release.dll 0x529450) pays the counterspy nothing:
 *  its reward is `rewardCounterspy`, the mission's own. */
function spyCaptured(state: GameState, unit: Unit, jailer: number): void {
  // CIV6: captured spies "are imprisoned, but not killed", and the owner
  // "can then attempt to trade with the civilization who captured the Spy,
  // securing their release" — at the level it was caught at.
  holdSpy(state, unit.seat, jailer, spyLevel(unit));
  disbandUnit(state, unit.id);
}

/**
 * What the roll's band does to the spy once the mission's own effect has
 * landed: nothing for the two UNDETECTED bands, the escape sequence for the
 * two MUST-ESCAPE bands (a success can still be seen), the catch for
 * CAPTURED where a major runs a cell — a minor keeps none, so its catch ends
 * the career like KILLED.
 */
function spyAftermath(state: GameState, unit: Unit, out: number,
                      districts: { type: string; tileIndex: number }[], jailer: number): void {
  if (out === MISSION_SUCCESS_UNDETECTED || out === MISSION_FAIL_UNDETECTED) return;
  if (out === MISSION_SUCCESS_MUST_ESCAPE || out === MISSION_FAIL_MUST_ESCAPE) {
    spyEscape(state, unit, districts, jailer);
    return;
  }
  if (out === MISSION_CAPTURED && jailer >= 0) {
    spyCaptured(state, unit, jailer);
    return;
  }
  disbandUnit(state, unit.id);
}

function applyMission(state: GameState, unit: Unit, m: number, city: City, holder: number, lvl: number): void {
  const owner = seatOf(state, unit.seat);
  const victim = seatOf(state, holder);
  if (!owner || !victim) return;
  switch (m) {
    case SPY_M_BREACH_DAM: {
      // CIV6 (Breach Dam): "damage (i.e., pillage) the district, causing a
      // Flood and leaving the city vulnerable to damage from Floods until the
      // Dam is repaired" — the pillage lands FIRST, so the flood it starts
      // finds the shield already down.
      const dam = city.districts.find(
        (d) => DISTRICTS[d.type].floodShield && state.map.tiles[d.tileIndex].districtComplete,
      );
      if (!dam) return;
      const dt = state.map.tiles[dam.tileIndex];
      dt.districtPillaged = true;
      floodRiver(state, dt, floodSeverity(state));
      return;
    }
    case SPY_M_GAIN_SOURCES: {
      const src = city.spySources ?? (city.spySources = state.seats.map(() => 0));
      while (src.length <= unit.seat) src.push(0);
      src[unit.seat] = SPY_SOURCES_TURNS;
      return;
    }
    case SPY_M_SIPHON_FUNDS: {
      // CIV6: "The Spy will steal the Gold income this district has
      // accumulated for the duration of the mission" — the Commercial Hub's
      // own gold, over the turns it ran.
      // the take is the hub's income over the mission's own duration, which
      // the modifiers on the CLOCK do not shorten.
      const take = commercialGold(state, city) * (SPY_MISSIONS[SPY_M_SIPHON_FUNDS]?.turns ?? 0);
      victim.treasury = Math.max(0, victim.treasury - take);
      owner.treasury += take;
      return;
    }
    case SPY_M_GREAT_WORK_HEIST: {
      const w = heistTarget(state, unit.seat, city);
      if (!w) return;
      const home = citiesOf(state, unit.seat).find((c) => gwHasRoom(state, c, w.obj));
      if (home) moveGreatWork(state, city, w.slot, home);
      return;
    }
    case SPY_M_SABOTAGE_PRODUCTION:
      // CIV6 (Sabotage Production): "Pillage all buildings in the industrial
      // zone." — the BUILDINGS, not the district: its adjacency keeps paying
      // while the Workshop and its successors stand dark until repaired.
      for (const id of city.buildings) {
        if (BUILDINGS[id]?.district === 'INDUSTRIAL_ZONE') pillageBuilding(city, id);
      }
      return;
    case SPY_M_DISRUPT_ROCKETRY:
      pillageDistrict(state, city, 'SPACEPORT');
      return;
    case SPY_M_RECRUIT_PARTISANS: {
      // CIV6: "2-4 rebel anti-cavalry units ... their level will match the
      // current World Era", and the mission "pillages the Neighborhood
      // district to prevent Spies from completing it in rapid succession."
      const span = SPY_PARTISANS_MAX - SPY_PARTISANS_MIN + 1;
      const n = SPY_PARTISANS_MIN + randRange(state, span, 'Engine: partisans');
      const chassis = partisanChassis(state);
      if (chassis) for (let i = 0; i < n; i++) spawnUnit(state, chassis, city.centerIndex, BARB_SEAT);
      pillageDistrict(state, city, 'NEIGHBORHOOD');
      return;
    }
    case SPY_M_STEAL_TECH_BOOST: {
      const id = stealableTech(state, unit.seat, holder);
      if (id) markBoost(state, owner.seat, id);
      return;
    }
    case SPY_M_FOMENT_UNREST:
      city.loyalty = Math.max(0, (city.loyalty ?? 100) - (SPY_UNREST_LOYALTY + SPY_UNREST_PER_LEVEL * lvl));
      return;
    case SPY_M_NEUTRALIZE_GOVERNOR: {
      // the clock follows the PERSON: they leave the city and cannot be
      // assigned again until it runs out.
      const gi = governorAt(state, city);
      const owner = seatOf(state, city.seat);
      if (gi >= 0 && owner) {
        neutralizeGovernor(governorsOf(owner)[gi], SPY_GOVERNOR_TURNS);
      }
      return;
    }
    default:
      return;
  }
}

function pillageDistrict(state: GameState, city: City, district: string): void {
  for (const d of city.districts) {
    if (d.type !== district) continue;
    const t = state.map.tiles[d.tileIndex];
    if (t?.districtComplete) t.districtPillaged = true;
  }
}

function commercialGold(state: GameState, city: City): number {
  return city.districts.filter((d) => d.type === 'COMMERCIAL_HUB'
    && state.map.tiles[d.tileIndex]?.districtComplete
    && !state.map.tiles[d.tileIndex]?.districtPillaged).length;
}

/** the ANTI-CAVALRY chassis of the world era — the rebels' own class. */
function partisanChassis(state: GameState): string | undefined {
  const era = worldEraIndex(state);
  let best: string | undefined;
  let bestEra = -1;
  for (const [id, def] of Object.entries(UNITS)) {
    if (!def.antiCavalry) continue;
    const e = UNIT_ERA_INDEX[id] ?? 0;
    if (e <= era && e >= bestEra) {
      bestEra = e;
      best = id;
    }
  }
  return best;
}

export function spyIsCounterspy(unit: Unit): boolean {
  return isSpy(unit.type) && unit.spyMission === SPY_M_COUNTERSPY;
}
