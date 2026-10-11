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
import type { BtRun } from './bt';
import type { MajorUnitView, MajorView } from '../view';

export const NO_PLOT = -1;

export interface OpTeam {
  def: AiOpTeam;
  reqs: readonly AiTeamReq[];
  /** the members' unit ids in the order they joined */
  members: number[];
  /** per requirement, the members carrying its AI type */
  counts: number[];
  /** the team's goal plots by Operation Move's "Move To (enum)": 0 the
   *  rally, 1 the target */
  goals: number[];
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
    return { def: t, reqs, members: [], counts: reqs.map(() => 0), goals: [NO_PLOT, NO_PLOT], ready: false, strength: 0 };
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
