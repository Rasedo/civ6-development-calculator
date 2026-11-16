/**
 * THE AI'S WEIGHTS (GameCore_XP2, `this` the player's AI::GrandStrategic;
 * `tools/civ6lab/dll_readings.md` "C-96 / C-97: the AI's yield weights and
 * the modifier evaluator").
 *
 * THE YIELD WEIGHT w[y] (0x702ad0) is the sum of four 24.8 parts; the yield
 * value (`aiValue.yieldValue`, 0x7a6690) pays a yield at (1 + min(w, 9.0)) of
 * its DefaultValue:
 * - the Religious AI's faith boost (0x74f5a0, Faith only), a major's
 *   (`religiousFaithBoost`);
 * - the Economic AI's gold boost (0x687bf0, Gold only): -0.2 x the gold per
 *   turn while that is negative; the Free Cities none;
 * - the Yields lists (0x6fde70, 0x7ba440): the leader's and the
 *   civilization's trait lists, a major's agendas' and the strategies it
 *   follows' (`strategyRefs`; a list kept while the player's handicap lies
 *   in its MinDifficulty..MaxDifficulty), each row Value x 0.01 (subtracted
 *   where Favored is false; an item kept while the handicap lies in its own
 *   bounds);
 * - the sensitivity boost (0x6fafc0): for a yield whose sensitivity s (the
 *   YieldSensitivities lists, the same sources) is above 0, over the player
 *   and every major it has met, with x their yield per turn: n > 1, the sample
 *   deviation sd > 0 and the player's x below the most -> s x (max - x) / sd.
 *
 * THE PSEUDO-YIELD WEIGHT (0x700810), which the pseudo-yield value
 * (`aiValue.pseudoYieldValue`, 0x7a60d0) pays at (1 + w): the followed
 * strategies' PseudoYields lists — a city-state's STRATEGY_NAVAL's from
 * the turn after it starts (`minorNavalWeighted`), from the turn it starts
 * in the civics AI's government values (`minorNavalApplied`), the Free
 * Cities' none — held at -1.0 at least; a city-state's and the Free Cities'
 * PSEUDOYIELD_NUCLEAR_WEAPON carries their military AI's weight
 * (`nuclearDesire`);
 * PSEUDOYIELD_DISTRICT adds 0.5 x the ChronologyIndex of the player's era
 * (player +0x1358 +0xf8, Eras +0x1c).
 */
import { AI_AGENDA_TRAITS, AI_CIVILIZATION_TRAITS, AI_DIFFICULTIES, AI_ERA_STRATEGY_LISTS, AI_LEADER_TRAITS, AI_LIST_ITEMS,
  AI_GP_CLASS_PSEUDOYIELD, AI_STRATEGY_LISTS, AI_TRAIT_LISTS } from '../data/aiTables';
import { ERAS } from '../data/techs';
import { GP_CLASSES } from '../data/greatPeople';
import { NAVAL_STRATEGY_PSEUDOYIELDS } from '../data/aiResearch';
import { gpCapped, gpFaithPerTurn, gpOffer } from './greatPeople';
import type { GreatPersonClass } from './types';
import { CIV_LEADERS } from '../data/seats';
import { FX, fmul, fxConst, fxOf, type AiListItem, type AiListRef } from './aiValue';
import { unitStepCost, unitsAcquired } from './game';
import { civEraIndex, computeCityStats, standingLuxuries } from './city';
import { getModifiers, unitUpkeep } from './effects';
import { wmdUpkeep } from './nuclear';
import { FREE_SEAT, isCiv, majorsMet, seatOf } from './seats';
import { minorCity } from './cityStates';
import { minorNavalApplied, minorNavalWeighted } from './minorStrategy';
import type { GameState, Seat } from './types';

/** the yields in YieldTypes order */
export const AI_YIELDS = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_SCIENCE', 'YIELD_CULTURE', 'YIELD_FAITH'] as const;

/** the Prince handicap, a Difficulties index: a seat with none set */
const PRINCE = AI_DIFFICULTIES.indexOf('DIFFICULTY_PRINCE');

/** the seat's leader's and civilization's traits that carry a weight list */
function traitsOf(seat: number, s: Seat): readonly string[] {
  if (!isCiv(seat)) return [];
  const entry = CIV_LEADERS[s.civ];
  if (!entry) return [];
  return [...(AI_LEADER_TRAITS[`LEADER_${entry.leader}`] ?? []), ...(AI_CIVILIZATION_TRAITS[`CIVILIZATION_${entry.civ}`] ?? [])];
}

/** a row's difficulty bounds hold the handicap */
function within(r: AiListRef | AiListItem, h: number): boolean {
  return (!r.minDifficulty || AI_DIFFICULTIES.indexOf(r.minDifficulty) <= h) && (!r.maxDifficulty || AI_DIFFICULTIES.indexOf(r.maxDifficulty) >= h);
}

/** the weight lists a major carries beyond its traits': its agendas'
 *  (AgendaTraits, `Seat.agendas`) and its era strategies' — every era's up to
 *  its own (StrategyConditions "Is <Era>", started the AI turn the major
 *  first holds a technology or civic of the era, never stopped) and the
 *  other strategies' it follows (`Seat.strategies`, `AI_STRATEGY_LISTS`:
 *  runs/h1_duelr1128 China under VICTORY_STRATEGY_SCIENCE_VICTORY's +0.5
 *  Science, its route to city-state 3 under Sovereignty's 2 Science the
 *  Free Cities' K 6.41 t82-85; Rome under VICTORY_STRATEGY_RELIGIOUS_VICTORY's
 *  +0.75 Faith t46-126, city-states 2 and 4's K 5.39 t69-89, 4.64 from t127) */
function strategyRefs(seat: number, s: Seat): AiListRef[] {
  if (!isCiv(seat)) return [];
  const out: AiListRef[] = [];
  for (const a of s.agendas ?? []) for (const t of AI_AGENDA_TRAITS[a] ?? []) out.push(...(AI_TRAIT_LISTS[t] ?? []));
  const era = civEraIndex(s.research.techs, s.research.civics);
  for (let e = 0; e <= era; e++) out.push(...(AI_ERA_STRATEGY_LISTS[`ERA_${ERAS[e].toUpperCase()}`] ?? []));
  for (const st of s.strategies ?? []) out.push(...(AI_STRATEGY_LISTS[st] ?? []));
  return out;
}

/** one system's sum per item over the lists the player carries — its
 *  traits', its agendas' and its era strategies' (`strategyRefs`): each row
 *  fx(Value x 0.01), Favored false subtracted (0x6dd1b0) */
function listSum(seat: number, s: Seat, system: string): Map<string, number> {
  const h = s.handicap ?? PRINCE;
  const lists: string[] = [];
  for (const t of traitsOf(seat, s)) for (const r of AI_TRAIT_LISTS[t] ?? []) if (r.system === system && within(r, h)) lists.push(r.list);
  for (const r of strategyRefs(seat, s)) if (r.system === system && within(r, h)) lists.push(r.list);
  return refSum(lists, h);
}

/** the lists' sum per item at handicap `h` */
function refSum(lists: readonly string[], h: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lists) {
    for (const it of AI_LIST_ITEMS[l] ?? []) {
      if (!within(it, h)) continue;
      const v = fxConst(it.value * 0.01);
      out.set(it.item, (out.get(it.item) ?? 0) + (it.favored ? v : -v));
    }
  }
  return out;
}

/** the Yields and YieldSensitivities systems' sums of `refs` at the Prince
 *  handicap, raw, in `AI_YIELDS`' order (the six Yields, then the six
 *  sensitivities) — the tables the GPU twin's major weights read
 *  (`_major_yield_w`) */
function weightRow(refs: readonly AiListRef[]): number[] {
  const row = (system: string): number[] => {
    const sums = refSum(refs.filter((r) => r.system === system && within(r, PRINCE)).map((r) => r.list), PRINCE);
    return AI_YIELDS.map((y) => sums.get(y) ?? 0);
  };
  return [...row('Yields'), ...row('YieldSensitivities')];
}

/** a major playing the CIV_LEADERS pair `civ`: its traits' lists */
export function majorYieldBias(civ: number): number[] {
  const entry = CIV_LEADERS[civ];
  const traits = entry ? [...(AI_LEADER_TRAITS[`LEADER_${entry.leader}`] ?? []), ...(AI_CIVILIZATION_TRAITS[`CIVILIZATION_${entry.civ}`] ?? [])] : [];
  return weightRow(traits.flatMap((t) => AI_TRAIT_LISTS[t] ?? []));
}

/** an agenda's lists (AgendaTraits) */
export function agendaYieldBias(agenda: string): number[] {
  return weightRow((AI_AGENDA_TRAITS[agenda] ?? []).flatMap((t) => AI_TRAIT_LISTS[t] ?? []));
}

/** the strategies beside the era ones that carry a weight list, by name
 *  (`Seat.strategies` indexes them) */
export const AI_STRATEGIES: readonly string[] = Object.keys(AI_STRATEGY_LISTS);

/** a strategy's lists (`AI_STRATEGY_LISTS`) */
export function strategyYieldBias(strategy: string): number[] {
  return weightRow(AI_STRATEGY_LISTS[strategy] ?? []);
}

/** the era strategies' lists of every era up to `era` (an Eras index) */
export function eraYieldBias(era: number): number[] {
  const refs: AiListRef[] = [];
  for (let e = 0; e <= era; e++) refs.push(...(AI_ERA_STRATEGY_LISTS[`ERA_${ERAS[e].toUpperCase()}`] ?? []));
  return weightRow(refs);
}

/** the seat's gold per turn: its cities' net Gold (a city-state's one city's) less its units' and its
 *  devices' upkeep */
export function goldPerTurn(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  const lux = standingLuxuries(state, seat);
  const mods = getModifiers(state, seat);
  let g = 0;
  for (const c of s.cities) g += computeCityStats(state, c, lux, mods).total.gold;
  // a city-state's one city
  const cs = state.cityStates.find((x) => x.seat === seat);
  if (cs) g += computeCityStats(state, minorCity(cs)).total.gold;
  for (const u of state.units) if (u.seat === seat) g -= unitUpkeep(mods, u);
  return g - wmdUpkeep(state, seat);
}

/** a yield per turn the sensitivity compares (Science and Culture carry
 *  sensitivity lists): the seat's last accrual's output */
function yieldPerTurn(state: GameState, seat: number, y: string): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  if (y === 'YIELD_SCIENCE') return s.sciRate ?? 0;
  if (y === 'YIELD_CULTURE') return s.culRate ?? 0;
  if (y === 'YIELD_GOLD') return goldPerTurn(state, seat);
  return 0;
}

/** THE ECONOMIC AI'S GOLD BOOST (0x687bf0, each turn, AI::Economic +0x528)
 *  on the net income `net` (the treasury's m_xCachedNetIncome, player
 *  +0x13a0 +0x1b8): -0.2 x it while it is negative, else 0, raw */
export function economicGoldBoost(net: number): number {
  return net < 0 ? fmul(fxConst(-0.2), fxConst(net)) : 0;
}

/** THE RELIGIOUS AI'S FAITH BOOST of a major (0x74f5a0 in its AI's turn,
 *  AI::Religious m_yieldPriorityBoost [Faith], raw): 0, and with a religious
 *  unit wanted (`Seat.faithWant`) -0.25 (@0xd2f324) where the faith balance
 *  as its turn leaves it (player +0x1340 +0x100) passes the unit's
 *  Production cost (0x4f2b20) and -0.25 more where its Faith a turn
 *  (0x496fd0 -> 0x494090: its cities' and its Great Person points' in the
 *  classes it cannot earn, `gpFaithPerTurn`) passes half of it (runs/h1_duels1191 China t118-163
 *  wanting the Missionary at 37 to 76: the Free Cities' K over its routes'
 *  Faith one step below the unboosted on the turns its balance lay under the
 *  cost, two on the rest, 46 of 46 turns; runs/h1_duels1153 China t111-169
 *  wanting the Apostle at 145, its Faith a turn under half of it, one step on
 *  the turns its balance passed 145) */
export function religiousFaithBoost(state: GameState, s: Seat): number {
  if (!s.faithWant) return 0;
  const cost = unitStepCost(s.faithWant, unitsAcquired(state, s.seat, s.faithWant));
  const lux = standingLuxuries(state, s.seat);
  const mods = getModifiers(state, s.seat);
  let perTurn = gpFaithPerTurn(state, s);
  for (const c of s.cities) perTurn += computeCityStats(state, c, lux, mods).total.faith;
  let b = 0;
  if (fxOf(s.faith) > cost * FX) b -= fxConst(0.25);
  if (fxOf(perTurn) > fxConst(cost * 0.5)) b -= fxConst(0.25);
  return b;
}

/** THE YIELD WEIGHTS of a seat, raw 24.8 per YieldType (0x702ad0) */
export function yieldWeights(state: GameState, seat: number): Record<string, number> {
  const s = seatOf(state, seat);
  const w: Record<string, number> = Object.fromEntries(AI_YIELDS.map((y) => [y, 0]));
  if (!s) return w;
  // the Economic AI's gold boost (0x687bf0): a city-state's as its turn
  // stored it, written after its city update (`minorPhase`); a major's on
  // the net income its last gold step cached, its turn's later units and
  // their Maintenance unread (runs/h1_duelp1128: Rome's unit of its t89
  // start, Maintenance 5 -> 7, at -1.6 net from its t90 gold step;
  // city-states 2 and 4's route value K over its weights 6.37 from t90 as
  // logged); the Free Cities' none (runs/h1_duels1143 t209-212: their
  // treasury's cached net income -16, then -8, their Caravansaries 14.0
  // throughout, the value at no boost)
  const cs = state.cityStates.find((x) => x.seat === seat);
  w.YIELD_GOLD += cs ? cs.economy?.goldBoost ?? 0 : isCiv(seat) ? economicGoldBoost(s.netIncome ?? 0) : 0;
  if (isCiv(seat)) w.YIELD_FAITH += religiousFaithBoost(state, s);
  // the Yields lists
  for (const [y, v] of listSum(seat, s, 'Yields')) if (y in w) w[y] += v;
  // the sensitivity boost
  const sens = listSum(seat, s, 'YieldSensitivities');
  const others = state.seats.map((o) => o.seat).filter((o) => o !== seat && isCiv(o) && majorsMet(state, seat, o));
  for (const [y, sv] of sens) {
    if (!(y in w) || sv <= 0 || !others.length) continue;
    const xs = [seat, ...others].map((p) => yieldPerTurn(state, p, y));
    const n = xs.length;
    const max = Math.max(...xs);
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
    if (sd > 0 && xs[0] < max) w[y] += fmul(sv, fxConst((max - xs[0]) / sd));
  }
  return w;
}

/** THE PSEUDO-YIELD WEIGHTS of a seat, raw 24.8 per PseudoYieldType
 *  (0x700810); a pseudo-yield absent reads 0. `applied`: a read after the
 *  turn's strategy apply (the civics AI's government values), a
 *  city-state's STRATEGY_NAVAL list standing from the turn it starts */
export function pseudoYieldWeights(state: GameState, seat: number, applied = false): Map<string, number> {
  const out = new Map<string, number>();
  const s = seatOf(state, seat);
  if (!s) return out;
  const chronology = civEraIndex(s.research.techs, s.research.civics) + 1;
  out.set('PSEUDOYIELD_DISTRICT', (out.get('PSEUDOYIELD_DISTRICT') ?? 0) + fxConst(0.5 * chronology));
  // the grand strategy's turn (0x6fafc0 at 0x6fc880..0x6fd02c), per Great
  // Person class: a class the timeline holds no one of (IsClassAvailable
  // 0x2f7eb0: its offer exhausted), or one the player has earned its
  // MaxPlayerInstances of (0x2f30c0, the Prophet's 1), sets its pseudo-yield
  // to the floor (-1.0: its points valued at nothing)
  for (const [cls, pseudo] of Object.entries(AI_GP_CLASS_PSEUDOYIELD)) {
    const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
    if (GP_CLASSES.includes(c) && (gpOffer(state, c) === -2 || gpCapped(s, c))) out.set(pseudo, -FX);
  }
  // a city-state's military AI adds its Combat Desire to its
  // PSEUDOYIELD_UNIT_COMBAT weight, and its explorers' and naval scouts'
  // desire less what it holds, less 1.0, to PSEUDOYIELD_UNIT_EXPLORER and
  // PSEUDOYIELD_UNIT_NAVAL_COMBAT (0x71fb80, 0x7204c3..0x7205ae): a
  // city-state desires none and counts none (AI_Military.csv "0:0, 0:0" on
  // every city-state turn), so both read -1.0 — a Galley valued at its
  // Maintenance alone (runs/h1_duelv1117 Caguana t18 -4.14 at T 19)
  // The Free Cities' military AI writes theirs alike (`freeCombatDesire`;
  // AI_Military.csv's player 62 rows "0:0, 0:0")
  if (seat === FREE_SEAT) {
    out.set('PSEUDOYIELD_UNIT_COMBAT', s.combatDesire ?? 0);
    for (const p of ['PSEUDOYIELD_UNIT_EXPLORER', 'PSEUDOYIELD_UNIT_NAVAL_COMBAT']) out.set(p, Math.max(-FX, (out.get(p) ?? 0) - FX));
  }
  const cs = state.cityStates.find((c) => c.seat === seat);
  if (cs) {
    // the strategy it follows: STRATEGY_NAVAL's PseudoYields list under the
    // military AI's terms
    if (applied ? minorNavalApplied(cs) : minorNavalWeighted(cs)) for (const [p, pct] of Object.entries(NAVAL_STRATEGY_PSEUDOYIELDS)) out.set(p, (out.get(p) ?? 0) + fxConst(pct * 0.01));
    out.set('PSEUDOYIELD_UNIT_COMBAT', (out.get('PSEUDOYIELD_UNIT_COMBAT') ?? 0) + (cs.combatDesire ?? 0));
    for (const p of ['PSEUDOYIELD_UNIT_EXPLORER', 'PSEUDOYIELD_UNIT_NAVAL_COMBAT']) out.set(p, Math.max(-FX, (out.get(p) ?? 0) - FX));
    // LAB: a city-state values its Great General points at nothing — the
    // weight at its floor (-1.0), its writer unread: the Barracks', the
    // Stable's and the Encampment's General point of every city-state of
    // the five verbose duels (runs/h1_duelv1124 Granada t2's Encampment
    // 52.43 at T 23, every other class's points counting)
    out.set('PSEUDOYIELD_GPP_GENERAL', -FX);
  }
  // the military AI's PSEUDOYIELD_NUCLEAR_WEAPON weight as its last turn
  // wrote it (`nuclearDesire`), a city-state's and the Free Cities'
  if (s.nuclearDesire) out.set('PSEUDOYIELD_NUCLEAR_WEAPON', s.nuclearDesire);
  return out;
}
