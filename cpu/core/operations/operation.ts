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
  /** the members' unit ids in the order they joined, each once */
  members: number[];
  /** the members the team's list holds again (`keepMembers`: a member gone
   *  resolved by its slot to a unit listed already), each once more: the
   *  team update counts them, the orders give each unit one */
  twice: number[];
  /** each member's pool slot as the team's last keep saw it (`keepMembers`):
   *  the player's unit list resolves a member by its slot alone */
  slots: Record<number, number>;
  /** per requirement, the members carrying its AI type */
  counts: number[];
  /** the team's goal plots by Operation Move's "Move To (enum)" (team
   *  +0xe8 + 8 x the slot): 0 the rally, 1 the target, 3 the members' centre,
   *  4 the battle line, 5 the march point (the team update 0x738f20) */
  goals: number[];
  /** enemy targets stand within reach of its members (team +0x90) */
  engaged: boolean;
  /** the team update's battle strengths (0x738f20): the strength of those
   *  targets (team +0x94) and of its members whose planning reaches one of
   *  them this turn (+0x98) */
  enemy: number;
  attack: number;
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
  /** the priority its recruits ask at (tree +0x5a8) where its start wrote
   *  one — the city's defence event writes the city's threat as it starts
   *  its operation —, else its definition's */
  recruitPriority?: number;
  /** its units may be built for it (op +0x5d8, AllowUnitConstruction: set
   *  by an Operation Diplomacy that desires war) */
  allowUnitConstruction: boolean;
  /** the contracts its tree made (their ids in the seat's book) */
  contracts: number[];
  /** the members killed that left its teams (the barbarians' operations) */
  killed?: number;
  /** the members Operation Defend Units released (0x73d1f0: their
   *  assignment, unit +0x7d0, to -1) or an offer took for another job
   *  (0x60a8c0 -> 0x1e60f0), the teams untouched: still its teams' members
   *  until the next team update drops them, but in no job of it */
  released?: number[];
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
      enemy: 0, attack: 0, minsMet: false, ready: false, ongoing: false, unit: null, strength: 0, joined: 0, twice: [], slots: {} };
  });
}

/** a team's Condition: IsCoastalTarget (0x73a880), the target's plot coastal
 *  land (IsCoastalLand 0x82a10 at the ocean's least size): land beside water
 *  that is no lake's (runs/h1_duels1132 Babylon on 20:20 beside the one-plot
 *  lake 20:19: its City Defense holds no City Naval Defense team, t44) */
function teamApplies(t: AiOpTeam, view: AiView, target: number): boolean {
  if (!t.condition) return true;
  if (t.condition !== 'IsCoastalTarget' || target < 0) return false;
  const plots = view.plots();
  return !plots[target].water && view.plotsWithin(target, 1).some((p) => plots[p].water && !plots[p].lake);
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

/** THE TEAMS' KEEP (0x732cd0, as the team update 0x73fba0 runs it): of each
 *  team's members those the player's unit list holds (0x4f2310), alive and
 *  assigned to the operation (unit +0x7d0). The list finds a unit by its
 *  id's low 16 bits, its pool slot, alone: a member gone whose slot a unit
 *  in a job of the operation (`opJobUnits`) now holds stays, as that unit,
 *  which the list then holds twice (`OpTeam.twice`; runs/h1_duely1124 t120:
 *  city-state 4's Pikeman 1048582 killed at t119, its slot 6 taken by the
 *  Trebuchet 1441798 built for Attack Barb Camp, the team three Trebuchets
 *  at 105). `live` the seat's units, `slotOf` their pool slots by id; each
 *  member's slot is kept for the next keep. */
export function keepMembers(op: Operation, live: ReadonlySet<number>, slotOf: ReadonlyMap<number, number>): void {
  const bySlot = new Map<number, number>();
  for (const [id, s] of slotOf) bySlot.set(s, id);
  const jobs = new Set(opJobUnits(op).filter((id) => live.has(id)));
  const bySlotOf = (t: OpTeam, id: number): number | undefined => (t.slots[id] === undefined ? undefined : bySlot.get(t.slots[id]));
  for (const t of op.teams) {
    // the members, each once in its first place, then the repeats, each
    // beside a member of its own
    const once = new Set<number>();
    const twice: number[] = [];
    const members: number[] = [];
    for (const id of t.members) {
      const now = live.has(id) ? id : bySlotOf(t, id);
      if (now === undefined || (now !== id && !jobs.has(now))) continue;
      if (once.has(now)) twice.push(now);
      else {
        once.add(now);
        members.push(now);
      }
    }
    for (const id of t.twice) {
      const now = live.has(id) ? id : bySlotOf(t, id);
      if (now !== undefined && jobs.has(now) && once.has(now)) twice.push(now);
    }
    t.members = members;
    t.twice = twice;
    t.slots = {};
    for (const id of once) {
      const s = slotOf.get(id);
      if (s !== undefined) t.slots[id] = s;
    }
  }
}

/** a team's list as the team update counts it: its members, then the ones
 *  it holds again (`OpTeam.twice`) that are members still */
export const teamList = (t: OpTeam): number[] => [...t.members, ...teamTwice(t)];

/** the members a team's list holds again, those that are members still */
export const teamTwice = (t: OpTeam): number[] => t.twice.filter((id) => t.members.includes(id));

/** the operation's unit to build (0x739cd0): the first team's that names
 *  one, null for none */
export const opUnit = (op: Operation): string | null => op.teams.find((t) => t.unit !== null)?.unit ?? null;

/** the units the operation holds, every team's, in team then join order */
export function opUnits(op: Operation): number[] {
  return op.teams.flatMap((t) => t.members);
}

/** the operations a higher one's recruit left with no unit in the run: each
 *  ends at its own tick, no node of its tree run (`tickTree`) */
export const robbedOps = new WeakSet<Operation>();

/** the units whose assignment (unit +0x7d0) is the operation, in team then
 *  join order (0x6092c0 by its id): its members but those released */
export function opJobUnits(op: Operation): number[] {
  const out = opUnits(op);
  return op.released ? out.filter((id) => !op.released!.includes(id)) : out;
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
 *  carries it this turn), its formation with it; `attack` the order's attack
 *  flag 0x10 */
export function moveTo(ctx: OpsContext, u: AiUnitView, dest: number, attack = false): void {
  if (u.plot === dest || u.movesLeft <= 0) return;
  ctx.move(u.id, dest, attack);
}

/** a plot as the operation logs write it, x:y (-9999:-9999 for none) */
export const xy = (view: AiView, p: number): string => (p < 0 ? '-9999:-9999' : `${view.plots()[p].x}:${view.plots()[p].y}`);

/** the seat's units by id */
export const unitsById = (view: AiView, seat: number): Map<number, AiUnitView> => new Map(view.units(seat).map((u) => [u.id, u]));
