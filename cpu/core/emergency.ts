/**
 * EMERGENCIES, and the SPECIAL SESSIONS that call them. The trigger, the
 * sponsor's 30 favor, the 15-turn spacing, the one-turn hiatus, the vote, the
 * war it forces and every reward magnitude are sourced at the catalog
 * (data/seats.ts).
 *
 * A LEAF module, like `congress`: types, the record, and the readers that
 * consume it. `phase` runs the session, because running one declares wars and
 * cancels routes and this file must stay reachable from `trade` and `units`.
 */
import type { GameState } from './types';
import {
  EMERGENCIES, EMERGENCY_SLOTS, EMERGENCY_CITY_STATE, EMERGENCY_MILITARY,
  EMERGENCY_MEMBER_CS, EMERGENCY_MEMBER_MP, EMERGENCY_TARGET_LOYALTY,
  EMERGENCY_MEMBER_HEAL, EMERGENCY_TARGET_STRIKE_CS,
  EMERGENCY_ENVOY_GOLD, EMERGENCY_CS_ROUTE_GOLD,
} from '../data/seats';

/** PHASE 0 the condition holds and nobody has paid; 1 a sponsor has, and the
 *  session is held on `act`; 2 the emergency runs, and `act` is its deadline. */
export const EMG_PENDING = 0;
export const EMG_CALLED = 1;
export const EMG_RUNNING = 2;

/** The special session's slot in the vote head, past the two rotating
 *  resolutions and the always-3rd Diplomatic Victory one. */
export const CONGRESS_SPECIAL_SLOT = 3;

export interface Emergency {
  /** EMERGENCIES index */
  kind: number;
  /** the offending seat */
  target: number;
  /** the contested city's id inside the TARGET's roster: holding it is what
   *  the members must undo, and losing it is how they win */
  city: number;
  phase: number;
  /** the turn this record acts on — the session turn, then the deadline */
  act: number;
  /** who may SPONSOR: the seats that suffered, taken at the moment of the
   *  outrage. A city-state's envoy-holders cannot be recovered afterwards,
   *  because the conquest deletes the city-state. */
  affected: number[];
  /** seats that voted it through; empty until it runs */
  members: number[];
}

export function emergencies(state: GameState): Emergency[] {
  if (!state.emergencies) state.emergencies = [];
  return state.emergencies;
}

/** Record a condition. It does NOT expire, and it does not need the Congress
 *  open — only the CALL does. A repeat of the same outrage is not recorded
 *  twice, and the table is finite. */
export function raiseEmergency(state: GameState, kind: number, target: number,
                               city: number, affected: readonly number[]): void {
  const list = emergencies(state);
  if (!EMERGENCIES[kind]) return;
  if (!affected.length) return;   // nobody left to bring it to the Congress
  if (list.some((e) => e.kind === kind && e.target === target && e.city === city)) return;
  if (list.length >= EMERGENCY_SLOTS) return;
  list.push({ kind, target, city, phase: EMG_PENDING, act: -1, affected: [...affected], members: [] });
}

/** The emergency now running against `target`, if any. */
function running(state: GameState, target: number): Emergency | null {
  for (const e of emergencies(state)) if (e.phase === EMG_RUNNING && e.target === target) return e;
  return null;
}

// --- WHILE IT RUNS ---------------------------------------------------------

/** CIV6 (Specifics): "Members gain +2 CS against targets' units". */
export function emergencyAttackCS(state: GameState, attacker: number, defender: number): number {
  const e = running(state, defender);
  return e && e.members.includes(attacker) ? EMERGENCY_MEMBER_CS : 0;
}

/** CIV6 (Specifics): "+1 MP in target's territory" for a member. */
export function emergencyMoveBonus(state: GameState, seat: number, groundSeat: number): number {
  if (groundSeat < 0) return 0;
  const e = running(state, groundSeat);
  return e && e.members.includes(seat) ? EMERGENCY_MEMBER_MP : 0;
}

/** CIV6 (Specifics): "target gains +20 Loyalty in the target city". */
export function emergencyLoyalty(state: GameState, seat: number, cityId: number): number {
  for (const e of emergencies(state)) {
    if (e.phase === EMG_RUNNING && e.target === seat && e.city === cityId) return EMERGENCY_TARGET_LOYALTY;
  }
  return 0;
}

// --- WHAT IT LEAVES BEHIND -------------------------------------------------
//
// The rewards are permanent, so they are COUNTERS rather than a list of past
// emergencies: winning the same kind twice pays twice.

/** CIV6 (Military Emergency, success): "Member units gain +5 Healing in the
 *  Target's territory." */
export function emergencyHeal(state: GameState, seat: number, groundSeat: number): number {
  if (groundSeat < 0) return 0;
  return EMERGENCY_MEMBER_HEAL * (state.seats[seat]?.emgHeal?.[groundSeat] ?? 0);
}

/** CIV6 (Military Emergency, failure): "Target gains +2 CS when attacking
 *  member units with a City Strike." */
export function emergencyStrikeCS(state: GameState, cityOwner: number, defender: number): number {
  return EMERGENCY_TARGET_STRIKE_CS * (state.seats[cityOwner]?.emgStrike?.[defender] ?? 0);
}

/** CIV6 (City-State Emergency, success): "Members gain +1 Gold/turn for each
 *  Envoy they have." */
export function emergencyEnvoyGold(state: GameState, seat: number, envoys: number): number {
  return EMERGENCY_ENVOY_GOLD * (state.seats[seat]?.emgEnvoyGold ?? 0) * envoys;
}

/** CIV6 (City-State Emergency, failure): "Target's Trade Routes to City-States
 *  gain +2 Gold." */
export function emergencyCsRouteGold(state: GameState, seat: number): number {
  return EMERGENCY_CS_ROUTE_GOLD * (state.seats[seat]?.emgRouteGold ?? 0);
}

export function emergencyName(kind: number): string {
  return EMERGENCIES[kind]?.name ?? 'Emergency';
}

export { EMERGENCY_CITY_STATE, EMERGENCY_MILITARY };
