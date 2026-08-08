import type { GameState, Seat } from './types';
import { WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY } from '../data/seats';
import { atWarWithAny, isBarbSeat, isCiv, seatOf, seatsAllied, tileSeat, warIsFormal } from './seats';
import { civEraIndex } from './city';

/**
 * WAR WEARINESS, one seat-generic model.
 *
 * Civ 6 scores weariness PER BATTLE:
 *
 *     WWP = (EraBase * Location) + Death
 *
 * with `Location` 1 inside your own borders and 2 anywhere else, `Death` a
 * further 3 * EraBase to whichever side lost a unit, and any battle involving
 * a CITY scored at the abroad column. Both the attacker and the defender score
 * it, "without any discrimination" — the aggressor gets no discount.
 *
 * There is no per-turn accrual: in Civ 6 a war in which nobody fights SHEDS
 * 50 a turn. A phoney war is free and a bloody one is ruinous, and the
 * old model had exactly no way to tell them apart.
 *
 * Everything here takes a SEAT. There is no player function and no other seat
 * function — the player's endTurn and each seat's block call the same three
 * entry points, which is the whole point of #51.
 */

/** Barbarians neither accrue weariness nor inflict it.
 *
 *  Not an omission: the model's own decay rules make it necessary. Every seat
 *  is permanently hostile to barbarians, so if that counted as war then "at
 *  peace with everyone" (-200/turn) would be unreachable for the entire game
 *  and no accumulator could ever drain. Civ 6 has no barbarian war weariness
 *  for the same reason — there is no barbarian *war* to be weary of. */
const scores = (seat: number): boolean => !isBarbSeat(seat) && seat >= 0;

/** Only MAJOR civs hold weariness: they are the seats with amenities to lose
 *  and research to date their era from. A city-state is a valid OPPONENT (a
 *  war against one wears you down normally) but keeps no accumulator. */
const holdsWeariness = (seat: number): boolean => isCiv(seat);

/** This seat's WWP against `other`. Absent = 0. */
export function wwGet(seat: Seat, other: number): number {
  return seat.ww?.[other] ?? 0;
}

/**
 * The weariness this seat actually FEELS: the worst of its wars.
 *
 * "Multiple simultaneous wars score separately; only the highest counts."
 * Summing them would punish a civ for the number of its enemies rather than
 * for the blood spilled, which is the opposite of what the source describes.
 */
export function wwMax(seat: Seat | undefined): number {
  if (!seat?.ww) return 0;
  let m = 0;
  for (const k in seat.ww) {
    const v = seat.ww[k];
    if (v > m) m = v;
  }
  return m;
}

/**
 * Every war's points added together — NOT a game rule, a GATE column.
 *
 * `wwMax` is what the game feels, and two engines can agree on a maximum while
 * disagreeing about which war holds it or how many wars there are. The sum
 * moves whenever any single war does, so tracing max AND sum pins the whole
 * per-war multiset against a scalar comparison. [[measure-every-path]].
 */
export function wwSum(seat: Seat | undefined): number {
  if (!seat?.ww) return 0;
  let n = 0;
  for (const k in seat.ww) n += seat.ww[k];
  return n;
}

/** Is the war between `a` and `b` a FORMAL one (a casus belli was used)?
 *
 *  Only the civ↔civ axis can answer yes, because DENOUNCING is the only
/**
 * The per-battle base for `seat` fighting `other`: its own era's row of the
 * formal or surprise column, era index clamped at Industrial (4) and beyond.
 *
 * The era is the SEAT's own (`civEraIndex` — the highest era among its
 * completed techs and civics), not the world's: an Ancient-era civ dragged
 * into an Industrial war wearies at Ancient rates.
 */
export function wwEraBase(state: GameState, seat: number, other: number): number {
  const s = seatOf(state, seat);
  // A seat with no research record has completed nothing, so it fights at
  // Ancient — the same answer `civEraIndex` gives for two empty lists. Spelled
  // as a default rather than a crash because the barbarian seat and the
  // hand-built test fixtures both legitimately carry no research.
  const era = civEraIndex(s?.research?.techs ?? [], s?.research?.civics ?? []);
  const row = warIsFormal(state, seat, other) ? WW_ERA_BASE_FORMAL : WW_ERA_BASE_SURPRISE;
  return row[Math.min(Math.max(era, 0), row.length - 1)];
}

/**
 * Is `tileOwner` land this seat fights on at the HOME rate?
 *
 * The shipped GlobalParameters carry two rows and only two:
 * `WAR_WEARINESS_PER_COMBAT_IN_ALLIED_LANDS = 1` and
 * `..._IN_FOREIGN_LANDS = 2`. So an ALLY's territory is home ground — not just
 * your own — and everything else, unowned ground included, is foreign.
 *
 * Only CIVS ally, so a city-state's or a barbarian's territory is never
 * friendly by this route.
 */
function friendlyLand(state: GameState, seat: number, tileOwner: number): boolean {
  if (tileOwner < 0) return false; // nobody's land is foreign land
  if (tileOwner === seat) return true;
  if (!isCiv(seat) || !isCiv(tileOwner)) return false;
  return seatsAllied(state, seat, tileOwner);
}

function addWw(state: GameState, seat: number, other: number, amount: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  (s.ww ??= {});
  (s.wwTurn ??= {});
  s.ww[other] = Math.max(0, (s.ww[other] ?? 0) + amount);
  s.wwTurn[other] = state.turn;
}

/**
 * One BATTLE, scored for both sides.
 *
 * `tileIndex` is the tile the battle is decided on — the TARGET's tile, "always
 * the location, including for ranged units". `city` says a city (or its
 * district) is giving or receiving the attack, which forces the abroad column
 * for both sides regardless of whose borders it stands in.
 *
 * Call it AFTER the damage rolls and after the deaths are known, but BEFORE any
 * capture — a captured tile changes hands, and the location multiplier is the
 * one that applied while the battle was fought.
 */
export function warWearinessBattle(
  state: GameState,
  aSeat: number,
  dSeat: number,
  tileIndex: number,
  opts: { aDied?: boolean; dDied?: boolean; city?: boolean } = {},
): void {
  if (!scores(aSeat) || !scores(dSeat) || aSeat === dSeat) return;
  const tile = state.map.tiles[tileIndex];
  const owner = tile ? tileSeat(tile) : -1;
  const score = (self: number, foe: number, died: boolean): void => {
    if (!holdsWeariness(self)) return;
    const base = wwEraBase(state, self, foe);
    const loc = opts.city || !friendlyLand(state, self, owner) ? WW_ABROAD_MULT : 1;
    addWw(state, self, foe, base * loc + (died ? WW_DEATH_MULT * base : 0));
  };
  score(aSeat, dSeat, opts.aDied ?? false);
  score(dSeat, aSeat, opts.dDied ?? false);
}

/**
 * The end-of-turn decay for ONE seat, called from that seat's own block top,
 * so "weariness settles" always precedes "amenities are read".
 *
 *   * a war in which a battle was fought THIS turn does not decay
 *   * any other war decays 50 while this seat is at war with somebody
 *   * a seat at war with nobody sheds 200 from every war it remembers
 */
export function warWearinessTurn(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s?.ww) return;
  const atWarSomewhere = anyWar(state, seat);
  for (const k in s.ww) {
    const other = Number(k);
    if (s.wwTurn?.[other] === state.turn) continue; // blood was spilled
    const shed = atWarSomewhere ? WW_DECAY_AT_WAR : WW_DECAY_AT_PEACE;
    s.ww[other] = Math.max(0, s.ww[other] - shed);
  }
}

/** Is this seat at war with ANY live opponent? Drives which decay rate applies
 *  ("during war" vs "at peace with all"). Barbarian hostility is not a war —
 *  see `scores`. */
export function anyWar(state: GameState, seat: number): boolean {
  return atWarWithAny(state, seat);
}

/**
 * A peace treaty between `a` and `b`: both sides shed 2000 from THAT war.
 *
 * It is deliberately larger than any plausible accumulation, which is how the
 * source keeps a settled war from haunting a civ forever — the residual of a
 * war you are no longer in has no decay rule of its own.
 */
export function warWearinessPeace(state: GameState, a: number, b: number): void {
  const shed = (self: number, foe: number): void => {
    const s = seatOf(state, self);
    if (!s?.ww) return;
    if (s.ww[foe] !== undefined) s.ww[foe] = Math.max(0, s.ww[foe] - WW_PEACE_TREATY);
  };
  shed(a, b);
  shed(b, a);
}
