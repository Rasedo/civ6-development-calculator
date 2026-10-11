/**
 * THE MAJORS' WORLD CONGRESS AI IN THE ACTION REPLAY (ai/major/congress.ts):
 * at each turn the engine's Regular Session sits, every AI major's ballot on
 * the engine's slate goes on its record (`vote`: the outcome, the target,
 * the extra votes); and its ballot on the game's own slate of that session
 * is scored against the game's log (`<dump>.logs/World_Congress.csv`: per
 * resolution and player the VOTES cast and the OPTIONS taken — the outcome,
 * the target) and its draw log's target draws (`<dump>.randcalls.csv`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { congressBallot, type ResolutionEval } from '../../ai/major/congress';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { congressSessionDue } from '../core/congress';
import { worldEraIndex } from '../core/eras';
import type { GameState, SeatActionRecord } from '../core/types';
import { CONGRESS_RESOLUTIONS } from '../data/seats';
import { CONGRESS_TARGET_TABLES } from '../data/congressTargets';
import { congressCandidates, congressInstallType } from '../core/congressTargets';

/** one player's logged choice on one resolution */
interface LoggedChoice { votes: number; outcome: number; target: number }

/** World_Congress.csv by turn: resolution type -> player id -> choice */
function readCongressLog(path: string): Map<number, Map<string, Map<number, LoggedChoice>>> {
  const out = new Map<number, Map<string, Map<number, LoggedChoice>>>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 5 || (c[1] !== 'VOTES' && c[1] !== 'OPTIONS')) continue;
    const t = Number(c[0]);
    const byRes = out.get(t) ?? new Map<string, Map<number, LoggedChoice>>();
    out.set(t, byRes);
    const byPlayer = byRes.get(c[2]) ?? new Map<number, LoggedChoice>();
    byRes.set(c[2], byPlayer);
    const p = Number(c[3]);
    const e = byPlayer.get(p) ?? { votes: 0, outcome: 0, target: -1 };
    byPlayer.set(p, e);
    if (c[1] === 'VOTES') e.votes = Number(c[4]);
    else {
      e.outcome = Number(c[4]);
      e.target = Number(c[5]);
    }
  }
  return out;
}

export interface CongressAiTally {
  /** sessions the port voted in, resolutions scored (both sessions hold them) */
  sessions: number;
  lines: number;
  outcomeEqual: number;
  votesEqual: number;
  /** the target where the port names one the log's index can be read for */
  targetLines: number;
  targetEqual: number;
  /** the ballots the port leaves to the engine's draw, and the game's
   *  "Random congress resolution target" draws at those sessions */
  drawsOurs: number;
  drawsGame: number;
  misses: string[];
}

/** the "Random congress resolution target" draws of the game's draw log by
 *  turn (`<dump>.randcalls.csv`) */
function readTargetDraws(path: string): Map<number, number> {
  const out = new Map<number, number>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.includes('Random congress resolution target')) continue;
    const t = Number(line.split(',')[0]);
    out.set(t, (out.get(t) ?? 0) + 1);
  }
  return out;
}

export class CongressProbe {
  private readonly log: Map<number, Map<string, Map<number, LoggedChoice>>> | null;
  private readonly draws: Map<number, number>;
  readonly tally: CongressAiTally = {
    sessions: 0, lines: 0, outcomeEqual: 0, votesEqual: 0, targetLines: 0, targetEqual: 0, drawsOurs: 0, drawsGame: 0, misses: [],
  };

  /** `seats`: the AI majors, seat -> player id; `player`: any seat -> player id */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly player: ReadonlyMap<number, number>) {
    const path = dumpPath.replace(/\.jsonl$/, '.logs/World_Congress.csv');
    this.log = existsSync(path) ? readCongressLog(path) : null;
    this.draws = readTargetDraws(dumpPath.replace(/\.jsonl$/, '.randcalls.csv'));
  }

  get active(): boolean {
    return !!this.log && this.seats.size > 0;
  }

  /**
   * THE BALLOTS of the turn's Regular Session, before the engine's turn:
   * each AI major's ballot on the engine's slate (and the Diplomatic
   * Victory resolution where it sits) onto its record of the turn
   * (`records`, by seat), scored against the log's session of `turn`.
   */
  turn(state: GameState, turn: number, inputs: MajorViewInputs, agendasOf: (seat: number) => readonly string[],
       records: Record<number, SeatActionRecord>): void {
    if (!congressSessionDue(state.turn, worldEraIndex(state))) return;
    const view = majorView(state, inputs);
    const engine = view.congressSlate().map((index, slot) => ({ slot, index, type: index >= 0 ? congressInstallType(index) : null }))
      .filter((s): s is { slot: number; index: number; type: string } => s.type !== null);
    if (view.congressDv()) engine.push({ slot: 2, index: -1, type: 'WC_RES_DIPLOVICTORY' });
    const logged = this.log?.get(turn) ?? this.log?.get(turn + 1);
    this.tally.sessions++;
    let drawn = 0;
    for (const [seat, pid] of this.seats) {
      if (!view.majors().includes(seat)) continue;
      const { vote } = congressBallot(view, seat, agendasOf(seat), engine);
      (records[seat] ??= { production: [], tech: null, civic: null, units: [] }).vote = vote;
      if (!logged) continue;
      // the game's slate of the session, the engine's index of each (-1 for
      // the Diplomatic Victory resolution and one the catalog lacks), in
      // slots past the engine's
      const theirs = [...logged.keys()].filter((r) => logged.get(r)?.has(pid))
        .map((type, k) => ({ slot: k, type, index: CONGRESS_RESOLUTIONS.findIndex((_r, i) => congressInstallType(i) === type) }));
      const own = congressBallot(view, seat, agendasOf(seat), theirs);
      drawn += own.targets.filter((x) => x < 0).length;
      this.score(turn, pid, view.favor(seat), theirs, own.evals, own.votes, own.targets, logged);
    }
    if (logged) {
      this.tally.drawsOurs += drawn;
      this.tally.drawsGame += this.draws.get(turn) ?? this.draws.get(turn + 1) ?? 0;
    }
  }

  /** the log's index of a target the port names, null where unread */
  private gameTarget(type: string, target: number): number | null {
    const t = CONGRESS_TARGET_TABLES[type];
    if (!t || target < 0) return null;
    if (t.kind === 'PLAYER') return this.player.get(target) ?? null;
    if (t.kind === 'RELIGION') return null;
    return congressCandidates(type).find((c) => c.target === target)?.index ?? null;
  }

  private score(turn: number, pid: number, favor: number, slate: readonly { index: number; type: string }[],
                evals: readonly ResolutionEval[], votes: Map<string, number>, targets: readonly number[],
                logged: Map<string, Map<number, LoggedChoice>>): void {
    slate.forEach((s, k) => {
      const lg = logged.get(s.type)?.get(pid);
      if (!lg) return;
      const t = this.tally;
      t.lines++;
      const outcome = evals[k].outcome;
      const n = votes.get(s.type) ?? 1;
      if (outcome === lg.outcome) t.outcomeEqual++;
      if (n === lg.votes) t.votesEqual++;
      let targetNote = '';
      const ours = this.gameTarget(s.type, targets[k]);
      if (ours !== null) {
        t.targetLines++;
        if (ours === lg.target) t.targetEqual++;
        else targetNote = ` target ours ${ours} log ${lg.target}`;
      }
      if ((outcome !== lg.outcome || n !== lg.votes || targetNote) && t.misses.length < 60) {
        t.misses.push(`t${turn} p${pid} ${s.type.replace('WC_RES_', '')}: outcome ours ${outcome} log ${lg.outcome}, votes ours ${n} log ${lg.votes}`
          + `${targetNote}${targets[k] < 0 ? ' (ours drawn)' : ''} (favor ${Math.floor(favor)}; values ${(evals[k].values[0] / 256).toFixed(1)} / ${(evals[k].values[1] / 256).toFixed(1)}${evals[k].listed ? ', listed' : ''})`);
      }
    });
  }
}

/** the tally as the replay report's section */
export function congressAiMarkdown(t: CongressAiTally): string[] {
  return ['', "## The majors' AI: the World Congress (ai/major/congress.ts)", '',
    `- Sessions voted: ${t.sessions}; resolutions both sessions hold, per AI major: ${t.lines}.`,
    `- The outcome as World_Congress.csv's OPTIONS: ${t.outcomeEqual} / ${t.lines}; the votes as its VOTES: ${t.votesEqual} / ${t.lines}; the target where the port names one: ${t.targetEqual} / ${t.targetLines}.`,
    `- Target draws at the scored sessions: ours ${t.drawsOurs}, the game's ${t.drawsGame} (RandCalls).`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`)];
}
