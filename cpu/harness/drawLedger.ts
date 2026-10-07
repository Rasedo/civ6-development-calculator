/**
 * THE TURN'S DRAWS AGAINST THE GAME'S LOG. Per turn, every stretch of the
 * game's draws the harness replays — each player's start (`startDraws`,
 * `logStart`) and the turn's random-event step (`replayEvents`) — set beside
 * the game's own log of it (`randLog.ts`): per label, the draws and their
 * ranges. The logged step is the gap's tail of step draws
 * (`DRAW_SITES[...].step`, a storm's name among them), so a step the replay
 * places too short or too long shows. The ledger also counts the logged
 * draws the replay lands exactly (label and range at their place), and the
 * ones the records alone place (each start's count resolution, the event
 * step's first start by the records).
 */
import type { CheckResult, StartReplay } from './checks';
import { logStart, resolveStart } from './checks';
import type { EventReplay } from './eventReplay';
import type { LoggedDraw, RandLog } from './randLog';
import { DRAW_SITES, loggedStep, sameDraw, siteLabel } from './drawSites';

export interface DrawLedger {
  /** the log's draws in the game */
  logged: number;
  /** the logged draws inside the stretches the harness replays */
  replayed: number;
  /** of those, landed exactly with the game's log (`after`) and by the
   *  records alone (`byRecords`), starts and steps apart */
  starts: { logged: number; after: number; byRecords: number; ai: number };
  steps: { logged: number; after: number; byRecords: number };
  /** per label: the log's draws, and how many the harness lands */
  byLabel: Record<string, { logged: number; landed: number; owner: string }>;
}

type Tally = Map<string, number[]>;

function tally(t: Tally, d: { label: string; range: number }): void {
  // the volcano roll's choice: which branch drew it the records do not show
  const k = siteLabel(d.label) === 'Choose Inactive Volcano Roll' ? 'Choose Active Volcano Roll' : siteLabel(d.label);
  if (!t.has(k)) t.set(k, []);
  t.get(k)!.push(d.range);
}

/** The labels whose count or ranges differ: label -> [ours, logged]. */
function differ(ours: Tally, logged: Tally, loose: Set<string>): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const k of new Set([...ours.keys(), ...logged.keys()])) {
    const a = [...(ours.get(k) ?? [])].sort((x, y) => x - y);
    const b = [...(logged.get(k) ?? [])].sort((x, y) => x - y);
    const same = a.length === b.length && (loose.has(k) || a.every((x, i) => x === b[i]));
    if (!same) out[k] = [`${a.length}: ${a.join(',')}`, `${b.length}: ${b.join(',')}`];
  }
  return out;
}

/**
 * Per turn, the `turn.draws` check: the draws the harness replays — the
 * witnessed starts of the turn and the turn's random-event step — against
 * the log's draws of the same stretches, per label, their count and ranges.
 * With the ledger of the game's draws the harness lands.
 */
export function turnDraws(starts: readonly StartReplay[], replay: EventReplay | undefined, log: RandLog): { results: CheckResult[]; ledger: DrawLedger } {
  const ledger: DrawLedger = { logged: log.draws.length, replayed: 0, starts: { logged: 0, after: 0, byRecords: 0, ai: 0 },
    steps: { logged: 0, after: 0, byRecords: 0 }, byLabel: {} };
  for (const d of log.draws) {
    const k = siteLabel(d.label);
    ledger.byLabel[k] ??= { logged: 0, landed: 0, owner: DRAW_SITES[k]?.owner ?? 'unmapped' };
    ledger.byLabel[k].logged++;
  }
  const land = (d: LoggedDraw) => { ledger.byLabel[siteLabel(d.label)].landed++; };
  const seen = new Set<string>();
  const byTurn = new Map<number, StartReplay[]>();
  for (const s of starts) {
    const key = `${s.turn}:${s.player}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byTurn.has(s.turn)) byTurn.set(s.turn, []);
    byTurn.get(s.turn)!.push(s);
  }
  const stepGaps = replay?.gaps ?? new Map<number, [number, number]>();
  const turns = [...new Set([...byTurn.keys(), ...stepGaps.keys()])].sort((a, b) => a - b);
  const results: CheckResult[] = [];
  const loose = new Set(['Choosing a Citizen Name', 'Choose Active Volcano Roll']);
  for (const T of turns) {
    const ours: Tally = new Map();
    const game: Tally = new Map();
    const why: string[] = [];
    let any = false;
    for (const s of byTurn.get(T) ?? []) {
      if (s.pre === undefined || s.post === undefined || s.why) continue;
      const logged = log.between(s.pre, s.post);
      if (!logged) continue;
      any = true;
      ledger.replayed += logged.length;
      ledger.starts.logged += logged.length;
      const l = logStart(s, logged);
      s.draws.forEach((d, n) => {
        if (l.at[n] < 0) return;
        tally(ours, { label: d.label, range: d.ties ? d.ties.length : logged[l.at[n]].range });
        if (!l.range.includes(n)) {
          ledger.starts.after++;
          land(logged[l.at[n]]);
        }
      });
      for (const d of s.draws) if (!d.choice && l.at[s.draws.indexOf(d)] < 0) tally(ours, { label: d.label, range: d.ties?.length ?? -1 });
      // the AI's own draws the start holds: placed, not reproduced
      for (const k of l.ai) tally(ours, logged[k]);
      ledger.starts.ai += l.ai.length;
      for (const d of logged) tally(game, d);
      // the records alone: the count's resolution, read position by position
      const old = resolveStart(s);
      if (old && old.length === logged.length) {
        old.forEach((d, i) => { if (siteLabel(logged[i].label) === d.label && (!d.ties || d.ties.length === logged[i].range)) ledger.starts.byRecords++; });
      }
    }
    const gap = stepGaps.get(T);
    const gapDraws = gap ? log.between(gap[0], gap[1]) : undefined;
    const bounds = gapDraws ? loggedStep(gapDraws) : undefined;
    if (gapDraws && bounds) {
      any = true;
      const [s0, s1] = bounds;
      if (process.env.STEPDBG === String(T)) console.error('gap', gapDraws.length, 'bounds', s0, s1, gapDraws.map((d) => d.label.slice(0, 12) + '/' + d.range).join(' | '), 'ours', JSON.stringify(replay?.steps.get(T)));
      ledger.replayed += s1 - s0;
      ledger.steps.logged += s1 - s0;
      for (const d of gapDraws.slice(s0, s1)) tally(game, d);
      const step = replay?.steps.get(T);
      if (!step || step.at < 0) why.push(`the step is not placed (${replay?.turns.get(T) ?? 'no replay'})`);
      else {
        for (const d of step.ours) tally(ours, d);
        if (step.at !== s0) why.push(`the replayed step starts ${step.at > s0 ? 'late' : 'early'} by ${Math.abs(step.at - s0)}`);
        if (replay?.turns.get(T) === 'ok') {
          step.ours.forEach((d, i) => {
            const j = step.at + i;
            if (j >= s0 && j < s1 && sameDraw(d, gapDraws[j])) {
              ledger.steps.after++;
              land(gapDraws[j]);
            }
          });
        }
        if (step.byRecords) ledger.steps.byRecords += s1 - s0;
      }
    }
    if (!any) continue;
    const diff = differ(ours, game, loose);
    const ok = !Object.keys(diff).length && !why.length;
    results.push({ turn: T, check: 'turn.draws', subject: `turn ${T}`, ok,
      game: [...game.values()].reduce((n, r) => n + r.length, 0), ours: [...ours.values()].reduce((n, r) => n + r.length, 0),
      ...(ok ? {} : { state: { ...(why.length ? { why } : {}), labels: diff } }) });
  }
  return { results, ledger };
}

