/**
 * THE RESEARCH AI (GameCore_XP2 AI/Research.cpp; `tools/civ6lab/dll_readings.md`
 * "H-1: the research AI"). Every party that researches technologies picks its
 * next one through it: the city-states inside the engine's turn
 * (`minorResearch`), the majors' AI through `researchAiChoice`.
 *
 * THE ANALYSIS (the "Tech Tree Analysis" job, 0x761170, one entry per
 * technology in table order): an owned row is spent; any other walks its
 * prerequisites three levels deep — the row itself, then the unowned
 * prerequisites of every row not yet researchable — summing each walked row's
 * turns left (its cost where the seat makes no Science), the NEXT step being
 * the last prerequisite the walk added. A row whose walk still has rows to add
 * after the third level is out of reach (turns -1, value 0); any other is
 * valued (`techValue`, 0x7b3e50). The PROPAGATION (0x7604e0) then adds to each
 * row in reach the values of its unowned prerequisites one and two levels up,
 * and takes a favored row's score 1.5 times.
 *
 * THE CHOICE (0x763020): the comparator's best row (0x75d530) — an unowned row
 * before an owned one, then the higher score, a leaf (no row requires it)
 * before a row others require where one of them is researchable now, the
 * first in table order on a tie; a completed technology's dependents (their
 * next step is the row just done) are passed over. Its next step becomes the
 * research and the row the GOAL. A best row out of reach, or whose next step
 * is not researchable, leaves a goal still unowned in place, else draws the
 * research uniformly over the researchable rows ("BT Research Choice").
 *
 * THE TURN (0x760980): with nothing researched the seat chooses; with a
 * research in hand it drops it only for a researchable row scoring
 * `RESEARCH_AI_TASK_BIAS` x 10 more than its goal (or its research, with no
 * goal). A completion (0x762d60) adds the prerequisites' values once more to
 * the turn's scores and chooses with the completed row passed over.
 *
 * Arithmetic is the DLL's 24.8 fixed point throughout (`aiValue.ts`).
 */
import { ERAS, TECHS, TECH_TABLE_ORDER } from '../data/techs';
import { BUILT_WONDERS } from '../data/builtWonders';
import { AI_UNLOCK_SHARE, AI_VALUE_HORIZON, PSEUDOYIELD_DISTRICT, PSEUDOYIELD_TECHNOLOGY, PSEUDOYIELD_WONDER } from '../data/aiValue';
import { RESEARCH_AI_EMBARK_ALL, RESEARCH_AI_FAVORED, RESEARCH_AI_TASK_BIAS } from '../data/aiResearch';
import { researchCost } from './economy';
import { randRange } from './rand';
import { leaderOf, seatOf } from './seats';
import { FX, fmul, fromLanding, fxConst, fxOf, pseudoYield, turnsAt } from './aiValue';
import { pseudoYieldWeights } from './aiWeights';
import type { GameState, ResearchState } from './types';

/** the seat's prerequisites of `id` in the install's order */
function prereqs(id: string): readonly string[] {
  return TECHS[id]?.prereqs ?? [];
}

/** Has the seat the row (a repeatable row is never spent) */
function owned(r: ResearchState, id: string): boolean {
  return !TECHS[id]?.repeatable && r.techs.includes(id);
}

/** 0x4c8c40: researchable now — unowned (or repeatable), every prerequisite owned */
function researchable(r: ResearchState, id: string): boolean {
  return !owned(r, id) && prereqs(id).every((p) => r.techs.includes(p));
}

/** the rows no row requires (the comparator's leaf flag, 0x761b70) */
const REQUIRED = new Set(Object.values(TECHS).flatMap((t) => t.prereqs));

export interface ResearchEntry {
  tech: string;
  /** the step the walk leads through: the row itself where researchable */
  next: string;
  /** turns to land it through its prerequisites; -1 spent or out of reach */
  turns: number;
  owned: boolean;
  leaf: boolean;
  /** the row's own value and its score after the propagation, raw */
  base: number;
  score: number;
}

/** 0x4ca000 / 0x8c4540: the turns a row needs at `rate` (raw Science a turn) —
 *  ceil of what is left over the rate, 1 where nothing is left; its cost in
 *  whole Science where the seat makes none */
function turnsLeft(state: GameState, seat: number, r: ResearchState, id: string, rate: number): number {
  const cost = researchCost(state, id, false, seat);
  const kept = id === r.tech ? r.techProgress : r.techRetained[id] ?? 0;
  const t = turnsAt(cost * FX - fxOf(kept + Math.max(0, r.techOverflow ?? 0)), rate);
  return t < 0 ? cost : t;
}

/** 0x761170's walk: the turns through the prerequisites and the next step;
 *  turns -1 where the third level still adds rows */
function walk(state: GameState, seat: number, r: ResearchState, id: string, rate: number): { turns: number; next: string } {
  let next = id;
  let turns = 0;
  let front = [id];
  for (let level = 0; level < 3 && front.length; level++) {
    const added: string[] = [];
    for (const e of front) {
      turns += turnsLeft(state, seat, r, e, rate);
      if (researchable(r, e)) continue;
      for (const p of prereqs(e)) {
        if (r.techs.includes(p) || added.includes(p)) continue;
        added.push(p);
        // the research in hand is never taken as the next step
        if (p !== r.tech) next = p;
      }
    }
    front = added;
  }
  return front.length ? { turns: -1, next } : { turns: Math.max(0, turns), next };
}

/**
 * 0x7b3e50, THE VALUE of landing `id` in `turns` turns: the technology's own
 * pseudo-yield (PSEUDOYIELD_TECHNOLOGY; EmbarkAll adds 5; a row of an era
 * before the game's counts once per era between, plus one), and per
 * building it unlocks a share (a wonder's at PSEUDOYIELD_WONDER), per district
 * a share at PSEUDOYIELD_DISTRICT — each a yield a turn from landing to the
 * horizon, each pseudo-yield at the seat's weight `pw` (`aiWeights.ts`).
 * Past the horizon -9999.
 */
export function techValue(state: GameState, id: string, turns: number, pw: ReadonlyMap<string, number>): number {
  if (turns > AI_VALUE_HORIZON) return fxConst(-9999);
  const def = TECHS[id];
  const w = (p: string): number => pw.get(p) ?? 0;
  let own = pseudoYield(PSEUDOYIELD_TECHNOLOGY, FX, w('PSEUDOYIELD_TECHNOLOGY'));
  if (def.embarkAll) own += fxConst(RESEARCH_AI_EMBARK_ALL);
  const era = ERAS.indexOf(def.era);
  const game = state.gameEra ?? 0;
  if (era < game) own = fmul(own, (game - era + 1) * FX);
  const share = fxConst(AI_UNLOCK_SHARE);
  const n = techUnlocks(id);
  return fromLanding(own, turns) + n.buildings * fromLanding(share, turns)
    + n.districts * fromLanding(pseudoYield(PSEUDOYIELD_DISTRICT, share, w('PSEUDOYIELD_DISTRICT')), turns)
    + n.wonders * fromLanding(pseudoYield(PSEUDOYIELD_WONDER, share, w('PSEUDOYIELD_WONDER')), turns);
}

/** what a technology unlocks that its value counts: buildings, districts,
 *  wonders */
export function techUnlocks(id: string): { buildings: number; districts: number; wonders: number } {
  return UNLOCKS.get(id)!;
}

const UNLOCKS = new Map(Object.values(TECHS).map((t) => [t.id, {
  buildings: t.effects.filter((e) => e.kind === 'unlockBuilding').length,
  districts: t.effects.filter((e) => e.kind === 'unlockDistrict').length,
  wonders: Object.values(BUILT_WONDERS).filter((w) => w.requiresTech === t.id).length,
}]));

/** the unowned prerequisites one and two levels up (0x7604e0's walk), each
 *  level's rows once */
function upstream(r: ResearchState, id: string): string[] {
  const out: string[] = [];
  let front = [id];
  for (let level = 0; level < 2; level++) {
    const added: string[] = [];
    for (const e of front) {
      for (const p of prereqs(e)) {
        if (r.techs.includes(p) || added.includes(p)) continue;
        added.push(p);
      }
    }
    out.push(...added);
    front = added;
  }
  return out;
}

/** 0x7604e0: a row in reach adds its unowned prerequisites' own values (a
 *  negative one adds nothing), a favored row then taken 1.5 times */
function propagate(r: ResearchState, entries: ResearchEntry[], favored: ReadonlySet<string>): void {
  const byId = new Map(entries.map((e) => [e.tech, e]));
  for (const e of entries) {
    if (e.turns < 0) continue;
    for (const p of upstream(r, e.tech)) e.score += Math.max(0, byId.get(p)?.base ?? 0);
    if (favored.has(e.tech)) e.score = fmul(e.score, fxConst(1.5));
  }
}

/** the seat's research record */
function researchOf(state: GameState, seat: number): ResearchState {
  return seatOf(state, seat)!.research;
}

/** THE ANALYSIS: every technology's entry, in table order, scored and
 *  propagated; `science` is the seat's Science a turn */
export function researchAnalysis(state: GameState, seat: number, science: number): ResearchEntry[] {
  const r = researchOf(state, seat);
  const rate = fxOf(science);
  const pw = pseudoYieldWeights(state, seat);
  const entries: ResearchEntry[] = TECH_TABLE_ORDER.filter((id) => TECHS[id]).map((id) => {
    const leaf = !REQUIRED.has(id);
    if (owned(r, id)) return { tech: id, next: id, turns: -1, owned: true, leaf, base: 0, score: 0 };
    const { turns, next } = walk(state, seat, r, id, rate);
    const base = turns < 0 ? 0 : techValue(state, id, turns, pw);
    return { tech: id, next, turns, owned: false, leaf, base, score: base };
  });
  const leader = leaderOf(state, seat);
  propagate(r, entries, new Set(leader ? RESEARCH_AI_FAVORED[leader] ?? [] : []));
  return entries;
}

/** 0x75d530: the comparator's best entry, the rows whose next step is `key`
 *  passed over */
function best(entries: readonly ResearchEntry[], key: string | null): ResearchEntry | undefined {
  let b = entries[0];
  for (const c of entries.slice(1)) {
    let take: boolean;
    if (b.next === c.next) {
      if (b.turns * c.turns <= 0) {
        take = b.turns < c.turns;
        if (take) b = c;
        continue;
      }
      take = general(b, c);
    } else if (b.next === key) {
      b = c;
      continue;
    } else if (c.next === key) {
      continue;
    } else {
      take = general(b, c);
    }
    if (take) b = c;
  }
  return b;
}

/** the comparator's general rule: unowned before owned; a leaf before a
 *  required row where the other is researchable now; the higher score */
function general(b: ResearchEntry, c: ResearchEntry): boolean {
  if (b.owned !== c.owned) return b.owned;
  const bDirect = b.next === b.tech;
  const cDirect = c.next === c.tech;
  if (b.leaf && !c.leaf && bDirect && !cDirect) return false;
  if (!b.leaf && c.leaf && cDirect && !bDirect) return true;
  return b.score < c.score;
}

/** the random pick's draw over `n` rows: an index, or -1 for no pick */
export type ResearchDraw = (n: number) => number;

/** the game's draw for the random pick ("BT Research Choice", 0x763020) */
export function researchDraw(state: GameState): ResearchDraw {
  return (n) => randRange(state, n, 'BT Research Choice');
}

export interface ResearchChoice {
  /** the research to take */
  tech: string;
  /** the goal it leads to (null after a random pick) */
  goal: string | null;
}

/** 0x763020: THE CHOICE over the turn's entries; null leaves the research
 *  and the goal as they are */
export function researchChoice(state: GameState, seat: number, entries: readonly ResearchEntry[], key: string | null, draw: ResearchDraw): ResearchChoice | null {
  const r = researchOf(state, seat);
  const b = best(entries, key);
  if (b && b.turns > 0 && researchable(r, b.next)) return { tech: b.next, goal: b.tech };
  if (r.goal && !owned(r, r.goal)) return null;
  const open = TECH_TABLE_ORDER.filter((id) => TECHS[id] && !r.techs.includes(id) && researchable(r, id));
  if (!open.length) return null;
  const k = draw(open.length);
  return k >= 0 ? { tech: open[k], goal: null } : null;
}

/** 0x760980: THE TURN'S CHOICE — with nothing in hand the choice; with a
 *  research in hand a researchable row scoring the task bias more than the
 *  goal (or the research) replaces it */
export function researchTurnChoice(state: GameState, seat: number, entries: readonly ResearchEntry[], draw: ResearchDraw): ResearchChoice | null {
  const r = researchOf(state, seat);
  if (!r.tech) return researchChoice(state, seat, entries, null, draw);
  const byId = new Map(entries.map((e) => [e.tech, e]));
  const ref = byId.get(r.goal ?? r.tech)?.score ?? 0;
  let b = entries[0];
  for (const c of entries.slice(1)) if (b.score < c.score && !c.owned) b = c;
  if (!b || b.next === r.tech) return null;
  if (b.score > ref + RESEARCH_AI_TASK_BIAS * 10 * FX && researchable(r, b.next) && b.tech === b.next) {
    return researchChoice(state, seat, entries, null, draw);
  }
  return null;
}

/** 0x762d60: A COMPLETION — the turn's entries add their prerequisites'
 *  values once more, and the choice passes the completed row over */
export function researchCompletionChoice(state: GameState, seat: number, entries: ResearchEntry[], done: string, draw: ResearchDraw): ResearchChoice | null {
  const r = researchOf(state, seat);
  const byId = new Map(entries.map((e) => [e.tech, e]));
  for (const e of entries) {
    if (e.turns < 0) continue;
    for (const p of upstream(r, e.tech)) e.score += Math.max(0, byId.get(p)?.base ?? 0);
  }
  return researchChoice(state, seat, entries, done, draw);
}

/** THE MAJORS' AI's research: the choice its turn makes over a fresh analysis
 *  (`science` its Science a turn), or after `done` completed */
export function researchAiChoice(state: GameState, seat: number, science: number, done: string | null, draw: ResearchDraw): ResearchChoice | null {
  const entries = researchAnalysis(state, seat, science);
  return done ? researchCompletionChoice(state, seat, entries, done, draw) : researchTurnChoice(state, seat, entries, draw);
}
