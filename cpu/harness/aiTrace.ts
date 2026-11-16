/**
 * `--trace <kind>:<turn>[:<subject text>]` (run.ts, with `--aiscore`): for
 * each scored row of the kind (a trailing `*` globs), of the turn (`A` or
 * `A-B`) and whose subject holds the text, the row and OUR value's terms as
 * the engine summed them, on stderr, every line headed `TRACE`. The terms
 * come from the engine's own evaluation of that turn (`core/aiTrace.ts`,
 * set here and nowhere else) or, for a predicted blow, from the pass's
 * state as the row was read. Nothing is fed back: a run with `--trace`
 * scores the rows a run without it scores.
 *
 *   researchScore.*  the row's turns and next step; its own value (before
 *     and after the city's term and the favoured technology's 1.5), its
 *     modifiers' sum and each modifier's whole value, its base; then the
 *     score: base + contracts + each unowned prerequisite's base, a favored
 *     row 1.5 times. The game logs the score and the turns alone.
 *   civicScore.*     the same of a civic: own value (modifiers in it, each
 *     listed), the city's term (base less own), the lineage's bases, the
 *     favored 1.5, the contracts.
 *   policyScore.*    the card's modifiers, each with its whole value, and
 *     what the score holds beside their sum (an age's bonus; no score where
 *     its civic, age or era gate fails).
 *   danger, danger.major  per differing plot the row names (the first six):
 *     each unit whose danger lands on it (its strengths, whether by its
 *     reach or its range), each district's defence or strike, the player's
 *     own districts' cut, the plot's feature; and their sum against the row.
 *   plan.blow, plan.kills  the blow's kind (melee, ranged, bombard), both
 *     units' strengths as the composers give them (`meleeUnitStrengths`,
 *     `rangedUnitStrengths`) with the terms that are one call each (base,
 *     formation, wound, terrain, fortification, class matchup, the Great
 *     General's aura, the barbarian terms) and the rest in one number, the
 *     damage each way; the same of the blow back from the row's spot; a
 *     district's exchange whole (`predictDistrictExchange`).
 *   contracts*, cityState.build  the city AI's own trace lines of the turn
 *     for the player (`traceMinorAi`: each tree's tick, a cancelled build).
 *
 * Any other kind prints its row alone.
 */
import { setAiTrace, type AiTraceTerms } from '../core/aiTrace';
import { aiStrengths, featureDanger, type Pass, type PlanEntry } from '../core/tactical';
import { barbarianCombatCS, classMatchupCS, damageTakenExpected, defenderBase, generalAuraCS, meleeUnitStrengths, predictDistrictExchange,
  rangedUnitStrengths, terrainDefense, woundPenalty } from '../core/combat';
import { fortifyBonus, formationCS } from '../core/units';
import { traceMinorAi } from '../core/minorCityAi';
import type { AiModifier } from '../core/aiModifiers';
import type { GameState, Unit } from '../core/types';
import { gameTypeOf } from '../data/aliases';
import { AI_CIVIC_MODIFIERS, AI_POLICIES, AI_TECH_MODIFIERS } from '../data/aiTables';
import { traceScoredRows } from './aiScore';

/** what the trace reads of the replay */
export interface TraceWorld {
  W: number;
  turn(): number;
  state(): GameState;
  seatOf(player: number): number;
  playerOf(seat: number): number;
}

interface Spec { kind: string; from: number; to: number; text: string }

let specs: Spec[] = [];
let world: TraceWorld | null = null;
/** the engine's terms of the turn being played: `${topic}|${seat}|${key}` */
const terms = new Map<string, AiTraceTerms>();
/** per seat, per modifier list, its last evaluation of the turn */
const modifiers = new Map<number, Map<unknown, AiTraceTerms>>();
/** per seat its last danger map's contributions, with the turn it was built */
const danger = new Map<number, { turn: number; parts: { topic: string; t: AiTraceTerms }[] }>();
/** the city AI's lines by turn */
const cityLines = new Map<number, string[]>();
let held = -1;

const fx = (v: unknown) => (typeof v === 'number' ? String(Math.round((v / 256) * 1000) / 1000) : String(v));
const say = (line: string) => console.error(`TRACE ${line}`);
const kindFits = (s: Spec, kind: string) => (s.kind.endsWith('*') ? kind.startsWith(s.kind.slice(0, -1)) : kind === s.kind);
const TOPIC_KINDS: Record<string, RegExp> = {
  modifiers: /^(research|civic|policy)Score\./, research: /^researchScore\./, 'research.row': /^researchScore\./, civic: /^civicScore\./,
  'civic.row': /^civicScore\./, 'danger.open': /^danger/, 'danger.unit': /^danger/, 'danger.district': /^danger/,
};

/** `--trace` as given, each `<kind>:<turn>[:<text>]` */
export function traceSpecs(list: readonly string[]): void {
  specs = list.map((raw) => {
    const [kind, turns, ...rest] = raw.split(':');
    const m = /^(\d+)(?:-(\d+))?$/.exec(turns ?? '');
    if (!kind || !m) throw new Error(`--trace ${raw}: <kind>:<turn>[:<subject text>], the turn A or A-B`);
    return { kind, from: Number(m[1]), to: Number(m[2] ?? m[1]), text: rest.join(':') };
  });
}

/** the replay's world for the run's traces (null as it ends): the engine's
 *  sink and the city AI's lines are taken while a trace wants them */
export function traceWorld(w: TraceWorld | null): void {
  world = specs.length ? w : null;
  terms.clear();
  modifiers.clear();
  danger.clear();
  cityLines.clear();
  setAiTrace(world ? collect : null);
  traceScoredRows(world ? traceRow : null);
  if (world && specs.some((s) => /^(contracts|cityState\.build)/.test(s.kind))) {
    traceMinorAi((line) => {
      const t = world?.turn() ?? -1;
      if (specs.some((s) => t >= s.from && t <= s.to)) (cityLines.get(t) ?? (cityLines.set(t, []), cityLines.get(t)!)).push(line);
    });
  }
}

function collect(topic: string, seat: number, key: string, make: () => AiTraceTerms): void {
  if (!world) return;
  const t = world.turn();
  const fits = TOPIC_KINDS[topic];
  if (!fits || !specs.some((s) => fits.test(s.kind.replace(/\*$/, '.')) && t >= s.from - 1 && t <= s.to)) return;
  if (t !== held) {
    terms.clear();
    modifiers.clear();
    held = t;
  }
  if (topic === 'danger.open') {
    danger.set(seat, { turn: t, parts: [] });
    return;
  }
  const made = make();
  if (topic === 'modifiers') {
    let per = modifiers.get(seat);
    if (!per) modifiers.set(seat, (per = new Map()));
    per.set(made.mods, made);
  } else if (topic.startsWith('danger.')) danger.get(seat)?.parts.push({ topic, t: made.unit ? { ...made, unit: { ...(made.unit as Unit) } } : made });
  else terms.set(`${topic}|${seat}|${key}`, made);
}

/** a modifier list's values as the engine last summed them for the seat */
function modifierLines(seat: number, mods: readonly AiModifier[] | undefined): string[] {
  if (!mods?.length) return ['  modifiers: none'];
  const got = modifiers.get(seat)?.get(mods);
  if (!got) return [`  modifiers: ${mods.length}, not summed for the player this turn`];
  const values = got.values as number[];
  return [`  modifiers from turn ${got.start} to ${got.horizon}: sum ${fx(got.sum)}`,
    ...mods.map((m, i) => `    ${values[i]} ${m.id} ${m.effect} ${JSON.stringify(m.args)}`)];
}

function scoreLines(tree: 'research' | 'civic', seat: number, id: string): string[] {
  const own = terms.get(`${tree}|${seat}|${id}`);
  const row = terms.get(`${tree}.row|${seat}|${id}`);
  if (!row) return ['  no analysis of the row by the player this turn'];
  const out: string[] = [];
  const pre = (row.prerequisites ?? row.lineage ?? []) as [string, number][];
  const contracts = (row.contracts ?? []) as number[];
  if (own) {
    out.push(tree === 'research'
      ? `  turns ${own.turns} next ${own.next}; own ${fx(own.own)}, with the city's term${own.favTech ? ' and the favoured technology x1.5' : ''} ${fx(own.withCityAndFavTech)}; modifiers ${fx(own.modifiers)}; base ${fx(own.base)}`
      : `  turns ${own.turns} next ${own.next}; own (its modifiers in it) ${fx(own.own)}, the city's term ${fx((own.base as number) - (own.own as number))}; base ${fx(own.base)}`);
  } else out.push(`  turns ${row.turns}; base ${fx(row.base)} (owned or out of reach: no value)`);
  const sum = tree === 'research' ? (row.base as number) + contracts.reduce((a, b) => a + b, 0) + pre.reduce((a, [, v]) => a + v, 0) : pre.reduce((a, [, v]) => a + v, 0);
  out.push(`  score ${fx(row.score)} = ${tree === 'research' ? `base ${fx(row.base)} + contracts [${contracts.map(fx).join(', ')}] + prerequisites` : 'the lineage\'s bases'}`
    + ` [${pre.map(([p, v]) => `${p} ${fx(v)}`).join(', ')}]${row.favored ? ', favored x1.5' : ''}${tree === 'civic' ? ` + contracts [${contracts.map(fx).join(', ')}]` : ''}`
    + ` (the terms sum to ${fx(sum)} before the favored factor)`);
  const table = tree === 'research' ? AI_TECH_MODIFIERS[gameTypeOf('tech', id, 'TECH_')] : AI_CIVIC_MODIFIERS[gameTypeOf('civic', id, 'CIVIC_')];
  out.push(...modifierLines(seat, table));
  return out;
}

function policyLines(seat: number, type: string, ours: unknown): string[] {
  const p = AI_POLICIES.find((x) => x.type === type);
  if (!p) return [`  no policy ${type}`];
  const got = modifiers.get(seat)?.get(p.modifiers);
  const beside = got && typeof ours === 'number' ? ` score ${ours} less the modifiers' ${fx(got.sum)}: ${Math.round((ours - (got.sum as number) / 256) * 1000) / 1000}` : '';
  return [`  civic ${p.civic ?? '-'} slot ${p.slot}${p.darkAge ? ' dark age' : ''}${p.goldenAge ? ' golden age' : ''} eras ${p.minEra}..${p.maxEra};${beside}`,
    ...modifierLines(seat, p.modifiers)];
}

function dangerLines(seat: number, turn: number, ours: string): string[] {
  const w = world!;
  const build = danger.get(seat);
  if (!build) return ['  no danger map built by the engine for the player in the run so far'];
  const xy = (p: number) => `${p % w.W}:${Math.floor(p / w.W)}`;
  const out = [`  the engine's last map of the player, built at turn ${build.turn}${build.turn === turn ? '' : ' (not this turn: the sums may differ)'}`];
  const state = w.state();
  const plots = [...ours.matchAll(/(\d+):(\d+) (-?\d+)\/(-?\d+)/g)].slice(0, 6);
  for (const m of plots) {
    const p = Number(m[1]) + Number(m[2]) * w.W;
    let sum = 0;
    let zeroed = false;
    const cuts: number[] = [];
    out.push(`  plot ${m[1]}:${m[2]}: ours ${m[3]}, the game's ${m[4]}`);
    for (const { topic, t } of build.parts) {
      if (topic === 'danger.unit') {
        const u = t.unit as Unit;
        const st = t.strengths as { melee: number; ranged: number; bombard: number };
        const n = ((t.reach as number[]).includes(p) ? 1 : 0) + ((t.range as number[]).includes(p) ? 1 : 0);
        if (!n) continue;
        sum += n * (t.danger as number);
        out.push(`    +${t.danger}${n > 1 ? ' x2' : ''} ${u.type} p${w.playerOf(u.seat)} at ${xy(u.tileIndex)} (melee ${st.melee} ranged ${st.ranged} bombard ${st.bombard}; hp ${u.hp}${u.embarked ? ', embarked' : ''})`
          + ` by its ${(t.reach as number[]).includes(p) ? 'reach' : ''}${n > 1 ? ' and ' : ''}${(t.range as number[]).includes(p) ? 'range' : ''}`);
      } else if (t.own) {
        if (t.plot === p && (t.def as number) > 0) zeroed = true;
        else if ((t.around as number[]).includes(p) && t.plot !== p) cuts.push(t.strike as number);
      } else if (t.plot === p && (t.def as number) > 0) {
        sum += t.def as number;
        out.push(`    +${t.def} the defence of p${w.playerOf(t.owner as number)}'s district on it`);
      } else if ((t.around as number[]).includes(p) && t.plot !== p) {
        const v = (t.strike as number) > 0 ? t.strike as number : 1;
        sum += v;
        out.push(`    +${v} p${w.playerOf(t.owner as number)}'s district at ${xy(t.plot as number)} (${(t.strike as number) > 0 ? 'its strike' : 'beside it'})`);
      }
    }
    if (zeroed) { out.push('    the player\'s own defended district: 0'); sum = 0; }
    for (const c of cuts) if (sum > 0) { out.push(`    -${c} under the player's own district's strike, to 1 at least`); sum = sum - c > 1 ? sum - c : 1; }
    const f = state.map.tiles[p]?.feature;
    if (f && featureDanger(f)) { sum += featureDanger(f); out.push(`    +${featureDanger(f)} the feature ${f}`); }
    out.push(`    = ${sum}${String(sum) === m[3] ? '' : ` (the row holds ${m[3]}: this map is not the one the row read)`}`);
  }
  return out;
}

/** a scored row, traced where a spec names it (`scoreDecision`) */
function traceRow(kind: string, turn: number, subject: string, equal: boolean, ours: unknown, game: unknown): void {
  if (!world || kind === 'plan.blow' || kind === 'plan.kills') return;
  if (!specs.some((s) => kindFits(s, kind) && turn >= s.from && turn <= s.to && subject.includes(s.text))) return;
  const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '');
  say(`${kind} t${turn} ${subject} ${equal ? '=' : 'X'} ${text(ours)} // ${text(game)}`);
  const m = /^p(\d+)(?: (\S+))?/.exec(subject);
  const seat = m ? world.seatOf(Number(m[1])) : -1;
  let lines: string[] = [];
  if (/^researchScore\./.test(kind) && m?.[2]) lines = scoreLines('research', seat, m[2]);
  else if (/^civicScore\./.test(kind) && m?.[2]) lines = scoreLines('civic', seat, m[2]);
  else if (/^policyScore\./.test(kind) && m?.[2]) lines = policyLines(seat, m[2], ours);
  else if (/^danger/.test(kind)) lines = dangerLines(seat, turn, text(ours));
  else if (/^(contracts|cityState\.build)/.test(kind)) {
    const name = world.state().cityStates.find((c) => c.seat === seat)?.name;
    const mine = name ? (cityLines.get(turn) ?? []).filter((l) => l.includes(` ${name} `)) : [];
    lines = mine.length ? mine.map((l) => `  ${l}`) : [name ? '  the city AI traced no line for the player this turn' : '  no city-state: no city AI lines'];
  }
  for (const l of lines) say(l);
}

/** a unit's strength in a blow, the terms that are one call each and the rest */
function strengthLine(state: GameState, who: string, me: Unit, foe: Unit, tile: number, total: number, base: number, defending: boolean): string {
  const parts: [string, number][] = [['base', base], ['formation', formationCS(me)], ['wound', -woundPenalty(me)],
    ['class matchup', classMatchupCS(me.type, foe.type)], ['general', generalAuraCS(state, me, tile)], ['barbarian terms', barbarianCombatCS(state, me.seat, foe.seat)]];
  if (defending) parts.push(['terrain', terrainDefense(state.map.tiles[tile])], ['fortified', fortifyBonus(me)]);
  const known = parts.reduce((a, [, v]) => a + v, 0);
  return `    ${who} ${me.type} hp ${me.hp}: ${total} = ${parts.filter(([, v]) => v).map(([n, v]) => `${n} ${v}`).join(', ')}`
    + `, the rest ${Math.round((total - known) * 1000) / 1000} (${defending ? 'support' : 'flanking, river'}, promotions, abilities, religion, emergencies, roster, government, congress)`;
}

function blowLines(state: GameState, label: string, attacker: Unit, defender: Unit, at: number, stands: number): string[] {
  const st = aiStrengths(state, attacker);
  const base = defenderBase(state, defender);
  const kind = st.ranged > st.melee || st.bombard > st.melee ? (st.bombard > st.melee && st.bombard >= st.ranged ? 'bombard' : 'ranged') : 'melee';
  const out = [`  ${label}: ${kind} (the attacker's strengths as the AI reads them: melee ${st.melee} ranged ${st.ranged} bombard ${st.bombard})`];
  if (kind !== 'melee') {
    const s = rangedUnitStrengths(state, attacker, at, defender);
    out.push(strengthLine(state, 'attacker', attacker, defender, attacker.tileIndex, s.atk, (st.ranged || st.bombard) - formationCS(attacker), false),
      strengthLine(state, 'defender', defender, attacker, at, s.def, base, true),
      `    dealt ${damageTakenExpected(base, s.def, s.atk)} of the defender's ${defender.hp} (base ${base}); taken 0`);
    return out;
  }
  const s = meleeUnitStrengths(state, attacker, at, defender, stands);
  out.push(strengthLine(state, 'attacker', attacker, defender, attacker.tileIndex, s.atk, s.atkBase, false),
    strengthLine(state, 'defender', defender, attacker, at, s.def, base, true),
    `    dealt ${damageTakenExpected(base, s.def, s.atk)} of the defender's ${defender.hp} (base ${base}); taken ${defender.embarked ? 0 : damageTakenExpected(s.atkBase, s.atk, s.def)}`
    + ` of the attacker's ${attacker.hp} (before the exchange's cap where both would die)`);
  return out;
}

/** the rows a tactical pass read as it opened (`readPass`), its predicted
 *  blows traced on the pass's own state */
export function tracePassRows(rows: readonly { kind: string; subject: string; equal: boolean; ours: string; game: string }[], turn: number,
  state: GameState, pass: Pass, w: { W: number; keyOf(u: Unit): string | undefined; playerOf(seat: number): number }): void {
  if (!world) return;
  for (const r of rows) {
    if (r.kind !== 'plan.blow' && r.kind !== 'plan.kills') continue;
    if (!specs.some((s) => kindFits(s, r.kind) && turn >= s.from && turn <= s.to && r.subject.includes(s.text))) continue;
    say(`${r.kind} t${turn} ${r.subject} ${r.equal ? '=' : 'X'} ${r.ours} // ${r.game}`);
    const m = /^p(\d+) u(\d+) \S+ > ([A-Z_]+)@(\d+):(\d+)\S*(?: from (\d+):(\d+))?/.exec(r.subject);
    const unit = m && state.units.find((u) => u.seat === pass.seat && w.keyOf(u) === `${m[1]}:${m[2]}`);
    const tile = m ? Number(m[4]) + Number(m[5]) * w.W : -1;
    const E: PlanEntry | undefined = unit ? pass.plan.get(unit.id)?.entries.find((e) => e.target.tile === tile && e.target.type === m![3]) : undefined;
    if (!unit || !E) { say('  the unit or its planning entry is not in the pass'); continue; }
    say(`  ours: dealt ${E.dealt} taken ${E.taken} kills ${E.kills}; spots ${E.spots.map((s) => `${s.tile % w.W}:${Math.floor(s.tile / w.W)}/t${s.turns} back dealt ${s.backDealt} taken ${s.backTaken}`).join('; ')}`);
    const v = E.target.unit;
    if (!v) {
      if (E.target.type === 'COMBAT_DISTRICT') say(`  the district's exchange: ${JSON.stringify(predictDistrictExchange(state, unit, tile))}`);
      else say('  the entry names no unit: no blow to break down');
      continue;
    }
    for (const l of blowLines(state, 'the blow', unit, v, v.tileIndex, v.tileIndex)) say(l);
    if (m![6] === undefined) continue;
    // the blow back on the unit set on the spot, as the planning takes it
    const spot = Number(m![6]) + Number(m![7]) * w.W;
    const at = unit.tileIndex;
    unit.tileIndex = spot;
    try {
      for (const l of blowLines(state, `the blow back on it at ${m![6]}:${m![7]}`, v, unit, spot, at)) say(l);
    } finally {
      unit.tileIndex = at;
    }
  }
}
