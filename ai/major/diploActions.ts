/**
 * THE MAJORS' DIPLOMATIC ACTIONS AS THE GAME'S AI SENDS THEM
 * (AI::Diplomatic, DiplomaticActions.cpp, AI::Economic;
 * `tools/civ6lab/dll_readings.md` "C-97: the majors' diplomatic actions",
 * "C-97: the sender's pick, the savings, the threat and the focus" and
 * "C-97: the other actions' desires, the trust and the transitions").
 *
 * The sender's savings are the Economic AI's (`cpu/core/aiEconomic.ts`).
 *
 * THE THREAT (+0x6480, 0x647f10 each diplomatic AI turn): per met major, the
 * sum of (a) its team's best victory progress above 0.4, x 100, (b) 0.05 x
 * its military strength (0x4bd0d0) above the owner's where that lead passes
 * 100, (c) 0.2 x the military AI's count +0x698 above the owner's strength
 * where that lead passes 100. The same turn counts the majors the owner has
 * met, itself among them (+0x6420). THE RANK (0x650550): 1 + the players
 * threatening more.
 *
 * THE THREAT TERM T (0x671b80; the mode 0 / 1 / 2, the sign flag): 0 where
 * the preference rules it out (a favoured action without the flag, a
 * disfavoured one with it) or the threat is 0; else, L = ceil(count x 0.25)
 * / ceil(count x 0.5) / count, 0 where the rank n passes L, else 10 / 20 /
 * 40 x (L - n + 1) / L; negated without the flag.
 *
 * THE TRUST (+0x6560): +2 toward the other party of each deal the owner
 * strikes (the deal signal's handler 0x6535f0). THE TRUST TERM U (0x671ef0;
 * the mode, the sign flag): 0 where the preference rules it out (with the
 * flag matching the trust's sign, a disfavoured action; else a favoured
 * one); else the trust x 0.02 x 10 / 20 / 40, held within the weight,
 * negated without the flag.
 *
 * THE FOCUS (+0x6780, 0x647bb0 at the AI turn's close): the met major, not at
 * war and not turned away, whose own AI values the owner highest above 0 —
 * the major's opinion of the owner.
 *
 * THE PICK (0x64ba90): per met major not acted on this turn, the actions its
 * state allows the AI (DiplomaticStateActions AiAllowed, no transition); a
 * disfavoured one is skipped, a favoured one beats the rest, else the
 * highest desire above 0 that can be done; at most one action per major per
 * turn. The sender's half of a mission: the can-do (0x672f90 / 0x6730e0) —
 * the savings slot 2 at half the price, the game's CanDoAction, the last
 * action toward the major (0x3e6d20) + AI_TURNS_BETWEEN_PEACE_OFFERS below
 * the turn — and the perform (0x674960 / 0x674a10): the last action's turn,
 * the price spent from slot 1; a refusal (0x6543a0) returns it to slot 2.
 * The not-ready flag (+0x6390) the pick asks is set only by an answer of
 * 0xc, which no AI receiver gives (0x653f60 answers 1 or 2): between AI
 * majors it stays clear.
 *
 * The state worth's +0x6320[p][a] (0x6504f0) is written for Propose Trade
 * alone (0x653840 / 0x653b80: AI_TRADE_VALUE_FOR_AID on the emergencies'
 * signals): the other actions read 0.
 *
 * What the port does not read is left out of the pick and counted
 * (`DiploActionGaps`): the actions whose desire it does not read, a
 * favoured action's desire and cost (twice the reading on runs/h1_duelv1121
 * Qin's Gossip rows; the doubling instruction unread), the threat's (a) and
 * (c), the war value (0x7b7760) and the military AI's war operation the
 * war's can-do asks.
 */
import {
  DIPLO_PREFERENCE_AGENDA_TRAITS, DIPLO_PREFERENCE_LEADER_TRAITS, DIPLO_PREFERENCE_LISTS,
  DIPLO_PREFERENCES_BY_STRATEGY, DIPLO_PREFERENCES_BY_TRAIT, DIPLO_STATE_ACTIONS,
} from './diplomacyTables';
import type { MajorView } from './view';
import { FX, yieldValue } from '../../cpu/core/aiValue';
import { SLOT_PLOTS, SLOT_UNITS, canAfford, newEconomicMemory, spend, type EconomicMemory } from '../../cpu/core/aiEconomic';
import type { SeatActionRecord } from '../../cpu/core/types';

export const ACTION_DELEGATION = 'DIPLOACTION_DIPLOMATIC_DELEGATION';
export const ACTION_EMBASSY = 'DIPLOACTION_RESIDENT_EMBASSY';
export const ACTION_OPEN_BORDERS = 'DIPLOACTION_OPEN_BORDERS';
export const ACTION_DEMAND_TRIBUTE = 'DIPLOACTION_DEMAND_TRIBUTE';
export const ACTION_FRIENDSHIP = 'DIPLOACTION_DECLARE_FRIENDSHIP';
export const ACTION_ALLIANCE = 'DIPLOACTION_ALLIANCE';
export const ACTION_DENOUNCE = 'DIPLOACTION_DENOUNCE';
export const ACTION_SURPRISE_WAR = 'DIPLOACTION_DECLARE_SURPRISE_WAR';

/** GlobalParameters AI_TURNS_BETWEEN_PEACE_OFFERS (+0x20) */
export const AI_TURNS_BETWEEN_OFFERS = 3;
/** GlobalParameters AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS (+0x1c) */
export const AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS = 5;
/** the trust a struck deal adds (0x6535f0: 0x200) */
const TRUST_PER_DEAL = 2 * FX;
/** the desire a disfavoured war takes (@f04cb0) */
const WAR_DISFAVOURED = -9999 * FX;
/** one major's economic and diplomatic memory, raw 24.8 */
export interface SenderMemory extends EconomicMemory {
  /** the turn of the last action sent to each major (0x3e6d20) */
  lastAction: Map<number, number>;
  /** the focus the last AI turn's close set (0x647bb0), null for none */
  focus: number | null;
  /** the trust toward each major (+0x6560) */
  trust: Map<number, number>;
}

export interface DiploActionMemory {
  seats: Map<number, SenderMemory>;
}

/** what the pick could not weigh, counted per evaluation by name */
export interface DiploActionGaps {
  unread: Map<string, number>;
}

export const newDiploActionMemory = (): DiploActionMemory => ({ seats: new Map() });
export const newDiploActionGaps = (): DiploActionGaps => ({ unread: new Map() });
const bump = (g: DiploActionGaps, k: string) => g.unread.set(k, (g.unread.get(k) ?? 0) + 1);

export function senderOf(mem: DiploActionMemory, seat: number): SenderMemory {
  let s = mem.seats.get(seat);
  if (!s) {
    s = { ...newEconomicMemory(), lastAction: new Map(), focus: null, trust: new Map() };
    mem.seats.set(seat, s);
  }
  return s;
}

/** THE DEAL SIGNAL's trust (0x6535f0): each party of a struck deal trusts
 *  the other 2 more */
export function dealStruck(mem: DiploActionMemory, a: number, b: number): void {
  for (const [x, y] of [[a, b], [b, a]]) {
    const s = senderOf(mem, x);
    s.trust.set(y, (s.trust.get(y) ?? 0) + TRUST_PER_DEAL);
  }
}

/** THE THREAT (0x647f10) the owner reads in `other`, raw 24.8: the military
 *  term (b) alone — the victory progress (a) and the military AI's count (c)
 *  are counted where they could stand */
export function threat(view: MajorView, owner: number, other: number): number {
  if (other === owner) return 0;
  const lead = view.militaryStrength(other) - view.militaryStrength(owner);
  return lead > 100 ? Math.trunc(lead * 0.05 * FX) : 0;
}

/** the majors the owner has met, itself among them (+0x6420) */
function metCount(view: MajorView, owner: number): number {
  return 1 + view.majors().filter((p) => p !== owner && view.metTurn(owner, p) !== null).length;
}

/** THE RANK (0x650550) of `p` by the threat the owner reads: 1 + the met
 *  majors threatening more */
function threatRank(view: MajorView, owner: number, p: number): number {
  const t = threat(view, owner, p);
  return 1 + view.majors().filter((q) => q !== owner && view.metTurn(owner, q) !== null && threat(view, owner, q) > t).length;
}

const WEIGHT = [10 * FX, 20 * FX, 40 * FX];

/** THE THREAT TERM T (0x671b80) of an action whose preference is `pref`, in
 *  `mode` (0 / 1 / 2), negated without `flag` */
export function threatTerm(view: MajorView, owner: number, other: number, mode: number, flag: boolean, pref: number): number {
  if ((pref > 0 && !flag) || (pref < 0 && flag)) return 0;
  if (threat(view, owner, other) === 0) return 0;
  const n = threatRank(view, owner, other);
  const count = metCount(view, owner);
  const l = mode === 0 ? Math.ceil(count * 0.25) : mode === 1 ? Math.ceil(count * 0.5) : count;
  if (n > l) return 0;
  const t = Math.trunc(((l - n + 1) * WEIGHT[mode]) / l);
  return flag ? t : -t;
}

/** THE TRUST TERM U (0x671ef0) of an action whose preference is `pref`, in
 *  `mode`, negated without `flag` */
export function trustTerm(mem: DiploActionMemory, owner: number, other: number, mode: number, flag: boolean,
                          pref: number): number {
  const v = senderOf(mem, owner).trust.get(other) ?? 0;
  if ((flag === (v > 0)) ? pref < 0 : pref > 0) return 0;
  const w = WEIGHT[mode];
  // 0.02 in 24.8 is 5
  const x = Math.min(Math.max((((v * 5) >> 8) * w) >> 8, -w), w);
  return flag ? x : -x;
}

/** the DiplomaticActions preference of an action for a seat: 1 favoured, -1
 *  disfavoured, 0 neither (the lists of its leader's traits, its agendas'
 *  traits and the strategies it follows) */
export function preference(view: MajorView, seat: number, agendas: readonly string[], action: string): number {
  const traits = [...(DIPLO_PREFERENCE_LEADER_TRAITS[view.leaderType(seat) ?? ''] ?? []),
    ...agendas.flatMap((a) => DIPLO_PREFERENCE_AGENDA_TRAITS[a] ?? [])];
  const lists = [...traits.flatMap((t) => DIPLO_PREFERENCES_BY_TRAIT[t] ?? []),
    ...[...view.strategies(seat)].flatMap((s) => DIPLO_PREFERENCES_BY_STRATEGY[s] ?? [])];
  let p = 0;
  for (const l of lists) for (const it of DIPLO_PREFERENCE_LISTS[l] ?? []) if (it.action === action) p = it.favored ? 1 : -1;
  return p;
}

/** the gold price of an action (0x527610) */
function price(action: string, delegation: number, embassy: number): number {
  return action === ACTION_EMBASSY ? embassy : action === ACTION_DELEGATION ? delegation : 0;
}

/** what a desire reads beside the view and the memory */
export interface DesireInputs {
  state: string;
  /** the owner's preference of the action */
  pref: number;
  /** the focus the owner holds (0x657d90: the +0x6780 player) */
  focus: number | null;
  /** the missions' prices (0x527610) */
  delegationPrice: number;
  embassyPrice: number;
  /** the least plot distance between the other's cities the owner knows and
   *  the owner's own, null for none */
  distance: number | null;
  /** the other near a victory (+0x64f0, 0x647f10: a victory's progress at
   *  its CriticalPercentage), null where the port does not read it */
  nearVictory: boolean | null;
  /** a war operation of the owner's military AI against the other ready to
   *  strike (0x723db0) */
  warOperation: boolean;
}

/** STATE WORTH / COST (0x6718a0 / 0x671650): the state's row for the action
 *  (none: 0) less the price valued at the owner's Gold weight; a favoured
 *  action drops the gold and keeps Worth at 0 or more */
function stateRow(view: MajorView, owner: number, action: string, inp: DesireInputs, col: 'worth' | 'cost'): number {
  const row = DIPLO_STATE_ACTIONS.find((r) => r.state === inp.state && r.action === action && !r.to);
  const base = row ? row[col] : 0;
  if (inp.pref > 0) return (col === 'worth' ? Math.max(base, 0) : base) * FX;
  const g = price(action, inp.delegationPrice, inp.embassyPrice);
  return base * FX - (g > 0 ? yieldValue(view, owner, g * FX, 'YIELD_GOLD') : 0);
}

/** the majors the owner is at war with (0x3dfae0) */
const warsOf = (view: MajorView, owner: number): number =>
  view.majors().filter((p) => p !== owner && view.atWar(owner, p)).length;

/** the alliance's rank term (0x66d810 / 0x66b990): 5 x (count - the least
 *  of the two ranks + 1) */
function allianceRankTerm(view: MajorView, owner: number, other: number): number {
  return (metCount(view, owner) - Math.min(threatRank(view, owner, other), threatRank(view, owner, owner)) + 1) * 5 * FX;
}

/**
 * THE DESIRE of an action toward `other`, raw 24.8, null where the port does
 * not read the action's functor or an input it asks:
 * - the missions (0x66cd40 / 0x66cf30): Worth + T(0, +) + 20 at the focus;
 * - Open Borders (0x66dda0): Worth + T(1, -) + whole((40 - d) x 0.5) + 10 at
 *   the focus;
 * - Demand Tribute (0x66c800): Worth - 10 at the focus + (20 - T(1, +))
 *   where the owner's strength passes twice the other's or its era is later;
 * - Declare Friendship (0x66c160): 0 where the other is near a victory; else
 *   Worth + T(1, -) + U(1, +) + 20 at the focus + 20 a war the owner wages;
 * - the Alliance (0x66d810): 0 where the other is near a victory; else
 *   Worth + U(1, +) + 5 x (count - the lesser rank of the two + 1);
 * - the Surprise War (0x66e950): -1 for a full civ already at war with two;
 *   -9999 disfavoured; else the war value (0x7b7760), at least 5 where the
 *   other's rank is within ceil(count x 0.25);
 * - Denounce and the promises (0x66d800): 0.
 */
export function desire(view: MajorView, mem: DiploActionMemory, owner: number, other: number, action: string,
                       inp: DesireInputs, gaps: DiploActionGaps): number | null {
  const atFocus = inp.focus === other;
  if (inp.pref > 0) bump(gaps, `${action} favoured: the doubled desire`);
  const worth = (): number => stateRow(view, owner, action, inp, 'worth');
  if (action === ACTION_DELEGATION || action === ACTION_EMBASSY) {
    return worth() + threatTerm(view, owner, other, 0, true, inp.pref) + (atFocus ? 20 * FX : 0);
  }
  if (action === ACTION_OPEN_BORDERS) {
    if (inp.distance === null) return null;
    const d = Math.min(Math.max(inp.distance, 1), 39);
    return worth() + threatTerm(view, owner, other, 1, false, inp.pref) + Math.floor((40 - d) * 0.5) * FX + (atFocus ? 10 * FX : 0);
  }
  if (action === ACTION_DEMAND_TRIBUTE) {
    const stronger = view.militaryStrength(owner) > 2 * view.militaryStrength(other) || view.playerEra(owner) > view.playerEra(other);
    return worth() - (atFocus ? 10 * FX : 0) + (stronger ? 20 * FX - threatTerm(view, owner, other, 1, true, inp.pref) : 0);
  }
  if (action === ACTION_FRIENDSHIP || action === ACTION_ALLIANCE) {
    if (inp.nearVictory === null) {
      bump(gaps, 'the near-victory flag +0x64f0');
      return null;
    }
    if (inp.nearVictory) return 0;
    if (action === ACTION_ALLIANCE) return worth() + trustTerm(mem, owner, other, 1, true, inp.pref) + allianceRankTerm(view, owner, other);
    return worth() + threatTerm(view, owner, other, 1, false, inp.pref) + trustTerm(mem, owner, other, 1, true, inp.pref)
      + (atFocus ? 20 * FX : 0) + warsOf(view, owner) * 20 * FX;
  }
  if (action === ACTION_SURPRISE_WAR) {
    if (warsOf(view, owner) > 1) return -FX;
    if (inp.pref < 0) return WAR_DISFAVOURED;
    bump(gaps, 'the war value 0x7b7760');
    return null;
  }
  if (action === ACTION_DENOUNCE || action.startsWith('DIPLOACTION_KEEP_PROMISE_')) return 0;
  bump(gaps, `${action}: its desire`);
  return null;
}

/**
 * THE COST the owner's evaluator gives an action toward `other` (0x66b490's
 * functors), raw 24.8, null where the port does not read it:
 * - the missions (0x66b590): Cost - T(0, +);
 * - Open Borders (0x66bb50): Cost - T(1, -) - U(0, +);
 * - Demand Tribute (0x66b220): Cost - T(1, +);
 * - Declare Friendship (0x66ae10): 9999 where the other is near a victory;
 *   else Cost - T(1, -) - U(1, +) - 20 at the focus + 30 with a war
 *   operation ready against the other - 5 a war the owner wages;
 * - the Alliance (0x66b990): 9999 near a victory; else Cost - U(1, +) - the
 *   rank term.
 */
export function actionCost(view: MajorView, mem: DiploActionMemory, owner: number, other: number, action: string,
                           inp: DesireInputs): number | null {
  const cost = (): number => stateRow(view, owner, action, inp, 'cost');
  if (action === ACTION_DELEGATION || action === ACTION_EMBASSY) return cost() - threatTerm(view, owner, other, 0, true, inp.pref);
  if (action === ACTION_OPEN_BORDERS) {
    return cost() - threatTerm(view, owner, other, 1, false, inp.pref) - trustTerm(mem, owner, other, 0, true, inp.pref);
  }
  if (action === ACTION_DEMAND_TRIBUTE) return cost() - threatTerm(view, owner, other, 1, true, inp.pref);
  if (action === ACTION_FRIENDSHIP || action === ACTION_ALLIANCE) {
    if (inp.nearVictory === null) return null;
    if (inp.nearVictory) return 9999 * FX;
    if (action === ACTION_ALLIANCE) return cost() - trustTerm(mem, owner, other, 1, true, inp.pref) - allianceRankTerm(view, owner, other);
    return cost() - threatTerm(view, owner, other, 1, false, inp.pref) - trustTerm(mem, owner, other, 1, true, inp.pref)
      - (inp.focus === other ? 20 * FX : 0) + (inp.warOperation ? 30 * FX : 0) - warsOf(view, owner) * 5 * FX;
  }
  return null;
}

/** the actions the owner's state toward a major lets the AI take */
export const aiActionsIn = (state: string): string[] =>
  DIPLO_STATE_ACTIONS.filter((r) => r.state === state && r.aiAllowed && !r.to).map((r) => r.action);

/** one action the pick takes */
export interface PickedAction { target: number; action: string; desire: number }

/** what the pick reads of each major beside the preference and the focus */
export type PickInputs = Omit<DesireInputs, 'pref' | 'focus'>;

/**
 * THE PICK (0x64ba90) of one owner, over each major `inputs` names (the
 * majors it has met, its state toward each): the actions whose desire the
 * port reads, each where its can-do passes. A best action the engine
 * cannot send (Open Borders, Demand Tribute) still takes the major's turn.
 */
export function pickActions(view: MajorView, mem: DiploActionMemory, owner: number, inputs: ReadonlyMap<number, PickInputs>,
                            agendas: readonly string[], gaps: DiploActionGaps): PickedAction[] {
  const s = senderOf(mem, owner);
  const out: PickedAction[] = [];
  for (const [other, inp] of inputs) {
    let best: PickedAction | null = null;
    let bestFavoured = false;
    for (const action of aiActionsIn(inp.state)) {
      const pref = preference(view, owner, agendas, action);
      if (pref < 0) continue;
      const d = desire(view, mem, owner, other, action, { ...inp, pref, focus: s.focus }, gaps);
      if (d === null || d <= 0) continue;
      if (!canDo(view, s, owner, other, action, inp, gaps)) continue;
      const favoured = pref > 0;
      if (best && (bestFavoured && !favoured)) continue;
      if (best && bestFavoured === favoured && d <= best.desire) continue;
      best = { target: other, action, desire: d };
      bestFavoured = favoured;
    }
    if (best) out.push(best);
  }
  return out;
}

/** the can-do of an action: the missions' (0x672f90 / 0x6730e0); the
 *  Surprise War's (0x673800) the game's CanDeclareWarOn and the military
 *  AI's war operation ready against the other; Open Borders the game's
 *  CanDoAction; Demand Tribute stands on its desire */
function canDo(view: MajorView, s: SenderMemory, owner: number, other: number, action: string, inp: PickInputs,
               gaps: DiploActionGaps): boolean {
  if (action === ACTION_SURPRISE_WAR) {
    if (!view.warOpen(owner, other, false)) return false;
    if (!inp.warOperation) bump(gaps, 'the war operation 0x723db0');
    return inp.warOperation;
  }
  if (action !== ACTION_DELEGATION && action !== ACTION_EMBASSY) {
    return action === ACTION_DEMAND_TRIBUTE || (action === ACTION_OPEN_BORDERS && view.actionOpen(owner, other, action) === true);
  }
  const p = price(action, inp.delegationPrice, inp.embassyPrice) * FX;
  if (!canAfford(s, p, SLOT_PLOTS, 0.5)) return false;
  if (view.missionOpen(owner, other) !== action) return false;
  const last = s.lastAction.get(other);
  return last === undefined || last + AI_TURNS_BETWEEN_OFFERS < view.turn;
}

/** the turns the friendship's and the alliance's offers keep apart toward a
 *  full civ (CanDeclareFriendship 0x67c740, CanOfferAlliance 0x67ca30): the
 *  last action + AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS at or below the turn */
export function friendshipSpaced(view: MajorView, mem: DiploActionMemory, owner: number, other: number): boolean {
  const last = senderOf(mem, owner).lastAction.get(other);
  return last === undefined || last + AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS <= view.turn;
}

/** THE PERFORM of a mission (0x674960 / 0x674a10): the last action's turn,
 *  the price spent from the UNITS slot; the seat's offer on the table */
export function performAction(view: MajorView, mem: DiploActionMemory, owner: number, picked: PickedAction,
                              delegationPrice: number, embassyPrice: number, missionItem: number): Pick<SeatActionRecord, 'offer'> {
  const s = senderOf(mem, owner);
  s.lastAction.set(picked.target, view.turn);
  spend(s, price(picked.action, delegationPrice, embassyPrice) * FX, SLOT_UNITS);
  return { offer: [picked.target, [[missionItem, 0, 0]], []] };
}

/** THE FRIENDSHIP'S PERFORM (OnDeclareFriendship 0x681b60): the last
 *  action's turn; the seat's offer of the friendship on the table */
export function performFriendship(view: MajorView, mem: DiploActionMemory, owner: number, other: number,
                                  friendshipItem: number): Pick<SeatActionRecord, 'offer'> {
  senderOf(mem, owner).lastAction.set(other, view.turn);
  return { offer: [other, [[friendshipItem, 0, 0]], []] };
}

/** THE SENDER RECORDS THE ANSWER (0x6543a0): a refusal returns the price to
 *  the PLOTS slot */
export function recordAnswer(mem: DiploActionMemory, owner: number, action: string, accepted: boolean,
                             delegationPrice: number, embassyPrice: number): void {
  if (accepted) return;
  const g = action === ACTION_EMBASSY ? embassyPrice : action === ACTION_DELEGATION ? delegationPrice : 0;
  spend(senderOf(mem, owner), -g * FX, SLOT_PLOTS);
}

/** THE FOCUS at the AI turn's close (0x647bb0): the met major not at war
 *  whose value of the owner (`valueOf`, its opinion of the owner) is highest
 *  above 0, null for none */
export function focusTurn(view: MajorView, mem: DiploActionMemory, owner: number, valueOf: (other: number) => number): void {
  let best: number | null = null;
  let bestValue = 0;
  for (const p of view.majors()) {
    if (p === owner || view.metTurn(owner, p) === null || view.atWar(owner, p)) continue;
    const v = valueOf(p);
    if (v > bestValue) {
      best = p;
      bestValue = v;
    }
  }
  senderOf(mem, owner).focus = best;
}
