
import type { City, GameState, Seat, Tile, Unit } from './types';
import type { CivId, LeaderId, SeatCaps, SeatClass } from '../data/seats';
import { ENKIDU_WAR_CS, DIPLO_VIS_ROWS, WAR_BAN_ROWS, rowIsFor, type DiploVisRow } from '../data/civilizations';
import { AGREEMENT_TURNS, ALLIANCE_L2_QP, ALLIANCE_L3_QP, ALLIANCE_M1_CS, ALLIANCE_MILITARY, ALLIANCE_REL2_THEO_CS, ALLIANCE_RELIGIOUS, FORMAL_WAR_MIN_TURNS, SEAT_CAPS, VISIBILITY_MAX, VISIBILITY_TECH,
  VISIBILITY_CS_PER_LEVEL , CIV_LEADERS } from '../data/seats';
import { gpPermOf } from '../data/greatPeople';
import { SPY_M_LISTENING_POST, SPY_SECRET_AGENT_LEVEL } from '../data/espionage';
import { RESOURCES } from '../../world/resources';
import { emptyStockpile } from '../data/constants';
import { GREAT_PEOPLE } from '../data/greatPeople';

import { NO_SEAT } from './types';
export { NO_SEAT };
const CITY_STATE_SEAT_BASE = 100;
export const BARB_SEAT = 200;

export const seatOfCityState = (cityStateId: number): number => CITY_STATE_SEAT_BASE + cityStateId;
export const cityStateOfSeat = (seat: number): number => seat - CITY_STATE_SEAT_BASE;


export function tileSeat(t: Tile): number {
  return t.ownerSeat;
}

export function setTileOwner(t: Tile, seat: number, city = -1): void {
  // Real Civ 6 loses citizen management with the city, so a plot changing
  // HANDS drops its LOCK — the specialist pin is city-borne and already dies
  // with the city; this is the plot-side twin. A same-seat retag between two
  // of the owner's cities keeps it.
  if (t.ownerSeat !== seat) t.locked = undefined;
  t.ownerSeat = seat;
  t.ownerCity = isCityStateSeat(seat) || seat === NO_SEAT ? -1 : city;
}

export function tileCity(t: Tile): number {
  return t.ownerCity;
}

export function tileBelongsTo(t: Tile, city: { seat: number; id: number }): boolean {
  return tileSeat(t) === city.seat && tileCity(t) === city.id;
}

export function cityAtTile(state: GameState, t: Tile): City | undefined {
  const seat = tileSeat(t);
  if (seat === NO_SEAT || isCityStateSeat(seat)) return undefined;
  const id = tileCity(t);
  return citiesOf(state, seat).find((c) => c.id === id);
}

export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  return tileSeat(t) === civ;
}

export function tileClaimed(t: Tile): boolean {
  return tileSeat(t) !== NO_SEAT;
}

export function tileForeignTo(t: Tile, civ: number): boolean {
  const s = tileSeat(t);
  return s !== NO_SEAT && s !== civ;
}

/**
 * Does this seat have ACCESS to a strategic resource? True iff some tile it
 * OWNS carries that resource AND its completed, unpillaged matching improvement
 * (PASTURE on horses, MINE on iron — read from the resource catalog).
 * Improvements are instant here, so `tile.improvement === imp` means built.
 *
 * No stockpile, count or maintenance draw: access is a pure boolean gate on
 * build and purchase. Mirrors the GPU res_id/res_imp/improvement scan.
 */
export function civHasStrategic(state: GameState, civ: number, resourceId: string): boolean {
  const imp = RESOURCES[resourceId]?.improvement;
  if (!imp) return false;
  for (const t of state.map.tiles) {
    if (t.resource !== resourceId || t.pillaged || t.improvement !== imp) continue;
    if (tileOwnedByCiv(t, civ)) return true;
  }
  return false;
}

/** The barbarian OUTPOST tiles, as a set. Appeal reads it (an adjacent
 *  outpost is -1), and the camp list is the only place a camp is written. */
export function campTiles(state: GameState): ReadonlySet<number> {
  return new Set(state.barbSeat?.camps ?? []);
}

/** Prophets this seat has SPENT. A Great Prophet founds a religion by walking
 *  to a Holy Site and spending its charge there — being recruited is not
 *  being used. */
export function prophetsOf(seat: Seat): number {
  return (seat.gpActivated ?? []).filter((id) => GREAT_PEOPLE.PROPHET.some((p) => p.id === id)).length;
}

export function emptySeat(seat: number): Seat {
  return {
    seat,
    cities: [], nextCityId: 0,
    name: '', color: '', aggression: 0, civ: -1,
    ww: {}, wwTurn: {}, diplomaticFavor: 0, diplomaticPoints: 0,
    wars: [], formalWars: [], denounced: {},
    influencePoints: 0, envoysAvailable: 0,
    peaceTurns: 0,
    treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    government: { current: null, policies: [], held: 0 },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    gpp: {}, gpEarned: [],
    buildersTrained: 0, relicReserve: 0, bestMeleeCS: 0, tilesPurchased: 0,
    projectsDone: [], spaceLy: -1, orbitalLasers: 0, stockpile: emptyStockpile(), camps: [], explored: [],
  };
}

export function seatOf(state: GameState, seat: number): Seat | undefined {
  // BY ID, not by array position: conquering a city-state removes it from
  // `state.cityStates`, and every survivor after it would otherwise answer as
  // its neighbour. The roster is a handful of entries, so the scan is free.
  if (isCityStateSeat(seat)) {
    const id = cityStateOfSeat(seat);
    return state.cityStates?.find((c) => c.id === id);
  }
  if (isBarbSeat(seat)) return state.barbSeat;
  return state.seats[seat];
}

/** the civilization a seat plays (`CIV_IDS`), or null for a seat without
 *  one — a city-state, the barbarians, a bare `emptySeat`. */
/** the entry of `variants` that belongs to the civilization this seat plays */
export function civVariantOf<T extends { civ: string }>(state: GameState, seat: number, variants: readonly T[] | undefined): T | undefined {
  const c = civOf(state, seat);
  return c ? variants?.find((v) => v.civ === c) : undefined;
}

export function civOf(state: GameState, seat: number): CivId | null {
  const s = seatOf(state, seat);
  const civ = s && 'civ' in s ? (s as Seat).civ : -1;
  return civ >= 0 ? CIV_LEADERS[civ]?.civ ?? null : null;
}

/** The leader this seat plays (`CIV_LEADERS[Seat.civ].leader`), null for a
 *  seat that plays no civilization. */
export function leaderOf(state: GameState, seat: number): LeaderId | null {
  const s = seatOf(state, seat);
  const civ = s && 'civ' in s ? (s as Seat).civ : -1;
  return civ >= 0 ? CIV_LEADERS[civ]?.leader ?? null : null;
}

/** CIV6 (Adventures of Enkidu): the allies a seat SHARES a war with — an
 *  alliance of any type where one side plays Gilgamesh and the ally is at war
 *  with `foe`. */
export function enkiduAllies(state: GameState, seat: number, foe: number): number[] {
  if (!isCiv(seat) || foe < 0) return [];
  const out: number[] = [];
  for (const o of state.seats) {
    if (o.seat === seat || allyTurnsWith(state, seat, o.seat) <= 0) continue;
    if (leaderOf(state, seat) !== 'GILGAMESH' && leaderOf(state, o.seat) !== 'GILGAMESH') continue;
    if (civsAtWar(state, o.seat, foe)) out.push(o.seat);
  }
  return out;
}

/**
 * Every actor in the game in SEAT ORDER: the civs, then the city-states, then
 * the barbarians. That is seat-id order, the same order the GPU's `_seat_row`
 * uses, so "walk every seat" means the same sequence on both engines.
 */
export function allSeats(state: GameState): Seat[] {
  return [...state.seats, ...(state.cityStates ?? []), ...(state.barbSeat ? [state.barbSeat] : [])];
}

export const isBarbSeat = (seat: number): boolean => seat === BARB_SEAT;

export const isCiv = (seat: number): boolean => seat >= 0 && seat < CITY_STATE_SEAT_BASE;

/** A seat that HOLDS TERRITORY and can be warred: a major or a city-state.
 *  What a pillage, a war march and a hostile tile test all ask. */
export const isTerritorial = (seat: number): boolean => seat >= 0 && seat < BARB_SEAT;

/** Is this a city-state? They hold territory and act, but are never civs. */
export const isCityStateSeat = (seat: number): boolean => seat >= CITY_STATE_SEAT_BASE && seat < BARB_SEAT;

export function seatClass(seat: number): SeatClass {
  if (isBarbSeat(seat)) return 'hostile';
  if (isCityStateSeat(seat)) return 'minor';
  return 'major';
}

export function capsOf(seat: number): SeatCaps {
  return SEAT_CAPS[seatClass(seat)];
}

export function unitSeat(u: { seat: number }): number {
  return u.seat;
}

export function citiesOf(state: GameState, seat: number): City[] {
  return seatOf(state, seat)?.cities ?? [];
}

export function allCities(state: GameState): City[] {
  return state.seats.flatMap((s) => s.cities);
}

export function unitsOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => unitSeat(u) === seat);
}

export function civsAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return seatOf(state, a)?.wars.includes(b) ?? false;
}

export function atWarWithAny(state: GameState, seat: number): boolean {
  return (seatOf(state, seat)?.wars.length ?? 0) > 0;
}

export function warsOf(state: GameState, seat: number): number[] {
  return seatOf(state, seat)?.wars ?? [];
}

export function setWar(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    if (on) {
      if (!s.wars.includes(other)) s.wars.push(other);
    } else {
      s.wars = s.wars.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}

export function warClockKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

export function warTurnsWith(state: GameState, a: number, b: number): number {
  if (a === b) return 0;
  return state.warTurns?.[warClockKey(a, b)] ?? 0;
}

export function setWarTurnsWith(state: GameState, a: number, b: number, v: number): void {
  if (a === b) return;
  if (!state.warTurns) state.warTurns = {};
  state.warTurns[warClockKey(a, b)] = v;
}

export function treatyTurnsWith(state: GameState, a: number, b: number): number {
  if (a === b) return 0;
  return state.treatyTurns?.[warClockKey(a, b)] ?? 0;
}

export function setTreatyTurnsWith(state: GameState, a: number, b: number, v: number): void {
  if (a === b) return;
  if (!state.treatyTurns) state.treatyTurns = {};
  state.treatyTurns[warClockKey(a, b)] = v;
}

export function warIsFormal(state: GameState, a: number, b: number): boolean {
  return seatOf(state, a)?.formalWars.includes(b) ?? false;
}

export function warIsGolden(state: GameState, a: number, b: number): boolean {
  return seatOf(state, a)?.goldenWars?.includes(b) ?? false;
}

export function setWarGolden(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    const g = (s.goldenWars ??= []);
    if (on) {
      if (!g.includes(other)) g.push(other);
    } else {
      s.goldenWars = g.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}

export function setWarFormal(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    if (on) {
      if (!s.formalWars.includes(other)) s.formalWars.push(other);
    } else {
      s.formalWars = s.formalWars.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}

/** The DIRECTED key an Open Borders grant is stored under: `a` grants `b`. */
export function grantKey(a: number, b: number): string {
  return `${a}>${b}`;
}

export function friendTurnsWith(state: GameState, a: number, b: number): number {
  if (a === b) return 0;
  return state.friendTurns?.[warClockKey(a, b)] ?? 0;
}

export function setFriendTurnsWith(state: GameState, a: number, b: number, v: number): void {
  if (a === b) return;
  if (!state.friendTurns) state.friendTurns = {};
  state.friendTurns[warClockKey(a, b)] = v;
}

export function seatsFriends(state: GameState, a: number, b: number): boolean {
  return friendTurnsWith(state, a, b) > 0;
}

export function allyTurnsWith(state: GameState, a: number, b: number): number {
  if (a === b) return 0;
  return state.allyTurns?.[warClockKey(a, b)] ?? 0;
}

export function setAllyTurnsWith(state: GameState, a: number, b: number, v: number): void {
  if (a === b) return;
  if (!state.allyTurns) state.allyTurns = {};
  state.allyTurns[warClockKey(a, b)] = v;
}

export function seatsAllied(state: GameState, a: number, b: number): boolean {
  return allyTurnsWith(state, a, b) > 0;
}

/** The live alliance's TYPE with `b` (ALLIANCE_TYPES index), -1 outside one.
 *  The tick clears the entry when the alliance lapses. */
export function allianceTypeWith(state: GameState, a: number, b: number): number {
  return state.allianceType?.[warClockKey(a, b)] ?? -1;
}

export function setAllianceTypeWith(state: GameState, a: number, b: number, t: number): void {
  if (!state.allianceType) state.allianceType = {};
  state.allianceType[warClockKey(a, b)] = t;
}

export function alliancePtsWith(state: GameState, a: number, b: number): number {
  return state.alliancePts?.[warClockKey(a, b)] ?? 0;
}

export function setAlliancePtsWith(state: GameState, a: number, b: number, v: number): void {
  if (!state.alliancePts) state.alliancePts = {};
  state.alliancePts[warClockKey(a, b)] = v;
}

/** CIV6 (Alliance): "80 to reach Level 2 and 160 more to reach Level 3" on
 *  Standard - quarter-point thresholds. 0 while no alliance stands. */
export function allianceLevelWith(state: GameState, a: number, b: number): number {
  if (!seatsAllied(state, a, b)) return 0;
  const qp = alliancePtsWith(state, a, b);
  return qp >= ALLIANCE_L3_QP ? 3 : qp >= ALLIANCE_L2_QP ? 2 : 1;
}

/** Does `a` hold a TYPE `ty` alliance with `b`, at `lvl` or above? */
export function alliedAtLevel(state: GameState, a: number, b: number, ty: number, lvl: number): boolean {
  return allianceTypeWith(state, a, b) === ty && allianceLevelWith(state, a, b) >= lvl;
}

/** Does seat `a` run at least one Trade Route into `b`'s cities? */
export function hasRouteToSeat(state: GameState, a: number, b: number): boolean {
  return (seatOf(state, a)?.tradeRoutes ?? []).some((r) => r.toSeat === b);
}

/** CIV6 (Diplomatic Visibility and Gossip): "Performing the Listening Post
 *  mission in another civilization's city increases visibility by one level",
 *  two once the spy is a Secret Agent — and only while the mission RUNS, which
 *  is why the post stands rather than ending. */
function listeningPostLevels(state: GameState, viewer: number, target: number): number {
  let best = 0;
  for (const u of state.units) {
    if (u.seat !== viewer || u.spyMission !== SPY_M_LISTENING_POST) continue;
    if (!seatOf(state, target)?.cities.some((c) => c.centerIndex === u.tileIndex)) continue;
    best = Math.max(best, (u.spyLevel ?? 0) >= SPY_SECRET_AGENT_LEVEL ? 2 : 1);
  }
  return best;
}

/**
 * How much of `target` this seat can see. DERIVED rather than stored: every
 * source the page names is already state both engines compare, so there is no
 * plane to keep in step.
 */
export function diploVisibility(state: GameState, viewer: number, target: number): number {
  if (viewer === target || !isCiv(viewer) || !isCiv(target)) return 0;
  const sx = seatOf(state, viewer);
  if (!sx) return 0;
  let n = 0;
  // "Establish a Trade Route to a civilization to increase visibility by one
  // level."
  if ((sx.tradeRoutes ?? []).some((r) => r.toSeat === target)) n += 1;
  // "Send a Delegation to a civilization to increase visibility by one level.
  // Once Embassies are available, establishing an Embassy will replace this."
  if (delegationWith(state, viewer, target) > 0) n += 1;
  // "...researching the Printing Press technology. This will increase your
  // visibility with ALL civilizations by one level."
  if (sx.research.techs.includes(VISIBILITY_TECH)) n += 1;
  // CIV6 (Mary Katherine Goddard): "+1 level of Diplomatic visibility with
  // all other civilizations" — a spent charge, permanent, target-blind.
  n += gpPermOf(sx, 'visibilityAll');
  // The post and the alliance are ALTERNATIVES: "These two actions do not add
  // separate Diplomatic Visibility levels - it does no good to spy on your
  // allies!"
  n += Math.max(listeningPostLevels(state, viewer, target), seatsAllied(state, viewer, target) ? 1 : 0);
  // CIV6 (Ortoo): "Receive an extra level of Diplomatic Visibility for
  // possessing a Trading Post in ANY city of a civilization"
  const vr = rosterDiploVis(state, viewer);
  if (vr.length) {
    const post = (seatOf(state, target)?.cities ?? []).some((c) => (sx.tradingPosts ?? []).includes(c.centerIndex));
    if (post) for (const r of vr) n += r.postLevels;
  }
  return Math.min(VISIBILITY_MAX, n);
}

/** CIV6 (Faces of Peace, EFFECT_ADJUST_BANNED_DIPLOMATIC_ACTIONS): "Cannot
 *  declare war on City-States or surprise wars. Surprise wars cannot be
 *  declared on Canada." ONE reader, so the aggressor's row and the target's
 *  are asked in the same place (`WAR_BAN_ROWS`). `formal` is the war kind the
 *  declaration would take — a surprise war is the informal one, and a minor
 *  takes no kind at all, so its path passes `true`. Read from the DATA module
 *  rather than through `getModifiers`: `effects` imports both this file and
 *  `cityStates`, and either import back would close a cycle. */
export function warBanned(state: GameState, from: number, to: number, formal: boolean): boolean {
  if (!isCiv(from) || WAR_BAN_ROWS.length === 0) return false;
  const mine = (s: number) => WAR_BAN_ROWS.filter((r) => rowIsFor(r, civOf(state, s), leaderOf(state, s)));
  for (const r of mine(from)) {
    if (r.ban === 'onCityState' && isCityStateSeat(to)) return true;
    if (r.ban === 'surpriseByMe' && !formal) return true;
  }
  if (!formal && isCiv(to)) {
    for (const r of mine(to)) if (r.ban === 'surpriseOnMe') return true;
  }
  return false;
}

/** The roster's visibility rows for one seat. Read from the DATA module
 *  rather than through `getModifiers`, which lives in `effects` and imports
 *  this file — the cycle would leave a derived constant undefined at load. */
function rosterDiploVis(state: GameState, seat: number): readonly DiploVisRow[] {
  if (!isCiv(seat)) return [];
  return DIPLO_VIS_ROWS.filter((r) => rowIsFor(r, civOf(state, seat), leaderOf(state, seat)));
}

/** CIV6 ("Intel on enemy movements"): when two civs' visibility levels differ,
 *  "if one party's level is higher, they will receive a permanent bonus in
 *  every military encounter" — +3 Combat Strength per level of the gap, and
 *  nothing at all for the side that is behind. */
export function visibilityCS(state: GameState, own: number, foe: number): number {
  const d = diploVisibility(state, own, foe) - diploVisibility(state, foe, own);
  if (d <= 0) return 0;
  // CIV6 (Ortoo): "All Mongolian units double the usual Combat Bonus for
  // having a higher level of Diplomatic Visibility than their opponent" — the
  // install's own Amount is 3, which is what this engine already pays per
  // level, so the row ADDS a second step (`DIPLO_VIS_ROWS`)
  let per = VISIBILITY_CS_PER_LEVEL;
  for (const r of rosterDiploVis(state, own)) per += r.csPerLevel;
  return d * per;
}

/** CIV6 (Military alliance 1): "+5 Combat Strength against units of players
 *  at war with you and your ally." Any war the clocks carry qualifies; a
 *  barbarian is hostile, not at war, and pays nothing. */
export function allianceWarCS(state: GameState, own: number, foe: number): number {
  if (!isCiv(own) || !civsAtWar(state, own, foe)) return 0;
  let cs = 0;
  for (const o of state.seats) {
    if (o.seat !== own && alliedAtLevel(state, own, o.seat, ALLIANCE_MILITARY, 1)
      && civsAtWar(state, o.seat, foe)) { cs += ALLIANCE_M1_CS; break; }
  }
  // CIV6 (Adventures of Enkidu): "+5 Combat Strength against units of
  // civilizations their allies are at war with" — any alliance, on top.
  if (enkiduAllies(state, own, foe).length > 0) cs += ENKIDU_WAR_CS;
  return cs;
}

/** CIV6 (Military alliance 3): "Units start with a free Promotion." */
export function allianceFreePromo(state: GameState, seat: number): boolean {
  return state.seats.some((o) => o.seat !== seat && alliedAtLevel(state, seat, o.seat, ALLIANCE_MILITARY, 3));
}

/** CIV6 (Religious alliance 2): "+10 Religious Combat Strength against
 *  non-ally Religions" - any duel opponent but the ally itself. */
export function allianceTheoCS(state: GameState, own: number, foe: number): number {
  for (const o of state.seats) {
    if (o.seat !== own && o.seat !== foe
      && alliedAtLevel(state, own, o.seat, ALLIANCE_RELIGIOUS, 2)) return ALLIANCE_REL2_THEO_CS;
  }
  return 0;
}

/** Turns `grantor`'s OPEN BORDERS grant to `guest` still runs. Directed. */
export function borderTurnsFrom(state: GameState, grantor: number, guest: number): number {
  if (grantor === guest) return 0;
  return state.borderTurns?.[grantKey(grantor, guest)] ?? 0;
}

export function setBorderTurnsFrom(state: GameState, grantor: number, guest: number, v: number): void {
  if (grantor === guest) return;
  if (!state.borderTurns) state.borderTurns = {};
  state.borderTurns[grantKey(grantor, guest)] = v;
}

/** Does `sender` hold a Delegation or Resident Embassy with `target`? */
export function delegationWith(state: GameState, sender: number, target: number): number {
  if (sender === target) return 0;
  return state.delegations?.[grantKey(sender, target)] ?? 0;
}

export function setDelegationWith(state: GameState, sender: number, target: number, v: number): void {
  if (sender === target) return;
  if (!state.delegations) state.delegations = {};
  state.delegations[grantKey(sender, target)] = v;
}

/** CIV6: war "kicks out" the missions both ways, so the pair is cleared, not
 *  the sender's half. */
export function clearDelegations(state: GameState, a: number, b: number): void {
  setDelegationWith(state, a, b, 0);
  setDelegationWith(state, b, a, 0);
}

/** Is `a`'s denouncement of `b` still running? CIV6: "A Denunciation lasts for
 *  30 turns, after which its effects expire." */
export function denounceActive(state: GameState, a: number, b: number): boolean {
  const t = seatOf(state, a)?.denounced[b];
  return t !== undefined && state.turn - t < AGREEMENT_TURNS;
}

/** Turns `a`'s denouncement of `b` still has to run; 0 when there is none.
 *  What the observation renders — the Formal-War window lives inside it. */
export function denounceLeft(state: GameState, a: number, b: number): number {
  const t = seatOf(state, a)?.denounced[b];
  if (t === undefined) return 0;
  return Math.max(0, AGREEMENT_TURNS - (state.turn - t));
}

/** Does `a` hold a FORMAL-WAR casus belli against `b`? CIV6: "Five turns after
 *  denouncing a rival, you gain a Formal War Casus Belli against them" — and
 *  it expires with the denouncement that opened it. */
export function denounceCasusBelli(state: GameState, a: number, b: number): boolean {
  const t = seatOf(state, a)?.denounced[b];
  return t !== undefined && state.turn - t >= FORMAL_WAR_MIN_TURNS && state.turn - t < AGREEMENT_TURNS;
}
