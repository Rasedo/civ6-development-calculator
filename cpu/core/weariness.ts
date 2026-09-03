import type { GameState, Seat } from './types';
import { WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WW_WMD_LAUNCHED } from '../data/seats';
import { atWarWithAny, isBarbSeat, isCiv, seatOf, seatsAllied, tileSeat, warIsFormal } from './seats';
import { civEraIndex } from './city';

import { gpPermOf } from '../data/greatPeople';
import { getModifiers } from './effects';
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
 * Everything here takes a SEAT: one set of three entry points, called from
 * every seat's block.
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
  // CIV6 (Trung Trac, Joaquim Marques Lisboa): a permanent percentage off
  // everything this seat accrues from here on. CIV6 (Fascism): "War
  // Weariness reduced by 15%" — the government's cut joins additively.
  const cut = Math.min(100, gpPermOf(s, 'warWearyPct')
    + (isCiv(seat) ? getModifiers(state, seat).wwCutPct : 0));
  // CIV6 (Satyagraha): "Opposing civilizations receive double the war
  // weariness for fighting against Gandhi" — the OTHER seat's row raises what
  // this one accrues against it (`WAR_WEARINESS_ROWS`)
  const foePct = isCiv(other) ? getModifiers(state, other).enemyWarWearinessPct : 0;
  const gained = Math.floor((amount * (100 + foePct)) / 100);
  s.ww[other] = Math.max(0, (s.ww[other] ?? 0) + Math.floor((gained * (100 - cut)) / 100));
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

/**
 * CIV6 (War weariness): "every time you drop a nuke, the war weariness it will
 * incur is equal to 12 times the Era Base value. There is no difference
 * between dropping a Nuclear Device or a Thermonuclear Device" — the launch's
 * own `WW_WMD_LAUNCHED` plus the abroad multiplier, a blast never landing on
 * the launcher's own ground. The bill is the LAUNCHER's alone.
 */
export function warWearinessLaunch(state: GameState, seat: number, other: number): void {
  if (!scores(seat) || !scores(other) || seat === other) return;
  if (!holdsWeariness(seat)) return;
  addWw(state, seat, other, (WW_WMD_LAUNCHED + WW_ABROAD_MULT) * wwEraBase(state, seat, other));
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
