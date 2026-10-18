/**
 * THE CITY-STATES' RESEARCH AND CIVICS VALUES AGAINST THE GAME'S: each
 * turn's analyses of every city-state (`researchAnalysis`, `civicAnalysis`)
 * on the record after the turn imported as it stands (the analysis runs on
 * the turn's banked Science and Culture), against AI_Research.csv's Tech
 * rows and AI_GovtPolicies.csv's Civic rows of the turn (the score and the
 * turns of every row the log prints).
 *
 *    npx vite-node cpu/harness/researchValueLab.ts -- <dump.jsonl> [--tree tech|civic] [--rows N] [--item TYPE]
 *
 * Reported per tree: the logged rows, the turns as the log's, the score
 * within 0.05, the score within 0.05 where the turns are the log's; per row
 * type, the same and the most common score difference where the turns agree
 * (a term the port lacks shows as one difference); --item prints that row's
 * lines.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { civicAnalysis, civicValue } from '../core/aiCivics';
import { researchAnalysis, techValue } from '../core/aiResearch';
import { pseudoYieldWeights } from '../core/aiWeights';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { computeCityStats } from '../core/city';
import { minorCity } from '../core/cityStates';
import { minorBuildFacts, minorKnownUnits, minorResearchTerms, minorResourceCounts } from '../core/minorBuild';
import { unitTable } from '../core/aiCityBuild';
import { loadCityBuildCentre } from './cityBuildLog';
import { AI_POLICIES } from '../../ai/major/tables';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const only = args.includes('--tree') ? args[args.indexOf('--tree') + 1] : null;
const nRows = args.includes('--rows') ? Number(args[args.indexOf('--rows') + 1]) : 25;
const item = args.includes('--item') ? args[args.indexOf('--item') + 1] : null;

/** `${turn}:${player}` -> row type -> [score, turns] */
function readLog(path: string, kind: 'Tech' | 'Civic'): Map<string, Map<string, [number, number]>> {
  const out = new Map<string, Map<string, [number, number]>>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const c = line.split(',').map((x) => x.trim());
    if (c[2] !== kind) continue;
    const k = `${c[0]}:${c[1]}`;
    const m = out.get(k) ?? (out.set(k, new Map()), out.get(k)!);
    m.set(c[3], [Number(c[4]), Number(kind === 'Tech' ? c[6] : c[5])]);
  }
  return out;
}

/** `${turn}:${player}` -> tech -> the Tech Contracts' values the log prints */
function readContracts(path: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const c = line.split(',').map((x) => x.trim());
    if (!c[2]?.startsWith('Tech Contract')) continue;
    const k = `${c[0]}:${c[1]}`;
    const m = out.get(k) ?? (out.set(k, new Map()), out.get(k)!);
    m.set(c[3], (m.get(c[3]) ?? 0) + Number(c[4]));
  }
  return out;
}

const logs = dump.replace(/\.jsonl$/, '.logs/');
const contracts = readContracts(logs + 'AI_Research.csv');
/** `${turn}:${player}` -> policy -> the score the log prints (above 0) */
const policyLog = new Map<string, Map<string, number>>();
for (const line of existsSync(logs + 'AI_GovtPolicies.csv') ? readFileSync(logs + 'AI_GovtPolicies.csv', 'utf8').split('\n') : []) {
  const c = line.split(',').map((x) => x.trim());
  if (c[2] !== 'Policies') continue;
  const k = `${c[0]}:${c[1]}`;
  (policyLog.get(k) ?? (policyLog.set(k, new Map()), policyLog.get(k)!)).set(c[3], Number(c[4]));
}
/** --logpolicies K: the civic's policy term on the logged scores of the turn plus K */
const logPolicies = args.includes('--logpolicies') ? Number(args[args.indexOf('--logpolicies') + 1]) : null;
const POLICIES_OF = new Map<string, string[]>();
for (const pol of AI_POLICIES) if (pol.civic) POLICIES_OF.set(pol.civic, [...POLICIES_OF.get(pol.civic) ?? [], pol.type]);
const techLog = readLog(logs + 'AI_Research.csv', 'Tech');
const civicLog = readLog(logs + 'AI_GovtPolicies.csv', 'Civic');
const cat = loadCatalog(dump);
/** --logunits K: the unit term on the city's logged UNITS table of the turn
 *  plus K (0 the turn, -1 the turn before) */
const logUnits = args.includes('--logunits') ? Number(args[args.indexOf('--logunits') + 1]) : null;
const centre = logUnits !== null ? loadCityBuildCentre(dump) : null;
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);

interface Tally { n: number; turns: number; score: number; scoreAtTurns: number; atTurns: number; diffs: Map<string, number> }
const newTally = (): Tally => ({ n: 0, turns: 0, score: 0, scoreAtTurns: 0, atTurns: 0, diffs: new Map() });
const total = { tech: newTally(), civic: newTally() };
/** a row researchable now (every prerequisite held): the log's score is its
 *  own value, against ours at the log's turns */
type OwnTree = 'tech' | 'civic' | 'major tech' | 'major civic';
const OWN_TREES: readonly OwnTree[] = ['tech', 'civic', 'major tech', 'major civic'];
const own = Object.fromEntries(OWN_TREES.map((t) => [t, newTally()])) as Record<OwnTree, Tally>;
const ownPer = Object.fromEntries(OWN_TREES.map((t) => [t, new Map<string, Tally>()])) as Record<OwnTree, Map<string, Tally>>;
const dumpOwn = args.includes('--own') ? Number(args[args.indexOf('--own') + 1]) : null;
function tallyOwn(tree: OwnTree, type: string, log: [number, number], raw: number, at = ''): void {
  // the civics' propagation counts a negative own value 0
  const ours = tree.endsWith('civic') ? Math.max(0, raw) : raw;
  if (dumpOwn !== null && Math.abs(log[0] - ours / 256 - dumpOwn) < 0.051) console.log(`OWN ${at} ${type} log ${log[0]} @${log[1]}`);
  const t = ownPer[tree].get(type) ?? (ownPer[tree].set(type, newTally()), ownPer[tree].get(type)!);
  for (const x of [own[tree], t]) {
    x.n += 1;
    x.atTurns += 1;
    if (Math.abs(ours / 256 - log[0]) < 0.051) x.scoreAtTurns += 1;
    else {
      const d = (log[0] - ours / 256).toFixed(1);
      x.diffs.set(d, (x.diffs.get(d) ?? 0) + 1);
    }
  }
}
const per = { tech: new Map<string, Tally>(), civic: new Map<string, Tally>() };

function tally(tree: 'tech' | 'civic', type: string, turn: number, player: number, log: [number, number], ours: { score: number; turns: number }): void {
  const t = per[tree].get(type) ?? (per[tree].set(type, newTally()), per[tree].get(type)!);
  const s = ours.score / 256;
  for (const x of [total[tree], t]) {
    x.n += 1;
    const tEq = ours.turns === log[1];
    if (tEq) x.turns += 1;
    if (Math.abs(s - log[0]) < 0.051) x.score += 1;
    if (tEq) {
      x.atTurns += 1;
      if (Math.abs(s - log[0]) < 0.051) x.scoreAtTurns += 1;
      else {
        const d = (log[0] - s).toFixed(1);
        x.diffs.set(d, (x.diffs.get(d) ?? 0) + 1);
      }
    }
  }
  if (item === type) console.log(`ROW t${turn} p${player} ${type} log ${log[0]} @${log[1]} ours ${s.toFixed(2)} @${ours.turns}`);
}

/** the policy term less the floor civicValue adds: max(best, 20) - 20 */
function policyTerm(key: string, civic: string): number {
  const scores = policyLog.get(key);
  let best = 0;
  for (const pol of POLICIES_OF.get(`CIVIC_${civic}`) ?? []) best = Math.max(best, scores?.get(pol) ?? 0);
  return Math.round((Math.max(best, 20) - 20) * 256);
}

const history = newHistory();
advanceHistory(history, recs[0], cat);
for (let i = 0; i + 1 < recs.length; i++) {
  const turn = recs[i].turn;
  const b = recs[i + 1];
  advanceHistory(history, b, cat);
  const imp = importTurn(b, cat, history);
  const state = imp.state;
  // the majors' own values (no city terms): the rows researchable now
  for (const s of state.seats) {
    const player = imp.playerOfSeat.get(s.seat);
    if (player === undefined || imp.minorOfPlayer.has(player)) continue;
    const key = `${turn}:${player}`;
    const pw = pseudoYieldWeights(state, s.seat, {});
    for (const [type, l] of only !== 'civic' ? techLog.get(key) ?? [] : []) {
      const id = type.slice(5);
      if (!TECHS[id] || s.research.techs.includes(id) || l[1] < 0 || !TECHS[id].prereqs.every((x) => s.research.techs.includes(x))) continue;
      tallyOwn('major tech', type, l, techValue(state, id, l[1], pw) + Math.round((contracts.get(key)?.get(type) ?? 0) * 256), `t${turn} p${player}`);
    }
    for (const [type, l] of only !== 'tech' ? civicLog.get(key) ?? [] : []) {
      const id = type.slice(6);
      if (!CIVICS[id] || s.research.civics.includes(id) || l[1] < 0 || !CIVICS[id].prereqs.every((x) => s.research.civics.includes(x))) continue;
      tallyOwn('major civic', type, l, civicValue(state, s.seat, id, l[1], pw)
        + (logPolicies === null ? 0 : policyTerm(`${turn + logPolicies}:${player}`, id)), `t${turn} p${player}`);
    }
  }
  for (const [player, cs] of imp.minorOfPlayer) {
    const y = computeCityStats(state, minorCity(cs)).total;
    const key = `${turn}:${player}`;
    const lu = centre?.get(`${turn + logUnits!}:${player}:${imp.dumpOfMinor.get(cs)?.name}`)?.UNITS;
    const loggedUnits = lu?.map((v) => Math.round(v * 256));
    if (only !== 'civic' && techLog.has(key)) {
      const logged = techLog.get(key)!;
      const terms = minorResearchTerms(state, cs, loggedUnits ?? unitTable(minorBuildFacts(state, cs, minorKnownUnits(cs))), minorResourceCounts(state, cs));
      for (const e of researchAnalysis(state, cs.seat, y.science, {}, terms.tech)) {
        const l = logged.get(`TECH_${e.tech}`);
        if (l && !e.owned) tally('tech', `TECH_${e.tech}`, turn, player, l, e);
        if (l && !e.owned && l[1] >= 0 && TECHS[e.tech].prereqs.every((x) => cs.research.techs.includes(x))) {
          tallyOwn('tech', `TECH_${e.tech}`, l, techValue(state, e.tech, l[1], pseudoYieldWeights(state, cs.seat, {})) + (l[1] <= 50 ? terms.tech(e.tech, l[1]) : 0)
            + Math.round((contracts.get(key)?.get(`TECH_${e.tech}`) ?? 0) * 256), `t${turn} p${player}`);
        }
      }
    }
    if (only !== 'tech' && civicLog.has(key)) {
      const logged = civicLog.get(key)!;
      const terms = minorResearchTerms(state, cs, loggedUnits ?? unitTable(minorBuildFacts(state, cs, minorKnownUnits(cs))), minorResourceCounts(state, cs));
      for (const e of civicAnalysis(state, cs.seat, y.culture, {}, terms.civic)) {
        const l = logged.get(`CIVIC_${e.civic}`);
        if (l && !e.owned) tally('civic', `CIVIC_${e.civic}`, turn, player, l, e);
        if (l && !e.owned && l[1] >= 0 && CIVICS[e.civic].prereqs.every((x) => cs.research.civics.includes(x))) {
          tallyOwn('civic', `CIVIC_${e.civic}`, l, civicValue(state, cs.seat, e.civic, l[1], pseudoYieldWeights(state, cs.seat, {})) + (l[1] < 50 ? terms.civic(e.civic, l[1]) : 0)
            + (logPolicies === null ? 0 : policyTerm(`${turn + logPolicies}:${player}`, e.civic)), `t${turn} p${player}`);
        }
      }
    }
  }
}

for (const tree of OWN_TREES) {
  const o = own[tree];
  console.log(`${tree.toUpperCase()} OWN VALUES (rows researchable now) ${o.scoreAtTurns} / ${o.n}`);
  for (const [type, x] of [...ownPer[tree]].sort((p, q) => (q[1].n - q[1].scoreAtTurns) - (p[1].n - p[1].scoreAtTurns)).slice(0, nRows)) {
    const top = [...x.diffs].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([d, n]) => `${d}x${n}`).join(' ');
    console.log(`   ${type.padEnd(36)} ${x.scoreAtTurns}/${x.n}  ${top}`);
  }
}
for (const tree of ['tech', 'civic'] as const) {
  const t = total[tree];
  console.log(`${tree.toUpperCase()} rows ${t.n} turns ${t.turns} score ${t.score} score where the turns agree ${t.scoreAtTurns} / ${t.atTurns}`);
  for (const [type, x] of [...per[tree]].sort((p, q) => (q[1].atTurns - q[1].scoreAtTurns) - (p[1].atTurns - p[1].scoreAtTurns)).slice(0, nRows)) {
    const top = [...x.diffs].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([d, n]) => `${d}x${n}`).join(' ');
    console.log(`   ${type.padEnd(36)} rows ${String(x.n).padStart(5)} turns ${String(x.turns).padStart(5)} score ${String(x.score).padStart(5)} atTurns ${x.scoreAtTurns}/${x.atTurns}  ${top}`);
  }
}
