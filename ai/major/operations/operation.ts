/**
 * THE MAJORS' OPERATIONS (GameCore_XP2 AI/Operation.cpp, AI/MilitaryAI;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the operations").
 *
 * An operation is an AiOperationDefs row run against a target: its teams
 * (AiOperationTeams, each with its OpTeamRequirements), the units they
 * recruited, its target and rally plots, the backup target the manager's
 * candidate for it names (the best other target of its kind), the strengths
 * its tree's nodes weigh, and the behaviour tree it runs.
 */
import { AI_OP_TEAMS, AI_TEAM_REQS, AI_UNIT_AI } from './tables';
import type { AiOpDef, AiOpTeam, AiTeamReq } from './types';
import type { BtRun } from '../../../cpu/core/behaviorTree';
import type { MajorUnitView, MajorView } from '../view';
import type { OpsContext } from './nodes';

export const NO_PLOT = -1;

export interface OpTeam {
  def: AiOpTeam;
  reqs: readonly AiTeamReq[];
  /** the members' unit ids in the order they joined */
  members: number[];
  /** per requirement, the members carrying its AI type */
  counts: number[];
  /** the team's goal plots by Operation Move's "Move To (enum)" (team
   *  +0xe8 + 8 x the slot): 0 the rally, 1 the target, 3 the members' centre,
   *  4 the battle line, 5 the march point (the team update 0x738f20) */
  goals: number[];
  /** enemy targets stand within reach of its members (team +0x90) */
  engaged: boolean;
  /** every requirement's minimum met (team +0x11) */
  ready: boolean;
  /** the members' strength (0x73fba0): each its larger of combat and ranged
   *  strength, less a tenth of its damage */
  strength: number;
}

export interface Operation {
  id: number;
  def: AiOpDef;
  /** the player the operation is against, -1 for none */
  enemy: number;
  target: number;
  rally: number;
  /** the manager's candidate for the running operation: the best other
   *  target of its kind (op +0x3d8) */
  backup: { target: number; rally: number; enemy: number } | null;
  teams: OpTeam[];
  run: BtRun;
  started: number;
  /** the enemy strength about the target (op +0x510) and the teams' (op
   *  +0x4b0) */
  enemyStrength: number;
  strength: number;
  /** the trigger's units and value (Decode Trigger) */
  triggerUnits: number[];
  triggerValue: number;
  /** the units locked to the operation (Lock Units) */
  locked: boolean;
  /** its units may be built for it (op +0x5d8, AllowUnitConstruction: set
   *  by an Operation Diplomacy that desires war) */
  allowUnitConstruction: boolean;
  /** the contracts its tree made (their ids in the seat's book) */
  contracts: number[];
  /** the formations Make Formation made: a civilian and its escort, which
   *  move as one */
  formations: [number, number][];
}

/** the unit AI types a unit type carries (UnitAiInfos) */
export const unitAiTypes = (unitType: string): readonly string[] => AI_UNIT_AI[unitType] ?? [];
export const hasAiType = (unitType: string, ai: string): boolean => unitAiTypes(unitType).includes(ai);

export function newTeams(def: AiOpDef, view: MajorView, target: number): OpTeam[] {
  return (AI_OP_TEAMS[def.name] ?? []).filter((t) => teamApplies(t, view, target)).map((t) => {
    const reqs = AI_TEAM_REQS[t.team] ?? [];
    return { def: t, reqs, members: [], counts: reqs.map(() => 0), goals: [NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT], engaged: false,
      ready: false, strength: 0 };
  });
}

/** a team's Condition: IsCoastalTarget, the target beside water */
function teamApplies(t: AiOpTeam, view: MajorView, target: number): boolean {
  if (!t.condition) return true;
  if (t.condition === 'IsCoastalTarget') return target >= 0 && view.plotsWithin(target, 1).some((p) => view.plots()[p].water);
  return false;
}

/** a unit's strength as a team member (0x73fba0): the larger of its combat
 *  and ranged strengths, less a tenth of its damage */
export function memberStrength(u: MajorUnitView): number {
  return Math.max(u.combat, u.ranged) - Math.trunc(u.damage * 0.1);
}

/** a unit's strength as the recruits weigh it (0x73c7c0): the larger of its
 *  combat and ranged strengths */
export const unitStrength = (u: MajorUnitView): number => Math.max(u.combat, u.ranged);

/** add a unit to a team (0x737f90): its id joins the members, each
 *  requirement it meets counts it */
export function addMember(team: OpTeam, u: MajorUnitView): void {
  if (team.members.includes(u.id)) return;
  team.members.push(u.id);
  team.reqs.forEach((r, i) => {
    if (hasAiType(u.type, r.aiType)) team.counts[i]++;
  });
}

export function removeMember(team: OpTeam, u: MajorUnitView): void {
  const k = team.members.indexOf(u.id);
  if (k < 0) return;
  team.members.splice(k, 1);
  team.reqs.forEach((r, i) => {
    if (hasAiType(u.type, r.aiType)) team.counts[i]--;
  });
}

/** every requirement's minimum met: its count, and its share of the
 *  members */
export function teamReady(team: OpTeam): boolean {
  return team.reqs.every((r, i) => {
    if (r.min !== null && team.counts[i] < r.min) return false;
    if (r.minPercentage > 0 && team.counts[i] < team.members.length * r.minPercentage) return false;
    return true;
  });
}

/** May the unit join the team without breaking a requirement's maximum
 *  (0x73be10 / 0x73c7c0)? Each requirement it carries: its count below the
 *  MaxNumber, its share with the unit at most MaxPercentage of the members
 *  with it; a requirement it lacks that wants every member (MinPercentage 1)
 *  bars it. `extra` counts the units already taken this pass. */
export function fitsMaxima(team: OpTeam, unitType: string, extra: number, skip = -1): { fits: boolean; matched: boolean } {
  let matched = false;
  for (let j = 0; j < team.reqs.length; j++) {
    if (j === skip) continue;
    const r = team.reqs[j];
    if (hasAiType(unitType, r.aiType)) {
      if (r.max !== null && r.max >= 0 && team.counts[j] >= r.max) return { fits: false, matched };
      if (r.maxPercentage >= 0 && team.counts[j] + 1 > (team.members.length + extra + 1) * r.maxPercentage) return { fits: false, matched };
      matched = true;
    } else if (r.minPercentage > 0 && r.minPercentage === 1) return { fits: false, matched };
  }
  return { fits: true, matched };
}

/** the units the operation holds, every team's, in team then join order */
export function opUnits(op: Operation): number[] {
  return op.teams.flatMap((t) => t.members);
}

/** the operation's target gone (0x73a8e0): a camp target no camp the seat
 *  knows stands on; a city target no city stands on; never a friendly city
 *  or a settle site; any other kind always */
export function targetGone(view: MajorView, seat: number, op: Operation): boolean {
  switch (op.def.targetType) {
    case 'TARGET_BARBARIAN_CAMP':
      return !view.barbarianCamps(seat).includes(op.target);
    case 'TARGET_ENEMY_COMBAT_DISTRICT':
    case 'TARGET_ENEMY_PASSIVE_DISTRICT':
      return op.target === NO_PLOT || !view.plots()[op.target].city;
    case 'TARGET_FRIENDLY_CITY':
    case 'TARGET_SETTLE_LOCATION':
      return false;
    default:
      return true;
  }
}

/** a unit's move order to a plot: the steps of its path, as far as its
 *  Movement carries it this turn (the engine refuses the rest) */
export function moveTo(ctx: OpsContext, u: MajorUnitView, dest: number): void {
  if (u.plot === dest || u.movesLeft <= 0) return;
  const view = ctx.view();
  const path = view.unitPath(u.id, dest);
  if (path.length === 0) return;
  const reach = new Map(view.unitReach(u.id, 1).map((r) => [r.plot, r] as const));
  const units = view.units(ctx.seat);
  const col = units.findIndex((x) => x.id === u.id);
  if (col < 0) return;
  // a formation's other unit steps with it
  const pair = ctx.op.formations.find((f) => f.includes(u.id));
  const mate = pair ? units.findIndex((x) => x.id === (pair[0] === u.id ? pair[1] : pair[0])) : -1;
  const together = mate >= 0 && units[mate].plot === u.plot;
  const rows: number[][] = [];
  let at = u.plot;
  for (const p of path) {
    const r = reach.get(p);
    if (!r || r.turns > 1) break;
    const row = units.map(() => -1);
    const a = view.unitActionColumn(`MOVE_${view.stepDirection(at, p)}`);
    row[col] = a;
    if (together) row[mate] = a;
    rows.push(row);
    at = p;
  }
  if (rows.length) ctx.act(rows);
}

/** a plot as the operation logs write it, x:y (-9999:-9999 for none) */
export const xy = (view: MajorView, p: number): string => (p < 0 ? '-9999:-9999' : `${view.plots()[p].x}:${view.plots()[p].y}`);

/** the seat's units by id */
export const unitsById = (view: MajorView, seat: number): Map<number, MajorUnitView> => new Map(view.units(seat).map((u) => [u.id, u]));
