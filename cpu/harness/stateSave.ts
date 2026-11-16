/**
 * THE AI SCORE'S CARRIED STATE, SAVED AND RESUMED (`--save-state`,
 * `--load-state` on `run.ts --aiscore`).
 *
 * The per-turn AI score opens each pair on the record's world and carries
 * the AI's memory and the rules' stores from the engine's own turn before
 * (`perTurnWorld`). A window started past the first record (`--from T`) has
 * no turn before: it opens on the record and the game's memory alone. A save
 * holds what the run held as a pair ended, so a window opens as the run that
 * wrote the save went on:
 *
 *   - the engine's state, whole;
 *   - the replay's bookkeeping that outlives a pair (`CTX_FIELDS`'s
 *     `carried`): the record keys of the engine's units, the units the last
 *     pair took off, its late blows, the minors' pending cities, the agendas'
 *     civics, the logged knowledge bases and danger maps, each player's
 *     memory cleanness ...;
 *   - the player of every seat, which a resuming run must agree with.
 *
 * These go through one structured clone (`node:v8`), so a unit the state and
 * the bookkeeping both hold is one unit again when read, and a Map, a Set, a
 * typed array, an `undefined` field and a shared object come back as they
 * were. One file a save, `<dir>/s<seed>_t<turn>.state`: a JSON header line
 * (`SaveHead`: the format, the recording, the turn the save closes, the
 * memory mode, the tree's head sha and how many files under cpu/ differed
 * from it, the carried fields' names) and the clone, zstd-compressed.
 * Written to a temporary name and renamed, so a reader never meets a half
 * written save.
 *
 * A window `--from T --load-state <dir>` takes the newest save closing a
 * turn at or before T-1 (`--warm N`: at or before T-1-N), runs the pairs
 * from the save's turn up to T with scoring muted (`muteScores`) and scores
 * from T on with every tally of the report empty. Where no save fits or the
 * save does not load, it says so in one line on stderr (`STATE: NO RESUME`)
 * and the window starts as `--from T` alone; where the resumed run fails
 * before its first scored turn, the caller runs it again without the save
 * (`resumeFailed`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize as cloneRead, serialize as cloneWrite } from 'node:v8';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import type { GameState } from '../core/types';
import { muteScores } from './aiScore';
import type { Imported } from './import';
import type { Ctx } from './replay';

/** the save file's layout: a change to it, or to what a save must hold to be
 *  resumed from, takes a new number */
export const SAVE_FORMAT = 1;

/**
 * EVERY FIELD OF THE REPLAY'S BOOKKEEPING, by what a resumed run does with
 * it. A field added to `Ctx` does not compile until it is named here:
 *
 *   - `carried`: outlives a pair — read in the next pair before that pair
 *     sets it, or never reset. Saved and restored.
 *   - `pair`: set anew at the top of every pair before anything reads it.
 *   - `run`: built once as the run opens, from the recording's files and the
 *     window's first record (the catalog, the logs, the seat maps, the hooks).
 *   - `tally`: a count of the report, emptied as the scored turns begin.
 */
export const CTX_FIELDS: Record<keyof Ctx, 'carried' | 'pair' | 'run' | 'tally'> = {
  state: 'carried',
  units: 'carried',
  gone: 'carried',
  lateBlows: 'carried',
  engineKilled: 'carried',
  pendingMinors: 'carried',
  agendaCivics: 'carried',
  armyLogged: 'carried',
  dangerLogged: 'carried',
  memoryClean: 'carried',
  minorLookTypes: 'carried',
  minorDying: 'carried',
  minorUnits: 'carried',
  minorGround: 'carried',
  minorLux: 'carried',
  minorClears: 'carried',
  minorCleared: 'carried',
  minorClearItems: 'carried',
  minorClearUnits: 'carried',
  minorOps: 'carried',
  barbSteps: 'carried',
  barbPillaged: 'carried',
  barbOpened: 'carried',
  barbCentres: 'carried',
  barbEncampments: 'carried',
  fortified: 'pair',
  undug: 'pair',
  streams: 'pair',
  applied: 'pair',
  next: 'pair',
  prev: 'pair',
  fellBack: 'pair',
  imposed: 'pair',
  paths: 'pair',
  walked: 'pair',
  steps: 'pair',
  barbBlows: 'pair',
  startBests: 'pair',
  barbSeized: 'pair',
  minorBlows: 'pair',
  minorShots: 'pair',
  minorPromoted: 'pair',
  minorBuys: 'pair',
  minorImproves: 'pair',
  barbBattles: 'pair',
  barbFought: 'pair',
  barbDraws: 'pair',
  promoteHp: 'pair',
  upgradeInto: 'pair',
  upgradedFrom: 'pair',
  levyFrom: 'pair',
  groundWas: 'pair',
  roadTierWas: 'pair',
  envoys: 'pair',
  battled: 'pair',
  barbNew: 'pair',
  lateEnvoys: 'pair',
  researchBefore: 'pair',
  researchAtTurn: 'pair',
  civicBefore: 'pair',
  turn: 'pair',
  cat: 'run',
  W: 'run',
  seatOfPlayer: 'run',
  playerOfSeat: 'run',
  buyTrace: 'run',
  tactical: 'run',
  log: 'run',
  warKinds: 'run',
  stream: 'run',
  aiResearchLog: 'run',
  strategyLog: 'run',
  aiCivicLog: 'run',
  aiPolicyLog: 'run',
  memoryLogs: 'run',
  gameMemory: 'run',
  gameUnits: 'run',
  cityBuildLog: 'run',
  operations: 'run',
  tally: 'tally',
  reasons: 'tally',
  barbTally: 'tally',
  minorTally: 'tally',
  minorDraws: 'tally',
  researchAi: 'tally',
  researchScores: 'tally',
  civicAi: 'tally',
  civicScores: 'tally',
  scores: 'tally',
  stateScores: 'tally',
  stateLeftOut: 'tally',
  cityBuild: 'tally',
  cityBuildPer: 'tally',
};

const CARRIED = (Object.keys(CTX_FIELDS) as (keyof Ctx)[]).filter((k) => CTX_FIELDS[k] === 'carried' && k !== 'state');

/** the fields `perTurnWorld` carries from the engine's turn before, by the
 *  object they sit on: a save names its tree's, a resuming tree its own */
export type CarryLists = Record<'seat' | 'research' | 'minor' | 'city' | 'unit' | 'game', readonly string[]>;

/** a save's header line */
export interface SaveHead {
  format: number;
  /** the recording's stem (`h1_duels1117_20261115T062438Z`) and seed */
  stem: string;
  seed: string;
  /** the turn the save closes: the pair of records `turn` and `turn + 1`
   *  ran, the next pair opens on record `turn + 1` */
  turn: number;
  /** the memory each pair opened on: `aimem`, `log` or `carried` */
  memory: string;
  /** the saving tree's head and the files under cpu/ that differed from it */
  sha: string;
  dirty: number;
  lists: CarryLists;
  carried: string[];
  v8: string;
  at: string;
  /** the clone's bytes before compression */
  raw: number;
}

interface SaveBody {
  state: GameState;
  ctx: Record<string, unknown>;
  /** each engine seat's game player, as `[seat, player]` rows in seat order */
  seats: [number, number][];
}

/** a recording's stem and seed from its dump's path */
export function recordingOf(dumpPath: string): { stem: string; seed: string } {
  const stem = basename(dumpPath).replace(/\.jsonl$/, '');
  return { stem, seed: /^h1_duel[a-zA-Z]*(\d+)_/.exec(stem)?.[1] ?? stem };
}

const fileOf = (seed: string, turn: number) => `s${seed}_t${String(turn).padStart(4, '0')}.state`;

const seatRows = (ctx: Ctx): [number, number][] => [...ctx.playerOfSeat].sort((a, b) => a[0] - b[0]);

/** this tree's head sha and the count of its files under cpu/ that differ
 *  from it (`unknown`, 0 outside a git tree) */
function treeHead(): { sha: string; dirty: number } {
  const here = dirname(fileURLToPath(import.meta.url));
  const git = (...args: string[]) => execFileSync('git', ['-C', here, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const top = git('rev-parse', '--show-toplevel');
    const changed = execFileSync('git', ['-C', top, 'status', '--porcelain', '--untracked-files=all', '--', 'cpu'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean).length;
    return { sha: git('rev-parse', 'HEAD'), dirty: changed };
  } catch {
    return { sha: 'unknown', dirty: 0 };
  }
}

/**
 * THE SAVES OF A RUN: one as every `every`th turn closes (the turns that
 * `every` divides, wherever the run started), into `dir`.
 */
export class StateSaver {
  private readonly head: Omit<SaveHead, 'turn' | 'at' | 'raw'>;
  /** the saves written: their count, bytes on disk and the seconds they took */
  readonly written = { saves: 0, bytes: 0, seconds: 0 };

  constructor(dumpPath: string, private readonly dir: string, private readonly every: number, memory: string, lists: CarryLists) {
    mkdirSync(dir, { recursive: true });
    this.head = { format: SAVE_FORMAT, ...recordingOf(dumpPath), memory, ...treeHead(), lists, carried: CARRIED, v8: process.versions.v8 };
  }

  /** the pair of records `turn` and `turn + 1` has run */
  pairClosed(ctx: Ctx, turn: number): void {
    if (turn % this.every !== 0) return;
    const t0 = performance.now();
    const body: SaveBody = { state: ctx.state, ctx: Object.fromEntries(CARRIED.map((k) => [k, ctx[k]])), seats: seatRows(ctx) };
    const raw = cloneWrite(body);
    const head: SaveHead = { ...this.head, turn, at: new Date().toISOString(), raw: raw.length };
    const bytes = Buffer.concat([Buffer.from(`${JSON.stringify(head)}\n`, 'utf8'), zstdCompressSync(raw)]);
    const path = join(this.dir, fileOf(head.seed, turn));
    writeFileSync(`${path}.tmp${process.pid}`, bytes);
    renameSync(`${path}.tmp${process.pid}`, path);
    this.written.saves += 1;
    this.written.bytes += bytes.length;
    this.written.seconds += (performance.now() - t0) / 1000;
  }
}

/** whether a resumed run has not reached its first scored turn */
let warming = false;

/** a resumed run ended, or threw, before its first scored turn: the caller
 *  says so and runs the window again without the save. True once per failure. */
export function resumeFailed(): boolean {
  const was = warming;
  warming = false;
  muteScores(false);
  return was;
}

const say = (line: string) => console.error(`STATE: ${line}`);

/**
 * A WINDOW RESUMED FROM A SAVE. `open` finds and reads the save before the
 * run builds anything (null, with its one line, where the window starts
 * without one); the run then opens on record `turn + 1`, takes the save's
 * state and bookkeeping in place of the window's own start (`restore`) and
 * tells each pair's turn (`pairOpens`), the scoring muted until the window's
 * first scored turn.
 */
export class Resume {
  private tallies: object[] = [];
  private empty: object[] = [];
  private clear: (() => void) | null = null;

  private constructor(readonly head: SaveHead, readonly path: string, private body: SaveBody | null, private readonly scoreFrom: number,
    private readonly lists: CarryLists) {}

  /** the turn the save closes */
  get turn(): number {
    return this.head.turn;
  }

  static open(dumpPath: string, load: { dir: string; warm?: number }, from: number | undefined, memory: string, lists: CarryLists): Resume | null {
    const { stem, seed } = recordingOf(dumpPath);
    const none = (why: string): null => {
      say(`NO RESUME (${why}): the window starts as --from ${from ?? 1} alone, on the record and the game's memory`);
      return null;
    };
    if (from === undefined || from <= 1) return none('a run from the first record loads no state');
    const limit = from - 1 - (load.warm ?? 0);
    const turns = (existsSync(load.dir) ? readdirSync(load.dir) : [])
      .flatMap((f) => { const m = new RegExp(`^s${seed}_t(\\d+)\\.state$`).exec(f); return m ? [Number(m[1])] : []; })
      .filter((t) => t <= limit).sort((a, b) => a - b);
    if (!turns.length) return none(`no save of seed ${seed} closing a turn at or before ${limit} in ${load.dir}`);
    const path = join(load.dir, fileOf(seed, turns[turns.length - 1]));
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch (e) {
      return none(`${path} cannot be read: ${(e as Error).message}`);
    }
    const nl = bytes.indexOf(10);
    let head: SaveHead;
    try {
      head = JSON.parse(bytes.toString('utf8', 0, nl)) as SaveHead;
    } catch {
      return none(`${path} has no header`);
    }
    if (head.format !== SAVE_FORMAT) return none(`${path} is format ${head.format}, this tree reads ${SAVE_FORMAT}`);
    if (head.stem !== stem) return none(`${path} is of recording ${head.stem}, not ${stem}`);
    if (head.memory !== memory) return none(`${path} was saved under --memory ${head.memory}, this run is ${memory}`);
    let body: SaveBody;
    try {
      body = cloneRead(zstdDecompressSync(bytes.subarray(nl + 1))) as SaveBody;
    } catch (e) {
      return none(`${path} does not read (saved under V8 ${head.v8}, this is ${process.versions.v8}): ${(e as Error).message}`);
    }
    if (!body?.state || body.state.turn !== head.turn + 1 || !body.ctx || !Array.isArray(body.seats)) return none(`${path} holds no state of turn ${head.turn + 1}`);
    warming = true;
    return new Resume(head, path, body, from, lists);
  }

  /**
   * The save onto the run: its state into `ctx.state` in place, its carried
   * bookkeeping onto `ctx`, and `raw` — record `turn + 1` as imported, which
   * the window's own start has not touched — as the import the first pair's
   * world is built from. A field this tree carries that the save's tree did
   * not (`CarryLists`) takes the import's value on the seats, the
   * city-states, their research and cities and the game, and is absent on a
   * unit; a carried `Ctx` field the save lacks keeps the run's own start.
   * `tallies`: the report's counts, emptied as the scored turns begin.
   * Throws where the save's seats are not this run's.
   */
  restore(ctx: Ctx, raw: Imported, tallies: object[], clear: () => void): void {
    const body = this.body!;
    this.body = null;
    const seats = JSON.stringify(seatRows(ctx));
    if (JSON.stringify(body.seats) !== seats) throw new Error(`the save's seats are ${JSON.stringify(body.seats)}, record ${this.turn + 1}'s ${seats}`);
    const state = ctx.state as unknown as Record<string, unknown>;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, body.state);
    const bag = ctx as unknown as Record<string, unknown>;
    const lacking: string[] = [];
    for (const k of CARRIED) {
      if (k in body.ctx) bag[k] = body.ctx[k];
      else lacking.push(`Ctx.${k}`);
    }
    ctx.next = raw;
    lacking.push(...this.importAdded(ctx.state, raw.state));
    this.tallies = tallies;
    this.empty = structuredClone(tallies);
    this.clear = clear;
    muteScores(true);
    const warm = this.scoreFrom - this.turn - 1;
    say(`RESUMED from ${this.path} (seed ${this.head.seed}, turn ${this.turn} closed, saved by ${this.head.sha.slice(0, 8)}`
      + `${this.head.dirty ? ` with ${this.head.dirty} files changed under cpu/` : ''}); `
      + (warm > 0 ? `turns ${this.turn + 1}-${this.scoreFrom - 1} run unscored` : 'no turn runs unscored')
      + (lacking.length ? `; NOT IN THE SAVE, started as a window starts them: ${lacking.join(', ')}` : ''));
  }

  /** the fields this tree's lists carry and the save's did not, each set on
   *  the restored state from the import; their names */
  private importAdded(state: GameState, imported: GameState): string[] {
    const added = (k: keyof CarryLists) => this.lists[k].filter((f) => !this.head.lists[k]?.includes(f));
    const give = (from: object | undefined, to: object | undefined, fields: readonly string[]) => {
      if (!from || !to) return;
      for (const f of fields) {
        const v = (from as Record<string, unknown>)[f];
        if (v !== undefined) (to as Record<string, unknown>)[f] = v;
      }
    };
    const seatFields = added('seat');
    const research = added('research');
    const minor = [...seatFields, ...added('minor')];
    const city = added('city');
    const pair = (from: { research: object; cities?: { centerIndex: number }[] } | undefined, to: typeof from, fields: readonly string[]) => {
      give(from, to, fields);
      give(from?.research, to?.research, research);
      for (const c of to?.cities ?? []) give(from?.cities?.find((x) => x.centerIndex === c.centerIndex), c, city);
    };
    state.seats.forEach((s, i) => pair(imported.seats[i], s, seatFields));
    for (const cs of state.cityStates) pair(imported.cityStates.find((x) => x.id === cs.id), cs, minor);
    pair(imported.barbSeat, state.barbSeat, minor);
    pair(imported.freeSeat, state.freeSeat, minor);
    give(imported, state, added('game'));
    return (Object.keys(this.lists) as (keyof CarryLists)[]).flatMap((k) => added(k).map((f) => `${k}.${f}`));
  }

  /** a pair opens on record `turn`: the first scored turn empties every
   *  tally and lets the scores through */
  pairOpens(turn: number): void {
    if (!warming || turn < this.scoreFrom) return;
    this.tallies.forEach((t, k) => {
      const o = t as Record<string, unknown>;
      for (const key of Object.keys(o)) delete o[key];
      Object.assign(o, this.empty[k]);
    });
    this.clear?.();
    warming = false;
    muteScores(false);
  }
}
