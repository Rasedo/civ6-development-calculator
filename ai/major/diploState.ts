/**
 * THE MAJORS' DIPLOMATIC STATE AS THE GAME'S AI RUNS IT: what each major's
 * diplomacy holds toward each major it has met (DIPLO_STATE_*), the state
 * every diplomatic action's worth and cost is read in
 * (tools/civ6lab/dll_readings.md "C-97: the majors' diplomatic actions").
 *
 * THE START AND THE TRIGGERS. A major meets another in DiplomaticStartStates'
 * state (Neutral between two full civilizations). A war turns the state to
 * War and its peace to Unfriendly (DiplomaticTriggeredTransitions GO_TO_WAR,
 * MAKE_PEACE); a state a trigger set holds for the rest of that turn (the
 * entry's changed flag, +0x1a).
 *
 * THE TURN (0x67b6e0, at the opening of the owner's diplomatic AI turn, the
 * entries' terms 0x67aaf0). Each DiplomaticStateTransitions row out of the
 * state, in table order, is REQUIRED when its bound holds — RequireTransitionMax
 * reached from below (opinion >= it), else RequireTransitionMin from above
 * (opinion <= it) — and its AllowTransitionCheck passes; the first required
 * row is taken. Failing that a row is ALLOWED when the opinion lies within
 * AllowTransitionMin..AllowTransitionMax and its check passes, and weighs the
 * owner's desires (each action's, where the game would let it be taken) of the
 * actions the target state adds, less those it drops, plus the best of the
 * actions that lead into it; the AI moves to the heaviest positive row whose
 * target still holds every action it now desires. The checks and the
 * desires are the action evaluator's: what the port does not read yet is
 * counted in the gaps and leaves the row untaken.
 */
import { DIPLO_STATE_ACTIONS, DIPLO_TRANSITIONS } from './diplomacyTables';
import type { MajorView } from './view';

export const START_STATE = 'DIPLO_STATE_NEUTRAL';
export const WAR_STATE = 'DIPLO_STATE_WAR';
export const PEACE_STATE = 'DIPLO_STATE_UNFRIENDLY';

type Transition = (typeof DIPLO_TRANSITIONS)[number];

/** one owner's state toward one major and the turn a trigger last set it */
interface PairState {
  state: string;
  /** the game turn a trigger set the state (no transition that turn) */
  changed: number;
}

export interface DiploStateMemory {
  /** per `${owner}>${other}` */
  pairs: Map<string, PairState>;
}

/** what the state turn could not settle: a transition's check, or an allowed
 *  row whose weight needs a desire the port does not read, counted per
 *  evaluation by name */
export interface DiploStateGaps {
  checks: Map<string, number>;
  allowed: Map<string, number>;
}

export const newDiploStateMemory = (): DiploStateMemory => ({ pairs: new Map() });
export const newDiploStateGaps = (): DiploStateGaps => ({ checks: new Map(), allowed: new Map() });

const key = (owner: number, other: number) => `${owner}>${other}`;
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** the rows out of a state, in table order */
const OUT_OF = new Map<string, Transition[]>();
for (const t of DIPLO_TRANSITIONS) {
  const list = OUT_OF.get(t.from) ?? [];
  list.push(t);
  OUT_OF.set(t.from, list);
}

/** an AllowTransitionCheck's verdict, null where the port does not read it */
type Check = (view: MajorView, owner: number, other: number) => boolean | null;

/** the checks the port reads (0x67ff10 registers them by name) */
const CHECKS: Record<string, Check> = {};

function check(view: MajorView, owner: number, other: number, t: Transition, gaps: DiploStateGaps): boolean {
  if (!t.check) return true;
  const f = CHECKS[t.check];
  const v = f ? f(view, owner, other) : null;
  if (v === null) {
    bump(gaps.checks, t.check);
    return false;
  }
  return v;
}

/** 0x67aaf0's REQUIRED term: the bound (RequireTransitionMax first) */
function requiredBound(t: Transition, opinion: number): boolean {
  if (t.requireMax !== null) return opinion >= t.requireMax;
  if (t.requireMin !== null) return opinion <= t.requireMin;
  return t.check !== null;
}

/** 0x67aaf0's ALLOWED band */
function allowedBand(t: Transition, opinion: number): boolean {
  if (t.allowMax !== null && opinion > t.allowMax) return false;
  if (t.allowMin !== null && opinion < t.allowMin) return false;
  return t.allowMin !== null || t.allowMax !== null;
}

/** the actions an AI may take in a state, not leading out of it (the
 *  entries' A / B sets, 0x67aff0) */
const aiActions = (state: string): Set<string> =>
  new Set(DIPLO_STATE_ACTIONS.filter((r) => r.state === state && r.aiAllowed && !r.to).map((r) => r.action));

/** the owner's state toward `other`, null before they meet */
export function diploState(mem: DiploStateMemory, owner: number, other: number): string | null {
  return mem.pairs.get(key(owner, other))?.state ?? null;
}

/**
 * ONE OWNER'S DIPLOMATIC STATES at the opening of its diplomatic AI turn:
 * the start state for a major newly met, the war and peace triggers, then the
 * transitions on the owner's opinion of each major (`opinionOf`).
 */
export function diploStateTurn(view: MajorView, mem: DiploStateMemory, owner: number, opinionOf: (other: number) => number,
                               gaps: DiploStateGaps): void {
  for (const other of view.majors()) {
    if (other === owner || view.metTurn(owner, other) === null) continue;
    const k = key(owner, other);
    let p = mem.pairs.get(k);
    if (!p) {
      p = { state: START_STATE, changed: -1 };
      mem.pairs.set(k, p);
    }
    const war = view.atWar(owner, other);
    if (war && p.state !== WAR_STATE) {
      p.state = WAR_STATE;
      p.changed = view.turn;
    } else if (!war && p.state === WAR_STATE) {
      p.state = PEACE_STATE;
      p.changed = view.turn;
    }
    if (p.changed === view.turn) continue;
    const opinion = opinionOf(other);
    const rows = OUT_OF.get(p.state) ?? [];
    const required = rows.find((t) => requiredBound(t, opinion) && check(view, owner, other, t, gaps));
    if (required) {
      p.state = required.to;
      continue;
    }
    // the allowed rows weigh the action evaluator's desires, which the port
    // does not read yet: each row in its band stays untaken, counted
    const here = aiActions(p.state);
    for (const t of rows) {
      if (!allowedBand(t, opinion)) continue;
      const there = aiActions(t.to);
      const moved = [...there].filter((a) => !here.has(a)).concat([...here].filter((a) => !there.has(a)),
        DIPLO_STATE_ACTIONS.filter((r) => r.to === t.to && r.state === p!.state).map((r) => r.action));
      if (moved.length > 0) bump(gaps.allowed, `${t.from.replace('DIPLO_STATE_', '')}>${t.to.replace('DIPLO_STATE_', '')}`);
    }
  }
}
