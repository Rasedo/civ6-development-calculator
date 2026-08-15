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
 * Everything here takes a SEAT. There is no seat-0 function and no other seat
 * function — seat 0's endTurn and each seat's block call the same three
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

const holdsWeariness = (seat: number): boolean => isCiv(seat);

export function wwGet(seat: Seat, other: number): number {
  return seat.ww?.[other] ?? 0;
}

export function wwMax(seat: Seat | undefined): number {
  if (!seat?.ww) return 0;
  let m = 0;
  for (const k in seat.ww) {
    const v = seat.ww[k];
    if (v > m) m = v;
  }
  return m;
}

export function wwSum(seat: Seat | undefined): number {
  if (!seat?.ww) return 0;
  let n = 0;
  for (const k in seat.ww) n += seat.ww[k];
  return n;
}

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

export function anyWar(state: GameState, seat: number): boolean {
  return atWarWithAny(state, seat);
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
