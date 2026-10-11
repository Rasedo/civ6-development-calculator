/**
 * THE CIVICS AI (GameCore_XP2 AI/CultureAi.cpp; `tools/civ6lab/dll_readings.md`
 * "H-1: the civics AI"). Every party that studies civics picks its next one
 * through it: the city-states inside the engine's turn (`minorResearch`), the
 * majors' AI through `civicAiChoice`.
 *
 * THE ANALYSIS (the "Civic Tree Analysis" job, 0x621a20 on each entry, one
 * per civic in table order): an owned row is spent; any other walks its
 * prerequisites three levels deep as the research AI's does — the row
 * itself, then the unowned prerequisites of every row not yet researchable —
 * summing each walked row's turns left (its cost where the seat makes no
 * Culture), the NEXT step the last prerequisite the walk added that is not
 * the civic in hand. A row whose walk still has rows to add after the third
 * level is out of reach (turns -1, value 0); any other is valued
 * (`civicValue`, 0x7a9a10).
 *
 * THE PROPAGATION (0x61ee30, the turn's first step, a row in reach): its
 * score is its own value and its prerequisites' one and two levels up, each
 * a negative value counting nothing — owned prerequisites walked through at
 * no value — and a favored row's score taken 1.5 times.
 *
 * THE CHOICE (0x626600 with a key): the comparator's best row (0x6182e0) — an
 * unowned row before an owned one, a row whose next step is the key passed
 * over, the larger turns where their product is not positive, else the
 * higher score, the first in table order on a tie; its next step is taken
 * where it is researchable, else one draw "Random Civic Choice" over the
 * researchable rows in table order. The AI's turn (0x620110) chooses with no
 * key where nothing is in hand; a COMPLETION (the delegate 0x6293e0) chooses
 * with the completed civic as the key over the entries its last turn left.
 */
import { CIVICS, CIVIC_TABLE_ORDER } from '../data/civics';
import { ERAS } from '../data/techs';
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { AI_UNLOCK_SHARE, AI_VALUE_HORIZON, PSEUDOYIELD_CIVIC, PSEUDOYIELD_DISTRICT, PSEUDOYIELD_UNIT_COMBAT, PSEUDOYIELD_WONDER } from '../data/aiValue';
import { CIVIC_AI_FAVORED, CIVIC_AI_FORMATION_UNITS, CIVIC_AI_POLICY_FLOOR } from '../data/aiCivics';
import { AI_CIVIC_MODIFIERS } from '../data/aiTables';
import { FORMATION_CIVIC } from '../data/units';
import { researchCost } from './economy';
import { randRange } from './rand';
import { leaderOf, seatOf } from './seats';
import { AI_RATE, FX, fmul, fromLanding, fxConst, fxOf, pseudoYield, turnsAt, type AiValueView } from './aiValue';
import { modifiersValue } from './aiModifiers';
import { getModifiers } from './effects';
import { majorView } from './majorView';
import { pseudoYieldWeights, type AiWeightInputs } from './aiWeights';
import type { GameState, ResearchState } from './types';

export interface CivicEntry {
  civic: string;
  /** the step the walk leads through: the row itself where researchable */
  next: string;
  /** turns to land it through its prerequisites; -1 spent or out of reach */
  turns: number;
  owned: boolean;
  /** the row's own value and its score after the propagation, raw */
  base: number;
  score: number;
}

/** the row's prerequisites in the install's order */
function prereqs(id: string): readonly string[] {
  return CIVICS[id]?.prereqs ?? [];
}

/** Has the seat the row (a repeatable row is never spent) */
function owned(r: ResearchState, id: string): boolean {
  return !CIVICS[id]?.repeatable && r.civics.includes(id);
}

/** 0x3932d0: researchable now — unowned (or repeatable), every prerequisite owned */
function researchable(r: ResearchState, id: string): boolean {
  return !owned(r, id) && prereqs(id).every((p) => r.civics.includes(p));
}

/** 0x39c0e0: the turns a row needs at `rate` (raw Culture a turn) — what is
 *  left of its cost past the progress kept on it and the bank, over the
 *  rate; its cost in whole Culture where the seat makes none */
function turnsLeft(state: GameState, seat: number, r: ResearchState, id: string, rate: number): number {
  const cost = researchCost(state, id, true, seat);
  const kept = id === r.civic ? r.civicProgress : r.civicRetained[id] ?? 0;
  const t = turnsAt(cost * FX - fxOf(kept + (r.civicOverflow ?? 0)), rate);
  return t <= 0 ? cost : t;
}

/** 0x621a20's walk: the turns through the prerequisites and the next step;
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
        if (r.civics.includes(p) || added.includes(p)) continue;
        added.push(p);
        // the civic in hand is never taken as the next step
        if (p !== r.civic) next = p;
      }
    }
    front = added;
  }
  return front.length ? { turns: -1, next } : { turns: Math.max(0, turns), next };
}

/** what a civic unlocks that its value counts: the buildings and wonders
 *  whose PrereqCivic it is that no civilization's trait holds (each player's
 *  version of a building once), the districts */
export function civicUnlocks(id: string): { buildings: number; districts: number; wonders: number } {
  return UNLOCKS.get(id)!;
}

const UNLOCKS = new Map(Object.values(CIVICS).map((c) => {
  const b = AI_BUILDINGS.filter((x) => x.civic === `CIVIC_${c.id}` && !x.trait);
  return [c.id, {
    buildings: b.filter((x) => !x.wonder).length,
    districts: c.effects.filter((e) => e.kind === 'unlockDistrict').length,
    wonders: b.filter((x) => x.wonder).length,
  }];
}));

/**
 * 0x7a9a10, THE VALUE of landing `id` in `turns` turns for `seat`: the
 * civic's own pseudo-yield (PSEUDOYIELD_CIVIC) from landing to the horizon,
 * counted (game - era) times where its era is before the game's; per
 * building it unlocks a share, per wonder a share at PSEUDOYIELD_WONDER, per
 * district a share at PSEUDOYIELD_DISTRICT, each from landing to the
 * horizon; PSEUDOYIELD_UNIT_COMBAT of 100 per land formation the civic
 * unlocks for the seat (its Corps' and its Armies' civic, the units manager's
 * +0xaa8 / +0xb08 through 0x4f2ac0); its policies at least
 * `CIVIC_AI_POLICY_FLOOR` (the best new card's score over the weakest
 * slotted one's is not read: the floor); its modifiers (CivicModifiers)
 * analysed from landing to the horizon (0x7a4b20) on `view` (the
 * state's `majorView` where none is given). The
 * governments it unlocks (max(v - v(current), v / 2) of the government
 * values) are not read: none. At the horizon or past it -9999.
 */
export function civicValue(state: GameState, seat: number, id: string, turns: number, pw: ReadonlyMap<string, number>,
  view?: AiValueView): number {
  if (turns >= AI_VALUE_HORIZON) return fxConst(-9999);
  const def = CIVICS[id];
  const w = (p: string): number => pw.get(p) ?? 0;
  let v = fromLanding(pseudoYield(PSEUDOYIELD_CIVIC, FX, w('PSEUDOYIELD_CIVIC')), turns);
  const era = ERAS.indexOf(def.era);
  const game = state.gameEra ?? 0;
  if (era < game) v = fmul(v, (game - era) * FX);
  const share = fxConst(AI_UNLOCK_SHARE);
  const n = civicUnlocks(id);
  const formations = [1, 2].filter((tier) => formationCivic(state, seat, tier) === id).length;
  const mods = AI_CIVIC_MODIFIERS[`CIVIC_${id}`] ?? [];
  return v + n.buildings * fromLanding(share, turns)
    + n.wonders * fromLanding(pseudoYield(PSEUDOYIELD_WONDER, share, w('PSEUDOYIELD_WONDER')), turns)
    + n.districts * fromLanding(pseudoYield(PSEUDOYIELD_DISTRICT, share, w('PSEUDOYIELD_DISTRICT')), turns)
    + formations * pseudoYield(PSEUDOYIELD_UNIT_COMBAT, fxConst(CIVIC_AI_FORMATION_UNITS), w('PSEUDOYIELD_UNIT_COMBAT'))
    + fxConst(CIVIC_AI_POLICY_FLOOR)
    + (mods.length ? modifiersValue({ view: view ?? majorView(state), seat, start: turns, horizon: AI_VALUE_HORIZON, rate: AI_RATE }, mods) : 0);
}

/** the civic a land formation of `tier` (1 Corps, 2 Army) needs for the
 *  seat: its own (EFFECT_ADJUST_CORPS_ARMY_PREREQ), else the game's */
function formationCivic(state: GameState, seat: number, tier: number): string {
  const row = getModifiers(state, seat).formations.find((r) => r.tier === tier && !r.naval && r.civic !== undefined);
  return row?.civic ?? FORMATION_CIVIC[tier];
}

/** the row and its prerequisites one and two levels up (0x61ee30's walk),
 *  each level's rows once */
function lineage(id: string): string[] {
  const out = [id];
  let front = [id];
  for (let level = 0; level < 2; level++) {
    const added: string[] = [];
    for (const e of front) {
      for (const p of prereqs(e)) if (!added.includes(p)) added.push(p);
    }
    out.push(...added);
    front = added;
  }
  return out;
}

const LINEAGE = new Map(Object.keys(CIVICS).map((id) => [id, lineage(id)]));

/** 0x61ee30: a row in reach scores its own value and its prerequisites'
 *  (a negative one counts nothing), a favored row then taken 1.5 times */
function propagate(entries: CivicEntry[], favored: ReadonlySet<string>): void {
  const byId = new Map(entries.map((e) => [e.civic, e]));
  for (const e of entries) {
    if (e.turns < 0) continue;
    e.score = 0;
    for (const p of LINEAGE.get(e.civic)!) e.score += Math.max(0, byId.get(p)?.base ?? 0);
    if (favored.has(e.civic)) e.score = fmul(e.score, fxConst(1.5));
  }
}

/** the seat's research record */
function researchOf(state: GameState, seat: number): ResearchState {
  return seatOf(state, seat)!.research;
}

/** THE ANALYSIS: every civic's entry, in table order, valued and
 *  propagated; `culture` is the seat's Culture a turn, `weights` what a
 *  major's AI follows (`aiWeights.ts`), `cityTerm` the value's terms its
 *  cities give (the unlocked units') where the seat's facts give them */
export function civicAnalysis(state: GameState, seat: number, culture: number, weights: AiWeightInputs = {},
  cityTerm?: (civic: string, turns: number) => number): CivicEntry[] {
  const r = researchOf(state, seat);
  const rate = fxOf(culture);
  const pw = pseudoYieldWeights(state, seat, weights);
  let view: AiValueView | undefined;
  const entries: CivicEntry[] = CIVIC_TABLE_ORDER.filter((id) => CIVICS[id]).map((id) => {
    if (owned(r, id)) return { civic: id, next: id, turns: -1, owned: true, base: 0, score: 0 };
    const { turns, next } = walk(state, seat, r, id, rate);
    const base = turns < 0 ? 0 : civicValue(state, seat, id, turns, pw, view ??= majorView(state)) + (cityTerm && turns < AI_VALUE_HORIZON ? cityTerm(id, turns) : 0);
    return { civic: id, next, turns, owned: false, base, score: base };
  });
  const leader = leaderOf(state, seat);
  propagate(entries, new Set(leader ? CIVIC_AI_FAVORED[leader] ?? [] : []));
  return entries;
}

/** 0x6182e0: the comparator's best entry, the rows whose next step is `key`
 *  passed over */
function best(entries: readonly CivicEntry[], key: string | null): CivicEntry | undefined {
  let b = entries[0];
  for (const c of entries.slice(1)) {
    let take: boolean;
    if (b.owned !== c.owned) take = b.owned;
    else if (b.next === key && c.next !== key) take = true;
    else if (c.next === key && b.next !== key) take = false;
    else if (b.turns * c.turns <= 0) take = b.turns < c.turns;
    else take = b.score < c.score;
    if (take) b = c;
  }
  return b;
}

/** the random pick's draw over `n` rows: an index, or -1 for no pick */
export type CivicDraw = (n: number) => number;

/** the game's draw for the random pick ("Random Civic Choice", 0x626600) */
export function civicDraw(state: GameState): CivicDraw {
  return (n) => randRange(state, n, 'Random Civic Choice');
}

/** 0x626600: THE CHOICE over the entries with `key` (the completed civic,
 *  or null): the civic to study, or null */
export function civicChoice(state: GameState, seat: number, entries: readonly CivicEntry[], key: string | null, draw: CivicDraw): string | null {
  const r = researchOf(state, seat);
  const b = best(entries, key);
  if (b && researchable(r, b.next)) return b.next;
  const open = CIVIC_TABLE_ORDER.filter((id) => CIVICS[id] && !r.civics.includes(id) && researchable(r, id));
  if (!open.length) return null;
  const k = draw(open.length);
  return k >= 0 ? open[k] : null;
}

/** THE MAJORS' AI's civic: the completion's choice over the entries its last
 *  turn left (`entries`; a fresh analysis where none), with `done` the
 *  completed civic, or the turn's over a fresh analysis (`culture` its
 *  Culture a turn) */
export function civicAiChoice(state: GameState, seat: number, culture: number, done: string | null, entries: readonly CivicEntry[] | null, draw: CivicDraw,
                              weights: AiWeightInputs = {}): string | null {
  if (done) return civicChoice(state, seat, entries ?? civicAnalysis(state, seat, culture, weights), done, draw);
  return civicChoice(state, seat, civicAnalysis(state, seat, culture, weights), null, draw);
}
