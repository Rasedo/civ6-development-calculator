/**
 * THE MAJORS' DIPLOMATIC STATE AS THE GAME'S AI RUNS IT: what each major's
 * diplomacy holds toward each major it has met (DIPLO_STATE_*), the state
 * every diplomatic action's worth and cost is read in
 * (tools/civ6lab/dll_readings.md "C-97: the majors' diplomatic actions" and
 * "C-97: the other actions' desires, the trust and the transitions").
 *
 * THE START AND THE TRIGGERS. A major meets another in DiplomaticStartStates'
 * state (Neutral between two full civilizations). DiplomaticTriggeredTransitions
 * set the state on the pair's events: a war to War and its peace to
 * Unfriendly, a declared friendship to Declared Friend and its end to
 * Friendly, a denouncement (either way) to Denounced and its end to
 * Unfriendly, an alliance to Allied and its end to Friendly. A state a
 * trigger set holds for the rest of that turn (the entry's changed flag,
 * +0x1a).
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
 * target still holds every action it now desires. A row taken runs its
 * TransitionAction (0x67b410) and the state moves only where that returns
 * true: OnDeclareFriendship (0x681b60) offers the friendship and returns
 * false (the friendship's trigger moves the state once it is struck);
 * OnDenouncePlayer (0x681c10) denounces and returns true. The checks, the
 * desires and the actions are the action evaluator's: what the port does not
 * read is counted in the gaps and leaves the row untaken.
 */
import { DIPLO_STATE_ACTIONS, DIPLO_TRANSITIONS } from './diplomacyTables';
import type { MajorView } from './view';
import { FX, yieldValue } from '../../cpu/core/aiValue';
import {
  ACTION_ALLIANCE, ACTION_DENOUNCE, ACTION_FRIENDSHIP, type DiploActionMemory, friendshipSpaced, threatTerm,
} from './diploActions';

export const START_STATE = 'DIPLO_STATE_NEUTRAL';
export const WAR_STATE = 'DIPLO_STATE_WAR';
export const PEACE_STATE = 'DIPLO_STATE_UNFRIENDLY';
const FRIEND_STATE = 'DIPLO_STATE_DECLARED_FRIEND';
const FRIENDLY_STATE = 'DIPLO_STATE_FRIENDLY';
const DENOUNCED_STATE = 'DIPLO_STATE_DENOUNCED';
const ALLIED_STATE = 'DIPLO_STATE_ALLIED';

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
 *  row whose weight needs a desire the port does not read, or a transition's
 *  action, counted per evaluation by name */
export interface DiploStateGaps {
  checks: Map<string, number>;
  allowed: Map<string, number>;
  actions: Map<string, number>;
}

export const newDiploStateMemory = (): DiploStateMemory => ({ pairs: new Map() });
export const newDiploStateGaps = (): DiploStateGaps => ({ checks: new Map(), allowed: new Map(), actions: new Map() });

const key = (owner: number, other: number) => `${owner}>${other}`;
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** the rows out of a state, in table order */
const OUT_OF = new Map<string, Transition[]>();
for (const t of DIPLO_TRANSITIONS) {
  const list = OUT_OF.get(t.from) ?? [];
  list.push(t);
  OUT_OF.set(t.from, list);
}

/** an owner's desire of an action toward a major in its state now, raw
 *  24.8, null where the port does not read the action's desire; `canDo`
 *  whether the game's CanDoAction lets the owner take it */
export type DesireOf = (other: number, action: string) => { desire: number | null; canDo: boolean };

/** what the transitions' checks and actions read beside the view */
export interface TransitionInputs {
  desireOf: DesireOf;
  /** the owner's sending memory: the last action's turn */
  sender: DiploActionMemory;
  /** the owner's preference of an action */
  pref: (action: string) => number;
}

/** an action a transition sends: the friendship offered, the denouncement */
export interface TransitionAction { owner: number; other: number; kind: 'friendship' | 'denounce' }

/** an AllowTransitionCheck's verdict, null where the port does not read it */
type Check = (view: MajorView, owner: number, other: number, inp: TransitionInputs) => boolean | null;

/** the checks the port reads (0x67ff10 registers them by name) */
const CHECKS: Partial<Record<string, Check>> = {
  // 0x67c740: the game's CanDoAction, the not-ready flag (clear between AI
  // majors), the friendship's spacing toward a full civ, the owner's desire
  // of the friendship at 0 or more
  CanDeclareFriendship: (view, owner, other, inp) => {
    if (view.actionOpen(owner, other, ACTION_FRIENDSHIP) !== true) return false;
    if (!friendshipSpaced(view, inp.sender, owner, other)) return false;
    const d = inp.desireOf(other, ACTION_FRIENDSHIP).desire;
    return d === null ? null : d >= 0;
  },
  // 0x67c860: an AI owner, the denouncement not disfavoured, the game's
  // CanDoAction, the surprise war's CanDeclareWarOn
  CanDenounce: (view, owner, other, inp) => inp.pref(ACTION_DENOUNCE) >= 0
    && view.actionOpen(owner, other, ACTION_DENOUNCE) === true && view.warOpen(owner, other, false),
  // 0x67c920: fewer than three wars, then the military AI's war operation
  // against the other (0x723cf0), unread
  CanGoToWar: (view, owner) => (view.majors().filter((p) => p !== owner && view.atWar(owner, p)).length >= 3 ? false : null),
  // 0x67ca30: the alliance's spacing toward a full civ, then an alliance type
  // the game lets be offered and the other's evaluator's cost of it, unread
  CanOfferAlliance: (view, owner, other, inp) => {
    if (!friendshipSpaced(view, inp.sender, owner, other)) return false;
    return view.actionOpen(owner, other, ACTION_ALLIANCE) === true ? null : false;
  },
};

function check(view: MajorView, owner: number, other: number, t: Transition, inp: TransitionInputs | undefined,
               gaps: DiploStateGaps): boolean {
  if (!t.check) return true;
  const f = CHECKS[t.check];
  const v = f && inp ? f(view, owner, other, inp) : null;
  if (v === null) {
    bump(gaps.checks, t.check);
    return false;
  }
  return v;
}

/** a row's TransitionAction (0x67b410: none passes): whether the state moves,
 *  and what it sends */
function transitionAction(view: MajorView, owner: number, other: number, t: Transition, sent: TransitionAction[],
                          gaps: DiploStateGaps): boolean {
  if (!t.action) return true;
  if (t.action === 'OnDeclareFriendship') {
    if (view.actionOpen(owner, other, ACTION_FRIENDSHIP) === true) sent.push({ owner, other, kind: 'friendship' });
    return false;
  }
  if (t.action === 'OnDenouncePlayer') {
    if (view.actionOpen(owner, other, ACTION_DENOUNCE) !== true) return false;
    sent.push({ owner, other, kind: 'denounce' });
    bump(gaps.actions, 'OnDenouncePlayer: PrepareForWarWith');
    return true;
  }
  bump(gaps.actions, t.action);
  return false;
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

/** THE TRIGGERS (DiplomaticTriggeredTransitions) on the pair's standing now:
 *  the state they set, null for none */
function triggered(view: MajorView, owner: number, other: number, state: string): string | null {
  const war = view.atWar(owner, other);
  if (war) return state === WAR_STATE ? null : WAR_STATE;
  if (state === WAR_STATE) return PEACE_STATE;
  const allied = view.allied(owner, other);
  if (allied) return state === ALLIED_STATE ? null : ALLIED_STATE;
  if (state === ALLIED_STATE) return FRIENDLY_STATE;
  const friends = view.declaredFriends(owner, other);
  if (friends) return state === FRIEND_STATE ? null : FRIEND_STATE;
  if (state === FRIEND_STATE) return FRIENDLY_STATE;
  const denounced = view.denouncing(owner, other) || view.denouncing(other, owner);
  if (denounced) return state === DENOUNCED_STATE ? null : DENOUNCED_STATE;
  if (state === DENOUNCED_STATE) return PEACE_STATE;
  return null;
}

/**
 * ONE OWNER'S DIPLOMATIC STATES at the opening of its diplomatic AI turn:
 * the start state for a major newly met, the triggers, then the
 * transitions on the owner's opinion of each major (`opinionOf`). The
 * allowed rows weigh the owner's desires (`inp.desireOf`): s(a) the desire
 * where the action can be done, else 0, an action whose desire the port does
 * not read counted and weighed 0. Returns what the rows' actions send.
 */
export function diploStateTurn(view: MajorView, mem: DiploStateMemory, owner: number, opinionOf: (other: number) => number,
                               gaps: DiploStateGaps, inp?: TransitionInputs): TransitionAction[] {
  const sent: TransitionAction[] = [];
  for (const other of view.majors()) {
    if (other === owner || view.metTurn(owner, other) === null) continue;
    const k = key(owner, other);
    let p = mem.pairs.get(k);
    if (!p) {
      p = { state: START_STATE, changed: -1 };
      mem.pairs.set(k, p);
    }
    const set = triggered(view, owner, other, p.state);
    if (set) {
      p.state = set;
      p.changed = view.turn;
    }
    if (p.changed === view.turn) continue;
    const opinion = opinionOf(other);
    const rows = OUT_OF.get(p.state) ?? [];
    const required = rows.find((t) => requiredBound(t, opinion) && check(view, owner, other, t, inp, gaps));
    if (required) {
      if (transitionAction(view, owner, other, required, sent, gaps)) p.state = required.to;
      continue;
    }
    const from = p.state;
    const here = aiActions(from);
    if (!inp) {
      for (const t of rows) if (allowedBand(t, opinion)) bump(gaps.allowed, `${t.from.replace('DIPLO_STATE_', '')}>${t.to.replace('DIPLO_STATE_', '')}`);
      continue;
    }
    const d = new Map<string, { desire: number; canDo: boolean }>();
    const of = (a: string): { desire: number; canDo: boolean } => {
      let v = d.get(a);
      if (!v) {
        const x = inp.desireOf(other, a);
        if (x.desire === null) bump(gaps.allowed, `desire ${a.replace('DIPLOACTION_', '')}`);
        d.set(a, (v = { desire: x.desire ?? 0, canDo: x.canDo }));
      }
      return v;
    };
    // s(a): the desire where the action can be done, else 0
    const sOf = (a: string): number => (of(a).canDo ? of(a).desire : 0);
    // the actions the owner desires now: the target must hold a row for each
    const desired = [...new Set(DIPLO_STATE_ACTIONS.filter((r) => r.state === from && !r.to).map((r) => r.action))]
      .filter((a) => of(a).desire > 0);
    let best: Transition | null = null;
    let bestWeight = 0;
    for (const t of rows) {
      if (!allowedBand(t, opinion) || !check(view, owner, other, t, inp, gaps)) continue;
      const there = aiActions(t.to);
      let w = 0;
      for (const a of there) if (!here.has(a)) w += Math.max(sOf(a), 0);
      for (const a of here) if (!there.has(a)) w -= Math.max(sOf(a), 0);
      const into = DIPLO_STATE_ACTIONS.filter((r) => r.to === t.to && r.state === from).map((r) => Math.max(sOf(r.action), 0));
      if (into.length) w += Math.max(...into);
      if (w <= 0 || w <= bestWeight) continue;
      if (!desired.every((a) => DIPLO_STATE_ACTIONS.some((r) => r.state === t.to && r.action === a))) continue;
      best = t;
      bestWeight = w;
    }
    if (best && transitionAction(view, owner, other, best, sent, gaps)) p.state = best.to;
  }
  return sent;
}

/**
 * THE RECEIVER'S ANSWER to a proposal (the Delegation's handler 0x237c60,
 * the Embassy's 0x238330; the AI's answer 0x653f60): an action its state
 * toward the sender (`state`, null before they meet) lists no row for is
 * refused; else the cost its evaluator gives the incoming action (0x66b490 —
 * the state's DiplomaticStateActions Cost less the gold the action pays the
 * receiver valued at its Gold weight, 0x671650 through 0x7a6690, less the
 * threat term T in mode 0 on the threat it reads in the sender) above 0
 * refuses, at or below 0 accepts. `gold` is the price the action pays
 * (0x527610: the row's Cost through the game speed).
 */
export function answerAction(view: MajorView, state: string | null, receiver: number, sender: number, action: string,
                             gold: number): boolean {
  if (state === null) return false;
  const row = DIPLO_STATE_ACTIONS.find((r) => r.state === state && r.action === action && !r.to);
  if (!row) return false;
  const cost = row.cost * FX - yieldValue(view, receiver, gold * FX, 'YIELD_GOLD') - threatTerm(view, receiver, sender, 0, true, 0);
  return cost <= 0;
}
