/**
 * THE WAR VALUE (AI/Value_Manager 0x7b7760 = 0x7b7ab0 + 0x7b7830 + 0x7b87b0;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the war desires"):
 * what a war on another player is worth to a seat, the Surprise War's and
 * the city-state war's desire before their own terms.
 *
 * - THE SPOILS (0x7b7ab0): the most a known civilian of the player would be
 *   worth taken (the seat's current cost of the unit it becomes, UnitCaptures'
 *   BecomesUnitType), plus its known cities' values (0x79fef0, the CITY
 *   VALUES' own, x the leader's war factor 1 + 0.02 x GrandStrategic +0x204)
 *   in ascending order, each over its rank from the far end (the least over
 *   n + 1, the most over 2); halved for each other major the seat fights,
 *   x 0.8 for each city-state it fights (a city-state target: x 0.75 and
 *   x 0.9); x 1.25 for each full civ the player fights, x 1.1 for each
 *   city-state. The knowledge base's war record with the player lifts it (a
 *   positive record above it) or zeroes it (a negative one over it). Where
 *   the seat knows weapons of mass destruction of the player (PlayerStats
 *   m_aKnownWMDCounts) or the diplomacy's +0xf30 flags it, the value drops
 *   by 10000 where the seat holds none and stays at most 0; else, where the
 *   seat holds some and knows none of the player, at least 0. Nothing known
 *   of the player: -9999.
 * - THE BALANCE (0x7b7830, not for a favoured war): the two military
 *   strengths S (the seat's) and T (the player's) and the player's regional
 *   strength R: -R where T / 4 passes R, else -min(S, T) where T + 30 passes
 *   S; then + (S - T), doubled where S <= T; plus the items of the deals
 *   between the two (0x64d320).
 * - THE CASUS BELLI (0x7b87b0): PSEUDOYIELD_DIPLOMATIC_BONUS of an amount
 *   of 0 per third player the seat has met — nothing.
 */
import { FX, fdiv, fmul } from '../../cpu/core/aiValue';
import type { MajorView } from './view';
import { cityValue } from '../../cpu/core/operations/cityValue';
import type { ArmyUnit } from '../../cpu/core/operations/evaluate';
import type { KnownUnit } from '../../cpu/core/operations/knowledge';

/** -9999 in 24.8 (@f04cb0) */
export const WAR_NONE = -9999 * FX;

/** the leader's war factor GrandStrategic +0x204: its writer unread, read as
 *  0 (a factor of 1) */
const LEADER_WAR_FACTOR = 0;

/** the knowledge base's war record +0xc toward a player: its writer unread;
 *  every AI_Knowledge.csv WAR line of the verbose recordings logs it 0.00 */
export const WAR_RECORD = 0;

/** the diplomacy's +0xf30 flag toward a player and the items of the deals
 *  between two players (0x64d320): unread, none */
const WMD_FLAG = 0;

/** PlayerStats m_aKnownWMDCounts of the player (0x4bf200): its writer
 *  unread, none known */
const KNOWN_WMD = 0;
const DEAL_ITEMS = 0;

/** a float the DLL turns into 24.8: its floor's whole part, the fraction's
 *  256ths cut */
function fxOfFloat(x: number): number {
  const f = Math.fround(x);
  const fl = Math.floor(f);
  return fl * FX + Math.trunc(Math.fround(Math.fround(f - fl) * 256));
}

export interface WarValueInputs {
  /** the knowledge base's army records per player, as the city value reads them */
  army: (player: number) => readonly ArmyUnit[];
  /** the knowledge base's records of a player (the regional strength's) */
  records: (player: number) => readonly KnownUnit[];
  turn: number;
}

/** the military AI's m_regionalMilitaryStrength of a player (0x71fb80's
 *  second loop): over the seat's areas (the landmasses of its cities), the
 *  knowledge base's records of the player's units last seen there within two
 *  turns (0x5eb430), each its max(Combat, RangedCombat) where that passes
 *  the yardstick less 20 */
export function regionalStrength(view: MajorView, seat: number, player: number, inp: WarValueInputs): number {
  const plots = view.plots();
  const areas = new Set(view.cityPlots(seat).map((p) => plots[p].area));
  const best = view.militaryYardstick(seat);
  let sum = 0;
  for (const r of inp.records(player)) {
    if (inp.turn - r.seen > 2 || !areas.has(plots[r.plot].area)) continue;
    const s = Math.max(r.combat, r.ranged);
    if (s + 20 > best) sum += s;
  }
  return sum;
}

/** 0x7b7ab0 */
export function spoils(view: MajorView, seat: number, p: number, inp: WarValueInputs): number {
  let found = false;
  let v = 0;
  for (const u of view.knownUnits(seat, p)) {
    if (u.combat > 0 || u.ranged > 0 || !view.capturedAs(u.type)) continue;
    found = true;
    v = Math.max(v, view.unitCost(seat, view.capturedAs(u.type)!) * FX);
  }
  const factor = fxOfFloat(Math.fround(Math.fround(LEADER_WAR_FACTOR * Math.fround(0.02)) + 1));
  const known = view.knownCities(seat);
  const values: number[] = [];
  for (const k of known) {
    if (k.owner !== p) continue;
    found = true;
    values.push(fmul(cityValue(view, seat, k, known, inp.army), factor));
  }
  values.sort((a, b) => a - b);
  let rank = values.length + 1;
  for (const x of values) {
    if (x >= 0) v += fdiv(x, rank * FX);
    rank--;
  }
  const scale = (f: number) => {
    v = fmul(v, fxOfFloat(f));
  };
  const majors = view.majors();
  const minors = view.cityStateSeats();
  if (majors.includes(p)) {
    for (const q of majors) if (q !== p && view.atWar(seat, q)) scale(0.5);
    for (const q of minors) if (q !== p && view.atWar(seat, q)) scale(0.8);
  } else if (p !== view.barbarianSeat()) {
    for (const q of majors) if (q !== p && view.atWar(seat, q)) scale(0.75);
    for (const q of minors) if (q !== p && view.atWar(seat, q)) scale(0.9);
  }
  for (const q of view.players()) {
    if (q === seat || !view.atWar(p, q)) continue;
    if (majors.includes(q)) scale(1.25);
    else if (minors.includes(q)) scale(1.1);
  }
  if (WAR_RECORD > 0 && WAR_RECORD > v) v = WAR_RECORD;
  else if (WAR_RECORD < 0 && -WAR_RECORD > v && v > 0) v = 0;
  const ours = view.wmdCount(seat);
  const theirs = KNOWN_WMD;
  if (theirs > 0 || WMD_FLAG > 0) {
    if (ours === 0) v -= 10000 * FX;
    v = Math.min(v, 0);
  } else if (ours > 0 && theirs === 0) v = Math.max(v, 0);
  return found ? v : WAR_NONE;
}

/** 0x7b7830 */
export function balance(view: MajorView, seat: number, p: number, inp: WarValueInputs): number {
  const s = view.militaryStrength(seat);
  const t = view.militaryStrength(p);
  const r = regionalStrength(view, seat, p, inp);
  let v = 0;
  if (Math.fround(t * 0.25) > r) v -= r * FX;
  else if (t + 30 > s) v -= Math.min(s, t) * FX;
  v += (s - t) * (s <= t ? 2 : 1) * FX;
  return v + DEAL_ITEMS;
}

/** 0x7b7760: the spoils, and where nothing stops it and the war is not
 *  favoured, the balance */
export function warValue(view: MajorView, seat: number, p: number, favoured: boolean, inp: WarValueInputs): number {
  const a = spoils(view, seat, p, inp);
  if (a === WAR_NONE || favoured) return a;
  return a + balance(view, seat, p, inp);
}
