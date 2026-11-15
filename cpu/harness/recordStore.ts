/**
 * A DUMP'S RECORDS READ WHEN ASKED FOR: the file scanned once for each
 * record's place and the few fields every turn of a replay reads of every
 * record (`RecordLight`: its turn, start witnesses, random events and
 * volcanoes); a record itself parsed from its line when asked for. The last
 * `HELD` records asked for are held: one asked for again among them is the
 * same object, an older one is parsed anew. A reader walks the records in
 * turn order, a few at a time.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { TurnRecord } from './record';

/** what a replay reads of every record, apart from the record itself */
export interface RecordLight {
  turn: number;
  witness?: TurnRecord['witness'];
  events?: TurnRecord['events'];
  volcanoes?: TurnRecord['volcanoes'];
}

/** the records asked for last that are held whatever their readers */
const HELD = 4;

export class RecordStore {
  /** the records' turns, ascending */
  readonly turns: number[];
  /** each turn's light fields, in `turns` order */
  readonly light: RecordLight[];
  /** whether a record of the turns from `from` on carries its action log */
  readonly logged: boolean;
  /** called on each record as it is parsed, set by the reader */
  decorate?: (rec: TurnRecord) => void;
  private readonly fd: number;
  private readonly at = new Map<number, [number, number]>();
  private readonly held = new Map<number, TurnRecord>();

  /** the records of turns to `to` whose counter did not move while dumped,
   *  the last line of a turn its record; `logged` over those from `from` */
  constructor(path: string, from: number, to: number) {
    this.fd = openSync(path, 'r');
    const light = new Map<number, RecordLight & { actions: boolean }>();
    forEachLine(this.fd, (at, len, buf, start) => {
      const line = buf.toString('utf8', start, start + len);
      if (!line.trim()) return;
      const rec = JSON.parse(line) as TurnRecord & { actions?: unknown };
      if (rec.moved || rec.turn > to) return;
      this.at.set(rec.turn, [at, len]);
      light.set(rec.turn, { turn: rec.turn, witness: rec.witness, events: rec.events, volcanoes: rec.volcanoes, actions: Array.isArray(rec.actions) });
    });
    this.turns = [...light.keys()].sort((a, b) => a - b);
    this.light = this.turns.map((t) => light.get(t)!).map(({ actions: _a, ...l }) => l);
    this.logged = this.turns.some((t) => t >= from && light.get(t)!.actions);
  }

  /** the record of `turn` */
  get(turn: number): TurnRecord | undefined {
    let rec = this.held.get(turn);
    if (!rec) {
      const e = this.at.get(turn);
      if (!e) return undefined;
      const buf = Buffer.allocUnsafe(e[1]);
      readSync(this.fd, buf, 0, e[1], e[0]);
      rec = JSON.parse(buf.toString('utf8')) as TurnRecord;
      this.decorate?.(rec);
    }
    this.held.delete(turn);
    this.held.set(turn, rec);
    for (const k of this.held.keys()) {
      if (this.held.size <= HELD) break;
      this.held.delete(k);
    }
    return rec;
  }

  /** the records held, for a reader that decorates them after they were
   *  first asked for */
  live(): TurnRecord[] {
    return [...this.held.values()];
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** each line of an open file as `split(/\r?\n/)` cuts it, as its offset and
 *  length and the chunk holding it (`buf` from `from`), read in 4 MB chunks:
 *  no line is held as a string beyond the caller's own use (a line longer
 *  than a chunk grows the chunk). Returns the line breaks read. */
export function forEachLine(fd: number, fn: (at: number, len: number, buf: Buffer, from: number) => void): number {
  const size = fstatSync(fd).size;
  let newlines = 0;
  let buf = Buffer.allocUnsafe(1 << 22);
  let base = 0;
  let have = 0;
  for (let pos = 0; ;) {
    if (have === buf.length) {
      const grown = Buffer.allocUnsafe(buf.length * 2);
      buf.copy(grown, 0, 0, have);
      buf = grown;
    }
    const n = pos < size ? readSync(fd, buf, have, buf.length - have, pos) : 0;
    pos += n;
    have += n;
    let from = 0;
    for (;;) {
      const nl = buf.indexOf(10, from);
      if (nl < 0 || nl >= have) break;
      fn(base + from, nl > from && buf[nl - 1] === 13 ? nl - from - 1 : nl - from, buf, from);
      newlines += 1;
      from = nl + 1;
    }
    if (n <= 0) {
      if (from < have) fn(base + from, have - from, buf, from);
      return newlines;
    }
    buf.copy(buf, 0, from, have);
    base += from;
    have -= from;
  }
}
