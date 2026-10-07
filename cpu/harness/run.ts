/**
 * THE REPORT for one autoplayed game: every state check on every recorded
 * turn, every transition check on every consecutive pair, and the importer's
 * roster gaps.
 *
 *   npx vite-node cpu/harness/run.ts -- <dump.jsonl> [--out <report.json>] [--from T] [--to T]
 *   npx vite-node cpu/harness/run.ts -- <dump.jsonl> --replay <replay.json> [--from T] [--to T]
 *
 * Writes `<dump>.report.json` (or `--out`) and its Markdown digest
 * (`.report.md`): per check the counts (pass, fail, skip by reason, and how
 * many failures carry an importer gap), every DISTINCT failure — the same
 * subject failing with the same numbers and the same importer gaps is one row
 * with its first and last turn and its count — and the gap table; and prints
 * the per-check table. A record whose counter moved during its dump is not
 * read. `--replay` runs the action replay instead (`replay.ts`): the engine
 * free from the first record on the recorded decisions, its report and
 * Markdown summary written to the named file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Catalog, TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory, routeLegs } from './import';
import { replayEvents } from './eventReplay';
import { stateChecks, transitionChecks, type CheckResult, type StartReplay } from './checks';
import { loadRandLog, randLogPath } from './randLog';
import { streamLedger, turnDraws, type DrawLedger } from './drawLedger';
import { rngHolds } from '../core/rand';
import { replayMarkdown, runReplay } from './replay';

interface Tally {
  pass: number;
  fail: number;
  failGapped: number;
  skip: Record<string, number>;
}

interface Failure {
  check: string;
  subject: string;
  game: unknown;
  ours: unknown;
  gaps?: string[];
  firstTurn: number;
  lastTurn: number;
  count: number;
  state?: Record<string, unknown>;
}

function args(argv: string[]) {
  const pos: string[] = [];
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') continue;
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

export function runReport(dumpPath: string, from = -Infinity, to = Infinity) {
  const catPath = dumpPath.replace(/\.jsonl$/, '.cat.json');
  if (!existsSync(catPath)) throw new Error(`no catalog beside the dump: ${catPath}`);
  const cat = JSON.parse(readFileSync(catPath, 'utf8')) as Catalog;
  // each record kept as its line and parsed when read: the walk below holds
  // three records at a time, not the whole game
  const lines = new Map<number, string>();
  for (const line of readFileSync(dumpPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as TurnRecord;
    if (rec.moved || rec.turn < from || rec.turn > to) continue;
    lines.set(rec.turn, line);
  }
  const turns = [...lines.keys()].sort((a, b) => a - b);
  const window = new Map<number, TurnRecord>();
  const byTurn = {
    get(t: number): TurnRecord | undefined {
      let rec = window.get(t);
      if (rec) return rec;
      const line = lines.get(t);
      if (line === undefined) return undefined;
      rec = JSON.parse(line) as TurnRecord;
      window.set(t, rec);
      for (const k of window.keys()) if (k < t - 1 || k > t + 1) window.delete(k);
      return rec;
    },
  };
  const tallies = new Map<string, Tally>();
  const failures = new Map<string, Failure>();
  const gaps = new Map<string, number>();
  const history = newHistory();
  // the game's own draw log, where the recording kept it: its game is the one
  // whose chain holds the records' witness seeds
  const all = turns.map((t) => JSON.parse(lines.get(t)!) as TurnRecord);
  const logPath = randLogPath(dumpPath);
  if (logPath) {
    const seeds: number[] = [];
    for (const r of all) for (const w of r.witness ?? []) if (typeof w.seed === 'number') seeds.push(w.seed);
    history.randLog = loadRandLog(logPath, seeds);
  }
  history.replay = replayEvents(all, cat, history.randLog);
  history.legs = routeLegs(all);
  all.length = 0;
  const starts: StartReplay[] = [];
  const add = (r: CheckResult) => {
    const t = tallies.get(r.check) ?? { pass: 0, fail: 0, failGapped: 0, skip: {} };
    tallies.set(r.check, t);
    if (r.skip) {
      t.skip[r.skip] = (t.skip[r.skip] ?? 0) + 1;
      return;
    }
    if (r.ok) {
      t.pass++;
      return;
    }
    t.fail++;
    if (r.gaps?.length) t.failGapped++;
    const key = `${r.check}|${r.subject}|${JSON.stringify(r.game)}|${JSON.stringify(r.ours)}|${JSON.stringify(r.gaps ?? [])}`;
    const f = failures.get(key);
    if (f) {
      f.lastTurn = r.turn;
      f.count++;
    } else {
      failures.set(key, { check: r.check, subject: r.subject, game: r.game, ours: r.ours, gaps: r.gaps,
        firstTurn: r.turn, lastTurn: r.turn, count: 1, state: r.state });
    }
  };
  for (const t of turns) {
    const rec = byTurn.get(t)!;
    advanceHistory(history, rec, cat);
    const imp = importTurn(rec, cat, history);
    for (const [g, n] of imp.gaps) gaps.set(g, Math.max(gaps.get(g) ?? 0, n));
    for (const r of stateChecks(rec, cat, imp, starts)) add(r);
    const next = byTurn.get(t + 1);
    if (next) for (const r of transitionChecks(rec, next, cat, history, byTurn.get(t - 1))) add(r);
  }
  let draws: DrawLedger | undefined;
  if (history.randLog) {
    const td = turnDraws(starts, history.replay, history.randLog);
    for (const r of td.results) add(r);
    draws = td.ledger;
  }
  return {
    dump: dumpPath,
    turns: turns.length ? [turns[0], turns[turns.length - 1]] : [],
    records: turns.length,
    ...(draws ? { draws } : {}),
    checks: Object.fromEntries([...tallies].sort(([a], [b]) => a.localeCompare(b))),
    gaps: Object.fromEntries([...gaps].sort(([a], [b]) => a.localeCompare(b))),
    failures: [...failures.values()].sort((a, b) => a.check.localeCompare(b.check) || b.count - a.count),
  };
}

/** The report as Markdown: the check table, the gap table, and per check the
 *  most frequent failures on subjects the importer carried whole. */
function markdown(report: ReturnType<typeof runReport>, perCheck = 5): string {
  const out: string[] = [`# H-1 report: ${report.dump}`, '',
    `${report.records} records, turns ${report.turns.join('-')}.`, '',
    '| check | pass | fail | fail with an importer gap | skipped |', '|---|---:|---:|---:|---|'];
  for (const [k, t] of Object.entries(report.checks)) {
    const skips = Object.entries(t.skip).map(([r, n]) => `${r} ${n}`).join(', ');
    out.push(`| ${k} | ${t.pass} | ${t.fail} | ${t.failGapped} | ${skips} |`);
  }
  out.push('', '## Importer gaps (most rows dropped or mapped in one record)', '');
  for (const [g, n] of Object.entries(report.gaps)) out.push(`- ${g}: ${n}`);
  out.push('', '## Failures with no importer gap on the subject', '');
  const clean = report.failures.filter((f) => !f.gaps?.length);
  for (const check of Object.keys(report.checks)) {
    const rows = clean.filter((f) => f.check === check).sort((a, b) => b.count - a.count).slice(0, perCheck);
    if (!rows.length) continue;
    out.push(`### ${check}`, '');
    for (const f of rows) {
      out.push(`- ${f.subject}, turns ${f.firstTurn}-${f.lastTurn} (${f.count}): game \`${JSON.stringify(f.game)}\`,`
        + ` ours \`${JSON.stringify(f.ours)}\`${f.state ? `; state \`${JSON.stringify(f.state).slice(0, 400)}\`` : ''}`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}

function main() {
  const { pos, opt } = args(process.argv.slice(2));
  const dump = pos[0];
  if (!dump) throw new Error('usage: run.ts <dump.jsonl> [--out file | --replay file] [--from T] [--to T]');
  if (opt.replay) {
    const r = runReplay(dump, { from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined });
    // the engine's draws between the held points against the game's
    const logPath = randLogPath(dump);
    const holds = rngHolds();
    const streams = streamLedger(holds, logPath ? loadRandLog(logPath, holds.map((h) => h.held)) : undefined);
    writeFileSync(opt.replay, JSON.stringify({ ...r, streams }, null, 1) + '\n');
    console.log(`streams: ${streams.exact} / ${streams.stretches} stretches between held points drew as the game did;`
      + ` turns off: ${streams.turns.filter((t) => t.engine !== t.game).length} of ${streams.turns.length}; by point ${JSON.stringify(streams.byKind)}`);
    writeFileSync(opt.replay.replace(/\.json$/, '.md'), replayMarkdown(r));
    console.log(`replay (${r.source}): ${r.perTurn.length} pairs, turns ${r.turns.join('-')}${r.stopped ? `; stopped: ${r.stopped}` : ''} -> ${opt.replay}`);
    console.log(`every subsystem held, nothing imposed: ${r.cleanEvery} pairs`);
    console.log('subsystem'.padEnd(28), 'held'.padStart(5), 'clean'.padStart(6), 'imposed'.padStart(8), 'matched'.padStart(8), ' first');
    for (const [k, s] of Object.entries(r.subsystems)) {
      console.log(k.padEnd(28), String(s.held).padStart(5), String(s.clean).padStart(6), (s.imposedFrom ? `t${s.imposedFrom}` : '-').padStart(8),
        `${s.matched}/${s.compared}`.padStart(8), ' ', s.first ? `t${s.first.turn} ${s.first.subject}` : '-');
    }
    return;
  }
  const report = runReport(dump, opt.from ? Number(opt.from) : -Infinity, opt.to ? Number(opt.to) : Infinity);
  const out = opt.out ?? dump.replace(/\.jsonl$/, '.report.json');
  writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
  writeFileSync(out.replace(/\.json$/, '.md'), markdown(report));
  console.log(`${report.records} records, turns ${report.turns.join('-')} -> ${out}`);
  console.log('check'.padEnd(26), 'pass'.padStart(7), 'fail'.padStart(7), 'gapped'.padStart(7), '  skipped');
  for (const [k, t] of Object.entries(report.checks)) {
    const skips = Object.entries(t.skip).map(([r, n]) => `${r}=${n}`).join(' ');
    console.log(k.padEnd(26), String(t.pass).padStart(7), String(t.fail).padStart(7), String(t.failGapped).padStart(7), ' ', skips);
  }
  console.log(`distinct failures ${report.failures.length}; gaps ${Object.keys(report.gaps).length}`);
  const d = report.draws;
  if (d) {
    console.log(`draws: the log ${d.logged}, in replayed stretches ${d.replayed}; starts ${d.starts.after} / ${d.starts.logged} landed (by the records alone ${d.starts.byRecords}; the AI's ${d.starts.ai}); steps ${d.steps.after} / ${d.steps.logged} (by the records alone ${d.steps.byRecords})`);
  }
}

main();
