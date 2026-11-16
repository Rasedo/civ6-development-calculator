/**
 * THE AI'S DECISIONS SCORED one by one against the game's: per decision kind
 * (a city-state's build, a research choice, a unit's move, ...) the
 * decisions compared, those equal to the game's, and the first that was not
 * (its turn, its subject — a city, a unit, a player — ours and the game's).
 * The action replay fills it (`replay.ts`) in both its modes: the free run
 * and the per-turn AI score (`--aiscore`), where each pair starts from the
 * record's world.
 */

/** one decision kind's score */
export interface KindScore {
  compared: number;
  equal: number;
  first?: { turn: number; subject: string; ours: unknown; game: unknown };
  /** the same over the decisions whose player's memory, as the turn opened,
   *  agreed with the game's logs (`aiMemory.ts`) */
  clean?: { compared: number; equal: number; first?: KindScore['first'] };
}

export type DecisionScores = Record<string, KindScore>;

/** what each kind compares, for the tables */
export const KIND_NOTES: Record<string, string> = {
  'cityState.build': 'item in hand after its turn vs record t+1\'s queue head',
  'freeCities.build': 'a Free City\'s queue head after its turn vs record t+1\'s',
  'research.minor': 'research after its turn vs record t+1\'s (a choice made or the record\'s changed)',
  'research.minor.log': 'the same choice vs AI_Research.csv\'s RESEARCHING row',
  'research.free': 'the Free Cities\' research vs record t+1\'s',
  'research.free.log': 'the same vs AI_Research.csv',
  'civic.minor': 'civic after its turn vs record t+1\'s',
  'civic.free': 'the Free Cities\' civic vs record t+1\'s',
  'researchScore.minor': 'each tech row\'s score vs AI_Research.csv (within 0.05)',
  'researchScore.free': 'the same, the Free Cities',
  'civicScore.minor': 'each civic row\'s score vs AI_GovtPolicies.csv (within 0.05)',
  'civicScore.free': 'the same, the Free Cities',
  'policyScore.minor': 'each card\'s policy score vs AI_GovtPolicies.csv\'s Policies rows (within 0.05; ours above 0 unlogged a miss)',
  'policyScore.free': 'the same, the Free Cities',
  'builder.improve': 'an improvement a minor\'s Builder laid vs the record\'s (minorAi:improve)',
  'unit.trained': 'a unit a minor\'s city made vs record t+1\'s new units (minorAi:unitNew, minorAi:unit)',
  'unit.bought': 'a unit a minor bought vs the record\'s purchase (minorAi:buy)',
  'unit.promote': 'a minor unit\'s promotion vs the record\'s (minorAi:promote)',
  'unit.upgrade': 'a minor\'s military AI upgrade (minorMilitaryUpgrade) vs the one its log orders before its turn opens',
  'op.start.cityState': 'the operations a city-state started in its turn vs AI_Operation.csv\'s Started lines',
  'op.start.freeCities': 'the same, the Free Cities',
  'op.start.barbarians': 'the same, the barbarians',
  'cityState.move.family': 'a unit\'s move vs AI_Tactical.csv\'s first row of the turn',
  'cityState.move.plot': 'its end plot vs record t+1\'s',
  'freeCities.move.family': 'the same, the Free Cities',
  'freeCities.move.plot': 'the same, the Free Cities',
  'barb.move.family': 'a barbarian unit\'s move vs AI_Tactical.csv',
  'barb.move.plot': 'its end plot vs record t+1\'s',
  'cityState.fortify': 'a unit\'s fortification after its pass (the Fortify order) vs record t+1\'s, on the record\'s plot',
  'freeCities.fortify': 'the same, the Free Cities',
  'barb.fortify': 'the same, the barbarians',
  'barb.unit': 'a unit a camp raised vs record t+1\'s new barbarian units (barb:unitNew, barb:unit)',
  'trade.route.minor': 'the destination a city-state\'s Trader takes (minorRouteCandidate) vs record t+1\'s new route',
};

/** what each kind of the game's intermediate state compares (`aiUnits.ts`) */
export const STATE_NOTES: Record<string, string> = {
  'plan.unit': 'per unit either side plans as the tactical pass opens: both hold a planning',
  'plan.input': 'per unit both plan: its plot, Movement left, damage and embarked flag vs the game\'s unit row at its tactical step',
  'plan.aiType': 'a military unit\'s AI type as the pass\'s own moves take it, its operations run (EXPLORE 2, COMBAT 3, DEFENDER 4) vs the game\'s unit row at its pass',
  'plan.reach': 'its planning\'s reach, the plots with their turns',
  'plan.reach.moves': 'the Movement left on each reach plot (the plots and turns equal)',
  'plan.reach.order': 'the reach list\'s order (the plots, turns and Movement equal)',
  'plan.targets': 'the targets its planning holds, of the entries both target lists hold: type, plot, owner, unit type',
  'plan.spots': 'per target both plannings hold: the spots with their turns, in order',
  'plan.kills': 'per target both hold a spot of: whether its blow kills (the entry\'s kill flag)',
  'plan.blow': 'per spot both hold: the blow dealt / taken and the blow back dealt / taken',
  'targets': 'the player\'s tactical target list: type, plot, owner, unit type',
  'targets.order': 'the list\'s order (the entries equal)',
  'kb.cities': 'per city either knowledge base holds (ours the one the operations read, `knownCities`): owner, population, capital flags, each defensible district\'s defense / walls / strike',
  'kb.cities.list': 'a city-state\'s list of the cities it knows (`citiesKnown`): its members',
  'kb.cities.list.order': 'that list\'s order (the members equal)',
  'unit.table': 'a city-state\'s unit production table: each entry\'s value (the engine\'s at its military AI\'s upgrade step, the game\'s at its end look)',
  'unit.table.held': 'the units held per entry both tables list',
};

export function newScores(): DecisionScores {
  return {};
}

/** a decision scored; `clean` whether its player's memory was clean as the
 *  turn opened (undefined for a player whose memory is not compared) */
const ROWS = new Set((process.env.AISCORE_ROWS ?? '').split(',').filter(Boolean));
const MISSES = process.env.AISCORE_MISSES === '1';

export function scoreDecision(s: DecisionScores, kind: string, turn: number, subject: string, equal: boolean,
  ours: unknown, game: unknown, clean?: boolean): void {
  const k = (s[kind] ??= { compared: 0, equal: 0 });
  // AISCORE_ROWS=<kind>,<kind>: every row of those kinds, one line each;
  // AISCORE_MISSES=1: every missed row of every kind (`c` marks a clean memory)
  if (ROWS.has(kind) || (MISSES && !equal)) {
    console.error(`SCORE ${kind} t${turn} ${subject} ${equal ? '=' : 'X'}${clean ? 'c' : ''} ${whole(ours)} // ${whole(game)}`);
  }
  const take = (x: { compared: number; equal: number; first?: KindScore['first'] }) => {
    x.compared += 1;
    if (equal) x.equal += 1;
    else x.first ??= { turn, subject, ours, game };
  };
  take(k);
  if (clean) take((k.clean ??= { compared: 0, equal: 0 }));
}

const whole = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '');
const cut = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '').slice(0, 90).replace(/\|/g, '/');
const pct = (k?: { compared: number; equal: number }) => (k?.compared ? `${((100 * k.equal) / k.compared).toFixed(1)}%` : '-');
const firstOf = (f?: KindScore['first']) => {
  if (!f) return '-';
  return `t${f.turn} ${cut(f.subject)}: ${cut(f.ours)}${f.game === undefined ? '' : ` / ${cut(f.game)}`}`;
};

/** the score table as Markdown rows, the kinds in `KIND_NOTES` order then
 *  any other: over every decision, and over those whose memory was clean */
export function scoreTable(s: DecisionScores): string[] {
  const kinds = [...Object.keys(KIND_NOTES).filter((k) => s[k]), ...Object.keys(s).filter((k) => !(k in KIND_NOTES)).sort()];
  const out = ['| decision | compared | equal | % | first mismatch (turn, subject: ours / game) | memory clean: compared | equal | % | first mismatch |',
    '|---|---:|---:|---:|---|---:|---:|---:|---|'];
  for (const k of kinds) {
    const x = s[k];
    const c = x.clean;
    out.push(`| ${k} | ${x.compared} | ${x.equal} | ${pct(x)} | ${firstOf(x.first)} | ${c?.compared ?? '-'} | ${c?.equal ?? '-'} | ${pct(c)} | ${firstOf(c?.first)} |`);
  }
  return out;
}

/** the memory agreement table: per memory kind the player-turns compared,
 *  those whose memory equals the logs', the first that did not */
export function memoryTable(s: DecisionScores): string[] {
  const out = ['| memory | player-turns | equal to the game\'s | % | first differing (turn, player: ours / game) |', '|---|---:|---:|---:|---|'];
  for (const [k, x] of Object.entries(s)) out.push(`| ${k} | ${x.compared} | ${x.equal} | ${pct(x)} | ${firstOf(x.first)} |`);
  return out;
}

/** the game's intermediate state against ours (`aiUnits.ts`), apart from the
 *  decisions and the memory: per kind the rows compared, those equal, the
 *  first that was not; then what was left out of the comparison, by reason.
 *  Empty for a recording with no unit stream beside it. */
export function stateTable(s: DecisionScores | undefined, leftOut?: Record<string, number>): string[] {
  if (!s || !Object.keys(s).length) return [];
  const out = ['| the game\'s intermediate state | compared | equal to the game\'s | % | missed | first differing (turn, subject: ours / game) |',
    '|---|---:|---:|---:|---:|---|'];
  const kinds = [...Object.keys(STATE_NOTES).filter((k) => s[k]), ...Object.keys(s).filter((k) => !(k in STATE_NOTES)).sort()];
  for (const k of kinds) {
    const x = s[k];
    out.push(`| ${k} | ${x.compared} | ${x.equal} | ${pct(x)} | ${x.compared - x.equal} | ${firstOf(x.first)} |`);
  }
  const left = Object.entries(leftOut ?? {});
  if (left.length) out.push('', 'Not compared:', ...left.map(([why, n]) => `- ${n}: ${why}`));
  return out;
}

/** several seeds' counts of what was left out, summed by reason */
export function sumLeftOut(seeds: (Record<string, number> | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of seeds) for (const [why, n] of Object.entries(s ?? {})) out[why] = (out[why] ?? 0) + n;
  return out;
}

/** one seed's per-turn AI score as Markdown */
export function aiScoreMarkdown(r: { dump: string; turns: number[]; stopped?: string; scores: DecisionScores; memory: DecisionScores;
  state?: DecisionScores; stateLeftOut?: Record<string, number> }, pairs: number): string {
  const state = stateTable(r.state, r.stateLeftOut);
  const out = [`# Per-turn AI score: ${r.dump}`, '',
    `${pairs} pairs, turns ${r.turns.join('-')}${r.stopped ? `; stopped: ${r.stopped}` : ''}. Each pair starts from record t as the importer`,
    'reads it, the AI\'s memory carried from our own turn before; the city-states\', Free Cities\' and barbarians\' AI plays',
    'turn t, the majors\' actions the record\'s; each decision against the game\'s logs of turn t and record t+1. "Memory clean":',
    'the decisions of a minor or barbarian player whose carried memory, at the end of its turn before, equalled every kind',
    'the game\'s logs show of it (the memory table below).', '',
    ...scoreTable(r.scores), '', '## The AI\'s memory against the game\'s (its own memory beside the recording, else its logs)', '', ...memoryTable(r.memory),
    ...(state.length ? ['', '## The game\'s intermediate state against ours (the recording\'s unit stream; compared only, never fed to the engine)', '', ...state] : []),
    '', '## What each kind compares', '',
    ...Object.entries(KIND_NOTES).map(([k, v]) => `- ${k}: ${v}`),
    ...(state.length ? Object.entries(STATE_NOTES).map(([k, v]) => `- ${k}: ${v}`) : [])];
  const none = unscored(r.scores);
  if (none.length) out.push('', `No decision compared: ${none.join(', ')}.`);
  return out.join('\n') + '\n';
}

/** the kinds no pair compared, for the report */
export function unscored(s: DecisionScores): string[] {
  return Object.keys(KIND_NOTES).filter((k) => !s[k]);
}

/** several seeds' scores summed, each kind's first mismatch the earliest
 *  turn's (its seed named in the subject) */
export function sumScores(seeds: { seed: string; scores: DecisionScores }[]): DecisionScores {
  const out: DecisionScores = {};
  for (const { seed, scores } of seeds) {
    for (const [k, x] of Object.entries(scores)) {
      const t = (out[k] ??= { compared: 0, equal: 0 });
      const add = (to: { compared: number; equal: number; first?: KindScore['first'] }, from: { compared: number; equal: number; first?: KindScore['first'] }) => {
        to.compared += from.compared;
        to.equal += from.equal;
        if (from.first && (!to.first || from.first.turn < to.first.turn)) to.first = { ...from.first, subject: `${seed} ${from.first.subject}` };
      };
      add(t, x);
      if (x.clean) add((t.clean ??= { compared: 0, equal: 0 }), x.clean);
    }
  }
  return out;
}
