/**
 * THE MAJORS' WORLD CONGRESS AI IN THE ACTION REPLAY (ai/major/congress.ts):
 * at each turn the engine's Regular Session sits, every AI major's ballot on
 * the engine's slate goes on its record (`vote`: the outcome, the target,
 * the extra votes); and its ballot on the game's own slate of that session
 * is scored against the game's log (`<dump>.logs/World_Congress.csv`: per
 * resolution and player the VOTES cast and the OPTIONS taken — the outcome,
 * the target).
 */
import { existsSync, readFileSync } from 'node:fs';
import { congressBallot, type ResolutionEval } from '../../ai/major/congress';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { congressSessionDue } from '../core/congress';
import { worldEraIndex } from '../core/eras';
import type { GameState, SeatActionRecord } from '../core/types';
import { CONGRESS_RESOLUTIONS } from '../data/seats';

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

/** the install's ResolutionType of an engine resolution, null for one the
 *  catalog carries without an install row */
function installType(index: number): string | null {
  const src = CONGRESS_RESOLUTIONS[index]?.src as { target?: { where?: string } } | undefined;
  const m = /ResolutionType=(\S+)/.exec(src?.target?.where ?? '');
  return m ? m[1] : null;
}

export interface CongressAiTally {
  /** sessions the port voted in, resolutions scored (both sessions hold them) */
  sessions: number;
  lines: number;
  outcomeEqual: number;
  votesEqual: number;
  /** the target on the resolutions that name a player */
  targetLines: number;
  targetEqual: number;
  /** the port's favor against the log's spend */
  misses: string[];
}

export class CongressProbe {
  private readonly log: Map<number, Map<string, Map<number, LoggedChoice>>> | null;
  readonly tally: CongressAiTally = { sessions: 0, lines: 0, outcomeEqual: 0, votesEqual: 0, targetLines: 0, targetEqual: 0, misses: [] };

  /** `seats`: the AI majors, seat -> player id; `player`: any seat -> player id */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly player: ReadonlyMap<number, number>) {
    const path = dumpPath.replace(/\.jsonl$/, '.logs/World_Congress.csv');
    this.log = existsSync(path) ? readCongressLog(path) : null;
  }

  get active(): boolean {
    return !!this.log && this.seats.size > 0;
  }

  /**
   * THE BALLOTS of the turn's Regular Session, before the engine's turn:
   * each AI major's ballot on the engine's slate onto its record of the turn
   * (`records`, by seat), scored against the log's session of `turn`.
   */
  turn(state: GameState, turn: number, inputs: MajorViewInputs, agendasOf: (seat: number) => readonly string[],
       records: Record<number, SeatActionRecord>): void {
    if (!congressSessionDue(state.turn, worldEraIndex(state))) return;
    const slate = (state.congressSlate ?? []).map((index) => ({ index, type: index >= 0 ? installType(index) : null }));
    const view = majorView(state, inputs);
    const logged = this.log?.get(turn) ?? this.log?.get(turn + 1);
    this.tally.sessions++;
    for (const [seat, pid] of this.seats) {
      if (!view.majors().includes(seat)) continue;
      const known = slate.filter((s): s is { index: number; type: string } => s.index >= 0 && s.type !== null);
      const { vote } = congressBallot(view, seat, agendasOf(seat), known);
      const ballot = slate.map((s) => (s.index >= 0 && s.type ? vote[known.findIndex((k) => k.index === s.index)] : null));
      (records[seat] ??= { production: [], tech: null, civic: null, units: [] }).vote = ballot;
      if (!logged) continue;
      // the game's slate of the session, the engine's index of each (-1 for
      // one the catalog does not carry)
      const theirs = [...logged.keys()].filter((r) => logged.get(r)?.has(pid))
        .map((type) => ({ type, index: CONGRESS_RESOLUTIONS.findIndex((_r, i) => installType(i) === type) }));
      const own = congressBallot(view, seat, agendasOf(seat), theirs);
      this.score(turn, pid, view.favor(seat), theirs, own.evals, own.votes, own.vote, logged);
    }
  }

  private score(turn: number, pid: number, favor: number, slate: readonly { index: number; type: string }[],
                evals: readonly ResolutionEval[], votes: Map<string, number>, vote: readonly [number, number, number][],
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
      const kind = s.index >= 0 ? CONGRESS_RESOLUTIONS[s.index]?.target : undefined;
      let targetNote = '';
      if (kind === 'seat') {
        t.targetLines++;
        const ours = this.player.get(vote[k][1]);
        if (ours === lg.target) t.targetEqual++;
        else targetNote = ` target ours p${ours ?? '?'} log p${lg.target}`;
      }
      if ((outcome !== lg.outcome || n !== lg.votes || targetNote) && t.misses.length < 40) {
        t.misses.push(`t${turn} p${pid} ${s.type.replace('WC_RES_', '')}: outcome ours ${outcome} log ${lg.outcome}, votes ours ${n} log ${lg.votes}`
          + `${targetNote} (favor ${Math.floor(favor)}; values ${(evals[k].values[0] / 256).toFixed(1)} / ${(evals[k].values[1] / 256).toFixed(1)}${evals[k].listed ? ', listed' : ''})`);
      }
    });
  }
}

/** the tally as the replay report's section */
export function congressAiMarkdown(t: CongressAiTally): string[] {
  return ['', "## The majors' AI: the World Congress (ai/major/congress.ts)", '',
    `- Sessions voted: ${t.sessions}; resolutions both sessions hold, per AI major: ${t.lines}.`,
    `- The outcome as World_Congress.csv's OPTIONS: ${t.outcomeEqual} / ${t.lines}; the votes as its VOTES: ${t.votesEqual} / ${t.lines}; the target on the resolutions naming a player: ${t.targetEqual} / ${t.targetLines}.`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`)];
}
