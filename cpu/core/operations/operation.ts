/**
 * THE OPERATIONS (GameCore_XP2 AI/Operation.cpp, AI/MilitaryAI; the reading
 * is tools/civ6lab/dll_readings.md "C-97: the operations").
 *
 * An operation is an AiOperationDefs row run against a target: its teams
 * (AiOperationTeams, each with its OpTeamRequirements), the units they
 * recruited, its target and rally plots, the backup target the manager's
 * candidate for it names (the best other target of its kind), the strengths
 * its tree's nodes weigh, and the behaviour tree it runs. It is plain data:
 * its rows by name, its tree's run between ticks as its node statuses,
 * memories and tagged data.
 */
import { AI_OP_DEFS, AI_OP_TEAMS, AI_TEAM_REQS, AI_UNIT_AI } from '../../data/aiOperations';
import type { AiOpDef, AiOpTeam, AiTeamReq } from './types';
import type { BtMemory } from '../behaviorTree';
import type { AiUnitView, AiView } from '../aiViewTypes';
import type { OpsContext } from './nodes';

export const NO_PLOT = -1;

export interface OpTeam {
  /** its AiOperationTeams row's TeamName (`teamDef`, `teamReqs`) */
  team: string;
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
  /** every requirement's minimum met (team +0x10); that and the initial
   *  strength advantage (+0x11, its readiness); that and the ongoing one
   *  (+0x12) */
  minsMet: boolean;
  ready: boolean;
  ongoing: boolean;
  /** the unit the team asks to be built (+0x14), null for none */
  unit: string | null;
  /** the members' strength (0x73fba0): each its larger of combat and ranged
   *  strength, less a tenth of its damage */
  strength: number;
  /** the units the team has taken in (the join's second list, team +0x48,
   *  its count +0x58): a member killed counted still */
  joined: number;
}

export interface Operation {
  id: number;
  /** its AiOperationDefs row's name (`opDef`) */
  def: string;
  /** the player the operation is against, -1 for none */
  enemy: number;
  target: number;
  rally: number;
  /** the manager's candidate for the running operation: the best other
   *  target of its kind (op +0x3d8) */
  backup: { target: number; rally: number; enemy: number } | null;
  teams: OpTeam[];
  /** its tree's run between ticks: each node's status and memory, the
   *  tagged data, the root finished */
  status: number[];
  mem: BtMemory[];
  bb: Record<string, unknown>;
  done: boolean;
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
  /** the members killed that left its teams (the barbarians' operations) */
  killed?: number;
}

/** the operation's AiOperationDefs row */
export const opDef = (op: Operation): AiOpDef => AI_OP_DEFS[op.def];

/** the team's AiOperationTeams row of the operation */
export const teamDef = (op: Operation, t: OpTeam): AiOpTeam => (AI_OP_TEAMS[op.def] ?? []).find((x) => x.team === t.team)!;

/** the team's OpTeamRequirements */
export const teamReqs = (t: OpTeam): readonly AiTeamReq[] => AI_TEAM_REQS[t.team] ?? [];

/** the unit AI types a unit type carries (UnitAiInfos) */
export const unitAiTypes = (unitType: string): readonly string[] => AI_UNIT_AI[unitType] ?? [];
export const hasAiType = (unitType: string, ai: string): boolean => unitAiTypes(unitType).includes(ai);

export function newTeams(def: AiOpDef, view: AiView, target: number): OpTeam[] {
  return (AI_OP_TEAMS[def.name] ?? []).filter((t) => teamApplies(t, view, target)).map((t) => {
    const reqs = AI_TEAM_REQS[t.team] ?? [];
    return { team: t.team, members: [], counts: reqs.map(() => 0), goals: [NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT, NO_PLOT], engaged: false,
      minsMet: false, ready: false, ongoing: false, unit: null, strength: 0, joined: 0 };
  });
}

/** a team's Condition: IsCoastalTarget, the target beside water */
function teamApplies(t: AiOpTeam, view: AiView, target: number): boolean {
  if (!t.condition) return true;
  if (t.condition === 'IsCoastalTarget') return target >= 0 && view.plotsWithin(target, 1).some((p) => view.plots()[p].water);
  return false;
}

/** a unit's strength as a team member (0x73fba0): the larger of its combat
 *  and ranged strengths, less a tenth of its damage */
export function memberStrength(u: AiUnitView): number {
  return Math.max(u.combat, u.ranged) - Math.trunc(u.damage * 0.1);
}

/** a unit's strength as the recruits weigh it (0x73c7c0): the larger of its
 *  combat and ranged strengths */
export const unitStrength = (u: AiUnitView): number => Math.max(u.combat, u.ranged);

/** add a unit to a team (0x737f90): its id joins the members, each
 *  requirement it meets counts it */
export function addMember(team: OpTeam, u: Pick<AiUnitView, 'id' | 'type'>): void {
  if (team.members.includes(u.id)) return;
  team.members.push(u.id);
  team.joined++;
  teamReqs(team).forEach((r, i) => {
    if (hasAiType(u.type, r.aiType)) team.counts[i]++;
  });
}

/** the operation's unit to build (0x739cd0): the first team's that names
 *  one, null for none */
export const opUnit = (op: Operation): string | null => op.teams.find((t) => t.unit !== null)?.unit ?? null;

/** the units the operation holds, every team's, in team then join order */
export function opUnits(op: Operation): number[] {
  return op.teams.flatMap((t) => t.members);
}

/** the operation holds a living unit (a member killed stays in its team) */
export function holdsUnits(ctx: OpsContext, op: Operation): boolean {
  const live = new Set(ctx.view().units(ctx.seat).map((u) => u.id));
  return opUnits(op).some((id) => live.has(id));
}

/** the operation's target gone (0x73a8e0): a camp target no camp the seat
 *  knows stands on; a city target no city stands on; never a friendly city
 *  or a settle site; any other kind always */
export function targetGone(ctx: OpsContext, op: Operation): boolean {
  const view = ctx.view();
  switch (opDef(op).targetType) {
    case 'TARGET_BARBARIAN_CAMP':
      return !ctx.camps().includes(op.target);
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

/** a unit's move to a plot (the seat's move order, as far as its Movement
 *  carries it this turn), its formation's other unit with it */
export function moveTo(ctx: OpsContext, u: AiUnitView, dest: number): void {
  if (u.plot === dest || u.movesLeft <= 0) return;
  const pair = ctx.op.formations.find((f) => f.includes(u.id));
  ctx.move(u.id, dest, pair ? (pair[0] === u.id ? pair[1] : pair[0]) : -1);
}

/** a plot as the operation logs write it, x:y (-9999:-9999 for none) */
export const xy = (view: AiView, p: number): string => (p < 0 ? '-9999:-9999' : `${view.plots()[p].x}:${view.plots()[p].y}`);

/** the seat's units by id */
export const unitsById = (view: AiView, seat: number): Map<number, AiUnitView> => new Map(view.units(seat).map((u) => [u.id, u]));
