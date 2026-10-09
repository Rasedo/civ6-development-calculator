/**
 * THE CITY-STATES' QUESTS, as Game_Quests runs them (GameCore_XP2_Release.dll;
 * `tools/civ6lab/dll_readings.md` "H-1: the city-states' quests"). A pair —
 * a city-state (the client) and a major (the actor) — holds at most one
 * quest. One is given (`giveQuest`, 0x939980) when the game era changes, to
 * every pair in turn (`giveEraQuests`), and when the two meet: the pair's
 * last completed type skipped, the types valid for the pair kept in logic
 * order (`QUEST_TYPES`), one draw over their count, then the type's own
 * picker draws its target over the targets valid for the pair. A quest ends
 * when its event fires — completed, the actor sends the city-state its
 * envoy (`QUEST_ENVOYS`) — or when it can no longer be done (failed). Quests
 * do not expire; a pair waits for the next era or meeting for its next one.
 */
import type { CityState, CityStateQuest, GameState, GreatPersonClass } from './types';
import type { DistrictId } from '../../world/types';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { civOf, civsAtWar, citiesOf, isCiv, leaderOf, majorityReligionOf, seatOf, unitsOf } from './seats';
import { addEnvoys, hasMet } from './cityStates';
import { randRange, type DrawLabel } from './rand';
import { civEraIndex } from './city';
import { getModifiers } from './effects';
import { gpCapped, gpOffer } from './greatPeople';
import { hexDistance, neighbors } from '../../world/hex';
import { isWater } from '../../world/query';
import { BOOSTLESS } from '../data/boosts';
import { SEAT_BANS } from '../data/civilizations';
import { CIVICS, CIVIC_TABLE_ORDER } from '../data/civics';
import { ERAS, TECHS, TECH_TABLE_ORDER } from '../data/techs';
import { GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import { UNITS, UNIT_INDEX, civUnitAllowed } from '../data/units';
import {
  QUEST_CAMP_RADIUS, QUEST_DISTRICTS, QUEST_DISTRICT_CIVIC, QUEST_DISTRICT_CIVS, QUEST_DISTRICT_MAX, QUEST_DISTRICT_PREREQ,
  QUEST_ENVOYS, QUEST_GP_CLASSES, QUEST_TYPES, QUEST_UNITS, type QuestType,
} from '../data/quests';

/** each type's picker label; the types absent draw no target */
const PICKER: Partial<Record<QuestType, DrawLabel>> = {
  TRAIN: 'Choosing random unit type for Train Unit quest',
  ZONE: 'Choosing random district type for Zone District quest',
  TECH: 'Choosing random tech type for Trigger Tech Boost quest',
  CIVIC: 'Choosing random civic type for Trigger Civic Boost quest',
  GREAT_PERSON: 'Choosing random class type for Recruit Great Person Class quest',
};

/** an era index of a tech or civic prerequisite, -1 for none */
function prereqEra(id: string | undefined, civic: boolean): number {
  if (!id) return -1;
  const e = civic ? CIVICS[id]?.era : TECHS[id]?.era;
  return e ? ERAS.indexOf(e) : -1;
}

/** a unit's era: the later of its tech's and its civic's (0x93e6c0), -1 for
 *  a unit with neither */
function unitEra(id: string): number {
  const d = UNITS[id];
  return d ? Math.max(prereqEra(d.requiresTech, false), prereqEra(d.requiresCivic, true)) : -1;
}

/** a player's era (0x467eb0): the latest era of its techs and civics */
function playerEra(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  return s ? civEraIndex(s.research.techs, s.research.civics) : 0;
}

/** an upgrade of `id` the seat has unlocked (0x84bc70): the upgrade's tech
 *  and civic held, and the upgrade the seat's own unit */
function unitObsolete(state: GameState, seat: number, id: string): boolean {
  const s = seatOf(state, seat);
  const next = UNITS[id]?.upgradesTo;
  const d = next ? UNITS[next] : undefined;
  if (!s || !next || !d) return false;
  return (!d.requiresTech || s.research.techs.includes(d.requiresTech))
    && (!d.requiresCivic || s.research.civics.includes(d.requiresCivic))
    && civUnitAllowed(civOf(state, seat), next, leaderOf(state, seat));
}

/** Train Unit's targets (0x84b860 / 0x84bdc0): the seat's own units with a
 *  combat strength, not upgraded past, of its era */
function trainTargets(state: GameState, seat: number): string[] {
  const civ = civOf(state, seat);
  const leader = leaderOf(state, seat);
  const pe = playerEra(state, seat);
  return QUEST_UNITS.filter((u) => UNITS[u] && civUnitAllowed(civ, u, leader) && !unitObsolete(state, seat, u) && unitEra(u) === pe);
}

/** Zone District's targets (0x84dc20 / 0x84e030): the seat's own districts
 *  needing population, of its era or before, below their MaxPerPlayer */
function zoneTargets(state: GameState, seat: number): string[] {
  const civ = civOf(state, seat) ?? '';
  const pe = playerEra(state, seat);
  const have = new Map<string, number>();
  for (const c of citiesOf(state, seat)) for (const d of c.districts) have.set(d.type, (have.get(d.type) ?? 0) + 1);
  const out: string[] = [];
  QUEST_DISTRICTS.forEach((id, i) => {
    const own = QUEST_DISTRICT_CIVS[i]
      ? QUEST_DISTRICT_CIVS[i] === civ
      : !QUEST_DISTRICT_CIVS.some((c, j) => c !== '' && c === civ && QUEST_DISTRICTS[j] === id);
    if (!own) return;
    const e = prereqEra(QUEST_DISTRICT_PREREQ[i], QUEST_DISTRICT_CIVIC[i]);
    if (e < 0 || e > pe) return;
    if (QUEST_DISTRICT_MAX[i] >= 0 && (have.get(id) ?? 0) >= QUEST_DISTRICT_MAX[i]) return;
    out.push(id);
  });
  return out;
}

/** Trigger Tech / Civic Boost's targets (0x84d630, 0x84cb90): neither held
 *  nor boosted, with a boost, of the seat's era — in the table's order */
function boostTargets(state: GameState, seat: number, civic: boolean): string[] {
  const s = seatOf(state, seat);
  if (!s) return [];
  const pe = playerEra(state, seat);
  const held = civic ? s.research.civics : s.research.techs;
  return (civic ? CIVIC_TABLE_ORDER : TECH_TABLE_ORDER).filter((id) => !held.includes(id) && !s.research.boosted.includes(id)
    && !BOOSTLESS.has(id) && ERAS.indexOf((civic ? CIVICS[id] : TECHS[id]).era) === pe);
}

/** a district of the seat's on a plot beside water — where a Great Admiral
 *  arrives (0x2f6500); none, and the seat can earn no Admiral */
function seaSpawn(state: GameState, seat: number): boolean {
  for (const c of citiesOf(state, seat)) {
    for (const d of c.districts) {
      const t = state.map.tiles[d.tileIndex];
      if (!isWater(t) && neighbors(state.map, t).some((n) => isWater(n))) return true;
    }
  }
  return false;
}

/** Recruit Great Person Class's targets (0x84ab50): a class the seat can
 *  earn (0x2f1ed0: on offer, not barred by its civilization or leader, not
 *  at its maximum, a place for the person to arrive) whose offer is of the
 *  seat's era or the next */
function gpTargets(state: GameState, seat: number): string[] {
  const s = seatOf(state, seat);
  if (!s) return [];
  const pe = playerEra(state, seat);
  const bans = getModifiers(state, seat).seatBans;
  return QUEST_GP_CLASSES.filter((cls) => {
    const at = gpOffer(state, cls);
    if (at < 0) return false;
    if ((cls === 'WRITER' && bans.has('greatWriter')) || (cls === 'PROPHET' && bans.has('greatProphet'))) return false;
    if (gpCapped(s, cls)) return false;
    if (cls === 'ADMIRAL' && !seaSpawn(state, seat)) return false;
    return GREAT_PEOPLE[cls][at].era <= pe + 1;
  });
}

/** the camps within reach of the city-state's centre */
function campsNear(state: GameState, cs: CityState): number[] {
  const c = state.map.tiles[cs.centerIndex];
  return state.barbSeat.camps.filter((i) => {
    const t = state.map.tiles[i];
    return hexDistance(state.map, c.col, c.row, t.col, t.row) <= QUEST_CAMP_RADIUS;
  });
}

/** each type's targets for the pair, in logic order */
function targets(state: GameState, cs: CityState, seat: number): Record<QuestType, (string | number | null)[]> {
  const s = seatOf(state, seat)!;
  return {
    CONVERT: s.religion.founded && majorityReligionOf(state, cs.seat) !== seat ? [seat] : [],
    TRADE: (s.tradeRoutes ?? []).some((r) => r.toCs === cs.id) ? [] : [null],
    CAMP: campsNear(state, cs).length > 0 ? [null] : [],
    TRAIN: trainTargets(state, seat),
    ZONE: zoneTargets(state, seat),
    TECH: boostTargets(state, seat, false),
    CIVIC: boostTargets(state, seat, true),
    GREAT_PERSON: gpTargets(state, seat),
  };
}

/** a major's seat that is still in the game */
function alive(state: GameState, seat: number): boolean {
  return citiesOf(state, seat).length > 0 || unitsOf(state, seat).length > 0;
}

/** the pair's standing quest, or null — failed first where it can no longer
 *  be done: the tech or civic researched, the unit upgraded past, the
 *  class off offer, no camp left near the city-state */
function standing(state: GameState, cs: CityState, seat: number): CityStateQuest | null {
  const q = cs.seatQuest?.[seat] ?? null;
  if (!q) return null;
  const s = seatOf(state, seat);
  let gone = false;
  switch (q.type) {
    case 'TECH': gone = !!s?.research.techs.includes(q.target as string); break;
    case 'CIVIC': gone = !!s?.research.civics.includes(q.target as string); break;
    case 'TRAIN': gone = unitObsolete(state, seat, q.target as string); break;
    case 'GREAT_PERSON': gone = gpOffer(state, q.target as GreatPersonClass) < 0; break;
    case 'CAMP': gone = campsNear(state, cs).length === 0; break;
    default: break;
  }
  if (gone) cs.seatQuest![seat] = null;
  return gone ? null : q;
}

/**
 * GIVE THE PAIR A QUEST (Game_Quests 0x939980): none while one stands; both
 * in the game, met, at peace (IsValidToStartQuest 0x849110); the types valid
 * for the pair but its last completed one, ONE draw over their count, then
 * the type's picker over its targets.
 */
export function giveQuest(state: GameState, cs: CityState, seat: number): void {
  if (!isCiv(seat) || !seatOf(state, seat)) return;
  if (standing(state, cs, seat)) return;
  if (!alive(state, seat) || !hasMet(cs, seat) || civsAtWar(state, cs.seat, seat)) return;
  const all = targets(state, cs, seat);
  const last = cs.seatQuestLast?.[seat] ?? null;
  const kinds = QUEST_TYPES.filter((k) => k !== last && all[k].length > 0);
  if (kinds.length === 0) return;
  const type = kinds[randRange(state, kinds.length, 'Selecting a random new quest')];
  const pool = all[type];
  const picker = PICKER[type];
  const target = picker ? pool[randRange(state, pool.length, picker)] : pool[0];
  (cs.seatQuest ??= [])[seat] = { type, target };
}

/** A NEW GAME ERA (0x93ac50): every pair, the city-states in player order,
 *  each with every major in seat order. */
export function giveEraQuests(state: GameState): void {
  for (const cs of [...state.cityStates].sort((a, b) => a.seat - b.seat)) {
    for (const s of state.seats) giveQuest(state, cs, s.seat);
  }
}

/** the pair's quest done: the envoy sent, the type remembered */
function complete(state: GameState, cs: CityState, seat: number): void {
  const q = cs.seatQuest![seat]!;
  cs.seatQuest![seat] = null;
  (cs.seatQuestLast ??= [])[seat] = q.type;
  addEnvoys(state, cs, seat, QUEST_ENVOYS);
  state.eventLog.push(`${cs.name} quest complete for ${seatOf(state, seat)?.name ?? `seat ${seat}`}: +${QUEST_ENVOYS} envoy.`);
}

/** every city-state whose quest for `seat` is of `type` and passes `hit` */
function settle(state: GameState, seat: number, type: QuestType, hit: (q: CityStateQuest, cs: CityState) => boolean): void {
  if (!isCiv(seat)) return;
  for (const cs of state.cityStates) {
    const q = cs.seatQuest?.[seat];
    if (q?.type === type && hit(q, cs)) complete(state, cs, seat);
  }
}

/** a unit added to `seat` — trained, bought, granted or upgraded into
 *  (0x84bf90); a unit upgraded past fails its quest first */
export function questUnitAdded(state: GameState, seat: number, type: string): void {
  if (!isCiv(seat)) return;
  for (const cs of state.cityStates) {
    const q = cs.seatQuest?.[seat];
    if (q?.type !== 'TRAIN') continue;
    if (unitObsolete(state, seat, q.target as string)) cs.seatQuest![seat] = null;
    else if (q.target === type) complete(state, cs, seat);
  }
}

/** a boost landed on `seat`'s `id` (0x84d750, 0x84ccb0) */
export function questBoosted(state: GameState, seat: number, id: string): void {
  settle(state, seat, TECHS[id] ? 'TECH' : 'CIVIC', (q) => q.target === id);
}

/** a district of `seat`'s completed (0x84e190) */
export function questDistrictBuilt(state: GameState, seat: number, district: string): void {
  settle(state, seat, 'ZONE', (q) => q.target === district);
}

/** a Great Person of `cls` recruited by `seat` (0x84ac50) */
export function questRecruited(state: GameState, seat: number, cls: string): void {
  settle(state, seat, 'GREAT_PERSON', (q) => q.target === cls);
}

/** a Trade Route of `seat`'s started to city-state `csId` (0x84b570) */
export function questRouteStarted(state: GameState, seat: number, csId: number): void {
  settle(state, seat, 'TRADE', (_q, cs) => cs.id === csId);
}

/** a barbarian camp at `tile` cleared by `seat` (0x849d60): the quests near
 *  it of that seat done */
export function questCampCleared(state: GameState, seat: number, tile: number): void {
  const t = state.map.tiles[tile];
  settle(state, seat, 'CAMP', (_q, cs) => {
    const c = state.map.tiles[cs.centerIndex];
    return hexDistance(state.map, c.col, c.row, t.col, t.row) <= QUEST_CAMP_RADIUS;
  });
}

/** the city-states' capitals now following a religion: each Convert quest
 *  whose capital follows its actor's religion done (0x84a200) */
export function questReligion(state: GameState): void {
  for (const cs of state.cityStates) {
    (cs.seatQuest ?? []).forEach((q, seat) => {
      if (q?.type === 'CONVERT' && majorityReligionOf(state, cs.seat) === q.target) complete(state, cs, seat);
    });
  }
}

/** a quest as the GPU twin stores it: [its type's place in `QUEST_TYPES` + 1
 *  (0 none), its target's index — the unit's in `UNITS`, the district's in
 *  `PLACEABLE_DISTRICTS`, the tech's in `TECHS`, the civic's in `CIVICS`,
 *  the class's in `GP_CLASSES`, the religion's seat; -1 none] */
export function questCode(q: CityStateQuest | null): [number, number] {
  if (!q) return [0, -1];
  const t = q.target;
  const target = (() => {
    switch (q.type) {
      case 'TRAIN': return UNIT_INDEX[t as string] ?? -1;
      case 'ZONE': return PLACEABLE_DISTRICTS.indexOf(t as DistrictId);
      case 'TECH': return TECH_KEYS.indexOf(t as string);
      case 'CIVIC': return CIVIC_KEYS.indexOf(t as string);
      case 'GREAT_PERSON': return GP_CLASSES.indexOf(t as GreatPersonClass);
      case 'CONVERT': return t as number;
      default: return -1;
    }
  })();
  return [QUEST_TYPES.indexOf(q.type) + 1, target];
}
const TECH_KEYS = Object.keys(TECHS);
const CIVIC_KEYS = Object.keys(CIVICS);

/** the quest tables as the GPU twin indexes them (`rules.citystate.quests`) */
export function questTables(civIds: readonly string[]): Record<string, number | number[]> {
  return {
    envoys: QUEST_ENVOYS,
    campRadius: QUEST_CAMP_RADIUS,
    units: QUEST_UNITS.map((u) => UNIT_INDEX[u]),
    unitEra: QUEST_UNITS.map(unitEra),
    unitUpgrade: QUEST_UNITS.map((u) => (UNITS[u].upgradesTo ? UNIT_INDEX[UNITS[u].upgradesTo!] ?? -1 : -1)),
    districts: QUEST_DISTRICTS.map((d) => PLACEABLE_DISTRICTS.indexOf(d)),
    districtCiv: QUEST_DISTRICT_CIVS.map((c) => (c ? civIds.indexOf(c) : -1)),
    districtEra: QUEST_DISTRICTS.map((_, i) => prereqEra(QUEST_DISTRICT_PREREQ[i], QUEST_DISTRICT_CIVIC[i])),
    districtMax: [...QUEST_DISTRICT_MAX],
    gpClasses: QUEST_GP_CLASSES.map((c) => GP_CLASSES.indexOf(c)),
    gpBan: QUEST_GP_CLASSES.map((c) => (c === 'WRITER' ? SEAT_BANS.indexOf('greatWriter') : c === 'PROPHET' ? SEAT_BANS.indexOf('greatProphet') : -1)),
    gpSea: QUEST_GP_CLASSES.map((c) => (c === 'ADMIRAL' ? 1 : 0)),
  };
}

/** war between a major and a city-state ends the pair's quest (0x8492f0) */
export function questWar(state: GameState, a: number, b: number): void {
  for (const cs of state.cityStates) {
    if (cs.seat === a && cs.seatQuest?.[b]) cs.seatQuest[b] = null;
    if (cs.seat === b && cs.seatQuest?.[a]) cs.seatQuest[a] = null;
  }
}
