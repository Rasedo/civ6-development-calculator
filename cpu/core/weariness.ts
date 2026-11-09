import type { City, GameState, Seat } from './types';
import { WW_BASE, ERA_WARMONGER_POINTS, WW_HOME_MULT, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WW_WMD_LAUNCHED, WW_LOSS_AT_WAR_CITY, WW_LOSS_NONFOUNDED_CITY, WW_LOSS_FOUNDED_CITY, warWearinessPenalty } from '../data/seats';
import { WAR_KINDS } from '../data/warKinds';
import { amenitiesNeeded } from '../data/constants';
import { cityAtTile, citiesOf, civsAtWar, isCiv, seatOf, seatsAllied, tileSeat, warKindWith } from './seats';
import { gameEraIndex } from './yields';

import { gpPermOf } from '../data/greatPeople';
import { getModifiers } from './effects';
/**
 * WAR WEARINESS, Player_Diplomacy's ledger (GameCore_XP2 0x1fb680 per
 * combat, 0x3d7270 per turn; the rule in `data/seats.ts`). Only two majors
 * score it against each other (0x1fb680's two FULL_CIV tests): a war with a
 * city-state, a Free City or the barbarians wears no one down.
 */

export function wwGet(seat: Seat, other: number): number {
  return seat.ww?.[other] ?? 0;
}

/** THE WAR-WEARINESS AMENITY LOSS of each city of `seat`, by city id
 *  (GameCore_XP2 0x3cda00, `tools/civ6lab/dll_ww.py`). Each opponent o with
 *  weariness W[o] > 0 costs L(o) = W[o] // 400 (`warWearinessPenalty`), which
 *  goes first to the seat's cities o originally owned (`founderSeat`) — the
 *  at-war opponents' first, each such city taking at most its need
 *  ceil(pop / 2) plus `WW_LOSS_AT_WAR_CITY`, then the at-peace opponents',
 *  plus `WW_LOSS_NONFOUNDED_CITY`; what they leave is pooled for the cities
 *  a third seat founded (plus `WW_LOSS_NONFOUNDED_CITY`), then the seat's own
 *  founded cities (plus `WW_LOSS_FOUNDED_CITY`); within each group the most
 *  populous first, ties in the city list's order; what is left is lost.
 *  `_ww_losses` is the twin. */
export function warWearinessLosses(state: GameState, seat: number): Map<number, number> {
  const out = new Map<number, number>();
  const s = seatOf(state, seat);
  const cities = citiesOf(state, seat);
  for (const c of cities) out.set(c.id, 0);
  if (!s?.ww || cities.length === 0) return out;
  const ww = s.ww;
  const foes = Object.keys(ww).map(Number).filter((o) => ww[o] > 0).sort((a, b) => a - b);
  if (foes.length === 0) return out;
  const founder = (c: City): number => c.founderSeat ?? c.seat;
  const fill = (group: City[], rest: number, cap: number): number => {
    const byPop = [...group].sort((a, b) => b.population - a.population);
    for (const c of byPop) {
      if (rest <= 0) break;
      const n = Math.min(rest, amenitiesNeeded(c.population) + cap);
      out.set(c.id, (out.get(c.id) ?? 0) + n);
      rest -= n;
    }
    return rest;
  };
  let pool = 0;
  for (const war of [true, false]) {
    for (const o of foes) {
      if (civsAtWar(state, seat, o) !== war) continue;
      pool += fill(cities.filter((c) => founder(c) === o), warWearinessPenalty(ww[o]),
        war ? WW_LOSS_AT_WAR_CITY : WW_LOSS_NONFOUNDED_CITY);
    }
  }
  const foeSet = new Set(foes);
  pool = fill(cities.filter((c) => founder(c) !== seat && !foeSet.has(founder(c))), pool, WW_LOSS_NONFOUNDED_CITY);
  fill(cities.filter((c) => founder(c) === seat), pool, WW_LOSS_FOUNDED_CITY);
  return out;
}

export function wwSum(seat: Seat | undefined): number {
  if (!seat?.ww) return 0;
  let n = 0;
  for (const k in seat.ww) n += seat.ww[k];
  return n;
}

/** The war's DiplomaticActions WarmongerPercent (0x3d1450): its kind's
 *  `WAR_KINDS` percent, 0 for a war with no kind. */
export function wwWarPercent(state: GameState, a: number, b: number): number {
  const kind = warKindWith(state, a, b);
  return kind < 0 ? 0 : WAR_KINDS[kind].pct[0];
}

/** The attacker's base: WAR_WEARINESS_WARMONGER_BASE + the game era's
 *  WarmongerPoints x the war's percent / 100. */
export function wwEraBase(state: GameState, a: number, b: number): number {
  const era = Math.min(Math.max(gameEraIndex(state), 0), ERA_WARMONGER_POINTS.length - 1);
  return WW_BASE + Math.trunc((ERA_WARMONGER_POINTS[era] * wwWarPercent(state, a, b)) / 100);
}

function friendlyLand(state: GameState, seat: number, tileOwner: number): boolean {
  if (tileOwner < 0) return false; // nobody's land is foreign land
  if (tileOwner === seat) return true;
  if (!isCiv(seat) || !isCiv(tileOwner)) return false;
  return seatsAllied(state, seat, tileOwner);
}

/** One side's score: trunc(amount x (100 + pct) / 100), pct its Overall
 *  modifiers (the government's, the cards', the Great People's) + the
 *  opponent's Enemy ones; nothing at pct -100 or below, nothing unless the
 *  result is above 0 (0x1fb680 at 0x1fb93d..0x1fb990). */
function addWw(state: GameState, seat: number, other: number, amount: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const pct = gpPermOf(s, 'wwPct') + getModifiers(state, seat).wwPct + getModifiers(state, other).enemyWarWearinessPct;
  if (pct <= -100) return;
  const gained = Math.trunc((amount * (100 + pct)) / 100);
  if (gained <= 0) return;
  (s.ww ??= {});
  s.ww[other] = (s.ww[other] ?? 0) + gained;
}

/**
 * A combat between `aSeat` and `dSeat` at `tileIndex`. Each side's loc reads
 * the combat's plot: WW_HOME_MULT where it is the side's own or an ally's and
 * the side fights with a unit, else WW_ABROAD_MULT (a city or district side,
 * `aCity` / `dCity`, has no unit); + WW_DEATH_MULT where its unit died. The
 * attacker scores loc x `wwEraBase`, the defender loc x (WW_BASE - the war's
 * percent).
 */
export function warWearinessBattle(
  state: GameState,
  aSeat: number,
  dSeat: number,
  tileIndex: number,
  opts: { aDied?: boolean; dDied?: boolean; aCity?: boolean; dCity?: boolean } = {},
): void {
  if (aSeat !== dSeat && isCiv(aSeat) && isCiv(dSeat)) {
    const tile = state.map.tiles[tileIndex];
    const owner = tile ? tileSeat(tile) : -1;
    const side = (self: number, foe: number, base: number, city: boolean, died: boolean): void => {
      const loc = (!city && friendlyLand(state, self, owner) ? WW_HOME_MULT : WW_ABROAD_MULT)
        + (!city && died ? WW_DEATH_MULT : 0);
      addWw(state, self, foe, loc * base);
    };
    side(aSeat, dSeat, wwEraBase(state, aSeat, dSeat), opts.aCity ?? false, opts.aDied ?? false);
    side(dSeat, aSeat, WW_BASE - wwWarPercent(state, dSeat, aSeat), opts.dCity ?? false, opts.dDied ?? false);
  }
  // Every combat path on both engines reaches this ONE hook, so a rule that
  // fires "when a battle resolves" rides it rather than the ten call sites.
  postCombatLoyalty(state, aSeat, dSeat, tileIndex, opts);
}

/** CIV6 (Swift Hawk): "Defeating an enemy unit within the borders of an enemy
 *  city causes that city to lose 20 Loyalty, and 40 if that civilization is in
 *  a Golden or Heroic Age." The install's `AffectLocal` is false — the city
 *  that loses is the DEFEATED side's, never the victor's
 *  (`POST_COMBAT_LOYALTY_ROWS`). A heroic age IS a golden one here. */
function postCombatLoyalty(
  state: GameState,
  aSeat: number,
  dSeat: number,
  tileIndex: number,
  opts: { aDied?: boolean; dDied?: boolean },
): void {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return;
  const hit = (victor: number, loser: number, loserDied: boolean): void => {
    if (!loserDied || !isCiv(victor)) return;
    const rows = getModifiers(state, victor).postCombatLoyalty;
    if (!rows.length) return;
    const city = cityAtTile(state, tile);
    if (!city || city.seat !== loser) return; // "within the borders of an ENEMY city"
    const golden = (seatOf(state, loser)?.age ?? 0) === 2;
    let drop = 0;
    for (const r of rows) drop += r.amount + (golden ? r.goldenExtra : 0);
    if (drop) city.loyalty = Math.max(0, (city.loyalty ?? 100) + drop);
  };
  hit(aSeat, dSeat, opts.dDied ?? false);
  hit(dSeat, aSeat, opts.aDied ?? false);
}


/** A WMD's launch: the launcher's loc is WW_WMD_LAUNCHED + WW_ABROAD_MULT
 *  (a blast never lands on its own ground), times `wwEraBase`. */
export function warWearinessLaunch(state: GameState, seat: number, other: number): void {
  if (seat === other || !isCiv(seat) || !isCiv(other)) return;
  addWw(state, seat, other, (WW_WMD_LAUNCHED + WW_ABROAD_MULT) * wwEraBase(state, seat, other));
}

/** The turn's decay (0x3d7270): from each opponent `seat` holds weariness
 *  against, WW_DECAY_AT_WAR while at war with that opponent, else
 *  WW_DECAY_AT_PEACE, floored at 0. */
export function warWearinessTurn(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s?.ww) return;
  for (const k in s.ww) {
    const other = Number(k);
    if (s.ww[other] <= 0) continue;
    s.ww[other] = Math.max(0, s.ww[other] - (civsAtWar(state, seat, other) ? WW_DECAY_AT_WAR : WW_DECAY_AT_PEACE));
  }
}

export function warWearinessPeace(state: GameState, a: number, b: number): void {
  const shed = (self: number, foe: number): void => {
    const s = seatOf(state, self);
    if (!s?.ww) return;
    if (s.ww[foe] !== undefined) s.ww[foe] = Math.max(0, s.ww[foe] - WW_PEACE_TREATY);
  };
  shed(a, b);
  shed(b, a);
}
