/**
 * THE MAJORS' DIPLOMACY AS THE GAME RUNS IT: the agendas each major carries,
 * and the diplomatic modifiers — what one major thinks of another, the
 * opinion the game's AI reads for every diplomatic choice
 * (tools/civ6lab/dll_readings.md "C-97: the majors' opinion").
 *
 * AGENDAS. A major carries its leader's historical agendas
 * (HistoricalAgendas), one random agenda drawn at set-up (RandomAgendasInEra:
 * the Ancient era's tags) and one more when it completes a civic of
 * RandomAgendasForCivic (Nationalism's tags). The pool walks the draw's tags
 * in order and, within a tag, the agendas in database order; an agenda as
 * many majors carry as its GameLimit (every major where it sets none) or one
 * that asks for a religion the major lacks stays out. One draw over the pool
 * ("Choose random agenda"); an agenda the major carries or one exclusive with
 * one it carries is drawn again over the same pool (runs/h1_duelw1105:
 * Trajan's 18, Expansionist, then 11, Populous; runs/h1_duelw1113: Qin's 22,
 * 22, Wonder Advocate twice, then 12, Turtler). The civic's draw falls at the
 * owner's turn start that first holds the civic.
 *
 * MODIFIERS. Every major carries TRAIT_LEADER_MAJOR_CIV's diplomatic
 * modifiers and its agendas'; each stands per opponent at a value in fixed
 * point (1/256). At each owner's turn start every modifier is re-evaluated on
 * the view as the owner sees it then, and the opinion of an opponent is the
 * values' sum, floored to a whole number (AI_Diplomacy.csv's number). A
 * requirement-driven modifier holds its InitialValue while its subject
 * requirements hold; without ReductionTurns it goes when they fail, with them
 * it decays toward 0 by ReductionValue every ReductionTurns of the owner's
 * turn starts, the first counted on the start that saw it fail. The first
 * impression (RANDOM) is a set-up draw per pair, "Random Diplomatic Value"
 * over 100: floor(v x (2 RandomRange + 1) / 100) - RandomRange at the
 * meeting, decaying from there the same way.
 */
import {
  DIPLO_AGENDAS, DIPLO_AGENDA_MODIFIERS, DIPLO_EXCLUSIVE_AGENDAS, DIPLO_HISTORICAL_AGENDAS, DIPLO_RANDOM_AGENDAS,
  DIPLO_RANDOM_AGENDAS_FOR_CIVIC, DIPLO_RANDOM_AGENDAS_IN_ERA, DIPLO_REQUIREMENT_SETS, DIPLO_STANDARD_MODIFIERS,
} from './diplomacyTables';
import type { DiploModifierRow, DiploRequirement } from './diplomacyTypes';
import type { MajorView } from './view';

/** a draw over [0, range) on the game's generator, under the game's label */
export type DiploDraw = (range: number, label: string) => number;

const FX = 256;
/** the players a game's diplomacy keeps a slot for (GameCore::MAX_PLAYERS) */
export const DIPLO_PLAYER_SLOTS = 64;

/** one modifier as it stands between an owner and an opponent */
export interface DiploModifier {
  id: string;
  /** the value, fixed point */
  value: number;
  /** its subject requirements held at the last evaluation */
  active: boolean;
  /** owner turn starts left to the next reduction, 0 when none runs */
  reduceLeft: number;
  /** owner turn starts left to the next increment, 0 when none runs */
  incLeft: number;
}

export interface DiplomacyMemory {
  /** per seat: its agendas, the historical first, then the random ones as drawn */
  agendas: Map<number, string[]>;
  /** per seat: its set-up "Random Diplomatic Value" toward each player slot */
  randomValue: Map<number, readonly number[]>;
  /** per `${owner}>${opponent}`: the modifiers standing, by row id */
  pairs: Map<string, Map<string, DiploModifier>>;
  /** per seat: the civics it held at its last turn start */
  civics: Map<number, Set<string>>;
}

/** what a modifier evaluation could not settle: a requirement or a modifier
 *  type the port does not read yet */
export interface DiploGaps {
  requirements: Map<string, number>;
  modifierTypes: Map<string, number>;
}

export const newDiploGaps = (): DiploGaps => ({ requirements: new Map(), modifierTypes: new Map() });

const pairKey = (owner: number, other: number) => `${owner}>${other}`;
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function agendaPool(view: MajorView, mem: DiplomacyMemory, seat: number, tags: readonly string[]): string[] {
  const religion = view.religionFounded(seat) !== null;
  const majors = view.majors().length;
  const holders = (agenda: string) => [...mem.agendas.values()].filter((a) => a.includes(agenda)).length;
  const pool: string[] = [];
  for (const tag of tags) {
    for (const agenda of DIPLO_AGENDAS) {
      const row = DIPLO_RANDOM_AGENDAS.find((r) => r.agenda === agenda);
      if (!row || row.tag !== tag) continue;
      if (holders(agenda) >= (row.gameLimit >= 0 ? row.gameLimit : majors)) continue;
      if (row.requiresReligion && !religion) continue;
      pool.push(agenda);
    }
  }
  return pool;
}

const exclusive = (a: string, b: string) => DIPLO_EXCLUSIVE_AGENDAS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** one random agenda for `seat` from the pool of `tags` */
function drawAgenda(view: MajorView, mem: DiplomacyMemory, seat: number, tags: readonly string[], draw: DiploDraw): void {
  const pool = agendaPool(view, mem, seat, tags);
  if (pool.length === 0) return;
  const held = mem.agendas.get(seat) ?? [];
  for (;;) {
    const pick = pool[draw(pool.length, 'Choose random agenda')];
    if (held.includes(pick) || held.some((h) => exclusive(h, pick))) continue;
    held.push(pick);
    mem.agendas.set(seat, held);
    return;
  }
}

/**
 * THE SET-UP: each player slot's diplomacy draws its "Random Diplomatic
 * Value" toward every slot twice (the first set is replaced), in player order
 * (`players`: the game's player slots in use, majors first); then each major
 * takes its historical agendas and its era's random ones, in player order.
 * A major's seat is its player slot.
 */
export function diplomacySetup(view: MajorView, players: readonly number[], draw: DiploDraw): DiplomacyMemory {
  const mem: DiplomacyMemory = { agendas: new Map(), randomValue: new Map(), pairs: new Map(), civics: new Map() };
  for (const p of players) {
    let values: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      values = [];
      for (let o = 0; o < DIPLO_PLAYER_SLOTS; o++) values.push(draw(100, 'Random Diplomatic Value'));
    }
    mem.randomValue.set(p, values);
  }
  const era = DIPLO_RANDOM_AGENDAS_IN_ERA.find((e) => e.era === 'ERA_ANCIENT');
  for (const seat of view.majors()) {
    const leader = view.leader(seat);
    mem.agendas.set(seat, [...(leader ? DIPLO_HISTORICAL_AGENDAS[leader] ?? [] : [])]);
    for (let k = 0; era && k < era.n; k++) drawAgenda(view, mem, seat, era.tags, draw);
    mem.civics.set(seat, new Set(view.civicsHeld(seat)));
  }
  return mem;
}

/** the agenda a civic of RandomAgendasForCivic grants, drawn when the seat
 *  first holds the civic */
function civicAgendas(view: MajorView, mem: DiplomacyMemory, seat: number, draw: DiploDraw): void {
  const held = view.civicsHeld(seat);
  const before = mem.civics.get(seat) ?? new Set<string>();
  for (const row of DIPLO_RANDOM_AGENDAS_FOR_CIVIC) {
    if (held.has(row.civic) && !before.has(row.civic)) for (let k = 0; k < row.n; k++) drawAgenda(view, mem, seat, row.tags, draw);
  }
  mem.civics.set(seat, new Set(held));
}

// ---------------------------------------------------------------- requirements

interface ReqCtx {
  view: MajorView;
  owner: number;
  subject: number;
}

/** a requirement's verdict: true / false, or null where the port does not
 *  read its type */
type ReqFn = (c: ReqCtx, r: DiploRequirement) => boolean | null;

/** fixed point of a float argument as the requirements take it: the whole
 *  part shifted, the fraction truncated to 1/256 */
function fxArg(v: number): number {
  const w = Math.floor(v);
  return w * FX + Math.trunc((v - w) * FX);
}

/** the shared "lead" test of YIELD_LEAD and its kin (0xb6ff10): both values
 *  at or below 0 fail; their difference, floored to a whole number, must
 *  reach `minDelta`; a positive ratio asks the subject's value to reach the
 *  owner's times the ratio, a negative one the owner's to reach the
 *  subject's times its magnitude */
function leads(ownerFx: number, subjectFx: number, minDelta: number, ratio: number): boolean {
  if (ownerFx <= 0 && subjectFx <= 0) return false;
  if (Math.abs(Math.floor((ownerFx - subjectFx) / FX)) < minDelta) return false;
  const r = fxArg(Math.abs(ratio));
  return ratio > 0 ? subjectFx >= Math.trunc((ownerFx * r) / FX) : ownerFx >= Math.trunc((subjectFx * r) / FX);
}

const fx = (v: number) => Math.round(v * FX);
const f32 = Math.fround;

const REQUIREMENTS: Record<string, ReqFn> = {
  // every modifier is evaluated at its owner's turn start
  REQUIREMENT_PLAYER_TURN_STARTED: () => true,
  REQUIREMENT_CIVILIZATION_LEVEL: (c, r) => (r.args.OpponentCivLevel === 'CIVILIZATION_LEVEL_FULL_CIV' ? c.view.majors().includes(c.subject) : null),
  REQUIREMENT_PLAYER_HAS_MET: (c) => c.view.metTurn(c.owner, c.subject) !== null,
  REQUIREMENT_PLAYER_MET_X_TURNS_AGO: (c, r) => {
    const met = c.view.metTurn(c.owner, c.subject);
    return met !== null && c.view.turn - met >= Number(r.args.TurnsAgo ?? 0);
  },
  REQUIREMENT_PLAYER_IS_AT_PEACE: (c, r) => !c.view.atWar(c.owner, c.subject) && c.view.peaceTurns(c.owner, c.subject) >= Number(r.args['Min Turns'] ?? 0),
  REQUIREMENT_DELEGATION: (c) => c.view.hasDelegation(c.subject, c.owner),
  REQUIREMENT_RESIDENT_EMBASSY: (c) => c.view.hasEmbassy(c.subject, c.owner),
  REQUIREMENT_ALLY: () => false,
  REQUIREMENT_PLAYER_HAS_DARK_AGE: (c) => c.view.darkAge(c.subject),
  REQUIREMENT_PLAYER_HAS_GOLDEN_AGE: (c) => c.view.goldenAge(c.subject),
  REQUIREMENT_PLAYER_HAS_SAME_GOVERNMENT: (c) => {
    const g = c.view.government(c.owner);
    return g !== null && g === c.view.government(c.subject);
  },
  REQUIREMENT_PLAYER_YIELD_LEAD: (c, r) => {
    const y = r.args.YieldType;
    return leads(fx(c.view.playerYield(c.owner, y)), fx(c.view.playerYield(c.subject, y)), Number(r.args.MinimumDelta ?? 0),
      Number(r.args.YieldRatio ?? 1));
  },
  REQUIREMENT_PLAYER_POPULATION_LEAD: (c, r) => leads(fx(c.view.population(c.owner)), fx(c.view.population(c.subject)),
    Number(r.args.MinimumDelta ?? 0), Number(r.args.PopulationRatio ?? 1)),
  REQUIREMENT_PLAYER_BUILT_WONDER: (c, r) => leads(fx(c.view.wondersBuilt(c.owner)), fx(c.view.wondersBuilt(c.subject)),
    Number(r.args.MinimumDelta ?? 0), Number(r.args.WonderRatio ?? 1)),
  REQUIREMENT_PLAYER_GOT_GREAT_PERSON: (c, r) => leads(fx(c.view.greatPeopleEarned(c.owner)), fx(c.view.greatPeopleEarned(c.subject)),
    Number(r.args.MinimumDelta ?? 0), Number(r.args.GreatPersonRatio ?? 1)),
  REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION: (c) => {
    const ours = c.view.majorityReligion(c.owner);
    return ours !== null && ours === c.view.religionFounded(c.subject);
  },
  REQUIREMENT_FOUNDED_NO_RELIGION: (c) => c.view.religionFounded(c.owner) === null,
  REQUIREMENT_OPEN_BORDERS: (c) => c.view.hasOpenBorders(c.owner, c.subject),
  // 0xb548f0: YIELD_LEAD's test on the players' military strength in the
  // domain (the player stats' per-domain count, read as the military units
  // the seat holds), its ratio a float and no fixed point
  REQUIREMENT_PLAYER_MILITARY_STRENGTH_LEAD: (c, r) => {
    const domain = r.args.DomainType ?? 'DOMAIN_LAND';
    const mine = c.view.militaryUnits(c.owner, domain);
    const theirs = c.view.militaryUnits(c.subject, domain);
    const ratio = f32(Number(r.args.StrengthRatio ?? 1));
    if (mine <= 0 && theirs <= 0) return false;
    if (Math.abs(mine - theirs) < Number(r.args.MinimumDelta ?? 0)) return false;
    return ratio > 0 ? theirs >= f32(mine * ratio) : mine >= f32(theirs * -ratio);
  },
  // 0xb32500: no city-state holds the owner's envoys and one of the subject's
  REQUIREMENT_PLAYER_NOT_COMPETING_MINORS: (c) =>
    !c.view.cityStateSeats().some((cs) => c.view.envoys(cs, c.owner) > 0 && c.view.envoys(cs, c.subject) >= 1),
  // 0xb61120: a city-state holds the owner's envoys and more of the
  // subject's than PercentCompeting of the owner's
  REQUIREMENT_PLAYER_COMPETING_MINORS: (c, r) => c.view.cityStateSeats().some((cs) => {
    const mine = c.view.envoys(cs, c.owner);
    return mine > 0 && c.view.envoys(cs, c.subject) > Math.trunc((Number(r.args.PercentCompeting ?? 0) * mine) / 100);
  }),
};

function requirement(c: ReqCtx, r: DiploRequirement, gaps: DiploGaps): boolean | null {
  let v: boolean | null;
  if (r.type === 'REQUIREMENT_REQUIREMENTSET_IS_MET') v = requirementSet(c, r.args.RequirementSetId, gaps);
  else {
    const f = REQUIREMENTS[r.type];
    v = f ? f(c, r) : null;
  }
  if (v === null) {
    bump(gaps.requirements, r.type);
    return null;
  }
  return r.inverse ? !v : v;
}

/** a requirement set's verdict, null where a requirement it needs is not read */
export function requirementSet(c: ReqCtx, id: string | null | undefined, gaps: DiploGaps): boolean | null {
  if (!id) return true;
  const set = DIPLO_REQUIREMENT_SETS[id];
  if (!set) return null;
  let unknown = false;
  for (const r of set.reqs) {
    const v = requirement(c, r, gaps);
    if (v === null) unknown = true;
    else if (set.any && v) return true;
    else if (!set.any && !v) return false;
  }
  return unknown ? null : !set.any;
}

// ------------------------------------------------------------------ modifiers

const argNum = (row: DiploModifierRow, k: string, d: number): number => (row.args[k] !== undefined ? Number(row.args[k]) : d);

/** one owner turn start of a requirement-driven modifier */
function simpleModifier(mods: Map<string, DiploModifier>, row: DiploModifierRow, holds: boolean): void {
  const initial = argNum(row, 'InitialValue', 0) * FX;
  const max = row.args.MaxValue !== undefined ? argNum(row, 'MaxValue', 0) * FX : initial;
  const incTurns = argNum(row, 'IncrementTurns', 0);
  const incValue = argNum(row, 'IncrementValue', 0) * FX;
  const redTurns = argNum(row, 'ReductionTurns', 0);
  const redValue = Math.abs(argNum(row, 'ReductionValue', 0)) * FX;
  let m = mods.get(row.id);
  if (holds) {
    if (!m || !m.active) {
      m = { id: row.id, value: initial, active: true, reduceLeft: 0, incLeft: incTurns };
      mods.set(row.id, m);
    } else if (incTurns > 0 && incValue !== 0 && --m.incLeft <= 0) {
      m.incLeft = incTurns;
      const next = m.value + incValue;
      m.value = max >= 0 ? Math.min(max, next) : Math.max(max, next);
    }
    return;
  }
  if (!m) return;
  if (m.active) {
    m.active = false;
    if (redTurns <= 0 || redValue === 0) {
      mods.delete(row.id);
      return;
    }
    m.reduceLeft = redTurns;
  }
  decay(mods, m, redTurns, redValue);
}

/** a decaying modifier's turn start: the countdown, and at its end the value
 *  one step toward 0 (gone at 0) */
function decay(mods: Map<string, DiploModifier>, m: DiploModifier, turns: number, step: number): void {
  if (m.reduceLeft <= 0 || --m.reduceLeft > 0) return;
  m.reduceLeft = turns;
  m.value = m.value > 0 ? Math.max(0, m.value - step) : Math.min(0, m.value + step);
  if (m.value === 0) mods.delete(m.id);
}

/** the first impression (MODIFIER_PLAYER_DIPLOMACY_RANDOM) */
function randomModifier(mem: DiplomacyMemory, mods: Map<string, DiploModifier>, row: DiploModifierRow, owner: number, other: number,
                        fresh: boolean): void {
  const range = argNum(row, 'RandomRange', 3);
  const turns = argNum(row, 'ReductionTurns', 0);
  const step = Math.abs(argNum(row, 'ReductionValue', 0)) * FX;
  if (fresh) {
    const v = mem.randomValue.get(owner)?.[other] ?? 0;
    const value = (Math.floor((v * (2 * range + 1)) / 100) - range + argNum(row, 'DifficultyOffset', 0)) * FX;
    if (value === 0) return;
    mods.set(row.id, { id: row.id, value, active: false, reduceLeft: turns, incLeft: 0 });
  }
  const m = mods.get(row.id);
  if (m && turns > 0) decay(mods, m, turns, step);
}

/** a modifier type that computes its own value each owner turn start while
 *  its subject requirements hold: the value in whole points */
type ValueFn = (view: MajorView, owner: number, subject: number, row: DiploModifierRow) => number;


const VALUES: Record<string, ValueFn> = {
  // NEW_WARMONGER (0xb7eee0, arguments 0xb81dd0): the owner's grievances
  // against the subject, PercentOfGrievances of them against it, no lower
  // than LowerLimit
  NEW_WARMONGER: (view, owner, subject, row) => {
    const g = view.grievances(owner, subject);
    if (g <= 0) return 0;
    return Math.max(argNum(row, 'LowerLimit', 0), -Math.trunc((argNum(row, 'PercentOfGrievances', 0) * g) / 100));
  },
  // TRADE_RELATIONS (0xbb1a20, its arguments 0xbb40f0): TradeBonus for a
  // route in either direction, once or per route (BonusPerRoute);
  // OnlyInboundTrade counts the subject's routes to the owner alone;
  // NoTradePenalty (0 unless given) for none. The two directions are the
  // view's one count: every major takes the defaults.
  TRADE_RELATIONS: (view, owner, subject, row) => (view.tradeRoutesBetween(owner, subject) > 0
    ? argNum(row, 'TradeBonus', 2) : -argNum(row, 'NoTradePenalty', 0)),
  // Trajan's Optimus Princeps (0xb4d2b0, its arguments 0xb50250): the
  // subject's plots against the owner's beyond EquivalentTerritoryPercentage
  // either way, BetterTerritoryBonus up or down; then the subject's rank by
  // plots among the majors, TopTerritoryBonus in the top TopTerritoryPercentage
  // and against it in the bottom
  AGENDA_OPTIMUS_PRINCEPS: (view, owner, subject, row) => {
    const top = f32(argNum(row, 'TopTerritoryPercentage', 25) * f32(0.01));
    const eq = f32(argNum(row, 'EquivalentTerritoryPercentage', 20) * f32(0.01));
    const topBonus = argNum(row, 'TopTerritoryBonus', 8);
    const better = argNum(row, 'BetterTerritoryBonus', 5);
    const mine = view.plotsOwned(owner);
    const theirs = view.plotsOwned(subject);
    let v = 0;
    if (theirs > f32(f32(eq + 1) * mine)) v = better;
    else if (f32(f32(1 - eq) * mine) > theirs) v = -better;
    let count = 1;
    let rank = 1;
    for (const p of view.majors()) {
      if (p === subject) continue;
      count++;
      if (view.plotsOwned(p) > theirs) rank++;
    }
    if (f32(top * count) >= rank) v += topBonus;
    else if (rank >= f32(f32(1 - top) * count)) v -= topBonus;
    return v;
  },
};

/** the modifier rows a major carries: every major's, then its agendas' */
export function modifierRows(mem: DiplomacyMemory, seat: number): DiploModifierRow[] {
  const out = [...DIPLO_STANDARD_MODIFIERS];
  for (const a of mem.agendas.get(seat) ?? []) out.push(...(DIPLO_AGENDA_MODIFIERS[a] ?? []));
  return out;
}

/**
 * ONE OWNER'S TURN START: the civic agenda it is due, then every modifier
 * toward every major it has met. `view` is the game as the owner sees it at
 * its turn start.
 */
export function diplomacyTurnStart(view: MajorView, mem: DiplomacyMemory, owner: number, draw: DiploDraw, gaps: DiploGaps): void {
  civicAgendas(view, mem, owner, draw);
  const rows = modifierRows(mem, owner);
  for (const other of view.majors()) {
    if (other === owner || view.metTurn(owner, other) === null) continue;
    const key = pairKey(owner, other);
    const fresh = !mem.pairs.has(key);
    const mods = mem.pairs.get(key) ?? new Map<string, DiploModifier>();
    mem.pairs.set(key, mods);
    const c: ReqCtx = { view, owner, subject: other };
    for (const row of rows) {
      if (row.type === 'RANDOM') {
        randomModifier(mem, mods, row, owner, other, fresh);
        continue;
      }
      const valueFn = VALUES[row.type];
      if (row.type !== 'SIMPLE_MODIFIER' && !valueFn) {
        bump(gaps.modifierTypes, row.type);
        continue;
      }
      const ownerOk = requirementSet({ view, owner, subject: owner }, row.owner, gaps);
      const subjectOk = requirementSet(c, row.subject, gaps);
      if (ownerOk === null || subjectOk === null) continue;
      if (!valueFn) {
        simpleModifier(mods, row, ownerOk && subjectOk);
        continue;
      }
      const v = ownerOk && subjectOk ? valueFn(view, owner, other, row) : 0;
      if (v === 0) mods.delete(row.id);
      else mods.set(row.id, { id: row.id, value: v * FX, active: true, reduceLeft: 0, incLeft: 0 });
    }
  }
}

/** the modifiers `owner` holds toward `other`, by row id */
export function opinionModifiers(mem: DiplomacyMemory, owner: number, other: number): ReadonlyMap<string, DiploModifier> {
  return mem.pairs.get(pairKey(owner, other)) ?? new Map();
}

/** what `owner` thinks of `other`: its modifiers' values summed, floored */
export function opinion(mem: DiplomacyMemory, owner: number, other: number): number {
  let s = 0;
  for (const m of opinionModifiers(mem, owner, other).values()) s += m.value;
  return Math.floor(s / FX);
}
