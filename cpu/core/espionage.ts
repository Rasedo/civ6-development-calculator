/**
 * THE ESPIONAGE SYSTEM. A Spy is a civilian that never walks: it JUMPS between
 * revealed cities, establishes, and runs one mission at a time out of a
 * district of the city it stands in.
 *
 * CIV6 (Espionage): "Spies act in cities. Spy missions may be performed in
 * enemy cities and your own, and what exactly they will do depends on the city
 * you send them to."
 */
import { hexDistance } from '../../world/hex';
import { UNITS, UNIT_ERA_INDEX } from '../data/units';
import { setSpyHeld, spiesHeldOf, spyHeldWith } from './deals';
import { TECHS } from '../data/techs';
import {
  SPY_UNIT, SPY_CAPACITY_CIVICS, SPY_CAPACITY_TECHS, SPY_CAPACITY_MAX,
  SPY_MAX_LEVEL, SPY_IDLE, SPY_TRAVELLING, SPY_MISSIONS, SPY_TRAVEL_COLS,
  SPY_TRAVEL_TURNS_MIN, SPY_TRAVEL_TILES_PER_TURN,
  SPY_TRAVEL_TURNS_MAX, SPY_SUCCESS_PER_LEVEL_PCT,
  SPY_CAPTURE_PCT, SPY_COUNTERSPY_CATCH_PCT, BODYGUARD_OP_NUM, BODYGUARD_OP_DEN,
  SPY_UNREST_LOYALTY, SPY_UNREST_PER_LEVEL, SPY_GOVERNOR_TURNS,
  SPY_GOVERNOR_PER_LEVEL, SPY_SOURCES_LEVELS, SPY_SOURCES_TURNS, SPY_PROMO_OFFER,
  SPY_PARTISANS_MIN, SPY_PARTISANS_MAX,
  SPY_M_GAIN_SOURCES, SPY_M_SIPHON_FUNDS, SPY_M_GREAT_WORK_HEIST,
  SPY_M_SABOTAGE_PRODUCTION, SPY_M_STEAL_TECH_BOOST, SPY_M_RECRUIT_PARTISANS,
  SPY_M_DISRUPT_ROCKETRY, SPY_M_FOMENT_UNREST, SPY_M_NEUTRALIZE_GOVERNOR, SPY_M_BREACH_DAM,
  SPY_M_COUNTERSPY, SPY_M_LISTENING_POST,
} from '../data/espionage';
import { BARB_SEAT, citiesOf, isCiv, seatOf, seatsAllied, tileSeat } from './seats';
import { DED_BODYGUARD } from '../data/seats';
import { goldenDedication, dedicationEvent, worldEraIndex } from './eras';
import { cityHasGovernor, governorAt, governorsOf, neutralizeGovernor } from './governors';
import { seatBuildingSum } from './city';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { governorSum } from './governors';
import { floodRiver } from './disasters';
import { nextRandom } from './rand';
import { promoFlag, promoValue, promoValueFor, unitPromoRows, xpToNextLevel } from './promotions';
import { disbandUnit, spawnUnit } from './units';
import { congressPactBanned, congressPactLevels } from './congress';
import type { City, GameState, Seat, Unit } from './types';

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

/** the city whose CENTRE this spy stands on, whoever holds it. */
export function spyCity(state: GameState, unit: Unit): { seat: Seat; city: City } | undefined {
  for (const actor of state.seats) {
    const city = actor.cities.find((c) => c.centerIndex === unit.tileIndex);
    if (city) return { seat: actor, city };
  }
  return undefined;
}

function cityHasDistrict(state: GameState, city: City, district: string): boolean {
  if (district === 'CITY_CENTER') return true;
  return city.districts.some((d) => {
    if (d.type !== district) return false;
    const t = state.map.tiles[d.tileIndex];
    return !!t?.districtComplete && !t.districtPillaged;
  });
}

/**
 * CIV6: "You may send a Spy to any city you have revealed (provided you don't
 * have an alliance with that civilization)". Ordered by CENTRE TILE INDEX
 * ascending and cut to the head's width, so both engines agree on column k
 * without shipping a list.
 */
export function spyDestinations(state: GameState, unit: Unit, width = SPY_TRAVEL_COLS): number[] {
  const s = seatOf(state, unit.seat);
  if (!s || !isSpy(unit.type)) return [];
  const out: number[] = [];
  for (const tile of state.map.tiles) {
    if (tile.index === unit.tileIndex) continue;
    if (s.explored.length > 0 && s.explored[tile.index] !== 1) continue;
    const here = spyCityAt(state, tile.index);
    if (!here || seatsAllied(state, unit.seat, here.holder)) continue;
    out.push(tile.index);
    if (out.length >= width) break;
  }
  return out;
}

function spyCityAt(state: GameState, tileIndex: number): { holder: number; city: City } | undefined {
  for (const actor of state.seats) {
    const city = actor.cities.find((c) => c.centerIndex === tileIndex);
    if (city) return { holder: actor.seat, city };
  }
  return undefined;
}

/** MODEL: the source names four travel modes with "their own travel time" and
 *  publishes none of them; distance is what this model reads. */
export function spyTravelTurns(state: GameState, from: number, to: number): number {
  const a = state.map.tiles[from];
  const b = state.map.tiles[to];
  if (!a || !b) return SPY_TRAVEL_TURNS_MIN;
  const d = hexDistance(a.col, a.row, b.col, b.row);
  return Math.min(SPY_TRAVEL_TURNS_MAX,
    SPY_TRAVEL_TURNS_MIN + Math.floor(d / SPY_TRAVEL_TILES_PER_TURN));
}

export function spyIdle(unit: Unit): boolean {
  return (unit.spyMission ?? SPY_IDLE) === SPY_IDLE;
}

export function canTravelTo(state: GameState, unit: Unit, tileIndex: number): boolean {
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
  const here = spyCity(state, unit);
  if (!here) return false;
  const mine = here.seat.seat === unit.seat;
  if (!!def.athome !== mine) return false;
  if (!cityHasDistrict(state, here.city, def.district)) return false;
  if (m === SPY_M_GREAT_WORK_HEIST && heistTarget(here.city) === null) return false;
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
 *  promotions ... chosen at random from the pool". The draw takes three
 *  DISTINCT columns without replacement, so the stream is exactly three
 *  numbers however the offer lands. */
export function levelUpSpy(state: GameState, unit: Unit): void {
  const before = spyLevel(unit);
  unit.spyLevel = Math.min(SPY_MAX_LEVEL, before + 1);
  if (unit.spyLevel === before) return;
  const rows = unitPromoRows(unit);
  let offer = 0;
  for (let j = 0; j < SPY_PROMO_OFFER && j < rows.length; j++) {
    let pick = Math.floor(nextRandom(state) * (rows.length - j));
    for (let k = 0; k < rows.length; k++) {
      if (offer & (1 << k)) continue;
      if (pick === 0) { offer |= 1 << k; break; }
      pick -= 1;
    }
  }
  unit.promoOffer = offer;
  unit.xp = xpToNextLevel(unit);
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
  return Math.max(0, lvl - (city ? cityCounterLevels(state, city) : 0));
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

/** the levels a city's own defences take off a spy working there. */
export function cityCounterLevels(state: GameState, city: City): number {
  let n = 0;
  const live = liveDistrictTypes(state, city);
  // per INSTANCE — a repeatable district may stand more than once
  for (const d of city.districts) {
    const t = state.map.tiles[d.tileIndex];
    if (t.districtComplete && !t.districtPillaged) n += DISTRICTS[d.type].spyLevelPenalty ?? 0;
  }
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || !live.has(def.district)) continue;
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
  // lands operate at 1 level below usual" — the posts standing in this city.
  for (const u of spiesOf(state, city.seat)) {
    if (u.tileIndex === city.centerIndex) n += promoValue(u, 'SPY_HOME_ENEMY_LEVEL');
  }
  // CIV6 (Local Informants): "Enemy Spies operate at 3 levels below normal in
  // this city."
  return n + governorSum(state, city, (e) => e.spyLevelPenalty);
}

/** CIV6 (Neutralize Governor): "can only be performed in a city with a
 *  Governor" — the holder's roster answers directly now. */
function hasGovernor(state: GameState, holder: Seat, city: City): boolean {
  return holder.cities.includes(city) && cityHasGovernor(state, city);
}

function counterspiesAt(state: GameState, holder: number, tileIndex: number): Unit[] {
  return state.units.filter(
    (u) => u.seat === holder && isSpy(u.type)
      && u.tileIndex === tileIndex && u.spyMission === SPY_M_COUNTERSPY,
  );
}

/** CIV6 (Great Work Heist): "Great Works of Writing will be displayed first,
 *  Great Works of Art and Artifacts second, and Great Works of Music last." */
function heistTarget(city: City): 'W' | 'A' | 'M' | null {
  if ((city.greatWorksWriting ?? 0) > 0) return 'W';
  if ((city.greatWorksArt ?? 0) > 0) return 'A';
  if ((city.greatWorksMusic ?? 0) > 0) return 'M';
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

function roll(state: GameState, pct: number): boolean {
  return Math.floor(nextRandom(state) * 100) < pct;
}

function resolveMission(state: GameState, unit: Unit, m: number): void {
  const def = SPY_MISSIONS[m];
  const here = spyCity(state, unit);
  unit.spyMission = SPY_IDLE;
  if (!def || !here) return;
  if (m === SPY_M_COUNTERSPY || m === SPY_M_LISTENING_POST) {
    // Both stand their posts rather than ending: counter-espionage runs until
    // the spy is sent elsewhere, and CIV6 (Diplomatic Visibility) has the
    // Listening Post's level live only while the mission is being performed.
    unit.spyMission = m;
    unit.spyTurns = missionTurns(state, unit, m);
    return;
  }
  const lvl = effectiveLevel(state, unit, here.city, m);
  const ok = def.certain
    || roll(state, (def.successPct ?? 0) + SPY_SUCCESS_PER_LEVEL_PCT * lvl);
  if (ok) {
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
  // CIV6: "when enemy Spies are performing missions in those districts, there
  // is a much higher chance than normal that they will be caught."
  const posted = counterspiesAt(state, here.seat.seat, unit.tileIndex);
  const caught = SPY_CAPTURE_PCT + (posted.length > 0 ? SPY_COUNTERSPY_CATCH_PCT : 0);
  if (!ok && roll(state, caught)) {
    // CIV6 (Spies and Espionage): a spy "may gain levels from successful
    // offensive operations, or capturing an enemy Spy" — the post that made
    // the catch likelier is the one that earns it, and the first of them by
    // slot is the captor on both engines.
    const captor = posted[0];
    if (captor) levelUpSpy(state, captor);
    // CIV6: captured spies "are imprisoned, but not killed", and the owner "can
    // then attempt to trade with the civilization who captured the Spy,
    // securing their release". It leaves the map either way; what a cell holds
    // is a COUNT, so the spy that comes home is a new one at level 1.
    const jailer = here.seat.seat;
    setSpyHeld(state, unit.seat, jailer, spyHeldWith(state, unit.seat, jailer) + 1);
    disbandUnit(state, unit.id);
  }
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
      floodRiver(state, dt);
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
      const kind = heistTarget(city);
      if (kind === 'W' && (city.greatWorksWriting ?? 0) > 0) {
        city.greatWorksWriting = (city.greatWorksWriting ?? 0) - 1;
        homeFor(state, unit, 'W');
      } else if (kind === 'A' && (city.greatWorksArt ?? 0) > 0) {
        city.greatWorksArt = (city.greatWorksArt ?? 0) - 1;
        homeFor(state, unit, 'A');
      } else if (kind === 'M' && (city.greatWorksMusic ?? 0) > 0) {
        city.greatWorksMusic = (city.greatWorksMusic ?? 0) - 1;
        homeFor(state, unit, 'M');
      }
      return;
    }
    case SPY_M_SABOTAGE_PRODUCTION:
      pillageDistrict(state, city, 'INDUSTRIAL_ZONE');
      return;
    case SPY_M_DISRUPT_ROCKETRY:
      pillageDistrict(state, city, 'SPACEPORT');
      return;
    case SPY_M_RECRUIT_PARTISANS: {
      // CIV6: "2-4 rebel anti-cavalry units ... their level will match the
      // current World Era", and the mission "pillages the Neighborhood
      // district to prevent Spies from completing it in rapid succession."
      const span = SPY_PARTISANS_MAX - SPY_PARTISANS_MIN + 1;
      const n = SPY_PARTISANS_MIN + Math.floor(nextRandom(state) * span);
      const chassis = partisanChassis(state);
      if (chassis) for (let i = 0; i < n; i++) spawnUnit(state, chassis, city.centerIndex, BARB_SEAT);
      pillageDistrict(state, city, 'NEIGHBORHOOD');
      return;
    }
    case SPY_M_STEAL_TECH_BOOST: {
      const id = stealableTech(state, unit.seat, holder);
      if (id) owner.research.boosted.push(id);
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
        neutralizeGovernor(governorsOf(owner)[gi], SPY_GOVERNOR_TURNS + SPY_GOVERNOR_PER_LEVEL * lvl);
      }
      return;
    }
    default:
      return;
  }
}

function homeFor(state: GameState, unit: Unit, kind: 'W' | 'A' | 'M'): void {
  const home = citiesOf(state, unit.seat)[0];
  if (!home) return;
  if (kind === 'W') home.greatWorksWriting = (home.greatWorksWriting ?? 0) + 1;
  else if (kind === 'A') home.greatWorksArt = (home.greatWorksArt ?? 0) + 1;
  else home.greatWorksMusic = (home.greatWorksMusic ?? 0) + 1;
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

export { isCiv };
