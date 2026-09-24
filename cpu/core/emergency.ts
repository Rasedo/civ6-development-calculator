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
  EMERGENCY_ENVOY_GOLD, EMERGENCY_CS_ROUTE_GOLD, EMERGENCY_NUCLEAR,
  EMERGENCY_NUKE_TARGET_CS, EMERGENCY_NUKE_LOYALTY_CUT,
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

// --- WHILE IT RUNS ---------------------------------------------------------

/** Whether `member` belongs to a Military or Nuclear emergency now running
 *  against `target`. Those two carry the running combat and movement buffs
 *  (`EmergencyBuffs`: the _COMBAT_STRENGTH_ATTACK / _DEFEND and _MOVEMENT_BUFF
 *  rows); the City-State emergency's only running buff is the target city's
 *  loyalty. */
function armedMember(state: GameState, member: number, target: number): boolean {
  return emergencies(state).some((e) => e.phase === EMG_RUNNING && e.target === target
    && (e.kind === EMERGENCY_MILITARY || e.kind === EMERGENCY_NUCLEAR)
    && e.members.includes(member));
}

/** The ATTACKER's net emergency CS against `defender`, for every combat of a
 *  unit against a unit, melee or ranged. Each term is written on the attacker
 *  as the difference it makes to the roll.
 *  CIV6 (MILITARY_ / NUCLEAR_EMERGENCY_MEMBER_COMBAT_STRENGTH_ATTACK, Amount -2
 *  on the DEFENDER when a member attacks the target; _DEFEND, Amount -2 on the
 *  ATTACKER when the target attacks a member): while it runs, the member
 *  attacking its target is 2 up, and the target attacking a member 2 down.
 *  CIV6 (Nuclear Emergency, success;
 *  NUCLEAR_EMERGENCY_MEMBER_COMBAT_STRENGTH_ATTACK_REWARD / _DEFEND_REWARD,
 *  Amount -3 on the target's side both ways): "Target units have -3 CS when
 *  fighting Member units" — a member attacking its old target gains the 3,
 *  and the old target attacking a member loses them. */
export function emergencyAttackCS(state: GameState, attacker: number, defender: number): number {
  const live = (armedMember(state, attacker, defender) ? EMERGENCY_MEMBER_CS : 0)
    - (armedMember(state, defender, attacker) ? EMERGENCY_MEMBER_CS : 0);
  const won = state.seats[attacker]?.emgNukeCS?.[defender] ?? 0;
  const lost = state.seats[defender]?.emgNukeCS?.[attacker] ?? 0;
  return live + EMERGENCY_NUKE_TARGET_CS * (won - lost);
}

/** CIV6 (Specifics): "+1 MP in target's territory" for a member of a Military
 *  or Nuclear emergency (MILITARY_ / NUCLEAR_EMERGENCY_MEMBER_MOVEMENT_BUFF). */
export function emergencyMoveBonus(state: GameState, seat: number, groundSeat: number): number {
  if (groundSeat < 0) return 0;
  return armedMember(state, seat, groundSeat) ? EMERGENCY_MEMBER_MP : 0;
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

/** CIV6 (Nuclear Emergency, failure; NUCLEAR_EMERGENCY_TARGET_CULTURAL_IDENTITY_REWARD,
 *  EFFECT_ADJUST_CITY_IDENTITY_PRESSURE -1 over the MEMBERS' cities): "Member
 *  cities exert one less Loyalty pressure" — each of this seat's cities presses
 *  as if it had this many fewer citizens, on every city in reach. */
export function emergencyPressureCut(state: GameState, seat: number): number {
  return EMERGENCY_NUKE_LOYALTY_CUT * (state.seats[seat]?.emgNukeCut ?? 0);
}

export function emergencyName(kind: number): string {
  return EMERGENCIES[kind]?.name ?? 'Emergency';
}

export { EMERGENCY_CITY_STATE, EMERGENCY_MILITARY, EMERGENCY_NUCLEAR };
